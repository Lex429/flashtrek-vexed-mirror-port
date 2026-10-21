"""Supplementary fixed-fleet Canvas rendering workload; this is NOT gameplay FPS.

Run before and after sequentially with the same arguments and browser. Each row
submits every configured appearance through the existing shared drawShip/cache
interfaces. No NPCs, physics, firing, collisions or economic jobs are simulated.
Original-size ships can overlap; ascending actor index is their fixed draw order.
Cold loading is excluded and each measured window follows three seconds of warm
rendering. Raw frames and media stay under ignored test-results/render-capacity.
"""
import argparse
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import platform
import subprocess
import threading

from playwright.sync_api import sync_playwright, Error as PlaywrightError

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'render-capacity'

INSTALL=r'''()=>{
 const nativeRAF=window.requestAnimationFrame.bind(window),create=Document.prototype.createElement;
 window.__renderCapacity={nativeRAF,record:false,canvasAllocations:0,offscreenAllocations:0};
 // Admit the last active tail at the exact diagnostic gate edge, then leave
 // every game frame/service owner blocked for this isolated browser fixture.
 window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();
 window.requestAnimationFrame=()=>0;
 Document.prototype.createElement=function(name,...args){
   if(__renderCapacity.record&&String(name).toLowerCase()==='canvas')__renderCapacity.canvasAllocations++;
   return create.call(this,name,...args);
 };
 if(window.OffscreenCanvas){const Native=OffscreenCanvas;window.OffscreenCanvas=new Proxy(Native,{construct(target,args){
   if(__renderCapacity.record)__renderCapacity.offscreenAllocations++;return Reflect.construct(target,args);
 }});}
 return {hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory??null,
   devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},userAgent:navigator.userAgent,
   scripts:[...document.scripts].map(script=>script.src).filter(Boolean)};
}'''

