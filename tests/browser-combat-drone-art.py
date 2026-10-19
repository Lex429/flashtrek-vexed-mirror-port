"""Supplied combat models: five states, lamp masks, real hits and gun origins."""
import functools
import http.server
import json
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / ('combat-drone-art-installed' if len(sys.argv) > 1 else 'combat-drone-art')
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
        page.goto(base + '/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=1')
        page.wait_for_function('window.showcaseState && showcaseState().ready', polling=50)
        pixels = page.evaluate("""async()=>{
          if(!(await droneSprites.ready).every(Boolean))throw Error('sprite preparation failed');
          const gallery=document.createElement('div');gallery.id='combat-art-gallery';gallery.style.cssText='position:absolute;left:0;top:0;z-index:999;background:#0c1720;display:grid;grid-template-columns:repeat(5,200px);gap:8px;padding:12px';
          const results={};
          for(const role of ['attack','defense'])for(const tier of ['basic','upgraded','advanced']){
            const render=(health,lights=true,time=1234,effects=false)=>{const c=document.createElement('canvas');c.width=c.height=320;droneSprites.drawPreview(c.getContext('2d'),tier,320,320,{role,health,maxHealth:100,time,lights,effects});return c;};
            const count=c=>{const data=c.getContext('2d').getImageData(0,0,320,320).data;let opaque=0,hot=0,armor=0;
              for(let i=0;i<data.length;i+=4){const [r,g,b,a]=data.slice(i,i+4);if(a<180)continue;opaque++;
                if(role==='attack'?r>210&&g>105&&g>b*1.5&&r>g*1.05:g>180&&b>200&&g>r*1.4)hot++;
                if(role==='attack'?r>140&&g<70&&b<70:b>120&&b>r*1.4&&g<140)armor++;
              }return {opaque,hot,armor};};
            const images=[100,65,40,15,0].map(h=>render(h)),stats=images.map(count),off=count(render(100,false));
            if(stats[0].hot<=off.hot*2)throw Error(role+tier+' powered lamps not masked');
            if(!(stats[2].opaque<stats[0].opaque&&stats[3].opaque<stats[2].opaque&&stats[4].opaque<stats[3].opaque))throw Error(role+tier+' armor not missing');
            if(render(100,true,1000).toDataURL()===render(100,true,1500).toDataURL())throw Error('no lamp animation');
            if(render(0,true,1000,true).toDataURL()!==render(0,true,2000,true).toDataURL())throw Error('dead lights/effects active');
            const picture=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=droneSprites.definitions[role][tier].src;});
            const raw=document.createElement('canvas');raw.width=raw.height=320;const g=raw.getContext('2d');g.drawImage(picture,6,6,308,308);
            if(off.armor<count(raw).armor*.92)throw Error(role+tier+' painted armor mistaken for lamps');
            const source=document.createElement('canvas');source.width=source.height=1254;source.getContext('2d').drawImage(picture,0,0);
            for(const [x,y] of droneSprites.definitions[role][tier].muzzles)if(source.getContext('2d').getImageData(x,y,1,1).data[3]<200)throw Error('weapon mount outside supplied model');
            images.forEach((c,i)=>{const tile=document.createElement('div'),label=document.createElement('div');label.textContent=role+' / '+tier+' / '+['Intact','Light','Heavy','Severe','Destroyed'][i];label.style.cssText='color:#c8e0eb;font:11px sans-serif';c.style.cssText='width:200px;height:200px';tile.append(label,c);gallery.append(tile);});
            results[role+'-'+tier]={stats,off,lamps:[100,65,40,15,0].map(h=>droneSprites.inspect(tier,h,100,1234,role).lamps.filter(l=>l.on).length)};
          }document.body.append(gallery);return results;
        }""")
        page.locator('#combat-art-gallery').screenshot(path=str(OUTPUT / 'six-models-five-states.png'))
        page.evaluate("document.getElementById('combat-art-gallery').remove()")
        for role in ['attack', 'defense']:
            page.locator(f'[data-drone-role="{role}"]').click()
            before = page.locator(f'#drone-panel-{role} canvas').evaluate_all('(cs)=>cs.map(c=>c.toDataURL())')
            inventory = page.evaluate('JSON.stringify(repairDroneFleet.read())')
            page.locator(f'#{role}-preview-condition').select_option('15')
            after = page.locator(f'#drone-panel-{role} canvas').evaluate_all('(cs)=>cs.map(c=>c.toDataURL())')
            assert all(a != b for a, b in zip(before, after))
            assert inventory == page.evaluate('JSON.stringify(repairDroneFleet.read())')
            for tier in ['basic', 'upgraded', 'advanced']:
                empty = {'basic': 0, 'upgraded': 0, 'advanced': 0}
                saved = {'version': 2, 'credits': 6000, 'owned': {**empty, 'basic': 1}, 'defense': empty.copy(), 'wave': empty.copy()}
                saved['defense' if role == 'defense' else 'wave'][tier] = 1
                page.evaluate('(s)=>localStorage.setItem("vexedMirrorRepairWorkshop.v1",JSON.stringify(s))', saved)
                page.reload()
                page.wait_for_function('window.showcaseState && showcaseState().ready', polling=50)
                page.locator('#drone-auto-attack').uncheck()
                page.locator('button[data-stage="3"]').click()
                page.locator('.drone-workshop-launch').click()
                page.evaluate('advanceShowcase(1)')
                if role == 'attack':
                    page.locator('[data-drone-role="attack"]').click()
                    page.locator('.drone-wave-launch').click()
                    page.evaluate('advanceShowcase(.15)')
                target = page.evaluate('(role)=>showcaseState().droneBattle.drones.find(d=>d.role===role).id', role)
                page.locator('#weapon-select').select_option('beam:0', force=True)
                page.evaluate("for(let n=document.getElementById('visual-damage').parentElement;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true")
                page.locator('#visual-damage').check()
                page.evaluate("document.getElementById('hit-strength').value=20;document.getElementById('hit-strength').dispatchEvent(new Event('input'))")
                for expected in [0, 1, 2, 3, 4]:
                    page.locator('#repair-attack-target').select_option(target)
                    page.locator('#drone-test-fire').click()
                    page.evaluate('advanceShowcase(.12)')
                    actor = page.evaluate('(id)=>showcaseState().droneBattle.drones.find(d=>d.id===id)', target)
                    assert actor['damageStage'] == expected and actor['powered'] == (expected < 4), actor
                assert page.evaluate('showcaseState().droneBattle.texturedWreckCount>0')
                assert page.evaluate('repairDroneFleet.read().owned.basic===1 && repairDroneFleet.read().credits===6000')
                if role == 'defense':
                    assert page.evaluate(f'repairDroneFleet.read().defense.{tier}===0')
        # Real hostile/escort shots originate at the supplied art's gun emitters.
        page.locator('#reset').click()
        page.locator('.drone-workshop-reset').click()
        page.locator('[data-drone-role="defense"]').click()
        page.locator('[data-buy-defense="advanced"]').click()
        page.locator('#drone-auto-attack').check()
        page.locator('button[data-stage="3"]').click()
        page.locator('.drone-workshop-launch').click()
        mounts = page.evaluate("""()=>{
          const seen=new Set();let checked=0;
          for(let i=0;i<600;i++){
            advanceShowcase(1/60);const b=showcaseState().droneBattle;
            for(const shot of b.shots){
              const m=shot.mount,p=droneSprites.muzzle(m.tier,shot.role,m.barrel),c=Math.cos(m.heading),s=Math.sin(m.heading);
              if(Math.hypot(shot.source.x-(m.x+p.x*c-p.y*s),shot.source.y-(m.y+p.x*s+p.y*c))>1e-6)throw Error('shot detached from gun mount');
              seen.add(shot.role);checked++;
            }
          }return {roles:[...seen].sort(),checked};
        }""")
        assert mounts['roles'] == ['attack', 'defense'] and mounts['checked'] > 0, mounts
        assert not errors, errors
        print(json.dumps({'sixSuppliedModels': True, 'fiveHealthStatesEach': True, 'pixels': pixels,
                          'previewDoesNotDamageFleet': True, 'actualWeaponDamageStages': True,
                          'texturedDestruction': True, 'weaponMounts': mounts, 'browserErrors': errors}))
        browser.close()
finally:
    if server:
        server.shutdown()
