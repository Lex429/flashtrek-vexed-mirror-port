/* Painted running lamps on the existing effects context. Hull pixels, lamp
   positions and pulse clocks still come from the ordinary artwork profiles. */
(() => {
 'use strict';
 const owners=new WeakMap(),standalone=new WeakMap(),standaloneCanvases=new Set(),CELL=128,LAYERS=512,LIMIT=32768,STRIDE=24;
 const vs=`#version 300 es
 precision highp float;
 layout(location=0) in vec2 corner;layout(location=1) in vec4 matrix;
 layout(location=2) in vec4 pose;layout(location=3) in vec4 masks;
 layout(location=4) in vec4 style;layout(location=5) in vec4 tint;layout(location=6) in vec4 light;
 uniform vec2 viewport;out vec2 uv;flat out vec4 images;flat out vec4 material;flat out vec4 colour;flat out vec4 illumination;
 void main(){vec2 p=pose.xy+mat2(matrix.x,matrix.y,matrix.z,matrix.w)*(corner*pose.zw);
 gl_Position=vec4(p/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);uv=corner+.5;
 images=masks;material=style;colour=tint;illumination=light;}`;
 const fs=`#version 300 es
 precision highp float;precision highp sampler2DArray;
 in vec2 uv;flat in vec4 images;flat in vec4 material;flat in vec4 colour;flat in vec4 illumination;
 uniform sampler2DArray atlas;out vec4 pixel;
 void main(){vec4 core=texture(atlas,vec3(uv,images.x));
 if(material.x>1.5){float p=clamp(.5-dot(uv-.5,illumination.xy)/1.1,0.,1.);
 float a=(p<.54?mix(illumination.z,.035,p/.54):mix(.035,0.,(p-.54)/.46))*core.a*material.z;
 pixel=vec4(colour.rgb*a,a);return;}
 vec3 rgb=min(vec3(1.),core.rgb*images.w)*core.a*images.z;
 float alpha=core.a*images.z;
 if(material.x<.5){vec4 glow=texture(atlas,vec3(uv,images.y));
 vec3 halo=glow.rgb*glow.a*min(1.,images.z*.65*material.y);
 rgb=rgb+halo*(1.-rgb);alpha=max(alpha,max(halo.r,max(halo.g,halo.b)));}
 pixel=vec4(rgb*material.z,alpha*material.z);}`;
 function compile(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;}
 window.nativeShipLampGPU=Object.freeze({
  attach:(canvas,batch)=>owners.set(canvas,batch),detach:canvas=>owners.delete(canvas),
  supports:ctx=>window.nativeShipLampGPUEnabled!==false&&owners.get(ctx.canvas)?.active===true,
  queue:(ctx,...args)=>window.nativeShipLampGPUEnabled!==false&&owners.get(ctx.canvas)?.queue(ctx,...args)||false,
  snapshot:space=>owners.get(space)?.snapshot()||null,
  beginStandalone(ctx,enabled=true){
   if(window.vexedShieldGPU)return;
   let entry=standalone.get(ctx.canvas);
   if(!enabled||window.nativeFlightLightingEnabled===false||window.nativeShipLampGPUEnabled===false){if(entry?.canvas){entry.canvas.hidden=true;entry.batch.begin(false);}return;}
   if(!entry){
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');canvas.id='gpu-ship-lamp-overlay';
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';canvas.hidden=true;
    const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,powerPreference:'high-performance'});
    if(!gl){standalone.set(ctx.canvas,{failed:true});return;}
    try{const batch=window.createVexedShipLampBatch({gl},ctx.canvas);entry={canvas,gl,batch};ctx.canvas.parentElement.insertBefore(canvas,ctx.canvas.nextSibling);standalone.set(ctx.canvas,entry);standaloneCanvases.add(ctx.canvas);
     canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();canvas.hidden=true;entry.batch.begin(false);});
     canvas.addEventListener('webglcontextrestored',()=>{entry.batch.destroy();try{entry.batch=window.createVexedShipLampBatch({gl},ctx.canvas);}catch(error){entry.failed=true;canvas.hidden=true;}});}
    catch(error){standalone.set(ctx.canvas,{failed:true});return;}
   }
   if(entry.failed||entry.gl.isContextLost())return;
   if(entry.canvas.width!==ctx.canvas.width||entry.canvas.height!==ctx.canvas.height){entry.canvas.width=ctx.canvas.width;entry.canvas.height=ctx.canvas.height;}
   entry.gl.clearColor(0,0,0,0);entry.gl.clear(entry.gl.COLOR_BUFFER_BIT);entry.batch.begin(true);
  },
  endStandalone(ctx){const entry=standalone.get(ctx.canvas);if(!entry||entry.failed||!entry.batch.active)return;entry.canvas.hidden=!entry.batch.render();}
 });
 addEventListener('pagehide',()=>{for(const space of standaloneCanvases){const entry=standalone.get(space);entry?.batch.destroy();entry?.canvas.remove();entry?.gl.getExtension('WEBGL_lose_context')?.loseContext();standalone.delete(space);}standaloneCanvases.clear();});
 window.createVexedShipLampBatch=(renderer,space)=>{
  const gl=renderer.gl,canvas=gl.canvas,program=gl.createProgram();
  const vertex=compile(gl,gl.VERTEX_SHADER,vs),fragment=compile(gl,gl.FRAGMENT_SHADER,fs);
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const vao=gl.createVertexArray(),quad=gl.createBuffer(),buffer=gl.createBuffer(),data=new Float32Array(LIMIT*STRIDE);
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,.5]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);
  for(let i=1;i<=6;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,STRIDE*4,(i-1)*16);gl.vertexAttribDivisor(i,1);}
  const layers=Math.min(LAYERS,gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)),texture=gl.createTexture();
  gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,CELL,CELL,layers);
  for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D_ARRAY,p,gl.LINEAR);
  for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D_ARRAY,p,gl.CLAMP_TO_EDGE);
  const viewport=gl.getUniformLocation(program,'viewport'),sampler=gl.getUniformLocation(program,'atlas');
  const cache=new WeakMap(),templates=new WeakMap(),retained=[],scratch=document.createElement('canvas');scratch.width=scratch.height=CELL;
  const g=scratch.getContext('2d'),stats={frames:0,drawCalls:0,ships:0,lamps:0,uploads:0,evictions:0,fallbacks:0,peakInstances:0};
  let count=0,serial=0,active=false,disposed=false;
  const identity={a:1,b:0,c:0,d:1,e:0,f:0};
  const templateContext={canvas:space,globalCompositeOperation:'source-over',filter:'none',shadowBlur:0,globalAlpha:1,getTransform:()=>identity};
  function layer(image,key,paint){
   let entries=cache.get(image);if(!entries){entries=new Map();cache.set(image,entries);}
   const hit=entries.get(key);if(hit){hit.serial=serial;return hit;}
   let slot=retained.length;
   if(slot>=layers){slot=-1;for(let i=0;i<layers;i++)if(retained[i].serial!==serial&&(slot<0||retained[i].serial<retained[slot].serial))slot=i;
    if(slot<0)return null;const old=retained[slot],owner=old.image.deref();if(owner)cache.get(owner)?.delete(old.key);stats.evictions++;}
   g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.filter='none';g.clearRect(0,0,CELL,CELL);paint(g);
   gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
   gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,slot,CELL,CELL,1,gl.RGBA,gl.UNSIGNED_BYTE,scratch);
   const entry={slot,key,serial,image:new WeakRef(image)};entries.set(key,entry);retained[slot]=entry;stats.uploads++;return entry;
  }
  function emit(m,x,y,w,h,core,glow,pulse,gain,mode,bloom,opacity,light){
   if(count>=LIMIT)return false;
   const o=count++*STRIDE;data[o]=m.a;data[o+1]=m.b;data[o+2]=m.c;data[o+3]=m.d;
   data[o+4]=m.a*x+m.c*y+m.e;data[o+5]=m.b*x+m.d*y+m.f;data[o+6]=w;data[o+7]=h;
   data[o+8]=core;data[o+9]=glow;data[o+10]=pulse;data[o+11]=gain;
   data[o+12]=mode;data[o+13]=bloom;data[o+14]=opacity;data[o+15]=0;
   const colour=Number(light?.color)>>>0;
   data[o+16]=(colour>>16&255)/255;data[o+17]=(colour>>8&255)/255;data[o+18]=(colour&255)/255;data[o+19]=0;
   data[o+20]=light?.x||0;data[o+21]=light?.y||0;data[o+22]=light?.bright||0;data[o+23]=0;return true;
  }
  function queue(ctx,asset,w,h,time,appearance={}){
   if(!active||disposed||gl.isContextLost()||ctx.canvas!==space||asset.damageStage!==0||asset.repairSurface||appearance.kind||appearance.lights===false||window.nativeFlightLightingEnabled===false)return false;
   const effects=asset.profile?.effects;if(!effects||!effects.forEachLamp&&!effects.forEachLightPrimitive)return false;
   if(ctx.globalCompositeOperation!=='source-over'||ctx.shadowBlur||(ctx.filter&&ctx.filter!=='none'))return false;
   const m=ctx.getTransform(),sx=appearance.templateSX??Math.hypot(m.a,m.b),sy=appearance.templateSY??Math.hypot(m.c,m.d),before=count;
   if(!(sx>0&&sy>0))return false;
   const gain=appearance.lightGain??2.8,bloom=appearance.lightBloom??2.5,opacity=ctx.globalAlpha;
   const pw=asset.profile.width||asset.width,ph=asset.profile.height||asset.height;let ok=true;
   if(!appearance.lampTemplate){
    let groups=templates.get(asset);if(!groups){groups=new Map();templates.set(asset,groups);}
    const key=[w,h,Math.round(sx*1024),Math.round(sy*1024),gain,bloom].join(':');let group=groups.get(key);
    if(!group){if(groups.size>=8)groups.delete(groups.keys().next().value);group={data:null,length:0,serial:-1,time:-1};groups.set(key,group);}
    if(group.serial!==serial||group.time!==time){
     if(!queue(templateContext,asset,w,h,time,{...appearance,lampTemplate:true,templateSX:sx,templateSY:sy,localLight:null})){count=before;return false;}
     const length=(count-before)*STRIDE;
     if(!group.data||group.data.length<length)group.data=new Float32Array(length);
     group.data.set(data.subarray(before*STRIDE,count*STRIDE));group.length=length;group.serial=serial;group.time=time;count=before;
    }
    const instances=group.length/STRIDE;
    if(count+instances+(appearance.localLight?1:0)>LIMIT){stats.fallbacks++;return false;}
    data.set(group.data.subarray(0,group.length),count*STRIDE);
    for(let i=0;i<group.length;i+=STRIDE){const o=count*STRIDE+i,x=group.data[i+4],y=group.data[i+5];
     data[o]=m.a;data[o+1]=m.b;data[o+2]=m.c;data[o+3]=m.d;data[o+4]=m.a*x+m.c*y+m.e;data[o+5]=m.b*x+m.d*y+m.f;data[o+14]=opacity;}
    count+=instances;
    const light=appearance.localLight;
    if(light){const entry=layer(asset.art,'sun',g=>g.drawImage(asset.art,0,0,CELL,CELL)),extent=Math.max(asset.width,asset.height);
     if(!entry){count=before;stats.fallbacks++;return false;}
     emit(m,0,0,w,h,entry.slot,entry.slot,1,1,2,0,opacity,{...light,x:Math.cos(light.direction)*asset.width/extent,y:Math.sin(light.direction)*asset.height/extent});}
    stats.ships++;stats.lamps+=count-before;return true;
   }
   if(effects.forEachLamp)effects.forEachLamp(0,time,(textures,p,pulse)=>{
    if(!ok)return;const rw=Math.max(1,Math.round(p.w/pw*w*sx*2)),rh=Math.max(1,Math.round(p.h/ph*h*sy*2));
    const pad=Math.ceil(4*bloom*2*3),cw=rw+pad*2,ch=rh+pad*2,key=[rw,rh,gain,bloom].join(':');
    const core=layer(textures.lit,'core:'+key,g=>g.drawImage(textures.lit,pad/cw*CELL,pad/ch*CELL,rw/cw*CELL,rh/ch*CELL));
    const glow=layer(textures.lit,'glow:'+key,g=>{
     const c=document.createElement('canvas');c.width=cw;c.height=ch;const b=c.getContext('2d');
     b.filter=`brightness(${gain}) blur(${4*bloom*2}px)`;b.drawImage(textures.lit,pad,pad,rw,rh);g.drawImage(c,0,0,CELL,CELL);
    });
    ok=!!core&&!!glow&&emit(m,(p.left+p.w/2)/pw*w-w/2,(p.top+p.h/2)/ph*h-h/2,cw/(2*sx),ch/(2*sy),core.slot,glow.slot,pulse,gain,0,bloom,opacity);
   });
   else effects.forEachLightPrimitive(0,time,{lights:true,lightGain:gain},(image,x,y,lw,lh,alpha,screen,brightness)=>{
    if(!ok)return;const entry=layer(image,'primitive',g=>g.drawImage(image,0,0,CELL,CELL));
    ok=!!entry&&emit(m,(x+lw/2)/pw*w-w/2,(y+lh/2)/ph*h-h/2,lw/pw*w,lh/ph*h,entry.slot,entry.slot,alpha,brightness||1,1,0,opacity);
   });
   const light=appearance.localLight;
   if(ok&&light){const entry=layer(asset.art,'sun',g=>g.drawImage(asset.art,0,0,CELL,CELL)),extent=Math.max(asset.width,asset.height);
    ok=!!entry&&emit(m,0,0,w,h,entry.slot,entry.slot,1,1,2,0,opacity,{...light,x:Math.cos(light.direction)*asset.width/extent,y:Math.sin(light.direction)*asset.height/extent});}
   if(!ok){count=before;stats.fallbacks++;return false;}
   return true;
  }
  function render(){
   active=false;if(!count||disposed)return 0;
   gl.viewport(0,0,canvas.width,canvas.height);gl.enable(gl.BLEND);gl.useProgram(program);gl.uniform2f(viewport,canvas.width,canvas.height);gl.uniform1i(sampler,7);
   gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   gl.bufferSubData(gl.ARRAY_BUFFER,0,data,0,count*STRIDE);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
   stats.drawCalls++;stats.peakInstances=Math.max(stats.peakInstances,count);return count;
  }
  const api=Object.freeze({queue,render,begin(enabled){serial++;count=0;active=enabled&&!disposed;stats.frames++;},get active(){return active&&!disposed&&!gl.isContextLost();},
   snapshot:()=>({...stats,lastInstances:count,layers:retained.length,textureBytes:CELL*CELL*layers*4,bufferBytes:data.byteLength,limits:{instances:LIMIT,layers}}),
   destroy(){if(disposed)return;disposed=true;active=false;owners.delete(space);gl.deleteProgram(program);gl.deleteBuffer(quad);gl.deleteBuffer(buffer);gl.deleteTexture(texture);gl.deleteVertexArray(vao);retained.length=0;}
  });owners.set(space,api);return api;
 };
})();
