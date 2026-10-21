"""Exclusive, short Canvas presentation comparison; not a gameplay FPS benchmark."""
import argparse
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'ship-padding'
spec=importlib.util.spec_from_file_location('padding_timing_server',ROOT/'tests/browser-npc-performance.py')
perf=importlib.util.module_from_spec(spec);spec.loader.exec_module(perf)

BENCH=r'''async({seconds,windows,counts,presentation})=>{
 const cache=nativeShipSpriteCache,canvas=document.createElement('canvas');canvas.width=1280;canvas.height=850;
 document.body.replaceChildren(canvas);Object.assign(canvas.style,{display:'block',width:'1280px',height:'850px'});
 const ctx=canvas.getContext('2d'),raf=window.__paddingNativeRAF,assets=[];
 for(const type of [35,49,58,47,52,50])for(const fraction of [1,.4]){
   const asset=await vexedFlightAssets.loadShip(type,nativeShipDefinitions.get(type).hull*fraction);
   assets.push({asset,...nativeShipDefinitions.presentation(type)});
 }
 const readyStarted=performance.now();
 while(nativeShipEffects.metrics().pending||nativeDamageArtPreparation.snapshot().pending){if(performance.now()-readyStarted>120000)throw Error('Cold preparation did not settle before clean timing');await new Promise(resolve=>setTimeout(resolve,20));}
 const rows=[];cache.setBackend('canvas');
 for(const count of counts){
   cache.reset();const columns=count<=12?4:5,rowsCount=Math.ceil(count/columns),owners=Array.from({length:count},()=>({}));
   const paint=(fullSurface,time)=>{
     ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#030811';ctx.fillRect(0,0,1280,850);cache.beginFrame(ctx,{backend:'canvas'});
     for(let i=0;i<count;i++){const art=assets[i%assets.length],x=(i%columns+.5)*1280/columns,y=(Math.floor(i/columns)+.5)*850/rowsCount;
       vexedFlightAssets.drawShip(ctx,art.asset,x,y,art.width,.43*Math.sin(i*.7),time,{height:art.height,owner:owners[i],fullSurface,trimPadding:!fullSurface&&presentation==='clip',sourceCrop:!fullSurface&&presentation==='source',effectRate:20,light:{direction:.8,color:0xffdb9e}});
     }cache.endFrame(ctx);
   };
   for(let window=0;window<windows;window++)for(const fullSurface of window%2?[false,true]:[true,false]){
     let start=performance.now();while(performance.now()-start<1000){const t=await new Promise(raf);paint(fullSurface,1350+t-start);}
     const before=cache.snapshot(),intervals=[],draws=[];start=performance.now();let previous=start;
     while(performance.now()-start<seconds*1000){const now=await new Promise(raf);intervals.push(now-previous);previous=now;const began=performance.now();paint(fullSurface,1350+now-start);draws.push(performance.now()-began);}
     const after=cache.snapshot(),sorted=intervals.toSorted((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))],counters={};
     for(const key of Object.keys(after.counters))counters[key]=after.counters[key]-before.counters[key];
     const elapsed=intervals.reduce((a,b)=>a+b,0);rows.push({count,window,fullSurface,canvasFrameSubmissions:intervals.length,shipPaintSubmissions:intervals.length*count,compositorDeliveredFrames:null,
       elapsedMs:elapsed,fps:1000*intervals.length/elapsed,median:q(.5),p95:q(.95),p99:q(.99),worst:q(1),above33:intervals.filter(v=>v>33).length,above50:intervals.filter(v=>v>50).length,
       jsDrawMean:draws.reduce((a,b)=>a+b,0)/draws.length,counters,cache:{bytes:after.bytes,limits:after.limits}});
   }
 }
 return {purpose:'Renderer-only paired presentation diagnostic; identical fixed mixed fleet, animated artwork, attached visible canvas; no simulation, combat or gameplay performance claim',presentation,viewport:{width:1280,height:850,dpr:devicePixelRatio},seconds,windows,counts,rows};
}'''


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--seconds',type=float,default=5);parser.add_argument('--windows',type=int,default=3);parser.add_argument('--counts',default='12,25');parser.add_argument('--presentation',choices=['clip','source'],default='clip');args=parser.parse_args()
    OUTPUT.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(perf.SnapshotHandler,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));graphics=browser.new_browser_cdp_session().send('SystemInfo.getInfo');page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1);errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('()=>{window.__paddingNativeRAF=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=()=>0;}');page.wait_for_timeout(100)
            report=page.evaluate(BENCH,{'seconds':args.seconds,'windows':args.windows,'counts':[int(value) for value in args.counts.split(',')],'presentation':args.presentation});report.update(browser=browser.version,graphics=graphics,errors=errors);assert not errors,errors
            (OUTPUT/f'timing-{args.presentation}.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report));browser.close()
    finally:server.shutdown()


if __name__=='__main__':main()
