/* The damage showcase's hull-hit burst, shared with live combat. */
(() => {
  'use strict';
  function burst(particles,point,time,units,zoom,strength=1,sparksOnly=false,delay=0) {
    const unit=units*.8*zoom,nCore=sparksOnly?0:4+Math.floor(Math.random()*5*strength),nSparks=sparksOnly?6+Math.floor(Math.random()*10*strength):10+Math.floor(Math.random()*14*strength);
    for(let i=0;i<nCore+nSparks;i++){
      const core=i<nCore,a=Math.random()*Math.PI*2,sp=(core?20+Math.random()*55:sparksOnly?70+Math.random()*180:90+Math.random()*220)*strength*unit,jitter=(core?4:3)*unit;
      particles.push({x:point.x+(Math.random()*2-1)*jitter,y:point.y+(Math.random()*2-1)*jitter,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
        size:(core?3+Math.floor(Math.random()*4):sparksOnly?2+Math.floor(Math.random()*3):2+Math.floor(Math.random()*4))*unit,
        born:time+delay,ttl:core?140+Math.random()*120:sparksOnly?140+Math.random()*220:120+Math.random()*220,core});
    }
    if(particles.length>12000)particles.splice(0,particles.length-12000);
  }
  function update(p,dt){
    p.x+=p.vx*dt;p.y+=p.vy*dt;
    const drag=Math.max(0,1-(p.core?3.6:2.8)*dt);
    p.vx*=drag;p.vy*=drag;
  }
  function draw(ctx,p,time){
    const age=time-p.born;if(age<0||age>p.ttl)return;
    const t=Math.max(0,Math.min(1,age/p.ttl)),fade=1-t,size=Math.max(1,Math.round(p.size)),x=Math.round(p.x),y=Math.round(p.y);
    ctx.fillStyle=p.core?`rgba(255,140,20,${.75*fade})`:`rgba(255,210,90,${.95*fade})`;
    ctx.fillRect(x-(size>>1),y-(size>>1),size,size);
    if(p.core&&t<.45){ctx.fillStyle=`rgba(255,255,255,${.65*fade})`;ctx.fillRect(x,y,1,1);}
  }
  window.showcaseHullBurst=Object.freeze({
    burst:(...args)=>window.nativeEffectProfiles?.emitHullBurst?window.nativeEffectProfiles.emitHullBurst(burst,...args):burst(...args),
    update:(...args)=>window.nativeEffectProfiles?.updateHullParticle?window.nativeEffectProfiles.updateHullParticle(update,...args):update(...args),
    draw:(...args)=>window.nativeEffectProfiles?.drawHullParticle?window.nativeEffectProfiles.drawHullParticle(draw,...args):draw(...args)
  });
})();
