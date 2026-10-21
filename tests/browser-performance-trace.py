"""Untimed diagnostic companion to browser-performance-review.py.

CDP tracing and source-level candidate counters are deliberately excluded from
clean frame-delivery runs. Raw traces/profiles stay under ignored test-results.
Optional --headed matches the visible review's fixed1200x650/DPR1 protocol;
the default remains the separate headless1280x850 diagnostic.
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
  const p=window.__diagnosticCosts={record:false,weaponCandidates:0,beamCandidates:null,projectileCandidates:null,debrisCandidates:0,fragmentSteps:0,shotAdvances:0,descriptions:0,stats:0,sceneRequests:0,sceneBuilds:null,shipSpatialBuilds:null,shipCollections:null,drawImageCalls:0,submittedImagePixels:0};
  // Diagnostic submission area only: clipping, transforms, filters, native
  // raster tiles and actual GPU fragment work are recorded separately by CDP.
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(...args){if(p.record){p.drawImageCalls++;const image=args[0],width=args.length===9?args[7]:args.length===5?args[3]:image.width,height=args.length===9?args[8]:args.length===5?args[4]:image.height;p.submittedImagePixels+=Math.abs((Number(width)||0)*(Number(height)||0));}return draw.apply(this,args);};
  for(const [name,method,counter] of [['nativeShipDefinitions','describe','descriptions'],['nativeShipDefinitions','forEntity','stats'],['nativeShipSystems','scene','sceneRequests'],['nativeEnvironmentalImpacts','debris','fragmentSteps'],['nativeCombatShots','advance','shotAdvances']]){
    const api=window[name],fn=api[method];window[name]={...api,[method](...args){if(p.record)p[counter]++;return fn(...args);}};
  }
}"""

def inject_ship_builders(original):
    """Count actual cache-miss builders without changing either checkout.

    Current shipRecord builds the persistent ship collection and grid together.
    The old spatial(record) helper remains in that source but is not its owner.
    """
    persistent='function shipRecord(state,system)' in original
    scene='const ships=collectShips(state,system),rocks=asteroidTargets(state,system),targets=[...ships,...rocks];'
    completed="record.building=false;window.nativeSimulationFrame?.count(state,'shipSpatialBuilds');"
    spatial='if(!record.space){record.space={grid:new Map(),entries:new Map(),overflow:new Set(),maxVelocity:0};'
    collection="const targets=[];\n    for(const [category,adapter] of kinds)if(category!=='asteroid')"
    specifications={
        'sceneBuilds':(scene,'scene cache miss','before'),
        'shipSpatialBuilds':(completed if persistent else spatial,'persistent shipRecord build completion' if persistent else 'spatial cache-miss grid allocation','before' if persistent else 'inside'),
        'shipCollections':(completed if persistent else collection,'persistent shipRecord build completion' if persistent else 'collectShips cache-miss collection','before'),
    }
    patched=original;metadata={}
    for counter,(marker,owner,position) in specifications.items():
        matches=original.count(marker)
        assert matches<=1,f'Ambiguous actual-builder marker for {counter}: {matches} matches'
        item={'available':matches==1,'matches':matches,'owner':owner,'marker':marker,
              'markerSha256':hashlib.sha256(marker.encode()).hexdigest()}
        if matches==1:
            increment=f'if(window.__diagnosticCosts?.record)window.__diagnosticCosts.{counter}++;'
            replacement=marker.replace('if(!record.space){','if(!record.space){'+increment,1) if position=='inside' else increment+marker
            patched=patched.replace(marker,replacement,1)
        else:item['reason']='Exact executed-builder marker is absent; the value remains unavailable, not zero.'
        metadata[counter]=item
    return patched,metadata


