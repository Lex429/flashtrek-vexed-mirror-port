const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const gameDirectory = path.join(__dirname, '../html-games/broken-mirror-port');
function load(context, filename) {
  vm.runInContext(fs.readFileSync(path.join(gameDirectory, filename), 'utf8'), context, { filename });
}
async function environment() {
  const shieldRadii = (width, height) => ({ rx: width * .6, ry: height * .6 });
  const window = {
    VexedMirrorWorld: {
      ships: [7, 10, 18, 23, 47, 52].map(id => ({ id, name: `Ship ${id}`, hull: 100, shields: 100, cargo: 50, defaultWeapons: [1], speedOrOtherStationValue: 40 })),
      systems: [{ id: 1, name: 'Sol', governmentId: 1, populationBillions: 8, mapPosition: { x: 0, y: 0 } }]
    },
    VexedMirrorWeapons: [{ id: 1, name: 'Phaser', damage: 12, recharge: 3 }],
    starterShips: new Map(),
    vexedFlightAssets: { size: () => 30, flightDimensions: () => ({ width: 30, height: 30 }), loadShip: async () => ({ profile: {} }) },
    vexedSolFlight: { shipPosition: state => ({ x: state.x, y: state.y }) },
    nativeSolEconomy: { goods: ['Ore'], names: {}, dimensions: () => ({ width: 24, height: 70 }) },
    nativeSolAsteroids: { placements: [], image: () => ({ complete: false }) },
    nativeFactionStanding: { shipDestroyed: () => ({ penalty: true }) },
    showcaseWeaponAppearance: { units: 100 },
    showcaseShieldRadii: shieldRadii,
    createShowcaseWeaponVisual: input => ({ ...input }),
    showcaseHullBurst: { burst: (list, point, born) => list.push({ ...point, born, ttl: 500 }), update() {} },
    showcaseStageFragments: { update() {} }
  };
  const context = vm.createContext({ window, document: { hidden: false }, performance: { now: () => 1000 }, console,
    fetch: async () => ({ ok: true, json: async () => ({ weapons: {} }) }) });
  for (const file of ['simulation-clock.js','ship-motion.js','ship-definitions.js','ship-damage.js','ship-effects.js','weapon-loadout.js','weapon-rules.js','combat-shots.js','ship-systems.js','civilian-combat-ai.js','civilian-traffic.js','asteroid-combat.js']) load(context, file);
  await window.nativeCombatShots.ready;
  window.nativeCombatShots.setVisualCatalog({ weapons: { beam: [{ id: 1 }] } }, { units: 100 });
  return { window, context, rules: window.nativeWeaponRules, shots: window.nativeCombatShots };
}
const vessel = (id, x, y) => ({ id, name: `Vessel ${id}`, shipType: 18, system: 1, stationSystem: 1, x, y, heading: 0, speed: 0, hull: 100, shields: 100, phase: 'docked', timer: 100, cargo: null, oreHold: 0, legs: 0 });
const stateWith = ships => ({ system: 1, shipType: 7, x: 0, y: 0, angle: 0, hull: 100, shields: 100, speed: 0, weapons: [1], civilianTraffic: { version: 2, clock: 0, ships, log: [] } });

test('a fast projectile hits the first bystander before its intended target or an asteroid', async () => {
  const { rules } = await environment();
  const source = { id: 'player', x: 0, y: 0, heading: 0 };
  const target = { id: 1, x: 100, y: 0, heading: 0 };
  const event = rules.startShot({ damage: 12 }, 'disruptor', source, target, 0, 0);
  const result = rules.stepShot(event, source, target, { bystanders: [{ id: 2, x: 40, y: 0, radius: 6 }], rocks: [{ slotId: 3, x: 70, y: 0, size: 20 }] }, .4, .4, { rx: 10, ry: 10 }, { width: 20, height: 20 });
  assert.equal(result.kind, 'hit');
  assert.equal(result.target.id, 2);
  assert.ok(result.point.x < 40);
  assert.equal(event.x, result.point.x);
});

