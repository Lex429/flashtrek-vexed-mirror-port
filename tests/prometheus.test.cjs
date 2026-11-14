const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../html-games'),plain=value=>JSON.parse(JSON.stringify(value));
function fixture({workerProfiles=false}={}){
 const w={console,document:{hidden:false}};w.window=w;vm.createContext(w);
 const load=(folder,name)=>vm.runInContext(fs.readFileSync(path.join(root,folder,name+'.js'),'utf8'),w,{filename:name+'.js'});
 for(const name of ['cthia-effects','olympic-effects','tug-effects','constitution-tug-effects','starter-effects','earth-profiles','federation-profiles','new-ship-profiles','orion-profiles','klingon-profiles','romulan-profiles','vulcan-profiles','cardassian-profiles','ferengi-dominion-profiles','independent-profiles','earth-effects','bioship-effects','lifeform-effects'])load('flashtrek-broken-mirror',name);
 load('flashtrek-broken-mirror','constitution-showcase-lights');load('flashtrek-broken-mirror','constitution-damage');
 for(const name of ['world-data','orion-world','flight-reference-data','weapon-catalog','simulation-clock','ship-motion','ship-scale-settings','ship-definitions','constitution-ships','federation-ships','orion-ships','prometheus-artwork','prometheus-definitions','weapon-loadout','weapon-rules','ship-damage','ship-systems']){
  if(workerProfiles&&name==='prometheus-definitions')w.starterShips=new Map(Array.from(w.starterShips,([id,p])=>[id,{width:p.width,height:p.height,displayRatio:p.displayRatio}]));
  load('broken-mirror-port',name);
 }
 w.vexedSolFlight={shipPosition:s=>({x:s.x,y:s.y})};
 w.nativeShipEffects={hit(){},prepare:()=>Promise.resolve({assets:[{}]})};
 w.nativeCombatShots={contact:(d,from,size,shielded)=>({world:{x:d.x,y:d.y},local:{x:0,y:0},shielded})};
 load('broken-mirror-port','prometheus-loadouts');load('broken-mirror-port','prometheus-tactics');load('broken-mirror-port','prometheus-effects');load('broken-mirror-port','prometheus-mvam');
 const d=w.nativeShipDefinitions.get(37),s={system:2,shipType:37,x:100,y:200,angle:-Math.PI/2,hull:d.hull*.8,shields:d.shields*.6,phase:'flight',vx:0,vy:0,speed:0,civilianTraffic:{ships:[]},solEconomy:{freighters:[]}};
 w.nativeSimulation.ensure(s);w.nativeShipEquipment.ensure(s);w.nativeWeaponLoadout.refit(s,[1,10]);
 const step=seconds=>{for(let i=0;i<seconds*60;i++){w.nativeSimulation.advance(s,1/60);w.nativePrometheus.advance(s,1/60);}};
 return {w,s,step};
}

