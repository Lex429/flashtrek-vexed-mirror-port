const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

class Element{
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners={};this.value='';this.textContent='';this.hidden=false;this.selectors=new Map();this.open=false;this.offsetHeight=0;this.classList={add(){},remove(){}};}
  get childNodes(){return this.children;}
  hasPointerCapture(){return false;}
  append(...children){this.children.push(...children);}
  add(child){this.append(child);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(name,value){this[name]=value;}
  querySelector(selector){if(!this.selectors.has(selector))this.selectors.set(selector,new Element(selector));return this.selectors.get(selector);}
  addEventListener(type,handler){this.listeners[type]=handler;}
  getBoundingClientRect(){return {left:0,top:0,width:this.id==='dev-galaxy-ships'?340:1200,height:800};}
}
function setup(){
  const stage=new Element('game'),canvas=stage.querySelector('#space');
  const document={getElementById:()=>stage,createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('fragment')};
  const state={system:1,x:40,y:60,hull:300,shields:100,shipSimulation:{seconds:10}};
  const civilian={id:2,name:'ISS Meridian',role:'freight',system:1,x:500,y:700,hull:100,shields:50,credits:200,cargo:{good:0,tons:12},task:{type:'delivery',phase:'loading',reason:'Earth needs ore',status:'active'},recentEvents:[{type:'loaded',at:9,message:'Loaded 12 t'}]};
  const transit={id:3,name:'Trading Three',system:1,x:0,y:0,hull:200,shields:20,journey:{origin:1,destination:2,route:[1,2],departedAt:0,duration:30,arrivalAt:30,progress:1/3}};
  const escort={id:'escort:1',name:'Escort One',role:'escort',system:2,x:120,y:90,hull:70,shields:10};
  let stamp=0,collections=0,inspections=0;
  const anchor=id=>Number(id)===1?{x:0,y:0}:Number(id)===2?{x:10000,y:5000}:null;
  const window={
    nativeManualFlight:{systems:[{id:1,name:'Sol'},{id:2,name:'Test'}],anchor,planetPosition:id=>{const a=anchor(id);return a&&{x:a.x-220,y:a.y+75};},position:s=>({x:s.x,y:s.y})},
    nativeSimulation:{seconds:s=>s.shipSimulation.seconds},
    nativeSolEconomy:{goods:['Ore'],names:{3:'Earth'}},
    nativeShipSystems:{inspectAll:()=>{collections++;return [{id:'player',category:'player',entity:state,system:1},{id:2,category:'civilian',entity:civilian,system:1},{id:3,category:'civilian',entity:transit,system:1,detail:'transit'},
      {id:'tug:0',category:'tug',name:'Tug One',system:1,x:600,y:500,hull:90,shields:30,cargo:{good:0,tons:7},recentEvents:[{message:'Loading'}]},
      {id:escort.id,category:'escort',entity:escort,system:2},{id:'rock:1',category:'asteroid',system:1}] }},
    nativeNpcLives:{
      galaxyPosition:(_,ship)=>ship===transit?{x:3000,y:1500}:{x:ship.x+20,y:ship.y+30},
      inspect:(_,id)=>{inspections++;const ship=id===2?civilian:transit;return {task:ship.task,journey:ship.journey,cargo:ship.cargo,credits:ship.credits,hull:ship.hull,shields:ship.shields,events:ship.recentEvents};},
      metrics:()=>({detailed:1,distantUpdates:2})
    }
  };
  const sandbox=vm.createContext({window,document,addEventListener(){},Option:function(text,value){return {text,value};},performance:{now:()=>stamp},Date,Math,Map,Set});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/dev-galaxy-view.js'),'utf8'),sandbox);
  const api=window.nativeGalaxyOverview,panel=stage.children[0],controls=stage.children[1];controls.offsetHeight=140;stage.children[2].offsetHeight=40;
  controls.querySelector('[data-system]').value='all';
  const ctx=new Proxy({measureText:text=>({width:text.length*6}),createRadialGradient:()=>({addColorStop(){}})},{get:(object,name)=>name in object?object[name]:()=>{}});
  return {api,state,civilian,transit,escort,panel,controls,canvas,ctx,window,setTime:value=>stamp=value,counts:()=>({collections,inspections})};
}

