const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const port=path.join(__dirname,'../html-games/broken-mirror-port');

function fixture(){
  let seed=4292026,randomCalls=0,paintCalls=0;
  const math=Object.create(Math);math.random=()=>{randomCalls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const pixels=(w,h)=>{const data=new Uint8ClampedArray(w*h*4);for(let i=3;i<data.length;i+=4)data[i]=255;return {data,width:w,height:h};};
  const document={hidden:false,createElement(){
    const canvas={width:64,height:64},context=new Proxy({canvas,getImageData:(_x,_y,w,h)=>pixels(w,h),createImageData:pixels,
      createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),drawImage(){paintCalls++;}},
      {get(target,key){return key in target?target[key]:()=>{};}});
    canvas.getContext=()=>context;return canvas;
  }};
  const images=new Map(),image=file=>{if(!images.has(file))images.set(file,{complete:true,naturalWidth:64,naturalHeight:64,width:64,height:64,src:file});return images.get(file);};
  const rock={slotId:700,id:700,system:43,file:'rock.png',oreImage:'ore.png',oreType:'deuranium',maxHull:100,size:100,width:64,height:64,x:200,y:0,angle:.7};
  const physical=[],window={nativeSolAsteroids:{image,peekImage:image,frame:(_r,damage)=>damage>=75?'severe.png':damage>=50?'heavy.png':damage>=25?'light.png':'rock.png',
      find:()=>rock,forSystem:()=>[rock],artworkDimensions:()=>({width:64,height:64})},
    nativeShipDefinitions:{get:()=>({capabilities:{canMine:true}})},nativeShipEquipment:{has:()=>true},nativeCivilianTraffic:{isMiningRock:()=>false},
    nativeShipSystems:{refreshAsteroid(){}},nativeEnvironmentalImpacts:{explode(){},debris(_state,p,oldX,oldY){physical.push({x:p.x,y:p.y,vx:p.vx,vy:p.vy,spin:p.spin,oldX,oldY});}},
    vexedSolFlight:{shipPosition:s=>({x:s.x,y:s.y})}};
  const sandbox=vm.createContext({window,document,Math:math,Uint8ClampedArray,console});
  for(const file of ['simulation-clock.js','effect-visibility.js','asteroid-mining-effects.js','asteroid-combat.js','population-simulation.js'])
    vm.runInContext(fs.readFileSync(path.join(port,file),'utf8'),sandbox,{filename:file});
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;
  return {window,document,rock,physical,ctx:canvas.getContext('2d'),random:()=>math.random(),calls:()=>({random:randomCalls,paint:paintCalls}),image};
}

const plain=value=>JSON.parse(JSON.stringify(value));
test('lazy mining appearance variation is operation-local across camera, rotation and damage plate histories',()=>{
  const f=fixture(),state={asteroidDamage:{700:0},cargo:12,latinum:50},before=JSON.stringify(state);
  const create=(born,x=200,now=born)=>{const m={rock:f.rock,state,born};f.window.nativeAsteroidMiningEffects.draw(f.ctx,m,{x,y:250,source:{x:x-200,y:250},now,zoom:1,w:800,h:600});return m;};
  const first=create(1000),initial=plain(first.effect.parts.map(({vx,vy,spin})=>({vx,vy,spin})));
  f.ctx.rotate(.7);const rotated=create(1000,300);assert.deepEqual(plain(rotated.effect.parts.map(({vx,vy,spin})=>({vx,vy,spin}))),initial);
  const hidden=create(1000,9000);assert.equal(hidden.effect,undefined);
  state.asteroidDamage[700]=80;f.window.nativeAsteroidMiningEffects.draw(f.ctx,first,{x:200,y:250,source:{x:0,y:250},now:1000,zoom:1,w:800,h:600});
  assert.deepEqual(plain(first.effect.parts.map(({vx,vy,spin})=>({vx,vy,spin}))),initial,'damage artwork cannot reroll an operation');
  assert.notDeepEqual(plain(create(1001).effect.parts.map(({vx,vy,spin})=>({vx,vy,spin}))),initial,'different operations retain variation');
  assert.equal(f.calls().random,0,'painting must not consume any gameplay random values');
  state.asteroidDamage[700]=0;assert.equal(JSON.stringify(state),before,'painting cannot change resources or mining damage');
  assert.ok(f.calls().paint>0,'the test must use the production drawing path');
  assert.ok(initial.every(p=>p.spin>=-.1&&p.spin<=.1),'existing spin range is retained');
});

function replay(schedule){
  const f=fixture(),state={system:43,shipType:7,x:0,y:0,hull:50,shields:50,minerals:{},latinum:200,deuranium:5,
    planetPopulationCounts:{1:1000000000,2:2000000000},solPopulations:{3:1000000000,4:100000000},day:0};
  f.window.nativeAsteroidCombat.select(f.rock);
  assert.equal(f.window.nativeAsteroidCombat.mine(state,{x:0,y:0}).ok,true);
  for(let i=0;i<36;i++){
    f.window.nativeSimulation.advance(state,.25);f.window.nativeAsteroidCombat.advance(state,.25);
    if(schedule==='none')continue;
    const visible=schedule==='visible'||i%5===0,offset=visible?0:9000;
    f.ctx.save();f.ctx.rotate(i*.17);
    f.window.nativeAsteroidCombat.paint(f.ctx,{state,ship:{x:offset,y:0},cx:400,cy:300,zoom:1,w:800,h:600});f.ctx.restore();
  }
  f.window.nativePopulation.advanceSeconds(state,3);
  return {state:plain(state),physical:plain(f.physical),metrics:plain(f.window.nativeAsteroidCombat.metrics()),nextRandom:Array.from({length:8},()=>f.random()),randomCalls:f.calls().random,paints:f.calls().paint};
}
test('actual mining, physical chip trajectories and later population RNG stay identical with different camera paint schedules',()=>{
  const unseen=replay('none'),visible=replay('visible'),movingCamera=replay('moving');
  assert.ok(visible.paints>unseen.paints,'visible replay must actually draw mining artwork');
  assert.ok(unseen.physical.length>0,'the shared physical debris owner must receive mining chips');
  assert.ok(unseen.state.minedAsteroids.includes(700),'physical mining must complete');
  assert.equal(unseen.state.asteroidOreDrops[700],15,'one mining entitlement is preserved');
  for(const result of [visible,movingCamera]){
    assert.deepEqual(result.state,unseen.state);assert.deepEqual(result.physical,unseen.physical);
    assert.deepEqual(result.metrics,unseen.metrics);assert.deepEqual(result.nextRandom,unseen.nextRandom);
    assert.equal(result.randomCalls,unseen.randomCalls);
  }
});
