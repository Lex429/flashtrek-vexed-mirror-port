"""Buy, upgrade, save and fly different repair fleets through the normal UI."""
import functools
import http.server
import json
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / ('drone-workshop-installed' if len(sys.argv) > 1 else 'drone-workshop')
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
        page = browser.new_page(viewport={'width': 1440, 'height': 1050}, device_scale_factor=1)
        errors, failed = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
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
        page.locator('#drone-auto-attack').uncheck()
        assert page.evaluate('repairDroneFleet.read().owned.basic===1 && repairDroneFleet.read().credits===6000')
        assert page.locator('[data-owned="basic"]').inner_text() == 'Owned: 1'
        previews = page.locator('#drone-panel-repair .drone-preview').evaluate_all('(items)=>items.map(canvas=>canvas.toDataURL())')
        assert len(set(previews)) == 3, 'tier previews must have distinct silhouettes and finishes'
        assert page.locator('#drone-panel-repair h4').all_text_contents() == ['Basic Dot\u2019s', 'Upgraded Dot\u2019s', 'Advanced Dot\u2019s']
        art = page.evaluate("""async()=>{
          const loaded=await dotSprites.ready;if(!loaded.every(Boolean))return false;
          for(const tier of ['basic','upgraded','advanced']){
            const picture=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=`showcase-assets/dot-${tier}.png`;});
            const expected=document.createElement('canvas');expected.width=expected.height=200;
            const g=expected.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(picture,6,6,188,188);
            const actual=document.querySelector(`#drone-panel-repair [data-tier="${tier}"] canvas`);
            const a=actual.getContext('2d').getImageData(0,0,200,200).data,b=g.getImageData(0,0,200,200).data;
            let shared=0,source=0;for(let i=3;i<b.length;i+=4)if(b[i]>180){source++;if(a[i]>180)shared++;}
            if(shared/source<.96)return false;
            if(dotSprites.inspect(tier).lamps.length<8)return false;
          }return true;
        }""")
        assert art, 'each Dot tier must render its supplied transparent PNG, not a placeholder'
        page.locator('#repair-workshop').screenshot(path=str(OUTPUT / 'workshop.png'))
        results = {}

        def mission(name, expected):
            page.locator('button[data-stage="3"]').click()
            page.locator('.drone-workshop-launch').click()
            start = page.evaluate('showcaseState().repair')
            assert sorted(d['tier'] for d in start['drones']) == sorted(expected)
            assert len({j['id'] for j in start['jobs']}) == len(start['jobs'])
            assert sum(j['cells'] for j in start['jobs']) == start['steps']
            assert page.locator('[data-buy-drone="basic"]').is_disabled()
            assert page.locator('.drone-workshop-reset').is_disabled()
            page.evaluate('advanceShowcase(8)')
            state = page.evaluate('showcaseState()')
            progress = state['repair']['progress'] if state['repair'] else 1
            results[name] = {'duration': start['duration'], 'progressAfter8s': progress}
            page.locator('#scene').screenshot(path=str(OUTPUT / (name + '.png')))
            page.locator('#reset').click()

        mission('basic', ['basic'])
        page.locator('[data-upgrade-drone="basic"]').click()
        assert page.evaluate('repairDroneFleet.read().credits===5400 && repairDroneFleet.read().owned.basic===0 && repairDroneFleet.read().owned.upgraded===1')
        mission('upgraded', ['upgraded'])
        page.locator('[data-upgrade-drone="upgraded"]').click()
        assert page.evaluate('repairDroneFleet.read().credits===3900 && repairDroneFleet.read().owned.advanced===1')
        mission('advanced', ['advanced'])
        page.locator('[data-buy-drone="basic"]').click()
        page.locator('[data-buy-drone="upgraded"]').click()
        mission('mixed', ['basic', 'upgraded', 'advanced'])
        page.locator('[data-buy-drone="advanced"]').click()
        mission('larger', ['basic', 'upgraded', 'advanced', 'advanced'])
        assert results['upgraded']['duration'] < results['basic']['duration']
        assert results['advanced']['duration'] < results['upgraded']['duration']
        assert results['mixed']['duration'] < results['advanced']['duration']
        assert results['larger']['duration'] < results['mixed']['duration']
        assert results['advanced']['progressAfter8s'] > results['upgraded']['progressAfter8s'] > results['basic']['progressAfter8s']
        assert results['mixed']['progressAfter8s'] > results['advanced']['progressAfter8s']
        assert page.evaluate('repairDroneFleet.read().credits===300')
        assert page.locator('[data-buy-drone="advanced"]').is_disabled()

        before = page.evaluate('repairDroneFleet.read()')
        page.reload()
        page.wait_for_function('window.showcaseState && showcaseState().ready', polling=50)
        page.locator('#drone-auto-attack').uncheck()
        assert page.evaluate('repairDroneFleet.read()') == before
        assert page.locator('[data-owned="advanced"]').inner_text() == 'Owned: 2'
        page.locator('button[data-stage="3"]').click()
        page.locator('.drone-workshop-launch').click()
        duration = page.evaluate('showcaseState().repair.duration')
        page.evaluate(f'advanceShowcase({duration / 1000 + .1})')
        assert page.evaluate('showcaseState().repair===null && showcaseState().hull===100')
        assert page.evaluate('repairDroneFleet.read()') == before, 'flying does not spend again or consume purchased drones'

        page.locator('.drone-workshop-reset').click()
        for _ in range(7):
            page.locator('[data-buy-drone="basic"]').click()
        assert page.evaluate('repairDroneFleet.read().owned.basic===8')
        assert page.locator('[data-buy-drone="basic"]').is_disabled()
        page.locator('[data-upgrade-drone="basic"]').click()
        assert page.evaluate('repairDroneFleet.read().owned.basic===7 && repairDroneFleet.read().owned.upgraded===1')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.locator('#repair-workshop').screenshot(path=str(OUTPUT / 'mobile.png'))
        assert page.locator('#repair-workshop').evaluate('(node)=>node.getBoundingClientRect().right<=innerWidth+1')
        assert not errors, errors
        assert not failed, failed
        report = {'fleets': results, 'savedPurchases': True, 'upgradeCharges': True, 'capacityAndFunds': True,
                  'distinctTierArt': True, 'browserErrors': errors, 'failedRequests': failed}
        (OUTPUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    if server:
        server.shutdown()
