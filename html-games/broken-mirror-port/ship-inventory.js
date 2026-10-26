/* Personal ship loadout and cargo manifest. */
(() => {
  'use strict';
  const root=document.createElement('section');
  root.id='ship-inventory';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Ship inventory');
  document.body.append(root);
  let equipmentSelection=null,equipmentNote='';
  let touchDrag=null,suppressClickUntil=0;
  let bridge=null,previousFocus=null,inventoryPage=0,view='loadout',rightPage='inventory',deliveryNote='',filter='all';
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const qty=value=>Math.max(0,Math.floor(Number(value)||0));
  const fmt=value=>qty(value).toLocaleString();
  const equipmentArt=data=>window.nativeOutfittingView.art(data);
  const shipFor=state=>window.nativeShipDefinitions?.forEntity(state)||window.VexedMirrorWorld.ships.find(item=>item.id===Number(state.shipType))||window.VexedMirrorWorld.ships.find(item=>item.id===7);
  const place=id=>window.nativeSystemHub?.sol.find(node=>node.id===Number(id))?.name||'Unknown destination';
  const planetArt=id=>{const node=window.nativeSystemHub?.sol.find(entry=>entry.id===Number(id));return node?`../flashtrek-broken-mirror/art-review/sol-planets/${String(node.id).padStart(2,'0')} - ${encodeURIComponent(node.name)}.png`:'assets/ui/freight.svg'};
  const itemIcons={antimatter:'startup/resources/antimatter.png',dilithium:'assets/ui/dilithium.svg',deuranium:'startup/resources/deuranium.png',food:'assets/ui/food.svg',latinum:'startup/resources/latinum.png'};
  const goodIcons=['assets/ui/mineral.svg','assets/ui/metal.svg','assets/ui/components.svg','assets/ui/computers.svg','assets/ui/fuel.svg','assets/ui/food.svg','assets/ui/medicine.svg','startup/resources/deuranium.png','assets/ui/hull-sections.svg'];
  const compact=value=>qty(value)>=10000?new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(qty(value)):fmt(value);
  const item=(name,value,unit='',kind='supply',customIcon)=>{
    const resource=String(name).toLowerCase(),icon=customIcon||(kind==='mineral'?window.nativeOutfittingView.minerals[resource]?.icon:null)||itemIcons[resource]||`assets/ui/${kind==='mineral'?'mineral':'freight'}.svg`;
    return `<span class="inventory-item-icon"><img src="${icon}" alt=""></span><span class="inventory-item-name">${safe(kind==='mineral'?window.nativeOutfittingView.minerals[resource]?.name||name:name)}</span><strong class="inventory-item-count">${compact(value)}${unit}</strong>`;
  };
  const locationFor=node=>node.hasAttribute('data-inventory-cell')?{type:'cell',index:Number(node.dataset.inventoryCell),key:node.dataset.itemKey,category:node.dataset.equipmentKind}:{type:'slot',category:node.dataset.equipmentKind,index:Number(node.dataset.equipmentIndex),key:node.dataset.itemKey};
  function transfer(from,to){
    const result=bridge.moveInventory({from,to});
    equipmentNote=result?.ok?(result.saved===false?'Item moved, but saving failed. Use Save to try again.':''):(result?.error||'Unable to move that item.');
    if(result?.ok)equipmentSelection=null;
    render();
  }
  function preview(state,ship){window.nativeOutfittingView.preview(root,state,ship);}
  function render(){
    if(root.hidden||!bridge)return;
    const focused=document.activeElement,focusKey=focused&&root.contains(focused)?focused.dataset.focusKey:null;
    const loadoutScroll=root.querySelector('.inventory-loadout')?.scrollTop||0;
    const state=bridge.getState(),equipment=window.nativeShipEquipment,eq=equipment.ensure(state),ship=shipFor(state);
    if(eq.slots.repairDrone.some(id=>eq.instances[id]?.hull>0))window.nativeRepairVisuals?.ensure().catch(()=>{});
    const freightGoods=Object.entries(state.solFreightHold||{}).map(([id,amount])=>({id:Number(id),name:window.nativeSolEconomy.goods[Number(id)]||`Good ${id}`,amount:Number(amount)})).filter(entry=>entry.amount>0);
    const jobs=Array.isArray(state.localContracts)?state.localContracts:[];
    const used=equipment.cargoUsed(state);
    const minerals=Object.entries(state.minerals||{}).filter(([,amount])=>Number(amount)>0);
    const selected=(kind,type,index)=>equipmentSelection?.category===kind&&equipmentSelection.type===type&&equipmentSelection.index===index;
    const slot=(kind,id,index)=>window.nativeOutfittingView.slot(state,ship,eq,kind,id,index,{selected:selected(kind,'slot',index),compatible:!!equipmentSelection&&equipmentSelection.category===kind});
    const shieldMax=qty(ship.shields),hullMax=qty(ship.hull),capacity=qty(ship.cargo);
    const deployment=window.nativeShipRepairs?.deploymentStatus(state)||{ok:false,error:'Repair systems unavailable',available:0};
    const repairMode=window.nativeShipRepairs?.repairMode(state)||'manual';
    const systemName=Number(state.system)===1?'Sol System':`${window.VexedMirrorWorld.systems.find(entry=>entry.id===Number(state.system))?.name||'Unknown'} System`;
    const standingRaw=Number(state.localPrestige?.[state.system]),standing=Number.isFinite(standingRaw)?Math.round(standingRaw):0;
    const standingDisplay=standing>0?`+${standing}`:String(standing),standingStatus=standing>=100?'Allied':standing<0?'Hostile':'Neutral';
    const positiveFill=Math.min(100,Math.max(0,standing))/2,negativeFill=Math.min(100,Math.max(0,-standing))/2;
    const canPlotDelivery=Number(state.system)===1&&!state.localCruise&&!state.arrivalApproach;
    const inventoryTiles=[...eq.locker.map((id,index)=>{const instance=eq.instances[id],data=equipment.model(instance.modelId);return {key:'equipment:'+id,kind:'equipment',category:instance.category,name:data?.name||instance.modelId,html:`<span class="inventory-item-icon">${equipmentArt(data)}</span><span class="inventory-item-name">${safe(data?.name||instance.modelId)}</span>`,locker:index};}),
      ...[['Dilithium',state.dilithium],['Deuranium',state.deuranium],['Food',state.food]].filter(([,amount])=>Number(amount)>0).map(([name,amount])=>({key:'supply:'+name.toLowerCase(),kind:'supplies',name,html:item(name,amount)})),
      ...minerals.map(([name,amount])=>({key:'mineral:'+name,kind:'supplies',name,html:item(name.charAt(0).toUpperCase()+name.slice(1),amount,'','mineral')})),
      ...freightGoods.map(entry=>({key:'freight:'+entry.id,kind:'freight',name:entry.name,html:item(entry.name,entry.amount,' t','freight',goodIcons[entry.id])})),
      ...jobs.map(job=>({key:'contract:'+job.id,kind:'freight',name:window.nativeSolEconomy.goods[job.good]||'Cargo',html:`<span class="inventory-item-icon"><img src="${goodIcons[job.good]||'assets/ui/freight.svg'}" alt=""></span><span class="inventory-item-name">${safe(window.nativeSolEconomy.goods[job.good]||'Cargo')}</span><strong class="inventory-item-count">${fmt(job.tons)} t</strong><span class="inventory-item-tag">CONTRACT</span>`}))
    ];
    const layout=equipment.inventoryLayout(state),tiles=new Map(inventoryTiles.map(tile=>[tile.key,tile]));
    const inventoryPageSize=24,inventoryPages=Math.max(1,Math.ceil((layout.cells.length+inventoryPageSize)/inventoryPageSize));inventoryPage=Math.max(0,Math.min(inventoryPage,inventoryPages-1));
    const visibleTiles=Array.from({length:inventoryPageSize},(_,offset)=>{
      const index=inventoryPage*inventoryPageSize+offset,key=layout.cells[index],tile=tiles.get(key),active=equipmentSelection?.key===key&&!!key;
      const attributes=tile?.kind==='equipment'?`data-equipment-kind="${tile.category}" data-equipment-place="locker" data-equipment-index="${tile.locker}"`:'';
      return `<button type="button" class="inventory-item ${tile?(tile.kind==='equipment'?'inventory-weapon-tile':'inventory-cargo-tile'):'inventory-blank'}${active?' selected':''}${tile&&filter!=='all'&&filter!==tile.kind?' inventory-filter-dim':''}" data-inventory-cell="${index}" data-item-key="${safe(key||'')}" data-focus-key="cell-${index}" ${attributes} ${tile?`draggable="true" data-kind="${tile.category||tile.kind}" aria-pressed="${active}" title="${safe(tile.name)} · Drag to move" aria-label="${tile.kind==='equipment'?'Stored ':''}${safe(tile.name)}"`:`aria-label="Empty inventory tile ${index+1}"`}>${tile?tile.html:'<span class="inventory-empty-mark">+</span>'}</button>`;
    });
    const fittedCount=Object.values(eq.slots).flat().filter(Boolean).length,totalSlots=Object.values(eq.slots).flat().length;
    root.dataset.view=view;root.dataset.rightPage=rightPage;
    root.innerHTML=`<div class="inventory-panel">
      <header class="inventory-header"><div class="inventory-heading"><span class="inventory-kicker">VESSEL MANAGEMENT <b>/</b> INVENTORY</span><h2>${safe(state.shipName||ship.name)}</h2><p class="inventory-ship-caption">${safe(ship.name)}<span class="inventory-location">${safe(systemName)}</span></p></div><div class="inventory-standing ${standing<0?'negative':standing>=100?'allied':'neutral'}"><div class="inventory-standing-label"><span>LOCAL STANDING · ${standingStatus}</span><strong>${standingDisplay}</strong></div><div class="inventory-standing-track" role="meter" aria-label="Standing in ${safe(systemName)}" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${Math.max(-100,Math.min(100,standing))}" aria-valuetext="${standingDisplay} ${standingStatus}"><i class="inventory-standing-negative" style="width:${negativeFill}%"></i><i class="inventory-standing-positive" style="width:${positiveFill}%"></i><b class="inventory-standing-zero"></b></div></div><div class="inventory-resources" aria-label="Ship resources"><div class="inventory-resource inventory-money" aria-label="Latinum: ${fmt(state.latinum)}"><img src="${itemIcons.latinum}" alt=""><span><small>LATINUM</small><strong>${fmt(state.latinum)}</strong></span></div><div class="inventory-resource inventory-fuel" aria-label="Antimatter: ${fmt(state.antimatter)}"><img src="${itemIcons.antimatter}" alt=""><span><small>ANTIMATTER</small><strong>${fmt(state.antimatter)}</strong></span></div></div><button class="inventory-close" data-focus-key="close" type="button" aria-label="Close ship inventory">×<small>ESC</small></button></header>
      <nav class="inventory-view-tabs" aria-label="Inventory pages"><button type="button" data-focus-key="view-loadout" data-inventory-view="loadout" aria-pressed="${view==='loadout'}">Ship & loadout</button><button type="button" data-focus-key="view-cargo" data-inventory-view="cargo" aria-pressed="${view==='cargo'}">Cargo & deliveries</button></nav>
      <div class="inventory-body">
        <section class="inventory-loadout" aria-label="Ship equipment"><div class="inventory-section-title"><span><b>01</b> SHIP LOADOUT</span><strong>${fittedCount} / ${totalSlots} bays fitted</strong></div>
          ${window.nativeOutfittingView.rig(state,ship,eq,{renderSlot:slot})}
          <div class="inventory-drone-controls"><div class="inventory-repair-mode" role="group" aria-label="Repair drone mode">${['manual','auto'].map(mode=>`<button type="button" data-repair-mode="${mode}" data-focus-key="repair-mode-${mode}" aria-pressed="${repairMode===mode}">${mode==='manual'?'Manual':'Auto'}</button>`).join('')}</div><button type="button" data-deploy-repair-drones data-focus-key="deploy-drones" aria-describedby="inventory-deploy-status" ${repairMode==='manual'?'':'hidden'} ${deployment.ok?'':'disabled'}>Deploy Repair Drones</button><span id="inventory-deploy-status">${safe(deployment.error||(repairMode==='auto'?'Auto repair ready':`${deployment.available} DOT${deployment.available===1?'':'s'} ready`)+' · Uses deuranium')}</span></div>
          <div class="inventory-vitals"><div class="inventory-hull"><span>HULL</span><strong>${fmt(state.hull)} / ${fmt(hullMax)}</strong><div class="inventory-meter"><i style="--fill:${hullMax?Math.max(0,Math.min(100,qty(state.hull)/hullMax*100)):0}%"></i></div></div><div class="inventory-shield"><span>SHIELDS</span><strong>${fmt(state.shields)} / ${fmt(shieldMax)}</strong><div class="inventory-meter"><i style="--fill:${shieldMax?Math.max(0,Math.min(100,qty(state.shields)/shieldMax*100)):0}%"></i></div></div></div>
          ${equipmentNote?`<p class="inventory-hint" role="status">${safe(equipmentNote)}</p>`:''}


        </section>
        <section class="inventory-cargo" aria-label="Ship inventory and deliveries"><div class="inventory-section-title"><span><b>02</b> CARGO HOLD</span><strong>Cargo ${fmt(used)} / ${fmt(capacity)} t</strong></div><div class="inventory-capacity" role="meter" aria-label="Cargo capacity" aria-valuemin="0" aria-valuemax="${Math.max(1,capacity)}" aria-valuenow="${Math.min(used,Math.max(1,capacity))}" aria-valuetext="${fmt(used)} of ${fmt(capacity)} tonnes"><i style="--fill:${capacity?Math.max(0,Math.min(100,used/capacity*100)):0}%"></i></div>
          <nav class="inventory-right-tabs" aria-label="Inventory sections"><button type="button" data-focus-key="right-inventory" data-right-page="inventory" aria-pressed="${rightPage==='inventory'}">Inventory <span>${inventoryTiles.length}</span></button><button type="button" data-focus-key="right-deliveries" data-right-page="deliveries" aria-pressed="${rightPage==='deliveries'}">Deliveries <span>${jobs.length}</span></button></nav>
          <div class="inventory-items-page"><nav class="inventory-filters" aria-label="Highlight inventory category">${[['all','All items'],['equipment','Equipment'],['supplies','Supplies'],['freight','Freight']].map(([key,label])=>`<button type="button" data-focus-key="filter-${key}" data-inventory-filter="${key}" aria-pressed="${filter===key}">${label}</button>`).join('')}</nav><div class="inventory-grid" aria-label="Stored equipment and cargo">${visibleTiles.join('')}</div><p class="inventory-arrange-hint" role="status">${safe(equipmentNote||'Drag to arrange. Empty tiles accept any item. Positions save automatically.')}</p><div class="inventory-page-nav"><span>${inventoryTiles.length} items aboard</span><div><button type="button" data-focus-key="previous" data-inventory-page="previous" ${inventoryPage===0?'disabled':''} aria-label="Previous inventory page">&lsaquo;</button><span>${inventoryPage+1} / ${inventoryPages}</span><button type="button" data-focus-key="next" data-inventory-page="next" ${inventoryPage>=inventoryPages-1?'disabled':''} aria-label="Next inventory page">&rsaquo;</button></div></div></div>

          <div class="inventory-deliveries-page" aria-label="Delivery contracts"><div class="inventory-deliveries-summary"><span>ACTIVE CONTRACTS</span><strong>${jobs.length} / 2</strong></div>${jobs.length?`<div class="inventory-contract-cards">${jobs.map((job,index)=>`<article class="inventory-contract-card"><div class="inventory-contract-main"><div class="inventory-contract-planet"><img src="${planetArt(job.to)}" alt="${safe(place(job.to))}"></div><div class="inventory-contract-details"><span class="inventory-contract-kicker">DELIVERY ${String(index+1).padStart(2,'0')} / ${safe(place(job.from))} TO</span><strong class="inventory-contract-destination">${safe(place(job.to))}</strong><div class="inventory-contract-cargo"><img src="${goodIcons[job.good]||'assets/ui/freight.svg'}" alt=""><span>${fmt(job.tons)} t ${safe(window.nativeSolEconomy.goods[job.good]||'Cargo')} aboard</span></div></div><div class="inventory-contract-payment"><span>ON DELIVERY</span><strong>${fmt(job.pay)}</strong><small>LATINUM</small></div></div><div class="inventory-contract-actions"><button type="button" data-delivery-action="cruise" data-delivery-id="${safe(job.id)}" ${canPlotDelivery&&Number(state.localBody)!==Number(job.to)?'':'disabled'}>Cruise to ${safe(place(job.to))}</button><button type="button" data-delivery-action="select" data-delivery-id="${safe(job.id)}" aria-pressed="${Number(state.localNavTarget)===Number(job.to)}" ${canPlotDelivery?'':'disabled'}>${Number(state.localNavTarget)===Number(job.to)?'Navigation selected':'Select for navigation'}</button></div></article>`).join('')}</div>`:'<div class="inventory-deliveries-empty"><img src="assets/ui/freight.svg" alt=""><strong>No active deliveries</strong><span>Accept a shipping contract at a port to see its cargo, route, and payment here.</span></div>'}${deliveryNote?`<p class="inventory-delivery-note" role="status">${safe(deliveryNote)}</p>`:''}</div>
        </section>
      </div></div>`;
    root.querySelector('.inventory-close').onclick=close;
    root.querySelectorAll('[data-repair-mode]').forEach(button=>button.onclick=()=>{const result=bridge.setRepairMode?.(button.dataset.repairMode);equipmentNote=result?.ok?(result.saved===false?'Repair mode changed, but saving failed. Use Save to try again.':''):result?.error||'Unable to change repair mode.';render();});
    root.querySelector('[data-deploy-repair-drones]').onclick=()=>{const result=bridge.deployRepairDrones?.();if(result?.ok&&result.saved!==false){close();document.getElementById('space')?.focus({preventScroll:true});return;}equipmentNote=result?.saved===false?'Drones deployed, but saving failed. Use Save to try again.':result?.error||'Unable to deploy repair drones.';render();};
    root.querySelectorAll('[data-inventory-view]').forEach(button=>button.onclick=()=>{view=button.dataset.inventoryView;render();});
    root.querySelectorAll('[data-right-page]').forEach(button=>button.onclick=()=>{rightPage=button.dataset.rightPage;deliveryNote='';render()});
    root.querySelectorAll('[data-delivery-action]').forEach(button=>button.onclick=()=>{const result=bridge.deliveryNavigation?.(Number(button.dataset.deliveryId),button.dataset.deliveryAction);if(result?.ok){close();document.getElementById('space')?.focus({preventScroll:true});return}deliveryNote=result?.error||'Unable to plot this delivery.';render()});
    root.querySelectorAll('[data-inventory-page]').forEach(button=>button.onclick=()=>{inventoryPage+=button.dataset.inventoryPage==='next'?1:-1;render()});
    root.querySelectorAll('[data-inventory-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.inventoryFilter;inventoryPage=0;render()});
    const choose=locationFor;
    const targets=root.querySelectorAll('[data-inventory-cell],[data-equipment-place="slot"]');
    const clearDrop=()=>root.querySelectorAll('.drop-target').forEach(node=>node.classList.remove('drop-target'));
    const highlight=()=>root.querySelectorAll('[data-equipment-place="slot"]').forEach(node=>node.classList.toggle('compatible',!!equipmentSelection?.category&&node.dataset.equipmentKind===equipmentSelection.category));
    const canDrop=(from,to)=>!!from&&(to.type==='cell'||!!from.category&&from.category===to.category);
    targets.forEach(node=>{
      const at=()=>choose(node);
      node.onclick=()=>{
        if(performance.now()<suppressClickUntil)return;
        const destination=at();
        if(equipmentSelection){
          if(equipmentSelection.type===destination.type&&equipmentSelection.index===destination.index&&(destination.type==='cell'||equipmentSelection.category===destination.category)){equipmentSelection=null;equipmentNote='';render();}
          else transfer(equipmentSelection,destination);
        }else if(destination.key){equipmentSelection=destination;equipmentNote='';render();}
      };
      node.draggable=!!node.dataset.itemKey;
      node.ondragstart=event=>{equipmentSelection=at();event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',JSON.stringify(equipmentSelection));node.classList.add('drag-source');highlight();};
      node.ondragover=event=>{if(canDrop(equipmentSelection,at())){event.preventDefault();event.dataTransfer.dropEffect='move';node.classList.add('drop-target');}};
      node.ondragleave=()=>node.classList.remove('drop-target');
      node.ondragend=()=>{clearDrop();node.classList.remove('drag-source');};
      node.ondrop=event=>{event.preventDefault();event.stopPropagation();clearDrop();try{const from=JSON.parse(event.dataTransfer.getData('text/plain'));transfer(from,at());}catch{equipmentNote='Pick up an item from your inventory or ship bays.';render();}};
    });
    root.querySelectorAll('[data-inventory-page],[data-inventory-view],[data-right-page="inventory"]').forEach(button=>{
      let hover=0;button.ondragover=event=>{if(button.disabled)return;event.preventDefault();if(!hover)hover=setTimeout(()=>{hover=0;button.click();},600);};button.ondragleave=()=>{clearTimeout(hover);hover=0;};button.ondrop=event=>{event.preventDefault();clearTimeout(hover);hover=0;};
    });
    root.querySelector('.inventory-loadout').scrollTop=loadoutScroll;
    if(focusKey){const target=[...root.querySelectorAll('[data-focus-key]')].find(node=>node.dataset.focusKey===focusKey);(target&&!target.disabled?target:root.querySelector('.inventory-close')).focus({preventScroll:true});}
    preview(state,ship);
  }
  root.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse')return;
    const node=event.target.closest('[data-item-key]');if(!node?.dataset.itemKey)return;
    touchDrag={pointer:event.pointerId,node,from:locationFor(node),x:event.clientX,y:event.clientY,ghost:null};
  });
  root.addEventListener('pointermove',event=>{
    const drag=touchDrag;if(!drag||drag.pointer!==event.pointerId)return;
    if(!drag.ghost&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7)return;
    event.preventDefault();
    if(!drag.ghost){
      equipmentSelection=drag.from;const bounds=drag.node.getBoundingClientRect();
      drag.ghost=drag.node.cloneNode(true);drag.ghost.removeAttribute('id');drag.ghost.setAttribute('aria-hidden','true');drag.ghost.classList.add('inventory-drag-ghost');
      drag.ghost.style.width=Math.min(bounds.width,100)+'px';drag.ghost.style.height=Math.min(bounds.height,100)+'px';root.append(drag.ghost);root.setPointerCapture(event.pointerId);
    }
    if(!drag.ghost.isConnected)root.append(drag.ghost);
    drag.ghost.style.left=event.clientX+'px';drag.ghost.style.top=event.clientY+'px';
    root.querySelectorAll('.drop-target').forEach(node=>node.classList.remove('drop-target'));
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-inventory-cell],[data-equipment-place="slot"]');target?.classList.add('drop-target');
    const nav=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-inventory-view],[data-inventory-page],[data-right-page="inventory"]');
    if(nav&&!nav.disabled&&drag.nav!==nav){drag.nav=nav;clearTimeout(drag.timer);drag.timer=setTimeout(()=>nav.click(),600);}
    if(!nav){clearTimeout(drag.timer);drag.nav=null;}
    const scroll=document.elementFromPoint(event.clientX,event.clientY)?.closest('.inventory-items-page,.inventory-loadout');
    if(scroll){const box=scroll.getBoundingClientRect();if(event.clientY>box.bottom-35)scroll.scrollTop+=12;else if(event.clientY<box.top+35)scroll.scrollTop-=12;}
  },{passive:false});
  const endTouch=(event,cancelled=false)=>{
    const drag=touchDrag;if(!drag||drag.pointer!==event.pointerId)return;touchDrag=null;clearTimeout(drag.timer);
    if(!drag.ghost)return;
    event.preventDefault();suppressClickUntil=performance.now()+400;drag.ghost.remove();
    root.querySelectorAll('.drop-target').forEach(node=>node.classList.remove('drop-target'));
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-inventory-cell],[data-equipment-place="slot"]');
    if(!cancelled&&target)transfer(drag.from,locationFor(target));else render();
  };
  root.addEventListener('pointerup',event=>endTouch(event));root.addEventListener('pointercancel',event=>endTouch(event,true));
  root.addEventListener('keydown',event=>{if(event.key==='Tab'){const nodes=[...root.querySelectorAll('button:not(:disabled),select:not(:disabled)')].filter(node=>node.getClientRects().length),first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}if(event.target.matches('select')&&event.code==='KeyI')event.stopPropagation();});
  function open(){if(!bridge?.getState?.()||!root.hidden)return;previousFocus=document.activeElement;equipmentSelection=null;equipmentNote='';inventoryPage=0;view='loadout';rightPage='inventory';deliveryNote='';filter='all';root.hidden=false;dispatchEvent(new CustomEvent('native-inventorychange',{detail:{active:true,at:performance.now()}}));render();root.querySelector('.inventory-close')?.focus({preventScroll:true});}
  function close(){if(root.hidden)return;root.hidden=true;dispatchEvent(new CustomEvent('native-inventorychange',{detail:{active:false,at:performance.now()}}));window.nativeOutfittingView.stopPreview(root);if(touchDrag)clearTimeout(touchDrag.timer);touchDrag=null;root.innerHTML='';equipmentSelection=null;previousFocus?.focus?.({preventScroll:true});}
  window.nativeShipInventory={attach(value){bridge=value;},open,close,refresh:render,get active(){return !root.hidden}};
})();
