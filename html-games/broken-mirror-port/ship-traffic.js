/* Shared traffic intent and physical contact dispatch for the existing fleet.
   Geometry/integration live in ship-motion; job owners retain their deadlines. */
(() => {
  'use strict';
  const runtimes=new WeakMap(),key=s=>s.category+':'+s.id;
  const motion=()=>window.nativeShipMotion,time=s=>window.nativeSimulation.seconds(s);
  const eligible=e=>e&&e.hull>0&&!e.journey&&!['destroyed','warp','arriving'].includes(e.phase);
  function runtime(state){let rt=runtimes.get(state);if(!rt){rt={plannedAt:-Infinity,offscreenAt:time(state),lastPoses:new Map(),contacts:new Map(),history:[],plans:0,checks:0,describedAt:-1,descriptions:new Map(),checkedLegs:new WeakMap()};runtimes.set(state,rt);}return rt;}
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
  function fleet(state,at){
    const actors=[],found=new Map();
    if(eligible(state)&&!state.landed&&!window.vexedWarp?.active)actors.push({...window.nativeShipDefinitions.describe(state,state,{category:'player'}),at});
    for(const ship of window.nativeSolEconomy?.mobile?.(state)||state.solEconomy?.freighters||[])if(eligible(ship)&&(ship.lifeLeg||ship.motionKick||ship.motionSpin||ship.speed>0)){const current=window.nativeShipSystems.resolve(state,'tug:'+ship.id,1);if(current)actors.push({...current,at});}
    for(const ship of window.nativeNpcLives?.mobile?.(state)||state.civilianTraffic?.ships||[])if(eligible(ship)&&(ship.localLeg||ship.motionKick||ship.motionSpin||ship.speed>0)){const current=window.nativeShipSystems.resolve(state,ship.id,ship.system);if(current)actors.push({...current,at});}
    for(const ship of window.nativeShipRepairs?.drones(state)||[])if(eligible(ship.entity))actors.push(descriptor(state,ship.entity,'repair-drone',at,ship));
    const regions=new Map();
    for(const ship of actors){found.set(key(ship),ship);const reach=Math.max(200,Math.hypot(ship.vx,ship.vy)*6+motion().shipRadius(ship)+80),region=ship.system+':'+Math.floor(ship.x/4096)+':'+Math.floor(ship.y/4096);
      const box={system:ship.system,minX:Math.min(ship.previousX,ship.x)-reach,minY:Math.min(ship.previousY,ship.y)-reach,maxX:Math.max(ship.previousX,ship.x)+reach,maxY:Math.max(ship.previousY,ship.y)+reach};
      const existing=regions.get(region);if(existing){existing.minX=Math.min(existing.minX,box.minX);existing.minY=Math.min(existing.minY,box.minY);existing.maxX=Math.max(existing.maxX,box.maxX);existing.maxY=Math.max(existing.maxY,box.maxY);}else regions.set(region,box);
    }
    for(const box of regions.values())for(const near of window.nativeShipSystems.query(state,{...box,predictSeconds:6,categories:['player','tug','civilian','repair-drone']}).bystanders)if(eligible(near.entity)&&!found.has(key(near)))found.set(key(near),{...near,at});
    return Array.from(found.values());
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
      if(ship.category==='player'||!leg||leg.startedAt+leg.duration<=at||e.disputeId||e.retaliationId||e.scriptedDemo||e.phase==='disabled')continue;
      const profile=ship.definition.movement,neighbors=space.near(ship,Math.max(200,(Math.hypot(ship.vx,ship.vy)+space.speed)*6+space.radius+motion().shipRadius(ship)+80));
      let bodies=motion().navigationBodies(ship.system);const bodyPadding=motion().shipRadius(ship)+24,revision=window.nativeSolAsteroids?.geometryRevision?.(ship.system)||0;
      if(rt.checkedLegs.get(leg)!==revision){
        rt.checkedLegs.set(leg,revision);bodies=motion().navigationObstacles(state,ship.system,ship,leg.goal,bodyPadding);
        const segments=leg.segments||[leg];
        if(segments.some(p=>!motion().clearSegment(p.start,p.goal,bodies,bodyPadding))){
          const points=motion().obstaclePoints(ship,leg.goal,bodies,bodyPadding);
          if(points){const route=motion().routeLeg(ship,leg.goal,points,profile,at);if(replaceLeg(state,ship,route)){rt.checkedLegs.set(route,revision);rt.plans++;window.nativeShipSystems.invalidate(state,ship.system);continue;}}
        }
      }
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
      bodies=motion().navigationObstacles(state,ship.system,ship,goal,bodyPadding);
      const ux=dx/distance,uy=dy/distance,side={x:-uy,y:ux},other=advice.other,clearance=advice.clearance*1.45;
      // A clear berth can be closer than the margin used while cruising.
      // Judge its final physical corridor separately from passing at speed.
      const arrivalClearance=motion().shipRadius(ship)+motion().shipRadius(other)+6;
      const blockedGoal=Math.hypot(goal.x-other.x,goal.y-other.y)<arrivalClearance&&advice.stationary;
      if(blockedGoal&&advice.distance>advice.clearance+ship.speed**2/(2*Math.max(1,profile.braking||225))+(profile.maxSpeed||100)*.5)continue;
      // A service craft whose clear docking point is behind its assigned hull
      // needs a physical bypass. Repeatedly yielding can never expose that goal.
      const service=profile.serviceApproach&&e.approachTarget?.category===other.category&&String(e.approachTarget.id)===String(other.id);
      const serviceGoalClear=service&&!motion().shipPairContact({...ship,x:goal.x,y:goal.y,previousX:goal.x,previousY:goal.y},{...other,previousX:other.x,previousY:other.y},1);
      // A parked hull cannot move aside to repay a right-of-way yield. Build a
      // physical bypass unless it actually occupies the destination corridor.
      let waiting=!serviceGoalClear&&(blockedGoal||advice.yield&&!advice.stationary);const points=[];
      if(!waiting){
        const projection=(other.x-ship.x)*ux+(other.y-ship.y)*uy;
        const entry={x:other.x-ux*clearance+side.x*clearance,y:other.y-uy*clearance+side.y*clearance};
        if(projection>clearance+20)points.push(entry);
        else points.push({x:ship.x+side.x*clearance,y:ship.y+side.y*clearance});
        points.push({x:other.x+ux*clearance+side.x*clearance,y:other.y+uy*clearance+side.y*clearance});
      }
      // Validate the entire maneuver against planets and stationary neighboring
      // hulls. A diversion around one ship cannot cut through a second obstacle.
      const stationary=neighbors.filter(n=>Math.hypot(n.vx,n.vy)<5&&!(serviceGoalClear&&n===other)).map(n=>{
        const radius=motion().shipRadius(n),nearGoal=Math.hypot(goal.x-n.x,goal.y-n.y)<motion().shipRadius(ship)+radius+20;
        // The path query adds the pilot's radius plus 12. At a clear adjacent
        // berth retain six units of hull clearance rather than the cruise gap.
        return {x:n.x,y:n.y,radius:nearGoal?Math.max(0,radius-6):radius+8};
      });
      const obstacles=[...bodies,...stationary],safePoints=[];let from=ship;
      if(!waiting)for(const to of [...points,goal]){
        const bypass=motion().obstaclePoints(from,to,obstacles,motion().shipRadius(ship)+12);
        if(bypass===null){waiting=true;break;}
        safePoints.push(...bypass,to);from=to;
      }
      if(waiting&&!blockedGoal&&(!advice.yield||advice.stationary)){
        // A proposed passing waypoint may itself be blocked. Find a complete
        // alternative around the combined obstacles rather than yielding forever.
        // Parked hulls are already in obstacles, including the approach margin.
        // Adding a larger duplicate makes a clear final berth unreachable.
        const predicted=serviceGoalClear||advice.stationary?[]:[{x:other.x+other.vx*advice.t,y:other.y+other.vy*advice.t,radius:motion().shipRadius(other)+14}];
        const alternative=motion().obstaclePoints(ship,goal,[...obstacles,...predicted],motion().shipRadius(ship)+12);
        if(alternative){waiting=false;safePoints.splice(0,safePoints.length,...alternative,goal);}
      }
      const pose={...e,x:ship.x,y:ship.y,heading:ship.heading,speed:ship.speed,vx:ship.vx,vy:ship.vy};
      const routePoints=waiting?motion().obstaclePoints(pose,goal,bodies,bodyPadding)||[]:safePoints.slice(0,-1);
      const route=motion().routeLeg(pose,goal,routePoints,profile,at,waiting?.8:0);
      if(route.valid===false)continue;
      // Rebase a previous environmental kick at the new start; never replay its displacement.
      const kick=motion().kickSample(e.motionKick,at);
      const spin=motion().spinSample(e.motionSpin,at);
      if(!replaceLeg(state,ship,route))continue;
      rt.checkedLegs.set(route,revision);
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
    return motion().avoidBodies(ship,motion().avoidShips(ship,ships,command,profile),profile);
  }
  function push(state,ship,pose){return window.nativeShipSystems.applyContact(state,ship,pose);}
  function clearSpawn(state,{nearTraffic=false,view=null}={}){
    const at=time(state),player=window.nativeShipDefinitions.describe(state),radius=motion().shipRadius(player);
    const neighbors=fleet(state,at).filter(s=>s.entity!==state&&s.system===state.system);
    const clear=p=>motion().clearSegment(p,p,motion().navigationObstacles(state,state.system,p,p,radius+24),radius+24)&&neighbors.every(s=>Math.hypot(p.x-s.x,p.y-s.y)>radius+motion().shipRadius(s)+24);
    let moving=nearTraffic?neighbors.filter(s=>s.speed>5&&Math.hypot(s.x-player.x,s.y-player.y)<2400).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y)):[];
    const continuing=moving.filter(s=>{const leg=s.entity.localLeg||s.entity.lifeLeg;return !leg||leg.startedAt+leg.duration-at>2;});
    if(continuing.length)moving=continuing;
    const visible=(p,s)=>Math.abs(s.x-p.x)<(view?.w||600)/2-50&&Math.abs(s.y-p.y)<(view?.h||450)/2-50;
    if(clear(player)&&(!moving.length||moving.some(s=>visible(player,s))))return true;
    // Join existing local activity by inserting only the new player nearby.
    // Empty/excluded origins stay empty; no crew is created or teleported.
    const starts=moving.slice(0,3).flatMap(s=>{
      const speed=Math.hypot(s.vx,s.vy)||1,gap=Math.max(140,radius+motion().shipRadius(s)+65),dx=-s.vy/speed*gap,dy=s.vx/speed*gap;
      return [{x:s.x+dx,y:s.y+dy,activity:s},{x:s.x-dx,y:s.y-dy,activity:s}].sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y));
    });
    starts.push(player);
    for(const start of starts)for(let ring=0;ring<=24;ring++)for(let i=0;i<(ring?16:1);i++){
      const angle=i*Math.PI/8,p={x:start.x+Math.cos(angle)*ring*40,y:start.y+Math.sin(angle)*ring*40};
      if(start.activity&&!visible(p,start.activity))continue;
      if(clear(p)){state.x+=p.x-player.x;state.y+=p.y-player.y;state.previousX=p.x;state.previousY=p.y;window.nativeShipSystems.invalidate(state,state.system);return true;}
    }
    return false;
  }
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
      const current=new Set(active.map(key)),distant=fleet(state,at).filter(s=>!current.has(key(s)));
      for(const s of distant){const prev=rt.lastPoses.get(key(s));s.previousX=prev?.system===s.system?prev.x:s.x;s.previousY=prev?.system===s.system?prev.y:s.y;s.contactDt=at-rt.offscreenAt;}
      rt.offscreenAt=at;ships=[...active,...distant];
    }
    for(const s of ships){
      const previous=rt.lastPoses.get(key(s));
      if(s.system===state.system&&previous?.system===s.system){s.previousX=previous.x;s.previousY=previous.y;}
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
    const neighbors=new Set(ships.map(key));
    for(const s of ships){const padding=motion().shipRadius(s)+2,box={minX:Math.min(s.x,s.previousX)-padding,minY:Math.min(s.y,s.previousY)-padding,maxX:Math.max(s.x,s.previousX)+padding,maxY:Math.max(s.y,s.previousY)+padding};
      if(s.system===state.system&&box.minX>=player.x-radius&&box.maxX<=player.x+radius&&box.minY>=player.y-radius&&box.maxY<=player.y+radius)continue;
      const nearby=window.nativeShipSystems.query(state,{system:s.system,...box,categories:['player','tug','civilian','repair-drone']}).bystanders;
      window.nativeSimulationFrame?.count(state,'shipContactNeighborhoods');window.nativeSimulationFrame?.count(state,'shipContactCandidates',nearby.length);
      for(const target of nearby)if(eligible(target.entity)&&!neighbors.has(key(target))){neighbors.add(key(target));const next=target.entity.localLeg||target.entity.lifeLeg?descriptor(state,target.entity,target.category,at,target):{...target},previous=rt.lastPoses.get(key(next));if(previous?.system===next.system){next.previousX=previous.x;next.previousY=previous.y;}ships.push(next);}
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
  window.nativeShipTraffic=Object.freeze({advance,collide,steer,clearSpawn,snapshot(state){const rt=runtime(state);return {plans:rt.plans,neighborChecks:rt.checks,contacts:rt.history.map(e=>({...e}))};}});
})();
