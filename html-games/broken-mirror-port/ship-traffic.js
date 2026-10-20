/* Shared traffic intent and physical contact dispatch for the existing fleet.
   Geometry/integration live in ship-motion; job owners retain their deadlines. */
(() => {
  'use strict';
  const runtimes=new WeakMap(),key=s=>s.category+':'+s.id;
  const motion=()=>window.nativeShipMotion,time=s=>window.nativeSimulation.seconds(s);
  const eligible=e=>e&&e.hull>0&&!e.journey&&!['destroyed','warp','arriving'].includes(e.phase);
  function runtime(state){let rt=runtimes.get(state);if(!rt){rt={plannedAt:-Infinity,offscreenAt:time(state),lastPoses:new Map(),contacts:new Map(),history:[],plans:0,checks:0,describedAt:-1,descriptions:new Map()};runtimes.set(state,rt);}return rt;}
  function descriptor(state,entity,category,at,base){
    const rt=runtime(state);if(rt.describedAt!==at){rt.describedAt=at;rt.descriptions.clear();}
    base||=rt.descriptions.get(entity);
    base||=window.nativeShipDefinitions.describe(state,entity,{category});rt.descriptions.set(entity,base);
    const pose={...entity},leg=entity.localLeg||entity.lifeLeg;
    if(leg)motion().sampleLeg(pose,leg,at);
    return {...base,entity,x:pose.x,y:pose.y,heading:pose.heading,speed:pose.speed,vx:pose.vx||0,vy:pose.vy||0,
      previousX:pose.previousX??pose.x,previousY:pose.previousY??pose.y,hull:entity.hull,shields:entity.shields,
      radii:window.nativeShipDefinitions.surfaceRadii(base.dimensions,entity.shields>0,base.definition),angularVelocity:motion().spinSample(pose.motionSpin,at).velocity,at};
  }
  function fleet(state,at){
    const result=[];
    if(eligible(state)&&!state.landed&&!window.vexedWarp?.active)result.push({...window.nativeShipDefinitions.describe(state,state,{category:'player'}),at});
    for(const ship of state.solEconomy?.freighters||[])if(eligible(ship))result.push(descriptor(state,ship,'tug',at));
    for(const ship of state.civilianTraffic?.ships||[])if(eligible(ship))result.push(descriptor(state,ship,'civilian',at));
    for(const ship of window.nativeShipRepairs?.drones(state)||[])if(eligible(ship.entity))result.push(descriptor(state,ship.entity,'repair-drone',at,ship));
    return result;
  }
  function grid(ships,cell=768){
    const buckets=new Map();let radius=0,speed=0,travel=0;
    const cellKey=(system,x,y)=>system+':'+x+':'+y;
    for(const s of ships){const k=cellKey(s.system,Math.floor(s.x/cell),Math.floor(s.y/cell));if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(s);radius=Math.max(radius,motion().shipRadius(s));speed=Math.max(speed,Math.hypot(s.vx,s.vy));travel=Math.max(travel,Math.hypot(s.x-(s.previousX??s.x),s.y-(s.previousY??s.y)));}
    return {radius,speed,travel,near(s,reach){const result=[];for(let x=Math.floor((s.x-reach)/cell);x<=Math.floor((s.x+reach)/cell);x++)for(let y=Math.floor((s.y-reach)/cell);y<=Math.floor((s.y+reach)/cell);y++)for(const other of buckets.get(cellKey(s.system,x,y))||[])if(other!==s&&Math.hypot(s.x-other.x,s.y-other.y)<=reach)result.push(other);return result;}};
  }
  function replaceLeg(state,ship,leg){
    if(ship.category==='civilian')return window.nativeNpcLives?.reroute(state,ship.entity,leg);
    if(ship.category==='tug')return window.nativeSolEconomy?.reroute(state,ship.entity,leg);
    if(ship.category==='repair-drone')return window.nativeShipRepairs?.reroute(state,ship.entity,leg);
    return false;
  }
  function advance(state,dt){
    if(!state||!(dt>0)||window.nativeSimulation.blocked())return;
    const rt=runtime(state),at=time(state);if(at-rt.plannedAt<.2-1e-8)return;rt.plannedAt=at;
    const ships=fleet(state,at),space=grid(ships);
    // Read a single simultaneous snapshot: enumeration order cannot change who yields.
    for(const ship of ships){
      const e=ship.entity,leg=e.localLeg||e.lifeLeg;
      if(ship.category==='player'||!leg||leg.startedAt+leg.duration<=at||e.disputeId||e.retaliationId||e.scriptedDemo||e.phase==='disabled'||at<(e.trafficControl?.nextPlanAt||0))continue;
      const profile=ship.definition.movement,neighbors=space.near(ship,Math.max(200,(Math.hypot(ship.vx,ship.vy)+space.speed)*6+space.radius+motion().shipRadius(ship)+80));
      rt.checks+=neighbors.length;
      const advice=motion().trafficAdvice(ship,neighbors,profile);
      if(!advice){if(e.trafficControl&&at>=e.trafficControl.until)delete e.trafficControl;continue;}
      const goal=leg.goal,dx=goal.x-ship.x,dy=goal.y-ship.y,distance=Math.hypot(dx,dy);if(distance<.01)continue;
      const ux=dx/distance,uy=dy/distance,side={x:-uy,y:ux},other=advice.other,clearance=advice.clearance*1.45;
      const blockedGoal=Math.hypot(goal.x-other.x,goal.y-other.y)<advice.clearance&&advice.stationary;
      if(blockedGoal&&advice.distance>advice.clearance+ship.speed**2/(2*Math.max(1,profile.braking||225))+(profile.maxSpeed||100)*.5)continue;
      // A service craft whose clear docking point is behind its assigned hull
      // needs a physical bypass. Repeatedly yielding can never expose that goal.
      const service=profile.serviceApproach&&e.approachTarget?.category===other.category&&String(e.approachTarget.id)===String(other.id);
      const serviceGoalClear=service&&!motion().shipPairContact({...ship,x:goal.x,y:goal.y,previousX:goal.x,previousY:goal.y},{...other,previousX:other.x,previousY:other.y},1);
      const waiting=!serviceGoalClear&&(advice.yield||blockedGoal),wait=waiting?.8:0,points=[];
      if(!waiting){
        const projection=(other.x-ship.x)*ux+(other.y-ship.y)*uy;
        const entry={x:other.x-ux*clearance+side.x*clearance,y:other.y-uy*clearance+side.y*clearance};
        if(projection>clearance+20)points.push(entry);
        else points.push({x:ship.x+side.x*clearance,y:ship.y+side.y*clearance});
        points.push({x:other.x+ux*clearance+side.x*clearance,y:other.y+uy*clearance+side.y*clearance});
      }
      const pose={...e,x:ship.x,y:ship.y,heading:ship.heading,speed:ship.speed,vx:ship.vx,vy:ship.vy};
      const route=motion().routeLeg(pose,goal,points,profile,at,wait);
      if(route.valid===false)continue;
      // Rebase a previous environmental kick at the new start; never replay its displacement.
      const kick=motion().kickSample(e.motionKick,at);
      const spin=motion().spinSample(e.motionSpin,at);
      if(!replaceLeg(state,ship,route))continue;
      Object.assign(e,{x:ship.x,y:ship.y,heading:ship.heading,previousX:ship.previousX,previousY:ship.previousY});
      if(e.motionKick)e.motionKick={version:1,mode:'scheduled',at,duration:Math.max(.05,Math.min(3,route.duration)),x:0,y:0,vx:kick.vx,vy:kick.vy};
      if(e.motionSpin)e.motionSpin={version:1,mode:'scheduled',at,angle:0,velocity:spin.velocity};
      const maneuver=route.segments.at(-2)||route.segments[0];
      e.trafficControl={version:1,mode:waiting?'yielding':'passing',obstacle:key(other),nextPlanAt:at+(waiting?.6:1),until:maneuver.startedAt+maneuver.duration};rt.plans++;
      window.nativeShipSystems.refreshShip(state,e,ship.category,ship.system);
    }
  }
  function steer(state,ship,command,profile){
    if(ship.category==='player')return command;
    const ships=window.nativeShipSystems.collectShips(state,ship.system).filter(s=>eligible(s.entity));
    return motion().avoidShips(ship,ships,command,profile);
  }
  function push(state,ship,pose){return window.nativeShipSystems.applyContact(state,ship,pose);}
  function collide(state,dt){
    if(!state||!(dt>0)||window.nativeSimulation.blocked())return;
    const rt=runtime(state),at=time(state),offscreen=at-rt.offscreenAt>=.2-1e-8;
    const active=window.nativeShipSystems.collectShips(state,state.system).filter(s=>eligible(s.entity)).map(s=>s.entity.localLeg||s.entity.lifeLeg?descriptor(state,s.entity,s.category,at,s):{...s});
    let ships=active;
    if(offscreen){
      const distant=fleet(state,at).filter(s=>s.system!==state.system);
      for(const s of distant){const prev=rt.lastPoses.get(key(s));s.previousX=prev?.system===s.system?prev.x:s.x;s.previousY=prev?.system===s.system?prev.y:s.y;s.contactDt=at-rt.offscreenAt;}
      rt.offscreenAt=at;ships=[...active,...distant];
    }
    for(const s of ships){
      const previous=rt.lastPoses.get(key(s));
      if(s.system===state.system&&previous?.system===s.system){s.previousX=previous.x;s.previousY=previous.y;}
      const elapsed=s.contactDt||dt,travel=Math.hypot(s.x-s.previousX,s.y-s.previousY);
      if(travel>Math.max(500,Math.hypot(s.vx,s.vy)*elapsed*3+50)){s.previousX=s.x;s.previousY=s.y;}
      if(s.category!=='player'&&!s.entity.localLeg&&!s.entity.lifeLeg&&(s.entity.motionKick||s.entity.motionSpin)&&!['fighting','ore-theft'].includes(s.entity.phase)){
        const oldHeading=s.heading,pose={...s,heading:s.heading,motionKick:s.entity.motionKick,motionSpin:s.entity.motionSpin,motionTime:at};motion().step(pose,s.entity.phase==='disabled'?{}:{hold:true},s.definition.movement,elapsed);
        Object.assign(s.entity,{x:pose.x,y:pose.y,heading:pose.heading,vx:pose.vx,vy:pose.vy,speed:pose.speed,motionKick:pose.motionKick,motionSpin:pose.motionSpin,previousX:pose.previousX,previousY:pose.previousY});Object.assign(s,{x:pose.x,y:pose.y,heading:pose.heading,vx:pose.vx,vy:pose.vy,previousX:pose.previousX,previousY:pose.previousY,angularVelocity:motion().spinSample(pose.motionSpin,at).velocity});
        if(pose.x!==pose.previousX||pose.y!==pose.previousY||pose.heading!==oldHeading)window.nativeShipSystems.refreshShip(state,s.entity,s.category,s.system);
      }
    }
    const space=grid(ships),seen=new Set();
    for(const a of ships){
      const elapsed=a.contactDt||dt,reach=motion().shipRadius(a)+space.radius+Math.hypot(a.x-a.previousX,a.y-a.previousY)+space.travel+2;
      for(const b of space.near(a,reach)){
        const pair=[key(a),key(b)].sort().join('|');if(seen.has(pair))continue;seen.add(pair);
        const result=motion().shipPairContact(a,b,elapsed);if(!result)continue;
        push(state,a,result.a);push(state,b,result.b);
        Object.assign(a,result.a);Object.assign(b,result.b);
        const last=rt.contacts.get(pair)??-Infinity;
        if(at-last>.25&&result.closing>.5){
          const energy=Math.min(1,result.closing/150);
          window.nativeShipSystems.visualImpact(state,a,{kind:'ship',visualOnly:true,physicalContact:true,from:result.pointA,point:result.pointA,energy});
          window.nativeShipSystems.visualImpact(state,b,{kind:'ship',visualOnly:true,physicalContact:true,from:result.pointB,point:result.pointB,energy});
          rt.history.push({a:key(a),b:key(b),at,system:a.system,closing:result.closing,shieldA:a.shields>0,shieldB:b.shields>0});if(rt.history.length>80)rt.history.shift();
        }
        rt.contacts.set(pair,at);
      }
    }
    for(const s of ships)rt.lastPoses.set(key(s),{x:s.x,y:s.y,system:s.system});
    for(const [k,t] of rt.contacts)if(at-t>1)rt.contacts.delete(k);
  }
  window.nativeShipTraffic=Object.freeze({advance,collide,steer,snapshot(state){const rt=runtime(state);return {plans:rt.plans,neighborChecks:rt.checks,contacts:rt.history.map(e=>({...e}))};}});
})();
