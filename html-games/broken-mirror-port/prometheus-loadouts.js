/* Four saved weapon configurations; physical items stay with the shared owner. */
(()=>{
 'use strict';
 const keys=['combined','top','middle','bottom'],types={combined:37,top:3701,middle:3702,bottom:3703},names={combined:'Combined ship',top:'Alpha',middle:'Beta',bottom:'Gamma'};
 const supported=s=>Number(s?.shipType)===37;
 const split=s=>supported(s)&&s.prometheus?.version===1&&s.prometheus.mode!=='joined';
 const currentKey=s=>split(s)?keys.find(k=>types[k]===(s.prometheus.leadType||3702))||'middle':'combined';
 const body=(s,key)=>currentKey(s)===key?s:s.prometheus?.sections?.find(e=>e.shipType===types[key]);
 const fittingHull=(s,key)=>body(s,key)||{shipType:types[key],shipRefit:s.shipRefit?{...s.shipRefit,hullType:types[key]}:undefined};
 const living=e=>e&&e.hull>0&&e.phase!=='destroyed';
 const count=(s,key)=>key==='combined'?s.shipEquipment.slots.weapon.length:window.nativeShipEquipment.capacities(fittingHull(s,key)).weapon;
 function initialize(s){
  if(!supported(s))return null;
  const eq=window.nativeShipEquipment.ensure(s),valid=id=>eq.instances[id]?.category==='weapon';
  let data=s.prometheusLoadouts;
  if(data?.version!==1){
   data=s.prometheusLoadouts={version:1,plans:Object.fromEntries(keys.map(key=>[key,{weapon:Array(count(s,key)).fill(null),nextSlot:0}])),layouts:{}};
   const owned=[...new Set([...eq.slots.weapon,...eq.locker,...Object.keys(eq.instances)].filter(valid))];
   // Preserve the pilot's first bank, then arm each escort with a different
   // already-owned weapon. No copy or new item is created during migration.
   for(const key of ['middle','top','bottom'])if(owned.length)data.plans[key].weapon[0]=owned.shift();
  }
  data.layouts||={};data.plans.combined.weapon=eq.slots.weapon.slice();
  if(!split(s))data.plans.combined.nextSlot=eq.nextSlot||0;
  const seen=new Set();for(const key of ['middle','top','bottom']){
   const plan=data.plans[key]||={weapon:[],nextSlot:0};plan.weapon=Array.from({length:count(s,key)},(_,i)=>{const id=plan.weapon[i];if(!valid(id)||seen.has(id))return null;seen.add(id);return id;});
  }
  return data;
 }
 function keyForHolder(s,holder){
  if(!split(s))return null;if(holder===s)return currentKey(s);
  return holder?.prometheusSection&&s.prometheus.sections.includes(holder)?keys.find(k=>types[k]===holder.shipType):null;
 }
 function loadoutFor(s,holder=s){
  const key=keyForHolder(s,holder),data=s?.prometheusLoadouts,plan=key&&data?.plans?.[key];if(!plan)return null;
  return {slots:plan.weapon,instances:s.shipEquipment.instances,locker:[],get nextSlot(){return plan.nextSlot||0;},set nextSlot(value){plan.nextSlot=value;}};
 }
 function fitted(s,holder){
  const view=loadoutFor(s,holder);if(!view)return null;
  return view.slots.map((id,slot)=>({slot,instance:view.instances[id],weapon:window.nativeShipEquipment.forInstance(view.instances[id])})).filter(v=>v.instance&&v.weapon?.category==='weapon');
 }
 function assign(s,key,index,id){
  const data=initialize(s),eq=s.shipEquipment,plan=data?.plans[key];
  if(!plan||!Number.isInteger(index)||index<0||index>=count(s,key))return {ok:false,error:'Choose a valid weapon mount.'};
  if(id!=null&&eq.instances[id]?.category!=='weapon')return {ok:false,error:'Choose an owned weapon.'};
  if(id){const allowed=window.nativeShipyardRefits?.validateFit(fittingHull(s,key),{category:'weapon',slot:index,modelId:eq.instances[id].modelId});if(allowed&&!allowed.ok)return allowed;}
  if(key==='combined'){
   const existing=eq.slots.weapon[index];let result={ok:true};
   if(id){const slot=eq.slots.weapon.indexOf(id);result=window.nativeShipEquipment.move(s,{category:'weapon',fromType:slot>=0?'slot':'locker',fromIndex:slot>=0?slot:eq.locker.indexOf(id),toType:'slot',toIndex:index});}
   else if(existing)result=window.nativeShipEquipment.move(s,{category:'weapon',fromType:'slot',fromIndex:index,toType:'locker',toIndex:eq.locker.length});
   if(!result.ok)return result;plan.weapon=eq.slots.weapon.slice();
  }else{
   if(id)for(const other of ['top','middle','bottom'])for(let i=0;i<data.plans[other].weapon.length;i++)if(data.plans[other].weapon[i]===id)data.plans[other].weapon[i]=null;
   plan.weapon[index]=id||null;
  }
  window.nativeShipSystems?.invalidateShips(s);return {ok:true,message:id?`${names[key]} weapon fitted.`:`${names[key]} weapon stored.`};
 }
 function context(s,key){
  const data=initialize(s);if(!data)return null;key=keys.includes(key)?key:currentKey(s);
  const root=s.shipEquipment,plan=data.plans[key],part=window.nativePrometheusDefinitions.parts.find(p=>p.type===types[key]),entity=key==='combined'?null:body(s,key),record=s.prometheus?.assembly?.parts.find(p=>p.type===types[key]);
  const available=key==='combined'||!split(s)||living(entity),piloted=split(s)&&currentKey(s)===key;
  const hp=key==='combined'?(split(s)?s.hull+s.prometheus.sections.reduce((n,e)=>n+Math.max(0,e.hull),0):s.hull):split(s)?entity?.hull||0:record?.hull??s.hull*part.weight;
  const shields=key==='combined'?(split(s)?s.shields+s.prometheus.sections.filter(living).reduce((n,e)=>n+(e.shields||0),0):s.shields):split(s)?entity?.shields||0:(record?.shields??s.shields*part.weight);
  const eq={...root,slots:{...root.slots,weapon:plan.weapon},locker:[...new Set([...root.locker,...Object.keys(root.instances).filter(id=>root.instances[id].category==='weapon')])].filter(id=>!plan.weapon.includes(id))};
  const subject={...s,...fittingHull(s,key),prometheus:undefined,shipType:types[key],shipName:names[key],hull:hp,shields,shipEquipment:eq,phase:hp>0?'flight':'destroyed'};
  const ship=key==='combined'?window.nativeShipDefinitions.get(37):window.nativeShipDefinitions.forEntity(s,subject,{category:'prometheus'});
  const status=piloted?'Piloting':split(s)?key==='combined'?'Active after rejoining':available?'Autopilot':'Lost - reconstruction required':key==='combined'?'Active vessel':record?.build===0?'Lost - reconstruction required':'Next separation';
  return {key,type:types[key],name:names[key],eq,subject,ship,piloted,available,status,canPilot:split(s)&&key!=='combined'&&available&&!piloted};
 }
 function layoutFor(s,key){
  const ctx=context(s,key);if(!ctx)return null;const data=s.prometheusLoadouts;
  const keysHere=[...ctx.eq.locker.map(id=>'equipment:'+id),...window.nativeShipEquipment.inventoryKeys(s).filter(k=>!k.startsWith('equipment:'))],allowed=new Set(keysHere),seen=new Set();
  const cells=(data.layouts[key]||[]).slice().map(k=>{if(!allowed.has(k)||seen.has(k))return null;seen.add(k);return k;});
  let free=0;for(const k of keysHere)if(!seen.has(k)){while(cells[free])free++;cells[free]=k;seen.add(k);}while(cells.length&&!cells.at(-1))cells.pop();data.layouts[key]=cells;return {version:1,cells};
 }
 function moveInventory(s,key,{from,to}){
  const ctx=context(s,key),layout=layoutFor(s,key);if(!ctx)return {ok:false,error:'Prometheus loadout unavailable.'};
  const valid=at=>at?.type==='cell'?Number.isInteger(at.index)&&at.index>=0&&at.index<100000:at?.type==='slot'&&Number.isInteger(at.index)&&at.index>=0&&at.index<(ctx.eq.slots[at.category]?.length||0);
  if(!valid(from)||!valid(to))return {ok:false,error:'Choose an inventory cell or a valid equipment mount.'};
  const source=from?.type==='cell'?layout.cells[from.index]:'equipment:'+ctx.eq.slots[from?.category]?.[from?.index];
  if(!source||from.key&&from.key!==source)return {ok:false,error:'That item has moved. Select it again.'};
  const id=source.startsWith('equipment:')?source.slice(10):null,item=s.shipEquipment.instances[id];
  if(item?.category==='weapon'&&(from.type==='slot'||to.type==='slot')){
   if(to.type==='slot'){
    if(to.category!=='weapon')return {ok:false,error:'Weapons belong in weapon mounts.'};
    const displaced=ctx.eq.slots.weapon[to.index],result=assign(s,key,to.index,id);
    if(result.ok&&key!=='combined'&&from.type==='slot'&&from.index!==to.index)s.prometheusLoadouts.plans[key].weapon[from.index]=displaced||null;
    return result;
   }
   const other=layout.cells[to.index],otherId=other?.startsWith('equipment:')?other.slice(10):null,replacement=s.shipEquipment.instances[otherId]?.category==='weapon'?otherId:null;
   const result=assign(s,key,from.index,replacement);if(result.ok){if(other&&!replacement){let free=0;while(layout.cells[free])free++;layout.cells[free]=other;}layout.cells[to.index]=source;}return result;
  }
  if(key!=='combined'&&(from.type==='slot'||to.type==='slot'))return {ok:false,error:'Fit shared systems from the Combined ship tab.'};
  return window.nativeShipEquipment.moveInventory(s,{from,to,layout});
 }
 function joined(s){const data=s.prometheusLoadouts;if(!data)return;s.shipEquipment.nextSlot=data.plans.combined.nextSlot||0;window.nativeWeaponLoadout.project(s);}
 window.nativePrometheusLoadouts=Object.freeze({supported,initialize,currentKey,loadoutFor,fitted,assign,context,layoutFor,moveInventory,joined,keys,types,names});
})();
