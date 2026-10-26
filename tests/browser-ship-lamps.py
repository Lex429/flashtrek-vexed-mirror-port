"""Compare GPU running lamps with the original Canvas artwork and damage fallback.

Uses an isolated save. Set VEXED_BROWSER_EXECUTABLE to match the playing browser.
"""
import base64
import functools
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from local_site import Handler


class Quiet(Handler):
    def log_message(self, *args):
        pass


CHECK = r"""async () => {
  nativeFlightLightingEnabled=true;nativeHullBatchEnabled=false;
  window.requestAnimationFrame=()=>0;
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:0;top:0;width:340px;height:340px;z-index:99999';document.body.append(host);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=340;host.append(canvas);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const api=await createVexedShieldPresentation({space:canvas,radii:()=>({rx:50,ry:70})});
  const final=document.createElement('canvas');final.width=final.height=340;
  const output=final.getContext('2d',{willReadFrequently:true}),results=[],shots=[];
  const frames=new Map();
  for(const type of [1,6,7,29,39,52,56,426,427])for(const stage of [0,3])for(const angle of [0,.73])for(const sun of [false,true]){
    const max=nativeShipDefinitions.get(type).hull;
    const asset=await vexedFlightAssets.loadShip(type,max*(stage===0?1:.1));
    for(const time of [0,1450]){
      const rendered=[];
      for(const gpu of [false,true]){
        nativeShipLampGPUEnabled=gpu;ctx.clearRect(0,0,340,340);api.beginFrame(ctx);
        vexedFlightAssets.drawShip(ctx,asset,170,170,110*asset.width/asset.height,angle,time,{height:110,lights:true,damage:false,
          ...(sun?{light:{x:370,y:310,color:0xffdb9e}}:{})});
        api.endFrame(ctx,time);output.clearRect(0,0,340,340);output.drawImage(canvas,0,0);
        if(!api.canvas.hidden)output.drawImage(api.canvas,0,0);
        const pixels=output.getImageData(0,0,340,340).data;rendered.push(pixels);
        if(type===6&&stage===0&&angle===0&&!sun){
          frames.set(`${gpu}:${time}`,pixels);
          if(time===1450)shots.push({gpu,image:final.toDataURL()});
        }
      }
      let sum=0;for(let i=0;i<rendered[0].length;i++)sum+=Math.abs(rendered[0][i]-rendered[1][i]);
      results.push({type,stage,angle,time,sun,meanError:sum/rendered[0].length});
    }
  }
  const pulseChanges=[false,true].map(gpu=>{
    const a=frames.get(`${gpu}:0`),b=frames.get(`${gpu}:1450`);
    return a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0);
  });
  const resources=api.snapshot().shipLamps;api.destroy();
  // Exercise the standalone adapter used by the older Games Hub build.
  const integrated=window.vexedShieldGPU;window.vexedShieldGPU=null;nativeShipLampGPUEnabled=true;
  const asset=await vexedFlightAssets.loadShip(6,nativeShipDefinitions.get(6).hull);
  nativeShipLampGPU.beginStandalone(ctx);
  vexedFlightAssets.drawShip(ctx,asset,170,170,100,0,1450,{height:110,lights:true,damage:false});
  nativeShipLampGPU.endStandalone(ctx);
  const overlay=host.querySelector('#gpu-ship-lamp-overlay');
  const standalone={visible:!overlay.hidden,stats:nativeShipLampGPU.snapshot(canvas)};
  nativeShipLampGPUEnabled=false;nativeShipLampGPU.beginStandalone(ctx);standalone.disabled=overlay.hidden;
  nativeShipLampGPUEnabled=true;nativeShipLampGPU.beginStandalone(ctx);nativeShipLampGPU.endStandalone(ctx);
  standalone.emptyHidden=overlay.hidden;
  window.vexedShieldGPU=integrated;host.remove();
  return {results,shots,resources,pulseChanges,standalone};
}"""


def main():
    output = ROOT / 'test-results/ship-lights'
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='vexed-lamp-pixels-') as storage:
        server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
        server.state = Path(storage)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                executable = os.environ.get('VEXED_BROWSER_EXECUTABLE')
                launch = {'executable_path': executable} if executable else {'channel': os.environ.get('BROWSER_CHANNEL', 'msedge')}
                browser = p.chromium.launch(headless=True, **launch)
                page = browser.new_page(viewport={'width': 1280, 'height': 850})
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
                page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
                assert page.evaluate('window.nativeFlightLightingEnabled===true'), 'Fresh gameplay must start with ship lighting enabled'
                page.evaluate('window.requestAnimationFrame=()=>0')
                page.wait_for_timeout(100)
                result = page.evaluate(CHECK)
                for shot in result.pop('shots'):
                    (output / ('lamps-gpu.png' if shot['gpu'] else 'lamps-canvas.png')).write_bytes(base64.b64decode(shot['image'].split(',')[1]))
                result['errors'] = errors
                (output / 'pixels.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
                assert not errors, errors
                assert max(r['meanError'] for r in result['results']) < 3, result['results']
                assert all(r['meanError'] == 0 for r in result['results'] if r['stage'] == 3)
                assert all(v > 0 for v in result['pulseChanges']), 'Running lamps stopped blinking'
                assert result['resources']['fallbacks'] == 0, result['resources']
                assert result['resources']['layers'] <= result['resources']['limits']['layers']
                assert result['standalone']['visible'] and result['standalone']['disabled'] and result['standalone']['emptyHidden'], result['standalone']
                print(json.dumps({'cases': len(result['results']), 'maxMeanError': max(r['meanError'] for r in result['results']), 'pulseChanges': result['pulseChanges'], 'standalone': result['standalone'], 'errors': errors}))
                browser.close()
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    main()