PREPARE=r'''async({seed,count})=>{
 const check=(value,message)=>{if(!value)throw Error(message)},cache=nativeShipSpriteCache,p=__renderCapacity;
 cache.setBackend?.('canvas');
 const started=performance.now(),assets=[];
 const catalog=await (await fetch('../flashtrek-broken-mirror/showcase-assets/catalog.json')).json();
 for(const type of [35,49,58,47,52,50])for(const stage of [0,2]){
   const definition=nativeShipDefinitions.get(type),asset=await vexedFlightAssets.loadShip(type,definition.hull*(stage===0?1:.4)),
     dimensions=nativeShipDefinitions.presentation(type);
   check(asset?.art&&asset.type===type&&asset.damageStage===stage,'Missing or mismatched original appearance '+type+'/'+stage);
   assets.push({asset,type,stage,width:dimensions.width,height:dimensions.height,
     artworkFile:'html-games/flashtrek-broken-mirror/showcase-assets/'+catalog.ships.find(ship=>ship.id===type).frames[stage]});
 }
 const pending=()=>!!nativeShipEffects.metrics().pending||!!window.nativeDamageArtPreparation?.snapshot?.().pending;
 while(pending()){
   if(performance.now()-started>180000)throw Error('Background artwork did not settle before the renderer-only warm-up');
   await new Promise(resolve=>setTimeout(resolve,20));
 }
 const canvas=document.createElement('canvas');canvas.id='renderer-capacity';canvas.width=1280;canvas.height=850;
 canvas.style.cssText='display:block;width:1280px;height:850px;background:#030811';
 document.documentElement.style.cssText='margin:0;padding:0;overflow:hidden';document.body.style.cssText='margin:0;padding:0;overflow:hidden';
 document.body.replaceChildren(canvas);p.canvas=canvas;p.ctx=canvas.getContext('2d');
 check(innerWidth===1280&&innerHeight===850&&devicePixelRatio===1,'Renderer fixture requires actual1280x850/DPR1');
 let randomSeed=seed>>>0;const random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};
 const raster=art=>{
   const rw=Math.max(1,Math.round(art.width*2)),rh=Math.max(1,Math.round(art.height*2)),pad=Math.ceil(Math.max(64,Math.max(rw,rh)*.35));
   return {radius:Math.hypot(art.width/2+pad*art.width/rw,art.height/2+pad*art.height/rh)+8,
     sourceRasterPixels:(rw+pad*2)*(rh+pad*2),presentationQuadPixels:(art.width+pad*2*art.width/rw)*(art.height+pad*2*art.height/rh)};
 };
 const radius=art=>raster(art).radius;
 const margin=Math.ceil(Math.max(...assets.map(radius)))+2,columns=Math.ceil(Math.sqrt(count*1280/850)),rows=Math.ceil(count/columns),actors=[];
 check(margin*2<850,'Original artwork bounds do not fit the configured viewport');
 for(let index=0;index<count;index++){
   const art=assets[index%assets.length],x=columns===1?640:margin+(index%columns)*(1280-margin*2)/(columns-1),
     y=rows===1?425:margin+Math.floor(index/columns)*(850-margin*2)/(rows-1),r=radius(art);
   check(x-r>=0&&x+r<=1280&&y-r>=0&&y+r<=850,'Rotated appearance/effect bounds leave viewport '+index);
   actors.push({...art,index,x,y,radius:r,heading:random()*Math.PI*2,turnRate:(.08+random()*.11)*(index%2?-1:1),owner:{rendererFixtureId:index}});
 }
 p.actors=actors;p.paint=function(animationMs){
   const ctx=p.ctx;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#030811';ctx.fillRect(0,0,1280,850);
   cache.beginFrame?.(ctx,{backend:'canvas'});let completed=0;
   for(const actor of actors){
     vexedFlightAssets.drawShip(ctx,actor.asset,actor.x,actor.y,actor.width,actor.heading+actor.turnRate*animationMs/1000,
       animationMs,{height:actor.height,owner:actor.owner,fullSurface:true,canvasOnly:true,lights:true,damage:true,
         effectRate:actor.stage===0?20:60,lightGain:2.8,lightBloom:2.5,light:{direction:.8,color:0xffdb9e}});
     completed++;
   }
   cache.endFrame?.(ctx);return completed;
 };
 p.simulationClock=()=>{const state=window.nativeNpcDev?.getState?.();return state?state.shipSimulation?.seconds??null:null;};
 p.area={hullRectanglePixels:actors.reduce((sum,actor)=>sum+actor.width*actor.height,0),
   sourceRasterPixels:actors.reduce((sum,actor)=>sum+raster(actor).sourceRasterPixels,0),
   presentationQuadPixels:actors.reduce((sum,actor)=>sum+raster(actor).presentationQuadPixels,0)};
 return {preparationWallMs:performance.now()-started,simulationClock:p.simulationClock(),columns,rows,margin,
   artworkFiles:assets.map(asset=>asset.artworkFile),perFrameAreaEstimate:p.area,
   appearances:assets.map(({type,stage,width,height,asset})=>({type,stage,width,height,artWidth:asset.width,artHeight:asset.height,effectRate:stage===0?20:60})),
   actors:actors.map(({asset,owner,...configuration})=>configuration),
   ordering:'Ascending actor index, source-over shared Canvas composition; original-size images/glows overlap, particularly at50/100 submissions. No depth/planet occlusion or hull-size reduction.'};
}'''

