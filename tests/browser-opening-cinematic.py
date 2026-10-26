"""Real new-game film, narration playback, battle frames, controls and save isolation."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/opening-cinematic'
OUT.mkdir(parents=True,exist_ok=True)
manifest=json.loads((ROOT/'html-games/broken-mirror-port/assets/opening/cinematic.json').read_text(encoding='utf-8'))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass


server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1600,'height':1000},reduced_motion='reduce')
        page.add_init_script('''(()=>{const BaseAudio=window.Audio;window.__filmMedia=[];window.Audio=function(...args){const a=new BaseAudio(...args);__filmMedia.push(a);return a;};window.Audio.prototype=BaseAudio.prototype;})();''')
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
        base=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/'
        page.goto(base+'index.html')
        page.wait_for_function('()=>window.nativeOpeningCinematic&&nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        # A real setup launch must enter the movie before creating or replacing a save.
        page.locator('[data-menu="new"]').click()
        page.locator('.setup-primary').click()
        page.locator('input[name="captain"]').fill('Cinematic Captain')
        page.locator('input[name="ship"]').fill('ISS Resolve')
        page.locator('input[name="government"]').fill('Earth Empire')
        before=page.evaluate('JSON.stringify([nativeSaveStorage.read("normal"),nativeSaveStorage.read("dev")])')
        page.locator('.setup-primary').click()
        page.wait_for_function('()=>nativeOpeningCinematic.snapshot().ready',timeout=120000)
        assert page.locator('#opening-cinematic').is_visible()
        assert not page.evaluate('document.body.classList.contains("playing")')
        assert page.evaluate('JSON.stringify([nativeSaveStorage.read("normal"),nativeSaveStorage.read("dev")])')==before
        assert not page.evaluate('nativeOpeningCinematic.play()'),'Duplicate film accepted'
        state=page.evaluate('nativeOpeningCinematic.snapshot()')
        assert not state['renderer']['failures'],state
        print(json.dumps({'prepared':state['renderer']}),flush=True)
        page.wait_for_function('()=>nativeOpeningCinematic.snapshot().audioMaster',timeout=15000)
        audio_duration=page.evaluate('__filmMedia.find(a=>a.dataset.openingNarration==="true").duration')
        assert abs(audio_duration-manifest['duration'])<.06,(audio_duration,manifest['duration'])
        war_start=next(c for c in manifest['cues'] if c['scene']=='war')['start']
        page.evaluate('(t)=>nativeOpeningCinematic.seek(t)',war_start+4)
        page.wait_for_function('()=>nativeOpeningCinematic.snapshot().audioTime>60&&!nativeOpeningCinematic.snapshot().seeking',timeout=15000)
        page.wait_for_timeout(250)
        assert page.locator('#opening-cinematic').get_attribute('data-scene')=='war'
        assert page.evaluate('nativeOpeningCinematic.snapshot().time')>war_start+4
        page.emulate_media(reduced_motion='no-preference')
        # Measure the running shared effects and both audio clocks, including destruction.
        page.evaluate('''()=>{window.__filmDelivery={samples:[],raf:[],last:performance.now(),running:true};
          const d=__filmDelivery;function frame(t){d.raf.push(t-d.last);d.last=t;if(d.running)requestAnimationFrame(frame);}requestAnimationFrame(frame);
          d.timer=setInterval(()=>{const s=nativeOpeningCinematic.snapshot();d.samples.push({audio:s.audioTime,score:s.score.time,visual:s.time,cpu:s.renderer.lastFrameMs});},100);
        }''')
        page.wait_for_timeout(4000)
        delivery=page.evaluate('''()=>{const d=__filmDelivery;d.running=false;clearInterval(d.timer);return {samples:d.samples,raf:d.raf,renderer:nativeOpeningCinematic.snapshot().renderer};}''')
        assert delivery['samples'] and max(abs(s['audio']-s['score']) for s in delivery['samples'])<.2,delivery['samples']
        shared=delivery['renderer']['shared']
        assert shared['parallaxStars']==350 and shared['liveShips']>100 and shared['weaponFrames']>0 and shared['shieldSubmissions']>0,shared
        assert delivery['renderer']['liveEffects']['shipLamps']['lamps']>0,delivery
        page.evaluate('nativeOpeningCinematic.seek(.6)')
        # Route the actually playing MP3 through an analyser and measure audible PCM.
        page.evaluate('''async()=>{
          const a=__filmMedia.find(a=>a.dataset.openingNarration==='true'),ctx=new AudioContext(),source=ctx.createMediaElementSource(a),analyser=ctx.createAnalyser();
          source.connect(analyser);analyser.connect(ctx.destination);await ctx.resume();window.__narrationProbe={ctx,analyser,peak:0};
        }''')
        page.wait_for_timeout(200)
        silent_peak=page.evaluate('''()=>{const p=__narrationProbe,d=new Float32Array(p.analyser.fftSize);p.analyser.getFloatTimeDomainData(d);return Math.max(...d.map(Math.abs));}''')
        assert silent_peak<.0001,('Narration lead lost',silent_peak)
        page.evaluate('nativeOpeningCinematic.seek(3.2)')
        page.wait_for_function('''()=>{const p=__narrationProbe,data=new Float32Array(p.analyser.fftSize);p.analyser.getFloatTimeDomainData(data);p.peak=Math.max(p.peak,...data.map(Math.abs));return p.peak>.003;}''',timeout=15000)
        audio_peak=page.evaluate('__narrationProbe.peak')
        page.locator('[data-film-action="pause"]').click()
        stopped=page.evaluate('nativeOpeningCinematic.snapshot().time')
        page.wait_for_timeout(350)
        assert abs(page.evaluate('nativeOpeningCinematic.snapshot().time')-stopped)<.03
        page.emulate_media(reduced_motion='no-preference')
        screenshots=[]
        for scene in ['founding','expansion','annexation','revolution','klingons','anarchy','war','aftermath','resolve','title']:
            if scene=='title':time=manifest['titleStart']+3
            else:
                cue=next(c for c in manifest['cues'] if c['scene']==scene)
                time=(cue['start']+cue['speechEnd'])/2
            if scene in ['war','revolution','klingons']:time+=.18
            page.evaluate('(time)=>nativeOpeningCinematic.seek(time)',time)
            assert page.locator('#opening-cinematic').get_attribute('data-scene')==scene
            page.screenshot(path=str(OUT/f'{scene}.png'))
            screenshots.append(scene)
            shot=page.evaluate('nativeOpeningCinematic.snapshot()')
            assert not shot['renderer']['failures'],shot
        for label,time in [('decloaking',manifest['events']['klingonDecloakAt']-.6),('cloaking',manifest['events']['klingonFirstVolleyAt']+2.8),('disabled',manifest['events']['heroDisabledAt']+.3),('destruction',manifest['events']['heroDestroyedAt']+.5)]:
            page.evaluate('(t)=>nativeOpeningCinematic.seek(t)',time)
            page.screenshot(path=str(OUT/f'{label}.png'))
        effects_state=page.evaluate('nativeOpeningCinematic.snapshot().renderer.shared')
        assert effects_state['cloakFrames']>0 and effects_state['disabledFrames']>0 and effects_state['destructionFrames']>0,effects_state
        page.locator('[data-film-action="subtitles"]').click()
        assert page.locator('.opening-subtitles').is_hidden()
        page.locator('[data-film-action="subtitles"]').click()
        page.locator('[data-film-action="audio"]').click()
        page.locator('[data-film-volume="narration"]').fill('73')
        page.locator('[data-film-volume="music"]').fill('21')
        page.locator('[data-film-volume="effects"]').fill('32')
        assert page.evaluate('nativeOpeningCinematic.snapshot().settings.narration')==.73
        page.set_viewport_size({'width':900,'height':700})
        page.evaluate('(t)=>nativeOpeningCinematic.seek(t)',next(c for c in manifest['cues'] if c['scene']=='war')['start']+4)
        page.screenshot(path=str(OUT/'war-compact.png'))
        assert page.locator('[data-film-action="skip"]').evaluate('(b)=>{const r=b.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}')
        # Escape completes the pending new-game launch exactly once.
        page.keyboard.press('Escape')
        page.wait_for_function('()=>document.body.classList.contains("playing")',timeout=120000)
        assert not page.evaluate('nativeOpeningCinematic.active')
        saved=page.evaluate('nativeSaveStorage.read("normal")')
        assert saved['captain']=='Cinematic Captain' and saved['shipName']=='ISS Resolve',saved
        normal=page.evaluate('JSON.stringify(nativeSaveStorage.read("normal"))')
        # Reload to the real menu and replay without changing either save mode.
        page.goto(base+'index.html')
        page.wait_for_function('()=>window.nativeOpeningCinematic&&document.querySelector("#startup").hidden',timeout=120000)
        page.locator('#menu-opening-film').click()
        page.wait_for_function('()=>nativeOpeningCinematic.snapshot().ready',timeout=120000)
        assert page.evaluate('nativeOpeningCinematic.snapshot().settings.narration')==.73
        assert page.evaluate('nativeOpeningCinematic.snapshot().settings.music')==.21
        assert page.evaluate('nativeOpeningCinematic.snapshot().settings.effects')==.32
        page.evaluate('(t)=>nativeOpeningCinematic.seek(t)',manifest['duration']-.5)
        page.wait_for_function('()=>!nativeOpeningCinematic.active',timeout=15000)
        assert page.evaluate('nativeOpeningCinematic.snapshot().outcome.reason')=='complete'
        assert page.locator('#menu-art').is_visible()
        assert page.evaluate('JSON.stringify(nativeSaveStorage.read("normal"))')==normal
        assert page.evaluate('nativeSaveStorage.read("dev")') is None
        assert not errors,errors
        # Skip must work during the menu fade, before cold preparation finishes.
        cold=browser.new_page(viewport={'width':1280,'height':850})
        cold.on('pageerror',lambda error:errors.append(str(error)))
        cold.goto(base+'index.html')
        cold.wait_for_function('()=>window.nativeOpeningCinematic&&document.querySelector("#startup").hidden',timeout=120000)
        cold.locator('[data-menu="new"]').click();cold.locator('.setup-primary').click();cold.locator('.setup-primary').click()
        cold.wait_for_function('()=>nativeOpeningCinematic.active')
        cold.locator('[data-film-action="skip"]').click()
        cold.wait_for_function('()=>document.body.classList.contains("playing")',timeout=120000)
        cold.wait_for_timeout(350)
        assert cold.evaluate('nativeOpeningCinematic.snapshot().renderer.prepared')<=3
        assert not errors,errors
        (OUT/'live-effects-delivery.json').write_text(json.dumps(delivery,indent=2)+'\n',encoding='utf-8')
        report=dict(passed=True,duration=manifest['duration'],audioDuration=audio_duration,narrationLeadSilent=True,scenes=screenshots,audibleNarrationPeak=audio_peak,audioClockSeeking=True,sharedLiveEffects=True,maximumMusicDrift=max(abs(s['audio']-s['score']) for s in delivery['samples']),controls=True,newGameAfterFilm=True,replaySaveIsolation=True,normalCompletion=True,coldSkipCancelsPreparation=True,errors=errors)
        (OUT/'browser.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
