"""Cinematic sword hold, opaque screen switch, real input and original audio."""
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'menu-transition'
OUTPUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args): pass
server=None
if len(sys.argv)>1:base=sys.argv[1].rstrip('/')
else:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
url=base+'/html-games/broken-mirror-port/index.html'
manifest=json.loads((ROOT/'html-games/broken-mirror-port/assets/menu-sounds/manifest.json').read_text(encoding='utf-8'))
for clip in manifest['sounds']:
    data=(ROOT/'html-games/broken-mirror-port/assets/menu-sounds'/clip['file']).read_bytes()
    assert hashlib.sha256(data).hexdigest()==clip['sha256']
    assert clip['seekSamples']==1661 and clip['sampleRate']==11025

AUDIO_WORKLET=r"""
    registerProcessor('menu-pcm-peak',class extends AudioWorkletProcessor{
      constructor(){super();this.peak=0;}
      process(inputs,outputs){
        const input=inputs[0]||[],output=outputs[0]||[];let peak=this.peak;
        for(const channel of input)for(const value of channel)peak=Math.max(peak,Math.abs(value));
        for(let i=0;i<output.length;i++){const source=input[i]||input[0];if(source)output[i].set(source);else output[i].fill(0);}
        if(peak>this.peak){this.peak=peak;this.port.postMessage(peak);}return true;
      }
    });"""
AUDIO_PROBE=r"""(() => {
  const proto=AudioContext.prototype,create=proto.createGain;
  window.menuAudioProbes=[];window.menuAudioReady=[];
  // Capture real PCM on the audio thread: a busy composited menu frame can
  // prevent main-thread timers from sampling an entire short hover clip.
  const module=URL.createObjectURL(new Blob([__PCM_WORKLET__],{type:'application/javascript'}));
  const Context=window.AudioContext;
  window.AudioContext=function(...args){const context=new Context(...args);
    menuAudioReady.push(context.audioWorklet.addModule(module).then(()=>{context.__menuPeakReady=true;}));return context;};
  window.AudioContext.prototype=proto;
  proto.createGain=function(...args){
    const gain=create.apply(this,args),connect=gain.connect.bind(gain),context=this;
    gain.connect=(target,...rest)=>{
      if(target!==context.destination)return connect(target,...rest);
      const analyser=context.createAnalyser();analyser.fftSize=1024;
      const probe={gain,analyser,peak:0};menuAudioProbes.push(probe);
      connect(analyser);
      if(context.__menuPeakReady){const meter=new AudioWorkletNode(context,'menu-pcm-peak');
        meter.port.onmessage=event=>{probe.peak=Math.max(probe.peak,event.data);};
        analyser.connect(meter);return meter.connect(target);}
      return analyser.connect(target);
    };
    return gain;
  };
  window.scanMenuAudio=()=>{
    for(const probe of menuAudioProbes){
      const values=new Float32Array(probe.analyser.fftSize);probe.analyser.getFloatTimeDomainData(values);
      for(const value of values)probe.peak=Math.max(probe.peak,Math.abs(value));
    }
    return menuAudioProbes.map(p=>({gain:p.gain.gain.value,peak:p.peak}));
  };
})();""".replace('__PCM_WORKLET__',json.dumps(AUDIO_WORKLET))

