"""Compare fleet batching with the shared Canvas owner, including lamp timing/order."""
import base64,functools,json,os,sys,threading
from pathlib import Path
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
REPO=Path(__file__).resolve().parents[1];ROOT=Path(os.environ.get('VEXED_EFFECT_TEST_ROOT',REPO));sys.path.insert(0,str(REPO/'tools'))
from local_site import Handler
CHECK=r'''async()=>{
 nativeHullBatchEnabled=true;
 const make=()=>{const c=document.createElement('canvas');c.width=480;c.height=360;return c.getContext('2d',{willReadFrequently:false});};
 const a=make(),b=make(),results=[];
 function clear(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#020710';ctx.fillRect(0,0,480,360);}
 for(const type of [6,7,39,29,47,57,59,58]){
  const asset=await vexedFlightAssets.loadShip(type,nativeShipDefinitions.get(type).hull);
  for(const lights of [false,true])for(const height of [44,110])for(const angle of [0,.731,2.31])for(const time of [1000,1450,2000]){
   nativeFlightLightingEnabled=lights;const appearance={height,lights,lightGain:2.8,lightBloom:2.5,light:{x:460,y:180,color:0xffdb9e}};
   const w=height*asset.width/asset.height;clear(a);clear(b);
   vexedFlightAssets.drawShip(a,asset,240,180,w,angle,time,appearance);
   const queued=nativeHullBatch.snapshot().ships;nativeHullBatch.begin(b);vexedFlightAssets.drawShip(b,asset,240,180,w,angle,time,appearance);nativeHullBatch.end(b);
   if(height===44&&nativeHullBatch.snapshot().ships!==queued+1)throw Error('Small fleet hull did not use the batch: '+type);
   const before=a.getImageData(0,0,480,360).data,after=b.getImageData(0,0,480,360).data;
   let count=0,error=0,significant=0;
   for(let i=0;i<before.length;i+=4)if(before[i]>3||before[i+1]>8||before[i+2]>18||after[i]>3||after[i+1]>8||after[i+2]>18){count++;let e=0;for(let c=0;c<3;c++)e+=Math.abs(before[i+c]-after[i+c]);error+=e;if(e>80)significant++;}
   const row={type,lights,height,angle,time,meanChannelError:error/Math.max(1,count*3),significantFraction:significant/Math.max(1,count)};results.push(row);
   if(row.meanChannelError>=8||row.significantFraction>=.10){const gallery=document.createElement('canvas');gallery.width=960;gallery.height=360;gallery.getContext('2d').drawImage(a.canvas,0,0);gallery.getContext('2d').drawImage(b.canvas,480,0);window.__batchFailure=gallery.toDataURL();throw Error('Fleet batch changed artwork: '+JSON.stringify(row));}
   clear(b);nativeHullBatch.begin(b);vexedFlightAssets.drawShip(b,asset,240,180,w,angle,time,appearance);nativeHullBatch.end(b);
   const paused=b.getImageData(0,0,480,360).data;if(paused.some((x,i)=>x!==after[i]))throw Error('Pause changed the batch');
  }
 }
 const asset=await vexedFlightAssets.loadShip(7,nativeShipDefinitions.get(7).hull),height=44,w=height*asset.width/asset.height;
 nativeFlightLightingEnabled=false;
 const draw=(ctx,x,angle)=>vexedFlightAssets.drawShip(ctx,asset,x,180,w,angle,1450,{height,lights:false});
 clear(a);clear(b);draw(a,230,.7);draw(a,245,-.7);nativeHullBatch.begin(b);draw(b,230,.7);draw(b,245,-.7);nativeHullBatch.end(b);
 let before=a.getImageData(0,0,480,360).data,after=b.getImageData(0,0,480,360).data,error=0,n=0;
 for(let i=0;i<before.length;i++){error+=Math.abs(before[i]-after[i]);n++;}if(error/n>.2)throw Error('Overlapping hull order changed');
 // A single art object may appear with different lamp/size settings in one frame.
 nativeFlightLightingEnabled=true;clear(a);clear(b);
 for(const ctx of [a,b]){if(ctx===b)nativeHullBatch.begin(b);
  vexedFlightAssets.drawShip(ctx,asset,180,180,w,0,1450,{height,lights:false});
  vexedFlightAssets.drawShip(ctx,asset,300,180,w,0,1450,{height,lights:true});
  if(ctx===b)nativeHullBatch.end(b);}
 before=a.getImageData(0,0,480,360).data;after=b.getImageData(0,0,480,360).data;error=0;
 for(let i=0;i<before.length;i++)error+=Math.abs(before[i]-after[i]);if(error/before.length>.2)throw Error('Different lamps reused a pending sprite layer');
 nativeFlightLightingEnabled=false;
 const uploads=nativeHullBatch.snapshot().uploads;
 for(let frame=0;frame<20;frame++){clear(b);nativeHullBatch.begin(b);draw(b,240,.7);nativeHullBatch.end(b);}
 if(nativeHullBatch.snapshot().uploads!==uploads)throw Error('Stable hull uploads every frame');
 const composites=nativeHullBatch.snapshot().composites;clear(b);nativeHullBatch.begin(b);
 for(let i=0;i<10;i++)draw(b,30+i*45,0);nativeHullBatch.end(b);
 if(nativeHullBatch.snapshot().composites!==composites+1)throw Error('Separated hulls did not share a composite');
 nativeHullBatch.begin(b);draw(b,240,0);const pending=nativeHullBatch.snapshot().composites;
 nativeAsteroidCombat.drawTargetFrame(b,{name:'Target',size:44},240,180,1,240);nativeHullBatch.end(b);
 if(nativeHullBatch.snapshot().composites!==pending+1)throw Error('Target marker did not flush pending hulls');
 for(let i=0;i<70;i++){const art=document.createElement('canvas');art.width=art.height=32;art.getContext('2d').fillRect(0,0,32,32);
  nativeHullBatch.begin(b);vexedFlightAssets.drawShip(b,{art,width:32,height:32,damageStage:0},240,180,32,0,0,{height:32,lights:false});nativeHullBatch.end(b);}
 if(nativeHullBatch.snapshot().artLayers>64||!nativeHullBatch.snapshot().evictions)throw Error('Fleet atlas was not bounded');
 const damaged=await vexedFlightAssets.loadShip(7,nativeShipDefinitions.get(7).hull*.4);
 clear(b);nativeHullBatch.begin(b);draw(b,220,0);vexedFlightAssets.drawShip(b,damaged,260,180,w,0,1450,{height,lights:false});nativeHullBatch.end(b);
 const beforeCull=nativeHullBatch.snapshot().culled;nativeHullBatch.begin(b);draw(b,-500,0);nativeHullBatch.end(b);
 if(nativeHullBatch.snapshot().culled!==beforeCull+1)throw Error('Offscreen hull was prepared');
 const snapshot=nativeHullBatch.snapshot();if(!snapshot.available||snapshot.contextLosses||snapshot.rejected||snapshot.glError)throw Error('GPU batch unavailable/rejected');
 nativeFlightLightingEnabled=false;nativeHullBatchEnabled=undefined;const autoFrames=nativeHullBatch.snapshot().frames;
 nativeHullBatch.begin(b);draw(b,240,0);nativeHullBatch.end(b);if(nativeHullBatch.snapshot().frames!==autoFrames)throw Error('Automatic unlit path bypassed the immutable Canvas cache');
 nativeFlightLightingEnabled=true;nativeHullBatch.begin(b);draw(b,240,0);nativeHullBatch.end(b);if(nativeHullBatch.snapshot().frames!==autoFrames+1)throw Error('Automatic lighting path did not use the GPU batch');
 nativeHullBatchEnabled=true;nativeFlightLightingEnabled=false;
 const catalog=await fetch('../flashtrek-broken-mirror/effect-candidates.json').then(r=>r.json());await nativeEffectProfiles.ready;await nativeEffectProfiles.preview(catalog.profiles.find(p=>p.implementation==='cinematic-battle-v2'));
 const host=document.createElement('div');host.append(b.canvas);document.body.append(host);clear(b);
 const api=await createVexedShieldPresentation({space:b.canvas,radii:()=>({rx:20,ry:28})});api.beginFrame(b);nativeHullBatch.begin(b);
 draw(b,240,.7);nativeEffectProfiles.queueWeapon(b,{kind:'beam',x1:100,y1:180,x2:240,y2:180,thickness:2,color:0xffa632,age:85,duration:180,units:1});nativeHullBatch.end(b);
 api.submit(b,{entity:{},id:'batched',heading:.7-Math.PI/2,dimensions:{width:w,height},definition:{shields:100}},{x:240,y:180,zoom:1},{x:20,y:0,born:1000,kind:'beam',charge:.8,absorbed:20,shieldCapacity:100},1085,{front:true});api.endFrame(b,1085);
 const combined=api.snapshot().resources;if(!combined.radianceInstances||!combined.sourceCaptures||api.renderer.gl.getError())throw Error('Batched hull lost weapon lighting/refraction');api.destroy();host.remove();
 return {results,snapshot,combined};
}'''
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,channel='msedge');page=b.new_page(viewport={'width':1280,'height':720},bypass_csp=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('window.nativeHullBatch&&window.nativeCombatShots?.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('window.requestAnimationFrame=()=>0');page.wait_for_timeout(100)
  try:result=page.evaluate(CHECK)
  except Exception:
   failure=page.evaluate('window.__batchFailure');out=REPO/'test-results/cinematic-battle';out.mkdir(parents=True,exist_ok=True)
   if failure:(out/'batch-failure.png').write_bytes(base64.b64decode(failure.split(',')[1]))
   raise
  assert not errors,errors
  out=REPO/'test-results/cinematic-battle';out.mkdir(parents=True,exist_ok=True);(out/'hull-batch-pixels.json').write_text(json.dumps(result,indent=2))
  print(json.dumps({'scenarios':len(result['results']),'maxMeanError':max(r['meanChannelError'] for r in result['results']),'snapshot':result['snapshot'],'errors':errors}));b.close()
finally:server.shutdown();server.server_close()
