"""Same saved local Dev scene: foreground RAF delivery and cloud draw submission.

GPU timer queries are asynchronous; CPU submission is not GPU completion time.
Keeps every measured frame/long task, including failed or interrupted windows.
"""
import argparse, hashlib, json, os
from urllib.parse import unquote,urlsplit
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--fixture',type=Path,required=True)
p.add_argument('--seconds',type=float,default=12)
p.add_argument('--headless',action='store_true')
p.add_argument('--profile',action='store_true')
p.add_argument('--trace',action='store_true')
p.add_argument('--module-root',type=Path,help='Serve a frozen checkout of game scripts at the actual Dev origin')
p.add_argument('--sheet-bursts',action='store_true',help='Exercise the real sheet-lightning command during each full-game window')
p.add_argument('--asteroid-drift',action='store_true',help='Push two real saved rocks through the cloud using the shared motion owner')
p.add_argument('--currents-off',action='store_true',help='Disable ambient currents for an otherwise identical saved-scene comparison')
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
files=['plasma-vortices.js','badlands-currents.js','ship-systems.js','nebula-material.js','nebula-material-worker.js','dev-sol-fog.js','native-game.js','dev-nebula-storm.js','nebula-fire-fronts.js','assets/nebula-fire-v1.bin','nebula-asteroids.js','nebula-asteroid-masks.js','asteroid-mining-effects.js','asteroid-combat.js','civilian-traffic.js','index.html']
def hashes():
 return {f:hashlib.sha256(((a.module_root or ROOT)/'html-games/broken-mirror-port'/f).read_bytes()).hexdigest() for f in files}
PROBE=r'''()=>{
 const p=window.__plasmaPerf={record:false,previous:0,frames:[],draw:[],fog:[],rocks:[],lag:[],lagAt:0,gpu:[],tasks:[],interruptions:[],pending:[],pair:0,nextPair:0,window:0};
 const rocks=nativeNebulaAsteroids,rd={};for(const name of ['bodyFor','miningBodies'])rd[name]={value:function(...args){const at=performance.now();try{return rocks[name](...args);}finally{if(p.record)p.rocks.push(performance.now()-at);}}};window.nativeNebulaAsteroids=Object.create(rocks,rd);
 const api=nativeNebulaMaterial,desc=Object.getOwnPropertyDescriptors(api);
 for(const name of ['renderPair','endBatch']){const fn=api[name];desc[name]={...desc[name],value:function(...args){
  const start=performance.now();if(name==='renderPair')p.pair=++p.nextPair;try{return fn.apply(this,args);}finally{if(p.record)p.draw.push({name,ms:performance.now()-start});p.pair=0;}}};}
 window.nativeNebulaMaterial=Object.defineProperties({},desc);
 const fog=nativeDevFog,fd=Object.getOwnPropertyDescriptors(fog);fd.paint={...fd.paint,value:function(...args){const at=performance.now();try{return fog.paint(...args);}finally{if(p.record)p.fog.push({pass:args[1],ms:performance.now()-at});}}};window.nativeDevFog=Object.defineProperties({},fd);
 const original=WebGL2RenderingContext.prototype.drawArrays;
 WebGL2RenderingContext.prototype.drawArrays=function(...args){
  const ext=this.canvas.dataset.nebulaMaterial&&this.getExtension('EXT_disjoint_timer_query_webgl2');
  if(!p.record||!ext||this.getQuery(ext.TIME_ELAPSED_EXT,this.CURRENT_QUERY))return original.apply(this,args);
  const q=this.createQuery();this.beginQuery(ext.TIME_ELAPSED_EXT,q);
  try{return original.apply(this,args);}finally{this.endQuery(ext.TIME_ELAPSED_EXT);p.pending.push({gl:this,ext,q,pair:p.pair,window:p.window});}
 };
 new PerformanceObserver(list=>{if(p.record)for(const e of list.getEntries())p.tasks.push({at:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:false});
 for(const event of ['visibilitychange','blur'])addEventListener(event,()=>{if(p.record)p.interruptions.push({event,hidden:document.hidden,focus:document.hasFocus()});});
 function frame(now){
  if(p.record&&now-p.lagAt>250){const f=nativeDevFog.material()?.field,m=f?.metrics();if(m)p.lag.push({at:now,seconds:Math.max(0,f.clock-(m.workerClock||m.clock)+(m.pending||0)),queued:m.queuedSeconds||0});p.lagAt=now;}
  if(p.record){if(p.previous)p.frames.push(now-p.previous);p.previous=now;}else p.previous=0;
  for(let i=p.pending.length-1;i>=0;i--){const {gl,ext,q,pair,window:win}=p.pending[i];
   if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(p.record&&win===p.window&&!gl.getParameter(ext.GPU_DISJOINT_EXT))p.gpu.push({pair,ms:gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6});gl.deleteQuery(q);p.pending.splice(i,1);}}
  requestAnimationFrame(frame);
 }requestAnimationFrame(frame);
}'''
SAMPLE=r'''()=>{const s=nativeNpcDev.getState(),f=nativeDevFog.material()?.field;return {
 at:performance.now(),seconds:nativeSimulation.seconds(s),debt:s.shipSimulation.schedule.pendingSeconds,
 x:s.x,y:s.y,population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,
 physical:nativeShipSystems.collectShips(s).length,quiet:nativeDevTraffic.active(s),
 material:f?.metrics(),current:nativeBadlandsCurrents.snapshot(s),asteroids:nativeDevFog.snapshot().asteroidCount,renderer:nativeNebulaMaterial.metrics(),volume:nativePlasmaVortices.snapshot(s).renderer,weather:{fire:nativeDevFog.snapshot().fire,storm:nativeDevFog.snapshot().storm},
 focus:document.hasFocus(),visible:!document.hidden};}'''