test('inspector includes every registered ship category and transit without preparing artwork or changing life',()=>{
  const f=setup(),before=JSON.stringify([f.state,f.civilian,f.transit,f.escort]);
  const snapshot=f.api.snapshot(f.state);
  assert.deepEqual(Array.from(snapshot.ships,ship=>ship.id),['player',2,3,'tug:0','escort:1']);
  const ship=snapshot.ships.find(ship=>ship.id===2);
  assert.equal(ship.name,'ISS Meridian');assert.equal(ship.task.reason,'Earth needs ore');
  assert.equal(ship.position.x,520);assert.equal(ship.local.x,520);assert.equal(ship.local.y,730);
  assert.equal(snapshot.ships.find(ship=>ship.id===3).position.x,3000);
  assert.equal(snapshot.ships.find(ship=>ship.id===3).journey.progress,1/3);
  assert.equal(snapshot.ships.find(ship=>ship.id==='escort:1').position.x,10120);
  assert.equal(snapshot.metrics.artworkPreparations,0);
  assert.equal(f.counts().inspections,0,'population snapshots cannot call a whole-population inspection per ship');
  assert.equal(JSON.stringify([f.state,f.civilian,f.transit,f.escort]),before);
  assert.doesNotThrow(()=>JSON.stringify(snapshot));
  ship.task.reason='Changed inspection copy';ship.cargo.tons=999;
  assert.equal(f.civilian.task.reason,'Earth needs ore');assert.equal(f.civilian.cargo.tons,12);
});

test('individual search, selection, tracking and Dev visit preserve NPC task and cargo',()=>{
  const f=setup(),before=JSON.stringify(f.civilian),calls=[];
  f.api.configure({visit:(state,id,report)=>{calls.push({state,id,report});return {ok:true};}});
  f.api.setActive(true,f.state);assert.equal(f.api.select(2),true);assert.equal(f.api.track(2),2);
  let result=f.api.snapshot();assert.equal(result.selectedId,2);assert.equal(result.trackedId,2);
  assert.equal(f.api.inspectLocal(),true);assert.equal(calls[0].id,2);
  assert.equal(calls[0].report.galaxy.x,520);assert.equal(calls[0].report.local.x,520);assert.equal(calls[0].report.cargo.tons,12);
  assert.equal(JSON.stringify(f.civilian),before);
  f.controls.querySelector('details').open=true;const search=f.controls.querySelector('[data-search]');search.value='Meridian';search.oninput();
  const fragment=f.controls.querySelector('[data-list]').children[0];assert.equal(fragment.children.length,1);assert.equal(fragment.children[0].dataset.shipId,'2');
  f.api.setActive(false);f.api.setActive(true);assert.equal(f.api.snapshot().selectedId,2);
  assert.equal(f.api.track(false),null);assert.equal(f.api.select('missing'),false);assert.equal(f.api.inspectLocal('missing'),false);
});

test('map refreshes population at most once a second and draws actual local poses',()=>{
  const f=setup();f.api.setActive(true,f.state);
  for(let frame=0;frame<60;frame++){f.setTime(frame*16);f.api.paint(f.ctx,{w:1200,h:800},f.state);}
  assert.equal(f.counts().collections,1);assert.ok(f.api.snapshot().metrics.domRefreshes<=3);
  f.api.select(2);f.controls.querySelector('[data-local]').onclick();f.api.track(2);f.api.paint(f.ctx,{w:1200,h:800},f.state);
  const result=f.api.snapshot(),marker=result.markers.find(hit=>hit.ids.length===1&&hit.ids[0]===2);
  assert.ok(marker);assert.ok(Math.abs(marker.x-result.view.width/2)<.001);assert.ok(Math.abs(marker.y-result.view.centerY)<.001);
  const ship=result.ships.find(ship=>ship.id===2);assert.equal(result.view.center.x,ship.position.x);
  assert.equal(result.metrics.artworkPreparations,0);
});

