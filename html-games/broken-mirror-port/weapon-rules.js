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
  function weaponSpec(weapon,kind){
    const turret=/turrent|turret/i.test(weapon.name||'');
    return {damage:Math.max(0,Number(weapon.damage)||0),
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
  function targetSweep(from,to,target,dimensions,radii){
    const angle=target.heading+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    const previous={x:Number.isFinite(target.previousX)?target.previousX:target.x,y:Number.isFinite(target.previousY)?target.previousY:target.y};
    const local=(point,origin)=>{const x=point.x-origin.x,y=point.y-origin.y;return{x:(x*c+y*s)/(radii.rx*.96),y:(-x*s+y*c)/(radii.ry*.96)};};
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
  function stepProjectile(event,target,dt,rocks,radii,dimensions){
    const from={x:event.x,y:event.y};
    if(event.turn){
      const angle=Math.atan2(event.vy,event.vx),desired=Math.atan2(target.y-event.y,target.x-event.x);
      const next=angle+clamp(wrap(desired-angle),-event.turn*dt,event.turn*dt);
      event.vx=Math.cos(next)*event.speed;event.vy=Math.sin(next)*event.speed;
    }
    event.x+=event.vx*dt;event.y+=event.vy*dt;event.age+=dt;
    const to={x:event.x,y:event.y},terrain=obstacleHit(from,to,rocks,event.radius);
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
    const event={kind,damage:spec.damage,spec,muzzle,launchedAt:clock,alive:true};
    if(kind==='beam')event.dueAt=clock+.07;
    else Object.assign(event,launch(source,target,{...spec,muzzle},kind,clock));
    return event;
  }
  function stepShot(event,source,target,scene,clock,dt,radii,dimensions){
    if(!event.alive||!Number.isFinite(dt)||dt<=0)return null;
    const terrain=blockers(scene,source,target);
    if(event.projectile)return stepProjectile(event,target,dt,terrain,radii,dimensions);
    if(clock<event.dueAt)return null;
    if(!canFire(source,target,event.spec,target,[]))return {kind:'miss'};
    const muzzle=event.muzzle||0,from={x:source.x+Math.cos(source.heading)*muzzle,y:source.y+Math.sin(source.heading)*muzzle};
    const obstacle=obstacleHit(from,target,terrain);
    return obstacle?{kind:'blocked',point:{x:from.x+(target.x-from.x)*obstacle.t,y:from.y+(target.y-from.y)*obstacle.t}}:{kind:'hit',point:from};
  }
  function cooldownKey(slot,weapon){return slot+':'+weapon.id;}
  function isReady(owner,slot,weapon,clock){return (owner.weaponReadyAt?.[cooldownKey(slot,weapon)]||0)<=clock;}
  function consume(owner,slot,weapon,kind,clock){
    owner.weaponReadyAt||={};owner.weaponReadyAt[cooldownKey(slot,weapon)]=clock+weaponSpec(weapon,kind).recharge;
  }
  window.nativeWeaponRules={weaponSpec,intercept,circleSweep,targetSweep,obstacleHit,canFire,launch,stepProjectile,firingSolution,startShot,stepShot,isReady,consume,wrap};
})();
