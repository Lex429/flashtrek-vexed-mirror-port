/* Saved asteroid poses and ship contacts. Geometry/indexes are shared by all
   targeting, mining, radar and painting; simulation alone changes the poses. */
(() => {
  'use strict';
  let activeState=null,active=new Map(),contacts=new Map(),history=[],waitingForGeometry=false;
  const anchors=new WeakMap();
  const time=state=>window.nativeSimulation.seconds(state);
  const gone=(state,id)=>state.minedAsteroids?.includes(id)||state.destroyedAsteroids?.includes(id);
  const valid=pose=>pose&&['x','y','angle','vx','vy','spin','at'].every(k=>Number.isFinite(pose[k]));
  function remember(rock){if(!anchors.has(rock))anchors.set(rock,{x:rock.x,y:rock.y,angle:rock.angle||0});}
  function ensure(state){
    if(activeState===state&&(!waitingForGeometry||!window.nativeSolAsteroids.placements.length))return;
    for(const {rock} of active.values()){const anchor=anchors.get(rock);window.nativeSolAsteroids.relocate(rock,{...anchor,previousX:anchor.x,previousY:anchor.y});}
    activeState=state;active=new Map();contacts=new Map();history=[];
    if(state.asteroidMotion?.version!==1)state.asteroidMotion={version:1,rocks:{}};
    state.asteroidMotion.rocks||={};
    waitingForGeometry=!window.nativeSolAsteroids.placements.length;
    for(const [id,pose] of Object.entries(state.asteroidMotion.rocks)){
      if(!valid(pose)){delete state.asteroidMotion.rocks[id];continue;}
      const rock=window.nativeSolAsteroids.find(Number(id),pose.system);if(!rock)continue;
      remember(rock);active.set(rock.slotId,{rock,pose});
      window.nativeSolAsteroids.relocate(rock,{...pose,previousX:pose.x,previousY:pose.y});
    }
    window.nativeShipSystems?.invalidate(state);
  }
  function store(state,rock,values){
    remember(rock);
    let record=active.get(rock.slotId);
    if(!record){const pose={x:rock.x,y:rock.y,angle:rock.angle||0,vx:0,vy:0,spin:0,at:time(state),system:rock.system??state.system};record={rock,pose};active.set(rock.slotId,record);state.asteroidMotion.rocks[rock.slotId]=pose;}
    Object.assign(record.pose,values,{at:time(state)});window.nativeSolAsteroids.relocate(rock,record.pose);
    return record;
  }
  function advance(state,dt){
    if(!state||!(dt>0)||window.nativeSimulation.blocked())return;
    ensure(state);const at=time(state);
    for(const {rock,pose} of active.values()){
      const elapsed=Math.max(0,at-pose.at);
      if(!elapsed)continue;
      if(!gone(state,rock.slotId)){pose.x+=pose.vx*elapsed;pose.y+=pose.vy*elapsed;pose.angle=window.nativeShipMotion.wrap(pose.angle+pose.spin*elapsed);}
      pose.at=at;window.nativeSolAsteroids.relocate(rock,pose);
    }
    if(active.size)window.nativeShipSystems?.invalidate(state);
  }
  function freeze(state,rock){ensure(state);if(active.has(rock.slotId))store(state,rock,{vx:0,vy:0,spin:0});}
  function collide(state,dt){
    if(!state||!(dt>0)||window.nativeSimulation.blocked())return;
    ensure(state);const at=time(state),system=state.system;
    // Use the existing registered fleet; never construct a parallel population.
    const ships=window.nativeShipSystems.collectShips(state,system);
    let drift=0;for(const {rock,pose} of active.values())if(rock.system===system)drift=Math.max(drift,Math.hypot(pose.vx,pose.vy)*dt);
    for(const original of ships){
      if(!original.entity||original.hull<=0||original.entity.journey||['destroyed','disabled','warp','arriving'].includes(original.entity.phase))continue;
      let ship=original;
      const travel=Math.hypot(ship.x-ship.previousX,ship.y-ship.previousY),reach=Math.max(ship.radii.rx,ship.radii.ry)+travel+drift+55;
      // Teleports/system arrivals do not become a sweep through an entire belt.
      if(travel>Math.max(500,Math.hypot(ship.vx,ship.vy)*dt*3+50))ship={...ship,previousX:ship.x,previousY:ship.y};
      const nearby=window.nativeSolAsteroids.nearby(system,ship,Math.min(reach,1000));
      const physical=rock=>{const pose=active.get(rock.slotId)?.pose;return {...rock,vx:pose?.vx||0,vy:pose?.vy||0,spin:pose?.spin||0};};
      const candidates=nearby.filter(rock=>!gone(state,rock.slotId)).map(rock=>({rock,contact:window.nativeShipMotion.asteroidContact(ship,physical(rock),dt)})).filter(e=>e.contact).sort((a,b)=>a.contact.t-b.contact.t);
      for(const {rock} of candidates){
        if(gone(state,rock.slotId))continue;
        const result=window.nativeShipMotion.asteroidContact(ship,physical(rock),dt);if(!result)continue;
        store(state,rock,result.rock);
        const entity=ship.entity,offsetX=ship.x-entity.x,offsetY=ship.y-entity.y;
        Object.assign(entity,{x:result.ship.x-offsetX,y:result.ship.y-offsetY,vx:result.ship.vx,vy:result.ship.vy,speed:Math.hypot(result.ship.vx,result.ship.vy)});
        const key=ship.category+':'+ship.id+':'+rock.slotId,last=contacts.get(key)??-Infinity;
        contacts.set(key,at);
        if(at-last>.25){
          const event={kind:'asteroid',from:{x:rock.x,y:rock.y},point:result.point,visualOnly:true,energy:Math.min(1,result.closing/150)};
          window.nativeShipSystems.visualImpact(state,ship,event);
          if(result.damageFraction>0)window.nativeAsteroidCombat.hit(state,rock.slotId,rock.maxHull*result.damageFraction,event);
          history.push({ship:ship.id,category:ship.category,rockId:rock.slotId,system,at,shielded:ship.shields>0,closing:result.closing,damageFraction:result.damageFraction});if(history.length>80)history.shift();
        }
        ship={...ship,x:result.ship.x,y:result.ship.y,vx:result.ship.vx,vy:result.ship.vy};
        window.nativeShipSystems.invalidate(state,system);
      }
    }
    for(const [key,atContact] of contacts)if(at-atContact>1)contacts.delete(key);
  }
  window.nativeAsteroidMotion=Object.freeze({ensure,advance,collide,freeze,snapshot:()=>({moving:active.size,contacts:history.map(e=>({...e}))})});
})();
