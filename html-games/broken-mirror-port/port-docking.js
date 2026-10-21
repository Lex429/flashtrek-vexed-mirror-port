/* Saved port occupancy. No artwork, job selection, cargo or payment mutations. */
(() => {
  'use strict';
  const BERTHS=4,QUEUE=12,GAP=40;
  const coords={1:[-4100,1100],2:[-2300,-1500],3:[0,0],4:[1400,-250],5:[4800,1800],7:[11800,2700],8:[15300,-2700],9:[19000,3300],10:[23200,-4400]};
  const sizes={1:62,2:105,3:128,4:48,5:85,7:165,8:155,9:112,10:110};
  const owner=ship=>`civilian:${ship.id}`;
  const data=state=>state.portDocking||=( {version:1,sequence:0,ships:{}} );
  const runtimes=new WeakMap(),proxyTargets=new WeakMap(),CELL=512;
  const unwrap=value=>proxyTargets.get(value)||value;
  const box=p=>{const r=Math.abs(p.radius);return {minX:p.x-r,minY:p.y-r,maxX:p.x+r,maxY:p.y+r};};
  const intersects=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
  function remove(rt,id){
    const old=rt.entries.get(id);if(!old)return;
    old.port.queued.delete(id);old.port.taken.delete(id);old.port.queue=null;
    for(const point of old.points){
      old.space.points.delete(point.id);old.space.overflow.delete(point);
      for(const key of point.cells){const bucket=old.space.cells.get(key);bucket?.delete(point);if(!bucket?.size)old.space.cells.delete(key);}
    }
    rt.entries.delete(id);
  }
  function install(rt,id,record){
    remove(rt,id);if(!record||typeof record!=='object')return;
    let space=rt.systems.get(record.system);if(!space)rt.systems.set(record.system,space={ports:new Map(),points:new Map(),cells:new Map(),overflow:new Set()});
    let port=space.ports.get(record.port);if(!port)space.ports.set(record.port,port={queued:new Map(),taken:new Map(),queue:null});
    const entry={record,port,space,points:[]};rt.entries.set(id,entry);
    if(record.kind==='queue')port.queued.set(id,record);
    if(record.kind==='berth')port.taken.set(id,record.slot);else if(record.clearing)port.taken.set(id,record.clearing.slot);
    port.queue=null;
    for(const [suffix,p] of [['',record],[':clearing',record.clearing]])if(p){
      const point={id:id+suffix,owner:record.owner,p,box:box(p),cells:[]};entry.points.push(point);space.points.set(point.id,point);
      const b=point.box,x0=Math.floor(b.minX/CELL),x1=Math.floor(b.maxX/CELL),y0=Math.floor(b.minY/CELL),y1=Math.floor(b.maxY/CELL),count=(x1-x0+1)*(y1-y0+1);
      if(!Number.isFinite(count)||count<0||count>4096){space.overflow.add(point);continue;}
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+':'+y;let bucket=space.cells.get(key);if(!bucket)space.cells.set(key,bucket=new Set());bucket.add(point);point.cells.push(key);}
    }
  }
  function runtime(state){
    const d=data(state);let rt=runtimes.get(state);
    if(rt&&!rt.dirty&&d.ships===rt.published)return rt;
    const stats=rt?.stats||{rebuilds:0,pointQueries:0,pointCandidates:0,hullCandidates:0,hullSamples:0,localEntries:0,initialFallbacks:0};stats.rebuilds++;
    rt||={stats,rows:new WeakMap()};
    Object.assign(rt,{systems:new Map(),entries:new Map(),orders:new Map(),nextOrder:0,dirty:false});runtimes.set(state,rt);
    // Ordinary published assignments/deletions (including clearing fields) are
    // observed. Retained raw aliases or descriptor edits need invalidate().
    // Only the original version-1 dictionary is serialized, never these indexes.
    const raw=unwrap(d.ships&&typeof d.ships==='object'?d.ships:{});rt.raw=raw;
    const observed=()=>state.portDocking?.ships===rt.published;
    const wrap=(value,id,clearing=false)=>{
      if(!value||typeof value!=='object')return value;
      value=unwrap(value);const binding=id+(clearing?':clearing':'');
      let bindings=rt.rows.get(value);if(!bindings)rt.rows.set(value,bindings=new Map());
      if(!clearing&&value.clearing)value.clearing=wrap(value.clearing,id,true);
      const prior=bindings.get(binding);if(prior)return prior;
      const proxy=new Proxy(value,{set(object,key,next){if(!clearing&&key==='clearing')next=wrap(next,id,true);const result=Reflect.set(object,key,next);if(observed())install(rt,id,rt.published[id]);return result;},
        deleteProperty(object,key){const result=Reflect.deleteProperty(object,key);if(observed())install(rt,id,rt.published[id]);return result;}});
      bindings.set(binding,proxy);proxyTargets.set(proxy,value);return proxy;
    };
    rt.published=new Proxy(raw,{set(object,id,value){const result=Reflect.set(object,id,wrap(value,id));if(observed()&&rt.raw===object){if(!rt.orders.has(id))rt.orders.set(id,rt.nextOrder++);install(rt,id,object[id]);}return result;},
      deleteProperty(object,id){if(observed()&&rt.raw===object){remove(rt,id);rt.orders.delete(id);}return Reflect.deleteProperty(object,id);}});
    proxyTargets.set(rt.published,raw);
    d.ships=rt.published;
    for(const id of Object.keys(raw)){rt.orders.set(id,rt.nextOrder++);raw[id]=wrap(raw[id],id);install(rt,id,raw[id]);}
    return rt;
  }
  function local(state,system,port){
    const rt=runtime(state),entry=rt.systems.get(system)?.ports.get(port);
    if(!entry)return {queue:[],taken:new Set()};
    if(!entry.queue)entry.queue=[...entry.queued].sort(([a,x],[b,y])=>(x.ticket-y.ticket)||rt.orders.get(a)-rt.orders.get(b)).map(([,r])=>r);
    rt.stats.localEntries+=entry.queue.length+entry.taken.size;
    return {queue:entry.queue,taken:new Set(entry.taken.values())};
  }
  function reservationPoints(state,system,p,r,except){
    const rt=runtime(state),space=rt.systems.get(system);rt.stats.pointQueries++;if(!space)return [];
    const b={minX:p.x-r-GAP,minY:p.y-r-GAP,maxX:p.x+r+GAP,maxY:p.y+r+GAP},x0=Math.floor(b.minX/CELL),x1=Math.floor(b.maxX/CELL),y0=Math.floor(b.minY/CELL),y1=Math.floor(b.maxY/CELL),found=new Set(space.overflow);
    if((x1-x0+1)*(y1-y0+1)>space.points.size){for(const point of space.points.values())if(intersects(b,point.box))found.add(point);}
    else for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const point of space.cells.get(x+':'+y)||[])found.add(point);
    const result=[];
    for(const point of found)if(point.owner!==except&&(intersects(b,point.box)||![point.p.x,point.p.y,point.p.radius].every(Number.isFinite)))result.push(point.p);
    rt.stats.pointCandidates+=result.length;return result;
  }
  const invalidate=state=>{const rt=runtimes.get(state);if(rt)rt.dirty=true;};
  function center(system,port){
    if(system!==1)return {x:0,y:0};
    const body=window.nativeSystemHub?.sol?.find(b=>b.id===port),p=coords[port]||[0,0];
    return body&&window.vexedSolFlight?.bodyPosition?window.vexedSolFlight.bodyPosition(body):{x:(body?.x??p[0])-220,y:(body?.y??p[1])+75};
  }
  function radius(ship,category='civilian'){
    const d=window.nativeShipDefinitions.dimensions(ship,category);
    return Math.max(20,Math.hypot(d.width,d.height)/2);
  }
  // The nine existing company tugs have dedicated terminals. Their dimensions
  // determine separation; civilian berths/holding spaces exclude these terminals.
  function tugPoint(port,id){
    const c=center(1,port),r=radius({shipType:10},'tug'),ring=Math.floor(id/9);
    const distance=Math.max((sizes[port]||128)/2+220,(r+GAP/2)/Math.sin(Math.PI/9))+ring*(2*r+GAP);
    const angle=-Math.PI/2+(id%9)*Math.PI*2/9;
    return {x:c.x+Math.cos(angle)*distance,y:c.y+Math.sin(angle)*distance};
  }
  let terminalCache=null;
  function physicalPoints(state,system,except,residents,context){
    const points=[],lives=window.nativeNpcLives;
    for(const current of residents){const ship=current.entity||current;if(ship.system===system&&!ship.journey&&ship.phase!=='destroyed'&&(!context.ready||!(ship.hull<=0))&&owner(ship)!==except){
      if(!context.physical.has(ship)){
        const pose=lives?.pose?.(state,ship)||ship;context.stats.hullSamples++;
        context.physical.set(ship,Number.isFinite(pose.x)&&Number.isFinite(pose.y)?{x:pose.x,y:pose.y,radius:radius(ship)}:null);
      }
      const point=context.physical.get(ship);if(point)points.push(point);
    }}
    return points;
  }
  function allocationContext(state,system,except){
    const rt=runtime(state),lives=window.nativeNpcLives;
    // Released/cancelled berths may still have a hull physically nearby. Choose
    // clear space instead of assigning a new arrival onto a disabled ship.
    const ready=!!(lives?.ready?.(state)&&window.nativeShipSystems?.query),members=ready?lives.members(state,system):null;
    // A small indexed membership is cheaper to sample once than repeatedly
    // querying overlapping candidate windows. Larger systems stay spatial.
    const small=ready&&members.length<=256,context={ready,narrow:ready&&!small,physical:new Map(),stats:rt.stats};
    if(!ready)rt.stats.initialFallbacks++;
    // Legacy scripted departures retain a raw anchored hull until their visual
    // controller finishes. The shared physical grid excludes those phases.
    const legacy=ready?(lives.controlled?.(state)||[]).filter(ship=>['warp','arriving'].includes(ship.phase)):[];
    const residents=!ready?state.civilianTraffic?.ships||[]:small?[...members.filter(ship=>!['warp','arriving'].includes(ship.phase)),...legacy]:legacy;
    const points=physicalPoints(state,system,except,residents,context);rt.stats.hullCandidates+=points.length;
    if(system===1){
      const r=radius({shipType:10},'tug');
      if(!terminalCache||terminalCache.radius!==r){
        const terminals=[];for(const port of Object.keys(coords).map(Number))for(let id=0;id<9;id++)terminals.push({...tugPoint(port,id),radius:r});
        terminalCache={radius:r,points:terminals};
      }
      points.push(...terminalCache.points);
    }
    context.points=points;return context;
  }
  function occupied(state,system,except,p,r,context){
    const rt=runtime(state),points=reservationPoints(state,system,p,r,except);
    if(context.narrow){
      // The shared index stores a full half-diagonal, independent of heading.
      // Twenty extra units cover the old minimum radius for very small hulls.
      const padding=r+GAP+20,residents=window.nativeShipSystems.query(state,{system,minX:p.x-padding,minY:p.y-padding,maxX:p.x+padding,maxY:p.y+padding,swept:false,categories:['civilian']}).bystanders;
      const physical=physicalPoints(state,system,except,residents,context);points.push(...physical);rt.stats.hullCandidates+=physical.length;
    }
    points.push(...context.points);return points;
  }
  function position(state,system,port,r,kind,id,relocation=false){
    if(!relocation&&window.nativeSimulationFrame?.take&&!window.nativeSimulationFrame.take(state,'dockAllocations',16))return null;
    const c=center(system,port),spacing=2*r+GAP,context=allocationContext(state,system,id);
    // A finite search, only when an owner needs a new space (never per frame).
    for(let i=0;i<4096;i++){
      const ring=Math.floor(i/12),angle=(i%12)*Math.PI/6;
      const distance=(kind==='berth'?420:800)+r+ring*spacing;
      const p={x:c.x+Math.cos(angle)*distance,y:c.y+Math.sin(angle)*distance,radius:r};
      const clear=occupied(state,system,id,p,r,context).every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=r+q.radius+GAP);
      const outsideBodies=system!==1||Object.keys(coords).every(key=>{const b=center(1,Number(key));return Math.hypot(p.x-b.x,p.y-b.y)>r+(sizes[key]||128)/2+100;});
      if(clear&&outsideBodies)return p;
    }
    return null;
  }
  function release(state,ship){runtime(state);delete data(state).ships[owner(ship)];}
  function request(state,ship,system,port){
    runtime(state);const d=data(state),id=owner(ship);let current=d.ships[id];
    if(current&&(current.system!==system||current.port!==port)){release(state,ship);current=null;}
    if(current?.kind==='berth')return current;
    const {queue,taken}=local(state,system,port);
    const first=queue[0];
    if(taken.size<BERTHS&&(!first||first.owner===id)){
      const p=position(state,system,port,radius(ship),'berth',id);if(!p)return null;
      const slot=Array.from({length:BERTHS},(_,i)=>i).find(i=>!taken.has(i));
      d.ships[id]={...p,owner:id,system,port,kind:'berth',slot,ticket:['queue','overflow'].includes(current?.kind)?current.ticket:++d.sequence};return d.ships[id];
    }
    if(current?.kind==='queue')return current;
    const p=current||position(state,system,port,radius(ship),'holding',id);if(!p)return null;
    const kind=queue.length<QUEUE?'queue':'overflow';
    d.ships[id]={...p,owner:id,system,port,kind,ticket:['queue','overflow'].includes(current?.kind)?current.ticket:++d.sequence};return d.ships[id];
  }
  function park(state,ship,system,port){
    runtime(state);const d=data(state),id=owner(ship),old=d.ships[id];
    if(old?.kind==='parked'&&old.system===system&&old.port===port)return old;
    const p=position(state,system,port,radius(ship),'holding',id);if(!p)return null;
    // Keep the vacated berth exclusive until the ship reaches its holding point.
    const clearing=old?.kind==='berth'?{x:old.x,y:old.y,radius:old.radius,slot:old.slot}:old?.clearing;
    d.ships[id]={...p,owner:id,system,port,kind:'parked',ticket:++d.sequence,...(clearing?{clearing}:{})};return d.ships[id];
  }
  function parked(state,ship){runtime(state);const r=data(state).ships[owner(ship)];if(r)delete r.clearing;}
  function relocate(state,ship,system,port){
    // Policy/save repair must finish before an excluded sector can be shown.
    // Use the same bounded clearance search, independently of normal job budgets.
    runtime(state);const id=owner(ship),p=position(state,system,port,radius(ship),'holding',id,true);if(!p)return null;
    data(state).ships[id]={...p,owner:id,system,port,kind:'parked',ticket:++data(state).sequence};return data(state).ships[id];
  }
  function inspect(state,ship,details=true){
    if(!state.portDocking?.ships?.[owner(ship)])return null;
    runtime(state);const d=state.portDocking,r=d.ships[owner(ship)];
    if(!details)return {...r,clearing:r.clearing&&{...r.clearing}};
    const {queue}=local(state,r.system,r.port);
    return {...r,clearing:r.clearing&&{...r.clearing},queuePosition:r.kind==='queue'?queue.findIndex(q=>q.owner===r.owner)+1:null,queueLength:queue.length,berthLimit:BERTHS,queueLimit:QUEUE};
  }
  function reconcile(state){
    runtime(state);const d=data(state),ships=new Map((state.civilianTraffic?.ships||[]).map(s=>[owner(s),s]));
    for(const [id,r] of Object.entries(d.ships)){
      const ship=ships.get(id);
      if(!ship||ship.journey||['disabled','destroyed'].includes(ship.phase)||ship.system!==r.system||![r.x,r.y,r.radius,r.ticket].every(Number.isFinite))delete d.ships[id];
    }
  }
  window.nativePortDocking={request,release,park,parked,relocate,inspect,reconcile,invalidate,metrics:state=>({...runtime(state).stats}),center,tugPoint,berthLimit:BERTHS,queueLimit:QUEUE};
})();
