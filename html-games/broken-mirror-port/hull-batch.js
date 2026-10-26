/* Bounded fleet raster batch. Simulation, artwork and lamp timing stay shared. */
(() => {
 'use strict';
 const HULLS=256,LAMPS=4096,ART=64,MASKS=256,STRIDE=20;
 const vertex=`#version 300 es
 precision highp float;
 layout(location=0) in vec2 corner;layout(location=1) in vec4 matrix;
 layout(location=2) in vec4 pose;layout(location=3) in vec4 style;
 layout(location=4) in vec4 light;layout(location=5) in vec4 timing;
 uniform vec2 viewport;out vec2 uv;flat out vec4 material;flat out vec4 illumination;flat out vec4 pulse;
 void main(){vec2 p=pose.xy+mat2(matrix.x,matrix.y,matrix.z,matrix.w)*(corner*pose.zw);
 gl_Position=vec4(p/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
 uv=corner+.5;material=style;illumination=light;pulse=timing;}`;
 const fragment=`#version 300 es
 precision highp float;precision highp sampler2DArray;
 in vec2 uv;flat in vec4 material;flat in vec4 illumination;flat in vec4 pulse;
 uniform sampler2DArray artwork;uniform sampler2DArray hullArtwork;uniform vec4 rectangles[64];uniform float flipped[64];uniform int pass;out vec4 pixel;
 vec4 sampleMask(vec2 p){if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.))))return vec4(0.);return texture(artwork,vec3(p,material.x));}
 void main(){
 if(pass>=4){vec4 c=texture(artwork,vec3(uv,material.x));float a=c.a*material.y;pixel=vec4(min(vec3(1.),c.rgb*pulse.y)*a,a);return;}
 if(pass==0||pass==3){vec2 pos=uv*material.zw,dx=dFdx(pos)*.25,dy=dFdy(pos)*.25;
 vec2 samplePos=pos;if(pass==3&&flipped[int(material.x)]>.5)samplePos.y=1.-samplePos.y;
 vec4 c=(texture(artwork,vec3(samplePos+dx+dy,material.x))+texture(artwork,vec3(samplePos+dx-dy,material.x))+texture(artwork,vec3(samplePos-dx+dy,material.x))+texture(artwork,vec3(samplePos-dx-dy,material.x)))*.25;
 vec4 rect=rectangles[int(material.x)];vec2 hullUV=pass==3?(pos-rect.zw)/rect.xy:uv;
 float p=clamp(.5-dot(hullUV-.5,illumination.xy)/1.1,0.,1.);
 float a=p<.54?mix(illumination.z,.035,p/.54):mix(.035,0.,(p-.54)/.46);
 a*=illumination.w;
 if(pass==3){float mask=any(lessThan(hullUV,vec2(0.)))||any(greaterThan(hullUV,vec2(1.)))?0.:texture(hullArtwork,vec3(pos-rect.zw,material.x)).a;
 a*=mask;c.rgb=c.rgb*(1.-a)+pulse.rgb*a;c.a=a+c.a*(1.-a);
 }else c.rgb=c.rgb*(1.-a)+pulse.rgb*a*c.a;
 pixel=vec4(c.rgb,c.a)*material.y;
 }else{
 vec2 p=(uv-.5)*illumination.xy+.5;vec4 c=sampleMask(p);
 if(pass==1){pixel=vec4(c.rgb*.2*c.a,c.a)*material.y;return;}
 vec3 bright=min(vec3(1.),c.rgb*pulse.y)*c.a*pulse.x;
 vec3 glow=vec3(0.);float total=0.;
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
 float weight=exp(-float(x*x+y*y)*.5);vec4 s=sampleMask(p+vec2(x,y)*illumination.zw);
 glow+=min(vec3(1.),s.rgb*pulse.y)*s.a*weight;total+=weight;}
 vec3 rgb=(bright+glow/total*min(1.,pulse.x*.65*pulse.z))*material.y;
 pixel=vec4(rgb,min(1.,max(rgb.r,max(rgb.g,rgb.b))));
 }} `;
 let pipeline=null,failed=false,owner=null,active=false;
 const stats={frames:0,ships:0,lamps:0,drawCalls:0,composites:0,uploads:0,evictions:0,culled:0,fallbacks:0,rejected:0,contextLosses:0};
 function create(){
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,powerPreference:'high-performance'});
  if(!gl)return null;
  const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=gl.createProgram(),v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment);
  gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const vao=gl.createVertexArray(),quad=gl.createBuffer(),buffer=gl.createBuffer();gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,.5]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,LAMPS*STRIDE*4,gl.DYNAMIC_DRAW);
  for(let i=1;i<=5;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,STRIDE*4,(i-1)*16);gl.vertexAttribDivisor(i,1);}
  const makeTexture=(size,count)=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,size,size,count);
   for(const pname of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D_ARRAY,pname,gl.LINEAR);
   for(const pname of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D_ARRAY,pname,gl.CLAMP_TO_EDGE);return t;};
  const art=makeTexture(256,ART),baked=makeTexture(256,ART),framebuffer=gl.createFramebuffer(),masks=makeTexture(128,MASKS),scratch=document.createElement('canvas'),g=scratch.getContext('2d');
  const images=new WeakMap(),lights=new WeakMap(),retainedArt=[],retainedMasks=[];
  const hullData=new Float32Array(HULLS*STRIDE),bakeHull=new Float32Array(STRIDE),lampData=new Float32Array(LAMPS*STRIDE),normalData=new Float32Array(1024*STRIDE),screenData=new Float32Array(1024*STRIDE),rectangles=new Float32Array(ART*4),flips=new Float32Array(ART);
  const viewport=gl.getUniformLocation(program,'viewport'),sampler=gl.getUniformLocation(program,'artwork'),pass=gl.getUniformLocation(program,'pass'),hullSampler=gl.getUniformLocation(program,'hullArtwork'),rectUniform=gl.getUniformLocation(program,'rectangles'),flipUniform=gl.getUniformLocation(program,'flipped');
  let hullCount=0,lampCount=0,serial=0,lost=false,left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;const fallbackReasons={},usedLayers=new Uint8Array(ART);
  const decline=(reason,asset)=>{const key=reason+':'+asset.type;fallbackReasons[key]=(fallbackReasons[key]||0)+1;return false;};
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;stats.contextLosses++;});
  canvas.addEventListener('webglcontextrestored',()=>{pipeline=null;active=false;owner=null;failed=false;});
  function layer(image,w,h,map,retained,texture,size,limit){
   const key=w+':'+h;let entry=map.get(image);
   if(entry?.key===key){entry.serial=serial;return entry;}
   let slot=entry?.slot??retained.length;
   if(slot>=limit){slot=-1;for(let i=0;i<retained.length;i++)if(retained[i].serial!==serial&&(slot<0||retained[i].serial<retained[slot].serial))slot=i;
    if(slot<0)return null;const previous=retained[slot].image.deref();if(previous)map.delete(previous);stats.evictions++;}
   scratch.width=scratch.height=size;g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.clearRect(0,0,size,size);g.drawImage(image,0,0,w,h);
   gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,size===256);
   gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,slot,size,size,1,gl.RGBA,gl.UNSIGNED_BYTE,scratch);
   entry={slot,key,serial,image:new WeakRef(image)};map.set(image,entry);retained[slot]=entry;stats.uploads++;return entry;
  }
  function emit(data,index,m,x,y,w,h,slot,alpha,sz=1,sw=1){
   const o=index*STRIDE;data[o]=m.a;data[o+1]=m.b;data[o+2]=m.c;data[o+3]=m.d;
   data[o+4]=m.a*x+m.c*y+m.e;data[o+5]=m.b*x+m.d*y+m.f;data[o+6]=w;data[o+7]=h;
   data[o+8]=slot;data[o+9]=alpha;data[o+10]=sz;data[o+11]=sw;return o;
  }
  function draw(data,count,texture,kind){if(!count)return;
   gl.uniform1i(pass,kind);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data,0,count*STRIDE);
   if(kind===2||kind===5)gl.blendFuncSeparate(gl.ONE,gl.ONE_MINUS_SRC_COLOR,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);else gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
   gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);stats.drawCalls++;}
  function flush(ctx){if(!hullCount)return;
   const x=Math.max(0,Math.floor(left)),y=Math.max(0,Math.floor(top)),w=Math.min(canvas.width,Math.ceil(right))-x,h=Math.min(canvas.height,Math.ceil(bottom))-y;
   gl.enable(gl.SCISSOR_TEST);gl.scissor(x,canvas.height-y-h,w,h);
   gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);
   gl.useProgram(program);gl.uniform2f(viewport,canvas.width,canvas.height);gl.uniform1i(sampler,0);gl.activeTexture(gl.TEXTURE0);gl.bindVertexArray(vao);
   gl.uniform4fv(rectUniform,rectangles);gl.uniform1fv(flipUniform,flips);gl.uniform1i(hullSampler,1);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D_ARRAY,art);gl.activeTexture(gl.TEXTURE0);
   draw(hullData,hullCount,baked,3);
   gl.disable(gl.SCISSOR_TEST);
   ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.shadowBlur=0;ctx.drawImage(canvas,x,y,w,h,x,y,w,h);ctx.restore();
   stats.compositePixels=(stats.compositePixels||0)+w*h;left=top=Infinity;right=bottom=-Infinity;
   stats.composites++;hullCount=lampCount=0;usedLayers.fill(0);serial++;
  }
  function prepare(entry,asset,rw,rh,w,h,time,appearance,lit,pad){
   const rate=appearance.localLight?60:20,stamp=Math.floor(time*rate/1000),gain=appearance.lightGain??2.8,bloom=appearance.lightBloom??2.5;
   const key=[rw,rh,lit,lit?stamp:0,gain,bloom].join(':');if(entry.bakedKey===key)return true;
   const cw=rw+pad*2,ch=rh+pad*2;rectangles.set([rw/256,rh/256,pad/256,pad/256],entry.slot*4);
   if(lit&&asset.profile&&!asset.profile.effects.forEachLamp&&!asset.profile.effects.forEachLightPrimitive){
    flips[entry.slot]=0;
    scratch.width=scratch.height=256;g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(asset.art,pad,pad,rw,rh);
    g.save();g.translate(pad+rw/2,pad+rh/2);g.scale(rw/w,rh/h);
    asset.profile.effects.draw(g,{x:0,y:0,w,h},0,0,stamp*1000/rate,{lights:true,damage:false,lightGain:gain,lightBloom:bloom,rasterScale:2});g.restore();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY,baked);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,entry.slot,256,256,1,gl.RGBA,gl.UNSIGNED_BYTE,scratch);stats.uploads++;
   }else{
    flips[entry.slot]=1;
    lampCount=0;let normalCount=0,screenCount=0;
    if(lit&&asset.profile){const m={a:rw/asset.width,b:0,c:0,d:rh/asset.height,e:pad,f:pad};let overflow=false;
     if(asset.profile.effects.forEachLightPrimitive){
      asset.profile.effects.forEachLightPrimitive(0,stamp*1000/rate,{lightGain:gain},(image,x,y,w,h,alpha,screen,gain)=>{
       if((screen?screenCount:normalCount)>=1024){overflow=true;return;}const mask=layer(image,128,128,lights,retainedMasks,masks,128,MASKS);if(!mask){overflow=true;return;}
       const data=screen?screenData:normalData,o=emit(data,screen?screenCount++:normalCount++,m,x+w/2,y+h/2,w,h,mask.slot,alpha);data[o+17]=gain;
      });stats.genericSprites=(stats.genericSprites||0)+1;
     }else asset.profile.effects.forEachLamp(0,stamp*1000/rate,(textures,p,pulse)=>{
      if(lampCount>=LAMPS){overflow=true;return;}const mask=layer(textures.lit,128,128,lights,retainedMasks,masks,128,MASKS);if(!mask){overflow=true;return;}
      const radius=(2+2*Math.round(pulse*16)/16)*bloom*2,px=radius*3/m.a,py=radius*3/m.d,lw=textures.lit.width,lh=textures.lit.height;
      const o=emit(lampData,lampCount++,m,p.left+lw/2,p.top+lh/2,lw+px*2,lh+py*2,mask.slot,1);
      lampData[o+12]=(lw+px*2)/lw;lampData[o+13]=(lh+py*2)/lh;lampData[o+14]=radius/(lw*m.a);lampData[o+15]=radius/(lh*m.d);
      lampData[o+16]=pulse;lampData[o+17]=gain;lampData[o+18]=bloom;lampData[o+19]=0;stats.lamps++;
     });if(overflow)return false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,baked,0,entry.slot);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.bindFramebuffer(gl.FRAMEBUFFER,null);return false;}
    gl.viewport(0,0,256,256);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.useProgram(program);gl.uniform2f(viewport,256,256);gl.uniform1i(sampler,0);gl.activeTexture(gl.TEXTURE0);gl.bindVertexArray(vao);
    emit(bakeHull,0,{a:1,b:0,c:0,d:1,e:0,f:0},pad+rw/2,pad+rh/2,rw,rh,entry.slot,1,rw/256,rh/256);
    draw(bakeHull,1,art,0);draw(lampData,lampCount,masks,1);draw(lampData,lampCount,masks,2);draw(normalData,normalCount,masks,4);draw(screenData,screenCount,masks,5);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   }
   lampCount=0;entry.bakedKey=key;stats.spriteUpdates=(stats.spriteUpdates||0)+1;return true;
  }
  function queue(ctx,asset,w,h,time,appearance,matrix=null,opacity=ctx.globalAlpha){
   if(!(w>0&&h>0&&Number.isFinite(w+h+time)))return decline('geometry',asset);
   if(lost||ctx.globalCompositeOperation!=='source-over'||(ctx.filter&&ctx.filter!=='none')||ctx.shadowBlur)return decline('style',asset);
   const lit=window.nativeFlightLightingEnabled!==false&&appearance.lights!==false;
   if(asset.damageStage!==0)return decline('stage-'+asset.damageStage,asset);
   if(appearance.kind||asset.repairSurface)return decline('warp-repair',asset);
   const m=matrix||ctx.getTransform(),sx=Math.hypot(m.a,m.b),sy=Math.hypot(m.c,m.d),rw=Math.max(1,Math.round(w*sx*2)),rh=Math.max(1,Math.round(h*sy*2));
   const pad=lit?Math.ceil(Math.max(64,Math.max(rw,rh)*.35)):0,cw=rw+pad*2,ch=rh+pad*2;
   if(cw>256||ch>256||!(sx>0&&sy>0))return decline('size',asset);
   const px=pad*w/rw,py=pad*h/rh,ex=(Math.abs(m.a)*(w+px*2)+Math.abs(m.c)*(h+py*2))/2,ey=(Math.abs(m.b)*(w+px*2)+Math.abs(m.d)*(h+py*2))/2;
   if(m.e+ex<0||m.e-ex>canvas.width||m.f+ey<0||m.f-ey>canvas.height){stats.culled++;return true;}
   if(hullCount>=HULLS)flush(ctx);
   // Each layer contains its own bloom. Final hull instances retain painter order.
   const previous=images.get(asset.art),stamp=Math.floor(time*(appearance.localLight?60:20)/1000),bakedKey=[rw,rh,lit,lit?stamp:0,appearance.lightGain??2.8,appearance.lightBloom??2.5].join(':');
   if(previous&&usedLayers[previous.slot]&&(previous.key!==rw+':'+rh||previous.bakedKey!==bakedKey))flush(ctx);
   let entry=layer(asset.art,rw,rh,images,retainedArt,art,256,ART);if(!entry){flush(ctx);entry=layer(asset.art,rw,rh,images,retainedArt,art,256,ART);if(!entry)return false;}
   if(!prepare(entry,asset,rw,rh,w,h,time,appearance,lit,pad))return decline('atlas',asset);
   left=Math.min(left,m.e-ex-1);top=Math.min(top,m.f-ey-1);right=Math.max(right,m.e+ex+1);bottom=Math.max(bottom,m.f+ey+1);
   const o=emit(hullData,hullCount++,m,0,0,w+px*2,h+py*2,entry.slot,opacity,cw/256,ch/256),light=window.nativeFlightLightingEnabled!==false?appearance.localLight:null;
   hullData[o+12]=light?Math.cos(light.direction)*asset.width/Math.max(asset.width,asset.height):0;hullData[o+13]=light?Math.sin(light.direction)*asset.height/Math.max(asset.width,asset.height):0;
   hullData[o+14]=light?.bright||0;hullData[o+15]=light?1:0;const c=Number(light?.color)>>>0;
   hullData[o+16]=(c>>16&255)/255;hullData[o+17]=(c>>8&255)/255;hullData[o+18]=(c&255)/255;hullData[o+19]=0;usedLayers[entry.slot]=1;stats.ships++;return true;
  }
  return {canvas,queue,flush,begin(ctx){if(lost)return false;if(canvas.width!==ctx.canvas.width||canvas.height!==ctx.canvas.height){canvas.width=ctx.canvas.width;canvas.height=ctx.canvas.height;}hullCount=lampCount=0;left=top=Infinity;right=bottom=-Infinity;usedLayers.fill(0);serial++;return true;},
   snapshot:()=>{const cpuBufferBytes=hullData.byteLength+lampData.byteLength+normalData.byteLength+screenData.byteLength+bakeHull.byteLength+rectangles.byteLength+flips.byteLength,gpuBufferBytes=LAMPS*STRIDE*4+48;
    return {available:!lost,glError:lost?null:gl.getError(),artLayers:retainedArt.length,lampLayers:retainedMasks.length,fallbackReasons:{...fallbackReasons},textureBytes:256*256*ART*8+128*128*MASKS*4,drawingBufferBytes:canvas.width*canvas.height*4,cpuBufferBytes,gpuBufferBytes,bufferBytes:cpuBufferBytes+gpuBufferBytes};},
   destroy(){gl.deleteProgram(program);gl.deleteBuffer(quad);gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);gl.deleteFramebuffer(framebuffer);for(const t of [art,baked,masks])gl.deleteTexture(t);lost=true;}};
 }
 window.nativeHullBatch=Object.freeze({
  begin(ctx){if(window.nativeShipLampGPU?.supports(ctx)||window.nativeHullBatchEnabled===false||(window.nativeHullBatchEnabled!==true&&window.nativeFlightLightingEnabled===false))return;try{if(!pipeline&&!failed)pipeline=create();if(!pipeline){failed=true;return;}active=pipeline.begin(ctx);owner=ctx;stats.frames++;}catch(error){failed=true;active=false;console.warn('Fleet batch unavailable; using shared Canvas artwork.',error.message);}},
  queue(ctx,...args){if(!active||ctx!==owner)return false;const accepted=pipeline.queue(ctx,...args);if(!accepted){pipeline.flush(ctx);stats.fallbacks++;}return accepted;},
  queueShip(ctx,asset,x,y,w,h,angle,time,appearance){
   if(!active||ctx!==owner||!asset?.art)return false;
   const base=ctx.getTransform(),c=Math.cos(angle),s=Math.sin(angle),squeeze=appearance.squeezeX??1,
    m={a:(base.a*c+base.c*s)*squeeze,b:(base.b*c+base.d*s)*squeeze,c:base.c*c-base.a*s,d:base.d*c-base.b*s,e:base.a*x+base.c*y+base.e,f:base.b*x+base.d*y+base.f},alpha=ctx.globalAlpha*(appearance.alpha??1);
   const accepted=pipeline.queue(ctx,asset,w,h,time,appearance,m,alpha);
   if(accepted)window.nativeEffectProfiles?.queueShipSurface?.(ctx,asset,w,h,m,alpha);
   else{pipeline.flush(ctx);stats.fallbacks++;}return accepted;
  },
  flush(ctx){if(active&&ctx===owner)pipeline.flush(ctx);},
  end(ctx){if(active&&ctx===owner){pipeline.flush(ctx);active=false;owner=null;}},
  destroy(){pipeline?.destroy();pipeline=null;active=false;owner=null;failed=false;},
  snapshot:()=>({...stats,...pipeline?.snapshot(),active,limits:{hulls:HULLS,lamps:LAMPS,artLayers:ART,lampLayers:MASKS}})
 });
 addEventListener('pagehide',()=>window.nativeHullBatch.destroy());
})();
