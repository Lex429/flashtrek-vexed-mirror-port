/* Focused planet encounter shown when the player clicks a world in flight. */
(() => {
  'use strict';
  const world = window.VexedMirrorWorld;
  const cargoIcons=['assets/ui/mineral.svg','assets/ui/metal.svg','assets/ui/components.svg','assets/ui/computers.svg','assets/ui/fuel.svg','assets/ui/food.svg','assets/ui/medicine.svg','startup/resources/deuranium.png','assets/ui/hull-sections.svg'];
  const latinumIcon = 'startup/resources/latinum.png';
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
  let cargoView = 'local';
  let cargoDocuments = false;
  let cargoNoticeKind = 'info';
  let paymentFrame = null;
  let paymentTimer = null;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const signed = value => `${value > 0 ? '+' : ''}${Math.floor(value)}`;
  const currentPlace = state => window.nativeSystemCatalog ? window.nativeSystemCatalog.current(state) : state.system === 1
    ? window.nativeSystemHub.sol.find(node => node.id === Number(state.localBody ?? 3))
    : {id:0, name:world.systems.find(system => system.id === state.system)?.name || 'Unknown world', port:Number(state.planetPopulations?.[state.system]) > 0};
  const planetImage = (state, place) => place.art || (state.system === 1
    ? `../flashtrek-broken-mirror/art-review/sol-planets/${String(place.id).padStart(2, '0')} - ${encodeURIComponent(place.name)}.png`
    : `assets/planets/planet-${world.systems.find(system => system.id === state.system)?.planetArtFrame || 1}.png`);
  const prestige = state => {
    const value = Number(state.localPrestige?.[state.system]);
    return Number.isFinite(value) ? Math.floor(value) : 0;
  };
  const population=(state,place)=>window.nativeSystemCatalog ? window.nativeSystemCatalog.population(state,place) : state.system===1?window.nativeSystemHub.population(state,place.id):Math.max(0,Math.round(Number(state.planetPopulationCounts?.[state.system]??Number(state.planetPopulations?.[state.system])*1e9))||0);
  const standing = value => value >= 100 ? 'Allied' : value < 0 ? 'Hostile' : 'Neutral';

  const cargoNumber = value => Math.max(0, Number(value) || 0).toLocaleString();
  const cargoMoney = amount => `<strong class="encounter-cargo-payment"><img src="${latinumIcon}" alt="Latinum">${cargoNumber(amount)}</strong>`;
  const cargoTerms = (distance,rate) => `<div class="encounter-cargo-terms"><span data-cargo-distance="${distance}">${cargoNumber(Math.round(distance))} units</span><span>${cargoMoney(rate)} / t</span></div>`;
  const clearanceLine = clearance => `<div class="encounter-cargo-clearance" data-clearance="${clearance.status}"><span>${escape(clearance.label)}${clearance.required ? ' · ' + escape(clearance.faction) : ''}</span>${!clearance.allowed && clearance.fee > 0 ? cargoMoney(clearance.fee) : ''}</div>`;

  function cargoDocumentsContents(state) {
    const documents = window.nativeCargoPermits.documents(state);
    return `<section class="encounter-cargo-documents" aria-label="Freight documents"><h3>Ship records &middot; ${documents.length} ${documents.length === 1 ? 'document' : 'documents'}</h3>
      ${documents.length ? documents.slice().reverse().map(document => {
        const destination = window.nativePlayerContracts.address({to:document.toPort,toSystem:document.toSystem});
        return `<article class="encounter-cargo-document" data-permit-record="${escape(document.id)}" data-permit-status="${escape(document.status)}">
          <div class="encounter-document-top"><span>${escape(document.reference)}</span><strong>${escape(window.nativeCargoPermits.recordStatus(state,document))}</strong></div>
          <h4>${escape(document.title)}</h4><p>${escape(document.issuer)}</p>
          <dl><div><dt>Registered holder</dt><dd>${escape(document.holder?.captain)}<br>${escape(document.holder?.ship)}</dd></div>
            <div><dt>Authorized destination</dt><dd>${escape(destination.name)}<br>${escape(destination.systemName)} system</dd></div>
            <div><dt>Authorized cargo</dt><dd>${escape(window.nativeSolEconomy.goods[document.good] || 'Cargo')}${document.tons > 0 ? ' · ' + cargoNumber(document.tons) + ' t' : ''}</dd></div>
            <div><dt>Issue record</dt><dd>Day ${cargoNumber(document.issuedDay)} &middot; ${document.source === 'employer' ? 'Employer supplied' : cargoMoney(document.fee)}</dd></div></dl>
          <div class="encounter-document-seal">${document.status === 'valid' ? 'ONE DELIVERY · CARGO ACCESS' : document.status === 'assigned' ? 'AUTHORIZED FOR THE LOADED SHIPMENT' : 'DELIVERY COMPLETE · RECORD RETAINED'}</div>
        </article>`;
      }).join('') : '<div class="encounter-cargo-empty"><strong>No permits aboard</strong><p>Allied clearance is automatic. Required permits can be bought from the contract list.</p></div>'}
    </section>`;
  }

  function clearCargoPayment() {
    cancelAnimationFrame(paymentFrame);clearTimeout(paymentTimer);
    paymentFrame = paymentTimer = null;
    root.querySelector('.encounter-cargo-paid')?.remove();
  }

  function showCargoPayment(amount, destination) {
    const controls = root.querySelector('.encounter-cargo-controls');
    if (!controls || !(amount > 0)) return;
    clearCargoPayment();
    const receipt = document.createElement('div');
    receipt.className = 'encounter-cargo-paid';
    receipt.setAttribute('aria-hidden', 'true');
    receipt.innerHTML = `<div class="encounter-paid-top"><span>Cargo delivered &middot; ${escape(destination)}</span><b>PAID</b></div>
      <div class="encounter-paid-credit"><img class="encounter-paid-latinum" src="${latinumIcon}" alt="">
        <div><strong data-payment-amount="${amount}">+0</strong><small>LATINUM RECEIVED</small></div></div>
      <div class="encounter-paid-track"><i></i></div>`;
    controls.appendChild(receipt);
    const label = receipt.querySelector('[data-payment-amount]');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) label.textContent = `+${cargoNumber(amount)}`;
    else {
      const started = performance.now();
      const count = now => {
        const progress = Math.min(1, (now - started) / 620);
        label.textContent = `+${cargoNumber(Math.round(amount * (1 - (1 - progress) ** 3)))}`;
        paymentFrame = progress < 1 ? requestAnimationFrame(count) : null;
      };
      paymentFrame = requestAnimationFrame(count);
    }
    paymentTimer = setTimeout(clearCargoPayment, 2200);
    window.nativeGameSounds?.payment(bridge.getState());
  }

  function cargoContents(state, place) {
    const interstellar = cargoView === 'interstellar';
    const jobs = Array.isArray(state.localContracts) ? state.localContracts : [];
    const destinationFor = (to, system = 1) => window.nativePlayerContracts.address({to, toSystem:system});
    const freight = cargoDocuments ? null : interstellar ? {lanes:window.nativePlayerContracts.offers(state, state.system, place.id).map(offer => ({...offer, name:offer.nameOfGood}))}
      : state.system === 1 ? window.nativeSolEconomy.snapshot(state, place.id) : null;
    const capacity = Math.max(0, Number(window.nativeShipDefinitions.forEntity(state).cargo) || 0);
    const used = Math.max(0, Number(freight?.used ?? window.nativeShipEquipment?.cargoUsed(state)) || 0);
    const free = Math.max(0, capacity - used);
    const restriction = !place.port ? 'This world has no cargo loading facility.'
      : state.localCruise ? 'Finish your approach before loading a shipment.'
      : jobs.length >= 2 ? 'Two shipments are aboard. Deliver one before loading another.'
      : free < 1 ? 'Your cargo hold is full. Sell or deliver cargo to make space.' : '';
    const route = (good, name, destination) => `<div class="encounter-cargo-route">
      <span class="encounter-cargo-item"><img data-cargo-item-icon src="${cargoIcons[good] || cargoIcons[0]}" alt=""><strong>${escape(name)}</strong></span>
      <span class="encounter-cargo-arrow" aria-hidden="true">&rarr;</span>
      <span class="encounter-cargo-destination"><img data-cargo-planet-icon src="${escape(planetImage({system:destination.system ?? 1}, destination))}" alt=""><span><strong>${escape(destination.name)}</strong>${interstellar || destination.interstellar ? `<small>${escape(destination.systemName)} system</small>` : ''}</span></span>
    </div>`;
    const active = jobs.length ? `<section class="encounter-cargo-active" aria-labelledby="cargo-aboard-heading">
      <h3 id="cargo-aboard-heading">Aboard</h3>
      ${jobs.map(job => {
        const destination = {...destinationFor(job.to, job.toSystem ?? 1), interstellar:job.kind === 'interstellar'};
        const good = window.nativeSolEconomy.goods[Number(job.good)] || 'Sealed cargo';
        const deliverable = window.nativePlayerContracts.here(state, destination) && place.port && !state.localCruise && !state.arrivalApproach;
        return `<article class="encounter-cargo-row encounter-cargo-job">
          ${route(job.good, good, destination)}
          ${job.kind === 'interstellar' && Number.isFinite(job.distance) && job.rate > 0 ? cargoTerms(job.distance,job.rate) : ''}
          ${job.authorization?.reference ? `<div class="encounter-cargo-clearance" data-clearance="assigned"><span>Pass assigned &middot; ${escape(job.authorization.reference)}</span></div>` : ''}
          <div class="encounter-cargo-row-footer">
            <span>${cargoNumber(job.tons)} t &middot; ${cargoMoney(job.pay)}</span>
            ${deliverable ? `<button type="button" data-cargo-deliver="${job.id}">Deliver &amp; collect</button>`
              : `<small>Deliver at ${escape(destination.name)}</small>`}
          </div>
        </article>`;
      }).join('')}
    </section>` : '';
    return `<div class="encounter-cargo-controls">
      <div class="encounter-cargo-heading"><span>${cargoDocuments ? 'SHIP RECORDS' : interstellar ? 'QUADRANT SHIPPING' : 'PLANETARY SHIPPING'}</span><h2>${cargoDocuments ? 'Freight documents' : interstellar ? 'Interstellar Contracts' : 'Cargo at ' + escape(place.name)}</h2></div>
      <div class="encounter-cargo-tabs" role="group" aria-label="Cargo contract types">${[['local','Local'],['interstellar','Interstellar']].map(([id,label]) => `<button type="button" data-cargo-view="${id}" aria-pressed="${!cargoDocuments && cargoView === id}">${label}</button>`).join('')}<button type="button" class="encounter-cargo-documents-toggle" data-cargo-documents aria-pressed="${cargoDocuments}">Documents ${window.nativeCargoPermits.documents(state).length}</button></div>
      ${interstellar && !cargoDocuments ? `<p class="encounter-interstellar-origin">From ${escape(place.name)} &middot; ${escape(window.nativeSystemCatalog.name(state.system))}<span>Common ore: ${escape(window.nativePlayerContracts.commonOre(state.system))}</span></p>` : ''}
      <p class="encounter-cargo-summary"><span><strong>${cargoNumber(free)} t</strong> free hold</span><span>${jobs.length} / 2 shipments</span></p>
      ${restriction && !cargoDocuments ? `<p class="encounter-cargo-restriction">${escape(restriction)}</p>` : ''}
      <div class="encounter-cargo-body" tabindex="0" aria-label="${cargoDocuments ? 'Freight documents' : 'Cargo contracts'}">
        ${cargoDocuments ? cargoDocumentsContents(state) : `${active}
        <section class="encounter-cargo-offers" aria-labelledby="cargo-offers-heading">
          <h3 id="cargo-offers-heading">Available contracts</h3>
          ${freight?.lanes.length ? freight.lanes.map(lane => {
            const destination = destinationFor(lane.to, lane.toSystem ?? 1);
            const limit = Math.max(0, Math.floor(Number(lane.maxLoad) || 0));
            const clearance = lane.clearance || window.nativeCargoPermits.evaluate(state,{toSystem:lane.toSystem ?? 1,toPort:lane.to,good:lane.good});
            const enabled = !restriction && limit > 0 && clearance.allowed;
            const purchase = !clearance.allowed && clearance.fee > 0;
            const canBuy = !restriction && limit > 0 && Number(state.latinum) >= clearance.fee;
            return `<article class="encounter-cargo-row encounter-cargo-offer" data-cargo-destination="${lane.to}">
              ${route(lane.good, lane.name, destination)}
              ${interstellar ? cargoTerms(lane.distance,lane.rate) : ''}
              ${clearanceLine(clearance)}
              <div class="encounter-cargo-row-footer">
                <span>${cargoNumber(limit)} t &middot; ${cargoMoney(Math.round(limit * lane.rate))} <small>on delivery</small></span>
                ${purchase ? `<button type="button" data-cargo-permit="${lane.to}" data-cargo-system="${lane.toSystem ?? 1}" data-cargo-good="${lane.good}" data-cargo-max-tons="${limit}"
                  aria-label="Buy ${escape(clearance.faction)} permit for ${cargoNumber(clearance.fee)} latinum" ${canBuy ? '' : 'disabled'}>Buy permit</button>` :
                  `<button type="button" data-cargo-load="${lane.to}" data-cargo-system="${lane.toSystem ?? 1}" data-cargo-good="${lane.good}" data-cargo-max-tons="${limit}"
                  aria-label="Haul max ${escape(lane.name)} to ${escape(destination.name)}" ${enabled ? '' : 'disabled'}>Haul Max</button>`}
              </div>
              ${!restriction && !limit ? '<small class="encounter-cargo-reason">No cargo available to load.</small>' : purchase && !restriction && !canBuy ? `<small class="encounter-cargo-reason">Need ${cargoNumber(clearance.fee)} latinum for this permit.</small>` : ''}
            </article>`;
          }).join('') : '<div class="encounter-cargo-empty">No cargo contracts available at this port.</div>'}
        </section>`}
      </div>
      <p class="encounter-cargo-notice" data-tone="${cargoNoticeKind}" role="status" aria-live="polite" tabindex="-1">${escape(notice || (cargoDocuments ? 'Assigned passes cover the full delivery and are saved with your ship.' : 'Payment is collected when you deliver the cargo.'))}</p>
    </div>`;
  }

  function render() {
    if (root.hidden || !bridge) return;
    clearCargoPayment();
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
    root.querySelectorAll('[data-view-tab]').forEach(button => button.onclick = () => {view = button.dataset.viewTab; if (view === 'cargo') {cargoView = 'local'; cargoDocuments = false;} notice = ''; cargoNoticeKind = 'info'; render();});
    root.querySelectorAll('[data-cargo-view]').forEach(button => button.onclick = () => {
      cargoView = button.dataset.cargoView; cargoDocuments = false; notice = ''; cargoNoticeKind = 'info'; render();
      root.querySelector(`[data-cargo-view="${cargoView}"]`)?.focus({preventScroll:true});
    });
    root.querySelector('[data-cargo-documents]')?.addEventListener('click', () => {
      cargoDocuments = true; notice = ''; cargoNoticeKind = 'info'; render();
      root.querySelector('[data-cargo-documents]')?.focus({preventScroll:true});
    });
    root.querySelectorAll('[data-purchase]').forEach(button => button.onclick = () => {
      const result = bridge.trade(button.dataset.purchase, true, place.id);
      notice = result?.message || result?.error || '';
      render();
    });
    const cargoResult = result => {
      notice = result?.message || result?.error || 'The cargo request could not be completed.';
      cargoNoticeKind = result?.ok ? 'success' : 'error';
      render();root.querySelector('.encounter-cargo-notice')?.focus({preventScroll:true});
    };
    root.querySelectorAll('[data-cargo-permit]').forEach(button => button.onclick = () => {
      if (button.disabled) return;
      const result = bridge.permit(place.id,Number(button.dataset.cargoSystem),Number(button.dataset.cargoPermit),Number(button.dataset.cargoGood));
      window.nativeGameSounds?.ui(result?.ok ? 'confirm' : 'reject');cargoResult(result);
    });
    root.querySelectorAll('[data-cargo-load]').forEach(button => button.onclick = () => {
      if (button.disabled) return;
      const latest = bridge.getState(), here = currentPlace(latest), to = Number(button.dataset.cargoLoad);
      const interstellar = cargoView === 'interstellar', toSystem = Number(button.dataset.cargoSystem), good = Number(button.dataset.cargoGood);
      if ((!interstellar && latest.system !== 1) || here.id !== place.id) {
        cargoResult({error:'Your port has changed. Review the available contracts.'});return;
      }
      const lane = interstellar ? {...window.nativeNpcLives.playerFreightQuote(latest,{fromSystem:latest.system,fromPort:here.id,toSystem,toPort:to,good}),good}
        : window.nativeSolEconomy.snapshot(latest, here.id).lanes.find(lane => lane.to === to);
      if (!lane || lane.ok === false || Number(lane.good) !== good) {
        cargoResult({error:'Available cargo changed. Review this route before loading.'});return;
      }
      const amount = Math.max(0, Math.floor(Number(lane.maxLoad) || 0));
      if (!amount) {
        cargoResult({error:'No cargo fits in your hold or is available for this route.'});return;
      }
      cargoResult(interstellar ? bridge.interstellar(here.id, toSystem, to, good, amount) : bridge.contract(here.id, to, amount));
    });
    root.querySelectorAll('[data-cargo-deliver]').forEach(button => button.onclick = () => {
      if (button.disabled) return;
      button.disabled = true;
      const before = Number(bridge.getState().latinum) || 0;
      const result = bridge.deliver(Number(button.dataset.cargoDeliver));
      const received = Math.max(0, (Number(bridge.getState().latinum) || 0) - before);
      cargoResult(result);
      if (result?.ok) showCargoPayment(received, place.name);
      else window.nativeGameSounds?.ui('reject');
    });
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
    cargoView = 'local';
    cargoDocuments = false;
    cargoNoticeKind = 'info';
    window.nativePlanetServices.reset();
    priorFocus = document.activeElement;
    priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.hidden = false;
    window.nativeGameSounds?.ui('comms');
    render();
    timer = setInterval(refresh, 250);
    root.querySelector('.encounter-close')?.focus({preventScroll:true});
  }

  function close(focus = true) {
    if (root.hidden) return;
    clearCargoPayment();
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
  window.addEventListener('resize',()=>{if(!root.hidden&&view!=='cargo')render();});
  window.nativePlanetEncounter = {open, close, refresh, get active() {return !root.hidden;}};
})();
