const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function fixture() {
  let now = 1000;
  const contacts = [], bursts = [], explosions = [], draws = [];
  const window = {
    VexedMirrorWorld: { ships: [{ id: 6, hull: 100, shields: 80 }] },
    vexedSolFlight: { shipPosition: state => ({ x: state.x + 1000, y: state.y + 2000 }) },
    vexedFlightAssets: { size: () => 60, flightDimensions: () => ({ width: 48, height: 60 }) },
    showcaseWeaponAppearance: { units: .91976 },
    nativeCombatShots: {
      contact(ship, from, dimensions, shielded) {
        contacts.push({ ship: { ...ship }, from: { ...from }, dimensions: { ...dimensions }, shielded });
        const x = shielded ? -8 : -4;
        return { local: { x, y: 2 }, world: { x: ship.x + x, y: ship.y + 2 }, dx: 1, dy: 0 };
      },
    },
    showcaseHullBurst: {
      burst(particles, point, born, units, zoom, strength, sparksOnly) {
        bursts.push({ point: { ...point }, born, units, zoom, strength, sparksOnly });
        particles.push({ born, ttl: 500, x: point.x, y: point.y });
      },
      update(particle, dt) { particle.x += 10 * dt; },
      draw: (_, particle) => draws.push({ kind: 'hull', particle: { ...particle } }),
    },
    nativeEnvironmentalImpacts: { explode: (state, source, options) => explosions.push({ state, source: { ...source }, options: { ...options } }) },
    drawShowcaseShieldFlash: () => draws.push({ kind: 'shield-flash' }),
    drawShowcaseShieldSurface: (...args) => draws.push({ kind: 'shield-surface', options: args.at(-1) }),
  };
  const sandbox = vm.createContext({ window, performance: { now: () => now } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../html-games/broken-mirror-port/player-combat.js'), 'utf8'), sandbox);
  return { api: window.nativePlayerCombat, contacts, bursts, explosions, draws, setTime: time => { now = time; } };
}

const state = overrides => ({ system: 2, shipType: 6, x: 10, y: 20, angle: .3, speed: 25, hull: 100, shields: 80, localCruise: { x: 5, y: 6 }, arrivalApproach: { x: 9, y: 10 }, ...overrides });
const plain = value => JSON.parse(JSON.stringify(value));

test('blast and debris shield contacts only show impact art and preserve player state', () => {
  const { api, contacts, bursts, explosions } = fixture();
  const player = state(), before = structuredClone(player);
  api.visualImpact(player, { kind: 'explosion', from: { x: -30, y: 20 } });
  assert.deepEqual(player, before);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].shielded, true);
  assert.equal(api.snapshot().flash.kind, 'explosion');
  assert.equal(api.snapshot().flash.charge, 1);
  assert.equal(bursts.length, 0);
  assert.equal(explosions.length, 0);
});

test('an unshielded visual impact creates hull sparks without damage or engine effects', () => {
  const { api, contacts, bursts, explosions } = fixture();
  const player = state({ shields: 0, hull: 27 }), before = structuredClone(player);
  api.visualImpact(player, { kind: 'debris', from: { x: 0, y: 0 } });
  assert.deepEqual(player, before);
  assert.equal(contacts[0].shielded, false);
  assert.equal(api.snapshot().flash, null);
  assert.equal(api.snapshot().particles, 1);
  assert.equal(bursts[0].sparksOnly, true);
  assert.equal(explosions.length, 0);
});

test('a weapon hit consumes shields before hull and uses each matching contact surface', () => {
  const { api, contacts, bursts } = fixture();
  const player = state({ shields: 20, hull: 70 });
  const result = api.hit(player, 35, { kind: 'torpedo', from: { x: -50, y: 20 } });
  assert.deepEqual(plain(result), { ok: true, destroyed: false, shields: 0, hull: 55 });
  assert.deepEqual(contacts.map(contact => contact.shielded), [true, false]);
  assert.deepEqual(bursts[0].point, { x: 6, y: 22 });
  assert.equal(api.snapshot().flash.kind, 'torpedo');
  assert.equal(player.speed, 25);
  assert.ok(player.localCruise);
});

test('a fully shielded hit leaves hull unchanged and an unshielded hit damages hull directly', () => {
  const { api, contacts, bursts } = fixture();
  const player = state();
  api.hit(player, 10, { kind: 'beam' });
  assert.equal(player.shields, 70);
  assert.equal(player.hull, 100);
  assert.equal(bursts.length, 0);
  player.shields = 0;
  api.hit(player, 12, { kind: 'disruptor' });
  assert.equal(player.hull, 88);
  assert.deepEqual(contacts.map(contact => contact.shielded), [true, false]);
  assert.equal(bursts.length, 1);
});

test('Sol player contacts and explosion origins use world coordinates', () => {
  const { api, contacts, explosions } = fixture();
  const player = state({ system: 1, shields: 0, hull: 5 });
  api.hit(player, 100, { from: { x: 900, y: 2020 } });
  assert.equal(contacts[0].ship.x, 1010);
  assert.equal(contacts[0].ship.y, 2020);
  assert.equal(contacts[0].ship.heading, .3);
  assert.equal(explosions[0].source.x, 1010);
  assert.equal(explosions[0].source.y, 2020);
  assert.equal(explosions[0].source.size, 60);
  assert.equal(explosions[0].options.sourceKey, 'ship:player');
});

test('zero hull stops flight and emits one explosion even if more hits arrive', () => {
  const { api, explosions, contacts } = fixture();
  const player = state({ hull: 5, shields: 3 });
  assert.equal(api.hit(player, 20).destroyed, true);
  assert.equal(player.hull, 0);
  assert.equal(player.shields, 0);
  assert.equal(player.speed, 0);
  assert.equal(player.localCruise, null);
  assert.equal(player.arrivalApproach, null);
  const contactCount = contacts.length;
  assert.equal(api.hit(player, 20).ok, false);
  api.visualImpact(player, { kind: 'explosion' });
  assert.equal(explosions.length, 1);
  assert.equal(contacts.length, contactCount);
});

test('nonpositive weapon damage has no impact and reset removes transient art', () => {
  const { api } = fixture();
  const player = state(), before = structuredClone(player);
  api.hit(player, -10);
  api.hit(player, 0);
  assert.deepEqual(player, before);
  assert.equal(api.snapshot().flash, null);
  assert.equal(api.snapshot().particles, 0);
  api.visualImpact(player);
  player.shields = 0;
  api.visualImpact(player);
  assert.ok(api.snapshot().flash);
  assert.equal(api.snapshot().particles, 1);
  api.reset();
  assert.deepEqual(plain(api.snapshot()), { flash: null, particles: 0 });
});

test('hull sparks expire and are drawn in the front pass without changing health', () => {
  const { api, draws, setTime } = fixture();
  const player = state({ shields: 0 });
  api.visualImpact(player);
  const ctx = { save() {}, translate() {}, rotate() {}, restore() {} };
  const view = { state: player, ship: { x: player.x, y: player.y }, cx: 300, cy: 225, dimensions: { width: 48, height: 60 }, asset: { art: {} } };
  api.paint(ctx, view);
  assert.equal(draws.length, 0);
  api.paint(ctx, { ...view, front: true });
  assert.equal(draws.length, 1);
  assert.equal(draws[0].kind, 'hull');
  setTime(1600);
  api.advance(.6);
  assert.equal(api.snapshot().particles, 0);
  assert.equal(player.hull, 100);
  assert.equal(player.shields, 0);
});
