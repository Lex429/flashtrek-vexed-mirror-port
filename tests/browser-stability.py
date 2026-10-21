"""Cold artwork regressions and repeatable long-window stability measurements.

Default: functional checks, suitable for CI.  --measure adds the same saved
ship population, five 20-second scenarios and three repetitions by default. Serve an
exact Git revision with --revision; compare using the same fixture and browser.
Cold probes render an existing nearby civilian for five seconds per uncached
class. --diagnostic-only records representative detail counts and mining read
owners outside timing windows; it is not a substitute for the longer measures.
No wall-clock timing threshold is a portable correctness assertion.
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
import statistics
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'test-results'
spec = importlib.util.spec_from_file_location('npc_performance', ROOT/'tests/browser-npc-performance.py')
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)

INSTRUMENT = r"""() => {
  window.__stability={frames:[],longTasks:[],record:false,last:null,sim:0,owners:{},prepared:0,
    pixelReads:0,pixelReadMs:0,prepSyncMs:0,prepSyncCalls:0,artworkDraws:0,rafGaps:[],micro:[],
    tactical:{steering:0,distantSteering:0,firingAttempts:0,distantFiringAttempts:0,sceneRequests:0},frameTactical:null};
  const p=window.__stability,raf=requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>raf(timestamp=>{
    if(callback.name!=='draw')return callback(timestamp);
    const start=performance.now(),interval=p.last===null?0:timestamp-p.last;p.last=timestamp;p.sim=0;p.owners={};p.nativeFrame=null;
    p.frameTactical={steering:0,distantSteering:0,firingAttempts:0,distantFiringAttempts:0,sceneRequests:0};
    try{return callback(timestamp);}finally{
      if(p.record){const total=performance.now()-start,data=p.nativeFrame,frameBudget=window.nativeSimulationFrame?.snapshot?.(window.nativeNpcDev?.getState?.())||null;
        p.frames.push({intervalMs:interval,callbackMs:total,moved:0,simulationMs:data?.simulation??p.sim,
          backgroundSimulationMs:frameBudget?.background?.cpuMs||0,backgroundTasks:frameBudget?.background?.tasks||0,
          renderMs:data?.render??Math.max(0,total-p.sim),owners:{...p.owners},
          tactical:{...p.frameTactical},frameBudget});}
    }
  });
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(p.record)p.longTasks.push({startTime:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});}catch{}
  const read=CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData=function(...args){const start=performance.now(),stack=window.__stabilityTracePixelReads?new Error('Untimed pixel read owner').stack:null;
    try{return read.apply(this,args);}finally{const elapsed=performance.now()-start;if(p.record){p.pixelReads++;p.pixelReadMs+=elapsed;}
      if(stack)(p.pixelReadStacks??=[]).push({width:args[2],height:args[3],ms:elapsed,stack});}};
}"""

INSTALL = r"""() => {
  const p=__stability;
  function wrap(name,method,fn){const original=window[name];if(!original||typeof original[method]!=='function')return;window[name]={...original,[method]:fn(original[method])};}
  for(const name of ['nativeSolEconomy','nativeCivilianTraffic','nativeCombatShots','nativeShipEffects','nativeEnvironmentalImpacts','nativeAsteroidCombat']){
    wrap(name,'advance',fn=>function(...args){const start=performance.now();try{return fn(...args);}finally{const elapsed=performance.now()-start;p.sim+=elapsed;p.owners[name]=(p.owners[name]||0)+elapsed;}});
  }
  wrap('nativeSimulationMetrics','record',fn=>function(state,data){p.nativeFrame=data;return fn(state,data);});
  wrap('nativeShipEffects','prepare',fn=>function(...args){if(p.record)p.prepared++;return fn(...args);});
  wrap('nativeShipEffects','paintShip',fn=>function(...args){if(p.record)p.artworkDraws++;const result=fn(...args);
    if(p.record&&p.probeActor===args[1]?.entity&&result?.art){p.probePaints++;p.probeFirstVisibleMs??=performance.now()-p.probeStarted;if(!p.probeOptionalReady)p.visibleBeforeOptional++;}
    return result;});
  // Additional distance checks belong to an untimed diagnostic window after
  // each sample. They must not inflate the measured rendering/simulation work.
  window.__stabilityInstallTacticalDiagnostics=()=>{
  const count=field=>{p.tactical[field]++;if(p.frameTactical)p.frameTactical[field]++;};
  const nearby=target=>{const s=window.nativeNpcDev?.getState?.(),entity=target?.entity||target;if(!s||!entity)return true;
    const category=target.category||(entity===s?'player':'civilian'),location=window.nativeShipDetail?.pose?.(s,target,{category})||entity;
    const player=s.system===1?vexedSolFlight.shipPosition(s):s,radius=s.civilianTraffic?.life?.config?.detailedRadius||6500;
    return (target.system??entity.system??s.system)===s.system&&Number.isFinite(location.x)&&Math.hypot(location.x-player.x,location.y-player.y)<=radius;};
  if(window.nativeCivilianCombatAI?.steer){const steer=nativeCivilianCombatAI.steer;nativeCivilianCombatAI.steer=function(ship,...args){count('steering');if(!nearby(ship))count('distantSteering');return steer(ship,...args);};}
  wrap('nativeCombatShots','fireFor',fn=>function(options){count('firingAttempts');if(!nearby(options.shooter))count('distantFiringAttempts');return fn(options);});
  wrap('nativeShipSystems','scene',fn=>function(...args){count('sceneRequests');return fn(...args);});
  };
  wrap('showcaseStageFragments','prepare',fn=>function(...args){const start=performance.now();try{return fn(...args);}finally{if(p.record){p.prepSyncMs+=performance.now()-start;p.prepSyncCalls++;}}});
  const create=window.createShipDestruction;
  window.createShipDestruction=(...args)=>{const object=create(...args),prepare=object.prepare;return {...object,prepare(...values){const start=performance.now();try{return prepare(...values);}finally{if(p.record){p.prepSyncMs+=performance.now()-start;p.prepSyncCalls++;}}}};};
  startNativeDevGame();
}"""

SETUP = r"""async ({saved,mode}) => {
  for(const timer of window.__stabilityTimers||[])clearInterval(timer);
  if(window.__stabilityOriginalWarp){window.vexedWarp=window.__stabilityOriginalWarp;delete window.__stabilityOriginalWarp;}
  const state=JSON.parse(saved);(window.nativeSaveStorage?nativeSaveStorage.write(JSON.parse(saved)):localStorage.setItem('broken-mirror-native-save',saved));resumeNativeGame();
  const s=nativeNpcDev.getState(),origin=vexedSolFlight.shipPosition(s);
  window.__stabilityTimers=[];window.__stabilityMode=mode;
  if(mode==='crowdedCombat'){
    s.shields=1000000;s.hull=1000000;
    const ships=s.civilianTraffic.ships.filter(ship=>ship.hull>0).slice(0,12);
    ships.forEach((ship,index)=>{
      nativeNpcLives?.interrupt(s,ship,'benchmark fixture');ship.scriptedDemo='benchmark';
      const angle=index*Math.PI/6,radius=180+(index%3)*35;
      Object.assign(ship,{system:s.system,x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius,
        phase:'docked',timer:1e6,heading:angle+Math.PI,speed:0});
      nativeNpcLives?.refreshLocation(s,ship);
      nativeCivilianTraffic.hit(s,ship.id,1,{sourceId:'player',from:origin});
    });
  }else if(mode==='miningDebris'){
    const rock=nativeSolAsteroids.placements.find(rock=>rock.demo)||nativeSolAsteroids.placements[0];
    s.system=1;s.localBody=3;const before=vexedSolFlight.shipPosition(s);s.x+=rock.x-180-before.x;s.y+=rock.y-before.y;s.miningTool=true;
    nativeCivilianTraffic.startMiningDemo(s,{force:true,theft:false});
    if(!s.civilianTraffic.ships.some(ship=>ship.phase==='mining'&&ship.miningRockSlot===rock.slotId))throw Error('Benchmark mining command failed');
    const gone=new Set([...(s.minedAsteroids||[]),...(s.destroyedAsteroids||[])]);
    const nearby=nativeSolAsteroids.placements.filter(other=>other.slotId!==rock.slotId&&Math.hypot(other.x-rock.x,other.y-rock.y)<850&&!gone.has(other.slotId));
    let index=0;__stabilityTimers.push(setInterval(()=>{const next=nearby[index++];if(next)nativeAsteroidCombat.destroy(s,next);},1800));
  }else if(mode==='warp'){
    const warp=window.vexedWarp,start=nativeSimulation.seconds(s),art=await vexedFlightAssets.loadShip(s.shipType,s.hull);
    window.__stabilityOriginalWarp=warp;
    window.vexedWarp={...warp,get flightEffect(){const elapsed=nativeSimulation.seconds(s)-start,phase=(elapsed%8)/8;
      return {kind:phase<.5?'departure':'arrival',shipX:300,shipY:225,angle:s.angle+Math.PI/2,
        squeezeX:.78+.22*Math.cos(phase*Math.PI*2),alpha:.25+.75*Math.abs(Math.cos(phase*Math.PI*2)),speed:1200,
        cameraX:0,cameraY:0,ring:{x:300,y:225,alpha:.5,scale:1+phase}};},flightShip:art};
  }else if(mode==='devMap')nativeNpcDev.showMap();
  return {population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1};
}"""

DETAIL_DIAGNOSTIC = r"""() => {
  const state=nativeNpcDev.getState(),observer=state.system===1?vexedSolFlight.shipPosition(state):state,radius=state.civilianTraffic.life.config.detailedRadius;
  const rows=nativeShipSystems.inspectAll(state),categories={};
  for(const row of rows){
    const entity=row.entity||row,category=row.category,system=row.system??entity.system??(category==='tug'?1:state.system);
    const eligible=window.nativeShipDetail?nativeShipDetail.isDetailed(state,row,{category,pose:{x:row.x,y:row.y}}):
      !state.landed&&system===state.system&&entity.hull>0&&!row.journey&&!entity.journey&&!['warp','arriving','disabled','destroyed'].includes(entity.phase)&&Number.isFinite(row.x)&&Number.isFinite(row.y)&&Math.hypot(row.x-observer.x,row.y-observer.y)<=radius;
    const entry=categories[category]??={registered:0,eligible:0,tactical:0};entry.registered++;if(eligible)entry.eligible++;
    if(eligible&&(entity.disputeId||entity.retaliationId||entity.phase==='fighting'))entry.tactical++;
  }
  return {kind:'Representative untimed snapshot; not a peak of the 20-second windows',
    simulationSeconds:nativeSimulation.seconds(state),system:state.system,radius,population:rows.length,categories,
    totalEligible:Object.values(categories).reduce((n,row)=>n+row.eligible,0),tacticalCalls:{...__stability.tactical}};
}"""

SNAPSHOT = r"""() => {
  const s=nativeNpcDev.getState(),p=__stability,lives=window.nativeNpcLives?.metrics?.(s)||{},sol=s.solEconomy.lifeMetrics||{};
  return {population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,
    civilians:s.civilianTraffic.ships.length,tugs:s.solEconomy.freighters.length,simulationSeconds:nativeSimulation.seconds(s),
    lives,sol,artworkPreparationCalls:p.prepared,artworkDraws:p.artworkDraws,pixelReads:p.pixelReads,pixelReadMs:p.pixelReadMs,
    preparationSynchronousMs:p.prepSyncMs,preparationSynchronousCalls:p.prepSyncCalls,
    damageArtwork:nativeShipEffects.metrics?.()||null,preparationQueue:window.nativeDamageArtPreparation?.snapshot?.()||null,
    spriteCache:window.nativeShipSpriteCache?.snapshot?.()||null,heap:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null,
    decodedAssets:window.vexedFlightAssets?.cacheSnapshot?.()||null,
    tactical:{...p.tactical},frameBudget:window.nativeSimulationFrame?.snapshot?.(s)||null,frameDiagnostics:window.nativeSimulationMetrics?.snapshot?.()||null};
}"""

PREP_PROBE = r"""async () => {
  const p=__stability;const types=[35,36,64],results=[];
  for(const type of types){
    const s=nativeNpcDev.getState(),ship=s.civilianTraffic.ships.find(ship=>ship.id===2),observer=s.system===1?vexedSolFlight.shipPosition(s):s;
    nativeNpcLives.interrupt(s,ship,'controlled cold encounter benchmark');
    const definition=nativeShipDefinitions.get(type,'civilian');
    Object.assign(ship,{shipType:type,system:s.system,x:observer.x+130,y:observer.y-65,heading:.35,speed:0,hull:definition.hull,
      shields:definition.shields,phase:'docked',timer:1000000,scriptedDemo:'cold-art-benchmark'});
    nativeNpcLives.refreshLocation(s,ship);
    window.nativeDamageArtPreparation?.resetMetrics?.();
    p.record=true;p.longTasks=[];p.frames=[];const start=performance.now(),old=p.prepSyncMs;
    Object.assign(p,{probeActor:ship,probeStarted:start,probePaints:0,probeFirstVisibleMs:null,probeOptionalReady:false,visibleBeforeOptional:0});
    const promise=nativeShipEffects.prepare(type,'civilian'),same=nativeShipEffects.prepare(type,'civilian');
    promise.then(()=>p.probeOptionalReady=true);
    const beforeComplete=nativeShipEffects.ready(type,'civilian');
    await promise;await same;
    const elapsed=performance.now()-start,ready=nativeShipEffects.ready(type,'civilian');
    const warmStart=performance.now();await nativeShipEffects.prepare(type,'civilian');
    const warmMs=performance.now()-warmStart;await new Promise(resolve=>setTimeout(resolve,Math.max(150,5000-(performance.now()-start))));
    const deadline=performance.now()+5000;while(!p.probePaints){if(performance.now()>deadline)throw Error('Cold nearby actor was not actually drawn');await new Promise(resolve=>setTimeout(resolve,16));}
    results.push({type,elapsedMs:elapsed,synchronousPreparationMs:p.prepSyncMs-old,warmMs,
      encounter:{category:'civilian',id:ship.id,population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,
        firstVisibleMs:p.probeFirstVisibleMs,artworkDraws:p.probePaints,drawsBeforeOptionalReady:p.visibleBeforeOptional,minimumWindowMs:5000,observationMs:performance.now()-start},
      deduplicated:promise===same,ready,beforeComplete,longTasks:p.longTasks.slice(),frameSamples:p.frames.slice(),metrics:nativeShipEffects.metrics?.()||null,
      queue:window.nativeDamageArtPreparation?.snapshot?.()||null});
  }
  p.record=false;return results;
}"""

FUNCTIONAL = r"""async () => {
  if(!window.nativeDamageArtPreparation)return {supported:false};
  // Do not put unrelated live-fleet loads behind this fixture's optional gate.
  // The map keeps simulation alive without admitting new ship artwork.
  nativeNpcDev.showMap();
  const settleDeadline=performance.now()+45000;
  while(nativeShipEffects.metrics().pending||nativeShipEffects.metrics().preparation.pending){
    if(performance.now()>settleDeadline)throw Error('Background artwork did not settle before the cold-art fixture');
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  const fragmentApi=showcaseStageFragments,createDestruction=createShipDestruction,simulationBefore=nativeSimulation,impactsBefore=nativeEnvironmentalImpacts;
  let release;const optionalGate=new Promise(resolve=>release=resolve);
  window.showcaseStageFragments={...fragmentApi,async prepareAsync(...args){const fragments=await fragmentApi.prepareAsync(...args);await optionalGate;return fragments;}};
  window.createShipDestruction=(...args)=>{const destruction=createDestruction(...args);return {...destruction,async prepareAsync(...values){await destruction.prepareAsync(...values);await optionalGate;}};};
  try{
  const check=(value,label)=>{if(!value)throw Error(label);},type=37,definition=nativeShipDefinitions.get(type,'player');
  const state={system:2,shipSimulation:{version:1,seconds:10}},entity={id:'cold-art-regression',shipType:type,system:2,x:140,y:130,
    angle:0,heading:0,hull:definition.hull,shields:0,phase:'cruise'};
  const descriptor=()=>nativeShipDefinitions.describe(state,entity,{category:'player'});
  let finished=false;const promise=nativeShipEffects.prepare(type,'player');promise.then(()=>finished=true);
  check(promise===nativeShipEffects.prepare(type,'player'),'Cold optional artwork was not deduplicated');
  const deadline=performance.now()+30000;
  while(!nativeShipEffects.ready(type,'player')){check(performance.now()<deadline,'Base ship preparation timed out');await new Promise(resolve=>setTimeout(resolve,4));}
  const baseBeforeOptional=!finished;check(baseBeforeOptional,'Base art waited for all optional damage textures');
  const canvas=document.createElement('canvas');canvas.width=300;canvas.height=260;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  nativeShipEffects.paintShip(ctx,descriptor(),{ship:{x:0,y:0},cx:0,cy:0});
  const pixels=ctx.getImageData(0,0,300,260).data;let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])visible++;
  check(visible>20,'Nearby ship disappeared while optional textures prepared');
  const stage=nativeShipDamage.apply(descriptor(),definition.hull*.8,{kind:'beam'});
  nativeShipEffects.hit(state,descriptor(),stage,{kind:'beam'});
  check(entity.hull>0&&stage.afterStage>stage.beforeStage,'Pending stage hit failed authoritative health calculation');
  let explosions=0;const impacts=nativeEnvironmentalImpacts;
  window.nativeEnvironmentalImpacts={...impacts,explode:()=>explosions++};
  try{const destroyed=nativeShipDamage.apply(descriptor(),definition.hull*2,{kind:'torpedo'});nativeShipEffects.hit(state,descriptor(),destroyed,{kind:'torpedo'});}
  finally{window.nativeEnvironmentalImpacts=impacts;}
  check(entity.hull===0&&explosions===1,'Destruction while preparing did not resolve exactly once');
  release();await promise;
  const metrics=nativeShipEffects.metrics();check(metrics.preparation.failed===0,'Optional preparation task failed');
  const simulation=window.nativeSimulation;window.nativeSimulation={...simulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();
  const pending=nativeShipEffects.metrics().deferredStages;nativeShipEffects.advance(state,.1);
  check(nativeShipEffects.metrics().deferredStages===pending,'Pause advanced pending visual simulation');
  window.nativeSimulation=simulation;state.shipSimulation.seconds+=.1;
  window.nativeEnvironmentalImpacts={...impacts,debris:()=>{}};
  try{nativeShipEffects.advance(state,.1);}finally{window.nativeEnvironmentalImpacts=impacts;}
  check(entity.hull===0&&explosions===1,'Art completion reapplied health or explosion consequences');
  check(nativeShipEffects.metrics().deferredStages===0,'Prepared stage event did not drain during simulation');
  check(metrics.entries<=metrics.limits.entries&&metrics.cacheBytes<=metrics.limits.bytes,'Damage-art cache exceeded its limits');
  check(metrics.preparation.pending===0,'Artwork preparation left a scheduler backlog');
  nativeShipEffects.reset();return {supported:true,baseBeforeOptional,visiblePixels:visible,explosions,metrics};
  }finally{release();window.showcaseStageFragments=fragmentApi;window.createShipDestruction=createDestruction;window.nativeSimulation=simulationBefore;window.nativeEnvironmentalImpacts=impactsBefore;}
}"""

ARTWORK_PIXELS = r"""async () => {
  const catalog=await (await fetch('../flashtrek-broken-mirror/showcase-assets/catalog.json')).json(),results=[];
  const read=image=>{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);return g.getImageData(0,0,c.width,c.height).data;};
  const compare=(a,b)=>{const left=read(a),right=read(b);let differences=0,maxDifference=0;if(left.length!==right.length)throw Error('Artwork dimensions changed');for(let i=0;i<left.length;i++)if(left[i]!==right[i]){differences++;maxDifference=Math.max(maxDifference,Math.abs(left[i]-right[i]));}return {differences,maxDifference};};
  for(const type of [35,36,64])for(const stage of [0,1,2,3]){
    const profile=starterShips.get(type),reference=__referenceEarthProfiles.get(type);if(!profile?.alignAsync)continue;
    const file=catalog.ships.find(ship=>ship.id===type).frames[stage],image=new Image();
    image.src='../flashtrek-broken-mirror/showcase-assets/'+file;await image.decode();
    const aligned=await profile.alignAsync(image,stage),original=reference.align(image,stage);
    const alignedPixels=compare(aligned,original),unlitPixels=compare(await profile.effects.unlitFrameAsync(aligned),reference.effects.unlitFrame(original));
    // CPU readback canvases and the former GPU canvas can round premultiplied
    // 8-bit channels by one level. Geometry and every channel remain bounded.
    if(alignedPixels.maxDifference>1||unlitPixels.maxDifference>1)throw Error('Async preparation changed artwork '+JSON.stringify({type,stage,alignedPixels,unlitPixels}));
    results.push({type,stage,alignedPixels,unlitPixels,maxAllowedChannelDifference:1});
  }
  return results;
}"""


def reset_measurement(page):
    page.evaluate("""()=>{const p=__stability;p.frames=[];p.longTasks=[];p.prepared=0;p.artworkDraws=0;p.pixelReads=0;p.pixelReadMs=0;p.prepSyncMs=0;p.prepSyncCalls=0;p.tactical={steering:0,distantSteering:0,firingAttempts:0,distantFiringAttempts:0,sceneRequests:0};p.record=true;window.nativeSimulationMetrics?.reset?.();}""")


def summarize(samples):
    return {**legacy.summary(samples),'frameSpikesOver33ms':sum(frame['intervalMs']>33 for frame in samples)}


def pool_report(label, report):
    pooled={}
    for mode,entries in report['scenarios'].items():
        samples=[]
        for index in range(len(entries)):
            samples.extend(json.loads((OUTPUT/f'stability-{label}-{mode}-{index+1}-frames.json').read_text(encoding='utf-8')))
        tasks=[task for entry in entries for task in entry['longTasks']]
        counters={}
        for frame in samples:
            for key,value in (frame.get('frameBudget') or {}).get('counters',{}).items():counters[key]=counters.get(key,0)+value
        snapshots=[entry[point] for entry in entries for point in ['before','after']]
        pooled[mode]={**summarize(samples),'seconds':report['secondsPerWindow']*len(entries),
          'frameSpikesOver33ms':sum(frame['intervalMs']>33 for frame in samples),
          'longTasks':{'count':len(tasks),'totalMs':sum(task['duration'] for task in tasks),'maxMs':max((task['duration'] for task in tasks),default=0)},
          'repeatP95FrameMs':[entry['intervalMs']['p95'] for entry in entries],
          'repeatSimulationMs':[entry['simulationMs']['mean'] for entry in entries],
          'repeatRenderMs':[entry['renderMs']['mean'] for entry in entries],
          'frameCounters':counters,'untimedTacticalDiagnostics':[entry.get('untimedTacticalDiagnostic') for entry in entries],
          'maximumObservedDetailedShips':max((snapshot.get('frameDiagnostics',{}).get('detailed',0) for snapshot in snapshots),default=0),
          'maximumObservedSchedulerBacklog':max((snapshot.get('lives',{}).get('backlog',0) for snapshot in snapshots),default=0),
          'maximumObservedRgbaCacheBytes':{
            'damageArt':max((snapshot['damageArtwork']['cacheBytes'] for snapshot in snapshots if snapshot.get('damageArtwork')),default=None),
            'sprite':max((snapshot['spriteCache']['bytes'] for snapshot in snapshots if snapshot.get('spriteCache')),default=None),
            'decodedAssets':max((snapshot['decodedAssets']['totalOwnedByteEstimate'] for snapshot in snapshots if snapshot.get('decodedAssets')),default=None)},
          'maximumObservedJsHeapBytes':max(((snapshot.get('heap') or {}).get('usedJSHeapSize',0) for snapshot in snapshots),default=0)}
    report['pooled']=pooled
    return report


def compare_reports(before, after):
    for key in ['initialSaveSha256','viewport','browserVersion']:
        assert before[key]==after[key],f'Comparison changed {key}'
    comparison={'sameInitialSaveSha256':after['initialSaveSha256'],'viewport':after['viewport'],
        'browserVersion':after['browserVersion'],'beforeRevision':before['revision'],'afterRevision':after['revision'],'scenarios':{}}
    for mode,current in after['pooled'].items():
        previous=before['pooled'][mode]
        assert before['scenarios'][mode][0]['before']['population']==after['scenarios'][mode][0]['before']['population']
        comparison['scenarios'][mode]={field:{'before':previous[field],'after':current[field]} for field in [
            'simulationMs','renderMs','intervalMs','frameSpikesOver33ms','frameSpikesOver50ms','longTasks',
            'repeatP95FrameMs','repeatSimulationMs','repeatRenderMs','maximumObservedDetailedShips','maximumObservedSchedulerBacklog',
            'maximumObservedRgbaCacheBytes','maximumObservedJsHeapBytes']}
        comparison['scenarios'][mode].update(population=after['scenarios'][mode][0]['before']['population'],
            afterFrameCounters=current['frameCounters'],afterUntimedTacticalDiagnostics=current['untimedTacticalDiagnostics'])
    comparison['coldWarmArtwork']={'before':before['coldWarmArtwork'],'after':after['coldWarmArtwork']}
    return comparison


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision')
    parser.add_argument('--label',default='after')
    parser.add_argument('--measure',action='store_true')
    parser.add_argument('--seconds',type=float,default=20)
    parser.add_argument('--repetitions',type=int,default=3)
    parser.add_argument('--scenarios',default='flight,crowdedCombat,miningDebris,warp,devMap')
    parser.add_argument('--base-url')
    parser.add_argument('--diagnostic-only',action='store_true')
    args=parser.parse_args();OUTPUT.mkdir(exist_ok=True)
    legacy.SnapshotHandler.revision=args.revision
    server=None
    if args.base_url:base=args.base_url.rstrip('/')
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(legacy.SnapshotHandler,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
    errors,failed=[],[]
    report={'label':args.label,'revision':args.revision or 'working tree','viewport':{'width':1280,'height':850},
      'secondsPerWindow':args.seconds,'repetitions':args.repetitions,'platform':platform.platform(),'scenarios':{},
      'measurementScopes':{'synchronousPreparationMs':'Synchronous fragment and wreck preparation only; excludes alignment, unlighting and decode.',
        'cooperativeQueueWorkMs':'All cooperative pixel work, including alignment, unlighting, fragments and wrecks; excludes decode and queued waiting.',
        'cacheBytes':'Owned RGBA surface estimates, per owner. References overlap; these are not total browser or GPU memory.',
        'untimedTacticalDiagnostic':'Additional steering/fire/scene wrappers run for one second after each timed sample, so their distance checks do not inflate timing.'}}
    try:
        with sync_playwright() as playwright:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=playwright.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            report['browserVersion']=browser.version;report['channel']=channel
            def open_page():
                page=browser.new_page(viewport=report['viewport']);page.add_init_script('('+INSTRUMENT+')()')
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('response',lambda response:failed.append(response.url) if response.status>=400 else None)
                page.goto(base+'/html-games/broken-mirror-port/index.html')
                page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
                page.evaluate(INSTALL)
                page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length',timeout=120000)
                page.wait_for_function('()=>nativeCivilianTraffic.effectsReady() && !(nativeShipEffects.metrics?.().pending)',timeout=120000)
                page.wait_for_timeout(200)
                return page
            page=open_page()
            report['device']=page.evaluate('({hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,devicePixelRatio:devicePixelRatio,userAgent:navigator.userAgent})')
            fixture=OUTPUT/'npc-performance-initial-save.json'
            if not fixture.exists():fixture.write_text(page.evaluate('JSON.stringify(nativeNpcDev.getState())'),encoding='utf-8')
            saved=fixture.read_text(encoding='utf-8');report['initialSaveSha256']=hashlib.sha256(fixture.read_bytes()).hexdigest()
            if args.diagnostic_only:
                page.evaluate('__stabilityInstallTacticalDiagnostics()');report['representativeDetailDiagnostics']={}
                for mode in args.scenarios.split(','):
                    page.evaluate('(mode)=>{window.__stabilityTracePixelReads=mode==="miningDebris";__stability.pixelReadStacks=[];}',mode)
                    page.evaluate(SETUP,{'saved':saved,'mode':mode})
                    page.evaluate('()=>{__stability.tactical={steering:0,distantSteering:0,firingAttempts:0,distantFiringAttempts:0,sceneRequests:0};}')
                    seconds=10 if mode=='miningDebris' else 1
                    page.wait_for_timeout(seconds*1000)
                    report['representativeDetailDiagnostics'][mode]={**page.evaluate(DETAIL_DIAGNOSTIC),'observationSeconds':seconds,
                        'untimedPixelReadOwners':page.evaluate('__stability.pixelReadStacks')}
                report.update(passed=not errors and not failed,javascriptErrors=errors,failedResponses=failed)
                browser.close();(OUTPUT/f'stability-{args.label}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
                assert not errors and not failed,(errors,failed)
                print(json.dumps(report['representativeDetailDiagnostics'],indent=2));return
            page.evaluate(SETUP,{'saved':saved,'mode':'flight'})
            page.wait_for_timeout(2000)
            report['coldWarmArtwork']=page.evaluate(PREP_PROBE)
            for row in report['coldWarmArtwork']:
                frames=row.pop('frameSamples')
                row['frameStatistics']=summarize(frames)
                (OUTPUT/f'stability-{args.label}-cold-{row["type"]}-frames.json').write_text(json.dumps(frames),encoding='utf-8')
            report['functional']=page.evaluate(FUNCTIONAL)
            if not args.revision:assert report['functional']['supported'],'Cooperative damage-art preparation is missing'
            (OUTPUT/f'stability-{args.label}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            if not args.revision:
                page.evaluate('()=>{window.__activeEarthProfiles=starterShips;window.starterShips=new Map(starterShips);}')
                page.add_script_tag(path=str(ROOT/'tests/fixtures/reference-earth-preparation.js'))
                page.evaluate('()=>{window.__referenceEarthProfiles=starterShips;window.starterShips=window.__activeEarthProfiles;}')
                report['artworkPixelReference']=page.evaluate(ARTWORK_PIXELS)
                assert len(report['artworkPixelReference'])==12,report['artworkPixelReference']
            (OUTPUT/f'stability-{args.label}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            assert all(row['ready'] for row in report['coldWarmArtwork']),report['coldWarmArtwork']
            page.screenshot(path=str(OUTPUT/f'stability-{args.label}-cold-artwork.png'))
            page.close()
            if args.measure:
                for mode in args.scenarios.split(','):
                    report['scenarios'][mode]=[]
                    for repeat in range(args.repetitions):
                        page=open_page();population=page.evaluate(SETUP,{'saved':saved,'mode':mode})
                        initial_save=json.loads(saved)
                        medical_added=3 if page.evaluate('()=>!!window.nativeShipRepairs') and not initial_save.get('shipRepairs',{}).get('medicalFleetVersion') else 0
                        expected_population=len(initial_save['civilianTraffic']['ships'])+len(initial_save['solEconomy']['freighters'])+1+medical_added
                        assert population['population']==expected_population,population
                        page.wait_for_timeout(2000)
                        reset_measurement(page);before=page.evaluate(SNAPSHOT)
                        page.wait_for_timeout(args.seconds*1000)
                        page.evaluate('__stability.record=false')
                        after=page.evaluate(SNAPSHOT);samples=page.evaluate('__stability.frames');tasks=page.evaluate('__stability.longTasks')
                        page.evaluate('__stabilityInstallTacticalDiagnostics()');page.wait_for_timeout(1000)
                        tactical=page.evaluate('({...__stability.tactical})')
                        if mode=='devMap':
                            assert after['artworkPreparationCalls']==0 and after['artworkDraws']==0,after
                        if not args.revision:
                            assert tactical['distantSteering']==0 and tactical['distantFiringAttempts']==0,tactical
                        entry={**summarize(samples),'before':before,'after':after,'longTasks':tasks,
                            'longTaskTotalMs':sum(row['duration'] for row in tasks),'longTaskMaxMs':max((row['duration'] for row in tasks),default=0),
                            'untimedTacticalDiagnostic':{'seconds':1,**tactical}}
                        report['scenarios'][mode].append(entry)
                        (OUTPUT/f'stability-{args.label}-{mode}-{repeat+1}-frames.json').write_text(json.dumps(samples),encoding='utf-8')
                        if repeat==0:page.screenshot(path=str(OUTPUT/f'stability-{args.label}-{mode}.png'))
                        page.close();print(json.dumps({'scenario':mode,'repeat':repeat+1,'simulationMs':entry['simulationMs']['mean'],
                            'renderMs':entry['renderMs']['mean'],'intervalP95':entry['intervalMs']['p95'],'over50':entry['frameSpikesOver50ms']}),flush=True)
            report.update(passed=not errors and not failed,javascriptErrors=errors,failedResponses=failed)
            browser.close()
        if report['scenarios']:pool_report(args.label,report)
        (OUTPUT/f'stability-{args.label}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        before_file=OUTPUT/'stability-before.json'
        if args.measure and args.label in {'after','after-final'} and before_file.exists():
            comparison=compare_reports(json.loads(before_file.read_text(encoding='utf-8')),report)
            (OUTPUT/'stability-comparison.json').write_text(json.dumps(comparison,indent=2),encoding='utf-8')
        assert not errors,errors
        assert not failed,failed
        print(json.dumps({'passed':report['passed'],'label':args.label,'coldWarmArtwork':report['coldWarmArtwork'],'scenarios':list(report['scenarios'])},indent=2))
    finally:
        if server:server.shutdown()


if __name__=='__main__':main()
