/* Fresh Dev launch setup. Existing fleets, markets and rescue owners do the work. */
(() => {
  'use strict';
  function start(state){
    if(!state?.devMode)return {ok:false,error:'A repair demonstration requires Dev mode.'};
    if(state.devRepairDemo)return {ok:true,...state.devRepairDemo};
    const lives=window.nativeNpcLives,repairs=window.nativeShipRepairs,definitions=window.nativeShipDefinitions;
    repairs.initialize(state);lives.initialize(state);
    const ships=state.civilianTraffic.ships;
    const target=ships.find(ship=>ship.shipType===52&&ship.system===state.system&&!ship.journey&&!ship.cargo&&ship.phase!=='destroyed');
    const medic=ships.find(ship=>ship.shipType===58&&ship.system===state.system&&!ship.journey&&ship.phase!=='destroyed');
    if(!target||!medic)return {ok:false,error:'No local rescue pair is available.'};

    // Equip the existing Olympic at a real berth, with its own credits and
    // finite port stock. The launch scene then places both existing ships nearby.
    lives.interrupt(state,medic,'Dev rescue demonstration setup');
    const maximum=definitions.forEntity(state,target,{category:'civilian'}).hull;
    const initialHull=Math.max(1,Math.floor(maximum*.2));
    const needed=(maximum-initialHull)/repairs.rules.hullPerTon;
    // A prepared world may already have sold this port's supplies. Select a
    // stocked local berth for the Dev setup, retaining every market reservation.
    const available=port=>{const market=lives.market(state,medic.system,port);return Math.max(0,market.stock[7]-market.reserved[7]);};
    if(medic.repairDeuranium+available(medic.port)<needed&&medic.system===1){
      const port=[...window.nativeSolEconomy.ports].sort((a,b)=>available(b)-available(a)).find(port=>medic.repairDeuranium+available(port)>=needed);
      if(port!==undefined)medic.port=port;
    }
    const berth=window.nativePortDocking.request(state,medic,medic.system,medic.port);
    if(berth?.kind!=='berth')return {ok:false,error:'The medical ship needs a supply berth.'};
    Object.assign(medic,{x:berth.x,y:berth.y});
    repairs.restock(state,medic);
    if(medic.repairDeuranium<needed)return {ok:false,error:'The medical ship needs more repair supplies.'};

    const origin=definitions.describe(state),motion=window.nativeShipMotion;
    const targetDescriptor=definitions.describe(state,target,{category:'civilian'}),medicalDescriptor=definitions.describe(state,medic,{category:'civilian'});
    const separation=Math.max(targetDescriptor.dimensions.width,targetDescriptor.dimensions.height)/2+Math.max(medicalDescriptor.dimensions.width,medicalDescriptor.dimensions.height)/2+100;
    let targetPoint={x:origin.x-80,y:origin.y-90};
    for(const [x,y] of [[-80,-90],[-80,90],[-250,-130],[-330,-130],[-160,-180],[-160,180],[-250,-240],[-250,240]]){
      const candidate={x:origin.x+x,y:origin.y+y},medicalPoint={x:candidate.x+separation,y:candidate.y};
      const obstacles=motion.navigationObstacles(state,state.system,candidate,medicalPoint,100);
      if(motion.clearSegment(candidate,candidate,obstacles,motion.shipRadius(targetDescriptor)+35)&&motion.clearSegment(medicalPoint,medicalPoint,obstacles,motion.shipRadius(medicalDescriptor)+35)){
        targetPoint=candidate;break;
      }
    }
    for(const [index,ship] of [target,medic].entries()){
      lives.interrupt(state,ship,index===0?'disabled':'Dev medical response setup');
      delete ship.journey;
      const point=index===0?targetPoint:repairs.rendezvous(state,{target:repairs.ref('civilian',target)},medic);
      Object.assign(ship,{...point,heading:-Math.PI/2});
      window.nativeShipMotion.stop(ship);
      ship.previousX=ship.x;ship.previousY=ship.y;
      lives.refreshLocation(state,ship);
    }
    target.hull=initialHull;target.shields=0;
    state.devRepairDemo={version:1,targetId:target.id,medicalId:medic.id,initialHull,startedAt:window.nativeSimulation.seconds(state)};
    window.nativeShipSystems.invalidate(state);
    state.shipRepairs.nextPollAt=window.nativeSimulation.seconds(state);
    repairs.advance(state,1/60);
    return {ok:true,...state.devRepairDemo};
  }
  window.nativeDevRepairDemo=Object.freeze({start});
})();
