/* Prometheus intent and ownership. Shared owners integrate movement, shots and damage. */
(()=>{
 'use strict';
 const PARENT=37,LEAD=3702,CATEGORY='prometheus',SEP=3.65,COOLDOWN=8,COUPLE=1.65;
 let bridge=null,button=null,panel=null,lastUi=-Infinity;
 const warming=new WeakMap(),pending=new WeakSet(),leadPoses=new WeakMap();
 const assemblyDefinitions=new WeakMap(),rebuildAssets=new Map(),rebuildPlates=new WeakMap();
 const time=s=>window.nativeSimulation?.seconds?.(s)||Number(s?.shipSimulation?.seconds)||0;
 const parts=()=>window.nativePrometheusDefinitions?.parts||[];
 const group=s=>s?.prometheus?.version===1?s.prometheus:null;
 const controlled=s=>group(s)?.mode!=='joined'?(group(s)?.leadType||LEAD):LEAD;
 const active=s=>Number(s?.shipType)===PARENT&&!!group(s)&&group(s).mode!=='joined';
 const typeFor=e=>active(e)?controlled(e):undefined;
 const living=e=>e&&e.hull>0&&e.phase!=='destroyed';
 const plain=value=>JSON.parse(JSON.stringify(value));
 const hardware=(entity,kind)=>entity.shipEquipment?.instances?.[entity.shipEquipment?.slots?.[kind]?.[0]];
 const point=s=>window.vexedSolFlight?.shipPosition(s)||{x:s.x||0,y:s.y||0};
 const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
 function rotate(local,heading){const a=heading+Math.PI/2,c=Math.cos(a),s=Math.sin(a);return {x:local.x*c-local.y*s,y:local.x*s+local.y*c};}
 function wingSide(part,state){return parts().filter(p=>p.type!==controlled(state)).findIndex(p=>p.type===part.type)===0?-1:1;}
 function localPoint(part,kind,state){
  const d=window.nativeShipDefinitions.get(PARENT).dimensions,lead=parts().find(p=>p.type===controlled(state)),side=wingSide(part,state);
  if(kind==='socket')return {x:(part.offset.x-lead.offset.x)*d.width,y:(part.offset.y-lead.offset.y)*d.height};
  if(kind==='staging'){const relative=part.offset.y-lead.offset.y,rank=parts().filter(p=>p.type!==lead.type&&Math.sign(p.offset.y-lead.offset.y)===Math.sign(relative)).findIndex(p=>p.type===part.type);return {x:0,y:d.height*Math.sign(relative)*(.94+Math.max(0,rank)*.65)};}
  const dock=localPoint(part,'socket',state);
  return {x:dock.x+side*(Math.max(d.width,part.dimensions.width)*1.1+38),y:dock.y+(side<0?-7:7)};
 }
 function worldPoint(state,local){const p=point(state),o=rotate(local,state.angle||0);return {x:p.x+o.x,y:p.y+o.y};}
 const socket=(state,part)=>worldPoint(state,localPoint(part,'socket',state));
 const formation=(state,part)=>worldPoint(state,localPoint(part,'formation',state));
 function pathPoint(part,age,state){
  const start=localPoint(part,'socket',state),end=localPoint(part,'formation',state),side=wingSide(part,state);
  const t=Math.max(0,Math.min(1,(age-(side<0?.3:.55))/2.7)),p=ease(t),q=1-p,rate=30*t*t*(1-t)*(1-t)/2.7;
  const a={x:start.x+side*8,y:start.y+(side<0?-28:34)},b={x:end.x+side*24,y:end.y+(side<0?-35:32)};
  return {x:q*q*q*start.x+3*q*q*p*a.x+3*q*p*p*b.x+p*p*p*end.x,
   y:q*q*q*start.y+3*q*q*p*a.y+3*q*p*p*b.y+p*p*p*end.y,
   vx:3*(q*q*(a.x-start.x)+2*q*p*(b.x-a.x)+p*p*(end.x-b.x))*rate,
   vy:3*(q*q*(a.y-start.y)+2*q*p*(b.y-a.y)+p*p*(end.y-b.y))*rate,
   heading:-Math.PI/2+side*.23*Math.sin(Math.PI*p)};
 }
 function leadPose(state,previous){
  const p=point(state),at=time(state),heading=state.angle||0,elapsed=at-(previous?.at??at);
  const vx=state.vx||0,vy=state.vy||0,omega=state.motionAngularVelocity??(elapsed>1e-8?angle(heading,previous.heading)/elapsed:previous?.omega||0);
  return {x:p.x,y:p.y,heading,vx,vy,at,omega,
   ax:elapsed>1e-8?(vx-previous.vx)/elapsed:0,ay:elapsed>1e-8?(vy-previous.vy)/elapsed:0,alpha:elapsed>1e-8?(omega-(previous.omega||0))/elapsed:0};
 }
 function movingTarget(lead,local){
  const r=rotate(local,lead.heading),v=rotate({x:local.vx||0,y:local.vy||0},lead.heading),omega=lead.omega||0,alpha=lead.alpha||0;
  return {x:lead.x+r.x,y:lead.y+r.y,vx:lead.vx-omega*r.y+v.x,vy:lead.vy+omega*r.x+v.y,
   ax:lead.ax-alpha*r.y-omega*omega*r.x-2*omega*v.y,ay:lead.ay+alpha*r.x-omega*omega*r.y+2*omega*v.x,
   heading:lead.heading+(local.heading??-Math.PI/2)+Math.PI/2,omega};
 }
 function escortPoint(part,entity,frame,clock,dt,state){
  const lead=frame.to,side=wingSide(part,state),base=localPoint(part,'formation',state),speed=Math.hypot(lead.vx,lead.vy);
  let pilot=entity.prometheusPilot;
  if(pilot?.version!==2||pilot.mode!=='escort')pilot=entity.prometheusPilot={version:2,mode:'escort',course:lead.heading,omega:lead.omega||0,speed};
  const course=speed>10?Math.atan2(lead.vy,lead.vx):lead.heading;
  const wanted=lead.heading+Math.max(-.9,Math.min(.9,angle(course,lead.heading)))*Math.min(1,speed/180)*.45,old=pilot.course,oldOmega=pilot.omega;
  pilot.course=angle(pilot.course+angle(wanted,pilot.course)*(1-Math.exp(-dt/(side<0?.24:.4))),0);
  pilot.omega=angle(pilot.course,old)/dt;pilot.speed+=(speed-pilot.speed)*(1-Math.exp(-dt/.4));
  const offset={x:base.x,y:base.y+Math.min(22,speed*.055)},target=movingTarget({...lead,heading:pilot.course,omega:pilot.omega,alpha:(pilot.omega-oldOmega)/dt},offset);
  // Pursuit heading is a choice of intent, never an alteration of momentum.
  const vx=target.vx+(target.x-entity.x)*1.1,vy=target.vy+(target.y-entity.y)*1.1;
  if(Math.hypot(vx,vy)>35)target.heading=pilot.course+Math.max(-.65,Math.min(.65,angle(Math.atan2(vy,vx),pilot.course)))*.6;
  return target;
 }
 function descriptor(state,entity){return {...window.nativeShipDefinitions.describe(state,entity,{category:CATEGORY}),id:entity.id,category:CATEGORY};}
 function sections(state,system=state.system){return active(state)?(group(state).sections||[]).filter(e=>living(e)&&e.system===system):[];}
 function updateMembership(state){window.nativeShipSystems?.invalidateShips(state);window.nativeShipSystems?.refreshShip(state,state,'player');}
 function initialize(state){
  if(Number(state.shipType)!==PARENT){if(state.prometheus)delete state.prometheus;return;}
  const g=group(state);if(!g)return;
  if(!['joined','separating','deployed','recalling'].includes(g.mode)||!Array.isArray(g.sections)){delete state.prometheus;return;}
  for(const e of g.sections){e.system=Number(e.system??state.system);e.previousX=Number.isFinite(e.previousX)?e.previousX:e.x;e.previousY=Number.isFinite(e.previousY)?e.previousY:e.y;
   e.carrier={category:'player',id:'player'};e.missionId='prometheus:'+g.sequence;
   if(!Number.isFinite(e.motionAngularVelocity))e.motionAngularVelocity=g.lastLead?.omega||0;}
  if(active(state)||g.assembly)preload(state).catch(()=>{});
  if(active(state)&&state.hull<=0)takeCommand(state);
 }
 function allowed(state){
  if(!state||Number(state.shipType)!==PARENT)return {ok:false,error:'Multi-vector mode requires a Prometheus-class hull.'};
  if(active(state))return {ok:true};
  if(state.landed||state.shipyardDock||state.pendingTransit||window.vexedWarp?.active)return {ok:false,error:'Enter open flight before separating.'};
  if(state.hull<=window.nativeShipDefinitions.forEntity(state,state).hull*.25)return {ok:false,error:'Repair the hull above 25% before separating.'};
  const g=group(state);
  if(g?.assembly)return {ok:false,error:'Complete DOT reconstruction before separating again.'};
  if(g?.lost&&state.hull<window.nativeShipDefinitions.forEntity(state,state).hull*.95)return {ok:false,error:'Repair the ship to restore its lost sections.'};
  if((g?.cooldownUntil||0)>time(state))return {ok:false,error:'Separation systems are resetting.'};
  if(window.nativeShipRepairs?.playerDronesDeployed?.(state))return {ok:false,error:'Recall repair drones before separating.'};
  return {ok:true};
 }
 function preload(state){
  if(warming.has(state))return warming.get(state);
  const promise=Promise.all(parts().map(p=>window.nativeShipEffects.prepare(p.type,'civilian'))).then(values=>{
   if(values.some(v=>!v?.assets?.[0]))throw Error('Separation systems are not ready yet.');
   if(window.nativeRepairWork?.analyze&&typeof document.createElement==='function')for(const [i,value]of values.entries()){
    const asset=value.assets[0],empty=document.createElement('canvas');empty.width=asset.width;empty.height=asset.height;
    const analyzed=window.nativeRepairWork.analyze(empty,asset.art),cells=window.nativeRepairWork.ordered(analyzed.regions),points=[];
    for(const p of cells)points.push(Math.round(p.y)*analyzed.w+Math.round(p.x),Math.round(Math.atan2(p.ny,p.nx)*1000));
    rebuildAssets.set(parts()[i].type,{asset,empty,cells,layouts:new Map(),sites:{w:analyzed.w,h:analyzed.h,tile:analyzed.tile,points}});
   }
   return true;
  }).catch(error=>{warming.delete(state);throw error;});warming.set(state,promise);return promise;
 }
 function activate(state,{target}={}){
  const check=allowed(state);if(!check.ok)return check;
  if(active(state))return recall(state);
  const clock=time(state),maximum=window.nativeShipDefinitions.forEntity(state,state),hp=state.hull,sp=state.shields||0,p=point(state),old=group(state);
  const g={version:1,mode:'separating',startedAt:clock,sections:[],leadType:LEAD,system:state.system,
   cooldownUntil:0,attackTargetId:target?.rockId==null&&target?.id!=='player'?target?.id:null,
   lastLead:leadPose(state,leadPoses.get(state)),maxHull:maximum.hull,maxShields:maximum.shields,lost:0,sequence:(old?.sequence||0)+1,shots:0};
  for(const part of parts()){
   if(part.type===LEAD)continue;
   const government=window.VexedMirrorWorld.factions?.find(f=>f.id===state.faction)?.governmentId;
   const pos=socket(state,part),velocity=window.nativeShipMotion.frameVelocity({from:g.lastLead,to:g.lastLead},localPoint(part,'socket',state));
   const entity={id:'prometheus:'+part.key,shipType:part.type,prometheusSection:part.key,ownerGovernmentId:state.governmentId??state.government??government,
    name:part.name,carrier:{category:'player',id:'player'},missionId:'prometheus:'+g.sequence,system:state.system,x:pos.x,y:pos.y,previousX:pos.x,previousY:pos.y,heading:state.angle||0,
    vx:velocity.x,vy:velocity.y,speed:Math.hypot(velocity.x,velocity.y),motionAngularVelocity:g.lastLead.omega,prometheusLaunch:{version:1,progress:0},hull:hp*part.weight,shields:sp*part.weight,phase:'flight',shots:0};
   if(state.shipRefit)entity.shipRefit={...plain(state.shipRefit),hullType:part.type};
   if(state.shipThrusters)entity.shipThrusters={...plain(state.shipThrusters),hullType:part.type};
   const mineral=state.mineralUpgrades?.[PARENT];if(mineral)entity.mineralUpgrades={[part.type]:plain(mineral)};
   window.nativeShipEquipment?.ensure(state,entity,[]);
   for(const kind of ['engineering','shield']){
    const source=hardware(state,kind),item=hardware(entity,kind);
    if(source&&item){item.modelId=source.modelId;item.condition=source.condition??100;item.upgrades=plain(source.upgrades||{});}
    else if(item){delete entity.shipEquipment.instances[item.id];entity.shipEquipment.slots[kind][0]=null;}
   }
   window.nativeWeaponLoadout.project(entity);
   g.sections.push(entity);
  }
  const lead=parts().find(p=>p.type===LEAD);state.hull=hp*lead.weight;state.shields=sp*lead.weight;state.prometheus=g;
  window.nativePrometheusEffects?.reset(state);updateMembership(state);bridge?.changed?.();return {ok:true,message:'Multi-vector mode: releasing Alpha and Gamma.'};
 }
 function recall(state){
  const g=group(state);if(!active(state))return {ok:false,error:'The ship is already joined.'};
  if(!living(state)&&!takeCommand(state))return {ok:false,error:'No surviving section remains.'};
  if(g.mode==='recalling')return {ok:true,message:'Sections are returning to their docking locks.'};
  g.mode='recalling';g.startedAt=time(state);g.attackTargetId=null;delete g.dockingAt;
  for(const entity of g.sections)delete entity.prometheusReturn;updateMembership(state);
  if(!sections(state).length)finishJoin(state);
  return {ok:true,message:'Recalling sections. The docking locks will track your flight.'};
 }
 function canTakeCommand(state){return active(state)&&state.hull<=0&&(group(state).sections||[]).some(living);}
 function takeCommand(state){
  if(!canTakeCommand(state))return false;
  const g=group(state),next=g.sections.find(living),old=parts().find(p=>p.type===controlled(state));
  const fallen={id:'prometheus:'+old.key,shipType:old.type,prometheusSection:old.key,system:state.system,x:state.x,y:state.y,heading:state.angle,hull:0,shields:0,phase:'destroyed',vx:state.vx,vy:state.vy,speed:state.speed};
  g.sections=g.sections.filter(e=>e!==next);g.sections.push(fallen);g.leadType=next.shipType;g.lost=g.sections.filter(e=>!living(e)).length;
  for(const name of ['x','y','vx','vy','speed','phase','hull','shields','motionAngularVelocity','motionReverse','motionDrift','motionKick','motionSpin','motionFlow','motionActuation'])state[name]=next[name];
  state.angle=next.heading;state.localCruise=null;state.arrivalApproach=null;
  for(const kind of ['engineering','shield']){const item=hardware(state,kind),source=hardware(next,kind);if(item&&source)item.condition=source.condition??100;}
  g.mode=g.mode==='recalling'?'recalling':'deployed';g.startedAt=time(state);delete g.dockingAt;
  for(const e of g.sections){delete e.prometheusPilot;delete e.prometheusReturn;delete e.actuatedAvoidance;}
  for(const m of state.shipRepairs?.missions||[])if(['carrier','target'].some(k=>m[k]?.category==='player')){delete m.carrierMotion;delete m.targetMotion;}
  g.lastLead=leadPose(state);leadPoses.delete(state);window.nativePrometheusEffects?.reset(state);updateMembership(state);
  const message=old.name.replace('Prometheus ','')+' destroyed. Command transferred to '+next.name.replace('Prometheus ','')+'.';
  bridge?.changed?.();bridge?.notice?.(message);bridge?.save?.();return {ok:true,type:next.shipType,message};
 }
 function finishJoin(state){
  const g=group(state);if(!g)return;
  const hull=state.hull+(g.sections||[]).filter(living).reduce((n,e)=>n+Math.max(0,e.hull||0),0),shields=(state.shields||0)+(g.sections||[]).filter(living).reduce((n,e)=>n+Math.max(0,e.shields||0),0);
  const records=parts().map(part=>{const e=part.type===controlled(state)?state:g.sections.find(e=>e.shipType===part.type);return {type:part.type,hull:living(e)?e.hull:0,shields:living(e)?e.shields||0:0,build:living(e)?1:0,wasMissing:!living(e)};});
  const lost=records.filter(p=>p.wasMissing).length,anchor=controlled(state),lead=parts().find(p=>p.type===anchor),d0=window.nativeShipDefinitions.get(PARENT).dimensions;
  for(const kind of ['engineering','shield']){
   const item=hardware(state,kind);if(!item)continue;
   const surviving=parts().filter(part=>records.find(p=>p.type===part.type).build>0),weight=surviving.reduce((n,p)=>n+p.weight,0);
   item.condition=surviving.reduce((value,part)=>{const entity=part.type===anchor?state:g.sections.find(e=>e.shipType===part.type);return value+part.weight*(hardware(entity,kind)?.condition??100);},0)/weight;
  }
  const offset=rotate({x:lead.offset.x*d0.width,y:lead.offset.y*d0.height},state.angle),spin=state.motionAngularVelocity||0;
  state.x-=offset.x;state.y-=offset.y;state.vx+=spin*offset.y;state.vy-=spin*offset.x;state.speed=Math.hypot(state.vx,state.vy);delete state.motionActuation;
  state.prometheus={version:1,mode:'joined',leadType:anchor,sections:[],joinedAt:time(state),cooldownUntil:time(state)+COOLDOWN,lost,sequence:g.sequence,
   ...(lost?{assembly:{version:1,revision:0,anchor,parts:records,lastHull:hull}}:{})};
  const d=window.nativeShipDefinitions.forEntity(state,state);state.hull=Math.min(d.hull,hull);state.shields=Math.min(d.shields,shields);
  if(state.hull>0&&state.phase==='disabled'&&state.hull>d.hull*.25)state.phase='flight';
  updateMembership(state);bridge?.changed?.();bridge?.notice?.(lost?'Surviving sections secured. DOT reconstruction available.':'Prometheus sections rejoined.');
 }
 function repairProgress(state,before){
  const g=group(state),a=g?.assembly;if(!a||g.mode!=='joined')return;
  const maximum=window.nativeShipDefinitions.get(PARENT).hull,previous=a.parts.reduce((n,p)=>n+p.hull,0),delta=state.hull-previous,need=maximum-previous;
  if(delta>0&&need>0)for(const p of a.parts){const max=window.nativeShipDefinitions.get(p.type).hull;p.hull=Math.min(max,p.hull+delta*(max-p.hull)/need);if(p.wasMissing)p.build=p.hull/max;}
  if(delta<0&&previous>0)for(const p of a.parts){p.hull*=Math.max(0,state.hull)/previous;if(p.wasMissing)p.build=p.hull/window.nativeShipDefinitions.get(p.type).hull;}
  a.lastHull=state.hull;a.revision++;g.lost=a.parts.filter(p=>p.build<1-1e-7).length;
  if(state.hull>=maximum-1e-6){delete g.assembly;g.lost=0;bridge?.notice?.('Prometheus reconstruction complete. All three sections restored.');}
 }
 function definitionFor(state,entity,base){
  const a=entity===state&&Number(entity.shipType)===PARENT?group(state)?.assembly:null;if(!a)return base;
  const cached=assemblyDefinitions.get(entity);if(cached?.assembly===a&&cached.revision===a.revision&&cached.base===base)return cached.value;
  const d=base.dimensions,jets=[];let mass=0,inertia=0,rx=0,ry=0,weight=0;
  for(const record of a.parts){
   if(record.build<=0)continue;
   const part=parts().find(p=>p.type===record.type),definition=window.nativeShipDefinitions.get(part.type),x=part.offset.x*d.width,y=part.offset.y*d.height,factor=record.build;
   mass+=definition.mass*factor;inertia+=(definition.inertia+definition.mass*(x*x+y*y))*factor;weight+=part.weight*factor;
   rx=Math.max(rx,Math.abs(x)+part.dimensions.width*.34);ry=Math.max(ry,Math.abs(y)+part.dimensions.height*.44);
   for(const jet of definition.propulsion.jets)jets.push({...jet,id:part.key+':'+jet.id,x:jet.x+x,y:jet.y+y,force:jet.force*base.propulsion.referenceAcceleration/definition.propulsion.referenceAcceleration*factor});
  }
  const anchor=parts().find(p=>p.type===a.anchor),bay={x:anchor.offset.x,y:anchor.offset.y+anchor.dimensions.height*.28/d.height},mounts=window.nativeShipDefinitions.get(anchor.type).emitters;
  const mount=p=>({x:anchor.offset.x+p.x*anchor.dimensions.width/d.width,y:anchor.offset.y+p.y*anchor.dimensions.height/d.height});
  const emitters=Object.fromEntries(Object.entries(mounts).map(([key,p])=>[key,Array.isArray(p)?p.map(mount):mount(p)]));
  const value={...base,mass,inertia,physical:{mass,inertia},shields:base.shields*weight,ratedShields:(base.ratedShields??base.shields)*weight,
   geometry:{...base.geometry,hull:{rx:Math.max(2,rx),ry:Math.max(2,ry)}},propulsion:{...base.propulsion,mass,inertia,jets},
   emitters,repairBayGeometry:{hatch:bay,outward:{x:1,y:0},clearance:30}};
  value.movement=window.nativeShipMotion.profiles.manual(value);assemblyDefinitions.set(entity,{assembly:a,revision:a.revision,base,value});return value;
 }
 function constructionSites(type,anchorType){
  const ready=rebuildAssets.get(type);if(!ready)return null;if(ready.layouts.has(anchorType))return ready.layouts.get(anchorType);
  const part=parts().find(p=>p.type===type),anchor=parts().find(p=>p.type===anchorType),d=window.nativeShipDefinitions.get(PARENT).dimensions,data=ready.sites;
  const score=p=>{const x=(part.offset.x-anchor.offset.x)*d.width+(p.x/data.w-.5)*part.dimensions.width,y=(part.offset.y-anchor.offset.y)*d.height+(p.y/data.h-.5)*part.dimensions.height;return x*x+y*y;};
  const cells=ready.cells.slice().sort((a,b)=>score(a)-score(b)),points=[];for(const p of cells)points.push(Math.round(p.y)*data.w+Math.round(p.x),Math.round(Math.atan2(p.ny,p.nx)*1000));
  const result={...data,points};ready.layouts.set(anchorType,result);return result;
 }
 function repairContact(descriptor,drone,progress){
  const a=descriptor.entity===descriptor.state?group(descriptor.state)?.assembly:null;if(!a)return null;
  const available=a.parts.filter(p=>p.build>0),record=available[(drone.workSlot||0)%available.length],part=parts().find(p=>p.type===record.type),data=record.wasMissing?constructionSites(part.type,a.anchor):rebuildAssets.get(part.type)?.sites;
  let x=0,y=0,nx=1,ny=0;
  if(data?.points.length){const count=data.points.length/2,index=Math.max(0,Math.min(count-1,Math.floor((record.wasMissing?record.build:progress)*count)-1)),packed=data.points[index*2],angle=data.points[index*2+1]/1000;x=(packed%data.w)/data.w-.5;y=Math.floor(packed/data.w)/data.h-.5;nx=Math.cos(angle);ny=Math.sin(angle);}
  return {x:part.offset.x*descriptor.dimensions.width+x*part.dimensions.width,y:part.offset.y*descriptor.dimensions.height+y*part.dimensions.height,nx,ny};
 }
 function paintAssembly(ctx,state,view,lead){
  const a=group(state).assembly,parent=window.nativeShipDefinitions.get(PARENT).dimensions,pose=window.nativeSimulationFrame?.renderPose?.(state,lead)||lead;
  window.nativePrometheusEffects?.paint(ctx,state,lead,[],view,'under');
  for(const key of ['bottom','middle','top']){
   const part=parts().find(p=>p.key===key),record=a.parts.find(p=>p.type===part.type);if(record.build<=0)continue;
   const offset=rotate({x:part.offset.x*parent.width,y:part.offset.y*parent.height},pose.heading),p={x:pose.x+offset.x,y:pose.y+offset.y},entity={shipType:part.type,system:state.system,...p,heading:pose.heading,hull:record.hull,shields:0,phase:record.hull<window.nativeShipDefinitions.get(part.type).hull*.25?'disabled':'flight'};
   const descriptor=window.nativeShipDefinitions.describe(state,entity,{category:CATEGORY});let asset;
   if(record.wasMissing&&record.build<1){
    const ready=rebuildAssets.get(part.type);if(!ready)continue;if(ready){const bucket=Math.floor(record.build*100),old=rebuildPlates.get(record);
     if(old?.bucket===bucket)asset=old.asset;else{const canvas=old?.canvas||document.createElement('canvas');canvas.width=ready.asset.width;canvas.height=ready.asset.height;window.nativeRepairWork.paintHull(canvas.getContext('2d'),ready.empty,ready.asset.art,constructionSites(part.type,a.anchor),record.build,1);asset={...ready.asset,art:canvas,repairSurface:true};rebuildPlates.set(record,{bucket,canvas,asset});}
    }
   }
   window.nativeShipEffects.paintShip(ctx,descriptor,{...view,asset,dimensions:undefined,appearance:{...view.appearance,...(record.wasMissing&&record.build<1?{lights:false}:{})}});
  }
  window.nativePrometheusEffects?.paint(ctx,state,lead,[],view,'over');
 }
 async function toggle(state,options={}){
  if(pending.has(state))return {ok:false,error:'Separation systems are responding.'};
  if(active(state)){const result=recall(state);bridge?.save?.();return result;}
  const check=allowed(state);if(!check.ok)return check;
  pending.add(state);updateUi(state,true);
  try{await preload(state);const result=activate(state,options);if(result.ok)bridge?.save?.();return result;}
  catch(error){return {ok:false,error:String(error.message||error)};}
  finally{pending.delete(state);updateUi(state,true);}
 }
 function ignoreContact(state,a,b){
  if(!active(state)||!(group(state).mode==='separating'||group(state).mode==='recalling'&&group(state).dockingAt!=null))return false;
  const own=d=>d?.entity===state||!!d?.entity?.prometheusSection;
  return own(a)&&own(b);
 }
 function validTarget(state,target){return target&&target.id!=='player'&&target.category!==CATEGORY&&target.category!=='asteroid'&&target.rockId==null&&target.system===state.system&&living(target.entity||target);}
 function chooseTarget(state,g,lead){
  const selected=bridge?.getTarget?.();
  if(validTarget(state,selected)&&g.attackTargetId!=null)g.attackTargetId=selected.id;
  const current=g.attackTargetId!=null?window.nativeShipSystems.resolve(state,g.attackTargetId,state.system):null;
  if(validTarget(state,current)&&Math.hypot(current.x-lead.x,current.y-lead.y)<1700)return current;
  g.attackTargetId=null;
  const scene=window.nativeShipSystems.query(state,{system:state.system,minX:lead.x-1100,minY:lead.y-1100,maxX:lead.x+1100,maxY:lead.y+1100});
  const enemy=scene.bystanders.filter(t=>validTarget(state,t)&&window.nativeFactionDefence?.hostileToPlayer?.(state,t.entity)).sort((a,b)=>Math.hypot(a.x-lead.x,a.y-lead.y)-Math.hypot(b.x-lead.x,b.y-lead.y))[0];
  if(enemy)g.attackTargetId=enemy.id;return enemy||null;
 }
 function rebase(state,g,lead){
  if(g.system!==state.system){const dx=lead.x-(g.lastLead?.x??lead.x),dy=lead.y-(g.lastLead?.y??lead.y);
   for(const e of g.sections){e.previousX=(e.previousX??e.x)+dx;e.previousY=(e.previousY??e.y)+dy;e.x+=dx;e.y+=dy;e.system=state.system;}
   if(g.lastLead){g.lastLead.x=lead.x;g.lastLead.y=lead.y;}
   g.system=state.system;updateMembership(state);
  }
 }
 function advance(state,dt){
  if(Number(state?.shipType)!==PARENT||!(dt>0)||window.nativeSimulation.blocked())return;
  const g=group(state),clock=time(state),current=leadPose(state,active(state)?g.lastLead:leadPoses.get(state));
  if(g?.assembly&&state.hull!==g.assembly.lastHull)repairProgress(state,g.assembly.lastHull);
  leadPoses.set(state,current);if(!active(state)){if(g?.assembly)window.nativePrometheusEffects?.advance(state,[window.nativeShipDefinitions.describe(state)]);return;}
  rebase(state,g,current);
  const from=g.lastLead?.heading!=null?g.lastLead:{...current,x:current.x-current.vx*dt,y:current.y-current.vy*dt};
  const frame={from,to:current},lead=current;
  if(!(state.hull>0)){if(takeCommand(state))return;for(const e of g.sections)window.nativeShipMotion.stop(e);return;}
  const target=g.mode==='deployed'?chooseTarget(state,g,lead):null;
  let docked=true,staged=true,released=true;
  const ordered=g.sections.slice(),turn=(g.fireTurn||0)%Math.max(1,ordered.length);
  ordered.push(...ordered.splice(0,turn));
  for(const entity of ordered){
   if(!living(entity))continue;
   const part=parts().find(p=>p.type===entity.shipType),actor=descriptor(state,entity);
   let movement={...actor.definition.movement,serviceApproach:true};
   let goal,command;
   if(!target){
    let desired=localPoint(part,g.mode==='recalling'?'staging':'formation',state);
    if(g.mode==='separating'){
     let launch=entity.prometheusLaunch;if(launch?.version!==1)launch=entity.prometheusLaunch={version:1,progress:Math.max(0,Math.min(3.65,clock-g.startedAt))};
     const point=pathPoint(part,launch.progress,state),pose=window.nativeShipMotion.framePose(entity,frame,false);
     const following=clock-g.startedAt>.3&&Math.hypot(pose.x-point.x,pose.y-point.y)<14;
     if(following)launch.progress=Math.min(3.65,launch.progress+dt);
     desired=pathPoint(part,launch.progress,state);if(!following)desired.vx=desired.vy=0;
     if(launch.progress<3.65)released=false;
    }
    if(g.mode==='recalling'){
     const staging=localPoint(part,'staging',state);
     if(g.dockingAt!=null)desired=localPoint(part,'socket',state);
     else {desired=staging;entity.prometheusReturn='staging';}
    }
    const targetPoint=g.mode==='deployed'?escortPoint(part,entity,frame,clock,dt,state):movingTarget(lead,desired);
    command=window.nativeShipMotion.rendezvousCommand(entity,targetPoint,movement,{gain:g.dockingAt!=null?.95:1.7,maxClosing:g.dockingAt!=null?20:160});
    actor.followGoal=targetPoint;
    entity.approachTarget={x:targetPoint.x,y:targetPoint.y,category:'player',id:'player'};
    window.nativeShipSystems.move(state,entity,CATEGORY,command,movement,dt,{actor});
    const relative=window.nativeShipMotion.framePose(entity,frame),relativeSpeed=Math.hypot(relative.vx,relative.vy),aligned=Math.abs(angle(-Math.PI/2,relative.heading));
    if(g.mode==='recalling'){
     const lock=localPoint(part,g.dockingAt==null?'staging':'socket',state),distance=Math.hypot(relative.x-lock.x,relative.y-lock.y);
     const spin=Math.abs((entity.motionAngularVelocity||0)-lead.omega);
     if(distance>1.2||relativeSpeed>3||aligned>.035||spin>.045)staged=false;
     if(g.dockingAt==null||clock-g.dockingAt<COUPLE||distance>.1||relativeSpeed>.5||aligned>.006||spin>.015)docked=false;
    }
   }else{
    if(entity.prometheusPilot)entity.prometheusPilot.mode='combat';
    const ranges=window.nativeCivilianCombatAI.combatRange(state,state),radius=Math.max(110,Math.min(350,ranges.preferred||220)),side=part.key==='top'?-1:1;
    const bearing=Math.atan2(lead.y-target.y,lead.x-target.x)-side*.75;
    goal={x:target.x+Math.cos(bearing)*radius,y:target.y+Math.sin(bearing)*radius};
    goal=window.nativeShipMotion.attachmentGoal(actor,window.nativeShipDefinitions.describe(state,state,{category:'player'}),goal);actor.followGoal=goal;
    entity.approachTarget={...goal,category:'player',id:'player'};
    const distance=Math.hypot(goal.x-entity.x,goal.y-entity.y);
    command=window.nativeShipMotion.rendezvousCommand(entity,{...goal,vx:target.vx||0,vy:target.vy||0,heading:Math.atan2(target.y-entity.y,target.x-entity.x)},movement,{gain:1.4,maxClosing:190});
    window.nativeShipSystems.move(state,entity,CATEGORY,command,{...movement,softSpeedLimit:true},dt,{actor});
   }
   if(target&&g.mode==='deployed'){
    const shooter=descriptor(state,entity),fitted=window.nativeWeaponLoadout.equipped(state,state);
    // Keep the pilot's first fitted bank available for manual fire. Escorts
    // share the remaining owned banks and their actual recharge state.
    const selection=fitted.length>1?fitted.slice(1):fitted;
    const status=window.nativeCombatShots.firingStatus(state,shooter,target,{holder:state,selection});
    if(status.ok&&status.clear!==false){const result=window.nativeCombatShots.fireFor({state,shooter,target,holder:state,selection,owner:CATEGORY});if(result.ok){entity.shots++;g.shots++;g.fireTurn=(g.sections.indexOf(entity)+1)%g.sections.length;}}
   }
  }
  g.lastLead=current;
  window.nativePrometheusEffects?.advance(state,[window.nativeShipDefinitions.describe(state),...sections(state).map(e=>descriptor(state,e))]);
  if(g.mode==='separating'&&clock-g.startedAt>=SEP&&released){g.mode='deployed';g.startedAt=clock;}
  if(g.mode==='recalling'&&g.dockingAt==null&&staged)g.dockingAt=clock;
  if(g.mode==='recalling'&&docked)finishJoin(state);
  updateUi(state);
 }
 function playerCommand(state,command){return command;}
 function hit(state,target,amount,impact){
  const result=window.nativeShipDamage.apply(target,amount,impact);window.nativeShipEffects.hit(state,target,result,impact);
  if(result.destroyed){target.entity.phase='destroyed';window.nativeShipMotion.stop(target.entity);group(state).lost=(group(state).lost||0)+1;updateMembership(state);}
  return result;
 }
 function paintPlayer(ctx,state,descriptor,view){
  const g=group(state),joined=!active(state),flash=joined&&g?.joinedAt!=null&&time(state)-g.joinedAt<1;
  if(joined&&g?.assembly){paintAssembly(ctx,state,view,descriptor);return true;}
  if(joined&&!flash)return false;
  if(joined){window.nativePrometheusEffects?.paint(ctx,state,descriptor,[],view,'under');window.nativeShipEffects.paintShip(ctx,descriptor,view);window.nativePrometheusEffects?.paint(ctx,state,descriptor,[],view,'over');return true;}
  const items=sections(state),paint=d=>window.nativeShipEffects.paintShip(ctx,d,{...view,asset:undefined,x:undefined,y:undefined,dimensions:undefined});
  const escorts=items.map(e=>descriptorFor(state,e));window.nativePrometheusEffects?.paint(ctx,state,descriptor,escorts,view,'under');
  for(const key of ['bottom','middle','top']){const part=parts().find(p=>p.key===key);if(part.type===controlled(state))paint(descriptor);else for(const e of items.filter(e=>e.shipType===part.type))paint(descriptorFor(state,e));}
  window.nativePrometheusEffects?.paint(ctx,state,descriptor,escorts,view,'over');
  return true;
 }
 const descriptorFor=(state,e)=>descriptor(state,e);
 function updateUi(state,force=false){
  if(!button)return;
  const visible=Number(state?.shipType)===PARENT,g=group(state),deployed=active(state);button.hidden=!visible;panel.hidden=!visible||!deployed&&!g?.assembly;if(!visible)return;
  const at=time(state);if(!force&&at-lastUi<.2&&at>=lastUi)return;lastUi=at;
  const check=allowed(state);button.disabled=!!pending.has(state)||!check.ok||!!bridge?.allowed&&!bridge.allowed();
  button.textContent=pending.has(state)?'Separating...':g?.assembly?'Reconstruction required':deployed?g.mode==='recalling'?'Rejoining...':sections(state).length?'Recall sections [V]':'Secure survivor [V]':'Multi-vector [V]';
  button.setAttribute('aria-pressed',String(deployed));button.title=check.error||(deployed?'Secure the surviving sections.':'Separate into three combat sections.');
  if(!deployed&&!g?.assembly)return;
  const entries=parts().map(part=>{const entity=g.assembly?g.assembly.parts.find(p=>p.type===part.type):part.type===controlled(state)?state:g.sections.find(e=>e.shipType===part.type),d=window.nativeShipDefinitions.get(part.type),hp=Math.max(0,Math.min(1,(entity?.hull||0)/Math.max(1,d.hull)));
   return '<div class="mvam-section"><span>'+part.key.toUpperCase()+(deployed&&part.type===controlled(state)?' - YOU':entity?.hull>0?'':' - LOST')+'</span><meter min="0" max="1" value="'+hp+'" aria-label="'+part.name+' hull"></meter></div>';});
  const age=at-g.startedAt,label=g.assembly?'DOT RECONSTRUCTION':g.mode==='recalling'?(g.dockingAt!=null?'MAGNETIC DOCKING':'RENDEZVOUS'):g.mode==='separating'?(age<.42?'CHARGING LOCKS':age<.78?'ALPHA RELEASE':'MULTI-VECTOR DEPLOY'):g.attackTargetId!=null?'MULTI-VECTOR ATTACK':'ESCORT FORMATION';
  panel.innerHTML='<strong>'+label+'</strong>'+entries.join('');
 }
 function attach(api){
  bridge=api;
  const nav=document.querySelector('.game-actions');if(!nav)return;
  button=document.createElement('button');button.type='button';button.id='multiVectorBtn';button.hidden=true;button.textContent='Multi-vector [V]';nav.append(button);
  panel=document.createElement('section');panel.id='multi-vector-status';panel.hidden=true;panel.setAttribute('aria-label','Prometheus sections');document.querySelector('#game').append(panel);
  const run=()=>{const state=bridge.getState();if(!state||bridge.allowed&&!bridge.allowed())return;toggle(state,{target:bridge.getTarget?.()}).then(result=>{bridge.notice?.(result.message||result.error);updateUi(state,true);});};
  button.onclick=run;
  addEventListener('keydown',event=>{if(event.code==='KeyV'&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName||'')){const state=bridge.getState();if(Number(state?.shipType)===PARENT&&(!bridge.allowed||bridge.allowed())){event.preventDefault();run();}}});
 }
 window.nativeShipSystems.register(CATEGORY,{retainedPose:true,
  collect:(state,system)=>sections(state,system).map(e=>descriptor(state,e)),
  resolve:(state,id,system)=>{const e=sections(state,system).find(e=>String(e.id)===String(id));return e?descriptor(state,e):null;},
  hit,visualImpact:(state,target,event)=>window.nativeShipEffects.visualImpact(state,target,event),
  inspect:state=>sections(state).map(e=>({...descriptor(state,e),name:e.name,role:'Prometheus section'}))});
 window.nativePrometheus=Object.freeze({attach,initialize,allowed,active,typeFor,canTakeCommand,takeCommand,definitionFor,repairProgress,repairContact,preload,activate,toggle,recall,advance,playerCommand,ignoreContact,paintPlayer,updateUi,
  descriptors:state=>sections(state).map(e=>descriptor(state,e)),
  isSource:id=>String(id).startsWith('prometheus:'),weaponFired(state,shooter,target){if(active(state)&&shooter.id==='player'&&validTarget(state,target))group(state).attackTargetId=target.id;},
  blockedTravel:state=>active(state)?{ok:false,error:'Recall the Prometheus sections before docking or warping.'}:null,
  snapshot:state=>({active:active(state),mode:group(state)?.mode||'joined',shots:group(state)?.shots||0,sections:sections(state).map(e=>({id:e.id,type:e.shipType,hull:e.hull,shields:e.shields,x:e.x,y:e.y,shots:e.shots}))})});
})();
