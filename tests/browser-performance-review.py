"""Same-save rendering review measurements; cold appearance and warm gameplay stay separate.

Serve an immutable checkout with --source-root. Reuse --fixture across revisions.
No portable timing thresholds are asserted. Run timing commands sequentially.
"""
import argparse
import functools
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import platform
import subprocess
import threading
import time

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/performance-review'
spec=importlib.util.spec_from_file_location('review_stability',ROOT/'tests/browser-stability.py')
stability=importlib.util.module_from_spec(spec);spec.loader.exec_module(stability)

INSTRUMENT=r"""() => {
  const p=window.__renderReview={canvasAllocations:0,offscreenAllocations:0,effectDraws:0,paints:0,phases:[],images:[],collectCold:false,inputs:[],cold:null};
  const element=Document.prototype.createElement;
  Document.prototype.createElement=function(name,...args){if(String(name).toLowerCase()==='canvas')p.canvasAllocations++;return element.call(this,name,...args);};
  if(window.OffscreenCanvas){const Native=window.OffscreenCanvas;window.OffscreenCanvas=new Proxy(Native,{construct(target,args){p.offscreenAllocations++;return Reflect.construct(target,args);}});}
  const NativeImage=window.Image,decode=HTMLImageElement.prototype.decode,starts=new WeakMap();
  window.Image=new Proxy(NativeImage,{construct(target,args){const image=Reflect.construct(target,args);starts.set(image,performance.now());
    image.addEventListener('load',()=>{if(p.collectCold&&image.src.includes('/showcase-assets/'))p.images.push({url:image.src,start:starts.get(image),loaded:performance.now(),loadMs:performance.now()-starts.get(image)});});return image;}});
  HTMLImageElement.prototype.decode=function(...args){const start=performance.now(),image=this;return decode.apply(this,args).then(value=>{
    if(p.collectCold&&image.src.includes('/showcase-assets/'))p.phases.push({kind:'decodePromise',url:image.src,start,end:performance.now(),ms:performance.now()-start});return value;});};
}"""

INSTALL=r"""() => {
  const p=__renderReview,definitions=nativeShipDefinitions,profiles=new WeakMap(),stages=new WeakMap();
  const timed=(fn,kind,type)=>(...args)=>{const start=performance.now(),stage=Number.isInteger(args[1])?args[1]:stages.get(args[0]),cold=p.collectCold;
    const done=value=>{if(Number.isInteger(stage)&&value&&typeof value==='object')stages.set(value,stage);
      if(cold)p.phases.push({kind,type,stage,start,end:performance.now(),ms:performance.now()-start});return value;};
    const value=fn(...args);return value?.then?value.then(done):done(value);};
  window.nativeShipDefinitions={...definitions,artworkProfile(type){const profile=definitions.artworkProfile(type);if(!profile)return profile;
    if(!profiles.has(profile)){const effects={...profile.effects},clone={...profile,effects};
      for(const name of ['align','alignAsync'])if(profile[name])clone[name]=timed(profile[name].bind(profile),'alignment',type);
      for(const name of ['prepareFrame','prepareFrameAsync','unlitFrame','unlitFrameAsync'])if(effects[name])effects[name]=timed(effects[name].bind(profile.effects),name.startsWith('unlit')?'unlighting':'effectPreparation',type);
      if(effects.draw){const draw=effects.draw;effects.draw=function(...args){p.effectDraws++;return draw.apply(this,args);};}profiles.set(profile,clone);
    }return profiles.get(profile);}};
  const paint=nativeShipEffects.paintShip;
  window.nativeShipEffects={...nativeShipEffects,paintShip:function(ctx,descriptor,...args){const result=paint(ctx,descriptor,...args);if(result?.art){p.paints++;
    if(p.cold&&p.cold.entity.id===descriptor.entity?.id&&result.type===p.cold.type){const at=performance.now();p.cold.observed={type:result.type,stage:result.damageStage,started:p.cold.started,at};p.cold.firstVisibleMs??=at-p.cold.started;
      if(result.damageStage===p.cold.stage)p.cold.firstCorrectStageMs??=at-p.cold.started;}}
    return result;}};
  const fire=nativeCombatShots.fireFor;
  window.nativeCombatShots={...nativeCombatShots,fireFor:function(...args){const result=fire(...args);if(result?.ok)p.acceptedShots=(p.acceptedShots||0)+1;return result;}};
  window.__reviewCounters=()=>({canvasAllocations:p.canvasAllocations,offscreenAllocations:p.offscreenAllocations,effectDraws:p.effectDraws,paints:p.paints,acceptedShots:p.acceptedShots||0,
    simulationSeconds:nativeSimulation.seconds(nativeNpcDev.getState()),debris:nativeAsteroidCombat.metrics(),shipParticles:nativeShipEffects.snapshot().particles,asteroids:nativeSolAsteroids.metrics?.(),
    sprite:nativeShipSpriteCache.snapshot(),effects:nativeShipEffects.metrics(),loader:vexedFlightAssets.cacheSnapshot?.(),queue:window.nativeDamageArtPreparation?.snapshot?.()});
}"""

