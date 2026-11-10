const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../html-games/broken-mirror-port');
function fixture(){
 const window={},context=vm.createContext({window});
 for(const file of ['world-data.js','system-catalog-data.js','system-catalog.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 window.nativeSystemHub={sol:window.nativeSystemCatalog.bodies(1)};window.vexedFlightAssets={};
 for(const file of ['sol-flight.js','manual-flight.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 const state={system:1,localBody:3,x:0,y:0,speed:0,devMode:true,discovered:[1],latinum:1234,cargo:{good:5,tons:3}};
 return {window,state,flight:window.nativeManualFlight,catalog:window.nativeSystemCatalog};
}

test('flight location uses the map envelope, includes outer Sol bodies, and never changes the save',()=>{
 const {state,flight,catalog}=fixture();
 for(const body of catalog.bodies(1)){
  Object.assign(state,{x:body.x-220,y:body.y+75});const before=JSON.stringify(state),region=flight.regionAt(state);
  assert.equal(region.system,1,body.name+' must remain in Sol');assert.equal(region.name,'Sol');assert.equal(JSON.stringify(state),before);
 }
 const bounds=catalog.boundary(1);assert.ok(bounds.rx>flight.arrivalRadius,'Planet-arrival radius cannot define the solar-system boundary');
});

test('Sol to Orion passes through interstellar space before entering the next real envelope',()=>{
 const {state,flight}=fixture(),from=flight.planetPosition(1),to=flight.planetPosition(2),regions=[];
 let previous=1;
 for(let i=0;i<=200;i++){
  Object.assign(state,{x:from.x+(to.x-from.x)*i/200,y:from.y+(to.y-from.y)*i/200});
  const next=flight.regionAt(state,previous);if(regions.at(-1)!==next.system)regions.push(next.system);previous=next.system;
 }
 assert.equal(regions[0],1);assert.ok(regions.includes(null));assert.equal(regions.at(-1),2);
 assert.equal(state.system,1,'A location label cannot rebase the saved coordinate frame');
 assert.equal(flight.regionAt(state).name,'Orion');
});

test('the displayed border is exact, floating-point edge noise is stable and interstellar reload stays interstellar',()=>{
 const {state,flight,catalog}=fixture(),e=catalog.boundary(1);
 // The western edge faces the empty Sol-to-Orion corridor.
 Object.assign(state,{x:e.x-e.rx-70,y:e.y});
 assert.equal(flight.regionAt(state,1).system,null);
 assert.equal(flight.regionAt(state,null).system,null);
 assert.equal(flight.regionAt(JSON.parse(JSON.stringify(state))).system,null);
 state.x=e.x-e.rx;for(let i=0;i<10;i++)assert.equal(flight.regionAt(state,1).system,1);
 state.x=e.x-e.rx-0.01;assert.equal(flight.regionAt(state,1).system,null);
 state.x=e.x-e.rx+10;assert.equal(flight.regionAt(state,null).system,1);
});

test('Romulus and Remus share one physical label and undiscovered systems keep their identity hidden',()=>{
 const {state,flight,catalog}=fixture();
 Object.assign(state,{system:30,x:-220,y:75,localBody:catalog.homeId(30)});
 assert.equal(flight.regionAt(state).system,31);
 const before=flight.position(state),region=flight.regionAt(state);flight.enter(state,{id:31,name:'Romulus'});
 assert.equal(flight.regionAt(state,region.system).system,31);assert.deepEqual(flight.position(state),before);
 Object.assign(state,{system:2,x:-220,y:75,devMode:false,discovered:[1]});
 assert.match(flight.regionAt(state).name,/Unknown system/);state.discovered.push(2);assert.equal(flight.regionAt(state).name,'Orion');
});

test('galactic coordinates identify the same place across factions, system frames, body origins and reloads',()=>{
 const {window:w,state,flight}=fixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 for(const point of [{x:123.125,y:234.875},{x:-25000.25,y:-3000.125},{x:987654.25,y:-123456.125}]){
  for(let faction=0;faction<8;faction++)for(const system of [1,2,30,31,51,52])for(const localBody of system===1?[3,4]:[0]){
   const s={...state,system,faction,localBody},origin=flight.anchor(system),offset=system===1?w.vexedSolFlight.shipPosition({...s,x:0,y:0}):{x:0,y:0};
   s.x=point.x-origin.x-offset.x;s.y=point.y-origin.y-offset.y;
   const before=JSON.stringify(s),position=flight.position(s),restored=flight.position(JSON.parse(before));
   near(position.x,point.x);near(position.y,point.y);near(restored.x,point.x);near(restored.y,point.y);assert.equal(JSON.stringify(s),before);
  }
 }
});

test('entering another system changes its local frame without changing the galactic readout',()=>{
 const {state,flight}=fixture(),destination=flight.systems.find(s=>s.id===2),point=flight.planetPosition(2);
 Object.assign(state,{system:1,localBody:3,x:point.x,y:point.y});const before=flight.position(state);
 assert.equal(flight.enter(state,destination),true);assert.equal(state.system,2);
 const after=flight.position(state);assert.ok(Math.abs(after.x-before.x)<1e-7&&Math.abs(after.y-before.y)<1e-7);
 assert.equal(Math.round(after.x),Math.round(before.x));assert.equal(Math.round(after.y),Math.round(before.y));
});
