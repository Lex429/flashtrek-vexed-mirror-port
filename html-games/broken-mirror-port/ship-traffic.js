/* Shared traffic intent and physical contact dispatch for the existing fleet.
   Geometry/integration live in ship-motion; job owners retain their deadlines. */
(() => {
  'use strict';
  const runtimes=new WeakMap(),key=s=>s.category+':'+s.id;
  const motion=()=>window.nativeShipMotion,time=s=>window.nativeSimulation.seconds(s);
  const eligible=e=>e&&e.hull>0&&!e.journey&&!['destroyed','warp','arriving'].includes(e.phase);
  function runtime(state){let rt=runtimes.get(state);if(!rt){rt={plannedAt:-Infinity,offscreenAt:time(state),lastPoses:new Map(),physicalActors:new Map(),contacts:new Map(),history:[],plans:0,checks:0,describedAt:-1,descriptions:new Map()};runtimes.set(state,rt);}return rt;}
  const sameBody=(previous,current)=>!!previous&&previous.entity===current.entity&&previous.category===current.category&&previous.system===current.system;
  function descriptor(state,entity,category,at,base){
    const rt=runtime(state);if(rt.describedAt!==at){rt.describedAt=at;rt.descriptions.clear();}
    base||=rt.descriptions.get(entity);
    base||=window.nativeShipDefinitions.describe(state,entity,{category});rt.descriptions.set(entity,base);
    const pose={x:entity.x,y:entity.y,heading:entity.heading,speed:entity.speed,vx:entity.vx,vy:entity.vy,motionKick:entity.motionKick,motionSpin:entity.motionSpin},leg=entity.localLeg||entity.lifeLeg;
    if(leg)motion().sampleLeg(pose,leg,at);
    return {...base,entity,x:pose.x,y:pose.y,heading:pose.heading,speed:pose.speed,vx:pose.vx||0,vy:pose.vy||0,
      previousX:pose.previousX??pose.x,previousY:pose.previousY??pose.y,hull:entity.hull,shields:entity.shields,
      radii:window.nativeShipDefinitions.surfaceRadii(base.dimensions,entity.shields>0,base.definition),angularVelocity:motion().spinSample(pose.motionSpin,at).velocity,at};
  }
  function fleet(state,at,{perception=true}={}){
    const actors=[],found=new Map();
    if(eligible(state)&&!state.landed&&!window.vexedWarp?.active)actors.push({...window.nativeShipDefinitions.describe(state,state,{category:'player'}),at});
    for(const ship of window.nativeSolEconomy?.mobile?.(state)||state.solEconomy?.freighters||[])if(eligible(ship)&&(ship.lifeLeg||ship.motionKick||ship.motionSpin||ship.speed>0)){const current=window.nativeShipSystems.resolve(state,'tug:'+ship.id,1);if(current)actors.push({...current,at});}
    for(const ship of window.nativeNpcLives?.mobile?.(state)||state.civilianTraffic?.ships||[])if(eligible(ship)&&(ship.localLeg||ship.motionKick||ship.motionSpin||ship.speed>0)){const current=window.nativeShipSystems.resolve(state,ship.id,ship.system);if(current)actors.push({...current,at});}
    for(const ship of window.nativeShipRepairs?.drones(state)||[])if(eligible(ship.entity))actors.push(descriptor(state,ship.entity,'repair-drone',at,ship));
    for(const ship of actors)found.set(key(ship),ship);
    // Avoidance needs future neighbors; physical contacts start with actual
    // movers and discover blockers only along their authoritative swept hulls.
    if(!perception)return Array.from(found.values());
    const regions=new Map();
    for(const ship of actors){const reach=Math.max(200,Math.hypot(ship.vx,ship.vy)*6+motion().shipRadius(ship)+80),region=ship.system+':'+Math.floor(ship.x/4096)+':'+Math.floor(ship.y/4096);
      const box={system:ship.system,minX:Math.min(ship.previousX,ship.x)-reach,minY:Math.min(ship.previousY,ship.y)-reach,maxX:Math.max(ship.previousX,ship.x)+reach,maxY:Math.max(ship.previousY,ship.y)+reach};
      const existing=regions.get(region);if(existing){existing.minX=Math.min(existing.minX,box.minX);existing.minY=Math.min(existing.minY,box.minY);existing.maxX=Math.max(existing.maxX,box.maxX);existing.maxY=Math.max(existing.maxY,box.maxY);}else regions.set(region,box);
    }
    for(const box of regions.values())for(const near of window.nativeShipSystems.query(state,{...box,predictSeconds:6,categories:['player','tug','civilian','repair-drone']}).bystanders)if(eligible(near.entity)&&!found.has(key(near)))found.set(key(near),{...near,at});
    return Array.from(found.values());
  }
  function grid(ships,state,prefix,cell=768){
    const systems=new Map(),cellKey=(x,y)=>x+':'+y;
    for(const ship of ships){
      let local=systems.get(ship.system);if(!local)systems.set(ship.system,local={radius:0,speed:0,travel:0,buckets:new Map(),actors:[],sorted:false});
      const x=Math.floor(ship.x/cell),y=Math.floor(ship.y/cell),entry={ship,x,y,order:local.actors.length},key=cellKey(x,y);
      local.actors.push(entry);let bucket=local.buckets.get(key);if(!bucket)local.buckets.set(key,bucket=[]);bucket.push(entry);
      local.radius=Math.max(local.radius,motion().shipRadius(ship));local.speed=Math.max(local.speed,Math.hypot(ship.vx,ship.vy));local.travel=Math.max(local.travel,Math.hypot(ship.x-(ship.previousX??ship.x),ship.y-(ship.previousY??ship.y)));
    }
    return {forSystem:system=>systems.get(system),near(ship,reach){
      const local=systems.get(ship.system),result=[];if(!local)return result;
      const minX=Math.floor((ship.x-reach)/cell),maxX=Math.floor((ship.x+reach)/cell),minY=Math.floor((ship.y-reach)/cell),maxY=Math.floor((ship.y+reach)/cell),cells=(maxX-minX+1)*(maxY-minY+1),direct=cells>local.actors.length*2;
      if(direct){
        // Match the existing cell traversal, including bucket insertion order.
        // Initial cell coordinates also preserve this snapshot after contacts.
        if(!local.sorted){local.actors.sort((a,b)=>a.x-b.x||a.y-b.y||a.order-b.order);local.sorted=true;}
        for(const entry of local.actors)if(entry.x>=minX&&entry.x<=maxX&&entry.y>=minY&&entry.y<=maxY){const other=entry.ship;if(other!==ship&&Math.hypot(ship.x-other.x,ship.y-other.y)<=reach)result.push(other);}
      }else for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
        const bucket=local.buckets.get(cellKey(x,y));if(bucket)for(const entry of bucket){const other=entry.ship;if(other!==ship&&Math.hypot(ship.x-other.x,ship.y-other.y)<=reach)result.push(other);}
      }
      window.nativeSimulationFrame?.count(state,prefix+'GridCellsVisited',direct?0:cells);window.nativeSimulationFrame?.count(state,prefix+'DirectActorVisits',direct?local.actors.length:0);window.nativeSimulationFrame?.count(state,prefix+'Returned',result.length);
      return result;
    }};
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
    const ships=fleet(state,at),space=grid(ships,state,'trafficAvoidance');
    // Read a single simultaneous snapshot: enumeration order cannot change who yields.
    for(const ship of ships){
      const e=ship.entity,leg=e.localLeg||e.lifeLeg;
      if(ship.category==='player'||!leg||leg.startedAt+leg.duration<=at||e.disputeId||e.retaliationId||e.scriptedDemo||e.phase==='disabled')continue;
      const profile=ship.definition.movement,local=space.forSystem(ship.system),neighbors=space.near(ship,Math.max(200,(Math.hypot(ship.vx,ship.vy)+local.speed)*6+local.radius+motion().shipRadius(ship)+80));
      rt.checks+=neighbors.length;
      const advice=motion().trafficAdvice(ship,neighbors,profile);
      if(!advice){if(e.trafficControl&&at>=e.trafficControl.until)delete e.trafficControl;continue;}
      const control=e.trafficControl;
      if(control){
        control.progressAt??=at;control.progressX??=ship.x;control.progressY??=ship.y;
        if(Math.hypot(ship.x-control.progressX,ship.y-control.progressY)>5){control.progressAt=at;control.progressX=ship.x;control.progressY=ship.y;}
        const horizon=Math.min(1.5,Math.max(.25,ship.speed/Math.max(1,profile.braking||225)+.25)),other=advice.other;
        const forecast=s=>({...s,previousX:s.x,previousY:s.y,x:s.x+s.vx*horizon,y:s.y+s.vy*horizon});
        const imminent=!!motion().shipPairContact(forecast(ship),forecast(other),horizon);
        const committed=control.mode==='passing'&&at<control.until&&at-control.progressAt<3;
        // Predicting the same passing neighbor again is not a reason to throw
        // away a useful maneuver. Actual new collision risk may interrupt it;
        // a stalled route gets a bounded recovery opportunity instead.
        if(!imminent&&(at<(control.nextPlanAt||0)||committed&&control.obstacle===key(other)))continue;
      }
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
      e.trafficControl={version:2,mode:waiting?'yielding':'passing',obstacle:key(other),nextPlanAt:at+(waiting?.6:1),until:maneuver.startedAt+maneuver.duration,
        progressAt:at,progressX:ship.x,progressY:ship.y};rt.plans++;
      window.nativeShipSystems.refreshShip(state,e,ship.category,ship.system);
    }
  }
  function steer(state,ship,command,profile){
    if(ship.category==='player')return command;
    const reach=Math.max(200,Math.hypot(ship.vx,ship.vy)*6+motion().shipRadius(ship)+80);
    const ships=window.nativeShipSystems.query(state,{system:ship.system,minX:ship.x-reach,minY:ship.y-reach,maxX:ship.x+reach,maxY:ship.y+reach,predictSeconds:6,categories:['player','tug','civilian','repair-drone']}).bystanders.filter(s=>eligible(s.entity));
    return motion().avoidShips(ship,ships,command,profile);
  }
  function push(state,ship,pose){return window.nativeShipSystems.applyContact(state,ship,pose);}
  function collide(state,dt){
    if(!state||!(dt>0)||window.nativeSimulation.blocked())return;
    const rt=runtime(state),at=time(state),offscreen=at-rt.offscreenAt>=.2-1e-8;
    const player=state.system===1?window.vexedSolFlight?.shipPosition(state)||state:state,radius=window.nativeShipDetail?.radius(state)||6500;
    const active=window.nativeShipSystems.query(state,{minX:player.x-radius,minY:player.y-radius,maxX:player.x+radius,maxY:player.y+radius,categories:['player','tug','civilian','repair-drone']}).bystanders.filter(s=>eligible(s.entity)).map(s=>s.entity.localLeg||s.entity.lifeLeg?descriptor(state,s.entity,s.category,at,s):{...s});
    const activeIds=new Set(active.map(key));
    for(const entity of window.nativeNpcLives?.mobile?.(state,state.system)||[])if(!entity.localLeg&&(entity.motionKick||entity.motionSpin||entity.speed>0)){
      const current=window.nativeShipSystems.resolve(state,entity.id,entity.system);if(current&&!activeIds.has(key(current))){active.push({...current});activeIds.add(key(current));}
    }
    if(state.system===1)for(const entity of window.nativeSolEconomy?.mobile?.(state)||[])if(!entity.lifeLeg&&(entity.motionKick||entity.motionSpin||entity.speed>0)){
      const current=window.nativeShipSystems.resolve(state,'tug:'+entity.id,1);if(current&&!activeIds.has(key(current))){active.push({...current});activeIds.add(key(current));}
    }
    let ships=active;
    if(offscreen){
      const current=new Set(active.map(key)),actors=fleet(state,at,{perception:false}),nextActors=new Map(actors.map(s=>[key(s),s]));
      // Finishing a real job may remove its leg before this poll. Retain that
      // body's final displacement once, without retaining discovered blockers
      // or stationary forecast neighbors as future physical work.
      for(const [id,previous] of rt.physicalActors)if(!nextActors.has(id)&&!current.has(id)&&eligible(previous.entity)){
        const target=window.nativeShipSystems.resolve(state,previous.id,previous.system);
        if(target&&sameBody(previous,target)){actors.push({...target,at});window.nativeSimulationFrame?.count(state,'shipContactStoppedSweeps');}
      }
      rt.physicalActors=nextActors;
      const distant=actors.filter(s=>!current.has(key(s)));
      for(const s of distant){
        const previous=rt.lastPoses.get(key(s)),known=sameBody(previous,s),leg=s.entity.localLeg||s.entity.lifeLeg;
        if(known){s.previousX=previous.x;s.previousY=previous.y;}
        else if(leg){const pose={...s.entity};motion().sampleLeg(pose,leg,Math.max(rt.offscreenAt,leg.startedAt));s.previousX=pose.x;s.previousY=pose.y;}
        s.contactDt=at-(known?previous.at:rt.offscreenAt);
      }
      rt.offscreenAt=at;ships=[...active,...distant];
    }
    for(const s of ships){
      const previous=rt.lastPoses.get(key(s));
      if(s.system===state.system&&sameBody(previous,s)){s.previousX=previous.x;s.previousY=previous.y;}
      const elapsed=s.contactDt||dt,travel=Math.hypot(s.x-s.previousX,s.y-s.previousY);
      if(travel>Math.max(500,Math.hypot(s.vx,s.vy)*elapsed*3+50)){s.previousX=s.x;s.previousY=s.y;}
      if(s.category!=='player'&&s.category!=='repair-drone'&&!s.entity.localLeg&&!s.entity.lifeLeg&&(s.entity.motionKick||s.entity.motionSpin)&&!['fighting','ore-theft'].includes(s.entity.phase)){
        const oldHeading=s.heading,pose={...s,heading:s.heading,motionKick:s.entity.motionKick,motionSpin:s.entity.motionSpin,motionTime:at};motion().step(pose,s.entity.phase==='disabled'?{}:{hold:true},s.definition.movement,elapsed);
        Object.assign(s.entity,{x:pose.x,y:pose.y,heading:pose.heading,vx:pose.vx,vy:pose.vy,speed:pose.speed,motionKick:pose.motionKick,motionSpin:pose.motionSpin,previousX:pose.previousX,previousY:pose.previousY});Object.assign(s,{x:pose.x,y:pose.y,heading:pose.heading,vx:pose.vx,vy:pose.vy,previousX:pose.previousX,previousY:pose.previousY,angularVelocity:motion().spinSample(pose.motionSpin,at).velocity});
        if(pose.x!==pose.previousX||pose.y!==pose.previousY||pose.heading!==oldHeading)window.nativeShipSystems.refreshShip(state,s.entity,s.category,s.system);
      }
    }
    // Free movers keep physical contacts outside the observer's detailed area.
    // Admit their stationary neighbors and connected contact chains through the
    // same conservative grid; an idle hull is still a physical blocker.
    window.nativeSimulationFrame?.count(state,'shipContactActorSeeds',ships.length);
    const neighbors=new Set(ships.map(key));
    for(const s of ships){const padding=motion().shipRadius(s)+2,box={minX:Math.min(s.x,s.previousX)-padding,minY:Math.min(s.y,s.previousY)-padding,maxX:Math.max(s.x,s.previousX)+padding,maxY:Math.max(s.y,s.previousY)+padding};
      if(s.system===state.system&&box.minX>=player.x-radius&&box.maxX<=player.x+radius&&box.minY>=player.y-radius&&box.maxY<=player.y+radius)continue;
      const nearby=window.nativeShipSystems.query(state,{system:s.system,...box,categories:['player','tug','civilian','repair-drone']}).bystanders;
      window.nativeSimulationFrame?.count(state,'shipContactNeighborhoods');window.nativeSimulationFrame?.count(state,'shipContactCandidates',nearby.length);
      for(const target of nearby)if(eligible(target.entity)&&!neighbors.has(key(target))){neighbors.add(key(target));const next=target.entity.localLeg||target.entity.lifeLeg?descriptor(state,target.entity,target.category,at,target):{...target},previous=rt.lastPoses.get(key(next));if(sameBody(previous,next)){next.previousX=previous.x;next.previousY=previous.y;}ships.push(next);}
    }
    const space=grid(ships,state,'shipContact'),seen=new Set();
    for(const a of ships){
      const elapsed=a.contactDt||dt,local=space.forSystem(a.system),reach=motion().shipRadius(a)+local.radius+Math.hypot(a.x-a.previousX,a.y-a.previousY)+local.travel+2;
      const nearby=space.near(a,reach);window.nativeSimulationFrame?.count(state,'shipContactPairCandidates',nearby.length);
      for(const b of nearby){
        const pair=[key(a),key(b)].sort().join('|');if(seen.has(pair))continue;seen.add(pair);
        window.nativeSimulationFrame?.count(state,'shipContactPairTests');
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
    for(const s of ships)rt.lastPoses.set(key(s),{x:s.x,y:s.y,system:s.system,entity:s.entity,category:s.category,at});
    if(offscreen)for(const [id,previous] of rt.lastPoses)if(!eligible(previous.entity)||at-previous.at>1)rt.lastPoses.delete(id);
    for(const [k,t] of rt.contacts)if(at-t>1)rt.contacts.delete(k);
  }
  window.nativeShipTraffic=Object.freeze({advance,collide,steer,snapshot(state){const rt=runtime(state);return {plans:rt.plans,neighborChecks:rt.checks,contacts:rt.history.map(e=>({...e}))};}});
})();
