const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const test=require('node:test');
const root=path.join(__dirname,'../html-games/flashtrek-broken-mirror');
function fixture({blue={basic:0},greenHP=4000}={}){
  const window={},storage=new Map();
  const context=vm.createContext({window,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
  for(const name of ['repair-drone-fleet.js','drone-battle.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context);
  let health=greenHP,elapsed=0,recalling=false,threats=[],losses=0;
  const worker=()=>({id:0,role:'repair',health,maxHealth:greenHP,position:{x:540,y:253}});
  const repair={target:()=>health&&!recalling?worker():null,snapshot:()=>({drones:[worker()],elapsed,recalling,outcome:health?'repairing':'failed'}),
    hit:(id,amount)=>{if(!health)return {hit:false};const damage=Math.min(amount,health);health-=damage;return {hit:true,damage,destroyed:!health};},setThreats:t=>{threats=t;}};
  const battle=window.droneBattle.create({repair,defense:blue,born:0,geometry:{source:{centerX:135,centerY:425,w:58,h:88,a:1.17},layout:{x:540,y:253}},onDestroyed:()=>losses++});
  const advance=(seconds)=>{for(let i=0;i<seconds*60;i++){elapsed+=1000/60;battle.advance(elapsed);}};
  return {battle,planWave:window.droneBattle.planWave,advance,health:()=>health,threats:()=>threats,losses:()=>losses,recall:()=>{recalling=true;battle.recall();}};
}
test('automatic waves match fleet quality and capacity without changing saved choices or weapon profiles',()=>{
  const {planWave}=fixture(),plain=value=>JSON.parse(JSON.stringify(value));
  const base={owned:{basic:1,upgraded:0,advanced:0},defense:{basic:0,upgraded:0,advanced:0},wave:{basic:2,upgraded:0,advanced:0}};
  assert.deepEqual(plain(planWave(base)),base.wave);
  const fast={...base,owned:{basic:0,upgraded:0,advanced:7},defense:{basic:0,upgraded:0,advanced:1}};
  const before=JSON.stringify(fast),wave=planWave(fast);assert.equal(wave.advanced,7);
  assert.equal(JSON.stringify(fast),before);
  const escorts={...base,defense:{basic:0,upgraded:0,advanced:7}},strong=planWave(escorts);
  assert.equal(Object.values(strong).reduce((a,b)=>a+b),8);assert.ok(strong.advanced>0);
  const manual={...base,wave:{basic:0,upgraded:0,advanced:8}};
  assert.deepEqual(plain(planWave(manual)),manual.wave,'explicit stronger enemies are never downgraded');
  assert.deepEqual(plain(planWave({...fast,wave:{basic:0,upgraded:0,advanced:0}})),{basic:0,upgraded:0,advanced:0},'an empty wave stays disabled');
});
test('damage requires a traveling projectile contact; shot cadence and target roles are recorded',()=>{
  const f=fixture();assert.equal(f.battle.launchWave({basic:2},0),true);
  f.advance(1);assert.equal(f.battle.snapshot().metrics.fired,0);assert.equal(f.health(),4000);
  f.advance(12);const s=f.battle.snapshot();assert.ok(s.metrics.fired>0&&s.metrics.hits>0);
  assert.equal(4000-f.health(),s.metrics.repairDamage);
  assert.ok(s.events.every(e=>e.targetRole==='repair'&&e.role==='attack'&&e.damage===7));
  assert.ok(s.drones.every(d=>d.targetId===0),'hunters prioritize green workers');
  assert.ok(f.threats().length===2);assert.ok(s.shots.length<=128);
});
test('defenders intercept hunters and reduce damage to the same worker',()=>{
  const lone=fixture(),guarded=fixture({blue:{advanced:1}});
  for(const f of [lone,guarded]){f.battle.launchWave({basic:2},0);f.advance(20);}
  const s=guarded.battle.snapshot();assert.ok(s.metrics.attackDamage>0);assert.ok(s.metrics.defenseDamage>0);
  assert.ok(guarded.health()>lone.health());assert.ok(s.drones.filter(d=>d.role==='attack').every(d=>d.health===0));
  assert.ok(s.events.some(e=>e.role==='defense'&&e.targetRole==='attack'));
  assert.equal(s.waveActive,false);
});
test('owned deaths notify once, cannot be hit after death, and recall ends deployment',()=>{
  const f=fixture({blue:{basic:1}});f.advance(1);
  const blue=f.battle.snapshot().drones[0];assert.equal(f.battle.hit(blue.id,10000).destroyed,true);
  assert.equal(f.battle.hit(blue.id,10000).hit,false);assert.equal(f.losses(),1);
  assert.equal(f.battle.target(blue.id),null);
  const recalled=fixture({blue:{advanced:1}});recalled.advance(4);recalled.recall();recalled.advance(10);
  assert.equal(recalled.battle.isBusy(),false);assert.equal(recalled.battle.snapshot().drones[0].phase,'docked');
});
test('a defender physically blocks a projectile originally aimed at a worker',()=>{
  const f=fixture({blue:{advanced:4}});f.battle.launchWave({advanced:4},0);f.advance(20);
  const s=f.battle.snapshot(),blocks=s.events.filter(e=>e.intercepted);
  assert.ok(s.metrics.interceptions>0&&blocks.length>0);
  for(const e of blocks){
    assert.equal(e.targetRole,'defense');
    assert.ok(Math.hypot(e.position.x-e.targetPosition.x,e.position.y-e.targetPosition.y)<=11.00001,'damage occurs at the swept bolt/body contact');
  }
});
test('observation and painting cannot advance combat or spend health',()=>{
  const f=fixture();f.battle.launchWave({advanced:3},0);f.advance(8);
  const before=JSON.stringify(f.battle.snapshot());for(let i=0;i<50;i++){f.battle.snapshot();f.battle.target('red-0');}
  assert.equal(JSON.stringify(f.battle.snapshot()),before);
  const positions=f.battle.snapshot();positions.drones[0].position.x=0;positions.shots.forEach(s=>s.position.x=0);
  assert.equal(JSON.stringify(f.battle.snapshot()),before);
});
