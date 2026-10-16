const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const showcase = path.join(root, 'html-games/flashtrek-broken-mirror');
const port = path.join(root, 'html-games/broken-mirror-port');
const combat = JSON.parse(fs.readFileSync(path.join(showcase, 'showcase-assets/combat-data.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(showcase, 'showcase-assets/catalog.json'), 'utf8'));

async function loadCombatRenderer() {
  const window = { nativeWeaponRules: {} };
  const sandbox = vm.createContext({
    window, console, performance: { now: () => 1000 }, document: { hidden: false },
    fetch: async url => ({ ok: true, json: async () => url.includes('combat-data.json') ? combat : catalog }),
  });
  vm.runInContext(fs.readFileSync(path.join(showcase, 'weapon-effects.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(port, 'combat-shots.js'), 'utf8'), sandbox);
  await window.nativeCombatShots.ready;
  return window;
}

// Record the effective canvas output: transformed geometry, color, opacity,
// widths and gradient stops. This exercises the real two render paths, without
// depending on a particular browser's antialiasing or a screenshot's backdrop.
function recordingContext({ pixelRatio = 1, scale = 1, rotation = 0 } = {}) {
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  let matrix = { a: pixelRatio * scale * Math.cos(rotation), b: pixelRatio * scale * Math.sin(rotation), c: -pixelRatio * scale * Math.sin(rotation), d: pixelRatio * scale * Math.cos(rotation), e: 0, f: 0 };
  const stack = [], output = [], stateKeys = ['globalAlpha', 'globalCompositeOperation', 'shadowBlur', 'shadowColor', 'filter', 'lineCap', 'lineJoin', 'lineWidth', 'strokeStyle', 'fillStyle'];
  let currentPath = [];
  const ctx = {
    canvas: { width: 900 * pixelRatio, getBoundingClientRect: () => ({ width: 900, height: 540 }) },
    output, globalAlpha: 1, globalCompositeOperation: 'source-over', shadowBlur: 0,
    shadowColor: 'transparent', filter: 'none', lineCap: 'butt', lineJoin: 'miter', lineWidth: 1,
    strokeStyle: '#000', fillStyle: '#000',
    getTransform: () => ({ ...matrix }),
    setTransform(a, b, c, d, e, f) { matrix = { a, b, c, d, e, f }; },
    save() { stack.push({ matrix: { ...matrix }, properties: Object.fromEntries(stateKeys.map(key => [key, this[key]])) }); },
    restore() { const saved = stack.pop(); assert.ok(saved, 'canvas state is balanced'); matrix = saved.matrix; Object.assign(this, saved.properties); },
    translate(x, y) { matrix.e += matrix.a * x + matrix.c * y; matrix.f += matrix.b * x + matrix.d * y; },
    rotate(angle) {
      const { a, b, c, d } = matrix, cosine = Math.cos(angle), sine = Math.sin(angle);
      Object.assign(matrix, { a: a * cosine + c * sine, b: b * cosine + d * sine, c: c * cosine - a * sine, d: d * cosine - b * sine });
    },
    beginPath() { currentPath = []; },
    moveTo(x, y) { currentPath.push(['move', ...point(x, y)]); },
    lineTo(x, y) { currentPath.push(['line', ...point(x, y)]); },
    arc(x, y, radius, start, end) { currentPath.push(['arc', ...point(x, y), radius * unit(), start + turn(), end + turn()]); },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      return { radial: [...point(x0, y0), r0 * unit(), ...point(x1, y1), r1 * unit()], stops: [], addColorStop(at, color) { this.stops.push([at, color]); } };
    },
    stroke() { output.push({ operation: 'stroke', path: currentPath, color: this.strokeStyle, width: this.lineWidth * unit(), ...properties(this) }); },
    fill() { output.push({ operation: 'fill', path: currentPath, color: this.fillStyle, ...properties(this) }); },
  };
  const point = (x, y) => [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f];
  const unit = () => Math.hypot(matrix.a, matrix.b);
  const turn = () => Math.atan2(matrix.b, matrix.a);
  const properties = target => ({ alpha: target.globalAlpha, blend: target.globalCompositeOperation, shadowBlur: target.shadowBlur, shadowColor: target.shadowColor, filter: target.filter, lineCap: target.lineCap, lineJoin: target.lineJoin });
  const snapshot = () => ({ matrix: { ...matrix }, properties: Object.fromEntries(stateKeys.map(key => [key, ctx[key]])) });
  return { ctx, snapshot, identity };
}

const normalize = value => JSON.parse(JSON.stringify(value, (_, entry) => typeof entry === 'number' ? Math.round(entry * 1e8) / 1e8 : entry));

function expectedGeometry(shot, ship, state, { cx, cy, scale, rotation, elapsed }) {
  const cosine = Math.cos(rotation), sine = Math.sin(rotation);
  const screen = point => {
    const x = cx + point.x - ship.x, y = cy + point.y - ship.y;
    return { x: scale * (x * cosine - y * sine), y: scale * (x * sine + y * cosine) };
  };
  if (shot.projectile) {
    const current = screen(shot.projectile);
    return { zoom: 1, ...current, angle: Math.atan2(shot.projectile.vy, shot.projectile.vx) + rotation };
  }
  const muzzle = shot.kind === 'beam' ? { x: ship.x + Math.cos(state.angle) * shot.muzzleOffset, y: ship.y + Math.sin(state.angle) * shot.muzzleOffset } : shot.from;
  const from = screen(muzzle), to = screen(shot.target), progress = Math.min(1, elapsed / shot.duration);
  return { zoom: 1, x1: from.x, y1: from.y, x2: to.x, y2: to.y, x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress, angle: Math.atan2(to.y - from.y, to.x - from.x) };
}

test('the game and showcase load the same live weapon renderer', () => {
  const gameHtml = fs.readFileSync(path.join(port, 'index.html'), 'utf8');
  const showcaseHtml = fs.readFileSync(path.join(showcase, 'damage-showcase.html'), 'utf8');
  const loaded = (html, directory) => [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/g)].map(match => path.resolve(directory, match[1].split('?')[0]));
  const sharedFile = path.join(showcase, 'weapon-effects.js');
  assert.ok(loaded(gameHtml, port).includes(sharedFile));
  assert.ok(loaded(showcaseHtml, showcase).includes(sharedFile));
  assert.ok(!loaded(gameHtml, port).includes(path.join(port, 'weapon-effects.js')), 'the old duplicate renderer cannot replace the showcase renderer');
});

test('all equipped weapon IDs select their actual showcase style and units', async () => {
  const window = await loadCombatRenderer();
  for (const [kind, styles] of Object.entries(combat.weapons)) {
    for (const style of styles) {
      const actual = window.nativeCombatShots.weaponVisual(style);
      assert.equal(actual.kind, kind, style.name);
      assert.equal(actual.units, catalog.units, style.name);
      assert.deepEqual(normalize(actual.style), { ...style, kind });
    }
  }
});

for (const projectile of [false, true]) {
  test(`${projectile ? 'moving projectiles' : 'beam and timed shots'} match showcase draw output across display scales`, async () => {
    const window = await loadCombatRenderer();
    const state = { angle: .23 }, ship = { x: 11, y: -27 }, target = { x: 260, y: 44 };
    for (const [kind, styles] of Object.entries(combat.weapons)) {
      if (projectile && kind === 'beam') continue;
      for (const style of styles) {
        const visual = window.nativeCombatShots.weaponVisual(style);
        for (const settings of [{ pixelRatio: 1, scale: 1, rotation: 0 }, { pixelRatio: 2, scale: .65, rotation: 0 }, { pixelRatio: 1.5, scale: 1.8, rotation: .37 }]) {
          const shot = window.nativeCombatShots.create({ state, ship, shipHeight: 60, target, ...visual, spin: .35, spinSpeed: 6.25, now: 1000 });
          const elapsed = 95;
          if (projectile) shot.projectile = { alive: true, x: 180, y: 55, vx: 150, vy: -50, age: elapsed / 1000 };
          const actual = recordingContext(settings), expected = recordingContext({ pixelRatio: settings.pixelRatio });
          // Ensure the surrounding scene's lighting/compositing does not tint weapons.
          Object.assign(actual.ctx, { globalAlpha: .13, globalCompositeOperation: 'lighter', shadowBlur: 18, shadowColor: '#aabbcc', filter: 'blur(2px)', lineCap: 'round', lineJoin: 'round' });
          const before = actual.snapshot();
          assert.equal(window.nativeCombatShots.paint(actual.ctx, shot, { state, ship, cx: 300, cy: 225, zoom: settings.scale, now: 1000 + elapsed }), true);
          const geometry = expectedGeometry(shot, ship, state, { cx: 300, cy: 225, ...settings, elapsed });
          window.paintShowcaseWeaponShot(expected.ctx, { ...shot, spin: shot.spin + settings.rotation }, geometry, elapsed);
          assert.ok(actual.ctx.output.length > 0, `${style.name} is actually drawn`);
          assert.deepEqual(normalize(actual.ctx.output), normalize(expected.ctx.output), `${style.name}, projectile=${projectile}, ${JSON.stringify(settings)}`);
          assert.deepEqual(actual.snapshot(), before, 'weapon drawing restores the surrounding canvas state');
        }
      }
    }
  });
}

test('torpedoes preserve the showcase spin speed and appearance over time', async () => {
  const window = await loadCombatRenderer(), style = combat.weapons.torpedo.find(item => item.id === 15);
  const state = { angle: 0 }, ship = { x: 0, y: 0 };
  const shot = window.nativeCombatShots.create({ state, ship, shipHeight: 40, target: { x: 200, y: 0 }, ...window.nativeCombatShots.weaponVisual(style), spin: .4, spinSpeed: 8, now: 1000 });
  const first = recordingContext(), second = recordingContext();
  shot.projectile = { alive: true, x: 130, y: 80, vx: 150, vy: 0, age: 0 };
  window.nativeCombatShots.paint(first.ctx, shot, { state, ship, cx: 300, cy: 225, zoom: 1, now: 1000 });
  shot.projectile.age = .2;
  window.nativeCombatShots.paint(second.ctx, shot, { state, ship, cx: 300, cy: 225, zoom: 1, now: 1200 });
  assert.notDeepEqual(normalize(first.ctx.output[1].path), normalize(second.ctx.output[1].path), 'the colored star rotates as time passes');
  assert.deepEqual(normalize(first.ctx.output[0]), normalize(second.ctx.output[0]), 'the aura retains its color, radius and opacity');
  assert.equal(shot.units, catalog.units);
  assert.equal(shot.spinSpeed, 8);
});
