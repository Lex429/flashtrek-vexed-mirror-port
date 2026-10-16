const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const port = path.join(__dirname, '../html-games/broken-mirror-port');
const plain = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const bursts = [], contacts = [], explosions = [];
  const window = {
    vexedFlightAssets: { size: () => 60, flightDimensions: () => ({ width: 30, height: 60 }) },
    showcaseWeaponAppearance: { units: .91976 },
    nativeCombatShots: {
      contact(ship, from, dimensions, shielded) {
        contacts.push({ ship: { x: ship.x, y: ship.y }, from: { ...from }, dimensions: { ...dimensions }, shielded });
        return { local: { x: -4, y: 0 }, world: { x: ship.x - 4, y: ship.y }, dx: 1, dy: 0 };
      },
    },
    showcaseHullBurst: {
      burst(particles, point, born, units, zoom, strength, sparksOnly) {
        bursts.push({ point: { ...point }, born, units, zoom, strength, sparksOnly });
        particles.push({ x: point.x, y: point.y, born, ttl: 500 });
      },
    },
    nativeEnvironmentalImpacts: { explode: (_, source, options) => explosions.push({ source: { ...source }, options: { ...options } }) },
  };
  const sandbox = vm.createContext({ window, console, performance: { now: () => 1000 } });
  // Use the actual ship capacities, Sol ownership, freight initialization and
  // faction consequence rules. Rendering assets are never requested by these APIs.
  for (const file of ['world-data.js', 'faction-standing.js', 'sol-economy.js']) {
    vm.runInContext(fs.readFileSync(path.join(port, file), 'utf8'), sandbox);
  }
  const state = { system: 1, localPrestige: {} };
  for (const system of window.VexedMirrorWorld.systems) state.localPrestige[system.id] = 25;
  const api = window.nativeSolEconomy, economy = api.initialize(state), ship = economy.freighters[0];
  return { window, state, api, economy, ship, bursts, contacts, explosions };
}

test('an AI stray weapon can destroy a tug without changing player faction standing', () => {
  const { api, state, ship, explosions } = fixture();
  const prestigeBefore = structuredClone(state.localPrestige);
  const result = api.hit(state, ship.id, ship.shields + ship.hull + 10, { kind: 'torpedo', source: 'ai', sourceId: 17, from: { x: ship.x - 90, y: ship.y } });
  assert.equal(result.ok, true);
  assert.equal(result.destroyed, true);
  assert.equal(result.reputation, null);
  assert.equal(ship.hull, 0);
  assert.equal(ship.shields, 0);
  assert.equal(ship.phase, 'destroyed');
  assert.equal(ship.speed, 0);
  assert.deepEqual(state.localPrestige, prestigeBefore);
  assert.equal(explosions.length, 1);
  assert.equal(explosions[0].options.sourceKey, `ship:tug:${ship.id}`);
  assert.equal(api.hit(state, ship.id, 100, { source: 'ai', sourceId: 17 }).ok, false);
  assert.equal(explosions.length, 1, 'repeated hits on the wreck do not repeat its explosion');
});

test('a player weapon destroying a tug still applies its owning faction penalty', () => {
  const { api, window, state, ship } = fixture();
  const owner = ship.ownerGovernmentId;
  const result = api.hit(state, ship.id, ship.shields + ship.hull, { kind: 'beam', source: 'player', sourceId: 'player', from: { x: ship.x - 90, y: ship.y } });
  assert.equal(result.destroyed, true);
  assert.equal(result.reputation.amount, 10);
  let affected = 0, unaffected = 0;
  for (const system of window.VexedMirrorWorld.systems) {
    const owned = Number(system.governmentId) === Number(owner);
    assert.equal(state.localPrestige[system.id], owned ? 15 : 25, `${system.name} faction standing`);
    if (owned) affected++; else unaffected++;
  }
  assert.ok(affected > 0);
  assert.ok(unaffected > 0);
  assert.equal(result.reputation.affectedSystems, affected);
});

test('a blast shield impact preserves tug health, cargo, route and player standing', () => {
  const { api, state, ship, contacts, bursts, explosions } = fixture();
  const before = plain(ship), prestigeBefore = structuredClone(state.localPrestige);
  api.visualImpact(state, ship.id, { kind: 'explosion', from: { x: ship.x - 100, y: ship.y } });
  assert.equal(ship.hull, before.hull);
  assert.equal(ship.shields, before.shields);
  assert.equal(ship.shieldFlash.kind, 'explosion');
  assert.equal(ship.shieldFlash.charge, 1);
  const after = plain(ship);
  delete after.shieldFlash;
  assert.deepEqual(after, before);
  assert.deepEqual(state.localPrestige, prestigeBefore);
  assert.equal(contacts[0].shielded, true);
  assert.equal(bursts.length, 0);
  assert.equal(explosions.length, 0);
});

test('an unshielded debris impact creates hull sparks while preserving the entire tug', () => {
  const { api, state, ship, contacts, bursts, explosions } = fixture();
  ship.shields = 0;
  const before = plain(ship), prestigeBefore = structuredClone(state.localPrestige);
  api.visualImpact(state, ship.id, { kind: 'debris', from: { x: ship.x - 100, y: ship.y } });
  assert.deepEqual(plain(ship), before);
  assert.deepEqual(state.localPrestige, prestigeBefore);
  assert.equal(contacts[0].shielded, false);
  assert.equal(bursts.length, 1);
  assert.equal(bursts[0].sparksOnly, true);
  assert.equal(explosions.length, 0);
});

test('visual contacts ignore destroyed tugs and tugs outside the current system', () => {
  const { api, state, ship, contacts, bursts } = fixture();
  ship.phase = 'destroyed';
  api.visualImpact(state, ship.id, { kind: 'explosion', from: ship });
  ship.phase = 'waiting';
  state.system = 2;
  api.visualImpact(state, ship.id, { kind: 'debris', from: ship });
  assert.equal(contacts.length, 0);
  assert.equal(bursts.length, 0);
});