errors=[];failed=[];report={}
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        # The PCM observer is a test-only blob worklet. The later uninstrumented
        # reduced-motion/touch pages retain the application's normal CSP.
        page=browser.new_page(viewport={'width':1440,'height':1000},bypass_csp=True)
        page.add_init_script(AUDIO_PROBE)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:failed.append(f'{r.status} {r.url}') if r.status>=400 else None)
        page.goto(url)
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        assert not page.evaluate('nativeMenuSounds.snapshot().unlocked'),'Audio unlocked without a user gesture'
        # Dev entry points are intentionally visible in the current launcher.
        for name in ['dev','continue-dev']:assert page.locator(f'[data-menu="{name}"]').is_visible()
        disabled=page.locator('[data-menu="instructions"]');disabled.hover()
        assert disabled.evaluate('(b)=>getComputedStyle(b,"::before").animationName')=='none'
        assert not page.evaluate('nativeMenuTransition.snapshot().active')
        page.locator('#menu-sound-toggle').click();page.locator('#menu-sound-toggle').click()
        page.wait_for_function('()=>nativeMenuSounds.snapshot().decoded.length===3&&nativeMenuSounds.snapshot().state==="running"')
        page.evaluate('()=>Promise.all(menuAudioReady)')
        # Retain PCM peaks while Playwright waits for the hover action's
        # composited frames; a short sound can finish before hover() returns.
        page.evaluate('()=>{window.__menuPeakTimer=setInterval(scanMenuAudio,5);}')
        button=page.locator('[data-menu="new"]');button.hover()
        page.wait_for_function('()=>scanMenuAudio().some(p=>p.peak>.015)',polling=10)
        report['hoverAudio']=page.evaluate('scanMenuAudio()')
        assert button.evaluate('(b)=>getComputedStyle(b,"::before").animationName')=='menu-light-sweep'
        page.screenshot(path=str(OUTPUT/'hover.png'))
        page.evaluate("""()=>{
          window.menuActions=[];const open=nativeSetup.open;
          nativeSetup.open=()=>{menuActions.push({elapsed:performance.now()-window.menuStarted,opacity:+getComputedStyle(document.querySelector('#menu-transition-cover')).opacity});return open();};
        }""")
        before_save=page.evaluate('JSON.stringify([nativeSaveStorage.read("normal"),nativeSaveStorage.read("dev")])')
        start=page.evaluate("""()=>{
          window.__menuWitness={holding:null,fadeOut:false,midOpacity:false,fadeIn:false};
          const sample=()=>{const phase=nativeMenuTransition.snapshot().phase,opacity=+getComputedStyle(document.querySelector('#menu-transition-cover')).opacity,w=__menuWitness;
            if(phase==='holding'&&!w.holding){const light=nativeMenuEmblem.snapshot();w.holding={phase,active:nativeSetup.active,calls:menuActions.length,opacity,lighting:{ready:light.ready,renderer:light.renderer}};}
            if(phase==='fade-out')w.fadeOut=true;if(phase==='fade-in')w.fadeIn=true;
            if(opacity>.05&&opacity<.95&&!nativeSetup.active)w.midOpacity=true;};
          window.__menuWitnessTimer=setInterval(sample,5);
          window.menuStarted=performance.now();const b=document.querySelector('[data-menu="new"]');b.click();b.click();
          sample();
          return {calls:menuActions.length,transition:nativeMenuTransition.snapshot(),emblem:document.querySelector('.menu-compass').classList.contains('menu-emblem-cinematic')};
        }""")
        assert start['calls']==0 and start['transition']['phase']=='holding' and start['emblem']
        assert page.locator('#menu-impact-canvas').count()==0,'Blood canvas remains'
        page.wait_for_function('()=>scanMenuAudio().some(p=>p.gain>.9&&p.peak>.015)',polling=10,timeout=3000)
        page.wait_for_timeout(20)
        held=page.evaluate('window.__menuWitness.holding')
        assert held['phase']=='holding' and not held['active'] and held['calls']==0 and held['opacity']==0,held
        assert held['lighting']['ready'] and held['lighting']['renderer']=='webgl'
        page.wait_for_function('()=>__menuWitness.fadeOut',polling=10)
        page.wait_for_function('()=>__menuWitness.midOpacity',polling=10)
        page.wait_for_selector('#setup-ui:not([hidden])')
        assert page.evaluate('menuActions.length')==1,'Rapid click ran the menu action twice'
        action=page.evaluate('menuActions[0]');assert action['elapsed']>=400 and action['opacity']==1,action
        report['screenSwitch']=action
        page.wait_for_function('()=>__menuWitness.fadeIn',polling=10)
        page.wait_for_function('()=>{scanMenuAudio();return !nativeMenuTransition.snapshot().active;}',polling=10)
        assert page.locator('#menu-transition-cover').is_hidden()
        page.evaluate('clearInterval(__menuWitnessTimer)')
        assert page.evaluate('document.querySelector("#menu-transition-cover").getAnimations().length')==0
        assert page.evaluate('JSON.stringify([nativeSaveStorage.read("normal"),nativeSaveStorage.read("dev")])')==before_save
        assert page.evaluate('nativeMenuSounds.snapshot().played.press===1&&nativeMenuSounds.snapshot().played.confirm===1')
        report['audio']=page.evaluate('scanMenuAudio()')
        assert max(p['peak'] for p in report['audio'])>.05,'Original clips decoded but produced no audible samples'
        page.screenshot(path=str(OUTPUT/'destination.png'))
        page.locator('.setup-back').click()
        page.locator('[data-menu="options"]').click();page.wait_for_selector('#pause-menu .pause-options:not([hidden])');page.wait_for_function('()=>!nativeMenuTransition.snapshot().active')
        page.locator('#pause-menu [data-back]').click();page.locator('#pause-menu [data-resume]').click()
        page.wait_for_timeout(250)
        count=page.evaluate('menuActions.length')
        page.evaluate('''()=>{document.querySelector('[data-menu="new"]').click();nativePause.open();}''')
        page.wait_for_timeout(1550)
        assert page.evaluate('menuActions.length')==count and not page.evaluate('nativeSetup.active')
        page.locator('#pause-menu [data-resume]').click()
        for key in ['Enter','Space']:
            page.wait_for_function('()=>!nativeSetup.active&&!nativeMenuTransition.snapshot().active')
            button.focus();page.keyboard.press(key);page.wait_for_selector('#setup-ui:not([hidden])');page.wait_for_function('()=>!nativeMenuTransition.snapshot().active');count+=1
            page.wait_for_function('(count)=>menuActions.length===count',arg=count)
            page.locator('.setup-back').click();page.wait_for_selector('#setup-ui',state='hidden')
        page.locator('#menu-sound-toggle').click()
        played=page.evaluate('nativeMenuSounds.snapshot().played')
        button.click();page.wait_for_selector('#setup-ui:not([hidden])');page.wait_for_function('()=>!nativeMenuTransition.snapshot().active')
        assert page.evaluate('nativeMenuSounds.snapshot().played')==played,'Muted clips still played'
        page.reload();page.wait_for_function('()=>document.querySelector("#startup").hidden',timeout=90000)
        assert not page.evaluate('nativeMenuSounds.snapshot().enabled') and page.locator('#menu-sound-toggle').inner_text()=='Sound off'
        report['viewports']=[]
        for w,h in [(1280,850),(800,600),(640,480),(390,844),(320,568)]:
            page.set_viewport_size({'width':w,'height':h})
            geometry=page.evaluate('''()=>{
              const rects=['#menu-sound-toggle','#menu-music-toggle','.menu-space-caption'].map(id=>document.querySelector(id).getBoundingClientRect());
              const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
              return {overlap:rects.some((a,i)=>rects.some((b,j)=>i<j&&overlap(a,b))),scroll:document.body.scrollWidth>innerWidth||document.body.scrollHeight>innerHeight};
            }''')
            assert not geometry['overlap'] and not geometry['scroll'],(w,h,geometry)
            report['viewports'].append([w,h])
        page.set_viewport_size({'width':1280,'height':850})
        # Normal saves still launch/continue through the actual menu callbacks.
        button.click();page.wait_for_selector('#setup-ui:not([hidden])');page.wait_for_function('()=>!nativeMenuTransition.snapshot().active');page.locator('.setup-primary').click();page.locator('.setup-primary').click()
        assert not page.evaluate('nativeOpeningCinematic.active')
        page.wait_for_function('()=>document.body.classList.contains("playing")&&!nativeMenuTransition.snapshot().active')
        assert not page.evaluate('nativeMenuTransition.snapshot().active')
        page.reload();page.wait_for_function('()=>document.querySelector("#startup").hidden',timeout=90000)
        page.locator('[data-menu="continue"]').click();page.wait_for_function('()=>document.body.classList.contains("playing")&&!nativeMenuTransition.snapshot().active')
        reduced=browser.new_page(viewport={'width':1280,'height':850},reduced_motion='reduce')
        reduced.on('pageerror',lambda e:errors.append(str(e)))
        reduced.goto(url);reduced.wait_for_function('()=>window.nativeSetup&&document.querySelector("#startup").hidden',timeout=90000)
        immediate=reduced.evaluate('''()=>{document.querySelector('[data-menu="new"]').click();return {active:nativeSetup.active,transition:nativeMenuTransition.snapshot(),animation:getComputedStyle(document.querySelector('[data-menu="new"]'),'::before').animationName};}''')
        assert immediate['active'] and not immediate['transition']['active'] and immediate['animation']=='none'
        touch=browser.new_page(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
        touch.on('pageerror',lambda e:errors.append(str(e)))
        touch.goto(url);touch.wait_for_function('()=>window.nativeSetup&&document.querySelector("#startup").hidden',timeout=90000)
        touch.locator('[data-menu="new"]').tap();touch.wait_for_selector('#setup-ui:not([hidden])');touch.wait_for_function('()=>!nativeMenuTransition.snapshot().active')
        assert touch.evaluate('nativeSetup.active')
        assert not errors and not failed,(errors,failed)
        report.update(ok=True,originalSounds=[s['linkage'] for s in manifest['sounds']],transitionCleanup=True,swordHold=True,opaqueScreenSwitch=True,mutedAndPersisted=True,mouseKeyboardContinue=True,touch=True,reducedMotionImmediate=True,pageErrors=errors,failedResponses=failed)
        (OUTPUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    if server:server.shutdown()
