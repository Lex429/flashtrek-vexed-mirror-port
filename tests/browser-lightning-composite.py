"""Lightning must never darken the cloud or expose rectangular crop seams."""
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/lightning-composite'
OUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
report = dict(passed=False, errors=[])
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page()
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.route('**/index.html', lambda r: r.fulfill(content_type='text/html', body='<script src="dev-nebula-storm.js"></script>'))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        report['pixels'] = page.evaluate('''()=>{
          const view={w:763,h:469,cameraX:0,cameraY:0,zoom:1},state={devMode:true,system:1},current={eligible:true,enabled:true,preset:'badlands',patch:{x:0,y:0,width:900,height:700,angle:.3}};
          const cloud=Object.assign(document.createElement('canvas'),{width:view.w,height:view.h}),c=cloud.getContext('2d');
          const gradient=c.createLinearGradient(0,0,view.w,view.h);gradient.addColorStop(0,'rgba(150,65,23,.7)');gradient.addColorStop(1,'rgba(79,39,19,.4)');c.fillStyle=gradient;c.fillRect(0,0,view.w,view.h);
          c.clearRect(300,180,24,90);c.clearRect(337,195,18,72);
          const results=[];let image;
          for(const scale of [1,1.25,1.7777777777777777,2.2222222222222223]){
            const renderer=nativeDevNebulaStorm.createRenderer();renderer.frame(state,.01,view,current);renderer.trigger(state,current);renderer.trigger(state,current);renderer.triggerSheet(state,current);renderer.frame(state,.01,view,current);renderer.frame(state,.205,view,current);
            for(const pass of ['back','front'])for(const opaque of [false,true]){
              const output=Object.assign(document.createElement('canvas'),{width:Math.ceil(view.w*scale),height:Math.ceil(view.h*scale)}),g=output.getContext('2d',{willReadFrequently:true});
              function draw(lit){g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.clearRect(0,0,output.width,output.height);if(opaque){g.fillStyle='#233d59';g.fillRect(0,0,output.width,output.height);}g.save();g.scale(scale,scale);if(opaque)g.globalCompositeOperation='screen';const paint=ctx=>ctx.drawImage(cloud,0,0);if(lit)renderer.paint(g,pass,paint);else paint(g);g.restore();return new Uint8ClampedArray(g.getImageData(0,0,output.width,output.height).data);}
              const base=draw(false),lit=draw(true);let darkened=0,alphaErrors=0,litPixels=0,worstDarkening=0;
              for(let i=0;i<lit.length;i+=4){let delta=0;for(let k=0;k<3;k++){delta=Math.max(delta,base[i+k]-lit[i+k]);}worstDarkening=Math.max(worstDarkening,delta);if(delta>2&&base[i+3]>100)darkened++;if(Math.abs(base[i+3]-lit[i+3])>2)alphaErrors++;if(lit[i]-base[i]>10)litPixels++;}
              results.push({scale,pass,opaque,darkened,alphaErrors,litPixels,worstDarkening});if(scale===1.7777777777777777&&pass==='back'&&opaque)image=output.toDataURL();
            }
          }
          return {results,image};
        }''')
        (OUT / 'lightning.png').write_bytes(base64.b64decode(report['pixels'].pop('image').split(',')[1]))
        report['passed'] = not report['errors'] and all(r['darkened'] == 0 and r['alphaErrors'] == 0 and r['litPixels'] > 1000 for r in report['pixels']['results'])
        browser.close()
finally:
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    server.shutdown()
    server.server_close()
print(json.dumps(report))
assert report['passed'], 'Lightning darkened the cloud or changed its opacity; see retained pixel report.'
