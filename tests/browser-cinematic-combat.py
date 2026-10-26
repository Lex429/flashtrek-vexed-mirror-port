"""Shared cinematic weapon/hull visuals, real native load and actual-game checks."""
import functools
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
from types import SimpleNamespace

from playwright.sync_api import sync_playwright

ROOT=Path(os.environ.get('VEXED_EFFECT_TEST_ROOT',Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(ROOT/'tools'))
from local_site import Handler
from validate_effect_game import validate

OUTPUT=ROOT/'test-results/cinematic-combat';OUTPUT.mkdir(parents=True,exist_ok=True)

PIXELS=r"""async () => {
  const before=showcaseState(),canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),original=nativeEffectProfiles.current();
  const hash=()=>{let n=2166136261,lit=0;for(const b of ctx.getImageData(0,0,256,256).data){n=Math.imul(n^b,16777619)>>>0;if(b)lit++;}return {hash:n,lit};};
  const particles=[];showcaseHullBurst.burst(particles,{x:128,y:128,normal:{x:1,y:0}},1000,.91976,1,1);
  if(particles.length<9||particles.some(p=>p.effectOwner!=='cinematic-combat-v1'))throw Error('Native hull burst did not select the candidate');
  const split=structuredClone(particles),whole=structuredClone(particles);
  for(const p of split){showcaseHullBurst.update(p,.05);showcaseHullBurst.update(p,.05);}
  for(const p of whole)showcaseHullBurst.update(p,.1);
  for(let i=0;i<split.length;i++)if(Math.hypot(split[i].x-whole[i].x,split[i].y-whole[i].y)>1e-8)throw Error('Hull motion depends on frame rate');
  const snapshot=JSON.stringify(split);
  for(const p of split)showcaseHullBurst.draw(ctx,p,1100);const first=hash();
  ctx.clearRect(0,0,256,256);for(const p of split)showcaseHullBurst.draw(ctx,p,1100);const same=hash();
  if(!first.lit||first.hash!==same.hash||JSON.stringify(split)!==snapshot)throw Error('Paused hull rendering changed the particles '+JSON.stringify({first,same,mutated:JSON.stringify(split)!==snapshot}));
  const hullImage=canvas.toDataURL();
  // Existing particles keep their implementation when the preview changes.
  nativeEffectProfiles.clearPreview();showcaseHullBurst.update(split[0],.01);showcaseHullBurst.draw(ctx,split[0],1110);
  if(split[0].elapsed<.109)throw Error('Particle ownership was lost after switching profiles');
  await nativeEffectProfiles.preview(original);
  const weapon=kind=>{ctx.clearRect(0,0,256,256);paintShowcaseWeaponShot(ctx,{kind,style:{color:0x51bdf0,thickness:3},spin:.37,spinSpeed:6,units:.91976,duration:560},
    {x:128,y:128,x1:30,y1:190,x2:220,y2:60,angle:-.5,zoom:2},kind==='beam'?70:5000);return hash();};
  const weapons={};for(const kind of ['beam','torpedo','disruptor']){weapons[kind]=weapon(kind);if(!weapons[kind].lit)throw Error('Active projectile disappeared: '+kind);}
  const weaponImage=canvas.toDataURL();
  // Deliberately churn colours; retained sprite resources must remain bounded.
  for(let i=0;i<50;i++)paintShowcaseWeaponShot(ctx,{kind:'torpedo',style:{color:i*220301,thickness:1},spin:1,spinSpeed:5,units:.91976},{x:128,y:128,angle:0,zoom:1},100);
  const metrics=nativeEffectProfiles.metrics();if(metrics.sprites>24||metrics.spriteBytes>metrics.maxSpriteBytes)throw Error('Weapon glow cache grew beyond its budget');
  if(showcaseState().hull!==before.hull||showcaseState().shields!==before.shields)throw Error('Presentation changed ship health');
  return {particles:particles.length,first,same,weapons,metrics,hullImage,weaponImage};
}"""


def run():
    with tempfile.TemporaryDirectory(prefix='vexed-combat-test-') as state:
        server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
        server.state=Path(state);threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                channel=os.environ.get('BROWSER_CHANNEL','msedge')
                browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
                page=browser.new_page(viewport={'width':1440,'height':900});errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{server.server_port}/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=6')
                page.wait_for_function('window.showcaseState?.().ready&&(window.showcaseShields?.snapshot().ready||window.showcaseShields?.snapshot().error)',timeout=90000)
                assert page.evaluate('showcaseShields.snapshot().ready'),page.evaluate('showcaseShields.snapshot().error')
                page.locator('[data-workspace-page=settings]:visible').click()
                page.locator('#shield-renderer').select_option('combat')
                page.wait_for_function('showcaseShields.snapshot().ready&&showcaseShields.snapshot().profile.implementation==="cinematic-combat-v1"')
                visual=page.evaluate(PIXELS)
                import base64
                for key in ['hullImage','weaponImage']:(OUTPUT/(key+'.png')).write_bytes(base64.b64decode(visual.pop(key).split(',')[1]))
                page.locator('[data-workspace-page=fire]:visible').click()
                for kind in ['beam','torpedo','disruptor']:
                    page.locator('#reset').click()
                    before=page.evaluate('nativeEffectProfiles.metrics().gpuWeaponPaints')
                    page.locator('#weapon-select').evaluate('(e,k)=>{e.value=[...e.options].find(o=>o.value.startsWith(k+":" )).value;e.dispatchEvent(new Event("change"));}',kind)
                    page.locator('#fire-weapon').click()
                    page.wait_for_function('(before)=>nativeEffectProfiles.metrics().gpuWeaponPaints>before',arg=before)
                    assert page.locator('#showcase-gpu-shields').is_visible()
                    page.screenshot(path=str(OUTPUT/(kind+'-gpu.png')))
                page.locator('#reset').click();page.locator('#shields').uncheck()
                before=page.evaluate('nativeEffectProfiles.metrics().gpuHullPaints')
                page.locator('#fire-weapon').click()
                page.wait_for_function('(before)=>nativeEffectProfiles.metrics().gpuHullPaints>before',arg=before)
                page.screenshot(path=str(OUTPUT/'hull-gpu.png'))
                if '--visual-only' in sys.argv:
                    assert not errors,errors
                    (OUTPUT/'visual.json').write_text(json.dumps(visual,indent=2));browser.close();print('Cinematic weapon/hull pixel, analytic motion, ownership and resource checks passed.',flush=True);return
                page.locator('[data-workspace-tab=lab]').click()
                page.wait_for_function('document.querySelector(".lab-notice").textContent.includes("Choose a scene")')
                child=page.frames[1];manifest=child.evaluate('effectLabScene.command("manifest")')
                candidate=next(p for p in manifest['candidates']['profiles'] if p['implementation']=='cinematic-combat-v1')
                fixture={'count':100,'scenario':'battle','shipType':6,'mix':True,'mixedWeapons':True,'mixedDamage':True,'rate':2,'size':44,'seed':429,'pattern':'staggered','lights':'--lights-off' not in sys.argv,'shieldRenderer':'gpu','weapon':'beam:0'}
                child.evaluate('(payload)=>effectLabScene.command("session",payload)',{'candidate':candidate,'fixture':fixture})
                runs=[]
                for count in [100,200]:
                    for variant,profile in [('baseline',manifest['release']),('candidate',candidate)]:
                        r=child.evaluate('p=>effectLabScene.command("measure",p)',{'fixture':{**fixture,'count':count},'profile':profile,'variant':variant,'warmup':2,'duration':5})
                        assert r['counters']['minimumVisible']==count and r['metrics']['valid']
                        if variant=='candidate':assert r['resources']['candidate']['gpuWeaponPaints']>0 and r['resources']['candidate']['gpuHullPaints']>0
                        runs.append(r);print(json.dumps({'count':count,'variant':variant,'fps':r['metrics']['fps'],'low1':r['metrics']['low1FPS'],'target':r['metrics']['targetObserved']}),flush=True)
                    assert child.evaluate('p=>EffectLabMetrics.comparable(...p)',runs[-2:])
                # Exercise projectile drawing and complete hull-only bursts separately.
                for scenario,weapon in [('weapons','torpedo:0'),('weapons','disruptor:0'),('hull','beam:0')]:
                    r=child.evaluate('p=>effectLabScene.command("measure",p)',{'fixture':{**fixture,'scenario':scenario,'weapon':weapon,'mixedWeapons':False},'profile':candidate,'variant':'candidate','warmup':1,'duration':3})
                    assert r['counters']['minimumVisible']==100
                    runs.append(r)
                page.screenshot(path=str(OUTPUT/'battle-100.png'));child.evaluate('effectLabScene.command("stop")');browser.close()
                assert not errors,errors
            games=[]
            if '--game' in sys.argv:
                for count in [100,200]:
                    args=SimpleNamespace(root=ROOT,state=Path(state),count=count,seconds=10,warmup=3,headed=False)
                    r=validate(args,fixture_override={**fixture,'count':count},preview_profile=candidate)
                    assert not r['errors'] and r['minimumVisible']==count
                    assert r['candidate']['gpuWeaponPaints']>0 and r['candidate']['gpuHullPaints']>0
                    if r['gpuTiming']['supported']:assert r['metrics']['gpuSamples']>0 and r['metrics']['gpuMs']>=0
                    games.append(r);print(json.dumps({'gameShips':count,'fps':r['metrics']['fps'],'low1':r['metrics']['low1FPS'],'status':r['status']}),flush=True)
            (OUTPUT/'results.json').write_text(json.dumps({'visual':visual,'runs':runs,'games':games,'errors':errors},indent=2),encoding='utf-8')
            print('Cinematic combat verification completed.',flush=True)
        finally:server.shutdown();server.server_close()


if __name__=='__main__':run()