test('dimension-only worker profiles retain all Prometheus damage references and match foreground hull geometry',()=>{
 const foreground=fixture().w,worker=fixture({workerProfiles:true}).w;
 for(const id of [37,3701,3702,3703]){
  const definition=worker.nativeShipDefinitions.get(id),profile=worker.nativeShipDefinitions.artworkProfile(id);
  assert.equal(profile.artworkFrames.length,4);assert.deepEqual(plain(definition.artwork.frames),plain(foreground.nativeShipDefinitions.get(id).artwork.frames));
  assert.deepEqual(plain(definition.dimensions),plain(foreground.nativeShipDefinitions.get(id).dimensions));
  assert.deepEqual(plain(definition.emitters),plain(foreground.nativeShipDefinitions.get(id).emitters));
  assert.deepEqual(plain(worker.nativeShipDefinitions.validate(definition)),[]);
 }
});
test('all sections have four aligned artwork states, lamps, measured mounts and conserved mass without adding world crews',()=>{
 const {w}=fixture(),d=w.nativeShipDefinitions,parts=w.nativePrometheusDefinitions.parts;
 assert.equal(parts.length,3);assert.ok(!w.VexedMirrorWorld.ships.some(s=>[3701,3702,3703].includes(s.id)));
 assert.ok(Math.abs(parts.reduce((n,p)=>n+d.get(p.type).mass,0)-d.get(37).mass)<1e-10);
 for(const id of [37,3701,3702,3703]){const p=d.artworkProfile(id);assert.equal(p.artworkFrames.length,4);assert.ok(p.lights.length>0);assert.equal(p.shifts.length,4);assert.ok(p.shifts.every(frame=>frame[2]===p.width&&frame[3]===p.height));assert.ok(d.get(id).emitters.beam);}
});
test('the supplied layer crops retain one docking scale and place effects on the correct hulls',()=>{
 const {w}=fixture(),art=w.prometheusArtwork;
 assert.deepEqual(plain(art.packageAnchor),[512,1024]);
 for(const part of art.parts){
  const r=art.layout[part.key],profile=w.nativeShipDefinitions.artworkProfile(part.type);
  assert.equal(profile.width,r.width);assert.equal(profile.height,r.height);
  assert.ok(Math.abs(part.dimensions.width-art.parentDimensions.width*r.width/art.canvas.width)<1e-10);
  assert.ok(Math.abs(part.dimensions.height-art.parentDimensions.height*r.height/art.canvas.height)<1e-10);
  assert.ok(Math.abs(part.offset.x-((r.x+r.width/2)/art.canvas.width-.5))<1e-10);
  assert.ok(Math.abs(part.offset.y-((r.y+r.height/2)/art.canvas.height-.5))<1e-10);
  assert.equal(profile.effectPorts.engines.length,part.key==='top'?0:2);
  assert.ok(profile.effectPorts.rcs.length>=4);
 }
 assert.deepEqual(plain(art.parts.find(p=>p.key==='middle').offset),{x:0,y:0});
});
test('launch and recall preserve owned equipment, damaged hull and shields through shared movement',()=>{
 const {w,s,step}=fixture(),before={hull:s.hull,shields:s.shields,equipment:plain(s.shipEquipment)};
 assert.equal(w.nativePrometheus.activate(s).ok,true);assert.equal(w.nativeShipDefinitions.describe(s).shipType,3702);
 assert.equal(s.prometheus.sections.length,2);
 assert.equal(w.nativeShipEquipment.canChangeHull(s,7).ok,false);assert.equal(w.nativePrometheus.blockedTravel(s).ok,false);
 const fitted=[...w.nativeWeaponLoadout.equipped(s),...s.prometheus.sections.flatMap(e=>w.nativeWeaponLoadout.equipped(s,e))];assert.equal(new Set(fitted.map(v=>v.instance.id)).size,fitted.length,'Separate ships cannot share an equipped weapon');assert.ok(fitted.every(v=>s.shipEquipment.instances[v.instance.id]===v.instance));
 step(9);assert.equal(s.prometheus.mode,'deployed');
 w.nativePrometheus.recall(s);step(40);
 assert.equal(s.prometheus.mode,'joined');assert.equal(w.nativeShipDefinitions.describe(s).shipType,37);
 assert.ok(Math.abs(s.hull-before.hull)<1e-9);assert.ok(Math.abs(s.shields-before.shields)<1e-9);
 assert.deepEqual(plain(s.shipEquipment),before.equipment);
 assert.equal(w.nativePrometheus.allowed(s).ok,true,'Cooldown elapsed during this simulated interval');
});
test('destroyed escorts stay lost after recall and require repair before a new launch',()=>{
 const {w,s,step}=fixture(),initial=s.hull;
 w.nativePrometheus.activate(s);const lost=s.prometheus.sections[0],damage=lost.hull;
 w.nativeShipSystems.applyDamage(s,w.nativeShipSystems.resolve(s,lost.id,s.system),damage*3,{kind:'beam'});
 assert.equal(lost.phase,'destroyed');w.nativePrometheus.recall(s);step(40);
 assert.equal(s.prometheus.mode,'joined');assert.ok(Math.abs(s.hull-(initial-damage))<1e-9);
 assert.equal(s.prometheus.lost,1);assert.equal(w.nativePrometheus.allowed(s).ok,false);
 // Recall can finish at different physical times. Test the repair restriction
 // after its independent separation cooldown has expired.
 step(Math.max(0,(s.prometheus.cooldownUntil||0)-w.nativeSimulation.seconds(s))+1/60);
 assert.equal(w.nativePrometheus.allowed(s).ok,false);
 const beforeRepair=s.hull;s.hull=w.nativeShipDefinitions.forEntity(s,s).hull;w.nativePrometheus.repairProgress(s,beforeRepair);assert.equal(w.nativePrometheus.allowed(s).ok,true);
});
test('pause freezes section poses and JSON restoration preserves a deployed group without extra crews',()=>{
 const {w,s,step}=fixture();w.nativePrometheus.activate(s);step(3);
 const saved=JSON.stringify(s),restored=JSON.parse(saved);w.nativePrometheus.initialize(restored);
 assert.deepEqual(plain(w.nativePrometheus.snapshot(restored)),plain(w.nativePrometheus.snapshot(s)));
 w.nativePause={active:true};step(2);assert.equal(JSON.stringify(s),saved);
 assert.equal(w.nativePrometheus.active({...s,shipType:7}),false);
 const other={shipType:7,prometheus:plain(s.prometheus)};w.nativePrometheus.initialize(other);assert.equal(other.prometheus,undefined);
});
test('split modules inherit fitted hardware and rejoining retains device wear',()=>{
 const {w,s,step}=fixture(),eq=s.shipEquipment,engine=eq.instances[eq.slots.engineering[0]],shield=eq.instances[eq.slots.shield[0]];
 engine.modelId='advanced-engine';engine.condition=80;shield.modelId='advanced-shield';shield.condition=90;
 w.nativePrometheus.activate(s);
 for(const e of s.prometheus.sections){const bank=e.shipEquipment;assert.equal(bank.instances[bank.slots.engineering[0]].modelId,'advanced-engine');assert.equal(bank.instances[bank.slots.shield[0]].condition,90);}
 const alpha=s.prometheus.sections[0],alphaEngine=alpha.shipEquipment.instances[alpha.shipEquipment.slots.engineering[0]];alphaEngine.condition=40;
 w.nativePrometheus.recall(s);step(40);
 assert.equal(s.prometheus.mode,'joined');assert.equal(engine.condition,70);assert.equal(shield.condition,90);
});
test('split and docking preserve manual flight while accelerating and turning at ordinary and cruise speeds',()=>{
 for(const speed of [0,427.5,1600])for(const turn of [-1,1]){
  const {w,s}=fixture(),dt=1/60,profile={...w.nativeShipDefinitions.forEntity(s,s).movement,maxSpeed:Math.max(427.5,speed),acceleration:500,braking:700,...(speed>1000?{turnRate:.35}:{})};
  s.vx=Math.cos(s.angle)*speed;s.vy=Math.sin(s.angle)*speed;s.speed=speed;
  const input={throttle:1,turn,manualFlight:true},baseline=plain(s);
  const tick=()=>{
   w.nativeSimulation.advance(s,dt);w.nativeSimulation.advance(baseline,dt);
   assert.equal(w.nativePrometheus.playerCommand(s,input),input,'Recall must retain the exact pilot command');
   w.nativeShipSystems.move(s,s,'player',input,profile,dt);w.nativeShipSystems.move(baseline,baseline,'player',input,profile,dt);
   w.nativePrometheus.advance(s,dt);
   for(const field of ['x','y','vx','vy','angle'])assert.ok(Math.abs(s[field]-baseline[field])<1e-8,`${speed}/${turn}/${field}: MVAM changed pilot flight`);
  };
  tick();const hp=s.hull,shields=s.shields;assert.equal(w.nativePrometheus.activate(s).ok,true);
  for(let i=0;i<60*12&&s.prometheus.mode!=='deployed';i++)tick();assert.equal(s.prometheus.mode,'deployed');
  const cruise=s.localCruise={kind:'test-route'};w.nativePrometheus.recall(s);assert.equal(s.localCruise,cruise,'Recall must retain cruise');
  for(let i=0;i<60*12&&s.prometheus.mode!=='joined';i++)tick();
  assert.equal(s.prometheus.mode,'joined',`Could not join at ${speed} while turning ${turn}`);
  assert.ok(s.speed>(speed>1000?1200:50),`Joining slowed the ship unexpectedly: ${speed} -> ${s.speed}`);assert.ok(Math.abs(s.hull-hp)<1e-8&&Math.abs(s.shields-shields)<1e-8);
 }
});
test('the shared moving-frame integrator has identical relative motion under translation and rotation',()=>{
 const {w}=fixture(),m=w.nativeShipMotion,dt=1/60,profile={maxSpeed:160,acceleration:250,braking:350,turnRate:3};
 const a={x:0,y:0,heading:-Math.PI/2,vx:0,vy:0,speed:0},b=plain(a),anchor=t=>({x:t*1800,y:t*200,heading:-Math.PI/2+t*1.4,vx:1800,vy:200,omega:1.4});
 Object.assign(b,{vx:1800,vy:200});
 for(let i=0;i<240;i++){
  m.step(a,{velocity:{x:30,y:-12},heading:-Math.PI/2},profile,dt);
  const frame={from:anchor(i*dt),to:anchor((i+1)*dt)};
  m.step(b,{referenceFrame:frame,velocity:{x:30,y:-12},heading:-Math.PI/2},profile,dt);
  const local=m.framePose(b,frame);
  for(const field of ['x','y','vx','vy','heading'])assert.ok(Math.abs(local[field]-a[field])<1e-7,field);
 }
});
test('a moving docking save restores the same relative course and pause freezes its frame',()=>{
 const {w,s}=fixture(),dt=1/60;
 const tick=state=>{w.nativeSimulation.advance(state,dt);w.nativeShipSystems.move(state,state,'player',{throttle:1,turn:1,manualFlight:true},undefined,dt);w.nativePrometheus.advance(state,dt);};
 tick(s);w.nativePrometheus.activate(s);for(let i=0;i<720&&s.prometheus.mode!=='deployed';i++)tick(s);w.nativePrometheus.recall(s);
 for(let i=0;i<600&&s.prometheus.dockingAt==null;i++)tick(s);
 assert.ok(s.prometheus.dockingAt!=null);
 const restored=plain(s);w.nativePrometheus.initialize(restored);w.nativePause={active:true};const frozen=JSON.stringify(restored);w.nativePrometheus.advance(restored,dt);assert.equal(JSON.stringify(restored),frozen);w.nativePause.active=false;
 for(let i=0;i<900&&s.prometheus.mode!=='joined';i++){tick(s);tick(restored);assert.deepEqual(plain(w.nativePrometheus.snapshot(restored)),plain(w.nativePrometheus.snapshot(s)));}
 assert.equal(s.prometheus.mode,'joined');assert.equal(restored.prometheus.mode,'joined');
});
test('escorts manoeuvre independently, correct their spacing and show changing thrust through a course change',()=>{
 const {w,s,step}=fixture(),dt=1/60,records=[];w.nativePrometheus.activate(s);step(12);
 const initial=s.prometheus.sections.map(e=>({x:e.x,y:e.y}));step(2);
 assert.ok(s.prometheus.sections.every((e,i)=>Math.hypot(e.x-initial[i].x,e.y-initial[i].y)<.15),'A settled formation must not perform scripted swaying');
 let largestStep=0;
 const run=(command,seconds)=>{for(let i=0;i<seconds*60;i++){
  const previous=s.prometheus.sections.map(e=>({x:e.x,y:e.y}));
  w.nativeSimulation.advance(s,dt);w.nativeShipSystems.move(s,s,'player',command,undefined,dt);w.nativePrometheus.advance(s,dt);
  const frame={from:s.prometheus.lastLead,to:s.prometheus.lastLead};
  const escorts=s.prometheus.sections.map((e,j)=>{largestStep=Math.max(largestStep,Math.hypot(e.x-previous[j].x,e.y-previous[j].y));return {...w.nativeShipMotion.framePose(e,frame),distance:Math.hypot(e.x-s.x,e.y-s.y)};});
  if(i%6===0)records.push({escorts,fx:plain(w.nativePrometheusEffects.snapshot(s))});
 }};
 run({throttle:1,manualFlight:true},2);run({throttle:1,turn:1,manualFlight:true},1.5);run({throttle:1,turn:-1,manualFlight:true},1.5);run({brake:true,manualFlight:true},2);
 assert.ok(largestStep<25,'Course corrections must integrate continuously');
 assert.ok(records.every(r=>r.escorts.every(e=>e.distance<220)),'Escorts must remain near the pilot');
 assert.ok(records.some(r=>Math.abs(w.nativeShipMotion.wrap(r.escorts[0].heading-r.escorts[1].heading))>.08),'The pilots must not hold identical headings');
 for(let i=0;i<2;i++){
  const headings=records.map(r=>r.escorts[i].heading),x=records.map(r=>r.escorts[i].x),thrust=records.map(r=>r.fx.find(f=>f.id===s.prometheus.sections[i].id).thrust);
  assert.ok(Math.max(...headings)-Math.min(...headings)>.2,'Pursuit must visibly turn each hull');
  assert.ok(Math.max(...x)-Math.min(...x)>10,'Turn following must adjust the actual wing position');
  assert.ok(Math.max(...thrust)-Math.min(...thrust)>.15,'Visible thrust must react to manoeuvres');
 }
 w.nativePrometheus.recall(s);run({brake:true,manualFlight:true},40);assert.equal(s.prometheus.mode,'joined','Active escort flight must still dock exactly');
});
test('an active escort pursuit survives saving and pauses without changing its course',()=>{
 const {w,s,step}=fixture(),dt=1/60;w.nativePrometheus.activate(s);step(6);
 const tick=state=>{w.nativeSimulation.advance(state,dt);w.nativeShipSystems.move(state,state,'player',{throttle:1,turn:1,manualFlight:true},undefined,dt);w.nativePrometheus.advance(state,dt);};
 for(let i=0;i<100;i++)tick(s);
 const restored=plain(s);w.nativePrometheus.initialize(restored);
 for(let i=0;i<180;i++){tick(s);tick(restored);assert.deepEqual(plain(w.nativePrometheus.snapshot(restored)),plain(w.nativePrometheus.snapshot(s)));}
 const before=JSON.stringify(s),fx=plain(w.nativePrometheusEffects.snapshot(s));w.nativePause={active:true};w.nativePrometheus.advance(s,1);
 assert.equal(JSON.stringify(s),before);assert.deepEqual(plain(w.nativePrometheusEffects.snapshot(s)),fx);
});

