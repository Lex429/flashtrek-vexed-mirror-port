/* Frozen policy oracle from d68a0f0476b188cb0d62c9cc23447787224d3022.
 * Source: html-games/broken-mirror-port/port-docking.js; tests only. */
/* Saved port occupancy. No artwork, job selection, cargo or payment mutations. */
(() => {
  'use strict';
  const BERTHS=4,QUEUE=12,GAP=40;
  const coords={1:[-4100,1100],2:[-2300,-1500],3:[0,0],4:[1400,-250],5:[4800,1800],7:[11800,2700],8:[15300,-2700],9:[19000,3300],10:[23200,-4400]};
  const sizes={1:62,2:105,3:128,4:48,5:85,7:165,8:155,9:112,10:110};
  const owner=ship=>`civilian:${ship.id}`;
  const data=state=>state.portDocking||=( {version:1,sequence:0,ships:{}} );
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
  function occupied(state,system,except){
    const entries=Object.values(data(state).ships).filter(r=>r.system===system&&r.owner!==except);
    const points=entries.flatMap(r=>[r,...(r.clearing?[r.clearing]:[])]);
    // Released/cancelled berths may still have a hull physically nearby. Choose
    // clear space instead of assigning a new arrival onto a disabled ship.
    for(const ship of state.civilianTraffic?.ships||[])if(ship.system===system&&!ship.journey&&ship.phase!=='destroyed'&&owner(ship)!==except){
      const p=window.nativeNpcLives?.pose?.(state,ship)||ship;
      if(Number.isFinite(p.x)&&Number.isFinite(p.y))points.push({x:p.x,y:p.y,radius:radius(ship)});
    }
    if(system===1){
      const r=radius({shipType:10},'tug');
      if(!terminalCache||terminalCache.radius!==r){
        const terminals=[];for(const port of Object.keys(coords).map(Number))for(let id=0;id<9;id++)terminals.push({...tugPoint(port,id),radius:r});
        terminalCache={radius:r,points:terminals};
      }
      points.push(...terminalCache.points);
    }
    return points;
  }
  function position(state,system,port,r,kind,id,relocation=false){
    if(!relocation&&window.nativeSimulationFrame?.take&&!window.nativeSimulationFrame.take(state,'dockAllocations',16))return null;
    const c=center(system,port),points=occupied(state,system,id),spacing=2*r+GAP;
    // A finite search, only when an owner needs a new space (never per frame).
    for(let i=0;i<4096;i++){
      const ring=Math.floor(i/12),angle=(i%12)*Math.PI/6;
      const distance=(kind==='berth'?420:800)+r+ring*spacing;
      const p={x:c.x+Math.cos(angle)*distance,y:c.y+Math.sin(angle)*distance,radius:r};
      const clear=points.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=r+q.radius+GAP);
      const outsideBodies=system!==1||Object.keys(coords).every(key=>{const b=center(1,Number(key));return Math.hypot(p.x-b.x,p.y-b.y)>r+(sizes[key]||128)/2+100;});
      if(clear&&outsideBodies)return p;
    }
    return null;
  }
  function release(state,ship){delete data(state).ships[owner(ship)];}
  function request(state,ship,system,port){
    const d=data(state),id=owner(ship);let current=d.ships[id];
    if(current&&(current.system!==system||current.port!==port)){release(state,ship);current=null;}
    if(current?.kind==='berth')return current;
    const local=Object.values(d.ships).filter(r=>r.system===system&&r.port===port),queue=local.filter(r=>r.kind==='queue').sort((a,b)=>a.ticket-b.ticket);
    const taken=new Set(local.flatMap(r=>r.kind==='berth'?[r.slot]:r.clearing?[r.clearing.slot]:[]));
    const first=queue[0];
    if(taken.size<BERTHS&&(!first||first.owner===id)){
      const p=position(state,system,port,radius(ship),'berth',id);if(!p)return null;
      const slot=Array.from({length:BERTHS},(_,i)=>i).find(i=>!taken.has(i));
      return d.ships[id]={...p,owner:id,system,port,kind:'berth',slot,ticket:['queue','overflow'].includes(current?.kind)?current.ticket:++d.sequence};
    }
    if(current?.kind==='queue')return current;
    const p=current||position(state,system,port,radius(ship),'holding',id);if(!p)return null;
    const kind=queue.length<QUEUE?'queue':'overflow';
    return d.ships[id]={...p,owner:id,system,port,kind,ticket:['queue','overflow'].includes(current?.kind)?current.ticket:++d.sequence};
  }
  function park(state,ship,system,port){
    const d=data(state),id=owner(ship),old=d.ships[id];
    if(old?.kind==='parked'&&old.system===system&&old.port===port)return old;
    const p=position(state,system,port,radius(ship),'holding',id);if(!p)return null;
    // Keep the vacated berth exclusive until the ship reaches its holding point.
    const clearing=old?.kind==='berth'?{x:old.x,y:old.y,radius:old.radius,slot:old.slot}:old?.clearing;
    return d.ships[id]={...p,owner:id,system,port,kind:'parked',ticket:++d.sequence,...(clearing?{clearing}:{})};
  }
  function parked(state,ship){const r=data(state).ships[owner(ship)];if(r)delete r.clearing;}
  function relocate(state,ship,system,port){
    // Policy/save repair must finish before an excluded sector can be shown.
    // Use the same bounded clearance search, independently of normal job budgets.
    const id=owner(ship),p=position(state,system,port,radius(ship),'holding',id,true);if(!p)return null;
    return data(state).ships[id]={...p,owner:id,system,port,kind:'parked',ticket:++data(state).sequence};
  }
  function inspect(state,ship,details=true){
    const d=state.portDocking,r=d?.ships?.[owner(ship)];if(!r)return null;
    if(!details)return {...r,clearing:r.clearing&&{...r.clearing}};
    const queue=Object.values(d.ships).filter(q=>q.system===r.system&&q.port===r.port&&q.kind==='queue').sort((a,b)=>a.ticket-b.ticket);
    return {...r,clearing:r.clearing&&{...r.clearing},queuePosition:r.kind==='queue'?queue.findIndex(q=>q.owner===r.owner)+1:null,queueLength:queue.length,berthLimit:BERTHS,queueLimit:QUEUE};
  }
  function reconcile(state){
    const d=data(state),ships=new Map((state.civilianTraffic?.ships||[]).map(s=>[owner(s),s]));
    for(const [id,r] of Object.entries(d.ships)){
      const ship=ships.get(id);
      if(!ship||ship.journey||['disabled','destroyed'].includes(ship.phase)||ship.system!==r.system||![r.x,r.y,r.radius,r.ticket].every(Number.isFinite))delete d.ships[id];
    }
  }
  window.nativePortDocking={request,release,park,parked,relocate,inspect,reconcile,center,tugPoint,berthLimit:BERTHS,queueLimit:QUEUE};
})();
