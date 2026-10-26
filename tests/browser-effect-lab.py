"""Real RAF, native render calls, every count, A/B, promotion gates and layout."""
import functools
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

REPO=Path(__file__).resolve().parents[1]
ROOT=Path(os.environ.get('VEXED_EFFECT_TEST_ROOT',REPO))
sys.path.insert(0,str(REPO/'tools'))
from local_site import Handler

OUTPUT=ROOT/'test-results/effect-lab';OUTPUT.mkdir(parents=True,exist_ok=True)
FIT=r"""() => {
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  return [...document.querySelectorAll('.workspace-panel,.control-panel,.viewer,.workspace-toolbar')]
    .filter(e=>visible(e)&&(e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2))
    .map(e=>({id:e.id,cls:e.className,size:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight]}));
}"""

with tempfile.TemporaryDirectory(prefix='vexed-lab-test-') as temp:
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
    server.state=Path(temp);threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1440,'height':900});errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=6')
            page.wait_for_function('window.showcaseState?.().ready',timeout=120000)
            page.locator('[data-workspace-tab=lab]').click()
            page.wait_for_function('showcaseEffectLab.snapshot().active&&!document.querySelector("[data-lab=variant]").disabled')
            page.wait_for_function('document.querySelector(".lab-notice").textContent.includes("Choose a scene")',timeout=60000)
            frame=page.frame_locator('#effect-lab-frame');child=page.frames[1]
            # All controls remain within the viewport; the short phone bench
            # expands the scene into fullscreen before recording.
            cases=0
            for width,height in [(320,568),(390,844),(800,600),(1280,720),(1440,900)]:
                page.set_viewport_size({'width':width,'height':height})
                for tab in ['scenario','load','measure','candidate','results','details']:
                    page.locator(f'[data-workspace-page={tab}]:visible').click()
                    result=page.evaluate(FIT);assert not result,(width,height,tab,result)
                    assert page.evaluate('document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth')
                    cases+=1
            print(f'{cases} Stress layouts fit',flush=True)
            page.set_viewport_size({'width':1440,'height':900})
            page.locator('[data-lab=scenario]').select_option('shields',force=True)
            page.locator('[data-workspace-page=scenario]:visible').click()
            page.locator('[data-lab=count]').select_option('200')
            page.get_by_role('button',name='Preview',exact=True).click()
            page.wait_for_function('!showcaseEffectLab.snapshot().busy')
            assert child.evaluate('effectLabScene.snapshot().prepared')
            child.evaluate("""() => {
              window.__nativeCalls={ships:0,shots:0,impacts:0};
              const effects=nativeShipEffects,shots=nativeCombatShots;
              window.nativeShipEffects={...effects,paintShip(...args){__nativeCalls.ships++;return effects.paintShip(...args)},visualImpact(...args){__nativeCalls.impacts++;return effects.visualImpact(...args)}};
              window.nativeCombatShots={...shots,paint(...args){__nativeCalls.shots++;return shots.paint(...args)}};
            }""")
            page.wait_for_timeout(1000)
            snap=child.evaluate('effectLabScene.snapshot()');assert snap['counters']['visible']==200,snap
            assert snap['counters']['activeShields']==200,snap
            page.screenshot(path=str(OUTPUT/'stress-200.png'))
            page.locator('[data-workspace-page=measure]:visible').click()
            page.locator('[data-lab=seconds]').select_option('2');page.locator('[data-lab=warmup]').select_option('1')
            page.get_by_role('button',name='All counts · A/B',exact=True).click()
            page.wait_for_function('showcaseEffectLab.snapshot().busy')
            page.wait_for_function('!showcaseEffectLab.snapshot().busy',timeout=180000)
            manifest=child.evaluate('effectLabScene.command("manifest")');runs=manifest['runs']
            assert len(runs)==10,(page.locator('.lab-notice').inner_text(),len(runs))
            for count in [10,25,50,100,200]:
                pair=[r for r in runs if r['fixture']['count']==count];assert len(pair)==2
                assert child.evaluate('([a,b])=>EffectLabMetrics.comparable(a,b)',pair)
                for run in pair:
                    assert run['counters']['minimumVisible']==count
                    assert run['metrics']['samples']==len(run['frames'])
                    assert abs(run['metrics']['fps']-len(run['frames'])*1000/sum(run['frames']))<1e-6
            page.locator('[data-workspace-page=candidate]:visible').click()
            page.get_by_role('button',name='Stage candidate for game').click()
            page.wait_for_function('document.querySelector(".lab-notice").textContent.includes("Selected:")')
            selected=child.evaluate('(async()=> (await effectLabScene.command("manifest")).selected)()')
            assert selected['profile']['id']=='candidate-v1'
            assert child.evaluate('nativeEffectProfiles.production()')==manifest['release']
            # Weapons/hits fixtures call native owners without emitting destruction.
            for scenario,weapon in [('weapons','torpedo:0'),('weapons-hits','disruptor:0'),('hull','beam:0'),('idle','beam:0')]:
                report=child.evaluate('''async ({scenario,weapon})=>{const m=await effectLabScene.command('manifest');return effectLabScene.command('measure',{fixture:{count:10,scenario,weapon,rate:4,shipType:6,size:44,pattern:'volley'},profile:m.release,variant:'baseline',warmup:0,duration:2});}''',{'scenario':scenario,'weapon':weapon})
                if scenario in ['weapons','weapons-hits']:assert report['counters']['shots']>0
                assert report['counters']['explosions']==0 and report['counters']['destructionEnabled'] is False
                if scenario=='weapons-hits':assert report['counters']['shieldHits']>0 and report['counters']['hullHits']>0
                if scenario=='idle':assert report['counters']['hits']==0
            calls=child.evaluate('__nativeCalls');assert all(n>0 for n in calls.values()),calls
            # A changed viewport invalidates an in-progress run without saving it.
            child.evaluate('''async()=>{const m=await effectLabScene.command('manifest');window.__cancelled=null;effectLabScene.command('measure',{fixture:{count:25,scenario:'shields',shipType:6},profile:m.release,variant:'baseline',warmup:0,duration:5}).catch(e=>window.__cancelled=e.message);}''')
            page.wait_for_timeout(250);page.set_viewport_size({'width':1280,'height':720})
            child.wait_for_function('window.__cancelled?.includes("Viewport changed")')
            assert len(child.evaluate('(async()=> (await effectLabScene.command("manifest")).runs)()'))==14
            # The one-click game check uses another isolated browser context.
            page.locator('[data-workspace-page=scenario]:visible').click();page.locator('[data-lab=count]').select_option('10')
            page.locator('[data-workspace-page=measure]:visible').click();page.get_by_role('button',name='Check in game',exact=True).click()
            page.wait_for_function('showcaseEffectLab.snapshot().busy')
            page.wait_for_function('!showcaseEffectLab.snapshot().busy',timeout=180000)
            game=child.evaluate('(async()=> (await effectLabScene.command("manifest")).gameValidation)()')
            assert game['status'] in ['passed','below-target'],game
            assert game['requested']==10 and game['minimumVisible']==10,game
            if game['gpuTiming']['supported']:
                assert game['metrics']['gpuSamples']>0 and game['metrics']['gpuMs']>=0,game
            for width,height in [(320,568),(390,844),(1280,720)]:
                page.set_viewport_size({'width':width,'height':height})
                for tab in ['scenario','load','measure','candidate','results','details']:
                    page.locator(f'[data-workspace-page={tab}]:visible').click()
                    result=page.evaluate(FIT);assert not result,('populated',width,height,tab,result)
            # On a short phone the measured fleet must actually be visible.
            page.set_viewport_size({'width':320,'height':568})
            page.locator('[data-workspace-page=measure]:visible').click()
            page.get_by_role('button',name='Measure selected',exact=True).click()
            page.wait_for_function('document.fullscreenElement!==null')
            assert child.locator('#space').is_visible()
            page.wait_for_function('!showcaseEffectLab.snapshot().busy',timeout=60000)
            assert page.evaluate('document.fullscreenElement===null')
            assert len(child.evaluate('(async()=> (await effectLabScene.command("manifest")).runs)()'))==15,page.locator('.lab-notice').inner_text()
            page.locator('[data-workspace-tab=weapons]').click()
            assert child.evaluate('effectLabScene.snapshot().active') is False
            assert not errors,errors
            (OUTPUT/'browser-results.json').write_text(json.dumps({'layouts':cases,'calls':calls,'runs':runs,'game':game},indent=2),encoding='utf-8')
            print(json.dumps({'runs':len(runs),'counts':[10,25,50,100,200],'nativeCalls':calls,'gameStatus':game['status'],'gameFPS':game['metrics']['fps'],'errors':errors}),flush=True)
            browser.close()
    finally:
        server.shutdown();server.server_close()