test('each applied nozzle force accounts for translation and torque, and effects expose those exact firing levels',()=>{
 const {w,s}=fixture(),dt=1/60;
 for(const type of [37,3701,3702,3703]){
  const e={shipType:type,system:s.system,x:600,y:-400,heading:-.7,vx:25,vy:-14,hull:100,phase:'flight',motionAngularVelocity:.2};
  const profile=w.nativeShipDefinitions.forEntity(s,e,{category:'prometheus'}).movement;
  for(let n=0;n<50;n++){
   const before={x:e.x,y:e.y,vx:e.vx,vy:e.vy,heading:e.heading,omega:e.motionAngularVelocity};
   w.nativeShipSystems.move(s,e,'prometheus',{velocity:{x:70,y:-95},heading:-1.3},profile,dt);
   const a=e.motionActuation;assert.ok(a&&a.jets.every(j=>j.level>=0&&j.level<=1));
   let fx=0,fy=0,torque=0;
   for(const j of a.jets){const x=-j.dx*j.force*j.level,y=-j.dy*j.force*j.level;fx+=x;fy+=y;torque+=j.x*y-j.y*x;}
   const c=Math.cos(before.heading+Math.PI/2),sn=Math.sin(before.heading+Math.PI/2),ax=(fx*c-fy*sn)/a.mass,ay=(fx*sn+fy*c)/a.mass,alpha=torque/a.inertia;
   for(const [actual,expected]of [[e.vx,before.vx+ax*dt],[e.vy,before.vy+ay*dt],[e.x,before.x+before.vx*dt+ax*dt*dt*.5],[e.y,before.y+before.vy*dt+ay*dt*dt*.5],[e.motionAngularVelocity,before.omega+alpha*dt]])assert.ok(Math.abs(actual-expected)<1e-8,'Movement must come from the applied jets');
   const d={...w.nativeShipDefinitions.describe(s,e,{category:'prometheus'}),id:'proof'};w.nativePrometheusEffects.advance(s,[d]);
   assert.deepEqual(plain(w.nativePrometheusEffects.snapshot(s).find(v=>v.id==='proof').jets),plain(a.jets));
  }
 }
});

