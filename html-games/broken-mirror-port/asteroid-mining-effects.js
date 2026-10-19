/* Asteroid mining visuals adapted from the damage showcase's image-cut sequence. */
(() => {
  'use strict';
  const cache=new WeakMap(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function artwork(image){
    if(cache.has(image))return cache.get(image);
    const w=Math.min(512,image.naturalWidth),h=Math.round(image.naturalHeight*w/image.naturalWidth),canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;const g=canvas.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0,w,h);
    const alpha=g.getImageData(0,0,w,h).data;
    let left=w,top=h,right=0,bottom=0;
    for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2)if(alpha[(y*w+x)*4+3]>90){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    if(right<=left||bottom<=top){left=0;top=0;right=w-1;bottom=h-1;}
    const cuts={x0:left/w,x1:right/w,bases:[.26,.5,.74].map(f=>(top+(bottom-top)*f)/h-.5),wave:Math.min(.06,(bottom-top)/h*.07)};
    const cut=(pass,f)=>{const i=f*28;return{x:f-.5,y:cuts.bases[pass]+cuts.wave*Math.sin(i*.57)+cuts.wave*.3*Math.sin(i*1.61)};};
    const pieces=[],heat=[];
    for(let row=0;row<4;row++){
      const piece=document.createElement('canvas');piece.width=w;piece.height=h;const p=piece.getContext('2d',{willReadFrequently:true});p.beginPath();
      const at=(pass,i)=>{const q=cut(pass,i/28);return{x:(q.x+.5)*w,y:(q.y+.5)*h};};
      if(row===0){p.moveTo(0,0);p.lineTo(w,0);p.lineTo(w,at(0,28).y);for(let i=28;i>=0;i--){const q=at(0,i);p.lineTo(q.x,q.y);}}
      else if(row===3){p.moveTo(0,h);p.lineTo(w,h);p.lineTo(w,at(2,28).y);for(let i=28;i>=0;i--){const q=at(2,i);p.lineTo(q.x,q.y);}}
      else{p.moveTo(0,at(row-1,0).y);for(let i=1;i<=28;i++){const q=at(row-1,i);p.lineTo(q.x,q.y);}p.lineTo(w,at(row,28).y);for(let i=28;i>=0;i--){const q=at(row,i);p.lineTo(q.x,q.y);}}
      p.closePath();p.clip();p.drawImage(canvas,0,0);pieces.push(piece);
      const hot=document.createElement('canvas');hot.width=w;hot.height=h;const hg=hot.getContext('2d');hg.drawImage(piece,0,0);hg.globalCompositeOperation='source-atop';hg.fillStyle='#ff5b16';hg.fillRect(0,0,w,h);heat.push(hot);
    }
    const outline=document.createElement('canvas');outline.width=w;outline.height=h;
    const og=outline.getContext('2d');og.shadowColor='#49c9ff';og.shadowBlur=Math.max(3,w*.012);og.drawImage(canvas,0,0);og.globalCompositeOperation='destination-out';og.shadowBlur=0;og.drawImage(canvas,0,0);
    const result={image,w,h,alpha,cuts,cut,pieces,heat,outline};cache.set(image,result);return result;
  }
  function solid(data,x,y,scale=1){
    const ix=Math.round((x/scale+.5)*(data.w-1)),iy=Math.round((y/scale+.5)*(data.h-1));
    return ix>=0&&ix<data.w&&iy>=0&&iy<data.h&&data.alpha[(iy*data.w+ix)*4+3]>60;
  }
  function partSamples(piece){
    const w=piece.width,h=piece.height,ctx=piece.getContext('2d',{willReadFrequently:true}),pixels=ctx.getImageData(0,0,w,h).data,result=[];
    const step=Math.max(3,Math.floor(Math.max(w,h)/38));
    for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step)if(pixels[(y*w+x)*4+3]>70)result.push({x:x/w-.5,y:y/h-.5});
    return result;
  }
  function seamTexture(data,pass,row,preview){
    const canvas=document.createElement('canvas');canvas.width=data.w;canvas.height=data.h;
    const g=canvas.getContext('2d'),pixelScale=data.w/preview;
    g.beginPath();for(let i=0;i<=28;i++){const q=data.cut(pass,i/28),x=(q.x+.5)*data.w,y=(q.y+.5)*data.h;if(i)g.lineTo(x,y);else g.moveTo(x,y);}
    g.strokeStyle='rgba(255,113,35,.55)';g.lineWidth=3*pixelScale;g.shadowColor='#ff8b39';g.shadowBlur=9*pixelScale;g.stroke();
    g.strokeStyle='#fff0b7';g.lineWidth=.9*pixelScale;g.shadowBlur=3*pixelScale;g.stroke();
    g.globalCompositeOperation='destination-in';g.shadowBlur=0;g.drawImage(data.pieces[row],0,0);
    return canvas;
  }
  function create(image,rock,now){
    const data=artwork(image),preview=Math.min(235,Math.max(data.w,data.h)),unit=rock.size/preview,a=rock.angle,normal={x:-.1*Math.cos(a)-Math.sin(a),y:-.1*Math.sin(a)+Math.cos(a)},tangent={x:Math.cos(a)-.1*Math.sin(a),y:Math.sin(a)+.1*Math.cos(a)};
    data.samples||=data.pieces.map(partSamples);
    const parts=data.pieces.map((piece,index)=>{const side=index-1.5,speed=(18+Math.abs(side)*8+Math.random()*8)*unit,lateral=(Math.random()-.5)*9*unit;return{x:0,y:0,vx:normal.x*side*speed+tangent.x*lateral,vy:normal.y*side*speed+tangent.y*lateral,rotation:0,spin:(Math.random()-.5)*.2,samples:data.samples[index]};});
    const trail=document.createElement('canvas');trail.width=data.w;trail.height=data.h;
    const arcs=document.createElement('canvas');arcs.width=data.w;arcs.height=data.h;
    const seams=data.seams||=(Array.from({length:3},(_,pass)=>[pass,pass+1].map(row=>({row,image:seamTexture(data,pass,row,preview)}))));
    return{data,parts,clock:now,ripples:[],trail,arcs,seams,unit,preview};
  }
  function sweep(data,age){
    const elapsed=Math.max(0,age-500),duration=1050,span=1200,pass=Math.min(2,Math.floor(elapsed/span));
    const raw=elapsed>=span*2+duration?1:clamp((elapsed-pass*span)/duration,0,1),ease=.5-.5*Math.cos(Math.PI*raw),progress=pass%2?1-ease:ease;
    return{pass,raw,ease,point:data.cut(pass,data.cuts.x0+(data.cuts.x1-data.cuts.x0)*progress)};
  }
  function draw(ctx,m,{x,y,source,zoom,now,w=Infinity,h=Infinity}){
    const age=now-m.born,rock=m.rock;
    const damage=rock.oreType==='deuranium'?Math.max(Number(m.state?.asteroidDamage?.[rock.slotId])||0,rock.maxHull*.75*clamp(age/6000,0,1)):0;
    const im=window.nativeSolAsteroids.image(damage?window.nativeSolAsteroids.frame(rock,damage):rock.file);
    if(!im.complete||!im.naturalWidth)return;
    const visible=window.nativeEffectVisibility?.mining(x,y,source,rock.size,{w,h})??true;
    // Avoid image sampling and texture construction for unseen mining effects.
    if(!visible&&!m.effect)return;
    if(!m.effect||m.effect.data.image!==im)m.effect=create(im,rock,now);
    const effect=m.effect,{data,parts,unit,preview}=effect,size=rock.size,heatAge=age-3950,pressure=clamp(heatAge/3600,0,1),ease=pressure*pressure*(3-2*pressure),shieldScale=1.05-.43*ease;
    const dt=clamp((now-effect.clock)/1000,0,.06);effect.clock=now;
    for(let row=0;row<4;row++){
      const release=[1550,2750,3950,3950][row],p=parts[row];if(age<release||heatAge>=0)continue;
      const next={x:p.x+p.vx*dt,y:p.y+p.vy*dt,rotation:p.rotation+p.spin*dt};
      const ca=Math.cos(rock.angle+next.rotation),sa=Math.sin(rock.angle+next.rotation),baseC=Math.cos(rock.angle),baseS=Math.sin(rock.angle);
      const inside=p.samples.every(q=>{const wx=next.x+(q.x*ca-q.y*sa)*size,wy=next.y+(q.x*sa+q.y*ca)*size;return solid(data,(wx*baseC+wy*baseS)/size,(-wx*baseS+wy*baseC)/size,shieldScale*1.05);});
      if(inside){Object.assign(p,next);}else{p.vx*=-.35;p.vy*=-.35;p.spin*=-.4;effect.ripples.push({x:x+p.x,y:y+p.y,born:now});}
    }
    effect.ripples=effect.ripples.filter(r=>now-r.born<520);
    if(!visible)return;
    const gather=1-.86*pressure,scale=1-.4*pressure,drain=clamp((clamp(heatAge/4400,0,1)-.16)/.72,0,1),oreGrowth=clamp((age-7150)/800,0,1),rockFade=1-clamp(oreGrowth/.22,0,1);
    for(let i=0;i<4;i++){
      const p=parts[i],offsetX=p.x*gather,offsetY=p.y*gather;
      ctx.save();ctx.translate(x+offsetX,y+offsetY);ctx.rotate(rock.angle+p.rotation);ctx.scale(scale,scale);ctx.globalAlpha=(1-.78*drain)*rockFade;
      ctx.drawImage(data.pieces[i],-size/2,-size/2,size,size);
      if(heatAge>0){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(heatAge/4400,0,1)*.52*rockFade;ctx.shadowColor='#ff5418';ctx.shadowBlur=6*unit;ctx.drawImage(data.heat[i],-size/2,-size/2,size,size);}
      ctx.restore();
    }
    // Cut seams follow the same three image-derived sine paths as the showcase.
    const cutCount=age<1550?0:age<2750?1:age<3950?2:3;
    if(cutCount&&rockFade>0)for(let pass=0;pass<cutCount;pass++)for(const seam of effect.seams[pass]){
      const p=parts[seam.row];ctx.save();ctx.translate(x+p.x*gather,y+p.y*gather);ctx.rotate(rock.angle+p.rotation);ctx.scale(scale,scale);
      ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.pow(1-clamp(heatAge/2200,0,1),2)*rockFade;
      ctx.drawImage(seam.image,-size/2,-size/2,size,size);ctx.restore();
    }
    // The shield outline is generated from the asteroid alpha, as in the showcase.
    ctx.save();ctx.translate(x,y);ctx.rotate(rock.angle);ctx.globalCompositeOperation='lighter';
    const outlineScale=Math.max(shieldScale,age>=7150?.70:0)*(1+.008*Math.sin(now*.012)*pressure);
    ctx.globalAlpha=(.48+.12*Math.sin(now*.006))*(1-pressure);ctx.drawImage(data.outline,-size*.525*outlineScale,-size*.525*outlineScale,size*1.05*outlineScale,size*1.05*outlineScale);
    ctx.globalAlpha=(.25+.35*pressure)*(.72+.28*Math.sin(now*.018));ctx.filter=`hue-rotate(${195*pressure}deg) saturate(1.6)`;ctx.drawImage(data.outline,-size*.525*outlineScale,-size*.525*outlineScale,size*1.05*outlineScale,size*1.05*outlineScale);ctx.restore();
    if(age>=500&&age<3950){
      const s=sweep(data,age),tipX=x+(s.point.x*Math.cos(rock.angle)-s.point.y*Math.sin(rock.angle))*size,tipY=y+(s.point.x*Math.sin(rock.angle)+s.point.y*Math.cos(rock.angle))*size;
      const trail=effect.trail,tg=trail.getContext('2d');tg.clearRect(0,0,trail.width,trail.height);tg.globalCompositeOperation='source-over';tg.lineCap='round';tg.lineJoin='round';
      const pixelScale=data.w/preview;
      const trailPass=(pass,length)=>{tg.beginPath();for(let i=0;i<=28*length;i++){const f=pass%2?1-i/28:i/28,q=data.cut(pass,data.cuts.x0+(data.cuts.x1-data.cuts.x0)*f);if(i)tg.lineTo((q.x+.5)*data.w,(q.y+.5)*data.h);else tg.moveTo((q.x+.5)*data.w,(q.y+.5)*data.h);}tg.strokeStyle='#ff9b42';tg.shadowColor='#ff681c';tg.shadowBlur=8*pixelScale;tg.lineWidth=4*pixelScale;tg.stroke();tg.strokeStyle='#fff2b0';tg.lineWidth=1*pixelScale;tg.stroke();};
      for(let pass=0;pass<s.pass;pass++)trailPass(pass,1);trailPass(s.pass,s.ease);tg.globalCompositeOperation='destination-in';tg.shadowBlur=0;tg.drawImage(im,0,0,data.w,data.h);
      ctx.save();ctx.translate(x,y);ctx.rotate(rock.angle);ctx.globalCompositeOperation='lighter';ctx.drawImage(trail,-size/2,-size/2,size,size);ctx.restore();
      if(s.raw>0&&s.raw<1){const power=Math.sin(Math.PI*s.raw),beamUnit=Math.max(.8,unit);ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=power;ctx.lineCap='round';ctx.shadowColor='#36c9ff';ctx.shadowBlur=(8+8*power)*beamUnit;ctx.strokeStyle='rgba(51,184,255,.48)';ctx.lineWidth=(3.5+1.2*power)*beamUnit;ctx.beginPath();ctx.moveTo(source.x,source.y);ctx.lineTo(tipX,tipY);ctx.stroke();ctx.shadowBlur=(4+4*power)*beamUnit;ctx.strokeStyle='#d8faff';ctx.lineWidth=(1+.6*power)*beamUnit;ctx.stroke();ctx.fillStyle='#fff8dc';ctx.beginPath();ctx.arc(tipX,tipY,(2.5+power)*beamUnit,0,Math.PI*2);ctx.fill();ctx.restore();
        for(let j=0;j<3;j++){const a=now*.017+j*2.4,d=(3+j*2)*beamUnit;ctx.save();ctx.fillStyle=j?'#ffb35b':'#fff8ce';ctx.fillRect(tipX+Math.cos(a)*d,tipY+Math.sin(a)*d,1.4*beamUnit,1.4*beamUnit);ctx.restore();}
      }
    }
    if(heatAge>0&&age<7150){ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<4;i++){const p=parts[i],px=x+p.x*gather,py=y+p.y*gather+size*.035*gather,amount=clamp((heatAge/4400-.18)/.55,0,1);if(amount<=0)continue;ctx.globalAlpha=amount;ctx.shadowColor='#ff6419';ctx.shadowBlur=12*unit;ctx.fillStyle='#ff751c';ctx.beginPath();ctx.ellipse(px,py,size*(.034+.05*amount),size*(.012+.021*amount),0,0,Math.PI*2);ctx.fill();}ctx.restore();}
    if(pressure>.12&&age<8500){
      const arcCanvas=effect.arcs,arc=arcCanvas.getContext('2d'),pixelScale=data.w/preview;
      arc.clearRect(0,0,data.w,data.h);arc.globalCompositeOperation='source-over';
      arc.lineCap='round';arc.lineJoin='round';
      for(let i=0;i<18;i++){
        const frame=Math.floor(now/(85+i%4*23)),hash=Math.sin((i*19+frame)*127.1+78.233)*43758.5453,seed=hash-Math.floor(hash);
        if(seed>.78)continue;
        const a=i*Math.PI*2/18+now*.000075,ux=Math.cos(a),uy=Math.sin(a);
        let rr=.5;while(rr>.15&&!solid(data,ux*rr,uy*rr))rr-=.012;
        arc.beginPath();
        for(let j=0;j<=6;j++){
          const f=j/6,r=rr*shieldScale*(.95-.32*f);
          const px=(ux*r+.5)*data.w+Math.sin(frame+j*7)*2*pixelScale;
          const py=(uy*r+.5)*data.h+Math.cos(frame+j*11)*2*pixelScale;
          if(j)arc.lineTo(px,py);else arc.moveTo(px,py);
        }
        arc.strokeStyle='#9de7ff';arc.shadowColor='#2faeff';arc.shadowBlur=4*pixelScale;
        arc.globalAlpha=.65*pressure;arc.lineWidth=.7*pixelScale;arc.stroke();
      }
      arc.globalAlpha=1;arc.shadowBlur=0;arc.globalCompositeOperation='destination-in';arc.drawImage(im,0,0,data.w,data.h);
      ctx.save();ctx.translate(x,y);ctx.rotate(rock.angle);ctx.globalCompositeOperation='lighter';
      ctx.drawImage(arcCanvas,-size/2,-size/2,size,size);ctx.restore();
    }
    effect.ripples=effect.ripples.filter(r=>now-r.born<520);for(const r of effect.ripples){const t=(now-r.born)/520;ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=(1-t)*.8;ctx.strokeStyle=pressure>.3?'#ff9b43':'#8feaff';ctx.shadowColor=pressure>.3?'#ff651f':'#40cfff';ctx.shadowBlur=9*unit;ctx.lineWidth=1.5*unit;ctx.beginPath();ctx.ellipse(r.x,r.y,(5+16*t)*unit,(3+9*t)*unit,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
  }
  window.nativeAsteroidMiningEffects={draw};
})();
