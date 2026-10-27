const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){const window={};const context=vm.createContext({window});for(const file of ['ship-motion.js','player-combat-controls.js','weapon-rules.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',file),'utf8'),context);return window;}
const plain=v=>JSON.parse(JSON.stringify(v));
const profile={maxSpeed:100,acceleration:75,braking:120,turnRate:2};
const ship=()=>({id:'player',system:1,x:0,y:0,angle:0,speed:0,vx:0,vy:0});
function tick(w,s,command,frames){for(let i=0;i<frames;i++)w.nativeShipMotion.step(s,command,profile,1/60);}

test('reverse brakes through zero, backs up, coasts and returns to forward thrust; full stop reaches exact rest',()=>{
  const w=setup(),s=ship();tick(w,s,{throttle:1},60);assert.ok(s.vx>70);
  tick(w,s,{reverse:true},10);assert.ok(s.vx>0&&s.vx<60,'reverse first brakes forward momentum');
  tick(w,s,{reverse:true},100);assert.equal(s.motionReverse,true);assert.ok(s.vx<-40&&s.speed<=45.0001);
  const x=s.x;tick(w,s,{},30);assert.ok(s.x<x&&s.motionReverse,'released reverse coasts backwards');
  const restored=plain(s);tick(w,restored,{throttle:1},100);assert.ok(restored.vx>50&&!restored.motionReverse);
  tick(w,s,{brake:true,brakeFactor:2},120);assert.equal(s.speed,0);assert.equal(Math.hypot(s.vx,s.vy),0);
});

test('S and Down stop and stay stopped until a fresh press requests reverse',()=>{
  for(const key of ['KeyS','ArrowDown']){
    const w=setup(),s=ship(),controls=w.nativePlayerCombatControls.flightControls(),active=new Set();
    const advance=frames=>{for(let i=0;i<frames;i++)w.nativeShipMotion.step(s,controls.command(s,k=>active.has(k)),profile,1/60);};
    tick(w,s,{throttle:1},60);active.add(key);advance(120);
    assert.equal(s.speed,0);assert.equal(s.vx,0);assert.equal(s.motionReverse,false);
    const x=s.x;advance(180);assert.equal(s.x,x,'continuing to hold the brake must not start reverse');
    active.clear();advance(1);active.add(key);advance(90);
    assert.ok(s.motionReverse&&s.vx<-40,'a fresh press at rest starts reverse');
    active.clear();advance(1);active.add(key);advance(120);
    assert.equal(s.speed,0,'a fresh press while backing up brakes too');
    const reverseStop=s.x;advance(120);assert.equal(s.x,reverseStop);
    active.clear();advance(1);active.add('KeyW');advance(60);assert.ok(s.vx>70,'forward thrust starts from rest');
  }
});

test('stop overrides thrust and cancels an active reverse press until release',()=>{
  const w=setup(),s=ship(),controls=w.nativePlayerCombatControls.flightControls(),active=new Set(['KeyS']);
  const advance=frames=>{for(let i=0;i<frames;i++)w.nativeShipMotion.step(s,controls.command(s,k=>active.has(k)),profile,1/60);};
  advance(60);assert.ok(s.motionReverse);
  active.add('KeyX');active.add('KeyW');advance(120);assert.equal(s.speed,0);
  active.delete('KeyX');advance(120);assert.equal(s.speed,0,'held S stays a stop even with W held');
  controls.reset();assert.equal(controls.command({...s,speed:50,vx:50},k=>active.has(k)).reverse,false,'reset reevaluates a held key safely');
});

test('quick turnaround makes one controlled half-turn per press, brakes, and can be cancelled with stop or a gate reset',()=>{
  const w=setup(),s=ship(),controls=w.nativePlayerCombatControls.flightControls();tick(w,s,{throttle:1},60);
  let active=new Set(['KeyQ']);
  for(let i=0;i<160;i++)w.nativeShipMotion.step(s,controls.command(s,key=>active.has(key)),profile,1/60);
  assert.ok(Math.abs(w.nativeShipMotion.wrap(s.angle-Math.PI))<.04);assert.equal(s.speed,0);
  const angle=s.angle;active.clear();controls.command(s,key=>active.has(key));active.add('KeyQ');
  assert.ok(controls.command(s,key=>active.has(key)).heading!==undefined);
  active.add('KeyX');assert.equal(controls.command(s,key=>active.has(key)).heading,undefined);
  controls.reset();active.clear();assert.equal(controls.command(s,key=>active.has(key)).heading,undefined);assert.equal(s.angle,angle);
});