test('coasting consumes no thrust, and stopping a turn fires counter-torque without inventing translation',()=>{
 const {w,s}=fixture(),dt=1/60,e={shipType:3703,system:s.system,x:0,y:0,heading:-Math.PI/2,vx:100,vy:-30,hull:100,phase:'flight',motionAngularVelocity:0};
 const profile=w.nativeShipDefinitions.forEntity(s,e,{category:'prometheus'}).movement;
 w.nativeShipSystems.move(s,e,'prometheus',{coast:true},profile,dt);assert.equal(e.vx,100);assert.equal(e.vy,-30);assert.ok(e.motionActuation.jets.every(j=>j.level===0));
 e.vx=e.vy=e.speed=0;e.motionAngularVelocity=.65;
 w.nativeShipSystems.move(s,e,'prometheus',{heading:e.heading},profile,dt);
 assert.ok(e.motionActuation.torque<0&&e.motionAngularVelocity<.65,'Opposing jets must brake the positive spin');
 assert.ok(Math.hypot(e.vx,e.vy)<1e-7,'An attitude correction must balance its translational force');
 assert.ok(e.motionActuation.jets.filter(j=>j.level>.001).length>=2);
});

test('a returning section routes around a parked runabout and docks without crossing its physical hull',()=>{
 const {w,s,step}=fixture(),dt=1/60;s.system=1;s.x=3000;s.y=-3000;
 vm.runInContext(fs.readFileSync(path.join(root,'broken-mirror-port/ship-traffic.js'),'utf8'),w);
 w.nativePrometheus.activate(s);step(9);
 const parked={id:'parked-test',system:1,shipType:7,x:s.x-31,y:s.y+w.nativeShipDefinitions.get(37).dimensions.height*w.nativePrometheusDefinitions.part(3701).offset.y-20,heading:-Math.PI/2,vx:0,vy:0,hull:100,phase:'flight'};
 w.nativeShipSystems.register('civilian',{collect:()=>[w.nativeShipDefinitions.describe(s,parked,{category:'civilian'})],hit(){}});w.nativeShipSystems.invalidateShips(s);
 w.nativePrometheus.recall(s);let routed=false;
 for(let i=0;i<60*35&&s.prometheus.mode!=='joined';i++){
  const before=new Map(s.prometheus.sections.map(e=>[e.id,{x:e.x,y:e.y}]));w.nativeSimulation.advance(s,dt);w.nativePrometheus.advance(s,dt);
  for(const e of s.prometheus.sections){const d=w.nativeShipDefinitions.describe(s,e,{category:'prometheus'}),p=before.get(e.id);routed||=!!e.actuatedAvoidance;
   const obstacle=w.nativeShipDefinitions.describe(s,parked,{category:'civilian'});
   assert.equal(w.nativeShipMotion.shipPairContact({...d,previousX:p.x,previousY:p.y},{...obstacle,previousX:parked.x,previousY:parked.y},dt),null,'The detour must clear the actual parked hull');}
 }
 assert.ok(routed,'The obstructed straight approach must choose a detour '+JSON.stringify({mode:s.prometheus.mode,dockingAt:s.prometheus.dockingAt,sections:s.prometheus.sections.map(e=>({x:e.x,y:e.y,goal:e.approachTarget,avoid:e.actuatedAvoidance}))}));assert.equal(s.prometheus.mode,'joined');assert.equal(parked.hull,100);
});

