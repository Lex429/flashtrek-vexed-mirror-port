/* Local shield impact lighting for the damage showcase and live ship visuals.
   Callers place the canvas origin at the ship center and apply its rotation. */
(() => {
  'use strict';
  const duration=620,core='#e5faff',clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const shieldRadii=(w,h)=>{
    let rx=Math.max(26,w*.54+13),ry=Math.max(26,h*.54+13);
    if(rx/ry>.82&&rx/ry<1.22)rx=ry=Math.max(rx,ry);
    return {rx,ry};
  };
  window.showcaseShieldRadii=shieldRadii;
  const rgba=(hex,alpha)=>{const value=hex.replace('#','');const n=parseInt(value,16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${clamp(alpha,0,1)})`;};
  const random=n=>{const x=Math.sin(n*127.1+78.233)*43758.5453;return x-Math.floor(x);};
  // Scratch surfaces are synchronous: a completed draw never retains their pixels.
  // Reuse by exact dimensions across ships/contexts; a single last-size slot churns
  // continuously when a mixed fleet alternates between small and large hulls.
  const layers=new Map(),limits=Object.freeze({entries:64,pixels:4*1024*1024});
  let retainedPixels=0;
  const counters={allocations:0,hits:0,misses:0,evictions:0,oversize:0};
  function release(layer){
    retainedPixels-=layer.pixels;
    layer.canvas.width=layer.canvas.height=0;
    if(layer.raw)layer.raw.width=layer.raw.height=0;
  }
  function surface(kind,width,height){
    const key=kind+':'+width+':'+height;
    let layer=layers.get(key);
    if(layer){layers.delete(key);layers.set(key,layer);counters.hits++;return layer;}
    counters.misses++;
    const pixels=width*height*(kind==='refraction'?2:1);
    while(pixels<=limits.pixels&&layers.size&&(layers.size>=limits.entries||retainedPixels+pixels>limits.pixels)){
      const oldest=layers.keys().next().value;release(layers.get(oldest));layers.delete(oldest);counters.evictions++;
    }
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;counters.allocations++;
    layer={canvas,ctx:canvas.getContext('2d'),pixels};
    if(kind==='refraction'){
      const raw=document.createElement('canvas');raw.width=width;raw.height=height;counters.allocations++;
      layer.raw=raw;layer.rawCtx=raw.getContext('2d');
      const mask=layer.ctx.createRadialGradient(width*.5,height*.5,Math.min(width,height)*.13,width*.5,height*.5,Math.max(width,height)*.55);
      mask.addColorStop(0,'rgba(255,255,255,.04)');mask.addColorStop(.58,'rgba(255,255,255,.07)');
      mask.addColorStop(.86,'rgba(255,255,255,.34)');mask.addColorStop(1,'rgba(255,255,255,.66)');layer.mask=mask;
    }
    if(pixels<=limits.pixels){layers.set(key,layer);retainedPixels+=pixels;}
    else counters.oversize++; // Preserve full native quality without retaining an oversized surface.
    return layer;
  }
  window.showcaseShieldCache=Object.freeze({
    snapshot:()=>({...counters,entries:layers.size,pixels:retainedPixels,bytes:retainedPixels*4,limits:{...limits}}),
    clear:()=>{for(const layer of layers.values())release(layer);layers.clear();}
  });
  window.drawShowcaseShieldSurface=(ctx,x,y,w,h,color,charge,time,{front=false,refract=false,impact=null,surfaceRadii=null}={})=>{
    if(!impact)return;
    const life=impact.charge===0?430:duration,age=time-impact.born;if(age<0||age>=life)return;
    const {rx,ry}=surfaceRadii||shieldRadii(w,h);
    const strain=1-clamp(charge,0,1),flicker=1-strain*.13*(.5+.5*Math.sin(time*.038));
    ctx.save();ctx.translate(x,y);
    let hx=Number.isFinite(impact.x)?impact.x:0,hy=Number.isFinite(impact.y)?impact.y:-ry*.78;
    const normalized=Math.hypot(hx/rx,hy/ry);
    if(normalized>.96){hx*=.96/normalized;hy*=.96/normalized;}
    else if(normalized<.42){const angle=Math.atan2(hy,hx||.001);hx=Math.cos(angle)*rx*.72;hy=Math.sin(angle)*ry*.72;}
    const progress=age/life,opacity=clamp(age/35,0,1)*Math.pow(1-progress,.85);
    const spreadTime=impact.kind==='torpedo'?600:impact.kind==='disruptor'?550:500;
    const spread=clamp(age/spreadTime,0,1),waveAngle=Math.atan2(hy/ry,hx/rx);
    const radius=14+Math.max(rx,ry)*2.15*spread;
    ctx.globalAlpha*=opacity;
    ctx.beginPath();ctx.arc(hx,hy,radius,0,Math.PI*2);ctx.clip();
    if(!front){
      if(refract){
        const m=ctx.getTransform(),scaleX=Math.hypot(m.a,m.b),scaleY=Math.hypot(m.c,m.d);
        const width=Math.ceil(rx*2*scaleX),height=Math.ceil(ry*2*scaleY);
        const layer=surface('refraction',width,height);
        const raw=layer.rawCtx;raw.clearRect(0,0,width,height);
        if(Math.abs(m.b)>1e-6||Math.abs(m.c)>1e-6){
          // Sample the scene in shield-local coordinates so the lens turns with the hull.
          const inverse=m.inverse();
          raw.save();raw.setTransform(scaleX,0,0,scaleY,rx*scaleX,ry*scaleY);
          raw.transform(inverse.a,inverse.b,inverse.c,inverse.d,inverse.e,inverse.f);
          raw.drawImage(ctx.canvas,0,0);raw.restore();
        }else raw.drawImage(ctx.canvas,m.e-rx*scaleX,m.f-ry*scaleY,width,height,0,0,width,height);
        const g=layer.ctx;g.clearRect(0,0,width,height);g.globalCompositeOperation='source-over';
        g.drawImage(layer.raw,0,0);
        g.globalCompositeOperation='destination-in';
        g.fillStyle=layer.mask;g.fillRect(0,0,width,height);g.globalCompositeOperation='source-over';
        ctx.save();ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.clip();
        const lens=1.012+.019*Math.sin(Math.PI*spread),drift=3*Math.sin(Math.PI*spread);
        ctx.drawImage(layer.canvas,-rx*lens+Math.cos(waveAngle)*drift,-ry*lens+Math.sin(waveAngle)*drift,rx*2*lens,ry*2*lens);
        if(spread>0&&spread<1){
          const inner=Math.max(1,radius-13);
          ctx.save();ctx.beginPath();ctx.ellipse(hx,hy,radius,radius*.72,waveAngle,0,Math.PI*2);
          ctx.ellipse(hx,hy,inner,inner*.72,waveAngle,0,Math.PI*2);ctx.clip('evenodd');
          ctx.globalAlpha*=.29*(1-spread);
          ctx.drawImage(layer.raw,-rx*1.034-Math.cos(waveAngle)*4,-ry*1.034-Math.sin(waveAngle)*4,rx*2.068,ry*2.068);
          ctx.restore();
        }
        ctx.restore();
      }
      ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);
      const body=ctx.createRadialGradient(-rx*.31,-ry*.35,Math.min(rx,ry)*.09,0,0,Math.max(rx,ry));
      body.addColorStop(0,rgba('#ffffff',.012*flicker));body.addColorStop(.55,rgba(color,.014*flicker));
      body.addColorStop(.83,rgba(color,.035*flicker));body.addColorStop(1,rgba(color,.085*flicker));
      ctx.fillStyle=body;ctx.fill();
      const edge=ctx.createLinearGradient(-rx,-ry,rx,ry);
      edge.addColorStop(0,rgba('#ffffff',.36*flicker));edge.addColorStop(.23,rgba(color,.19*flicker));
      edge.addColorStop(.55,rgba(color,.045*flicker));edge.addColorStop(.8,rgba(color,.11*flicker));edge.addColorStop(1,rgba('#ffffff',.22*flicker));
      ctx.strokeStyle=edge;ctx.lineWidth=1.25;ctx.shadowColor=color;ctx.shadowBlur=5;
      ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.stroke();
    }else{
      ctx.globalCompositeOperation='screen';ctx.lineCap='round';
      ctx.strokeStyle=rgba('#ffffff',.4*flicker);ctx.lineWidth=1.8;ctx.shadowColor=core;ctx.shadowBlur=7;
      ctx.beginPath();ctx.ellipse(0,0,rx*.985,ry*.985,0,Math.PI*1.08+spread*.46,Math.PI*1.55+spread*.46);ctx.stroke();
      ctx.strokeStyle=rgba(color,.19*flicker);ctx.lineWidth=1.15;ctx.shadowBlur=4;
      ctx.beginPath();ctx.ellipse(0,0,rx*.99,ry*.99,0,-.25+spread*.65,.42+spread*.65);ctx.stroke();
      ctx.beginPath();ctx.ellipse(0,0,rx*.99,ry*.99,0,Math.PI*.48+spread*.34,Math.PI*.75+spread*.34);ctx.stroke();
      ctx.shadowBlur=0;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.clip();
      if(spread>0&&spread<1){
        const crestRadius=Math.max(2,radius-8);
        ctx.strokeStyle=rgba(core,.72*(1-spread*.45));ctx.shadowColor=core;ctx.shadowBlur=13;ctx.lineWidth=2.7;
        ctx.beginPath();ctx.ellipse(hx,hy,crestRadius,crestRadius*.72,waveAngle,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle=rgba(color,.33*(1-spread*.5));ctx.shadowBlur=4;ctx.lineWidth=1.2;
        ctx.beginPath();ctx.ellipse(hx,hy,Math.max(1,crestRadius-10),Math.max(1,crestRadius-10)*.72,waveAngle,0,Math.PI*2);ctx.stroke();
        ctx.shadowBlur=0;
      }
      const reflection=ctx.createLinearGradient(-rx*.85,-ry*.75,rx*.55,ry*.55);
      reflection.addColorStop(0,rgba('#ffffff',.075*flicker));reflection.addColorStop(.27,rgba('#ffffff',.025*flicker));
      reflection.addColorStop(.45,rgba('#ffffff',0));reflection.addColorStop(1,rgba(color,0));
      ctx.fillStyle=reflection;ctx.beginPath();ctx.ellipse(-rx*.35+Math.cos(waveAngle)*spread*rx*.16,-ry*.28+Math.sin(waveAngle)*spread*ry*.16,rx*.67,ry*.86,-.25+spread*.2,0,Math.PI*2);ctx.fill();
      if(strain>.35){ctx.strokeStyle=rgba(core,(strain-.35)*.24*(.5+.5*Math.sin(time*.027)));ctx.lineWidth=.7;
        ctx.beginPath();ctx.ellipse(0,0,rx*.998,ry*.998,0,2.25,3.12);ctx.stroke();}
    }
    ctx.restore();
  };
  function lightHull(ctx,image,w,h,x,y,color,alpha){
    if(!image||!image.width||alpha<=0)return;
    const width=Math.max(1,Math.ceil(w)),height=Math.max(1,Math.ceil(h));
    const layer=surface('hull',width,height);
    const g=layer.ctx;g.clearRect(0,0,width,height);g.globalCompositeOperation='source-over';
    g.drawImage(image,0,0,width,height);g.globalCompositeOperation='source-in';
    const radius=Math.max(36,Math.min(w,h)*.43),gradient=g.createRadialGradient(width/2+x,height/2+y,0,width/2+x,height/2+y,radius);
    gradient.addColorStop(0,rgba(core,alpha*.88));gradient.addColorStop(.38,rgba(color,alpha*.38));gradient.addColorStop(1,rgba(color,0));
    g.fillStyle=gradient;g.fillRect(0,0,width,height);g.globalCompositeOperation='source-over';
    ctx.save();ctx.globalCompositeOperation='screen';ctx.drawImage(layer.canvas,-w/2,-h/2,w,h);ctx.restore();
  }
  window.drawShowcaseShieldFlash=(ctx,image,w,h,flash,time,{surfaceRadii=null}={})=>{
    if(!flash)return;
    const life=flash.charge===0?430:duration,age=time-flash.born;if(age<0||age>=life)return;
    const progress=age/life,attack=clamp(age/45,0,1),fade=Math.pow(1-progress,1.55),strength=clamp(flash.energy||1,.7,1.7);
    const kind=flash.kind||'beam',wide=kind==='torpedo'?1.55:kind==='disruptor'?1.2:1;
    const alpha=attack*fade*strength,charge=clamp(flash.charge??1,0,1),strain=1-charge;
    const {rx,ry}=surfaceRadii||shieldRadii(w,h);
    let hx=Number.isFinite(flash.x)?flash.x:0,hy=Number.isFinite(flash.y)?flash.y:-ry*.78;
    const normalized=Math.hypot(hx/rx,hy/ry);
    if(normalized>.96){hx*=.96/normalized;hy*=.96/normalized;}
    else if(normalized<.42){const angle=Math.atan2(hy,hx||.001);hx=Math.cos(angle)*rx*.72;hy=Math.sin(angle)*ry*.72;}
    const color=flash.color||'#56c8ff',impactAngle=Math.atan2(hy/ry,hx/rx);
    const incoming=Math.atan2(-(flash.dy??Math.sin(impactAngle)),-(flash.dx??Math.cos(impactAngle)));
    const seed=(flash.born||0)*.013+hx*.17+hy*.23;
    ctx.save();ctx.globalCompositeOperation='screen';
    lightHull(ctx,image,w,h,hx,hy,color,alpha*.9);
    const revealRadius=14+Math.max(rx,ry)*2.15*clamp(age/410,0,1);
    ctx.save();ctx.beginPath();ctx.arc(hx,hy,revealRadius,0,Math.PI*2);ctx.clip();
    // A transparent shell catches only a little light away from the hit.
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);
    const body=ctx.createRadialGradient(0,0,0,0,0,Math.max(rx,ry));
    body.addColorStop(0,rgba(core,alpha*.006));body.addColorStop(.65,rgba(color,alpha*.013));
    body.addColorStop(.9,rgba(color,alpha*.028));body.addColorStop(1,rgba(core,alpha*.045));
    ctx.fillStyle=body;ctx.fill();
    ctx.save();ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.clip();
    const contactRadius=(kind==='torpedo'?Math.min(rx,ry)*.48:Math.min(rx,ry)*.31)*wide;
    const bloom=ctx.createRadialGradient(hx,hy,0,hx,hy,contactRadius);
    bloom.addColorStop(0,rgba('#ffffff',alpha*.82));bloom.addColorStop(.12,rgba(core,alpha*.37));
    bloom.addColorStop(.45,rgba(color,alpha*.09));bloom.addColorStop(1,rgba(color,0));
    ctx.fillStyle=bloom;ctx.fillRect(hx-contactRadius,hy-contactRadius,contactRadius*2,contactRadius*2);
    ctx.lineCap='round';ctx.shadowColor=color;ctx.shadowBlur=8;
    for(let i=0;i<3;i++){
      const ripple=clamp((progress-i*.16)*1.75,0,1);if(ripple<=0||ripple>=1)continue;
      const radius=(9+Math.min(rx,ry)*.57*ripple)*wide;
      ctx.strokeStyle=rgba(i?'#c3ecff':'#ffffff',alpha*Math.pow(1-ripple,1.65)*(.42-i*.08));
      ctx.lineWidth=(i?1.2:2.1)*(1-ripple*.45);
      ctx.beginPath();ctx.ellipse(hx,hy,radius,radius*.73,impactAngle,0,Math.PI*2);ctx.stroke();
    }
    // Short electrical branches crawl from the contact patch across the field.
    const arcCount=kind==='torpedo'?9:6+Math.round(strain*4);
    for(let i=0;i<arcCount;i++){
      const phase=random(seed+i*3.7),life=clamp((progress-phase*.42)/.35,0,1);
      if(life<=0||life>=1)continue;
      const direction=impactAngle+(random(seed+i*7.3)-.5)*2.4;
      const length=(18+random(seed+i*11.9)*Math.min(rx,ry)*.38)*wide*life;
      const endX=hx+Math.cos(direction)*length,endY=hy+Math.sin(direction)*length*.8;
      const kinkX=hx+(endX-hx)*.48+(random(seed+i*13.1)-.5)*13;
      const kinkY=hy+(endY-hy)*.48+(random(seed+i*17.7)-.5)*13;
      ctx.strokeStyle=rgba(i%3===0?'#ffffff':color,alpha*(1-life)*(.63+strain*.22));
      ctx.lineWidth=i%3===0?1.8:1.1;ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(kinkX,kinkY);ctx.lineTo(endX,endY);ctx.stroke();
    }
    ctx.restore();
    // Only the struck section of the rim lights up; the rest stays faint.
    ctx.shadowColor=color;ctx.shadowBlur=11*alpha;ctx.lineCap='round';
    ctx.lineWidth=1;ctx.strokeStyle=rgba(color,alpha*.09);
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<4;i++){
      const offset=(random(seed+i*5.3)-.5)*.55,span=(.2+.18*random(seed+i*8.1))*wide;
      ctx.lineWidth=(i===0?3.3:1.25)*(1-progress*.48);
      ctx.strokeStyle=rgba(i===0?core:color,alpha*(i===0?.75:.36)*(1-i*.09));
      ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,impactAngle+offset-span,impactAngle+offset+span);ctx.stroke();
    }
    ctx.restore();
    // Weapon energy breaks into hot sparks that spray back from the surface.
    ctx.shadowBlur=8;ctx.shadowColor=core;
    const sparkCount=kind==='torpedo'?24:kind==='disruptor'?18:13;
    for(let i=0;i<sparkCount;i++){
      const delay=random(seed+i*2.7)*.22,t=clamp((progress-delay)/.63,0,1);if(t<=0||t>=1)continue;
      const angle=incoming+(random(seed+i*19.7)-.5)*(kind==='torpedo'?2.7:1.9);
      const speed=(14+random(seed+i*31.3)*59)*wide;
      const distance=speed*t,px=hx+Math.cos(angle)*distance,py=hy+Math.sin(angle)*distance;
      const tail=6+12*(1-t),sparkAlpha=clamp(alpha*1.45,0,1)*Math.pow(1-t,.85)*(.65+random(seed+i*3.1)*.35);
      ctx.strokeStyle=rgba(i%4===0?'#ffffff':i%3===0?color:core,sparkAlpha);
      ctx.lineWidth=i%5===0?2.1:1.25;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-Math.cos(angle)*tail,py-Math.sin(angle)*tail);ctx.stroke();
      ctx.fillStyle=rgba('#ffffff',sparkAlpha*.8);ctx.beginPath();ctx.arc(px,py,i%5===0?1.8:1.1,0,Math.PI*2);ctx.fill();
    }
    ctx.shadowBlur=0;
    ctx.restore();
  };
})();
