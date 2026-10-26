/* Bounded instanced light primitives on the existing shield overlay/context. */
(() => {
  'use strict';
  const LIMIT=32768,STRIDE=12;
  const vs=`#version 300 es
  precision highp float;
  layout(location=0) in vec2 corner;layout(location=1) in vec4 path;
  layout(location=2) in vec4 colour;layout(location=3) in vec4 style;
  uniform vec2 viewport;out vec2 samplePoint;flat out vec4 tint;flat out vec3 shape;
  void main(){
    vec2 delta=path.zw-path.xy;float span=max(.001,length(delta)),radius=max(.18,style.x);
    vec2 direction=delta/span;if(dot(direction,direction)<.5)direction=vec2(1.,0.);
    float along=(corner.x+.5)*(span+radius*6.)-radius*3.,across=corner.y*radius*6.;
    vec2 screen=path.xy+direction*along+vec2(-direction.y,direction.x)*across;
    gl_Position=vec4(screen/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
    samplePoint=vec2(along,across);tint=colour;shape=vec3(span,radius,style.y);
  }`;
  const fs=`#version 300 es
  precision highp float;in vec2 samplePoint;flat in vec4 tint;flat in vec3 shape;out vec4 pixel;
  void main(){
    float end=max(0.,max(-samplePoint.x,samplePoint.x-shape.x));
    float d2=(samplePoint.y*samplePoint.y+end*end)/(shape.y*shape.y);
    float core=exp(-d2*(shape.z>.5?20.:6.));
    float sheath=exp(-d2*3.)*.65+exp(-d2*.65)*.16;
    vec3 light=(tint.rgb*sheath+vec3(1.,.97,.90)*core)*tint.a;
    pixel=vec4(light,min(1.,max(light.r,max(light.g,light.b))));
  }`;
  const lightVS=`#version 300 es
  precision highp float;layout(location=0) in vec2 corner;layout(location=1) in vec4 matrix;
  layout(location=2) in vec4 pose;layout(location=3) in vec4 light;layout(location=4) in vec4 colour;
  uniform vec2 viewport;out vec2 uv;flat out vec4 illumination;flat out vec4 tint;
  void main(){
    vec2 p=corner*pose.zw,screen=pose.xy+mat2(matrix.x,matrix.y,matrix.z,matrix.w)*p;
    gl_Position=vec4(screen/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
    uv=corner+.5;illumination=light;tint=colour;
  }`;
  const lightFS=`#version 300 es
  precision highp float;precision highp sampler2DArray;in vec2 uv;flat in vec4 illumination;flat in vec4 tint;
  uniform sampler2DArray masks;out vec4 pixel;
  void main(){
    float position=clamp(.5-dot(uv-.5,illumination.xy)/1.1,0.,1.);
    float opacity=position<.54?mix(illumination.z,.035,position/.54):mix(.035,0.,(position-.54)/.46);
    float alpha=texture(masks,vec3(uv,tint.w)).a*opacity*illumination.w;
    pixel=vec4(tint.rgb*alpha,alpha);
  }`;
  function compile(gl,type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  window.createVexedCinematicPrimitives=(base,options)=>{
    const gl=base.gl,canvas=options.canvas,data=new Float32Array(LIMIT*STRIDE),p=gl.createProgram();
    const v=compile(gl,gl.VERTEX_SHADER,vs),f=compile(gl,gl.FRAGMENT_SHADER,fs);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
    const vao=gl.createVertexArray(),quad=gl.createBuffer(),buffer=gl.createBuffer();gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,.5]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);
    for(let i=1;i<=3;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,STRIDE*4,(i-1)*16);gl.vertexAttribDivisor(i,1);}
    const viewport=gl.getUniformLocation(p,'viewport');let count=0,open=false,enabled=true,disposed=false;
    const lightProgram=gl.createProgram(),lv=compile(gl,gl.VERTEX_SHADER,lightVS),lf=compile(gl,gl.FRAGMENT_SHADER,lightFS);
    gl.attachShader(lightProgram,lv);gl.attachShader(lightProgram,lf);gl.linkProgram(lightProgram);gl.deleteShader(lv);gl.deleteShader(lf);
    if(!gl.getProgramParameter(lightProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(lightProgram));
    const lightData=new Float32Array(256*16),lightVao=gl.createVertexArray(),lightBuffer=gl.createBuffer();
    gl.bindVertexArray(lightVao);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,lightBuffer);gl.bufferData(gl.ARRAY_BUFFER,lightData.byteLength,gl.DYNAMIC_DRAW);
    for(let i=1;i<=4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,64,(i-1)*16);gl.vertexAttribDivisor(i,1);}
    const lightTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D_ARRAY,lightTexture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,128,128,256);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const maskCanvas=document.createElement('canvas');maskCanvas.width=maskCanvas.height=128;const maskContext=maskCanvas.getContext('2d');
    const imageLayers=new WeakMap(),layers=new Array(256).fill(null),lightViewport=gl.getUniformLocation(lightProgram,'viewport'),maskUniform=gl.getUniformLocation(lightProgram,'masks');
    let lightCount=0,frameId=0,layerCount=0;
    const stats={primitiveFrames:0,primitiveDrawCalls:0,primitivePeak:0,primitiveRejected:0,gpuWeaponPaints:0,gpuHullPaints:0,lightDrawCalls:0,lightUploads:0,gpuShipLights:0};
    function uploadMask(layer,art){
      maskContext.clearRect(0,0,128,128);maskContext.drawImage(art,0,0,128,128);
      gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D_ARRAY,lightTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,layer,128,128,1,gl.RGBA,gl.UNSIGNED_BYTE,maskCanvas);stats.lightUploads++;
    }
    function light(ctx,asset,width,height,source){
      if(!open||!enabled||disposed||!asset.art)return false;
      if(lightCount>=256){stats.primitiveRejected++;return false;}
      let layer=imageLayers.get(asset.art);
      if(layer===undefined){
        layer=layerCount<256?layerCount++:-1;
        if(layer<0)for(let i=0;i<layers.length;i++)if(layers[i].frame!==frameId&&(layer<0||layers[i].frame<layers[layer].frame))layer=i;
        if(layer<0){stats.primitiveRejected++;return false;}
        const old=layers[layer]?.image.deref();if(old)imageLayers.delete(old);
        uploadMask(layer,asset.art);
        imageLayers.set(asset.art,layer);layers[layer]={image:new WeakRef(asset.art),frame:frameId};
      }else{
        if(asset.repairSurface&&layers[layer].frame!==frameId)uploadMask(layer,asset.art);
        layers[layer].frame=frameId;
      }
      const m=ctx.getTransform(),extent=Math.max(asset.width,asset.height),colour=Number(source.color)>>>0,o=lightCount++*16;
      lightData[o]=m.a;lightData[o+1]=m.b;lightData[o+2]=m.c;lightData[o+3]=m.d;
      lightData[o+4]=m.e;lightData[o+5]=m.f;lightData[o+6]=width;lightData[o+7]=height;
      lightData[o+8]=Math.cos(source.direction)*asset.width/extent;lightData[o+9]=Math.sin(source.direction)*asset.height/extent;
      lightData[o+10]=source.bright;lightData[o+11]=ctx.globalAlpha;
      lightData[o+12]=(colour>>16&255)/255;lightData[o+13]=(colour>>8&255)/255;lightData[o+14]=(colour&255)/255;lightData[o+15]=layer;
      stats.gpuShipLights++;return true;
    }
    function renderLights(effects){
      if(!effects||!enabled||!lightCount)return 0;
      gl.useProgram(lightProgram);gl.uniform2f(lightViewport,canvas.width,canvas.height);gl.uniform1i(maskUniform,3);
      gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D_ARRAY,lightTexture);gl.bindVertexArray(lightVao);gl.bindBuffer(gl.ARRAY_BUFFER,lightBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,lightData,0,lightCount*16);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArraysInstanced(gl.TRIANGLES,0,6,lightCount);stats.lightDrawCalls++;return lightCount;
    }
    function add(m,x,y,ex,ey,width,colour,brightness,point=false){
      const sx=m.a*x+m.c*y+m.e,sy=m.b*x+m.d*y+m.f,tx=m.a*ex+m.c*ey+m.e,ty=m.b*ex+m.d*ey+m.f;
      const radius=Math.max(.18,width*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d)));
      if(Math.max(sx,tx)+radius*3<0||Math.min(sx,tx)-radius*3>canvas.width||Math.max(sy,ty)+radius*3<0||Math.min(sy,ty)-radius*3>canvas.height)return;
      if(count>=LIMIT){stats.primitiveRejected++;return;}
      const o=count++*STRIDE;
      data[o]=sx;data[o+1]=sy;data[o+2]=tx;data[o+3]=ty;
      data[o+4]=(colour>>16&255)/255;data[o+5]=(colour>>8&255)/255;data[o+6]=(colour&255)/255;data[o+7]=brightness;
      data[o+8]=radius;data[o+9]=point?1:0;data[o+10]=data[o+11]=0;
    }
    function weapon(ctx,s){
      if(!open||!enabled||disposed||!['beam','torpedo','disruptor'].includes(s.kind))return false;
      const m=ctx.getTransform(),unit=(s.units||.91976)*(s.zoom??1),age=Math.max(0,s.age||0);
      const progress=Math.min(1,age/Math.max(1,s.duration||180)),pulse=.9+.1*Math.sin(age*.12+(s.seed||0)*4);
      const power=(s.kind==='beam'?1-Math.pow(progress,4):1)*pulse,colour=Number(s.color)>>>0;
      if(s.kind==='beam'){
        const width=Math.max(.45,(s.thickness||1)*unit*.43);
        add(m,s.x1,s.y1,s.x2,s.y2,width*.8,colour,power);
        add(m,s.x1,s.y1,s.x1,s.y1,Math.max(2,width*2.7),colour,power*.5,true);
      }else{
        const torpedo=s.kind==='torpedo',radius=(torpedo?4.2:1.8)*unit,angle=s.angle||0,length=(torpedo?16:21)*unit;
        add(m,s.x-Math.cos(angle)*length,s.y-Math.sin(angle)*length,s.x,s.y,radius*.55,colour,power*.6);
        add(m,s.x,s.y,s.x,s.y,radius*(torpedo?1.6:1.1),colour,power*.9,true);
      }
      stats.gpuWeaponPaints++;return true;
    }
    function hull(ctx,particle,time){
      if(!open||!enabled||disposed)return false;
      const age=time-particle.born;if(age<0||age>=particle.ttl)return true;
      const t=age/particle.ttl,fade=(1-t)*(1-t),m=ctx.getTransform();
      const colour=particle.kind==='flash'?0xffb34b:t<.4?0xffd590:0xff782c;
      if(particle.kind==='flash')add(m,particle.x,particle.y,particle.x,particle.y,particle.size*(.6+t*.7),colour,fade*.72,true);
      else if(particle.kind==='chip'){
        const angle=particle.angle+particle.spin*age*.001,dx=Math.cos(angle)*particle.size*.6,dy=Math.sin(angle)*particle.size*.6;
        add(m,particle.x-dx,particle.y-dy,particle.x+dx,particle.y+dy,particle.size*.5,colour,fade*particle.heat);
      }else{
        const speed=Math.max(.001,Math.hypot(particle.vx,particle.vy)),tail=Math.min(9*particle.size,speed*.014)*(1-t*.6);
        add(m,particle.x-particle.vx/speed*tail,particle.y-particle.vy/speed*tail,particle.x,particle.y,Math.max(.25,particle.size*.6),colour,fade*particle.heat);
      }
      stats.gpuHullPaints++;return true;
    }
    function render(effects=true){
      open=false;if(!effects||!enabled||!count)return 0;
      gl.useProgram(p);gl.uniform2f(viewport,canvas.width,canvas.height);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,data,0,count*STRIDE);gl.blendFunc(gl.ONE,gl.ONE);gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
      stats.primitiveDrawCalls++;stats.primitiveFrames++;stats.primitivePeak=Math.max(stats.primitivePeak,count);return count;
    }
    return {weapon,hull,light,renderLights,render,begin(){count=lightCount=0;frameId++;open=true;},mode(value){enabled=value.enabled&&!value.legacy;},
      snapshot:()=>({...stats,activePrimitives:count,activeShipLights:lightCount,lightLayers:layerCount,primitiveLimit:LIMIT,primitiveBufferBytes:data.byteLength,lightBufferBytes:lightData.byteLength,lightTextureBytes:128*128*256*4}),
      destroy(){if(disposed)return;disposed=true;open=false;gl.deleteProgram(p);gl.deleteProgram(lightProgram);gl.deleteBuffer(quad);gl.deleteBuffer(buffer);gl.deleteBuffer(lightBuffer);gl.deleteTexture(lightTexture);gl.deleteVertexArray(vao);gl.deleteVertexArray(lightVao);}};
  };
})();
