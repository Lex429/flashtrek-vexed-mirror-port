/* Retained WebGL2 presentation. No simulation, saves, damage or firing. */
(() => {
  'use strict';
  const STRIDE=20,MAX_SHIPS=256,MAX_TEXTURE_BYTES=32*1024*1024;
  const vertex=`#version 300 es
  precision highp float;
  layout(location=0) in vec2 corner;
  layout(location=1) in vec4 pose;
  layout(location=2) in vec4 rotation;
  layout(location=3) in vec4 shield;
  layout(location=4) in vec4 life;
  layout(location=5) in vec4 art;
  uniform vec2 viewport;uniform float time;
  out vec2 local;out vec2 uv;flat out vec4 field;flat out vec4 event;
  flat out vec4 material;flat out float kind;
  flat out vec4 energy;flat out vec3 fieldColour;flat out vec3 contactColour;
  flat out vec4 fronts;flat out vec3 surfaceContact;
  void main(){
    float a=rotation.x+sin(time*.0005+rotation.y)*rotation.z*.125;
    vec2 p=pose.xy+vec2(sin(time*.0007+rotation.y),cos(time*.0006+rotation.y))*rotation.z;
    vec2 v=corner*pose.zw;
    vec2 screen=p+mat2(cos(a),sin(a),-sin(a),cos(a))*v;
    gl_Position=vec4(screen/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
    local=v;uv=(corner+.5)*art.yz;field=shield;event=life;material=art;kind=rotation.w;
    energy=vec4(0.);fieldColour=vec3(0.);contactColour=vec3(0.);
    fronts=vec4(0.);surfaceContact=vec3(0.);
    if(rotation.w>.5&&life.w<.5){
      float age=(time-life.x)/life.y,seconds=(time-life.x)*.001;
      float hot=1.-smoothstep(.045,.080,seconds),pulse=1.-smoothstep(.055,.255,seconds);
      float contactFade=(1.-age)*(.28+.72*pulse)*life.z;
      // The last surface wave crosses before the field begins its separate fade.
      float envelope=(1.-smoothstep(life.y*.00067,life.y*.001,seconds))*life.z;
      float travel=max(.001,life.y*.000445),radius=.025+2.22*seconds/travel;
      vec2 hit=shield.zw/shield.xy;
      surfaceContact=vec3(hit,sqrt(max(0.,1.-dot(hit,hit))));
      float branchEnvelope=smoothstep(0.,.025,seconds)*(1.-smoothstep(.120,.320,seconds))*life.z;
      fronts=vec4(.025+2.22*(seconds-.085)/travel,.025+2.22*(seconds-.170)/travel,
        branchEnvelope,.08+1.12*clamp(seconds/.190,0.,1.));
      float shimmer=.92+.08*sin(time*.014+art.w);
      fieldColour=mix(vec3(.12,.65,1.),vec3(.45,.95,1.),.5+.5*sin(time*.003+art.w));
      energy=vec4(.045*shimmer*envelope,(.12+.26*pulse)*envelope,.98*envelope,radius);
      contactColour=mix(fieldColour,vec3(1.),hot)*(.24+.76*pulse+1.4*hot)*contactFade;
    }
  }`;
  const fragment=`#version 300 es
  precision highp float;precision highp sampler2DArray;
  in vec2 local;in vec2 uv;flat in vec4 field;flat in vec4 event;
  flat in vec4 material;flat in float kind;
  flat in vec4 energy;flat in vec3 fieldColour;flat in vec3 contactColour;
  flat in vec4 fronts;flat in vec3 surfaceContact;
  uniform sampler2DArray artwork;uniform float time;out vec4 pixel;
  float softFront(float distance,float radius,float width){
    float band=1.-smoothstep(width*.18,width,abs(distance-radius));
    float wake=smoothstep(0.,width,distance-radius+width*4.)*(1.-smoothstep(-width*2.,0.,distance-radius));
    return step(0.,radius)*(band*band+wake*.075);
  }
  float zig(float t,float phase){
    return (abs(fract(t*4.7+phase)-.5)-.25)*.15+(abs(fract(t*11.3+phase*.71)-.5)-.25)*.065;
  }
  void main(){
    if(kind<.5){vec4 c=texture(artwork,vec3(uv,material.x));pixel=vec4(c.rgb*c.a,c.a);return;}
    float age=(time-event.x)/event.y;
    if(age<0.||age>=1.||event.z<=0.)discard;
    float edge=(length(local/field.xy)-1.)*min(field.x,field.y);
    if(event.w<.5){
      float distanceToContact=length(local-field.zw);
      vec2 q=local/field.xy;float depth=sqrt(max(0.,1.-dot(q,q)));
      float inside=1.-smoothstep(-.7,.25,edge),unit=min(field.x,field.y);
      // An oblate curved surface: its projected fronts bend instead of flat rings.
      float surfaceDistance=length(vec3(q-surfaceContact.xy,(depth-surfaceContact.z)*.68));
      float attenuation=1./(1.+surfaceDistance*surfaceDistance*.18);
      float rim=1.-smoothstep(.16,.85,abs(edge));
      float halo=1.-smoothstep(.8,2.7,abs(edge));
      float impactSection=1.-smoothstep(3.,max(12.,min(field.x,field.y)*1.15),distanceToContact);
      float width=max(.028,1.65/unit);
      float wave=softFront(surfaceDistance,energy.w,width)
        +softFront(surfaceDistance,fronts.x,width*.90)*.60
        +softFront(surfaceDistance,fronts.y,width*.80)*.36;
      wave*=inside*attenuation*(.72+.28*depth);
      vec2 inward=-normalize(surfaceContact.xy+vec2(.0001,0.));
      vec2 delta=q-surfaceContact.xy;
      float along=dot(delta,inward),across=dot(delta,vec2(-inward.y,inward.x));
      float crawl=along+.12*(depth-surfaceContact.z),bend=zig(crawl,material.w)*smoothstep(0.,.12,crawl);
      float branch1=abs(across-bend-crawl*.25),branch2=abs(across+bend*.73+crawl*.32);
      float fork=abs(across-bend*.6-(.20-(crawl-.42)*.32));
      float filament=min(branch1,branch2);
      if(crawl>.42)filament=min(filament,fork);
      float branch=1.-smoothstep(.28,.95,filament*unit);
      branch*=smoothstep(-.025,.025,crawl)*(1.-smoothstep(fronts.w-.05,fronts.w,crawl))*inside*fronts.z;
      float tip=(1.-smoothstep(.02,.07,abs(crawl-fronts.w+.045)))*branch;
      float contact=1.-smoothstep(.5,3.5,distanceToContact);
      float contactHalo=(1.-smoothstep(2.,11.,distanceToContact))*.32;
      float grazing=(1.-depth)*(1.-depth),direction=.65+.35*clamp(dot(q,vec2(-.6,-.8)),0.,1.);
      float fieldEnergy=(rim+halo*.28)*energy.x*direction+rim*impactSection*energy.y
        +wave*energy.z+grazing*.010*inside*attenuation*energy.z;
      vec3 light=fieldColour*fieldEnergy+mix(fieldColour,vec3(.75,.94,1.),.6)*branch*.68
        +vec3(.8,.95,1.)*tip*.35+contactColour*(contact+contactHalo);
      float alpha=clamp(max(light.r,max(light.g,light.b)),0.,1.);
      if(alpha<.002)discard;
      pixel=vec4(light,alpha);return;
    }
    float rim=1.-smoothstep(.65,1.8,abs(edge));
    float halo=(1.-smoothstep(1.2,4.5,abs(edge)))*.18;
    float radius=mix(3.,max(field.x,field.y)*2.2,age);
    float distanceToWave=abs(length(local-field.zw)-radius);
    float wave=(1.-smoothstep(1.,3.1,distanceToWave))*(1.-smoothstep(-1.,1.,edge));
    float distanceToContact=length(local-field.zw);
    float contact=1.-smoothstep(.5,3.5,distanceToContact);
    float contactHalo=(1.-smoothstep(2.,11.,distanceToContact))*.35;
    float shimmer=.8+.2*sin(time*.014+material.w);
    float fade=min(1.,(1.-age)*2.);
    vec3 cyan=mix(vec3(.12,.65,1.),vec3(.45,.95,1.),.5+.5*sin(time*.003+material.w));
    if(event.w>.5){cyan=vec3(1.,.4,.12);rim*=step(.23,fract((local.x+local.y)*.055+age*3.));fade=1.-age;}
    float fieldEnergy=(rim*.58+halo)*shimmer+wave*.68;
    vec3 light=cyan*fieldEnergy+(contact+contactHalo)*vec3(.8,.95,1.)*(.25+.75*(1.-age)*(1.-age));
    light*=fade*event.z;
    float alpha=clamp(max(light.r,max(light.g,light.b)),0.,1.);
    if(alpha<.002)discard;
    pixel=vec4(light,alpha);
  }`;
  function compile(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  function program(gl,vs,fs){const p=gl.createProgram(),v=compile(gl,gl.VERTEX_SHADER,vs),f=compile(gl,gl.FRAGMENT_SHADER,fs);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
  async function create({canvas,assets=[],transparent=false,maxShips=MAX_SHIPS,presentation=null}={}){
    if(!canvas||!Number.isInteger(maxShips)||maxShips<1||maxShips>MAX_SHIPS)throw Error('Invalid GPU shield capacity');
    const gl=canvas.getContext('webgl2',{alpha:transparent,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
    if(!gl)throw Error('WebGL2 unavailable');
    const history=presentation?.history||1;
    if(![1,3].includes(history))throw Error('Invalid impact history capacity');
    const p=program(gl,presentation?.vertex||vertex,presentation?.fragment||fragment),timeLocation=gl.getUniformLocation(p,'time'),viewportLocation=gl.getUniformLocation(p,'viewport');
    const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,.5]),gl.STATIC_DRAW);
    const hulls=new Float32Array(maxShips*STRIDE),shields=new Float32Array(maxShips*STRIDE*history),rows=new Array(maxShips),events=new Array(maxShips*history).fill(null);
    const buffers=[],vaos=[];
    for(let i=0;i<2;i++){
      const vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,i?shields.byteLength:hulls.byteLength,gl.DYNAMIC_DRAW);
      for(let a=1;a<=5;a++){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,STRIDE*4,(a-1)*16);gl.vertexAttribDivisor(a,1);}
      buffers.push(buffer);vaos.push(vao);
    }
    let count=0,dirty=true,disposed=false,lost=false;
    const contextLost=()=>{lost=true;};canvas.addEventListener('webglcontextlost',contextLost);
    const width=Math.max(1,...assets.map(a=>a.image.width)),height=Math.max(1,...assets.map(a=>a.image.height)),layers=Math.max(1,assets.length);
    let textureBytes=0;for(let w=width,h=height; ;w=Math.max(1,w>>1),h=Math.max(1,h>>1)){textureBytes+=w*h*layers*4;if(w===1&&h===1)break;}
    if(textureBytes>MAX_TEXTURE_BYTES)throw Error('Artwork texture budget exceeded');
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1+Math.floor(Math.log2(Math.max(width,height))),gl.RGBA8,width,height,layers);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    for(let i=0;i<assets.length;i++)gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,assets[i].image.width,assets[i].image.height,1,gl.RGBA,gl.UNSIGNED_BYTE,assets[i].image);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const stars=program(gl,`#version 300 es
      in vec2 position;uniform vec2 viewport;void main(){gl_Position=vec4(position/viewport*vec2(2.,-2.)+vec2(-1.,1.),0,1);gl_PointSize=1.;}`,
      `#version 300 es
      precision mediump float;out vec4 pixel;void main(){pixel=vec4(.35,.48,.62,1);}`);
    const starVao=gl.createVertexArray(),starBuffer=gl.createBuffer(),starData=new Float32Array(300);
    for(let i=0;i<150;i++){starData[i*2]=i*67%1280;starData[i*2+1]=i*43%850;}
    gl.bindVertexArray(starVao);gl.bindBuffer(gl.ARRAY_BUFFER,starBuffer);gl.bufferData(gl.ARRAY_BUFFER,starData,gl.STATIC_DRAW);const starAttribute=gl.getAttribLocation(stars,'position');gl.enableVertexAttribArray(starAttribute);gl.vertexAttribPointer(starAttribute,2,gl.FLOAT,false,0,0);
    const starViewport=gl.getUniformLocation(stars,'viewport');
    const stats={frames:0,drawCalls:0,textureUploads:assets.length,bufferUploads:0,hits:0,rejectedHits:0,textureBytes,bufferBytes:hulls.byteLength+shields.byteLength+48+starData.byteLength,impactHistory:history,maxShips,maxTextureBytes:MAX_TEXTURE_BYTES};
    function setFleet(fleet){
      if(fleet.length>maxShips)throw Error('GPU shield ship budget exceeded');count=fleet.length;hulls.fill(0);shields.fill(0);events.fill(null);
      if(fleet.some(r=>![r.x,r.y,r.w,r.h,r.rx,r.ry].every(Number.isFinite)||r.w<=0||r.h<=0||r.rx<=0||r.ry<=0||!Number.isInteger(r.layer||0)||(r.layer||0)<0||(r.layer||0)>=layers))throw Error('Invalid GPU ship geometry');
      for(let i=0;i<count;i++){
        const r=rows[i]={angle:0,phase:0,motion:0,...fleet[i]},o=i*STRIDE,a=assets[r.layer||0];
        const values=[r.x,r.y,r.w,r.h,r.angle||0,r.phase||0,r.motion||0,0,r.rx,r.ry,0,0,-1e6,900,0,0,r.layer||0,a?a.image.width/width:1,a?a.image.height/height:1,i*.37];
        hulls.set(values,o);
        for(let lane=0;lane<history;lane++){const so=(i*history+lane)*STRIDE;shields.set(values,so);shields[so+2]=r.rx*2+16;shields[so+3]=r.ry*2+16;shields[so+7]=1;}
      }
      gl.bindBuffer(gl.ARRAY_BUFFER,buffers[0]);gl.bufferSubData(gl.ARRAY_BUFFER,0,hulls);dirty=true;stats.bufferUploads++;
    }
    function hit(index,{x=0,y=0,born=0,strength=1,collapse=false,duration=900,eventId=null,kind='beam',charge=1}={}){
      if(!Number.isInteger(index)||index<0||index>=count||![x,y,born,strength,duration].every(Number.isFinite)||duration<=0){stats.rejectedHits++;return false;}
      const r=rows[index],n=Math.hypot(x/r.rx,y/r.ry),f=n>1?1/n:1;
      let lane=0;
      if(history>1){
        lane=-1;for(let j=0;j<history;j++){const e=events[index*history+j];if(e&&e.born===born&&e.id===eventId){lane=j;break;}}
        if(lane<0){lane=0;for(let j=1;j<history;j++)if((events[index*history+j]?.born??-Infinity)<(events[index*history+lane]?.born??-Infinity))lane=j;}
        const ei=index*history+lane,e=events[ei]||(events[ei]={});e.born=born;e.id=eventId;e.nx=x*f/r.rx;e.ny=y*f/r.ry;
      }
      const o=(index*history+lane)*STRIDE;
      if(presentation?.latestSurface){
        let newest=lane;
        for(let j=0;j<history;j++)if((events[index*history+j]?.born??-Infinity)>(events[index*history+newest]?.born??-Infinity))newest=j;
        for(let j=0;j<history;j++)shields[(index*history+j)*STRIDE+17]=j===newest?1:0;
      }
      shields[o+10]=x*f;shields[o+11]=y*f;shields[o+12]=born;shields[o+13]=collapse?430:duration;shields[o+14]=Math.min(1.8,Math.max(.5,strength));
      shields[o+15]=(collapse?1:0)+(presentation?.weaponAware?(kind==='torpedo'?2:kind==='disruptor'?4:0):0);
      if(presentation?.weaponAware)shields[o+18]=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:1));
      dirty=true;stats.hits++;return true;
    }
    function updatePose(index,{x,y,angle,rx,ry,w,h}){
      if(index<0||index>=count)return;
      const o=index*STRIDE,r=rows[index];r.x=x;r.y=y;r.angle=angle;r.rx=rx;r.ry=ry;r.w=w;r.h=h;
      hulls[o]=x;hulls[o+1]=y;hulls[o+4]=angle;
      for(let lane=0;lane<history;lane++){const so=(index*history+lane)*STRIDE;
        shields[so]=x;shields[so+1]=y;shields[so+4]=angle;shields[so+2]=rx*2+16;shields[so+3]=ry*2+16;shields[so+8]=rx;shields[so+9]=ry;
        const e=events[index*history+lane];if(e){shields[so+10]=e.nx*rx;shields[so+11]=e.ny*ry;}
      }dirty=true;
    }
    function hide(index){if(index>=0&&index<count){for(let lane=0;lane<history;lane++)shields[(index*history+lane)*STRIDE+14]=0;dirty=true;}}
    function visibility(time){let visible=0,fullyVisible=0,active=0,fullyActive=0;
      for(let i=0;i<count;i++){
        const o=i*STRIDE,r=rows[i],a=r.angle+Math.sin(time*.0005+r.phase)*r.motion*.125,x=r.x+Math.sin(time*.0007+r.phase)*r.motion,y=r.y+Math.cos(time*.0006+r.phase)*r.motion;
        const ex=Math.abs(Math.cos(a))*(r.rx+8)+Math.abs(Math.sin(a))*(r.ry+8),ey=Math.abs(Math.sin(a))*(r.rx+8)+Math.abs(Math.cos(a))*(r.ry+8);
        const full=x-ex>=0&&x+ex<=canvas.width&&y-ey>=0&&y+ey<=canvas.height;
        if(x+ex>=0&&x-ex<=canvas.width&&y+ey>=0&&y-ey<=canvas.height)visible++;
        if(full)fullyVisible++;
        // Match the shader's float32 clock, including a hit paused on its birth frame.
        let lit=false;for(let lane=0;lane<history;lane++){const so=(i*history+lane)*STRIDE,age=Math.fround(time)-shields[so+12];if(age>=0&&age<shields[so+13]&&shields[so+14]>0)lit=true;}
        if(lit){active++;if(full)fullyActive++;}
      }return {visible,fullyVisible,active,fullyActive};
    }
    function render(time,{effects=false,ships=true,background=!transparent,beforeEffects=null}={}){
      if(disposed||lost)throw Error('GPU shield renderer disposed or context lost');
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(background?0.015:0,background?0.035:0,background?0.075:0,background?1:0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      let calls=0;
      if(background){gl.useProgram(stars);gl.uniform2f(starViewport,canvas.width,canvas.height);gl.bindVertexArray(starVao);gl.drawArrays(gl.POINTS,0,150);calls++;}
      gl.useProgram(p);gl.uniform2f(viewportLocation,canvas.width,canvas.height);gl.uniform1f(timeLocation,time);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);
      presentation?.bind?.(gl,p,{time,effects,count});
      if(ships&&count){gl.bindVertexArray(vaos[0]);gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);calls++;}
      if(beforeEffects){beforeEffects();gl.useProgram(p);gl.uniform2f(viewportLocation,canvas.width,canvas.height);gl.uniform1f(timeLocation,time);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,texture);}
      if(effects&&count){
        if(dirty){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[1]);gl.bufferSubData(gl.ARRAY_BUFFER,0,shields);dirty=false;stats.bufferUploads++;}
        gl.blendFunc(gl.ONE,presentation?.premultipliedShields?gl.ONE_MINUS_SRC_ALPHA:gl.ONE);gl.bindVertexArray(vaos[1]);gl.drawArraysInstanced(gl.TRIANGLES,0,6,count*history);calls++;
      }
      stats.frames++;stats.drawCalls+=calls;return {...visibility(time),drawCalls:calls};
    }
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    const environment={version:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes(),maxArrayLayers:gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)};
    if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL initialization error');
    return Object.freeze({setFleet,hit,updatePose,hide,render,visibility,gl,environment,
      snapshot:()=>({...stats,ships:count,instanceBytes:hulls.byteLength+shields.byteLength,nominalDrawingBufferBytes:canvas.width*canvas.height*4,disposed}),
      destroy(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',contextLost);gl.deleteTexture(texture);for(const b of [...buffers,quad,starBuffer])gl.deleteBuffer(b);for(const v of [...vaos,starVao])gl.deleteVertexArray(v);gl.deleteProgram(p);gl.deleteProgram(stars);}});
  }
  window.createVexedShieldGPU=options=>window.nativeEffectProfiles?.createShield(create,options)||create(options);
})();
