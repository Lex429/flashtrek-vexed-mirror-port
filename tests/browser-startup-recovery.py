"""Measure real New/Launch and Continue, cold/cached, without altering user saves."""
import argparse
import functools
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'test-results'
spec = importlib.util.spec_from_file_location('npc_perf', ROOT/'tests/browser-npc-performance.py')
perf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(perf)
INSTALL=perf.INSTALL.replace('startNativeDevGame();',r'''
  const metrics=window.nativeSimulationMetrics;
  window.nativeSimulationMetrics={...metrics,record(state,data){
    if(window.__startupKeyDownAt&&state===window.__npcPerfState&&state.speed>0&&!window.__startupModelResponseAt)window.__startupModelResponseAt=performance.now();
    return metrics.record(state,data);
  }};
''')

INIT = r"""(()=>{
  window.__startupLong=[];window.__startupInput=[];
  new PerformanceObserver(list=>{for(const e of list.getEntries())__startupLong.push({at:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});
  addEventListener('keydown',e=>{if(e.code==='KeyW')requestAnimationFrame(()=>__startupInput.push(performance.now()-e.timeStamp));});
})()"""
SNAPSHOT = r"""()=>{
  const s=__npcPerfState,phases={};for(const e of s.civilianTraffic.ships){const phase=e.task?.phase||e.phase;phases[phase]=(phases[phase]||0)+1;}
  const player=s.system===1?vexedSolFlight.shipPosition(s):s,view=nativeView.measure(document.querySelector('#space'));
  const visible=nativeShipSystems.collectShips(s).filter(e=>e.category!=='player'&&Math.abs(e.x-player.x)<view.w/2&&Math.abs(e.y-player.y)<view.h/2).map(e=>({id:e.id,category:e.category,x:e.x,y:e.y,speed:e.speed,phase:e.entity.phase}));
  return {population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,civilians:s.civilianTraffic.ships.length,visible,
    phases,history:s.worldBootstrap||null,clock:nativeSimulation.seconds(s),x:s.x,y:s.y,speed:s.speed,
    bootstrap:window.nativeWorldBootstrap?.diagnostics(),preparation:window.nativeDamageArtPreparation?.snapshot?.(),
    scheduler:window.nativeSimulationFrame?.snapshot?.(s),artwork:nativeShipEffects.metrics?.()};
}"""

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url')
    parser.add_argument('--label',default='after')
    parser.add_argument('--seconds',type=float,default=60)
    parser.add_argument('--executable')
    args=parser.parse_args()
    OUTPUT.mkdir(exist_ok=True)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args): pass
    server=None
    if args.base_url: base=args.base_url.rstrip('/')
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        base=f'http://127.0.0.1:{server.server_port}'
    report={'label':args.label,'viewport':{'width':1280,'height':850},'seconds':args.seconds,'runs':[]}
    errors=[];failed=[]
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            launch={'executable_path':args.executable} if args.executable else ({'channel':channel} if channel else {})
            browser=p.chromium.launch(headless=True,**launch)
            report['browserVersion']=browser.version
            context=browser.new_context(viewport=report['viewport'],bypass_csp=True)
            page=context.new_page()
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
            page.add_init_script('('+perf.INSTRUMENT+')()')
            page.add_init_script(INIT)
            fixture=None
            for mode in ['new-cold','continue-cold','continue-cached','new-cached']:
                if mode=='continue-cold':
                    context.close()
                    context=browser.new_context(viewport=report['viewport'],bypass_csp=True)
                    page=context.new_page()
                    page.on('pageerror',lambda e:errors.append(str(e)))
                    page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
                    page.add_init_script('('+perf.INSTRUMENT+')()')
                    page.add_init_script(INIT)
                page.goto(base+'/html-games/broken-mirror-port/index.html')
                page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
                # Same instrumentation as the established population benchmark,
                # with no implicit Dev game or full optional-art warm-up.
                page.evaluate(INSTALL)
                if mode.startswith('new'):
                    page.locator('[data-menu="new"]').click()
                    page.locator('#setup-ui .setup-primary').click()
                    button=page.locator('#setup-ui .setup-primary')
                else:
                    page.evaluate('(saved)=>nativeSaveStorage.write(JSON.parse(saved))',fixture)
                    page.reload()
                    page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
                    page.evaluate(INSTALL)
                    button=page.locator('[data-menu="continue"]')
                page.evaluate('()=>{__npcPerf.record=true;__startupLong=[];window.__startupAt=performance.now();}')
                start=time.perf_counter()
                button.click()
                launch_ms=(time.perf_counter()-start)*1000
                if mode.startswith('new'):
                    page.wait_for_function('()=>nativeOpeningCinematic.active')
                    page.locator('[data-film-action="skip"]').click()
                page.wait_for_function('()=>document.body.classList.contains("playing") && window.__npcPerfState',timeout=120000)
                initial=page.evaluate(SNAPSHOT)
                if initial.get('bootstrap'):
                    assert initial['bootstrap']['error'] is None,initial['bootstrap']
                    if initial['bootstrap']['ready']:assert initial['bootstrap']['geometryChecked']>0,initial['bootstrap']
                    assert initial['history']['historySeconds']==45,initial
                    assert len(initial['phases'])>=4,initial['phases']
                    if mode.startswith('new'):assert any((e.get('speed') or 0)>5 for e in initial['visible']),initial['visible']
                if fixture is None:
                    fixture=page.evaluate('JSON.stringify(__npcPerfState)')
                    report['continueSaveSha256']=hashlib.sha256(fixture.encode()).hexdigest()
                page.bring_to_front()
                page.locator('#space').focus()
                # Branded Brave can defer its first headless composited frame.
                # Record that startup wait; send real flight input after paint.
                first_frame_ms=page.evaluate('async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return performance.now()-__startupAt;}') if args.executable else None
                page.evaluate('()=>{window.__startupKeyDownAt=performance.now();window.__startupModelResponseAt=0;}')
                page.keyboard.down('w')
                page.wait_for_timeout(200)
                page.keyboard.up('w')
                released_before_response=page.evaluate('__npcPerfState.speed===0')
                page.wait_for_function('()=>__npcPerfState.speed>0',timeout=5000)
                input_response_ms=page.evaluate('(__startupModelResponseAt||performance.now())-__startupKeyDownAt')
                input_result=page.evaluate('({latencies:__startupInput,speed:__npcPerfState.speed})')
                assert input_result['speed']>0,{**input_result,'javascriptErrors':errors,'failedResponses':failed,'focus':page.evaluate('({hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),active:document.activeElement?.id,blocked:nativeSimulation.blocked(),frames:__npcPerf.frames.length,clock:nativeSimulation.seconds(__npcPerfState)})')}
                page.wait_for_timeout(max(0,args.seconds-.2-max(0,input_response_ms-200)/1000)*1000)
                data=page.evaluate('()=>{__npcPerf.record=false;return {frames:__npcPerf.frames,longTasks:__startupLong,input:__startupInput,resources:performance.getEntriesByType("resource").map(r=>({name:r.name,duration:r.duration,bytes:r.transferSize,type:r.initiatorType}))};}')
                frames=data.pop('frames')
                windows={}
                for seconds in [5,15,args.seconds]:
                    selected=[];elapsed=0
                    for frame in frames:
                        elapsed+=frame['intervalMs']
                        if elapsed>seconds*1000: break
                        selected.append(frame)
                    windows[str(seconds)]=perf.summary(selected)
                report['runs'].append({'mode':mode,'launchClickMs':launch_ms,'firstPaintWaitMs':first_frame_ms,'inputResponseWaitMs':input_response_ms,'releasedBeforeResponse':released_before_response,'inputResult':input_result,'initial':initial,'final':page.evaluate(SNAPSHOT),'windows':windows,**data})
                (OUTPUT/f'startup-{args.label}-{mode}-frames.json').write_text(json.dumps(frames),encoding='utf-8')
                (OUTPUT/f'startup-{args.label}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            browser.close()
    finally:
        if server: server.shutdown();server.server_close()
    report['javascriptErrors']=errors
    report['failedResponses']=failed
    report['passed']=not errors and not failed
    (OUTPUT/f'startup-{args.label}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert not errors and not failed,(errors,failed)
    print(json.dumps({'passed':True,'runs':[{'mode':r['mode'],'clickMs':r['launchClickMs'],'phases':r['initial']['phases'],'frameP95':r['windows'][str(args.seconds)]['intervalMs']['p95'],'first5P95':r['windows']['5']['intervalMs']['p95'],'longTasks':len(r['longTasks'])} for r in report['runs']]}))

if __name__=='__main__': main()
