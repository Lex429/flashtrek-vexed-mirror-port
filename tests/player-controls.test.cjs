const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../html-games/broken-mirror-port/player-combat-controls.js'), 'utf8'), {window});
  let target = 'civilian:8', allowed = true, requests = 0;
  const controls = window.nativePlayerCombatControls;
  const held = controls.heldFire({targetKey: () => target, allowed: () => allowed, request: () => ++requests});
  return {held, controls, target: value => {target = value;}, allow: value => {allowed = value;}, requests: () => requests};
}

test('held fire requests once per host frame and never catches up after a slow frame', () => {
  const f = fixture();
  f.held.start(1);
  for (let i = 0; i < 120; i++) f.held.step(1);
  assert.equal(f.requests(), 1);
  f.held.step(1000);
  assert.equal(f.requests(), 2);
  f.held.step(1000);
  assert.equal(f.requests(), 2);
  f.held.stop();
  f.held.start(1000);
  assert.equal(f.requests(), 2, 'a new key press in the same frame cannot request another shot');
  f.held.step(1001);
  assert.equal(f.requests(), 3);
});

test('losing or changing a lock permanently stops this hold instead of redirecting it', () => {
  for (const replacement of [null, 'civilian:9']) {
    const f = fixture();
    f.held.start(1);
    f.target(replacement);
    f.held.step(2);
    assert.equal(f.held.active, false);
    f.target('civilian:8');
    f.held.step(3);
    assert.equal(f.requests(), 1);
    f.held.start(4);
    assert.equal(f.requests(), 2, 'a fresh press explicitly rearms the current lock');
  }
});

test('pause, menus, warp, disabling and focus gates clear intent until a fresh press', () => {
  const f = fixture();
  f.held.start(1);
  f.allow(false);
  f.held.step(2);
  assert.equal(f.held.active, false);
  f.allow(true);
  f.held.step(3);
  assert.equal(f.requests(), 1);
  f.held.start(4);
  f.held.stop();
  f.held.step(5);
  assert.equal(f.requests(), 2, 'key release stops sustained firing');
});

test('hostile ships lead targeting without making neutral ships or asteroids inaccessible', () => {
  const {controls} = fixture();
  const targets = [{key: 'rock:1', x: 10}, {key: 'civilian:neutral', x: 30}, {key: 'civilian:attacker', x: 500}];
  const sorted = controls.rankTargets(targets, {threats: new Set(['civilian:attacker']), visible: item => item.x < 400, distance: item => item.x});
  assert.deepEqual(Array.from(sorted, item => item.key), ['civilian:attacker', 'rock:1', 'civilian:neutral']);
});
