/* Shared Badlands wind. Pure world-space sampling; ship-motion owns momentum. */
(() => {
  'use strict';
  const root=typeof window==='undefined'?self:window,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
  const cache=new WeakMap();let enabled=true;
  function regions(state){
    if(!enabled||!state)return [];
    const patch=state.devMode&&state.system===1?root.nativeDevFog?.physicalRegion?.(state):null;
    const home=root.nativeManualFlight?.anchor?.(73),frame=root.nativeManualFlight?.anchor?.(state.system),boundary=root.nativeBadlands?.boundary;
    const key=[state.system,patch?.x,patch?.y,patch?.width,patch?.height,patch?.angle,home?.x,home?.y,frame?.x,frame?.y].join(':');
    let saved=cache.get(state);if(saved?.key===key)return saved.list;
    const list=[];
    if(patch)list.push(Object.freeze({id:'dev-current',x:patch.x,y:patch.y,rx:patch.width*.5,ry:patch.height*.5,c:Math.cos(patch.angle),s:Math.sin(patch.angle),scale:420,phase:.91}));
    if(home&&frame&&boundary)list.push(Object.freeze({id:'badlands-current',x:home.x-frame.x,y:home.y-frame.y,rx:boundary.rx,ry:boundary.ry,c:1,s:0,scale:650,phase:2.17}));
    cache.set(state,{key,list});return list;
  }
  function weight(field,x,y){const dx=x-field.x,dy=y-field.y,px=dx*field.c+dy*field.s,py=-dx*field.s+dy*field.c;return 1-smooth(.72,1.02,Math.hypot(px/field.rx,py/field.ry));}
  function sampleAt(field,x,y,seconds,out={}){
    const dx=x-field.x,dy=y-field.y,px=(dx*field.c+dy*field.s)/field.scale,py=(-dx*field.s+dy*field.c)/field.scale;
    const edge=1-smooth(.72,1.02,Math.hypot(px*field.scale/field.rx,py*field.scale/field.ry));
    if(edge<1e-6){out.vx=out.vy=out.edge=out.spin=out.gust=0;return out;}
    const a=px*.92+py*.36+seconds*.17+field.phase,b=-px*.43+py*.83-seconds*.13+field.phase*2,d=px*.51-py*.77+seconds*.11+4.1;
    const gust=.25+.75*smooth(.12,.90,.5+.5*Math.sin(seconds*.37+field.phase+px*.17));
    const ca=Math.cos(a)*110,cb=Math.cos(b)*74,cd=Math.cos(d)*46,ux=-.36*ca-.83*cb+.77*cd,uy=.92*ca-.43*cb+.51*cd;
    out.vx=(ux*field.c-uy*field.s)*edge*gust;out.vy=(ux*field.s+uy*field.c)*edge*gust;
    out.edge=edge;out.gust=gust;out.spin=(Math.sin(a)*.10+Math.sin(b)*.065)*edge*gust;
    return out;
  }
  function offset(field,x,y,seconds,out={}){
    const dx=x-field.x,dy=y-field.y,px=(dx*field.c+dy*field.s)/field.scale,py=(-dx*field.s+dy*field.c)/field.scale;
    const edge=1-smooth(.72,1.02,Math.hypot(px*field.scale/field.rx,py*field.scale/field.ry));
    if(edge<1e-6){out.x=out.y=out.weight=0;return out;}
    const a=px*.92+py*.36+seconds*.17+field.phase,b=-px*.43+py*.83-seconds*.13+field.phase*2,d=px*.51-py*.77+seconds*.11+4.1;
    // Bounded analytic advection of the native cloud, moving with the sampled
    // current. No extra colour plate, particles, noise atlas or scrolling seam.
    const sa=Math.sin(a)*110/.17,sb=Math.sin(b)*74/-.13,sd=Math.sin(d)*46/.11;
    const ux=(-.36*sa-.83*sb+.77*sd)*(-.045*edge),uy=(.92*sa-.43*sb+.51*sd)*(-.045*edge);
    out.x=ux*field.c-uy*field.s;out.y=ux*field.s+uy*field.c;out.weight=edge;return out;
  }
  function fieldFor(state,field,origin={x:0,y:0}){
    for(const f of regions(state)){
      const x=f.x-origin.x,y=f.y-origin.y,radius=Math.max(f.rx,f.ry)*1.02;
      if(x+radius<field.minX||x-radius>field.minX+field.width||y+radius<field.minY||y-radius>field.minY+field.height)continue;
      return origin.x||origin.y?{...f,x,y}:f;
    }return null;
  }
  function sample(state,ship){
    const e=ship?.entity;if(!e||(ship.system??state.system)!==state.system||ship.hull<=0||e.landed||e.journey||['destroyed','warp','arriving'].includes(e.phase)||root.vexedWarp?.active)return null;
    for(const f of regions(state)){
      if(weight(f,ship.x,ship.y)<1e-6)continue;
      const flow=sampleAt(f,ship.x,ship.y,Number(state.shipSimulation?.seconds)||0),motion=root.nativeShipMotion;
      const area=ship.dimensions.width*ship.dimensions.height,coupling=clamp(area/(motion.shipMass(ship)*900),.12,1.4);
      const angular=clamp(area*(ship.dimensions.width**2+ship.dimensions.height**2)/(motion.shipInertia(ship)*5000),.08,1.5);
      return {...flow,id:f.id,rate:coupling*flow.edge*.9,spinRate:angular*flow.edge*.8,ax:0,ay:0,damageRate:0};
    }return null;
  }
  function combine(a,b){
    if(!a)return b;if(!b)return a;
    const rate=a.rate+b.rate,spinRate=(a.spinRate||0)+(b.spinRate||0);
    return {...a,rate,vx:rate?(a.vx*a.rate+b.vx*b.rate)/rate:0,vy:rate?(a.vy*a.rate+b.vy*b.rate)/rate:0,
      ax:(a.ax||0)+(b.ax||0),ay:(a.ay||0)+(b.ay||0),spinRate,
      spin:spinRate?((a.spin||0)*(a.spinRate||0)+(b.spin||0)*(b.spinRate||0))/spinRate:0};
  }
  root.nativeBadlandsCurrents=Object.freeze({regions,weight,sampleAt,offset,fieldFor,sample,combine,setEnabled:value=>{enabled=!!value;},snapshot:state=>({enabled,regions:regions(state).map(f=>({...f})),seconds:Number(state?.shipSimulation?.seconds)||0})});
})();
