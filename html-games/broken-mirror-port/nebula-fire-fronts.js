/* Plasma heat fronts: bounded visual weather inside the owned nebula material. */
(() => {
  'use strict';
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
  const hash=n=>{let x=Math.imul(n+271,374761393);x=Math.imul(x^(x>>>13),1274126177);return ((x^(x>>>16))>>>0)/4294967296;};
  const limit=3,size=96,frames=16,width=384,height=384,empty=Object.freeze([]);
  let volume=null,loading=null,failure=null;
  const assetURL=typeof document!=='undefined'&&document.currentScript?.src&&typeof URL==='function'?new URL('assets/nebula-fire-v1.bin?v=plasma-cells-3',document.currentScript.src):null;
  function installVolume(bytes){if(bytes.length!==width*height*4)throw Error('Invalid fire-front attributes');volume=Object.freeze({bytes,width,height,size,frames});return volume;}
  function ensure(){
    if(volume)return Promise.resolve(true);if(loading)return loading;
    if(!assetURL||typeof fetch!=='function')return Promise.resolve(false);
    loading=fetch(assetURL).then(r=>{if(!r.ok)throw Error('Fire-front HTTP '+r.status);return r.arrayBuffer();}).then(b=>{installVolume(new Uint8Array(b));return true;}).catch(error=>{failure=String(error);return false;});return loading;
  }
  function envelope(age,duration,phase=0){return smooth(0,1.8,age)*(1-smooth(duration-4,duration,age))*(.82+.18*(.5+.5*Math.sin(age*1.7+phase)));}
  const places=[[0,0,.25],[.21,-.14,-.5],[-.23,.18,.65],[.04,.31,-.2],[-.27,-.23,.4],[.28,.28,-.7]];
  function createModel({production=false}={}){
    if(production)return createProductionModel();
    let owner=null,signature='',patch=null,available=false,enabled=true,visible=false,clock=0,nextAt=.35,sequence=0,events=[],pending=[];
    const material={fronts:empty,time:0};
    function reset(){owner=null;signature='';patch=null;available=visible=false;clock=sequence=0;nextAt=.35;events=[];pending=[];}
    function configure(state,current){
      const p=current?.patch,key=p?[p.x,p.y,p.width,p.height,p.angle].join(':'):'';
      if(owner!==state||signature!==key){reset();owner=state;signature=key;patch=p&&{...p};}
      available=!!state?.devMode&&state.system===1&&!!current?.eligible&&current.enabled&&current.preset==='badlands'&&!!patch;
      if(!available){events=[];pending=[];}
    }
    function emit(anchor){
      if(events.length>=limit)return false;
      const id=++sequence,seed=id*71,[u,v,turn]=places[(id-1)%places.length],c=Math.cos(patch.angle),s=Math.sin(patch.angle),angle=patch.angle+turn;
      events.push({id:'dev-fire:'+id,born:clock,x:anchor?.x??patch.x+u*patch.width*c-v*patch.height*s,y:anchor?.y??patch.y+u*patch.width*s+v*patch.height*c,
        halfWidth:Math.min(190,patch.width*.20),halfHeight:Math.min(124,patch.height*.15),angle,phase:hash(seed)*Math.PI*2,duration:13+hash(seed+1)*5,
        driftX:Math.cos(angle)*3.5,driftY:Math.sin(angle)*3.5});return true;
    }
    function frame(state,dt,view,current){
      configure(state,current);visible=available&&enabled&&!view.hidden&&!view.reducedMotion;
      if(!visible||view.suspended||!(dt>0))return;
      void ensure();clock+=dt;events=events.filter(e=>clock-e.born<e.duration);
      for(const e of events){e.x+=e.driftX*dt;e.y+=e.driftY*dt;}
      while(pending.length&&events.length<limit)emit(pending.shift());
      if(clock>=nextAt){emit(null);nextAt=clock+6+hash(sequence*101+3)*4;}
    }
    function trigger(state,current,anchor=null){configure(state,current);if(!available||!enabled||pending.length+events.length>=limit)return false;pending.push(anchor&&{x:anchor.x,y:anchor.y});return true;}
    function setEnabled(value){enabled=!!value;if(!enabled){events=[];pending=[];visible=false;}nextAt=clock+.35;}
    return Object.freeze({frame,trigger,setEnabled,reset,material(){material.fronts=visible?events:empty;material.time=clock;return material;},
      snapshot:()=>({enabled,available,visible,clock,nextAt,pending:pending.length,limit,emitted:sequence,fronts:events.map(e=>({...e,age:clock-e.born,intensity:envelope(clock-e.born,e.duration,e.phase)})),
        renderer:{mode:'nebula-material',ready:!!volume,textureBytes:volume?.bytes.byteLength||0,failure}})});
  }
  function createProductionModel(){
    let clock=0,available=false,visible=false,enabled=true,events=[];
    const material={fronts:empty,time:0};
    return Object.freeze({frame(state,dt,view,current){
      available=!!current?.badlandsWeather&&!!window.nativeBadlandsWeather;
      visible=available&&enabled&&!view.hidden&&!view.reducedMotion;clock=Number(state?.shipSimulation?.seconds)||0;
      if(visible&&!view.suspended&&dt>0)void ensure();
      events=visible?window.nativeBadlandsWeather.heat(state,view,clock):[];
    },trigger:()=>false,setEnabled(value){enabled=!!value;if(!enabled){events=[];visible=false;}},reset(){clock=0;events=[];available=visible=false;},
      material(){material.fronts=visible?events:empty;material.time=clock;return material;},
      snapshot:()=>({production:true,enabled,available,visible,clock,pending:0,limit,emitted:events.length,fronts:events.map(e=>({...e,age:clock-e.born,intensity:envelope(clock-e.born,e.duration,e.phase)})),
        renderer:{mode:'nebula-material',ready:!!volume,textureBytes:volume?.bytes.byteLength||0,failure}})});
  }
  const cached=new WeakMap();
  function appearance(fronts,time){
    let saved=cached.get(fronts);if(!saved){saved={time:NaN,items:fronts.map(v=>({v,c:Math.cos(v.angle),s:Math.sin(v.angle)}))};cached.set(fronts,saved);}
    if(saved.time!==time){saved.time=time;for(const a of saved.items){const v=a.v;a.frame=((time*2+v.phase*frames/(Math.PI*2))%frames+frames)%frames;a.intensity=envelope(time-v.born,v.duration,v.phase);}}
    return saved.items;
  }
  const sample=new Float64Array(4);
  function at(frame,qx,qy){
    const px=clamp((qx*.5+.5)*(size-1),0,size-1),py=clamp((qy*.5+.5)*(size-1),0,size-1),x=Math.floor(px),y=Math.floor(py),fx=px-x,fy=py-y,f=Math.floor(frame),ft=frame-f;
    for(let c=0;c<4;c++){let value=0;for(let k=0;k<2;k++){
      const n=(f+k)%frames,j=((Math.floor(n/4)*size+y)*width+n%4*size+x)*4+c,dx=x<size-1?4:0,dy=y<size-1?width*4:0,b=volume.bytes;
      value+=((b[j]*(1-fx)+b[j+dx]*fx)*(1-fy)+(b[j+dy]*(1-fx)+b[j+dy+dx]*fx)*fy)*(k?ft:1-ft);
    }sample[c]=value/255;}return sample;
  }
  function sculpt(fronts,x,y,time,result={}){
    result.x=x;result.y=y;result.density=1;result.shade=1;result.blend=0;result.temperature=0;
    if(!volume)return result;
    for(const a of appearance(fronts,time)){
      const v=a.v,dx=x-v.x,dy=y-v.y,qx=(dx*a.c+dy*a.s)/v.halfWidth,qy=(-dx*a.s+dy*a.c)/v.halfHeight;
      if(Math.abs(qx)>=1||Math.abs(qy)>=1||a.intensity<=0)continue;
      const b=at(a.frame,qx,qy),coverage=b[3]*a.intensity;
      result.x+=(-qy*v.halfWidth*a.c-qx*v.halfHeight*a.s)*coverage*.025;
      result.y+=(-qy*v.halfWidth*a.s+qx*v.halfHeight*a.c)*coverage*.025;
      if(coverage>result.blend){result.density=1+coverage*(1.7*b[0]-.35);result.shade=1+coverage*(2*b[2]-.95);result.blend=coverage;result.temperature=b[1];}
    }return result;
  }
  function heat(rgb,t,coverage,density,out=rgb){const amount=coverage*smooth(.02,.65,density)*.8;
    out[0]=rgb[0]*(1-amount)+Math.min(1,rgb[0]*(1.08+.72*t)+.045*t)*amount;
    out[1]=rgb[1]*(1-amount)+Math.min(1,rgb[1]*(.98+.64*t)+.015*t)*amount;
    out[2]=rgb[2]*(1-amount)+Math.min(1,rgb[2]*(1.08+1.12*t)+.025*t)*amount;return out;}
  window.nativeNebulaFire=Object.freeze({createModel,appearance,sculpt,heat,envelope,installVolume,ensure,get volume(){return volume;},get ready(){return ensure();},limits:Object.freeze({fronts:limit,size,frames})});
})();
