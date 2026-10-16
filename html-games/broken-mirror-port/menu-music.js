/* Play the installed menu song only while the main menu is visible. */
(() => {
  'use strict';
  const menu = document.getElementById('menu-art');
  const music = document.getElementById('menu-music');
  const toggle = document.getElementById('menu-music-toggle');
  const level = .65;
  let enabled = true, blocked = false, fade = 0;

  music.volume = 0;
  function onMenu() { return !menu.hidden && !document.hidden && !document.body.classList.contains('playing'); }
  function label() {
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = !enabled ? 'Music off' : blocked ? 'Play music' : 'Music on';
  }
  function ramp(target, duration, done) {
    cancelAnimationFrame(fade);
    const from = music.volume, began = performance.now();
    function frame(now) {
      const t = Math.max(0, Math.min(1, (now - began) / duration));
      music.volume = from + (target - from) * t;
      if (t < 1) fade = requestAnimationFrame(frame);
      else { fade = 0; done?.(); }
    }
    fade = requestAnimationFrame(frame);
  }
  function stop(reset = false) {
    if (music.paused) { music.volume = 0; if (reset) music.currentTime = 0; return; }
    ramp(0, 300, () => { music.pause(); if (reset) music.currentTime = 0; });
  }
  function start() {
    if (!enabled || !onMenu()) return;
    const play = music.play();
    if (!play) return;
    play.then(() => {
      if (!enabled || !onMenu()) { stop(!onMenu()); return; }
      blocked = false; label(); ramp(level, 550);
    }).catch(() => { blocked = true; label(); });
  }
  function sync() {
    if (enabled && onMenu()) start();
    else stop(!onMenu());
    label();
  }
  toggle.addEventListener('click', () => {
    if (blocked && enabled) blocked = false;
    else enabled = !enabled;
    sync();
  });
  new MutationObserver(sync).observe(menu, {attributes:true, attributeFilter:['hidden']});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(fade); music.pause(); music.volume = 0; }
    else sync();
  });
  for (const event of ['pointerdown', 'keydown']) {
    document.addEventListener(event, e => {
      if (toggle.contains(e.target)) return;
      if (blocked && enabled && onMenu()) start();
    }, {capture:true});
  }
  label();
})();
