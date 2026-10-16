/* Player damage and the same shield/hull contact effects used by the showcase. */
(() => {
  'use strict';
  let flash=null;
  const particles=[];
  const stats=state=>window.VexedMirrorWorld.ships.find(ship=>ship.id===Number(state.shipType))||{hull:100,shields:100};
  function target(state){
    const position=state.system===1?window.vexedSolFlight.shipPosition(state):state;
    return {...position,heading:state.angle};
  }
  function dimensions(state){return window.vexedFlightAssets.flightDimensions(window.vexedFlightAssets.size(state.shipType),1);}
  function emit(state,impact,shielded,contact){
    const now=performance.now(),ship=target(state),d=dimensions(state);
    contact||=window.nativeCombatShots.contact(ship,impact.from||ship,d,shielded);
    if(shielded)flash={born:now,x:contact.local.x,y:contact.local.y,dx:contact.dx,dy:contact.dy,
      kind:impact.kind||'debris',energy:1,charge:Math.max(.08,state.shields/Math.max(1,stats(state).shields))};
    else window.showcaseHullBurst.burst(particles,contact.world,now,window.showcaseWeaponAppearance.units,1,.65,true);
  }
  function visualImpact(state,impact={}){
    if(!state||state.hull<=0)return;
    emit(state,impact,state.shields>0);
  }
  function hit(state,damage,impact={}){
    if(!state||state.hull<=0)return {ok:false,error:'Player hull is already disabled.'};
    const amount=Math.max(0,Number(damage)||0),absorbed=Math.min(Math.max(0,state.shields),amount);
    const ship=target(state),d=dimensions(state);
    const contact=window.nativeCombatShots.contact(ship,impact.from||ship,d,absorbed>0);
    state.shields=Math.max(0,state.shields-absorbed);
    state.hull=Math.max(0,state.hull-(amount-absorbed));
    if(absorbed>0)emit(state,impact,true,contact);
    if(amount>absorbed)emit(state,impact,false,absorbed>0?null:contact);
    if(state.hull<=0){
      state.speed=0;state.localCruise=null;state.arrivalApproach=null;
      window.nativeEnvironmentalImpacts?.explode(state,{...ship,size:Math.max(d.width,d.height)},{sourceKey:'ship:player'});
    }
    return {ok:true,destroyed:state.hull<=0,shields:state.shields,hull:state.hull};
  }
  function advance(dt){
    if(!(dt>0))return;
    const now=performance.now();
    for(const particle of particles)window.showcaseHullBurst.update(particle,dt);
    for(let i=particles.length-1;i>=0;i--)if(now-particles[i].born>=particles[i].ttl)particles.splice(i,1);
  }
  function paint(ctx,{state,ship,cx,cy,dimensions:d,asset,now=performance.now(),front=false}){
    if(flash&&now-flash.born<620&&asset){
      ctx.save();ctx.translate(cx,cy);ctx.rotate(state.angle+Math.PI/2);
      if(front)window.drawShowcaseShieldFlash(ctx,asset.art,d.width,d.height,flash,now);
      window.drawShowcaseShieldSurface(ctx,0,0,d.width,d.height,'#50d5ff',flash.charge,now,{front,refract:!front,impact:flash});
      ctx.restore();
    }
    if(front){
      ctx.save();ctx.translate(cx-ship.x,cy-ship.y);
      for(const particle of particles)window.showcaseHullBurst.draw(ctx,particle,now);
      ctx.restore();
    }
  }
  function reset(){flash=null;particles.length=0;}
  window.nativePlayerCombat={hit,visualImpact,advance,paint,reset,snapshot:()=>({flash:flash?{...flash}:null,particles:particles.length})};
})();