WINDOW=r'''async({seconds,warmupSeconds,run})=>{
 const p=__renderCapacity,cache=nativeShipSpriteCache,check=(value,message)=>{if(!value)throw Error(message)},raf=p.nativeRAF;
 const beforeClock=p.simulationClock();check(nativeSimulation.blocked(),'Gameplay owner was not blocked');
 cache.reset?.();p.record=false;
 let started=performance.now();
 while(performance.now()-started<warmupSeconds*1000){const timestamp=await new Promise(raf);p.paint(1350+timestamp-started);}
 // The unrecorded warm-up closes on its last display callback. Use the next
 // callback only to establish a measurement boundary, avoiding a partial first
 // interval relative to an arbitrary Python/CDP request time.
 let previous=await new Promise(raf),boundary=previous,frames=[],submissions=0;
 const snapshot=()=>cache.snapshot?.()||null,before=snapshot();
 p.canvasAllocations=p.offscreenAllocations=0;p.record=true;
 for(;;){
   const timestamp=await new Promise(raf),began=performance.now(),completed=p.paint(1350+warmupSeconds*1000+timestamp-boundary),drawMs=performance.now()-began;
   check(completed===p.actors.length,'Fixed renderer workload lost a requested submission');
   frames.push({intervalMs:timestamp-previous,drawMs,shipDrawCalls:completed,animationMs:1350+warmupSeconds*1000+timestamp-boundary});
   submissions+=completed;previous=timestamp;
   if(timestamp-boundary>=seconds*1000)break;
 }
 p.record=false;const after=snapshot(),afterClock=p.simulationClock();
 check(beforeClock===afterClock&&nativeSimulation.blocked(),'Renderer workload advanced the game simulation');
 const counters={};for(const [key,value]of Object.entries(after?.counters||{}))if(typeof value==='number')counters[key]=value-(before?.counters?.[key]||0);
 return {run,frames,elapsedMs:previous-boundary,completedShipDrawCalls:submissions,requestedShipDrawCalls:frames.length*p.actors.length,
   canvasFrameSubmissions:frames.length,compositorDeliveredFrames:null,simulationMs:0,simulationProgressSeconds:0,physicsSubsteps:0,acceptedShots:0,
   simulationClockBefore:beforeClock,simulationClockAfter:afterClock,canvasAllocations:p.canvasAllocations,offscreenAllocations:p.offscreenAllocations,
   estimatedSubmittedArea:Object.fromEntries(Object.entries(p.area).map(([key,value])=>[key,value*frames.length])),
   areaEstimateScope:'Unclipped full padded2x source/quad areas, summed per requested ship draw. These are submission/overdraw estimates, not measured processed/rasterized pixels or GPU transfers. Native cache presentation counters are reported separately when the checkout exposes them.',
   loaderAfter:window.vexedFlightAssets.cacheSnapshot?.()||null,profileOwnedLamps:window.nativeShipEffects.metrics?.().profileLamps||null,
   counters,cacheBefore:before,cacheAfter:after,
   measurement:'RAF callback intervals and shared Canvas submission time. The draw timer can include native/GPU blocking; independent compositor paints, actual rasterized/filter pixels, GC and worker-native allocations are not measured here.'};
}'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):
        pass


def sha(data):
    return hashlib.sha256(data).hexdigest()


def percentile(values,fraction):
    ordered=sorted(values)
    return ordered[min(len(ordered)-1,int((len(ordered)-1)*fraction))] if ordered else None


def stats(values):
    return {'mean':sum(values)/len(values) if values else None,'median':percentile(values,.5),
            'p95':percentile(values,.95),'p99':percentile(values,.99),'worst':max(values,default=None)}


def git(source,*arguments):
    result=subprocess.run(['git',*arguments],cwd=source,capture_output=True,text=True)
    return result.stdout.strip() if result.returncode==0 else None


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,default=ROOT)
    parser.add_argument('--label',required=True)
    parser.add_argument('--counts',default='12,25,50,100')
    parser.add_argument('--seconds',type=float,default=20)
    parser.add_argument('--windows',type=int,default=3)
    parser.add_argument('--warmup',type=float,default=3)
    parser.add_argument('--seed',type=int,default=4292026)
    args=parser.parse_args()
    counts=[int(value) for value in args.counts.split(',')]
    if not counts or any(count<1 or count>100 for count in counts):parser.error('Counts must be between1 and100')
    if args.seconds<=0 or args.windows<1 or args.warmup<3:parser.error('Use positive windows/seconds and at least3 seconds of warm-up')
    if Path(args.label).name!=args.label or args.label in ['.','..']:parser.error('Label must be a single filename component')
    source=args.source_root.resolve();OUTPUT.mkdir(parents=True,exist_ok=True)
    report={'label':args.label,'sourceRoot':str(source),'commit':git(source,'rev-parse','HEAD'),
        'uncommitted':git(source,'status','--porcelain=v1'),'harnessSha256':sha(Path(__file__).read_bytes()),
        'sourceHashes':{str(path.relative_to(source)).replace('\\','/'):sha(path.read_bytes())
            for folder in ['html-games/broken-mirror-port','html-games/flashtrek-broken-mirror']
            for path in sorted({*(source/folder).rglob('*.js'),*(source/folder).glob('*.html')})},
        'sourceHashScope':'All recursive JavaScript and top-level entry/showcase HTML in active/shared source directories; original selected frame PNGs are signed separately. Includes dynamically loaded profile scripts independent of document.scripts timing.',
        'purpose':'FIXED submitted mixed-fleet RENDERER ONLY. This cannot establish gameplay FPS, combat capacity or physical120-Hz delivery.',
        'protocol':{'counts':counts,'seconds':args.seconds,'windows':args.windows,'warmupSeconds':args.warmup,'seed':args.seed,
            'viewport':{'width':1280,'height':850},'dpr':1,'headless':True,'backend':'Production native Canvas fullSurface only',
            'coldPreparationExcluded':True,'freshBrowserContextPerCount':True,'gameplayFrozen':True},
        'platform':{'system':platform.platform(),'processor':platform.processor()},'rows':[],'incomplete':True,
        'errors':[],'failedResponses':[],'captureErrors':[]}
    report_path=OUTPUT/f'{args.label}.json'
    def checkpoint():report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(source)))
    threading.Thread(target=server.serve_forever,daemon=True).start();checkpoint()
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge');report['browserChannel']=channel
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            report['browserVersion']=browser.version;report['graphics']=browser.new_browser_cdp_session().send('SystemInfo.getInfo')
            for count in counts:
                context=browser.new_context(viewport={'width':1280,'height':850},device_scale_factor=1)
                page=context.new_page();page.set_default_timeout(180000)
                page.on('pageerror',lambda error:report['errors'].append(str(error)))
                page.on('response',lambda response:report['failedResponses'].append({'url':response.url,'status':response.status}) if response.status>=400 else None)
                page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
                page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
                device=page.evaluate(INSTALL);report.setdefault('device',device)
                page.wait_for_timeout(100) # allow the one already-queued game RAF to exit
                configuration=page.evaluate(PREPARE,{'seed':args.seed,'count':count})
                report.setdefault('servedScriptURLs',{})[str(count)]=page.evaluate('[...document.scripts].map(script=>script.src).filter(Boolean)')
                report.setdefault('artworkHashes',{}).update({path:sha((source/path).read_bytes()) for path in configuration['artworkFiles']})
                configuration['sha256']=sha(json.dumps(configuration['actors'],sort_keys=True,separators=(',',':')).encode('utf8'))
                for run in range(1,args.windows+1):
                    sample=page.evaluate(WINDOW,{'seconds':args.seconds,'warmupSeconds':args.warmup,'run':run})
                    frames=sample.pop('frames');intervals=[frame['intervalMs'] for frame in frames]
                    frame_path=OUTPUT/f'{args.label}-{count}-{run}-frames.json';frame_path.write_text(json.dumps(frames,separators=(',',':')),encoding='utf8')
                    row={'count':count,'configuration':configuration,**sample,'frameFile':frame_path.name,
                        'averageRendererRafFps':len(frames)*1000/sample['elapsedMs'],'intervalMs':stats(intervals),
                        'drawMs':stats([frame['drawMs'] for frame in frames]),'above33ms':sum(value>33.34 for value in intervals),
                        'above50ms':sum(value>50 for value in intervals),'above100ms':sum(value>100 for value in intervals),
                        'mediaReady':False}
                    assert row['completedShipDrawCalls']==row['requestedShipDrawCalls']==len(frames)*count
                    report['rows'].append(row);checkpoint()
                    # No renderer or gameplay loop submits work after WINDOW.
                    # Let the last submitted canvas reach the capture pipeline.
                    page.evaluate('()=>new Promise(resolve=>__renderCapacity.nativeRAF(()=>__renderCapacity.nativeRAF(resolve)))')
                    image=OUTPUT/f'{args.label}-{count}-{run}.png'
                    try:page.locator('#renderer-capacity').screenshot(path=str(image),timeout=30000);row.update(mediaReady=True,screenshot=image.name)
                    except PlaywrightError as error:report['captureErrors'].append({'count':count,'run':run,'error':str(error)})
                    checkpoint()
                    if report['errors'] or report['failedResponses']:raise AssertionError({'pageErrors':report['errors'],'failedResponses':report['failedResponses']})
                    print(json.dumps({'count':count,'run':run,'rendererOnly':True,'rafFps':row['averageRendererRafFps'],
                        'p95':row['intervalMs']['p95'],'p99':row['intervalMs']['p99'],'submissions':row['completedShipDrawCalls'],
                        'simulationProgressSeconds':0}),flush=True)
                context.close()
            browser.close();report.update(incomplete=False,passed=True);checkpoint()
    except BaseException as error:
        report.update(passed=False,failure=repr(error));checkpoint();raise
    finally:server.shutdown()


if __name__=='__main__':main()
