/* Shared Inventory/shipyard presentation. No fitting, purchases or simulation. */
(() => {
 'use strict';
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const paths={cargo:'M3 7h18v14H3zM3 7l4-4h10l4 4M8 7v14m8-14v14',hull:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 8h8v8H8z',shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM7 11l4 4 6-7',weapon:'M5 19 17 7m-3-3 6 6M4 15l5 5m6-17 6 6-5 5-6-6z',dot:'M8 8h8v8H8zM12 3v5m0 8v5M3 12h5m8 0h5M4 4l4 4m8 8 4 4M20 4l-4 4M8 16l-4 4',engine:'M7 4h10v10H7zM10 14v5m4-5v5M6 18l-2 4m14-4 2 4M10 8h4',utility:'M4 4h16v16H4zM12 7v10m-5-5h10',drive:'M4 7h4v10H4zM16 7h4v10h-4zM8 12h8M10 4l2-2 2 2m-4 16 2 2 2-2',ability:'m13 2-8 12h6l-1 8 9-13h-7l1-7Z'};
 paths.thrusters='M5 3h5v10H5zM14 3h5v10h-5zM10 8h4M7.5 13v5m9-5v5M5 17l2.5 5 2.5-5M14 17l2.5 5 2.5-5';
 const labels={weapon:'Weapon',repairDrone:'Dot bay',ability:'Ability bay',engineering:'Engines',shield:'Deflector'};
 const upgrades={repairDrone:'dot',engineering:'engine'};
 const minerals=Object.freeze({
  trellium:{name:'Trellium',icon:'assets/inventory-ores/trellium.png'},tritanium:{name:'Tritanium',icon:'assets/inventory-ores/tritanium.png'},
  dilithium:{name:'Dilithium',icon:'assets/inventory-ores/dilithium.png'},gallicite:{name:'Gallicite',icon:'assets/inventory-ores/gallicite.png'},
  benamite:{name:'Benamite',icon:'assets/inventory-ores/benamite.png'},deuranium:{name:'Deuranium ore',icon:'assets/inventory-ores/deuranium.png'},latinum:{name:'Latinum',icon:'startup/resources/latinum.png'}
 });
 const icon=kind=>`<svg class="outfit-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[upgrades[kind]||kind]||paths.utility}"></path></svg>`;
 const mineralIcon=key=>`<img class="outfit-mineral-icon" data-mineral-icon="${safe(key)}" src="${minerals[key]?.icon||'assets/ui/mineral.svg'}" alt="" aria-hidden="true">`;
 const art=data=>data?.icon?`<img src="${safe(data.icon)}" alt="">`:data?.id==='basic-dot'?'<img src="../flashtrek-broken-mirror/showcase-assets/dot-basic.png" alt="">':typeof data?.id==='number'?`<img src="../flashtrek-broken-mirror/showcase-assets/weapon-icon-remastered-${data.visualId??data.id}.png" alt="">`:icon(data?.category||'ability');
 function inventoryCell(tile,{index=0,key=tile?.key||'',selected=false,attributes='',draggable=true,classes='',hint='Drag to move'}={}){
  return `<button type="button" class="inventory-item ${tile?(tile.kind==='equipment'?'inventory-weapon-tile':'inventory-cargo-tile'):'inventory-blank'}${selected?' selected':''}${classes?' '+classes:''}" data-inventory-cell="${index}" data-item-key="${safe(key)}" data-focus-key="cell-${index}" ${attributes} ${tile?`${draggable?'draggable="true" ':''}data-kind="${tile.category||tile.kind}" aria-pressed="${selected}" title="${safe(tile.name)}${hint?' · '+safe(hint):''}" aria-label="${tile.kind==='equipment'?'Stored ':''}${safe(tile.name)}"`:`aria-label="Empty inventory tile ${index+1}"`}>${tile?tile.html:'<span class="inventory-empty-mark">+</span>'}</button>`;
 }
 function inventoryCount(amount){const value=Math.max(0,Number(amount)||0);return value>=10000?new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(value):value.toLocaleString(undefined,{maximumFractionDigits:3});}
 function inventoryStack(name,amount,{art='',unit=''}={}){
  return `<span class="inventory-item-icon">${art}</span><span class="inventory-item-name">${safe(name)}</span><strong class="inventory-item-count">${inventoryCount(amount)}${unit}</strong>`;
 }
 function material(key,amount,{held,owned=false}={}){
  const name=minerals[key]?.name||key,short=held!==undefined&&held<amount;
  return `<span class="outfit-material${short?' short':''}" title="${safe(name)}${held!==undefined?`: ${held} available / ${amount} required`:''}">${mineralIcon(key)}<span><strong>${Math.floor(Number(amount)||0).toLocaleString()}</strong> ${safe(name)}${held!==undefined?`<small>${held.toLocaleString()} available${short?' · need more':''}</small>`:owned?'<small>AVAILABLE</small>':''}</span></span>`;
 }
 function cost(s,q,{compact=false}={}){return `<div class="outfit-cost${compact?' compact':''}" aria-label="Upgrade cost">${material('latinum',q.price,{held:Math.floor(Number(s.latinum)||0)})}${Object.entries(q.materials||{}).map(([key,n])=>material(key,n,{held:window.nativeRegionalMinerals.held(s,key)})).join('')}</div>`;}
 function deviceCondition(instance){
  const value=window.nativeShipEquipment.condition(instance);if(value===null)return '';
  const text=value===0?'OFFLINE':Number(value.toFixed(1))+'%';
  return `<span class="outfit-device-condition${value<100?' worn':''}${value===0?' offline':''}" aria-label="Device condition: ${value.toFixed(1)} percent${value===0?', offline':''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m14 6 4 4 4-4a6 6 0 0 1-8 8L6 22l-4-4 8-8a6 6 0 0 1 8-8Z"/></svg>${text}</span>`;
 }
 function slot(s,ship,eq,kind,id,index,{selected=false,compatible=false}={}){
  const instance=eq.instances[id],data=window.nativeShipEquipment.forInstance(instance),label=`${kind==='weapon'?'Weapon slot':labels[kind]} ${index+1}: ${data?.name||'Empty bay'}${kind==='repairDrone'&&instance?` · ${Math.floor(Number(instance.hull)||0)} / 40 hull · ${instance.phase}`:''}`;
  const attrs=`data-focus-key="slot-${kind}-${index}" data-equipment-kind="${kind}" data-equipment-place="slot" data-equipment-index="${index}" data-item-key="${id?'equipment:'+safe(id):''}" aria-pressed="${selected}" aria-label="${safe(label)}" title="${safe(label)}"`;
  const classes=`${instance?'filled':'empty'}${selected?' selected':compatible?' compatible':''}`;
  if(kind==='repairDrone')return `<button type="button" class="inventory-slot inventory-system inventory-dot-slot ${classes}" ${attrs}><span class="inventory-dot-number">${String(index+1).padStart(2,'0')}</span><span class="inventory-dot-icon">${instance?art(data):'<span aria-hidden="true">+</span>'}</span><span class="inventory-dot-caption">${instance?'DOT':'Empty'}</span>${instance?`<span class="inventory-dot-health" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,(Number(instance.hull)||0)/40*100))}%"></i></span>`:''}</button>`;
  const detail=deviceCondition(instance);
  return `<button type="button" class="inventory-slot ${kind==='weapon'?'inventory-weapon':'inventory-system'} ${classes}" ${attrs}><span>${data?.id==='mining-laser'?'MINING LASER':labels[kind].toUpperCase()} ${String(index+1).padStart(2,'0')}</span><span class="inventory-slot-content"><span class="inventory-system-icon">${instance?art(data):icon(kind)}</span><span><strong>${safe(data?.name||'Empty bay')}</strong>${detail?`<small>${detail}</small>`:''}</span></span></button>`;
 }
 function rig(s,ship,eq,{renderSlot=(kind,id,index)=>slot(s,ship,eq,kind,id,index),draft=null,highlight=null,bayWindow=null,hullSystems=''}={}){
  const owner=window.nativeShipEquipment,limits={...owner.capacities(s)};
  if(draft)limits[draft.category]++;
  const layout=owner.bayLayout(s,limits),newKey=draft?draft.category+':'+draft.index:null,newBay=layout.bays.find(b=>b.key===newKey);
  // The draft reserves a display cell only; it never creates an owned bay.
  if(newBay&&Number.isInteger(draft.cell))newBay.cell=draft.cell;
  const zone=name=>{
   const list=layout.bays.filter(b=>b.zone===name),placing=newBay?.zone===name,byCell=new Map(list.map(b=>[b.cell,b]));
   const count=placing?layout.zones[name].count:Math.max(0,...list.map(b=>b.cell+1));
   const size=bayWindow?(name==='drones'?6:bayWindow.rows):count,start=bayWindow&&!(name==='drones'&&count<=6)?bayWindow.page*size:0;
   return Array.from({length:Math.max(0,Math.min(size,count-start))},(_,offset)=>{const cell=start+offset;
    const bay=byCell.get(cell),attrs=`data-bay-zone="${name}" data-bay-cell="${cell}"`;
    if(bay?.key===newKey)return `<button type="button" class="outfit-mount outfit-ghost${draft.chosen?' chosen':''}" ${attrs} data-place-bay="${cell}" aria-label="Place new ${labels[draft.category]} at mount ${cell+1}" aria-pressed="${!!draft.chosen}">${icon(draft.category)}<strong>NEW ${labels[draft.category].toUpperCase()}</strong><small>${draft.chosen?'Position selected':'Click to place here'}</small></button>`;
    if(bay){const added=highlight?.category===bay.category&&highlight.index===bay.index;return renderSlot(bay.category,eq.slots[bay.category]?.[bay.index],bay.index).replace('<button ',`<button ${attrs} data-bay-key="${bay.key}" `).replace('class="inventory-slot ',`class="inventory-slot ${added?'outfit-added ':''}`);}
    return placing?`<button type="button" class="outfit-mount outfit-target" ${attrs} data-place-bay="${cell}" aria-label="Place new ${labels[draft.category]} at mount ${cell+1}"><span>+</span><small>PLACE HERE</small></button>`:`<div class="outfit-mount outfit-unused" ${attrs} aria-label="Unused mount ${cell+1}"><span>·</span></div>`;
   }).join('');
  };
  return `<div class="outfit-loadout"><div class="inventory-rig"><div class="inventory-weapons" data-bay-area="weapons">${zone('weapons')}</div><div class="inventory-ship"><canvas data-ship-preview role="img" aria-label="${safe(s.shipName||ship.name)} with current damage and lighting"></canvas><div class="inventory-ship-rings" aria-hidden="true"><span class="inventory-scanner-sweep"></span></div><div class="inventory-scanner-lock" aria-hidden="true"></div></div><div class="inventory-systems" data-bay-area="systems">${zone('systems')}${hullSystems}</div><div class="inventory-ship-label"><strong>${safe(s.shipName||ship.name)}</strong><span>${safe(ship.name)}</span></div></div><div class="inventory-drone-bays"><div class="inventory-section-title"><span>DOT REPAIR BAYS</span><strong>${eq.slots.repairDrone.filter(Boolean).length} / ${eq.slots.repairDrone.length} fitted${draft?.category==='repairDrone'?' + 1 preview':''}</strong></div><div class="inventory-drone-grid" data-bay-area="drones">${zone('drones')||'<p>No repair-drone bays</p>'}</div></div></div>`;
 }
 const previews=new WeakMap();
 function stopPreview(root){const p=previews.get(root);if(p){p.cancelled=true;cancelAnimationFrame(p.frame);}previews.delete(root);}
 function preview(root,s,ship,{state=s,category='player'}={}){
  const previous=previews.get(root),clock=previous?.state===s?previous.clock:{base:window.nativeSimulation.now(state),start:performance.now()};
  stopPreview(root);const canvas=root.querySelector('[data-ship-preview]');if(!canvas)return;
  const rings=canvas.parentElement.querySelector('.inventory-ship-rings'),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const p={frame:0,cancelled:false,scannerSize:null,state:s,clock};previews.set(root,p);
  window.vexedFlightAssets.loadShip(ship.id,(Number(s.hull)||0)*window.nativeShipDefinitions.get(ship.id).hull/Math.max(1,ship.hull)).then(asset=>{
   if(p.cancelled||!canvas.isConnected||root.hidden)return;const ctx=canvas.getContext('2d');
   const paint=timestamp=>{
    if(p.cancelled||!canvas.isConnected||root.hidden)return;
    const bounds=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(1,Math.round(bounds.width*dpr)),h=Math.max(1,Math.round(bounds.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.clearRect(0,0,w,h);
    const dimensions=window.nativeShipDefinitions.dimensions(s,category),scale=Math.min(w*.84/dimensions.width,h*.86/dimensions.height);
    // Use the same centered hull footprint as the canvas, in CSS pixels. Keep
    // the outer orbit inside the preview even for long hulls and narrow screens.
    const scannerSize=Math.max(0,Math.min(Math.hypot(dimensions.width,dimensions.height)*scale/dpr,Math.min(bounds.width,bounds.height)*.86));
    if(rings&&scannerSize!==p.scannerSize){rings.style.setProperty('--scanner-size',scannerSize+'px');p.scannerSize=scannerSize;}
    canvas.dataset.previewRatio=String(dimensions.width/dimensions.height);
    // Advance decorative lights without advancing the saved gameplay clock.
    const visualTime=clock.base+(reducedMotion.matches?0:Math.max(0,timestamp-clock.start));
    window.vexedFlightAssets.drawShip(ctx,asset,w/2,h/2,dimensions.width*scale,0,visualTime,{height:dimensions.height*scale,damage:true,lights:s.phase!=='disabled',light:window.vexedSpace?.light,effectRate:60});
    canvas.classList.add('ready');p.frame=requestAnimationFrame(paint);
   };p.frame=requestAnimationFrame(paint);
  }).catch(()=>{if(!p.cancelled)canvas.setAttribute('aria-label','Ship preview unavailable');});
 }
 window.nativeOutfittingView=Object.freeze({minerals,labels,icon,mineralIcon,material,cost,art,deviceCondition,slot,rig,inventoryCell,inventoryStack,inventoryCount,preview,stopPreview});
})();
