/* Vexed Mirror frame 154 resourceHUD and weapon-hud.as, in their original
   600 x 450 coordinates. Artwork is extracted from the installed game's
   resourceIcon0/1/2 symbols and weapon sprite 576, frame 106. */
(() => {
  'use strict';
  const canvas = document.getElementById('game-hud');
  const ctx = canvas.getContext('2d');
  const colors = ['#bbcad7', '#e5c66f', '#91d4d1'];
  const keys = ['deuranium', 'antimatter', 'latinum'];
  const names = ['DEURANIUM', 'ANTIMATTER', 'LATINUM'];
  const images = [];
  const weaponIcons = new Map();
  let state = null;
  let fontReady = false;

  function image(file) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('HUD artwork unavailable: ' + file));
      im.src = 'assets/hud/' + file;
    });
  }
  function formatAmount(value) {
    value = Math.floor(Number(value));
    if (Number.isNaN(value)) return '0';
    if (Math.abs(value) >= 1000000000) return Math.round(value / 100000000) / 10 + 'B';
    if (Math.abs(value) >= 1000000) return Math.round(value / 100000) / 10 + 'M';
    return String(value);
  }
  function outline(width) {
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(width - 4, 0);
    ctx.quadraticCurveTo(width, 0, width, 4);
    ctx.lineTo(width, 32);
    ctx.quadraticCurveTo(width, 36, width - 4, 36);
    ctx.lineTo(4, 36);
    ctx.quadraticCurveTo(0, 36, 0, 32);
    ctx.lineTo(0, 4);
    ctx.quadraticCurveTo(0, 0, 4, 0);
    ctx.closePath();
  }
  function line(x1, y1, x2, y2, width, color, alpha) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function cell(width, color, edgeAlpha, topAlpha) {
    outline(width);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = .08;
    ctx.stroke();
    ctx.fillStyle = '#102637';
    ctx.globalAlpha = .68;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = .6;
    ctx.globalAlpha = edgeAlpha;
    ctx.stroke();
    ctx.globalAlpha = 1;
    line(5, 0, 19, 0, 1, color, topAlpha);
  }
  function text(value, x, baseline, size, color, align) {
    ctx.font = `700 ${size}px VexedHudArial`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, baseline);
  }
  function render() {
    if (!state || !fontReady || images.length !== 4) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const d = devicePixelRatio || 1;
    const width = Math.round(r.width * d), height = Math.round(r.height * d);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(canvas.width / 282, 0, 0, canvas.height / 43, 0, 0);
    ctx.clearRect(0, 0, 282, 43);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(0, 4);

    const weapons = state.weapons || [1, null, null];
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(i * 26, 0);
      const occupied = Number(weapons[i]) > 0;
      const color = '#91d4d1';
      cell(24, color, occupied ? .65 : .30, occupied ? .85 : .30);
      line(4, 12, 20, 12, .5, color, .12);
      text('W' + (i + 1), 12, 12, 6.5, occupied ? color : '#869692', 'center');
      if (occupied) {
        // Original hudWeaponIcon1: (330,27), scale 30%; sprite bounds
        // (-23.35,-26) to (25.85,28.35) before that scale.
        const weaponId = Number(weapons[i]);
        const icon = weaponIcons.get(weaponId);
        if (icon?.complete && icon.naturalWidth) ctx.drawImage(icon, 4, 15, 16, 17);
        else if (weaponId === 1) ctx.drawImage(images[3], 4.995, 15.2, 14.76, 16.305);
        line(5, 33, 19, 33, 1, color, .18);
        line(5, 33, 19, 33, 1, color, .85);
      } else line(9, 24, 15, 24, .7, color, .25);
      ctx.restore();
    }

    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(80 + i * 66, 0);
      cell(64, colors[i], .44, .85);
      line(5, 12, 59, 12, .5, colors[i], .12);
      // resourceIcon origin is its center; installed symbol bounds are
      // (-9,-9) to (8.95,8.95). Source attaches it at (12,23).
      ctx.drawImage(images[i], 3, 14, 17.95, 17.95);
      text(names[i], 60, 12, 6.5, colors[i], 'right');
      const amount = state.devMode ? '∞' : formatAmount(state[keys[i]]);
      let size = 11;
      ctx.font = `700 ${size}px VexedHudArial`;
      while (ctx.measureText(amount).width > 35 && size > 8) {
        size--;
        ctx.font = `700 ${size}px VexedHudArial`;
      }
      text(amount, 60, 29, size, colors[i], 'right');
      ctx.restore();
    }
    ctx.restore();
  }

  const font = new FontFace('VexedHudArial', 'url(assets/hud/Arial-bold.ttf)', {weight: '700'});
  const ready = Promise.all([
    font.load().then(face => { document.fonts.add(face); fontReady = true; }),
    Promise.all(['resourceIcon0.svg', 'resourceIcon1.svg', 'resourceIcon2.svg', 'weapon1.svg'].map(image))
      .then(loaded => images.push(...loaded))
  ]).then(render);
  window.vexedHud = {
    ready,
    update(value) {
      state = value;
      for (const id of value.weapons || []) if (Number(id) > 0 && !weaponIcons.has(Number(id))) {
        const icon = new Image();
        icon.onload = render;
        icon.src = '../flashtrek-broken-mirror/showcase-assets/weapon-icon-remastered-' + Number(id) + '.png';
        weaponIcons.set(Number(id), icon);
      }
      const weaponNames = (value.weapons || []).map((id, i) => 'Weapon ' + (i + 1) + ': ' + (window.VexedMirrorWeapons?.find(weapon => weapon.id === Number(id))?.name || 'Empty'));
      canvas.setAttribute('aria-label', [...weaponNames, ...keys.map((key, i) => names[i] + ': ' + (value.devMode ? 'unlimited' : formatAmount(value[key])))].join(', '));
      render();
    }
  };
  new ResizeObserver(render).observe(canvas);
})();
