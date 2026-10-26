"""Exercise the screen-fitting showcase, every control page, and real repair actions."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'showcase-workspace'
OUTPUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = None
if len(sys.argv) > 1:
    base = sys.argv[1].rstrip('/')
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'

FIT = r"""() => {
  const visible = e => {
    const closed=e.closest('details:not([open])');
    return (!closed || closed.querySelector(':scope > summary')?.contains(e)) && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  };
  const overflow = [...document.querySelectorAll('.workspace-panel,.workspace-toolbar,.control-panel,.viewer')]
    .filter(e => visible(e) && (e.scrollHeight > e.clientHeight+2 || e.scrollWidth > e.clientWidth+2))
    .map(e => ({id:e.id, cls:e.className, size:[e.clientWidth,e.clientHeight], scroll:[e.scrollWidth,e.scrollHeight]}));
  const outside = [...document.querySelectorAll('button,select,input,summary')].filter(e => {
    if (!visible(e)) return false;
    const r=e.getBoundingClientRect();
    return r.left < -1 || r.top < -1 || r.right > innerWidth+1 || r.bottom > innerHeight+1;
  }).map(e => e.id || e.textContent);
  return {overflow, outside, scroll:document.documentElement.scrollWidth>innerWidth || document.documentElement.scrollHeight>innerHeight};
}"""

errors, cases = [], []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('response', lambda r: errors.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        page.add_init_script("""(() => {
          let callbacks=[],now;const original=requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>{if(callback.name!=='frame')return original(callback);callbacks.push(callback);return callbacks.length;};
          window.advanceShowcase=seconds=>{now??=performance.now();for(let i=0;i<Math.ceil(seconds*60);i++){
            now+=1000/60;const batch=callbacks;callbacks=[];batch.forEach(callback=>callback(now));
          }};
        })();""")
        url = base + '/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=1'
        page.goto(url)
        page.wait_for_function('() => window.showcaseState?.().ready && document.body.classList.contains("showcase-workspace")', timeout=120000)

        def tab(name):
            page.locator(f'[data-workspace-tab="{name}"]').click()

        def sub(name):
            page.locator(f'[data-workspace-page="{name}"]:visible').click()

        def fit(label):
            result = page.evaluate(FIT)
            assert not result['overflow'] and not result['outside'] and not result['scroll'], (label, result)
            assert page.locator('#ship-select').is_visible()
            assert page.locator('#fleet-filter').is_visible()
            assert page.locator('#animation-filter').is_visible()
            cases.append(label)

        for width, height in [(320,568),(360,740),(390,844),(800,600),(900,600),(1024,768),(1280,720),(1440,900),(1920,1080)]:
            page.set_viewport_size({'width': width, 'height': height})
            for name, pages in [('weapons',['fire','settings','equipment']),('damage',['hull','impacts','motion']),('repair',['fleet','mission','combat','tools']),('info',[])]:
                tab(name)
                for name2 in pages:
                    sub(name2)
                    fit([width,height,name,name2])
                    if name == 'repair' and name2 == 'fleet':
                        for role in ['repair','defense','attack']:
                            page.locator(f'[data-drone-role="{role}"]').click()
                            for tier in ['basic','upgraded','advanced']:
                                page.locator(f'[data-workspace-tier="{tier}"]').click()
                                fit([width,height,role,tier])
                        page.locator('[data-drone-role="repair"]').click()
                        page.locator('[data-workspace-tier="basic"]').click()
                if not pages:
                    fit([width,height,name])
                if width in [1440,390,320]:
                    page.screenshot(path=str(OUTPUT / f'{width}-{height}-{name}.png'))
            if width == 320:
                tab('preview')
                fit([width,height,'preview'])
                assert page.locator('#scene').is_visible()
                page.screenshot(path=str(OUTPUT / 'phone-preview.png'))
            print(f'{width}x{height}: all control pages fit', flush=True)

        page.set_viewport_size({'width': 1280, 'height': 720})
        inventory = page.evaluate('JSON.stringify(repairDroneFleet.read())')
        tab('repair');sub('mission')
        page.locator('#drone-auto-attack').uncheck()
        sub('fleet')
        page.locator('[data-workspace-tier="basic"]').click()
        page.locator('[data-buy-drone="basic"]').click()
        assert page.evaluate('repairDroneFleet.read().owned.basic') == 2
        page.locator('[data-upgrade-drone="basic"]').click()
        assert page.evaluate('repairDroneFleet.read().owned.upgraded') == 1
        page.locator('[data-workspace-tier="upgraded"]').click()
        assert page.locator('[data-owned="upgraded"]').inner_text() == 'Owned: 1'
        page.locator('[data-drone-role="defense"]').click()
        page.locator('[data-workspace-tier="basic"]').click()
        page.locator('[data-buy-defense="basic"]').click()
        assert page.evaluate('repairDroneFleet.read().defense.basic') == 1
        purchased = page.evaluate('JSON.stringify(repairDroneFleet.read())')
        assert purchased != inventory
        page.locator('button[data-stage="3"]').click()
        page.locator('.drone-workshop-launch').click()
        assert page.evaluate('showcaseState().repair !== null')
        sub('combat')
        page.evaluate('advanceShowcase(3)')
        page.locator('#drone-recall').click()
        assert page.evaluate('showcaseState().repair.recalling')
        page.evaluate('advanceShowcase(12)')
        page.locator('#reset').click()
        assert page.evaluate('JSON.stringify(repairDroneFleet.read())') == purchased

        tab('weapons');sub('fire')
        page.locator('#shields').uncheck()
        page.locator('#weapon-select').select_option('beam:0', force=True)
        page.locator('#fire-weapon').click()
        page.evaluate('advanceShowcase(3)')
        assert page.evaluate('showcaseState().hits') > 0
        sub('settings')
        page.locator('#visual-damage').check()
        assert page.locator('#hit-strength').is_visible()
        sub('equipment')
        assert page.locator('#equipment-list .equipment-item:visible').count() <= 3
        while not page.get_by_role('button', name='Next equipment page', exact=True).is_disabled():
            page.get_by_role('button', name='Next equipment page', exact=True).click()
            fit(['equipment-page'])
        # Keyboard navigation moves through the same visible main tabs.
        page.locator('[data-workspace-tab="weapons"]').focus()
        page.keyboard.press('ArrowRight')
        assert page.locator('[data-workspace-tab="damage"]').get_attribute('aria-selected') == 'true'
        # Top-level selection remains available from the Repair tab.
        tab('repair')
        page.locator('#fleet-filter').select_option('drones')
        page.locator('#ship-select').select_option('500')
        page.wait_for_function('() => showcaseState().ready && showcaseState().ship === 500')
        assert page.locator('.workspace-unavailable').is_visible()
        assert page.locator('#repair-workshop').is_hidden()
        assert page.evaluate('JSON.stringify(repairDroneFleet.read())') == purchased
        page.locator('#fleet-filter').select_option('all')
        page.locator('#ship-select').select_option('1')
        page.wait_for_function('() => showcaseState().ready && showcaseState().ship === 1')
        page.reload()
        page.wait_for_function('() => window.showcaseState?.().ready')
        assert page.evaluate('JSON.stringify(repairDroneFleet.read())') == purchased
        assert not errors, errors
        report = {'passed': True, 'fittedControlPages': len(cases), 'pageScroll': False,
                  'pinnedShipFilters': True, 'rolesAndTiers': True, 'keyboard': True,
                  'purchasesAndUpgrades': True, 'repairLaunchAndRecall': True,
                  'realWeaponHit': True, 'savedInventory': True, 'javascriptErrors': errors}
        (OUTPUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    if server:
        server.shutdown()
