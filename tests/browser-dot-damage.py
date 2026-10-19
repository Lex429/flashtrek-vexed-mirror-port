"""Painted lamp masks, damage art, real hits and textured Dot destruction."""
import functools
import http.server
import json
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / ('dot-damage-installed' if len(sys.argv) > 1 else 'dot-damage')
OUTPUT.mkdir(parents=True, exist_ok=True)
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass
server = None
if len(sys.argv) > 1:
    base = sys.argv[1].rstrip('/')
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1050})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""(() => {
          let callbacks=[],now;const original=requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>{if(callback.name!=='frame')return original(callback);callbacks.push(callback);return callbacks.length;};
          window.advanceShowcase=seconds=>{now??=performance.now();for(let i=0;i<Math.ceil(seconds*60);i++){
            now+=1000/60;const batch=callbacks;callbacks=[];batch.forEach(callback=>callback(now));
          }};
        })();""")
        url = base + '/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=1'
        page.goto(url)
        page.wait_for_function('window.showcaseState && showcaseState().ready', polling=50)
        pixels = page.evaluate("""() => {
          const results={};
          const render=(tier,health,time=1234,lights=true,effects=false)=>{
            const c=document.createElement('canvas');c.width=c.height=320;dotSprites.drawPreview(c.getContext('2d'),tier,320,320,{health,maxHealth:100,time,lights,effects});return c;
          };
          const count=c=>{const data=c.getContext('2d').getImageData(0,0,320,320).data;let opaque=0,blue=0;
            for(let i=0;i<data.length;i+=4){if(data[i+3]>180)opaque++;if(data[i+3]>150&&data[i+2]>180&&data[i+2]>data[i]*1.4&&data[i+2]>data[i+1]*1.12)blue++;}return {opaque,blue};};
          const gallery=document.createElement('div');gallery.id='dot-test-gallery';Object.assign(gallery.style,{position:'absolute',left:'0',top:'0',zIndex:'999',background:'#0c1720',display:'grid',gridTemplateColumns:'repeat(5,200px)',gap:'8px',padding:'12px'});
          for(const tier of ['basic','upgraded','advanced']){
            const healths=[100,65,40,15,0],stages=healths.map(h=>render(tier,h)),stats=stages.map(count);
            if(!(stats[2].opaque<stats[0].opaque&&stats[3].opaque<stats[2].opaque&&stats[4].opaque<stats[3].opaque))throw Error(tier+' armor not progressively missing');
            if(stages.some((c,i)=>i&&c.toDataURL()===stages[i-1].toDataURL()))throw Error(tier+' stages identical');
            const lit=count(render(tier,100)),off=count(render(tier,100,1234,false));if(lit.blue<=off.blue*3)throw Error(tier+' lamp masks do not switch off');
            if(render(tier,100,1000).toDataURL()===render(tier,100,1500).toDataURL())throw Error(tier+' lights do not animate');
            const restored=render(tier,100).toDataURL();render(tier,15);if(render(tier,100).toDataURL()!==restored)throw Error(tier+' healing does not restore exact intact art');
            if(render(tier,0,1000,true,true).toDataURL()!==render(tier,0,2000,true,true).toDataURL())throw Error(tier+' dead model still powered');
            const lamps=healths.map(h=>dotSprites.inspect(tier,h,100,1234).lamps.filter(l=>l.on).length);
            if(lamps[0]<8||lamps[3]>=lamps[1]||lamps[4])throw Error(tier+' lamps do not fail with damage');
            stages.forEach((c,i)=>{const tile=document.createElement('div');const label=document.createElement('div');label.textContent=tier+' / '+['Intact','Light','Heavy','Severe','Destroyed'][i];label.style.cssText='color:#d2e5ee;font:12px sans-serif';c.style.cssText='width:200px;height:200px';tile.append(label,c);gallery.append(tile);});
            results[tier]={stats,lamps,fragments:dotSprites.inspect(tier).fragments};
          }document.body.append(gallery);return results;
        }""")
        page.locator('#dot-test-gallery').screenshot(path=str(OUTPUT / 'all-models-all-stages.png'))
        page.evaluate("document.getElementById('dot-test-gallery').remove()")
        inventory = page.evaluate('JSON.stringify(repairDroneFleet.read())')
        previews = page.locator('#drone-panel-repair canvas').evaluate_all('(cs)=>cs.map(c=>c.toDataURL())')
        page.locator('#dot-preview-condition').select_option('15')
        damaged = page.locator('#drone-panel-repair canvas').evaluate_all('(cs)=>cs.map(c=>c.toDataURL())')
        assert all(a != b for a, b in zip(previews, damaged))
        assert inventory == page.evaluate('JSON.stringify(repairDroneFleet.read())'), 'preview cannot damage the owned fleet'
        for tier in ['basic', 'upgraded', 'advanced']:
            saved = {'version': 2, 'credits': 6000, 'owned': {'basic': 0, 'upgraded': 0, 'advanced': 0},
                     'defense': {'basic': 0, 'upgraded': 0, 'advanced': 0}, 'wave': {'basic': 2, 'upgraded': 0, 'advanced': 0}}
            saved['owned'][tier] = 1
            page.evaluate('(s)=>localStorage.setItem("vexedMirrorRepairWorkshop.v1",JSON.stringify(s))', saved)
            page.reload()
            page.wait_for_function('window.showcaseState && showcaseState().ready', polling=50)
            page.locator('#drone-auto-attack').uncheck()
            page.locator('button[data-stage="3"]').click()
            page.locator('.drone-workshop-launch').click()
            page.evaluate('advanceShowcase(3)')
            page.locator('#weapon-select').select_option('beam:0', force=True)
            page.evaluate("for(let n=document.getElementById('visual-damage').parentElement;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true")
            page.locator('#visual-damage').check()
            page.evaluate("document.getElementById('hit-strength').value=20;document.getElementById('hit-strength').dispatchEvent(new Event('input'))")
            for expected in [0, 1, 2, 3, 4]:
                page.locator('#repair-attack-target').select_option('0')
                page.locator('#drone-test-fire').click()
                page.evaluate('advanceShowcase(.12)')
                drone = page.evaluate('showcaseState().repair.drones[0]')
                assert drone['damageStage'] == expected, (tier, expected, drone)
                assert drone['powered'] == (expected < 4)
                if expected == 3:
                    page.locator('#scene').screenshot(path=str(OUTPUT / f'{tier}-severe-in-flight.png'))
                    page.locator('#pause').click()
                    before = page.evaluate('JSON.stringify(showcaseState())')
                    frame = page.locator('#scene').evaluate('(c)=>c.toDataURL()')
                    page.evaluate('advanceShowcase(1)')
                    assert before == page.evaluate('JSON.stringify(showcaseState())')
                    assert frame == page.locator('#scene').evaluate('(c)=>c.toDataURL()')
                    page.locator('#pause').click()
            assert page.evaluate('showcaseState().repair.texturedWreckCount>0'), 'death must use the actual model armor'
            assert page.evaluate(f'repairDroneFleet.read().owned.{tier}===0')
            page.locator('#scene').screenshot(path=str(OUTPUT / f'{tier}-destroyed.png'))
        assert not errors, errors
        print(json.dumps({'models': pixels, 'realHealthStages': True, 'healingRestoresArt': True,
                          'previewDoesNotDamageFleet': True, 'texturedDestruction': True, 'pauseAndReadOnlyPainting': True, 'browserErrors': errors}))
        browser.close()
finally:
    if server:
        server.shutdown()
