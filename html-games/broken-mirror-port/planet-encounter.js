/* Focused planet encounter shown when the player clicks a world in flight. */
(() => {
  'use strict';
  const world = window.VexedMirrorWorld;
  const cargoIcons=['assets/ui/mineral.svg','assets/ui/metal.svg','assets/ui/components.svg','assets/ui/computers.svg','assets/ui/fuel.svg','assets/ui/food.svg','assets/ui/medicine.svg','startup/resources/deuranium.png','assets/ui/hull-sections.svg'];
  const root = document.createElement('section');
  root.id = 'planet-encounter';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Planet communication');
  document.body.appendChild(root);

  let bridge = null;
  let timer = null;
  let priorOverflow = '';
  let priorFocus = null;
  let displayedPrestige = null;
  let openingPrestige = null;
  let change = '';
  let notice = '';
  let view = 'planet';
  let cargoPage = 0;
  const cargoAmounts = new Map();

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const signed = value => `${value > 0 ? '+' : ''}${Math.floor(value)}`;
  const currentPlace = state => state.system === 1
    ? window.nativeSystemHub.sol.find(node => node.id === Number(state.localBody ?? 3))
    : {id:0, name:world.systems.find(system => system.id === state.system)?.name || 'Unknown world', port:Number(state.planetPopulations?.[state.system]) > 0};
  const planetImage = (state, place) => state.system === 1
    ? `../flashtrek-broken-mirror/art-review/sol-planets/${String(place.id).padStart(2, '0')} - ${encodeURIComponent(place.name)}.png`
    : `assets/planets/planet-${world.systems.find(system => system.id === state.system)?.planetArtFrame || 1}.png`;
  const prestige = state => {
    const value = Number(state.localPrestige?.[state.system]);
    return Number.isFinite(value) ? Math.floor(value) : 0;
  };
  const population=(state,place)=>state.system===1?window.nativeSystemHub.population(state,place.id):Math.max(0,Math.round(Number(state.planetPopulationCounts?.[state.system]??Number(state.planetPopulations?.[state.system])*1e9))||0);
  const standing = value => value >= 100 ? 'Allied' : value < 0 ? 'Hostile' : 'Neutral';

  function cargoContents(state, place) {
    const jobs = Array.isArray(state.localContracts) ? state.localContracts : [];
    const planets = window.nativeSystemHub.sol;
    const freight = state.system === 1 ? window.nativeSolEconomy.snapshot(state,place.id) : null;
    const offers = freight ? freight.lanes.map(lane => {const planet=planets.find(node => node.id === lane.to);return {...planet,...lane,name:planet?.name||'Unknown',nameOfGood:lane.name};}) : [];
    const size = 4;
    const pages = Math.max(1, Math.ceil(offers.length / size));
    cargoPage = Math.min(cargoPage, pages - 1);
    const capacity = Number(window.nativeShipDefinitions.forEntity(state).cargo || 0);
    const reserved = jobs.reduce((total, job) => total + Number(job.tons || 0), 0);
    const canLoad = state.system === 1 && place.port && !state.localCruise && jobs.length < 2;
    return `<div class="encounter-cargo-controls">
      <div class="encounter-cargo-heading"><span>PLANETARY SHIPPING</span><h2>Cargo at ${escape(place.name)}</h2><p>Load here. Travel to the destination. Deliver there to collect payment.</p></div>
      <div class="encounter-cargo-summary"><div><strong>${jobs.length} / 2</strong><span>shipments aboard</span></div><div><strong>${reserved} / ${capacity}</strong><span>freight tons reserved</span></div></div>
      ${jobs.length ? `<section class="encounter-cargo-active"><h3>Shipments aboard</h3>${jobs.map(job => {
        const origin = planets.find(node => node.id === job.from)?.name || 'Unknown';
        const destination = planets.find(node => node.id === job.to)?.name || 'Unknown';
        const deliverable = state.system === 1 && job.to === place.id && place.port && !state.localCruise;
        return `<article class="encounter-cargo-job"><div><strong>${escape(origin)} → ${escape(destination)}</strong><small>${job.tons} tons · ${Number(job.pay).toLocaleString()} latinum on delivery</small></div>${deliverable ? `<button data-cargo-deliver="${job.id}">Deliver &amp; collect</button>` : `<span class="encounter-cargo-destination">Deliver at ${escape(destination)}</span>`}</article>`;
      }).join('')}</section>` : ''}
      <section class="encounter-cargo-offers"><h3>Load a shipment at ${escape(place.name)}</h3>${offers.length ? offers.slice(cargoPage * size, cargoPage * size + size).map(destination => {
        const key=`${place.id}:${destination.id}`,amount=Math.min(destination.maxLoad,Math.max(1,cargoAmounts.get(key)||Math.min(25,destination.maxLoad)));
        const enabled=canLoad&&destination.maxLoad>0,fill=amount?Math.round(amount/destination.maxLoad*100):0;
        return `<article class="encounter-cargo-job encounter-cargo-offer"><div class="freight-offer-heading"><img class="freight-good-icon" src="${cargoIcons[destination.good]||'assets/ui/freight.svg'}" alt=""><strong>${escape(place.name)} &rarr; ${escape(destination.name)}</strong><small>${escape(destination.nameOfGood)} &middot; ${destination.demand.toLocaleString()} t needed &middot; ${destination.available.toLocaleString()} t ready</small></div><div class="freight-picker encounter-cargo-load" data-free-hold="${Math.max(0,capacity-freight.used)}"><div class="freight-picker-row"><div class="freight-amount"><span>TONS TO LOAD</span><span class="freight-amount-value"><button type="button" class="freight-adjust" data-cargo-step="-1" data-cargo-for="${destination.id}" aria-label="Load one ton less" ${enabled?'':'disabled'}>−</button><input type="number" inputmode="numeric" min="1" max="${destination.maxLoad}" step="1" value="${amount||''}" aria-label="Tons to load for ${escape(destination.name)}" data-cargo-tons="${destination.id}" data-cargo-rate="${destination.rate}" ${enabled?'':'disabled'}><b>t</b><button type="button" class="freight-adjust" data-cargo-step="1" data-cargo-for="${destination.id}" aria-label="Load one ton more" ${enabled?'':'disabled'}>+</button></span></div><div class="freight-return"><span>ON DELIVERY</span><strong class="freight-metric" data-metric-value="${Math.round(amount*destination.rate)}" data-cargo-quote="${destination.id}">${amount?Math.round(amount*destination.rate).toLocaleString()+' L':'Unavailable'}</strong></div></div><div class="freight-slider-row"><input type="range" class="freight-range" min="1" max="${Math.max(1,destination.maxLoad)}" value="${amount||1}" style="--fill:${fill}%" aria-label="Choose tons to load for ${escape(destination.name)}" data-cargo-range="${destination.id}" ${enabled?'':'disabled'}><button type="button" class="freight-max" data-cargo-max="${destination.id}" ${enabled?'':'disabled'}>MAX</button></div><div class="freight-picker-footer"><span><strong class="freight-metric" data-metric-value="${Math.max(0,capacity-freight.used-amount)}" data-cargo-hold="${destination.id}">${Math.max(0,capacity-freight.used-amount).toLocaleString()}</strong> t hold remaining</span><button type="button" class="freight-commit" data-cargo-load="${destination.id}" ${enabled?'':'disabled'}>Load cargo</button></div></div></article>`;
      }).join('') : '<p>No shipping jobs are offered here.</p>'}</section>
      ${pages > 1 ? `<div class="encounter-cargo-pages"><button data-cargo-page="previous" ${cargoPage === 0 ? 'disabled' : ''}>Previous</button><span>${cargoPage + 1} / ${pages}</span><button data-cargo-page="next" ${cargoPage === pages - 1 ? 'disabled' : ''}>Next</button></div>` : ''}
      <p class="encounter-cargo-notice" role="status">${escape(notice || (jobs.length >= 2 ? 'Two shipments aboard. Deliver one before loading another.' : 'Payment arrives when you deliver at the destination.'))}</p>
    </div>`;
  }

  function render() {
    if (root.hidden || !bridge) return;
    const state = bridge.getState();
    const place = currentPlace(state);
    const residents=population(state,place);
    const value = prestige(state);
    const relation = standing(value);
    const marker = Math.max(0, Math.min(100, (value + 100) / 2));
    const usable = place?.port && !state.localCruise;
    const antimatterPrice = bridge.price('Antimatter', place.id);
    const dilithiumPrice = bridge.price('Dilithium', place.id);
    const controls = view === 'cargo' ? cargoContents(state, place) : view === 'shop' ? window.nativePlanetServices.shop(state, place, bridge, notice, usable) : view === 'trade' ? window.nativePlanetServices.trade(state, place, bridge, notice, usable) : `<div class="encounter-controls">
        <div class="encounter-title"><span>PLANET COMMUNICATION</span><h2>${escape(place.name)}</h2></div>
        <div class="encounter-standing" aria-label="Your standing: ${signed(value)}, ${relation}">
          <div class="encounter-standing-top"><span>YOUR STANDING <small>${state.system === 1 ? 'SOL REGION' : 'LOCAL PRESTIGE'}</small></span><strong>${signed(value)}</strong></div>
          <div class="encounter-relation"><span class="encounter-status-dot"></span>${relation}<span class="encounter-change">${escape(change)}</span></div>
          <div class="encounter-meter" role="img" aria-label="Standing scale from negative 100 to positive 100; current standing ${signed(value)}"><span class="encounter-zero"></span><span class="encounter-marker" style="left:${marker}%"></span></div>
          <div class="encounter-ticks"><span>−100</span><span>0</span><span>+100</span></div>
        </div>
        <div class="encounter-actions">
          <button type="button" disabled><span>Hail</span><small>Available later</small></button>
          <button type="button" disabled><span>Transport</span><small>Available later</small></button>
          <button type="button" data-purchase="Antimatter" ${usable ? '' : 'disabled'}><span>Purchase Antimatter</span><small>${state.devMode ? 'Unlimited in Dev mode' : `${antimatterPrice} latinum · 1 unit`}</small></button>
          <button type="button" data-purchase="Dilithium" ${usable ? '' : 'disabled'}><span>Purchase Dilithium</span><small>${state.devMode ? 'Unlimited in Dev mode' : `${dilithiumPrice} latinum · 1 unit`}</small></button>
        </div>
        <p class="encounter-notice" role="status">${escape(notice || (usable ? 'Choose a supply to purchase.' : 'No port services are available here.'))}</p>
      </div>`;
    const shipWorld = view === 'shop' ? window.nativePlanetServices.previewWorld(state, place) : '';
    root.innerHTML = `<div class="encounter-panel" data-standing="${relation.toLowerCase()}" data-view="${view}">
      <button class="encounter-close" type="button" aria-label="Close planet communication"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4 16 16M16 4 4 16"/></svg></button>
      <nav class="encounter-page-nav" aria-label="Planet pages">${[['planet','Planet'],['cargo','Cargo'],['shop','Shop'],['trade','Trade']].map(([id,label]) => `<button type="button" data-view-tab="${id}" aria-pressed="${view === id}">${label}</button>`).join('')}</nav>
      ${shipWorld || `<div class="encounter-world"><img src="${planetImage(state, place)}" alt="${escape(place.name)}"><div class="encounter-world-name">${escape(place.name)}<small data-population-count data-population-value="${residents}">POPULATION · ${residents?residents.toLocaleString():'Uninhabited'}</small></div></div>`}
      ${controls}
    </div>`;
    root.querySelector('.encounter-close').onclick = () => close();
    root.querySelectorAll('[data-view-tab]').forEach(button => button.onclick = () => {view = button.dataset.viewTab; notice = ''; cargoPage = 0; render();});
    root.querySelectorAll('[data-purchase]').forEach(button => button.onclick = () => {
      const result = bridge.trade(button.dataset.purchase, true, place.id);
      notice = result?.message || result?.error || '';
      render();
    });
    root.querySelectorAll('[data-cargo-page]').forEach(button => button.onclick = () => {cargoPage += button.dataset.cargoPage === 'next' ? 1 : -1; render();});
    const updateCargoAmount=(to,value)=>{const input=root.querySelector(`[data-cargo-tons="${to}"]`),range=root.querySelector(`[data-cargo-range="${to}"]`),quote=root.querySelector(`[data-cargo-quote="${to}"]`),hold=root.querySelector(`[data-cargo-hold="${to}"]`),button=root.querySelector(`[data-cargo-load="${to}"]`);if(!input)return;const amount=Number(value),valid=Number.isSafeInteger(amount)&&amount>=1&&amount<=Number(input.max);input.value=value;input.closest('.freight-picker').classList.toggle('invalid',!valid);if(valid){cargoAmounts.set(`${place.id}:${to}`,amount);range.value=amount;range.style.setProperty('--fill',`${Math.round(amount/Number(input.max)*100)}%`);window.nativePopulation.animateMetric(quote,Math.round(amount*Number(input.dataset.cargoRate)),' L');window.nativePopulation.animateMetric(hold,Math.max(0,Number(input.closest('.freight-picker').dataset.freeHold)-amount));}else quote.textContent=`Choose 1-${input.max} t`;button.disabled=!valid;};
    root.querySelectorAll('[data-cargo-tons]').forEach(input=>input.oninput=()=>updateCargoAmount(input.dataset.cargoTons,input.value));
    root.querySelectorAll('[data-cargo-range]').forEach(range=>range.oninput=()=>updateCargoAmount(range.dataset.cargoRange,range.value));
    root.querySelectorAll('[data-cargo-step]').forEach(button=>button.onclick=()=>{const input=root.querySelector(`[data-cargo-tons="${button.dataset.cargoFor}"]`);updateCargoAmount(button.dataset.cargoFor,Math.max(1,Math.min(Number(input.max),Number(input.value||1)+Number(button.dataset.cargoStep))));});
    root.querySelectorAll('[data-cargo-max]').forEach(button=>button.onclick=()=>{const input=root.querySelector(`[data-cargo-tons="${button.dataset.cargoMax}"]`);updateCargoAmount(button.dataset.cargoMax,Number(input.max));});
    root.querySelectorAll('[data-cargo-load]').forEach(button => button.onclick = () => {const amount=Number(root.querySelector(`[data-cargo-tons="${button.dataset.cargoLoad}"]`)?.value);const result = bridge.contract(place.id, Number(button.dataset.cargoLoad),amount); notice = result?.message || result?.error || ''; render();});
    root.querySelectorAll('[data-cargo-deliver]').forEach(button => button.onclick = () => {const result = bridge.deliver(Number(button.dataset.cargoDeliver)); notice = result?.message || result?.error || ''; render();});
    window.nativePlanetServices.bind(root, bridge, place, message => {if (message !== null) notice = message; render();});
  }

  function refresh() {
    if (root.hidden || !bridge) return;
    const state=bridge.getState(),residents=population(state,currentPlace(state));
    const label=root.querySelector('[data-population-count]');
    window.nativePopulation.animateDisplay(label,residents,'POPULATION · ');
    const next = prestige(state);
    if (next === displayedPrestige) return;
    const difference = next - openingPrestige;
    change = difference ? `${difference > 0 ? '+' : ''}${difference} since opening` : '';
    displayedPrestige = next;
    render();
  }

  function open(options) {
    if (!options?.getState?.()) return;
    if (!root.hidden) close(false);
    bridge = options;
    displayedPrestige = prestige(bridge.getState());
    openingPrestige = displayedPrestige;
    change = '';
    notice = '';
    view = 'planet';
    cargoPage = 0;
    window.nativePlanetServices.reset();
    priorFocus = document.activeElement;
    priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.hidden = false;
    render();
    timer = setInterval(refresh, 250);
    root.querySelector('.encounter-close')?.focus({preventScroll:true});
  }

  function close(focus = true) {
    if (root.hidden) return;
    window.nativePlanetServices.stopPreview();
    root.hidden = true;
    root.innerHTML = '';
    clearInterval(timer);
    timer = null;
    bridge = null;
    document.body.style.overflow = priorOverflow;
    if (focus) priorFocus?.focus?.({preventScroll:true});
  }

  document.addEventListener('keydown', event => {
    if (!root.hidden && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  }, true);
  window.addEventListener('resize',()=>{if(!root.hidden)render();});
  window.nativePlanetEncounter = {open, close, refresh, get active() {return !root.hidden;}};
})();
