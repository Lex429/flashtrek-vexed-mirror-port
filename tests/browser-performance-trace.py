"""Untimed diagnostic companion to browser-performance-review.py.

CDP tracing and source-level candidate counters are deliberately excluded from
clean frame-delivery runs. Raw traces/profiles stay under ignored test-results.
"""
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

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/performance-review'
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'tests'/file)
    item=importlib.util.module_from_spec(spec);spec.loader.exec_module(item);return item
review=module('performance_review','browser-performance-review.py')
combat=module('save_cost_review','browser-combat-performance.py')

DIAGNOSTICS=r"""() => {
  const p=window.__diagnosticCosts={record:false,projectileCandidates:0,debrisCandidates:0,fragmentSteps:0,shotAdvances:0,descriptions:0,stats:0,sceneRequests:0};
  for(const [name,method,counter] of [['nativeShipDefinitions','describe','descriptions'],['nativeShipDefinitions','forEntity','stats'],['nativeShipSystems','scene','sceneRequests'],['nativeEnvironmentalImpacts','debris','fragmentSteps'],['nativeCombatShots','advance','shotAdvances']]){
    const api=window[name],fn=api[method];window[name]={...api,[method](...args){if(p.record)p[counter]++;return fn(...args);}};
  }
}"""

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,default=ROOT)
    parser.add_argument('--label',required=True)
    parser.add_argument('--fixture',type=Path,default=OUTPUT/'initial-save.json')
    parser.add_argument('--scenario',choices=['flight','crowdedCombat','miningDebris','warp','devMap'],default='crowdedCombat')
    parser.add_argument('--seconds',type=float,default=8)
    parser.add_argument('--held-fire',action='store_true',help='Add sustained real player fire to measure hit checkpoints')
    args=parser.parse_args();OUTPUT.mkdir(parents=True,exist_ok=True)
    source=args.source_root.resolve();saved=args.fixture.read_text(encoding='utf-8')
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
        def do_GET(self):
            relative=self.path.split('?')[0].lstrip('/')
            if relative.endswith(('weapon-rules.js','debris-impacts.js')):
                file=source/relative
                if file.is_file():
                    text=file.read_text(encoding='utf-8')
                    # Baseline-only instrumentation: newer owners count exact tests
                    # themselves. The injected increments cannot change geometry.
                    if relative.endswith('weapon-rules.js') and "'collisionCandidates'" not in text:
                        for token in ['const d=candidate.dimensions,r=candidate.radii;','if(rock.targetable===false)continue;']:
                            text=text.replace(token,token+"if(window.__diagnosticCosts?.record)window.__diagnosticCosts.projectileCandidates++;")
                    if relative.endswith('debris-impacts.js') and 'queryTargets' not in text:
                        text=text.replace('const contact=debrisContact?',"if(window.__diagnosticCosts?.record)window.__diagnosticCosts.debrisCandidates++;const contact=debrisContact?")
                    body=text.encode();self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
            super().do_GET()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(source)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    errors=[]
    try:
        with sync_playwright() as playwright:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=playwright.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            cdp=browser.new_browser_cdp_session();gpu=cdp.send('SystemInfo.getInfo')
            page=browser.new_page(viewport={'width':1280,'height':850})
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.add_init_script('('+review.stability.INSTRUMENT+')();('+review.INSTRUMENT+')();('+combat.INSTRUMENT+')()')
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate(review.INSTALL);page.evaluate(review.stability.INSTALL)
            page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length',timeout=120000)
            # Save owner wrapper only; combat.INSTALL also starts a new game, so
            # extract the instrumentation before its controller-start statement.
            page.evaluate(combat.INSTALL.replace('  startNativeDevGame();',''))
            page.evaluate('()=>{window.__traceBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};}')
            page.evaluate(review.stability.SETUP,{'saved':saved,'mode':args.scenario})
            page.wait_for_timeout(3000)
            page.wait_for_function('()=>!nativeShipEffects.metrics().pending && !vexedFlightAssets.cacheSnapshot().ships.pending && !(nativeShipEffects.metrics().preparation?.pending)',timeout=120000)
            if args.held_fire:
                page.locator('#space').focus()
                page.evaluate('()=>{const s=nativeNpcDev.getState(),p=vexedSolFlight.shipPosition(s),ship=s.civilianTraffic.ships.filter(e=>e.system===s.system&&e.hull>0&&Math.hypot(e.x-p.x,e.y-p.y)<500).sort((a,b)=>b.hull-a.hull)[0];if(!ship)throw Error("No valid sustained-fire target");nativeCivilianTraffic.select(ship.id);}')
            page.evaluate(DIAGNOSTICS)
            page_cdp=page.context.new_cdp_session(page);page_cdp.send('Profiler.enable');page_cdp.send('Profiler.setSamplingInterval',{'interval':1000});page_cdp.send('Performance.enable')
            metrics_before=page_cdp.send('Performance.getMetrics')
            completion=[];cdp.on('Tracing.tracingComplete',lambda event:completion.append(event))
            cdp.send('Tracing.start',{'transferMode':'ReturnAsStream','traceConfig':{'recordMode':'recordContinuously','includedCategories':['devtools.timeline','v8','blink','blink.user_timing','cc','gpu','viz','benchmark','latencyInfo','disabled-by-default-devtools.timeline','disabled-by-default-devtools.timeline.frame','disabled-by-default-v8.gc']}})
            page_cdp.send('Profiler.start')
            before=page.evaluate('()=>{__diagnosticCosts.record=true;__combatPerf.record=true;__stability.frames=[];__stability.record=true;performance.mark("vexed-measure-start");window.nativeSimulation={...nativeSimulation,blocked:window.__traceBlocked};return {simulation:nativeSimulation.seconds(nativeNpcDev.getState()),counters:__reviewCounters()};}')
            if args.held_fire:page.keyboard.down('Space')
            page.wait_for_timeout(args.seconds*1000)
            after=page.evaluate('()=>{performance.mark("vexed-measure-end");window.nativeSimulation={...nativeSimulation,blocked:()=>true};__diagnosticCosts.record=false;__combatPerf.record=false;__stability.record=false;return {simulation:nativeSimulation.seconds(nativeNpcDev.getState()),costs:__diagnosticCosts,counters:__reviewCounters(),frames:__stability.frames,saves:__combatPerf.saves,playerHits:__combatPerf.hits.length};}')
            work={}
            for frame in after['frames']:
                for name,count in frame.get('frameBudget',{}).get('counters',{}).items():
                    work[name]=work.get(name,0)+count
            after['simulationWork']=work
            after['physicsSubsteps']=sum(frame.get('frameBudget',{}).get('steps',0) for frame in after['frames'])
            after['population']=page.evaluate('()=>{const s=nativeNpcDev.getState();return {total:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,survivingCivilians:s.civilianTraffic.ships.filter(e=>e.hull>0).length,activeCombatants:s.civilianTraffic.ships.filter(e=>e.hull>0&&(e.disputeId||e.retaliationId)).length};}')
            # Current owners count their actual narrow-phase tests. The frozen
            # baseline lacks those counters and uses the diagnostic-only source
            # injection above. Both count immediately before exact geometry.
            for name in ['projectileCandidates','debrisCandidates']:
                if name in work:after['costs'][name]=work[name]
            if args.held_fire:page.keyboard.up('Space')
            profile=page_cdp.send('Profiler.stop')['profile'];metrics_after=page_cdp.send('Performance.getMetrics');cdp.send('Tracing.end')
            deadline=time.monotonic()+30
            while not completion and time.monotonic()<deadline:page.wait_for_timeout(100)
            assert completion,'Tracing did not complete'
            stream=completion[0]['stream'];parts=[]
            while True:
                part=cdp.send('IO.read',{'handle':stream});parts.append(part['data'])
                if part['eof']:break
            cdp.send('IO.close',{'handle':stream});trace=''.join(parts)
            (OUTPUT/f'{args.label}-{args.scenario}-trace.json').write_text(trace,encoding='utf-8')
            (OUTPUT/f'{args.label}-{args.scenario}.cpuprofile').write_text(json.dumps(profile),encoding='utf-8')
            events=json.loads(trace)['traceEvents'];names={}
            for event in events:
                if event.get('ph') not in ['X','I','i']:continue
                name=event.get('name','');row=names.setdefault(name,{'count':0,'inclusiveMs':0,'maxMs':0,'threads':set()});row['count']+=1;duration=event.get('dur',0)/1000;row['inclusiveMs']+=duration;row['maxMs']=max(row['maxMs'],duration);row['threads'].add((event['pid'],event['tid']))
            names={name:{**row,'threads':sorted(row['threads'])} for name,row in names.items()}
            report={'label':args.label,'sourceRoot':str(source),'browser':browser.version,'graphics':gpu,'fixtureSha256':hashlib.sha256(args.fixture.read_bytes()).hexdigest(),'requestedSeconds':args.seconds,'scenario':args.scenario,'before':before,'after':after,'performanceBefore':metrics_before,'performanceAfter':metrics_after,'traceEventNames':names,'errors':errors,'notes':['Heavy trace/source counters/CPU profiler/save timings are diagnostic only. Inclusive event durations overlap: never sum parent and child events or all threads as frame time. Compositor/presentation events include browser work outside game JS.']}
            (OUTPUT/f'{args.label}-{args.scenario}-diagnostic.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            page.screenshot(path=str(OUTPUT/f'{args.label}-{args.scenario}-diagnostic.png'));browser.close();assert not errors,errors
            print(json.dumps({'label':args.label,'scenario':args.scenario,'costs':after['costs'],'saves':len(after['saves']),'traceEvents':len(events)}),flush=True)
    finally:server.shutdown()

if __name__=='__main__':main()