test('Prometheus emergency propulsion retains manual steering and thrust at critical hull with failed main engines',()=>{
 const {w,s}=fixture(),engine=s.shipEquipment.instances[s.shipEquipment.slots.engineering[0]];
 engine.condition=0;s.hull=w.nativeShipDefinitions.get(37).hull*.1;s.phase='disabled';
 w.nativeShipSystems.move(s,s,'player',{throttle:1,turn:1,manualFlight:true},undefined,1/60);
 assert.ok(s.speed>0&&s.angle>-Math.PI/2);assert.ok(s.motionActuation.jets.some(j=>j.kind==='rcs'&&j.level>0));assert.ok(s.motionActuation.jets.filter(j=>j.kind==='engine').every(j=>j.level===0));
});

test('command transfers to the real surviving section without replacing inventory, momentum or cooldowns',()=>{
 const {w,s,step}=fixture();vm.runInContext(fs.readFileSync(path.join(root,'broken-mirror-port/player-combat.js'),'utf8'),w);
 w.nativePrometheus.activate(s);step(9);const next=s.prometheus.sections[0];next.vx=72;next.vy=-25;next.speed=Math.hypot(72,25);next.heading=.3;next.motionAngularVelocity=.2;
 const inventory=s.shipEquipment,position={x:next.x,y:next.y},hp=next.hull,shields=next.shields;inventory.instances[inventory.slots.weapon[0]].readyAt=90;
 const result=w.nativePlayerCombat.hit(s,s.hull+s.shields+1000,{kind:'beam'});
 assert.ok(result.transferred&&!result.destroyed);assert.equal(w.nativePrometheus.typeFor(s),3701);assert.equal(s.hull,hp);assert.equal(s.shields,shields);
 assert.equal(s.x,position.x);assert.equal(s.y,position.y);assert.equal(s.vx,72);assert.equal(s.vy,-25);assert.equal(s.angle,.3);assert.equal(s.motionAngularVelocity,.2);
 assert.equal(s.shipEquipment,inventory);assert.equal(inventory.instances[inventory.slots.weapon[0]].readyAt,90);assert.equal(s.prometheus.sections.filter(e=>e.hull>0).length,1);
 const second=w.nativePlayerCombat.hit(s,s.hull+s.shields+1000,{kind:'beam'});assert.ok(second.transferred);assert.equal(w.nativePrometheus.typeFor(s),3703);
 const last=w.nativePlayerCombat.hit(s,s.hull+s.shields+1000,{kind:'beam'});assert.ok(last.destroyed&&!last.transferred);assert.equal(s.phase,'destroyed');assert.equal(w.nativePrometheus.canTakeCommand(s),false);
});

