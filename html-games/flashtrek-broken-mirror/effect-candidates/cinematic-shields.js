/* Hybrid OG bubble/refraction and a curved, cloudy membrane. Presentation only.
   One shared scene copy; three retained contacts, 24 fine segments per contact. */
(() => {
  'use strict';
  const HISTORY=3,SEGMENTS=24,STRIDE=16,SCENE_WIDTH=2048,SCENE_HEIGHT=1024;
  const vertex=`#version 300 es
  precision highp float;
  layout(location=0) in vec2 corner;layout(location=1) in vec4 pose;
  layout(location=2) in vec4 rotation;layout(location=3) in vec4 shield;
  layout(location=4) in vec4 life;layout(location=5) in vec4 art;
  uniform vec2 viewport;uniform float time;
  out vec2 local;out vec2 uv;flat out vec4 field;flat out vec4 event;
  flat out vec4 material;flat out float kind;flat out vec2 orientation;flat out float variation;
  void main(){
    float a=rotation.x+sin(time*.0005+rotation.y)*rotation.z*.125;
    vec2 center=pose.xy+vec2(sin(time*.0007+rotation.y),cos(time*.0006+rotation.y))*rotation.z;
    vec2 v=corner*pose.zw;
    vec2 screen=center+mat2(cos(a),sin(a),-sin(a),cos(a))*v;
    gl_Position=vec4(screen/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
    if(rotation.w>.5&&(time<life.x||time>=life.x+life.y||life.z<=0.))gl_Position=vec4(3.,3.,0.,1.);
    local=v;uv=(corner+.5)*art.yz;field=shield;event=life;material=art;kind=rotation.w;orientation=vec2(cos(a),sin(a));
    variation=fract(sin(life.x*.017+art.w*93.7)*43758.5453);
  }`;
  const fragment=`#version 300 es
  precision highp float;precision highp sampler2DArray;
  in vec2 local;in vec2 uv;flat in vec4 field;flat in vec4 event;
  flat in vec4 material;flat in float kind;flat in vec2 orientation;flat in float variation;
  uniform sampler2DArray artwork;uniform sampler2D scene;uniform sampler2D membrane;
  uniform float time;uniform float hasScene;uniform float lensScale;uniform float weaponAware;uniform vec2 viewport;out vec4 pixel;
  float front(float d,float r,float width){float b=abs(d-r)/width;return exp(-b*b*2.8);}
  void main(){
    if(kind<.5){vec4 c=texture(artwork,vec3(uv,material.x));pixel=vec4(c.rgb*c.a,c.a);return;}
    float ms=time-event.x,t=ms*.001,age=ms/event.y;
    if(age<0.||age>=1.||event.z<=0.)discard;
    vec2 q=local/field.xy,h=field.zw/field.xy;
    float unit=min(field.x,field.y),edge=(length(q)-1.)*unit;
    if(edge>6.)discard;
    float inside=1.-smoothstep(-.7,.65,edge);
    float z=sqrt(max(0.,1.-dot(q,q))),hz=sqrt(max(0.,1.-dot(h,h)));
    vec2 delta=q-h;float chord=length(vec3(delta,z-hz));
    // Arc-length approximation: a wave follows the bubble instead of behaving
    // like a flat circle pasted over the ship. No per-pixel inverse trig.
    float chord2=chord*chord,d=chord*(1.+chord2*(.041667+chord2*.0046875));
    float seed=variation;
    float fade=1.-smoothstep(.52,1.,age),surface=material.y;
    float hot=exp(-ms/32.),contact=length(local-field.zw);
    float response=floor(event.w*.5),focused=weaponAware*(1.-step(.5,response));
    float dispersed=weaponAware*step(.5,response)*(1.-step(1.5,response)),pulse=weaponAware*step(1.5,response);
    float rim=exp(-edge*edge*.42),halo=exp(-edge*edge*.055),nearby=exp(-d*d*2.5);
    float grazing=pow(1.-z,2.3);
    // Stable flowing interference on a curved surface, not jumping lightning.
    vec2 domain=vec2(q.x,q.y+z*.34),phase=vec2(material.w*.193,material.w*.317);
    vec2 flow=vec2(time*.000006,-time*.000004);
    vec2 warp=vec2(0.);float cloud=.5,veins=0.;
    // The newest contact owns the membrane and scene refraction. Older hits
    // retain their flares and waves without re-sampling the same full bubble.
    if(surface>.5){
      warp=texture(membrane,domain*.029+phase+flow).rg-.5;
      vec2 cells=texture(membrane,domain*.066+phase+warp*.021+flow*.7).rg;
      vec2 micro=texture(membrane,domain*.157+phase+warp*.024-flow*.3).rg;
      cloud=mix(cells.x,cells.y,.35);
      veins=(1.-smoothstep(.006,.035,abs(cloud-.51)))*.8+(1.-smoothstep(.012,.05,abs(micro.y-.50)))*.28;
    }
    // The crest spreads from this contact over the curved membrane. A quieter,
    // dispersive wake and small field variation prevent stamped concentric rings.
    float distance=max(0.,d+((cloud-.5)*.062+dot(delta,warp)*.045)*smoothstep(.012,.14,t));
    float shock=front(distance,.012+t*(3.7+seed*.9+dispersed*1.8),max(.024,1.25/unit)*(1.+dispersed*.8));
    float wake=front(distance,max(0.,t-.070)*(3.0+seed*.5+dispersed),max(.040,1.9/unit)*(1.+dispersed))*.38;
    float lens=(shock+wake)*inside*exp(-d*.55)*exp(-t*3.5)*(1.-focused*.6+dispersed*.5-pulse*.15);
    float relief=.65+.35*z;
    float skin=(.052+grazing*.13+cloud*.035+veins*.10)*inside*relief*surface;
    float direction=.35+.65*clamp(dot(q,normalize(vec2(-.6,-.8))),0.,1.);
    float rimLight=(rim*(.22+.38*direction)+halo*.055)*surface;
    float pressure=exp(-d*d/((.018+.12*smoothstep(0.,.16,t))*(1.-focused*.7+dispersed*1.6)))*exp(-t*(6.-focused*2.+pulse*3.));
    float impactPatch=inside*(pressure*.72+nearby*veins*.18*exp(-t*4.));
    float coreSize=clamp(unit*.045,1.15,6.)*(1.-focused*.25+dispersed*.6);
    float core=exp(-contact*contact/(coreSize*coreSize))*(hot*2.6+exp(-t*27.)*.6+focused*exp(-t*14.)*.9);
    float bloom=exp(-contact*contact/(coreSize*coreSize*22.))*exp(-ms/65.)*.50;
    vec3 cyan=vec3(.18,.58,1.),white=vec3(.78,.93,1.);
    float reflection=pow(max(0.,dot(normalize(vec3(q,z)),normalize(vec3(-.42,-.5,.8)))),14.)*.12*inside*surface;
    vec3 light=cyan*(lens*1.12+skin+rimLight+impactPatch+bloom*.35)+white*(core+bloom+reflection+shock*inside*exp(-t*9.)*.18+veins*.025*inside*surface);
    light+=cyan*inside*dispersed*(.11+grazing*.16)*exp(-t*4.5);
    light*=1.-weaponAware*(1.-material.z)*(.05+.08*sin(ms*.11+seed*17.));
    float refraction=hasScene*surface*inside*(.22+.38*grazing+lens*.16)*fade;
    // OG lens magnification and a contact ripple displace the actual scene.
    vec2 offset=q*field.xy*(.012+.018*grazing)+normalize(delta+vec2(.0001,0.))*(shock-wake*.85)*min(5.,unit*.06)*exp(-t*4.);
    offset+=warp*min(1.5,unit*.018)*(.35+nearby*.65);
    vec2 displacement=mat2(orientation.x,orientation.y,-orientation.y,orientation.x)*offset*lensScale;
    vec2 screen=vec2(gl_FragCoord.x,viewport.y-gl_FragCoord.y);
    vec4 background=vec4(0.);
    if(surface>.5&&hasScene>.5)background=texture(scene,clamp((screen-displacement)/viewport,vec2(0.),vec2(1.)));
    if(mod(event.w,2.)>.5){
      float cell=(atan(q.y,q.x)+3.141593)*2.9+seed*13.;
      float a=fract(sin(floor(cell)*127.1+seed*311.7)*43758.5453);
      float b=fract(sin((floor(cell)+1.)*127.1+seed*311.7)*43758.5453);
      float fracture=mix(a,b,smoothstep(0.,1.,fract(cell)));
      float broken=smoothstep(.29,.62,fracture-t*.7);
      light=vec3(.28,.64,1.)*(lens*.8+rim*broken*.36)*exp(-t*9.)
        +vec3(1.,.55,.21)*(core+bloom)*.7;
      refraction*=broken*(1.-age);
    }
    light*=fade*event.z;
    float glow=min(.9,max(light.r,max(light.g,light.b))*.72);
    float alpha=background.a*refraction*(1.-glow)+glow;if(alpha<.002)discard;
    pixel=vec4(background.rgb*refraction*(1.-glow)+light,alpha);
  }`;
  const arcVertex=`#version 300 es
  precision highp float;
  layout(location=0) in vec2 corner;layout(location=1) in vec4 path;
  layout(location=2) in vec4 life;layout(location=3) in vec4 style;
  layout(location=4) in vec4 extras;
  uniform sampler2D poses;uniform vec2 viewport;uniform float time;
  out vec2 strip;flat out vec4 colour;flat out float lineWidth;
  void main(){
    int id=int(life.x);vec4 p=texelFetch(poses,ivec2(id,0),0),r=texelFetch(poses,ivec2(id,1),0);
    float age=time-life.y-life.z,span=life.w-life.z;
    float fade=smoothstep(0.,7.,age)*(1.-smoothstep(span*.18,span,age));
    // Coherent brightness modulation; the path itself never jumps between frames.
    float flicker=.93+.07*sin(age*.036+style.w*31.);
    vec2 a=path.xy*r.xy,b=path.zw*r.xy;
    if(style.z>.5){
      float seconds=max(0.,age)*.001;
      // Keep sparks readable on a 44px fleet hull, with shorter travel on large
      // previews. Velocity and cooling are continuous, never random per frame.
      vec2 velocity=path.zw*clamp(min(r.x,r.y)*1.6,70.,180.);
      float travel=(1.-exp(-seconds*6.5))/6.5;
      a+=velocity*travel;
      b=a-velocity*(.018+.017*extras.x)*exp(-seconds*6.5);
    }
    mat2 rotate=mat2(cos(r.z),sin(r.z),-sin(r.z),cos(r.z));
    a=p.xy+rotate*a;b=p.xy+rotate*b;
    vec2 tangent=normalize(b-a+vec2(.00001,0.));vec2 normal=vec2(-tangent.y,tangent.x);
    float scale=clamp(min(r.x,r.y)/48.,.65,2.2);
    lineWidth=style.z>.5?max(.7,style.x*scale):style.x*scale;
    float along=corner.x+.5;
    vec2 screen=mix(a,b,along)+normal*corner.y*lineWidth*6.;
    gl_Position=vec4(screen/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
    if(age<0.||age>=span||r.w<.5)gl_Position=vec4(3.,3.,0.,1.);
    strip=vec2(along,corner.y*3.);
    float heat=style.z>.5?pow(clamp(1.-age/max(1.,span),0.,1.),1.4):1.;
    colour=vec4(mix(vec3(.12,.44,1.),vec3(.86,.96,1.),extras.y*heat),fade*flicker*style.y);
  }`;
  const arcFragment=`#version 300 es
  precision highp float;in vec2 strip;flat in vec4 colour;flat in float lineWidth;out vec4 pixel;
  void main(){
    float distance=abs(strip.y);
    float aa=max(fwidth(strip.y),.035);
    float core=1.-smoothstep(.12,.12+aa*.85,distance);
    float glow=exp(-distance*distance*1.8)*.12;
    float ends=smoothstep(0.,.08,strip.x)*(1.-smoothstep(.90,1.,strip.x));
    vec3 light=(colour.rgb*glow+mix(colour.rgb,vec3(1.),.25)*core)*colour.a*ends;
    pixel=vec4(light,min(1.,max(light.r,max(light.g,light.b))));
  }`;
  function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  function program(gl){const p=gl.createProgram(),v=shader(gl,gl.VERTEX_SHADER,arcVertex),f=shader(gl,gl.FRAGMENT_SHADER,arcFragment);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
  function hash(value){let n=value>>>0;n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return (n^(n>>>15))>>>0;}
  function build(index,event,serial){
    let seed=hash(Math.round(event.born*1000)^Math.imul(index+1,0x9e3779b1)^Math.imul(serial,0x85ebca6b));
    const initialSeed=seed,random=()=>{seed=hash(seed+0x9e3779b9);return seed/4294967296;},data=[];
    const normal=Math.hypot(event.nx,event.ny)<.12?random()*Math.PI*2:Math.atan2(event.ny,event.nx),strength=Math.max(.5,Math.min(1.8,event.strength||1));
    const add=(a,b,start,end,width,brightness,type=0)=>{
      if(data.length>=SEGMENTS*STRIDE)return;
      data.push(...a,...b,index,event.born,start,end,width,brightness*strength,type,random(),random(),type ? .8 : random()*.4,0,0);
    };
    const channels=1+(random()>.48?1:0),collapse=event.collapse;
    for(let channel=0;channel<channels;channel++){
      const side=channel===0?-1:1,span=(.13+random()*.18)*(collapse?1.25:1),steps=6;
      const h=[event.nx*.985,event.ny*.985],depth=Math.sqrt(Math.max(0,1-h[0]*h[0]-h[1]*h[1]));
      const tilt=(random()-.5)*.9,tangent=[-Math.sin(normal)*side,Math.cos(normal)*side];
      let previous=h;
      const end=105+random()*100,width=.24+random()*.12;
      for(let k=1;k<=steps;k++){
        const t=k/steps,angle=span*t,bend=(random()-.5)*.009*Math.sin(Math.PI*t);
        const point=h.map((v,axis)=>v*Math.cos(angle)+(tangent[axis]*Math.cos(tilt)-v*depth*Math.sin(tilt))*Math.sin(angle)+bend);
        const start=16+t*30;
        add(previous,point,start,end,width*(1.-t*.3),.25*(1.-t*.4));
        previous=point;
      }
    }
    // A tiny, seeded spray of hot flecks. Short inertial trails cool rapidly;
    // geometry is generated once per hit and the GPU integrates their motion.
    const sparks=7+Math.floor(random()*4),h=[event.nx,event.ny];
    for(let i=0;i<sparks;i++){
      const angle=normal+(random()-.5)*3.2,speed=.65+random()*.60;
      const velocity=[Math.cos(angle)*speed,Math.sin(angle)*speed];
      add(h,velocity,random()*12,110+random()*110,.60+random()*.4,1.05+random()*.55,1);
    }
    return {data:new Float32Array(data),seed:initialSeed,segments:data.length/STRIDE};
  }
  async function createShield(baseFactory,options={}){
    const source=options.sourceCanvas;
    let sceneTexture,noiseTexture,materialUniforms=null,copyCanvas=null,copyContext=null,captureWidth=1,captureHeight=1;
    const materialStats={sourceCaptures:0,capturePixelsPeak:0},noiseSize=128;
    const noiseBytes=(noiseSize*noiseSize*4*4-4)/3,maxSceneBytes=SCENE_WIDTH*SCENE_HEIGHT*4;
    function bindMaterial(gl,p,{time,effects}){
      materialUniforms??={scene:gl.getUniformLocation(p,'scene'),noise:gl.getUniformLocation(p,'membrane'),enabled:gl.getUniformLocation(p,'hasScene'),lensScale:gl.getUniformLocation(p,'lensScale'),weaponAware:gl.getUniformLocation(p,'weaponAware')};
      const capture=Boolean(source?.width&&source?.height&&effects&&base.visibility(time).active);
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,sceneTexture);
      if(capture){
        const scale=Math.min(1,SCENE_WIDTH/source.width,SCENE_HEIGHT/source.height),w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale));
        if(w!==captureWidth||h!==captureHeight){captureWidth=w;captureHeight=h;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);}
        let image=source;
        if(scale<1){
          if(!copyCanvas){copyCanvas=document.createElement('canvas');copyContext=copyCanvas.getContext('2d');}
          if(copyCanvas.width!==w||copyCanvas.height!==h){copyCanvas.width=w;copyCanvas.height=h;}
          copyContext.globalCompositeOperation='copy';copyContext.drawImage(source,0,0,w,h);image=copyCanvas;
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
        materialStats.sourceCaptures++;materialStats.capturePixelsPeak=Math.max(materialStats.capturePixelsPeak,w*h);
      }
      gl.uniform1i(materialUniforms.scene,2);gl.uniform1f(materialUniforms.enabled,capture?1:0);
      gl.uniform1f(materialUniforms.lensScale,options.refractionScale??1);
      gl.uniform1f(materialUniforms.weaponAware,options.weaponAware?1:0);
      gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,noiseTexture);gl.uniform1i(materialUniforms.noise,5);
    }
    const base=await baseFactory({...options,presentation:{vertex,fragment,history:HISTORY,latestSurface:true,weaponAware:!!options.weaponAware,premultipliedShields:true,bind:bindMaterial}});
    const {gl}=base,capacity=options.maxShips||256,canvas=options.canvas,events=new Array(capacity*HISTORY).fill(null);
    sceneTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,sceneTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const noise=new Uint8Array(noiseSize*noiseSize*4);for(let i=0;i<noise.length;i+=4){const value=hash(i+124891);noise[i]=value&255;noise[i+1]=value>>>8&255;noise[i+2]=value>>>16&255;noise[i+3]=255;}
    noiseTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,noiseTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,noiseSize,noiseSize,0,gl.RGBA,gl.UNSIGNED_BYTE,noise);gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    const serials=new Uint32Array(capacity),poses=new Float32Array(capacity*8),rows=new Array(capacity);
    const staging=new Float32Array(capacity*HISTORY*SEGMENTS*STRIDE),p=program(gl);
    const vao=gl.createVertexArray(),quad=gl.createBuffer(),buffer=gl.createBuffer();
    gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,.5]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,staging.byteLength,gl.DYNAMIC_DRAW);
    for(let a=1;a<=4;a++){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,STRIDE*4,(a-1)*16);gl.vertexAttribDivisor(a,1);}
    const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,capacity,2);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    const uniforms={time:gl.getUniformLocation(p,'time'),viewport:gl.getUniformLocation(p,'viewport'),poses:gl.getUniformLocation(p,'poses')};
    let count=0,disposed=false;
    const stats={uniqueEvents:0,duplicateSubmissions:0,retiredEvents:0,arcDrawCalls:0,activeContacts:0,activeSegments:0,generatedSegments:0,peakSegments:0,seedDigest:0};
    function pose(index,r){
      Object.assign(rows[index]||(rows[index]={angle:0,phase:0,motion:0}),r);
      const o=index*4,s=capacity*4+o;
      poses[o]=r.x;poses[o+1]=r.y;poses[o+2]=r.w;poses[o+3]=r.h;
      poses[s]=r.rx;poses[s+1]=r.ry;poses[s+2]=r.angle||0;poses[s+3]=1;
    }
    function hit(index,event={}){
      if(!base.hit(index,event))return false;
      const id=event.eventId??null;let lane=-1;
      for(let j=0;j<HISTORY;j++){const e=events[index*HISTORY+j];if(e&&e.born===(event.born??0)&&e.id===id){lane=j;break;}}
      if(lane>=0){stats.duplicateSubmissions++;poses[capacity*4+index*4+3]=1;return true;}
      lane=0;for(let j=1;j<HISTORY;j++)if((events[index*HISTORY+j]?.born??-Infinity)<(events[index*HISTORY+lane]?.born??-Infinity))lane=j;
      const r=rows[index],nx=(event.x||0)/r.rx,ny=(event.y||0)/r.ry,n=Math.max(1,Math.hypot(nx,ny));
      const next={...event,born:event.born??0,id,nx:nx/n,ny:ny/n};
      const geometry=build(index,next,++serials[index]);events[index*HISTORY+lane]={...next,...geometry};
      stats.uniqueEvents++;stats.generatedSegments+=geometry.segments;stats.seedDigest=hash(stats.seedDigest^geometry.seed);
      poses[capacity*4+index*4+3]=1;return true;
    }
    function render(time,settings={}){
      const status=base.render(time,settings);let floats=0,contacts=0;
      if(settings.effects)for(let i=0;i<events.length;i++){
        const e=events[i];if(!e||time<e.born)continue;
        if(time-e.born>=430){if(!e.retired){e.retired=true;stats.retiredEvents++;}continue;}
        if(poses[capacity*4+Math.floor(i/HISTORY)*4+3]<.5)continue;
        staging.set(e.data,floats);floats+=e.data.length;contacts++;
      }
      stats.activeContacts=contacts;stats.activeSegments=floats/STRIDE;stats.peakSegments=Math.max(stats.peakSegments,stats.activeSegments);
      if(floats){
        // One tiny pose texture and one compact instance stream; no per-frame paths.
        for(let i=0;i<count;i++){const r=rows[i];if(!r?.motion)continue;
          poses[i*4]=r.x+Math.sin(time*.0007+(r.phase||0))*r.motion;
          poses[i*4+1]=r.y+Math.cos(time*.0006+(r.phase||0))*r.motion;
          poses[capacity*4+i*4+2]=r.angle+Math.sin(time*.0005+(r.phase||0))*r.motion*.125;
        }
        gl.useProgram(p);gl.uniform1f(uniforms.time,time);gl.uniform2f(uniforms.viewport,canvas.width,canvas.height);gl.uniform1i(uniforms.poses,1);
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,capacity,2,gl.RGBA,gl.FLOAT,poses);
        gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,staging,0,floats);
        gl.blendFunc(gl.ONE,gl.ONE);gl.drawArraysInstanced(gl.TRIANGLES,0,6,floats/STRIDE);stats.arcDrawCalls++;
      }
      return {...status,drawCalls:status.drawCalls+(floats?1:0)};
    }
    return Object.freeze({...base,hit,render,weaponAware:!!options.weaponAware,
      setFleet(fleet){base.setFleet(fleet);events.fill(null);serials.fill(0);poses.fill(0);rows.fill(null);count=fleet.length;fleet.forEach((r,i)=>pose(i,r));},
      updatePose(index,r){base.updatePose(index,r);if(index>=0&&index<count)pose(index,r);},
      hide(index){base.hide(index);if(index>=0&&index<count)poses[capacity*4+index*4+3]=0;},
      snapshot(){const shared=base.snapshot();return {...shared,implementation:'cinematic-shields-v1',...stats,
        drawCalls:shared.drawCalls+stats.arcDrawCalls,bufferBytes:shared.bufferBytes+staging.byteLength+48,
        textureBytes:shared.textureBytes+poses.byteLength+captureWidth*captureHeight*4+noiseBytes,maxTextureBytes:shared.maxTextureBytes+maxSceneBytes+noiseBytes,
        ...materialStats,appearance:options.weaponAware?'weapon-response-v2':'cinematic-impact-v4',refractionEnabled:Boolean(source),captureWidth,captureHeight,maxSceneTextureBytes:maxSceneBytes,membraneNoiseBytes:noiseBytes,
        maxSegments:capacity*HISTORY*SEGMENTS,poseTextureBytes:poses.byteLength,
        eventCapacity:events.length,disposed};},
      destroy(){if(disposed)return;disposed=true;gl.deleteTexture(sceneTexture);gl.deleteTexture(noiseTexture);gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteBuffer(quad);gl.deleteVertexArray(vao);gl.deleteProgram(p);events.fill(null);if(copyCanvas){copyCanvas.width=copyCanvas.height=0;}base.destroy();}
    });
  }
  window.nativeEffectProfiles.register('cinematic-shields-v1',{createShield});
})();