test('a tracking beam re-aims at a moving target and hits an asteroid on the current firing line', async () => {
  const { window, rules, shots } = await environment();
  const state = stateWith([]), source = { id: 'player', x: 0, y: 0, heading: 0 };
  const target = { id: 1, x: 100, y: 0, heading: 0 };
  const rock = { slotId: 3, x: 50, y: 40, size: 20, maxHull: 10 };
  window.nativeSolAsteroids.placements.push(rock);
  const event = rules.startShot({ damage: 12 }, 'beam', source, target, 0, 0);
  target.y = 80;
  const result = rules.stepShot(event, source, target, { bystanders: [], rocks: [rock] }, .1, .1, { rx: 10, ry: 10 }, { width: 20, height: 20 });
  assert.equal(result.target.rockId, 3);
  assert.equal(shots.applyHit(state, result, event, source).destroyed, true);
  assert.deepEqual([...state.destroyedAsteroids], [3]);
});

test('projectiles continue flying when their original target disappears', async () => {
  const { window, shots } = await environment();
  const state = stateWith([]);
  window.VexedMirrorWeapons[0].name = 'Disruptor';
  shots.setVisualCatalog({ weapons: { disruptor: [{ id: 1 }] } }, { units: 100 });
  let target = { id: 1, x: 100, y: 0, heading: 0 };
  const shot = shots.fire({ state, shipHeight: 0, owner: 'test', getTarget: () => target, dimensions: () => ({ width: 20, height: 20 }), shielded: () => false });
  assert.equal(shot.ok, true);
  target = null;
  const rock = { slotId: 4, x: 150, y: 0, size: 20, maxHull: 10 };
  window.nativeSolAsteroids.placements.push(rock);
  window.nativeSimulation.advance(state,.5); shots.advance(state, .5);
  assert.deepEqual([...state.destroyedAsteroids], [4]);
  assert.equal(shot.shot.projectile.alive, false);
});

test('simultaneous stray shots pass objects destroyed earlier in the same update', async () => {
  const { window, shots } = await environment();
  const state = stateWith([]); state.weapons = [1, 1];
  shots.setVisualCatalog({ weapons: { disruptor: [{ id: 1 }] } }, { units: 100 });
  let target = { id: 1, x: 100, y: 0, heading: 0 };
  const options = { state, shipHeight: 0, getTarget: () => target, dimensions: () => ({ width: 20, height: 20 }), shielded: () => false };
  assert.equal(shots.fire(options).ok, true);
  assert.equal(shots.fire(options).ok, true);
  target = null;
  window.nativeSolAsteroids.placements.push({ slotId: 4, x: 150, y: 0, size: 20, maxHull: 10 }, { slotId: 5, x: 180, y: 0, size: 20, maxHull: 10 });
  window.nativeSimulation.advance(state,.7); shots.advance(state, .7);
  assert.deepEqual([...state.destroyedAsteroids], [4, 5]);
});

test('collateral damage reduces shields and retaliation targets the actual NPC shooter', async () => {
  const { window, shots } = await environment();
  const shooter = vessel(0, -200, 0), victim = vessel(1, 0, 100), intended = vessel(2, 200, 0);
  const state = stateWith([shooter, victim, intended]);
  const result = shots.applyHit(state, { target: { id: victim.id, category: 'civilian' }, point: { x: 0, y: 85 } }, { damage: 12, kind: 'torpedo', targetId: intended.id }, shooter);
  assert.equal(result.shields, 88);
  assert.equal(result.hull, 100);
  assert.equal(victim.retaliationTargetId, shooter.id);
  assert.equal(state.civilianTraffic.retaliations[0].b, shooter.id);
  assert.equal(victim.phase, 'fighting');
  assert.equal(window.nativeShipEffects.snapshot(window.nativeShipDefinitions.describe(state,victim,{category:'civilian'})).flash.kind,'torpedo');
  assert.doesNotThrow(() => JSON.stringify(state));
});

