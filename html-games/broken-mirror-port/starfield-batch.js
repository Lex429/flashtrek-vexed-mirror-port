/* Ordered star sprites only. Trails retain their original Canvas ordering. */
(() => {
  'use strict';
  const capacity=8192,stride=5,instances=new Float32Array(capacity*stride),matrix=new Float32Array(4);
  const previousTransform=new Float64Array(6);
  let canvas,gl,program,buffer,vao,texture,source=null,context=null,count=0,lost=false,failed=false,renderer='';
  let targetSize,transform,offset,draws=0,submitted=0,uploads=0,limit=0,targetWidth=-1,targetHeight=-1,hasTransform=false;
  const vertex=`#version 300 es
    precision highp float;
    layout(location=0) in vec2 corner;
    layout(location=1) in vec4 sprite;
    layout(location=2) in float opacity;
    uniform vec2 targetSize;
    uniform mat2 transform;
    uniform vec2 offset;
    out vec2 uv;
    out float alpha;
    void main(){
      vec2 point=transform*(sprite.xy+corner*8.)+offset;
      gl_Position=vec4(point.x/targetSize.x*2.-1.,1.-point.y/targetSize.y*2.,0.,1.);
      uv=(sprite.zw+corner*24.)/vec2(504.,240.);
      alpha=opacity;
    }`;
  const fragment=`#version 300 es
    precision highp float;
    uniform sampler2D atlas;
    in vec2 uv;
    in float alpha;
    out vec4 result;
    void main(){result=texture(atlas,uv)*alpha;}`;
  function initialize(){
    if(gl)return !lost;
    if(failed||lost)return false;
    try{
      if(!canvas){
        canvas=document.createElement('canvas');
        canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;context=null;count=0;});
        canvas.addEventListener('webglcontextrestored',()=>{gl=null;source=null;lost=false;failed=false;});
      }
      gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
      if(!gl){failed=true;return false;}
      const compile=(kind,text)=>{
        const shader=gl.createShader(kind);gl.shaderSource(shader,text);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;
      };
      program=gl.createProgram();const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);targetSize=gl.getUniformLocation(program,'targetSize');transform=gl.getUniformLocation(program,'transform');offset=gl.getUniformLocation(program,'offset');
      gl.uniform1i(gl.getUniformLocation(program,'atlas'),0);
      vao=gl.createVertexArray();gl.bindVertexArray(vao);
      const corners=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,corners);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,instances.byteLength,gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,stride*4,0);gl.vertexAttribDivisor(1,1);
      gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,1,gl.FLOAT,false,stride*4,16);gl.vertexAttribDivisor(2,1);
      texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0,0,0,0);targetWidth=targetHeight=-1;hasTransform=false;
      limit=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      const info=gl.getExtension('WEBGL_debug_renderer_info');renderer=info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)||''):'';
      return true;
    }catch{failed=true;gl=null;return false;}
  }
  function begin(ctx,image,backend='auto'){
    context=null;count=draws=submitted=0;
    if(backend==='canvas'||!ctx.getTransform||!ctx.canvas||ctx.imageSmoothingEnabled===false||ctx.imageSmoothingQuality&&ctx.imageSmoothingQuality!=='low'||ctx.globalCompositeOperation!=='source-over'||ctx.filter&&ctx.filter!=='none'||ctx.shadowBlur||!initialize())return false;
    if(backend==='auto'&&/swiftshader|llvmpipe|software rasterizer/i.test(renderer))return false;
    const {width,height}=ctx.canvas;
    if(width*height>4000000||width>limit||height>limit)return false;
    // This private context keeps its program, VAO, texture and instance buffer bound.
    if(targetWidth!==width||targetHeight!==height){
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      gl.viewport(0,0,width,height);gl.uniform2f(targetSize,width,height);targetWidth=width;targetHeight=height;
    }
    if(source!==image){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);source=image;uploads++;}
    const m=ctx.getTransform();
    if(!hasTransform||m.a!==previousTransform[0]||m.b!==previousTransform[1]||m.c!==previousTransform[2]||m.d!==previousTransform[3]){
      matrix[0]=m.a;matrix[1]=m.b;matrix[2]=m.c;matrix[3]=m.d;gl.uniformMatrix2fv(transform,false,matrix);
    }
    if(!hasTransform||m.e!==previousTransform[4]||m.f!==previousTransform[5])gl.uniform2f(offset,m.e,m.f);
    previousTransform[0]=m.a;previousTransform[1]=m.b;previousTransform[2]=m.c;previousTransform[3]=m.d;previousTransform[4]=m.e;previousTransform[5]=m.f;hasTransform=true;
    context=ctx;return true;
  }
  function flush(){
    if(!count||!context||lost){count=0;return;}
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,instances.subarray(0,count*stride));gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
    context.save();context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.drawImage(canvas,0,0);context.restore();draws++;count=0;
  }
  function add(x,y,sx,sy,alpha){
    if(count===capacity)flush();const i=count*stride;
    instances[i]=x;instances[i+1]=y;instances[i+2]=sx;instances[i+3]=sy;instances[i+4]=alpha;count++;submitted++;
  }
  function end(){flush();context=null;return {draws,instances:submitted};}
  function snapshot(){return {available:!!gl&&!lost&&!failed,renderer,uploads,capacity,
    atlasBytes:source?504*240*4:0,framebufferBytes:gl?canvas.width*canvas.height*4:0,instanceBytes:instances.byteLength};}
  window.nativeStarfieldBatch=Object.freeze({begin,add,end,snapshot});
})();
