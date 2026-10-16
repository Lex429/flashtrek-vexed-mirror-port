const tradeButton=document.createElement('button');tradeButton.id='trade-open';tradeButton.type='button';tradeButton.textContent='Trade & cargo routes';tradeButton.hidden=true;document.querySelector('.controls').prepend(tradeButton);
const tradeUI=document.createElement('section');tradeUI.id='trade-ui';tradeUI.hidden=true;tradeUI.setAttribute('role','dialog');tradeUI.setAttribute('aria-modal','true');tradeUI.setAttribute('aria-label','Trade and cargo routes');game.appendChild(tradeUI);
let tradeTab='market',tradeState,tradeTimer,tradeMessage='',tradeMessageError=false,tradeQuantity=1;
const tradeNumber=n=>Number(n||0).toLocaleString();
const tradeEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function tradeCall(action,value=0,quantity=0){return player?.ruffle().callExternalInterface('vexTrade',action,value,quantity);}
function tradeNotice(message){gameNotify(message,'trade');if(!tradeUI.hidden){tradeMessage=message;tradeMessageError=false;refreshTrade();}}
function renderTrade(frame){tradeButton.hidden=frame!==154;if(frame!==154){closeTrade(false);}}
function closeTrade(focus=true){tradeUI.hidden=true;clearInterval(tradeTimer);tradeTimer=undefined;if(focus)focusGame();}
function openTrade(tab='market'){
 if(Number(game.dataset.frame)!==154)return;
 if(typeof closeSol==='function')closeSol(false);
 if(typeof galaxyMap!=='undefined'&&!galaxyMap.hidden)closeGalaxyMap(false);
 tradeTab=['market','routes','cargo'].includes(tab)?tab:'market';tradeMessage='';tradeMessageError=false;tradeUI.hidden=false;refreshTrade();
 clearInterval(tradeTimer);tradeTimer=setInterval(()=>{if(tradeTab!=='market'||!tradeUI.contains(document.activeElement)||!document.activeElement.matches('input'))refreshTrade();},2000);
 tradeUI.querySelector('.trade-close')?.focus();
}
tradeButton.onclick=()=>openTrade();
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!tradeUI.hidden){event.preventDefault();closeTrade();}});
function tradePerform(action,id,quantity){const result=tradeCall(action,id,quantity);tradeMessage=result?.message||result?.error||'The trade could not be completed.';tradeMessageError=!result?.ok;refreshTrade();}
function tradeIcon(id){return ['startup/resources/antimatter.png','startup/resources/latinum.png','startup/resources/deuranium.png'][id%3];}
function tradeRoutePhase(route){if(route.phase==='unknown')return 'Destination not surveyed';if(route.phase==='departing')return 'Leaving '+route.from;if(route.phase==='arriving')return 'Approaching '+route.to;if(route.phase==='transit')return 'In transit';if(route.phase==='suspended')return 'Suspended';return 'Preparing next load';}
function tradeMarketMarkup(state){
 const disabled=!state.allowed;
 return `<div class="trade-section-heading"><div><h3>${tradeEscape(state.planet)} market</h3><p>${tradeEscape(state.government)} · Produces ${tradeEscape(state.producer)}</p></div><label class="trade-quantity">Tons per trade<input id="trade-quantity" type="number" min="1" max="9999" step="1" value="${tradeQuantity}"></label></div>
 <p class="trade-guidance">${!state.inhabited?'No inhabited market here. Find a populated planet.':!state.docked?'Enter this planet’s orbit and brake to a stop to trade.':!state.allowed?'This government refuses trade. Improve your standing or obtain a planet pass.':'Buy cargo here, then sell it where demand is higher. Prices are per ton; contract cargo is delivered separately.'}</p>
 <div class="trade-table-scroll"><table class="trade-table"><thead><tr><th>Goods</th><th>In stock</th><th>Buy / t</th><th>Sell / t</th><th>Aboard</th><th>Trade</th></tr></thead><tbody>${state.goods.map(g=>{
 const qty=tradeQuantity,buyDisabled=disabled||g.stock<qty||state.capacity-state.used<qty||state.latinum<g.buy*qty,sellDisabled=disabled||g.owned<qty||g.stock+qty>400;
 return `<tr><th scope="row"><span>${tradeEscape(g.name)}</span><small>${g.produces?'Local production':g.stock<40?'Supply running low':g.stock>160?'Well supplied':'Import demand'}</small></th><td>${tradeNumber(g.stock)} t</td><td>${tradeNumber(g.buy)}</td><td>${tradeNumber(g.sell)}</td><td>${tradeNumber(g.owned)} t</td><td><div class="trade-row-actions"><button type="button" data-buy="${g.id}" ${buyDisabled?'disabled':''}>Buy</button><button type="button" data-sell="${g.id}" ${sellDisabled?'disabled':''}>Sell</button></div></td></tr>`;
 }).join('')}</tbody></table></div><p class="trade-fine">Stock is consumed and replenished over time. Shipments add supply; shortages raise prices. Deuranium bought here is cargo, separate from your ship’s construction resources.</p>`;
}
function tradeCargoMarkup(state){return `<div class="trade-section-heading"><div><h3>Your cargo hold</h3><p>${tradeNumber(state.used)} of ${tradeNumber(state.capacity)} tons occupied</p></div><button type="button" id="trade-deliver" ${!state.allowed||!state.deliveries.some(d=>d.ready)?'disabled':''}>Deliver cargo & collect payment</button></div>
 <h4>Delivery jobs</h4>${state.deliveries.length?state.deliveries.map(d=>`<article class="trade-contract"><div><strong>${tradeNumber(d.tons)} t · ${tradeEscape(d.name)}</strong><p>Destination: <b>${tradeEscape(d.destination)}</b></p></div><div><strong>${tradeNumber(d.payment)} latinum</strong><small>${d.ready?'Destination reached — enter orbit and deliver':'Payment on delivery'}</small></div></article>`).join(''):'<p class="trade-empty">No delivery jobs aboard. Open Cargo routes to collect a shipment at an endpoint.</p>'}
 <h4>Goods you own</h4>${state.goods.some(g=>g.owned)?state.goods.filter(g=>g.owned).map(g=>`<div class="trade-owned"><span>${tradeEscape(g.name)}</span><b>${tradeNumber(g.owned)} t</b></div>`).join(''):'<p class="trade-empty">No market goods aboard. Buy goods in the Market tab.</p>'}<p class="trade-fine">Use Sell for goods you bought. Use Deliver cargo for a job’s payment. T also delivers matching jobs while stopped in orbit.</p>`;}
