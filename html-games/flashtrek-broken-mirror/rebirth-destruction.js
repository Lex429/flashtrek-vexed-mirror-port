/* Rebirth impact particle generation, drag, timestamps and pixel rendering. */
(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 450;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', pointerEvents:'none', zIndex:'4', display:'none' });
  game.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let effects = [], camera = {x:0,y:0,zoom:1}, last = 0, pending = 0, frames = 0;
  window.vexRebirthExplosionClear = () => { effects = []; ctx.clearRect(0,0,600,450); canvas.style.display='none'; };
  window.vexRebirthExplosionCamera = (x,y,zoom) => { camera = {x:Number(x),y:Number(y),zoom:Math.max(.1,Number(zoom))}; };
  window.vexRebirthExplosion = (emitters, units) => {
    const born = performance.now(); units = Number(units);
    for (const emitter of emitters) {
      const strength=emitter.strength, sparkOnly=emitter.sparksOnly;
      const nCore=sparkOnly?0:4+Math.floor(Math.random()*5*strength);
      const nSparks=sparkOnly?6+Math.floor(Math.random()*10*strength):10+Math.floor(Math.random()*14*strength);
      const parts=[];
      for(let i=0;i<nCore+nSparks;i++) {
        const core=i<nCore, a=Math.random()*Math.PI*2;
        const sp=(core?20+Math.random()*55:sparkOnly?70+Math.random()*180:90+Math.random()*220)*strength*units;
        const jitter=(core?4:3)*units;
        parts.push({x:emitter.x+(Math.random()*2-1)*jitter,y:emitter.y+(Math.random()*2-1)*jitter,
          vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
          size:(core?3+Math.floor(Math.random()*4):sparkOnly?2+Math.floor(Math.random()*3):2+Math.floor(Math.random()*4))*units,
          ttl:core?140+Math.random()*120:sparkOnly?140+Math.random()*220:120+Math.random()*220,core});
      }
      effects.push({born:born+emitter.delay,delay:emitter.delay,ttl:sparkOnly?520:420,parts});
      if(effects.length>140)effects.splice(0,effects.length-140);
    }
    canvas.style.display='block';
    if(!pending){last=performance.now();pending=requestAnimationFrame(tick);}
  };
  function tick(now) {
    pending=0;frames++;
    const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
    ctx.clearRect(0,0,600,450);
    ctx.save();ctx.beginPath();ctx.rect(0,42,600,360);ctx.clip();
    for(let i=effects.length-1;i>=0;i--) {
      const fx=effects[i],age=now-fx.born;
      if(age>=fx.ttl){effects.splice(i,1);continue;}
      for(const p of fx.parts) {
        if(age>p.ttl)continue;
        p.x+=p.vx*dt;p.y+=p.vy*dt;
        const k=Math.max(0,1-(p.core?3.6:2.8)*dt);p.vx*=k;p.vy*=k;
        // Matches Rebirth: future-born particles render at t=0.
        const t=Math.max(0,Math.min(1,age/p.ttl)),fade=1-t;
        const px=Math.round(camera.x+p.x/camera.zoom),py=Math.round(camera.y+p.y/camera.zoom);
        const size=Math.max(1,Math.round(p.size/camera.zoom));
        ctx.fillStyle=p.core?`rgba(255,140,20,${.75*fade})`:`rgba(255,210,90,${.95*fade})`;
        ctx.fillRect(px-(size>>1),py-(size>>1),size,size);
        if(p.core&&t<.45){ctx.fillStyle=`rgba(255,255,255,${.65*fade})`;ctx.fillRect(px,py,1,1);}
      }
    }
    ctx.restore();
    if(effects.length)pending=requestAnimationFrame(tick);else canvas.style.display='none';
  }
  // Read-only renderer state used by the private SWF verification callback.
  window.vexRebirthExplosionState = () => {
    const parts=[],groups=[];let particleCount=0,visible=0;const now=performance.now();
    for(const fx of effects){groups.push({delay:fx.delay,ttl:fx.ttl,count:fx.parts.length});particleCount+=fx.parts.length;
      for(const p of fx.parts){if(parts.length<128)parts.push({...p});if(now-fx.born<=p.ttl)visible++;}}
    return {groups,parts,particleCount,visible,frames};
  };
  new MutationObserver(()=>{const f=Number(game.dataset.frame);if(f!==154&&(f<157||f>182))window.vexRebirthExplosionClear();}).observe(game,{attributes:true,attributeFilter:['data-frame']});
})();
