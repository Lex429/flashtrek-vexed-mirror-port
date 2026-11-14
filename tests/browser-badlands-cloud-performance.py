"""Actual Badlands flight, with cloud CPU cost and fluid latency kept separate.

Use frozen source roots for comparisons. Diagnostic windows are not FPS gates.
Includes production weather when present, with no added crews, altered physics
clocks or reduced cloud detail.
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
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root', type=Path, default=ROOT)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--seconds', type=float, default=15)
parser.add_argument('--route', choices=['center', 'seam', 'edge'], default='seam')
parser.add_argument('--diagnostic', action='store_true')
parser.add_argument('--profile', action='store_true')
parser.add_argument('--worker-profile', action='store_true', help='V8 profile of the first retained cloud worker; diagnostic only')
parser.add_argument('--pipeline', action='store_true', help='Async GPU timers and worker round trips; diagnostic only')
parser.add_argument('--steering', choices=['straight', 'circle'], default='straight')
parser.add_argument('--crowd', type=int, default=0, help='Move existing saved crews onto shared-controller crossing routes')
parser.add_argument('--component-costs', action='store_true', help='Coarse main-thread component timers; diagnostic only')
parser.add_argument('--diagnostic-omit', choices=['none','fog-drawing','fog-all','npc-drawing','radar','art-preparation'], default='none', help='Cost-isolation ceiling only; omitted variants are not valid gameplay/visual candidates')
parser.add_argument('--warmup-seconds', type=float, default=1.5)
parser.add_argument('--warmup-simulation-seconds', type=float, default=0, help='Also advance the same amount of real simulation time before steady-flight measurement')
parser.add_argument('--settle-preparation', action='store_true', help='Wait for normal artwork preparation to finish; records a warm-flight case without pausing the queue')
parser.add_argument('--headed', action='store_true', help='Visible fixed viewport; not native-fullscreen display qualification')
parser.add_argument('--ship-renderer', choices=['canvas','webgl2','auto'], help='Compare an existing renderer backend without changing production settings')
args = parser.parse_args()
SITE = args.source_root.resolve()
OUT = args.output.resolve()
OUT.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location('cloud_stability', ROOT/'tests/browser-stability.py')
stability = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stability)
support_spec=importlib.util.spec_from_file_location('cloud_support',ROOT/'tests/nebula-browser-support.py')
support=importlib.util.module_from_spec(support_spec);support_spec.loader.exec_module(support)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def translate_path(self, path):
        target = Path(super().translate_path(path))
        if not target.exists():
            relative = target.resolve().relative_to(SITE)
            fallback = ROOT/relative
            if target.suffix not in {'.js', '.html', '.css'} and fallback.is_file():
                return str(fallback)
        return str(target)


def hashes():
    return {str(p.relative_to(SITE)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
            for folder in ['broken-mirror-port', 'flashtrek-broken-mirror']
            for p in (SITE/'html-games'/folder).rglob('*') if p.suffix in {'.js', '.html'}}


PROBE = r'''diagnostic=>{
 const p=window.__cloud={record:false,phase:'warmup',costs:[],samples:[],workerPosts:0,publications:0};
 const Native=window.Worker;window.Worker=new Proxy(Native,{construct(target,args){const w=Reflect.construct(target,args);
   if(String(args[0]).includes('nebula-material-worker')){const post=w.postMessage.bind(w);w.postMessage=(...args)=>{if(p.record)p.workerPosts++;return post(...args);};w.addEventListener('message',e=>{if(p.record&&e.data.kind==='updated')p.publications++;});}return w;}});
 if(diagnostic)for(const [name,methods] of [['nativeGalaxyFog',['frame','paint']],['nativeNebulaGas',['render']],['nativeNebulaMaterial',['renderPair','endBatch','createRuntimeField']]]){
   const api=window[name],descriptors=Object.getOwnPropertyDescriptors(api);for(const method of methods){const fn=api[method];descriptors[method]={...descriptors[method],value:function(...args){const start=performance.now();try{return fn.apply(this,args);}finally{if(p.record)p.costs.push({kind:name+'.'+method,phase:p.phase,frame:__stability.frames.length,ms:performance.now()-start});}}};}window[name]=Object.defineProperties({},descriptors);
 }
 if(diagnostic)for(const method of ['texSubImage2D','texImage2D','drawArrays','blitFramebuffer']){
   const fn=WebGL2RenderingContext.prototype[method];WebGL2RenderingContext.prototype[method]=function(...args){const start=performance.now();try{return fn.apply(this,args);}finally{if(p.record&&this.canvas.dataset.nebulaMaterial)p.costs.push({kind:'materialGL.'+method,phase:p.phase,ms:performance.now()-start});}};
 }
}'''
PIPELINE = r'''()=>{
 const p=window.__cloudPipeline={record:false,gpu:[],workers:[],copies:[],coverageSurfaces:[],pending:[],contexts:[],programs:new WeakMap(),shaders:new WeakMap(),current:new WeakMap(),extensions:new WeakMap(),disjoint:0,skipped:0,nextWorker:0};
 const getContext=HTMLCanvasElement.prototype.getContext,seenCoverage=new WeakSet();HTMLCanvasElement.prototype.getContext=function(kind,...args){
   if(p.record&&kind==='2d'&&this.dataset.nebulaCoverage&&!seenCoverage.has(this)){seenCoverage.add(this);p.coverageSurfaces.push({at:performance.now(),width:this.width,height:this.height});}
   return getContext.call(this,kind,...args);
 };
 const proto=WebGL2RenderingContext.prototype;
 const shaderSource=proto.shaderSource;proto.shaderSource=function(shader,source){p.shaders.set(shader,source);return shaderSource.call(this,shader,source);};
 const link=proto.linkProgram;proto.linkProgram=function(program){const code=this.getAttachedShaders(program).map(shader=>p.shaders.get(shader)||'').join('\n');
   p.programs.set(program,code.includes('u_wakeCount')?'gas':code.includes('u_density')?'material':code.includes('out uint sequence')?'sweep':'other');return link.call(this,program);};
 const use=proto.useProgram;proto.useProgram=function(program){p.current.set(this,p.programs.get(program)||'other');return use.call(this,program);};
 function timer(gl,kind,call){
   if(!p.record||!gl.canvas.dataset?.nebulaMaterial&&!gl.canvas.dataset?.nebulaGas)return call();
   let entry=p.extensions.get(gl);
   if(!entry){const debug=gl.getExtension('WEBGL_debug_renderer_info'),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');entry={ext,id:p.contexts.length};p.extensions.set(gl,entry);
     p.contexts.push({id:entry.id,canvas:gl.canvas.dataset.nebulaMaterial?'material':'gas',timers:!!ext,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)});}
   if(!entry.ext||p.pending.length>=256){p.skipped++;return call();}
   const {ext,id}=entry,q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
   try{return call();}finally{gl.endQuery(ext.TIME_ELAPSED_EXT);p.pending.push({gl,ext,q,kind,id,at:performance.now(),frame:__stability.frames.length});}
 }
 for(const method of ['drawArrays','blitFramebuffer']){const fn=proto[method];proto[method]=function(...args){return timer(this,method==='drawArrays'?p.current.get(this)||'other':'blit',()=>fn.apply(this,args));};}
 const copy=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
   if(!p.record||!source?.dataset?.nebulaMaterial&&!source?.dataset?.nebulaGas)return copy.call(this,source,...args);
   const start=performance.now();try{return copy.call(this,source,...args);}finally{p.copies.push({at:start,ms:performance.now()-start,frame:__stability.frames.length,kind:source.dataset.nebulaMaterial?'material':'gas'});}
 };
 const Native=window.Worker;window.Worker=new Proxy(Native,{construct(target,args){const w=Reflect.construct(target,args);
   if(String(args[0]).includes('nebula-material-worker')){
     const id=++p.nextWorker,post=w.postMessage.bind(w);let flight=null,lastCpu=0,lastPack=0;
     w.postMessage=function(m,...rest){if(m.kind==='advance')flight={at:performance.now(),sequence:m.commands.at(-1).sequence,dt:m.commands.reduce((n,c)=>n+c.dt,0),commands:m.commands.length};return post(m,...rest);};
     w.addEventListener('message',e=>{const m=e.data;if(m.kind!=='updated')return;const now=performance.now(),cpu=m.metrics.workerCpuMs||0,pack=m.metrics.workerPackMs||0;
       if(p.record){const bytes=[m.frame,m.checkpoint].filter(Boolean).reduce((n,part)=>n+['density','rate','u','v','swept','solid'].reduce((sum,key)=>sum+(part[key]?.byteLength||0),0),0);
         p.workers.push({id,at:now,sequence:m.sequence,complete:m.complete,roundTripMs:flight?now-flight.at:null,commands:flight?.commands||0,dt:flight?.dt||0,cpuMs:cpu-lastCpu,packMs:pack-lastPack,bytes,actors:m.metrics.actorCount,activeTiles:m.metrics.activeTiles,clock:m.metrics.clock,flowDebt:m.metrics.pending,vortexSteps:m.metrics.vortexSteps});}
       lastCpu=cpu;lastPack=pack;if(m.complete&&flight&&m.sequence>=flight.sequence)flight=null;
     });
   }return w;}});
 function poll(){for(let i=p.pending.length-1;i>=0;i--){const item=p.pending[i],{gl,ext,q}=item;
   if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);if(disjoint)p.disjoint++;else p.gpu.push({kind:item.kind,id:item.id,at:item.at,frame:item.frame,ms:gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6});gl.deleteQuery(q);p.pending.splice(i,1);}}
   requestAnimationFrame(poll);
 }requestAnimationFrame(poll);
}'''
COMPONENTS = r'''()=>{
 const p=window.__cloudComponents={costs:{}};
 for(const [name,methods] of [
   ['nativeCivilianTraffic',['advance','paint']],['nativeNpcLives',['advance']],
   ['nativeRadar',['paint']],['nativeDevFog',['frame','paint']],['vexedSpace',['render']],
   ['nativeCombatShots',['paintAll']],['nativeShipEffects',['paintShip','paint']],['nativeRepairVisuals',['paint']],
   ['nativeFlightStatus',['update']],['nativeShipVitals',['update']],['vexedHud',['frame']],
   ['nativeCruiseControls',['update']],['nativeCollectablesView',['frame']],['nativeShipSystems',['query']]]){
   const api=window[name];if(!api)continue;const descriptors=Object.getOwnPropertyDescriptors(api);
   for(const method of methods){const fn=api[method];if(typeof fn!=='function')continue;
     descriptors[method]={...descriptors[method],value:function(...args){
       if(!__stability.record||name==='nativeShipEffects'&&method==='paintShip'&&args[1]?.category!=='player')return fn.apply(this,args);
       const start=performance.now();try{return fn.apply(this,args);}finally{const ms=performance.now()-start,key=name+'.'+method,row=p.costs[key]||={calls:0,totalMs:0,maxCallMs:0,frames:{}};
         row.calls++;row.totalMs+=ms;row.maxCallMs=Math.max(row.maxCallMs,ms);const frame=__stability.frames.length;row.frames[frame]=(row.frames[frame]||0)+ms;
       }
     }};
   }window[name]=Object.defineProperties({},descriptors);
 }
}'''
OMIT = r'''mode=>{
 function omit(name,methods){const api=window[name];if(!api)return;const descriptors=Object.getOwnPropertyDescriptors(api);for(const method of methods)if(typeof api[method]==='function')descriptors[method]={...descriptors[method],value(){}};window[name]=Object.defineProperties({},descriptors);}
 if(mode==='fog-drawing'||mode==='fog-all')omit('nativeDevFog',['paint']);
 if(mode==='fog-all')omit('nativeDevFog',['frame']);
 if(mode==='npc-drawing')omit('nativeCivilianTraffic',['paint']);
 if(mode==='radar')omit('nativeRadar',['paint']);
 if(mode==='art-preparation'){
   const api=window.nativeDamageArtPreparation;api.setPaused(true);const descriptors=Object.getOwnPropertyDescriptors(api);
   descriptors.setPaused={...descriptors.setPaused,value:()=>api.setPaused(true)};window.nativeDamageArtPreparation=Object.defineProperties({},descriptors);
 }
}'''
COUNTERS = r'''()=>({
 preparation:window.nativeDamageArtPreparation?.snapshot?.(),sprites:window.nativeShipSpriteCache?.snapshot?.(),
 hullBatch:window.nativeHullBatch?.snapshot?.(),lamps:window.nativeShipLampGPU?.snapshot?.(document.querySelector('#space')),
 flightLightingEnabled:window.nativeFlightLightingEnabled,lampGPUEnabled:window.nativeShipLampGPUEnabled,
 radar:window.nativeRadar?.snapshot?.(),pixelReads:__stability.pixelReads,pixelReadMs:__stability.pixelReadMs,
 simulationFrame:window.nativeSimulationFrame?.snapshot?.(nativeNpcDev.getState())
})'''
SETUP = r'''route=>{
 const s=nativeNpcDev.getState();nativeShipMotion.stop(s);nativeDevFog.setEnabled(false);nativeGalaxyFog.dispose();
 const target=route==='edge'?{x:63600,y:700}:route==='seam'?{x:1000,y:700}:{x:0,y:0};
 Object.assign(s,{system:73,x:target.x,y:target.y,localBody:0,localBodySystem:73,localNavTarget:0,angle:Math.PI,landed:false,phase:'flight',localCruise:null,arrivalApproach:null});delete s.journey;
 nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);
 return {population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,position:{...target},seconds:nativeSimulation.seconds(s)};
}'''
CROWD = r'''count=>{
 const s=nativeNpcDev.getState(),center=vexedSolFlight.shipPosition(s),chosen=s.civilianTraffic.ships.filter(e=>e.hull>0&&!e.journey&&e.shipType!==58&&!e.retaliationId&&!e.disputeId).slice(0,count);
 if(chosen.length!==count)throw Error('Insufficient existing saved crews for crowded flight');
 const access=nativeCivilianAccess;window.nativeCivilianAccess={...access,inhabited:(state,id)=>Number(id)===73||access.inhabited(state,id)};
 for(let i=0;i<chosen.length;i++){
   const e=chosen[i],row=Math.floor(i/5),column=i%5,rows=Math.ceil(count/5),dx=-480+column*240,dy=(row-(rows-1)/2)*Math.min(240,1400/Math.max(1,rows-1));
   nativeNpcLives.interrupt(s,e,'Badlands cloud crossing fixture');nativeShipMotion.stop(e);e.scriptedDemo='benchmark';
   Object.assign(e,{system:73,x:center.x+dx,y:center.y+dy,heading:i%2?Math.PI:0,phase:'cruise',goalX:center.x-dx,goalY:center.y-dy,timer:0});
   nativeNpcLives.refreshLocation(s,e);
 }
 const routes=chosen.map(e=>({ship:e,a:{x:e.x,y:e.y},b:{x:e.goalX,y:e.goalY},towardB:true,previous:{x:e.x,y:e.y},distance:0})),api=nativeCivilianTraffic,desc=Object.getOwnPropertyDescriptors(api);
 desc.advance={...desc.advance,value:function(state,dt){
   if(state===s)for(const route of routes){const e=route.ship;route.distance+=Math.hypot(e.x-route.previous.x,e.y-route.previous.y);route.previous={x:e.x,y:e.y};
     if(Math.hypot(e.x-e.goalX,e.y-e.goalY)<140){route.towardB=!route.towardB;const goal=route.towardB?route.b:route.a;e.goalX=goal.x;e.goalY=goal.y;}}
   return api.advance(state,dt);
 }};window.nativeCivilianTraffic=Object.defineProperties({},desc);nativeShipSystems.invalidate(s);
 window.__cloudCrowd=routes;
 return chosen.map(e=>({id:e.id,type:e.shipType,x:e.x,y:e.y,goalX:e.goalX,goalY:e.goalY}));
}'''
SAMPLE = r'''()=>{
 const s=nativeNpcDev.getState(),fog=nativeGalaxyFog.snapshot();return {at:performance.now(),focus:document.hasFocus(),visibility:document.visibilityState,heading:s.angle,position:vexedSolFlight.shipPosition(s),sim:nativeSimulation.seconds(s),active:fog.active,retained:fog.retained,
   weather:{production:!!window.nativeBadlandsWeather,lightning:fog.storm?.flashes?.length||0,heat:fog.fire?.fronts?.length||0},
   cores:fog.cores.map(c=>({id:c.id,visible:c.visible,ready:c.material?.workerReady,clock:c.material?.clock||0,workerClock:c.material?.workerClock||0,queue:c.material?.queuedSeconds||0,flowDebt:c.material?.pending||0,workerCpuMs:c.material?.workerCpuMs||0,workerPackMs:c.material?.workerPackMs||0,actors:c.material?.actorCount||0,vortexSteps:c.material?.vortexSteps||0,vortices:c.vortices?.length||0})),crew:window.__cloudCrowd?.map(r=>({id:r.ship.id,type:r.ship.shipType,x:r.ship.x,y:r.ship.y,phase:r.ship.phase,travel:r.distance,speed:Math.hypot(r.ship.vx||0,r.ship.vy||0)})),gas:nativeNebulaGas.metrics(),gpu:nativeNebulaMaterial.metrics()};
}'''
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(SITE)))
threading.Thread(target=server.serve_forever, daemon=True).start()
report = {'route': args.route, 'diagnostic': args.diagnostic, 'sourceHashes': hashes(), 'errors': [],
          'pipelineDiagnostic': args.pipeline, 'mainProfile':args.profile, 'workerProfile':args.worker_profile, 'steering': args.steering, 'crowd': args.crowd,
          'componentCosts':args.component_costs,'diagnosticOmission':args.diagnostic_omit,
          'headless':not args.headed,'shipRenderer':args.ship_renderer,
          'scope': 'Full game in Edge with a fixed viewport; CPU submission, fluid lag and RAF delivery are distinct. Omission variants only estimate costs and are not valid visual/gameplay candidates.'}
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser = p.chromium.launch(headless=not args.headed, **({'channel':channel} if channel else {}))
        page = browser.new_page(viewport={'width':1280, 'height':800}, reduced_motion='no-preference')
        page.set_default_navigation_timeout(120000)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.add_init_script('('+stability.INSTRUMENT+')()')
        if args.pipeline:
            page.add_init_script('('+PIPELINE+')()')
        page.add_init_script("Object.defineProperty(navigator,'getGamepads',{value:()=>[]});let cloudSeed=4292026;Math.random=()=>{cloudSeed=(Math.imul(cloudSeed,1664525)+1013904223)>>>0;return cloudSeed/4294967296;}")
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate(PROBE, args.diagnostic)
        page.evaluate(stability.INSTALL)
        saved=(ROOT/'test-results/intrepid-performance/initial-save.json').read_text()
        report['fixtureSha256']=hashlib.sha256(saved.encode()).hexdigest()
        page.evaluate(stability.SETUP, {'saved':saved, 'mode':'flight'})
        if args.component_costs: page.evaluate(COMPONENTS)
        page.evaluate('__cloud.record=true')
        report['setup']=page.evaluate(SETUP, args.route)
        if args.crowd: report['setup']['crew']=page.evaluate(CROWD, args.crowd)
        page.wait_for_function('()=>nativeGalaxyFog.materials().length>0&&nativeGalaxyFog.materials().every(m=>m.field.ready)', timeout=120000)
        warmup_target=report['setup']['seconds']+args.warmup_simulation_seconds
        page.wait_for_timeout(args.warmup_seconds*1000)
        if args.warmup_simulation_seconds:
            page.wait_for_function('target=>nativeSimulation.seconds(nativeNpcDev.getState())>=target',arg=warmup_target,timeout=180000)
        if args.settle_preparation:
            page.wait_for_function('()=>nativeDamageArtPreparation.snapshot().pending<=1&&!(nativeShipLampGPU.snapshot(document.querySelector("#space"))?.preparation?.pending)',timeout=180000)
        report['warmup']={'minimumWallSeconds':args.warmup_seconds,'minimumSimulationSeconds':args.warmup_simulation_seconds,'settledPreparation':args.settle_preparation}
        if args.ship_renderer: page.evaluate('backend=>nativeShipSpriteCache.setBackend(backend)',args.ship_renderer)
        page.evaluate(OMIT,args.diagnostic_omit)
        report['countersBefore']=page.evaluate(COUNTERS)
        report['start']=page.evaluate(SAMPLE)
        if args.headed: page.bring_to_front()
        page.locator('#space').focus()
        report['conditions']=page.evaluate('()=>({focus:document.hasFocus(),visible:document.visibilityState,width:innerWidth,height:innerHeight,dpr:devicePixelRatio})')
        report['powerBefore']=support.power_status()
        page.keyboard.down('w')
        if args.steering=='circle': page.keyboard.down('d')
        profiler=None
        worker_stop=None
        if args.profile:
            profiler=page.context.new_cdp_session(page)
            profiler.send('Profiler.enable');profiler.send('Profiler.start')
        if args.worker_profile:
            worker_stop=support.worker_profile(browser,page)
        page.evaluate('window.__cloudSample='+SAMPLE)
        page.evaluate('''()=>{__cloud.phase='flight';__cloud.started=performance.now();__cloud.startSim=nativeSimulation.seconds(nativeNpcDev.getState());__stability.frames=[];__stability.longTasks=[];__stability.record=true;if(window.__cloudPipeline)__cloudPipeline.record=true;__cloudTimer=setInterval(()=>__cloud.samples.push(__cloudSample()),100);}''')
        page.wait_for_timeout(args.seconds*1000)
        report.update(page.evaluate('''()=>{__cloud.record=false;__stability.record=false;if(window.__cloudPipeline)__cloudPipeline.record=false;clearInterval(__cloudTimer);return {wallSeconds:(performance.now()-__cloud.started)/1000,simulationSeconds:nativeSimulation.seconds(nativeNpcDev.getState())-__cloud.startSim,frames:__stability.frames,longTasks:__stability.longTasks,probe:__cloud};}'''))
        if worker_stop:
            (OUT/'worker.cpuprofile').write_text(json.dumps(worker_stop()),encoding='utf8')
        if args.pipeline:
            page.evaluate('__cloudPipeline.record=false')
            page.wait_for_timeout(100)
            report['pipeline']=page.evaluate('()=>{const p=__cloudPipeline;return {gpu:p.gpu,workers:p.workers,copies:p.copies,coverageSurfaces:p.coverageSurfaces,contexts:p.contexts,disjoint:p.disjoint,skipped:p.skipped,unresolvedQueries:p.pending.length};}')
        if profiler:
            (OUT/'main.cpuprofile').write_text(json.dumps(profiler.send('Profiler.stop')['profile']),encoding='utf8')
            profiler.detach()
        page.keyboard.up('w')
        if args.steering=='circle': page.keyboard.up('d')
        report['end']=page.evaluate(SAMPLE)
        report['powerAfter']=support.power_status()
        report['countersAfter']=page.evaluate(COUNTERS)
        if args.component_costs: report['components']=page.evaluate('__cloudComponents.costs')
        report['population']=page.evaluate('(()=>{const s=nativeNpcDev.getState();return s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1;})()')
        page.screenshot(path=str(OUT/'flight.png'))
        frames=report['frames'];intervals=sorted(f['intervalMs'] for f in frames if f['intervalMs']>0)
        cores=[c for sample in report['probe']['samples'] for c in sample['cores'] if c['ready']]
        costs={}
        for kind in sorted({c['kind'] for c in report['probe']['costs']}):
            for phase in ['warmup','flight']:
                values=sorted(c['ms'] for c in report['probe']['costs'] if c['kind']==kind and c['phase']==phase)
                if values: costs[kind+':'+phase]={'calls':len(values),'totalMs':sum(values),'meanMs':sum(values)/len(values),'p95Ms':values[int(len(values)*.95)],'worstMs':max(values)}
        report['summary']={'fps':len(frames)/report['wallSeconds'],'p95FrameMs':intervals[int(len(intervals)*.95)],'worstFrameMs':max(intervals),
            'maxQueueMs':max((c['queue'] for c in cores),default=0)*1000,'maxVisibleLagMs':max((c['clock']-c['workerClock'] for c in cores if c['visible']),default=0)*1000,
            'maxFluidLagMs':max((c['clock']-c['workerClock']+c['flowDebt'] for c in cores if c['visible']),default=0)*1000,
            'maxCores':max((s['retained'] for s in report['probe']['samples']),default=0),'maxActors':max((c['actors'] for c in cores),default=0),
            'workerPosts':report['probe']['workerPosts'],'publications':report['probe']['publications'],'simulationSeconds':report['simulationSeconds'],'costs':costs}
        cloud_frames={}
        for cost in report['probe']['costs']:
            if cost['phase']=='flight' and cost['kind'] in ['nativeGalaxyFog.frame','nativeGalaxyFog.paint']:
                cloud_frames[cost['frame']]=cloud_frames.get(cost['frame'],0)+cost['ms']
        if cloud_frames:
            values=sorted(cloud_frames.values())
            report['summary']['cloudCpuMs']={'mean':sum(values)/len(values),'median':values[len(values)//2],'p95':values[int(len(values)*.95)],'worst':max(values)}
        def numeric_stats(values):
            values=sorted(values)
            return {'mean':sum(values)/len(values),'p95':values[int(len(values)*.95)],'worst':max(values)} if values else None
        report['summary']['mainThreadMs']={key:numeric_stats([f[key] for f in frames]) for key in ['callbackMs','simulationMs','renderMs','backgroundSimulationMs']}
        if args.component_costs:
            report['summary']['componentMsPerFrame']={name:{'calls':row['calls'],'meanPerGameFrame':row['totalMs']/len(frames),'maxCallMs':row['maxCallMs']} for name,row in report['components'].items()}
        if args.pipeline:
            def stats(values):
                values=sorted(values)
                return {'count':len(values),'mean':sum(values)/len(values),'p95':values[int(len(values)*.95)],'worst':max(values)} if values else None
            pipeline=report['pipeline'];gpu_frames={}
            start=report['probe']['started'];end=start+report['wallSeconds']*1000
            for key in ['gpu','workers','copies']: pipeline[key]=[row for row in pipeline[key] if start<=row['at']<=end]
            for row in pipeline['gpu']: gpu_frames[row['frame']]=gpu_frames.get(row['frame'],0)+row['ms']
            report['summary']['pipeline']={'gpuPerFrameMs':stats(list(gpu_frames.values())),
                'gpuDrawMsByKind':{kind:stats([r['ms'] for r in pipeline['gpu'] if r['kind']==kind]) for kind in sorted({r['kind'] for r in pipeline['gpu']})},
                'workerCpuMs':stats([r['cpuMs'] for r in pipeline['workers'] if r['actors']]),
                'workerPackMs':stats([r['packMs'] for r in pipeline['workers'] if r['actors']]),
                'workerRoundTripMs':stats([r['roundTripMs'] for r in pipeline['workers'] if r['actors'] and r['complete'] and r['roundTripMs'] is not None]),
                'copyCpuMs':stats([r['ms'] for r in pipeline['copies']]),'newCoverageSurfaces':len(pipeline['coverageSurfaces']),'workerTransferBytes':sum(r['bytes'] for r in pipeline['workers']),
                'gpuContexts':pipeline['contexts'],'gpuDisjointQueries':pipeline['disjoint'],'gpuSkippedQueries':pipeline['skipped']}
        report['summary']['gameplayProgressValid']=report['simulationSeconds']>=report['wallSeconds']*.98
        report['summary']['visibleThroughout']=all(s['visibility']=='visible' for s in report['probe']['samples']) and report['end']['visibility']=='visible'
        report['summary']['focusedThroughout']=all(s['focus'] for s in report['probe']['samples']) and report['end']['focus']
        if report['start']['weather']['production']:
            assert any(c['vortices']>0 for c in cores), 'Production weather fixture has no local funnel geometry'
        else:
            assert all(c['vortexSteps']==0 for c in cores), 'Legacy Badlands fixture unexpectedly enabled tornadoes'
        assert report['population']==report['setup']['population']==1210
        assert not report['errors'], report['errors']
        report['sourceStable']=hashes()==report['sourceHashes']
        report['functionalPassed']=True
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
        print(json.dumps(report['summary']),flush=True)
        browser.close()
finally:
    report['sourceStable']=hashes()==report['sourceHashes']
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    server.shutdown()
    server.server_close()