function tradeRoutesMarkup(state){return `<div class="trade-section-heading"><div><h3>Scheduled cargo routes</h3><p>Trade day ${tradeNumber(state.day)} · One trade day passes every 30 seconds of flight.</p></div></div>
 <p class="trade-guidance">Freighters carry real stock in both directions, even while you’re elsewhere. Warp travel advances shipments and markets. Wars can suspend routes; destroyed shipments never replenish their destination.</p>
 <div class="trade-route-list">${state.routes.map(route=>{
 const qty=Math.min(10,Math.max(0,Math.floor(state.capacity-state.used))),pay=qty*(20+[2,3,4][route.id]*8),blocked=Boolean(route.blocked);
 const progress=route.phase==='departing'?8:route.phase==='transit'?Math.round(15+65*(1-route.days/[2,3,4][route.id])):route.phase==='arriving'?88:3;
 return `<article class="trade-route ${route.local?'trade-route-local':''}"><div class="trade-route-top"><strong>${tradeEscape(route.label)}</strong><span class="trade-badge ${blocked?'trade-badge-danger':''}">${blocked?'Suspended':route.local?'In this system':route.surveyed?'Active':'Unsurveyed'}</span></div>
 <div class="trade-route-path"><span>${tradeEscape(route.from)}</span><div class="trade-route-line"><i style="left:${Math.max(3,Math.min(95,progress))}%"><img src="startup/ships/ship-18.png" alt="Freighter"></i></div><span>${tradeEscape(route.to)}</span></div>
 <div class="trade-route-bottom"><div><b>${tradeEscape(tradeRoutePhase(route))}</b><p>${route.tons?tradeNumber(route.tons)+' t of '+tradeEscape(route.good):route.surveyed?'Awaiting cargo':'Cargo not surveyed'}${blocked?' · '+tradeEscape(route.blocked):route.phase==='unknown'?'':' · Next phase in ~'+route.seconds+' s'}</p><small>${route.surveyed?route.deliveries+' deliveries · '+route.lost+' lost shipments':'Visit both endpoints to survey this route.'}</small></div>
 ${route.local?`<button type="button" data-contract="${route.id}" data-tons="${qty}" ${!state.allowed||blocked||qty<1?'disabled':''}>Take ${qty} t delivery<br><small>Earn ${tradeNumber(pay)} latinum</small></button>`:''}</div></article>`;
 }).join('')||'<p class="trade-empty">No surveyed routes here. Explore other systems to discover their trade links.</p>'}</div><h4>Latest shipping reports</h4><div class="trade-log">${state.log.map(item=>`<p><span>Day ${item.day}</span> ${tradeEscape(item.text)}</p>`).join('')}</div>`;}
