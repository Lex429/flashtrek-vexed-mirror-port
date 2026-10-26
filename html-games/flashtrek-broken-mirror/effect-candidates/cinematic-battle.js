/* Candidate presentation only. Shared combat owns trajectories and damage. */
(() => {
 'use strict';
 const ID='cinematic-battle-v2',canvases=new WeakMap(),pipelines=new Set();
 const counters={hullEvents:0,hullParticles:0,canvasHullPaints:0};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function emitHullBurst(base,particles,point,time,units,zoom,strength=1,sparksOnly=false,delay=0){
  counters.hullEvents++;
  const relative=Number.isFinite(point.damage)?point.damage/Math.max(1,point.capacity):.12;
  const power=clamp(strength*(.65+Math.sqrt(relative)*1.8),.35,2.3),unit=units*.8*zoom;
  const n=point.normal||{x:0,y:0},directional=Math.hypot(n.x,n.y)>.001,normal=Math.atan2(n.y,n.x);
  const add=(kind,angle,speed,ttl,size)=>{
   const vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed;
   particles.push({effectOwner:ID,kind,core:kind==='flash',x:point.x,y:point.y,startX:point.x,startY:point.y,
    initialVX:vx,initialVY:vy,vx,vy,elapsed:0,drag:kind==='chip'?.35:1.7,size,born:time+delay,ttl,
    angle:Math.random()*Math.PI*2,spin:(Math.random()-.5)*16,heat:.8+Math.random()*.2});counters.hullParticles++;
  };
  if(!sparksOnly)add('flash',normal,0,65+Math.random()*40,(5+power*3)*unit);
  const count=(sparksOnly?7:10)+Math.floor(power*2);
  for(let i=0;i<count;i++){
   const chip=!sparksOnly&&i<2,angle=directional?normal+(Math.random()-.5)*(chip?2.1:2.7):Math.random()*Math.PI*2;
   add(chip?'chip':'spark',angle,(chip?30+Math.random()*60:110+Math.random()*210)*unit*Math.sqrt(power),
    chip?260+Math.random()*260:260+Math.random()*220,(chip?.9+Math.random()*.65:.65+Math.random()*.50)*unit);
  }
  // Existing shared budget. Expiry, contact and simulation time keep their owner.
  if(particles.length>12000)particles.splice(0,particles.length-12000);
 }
 function updateHullParticle(base,p,dt){
  if(p.effectOwner!==ID)return base(p,dt);
  p.elapsed+=dt;const fade=Math.exp(-p.drag*p.elapsed),travel=(1-fade)/p.drag;
  p.x=p.startX+p.initialVX*travel;p.y=p.startY+p.initialVY*travel;p.vx=p.initialVX*fade;p.vy=p.initialVY*fade;
 }
 function drawHullParticle(base,ctx,p,time){
  if(p.effectOwner!==ID)return base(ctx,p,time);
  const age=time-p.born;if(age<0||age>=p.ttl)return;
  if(window.nativeEffectProfiles.queueHullParticle(ctx,p,time))return;
  counters.canvasHullPaints++;const t=age/p.ttl,fade=(1-t)**1.5;
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.shadowBlur=0;ctx.globalAlpha=fade*p.heat;
  const color=t<.2?'#fff3cf':t<.55?'#ffc150':'#ed5019';ctx.fillStyle=ctx.strokeStyle=color;
  if(p.kind==='flash'){ctx.globalAlpha*=.5;ctx.beginPath();ctx.arc(p.x,p.y,p.size*(1+t),0,Math.PI*2);ctx.fill();}
  else{const speed=Math.hypot(p.vx,p.vy)||1,tail=Math.min(p.size*(p.kind==='chip'?4:22),speed*.065)*(1-t*.35);
   ctx.lineWidth=Math.max(.7,p.size*.65);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x-p.vx/speed*tail,p.y-p.vy/speed*tail);ctx.lineTo(p.x,p.y);ctx.stroke();}
  ctx.restore();
 }
 window.nativeEffectProfiles.extend(ID,'cinematic-weapons-v1',parent=>({
  emitHullBurst,updateHullParticle,drawHullParticle,
  drawWeapon(base,ctx,s){if(window.nativeEffectProfiles.queueWeapon(ctx,s))return;return parent.drawWeapon(base,ctx,s);},
  queueShipSurface:(ctx,...args)=>canvases.get(ctx.canvas)?.surface(ctx,...args)||false,
  queueImpact(ctx,event){const accepted=parent.queueImpact(ctx,event);if(accepted){const m=ctx.getTransform(),x=m.a*event.x+m.c*event.y+m.e,y=m.b*event.x+m.d*event.y+m.f;
    canvases.get(ctx.canvas)?.source(x,y,x,y,65,event.color??0xffbf61,Math.exp(-event.age/70)*.35*(event.strength||1));}return accepted;},
  queueHullParticle(ctx,p,time){const accepted=parent.queueHullParticle(ctx,p,time);
   if(accepted&&p.kind==='flash'&&time>=p.born&&time<p.born+p.ttl){const m=ctx.getTransform(),scale=Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));
    const x=m.a*p.x+m.c*p.y+m.e,y=m.b*p.x+m.d*p.y+m.f;
    canvases.get(ctx.canvas)?.source(x,y,x,y,p.size*7*scale,0xffa642,(1-(time-p.born)/p.ttl)**2*.7);
   }return accepted;},
  queueWeapon(ctx,s,matrix){const accepted=parent.queueWeapon(ctx,s,matrix);if(accepted)canvases.get(ctx.canvas)?.weapon(ctx,s,matrix);return accepted;},
  async createShield(factory,options){
   const base=await parent.createShield(factory,{...options,battle:true,weaponAware:true});if(!options.sourceCanvas)return base;
   let radiance;try{radiance=window.createVexedBattleRadiance(base,options);}catch(error){base.destroy();throw error;}
   canvases.set(options.sourceCanvas,radiance);pipelines.add(radiance);let disposed=false;
   return Object.freeze({...base,
    queueImpact(event){const accepted=base.queueImpact(event);if(accepted)radiance.source(event.x,event.y,event.x,event.y,65,event.color??0x64bdff,Math.exp(-event.age/70)*.3*(event.strength||1));return accepted;},
    beginFrame(){base.beginFrame();radiance.begin();},setPresentationMode(v){base.setPresentationMode(v);radiance.mode(v);},
    render(time,settings={}){let illuminated=0;const result=base.render(time,{...settings,beforeEffects:()=>{
      settings.beforeEffects?.();if(settings.effects)illuminated=radiance.render();
     }});return {...result,activePrimitives:result.activePrimitives+illuminated,drawCalls:result.drawCalls+(illuminated?1:0)};},
    snapshot(){const b=base.snapshot(),r=radiance.snapshot();return {...b,...r,primitiveImplementation:ID,
     drawCalls:b.drawCalls+r.radianceDrawCalls,primitiveRejected:b.primitiveRejected+r.radianceRejected,
     bufferBytes:b.bufferBytes+r.radianceBufferBytes,textureBytes:b.textureBytes+r.radianceTextureBytes,maxTextureBytes:b.maxTextureBytes+r.radianceTextureBytes};},
    destroy(){if(disposed)return;disposed=true;pipelines.delete(radiance);if(canvases.get(options.sourceCanvas)===radiance)canvases.delete(options.sourceCanvas);radiance.destroy();base.destroy();}
   });
  },metrics:()=>({...parent.metrics(),...counters,battleAppearance:ID,
   radianceSourcePeak:Math.max(0,...[...pipelines].map(p=>p.snapshot().radianceSourcePeak))})
 }));
})();
