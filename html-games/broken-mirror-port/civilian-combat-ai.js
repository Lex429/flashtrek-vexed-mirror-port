/* Civilian tactical decisions. Shared motion and weapon systems execute mechanics. */
(() => {
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const wrap=angle=>window.nativeShipMotion.wrap(angle);
  const profiles={
    18:{style:'interceptor',range:165,pass:2.1},
    23:{style:'evader',range:150,pass:1.8},
    47:{style:'defender',range:235,pass:3.2},
    52:{style:'cruiser',range:290,pass:3.8}
  };
  const profile=type=>profiles[type]||profiles[47];
  function begin(ship,role,clock){
    window.nativeShipMotion.prepare(ship,{resetVelocity:true,resetAngular:true});
    ship.combatAI={role,mode:role==='thief'?'breakaway':'intercept',until:clock+(role==='thief'?1.6:2.5),side:ship.id%2?1:-1,angularVelocity:0,nextEvade:clock+3,lastHitAt:-100,shots:0,passes:0,engineWarning:false,shieldWarning:false};
  }
  const {intercept,weaponSpec,circleSweep,targetSweep,obstacleHit,canFire,launch,stepProjectile}=window.nativeWeaponRules;
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
  function decide(ship,target,dispute,{clock,hull,shields,rocks=[],bystanders=[],bodies=[]}){
    if(!ship.combatAI)begin(ship,ship.id===dispute.b?'thief':'claimant',clock);
    const ai=ship.combatAI,previousMode=ai.mode,p=profile(ship.shipType),dx=target.x-ship.x,dy=target.y-ship.y,distance=Math.hypot(dx,dy)||1;
    const ux=dx/distance,uy=dy/distance,hp=ship.hull/hull,shield=shields?ship.shields/shields:0;
    const engine=hp<.5?clamp(.45+hp,.55,.95):1;
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
      const vx=Number.isFinite(target.vx)?target.vx:Math.cos(target.heading||0)*(Number(target.speed)||0),vy=Number.isFinite(target.vy)?target.vy:Math.sin(target.heading||0)*(Number(target.speed)||0);
      desired={x:lead.x+vx*.25-ship.x,y:lead.y+vy*.25-ship.y};
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
    ai.engineFactor=engine;if(previousMode!==ai.mode||ai.modeSince==null)ai.modeSince=clock;
    return {heading:Math.atan2(desired.y,desired.x),throttle,engineFactor:engine,turnFactor:hp<.5?.7:1};
  }
  function steer(ship,target,dispute,scene){
    if(!Number.isFinite(scene.dt)||scene.dt<=0||!target||!Number.isFinite(target.x)||!Number.isFinite(target.y))return ship.combatAI;
    const command=decide(ship,target,dispute,scene);
    const definition=window.nativeShipDefinitions?.get(ship.shipType,'civilian');
    const movement=definition?.combatMovement||definition?.profile.combatMovement||window.nativeShipMotion.profiles.combat(ship.shipType,ship.cruiseSpeed||105);
    window.nativeShipMotion.step(ship,command,movement,scene.dt);
    return ship.combatAI;
  }
  function coast(ship,dt){
    if(!ship.combatAI)return;
    window.nativeShipMotion.step(ship,{coast:true,turn:ship.combatAI.side},window.nativeShipMotion.profiles.coast(),dt);
  }
  window.nativeCivilianCombatAI={profile,begin,decide,intercept,weaponSpec,circleSweep,targetSweep,obstacleHit,canFire,launch,stepProjectile,steer,coast,wrap};
})();
