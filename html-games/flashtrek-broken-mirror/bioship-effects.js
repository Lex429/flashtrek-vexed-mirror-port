/* Living chitin, vascular pulses and tissue rupture. All anchors use the
   registered 313 x 512 biological artwork; debris is cut from its actual pixels. */
(() => {
  'use strict';
  window.createBiologicalShipEffects=(config)=>{
  const {width:W,height:H,wounds,organs,sites}=config;
  const ruptureMs=config.ruptureMs||760;
  let burnReady=Promise.resolve();
  let frames=[],parts=[],cutAudit=[],masks=[],veinBands=[],veinPixels=[];
  const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const local=(x,y,l)=>({x:(x/W-.5)*l.w,y:(y/H-.5)*l.h});
  function prepare(images){
    frames=images;parts=[];cutAudit=[];veinBands=[];veinPixels=[];
    masks=frames.map(im=>{
      const c=make(W,H),g=c.getContext('2d');g.drawImage(im,0,0,W,H);
      g.globalCompositeOperation='source-in';g.fillStyle='#6b203d';g.fillRect(0,0,W,H);return c;
    });
    for(const im of frames){
      const c=make(W,H),g=c.getContext('2d');g.drawImage(im,0,0,W,H);
      const data=g.getImageData(0,0,W,H).data,groups=sites.map(()=>[]);let sourcePixels=0;
      if(config.vascular){
        // Extract the painted vascular network separately for travelling pulses.
        const veins=make(W,H),vg=veins.getContext('2d'),pixels=vg.createImageData(W,H);
        let matched=0;
        for(let i=0;i<data.length;i+=4){
          const [r,g,b,a]=data.subarray(i,i+4);
          if(a>80&&r>100&&g>70&&b<r*.59&&r>g*1.04&&g>r*.48){
            pixels.data.set([255,205,85,Math.round(a*.85)],i);
            matched++;
          }
        }
        vg.putImageData(pixels,0,0);
        veinPixels.push(matched);
        veinBands.push(Array.from({length:24},(_,n)=>{
          const top=Math.floor(n*H/24),bottom=Math.floor((n+1)*H/24),c=make(W,bottom-top);
          c.getContext('2d').drawImage(veins,0,top,W,bottom-top,0,0,W,bottom-top);
          const dim=make(W,bottom-top),dg=dim.getContext('2d');dg.drawImage(c,0,0);
          dg.globalCompositeOperation='source-in';dg.fillStyle='#26131d';dg.fillRect(0,0,W,bottom-top);
          return {texture:c,dim,top,h:bottom-top};
        }));
      }
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=(y*W+x)*4;if(!data[i+3])continue;sourcePixels++;
        let best=0,distance=Infinity;
        sites.forEach(([sx,sy],n)=>{
          const membrane=config.vascular?950*Math.sin(x*.065+n*1.3)*Math.cos(y*.045-n*.9):0;
          const d=(x-sx)**2+(y-sy)**2+membrane;if(d<distance){distance=d;best=n;}
        });
        groups[best].push({x,y,i});
      }
      const pieces=groups.map((pixels,n)=>{
        if(!pixels.length)return null;
        let left=W,top=H,right=0,bottom=0;
        for(const p of pixels){left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
        const w=right-left+1,h=bottom-top+1,texture=make(w,h),tg=texture.getContext('2d'),cut=tg.createImageData(w,h);
        for(const p of pixels)cut.data.set(data.subarray(p.i,p.i+4),((p.y-top)*w+p.x-left)*4);
        tg.putImageData(cut,0,0);
        return {texture,x:(left+w/2)/W-.5,y:(top+h/2)/H-.5,w:w/W,h:h/H,pixels:pixels.length,organ:n===(config.organIndex??7),phase:n*1.37};
      }).filter(Boolean);
      parts.push(pieces);cutAudit.push({sourcePixels,cutPixels:pieces.reduce((n,p)=>n+p.pixels,0),pieces:pieces.length,biological:true});
    }
    burnReady=window.wreckageEffects?.primeAll(parts.flat().map(p=>p.texture),{organic:true})||Promise.resolve();
  }
  function breathing(stage,time){
    if(config.fixedSilhouette||config.deadFinal&&stage===3)return {x:1,y:1,twitch:0};
    const t=time/1000,pulse=Math.sin(t*(stage===3?5.8:2.1));
    if(config.vascular)return {x:1+(.009+stage*.003)*Math.sin(t*(stage===3?3.8:1.6)),
      y:1-.005*Math.sin(t*1.6),twitch:stage>1?Math.sin(t*16)*Math.max(0,Math.sin(t*1.9))*(stage===3?.9:.35):0};
    return {x:1+(.005+stage*.002)*pulse,y:1-(.003+stage*.001)*pulse,
      twitch:stage>1?Math.sin(t*19)*Math.max(0,Math.sin(t*1.7))*(stage===3?.65:.25):0};
  }
  function drawBody(ctx,im,l,angle,stage,time){
    const b=breathing(stage,time);ctx.save();ctx.translate(l.x,l.y);ctx.rotate(angle);
    ctx.translate(b.twitch,0);ctx.scale(b.x,b.y);
    if(config.vascular){
      // Gentle membrane ripples preserve the shared registration and silhouette.
      for(let y=0;y<H;y+=4){const h=Math.min(4,H-y),phase=y/H;
        const shift=Math.sin(time*.0018-phase*9)*Math.sin(phase*Math.PI)*(.55+stage*.18)*l.w/W;
        ctx.drawImage(im,0,y,W,h,-l.w/2+shift,(y/H-.5)*l.h,l.w,h/H*l.h);
      }
    }else ctx.drawImage(im,-l.w/2,-l.h/2,l.w,l.h);
    ctx.restore();
  }
  function draw(ctx,l,angle,stage,time,options){
    const t=time/1000,b=breathing(stage,time),unit=l.h/H;
    ctx.save();ctx.translate(l.x,l.y);ctx.rotate(angle);ctx.translate(b.twitch,0);ctx.scale(b.x,b.y);
    if(options.lights&&!(config.deadFinal&&stage===3)){
      // Alpha-masked tissue tint stays within the living body.
      ctx.globalAlpha=.035+(.025*Math.sin(t*2.1)+.025)*(1-stage*.2);
      ctx.drawImage(masks[stage],-l.w/2,-l.h/2,l.w,l.h);ctx.globalAlpha=1;
      if(config.vascular){
        if(stage){
          ctx.globalAlpha=stage*.17;
          for(const band of veinBands[stage])ctx.drawImage(band.dim,-l.w/2,(band.top/H-.5)*l.h,l.w,band.h/H*l.h);
        }
        ctx.globalCompositeOperation='screen';
        for(const band of veinBands[stage]){
          const wave=Math.max(0,Math.sin(t*1.7-band.top/H*Math.PI*3.2))**4;
          const failing=stage===3?.25+.75*Math.max(0,Math.sin(t*3.7+band.top*.013)):1;
          ctx.globalAlpha=(.07+wave*.5)*(1-stage*.22)*failing;
          ctx.drawImage(band.texture,-l.w/2,(band.top/H-.5)*l.h,l.w,band.h/H*l.h);
        }
        ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
      }
      for(const [i,[x,y,r]] of organs.entries()){
        const p=local(x,y,l),pulse=stage===3?Math.max(0,Math.sin(t*3.7+i)*Math.sin(t*.9)):.5+.5*Math.sin(t*2.1-i*.4);
        const radius=r*unit*(.75+pulse*.3),g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
        g.addColorStop(0,'#ffd870');g.addColorStop(.35,'#aa642b');g.addColorStop(1,'#aa642b00');
        ctx.globalCompositeOperation='screen';ctx.globalAlpha=(.12+pulse*.22)*(1-stage*.23);ctx.fillStyle=g;
        ctx.beginPath();ctx.ellipse(p.x,p.y,radius*.6,radius,0,0,Math.PI*2);ctx.fill();
      }
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    }
    if(options.damage)for(const [i,[x,y,r]] of wounds[stage].entries()){
      const p=local(x,y,l),pulse=.5+.5*Math.sin(t*(2.5+stage*.7)+i*1.8),radius=r*unit;
      // The wound lips squeeze around exposed flesh rather than emitting fire.
      ctx.strokeStyle='#44101f';ctx.lineWidth=1.7*unit;ctx.globalAlpha=.4+pulse*.3;
      ctx.beginPath();ctx.ellipse(p.x,p.y,radius*(.48+pulse*.12),radius*.76,.2,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='#d76d82';ctx.lineWidth=.6*unit;ctx.globalAlpha=.22+pulse*.2;
      ctx.beginPath();ctx.ellipse(p.x+radius*.12,p.y,radius*.37,radius*.61,.2,.1,Math.PI*1.4);ctx.stroke();
      // Small membrane bubbles and viscous ribbons stay near their injury.
      for(let j=0;j<3;j++){
        const q=(t*.23+j*.33+i*.17)%1;ctx.globalAlpha=(1-q)*.65;ctx.fillStyle=j%2?'#9c415d':'#381124';
        ctx.beginPath();ctx.ellipse(p.x+Math.sin(j*4+i)*radius*.4,p.y+(q-.3)*radius,unit*(1+q),unit*(1.6+q),0,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=.65;ctx.strokeStyle='#62213a';ctx.lineWidth=1.2*unit;
      ctx.beginPath();ctx.moveTo(p.x+radius*.35,p.y+radius*.3);
      ctx.bezierCurveTo(p.x+radius*.7+Math.sin(t*3+i)*unit*2,p.y+radius,p.x+radius*.2,p.y+radius*1.4,p.x+radius*.5+Math.sin(t*2+i)*unit*2,p.y+radius*1.8);ctx.stroke();
    }
    ctx.globalAlpha=1;
    if(options.anchors){
      for(const [list,color] of [[organs,'#70e7ff'],[wounds[stage],'#ffbe68']])for(const [x,y] of list){
        const p=local(x,y,l);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.stroke();
      }
    }
    ctx.restore();
  }
  function spray(state,p,zoom=1,count=28,delay=0){
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,speed=(25+Math.random()*145)*zoom;
      state.particles.push({...p,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:(.6+Math.random()*2.4)*zoom,
        born:state.time+delay,ttl:1000+Math.random()*1400,realistic:'bio-fluid',phase:a,color:i%3?'#70243e':'#b15c70'});
    }
  }
  function stageRupture(state,before,after,world,zoom){
    if(after<=before)return;
    for(let s=before+1;s<=after;s++)for(const [x,y] of wounds[s])spray(state,world({x:x/W-.5,y:y/H-.5}),zoom,12);
  }
  function emit(state,l,world,stage,zoom){
    if(config.deadFinal)stage=3;
    const born=state.time,rupture=born+ruptureMs;
    state.bioDeath={born,rupture,stage,angle:state.angle,layout:{...l}};
    state.particles=[];state.debris=[];
    for(const [i,piece] of parts[stage].entries()){
      const p=world(piece),a=Math.atan2(p.y-l.y,p.x-l.x)+(Math.random()-.5)*.5,speed=(45+Math.random()*100)*zoom;
      state.debris.push({...piece,...p,w:piece.w*l.w,h:piece.h*l.h,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
        angle:state.angle,spin:(Math.random()-.5)*2,born:rupture,ttl:6200+Math.random()*1700,
        sourceStage:stage,dead:!!config.deadFinal,biological:true,cthia:true,farTravel:i%3===0,trailAt:rupture,zoom});
      spray(state,p,zoom,config.vascular?26:18,ruptureMs);
    }
    for(let i=0;i<38;i++){
      const a=Math.random()*Math.PI*2,v=(18+Math.random()*70)*zoom;
      state.particles.push({x:l.x,y:l.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,size:(9+Math.random()*21)*zoom,
        born:rupture+i*8,ttl:1900+Math.random()*1200,realistic:'bio-spore',phase:a});
    }
  }
  function drawDeath(ctx,state){
    const d=state.bioDeath;if(!d)return;const age=state.time-d.born;if(age<0||state.time>=d.rupture)return;
    const t=age/ruptureMs,l=d.layout;ctx.save();ctx.translate(l.x,l.y);ctx.rotate(d.angle);
    ctx.translate(Math.sin(age*.055)*t*2,0);
    const squeeze=config.deadFinal?-t*.16:config.vascular?(t<.3?-.12*Math.sin(t/.3*Math.PI):.19*Math.sin((t-.3)/.7*Math.PI)):Math.sin(t*Math.PI)*.13;
    ctx.scale(1+squeeze,1-squeeze*.42);
    ctx.drawImage(frames[d.stage],-l.w/2,-l.h/2,l.w,l.h);
    ctx.globalAlpha=.15+t*.25;ctx.drawImage(masks[d.stage],-l.w/2,-l.h/2,l.w,l.h);ctx.restore();
  }
  function drawParticle(ctx,p,time){
    const age=time-p.born;if(age<0||age>=p.ttl)return;const t=age/p.ttl;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.globalAlpha=(1-t)**1.4;
    if(p.realistic==='bio-spore'){
      const r=p.size*(.7+t*1.8),g=ctx.createRadialGradient(0,0,0,0,0,r);
      g.addColorStop(0,'#71394e80');g.addColorStop(.45,'#49243750');g.addColorStop(1,'#24152a00');
      ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,r,r*.7,0,0,Math.PI*2);ctx.fill();
    }else{
      ctx.fillStyle=p.color||'#70243e';ctx.beginPath();ctx.ellipse(0,0,p.size*(1.4+1-t),p.size*.65,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#d896a0';ctx.globalAlpha*=.35;ctx.beginPath();ctx.ellipse(-p.size*.3,-p.size*.15,p.size*.5,p.size*.15,0,0,Math.PI*2);ctx.fill();
    }ctx.restore();
  }
  function drawWreck(ctx,p,time){
    const t=(time-p.born)/1000;ctx.save();ctx.scale(p.dead?1:1+.025*Math.sin(t*8+p.phase)*Math.exp(-t*.6),1);
    if(!window.wreckageEffects?.draw(ctx,p.texture,p.w,p.h,time-p.born,{organic:true}))ctx.drawImage(p.texture,-p.w/2,-p.h/2,p.w,p.h);
    // Trailing sinews retract and lose motion as the detached organ dies.
    ctx.strokeStyle='#702b43';ctx.lineWidth=Math.max(.6,p.zoom);ctx.globalAlpha*=.85;
    for(let i=0;i<3;i++){
      const x=(i-1)*p.w*.13,y=p.h*.17,len=(8+i*4)*p.zoom*(1+Math.exp(-t));
      ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+Math.sin(t*6+i)*len*.4,y+len*.4,x-len*.2,y+len*.8,x+Math.sin(t*3+i)*len*.3,y+len);ctx.stroke();
    }ctx.restore();
  }
  function updateTrails(state){
    for(const p of state.debris){
      if(!p.biological||state.time<p.born||state.time-p.born>2300||state.time<p.trailAt)continue;
      p.trailAt=state.time+170;
      state.particles.push({x:p.x,y:p.y,vx:-p.vx*.08,vy:-p.vy*.08,size:p.zoom,born:state.time,ttl:950,
        realistic:'bio-fluid',color:'#542039'});
    }
  }
  function updateLiving(state,world,stage,zoom,options){
    if(!(config.vascular||config.deadFinal)||(config.deadFinal&&stage===3)||state.destroyed||state.cloaked||!options.damage||!stage||state.time<(state.bioLeakAt||0))return;
    state.bioLeakAt=state.time+430;
    for(const [x,y] of wounds[stage]){
      const p=world({x:x/W-.5,y:(y+7)/H-.5});
      state.particles.push({...p,vx:(Math.random()-.5)*7*zoom,vy:(12+Math.random()*10)*zoom,
        size:1.1*zoom,born:state.time,ttl:1100,realistic:'bio-fluid',color:'#743148'});
    }
  }
  const snapshot=(s,time,o)=>({biological:true,lights:o.lights&&!(config.deadFinal&&s===3)?organs.length:0,damageSites:o.damage?wounds[s].length:0,
    breathing:breathing(s,time),vascular:!!config.vascular,vascularPixels:veinPixels[s]||0,veinPulse:o.lights&&config.vascular?(.5+.5*Math.sin(time*.0017)):0,
    dead:!!config.deadFinal&&s===3,internalGlow:config.deadFinal?(s===3?0:[1,.6,.18][s]):null,organs:o.lights&&!(config.deadFinal&&s===3)?organs.length:0,activeWounds:o.damage?wounds[s].length:0});
  const effects=Object.freeze({draw,snapshot,unlitFrame:im=>{
    const c=make(W,H);c.getContext('2d').drawImage(im,0,0,W,H);return c;
  }});
  return Object.freeze({prepare,get ready(){return burnReady;},drawBody,drawDeath,emit,spray,stageRupture,drawParticle,drawWreck,updateTrails,updateLiving,effects,audit:()=>cutAudit});
  };
  const config={width:313,height:512,
    wounds:[[],[[197,92,13]],[[197,92,18],[190,207,12],[211,310,17]],[[198,92,22],[186,200,16],[209,305,23],[166,423,20],[285,315,9]]],
    organs:[[146,94,9],[170,94,9],[157,163,7],[147,246,6],[168,246,6],[157,361,11]],
    sites:[[157,63],[116,116],[199,116],[157,213],[157,291],[65,313],[248,313],[157,365],[125,429],[184,429],[157,482]]};
  window.bioshipEffects=window.createBiologicalShipEffects(config);
  window.starterShips.set(55,{width:config.width,height:config.height,biological:true,effects:window.bioshipEffects.effects,
    biology:window.bioshipEffects,align:im=>im,breakAnchors:config.wounds[3].map(([x,y])=>[x,y])});
})();
