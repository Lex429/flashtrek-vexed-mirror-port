"""Compare the actual shared GPU hull lighting against the original ship renderer."""
import functools
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from local_site import Handler

CHECK=r"""async () => {
  const catalog=await fetch('../flashtrek-broken-mirror/effect-candidates.json').then(r=>r.json());
  await nativeEffectProfiles.ready;await nativeEffectProfiles.preview(catalog.profiles.find(p=>p.implementation==='cinematic-combat-v1'));
  nativeFlightLightingEnabled=true;
  const reference=referenceFlightRenderer(),container=document.createElement('div');document.body.append(container);
  const source=document.createElement('canvas');source.width=source.height=320;container.append(source);
  const gpu=await createVexedShieldPresentation({space:source,radii:()=>({rx:50,ry:70})});
  const make=()=>{const c=document.createElement('canvas');c.width=c.height=320;return c.getContext('2d',{willReadFrequently:true});};
  const a=make(),b=source.getContext('2d',{willReadFrequently:true}),combined=make(),results=[];
  for(const type of [7,47,57,59])for(const stage of [0,2,3])for(const angle of [0,.731,2.31]){
    const maximum=VexedMirrorWorld.ships.find(s=>s.id===type).hull,asset=await vexedFlightAssets.loadShip(type,maximum*[1,.7,.4,.1][stage]);
    const height=110,width=height*asset.width/asset.height,time=1450;
    const options={height,lights:true,damage:true,lightGain:2.8,lightBloom:2.5,light:{x:160+200*Math.cos(angle+.7),y:160+200*Math.sin(angle+.7),color:0xffdb9e}};
    a.clearRect(0,0,320,320);b.clearRect(0,0,320,320);combined.clearRect(0,0,320,320);
    reference(a,asset,160,160,width,angle,time,options);
    gpu.beginFrame(b);vexedFlightAssets.drawShip(b,asset,160,160,width,angle,time,options);gpu.endFrame(b,time);
    combined.drawImage(source,0,0);combined.drawImage(gpu.canvas,0,0);
    const before=a.getImageData(0,0,320,320).data,after=combined.getImageData(0,0,320,320).data;
    let count=0,error=0,significant=0;
    for(let i=0;i<before.length;i+=4)if(before[i+3]>3||after[i+3]>3){count++;let e=0;for(let c=0;c<4;c++)e+=Math.abs(before[i+c]-after[i+c]);error+=e;if(e>80)significant++;}
    const row={type,stage,angle,meanChannelError:error/Math.max(1,count*4),significantFraction:significant/Math.max(1,count)};results.push(row);
    if(row.meanChannelError>=8||row.significantFraction>=.10)throw Error('GPU lighting changed the ship: '+JSON.stringify(row));
  }
  const snapshot=gpu.snapshot();if(snapshot.resources.lightLayers!==12||snapshot.resources.lightUploads!==12)throw Error('Hull masks were uploaded more than once per art state');
  if(gpu.renderer.gl.getError()!==gpu.renderer.gl.NO_ERROR)throw Error('GPU lighting raised a WebGL error');
  gpu.destroy();container.remove();return {results,resources:snapshot.resources};
}"""

server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=90000)
        page.evaluate('window.requestAnimationFrame=()=>0');page.wait_for_timeout(100)
        page.add_script_tag(content=(ROOT/'tests/fixtures/reference-flight-renderer.js').read_text())
        result=page.evaluate(CHECK);assert not errors,errors
        output=ROOT/'test-results/cinematic-combat';output.mkdir(parents=True,exist_ok=True)
        (output/'gpu-lighting-pixels.json').write_text(json.dumps(result,indent=2))
        print(json.dumps({'scenarios':len(result['results']),'maxMeanError':max(r['meanChannelError'] for r in result['results']),'maskUploads':result['resources']['lightUploads'],'errors':errors}))
        browser.close()
finally:server.shutdown();server.server_close()
