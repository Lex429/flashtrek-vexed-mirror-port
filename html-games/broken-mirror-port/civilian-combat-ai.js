/* Civilian tactical intent. Shared motion, live shots and equipment own mechanics. */
(() => {
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const wrap=angle=>window.nativeShipMotion.wrap(angle);
  const {intercept,weaponSpec,circleSweep,targetSweep,obstacleHit,canFire,launch,stepProjectile}=window.nativeWeaponRules;
  const defaults={caution:.55,aggression:.55,retreatHull:.48,retreatShield:.12,protectCargo:false,distanceFactor:.7};
  const profile=type=>({...defaults,...window.nativeShipDefinitions?.get(type,'civilian').npcPolicy?.combat});
  function traits(ship){
    if(ship.crewTraits?.version===1)return ship.crewTraits;
    // One stable migration, then saved crew data. Identity never chooses a maneuver.
    let seed=2166136261;for(const char of `${ship.name||''}:${ship.id}`)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
    const p=profile(ship.shipType),variation=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296-.5;};
    return ship.crewTraits={version:1,caution:clamp(p.caution+variation()*.24,.05,.98),aggression:clamp(p.aggression+variation()*.24,.02,.95)};
  }
  function begin(ship,role,clock){
    window.nativeShipMotion.prepare(ship);traits(ship);
    ship.combatAI={version:2,role,mode:'assess',modeSince:clock,side:0,lastHitAt:-100,shots:0,passes:0,nextThreatAt:clock,observedThreats:[],engineWarning:false,shieldWarning:false};
  }
  function loadout(state,ship){
    const fitted=window.nativeWeaponLoadout?.equipped(state||{},ship)||[];
    return fitted.filter(item=>item.weapon.damage>0).map(item=>{const kind=window.nativeCombatShots.weaponVisual(item.weapon).kind;return {...item,spec:weaponSpec(item.weapon,kind)};});
  }
  function combatRange(state,ship){
    const weapons=loadout(state,ship);if(!weapons.length)return {range:0,preferred:0,beam:false};
    const weight=weapons.reduce((sum,w)=>sum+w.spec.damage,0)||1,p=profile(ship.shipType);
    return {range:Math.max(...weapons.map(w=>w.spec.range)),preferred:weapons.reduce((sum,w)=>sum+w.spec.range*w.spec.damage,0)/weight*p.distanceFactor,beam:weapons.some(w=>w.spec.kind==='beam')};
  }
  function incomingThreat(state,ship,ai,clock){
    if(!state||!window.nativeCombatShots?.threats)return null;
    if(clock>=ai.nextThreatAt){
      ai.nextThreatAt=clock+.08;
      const descriptor=window.nativeShipDefinitions.describe(state,ship,{category:'civilian'});
      const threats=window.nativeCombatShots.threats(state,descriptor,{horizon:.9,reaction:.15,limit:8});
      ai.observedThreats=threats.map(threat=>({...threat,scannedAt:clock,seenAt:ai.observedThreats?.find(old=>old.id===threat.id)?.seenAt??clock}));
    }
    const delay=.12+traits(ship).caution*.12;
    return ai.observedThreats?.find(threat=>clock-threat.seenAt>=delay&&threat.timeToImpact-(clock-threat.scannedAt)>0&&window.nativeCombatShots.activeProjectile(state,threat.id)?.system===ship.system)||null;
  }
  function observe(state,ship,clock){
    ship.projectileWatch||={nextThreatAt:clock,observedThreats:[]};
    return incomingThreat(state,ship,ship.projectileWatch,clock);
  }
  function clearance(point,rocks,bodies,radius){
    let score=0;
    for(const rock of rocks)score-=Math.max(0,rock.size*.5+radius+75-Math.hypot(point.x-rock.x,point.y-rock.y))*3;
    for(const body of bodies)score-=Math.max(0,body.radius+radius+75-Math.hypot(point.x-body.x,point.y-body.y))*4;
    return score;
  }
  function decide(ship,target,dispute,{state,clock,hull,shields,rocks=[],bystanders=[],bodies=[]}){
    if(!ship.combatAI)begin(ship,ship.id===dispute.b?'thief':'claimant',clock);
    const ai=ship.combatAI;
    if(ai.version!==2){const old=ai;begin(ship,old.role||'defender',clock);ship.combatAI.lastHitAt=old.lastHitAt??-100;ship.combatAI.shots=old.shots||0;return decide(ship,target,dispute,{state,clock,hull,shields,rocks,bystanders,bodies});}
    const crew=traits(ship),p=profile(ship.shipType),dx=target.x-ship.x,dy=target.y-ship.y,distance=Math.hypot(dx,dy)||1,ux=dx/distance,uy=dy/distance;
    const hp=ship.hull/Math.max(1,hull),shield=shields?ship.shields/shields:1,range=combatRange(state,ship),incoming=incomingThreat(state,ship,ai,clock);
    if(state&&ai.threatId!=null&&!window.nativeCombatShots.activeProjectile(state,ai.threatId)){ai.dodgeUntil=clock;delete ai.threatId;}
    const loaded=!!(ship.cargo?.tons||ship.oreHold||ship.repairDeuranium),hurt=clock-ai.lastHitAt<3;
    const retreatAt=p.retreatHull+(crew.caution-.5)*.15;
    if(!ai.disengaging&&(hp<retreatAt||!range.range||p.protectCargo&&loaded||p.survivalFirst||shield<p.retreatShield&&hurt&&crew.caution>crew.aggression)){
      ai.disengaging=true;ai.disengagedAt=clock;ai.escapeGoal=window.nativeNpcLives?.escapeRoute?.(state,ship,target)||{x:ship.x-ux*1600,y:ship.y-uy*1600};
      ai.reason=p.survivalFirst?'Protect medical crew and repair supplies':p.protectCargo&&loaded?'Protect the cargo and reach safety':!range.range?'No fitted combat weapon':'Damage makes continued combat unsafe';
    }
    const preferred=range.preferred*(.9+crew.caution*.2-crew.aggression*.1),minimum=Math.max(70,(ship.combatRadius||15)*2+(target.radius||20));
    ai.desiredRange=Math.max(minimum,preferred);ai.weaponRange=range.range;
    let desired={x:ux,y:uy},throttle=.85,mode='approach',reason='Close to the effective range of fitted weapons';
    if(!ai.side){const cross=ux*(ship.vy||Math.sin(ship.heading||0))-uy*(ship.vx||Math.cos(ship.heading||0));ai.side=cross<0?-1:1;}
    if(ai.disengaging){
      const opponentRange=target.entity?combatRange(state,target.entity).range:combatRange(state,target).range;
      const safeDistance=Math.max(range.range,opponentRange,650)+180;
      ai.escaped=clock-ai.disengagedAt>=4&&distance>safeDistance&&!incoming&&!hurt;
      let goal=ai.escapeGoal,gx=goal.x-ship.x,gy=goal.y-ship.y,length=Math.hypot(gx,gy)||1;
      const approaching=length<Math.max(120,(ship.speed||0)*.8),passed=gx*-ux+gy*-uy<length*-.2;
      const unsafePort=goal.port!=null&&Math.hypot(goal.x-target.x,goal.y-target.y)<Math.max(1100,safeDistance);
      // A waypoint is a leg toward safety, never a boundary that sends a
      // pursued crew back at its attacker. Replan before reaching/passing it.
      if(!ai.escaped&&(approaching||passed||unsafePort)){
        ai.escapeGoal=window.nativeNpcLives?.escapeRoute?.(state,ship,target)||{x:ship.x-ux*1600,y:ship.y-uy*1600};
        ai.escapeLegs=(ai.escapeLegs||0)+1;goal=ai.escapeGoal;gx=goal.x-ship.x;gy=goal.y-ship.y;length=Math.hypot(gx,gy)||1;
      }
      // Safety is physical. An attacker on the route bends the initial course away.
      const away=distance<range.range+150?.9:.25;
      desired={x:gx/length-ux*away,y:gy/length-uy*away};throttle=1;mode='disengage';reason=ai.reason;
    }else if(distance<ai.desiredRange*.78){desired={x:-ux-uy*ai.side*.2,y:-uy+ux*ai.side*.2};throttle=.8;mode='open-range';reason='Too close for fitted weapons and hull clearance';}
    else if(distance<=ai.desiredRange*1.15){
      const radial=clamp((distance-ai.desiredRange)/100,-.45,.5);
      desired={x:ux*radial-uy*ai.side*.4,y:uy*radial+ux*ai.side*.4};throttle=.4;mode='hold-range';reason='Maintain useful weapon distance';
    }else if(!range.beam){const lead=intercept(ship,target,range.range?loadout(state,ship)[0].spec.speed:340);desired={x:lead.x-ship.x,y:lead.y-ship.y};}
    if(incoming){
      const length=Math.hypot(incoming.vx,incoming.vy)||1;
      const choices=[-1,1].map(side=>{const x=-incoming.vy/length*side,y=incoming.vx/length*side;return {side,x,y,score:clearance({x:ship.x+x*130,y:ship.y+y*130},rocks,bodies,ship.combatRadius||15)+(x*desired.x+y*desired.y)*25+(side===ai.side?10:0)};}).sort((a,b)=>b.score-a.score);
      const dodge=choices[0];ai.side=dodge.side;ai.dodgeDirection={x:dodge.x,y:dodge.y};ai.dodgeUntil=clock+.55;ai.threatId=incoming.id;
    }
    if(ai.dodgeUntil>clock&&ai.dodgeDirection){desired={x:ai.dodgeDirection.x+desired.x*.35,y:ai.dodgeDirection.y+desired.y*.35};throttle=1;mode='dodge';reason='Evade a live projectile predicted to intersect this ship';}
    if(ai.lineBlockedUntil>clock&&!ai.disengaging){desired={x:ux*.2-uy*ai.side,y:uy*.2+ux*ai.side};mode='clear-line';reason='Move to a clear firing line';}
    const length=Math.hypot(desired.x,desired.y)||1;desired.x/=length;desired.y/=length;
    const look={x:ship.x+(ship.vx||0)*.65+desired.x*80,y:ship.y+(ship.vy||0)*.65+desired.y*80};
    const avoid=(other,radius)=>{const ox=look.x-other.x,oy=look.y-other.y,d=Math.hypot(ox,oy)||1;if(d<radius){const strength=(1-d/radius)*3;desired.x+=ox/d*strength;desired.y+=oy/d*strength;}};
    for(const rock of rocks)avoid(rock,rock.size*.5+(ship.combatRadius||15)+38);
    for(const body of bodies)avoid(body,body.radius+(ship.combatRadius||15)+30);
    if(ai.mode!==mode)ai.modeSince=clock;ai.mode=mode;ai.decisionReason=reason;
    return {heading:Math.atan2(desired.y,desired.x),throttle};
  }
  function steer(ship,target,dispute,scene){
    if(!Number.isFinite(scene.dt)||scene.dt<=0||!target||!Number.isFinite(target.x)||!Number.isFinite(target.y))return ship.combatAI;
    let command=decide(ship,target,dispute,scene);
    const definition=window.nativeShipDefinitions?.forEntity(scene.state||null,ship,{category:'civilian'}),movement=definition?.movement||window.nativeShipMotion.profiles.manual(definition);
    if(window.nativeShipDefinitions){const descriptor=window.nativeShipDefinitions.describe(scene.state||{},ship,{category:'civilian'});command=window.nativeShipMotion.avoidShips(descriptor,scene.bystanders||[],command,movement);}
    ship.motionTime=scene.clock;window.nativeShipMotion.step(ship,command,movement,scene.dt);return ship.combatAI;
  }
  function coast(ship,dt){if(ship.combatAI)window.nativeShipMotion.step(ship,{coast:true},window.nativeShipMotion.profiles.coast(),dt);}
  window.nativeCivilianCombatAI={profile,traits,begin,decide,observe,combatRange,intercept,weaponSpec,circleSweep,targetSweep,obstacleHit,canFire,launch,stepProjectile,steer,coast,wrap};
})();
