"""Exercise role upgrades, hostile waves, escorts, evasion and saved casualties."""
import functools
import http.server
import json
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / ('drone-battle-installed' if len(sys.argv) > 1 else 'drone-battle')
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
        page.locator('#drone-auto-attack').uncheck()
        def tab(role):
            page.locator(f'[data-drone-role="{role}"]').click()
        def advance(seconds):
            page.evaluate('(s)=>advanceShowcase(s)', seconds)
        def reset():
            page.locator('#reset').click()
            page.locator('.drone-workshop-reset').click()
        def launch():
            page.locator('button[data-stage="3"]').click()
            page.locator('.drone-workshop-launch').click()
            tab('attack')
            page.locator('.drone-wave-launch').click()
        previews = page.locator('.drone-preview').evaluate_all('(items)=>items.map(c=>c.toDataURL())')
        assert len(set(previews)) == 9, 'all three roles and three tiers need distinct art'
        tab('defense')
        page.locator('[data-buy-defense="basic"]').click()
        page.locator('[data-upgrade-defense="basic"]').click()
        page.locator('[data-upgrade-defense="upgraded"]').click()
        assert page.evaluate('repairDroneFleet.read().defense.advanced===1 && repairDroneFleet.read().credits===3000')
        tab('repair')
        page.locator('[data-upgrade-drone="basic"]').click()
        page.locator('[data-upgrade-drone="upgraded"]').click()
        assert page.evaluate('repairDroneFleet.read().owned.advanced===1 && repairDroneFleet.read().credits===900')
        tab('attack')
        page.locator('[data-enemy-upgrade="basic"]').click()
        page.locator('[data-enemy-upgrade="upgraded"]').click()
        assert page.evaluate('repairDroneFleet.read().wave.advanced===1 && repairDroneFleet.read().credits===900')
        page.locator('#repair-workshop').screenshot(path=str(OUTPUT / 'attack-upgrades.png'))
        reset()
        # Same two basic hunters and the same basic worker, with/without escort.
        launch()
        advance(8)
        exposed = page.evaluate('showcaseState()')
        assert exposed['droneBattle']['metrics']['fired'] > 0
        assert any(d['evading'] for d in exposed['repair']['drones'])
        # Render repeatedly at the same simulation time: no extra hits/repair.
        before = page.evaluate('JSON.stringify(showcaseState())')
        page.evaluate('advanceShowcase(0)')
        assert before == page.evaluate('JSON.stringify(showcaseState())')
        advance(12)
        unguarded = page.evaluate('showcaseState()')
        page.locator('#scene').screenshot(path=str(OUTPUT / 'unguarded.png'))
        reset()
        tab('defense')
        page.locator('[data-buy-defense="advanced"]').click()
        launch()
        advance(5)
        page.locator('#scene').screenshot(path=str(OUTPUT / 'drone-fight.png'))
        advance(3)
        # Simulation pause freezes both green welding and projectile physics.
        page.locator('#pause').click()
        frozen = page.evaluate('JSON.stringify(showcaseState().droneBattle)')
        advance(2)
        assert frozen == page.evaluate('JSON.stringify(showcaseState().droneBattle)')
        page.locator('#pause').click()
        advance(12)
        guarded = page.evaluate('showcaseState()')
        assert guarded['droneBattle']['metrics']['attackDamage'] > 0
        assert guarded['droneBattle']['metrics']['repairDamage'] < unguarded['droneBattle']['metrics']['repairDamage'], (unguarded['droneBattle'], guarded['droneBattle'])
        assert guarded['hull'] > unguarded['hull'], (guarded['hull'], unguarded['hull'])
        assert all(d['health'] == 0 for d in guarded['droneBattle']['drones'] if d['role'] == 'attack')
        # Recall both owned roles, preserve partial hull, and free the hangar.
        page.locator('#drone-recall').click()
        hull = page.evaluate('showcaseState().hull')
        advance(12)
        assert page.evaluate('showcaseState().repair===null && !showcaseState().droneBattle.busy')
        assert abs(page.evaluate('showcaseState().hull') - hull) < .00001
        assert page.locator('.drone-workshop-reset').is_enabled()
        # Ship weapons can also destroy a blue defender; one loss persists.
        reset()
        tab('defense')
        page.locator('[data-buy-defense="basic"]').click()
        page.locator('button[data-stage="3"]').click()
        page.locator('.drone-workshop-launch').click()
        advance(3)
        blue = page.evaluate("showcaseState().droneBattle.drones.find(d=>d.role==='defense').id")
        page.locator('#weapon-select').select_option('beam:0', force=True)
        page.evaluate("for(let n=document.getElementById('visual-damage').parentElement;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true")
        page.locator('#visual-damage').check()
        page.evaluate("document.getElementById('hit-strength').value=50;document.getElementById('hit-strength').dispatchEvent(new Event('input'))")
        page.locator('#repair-attack-target').select_option(blue)
        page.locator('#drone-test-fire').click()
        advance(.12)
        page.locator('#drone-test-fire').click()
        advance(.12)
        assert page.evaluate('repairDroneFleet.read().defense.basic===0 && repairDroneFleet.read().credits===5600')
        assert page.evaluate('showcaseState().repair.drones[0].health===40')
        page.reload()
        page.wait_for_function('window.showcaseState && showcaseState().ready', polling=50)
        assert page.evaluate('repairDroneFleet.read().defense.basic===0 && repairDroneFleet.read().credits===5600')
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        assert not errors, errors
        print(json.dumps({'nineDistinctPreviews': True, 'allRoleUpgradePaths': True,
                          'unguardedHullAfter20s': unguarded['hull'], 'guardedHullAfter20s': guarded['hull'],
                          'unguardedDamage': unguarded['droneBattle']['metrics'], 'guardedDamage': guarded['droneBattle']['metrics'],
                          'evasion': True, 'pause': True, 'recall': True, 'savedBlueLoss': True, 'browserErrors': errors}))
        browser.close()
finally:
    if server:
        server.shutdown()
