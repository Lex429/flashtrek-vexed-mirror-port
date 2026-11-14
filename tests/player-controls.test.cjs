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

test('a forward-fire hold cannot inherit an acquired lock or resume when that lock is cleared',()=>{
  const f=fixture();f.target('forward');assert.equal(f.held.start(1),1);
  f.held.step(2);assert.equal(f.requests(),2);
  f.target('civilian:8');f.held.step(3);assert.equal(f.held.active,false);
  f.held.start(4);assert.equal(f.requests(),3);
  f.target('forward');f.held.step(5);assert.equal(f.held.active,false);
  f.held.step(6);assert.equal(f.requests(),3);
  f.held.start(7);assert.equal(f.requests(),4);
});

test('hostile ships lead targeting without making neutral ships or asteroids inaccessible', () => {
  const {controls} = fixture();
  const targets = [{key: 'rock:1', x: 10}, {key: 'civilian:neutral', x: 30}, {key: 'civilian:attacker', x: 500}];
  const sorted = controls.rankTargets(targets, {threats: new Set(['civilian:attacker']), visible: item => item.x < 400, distance: item => item.x});
  assert.deepEqual(Array.from(sorted, item => item.key), ['civilian:attacker', 'rock:1', 'civilian:neutral']);
});

test('nose intent beats a closer side target while sideways or reverse velocity never changes the aim',()=>{
 const {controls:c}=fixture(),targets=[{key:'ahead',entry:{x:700,y:0}},{key:'side',entry:{x:0,y:100}}];
 for(const velocity of [{vx:0,vy:400},{vx:-400,vy:0},{vx:0,vy:0}]){
  assert.equal(c.rankIntent(targets,{ship:{x:0,y:0,heading:0,...velocity}})[0].key,'ahead');
 }
 assert.equal(c.rankIntent(targets,{ship:{x:0,y:0,heading:Math.PI/2}})[0].key,'side');
});

test('combat picks attackers ahead, with an imminent rearward impact able to override a less immediate threat',()=>{
 const {controls:c}=fixture(),ship={x:0,y:0,heading:0},targets=[{key:'rock',kind:'asteroid',entry:{x:70,y:0}},{key:'front',entry:{x:650,y:50}},{key:'rear',entry:{x:-400,y:0}}];
 const threats=new Set(['front','rear']);
 assert.equal(c.rankIntent(targets,{ship,threats,mining:true})[0].key,'front');
 assert.equal(c.rankIntent(targets,{ship,threats,urgency:new Map([['rear',300]]),mining:true})[0].key,'rear');
 assert.equal(c.rankIntent(targets.filter(t=>t.key!=='front'),{ship,threats})[0].key,'rear');
});

test('mining context, shared weapon reach and clear lines break otherwise similar nose choices',()=>{
 const {controls:c}=fixture(),ship={x:0,y:0,heading:0};
 const targets=[{key:'ship',entry:{x:240,y:0}},{key:'rock',kind:'asteroid',entry:{x:300,y:0}}];
 assert.equal(c.rankIntent(targets,{ship})[0].key,'ship');
 assert.equal(c.rankIntent(targets,{ship,mining:true})[0].key,'rock');
 const weapons=[{key:'blocked',entry:{x:300,y:0},weapon:{canReach:true,ready:true,clear:false}},{key:'clear',entry:{x:330,y:75},weapon:{canReach:true,ready:false,clear:true}}];
 assert.equal(c.rankIntent(weapons,{ship})[0].key,'clear','a recharging weapon does not make an otherwise clear target unavailable');
});

test('directional cycling holds its order while scores change, skips lost targets, and resets on a deliberate turn',()=>{
 const memory=fixture().controls.smartTargeting(),a={key:'a'},b={key:'b'},c={key:'c'};
 assert.equal(memory.choose([a,b,c],{at:1,current:null,heading:0}).key,'a');
 assert.equal(memory.peek([c,a,b],{at:1.5,current:'a',heading:0}).key,'b');
 assert.equal(memory.peek([c,a,b],{at:1.5,current:'a',heading:0}).key,'b','preview never consumes a cycle step');
 assert.equal(memory.choose([c,a,b],{at:1.5,current:'a',heading:0}).key,'b');
 assert.equal(memory.choose([c,b],{at:1.7,current:'b',heading:0}).key,'c');
 assert.equal(memory.choose([b,c],{at:1.8,current:'c',heading:Math.PI/2}).key,'b');
});

