/* Two live inventories. Shared loot/equipment owners perform every transfer. */
(() => {
  'use strict';
  const panel=document.createElement('section');panel.id='ship-loot';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label','Ship inventories');
  panel.innerHTML=`<header class="loot-header"><div><small>SHIP INVENTORIES</small><h2>Search ship</h2><p class="loot-status"></p></div><button type="button" class="loot-close" aria-label="Close inventories">Close <kbd>Esc</kbd></button></header>
    <div class="loot-inventories">${['player','source'].map(side=>{const yours=side==='player';return `<section class="loot-owner" data-owner="${side}" aria-label="${yours?'Your inventory':'Their inventory'}"><header><div><span>${yours?'YOUR INVENTORY':'THEIR INVENTORY'}</span><h3></h3><p class="loot-capacity"></p></div>${yours?'':'<button type="button" data-loot-take-all aria-label="Take all available belongings">Take all</button>'}</header><div class="loot-browse"><input type="search" aria-label="Search ${yours?'your':'their'} inventory" placeholder="Search items"><select aria-label="Filter ${yours?'your':'their'} inventory"><option value="all">All items</option><option value="equipment">Equipment</option><option value="cargo">Cargo & supplies</option></select></div><div class="loot-grid" aria-label="${yours?'Your items; drop items here to take them':'Items aboard the disabled ship'}"></div><nav class="loot-page-nav" aria-label="${yours?'Your':'Their'} inventory pages"><span class="loot-item-count"></span><div><button type="button" data-loot-page="previous" aria-label="Previous page of ${yours?'your':'their'} inventory">‹</button><span class="loot-page-number" role="status"></span><button type="button" data-loot-page="next" aria-label="Next page of ${yours?'your':'their'} inventory">›</button></div></nav><p class="loot-owner-hint">${yours?'Items arrive here. Quantities update as you take them.':'Click an item to take it. Use Take all for everything that fits.'}</p></section>`;}).join('')}</div>
    <section class="loot-inspector" aria-label="Selected item"><div class="loot-detail-art"></div><div class="loot-detail-copy"><small></small><h3>Browse their belongings</h3><p>Click an item on the right to move it into your inventory on the left.</p><div class="loot-detail-stats"></div></div></section>
    <footer><p class="loot-message" role="status"></p><span class="loot-note">Surviving DOTs keep repairing while you search.</span></footer>`;
  document.body.append(panel);
  const launch=document.createElement('button');launch.type='button';launch.id='lootBtn';launch.hidden=true;launch.textContent='Open inventories [L]';launch.setAttribute('aria-haspopup','dialog');document.querySelector('.game-actions').append(launch);
  const nav=window.nativeGamepadControls.menuNavigation(),fmt=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const goodIcons=['assets/ui/mineral.svg','assets/ui/metal.svg','assets/ui/components.svg','assets/ui/computers.svg','assets/ui/fuel.svg','assets/ui/food.svg','assets/ui/medicine.svg','startup/resources/deuranium.png','assets/ui/hull-sections.svg'];
  const supplyIcons={food:goodIcons[5],antimatter:'startup/resources/antimatter.png',deuranium:goodIcons[7],dilithium:'assets/inventory-ores/dilithium.png'};
  const panes=Object.fromEntries(['player','source'].map(side=>{const root=panel.querySelector(`[data-owner="${side}"]`);return [side,{root,grid:root.querySelector('.loot-grid'),search:root.querySelector('input'),filter:root.querySelector('select'),nodes:new Map(),signature:'',page:0,pageSize:8,columns:4,rows:2}];}));
  const counters=new Map(),effects=new Set(),received=new Set();
  let bridge=null,ref=null,last=0,selection=null,dragKey=null,current=null,counterFrame=0,layoutFrame=0,lastDragAt=-1000;
  const active=()=>!panel.hidden;
  const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  function ownItems(state){
    const equipment=window.nativeShipEquipment,eq=equipment.ensure(state),items=[];
    for(const [id,instance] of Object.entries(eq.instances)){const model=equipment.model(instance.modelId);if(model)items.push({key:'equipment:'+id,name:model.name,amount:1,equipment:true,instance,model,condition:equipment.condition(instance),fitted:equipment.kinds.some(k=>eq.slots[k].includes(id))});}
    const add=(key,name,amount,extra={})=>{if(Number(amount)>0)items.push({key,name,amount,cargo:true,...extra});};
    for(const key of ['antimatter','dilithium','deuranium','food'])add('supply:'+key,key==='deuranium'?'Repair deuranium':key[0].toUpperCase()+key.slice(1),state[key],{supply:key});
    for(const [key,amount] of Object.entries(state.minerals||{}))add('mineral:'+key,window.nativeRegionalMinerals?.ores[key]?.name||key,amount,{mineral:key});
    for(const [key,amount] of Object.entries(state.solFreightHold||{}))add('freight:'+key,window.nativeSolEconomy.goods[key]||'Freight',amount,{good:Number(key)});
    for(const job of state.localContracts||[])add('contract:'+job.id,window.nativeSolEconomy.goods[job.good]||'Contract cargo',job.tons,{good:job.good,contract:true});
    return items;
  }
  function decorate(row,holder){
    if(!row.equipment)return row;
    const instance=holder.shipEquipment.instances[row.key.slice(10)];return {...row,instance,model:window.nativeShipEquipment.model(instance?.modelId)};
  }
  function art(row){
    if(row.equipment)return window.nativeOutfittingView.art(row.model);
    if(row.mineral)return window.nativeOutfittingView.mineralIcon(row.mineral);
    return `<img src="${supplyIcons[row.supply]||goodIcons[row.good]||'assets/ui/freight.svg'}" alt="">`;
  }
  const tag=row=>row.equipment?(row.fitted?'FITTED':'STORED'):row.contract?'CONTRACT':row.mineral?'RAW MINERAL':'CARGO';
  function select(side,key){selection={side,key};updateSelection();}
  function updateSelection(){
    for(const [side,pane] of Object.entries(panes))for(const [key,node] of pane.nodes){const selected=selection?.side===side&&selection.key===key;node.classList.toggle('selected',selected);node.setAttribute('aria-pressed',String(selected));}
    const row=panes[selection?.side]?.items?.find(row=>row.key===selection.key),detail=panel.querySelector('.loot-inspector');
    const artKey=selection?.side+':'+row?.key;if(detail.dataset.artKey!==artKey){detail.dataset.artKey=artKey;detail.querySelector('.loot-detail-art').innerHTML=row?art(row):'';}
    detail.querySelector('small').textContent=row?(selection.side==='source'?'THEIR ITEM':'YOUR ITEM')+' · '+tag(row):'ITEM DETAILS';
    detail.querySelector('h3').textContent=row?.name||'Browse their belongings';
    detail.querySelector('p').textContent=row?.model?.description||(row?.equipment?'Owned equipment. Its condition and upgrades are retained when transferred.':row?.contract?'Cargo reserved for an active delivery.':row?'Cargo aboard this ship.':'Click an item on the right to move it into your inventory on the left.');
    let stats=row?`<span>Quantity <b>${fmt(row.amount)}${row.equipment?'':' t'}</b></span>`:'';
    if(row?.condition!==undefined&&row.condition!==null)stats+=`<span>Condition <b>${fmt(row.condition)}%</b></span>`;
    if(row?.instance?.category==='repairDrone')stats+=`<span>Drone hull <b>${fmt(row.instance.hull)} / ${fmt(row.model.hull)}</b></span>`;
    if(row?.instance?.category==='weapon'){
      const spec=window.nativeWeaponRules.weaponSpec(row.model,window.nativeCombatShots.weaponVisual(row.model).kind);
      stats+=`<span>Damage <b>${fmt(spec.damage)}</b></span><span>Range <b>${fmt(spec.range)}</b></span><span>Recharge <b>${fmt(spec.recharge)} s</b></span>`;
    }
    const statsNode=detail.querySelector('.loot-detail-stats');if(statsNode.innerHTML!==stats)statsNode.innerHTML=stats;
  }
  function fill(side,items){
    const pane=panes[side];pane.items=items;
    const query=pane.search.value.trim().toLowerCase(),filter=pane.filter.value;
    const filtered=items.filter(row=>(filter==='all'||(filter==='equipment')===!!row.equipment)&&(!query||row.name.toLowerCase().includes(query)));
    pane.filtered=filtered;pane.pages=Math.max(1,Math.ceil(filtered.length/pane.pageSize));pane.page=Math.max(0,Math.min(pane.page,pane.pages-1));
    const visible=filtered.slice(pane.page*pane.pageSize,(pane.page+1)*pane.pageSize);
    if(selection?.side===side&&!filtered.some(row=>row.key===selection.key))selection=null;
    text(pane.root.querySelector('.loot-page-number'),`${pane.page+1} / ${pane.pages}`);
    if(side!=='player'||!counters.has('__items'))text(pane.root.querySelector('.loot-item-count'),`${filtered.length} items`);
    pane.root.querySelector('[data-loot-page="previous"]').disabled=pane.page===0;pane.root.querySelector('[data-loot-page="next"]').disabled=pane.page===pane.pages-1;
    const signature=JSON.stringify([pane.page,pane.pageSize,visible.map(row=>[row.key,row.name,row.fitted])]);
    if(signature!==pane.signature&&!dragKey){
      pane.signature=signature;const focused=document.activeElement?.dataset?.itemKey;pane.nodes.clear();pane.grid.replaceChildren();
      for(const row of visible){
        const button=document.createElement('button');button.type='button';button.className='loot-tile';button.dataset.itemKey=row.key;button.dataset.owner=side;
        if(side==='source')button.dataset.lootKey=row.key;
        button.innerHTML=`<span class="loot-item-tag">${tag(row)}</span><span class="loot-item-art">${art(row)}</span><strong>${safe(row.name)}</strong><span class="loot-item-quantity"></span><span class="loot-item-condition"></span>`;
        button.onmouseenter=button.onfocus=()=>select(side,row.key);
        button.onclick=event=>{if(event.detail>1||performance.now()-lastDragAt<250)return;if(side==='source')take(row.key);else select(side,row.key);};
        if(side==='source'){
          button.draggable=true;
          button.ondragstart=event=>{select(side,row.key);dragKey=row.key;panel.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-vexed-loot',JSON.stringify({key:row.key,ref}));};
          button.ondragend=()=>{lastDragAt=performance.now();dragKey=null;panel.classList.remove('dragging');if(active())render(window.nativeShipLoot.status(bridge.state(),ref));};
        }
        pane.nodes.set(row.key,button);pane.grid.append(button);
      }
      if(!visible.length){const empty=document.createElement('p');empty.className='loot-empty-message';empty.textContent=items.length?'No matching items.':side==='source'?'Nothing available aboard.':'Your inventory is empty.';pane.grid.append(empty);}
      else for(let index=visible.length;index<pane.pageSize;index++){const empty=document.createElement('span');empty.className='loot-empty-slot';empty.setAttribute('aria-hidden','true');pane.grid.append(empty);}
      pane.grid.scrollTop=0;if(focused&&pane.nodes.has(focused))pane.nodes.get(focused).focus({preventScroll:true});
    }
    for(const row of visible){const node=pane.nodes.get(row.key);if(!node)continue;const title=`${row.name} · ${tag(row)}${row.equipment?'':` · ${fmt(row.amount)} t`}`;if(node.title!==title)node.title=title;if(side!=='player'||!counters.has(row.key))text(node.querySelector('.loot-item-quantity'),row.equipment?'':fmt(row.amount)+' t');else counters.get(row.key).to=Number(row.amount);text(node.querySelector('.loot-item-condition'),row.condition===undefined||row.condition===null?'':fmt(row.condition)+'% condition');node.classList.toggle('received',side==='player'&&received.has(row.key));}
  }
  function render(value){
    current=value;const state=bridge.state();
    panel.querySelector('h2').textContent=value.name||'Ship inventories';panel.querySelector('.loot-status').textContent=value.ok?`${fmt(value.distance)} units away · ${value.repairing} DOTs deployed`:value.error;
    panes.source.root.querySelector('h3').textContent=value.name||'Disabled ship';panes.source.root.querySelector('.loot-capacity').textContent=window.nativeDevLootDemo?.isPractice(state,value.target)?'Neutral practice vessel · Cargo and equipment':'Cargo, fitted equipment and stored belongings';
    panes.player.root.querySelector('h3').textContent=state.shipName||'Your ship';panes.player.root.querySelector('.loot-capacity').textContent=`Cargo ${fmt(value.used??window.nativeShipEquipment.cargoUsed(state))} / ${fmt(value.capacity??window.nativeShipDefinitions.forEntity(state).cargo)} t`;
    fill('source',value.ok?value.items.map(row=>decorate(row,value.target.entity)):[]);fill('player',ownItems(state));updateSelection();
    panel.querySelector('[data-loot-take-all]').disabled=!value.ok||!value.items.some(row=>!row.cargo||value.free>0);
  }
  function fitPages(){
    if(!active())return;let changed=false;
    for(const pane of Object.values(panes)){
      const gap=8,columns=Math.max(2,Math.min(4,Math.floor((pane.grid.clientWidth+gap)/108))),rows=Math.max(1,Math.min(4,Math.floor((pane.grid.clientHeight+gap-8)/112)));
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
      else{const node=panes.player.nodes.get(key);if(node){node.dataset.displayedQuantity=String(value);text(node.querySelector('.loot-item-quantity'),fmt(value)+' t');}}
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
      if(!transfer.equipment){const running=counters.get(transfer.destinationKey);counters.set(transfer.destinationKey,{from:running?.from??transfer.beforeQuantity,to:transfer.afterQuantity,started:now,duration});if(node)text(node.querySelector('.loot-item-quantity'),fmt(running?.from??transfer.beforeQuantity)+' t');}
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
      const pane=panes.player;pane.search.value='';pane.filter.value='all';const items=ownItems(state),index=items.findIndex(item=>item.key===transfers[0].destinationKey);pane.page=Math.floor(Math.max(0,index)/pane.pageSize);selection={side:'player',key:transfers[0].destinationKey};
      window.nativeGameSounds?.transport(state);bridge.refresh();
    }
    dragKey=null;panel.classList.remove('dragging');render(window.nativeShipLoot.status(state,ref));
    if(result.ok){
      animateTransfers(transfers,visuals,oldCount);
      if(focusSource){const next=panes.source.filtered[Math.min(Math.max(0,sourceIndex),panes.source.filtered.length-1)];(panes.source.nodes.get(next?.key)||panes.source.search).focus({preventScroll:true});}
    }
  }
  function close({restore=true}={}){if(panel.hidden)return;panel.hidden=true;ref=null;selection=null;dragKey=null;panel.classList.remove('dragging');cancelAnimationFrame(counterFrame);counterFrame=0;counters.clear();for(const entry of [...effects]){entry.animation.cancel();entry.node.remove();}nav.clear();bridge?.close?.();if(restore)document.querySelector('#space')?.focus({preventScroll:true});}
  function open(){
    if(active()){close();return true;}if(!bridge?.allowed())return false;
    const candidate=window.nativeShipLoot.reference(bridge.target()),value=window.nativeShipLoot.status(bridge.state(),candidate);if(!value.ok){bridge.message(value.error);return false;}
    ref=candidate;selection=null;received.clear();for(const pane of Object.values(panes)){pane.search.value='';pane.filter.value='all';pane.signature='';pane.page=0;pane.grid.scrollTop=0;}
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
  addEventListener('keydown',event=>{
    const editing=event.target?.closest?.('input,textarea,select,[contenteditable="true"]');
    if(active()){
      event.stopImmediatePropagation();if(event.key==='Escape'||event.code==='KeyL'&&!editing){event.preventDefault();close();return;}
      const directions={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};if(!editing&&directions[event.key]){event.preventDefault();nav.move(panel,directions[event.key]);}return;
    }
    if(event.code==='KeyL'&&!event.repeat&&!editing&&bridge?.allowed()){event.preventDefault();event.stopImmediatePropagation();open();}
  },true);
  window.nativeShipLootView=Object.freeze({attach:value=>{bridge=value;},update,open,close,get active(){return active();}});
})();
