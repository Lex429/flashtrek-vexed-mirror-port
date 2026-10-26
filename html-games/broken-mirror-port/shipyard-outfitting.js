/* Visual shipyard pages; authoritative refits and fitting stay with their owners. */
(() => {
 'use strict';
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
 const view=()=>window.nativeOutfittingView,r=()=>window.nativeShipyardRefits;
 const enough=(s,q)=>Number(s.latinum)>=q.price&&Object.entries(q.materials||{}).every(([k,n])=>window.nativeRegionalMinerals.held(s,k)>=n);
 function change(p,kind){
  const keys={cargo:['cargo','t cargo'],hull:['hull','hull'],shield:['shields','shields'],engine:['speedOrOtherStationValue','flight speed'],drive:['warpSpeedMultiplier','× warp speed']},key=keys[kind];
  if(key)return {before:p.before[key[0]]??(kind==='drive'?1:0),after:p.after[key[0]]??(kind==='drive'?1:0),unit:key[1]};
  const category=p.newBay?.category||({weapon:'weapon',dot:'repairDrone',utility:'ability'})[kind];
  return {before:p.before.slots[category],after:p.after.slots[category],unit:({weapon:'weapon slots',dot:'Dot bays',utility:'ability bays'})[kind]};
 }
 function draft(s,preview,placement){
  const b=preview?.newBay;if(!b||preview.quote.level>=preview.quote.max)return null;
  const limits={...window.nativeShipEquipment.capacities(s),[b.category]:b.index+1},layout=window.nativeShipEquipment.bayLayout(s,limits),bay=layout.bays.find(item=>item.category===b.category&&item.index===b.index);
  return {...b,zone:bay.zone,cell:placement?.cell??bay.cell,chosen:!!placement};
 }
 function confirmation(s,preview,placement){
  if(!preview)return '';
  const q=preview.quote,c=change(preview,q.kind),bay=preview.newBay,available=q.allowed&&enough(s,q)&&(!bay||!!placement);
  const reason=q.level>=q.max?'This hull has reached this upgrade’s level limit.':!q.allowed?'This exceeds your shared refit budget. Remove another refit to make room.':!enough(s,q)?'The marked materials are below the required amount.':bay&&!placement?'Choose a highlighted mount beside your ship before purchasing.':'';
  return `<section class="yard-upgrade-preview" aria-label="Selected upgrade"><div class="yard-preview-heading">${view().icon(q.kind)}<div><small>UPGRADE PREVIEW</small><h2>${safe(q.name)}</h2></div><button data-yard-action="cancel-preview" aria-label="Cancel upgrade preview">×</button></div><p>${safe(q.detail)}</p><div class="yard-change" data-upgrade-change="${q.kind}"><strong>${fmt(c.before)}</strong><span aria-hidden="true">→</span><strong>${fmt(c.after)}</strong><small>${safe(c.unit)}</small></div><div class="yard-preview-limits"><span>Level ${q.level} → ${Math.min(q.max,q.level+1)} / ${q.max}</span><span>Refit ${preview.budgetBefore.used} → ${preview.budgetAfter.used} / ${preview.budgetBefore.total}</span></div>${view().cost(s,q)}${bay?`<p class="yard-placement-help">${placement?`Selected mount ${placement.cell+1} in your ${bay.category==='repairDrone'?'Dot bay':bay.category==='weapon'?'weapon':'systems'} area. This is where the bay will appear in Inventory.`:'Click a cyan mount on your ship layout to place the new bay. Existing equipment stays in position.'}</p>`:''}<p class="yard-preview-reason" role="status">${safe(reason||'Ready to install. Your resources are charged only when you confirm.')}</p><button class="yard-primary" data-yard-action="confirm-upgrade" ${available?'':'disabled'}>${bay?'Buy & place bay':'Install upgrade'}</button><button class="yard-cancel-preview" data-yard-action="cancel-preview">Cancel</button></section>`;
 }
 function upgrades(s,selection,placement){
  const active=selection?r().preview(s,selection):null;
  return `${confirmation(s,active,placement)}<p class="yard-intro">Select an upgrade to see exact changes before buying. All refits share this hull’s budget.</p><div class="yard-list">${Object.entries(r().upgrades).map(([kind,u])=>{
   const p=r().preview(s,kind),q=p.quote,c=change(p,kind);
   return `<article class="yard-offer yard-upgrade${selection===kind?' selected':''}" data-upgrade-card="${kind}"><span class="yard-offer-symbol">${view().icon(kind)}</span><div><strong>${safe(u.name)} <small>${q.level} / ${q.max}</small></strong><p class="yard-spec">${q.level>=q.max?`${fmt(c.before)} ${safe(c.unit)} · Maximum level`:`${fmt(c.before)} → ${fmt(c.after)} ${safe(c.unit)}`} · ${u.points} refit points</p>${view().cost(s,q,{compact:true})}</div><div class="yard-actions"><button data-yard-action="upgrade" data-kind="${kind}" aria-pressed="${selection===kind}">Preview</button>${q.level?`<button data-yard-action="remove" data-kind="${kind}" class="yard-subtle" title="Remove one level; materials are not refunded">Remove</button>`:''}</div></article>`;
  }).join('')}</div>`;
 }
 function shop(s,tab){
  const offers=tab==='weapons'?[...r().weapons,window.nativeShipEquipment.model('basic-dot')]:r().shields;
  return `<p class="yard-intro">Purchases go to your locker. Fit them in Current Build. ${tab==='weapons'?`This hull supplies ${r().budget(s).power} weapon power.`:'Advanced deflectors use refit points when fitted.'}</p><div class="yard-list">${offers.map(m=>`<article class="yard-offer"><span class="yard-offer-symbol">${view().art(m)}</span><div><strong>${safe(m.name)}</strong><p>${safe(m.description||'Fit to a Dot repair bay. The drone and its bay are separate purchases.')}</p>${m.damage!==undefined?`<p class="yard-spec">${m.damage} damage · ${m.range} range · ${(m.recharge/13).toFixed(2)}s recharge · ${m.power} power</p>`:m.factor?`<p class="yard-spec">${m.points} refit points · ${Math.round(m.factor*100)}% shield capacity</p>`:''}${view().cost(s,m,{compact:true})}</div><button data-yard-action="buy" data-model="${m.id}" ${enough(s,m)?'':'disabled'}>Buy</button></article>`).join('')}</div>`;
 }
 function materials(s){
  const uses={trellium:'Shield grids and advanced deflectors',tritanium:'Hull plating, cargo frames and weapon mounts',dilithium:'Extra bays, weapon systems and advanced shields',gallicite:'Impulse engines, weapon conduits and utility systems',benamite:'Advanced warp drives and adaptive technology',deuranium:'Hull work, cargo frames and Dot bays'};
  return `<p class="yard-intro">Mine deposits to supply your build. Dilithium uses your strategic reserves; other raw ores use cargo space.</p><div class="yard-list">${Object.entries(window.nativeRegionalMinerals.ores).map(([key,o])=>`<article class="yard-offer yard-mineral-row"><span class="yard-offer-symbol">${view().mineralIcon(key)}</span><div><strong>${safe(o.name)}</strong><p>${safe(uses[key]||o.use)}</p></div><strong>${fmt(window.nativeRegionalMinerals.held(s,key))}<small> AVAILABLE</small></strong></article>`).join('')}</div>`;
 }
 function build(s,eq,selectedItem,selectedBay){
  const item=selectedBay?eq.instances[eq.slots[selectedBay.category]?.[selectedBay.index]]:null,model=item?window.nativeShipEquipment.model(item.modelId):null;
  const selected=model?`<section class="yard-upgrade-preview"><div class="yard-preview-heading"><span class="yard-offer-symbol">${view().art(model)}</span><div><small>${safe(view().labels[selectedBay.category])} ${selectedBay.index+1}</small><h2>${safe(model.name)}</h2></div></div><p>${safe(model.description||'Owned equipment fitted to this bay.')}</p><button data-yard-action="unfit" data-kind="${selectedBay.category}" data-slot="${selectedBay.index}">Store in locker</button></section>`:'';
  return `${selected}<p class="yard-intro">${selectedItem?'Choose a compatible bay highlighted on your ship to fit this item.':'Click a bay on your ship to inspect its equipment. Choose a locker item to fit it.'}</p><div class="yard-section-caption">EQUIPMENT LOCKER <span>${eq.locker.length} items</span></div><div class="yard-list">${eq.locker.map(id=>{
   const instance=eq.instances[id],m=window.nativeShipEquipment.model(instance.modelId);
   return `<article class="yard-locker-item${selectedItem===id?' selected':''}"><span class="yard-offer-symbol">${view().art(m)}</span><div><strong>${safe(m?.name||instance.modelId)}</strong><p>${safe(view().labels[instance.category])}${m?.power?` · ${m.power} weapon power`:''}</p><div class="yard-fitting"><button data-yard-action="choose-equipment" data-instance="${safe(id)}" aria-pressed="${selectedItem===id}">Choose bay</button><select aria-label="Bay for ${safe(m?.name||instance.modelId)}" data-yard-slot="${safe(id)}">${(eq.slots[instance.category]||[]).map((_,i)=>`<option value="${i}">${safe(view().labels[instance.category])} ${i+1}</option>`).join('')}</select><button data-yard-action="fit" data-instance="${safe(id)}" ${(eq.slots[instance.category]||[]).length?'':'disabled'}>Fit</button></div></div></article>`;
  }).join('')||'<p class="yard-muted">Your locker is empty. Purchased weapons, shields and Dots appear here.</p>'}</div>`;
 }
 function render(s,{tab,selection=null,placement=null,highlight=null,selectedItem=null,selectedBay=null}={}){
  const ship=window.nativeShipDefinitions.forEntity(s),eq=window.nativeShipEquipment.ensure(s),p=tab==='upgrades'&&selection?r().preview(s,selection):null,d=draft(s,p,placement),chosen=eq.instances[selectedItem];
  const summary=tab==='upgrades'&&selection?change(p,selection):null;
  const content=tab==='upgrades'?upgrades(s,selection,placement):tab==='weapons'||tab==='shields'?shop(s,tab):tab==='materials'?materials(s):build(s,eq,selectedItem,selectedBay);
  return `<div class="yard-workspace"><section class="yard-vessel" aria-label="Your ship and Inventory bay layout"><div class="yard-vessel-title"><div><small>YOUR SHIP</small><h2>${safe(s.shipName||ship.name)}</h2></div><span>${safe(ship.name)}</span></div>${view().rig(s,ship,eq,{draft:d,highlight,renderSlot:(kind,id,index)=>view().slot(s,ship,eq,kind,id,index,{selected:selectedBay?.category===kind&&selectedBay.index===index,compatible:chosen?.category===kind})})}<div class="yard-build-stats">${[['hull','HULL',ship.hull],['shield','SHIELDS',ship.shields],['cargo','CARGO',ship.cargo],['engine','FLIGHT SPEED',ship.speedOrOtherStationValue]].map(([kind,label,n])=>`<span class="${selection===kind?'previewing':''}">${label}<strong>${fmt(n)}${kind==='cargo'?' t':''}${selection===kind&&summary?` <i>→ ${fmt(summary.after)}</i>`:''}</strong></span>`).join('')}</div><p class="yard-schematic-note">${d?'Highlighted mounts are available positions. Select one, then confirm your purchase.':'This is your Inventory layout. Bay positions are shared between both screens.'}</p></section><section class="yard-catalog" aria-label="${safe(tab)}">${content}</section></div>`;
 }
 window.nativeShipyardOutfitting=Object.freeze({render,draft,change});
})();
