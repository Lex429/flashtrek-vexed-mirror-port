const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const directory = path.join(__dirname, '../html-games/broken-mirror-port');
function fixture({ ai = false } = {}) {
  const window = {};
  const context = vm.createContext({ window, console });
  const load = file => vm.runInContext(fs.readFileSync(path.join(directory, file), 'utf8'), context, { filename: file });
  for (const file of ['world-data.js', 'ship-motion.js', 'ship-definitions.js']) load(file);
  if (ai) for (const file of ['weapon-rules.js', 'civilian-combat-ai.js']) load(file);
  return { window, motion: window.nativeShipMotion, definitions: window.nativeShipDefinitions };
}
const pose = (category, extra = {}) => ({ x: 0, y: 0, speed: 0, [category === 'player' ? 'angle' : 'heading']: 0, ...extra });
const plain = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} vs ${expected}`);

test('equivalent player, tug and civilian commands execute the same shared integration', () => {
  const { motion, definitions } = fixture();
  const profile = { maxSpeed: 140, acceleration: 80, braking: 100, turnRate: 1.2 };
  const ships = Object.keys(definitions.profiles).map(category => pose(category));
  for (let i = 0; i < 100; i++) for (const ship of ships) motion.step(ship, { throttle: 1, turn: i < 40 ? .6 : 0 }, profile, .02);
  for (const ship of ships) {
    near(ship.x, ships[0].x, 'world x');
    near(ship.y, ships[0].y, 'world y');
    near(ship.angle ?? ship.heading, ships[0].angle, 'heading');
    near(ship.speed, 140, 'top speed');
    assert.ok(ship.vx > 0 && ship.vy > 0);
  }
  for (const ship of ships) for (let i = 0; i < 100; i++) motion.step(ship, { brake: true }, profile, .02);
  for (const ship of ships) assert.equal(ship.speed, 0);
});

test('every registered ship and category inherits finite, constrained motion and goal arrival', () => {
  const { motion, definitions } = fixture();
  // New definition registrations and behavior categories automatically join this contract.
  for (const definition of definitions.registered()) for (const category of Object.keys(definitions.profiles)) {
    const ship = pose(category, { shipType: definition.id });
    const profile = definitions.describe({ system: 2 }, ship, { category }).definition.movement;
    assert.ok(profile, `${category} ${definition.id} declares a shared movement profile`);
    for (let i = 0; i < 120; i++) motion.step(ship, { throttle: 1, turn: profile.turnRate === Infinity ? 0 : .2 }, profile, .02);
    assert.ok(Number.isFinite(ship.x) && Number.isFinite(ship.y), `${category} ${definition.id} finite pose`);
    assert.ok(ship.speed <= profile.maxSpeed + 1e-8, `${category} ${definition.id} speed limit`);
    for (let i = 0; i < 250; i++) motion.step(ship, { brake: true }, profile, .02);
    assert.equal(ship.speed, 0, `${category} ${definition.id} braking`);
    const goal = { x: ship.x + 150, y: ship.y + 35 };
    let result;
    for (let i = 0; i < 2500; i++) {
      result = motion.step(ship, { goal, snap: true }, profile, .02);
      if (result.arrived) break;
    }
    assert.equal(result.arrived, true, `${category} ${definition.id} arrival`);
    near(ship.x, goal.x, 'arrival x');near(ship.y, goal.y, 'arrival y');
    assert.equal(ship.speed, 0);
  }
});

test('role profiles preserve their explicit speed, turning and braking differences', () => {
  const { motion } = fixture();
  const manual = motion.profiles.manual({ speedOrOtherStationValue: 35, turn: 12 });
  assert.equal(manual.maxSpeed, 157.5);
  assert.equal(manual.turnRate, 3);
  assert.equal(manual.acceleration, 157.5 * .75);
  assert.equal(manual.braking, 157.5 * 1.2);
  assert.equal(motion.profiles.tug().maxSpeed, 135);
  assert.equal(motion.profiles.tug().turnRate, 1.35);
  assert.equal(motion.profiles.civilian({ speedOrOtherStationValue: 40 }).maxSpeed, 120);
  assert.equal(motion.profiles.combat(18, 100).maxSpeed, 80);
  assert.equal(motion.profiles.combat(52, 100).turnRate, .7);
  assert.equal(motion.profiles.cruise(900, 2).braking, 1440);
});

test('turning in place, waypoint progression and final braking use the shared path follower', () => {
  const { motion } = fixture();
  const ship = pose('tug', { heading: -Math.PI / 2 });
  const path = [{ x: 180, y: 0 }, { x: 180, y: 240 }];
  const profile = motion.profiles.tug();
  motion.step(ship, { goal: path[0], hold: true }, { ...profile, turnRate: .45 }, 1);
  near(ship.heading, -Math.PI / 2 + .45, 'docking turn rate');
  assert.equal(ship.x, 0);assert.equal(ship.y, 0);assert.equal(ship.speed, 0);
  let index = 0, progress = 0, result;
  for (let i = 0; i < 2000; i++) {
    result = motion.followPath(ship, path, index, profile, .02, { start: { x: 0, y: 0 } });
    index = result.index;progress = result.progress;
    if (result.arrived) break;
  }
  assert.equal(index, 1);
  assert.equal(result.arrived, true);
  assert.ok(Math.hypot(ship.x - 180, ship.y - 240) <= profile.arrivalRadius);
  assert.ok(progress > .98 && progress <= 1);
  assert.equal(ship.speed, 0);
});

test('shared mining approach stops at its requested world-space clearance', () => {
  const { motion } = fixture();
  const ship = pose('civilian'), rock = { x: 100, y: 0 };
  let result;
  for (let i = 0; i < 1000; i++) {
    result = motion.step(ship, { goal: rock, arrivalRadius: 85, stopAtRadius: true, snap: false, braking: false }, motion.profiles.civilian({ speedOrOtherStationValue: 40 }), .02);
    if (result.arrived) break;
  }
  assert.equal(result.arrived, true);
  near(ship.x, 15, 'mining standoff');
  assert.equal(ship.speed, 0);
  assert.deepEqual(rock, { x: 100, y: 0 }, 'motion cannot mine or change the asteroid');
});

test('combat steering limits vector acceleration and remembers angular momentum through save/load', () => {
  const { motion } = fixture();
  const profile = motion.profiles.combat(18, 100);
  const ship = pose('civilian', { speed: 30, vx: 30, vy: 0 });
  const command = { heading: Math.PI / 2, throttle: .9, engineFactor: .7, turnFactor: .7 };
  const before = { x: ship.vx, y: ship.vy };
  motion.step(ship, command, profile, .1);
  assert.ok(Math.hypot(ship.vx - before.x, ship.vy - before.y) <= profile.acceleration * .7 * .1 + 1e-8);
  assert.ok(ship.heading > 0 && ship.heading <= profile.turnRate * .7 * .1);
  assert.ok(ship.speed <= profile.maxSpeed * .7);
  const restored = plain(ship);
  for (let i = 0; i < 50; i++) for (const vessel of [ship, restored]) motion.step(vessel, command, profile, .02);
  assert.deepEqual(plain(ship), restored);
  const legacy = pose('civilian', { combatAI: { angularVelocity: .4 } });
  motion.step(legacy, command, profile, .01);
  assert.ok(legacy.motionAngularVelocity > 0, 'old saved angular state remains accepted');
});

test('pause, invalid time and invalid targets never mutate ship state', () => {
  const { motion } = fixture();
  const ship = pose('player', { speed: 40 }), before = structuredClone(ship);
  for (const dt of [0, -1, NaN, Infinity]) {
    motion.step(ship, { throttle: 1, turn: 1 }, motion.profiles.manual({ speedOrOtherStationValue: 40, turn: 12 }), dt);
    motion.followPath(ship, [{ x: 10, y: 10 }], 0, motion.profiles.tug(), dt);
    assert.deepEqual(ship, before);
  }
  for (const goal of [{ x: NaN, y: 0 }, { x: 10, y: Infinity }]) {
    motion.step(ship, { goal }, motion.profiles.civilian({ speedOrOtherStationValue: 40 }), .1);
    motion.followPath(ship, [{ x: 10, y: 10 }, goal], 0, motion.profiles.tug(), .1);
    assert.deepEqual(ship, before);
  }
});

test('combat AI decides without moving, then delegates steering and coasting to the shared integrator', () => {
  const { motion, window } = fixture({ ai: true });
  const ai = window.nativeCivilianCombatAI;
  const ship = pose('civilian', { id: 2, shipType: 47, hull: 100, shields: 100, combatRadius: 12, cruiseSpeed: 120 });
  const target = { x: 200, y: 80, heading: .5, speed: 20, hull: 100, shields: 100 };
  const dispute = { b: 3, anchor: { x: 0, y: 0 }, pending: [] };
  const scene = { clock: 0, dt: .02, hull: 100, shields: 100, rocks: [], bystanders: [], bodies: [] };
  ai.begin(ship, 'claimant', 0);
  const before = [ship.x, ship.y, ship.heading, ship.speed, ship.vx, ship.vy];
  const command = ai.decide(ship, target, dispute, scene);
  assert.ok(Number.isFinite(command.heading));
  assert.deepEqual([ship.x, ship.y, ship.heading, ship.speed, ship.vx, ship.vy], before);
  const step = motion.step, calls = [];
  motion.step = (...args) => { calls.push(args);return step(...args); };
  ai.steer(ship, target, dispute, scene);
  assert.equal(calls.length, 1);
  assert.ok(ship.speed > 0);
  const paused = plain(ship);
  ai.steer(ship, target, dispute, { ...scene, dt: 0 });
  ai.coast(ship, 0);
  assert.deepEqual(plain(ship), paused);
  ai.coast(ship, .1);
  assert.equal(calls.at(-1)[1].coast, true);
  assert.ok(ship.speed < paused.speed);
});

test('new NPC definitions can configure combat movement without replacing shared mechanics', () => {
  const { motion, window, definitions } = fixture({ ai: true });
  const movement={maxSpeed:31,acceleration:17,braking:20,turnRate:.4,inertial:true};
  definitions.register(9001,{hull:100,shields:100,profiles:{civilian:{combatMovement:movement}}});
  const ship=pose('civilian',{id:1,shipType:9001,hull:100,shields:100,combatRadius:10});
  const target={x:200,y:40,hull:100,shields:100},scene={dt:.1,clock:0,hull:100,shields:100,rocks:[],bystanders:[]};
  const step=motion.step;let selected;
  motion.step=(entity,command,profile,dt)=>{selected=profile;return step(entity,command,profile,dt);};
  window.nativeCivilianCombatAI.steer(ship,target,{b:2,anchor:{x:0,y:0},pending:[]},scene);
  assert.equal(selected,movement);
  assert.ok(ship.speed<=movement.acceleration*.1+1e-8);
  assert.ok(ship.heading<=movement.turnRate*.1+1e-8);
});