test('inspector shows newest bounded events and reports a rejected Dev visit accurately',()=>{
  const f=setup();f.civilian.recentEvents=Array.from({length:10},(_,i)=>({message:'Event '+(10-i),at:10-i}));
  f.api.setActive(true,f.state);f.api.select(2);
  const events=f.panel.querySelector('[data-inspector]').querySelector('ol').children[0];
  assert.equal(events.children.length,5);assert.equal(events.children[0].textContent,'Event 10');
  assert.equal(events.children.at(-1).textContent,'Event 6');
  f.api.configure({visit:()=>({ok:false,error:'Unavailable'})});assert.equal(f.api.inspectLocal(),false);
});

test('tug markers project the shared leg between collection refreshes without changing saved poses',()=>{
  const f=setup(),tug={x:0,y:0,heading:0,speed:0,lifeLeg:{startedAt:0},lifeEventAt:100},before=JSON.stringify(tug);
  const inspect=f.window.nativeShipSystems.inspectAll;
  f.window.nativeShipSystems.inspectAll=state=>inspect(state).map(ship=>ship.id==='tug:0'?{...ship,entity:tug,galaxy:{x:0,y:0}}:ship);
  f.window.nativeShipMotion={sampleLeg:(pose,leg,time)=>{pose.x=time*10;pose.y=time*20;}};
  f.api.setActive(true,f.state);f.api.select('tug:0');f.controls.querySelector('[data-local]').onclick();f.api.track('tug:0');
  const collections=f.counts().collections;
  f.api.paint(f.ctx,{w:1200,h:800},f.state);
  f.state.shipSimulation.seconds=11;f.setTime(90);f.api.paint(f.ctx,{w:1200,h:800},f.state);
  assert.equal(f.counts().collections,collections,'subsequent frames reuse enumeration');
  const result=f.api.snapshot();assert.equal(result.view.center.x,110);assert.equal(result.view.center.y,220);
  assert.equal(JSON.stringify(tug),before,'projection samples only a temporary pose');
});

test('selected delivery stock audit reads real current inventories without creating a market',()=>{
  const f=setup();
  f.state.solEconomy={ports:{3:[180]}};
  f.state.civilianTraffic={life:{markets:{'2:0':{stock:[12]}}}};
  f.civilian.task={kind:'freight',origin:{system:1,port:3},destination:{system:2,port:0},requirements:{good:0,tons:4}};
  f.window.nativeNpcLives.market=()=>{throw Error('Inspection must not create a market');};
  const before=JSON.stringify(f.state);f.api.setActive(true,f.state);f.api.select(2);
  let report=f.api.snapshot().ships.find(ship=>ship.id===2);
  assert.equal(report.tradeStock.origin.tons,180);assert.equal(report.tradeStock.destination.tons,12);
  assert.equal(JSON.stringify(f.state),before);
  f.state.solEconomy.ports[3][0]-=4;f.state.civilianTraffic.life.markets['2:0'].stock[0]+=4;
  report=f.api.snapshot().ships.find(ship=>ship.id===2);
  assert.equal(report.tradeStock.origin.tons,176);assert.equal(report.tradeStock.destination.tons,16);
  report.tradeStock.origin.tons=0;assert.equal(f.state.solEconomy.ports[3][0],176);
});

test('selected docking activity describes the queue and returns an isolated read model',()=>{
  const f=setup(),dock={kind:'queue',system:1,port:3,queuePosition:2,queueLength:5,clearing:{slot:1}};
  f.civilian.task.phase='dock-queue';
  f.window.nativePortDocking={inspect:()=>dock};
  const before=JSON.stringify(f.civilian);
  f.api.setActive(true,f.state);f.api.select(2);
  const inspector=f.panel.querySelector('[data-inspector]');
  assert.equal(inspector.querySelector('[data-activity]').textContent,'Waiting for a berth');
  assert.match(inspector.querySelector('[data-explanation]').textContent,/Earth/);
  const report=f.api.snapshot().ships.find(ship=>ship.id===2);
  assert.equal(report.docking.queuePosition,2);report.docking.clearing.slot=99;
  assert.equal(dock.clearing.slot,1);assert.equal(JSON.stringify(f.civilian),before);
  f.civilian.dockingMove={resumeAt:50};f.setTime(600);f.api.paint(f.ctx,{w:1200,h:800},f.state);
  assert.equal(inspector.querySelector('[data-activity]').textContent,'Clearing the dock');
});
