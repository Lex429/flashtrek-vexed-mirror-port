/* Bounded, instanced ship layers behind the shared Canvas presentation owner. */
(() => {
  'use strict';
  const atlasSize=2048,atlasLayers=2,maxInstances=256,stride=32;
  let canvas,gl,program,buffer,vao,texture,uniformSize,context=null,enabled=true,lost=false,count=0;
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  let renderer='';
  const instances=new Float32Array(maxInstances*stride),entries=new Map(),queued=new Set(),transparent=new Uint8Array((atlasSize+4)*8);
  const shelves=Array.from({length:atlasLayers},()=>({x:0,y:0,height:0}));
  let epoch=1;
  const counters={draws:0,instances:0,flushes:0,uploads:0,uploadPixels:0,presentationPixels:0,submittedPixels:0,atlasResets:0,contextLosses:0,failures:0};
  const vertex=`#version 300 es
  precision highp float;
  layout(location=0) in vec2 corner;
  layout(location=1) in vec4 transform;
  layout(location=2) in vec4 position;
  layout(location=3) in vec4 artRect;
  layout(location=4) in vec4 effectsRect;
  layout(location=5) in vec4 geometry;
  layout(location=6) in vec4 tint;
  layout(location=7) in vec4 gradient;
  layout(location=8) in vec4 layers;
  uniform vec2 targetSize;
  out vec3 effectsUV;
  out vec4 light;
  out vec2 parameter;
  flat out vec4 artBounds;
  flat out vec3 artOffset;
  flat out vec2 lightSlope;
  void main(){
    vec2 local=position.xy+corner*position.zw;
    vec2 point=vec2(transform.x*local.x+transform.z*local.y,transform.y*local.x+transform.w*local.y)+geometry.xy;
    gl_Position=vec4(point.x/targetSize.x*2.-1.,1.-point.y/targetSize.y*2.,0.,1.);
    effectsUV=vec3(effectsRect.xy+corner*effectsRect.zw,layers.y);
    artBounds=artRect*2048.;
    artOffset=vec3((artRect.xy-effectsRect.xy)*2048.-(effectsRect.zw-artRect.zw)*1024.,layers.x);
    lightSlope=gradient.xy/(effectsRect.zw*2048.);
    light=tint;
    parameter=vec2(.5+dot(corner-.5,gradient.xy),layers.z);
  }`;
  const fragment=`#version 300 es
  precision highp float;
  precision highp sampler2DArray;
  uniform sampler2DArray atlas;
  in vec3 effectsUV;
  in vec4 light;
  in vec2 parameter;
  flat in vec4 artBounds;
  flat in vec3 artOffset;
  flat in vec2 lightSlope;
  out vec4 result;
  vec4 compose(ivec2 point){
    ivec2 source=point+ivec2(round(artOffset.xy));
    vec4 base=any(lessThan(vec2(source),artBounds.xy))||any(greaterThanEqual(vec2(source),artBounds.xy+artBounds.zw))?vec4(0.):texelFetch(atlas,ivec3(source,int(artOffset.z)),0);
    float t=clamp(parameter.x+dot(vec2(point)+.5-effectsUV.xy*2048.,lightSlope),0.,1.);
    float strength=t<.54?mix(light.a,.035,t/.54):mix(.035,0.,(t-.54)/.46);
    strength=parameter.y<0.?0.:floor(strength*base.a*255.+.5)/255.;
    base=floor((vec4(light.rgb*strength,strength)+base*(1.-strength))*255.+.5)/255.;
    vec4 effect=texelFetch(atlas,ivec3(point,int(effectsUV.z)),0);
    return floor((effect+base*(1.-effect.a))*255.+.5)/255.;
  }
  void main(){
    vec2 samplePoint=effectsUV.xy*2048.-.5,fraction=fract(samplePoint);ivec2 point=ivec2(floor(samplePoint));
    // Composite at the retained raster's texels before interpolation, matching
    // Canvas' layer order even along small coloured lamps and hull alpha edges.
    result=mix(mix(compose(point),compose(point+ivec2(1,0)),fraction.x),mix(compose(point+ivec2(0,1)),compose(point+ivec2(1,1)),fraction.x),fraction.y)*abs(parameter.y);
  }`;
  function fail(){enabled=false;counters.failures++;return false;}
  function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;}
  function initialize(){
    if(gl)return !lost;
    try{
      canvas=document.createElement('canvas');gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
      if(!gl)return fail();
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;counters.contextLosses++;});
      canvas.addEventListener('webglcontextrestored',()=>{gl=null;lost=false;enabled=true;entries.clear();for(const shelf of shelves)Object.assign(shelf,{x:0,y:0,height:0});epoch++;});
      program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);uniformSize=gl.getUniformLocation(program,'targetSize');gl.uniform1i(gl.getUniformLocation(program,'atlas'),0);
      vao=gl.createVertexArray();gl.bindVertexArray(vao);
      const corners=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,corners);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,instances.byteLength,gl.DYNAMIC_DRAW);
      for(let i=1;i<=8;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,stride*4,(i-1)*16);gl.vertexAttribDivisor(i,1);}
      texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,atlasSize,atlasSize,atlasLayers);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.SCISSOR_TEST);
      const info=gl.getExtension('WEBGL_debug_renderer_info');renderer=info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)||''):'';return true;
    }catch(error){counters.error=String(error);return fail();}
  }
  function begin(ctx,{backend='auto'}={}){
    flush();context=null;
    if(backend==='canvas'||!enabled||!initialize())return false;
    if(backend==='auto'){
      if(renderer&&/swiftshader|llvmpipe|software rasterizer/i.test(renderer))return false;
    }
    context=ctx;return true;
  }
  function resetAtlas(){
    flush();entries.clear();epoch++;for(const shelf of shelves)Object.assign(shelf,{x:0,y:0,height:0});counters.atlasResets++;
  }
  function allocate(width,height){
    if(width+4>atlasSize||height+4>atlasSize)return null;
    for(let layer=0;layer<atlasLayers;layer++){
      const shelf=shelves[layer];
      if(shelf.x+width+4>atlasSize){shelf.x=0;shelf.y+=shelf.height;shelf.height=0;}
      if(shelf.y+height+4>atlasSize)continue;
      const rect={x:shelf.x+2,y:shelf.y+2,width,height,layer,epoch};shelf.x+=width+4;shelf.height=Math.max(shelf.height,height+4);
      // Clearing the guard texels also makes reused atlas space safe after a reset.
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,rect.x-2,rect.y-2,layer,width+4,2,1,gl.RGBA,gl.UNSIGNED_BYTE,transparent);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,rect.x-2,rect.y+height,layer,width+4,2,1,gl.RGBA,gl.UNSIGNED_BYTE,transparent);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,rect.x-2,rect.y,layer,2,height,1,gl.RGBA,gl.UNSIGNED_BYTE,transparent);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,rect.x+width,rect.y,layer,2,height,1,gl.RGBA,gl.UNSIGNED_BYTE,transparent);
      return rect;
    }
    return null;
  }
  function upload(rect,source){gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,rect.x,rect.y,rect.layer,rect.width,rect.height,1,gl.RGBA,gl.UNSIGNED_BYTE,source);counters.uploads++;counters.uploadPixels+=rect.width*rect.height;}
  function retain(key,base,effects,frame){
    let entry=entries.get(key);
    if(!entry){
      const source=typeof base==='function'?base():base;
      let art=allocate(source.width,source.height),effect=art&&allocate(effects.width,effects.height);
      if(!effect){resetAtlas();art=allocate(source.width,source.height);effect=art&&allocate(effects.width,effects.height);}
      if(!effect)return null;
      entry={art,effect,frame};entries.set(key,entry);upload(art,source);upload(effect,effects);
    }else if(entry.frame!==frame){if(queued.has(key))flush();upload(entry.effect,effects);entry.frame=frame;}
    return entry;
  }
  function draw(ctx,key,base,effects,frame,box,asset,light){
    if(context!==ctx||lost||!enabled)return false;
    const entry=retain(key,base,effects,frame);if(!entry)return false;
    if(count===maxInstances)flush();
    const m=ctx.getTransform(),i=count*stride;instances.set([m.a,m.b,m.c,m.d,box.x,box.y,box.width,box.height],i);
    const rect=(value,offset)=>instances.set([value.x/atlasSize,value.y/atlasSize,value.width/atlasSize,value.height/atlasSize],i+offset);
    rect(entry.art,8);rect(entry.effect,12);instances.set([m.e,m.f,effects.width/entry.art.width,effects.height/entry.art.height],i+16);
    const color=Number(light?.color)>>>0;instances.set([(color>>16&255)/255,(color>>8&255)/255,(color&255)/255,light?.bright??0],i+20);
    let gx=0,gy=0;
    if(light){const angle=((Math.round(light.direction*360/Math.PI)%720)+720)%720*Math.PI/360,nx=Math.cos(angle)*asset.width/box.rw,ny=Math.sin(angle)*asset.height/box.rh,normal=nx*nx+ny*ny,extent=Math.max(asset.width,asset.height),dx=nx*extent*.55/normal,dy=ny*extent*.55/normal,n=2*(dx*dx+dy*dy);gx=-dx*effects.width/n;gy=-dy*effects.height/n;}
    instances.set([gx,gy,0,0],i+24);instances.set([entry.art.layer,entry.effect.layer,light?ctx.globalAlpha:-ctx.globalAlpha,0],i+28);
    const x=m.a*box.x+m.c*box.y+m.e,y=m.b*box.x+m.d*box.y+m.f,dx=m.a*box.width,dy=m.b*box.width,ex=m.c*box.height,ey=m.d*box.height;
    left=Math.min(left,x,x+dx,x+ex,x+dx+ex);top=Math.min(top,y,y+dy,y+ey,y+dy+ey);
    right=Math.max(right,x,x+dx,x+ex,x+dx+ex);bottom=Math.max(bottom,y,y+dy,y+ey,y+dy+ey);
    counters.submittedPixels+=Math.abs((m.a*m.d-m.b*m.c)*box.width*box.height);
    count++;queued.add(key);counters.instances++;return true;
  }
  function flush(ctx){
    if(ctx&&ctx!==context)return;
    if(!count||!context||lost){count=0;queued.clear();left=top=Infinity;right=bottom=-Infinity;return;}
    const width=context.canvas.width,height=context.canvas.height;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const x=Math.max(0,Math.floor(left)-1),y=Math.max(0,Math.floor(top)-1),w=Math.max(0,Math.min(width,Math.ceil(right)+1)-x),h=Math.max(0,Math.min(height,Math.ceil(bottom)+1)-y);
    if(w&&h){
      gl.viewport(0,0,width,height);gl.scissor(x,height-y-h,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.uniform2f(uniformSize,width,height);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,instances.subarray(0,count*stride));gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
      context.save();context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';context.drawImage(canvas,x,y,w,h,x,y,w,h);context.restore();counters.draws++;counters.presentationPixels+=w*h;
    }
    counters.flushes++;count=0;queued.clear();left=top=Infinity;right=bottom=-Infinity;
  }
  function end(){flush();context=null;}
  function release(key){entries.delete(key);}
  function reset(){resetAtlas();for(const key of Object.keys(counters))counters[key]=0;}
  function snapshot(){return {available:!!gl&&!lost,enabled,renderer,atlasBytes:gl?atlasSize*atlasSize*atlasLayers*4:0,framebufferByteEstimate:canvas?canvas.width*canvas.height*4:0,entries:entries.size,queued:count,counters:{...counters}};}
  window.nativeShipGpuBatch=Object.freeze({begin,draw,flush,end,snapshot,release,reset,active:ctx=>context===ctx&&!lost&&enabled});
})();