test('attention expires on simulation time and incoming danger interrupts a quiet cycle',()=>{
 const memory=fixture().controls.smartTargeting();memory.attention('a',2,'mine');
 assert.equal(memory.focus(11).kind,'mine');assert.equal(memory.focus(12.01),null);
 memory.choose([{key:'a'},{key:'b'}],{at:2,current:null,heading:0});
 assert.equal(memory.choose([{key:'enemy'},{key:'a'},{key:'b'}],{at:2.1,current:'a',heading:0,threats:new Set(['enemy'])}).key,'enemy');
  const battle=fixture().controls.smartTargeting();battle.choose([{key:'a'},{key:'b'},{key:'enemy'}],{at:1,current:null,heading:0,threats:new Set(['a'])});
  assert.equal(battle.choose([{key:'enemy'},{key:'a'},{key:'b'}],{at:1.1,current:'a',heading:0,threats:new Set(['a','enemy']),activeThreats:new Set(['enemy'])}).key,'enemy','an existing candidate that starts attacking interrupts the old cycle');
});

test('controller trigger uses analog press edges, never cycles while held, and consumes a blocked press until release',()=>{
 const c=fixture().controls;let count=0,allowed=true;
 const trigger=c.targetTrigger({allowed:()=>allowed,acquire:()=>++count});
 trigger.update(.64);assert.equal(count,0);trigger.update(.7);
 for(let i=0;i<100;i++)trigger.update(1);assert.equal(count,1);
 trigger.update(.5);trigger.update(.7);assert.equal(count,1);
 trigger.update(0);allowed=false;trigger.update(1);allowed=true;trigger.update(1);assert.equal(count,1);
 trigger.update(.2);trigger.update(.8);assert.equal(count,2);
});

test('remembered threat priority fades while a live attacker keeps priority',()=>{
 const c=fixture().controls,m=c.smartTargeting(),ship={x:0,y:0,heading:0},targets=[{key:'old',entry:{x:-350,y:0}},{key:'ahead',entry:{x:400,y:0}}];
 m.incoming('old',0);let previous=Infinity;
 for(const at of [0,2,4,5.9]){
  const weights=new Map([['old',m.threatWeight('old',at)]]),rows=c.rankIntent(targets,{ship,threats:m.threats(at),threatWeights:weights});
  const score=rows.find(t=>t.key==='old').score;assert.ok(score<previous);previous=score;
  if(at===5.9){assert.equal(rows[0].key,'ahead');assert.equal(c.rankIntent(targets,{ship,threats:m.threats(at),threatWeights:weights,liveThreats:new Set(['old'])})[0].key,'old');}
 }
});

test('cycling alone learns nothing; firing or mining confirms only a short-lived correction',()=>{
 const c=fixture().controls,targets=[{key:'a'},{key:'b'}];
 for(const action of ['combat','mine']){
  const m=c.smartTargeting();m.choose(targets,{at:1,current:null,heading:0});m.choose(targets,{at:1.1,current:'a',heading:0});m.attention('b',1.15);
  assert.equal(m.correction(1.15),null);m.attention('b',1.2,action);
  const correction=m.correction(1.2);assert.deepEqual(Array.from(correction.skipped),['a']);assert.equal(correction.chosen,'b');
  const options={ship:{x:0,y:0,heading:0}},choices=[{key:'a',entry:{x:300,y:0}},{key:'b',entry:{x:300,y:3}}];
  assert.equal(c.rankIntent(choices,{...options,correction})[0].key,'b');assert.ok(m.correction(5).strength<correction.strength);
  assert.equal(m.correction(9.3),null);assert.equal(c.rankIntent(choices,{...options,correction:m.correction(9.3)})[0].key,'a');
  m.reset();assert.equal(m.correction(2),null);
 }
});

test('honouring a preview makes it the first cycle entry instead of skipping the runner-up',()=>{
 const m=fixture().controls.smartTargeting(),targets=[{key:'b'},{key:'a'},{key:'c'}];
 assert.equal(m.choose(targets,{at:1,current:null,heading:0,preferredKey:'a'}).key,'a');
 assert.equal(m.choose(targets,{at:1.1,current:'a',heading:0}).key,'b');
});