SCRIPTED_INPUT=r"""() => {
  const p=__renderReview,advance=p.originalAdvance||nativeCivilianTraffic.advance,start=nativeSimulation.seconds(nativeNpcDev.getState());p.originalAdvance=advance;
  let previous='';nativeCivilianTraffic.advance=function(state,dt){
    const elapsed=nativeSimulation.seconds(state)-start,phase=elapsed%10;
    const desired=window.__reviewMode==='crowdedFlight'?(phase<2?'KeyD':phase<4?'KeyA':phase<4.25?'KeyW':phase<6?'ArrowDown':phase<8?'KeyD':'KeyA'):
      phase<2?'KeyW':phase<4?'KeyD':phase<6?'KeyW':phase<8?'KeyA':'';
    if(desired!==previous){if(previous)document.dispatchEvent(new KeyboardEvent('keyup',{code:previous,bubbles:true}));
      if(desired)document.dispatchEvent(new KeyboardEvent('keydown',{code:desired,bubbles:true}));p.inputs.push({at:elapsed,code:desired});previous=desired;}
    return advance(state,dt);
  };
}"""

COLD_SETUP=r"""({type,stage}) => {
  const s=nativeNpcDev.getState(),ship=s.civilianTraffic.ships.find(e=>e.hull>0),definition=nativeShipDefinitions.get(type,'civilian');
  nativeShipMotion.stop(s);delete s.localCruise;delete s.arrivalApproach;
  nativeNpcLives.interrupt(s,ship,'cold appearance measurement');
  for(const key of ['localLeg','journey','motionKick','motionSpin','dockingMove','warpVisual'])delete ship[key];
  const origin=vexedSolFlight.shipPosition(s);Object.assign(ship,{shipType:type,system:s.system,x:origin.x+120,y:origin.y-80,heading:.7,
    hull:definition.hull*[1,.7,.4,.1][stage],shields:definition.shields,phase:'docked',scriptedDemo:'cold-review',timer:100000,speed:0,vx:0,vy:0});
  nativeShipSystems.invalidate(s);nativeShipEffects.reset();vexedFlightAssets.resetCaches?.();nativeShipSpriteCache.reset();
  const p=__renderReview;p.phases=[];p.images=[];p.collectCold=true;p.cold={entity:ship,type,stage,started:performance.now()};
  __stability.frames=[];__stability.longTasks=[];__stability.record=true;
  return {id:ship.id,type,stage,started:p.cold.started};
}"""

def stat(values):
    return {'mean':sum(values)/len(values) if values else 0,'p50':stability.legacy.percentile(values,.5),
            'p95':stability.legacy.percentile(values,.95),'p99':stability.legacy.percentile(values,.99),'max':max(values,default=0)}

