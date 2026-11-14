const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function fixture(){
  const attributes=new Map(),labels=[],moves=[],canvas={style:{},getBoundingClientRect:()=>({width:160,height:120}),
    setAttribute:(key,value)=>attributes.set(key,value),addEventListener(){}};
  const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),fillText:text=>labels.push(text),moveTo:(x,y)=>moves.push([x,y])},
    {get:(target,key)=>target[key]||(()=>{})});canvas.getContext=()=>context;
  const stage={append(){},style:{setProperty(){}}},footer={getBoundingClientRect:()=>({height:40})};
  let ships=[],target=null;
  const window={devicePixelRatio:1,nativeManualFlight:{guidance:()=>null,position:s=>({x:s.x+12000,y:s.y-8000})},nativeSolAsteroids:{nearby:()=>[]},
    nativeCivilianTraffic:{localShips:()=>ships,target:()=>target},nativeSolEconomy:{target:()=>null}};
  let elements=0;
  const document={createElement:()=>elements++===0?canvas:{width:0,height:0,getContext:()=>context},getElementById:()=>stage,querySelector:()=>footer};
  const Image=function(){this.complete=false;},ResizeObserver=function(){this.observe=()=>{}};
  vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/native-radar.js','utf8'),{window,document,Image,ResizeObserver,performance:{now:()=>0},clearTimeout,setTimeout});
  return {window,canvas,attributes,labels,moves,setShips:value=>{ships=value;},setTarget:value=>{target=value;}};
}

test('radar reads only presentation fields while retaining visible and selected distant contacts',()=>{
  const f=fixture(),near={id:1,x:10,y:20,heading:.7,name:'Nearby'},far={id:2,x:5000,y:0,heading:0,name:'Distant'};
  Object.defineProperty(near,'equipment',{enumerable:true,get(){throw Error('Radar copied simulation equipment');}});
  f.setShips([near,far,{id:3,x:NaN,y:0,name:'Invalid'}]);
  const state={system:2,x:0,y:0,angle:0};f.window.nativeRadar.paint(state,true);
  assert.ok(f.attributes.get('aria-label').includes('1 ship contacts'));
  assert.ok(f.labels.includes('X: 12,000  Y: -8,000'),'header uses galaxy units while nearby contact geometry remains local');
  f.setTarget(far);f.window.nativeRadar.paint(state,true);
  assert.equal(f.window.nativeRadar.snapshot().backdropBuilds,1,'moving/retargeting contacts reuse the radar artwork');
  assert.ok(f.attributes.get('aria-label').includes('2 ship contacts'));
  assert.ok(f.attributes.get('aria-label').includes('Targeted ship: Distant'));
  const count=f.labels.length;f.window.nativeRadar.paint(state,false);
  assert.equal(f.labels.length,count);assert.equal(f.canvas.hidden,true);
});

test('radar rebuilds its static artwork after a backing-size change',()=>{
  const f=fixture(),state={system:2,x:0,y:0,angle:0};f.window.nativeRadar.paint(state,true);
  f.canvas.getBoundingClientRect=()=>({width:320,height:240});f.window.nativeRadar.paint(state,true);
  assert.equal(f.window.nativeRadar.snapshot().backdropBuilds,2);
  assert.equal(f.window.nativeRadar.snapshot().backdropBytes,320*240*4);
});

test('radar keeps the same nearest five rocks and stable ties while excluding saved mined/destroyed slots',()=>{
  const f=fixture(),rocks=[{slotId:1,x:50,y:0},{slotId:2,x:-25,y:0},{slotId:3,x:25,y:0},{slotId:4,x:75,y:0},{slotId:5,x:100,y:0},{slotId:6,x:125,y:0},{slotId:7,x:150,y:0},{slotId:8,x:1,y:0},{slotId:9,x:2,y:0},{slotId:10,x:NaN,y:0}];
  const state={system:2,x:0,y:0,angle:0,minedAsteroids:[8],destroyedAsteroids:[9]};
  f.window.nativeSolAsteroids.nearby=()=>rocks;f.window.nativeRadar.paint(state,true);f.moves.length=0;f.window.nativeRadar.paint(state,true);
  assert.deepEqual(f.moves.slice(0,5),[[79,55],[81,55],[82,55],[83,55],[84,55]],'Nearest/tied radar diamonds changed order or included an excluded slot');
  assert.deepEqual(rocks.map(r=>r.slotId),[1,2,3,4,5,6,7,8,9,10],'Drawing reordered authoritative rock data');
});
