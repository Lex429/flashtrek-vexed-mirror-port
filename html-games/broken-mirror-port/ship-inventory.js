/* Personal ship loadout and cargo manifest. */
(() => {
  'use strict';
  const root=document.createElement('section');
  root.id='ship-inventory';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Ship inventory');
  document.body.append(root);
  let equipmentSelection=null,equipmentNote='',fitIndex=0,inventoryPageFloor=1,bayPage=0,bayRows=4,gridColumns=6,gridRows=4,deliveryPage=0,collectablePage=0,collectableColumns=3,collectableRows=2,layoutFrame=0;
  let touchDrag=null,suppressClickUntil=0,mouseDragging=false;
  let bridge=null,previousFocus=null,inventoryPage=0,view='loadout',rightPage='inventory',deliveryNote='',filter='all';
  let prometheusTab='combined';
  const sectionContext=state=>window.nativePrometheusLoadouts?.supported(state)?window.nativePrometheusLoadouts.context(state,prometheusTab):null;
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const qty=value=>Math.max(0,Number(value)||0);
  const fmt=value=>qty(value).toLocaleString(undefined,{maximumFractionDigits:3});
  const equipmentArt=data=>window.nativeOutfittingView.art(data);
  const shipFor=state=>window.nativeShipDefinitions?.forEntity(state)||window.VexedMirrorWorld.ships.find(item=>item.id===Number(state.shipType))||window.VexedMirrorWorld.ships.find(item=>item.id===7);
  const place=id=>window.nativeSystemHub?.sol.find(node=>node.id===Number(id))?.name||'Unknown destination';
  const planetArt=id=>{const node=window.nativeSystemHub?.sol.find(entry=>entry.id===Number(id));return node?`../flashtrek-broken-mirror/art-review/sol-planets/${String(node.id).padStart(2,'0')} - ${encodeURIComponent(node.name)}.png`:'assets/ui/freight.svg'};
  const deliveryAddress=(job,side='to')=>window.nativePlayerContracts?.address(job,side)||{system:1,port:job[side],name:place(job[side]),art:planetArt(job[side]),systemName:'Sol'};
  const deliveryLabel=(job,side='to')=>{const address=deliveryAddress(job,side);return address.name+(job.kind==='interstellar'?' · '+address.systemName+' system':'');};
  const deliveryHereSystem=(state,job)=>window.nativeSystemCatalog?.sameSystem(state.system,job.toSystem??1)??state.system===1;
  const deliveryHere=(state,job)=>deliveryHereSystem(state,job)&&Number(state.localBody)===Number(job.to);
  const itemIcons={antimatter:'startup/resources/antimatter.png',dilithium:'assets/inventory-ores/dilithium.png',deuranium:'startup/resources/deuranium.png',food:'assets/ui/food.svg',latinum:'startup/resources/latinum.png'};
  const goodIcons=['assets/ui/mineral.svg','assets/ui/metal.svg','assets/ui/components.svg','assets/ui/computers.svg','assets/ui/fuel.svg','assets/ui/food.svg','assets/ui/medicine.svg','startup/resources/deuranium.png','assets/ui/hull-sections.svg'];
  const compact=value=>qty(value)>=10000?new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(qty(value)):fmt(value);
  const pageSize=()=>gridColumns*gridRows;
  function fitLayout(){
    cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(()=>{
      if(root.hidden)return;
      const grid=root.querySelector('.inventory-grid'),rig=root.querySelector('.inventory-rig'),album=root.querySelector('.inventory-collectable-grid');
      let columns=gridColumns,rows=gridRows,bays=bayRows,albumColumns=collectableColumns,albumRows=collectableRows;
      if(grid?.getClientRects().length&&grid.clientWidth>0){columns=Math.max(2,Math.min(6,Math.floor((grid.clientWidth+8)/112)));rows=Math.max(1,Math.min(4,Math.floor((grid.clientHeight+8)/104)));}
      if(album?.getClientRects().length&&album.clientWidth>0){albumColumns=Math.max(2,Math.min(3,Math.floor((album.clientWidth+12)/130)));albumRows=Math.ceil(6/albumColumns);root.dataset.collectableCompact=String((album.clientHeight-12*(albumRows-1))/albumRows<125);}
      if(rig?.getClientRects().length&&rig.clientHeight>0)bays=window.nativeEquipmentPanel.measureRows(rig,bayRows);
      if(columns!==gridColumns||rows!==gridRows||bays!==bayRows||albumColumns!==collectableColumns||albumRows!==collectableRows){
        collectableColumns=albumColumns;collectableRows=albumRows;
        gridColumns=columns;gridRows=rows;bayRows=bays;
        const state=bridge.getState();
        if(equipmentSelection?.type==='cell'){
          const cells=state.inventoryLayout?.cells||[],order=filter==='all'?cells:cells.filter(key=>key&&keyKind(key)===filter),index=order.indexOf(equipmentSelection.key);
          if(index>=0)inventoryPage=Math.floor(index/pageSize());
          const instance=equipmentSelection.key?.startsWith('equipment:')?state.shipEquipment.instances[equipmentSelection.key.slice(10)]:null;
          const bay=instance&&window.nativeShipEquipment.bayLayout(state).bays.find(b=>b.category===instance.category&&b.index===fitIndex);
          if(bay)bayPage=Math.floor(bay.cell/(bay.zone==='drones'?6:bayRows));
        }else if(equipmentSelection?.type==='slot'){
          const bay=window.nativeShipEquipment.bayLayout(state).bays.find(b=>b.category===equipmentSelection.category&&b.index===equipmentSelection.index);
          if(bay)bayPage=Math.floor(bay.cell/(bay.zone==='drones'?6:bayRows));
        }
        render();
      }
    });
  }
  const keyKind=key=>key?.startsWith('equipment:')?'equipment':key?.startsWith('freight:')||key?.startsWith('contract:')?'freight':'supplies';
  const item=(name,value,unit='',kind='supply',customIcon)=>{
    const resource=String(name).toLowerCase(),icon=customIcon||(kind==='mineral'?window.nativeOutfittingView.minerals[resource]?.icon:null)||itemIcons[resource]||`assets/ui/${kind==='mineral'?'mineral':'freight'}.svg`;
    return window.nativeOutfittingView.inventoryStack(kind==='mineral'?window.nativeOutfittingView.minerals[resource]?.name||name:name,value,{art:`<img src="${icon}" alt="">`,unit});
  };
  const locationFor=node=>window.nativeEquipmentPanel.location(node);
  function findLocation(at){return at?.type==='cell'?root.querySelector(`[data-inventory-cell="${at.index}"]`):root.querySelector(`[data-equipment-place="slot"][data-equipment-kind="${at?.category}"][data-equipment-index="${at?.index}"]`);}
  function feedback(kind,from,to,origin){
    window.nativeMenuSounds?.inventory(kind);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const target=findLocation(to)||findLocation(from)||root.querySelector('.inventory-inspector');
    target?.animate([{outline:'2px solid transparent',offset:0},{outline:`2px solid ${kind==='reject'?'#edaa91':'#9de4c9'}`,offset:.3},{outline:'2px solid transparent',offset:1}],{duration:360});
    if(kind==='reject'||!origin||!target)return;
    const end=target.getBoundingClientRect(),ghost=document.createElement('div');ghost.className='inventory-transfer-ghost';ghost.innerHTML=origin.html;
    Object.assign(ghost.style,{left:origin.x+'px',top:origin.y+'px'});root.append(ghost);
    const animation=ghost.animate([{transform:'translate(-50%,-50%) scale(.9)',opacity:.9},{transform:`translate(calc(-50% + ${end.x+end.width/2-origin.x}px),calc(-50% + ${end.y+end.height/2-origin.y}px)) scale(.4)`,opacity:0}],{duration:240,easing:'ease-out'});
    animation.onfinish=()=>ghost.remove();
  }
  function transfer(from,to){
    const source=findLocation(from),bounds=source?.getBoundingClientRect(),icon=source?.querySelector('.inventory-item-icon,.inventory-system-icon,.inventory-dot-icon');
    const origin=bounds?{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,html:icon?.innerHTML||''}:null;
    const context=sectionContext(bridge.getState()),result=bridge.moveInventory({from,to,...(context?{prometheusKey:context.key}:{})});
    equipmentNote=result?.ok?(result.saved===false?'Item moved, but saving failed. Use Save to try again.':to.type==='slot'?'Equipment installed.':from.type==='slot'?'Equipment removed and stored.':'Item moved.'):(result?.error||'Unable to move that item.');
    if(result?.ok){
      equipmentSelection=null;
      if(matchMedia('(max-width:760px)').matches)view=to.type==='slot'?'loadout':'cargo';
      if(to.type==='slot'){const bay=window.nativeShipEquipment.bayLayout(bridge.getState()).bays.find(b=>b.category===to.category&&b.index===to.index);if(bay)bayPage=Math.floor(bay.cell/(bay.zone==='drones'?6:bayRows));}
      if(to.type==='cell'){
        const cells=(context?window.nativePrometheusLoadouts.layoutFor(bridge.getState(),context.key):window.nativeShipEquipment.inventoryLayout(bridge.getState())).cells;
        if(filter!=='all'&&keyKind(cells[to.index])!==filter)filter='all';
        const order=filter==='all'?null:cells.map((key,index)=>key&&keyKind(key)===filter?index:null).filter(index=>index!==null);
        inventoryPage=Math.floor((order?order.indexOf(to.index):to.index)/pageSize());
      }
    }
    render();
    if(result?.ok)findLocation(to)?.focus({preventScroll:true});
    feedback(result?.ok?(to.type==='slot'?'equip':'unequip'):'reject',from,to,origin);
  }
  function inspector(state,ship,eq,tiles){
    const detail=window.nativeEquipmentPanel.inspect(state,ship,eq,{selection:equipmentSelection,fitIndex,note:equipmentNote,tiles});fitIndex=detail.fitIndex;return detail.html;
  }
  function preview(state,ship){window.nativeOutfittingView.preview(root,state,ship);}
  function collectableSlot({record,number,clueId,clueAvailable}){
    const inspect=record&&window.nativeCollectables?.get(record.id),tag=inspect||clueId?'button':'div';
    const label=record?`${record.name}${inspect?' · View item information':''}`:`Undiscovered collectable ${number} · ${clueAvailable?'Read a clue':'Clue locked'}`;
    const control=inspect?`type="button" data-collectable-info="${safe(record.id)}" data-focus-key="collectable-${safe(record.id)}"`:clueId?`type="button" data-collectable-clue="${safe(clueId)}" data-focus-key="clue-${safe(clueId)}"`:'role="img"';
    return `<${tag} class="inventory-collectable-slot${record?' is-collected':' is-missing'}" data-collectable-slot="${number}" data-collected="${!!record}" data-clue-available="${!!clueAvailable}" ${control} aria-label="${safe(label)}" ${record?`title="${safe(record.description||record.name)}"`:''}><span class="inventory-collectable-number" aria-hidden="true">${String(number).padStart(2,'0')}</span>${record?`<span class="inventory-collectable-check" aria-hidden="true">✓</span><span class="inventory-collectable-art"><img src="${safe(record.icon||'assets/ui/collectables.svg')}" alt=""></span><strong class="inventory-collectable-name">${safe(record.name)}</strong><small>${inspect?'VIEW RECORD':'COLLECTED'}</small>`:`<span class="inventory-collectable-question" aria-hidden="true">?</span><strong class="inventory-collectable-name">Undiscovered</strong><small>${clueAvailable?'READ CLUE':'CLUE LOCKED'}</small>`}</${tag}>`;
  }
  function render(){
    if(root.hidden||!bridge)return;
    const focused=document.activeElement,focusKey=focused&&root.contains(focused)?focused.dataset.focusKey:null;
    const state=bridge.getState(),equipment=window.nativeShipEquipment,context=sectionContext(state),eq=context?.eq||equipment.ensure(state),subject=context?.subject||state,ship=context?.ship||shipFor(state);
    if(eq.slots.repairDrone.some(id=>eq.instances[id]?.hull>0))window.nativeRepairVisuals?.ensure().catch(()=>{});
    const freightGoods=Object.entries(state.solFreightHold||{}).map(([id,amount])=>({id:Number(id),name:window.nativeSolEconomy.goods[Number(id)]||`Good ${id}`,amount:Number(amount)})).filter(entry=>entry.amount>0);
    const jobs=Array.isArray(state.localContracts)?state.localContracts:[];
    const collectables=Array.isArray(state.collectables)?state.collectables.filter(item=>item&&typeof item.name==='string'&&item.name.trim()):[];
    const catalog=window.nativeCollectables?.catalog||[],catalogIds=new Set(catalog.map(item=>item.id)),owned=new Map(collectables.filter(item=>catalogIds.has(item.id)).map(item=>[item.id,item]));
    // Catalog order defines permanent slots; retain older items outside the catalog too.
    const clueLimit=window.nativeCollectables?.clueProgress(state).unlocked||0;
    const album=[...catalog.map(item=>({record:owned.get(item.id)||null,clueId:owned.has(item.id)?null:item.id,clueAvailable:item.index<clueLimit})),...collectables.filter(item=>!catalogIds.has(item.id)).map(record=>({record}))].map((entry,index)=>({...entry,number:index+1}));
    const collectedCount=album.filter(entry=>entry.record).length,collectableSize=6;
    const deliverySize=innerWidth<=760||innerHeight<780?1:2,deliveryPages=Math.max(1,Math.ceil(jobs.length/deliverySize));deliveryPage=Math.max(0,Math.min(deliveryPage,deliveryPages-1));
    const shownJobs=jobs.slice(deliveryPage*deliverySize,(deliveryPage+1)*deliverySize);
    const collectablePages=Math.max(1,Math.ceil(album.length/collectableSize));collectablePage=Math.max(0,Math.min(collectablePage,collectablePages-1));
    const shownCollectables=album.slice(collectablePage*collectableSize,(collectablePage+1)*collectableSize);
    const bays=equipment.bayLayout(state).bays;
    const bayView=window.nativeEquipmentPanel.bayPages(bays,bayRows,bayPage),bayPages=bayView.pages;bayPage=bayView.page;
    const used=equipment.cargoUsed(state);
    const minerals=Object.entries(state.minerals||{}).filter(([,amount])=>Number(amount)>0);
    const selected=(kind,type,index)=>equipmentSelection?.category===kind&&equipmentSelection.type===type&&equipmentSelection.index===index;
    const slot=(kind,id,index)=>window.nativeOutfittingView.slot(state,ship,eq,kind,id,index,{selected:selected(kind,'slot',index),compatible:!!equipmentSelection&&equipmentSelection.category===kind});
    const thrusters=ship.thrusters,hullSelected=equipmentSelection?.type==='hull';
    const hullSystems=window.nativeEquipmentPanel.hullSystem(ship,hullSelected);
    const shieldMax=qty(ship.shields),hullMax=qty(ship.hull),capacity=qty(ship.cargo);
    const deployment=window.nativeShipRepairs?.deploymentStatus(state)||{ok:false,error:'Repair systems unavailable',available:0};
    const repairMode=window.nativeShipRepairs?.repairMode(state)||'manual';
    const distress=window.nativeShipRepairs?.playerDistressStatus(state)||{ok:false,message:'Medical assistance unavailable.'};
    const systemName=Number(state.system)===1?'Sol System':`${window.VexedMirrorWorld.systems.find(entry=>entry.id===Number(state.system))?.name||'Unknown'} System`;
    const standingRaw=Number(state.localPrestige?.[state.system]),standing=Number.isFinite(standingRaw)?Math.round(standingRaw):0;
    const standingDisplay=standing>0?`+${standing}`:String(standing),standingStatus=standing>=100?'Allied':standing<0?'Hostile':'Neutral';
    const positiveFill=Math.min(100,Math.max(0,standing))/2,negativeFill=Math.min(100,Math.max(0,-standing))/2;
    const canPlotDelivery=!state.localCruise&&!state.arrivalApproach;
    const inventoryTiles=[...eq.locker.map((id,index)=>{const instance=eq.instances[id],data=equipment.forInstance(instance),assigned=context&&['top','middle','bottom'].find(key=>state.prometheusLoadouts.plans[key].weapon.includes(id)),label=assigned?window.nativePrometheusLoadouts.names[assigned]:'';return {key:'equipment:'+id,kind:'equipment',category:instance.category,name:(data?.name||instance.modelId)+(label?' · Assigned to '+label:''),html:window.nativeEquipmentPanel.equipmentContents(instance,data)+(label?`<span class="inventory-item-tag">${safe(label)} FITTED</span>`:''),locker:index};}),
      ...[['Antimatter',state.antimatter],['Dilithium',state.dilithium],['Deuranium',state.deuranium],['Food',state.food]].filter(([,amount])=>Number(amount)>0).map(([name,amount])=>({key:'supply:'+name.toLowerCase(),kind:'supplies',name,html:item(name,amount)})),
      ...minerals.map(([name,amount])=>({key:'mineral:'+name,kind:'supplies',name,html:item(name.charAt(0).toUpperCase()+name.slice(1),amount,'','mineral')})),
      ...freightGoods.map(entry=>({key:'freight:'+entry.id,kind:'freight',name:entry.name,html:item(entry.name,entry.amount,' t','freight',goodIcons[entry.id])})),
      ...jobs.map(job=>({key:'contract:'+job.id,kind:'freight',name:window.nativeSolEconomy.goods[job.good]||'Cargo',html:`<span class="inventory-item-icon"><img src="${goodIcons[job.good]||'assets/ui/freight.svg'}" alt=""></span><span class="inventory-item-name">${safe(window.nativeSolEconomy.goods[job.good]||'Cargo')}</span><strong class="inventory-item-count">${fmt(job.tons)} t</strong><span class="inventory-item-tag">CONTRACT</span>`}))
    ];
    const layout=context?window.nativePrometheusLoadouts.layoutFor(state,context.key):equipment.inventoryLayout(state),tiles=new Map(inventoryTiles.map(tile=>[tile.key,tile]));
    const inventoryPageSize=pageSize();
    const displayCells=filter==='all'?Array.from({length:layout.cells.length},(_,i)=>i):layout.cells.map((key,index)=>tiles.get(key)?.kind===filter?index:null).filter(index=>index!==null);
    const matchingCount=displayCells.filter(index=>tiles.has(layout.cells[index])).length;
    const inventoryPages=Math.max(1,Math.ceil(displayCells.length/inventoryPageSize),filter==='all'?inventoryPageFloor:1);
    inventoryPage=Math.max(0,Math.min(inventoryPage,inventoryPages-1));
    const occupied=new Set(displayCells);let free=0;
    while(displayCells.length<inventoryPages*inventoryPageSize){
      if(filter==='all')displayCells.push(displayCells.length);
      else{while(layout.cells[free]||occupied.has(free))free++;displayCells.push(free);occupied.add(free++);}
    }
    const visibleTiles=Array.from({length:inventoryPageSize},(_,offset)=>{
      const index=displayCells[inventoryPage*inventoryPageSize+offset],key=layout.cells[index],tile=tiles.get(key),active=equipmentSelection?.key===key&&!!key;
      const attributes=tile?.kind==='equipment'?`data-equipment-kind="${tile.category}" data-equipment-place="locker" data-equipment-index="${tile.locker}"`:'';
      return window.nativeOutfittingView.inventoryCell(tile,{index,key:key||'',selected:active,attributes});
    });
    const fittedCount=Object.values(eq.slots).flat().filter(Boolean).length,totalSlots=Object.values(eq.slots).flat().length;
    root.dataset.view=view;root.dataset.rightPage=rightPage;
    root.dataset.prometheus=String(!!context);root.dataset.prometheusTab=context?.key||'';
    root.dataset.dragging=String(mouseDragging||!!touchDrag?.ghost);
    root.dataset.details=equipmentSelection&&root.dataset.dragging!=='true'&&(innerWidth<=760||innerHeight<=650)?'overlay':'inline';
    root.style.setProperty('--inventory-columns',gridColumns);root.style.setProperty('--inventory-rows',gridRows);
    root.innerHTML=`<div class="inventory-panel">
      <header class="inventory-header"><div class="inventory-heading"><span class="inventory-kicker">VESSEL MANAGEMENT <b>/</b> INVENTORY</span><h2>${safe(state.shipName||ship.name)}</h2><p class="inventory-ship-caption">${safe(ship.name)}<span class="inventory-location">${safe(systemName)}</span></p></div><div class="inventory-standing ${standing<0?'negative':standing>=100?'allied':'neutral'}"><div class="inventory-standing-label"><span>LOCAL STANDING · ${standingStatus}</span><strong>${standingDisplay}</strong></div><div class="inventory-standing-track" role="meter" aria-label="Standing in ${safe(systemName)}" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${Math.max(-100,Math.min(100,standing))}" aria-valuetext="${standingDisplay} ${standingStatus}"><i class="inventory-standing-negative" style="width:${negativeFill}%"></i><i class="inventory-standing-positive" style="width:${positiveFill}%"></i><b class="inventory-standing-zero"></b></div></div><div class="inventory-resources" aria-label="Ship resources"><div class="inventory-resource inventory-money" aria-label="Latinum: ${fmt(state.latinum)}"><img src="${itemIcons.latinum}" alt=""><span><small>LATINUM</small><strong>${fmt(state.latinum)}</strong></span></div><div class="inventory-resource inventory-fuel" aria-label="Antimatter: ${fmt(state.antimatter)}"><img src="${itemIcons.antimatter}" alt=""><span><small>ANTIMATTER</small><strong>${fmt(state.antimatter)}</strong></span></div></div><button class="inventory-close" data-focus-key="close" type="button" aria-label="Close ship inventory">×<small>ESC</small></button></header>
      <nav class="inventory-view-tabs" aria-label="Inventory pages"><button type="button" data-focus-key="view-loadout" data-inventory-view="loadout" aria-pressed="${view==='loadout'}">Ship & loadout</button><button type="button" data-focus-key="view-cargo" data-inventory-view="cargo" aria-pressed="${view==='cargo'}">Cargo & deliveries</button></nav>
      <div class="inventory-body">
        <section class="inventory-loadout" aria-label="Ship equipment"><div class="inventory-section-title"><span><b>01</b> SHIP LOADOUT</span><strong>${fittedCount} / ${totalSlots} bays fitted</strong></div>
          ${context?`<div class="inventory-prometheus"><nav class="inventory-prometheus-tabs" role="tablist" aria-label="Prometheus inventories">${window.nativePrometheusLoadouts.keys.map(key=>{const c=window.nativePrometheusLoadouts.context(state,key);return `<button type="button" role="tab" data-prometheus-tab="${key}" data-focus-key="prometheus-${key}" aria-selected="${key===context.key}" tabindex="${key===context.key?0:-1}"><strong>${safe(c.name)}</strong><small>${safe(c.status)}</small></button>`;}).join('')}</nav><div class="inventory-prometheus-pilot"><span>${safe(context.status)} &middot; Shared cargo and resources</span><button type="button" data-pilot-section="${context.type}" data-focus-key="pilot-section" ${context.canPilot?'':'disabled'}>${context.piloted?'Piloting '+safe(context.name):'Pilot '+safe(context.name)}</button></div><p class="inventory-prometheus-help">Weapon mounts are saved for this hull. Engines, shields and DOTs are managed from Combined ship.</p></div>`:''}
          ${bayView.html}
          ${window.nativeOutfittingView.rig(subject,ship,eq,{renderSlot:slot,bayWindow:{page:bayPage,rows:bayRows},hullSystems})}
          <div class="inventory-drone-controls"><div class="inventory-repair-mode" role="group" aria-label="Repair drone mode">${['manual','auto'].map(mode=>`<button type="button" data-repair-mode="${mode}" data-focus-key="repair-mode-${mode}" aria-pressed="${repairMode===mode}">${mode==='manual'?'Manual':'Auto'}</button>`).join('')}</div><button type="button" data-deploy-repair-drones data-focus-key="deploy-drones" aria-describedby="inventory-deploy-status" ${repairMode==='manual'?'':'hidden'} ${deployment.ok?'':'disabled'}>Deploy Repair Drones</button><button type="button" data-request-distress data-focus-key="request-distress" aria-label="${safe(distress.label||'Distress Call')}: ${safe(distress.message)}" ${distress.ok||distress.pending?'':'hidden'} ${distress.ok?'':'disabled'}>${safe(distress.label||'Distress Call')}</button><span id="inventory-deploy-status">${safe(distress.pending?distress.message:deployment.error||(repairMode==='auto'?'Auto repair ready':`${deployment.available} DOT${deployment.available===1?'':'s'} ready`)+' · Uses deuranium')}</span></div>
          <div class="inventory-vitals"><div class="inventory-hull"><span>HULL</span><strong>${fmt(subject.hull)} / ${fmt(hullMax)}</strong><div class="inventory-meter"><i style="--fill:${hullMax?Math.max(0,Math.min(100,qty(subject.hull)/hullMax*100)):0}%"></i></div></div><div class="inventory-shield"><span>SHIELDS</span><strong>${fmt(subject.shields)} / ${fmt(shieldMax)}</strong><div class="inventory-meter"><i style="--fill:${shieldMax?Math.max(0,Math.min(100,qty(subject.shields)/shieldMax*100)):0}%"></i></div></div></div>
          ${equipmentNote?`<p class="inventory-hint" role="status">${safe(equipmentNote)}</p>`:''}


        </section>
        <section class="inventory-cargo" aria-label="Ship inventory, deliveries and collectables"><div class="inventory-section-title"><span><b>02</b> CARGO HOLD</span><strong>${state.devMode?'Dev cargo unlimited':`Cargo ${fmt(used)} / ${fmt(capacity)} t`}</strong></div><div class="inventory-capacity" role="meter" aria-label="Cargo capacity" aria-valuemin="0" aria-valuemax="${Math.max(1,capacity)}" aria-valuenow="${Math.min(used,Math.max(1,capacity))}" aria-valuetext="${fmt(used)} of ${fmt(capacity)} tonnes"><i style="--fill:${capacity?Math.max(0,Math.min(100,used/capacity*100)):0}%"></i></div>
          <nav class="inventory-right-tabs" aria-label="Inventory sections"><button type="button" data-focus-key="right-inventory" data-right-page="inventory" aria-pressed="${rightPage==='inventory'}">Inventory <span>${inventoryTiles.length}</span></button><button type="button" data-focus-key="right-deliveries" data-right-page="deliveries" aria-pressed="${rightPage==='deliveries'}">Deliveries <span>${jobs.length}</span></button><button type="button" data-focus-key="right-collectables" data-right-page="collectables" aria-pressed="${rightPage==='collectables'}">Collectables <span>${collectedCount}</span></button></nav>
          <div class="inventory-items-page"><nav class="inventory-filters" aria-label="Filter inventory category">${[['all','All items'],['equipment','Equipment'],['supplies','Supplies'],['freight','Freight']].map(([key,label])=>`<button type="button" data-focus-key="filter-${key}" data-inventory-filter="${key}" aria-pressed="${filter===key}">${label}</button>`).join('')}</nav><div class="inventory-grid" aria-label="Stored equipment and cargo">${visibleTiles.join('')}</div><p class="inventory-arrange-hint" role="status">${safe(equipmentNote||'Select to inspect. Drag to fit or arrange. Positions save automatically.')}</p><div class="inventory-page-nav"><span>${matchingCount} ${filter==='all'?'items aboard':'matching items'}</span><div>${filter==='all'?'<button type="button" data-inventory-page="add" aria-label="Add inventory arrangement page">+ Space</button>':''}<button type="button" data-focus-key="previous" data-inventory-page="previous" ${inventoryPage===0?'disabled':''} aria-label="Previous inventory page">&lsaquo;</button><span>${inventoryPage+1} / ${inventoryPages}</span><button type="button" data-focus-key="next" data-inventory-page="next" ${inventoryPage>=inventoryPages-1?'disabled':''} aria-label="Next inventory page">&rsaquo;</button></div></div></div>

          <div class="inventory-deliveries-page" aria-label="Delivery contracts"><div class="inventory-deliveries-summary"><span>ACTIVE CONTRACTS</span><strong>${jobs.length} / 2</strong></div>${jobs.length?`<div class="inventory-contract-cards">${shownJobs.map((job,index)=>`<article class="inventory-contract-card"><div class="inventory-contract-main"><div class="inventory-contract-planet"><img src="${deliveryAddress(job).art}" alt="${safe(deliveryLabel(job))}"></div><div class="inventory-contract-details"><span class="inventory-contract-kicker">DELIVERY ${String(deliveryPage*deliverySize+index+1).padStart(2,'0')} / ${safe(deliveryLabel(job,'from'))} TO</span><strong class="inventory-contract-destination">${safe(deliveryLabel(job))}</strong><div class="inventory-contract-cargo"><img src="${goodIcons[job.good]||'assets/ui/freight.svg'}" alt=""><span>${fmt(job.tons)} t ${safe(window.nativeSolEconomy.goods[job.good]||'Cargo')} aboard</span></div></div><div class="inventory-contract-payment"><span>ON DELIVERY</span><strong>${fmt(job.pay)}</strong><small>LATINUM</small></div></div><div class="inventory-contract-actions"><button type="button" data-delivery-action="cruise" data-delivery-id="${safe(job.id)}" ${canPlotDelivery&&!deliveryHere(state,job)?'':'disabled'}>Cruise to ${safe(deliveryLabel(job))}</button><button type="button" data-delivery-action="select" data-delivery-id="${safe(job.id)}" aria-pressed="${deliveryHereSystem(state,job)&&Number(state.localNavTarget)===Number(job.to)}" ${canPlotDelivery?'':'disabled'}>${deliveryHereSystem(state,job)&&Number(state.localNavTarget)===Number(job.to)?'Navigation selected':'Select for navigation'}</button></div></article>`).join('')}</div>`:'<div class="inventory-deliveries-empty"><img src="assets/ui/freight.svg" alt=""><strong>No active deliveries</strong><span>Accept a shipping contract at a port to see its cargo, route, and payment here.</span></div>'}${deliveryPages>1?`<nav class="inventory-delivery-pages" aria-label="Delivery pages"><button type="button" data-delivery-page="previous" ${deliveryPage===0?'disabled':''}>&lsaquo;</button><span>${deliveryPage+1} / ${deliveryPages}</span><button type="button" data-delivery-page="next" ${deliveryPage>=deliveryPages-1?'disabled':''}>&rsaquo;</button></nav>`:''}${deliveryNote?`<p class="inventory-delivery-note" role="status">${safe(deliveryNote)}</p>`:''}</div>
          <div class="inventory-collectables-page" aria-label="Collectables album"><div class="inventory-deliveries-summary"><span>COLLECTION ARCHIVE</span><strong>${collectedCount} / ${album.length} collected</strong></div><div class="inventory-collectable-grid" aria-label="Collection slots" style="--collectable-columns:${collectableColumns};--collectable-rows:${collectableRows}">${shownCollectables.map(collectableSlot).join('')}</div><p class="inventory-collectables-hint">First six clues available. Each artifact found reveals one more.</p><nav class="inventory-delivery-pages inventory-collectable-pages" aria-label="Collectables pages"><button type="button" data-collectable-page="previous" data-focus-key="collectables-previous" aria-label="Previous collectables page" ${collectablePage===0?'disabled':''}>&lsaquo;</button><span role="status">Page ${collectablePage+1} / ${collectablePages}</span><button type="button" data-collectable-page="next" data-focus-key="collectables-next" aria-label="Next collectables page" ${collectablePage>=collectablePages-1?'disabled':''}>&rsaquo;</button></nav></div>
        </section>
      </div>${inspector(subject,ship,eq,tiles)}</div>`;
    root.querySelectorAll('button').forEach(button=>{
      const effect=document.createElement('span');
      effect.className='inventory-control-fx';effect.setAttribute('aria-hidden','true');
      button.append(effect);
    });
    root.querySelector('.inventory-close').onclick=close;
    root.querySelectorAll('[data-prometheus-tab]').forEach(button=>{
      button.onclick=()=>{prometheusTab=button.dataset.prometheusTab;equipmentSelection=null;equipmentNote='';bayPage=inventoryPage=0;render();root.querySelector(`[data-prometheus-tab="${prometheusTab}"]`)?.focus();};
      button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const keys=window.nativePrometheusLoadouts.keys,index=keys.indexOf(prometheusTab),next=event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;root.querySelector(`[data-prometheus-tab="${keys[next]}"]`).click();};
    });
    root.querySelector('[data-pilot-section]')?.addEventListener('click',event=>{const result=bridge.pilotSection?.(Number(event.currentTarget.dataset.pilotSection));equipmentSelection=null;equipmentNote=result?.ok&&result.saved===false?'Pilot switched, but saving failed. Use Save to try again.':result?.message||result?.error||'';render();});
    if(context&&context.key!=='combined'){
      root.querySelectorAll('[data-equipment-place="slot"]:not([data-equipment-kind="weapon"])').forEach(button=>{button.disabled=true;button.title='Shared system - manage from Combined ship.';});
      const selectedItem=eq.instances[equipmentSelection?.key?.slice(10)];
      if(selectedItem&&selectedItem.category!=='weapon'){const fit=root.querySelector('[data-equipment-action="equip"]');if(fit){fit.disabled=true;fit.title='Fit shared systems from Combined ship.';}const repair=root.querySelector('[data-repair-device]');if(repair)repair.disabled=true;}
      const dots=root.querySelector('.inventory-drone-bays .inventory-section-title span');if(dots)dots.textContent='COMMAND DOT REPAIR BAYS';
      if(!context.piloted){const deploy=root.querySelector('[data-deploy-repair-drones]');if(deploy)deploy.disabled=true;const message=root.querySelector('#inventory-deploy-status');if(message)message.textContent='Pilot this section to repair it with command DOTs.';}
    }
    root.querySelectorAll('[data-bay-page]').forEach(button=>button.onclick=()=>{bayPage+=button.dataset.bayPage==='next'?1:-1;render();});
    root.querySelectorAll('[data-delivery-page]').forEach(button=>button.onclick=()=>{deliveryPage+=button.dataset.deliveryPage==='next'?1:-1;render();});
    root.querySelectorAll('[data-collectable-page]').forEach(button=>button.onclick=()=>{collectablePage+=button.dataset.collectablePage==='next'?1:-1;render();});
    root.querySelectorAll('[data-collectable-info]').forEach(button=>button.onclick=()=>window.nativeCollectablesView?.show(button.dataset.collectableInfo,{inspect:true}));
    root.querySelectorAll('[data-collectable-clue]').forEach(button=>button.onclick=()=>window.nativeCollectablesView?.showClue(button.dataset.collectableClue));
    root.querySelectorAll('.inventory-collectable-art img').forEach(image=>image.onerror=()=>{image.onerror=null;image.src='assets/ui/collectables.svg';});
    root.querySelector('[data-fit-slot]')?.addEventListener('change',event=>{fitIndex=Number(event.target.value);render();});
    root.querySelector('[data-hull-system]').onclick=()=>{equipmentSelection=hullSelected?null:{type:'hull',key:'hull:thrusters'};equipmentNote='';render();};
    root.querySelectorAll('[data-equipment-action]').forEach(button=>button.onclick=()=>{
      if(button.dataset.equipmentAction==='cancel'){equipmentSelection=null;equipmentNote='';render();return;}
      if(!equipmentSelection||equipmentSelection.type==='hull')return;
      if(button.dataset.equipmentAction==='equip')transfer(equipmentSelection,{type:'slot',category:equipmentSelection.category,index:fitIndex});
      else{let index=0;while(layout.cells[index])index++;transfer(equipmentSelection,{type:'cell',index});}
    });
    root.querySelectorAll('[data-repair-mode]').forEach(button=>button.onclick=()=>{const result=bridge.setRepairMode?.(button.dataset.repairMode);equipmentNote=result?.ok?(result.saved===false?'Repair mode changed, but saving failed. Use Save to try again.':''):result?.error||'Unable to change repair mode.';render();});
    root.querySelector('[data-deploy-repair-drones]').onclick=()=>{const result=bridge.deployRepairDrones?.();if(result?.ok&&result.saved!==false){close();document.getElementById('space')?.focus({preventScroll:true});return;}equipmentNote=result?.saved===false?'Drones deployed, but saving failed. Use Save to try again.':result?.error||'Unable to deploy repair drones.';render();};
    root.querySelector('[data-request-distress]').onclick=()=>{const result=bridge.requestDistressCall?.();if(result?.ok){close();document.getElementById('space')?.focus({preventScroll:true});return;}equipmentNote=result?.error||'Unable to send distress call.';render();};
    root.querySelector('[data-repair-device]')?.addEventListener('click',event=>{const result=bridge.repairDevice?.(event.currentTarget.dataset.repairDevice);equipmentNote=result?.message||result?.error||'Unable to repair device.';if(result?.ok)window.nativeMenuSounds?.inventory('equip');render();});
    root.querySelectorAll('[data-inventory-view]').forEach(button=>button.onclick=()=>{view=button.dataset.inventoryView;render();});
    root.querySelectorAll('[data-right-page]').forEach(button=>button.onclick=()=>{rightPage=button.dataset.rightPage;deliveryNote='';render()});
    root.querySelectorAll('[data-delivery-action]').forEach(button=>button.onclick=()=>{const result=bridge.deliveryNavigation?.(Number(button.dataset.deliveryId),button.dataset.deliveryAction);if(result?.ok){close();document.getElementById('space')?.focus({preventScroll:true});return}deliveryNote=result?.error||'Unable to plot this delivery.';render()});
    root.querySelectorAll('[data-inventory-page]').forEach(button=>button.onclick=()=>{if(button.dataset.inventoryPage==='add'){inventoryPageFloor=inventoryPages+1;inventoryPage=inventoryPages;}else inventoryPage+=button.dataset.inventoryPage==='next'?1:-1;render()});
    root.querySelectorAll('[data-inventory-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.inventoryFilter;inventoryPage=0;render()});
    window.nativeEquipmentPanel.bindTargets(root,{getSelection:()=>equipmentSelection,setSelection:value=>equipmentSelection=value,
      suppressed:()=>performance.now()<suppressClickUntil,dragState:value=>mouseDragging=value,transfer,render,
      choose(value){equipmentSelection=value;if(value)fitIndex=Math.max(0,eq.slots[value.category]?.findIndex(id=>!id)??0);equipmentNote='';render();},
      reject(message){equipmentNote=message;render();}});
    root.querySelectorAll('[data-inventory-page],[data-inventory-view],[data-right-page="inventory"],[data-bay-page]').forEach(button=>{
      let hover=0;button.ondragover=event=>{if(button.disabled)return;event.preventDefault();if(!hover)hover=setTimeout(()=>{hover=0;button.click();},600);};button.ondragleave=()=>{clearTimeout(hover);hover=0;};button.ondrop=event=>{event.preventDefault();clearTimeout(hover);hover=0;};
    });
    fitLayout();
    if(focusKey){const target=[...root.querySelectorAll('[data-focus-key]')].find(node=>node.dataset.focusKey===focusKey);(target&&!target.disabled&&getComputedStyle(target).visibility!=='hidden'?target:root.dataset.details==='overlay'?root.querySelector('.inventory-inspector select,.inventory-inspector button'):root.querySelector('.inventory-close')).focus({preventScroll:true});}
    preview(subject,ship);
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
    const nav=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-inventory-view],[data-inventory-page],[data-right-page="inventory"],[data-bay-page]');
    if(nav&&!nav.disabled&&drag.nav!==nav){drag.nav=nav;clearTimeout(drag.timer);drag.timer=setTimeout(()=>nav.click(),600);}
    if(!nav){clearTimeout(drag.timer);drag.nav=null;}
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
  root.addEventListener('wheel',event=>event.preventDefault(),{passive:false});
  root.addEventListener('keydown',event=>{if(event.key==='Tab'){const nodes=[...root.querySelectorAll('button:not(:disabled),select:not(:disabled)')].filter(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'),first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}if(event.target.matches('select')&&event.code==='KeyI')event.stopPropagation();});
  function open(options={}){if(!bridge?.getState?.()||!root.hidden)return;previousFocus=document.activeElement;equipmentSelection=null;equipmentNote='';inventoryPage=0;inventoryPageFloor=1;bayPage=0;deliveryPage=0;collectablePage=0;rightPage=options?.page==='collectables'?'collectables':'inventory';view=rightPage==='collectables'?'cargo':'loadout';deliveryNote='';filter='all';if(window.nativePrometheusLoadouts?.supported(bridge.getState())){window.nativePrometheusLoadouts.initialize(bridge.getState());prometheusTab=window.nativePrometheusLoadouts.currentKey(bridge.getState());}root.hidden=false;dispatchEvent(new CustomEvent('native-inventorychange',{detail:{active:true,at:performance.now()}}));render();root.querySelector('.inventory-close')?.focus({preventScroll:true});}
  function close(){if(root.hidden)return;root.hidden=true;dispatchEvent(new CustomEvent('native-inventorychange',{detail:{active:false,at:performance.now()}}));window.nativeOutfittingView.stopPreview(root);if(touchDrag)clearTimeout(touchDrag.timer);touchDrag=null;root.innerHTML='';equipmentSelection=null;previousFocus?.focus?.({preventScroll:true});}
  addEventListener('resize',()=>{if(!root.hidden)render();});
  window.nativeShipInventory={attach(value){bridge=value;window.nativeEquipmentPanel.attachActions(value);},open,close,refresh:render,get active(){return !root.hidden}};
})();
