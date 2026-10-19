"""Exercise the Steamrunner example with real Canvas pixels and a controlled RAF clock."""
import functools
import http.server
import json
from pathlib import Path
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / ('steamrunner-repair-installed' if len(sys.argv) > 1 else 'steamrunner-repair')
OUTPUT.mkdir(parents=True, exist_ok=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = None
if len(sys.argv) > 1:
    base = sys.argv[1].rstrip('/')
else:
    server = http.server.ThreadingHTTPServer(
        ('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'

errors, failed = [], []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1050}, device_scale_factor=1)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
        page.add_init_script("""(() => {
          if(!localStorage.getItem('vexedMirrorRepairWorkshop.v1'))localStorage.setItem('vexedMirrorRepairWorkshop.v1',JSON.stringify({version:1,credits:5700,owned:{basic:2,upgraded:0,advanced:0}}));
          let callbacks=[],now;
          const nativeFrame=window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>{
            if(callback.name!=='frame')return nativeFrame(callback);
            callbacks.push(callback);return callbacks.length;
          };
          window.advanceShowcase=seconds=>{
            now??=performance.now();
            for(let i=0;i<Math.ceil(seconds*60);i++){
              now+=1000/60;const batch=callbacks;callbacks=[];batch.forEach(callback=>callback(now));
            }
          };
        })();""")
        page.goto(base + '/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=1')
        page.wait_for_function('window.showcaseState && showcaseState().ready', polling=50)
        page.locator('#drone-auto-attack').uncheck()
        page.locator('button[data-stage="3"]').click()
        page.locator('#repair-demo').click()
        page.evaluate('advanceShowcase(.05)')
        start = page.evaluate('showcaseState()')
        assert start['ship'] == 1 and start['repair']['progress'] == 0
        assert start['repair']['changedPixels'] > 1000
        assert start['repair']['missingPixels'] > 0
        assert start['repair']['supportShip'] == start['combat']['firingShip']
        assert len(start['repair']['drones']) == 2
        assert start['repair']['drones'][1]['phase'] == 'waiting'
        assert start['repair']['sparkCount'] == 0
        for drone in start['repair']['drones']:
            home = start['repair']['hangar']
            assert abs(drone['position']['x'] - home['x']) < 2
            assert abs(drone['position']['y'] - home['y']) < 2
        assert page.locator('#destroy').is_disabled()
        page.locator('#scene').screenshot(path=str(OUTPUT / 'start.png'))
        page.evaluate('advanceShowcase(.65)')
        launch = page.evaluate('showcaseState().repair')
        assert all(drone['phase'] == 'approach' for drone in launch['drones'])
        assert launch['sparkCount'] == 0 and launch['progress'] == 0
        page.locator('#scene').screenshot(path=str(OUTPUT / 'launch.png'))
        page.evaluate('advanceShowcase(3)')
        page.locator('#scene').screenshot(path=str(OUTPUT / 'repair.png'))
        middle = page.evaluate('showcaseState()')
        assert 0 < middle['repair']['progress'] < 1
        assert all(drone['phase'] == 'welding' for drone in middle['repair']['drones'])
        assert middle['repair']['sparkCount'] > 10
        ballistic = page.evaluate("""() => {
          const before=showcaseState().repair;
          advanceShowcase(1/60);
          const after=showcaseState().repair,dt=(after.elapsed-before.elapsed)/1000;
          const s=before.sparks.find(s=>s.ttl-s.age>50);
          const next=after.sparks.find(n=>n.born===s.born&&n.vx===s.vx&&n.vy===s.vy&&n.droneId===s.droneId);
          return !!next&&Math.abs(next.position.x-s.position.x-s.vx*dt)<.00001&&Math.abs(next.position.y-s.position.y-s.vy*dt)<.00001;
        }""")
        assert ballistic, 'welding sparks preserve their emission position and fly without gravity'
        page.evaluate("""() => {
          window.repairBeamAligned=()=>{
            const s=showcaseState();
            const welding=s.repair.drones.filter(drone=>drone.phase==='welding');
            return welding.length>0&&welding.every(drone=>{
              const x=(drone.hit.x+drone.nozzle.x)/2,y=(drone.hit.y+drone.nozzle.y)/2;
              const data=document.getElementById('scene').getContext('2d').getImageData(Math.round(x)-9,Math.round(y)-9,18,18).data;
              let green=0;
              for(let i=0;i<data.length;i+=4)if(data[i+1]>100&&data[i+1]>data[i]*1.15&&data[i+1]>data[i+2]*1.05)green++;
              const contact=document.getElementById('scene').getContext('2d').getImageData(Math.round(drone.hit.x)-2,Math.round(drone.hit.y)-2,4,4).data;
              let hot=0;
              for(let i=0;i<contact.length;i+=4)if(contact[i]>180&&contact[i+1]>160&&contact[i+2]>100)hot++;
              return green>3&&hot>0;
            });
          };
        }""")
        assert page.evaluate('repairBeamAligned()'), 'beam contact must match the hull repair coordinates'
        page.locator('#pause').click()
        paused = page.evaluate('showcaseState()')
        image = page.evaluate('document.getElementById("scene").toDataURL()')
        page.evaluate('advanceShowcase(2)')
        assert page.evaluate('showcaseState().repair') == paused['repair']
        after_image = page.evaluate('document.getElementById("scene").toDataURL()')
        assert image == after_image, 'pause freezes hull, beam and welding sparks'
        page.locator('#pause').click()
        page.locator('#slow').click()
        previous = page.evaluate('showcaseState().repair.elapsed')
        page.evaluate('advanceShowcase(1)')
        assert abs(page.evaluate('showcaseState().repair.elapsed') - previous - 250) < 1
        page.locator('#slow').click()
        page.locator('#rotate').click()
        page.evaluate('advanceShowcase(2)')
        assert page.evaluate('showcaseState().angle') > .6
        assert page.evaluate('repairBeamAligned()'), 'rotating hull keeps the beam attached to the repair'
        page.evaluate("document.getElementById('zoom').value=100;document.getElementById('zoom').dispatchEvent(new Event('input'));advanceShowcase(.05)")
        assert page.evaluate('repairBeamAligned()'), 'zoom changes preserve beam alignment'
        page.locator('#scene').screenshot(path=str(OUTPUT / 'rotating.png'))
        page.locator('#rotate').click()
        page.evaluate('advanceShowcase((showcaseState().repair.weldEnd+950-showcaseState().repair.elapsed)/1000)')
        returning = page.evaluate('showcaseState().repair')
        assert returning['phase'] == 'returning' and returning['progress'] == 1
        assert all(drone['phase'] in ('returning', 'docked') for drone in returning['drones'])
        assert returning['sparkCount'] == 0, 'beams and sparks stop after welding'
        page.locator('#scene').screenshot(path=str(OUTPUT / 'return.png'))
        page.evaluate('advanceShowcase((showcaseState().repair.duration-showcaseState().repair.elapsed)/1000+.1)')
        assert page.evaluate('showcaseState().repair === null && showcaseState().hull === 100')
        assert page.locator('#repair-demo').is_enabled()
        page.locator('#scene').screenshot(path=str(OUTPUT / 'complete.png'))

        # A stage button cancels cleanly; selecting a different ship releases
        # disabled controls and must never carry the Steamrunner surface over.
        page.locator('button[data-stage="3"]').click()
        page.locator('#repair-demo').click()
        page.evaluate('advanceShowcase(1)')
        page.locator('button[data-stage="2"]').click()
        page.evaluate('advanceShowcase(.1)')
        assert page.evaluate('showcaseState().repair === null && showcaseState().stage === 2')
        assert page.locator('#repair').is_enabled()
        page.locator('#repair').click()
        assert page.evaluate('showcaseState().repair !== null')
        page.locator('#reset').click()
        assert page.evaluate('showcaseState().repair === null && showcaseState().hull === 100')
        page.evaluate("document.getElementById('hull').value=80;document.getElementById('hull').dispatchEvent(new Event('input'))")
        page.locator('#repair').click()
        page.evaluate('advanceShowcase(showcaseState().repair.duration/1000+.1)')
        assert page.evaluate('showcaseState().hull === 100'), 'minor damage below the artwork threshold still repairs'
        page.locator('#firing-ship').select_option('1', force=True)
        page.wait_for_function('showcaseState().combat.firingShip===1', polling=50)
        page.locator('button[data-stage="3"]').click()
        page.locator('#repair-demo').click()
        assert page.evaluate('showcaseState().repair.supportShip===1')
        assert page.locator('#firing-ship').is_disabled(), 'launch owner stays consistent until the drones return'
        page.locator('#reset').click()

        text = page.locator('body').inner_text()
        assert '75\u2013100% hull' in text and '02 \u00b7 Light' in text
        assert '\u00e2\u20ac' not in text and '\u00c2' not in text, 'showcase labels must preserve UTF-8 punctuation'

        pixels = page.evaluate("""async () => {
          const images=await Promise.all([0,3].map(stage=>new Promise(resolve=>{
            const image=new Image();image.onload=()=>resolve(image);image.src=`showcase-assets/ship-1-${stage}.png`;
          })));
          const [intact,damaged]=images,w=intact.width,h=intact.height;
          const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
          const ctx=canvas.getContext('2d',{willReadFrequently:true}),layout={x:w/2,y:h/2,w,h};
          const pixels=image=>{ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);
            ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();return ctx.getImageData(0,0,w,h).data;};
          const old=pixels(damaged),goal=pixels(intact);
          const repair=steamrunnerRepair.create(damaged,intact,0,{layout:{x:540,y:253,w:275,h:353},angle:0,source:{centerX:135,centerY:425,w:58,h:88,a:1.17,shipId:6},fleet:{basic:2}});
          const paint=()=>{ctx.clearRect(0,0,w,h);repair.drawBody(ctx,layout,0);return ctx.getImageData(0,0,w,h).data;};
          const equal=(a,b)=>a.every((v,i)=>v===b[i]);
          if(!equal(paint(),old))throw Error('Repair must begin at the exact damaged artwork');
          repair.advance(6000);const mid=paint();
          if(equal(mid,old)||equal(mid,goal))throw Error('Repair must reveal partial solid artwork');
          const snapshot=JSON.stringify(repair.snapshot());paint();paint();
          if(snapshot!==JSON.stringify(repair.snapshot()))throw Error('Painting cannot advance repair');
          const welding=repair.snapshot();
          const effects=document.createElement('canvas');effects.width=900;effects.height=540;
          const fx=effects.getContext('2d',{willReadFrequently:true});
          repair.drawBeam(fx,{x:540,y:253,w:275,h:353},0,6000);
          const bits=fx.getImageData(0,0,900,540).data;
          let warm=0;
          for(let y=0;y<540;y++)for(let x=0;x<900;x++){
            const i=(y*900+x)*4;
            if(bits[i]>150&&bits[i]>bits[i+1]*1.15&&bits[i+1]>bits[i+2]*1.3&&bits[i+3]>20&&
              welding.drones.every(d=>Math.hypot(x-d.hit.x,y-d.hit.y)>13))warm++;
          }
          if(warm<4)throw Error('Welding must draw hot metal sparks beyond the contact glow');
          repair.advance(repair.snapshot().duration+50);
          const home=repair.snapshot();
          if(!home.drones.every(d=>d.phase==='docked'&&Math.hypot(d.position.x-home.hangar.x,d.position.y-home.hangar.y)<.001))throw Error('Both drones must return to their launch hangar');
          const end=paint(),fresh=pixels(intact);
          if(!equal(end,fresh))throw Error('Completed repair must exactly match intact artwork: '+JSON.stringify(
            Array.from(end.keys()).filter(i=>end[i]!==goal[i]).slice(0,12).map(i=>({i,got:end[i],want:goal[i],alpha:end[i-i%4+3]}))));
          return {exactStart:true,partialRebuild:true,exactFinish:true,paintingIsReadOnly:true,hotSparkPixels:warm,dronesDocked:true};
        }""")
        page.locator('#ship-select').select_option('2', force=True)
        try:
            page.wait_for_function('showcaseState().ready && showcaseState().ship===2', polling=50, timeout=10000)
        except Exception:
            print(json.dumps(page.evaluate('({state:showcaseState(),loading:document.getElementById("loading").textContent})')))
            raise
        assert page.locator('#repair-demo').is_hidden()
        assert page.locator('#destroy').is_enabled()
        page.locator('button[data-stage="2"]').click()
        page.locator('#repair').click()
        assert page.evaluate('showcaseState().hull===100 && showcaseState().repair===null')
        assert not errors, errors
        assert not failed, failed
        result = {'browserErrors': errors, 'failedRequests': failed, 'pixels': pixels,
                  'pause': True, 'slowMotion': True, 'rotationAndZoomAlignment': True, 'cancelAndReset': True,
                  'otherShipsUnchanged': True, 'missingPixels': start['repair']['missingPixels'],
                  'staggeredLaunch': True, 'ballisticWeldingSparks': ballistic, 'returnFlight': True, 'utf8Labels': True}
        (OUTPUT / 'report.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(json.dumps(result))
        browser.close()
finally:
    if server:
        server.shutdown()
