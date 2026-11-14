/* Shared equipment inspector, hull tile and input adapters. Transactions stay
   in the Inventory bridge and shared equipment/repair owners. */
(() => {
 'use strict';
 const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=value=>Math.max(0,Number(value)||0).toLocaleString(undefined,{maximumFractionDigits:3});
 let actions=null;
 function inspect(state,ship,eq,{selection=null,fitIndex=0,note='',tiles=new Map(),prefix='inventory'}={}){
  function html(){
    const selected=selection,instance=selected?.key?.startsWith('equipment:')?eq.instances[selected.key.slice(10)]:null,data=window.nativeShipEquipment.model(instance?.modelId),tile=tiles.get(selected?.key);
    if(selected?.type==='hull'){
      const thrusters=ship.thrusters;
      const rows=[['Emergency speed',fmt(thrusters.maxSpeed)],['Acceleration',fmt(thrusters.acceleration)],['Braking',fmt(thrusters.braking)],['Turn rate',fmt(thrusters.turnRate*180/Math.PI)+'°/s']];
      return `<section id="${safe(prefix)}-thruster-details" class="inventory-inspector has-selection" aria-label="Thruster details"><div class="inventory-detail-heading"><span class="inventory-detail-art">${window.nativeOutfittingView.icon('thrusters')}</span><div><span>BUILT-IN HULL SYSTEM</span><strong>Thrusters · Mk ${thrusters.level+1}</strong></div></div><p>Permanent maneuvering thrusters provide controlled flight when the main engine fails or is removed.</p><div class="inventory-detail-stats">${rows.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="inventory-detail-actions"><p>Upgrade at Port Shop → Services or a docked shipyard's Ship Upgrades.</p><button type="button" data-equipment-action="cancel">Close details</button></div></section>`;
    }
    if(!selected)return `<section class="inventory-inspector" aria-label="Item details"><div><span>SHIP DETAILS</span><strong>Built-in thrusters · Mk ${ship.thrusters.level+1}</strong><p>Emergency speed ${fmt(ship.thrusters.maxSpeed)}. Permanent hull system; upgrade at docking stations.</p><strong>Select an item to inspect</strong><p>Compare equipment, choose a bay, then Equip. Drag to fit or arrange directly.</p></div></section>`;
    const name=data?.name||tile?.name||instance?.modelId||'Item',stored=selected.type==='cell',slots=eq.slots[instance?.category]||[];
    fitIndex=Math.max(0,Math.min(fitIndex,slots.length-1));
    let detail='',rows=[],allowed={ok:true};
    if(instance&&data){
      const draft={...state,shipEquipment:{...eq,slots:{...eq.slots,[instance.category]:slots.map((id,i)=>i===fitIndex?instance.id:id)}}};
      const after=window.nativeShipDefinitions.forEntity(draft),before=ship;
      const stat=(label,value,old,unit='',lower=false)=>{const delta=Number(value)-Number(old);return `<div><span>${safe(label)}</span><strong>${fmt(value)}${safe(unit)}</strong>${stored&&Number.isFinite(delta)&&Math.abs(delta)>.0001?`<small class="${delta*(lower?-1:1)>0?'positive':'negative'}">${delta>0?'+':''}${Number(delta.toFixed(3)).toLocaleString()}${safe(unit)} vs fitted</small>`:''}</div>`;};
      const current=window.nativeShipEquipment.model(eq.instances[slots[fitIndex]]?.modelId);
      if(instance.category==='weapon'){
        const spec=model=>window.nativeWeaponRules.weaponSpec(model,window.nativeCombatShots.weaponVisual(model).kind,{damageMultiplier:ship.weaponDamageMultiplier||1}),next=spec(data),old=current?spec(current):{damage:0,range:0,recharge:0};
        rows=[stat('Damage',next.damage,old.damage),stat('Range',next.range,old.range),stat('Recharge',next.recharge,old.recharge,' s',true)];
      }else if(instance.category==='engineering')rows=[stat('Top speed',after.movement.maxSpeed,before.movement.maxSpeed),stat('Acceleration',after.movement.acceleration,before.movement.acceleration)];
      else if(instance.category==='shield'){rows=[stat('Shield capacity',after.shields,before.shields)];if(data.regen)rows.push(stat('Recharge / second',after.shields*data.regen,undefined));}
      else if(instance.category==='repairDrone')rows=[stat('Drone hull',instance.hull,data.hull||40),`<div><span>State</span><strong>${safe(instance.phase)}</strong></div>`];
      detail=data.description||(instance.category==='ability'?'Utility equipment for a compatible ability bay.':'Drag into a compatible bay or use the fitting controls.');
      if(stored)allowed=slots.length?(window.nativeShipyardRefits?.validateFit(state,{category:instance.category,slot:fitIndex,modelId:instance.modelId})||allowed):{ok:false,error:'This hull has no compatible bays.'};
      if(instance.category==='repairDrone'&&!['stowed','destroyed'].includes(instance.phase))allowed={ok:false,error:'Recover deployed drones before changing equipment.'};
    }else if(instance){allowed={ok:false,error:'Legacy equipment remains in storage; this model cannot be fitted.'};}
    else if(tile){
      const key=selected.key.split(':').slice(1).join(':');detail=selected.key.startsWith('mineral:')?window.nativeRegionalMinerals.ores[key]?.use||'Raw mineral cargo.':selected.key.startsWith('contract:')?'Contract cargo: deliver it to its destination to receive payment.':'Ship supply or trade cargo. Drag to arrange its saved position.';
      const value=selected.key.startsWith('mineral:')?state.minerals[key]:selected.key.startsWith('freight:')?state.solFreightHold[key]:state[key];
      if(value!==undefined)rows=[`<div><span>Quantity</span><strong>${fmt(value)}${selected.key.startsWith('freight:')?' t':''}</strong></div>`];
    }
    const condition=window.nativeShipEquipment.condition(instance),repair=condition!==null?window.nativeShipRepairs.deviceRepairQuote(state,instance.id):null;
    if(repair){
      rows.unshift(`<div><span>Device condition</span><strong>${fmt(condition)}%${condition===0?' · OFFLINE':''}</strong></div>`);
      detail+=' Combat damages this device. Repair it with '+(instance.category==='shield'?'Trellium ore; fitted repairs also restore shield energy.':'Gallicite ore to restore speed and thrust.');
    }
    const repairControl=repair?`<div class="inventory-device-repair"><div class="inventory-device-cost">${window.nativeOutfittingView.material(repair.currency,repair.cost,{held:repair.held})}${state.devMode?'<small>Free in Dev mode</small>':''}</div><button type="button" data-repair-device="${safe(instance.id)}" data-focus-key="repair-device" aria-describedby="${safe(prefix)}-device-repair-status" ${repair.ok?'':'disabled'}>Repair device</button><p id="${safe(prefix)}-device-repair-status" role="status">${safe(note||(repair.ok?(repair.maximum>0?'Restore condition and shield protection.':'Restore device condition.'):repair.error))}</p></div>`:'';
    return `<section class="inventory-inspector has-selection" aria-label="Item details"><div class="inventory-detail-heading"><span class="inventory-detail-art">${data?window.nativeOutfittingView.art(data):tile?.html.match(/<span class="inventory-item-icon">(.*?)<\/span>/)?.[1]||''}</span><div><span>${instance?(stored?'STORED EQUIPMENT':'INSTALLED EQUIPMENT'):'CARGO DETAILS'}</span><strong>${safe(name)}</strong></div></div><p>${safe(detail)}</p><div class="inventory-detail-stats">${rows.join('')}</div>${instance?`<div class="inventory-detail-actions">${repairControl}${stored?`<label>Fit into<select data-fit-slot data-focus-key="fit-slot" aria-label="Equipment destination bay">${slots.map((id,index)=>`<option value="${index}" ${index===fitIndex?'selected':''}>${safe(window.nativeOutfittingView.labels[instance.category]||'Bay')} ${index+1} — ${safe(window.nativeShipEquipment.model(eq.instances[id]?.modelId)?.name||'Empty')}</option>`).join('')}</select></label><button type="button" data-equipment-action="equip" ${allowed.ok?'':'disabled'}>Equip${slots[fitIndex]?' / Replace':''}</button>`:`<button type="button" data-equipment-action="unequip" ${allowed.ok?'':'disabled'}>Unequip</button>`}<button type="button" data-equipment-action="cancel">Cancel</button></div>${!allowed.ok?`<p role="status">${safe(allowed.error)}</p>`:''}`:'<button type="button" data-equipment-action="cancel">Cancel selection</button>'}</section>`;

  }
  const output=html();return {html:output,fitIndex};
 }
 function hullSystem(ship,selected=false){const thrusters=ship.thrusters,hullSelected=selected;return `<button type="button" class="inventory-hull-system${hullSelected?' selected':''}" data-hull-system="thrusters" data-focus-key="hull-thrusters" draggable="false" aria-pressed="${hullSelected}" aria-label="Built-in thrusters Mk ${thrusters.level+1}, emergency speed ${fmt(thrusters.maxSpeed)}"><span class="inventory-hull-system-label">BUILT-IN HULL SYSTEM</span><span class="inventory-system-icon">${window.nativeOutfittingView.icon('thrusters')}</span><span class="inventory-hull-system-info"><strong>Thrusters <b>Mk ${thrusters.level+1}</b></strong><small>Emergency speed <em>${fmt(thrusters.maxSpeed)}</em></small></span></button>`;}
 function location(node){return node.hasAttribute('data-inventory-cell')?{type:'cell',index:Number(node.dataset.inventoryCell),key:node.dataset.itemKey,category:node.dataset.equipmentKind}:{type:'slot',category:node.dataset.equipmentKind,index:Number(node.dataset.equipmentIndex),key:node.dataset.itemKey};}
 const canDrop=(from,to)=>!!from&&from.type!=='hull'&&(to.type==='cell'||!!from.category&&from.category===to.category);
 function bindTargets(root,options){
  const clear=()=>root.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));
  const highlight=()=>root.querySelectorAll('[data-equipment-place="slot"]').forEach(n=>n.classList.toggle('compatible',!!options.getSelection()?.category&&n.dataset.equipmentKind===options.getSelection().category));
  root.querySelectorAll('[data-inventory-cell],[data-equipment-place="slot"]').forEach(node=>{
   node.onclick=event=>{if(options.stopPropagation)event.stopPropagation();if(options.suppressed?.())return;const to=location(node),selected=options.getSelection();if(!to.key&&selected&&selected.type!=='hull'){options.transfer(selected,to);return;}if(to.key)options.choose(selected?.key===to.key?null:to);};
   node.draggable=!!node.dataset.itemKey;
   node.ondragstart=event=>{options.dragState?.(true);options.setSelection(location(node));event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',JSON.stringify(options.getSelection()));node.classList.add('drag-source');highlight();};
   node.ondragover=event=>{if(canDrop(options.getSelection(),location(node))){event.preventDefault();event.dataTransfer.dropEffect='move';node.classList.add('drop-target');}};
   node.ondragleave=()=>node.classList.remove('drop-target');
   node.ondragend=()=>{options.dragState?.(false);root.dataset.dragging='false';clear();node.classList.remove('drag-source');if(options.getSelection())options.render();};
   node.ondrop=event=>{event.preventDefault();event.stopPropagation();clear();try{options.transfer(JSON.parse(event.dataTransfer.getData('text/plain')),location(node));}catch{options.reject('Pick up an item from your inventory or ship bays.');}};
  });
 }
 function measureRows(rig,fallback=4,rowHeight=null){
  if(!rig?.getClientRects().length||!(rig.clientHeight>0))return fallback;
  const banks=[...rig.querySelectorAll('.inventory-weapons,.inventory-systems')],slot=rig.querySelector('.inventory-slot,.outfit-mount'),gap=parseFloat(getComputedStyle(banks[0]).gap)||0;
  const height=Math.min(...banks.map(b=>{const css=getComputedStyle(b);return b.clientHeight-(parseFloat(css.paddingTop)||0)-(parseFloat(css.paddingBottom)||0)-(b.querySelector('[data-hull-system]')?.offsetHeight||0)-(b.querySelector('[data-hull-system]')?gap:0);}));
  return Math.max(1,Math.min(6,Math.floor((height+gap)/((rowHeight??slot?.offsetHeight??68)+gap))));
 }
 function bayPages(bays,rows,page=0){
  const pages=Math.max(1,...['weapons','systems','drones'].map(zone=>Math.ceil(Math.max(0,...bays.filter(b=>b.zone===zone).map(b=>b.cell+1))/(zone==='drones'?6:rows))));page=Math.max(0,Math.min(page,pages-1));
  return {page,pages,html:`<nav class="inventory-bay-pages" aria-label="Equipment bay pages" ${pages>1?'':'hidden'}><button type="button" data-bay-page="previous" ${page===0?'disabled':''} aria-label="Previous equipment bays">&lsaquo;</button><span>Bays ${page+1} / ${pages}</span><button type="button" data-bay-page="next" ${page>=pages-1?'disabled':''} aria-label="Next equipment bays">&rsaquo;</button></nav>`};
 }
 const equipmentContents=(instance,data)=>`<span class="inventory-item-icon">${window.nativeOutfittingView.art(data)}</span>${window.nativeOutfittingView.deviceCondition(instance)}<span class="inventory-item-name">${safe(data?.name||instance.modelId)}</span>`;
 function action(state,name,value){if(!actions||actions.getState()!==state)return {ok:false,error:'The active ship has changed. Reopen this screen.'};return name==='move'?actions.moveInventory(value):actions.repairDevice(value);}
 function createShipyard({root,getState,render}){
  let selection=null,fitIndex=0,note='',page=0,rows=1,lockerPage=0,draftKey='',frame=0,touch=null,suppressed=0,measurementKey='',rowHeight=58,activeDraft=null;
  const equipment=()=>window.nativeShipEquipment;
  const reveal=bay=>{if(bay)page=Math.floor(bay.cell/(bay.zone==='drones'?6:rows));};
  const cancel=()=>{selection=null;note='';render();};
  function choose(value){selection=value;note='';if(value?.category){const eq=equipment().ensure(getState());fitIndex=Math.max(0,eq.slots[value.category]?.findIndex(id=>!id)??0);}render();}
  function transfer(from,to){
   const result=action(getState(),'move',{from,to});note=result?.ok?(result.saved===false?'Item moved, but saving failed. Use Save to try again.':to.type==='slot'?'Equipment installed.':from.type==='slot'?'Equipment removed and stored.':'Item moved.'):(result?.error||'Unable to move that item.');
   if(result?.ok){selection=null;if(to.type==='slot')reveal(equipment().bayLayout(getState()).bays.find(b=>b.category===to.category&&b.index===to.index));}
   render();window.nativeMenuSounds?.inventory(result?.ok?(to.type==='slot'?'equip':'unequip'):'reject');
   const target=to.type==='slot'?root.querySelector(`[data-equipment-kind="${to.category}"][data-equipment-index="${to.index}"]`):root.querySelector(`[data-inventory-cell="${to.index}"]`);
   target?.focus({preventScroll:true});if(target&&!matchMedia('(prefers-reduced-motion: reduce)').matches)target.animate([{outline:'2px solid transparent'},{outline:`2px solid ${result?.ok?'#9de4c9':'#edaa91'}`},{outline:'2px solid transparent'}],{duration:360});
  }
  function bays(state,eq,draft){
   activeDraft=draft;
   const limits={...equipment().capacities(state)};if(draft)limits[draft.category]++;
   const layout=equipment().bayLayout(state,limits),list=layout.bays.map(b=>({...b}));
   if(draft){const ghost=list.find(b=>b.category===draft.category&&b.index===draft.index);if(ghost)ghost.cell=draft.cell;
    const key=[draft.category,draft.index,draft.cell,draft.chosen,rows].join(':');if(key!==draftKey)reveal(ghost);draftKey=key;
    for(const zone of Object.keys(layout.zones))if(zone===draft.zone)list.push({zone,cell:layout.zones[zone].count-1});
   }else draftKey='';
   const result=bayPages(list,rows,page);page=result.page;return {...result,rows};
  }
  function locker(state,eq){
   const cells=equipment().inventoryLayout(state).cells,items=cells.flatMap((key,index)=>key?.startsWith('equipment:')?[{key,index,instance:eq.instances[key.slice(10)]}]:[]),size=root.querySelector('.yard-catalog')?.clientWidth>=600?8:4,pages=Math.max(1,Math.ceil(items.length/size));lockerPage=Math.max(0,Math.min(lockerPage,pages-1));
   return `<div class="yard-equipment-locker"><div class="yard-equipment-title"><h2>Equipment locker</h2><span>${items.length} items</span></div><p>Select to inspect. Drag to fit or swap.</p><div class="yard-locker-grid">${items.slice(lockerPage*size,(lockerPage+1)*size).map(({key,index,instance})=>`<button type="button" class="inventory-cell ${selection?.key===key?'selected':''}" data-inventory-cell="${index}" data-item-key="${safe(key)}" data-equipment-kind="${instance.category}" data-focus-key="cell-${index}" aria-label="${safe(equipment().model(instance.modelId)?.name||instance.modelId)}">${equipmentContents(instance,equipment().model(instance.modelId))}</button>`).join('')||'<p>Your locker is empty. Purchased equipment appears here.</p>'}</div>${pages>1?`<nav class="inventory-bay-pages" aria-label="Equipment locker pages"><button type="button" data-equipment-page="previous" ${lockerPage===0?'disabled':''}>&lsaquo;</button><span>${lockerPage+1} / ${pages}</span><button type="button" data-equipment-page="next" ${lockerPage>=pages-1?'disabled':''}>&rsaquo;</button></nav>`:''}</div>`;
  }
  function content(state,ship,eq,tab){
   if(!selection&&tab!=='build')return null;
   const detail=inspect(state,ship,eq,{selection,fitIndex,note,prefix:'yard-equipment'});fitIndex=detail.fitIndex;
   return `<div class="yard-equipment-tools">${tab==='build'?locker(state,eq):''}${detail.html}${note?`<p class="yard-equipment-note" role="status">${safe(note)}</p>`:''}</div>`;
  }
  function measureCards(rig){
   const state=getState(),eq=equipment().ensure(state),banks=['weapons','systems'].map(zone=>rig.querySelector('[data-bay-area="'+zone+'"]'));
   const signature=[...banks.map(bank=>bank.getBoundingClientRect().width.toFixed(2)),...Object.entries(eq.slots).flatMap(([kind,ids])=>ids.map(id=>{const item=eq.instances[id],model=equipment().model(item?.modelId);return [kind,id,model?.name,item?.condition,item?.phase].join(':');})),draftKey,getComputedStyle(root).font].join('|');
   if(signature!==measurementKey){
    let maximum=58;const layout=equipment().bayLayout(state),holder=document.createElement('div');
    if(activeDraft)holder.innerHTML=window.nativeOutfittingView.rig(state,window.nativeShipDefinitions.forEntity(state),eq,{draft:activeDraft});
    for(const [index,zone] of ['weapons','systems'].entries()){
     const bank=banks[index],probe=bank.cloneNode(false);probe.classList.add('equipment-measure');probe.setAttribute('aria-hidden','true');probe.setAttribute('inert','');
     Object.assign(probe.style,{position:'absolute',left:'0',top:'0',width:bank.getBoundingClientRect().width+'px',height:'auto',visibility:'hidden',pointerEvents:'none',overflow:'visible'});
     probe.innerHTML=layout.bays.filter(bay=>bay.zone===zone).map(bay=>window.nativeOutfittingView.slot(state,window.nativeShipDefinitions.forEntity(state),eq,bay.category,eq.slots[bay.category]?.[bay.index],bay.index)).join('');
     for(const mount of holder.querySelectorAll('[data-bay-area="'+zone+'"]>.outfit-mount'))probe.append(mount.cloneNode(true));
     root.append(probe);for(const card of probe.children)maximum=Math.max(maximum,Math.ceil(card.getBoundingClientRect().height),card.scrollHeight+2);probe.remove();
    }
    measurementKey=signature;rowHeight=maximum+2;
   }
   root.style.setProperty('--equipment-row-height',rowHeight+'px');
   root.style.setProperty('--equipment-hull-height',(rig.querySelector('[data-hull-system]')?.offsetHeight||62)+'px');
   return rowHeight;
  }
  function fit(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(root.hidden||root.dataset.screen!=='mars-services')return;const rig=root.querySelector('.inventory-rig');if(!rig)return;const height=measureCards(rig),next=measureRows(rig,rows,height);if(next!==rows){rows=next;if(selection?.type==='slot')reveal(equipment().bayLayout(getState()).bays.find(b=>b.category===selection.category&&b.index===selection.index));draftKey='';render();}});}
  function bind(){
   bindTargets(root,{getSelection:()=>selection,setSelection:value=>selection=value,choose,transfer,render,stopPropagation:true,suppressed:()=>performance.now()<suppressed,reject:message=>{note=message;render();}});
   root.querySelector('[data-hull-system]')?.addEventListener('click',event=>{event.stopPropagation();choose(selection?.type==='hull'?null:{type:'hull',key:'hull:thrusters'});});
   root.querySelector('[data-fit-slot]')?.addEventListener('change',event=>{fitIndex=Number(event.target.value);render();});
   root.querySelectorAll('[data-equipment-action]').forEach(button=>button.onclick=event=>{event.stopPropagation();const kind=button.dataset.equipmentAction;if(kind==='cancel'){cancel();return;}if(!selection||selection.type==='hull')return;if(kind==='equip')transfer(selection,{type:'slot',category:selection.category,index:fitIndex});else{const cells=equipment().inventoryLayout(getState()).cells;let index=0;while(cells[index])index++;transfer(selection,{type:'cell',index});}});
   root.querySelector('[data-repair-device]')?.addEventListener('click',event=>{event.stopPropagation();const result=action(getState(),'repair',event.currentTarget.dataset.repairDevice);note=result?.message||result?.error||'Unable to repair device.';if(result?.ok)window.nativeMenuSounds?.inventory('equip');render();});
   root.querySelectorAll('[data-bay-page],[data-equipment-page]').forEach(button=>{button.onclick=event=>{event.stopPropagation();if(button.dataset.bayPage)page+=button.dataset.bayPage==='next'?1:-1;else lockerPage+=button.dataset.equipmentPage==='next'?1:-1;render();};let hover=0;button.ondragover=event=>{if(button.disabled)return;event.preventDefault();if(!hover)hover=setTimeout(()=>{hover=0;button.click();},600);};button.ondragleave=()=>{clearTimeout(hover);hover=0;};button.ondrop=event=>{event.preventDefault();clearTimeout(hover);hover=0;};});fit();
  }
  root.addEventListener('pointerdown',event=>{if(root.dataset.screen!=='mars-services'||event.pointerType==='mouse')return;const node=event.target.closest('[data-item-key]');if(!node?.dataset.itemKey)return;touch={pointer:event.pointerId,node,from:location(node),x:event.clientX,y:event.clientY,ghost:null};});
  root.addEventListener('pointermove',event=>{const drag=touch;if(!drag||drag.pointer!==event.pointerId)return;if(!drag.ghost&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7)return;event.preventDefault();if(!drag.ghost){selection=drag.from;const b=drag.node.getBoundingClientRect();drag.ghost=drag.node.cloneNode(true);drag.ghost.removeAttribute('id');drag.ghost.setAttribute('aria-hidden','true');drag.ghost.classList.add('inventory-drag-ghost');drag.ghost.style.width=Math.min(b.width,100)+'px';drag.ghost.style.height=Math.min(b.height,100)+'px';root.append(drag.ghost);root.setPointerCapture(event.pointerId);}if(!drag.ghost.isConnected)root.append(drag.ghost);drag.ghost.style.left=event.clientX+'px';drag.ghost.style.top=event.clientY+'px';root.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-inventory-cell],[data-equipment-place="slot"]');if(target&&root.contains(target))target.classList.add('drop-target');const nav=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-bay-page],[data-equipment-page]');if(nav&&root.contains(nav)&&!nav.disabled&&drag.nav!==nav){drag.nav=nav;clearTimeout(drag.timer);drag.timer=setTimeout(()=>nav.click(),600);}if(!nav){clearTimeout(drag.timer);drag.nav=null;}},{passive:false});
  function endTouch(event,cancelled=false){const drag=touch;if(!drag||drag.pointer!==event.pointerId)return;touch=null;clearTimeout(drag.timer);if(!drag.ghost)return;event.preventDefault();suppressed=performance.now()+400;drag.ghost.remove();root.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));const to=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-inventory-cell],[data-equipment-place="slot"]');if(!cancelled&&to&&root.contains(to))transfer(drag.from,location(to));else render();}
  root.addEventListener('pointerup',event=>endTouch(event));root.addEventListener('pointercancel',event=>endTouch(event,true));
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>fit()).observe(root);
  return Object.freeze({get status(){return note;},bays,content,bind,clear(){selection=null;note='';},reset(){selection=null;note='';page=lockerPage=0;draftKey=measurementKey='';if(touch){clearTimeout(touch.timer);touch.ghost?.remove();touch=null;}cancelAnimationFrame(frame);},
   hullSystem:ship=>hullSystem(ship,selection?.type==='hull'),slot:(state,ship,eq,kind,id,index)=>window.nativeOutfittingView.slot(state,ship,eq,kind,id,index,{selected:selection?.type==='slot'&&selection.category===kind&&selection.index===index,compatible:!!selection?.category&&selection.category===kind})});
 }
 window.nativeEquipmentPanel=Object.freeze({inspect,hullSystem,location,bindTargets,measureRows,bayPages,equipmentContents,attachActions:value=>actions=value,createShipyard});
})();
