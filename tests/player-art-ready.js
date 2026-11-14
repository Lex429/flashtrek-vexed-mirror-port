/* Functional checks need the active player's plate, not four unrelated hulls'
   optional destruction data. Timing benchmarks keep their own warm-up policy. */
window.__testPlayerArtReady = () => {
  const type = window.nativeNpcDev?.getState()?.shipType;
  if (type == null) return false;
  window.nativeShipEffects.request(type, 'player', {stage: 0, prefetch: true});
  return window.nativeShipEffects.stageReady(type, 0);
};
