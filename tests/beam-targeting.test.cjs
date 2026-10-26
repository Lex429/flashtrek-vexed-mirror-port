const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const gameDirectory = path.join(__dirname, '../html-games/broken-mirror-port');
const plain = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected, message = 'coordinates agree') =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} vs ${expected}`);

// Exercise the real owned equipment, clock, descriptors, collision and damage
// owners. Only artwork and category business consequences are fixture adapters.
async function fixture() {
  const draws = [], hits = [], document = { hidden: false };
  const window = {
    VexedMirrorWorld: { ships: [7, 18].map(id => ({ id, name: 'Ship ' + id, hull: 100, shields: 80, defaultWeapons: [1] })) },
    VexedMirrorWeapons: [
      { id: 1, name: 'Phaser', damage: 12, recharge: 13 },
      { id: 2, name: 'Disruptor', damage: 12, recharge: 13 },
      { id: 3, name: 'Photon Torpedo', damage: 12, recharge: 13 },
      { id: 4, name: 'Polaron beam', damage: 18, recharge: 26 },
    ],
    starterShips: new Map(),
    vexedFlightAssets: { size: () => 60, flightDimensions: () => ({ width: 40, height: 60 }) },
    vexedSolFlight: { shipPosition: state => ({ x: state.x, y: state.y }) },
    showcaseWeaponAppearance: { units: 1 },
    showcaseShieldRadii: (width, height) => ({ rx: width * .6, ry: height * .6 }),
    createShowcaseWeaponVisual: input => ({ ...input }),
    paintShowcaseWeaponShot: (_, shot, geometry) => draws.push({ kind: shot.kind, ...geometry }),
    nativeSolAsteroids: { placements: [] }, nativePause: { active: false }, nativeShipInventory: { active: false },
  };
  for(const weapon of window.VexedMirrorWeapons)weapon.aimSpread=0;
  const context = vm.createContext({ window, document, console, performance: { now: () => 1000 },
    fetch: async () => ({ ok: true, json: async () => ({ weapons: {} }) }) });
  for (const file of ['simulation-clock.js', 'ship-motion.js', 'ship-definitions.js', 'ship-damage.js', 'weapon-loadout.js', 'weapon-rules.js', 'combat-shots.js', 'ship-systems.js', 'civilian-combat-ai.js']) {
    vm.runInContext(fs.readFileSync(path.join(gameDirectory, file), 'utf8'), context, { filename: file });
  }
  await window.nativeCombatShots.ready;
  window.nativeCombatShots.setVisualCatalog({ weapons: { beam: [{ id: 1 }, { id: 4 }], disruptor: [{ id: 2 }], torpedo: [{ id: 3 }] } }, { units: 1 });
  window.nativeShipDefinitions.register(18, { dimensions: { width: 40, height: 60 }, emitters: { beam: { x: .12, y: -.31 }, projectile: { x: .12, y: -.31 } } });
  let state = { system: 1, shipType: 18, x: 0, y: 0, angle: 0, hull: 100, shields: 80, weapons: [1], weaponInventory: [],
    civilianTraffic: { version: 2, clock: 0, ships: [], disputes: [], retaliations: [], strayShots: [] }, solEconomy: { freighters: [] } };
  const describe = id => window.nativeShipSystems.resolve(state, id);
  const damage = (entity, category, amount, impact) => {
    const result = window.nativeShipDamage.apply(window.nativeShipDefinitions.describe(state, entity, { category }), amount, impact);
    if (result.destroyed) entity.phase = 'destroyed';
    hits.push({ id: category === 'player' ? 'player' : entity.id, amount, impact, result });
    return result;
  };
  window.nativeCivilianTraffic = { hit: (_, id, amount, impact) => damage(state.civilianTraffic.ships.find(ship => ship.id === id), 'civilian', amount, impact) };
  window.nativeCombatShots.onPlayerHit = (_, amount, impact) => damage(state, 'player', amount, impact);
  window.nativeAsteroidCombat = { weaponHit: (_, id, amount, impact) => {
    const rock = window.nativeSolAsteroids.placements.find(rock => rock.slotId === id);
    rock.hull = Math.max(0, rock.hull - amount);
    if (rock.hull === 0) state.destroyedAsteroids = [...(state.destroyedAsteroids || []), id];
    hits.push({ id: 'rock:' + id, amount, impact }); return { ok: true, hull: rock.hull, destroyed: rock.hull === 0 };
  } };
  function npc(x, y = 0, values = {}) {
    const id = state.civilianTraffic.ships.length + 1;
    state.civilianTraffic.ships.push({ id, shipType: 18, system: 1, x, y, heading: 0, speed: 0, vx: 0, vy: 0,
      hull: 100, shields: 80, phase: 'cruise', weapons: [1], weaponInventory: [], ...values });
    return id;
  }
  function rock(x, y = 0, values = {}) {
    const slotId = window.nativeSolAsteroids.placements.length + 1;
    const result = { slotId, x, y, size: 30, hull: 100, ...values };
    window.nativeSolAsteroids.placements.push(result); return result;
  }
  function fire(sourceId, targetId, extras = {}) {
    return window.nativeCombatShots.fireFor({ state, shooter: describe(sourceId), target: describe(targetId), ...extras });
  }
  function step(dt) { window.nativeSimulation.advance(state, dt); window.nativeCombatShots.advance(state, dt); }
  function paint(shot) {
    window.nativeCombatShots.paint({}, shot, { state, ship: { x: 0, y: 0 }, cx: 0, cy: 0 });
    return draws.at(-1);
  }
  return { window, document, get state() { return state; }, draws, hits, describe, npc, rock, fire, step, paint,
    reload() { state = plain(state); window.nativeCombatShots.restore(state); return state; } };
}

function nearSurface(f, draw, targetId, shielded = true, aimTargetId = targetId) {
  const target = f.describe(targetId), from = { x: draw.x1, y: draw.y1 }, point = { x: draw.x2, y: draw.y2 };
  const aim = f.describe(aimTargetId);
  const shape = f.window.nativeShipDefinitions.surfaceRadii(target.dimensions, shielded, target.definition);
  const angle = target.heading + Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle);
  const dx = point.x - target.x, dy = point.y - target.y, lx = dx * c + dy * s, ly = -dx * s + dy * c;
  close((lx / (shape.rx * .96)) ** 2 + (ly / (shape.ry * .96)) ** 2, 1, 'endpoint lies on the shared surface');
  close((point.x - from.x) * (aim.y - from.y) - (point.y - from.y) * (aim.x - from.x), 0, 'endpoint stays on the current firing line');
  const nx = lx / (shape.rx * .96) ** 2, ny = ly / (shape.ry * .96) ** 2;
  const normal = { x: nx * c - ny * s, y: nx * s + ny * c };
  assert.ok(normal.x * (from.x - point.x) + normal.y * (from.y - point.y) > 0, 'firing ray enters the surface instead of emerging from its far side');
}

test('beam firing eligibility covers directly ahead, beside and behind for player and NPC', async () => {
  for (const role of ['player', 'civilian']) for (const [x, y] of [[220, 0], [0, 220], [-220, 0]]) {
    const f = await fixture(), sourceId = role === 'player' ? 'player' : f.npc(0), targetId = role === 'player' ? f.npc(x, y) : 'player';
    if (role !== 'player') { f.state.x = x; f.state.y = y; }
    const source = f.describe(sourceId), target = f.describe(targetId), rules = f.window.nativeWeaponRules;
    const spec = rules.weaponSpec(f.window.VexedMirrorWeapons[0], 'beam');
    assert.equal(rules.firingSolution(source, target, spec, 'beam', { bystanders: [], rocks: [] }), true, `${role} at ${x},${y}: shared eligibility`);
    assert.equal(f.window.nativeCivilianCombatAI.canFire(source, target, spec, target, []), true, `${role}: NPC compatibility eligibility`);
    const firing = f.fire(sourceId, targetId);
    assert.equal(firing.ok, true, `${role} at ${x},${y}: lifecycle eligibility`);
    f.step(.07); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, targetId);
  }
});

test('beam resolution aims at current positions after both ships translate and rotate during the 70 ms delay', async () => {
  const f = await fixture(), targetId = f.npc(240), firing = f.fire('player', targetId);
  assert.equal(firing.ok, true);
  f.state.x = 25; f.state.y = -35; f.state.angle = Math.PI;
  Object.assign(f.describe(targetId).entity, { x: 190, y: 75, heading: 1.3 });
  f.step(.069); assert.equal(f.hits.length, 0, 'retain the existing resolution delay');
  f.step(.0011);
  assert.equal(f.hits.length, 1, 'current unobstructed target is hit'); assert.equal(f.hits[0].id, targetId);
  nearSurface(f, f.paint(firing.shot), targetId);
});

test('resolved beam follows the current near shield surface rather than a hull-local point rotating to the far side', async () => {
  const f = await fixture(), targetId = f.npc(220), firing = f.fire('player', targetId);
  f.step(.08); assert.equal(f.hits.length, 1);
  f.describe(targetId).entity.heading = Math.PI;
  f.state.x = -15; f.state.y = 50; f.state.angle = .9;
  nearSurface(f, f.paint(firing.shot), targetId);
  assert.equal(f.hits.length, 1, 'visual surface tracking does not reapply damage');
});

test('ships already between shooter and selected target physically intercept an allowed beam', async () => {
  const f = await fixture(), targetId = f.npc(300), blockerId = f.npc(150), firing = f.fire('player', targetId);
  assert.equal(firing.ok, true, 'interception is resolved through the actual firing line');
  f.step(.08);
  assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, blockerId);
  assert.equal(f.describe(targetId).entity.shields, 80); assert.equal(f.describe(blockerId).entity.shields, 68);
  assert.ok(f.paint(firing.shot).x2 < 150);
});

test('off-axis interception preserves the selected firing line and exact damage endpoint before and after resolution', async () => {
  for (const offset of [10, 15]) {
    const f = await fixture(), targetId = f.npc(320), blockerId = f.npc(145, offset), firing = f.fire('player', targetId);
    assert.equal(firing.ok, true);
    const preview = f.paint(firing.shot); nearSurface(f, preview, blockerId, true, targetId);
    f.step(.07); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, blockerId);
    const resolved = f.paint(firing.shot); nearSurface(f, resolved, blockerId, true, targetId);
    close(resolved.x2, preview.x2, 'resolution cannot steer the beam toward the blocker center');
    close(resolved.y2, preview.y2, 'resolution retains the original selected firing line');
    close(resolved.x2, firing.event.contact.world.x, 'rendered beam matches the damage contact');
    close(resolved.y2, firing.event.contact.world.y, 'rendered beam matches the damage contact');
    close(resolved.x2, f.hits[0].impact.point.x); close(resolved.y2, f.hits[0].impact.point.y);
    for (const heading of [.6, Math.PI / 2, Math.PI]) {
      f.describe(blockerId).entity.heading = heading;
      const draw = f.paint(firing.shot); nearSurface(f, draw, blockerId, true, targetId);
      const flash = f.window.nativeCombatShots.beamContactFor(f.state, firing.event.id, blockerId);
      close(flash.world.x, draw.x2); close(flash.world.y, draw.y2);
    }
    f.describe(blockerId).entity.y = 100;
    nearSurface(f, f.paint(firing.shot), targetId);
    assert.equal(f.hits.length, 1); assert.equal(f.describe(targetId).shields, 80, 'lingering visuals never add a later hit');
  }
});

test('all weapon models support rear fire while projectile flight and torpedo homing remain model-specific', async () => {
  const f = await fixture(), rules = f.window.nativeWeaponRules, source = f.describe('player');
  const target = { ...source, id: 5, x: -200, y: 0, vx: 0, vy: 120 };
  for (const weapon of [f.window.VexedMirrorWeapons[0], f.window.VexedMirrorWeapons[3]]) {
    assert.equal(rules.firingSolution(source, target, rules.weaponSpec(weapon, 'beam'), 'beam', { bystanders: [], rocks: [] }), true);
  }
  for (const kind of ['disruptor', 'torpedo']) {
    const spec = rules.weaponSpec(f.window.VexedMirrorWeapons[kind === 'torpedo' ? 2 : 1], kind);
    assert.equal(rules.firingSolution(source, target, spec, kind, { bystanders: [], rocks: [] }), true, `${kind} supports independent targeting`);
    const ahead = { ...target, x: 300, y: 0 }, event = rules.startShot({ damage: 12 }, kind, source, ahead, 0, 0);
    assert.equal(event.projectile, true); assert.ok(event.vy > 0, 'projectile launch still leads a moving target');
    const heading = Math.atan2(event.vy, event.vx), speed = Math.hypot(event.vx, event.vy);
    const movedTarget = { ...ahead, x: 300, y: 200, previousX: 300, previousY: 200 };
    const result = rules.stepShot(event, { ...source, heading: Math.PI }, movedTarget, { bystanders: [], rocks: [] }, .01, .01, { rx: 1, ry: 1 }, { width: 2, height: 2 });
    assert.equal(result, null); close(Math.hypot(event.vx, event.vy), speed, 'projectile speed is unchanged');
    const turn = Math.abs(rules.wrap(Math.atan2(event.vy, event.vx) - heading));
    if (kind === 'torpedo') { assert.ok(turn > 0); assert.ok(turn <= spec.turn * .01 + 1e-9, 'homing turn stays rate limited'); }
    else close(turn, 0, 'unguided projectiles do not track the target');
  }
});

test('rear beams choose the nearest configured hardware emitter and keep it attached as the source rotates', async () => {
  const f = await fixture();
  f.window.nativeShipDefinitions.register(18, { dimensions: { width: 40, height: 60 }, emitters: {
    beam: { x: .12, y: -.31 }, beamAft: { x: -.08, y: .29 }, projectile: { x: .12, y: -.31 },
  } });
  const targetId = f.npc(-220), firing = f.fire('player', targetId);
  assert.equal(firing.ok, true); close(firing.event.emitter.x, -.08 * 40); close(firing.event.emitter.y, .29 * 60);
  let draw = f.paint(firing.shot); assert.ok(draw.x1 < f.state.x, 'rear fire starts at the aft mount');
  f.state.x = 7; f.state.y = -13; f.state.angle = .8;
  draw = f.paint(firing.shot);
  const a = f.state.angle + Math.PI / 2, local = firing.event.emitter;
  close(draw.x1, f.state.x + local.x * Math.cos(a) - local.y * Math.sin(a));
  close(draw.y1, f.state.y + local.x * Math.sin(a) + local.y * Math.cos(a));
  assert.equal(f.hits.length, 0, 'preview is visual only');
});

test('small fast targets and close targets are hit using current authoritative positions', async () => {
  for (const distance of [28, 70, 310]) {
    const f = await fixture(), targetId = f.npc(distance, 0, { dimensions: { width: 2, height: 3 } }), firing = f.fire('player', targetId);
    assert.equal(firing.ok, true);
    Object.assign(f.describe(targetId).entity, { x: distance + 3, y: 17, vx: 40, vy: 1200, heading: 2.1, previousX: distance, previousY: -67 });
    f.state.angle = -2.4; f.state.x = -2; f.state.y = 6;
    f.step(.07); assert.equal(f.hits.length, 1, `small fast target at ${distance}`); assert.equal(f.hits[0].id, targetId);
    nearSurface(f, f.paint(firing.shot), targetId);
  }
});

test('close-range beams never reverse when a hull-clear firing emitter is already within the target shield volume', async () => {
  const f = await fixture(); f.state.dimensions = { width: 8, height: 14 };
  const targetId = f.npc(35), source = f.describe('player'), target = f.describe(targetId);
  assert.ok(target.x - source.x > source.hullRadii.ry + target.hullRadii.ry, 'physical hulls have clearance');
  const firing = f.fire('player', targetId); assert.equal(firing.ok, true);
  for (const resolved of [false, true]) {
    if (resolved) f.step(.07);
    const draw = f.paint(firing.shot), dx = draw.x2 - draw.x1, dy = draw.y2 - draw.y1;
    assert.ok(Number.isFinite(dx + dy));
    assert.ok(dx * (target.x - draw.x1) + dy * (target.y - draw.y1) >= -1e-7, 'an immediate contact cannot draw backward through its emitter');
  }
  assert.equal(f.hits.length, 1); assert.equal(f.describe(targetId).shields, 68); assert.equal(f.describe(targetId).hull, 100);
});

test('instantaneous beam collision ignores historical ship positions used by projectile sweeps', async () => {
  const f = await fixture(), rules = f.window.nativeWeaponRules, source = f.describe('player');
  const target = { ...f.describe(f.npc(210, 30)), previousX: 210, previousY: -300 };
  const event = rules.startShot(f.window.VexedMirrorWeapons[0], 'beam', source, target, 0, 0);
  const result = rules.stepShot(event, source, target, { bystanders: [], rocks: [] }, .07, .07, target.radii, target.dimensions);
  assert.equal(result.kind, 'hit'); assert.equal(result.target.id, target.id);
  const cross = (result.point.x - result.from.x) * (target.y - result.from.y) - (result.point.y - result.from.y) * (target.x - result.from.x);
  close(cross, 0, 'current-pose collision point is collinear with the actual beam');
});

test('preview and resolved visuals use active shields, collapsed shields and bare hulls through the same shared geometry', async () => {
  for (const shields of [80, 5, 0]) {
    const f = await fixture(), targetId = f.npc(220, 0, { shields }), firing = f.fire('player', targetId);
    nearSurface(f, f.paint(firing.shot), targetId, shields > 0);
    assert.equal(f.hits.length, 0); assert.equal(f.describe(targetId).shields, shields);
    f.step(.08);
    const target = f.describe(targetId), hit = f.hits[0];
    assert.equal(f.hits.length, 1); assert.equal(target.shields, Math.max(0, shields - 12));
    assert.equal(target.hull, 100 - Math.max(0, 12 - shields));
    assert.equal(firing.event.contact.shielded, shields > 0, 'damage receives the surface that actually absorbed the shot');
    if (shields > 0) assert.equal(hit.result.contacts.shield, firing.event.contact);
    if (shields === 5) { assert.equal(hit.result.contacts.hull.shielded, false); assert.equal(hit.result.absorbed, 5); assert.equal(hit.result.hullDamage, 7); }
    const before = plain({ hull: target.hull, shields: target.shields });
    for (const heading of [.2, 1.5, Math.PI, -1.7]) {
      Object.assign(target.entity, { heading, x: 220 + heading * 2, y: heading * 4 });
      f.state.x -= 3; f.state.y += 8; f.state.angle += .6;
      nearSurface(f, f.paint(firing.shot), targetId, shields > 12);
    }
    assert.deepEqual(plain({ hull: target.entity.hull, shields: target.entity.shields }), before);
    assert.equal(f.hits.length, 1, 'repeated drawing of new surface contacts never damages again');
  }
});

test('the nearest ship or asteroid receives a beam rather than its selected target', async () => {
  for (const first of ['ship', 'asteroid']) {
    const f = await fixture(), targetId = f.npc(360), shipId = f.npc(first === 'ship' ? 140 : 240);
    const rock = f.rock(first === 'asteroid' ? 140 : 240), firing = f.fire('player', targetId);
    assert.equal(firing.ok, true); f.paint(firing.shot); assert.equal(f.hits.length, 0);
    f.step(.08); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, first === 'ship' ? shipId : 'rock:' + rock.slotId);
    assert.equal(f.describe(targetId).shields, 80); assert.ok(f.paint(firing.shot).x2 < 140);
    assert.equal(first === 'ship' ? f.describe(shipId).shields : rock.hull, first === 'ship' ? 68 : 88);
  }
});

test('a ship entering the current firing line before resolution physically intercepts the beam', async () => {
  const f = await fixture(), targetId = f.npc(320), blockerId = f.npc(145, 100), firing = f.fire('player', targetId);
  assert.equal(firing.ok, true);
  Object.assign(f.describe(blockerId).entity, { previousX: 145, previousY: 100, y: 0 });
  f.step(.07); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, blockerId);
  assert.equal(f.describe(targetId).shields, 80); nearSurface(f, f.paint(firing.shot), blockerId, true, targetId);
});

test('an asteroid entering the current firing line before resolution physically intercepts the beam', async () => {
  const f = await fixture(), targetId = f.npc(320), rock = f.rock(145, 120), firing = f.fire('player', targetId);
  assert.equal(firing.ok, true);
  Object.assign(rock, { previousX: 145, previousY: 120, y: 0 });
  f.step(.07); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, 'rock:' + rock.slotId);
  assert.equal(f.describe(targetId).shields, 80);
  const draw = f.paint(firing.shot); close(Math.hypot(draw.x2 - rock.x, draw.y2 - rock.y), rock.size * .43, 'beam meets the asteroid outline');
});

test('a destroyed intercepting asteroid leaves the beam at its original impact without extending to the live selected target after reload', async () => {
  const f = await fixture(), targetId = f.npc(320), rock = f.rock(145, 0, { hull: 8 }), firing = f.fire('player', targetId);
  assert.equal(firing.ok, true); const preview = f.paint(firing.shot);
  f.step(.07); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, 'rock:' + rock.slotId);
  assert.equal(f.describe('rock:' + rock.slotId), null, 'destroyed rock is no longer a physical blocker');
  const impact = plain(firing.event.contact.world), resolved = f.paint(firing.shot);
  close(resolved.x2, impact.x); close(resolved.y2, impact.y);
  close(resolved.x2, preview.x2); close(resolved.y2, preview.y2);
  assert.equal(f.describe(targetId).shields, 80);
  f.reload(); f.state.x = -5; f.state.angle = 1.1;
  Object.assign(f.describe(targetId).entity, { x: 400, y: 80 });
  f.step(.01);
  f.window.nativeCombatShots.paintAll({}, { state: f.state, ship: { x: 0, y: 0 }, cx: 0, cy: 0 });
  const restored = f.draws.at(-1);
  close(restored.x2, impact.x, 'restored beam cannot pass the original destroyed-rock impact');
  close(restored.y2, impact.y, 'destroyed contact remains at its authoritative world position');
  assert.equal(f.hits.length, 1); assert.equal(f.describe(targetId).shields, 80);
  f.step(.2); assert.equal(f.hits.length, 1); assert.equal(f.state.weaponCombat.events.length, 0);
});

test('objects that have left the firing line cannot intercept a current instantaneous beam', async () => {
  const f = await fixture(), targetId = f.npc(320), blockerId = f.npc(145, 0), rock = f.rock(90);
  const firing = f.fire('player', targetId); assert.equal(firing.ok, true);
  Object.assign(f.describe(blockerId).entity, { previousX: 145, previousY: 0, y: 130 });
  Object.assign(rock, { previousX: 90, previousY: 0, y: -130 });
  f.step(.07); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, targetId);
  assert.equal(f.describe(blockerId).shields, 80); assert.equal(rock.hull, 100);
});

test('visual tracking can stop at a new obstruction after resolution without applying more damage', async () => {
  const f = await fixture(), targetId = f.npc(320), blockerId = f.npc(145, 100), firing = f.fire('player', targetId);
  f.step(.08); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, targetId);
  Object.assign(f.describe(blockerId).entity, { y: 0, heading: .7 });f.window.nativeShipSystems.invalidate(f.state);
  for (let i = 0; i < 8; i++) nearSurface(f, f.paint(firing.shot), blockerId, true, targetId);
  f.step(.02); assert.equal(f.hits.length, 1); assert.equal(f.describe(blockerId).shields, 80);
  assert.equal(f.describe(targetId).shields, 68);
});

test('range limits reject rear targets outside range without spending owned charge, and still cap the resolving ray', async () => {
  const f = await fixture(), range=f.window.nativeWeaponRules.weaponSpec(f.window.VexedMirrorWeapons[0],'beam').range,targetId = f.npc(-range-1), loadouts = f.window.nativeWeaponLoadout;
  const instance = loadouts.equipped(f.state)[0].instance;
  assert.equal(f.fire('player', targetId).ok, false); assert.equal(instance.readyAt, 0);
  f.describe(targetId).entity.x = -420;
  const firing = f.fire('player', targetId); assert.equal(firing.ok, true);
  f.describe(targetId).entity.x = -range-100;f.window.nativeShipSystems.invalidate(f.state); f.step(.08);
  assert.equal(f.hits.length, 0); assert.equal(firing.event.resolved, true);
  close(Math.hypot(firing.event.beamEnd.x - firing.event.from.x, firing.event.beamEnd.y - firing.event.from.y), range);
});

test('pause, inventory and hidden tabs freeze an in-progress beam and its owned recharge before JSON restoration', async () => {
  for (const mode of ['pause', 'inventory', 'hidden']) {
    const f = await fixture(), targetId = f.npc(220), firing = f.fire('player', targetId);
    f.step(.03); const pending = JSON.stringify(f.state.weaponCombat.events), clock = f.window.nativeSimulation.seconds(f.state);
    const instanceId = firing.event.weaponInstanceId, readyAt = f.state.shipEquipment.instances[instanceId].readyAt;
    if (mode === 'pause') f.window.nativePause.active = true;
    if (mode === 'inventory') f.window.nativeShipInventory.active = true;
    if (mode === 'hidden') f.document.hidden = true;
    f.step(5); assert.equal(f.window.nativeSimulation.seconds(f.state), clock); assert.equal(JSON.stringify(f.state.weaponCombat.events), pending);
    assert.equal(f.hits.length, 0); assert.equal(f.fire('player', targetId).ok, false);
    f.reload(); assert.equal(f.state.shipEquipment.instances[instanceId].readyAt, readyAt);
    f.window.nativePause.active = false; f.window.nativeShipInventory.active = false; f.document.hidden = false;
    f.state.angle = Math.PI; f.state.x = -20; f.describe(targetId).entity.y = 65;
    f.step(.041); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, targetId);
    for (let i = 0; i < 5; i++) f.window.nativeCombatShots.paintAll({}, { state: f.state, ship: { x: 0, y: 0 }, cx: 0, cy: 0 });
    f.step(.01); assert.equal(f.hits.length, 1);
  }
});

test('old saved beamHeadingOffset does not override a current valid target and a resolved saved shot cannot damage twice', async () => {
  const f = await fixture(), targetId = f.npc(220), firing = f.fire('player', targetId);
  f.step(.025); firing.event.beamHeadingOffset = -2.5; firing.event.beamEnd = { x: 400, y: -900 };
  f.reload(); f.state.angle = 2.4; f.describe(targetId).entity.y = 70;
  f.step(.05); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, targetId);
  f.reload(); f.step(.01); f.window.nativeCombatShots.paintAll({}, { state: f.state, ship: { x: 0, y: 0 }, cx: 0, cy: 0 });
  assert.equal(f.hits.length, 1); assert.equal(f.describe(targetId).shields, 68);
});

test('upgraded beam damage and recharge remain equal for player and NPC and stay with the owned weapon', async () => {
  for (const role of ['player', 'civilian']) {
    const f = await fixture();
    f.window.nativeShipDefinitions.register(18, { dimensions: { width: 40, height: 60 }, weaponDamageMultiplier: 1.5 });
    const sourceId = role === 'player' ? 'player' : f.npc(0), targetId = role === 'player' ? f.npc(-220) : 'player';
    if (role !== 'player') f.state.x = -220;
    const holder = f.describe(sourceId).entity, loadouts = f.window.nativeWeaponLoadout;
    const firing = f.fire(sourceId, targetId); assert.equal(firing.ok, true); assert.equal(firing.event.damage, 18); assert.equal(firing.event.spec.damage, 18);
    const owned = loadouts.equipped(f.state, holder)[0].instance; close(owned.readyAt, 1);
    assert.equal(loadouts.move(f.state, { holder, fromType: 'slot', fromIndex: 0, toType: 'locker', toIndex: 0 }).ok, true);
    assert.equal(loadouts.move(f.state, { holder, fromType: 'locker', fromIndex: 0, toType: 'slot', toIndex: 2 }).ok, true);
    assert.equal(loadouts.equipped(f.state, holder).find(item => item.slot === 2).instance, owned);
    assert.equal(f.fire(sourceId, targetId).ok, false, 'moving a recharging weapon does not bypass its deadline');
    f.step(.08); assert.equal(f.hits.length, 1); assert.equal(f.describe(targetId).shields, 62);
    f.step(.919); assert.equal(f.fire(sourceId, targetId).ok, false);
    f.step(.002); assert.equal(f.fire(sourceId, targetId).ok, true, 'charge pacing resumes at the same existing deadline');
  }
});

test('an intercepted ship retains its own dimensions rather than the selected target dimensions adapter', async () => {
  const f = await fixture(), targetId = f.npc(360, 0, { dimensions: { width: 120, height: 160 } });
  const blockerId = f.npc(140, 0, { dimensions: { width: 8, height: 14 } });
  const firing = f.fire('player', targetId, { dimensions: () => ({ width: 120, height: 160 }) });
  assert.equal(firing.ok, true); f.step(.08);
  assert.equal(f.hits[0].id, blockerId); assert.equal(firing.event.contact.dimensions.width, 8);
  nearSurface(f, f.paint(firing.shot), blockerId, true, targetId);
  f.describe(blockerId).entity.heading = 1.2;
  nearSurface(f, f.paint(firing.shot), blockerId, true, targetId);
});

test('a shielded ship intercepting an asteroid lock retains shields despite the asteroid controller surface adapter', async () => {
  const f = await fixture(), rock = f.rock(320), blockerId = f.npc(140);
  const firing = f.fire('player', 'rock:' + rock.slotId, { dimensions: () => ({ width: rock.size, height: rock.size }), shielded: () => false });
  assert.equal(firing.ok, true); f.step(.08);
  assert.equal(f.hits[0].id, blockerId); assert.equal(firing.event.contact.shielded, true);
  assert.equal(f.describe(blockerId).shields, 68); assert.equal(rock.hull, 100);
  nearSurface(f, f.paint(firing.shot), blockerId, true, 'rock:' + rock.slotId);
  assert.equal(f.window.nativeCombatShots.beamContactFor(f.state, firing.event.id, blockerId).shielded, true);
});

test('destroying the selected target before resolution still permits physical interception and never damages its saved snapshot', async () => {
  const f = await fixture(), targetId = f.npc(220), rock = f.rock(130, 150), firing = f.fire('player', targetId);
  assert.equal(firing.ok, true);
  const target = f.describe(targetId).entity;
  target.hull = 0; target.phase = 'destroyed'; rock.y = 0; f.state.angle = Math.PI;
  f.reload(); f.step(.07);
  assert.equal(f.hits.length, 1); assert.equal(f.hits[0].id, 'rock:' + rock.slotId);
  assert.equal(f.state.civilianTraffic.ships[0].hull, 0); assert.equal(f.state.civilianTraffic.ships[0].shields, 80);
  f.reload(); f.step(.01); assert.equal(f.hits.length, 1);
});

test('a lethal resolved beam stays exactly once through JSON reload, visual tracking and expiry', async () => {
  const f = await fixture(), targetId = f.npc(220, 0, { shields: 0, hull: 8 }), blockerId = f.npc(130, 100);
  const firing = f.fire('player', targetId); f.step(.08);
  assert.equal(firing.event.resolved, true); assert.equal(f.hits.length, 1); assert.equal(f.hits[0].result.destroyed, true);
  f.reload(); assert.equal(f.describe(targetId), null, 'destroyed target has no active physical descriptor');
  f.describe(blockerId).entity.y = 0;
  for (let i = 0; i < 6; i++) {
    f.window.nativeCombatShots.paintAll({}, { state: f.state, ship: { x: i * 4, y: 5 }, cx: 0, cy: 0 });
    f.step(.01);
  }
  assert.equal(f.hits.length, 1); assert.equal(f.describe(blockerId).shields, 80);
  f.step(.1); assert.equal(f.state.weaponCombat.events.length, 0); assert.equal(f.hits.length, 1);
});

test('shield-effects contact queries match the rendered current surface and never mutate combat state', async () => {
  const f = await fixture(), targetId = f.npc(220), blockerId = f.npc(130, 100), firing = f.fire('player', targetId);
  f.step(.08); assert.equal(f.hits[0].impact.weaponEventId, firing.event.id);
  const query = f.window.nativeCombatShots.beamContactFor;
  assert.equal(typeof query, 'function');
  for (const shields of [68, 0]) {
    Object.assign(f.describe(targetId).entity, { heading: 2.6, y: 15, shields }); f.state.y += 17; f.state.angle += .7;
    const before = JSON.stringify(f.state), contact = query(f.state, firing.event.id, targetId), draw = f.paint(firing.shot);
    assert.ok(contact); assert.equal(contact.shielded, shields > 0);
    close(contact.world.x, draw.x2); close(contact.world.y, draw.y2);
    assert.equal(JSON.stringify(f.state), before, 'reading/rendering a tracked flash cannot alter saved gameplay state');
  }
  // The struck target's flash must not remain at an old shield point when a
  // different physical surface now stops the visible beam.
  f.describe(blockerId).entity.y = 15;f.window.nativeShipSystems.invalidate(f.state);
  assert.equal(query(f.state, firing.event.id, targetId), null);
  assert.equal(f.hits.length, 1);
  f.step(.11); assert.equal(query(f.state, firing.event.id, targetId), null, 'expired beams have no tracked surface');
});
