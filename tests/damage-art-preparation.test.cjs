const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

function fixture(){
  const timers=[];let elapsed=0;
  class Canvas{
    constructor(){this.width=0;this.height=0;}
    getContext(){return this.context??=new Context(this);}
  }
  class Context{
    constructor(canvas){this.canvas=canvas;}
    createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};}
    drawImage(source){this.data=new Uint8ClampedArray(source.data||source.getContext('2d').data);}
    getImageData(){return {data:this.data||new Uint8ClampedArray(this.canvas.width*this.canvas.height*4)};}
    putImageData(image){this.data=new Uint8ClampedArray(image.data);}
    fillRect(){}
  }
  const window={},context=vm.createContext({window,document:{createElement:()=>new Canvas()},console,Int16Array,Uint8ClampedArray,
    performance:{now:()=>elapsed+=.05},setTimeout:callback=>{timers.push(callback);return timers.length;}});
  for(const file of ['showcase-stage-fragments.js','cthia-destruction.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror',file),'utf8'),context);
  const frames=Array.from({length:4},(_,stage)=>{
    const width=48,height=64,data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width-stage*7;x++)data.set([x+20,y+40,120,255],(y*width+x)*4);
    return {width,height,data};
  });
  const flush=()=>{let calls=0;while(timers.length){timers.shift()();assert.ok(++calls<10000,'bounded cooperative queue');}return calls;};
  return {window,frames,timers,flush};
}

test('fragment and wreck pixel partition preparation yields to one bounded shared queue',async()=>{
  const {window,frames,timers,flush}=fixture(),destruction=window.createShipDestruction();
  const fragments=window.showcaseStageFragments.prepareAsync(frames,[[8,16],[35,42]]);
  const wreck=destruction.prepareAsync(frames,{sites:[['bow',8,16],['stern',35,42]],structural:true,core:[24,32]});
  assert.equal(destruction.audit().length,0,'pixel processing did not run synchronously');
  assert.equal(timers.length,1,'all classes share one scheduled callback');
  const callbacks=flush();await wreck;const prepared=await fragments;
  assert.ok(callbacks>1,'large enough preparation yields between chunks');
  for(const stage of destruction.audit())assert.equal(stage.sourcePixels,stage.cutPixels,'every source pixel has exactly one wreck owner');
  assert.ok(prepared[1].length>0);assert.ok(destruction.memoryBytes()>0);
  const metrics=window.nativeDamageArtPreparation.snapshot();
  assert.equal(metrics.pending,0);assert.equal(metrics.completed,2);assert.equal(metrics.failed,0);
  assert.ok(metrics.maxSliceMs<3,'mocked clock demonstrates global slice budget');
});

test('synchronous showcase API retains the exact source pixels and structural metadata',()=>{
  const {window,frames}=fixture(),destruction=window.createShipDestruction();
  destruction.prepare(frames,{sites:[['bow',8,16],['stern',35,42]],partition:{owner:(x)=>x<24?0:1},structural:true,farTravel:true});
  for(const stage of destruction.audit()){
    assert.equal(stage.sourcePixels,stage.cutPixels);assert.equal(stage.structural,true);assert.ok(stage.edgePixels>0);
  }
  const state={time:0,angle:0,debris:[],particles:[]};
  destruction.emit(state,{x:0,y:0,w:48,h:64},piece=>({x:piece.x*48,y:piece.y*64}),0,1);
  assert.equal(state.debris.reduce((n,piece)=>n+piece.pixels,0),frames[0].width*frames[0].height);
});
