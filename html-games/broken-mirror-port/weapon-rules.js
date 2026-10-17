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
    return {damage:Math.max(0,Number(weapon.damage)||0)*damageMultiplier,
      range:kind==='beam'?520:kind==='torpedo'?650:430,
      arc:(turret?180:kind==='beam'?110:50)*Math.PI/180,
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
  function canFire(ship,target,spec,aim,rocks,bystanders=[]){
    const dx=aim.x-ship.x,dy=aim.y-ship.y;
    if(Math.hypot(dx,dy)>spec.range||Math.abs(wrap(Math.atan2(dy,dx)-ship.heading))>spec.arc)return false;
    if(obstacleHit(ship,aim,rocks))return false;
    return !bystanders.some(other=>other.id!==ship.id&&other.id!==target.id&&circleSweep(ship,aim,other,Math.max(10,other.radius||15))!=null);
  }
  function launch(ship,target,spec,kind,clock){
    const aim=intercept(ship,target,spec.speed);
    const angle=Math.atan2(aim.y-ship.y,aim.x-ship.x);
    return {x:ship.x+Math.cos(ship.heading)*spec.muzzle,y:ship.y+Math.sin(ship.heading)*spec.muzzle,
      vx:Math.cos(angle)*spec.speed,vy:Math.sin(angle)*spec.speed,age:0,ttl:spec.range/spec.speed+.25,
      projectile:true,alive:true,turn:spec.turn,radius:spec.radius,speed:spec.speed,launchedAt:clock,kind};
  }
  // Resolve the first physical contact, including objects that were clear at launch.
  function firstContact(from,to,source,target,scene,radii,dimensions,padding=0){
    let best=null;
    const consider=(candidate,t)=>{
      if(t==null||best&&t>=best.t)return;
      const intersection={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};
      const contact=collisionContact(candidate,intersection,from,t);
      best={kind:'hit',t,target:candidate,point:contact.world,sweepPoint:intersection,from:{...from},contact};
    };
    const candidates=[...(scene.bystanders||[]),...(scene.destructibles||[])].filter(other=>other.id!==source?.id&&other.id!==target?.id&&other.targetable!==false);
    if(target&&target.targetable!==false)candidates.push({...target,dimensions,radii});
    for(const candidate of candidates){
      if(candidate.rockId!=null)continue; // Asteroids use their physical rock outline below.
      const d=candidate.dimensions,r=candidate.radii;
      const t=r?targetSweep(from,to,candidate,d,r,padding):circleSweep(from,to,candidate,Math.max(1,candidate.radius||15)+padding);
      consider(candidate,t);
    }
    for(const rock of scene.rocks||[]){
      if(rock.targetable===false)continue;
      consider({...rock,id:rock.id??'rock:'+rock.slotId,rockId:rock.slotId,category:'asteroid'},circleSweep(from,to,rock,rock.size*.43+padding));
    }
    // Permit a rock target supplied without a full scene (such as an isolated test).
    if(target?.rockId!=null&&target.targetable!==false&&!(scene.rocks||[]).some(rock=>rock.slotId===target.rockId))consider(target,circleSweep(from,to,target,target.size*.43+padding));
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
    const aim=kind==='beam'?target:intercept(source,target,spec.speed);
    return canFire(source,target,spec,aim,blockers(scene,source,target));
  }
  function startShot(weapon,kind,source,target,clock,muzzle){
    const spec=weaponSpec(weapon,kind);
    const event={kind,damage:spec.damage,spec,muzzle,sourceId:source.id,targetId:target.id,launchedAt:clock,alive:true};
    if(kind==='beam'){
      event.dueAt=clock+.07;
      event.from={x:source.x+Math.cos(source.heading)*muzzle,y:source.y+Math.sin(source.heading)*muzzle};
      const angle=Math.atan2(target.y-event.from.y,target.x-event.from.x);
      event.beamHeadingOffset=wrap(angle-source.heading);
      event.beamEnd={x:event.from.x+Math.cos(angle)*spec.range,y:event.from.y+Math.sin(angle)*spec.range};
    }
    else Object.assign(event,launch(source,target,{...spec,muzzle},kind,clock));
    return event;
  }
  function stepShot(event,source,target,scene,clock,dt,radii,dimensions){
    if(!event.alive||!Number.isFinite(dt)||dt<=0)return null;
    if(event.projectile)return stepProjectile(event,target,dt,[],radii,dimensions,scene,source);
    if(clock<event.dueAt)return null;
    const muzzle=event.muzzle||0,from=emitter(source,event);
    const angle=(source.heading||0)+(event.beamHeadingOffset??Math.atan2((event.beamEnd?.y??target.y)-from.y,(event.beamEnd?.x??target.x)-from.x)-(source.heading||0));
    const to={x:from.x+Math.cos(angle)*event.spec.range,y:from.y+Math.sin(angle)*event.spec.range};
    event.from={...from};event.beamEnd=to;
    return to?(firstContact(from,to,source,target,scene,radii,dimensions)||{kind:'miss',point:to}):{kind:'miss'};
  }
  function emitter(source,event){
    const attachment=event.emitter;
    if(attachment){const angle=(source.heading||0)+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);return {x:source.x+attachment.x*c-attachment.y*s,y:source.y+attachment.x*s+attachment.y*c};}
    return {x:source.x+Math.cos(source.heading||0)*(event.muzzle||0),y:source.y+Math.sin(source.heading||0)*(event.muzzle||0)};
  }
  window.nativeWeaponRules={weaponSpec,intercept,circleSweep,targetSweep,obstacleHit,firstContact,collisionContact,canFire,launch,stepProjectile,firingSolution,startShot,stepShot,emitter,wrap};
})();
