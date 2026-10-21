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

from playwright.sync_api import sync_playwright, Error as PlaywrightError

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/performance-review'
spec=importlib.util.spec_from_file_location('review_stability',ROOT/'tests/browser-stability.py')
stability=importlib.util.module_from_spec(spec);spec.loader.exec_module(stability)

INSTRUMENT=r"""() => {
  const p=window.__renderReview={canvasAllocations:0,offscreenAllocations:0,effectDraws:0,paints:0,physicalDebrisAdmissions:0,environmentalDebrisCalls:0,physicalDebrisSeen:new WeakSet(),phases:[],images:[],collectCold:false,inputs:[],cold:null};
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
  const environmental=nativeEnvironmentalImpacts,debris=environmental.debris;
  window.__reviewResetDebris=()=>{p.physicalDebrisSeen=new WeakSet();p.physicalDebrisAdmissions=0;p.environmentalDebrisCalls=0;};
  window.__reviewResetDebris();
  window.nativeEnvironmentalImpacts={...environmental,debris:function(state,piece,oldX,oldY,options){
    if(window.__stability?.record){p.environmentalDebrisCalls++;
      if(piece&&typeof piece==='object'&&!p.physicalDebrisSeen.has(piece)){p.physicalDebrisSeen.add(piece);p.physicalDebrisAdmissions++;}}
    return debris.call(environmental,state,piece,oldX,oldY,options);
  }};
  window.__reviewLife=()=>{const s=nativeNpcDev.getState(),ships=s.civilianTraffic.ships,at=nativeSimulation.seconds(s),metrics=nativeNpcLives.metrics?.(s)||{},jobs={};
    for(const ship of ships){const phase=ship.task?.phase||ship.phase;jobs[phase]=(jobs[phase]||0)+1;}
    return {activeJobs:ships.filter(ship=>ship.task?.status==='active'&&!['idle','selecting','payment-idle'].includes(ship.task.phase)).length,
      mobileShips:nativeNpcLives.mobile?nativeNpcLives.mobile(s).length:ships.filter(ship=>!ship.journey&&!!(ship.localLeg||ship.motionKick||ship.motionSpin||ship.speed>0)).length,
      transitShips:nativeNpcLives.transits?nativeNpcLives.transits(s).length:ships.filter(ship=>!!ship.journey).length,
      overdueSavedActions:ships.filter(ship=>Number.isFinite(ship.nextActionAt)&&ship.nextActionAt<=at).length,
      scheduledEventsTotal:metrics.totalEvents||0,pendingEvents:metrics.pendingEvents||0,eventBacklog:metrics.backlog||0,jobs};};
  window.__reviewCounters=()=>({canvasAllocations:p.canvasAllocations,offscreenAllocations:p.offscreenAllocations,effectDraws:p.effectDraws,paints:p.paints,acceptedShots:p.acceptedShots||0,
    physicalDebrisAdmissions:p.physicalDebrisAdmissions,environmentalDebrisCalls:p.environmentalDebrisCalls,
    simulationSeconds:nativeSimulation.seconds(nativeNpcDev.getState()),pendingWork:window.nativeSimulationFrame?.pendingWork?.(nativeNpcDev.getState())||{steps:0,tasks:0,cpuMs:0,counters:{}},debris:nativeAsteroidCombat.metrics(),shipParticles:nativeShipEffects.snapshot().particles,asteroids:nativeSolAsteroids.metrics?.(),
    life:__reviewLife(),sprite:nativeShipSpriteCache.snapshot(),effects:nativeShipEffects.metrics(),loader:vexedFlightAssets.cacheSnapshot?.(),queue:window.nativeDamageArtPreparation?.snapshot?.()});
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

# Matrix-only counters. The ordinary six-scenario review installs neither this
# RAF wrapper nor the additional per-actor paint wrapper.
CAPACITY_INSTRUMENT=r"""() => {
  const p=__renderReview,capacity=p.capacity={configured:new Set(),painted:new Set(),visible:new Set(),configuredPainted:new Set(),configuredVisible:new Set(),frames:[]},raf=requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>callback.name!=='draw'?raf(callback):raf(function draw(timestamp){
    capacity.painted.clear();capacity.visible.clear();capacity.configuredPainted.clear();capacity.configuredVisible.clear();
    try{return callback(timestamp);}finally{if(__stability.record)capacity.frames.push({configuredShips:capacity.configured.size,
      uniquePaintedActors:capacity.painted.size,visibleHullBoundsActors:capacity.visible.size,
      configuredPaintedActors:capacity.configuredPainted.size,configuredVisibleHullBoundsActors:capacity.configuredVisible.size});}
  });
}"""

CAPACITY_INSTALL=r"""() => {
  const capacity=__renderReview.capacity,paint=nativeShipEffects.paintShip;
  window.nativeShipEffects={...nativeShipEffects,paintShip(ctx,descriptor,view){
    const result=paint(ctx,descriptor,view);
    if(__stability.record&&(result?.art||Boolean(result)&&descriptor.definition.renderer)){
      const key=descriptor.category+':'+descriptor.id;capacity.painted.add(key);
      if(capacity.configured.has(key))capacity.configuredPainted.add(key);
      const zoom=view.zoom??1,angle=descriptor.heading+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),
        radii=descriptor.hullRadii||{rx:descriptor.dimensions.width/2,ry:descriptor.dimensions.height/2},
        rx=Math.hypot(radii.rx*c,radii.ry*s)*zoom,ry=Math.hypot(radii.rx*s,radii.ry*c)*zoom,
        x=view.x??view.cx+(descriptor.x-view.ship.x)*zoom,y=view.y??view.cy+(descriptor.y-view.ship.y)*zoom;
      if(x+rx>=0&&y+ry>=0&&x-rx<=(view.w??capacity.viewport?.w??Infinity)&&y-ry<=(view.h??capacity.viewport?.h??Infinity)){
        capacity.visible.add(key);if(capacity.configured.has(key))capacity.configuredVisible.add(key);
      }
    }
    return result;
  }};
}"""

CAPACITY_SETUP=r"""({count,mixed}) => {
  const s=nativeNpcDev.getState(),origin=vexedSolFlight.shipPosition(s),viewport=nativeView.measure(document.querySelector('#space')),
    types=[7,10,18,35,49,58,47,50,59,23,55,34],ships=s.civilianTraffic.ships.filter(e=>e.hull>0).slice(0,count),capacity=__renderReview.capacity;
  if(ships.length!==count)throw Error('Capacity fixture has fewer living ships than requested');
  nativeShipMotion.stop(s);delete s.localCruise;delete s.arrivalApproach;
  const entries=ships.map((ship,index)=>{
    nativeNpcLives.interrupt(s,ship,'rendering stress fixture');ship.scriptedDemo='benchmark';nativeShipMotion.stop(ship);
    if(mixed){const type=types[index%types.length],definition=nativeShipDefinitions.get(type,'civilian');Object.assign(ship,{shipType:type,hull:definition.hull,shields:definition.shields});nativeShipEquipment.ensure(s,ship);}
    const dimensions=nativeShipDefinitions.dimensions(ship,'civilian');return {ship,dimensions,radius:Math.hypot(dimensions.width,dimensions.height)/2};
  });
  // Fit original-size, arbitrarily rotated artwork completely within the actual
  // game canvas. Dense physical overlaps are allowed to resolve normally.
  const margin=Math.max(...entries.map(entry=>entry.radius))+12,width=viewport.w-2*margin,height=viewport.h-2*margin;
  if(!(width>0&&height>0))throw Error('Capacity viewport cannot contain the configured hull sizes');
  const cols=Math.min(count,Math.max(1,Math.ceil(Math.sqrt(count*width/height)))),rows=Math.ceil(count/cols),layout=[];
  entries.forEach(({ship,dimensions,radius},index)=>{
    const screenX=cols===1?viewport.w/2:margin+(index%cols)*width/(cols-1),screenY=rows===1?viewport.h/2:margin+Math.floor(index/cols)*height/(rows-1),heading=index*Math.PI/6+Math.PI;
    if(screenX-radius<0||screenX+radius>viewport.w||screenY-radius<0||screenY+radius>viewport.h)throw Error('Capacity hull starts outside the actual canvas');
    Object.assign(ship,{system:s.system,x:origin.x+screenX-viewport.w/2,y:origin.y+screenY-viewport.h/2,previousX:origin.x+screenX-viewport.w/2,previousY:origin.y+screenY-viewport.h/2,
      phase:'docked',timer:1e6,heading,speed:0,vx:0,vy:0});
    nativeNpcLives.refreshLocation(s,ship);capacity.configured.add('civilian:'+ship.id);
    layout.push({id:ship.id,shipType:ship.shipType,x:ship.x,y:ship.y,heading,hull:ship.hull,shields:ship.shields,dimensions,equipment:ship.shipEquipment||null});
  });
  capacity.viewport={w:viewport.w,h:viewport.h};nativeShipSystems.invalidate(s);
  return {requestedShips:count,configuredShips:entries.length,viewport:capacity.viewport,cols,rows,margin,allInitialArtworkBoundsVisible:true,layout};
}"""

DEBRIS_INPUT=r"""() => {
  const s=nativeNpcDev.getState(),advance=nativeCivilianTraffic.advance,start=nativeSimulation.seconds(s),
    rock=nativeSolAsteroids.placements.find(r=>r.demo)||nativeSolAsteroids.placements[0],
    gone=new Set([...(s.minedAsteroids||[]),...(s.destroyedAsteroids||[])]),
    nearby=nativeSolAsteroids.placements.filter(other=>other.slotId!==rock.slotId&&Math.hypot(other.x-rock.x,other.y-rock.y)<850&&!gone.has(other.slotId));
  let index=0;__renderReview.debrisInputs=[];
  nativeCivilianTraffic.advance=function(state,dt){
    const elapsed=nativeSimulation.seconds(state)-start;
    if(state===s&&elapsed>=1.8*(index+1)&&index<nearby.length){const next=nearby[index++];nativeAsteroidCombat.destroy(s,next);__renderReview.debrisInputs.push({at:elapsed,id:next.slotId});}
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
  __reviewResetDebris();__stability.frames=[];__stability.longTasks=[];__stability.record=true;
  return {id:ship.id,type,stage,started:p.cold.started};
}"""

SAVE_PROBE=r"""() => {
  const s=nativeNpcDev.getState(),rows=[],stringify=JSON.stringify,set=Storage.prototype.setItem,get=Storage.prototype.getItem;
  for(let run=0;run<3;run++){
    const row={serializationMs:0,storageMs:0,verificationMs:0,serializedBytes:0},start=performance.now();
    if(!nativeSaveStorage.metrics){
      JSON.stringify=function(...args){const at=performance.now(),value=stringify.apply(this,args);row.serializationMs+=performance.now()-at;row.serializedBytes=Math.max(row.serializedBytes,value?.length*2||0);return value;};
      Storage.prototype.setItem=function(...args){const at=performance.now();try{return set.apply(this,args);}finally{row.storageMs+=performance.now()-at;}};
      Storage.prototype.getItem=function(...args){const at=performance.now();try{return get.apply(this,args);}finally{row.verificationMs+=performance.now()-at;}};
    }
    try{row.result=nativeSaveStorage.write(s);}finally{JSON.stringify=stringify;Storage.prototype.setItem=set;Storage.prototype.getItem=get;}
    row.totalMs=performance.now()-start;
    if(nativeSaveStorage.metrics){row.owner=nativeSaveStorage.metrics();Object.assign(row,{serializationMs:row.owner.serializationMs,storageMs:row.owner.storageMs,verificationMs:row.owner.verificationMs,serializedBytes:row.owner.characters*2});}
    rows.push(row);
  }
  return {rows,population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,
    note:'Separate untimed probe after clean samples; nested component times are not added to total. Isolated browser storage only.'};
}"""

def stat(values):
    return {'mean':sum(values)/len(values) if values else 0,'p50':stability.legacy.percentile(values,.5),
            'p95':stability.legacy.percentile(values,.95),'p99':stability.legacy.percentile(values,.99),'max':max(values,default=0)}

def summarize(frames,seconds):
    intervals=[r['intervalMs'] for r in frames if r['intervalMs']>0]
    return {'frames':len(frames),'actualSeconds':seconds,'averageFps':len(frames)/seconds,
            'frameSpikesOver33ms':sum(v>33 for v in intervals),'frameSpikesOver50ms':sum(v>50 for v in intervals),
            'frameSpikesOver100ms':sum(v>100 for v in intervals),
            **{key:stat([f[key] for f in frames]) for key in ['intervalMs','callbackMs','simulationMs','renderMs','backgroundSimulationMs']}}

def frame_work(frames,before,after):
    """Count between-display service work once, including unpresented tail work.

    Background work carried into the first recorded frame may precede this
    window; subtract it and include work after the last display. CPU service
    time is disjoint from each display callback's simulation/render timings.
    """
    first=before.get('pendingWork') or {};last=after.get('pendingWork') or {}
    work={}
    for frame in frames:
        for key,value in frame.get('frameBudget',{}).get('counters',{}).items():work[key]=work.get(key,0)+value
    for key in set(first.get('counters',{}))|set(last.get('counters',{})):
        work[key]=work.get(key,0)+last.get('counters',{}).get(key,0)-first.get('counters',{}).get(key,0)
    return {'physicsSubsteps':sum(f.get('frameBudget',{}).get('steps',0) for f in frames)+last.get('steps',0)-first.get('steps',0),
        'backgroundTasks':sum(f.get('backgroundTasks',0) for f in frames)+last.get('tasks',0)-first.get('tasks',0),
        'backgroundSimulationTotalMs':sum(f.get('backgroundSimulationMs',0) for f in frames)+last.get('cpuMs',0)-first.get('cpuMs',0),
        'displaySimulationTotalMs':sum(f.get('simulationMs',0) for f in frames),'simulationWork':work}

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
    parser.add_argument('--seed',type=int,default=4292026)
    parser.add_argument('--population',type=int,default=0)
    parser.add_argument('--visible-ships',type=int,default=12)
    parser.add_argument('--mixed-ships',action='store_true')
    parser.add_argument('--capacity-matrix',action='store_true',help='Opt in to actual-canvas crowd placement and per-frame unique painted/visible hull counters')
    parser.add_argument('--stationary-observer',action='store_true',help='Issue no scripted flight controls; ordinary collision momentum still applies')
    parser.add_argument('--distant-system',choices=['existing','current'],default='existing')
    parser.add_argument('--active-distant',action='store_true',help='Stagger added crews into the existing saved job scheduler instead of leaving them idle')
    parser.add_argument('--dpr',type=float,default=1)
    parser.add_argument('--width',type=int,default=1280)
    parser.add_argument('--height',type=int,default=850)
    parser.add_argument('--save-probe',action='store_true')
    args=parser.parse_args();OUTPUT.mkdir(parents=True,exist_ok=True)
    source=args.source_root.resolve()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(source)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    errors=[];failed=[]
    report={'label':args.label,'revision':args.revision_label,'sourceRoot':str(source),'viewport':{'width':args.width,'height':args.height},'randomSeed':args.seed,
        'harnessHashes':{name:hashlib.sha256((ROOT/'tests'/name).read_bytes()).hexdigest() for name in ['browser-performance-review.py','browser-stability.py','browser-npc-performance.py']},
        'fixtureSettings':{'population':args.population,'visibleShips':args.visible_ships,'mixedShips':args.mixed_ships,'distantSystem':args.distant_system,'activeDistant':args.active_distant,'dpr':args.dpr},
        'platform':platform.platform(),'secondsPerWindow':args.seconds,'runs':args.runs,'warmupSeconds':3,
        'sourceHashes':{str(p.relative_to(source)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()
            for folder in ['html-games/broken-mirror-port','html-games/flashtrek-broken-mirror'] for p in sorted([*(source/folder).glob('*.js'),*(source/folder).glob('*.html')])},
        'scenarios':{},'cold':[],'incomplete':True,'passed':False,'captures':[],'captureErrors':[],'warnings':[], 'notes':['Full saved production fleet remains active. Crowd combat uses the existing12-provoked-NPC/high-player-health stress fixture. Inputs repeat by authoritative simulation time. No other benchmark/test workers should run concurrently; OS activity is uncontrolled.',
        'Canvas counts include main-document HTML and OffscreenCanvas construction, not browser internals or worker-private surfaces. Phase durations are wall times and can overlap; decode() timing is not total browser decoder CPU.',
        'Warmup loads artwork with simulation time frozen; animated phase caches start cold. spriteRebuilds is the complete animated-effect count; profile effectDraws can omit artwork loaded before instrumentation.',
        'After each measured window, recording stops and the isolated simulation is blocked in the same evaluation. Captures and save probes cannot advance gameplay; sampled debt/counters remain the measured values. Completed rows checkpoint before captures and after probes. Screenshot failures are explicit warnings/mediaReady:false, not missing timing windows or concealed page errors.',
        'physicalDebrisAdmissions counts unique piece objects first passed to nativeEnvironmentalImpacts.debris while recording, using a fresh per-window WeakSet; environmentalDebrisCalls counts all calls to that shared physical entry during recording, including calls that may return early. These are actual observed objects/calls, not decorative particle counts, exact contact tests or forced/equalized workloads. No gameplay random stream is overridden by these counters.']}
    if args.capacity_matrix:
        report['fixtureSettings'].update(capacityMatrix=True,stationaryObserver=args.stationary_observer)
        report['notes'].append('Matrix-only RAF/paint wrappers count unique submitted artwork and visible rotated hull bounds per frame. Initial original-size hull artwork fits inside the actual game canvas; subsequent contacts and scattering are not reset. These wrappers and canvas-derived placement are absent from default core timing runs; the harness hash changes without changing that default execution path.')
    if args.stationary_observer:report['notes'].append('The observer receives no scripted flight input. Physics, collisions and inherited momentum remain authoritative; this does not anchor the observer or freeze nearby ships.')
    def checkpoint(phase,**progress):
        report['progress']={'phase':phase,**progress}
        report.update(javascriptErrors=list(errors),failedRequests=list(failed),
            mediaReady=not report['incomplete'] and bool(report['captures']) and all(item['status']=='ready' for item in report['captures']))
        path=OUTPUT/f'{args.label}.json';temporary=path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(report,indent=2),encoding='utf-8');os.replace(temporary,path)
    def capture(page,path,**context):
        item={'path':str(path.relative_to(ROOT)),'status':'pending',**context};report['captures'].append(item)
        checkpoint('before-capture',**context)
        try:page.screenshot(path=str(path))
        except PlaywrightError as error:
            item.update(status='failed',error=str(error),errorType=type(error).__name__)
            report['captureErrors'].append(dict(item));report['warnings'].append('Screenshot unavailable: '+item['path'])
            print(json.dumps({'captureError':dict(item),'timingRowsPreserved':True}),flush=True)
        else:item['status']='ready'
        checkpoint('after-capture',**context)
    checkpoint('initializing')
    try:
        with sync_playwright() as playwright:
            channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=playwright.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            report.update(browserVersion=browser.version,channel=channel)
            session=browser.new_browser_cdp_session()
            report['graphics']=session.send('SystemInfo.getInfo')
            def page_open(warm=True):
                page=browser.new_page(viewport=report['viewport'],device_scale_factor=args.dpr);page.on('pageerror',lambda e:errors.append(str(e)))
                page.add_init_script('(()=>{let seed;window.__resetFixtureRandom=()=>{seed='+str(args.seed)+'>>>0;window.__fixtureRandomCalls=0;};__resetFixtureRandom();Math.random=()=>{window.__fixtureRandomCalls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};})()')
                page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
                instrument='('+stability.INSTRUMENT+')();('+INSTRUMENT+')()'
                if args.capacity_matrix:instrument+=';('+CAPACITY_INSTRUMENT+')()'
                page.add_init_script(instrument)
                page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
                page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
                page.evaluate(INSTALL);page.evaluate(stability.INSTALL)
                if args.capacity_matrix:page.evaluate(CAPACITY_INSTALL)
                page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length',timeout=120000)
                if warm:
                    page.wait_for_function('()=>nativeCivilianTraffic.effectsReady() && !nativeShipEffects.metrics().pending',timeout=120000)
                return page
            page=page_open();report['device']=page.evaluate('({hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,devicePixelRatio:devicePixelRatio,userAgent:navigator.userAgent})')
            if not args.fixture.exists():
                args.fixture.parent.mkdir(parents=True,exist_ok=True);args.fixture.write_text(page.evaluate('JSON.stringify(nativeNpcDev.getState())'),encoding='utf-8')
            saved=args.fixture.read_text(encoding='utf-8');original_saved=saved;report['initialSaveSha256']=hashlib.sha256(args.fixture.read_bytes()).hexdigest()
            initial=json.loads(saved)
            if args.population:
                ships=initial['civilianTraffic']['ships'];templates=json.loads(json.dumps(ships));next_id=max(int(e['id']) for e in ships)+1
                goal=args.population-len(initial['solEconomy']['freighters'])-1
                assert goal>=len(ships),'Population cases must preserve the original saved fleet'
                for index in range(goal-len(ships)):
                    ship=json.loads(json.dumps(templates[index%len(templates)]));ship_id=next_id+index
                    ship.update(id=ship_id,name=f'Scale fixture {ship_id}',system=initial['system'] if args.distant_system=='current' else ship['system'],
                        x=1e7+index*200,y=1e7,heading=0,speed=0,vx=0,vy=0,phase='docked',task=None,journey=None,nextActionAt=1e9)
                    for key in ['localLeg','dockingMove','motionKick','motionSpin','disputeId','retaliationId','combatAI','combatInterruption','scriptedDemo']:ship.pop(key,None)
                    if args.active_distant:
                        # These are independent fixture owners, not copies of a
                        # funded contract or another ship's cargo/reservation.
                        # The existing action owner chooses all subsequent work.
                        ship.update(cargo=None,cargoOwner=ship_id,oreHold=0,deliveries=0,mined=0,deals=0,stolenOre=0,recentEvents=[],lifeVersion=1,dockingVersion=1,
                            nextActionAt=initial.get('shipSimulation',{}).get('seconds',0)+1+((index*37+args.seed)%120)*.25)
                        for key in ['dockIntent','needsDockRecovery','dockRecoveryResumeAt','lastJourney','destinationSystem','warpVisual','warpResumePhase','lifeDemoName',
                                    'combatReturn','projectileEvade','oreTheft','rescueCall','repairResumePhase','miningRockSlot','miningStartedAt','miningSourceX','miningSourceY']:
                            ship.pop(key,None)
                    # Independent owners retain independent equipment identities.
                    # Reconcile the legacy projections when the live owner admits
                    # this fixture; never clone another crew's owned item IDs.
                    equipment=ship.get('shipEquipment')
                    if equipment:
                        remap={old:'f'+format(ship_id,'x')+':'+format(slot,'x') for slot,old in enumerate(equipment['instances'])}
                        equipment['instances']={remap[old]:dict(item,id=remap[old]) for old,item in equipment['instances'].items()}
                        equipment['owner']='civilian:'+str(ship_id)+':0'
                        equipment['slots']={bank:[remap.get(item) if item else None for item in slots] for bank,slots in equipment['slots'].items()}
                        equipment['locker']=[remap[item] for item in equipment['locker']]
                    ships.append(ship)
                initial['civilianTraffic']['nextId']=next_id+max(0,goal-len(templates))
                saved=json.dumps(initial,separators=(',',':'))
            report['derivedSaveSha256']=hashlib.sha256(saved.encode()).hexdigest()
            report['addedCrewsScheduled']=max(0,len(initial['civilianTraffic']['ships'])-len(json.loads(original_saved)['civilianTraffic']['ships'])) if args.active_distant else 0
            if args.active_distant:report['notes'].append('Added independent crews have seed-staggered 1–30.75 second action deadlines. Existing NPC policies choose real funded jobs; job scarcity, movement, collisions and due-event debt remain measured outcomes. This does not assert all records are simultaneously active AI or combatants.')
            report['population']=len(initial['civilianTraffic']['ships'])+len(initial['solEconomy']['freighters'])+1;page.close()
            def setup(page,mode):
                page.evaluate('__resetFixtureRandom()')
                population=page.evaluate(stability.SETUP,{'saved':original_saved if args.population else saved,'mode':mode})
                # The baseline cannot store this larger fleet within Web Storage
                # quota. Restore the same base fixture, then append its recorded
                # extra records through the existing population owner on BOTH
                # revisions. Separate save probes report real durable capacity.
                if args.population:
                    population=page.evaluate(r'''saved=>{const derived=JSON.parse(saved),s=nativeNpcDev.getState(),count=s.civilianTraffic.ships.length;
                      const added=derived.civilianTraffic.ships.slice(count);for(const ship of added)if(ship.shipEquipment)nativeShipEquipment.project(ship,ship.shipEquipment);
                      s.civilianTraffic.ships.push(...added);s.civilianTraffic.nextId=derived.civilianTraffic.nextId;
                      nativeNpcLives.initialize(s);nativeShipSystems.invalidate(s);
                      return {population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1};}''',saved)
                page.evaluate('()=>{for(const timer of window.__stabilityTimers||[])clearInterval(timer);window.__stabilityTimers=[];}')
                assert population['population']==report['population']
                return population
            if not args.warm_only:
                for ship_type in map(int,args.cold_types.split(',')):
                    for stage in [0,2]:
                        page=page_open(warm=False)
                        page.evaluate('()=>{window.__reviewBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();}')
                        population=setup(page,'flight')
                        page.evaluate(COLD_SETUP,{'type':ship_type,'stage':stage})
                        page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:window.__reviewBlocked};window.nativeSimulationHost?.checkpoint();}')
                        try:page.wait_for_function('()=>__renderReview.cold.firstCorrectStageMs!==undefined',timeout=30000)
                        except Exception:
                            debug=page.evaluate('()=>({cold:{type:__renderReview.cold.type,stage:__renderReview.cold.stage,started:__renderReview.cold.started,firstVisibleMs:__renderReview.cold.firstVisibleMs,observed:__renderReview.cold.observed,position:{x:__renderReview.cold.entity.x,y:__renderReview.cold.entity.y},player:vexedSolFlight.shipPosition(nativeNpcDev.getState())},paints:__renderReview.paints,phases:__renderReview.phases,effects:nativeShipEffects.metrics(),errors:window.__reviewErrors})')
                            (OUTPUT/f'{args.label}-cold-failure.json').write_text(json.dumps(debug,indent=2),encoding='utf-8');raise
                        page.wait_for_timeout(2500)
                        row=page.evaluate('()=>{__stability.record=false;window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();__renderReview.collectCold=false;const p=__renderReview;return {type:p.cold.type,stage:p.cold.stage,measurementMs:performance.now()-p.cold.started,firstVisibleMs:p.cold.firstVisibleMs,firstCorrectStageMs:p.cold.firstCorrectStageMs,phases:p.phases,images:p.images,frames:__stability.frames,longTasks:__stability.longTasks,counters:__reviewCounters()};}')
                        frames=row.pop('frames');row['frameStatistics']=summarize(frames,row['measurementMs']/1000)
                        report['cold'].append(row);(OUTPUT/f'{args.label}-cold-{ship_type}-{stage}-frames.json').write_text(json.dumps(frames),encoding='utf-8')
                        checkpoint('cold-window-recorded',type=ship_type,stage=stage)
                        capture(page,OUTPUT/f'{args.label}-cold-{ship_type}-{stage}.png',kind='cold',type=ship_type,stage=stage);page.close()
                        print(json.dumps({'cold':ship_type,'stage':stage,'visibleMs':row['firstVisibleMs'],'correctStageMs':row['firstCorrectStageMs'],'p95':row['frameStatistics']['intervalMs']['p95']}),flush=True)
            if not args.cold_only:
                for mode in args.scenarios.split(','):
                    report['scenarios'][mode]=[]
                    mode_saved=saved
                    descriptions={
                        'flight':'Production 172-ship save with ordinary flight inputs.',
                        'crowdedFlight':'Twelve existing ships placed around the player without provocation; all other civilian lives retained.',
                        'crowdedCombat':'Twelve existing ships provoked with ordinary NPC statistics; high-health player stress fixture; all other civilian lives retained.',
                        'miningDebris':'Existing mining demo plus seeded nearby asteroid destruction every 1.8 simulation seconds; all civilian lives retained.',
                        'warp':'Existing repeated warp visual fixture with ordinary civilian simulation.',
                        'devMap':'Dev map with ordinary civilian simulation and inspection.'}
                    report.setdefault('scenarioFixtures',{})[mode]={'sourceSha256':hashlib.sha256(mode_saved.encode()).hexdigest(),
                        'description':descriptions[mode]}
                    for run in range(args.runs):
                        page=page_open()
                        page.evaluate('()=>{window.__reviewBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();}')
                        population=setup(page,'flight' if mode=='crowdedFlight' else mode)
                        page.evaluate('(mode)=>{window.__reviewMode=mode;}',mode)
                        capacity_fixture=None
                        if mode=='crowdedFlight' and args.capacity_matrix:
                            capacity_fixture=page.evaluate(CAPACITY_SETUP,{'count':args.visible_ships,'mixed':args.mixed_ships})
                            layout=capacity_fixture.pop('layout');capacity_fixture['initialLayoutSha256']=hashlib.sha256(json.dumps(layout,sort_keys=True,separators=(',',':')).encode()).hexdigest()
                        elif mode=='crowdedFlight':page.evaluate(r'''({count,mixed})=>{const s=nativeNpcDev.getState(),origin=vexedSolFlight.shipPosition(s),types=[7,10,18,35,49,58,47,50,59,23,55,34];nativeShipMotion.stop(s);s.civilianTraffic.ships.filter(e=>e.hull>0).slice(0,count).forEach((ship,index)=>{nativeNpcLives.interrupt(s,ship,"rendering stress fixture");ship.scriptedDemo="benchmark";const angle=index*Math.PI/6,radius=180+(index%3)*35;
                          const grid=count>12,cols=Math.ceil(Math.sqrt(count*1.5)),x=grid?(index%cols-(cols-1)/2)*90:Math.cos(angle)*radius,y=grid?(Math.floor(index/cols)-(Math.ceil(count/cols)-1)/2)*82:Math.sin(angle)*radius;
                          Object.assign(ship,{system:s.system,x:origin.x+x,y:origin.y+y,phase:"docked",timer:1e6,heading:angle+Math.PI,speed:0});
                          if(mixed){const type=types[index%types.length],d=nativeShipDefinitions.get(type,'civilian');Object.assign(ship,{shipType:type,hull:d.hull,shields:d.shields});nativeShipEquipment.ensure(s,ship);}
                          nativeNpcLives.refreshLocation(s,ship);});nativeShipSystems.invalidate(s);}''',{'count':args.visible_ships,'mixed':args.mixed_ships})
                        page.wait_for_timeout(3000)
                        page.wait_for_function('()=>!nativeShipEffects.metrics().pending && !vexedFlightAssets.cacheSnapshot().ships.pending && !(nativeShipEffects.metrics().preparation?.pending)',timeout=120000)
                        if mode!='devMap':page.locator('#space').focus()
                        if mode in ['flight','crowdedFlight'] and not args.stationary_observer:page.evaluate(SCRIPTED_INPUT)
                        if mode=='miningDebris':page.evaluate(DEBRIS_INPUT)
                        page.evaluate('()=>{__resetFixtureRandom();__reviewResetDebris();}')
                        before=page.evaluate('__reviewCounters()')
                        if args.capacity_matrix:page.evaluate('()=>{__renderReview.capacity.frames=[];}')
                        page.evaluate('()=>{__stability.frames=[];__stability.longTasks=[];__stability.record=true;__renderReview.inputs=[];__renderReview.measureStarted=performance.now();window.nativeSimulation={...nativeSimulation,blocked:window.__reviewBlocked};window.nativeSimulationHost?.checkpoint();}')
                        start=time.perf_counter();page.wait_for_timeout(args.seconds*1000);seconds=time.perf_counter()-start
                        sample=page.evaluate('()=>{__stability.record=false;window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();const s=nativeNpcDev.getState();return {measurementMs:performance.now()-__renderReview.measureStarted,frames:__stability.frames,longTasks:__stability.longTasks,after:__reviewCounters(),inputs:__renderReview.inputs,state:{simulationSeconds:nativeSimulation.seconds(s),population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,activeCombatants:s.civilianTraffic.ships.filter(e=>e.hull>0&&(e.disputeId||e.retaliationId)).length,survivingShips:s.civilianTraffic.ships.filter(e=>e.hull>0).length,player:{x:s.x,y:s.y,angle:s.angle,speed:s.speed,hull:s.hull},physicsDebtSeconds:s.shipSimulation?.schedule?.pendingSeconds??null,randomCalls:__fixtureRandomCalls,debrisInputs:__renderReview.debrisInputs||[],medical:s.civilianTraffic.ships.filter(e=>e.shipType===58).map(e=>({id:e.id,system:e.system,phase:e.phase,job:e.task?.phase,kind:e.task?.kind,journey:!!e.journey,supplies:e.repairDeuranium})),metrics:nativeSimulationMetrics.snapshot(),liveShots:s.weaponCombat?.events?.filter(e=>e.alive&&!e.resolved).length||0}};}')
                        frames=sample.pop('frames');seconds=sample['measurementMs']/1000;assert sample['state']['population']==report['population']
                        if args.capacity_matrix:
                            capacity_frames=page.evaluate('__renderReview.capacity.frames')
                            assert len(capacity_frames)==len(frames),'Matrix paint counters lost alignment with delivered frames'
                            for frame,capacity_frame in zip(frames,capacity_frames):frame['capacity']=capacity_frame
                            sample['capacity']={'fixture':capacity_fixture,'perFrame':{key:{**stat([frame[key] for frame in capacity_frames]),'min':min((frame[key] for frame in capacity_frames),default=0)} for key in ['uniquePaintedActors','visibleHullBoundsActors','configuredPaintedActors','configuredVisibleHullBoundsActors']},'configuredShips':args.visible_ships if mode=='crowdedFlight' else None}
                        counters={key:sample['after'][key]-before[key] for key in ['canvasAllocations','offscreenAllocations','effectDraws','paints','acceptedShots','physicalDebrisAdmissions','environmentalDebrisCalls']}
                        counters['sprite']={key:value-before['sprite']['counters'].get(key,0) for key,value in sample['after']['sprite']['counters'].items()}
                        counters.update(frame_work(frames,before,sample['after']))
                        counters['simulationProgressSeconds']=sample['after']['simulationSeconds']-before['simulationSeconds']
                        if 'indexBuilds' in (sample['after'].get('asteroids') or {}):
                            counters['asteroidIndexBuilds']=sample['after']['asteroids']['indexBuilds']-before['asteroids']['indexBuilds']
                        counters['asteroidSpatialWork']={key:sample['after']['asteroids'][key]-before['asteroids'][key]
                            for key in ['broadphaseQueries','broadphaseVisits','summaryVisits'] if key in (sample['after'].get('asteroids') or {})}
                        row={'run':run+1,**summarize(frames,seconds),'counters':counters,'before':before,**sample};report['scenarios'][mode].append(row)
                        (OUTPUT/f'{args.label}-{mode}-{run+1}-frames.json').write_text(json.dumps(frames),encoding='utf-8')
                        checkpoint('warm-window-recorded',scenario=mode,run=run+1)
                        if run==0:capture(page,OUTPUT/f'{args.label}-{mode}.png',kind='warm',scenario=mode,run=run+1)
                        if args.save_probe and run==0:
                            report.setdefault('saveProbes',{})[mode]=page.evaluate(SAVE_PROBE)
                            checkpoint('save-probe-recorded',scenario=mode,run=run+1)
                        row['postWindow']=page.evaluate('()=>{const s=nativeNpcDev.getState();return {simulationSeconds:nativeSimulation.seconds(s),physicsDebtSeconds:s.shipSimulation?.schedule?.pendingSeconds??null,blocked:nativeSimulation.blocked(),recording:__stability.record};}')
                        assert row['postWindow']['blocked'] and not row['postWindow']['recording'],'Post-window simulation was not blocked'
                        assert row['postWindow']['simulationSeconds']==row['state']['simulationSeconds'],'Captures/probes advanced isolated gameplay after recording ended'
                        assert row['postWindow']['physicsDebtSeconds']==row['state']['physicsDebtSeconds'],'Captures/probes changed measured simulation debt'
                        checkpoint('post-window-complete',scenario=mode,run=run+1)
                        print(json.dumps({'mode':mode,'run':run+1,'fps':row['averageFps'],'p95':row['intervalMs']['p95'],'over50':row['frameSpikesOver50ms'],'counters':counters}),flush=True)
                        page.close()
            browser.close()
        report.update(passed=not errors and not failed,incomplete=False)
        checkpoint('complete')
        assert not errors,errors;assert not failed,failed
    except BaseException as error:
        report.update(passed=False,failure=repr(error));checkpoint('failed',previousProgress=report.get('progress'))
        raise
    finally:server.shutdown()

if __name__=='__main__':main()