report={'passed':False,'scope':'Actual local Dev game, foreground RAF/draw delivery; GPU query covers material draw calls, not panel scanout.',
        'headless':a.headless,'moduleRoot':str(a.module_root.resolve()) if a.module_root else None,'manualSheetBursts':a.sheet_bursts,'asteroidDrift':a.asteroid_drift,'currentsEnabled':not a.currents_off,'errors':[],'failedRequests':[],'sourceBefore':hashes(),'windows':[]}
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=a.headless,channel=os.environ.get('BROWSER_CHANNEL','msedge'))
  page=browser.new_page(viewport={'width':1280,'height':720},reduced_motion='no-preference')
  if a.module_root:
   frozen=a.module_root.resolve()
   def serve_frozen(route):
    target=(frozen/unquote(urlsplit(route.request.url).path).lstrip('/')).resolve()
    if target.is_relative_to(frozen) and target.is_file():route.fulfill(path=str(target))
    else:route.continue_()
   page.context.route('**/html-games/**',serve_frozen)
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.on('response',lambda r:report['failedRequests'].append(r.url) if r.status>=400 else None)
  page.add_init_script("Object.defineProperty(navigator,'getGamepads',{value:()=>[]});let seed=4292026;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}")
  page.goto('http://127.0.0.1:7790/html-games/broken-mirror-port/index.html?devTraffic=off')
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  if a.currents_off:page.evaluate('nativeBadlandsCurrents.setEnabled(false)')
  page.evaluate('startNativeDevGame();nativeDevFog.setEnabled(true)')
  page.wait_for_function('()=>nativeDevFog.material()?.field.ready',timeout=120000)
  if not a.fixture.exists():
   a.fixture.parent.mkdir(parents=True,exist_ok=True)
   a.fixture.write_text(page.evaluate('JSON.stringify(nativeNpcDev.getState())'),encoding='utf8')
  page.evaluate('saved=>{const result=nativeSaveStorage.write(JSON.parse(saved));if(!result.ok)throw Error(result.error);resumeNativeGame("dev");}',a.fixture.read_text(encoding='utf8'))
  page.wait_for_function('()=>nativeDevFog.material()?.field.ready',timeout=120000)
  if a.asteroid_drift:page.evaluate('()=>{const s=nativeNpcDev.getState();for(const [i,id] of [100,101].entries()){const rock=nativeSolAsteroids.find(id,1);nativeAsteroidMotion.applyContact(s,rock,{x:80+i*100,y:-110-i*100,angle:.3+i,vx:28+i*8,vy:-12,spin:.14});}}')
  page.evaluate(PROBE);page.bring_to_front();page.locator('#space').focus()
  report['conditions']=page.evaluate('()=>({inner:[innerWidth,innerHeight],outer:[outerWidth,outerHeight],screen:[screen.width,screen.height],dpr:devicePixelRatio})')
  page.wait_for_timeout(3000)
  if a.profile:
   cdp=page.context.new_cdp_session(page);cdp.send('Profiler.enable');cdp.send('Profiler.start')
  if a.trace:
   trace=page.context.new_cdp_session(page);trace_result={}
   trace.on('Tracing.tracingComplete',lambda event:trace_result.update(event))
  for mode in ['stationary','flight']:
   if a.trace and mode=='flight':trace.send('Tracing.start',{'categories':'devtools.timeline,v8,disabled-by-default-v8.gc,gpu,cc','transferMode':'ReturnAsStream'})
   before=page.evaluate(SAMPLE)
   page.evaluate('()=>{const p=__plasmaPerf;p.window++;p.previous=0;p.frames=[];p.draw=[];p.fog=[];p.rocks=[];p.lag=[];p.lagAt=0;p.gpu=[];p.tasks=[];p.interruptions=[];p.record=true;}')
   if a.sheet_bursts:page.evaluate('()=>{nativeDevFog.triggerSheet();window.__sheetProbe=setInterval(()=>nativeDevFog.triggerSheet(),1300);}')
   if mode=='flight':page.keyboard.down('w')
   page.wait_for_timeout(a.seconds*1000)
   if mode=='flight':page.keyboard.up('w')
   page.evaluate('__plasmaPerf.record=false')
   if a.sheet_bursts:page.evaluate('clearInterval(__sheetProbe)')
   after=page.evaluate(SAMPLE)
   raw=page.evaluate('()=>{const p=__plasmaPerf;return {frames:p.frames,draw:p.draw,fog:p.fog,rocks:p.rocks,lag:p.lag,gpu:p.gpu,tasks:p.tasks,interruptions:p.interruptions};}')
   def stats(values):
    v=sorted(values)
    return {'count':len(v),'mean':sum(v)/len(v) if v else 0,**{name:v[min(len(v)-1,int(len(v)*q))] if v else 0 for name,q in [('p50',.5),('p95',.95),('p99',.99),('max',1)]}}
   pairs={}
   for q in raw['gpu']:pairs[q['pair']]=pairs.get(q['pair'],0)+q['ms']
   summary={'frameMs':stats(raw['frames']),'cpuCloudDrawMs':stats([d['ms'] for d in raw['draw']]),'cpuFogPassMs':stats([d['ms'] for d in raw['fog']]),'gpuMaterialPairMs':stats(list(pairs.values())),
    'asteroidPreparationMs':stats(raw['rocks']),
    'visibleFluidLagSeconds':stats([v['seconds'] for v in raw['lag']]),
    'over50ms':sum(t>50 for t in raw['frames']),'longTasks':len(raw['tasks']),'fps':1000*len(raw['frames'])/sum(raw['frames']) if raw['frames'] else 0}
   summary['smoothnessPassed']=summary['over50ms']==0 and summary['fps']>=58 and summary['frameMs']['p95']<=18.7 and after['debt']<=.1
   report['windows'].append({'mode':mode,'before':before,'after':after,'summary':summary,'raw':raw})
   if a.trace and mode=='flight':
    trace.send('Tracing.end')
    while 'stream' not in trace_result:page.wait_for_timeout(50)
    parts=[]
    while True:
     chunk=trace.send('IO.read',{'handle':trace_result['stream']});parts.append(chunk['data'])
     if chunk.get('eof'):break
    trace.send('IO.close',{'handle':trace_result['stream']});(a.output/'flight-trace.json').write_text(''.join(parts),encoding='utf8')
   page.screenshot(path=str(a.output/(mode+'.png')))
  if a.profile:(a.output/'main.cpuprofile').write_text(json.dumps(cdp.send('Profiler.stop')['profile']),encoding='utf8')
  report['sourceAfter']=hashes()
  report['workspaceAfter']={f:hashlib.sha256((ROOT/'html-games/broken-mirror-port'/f).read_bytes()).hexdigest() for f in files}
  report['measurementValid']=not report['errors'] and not report['failedRequests'] and report['sourceBefore']==report['sourceAfter'] and all(w['after']['physical']==1 and not w['raw']['interruptions'] for w in report['windows'])
  report['passed']=report['measurementValid'] and all(w['summary']['smoothnessPassed'] for w in report['windows'])
  browser.close()
finally:
 (a.output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({**{k:report[k] for k in ['passed','headless','errors','failedRequests']},'windows':[{k:w[k] for k in ['mode','summary']} for w in report['windows']]}))
