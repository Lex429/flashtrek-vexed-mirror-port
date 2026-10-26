"""Check actual flight flares, their pixels and occlusion with ship lighting off."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/parallax-flares'
OUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(
    ('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850}, reduced_motion='reduce')
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: errors.append(f'{response.status} {response.url}') if response.status >= 400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.nativeCombatShots?.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('''()=>{
          const original=vexedSpace.render;
          vexedSpace.render=function(ctx,...args){
            const radial=ctx.createRadialGradient;let gradients=0;
            ctx.createRadialGradient=function(...a){gradients++;return radial.apply(this,a);};
            try{return original.call(this,ctx,...args);}
            finally{ctx.createRadialGradient=radial;window.__flightFlareGradients=gradients;}
          };
          startNativeDevGame();
        }''')
        page.wait_for_function('()=>document.body.classList.contains("playing")&&window.__flightFlareGradients!==undefined', timeout=120000)
        # This must pass in normal flight with the shipped performance setting.
        assert page.evaluate('window.nativeFlightLightingEnabled') is False
        actual_gradients = page.evaluate('window.__flightFlareGradients')
        page.screenshot(path=str(OUT/'flight.png'))
        assert actual_gradients > 0, 'Actual flight skipped every background lens flare'
        report = page.evaluate('''()=>{
          window.requestAnimationFrame=()=>0;
          const canvas=document.createElement('canvas');canvas.width=900;canvas.height=650;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          const view={w:900,h:650,playerX:0,playerY:0,heading:0,reducedMotion:true};
          const draw=(objects=[],lights=false,heading=0)=>{
            window.nativeFlightLightingEnabled=lights;vexedSpace.enterSystem(1,true);
            vexedSpace.render(ctx,{...view,heading},objects);
            return {pixels:ctx.getImageData(0,0,900,650).data,gradients:__flightFlareGradients,light:vexedSpace.light};
          };
          const visible=draw(),partial=draw([{contains:(x)=>x<450}]),hidden=draw([{contains:()=>true}]);
          if(!(visible.gradients>partial.gradients&&partial.gradients>0&&hidden.gradients===0))throw Error('Flare occlusion failed');
          let flarePixels=0;
          for(let i=0;i<visible.pixels.length;i+=4){
            if(visible.pixels[i]+visible.pixels[i+1]+visible.pixels[i+2]>hidden.pixels[i]+hidden.pixels[i+1]+hidden.pixels[i+2]+2)flarePixels++;
          }
          if(flarePixels<100)throw Error('Flares emitted no visible halo pixels: '+flarePixels);
          if(visible.light!==null)throw Error('Background flares enabled directional ship lighting');
          const lit=draw([],true);
          if(!lit.light||lit.gradients!==visible.gradients)throw Error('Lighting toggle changed background flares');
          const first=vexedSpace.state.stars.find(s=>s.layer===5);
          const heading=Math.atan2(first.y-225,first.x-300);
          const toward=draw([],false,heading),away=draw([],false,heading+Math.PI);
          let facingPixels=0;
          for(let i=0;i<toward.pixels.length;i+=4)if(toward.pixels[i]!==away.pixels[i]||toward.pixels[i+1]!==away.pixels[i+1]||toward.pixels[i+2]!==away.pixels[i+2])facingPixels++;
          if(!facingPixels)throw Error('Flares lost approach/facing response');
          draw();const star=vexedSpace.state.stars.find(s=>s.layer===5),before={x:star.x,y:star.y};
          vexedSpace.update(.2,{locx:10,locy:5,speed:100});
          if(star.x===before.x&&star.y===before.y)throw Error('Parallax stopped moving');
          return {visibleGradients:visible.gradients,partialGradients:partial.gradients,occludedGradients:hidden.gradients,flarePixels,facingPixels,lightingOffPreserved:true,parallaxMotion:true};
        }''')
        assert not errors, errors
        report.update(actualFlightGradients=actual_gradients, errors=errors)
        (OUT/'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
