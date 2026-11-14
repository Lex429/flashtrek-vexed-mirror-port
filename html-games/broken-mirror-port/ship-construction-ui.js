/* Earth Heavy Shipyard contact, construction monitor and procurement. */
(() => {
  'use strict';
  const owner=window.nativeShipConstruction,view=window.shipConstructionView;
  const root=document.createElement('section');root.id='ship-construction';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Earth Heavy Shipyard');
  const button=document.createElement('button');button.id='fleet-shipyard-button';button.textContent='Shipyard';button.hidden=true;
  document.querySelector('#game').append(root,button);
  document.querySelector('#inventoryBtn')?.insertAdjacentElement('afterend',button);
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let bridge=null,entry=null,selected=7,token=0,raf=0,priorFocus=null,lastUpdate=-1,previewBorn=0;
  const worldEntries=new Map(),worldPending=new Set();let yardRequested=false;
  function shipEntry(id){const d=window.nativeShipDefinitions.get(id);return {...d,frames:d.artwork.frames};}
  async function choose(id){
    selected=Number(id);const ticket=++token;entry=null;previewBorn=performance.now();
    try{const next=await view.prepare(shipEntry(selected));if(ticket===token)entry=next;}
    catch(error){if(ticket===token)notice(error.message);}
    update(true);
  }
  function notice(message){const element=root.querySelector('[data-build-notice]');if(element)element.textContent=message||'';}
  function close(){root.hidden=true;cancelAnimationFrame(raf);raf=0;token++;priorFocus?.focus?.({preventScroll:true});}
  function open(){
    const state=bridge?.getState();if(!state)return false;
    priorFocus=document.activeElement;bridge.clearInput();window.nativeShipyardServices?.close();window.nativeSystemHub?.close(false);window.nativePlanetEncounter?.close(false);window.nativeShipInventory?.close();
    const ships=owner.catalog(state);if(!ships.some(s=>s.id===selected))selected=ships[0]?.id;
    root.innerHTML=`<header><div><p class="build-eyebrow">SOL / FLEET PROCUREMENT</p><h1>Earth Heavy Shipyard</h1></div><button data-build-close aria-label="Close shipyard">&times;</button></header>
      <div class="build-workspace"><div class="build-visual"><canvas width="1000" height="680" aria-label="Ship construction at Earth Heavy Shipyard"></canvas><span class="build-view-mode" data-build-mode>CONSTRUCTION PREVIEW</span><div class="build-overlay"><strong data-build-phase>Preparing berth</strong><progress max="1" value="0" aria-label="Construction progress"></progress><small data-build-time></small></div></div>
      <section class="build-order"><p class="build-eyebrow">COMMISSION A VESSEL</p><label>Ship class<select data-build-class>${ships.map(h=>`<option value="${h.id}" ${h.id===selected?'selected':''}>${safe(h.name)}</option>`).join('')}</select></label><label>Ship name<input data-build-name maxlength="60" placeholder="Optional vessel name"></label><div class="build-specs" data-build-specs></div><p data-build-location></p><button class="build-primary" data-build-order>Order ship</button><p role="status" data-build-notice>Each completed vessel joins your fleet with its standard equipment.</p><h2>Construction queue</h2><div data-build-queue></div></section></div>
      <section class="build-fleet"><div class="build-fleet-heading"><div><p class="build-eyebrow">YOUR COMMAND</p><h2>Manage your ships in Inventory → Fleet</h2></div><button data-build-open-fleet>Open Fleet</button></div></section>`;
    root.hidden=false;lastUpdate=-1;choose(selected);view.loadYard().catch(e=>notice(e.message));
    root.querySelector('[data-build-close]').focus();cancelAnimationFrame(raf);raf=requestAnimationFrame(paint);return true;
  }
  function update(force=false){
    const state=bridge?.getState();button.hidden=!state||!document.body.classList.contains('playing');
    if(root.hidden||!state)return;
    const at=window.nativeSimulation.seconds(state);if(!force&&at-lastUpdate<.4&&at>=lastUpdate)return;lastUpdate=at;
    const q=owner.quote(state,selected),p=owner.position(state),player=window.vexedSolFlight.shipPosition(state),distance=p?Math.round(Math.hypot(p.x-player.x,p.y-player.y)):Infinity;
    root.querySelector('[data-build-specs]').innerHTML=q.ok?`<span>PRICE <strong>${q.price.toLocaleString()} L</strong></span><span>BUILD TIME <strong>${q.seconds} s</strong></span><span>HULL <strong>${q.hull.hull}</strong></span><span>SHIELDS <strong>${q.hull.shields}</strong></span><span>AVAILABLE <strong>${Math.floor(state.latinum||0).toLocaleString()} L</strong></span>`:'';
    root.querySelector('[data-build-location]').textContent=p?`${distance.toLocaleString()} units from shipyard · Order within 1,400 units`:'Travel to Sol to order a vessel. Your existing builds continue on the game clock.';
    const orderButton=root.querySelector('[data-build-order]');orderButton.disabled=!q.ok||!q.affordable||distance>1400||state.hull<=0;
    orderButton.textContent=q.ok?`Order ship · ${state.devMode?'Dev commission':q.price.toLocaleString()+' L'}`:'Unavailable';
    const orders=owner.orders(state).filter(o=>o.status!=='cancelled'),queue=root.querySelector('[data-build-queue]');
    const markup=orders.slice(-20).map(o=>`<div class="build-queue-item"><button data-build-watch="${o.shipType}">${safe(o.name)}</button><small>${o.status==='commissioned'?'Launched':o.queued?'Queued · '+Math.ceil(o.wait)+' s':o.label+' · '+Math.round(o.progress*100)+'%'}</small>${o.queued?`<button data-build-cancel="${o.id}" aria-label="Cancel ${safe(o.name)}">Cancel</button>`:''}</div>`).join('')||'<p class="build-empty">No ships ordered yet.</p>';
    if(queue.innerHTML!==markup)queue.innerHTML=markup;
  }
  function paint(timestamp){
    if(root.hidden)return;update();const state=bridge?.getState(),canvas=root.querySelector('canvas');
    if(entry&&state&&canvas){
      const building=owner.active(state),current=building?.shipType===selected?building:null;
      const seconds=current?window.nativeSimulation.seconds(state)-current.startAt:((timestamp-previewBorn)/1000*2)%(entry.plan.seconds+5);
      const sample=view.paintScene(canvas.getContext('2d'),entry,{width:canvas.width,height:canvas.height,seconds,time:timestamp/1000});
      root.querySelector('[data-build-phase]').textContent=sample.label;root.querySelector('progress').value=sample.progress;
      root.querySelector('[data-build-time]').textContent=`${Math.round(sample.progress*100)}% · ${Math.ceil(sample.remaining)} s remaining`;
      root.querySelector('[data-build-mode]').textContent=current?'LIVE CONSTRUCTION':'CONSTRUCTION PREVIEW';
    }
    raf=requestAnimationFrame(paint);
  }
  function placement(state,frame){
    const p=owner.position(state);if(!p||!frame.ship)return null;const zoom=frame.zoom||1,size=owner.station.size*zoom;
    const x=frame.cx+(p.x-frame.ship.x)*zoom,y=frame.cy+(p.y-frame.ship.y)*zoom;
    return x+size<0||y+size<0||x-size>frame.w||y-size>frame.h?null:{x,y,size,zoom};
  }
  function paintWorld(g,frame){
    const p=placement(frame.state,frame);if(!p)return false;
    if(!yardRequested){yardRequested=true;view.loadYard().catch(()=>{yardRequested=false;});}
    const item=owner.active(frame.state);
    let built=false;
    if(item){
      const type=item.shipType;if(!worldEntries.has(type)&&!worldPending.has(type)){
        worldPending.add(type);view.prepare(shipEntry(type)).then(e=>{worldEntries.clear();worldEntries.set(type,e);}).catch(()=>{}).finally(()=>worldPending.delete(type));
      }
      const art=worldEntries.get(type),b=owner.berth(frame.state,type);
      if(art){view.paintYard(g,art,{x:p.x,y:p.y,span:p.size,height:b.height*p.zoom,seconds:window.nativeSimulation.seconds(frame.state)-item.startAt,time:window.nativeSimulation.seconds(frame.state)});built=true;}
    }
    if(!built&&view.yard)g.drawImage(view.yard,p.x-p.size/2,p.y-p.size*1421/1107/2,p.size,p.size*1421/1107);
    g.save();g.fillStyle='#ecc482';g.font='11px system-ui';g.textAlign='center';g.fillText('EARTH HEAVY SHIPYARD',p.x,p.y+p.size*1421/1107/2+18);g.restore();return true;
  }
  function hit(state,frame){const p=placement(state,frame);return !!p&&Math.abs(frame.x-p.x)<p.size*.55&&Math.abs(frame.y-p.y)<p.size*.67;}
  root.addEventListener('change',e=>{if(e.target.matches('[data-build-class]'))choose(e.target.value);});
  root.addEventListener('click',e=>{
    const target=e.target.closest('button');if(!target||target.disabled)return;
    if(target.hasAttribute('data-build-close')){close();return;}
    if(target.hasAttribute('data-build-open-fleet')){close();window.nativeShipInventory?.open({page:'fleet'});return;}
    const state=bridge.getState();let result;
    if(target.hasAttribute('data-build-order'))result=owner.order(state,{shipType:selected,name:root.querySelector('[data-build-name]').value},bridge.save);
    else if(target.dataset.buildWatch){root.querySelector('[data-build-class]').value=target.dataset.buildWatch;choose(target.dataset.buildWatch);return;}
    else if(target.dataset.buildCancel)result=owner.cancel(state,target.dataset.buildCancel,bridge.save);
    if(result){notice(result.message||result.error);update(true);bridge.refresh();}
  });
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    if(e.key==='Tab'){const items=[...root.querySelectorAll('button:not(:disabled),select,input')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  button.onclick=open;
  new MutationObserver(()=>{button.hidden=!document.body.classList.contains('playing');}).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.nativeShipConstructionUI=Object.freeze({attach:api=>bridge=api,open,close,update,paint:paintWorld,hit,get active(){return !root.hidden;}});
})();
