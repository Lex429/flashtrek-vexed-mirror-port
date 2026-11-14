/* Badlands plasma: world geometry, shared flow and nebula-material deformation.
 * Ship motion integrates forces; the registered damage owner applies exposure. */
(() => {
  'use strict';
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
  const hash=n=>{let x=Math.imul(n+173,374761393);x=Math.imul(x^(x>>>13),1274126177);return ((x^(x>>>16))>>>0)/4294967296;};
  const root=typeof window==='undefined'?self:window;
  const layout=[[-.02,.09,64,1],[.22,.12,86,-1],[-.27,-.16,74,1],[.30,-.27,98,-1],[-.26,.34,88,-1],[.09,-.32,76,1],[.02,.42,81,1]];
  const fields=new WeakMap();let enabled=true;
  const time=state=>Number(state?.shipSimulation?.seconds)||0;
  function vortices(state,box,system=state?.system){
    if(!enabled)return [];
    const patch=state?.devMode&&state.system===1&&system===1?root.nativeDevFog?.physicalRegion?.(state):null;
    if(!patch)return root.nativeBadlandsWeather?.vortices(state,box,system)||[];
    const signature=[patch.x,patch.y,patch.width,patch.height,patch.angle].join(':');let saved=fields.get(state);
    if(saved?.signature===signature)return saved.list;
    const c=Math.cos(patch.angle),s=Math.sin(patch.angle),scale=Math.min(1,patch.width/2100,patch.height/1600);
    const list=layout.map(([u,v,radius,direction],i)=>{const x=u*patch.width,y=v*patch.height;return Object.freeze({id:'dev-plasma:'+i,
      x:patch.x+x*c-y*s,y:patch.y+x*s+y*c,radius:radius*scale,direction,phase:hash(i+4)*Math.PI*2,
      strength:.85+hash(i+13)*.35});});
    fields.set(state,{signature,list});return list;
  }
  // Static geometry for the material grid. The direct ship sampler below keeps
  // its existing arithmetic; regression checks compare both transport paths.
  function prepareFlow(vortex,x,y){
    const dx=x-vortex.x,dy=y-vortex.y,distance=Math.hypot(dx,dy),r=distance/vortex.radius;
    if(r>=1.35)return null;
    const edge=1-smooth(.68,1.35,r),nx=distance>1e-6?dx/distance:0,ny=distance>1e-6?dy/distance:0;
    const speedScale=Math.sqrt(vortex.radius/135),core=r/.38,swirl=vortex.direction*360*speedScale*vortex.strength*(2*core/(1+core*core));
    const angle=Math.atan2(dy,dx);
    return {nx,ny,swirl,speedScale,edge,distance,outflowShape:Math.exp(-Math.pow((r-.68)/.55,2)),radialEase:smooth(0,.12,r),
      pressure:(95*smooth(0,.16,r)+swirl*swirl/Math.max(distance,vortex.radius*.35))*edge,
      heat:edge*(.25+.75*Math.exp(-Math.pow((r-.38)/.44,2))),spin:vortex.direction*Math.abs(swirl)/Math.max(distance,vortex.radius*.30)*.62,
      turbulenceBase:angle*3+vortex.phase,turbulenceOffset:.7*Math.sin(angle*5-distance/vortex.radius*4)};
  }
  const flowSurge=(vortex,seconds)=>smooth(.55,.96,.5+.5*Math.sin(seconds*.58+vortex.phase));
  function preparedFlow(g,surge,result={}){
    const {nx,ny,swirl,speedScale,edge,distance}=g;
    const outflow=surge*300*speedScale*g.outflowShape,radial=(outflow-58*speedScale*(1-surge))*g.radialEase,pressure=g.pressure*(1-.95*surge);
    result.vx=-ny*swirl+nx*radial;result.vy=nx*swirl+ny*radial;result.ax=-nx*pressure;result.ay=-ny*pressure;
    result.edge=edge;result.heat=g.heat;result.spin=g.spin;result.surge=surge;result.distance=distance;return result;
  }
  function flowAt(vortex,x,y,seconds){
    const dx=x-vortex.x,dy=y-vortex.y,distance=Math.hypot(dx,dy),r=distance/vortex.radius;
    if(r>=1.35)return null;
    const edge=1-smooth(.68,1.35,r),nx=distance>1e-6?dx/distance:0,ny=distance>1e-6?dy/distance:0;
    const speedScale=Math.sqrt(vortex.radius/135),core=r/.38,swirl=vortex.direction*360*speedScale*vortex.strength*(2*core/(1+core*core));
    const surge=flowSurge(vortex,seconds);
    const outflow=surge*300*speedScale*Math.exp(-Math.pow((r-.68)/.55,2)),radial=(outflow-58*speedScale*(1-surge))*smooth(0,.12,r);
    const pressure=(95*smooth(0,.16,r)+swirl*swirl/Math.max(distance,vortex.radius*.35))*edge*(1-.95*surge);
    return {vx:-ny*swirl+nx*radial,vy:nx*swirl+ny*radial,ax:-nx*pressure,ay:-ny*pressure,
      edge,heat:edge*(.25+.75*Math.exp(-Math.pow((r-.38)/.44,2))),spin:vortex.direction*Math.abs(swirl)/Math.max(distance,vortex.radius*.30)*.62,
      surge,distance};
  }
  function sample(state,ship){
    if(!ship?.entity||ship.hull<=0||ship.entity.landed||ship.entity.journey||['destroyed','warp','arriving'].includes(ship.entity.phase)||root.vexedWarp?.active)return null;
    let strongest=null,vortex=null;
    const box={minX:ship.x-150,minY:ship.y-150,maxX:ship.x+150,maxY:ship.y+150};
    for(const v of vortices(state,box,ship.system??state.system)){const f=flowAt(v,ship.x,ship.y,time(state));if(f&&(!strongest||f.edge>strongest.edge)){strongest=f;vortex=v;}}
    if(!strongest)return null;
    const f=strongest,mass=window.nativeShipMotion.shipMass(ship),area=ship.dimensions.width*ship.dimensions.height,inertia=window.nativeShipMotion.shipInertia(ship);
    const coupling=clamp(area/(mass*300),.16,2.4),angularCoupling=clamp(area*(ship.dimensions.width**2+ship.dimensions.height**2)/(inertia*2000),.15,3),slip=Math.hypot(f.vx-ship.vx,f.vy-ship.vy);
    return {...f,id:vortex.id,rate:coupling*f.edge*1.65,ax:f.ax*coupling,ay:f.ay*coupling,
      spinRate:angularCoupling*f.edge*3,damageRate:Math.max(8,ship.definition.hull*.025)*f.heat*(.6+Math.min(2,slip/350)),
      from:{x:vortex.x,y:vortex.y}};
  }
  // Offline integrated top-down funnel attributes, shared by all seven vortices.
  // There is no colour artwork, ray march, noise generation or canvas per funnel.
  const volumeSize=96,volumeFrames=32,volumeWidth=768,volumeHeight=384;
  let volume=null,volumeFailure=null;
  function installVolume(bytes){
    if(bytes.length!==volumeWidth*volumeHeight*4)throw Error('Invalid plasma volume attributes');
    volume=Object.freeze({bytes,width:volumeWidth,height:volumeHeight,size:volumeSize,frames:volumeFrames});return volume;
  }
  const ready=typeof document!=='undefined'&&document.currentScript?.src&&typeof URL==='function'&&typeof fetch==='function'?fetch(new URL('assets/plasma-volume-v1.bin?v=top-down-1',document.currentScript.src))
    .then(response=>{if(!response.ok)throw Error('Plasma volume HTTP '+response.status);return response.arrayBuffer();})
    .then(buffer=>{installVolume(new Uint8Array(buffer));return true;}).catch(error=>{volumeFailure=String(error);return false;}):Promise.resolve(false);
  const appearances=new WeakMap();
  function appearance(list,seconds){
    let saved=appearances.get(list);if(!saved){saved={seconds:NaN,items:list.map(v=>({v}))};appearances.set(list,saved);}
    if(saved.seconds!==seconds){saved.seconds=seconds;for(const a of saved.items){
      const v=a.v,orientation=v.phase*1.7,turn=-seconds*.32*v.direction+v.phase;
      a.c=Math.cos(orientation);a.s=Math.sin(orientation);a.tc=Math.cos(turn);a.ts=Math.sin(turn);
      a.frame=((seconds*4*v.direction+v.phase*volumeFrames/(Math.PI*2))%volumeFrames+volumeFrames)%volumeFrames;
      a.formation=1-.6*flowSurge(v,seconds);
    }}return saved.items;
  }
  const volumeSample=new Float64Array(4);
  function sampleVolume(frame,qx,qy,out){
    const px=clamp((qx/2.7+.5)*(volumeSize-1),0,volumeSize-1),py=clamp((qy/2.7+.5)*(volumeSize-1),0,volumeSize-1);
    const x=Math.floor(px),y=Math.floor(py),fx=px-x,fy=py-y,f=Math.floor(frame),ft=frame-f;
    for(let c=0;c<4;c++){
      let value=0;for(let k=0;k<2;k++){
        const n=(f+k)%volumeFrames,base=((Math.floor(n/8)*volumeSize+y)*volumeWidth+n%8*volumeSize+x)*4+c;
        const dx=x<volumeSize-1?4:0,dy=y<volumeSize-1?volumeWidth*4:0,b=volume.bytes;
        value+=((b[base]*(1-fx)+b[base+dx]*fx)*(1-fy)+(b[base+dy]*(1-fx)+b[base+dy+dx]*fx)*fy)*(k?ft:1-ft);
      }out[c]=value/255;
    }return out;
  }
  // The material renderer samples the existing cloud through the volume flow.
  // Optical depth and internal illumination remain cut by the actual fluid/wake.
  function sculpt(list,x,y,seconds=0,result={}){
    result.x=x;result.y=y;result.density=1;result.shade=1;result.blend=0;result.heat=0;
    if(!volume)return result;
    for(const a of appearance(list,seconds)){
      const v=a.v,dx=x-v.x,dy=y-v.y,r2=(dx*dx+dy*dy)/(v.radius*v.radius);if(r2>=1.35*1.35)continue;
      const qx=(dx*a.c+dy*a.s)/v.radius,qy=(-dx*a.s+dy*a.c)/v.radius;
      if(Math.abs(qx)>1.35||Math.abs(qy)>1.35)continue;
      const b=sampleVolume(a.frame,qx,qy,volumeSample),edge=1-smooth(1.13,1.35,Math.sqrt(r2)),coverage=b[3]*edge;
      const amount=coverage*.8,scale=1+.5*coverage;
      result.x+=((dx*a.tc-dy*a.ts)*scale-dx)*amount;result.y+=((dx*a.ts+dy*a.tc)*scale-dy)*amount;
      result.density*=1+a.formation*edge*(8.5*b[0]-.35*b[3]);
      result.shade*=1+a.formation*coverage*(1.7*b[1]-.95);
      result.blend=Math.max(result.blend,coverage*.85);result.heat=Math.max(result.heat,a.formation*b[2]*.9*edge);
    }
    return result;
  }
  root.nativePlasmaVortices=Object.freeze({vortices,sample,flowAt,prepareFlow,preparedFlow,flowSurge,sculpt,appearance,installVolume,ready,get volume(){return volume;},setEnabled:value=>{enabled=!!value;},
    snapshot:state=>({enabled,vortices:vortices(state).map(v=>({...v})),renderer:{mode:'nebula-volume',canvases:0,textureBytes:volume?.bytes.byteLength||0,ready:!!volume,failure:volumeFailure}})});
})();
