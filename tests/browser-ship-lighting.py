"""Real-canvas turning, light-only invalidation and independent animation cadence."""
import argparse
import base64
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'ship-lighting'
spec = importlib.util.spec_from_file_location('lighting_server', ROOT / 'tests/browser-npc-performance.py')
perf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(perf)

SCENARIO = r"""async () => {
 const check=(value,message)=>{if(!value)throw Error(message)},cache=nativeShipSpriteCache;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=320;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const type=7,maximum=nativeShipDefinitions.get(type).hull,asset=await vexedFlightAssets.loadShip(type,maximum);
 const width=110*asset.width/asset.height,light={x:50,y:40,color:0xffdb9e};
 const draw=(time,heading=0,appearance={})=>{ctx.clearRect(0,0,320,320);
   vexedFlightAssets.drawShip(ctx,asset,160,160,width,heading,time,{height:110,light,...appearance});};
 const pixels=()=>Array.from(ctx.getImageData(0,0,320,320).data);
 cache.reset();draw(1000,0,{effectRate:60});const first=pixels(),before=cache.snapshot();
 for(let i=1;i<=120;i++)draw(1000,i*.02,{effectRate:60});
 const rotated=cache.snapshot();
 check(rotated.counters.canvasAllocations===before.counters.canvasAllocations,'Turning allocated new raster surfaces');
 check(rotated.counters.spriteMisses===1&&rotated.counters.spriteRebuilds===1,'Turning reran frozen animated shaders');
 check(rotated.counters.lightingMisses===121,'Turning failed to refresh the directional mask');
 draw(1000,0,{effectRate:60});check(pixels().every((value,index)=>value===first[index]),'Returning heading retained stale lighting');
 draw(1000,0,{effectRate:60,light:{x:270,y:270,color:0x779dff}});
 check(pixels().some((value,index)=>value!==first[index]),'Changed light/color did not reach rendered pixels');
 const relit=pixels();draw(1000,0,{effectRate:60,light:{x:270,y:270,color:0x779dff}});
 check(pixels().every((value,index)=>value===relit[index]),'Paused draws changed actual pixels');
 const cadence=[];
 for(const rate of [20,60]){
   cache.reset();for(let i=0;i<60;i++)draw(i*1000/60+.01,i*.02,{effectRate:rate});
   const result=cache.snapshot();check(result.counters.spriteRebuilds===rate,'Incorrect healthy animation cadence '+rate);
   check(result.counters.spriteMisses===1,'Animation continually invalidated its sprite');cadence.push({rate,...result});
 }
 const gallery=document.createElement('canvas');gallery.width=960;gallery.height=760;
 const g=gallery.getContext('2d');g.fillStyle='#030811';g.fillRect(0,0,960,760);
 const stages=[];
 for(const [row,fraction]of [1,.4,.1].entries()){
   const current=await vexedFlightAssets.loadShip(type,maximum*fraction),stage=current.damageStage;
   for(let column=0;column<4;column++){
     ctx.clearRect(0,0,320,320);
     vexedFlightAssets.drawShip(ctx,current,160,160,width,column*Math.PI/2,1450,{height:110,light,effectRate:60});
     const image=ctx.getImageData(100,100,120,120),occupied=Array.from(image.data).filter((v,i)=>i%4===3&&v>20).length;
     check(occupied>100,'Damage/turning appearance disappeared '+stage+'/'+column);
     g.drawImage(canvas,column*240-40,row*250-25);
     g.fillStyle='#c6e5f5';g.font='15px monospace';g.fillText('stage '+stage+' / '+column*90+' deg',column*240+25,row*250+25);
     stages.push({stage,heading:column*Math.PI/2,occupied});
   }
 }
 window.__lightingGallery=gallery;
 return {pausedRotation:{before,after:rotated},cadence,stages,cache:cache.snapshot()};
}"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    server = None
    if args.base_url:
        base = args.base_url.rstrip('/')
    else:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(perf.SnapshotHandler, directory=str(ROOT)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
    errors, failed = [], []
    try:
        with sync_playwright() as p:
            channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
            browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
            page = browser.new_page(viewport={'width': 1280, 'height': 850})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
            page.goto(base + '/html-games/broken-mirror-port/index.html')
            page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
            page.evaluate('window.requestAnimationFrame=()=>0')
            page.wait_for_timeout(100)
            report = page.evaluate(SCENARIO)
            data = page.evaluate('() => __lightingGallery.toDataURL().split(",")[1]')
            (OUTPUT / 'turning-lighting-damage.png').write_bytes(base64.b64decode(data))
            assert not errors, errors
            assert not failed, failed
            report.update(browserVersion=browser.version, viewport={'width': 1280, 'height': 850}, errors=errors, failedRequests=failed)
            (OUTPUT / 'report.json').write_text(json.dumps(report, indent=2))
            print(json.dumps(report))
            browser.close()
    finally:
        if server:
            server.shutdown()


if __name__ == '__main__':
    main()
