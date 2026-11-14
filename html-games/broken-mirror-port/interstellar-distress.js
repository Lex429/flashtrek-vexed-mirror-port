/* Persistent initial casualties, using existing crews and the shared repair owners. */
(() => {
 'use strict';
 const version=1,limit=96;
 const random=seed=>{let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};};
 const rank=n=>{n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;};
 function clear(point){
  if(window.nativeBadlands?.containsGlobal(point.x,point.y,500))return false;
  return window.nativeManualFlight.boundaries().every(b=>Math.hypot((point.x-b.x)/(b.rx+700),(point.y-b.y)/(b.ry+700))>1);
 }
 function plan(s){
  const paths=window.nativeTravelCorridors;if(!paths?.enabled(s))return [];
  paths.restore(s);
  const lanes=paths.lanes().sort((a,b)=>Number(b.id===1002)-Number(a.id===1002)||rank(a.id)-rank(b.id)),points=[];
  for(const lane of lanes){
   const r=random(rank(lane.id)^0x57a1ded),roll=r(),remote=lane.length>60000;
   const count=lane.id===1002?1:roll<(remote?.18:.3)?0:roll<.76?1:roll<.94?2:3;
   if(!count||!lane.sites.length)continue;
   const a=paths.anchor(lane.from),b=paths.anchor(lane.to),dx=(b.x-a.x)/lane.length,dy=(b.y-a.y)/lane.length;
   const site=lane.sites[Math.min(lane.sites.length-1,Math.floor((.15+r()*.7)*lane.sites.length))],side=(r()<.5?-1:1)*(480+r()*380);
   for(let slot=0;slot<count&&points.length<limit;slot++){
    const along=(slot===0?0:slot===1?330:-330)+(r()-.5)*70,across=side+(r()-.5)*140;
    const point={key:lane.id+':'+slot,lane:lane.id,from:lane.from,to:lane.to,system:site.owner,x:site.x+dx*along-dy*across,y:site.y+dy*along+dx*across,heading:Math.atan2(dy,dx)+(r()-.5)*2,reason:['supplies','drones','both'][points.length%3]};
    if(clear(point)&&points.every(p=>Math.hypot(p.x-point.x,p.y-point.y)>220))points.push(point);
   }
   if(points.length===limit)break;
  }
  return points;
 }
 function eligible(s,e){
  if(!['mining','trading','freight'].includes(e.role)||!(e.hull>0)||e.phase==='disabled'||e.phase==='destroyed'||e.regionalResident||e.scriptedDemo||e.interstellarDistress||e.factionAssignment||e.federationAssignment)return false;
  if(e.cargo||e.oreHold>0||e.journey||e.localLeg||e.dockingMove||e.disputeId||e.retaliationId||e.combatInterruption||e.travelResume||e.task?.status==='active'||e.miningReservation!==undefined)return false;
  if(Object.values(s.civilianTraffic.life.reservations||{}).some(r=>r.owner===e.id))return false;
  const d=window.nativeShipDefinitions.forEntity(s,e,{category:'civilian'});
  if(d.capabilities.medical||!d.capabilities.disableRatio)return false;
  const eq=window.nativeShipEquipment.ensure(s,e);
  if(Object.values(eq.instances).some(i=>i.category==='repairDrone'&&i.hull>0&&i.phase!=='stowed'))return false;
  const p=window.nativeNpcLives.galaxyPosition(s,e),viewer=window.nativeManualFlight.position(s);
  return Math.hypot(p.x-viewer.x,p.y-viewer.y)>2500;
 }
 function place(s,e,point){
  const paths=window.nativeTravelCorridors,origin=paths.anchor(point.system),local={x:point.x-origin.x,y:point.y-origin.y};
  const dimensions=window.nativeShipDefinitions.dimensions(e,'civilian'),radius=Math.hypot(dimensions.width,dimensions.height)/2+35;
  const blocked=window.nativeSolAsteroids.nearby(point.system,local,radius).some(rock=>!s.destroyedAsteroids?.includes(rock.slotId)&&Math.hypot(rock.x-local.x,rock.y-local.y)<radius+rock.size);
  if(blocked)return false;
  const repairs=window.nativeShipRepairs,definition=window.nativeShipDefinitions.forEntity(s,e,{category:'civilian'}),eq=window.nativeShipEquipment.ensure(s,e);
  // A drone-less casualty can retain supplies bought from a real berth before
  // its breakdown. This purchase uses owned credits and finite port stock.
  if(point.reason==='drones'&&!(e.repairDeuranium>0)){
   const berth=window.nativePortDocking.request(s,e,e.system,e.port);
   if(berth?.kind==='berth'){
    Object.assign(e,{x:berth.x,y:berth.y});repairs.restock(s,e);
   }
  }
  const reason=point.reason==='drones'&&!(e.repairDeuranium>0)?'both':point.reason;
  // Release only this idle crew's berth through the existing life owner.
  window.nativeNpcLives.interrupt(s,e,'disabled');
  Object.assign(e,{system:point.system,x:local.x,y:local.y,previousX:local.x,previousY:local.y,heading:point.heading,interstellarContact:true});
  window.nativeShipMotion.stop(e);
  const hull=Math.max(1,definition.hull*(.1+(rank(e.id)%9)/100)),descriptor=window.nativeShipDefinitions.describe(s,e,{category:'civilian'});
  window.nativeShipDamage.apply(descriptor,Math.max(0,e.shields)+Math.max(0,e.hull-hull),{source:'environment',nonlethal:true},{hullFloor:hull});
  let dotsLost=0;
  if(reason!=='supplies')for(const d of Object.values(eq.instances))if(d.category==='repairDrone'&&d.hull>0){
   window.nativeShipDamage.apply(window.nativeShipDefinitions.describe(s,d,{category:'repair-drone'}),d.hull+(Number(d.shields)||0),{source:'environment'});
   d.phase='destroyed';delete d.localLeg;dotsLost++;
  }
  const lost=reason!=='drones'?Math.max(0,Number(e.repairDeuranium)||0):0;
  if(lost){repairs.initialize(s).ledger.lost+=lost;e.repairDeuranium=0;}
  e.interstellarDistress={version,site:point.key,reason,createdAt:window.nativeSimulation.seconds(s)};
  const saved=s.shipRepairs.interstellarDistress;saved.suppliesLost+=lost;saved.dotsLost+=dotsLost;
  window.nativeNpcLives.refreshLocation(s,e);repairs.observe(s,e,'civilian');
  saved.ships.push({id:e.id,generation:e.lifeGeneration||0,site:point.key,reason});
  return true;
 }
 function initialize(s,budget=limit){
  if(!s?.shipRepairs||!window.nativeNpcLives?.ready(s)||!window.nativeTravelCorridors?.enabled(s))return null;
  let saved=s.shipRepairs.interstellarDistress;
  if(saved?.version===version&&saved.complete)return saved;
  if(!saved||saved.version!==version)saved=s.shipRepairs.interstellarDistress={version,createdAt:window.nativeSimulation.seconds(s),points:plan(s),ships:[],suppliesLost:0,dotsLost:0,nextAt:0,complete:false};
  const used=new Set(saved.ships.map(e=>e.site)),candidates=s.civilianTraffic.ships.filter(e=>eligible(s,e));
  let added=0;
  for(const point of saved.points){
   if(used.has(point.key)||point.blocked)continue;
   const viewer=window.nativeManualFlight.position(s);if(Math.hypot(point.x-viewer.x,point.y-viewer.y)<2500)continue;
   candidates.sort((a,b)=>{
    const distance=e=>{const p=window.nativeManualFlight.anchor(e.operatingBase??e.system);return Math.hypot(p.x-point.x,p.y-point.y);};
    return Number(point.reason==='drones'&&b.repairDeuranium>0)-Number(point.reason==='drones'&&a.repairDeuranium>0)||distance(a)-distance(b)||a.id-b.id;
   });
   const e=candidates[0];if(!e)break;
   if(place(s,e,point)){candidates.shift();if(++added>=budget)break;}
   else {point.attempts=(point.attempts||0)+1;if(point.attempts>=3)point.blocked=true;}
  }
  saved.complete=saved.points.every(p=>used.has(p.key)||p.blocked||saved.ships.some(e=>e.site===p.key));
  saved.nextAt=window.nativeSimulation.seconds(s)+15;
  return saved;
 }
 function advance(s){
  const saved=s.shipRepairs?.interstellarDistress;
  if(saved?.complete||!saved||window.nativeSimulation.seconds(s)<saved.nextAt)return;
  initialize(s,2);
 }
 window.nativeInterstellarDistress=Object.freeze({version,limit,plan,initialize,advance});
})();
