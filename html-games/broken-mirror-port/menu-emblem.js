/* A distant star is eclipsed by the foreground compass and its slow satellites.
   All artwork is unchanged; sampled silhouette coverage drives lens exposure.
   This scene owns no gameplay state. */
(() => {
  'use strict';
  const menu=document.getElementById('menu-art'),anchor=menu.querySelector('.menu-compass');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const orbits=window.nativeMenuEmblemOrbits;
  const dynamics=orbits.createDynamics();
  const camera=window.nativeMenuStellarOptics.create(),space=document.getElementById('menu-space');
  const canvas=document.createElement('canvas');canvas.id='menu-emblem-scene';canvas.setAttribute('aria-hidden','true');menu.prepend(canvas);
  const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:true,depth:false,stencil:false});
  if(!gl)return;
  const vertex=`
    precision mediump float;
    attribute vec2 a_corner;
    uniform vec2 u_view,u_center,u_size;
    uniform vec4 u_uv;
    uniform float u_angle,u_depth;
    varying vec2 v_uv,v_world;
    varying vec2 v_local;
    void main(){
      float c=cos(u_angle),s=sin(u_angle);
      vec2 p=(a_corner-.5)*u_size;
      v_local=p;v_world=u_center+mat2(c,s,-s,c)*p;
      v_uv=u_uv.xy+a_corner*u_uv.zw;
      gl_Position=vec4(v_world.x/u_view.x*2.-1.,1.-v_world.y/u_view.y*2.,0.,1.);
    }`;
  const material=`
    precision mediump float;
    uniform sampler2D u_image;
    uniform vec2 u_texel,u_light,u_subject;
    uniform float u_radius,u_power,u_angle,u_depth,u_brightness,u_cameraGain,u_edgeGlint;
    varying vec2 v_uv,v_world,v_local;
    float heightAt(vec2 uv){vec4 p=texture2D(u_image,uv);return dot(p.rgb,vec3(.3,.5,.2))*p.a;}
    void main(){
      vec4 tex=texture2D(u_image,v_uv);
      if(tex.a<.065)discard;
      vec2 d=u_texel*2.;
      vec2 slope=vec2(heightAt(v_uv-vec2(d.x,0.))-heightAt(v_uv+vec2(d.x,0.)),heightAt(v_uv-vec2(0.,d.y))-heightAt(v_uv+vec2(0.,d.y)));
      float c=cos(u_angle),s=sin(u_angle);
      vec3 normal=normalize(vec3(mat2(c,s,-s,c)*slope*2.7,1.));
      vec3 key=normalize(vec3(-.4,-.6,.8));
      float diffuse=max(0.,dot(normal,key));
      float spec=pow(max(0.,dot(normal,normalize(key+vec3(0.,0.,1.)))),36.);
      float left=texture2D(u_image,v_uv-vec2(d.x,0.)).a,right=texture2D(u_image,v_uv+vec2(d.x,0.)).a;
      float top=texture2D(u_image,v_uv-vec2(0.,d.y)).a,bottom=texture2D(u_image,v_uv+vec2(0.,d.y)).a;
      float edge=1.-min(min(left,right),min(top,bottom));
      vec2 rimNormal=mat2(c,s,-s,c)*vec2(left-right,top-bottom);
      float facing=max(0.,dot(normalize(rimNormal+vec2(.0001)),normalize(u_light-u_subject)));
      vec3 color=tex.rgb*(vec3(.71,.73,.77)+vec3(.13)*diffuse)+vec3(.13,.14,.16)*spec;
      color+=vec3(1.,.012,.025)*edge*facing*u_power*.52;
      float proximity=exp(-length(v_world-u_light)/u_radius*11.);
      color+=vec3(1.,.018,.035)*proximity*(edge*facing*.22+spec*.13)*(.35+u_edgeGlint);
      float alpha=smoothstep(.065,.28,tex.a);
      gl_FragColor=vec4(color*u_brightness*u_cameraGain*alpha,alpha);
    }`;
  const atmosphere=`
    precision mediump float;
    uniform vec2 u_light,u_view,u_centroid,u_size,u_glintAxis;
    uniform float u_radius,u_power,u_flare,u_starRadius,u_exposure,u_pass,u_cameraGain,u_edgeGlint;
    varying vec2 v_world,v_local;
    float halo(vec2 center,float radius){vec2 p=(v_world-center)/radius;return exp(-dot(p,p)*3.);}
    vec3 photograph(vec3 radiance){return pow(vec3(1.)-exp(-radiance),vec3(.454545));}
    float apertureImage(vec2 p,float radius){
      p=abs(p);float edge=mix(max(p.y,p.x*.866025+p.y*.5),length(p),.7)/radius;
      return exp(-pow((edge-.86)*3.5,2.))*.3+exp(-edge*edge*2.)*.12;
    }
    void main(){
      // The old, faint scattering wings were cut by the rectangular draw quad.
      // Fade to exact zero inside a rounded boundary before clipping can occur.
      float support=1.-smoothstep(.64,.96,length(v_local/(u_size*.5)));
      if(u_pass<.5){
        float r=length((v_world-u_light)/u_starRadius);
        float disk=(1.-smoothstep(.75,1.05,r))*(.48+.52*sqrt(max(0.,1.-r*r)));
        float corona=exp(-r*1.6)*.38+exp(-r*.7)*.018;
        float hot=exp(-r*r*110.);
        vec3 radiance=vec3(52.,.065,.028)*disk+vec3(4.6,.016,.027)*corona+vec3(13.)*hot;
        gl_FragColor=vec4(photograph(radiance*u_power*u_cameraGain)*support,0.);return;
      }
      // Camera optics: one exposed source, reflections along the lens axis.
      vec2 p=(v_world-u_centroid)/u_radius;
      float r2=dot(p,p),radius=sqrt(r2);
      // Moffat scattering wings and aperture diffraction, in linear radiance.
      float tight=.09/pow(1.+r2/.00038,1.7);
      float middle=.012/pow(1.+r2/.005,1.8);
      float wide=.003/pow(1.+r2/.022,2.2);
      float glare=tight+middle+wide;
      float streak=(exp(-p.y*p.y*100000.)*.016+exp(-p.y*p.y*16000.)*.0022)*exp(-abs(p.x)*4.7)*(1.+u_edgeGlint*.65);
      float across=dot(p,u_glintAxis),along=dot(p,vec2(-u_glintAxis.y,u_glintAxis.x));
      float contact=exp(-across*across*95000.-along*along*8500.)*u_edgeGlint*.028;
      float glint=exp(-r2*150000.)*u_edgeGlint*.18;
      float diffraction=0.;
      for(int i=0;i<3;i++){
        float a=float(i)*1.04719755;
        float across=p.x*cos(a)+p.y*sin(a);
        diffraction+=exp(-across*across*95000.)*exp(-radius*15.)*.0022;
      }
      vec2 axis=u_view*.5-u_light;
      vec3 reflections=vec3(0.);
      for(int i=0;i<5;i++){
        float n=float(i),travel=.8+n*.48;
        vec2 ghost=v_world-(u_light+axis*travel);
        float ghostRadius=u_radius*(.026+n*.012);
        float shape=apertureImage(ghost,ghostRadius);
        vec3 coating=mix(vec3(.42,.015,.04),vec3(.28,.02,.025),n*.25);
        reflections+=coating*shape*(.00048/(1.+n*.3));
      }
      vec3 color=vec3(1.,.008,.022)*glare+vec3(1.,.012,.02)*streak+vec3(.85,.025,.065)*diffraction+vec3(1.,.035,.055)*contact+vec3(1.,.4,.32)*glint+reflections;
      gl_FragColor=vec4(photograph(color*40.*u_exposure*u_flare*u_cameraGain)*support,0.);
    }`;
  function program(fragment){
    const shaders=[gl.VERTEX_SHADER,gl.FRAGMENT_SHADER].map((type,i)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,i?fragment:vertex);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;
    });
    const p=gl.createProgram();for(const shader of shaders)gl.attachShader(p,shader);gl.linkProgram(p);
    for(const shader of shaders)gl.deleteShader(shader);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
    const uniforms={};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const name=gl.getActiveUniform(p,i).name;uniforms[name]=gl.getUniformLocation(p,name);}
    return {program:p,uniforms,corner:gl.getAttribLocation(p,'a_corner')};
  }
  let surface,air;
  try{surface=program(material);air=program(atmosphere);}catch(error){console.warn('Menu lighting unavailable',error);return;}
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  const pieces=[
    [39,70,134,118],[400,45,149,155],[810,38,179,179],[1382,35,181,181],
    [22,236,141,176],[824,236,110,170],[20,433,159,169],[1381,429,181,187],
    [211,640,150,155],[405,827,152,134],[613,800,123,174],[1399,810,166,149]
  ];
  const skullRect=[428,0,400,1254];
  let skull,bones,ready=false,lost=false,raf=0,last=0,time=0,frames=0,heading=0,pointer=null,burst=0,viewX=0,viewY=0,lastCameraGain=1;
  const aperture=Array.from({length:144},(_,i)=>{
    const r=Math.sqrt((i+.5)/144),a=i*2.399963229728653;
    return {x:Math.cos(a)*r,y:Math.sin(a)*r,weight:.4+.6*Math.sqrt(1-r*r)};
  });
  let state={light:{x:0,y:0},flare:0,fragments:[]};
  function texture(src){return new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{
      if(lost){reject(Error('Menu graphics context lost'));return;}
      const value=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,value);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      let alpha=null;
      {
        // Read the original alpha for silhouette tests; no bitmap is altered.
        const sample=document.createElement('canvas');sample.width=image.width;sample.height=image.height;
        const context=sample.getContext('2d');context.drawImage(image,0,0);
        const pixels=context.getImageData(0,0,image.width,image.height).data;alpha=new Uint8Array(image.width*image.height);
        for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
      }
      resolve({value,width:image.width,height:image.height,alpha});
    };image.onerror=()=>reject(Error('Menu artwork unavailable: '+src));image.src=src;
  });}
  function visible(){return ready&&!lost&&!menu.hidden&&!document.hidden&&!window.nativePause?.active&&!document.body.classList.contains('playing')&&!document.getElementById('game').classList.contains('setup-open');}
  function use(p,w,h,light,radius,power,flare){
    gl.useProgram(p.program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(p.corner);gl.vertexAttribPointer(p.corner,2,gl.FLOAT,false,0,0);
    const u=p.uniforms;gl.uniform2f(u.u_view,w,h);gl.uniform2f(u.u_light,light.x,light.y);gl.uniform1f(u.u_radius,radius);gl.uniform1f(u.u_power,power);gl.uniform1f(u.u_flare,flare);
    return u;
  }
  function quad(u,x,y,w,h,angle=0,depth=0,uv=[0,0,1,1],brightness=1){
    gl.uniform2f(u.u_center,x,y);gl.uniform2f(u.u_size,w,h);gl.uniform1f(u.u_angle,angle);gl.uniform1f(u.u_depth,depth);gl.uniform1f(u.u_brightness,brightness);gl.uniform4fv(u.u_uv,uv);gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function sprite(u,tex,rect,x,y,w,h,angle,depth,brightness=1){
    gl.bindTexture(gl.TEXTURE_2D,tex.value);gl.uniform2f(u.u_texel,1/tex.width,1/tex.height);
    quad(u,x,y,w,h,angle,depth,[rect[0]/tex.width,rect[1]/tex.height,rect[2]/tex.width,rect[3]/tex.height],brightness);
  }
  function opacityAt(tex,rect,x,y,cx,cy,w,h,angle){
    const c=Math.cos(angle),s=Math.sin(angle),dx=x-cx,dy=y-cy;
    const u=(c*dx+s*dy)/w+.5,v=(-s*dx+c*dy)/h+.5;
    if(u<0||u>=1||v<0||v>=1)return 0;
    const tx=Math.max(0,Math.min(tex.width-2,rect[0]+u*rect[2])),ty=Math.max(0,Math.min(tex.height-2,rect[1]+v*rect[3]));
    const ix=Math.floor(tx),iy=Math.floor(ty),fx=tx-ix,fy=ty-iy,a=tex.alpha;
    const row=iy*tex.width+ix;
    const alpha=((a[row]*(1-fx)+a[row+1]*fx)*(1-fy)+(a[row+tex.width]*(1-fx)+a[row+tex.width+1]*fx)*fy)/255;
    const t=Math.max(0,Math.min(1,(alpha-.065)/(.28-.065)));return t*t*(3-2*t);
  }
  function revealStar(light,radius,cx,cy,size,angle,positions){
    let visible=0,total=0,x=0,y=0;
    for(const sample of aperture){
      const sx=light.x+sample.x*radius,sy=light.y+sample.y*radius;
      let transmission=1-opacityAt(skull,skullRect,sx,sy,cx,cy,size*skullRect[2]/skullRect[3],size,angle);
      for(const p of positions){
        if(transmission<.001)break;
        // Fragments are all in front of the distant star, on either side of the hilt.
        transmission*=1-opacityAt(bones,pieces[p.index],sx,sy,p.x,p.y,p.w,p.h,p.angle);
      }
      const weight=sample.weight*transmission;visible+=weight;total+=sample.weight;x+=sx*weight;y+=sy*weight;
    }
    return {visibility:visible/total,centroid:visible>.001?{x:x/visible,y:y/visible}:{...light}};
  }
  function atmospherePass(w,h,light,size,power,flare,star,pass){
    const u=use(air,w,h,light,size*.48,power,flare);
    const dx=star.centroid.x-light.x,dy=star.centroid.y-light.y,length=Math.hypot(dx,dy);
    gl.uniform2f(u.u_glintAxis,length>.03?dx/length:0,length>.03?dy/length:1);
    gl.uniform1f(u.u_starRadius,star.radius);gl.uniform1f(u.u_exposure,star.effectiveVisibility);gl.uniform1f(u.u_cameraGain,star.cameraGain);gl.uniform1f(u.u_edgeGlint,star.edgeGlint);gl.uniform2f(u.u_centroid,star.centroid.x,star.centroid.y);gl.uniform1f(u.u_pass,pass);
    quad(u,light.x,light.y,size*(pass?1.7:.18),size*(pass?1.2:.18));
  }
  function draw(dt){
    const bounds=canvas.getBoundingClientRect(),r=anchor.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
    const w=bounds.width,h=bounds.height,d=Math.min(devicePixelRatio||1,1.5,Math.sqrt(1600000/(w*h)));
    const bw=Math.max(1,Math.round(w*d)),bh=Math.max(1,Math.round(h*d));
    if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
    gl.viewport(0,0,bw,bh);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    const paused=!!window.nativePause?.active;
    if(!paused)time+=dt;
    const target=menu.classList.contains('menu-cinematic-active')?1:0;
    burst+=(target-burst)*(1-Math.exp(-dt*(target?14:5)));
    const size=r.height,baseX=r.x-bounds.x+r.width*.5,baseY=r.y-bounds.y+r.height*.5;
    const aimX=pointer?Math.max(-.5,Math.min(.5,(pointer.x-bounds.x-baseX)/w)):0;
    const aimY=pointer?Math.max(-.5,Math.min(.5,(pointer.y-bounds.y-baseY)/h)):0;
    const ease=1-Math.exp(-dt*7);
    if(!reduced.matches){viewX+=(aimX-viewX)*ease;viewY+=(aimY-viewY)*ease;}
    const cx=baseX+viewX*size*.028,cy=baseY+viewY*size*.018;
    let aimAngle=heading;
    if(pointer&&!reduced.matches){
      const dx=pointer.x-bounds.x-cx,dy=pointer.y-bounds.y-cy;
      if(Math.hypot(dx,dy)>size*.035)aimAngle=Math.atan2(dy,dx)-Math.PI/2;
      const delta=Math.atan2(Math.sin(aimAngle-heading),Math.cos(aimAngle-heading));
      heading+=delta*(1-Math.exp(-dt*22));
    }
    const angle=reduced.matches?0:heading,c=Math.cos(angle),s=Math.sin(angle);
    const light={x:baseX-size*.137,y:baseY-size*.055};
    const power=1.05+burst*.25,flare=1+burst*.3;
    const hilt={x:cx-s*size*orbits.hiltY,y:cy+c*size*orbits.hiltY};
    const pose={x:(cx-baseX)/size,y:(cy-baseY)/size,angle};
    if(reduced.matches)dynamics.reset(pose);else dynamics.step(dt,pose);
    const motion=dynamics.snapshot();
    const positions=motion.particles.map(p=>{
      const i=p.index,profile=orbits.profiles[i],[wx,wy,wz]=p.position,z=wz*size,perspective=1/(1-wz/1.2);
      const x=baseX+(wx-viewX*wz*.1)*size*perspective,y=baseY+(wy-viewY*wz*.1)*size*perspective;
      const length=size*profile.length*perspective;
      const lx=c*(wx-pose.x)+s*(wy-pose.y),ly=-s*(wx-pose.x)+c*(wy-pose.y);
      return {index:i,x,y,z,w:length*(.86+.14*Math.abs(Math.cos(p.spin*.7))),h:length*profile.aspect,angle:p.spin,depth:1+wz/.25,front:z>=0,brightness:.8+.2*perspective,period:profile.period,world:{x:wx,y:wy,z:wz},velocity:{x:p.velocity[0],y:p.velocity[1],z:p.velocity[2]},local:{x:lx,y:ly,z:wz}};
    }).sort((a,b)=>a.z-b.z);
    const revealed=revealStar(light,size*.0075,cx,cy,size,angle,positions),optics=camera.update(revealed.visibility,dt,reduced.matches);
    const star={...revealed,...optics,radius:size*.0075};
    const displayGain=Math.round(star.cameraGain*1000)/1000;
    if(displayGain!==lastCameraGain){space.style.filter=`brightness(${displayGain})`;lastCameraGain=displayGain;}
    atmospherePass(w,h,light,size,power,flare,star,0);
    const u=use(surface,w,h,light,size*.48,power,flare);gl.uniform2f(u.u_subject,cx,cy);gl.uniform1f(u.u_cameraGain,star.cameraGain);gl.uniform1f(u.u_edgeGlint,star.edgeGlint);
    for(const p of positions)if(!p.front)sprite(u,bones,pieces[p.index],p.x,p.y,p.w,p.h,p.angle,p.depth,p.brightness);
    sprite(u,skull,skullRect,cx,cy,size*skullRect[2]/skullRect[3],size,angle,1);
    for(const p of positions)if(p.front)sprite(u,bones,pieces[p.index],p.x,p.y,p.w,p.h,p.angle,p.depth,p.brightness);
    atmospherePass(w,h,light,size,power,flare,star,1);
    state={light,flare,star:{...star,radiance:40},fragments:positions,contacts:motion.contacts,angle,aimAngle,pivot:{x:cx,y:cy},hilt,tip:{x:cx-s*size*.5,y:cy+c*size*.5},view:{x:viewX,y:viewY},burst};frames++;
  }
  function loop(now){raf=0;if(!visible())return;const dt=last?Math.min((now-last)/1000,.05):0;last=now;draw(dt);if(!reduced.matches)raf=requestAnimationFrame(loop);}
  function sync(){
    if(raf)cancelAnimationFrame(raf);raf=0;last=0;
    if(!visible()){
      if(menu.hidden||document.body.classList.contains('playing')||document.getElementById('game').classList.contains('setup-open')){space.style.filter='';lastCameraGain=1;}
      return;
    }
    if(reduced.matches){heading=0;viewX=viewY=0;draw(0);}else raf=requestAnimationFrame(loop);
  }
  document.getElementById('game').addEventListener('pointermove',event=>{
    if(!visible()||reduced.matches||window.nativePause?.active)return;
    pointer={x:event.clientX,y:event.clientY};
  });
  new ResizeObserver(()=>{if(visible())draw(0);}).observe(menu);
  new MutationObserver(sync).observe(menu,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(sync).observe(document.getElementById('game'),{attributes:true,attributeFilter:['class']});
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);addEventListener('pagehide',()=>{if(raf)cancelAnimationFrame(raf);raf=0;});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;menu.classList.remove('menu-emblem-ready');sync();});
  canvas.addEventListener('webglcontextrestored',()=>{canvas.hidden=true;menu.classList.remove('menu-emblem-ready');});
  window.nativeMenuEmblem=Object.freeze({snapshot:()=>({ready:ready&&!lost,running:!!raf,frames,time,reducedMotion:reduced.matches,renderer:'webgl',...state}),repaint:()=>{if(visible())draw(0);}});
  Promise.all([texture('startup/menu-skull.png'),texture('startup/menu-bone-fragments.png')]).then(values=>{
    [skull,bones]=values;ready=true;menu.classList.add('menu-emblem-ready');sync();
  }).catch(error=>{console.warn(error);canvas.hidden=true;});
})();