test('an NPC projectile still destroys an intervening asteroid after its shooter is destroyed', async () => {
  const { window, rules } = await environment();
  const shooter = vessel(0, 0, 0), victim = vessel(1, 250, 0), state = stateWith([shooter, victim]);
  state.x = 1000;
  const event = { ...rules.startShot({ damage: 12 }, 'disruptor', shooter, victim, 0, 0), id: 1, weaponId: 1, sourceSnapshot: { ...shooter }, targetSnapshot: { ...victim } };
  shooter.hull = 0; shooter.phase = 'destroyed'; victim.phase = 'fighting'; victim.disputeId = 1;
  state.civilianTraffic.disputes = [{ id: 1, system: 1, a: shooter.id, b: victim.id, reason: 'test', startedAt: 0, pending: [event], volleys: 1 }];
  window.nativeSolAsteroids.placements.push({ slotId: 8, x: 50, y: 0, size: 20, maxHull: 10 });
  window.nativeCombatShots.restore(state);window.nativeSimulation.advance(state,.25);window.nativeCivilianTraffic.advance(state,.25);window.nativeCombatShots.advance(state,.25);
  assert.deepEqual([...state.destroyedAsteroids], [8]);
  assert.equal(state.civilianTraffic.strayShots.length, 0);
  assert.equal(state.civilianTraffic.disputes.length, 0);
});

test('an idle civilian hit by the player fires back and pending attacks remain saveable', async () => {
  const { window } = await environment();
  const victim = vessel(1, 200, 0), state = stateWith([victim]);
  victim.heading = Math.PI;
  window.nativeCivilianTraffic.hit(state, victim.id, 1, { source: 'player', sourceId: 'player', from: { x: 0, y: 0 } });
  for(let i=0;i<30;i++){window.nativeSimulation.advance(state,.02);window.nativeCivilianTraffic.advance(state,.02);window.nativeCombatShots.advance(state,.02);}
  assert.equal(victim.retaliationTargetId, 'player');
  assert.ok(state.civilianTraffic.retaliations[0].volleys > 0);
  assert.doesNotThrow(() => JSON.stringify(state));
  assert.ok(Number.isFinite(victim.x) && Number.isFinite(victim.y));
});

test('environmental impacts flash shields or hull sparks without damage or retaliation', async () => {
  const { window } = await environment();
  const victim = vessel(1, 200, 0), state = stateWith([victim]);
  const traffic = window.nativeCivilianTraffic;
  const result = traffic.visualImpact(state, victim.id, { from: { x: 0, y: 0 }, kind: 'explosion' });
  assert.equal(result.shields, 100);
  assert.equal(result.hull, 100);
  assert.equal(window.nativeShipEffects.snapshot(window.nativeShipDefinitions.describe(state,victim,{category:'civilian'})).flash.kind,'explosion');
  victim.shields = 0;
  assert.equal(traffic.visualImpact(state, victim.id, { from: { x: 0, y: 0 }, kind: 'debris' }).hull, 100);
  assert.equal(state.civilianTraffic.retaliations.length, 0);
});

test('environmental asteroid damage stops at the floor and weapon destruction happens once', async () => {
  const { window } = await environment();
  const state = stateWith([]), rock = { slotId: 2, x: 100, y: 0, size: 20, maxHull: 10 };
  window.nativeSolAsteroids.placements.push(rock);
  let explosions = 0;
  window.nativeEnvironmentalImpacts = { explode: () => explosions++ };
  assert.equal(window.nativeAsteroidCombat.hit(state, 2, 4).hull, 6);
  assert.equal(window.nativeAsteroidCombat.hit(state, 2, 6).hull, 2.5);
  assert.equal(window.nativeAsteroidCombat.hit(state, 2, 1e6).damage, 0);
  assert.equal(explosions, 0);
  assert.equal(window.nativeAsteroidCombat.weaponHit(state, 2, .001).destroyed, true);
  assert.equal(window.nativeAsteroidCombat.destroy(state, 2).ok, false);
  assert.equal(explosions, 1);
});

test('a claimant can steer toward a player descriptor without explicit velocity', async () => {
  const { window } = await environment();
  const ship = { ...vessel(1, 0, 0), combatRadius: 10, cruiseSpeed: 100 };
  window.nativeCivilianCombatAI.begin(ship, 'claimant', 0);
  window.nativeCivilianCombatAI.steer(ship, { x: 200, y: 0, heading: 0, speed: 25, shields: 100, hull: 100 }, { anchor: { x: 0, y: 0 }, pending: [] }, { dt: .1, clock: .1, hull: 100, shields: 100, rocks: [], bystanders: [], bodies: [] });
  assert.ok(Number.isFinite(ship.x) && Number.isFinite(ship.y) && Number.isFinite(ship.heading));
});
