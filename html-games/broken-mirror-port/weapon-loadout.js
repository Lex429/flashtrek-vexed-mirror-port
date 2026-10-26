/* One typed ownership/fitting boundary. Legacy arrays are saved projections. */
(() => {
 'use strict';
 const kinds=['weapon','repairDrone','ability','engineering','shield'];
 const catalog={
  'mining-laser':{id:'mining-laser',category:'ability',name:'Mining laser',price:120},
  'basic-dot':{id:'basic-dot',category:'repairDrone',name:'Basic Dot',shipType:9001,hull:40,price:1300},
  'standard-engine':{id:'standard-engine',category:'engineering',name:'Standard warp engine',price:500,speedMultiplier:1,icon:'assets/equipment/standard-engine.png',description:'Standard propulsion for every ship. Original Intrepid-class flight speed.'},
  'upgraded-engine':{id:'upgraded-engine',category:'engineering',name:'Upgraded warp engine',price:2500,speedMultiplier:1.1,icon:'assets/equipment/upgraded-engine.png',description:'Refined warp coils. 10% faster than the standard engine.'},
  'advanced-engine':{id:'advanced-engine',category:'engineering',name:'Advanced warp engine',price:5000,speedMultiplier:1.2,icon:'assets/equipment/advanced-engine.png',description:'Advanced plasma regulation. 20% faster than the standard engine.'},
  'standard-shield':{id:'standard-shield',category:'shield',name:'Hull shield system',price:500}
 };
 const cache=new WeakMap(),clock=s=>(window.nativeSimulation?.seconds(s)??Number(s?.weaponCombat?.clock))||0;
 function model(id){if(catalog[id])return catalog[id];const yard=window.nativeShipyardRefits?.model(id);if(yard)return yard;const w=window.VexedMirrorWeapons?.find(w=>w.id===Number(id));return w?{...w,category:w.category||'weapon'}:null;}
 const compatible=(kind,id)=>model(id)?.category===kind;
 const definition=e=>window.nativeShipDefinitions?.get(e.shipType??7)||{slots:{weapon:3,repairDrone:0,ability:2,engineering:1,shield:1},startingEquipment:{}};
 const capacities=e=>window.nativeShipyardRefits?.slots(e,definition(e))||definition(e).slots;
 const bayZone=kind=>kind==='weapon'?'weapons':kind==='repairDrone'?'drones':'systems';
 // Display positions identify typed bays, never the item currently fitted there.
 // Reading a layout is pure, including previews and older saves without a layout.
 function bayLayout(holder,limits=capacities(holder)){
  const stored=holder.shipEquipment?.bayLayout,saved=stored?.version===1&&stored.hullType===Number(holder.shipType??7)?stored.positions||{}:{};
  const bays=[],taken={weapons:new Set(),systems:new Set(),drones:new Set()};
  for(const category of ['weapon','engineering','shield','ability','repairDrone'])for(let index=0;index<(limits[category]||0);index++){
   const key=category+':'+index,zone=bayZone(category),cell=saved[key];
   bays.push({key,category,index,zone,cell:Number.isInteger(cell)&&cell>=0&&cell<72&&!taken[zone].has(cell)?cell:null});
   if(bays.at(-1).cell!==null)taken[zone].add(cell);
  }
  for(const bay of bays)if(bay.cell===null){let cell=0;while(taken[bay.zone].has(cell))cell++;bay.cell=cell;taken[bay.zone].add(cell);}
  const zones=Object.fromEntries(Object.keys(taken).map(zone=>[zone,{count:Math.max(zone==='drones'?8:6,taken[zone].size+2,...[...taken[zone]].map(n=>n+1))}]));
  return {version:1,hullType:Number(holder.shipType??7),bays,zones};
 }
 function placeBay(state,{holder=state,category,index,cell,zone=bayZone(category)}={}){
  const eq=ensure(state,holder),layout=bayLayout(holder),bay=layout.bays.find(b=>b.category===category&&b.index===index);
  if(!bay||zone!==bay.zone||!Number.isInteger(cell)||cell<0||cell>=layout.zones[zone].count||layout.bays.some(b=>b.key!==bay.key&&b.zone===zone&&b.cell===cell))return {ok:false,error:'Choose an available mount in the highlighted bay area.'};
  bay.cell=cell;eq.bayLayout={version:1,hullType:layout.hullType,positions:Object.fromEntries(layout.bays.map(b=>[b.key,b.cell]))};
  return {ok:true,bay:{...bay}};
 }
 function create(eq,id){
  let key;do{key=(model(id).category==='repairDrone'?'dot:'+eq.owner+':':model(id).category==='weapon'?'weapon:':'equipment:')+eq.nextId++;}while(eq.instances[key]);
  const item=eq.instances[key]={id:key,modelId:id,category:model(id).category,readyAt:0,upgrades:{}};
  if(item.category==='repairDrone')Object.assign(item,{shipType:9001,hull:40,shields:0,phase:'stowed',heading:0,speed:0});return item;
 }
 function project(holder,eq){
  holder.miningTool=eq.slots.ability.some(id=>eq.instances[id]?.modelId==='mining-laser');
  holder.weaponLoadout={version:1,nextId:eq.nextId,nextSlot:eq.nextSlot||0,slots:eq.slots.weapon,locker:eq.locker.filter(id=>eq.instances[id]?.category==='weapon'),instances:eq.instances};
  holder.weapons=eq.slots.weapon.map(id=>eq.instances[id]?.modelId??null);holder.weaponInventory=holder.weaponLoadout.locker.map(id=>eq.instances[id].modelId);
  holder.repairBay={version:2,generation:holder.lifeGeneration||0,capacity:eq.slots.repairDrone.length,slots:eq.slots.repairDrone.map((id,slot)=>{const d=eq.instances[id];if(d)d.slot=slot;return d;}).filter(Boolean)};
 }
 function reconcile(holder,eq){
  eq.slots||={};eq.instances||={};eq.nextId=Math.max(1,Number(eq.nextId)||1);for(const item of Object.values(eq.instances))item.category=model(item.modelId)?.category||'legacy';
  const limits=capacities(holder),seen=new Set(),locker=[];
  const stow=id=>{if(id&&eq.instances[id]&&!seen.has(id)){seen.add(id);locker.push(id);}};
  for(const kind of kinds){
   const old=Array.isArray(eq.slots[kind])?eq.slots[kind]:[],slots=Array(limits[kind]).fill(null);
   old.forEach((id,i)=>{const item=eq.instances[id];if(!id||!item||seen.has(id))return;if(i<slots.length&&compatible(kind,item.modelId)){slots[i]=id;seen.add(id);}else stow(id);});eq.slots[kind]=slots;
  }
  for(const id of eq.locker||[])stow(id);for(const id of Object.keys(eq.instances))stow(id);
  eq.locker=locker;eq.shipType=holder.shipType??7;project(holder,eq);cache.set(holder,{eq,key:JSON.stringify(limits),type:eq.shipType});return eq;
 }
 function ensure(state,holder=state,defaults){
  let eq=holder.shipEquipment;
  if(eq?.version===2){const previous=cache.get(holder),key=JSON.stringify(capacities(holder));if(previous?.eq===eq&&previous.key===key&&previous.type===(holder.shipType??7))return eq;return reconcile(holder,eq);}
  const legacy=holder.weaponLoadout,initial=definition(holder).startingEquipment;
  eq={version:2,owner:holder===state?'player':(holder.equipmentOwner||'civilian:'+holder.id)+':'+(holder.lifeGeneration||0),nextId:Math.max(1,Number(legacy?.nextId)||1),nextSlot:legacy?.nextSlot||0,slots:Object.fromEntries(kinds.map(k=>[k,[]])),locker:[],instances:{}};
  const put=(item,kind,index)=>{if(index!==undefined&&!eq.slots[kind][index])eq.slots[kind][index]=item.id;else eq.locker.push(item.id);};
  if(legacy?.version===1&&legacy.instances){
   for(const [id,item] of Object.entries(legacy.instances))eq.instances[id]={...item,category:model(item.modelId)?.category||'legacy'};
   for(const [i,id] of (legacy.slots||[]).entries()){const item=eq.instances[id];if(!item)continue;const kind=kinds.includes(item.category)?item.category:'weapon';put(item,kind,kind==='weapon'?i:eq.slots[kind].length);}
   eq.locker.push(...(legacy.locker||[]));
  }else{
   const fitted=Array.isArray(holder.weapons)?holder.weapons:defaults??initial.weapon??[];
   const oldClock=holder===state?(state.shipSimulation?.legacyClocks?.player??state.weaponCombat?.clock??0):(state.shipSimulation?.legacyClocks?.civilian??state.civilianTraffic?.clock??0),readiness=holder===state?state.weaponCombat?.weaponReadyAt:holder.weaponReadyAt;
   fitted.forEach((id,i)=>{const data=model(id);if(!data)return;const item=create(eq,id);item.readyAt=clock(state)+Math.max(0,(Number(readiness?.[i+':'+id])||0)-oldClock);put(item,data.category,data.category==='weapon'?i:eq.slots[data.category].length);});
   for(const id of holder.weaponInventory||[])if(model(id))eq.locker.push(create(eq,id).id);
   if(holder===state&&state.weaponCombat)delete state.weaponCombat.weaponReadyAt;else delete holder.weaponReadyAt;
  }
  const tools=holder.miningTool?['mining-laser']:holder===state?[]:definition(holder).npcStartingEquipment?.ability||[];
  for(const id of tools)if(!Object.values(eq.instances).some(i=>i.modelId===id))eq.slots.ability.push(create(eq,id).id);
  if(holder.repairBay){for(const [i,d] of (holder.repairBay.slots||[]).entries())if(d){const item={...d,modelId:'basic-dot',category:'repairDrone',readyAt:d.readyAt||0};eq.instances[item.id]=item;eq.slots.repairDrone[i]=item.id;}}
  else for(const id of initial.repairDrone||[])eq.slots.repairDrone.push(create(eq,id).id);
  for(const kind of ['engineering','shield'])if(!eq.slots[kind].length)for(const id of initial[kind]||[])eq.slots[kind].push(create(eq,id).id);
  const engine=eq.instances[eq.slots.engineering[0]];if(engine)engine.upgrades={...engine.upgrades,tugEngineLevel:Number(holder.tugEngineLevel)||0};
  holder.shipEquipment=eq;return reconcile(holder,eq);
 }
 function target(eq,kind,location,index){if(!kinds.includes(kind)||!['slot','locker'].includes(location)||!Number.isInteger(index)||index<0)return null;const list=location==='slot'?eq.slots[kind]:eq.locker;return index<(location==='slot'?list.length:list.length+1)?list:null;}
 function grant(state,id,{holder=state,location='locker',slot,category}={}){
  const data=model(id);if(!data||category&&category!==data.category)return {ok:false,error:'Unknown or incompatible equipment.'};
  const eq=ensure(state,holder),kind=data.category,index=location==='slot'?(slot??eq.slots[kind].findIndex(id=>!id)):eq.locker.length,list=target(eq,kind,location,index);
  if(!list)return {ok:false,error:'That equipment slot is outside this hull capacity.'};
  if(location==='slot'){const allowed=window.nativeShipyardRefits?.validateFit(holder,{category:kind,slot:index,modelId:id});if(allowed&&!allowed.ok)return allowed;}
  if(location==='slot'&&eq.instances[list[index]]?.category==='repairDrone'&&!['stowed','destroyed'].includes(eq.instances[list[index]].phase))return {ok:false,error:'Recover deployed drones before changing equipment.'};
  const item=create(eq,id);if(list[index])eq.locker.push(list[index]);list[index]=item.id;project(holder,eq);return {ok:true,instance:item};
 }
 function move(state,{holder=state,category='weapon',fromType,fromIndex,toType,toIndex,toCategory=category}={}){
  const eq=ensure(state,holder),source=target(eq,category,fromType,fromIndex),dest=target(eq,toCategory,toType,toIndex),id=source?.[fromIndex],other=dest?.[toIndex],item=eq.instances[id],swapped=eq.instances[other];
  if(!source||!dest||!item||toType==='slot'&&!compatible(toCategory,item.modelId)||fromType==='slot'&&swapped&&!compatible(category,swapped.modelId))return {ok:false,error:'Choose compatible equipment and a valid slot.'};
  if([item,swapped].some(i=>i?.category==='repairDrone'&&!['stowed','destroyed'].includes(i.phase)))return {ok:false,error:'Recover deployed drones before changing equipment.'};
  if(toType==='slot'){const allowed=window.nativeShipyardRefits?.validateFit(holder,{category:toCategory,slot:toIndex,modelId:item.modelId,fromSlot:fromType==='slot'&&category===toCategory?fromIndex:undefined});if(allowed&&!allowed.ok)return allowed;}
  if(fromType==='slot'&&swapped&&category!==toCategory){const allowed=window.nativeShipyardRefits?.validateFit(holder,{category,slot:fromIndex,modelId:swapped.modelId});if(allowed&&!allowed.ok)return allowed;}
  if(source===dest&&fromIndex===toIndex)return {ok:true};
  if(fromType==='locker'){source.splice(fromIndex,1);if(toType==='locker')source.splice(Math.min(toIndex,source.length),0,id);else{dest[toIndex]=id;if(other)eq.locker.splice(Math.min(fromIndex,eq.locker.length),0,other);}}
  else if(toType==='locker'){source[fromIndex]=other||null;if(toIndex===dest.length)dest.push(id);else dest[toIndex]=id;}else{source[fromIndex]=other||null;dest[toIndex]=id;}
  project(holder,eq);if(!eq.slots.shield.some(Boolean))holder.shields=0;else if(category==='shield'||toCategory==='shield')holder.shields=Math.min(Number(holder.shields)||0,window.nativeShipDefinitions.forEntity(state,holder).shields);return {ok:true};
 }
 function equipped(state,holder=state,defaults){const eq=ensure(state,holder,defaults);return eq.slots.weapon.map((id,slot)=>({slot,instance:eq.instances[id],weapon:model(eq.instances[id]?.modelId)})).filter(i=>i.instance&&i.weapon);}
 // Saved presentation positions reference owned items; quantities and fitting remain authoritative.
 function inventoryKeys(state){
  const eq=ensure(state),positive=value=>Number(value)>0;
  return [...eq.locker.map(id=>'equipment:'+id),...['dilithium','deuranium','food'].filter(key=>positive(state[key])).map(key=>'supply:'+key),
   ...Object.entries(state.minerals||{}).filter(([,n])=>positive(n)).map(([key])=>'mineral:'+key),
   ...Object.entries(state.solFreightHold||{}).filter(([,n])=>positive(n)).map(([key])=>'freight:'+key),
   ...(state.localContracts||[]).map(job=>'contract:'+job.id)];
 }
 function inventoryLayout(state){
  const keys=inventoryKeys(state),available=new Set(keys),seen=new Set();
  const previous=state.inventoryLayout?.version===1&&Array.isArray(state.inventoryLayout.cells)?state.inventoryLayout.cells:[];
  const cells=previous.slice(0,100000).map(key=>{if(typeof key!=='string'||!available.has(key)||seen.has(key))return null;seen.add(key);return key;});
  let free=0;for(const key of keys)if(!seen.has(key)){while(cells[free])free++;cells[free]=key;seen.add(key);}
  while(cells.length&&!cells[cells.length-1])cells.pop();
  state.inventoryLayout={version:1,cells};return state.inventoryLayout;
 }
 function moveInventory(state,{from,to}={}){
  const eq=ensure(state),layout=inventoryLayout(state),cells=layout.cells;
  const cell=at=>at?.type==='cell'&&Number.isInteger(at.index)&&at.index>=0&&at.index<100000;
  const bay=at=>at?.type==='slot'&&kinds.includes(at.category)&&Number.isInteger(at.index)&&at.index>=0&&at.index<eq.slots[at.category].length;
  if(!(cell(from)||bay(from))||!(cell(to)||bay(to)))return {ok:false,error:'Choose an inventory tile or a valid equipment bay.'};
  const key=cell(from)?cells[from.index]:'equipment:'+eq.slots[from.category][from.index];
  if(!key||from.key&&from.key!==key)return {ok:false,error:'That item has moved. Pick it up again.'};
  if(from.type===to.type&&from.index===to.index&&(cell(from)||from.category===to.category))return {ok:true};
  if(cell(from)&&cell(to)){const other=cells[to.index]||null;cells[to.index]=key;cells[from.index]=other;inventoryLayout(state);return {ok:true};}
  const id=key.startsWith('equipment:')?key.slice(10):null,item=eq.instances[id];
  if(!item)return {ok:false,error:'Cargo belongs in your inventory; fit equipment into ship bays.'};
  const fromType=cell(from)?'locker':'slot',fromIndex=cell(from)?eq.locker.indexOf(id):from.index;
  if(cell(to)){
   const other=cells[to.index],otherId=other?.startsWith('equipment:')?other.slice(10):null;
   const swap=otherId&&eq.instances[otherId]?.category===item.category;
   const result=move(state,{category:item.category,fromType,fromIndex,toType:'locker',toIndex:swap?eq.locker.indexOf(otherId):eq.locker.length});
   if(!result.ok)return result;
   if(other&&!swap){let free=0;while(cells[free]||free===to.index)free++;cells[free]=other;}
   cells[to.index]=key;
  }else{
   const other=eq.slots[to.category][to.index];
   const result=move(state,{category:item.category,fromType,fromIndex,toType:'slot',toIndex:to.index,toCategory:to.category});
   if(!result.ok)return result;
   if(cell(from))cells[from.index]=other?'equipment:'+other:null;
  }
  inventoryLayout(state);return {ok:true};
 }
 function cargoUsed(state,holder=state){const qty=n=>Math.max(0,Number(n)||0);return holder===state?qty(holder.devMode?0:holder.deuranium)+Object.values(holder.solFreightHold||{}).reduce((n,v)=>n+qty(v),0)+(holder.localContracts||[]).reduce((n,j)=>n+qty(j.tons),0)+Object.values(holder.minerals||{}).reduce((n,v)=>n+qty(v),0):qty(holder.cargo?.tons)+qty(holder.oreHold)+qty(holder.tons)+qty(holder.repairDeuranium);}
 function canChangeHull(state,type,{holder=state}={}){const def=window.nativeShipDefinitions.get(type),used=cargoUsed(state,holder);if(used>def.cargo)return {ok:false,error:`Cargo aboard is ${used} t; ${def.name} holds ${def.cargo} t. Deliver or sell cargo before buying this hull.`};const eq=ensure(state,holder);if(Object.values(eq.instances).some(i=>i.category==='repairDrone'&&!['stowed','destroyed'].includes(i.phase)))return {ok:false,error:'Recover deployed drones before changing hulls.'};return {ok:true};}
 function changeHull(state,type,{holder=state}={}){const allowed=canChangeHull(state,type,{holder});if(!allowed.ok)return allowed;const eq=ensure(state,holder),def=window.nativeShipDefinitions.get(type);holder.shipType=Number(type);delete eq.bayLayout;delete holder.shipRefit;delete holder.shieldResponse;holder.shipClass=def.name;reconcile(holder,eq);holder.hull=window.nativeShipDefinitions.forEntity(state,holder).hull;holder.shields=0;holder.speed=0;holder.vitalsVersion=2;holder.phase='docked';return {ok:true};}
 function refit(state,ids,{holder=state}={}){const eq=ensure(state,holder);for(const kind of ['weapon','ability']){eq.locker.push(...eq.slots[kind].filter(Boolean));eq.slots[kind].fill(null);}for(const id of ids||[]){const kind=model(id)?.category;if(!kind)continue;const slot=eq.slots[kind].findIndex(id=>!id);grant(state,id,{holder,location:slot<0?'locker':'slot',slot});}eq.nextSlot=0;project(holder,eq);return holder.weaponLoadout;}
 function purchase(state,id,{holder=state}={}){const item=model(id);if(!item)return {ok:false,error:'Unknown equipment.'};if(item.shipyardOnly)return {ok:false,error:'Purchase Federation equipment at Mars Orbital Shipyard.'};if((holder===state?state.latinum:holder.credits)<item.price)return {ok:false,error:'Not enough credits for this equipment.'};const result=grant(state,id,{holder});if(result.ok){if(holder===state)state.latinum-=item.price;else holder.credits-=item.price;}return result;}
 const ready=(item,now)=>(Number(item?.readyAt)||0)<=now,consume=(item,spec,now)=>{item.readyAt=now+spec.recharge;};
 window.nativeShipEquipment=Object.freeze({ensure,capacities,model,compatible,grant,move,inventoryKeys,inventoryLayout,moveInventory,bayLayout,placeBay,equipped,cargoUsed,canChangeHull,changeHull,purchase,kinds,project,has:(s,e,id)=>{const eq=ensure(s,e);return eq.slots[model(id)?.category]?.some(key=>eq.instances[key]?.modelId===id)||false;}});
 window.nativeWeaponLoadout=Object.freeze({ensure:(s,h=s,d)=>{ensure(s,h,d);return h.weaponLoadout;},equipped,grant,move,refit,ready,consume,project:(h)=>project(h,h.shipEquipment)});
})();
