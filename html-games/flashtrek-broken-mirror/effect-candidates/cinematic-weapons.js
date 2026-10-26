/* Weapon materials only. Shot motion, damage and contact remain in combat-shots. */
(() => {
  'use strict';
  const ID='cinematic-weapons-v1',LIMIT=4096,STRIDE=16,pipelines=new Set(),canvases=new WeakMap(),glows=new Map();
  const stats={beamPaints:0,torpedoPaints:0,boltPaints:0,canvasWeaponPaints:0};
  const vertex=`#version 300 es
  precision highp float;
  layout(location=0) in vec2 corner;layout(location=1) in vec4 path;
  layout(location=2) in vec4 colour;layout(location=3) in vec4 style;layout(location=4) in vec4 event;
  uniform vec2 viewport;out vec2 local;flat out vec4 tint;flat out vec4 material;flat out vec4 life;flat out float span;
  void main(){
    vec2 delta=path.zw-path.xy;span=length(delta);vec2 direction=span>.0001?delta/span:vec2(1.,0.);
    float pad=style.x*4.;local=vec2((corner.x+.5)*(span+2.*pad)-pad,corner.y*pad*2.);
    vec2 screen=path.xy+direction*local.x+vec2(-direction.y,direction.x)*local.y;
    gl_Position=vec4(screen/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
    tint=colour;material=style;life=event;
  }`;
  const fragment=`#version 300 es
  precision highp float;
  in vec2 local;flat in vec4 tint;flat in vec4 material;flat in vec4 life;flat in float span;
  uniform sampler2D turbulence;out vec4 pixel;
  void main(){
    float radius=material.x,kind=material.y,t=material.z*.001,seed=material.w;
    float x=local.x,y=local.y/radius,age=clamp(material.z/max(1.,life.x),0.,1.);
    vec3 hot=mix(tint.rgb,vec3(1.,.97,.90),.94),light=vec3(0.);
    if(kind>4.5){
      // A hot leading fleck and tapered cooling trail, never a round firework.
      float along=clamp(x/max(.1,span),0.,1.);
      float width=mix(.22,.62,along),aa=max(.10,fwidth(y)*.5);
      float edge=1.-smoothstep(max(0.,width-aa),width+aa,abs(y));
      float ends=smoothstep(-radius*.5,radius*.5,x)*(1.-smoothstep(span,span+radius,x));
      float hotness=1.-smoothstep(.12,.70,age);
      vec3 heat=mix(vec3(1.,.22,.015),mix(vec3(1.,.65,.12),vec3(1.,.97,.83),hotness),1.-age*.3);
      float head=exp(-pow((x-span)/radius,2.)*5.-y*y*4.);
      light=(heat*edge*pow(along,.6)*ends+hot*head*.45)*pow(1.-age,.95)*tint.a*2.2;
    }else if(kind>3.5){
      // Camera-aligned anamorphic flare; the projectile keeps its own heading.
      float axial=exp(-abs(x)/radius*.68)*exp(-abs(y)*24.);
      float diagonal=exp(-abs(x)/radius*2.4)*(exp(-abs(y-x/radius*.30)*19.)+exp(-abs(y+x/radius*.30)*19.))*.12;
      float core=exp(-(x*x/(radius*radius)+y*y)*14.);
      light=(tint.rgb*(axial+diagonal)+hot*core*.7)*tint.a;
    }else if(kind>2.5){
      float d=dot(local,local)/(radius*radius);
      light=(hot*exp(-d*8.)+tint.rgb*exp(-d*1.6)*.7+tint.rgb*exp(-d*.35)*.10)*tint.a;
    }else{
      vec2 flow=vec2(x/max(radius,1.)*(kind<.5?.105:.035)-t*(kind<.5?28.:1.7)+seed*7.13,y*(kind<.5?.16:.045)+seed*.37);
      vec2 n=texture(turbulence,flow).rg;
      vec2 fine=texture(turbulence,flow*2.7+vec2(t*4.,-t*2.)).rg;
      float field=n.r*.65+fine.g*.35;
      float envelope=kind<.5?(1.-smoothstep(.72,1.,age))*smoothstep(0.,.008,t):1.;
      if(kind<.5){
        // Energy moves within a coherent beam; only its dim outer edge wanders.
        float ends=smoothstep(-radius,radius*.4,x)*(1.-smoothstep(span-radius*.4,span+radius,x));
        float edge=abs(y)/(1.+(field-.5)*.30);
        float aa=max(fwidth(y),.04),core=1.-smoothstep(.12,.12+aa,abs(y));
        float sheath=exp(-edge*edge*3.)*(.5+field*.40);
        float halo=exp(-y*y*.65)*.085;
        float flowPulse=.84+.16*sin(x/max(radius,1.)*.55-t*92.+seed*19.+n.g*.8);
        light=(hot*core*.92+tint.rgb*(sheath+halo)*flowPulse)*ends*envelope*tint.a;
      }else{
        // The nose is tied to the real projectile. A cooling wake trails it.
        float behind=(span-x)/max(radius,1.),wake=clamp(x/max(1.,span),0.,1.);
        float nose=kind<1.5?1.25:.90;
        float head=pow((x-span)/(radius*nose),2.)+pow(y/(kind<1.5?.78:.48),2.);
        float shell=exp(-head*(1.05+field*.9));
        float core=exp(-head*8.);
        float tailWidth=(kind<1.5?.72:.43)*(.20+.80*wake)*(1.+(field-.5)*.25);
        float tail=exp(-pow(y/max(.07,tailWidth),2.)*2.)*pow(wake,1.25);
        tail*=smoothstep(0.,radius,x)*(1.-smoothstep(-.2,.7,-behind));
        float knots=.40+.60*field;
        vec3 cool=mix(tint.rgb*.5,tint.rgb,wake);
        light=hot*core*.95+tint.rgb*shell*(.35+field*.65)+cool*tail*knots*.65;
        light+=tint.rgb*exp(-head*.35)*.055;
        // A circulating hot region gives the torpedo's energy envelope depth.
        if(kind<1.5){
          vec2 p=vec2((x-span)/radius,y);float a=t*(10.+life.y)+seed*6.;
          vec2 hotSpot=vec2(cos(a)*.48,sin(a)*.32);
          light+=hot*exp(-dot(p-hotSpot,p-hotSpot)*18.)*shell*.35;
        }
        light*=tint.a;
      }
    }
    float alpha=min(1.,max(light.r,max(light.g,light.b)));if(alpha<.002)discard;
    pixel=vec4(light,alpha);
  }`;
  function compile(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;}
  function createPipeline(base,options){
    const gl=base.gl,canvas=options.canvas,data=new Float32Array(LIMIT*STRIDE),program=gl.createProgram();
    const vs=compile(gl,gl.VERTEX_SHADER,vertex),fs=compile(gl,gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    const vao=gl.createVertexArray(),quad=gl.createBuffer(),buffer=gl.createBuffer();gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,.5]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);
    for(let i=1;i<=4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,STRIDE*4,(i-1)*16);gl.vertexAttribDivisor(i,1);}
    const bytes=new Uint8Array(64*64*4);let seed=429;
    for(let i=0;i<bytes.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;bytes[i]=seed>>>24;}
    const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,64,64,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    const viewport=gl.getUniformLocation(program,'viewport'),noise=gl.getUniformLocation(program,'turbulence');
    let count=0,impactCount=0,open=false,enabled=true,disposed=false;
    const counters={gpuWeaponPaints:0,beamPaints:0,torpedoPaints:0,boltPaints:0,weaponDrawCalls:0,weaponPeak:0,primitiveRejected:0};
    function add(m,x,y,ex,ey,r,kind,s,brightness=1){
      const sx=m.a*x+m.c*y+m.e,sy=m.b*x+m.d*y+m.f,tx=m.a*ex+m.c*ey+m.e,ty=m.b*ex+m.d*ey+m.f;
      const radius=Math.max(kind===5?.75:0,r*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d)));
      if(!(radius>0)||!Number.isFinite(sx)||!Number.isFinite(sy)||!Number.isFinite(tx)||!Number.isFinite(ty)||!Number.isFinite(radius))return;
      if(Math.max(sx,tx)+radius*4<0||Math.min(sx,tx)-radius*4>canvas.width||Math.max(sy,ty)+radius*4<0||Math.min(sy,ty)-radius*4>canvas.height)return;
      if(count>=LIMIT){counters.primitiveRejected++;return;}
      const o=count++*STRIDE,colour=Number(s.color)>>>0;
      data[o]=sx;data[o+1]=sy;data[o+2]=tx;data[o+3]=ty;
      data[o+4]=(colour>>16&255)/255;data[o+5]=(colour>>8&255)/255;data[o+6]=(colour&255)/255;data[o+7]=brightness;
      data[o+8]=Math.max(.35,radius);data[o+9]=kind;data[o+10]=Math.max(0,s.age||0);data[o+11]=s.seed||0;
      data[o+12]=s.duration||180;data[o+13]=((colour>>>8)%11)*.13;data[o+14]=data[o+15]=0;
    }
    function weapon(ctx,s,matrix){
      if(!open||!enabled||disposed||!['beam','torpedo','disruptor'].includes(s.kind))return false;
      const m=matrix||ctx.getTransform(),unit=(s.units||.91976)*(s.zoom??1),age=Math.max(0,s.age||0);
      if(s.kind==='beam'){
        const r=Math.max(.7,(s.thickness||1)*unit*.55),fade=1-Math.min(1,age/Math.max(1,s.duration||180))**4;
        add(m,s.x1,s.y1,s.x2,s.y2,r,0,s);
        add(m,s.x1,s.y1,s.x1,s.y1,Math.max(1.8,r*2.6),3,s,Math.exp(-age/38)*.9);
        if(age>=70)add(m,s.x2,s.y2,s.x2,s.y2,Math.max(1.5,r*2.),3,s,fade*.46);
        counters.beamPaints++;
      }else{
        const torpedo=s.kind==='torpedo',r=(torpedo?4.2:2.)*unit,length=(torpedo?20:25)*unit,a=s.angle||0;
        add(m,s.x-Math.cos(a)*length,s.y-Math.sin(a)*length,s.x,s.y,r,torpedo?1:2,s);
        if(options.battle){
          // Identity transform keeps lens streaks aligned with the camera.
          const x=m.a*s.x+m.c*s.y+m.e,y=m.b*s.x+m.d*s.y+m.f;
          const scale=Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));
          add({a:1,b:0,c:0,d:1,e:0,f:0},x,y,x,y,(torpedo?12:7)*unit*scale,4,s,torpedo?.48:.30);
        }
        counters[torpedo?'torpedoPaints':'boltPaints']++;
      }
      counters.gpuWeaponPaints++;return true;
    }
    function hull(ctx,p,time){
      if(!options.battle||!open||!enabled||disposed)return false;
      const age=time-p.born;if(age<0||age>=p.ttl)return true;
      const s={color:0xffba55,age,duration:p.ttl,seed:p.heat},m=ctx.getTransform(),t=age/p.ttl;
      if(p.kind==='flash')add(m,p.x,p.y,p.x,p.y,p.size*(.6+t*.7),3,s,(1-t)**2*.7);
      else{const speed=Math.hypot(p.vx,p.vy)||1,tail=Math.min(p.size*(p.kind==='chip'?4:22),speed*.065)*(1-t*.35);
        add(m,p.x-p.vx/speed*tail,p.y-p.vy/speed*tail,p.x,p.y,Math.max(.16,p.size*(p.kind==='chip'?.8:.45)),5,s,p.heat);}
      counters.gpuHullPaints++;return true;
    }
    counters.gpuHullPaints=0;
    counters.impactFlarePaints=0;counters.impactFlarePeak=0;
    const identity={a:1,b:0,c:0,d:1,e:0,f:0};
    function impact(ctx,event,matrix){
      if(!options.battle||!open||!enabled||disposed||!['beam','torpedo','disruptor'].includes(event.kind))return false;
      const age=event.age??0,torpedo=event.kind==='torpedo',beam=event.kind==='beam',duration=torpedo?260:beam?180:170;
      if(!Number.isFinite(age)||age<0)return false;
      if(age>=duration)return false;
      const m=matrix||ctx.getTransform(),x=m.a*event.x+m.c*event.y+m.e,y=m.b*event.x+m.d*event.y+m.f;
      const scale=matrix?(event.scale||1):Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));
      const power=Math.max(.35,Math.min(1.8,event.strength||1)),r=(torpedo?21:beam?11:14)*Math.sqrt(power)*scale;
      const color=Number.isFinite(event.color)?event.color:torpedo?0xffa64b:beam?0xffc061:0x60ff79;
      const fade=Math.exp(-age/(torpedo?85:beam?95:55))*(1-age/duration),s={color,age,duration,seed:event.seed||0};
      add(identity,x,y,x,y,r,4,s,fade*(torpedo?.9:beam?.6:.75));
      add(identity,x,y,x,y,r*.24,3,s,fade*.75);
      // A restrained optical ghost follows the camera axis, never the ship heading.
      if(power>1.05){const dx=canvas.width*.5-x,dy=canvas.height*.5-y;
        add(identity,x+dx*.28,y+dy*.28,x+dx*.28,y+dy*.28,r*.23,3,s,fade*.025*power);}
      impactCount++;counters.impactFlarePaints++;counters.impactFlarePeak=Math.max(counters.impactFlarePeak,impactCount);return true;
    }
    return {weapon,hull,impact,begin(){count=impactCount=0;open=true;},mode(value){enabled=value.enabled&&!value.legacy;},
      render(effects){open=false;if(!effects||!enabled||!count)return 0;
        gl.useProgram(program);gl.uniform2f(viewport,canvas.width,canvas.height);gl.uniform1i(noise,4);
        gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,texture);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER,0,data,0,count*STRIDE);gl.blendFunc(gl.ONE,gl.ONE);gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
        counters.weaponDrawCalls++;counters.weaponPeak=Math.max(counters.weaponPeak,count);return count;},
      snapshot:()=>({...counters,weaponAppearance:ID,activeWeaponPrimitives:count,activeImpactFlares:impactCount,weaponLimit:LIMIT,weaponBufferBytes:data.byteLength,weaponTextureBytes:21844}),
      destroy(){if(disposed)return;disposed=true;gl.deleteProgram(program);gl.deleteBuffer(quad);gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);gl.deleteTexture(texture);}};
  }
  function glow(colour){
    let c=glows.get(colour);if(c)return c;
    if(glows.size>=24)glows.delete(glows.keys().next().value);
    c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),hex='#'+colour.toString(16).padStart(6,'0');
    const gradient=g.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#fff9ed');gradient.addColorStop(.18,hex);gradient.addColorStop(1,hex+'00');
    g.fillStyle=gradient;g.fillRect(0,0,64,64);glows.set(colour,c);return c;
  }
  function drawWeapon(base,ctx,s){
    if(!['beam','torpedo','disruptor'].includes(s.kind))return base(ctx,s);
    stats[s.kind==='beam'?'beamPaints':s.kind==='torpedo'?'torpedoPaints':'boltPaints']++;
    if(canvases.get(ctx.canvas)?.weapon(ctx,s))return;
    // Canvas-only preview/export fallback; the live fleet uses the shared GPU batch.
    stats.canvasWeaponPaints++;const unit=(s.units||.91976)*(s.zoom??1),age=s.age||0,colour=Number(s.color)>>>0;
    const hex='#'+colour.toString(16).padStart(6,'0'),seed=s.seed||0;ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.shadowBlur=0;
    function line(x,y,ex,ey,w,c,alpha){ctx.globalAlpha=alpha;ctx.lineWidth=w;ctx.strokeStyle=c;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();}
    if(s.kind==='beam'){
      const w=Math.max(.7,(s.thickness||1)*unit*.55),fade=1-Math.min(1,age/Math.max(1,s.duration||180))**4;
      line(s.x1,s.y1,s.x2,s.y2,w*3,hex,.15*fade);line(s.x1,s.y1,s.x2,s.y2,w*1.4,hex,.8*fade);line(s.x1,s.y1,s.x2,s.y2,w*.35,'#fff9ed',fade);
      for(let i=0;i<8;i++){const t=((i/8+age*.003+seed*.13)%1),end=Math.min(1,t+.035),v=.18+.12*Math.sin(i*3.7+age*.05+seed);
        line(s.x1+(s.x2-s.x1)*t,s.y1+(s.y2-s.y1)*t,s.x1+(s.x2-s.x1)*end,s.y1+(s.y2-s.y1)*end,w*2,hex,v*fade);}
      const r=Math.max(3,w*5);ctx.globalAlpha=Math.exp(-age/38);ctx.drawImage(glow(colour),s.x1-r,s.y1-r,r*2,r*2);
    }else{
      const torpedo=s.kind==='torpedo',r=(torpedo?4.2:2)*unit,l=(torpedo?20:25)*unit,a=s.angle||0;
      ctx.translate(s.x,s.y);ctx.rotate(a);const gradient=ctx.createLinearGradient(-l,0,0,0);gradient.addColorStop(0,hex+'00');gradient.addColorStop(1,hex);
      ctx.fillStyle=gradient;ctx.globalAlpha=.65;ctx.beginPath();ctx.moveTo(-l,0);ctx.quadraticCurveTo(-l*.3,-r*.7,0,-r*.45);ctx.lineTo(0,r*.45);ctx.quadraticCurveTo(-l*.3,r*.7,-l,0);ctx.fill();
      ctx.globalAlpha=.8;ctx.drawImage(glow(colour),-r*2,-r*2,r*4,r*4);ctx.globalAlpha=1;ctx.fillStyle='#fff9ed';ctx.beginPath();ctx.ellipse(0,0,r*.6,r*(torpedo?.45:.25),0,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.25+.15*Math.sin(age*.01+seed);ctx.drawImage(glow(colour),-r*.5,-r*.4,r,r*.8);
    }
    ctx.restore();
  }
  window.nativeEffectProfiles.extend(ID,'cinematic-shields-v1',parent=>({drawWeapon,
    queueWeapon(ctx,s,matrix){const accepted=canvases.get(ctx.canvas)?.weapon(ctx,s,matrix)||false;
      if(accepted)stats[s.kind==='beam'?'beamPaints':s.kind==='torpedo'?'torpedoPaints':'boltPaints']++;return accepted;},
    queueShipLight:(ctx,...args)=>canvases.get(ctx.canvas)?.lights.light(ctx,...args)||false,
    queueHullParticle:(ctx,...args)=>canvases.get(ctx.canvas)?.hull(ctx,...args)||false,
    queueImpact:(ctx,event)=>canvases.get(ctx.canvas)?.impact(ctx,event)||false,
    async createShield(factory,options){
      const base=await parent.createShield(factory,options);if(!options.sourceCanvas)return base;
      let weapons,lights;try{weapons=createPipeline(base,options);lights=window.createVexedCinematicPrimitives(base,options);}catch(error){weapons?.destroy();base.destroy();throw error;}
      const entry={...weapons,lights};pipelines.add(entry);canvases.set(options.sourceCanvas,entry);let disposed=false;
      return Object.freeze({...base,queueImpact:event=>weapons.impact(null,event,{a:1,b:0,c:0,d:1,e:0,f:0}),beginFrame(){weapons.begin();lights.begin();},setPresentationMode(v){weapons.mode(v);lights.mode(v);},
        render(time,settings={}){let illumination=0;const result=base.render(time,{...settings,beforeEffects:()=>{settings.beforeEffects?.();illumination=lights.renderLights(settings.effects);}});
          lights.render(settings.effects);const active=weapons.render(settings.effects);return {...result,activePrimitives:active+illumination,drawCalls:result.drawCalls+(active?1:0)+(illumination?1:0)};},
        snapshot(){const b=base.snapshot(),w=weapons.snapshot(),l=lights.snapshot();return {...b,...w,gpuShipLights:l.gpuShipLights,activeShipLights:l.activeShipLights,
          primitiveRejected:w.primitiveRejected+l.primitiveRejected,primitiveLimit:LIMIT,primitiveImplementation:ID,
          drawCalls:b.drawCalls+w.weaponDrawCalls+l.primitiveDrawCalls+l.lightDrawCalls,
          bufferBytes:b.bufferBytes+w.weaponBufferBytes+l.primitiveBufferBytes+l.lightBufferBytes,textureBytes:b.textureBytes+w.weaponTextureBytes+l.lightTextureBytes,
          maxTextureBytes:b.maxTextureBytes+w.weaponTextureBytes+l.lightTextureBytes};},
        destroy(){if(disposed)return;disposed=true;weapons.destroy();lights.destroy();pipelines.delete(entry);if(canvases.get(options.sourceCanvas)===entry)canvases.delete(options.sourceCanvas);base.destroy();}});
    },metrics:()=>({...stats,weaponAppearance:ID,gpuWeaponPaints:[...pipelines].reduce((n,p)=>n+p.snapshot().gpuWeaponPaints,0),
      sprites:glows.size,spriteBytes:glows.size*64*64*4,maxSpriteBytes:24*64*64*4})}));
})();