test('smart Shift remembers attackers between volleys, always ranks them ahead of nearby rocks, then returns to nearest distance',()=>{
  const w=setup(),api=w.nativePlayerCombatControls,m=api.smartTargeting();
  const targets=[{key:'asteroid:1',kind:'asteroid',d:5},{key:'civilian:neutral',d:10},{key:'civilian:enemy',d:800}];
  m.incoming('civilian:enemy',1);
  for(const at of [1,2,6.99]){
    const threats=m.threats(at),ordered=api.rankTargets(targets.slice(),{threats,distance:t=>t.d});
    assert.equal(m.choose(ordered,{at,current:null,threats}).key,'civilian:enemy');
  }
  const threats=m.threats(7.01),ordered=api.rankTargets(targets.slice(),{threats,distance:t=>t.d});
  assert.equal(m.choose(ordered,{at:7.01,current:null,threats}).key,'asteroid:1');
  assert.equal(api.rankTargets(targets.slice(),{threats:new Set(),visible:t=>t.d>20,distance:t=>t.d})[0].key,'asteroid:1');
});

test('quick repeated Shift taps cycle deliberately, isolated presses pick nearest, and battle interrupts a mining lock',()=>{
  const w=setup(),api=w.nativePlayerCombatControls,m=api.smartTargeting(),targets=[{key:'asteroid:a',d:5},{key:'asteroid:b',d:20},{key:'civilian:enemy',d:100}];
  let current=m.choose(targets,{at:1,current:null}).key;assert.equal(current,'asteroid:a');
  current=m.choose(targets,{at:1.2,current}).key;assert.equal(current,'asteroid:b');
  assert.equal(m.choose(targets,{at:3,current}).key,'asteroid:a');
  assert.equal(api.rankTargets(targets.slice(),{threats:new Set(),miningKey:'asteroid:b',distance:t=>t.d})[0].key,'asteroid:b');
  assert.equal(api.rankTargets(targets.slice(),{threats:new Set(['civilian:enemy']),miningKey:'asteroid:b',distance:t=>t.d})[0].key,'civilian:enemy');
});

test('extended weapons aim independently of the nose and permit a shot into an obstructed line',()=>{
  const r=setup().nativeWeaponRules,source={id:'player',heading:0,x:0,y:0},target={id:'enemy',x:-800,y:0,vx:0,vy:0};
  for(const kind of ['beam','torpedo','disruptor']){
    const spec=r.weaponSpec({damage:10},kind);assert.ok(spec.range>=900);
    assert.equal(r.firingStatus(source,target,spec,kind,{rocks:[{x:-100,y:0,size:40}],bystanders:[]}).ok,true);
    assert.equal(r.firingStatus(source,{...target,x:-spec.range-20},spec,kind,{rocks:[],bystanders:[]}).ok,false);
  }
});

test('distant beam misses are physical, deterministic and saved; nearby hits and intervening surfaces stay accurate',()=>{
  const r=setup().nativeWeaponRules,spec=r.weaponSpec({damage:10},'beam'),source={id:'player',heading:0,x:0,y:0};
  const targetAt=x=>({id:'enemy',x,y:0,previousX:x,previousY:0,heading:0,shields:10,radii:{rx:10,ry:10},dimensions:{width:20,height:20}});
  function hits(distance){const target=targetAt(distance);let hits=0;
    for(let i=0;i<200;i++){
      const event=r.startShot({damage:10},'beam',source,target,i*.31,0,spec),scene={rocks:[],bystanders:[]};
      const result=r.beamTrace(event,source,target,scene),restored=r.beamTrace(plain(event),source,target,scene);
      assert.equal(result.kind,restored.kind);if(result.kind==='hit')hits++;
    }return hits;
  }
  assert.equal(hits(150),200);const far=hits(1050);assert.ok(far>10&&far<150,`long-range physical hit count ${far}`);
  const target=targetAt(250),event=r.startShot({damage:10},'beam',source,target,0,0,spec);
  const blocked=r.beamTrace(event,source,target,{rocks:[{slotId:1,x:100,y:0,size:40}],bystanders:[]});assert.equal(blocked.target.rockId,1);
});

test('Rebirth-style nearby separation keeps thrust instead of braking for a soft clearance margin',()=>{
  const m=setup().nativeShipMotion,descriptor={id:1,category:'civilian',system:1,x:0,y:0,heading:0,vx:100,vy:0,radii:{rx:15,ry:20},dimensions:{width:30,height:40},definition:{mass:8},entity:{}};
  const neighbor={...descriptor,id:2,x:80,y:65,vx:0,vy:0,entity:{phase:'docked'}};
  const command=m.avoidShips(descriptor,[neighbor],{heading:0,throttle:1},profile);
  assert.ok(!command.brake);assert.ok(command.throttle>0);assert.ok(command.heading<0,'separation steers away from the nearby hull');
});
