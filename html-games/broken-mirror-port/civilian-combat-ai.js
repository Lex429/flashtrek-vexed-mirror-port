/* Civilian pilots: maneuvering, firing solutions, and physical projectile contacts. */
(() => {
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
  const profiles={
    18:{style:'interceptor',speed:.8,turn:2.3,accel:90,range:165,pass:2.1},
    23:{style:'evader',speed:.72,turn:2.6,accel:105,range:150,pass:1.8},
    47:{style:'defender',speed:.55,turn:1.05,accel:48,range:235,pass:3.2},
    52:{style:'cruiser',speed:.48,turn:.7,accel:36,range:290,pass:3.8}
  };
  const profile=type=>profiles[type]||profiles[47];
  const velocity=ship=>({x:Number(ship.vx)||0,y:Number(ship.vy)||0});
  function begin(ship,role,clock){
    const speed=Number(ship.speed)||0;
    ship.vx=Math.cos(ship.heading)*speed;ship.vy=Math.sin(ship.heading)*speed;
    ship.combatAI={role,mode:role==='thief'?'breakaway':'intercept',until:clock+(role==='thief'?1.6:2.5),side:ship.id%2?1:-1,angularVelocity:0,nextEvade:clock+3,lastHitAt:-100,shots:0,passes:0,engineWarning:false,shieldWarning:false};
  }
  function intercept(from,target,speed){
    const v=velocity(target),dx=target.x-from.x,dy=target.y-from.y;
    const a=v.x*v.x+v.y*v.y-speed*speed,b=2*(dx*v.x+dy*v.y),c=dx*dx+dy*dy;
    let time=0;
    if(Math.abs(a)<1e-6){if(Math.abs(b)>1e-6)time=-c/b;}
    else{const discriminant=b*b-4*a*c;if(discriminant>=0){const root=Math.sqrt(discriminant),times=[(-b-root)/(2*a),(-b+root)/(2*a)].filter(value=>value>0);if(times.length)time=Math.min(...times);}}
    time=clamp(Number.isFinite(time)?time:0,0,2.5);
    return {x:target.x+v.x*time,y:target.y+v.y*time};
  }
  function weaponSpec(weapon,kind,ship){
    const broad=ship.shipType===47||ship.shipType===52;
    return {range:kind==='beam'?520:kind==='torpedo'?650:430,arc:(kind==='beam'?(broad?110:65):kind==='torpedo'?50:50)*Math.PI/180,
      speed:kind==='torpedo'?225:340,turn:kind==='torpedo'?.85:0,radius:kind==='torpedo'?3:1.4,
      recharge:Math.max(kind==='beam'?.55:.35,Number(weapon.recharge||3)/13*1.3)};
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
  function launch(ship,target,spec,kind,clock,serial){
    const aim=intercept(ship,target,spec.speed),jitter=Math.sin(serial*12.97+ship.id*7.1)*(ship.shipType===18||ship.shipType===23?.04:.018);
    const angle=Math.atan2(aim.y-ship.y,aim.x-ship.x)+jitter;
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
  function coverPoint(ship,target,rocks){
    let best=null,bestDistance=Infinity;
    for(const rock of rocks){
      const distance=Math.hypot(rock.x-ship.x,rock.y-ship.y);if(distance>260||distance>=bestDistance)continue;
      const dx=rock.x-target.x,dy=rock.y-target.y,length=Math.hypot(dx,dy)||1,clearance=rock.size*.5+65;
      best={x:rock.x+dx/length*clearance,y:rock.y+dy/length*clearance};bestDistance=distance;
    }
    return best;
  }
  function incomingThreat(ship,pending){
    return pending.find(event=>event.projectile&&event.targetId===ship.id&&event.age>.08&&circleSweep(event,{x:event.x+(event.vx-(ship.vx||0))*.65,y:event.y+(event.vy-(ship.vy||0))*.65},ship,22)!=null);
  }
  function steer(ship,target,dispute,{dt,clock,hull,shields,rocks,bystanders,bodies=[]}){
    if(!ship.combatAI)begin(ship,ship.id===dispute.b?'thief':'claimant',clock);
    const ai=ship.combatAI,previousMode=ai.mode,p=profile(ship.shipType),dx=target.x-ship.x,dy=target.y-ship.y,distance=Math.hypot(dx,dy)||1;
    const ux=dx/distance,uy=dy/distance,hp=ship.hull/hull,shield=shields?ship.shields/shields:0;
    const engine=hp<.5?clamp(.45+hp,.55,.95):1,top=Math.max(36,p.speed*(ship.cruiseSpeed||105))*engine;
    const incoming=incomingThreat(ship,dispute.pending||[]);
    if(clock>=ai.nextEvade&&(incoming||hp<.5||shield<.18&&clock-ai.lastHitAt<2)){
      ai.mode=incoming?'dodge':'evade';ai.until=clock+(incoming?.8:1.5);ai.nextEvade=clock+4.2;
      ai.cover=ai.role==='thief'?coverPoint(ship,target,rocks):null;
    }else if(clock>=ai.until){
      if(['breakaway','evade','dodge','reposition','attack-pass'].includes(ai.mode)){ai.mode='attack';ai.until=clock+p.pass+1;}
      else if(p.style==='interceptor'||p.style==='evader'){ai.mode='reposition';ai.side*=-1;ai.until=clock+1.3;ai.passes++;}
      else{ai.mode='hold-range';ai.side*=-1;ai.until=clock+3.5;}
    }
    if(distance<110&&['attack','intercept'].includes(ai.mode)&&(p.style==='interceptor'||p.style==='evader')){
      ai.mode='attack-pass';ai.passAngle=ship.heading;ai.until=clock+1.5;ai.passes++;
    }
    const lead=intercept(ship,target,340);
    let desired={x:lead.x-ship.x,y:lead.y-ship.y},throttle=.9;
    const pressure=target.shields<=0||target.hull/(target.maxCombatHull||hull)<.5;
    if(pressure&&ai.role==='claimant')throttle=1;
    const desiredRange=p.range*(ai.role==='claimant'&&pressure?.7:1);
    if(ai.mode==='attack-pass'){
      desired={x:Math.cos(ai.passAngle),y:Math.sin(ai.passAngle)};throttle=.95;
    }else if(ai.mode==='dodge'){
      const direction=incoming||ai.dodgeSource||{vx:ux,vy:uy},length=Math.hypot(direction.vx,direction.vy)||1;
      if(incoming)ai.dodgeSource={vx:incoming.vx,vy:incoming.vy};
      desired={x:-direction.vy/length*ai.side+ux*.15,y:direction.vx/length*ai.side+uy*.15};throttle=1;
    }else if(ai.mode==='evade'||ai.mode==='breakaway'){
      desired=ai.cover?{x:ai.cover.x-ship.x,y:ai.cover.y-ship.y}:{x:-ux*.55-uy*ai.side,y:-uy*.55+ux*ai.side};
      if(distance>310){desired={x:ux*.6-uy*ai.side,y:uy*.6+ux*ai.side};}throttle=.95;
    }else if(ai.mode==='reposition'){
      desired={x:ux*.35-uy*ai.side,y:uy*.35+ux*ai.side};throttle=.8;
    }else if(p.style==='defender'||p.style==='cruiser'){
      const radial=clamp((distance-desiredRange)/90,-.8,1);
      desired={x:ux*radial-uy*ai.side*.65,y:uy*radial+ux*ai.side*.65};throttle=.55;
    }else if(ai.role==='claimant'){
      // Cut across the target's course rather than chasing its previous position.
      desired={x:lead.x+target.vx*.25-ship.x,y:lead.y+target.vy*.25-ship.y};
    }
    if(ai.lineBlockedUntil>clock){desired={x:ux*.25-uy*ai.side,y:uy*.25+ux*ai.side};}
    const length=Math.hypot(desired.x,desired.y)||1;desired.x/=length;desired.y/=length;
    const look={x:ship.x+(ship.vx||0)*.65+desired.x*45,y:ship.y+(ship.vy||0)*.65+desired.y*45};
    const avoid=(other,radius)=>{
      const ox=look.x-other.x,oy=look.y-other.y,d=Math.hypot(ox,oy)||1;
      if(d<radius){const strength=(1-d/radius)*2.8;desired.x+=ox/d*strength;desired.y+=oy/d*strength;}
    };
    for(const rock of rocks)avoid(rock,rock.size*.5+ship.combatRadius+38);
    for(const other of bystanders)if(other.id!==ship.id)avoid(other,(other.radius||15)+ship.combatRadius+18);
    for(const other of bystanders)if(other.id!==ship.id){
      const dx=ship.x-other.x,dy=ship.y-other.y,d=Math.hypot(dx,dy)||1,separation=(other.radius||8)+ship.combatRadius+18;
      if(d<separation){desired.x+=dx/d*(1-d/separation)*4;desired.y+=dy/d*(1-d/separation)*4;}
    }
    for(const body of bodies)avoid(body,body.radius+ship.combatRadius+30);
    const anchor=dispute.anchor,rx=dispute.bounds?.x||440,ry=dispute.bounds?.y||330;
    const ex=(ship.x-anchor.x)/rx,ey=(ship.y-anchor.y)/ry,edge=Math.hypot(ex,ey);
    if(edge>.72){const strength=clamp((edge-.72)*6,0,4);desired.x-=ex*strength;desired.y-=ey*strength;}
    const heading=Math.atan2(desired.y,desired.x),error=wrap(heading-ship.heading),turnLimit=p.turn*(hp<.5?.7:1);
    const angularTarget=clamp(error*3,-turnLimit,turnLimit);
    ai.angularVelocity+=(angularTarget-ai.angularVelocity)*Math.min(1,dt*6);
    const change=clamp(ai.angularVelocity*dt,-Math.abs(error),Math.abs(error));ship.heading=wrap(ship.heading+change);
    const aligned=clamp(1-Math.abs(error)/2.3,.25,1),desiredSpeed=top*throttle*aligned;
    const vx=Math.cos(ship.heading)*desiredSpeed,vy=Math.sin(ship.heading)*desiredSpeed;
    const ax=vx-(ship.vx||0),ay=vy-(ship.vy||0),accel=p.accel*engine*dt,delta=Math.hypot(ax,ay)||1;
    ship.vx=(ship.vx||0)+ax*Math.min(1,accel/delta);ship.vy=(ship.vy||0)+ay*Math.min(1,accel/delta);
    const speed=Math.hypot(ship.vx,ship.vy);if(speed>top){ship.vx*=top/speed;ship.vy*=top/speed;}
    ship.previousX=ship.x;ship.previousY=ship.y;ship.x+=ship.vx*dt;ship.y+=ship.vy*dt;ship.speed=Math.hypot(ship.vx,ship.vy);
    ai.engineFactor=engine;if(previousMode!==ai.mode||ai.modeSince==null)ai.modeSince=clock;
    return ai;
  }
  function coast(ship,dt){
    if(!ship.combatAI)return;
    ship.x+=(ship.vx||0)*dt;ship.y+=(ship.vy||0)*dt;
    const damping=Math.exp(-2.5*dt);ship.vx=(ship.vx||0)*damping;ship.vy=(ship.vy||0)*damping;
    ship.heading=wrap(ship.heading+ship.combatAI.side*.12*dt);ship.speed=Math.hypot(ship.vx,ship.vy);
  }
  window.nativeCivilianCombatAI={profile,begin,intercept,weaponSpec,circleSweep,targetSweep,obstacleHit,canFire,launch,stepProjectile,steer,coast,wrap};
})();