function refreshTrade(){
 if(tradeUI.hidden)return;const state=tradeCall('state');if(!state?.ok){closeTrade();return;}tradeState=state;
 const active=document.activeElement,focusKey=tradeUI.contains(active)?active.id:null,scroll=tradeUI.querySelector('.trade-content')?.scrollTop||0;
 tradeUI.innerHTML=`<div class="trade-header"><div><p class="trade-kicker">COMMERCE & LOGISTICS</p><h2>Trade & cargo routes</h2></div><button type="button" class="trade-close" aria-label="Close trading and return to flight">Return to flight ×</button></div>
 <div class="trade-summary"><span><img src="startup/resources/latinum.png" alt="">${tradeNumber(state.latinum)} <small>latinum</small></span><span>${tradeNumber(state.used)} / ${tradeNumber(state.capacity)} <small>cargo tons</small></span><span class="trade-location">${tradeEscape(state.planet)} <small>${state.docked?'In orbit':'Flying'}</small></span></div>
 <nav class="trade-tabs" aria-label="Trading sections">${[['market','Market'],['cargo','Your cargo'],['routes','Cargo routes']].map(([id,name])=>`<button type="button" data-tab="${id}" aria-pressed="${tradeTab===id}">${name}</button>`).join('')}</nav>
 <div class="trade-content">${tradeTab==='market'?tradeMarketMarkup(state):tradeTab==='cargo'?tradeCargoMarkup(state):tradeRoutesMarkup(state)}</div>
 <div class="trade-footer"><p class="trade-message ${tradeMessageError?'trade-error':''}" role="status" aria-live="polite">${tradeEscape(tradeMessage||'Transactions happen immediately. Save your game to retain cargo, stock, and route progress.')}</p><button type="button" id="trade-services">Planet services</button></div>`;
 tradeUI.querySelector('.trade-close').onclick=()=>closeTrade();
 tradeUI.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tradeTab=b.dataset.tab;tradeMessage='';refreshTrade();});
 const quantity=tradeUI.querySelector('#trade-quantity');if(quantity)quantity.onchange=()=>{const value=Number(quantity.value);tradeQuantity=Number.isInteger(value)&&value>0&&value<=9999?value:1;refreshTrade();tradeUI.querySelector('#trade-quantity')?.focus();};
 tradeUI.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>tradePerform('buy',Number(b.dataset.buy),tradeQuantity));
 tradeUI.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>tradePerform('sell',Number(b.dataset.sell),tradeQuantity));
 tradeUI.querySelectorAll('[data-contract]').forEach(b=>b.onclick=()=>{tradePerform('contract',Number(b.dataset.contract),Number(b.dataset.tons));if(!tradeMessageError){tradeTab='cargo';refreshTrade();}});
 const deliver=tradeUI.querySelector('#trade-deliver');if(deliver)deliver.onclick=()=>tradePerform('deliver');
 tradeUI.querySelector('#trade-services').onclick=()=>{if(!state.docked){tradeMessage='Enter orbit and stop before opening planet services.';tradeMessageError=true;refreshTrade();return;}const r=tradeCall('legacy');if(r?.ok)closeTrade();};
 tradeUI.querySelector('.trade-content').scrollTop=scroll;if(focusKey)tradeUI.querySelector('#'+CSS.escape(focusKey))?.focus();
}
