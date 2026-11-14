/* Two live inventories. Shared loot/equipment owners perform every transfer. */
(() => {
  'use strict';
  const panel=document.createElement('section');panel.id='ship-loot';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label','Ship inventories');
  panel.innerHTML=`<header class="loot-header"><div><h2>Ship inventories</h2><p class="loot-status"></p></div><button type="button" class="loot-close" aria-label="Close inventories">Close <kbd>Esc</kbd></button></header>
    <div class="loot-inventories">${['player','source'].map(side=>{const yours=side==='player';return `<section class="loot-owner inventory-panel" data-owner="${side}" aria-label="${yours?'Your inventory':'Their inventory'}">
      <header class="inventory-header"><div class="inventory-heading"><span class="inventory-kicker">${yours?'YOUR INVENTORY':'THEIR INVENTORY'}</span><h3></h3><p class="loot-vessel-class"></p><p class="loot-capacity"></p></div>${yours?'':'<button type="button" data-loot-take-all aria-label="Take all available belongings">Take all</button>'}</header>
      <section class="loot-loadout inventory-loadout" aria-label="${yours?'Your':'Their'} fitted equipment"><div class="inventory-section-title"><span>FITTED EQUIPMENT</span><strong class="loot-bay-count"></strong></div><div class="loot-rig"></div></section>
      <section class="loot-storage inventory-cargo" aria-label="${yours?'Your':'Their'} stored equipment and cargo"><div class="inventory-section-title"><span>STORED ITEMS & CARGO</span></div><div class="loot-browse"><input type="search" aria-label="Search ${yours?'your':'their'} inventory" placeholder="Search items"><select aria-label="Filter ${yours?'your':'their'} inventory"><option value="all">All items</option><option value="equipment">Equipment</option><option value="cargo">Cargo & supplies</option></select></div>
      <div class="loot-grid inventory-grid" aria-label="${yours?'Your stored equipment and cargo; drop items here to take them':'Stored items aboard the disabled ship'}"></div><nav class="loot-page-nav inventory-page-nav" aria-label="${yours?'Your':'Their'} inventory pages"><span class="loot-item-count"></span><div><button type="button" data-loot-page="previous" aria-label="Previous page of ${yours?'your':'their'} inventory">&lsaquo;</button><span class="loot-page-number" role="status"></span><button type="button" data-loot-page="next" aria-label="Next page of ${yours?'your':'their'} inventory">&rsaquo;</button></div></nav></section>
      </section>`;}).join('')}</div>
    <section class="loot-inspector" aria-label="Selected item"><div class="loot-detail-art"></div><div class="loot-detail-copy"><small></small><h3>Browse their belongings</h3><p>Click an item on the right to move it into your inventory on the left.</p><div class="loot-detail-stats"></div></div></section>
    <footer><p class="loot-message" role="status"></p><span class="loot-note">Surviving DOTs keep repairing while you search.</span></footer>`;
  document.body.append(panel);
  const launch=document.createElement('button');launch.type='button';launch.id='lootBtn';launch.hidden=true;launch.textContent='Open inventories [L]';launch.setAttribute('aria-haspopup','dialog');document.querySelector('.game-actions').append(launch);
  const nav=window.nativeGamepadControls.menuNavigation(),fmt=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:3});
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const goodIcons=['assets/ui/mineral.svg','assets/ui/metal.svg','assets/ui/components.svg','assets/ui/computers.svg','assets/ui/fuel.svg','assets/ui/food.svg','assets/ui/medicine.svg','startup/resources/deuranium.png','assets/ui/hull-sections.svg'];
  const supplyIcons={food:goodIcons[5],antimatter:'startup/resources/antimatter.png',deuranium:goodIcons[7],dilithium:'assets/inventory-ores/dilithium.png'};
  const panes=Object.fromEntries(['player','source'].map(side=>{const root=panel.querySelector(`[data-owner="${side}"]`);return [side,{root,grid:root.querySelector('.loot-grid'),search:root.querySelector('input'),filter:root.querySelector('select'),nodes:new Map(),signature:'',rigSignature:'',bayPage:0,bayRows:3,page:0,pageSize:8,columns:4,rows:2}];}));
  const counters=new Map(),effects=new Set(),received=new Set();
  let bridge=null,ref=null,last=0,selection=null,dragKey=null,current=null,counterFrame=0,layoutFrame=0,lastDragAt=-1000;
  const active=()=>!panel.hidden;
  const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  function ownItems(state,eq=window.nativeShipEquipment.ensure(state)){
    const equipment=window.nativeShipEquipment,items=[];
    for(const id of new Set([...equipment.kinds.flatMap(k=>eq.slots[k]),...eq.locker,...Object.keys(eq.instances)])){const instance=eq.instances[id];if(!instance)continue;const model=equipment.forInstance(instance);if(model)items.push({key:'equipment:'+id,name:model.name,amount:1,equipment:true,instance,model,condition:equipment.condition(instance),fitted:equipment.kinds.some(k=>eq.slots[k].includes(id))});}
    const add=(key,name,amount,extra={})=>{if(Number(amount)>0)items.push({key,name,amount,cargo:true,...extra});};
    for(const key of ['antimatter','dilithium','deuranium','food'])add('supply:'+key,key==='deuranium'?'Repair deuranium':key[0].toUpperCase()+key.slice(1),state[key],{supply:key});
    for(const [key,amount] of Object.entries(state.minerals||{}))add('mineral:'+key,window.nativeRegionalMinerals?.ores[key]?.name||key,amount,{mineral:key});
    for(const [key,amount] of Object.entries(state.solFreightHold||{}))add('freight:'+key,window.nativeSolEconomy.goods[key]||'Freight',amount,{good:Number(key)});
    for(const job of state.localContracts||[])add('contract:'+job.id,window.nativeSolEconomy.goods[job.good]||'Contract cargo',job.tons,{good:job.good,contract:true});
    return items;
  }
  function decorate(row,holder){
    if(!row.equipment)return row;
    const instance=holder.shipEquipment.instances[row.key.slice(10)];return {...row,instance,model:window.nativeShipEquipment.forInstance(instance)};
  }
  function pageContext(state,side,value=current){
    const holder=side==='player'?state:value?.target?.entity;if(!holder)return null;
    const category=side==='player'?'player':value.target.category,equipment=window.nativeShipEquipment;
    const context=side==='player'&&window.nativePrometheusLoadouts?.supported(state)?window.nativePrometheusLoadouts.context(state,window.nativePrometheusLoadouts.currentKey(state)):null;
    const eq=context?.eq||equipment.ensure(state,holder),subject=context?.subject||holder,
      ship=context?.ship||window.nativeShipDefinitions.forEntity(state,holder,{category});
    const layout=context?window.nativePrometheusLoadouts.layoutFor(state,context.key):holder.inventoryLayout;
    return {holder,category,subject,ship,eq,layout};
  }
  function sourceItems(value){
    if(!value.ok)return [];
    const rows=value.items.map(row=>decorate(row,value.target.entity)),eq=value.target.entity.shipEquipment,listed=new Set(rows.map(row=>row.key));
    for(const [id,instance] of Object.entries(eq.instances)){
      const key='equipment:'+id;if(listed.has(key))continue;
      const model=window.nativeShipEquipment.forInstance(instance);if(!model)continue;
      rows.push({key,name:model.name,amount:1,equipment:true,instance,model,condition:window.nativeShipEquipment.condition(instance),fitted:window.nativeShipEquipment.kinds.some(k=>eq.slots[k].includes(id)),takeable:false,
        unavailable:instance.category==='repairDrone'?(instance.hull<=0?'Destroyed DOTs cannot be taken.':'This DOT is deployed on a repair mission.'):'This item cannot be taken.'});
    }
    return rows;
  }
  const matches=(pane,row)=>{const filter=pane.filter.value,query=pane.search.value.trim().toLowerCase();return (filter==='all'||(filter==='equipment')===!!row.equipment)&&(!query||row.name.toLowerCase().includes(query));};
  function storageCells(pane,items){
    const rows=items.filter(row=>!row.fitted&&matches(pane,row)),keys=rows.map(row=>row.key),saved=pane.search.value.trim()||pane.filter.value!=='all'?[]:pane.frame?.layout?.cells||[];
    return window.nativeShipEquipment.inventoryCells(keys,saved);
  }
  function bindItem(side,row,button){
    const pane=panes[side];button.dataset.itemKey=row.key;button.dataset.owner=side;
    if(side==='source'&&row.takeable!==false)button.dataset.lootKey=row.key;else delete button.dataset.lootKey;
    button.classList.toggle('loot-locked',row.takeable===false);button.setAttribute('aria-disabled',String(side==='source'&&row.takeable===false));
    button.onmouseenter=button.onfocus=()=>select(side,row.key);
    button.onclick=event=>{if(event.detail>1||performance.now()-lastDragAt<250)return;if(side==='source'&&row.takeable!==false)take(row.key);else select(side,row.key);};
    if(side==='source'&&row.takeable!==false){
      button.draggable=true;
      button.ondragstart=event=>{select(side,row.key);dragKey=row.key;panel.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-vexed-loot',JSON.stringify({key:row.key,ref}));};
      button.ondragend=()=>{lastDragAt=performance.now();dragKey=null;panel.classList.remove('dragging');if(active())render(window.nativeShipLoot.status(bridge.state(),ref));};
    }else button.draggable=false;
    pane.nodes.set(row.key,button);
  }
  function patchRig(root,html){
    const template=document.createElement('template');template.innerHTML=html;
    function sync(parent,source){
      const children=[...source.childNodes];
      children.forEach((next,index)=>{
        const node=parent.childNodes[index];
        if(!node||node.nodeType!==next.nodeType||node.nodeName!==next.nodeName||node.nodeType===1&&node.matches('button')&&node.dataset.itemKey!==next.dataset.itemKey){
          if(node)node.replaceWith(next);else parent.append(next);return;
        }
        if(node.nodeType!==1){if(node.nodeValue!==next.nodeValue)node.nodeValue=next.nodeValue;return;}
        // Keep the running hull preview and stable controls during live updates.
        // A different belonging gets a new button, cancelling any pending click.
        if(node.matches('.inventory-ship'))return;
        for(const attr of [...node.attributes])if(!next.hasAttribute(attr.name))node.removeAttribute(attr.name);
        for(const attr of next.attributes)if(node.getAttribute(attr.name)!==attr.value)node.setAttribute(attr.name,attr.value);
        sync(node,next);
      });
      while(parent.childNodes.length>children.length)parent.lastChild.remove();
    }
    sync(root,template.content);
  }
  function renderLoadout(side,items){
    const pane=panes[side],frame=pane.frame,root=pane.root.querySelector('.loot-rig');if(!frame){window.nativeOutfittingView.stopPreview(pane.root);root.replaceChildren();pane.rigSignature='';return;}
    const {subject,ship,eq}=frame,rows=new Map(items.map(row=>[row.key,row])),bays=window.nativeShipEquipment.bayLayout(subject).bays;
    const query=pane.search.value.trim().toLowerCase()+':'+pane.filter.value;
    if(query!==pane.bayQuery){pane.bayQuery=query;const match=bays.find(b=>{const row=rows.get('equipment:'+eq.slots[b.category]?.[b.index]);return row&&matches(pane,row);});pane.bayPage=match?Math.floor(match.cell/(match.zone==='drones'?6:pane.bayRows)):0;}
    const pages=window.nativeEquipmentPanel.bayPages(bays,pane.bayRows,pane.bayPage);pane.bayPage=pages.page;
    text(pane.root.querySelector('.loot-bay-count'),`${Object.values(eq.slots).flat().filter(Boolean).length} / ${Object.values(eq.slots).flat().length} fitted`);
    const stage=ship.damageStages.filter(threshold=>subject.hull/Math.max(1,ship.hull)<threshold).length;
    const signature=JSON.stringify([ship.id,stage,pane.bayPage,pane.bayRows,pane.search.value,pane.filter.value,eq.slots,Object.values(eq.instances).map(i=>[i.id,i.modelId,Math.round((window.nativeShipEquipment.condition(i)??100)*10),Math.round(i.hull||0),i.phase,i.weaponGrade])]);
    if(signature!==pane.rigSignature&&!dragKey){
      pane.rigSignature=signature;
      const slot=(kind,id,index)=>{
        const row=rows.get('equipment:'+id),match=row&&matches(pane,row);
        let html=window.nativeOutfittingView.slot(subject,ship,eq,kind,id,index);
        if(match)html=html.replace('class="inventory-slot ',`class="inventory-slot loot-tile `);
        if((pane.search.value.trim()||pane.filter.value!=='all')&&!match)html=html.replace('<button ','<button hidden ');
        if(!id)html=html.replace('<button ','<button disabled ');
        return html;
      };
      patchRig(root,pages.html+window.nativeOutfittingView.rig(subject,ship,eq,{renderSlot:slot,bayWindow:{page:pane.bayPage,rows:pane.bayRows}}));
      root.querySelectorAll('[data-bay-page]').forEach(button=>button.onclick=()=>{pane.bayPage+=button.dataset.bayPage==='next'?1:-1;pane.rigSignature='';render(window.nativeShipLoot.status(bridge.state(),ref));});
      const previewSignature=ship.id+':'+stage+':'+frame.category;
      if(pane.previewSignature!==previewSignature||!pane.root.querySelector('[data-ship-preview].ready')){
        pane.previewSignature=previewSignature;
        window.nativeOutfittingView.preview(pane.root,subject,ship,{state:bridge.state(),category:frame.category});
      }
    }
    for(const button of root.querySelectorAll('.loot-tile[data-item-key]')){const row=rows.get(button.dataset.itemKey);if(row)bindItem(side,row,button);}
  }
  function art(row){
    if(row.equipment)return window.nativeOutfittingView.art(row.model);
    if(row.mineral)return window.nativeOutfittingView.mineralIcon(row.mineral);
    return `<img src="${supplyIcons[row.supply]||goodIcons[row.good]||'assets/ui/freight.svg'}" alt="">`;
  }
  const tag=row=>row.equipment?(row.fitted?'FITTED':'STORED'):row.contract?'CONTRACT':row.mineral?'RAW MINERAL':'CARGO';
  function select(side,key){selection={side,key};updateSelection();}
  function updateSelection(){
    for(const [side,pane]of Object.entries(panes))for(const [key,node]of pane.nodes){const selected=selection?.side===side&&selection.key===key;node.classList.toggle('selected',selected);node.setAttribute('aria-pressed',String(selected));}
    const pane=panes[selection?.side],row=pane?.items?.find(row=>row.key===selection.key),detail=panel.querySelector('.loot-inspector');
    let html='<div class="loot-detail-copy"><small>ITEM DETAILS</small><h3>Both ship inventories</h3><p>Click their equipment or stored belongings to take them. Hover or focus to inspect.</p></div>';
    if(row&&pane.frame){
      const tile={key:row.key,name:row.name,quantity:row.amount,html:window.nativeOutfittingView.inventoryStack(row.name,row.amount,{art:art(row),unit:' t'})},
        picked={type:row.fitted?'slot':'cell',key:row.key,category:row.instance?.category,index:0};
      html=window.nativeEquipmentPanel.inspect(pane.frame.subject,pane.frame.ship,pane.frame.eq,{selection:picked,tiles:new Map([[row.key,tile]]),prefix:'loot-'+selection.side,readOnly:true,note:row.unavailable||''}).html;
    }
    if(detail._inventoryHtml!==html){detail._inventoryHtml=html;detail.innerHTML=html;}
  }
  function fill(side,items){
    const pane=panes[side];pane.items=items;pane.nodes.clear();pane.filtered=items.filter(row=>matches(pane,row));
    const cells=storageCells(pane,items),byKey=new Map(items.map(row=>[row.key,row]));pane.cells=cells;
    pane.pages=Math.max(1,Math.ceil(cells.length/pane.pageSize));pane.page=Math.max(0,Math.min(pane.page,pane.pages-1));
    const visible=Array.from({length:pane.pageSize},(_,offset)=>{const index=pane.page*pane.pageSize+offset;return {index,row:byKey.get(cells[index])};});
    if(selection?.side===side&&!pane.filtered.some(row=>row.key===selection.key))selection=null;
    text(pane.root.querySelector('.loot-page-number'),`${pane.page+1} / ${pane.pages}`);
    if(side!=='player'||!counters.has('__items'))text(pane.root.querySelector('.loot-item-count'),`${pane.filtered.length} items aboard`);
    pane.root.querySelector('[data-loot-page="previous"]').disabled=pane.page===0;pane.root.querySelector('[data-loot-page="next"]').disabled=pane.page===pane.pages-1;
    const signature=JSON.stringify([pane.page,pane.pageSize,visible.map(({index,row})=>[index,row?.key,row?.name,row?.fitted,row?.condition===null?null:Math.round((row?.condition??100)*10),row?.instance?.weaponGrade])]);
    if(signature!==pane.signature&&!dragKey){
      pane.signature=signature;const focused=document.activeElement?.dataset?.itemKey;pane.grid.replaceChildren();
      for(const {index,row}of visible){
        let html=row?.equipment?window.nativeEquipmentPanel.equipmentContents(row.instance,row.model):row?window.nativeOutfittingView.inventoryStack(row.name,row.amount,{art:art(row),unit:' t'}):'';
        if(row)html+=`<span class="inventory-item-tag">${tag(row)}</span>`;
        html=html.replace('class="inventory-item-count"','class="inventory-item-count loot-item-quantity"');
        const tile=row?{key:row.key,kind:row.equipment?'equipment':row.contract?'freight':row.cargo?'freight':'supplies',category:row.instance?.category,name:row.name,html}:null;
        pane.grid.insertAdjacentHTML('beforeend',window.nativeOutfittingView.inventoryCell(tile,{index,key:row?.key||'',classes:row?'loot-tile':'loot-empty-slot',draggable:false,hint:side==='source'?'Click to take':'Select to inspect'}));
        if(!row)pane.grid.lastElementChild.disabled=true;
      }
      pane.grid.scrollTop=0;if(focused)pane.grid.querySelector(`[data-item-key="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
    }
    renderLoadout(side,items);
    for(const button of pane.grid.querySelectorAll('.loot-tile')){const row=byKey.get(button.dataset.itemKey);if(row)bindItem(side,row,button);}
    for(const row of items){
      const node=pane.nodes.get(row.key);if(!node)continue;
      node.title=row.unavailable||`${row.name} \u00b7 ${tag(row)}${row.equipment?'':` \u00b7 ${fmt(row.amount)} t`}`;
      if(!row.equipment){if(side!=='player'||!counters.has(row.key))text(node.querySelector('.loot-item-quantity'),window.nativeOutfittingView.inventoryCount(row.amount)+' t');else counters.get(row.key).to=Number(row.amount);}
      node.classList.toggle('received',side==='player'&&received.has(row.key));
    }
  }
  function render(value){
    current=value;const state=bridge.state();
    panel.querySelector('.loot-status').textContent=value.ok?`${fmt(value.distance)} units away · ${value.repairing} DOTs deployed`:value.error;
    panes.source.root.querySelector('h3').textContent=value.name||'Disabled ship';panes.source.root.querySelector('.loot-capacity').textContent=window.nativeDevLootDemo?.isPractice(state,value.target)?'Neutral practice vessel · Cargo and equipment':'Cargo, fitted equipment and stored belongings';
    panes.player.root.querySelector('h3').textContent=state.shipName||'Your ship';panes.player.root.querySelector('.loot-capacity').textContent=`Cargo ${fmt(value.used??window.nativeShipEquipment.cargoUsed(state))} / ${fmt(value.capacity??window.nativeShipDefinitions.forEntity(state).cargo)} t`;
    for(const side of ['player','source'])panes[side].frame=pageContext(state,side,value);
    fill('source',sourceItems(value));fill('player',ownItems(state,panes.player.frame.eq));updateSelection();
    for(const pane of Object.values(panes)){const f=pane.frame;text(pane.root.querySelector('.loot-vessel-class'),f?`${f.ship.name} · Hull ${fmt(f.subject.hull)} / ${fmt(f.ship.hull)}`:'');}
    panel.querySelector('[data-loot-take-all]').disabled=!value.ok||!value.items.some(row=>!row.cargo||value.free>0);
  }
  function fitPages(){
    if(!active())return;let changed=false;
    for(const pane of Object.values(panes)){
      const gap=parseFloat(getComputedStyle(pane.grid).gap)||0,columns=Math.max(2,Math.min(6,Math.floor((pane.grid.clientWidth+gap-4)/(96+gap)))),rows=Math.max(1,Math.min(4,Math.floor((pane.grid.clientHeight+gap-4)/(96+gap)))),rig=pane.root.querySelector('.inventory-rig'),bayRows=rig?window.nativeEquipmentPanel.measureRows(rig,pane.bayRows,46):pane.bayRows;
      if(bayRows!==pane.bayRows){pane.bayRows=bayRows;pane.rigSignature='';changed=true;}
      if(columns!==pane.columns||rows!==pane.rows){Object.assign(pane,{columns,rows,pageSize:columns*rows});pane.grid.style.setProperty('--loot-columns',columns);pane.grid.style.setProperty('--loot-rows',rows);pane.signature='';changed=true;}
    }
    if(changed)render(window.nativeShipLoot.status(bridge.state(),ref));
  }
  const layout=new ResizeObserver(()=>{cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(fitPages);});for(const pane of Object.values(panes))layout.observe(pane.grid);
  function tickCounts(now){
    counterFrame=0;if(!active()){counters.clear();return;}
    for(const [key,counter] of counters){
      const progress=Math.min(1,Math.max(0,(now-counter.started)/counter.duration)),value=counter.from+(counter.to-counter.from)*(1-(1-progress)**3);
      if(key==='__items')text(panes.player.root.querySelector('.loot-item-count'),`${Math.round(value)} items`);
      else{const node=panes.player.nodes.get(key);if(node){node.dataset.displayedQuantity=String(value);text(node.querySelector('.loot-item-quantity'),window.nativeOutfittingView.inventoryCount(value)+' t');}}
      if(progress===1)counters.delete(key);
    }
    if(counters.size)counterFrame=requestAnimationFrame(tickCounts);
  }
  function effect(node,frames,options){
    const animation=node.animate(frames,options),entry={node,animation};effects.add(entry);
    animation.onfinish=animation.oncancel=()=>{node.remove();effects.delete(entry);};
  }
  function animateTransfers(transfers,visuals,oldCount){
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,duration=reduced?140:480,now=performance.now(),grouped=new Map();
    for(const transfer of transfers){const old=grouped.get(transfer.destinationKey);if(old){old.quantity+=transfer.quantity;old.afterQuantity=transfer.afterQuantity;}else grouped.set(transfer.destinationKey,{...transfer});}
    counters.set('__items',{from:oldCount,to:panes.player.items.length,started:now,duration});
    let index=0;for(const transfer of grouped.values()){
      const node=panes.player.nodes.get(transfer.destinationKey),target=(node||panes.player.root.querySelector('header')).getBoundingClientRect(),visual=visuals.get(transfer.sourceKey),origin=visual?.rect||panes.source.root.getBoundingClientRect();
      if(!transfer.equipment){const running=counters.get(transfer.destinationKey);counters.set(transfer.destinationKey,{from:running?.from??transfer.beforeQuantity,to:transfer.afterQuantity,started:now,duration});if(node)text(node.querySelector('.loot-item-quantity'),window.nativeOutfittingView.inventoryCount(running?.from??transfer.beforeQuantity)+' t');}
      if(node){
        node.querySelectorAll('.loot-received-delta').forEach(old=>old.remove());const badge=document.createElement('span');badge.className='loot-received-delta';badge.textContent='+'+fmt(transfer.quantity);node.append(badge);
        effect(badge,[{opacity:1,transform:'translateY(0)'},{opacity:1,transform:'translateY(-5px)',offset:.65},{opacity:0,transform:'translateY(-16px)'}],{duration:1000,easing:'ease-out'});
        node.animate([{backgroundColor:'#3c775d',boxShadow:'inset 0 0 0 2px #afffd4'},{backgroundColor:'transparent',boxShadow:'inset 0 0 0 0px transparent'}],{duration:650});
      }
      if(index++<8){
        const ghost=document.createElement('div');ghost.className='loot-transfer-ghost';ghost.setAttribute('aria-hidden','true');ghost.innerHTML=visual?.html||'';
        const x=origin.x+origin.width/2,y=origin.y+origin.height/2,dx=target.x+target.width/2-x,dy=target.y+target.height/2-y;
        Object.assign(ghost.style,{left:x+'px',top:y+'px'});document.body.append(ghost);
        effect(ghost,reduced?[{opacity:.8,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`},{opacity:0,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`}]:[{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:1,transform:`translate(calc(-50% + ${dx*.5}px),calc(-50% + ${dy*.5-25}px)) scale(.9)`,offset:.5},{opacity:0,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.45)`}],{duration,delay:Math.min(index-1,5)*30,easing:'ease-in-out',fill:'both'});
      }
    }
    if(!counterFrame)counterFrame=requestAnimationFrame(tickCounts);
  }
  function take(key){
    if(!ref||!bridge?.allowed())return;
    const state=bridge.state(),before=window.nativeShipLoot.status(state,ref),row=before.items.find(row=>row.key===key),oldCount=ownItems(state).length,visuals=new Map();
    const focusSource=key!==null&&panes.source.nodes.get(key)===document.activeElement,sourceIndex=panes.source.filtered?.findIndex(item=>item.key===key)||0;
    for(const item of before.items){const decorated=decorate(item,before.target.entity),node=panes.source.nodes.get(item.key);visuals.set(item.key,{html:art(decorated),rect:(node||panes.source.root.querySelector('header')).getBoundingClientRect()});}
    const result=key===null?window.nativeShipLoot.takeAll(state,ref,{commit:()=>bridge.save()}):window.nativeShipLoot.take(state,ref,key,row?.amount||1,{commit:()=>bridge.save()});
    const transfers=result.ok?(result.transfers||[result]):[];
    const message=result.ok?(key===null?`Moved ${transfers.length} items/stacks to your inventory.${result.remaining&&result.full?' Cargo hold full; some cargo remains.':''}`:`+${fmt(result.quantity)}${result.equipment?'':' t'} ${result.name}`):result.error;
    panel.querySelector('.loot-message').textContent=message;bridge.message(message);
    if(result.ok){
      received.clear();for(const transfer of transfers)received.add(transfer.destinationKey);
      const pane=panes.player;pane.search.value='';pane.filter.value='all';const frame=pageContext(state,'player');pane.frame=frame;const items=ownItems(state,frame.eq),index=storageCells(pane,items).indexOf(transfers[0].destinationKey);pane.page=Math.floor(Math.max(0,index)/pane.pageSize);selection={side:'player',key:transfers[0].destinationKey};
      window.nativeGameSounds?.transport(state);bridge.refresh();
    }
    dragKey=null;panel.classList.remove('dragging');render(window.nativeShipLoot.status(state,ref));
    if(result.ok){
      animateTransfers(transfers,visuals,oldCount);
      if(focusSource){const next=panes.source.filtered[Math.min(Math.max(0,sourceIndex),panes.source.filtered.length-1)];(panes.source.nodes.get(next?.key)||panes.source.search).focus({preventScroll:true});}
    }
  }
  function close({restore=true}={}){if(panel.hidden)return;panel.hidden=true;for(const pane of Object.values(panes)){window.nativeOutfittingView.stopPreview(pane.root);pane.root.querySelector('.loot-rig').replaceChildren();pane.grid.replaceChildren();pane.nodes.clear();pane.frame=null;pane.signature='';pane.rigSignature='';}const detail=panel.querySelector('.loot-inspector');detail.replaceChildren();detail._inventoryHtml=null;ref=null;selection=null;dragKey=null;panel.classList.remove('dragging');cancelAnimationFrame(counterFrame);counterFrame=0;counters.clear();for(const entry of [...effects]){entry.animation.cancel();entry.node.remove();}nav.clear();bridge?.close?.();if(restore)document.querySelector('#space')?.focus({preventScroll:true});}
  function open(){
    if(active()){close();return true;}if(!bridge?.allowed())return false;
    const candidate=window.nativeShipLoot.reference(bridge.target()),value=window.nativeShipLoot.status(bridge.state(),candidate);if(!value.ok){bridge.message(value.error);return false;}
    ref=candidate;selection=null;received.clear();for(const pane of Object.values(panes)){pane.search.value='';pane.filter.value='all';pane.signature='';pane.rigSignature='';pane.bayPage=0;pane.page=0;pane.grid.scrollTop=0;}
    panel.hidden=false;panel.querySelector('.loot-message').textContent='';bridge.open();render(value);fitPages();panel.querySelector('.loot-close').focus({preventScroll:true});return true;
  }
  function update(state,target,{visible=true}={}){
    const candidate=window.nativeShipLoot.reference(target),disabled=target?.entity?.phase==='disabled'&&target.hull>0,hidden=!visible||!candidate||!disabled;if(launch.hidden!==hidden)launch.hidden=hidden;
    if(!visible){close({restore:false});return;}if(active()&&(!candidate||!disabled||JSON.stringify(candidate)!==JSON.stringify(ref))){close({restore:false});return;}if(launch.hidden)return;
    const now=performance.now();if(now-last<120)return;last=now;const value=window.nativeShipLoot.status(state,candidate);launch.disabled=!value.ok;launch.title=value.error||'Browse their inventory beside your own';if(active())render(value);
  }
  for(const pane of Object.values(panes)){
    pane.search.oninput=pane.filter.onchange=()=>{pane.page=0;render(window.nativeShipLoot.status(bridge.state(),ref));};
    for(const button of pane.root.querySelectorAll('[data-loot-page]'))button.onclick=()=>{pane.page+=button.dataset.lootPage==='next'?1:-1;render(window.nativeShipLoot.status(bridge.state(),ref));};
  }
  const destination=panes.player.grid;
  destination.ondragover=event=>{if(dragKey){event.preventDefault();event.dataTransfer.dropEffect='move';}};
  destination.ondrop=event=>{event.preventDefault();try{const value=JSON.parse(event.dataTransfer.getData('application/x-vexed-loot'));if(value.key===dragKey&&JSON.stringify(value.ref)===JSON.stringify(ref))take(value.key);}catch{};};
  panel.querySelector('[data-loot-take-all]').onclick=()=>take(null);
  panel.addEventListener('wheel',event=>event.preventDefault(),{passive:false});
  launch.onclick=open;panel.querySelector('.loot-close').onclick=()=>close();
  function navigate(direction){
    const focused=document.activeElement,pane=panes[focused?.closest?.('[data-owner]')?.dataset.owner];
    // Filters also cover fitted bays, which sit above the stored-item grid.
    // Down enters the first matching belonging even when no stored gear exists.
    if(direction==='down'&&pane&&(focused===pane.search||focused===pane.filter)){
      const item=[...pane.nodes.values()].find(node=>node.getAttribute('aria-disabled')!=='true'&&!node.closest('[hidden]')&&node.getClientRects().length);
      if(item){nav.clear();panel.querySelectorAll('.gamepad-focus').forEach(node=>node.classList.remove('gamepad-focus'));item.classList.add('gamepad-focus');item.focus({preventScroll:true});return item;}
    }
    return nav.move(panel,direction);
  }
  addEventListener('keydown',event=>{
    const editing=event.target?.closest?.('input,textarea,select,[contenteditable="true"]');
    if(active()){
      event.stopImmediatePropagation();if(event.key==='Escape'||event.code==='KeyL'&&!editing){event.preventDefault();close();return;}
      const directions={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};if(!editing&&directions[event.key]){event.preventDefault();navigate(directions[event.key]);}return;
    }
    if(event.code==='KeyL'&&!event.repeat&&!editing&&bridge?.allowed()){event.preventDefault();event.stopImmediatePropagation();open();}
  },true);
  window.nativeShipLootView=Object.freeze({attach:value=>{bridge=value;},update,open,close,navigate,get active(){return active();}});
})();
