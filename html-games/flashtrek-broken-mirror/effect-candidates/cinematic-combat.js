/* Optional shared weapon/hull presentation. No firing, damage or saved state. */
(() => {
  'use strict';
  const ID='cinematic-combat-v1',sprites=new Map(),MAX_SPRITES=24,SIZE=64,canvases=new WeakMap(),pipelines=new Set();
  const stats={beamPaints:0,torpedoPaints:0,boltPaints:0,hullEvents:0,hullParticles:0,spriteBuilds:0};
  const tint=value=>'#'+(Number(value)>>>0).toString(16).padStart(6,'0').slice(-6);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function light(colour){
    let canvas=sprites.get(colour);
    if(canvas){sprites.delete(colour);sprites.set(colour,canvas);return canvas;}
    if(sprites.size>=MAX_SPRITES)sprites.delete(sprites.keys().next().value);
    canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;const g=canvas.getContext('2d');
    const gradient=g.createRadialGradient(SIZE/2,SIZE/2,0,SIZE/2,SIZE/2,SIZE/2);
    gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.06,'#fff8e9');gradient.addColorStop(.20,colour+'d0');
    gradient.addColorStop(.5,colour+'30');gradient.addColorStop(1,colour+'00');g.fillStyle=gradient;g.fillRect(0,0,SIZE,SIZE);
    sprites.set(colour,canvas);stats.spriteBuilds++;return canvas;
  }
  function glow(ctx,x,y,rx,ry,colour,alpha){
    ctx.globalAlpha=alpha;ctx.drawImage(light(colour),x-rx,y-ry,rx*2,ry*2);
  }
  function line(ctx,x,y,ex,ey,width,colour,alpha){
    ctx.globalAlpha=alpha;ctx.strokeStyle=colour;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();
  }
  function drawWeapon(base,ctx,shot){
    if(!['beam','torpedo','disruptor'].includes(shot.kind))return base(ctx,shot);
    if(canvases.get(ctx.canvas)?.weapon(ctx,shot)){stats[shot.kind==='beam'?'beamPaints':shot.kind==='torpedo'?'torpedoPaints':'boltPaints']++;return;}
    const colour=tint(shot.color),zoom=shot.zoom??1,unit=(shot.units||.91976)*zoom;
    const age=Math.max(0,shot.age||0),duration=Math.max(1,shot.duration||180),progress=clamp(age/duration,0,1),seed=shot.seed||0;
    const envelope=(shot.kind==='beam'?1-Math.pow(progress,4):1)*(.90+.10*Math.sin(age*.12+seed*4.));
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.shadowBlur=0;
    if(shot.kind==='beam'){
      stats.beamPaints++;
      const w=Math.max(.45,(shot.thickness||1)*unit*.43),dx=shot.x2-shot.x1,dy=shot.y2-shot.y1,length=Math.hypot(dx,dy);
      // A hot continuous core with a subdued sheath; no animated zigzag tube.
      line(ctx,shot.x1,shot.y1,shot.x2,shot.y2,w*4.6,colour,.055*envelope);
      line(ctx,shot.x1,shot.y1,shot.x2,shot.y2,w*2.1,colour,.20*envelope);
      line(ctx,shot.x1,shot.y1,shot.x2,shot.y2,w,colour,.86*envelope);
      line(ctx,shot.x1,shot.y1,shot.x2,shot.y2,Math.max(.22,w*.27),'#fff6df',.94*envelope);
      if(length>1){
        const front=clamp(age/28,0,1),tail=clamp(front-.075,0,1);
        line(ctx,shot.x1+dx*tail,shot.y1+dy*tail,shot.x1+dx*front,shot.y1+dy*front,w*.48,'#fff',envelope*.65);
      }
      glow(ctx,shot.x1,shot.y1,Math.max(2,w*3.2),Math.max(2,w*3.2),colour,.8*envelope);
    }else{
      const torpedo=shot.kind==='torpedo';stats[torpedo?'torpedoPaints':'boltPaints']++;
      const radius=(torpedo?4.2:1.8)*unit,theta=shot.angle||0;
      const dx=Math.cos(theta),dy=Math.sin(theta),length=(torpedo?16:21)*unit;
      const pulse=.94+.06*Math.sin(age*.048+seed*9.);
      line(ctx,shot.x-dx*length,shot.y-dy*length,shot.x,shot.y,radius*2.8,colour,.07*envelope);
      line(ctx,shot.x-dx*length*.72,shot.y-dy*length*.72,shot.x,shot.y,radius,colour,.53*envelope);
      line(ctx,shot.x-dx*length*.38,shot.y-dy*length*.38,shot.x,shot.y,Math.max(.3,radius*.30),'#fff6e8',.91*envelope);
      glow(ctx,shot.x,shot.y,radius*(torpedo?3.5:2.6)*pulse,radius*(torpedo?3.5:2.6)*pulse,colour,.68*envelope);
      ctx.translate(shot.x,shot.y);ctx.rotate(theta);ctx.globalAlpha=envelope;ctx.fillStyle='#fffcf0';
      ctx.beginPath();ctx.ellipse(0,0,radius*(torpedo?1:.7),radius*(torpedo?.70:.44),0,0,Math.PI*2);ctx.fill();
      if(torpedo){
        // A faint rotating hot patch gives the plasma core depth without a star polygon.
        ctx.rotate((shot.spin||0)*.43);glow(ctx,radius*.24,0,radius*.52,radius*.32,'#fff1c4',.75*envelope);
      }
    }
    ctx.restore();
  }
  function emitHullBurst(base,particles,point,time,units,zoom,strength=1,sparksOnly=false,delay=0){
    stats.hullEvents++;
    const unit=units*.8*zoom,power=clamp(strength,.25,3),n=point.normal||{x:0,y:0};
    const directional=Math.hypot(n.x,n.y)>.0001,normal=Math.atan2(n.y,n.x);
    const count=(sparksOnly?6:9)+Math.floor(Math.random()*3*power);
    const add=(kind,angle,speed,ttl,size)=>{
      const vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed;
      particles.push({effectOwner:ID,kind,core:kind==='flash',x:point.x,y:point.y,startX:point.x,startY:point.y,
        vx,vy,initialVX:vx,initialVY:vy,elapsed:0,drag:kind==='chip'?1.2:2.2,size,born:time+delay,ttl,
        spin:(Math.random()-.5)*12,angle:Math.random()*Math.PI*2,heat:.78+Math.random()*.22});stats.hullParticles++;
    };
    if(!sparksOnly)add('flash',normal,0,100+Math.random()*45,(6+power*3)*unit);
    for(let i=0;i<count;i++){
      const chip=!sparksOnly&&i<2,angle=directional?normal+(Math.random()-.5)*(chip?2.1:2.7):Math.random()*Math.PI*2;
      add(chip?'chip':'spark',angle,(chip?25+Math.random()*55:85+Math.random()*190)*unit*Math.sqrt(power),
        chip?250+Math.random()*280:110+Math.random()*210,(chip?1.2+Math.random():.45+Math.random()*.45)*unit);
    }
    // Match the established shared burst budget; expiry remains in its owner.
    if(particles.length>12000)particles.splice(0,particles.length-12000);
  }
  function updateHullParticle(base,p,dt){
    if(p.effectOwner!==ID)return base(p,dt);
    p.elapsed+=dt;const fade=Math.exp(-p.drag*p.elapsed),travel=(1-fade)/p.drag;
    p.x=p.startX+p.initialVX*travel;p.y=p.startY+p.initialVY*travel;p.vx=p.initialVX*fade;p.vy=p.initialVY*fade;
  }
  function drawHullParticle(base,ctx,p,time){
    if(p.effectOwner!==ID)return base(ctx,p,time);
    if(canvases.get(ctx.canvas)?.hull(ctx,p,time))return;
    const age=time-p.born;if(age<0||age>=p.ttl)return;
    const t=age/p.ttl,fade=(1-t)*(1-t),colour=p.kind==='flash'?'#ffb34b':t<.4?'#ffd590':'#ff782c';
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.shadowBlur=0;ctx.lineCap='round';
    if(p.kind==='flash'){
      glow(ctx,p.x,p.y,p.size*(.60+t*.7),p.size*(.60+t*.7),colour,fade*.72);
      glow(ctx,p.x,p.y,p.size*.24,p.size*.24,'#fff0ca',fade);
    }else if(p.kind==='chip'){
      ctx.translate(p.x,p.y);ctx.rotate(p.angle+p.spin*age*.001);ctx.globalAlpha=fade*p.heat;
      ctx.fillStyle=colour;ctx.fillRect(-p.size*.6,-p.size*.35,p.size*1.2,p.size*.7);
      glow(ctx,0,0,p.size*2.1,p.size*2.1,colour,fade*.26);
    }else{
      const speed=Math.max(.001,Math.hypot(p.vx,p.vy)),tail=Math.min(9*p.size,speed*.014)*(1-t*.6);
      const x=p.x-p.vx/speed*tail,y=p.y-p.vy/speed*tail;
      line(ctx,x,y,p.x,p.y,Math.max(.35,p.size*2),colour,fade*.24);
      line(ctx,x,y,p.x,p.y,Math.max(.2,p.size*.6),'#fff2d1',fade*p.heat);
    }
    ctx.restore();
  }
  window.nativeEffectProfiles.extend(ID,'cinematic-shields-v1',parent=>({drawWeapon,emitHullBurst,updateHullParticle,drawHullParticle,
    queueShipLight:(ctx,asset,width,height,light)=>canvases.get(ctx.canvas)?.light(ctx,asset,width,height,light)||false,
    async createShield(factory,options){
      const base=await parent.createShield(factory,options);if(!options.sourceCanvas)return base;
      let pipeline;try{pipeline=window.createVexedCinematicPrimitives(base,options);}catch(error){base.destroy();throw error;}
      pipelines.add(pipeline);canvases.set(options.sourceCanvas,pipeline);let disposed=false;
      return Object.freeze({...base,beginFrame:()=>pipeline.begin(),setPresentationMode:value=>pipeline.mode(value),
        render(time,settings={}){let activeLights=0;const result=base.render(time,{...settings,beforeEffects:()=>{activeLights=pipeline.renderLights(settings.effects);}}),activePrimitives=pipeline.render(settings.effects);return {...result,activePrimitives:activePrimitives+activeLights,drawCalls:result.drawCalls+(activePrimitives?1:0)+(activeLights?1:0)};},
        snapshot(){const shared=base.snapshot(),extra=pipeline.snapshot();return {...shared,...extra,primitiveImplementation:ID,drawCalls:shared.drawCalls+extra.primitiveDrawCalls+extra.lightDrawCalls,bufferBytes:shared.bufferBytes+extra.primitiveBufferBytes+extra.lightBufferBytes,textureBytes:shared.textureBytes+extra.lightTextureBytes,maxTextureBytes:shared.maxTextureBytes+extra.lightTextureBytes};},
        destroy(){if(disposed)return;disposed=true;pipelines.delete(pipeline);if(canvases.get(options.sourceCanvas)===pipeline)canvases.delete(options.sourceCanvas);pipeline.destroy();base.destroy();}
      });
    },
    metrics:()=>({...stats,sprites:sprites.size,spriteBytes:sprites.size*SIZE*SIZE*4,maxSpriteBytes:MAX_SPRITES*SIZE*SIZE*4,
      gpuWeaponPaints:[...pipelines].reduce((n,p)=>n+p.snapshot().gpuWeaponPaints,0),gpuHullPaints:[...pipelines].reduce((n,p)=>n+p.snapshot().gpuHullPaints,0)})}));
})();
