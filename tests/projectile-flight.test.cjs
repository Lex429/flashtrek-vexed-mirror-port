const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function rules(){const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/weapon-rules.js','utf8'),c);return c.window.nativeWeaponRules;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const body=(id,x,y,extra={})=>({id,x,y,previousX:x,previousY:y,heading:0,vx:0,vy:0,radii:{rx:12,ry:16},dimensions:{width:30,height:40},...extra});

test('fast transverse and reverse flight retain a reachable projectile intercept from the actual muzzle',()=>{
 const r=rules();
 for(const kind of ['disruptor','torpedo'])for(const vx of [-600,0,427.5,600]){
  const source=body('player',0,0,{heading:-Math.PI/2,vx,vy:0}),target=body('target',0,-700);
  const spec={...r.weaponSpec({id:kind==='torpedo'?15:6,damage:1},kind),spread:0};
  const event=r.startShot({id:6},kind,source,target,0,20,spec,{x:6,y:-20});
  const muzzle=r.emitter(source,event);close(event.x,muzzle.x);close(event.y,muzzle.y);
  close(Math.hypot(event.vx-vx,event.vy),spec.speed);
  assert.ok(event.vy<0);let hit=null;
  for(let i=0;i<180&&!hit;i++)hit=r.stepShot(event,source,target,{bystanders:[],rocks:[]},(i+1)/120,1/120,target.radii,target.dimensions);
  assert.equal(hit?.kind,'hit',`${kind}, carrier vx=${vx}`);assert.equal(hit.target.id,target.id);
 }
});

test('turning or accelerating the launcher cannot bend an already launched disruptor',()=>{
 const r=rules(),source=body('player',0,0,{vx:450}),target=body('target',800,250);
 const spec={...r.weaponSpec({id:6,damage:1},'disruptor'),spread:0};
 const event=r.startShot({id:6},'disruptor',source,target,0,20,spec,{x:8,y:-20}),start={x:event.x,y:event.y,vx:event.vx,vy:event.vy};
 for(let i=0;i<12;i++){source.heading+=.2;source.vx=-500;source.vy=200;
  assert.equal(r.stepShot(event,source,target,{bystanders:[],rocks:[]},(i+1)/120,1/120,target.radii,target.dimensions),null);
  close(event.vx,start.vx);close(event.vy,start.vy);close(event.x,start.x+start.vx*(i+1)/120);close(event.y,start.y+start.vy*(i+1)/120);
 }
});

test('lead is computed at the configured mount rather than at the hull centre',()=>{
 const r=rules(),source=body('player',0,0),target=body('target',100,75),spec={...r.weaponSpec({damage:1},'disruptor'),spread:0};
 const e=r.startShot({},'disruptor',source,target,0,0,spec,{x:12,y:-30}),dx=target.x-e.x,dy=target.y-e.y;
 close(e.vx*dy-e.vy*dx,0);assert.ok(e.vx*dx+e.vy*dy>0);
});

test('reverse flight keeps a currently in-range target eligible even when lead lies farther away',()=>{
 const r=rules(),source=body('player',0,0,{vx:-450}),target=body('target',700,0),spec=r.weaponSpec({id:6},'disruptor');
 assert.ok(r.intercept(source,target,spec.speed).x>spec.range);
 assert.equal(r.firingStatus(source,target,spec,'disruptor').ok,true);
 assert.equal(r.firingStatus(source,{...target,x:spec.range+1},spec,'disruptor').reason,'range');
});

test('cannon, turret and torpedo models retain distinct arcs, speeds and guidance',()=>{
 const r=rules(),source=body('p',0,0),rear=body('t',-300,0);
 for(const id of [6,7,8,9,10])assert.equal(r.firingStatus(source,rear,r.weaponSpec({id},'disruptor'),'disruptor').reason,'arc');
 for(const id of [11,12])assert.equal(r.firingStatus(source,rear,r.weaponSpec({id},'disruptor'),'disruptor').ok,true);
 const slow=r.weaponSpec({id:13},'torpedo'),photon=r.weaponSpec({id:15},'torpedo'),quantum=r.weaponSpec({id:16},'torpedo');
 assert.ok(slow.speed>600&&slow.speed<photon.speed&&photon.speed<quantum.speed);assert.ok(slow.turn>photon.turn);
});

test('fast shots retain swept first-surface collisions across small intervening asteroids',()=>{
 const r=rules(),source=body('p',0,0),target=body('t',700,0),spec={...r.weaponSpec({id:6},'disruptor'),spread:0};
 const e=r.startShot({},'disruptor',source,target,0,0,spec),hit=r.stepShot(e,source,target,{bystanders:[],rocks:[{slotId:1,x:240,y:0,size:8}]},.2,.2,target.radii,target.dimensions);
 assert.equal(hit.kind,'hit');assert.equal(hit.target.rockId,1);assert.ok(hit.point.x<240);
});

test('saved legacy projectile velocity and guidance remain unchanged by new model defaults',()=>{
 const r=rules(),source=body('p',0,0),target=body('t',800,0),spec={...r.weaponSpec({id:15},'torpedo'),speed:225,turn:.85,spread:0};
 const e=JSON.parse(JSON.stringify(r.startShot({},'torpedo',source,target,0,0,spec)));
 r.stepShot(e,source,target,{bystanders:[],rocks:[]},.1,.1,target.radii,target.dimensions);
 close(e.speed,225);close(e.x,22.5);close(e.vx,225);
});

test('every disruptor and torpedo model fires straight from its mount without a target or aim error',()=>{
 const r=rules();
 for(const kind of ['disruptor','torpedo'])for(const id of kind==='disruptor'?[6,7,8,9,10,11,12]:[13,15,16,17,18,19,27])for(const heading of [-.9,2.3]){
  const source=body('player',200,300,{heading,vx:-400,vy:150}),spec=r.weaponSpec({id,damage:3},kind);
  const event=r.startShot({id},kind,source,null,0,20,spec,{x:6,y:-20}),muzzle=r.emitter(source,event);
  assert.equal(event.targetId,null);assert.equal(event.unguided,true);assert.equal(event.turn,0);assert.equal(event.aimError,0);
  close(event.x,muzzle.x);close(event.y,muzzle.y);
  close(event.vx,source.vx+Math.cos(heading)*spec.speed);close(event.vy,source.vy+Math.sin(heading)*spec.speed);
  assert.equal(r.stepShot(event,source,null,{bystanders:[],rocks:[]},.05,.05),null);
 }
});
