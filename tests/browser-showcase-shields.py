"""Regular weapons, shared GPU contacts, explicit legacy and Stress selection."""
import functools
from http.server import ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from local_site import Handler

OUTPUT=ROOT/'test-results/showcase-shields';OUTPUT.mkdir(parents=True,exist_ok=True)


with tempfile.TemporaryDirectory(prefix='vexed-shields-test-') as temp:
    server=None
    if len(sys.argv)>1:
        base=sys.argv[1].rstrip('/')
    else:
        server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
        server.state=Path(temp);threading.Thread(target=server.serve_forever,daemon=True).start()
        base=f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1440,'height':900});errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
            page.add_init_script('''(()=>{
              window.__legacyDraws=0;
              for(const name of ['drawShowcaseShieldSurface','drawShowcaseShieldFlash']){
                let owner,assigned=false;Object.defineProperty(window,name,{configurable:true,get:()=>owner,set:value=>{
                  if(!assigned){assigned=true;owner=(...args)=>{__legacyDraws++;return value(...args);};}
                  else owner=value;
                }});
              }
            })();''')
            page.goto(base+'/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=6')
            page.wait_for_function('showcaseState?.().ready&&showcaseShields?.snapshot().ready',timeout=90000)
            initial_session=page.evaluate('(async()=> (await showcaseEffectLab.readManifest()).session)()')
            initial_release=page.evaluate('nativeEffectProfiles.production()')
            assert 'Latest GPU' in page.locator('#shield-version').inner_text()
            page.evaluate('''()=>{
              window.__weaponEnds=[];const paint=paintShowcaseWeaponShot;
              window.paintShowcaseWeaponShot=(ctx,shot,geometry,age)=>{
                const m=ctx.getTransform(),x=geometry.x2,y=geometry.y2;
                if(shot.kind==='beam')__weaponEnds.push({time:showcaseState().time,x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f});
                if(__weaponEnds.length>120)__weaponEnds.shift();return paint(ctx,shot,geometry,age);
              };
            }''')
            cases=[]
            assert page.locator('#shield-hit-location').input_value()=='varied'
            varied=[]
            for _ in range(3):
                page.locator('#reset').click();page.locator('#fire-weapon').click()
                page.wait_for_function('showcaseShields.snapshot().presentation.lastActiveShields===1',timeout=5000)
                varied.append(page.evaluate('showcaseShields.snapshot().presentation.contacts.filter(c=>c.time>0).sort((a,b)=>b.time-a.time)[0]'))
            assert len({(round(p['x']),round(p['y'])) for p in varied})==3,'Varied shots reused one contact'
            for kind,point in zip(['beam','torpedo','disruptor'],[{'x':580,'y':253},{'x':500,'y':253},{'x':540,'y':253}]):
                page.locator('#reset').click()
                page.locator('#scene').evaluate('''(canvas,p)=>{const r=canvas.getBoundingClientRect(),s=Math.min(r.width/900,r.height/540);canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+(r.width-900*s)/2+p.x*s,clientY:r.top+(r.height-540*s)/2+p.y*s}));}''',point)
                assert page.locator('#shield-hit-location').input_value()=='pick'
                page.locator('#weapon-select').evaluate('(e,kind)=>{e.value=[...e.options].find(o=>o.value.startsWith(kind+":")).value;e.dispatchEvent(new Event("change"));}',kind)
                page.locator('#fire-weapon').click()
                page.wait_for_function('showcaseShields.snapshot().presentation.lastActiveShields===1',timeout=5000)
                snap=page.evaluate('showcaseShields.snapshot()')
                assert snap['renderer']=='gpu' and snap['presentation']['events']>0
                contact=sorted([p for p in snap['presentation']['contacts'] if p['time']>0],key=lambda p:p['time'])[-1]
                dpr=page.evaluate('document.getElementById("scene").width/900')
                assert math.hypot(contact['x']-point['x']*dpr,contact['y']-point['y']*dpr)<1.5*dpr,('Picked point did not reach the GPU',kind,contact,point,dpr)
                assert page.evaluate('__legacyDraws')==0,'latest mode used the old shield painter'
                if kind=='beam':
                    aligned=page.evaluate('''()=>{
                      const c=showcaseShields.snapshot().presentation.contacts.filter(c=>c.time>0).sort((a,b)=>b.time-a.time)[0];
                      const p=__weaponEnds.findLast(p=>Math.abs(p.time-c.time)<.001);
                      return p?Math.hypot(p.x-c.x,p.y-c.y):Infinity;
                    }''')
                    assert aligned<.01,aligned
                cases.append(kind)
            # Rotation/zoom still send the current contact into the shared GPU.
            page.locator('#reset').click();page.locator('#rotate').click()
            page.wait_for_timeout(300)
            page.locator('#zoom').fill('120');page.locator('#zoom').dispatch_event('input')
            page.locator('#weapon-select').evaluate('(e)=>{e.value=[...e.options].find(o=>o.value.startsWith("beam:")).value;e.dispatchEvent(new Event("change"));}')
            page.locator('#fire-weapon').click();page.wait_for_function('showcaseShields.snapshot().presentation.lastActiveShields===1')
            page.wait_for_timeout(30)
            rotated_alignment=page.evaluate('''()=>{
              const c=showcaseShields.snapshot().presentation.contacts.filter(c=>c.time>0).sort((a,b)=>b.time-a.time)[0];
              const p=__weaponEnds.findLast(p=>Math.abs(p.time-c.time)<.001);
              return p?Math.hypot(p.x-c.x,p.y-c.y):Infinity;
            }''')
            assert rotated_alignment<.01,rotated_alignment
            page.screenshot(path=str(OUTPUT/'latest-gpu-hit.png'))
            page.locator('#pause').click()
            before=page.evaluate('showcaseState().time');page.wait_for_timeout(150)
            assert page.evaluate('showcaseState().time')==before
            page.locator('#pause').click();page.locator('#rotate').click()
            # Force a nonlethal shield collapse using the ordinary damage UI.
            page.locator('#reset').click();page.locator('[data-workspace-tab=weapons]').click()
            page.locator('[data-workspace-page=settings]:visible').click()
            page.locator('#visual-damage').check();page.locator('#hit-strength').fill('50')
            page.locator('#hit-strength').dispatch_event('input')
            page.locator('[data-workspace-page=fire]:visible').click()
            for _ in range(4):
                page.locator('#fire-weapon').click();page.wait_for_timeout(100)
            assert page.evaluate('showcaseShields.snapshot().presentation.collapseEvents')>0
            assert not page.evaluate('showcaseState().destroyed')
            page.locator('#reset').click()
            page.locator('[data-workspace-page=settings]:visible').click()
            page.locator('#shield-renderer').select_option('legacy')
            page.wait_for_function('showcaseShields.snapshot().ready&&showcaseShields.renderer==="legacy"')
            page.locator('[data-workspace-page=fire]:visible').click()
            assert 'Legacy baseline' in page.locator('#shield-version').inner_text()
            page.locator('#fire-weapon').click();page.wait_for_timeout(150)
            assert page.evaluate('__legacyDraws')>0
            assert page.locator('#showcase-gpu-shields').is_hidden()
            # The Stress scene must record the same explicitly selected renderer.
            page.locator('[data-workspace-tab=lab]').click()
            page.wait_for_function('document.querySelector(".lab-notice").textContent.includes("Choose a scene")')
            assert page.locator('[data-lab=shieldRenderer]').input_value()=='legacy'
            page.locator('[data-lab=count]').select_option('10')
            page.get_by_role('button',name='Preview',exact=True).click()
            page.wait_for_function('!showcaseEffectLab.snapshot().busy')
            child=page.frames[1]
            assert child.evaluate('effectLabScene.snapshot().fixture.shieldRenderer')=='legacy'
            assert child.evaluate('vexedShieldGPU.snapshot().legacy')
            if server:
                legacy=child.evaluate('''async()=>{const s=effectLabScene.snapshot(),m=await effectLabScene.command('manifest');return effectLabScene.command('measure',{fixture:s.fixture,profile:m.release,variant:'baseline',warmup:1,duration:2});}''')
                assert legacy['fixture']['shieldRenderer']=='legacy'
                assert legacy['counters']['minimumVisible']==10
                assert legacy['metrics']['gpuSamples']==0
            page.locator('[data-lab=shieldRenderer]').select_option('gpu')
            page.get_by_role('button',name='Preview',exact=True).click();page.wait_for_function('!showcaseEffectLab.snapshot().busy')
            assert not child.evaluate('vexedShieldGPU.snapshot().legacy')
            page.locator('[data-workspace-page=candidate]:visible').click()
            page.locator('[data-lab=name]').fill('Shield QA')
            page.locator('[data-lab=duration]').fill('1200')
            page.locator('[data-lab=scale]').fill('1.2')
            page.locator('[data-workspace-page=scenario]:visible').click()
            page.locator('[data-lab=variant]').select_option('candidate')
            page.get_by_role('button',name='Preview',exact=True).click();page.wait_for_function('!showcaseEffectLab.snapshot().busy')
            tested=child.evaluate('nativeEffectProfiles.current()')
            page.locator('[data-workspace-tab=weapons]').click()
            page.wait_for_function('showcaseShields.snapshot().ready&&showcaseShields.snapshot().profile.name==="Shield QA"')
            assert page.evaluate('showcaseShields.snapshot().profile')==tested
            assert page.evaluate('nativeEffectProfiles.production()')==initial_release
            assert 'Latest GPU' in page.locator('#shield-version').inner_text()
            page.evaluate('''()=>{const profile=nativeEffectProfiles;window.__candidateWeaponZoom=null;
              window.nativeEffectProfiles=Object.freeze({...profile,
                queueWeapon(ctx,shot,matrix){__candidateWeaponZoom=shot.zoom;return profile.queueWeapon(ctx,shot,matrix);},
                drawWeapon(base,ctx,shot){__candidateWeaponZoom=shot.zoom;return profile.drawWeapon(base,ctx,shot);}});}''')
            page.locator('[data-workspace-page=fire]:visible').click();page.locator('#fire-weapon').click()
            page.wait_for_function('__candidateWeaponZoom!==null')
            expected_zoom=float(page.locator('#zoom').input_value())/100*1.2
            assert abs(page.evaluate('__candidateWeaponZoom')-expected_zoom)<1e-6
            if initial_session:
                child.evaluate('(session)=>effectLabScene.command("session",session)',initial_session)
            browser.close();assert not errors,errors
            report={'weapons':cases,'pickedImpacts':True,'variedContacts':True,'beamContactAligned':True,'rotationAndZoomAligned':True,'pause':True,'collapse':True,'explicitLegacy':True,'stressRendererMatches':True,'candidateMatches':True,'candidateWeaponSizeMatches':True,'errors':errors}
            (OUTPUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
    finally:
        if server:server.shutdown();server.server_close()
