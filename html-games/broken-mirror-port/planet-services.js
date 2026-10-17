/* Planet shop, live ship inspection, and resource exchange. */
(() => {
  'use strict';
  const shipOffers = {1:[7,16],2:[6,7],3:[7,34,36,9,8,4],4:[7,18],5:[6,12,17,10],7:[3,15],8:[2,13],9:[5,10],10:[1,26]};
  const weaponOffers = {1:[7,10,6],2:[14,4,15],3:[1,7,10,14,15,16],4:[7,8,15],5:[6,8,17],7:[2,9,13],8:[3,11,16],9:[4,14,19],10:[2,13,17]};
  const goods = ['Deuranium','Antimatter','Dilithium','Food'];
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => Math.floor(Number(value) || 0).toLocaleString();
  const weapon = id => window.VexedMirrorWeapons?.find(item => item.id === Number(id));
  let category = 'ships', page = 0, quantity = 1, selectedShipId = null;
  let previewFrame = 0, previewGeneration = 0;

  function stopPreview() { previewGeneration++; if (previewFrame) cancelAnimationFrame(previewFrame); previewFrame = 0; }
  function reset() { stopPreview(); category = 'ships'; page = 0; quantity = 1; selectedShipId = null; }
  function offeredShips(state, place) {
    const ids = state.system === 1 ? shipOffers[place.id] || [] : window.VexedMirrorWorld.systems.find(s => s.id === state.system)?.planetShopItemIds || [];
    return ids.map(id => window.VexedMirrorWorld.ships.find(ship => ship.id === id)).filter(Boolean);
  }
  function currentShip(state, place) {
    const offers = offeredShips(state, place);
    if (!offers.some(ship => ship.id === selectedShipId)) selectedShipId = offers[0]?.id ?? null;
    return offers.find(ship => ship.id === selectedShipId);
  }
  function previewWorld(state, place) {
    if (category === 'mining') return `<div class="encounter-world encounter-mining-world"><img class="encounter-mining-tool-preview" src="../flashtrek-broken-mirror/showcase-assets/mining-laser-tool.png" alt="Mining laser tool"><div class="encounter-world-name">MINING LASER</div></div>`;
    if (category !== 'ships') return '';
    const ship = currentShip(state, place);
    if (!ship) return '';
    return `<div class="encounter-world encounter-ship-world"><canvas class="encounter-ship-preview" role="img" aria-label="Animated preview of ${safe(ship.name)}"></canvas><img class="encounter-ship-placeholder" src="../flashtrek-broken-mirror/showcase-assets/ship-${ship.id}-0.png" alt=""><div class="encounter-world-name">${safe(ship.name)}</div></div>`;
  }
  function startPreview(root, state, place) {
    stopPreview();
    const canvas = root.querySelector('.encounter-ship-preview'), ship = currentShip(state, place);
    if (!canvas || !ship) return;
    const generation = previewGeneration;
    window.vexedFlightAssets.loadShip(ship.id, ship.hull).then(asset => {
      if (generation !== previewGeneration || !canvas.isConnected) return;
      const context = canvas.getContext('2d');
      function paint(now) {
        if (generation !== previewGeneration || !canvas.isConnected) return;
        const bounds = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(bounds.width * ratio)), height = Math.max(1, Math.round(bounds.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {canvas.width = width; canvas.height = height;}
        context.clearRect(0, 0, width, height);
        const scale = Math.min(width * .66 / asset.width, height * .67 / asset.height);
        window.vexedFlightAssets.drawShip(context, asset, width / 2, height * .46, asset.width * scale, 0, now, {height:asset.height * scale, damage:true});
        canvas.classList.add('ready');
        previewFrame = requestAnimationFrame(paint);
      }
      previewFrame = requestAnimationFrame(paint);
    }).catch(() => {if (generation === previewGeneration) canvas.setAttribute('aria-label', 'Ship preview unavailable');});
  }

  function shipDetails(ship, state, usable) {
    const prestige = Number(state.localPrestige?.[state.system] || 0), required = ship.massClass * 15;
    const canBuy = usable && ship.id !== state.shipType && (state.devMode || state.latinum >= ship.price && prestige >= required);
    const standard = ship.defaultWeapons.filter(id => Number(id) > 0).map(id => {
      const item = weapon(id);
      const name = item?.name || `Weapon ${id}`;
      return `<span class="encounter-ship-weapon"><img data-weapon-icon="${id}" src="../flashtrek-broken-mirror/showcase-assets/weapon-icon-remastered-${id}.png" alt=""><span><strong>${safe(name)}</strong>${item ? `<small>Damage ${item.damage} · Reload ${(item.recharge / 13).toFixed(2)}s</small>` : ''}</span></span>`;
    }).join('') || '<span class="encounter-ship-unarmed">Unarmed</span>';
    return `<section class="encounter-ship-details" aria-label="Selected ship details"><div class="encounter-ship-title"><strong>${safe(ship.name)}</strong><span>${ship.id === state.shipType ? 'Your current ship' : `${fmt(ship.price)} latinum`}</span></div><p>${safe(ship.description)}</p><div class="encounter-ship-specs">${[['HULL',ship.hull],['SHIELDS',ship.shields],['SPEED',ship.speedOrOtherStationValue],['TURN',ship.turn],['CARGO',`${ship.cargo} t`],['FUEL EFF.',ship.antimatterUseOrPopulationEffect]].map(([label,value]) => `<div${label === 'FUEL EFF.' ? ' title="Higher efficiency uses less antimatter for travel"' : ''}><span>${label}</span><strong>${typeof value === 'number' ? fmt(value) : safe(value)}</strong></div>`).join('')}</div><div class="encounter-ship-weapons"><span>STANDARD WEAPONS</span><div>${standard}</div></div><div class="encounter-ship-purchase"><small>${state.devMode ? 'Dev mode' : `Standing ${prestige} · ${required} required`}</small><button data-buy-ship="${ship.id}" ${canBuy ? '' : 'disabled'}>${ship.id === state.shipType ? 'In command' : state.devMode ? 'Equip ship' : `Buy for ${fmt(ship.price)} L`}</button></div></section>`;
  }
  function mineralPanel(state,place,usable){
    const geology=window.nativeRegionalMinerals;if(!geology)return '';
    const region=geology.profile(state.system),main=Object.entries(region.weights).filter(([,n])=>n>=30).map(([ore])=>geology.ores[ore].name).join(' and ');
    const sales=Object.entries(geology.ores).map(([type,ore])=>{
      const held=geology.held(state,type),quote=window.nativeNpcLives.mineralQuote(state,type,place.id),canSell=usable&&held>0&&quote.funded&&quote.room;
      return `<article class="encounter-repair"><strong>${safe(ore.name)} · ${fmt(held)} aboard</strong><span>${safe(ore.use)} · Local refinery offers ${quote.unit} L per unit</span><button data-sell-mineral="${type}" ${canSell?'':'disabled'}>Sell 1</button></article>`;
    }).join('');
    const upgrades=Object.keys(geology.recipes).map(kind=>{
      const quote=geology.upgradeQuote(state,kind),enough=Object.entries(quote.materials).every(([ore,n])=>geology.held(state,ore)>=n),full=quote.level>=quote.max;
      return `<article class="encounter-repair"><strong>${safe(quote.name)} · ${quote.level}/${quote.max}</strong><span>${safe(quote.benefit)}</span><small>${Object.entries(quote.materials).map(([ore,n])=>`${n} ${safe(geology.ores[ore].name)}`).join(' + ')} · ${fmt(quote.price)} L</small><button data-upgrade-mineral="${kind}" ${usable&&!full&&enough&&state.latinum>=quote.price?'':'disabled'}>${full?'Fully upgraded':'Install level '+(quote.level+1)}</button></article>`;
    }).join('');
    return `<section class="regional-mining"><h3>${safe(region.name)}</h3><p>Richest deposits: ${safe(main||'mixed ores')}. Basic ores occur throughout the galaxy. Frontier belts offer the best chance of rare Benamite.</p><button data-prospect type="button">Find an unclaimed asteroid</button><h3>Local ore refinery</h3><p>Sell raw minerals here for funded payment, or keep them for ship upgrades. Refining adds industrial ore to this port's inventory.</p>${sales}<h3>Mineral technology</h3><p>Upgrades stay with this hull model. Each level consumes the listed minerals.</p>${upgrades}</section>`;
  }
  function shop(state, place, bridge, notice, usable) {
    const ship = currentShip(state, place), ships = offeredShips(state, place);
    const ids = state.system === 1 ? weaponOffers[place.id] || [] : [1,7,10,14,15];
    const weapons = ids.map(weapon).filter(Boolean);
    const items = category === 'ships' ? ships : weapons;
    const size = category === 'ships' ? 2 : window.innerWidth <= 620 || window.innerHeight < 550 ? 2 : 3;
    const pages = Math.max(1, Math.ceil(items.length / size)); page = Math.min(page, pages - 1);
    const shipList = `<div class="encounter-ship-choices">${ships.slice(page * size,page * size + size).map(item => `<button class="encounter-ship-choice" data-select-ship="${item.id}" aria-pressed="${item.id === selectedShipId}"><img src="../flashtrek-broken-mirror/showcase-assets/ship-${item.id}-0.png" alt=""><span><strong>${safe(item.name)}</strong><small>${fmt(item.price)} L · Hull ${fmt(item.hull)} · Cargo ${fmt(item.cargo)}</small></span><b aria-hidden="true">›</b></button>`).join('') || '<p>No ships are offered here.</p>'}</div>`;
    const weaponList = `<div class="encounter-shop-list">${weapons.slice(page * size,page * size + size).map(item => `<article class="encounter-shop-item"><div><strong>${safe(item.name)}</strong><small>${safe(item.description)}</small><em>Damage ${item.damage} · Reload ${(item.recharge / 13).toFixed(2)}s</em></div><button data-buy-weapon="${item.id}" ${usable && (state.devMode || state.latinum >= item.price) ? '' : 'disabled'}>${state.devMode ? 'Add to locker' : `${fmt(item.price)} L · Buy`}</button></article>`).join('') || '<p>No weapons are offered here.</p>'}</div>`;
    const hull = window.nativeShipDefinitions?.forEntity(state)||window.VexedMirrorWorld.ships.find(item => item.id === state.shipType);
    const repairList = `<article class="encounter-repair"><strong>Hull &amp; shield repairs</strong><span>Restore 25% of each system for 40 latinum.</span><small>Hull ${fmt(state.hull)} / ${fmt(hull.hull)} · Shields ${fmt(state.shields)} / ${fmt(hull.shields)}</small><button data-repair ${usable && (state.hull < hull.hull || state.shields < hull.shields) ? '' : 'disabled'}>${state.hull >= hull.hull && state.shields >= hull.shields ? 'Fully repaired' : 'Repair ship'}</button></article>`;
    const miningList = `<div class="encounter-mining-scroll"><article class="encounter-repair encounter-mining-offer"><strong>Mining laser</strong><span>Cut intact asteroids with the mining beam. Collect the ore pieces it releases in space.</span><small>Installed on your ship permanently · 120 latinum</small><button data-buy-mining ${usable && !state.miningTool && (state.devMode || state.latinum >= 120) ? '' : 'disabled'}>${state.miningTool ? 'Installed' : state.devMode ? 'Install laser' : 'Buy for 120 L'}</button></article>`+mineralPanel(state,place,usable)+'</div>';
    return `<div class="encounter-service-controls ${category === 'ships' ? 'encounter-ship-shop' : ''}"><div class="encounter-service-heading"><span>PORT EXCHANGE</span><h2>Shop at ${safe(place.name)}</h2><p>${state.devMode ? 'Dev mode' : `${fmt(state.latinum)} latinum available`}</p></div><div class="encounter-service-tabs">${[['ships','Ships'],['weapons','Weapons'],['mining','Mining'],['services','Repairs']].map(([id,label]) => `<button data-shop-category="${id}" aria-pressed="${category === id}">${label}</button>`).join('')}</div>${category === 'ships' ? `${ship ? shipDetails(ship,state,usable) : ''}${shipList}` : category === 'weapons' ? weaponList : category === 'mining' ? miningList : repairList}${pages > 1 && (category === 'ships' || category === 'weapons') ? `<div class="encounter-service-pages"><button data-shop-page="previous" ${page === 0 ? 'disabled' : ''}>Previous</button><span>${page + 1} / ${pages}</span><button data-shop-page="next" ${page === pages - 1 ? 'disabled' : ''}>Next</button></div>` : ''}<p class="encounter-service-notice" role="status">${safe(notice || (category === 'ships' ? 'Select a ship to inspect it before buying.' : 'Choose an item at this port.'))}</p></div>`;
  }
  function trade(state, place, bridge, notice, usable) {
    return `<div class="encounter-service-controls"><div class="encounter-service-heading"><span>INTERPLANETARY EXCHANGE</span><h2>Trade at ${safe(place.name)}</h2><p>Buy here, travel, then sell where prices are higher.</p></div><div class="encounter-trade-top"><span><strong>${state.devMode ? '∞' : fmt(state.latinum)}</strong> latinum</span><div class="encounter-trade-quantity"><span>Units</span>${[1,5,10].map(n => `<button data-trade-quantity="${n}" aria-pressed="${quantity === n}">${n}</button>`).join('')}</div></div><div class="encounter-trade-list">${goods.map(good => {const buy = bridge.price(good, place.id), sell = Math.max(1, buy - 4), held = Number(state[good.toLowerCase()] || 0); return `<article class="encounter-trade-item"><div><strong>${good}</strong><small>Aboard ${state.devMode ? '∞' : fmt(held)}</small></div><div class="encounter-trade-prices"><span>Buy <b>${buy} L</b></span><span>Sell <b>${sell} L</b></span></div><div class="encounter-trade-buttons"><button data-trade-buy="${good}" ${usable && (state.devMode || state.latinum >= buy * quantity && Number(state.stocks?.[good]) >= quantity) ? '' : 'disabled'}>Buy</button><button data-trade-sell="${good}" ${usable && (state.devMode || held >= quantity) ? '' : 'disabled'}>Sell</button></div></article>`;}).join('')}</div><p class="encounter-service-notice" role="status">${safe(notice || 'Prices vary by port. Transactions save immediately.')}</p></div>`;
  }
  function bind(root, bridge, place, update) {
    const state = bridge.getState(); startPreview(root, state, place);
    const act = result => update(result?.message || result?.error || '');
    root.querySelectorAll('[data-shop-category]').forEach(button => button.onclick = () => {category = button.dataset.shopCategory; page = 0; update('');});
    root.querySelectorAll('[data-shop-page]').forEach(button => button.onclick = () => {page += button.dataset.shopPage === 'next' ? 1 : -1; if (category === 'ships') selectedShipId = offeredShips(state,place)[page * 2]?.id ?? selectedShipId; update(null);});
    root.querySelectorAll('[data-select-ship]').forEach(button => button.onclick = () => {selectedShipId = Number(button.dataset.selectShip); update('');});
    root.querySelector('[data-buy-ship]')?.addEventListener('click', event => act(bridge.buyShip(Number(event.currentTarget.dataset.buyShip), place.id)));
    root.querySelectorAll('[data-buy-weapon]').forEach(button => button.onclick = () => act(bridge.buyWeapon(Number(button.dataset.buyWeapon), place.id)));
    root.querySelector('[data-repair]')?.addEventListener('click', () => act(bridge.repair(place.id)));
    root.querySelector('[data-buy-mining]')?.addEventListener('click', () => act(bridge.buyMiningTool(place.id)));
    root.querySelector('[data-prospect]')?.addEventListener('click',()=>act(bridge.prospect()));
    root.querySelectorAll('[data-sell-mineral]').forEach(button=>button.onclick=()=>act(bridge.sellMineral(button.dataset.sellMineral,place.id,1)));
    root.querySelectorAll('[data-upgrade-mineral]').forEach(button=>button.onclick=()=>act(bridge.upgradeMinerals(button.dataset.upgradeMineral,place.id)));
    root.querySelectorAll('[data-trade-quantity]').forEach(button => button.onclick = () => {quantity = Number(button.dataset.tradeQuantity); update('');});
    root.querySelectorAll('[data-trade-buy]').forEach(button => button.onclick = () => act(bridge.trade(button.dataset.tradeBuy, true, place.id, quantity)));
    root.querySelectorAll('[data-trade-sell]').forEach(button => button.onclick = () => act(bridge.trade(button.dataset.tradeSell, false, place.id, quantity)));
  }
  window.nativePlanetServices = {reset, stopPreview, previewWorld, shop, trade, bind,mineralPanel};
})();