def summarize(frames,seconds):
    intervals=[r['intervalMs'] for r in frames if r['intervalMs']>0]
    return {'frames':len(frames),'actualSeconds':seconds,'averageFps':len(frames)/seconds,
            'frameSpikesOver33ms':sum(v>33 for v in intervals),'frameSpikesOver50ms':sum(v>50 for v in intervals),
            'frameSpikesOver100ms':sum(v>100 for v in intervals),
            **{key:stat([f[key] for f in frames]) for key in ['intervalMs','callbackMs','simulationMs','renderMs']}}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,default=ROOT)
    parser.add_argument('--label',required=True)
    parser.add_argument('--revision-label',default='working tree')
    parser.add_argument('--fixture',type=Path,default=ROOT/'test-results/performance-review/initial-save.json')
    parser.add_argument('--seconds',type=float,default=20)
    parser.add_argument('--runs',type=int,default=3)
    parser.add_argument('--cold-only',action='store_true')
    parser.add_argument('--warm-only',action='store_true')
    parser.add_argument('--cold-types',default='35,49,59')
    parser.add_argument('--scenarios',default='flight,crowdedFlight,crowdedCombat,miningDebris,warp,devMap')
    args=parser.parse_args();OUTPUT.mkdir(parents=True,exist_ok=True)
    source=args.source_root.resolve()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(source)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    errors=[];failed=[]
    report={'label':args.label,'revision':args.revision_label,'sourceRoot':str(source),'viewport':{'width':1280,'height':850},
        'platform':platform.platform(),'secondsPerWindow':args.seconds,'runs':args.runs,'warmupSeconds':3,
        'sourceHashes':{str(p.relative_to(source)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()
            for folder in ['html-games/broken-mirror-port','html-games/flashtrek-broken-mirror'] for p in sorted((source/folder).glob('*.js'))},
        'scenarios':{},'cold':[], 'notes':['Full saved production fleet remains active. Crowd combat uses the existing12-provoked-NPC/high-player-health stress fixture. Inputs repeat by authoritative simulation time. No other benchmark/test workers should run concurrently; OS activity is uncontrolled.',
        'Canvas counts include main-document HTML and OffscreenCanvas construction, not browser internals or worker-private surfaces. Phase durations are wall times and can overlap; decode() timing is not total browser decoder CPU.',
        'Warmup loads artwork with simulation time frozen; animated phase caches start cold. spriteRebuilds is the complete animated-effect count; profile effectDraws can omit artwork loaded before instrumentation.']}
    try:
        with sync_playwright() as playwright:
            channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=playwright.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            report.update(browserVersion=browser.version,channel=channel)
            session=browser.new_browser_cdp_session()
            report['graphics']=session.send('SystemInfo.getInfo')
            def page_open(warm=True):
                page=browser.new_page(viewport=report['viewport']);page.on('pageerror',lambda e:errors.append(str(e)))
                page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
                page.add_init_script('('+stability.INSTRUMENT+')();('+INSTRUMENT+')()')
                page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
                page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
                page.evaluate(INSTALL);page.evaluate(stability.INSTALL)
                page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length',timeout=120000)
                if warm:
                    page.wait_for_function('()=>nativeCivilianTraffic.effectsReady() && !nativeShipEffects.metrics().pending',timeout=120000)
                return page
            page=page_open();report['device']=page.evaluate('({hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,devicePixelRatio:devicePixelRatio,userAgent:navigator.userAgent})')
            if not args.fixture.exists():
                args.fixture.parent.mkdir(parents=True,exist_ok=True);args.fixture.write_text(page.evaluate('JSON.stringify(nativeNpcDev.getState())'),encoding='utf-8')
            saved=args.fixture.read_text(encoding='utf-8');report['initialSaveSha256']=hashlib.sha256(args.fixture.read_bytes()).hexdigest()
            initial=json.loads(saved);report['population']=len(initial['civilianTraffic']['ships'])+len(initial['solEconomy']['freighters'])+1;page.close()
            if not args.warm_only:
                for ship_type in map(int,args.cold_types.split(',')):
                    for stage in [0,2]:
                        page=page_open(warm=False)
                        page.evaluate('()=>{window.__reviewBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};}')
                        population=page.evaluate(stability.SETUP,{'saved':saved,'mode':'flight'});assert population['population']==report['population']
                        page.evaluate(COLD_SETUP,{'type':ship_type,'stage':stage})
                        page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:window.__reviewBlocked};}')
                        try:page.wait_for_function('()=>__renderReview.cold.firstCorrectStageMs!==undefined',timeout=30000)
                        except Exception:
                            debug=page.evaluate('()=>({cold:{type:__renderReview.cold.type,stage:__renderReview.cold.stage,started:__renderReview.cold.started,firstVisibleMs:__renderReview.cold.firstVisibleMs,observed:__renderReview.cold.observed,position:{x:__renderReview.cold.entity.x,y:__renderReview.cold.entity.y},player:vexedSolFlight.shipPosition(nativeNpcDev.getState())},paints:__renderReview.paints,phases:__renderReview.phases,effects:nativeShipEffects.metrics(),errors:window.__reviewErrors})')
                            (OUTPUT/f'{args.label}-cold-failure.json').write_text(json.dumps(debug,indent=2),encoding='utf-8');raise
                        page.wait_for_timeout(2500)
                        row=page.evaluate('()=>{__stability.record=false;__renderReview.collectCold=false;const p=__renderReview;return {type:p.cold.type,stage:p.cold.stage,measurementMs:performance.now()-p.cold.started,firstVisibleMs:p.cold.firstVisibleMs,firstCorrectStageMs:p.cold.firstCorrectStageMs,phases:p.phases,images:p.images,frames:__stability.frames,longTasks:__stability.longTasks,counters:__reviewCounters()};}')
                        frames=row.pop('frames');row['frameStatistics']=summarize(frames,row['measurementMs']/1000)
                        report['cold'].append(row);(OUTPUT/f'{args.label}-cold-{ship_type}-{stage}-frames.json').write_text(json.dumps(frames),encoding='utf-8')
                        page.screenshot(path=str(OUTPUT/f'{args.label}-cold-{ship_type}-{stage}.png'));page.close()
                        print(json.dumps({'cold':ship_type,'stage':stage,'visibleMs':row['firstVisibleMs'],'correctStageMs':row['firstCorrectStageMs'],'p95':row['frameStatistics']['intervalMs']['p95']}),flush=True)
            if not args.cold_only:
                for mode in args.scenarios.split(','):
                    report['scenarios'][mode]=[]
                    mode_saved=saved
                    descriptions={
                        'flight':'Production 172-ship save with ordinary flight inputs.',
                        'crowdedFlight':'Twelve existing ships placed around the player without provocation; all other civilian lives retained.',
                        'crowdedCombat':'Twelve existing ships provoked with ordinary NPC statistics; high-health player stress fixture; all other civilian lives retained.',
                        'miningDebris':'Existing mining demo plus nearby asteroid destruction every 1.8 wall seconds; all civilian lives retained.',
                        'warp':'Existing repeated warp visual fixture with ordinary civilian simulation.',
                        'devMap':'Dev map with ordinary civilian simulation and inspection.'}
                    report.setdefault('scenarioFixtures',{})[mode]={'sourceSha256':hashlib.sha256(mode_saved.encode()).hexdigest(),
                        'description':descriptions[mode]}
                    for run in range(args.runs):
                        page=page_open()
                        page.evaluate('()=>{window.__reviewBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};}')
                        population=page.evaluate(stability.SETUP,{'saved':mode_saved,'mode':'flight' if mode=='crowdedFlight' else mode});assert population['population']==report['population']
                        page.evaluate('(mode)=>{window.__reviewMode=mode;}',mode)
                        if mode=='crowdedFlight':page.evaluate('()=>{const s=nativeNpcDev.getState(),origin=vexedSolFlight.shipPosition(s);nativeShipMotion.stop(s);s.civilianTraffic.ships.filter(e=>e.hull>0).slice(0,12).forEach((ship,index)=>{nativeNpcLives.interrupt(s,ship,"rendering stress fixture");ship.scriptedDemo="benchmark";const angle=index*Math.PI/6,radius=180+(index%3)*35;Object.assign(ship,{system:s.system,x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius,phase:"docked",timer:1e6,heading:angle+Math.PI,speed:0});nativeNpcLives.refreshLocation(s,ship);});nativeShipSystems.invalidate(s);}')
                        page.wait_for_timeout(3000)
                        page.wait_for_function('()=>!nativeShipEffects.metrics().pending && !vexedFlightAssets.cacheSnapshot().ships.pending && !(nativeShipEffects.metrics().preparation?.pending)',timeout=120000)
                        if mode!='devMap':page.locator('#space').focus()
                        if mode in ['flight','crowdedFlight']:page.evaluate(SCRIPTED_INPUT)
                        before=page.evaluate('__reviewCounters()');page.evaluate('()=>{__stability.frames=[];__stability.longTasks=[];__stability.record=true;__renderReview.inputs=[];__renderReview.measureStarted=performance.now();window.nativeSimulation={...nativeSimulation,blocked:window.__reviewBlocked};}')
                        start=time.perf_counter();page.wait_for_timeout(args.seconds*1000);seconds=time.perf_counter()-start
                        sample=page.evaluate('()=>{__stability.record=false;const s=nativeNpcDev.getState();return {measurementMs:performance.now()-__renderReview.measureStarted,frames:__stability.frames,longTasks:__stability.longTasks,after:__reviewCounters(),inputs:__renderReview.inputs,state:{simulationSeconds:nativeSimulation.seconds(s),population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,activeCombatants:s.civilianTraffic.ships.filter(e=>e.hull>0&&(e.disputeId||e.retaliationId)).length,survivingShips:s.civilianTraffic.ships.filter(e=>e.hull>0).length,player:{x:s.x,y:s.y,angle:s.angle,speed:s.speed,hull:s.hull},metrics:nativeSimulationMetrics.snapshot(),liveShots:s.weaponCombat?.events?.filter(e=>e.alive&&!e.resolved).length||0}};}')
                        frames=sample.pop('frames');seconds=sample['measurementMs']/1000;assert sample['state']['population']==report['population']
                        counters={key:sample['after'][key]-before[key] for key in ['canvasAllocations','offscreenAllocations','effectDraws','paints','acceptedShots']}
                        counters['sprite']={key:value-before['sprite']['counters'].get(key,0) for key,value in sample['after']['sprite']['counters'].items()}
                        counters['physicsSubsteps']=sum(f.get('frameBudget',{}).get('steps',0) for f in frames)
                        counters['simulationProgressSeconds']=sample['after']['simulationSeconds']-before['simulationSeconds']
                        if 'indexBuilds' in (sample['after'].get('asteroids') or {}):
                            counters['asteroidIndexBuilds']=sample['after']['asteroids']['indexBuilds']-before['asteroids']['indexBuilds']
                        counters['asteroidSpatialWork']={key:sample['after']['asteroids'][key]-before['asteroids'][key]
                            for key in ['broadphaseQueries','broadphaseVisits','summaryVisits'] if key in (sample['after'].get('asteroids') or {})}
                        counters['simulationWork']={}
                        for frame in frames:
                            for key,value in frame.get('frameBudget',{}).get('counters',{}).items():
                                counters['simulationWork'][key]=counters['simulationWork'].get(key,0)+value
                        row={'run':run+1,**summarize(frames,seconds),'counters':counters,'before':before,**sample};report['scenarios'][mode].append(row)
                        (OUTPUT/f'{args.label}-{mode}-{run+1}-frames.json').write_text(json.dumps(frames),encoding='utf-8')
                        if run==0:page.screenshot(path=str(OUTPUT/f'{args.label}-{mode}.png'))
                        print(json.dumps({'mode':mode,'run':run+1,'fps':row['averageFps'],'p95':row['intervalMs']['p95'],'over50':row['frameSpikesOver50ms'],'counters':counters}),flush=True)
                        page.close()
            browser.close()
        report.update(passed=not errors and not failed,javascriptErrors=errors,failedRequests=failed)
        (OUTPUT/f'{args.label}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        assert not errors,errors;assert not failed,failed
    finally:server.shutdown()

if __name__=='__main__':main()
