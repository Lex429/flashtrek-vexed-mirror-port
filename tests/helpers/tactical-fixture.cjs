const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../..'),root=path.join(repo,'html-games/broken-mirror-port');

async function tacticalFixture({revision,state:saved,simulateShots=false}={}){
  const calls={steering:0,firing:0,scenes:0,prepared:0};
  const window={nativePause:{active:false},nativeShipInventory:{active:false},nativeSystemHub:{sol:[]},
    vexedFlightAssets:{size:()=>({}),flightDimensions:()=>({width:30,height:60}),loadShip:async()=>({art:{},profile:{},width:30,height:60})},
    vexedSolFlight:{shipPosition:s=>({x:s.x,y:s.y}),bodySize:()=>128},nativeSolAsteroids:{placements:[],image:()=>({complete:false})},starterShips:new Map(),
    showcaseWeaponAppearance:{units:.91976},showcaseShieldRadii:(w,h)=>({rx:w*.6,ry:h*.6}),createShowcaseWeaponVisual:i=>({...i}),showcaseHullBurst:{burst(){},update(){}}};
  const document={hidden:false},context=vm.createContext({window,document,console,performance,
    fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'../flashtrek-broken-mirror/showcase-assets',url.split('/').pop().split('?')[0]),'utf8'))})});
  const source=file=>revision?execFileSync('git',['show',revision+':html-games/broken-mirror-port/'+file],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','ignore']}):fs.readFileSync(path.join(root,file),'utf8');
  const files=['world-data.js','weapon-catalog.js','simulation-clock.js','simulation-frame.js','ship-motion.js','ship-definitions.js','ship-damage.js','ship-effects.js','weapon-loadout.js','weapon-rules.js','combat-shots.js','ship-systems.js','rebirth-warp.js','faction-standing.js','sol-economy.js','civilian-combat-ai.js','ship-detail.js','civilian-traffic.js','asteroid-combat.js','manual-flight.js','npc-lives.js'];
  for(const file of files){
    let text;try{text=source(file);}catch(error){if(['ship-detail.js','simulation-frame.js'].includes(file))continue;throw error;}
    vm.runInContext(text,context,{filename:file});
  }
  await window.nativeCombatShots.ready;
  const make=(id,x)=>({id,name:'Tactical '+id,shipType:47,system:1,stationSystem:1,homeSystem:1,port:3,x,y:0,heading:0,speed:0,hull:100,shields:100,
    phase:'docked',timer:10000,cargo:null,oreHold:0,credits:500,legs:0,deliveries:0,mined:0,deals:0});
  const state=saved||{system:1,shipType:7,x:0,y:0,angle:0,speed:0,hull:100,shields:100,weapons:[1],localPrestige:{},minedAsteroids:[],destroyedAsteroids:[],
    civilianTraffic:{version:2,timingVersion:1,clock:0,ships:[make(1,1000000),make(2,1000300)],log:[]}};
  window.nativeSimulation.ensure(state);window.nativeSolEconomy.initialize(state);state.solEconomy.freighters=[];window.nativeCivilianTraffic.initialize(state);window.nativeNpcLives.initialize(state);
  const steer=window.nativeCivilianCombatAI.steer,fire=window.nativeCombatShots.fireFor,scene=window.nativeShipSystems.scene;
  window.nativeCivilianCombatAI.steer=(...args)=>{calls.steering++;return steer(...args);};
  window.nativeCombatShots.fireFor=(...args)=>{calls.firing++;return fire(...args);};
  window.nativeShipSystems={...window.nativeShipSystems,scene(...args){calls.scenes++;return scene(...args);}};
  const prepare=window.nativeShipEffects.prepare;
  window.nativeShipEffects={...window.nativeShipEffects,prepare(...args){calls.prepared++;return prepare(...args);}};
  const step=(dt=1/60)=>{window.nativeSimulation.advance(state,dt);window.nativeCivilianTraffic.advance(state,dt);if(simulateShots)window.nativeCombatShots.advance(state,dt);};
  const start=()=>window.nativeCivilianTraffic.hit(state,1,1,{source:'ai',sourceId:2,from:{x:1000300,y:0}});
  const clearCounts=()=>Object.keys(calls).forEach(key=>calls[key]=0);
  return {window,document,context,state,calls,step,start,clearCounts,ships:state.civilianTraffic.ships};
}
module.exports={tacticalFixture};
