const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('repeated mining reuses exact image samples and seams without GPU canvas readback',()=>{
 let reads=0,canvases=0;const firstOptions=[];
 const makeContext=canvas=>new Proxy({getImageData(){reads++;assert.equal(canvas.options.willReadFrequently,true,'readback context selected before drawing');return {data:new Uint8ClampedArray(canvas.width*canvas.height*4).fill(255)};}},{get(t,key){return key in t?t[key]:()=>{};},set(t,k,v){t[k]=v;return true;}});
 const document={createElement(){canvases++;const canvas={width:0,height:0,getContext(_type,options){if(!this.context){this.options=options||{};firstOptions.push(this.options);this.context=makeContext(this);}return this.context;}};return canvas;}};
 const image={complete:true,naturalWidth:80,naturalHeight:80},window={nativeSolAsteroids:{image:()=>image},nativeEffectVisibility:{mining:()=>true}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/asteroid-mining-effects.js'),'utf8'),{window,document,console});
 const context=makeContext({}),make=()=>({born:0,rock:{size:60,angle:0,file:'rock.png'}}),one=make(),two=make(),args={x:0,y:0,source:{x:100,y:0},zoom:1,now:100,w:800,h:600};
 window.nativeAsteroidMiningEffects.draw(context,one,args);assert.equal(reads,5);const prepared=canvases;
 window.nativeAsteroidMiningEffects.draw(context,two,args);assert.equal(reads,5,'warm encounter performs no pixel reads');assert.equal(canvases-prepared,2,'only per-effect trail and arc surfaces are created');
 assert.equal(one.effect.seams,two.effect.seams);assert.equal(one.effect.parts[0].samples,two.effect.parts[0].samples);assert.notEqual(one.effect.parts[0],two.effect.parts[0],'each asteroid retains independent animation motion');
});
