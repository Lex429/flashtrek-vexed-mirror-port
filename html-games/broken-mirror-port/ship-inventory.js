/* Personal ship loadout and cargo manifest. */
(() => {
  'use strict';
  const root=document.createElement('section');
  root.id='ship-inventory';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Ship inventory');
  document.body.append(root);
  let equipmentSelection=null,equipmentNote='';
  let bridge=null,frame=0,generation=0,previousFocus=null,selectedWeapon=null,inventoryPage=0,view='loadout',rightPage='inventory',deliveryNote='';
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const qty=value=>Math.max(0,Math.floor(Number(value)||0));
  const fmt=value=>qty(value).toLocaleString();
  const weapon=id=>window.VexedMirrorWeapons?.find(item=>item.id===Number(id));
  const shipFor=state=>window.nativeShipDefinitions?.forEntity(state)||window.VexedMirrorWorld.ships.find(item=>item.id===Number(state.shipType))||window.VexedMirrorWorld.ships.find(item=>item.id===7);
  const place=id=>window.nativeSystemHub?.sol.find(node=>node.id===Number(id))?.name||'Unknown destination';
  const planetArt=id=>{const node=window.nativeSystemHub?.sol.find(entry=>entry.id===Number(id));return node?`../flashtrek-broken-mirror/art-review/sol-planets/${String(node.id).padStart(2,'0')} - ${encodeURIComponent(node.name)}.png`:'assets/ui/freight.svg'};
  const itemIcons={antimatter:'startup/resources/antimatter.png',dilithium:'assets/ui/dilithium.svg',deuranium:'startup/resources/deuranium.png',food:'assets/ui/food.svg',latinum:'startup/resources/latinum.png'};
  const goodIcons=['assets/ui/mineral.svg','assets/ui/metal.svg','assets/ui/components.svg','assets/ui/computers.svg','assets/ui/fuel.svg','assets/ui/food.svg','assets/ui/medicine.svg','startup/resources/deuranium.png','assets/ui/hull-sections.svg'];
  const compact=value=>qty(value)>=10000?new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(qty(value)):fmt(value);
  const item=(name,value,unit='',kind='supply',customIcon)=>{
    const resource=String(name).toLowerCase(),icon=customIcon||itemIcons[resource]||`assets/ui/${kind==='mineral'?'mineral':'freight'}.svg`;
    return `<div class="inventory-item ${qty(value)?'':'empty'}" data-kind="${kind}" data-resource="${safe(resource)}" title="${safe(name)}: ${fmt(value)}${unit}"><span class="inventory-item-icon"><img src="${icon}" alt=""></span><span class="inventory-item-name">${safe(name)}</span><strong class="inventory-item-count">${compact(value)}${unit}</strong></div>`;
  };
  function preview(state,ship){
    generation++;if(frame)cancelAnimationFrame(frame);frame=0;
    const current=generation,canvas=root.querySelector('[data-ship-preview]');
    if(!canvas)return;
    window.vexedFlightAssets.loadShip(ship.id,qty(state.hull)*window.nativeShipDefinitions.get(ship.id).hull/Math.max(1,ship.hull)).then(asset=>{
      if(current!==generation||!canvas.isConnected||root.hidden)return;
      const context=canvas.getContext('2d');
      function paint(now){
        if(current!==generation||!canvas.isConnected||root.hidden)return;
        const bounds=canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,1.5);
        const width=Math.max(1,Math.round(bounds.width*ratio)),height=Math.max(1,Math.round(bounds.height*ratio));
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        context.clearRect(0,0,width,height);
        const scale=Math.min(width*.82/asset.width,height*.88/asset.height);
        window.vexedFlightAssets.drawShip(context,asset,width/2,height/2,asset.width*scale,0,window.nativeSimulation.now(state),{height:asset.height*scale,damage:true,lights:state.phase!=='disabled',light:window.vexedSpace?.light});
        canvas.classList.add('ready');frame=requestAnimationFrame(paint);
      }
      frame=requestAnimationFrame(paint);
    }).catch(()=>{if(current===generation)canvas.setAttribute('aria-label','Ship preview unavailable');});
  }
  function render(){
    if(root.hidden||!bridge)return;
    const state=bridge.getState(),equipment=window.nativeShipEquipment,eq=equipment.ensure(state),ship=shipFor(state),weapons=eq.slots.weapon.map(id=>equipment.model(eq.instances[id]?.modelId)),stored=state.weaponInventory||[];
    const freightGoods=Object.entries(state.solFreightHold||{}).map(([id,amount])=>({id:Number(id),name:window.nativeSolEconomy.goods[Number(id)]||`Good ${id}`,amount:qty(amount)})).filter(entry=>entry.amount>0);
    const jobs=Array.isArray(state.localContracts)?state.localContracts:[];
    const used=equipment.cargoUsed(state);
    const minerals=Object.entries(state.minerals||{}).filter(([,amount])=>qty(amount)>0);
    const labels={weapon:'Weapon',repairDrone:'Repair drone',ability:'Special ability',engineering:'Engineering',shield:'Shield system'};
    const slot=(kind,id,index)=>{const instance=eq.instances[id],data=equipment.model(instance?.modelId),detail=kind==='repairDrone'&&instance?` | Hull ${qty(instance.hull)}/40 | ${instance.phase}`:kind==='engineering'&&instance?.upgrades?.tugEngineLevel?` | Mk ${instance.upgrades.tugEngineLevel+1}`:'';return `<button type="button" class="inventory-slot inventory-system ${instance?'filled':'empty'}" data-equipment-kind="${kind}" data-equipment-place="slot" data-equipment-index="${index}" aria-label="${labels[kind]} slot ${index+1}: ${safe(data?.name||'Empty')}"><span>${labels[kind].toUpperCase()} ${String(index+1).padStart(2,'0')}</span><strong>${safe((data?.name||'Empty')+detail)}</strong></button>`;};
    const shieldMax=qty(ship.shields),hullMax=qty(ship.hull),capacity=qty(ship.cargo);
    const systemName=Number(state.system)===1?'Sol System':`${window.VexedMirrorWorld.systems.find(entry=>entry.id===Number(state.system))?.name||'Unknown'} System`;
    const standingRaw=Number(state.localPrestige?.[state.system]),standing=Number.isFinite(standingRaw)?Math.round(standingRaw):0;
    const standingDisplay=standing>0?`+${standing}`:String(standing),standingStatus=standing>=100?'Allied':standing<0?'Hostile':'Neutral';
    const positiveFill=Math.min(100,Math.max(0,standing))/2,negativeFill=Math.min(100,Math.max(0,-standing))/2;
    const canPlotDelivery=Number(state.system)===1&&!state.localCruise&&!state.arrivalApproach;
    const inventoryTiles=[...eq.locker.map((id,index)=>{const instance=eq.instances[id],data=equipment.model(instance.modelId);return `<button class="inventory-item inventory-weapon-tile" type="button" data-kind="${safe(instance.category)}" data-equipment-kind="${safe(instance.category)}" data-equipment-place="locker" data-equipment-index="${index}" aria-label="Stored ${safe(data?.name||instance.modelId)}"><span class="inventory-item-icon">${typeof data?.id==='number'?`<img src="../flashtrek-broken-mirror/showcase-assets/weapon-icon-remastered-${data.id}.png" alt="">`:'<strong>SYS</strong>'}</span><span class="inventory-item-name">${safe(data?.name||instance.modelId)}</span></button>`;}),
      ...[['Dilithium',state.dilithium],['Deuranium',state.deuranium],['Food',state.food]].filter(([,amount])=>qty(amount)>0).map(([name,amount])=>item(name,amount)),
      ...minerals.map(([name,amount])=>item(name.charAt(0).toUpperCase()+name.slice(1),amount,'','mineral')),
      ...freightGoods.map(entry=>item(entry.name,entry.amount,' t','freight',goodIcons[entry.id])),
      ...jobs.map(job=>`<div class="inventory-item inventory-contract" data-kind="contract" title="Contract cargo: ${fmt(job.tons)} t ${safe(window.nativeSolEconomy.goods[job.good]||'cargo')} to ${safe(place(job.to))}"><span class="inventory-item-icon"><img src="${goodIcons[job.good]||'assets/ui/freight.svg'}" alt=""></span><span class="inventory-item-name">${safe(window.nativeSolEconomy.goods[job.good]||'Cargo')}</span><strong class="inventory-item-count">${fmt(job.tons)} t</strong></div>`)
    ];
    const inventoryPageSize=29,inventoryPages=Math.max(1,Math.ceil(inventoryTiles.length/inventoryPageSize));inventoryPage=Math.min(inventoryPage,inventoryPages-1);
    const visibleTiles=inventoryTiles.slice(inventoryPage*inventoryPageSize,(inventoryPage+1)*inventoryPageSize);
    const emptyTile=`<button class="inventory-item inventory-blank" type="button" data-weapon-place="locker" data-weapon-index="${stored.length}" aria-label="Empty inventory tile; stow a weapon here"></button>`;
    const stowTile=`<button class="inventory-item inventory-stow" type="button" data-weapon-place="locker" data-weapon-index="${stored.length}" aria-label="Store an equipped weapon"><span class="inventory-stow-plus">+</span><span class="inventory-item-name">Stow weapon</span></button>`;
    const weaponSlot=(item,index)=>`<button class="inventory-slot inventory-weapon ${item?'filled':'empty'} ${selectedWeapon?.type==='slot'&&selectedWeapon.index===index?'selected':''}" type="button" data-equipment-kind="weapon" data-equipment-place="slot" data-equipment-index="${index}" data-weapon-place="slot" data-weapon-index="${index}" draggable="${!!item}" aria-label="Weapon slot ${index+1}: ${safe(item?.name||'Empty')}"><span>WEAPON ${String(index+1).padStart(2,'0')}</span><span class="inventory-slot-content">${item?`<img src="../flashtrek-broken-mirror/showcase-assets/weapon-icon-remastered-${item.id}.png" alt=""><strong>${safe(item.name)}</strong>`:'<strong>Empty slot</strong>'}</span></button>`;
    root.dataset.view=view;root.dataset.rightPage=rightPage;
    root.innerHTML=`<div class="inventory-panel">
      <header class="inventory-header"><div class="inventory-heading"><span class="inventory-kicker">CURRENT SYSTEM</span><h2 class="inventory-system-name">${safe(systemName)}</h2><div class="inventory-standing ${standing<0?'negative':standing>=100?'allied':'neutral'}"><div class="inventory-standing-label"><span>LOCAL STANDING · ${standingStatus}</span><strong>${standingDisplay}</strong></div><div class="inventory-standing-track" role="meter" aria-label="Standing in ${safe(systemName)}" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${Math.max(-100,Math.min(100,standing))}" aria-valuetext="${standingDisplay} ${standingStatus}"><i class="inventory-standing-negative" style="width:${negativeFill}%"></i><i class="inventory-standing-positive" style="width:${positiveFill}%"></i><b class="inventory-standing-zero"></b></div></div><p class="inventory-ship-caption">${safe(state.shipName||ship.name)} · ${safe(ship.name)}</p></div><nav class="inventory-view-tabs" aria-label="Inventory pages"><button type="button" data-inventory-view="loadout" aria-pressed="${view==='loadout'}">Ship</button><button type="button" data-inventory-view="cargo" aria-pressed="${view==='cargo'}">Inventory</button></nav><div class="inventory-resources" aria-label="Ship resources"><div class="inventory-resource inventory-money" aria-label="Latinum: ${fmt(state.latinum)}"><img src="${itemIcons.latinum}" alt=""><span><small>LATINUM</small><strong>${fmt(state.latinum)}</strong></span></div><div class="inventory-resource inventory-fuel" aria-label="Antimatter: ${fmt(state.antimatter)}"><img src="${itemIcons.antimatter}" alt=""><span><small>ANTIMATTER</small><strong>${fmt(state.antimatter)}</strong></span></div></div><button class="inventory-close" type="button" aria-label="Close ship inventory">×</button></header>
      <div class="inventory-body">
        <section class="inventory-loadout" aria-label="Ship equipment"><div class="inventory-section-title"><span>01 / LOADOUT</span><strong>${safe(ship.name)}</strong></div>
          <div class="inventory-rig"><div class="inventory-weapons">${weapons.map(weaponSlot).join('')}</div><div class="inventory-ship"><canvas data-ship-preview role="img" aria-label="Current ${safe(ship.name)} with lighting and damage"></canvas><div class="inventory-ship-rings" aria-hidden="true"></div></div><div class="inventory-systems">
            ${['engineering','shield','ability'].map(kind=>eq.slots[kind].map((id,i)=>slot(kind,id,i)).join('')).join('')}
          </div></div>
          <div class="inventory-drone-bays" aria-label="Repair drone bays"><div class="inventory-section-title"><span>REPAIR DRONES</span><strong>${eq.slots.repairDrone.filter(Boolean).length} / ${ship.slots.repairDrone} fitted</strong></div><div class="inventory-drone-grid">${eq.slots.repairDrone.map((id,i)=>slot('repairDrone',id,i)).join('')||'<p>No repair-drone bays</p>'}</div></div>
          <div class="inventory-vitals"><div class="inventory-hull"><span>HULL</span><strong>${fmt(state.hull)} / ${fmt(hullMax)}</strong><div class="inventory-meter"><i style="--fill:${hullMax?Math.max(0,Math.min(100,qty(state.hull)/hullMax*100)):0}%"></i></div></div><div class="inventory-shield"><span>SHIELDS</span><strong>${fmt(state.shields)} / ${fmt(shieldMax)}</strong><div class="inventory-meter"><i style="--fill:${shieldMax?Math.max(0,Math.min(100,qty(state.shields)/shieldMax*100)):0}%"></i></div></div></div>
          <p class="inventory-hint" role="status">${safe(equipmentNote||(equipmentSelection?'Choose a compatible slot or Stow selected.':'Select any installed or stored item, then a compatible slot.'))}</p><div class="inventory-fitting-actions"><button type="button" data-stow-equipment ${equipmentSelection?'':'disabled'}>Stow selected</button><label>Port equipment <select data-equipment-shop><option value="mining-laser">Mining laser - 120 L</option><option value="basic-dot">Basic Dot - 1,300 L</option><option value="standard-engine">Standard engines - 500 L</option><option value="standard-shield">Shield system - 500 L</option></select></label><button type="button" data-buy-equipment ${bridge.atPort?.()?'':'disabled'}>Buy to locker</button></div>

        </section>
        <section class="inventory-cargo" aria-label="Ship inventory and deliveries"><div class="inventory-section-title"><span>02 / ${rightPage==='inventory'?'INVENTORY':'DELIVERIES'}</span><strong>Cargo ${fmt(used)} / ${fmt(capacity)} t</strong></div><div class="inventory-capacity"><i style="--fill:${capacity?Math.max(0,Math.min(100,used/capacity*100)):0}%"></i></div>
          <nav class="inventory-right-tabs" aria-label="Inventory sections"><button type="button" data-right-page="inventory" aria-pressed="${rightPage==='inventory'}">Inventory</button><button type="button" data-right-page="deliveries" aria-pressed="${rightPage==='deliveries'}">Deliveries <span>${jobs.length}</span></button></nav>
          <div class="inventory-items-page"><div class="inventory-grid">${visibleTiles.join('')}${Array.from({length:inventoryPageSize-visibleTiles.length},()=>emptyTile).join('')}${stowTile}</div><div class="inventory-page-nav"><span>${inventoryTiles.length} items aboard</span><div><button type="button" data-inventory-page="previous" ${inventoryPage===0?'disabled':''} aria-label="Previous inventory page">‹</button><span>${inventoryPage+1} / ${inventoryPages}</span><button type="button" data-inventory-page="next" ${inventoryPage>=inventoryPages-1?'disabled':''} aria-label="Next inventory page">›</button></div></div></div>
          <div class="inventory-deliveries-page" aria-label="Delivery contracts"><div class="inventory-deliveries-summary"><span>ACTIVE CONTRACTS</span><strong>${jobs.length} / 2</strong></div>${jobs.length?`<div class="inventory-contract-cards">${jobs.map((job,index)=>`<article class="inventory-contract-card"><div class="inventory-contract-main"><div class="inventory-contract-planet"><img src="${planetArt(job.to)}" alt="${safe(place(job.to))}"></div><div class="inventory-contract-details"><span class="inventory-contract-kicker">DELIVERY ${String(index+1).padStart(2,'0')} / ${safe(place(job.from))} TO</span><strong class="inventory-contract-destination">${safe(place(job.to))}</strong><div class="inventory-contract-cargo"><img src="${goodIcons[job.good]||'assets/ui/freight.svg'}" alt=""><span>${fmt(job.tons)} t ${safe(window.nativeSolEconomy.goods[job.good]||'Cargo')} aboard</span></div></div><div class="inventory-contract-payment"><span>ON DELIVERY</span><strong>${fmt(job.pay)}</strong><small>LATINUM</small></div></div><div class="inventory-contract-actions"><button type="button" data-delivery-action="cruise" data-delivery-id="${safe(job.id)}" ${canPlotDelivery&&Number(state.localBody)!==Number(job.to)?'':'disabled'}>Cruise to ${safe(place(job.to))}</button><button type="button" data-delivery-action="select" data-delivery-id="${safe(job.id)}" aria-pressed="${Number(state.localNavTarget)===Number(job.to)}" ${canPlotDelivery?'':'disabled'}>${Number(state.localNavTarget)===Number(job.to)?'Navigation selected':'Select for navigation'}</button></div></article>`).join('')}</div>`:'<div class="inventory-deliveries-empty"><img src="assets/ui/freight.svg" alt=""><strong>No active deliveries</strong><span>Accept a shipping contract at a port to see its cargo, route, and payment here.</span></div>'}${deliveryNote?`<p class="inventory-delivery-note" role="status">${safe(deliveryNote)}</p>`:''}</div>
        </section>
      </div></div>`;
    root.querySelector('.inventory-close').onclick=close;
    root.querySelectorAll('[data-inventory-view]').forEach(button=>button.onclick=()=>{view=button.dataset.inventoryView;render();});
    root.querySelectorAll('[data-right-page]').forEach(button=>button.onclick=()=>{rightPage=button.dataset.rightPage;deliveryNote='';render()});
    root.querySelectorAll('[data-delivery-action]').forEach(button=>button.onclick=()=>{const result=bridge.deliveryNavigation?.(Number(button.dataset.deliveryId),button.dataset.deliveryAction);if(result?.ok){close();document.getElementById('space')?.focus({preventScroll:true});return}deliveryNote=result?.error||'Unable to plot this delivery.';render()});
    root.querySelectorAll('[data-inventory-page]').forEach(button=>button.onclick=()=>{inventoryPage+=button.dataset.inventoryPage==='next'?1:-1;render()});
    const choose=node=>({category:node.dataset.equipmentKind,type:node.dataset.equipmentPlace,index:Number(node.dataset.equipmentIndex)});
    const transfer=(from,to)=>{const result=bridge.moveEquipment({category:from.category,fromType:from.type,fromIndex:from.index,toType:to.type,toIndex:to.index,toCategory:to.category});equipmentNote=result?.ok?'Equipment fitted.':result?.error||'Unable to move equipment.';equipmentSelection=null;render();};
    root.querySelectorAll('[data-equipment-kind]').forEach(node=>{
      node.onclick=()=>{const at=choose(node);if(equipmentSelection){transfer(equipmentSelection,at);return;}const id=at.type==='slot'?eq.slots[at.category][at.index]:eq.locker[at.index];if(id){equipmentSelection=at;equipmentNote='';render();}};
      node.draggable=true;
      node.ondragstart=event=>{equipmentSelection=choose(node);event.dataTransfer.setData('text/plain',JSON.stringify(equipmentSelection));};
      node.ondragover=event=>event.preventDefault();
      node.ondrop=event=>{event.preventDefault();try{transfer(JSON.parse(event.dataTransfer.getData('text/plain')),choose(node));}catch{equipmentNote='Choose equipment to fit.';render();}};
    });
    root.querySelector('[data-stow-equipment]').onclick=()=>{if(equipmentSelection)transfer(equipmentSelection,{category:equipmentSelection.category,type:'locker',index:eq.locker.length});};
    root.querySelector('[data-buy-equipment]').onclick=()=>{const result=bridge.buyEquipment(root.querySelector('[data-equipment-shop]').value);equipmentNote=result?.ok?'Purchased equipment added to locker.':result?.error||'Purchase failed.';render();};
    preview(state,ship);
  }
  function open(){if(!bridge?.getState?.()||!root.hidden)return;previousFocus=document.activeElement;selectedWeapon=null;equipmentSelection=null;equipmentNote='';inventoryPage=0;view='loadout';rightPage='inventory';deliveryNote='';root.hidden=false;render();root.querySelector('.inventory-close')?.focus({preventScroll:true});}
  function close(){if(root.hidden)return;root.hidden=true;generation++;if(frame)cancelAnimationFrame(frame);frame=0;root.innerHTML='';selectedWeapon=null;previousFocus?.focus?.({preventScroll:true});}
  window.nativeShipInventory={attach(value){bridge=value;},open,close,refresh:render,get active(){return !root.hidden}};
})();