test('every surviving pair docks with the correct pivots and every single section can enter reconstruction',()=>{
 for(const survivors of [[3701,3702],[3701,3703],[3702,3703],[3701],[3702],[3703]]){
  const {w,s,step}=fixture();vm.runInContext(fs.readFileSync(path.join(root,'broken-mirror-port/player-combat.js'),'utf8'),w);w.nativePrometheus.activate(s);step(9);
  for(const e of s.prometheus.sections)if(!survivors.includes(e.shipType)){e.hull=0;e.phase='destroyed';}
  if(!survivors.includes(3702))w.nativePlayerCombat.hit(s,s.hull+s.shields+1000,{kind:'beam'});
  const total=s.hull+s.prometheus.sections.reduce((n,e)=>n+Math.max(0,e.hull),0),shield=s.shields+s.prometheus.sections.filter(e=>e.hull>0).reduce((n,e)=>n+Math.max(0,e.shields),0);
  w.nativePrometheus.recall(s);step(35);assert.equal(s.prometheus.mode,'joined',survivors.join(','));assert.ok(s.prometheus.assembly);
  assert.ok(Math.abs(s.hull-total)<1e-7&&Math.abs(s.shields-shield)<1e-7,'Joining must not restore lost health');
  assert.deepEqual(plain(s.prometheus.assembly.parts.filter(p=>p.build>0).map(p=>p.type).sort()),survivors);
  const save=plain(s);w.nativePrometheus.initialize(save);assert.deepEqual(plain(save.prometheus),plain(s.prometheus));
  const definition=w.nativeShipDefinitions.forEntity(s),expected=survivors.reduce((n,id)=>n+w.nativeShipDefinitions.get(id).mass,0);assert.ok(Math.abs(definition.mass-expected)<1e-7);
  w.nativeShipSystems.move(s,s,'player',{throttle:1,turn:1,manualFlight:true},undefined,1/60);
  assert.ok(s.motionActuation.jets.every(j=>survivors.some(type=>j.id.startsWith(w.nativePrometheusDefinitions.part(type).key+':'))),'A missing section cannot supply a thruster');
  const before=s.hull,max=w.nativeShipDefinitions.get(37).hull;s.hull+=(max-s.hull)*.4;w.nativePrometheus.repairProgress(s,before);
  assert.ok(s.prometheus.assembly.parts.filter(p=>p.wasMissing).every(p=>p.build>0&&p.build<1));assert.equal(w.nativePrometheus.allowed(s).ok,false);
  s.hull=max;w.nativePrometheus.repairProgress(s);assert.equal(s.prometheus.assembly,undefined);assert.equal(s.prometheus.lost,0);
 }
});

