"""All nine drone models belong to the main selector, with isolated inspection hull."""
import functools
import http.server
import json
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / ('drone-selector-installed' if len(sys.argv) > 1 else 'drone-selector')
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
        errors, missing = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: missing.append(response.url) if response.status >= 400 else None)
        page.add_init_script("""(() => {
          let callbacks=[],now;const original=requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>{if(callback.name!=='frame')return original(callback);callbacks.push(callback);return callbacks.length;};
          window.advanceShowcase=seconds=>{now??=performance.now();for(let i=0;i<Math.ceil(seconds*60);i++){
            now+=1000/60;const batch=callbacks;callbacks=[];batch.forEach(callback=>callback(now));
          }};
        })();""")
        page.goto(base + '/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=500')
        page.wait_for_function('window.showcaseState && showcaseState().ready', polling=50)
        assert page.evaluate('showcaseState().ship') == 500
        inventory = page.evaluate('JSON.stringify(repairDroneFleet.read())')
        page.locator('#fleet-filter').select_option('drones')
        assert page.locator('#ship-select option').count() == 9
        page.locator('#animation-filter').select_option('animated')
        assert page.locator('#ship-select option').count() == 9
        assert page.locator('#firing-ship option[value="500"]').count() == 0
        results = []
        for index, drone_id in enumerate(range(500, 509)):
            page.locator('#ship-select').select_option(str(drone_id))
            page.wait_for_function('(id)=>showcaseState().ready && showcaseState().ship===id', arg=drone_id, polling=50)
            role = ['repair', 'attack', 'defense'][index // 3]
            tier = ['basic', 'upgraded', 'advanced'][index % 3]
            health = ([60, 120, 220] if role == 'defense' else [40, 90, 180])[index % 3]
            state = page.evaluate('showcaseState()')
            assert state['kind'] == 'drone' and state['combat']['maxHull'] == health
            assert state['droneInspection']['role'] == role and state['droneInspection']['tier'] == tier
            assert state['combat']['shields'] == 0 and not state['shieldsEnabled']
            assert page.locator('#repair-workshop').is_hidden()
            assert page.locator('.cloak-controls').is_hidden() and page.locator('.shield-readout').is_hidden()
            assert page.locator('#cthia-controls').is_visible()
            thumbs = page.locator('.damage-strip img').evaluate_all('(xs)=>xs.map(x=>({src:x.src,ready:x.complete&&x.naturalWidth>0}))')
            assert len(thumbs) == 4 and len(set(t['src'] for t in thumbs)) == 4
            page.wait_for_function("[0,1,2,3].every(i=>document.getElementById('thumb-'+i).naturalWidth>0)")
            page.evaluate('advanceShowcase(.02)')
            if not state['paused']:
                page.locator('#pause').click()
            # Same simulation instant: power toggles must change the full-size canvas.
            page.evaluate('advanceShowcase(.02)')
            lit = page.locator('#scene').evaluate('(c)=>c.toDataURL()')
            page.locator('#ship-lights').click()
            page.evaluate('advanceShowcase(.02)')
            off = page.locator('#scene').evaluate('(c)=>c.toDataURL()')
            assert lit != off, (role, tier, 'full-size lamps do not toggle')
            page.locator('#ship-lights').click()
            stage_pictures = []
            for stage, percent in enumerate([100, 65, 40, 15]):
                page.locator(f'button[data-stage="{stage}"]').click()
                page.evaluate('advanceShowcase(.02)')
                state = page.evaluate('showcaseState()')
                assert state['stage'] == stage and state['droneInspection']['stage'] == stage
                assert abs(state['combat']['hull'] - health * percent / 100) < 1e-8
                stage_pictures.append(page.locator('#scene').evaluate('(c)=>c.toDataURL()'))
            assert len(set(stage_pictures)) == 4
            page.locator('#damage-effects').click()
            page.evaluate('advanceShowcase(.02)')
            assert stage_pictures[3] != page.locator('#scene').evaluate('(c)=>c.toDataURL()')
            page.locator('#damage-effects').click()
            if tier == 'advanced':
                page.locator('#scene').screenshot(path=str(OUTPUT / f'{role}-severe.png'))
            # Real weapon damage flows through the ordinary firing-ship and hit path.
            page.locator('#repair').click()
            page.locator('#weapon-select').select_option('beam:0', force=True)
            page.locator('#pause').click()
            page.locator('#fire-weapon').click()
            page.evaluate('advanceShowcase(.15)')
            state = page.evaluate('showcaseState()')
            assert state['hits'] == 1 and state['combat']['lastHit']['hullDamage'] > 0
            assert abs(state['combat']['hull'] - max(0, health - state['combat']['lastHit']['damage'])) < 1e-8, state['combat']
            page.locator('#repair').click()
            page.locator('#destroy').click()
            state = page.evaluate('showcaseState()')
            assert state['destroyed'] and not state['droneInspection']['powered']
            assert state['droneInspection']['wreckCount'] >= 10
            page.evaluate('advanceShowcase(.25)')
            page.locator('#pause').click()
            state_before = page.evaluate('JSON.stringify(showcaseState())')
            page.evaluate('advanceShowcase(1)')
            image_before = page.locator('#scene').evaluate('(c)=>c.toDataURL()')
            page.evaluate('advanceShowcase(1)')
            assert image_before == page.locator('#scene').evaluate('(c)=>c.toDataURL()')
            assert state_before == page.evaluate('JSON.stringify(showcaseState())')
            # Raising manual hull after death clears inspector wreckage and restores power.
            page.locator('#hull').evaluate("e=>{e.value=15;e.dispatchEvent(new Event('input'))}")
            state = page.evaluate('showcaseState()')
            assert not state['destroyed'] and state['droneInspection']['powered']
            assert state['droneInspection']['wreckCount'] == 0
            page.locator('#repair').click()
            assert inventory == page.evaluate('JSON.stringify(repairDroneFleet.read())')
            results.append({'id': drone_id, 'role': role, 'tier': tier, 'maxHealth': health})
        # Ordinary ship controls still work after inspecting every drone.
        page.locator('#next').click()
        page.wait_for_function('showcaseState().ready && showcaseState().ship===500')
        page.locator('#rotate').click()
        page.locator('#pause').click()
        page.evaluate('advanceShowcase(.5)')
        assert page.evaluate('showcaseState().angle') > 0
        page.locator('#zoom').evaluate("e=>{e.value=140;e.dispatchEvent(new Event('input'))}")
        page.evaluate('advanceShowcase(.02)')
        page.locator('#scene').screenshot(path=str(OUTPUT / 'main-drone-selector.png'))
        page.locator('#compare').click()
        page.evaluate('advanceShowcase(.02)')
        assert page.evaluate('showcaseState().compare')
        # The shared guided sequence can damage, destroy, then restore a selected drone.
        page.locator('#sequence').click()
        page.evaluate('advanceShowcase(14)')
        assert page.evaluate('showcaseState().hull') == 100
        assert not page.evaluate('showcaseState().destroyed || showcaseState().sequence')
        page.locator('#fleet-filter').select_option('all')
        page.locator('#ship-select').select_option('1')
        page.wait_for_function('showcaseState().ready && showcaseState().ship===1')
        assert page.locator('#repair-workshop').is_visible()
        assert inventory == page.evaluate('JSON.stringify(repairDroneFleet.read())')
        assert not errors, errors
        assert not missing, missing
        print(json.dumps({'mainSelector': results, 'fullSizeLightingAndStages': True, 'realWeaponDamage': True,
                          'matchingWrecks': True, 'inventoryUnchanged': True, 'pauseRotateZoom': True, 'browserErrors': errors}))
        browser.close()
finally:
    if server:
        server.shutdown()
