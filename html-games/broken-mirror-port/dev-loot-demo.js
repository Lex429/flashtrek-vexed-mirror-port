/* Once-only Dev practice casualties. Reuse saved crews, fittings and paid stock. */
(() => {
  'use strict';
  function isPractice(state,value){
    if(!state?.devMode||!value)return false;
    let ship=value.entity||value;
    if(ship.carrier)ship=window.nativeShipRepairs.resolve(state,ship.carrier);
    return !!ship&&!!state.devLootDemo?.ships.some(row=>String(row.id)===String(ship.id)&&(row.generation||0)===(ship.lifeGeneration||0));
  }
  function neutralize(state){
    const demo=state.devLootDemo;if(!demo)return;
    for(const row of demo.ships){
      const ship=window.nativeNpcLives.find(state,row.id);if(!ship||(ship.lifeGeneration||0)!==(row.generation||0))continue;
      Object.assign(ship,{ownerGovernmentId:0,faction:0,government:0,npcRole:'civilian',role:'freighter',scriptedDemo:true,devLootPractice:true});
      for(const key of ['factionAssignment','federationAssignment','factionResponse','retaliationId','retaliationTargetId','retaliationUntil'])delete ship[key];
      window.nativeShipSystems.refreshShip(state,ship,'civilian');
    }
    if(demo.neutralVersion!==1){
      // Older practice ships could raise a real Sol alert. End that Dev test
      // incident once, retaining other systems and every remaining belonging.
      window.nativeFactionDefence.clearPlayerAlert(state,1);
      state.localPrestige||={};state.localPrestige[1]=Math.max(100,Number(state.localPrestige[1])||0);
      demo.neutralVersion=1;
    }
  }
  function start(state){
    if(!state?.devMode||window.nativeDevTraffic?.active(state))return {ok:false};
    if(state.devLootDemo){neutralize(state);return {ok:true,created:false,...state.devLootDemo};}
    if(state.system!==1||state.journey||state.localCruise||state.arrivalApproach)return {ok:false};
    const lives=window.nativeNpcLives,repairs=window.nativeShipRepairs,definitions=window.nativeShipDefinitions,motion=window.nativeShipMotion;
    lives.initialize(state);repairs.initialize(state);
    const excluded=new Set([state.devRepairDemo?.targetId,state.devRepairDemo?.medicalId]);
    const candidates=state.civilianTraffic.ships.filter(e=>{
      if(e.system!==1||e.journey||e.hull<=0||['disabled','destroyed','warp','arriving'].includes(e.phase)||excluded.has(e.id))return false;
      const d=definitions.forEntity(state,e,{category:'civilian'}),pose=definitions.describe(state,e,{category:'civilian'});
      return !d.capabilities.medical&&d.hull>=200&&d.cargo>=40&&Math.max(pose.dimensions.width,pose.dimensions.height)<=240&&
        !repairs.missionFor(state,repairs.ref('civilian',e))&&e.repairBay?.slots.length>0&&e.repairBay.slots.every(dot=>dot.phase==='stowed'&&dot.hull>0);
    }).sort((a,b)=>definitions.forEntity(state,b).hull-definitions.forEntity(state,a).hull||a.id-b.id);
    const ships=[],types=new Set();
    for(const e of candidates){
      if(types.has(e.shipType))continue;
      const index=ships.length,d=definitions.forEntity(state,e),pose=definitions.describe(state,e,{category:'civilian'});
      let point=null;
      for(let attempt=0;attempt<32;attempt++){
        const angle=[-.35,2.7,-1.4][index]+(attempt%8)*Math.PI/4,distance=[280,560,820][index]+Math.floor(attempt/8)*140;
        const p={x:state.x+Math.cos(angle)*distance,y:state.y+Math.sin(angle)*distance};
        const obstacles=motion.navigationObstacles(state,1,p,p,100);
        if(motion.clearSegment(p,p,obstacles,motion.shipRadius(pose)+25)&&Math.hypot(p.x-state.x,p.y-state.y)>motion.shipRadius(pose)+motion.shipRadius(definitions.describe(state))+40){point=p;break;}
      }
      if(!point)continue;
      // Cancel this Dev casualty's job through its owner; retain onboard freight
      // and release its old agreement before buying any practice supplies.
      lives.interrupt(state,e,'disabled');
      delete e.travelResume;delete e.interstellarContact;delete e.warpVisual;
      const market=lives.market(state,1,e.port),room=()=>Math.max(0,d.cargo-window.nativeShipEquipment.cargoUsed(state,e));
      if(!(e.cargo?.tons>0)){
        const tons=Math.floor(Math.min(6,room(),Math.max(0,market.stock[5]-market.reserved[5]),e.credits/16));
        if(tons>0)lives.exchange(state,market,e,{good:5,tons,payment:tons*16,buy:true,capacity:room()});
      }
      {
        // Move supplies from the existing Dev captain's reserve, leaving this
        // casualty damaged when its own finite repair supply is exhausted.
        const goal=Math.min(60,Math.floor((d.hull*.8-1)/5)),tons=Math.max(0,Math.min(goal-(e.repairDeuranium||0),room(),Number(state.deuranium)||0));
        if(tons>0){state.deuranium-=tons;e.repairDeuranium=(e.repairDeuranium||0)+tons;state.shipRepairs.ledger.devPracticeTransfer=(state.shipRepairs.ledger.devPracticeTransfer||0)+tons;}
      }
      Object.assign(e,{...point,previousX:point.x,previousY:point.y,heading:-Math.PI/2,hull:Math.max(1,Math.floor(d.hull*.1)),shields:0,name:`${e.name} [Loot test ${index+1}]`});
      motion.stop(e);lives.refreshLocation(state,e);repairs.observe(state,e,'civilian');window.nativeShipSystems.refreshShip(state,e,'civilian');
      types.add(e.shipType);ships.push({id:e.id,generation:e.lifeGeneration||0,name:e.name,x:e.x,y:e.y,initialHull:e.hull});
      if(e.repairDeuranium>0){const ref=repairs.ref('civilian',e);repairs.launch(state,ref,ref);}
      if(ships.length===3)break;
    }
    if(!ships.length)return {ok:false};
    state.devLootDemo={version:1,neutralVersion:1,system:1,startedAt:window.nativeSimulation.seconds(state),origin:{x:state.x,y:state.y},ships};
    neutralize(state);
    return {ok:true,created:true,...state.devLootDemo};
  }
  window.nativeDevLootDemo=Object.freeze({start,isPractice});
})();