test('losing the piloted section during a moving docking preserves the recall through save and reload',()=>{
 const {w,s}=fixture(),dt=1/60;vm.runInContext(fs.readFileSync(path.join(root,'broken-mirror-port/player-combat.js'),'utf8'),w);
 const tick=state=>{w.nativeSimulation.advance(state,dt);w.nativeShipSystems.move(state,state,'player',{throttle:1,turn:.5,manualFlight:true},undefined,dt);w.nativePrometheus.advance(state,dt);};
 w.nativePrometheus.activate(s);for(let i=0;i<900&&s.prometheus.mode!=='deployed';i++)tick(s);w.nativePrometheus.recall(s);
 for(let i=0;i<1200&&s.prometheus.dockingAt==null;i++)tick(s);assert.ok(s.prometheus.dockingAt!=null);for(let i=0;i<30;i++)tick(s);
 assert.ok(w.nativePlayerCombat.hit(s,s.hull+s.shields+1000,{kind:'beam'}).transferred);assert.equal(s.prometheus.mode,'recalling');
 const restored=plain(s);w.nativePrometheus.initialize(restored);
 for(let i=0;i<2100&&s.prometheus.mode!=='joined';i++){tick(s);tick(restored);assert.deepEqual(plain(w.nativePrometheus.snapshot(restored)),plain(w.nativePrometheus.snapshot(s)));}
 assert.equal(s.prometheus.mode,'joined');assert.equal(s.prometheus.lost,1);assert.ok(s.speed>350);assert.deepEqual(plain(restored.prometheus),plain(s.prometheus));
});
