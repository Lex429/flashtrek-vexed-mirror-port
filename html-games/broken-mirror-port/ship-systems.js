/* Common world-target interface. Controllers register consequences, not physics. */
(() => {
  'use strict';
  const kinds=new Map(),rockGeometry=new WeakMap(),collections=new WeakMap(),persistent=new WeakMap(),cellSize=256,coarseCellSize=4096,routeForecastSeconds=6,routeIndexSeconds=.2;let registryRevision=0;
  const clock=state=>window.nativeSimulation?.seconds?.(state)||(Number(state?.shipSimulation?.seconds)||0);
  const cacheRevisions=new WeakMap();
  function caches(state){
    const result=window.nativeSimulationFrame?.cache?.(state)||window.nativeSimulationFrame?.current(state)?.caches;
    if(result){
      const definitions=window.nativeShipDefinitions?.revision?.()||0,previous=cacheRevisions.get(result);
      if(!previous||previous.registry!==registryRevision||previous.definitions!==definitions){result.clear();cacheRevisions.set(result,{registry:registryRevision,definitions});}
    }
    return result;
  }
  const register=(kind,adapter)=>{if(!adapter?.collect||!adapter?.hit)throw Error('A target adapter needs collect and hit');kinds.set(kind,adapter);registryRevision++;};
  // Observe membership, not ship state. The saved arrays remain ordinary JSON
  // arrays; no runtime index or observer is serialized. Retained raw aliases
  // must use explicit invalidate after same-length edits.
  function observeCollection(owner,field){
    if(!owner||!Array.isArray(owner[field]))return null;
    let fields=collections.get(owner);if(!fields)collections.set(owner,fields=new Map());
    let record=fields.get(field),items=owner[field];
    if(!record||items!==record.items&&items!==record.raw){
      record={raw:items,items:null,revision:(record?.revision||0)+1,length:items.length};
      record.items=new Proxy(items,{set(array,key,value){const changed=array[key]!==value,result=Reflect.set(array,key,value);if(changed){record.revision++;record.length=array.length;}return result;},
        deleteProperty(array,key){const present=key in array,result=Reflect.deleteProperty(array,key);if(present)record.revision++;return result;}});
      fields.set(field,record);owner[field]=record.items;
    }
    if(record.length!==record.raw.length){record.length=record.raw.length;record.revision++;}
    return record;
  }
  const idKey=id=>String(id);
  const living=target=>target&&(!target.entity||!(target.entity.hull<=0)&&!['destroyed','warp','arriving'].includes(target.entity.phase)&&(target.entity.system??target.system)===target.system)&&
    (target.category!=='player'||!target.state?.landed&&!window.vexedWarp?.active&&target.state?.system===target.system);
  function rockTarget(state,rock,system){
    const cached=rockGeometry.get(rock);
    if(cached&&['x','y','size','angle','vx','vy','previousX','previousY'].every(key=>cached[key]===rock[key]))return cached.target;
    const old=cached?.target,dimensions=old?.size===rock.size?old.dimensions:{width:rock.size,height:rock.size};
    const target={...rock,id:'rock:'+rock.slotId,rockId:rock.slotId,category:'asteroid',system,heading:rock.angle||0,
      dimensions,radius:rock.size*.43,entity:rock,targetable:true};
    rockGeometry.set(rock,{target,...Object.fromEntries(['x','y','size','angle','vx','vy','previousX','previousY'].map(key=>[key,rock[key]]))});
    if(!old||old.size!==rock.size)window.nativeSimulationFrame?.count(state,'asteroidGeometryBuilds');
    window.nativeSimulationFrame?.count(state,'asteroidDescriptors');return target;
  }
  const rockGone=(state,id)=>state.minedAsteroids?.includes(id)||state.destroyedAsteroids?.includes(id);
  function asteroidTargets(state,system){
    return (window.nativeSolAsteroids?.forSystem?.(system)||(system===1?window.nativeSolAsteroids?.placements:[])||[])
      .filter(rock=>!rockGone(state,rock.slotId)).map(rock=>rockTarget(state,rock,system));
  }
  function collect(state,system=state.system){
    const targets=[];
    for(const [category,adapter] of kinds)for(const target of adapter.collect(state,system)||[])targets.push({...target,category:target.category||category});
    return targets;
  }
  function collectShips(state,system=state.system){
    const frameCache=caches(state),key='ships:'+system,cached=frameCache?.get(key);if(cached)return cached;
    const record=shipRecord(state,system);
    // Full inspection explicitly asks for all local actors. Bounded queries do
    // not perform this census; their candidates are sampled lazily below.
    for(const entry of Array.from(record.space.entries.values()))touch(state,record,entry);
    frameCache?.set(key,record.ships);return record.ships;
  }
  const poseFields=['x','y','angle','heading','previousX','previousY','vx','vy','speed','hull','shields','phase','journey','system','shipType','dimensions','localLeg','lifeLeg','motionKick','motionSpin','shipEquipment'];
  const geometryFields=['hull','shields','phase','journey','system','shipType','dimensions','localLeg','lifeLeg','motionKick','motionSpin','shipEquipment'].map(key=>poseFields.indexOf(key));
  const mineralFields=['shield','hull','engine','weapons','drive'];
  const hardwareBanks=['engineering','shield'];
  function hardwareValues(entity,definition){
    const eq=entity?.shipEquipment,values=[],levels=entity?.mineralUpgrades?.[entity.shipType];
    for(const kind of ['engineering','shield']){const slots=eq?.slots?.[kind]||[];values.push(slots.length);for(const id of slots)values.push(id,!!eq.instances?.[id]);}
    for(const upgrade of definition?.statUpgrades||[])values.push(eq?eq.instances?.[eq.slots?.engineering?.[0]]?.upgrades?.[upgrade.levelField]:entity[upgrade.levelField]);
    for(const key of mineralFields)values.push(levels?.[key]);return values;
  }
  function sameHardware(entry,entity){
    const values=entry.hardware,eq=entity?.shipEquipment,levels=entity?.mineralUpgrades?.[entity.shipType];if(!values)return false;let index=0;
    for(const kind of hardwareBanks){const slots=eq?.slots?.[kind],length=slots?.length||0;if(values[index++]!==length)return false;for(let slot=0;slot<length;slot++){const id=slots[slot];if(values[index++]!==id||values[index++]!==!!eq.instances?.[id])return false;}}
    const upgrades=entry.target.definition?.statUpgrades;if(upgrades)for(const upgrade of upgrades){const level=eq?eq.instances?.[eq.slots?.engineering?.[0]]?.upgrades?.[upgrade.levelField]:entity[upgrade.levelField];if(values[index++]!==level)return false;}
    for(const key of mineralFields)if(values[index++]!==levels?.[key])return false;
    return index===values.length;
  }
  function reusableRoute(entry,entity){return ['civilian','tug'].includes(entry.target.category)&&!!(entity?.localLeg||entity?.lifeLeg)&&typeof entry.target.definition?.dimensions!=='function'&&entry.definitionRevision===(window.nativeShipDefinitions?.revision?.()||0)&&geometryFields.every(index=>entry.fields[index]===entity[poseFields[index]])&&sameHardware(entry,entity);}
  function rememberPose(entity){return poseFields.map(key=>entity?.[key]);}
  function changed(entry){return poseFields.some((key,index)=>entry.fields[index]!==entry.target.entity?.[key]);}
  function describeActor(state,entity,category,id,supplied,reuse=false){
    const adapter=kinds.get(category);
    let target=reuse?{...supplied,x:entity.x,y:entity.y,heading:entity.heading??entity.angle??0,speed:entity.speed||0,vx:entity.vx||0,vy:entity.vy||0,previousX:entity.previousX??entity.x,previousY:entity.previousY??entity.y,angularVelocity:window.nativeShipMotion?.spinSample?.(entity.motionSpin,clock(state))?.velocity||0}:['player','civilian','tug'].includes(category)?window.nativeShipDefinitions.describe(state,entity,{category}):supplied||(adapter?.resolve?adapter.resolve(state,id,entity?.system??state.system):adapter?.collect(state,entity?.system??state.system)?.find(target=>entity?target.entity===entity:idKey(target.id)===idKey(id)));
    if(!target)return null;
    if(!target.category||target.system===undefined)target={...target,category:target.category||category,system:target.system??entity?.system??state.system};
    const leg=entity?.localLeg||entity?.lifeLeg;
    if(leg&&!entity.journey&&!entity.disputeId&&!entity.retaliationId&&!entity.projectileEvade){
      const at=clock(state),deadline=entity.nextActionAt??entity.lifeEventAt??Infinity,dt=window.nativeSimulationFrame?.fixedStep||1/60;
      const previous={x:entity.x,y:entity.y,heading:entity.heading,speed:entity.speed,motionKick:entity.motionKick,motionSpin:entity.motionSpin};
      const pose={...previous},previousAt=Math.min(at-dt,deadline);
      if(reuse&&supplied.sampledLeg===leg&&Math.abs(supplied.sampledAt-previousAt)<1e-9)Object.assign(previous,{x:supplied.x,y:supplied.y,heading:supplied.heading,speed:supplied.speed});else window.nativeShipMotion.sampleLeg(previous,leg,previousAt);
      window.nativeShipMotion.sampleLeg(pose,leg,Math.min(at,deadline));
      target={...target,x:pose.x,y:pose.y,heading:pose.heading,speed:pose.speed,vx:pose.vx||0,vy:pose.vy||0,previousX:previous.x,previousY:previous.y,
        sampledAt:Math.min(at,deadline),sampledLeg:leg,motionKick:pose.motionKick,motionSpin:pose.motionSpin};
    }
    window.nativeSimulationFrame?.count(state,reuse?'shipPoseDescriptions':'shipDescriptorBuilds');return target;
  }
  function membership(state,system){
    const npc=window.nativeNpcLives,sol=window.nativeSolEconomy,c=observeCollection(state.civilianTraffic,'ships'),t=observeCollection(state.solEconomy,'freighters');
    return [registryRevision,window.nativeShipDefinitions.revision?.()||0,npc?.revision?.(state,system)??c?.revision??0,sol?.revision?.(state)??t?.revision??0,state.system].join('|');
  }
  function shipRecord(state,system){
    let systems=persistent.get(state);if(!systems)persistent.set(state,systems=new Map());
    let record=systems.get(system);if(record?.building)return record;
    const revision=membership(state,system);if(record&&!record.dirty&&record.revision===revision)return record;
    record={state,system,revision,building:true,ships:[],slots:new Map(),space:createSpace(state)};systems.set(system,record);
    for(const [category,adapter] of kinds)if(category!=='asteroid')for(const supplied of adapter.collect(state,system)||[]){
      const target=describeActor(state,supplied.entity,category,supplied.id,supplied)||supplied;if(living(target))insertTarget(record,{...target,category:target.category||category});
    }
    record.building=false;window.nativeSimulationFrame?.count(state,'shipSpatialBuilds');window.nativeSimulationFrame?.count(state,'shipMembershipBuilds');return record;
  }
  function insertTarget(record,target,reuseRoute=false){
    const identity=target.entity||target;let slots=record.slots.get(identity);if(!slots)record.slots.set(identity,slots=new Map());const old=slots.get(target.category);
    if(old===undefined){slots.set(target.category,record.ships.length);record.ships.push(target);}else record.ships[old]=target;
    let entry=record.space.entries.get(idKey(target.id));
    if(reuseRoute&&entry){
      entry.target=target;velocityBand(record.space,entry,indexVelocity(target,entry.routeMotion));
      if(entry.expiryAt!==undefined&&entry.expiryAt<=clock(record.state)+1e-9)updateSpatial(record.space,target,entry.routeMotion,clock(record.state));
    }else{
      const motion=routeMotion(target);updateSpatial(record.space,target,motion,clock(record.state));entry=record.space.entries.get(idKey(target.id));entry.hardware=hardwareValues(target.entity,target.definition);entry.routeMotion=motion;
    }
    entry.fields=rememberPose(target.entity);entry.at=Number(target.state?.shipSimulation?.seconds)||0;entry.definitionRevision=window.nativeShipDefinitions?.revision?.()||0;
  }
  function removeTarget(record,entry){
    removeExpiry(record.space,entry);
    const target=entry.target,identity=target.entity||target,index=record.slots.get(identity)?.get(target.category);if(index!==undefined){record.ships.splice(index,1);const slots=record.slots.get(identity);slots.delete(target.category);if(!slots.size)record.slots.delete(identity);for(let i=index;i<record.ships.length;i++)record.slots.get(record.ships[i].entity||record.ships[i]).set(record.ships[i].category,i);}
    velocityBand(record.space,entry,0);
    const id=idKey(target.id);removeMembership(record.space,entry,id);removeMembership(record.space,entry,id,true);record.space.entries.delete(id);
  }
  function touch(state,record,entry,reusableHint,changedHint){
    window.nativeSimulationFrame?.count(state,'shipPoseChecks');
    const entity=entry.target.entity,at=clock(state),scheduled=entity?.localLeg||entity?.lifeLeg;
    const reusable=reusableHint===undefined?reusableRoute(entry,entity):reusableHint,poseChanged=changedHint===undefined?changed(entry):changedHint;
    if(!poseChanged&&(!scheduled||entry.at===at)&&(!scheduled||reusable))return entry.target;
    const target=describeActor(state,entity,entry.target.category,entry.target.id,reusable?entry.target:undefined,reusable);
    if(!reusable&&entry.target.category==='civilian')window.nativeNpcLives?.observeMotion?.(state,entity);
    if(!living(target)||target.system!==record.system){removeTarget(record,entry);clearCaches(state,record.system);return null;}
    const previous=entry.target;insertTarget(record,target,reusable);window.nativeSimulationFrame?.trackPose?.(state,entity,previous,target);
    const scene=caches(state)?.get('targets:'+record.system);if(scene){const index=scene.scene.targets.indexOf(previous);if(index>=0)scene.scene.targets[index]=target;scene.byId.set(idKey(target.id),target);}return target;
  }
  function scene(state,{system=state.system}={}){
    const frameCache=caches(state),cacheKey='targets:'+system,cached=frameCache?.get(cacheKey);
    if(cached)return cached.scene;
    const ships=collectShips(state,system),rocks=asteroidTargets(state,system),targets=[...ships,...rocks];
    const bodies=bodyTargets(state,system);
    const result={state,targets,bystanders:ships,rocks,destructibles:[],bodies,
      querySwept:(from,to,padding=0,{instant=false,horizon=0}={})=>query(state,{system,
        minX:Math.min(from.x,to.x)-padding,minY:Math.min(from.y,to.y)-padding,maxX:Math.max(from.x,to.x)+padding,maxY:Math.max(from.y,to.y)+padding,swept:!instant,predictSeconds:horizon})};
    frameCache?.set(cacheKey,{scene:result,byId:new Map(targets.map(target=>[idKey(target.id),target])),space:null});
    window.nativeSimulationFrame?.count(state,'sceneCollections');
    return result;
  }
  function clearCaches(state,system){
    const frameCache=caches(state);if(!frameCache)return;
    if(system===undefined)frameCache.clear();else{frameCache.delete('targets:'+system);frameCache.delete('ships:'+system);frameCache.delete('shipSlots:'+system);frameCache.delete('spatial:'+system);}
  }
  function invalidate(state,system){
    window.nativeSolAsteroids?.invalidateIndex?.(system);
    window.nativeNpcLives?.invalidateMembership?.(state);window.nativeSolEconomy?.invalidateMembership?.(state);invalidateShips(state,system);
  }
  function invalidateShips(state,system){const records=persistent.get(state);if(system===undefined){for(const record of records?.values()||[])record.dirty=true;}else{const record=records?.get(system);if(record)record.dirty=true;}window.nativeShipRepairs?.invalidateMembership?.(state);clearCaches(state,system);}
  function acknowledge(state,record){if(!record.dirty&&!record.building&&(!window.nativeNpcLives?.ready||window.nativeNpcLives.ready(state)))record.revision=membership(state,record.system);}
  // A scene is a live registry view for this integration step. Replace only the
  // changed descriptor; previously returned descriptor snapshots stay immutable.
  function refreshShip(state,entity,category,system=category==='tug'?1:entity.system??state.system,prepared){
    if(category==='civilian')window.nativeNpcLives?.observeMotion?.(state,entity);
    if(category==='tug')window.nativeSolEconomy?.observeMotion?.(state,entity);
    window.nativeShipRepairs?.observe?.(state,entity,category);
    const records=persistent.get(state);if(!records)return;
    for(const [otherSystem,record] of records)if(otherSystem!==system&&!record.building){const index=record.slots.get(entity)?.get(category);if(index!==undefined){removeTarget(record,record.space.entries.get(idKey(record.ships[index].id)));acknowledge(state,record);clearCaches(state,otherSystem);}}
    const record=records.get(system);if(!record||record.building)return;
    const index=record.slots.get(entity)?.get(category),previous=index===undefined?null:record.ships[index],oldEntry=previous&&record.space.entries.get(idKey(previous.id));
    // An explicit notification may change nested equipment/upgrades without
    // changing any pose field. Only pure query touch() may reuse that signature.
    let target=prepared||describeActor(state,entity,category,previous?.id??entity.id);
    if(target&&target===previous)return previous;
    if(!target&&!previous&&!['player','civilian','tug'].includes(category))target=kinds.get(category)?.collect(state,system)?.find(t=>t.entity===entity);
    if(!living(target)||target.system!==system){if(oldEntry){removeTarget(record,oldEntry);acknowledge(state,record);clearCaches(state,system);}return null;}
    insertTarget(record,target);window.nativeSimulationFrame?.trackPose?.(state,entity,previous||target,target);
    acknowledge(state,record);
    const frameCache=caches(state),scene=frameCache?.get('targets:'+system);
    if(scene&&previous){const sceneIndex=scene.scene.targets.indexOf(previous);if(sceneIndex>=0)scene.scene.targets[sceneIndex]=target;scene.byId.set(idKey(target.id),target);}else if(!previous)clearCaches(state,system);
    return target;
  }
  // Route owners call this only after sampling an unchanged committed leg.
  // Its conservative route envelope remains indexed until simulation-time
  // expiry; unobserved poses reuse equipment/geometry until a query or expiry.
  function sampledShip(state,entity,category,system=category==='tug'?1:entity.system??state.system,before){
    const record=persistent.get(state)?.get(system);if(!record||record.building)return;
    const index=record.slots.get(entity)?.get(category),entry=index===undefined?null:record.space.entries.get(idKey(record.ships[index].id)),leg=entity.localLeg||entity.lifeLeg;
    if(!entry||record.dirty||!leg||!reusableRoute(entry,entity))return refreshShip(state,entity,category,system);
    const target=entry.target,at=clock(state),heading=entity.heading??entity.angle??0;
    velocityBand(record.space,entry,indexVelocity(entry.target,entry.routeMotion,entity));
    window.nativeSimulationFrame?.count(state,'shipPoseNotifications');
    if(entry.at===at&&target.x===entity.x&&target.y===entity.y&&target.heading===heading&&target.speed===entity.speed&&target.vx===(entity.vx||0)&&target.vy===(entity.vy||0)){
      entry.fields=rememberPose(entity);window.nativeSimulationFrame?.count(state,'shipPoseAcknowledgements');return target;
    }
    const frameCache=caches(state);if(frameCache?.has('targets:'+system)||frameCache?.has('ships:'+system))return refreshShip(state,entity,category,system);
    entry.fields=rememberPose(entity);entry.at=-Infinity;
    const current={x:entity.x,y:entity.y,heading,system,shipType:entity.shipType,speed:entity.speed,vx:entity.vx,vy:entity.vy};
    window.nativeSimulationFrame?.trackPose?.(state,entity,before||target,current);window.nativeSimulationFrame?.count(state,'shipPoseDeferrals');return target;
  }
  function refreshAsteroid(state,rock){
    const frameCache=caches(state),system=rock.system??1,record=frameCache?.get('targets:'+system);
    // Query-only consumers read the existing asteroid index and authoritative
    // pose lazily. Offscreen motion needs no display/collision descriptor until
    // a full scene already retains one or a bounded query actually finds it.
    if(!record)return;
    if(rockGone(state,rock.slotId)){frameCache.delete('targets:'+system);return null;}
    const target=rockTarget(state,rock,system);
    const previous=record.byId.get(idKey(target.id));
    if(previous){record.scene.rocks[record.scene.rocks.indexOf(previous)]=target;record.scene.targets[record.scene.targets.indexOf(previous)]=target;record.byId.set(idKey(target.id),target);}
    else frameCache.delete('targets:'+system);
    return target;
  }
  function extent(target){return Math.max(1,target.radius||15,target.category==='asteroid'?0:Math.hypot(target.dimensions?.width||0,target.dimensions?.height||0)*.5,target.radii?.rx||0,target.radii?.ry||0,target.hullRadii?.rx||0,target.hullRadii?.ry||0);}
  function bounds(target,swept=true,predictSeconds=0){
    const radius=extent(target),x0=swept?(target.previousX??target.x):target.x,y0=swept?(target.previousY??target.y):target.y;
    const x1=target.x+(target.vx||0)*predictSeconds,y1=target.y+(target.vy||0)*predictSeconds;
    return {minX:Math.min(x0,target.x,x1)-radius,minY:Math.min(y0,target.y,y1)-radius,maxX:Math.max(x0,target.x,x1)+radius,maxY:Math.max(y0,target.y,y1)+radius};
  }
  const intersects=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
  function createSpace(state){return {state,grid:new Map(),coarseGrid:new Map(),entries:new Map(),overflow:new Set(),coarseOverflow:new Set(),fineMemberships:0,coarseMemberships:0,entrySequence:0,bucketSequence:0,maxVelocity:0};}
  function cells(box,size=cellSize){const minX=Math.floor(box.minX/size),maxX=Math.floor(box.maxX/size),minY=Math.floor(box.minY/size),maxY=Math.floor(box.maxY/size);return {minX,maxX,minY,maxY,count:(maxX-minX+1)*(maxY-minY+1)};}
  const sameRange=(a,b)=>a&&a.minX===b.minX&&a.maxX===b.maxX&&a.minY===b.minY&&a.maxY===b.maxY;
  function removeMembership(space,entry,id,coarse=false){
    const grid=coarse?space.coarseGrid:space.grid,overflow=coarse?space.coarseOverflow:space.overflow,field=coarse?'coarseCells':'cells',count=coarse?'coarseMemberships':'fineMemberships',previous=entry[field]||[];
    for(const key of previous){const bucket=grid.get(key);bucket?.delete(id);if(!bucket?.size)grid.delete(key);}overflow.delete(id);space[count]-=previous.length;entry[field]=[];
    if(space.state){const prefix=coarse?'spatialShipCoarseGrid':'spatialShipGrid';window.nativeSimulationFrame?.count(space.state,prefix+'EntryWrites');window.nativeSimulationFrame?.count(space.state,prefix+'CellWrites',previous.length);}
  }
  function updateMembership(space,entry,id,range,coarse=false){
    const rangeField=coarse?'coarseRange':'range';if(sameRange(entry[rangeField],range))return;
    removeMembership(space,entry,id,coarse);
    const grid=coarse?space.coarseGrid:space.grid,overflow=coarse?space.coarseOverflow:space.overflow,field=coarse?'coarseCells':'cells',count=coarse?'coarseMemberships':'fineMemberships';entry[rangeField]=range;
    if(!coarse)entry.gridOrder=space.bucketSequence++;
    if(range.count>4096)overflow.add(id);
    else for(let x=range.minX;x<=range.maxX;x++)for(let y=range.minY;y<=range.maxY;y++){
      const key=x+':'+y;let bucket=grid.get(key);if(!bucket)grid.set(key,bucket=new Set());bucket.add(id);entry[field].push(key);
    }
    space[count]+=entry[field].length;
    if(space.state)window.nativeSimulationFrame?.count(space.state,(coarse?'spatialShipCoarseGrid':'spatialShipGrid')+'CellWrites',entry[field].length);
  }
  function swapExpiry(heap,a,b){const previous=heap[a];heap[a]=heap[b];heap[b]=previous;heap[a].expiryIndex=a;heap[b].expiryIndex=b;}
  function fixExpiry(space,index){
    const heap=space.expiries;
    while(index>0){const parent=(index-1)>>1;if(heap[parent].expiryAt<=heap[index].expiryAt)break;swapExpiry(heap,parent,index);index=parent;}
    for(;;){let child=index*2+1;if(child>=heap.length)break;if(child+1<heap.length&&heap[child+1].expiryAt<heap[child].expiryAt)child++;if(heap[index].expiryAt<=heap[child].expiryAt)break;swapExpiry(heap,index,child);index=child;}
  }
  function removeExpiry(space,entry){
    if(entry?.expiryIndex===undefined)return;
    const heap=space.expiries,index=entry.expiryIndex,last=heap.pop();delete entry.expiryIndex;delete entry.expiryAt;
    if(index<heap.length){heap[index]=last;last.expiryIndex=index;fixExpiry(space,index);}
  }
  function scheduleExpiry(space,entry,at){
    const heap=space.expiries||=[];entry.expiryAt=at;
    if(entry.expiryIndex===undefined){entry.expiryIndex=heap.length;heap.push(entry);}fixExpiry(space,entry.expiryIndex);
  }
  function boundedRoute(target,motion){
    const entity=target.entity;
    return motion&&['civilian','tug'].includes(target.category)&&typeof target.definition?.dimensions!=='function'&&motion.leg===target.sampledLeg&&Number.isFinite(target.sampledAt)&&
      !entity.motionKick&&!entity.motionSpin&&!entity.journey&&!entity.disputeId&&!entity.retaliationId&&!entity.projectileEvade;
  }
  function routeBounds(target,motion){
    const box=bounds(target),padding=motion.padding+motion.speed*(routeIndexSeconds+(window.nativeSimulationFrame?.fixedStep||1/60))+1e-6;
    return {minX:box.minX-padding,minY:box.minY-padding,maxX:box.maxX+padding,maxY:box.maxY+padding};
  }
  function indexVelocity(target,motion,entity=target.entity){
    return Math.max(Math.abs(target.vx||0),Math.abs(target.vy||0),Math.abs(entity?.vx||0),Math.abs(entity?.vy||0),motion?.speed||0);
  }
  function updateSpatial(space,target,motion,at=0){
    const id=idKey(target.id),old=space.entries.get(id);
    const bounded=boundedRoute(target,motion),box=bounded?routeBounds(target,motion):indexBounds(target),range=cells(box),coarseRange=cells(box,coarseCellSize);
    const band=velocityBand(space,old,indexVelocity(target,motion));
    const entry=old||{cells:[],coarseCells:[],order:space.entrySequence++};entry.target=target;entry.box=box;entry.velocityBand=band;
    if(bounded){scheduleExpiry(space,entry,at+routeIndexSeconds);space.envelopeClock=Math.max(space.envelopeClock??at,at);}else removeExpiry(space,entry);
    if(space.state)window.nativeSimulationFrame?.count(space.state,'spatialShipGridBoundsUpdates');
    space.entries.set(id,entry);updateMembership(space,entry,id,range);updateMembership(space,entry,id,coarseRange,true);
  }
  function refreshExpired(state,record){
    const space=record.space,at=clock(state);
    if(at<Math.max(space.indexClock??at,space.envelopeClock??at)-1e-9){
      space.envelopeClock=at;
      for(const entry of space.entries.values())if(entry.expiryAt!==undefined)scheduleExpiry(space,entry,at);
    }
    space.indexClock=at;
    while(space.expiries?.length&&space.expiries[0].expiryAt<=at+1e-9){
      const entry=space.expiries[0];removeExpiry(space,entry);
      const target=touch(state,record,entry);
      if(target){const current=space.entries.get(idKey(target.id));updateSpatial(space,target,current.routeMotion,at);window.nativeSimulationFrame?.count(state,'spatialShipHorizonRefreshes');}
    }
  }
  function velocityBand(space,entry,velocity){
    const band=velocity>0?2**Math.ceil(Math.log2(velocity)):0,old=entry?.velocityBand||0;if(old===band)return band;
    const counts=space.velocities||=new Map();if(old){const count=(counts.get(old)||0)-1;if(count>0)counts.set(old,count);else counts.delete(old);}
    if(band)counts.set(band,(counts.get(band)||0)+1);if(entry)entry.velocityBand=band;
    if(band>space.maxVelocity)space.maxVelocity=band;else if(old===space.maxVelocity&&!counts.has(old)){space.maxVelocity=0;for(const value of counts.keys())space.maxVelocity=Math.max(space.maxVelocity,value);}return band;
  }
  function indexBounds(target){
    const box=bounds(target),entity=target.entity,leg=entity?.localLeg||entity?.lifeLeg;if(!leg||entity.journey)return box;
    const radius=extent(target),include=part=>{for(const point of [part.start,part.goal])if(point){box.minX=Math.min(box.minX,point.x-radius);box.minY=Math.min(box.minY,point.y-radius);box.maxX=Math.max(box.maxX,point.x+radius);box.maxY=Math.max(box.maxY,point.y+radius);}for(const child of part.segments||[])include(child);};include(leg);
    const kick=entity.motionKick;if(kick){const duration=Math.max(0,kick.duration||3),dx=Math.abs(kick.x||0)+Math.abs(kick.vx||0)*duration,dy=Math.abs(kick.y||0)+Math.abs(kick.vy||0)*duration;box.minX-=dx;box.maxX+=dx;box.minY-=dy;box.maxY+=dy;}return box;
  }
  const routeNumbers=['startedAt','duration','distance','heading','headingStart','turnSeconds','initialSpeed','peakSpeed','acceleration','braking','accelSeconds','cruiseSeconds','brakeSeconds','accelDistance'];
  const pointDistance=(a,b)=>a&&b&&Number.isFinite(a.x)&&Number.isFinite(a.y)&&Number.isFinite(b.x)&&Number.isFinite(b.y)?Math.hypot(a.x-b.x,a.y-b.y):Infinity;
  const closeRoute=(a,b)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
  // Validate shared route speed/padding before using a finite grid envelope or
  // rejecting a temporally distant candidate. Unsupported commands retain
  // complete-route bounds and normal authoritative sampling.
  function routeMotion(target){
    const leg=target.entity?.localLeg||target.entity?.lifeLeg;if(!leg)return null;
    function inspect(part){
      if(!part||part.valid===false||!Number.isFinite(pointDistance(part.start,part.goal))||!Number.isFinite(part.startedAt)||!Number.isFinite(part.duration)||part.duration<0)return null;
      if(part.version===3){
        if(!part.segments?.length)return null;let speed=0,padding=0,cursor=part.startedAt,previous=part.start;
        for(const child of part.segments){const value=inspect(child),gap=pointDistance(previous,child?.start);if(!value||!closeRoute(cursor,child.startedAt)||!Number.isFinite(gap))return null;speed=Math.max(speed,value.speed);padding+=value.padding+gap+value.speed*Math.abs(cursor-child.startedAt);cursor=child.startedAt+child.duration;previous=child.goal;}
        if(!closeRoute(cursor,part.startedAt+part.duration))return null;padding+=pointDistance(previous,part.goal);return Number.isFinite(padding)?{speed,padding}:null;
      }
      if(part.version!==2||!routeNumbers.every(key=>Number.isFinite(part[key]))||['initialSpeed','peakSpeed','acceleration','braking','accelSeconds','cruiseSeconds','brakeSeconds','accelDistance'].some(key=>part[key]<0))return null;
      const distance=pointDistance(part.start,part.goal);if(distance<=1e-6)return {speed:0,padding:distance};if(!(part.distance>0))return null;
      const endSpeed=part.initialSpeed+part.acceleration*part.accelSeconds,accelDistance=(part.initialSpeed+endSpeed)*part.accelSeconds/2,
        totalDistance=part.accelDistance+part.peakSpeed*part.cruiseSeconds+(part.peakSpeed+Math.max(0,part.peakSpeed-part.braking*part.brakeSeconds))*part.brakeSeconds/2,
        travelSeconds=part.accelSeconds+part.cruiseSeconds+part.brakeSeconds;
      if(!closeRoute(endSpeed,part.peakSpeed)||!closeRoute(accelDistance,part.accelDistance)||!closeRoute(totalDistance,part.distance)||part.duration<travelSeconds||part.travelSeconds!==undefined&&(!Number.isFinite(part.travelSeconds)||!closeRoute(part.travelSeconds,travelSeconds)))return null;
      const scale=distance/part.distance,speed=Math.max(part.initialSpeed,endSpeed,part.peakSpeed)*Math.max(1,scale),padding=(Math.abs(accelDistance-part.accelDistance)+Math.abs(totalDistance-part.distance))*scale+speed*Math.abs((part.travelSeconds??travelSeconds)-travelSeconds);
      return Number.isFinite(speed+padding)?{speed,padding}:null;
    }
    const result=inspect(leg);return result?{...result,leg,radius:extent(target)}:null;
  }
  function temporallyDistant(state,entry,box,swept,predictSeconds,reusable,poseChanged){
    const target=entry.target,entity=target.entity,motion=entry.routeMotion;
    if(!reusable||poseChanged||!motion||motion.leg!==target.sampledLeg||entity.motionKick||entity.motionSpin||entity.journey||entity.disputeId||entity.retaliationId||entity.projectileEvade||!Number.isFinite(target.sampledAt))return false;
    const at=clock(state),deadline=entity.nextActionAt??entity.lifeEventAt??Infinity,currentAt=Math.min(at,deadline),previousAt=Math.min(at-(window.nativeSimulationFrame?.fixedStep||1/60),deadline),
      elapsed=Math.max(Math.abs(currentAt-target.sampledAt),swept?Math.abs(previousAt-target.sampledAt):0),radius=motion.radius+motion.padding+motion.speed*(elapsed+predictSeconds)+1e-6;
    if(!Number.isFinite(radius))return false;window.nativeSimulationFrame?.count(state,'spatialShipTemporalChecks');
    const outside=target.x+radius<box.minX||target.y+radius<box.minY||target.x-radius>box.maxX||target.y-radius>box.maxY;
    if(outside)window.nativeSimulationFrame?.count(state,'spatialShipTemporalRejects');return outside;
  }
  function spatial(record){
    if(!record.space){record.space=createSpace(record.state||record.scene.state);for(const target of record.scene.bystanders)updateSpatial(record.space,target);}
    return record.space;
  }
  function gridCost(grid,range,memberships,overflow){
    let cost=range.count+overflow.size;
    if(range.count<=16){for(let x=range.minX;x<=range.maxX;x++)for(let y=range.minY;y<=range.maxY;y++)cost+=grid.get(x+':'+y)?.size||0;}
    else cost+=range.count*memberships/Math.max(1,grid.size);
    return cost;
  }
  function unobservedFineChange(space,entry,range){
    // A retained raw alias can move within its previous fine bucket before an
    // explicit notification. Preserve the old fine lookup's lazy observation;
    // a stale box cannot prove that such a candidate is still outside the ray.
    return (space.overflow.has(idKey(entry.target.id))||intersects(range,entry.range))&&
      (!['player','civilian','tug'].includes(entry.target.category)||typeof entry.target.definition?.dimensions==='function'||changed(entry));
  }
  function query(state,{system=state.system,minX,minY,maxX,maxY,swept=true,predictSeconds=0,categories}={}){
    const record=shipRecord(state,system),space=record.space;
    const box={minX,minY,maxX,maxY};
    if(![minX,minY,maxX,maxY].every(Number.isFinite))return scene(state,{system});
    refreshExpired(state,record);
    predictSeconds=Number.isFinite(Number(predictSeconds))?Math.max(0,Number(predictSeconds)):0;
    const reach=space.maxVelocity*predictSeconds,searchBox={minX:minX-reach,minY:minY-reach,maxX:maxX+reach,maxY:maxY+reach},range=cells(searchBox),coarseRange=cells(searchBox,coarseCellSize),ids=new Set();
    const legacyDirect=predictSeconds>routeForecastSeconds||range.count>space.entries.size*2;
    const fineCost=gridCost(space.grid,range,space.fineMemberships,space.overflow),coarseCost=gridCost(space.coarseGrid,coarseRange,space.coarseMemberships,space.coarseOverflow);
    window.nativeSimulationFrame?.count(state,'spatialShipCostProbeCells',(range.count<=16?range.count:0)+(coarseRange.count<=16?coarseRange.count:0));
    const path=predictSeconds>routeForecastSeconds||space.entries.size<=Math.min(fineCost,coarseCost)?'direct':coarseCost<fineCost?'coarse':'fine';
    // Both grids reference these same canonical entries. Occupancy estimates
    // bound empty-cell work; exact conservative boxes reject bucket neighbors
    // before pose/equipment checks. Long forecasts retain their full fallback.
    if(path==='direct'){
      for(const [id,entry] of space.entries){
        let candidate=entry.box;
        if(predictSeconds>routeForecastSeconds&&entry.routeMotion){const full=indexBounds(entry.target),padding=entry.routeMotion.speed*predictSeconds;candidate={minX:full.minX-padding,minY:full.minY-padding,maxX:full.maxX+padding,maxY:full.maxY+padding};}
        if(intersects(searchBox,candidate)||!legacyDirect&&unobservedFineChange(space,entry,range))ids.add(id);
      }
      if(predictSeconds>routeForecastSeconds)window.nativeSimulationFrame?.count(state,'spatialShipLongForecastQueries');
      window.nativeSimulationFrame?.count(state,'spatialShipEntryBounds',space.entries.size);window.nativeSimulationFrame?.count(state,'spatialShipEntryQueries');
    }else{
      const coarse=path==='coarse',grid=coarse?space.coarseGrid:space.grid,overflow=coarse?space.coarseOverflow:space.overflow,selected=coarse?coarseRange:range;
      for(const id of overflow)ids.add(id);
      for(let x=selected.minX;x<=selected.maxX;x++)for(let y=selected.minY;y<=selected.maxY;y++)for(const id of grid.get(x+':'+y)||[])ids.add(id);
      window.nativeSimulationFrame?.count(state,coarse?'spatialShipCoarseGridCells':'spatialShipGridCells',selected.count);
      if(coarse)window.nativeSimulationFrame?.count(state,'spatialShipCoarseGridQueries');
    }
    const candidates=[];let boxRejects=0;
    for(const id of ids){const entry=space.entries.get(id);if(!entry)continue;if(path!=='direct'&&!intersects(searchBox,entry.box)&&!( !legacyDirect&&unobservedFineChange(space,entry,range))){boxRejects++;continue;}candidates.push(entry);}
    if(path!=='direct')window.nativeSimulationFrame?.count(state,'spatialShipEntryBounds',ids.size);
    if(boxRejects)window.nativeSimulationFrame?.count(state,'spatialShipBoundsRejects',boxRejects);
    // Query-path selection must not reorder interception/traffic ties. Retain
    // the former direct insertion order or fine overflow/cell/bucket traversal.
    if(legacyDirect)candidates.sort((a,b)=>a.order-b.order);
    else if(path!=='fine')candidates.sort((a,b)=>{
      const ao=space.overflow.has(idKey(a.target.id)),bo=space.overflow.has(idKey(b.target.id));if(ao!==bo)return ao?-1:1;
      return ao?a.gridOrder-b.gridOrder:Math.max(range.minX,a.range.minX)-Math.max(range.minX,b.range.minX)||Math.max(range.minY,a.range.minY)-Math.max(range.minY,b.range.minY)||a.gridOrder-b.gridOrder;
    });
    const allowed=categories?new Set(Array.isArray(categories)?categories:[categories]):null,bystanders=[];
    for(const entry of candidates){if(allowed&&!allowed.has(entry.target.category))continue;const reusable=reusableRoute(entry,entry.target.entity),poseChanged=changed(entry);if(temporallyDistant(state,entry,box,swept,predictSeconds,reusable,poseChanged))continue;const target=touch(state,record,entry,reusable,poseChanged);if(target&&living(target)&&intersects(box,bounds(target,swept,predictSeconds)))bystanders.push(target);}
    const asteroids=window.nativeSolAsteroids,nearRocks=allowed&&!allowed.has('asteroid')?[]:asteroids?.queryBounds?asteroids.queryBounds(system,box,{swept,predictSeconds}):asteroids?.forSystem?.(system)||(system===1?asteroids?.placements:[])||[];
    const rocks=[];for(const rock of nearRocks)if(!rockGone(state,rock.slotId)){
      const target=rockTarget(state,rock,system);if(intersects(box,bounds(target,swept,predictSeconds)))rocks.push(target);
    }
    window.nativeSimulationFrame?.count(state,'spatialQueries');window.nativeSimulationFrame?.count(state,'spatialShipCandidates',ids.size);window.nativeSimulationFrame?.count(state,'spatialAsteroidCandidates',nearRocks.length);
    const bodies=bodyTargets(state,system);
    return {state,targets:[...bystanders,...rocks],bystanders,rocks,destructibles:[],bodies,
      querySwept:(from,to,padding=0,{instant=false,horizon=0}={})=>query(state,{system,minX:Math.min(from.x,to.x)-padding,minY:Math.min(from.y,to.y)-padding,maxX:Math.max(from.x,to.x)+padding,maxY:Math.max(from.y,to.y)+padding,swept:!instant,predictSeconds:horizon})};
  }
  function bodyTargets(state,system){
    const frameCache=caches(state),key='bodies:'+system,cached=frameCache?.get(key);if(cached)return cached;
    const bodies=system===1?(window.nativeSystemHub?.sol||[]).filter(body=>body.id!==6).map(body=>({x:body.x-220,y:body.y+75,radius:(window.vexedSolFlight?.bodySize(body)||100)*.44})):[];
    frameCache?.set(key,bodies);return bodies;
  }
  function collisionScene(state,{system=state.system}={}){
    const frameCache=caches(state),key='collision:'+system,cached=frameCache?.get(key);if(cached)return cached;
    const result={state,bystanders:[],rocks:[],destructibles:[],bodies:bodyTargets(state,system),querySwept:(from,to,padding=0,{instant=false,horizon=0}={})=>query(state,{system,minX:Math.min(from.x,to.x)-padding,minY:Math.min(from.y,to.y)-padding,maxX:Math.max(from.x,to.x)+padding,maxY:Math.max(from.y,to.y)+padding,swept:!instant,predictSeconds:horizon})};
    frameCache?.set(key,result);return result;
  }
  function resolve(state,id,system=state.system){
    const frameCache=caches(state);
    // An ID lookup must not prepare a complete asteroid scene to find one ship.
    const key=idKey(id);let entity,category;
    if(key==='player'){entity=state;category='player';if(system!==state.system||state.hull<=0||state.landed||window.vexedWarp?.active)return null;}
    else if(key.startsWith('tug:')){entity=window.nativeSolEconomy?.find?window.nativeSolEconomy.find(state,key.slice(4)):state.solEconomy?.freighters?.find(ship=>idKey(ship.id)===key.slice(4));category='tug';}
    else{entity=window.nativeNpcLives?.find?.(state,key)??(!window.nativeNpcLives?.find?state.civilianTraffic?.ships?.find(ship=>idKey(ship.id)===key):null);category='civilian';}
    if(entity){const record=persistent.get(state)?.get(system),index=record?.slots.get(entity)?.get(category),entry=index===undefined?null:record.space.entries.get(idKey(record.ships[index].id));const target=entry?touch(state,record,entry):describeActor(state,entity,category,key);if(!living(target)||target.system!==system)return null;return refreshShip(state,entity,category,system,target)||target;}
    if(key.startsWith('rock:')){const rock=window.nativeSolAsteroids?.find?.(Number(key.slice(5)),system)||(window.nativeSolAsteroids?.forSystem?.(system)||window.nativeSolAsteroids?.placements||[]).find(rock=>idKey(rock.slotId)===key.slice(5));return rock&&!rockGone(state,rock.slotId)?rockTarget(state,rock,system):null;}
    // Optional category resolvers (including owned repair drones) already know
    // their entities. Consult them before preparing unrelated fleet/rock views.
    for(const [registeredCategory,adapter] of kinds){
      if(!adapter.resolve)continue;
      const resolved=adapter.resolve(state,id,system);if(!resolved||idKey(resolved.id)!==key)continue;
      const target={...resolved,category:resolved.category||registeredCategory,system:resolved.system??resolved.entity?.system??system};
      if(!living(target)||target.system!==system)return null;
      return target.entity?refreshShip(state,target.entity,target.category,system,target)||target:target;
    }
    if(!frameCache)return collect(state,system).find(target=>idKey(target.id)===key)||null;
    scene(state,{system});
    const target=frameCache.get('targets:'+system)?.byId.get(idKey(id));if(!target)return null;
    const targetEntity=target.entity;
    if(target.category==='asteroid')return state.minedAsteroids?.includes(target.rockId)||state.destroyedAsteroids?.includes(target.rockId)?null:target;
    if(targetEntity&&(targetEntity.hull<=0||['destroyed','warp','arriving'].includes(targetEntity.phase)||(targetEntity.system??system)!==system))return null;
    // A resolver's missing result is authoritative, for example a stowed drone;
    // do not fall back to a stale cached descriptor for that category.
    return kinds.get(target.category)?.resolve?null:target;
  }
  // Inspection is a lightweight read model, not collision collection or simulation activation.
  // Categories with transit/dead entities supply inspect; ordinary extensions inherit collect.
  function inspectAll(state){
    if(!state)return [];
    const result=[],seen=new Set();
    for(const [category,adapter] of kinds){
      if(category==='asteroid')continue;
      const entries=adapter.inspect?adapter.inspect(state):
        (window.VexedMirrorWorld.systems||[{id:state.system}]).flatMap(system=>adapter.collect(state,system.id)||[]);
      for(const target of entries||[]){
        const key=String(target.id);if(seen.has(key))continue;seen.add(key);
        result.push({...target,category:target.category||category});
      }
    }
    return result;
  }
  function applyHit(state,result,event,source){
    const collisionTarget=result.target;if(!collisionTarget)return {ok:false};
    // Refresh after every collision: earlier shots may already have destroyed it.
    const target=resolve(state,collisionTarget.id,collisionTarget.system??source.system??state.system);
    if(!target)return {ok:false};
    const impact={from:result.from||result.point,point:result.point,contact:result.contact,collision:result,
      kind:event.kind,weaponEventId:event.id,source:source.id==='player'?'player':'ai',sourceId:source.id};
    const damageResult=kinds.get(target.category)?.hit(state,target,event.damage,impact)||{ok:false};
    if(['player','civilian','tug'].includes(target.category))refreshShip(state,target.entity,target.category,target.system);
    else if(target.category==='asteroid')refreshAsteroid(state,target.entity);
    else if(target.entity)refreshShip(state,target.entity,target.category,target.system);
    else invalidate(state,target.system);return damageResult;
  }
  function visualImpact(state,target,event){return kinds.get(target.category)?.visualImpact?.(state,target,event);}
  function resolved(state,result,event){for(const adapter of kinds.values())adapter.onResolved?.(state,result,event);}
  function applyContact(state,ship,pose){
    const entity=ship.entity,offsetX=ship.category==='player'?ship.x-entity.x:0,offsetY=ship.category==='player'?ship.y-entity.y:0;
    window.nativeShipMotion.applyImpulse(entity,{x:pose.vx-ship.vx,y:pose.vy-ship.vy},window.nativeSimulation.seconds(state),{x:pose.x-ship.x,y:pose.y-ship.y});
    Object.assign(entity,{x:pose.x-offsetX,y:pose.y-offsetY,vx:pose.vx,vy:pose.vy,speed:Math.hypot(pose.vx,pose.vy)});
    if(Number.isFinite(pose.angularVelocity)){
      window.nativeShipMotion.applySpinImpulse(entity,pose.angularVelocity-(ship.angularVelocity||0),window.nativeSimulation.seconds(state),window.nativeShipMotion.wrap(pose.heading-ship.heading));
      if(ship.category==='player')entity.angle=pose.heading;else entity.heading=pose.heading;
    }
    refreshShip(state,entity,ship.category,ship.system);
  }
  function move(state,entity,category,command,profile,dt){
    if(!(dt>0)||window.nativeSimulation.blocked())return {arrived:false,moved:0};
    const descriptor=window.nativeShipDefinitions.describe(state,entity,{category});
    const pose={x:descriptor.x,y:descriptor.y,heading:descriptor.heading,speed:entity.speed||0,
      vx:entity.vx,vy:entity.vy,motionAngularVelocity:entity.motionAngularVelocity,motionKick:entity.motionKick,motionSpin:entity.motionSpin,motionTime:window.nativeSimulation.seconds(state)};
    const origin={x:descriptor.x-entity.x,y:descriptor.y-entity.y};
    profile||=descriptor.definition.movement;
    if(entity.phase==='disabled'||descriptor.definition.engineOnline===false){command={coast:true};profile={maxSpeed:Infinity,turnRate:0,damping:0,inertial:true};}
    command=window.nativeShipTraffic?.steer(state,descriptor,command,profile)||command;
    const result=window.nativeShipMotion.step(pose,command,profile,dt);
    Object.assign(entity,{x:pose.x-origin.x,y:pose.y-origin.y,speed:pose.speed,vx:pose.vx,vy:pose.vy,motionAngularVelocity:pose.motionAngularVelocity,
      previousX:pose.previousX,previousY:pose.previousY,motionKick:pose.motionKick,motionSpin:pose.motionSpin});
    if(category==='player')entity.angle=pose.heading;else entity.heading=pose.heading;
    refreshShip(state,entity,category,descriptor.system);
    return result;
  }
  function player(state,system){
    if(system!==state.system||state.hull<=0||state.landed||window.vexedWarp?.active)return [];
    return [window.nativeShipDefinitions.describe(state,state,{category:'player'})];
  }
  function inspectPlayer(state){
    const cargo=[...Object.entries(state.solFreightHold||{}).filter(([,tons])=>Number(tons)>0).map(([good,tons])=>({good:Number(good),tons:Number(tons)})),
      ...(state.localContracts||[]).map(job=>({good:job.good,tons:job.tons,contractId:job.id,destination:job.to}))];
    return [{...window.nativeShipDefinitions.describe(state,state,{category:'player'}),name:state.shipName||'Player',role:'player',detail:state.hull>0?'detailed':'inactive',faction:state.government||state.faction,credits:Number(state.latinum)||0,cargo}];
  }
  register('player',{collect:player,inspect:inspectPlayer,hit:(state,_,amount,impact)=>window.nativeCombatShots.onPlayerHit?.(state,amount,impact),
    visualImpact:(state,_,event)=>window.nativePlayerCombat.visualImpact(state,event)});
  register('tug',{collect:(state,system)=>system===1?(state.solEconomy?.freighters||[]).filter(ship=>ship.phase!=='destroyed').map(ship=>window.nativeShipDefinitions.describe(state,ship,{category:'tug'})):[],
    inspect:state=>window.nativeSolEconomy.lifeDescriptors?.(state)||(state.solEconomy?.freighters||[]).map(ship=>window.nativeShipDefinitions.describe(state,ship,{category:'tug'})),
    hit:(state,target,amount,impact)=>window.nativeSolEconomy.hit(state,target.entity.id,amount,impact),
    visualImpact:(state,target,event)=>window.nativeSolEconomy.visualImpact(state,target.entity.id,event)});
  register('civilian',{collect:(state,system)=>(window.nativeNpcLives?.members?.(state,system)||state.civilianTraffic?.ships||[]).filter(ship=>ship.system===system&&!['warp','arriving','destroyed'].includes(ship.phase)).map(ship=>window.nativeShipDefinitions.describe(state,ship,{category:'civilian'})),
    inspect:state=>window.nativeNpcLives?.descriptors(state)||(state.civilianTraffic?.ships||[]).map(ship=>window.nativeShipDefinitions.describe(state,ship,{category:'civilian'})),
    hit:(state,target,amount,impact)=>window.nativeCivilianTraffic.hit(state,target.entity.id,amount,impact),
    visualImpact:(state,target,event)=>window.nativeCivilianTraffic.visualImpact(state,target.entity.id,event),
    onResolved(state,result,event){
      const traffic=state.civilianTraffic;
      const conflict=[...(traffic?.disputes||[]),...(traffic?.retaliations||[])].find(record=>record.id===event.owner);
      if(conflict){if(result.kind==='hit')conflict.hits=(conflict.hits||0)+1;else conflict.misses=(conflict.misses||0)+1;}
    }});
  register('asteroid',{collect:asteroidTargets,hit:(state,target,amount,impact)=>window.nativeAsteroidCombat.weaponHit(state,target.rockId,amount,impact)});
  function inspect(state,id){if(String(id)==='player')return inspectPlayer(state)[0];if(String(id).startsWith('tug:'))return window.nativeSolEconomy?.inspect?.(state,String(id).slice(4))||null;return window.nativeNpcLives?.inspect?.(state,id)||null;}
  window.nativeShipSystems=Object.freeze({register,registered:()=>[...kinds.keys()],collect,collectShips,countShips:(state,system=state.system)=>shipRecord(state,system).ships.length,scene,collisionScene,query,resolve,applyHit,visualImpact,resolved,move,applyContact,inspectAll,inspect,observeCollection,invalidate,invalidateShips,refreshShip,sampledShip,refreshAsteroid});
})();
