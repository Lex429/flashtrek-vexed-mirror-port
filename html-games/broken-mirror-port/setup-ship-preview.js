/* Draw intact ships exactly as the showcase: aligned art and its native lamps. */
(() => {
  'use strict';
  const base = '../flashtrek-broken-mirror/showcase-assets/';
  const assets = new Map();
  let catalog;

  function load(type) {
    if (assets.has(type)) return assets.get(type);
    catalog ||= fetch(base + 'catalog.json').then(response => {
      if (!response.ok) throw Error('Showcase catalog unavailable');
      return response.json();
    }).catch(error => {catalog = null; throw error;});
    const pending = catalog.then(async data => {
      const entry = data.ships.find(ship => ship.id === type);
      const profile = window.starterShips.get(type);
      if (!entry || !profile) throw Error('Showcase ship unavailable');
      const image = new Image();
      image.src = base + entry.frames[0];
      await image.decode();
      const art = await (profile.alignAsync?.(image, 0) || profile.align(image, 0));
      const bounds = entry.bounds;
      const ratio = profile.displayRatio ?? (bounds[1] - bounds[0]) / (bounds[3] - bounds[2]);
      return {type, name: entry.name, art, profile, ratio};
    }).catch(error => {assets.delete(type); throw error;});
    // Retain at most the eight starting hulls, rather than a second fleet cache.
    if (assets.size >= 8) assets.delete(assets.keys().next().value);
    assets.set(type, pending);
    return pending;
  }

  function draw(context, asset, layout, time, options = {}) {
    context.save();
    context.translate(layout.x, layout.y);
    context.drawImage(asset.art, -layout.w / 2, -layout.h / 2, layout.w, layout.h);
    context.restore();
    // The showcase uses gain/bloom 1, original hull colors and continuous pulses.
    // Its direct lamp path avoids the flight cache's quantized pulse samples.
    asset.profile.effects.draw(context, layout, 0, 0, time, {
      lights: true, damage: true, anchors: false, impact: null, toolDemo: false,
      cacheLamps: false, ...options
    });
  }

  function attach(figure, ship) {
    const canvas = figure.querySelector('canvas');
    const fallback = figure.querySelector('img');
    const art = figure.querySelector('.setup-ship-art');
    const context = canvas.getContext('2d');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let asset, frame = 0, disposed = false;

    canvas.dataset.ship = String(ship.id);
    canvas.setAttribute('aria-label', `${ship.name} with animated showcase lighting`);

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    function schedule() {
      if (!disposed && asset && !frame && !document.hidden) frame = requestAnimationFrame(paint);
    }

    function paint(now) {
      frame = 0;
      if (disposed || !figure.isConnected || figure.closest('[hidden]') || document.hidden) return;
      const bounds = art.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      // Leave room for the real lamp bloom around every hull silhouette.
      const shipWidth = Math.min(width * .82, height * .84 * asset.ratio);
      window.nativeSetupShipPreview.draw(context, asset, {
        x: width / 2, y: height / 2, w: shipWidth, h: shipWidth / asset.ratio
      }, reducedMotion.matches ? 0 : now);
      canvas.hidden = false;
      fallback.hidden = true;
      canvas.classList.add('ready');
      if (!reducedMotion.matches) schedule();
    }

    function visibilityChanged() {
      if (document.hidden) stop();
      else schedule();
    }

    function motionChanged() {
      stop();
      schedule();
    }

    const resize = new ResizeObserver(schedule);
    resize.observe(art);
    document.addEventListener('visibilitychange', visibilityChanged);
    reducedMotion.addEventListener('change', motionChanged);
    load(ship.id).then(loaded => {
      if (disposed) return;
      asset = loaded;
      schedule();
    }).catch(() => {
      // Keep the named static hull visible if its lighting artwork cannot load.
    });

    return () => {
      disposed = true;
      stop();
      resize.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
      reducedMotion.removeEventListener('change', motionChanged);
    };
  }

  window.nativeSetupShipPreview = {attach, load, draw};
})();
