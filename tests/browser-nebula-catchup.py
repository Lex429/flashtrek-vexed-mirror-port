"""Recreate native full-speed flight and battles in the Sol fog, with frame and worker latency evidence."""
import argparse,functools,http.server,importlib.util,json,os,threading,hashlib
import ctypes
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

def power_status():
 if os.name!='nt':return None
 class Status(ctypes.Structure):
  _fields_=[('ac',ctypes.c_ubyte),('flag',ctypes.c_ubyte),('percent',ctypes.c_ubyte),('reserved',ctypes.c_ubyte),('seconds',ctypes.c_uint32),('fullSeconds',ctypes.c_uint32)]
 status=Status()
 return {'onAC':status.ac==1,'batteryPercent':status.percent} if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(status)) else None
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
stability=load('lag_stability','tests/browser-stability.py');headed=load('lag_headed','tests/browser-performance-headed.py')
parser=argparse.ArgumentParser();parser.add_argument('--cases',default='slow,fast,battle,battle-off');parser.add_argument('--seconds',type=float,default=20);parser.add_argument('--diagnostic',action='store_true');parser.add_argument('--profile-only',action='store_true');parser.add_argument('--headless',action='store_true');parser.add_argument('--count',type=int,default=12);parser.add_argument('--source-root',type=Path,default=ROOT);parser.add_argument('--output',type=Path,default=ROOT/'test-results/nebula-catchup');parser.add_argument('--presentation',choices=['normal','retained'],default='normal');parser.add_argument('--no-smoothing',action='store_true');parser.add_argument('--fixture',type=Path,default=ROOT/'test-results/intrepid-performance/initial-save.json');parser.add_argument('--module-root',type=Path);parser.add_argument('--preset',choices=['vex','badlands'],default='vex');args=parser.parse_args();SITE=args.source_root.resolve();OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_args):pass
 def translate_path(self,path):
  relative=urlsplit(path).path.lstrip('/')
  if args.module_root and relative in ['html-games/broken-mirror-port/nebula-material.js','html-games/broken-mirror-port/nebula-gas.js']:
   return str(args.module_root/Path(relative).name)
  return super().translate_path(path)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(SITE)));threading.Thread(target=server.serve_forever,daemon=True).start()
