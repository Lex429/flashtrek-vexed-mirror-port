/* Continuously evaluated gas. No image assets, baked clouds or gameplay random. */
(() => {
  'use strict';
  const root=typeof window==='undefined'?self:window;
  const moduleURL=typeof document==='undefined'?null:document.currentScript?.src;
  const clamp=n=>Math.max(0,Math.min(1,n)),mix=(a,b,t)=>a+(b-a)*t;
  const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const palettes=Object.freeze([
    Object.freeze({shadow:[.025,.045,.065],light:[.36,.63,.69]}),
    Object.freeze({shadow:[.05,.025,.065],light:[.65,.35,.57]}),
    Object.freeze({shadow:[.018,.045,.042],light:[.34,.65,.53]}),
    Object.freeze({shadow:[.07,.022,.014],light:[.95,.52,.30]}),
    Object.freeze({shadow:[.008,.020,.085],light:[.18,.47,.98]}),
    Object.freeze({shadow:[.035,.045,.043],light:[.56,.64,.58]}),
    Object.freeze({shadow:[.085,.047,.008],light:[.98,.76,.22]}),
    Object.freeze({shadow:[.075,.009,.016],light:[.92,.25,.22]})
  ]);
  const previewNames=Object.freeze(['purple','red','blue','yellow']);
  const previewPalettes=Object.freeze([
    Object.freeze({shadow:[.055,.020,.095],light:[.72,.36,.95]}),
    Object.freeze({shadow:[.090,.012,.020],light:[.96,.24,.27]}),
    Object.freeze({shadow:[.012,.035,.105],light:[.22,.48,1.00]}),
    Object.freeze({shadow:[.105,.062,.009],light:[1.00,.81,.24]})
  ]);
  const previewMode=name=>name==='four'?1:previewNames.includes(name)?previewNames.indexOf(name)+2:0;
  function paletteAt(x,y,preview,style=0){
    const mode=typeof preview==='number'?preview:previewMode(preview);
    if(!mode)return palettes[style];if(mode>1)return previewPalettes[mode-2];
    const tx=smooth((x+.3)/.6),ty=smooth((y+.3)/.6);
    const blend=kind=>[0,1,2].map(c=>mix(mix(previewPalettes[0][kind][c],previewPalettes[1][kind][c],tx),mix(previewPalettes[2][kind][c],previewPalettes[3][kind][c],tx),ty));
    return {shadow:blend('shadow'),light:blend('light')};
  }
  const vertex=`#version 300 es
  precision highp float;
  out vec2 v_uv;
  void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));v_uv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
  const fragment=`#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 fragColor;
  uniform vec2 u_view;
  uniform vec4 u_planes[3];
  uniform vec4 u_layers[3];
  uniform vec3 u_shadow;
  uniform vec3 u_light;
  uniform float u_time;
  uniform float u_seed;
  uniform int u_style;
  uniform int u_wakeCount;
  uniform vec4 u_wakes[24];
  uniform vec4 u_wakeInfo[24];
  uniform float u_densityFloor;
  uniform bool u_continuous;
  uniform int u_colourPreview;
  uniform int u_clearVolumeCount;
  uniform vec4 u_clearVolumes[16];
  uniform float u_clearAngles[16];
  const vec3 previewShadow[4]=vec3[4](${previewPalettes.map(p=>'vec3('+p.shadow.map(n=>n.toFixed(3)).join(',')+')').join(',')});
  const vec3 previewLight[4]=vec3[4](${previewPalettes.map(p=>'vec3('+p.light.map(n=>n.toFixed(3)).join(',')+')').join(',')});
  float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
  float noise(vec3 p){
    vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float fbm(vec3 p){return .57*noise(p)+.29*noise(p*2.03+vec3(8.1,3.7,5.2))+.14*noise(p*4.11+vec3(2.4,9.2,1.7));}
  vec4 gas(vec2 uv,float seed){
    float edge=u_continuous?1.0:1.0-smoothstep(.38,1.0,dot(uv,uv));if(edge<=0.0)return vec4(0);
    float t=u_time;
    vec3 p=vec3(uv*3.7,seed*.23);
    vec2 warp=vec2(noise(p*.67+vec3(.17*t,.11*t,.23*t)),noise(p*.67+vec3(6.3-.13*t,2.1+.15*t,-.19*t)))-.5;
    p.xy+=warp*2.3+vec2(sin(p.y*.85+t*.29),cos(p.x*.83-t*.23))*.34;
    p+=vec3(.14*t,-.09*t,.31*t);
    float n=fbm(p),fine=noise(p*3.5+vec3(-.11*t,.09*t,.16*t));
    float density=smoothstep(.28,.76,n+(fine-.5)*.13);
    density=max(density,u_densityFloor);
    if(u_style==3&&u_continuous){density*=.84+.16*sin(uv.y*2.0+warp.x*.6);}
    if(u_style==3&&!u_continuous){float a=uv.y-.38-warp.x*.32,b=uv.y+.38+warp.y*.32;density*=min(1.35,exp(-a*a*3.8)+exp(-b*b*3.8));}
    float shade=clamp(.57+(n-fbm(p+vec3(-.14,-.19,.08)))*3.4,.18,1.18);
    float folds=smoothstep(.22,.75,density)*(.28+.72*shade);
    vec3 shadow=u_shadow,light=u_light;
    if(u_colourPreview==1){
      vec2 blend=smoothstep(vec2(-.3),vec2(.3),uv);
      shadow=mix(mix(previewShadow[0],previewShadow[1],blend.x),mix(previewShadow[2],previewShadow[3],blend.x),blend.y);
      light=mix(mix(previewLight[0],previewLight[1],blend.x),mix(previewLight[2],previewLight[3],blend.x),blend.y);
    }
    vec3 colour=mix(shadow,light,folds);
    colour+=light*pow(max(0.0,fine-.53),2.0)*.22;
    float alpha=(1.0-exp(-density*2.3))*edge;
    return vec4(colour,alpha);
  }
  void main(){
    vec2 pixel=vec2(v_uv.x,1.0-v_uv.y)*u_view;vec3 colour=vec3(0);float alpha=0.0;
    float clear=1.0;
    for(int i=0;i<16;i++){
      if(i>=u_clearVolumeCount)break;
      vec2 d=pixel-u_clearVolumes[i].xy;float a=u_clearAngles[i]>=100.0?0.0:u_clearAngles[i],c=cos(a),s=sin(a);
      vec2 uv=vec2(c*d.x+s*d.y,-s*d.x+c*d.y)/(u_clearVolumes[i].zw*.5);
      clear*=u_clearAngles[i]>=100.0?step(1.0,max(abs(uv.x),abs(uv.y))):smoothstep(.38,1.0,dot(uv,uv));
    }
    if(clear==0.0){fragColor=vec4(0);return;}
    vec2 push=vec2(0);float clearing=0.0,rim=0.0,pushWeight=0.0;
    for(int j=0;j<24;j++){
      if(j>=u_wakeCount)break;
      vec2 a=u_wakes[j].xy,b=u_wakes[j].zw,ab=b-a;
      float along=clamp(dot(pixel-a,ab)/max(.01,dot(ab,ab)),0.0,1.0);
      vec2 delta=pixel-(a+ab*along);float distance=length(delta),radius=max(1.0,u_wakeInfo[j].x),strength=u_wakeInfo[j].y;
      if(distance>radius*3.5)continue;
      vec2 normal=distance>.01?delta/distance:vec2(0,1),tangent=vec2(-normal.y,normal.x);
      float core=exp(-distance*distance/(radius*radius)*1.6)*strength;
      float shoulder=exp(-pow((distance-radius*1.3)/(radius*.65),2.0))*strength;
      clearing=max(clearing,core);rim=max(rim,shoulder);
      push+=normal*radius*.40*shoulder+tangent*sin(along*5.5-u_wakeInfo[j].z*1.7)*radius*.16*shoulder;
      pushWeight+=shoulder;
    }
    pixel-=push/max(1.0,pushWeight);
    for(int i=0;i<3;i++){
      if(u_layers[i].x<=0.0)continue;
      vec2 d=pixel-u_planes[i].xy;float a=u_layers[i].y,c=cos(a),s=sin(a);
      vec2 uv=vec2(c*d.x+s*d.y,-s*d.x+c*d.y)/(u_planes[i].zw*.5);
      vec4 field=gas(uv,u_seed+u_layers[i].z);
      float opacity=clamp(field.a*(1.0-min(.97,clearing))*(1.0+rim*.32)*u_layers[i].x,0.0,1.0);
      colour+=(1.0-alpha)*field.rgb*(1.0+rim*.12)*opacity;alpha+=(1.0-alpha)*opacity;
    }
    fragColor=vec4(colour*clear,alpha*clear);
  }`;
  function hash(x,y,z){let n=(Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^0x47415331)>>>0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
  function noise(x,y,z){
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),tx=smooth(x-ix),ty=smooth(y-iy),tz=smooth(z-iz);
    const a=mix(mix(hash(ix,iy,iz),hash(ix+1,iy,iz),tx),mix(hash(ix,iy+1,iz),hash(ix+1,iy+1,iz),tx),ty);
    const b=mix(mix(hash(ix,iy,iz+1),hash(ix+1,iy,iz+1),tx),mix(hash(ix,iy+1,iz+1),hash(ix+1,iy+1,iz+1),tx),ty);
    return mix(a,b,tz);
  }
  function densityAt(x,y,time=0,style=0,seed=0,densityFloor=0,continuous=false){
    const edge=continuous?1:1-smooth((x*x+y*y-.38)/.62);if(edge<=0)return {density:0,shade:0,detail:0};
    let px=x*3.7,py=y*3.7,pz=seed*.23;
    const wx=noise(px*.67+time*.17,py*.67+time*.11,pz*.67+time*.23)-.5;
    const wy=noise(px*.67+6.3-time*.13,py*.67+2.1+time*.15,pz*.67-time*.19)-.5;
    px+=wx*2.3+Math.sin(py*.85+time*.29)*.34;py+=wy*2.3+Math.cos(x*3.7*.83-time*.23)*.34;
    px+=time*.14;py-=time*.09;pz+=time*.31;
    const n=noise(px,py,pz)*.57+noise(px*2.03+8.1,py*2.03+3.7,pz*2.03+5.2)*.29+noise(px*4.11+2.4,py*4.11+9.2,pz*4.11+1.7)*.14;
    const fine=noise(px*3.5-time*.11,py*3.5+time*.09,pz*3.5+time*.16);
    let density=Math.max(densityFloor,smooth((n+(fine-.5)*.13-.28)/.48));
    if(style===3&&continuous)density*=.84+.16*Math.sin(y*2+wx*.6);
    if(style===3&&!continuous){const a=y-.38-wx*.32,b=y+.38+wy*.32;density*=Math.min(1.35,Math.exp(-a*a*3.8)+Math.exp(-b*b*3.8));}
    return {density:(1-Math.exp(-density*2.3))*edge,shade:smooth((density-.22)/.53)*(.62+.38*fine),detail:fine};
  }
  let canvas=null,gl=null,program=null,locations=null,vao=null,lost=false,gpuFailed=false,cpu=null,lastKey='';
  const counters={renders:0,cacheHits:0,contextLosses:0,failures:0,compiles:0};
  let width=0,height=0,software=false,reason='';
  // Uniform uploads copy their inputs. Reuse bounded scratch storage rather
  // than allocating new typed arrays for every animated cloud and tile.
  const positions=new Float32Array(12),layerData=new Float32Array(12),wakePositions=new Float32Array(96),wakeInfo=new Float32Array(96),holes=new Float32Array(64),angles=new Float32Array(16);
  function compile(type,source){
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const info=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(info||'Gas shader compilation failed');}
    return shader;
  }
  function prepare(){
    if(program&&!lost||cpu&&gpuFailed||lost)return;
    if(!canvas){
      canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
      if(canvas.dataset)canvas.dataset.nebulaGas='procedural';
      canvas.addEventListener?.('webglcontextlost',event=>{event.preventDefault();lost=true;program=null;lastKey='';counters.contextLosses++;});
      canvas.addEventListener?.('webglcontextrestored',()=>{lost=false;gpuFailed=false;program=null;lastKey='';});
    }
    try{
      gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
      if(!gl)throw Error('WebGL2 unavailable');
      const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment),linked=gl.createProgram();
      gl.attachShader(linked,vs);gl.attachShader(linked,fs);gl.linkProgram(linked);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(linked,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(linked)||'Gas shader link failed');
      program=linked;vao=gl.createVertexArray();locations={};
      for(const name of ['u_view','u_planes[0]','u_layers[0]','u_shadow','u_light','u_time','u_seed','u_style','u_wakeCount','u_wakes[0]','u_wakeInfo[0]','u_densityFloor','u_continuous','u_colourPreview','u_clearVolumeCount','u_clearVolumes[0]','u_clearAngles[0]'])locations[name]=gl.getUniformLocation(program,name);
      const debug=gl.getExtension('WEBGL_debug_renderer_info'),renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'';
      software=/swiftshader|software|llvmpipe|basic render/i.test(renderer);counters.compiles++;gpuFailed=false;
    }catch(error){gpuFailed=true;reason=String(error.message||error).slice(0,180);counters.failures++;}
    if(gpuFailed&&!cpu){const output=document.createElement('canvas');output.width=96;output.height=64;const ctx=output.getContext('2d');cpu={canvas:output,ctx,pixels:ctx.createImageData(96,64)};}
  }
  function disturbanceAt(x,y,wakes=[]){
    let pushX=0,pushY=0,clearing=0,rim=0,pushWeight=0;
    for(const wake of wakes){
      const ax=wake.ax,ay=wake.ay,dx=wake.bx-ax,dy=wake.by-ay,along=clamp(((x-ax)*dx+(y-ay)*dy)/Math.max(.01,dx*dx+dy*dy));
      const ex=x-ax-dx*along,ey=y-ay-dy*along,distance=Math.hypot(ex,ey),radius=Math.max(1,wake.radius),strength=wake.strength;
      if(distance>radius*3.5)continue;
      const nx=distance>.01?ex/distance:0,ny=distance>.01?ey/distance:1;
      const core=Math.exp(-distance*distance/(radius*radius)*1.6)*strength,shoulder=Math.exp(-Math.pow((distance-radius*1.3)/(radius*.65),2))*strength;
      const curl=Math.sin(along*5.5-(wake.age||0)*1.7)*radius*.16*shoulder;
      clearing=Math.max(clearing,core);rim=Math.max(rim,shoulder);
      pushX+=nx*radius*.40*shoulder-ny*curl;pushY+=ny*radius*.40*shoulder+nx*curl;
      pushWeight+=shoulder;
    }
    return {pushX:pushX/Math.max(1,pushWeight),pushY:pushY/Math.max(1,pushWeight),clearing:Math.min(.97,clearing),rim};
  }
  function fallback(view,planes,style,time,seed,interaction){
    if(!cpu){const output=document.createElement('canvas');output.width=96;output.height=64;const ctx=output.getContext('2d');cpu={canvas:output,ctx,pixels:ctx.createImageData(96,64)};}
    const ratio=Math.min(1,96/view.w,64/view.h),w=Math.max(1,Math.round(view.w*ratio)),h=Math.max(1,Math.round(view.h*ratio));
    if(cpu.canvas.width!==w||cpu.canvas.height!==h){cpu.canvas.width=w;cpu.canvas.height=h;cpu.pixels=cpu.ctx.createImageData(w,h);}
    const data=cpu.pixels.data,fixedPalette=interaction.colourPreview===1?null:paletteAt(0,0,interaction.colourPreview,style);
    const geometry=planes.map((plane,i)=>({...plane,c:Math.cos(plane.angle),s:Math.sin(plane.angle),seed:seed+i*19.3}));
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const screenX=(x+.5)/w*view.w,screenY=(y+.5)/h*view.h;let alpha=0,r=0,g=0,b=0;
      const wake=disturbanceAt(screenX,screenY,interaction.wakes);
      for(const plane of geometry){
        if(plane.alpha<=0)continue;
        const dx=screenX-wake.pushX-plane.x,dy=screenY-wake.pushY-plane.y,px=(plane.c*dx+plane.s*dy)/(plane.width*.5),py=(-plane.s*dx+plane.c*dy)/(plane.height*.5);
        const field=densityAt(px,py,time,style,plane.seed,interaction.densityFloor,interaction.continuous),a=clamp(field.density*(1-wake.clearing)*(1+wake.rim*.32)*plane.alpha),share=(1-alpha)*a*(1+wake.rim*.12);
        const palette=fixedPalette||paletteAt(px,py,1,style);
        r+=mix(palette.shadow[0],palette.light[0],field.shade)*share;
        g+=mix(palette.shadow[1],palette.light[1],field.shade)*share;
        b+=mix(palette.shadow[2],palette.light[2],field.shade)*share;alpha+=(1-alpha)*a;
      }
      let clear=1;for(const hole of interaction.clearVolumes){const dx=screenX-hole.x,dy=screenY-hole.y,c=Math.cos(hole.angle),s=Math.sin(hole.angle),hx=(c*dx+s*dy)/(hole.width*.5),hy=(-s*dx+c*dy)/(hole.height*.5);clear*=hole.continuous?(Math.max(Math.abs(hx),Math.abs(hy))<1?0:1):smooth((hx*hx+hy*hy-.38)/.62);}
      const i=(y*w+x)*4;data[i]=alpha?r/alpha*255:0;data[i+1]=alpha?g/alpha*255:0;data[i+2]=alpha?b/alpha*255:0;data[i+3]=alpha*clear*255;
    }
    cpu.ctx.putImageData(cpu.pixels,0,0);width=w;height=h;return cpu.canvas;
  }
  function render(view,planes,style,time,seed,options={}){
    prepare();
    const interaction={wakes:(options.wakes||[]).slice(0,24),clearVolumes:(options.clearVolumes||[]).slice(0,16),densityFloor:options.densityFloor||0,continuous:!!options.continuous,colourPreview:previewMode(options.colourPreview)};
    const key=JSON.stringify([view.w,view.h,style,time,seed,planes.map(p=>[p.x,p.y,p.width,p.height,p.angle,p.alpha]),interaction]);
    if(lastKey===key){counters.cacheHits++;return program&&!lost?canvas:cpu.canvas;}
    lastKey=key;counters.renders++;
    if(!program||lost||gpuFailed)return fallback(view,planes,style,time,seed,interaction);
    const maxWidth=software?192:384,ratio=Math.min(1,maxWidth/view.w,288/view.h),w=Math.max(1,Math.round(view.w*ratio)),h=Math.max(1,Math.round(view.h*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}width=w;height=h;
    gl.viewport(0,0,w,h);gl.disable(gl.DITHER);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.useProgram(program);gl.bindVertexArray(vao);
    for(let i=0;i<3;i++){const p=planes[i];positions.set([p.x,p.y,p.width,p.height],i*4);layerData.set([p.alpha,p.angle,i*19.3,0],i*4);}
    gl.uniform2f(locations.u_view,view.w,view.h);gl.uniform4fv(locations['u_planes[0]'],positions);gl.uniform4fv(locations['u_layers[0]'],layerData);
    const palette=interaction.colourPreview>1?previewPalettes[interaction.colourPreview-2]:palettes[style];
    gl.uniform3fv(locations.u_shadow,palette.shadow);gl.uniform3fv(locations.u_light,palette.light);
    gl.uniform1i(locations.u_colourPreview,interaction.colourPreview===1?1:0);
    gl.uniform1f(locations.u_time,time);gl.uniform1f(locations.u_seed,seed);gl.uniform1i(locations.u_style,style);
    interaction.wakes.forEach((wake,i)=>{wakePositions.set([wake.ax,wake.ay,wake.bx,wake.by],i*4);wakeInfo.set([wake.radius,wake.strength,wake.age||0,0],i*4);});
    gl.uniform1i(locations.u_wakeCount,interaction.wakes.length);if(interaction.wakes.length){gl.uniform4fv(locations['u_wakes[0]'],wakePositions);gl.uniform4fv(locations['u_wakeInfo[0]'],wakeInfo);}gl.uniform1f(locations.u_densityFloor,interaction.densityFloor);
    gl.uniform1i(locations.u_continuous,interaction.continuous);
    interaction.clearVolumes.forEach((p,i)=>{holes.set([p.x,p.y,p.width,p.height],i*4);angles[i]=p.continuous?100:p.angle;});
    gl.uniform1i(locations.u_clearVolumeCount,interaction.clearVolumes.length);if(interaction.clearVolumes.length){gl.uniform4fv(locations['u_clearVolumes[0]'],holes);gl.uniform1fv(locations['u_clearAngles[0]'],angles);}
    gl.drawArrays(gl.TRIANGLES,0,3);return canvas;
  }
  function metrics(){return {...counters,backend:program&&!lost&&!gpuFailed?'webgl2':'canvas-procedural',width,height,software,reason,contextLost:lost,imageRequests:0,textureBytes:0};}
  function createTextureRenderer(context,{flipY=true}={}){
    // The material renderer owns this context and target texture. Keep the same
    // gas shader/resolution, with texture row zero corresponding to world top.
    const debug=context.getExtension('WEBGL_debug_renderer_info'),device=debug?context.getParameter(debug.UNMASKED_RENDERER_WEBGL):'';
    software=/swiftshader|software|llvmpipe|basic render/i.test(device);
    const shaders=[];let linked=null,target=null,array=null;
    try{
      const compile=(type,source)=>{const s=context.createShader(type);shaders.push(s);context.shaderSource(s,source);context.compileShader(s);
        if(!context.getShaderParameter(s,context.COMPILE_STATUS))throw Error(context.getShaderInfoLog(s)||'Gas texture shader failed');return s;};
      const vs=compile(context.VERTEX_SHADER,flipY?vertex.replace('v_uv=p;','v_uv=vec2(p.x,1.0-p.y);'):vertex),fs=compile(context.FRAGMENT_SHADER,fragment);
      linked=context.createProgram();context.attachShader(linked,vs);context.attachShader(linked,fs);context.linkProgram(linked);
      if(!context.getProgramParameter(linked,context.LINK_STATUS))throw Error(context.getProgramInfoLog(linked)||'Gas texture link failed');
      const loc={};for(const name of ['u_view','u_planes[0]','u_layers[0]','u_shadow','u_light','u_time','u_seed','u_style','u_wakeCount','u_densityFloor','u_continuous','u_colourPreview','u_clearVolumeCount'])loc[name]=context.getUniformLocation(linked,name);
      target=context.createFramebuffer();array=context.createVertexArray();counters.textureCompiles=(counters.textureCompiles||0)+1;
      return {
        draw(texture,w,h,{view,planes,style,time,seed,options={}}){
          context.bindFramebuffer(context.FRAMEBUFFER,target);context.framebufferTexture2D(context.FRAMEBUFFER,context.COLOR_ATTACHMENT0,context.TEXTURE_2D,texture,0);
          context.viewport(0,0,w,h);context.disable(context.DITHER);context.disable(context.SCISSOR_TEST);context.disable(context.BLEND);context.disable(context.DEPTH_TEST);context.useProgram(linked);context.bindVertexArray(array);
          for(let i=0;i<3;i++){const p=planes[i];positions.set([p.x,p.y,p.width,p.height],i*4);layerData.set([p.alpha,p.angle,i*19.3,0],i*4);}
          const mode=previewMode(options.colourPreview),palette=mode>1?previewPalettes[mode-2]:palettes[style];
          context.uniform2f(loc.u_view,view.w,view.h);context.uniform4fv(loc['u_planes[0]'],positions);context.uniform4fv(loc['u_layers[0]'],layerData);
          context.uniform3fv(loc.u_shadow,palette.shadow);context.uniform3fv(loc.u_light,palette.light);context.uniform1i(loc.u_colourPreview,mode===1?1:0);
          context.uniform1f(loc.u_time,time);context.uniform1f(loc.u_seed,seed);context.uniform1i(loc.u_style,style);context.uniform1f(loc.u_densityFloor,options.densityFloor||0);
          context.uniform1i(loc.u_continuous,!!options.continuous);context.uniform1i(loc.u_wakeCount,0);context.uniform1i(loc.u_clearVolumeCount,0);
          context.drawArrays(context.TRIANGLES,0,3);counters.renders++;counters.textureRenders=(counters.textureRenders||0)+1;
        },
        dispose(){context.deleteFramebuffer(target);context.deleteVertexArray(array);context.deleteProgram(linked);}
      };
    }catch(error){if(target)context.deleteFramebuffer(target);if(array)context.deleteVertexArray(array);if(linked)context.deleteProgram(linked);throw error;}
    finally{for(const shader of shaders)context.deleteShader(shader);}
  }
  let seedWorker=null,seedSequence=0,seedBusy=false,seedActive=0;const seedRequests=new Map();
  function failSeeds(reason){seedWorker?.terminate();seedWorker=null;seedBusy=false;seedActive=0;for(const request of seedRequests.values()){clearTimeout(request.timer);request.reject(Error(reason));}seedRequests.clear();}
  function sendSeed(){
    if(seedBusy||!seedWorker||!seedRequests.size)return;const request=seedRequests.values().next().value;seedBusy=true;seedActive=request.payload.id;
    try{seedWorker.postMessage(request.payload);counters.seedWorkerDispatched=(counters.seedWorkerDispatched||0)+1;}
    catch(error){seedRequests.delete(seedActive);seedBusy=false;seedActive=0;clearTimeout(request.timer);request.reject(error);sendSeed();}
  }
  function requestSeed(description,w,h){
    if(seedRequests.size>=24)throw Error('Nebula seed queue full');
    if(!seedWorker){
      const url=new URL('nebula-seed-worker.js',moduleURL||location.href);if(moduleURL)url.search=new URL(moduleURL).search;
      seedWorker=new Worker(url);
      seedWorker.onmessage=event=>{const message=event.data,request=seedRequests.get(message.id);if(message.id===seedActive){seedBusy=false;seedActive=0;}
        if(request){seedRequests.delete(message.id);clearTimeout(request.timer);if(message.error)request.reject(Error(message.error));else{counters.seedWorkerReadbacks=(counters.seedWorkerReadbacks||0)+1;request.resolve(message);}}sendSeed();};
      seedWorker.onerror=event=>{event.preventDefault();failSeeds(event.message||'Nebula seed worker failed');};
    }
    const id=++seedSequence;let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
    const request={resolve,reject,payload:{id,description,w,h},timer:setTimeout(()=>{if(seedRequests.has(id))failSeeds('Nebula seed worker timeout');},1500)};
    seedRequests.set(id,request);counters.seedWorkerRequests=(counters.seedWorkerRequests||0)+1;
    sendSeed();
    return {promise,cancel(){const request=seedRequests.get(id);if(request){seedRequests.delete(id);clearTimeout(request.timer);request.resolve(null);}}};
  }
  const surfaceSize=view=>{const ratio=Math.min(1,(software?192:384)/view.w,288/view.h);return {w:Math.max(1,Math.round(view.w*ratio)),h:Math.max(1,Math.round(view.h*ratio))};};
  root.nativeNebulaGas=Object.freeze({prepare,render,metrics,createTextureRenderer,requestSeed,surfaceSize,get canSeedInWorker(){return typeof Worker==='function'&&typeof OffscreenCanvas==='function';},densityAt,disturbanceAt,palettes,previewNames,previewPalettes,paletteAt});
})();
