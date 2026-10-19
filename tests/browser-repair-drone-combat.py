"""Verify current-state repairs, weapon damage, fleet losses, recall and bright welding."""
import functools
import http.server
import json
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / ('drone-combat-installed' if len(sys.argv) > 1 else 'drone-combat')
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
        retried = []
        def transient_art_failure(route):
            if 'retry=' in route.request.url:
                retried.append(route.request.url)
                route.continue_()
            else:
                route.abort()
        page.route('**/ship-1-1.png?*', transient_art_failure)
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
        assert retried, 'a transient image failure must recover without reloading the page'
        page.locator('.drone-workshop-launch').click()
        assert page.evaluate('showcaseState().repair===null && showcaseState().hull===100')
        assert 'No repairs needed' in page.locator('#explanation').inner_text()
        durations = {}
        for stage, hull in [(1, 65), (2, 40), (3, 15)]:
            page.locator(f'button[data-stage="{stage}"]').click()
            page.locator('.drone-workshop-launch').click()
            snapshot = page.evaluate('showcaseState()')
            assert snapshot['hull'] == hull and snapshot['stage'] == stage
            durations[stage] = snapshot['repair']['duration']
            page.evaluate('advanceShowcase(showcaseState().repair.duration/1000+.1)')
            assert page.evaluate('showcaseState().hull===100 && showcaseState().repair===null')
        assert durations[1] < durations[2] < durations[3]
        page.locator('#destroy').click()
        page.locator('.drone-workshop-launch').click()
        assert page.evaluate('showcaseState().hull===0 && !showcaseState().destroyed && showcaseState().repair!==null')
        page.evaluate('advanceShowcase(showcaseState().repair.duration/1000+.1)')
        assert page.evaluate('showcaseState().hull===100 && showcaseState().repair===null')

        page.evaluate("document.getElementById('hull').value=82;document.getElementById('hull').dispatchEvent(new Event('input'))")
        page.locator('.drone-workshop-launch').click()
        assert page.evaluate('showcaseState().hull===82 && showcaseState().repair!==null')
        page.evaluate('advanceShowcase(showcaseState().repair.duration/1000+.1)')
        assert page.evaluate('showcaseState().hull===100')

        page.locator('[data-buy-drone="basic"]').click()
        page.locator('button[data-stage="3"]').click()
        page.locator('.drone-workshop-launch').click()
        page.evaluate('advanceShowcase(5)')
        page.locator('#scene').screenshot(path=str(OUTPUT / 'bright-welding.png'))
        snapshot = page.evaluate('showcaseState()')
        assert len(snapshot['repair']['drones']) == 2
        # Clicking a drone and selecting it in the menu must name the same target.
        drone = snapshot['repair']['drones'][1]
        box = page.locator('#scene').bounding_box()
        page.locator('#scene').click(position={'x': drone['position']['x'] * box['width'] / 900,
                                              'y': drone['position']['y'] * box['height'] / 540})
        assert page.locator('#repair-attack-target').input_value() == '1'

        weapon = page.evaluate("""async () => {
          const data=await fetch('showcase-assets/combat-data.json').then(r=>r.json());
          const candidates=data.weapons.beam.map((weapon,index)=>({...weapon,index})).filter(w=>w.baseDamage>0&&w.baseDamage<40);
          candidates.sort((a,b)=>a.baseDamage-b.baseDamage);return candidates[0];
        }""")
        assert weapon, 'a real low-damage beam must be available'
        page.locator('#weapon-select').select_option('beam:' + str(weapon['index']), force=True)
        page.locator('#repair-attack-target').select_option('0')
        before = page.evaluate('showcaseState()')
        page.locator('#drone-test-fire').click()
        page.evaluate('advanceShowcase(.12)')
        hit = page.evaluate('showcaseState()')
        assert abs(hit['repair']['drones'][0]['health'] - (40 - weapon['baseDamage'])) < .00001
        assert hit['combat']['lastHit']['droneDamage'] == weapon['baseDamage']
        assert hit['hull'] >= before['hull'], 'drone hits must never damage the Steamrunner hull'

        page.evaluate("for(let node=document.getElementById('visual-damage').parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true")
        page.locator('#visual-damage').check()
        page.evaluate("document.getElementById('hit-strength').value=50;document.getElementById('hit-strength').dispatchEvent(new Event('input'))")

        def attack(drone_id):
            page.locator('#repair-attack-target').select_option(str(drone_id))
            page.locator('#drone-test-fire').click()
            page.evaluate('advanceShowcase(.12)')

        for _ in range(2):
            if page.evaluate('showcaseState().repair.drones[0].health>0'):
                attack(0)
        lost = page.evaluate('showcaseState()')
        assert lost['repair']['drones'][0]['phase'] == 'destroyed'
        assert lost['droneInventory']['owned']['basic'] == 1 and lost['droneInventory']['credits'] == 5700
        assert lost['repair']['wreckCount'] > 0
        assert lost['repair']['duration'] > before['repair']['duration'], 'losing a working drone slows the same repair'
        assert lost['hull'] >= before['hull']
        assert sum(job['cells'] for job in lost['repair']['jobs']) == lost['repair']['steps']
        page.locator('#scene').screenshot(path=str(OUTPUT / 'drone-destroyed.png'))
        page.evaluate('advanceShowcase((showcaseState().repair.duration-showcaseState().repair.elapsed)/1000+.1)')
        assert page.evaluate('showcaseState().hull===100 && showcaseState().repair===null')

        # Losing the last drone preserves a partial repair and an empty saved fleet.
        page.locator('button[data-stage="3"]').click()
        page.locator('.drone-workshop-launch').click()
        page.evaluate('advanceShowcase(5)')
        attack(0)
        attack(0)
        halted = page.evaluate('showcaseState()')
        assert halted['repair']['outcome'] == 'failed' and 15 < halted['hull'] < 100
        page.evaluate('advanceShowcase(2)')
        assert page.evaluate('showcaseState().repair===null && showcaseState().repairRemainder!==null')
        assert abs(page.evaluate('showcaseState().hull') - halted['hull']) < .000001
        assert page.evaluate("JSON.parse(localStorage.getItem('vexedMirrorRepairWorkshop.v1')).owned.basic===0")
        assert page.locator('.drone-workshop-launch').is_disabled()
        page.locator('#scene').screenshot(path=str(OUTPUT / 'partial-repair-preserved.png'))
        page.locator('[data-buy-drone="basic"]').click()
        page.locator('.drone-workshop-launch').click()
        assert abs(page.evaluate('showcaseState().hull') - halted['hull']) < .000001
        page.evaluate('advanceShowcase(showcaseState().repair.duration/1000+.1)')
        assert page.evaluate('showcaseState().hull===100')

        # Recall freezes welding immediately; returning drones can still be shot.
        page.locator('[data-buy-drone="basic"]').click()
        page.locator('button[data-stage="2"]').click()
        page.locator('.drone-workshop-launch').click()
        page.evaluate('advanceShowcase(4)')
        page.locator('#drone-recall').click()
        recalled = page.evaluate('showcaseState()')
        assert recalled['repair']['recalling']
        page.evaluate('advanceShowcase(.2)')
        assert page.evaluate('showcaseState().hull') == recalled['hull']
        attack(0)
        attack(0)
        assert page.evaluate('showcaseState().repair.drones[0].phase==="destroyed"')
        page.evaluate('advanceShowcase(3)')
        assert page.evaluate('showcaseState().repair===null && showcaseState().repairRemainder!==null')
        assert page.evaluate('showcaseState().hull') == recalled['hull']
        page.locator('.drone-workshop-launch').click()
        assert page.evaluate('showcaseState().hull') == recalled['hull']
        page.evaluate('advanceShowcase(showcaseState().repair.duration/1000+.1)')
        assert page.evaluate('showcaseState().hull===100')

        pixels = page.evaluate("""async () => {
          const [intact,damaged]=await Promise.all([0,3].map(stage=>new Promise(resolve=>{
            const image=new Image();image.onload=()=>resolve(image);image.src=`showcase-assets/ship-1-${stage}.png`;
          })));
          const layout={x:540,y:253,w:275,h:353},source={centerX:135,centerY:425,w:58,h:88,a:1.17,shipId:6};
          const canvas=document.createElement('canvas');canvas.width=intact.width;canvas.height=intact.height;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          const paint=repair=>{ctx.clearRect(0,0,canvas.width,canvas.height);repair.drawBody(ctx,{x:canvas.width/2,y:canvas.height/2,w:canvas.width,h:canvas.height},0);return canvas.toDataURL();};
          const losses=[];
          const repair=steamrunnerRepair.create(damaged,intact,0,{layout,angle:0,source,fleet:{basic:2},onDestroyed:(tier,id)=>losses.push(id)});
          repair.advance(6000);const partial=paint(repair),progress=repair.snapshot().progress;
          repair.hit(0,1000,6000);repair.hit(0,1000,6000);
          if(losses.length!==1||paint(repair)!==partial||repair.snapshot().progress!==progress)throw Error('Death must be idempotent and preserve completed pixels');
          repair.advance(repair.snapshot().duration+50);
          if(repair.snapshot().progress!==1)throw Error('Survivors must complete reassigned work');
          const doomed=steamrunnerRepair.create(damaged,intact,0,{layout,angle:0,source,fleet:{basic:1}});
          doomed.advance(5000);const saved=paint(doomed),done=doomed.snapshot().progress;
          doomed.hit(0,1000,5000);doomed.advance(100000);
          if(paint(doomed)!==saved||doomed.snapshot().progress!==done)throw Error('Losing the last drone must preserve the exact partial hull');
          const resumed=steamrunnerRepair.create(doomed.frame(),intact,100000,{layout,angle:0,source,fleet:{basic:1}});
          if(paint(resumed)!==saved)throw Error('Relaunch must begin with the exact partial hull');
          resumed.advance(100000+resumed.snapshot().duration+50);
          if(resumed.snapshot().progress!==1)throw Error('Replacement must finish remaining material');
          const launchLoss=steamrunnerRepair.create(damaged,intact,0,{layout,angle:0,source,fleet:{basic:2}});
          if(launchLoss.hit(1,1000,0).hit)throw Error('Drones still inside the hangar cannot be shot');
          launchLoss.advance(300);launchLoss.hit(0,1000,300);
          if(launchLoss.snapshot().drones[0].phase!=='destroyed')throw Error('Launch-phase drone must be vulnerable');
          launchLoss.advance(launchLoss.snapshot().duration+50);
          if(launchLoss.snapshot().progress!==1)throw Error('Preflight loss must reassign all reserved sections');
          const returnLoss=steamrunnerRepair.create(damaged,intact,0,{layout,angle:0,source,fleet:{advanced:1}});
          const sealedAt=returnLoss.snapshot().weldEnd+500;returnLoss.advance(sealedAt);
          if(!returnLoss.hit(0,1000,sealedAt).destroyed||returnLoss.snapshot().progress!==1)throw Error('Return-phase destruction must preserve a sealed hull');
          const armor=steamrunnerRepair.create(damaged,intact,0,{layout,angle:0,source,fleet:{basic:1,upgraded:1,advanced:1}}).snapshot().drones;
          if(!armor.every(d=>d.health===({basic:40,upgraded:90,advanced:180})[d.tier]))throw Error('Drone tiers need distinct armor strength');
          const arc=steamrunnerRepair.create(damaged,intact,0,{layout,angle:0,source,fleet:{advanced:1}});arc.advance(5000);
          const fx=document.createElement('canvas');fx.width=900;fx.height=540;const g=fx.getContext('2d',{willReadFrequently:true});arc.drawBeam(g,layout,0,5000,source);
          const hit=arc.snapshot().drones[0].hit,data=g.getImageData(Math.round(hit.x)-12,Math.round(hit.y)-12,24,24).data;
          let bright=0;for(let i=0;i<data.length;i+=4)if(data[i]>190&&data[i+1]>200&&data[i+2]>180&&data[i+3]>100)bright++;
          if(bright<30)throw Error('Welding arc must have a bright white-blue core and bloom');
          return {exactPartialHull:true,idempotentDestruction:true,reassignedWork:true,replacementResume:true,launchAndReturnDamage:true,tierArmor:true,brightArcPixels:bright};
        }""")
        assert not errors, errors
        assert not failed, failed
        report = {'repairDurations': durations, 'realWeaponDamage': True, 'permanentDroneLoss': True,
                  'recallAndReturnVulnerability': True, 'allStatesAndMinorDamage': True, 'pixels': pixels,
                  'imageRetry': True, 'browserErrors': errors, 'failedRequests': failed}
        (OUTPUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    if server:
        server.shutdown()