PROBE=r'''()=>{
 const p=window.__lagProbe={record:false,last:null,visible:null,rows:[],fires:0,maskPosts:0,batches:[],events:[],publications:[]};const Native=window.Worker;
 window.Worker=new Proxy(Native,{construct(target,params){const worker=Reflect.construct(target,params);if(String(params[0]).includes('nebula-material-worker')){
   worker.addEventListener('message',e=>{const m=e.data;if(m.kind!=='updated')return;p.last={sequence:m.sequence,clock:m.metrics?.clock||0,at:performance.now()};if(m.frame||m.checkpoint)p.visible={sequence:m.sequence,clock:m.metrics?.clock||0,at:performance.now(),bodies:m.bodies,pending:m.metrics.pending||0,kind:m.checkpoint?'checkpoint':'frame'};if((m.frame||m.checkpoint)&&p.record)p.publications.push({at:performance.now(),clock:m.metrics.clock,sequence:m.sequence,kind:m.checkpoint?'checkpoint':'frame',workerCpuMs:m.metrics.workerCpuMs,workerPackMs:m.metrics.workerPackMs});});
   const post=worker.postMessage.bind(worker);worker.postMessage=function(m,...rest){if(m.kind==='mask')p.maskPosts++;if(m.kind==='advance'&&p.record)p.batches.push({at:performance.now(),count:m.commands.length,seconds:m.commands.reduce((n,c)=>n+c.dt,0)});return post(m,...rest);};
 }return worker;}});
 for(const kind of ['blur','visibilitychange','fullscreenchange','resize'])addEventListener(kind,()=>{if(p.record)p.events.push({kind,at:performance.now(),focused:document.hasFocus(),visible:document.visibilityState,fullscreen:!!document.fullscreenElement});});
}'''
SETUP=r'''({kind,count,preset})=>{
 const s=nativeNpcDev.getState(),old=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
 nativeShipMotion.stop(s);const original=vexedSolFlight.shipPosition(s);s.x+=900;s.angle=-Math.PI/2;const center=vexedSolFlight.shipPosition(s);window.__lagCenter={...center};
 const possible=s.civilianTraffic.ships.filter(e=>e.hull>0&&e.system===1&&!e.journey&&e.shipType!==58&&!nativeFactionDefence.isFaction(e)&&e.hull>=nativeShipDefinitions.get(e.shipType).hull*.75).sort((a,b)=>(b.hull+b.shields)-(a.hull+a.shields));
 if(possible.length<count)throw Error('Not enough existing healthy Sol crews '+possible.length);
 const chosen=possible.slice(0,count);window.__lagIds=chosen.map(e=>e.id);
 chosen.forEach((e,i)=>{nativeNpcLives.interrupt(s,e,'nebula reproduction fixture');e.scriptedDemo='benchmark';nativeShipMotion.stop(e);const pair=Math.floor(i/2),a=pair*2*Math.PI/Math.ceil(count/2),r=330+(pair%2)*80;
  Object.assign(e,{system:1,x:center.x+Math.cos(a)*r+(i%2?80:-80),y:center.y+Math.sin(a)*r,heading:i%2?Math.PI:0,phase:'docked',timer:1e6,speed:0});nativeNpcLives.refreshLocation(s,e);});
 nativeShipSystems.invalidate(s);const pairs=[];
 if(kind.startsWith('battle'))for(let i=0;i+1<chosen.length;i+=2){const a=chosen[i],b=chosen[i+1];nativeCivilianTraffic.hit(s,a.id,.01,{source:'ai',sourceId:b.id,sourceGovernmentId:b.ownerGovernmentId,from:{x:b.x,y:b.y}});nativeCivilianTraffic.hit(s,b.id,.01,{source:'ai',sourceId:a.id,sourceGovernmentId:a.ownerGovernmentId,from:{x:a.x,y:a.y}});pairs.push([a.id,b.id]);}
 nativeDevFog.setPreset(preset);nativeDevFog.setColour('four');nativeDevFog.setEnabled(!kind.endsWith('-off'));if(!kind.endsWith('-off'))nativeDevFog.reset({ahead:0});
 window.nativeSimulation={...nativeSimulation,blocked:old};nativeSimulationHost.checkpoint();
 return {center,original,pairs,chosen:chosen.map(e=>({id:e.id,type:e.shipType,hull:e.hull,shields:e.shields,fighting:!!e.retaliationId})),population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1};
}'''
PILOT=r'''slow=>{
 const p=__lagProbe,center=__lagCenter,points=[[-300,-400],[300,400],[-300,400],[300,-400]],held=new Set();let waypoint=0;
 function key(code,on){if(on===held.has(code))return;if(on)held.add(code);else held.delete(code);document.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true}));}
 const advance=nativeCivilianTraffic.advance;window.nativeCivilianTraffic={...nativeCivilianTraffic,advance(s,dt){
  const q=vexedSolFlight.shipPosition(s),goal=points[waypoint];if(Math.hypot(q.x-center.x-goal[0],q.y-center.y-goal[1])<210)waypoint=(waypoint+1)%points.length;
  const target=points[waypoint],desired=Math.atan2(center.y+target[1]-q.y-(s.vy||0)*.6,center.x+target[0]-q.x-(s.vx||0)*.6),error=Math.atan2(Math.sin(desired-s.angle),Math.cos(desired-s.angle)),speed=Math.hypot(s.vx||0,s.vy||0)||Math.abs(s.speed||0),far=Math.abs(q.x-center.x)>610||Math.abs(q.y-center.y)>720,outward=(q.x-center.x)*(s.vx||0)+(q.y-center.y)*(s.vy||0)>0;
  const braking=far&&outward&&speed>70||slow&&speed>145;key('KeyA',error<-.035);key('KeyD',error>.035);key('KeyW',!braking&&(Math.abs(error)<.65||speed<60)&&(!slow||speed<120));key('KeyX',braking);return advance(s,dt);
 }};
 window.__stopLagPilot=()=>{for(const code of Array.from(held))key(code,false);window.nativeCivilianTraffic={...nativeCivilianTraffic,advance};};
 const fire=nativeCombatShots.fireFor;window.nativeCombatShots={...nativeCombatShots,fireFor(...a){const r=fire(...a);if(p.record&&r.ok)p.fires++;return r;}};
 window.__lagTimer=setInterval(()=>{
  if(!p.record)return;const s=nativeNpcDev.getState(),m=nativeDevFog.material(),f=m?.field,metric=f?.metrics(),current=f?.currentBodies||[],player=current.find(b=>b.id==='player'),visible=p.visible,old=visible?.bodies?.find(b=>b.id==='player'),pending=f?.pendingMasks||[],tail=pending.filter(b=>b.id==='player'),position=vexedSolFlight.shipPosition(s);
  const row={initialDensity:f?f.sampleInitial(position.x,position.y):0,playerHull:s.hull,playerShields:s.shields,at:performance.now(),sim:nativeSimulation.seconds(s),debt:s.shipSimulation?.schedule?.pendingSeconds,position,heading:s.angle,speedHint:s.speed,velocity:Math.hypot(s.vx||0,s.vy||0),actorCount:metric?.actorCount||0,activeTiles:metric?.activeTiles||0,queue:metric?.queuedSeconds||0,queuedCommands:metric?.queuedPoses||0,fogClock:metric?.clock||0,workerClock:metric?.workerClock||0,flowDebt:metric?.pending||0,visibleFluidLag:f?Math.max(0,metric.clock-(visible?.clock||0)+(visible?.pending||0)):0,visibleLag:f?Math.max(0,metric.clock-(visible?.clock||0)):0,publicationAge:visible?performance.now()-visible.at:0,publicationKind:visible?.kind,publicationSequence:visible?.sequence,playerPublishedDistance:player&&old?Math.hypot(player.pose.x-old.pose.x,player.pose.y-old.pose.y):null,playerPending:tail.length,pendingTotal:pending.length,oldestPendingGap:tail.length&&old?Math.hypot(tail[0].x-old.pose.x,tail[0].y-old.pose.y):null,workerCpuMs:metric?.workerCpuMs||0,workerPackMs:metric?.workerPackMs||0,transport:metric?.transport||null,maskPosts:p.maskPosts,combatants:s.civilianTraffic.ships.filter(e=>__lagIds.includes(e.id)&&e.retaliationId&&e.hull>0).length,shots:s.weaponCombat?.events?.filter(e=>e.alive&&!e.resolved).length||0};
  if(p.rows.length){const prev=p.rows[p.rows.length-1],dt=row.sim-prev.sim;row.actualSpeed=dt>0?Math.hypot(position.x-prev.position.x,position.y-prev.position.y)/dt:0;}const counts={};for(const v of pending)counts[v.id]=(counts[v.id]||0)+1;row.cappedActors=Object.keys(counts).filter(id=>counts[id]===32);const dt=(metric?.clock||0)-(p.previousBodyClock||0),previous=p.previousBodies||{},published=new Map((visible?.bodies||[]).map(b=>[b.id,b.pose]));row.maxNpcSpeed=0;row.maxNpcPublishedDistance=0;for(const b of current)if(b.id!=='player'){const a=previous[b.id],v=published.get(b.id);if(a&&dt>0)row.maxNpcSpeed=Math.max(row.maxNpcSpeed,Math.hypot(a.x-b.pose.x,a.y-b.pose.y)/dt);if(v)row.maxNpcPublishedDistance=Math.max(row.maxNpcPublishedDistance,Math.hypot(v.x-b.pose.x,v.y-b.pose.y));}p.previousBodies=Object.fromEntries(current.map(b=>[b.id,b.pose]));p.previousBodyClock=metric?.clock||0;if(p.costs)row.save=nativeSaveStorage.metrics();p.rows.push(row);
  if(window.__lagHud&&p.rows.length%3===0)__lagHud.textContent='FOG DIAGNOSTIC | fog '+Math.round(row.visibleLag*1000)+' ms behind | ship '+Math.round(row.actualSpeed||0)+' u/s | actors '+row.actorCount+' | pending '+row.pendingTotal;
 },100);
}'''
COSTS=r'''()=>{
 const p=__lagProbe;p.costs={};function wrap(name,methods){const original=window[name],next={...original};for(const method of methods){const fn=original[method];next[method]=function(...args){const record=p.record,start=performance.now();try{return fn.apply(this,args);}finally{if(record){const a=p.costs[name+'.'+method]||={count:0,ms:0,max:0};const ms=performance.now()-start;a.count++;a.ms+=ms;a.max=Math.max(a.max,ms);}}};}window[name]=next;}
 wrap('nativeDevFog',['frame','paint']);wrap('nativeNebulaMaterial',['renderPair','clearPending','maskFor','maskForType']);wrap('nativeNebulaGas',['render']);
 const hud=document.createElement('output');hud.style.cssText='position:fixed;bottom:48px;left:12px;z-index:9999;padding:8px;background:#06121ee8;color:#fff;font:13px monospace';document.body.append(hud);window.__lagHud=hud;
}'''
def percentile(values,q):
 values=sorted(values);return values[min(len(values)-1,int(len(values)*q))] if values else 0
