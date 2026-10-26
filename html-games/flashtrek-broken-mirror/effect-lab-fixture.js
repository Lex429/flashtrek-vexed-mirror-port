/* Scripted weapons/shields/hits only. Native owners retain contacts and effects. */
(() => {
 'use strict';
 window.createVexedEffectFixture=({state:simulation,fleet,config,combat})=>{
  if(config.scenario==='explosions')throw Error('Destruction testing is deferred; choose weapons, shields or hull hits.');
  let time=0,shots=[],seed=config.seed||429;
  const combined=['battle','full-battle','weapons-hits'].includes(config.scenario),level=config.loadLevel||'normal';
  const started=nativeSimulation.seconds(simulation),impactSectors=new Uint32Array(8);
  const counters={hits:0,shieldHits:0,hullHits:0,shots:0,explosions:0,activeWeapons:0};
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const seeded=action=>{const original=Math.random;Math.random=random;try{return action();}finally{Math.random=original;}};
  for(const [i,ship] of fleet.entries()){
   ship.next=config.pattern==='volley'?0:random()/config.rate;ship.round=0;ship.phase??=random()*Math.PI*2;
   ship.battleHome={x:ship.entity.x,y:ship.entity.y,heading:ship.entity.heading??ship.entity.angle};
   // Explicit hull-test targets. A charged shield never produces a hull hit.
   if(config.scenario==='hull'||combined&&i%4===0){ship.entity.shields=0;ship.descriptor.shields=0;}
  }
  function shoot(ship){
   const index=fleet.indexOf(ship),target=fleet[(index+Math.max(1,Math.floor(fleet.length/3)))%fleet.length];
   const [selected,weaponIndex]=config.weapon.split(':'),kind=config.mixedWeapons?['beam','torpedo','disruptor'][(index+ship.round)%3]:selected;
   const style=combat.weapons[kind]?.[kind===selected?Number(weaponIndex):0];
   if(!style)throw Error('Selected weapon has no game renderer');
   const spec=window.nativeWeaponRules.weaponSpec({...style,damage:style.baseDamage??style.damage},kind);
   const shot=nativeCombatShots.create({state:simulation,ship:ship.entity,shipHeight:ship.entity.dimensions.height,
    target:{x:target.entity.x,y:target.entity.y},shooter:ship.entity,kind,style,spin:ship.phase,spinSpeed:6,now:nativeSimulation.now(simulation)});
   shot.labTarget=target;shot.labHit=false;shot.labDamage=spec.damage;shot.labColor=style.color;
   if(kind==='beam')shot.targetPoint=from=>nativeCombatShots.contact(target.descriptor,from,target.entity.dimensions,target.entity.shields>0).world;
   shots.push(shot);counters.shots++;
   const interval=1/(config.rate*(level==='stress'?2:1));
   return level==='overload'?interval:Math.max(interval,spec.recharge);
  }
  function impact(ship,shield=ship.entity.shields>0,from,shot){
   const descriptor=ship.descriptor,theta=ship.phase+ship.round*2.399963229728653+(descriptor.heading||0)+Math.PI/2;
   const origin=from||{x:descriptor.x+Math.cos(theta)*100,y:descriptor.y+Math.sin(theta)*100};
   const contact=nativeCombatShots.contact(descriptor,origin,descriptor.dimensions,shield);
   if(shield){const angle=Math.atan2(contact.local.y/contact.radii.ry,contact.local.x/contact.radii.rx);impactSectors[Math.floor((angle+Math.PI)/(Math.PI*2)*8)%8]++;}
   nativeShipEffects.visualImpact(simulation,descriptor,{contact,kind:shot?.kind||'beam',damage:shot?.labDamage||1,
    absorbed:shield?shot?.labDamage||1:0,weaponColor:shot?.labColor,energy:1});
   counters.hits++;counters[shield?'shieldHits':'hullHits']++;
  }
  function step(){
   time=nativeSimulation.seconds(simulation)-started;
   for(const ship of fleet){const entity=ship.entity,descriptor=ship.descriptor;
    if(combined){const home=ship.battleHome;
     entity.x=home.x+Math.sin(time*.7+ship.phase)*5;entity.y=home.y+Math.cos(time*.6+ship.phase)*5;
     entity.heading=home.heading+Math.sin(time*.45+ship.phase)*.4;
    }
    descriptor.x=entity.x;descriptor.y=entity.y;descriptor.heading=entity.heading??entity.angle;
    if(config.scenario==='idle'||time<ship.next)continue;
    ship.round++;let interval=1/config.rate;
    if(config.scenario==='shields')impact(ship);
    else if(config.scenario==='hull')impact(ship,false);
    else interval=shoot(ship);
    ship.next+=Math.max(1,Math.floor((time-ship.next)/interval)+1)*interval;
   }
   for(const shot of shots)if(!shot.labHit&&nativeSimulation.now(simulation)-shot.born>=nativeCombatShots.hitDelay(shot)){
    if(combined||config.scenario==='shielded-battle')impact(shot.labTarget,shot.labTarget.entity.shields>0,shot.from,shot);
    shot.labHit=true;
   }
   shots=shots.filter(shot=>nativeCombatShots.isVisible(shot,nativeSimulation.now(simulation)));
   if(shots.length>2000)throw Error('Fixture shot capacity exceeded');
   counters.activeWeapons=shots.length;
  }
  return Object.freeze({step:()=>seeded(step),snapshot:()=>({...counters,loadLevel:level,destructionEnabled:false,impactSectors:Array.from(impactSectors)}),
   paint:(ctx,view)=>{for(const shot of shots)nativeCombatShots.paint(ctx,shot,{...view,state:simulation,now:nativeSimulation.now(simulation)});}});
 };
})();
