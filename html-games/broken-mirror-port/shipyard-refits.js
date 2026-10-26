/* Hull-local refits, Federation equipment and atomic outfitting settlement. */
(() => {
 'use strict';
 const upgrades=Object.freeze({
  cargo:{name:'Cargo expansion',detail:'+20% base cargo per level',points:1,max:3,price:1600,materials:{tritanium:8,deuranium:4}},
  hull:{name:'Ablative hull reinforcement',detail:'+15% base hull per level',points:2,max:3,price:2400,materials:{tritanium:14,deuranium:6}},
  shield:{name:'Shield grid reinforcement',detail:'+15% shield capacity per level',points:2,max:3,price:2600,materials:{trellium:14,dilithium:6}},
  weapon:{name:'Extra weapon hardpoint',detail:'+1 weapon slot per level',points:3,max:2,price:5500,materials:{tritanium:16,dilithium:14,gallicite:6}},
  dot:{name:'Extra Dot repair bay',detail:'+1 Dot slot per level; drone purchased separately',points:2,max:2,price:3600,materials:{tritanium:12,deuranium:8,dilithium:8}},
  engine:{name:'Impulse engine tuning',detail:'+8% flight speed and +1 weapon power per level',points:2,max:2,price:3000,materials:{gallicite:16,dilithium:8}},
  utility:{name:'Auxiliary systems bay',detail:'+1 ability slot',points:2,max:1,price:4200,materials:{gallicite:10,tritanium:12,dilithium:10}},
  drive:{name:'Advanced warp tuning',detail:'+12% warp speed and fuel efficiency per level',points:2,max:2,price:6800,materials:{benamite:4,gallicite:12,dilithium:12}}
 });
 const shields=[
  {id:'fed-standard',name:'Federation deflector Mk I',description:'Balanced deflector. Full base capacity; no refit points.',factor:1,regen:.012,delay:7,points:0,price:2200,materials:{trellium:8,tritanium:4}},
  {id:'fed-regenerative',name:'Regenerative deflector',description:'90% capacity. Recharges 3% per second after 4 seconds without a hit.',factor:.9,regen:.03,delay:4,points:2,price:7800,materials:{trellium:24,gallicite:12,dilithium:18}},
  {id:'fed-capacity',name:'High-capacity deflector',description:'150% capacity. Slow 0.6% recharge after a 10-second delay.',factor:1.5,regen:.006,delay:10,points:3,price:10500,materials:{trellium:34,tritanium:16,dilithium:24}},
  {id:'fed-adaptive',name:'Adaptive multiphasic deflector',description:'110% capacity. Shield absorbs 20% less damage from a repeated weapon family within 8 seconds. Hull is unaffected.',factor:1.1,regen:.015,delay:6,points:4,price:16000,materials:{trellium:40,benamite:6,gallicite:16,dilithium:32}}
 ].map(s=>Object.freeze({...s,category:'shield',shipyardOnly:true}));
 const weapons=[
  [1001,'Type VII Phaser Array',14,2,9,520,1,2200,{tritanium:4,dilithium:3},'Light, efficient beam array.'],
  [1002,'Type X Phaser Array',1,4,10,560,2,4600,{trellium:6,dilithium:6},'Balanced main battery with a broad firing arc.'],
  [1003,'Type XII Phaser Array',2,9,17,620,4,12500,{trellium:14,gallicite:8,dilithium:18},'Heavy long-range array; substantial power demand.'],
  [1004,'Pulse Phaser Cannons',9,3,3,400,3,8500,{tritanium:10,gallicite:8,dilithium:12},'Rapid forward pulses for close combat.'],
  [1005,'Phaser Turret',11,2,4,430,2,7800,{tritanium:8,gallicite:6,dilithium:10},'All-round defensive coverage.'],
  [1006,'Photon Torpedo Launcher',15,7,24,650,2,5200,{tritanium:8,dilithium:8},'Reliable guided antimatter torpedoes.'],
  [1007,'Quantum Torpedo Launcher',16,12,28,700,4,11000,{trellium:10,gallicite:8,dilithium:20},'High burst damage; longer reload.'],
  [1008,'Rapid Photon Launcher',15,4,8,560,3,9200,{tritanium:12,gallicite:8,dilithium:14},'Trades warhead yield for sustained fire.'],
  [1009,'Transphasic Torpedo Launcher',18,48,100,700,6,26000,{benamite:10,trellium:18,dilithium:42},'Experimental heavy launcher with a very long reload.']
 ].map(([id,name,visualId,damage,recharge,range,power,price,materials,description])=>Object.freeze({id,name,visualId,damage,recharge,range,power,price,materials,description,category:'weapon',shipyardOnly:true}));
 const models=new Map([...weapons,...shields].map(m=>[String(m.id),m]));
 const integer=n=>Math.max(0,Math.floor(Number(n)||0));
 const base=s=>window.nativeShipDefinitions.get(s.shipType??7);
 const levels=s=>s.shipRefit?.version===1&&Number(s.shipRefit.hullType)===Number(s.shipType)?s.shipRefit.levels||{}:{};
 const level=(s,k)=>Math.min(upgrades[k]?.max||0,integer(levels(s)[k]));
 function installedShield(s){const eq=s.shipEquipment;return models.get(String(eq?.instances[eq?.slots.shield?.[0]]?.modelId));}
 function budget(s){
  const d=base(s),tier=d.hull>=350||d.cargo>=400?2:d.hull>=130||d.cargo>=100?1:0,capacity=[8,12,16][tier];
  const legacy=Object.values(s.mineralUpgrades?.[s.shipType]||{}).reduce((a,n)=>a+2*Math.min(3,integer(n)),0);
  const used=legacy+Object.entries(upgrades).reduce((a,[k,u])=>a+level(s,k)*u.points,0)+(installedShield(s)?.points||0);
  return {total:Math.max(capacity,legacy),used,legacy,power:[7,11,16][tier]+level(s,'engine'),className:['Light','Cruiser','Capital'][tier]};
 }
 function slots(s,definition=base(s)){return {...definition.slots,weapon:definition.slots.weapon+level(s,'weapon'),repairDrone:definition.slots.repairDrone+level(s,'dot'),ability:definition.slots.ability+level(s,'utility')};}
 function stats(s,d){
  const shield=installedShield(s),own=s.shipRefit?.version===1&&Number(s.shipRefit.hullType)===Number(s.shipType);
  if(!own&&!shield)return d;
  const value={...d,slots:slots(s,d)};
  value.cargo+=Math.max(1,Math.round(base(s).cargo*.2))*level(s,'cargo');
  value.hull=Math.round(value.hull*(1+.15*level(s,'hull')));
  if(shield&&value.shields<=0)value.shields=Math.max(15,Math.round(value.hull*.3));
  value.shields=Math.round(value.shields*(1+.15*level(s,'shield'))*(shield?.factor||1));
  value.speedOrOtherStationValue*=1+.08*level(s,'engine');
  value.warpSpeedMultiplier=(value.warpSpeedMultiplier||1)*(1+.12*level(s,'drive'));
  value.antimatterUseOrPopulationEffect*=1+.12*level(s,'drive');
  return value;
 }
 function validateFit(s,{category,slot,modelId,fromSlot}){
  const eq=s.shipEquipment,b=budget(s),m=window.nativeShipEquipment.model(modelId);
  if(category==='shield'&&b.used-(installedShield(s)?.points||0)+(m?.points||0)>b.total)return {ok:false,error:'This deflector exceeds the hull refit budget. Remove a refit first.'};
  if(category==='weapon'){
   const replaced=eq?.instances[eq?.slots.weapon?.[slot]],otherPower=replaced?window.nativeShipEquipment.model(replaced.modelId)?.power||1:0;
   const power=(eq?.slots.weapon||[]).reduce((n,id,i)=>n+(i===slot?(m?.power||1):i===fromSlot?otherPower:(id?window.nativeShipEquipment.model(eq.instances[id]?.modelId)?.power||1:0)),0);
   if(power>b.power)return {ok:false,error:`Weapons need ${power} power; this hull supplies ${b.power}. Fit a lighter weapon or tune the engines.`};
  }
  return {ok:true};
 }
 const docked=s=>s.shipyardDock?.phase==='docked'&&(window.VexedMirrorWorld?.shipyards||[{id:'mars-earth-shipyard-01',system:1}]).some(y=>y.id===s.shipyardDock.station&&y.system===Number(s.system));
 function quote(s,kind){
  const u=upgrades[kind];if(!u)return null;
  const current=level(s,kind),factor=current+1,b=budget(s);
  return {...u,kind,level:current,price:u.price*factor,materials:Object.fromEntries(Object.entries(u.materials).map(([k,n])=>[k,n*factor])),allowed:current<u.max&&b.used+u.points<=b.total};
 }
 function atomic(s,action,save){
  if(!docked(s))return {ok:false,error:'Complete docking at a shipyard first.'};
  const fields=['latinum','dilithium','minerals','shipyardLedger','shipRefit','shipEquipment','weaponLoadout','weapons','weaponInventory','repairBay','miningTool','hull','shields','inventoryLayout'];
  const snapshot=JSON.stringify(Object.fromEntries(fields.filter(k=>Object.hasOwn(s,k)).map(k=>[k,s[k]])));
  try{
   const result=action();if(!result.ok)throw Error(result.error);
   const saved=(save||(()=>window.nativeSaveStorage.write(s)))();if(!saved?.ok)throw Error(saved?.error||'Save failed. Purchase cancelled.');
   window.nativeShipSystems?.invalidate(s);return result;
  }catch(e){for(const key of fields)delete s[key];Object.assign(s,JSON.parse(snapshot));window.nativeShipEquipment.ensure(s);window.nativeShipSystems?.invalidate(s);return {ok:false,error:e.message};}
 }
 function charge(s,offer){
  const held=k=>window.nativeRegionalMinerals.held(s,k);
  if(integer(s.latinum)<offer.price||Object.entries(offer.materials||{}).some(([k,n])=>held(k)<n))return {ok:false,error:'Not enough latinum or materials for this purchase.'};
  s.latinum-=offer.price;s.shipyardLedger||={latinum:0,materials:{}};s.shipyardLedger.latinum+=offer.price;
  for(const [k,n] of Object.entries(offer.materials||{})){if(k==='dilithium')s.dilithium=held(k)-n;else{s.minerals||={};s.minerals[k]=held(k)-n;}s.shipyardLedger.materials[k]=(s.shipyardLedger.materials[k]||0)+n;}
  return {ok:true};
 }
 const bayKind=kind=>({weapon:'weapon',dot:'repairDrone',utility:'ability'})[kind];
 function preview(s,kind){
  const q=quote(s,kind);if(!q)return null;
  const draft={...s,shipRefit:{version:1,hullType:s.shipType,levels:{...levels(s),[kind]:q.level+1}}},category=bayKind(kind);
  return {quote:q,before:window.nativeShipDefinitions.forEntity(s),after:window.nativeShipDefinitions.forEntity(draft),budgetBefore:budget(s),budgetAfter:budget(draft),
   newBay:category&&q.level<q.max?{category,index:window.nativeShipEquipment.capacities(s)[category]}:null};
 }
 function upgrade(s,kind,save,placement){return atomic(s,()=>{
  const q=quote(s,kind);if(!q?.allowed)return {ok:false,error:'Hull limit or shared refit budget reached.'};
  const paid=charge(s,q);if(!paid.ok)return paid;
  const before=window.nativeShipDefinitions.forEntity(s),category=bayKind(kind),index=category?window.nativeShipEquipment.capacities(s)[category]:null;
  if(s.shipRefit?.version!==1||s.shipRefit.hullType!==s.shipType)s.shipRefit={version:1,hullType:s.shipType,levels:{}};
  s.shipRefit.levels[kind]=q.level+1;window.nativeShipEquipment.ensure(s);
  if(placement){if(!category)return {ok:false,error:'This upgrade does not add an equipment bay.'};const placed=window.nativeShipEquipment.placeBay(s,{...placement,category,index});if(!placed.ok)return placed;}
  const after=window.nativeShipDefinitions.forEntity(s);
  // Preserve damage fraction; installing capacity cannot act as a free repair.
  s.hull=Math.min(after.hull,(Number(s.hull)||0)*after.hull/Math.max(1,before.hull));
  s.shields=Math.min(after.shields,(Number(s.shields)||0)*after.shields/Math.max(1,before.shields));
  return {ok:true,message:q.name+' installed.'};
 },save);}
 function remove(s,kind,save){return atomic(s,()=>{
  if(!level(s,kind))return {ok:false,error:'No refit installed.'};
  const before=window.nativeShipDefinitions.forEntity(s);s.shipRefit.levels[kind]--;
  const after=window.nativeShipDefinitions.forEntity(s),eq=window.nativeShipEquipment.ensure(s);
  if(after.cargo<before.cargo&&window.nativeShipEquipment.cargoUsed(s)>after.cargo)return {ok:false,error:'Unload cargo before removing this expansion.'};
  if(Object.values(eq.instances).some(i=>i.category==='repairDrone'&&!['stowed','destroyed'].includes(i.phase)))return {ok:false,error:'Recover deployed Dots before refitting.'};
  if(budget(s).used>budget(s).total)return {ok:false,error:'The installed deflector still exceeds this budget.'};
  const power=eq.slots.weapon.reduce((n,id)=>n+(id?window.nativeShipEquipment.model(eq.instances[id]?.modelId)?.power||1:0),0);
  if(power>budget(s).power)return {ok:false,error:'Fit lower-power weapons before removing engine tuning.'};
  s.hull=Math.min(after.hull,(Number(s.hull)||0)*after.hull/Math.max(1,before.hull));s.shields=Math.min(after.shields,Number(s.shields)||0);
  return {ok:true,message:'Refit removed. Overflow equipment is retained in your locker. Materials are not refunded.'};
 },save);}
 function buy(s,id,save){return atomic(s,()=>{
  const offer=models.get(String(id))||(id==='basic-dot'?window.nativeShipEquipment.model(id):null);if(!offer)return {ok:false,error:'Unknown Federation equipment.'};
  const paid=charge(s,offer);if(!paid.ok)return paid;const result=window.nativeShipEquipment.grant(s,offer.id);
  return {...result,message:offer.name+' added to your locker. Fit it in Current Build.'};
 },save);}
 function fit(s,id,slot,save){return atomic(s,()=>{
  const eq=window.nativeShipEquipment.ensure(s),item=eq.instances[id],index=eq.locker.indexOf(id);
  if(!item||index<0)return {ok:false,error:'Choose owned equipment in your locker.'};
  const result=window.nativeShipEquipment.move(s,{category:item.category,fromType:'locker',fromIndex:index,toType:'slot',toIndex:Number(slot)});
  if(result.ok)s.shields=Math.min(Number(s.shields)||0,window.nativeShipDefinitions.forEntity(s).shields);
  return {...result,message:'Equipment fitted. Displaced equipment is retained in your locker.'};
 },save);}
 function unfit(s,kind,slot,save){return atomic(s,()=>{
  const eq=window.nativeShipEquipment.ensure(s);return window.nativeShipEquipment.move(s,{category:kind,fromType:'slot',fromIndex:Number(slot),toType:'locker',toIndex:eq.locker.length});
 },save);}
 function advance(s,dt){
  const shield=installedShield(s);if(!shield||s.hull<=0||s.phase==='disabled')return;
  const now=window.nativeSimulation.seconds(s),last=Number(s.shieldResponse?.lastHit??-Infinity);
  if(now-last>=shield.delay){const max=window.nativeShipDefinitions.forEntity(s).shields;s.shields=Math.min(max,(Number(s.shields)||0)+max*shield.regen*dt);}
 }
 function shieldHit(s,amount,impact,state=s){
  const shield=installedShield(s);if(!shield)return amount;
  const now=window.nativeSimulation.seconds(state),family=impact.weaponKind||impact.kind||'unknown',previous=s.shieldResponse;
  if(amount<=0||impact.physicalContact||!['beam','disruptor','torpedo'].includes(family))return amount;
  const adapted=shield.id==='fed-adaptive'&&family!=='unknown'&&previous?.family===family&&now-previous.lastHit<=8;
  s.shieldResponse={lastHit:now,family};return adapted?Math.max(0,amount-Math.min(amount,Math.max(0,Number(s.shields)||0)/.8)*.2):amount;
 }
 window.nativeShipyardRefits=Object.freeze({upgrades,weapons,shields,model:id=>models.get(String(id)),level,budget,slots,stats,quote,preview,validateFit,docked,upgrade,remove,buy,fit,unfit,advance,shieldHit,
  canMineralUpgrade:s=>budget(s).used+2<=budget(s).total});
})();
