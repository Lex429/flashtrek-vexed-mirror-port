/* A bounded, artwork-masked transporter presentation. No gameplay state or RNG. */
(() => {
  'use strict';
  const clamp=value=>Math.max(0,Math.min(1,value));
  const ease=(from,to,value)=>{const t=clamp((value-from)/(to-from));return t*t*(3-2*t);};
  function create(canvas,frame,pattern,image,onComplete){
    const ctx=canvas.getContext('2d'),source=document.createElement('canvas'),energy=document.createElement('canvas'),solid=document.createElement('canvas'),mask=document.createElement('canvas'),noise=document.createElement('canvas');
    const sourceCtx=source.getContext('2d',{willReadFrequently:true}),energyCtx=energy.getContext('2d'),solidCtx=solid.getContext('2d'),maskCtx=mask.getContext('2d'),noiseCtx=noise.getContext('2d');
    const padElement=frame.querySelector('.collectable-pad');
    let active=false,dirty=true,last=null,elapsed=0,w=0,h=0,density=1,padX=0,padY=0,art=null,grain=null,particles=[],strands=[],motes=[],seed=0x6ac73f91;
    const duration=1.65;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const observer=new ResizeObserver(()=>{dirty=true;});observer.observe(frame);observer.observe(pattern);
    function clear(context){context.setTransform(1,0,0,1,0,0);context.globalCompositeOperation='source-over';context.globalAlpha=1;context.filter='none';context.shadowBlur=0;context.clearRect(0,0,canvas.width,canvas.height);}
    function prepare(){
      w=frame.clientWidth;h=frame.clientHeight;if(!w||!h||!image.naturalWidth)return false;
      density=Math.min(devicePixelRatio||1,1.5,640/Math.max(w,h));
      for(const surface of [canvas,source,energy,solid,mask]){surface.width=Math.max(1,Math.round(w*density));surface.height=Math.max(1,Math.round(h*density));}
      const fit=Math.min(pattern.clientWidth/image.naturalWidth,pattern.clientHeight/image.naturalHeight);
      art={width:image.naturalWidth*fit,height:image.naturalHeight*fit};art.x=pattern.offsetLeft+(pattern.clientWidth-art.width)/2;art.y=pattern.offsetTop+(pattern.clientHeight-art.height)/2;
      padX=padElement.offsetLeft+padElement.offsetWidth/2;padY=padElement.offsetTop+padElement.offsetHeight/2;
      sourceCtx.setTransform(density,0,0,density,0,0);sourceCtx.drawImage(image,art.x,art.y,art.width,art.height);
      const pixels=sourceCtx.getImageData(0,0,source.width,source.height),inside=[],edges=[],step=Math.max(1,Math.round(density*2));
      for(let y=step;y<pixels.height-step;y+=step)for(let x=step;x<pixels.width-step;x+=step){
        const at=(y*pixels.width+x)*4;if(pixels.data[at+3]<96)continue;
        const point={x:x/density,y:y/density};inside.push(point);
        if(pixels.data[at+3-step*4]<64||pixels.data[at+3+step*4]<64||pixels.data[at+3-step*pixels.width*4]<64||pixels.data[at+3+step*pixels.width*4]<64)edges.push(point);
      }
      if(!inside.length)return false;
      const pick=list=>list[Math.floor(random()*list.length)];
      particles=Array.from({length:260},(_,index)=>({...pick(index<80&&edges.length?edges:inside),phase:random()*Math.PI*2,rate:5+random()*10,length:.8+random()*3.6,alpha:.25+random()*.75}));
      strands=Array.from({length:19},()=>({x:pick(inside).x,phase:random()*Math.PI*2,width:.35+random()*.8,reach:random()*24}));
      motes=Array.from({length:34},()=>({x:pick(inside).x,phase:random(),speed:55+random()*90,length:2+random()*6}));
      noise.width=96;noise.height=96;const texture=noiseCtx.createImageData(96,96);
      for(let n=0;n<texture.data.length;n+=4){const value=random();texture.data[n]=160+Math.floor(random()*95);texture.data[n+1]=235;texture.data[n+2]=255;texture.data[n+3]=value>.57?Math.floor(55+random()*190):0;}
      noiseCtx.putImageData(texture,0,0);grain=energyCtx.createPattern(noise,'repeat');dirty=false;return true;
    }
    function silhouette(){
      clear(energyCtx);energyCtx.drawImage(source,0,0);energyCtx.globalCompositeOperation='source-in';energyCtx.fillStyle='#8aeaff';energyCtx.fillRect(0,0,energy.width,energy.height);
      energyCtx.globalCompositeOperation='source-atop';energyCtx.globalAlpha=.8;energyCtx.fillStyle=grain;
      const drift=elapsed*37*density;energyCtx.translate(drift,-drift*1.7);energyCtx.fillRect(-drift,drift*1.7,energy.width,energy.height);energyCtx.setTransform(1,0,0,1,0,0);energyCtx.globalAlpha=1;
    }
    function paint(progress){
      clear(ctx);ctx.setTransform(density,0,0,density,0,0);
      const time=elapsed,build=ease(.16,.86,progress),front=art.y+art.height*(1-build)+8-16*build,base=padY,center=padX;
      const power=ease(0,.14,progress)*(1-ease(.67,1,progress)),radius=Math.min(w*.33,art.width*.5+34);
      // Light originates at the pad, with thin individually wandering columns.
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(center,base);ctx.scale(1,.13);
      const pad=ctx.createRadialGradient(0,0,0,0,0,radius);pad.addColorStop(0,`rgba(220,255,255,${power*.7})`);pad.addColorStop(.45,`rgba(83,210,255,${power*.35})`);pad.addColorStop(1,'rgba(40,170,255,0)');ctx.fillStyle=pad;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();
      ctx.save();ctx.globalCompositeOperation='lighter';const beam=ctx.createLinearGradient(0,art.y-30,0,base);beam.addColorStop(0,'rgba(106,215,255,0)');beam.addColorStop(.26,`rgba(128,231,255,${power*.15})`);beam.addColorStop(.88,`rgba(175,248,255,${power*.65})`);beam.addColorStop(1,`rgba(229,255,255,${power*.85})`);
      ctx.strokeStyle=beam;ctx.shadowColor='#78dfff';ctx.shadowBlur=5;
      for(const strand of strands){
        ctx.lineWidth=strand.width;ctx.beginPath();const top=art.y-10-strand.reach;
        for(let n=0;n<=8;n++){const y=base+(top-base)*n/8,x=strand.x+Math.sin(time*6+strand.phase+n*.7)*(1+n*.15);if(n)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();
      }
      ctx.shadowBlur=0;
      for(const mote of motes){const span=base-art.y+20,y=base-((time*mote.speed+mote.phase*span)%span),x=mote.x+Math.sin(time*4+mote.phase*20)*2;ctx.globalAlpha=power*(.15+.3*Math.sin(mote.phase*30+time*5)**2);ctx.strokeStyle='#ccfaff';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+mote.length);ctx.stroke();}ctx.restore();
      // The developing solid has an irregular, softly feathered formation edge.
      clear(maskCtx);maskCtx.setTransform(density,0,0,density,0,0);maskCtx.filter='blur(2px)';maskCtx.fillStyle='#fff';maskCtx.beginPath();maskCtx.moveTo(0,h+8);
      for(let x=0;x<=w+4;x+=4)maskCtx.lineTo(x,front+Math.sin(x*.09+time*9)*2.8+Math.sin(x*.31-time*13)*1.2);
      maskCtx.lineTo(w+8,h+8);maskCtx.closePath();maskCtx.fill();maskCtx.filter='none';
      clear(solidCtx);solidCtx.drawImage(source,0,0);solidCtx.globalCompositeOperation='destination-in';solidCtx.drawImage(mask,0,0);
      ctx.globalAlpha=ease(.1,.5,progress);ctx.drawImage(solid,0,0,w,h);ctx.globalAlpha=1;
      // Dense, irregular shimmer is clipped to the original transparent artwork.
      silhouette();energyCtx.globalCompositeOperation='destination-out';energyCtx.drawImage(mask,0,0);
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=ease(.03,.2,progress)*(1-ease(.73,.97,progress))*.7;ctx.shadowColor='#7eeaff';ctx.shadowBlur=9;ctx.drawImage(energy,0,0,w,h);ctx.restore();
      // The brightest energy stays on the object's forming surface, never a box.
      clear(energyCtx);energyCtx.drawImage(source,0,0);energyCtx.globalCompositeOperation='source-in';energyCtx.setTransform(density,0,0,density,0,0);
      const rim=energyCtx.createLinearGradient(0,front-13,0,front+13);rim.addColorStop(0,'rgba(83,198,255,0)');rim.addColorStop(.4,'rgba(146,239,255,.5)');rim.addColorStop(.5,'rgba(242,255,255,1)');rim.addColorStop(.6,'rgba(146,239,255,.5)');rim.addColorStop(1,'rgba(83,198,255,0)');energyCtx.fillStyle=rim;energyCtx.fillRect(0,0,w,h);
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=power;ctx.shadowColor='#b2f7ff';ctx.shadowBlur=7;ctx.drawImage(energy,0,0,w,h);
      ctx.shadowBlur=0;
      for(const particle of particles){
        const forming=Math.max(0,1-Math.abs(particle.y-front)/40),pulse=Math.max(0,Math.sin(particle.phase+time*particle.rate));
        ctx.globalAlpha=power*particle.alpha*pulse*(.22+forming*.78);ctx.strokeStyle=forming>.4?'#f1ffff':'#8feaff';ctx.lineWidth=forming>.4?1:.55;
        const x=particle.x+Math.sin(time*9+particle.phase)*.8,y=particle.y+Math.cos(time*7+particle.phase)*1.3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-particle.length);ctx.stroke();
      }ctx.restore();
    }
    function stop(){active=false;last=null;canvas.hidden=true;clear(ctx);}
    function finish(){if(!active)return;stop();onComplete();}
    function start(){stop();active=true;dirty=true;elapsed=0;canvas.hidden=false;}
    function step(timestamp=performance.now()){
      if(!active)return;
      if(document.hidden||window.nativePause?.active){last=null;return;}
      if(!image.complete||!image.naturalWidth){last=null;return;}
      if(dirty&&!prepare()){finish();return;}
      if(last!==null)elapsed+=Math.max(0,timestamp-last)/1000;last=timestamp;
      const progress=clamp(elapsed/duration);paint(progress);if(progress===1)finish();
    }
    return Object.freeze({start,step,stop,finish,suspend(){last=null;},get active(){return active;},get progress(){return clamp(elapsed/duration);}});
  }
  window.nativeCollectableTransporter=Object.freeze({create});
})();
