"""Sequential native-fullscreen weather cost, retaining the saved fleet and real frames."""
import argparse,functools,http.server,importlib.util,json,hashlib,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
stability=load('weather_stability','tests/browser-stability.py');headed=load('weather_headed','tests/browser-performance-headed.py');support=load('weather_support','tests/nebula-browser-support.py')
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source-root',type=Path,default=ROOT);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--seconds',type=float,default=20);parser.add_argument('--cases',default='flight,battle');parser.add_argument('--count',type=int,default=20);parser.add_argument('--region',choices=['azure','badlands','badlands-seam'],default='azure');args=parser.parse_args();OUT=args.output;OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
 def translate_path(self,path):
  target=Path(super().translate_path(path))
  if not target.exists() and target.suffix not in ['.js','.html','.css']:
   try:relative=target.resolve().relative_to(args.source_root.resolve())
   except ValueError:return str(target)
   fallback=ROOT/relative
   if relative.parts and relative.parts[0]=='html-games' and fallback.is_file():return str(fallback)
  return str(target)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(args.source_root)));threading.Thread(target=server.serve_forever,daemon=True).start()
SETUP=r'''({battle,count,region})=>{
 const s=nativeNpcDev.getState();nativeShipMotion.stop(s);nativeDevFog.setEnabled(false);const system=region.startsWith('badlands')?73:1,o=nativeManualFlight.chartPosition(system);
 const target=system===73?{x:region==='badlands-seam'?1000:0,y:region==='badlands-seam'?700:0}:{x:(13-o.x)*1000,y:(11-o.y)*1000};Object.assign(s,{system,x:target.x,y:target.y,localBody:system===1?3:0,localBodySystem:system,angle:0,landed:false,phase:'flight',localCruise:null,arrivalApproach:null});const actual=vexedSolFlight.shipPosition(s);s.x+=target.x-actual.x;s.y+=target.y-actual.y;nativeManualFlight.initializeRegion(s);
 if(system===73){const access=nativeCivilianAccess;window.nativeCivilianAccess={...access,inhabited:(state,id)=>Number(id)===73||access.inhabited(state,id)};}
 const center=vexedSolFlight.shipPosition(s),chosen=battle?s.civilianTraffic.ships.filter(e=>e.hull>0&&!e.journey&&e.shipType!==58&&e.hull>=nativeShipDefinitions.get(e.shipType).hull*.75&&nativeShipDefinitions.get(e.shipType).capabilities?.armed!==false&&nativeShipEquipment.equipped(s,e).some(i=>i.weapon.damage>0&&(nativeShipEquipment.condition(i.instance)??100)>0)).sort((a,b)=>(b.hull+b.shields)-(a.hull+a.shields)).slice(0,count):[];
 if(battle&&chosen.length!==count)throw Error('Insufficient healthy saved crews');
 for(let i=0;i<chosen.length;i++){
  const e=chosen[i];nativeNpcLives.interrupt(s,e,'galaxy weather benchmark');e.scriptedDemo='benchmark';nativeShipMotion.stop(e);
  const a=Math.floor(i/2)*2*Math.PI/Math.ceil(count/2),r=330+(Math.floor(i/2)%2)*80;
  Object.assign(e,{system,x:center.x+Math.cos(a)*r+(i%2?75:-75),y:center.y+Math.sin(a)*r,heading:i%2?Math.PI:0,phase:'docked',timer:1e6,speed:0});nativeNpcLives.refreshLocation(s,e);
 }
 nativeShipSystems.invalidate(s);
 for(let i=0;i+1<chosen.length;i+=2){const a=chosen[i],b=chosen[i+1];nativeCivilianTraffic.hit(s,a.id,.01,{source:'ai',sourceId:b.id,sourceGovernmentId:b.ownerGovernmentId,from:b});nativeCivilianTraffic.hit(s,b.id,.01,{source:'ai',sourceId:a.id,sourceGovernmentId:a.ownerGovernmentId,from:a});}
 window.__weatherPerf={shots:0,events:[],samples:[],record:false};const fire=nativeCombatShots.fireFor;window.nativeCombatShots={...nativeCombatShots,fireFor(...args){const r=fire(...args);if(__weatherPerf.record&&r.ok)__weatherPerf.shots++;return r;}};
 if(battle){const advance=nativeCivilianTraffic.advance;window.nativeCivilianTraffic={...nativeCivilianTraffic,advance(state,dt){const result=advance(state,dt);for(let i=0;i<chosen.length;i++){const a=chosen[i],b=chosen[i%2?i-1:i+1];if(!a||!b||!(a.hull>0&&b.hull>0))continue;const source=()=>nativeShipDefinitions.describe(state,a,{category:'civilian'}),target=()=>nativeShipDefinitions.describe(state,b,{category:'civilian'});nativeCombatShots.fireFor({state,holder:a,shooter:source(),target:target(),getSource:source,getTarget:target,owner:'galaxy-weather-benchmark'});}return result;}};}
 for(const kind of ['blur','visibilitychange','fullscreenchange','resize'])addEventListener(kind,()=>{if(__weatherPerf.record)__weatherPerf.events.push({kind,at:performance.now()});});
 window.__weatherPerfTimer=setInterval(()=>{if(!__weatherPerf.record)return;const m=window.nativeGalaxyFog?.materials?.()||[];__weatherPerf.samples.push({at:performance.now(),cores:m.length,actors:m.reduce((n,c)=>n+c.bodies.length,0),queue:Math.max(0,...m.map(c=>c.field.metrics().queuedSeconds||0))});},100);
 window.__weatherCrew=chosen;return {population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,crews:chosen.map(e=>({id:e.id,type:e.shipType})),initialQuery:nativeShipSystems.query(s,{system:s.system,minX:s.x-2000,minY:s.y-2000,maxX:s.x+2000,maxY:s.y+2000,categories:['civilian']}).bystanders.map(d=>({id:d.id,x:d.x,y:d.y})),center};
}'''
report={'region':args.region,'scope':'Actual native-fullscreen game RAF, not panel scanout','powerBefore':support.power_status(),'display':headed.display_modes(),'sourceHashes':support.source_hashes(args.source_root),'harnessSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'fixtureSha256':hashlib.sha256((ROOT/'test-results/intrepid-performance/initial-save.json').read_bytes()).hexdigest(),'cases':{},'errors':[]}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=False)
  for case in args.cases.split(','):
   context=browser.new_context(no_viewport=True,reduced_motion='no-preference');page=context.new_page();page.add_init_script('('+stability.INSTRUMENT+')()');page.add_init_script('(()=>{let seed=4292026;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};})()');page.on('pageerror',lambda e:report['errors'].append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
   page.evaluate('''()=>{const b=document.createElement('button');b.id='weather-fullscreen';b.textContent='Start full screen';b.style.cssText='position:fixed;inset:20px;z-index:99999';b.onclick=()=>document.documentElement.requestFullscreen();document.body.append(b);}''');page.locator('#weather-fullscreen').click();page.wait_for_function('()=>!!document.fullscreenElement');page.evaluate('document.querySelector("#weather-fullscreen").remove()')
   session=context.new_cdp_session(page);target=session.send('Browser.getWindowForTarget');session.send('Browser.setWindowBounds',{'windowId':target['windowId'],'bounds':{'windowState':'fullscreen'}});session.detach();page.bring_to_front();page.wait_for_function('()=>document.hasFocus()&&document.visibilityState==="visible"')
   page.evaluate(stability.INSTALL);saved=(ROOT/'test-results/intrepid-performance/initial-save.json').read_text();page.evaluate(stability.SETUP,{'saved':saved,'mode':'flight'});setup=page.evaluate(SETUP,{'battle':case=='battle','count':args.count,'region':args.region})
   page.wait_for_timeout(3000);page.locator('#space').focus();page.keyboard.down('w');page.keyboard.down('d')
   page.evaluate('''()=>{__stability.frames=[];__stability.longTasks=[];__stability.record=true;__weatherPerf.record=true;__weatherPerf.started=performance.now();__weatherPerf.sim=nativeSimulation.seconds(nativeNpcDev.getState());}''');page.wait_for_timeout(args.seconds*1000)
   row=page.evaluate('''()=>{__stability.record=false;__weatherPerf.record=false;const s=nativeNpcDev.getState();clearInterval(__weatherPerfTimer);return {seconds:(performance.now()-__weatherPerf.started)/1000,simulationSeconds:nativeSimulation.seconds(s)-__weatherPerf.sim,debt:s.shipSimulation.schedule.pendingSeconds,frames:__stability.frames,longTasks:__stability.longTasks,probe:__weatherPerf,population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,crews:__weatherCrew.map(e=>({id:e.id,system:e.system,x:e.x,y:e.y,hull:e.hull,phase:e.phase,journey:!!e.journey})),query:nativeShipSystems.query(s,{system:s.system,minX:s.x-2000,minY:s.y-2000,maxX:s.x+2000,maxY:s.y+2000,categories:['civilian']}).bystanders.map(d=>({id:d.id,x:d.x,y:d.y,hull:d.hull})),conditions:{focused:document.hasFocus(),visible:document.visibilityState,fullscreen:!!document.fullscreenElement,w:innerWidth,h:innerHeight,dpr:devicePixelRatio},fog:window.nativeGalaxyFog?.snapshot()||null};}''')
   page.keyboard.up('w');page.keyboard.up('d');times=sorted(r['intervalMs'] for r in row['frames'] if r['intervalMs']>0);v=row['conditions'];display=next(d for d in report['display']['displays'] if d['primary']);valid=v['focused'] and v['visible']=='visible' and v['fullscreen'] and not row['probe']['events'] and abs(v['w']*v['dpr']-display['width'])<4 and abs(v['h']*v['dpr']-display['height'])<4
   summary={'fps':len(row['frames'])/row['seconds'],'p95Ms':times[int(len(times)*.95)],'p99Ms':times[int(len(times)*.99)],'worstMs':max(times),'over50ms':sum(t>50 for t in times),'simulationSeconds':row['simulationSeconds'],'acceptedShots':row['probe']['shots'],'nativeFullscreenValid':valid,'maxQueue':max((s['queue'] for s in row['probe']['samples']),default=0),'maxActors':max((s['actors'] for s in row['probe']['samples']),default=0),'insideFraction':sum(s['cores']>0 for s in row['probe']['samples'])/max(1,len(row['probe']['samples']))}
   summary['strict120Pass']=valid and display['frequencyHz']==120 and summary['fps']>=118 and max(times)<=9 and row['simulationSeconds']>=row['seconds']*.98
   row['summary']=summary;row['setup']=setup;assert row['population']==setup['population'];report['cases'][case]=summary;(OUT/(case+'.json')).write_text(json.dumps(row));page.screenshot(path=str(OUT/(case+'.png')));context.close();print(json.dumps({'case':case,**summary}),flush=True)
   if case=='battle':assert summary['acceptedShots']>0,'The battle fixture never fired a weapon'
  browser.close()
finally:
 report['powerAfter']=support.power_status();report['sourceStable']=support.source_hashes(args.source_root)==report['sourceHashes'];(OUT/'report.json').write_text(json.dumps(report,indent=2));server.shutdown();server.server_close()
