/* Adapted from Downloads/FlashTrek Rebirth/flashtrek.html:
 * beginPlayerTravelToPlanet, drawShipAtWorld, drawWarpFx,
 * startSimpleWarpIn and the warp-in interpolation in step().
 * Rebirth world distances use its default 0.625 zoom in this flight view.
 */
(() => {
  'use strict';
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
  const zoom = .625;
  const departureMs = 650, arrivalMs = 700;
  function departure(elapsedMs, angle) {
    const t = clamp(elapsedMs / departureMs);
    const fade = 1 - clamp((t - .45) / .55);
    const squeezeT = clamp((t - .15) / .70);
    const e = squeezeT * squeezeT;
    const xScale = Math.max(.02, 1 - e);
    const distance = 4200 * zoom * Math.min(elapsedMs, departureMs) / 1000;
    const ringT = clamp(t / .6);
    return {kind:'departure', angle, speed:4200*zoom, shipX:300 + Math.sin(angle)*distance,
      shipY:225 - Math.cos(angle)*distance, cameraX:0, cameraY:0,
      alpha:fade, squeezeX:xScale,
      ring:t < .6 ? {x:300, y:225, scale:.8 + ringT*.5, alpha:.6 + ringT*.4} : null};
  }
  function arrival(elapsedMs, angle) {
    const t0 = clamp(elapsedMs / arrivalMs);
    const t = t0 * t0 * (3 - 2 * t0);
    const fade = clamp(t0 / .35);
    const squeeze = .10 + .90 * fade;
    const distance = 2600 * zoom * (1 - t);
    return {kind:'arrival', angle, speed:0, shipX:300, shipY:225,
      cameraX:-Math.sin(angle)*distance, cameraY:Math.cos(angle)*distance,
      alpha:fade, squeezeX:squeeze, ring:null};
  }
  // The player animates the camera on arrival. An observer sees that same
  // movement on the arriving ship while their own camera stays in place.
  function worldEffect(kind, elapsedMs, angle, x, y) {
    const effect = kind === 'departure' ? departure(elapsedMs, angle) : arrival(elapsedMs, angle);
    return {...effect,
      shipX:x + (kind === 'departure' ? effect.shipX - 300 : effect.cameraX),
      shipY:y + (kind === 'departure' ? effect.shipY - 225 : effect.cameraY),
      cameraX:0, cameraY:0,
      ring:effect.ring ? {...effect.ring,x,y} : null};
  }
  window.vexedRebirthWarp = {departure, arrival, worldEffect, departureMs, arrivalMs, arrivalSpeed:220*zoom};
})();
