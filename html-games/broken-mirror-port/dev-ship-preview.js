/* Live Dev Tools fleet preview, sharing the shipyard and flight renderer. */
(() => {
  'use strict';

  function attach(dialog, ships) {
    const canvas = dialog.querySelector('[data-dev-preview]');
    const placeholder = dialog.querySelector('[data-dev-placeholder]');
    const selector = dialog.querySelector('[data-dev-ship]');
    const name = dialog.querySelector('[data-dev-preview-name]');
    const stats = dialog.querySelector('[data-dev-preview-stats]');
    const weapons = dialog.querySelector('[data-dev-preview-weapons]');
    const context = canvas.getContext('2d');
    let generation = 0, frame = 0;

    function selectShip() {
      const ship = ships.find(entry => entry.id === Number(selector.value));
      generation++;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      canvas.classList.remove('ready');
      if (!ship) return;
      name.textContent = ship.name;
      canvas.setAttribute('aria-label', `Animated, illuminated preview of ${ship.name}`);
      const frames=window.nativeShipDefinitions.get(ship.id).artwork.frames;
      placeholder.src = '../flashtrek-broken-mirror/showcase-assets/' +
        (Array.isArray(frames)?frames[0]:`ship-${ship.id}-0.png`);
      stats.replaceChildren();
      for (const [label, value] of [['Hull', ship.hull], ['Shields', ship.shields], ['Speed', ship.speedOrOtherStationValue], ['Cargo', `${ship.cargo} t`]]) {
        const cell = document.createElement('div');
        const title = document.createElement('span');
        const number = document.createElement('strong');
        title.textContent = label;
        number.textContent = value;
        cell.append(title, number);
        stats.append(cell);
      }
      const names = ship.defaultWeapons.filter(Boolean).map(id => window.VexedMirrorWeapons?.find(weapon => weapon.id === id)?.name || `Weapon ${id}`);
      weapons.textContent = names.length ? names.join(' · ') : 'Unarmed';
      const selected = generation;
      window.vexedFlightAssets.loadShip(ship.id, ship.hull).then(asset => {
        if (selected !== generation || !canvas.isConnected || dialog.parentElement.hidden) return;
        function paint(now) {
          if (selected !== generation || !canvas.isConnected || dialog.parentElement.hidden) return;
          const bounds = canvas.getBoundingClientRect();
          const pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
          const width = Math.max(1, Math.round(bounds.width * pixelRatio));
          const height = Math.max(1, Math.round(bounds.height * pixelRatio));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          context.clearRect(0, 0, width, height);
          const scale = Math.min(width * .72 / asset.width, height * .74 / asset.height);
          window.vexedFlightAssets.drawShip(context, asset, width / 2, height * .49,
            asset.width * scale, 0, now, {height: asset.height * scale, damage: false});
          canvas.classList.add('ready');
          frame = requestAnimationFrame(paint);
        }
        frame = requestAnimationFrame(paint);
      }).catch(() => {if (selected === generation) canvas.setAttribute('aria-label', `Preview unavailable for ${ship.name}`);});
    }

    selector.addEventListener('change', selectShip);
    selectShip();
  }

  window.nativeDevShipPreview = {attach};
})();