def finish_headed_conditions(conditions,owner,headed):
    """Use the clean headed companion's event/window metadata, outside tracing."""
    if conditions.get('captured'):return
    conditions['captured']=True
    for page in owner.created:
        try:
            if not page._page.is_closed():page.capture()
        except Exception as error:
            conditions.setdefault('captureErrors',[]).append(str(error))
    conditions['pages']=owner.pages
    conditions['viewportExceedsOuterWindow']=[row['page'] for row in owner.pages if row.get('window') and
        (row['window']['innerWidth']>row['window']['outerWidth'] or row['window']['innerHeight']>row['window']['outerHeight'])]
    conditions['measuredFocusOrVisibilityInterruptions']=[{'page':row['page'],'mode':row.get('mode'),'event':event}
        for row in owner.pages for event in row.get('events',[])
        if event['measured'] and (not event['focused'] or event['visible']!='visible')]
    conditions['windowsDisplayModesAfter']=headed.display_modes()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,default=ROOT)
    parser.add_argument('--label',required=True)
    parser.add_argument('--fixture',type=Path,default=OUTPUT/'initial-save.json')
    parser.add_argument('--scenario',choices=['flight','crowdedFlight','crowdedCombat','miningDebris','warp','devMap'],default='crowdedCombat')
    parser.add_argument('--seconds',type=float,default=8)
    parser.add_argument('--seed',type=int,default=4292026)
    parser.add_argument('--held-fire',action='store_true',help='Add sustained real player fire to measure hit checkpoints')
    parser.add_argument('--headed',action='store_true',help='Visible maximized Edge at1200x650/DPR1, matching the fixed-viewport headed review; heavy diagnostic only')
    args=parser.parse_args();OUTPUT.mkdir(parents=True,exist_ok=True)
    source=args.source_root.resolve();saved=args.fixture.read_text(encoding='utf-8')
    source_hashes={str(path.relative_to(source)).replace('\\','/'):hashlib.sha256(path.read_bytes()).hexdigest()
        for folder in ['html-games/broken-mirror-port','html-games/flashtrek-broken-mirror'] for path in sorted([*(source/folder).glob('*.js'),*(source/folder).glob('*.html')])}
    harness_hashes={name:hashlib.sha256((ROOT/'tests'/name).read_bytes()).hexdigest()
        for name in ['browser-performance-trace.py','browser-performance-review.py','browser-stability.py','browser-combat-performance.py']}
    headed=owner=conditions=None
    viewport={'width':1200,'height':650} if args.headed else {'width':1280,'height':850}
    if args.headed:
        headed=module('headed_trace_conditions','browser-performance-headed.py')
        harness_hashes['browser-performance-headed.py']=hashlib.sha256((ROOT/'tests/browser-performance-headed.py').read_bytes()).hexdigest()
        owner=argparse.Namespace(fullscreen=False,position=None,pages=[],created=[])
        conditions={'protocol':'headed-fixed-viewport-heavy-trace','headless':False,'fullscreenRequested':False,
            'requestedViewport':viewport,'requestedDpr':1,'windowsDisplayModesBefore':headed.display_modes(),
            'notes':['The fixed viewport, maximized temporary window and event metadata reuse browser-performance-headed.py.',
                'CDP trace/CPU sampling/source counters are heavy diagnostics; do not pool their frame intervals with clean review windows.',
                'Configured monitor refresh and RAF callbacks do not establish physical scanout. Analyze compositor/presentation events by process/thread and the measured marks.',
                'No OS registry, refresh, power, GPU or global browser setting is changed.']}
    builder_path='html-games/broken-mirror-port/ship-systems.js'
    builder_original=(source/builder_path).read_text(encoding='utf-8')
    builder_source,builder_metadata=inject_ship_builders(builder_original)
    source_injections={builder_path:{'originalSha256':source_hashes[builder_path],
        'normalizedSourceSha256':hashlib.sha256(builder_original.encode()).hexdigest(),
        'injectedSha256':hashlib.sha256(builder_source.encode()).hexdigest(),'counters':builder_metadata}}
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
        def do_GET(self):
            try:self._serve_get()
            except (ConnectionResetError,BrokenPipeError):pass # A closed diagnostic page can cancel an unrelated image transfer.
        def _serve_get(self):
            relative=self.path.split('?')[0].lstrip('/')
            if relative==builder_path:
                body=builder_source.encode();self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
            if relative.endswith(('weapon-rules.js','debris-impacts.js')):
                file=source/relative
                if file.is_file():
                    text=file.read_text(encoding='utf-8')
                    # Baseline-only instrumentation: newer owners count exact tests
                    # themselves. The injected increments cannot change geometry.
                    if relative.endswith('weapon-rules.js') and "'collisionCandidates'" not in text:
                        for token in ['const d=candidate.dimensions,r=candidate.radii;','if(rock.targetable===false)continue;']:
                            text=text.replace(token,token+"if(window.__diagnosticCosts?.record)window.__diagnosticCosts.weaponCandidates++;")
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
            browser=playwright.chromium.launch(headless=not args.headed,**({'channel':channel} if channel else {}))
            if args.headed:browser=headed.BrowserProxy(browser,owner)
            cdp=browser.new_browser_cdp_session();gpu=cdp.send('SystemInfo.getInfo')
            if args.headed:conditions.update(browserVersion=browser.version,graphics=gpu,sourceRoot=str(source),scenario=args.scenario)
            page=browser.new_page(viewport=viewport,device_scale_factor=1) if args.headed else browser.new_page(viewport=viewport)
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.add_init_script('(()=>{let seed;window.__resetFixtureRandom=()=>{seed='+str(args.seed)+'>>>0;window.__fixtureRandomCalls=0;};__resetFixtureRandom();Math.random=()=>{window.__fixtureRandomCalls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};})()')
            # Both diagnostic RAF wrappers inspect callback.name. Stability must
            # be outermost so it sees the actual draw callback rather than the
            # anonymous callback forwarded by the save-cost companion. Its
            # detailed frame records are the sole source of simulation work.
            page.add_init_script('('+combat.INSTRUMENT+')();('+review.stability.INSTRUMENT+')();('+review.INSTRUMENT+')()')
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate(review.INSTALL);page.evaluate(review.stability.INSTALL)
            page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length',timeout=120000)
            # Save owner wrapper only; combat.INSTALL also starts a new game, so
            # extract the instrumentation before its controller-start statement.
            page.evaluate(combat.INSTALL.replace('  startNativeDevGame();',''))
            page.evaluate('()=>{window.__traceBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();}')
            page.evaluate('__resetFixtureRandom()')
            page.evaluate(review.stability.SETUP,{'saved':saved,'mode':'flight' if args.scenario=='crowdedFlight' else args.scenario})
            page.evaluate('()=>{for(const timer of window.__stabilityTimers||[])clearInterval(timer);window.__stabilityTimers=[];}')
            page.evaluate('(mode)=>{window.__reviewMode=mode;}',args.scenario)
            if args.scenario=='crowdedFlight':page.evaluate('()=>{const s=nativeNpcDev.getState(),origin=vexedSolFlight.shipPosition(s);nativeShipMotion.stop(s);s.civilianTraffic.ships.filter(e=>e.hull>0).slice(0,12).forEach((ship,index)=>{nativeNpcLives.interrupt(s,ship,"rendering stress fixture");ship.scriptedDemo="benchmark";const angle=index*Math.PI/6,radius=180+(index%3)*35;Object.assign(ship,{system:s.system,x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius,phase:"docked",timer:1e6,heading:angle+Math.PI,speed:0});nativeNpcLives.refreshLocation(s,ship);});nativeShipSystems.invalidate(s);}')
            page.wait_for_timeout(3000)
            page.wait_for_function('()=>!nativeShipEffects.metrics().pending && !vexedFlightAssets.cacheSnapshot().ships.pending && !(nativeShipEffects.metrics().preparation?.pending)',timeout=120000)
            if args.scenario!='devMap' or args.held_fire:page.locator('#space').focus()
            if args.scenario in ['flight','crowdedFlight']:page.evaluate(review.SCRIPTED_INPUT)
            if args.scenario=='miningDebris':page.evaluate(review.DEBRIS_INPUT)
            page.evaluate('__resetFixtureRandom()')
            if args.held_fire:
                page.evaluate('()=>{const s=nativeNpcDev.getState(),p=vexedSolFlight.shipPosition(s),ship=s.civilianTraffic.ships.filter(e=>e.system===s.system&&e.hull>0&&Math.hypot(e.x-p.x,e.y-p.y)<500).sort((a,b)=>b.hull-a.hull)[0];if(!ship)throw Error("No valid sustained-fire target");nativeCivilianTraffic.select(ship.id);}')
            page.evaluate(DIAGNOSTICS)
            page.evaluate('(metadata)=>{const p=__diagnosticCosts;p.builderAvailability=metadata;for(const [name,item] of Object.entries(metadata))p[name]=item.available?0:null;}',builder_metadata)
            if args.headed:
                conditions['beforeMeasurement']=page.evaluate(headed.PAGE_METADATA)
                conditions['measuredStartVisibleAndFocused']=conditions['beforeMeasurement']['visibility']=='visible' and conditions['beforeMeasurement']['focused']
            page_cdp=page.context.new_cdp_session(page._page if args.headed else page);page_cdp.send('Profiler.enable');page_cdp.send('Profiler.setSamplingInterval',{'interval':1000});page_cdp.send('Performance.enable')
            metrics_before=page_cdp.send('Performance.getMetrics')
            completion=[];cdp.on('Tracing.tracingComplete',lambda event:completion.append(event))
            cdp.send('Tracing.start',{'transferMode':'ReturnAsStream','traceConfig':{'recordMode':'recordContinuously','includedCategories':['devtools.timeline','v8','blink','blink.user_timing','cc','gpu','viz','benchmark','latencyInfo','disabled-by-default-devtools.timeline','disabled-by-default-devtools.timeline.frame','disabled-by-default-v8.gc']}})
            page_cdp.send('Profiler.start')
            before=page.evaluate('()=>{__diagnosticCosts.record=true;__combatPerf.record=true;__stability.frames=[];__stability.record=true;__renderReview.inputs=[];performance.mark("vexed-measure-start");window.nativeSimulation={...nativeSimulation,blocked:window.__traceBlocked};window.nativeSimulationHost?.checkpoint();return {simulation:nativeSimulation.seconds(nativeNpcDev.getState()),counters:__reviewCounters()};}')
            if args.held_fire:page.keyboard.down('Space')
            page.wait_for_timeout(args.seconds*1000)
            after=page.evaluate('()=>{performance.mark("vexed-measure-end");window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();__diagnosticCosts.record=false;__combatPerf.record=false;__stability.record=false;return {simulation:nativeSimulation.seconds(nativeNpcDev.getState()),costs:__diagnosticCosts,counters:__reviewCounters(),frames:__stability.frames,saves:__combatPerf.saves,playerHits:__combatPerf.hits.length,inputs:__renderReview.inputs};}')
            after.update(review.frame_work(after['frames'],before['counters'],after['counters']))
            work=after['simulationWork']
            after['builderCounts']={name:{'available':item['available'],'value':after['costs'][name] if item['available'] else None,'owner':item['owner']}
                for name,item in builder_metadata.items()}
            assert len(after['frames'])>=2,'Trace recorder received fewer than two actual draw frames'
            assert after['physicsSubsteps']>0,'Trace recorder captured no physics substeps'
            assert after['simulation']>before['simulation'],'Trace simulation did not advance'
            after['population']=page.evaluate('()=>{const s=nativeNpcDev.getState();return {total:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,survivingCivilians:s.civilianTraffic.ships.filter(e=>e.hull>0).length,activeCombatants:s.civilianTraffic.ships.filter(e=>e.hull>0&&(e.disputeId||e.retaliationId)).length};}')
            # Current owners count their actual narrow-phase tests. The frozen
            # baseline lacks those counters and uses the diagnostic-only source
            # injection above. Both count immediately before exact geometry.
            if 'beamCandidates' in work or 'projectileCandidates' in work:
                for name in ['beamCandidates','projectileCandidates']:after['costs'][name]=work.get(name,0)
                after['costs']['weaponCandidates']=after['costs']['beamCandidates']+after['costs']['projectileCandidates']
            if 'debrisCandidates' in work:after['costs']['debrisCandidates']=work['debrisCandidates']
            after['acceptedShots']=after['counters']['acceptedShots']-before['counters']['acceptedShots']
            if args.scenario=='crowdedCombat':
                assert after['acceptedShots']>0,'Combat trace accepted no shots'
                assert after['costs']['weaponCandidates']>0,'Combat trace captured no exact weapon collision tests'
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
            report={'label':args.label,'sourceRoot':str(source),'sourceHashes':source_hashes,'sourceInjections':source_injections,'harnessSha256':harness_hashes['browser-performance-trace.py'],'harnessHashes':harness_hashes,'browser':browser.version,'graphics':gpu,'fixtureSha256':hashlib.sha256(args.fixture.read_bytes()).hexdigest(),'requestedSeconds':args.seconds,'scenario':args.scenario,'before':before,'after':after,'performanceBefore':metrics_before,'performanceAfter':metrics_after,'traceEventNames':names,'errors':errors,'notes':['Heavy trace/source counters/CPU profiler/save timings are diagnostic only. Inclusive event durations overlap: never sum parent and child events or all threads as frame time. Compositor/presentation events include browser work outside game JS.','Flight inputs and crowded-flight placement match browser-performance-review.py; other fixtures use its shared stability setup. Source hashes describe original served files before diagnostic-only source injection; sourceInjections records builder markers, availability and normalized/injected hashes.','weaponCandidates counts exact collision tests for beams plus flying projectiles on both revisions. Baseline beam/projectile splits are unavailable (null); current simulationWork preserves separate categories.','sceneRequests counts exported API requests, including cache hits; internal closure calls are not wrapped. builderCounts instead counts executed cache-miss scene/collection/grid builders on each revision. Persistent current shipRecord constructs its collection and spatial grid together. Unmatched builder markers retain null/unavailable; absence of an unsupported clean simulationWork counter must not be interpreted as zero.']}
            report.update(headless=not args.headed,viewport=viewport,dpr=1,randomSeed=args.seed)
            if args.headed:
                finish_headed_conditions(conditions,owner,headed)
                report['headedConditions']=conditions
                report['notes'].append('Visible fixed-viewport trace matches1200x650/DPR1 headed geometry. Heavy trace counts are not clean FPS or a physical presentation guarantee; review focus/window conditions and measured per-thread presentation events.')
            (OUTPUT/f'{args.label}-{args.scenario}-diagnostic.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            page.screenshot(path=str(OUTPUT/f'{args.label}-{args.scenario}-diagnostic.png'));browser.close();assert not errors,errors
            print(json.dumps({'label':args.label,'scenario':args.scenario,'costs':after['costs'],'saves':len(after['saves']),'traceEvents':len(events)}),flush=True)
    except BaseException as error:
        if conditions is not None:conditions['failure']=repr(error)
        raise
    finally:
        if conditions is not None:
            finish_headed_conditions(conditions,owner,headed)
            (OUTPUT/f'{args.label}-{args.scenario}-trace-headed-conditions.json').write_text(json.dumps(conditions,indent=2),encoding='utf-8')
        server.shutdown()

if __name__=='__main__':main()