support=load('lag_support','tests/nebula-browser-support.py')
worker_profile=support.worker_profile

report={'diagnostic':args.diagnostic,'profileOnly':args.profile_only,'headless':args.headless,'presentation':args.presentation,'smoothing':not args.no_smoothing,'cases':{},'errors':[],'sourceHashes':{str(f.relative_to(SITE)).replace('\\','/'):hashlib.sha256(f.read_bytes()).hexdigest() for folder in ['html-games/broken-mirror-port','html-games/flashtrek-broken-mirror'] for f in (SITE/folder).rglob('*') if f.suffix in ['.js','.html']},'scope':'Full game foreground RAF/draw and fog latency; configured monitor Hz is not direct scanout.'}
report['preset']=args.preset;report['moduleOverrides']={name:hashlib.sha256((args.module_root/name).read_bytes()).hexdigest() for name in ['nebula-material.js','nebula-gas.js']} if args.module_root else {}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=args.headless,channel='msedge');report['browser']=browser.version;report['display']=headed.display_modes();report['powerBefore']=power_status();saved=args.fixture.read_text();report['fixtureSha256']=hashlib.sha256(saved.encode()).hexdigest();report['fixtureTextSha256']=report['fixtureSha256'];report['fixtureFileSha256']=hashlib.sha256(args.fixture.read_bytes()).hexdigest();report['harnessSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
  for kind in args.cases.split(','):
   label=kind+('-diagnostic' if args.diagnostic else '-profile' if args.profile_only else '')
   context=browser.new_context(**({'viewport':{'width':1280,'height':800}} if args.headless else {'no_viewport':True}),reduced_motion='no-preference',**({'record_video_dir':str(OUT/'video'),'record_video_size':{'width':1280,'height':800}} if args.diagnostic else {}))
   case_errors=[]
   page=context.new_page();page.add_init_script('('+stability.INSTRUMENT+')()');page.add_init_script('('+PROBE+')()');page.add_init_script('(()=>{let seed=4292026;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};})()');page.on('pageerror',lambda e:(report['errors'].append(str(e)),case_errors.append({'message':str(e),'stack':e.stack})))
   page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
   if not args.headless:
    page.evaluate('''()=>{const b=document.createElement('button');b.id='lag-fullscreen';b.textContent='Start nebula investigation';b.style.cssText='position:fixed;top:8px;left:8px;z-index:99999;padding:20px';b.onclick=e=>{e.stopImmediatePropagation();document.documentElement.requestFullscreen().then(()=>b.remove());};document.body.append(b);}''');page.locator('#lag-fullscreen').click();page.wait_for_function('()=>document.fullscreenElement');session=context.new_cdp_session(page);target=session.send('Browser.getWindowForTarget');session.send('Browser.setWindowBounds',{'windowId':target['windowId'],'bounds':{'windowState':'fullscreen'}});session.detach();page.bring_to_front();page.wait_for_function('()=>document.hasFocus()&&document.visibilityState==="visible"')
   if args.presentation!='normal' or args.no_smoothing:
    page.evaluate('''({retained,smooth})=>{const api=nativeNebulaMaterial;window.nativeNebulaMaterial={...api,renderPair(v,s,f,b,o){return api.renderPair(v,s,f,b,{...o,...(retained?{direct:false,clearPending:false}:{}),smooth});}};}''',{'retained':args.presentation=='retained','smooth':not args.no_smoothing})
   page.evaluate(stability.INSTALL);page.wait_for_function('()=>nativeNpcDev.getState()?.devMode',timeout=120000);page.evaluate(stability.SETUP,{'saved':saved,'mode':'flight'});setup=page.evaluate(SETUP,{'kind':kind,'count':args.count,'preset':args.preset});page.evaluate(PILOT,kind=='slow')
   if not kind.endswith('-off'):page.wait_for_function('()=>nativeDevFog.material()?.field.ready',timeout=120000)
   page.wait_for_timeout(1000 if kind=='settling' else 3000)
   if kind=='settling':
    # Real flight first disturbs the bank; stop with the game's braking input
    # and retain the existing fleet while the shared field settles for a minute.
    page.evaluate('__stopLagPilot()');page.keyboard.down('x')
    try:page.wait_for_function('()=>Math.hypot(nativeNpcDev.getState().vx||0,nativeNpcDev.getState().vy||0)<.1&&Math.abs(nativeNpcDev.getState().speed)<.1',timeout=30000)
    finally:page.keyboard.up('x')
    inside=page.evaluate('()=>{const s=nativeNpcDev.getState(),p=vexedSolFlight.shipPosition(s);return nativeDevFog.material().field.sampleInitial(p.x,p.y);}')
    if inside<=.1:raise RuntimeError('Settling fixture stopped outside dense fog: '+str(inside))
   main_profile=None;worker_stop=None;profile_errors=[]
   if args.diagnostic or args.profile_only:
    page.evaluate(COSTS);page.evaluate('window.__lagHud?.remove()') if args.profile_only else None;main_profile=context.new_cdp_session(page);main_profile.send('Profiler.enable');main_profile.send('Profiler.start')
    try:worker_stop=worker_profile(browser,page)
    except Exception as error:profile_errors.append(str(error))
   page.evaluate('''()=>{__stability.frames=[];__stability.longTasks=[];__lagProbe.rows=[];__lagProbe.events=[];__lagProbe.batches=[];__lagProbe.publications=[];__lagProbe.fires=0;__lagProbe.record=true;__stability.record=true;__lagProbe.started=performance.now();__lagProbe.startSim=nativeSimulation.seconds(nativeNpcDev.getState());}''')
   page.wait_for_timeout(args.seconds*1000)
   row=page.evaluate('''()=>{__stability.record=false;__lagProbe.record=false;const s=nativeNpcDev.getState();return {seconds:(performance.now()-__lagProbe.started)/1000,startSim:__lagProbe.startSim,endSim:nativeSimulation.seconds(s),frames:__stability.frames,longTasks:__stability.longTasks,probe:__lagProbe,conditions:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,outerWidth,outerHeight,screenX,screenY,focused:document.hasFocus(),visible:document.visibilityState,fullscreen:!!document.fullscreenElement},population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,fog:nativeDevFog.snapshot()};}''')
   if main_profile:
    (OUT/(label+'-main.cpuprofile')).write_text(json.dumps(main_profile.send('Profiler.stop')['profile']));main_profile.detach()
   if worker_stop:
    try:(OUT/(label+'-worker.cpuprofile')).write_text(json.dumps(worker_stop()))
    except Exception as error:profile_errors.append(str(error))
   row['profileErrors']=profile_errors;row['errors']=case_errors
   page.evaluate('__stopLagPilot();clearInterval(__lagTimer)');intervals=[f['intervalMs'] for f in row['frames'] if f['intervalMs']>0];samples=row['probe']['rows'];display=next((d for d in report['display'].get('displays',[]) if d.get('primary')),{});v=row['conditions'];valid=not args.headless and v['focused'] and v['visible']=='visible' and v['fullscreen'] and v['outerWidth']>=v['width']-2 and v['screenX']>-10000 and not row['probe']['events'] and abs(v['width']*v['dpr']-display.get('width',0))<=3*v['dpr'] and abs(v['height']*v['dpr']-display.get('height',0))<=3*v['dpr']
   summary={'fps':len(row['frames'])/row['seconds'],'p95Ms':percentile(intervals,.95),'p99Ms':percentile(intervals,.99),'worstMs':max(intervals,default=0),'over50ms':sum(ms>50 for ms in intervals),'budgetMisses':sum(ms>9 for ms in intervals),'nativeFullscreenValid':valid,'displayHz':display.get('frequencyHz'),'simulationSeconds':row['endSim']-row['startSim'],'insideFogFraction':sum(r['initialDensity']>.1 for r in samples)/max(1,len(samples)),'fastInsideSamples':sum(r.get('actualSpeed',0)>300 and r['initialDensity']>.1 for r in samples),'maxQueueSeconds':max((r['queue'] for r in samples),default=0),'maxFlowDebtSeconds':max((r['flowDebt'] for r in samples),default=0),'maxVisibleFluidLagSeconds':max((r['visibleFluidLag'] for r in samples),default=0),'p95VisibleLagSeconds':percentile([r['visibleLag'] for r in samples],.95),'maxVisibleLagSeconds':max((r['visibleLag'] for r in samples),default=0),'maxPlayerPublishedDistance':max((r['playerPublishedDistance'] or 0 for r in samples),default=0),'maxOldestPendingGap':max((r['oldestPendingGap'] or 0 for r in samples),default=0),'maxActualSpeed':max((r.get('actualSpeed',0) for r in samples),default=0),'maxActors':max((r['actorCount'] for r in samples),default=0),'maxCombatants':max((r['combatants'] for r in samples),default=0),'acceptedShots':row['probe']['fires'],'maxPendingMasks':max((r['pendingTotal'] for r in samples),default=0),'atPendingCap':sum(r['playerPending']==32 for r in samples)}
   gameplay_valid=not case_errors and len(intervals)>0 and row['endSim']-row['startSim']>=row['seconds']*.98
   pubs=row['probe']['publications'];gaps=[b['at']-a['at'] for a,b in zip(pubs,pubs[1:])];summary.update(gameplayValid=gameplay_valid,publicationsPerSecond=len(pubs)/row['seconds'],p95PublicationGapMs=percentile(gaps,.95),maxPublicationGapMs=max(gaps,default=0),maxNpcSpeed=max((r['maxNpcSpeed'] for r in samples),default=0),maxNpcPublishedDistance=max((r['maxNpcPublishedDistance'] for r in samples),default=0),cappedActorSamples=sum(bool(r['cappedActors']) for r in samples),strict120Pass=valid and gameplay_valid and display.get('frequencyHz')==120 and not (args.diagnostic or args.profile_only) and len(intervals)>0 and max(intervals)<=1000/120*1.08);row['setup']=setup;row['summary']=summary;assert row['population']==setup['population'];report['cases'][label]=summary;(OUT/(label+'.json')).write_text(json.dumps(row));page.screenshot(path=str(OUT/(label+'.png')));video=page.video;page.close();context.close()
   if video:video.save_as(str(OUT/(label+'.webm')))
   report['powerAfter']=power_status();report['displayAfter']=headed.display_modes();report['sourceStable']=all(hashlib.sha256((SITE/path).read_bytes()).hexdigest()==digest for path,digest in report['sourceHashes'].items());(OUT/('diagnostic-report.json' if args.diagnostic else 'profile-report.json' if args.profile_only else 'clean-report.json')).write_text(json.dumps(report,indent=2));print(json.dumps({'case':label,**summary}),flush=True)
  browser.close()
finally:server.shutdown();server.server_close()
