/* Original Rebirth explosion samples; honor the existing sound button. */
(() => {
  const active = new Set();
  let lastPlayed = -Infinity;
  const names = new Set(['explodesmall', 'explode', 'explodelarge', 'shieldhit']);
  window.vexRebirthExplosionSound = (name, volume) => {
    if (!names.has(name) || !audible) return;
    const now = performance.now();
    if (now - lastPlayed < 20) return;
    lastPlayed = now;
    if (active.size >= 6) { const oldest = active.values().next().value; oldest.pause(); active.delete(oldest); }
    const audio = new Audio(`${name === 'shieldhit' ? '../flashtrek-broken-mirror/showcase-assets' : '../flashtrek-broken-mirror/rebirth-sounds'}/${name}.mp3`);
    audio.volume = Math.max(0, Math.min(1, (Number(volume) || 0) * 0.15 * 0.35));
    active.add(audio);
    const remove = () => active.delete(audio);
    audio.addEventListener('ended', remove, { once: true });
    audio.addEventListener('error', remove, { once: true });
    audio.play().catch(remove);
  };
  window.vexRebirthSoundMute = muted => {
    if (muted) { for (const audio of active) audio.pause(); active.clear(); }
  };
  new MutationObserver(() => {
    const frame = Number(game.dataset.frame);
    if (frame !== 154 && (frame < 157 || frame > 182)) window.vexRebirthSoundMute(true);
  }).observe(game, { attributes: true, attributeFilter: ['data-frame'] });
})();

