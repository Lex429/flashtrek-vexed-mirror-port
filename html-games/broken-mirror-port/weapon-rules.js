/* Authoritative weapon mechanics shared by human and AI shooters. No reactor resource. */
(() => {
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
  const velocity=ship=>({x:Number.isFinite(ship.vx)?ship.vx:Math.cos(ship.heading||0)*(Number(ship.speed)||0),y:Number.isFinite(ship.vy)?ship.vy:Math.sin(ship.heading||0)*(Number(ship.speed)||0)});
  function intercept(from,target,speed){
    const v=velocity(target),dx=target.x-from.x,dy=target.y-from.y;
    const a=v.x*v.x+v.y*v.y-speed*speed,b=2*(dx*v.x+dy*v.y),c=dx*dx+dy*dy;
    let time=0;
    if(Math.abs(a)<1e-6){if(Math.abs(b)>1e-6)time=-c/b;}
    else{const discriminant=b*b-4*a*c;if(discriminant>=0){const root=Math.sqrt(discriminant),times=[(-b-root)/(2*a),(-b+root)/(2*a)].filter(value=>value>0);if(times.length)time=Math.min(...times);}}
    time=clamp(Number.isFinite(time)?time:0,0,2.5);
    return {x:target.x+v.x*time,y:target.y+v.y*time};
  }
  // All shooters resolve the same model data. Arc is a half-angle in radians.
  function weaponSpec(weapon,kind,{damageMultiplier=1}={}){
    const turret=/turrent|turret/i.test(weapon.name||'');
    return {kind,damage:Math.max(0,Number(weapon.damage)||0)*damageMultiplier,
      range:kind==='beam'?520:kind==='torpedo'?650:430,
      arc:(turret||kind==='beam'?180:50)*Math.PI/180,
      speed:kind==='torpedo'?225:340,turn:kind==='torpedo'?.85:0,
      radius:kind==='torpedo'?3:1.4,recharge:Math.max(0,Number(weapon.recharge)||0)/13};
  }
  function circleSweep(from,to,center,radius){
    const dx=to.x-from.x,dy=to.y-from.y,ox=from.x-center.x,oy=from.y-center.y;
    const a=dx*dx+dy*dy,c=ox*ox+oy*oy-radius*radius;
    if(c<=0)return 0;
    if(a<1e-9)return null;
    const b=2*(ox*dx+oy*dy),d=b*b-4*a*c;
    if(d<0)return null;
    const t=(-b-Math.sqrt(d))/(2*a);return t>=0&&t<=1?t:null;
  }
  function targetSweep(from,to,target,dimensions,radii,padding=0){
    const angle=(target.heading||0)+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    const previous={x:Number.isFinite(target.previousX)?target.previousX:target.x,y:Number.isFinite(target.previousY)?target.previousY:target.y};
    const local=(point,origin)=>{const x=point.x-origin.x,y=point.y-origin.y;return{x:(x*c+y*s)/(radii.rx*.96+padding),y:(-x*s+y*c)/(radii.ry*.96+padding)};};
    return circleSweep(local(from,previous),local(to,target),{x:0,y:0},1);
  }
  function obstacleHit(from,to,rocks,padding=0){
    let best=null;
    for(const rock of rocks){const t=circleSweep(from,to,rock,rock.size*.43+padding);if(t!=null&&(!best||t<best.t))best={t,rock};}
    return best;
  }
  function movingRockSweep(from,to,rock,padding=0){
    const previous={x:Number.isFinite(rock.previousX)?rock.previousX:rock.x,y:Number.isFinite(rock.previousY)?rock.previousY:rock.y};
    return circleSweep({x:from.x-previous.x,y:from.y-previous.y},{x:to.x-rock.x,y:to.y-rock.y},{x:0,y:0},rock.size*.43+padding);
  }
  function canFire(ship,target,spec,aim,rocks=[],bystanders=[]){
    return fireEligibility(ship,target,spec,aim,rocks,bystanders).ok;
  }
  function fireEligibility(ship,target,spec,aim,rocks=[],bystanders=[]){
    const dx=aim.x-ship.x,dy=aim.y-ship.y;
    const distance=Math.hypot(dx,dy);
    const inRange=distance<=spec.range,inArc=Math.abs(wrap(Math.atan2(dy,dx)-(ship.heading||0)))<=spec.arc;
    if(!inRange)return {ok:false,reason:'range',distance,inRange,inArc};
    if(!inArc)return {ok:false,reason:'arc',distance,inRange,inArc};
    // A beam may be fired at an obstructed lock: the first physical surface
    // receives it. Projectile launch/leading and avoidance retain their rules.
    if(spec.kind==='beam')return {ok:true,reason:'ready',distance,inRange,inArc};
    if(obstacleHit(ship,aim,rocks))return {ok:false,reason:'blocked',distance,inRange,inArc};
    const blocked=bystanders.some(other=>other.id!==ship.id&&other.id!==target.id&&circleSweep(ship,aim,other,Math.max(10,other.radius||15))!=null);
    return {ok:!blocked,reason:blocked?'blocked':'ready',distance,inRange,inArc};
  }
  function launch(ship,target,spec,kind,clock){
    const aim=intercept(ship,target,spec.speed);
    const angle=Math.atan2(aim.y-ship.y,aim.x-ship.x);
    return {x:ship.x+Math.cos(ship.heading)*spec.muzzle,y:ship.y+Math.sin(ship.heading)*spec.muzzle,
      vx:Math.cos(angle)*spec.speed,vy:Math.sin(angle)*spec.speed,age:0,ttl:spec.range/spec.speed+.25,
      projectile:true,alive:true,turn:spec.turn,radius:spec.radius,speed:spec.speed,launchedAt:clock,kind};
  }
  // Resolve the first physical contact, including objects that were clear at launch.
  function firstContact(from,to,source,target,scene,radii,dimensions,padding=0,{instant=false}={}){
    const state=scene.state;
    scene=scene.querySwept?.(from,to,padding,{instant})||scene;
    let best=null,tested=0;
    const consider=(candidate,t)=>{
      if(t==null||best&&t>=best.t)return;
      const intersection={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};
      const contact=collisionContact(candidate,intersection,from,t);
      if(instant&&t===0){
        // Hull-clear ships may have overlapping shields. If the hardware is
        // already inside a surface, contact is immediate at the muzzle; do not
        // project it backward and draw a beam pointing away from its target.
        const angle=candidate.rockId!=null?0:(candidate.heading||0)+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
        const dx=intersection.x-candidate.x,dy=intersection.y-candidate.y;
        contact.local={x:dx*c+dy*s,y:-dx*s+dy*c};contact.world={...intersection};contact.embedded=true;
      }
      best={kind:'hit',t,target:candidate,point:contact.world,sweepPoint:intersection,from:{...from},contact};
    };
    const testShip=original=>{
      let candidate=original;
      if(candidate.rockId!=null)return; // Asteroids use their physical rock outline below.
      if(instant)candidate={...candidate,previousX:candidate.x,previousY:candidate.y};
      const d=candidate.dimensions,r=candidate.radii;
      tested++;
      const t=r?targetSweep(from,to,candidate,d,r,padding):circleSweep(from,to,candidate,Math.max(1,candidate.radius||15)*(instant ? .96 : 1)+padding);
      consider(candidate,t);
    };
    for(const collection of [scene.bystanders||[],scene.destructibles||[]])for(const candidate of collection){
      if(candidate.id===source?.id||candidate.id===target?.id||candidate.targetable===false)continue;
      testShip(candidate);
    }
    if(target&&target.targetable!==false&&target.rockId==null)testShip({...target,dimensions,radii});
    for(let rock of scene.rocks||[]){
      if(rock.targetable===false)continue;
      if(instant)rock={...rock,previousX:rock.x,previousY:rock.y};
      tested++;
      consider({...rock,id:rock.id??'rock:'+rock.slotId,rockId:rock.slotId,category:'asteroid'},movingRockSweep(from,to,rock,padding));
    }
    // Permit a rock target supplied without a full scene (such as an isolated test).
    if(target?.rockId!=null&&target.targetable!==false&&!(scene.rocks||[]).some(rock=>rock.slotId===target.rockId)){
      const rock=instant?{...target,previousX:target.x,previousY:target.y}:target;
      tested++;
      consider(rock,movingRockSweep(from,to,rock,padding));
    }
    window.nativeSimulationFrame?.count(state,'collisionCandidates',tested);
    window.nativeSimulationFrame?.count(state,instant?'beamCandidates':'projectileCandidates',tested);
    return best;
  }
  // Collision owns the exact local surface. Damage and rendering consume this result.
  function collisionContact(target,point,from,time=1){
    const asteroid=target.rockId!=null,angle=asteroid?0:(target.heading||0)+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    const d=target.dimensions||{width:Math.max(2,(target.radius||15)*2),height:Math.max(2,(target.radius||15)*2)};
    const r=asteroid?{rx:target.size*.43,ry:target.size*.43}:target.radii||{rx:target.radius||15,ry:target.radius||15};
    const origin={x:Number.isFinite(target.previousX)?target.previousX+(target.x-target.previousX)*time:target.x,y:Number.isFinite(target.previousY)?target.previousY+(target.y-target.previousY)*time:target.y};
    const dx=point.x-origin.x,dy=point.y-origin.y;
    let lx=dx*c+dy*s,ly=-dx*s+dy*c;
    if(Math.hypot(lx,ly)<1e-9){const fx=from.x-target.x,fy=from.y-target.y;lx=fx*c+fy*s;ly=-fx*s+fy*c;if(Math.hypot(lx,ly)<1e-9)ly=-1;}
    const scale=(asteroid?1:.96)/Math.hypot(lx/r.rx,ly/r.ry),length=Math.hypot(lx,ly);
    const local={x:lx*scale,y:ly*scale},world={x:target.x+local.x*c-local.y*s,y:target.y+local.x*s+local.y*c};
    return {local,world,dx:-lx/length,dy:-ly/length,from:{...from},shielded:!asteroid&&(target.surfaceShielded??Number(target.shields)>0),radii:{...r},dimensions:{...d}};
  }
  function stepProjectile(event,target,dt,rocks,radii,dimensions,scene=null,source=null){
    const from={x:event.x,y:event.y};
    event.previousX=event.x;event.previousY=event.y;
    if(event.turn&&target&&target.targetable!==false){
      const angle=Math.atan2(event.vy,event.vx),desired=Math.atan2(target.y-event.y,target.x-event.x);
      const next=angle+clamp(wrap(desired-angle),-event.turn*dt,event.turn*dt);
      event.vx=Math.cos(next)*event.speed;event.vy=Math.sin(next)*event.speed;
    }
    event.x+=event.vx*dt;event.y+=event.vy*dt;event.age+=dt;
    const to={x:event.x,y:event.y};
    if(scene){
      const collision=firstContact(from,to,source,target,scene,radii,dimensions,event.radius);
      if(collision){event.x=collision.point.x;event.y=collision.point.y;return collision;}
      return event.age>=event.ttl?{kind:'miss'}:null;
    }
    const terrain=obstacleHit(from,to,rocks,event.radius);
    const contact=targetSweep(from,to,target,dimensions,radii);
    if(terrain&&(contact==null||terrain.t<=contact))return {kind:'blocked',point:{x:from.x+(to.x-from.x)*terrain.t,y:from.y+(to.y-from.y)*terrain.t}};
    if(contact!=null)return {kind:'hit',point:{x:from.x+(to.x-from.x)*contact,y:from.y+(to.y-from.y)*contact}};
    return event.age>=event.ttl?{kind:'miss'}:null;
  }
  function blockers(scene,source,target){
    return [...(scene.rocks||[]).filter(rock=>target.rockId==null||rock.slotId!==target.rockId),
      ...(scene.bystanders||[]).filter(ship=>ship.id!==source.id&&ship.id!==target.id)
        .map(ship=>({...ship,size:Math.max(10,ship.radius||15)/.43}))];
  }
  function firingSolution(source,target,spec,kind,scene){
    return firingStatus(source,target,spec,kind,scene).ok;
  }
  function firingStatus(source,target,spec,kind,scene){
    const aim=kind==='beam'?target:intercept(source,target,spec.speed);
    // Launch clearance historically gives even a tiny hull a 10-unit margin.
    // The physical index can be smaller, so include that margin in this query.
    if(kind!=='beam')scene=scene.querySwept?.(source,aim,10,{instant:true})||scene;
    return fireEligibility(source,target,spec,aim,kind==='beam'?[]:blockers(scene,source,target));
  }
  // A short linear forecast is awareness, not a second projectile simulator.
  // The actual shot still flies/homes and applies damage only in stepShot.
  function projectileThreat(event,target,scene,horizon=.9){
    const remaining=Math.max(0,Math.min(horizon,Number.isFinite(event.ttl)?event.ttl-(Number(event.age)||0):horizon));
    if(!(remaining>0))return null;
    const predict=other=>{const v=velocity(other);return {...other,previousX:other.x,previousY:other.y,x:other.x+v.x*remaining,y:other.y+v.y*remaining};};
    const future=predict(target),from={x:event.x,y:event.y},to={x:from.x+event.vx*remaining,y:from.y+event.vy*remaining};
    scene=scene.querySwept?.(from,to,event.radius||0,{instant:true,horizon:remaining})||scene;
    const predicted={state:scene.state,bystanders:(scene.bystanders||[]).map(predict),destructibles:(scene.destructibles||[]).map(predict),rocks:(scene.rocks||[]).map(predict)};
    const contact=firstContact(from,to,{id:event.sourceId},future,predicted,future.radii,future.dimensions,event.radius||0);
    return contact&&String(contact.target.id)===String(target.id)?{timeToImpact:contact.t*remaining,point:contact.point}:null;
  }
  function startShot(weapon,kind,source,target,clock,muzzle,spec=weaponSpec(weapon,kind)){
    const event={kind,damage:spec.damage,spec,muzzle,sourceId:source.id,targetId:target.id,launchedAt:clock,alive:true};
    if(kind==='beam'){
      event.dueAt=clock+.07;
      event.from={x:source.x+Math.cos(source.heading)*muzzle,y:source.y+Math.sin(source.heading)*muzzle};
      const angle=Math.atan2(target.y-event.from.y,target.x-event.from.x);
      event.beamEnd={x:event.from.x+Math.cos(angle)*spec.range,y:event.from.y+Math.sin(angle)*spec.range};
    }
    else Object.assign(event,launch(source,target,{...spec,muzzle},kind,clock));
    return event;
  }
  function stepShot(event,source,target,scene,clock,dt,radii,dimensions){
    if(!event.alive||!Number.isFinite(dt)||dt<=0)return null;
    if(event.projectile)return stepProjectile(event,target,dt,[],radii,dimensions,scene,source);
    if(clock<event.dueAt)return null;
    const result=beamTrace(event,source,target,scene,radii,dimensions);
    event.from={...result.from};event.beamEnd={...result.point};
    return result;
  }
  // Beam time is instantaneous at resolution. Unlike a flying projectile, a
  // beam must not sweep an object's previous pose or rotate an old aim offset
  // with its shooter. This query also supplies preview and lingering visuals.
  function beamTrace(event,source,target,scene,radii=target?.radii,dimensions=target?.dimensions){
    const from=emitter(source,event),aim=[target,event.targetSnapshot,event.beamEnd].find(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y));
    const angle=aim?Math.atan2(aim.y-from.y,aim.x-from.x):event.sourceSnapshot?.heading??source.heading??0;
    const to={x:from.x+Math.cos(angle)*event.spec.range,y:from.y+Math.sin(angle)*event.spec.range};
    return firstContact(from,to,source,target,scene,radii,dimensions,0,{instant:true})||{kind:'miss',point:to,from};
  }
  function emitter(source,event){
    const attachment=event.emitter;
    if(attachment){const angle=(source.heading||0)+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);return {x:source.x+attachment.x*c-attachment.y*s,y:source.y+attachment.x*s+attachment.y*c};}
    return {x:source.x+Math.cos(source.heading||0)*(event.muzzle||0),y:source.y+Math.sin(source.heading||0)*(event.muzzle||0)};
  }
  window.nativeWeaponRules={weaponSpec,intercept,circleSweep,targetSweep,obstacleHit,firstContact,collisionContact,canFire,launch,stepProjectile,firingSolution,firingStatus,projectileThreat,startShot,stepShot,beamTrace,emitter,wrap};
})();
