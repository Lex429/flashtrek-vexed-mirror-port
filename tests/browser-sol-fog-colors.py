"""Real Sol color previews, unchanged density/wakes, animation and original palettes."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/sol-fog-colors'
OUT.mkdir(parents=True, exist_ok=True)



class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
report = dict(passed=False, errors=[], failedRequests=[], colors={})
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport=dict(width=1280, height=850), reduced_motion='no-preference')
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.on('response', lambda r: report['failedRequests'].append(r.url) if r.status >= 400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeDevFog.material()?.field.ready', timeout=120000)
        page.evaluate('''()=>{const s=nativeNpcDev.getState();nativeShipMotion.stop(s);nativeDevFog.reset({ahead:0});}''')
        page.wait_for_function('()=>nativeDevFog.material()?.field.ready', timeout=120000)
        page.evaluate('''async()=>{
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          await nativeDevFog.material().field.flush();window.__colourField=nativeDevFog.material().field;
          window.__colourClock=__colourField.metrics().clock;window.__colourDensity=Array.from(__colourField.density);
        }''')
        report['renderer'] = page.evaluate('''()=>{
          const gas=nativeNebulaGas,view={w:600,h:600},planes=[{x:300,y:300,width:600,height:600,angle:0,alpha:.9},{x:300,y:300,width:600,height:600,angle:0,alpha:0},{x:300,y:300,width:600,height:600,angle:0,alpha:0}];
          const c=document.createElement('canvas'),g=c.getContext('2d',{willReadFrequently:true});
          function read(colour,time=1.2){const image=gas.render(view,planes,2,time,19.813,{densityFloor:.24,colourPreview:colour});c.width=image.width;c.height=image.height;g.drawImage(image,0,0);return g.getImageData(0,0,c.width,c.height).data;}
          const original=read('original'),four=read('four'),samples={},points=[[-.42,-.42],[.42,-.42],[-.42,.42],[.42,.42]],names=['purple','red','blue','yellow'];
          let alphaErrors=0;for(let i=3;i<four.length;i+=4)if(four[i]!==original[i])alphaErrors++;
          if(alphaErrors)throw Error('Palette changed gas density '+alphaErrors);
          points.forEach(([u,v],index)=>{let sums=[0,0,0],n=0;const x=Math.round((u*.5+.5)*c.width),y=Math.round((v*.5+.5)*c.height);
            for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const i=((y+dy)*c.width+x+dx)*4;if(four[i+3]<20)continue;for(let k=0;k<3;k++)sums[k]+=four[i+k];n++;}
            if(n<20)throw Error('Color region is not visible '+names[index]);samples[names[index]]=sums.map(s=>s/n);
          });
          const [pr,pg,pb]=samples.purple,[rr,rg,rb]=samples.red,[br,bg,bb]=samples.blue,[yr,yg,yb]=samples.yellow;
          if(!(pb>pr&&pr>pg&&rr>rg*1.5&&rr>rb*1.5&&bb>bg&&bg>br&&yr>yg&&yg>yb*1.5))throw Error('Wrong preview colors '+JSON.stringify(samples));
          const later=read('four',4);let changed=0;for(let i=0;i<four.length;i++)if(Math.abs(four[i]-later[i])>3)changed++;
          if(changed<500)throw Error('The gas stopped evolving');
          return {samples,alphaErrors,animatedPixels:changed/4,metrics:gas.metrics()};
        }''')
        assert report['renderer']['metrics']['backend'] == 'webgl2'
        page.wait_for_timeout(150)
        page.screenshot(path=str(OUT / 'sol-four-colors.png'))
        page.evaluate('''()=>{const gas=nativeNebulaGas;window.nativeNebulaGas={...gas,render(...args){window.__colorPhase=args[3];return gas.render(...args);}};}''')
        page.locator('#devToolsBtn').click()
        assert page.locator('[data-dev-fog-colour]').input_value() == 'four'
        for colour in ['purple', 'red', 'blue', 'yellow', 'original', 'four']:
            page.locator('[data-dev-fog-colour]').select_option(colour)
            page.wait_for_timeout(100)
            row = page.evaluate('''colour=>{
              const m=nativeDevFog.material(),s=nativeDevFog.snapshot();let error=0;
              for(let i=0;i<m.field.density.length;i++)error=Math.max(error,Math.abs(m.field.density[i]-__colourDensity[i]));
              if(m.field!==__colourField||m.field.metrics().clock!==__colourClock||error||s.colour!==colour)throw Error('Color reset the material '+JSON.stringify({error,colour,s:s.colour}));
              return {colour,densityError:error,sameField:true,clock:m.field.metrics().clock};
            }''', colour)
            report['colors'][colour] = row
            if colour in ['purple', 'red', 'blue', 'yellow']:
                page.locator('#dialog [data-close]').click()
                page.wait_for_timeout(100)
                page.screenshot(path=str(OUT / f'sol-{colour}.png'))
                page.locator('#devToolsBtn').click()
        page.locator('[data-dev-fog-colour-chip="purple"]').click()
        assert page.locator('[data-dev-fog-colour]').input_value() == 'purple'
        assert page.locator('[data-dev-fog-colour-chip="purple"]').get_attribute('aria-pressed') == 'true'
        phase = page.evaluate('window.__colorPhase')
        page.emulate_media(reduced_motion='reduce')
        page.locator('[data-dev-fog-colour-chip="yellow"]').click()
        page.wait_for_timeout(150)
        assert page.evaluate('nativeDevFog.snapshot().colour') == 'yellow'
        assert page.evaluate('nativeDevFog.material().field===__colourField')
        assert page.evaluate('window.__colorPhase') == phase, 'Selecting a color reset the frozen gas phase'
        report['reducedMotionPreview'] = True
        assert not report['errors'], report['errors']
        assert not report['failedRequests'], report['failedRequests']
        report['passed'] = True
        browser.close()
finally:
    (OUT / 'functional.json').write_text(json.dumps(report, indent=2))
    server.shutdown()
    server.server_close()
print(json.dumps(report))
