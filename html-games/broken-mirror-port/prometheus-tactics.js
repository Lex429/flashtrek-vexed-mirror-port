/* Squadron goals only. Shared owners retain propulsion, avoidance and weapons. */
(()=>{
 'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const policy=Object.freeze({flank:Math.PI*2/3,sweep:.27,sweepRate:.15,courseRate:.7,rangeRate:100,retreatHull:.36,recoverHull:.55});
 function plan(state,entity,target,lead,dt){
  const g=state.prometheus,parts=window.nativePrometheusDefinitions.parts,others=parts.filter(p=>p.type!==g.leadType),side=others.findIndex(p=>p.type===entity.shipType)===0?-1:1;
  const actor=window.nativeShipDefinitions.describe(state,entity,{category:'prometheus'}),fitted=window.nativeWeaponLoadout.equipped(state,entity);
  const weapons=fitted.filter(v=>v.weapon.damage>0).map(v=>({...v,spec:window.nativeWeaponRules.weaponSpec(v.weapon,window.nativeCombatShots.weaponVisual(v.weapon).kind)}));
  const weight=weapons.reduce((n,v)=>n+v.spec.damage,0)||1,range=weapons.length?Math.max(...weapons.map(v=>v.spec.range)):0;
  const preferred=weapons.reduce((n,v)=>n+v.spec.range*v.spec.damage,0)/weight*.63;
  const clock=window.nativeSimulation.seconds(state),hp=entity.hull/Math.max(1,actor.definition.hull),shield=actor.definition.shields?entity.shields/actor.definition.shields:1;
  let pilot=entity.prometheusCombat;
  if(pilot?.version!==1||String(pilot.targetId)!==String(target.id)||pilot.anchor!==g.leadType||entity.prometheusPilot?.mode!=='combat'){
   pilot=entity.prometheusCombat={version:1,targetId:target.id,anchor:g.leadType,side,course:Math.atan2(entity.y-target.y,entity.x-target.x),radius:Math.hypot(entity.x-target.x,entity.y-target.y),sweep:0,direction:side,mode:'flank',since:clock};
  }
  const damaged=hp<policy.retreatHull||hp<.65&&shield<.12;
  const retreat=damaged||pilot.mode==='recover'&&(hp<policy.recoverHull||shield<.3);
  const mode=!range?'screen':retreat?'recover':'flank';if(mode!==pilot.mode){pilot.mode=mode;pilot.since=clock;}
  const minimum=Math.max(90,(target.radius||25)+(actor.radius||20)+45),normal=clamp(preferred,minimum,650);
  pilot.sweep=clamp(pilot.sweep+pilot.direction*policy.sweepRate*dt,-policy.sweep,policy.sweep);
  if(Math.abs(pilot.sweep)>=policy.sweep-1e-8)pilot.direction*=-1;
  const bearing=Math.atan2(lead.y-target.y,lead.x-target.x),wanted=bearing+(mode==='flank'?side*policy.flank+pilot.sweep:side*.4);
  const turn=clamp(wrap(wanted-pilot.course),-policy.courseRate*dt,policy.courseRate*dt);pilot.course=wrap(pilot.course+turn);
  const desired=mode==='flank'?normal:Math.max(normal*1.35,Math.min(950,range*.96),Math.hypot(lead.x-target.x,lead.y-target.y)+140);
  const radial=clamp(desired-pilot.radius,-policy.rangeRate*dt,policy.rangeRate*dt);pilot.radius+=radial;
  const speed=Math.max(60,actor.definition.movement.maxSpeed),leadTime=clamp(Math.hypot(target.x-entity.x,target.y-entity.y)/speed*.45,0,1.1),vx=target.vx||0,vy=target.vy||0;
  const c=Math.cos(pilot.course),s=Math.sin(pilot.course),omega=turn/dt,dr=radial/dt;
  let goal={x:target.x+vx*leadTime+c*pilot.radius,y:target.y+vy*leadTime+s*pilot.radius,
   vx:vx-s*omega*pilot.radius+c*dr,vy:vy+c*omega*pilot.radius+s*dr};
  // Keep the physical route outside both the enemy hull and the piloted hull.
  for(const obstacle of [target,window.nativeShipDefinitions.describe(state,state,{category:'player'})]){
   const routed=window.nativeShipMotion.attachmentGoal(actor,obstacle,goal);
   if(routed!==goal)goal={...routed,vx,vy};
  }
  const choice=weapons.slice().sort((a,b)=>(a.instance.readyAt||0)-(b.instance.readyAt||0)||b.spec.damage-a.spec.damage)[0];
  const aim=choice&&choice.spec.kind!=='beam'?window.nativeWeaponRules.intercept(actor,target,choice.spec.speed):target;
  goal.heading=Math.atan2(aim.y-entity.y,aim.x-entity.x);
  pilot.weaponRange=range;pilot.preferred=normal;pilot.goal={...goal};
  entity.prometheusPilot={version:2,mode:'combat'};
  return goal;
 }
 window.nativePrometheusTactics=Object.freeze({plan,policy});
})();
