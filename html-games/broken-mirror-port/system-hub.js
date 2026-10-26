/* Local navigation and port services for the browser port. Sol locations use
   the recovered October 2026 local system positions. */
(() => {
  'use strict';
  const world = window.VexedMirrorWorld;
  const cargoIcons=['assets/ui/mineral.svg','assets/ui/metal.svg','assets/ui/components.svg','assets/ui/computers.svg','assets/ui/fuel.svg','assets/ui/food.svg','assets/ui/medicine.svg','startup/resources/deuranium.png','assets/ui/hull-sections.svg'];
  const solPopulation={0:0,1:84000,2:120000,3:4200000000,4:50200000,5:133800000,6:0,7:1200000,8:320000,9:48000,10:36000,11:0};
  const sol = [
    [0,'Sun',-6000,-1000,false,'Our star. Observe from a safe distance.'],
    [1,'Mercury',-4100,1100,true,'Mercury Extraction Outpost buys ore and supplies equipment.'],
    [2,'Venus',-2300,-1500,true,'The Venus orbital depot handles supplies above the clouds.'],
    [3,'Earth',0,0,true,'Sol’s main port, shipyard, and center of government.'],
    [4,'Moon',1400,-250,true,'Lunar settlement and mining outpost.'],
    [5,'Mars',4800,1800,true,'Mars Colony and Refinery.'],
    [6,'Asteroid Belt',8000,-1400,false,'A wide belt of mining regions.'],
    [7,'Jupiter',11800,2700,true,'Jupiter orbital station supports supply ships and prospectors.'],
    [8,'Saturn',15300,-2700,true,'Saturn’s orbital depot serves outer system shipping lanes.'],
    [9,'Uranus',19000,3300,true,'A remote orbital research outpost.'],
    [10,'Neptune',23200,-4400,true,'Neptune Frontier Station, a distant trading and exploration destination.'],
    [11,'Pluto',27400,4200,false,'A remote, uninhabited dwarf planet beyond Neptune.']
  ].map(([id,name,x,y,port,description])=>({id,name,x,y,port,population:solPopulation[id],description}));
   const offers = {1:[7,16],2:[6,7],3:[7,34,36,9,8,4],4:[7,18],5:[6,12,17,10],7:[3,15],8:[2,13],9:[5,10],10:[1,26]};
  const goods = ['Deuranium','Antimatter','Dilithium','Food'];
  const shipArtIds=new Set([1,2,3,4,5,6,7,8,9,10,12,13,14,15,17,18,25,26,33,35,36,47,49,56,57,58,59]);
  const root=document.createElement('section');
  root.id='system-hub';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','System navigation and port services');
  document.body.appendChild(root);
  let bridge=null,tab='navigation',selected=3,note='',returnFocus=null,timer=null,shipPage=0,routePage=0,previousOverflow='';
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shipIcon=ship=>shipArtIds.has(ship.id)?`<img class="hub-ship-art" src="../flashtrek-broken-mirror/startup/sol-ships/ship-${ship.id}.png" alt="">`:`<span class="hub-ship-icon">${safe(ship.name).charAt(0)}</span>`;
  const fmt=value=>Math.floor(Number(value)||0).toLocaleString();
  const local=state=>state.system===1;
  const population=(state,id)=>window.nativeSystemCatalog ? window.nativeSystemCatalog.population(state,window.nativeSystemCatalog.bodies(state.system).find(body=>body.id===Number(id))) : Math.max(0,Math.round(Number(id===3?state.planetPopulationCounts?.[1]??Number(state.planetPopulations?.[1])*1e9:state.solPopulations?.[id]??solPopulation[id])||0));
  const nodes=state=>window.nativeSystemCatalog ? window.nativeSystemCatalog.nodes(state) : local(state)?sol.map(node=>({...node,population:population(state,node.id)})):[{id:0,name:world.systems.find(s=>s.id===state.system)?.name||'Unknown world',x:0,y:0,port:Number(state.planetPopulations?.[state.system])>0,population:Math.max(0,Math.round(Number(state.planetPopulationCounts?.[state.system]??Number(state.planetPopulations?.[state.system])*1e9))||0),description:world.systems.find(s=>s.id===state.system)?.description||''}];
  const current=state=>window.nativeSystemCatalog ? window.nativeSystemCatalog.currentId(state) : local(state)?Number(state.localBody??3):0;
  const image=node=>node.art || (local(bridge.getState())?`../flashtrek-broken-mirror/art-review/sol-planets/${String(node.id).padStart(2,'0')} - ${encodeURIComponent(node.name)}.png`:`assets/planets/planet-${world.systems.find(s=>s.id===bridge.getState().system).planetArtFrame}.png`);
  const selectedNode=state=>nodes(state).find(n=>n.id===selected)||nodes(state)[0];
  function pageControls(kind,page,total){
    if(total<=1)return '';
    return `<div class="hub-pages"><button data-page="${kind}:previous" ${page===0?'disabled':''}>Previous</button><span>Page ${page+1} of ${total}</span><button data-page="${kind}:next" ${page>=total-1?'disabled':''}>Next</button></div>`;
  }
  const pageSize=()=>window.innerHeight<620?2:4;
  function open(options,initialTab='navigation'){
    if(!options?.getState?.())return;
    if(initialTab==='navigation'){options.openMap();return;}
    bridge=options;tab=initialTab;selected=local(bridge.getState())?window.vexedSolFlight?.targetId??current(bridge.getState()):current(bridge.getState());note='';shipPage=0;routePage=0;returnFocus=document.activeElement;
    previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    root.hidden=false;render();clearInterval(timer);timer=setInterval(()=>{if(!root.hidden&&bridge.getState()?.localCruise)render()},1000);
    root.querySelector('.hub-close')?.focus({preventScroll:true});
  }
  function close(focus=true){
    if(root.hidden)return;root.hidden=true;document.body.style.overflow=previousOverflow;clearInterval(timer);timer=null;root.innerHTML='';
    if(focus)returnFocus?.focus?.({preventScroll:true});
  }
  function action(callback){const result=callback();note=result?.message||result?.error||'';render();}
  function services(state){
    const n=selectedNode(state),at=n.id===current(state),cruise=!!state.localCruise;
    const usable=n.port&&at&&!cruise;
    const deliveries=(state.localContracts||[]).filter(contract=>contract.to===n.id).length;
    return `<div class="hub-services"><div class="hub-service-visual"><img src="${image(n)}" alt="${safe(n.name)}"><div class="hub-service-caption"><span class="hub-kicker">${n.port?'PLANETARY PORT':'LOCAL DESTINATION'}</span><h3>${safe(n.name)}</h3></div></div><div class="hub-service-controls"><div class="hub-service-intro"><span class="hub-kicker">LOCAL COMMUNICATION</span><h3>${safe(n.name)}</h3><p>${safe(n.description)}</p></div><div class="hub-service-actions"><button data-hail="${n.id}" ${n.port&&!cruise?'':'disabled'}><strong>Hail</strong><small>Open a channel to ${safe(n.name)}</small></button><button data-transport="${n.id}" ${usable?'':'disabled'}><strong>Transport</strong><small>${deliveries?`${deliveries} shipment${deliveries===1?'':'s'} ready to deliver`:'Deliver cargo to this port'}</small></button><button data-buy="Antimatter" ${usable?'':'disabled'}><strong>Purchase Antimatter</strong><small>${state.devMode?'Unlimited in Dev mode':`${fmt(bridge.price('Antimatter',n.id))} latinum · 1 unit`}</small></button><button data-buy="Dilithium" ${usable?'':'disabled'}><strong>Purchase Dilithium</strong><small>${state.devMode?'Unlimited in Dev mode':`${fmt(bridge.price('Dilithium',n.id))} latinum · 1 unit`}</small></button></div><div class="hub-service-response" role="status">${safe(note||(!at?`Travel to ${n.name} to use port services.`:'Select an action to contact the port or manage supplies.'))}</div></div></div>`;
  }
  function market(state){
    const n=selectedNode(state),at=n.id===current(state),usable=n.port&&at&&!state.localCruise;
    if(!n.port)return `<div class="hub-section"><h3>No market at ${safe(n.name)}</h3><p>This destination is uninhabited and has no port services.</p></div>`;
    return `<div class="hub-section"><h3>${safe(n.name)} market</h3><p>Buy supplies here or sell resources from your hold. Prices vary by port.</p><div class="hub-market-head"><span>Resource</span><span>Aboard</span><span>Buy</span><span>Sell</span><span></span></div>${goods.map((good,i)=>{const price=bridge.price(good,n.id),held=state.devMode?'∞':fmt(state[good.toLowerCase()]);return `<div class="hub-market-row"><strong>${good}</strong><span>${held}</span><span>${fmt(price)} L</span><span>${fmt(Math.max(1,price-4))} L</span><span><button data-buy="${good}" ${usable?'':'disabled'}>Buy</button><button data-sell="${good}" ${usable?'':'disabled'}>Sell</button></span></div>`}).join('')}<p class="hub-hint">One unit per transaction. Purchases and sales save immediately.</p></div>`;
  }
  function shipyard(state){
    const n=selectedNode(state),at=n.id===current(state),usable=n.port&&at&&!state.localCruise;
    const ids=local(state)?offers[n.id]||[]:world.systems.find(s=>s.id===state.system)?.planetShopItemIds||[];
    const ships=ids.map(id=>window.nativeShipDefinitions.get(id)).filter(Boolean);
    const size=pageSize(),total=Math.max(1,Math.ceil(ships.length/size));shipPage=Math.min(shipPage,total-1);
    return `<div class="hub-section"><h3>${safe(n.name)} shipyard</h3><p>Choose a hull. Buying replaces your current ship and keeps its name.</p><div class="hub-ship-list">${ships.slice(shipPage*size,shipPage*size+size).map(ship=>`<article class="hub-ship">${shipIcon(ship)}<div><h4>${safe(ship.name)}${ship.id===state.shipType?' · Current ship':''}</h4><p>${safe(ship.description)}</p><small>Hull ${fmt(ship.hull)} · Shields ${fmt(ship.shields)} · Cargo ${fmt(ship.cargo)}</small></div><button data-ship="${ship.id}" ${usable&&ship.id!==state.shipType&&(state.devMode||state.latinum>=ship.price)?'':'disabled'}>${ship.id===state.shipType?'In command':state.devMode?'Equip':`${fmt(ship.price)} L · Buy`}</button></article>`).join('')||'<p>No ships are offered here.</p>'}</div>${pageControls('ships',shipPage,total)}</div>`;
  }
  let freightLot=10;
  const routeAmounts=new Map();
   function freightMarket(state){
     const n=selectedNode(state),e=window.nativeSolEconomy.snapshot(state,n.id),usable=n.port&&n.id===current(state)&&!state.localCruise;
     if(!n.port)return '<div class="hub-section"><h3>No port market here</h3></div>';
     return `<div class="hub-section hub-freight"><h3>${safe(n.name)} · ${safe(e.role)}</h3><p>Production and Tug Class II deliveries change each port's stock. Cargo aboard: ${fmt(e.used)} / ${fmt(e.capacity)} tons.</p><label>Freight lot <select id="freight-lot"><option value="10">10 tons</option><option value="25">25 tons</option><option value="100">100 tons</option><option value="500">500 tons</option></select></label><div class="hub-market-head"><span>Freight</span><span>Port stock</span><span>Aboard</span><span>Buy / sell lot total</span><span>Trade</span></div>${e.goods.map(g=>{const buy=window.nativeSolEconomy.quote(state,n.id,g.id,true,freightLot),sell=window.nativeSolEconomy.quote(state,n.id,g.id,false,freightLot);return `<div class="hub-market-row"><strong>${safe(g.name)}</strong><span>${fmt(g.stock)} t</span><span>${fmt(g.aboard)} t</span><span>${fmt(buy.total)} / ${fmt(sell.total)} L</span><span><button data-freight-buy="${g.id}" data-quote="${buy.total}" ${usable&&g.stock>=freightLot&&e.used+freightLot<=e.capacity?'':'disabled'}>Buy ${freightLot} t</button><button data-freight-sell="${g.id}" data-quote="${sell.total}" ${usable&&g.aboard>=freightLot?'':'disabled'}>Sell ${freightLot} t</button></span></div>`}).join('')}<p class="hub-hint">Large loads and sealed deliveries use the same ship cargo capacity. Visit another port to sell where stock is scarce.</p></div>`;
   }
   function freightRoutes(state){
     const n=selectedNode(state),e=window.nativeSolEconomy.snapshot(state,n.id),usable=n.port&&n.id===current(state)&&!state.localCruise,contracts=state.localContracts||[];
     const civilian=window.nativeCivilianTraffic.snapshot(state);
     if(!n.port)return '<div class="hub-section"><h3>No shipping lanes here</h3></div>';
     const routeSize=4,routePages=Math.max(1,Math.ceil(e.lanes.length/routeSize));
     routePage=Math.min(routePage,routePages-1);
     return `<div class="hub-section hub-freight"><h3>Sol freight · ${safe(n.name)}</h3><p>Tug Class II crews choose jobs from each port's supply and shortages. They stop to load and unload before taking another assignment.</p><h4>Your deliveries</h4><div class="hub-contracts">${contracts.map(c=>`<article><strong>${safe(sol[c.from]?.name)} → ${safe(sol[c.to]?.name)}</strong><span>${fmt(c.tons)} t ${safe(window.nativeSolEconomy.goods[c.good]||'sealed cargo')} · ${fmt(c.pay)} L</span>${c.to===current(state)&&usable?`<button data-deliver="${c.id}">Deliver and collect</button>`:''}</article>`).join('')||'<p>No freight aboard.</p>'}</div><h4>Load at ${safe(n.name)}</h4><div class="hub-route-list">${e.lanes.slice(routePage*routeSize,routePage*routeSize+routeSize).map(l=>{const key=`${n.id}:${l.to}`,amount=Math.min(l.maxLoad,Math.max(1,routeAmounts.get(key)||Math.min(25,l.maxLoad)));return `<article class="hub-route-offer"><div class="freight-offer-heading"><img class="freight-good-icon" src="${cargoIcons[l.good]||'assets/ui/freight.svg'}" alt=""><strong>${safe(n.name)} &rarr; ${safe(sol[l.to].name)}</strong><span>${safe(l.name)} &middot; ${fmt(l.demand)} t needed &middot; ${fmt(l.available)} t ready</span></div><div class="freight-picker hub-route-load" data-free-hold="${Math.max(0,e.capacity-e.used)}"><div class="freight-picker-row"><div class="freight-amount"><span>TONS TO LOAD</span><span class="freight-amount-value"><button type="button" class="freight-adjust" data-route-step="-1" data-route-for="${l.to}" aria-label="Load one ton less" ${usable&&contracts.length<2&&l.maxLoad>0?'':'disabled'}>−</button><input type="number" inputmode="numeric" min="1" max="${l.maxLoad}" step="1" value="${amount||''}" aria-label="Tons to load for ${safe(sol[l.to].name)}" data-route-tons="${l.to}" data-route-rate="${l.rate}" ${usable&&contracts.length<2&&l.maxLoad>0?'':'disabled'}><b>t</b><button type="button" class="freight-adjust" data-route-step="1" data-route-for="${l.to}" aria-label="Load one ton more" ${usable&&contracts.length<2&&l.maxLoad>0?'':'disabled'}>+</button></span></div><div class="freight-return"><span>ON DELIVERY</span><strong class="freight-metric" data-metric-value="${Math.round(amount*l.rate)}" data-route-quote="${l.to}">${amount?fmt(Math.round(amount*l.rate))+' L':'Unavailable'}</strong></div></div><div class="freight-slider-row"><input type="range" class="freight-range" min="1" max="${Math.max(1,l.maxLoad)}" value="${amount||1}" style="--fill:${amount?Math.round(amount/l.maxLoad*100):0}%" aria-label="Choose tons to load for ${safe(sol[l.to].name)}" data-route-range="${l.to}" ${usable&&contracts.length<2&&l.maxLoad>0?'':'disabled'}><button type="button" class="freight-max" data-route-max="${l.to}" ${usable&&contracts.length<2&&l.maxLoad>0?'':'disabled'}>MAX</button></div><div class="freight-picker-footer"><span><strong class="freight-metric" data-metric-value="${Math.max(0,e.capacity-e.used-amount)}" data-route-hold="${l.to}">${fmt(Math.max(0,e.capacity-e.used-amount))}</strong> t hold remaining</span><button type="button" class="freight-commit" data-contract="${l.to}" ${usable&&contracts.length<2&&l.maxLoad>0?'':'disabled'}>Load cargo</button></div></div></article>`}).join('')}</div>${pageControls('routes',routePage,routePages)}<h4>Civilian traffic</h4><div class="hub-route-list">${civilian.ships.filter(ship=>ship.system===1||ship.phase==='warp'&&ship.destinationSystem===1).slice(0,24).map(ship=>`<article><strong>${safe(ship.name)}</strong><span>${safe(ship.phase==='warp'?'In transit':ship.phase+' at '+(window.nativeSolEconomy.names[ship.port]||'the asteroid belt'))} - ${safe(ship.cargo)} - ${fmt(ship.deliveries)} deliveries, ${fmt(ship.deals)} meetings</span></article>`).join('')||'<p>No civilian ships are active nearby.</p>'}</div><p class="hub-hint">${civilian.log.slice(0,3).map(safe).join(' | ')||'Civilian crews are preparing their first voyages.'}</p><h4>Active Tug Class II transports</h4><div class="hub-route-list">${e.freighters.map(f=>`<article><strong>${safe(f.name)}</strong><span>${safe(f.activity)}${f.phase==='travel'?` / ${Math.round(f.progress*100)}% traveled`:''}</span></article>`).join('')}</div><p class="hub-hint">${e.log.slice(0,2).map(safe).join(' · ')||'Tugs are loading their first shipments.'}</p></div>`;
   }
   function tugUpgrade(state){
     if(state.shipType!==10||selected!==7)return '';
     const level=Math.max(0,Math.min(2,Number(state.shipEquipment?.instances[state.shipEquipment.slots.engineering[0]]?.upgrades?.tugEngineLevel)||0)),next=level+1;
     return `<div class="hub-section"><h3>Jupiter Station · Tug Class II engines</h3><p>Current engine: Mk ${level+1} · ${Number(window.nativeShipDefinitions.forEntity(state).speedOrOtherStationValue.toFixed(1))} speed rating. Jupiter-built upgrades improve manual flight and local cruise.</p>${level<2?`<button data-upgrade-tug ${current(state)===7&&!state.localCruise?'':'disabled'}>Install Mk ${next+1} · ${level===0?'2,000':'6,000'} latinum</button><p class="hub-hint">Requires locally produced computers and components${level===1?', plus deuranium':''}.</p>`:'<p>Maximum engine upgrade installed.</p>'}</div>`;
   }
   function render(preserveFocus=true){
    if(root.hidden||!bridge)return;
    const state=bridge.getState(),list=nodes(state);
    if(!list.some(n=>n.id===selected))selected=current(state);
    if(!local(state)&&tab==='routes')tab='services';
    const focus=preserveFocus?document.activeElement?.getAttribute('data-tab')||null:null;
    root.innerHTML=`<div class="hub-shell"><header><div><span class="hub-kicker">STARSHIP COMMAND · LOCAL SYSTEM</span><h2>${local(state)?'Sol system':safe(world.systems.find(s=>s.id===state.system)?.name||'System')}</h2></div><button class="hub-close" type="button">Return to flight ×</button></header><div class="hub-summary"><span><b>${fmt(state.latinum)}</b> latinum</span><span><b>${state.devMode?'∞':fmt(state.antimatter)}</b> antimatter</span><span><b>${safe(list.find(n=>n.id===current(state))?.name)}</b> current location</span></div><nav class="hub-tabs" aria-label="System sections">${[['navigation','Map'],['services','Port services'],['market','Market'],['routes','Cargo routes'],['shipyard','Shipyard']].map(([id,label])=>`<button data-tab="${id}" aria-pressed="${tab===id}" ${id==='routes'&&!local(state)?'disabled':''}>${label}</button>`).join('')}</nav><div class="hub-content">${tab==='services'?services(state):tab==='market'?((local(state)?freightMarket(state)+market(state):market(state))+(window.nativePlanetServices?.mineralPanel(state,selectedNode(state),selectedNode(state).port&&selected===current(state)&&!state.localCruise)||'')):tab==='routes'?freightRoutes(state):shipyard(state)+(local(state)?tugUpgrade(state):'')}</div><footer role="status">${safe(note||'Choose a destination, travel, then use its services.')}</footer></div>`;
    root.querySelector('.hub-close').onclick=()=>close();
    root.querySelectorAll('[data-prospect], [data-prospect-ore]').forEach(button=>button.onclick=()=>action(()=>bridge.prospect(button.dataset.prospectOre)));
    root.querySelectorAll('[data-refine-deuranium]').forEach(button=>button.onclick=()=>action(()=>bridge.refineDeuranium(selected,1)));
    root.querySelectorAll('[data-sell-mineral]').forEach(button=>button.onclick=()=>action(()=>bridge.sellMineral(button.dataset.sellMineral,selected,1)));
    root.querySelectorAll('[data-upgrade-mineral]').forEach(button=>button.onclick=()=>action(()=>bridge.upgradeMinerals(button.dataset.upgradeMineral,selected)));
    root.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{if(button.dataset.tab==='navigation'){close(false);bridge.openMap();return}if(button.dataset.tab==='services'){close(false);bridge.openEncounter();return}tab=button.dataset.tab;note='';render()});
    root.querySelectorAll('[data-encounter]').forEach(button=>button.onclick=()=>{close(false);bridge.openEncounter()});
    root.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{const [kind,direction]=button.dataset.page.split(':');if(kind==='ships')shipPage+=direction==='next'?1:-1;else routePage+=direction==='next'?1:-1;render(false)});
    root.querySelectorAll('[data-buy]').forEach(button=>button.onclick=()=>action(()=>bridge.trade(button.dataset.buy,true,selected)));
    root.querySelectorAll('[data-hail]').forEach(button=>button.onclick=()=>{const n=selectedNode(bridge.getState());note=`${n.name} control responds: ${n.description}`;render()});
    root.querySelectorAll('[data-transport]').forEach(button=>button.onclick=()=>{const state=bridge.getState(),delivery=(state.localContracts||[]).find(contract=>contract.to===Number(button.dataset.transport));action(()=>delivery?bridge.deliver(delivery.id):{error:`No cargo aboard is bound for ${selectedNode(state).name}. Check Cargo routes to load a shipment.`})});
    root.querySelectorAll('[data-sell]').forEach(button=>button.onclick=()=>action(()=>bridge.trade(button.dataset.sell,false,selected)));
    root.querySelectorAll('[data-ship]').forEach(button=>button.onclick=()=>action(()=>bridge.buyShip(Number(button.dataset.ship),selected)));
    const updateRouteAmount=(to,value)=>{const input=root.querySelector(`[data-route-tons="${to}"]`),range=root.querySelector(`[data-route-range="${to}"]`),quote=root.querySelector(`[data-route-quote="${to}"]`),hold=root.querySelector(`[data-route-hold="${to}"]`),button=root.querySelector(`[data-contract="${to}"]`);if(!input)return;const amount=Number(value),valid=Number.isSafeInteger(amount)&&amount>=1&&amount<=Number(input.max);input.value=value;input.closest('.freight-picker').classList.toggle('invalid',!valid);if(valid){routeAmounts.set(`${selected}:${to}`,amount);range.value=amount;range.style.setProperty('--fill',`${Math.round(amount/Number(input.max)*100)}%`);window.nativePopulation.animateMetric(quote,Math.round(amount*Number(input.dataset.routeRate)),' L');window.nativePopulation.animateMetric(hold,Math.max(0,Number(input.closest('.freight-picker').dataset.freeHold)-amount));}else quote.textContent=`Choose 1-${input.max} t`;button.disabled=!valid;};
    root.querySelectorAll('[data-route-tons]').forEach(input=>input.oninput=()=>updateRouteAmount(input.dataset.routeTons,input.value));
    root.querySelectorAll('[data-route-range]').forEach(range=>range.oninput=()=>updateRouteAmount(range.dataset.routeRange,range.value));
    root.querySelectorAll('[data-route-step]').forEach(button=>button.onclick=()=>{const input=root.querySelector(`[data-route-tons="${button.dataset.routeFor}"]`);updateRouteAmount(button.dataset.routeFor,Math.max(1,Math.min(Number(input.max),Number(input.value||1)+Number(button.dataset.routeStep))));});
    root.querySelectorAll('[data-route-max]').forEach(button=>button.onclick=()=>{const input=root.querySelector(`[data-route-tons="${button.dataset.routeMax}"]`);updateRouteAmount(button.dataset.routeMax,Number(input.max));});
    root.querySelectorAll('[data-contract]').forEach(button=>button.onclick=()=>action(()=>bridge.contract(selected,Number(button.dataset.contract),Number(root.querySelector(`[data-route-tons="${button.dataset.contract}"]`)?.value))));
    if(root.querySelector('#freight-lot'))root.querySelector('#freight-lot').value=String(freightLot);
    root.querySelector('#freight-lot')?.addEventListener('change',event=>{freightLot=Number(event.target.value);render(false)});
    root.querySelector('[data-upgrade-tug]')?.addEventListener('click',()=>action(()=>bridge.upgradeTug(selected)));
    root.querySelectorAll('[data-freight-buy]').forEach(button=>button.onclick=()=>action(()=>bridge.freightTrade(Number(button.dataset.freightBuy),true,selected,freightLot,Number(button.dataset.quote))));
    root.querySelectorAll('[data-freight-sell]').forEach(button=>button.onclick=()=>action(()=>bridge.freightTrade(Number(button.dataset.freightSell),false,selected,freightLot,Number(button.dataset.quote))));
    root.querySelectorAll('[data-deliver]').forEach(button=>button.onclick=()=>action(()=>bridge.deliver(Number(button.dataset.deliver))));
    if(focus)root.querySelector(`[data-tab="${focus}"]`)?.focus({preventScroll:true});
  }
  document.addEventListener('keydown',event=>{if(!root.hidden&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close()}},true);
  function updatePopulation(){
    if(root.hidden||!bridge)return;
    const label=root.querySelector('[data-population-count]');
    if(!label)return;
    const count=selectedNode(bridge.getState()).population;
    window.nativePopulation.animateDisplay(label,count);
  }
  window.nativeSystemHub={open,close,refresh:render,updatePopulation,population,select(id){if(!root.hidden&&nodes(bridge.getState()).some(node=>node.id===Number(id))){selected=Number(id);render();}},get active(){return !root.hidden},nodes,current,image,sol:window.nativeSystemCatalog?.bodies(1)||sol};
})();
