"""Fast fleets must meet attackers while repairs are still underway."""
import functools
import http.server
import json
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / ('drone-timing-installed' if len(sys.argv) > 1 else 'drone-timing')
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
        failed = []
        page.on('requestfailed', lambda request: failed.append({'url': request.url, 'failure': request.failure}))
        def wait_ready():
            try:
                page.wait_for_function('window.showcaseState && showcaseState().ready', polling=50)
            except Exception:
                print(json.dumps({'browserErrors': errors, 'failedRequests': failed, 'loading': page.locator('#loading').inner_text()}), flush=True)
                raise
        page.add_init_script("""(() => {
          let callbacks=[],now;const original=requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>{if(callback.name!=='frame')return original(callback);callbacks.push(callback);return callbacks.length;};
          window.advanceShowcase=seconds=>{now??=performance.now();for(let i=0;i<Math.ceil(seconds*60);i++){
            now+=1000/60;const batch=callbacks;callbacks=[];batch.forEach(callback=>callback(now));
          }};
        })();""")
        url = base + '/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=1'
        page.goto(url)
        wait_ready()
        results = []
        cases = [('basic', 1, 'basic', 1), ('advanced', 1, 'advanced', 1),
                 ('advanced', 4, 'advanced', 2), ('advanced', 7, 'advanced', 1),
                 ('advanced', 8, 'basic', 0), ('basic', 1, 'advanced', 7)]
        for tier, count, defense_tier, defense_count in cases:
            for stage in [1, 2, 3]:
                owned = dict.fromkeys(['basic', 'upgraded', 'advanced'], 0)
                defense = owned.copy()
                owned[tier], defense[defense_tier] = count, defense_count
                saved = {'version': 2, 'credits': 6000, 'owned': owned, 'defense': defense,
                         'wave': {'basic': 2, 'upgraded': 0, 'advanced': 0}}
                page.evaluate('(s)=>localStorage.setItem("vexedMirrorRepairWorkshop.v1",JSON.stringify(s))', saved)
                page.reload()
                wait_ready()
                assert page.locator('#drone-auto-attack').is_checked()
                page.locator(f'button[data-stage="{stage}"]').click()
                page.locator('.drone-workshop-launch').click()
                start = page.evaluate('showcaseState()')
                assert start['droneBattle']['waveActive'], 'attackers must launch without a second button'
                assert page.evaluate('JSON.stringify(repairDroneFleet.read().wave)') == json.dumps(saved['wave'], separators=(',', ':'))
                blue = [d for d in start['droneBattle']['drones'] if d['role'] == 'defense']
                if blue:
                    assert max(d['launch'] for d in blue) < min(d['launch'] for d in start['repair']['drones'])
                data = page.evaluate("""() => {
                  let firstShot=null,firstBlue=null,firstRed=null,overlap=0,completedAt=null,trace=[];
                  const initial=showcaseState().time;
                  for(let i=0;i<900;i++){
                    advanceShowcase(1/60);const s=showcaseState(),b=s.droneBattle,r=s.repair;
                    const blue=b.shots.some(p=>p.role==='defense')||b.events.some(e=>e.role==='defense');
                    const red=b.shots.some(p=>p.role==='attack')||b.events.some(e=>e.role==='attack');
                    if(b.metrics.fired&&firstShot===null)firstShot={elapsed:s.time-initial,progress:r?.progress??1};
                    if(blue&&firstBlue===null)firstBlue={elapsed:s.time-initial,progress:r?.progress??1};
                    if(red&&firstRed===null)firstRed={elapsed:s.time-initial,progress:r?.progress??1};
                    if(r&&r.progress>0&&r.progress<1&&b.shots.length)overlap++;
                    if(s.hull===100||!r){completedAt=s.time-initial;break;}
                  }
                  const end=showcaseState();return {firstShot,firstBlue,firstRed,overlap,completedAt,hull:end.hull,metrics:end.droneBattle.metrics};
                }""")
                result = {'fleet': f'{count} {tier} workers / {defense_count} {defense_tier} guards', 'stage': stage, **data}
                results.append(result)
                assert data['firstRed'] and data['firstRed']['progress'] < 1, result
                if defense_count:
                    assert data['firstBlue'] and data['firstBlue']['progress'] < 1, result
                assert data['overlap'] >= 30, 'combat projectiles must visibly overlap welding: ' + str(result)
                if tier == 'advanced' and count == 4 and stage == 1:
                    page.locator('#scene').screenshot(path=str(OUTPUT / 'fast-fleet-fighting.png'))
        assert not errors, errors
        (OUTPUT / 'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
        print(json.dumps({'encounters': len(results), 'allAttackBeforeRepairEnds': True,
                          'escortsLaunchFirst': True, 'weldingAndCombatOverlap': True,
                          'fastestFirstRedShotMs': min(r['firstRed']['elapsed'] for r in results),
                          'minimumCombatWhileWeldingSeconds': min(r['overlap']/60 for r in results), 'browserErrors': errors}))
        browser.close()
finally:
    if server:
        server.shutdown()
