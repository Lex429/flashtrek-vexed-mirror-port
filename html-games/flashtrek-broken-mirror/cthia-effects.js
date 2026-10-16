/* C'Thia-only showcase example. Anchors are measured on its 365 x 512 art.
   Effects use simulation time and the ship's drawing transform, so pause,
   slow motion, rotation, zoom, stage changes and repairs stay synchronized. */
(() => {
  'use strict';
  // Share fixed radial textures across ship profiles. Radius and brightness
  // remain animated at draw time; no damage stage or animation frame is cached.
  const glowTextures=new Map(),glowSize=128;
  function glowTexture(color){
    if(glowTextures.has(color))return glowTextures.get(color);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=glowSize;
    const g=canvas.getContext('2d'),r=glowSize/2,gradient=g.createRadialGradient(r,r,0,r,r,r);
    gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.2,color);gradient.addColorStop(1,color+'00');
    g.fillStyle=gradient;g.beginPath();g.arc(r,r,r,0,Math.PI*2);g.fill();
    // Bound memory even when a custom profile supplies additional colors.
    if(glowTextures.size>=32)glowTextures.delete(glowTextures.keys().next().value);
    glowTextures.set(color,canvas);return canvas;
  }
  function createEffects(config={}){
  const width=config.width||365,height=config.height||512;
  const lights=config.lights||[
    {x:181,y:362,r:27,kind:'core'},
    {x:53,y:305,r:10,kind:'strip'},{x:309,y:305,r:10,kind:'strip'},
    {x:80,y:340,r:9,kind:'strip'},{x:281,y:340,r:9,kind:'strip'},
    {x:66,y:199,r:8,kind:'strip'},{x:300,y:201,r:8,kind:'strip'},
    {x:75,y:161,r:4,kind:'running'},{x:286,y:161,r:4,kind:'running'},
    {x:180,y:42,r:3,kind:'running'}
  ];
  const right={x:275,y:199,r:12},left={x:84,y:201,r:11},bow={x:208,y:111,r:8},
    rightWing={x:315,y:261,r:10},crossbar={x:220,y:321,r:11},lower={x:139,y:401,r:10};
  const damage=config.damage||[[],[right],[right,left,bow,rightWing,crossbar,lower],
    [right,left,bow,rightWing,crossbar,lower,{x:42,y:319,r:13},{x:328,y:320,r:13},{x:253,y:447,r:15},{x:137,y:391,r:9}]];
  const wave=(t,frequency,phase=0)=>.5+.5*Math.sin(t*frequency+phase);
  const corePulse=t=>wave(t,2.1);
  function unlitFrame(image){
    if(image.coreUnlit)return image;
    const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
    const g=c.getContext('2d');g.drawImage(image,0,0);g.save();
    for(const region of config.offRegions||[{x:181,y:362,r:26}]){
      g.save();g.beginPath();
      if(region.r)g.arc(region.x,region.y,region.r,0,Math.PI*2);
      else g.rect(region.x-region.w/2,region.y-region.h/2,region.w,region.h);
      g.clip();g.clearRect(0,0,c.width,c.height);g.filter='grayscale(1) brightness(.55)';g.drawImage(image,0,0);g.restore();
    }g.restore();
    if(config.offTint==='green'){
      const pixels=g.getImageData(0,0,c.width,c.height),rgba=pixels.data;
      for(let i=0;i<rgba.length;i+=4)if(rgba[i+1]>rgba[i]*1.3&&rgba[i+1]>rgba[i+2]*1.2){
        const grey=Math.round((rgba[i]*.2126+rgba[i+1]*.7152+rgba[i+2]*.0722)*.55);
        rgba[i]=rgba[i+1]=rgba[i+2]=grey;
      }g.putImageData(pixels,0,0);
    }
    c.coreUnlit=true;c.olympicAligned=image.olympicAligned===true;c.tugAligned=image.tugAligned===true;c.starterAligned=image.starterAligned===true;return c;
  }
  const noise=n=>{const v=Math.sin(n*12.9898+78.233)*43758.5453;return v-Math.floor(v);};
  function glow(ctx,x,y,r,color,alpha){
    ctx.save();ctx.globalAlpha=alpha;
    ctx.drawImage(glowTexture(color),x-r,y-r,r*2,r*2);ctx.restore();
  }
  function snapshot(stage,time,options={}){
    const t=time/1000,s=Math.max(0,Math.min(3,stage));
    return {lights:options.lights===false?0:lights.filter(p=>!(s===3&&(p.kind==='core'||p.offSevere))).length,damageSites:options.damage===false?0:damage[s].length,
      coreIntensity:s===3||options.lights===false?0:.18+.82*corePulse(t),stage:s,anchors:options.anchors===true};
  }
  function draw(ctx,layout,angle,stage,time,options){
    const s=Math.max(0,Math.min(3,stage)),t=time/1000;
    ctx.save();ctx.translate(layout.x,layout.y);ctx.rotate(angle);
    ctx.scale(layout.w/width,layout.h/height);ctx.translate(-width/2,-height/2);
    if(options.lights){
      ctx.save();const gain=options.lightGain||1;if(gain!==1)ctx.filter=`brightness(${gain})`;
      for(const [i,p] of lights.entries()){
        if(s===3&&(p.kind==='core'||p.offSevere))continue;
        let intensity=p.kind==='core'?.18+.82*corePulse(t):p.kind==='running'?(Math.sin(t*4.2+i*.9)>.7?.9:.03):.12+.13*wave(t,1.8,i*.7);
        const failed=s>0&&damage[s].some(b=>Math.hypot(b.x-p.x,b.y-p.y)<b.r+17);
        if(failed)intensity*=Math.sin(t*(s===3?15:9)+i*2)>.3?.55:.02;
        if((config.coreShape==='tube'||p.shape==='tube')&&p.kind==='core'){
          const length=p.h||86;
          ctx.save();ctx.globalAlpha=.72;ctx.fillStyle='#06324e';ctx.fillRect(p.x-8,p.y-length/2,16,length);
          ctx.globalAlpha=1;ctx.globalCompositeOperation='screen';ctx.translate(p.x,p.y);ctx.scale(.3,1);
          glow(ctx,0,0,length*.57,p.color||'#159fff',intensity*.8);ctx.restore();
          ctx.save();ctx.globalAlpha=intensity*.65;ctx.fillStyle=p.color||'#88e7ff';ctx.fillRect(p.x-3,p.y-length/2+3,6,length-6);ctx.restore();
        }else if(p.shape==='circle'&&p.kind==='core'){
          ctx.save();ctx.fillStyle='#182023';ctx.beginPath();ctx.arc(p.x,p.y,p.r*.65,0,Math.PI*2);ctx.fill();
          ctx.globalCompositeOperation='screen';glow(ctx,p.x,p.y,p.r*(1.4+.5*corePulse(t)),p.color||'#149fff',intensity*.65);
          glow(ctx,p.x,p.y,p.r,p.color||'#53dfff',intensity);ctx.restore();
        }else if(config.width&&p.kind==='core'){
          ctx.save();ctx.globalCompositeOperation='screen';
          glow(ctx,p.x,p.y,p.r*(1.4+.5*corePulse(t)),p.color||'#28bfff',intensity*.65);
          ctx.globalAlpha=intensity;ctx.fillStyle=p.color||'#a6e9ff';ctx.fillRect(p.x-(p.w||24)/2,p.y-(p.h||6)/2,p.w||24,p.h||6);ctx.restore();
        }else if(p.kind==='core'){
          const pulse=corePulse(t);
          // Re-light the painted blue lens itself so its dim phase is visible too.
          ctx.save();
          const lens=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,19);
          lens.addColorStop(0,'#063d80');lens.addColorStop(.65,'#0754a0');lens.addColorStop(1,'#0754a000');
          ctx.fillStyle=lens;ctx.beginPath();ctx.arc(p.x,p.y,19,0,Math.PI*2);ctx.fill();
          ctx.globalCompositeOperation='screen';
          glow(ctx,p.x,p.y,36+18*pulse,'#139dff',intensity*.7);
          glow(ctx,p.x,p.y,18+3*pulse,'#26caff',intensity);
          glow(ctx,p.x,p.y,6+5*pulse,'#a6f4ff',intensity);
          ctx.restore();
        }else glow(ctx,p.x,p.y,p.r,p.color||'#32cfff',intensity);
        if(p.kind==='strip'){
          ctx.save();ctx.globalAlpha=intensity*.8;ctx.strokeStyle='#78efff';ctx.lineWidth=1.5;
          ctx.beginPath();ctx.moveTo(p.x-9,p.y);ctx.lineTo(p.x+9,p.y);ctx.stroke();ctx.restore();
        }
      }
      ctx.restore();
    }
    if(options.damage){
      for(const [i,p] of damage[s].entries()){
        const flicker=(.5+.2*Math.sin(t*17+i*3)+.15*Math.sin(t*31+i))*(config.damageScale||1);
        glow(ctx,p.x,p.y,p.r*(s===3?1.6:1.25),config.breachColor||'#ff6b13',flicker*(s===1?.45:.7));
        // Short flame tongues originate at the exposed breach, not healthy hull.
        if(s>=2){
          ctx.save();ctx.globalAlpha=.5*flicker;ctx.fillStyle=config.flameColor||'#ff9b25';
          for(let j=0;j<(s===3?3:1);j++){
            const a=t*2+i*2+j*1.8,len=p.r*(.7+.6*wave(t,13,i+j));
            ctx.beginPath();ctx.moveTo(p.x-2,p.y);ctx.quadraticCurveTo(p.x+Math.cos(a)*len*.5,p.y-4,p.x+Math.cos(a)*len,p.y+Math.sin(a)*len);ctx.lineTo(p.x+2,p.y+2);ctx.fill();
          }ctx.restore();
        }
        const count=s===1?3:s===2?5:8;
        for(let j=0;j<count;j++){
          const cycle=t/(.65+noise(i*17+j)*.45)+noise(i*21+j)*4,age=cycle-Math.floor(cycle),epoch=Math.floor(cycle);
          const a=noise(i*51+j*7+epoch)*Math.PI*2,d=age*(15+noise(i*11+j)*22)*(s===3?1.2:1);
          const x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d;
          ctx.save();ctx.globalAlpha=(1-age)*(s===1?.65:.95)*(config.damageScale||1);ctx.strokeStyle=age<.2?'#fff8d9':config.sparkColor||'#ffc15a';ctx.lineWidth=1.5;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(a)*(2+age*4),y-Math.sin(a)*(2+age*4));ctx.stroke();ctx.restore();
        }
        if(s>=2&&Math.sin(t*11+i*4)>.78){
          ctx.save();ctx.globalAlpha=.65;ctx.strokeStyle=config.arcColor||'#d4f7ff';ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(p.x-6,p.y+2);ctx.lineTo(p.x-2,p.y-4);ctx.lineTo(p.x+2,p.y+3);ctx.lineTo(p.x+7,p.y-2);ctx.stroke();ctx.restore();
        }
      }
    }
    if(options.anchors){
      for(const [points,tint] of [[lights,'#70e7ff'],[damage[s],'#ffbe68']]){
        ctx.strokeStyle=tint;ctx.lineWidth=2;ctx.globalAlpha=.9;
        for(const p of points){ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.moveTo(p.x-10,p.y);ctx.lineTo(p.x+10,p.y);ctx.moveTo(p.x,p.y-10);ctx.lineTo(p.x,p.y+10);ctx.stroke();}
      }
    }
    ctx.restore();
  }
  function damageSites(stage){
    const current=damage[Math.max(0,Math.min(3,stage))]||[],previous=damage[Math.max(0,stage-1)]||[];
    return current.filter(p=>!previous.some(old=>Math.hypot(p.x-old.x,p.y-old.y)<3)).map(p=>({x:p.x/width-.5,y:p.y/height-.5}));
  }
  return Object.freeze({draw,snapshot,unlitFrame,damageSites});
  }
  window.createShowcaseEffects=createEffects;
  window.cthiaEffects=createEffects();
})();
