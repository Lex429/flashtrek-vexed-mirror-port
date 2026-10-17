"""Actual Canvas lighting/warp regressions and isolated rendering cost measurements.

--revision c41559c --label before profiles unmodified Git sources. Pixel comparison
uses the frozen original light/warp implementation with identical decoded artwork.
Costs include a readback flush and are diagnostics, not portable FPS thresholds.
"""
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
OUTPUT = ROOT / 'test-results'
spec = importlib.util.spec_from_file_location('npc_perf', ROOT/'tests/browser-npc-performance.py')
perf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(perf)

SCENARIOS = r"""async () => {
  const check=(value,message)=>{if(!value)throw Error(message);};
  const reference=referenceFlightRenderer(),actual=vexedFlightAssets.drawShip;
  const canvas=()=>{const c=document.createElement('canvas');c.width=320;c.height=320;return c;};
  const original=canvas(),optimized=canvas(),a=original.getContext('2d',{willReadFrequently:true}),b=optimized.getContext('2d',{willReadFrequently:true});
  const gallery=document.createElement('canvas');gallery.width=1280;gallery.height=12*170;
  window.__renderPathGallery=gallery;
  gallery.id='render-path-gallery';const galleryContext=gallery.getContext('2d',{willReadFrequently:true});galleryContext.fillStyle='#030811';galleryContext.fillRect(0,0,gallery.width,gallery.height);
  const copyPixels=(context,x,y)=>{
    const pixels=context.getImageData(80,80,160,160),background=[3,8,17];
    for(let i=0;i<pixels.data.length;i+=4){const alpha=pixels.data[i+3]/255;
      for(let c=0;c<3;c++)pixels.data[i+c]=Math.round(pixels.data[i+c]*alpha+background[c]*(1-alpha));pixels.data[i+3]=255;}
    galleryContext.putImageData(pixels,x,y);
  };
  const results=[],costs=[];
  const options=(kind,angle,time)=>({height:110,lights:true,damage:true,lightGain:2.8,lightBloom:2.5,
    light:{x:160+200*Math.cos(angle),y:160+200*Math.sin(angle),color:0xffdb9e},
    ...(kind==='warp'?{kind:'departure',warpPulse:1,squeezeX:.82,alpha:.83}:{} )});
  for(const type of [7,47,57,59])for(const stage of [0,2,3]){
    const maximum=VexedMirrorWorld.ships.find(s=>s.id===type).hull;
    const asset=await vexedFlightAssets.loadShip(type,maximum*[1,.7,.4,.1][stage]);
    for(const kind of ['lighting','warp'])for(const heading of [0,.731,2.31]){
      const width=110*asset.width/asset.height,time=1450,appearance=options(kind,heading+.7,time);
      a.clearRect(0,0,320,320);b.clearRect(0,0,320,320);
      reference(a,asset,160,160,width,heading,time,appearance);actual(b,asset,160,160,width,heading,time,appearance);
      const before=a.getImageData(0,0,320,320).data,after=b.getImageData(0,0,320,320).data;
      let absolute=0,count=0,changed=0,max=0,significant=0;
      for(let i=0;i<before.length;i+=4)if(before[i+3]>3||after[i+3]>3){
        count++;let error=0;for(let channel=0;channel<4;channel++)error+=Math.abs(before[i+channel]-after[i+channel]);
        absolute+=error;max=Math.max(max,error/4);if(error>0)changed++;if(error>80)significant++;
      }
      const row={type,stage,kind,heading,coveredPixels:count,meanChannelError:absolute/Math.max(1,count*4),
        significantFraction:significant/Math.max(1,count),maxChannelAverage:max,changedPixels:changed};results.push(row);
      if(heading===.731){const line=[7,47,57,59].indexOf(type)*3+[0,2,3].indexOf(stage),column=kind==='warp'?640:0;
        copyPixels(a,column+100,line*170+10);copyPixels(b,column+350,line*170+10);
        galleryContext.fillStyle='#bed7e8';galleryContext.font='12px monospace';galleryContext.fillText(`${type} stage${stage} ${kind}`,column+2,line*170+18);
        galleryContext.fillText('reference',column+100,line*170+12);galleryContext.fillText('current',column+350,line*170+12);}
      // Rasterization changes are constrained on the ship's occupied pixels,
      // excluding background. Severe artwork has fast, simulation-clock sparks.
      check(row.meanChannelError<8,`Excessive visual change ${JSON.stringify(row)}`);
      check(row.significantFraction<.10,`Lost artwork/effects ${JSON.stringify(row)}`);
      // The same authoritative timestamp must produce identical pixels on pause.
      const stable=Array.from(after);b.clearRect(0,0,320,320);actual(b,asset,160,160,width,heading,time,appearance);
      check(b.getImageData(0,0,320,320).data.every((n,i)=>n===stable[i]),`Pause changed ${type}/${stage}/${kind}`);
    }
    if(window.__renderPathMicrobench!==false&&(stage===0||stage===2))for(const kind of ['lighting','warp']){
      const width=110*asset.width/asset.height,appearance=options(kind,.7);
      const sample=[],drawMs=[],readbackMs=[];
      for(let repeat=0;repeat<3;repeat++){
        const begin=performance.now();let draw=0,read=0;for(let i=0;i<120;i++){
          b.clearRect(0,0,320,320);let at=performance.now();actual(b,asset,160,160,width,.25+(i%60)*.002,1000+i*1000/60,appearance);
          draw+=performance.now()-at;at=performance.now();b.getImageData(160,160,1,1);read+=performance.now()-at;
        }sample.push((performance.now()-begin)/120);drawMs.push(draw/120);readbackMs.push(read/120);
      }
      costs.push({type,stage,kind,sourceWidth:asset.width,sourceHeight:asset.height,sampleMs:sample,
        meanMs:sample.reduce((n,v)=>n+v,0)/sample.length,drawMs,readbackMs});
    }
  }
  // Animation and cache-invalidation use time, actual artwork, damage stage,
  // light angle/color, dimensions, warp ordering and appearance flags.
  const asset=await vexedFlightAssets.loadShip(7),width=110*asset.width/asset.height;
  const capture=(time,appearance)=>{b.clearRect(0,0,320,320);actual(b,asset,160,160,width,.4,time,appearance);return b.getImageData(0,0,320,320).data;};
  const initial=capture(1000,options('lighting',.4)),later=capture(2000,options('lighting',.4));
  check(initial.some((n,i)=>n!==later[i]),'Animated lights stopped');
  const red=capture(1000,{...options('lighting',.4),light:{x:0,y:160,color:0xff0000}});
  check(initial.some((n,i)=>n!==red[i]),'Lighting cache ignored color/direction');
  const cache=window.nativeShipSpriteCache?.snapshot?.()||null;
  if(cache){check(cache.bytes<=cache.limits.bytes,'Unbounded sprite memory');check(cache.entries<=cache.limits.entries,'Unbounded sprite entries');}
  gallery.style.cssText='position:absolute;left:0;top:0;z-index:100000';document.body.append(gallery);
  return {visualScenarios:results,costs,cache,decodedCache:vexedFlightAssets.cacheSnapshot?.()||null};
}"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision')
    parser.add_argument('--label', default='after')
    parser.add_argument('--base-url')
    parser.add_argument('--visual-only', action='store_true', help='Run pixel/cache regressions without the timing loops')
    args = parser.parse_args()
    OUTPUT.mkdir(exist_ok=True)
    server = None
    if args.base_url:
        base = args.base_url.rstrip('/')
    else:
        perf.SnapshotHandler.revision = args.revision
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(perf.SnapshotHandler, directory=str(ROOT)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
    errors, failed = [], []
    try:
        with sync_playwright() as p:
            channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
            browser = p.chromium.launch(headless=True, **({'channel':channel} if channel else {}))
            page = browser.new_page(viewport={'width':1280,'height':850})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: failed.append(response.url) if response.status>=400 else None)
            page.goto(base+'/html-games/broken-mirror-port/index.html')
            page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
            page.evaluate('window.requestAnimationFrame=()=>0')
            page.wait_for_timeout(100)
            page.add_script_tag(content=(ROOT/'tests/fixtures/reference-flight-renderer.js').read_text())
            page.evaluate('(enabled)=>{window.__renderPathMicrobench=enabled;}', not args.visual_only)
            try:
                report = page.evaluate(SCENARIOS)
            except Exception:
                gallery = page.evaluate('()=>window.__renderPathGallery?.toDataURL().split(",")[1]||null')
                if gallery:
                    (OUTPUT/f'render-paths-{args.label}-failure.png').write_bytes(base64.b64decode(gallery))
                raise
            # The game intentionally clips its fixed-height viewport. Export the
            # full actual Canvas rather than a DOM screenshot clipped at 850px.
            gallery = page.evaluate('()=>window.__renderPathGallery.toDataURL().split(",")[1]')
            (OUTPUT/f'render-paths-{args.label}.png').write_bytes(base64.b64decode(gallery))
            report.update(label=args.label, revision=args.revision or 'working tree', browserVersion=browser.version,
                          viewport={'width':1280,'height':850}, errors=errors,failedRequests=failed)
            assert not errors, errors
            assert not failed, failed
            (OUTPUT/f'render-paths-{args.label}.json').write_text(json.dumps(report, indent=2))
            print(json.dumps({'visualScenarios':len(report['visualScenarios']), 'costs':report['costs'], 'cache':report['cache']}))
            browser.close()
    finally:
        if server:
            server.shutdown()


if __name__ == '__main__':
    main()
