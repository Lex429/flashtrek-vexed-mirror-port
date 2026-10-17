/* Saved asteroid poses and ship contacts. Geometry/indexes are shared by all
   targeting, mining, radar and painting; simulation alone changes the poses. */
(() => {
  'use strict';
  let activeState=null,active=new Map(),contacts=new Map(),history=[],waitingForGeometry=false,stepStarts=new Map(),pairHistory=[];
  const anchors=new WeakMap();
  const time=state=>window.nativeSimulation.seconds(state);
  const gone=(state,id)=>state.minedAsteroids?.includes(id)||state.destroyedAsteroids?.includes(id);
  const valid=pose=>pose&&['x','y','angle','vx','vy','spin','at'].every(k=>Number.isFinite(pose[k]));
  function remember(rock){if(!anchors.has(rock))anchors.set(rock,{x:rock.x,y:rock.y,angle:rock.angle||0});}
  function ensure(state){
    if(activeState===state&&(!waitingForGeometry||!window.nativeSolAsteroids.placements.length))return;
    for(const {rock} of active.values()){const anchor=anchors.get(rock);window.nativeSolAsteroids.relocate(rock,{...anchor,previousX:anchor.x,previousY:anchor.y});}
    activeState=state;active=new Map();contacts=new Map();history=[];stepStarts=new Map();pairHistory=[];
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
    ensure(state);const at=time(state);stepStarts=new Map();
    for(const {rock,pose} of active.values()){
      stepStarts.set(rock.slotId,{x:rock.x,y:rock.y});
      const elapsed=Math.max(0,at-pose.at);
      if(!elapsed)continue;
      if(!gone(state,rock.slotId)){pose.x+=pose.vx*elapsed;pose.y+=pose.vy*elapsed;pose.angle=window.nativeShipMotion.wrap(pose.angle+pose.spin*elapsed);}
      pose.at=at;window.nativeSolAsteroids.relocate(rock,pose);
    }
    collideRocks(state,dt);
    if(active.size)window.nativeShipSystems?.invalidate(state);
  }
  function physical(rock,dt){
    const pose=active.get(rock.slotId)?.pose,start=stepStarts.get(rock.slotId),vx=pose?.vx||0,vy=pose?.vy||0;
    return {...rock,vx,vy,spin:pose?.spin||0,previousX:start?.x??rock.x-vx*dt,previousY:start?.y??rock.y-vy*dt};
  }
  function collideRocks(state,dt){
    const queue=[...active.values()].filter(({rock,pose})=>!gone(state,rock.slotId)&&Math.hypot(pose.vx,pose.vy)>.001).map(({rock})=>rock),seen=new Set();
    const drifts=new Map();for(const rock of queue){const start=stepStarts.get(rock.slotId)||rock;drifts.set(rock.system,Math.max(drifts.get(rock.system)||0,Math.hypot(rock.x-start.x,rock.y-start.y)));}
    const budget=Math.min(2048,Math.max(64,queue.length*12));let solved=0;
    for(let index=0;index<queue.length&&solved<budget;index++){
      const a=queue[index];if(gone(state,a.slotId))continue;
      let body=physical(a,dt);
      const candidates=window.nativeSolAsteroids.sweptNearby(a.system,{x:body.previousX,y:body.previousY},a,a.size*.43+55+(drifts.get(a.system)||0))
        .filter(b=>a!==b&&!gone(state,b.slotId)&&!seen.has([a.slotId,b.slotId].sort((x,y)=>x-y).join(':')))
        .map(b=>({b,result:window.nativeShipMotion.asteroidPairContact(body,physical(b,dt),dt)})).filter(e=>e.result).sort((x,y)=>x.result.t-y.result.t);
      for(const {b} of candidates){
        const key=[a.slotId,b.slotId].sort((x,y)=>x-y).join(':');if(seen.has(key))continue;
        const result=window.nativeShipMotion.asteroidPairContact(physical(a,dt),physical(b,dt),dt);if(!result)continue;
        seen.add(key);solved++;if(!stepStarts.has(b.slotId))stepStarts.set(b.slotId,{x:b.x,y:b.y});
        store(state,a,result.a);store(state,b,result.b);
        if(result.damageA>0)window.nativeAsteroidCombat.hit(state,a.slotId,a.maxHull*result.damageA,{kind:'asteroid',from:b});
        if(result.damageB>0)window.nativeAsteroidCombat.hit(state,b.slotId,b.maxHull*result.damageB,{kind:'asteroid',from:a});
        pairHistory.push({a:a.slotId,b:b.slotId,system:a.system,at:time(state),closing:result.closing});if(pairHistory.length>80)pairHistory.shift();
        if(result.closing>.001){queue.push(b);queue.push(a);}
        if(solved>=budget)break;
      }
    }
  }
  function freeze(state,rock){ensure(state);if(active.has(rock.slotId))store(state,rock,{vx:0,vy:0,spin:0});}
  function pushShip(state,ship,pose){
    window.nativeShipSystems.applyContact(state,ship,pose);
  }
  function debrisContact(state,piece,from,target,type){
    ensure(state);
    if(type!=='ship'&&gone(state,target.slotId))return null;
    if(type==='ship'&&(target.descriptor.entity.hull<=0||target.descriptor.entity.journey||['destroyed','disabled','warp','arriving'].includes(target.descriptor.entity.phase)))return null;
    let body=type==='ship'?target.descriptor:physical(target.entity,piece.dt);
    if(type==='ship'&&Math.hypot(body.x-body.previousX,body.y-body.previousY)>Math.max(500,Math.hypot(body.vx,body.vy)*piece.dt*3+50))body={...body,previousX:body.x,previousY:body.y};
    return window.nativeShipMotion.debrisContact(piece,from,body,type);
  }
  function resolveDebris(state,piece,target,type,result){
    ensure(state);
    if(type==='ship'){
      const before=target.descriptor;pushShip(state,before,result.targetPose);
      const next=window.nativeShipDefinitions.describe(state,before.entity,{category:before.category}),id=target.id;
      Object.assign(target,next,{id,descriptor:next});
    }
    else store(state,target.entity,result.targetPose);
    Object.assign(piece,result.debrisPose);
    window.nativeShipSystems.invalidate(state,target.system);
  }
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
      const candidates=nearby.filter(rock=>!gone(state,rock.slotId)).map(rock=>({rock,contact:window.nativeShipMotion.asteroidContact(ship,physical(rock,dt),dt)})).filter(e=>e.contact).sort((a,b)=>a.contact.t-b.contact.t);
      for(const {rock} of candidates){
        if(gone(state,rock.slotId))continue;
        const result=window.nativeShipMotion.asteroidContact(ship,physical(rock,dt),dt);if(!result)continue;
        store(state,rock,result.rock);
        pushShip(state,ship,result.ship);
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
  window.nativeAsteroidMotion=Object.freeze({ensure,advance,collide,freeze,debrisContact,resolveDebris,snapshot:()=>({moving:active.size,contacts:history.map(e=>({...e})),rockContacts:pairHistory.map(e=>({...e}))})});
})();
