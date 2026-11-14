const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const plain=value=>structuredClone(value);
function setup(){
 const calls={hypots:0},math=Object.create(Math);math.hypot=(...args)=>{calls.hypots++;return Math.hypot(...args);};
 const window={},context=vm.createContext({window,Math:math});
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/ship-motion.js','utf8'),context);
 vm.runInContext(fs.readFileSync('tests/fixtures/reference-ship-contact.js','utf8'),context);
 return {window,calls};
}
const body=(extra={})=>({entity:{},x:0,y:0,previousX:-1,previousY:0,heading:0,vx:50,vy:0,angularVelocity:0,
 dimensions:{width:60,height:140},radii:{rx:100,ry:120},hullRadii:{rx:30,ry:70},definition:{mass:8},...extra});

test('retained hull support planes eliminate repeated projection work without changing a contact',()=>{
 const {window:w,calls}=setup(),a=body(),b=body({x:20,previousX:20,vx:0}),solve=w.nativeShipMotion.shipPairContact;
 calls.hypots=0;const first=solve(a,b,1/60),cold=calls.hypots;assert.ok(first);
 calls.hypots=0;const second=solve(a,b,1/60),warm=calls.hypots;
 assert.deepEqual(plain(second),plain(first));assert.equal(cold-warm,64);
});

test('an early separated pair computes only its tested hull projections',()=>{
 const {window:w,calls}=setup(),a=body({heading:Math.PI/2,previousX:0,vx:0}),b=body({heading:Math.PI/2,x:100,previousX:100,vx:0}),solve=w.nativeShipMotion.shipPairContact;
 calls.hypots=0;assert.equal(solve(a,b,1/60),null);const cold=calls.hypots;
 calls.hypots=0;assert.equal(solve(a,b,1/60),null);assert.equal(cold-calls.hypots,2);
});

test('cached contacts exactly retain the original result through pose, hull, shield, mass and spin changes',()=>{
 const {window:w}=setup(),solve=w.nativeShipMotion.shipPairContact,reference=w.referenceShipPairContact,a=body(),b=body();let seed=53371,hits=0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<600;i++){
  for(const ship of [a,b]){const rx=3+random()*100,ry=5+random()*150;Object.assign(ship,{x:random()*240-120,y:random()*240-120,heading:random()*Math.PI*2,vx:random()*1000-500,vy:random()*1000-500,angularVelocity:random()*8-4});ship.previousX=ship.x-ship.vx/30;ship.previousY=ship.y-ship.vy/30;ship.dimensions={width:rx*2,height:ry*2};Object.assign(ship.hullRadii,{rx,ry});Object.assign(ship.radii,{rx:rx*3,ry:ry*3});ship.definition.mass=1+random()*40;}
  const dt=i%2?1/60:.2,expected=reference(a,b,dt),actual=solve(a,b,dt);if(expected)hits++;
  assert.deepEqual(plain(actual),plain(expected),'Changed contact at sample '+i);
  assert.deepEqual(plain(solve(a,b,dt)),plain(expected),'Changed retained contact at sample '+i);
 }
 assert.ok(hits>100,'The reference comparison did not exercise enough actual contacts');
});
