/* Bounded weapon illumination on actual hull alpha masks. Presentation only. */
(() => {
 'use strict';
 const SURFACES=256,SOURCES=1024,INSTANCES=SURFACES*3,STRIDE=16,CELL=160;
 const vs=`#version 300 es
 precision highp float;layout(location=0) in vec2 corner;layout(location=1) in vec4 matrix;
 layout(location=2) in vec4 pose;layout(location=3) in vec4 lamp;layout(location=4) in vec4 colour;
 uniform vec2 viewport;out vec2 uv;flat out vec4 light;flat out vec4 tint;flat out vec2 aspect;
 void main(){vec2 screen=pose.xy+mat2(matrix.x,matrix.y,matrix.z,matrix.w)*(corner*pose.zw);
 gl_Position=vec4(screen/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);uv=corner+.5;
 aspect=pose.zw/max(pose.z,pose.w);light=lamp;tint=colour;}`;
 const fs=`#version 300 es
 precision highp float;precision highp sampler2DArray;in vec2 uv;flat in vec4 light;flat in vec4 tint;flat in vec2 aspect;
 uniform sampler2DArray masks;out vec4 pixel;
 void main(){vec2 delta=(uv-light.xy)*aspect;float attenuation=exp(-dot(delta,delta)*light.w*2.4);
 vec2 q=(uv-.5)*1.8;float z=sqrt(max(.03,1.-dot(q,q)));
 vec3 normal=normalize(vec3(q,z)),direction=normalize(vec3((light.xy-.5)*aspect,.5));
 float facing=.25+.75*max(0.,dot(normal,direction));
 float alpha=texture(masks,vec3(uv,tint.w)).a*attenuation*light.z*facing;
 vec3 rgb=tint.rgb*alpha;pixel=vec4(rgb,min(1.,alpha));}`;
 function compile(gl,type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 window.createVexedBattleRadiance=(base,options)=>{
  const gl=base.gl,canvas=options.canvas,program=gl.createProgram(),v=compile(gl,gl.VERTEX_SHADER,vs),f=compile(gl,gl.FRAGMENT_SHADER,fs);
  gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const vao=gl.createVertexArray(),quad=gl.createBuffer(),buffer=gl.createBuffer(),data=new Float32Array(INSTANCES*STRIDE);
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,.5]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);
  for(let i=1;i<=4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,STRIDE*4,(i-1)*16);gl.vertexAttribDivisor(i,1);}
  const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,128,128,64);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const mask=document.createElement('canvas');mask.width=mask.height=128;const g=mask.getContext('2d'),layers=new WeakMap(),retained=[];
  const viewport=gl.getUniformLocation(program,'viewport'),sampler=gl.getUniformLocation(program,'masks');
  const surfaces=Array.from({length:SURFACES},()=>({})),sources=Array.from({length:SOURCES},()=>({}));
  const grid=new Map(),buckets=[],bestIds=new Int32Array(3),bestScores=new Float64Array(3),bestX=new Float64Array(3),bestY=new Float64Array(3);
  let surfaceCount=0,sourceCount=0,bucketCount=0,open=false,enabled=true,disposed=false,frame=0,instances=0;
  const stats={radianceDrawCalls:0,radiancePeak:0,radianceMaskUploads:0,radianceSourcePeak:0,radianceRejected:0};
  function layer(asset){let n=layers.get(asset.art);if(n!==undefined){retained[n].frame=frame;return n;}
   n=retained.length;if(n>=64){n=-1;for(let i=0;i<64;i++)if(retained[i].frame!==frame&&(n<0||retained[i].frame<retained[n].frame))n=i;
    if(n<0){stats.radianceRejected++;return -1;}const old=retained[n].art.deref();if(old)layers.delete(old);}
   g.clearRect(0,0,128,128);g.drawImage(asset.art,0,0,128,128);gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);
   gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,n,128,128,1,gl.RGBA,gl.UNSIGNED_BYTE,mask);
   layers.set(asset.art,n);retained[n]={art:new WeakRef(asset.art),frame};stats.radianceMaskUploads++;return n;}
  function surface(ctx,asset,w,h,matrix,alpha=ctx.globalAlpha){if(!open||!enabled||disposed||!asset?.art)return false;
   const m=matrix||ctx.getTransform(),ex=(Math.abs(m.a)*w+Math.abs(m.c)*h)/2,ey=(Math.abs(m.b)*w+Math.abs(m.d)*h)/2;
   if(m.e+ex<0||m.e-ex>canvas.width||m.f+ey<0||m.f-ey>canvas.height)return true;
   if(surfaceCount>=SURFACES){stats.radianceRejected++;return false;}
   const n=layer(asset);if(n<0)return false;
   const s=surfaces[surfaceCount++];s.a=m.a;s.b=m.b;s.c=m.c;s.d=m.d;s.x=m.e;s.y=m.f;s.w=w;s.h=h;s.layer=n;s.alpha=alpha;return true;}
  function source(ax,ay,bx,by,r,colour,power){if(!open||!enabled||disposed||power<.005)return;
   if(Math.max(ax,bx)+r<0||Math.min(ax,bx)-r>canvas.width||Math.max(ay,by)+r<0||Math.min(ay,by)-r>canvas.height)return;
   if(sourceCount>=SOURCES){stats.radianceRejected++;return;}
   const id=sourceCount++,s=sources[id];s.ax=ax;s.ay=ay;s.bx=bx;s.by=by;s.r=r;s.colour=colour;s.power=power;
   const left=Math.max(-1,Math.floor((Math.min(ax,bx)-r)/CELL)),right=Math.min(Math.ceil(canvas.width/CELL),Math.floor((Math.max(ax,bx)+r)/CELL));
   const top=Math.max(-1,Math.floor((Math.min(ay,by)-r)/CELL)),bottom=Math.min(Math.ceil(canvas.height/CELL),Math.floor((Math.max(ay,by)+r)/CELL));
   for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++){const key=(x+1)*65536+y+1;let ids=grid.get(key);if(!ids){ids=buckets[bucketCount]||(buckets[bucketCount]=[]);bucketCount++;ids.length=0;grid.set(key,ids);}ids.push(id);}}
  function weapon(ctx,s,matrix){const m=matrix||ctx.getTransform(),point=(x,y)=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}),scale=Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));
   if(s.kind==='beam'){const a=point(s.x1,s.y1),b=point(s.x2,s.y2),fade=1-Math.min(1,(s.age||0)/Math.max(1,s.duration||180))**4;
    source(a.x,a.y,b.x,b.y,70*scale,s.color,.32*fade);source(b.x,b.y,b.x,b.y,90*scale,s.color,.70*fade);
   }else{const p=point(s.x,s.y);source(p.x,p.y,p.x,p.y,(s.kind==='torpedo'?85:55)*scale,s.color,s.kind==='torpedo'?.8:.5);}}
  function render(){open=false;instances=0;if(!enabled||disposed||!sourceCount)return 0;
   stats.radianceSourcePeak=Math.max(stats.radianceSourcePeak,sourceCount);
   for(let si=0;si<surfaceCount;si++){const s=surfaces[si],ids=grid.get((Math.floor(s.x/CELL)+1)*65536+Math.floor(s.y/CELL)+1);if(!ids)continue;bestScores.fill(0);bestIds.fill(-1);
    for(const id of ids){const light=sources[id],dx=light.bx-light.ax,dy=light.by-light.ay;
     const t=Math.max(0,Math.min(1,((s.x-light.ax)*dx+(s.y-light.ay)*dy)/Math.max(1,dx*dx+dy*dy))),x=light.ax+dx*t,y=light.ay+dy*t;
     const d2=(x-s.x)**2+(y-s.y)**2,score=light.power*Math.exp(-d2/(light.r*light.r)*2.4);
     if(score<.005)continue;let at=0;while(at<3&&bestScores[at]>=score)at++;if(at<3){for(let i=2;i>at;i--){bestScores[i]=bestScores[i-1];bestIds[i]=bestIds[i-1];bestX[i]=bestX[i-1];bestY[i]=bestY[i-1];}bestScores[at]=score;bestIds[at]=id;bestX[at]=x;bestY[at]=y;}}
    for(let bi=0;bi<3;bi++){if(bestIds[bi]<0)break;const light=sources[bestIds[bi]],det=s.a*s.d-s.b*s.c;if(Math.abs(det)<1e-9)continue;const dx=bestX[bi]-s.x,dy=bestY[bi]-s.y;
     const lx=(s.d*dx-s.c*dy)/det,ly=(-s.b*dx+s.a*dy)/det,extent=Math.max(s.w,s.h),scale=Math.max(Math.hypot(s.a,s.b),Math.hypot(s.c,s.d)),o=instances++*STRIDE;
     data[o]=s.a;data[o+1]=s.b;data[o+2]=s.c;data[o+3]=s.d;data[o+4]=s.x;data[o+5]=s.y;data[o+6]=s.w;data[o+7]=s.h;
     data[o+8]=.5+lx/s.w;data[o+9]=.5+ly/s.h;data[o+10]=light.power*s.alpha;data[o+11]=(extent*scale/light.r)**2;
     const c=Number(light.colour)>>>0;data[o+12]=(c>>16&255)/255;data[o+13]=(c>>8&255)/255;data[o+14]=(c&255)/255;data[o+15]=s.layer;
    }}
   if(!instances)return 0;gl.useProgram(program);gl.uniform2f(viewport,canvas.width,canvas.height);gl.uniform1i(sampler,6);
   gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   gl.bufferSubData(gl.ARRAY_BUFFER,0,data,0,instances*STRIDE);gl.blendFunc(gl.ONE,gl.ONE);gl.drawArraysInstanced(gl.TRIANGLES,0,6,instances);
   stats.radianceDrawCalls++;stats.radiancePeak=Math.max(stats.radiancePeak,instances);return instances;}
  return {surface,source,weapon,render,begin(){surfaceCount=sourceCount=bucketCount=0;grid.clear();instances=0;frame++;open=true;},mode(v){enabled=v.enabled&&!v.legacy;},
   snapshot:()=>({...stats,radianceSurfaces:surfaceCount,radianceSources:sourceCount,radianceInstances:instances,radianceBufferBytes:data.byteLength,radianceTextureBytes:128*128*64*4}),
   destroy(){if(disposed)return;disposed=true;gl.deleteProgram(program);gl.deleteVertexArray(vao);gl.deleteBuffer(quad);gl.deleteBuffer(buffer);gl.deleteTexture(texture);surfaceCount=sourceCount=0;grid.clear();}};
 };
})();
