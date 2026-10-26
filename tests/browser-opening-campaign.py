"""Real campaign encounters, shared damage, debris contacts and visual evidence."""
import json,os,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/opening-campaign';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(channel=os.environ.get('BROWSER_CHANNEL','msedge'),headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1000},reduced_motion='no-preference')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:7790/html-games/broken-mirror-port/index.html')
    page.wait_for_function('()=>window.nativeOpeningCinematic&&document.querySelector("#startup").hidden',timeout=120000)
    save_before=page.evaluate('JSON.stringify([nativeSaveStorage.read("normal"),nativeSaveStorage.read("dev")])')
    page.locator('#menu-opening-film').click()
    page.wait_for_function('()=>nativeOpeningCinematic.snapshot().ready||document.querySelector(".opening-status").textContent.includes("could not load")',timeout=120000)
    initial=page.evaluate('nativeOpeningCinematic.snapshot()')
    (OUT/'initial.json').write_text(json.dumps(initial,indent=2),encoding='utf8')
    assert initial['ready'],(errors,initial['renderer']['failures'],page.locator('.opening-status').inner_text())
    page.locator('[data-film-action=pause]').click()
    captures=[]
    for label,t in [('earth',4),('raid-orion',10.9),('raid-vulcan',14.2),('annexation',22.3),('bombardment',27),('revolution',38.5),('klingons',49.2),('war',72.8),('wrecks',76.5),('aftermath',81),('resolve',90.8)]:
        page.evaluate('(t)=>nativeOpeningCinematic.seek(t)',t)
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT/(label+'.png')))
        s=page.evaluate('nativeOpeningCinematic.snapshot()');captures.append({'label':label,'time':t,'campaign':s['renderer']['campaign'],'effects':s['renderer']['effects'],'live':s['renderer']['liveEffects']})
        print(json.dumps({'label':label,'stats':s['renderer']['campaign']['stats'],'actors':[(a['type'],round(a['hull']),round(a['shields'])) for a in s['renderer']['campaign']['actors']],'errors':errors}),flush=True)
    (OUT/'encounters.json').write_text(json.dumps(captures,indent=2),encoding='utf8')
    stats=captures[-1]['campaign']['stats']
    for key in ['shots','shieldHits','shieldCollapses','hullHits','disabled','destroyed','debrisShips','debrisAsteroids','worldHits']:assert stats[key]>0,(key,stats)
    war=next(c for c in captures if c['label']=='war')['campaign']
    hero=next(a for a in war['actors'] if a['id']=='film:imperial0')
    assert hero['shields']==0 and hero['phase']=='disabled' and hero['hull']>0,hero
    wrecks=next(c for c in captures if c['label']=='wrecks')['campaign']
    assert next(a for a in wrecks['actors'] if a['id']=='film:imperial0')['phase']=='destroyed',wrecks
    for r in wrecks['rocks']:assert r['hull']==0 or r['hull']>=12.5,r
    assert page.evaluate('nativeEffectProfiles.current().implementation')=='cinematic-battle-v2'
    assert page.evaluate('nativeOpeningCinematic.snapshot().score.weaponSounds') is False
    if '--continuous' in sys.argv:
        page.evaluate('nativeOpeningCinematic.seek(0)')
        page.locator('[data-film-action=pause]').click()
        page.evaluate('''()=>{window.__campaignPlay={samples:[],maxExplosions:0};const d=__campaignPlay;d.timer=setInterval(()=>{const s=nativeOpeningCinematic.snapshot();if(s.active){d.last=s;d.maxExplosions=Math.max(d.maxExplosions,s.score.explosionVoices);d.samples.push({time:s.time,voice:s.audioTime,music:s.score.time,cpu:s.renderer.lastFrameMs});}},200);}''')
        for second in range(130):
            page.wait_for_timeout(1000)
            current=page.evaluate('nativeOpeningCinematic.snapshot()')
            if second%10==0:print(json.dumps({'continuousSecond':second,'time':current['time'],'audio':current['audioTime'],'paused':current['paused'],'active':current['active'],'errors':errors}),flush=True)
            if not current['active'] or current['time']>98:break
        final=page.evaluate('nativeOpeningCinematic.active?nativeOpeningCinematic.snapshot():__campaignPlay.last')
        delivery=page.evaluate('()=>{clearInterval(__campaignPlay.timer);return __campaignPlay;}')
        final['delivery']=delivery
        (OUT/'continuous.json').write_text(json.dumps(final,indent=2),encoding='utf8')
        assert final['time']>97,(final['time'],final['paused'],errors)
        assert final['renderer']['campaign']['stats']['destroyed']>=10,final['renderer']['campaign']['stats']
        assert len(final['renderer']['worlds'])>=10,final['renderer']['worlds']
        assert delivery['maxExplosions']>0,delivery['maxExplosions']
        page.wait_for_function('()=>!nativeOpeningCinematic.active',timeout=15000)
    else:
        page.locator('[data-film-action=skip]').click()
    assert page.evaluate('JSON.stringify([nativeSaveStorage.read("normal"),nativeSaveStorage.read("dev")])')==save_before
    assert not errors,errors
    browser.close()
