const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../html-games'),plain=v=>JSON.parse(JSON.stringify(v));
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} versus ${b}`);
async function fixture(worker=false){
 const draws=[],w={console,document:{hidden:false},performance:{now:()=>0},
  createShowcaseWeaponVisual:x=>({...x}),paintShowcaseWeaponShot:(_,shot,geometry)=>draws.push({...geometry}),showcaseWeaponAppearance:{units:1}};
 w.window=w;const context=vm.createContext(w);
 const load=(folder,name)=>vm.runInContext(fs.readFileSync(path.join(root,folder,name+'.js'),'utf8'),context,{filename:name+'.js'});
 for(const name of ['cthia-effects','olympic-effects','tug-effects','constitution-tug-effects','starter-effects','earth-profiles','federation-profiles','new-ship-profiles','orion-profiles','klingon-profiles','romulan-profiles','vulcan-profiles','cardassian-profiles','ferengi-dominion-profiles','independent-profiles','earth-effects','bioship-effects','lifeform-effects'])load('flashtrek-broken-mirror',name);
 load('flashtrek-broken-mirror','constitution-showcase-lights');load('flashtrek-broken-mirror','constitution-damage');
 w.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'flashtrek-broken-mirror/showcase-assets',url.includes('combat-data')?'combat-data.json':'catalog.json'),'utf8'))});
 for(const name of ['world-data','orion-world','flight-reference-data','weapon-catalog','simulation-clock','ship-motion','ship-scale-settings','ship-weapon-mounts','ship-definitions','constitution-ships','federation-ships','orion-ships','prometheus-artwork','prometheus-definitions','ship-damage','weapon-loadout','weapon-rules','combat-shots','ship-systems','prometheus-mvam','shipyard-refits']){
  if(worker&&name==='ship-definitions')w.starterShips=new Map(Array.from(w.starterShips,([id,p])=>[id,{width:p.width,height:p.height,displayRatio:p.displayRatio}]));
  load('broken-mirror-port',name);
 }
 await w.nativeCombatShots.ready;return {w,draws};
}
test('every production hull and separated section has validated artwork-relative hardware in foreground and workers',async()=>{
 const {w}=await fixture(),worker=(await fixture(true)).w,api=w.nativeShipDefinitions;
 const ids=api.registered().filter(d=>d.capabilities.armed!==false).map(d=>d.id);
 assert.ok(ids.length>=89);assert.deepEqual(Array.from(w.nativeShipWeaponMounts.registered(),r=>r.id).sort((a,b)=>a-b),[...ids].sort((a,b)=>a-b));
 for(const id of ids){
  const expected=w.nativeShipWeaponMounts.get(id).emitters;
  for(const category of ['player','civilian','tug']){
   const definition=api.get(id,category);assert.deepEqual(plain(definition.emitters),plain(expected),`${id}/${category}`);
   assert.deepEqual(plain(worker.nativeShipDefinitions.get(id,category).emitters),plain(expected),`Worker ${id}/${category}`);
   assert.deepEqual(plain(api.validate(definition)),[]);
  }
  for(const key of ['beamBanks','cannonBanks','torpedoBanks','turretBanks'])assert.ok(expected[key].length>0);
 }
});
test('actual player and NPC launches and Canvas packets use the selected hardware across headings and damaged hulls',async()=>{
 const {w,draws}=await fixture(),scenes=new WeakMap();
 const shots=w.nativeCombatShots.fork({blocked:()=>false,scene:s=>scenes.get(s),resolve:(s,id)=>scenes.get(s).bystanders.find(t=>String(t.id)===String(id))});await shots.ready;
 let checked=0;
 for(const d of w.nativeShipDefinitions.registered())for(const category of ['player','civilian','tug'])for(const fraction of [1,.7,.45,.2])for(const heading of [-Math.PI/2,.37,Math.PI])for(const model of [1,6,11,15]){
  const s={system:2,shipType:d.id,x:1000,y:2000,angle:heading,heading,hull:d.hull*fraction,shields:d.shields,phase:'cruise',vx:120,vy:-70,day:15,latinum:123,antimatter:27,deuranium:9};
  const holder=category==='player'?s:{...s,id:81},source=()=>w.nativeShipDefinitions.describe(s,holder,{category});
  w.nativeWeaponLoadout.refit(s,[model],{holder});const from=source();
  const target={id:82,system:from.system,x:from.x+Math.cos(heading)*300,y:from.y+Math.sin(heading)*300,heading:0,hull:1000,shields:1000,radii:{rx:12,ry:20},dimensions:{width:20,height:32},vx:120,vy:-70};
  scenes.set(s,{state:s,bystanders:[target],rocks:[]});
  const firing=shots.fireFor({state:s,shooter:from,getSource:source,target,getTarget:()=>target});assert.equal(firing.ok,true,`${d.id}/${category}/${model}: ${firing.error}`);
  const {event,shot}=firing,bank=event.kind==='beam'?'beamBanks':model===11?'turretBanks':event.kind==='torpedo'?'torpedoBanks':'cannonBanks';
  assert.ok(d.emitters[bank].some(p=>Math.abs(p.x*from.dimensions.width-event.emitter.x)<1e-8&&Math.abs(p.y*from.dimensions.height-event.emitter.y)<1e-8),`${d.id}: wrong ${bank}`);
  const c=Math.cos(heading+Math.PI/2),sn=Math.sin(heading+Math.PI/2),expected={x:from.x+event.emitter.x*c-event.emitter.y*sn,y:from.y+event.emitter.x*sn+event.emitter.y*c};
  near(event.projectile?event.x:event.from.x,expected.x,'physical muzzle x');near(event.projectile?event.y:event.from.y,expected.y,'physical muzzle y');
  const camera={x:979,y:1983},view={state:s,ship:camera,cx:200,cy:180,zoom:2.3};
  const before=JSON.stringify(s);shots.paint({},shot,view);const packet=draws.at(-1);
  near(event.projectile?packet.x:packet.x1,view.cx+(expected.x-camera.x)*view.zoom,'painted muzzle x');near(event.projectile?packet.y:packet.y1,view.cy+(expected.y-camera.y)*view.zoom,'painted muzzle y');
  assert.equal(JSON.stringify(s),before,'Painting mutated gameplay');
  if(event.projectile){near(event.inheritedVx,120,'inherited motion x');near(event.inheritedVy,-70,'inherited motion y');}
  const restored=plain(event);near(w.nativeWeaponRules.emitter(from,restored).x,expected.x,'restored muzzle');
  checked++;shots.reset();
 }
 assert.equal(checked,89*3*4*3*4);
});
test('invalid bank coordinates and empty banks are rejected, while legacy single-mount definitions remain usable',async()=>{
 const {w}=await fixture(),api=w.nativeShipDefinitions;
 for(const emitters of [{beamBanks:[]},{cannonBanks:[{x:NaN,y:0}]},{torpedoBanks:[{x:0,y:1}]}])assert.throws(()=>api.register(7,{emitters}),/Invalid weapon emitter/);
 const custom={beam:{x:.1,y:-.25},projectile:{x:-.1,y:-.2}};api.register(7,{emitters:custom});assert.deepEqual(plain(api.get(7).emitters),custom);
});
test('a partially rebuilt Prometheus rebases every surviving section bank into the assembled hull frame',async()=>{
 const {w}=await fixture(),api=w.nativeShipDefinitions,base=api.get(37);
 for(const anchor of w.nativePrometheusDefinitions.parts){
  const s={shipType:37,system:2,x:0,y:0,hull:base.hull*.4,shields:0,prometheus:{version:1,mode:'joined',assembly:{version:1,revision:0,anchor:anchor.type,parts:w.nativePrometheusDefinitions.parts.map(p=>({type:p.type,build:p.type===anchor.type?1:0,hull:p.type===anchor.type?api.get(p.type).hull:0}))}}};
  const combined=api.forEntity(s,s),original=api.get(anchor.type).emitters;
  for(const [key,bank]of Object.entries(original)){
   const values=Array.isArray(bank)?bank:[bank],actual=Array.isArray(combined.emitters[key])?combined.emitters[key]:[combined.emitters[key]];
   assert.equal(actual.length,values.length);
   values.forEach((p,i)=>{near(actual[i].x*base.dimensions.width,anchor.offset.x*base.dimensions.width+p.x*anchor.dimensions.width,'composite bank x');near(actual[i].y*base.dimensions.height,anchor.offset.y*base.dimensions.height+p.y*anchor.dimensions.height,'composite bank y');});
  }
 }
});
test('multiple cannon outlets alternate through saved event sequence without moving a shot after lead calculation',async()=>{
 const {w}=await fixture(),d=w.nativeShipDefinitions.get(34),state={system:2,shipType:34,x:0,y:0,angle:0,hull:d.hull,shields:d.shields,phase:'cruise',vx:180,vy:70};
 w.nativeWeaponLoadout.refit(state,[6]);
 const shots=w.nativeCombatShots.fork({blocked:()=>false});await shots.ready;
 const first=shots.fire({state,forward:true});assert.equal(first.ok,true);
 const saved=plain(state);saved.shipSimulation.seconds=10;
 const second=shots.fire({state:saved,forward:true});assert.equal(second.ok,true);
 near(first.event.emitter.x,d.emitters.cannonBanks[0].x*d.dimensions.width,'port cannon');near(second.event.emitter.x,d.emitters.cannonBanks[1].x*d.dimensions.width,'starboard cannon');
 for(const [s,result]of [[state,first],[saved,second]]){
  const from=w.nativeShipDefinitions.describe(s,s),origin=w.nativeWeaponRules.emitter(from,result.event);
  near(result.event.x,origin.x,'true launch x');near(result.event.y,origin.y,'true launch y');near(result.event.vx,180+result.event.spec.speed,'inherited forward velocity');near(result.event.vy,70,'inherited transverse velocity');
 }
});
test('all catalog and shipyard weapon models can launch from every hull without changing their damage or owned recharge',async()=>{
 const {w}=await fixture(),shots=w.nativeCombatShots.fork({blocked:()=>false});await shots.ready;
 const models=[...w.VexedMirrorWeapons,...w.nativeShipyardRefits.weapons].filter(m=>m.category==='weapon'&&m.damage>0);assert.equal(models.length,30);
 for(const d of w.nativeShipDefinitions.registered())for(const model of models){
  const state={system:2,shipType:d.id,x:0,y:0,angle:0,hull:d.hull,shields:d.shields,phase:'cruise'};
  w.nativeWeaponLoadout.refit(state,[model.id]);
  const target={id:82,system:2,x:200,y:0,heading:0,vx:0,vy:0,hull:1000,shields:1000,radii:{rx:10,ry:20},dimensions:{width:20,height:32}};
  const f=shots.fire({state,target,getTarget:()=>target});assert.equal(f.ok,true,`${d.id}/${model.id}: ${f.error}`);
  const key=f.kind==='beam'?'beamBanks':f.event.spec.mount==='turret'?'turretBanks':f.kind==='torpedo'?'torpedoBanks':'cannonBanks';
  assert.ok(d.emitters[key].some(p=>Math.abs(p.x*d.dimensions.width-f.event.emitter.x)<1e-8&&Math.abs(p.y*d.dimensions.height-f.event.emitter.y)<1e-8));
  near(f.event.damage,model.damage,'model damage');near(w.nativeWeaponLoadout.equipped(state)[0].instance.readyAt,model.recharge/13,'owned recharge');
  shots.reset();
 }
});
