/* Browser controls over the original Flash commpanel art and extracted world records. */
(() => {
  'use strict';
  const stage = document.getElementById('game');
  const world = window.VexedMirrorWorld;
  const root = document.createElement('section');
  root.id = 'planet-comm';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Planet communications');
  stage.appendChild(root);
  let session = null;
  let lastFocus = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function close(restoreFocus = true) {
    if (root.hidden) return;
    root.hidden = true;
    root.innerHTML = '';
    session = null;
    if (restoreFocus) lastFocus?.focus?.({preventScroll:true});
  }

  function selectOffer(id) {
    if (!session) return;
    const item = window.nativeShipDefinitions.get(id);
    const detail = root.querySelector('.comm-detail');
    if (!item?.name) return;
    detail.innerHTML = `<strong>${escape(item.name)}</strong><small>${Number(item.price).toLocaleString()} bars of latinum · ${item.cargo} cargo</small><p>${escape(item.description)}</p>`;
  }

  function open({system, state, onTrade, onRepair}) {
    if (!system || !state) return;
    close(false);
    lastFocus = document.activeElement;
    session = {onTrade, onRepair};
    const id = system.id;
    const governmentId = Number(state.planetGovts?.[id] ?? system.governmentId);
    const government = world.governments.find(entry => entry.id === governmentId)?.name || system.government;
    const population = Number(state.planetPopulationCounts?.[id] ?? Number(state.planetPopulations?.[id] ?? system.populationBillions)*1e9);
    const strength = Number(state.planetStrengths?.[id] ?? system.strength);
    const prestige = Number(state.localPrestige?.[id] ?? 0);
    const offers = system.planetShopItemIds || [];
    root.innerHTML = `<div class="planet-comm-panel" role="document">
      <img class="comm-surface" src="assets/planet-surfaces/${Math.max(1,Math.min(9,Number(system.surfaceArtFrame)||1))}.png" alt="Surface of ${escape(system.name)}">
      <div class="comm-world"><strong>${escape(system.name)}</strong><span class="comm-government">${escape(government)}</span><p>${escape(system.description)}</p></div>
      <div class="comm-help">Select an item to inspect it · Trade opens the local exchange</div>
      <div class="comm-stats"><span>Population: ${population.toLocaleString()} residents</span><span>Strength: ${strength.toLocaleString()}</span><span>Local prestige: ${Math.floor(prestige)}%</span></div>
      <div class="comm-detail" aria-live="polite"><strong>Planet services</strong><p>Six local offers are shown at right. Select one for its details.</p></div>
      <button class="comm-action comm-exit" type="button" aria-label="Exit communications" title="Exit Comm"></button>
      <button class="comm-action comm-repair" type="button" aria-label="Repair ship" title="Repair Ship"></button>
      <button class="comm-action comm-sell" type="button" aria-label="Sell cargo" title="Sell"></button>
      <button class="comm-action comm-trade" type="button" aria-label="Trade" title="Trade"></button>
      <button class="comm-resource comm-resource-0" type="button" aria-label="Trade antimatter" title="Antimatter"></button>
      <button class="comm-resource comm-resource-1" type="button" aria-label="Trade deuranium" title="Deuranium"></button>
      ${Array.from({length:6}, (_,index) => {
        const definition=window.nativeShipDefinitions.get(Number(offers[index])),item=definition.name?definition:null;
        return `<button class="comm-offer comm-offer-${index}${item?'':' empty'}" type="button" data-offer="${item?.id || ''}" ${item?'':'disabled'} aria-label="${item?'Inspect '+escape(item.name):'Empty shop slot'}" title="${item?escape(item.name):'Empty'}"></button>`;
      }).join('')}
    </div>`;
    root.hidden = false;
    root.querySelector('.comm-exit').onclick = () => close();
    root.querySelector('.comm-repair').onclick = () => {close(false);onRepair?.();};
    for (const selector of ['.comm-sell','.comm-trade','.comm-resource']) {
      root.querySelectorAll(selector).forEach(button => button.onclick = () => onTrade?.());
    }
    root.querySelectorAll('[data-offer]').forEach(button => button.onclick = () => selectOffer(Number(button.dataset.offer)));
    root.querySelector('.comm-exit').focus({preventScroll:true});
  }

  root.addEventListener('click', event => {if (event.target === root) close();});
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !root.hidden) {event.preventDefault();event.stopImmediatePropagation();close();}
  }, true);
  window.nativePlanetComm = {open, close, get active() {return !root.hidden;}};
})();
