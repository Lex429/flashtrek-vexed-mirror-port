/* Setup uses the same aligned showcase artwork and lamp shaders as flight. */
(() => {
  'use strict';

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
      const scale = Math.min(width * .82 / asset.width, height * .84 / asset.height);
      window.vexedFlightAssets.drawShip(context, asset, width / 2, height / 2,
        asset.width * scale, 0, reducedMotion.matches ? 0 : now, {
          height: asset.height * scale,
          lights: true,
          damage: false,
          lightGain: 2.8,
          lightBloom: 2.5,
          light: {x: width * .12, y: height * .05, color: 0xd6e8ff}
        });
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
    window.vexedFlightAssets.loadShip(ship.id, ship.hull).then(loaded => {
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

  window.nativeSetupShipPreview = Object.freeze({attach});
})();
