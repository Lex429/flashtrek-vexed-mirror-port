"""Sequential same-save storm on/off costs through the real game.

Stationkeeping with the production fleet, not a Chromebook/monitor qualification.
Run without other timing or test workers. Raw slow windows are retained.
"""
import argparse,functools,hashlib,http.server,importlib.util,json,os,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('storm_stability',ROOT/'tests/browser-stability.py')
stability=importlib.util.module_from_spec(spec);spec.loader.exec_module(stability)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def hashes(source):
 return {str(p.relative_to(source)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in (source/'html-games').rglob('*') if p.is_file() and p.suffix in {'.js','.css','.html','.json'}}
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--source-root',type=Path,default=ROOT);parser.add_argument('--seconds',type=float,default=8)
 parser.add_argument('--output',type=Path,default=ROOT/'test-results/dev-nebula-storm/performance')
 args=parser.parse_args();source=args.source_root.resolve();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(source)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 report={'scope':'Headless native game, stationary ship in compact Dev Sol cloud, same full saved fleet; not FPS qualification','sourceHashes':hashes(source),'windows':[],'errors':[]}
 try:
  with sync_playwright() as p:
   channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
   saved=None
   for enabled in [False,True,True,False]:
    page=browser.new_page(viewport={'width':1366,'height':768},device_scale_factor=1,reduced_motion='no-preference')
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.add_init_script('('+stability.INSTRUMENT+')()')
    page.add_init_script('(()=>{let seed=4292026;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};})()')
    page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
    page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
    page.evaluate(stability.INSTALL)
    page.evaluate('nativeDevFog.setEnabled(true)')
    page.wait_for_function('()=>nativeNpcDev.getState()&&nativeCivilianTraffic.effectsReady()',timeout=120000)
    if saved is None:
     saved=page.evaluate('JSON.stringify(nativeNpcDev.getState())');(out/'fixture.json').write_text(saved,encoding='utf8')
     report['fixtureSha256']=hashlib.sha256(saved.encode()).hexdigest()
     report['device']=page.evaluate('({userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency,memory:navigator.deviceMemory,dpr:devicePixelRatio})')
    population=page.evaluate(stability.SETUP,{'saved':saved,'mode':'flight'})
    page.evaluate('''()=>{nativeShipMotion.stop(nativeNpcDev.getState());nativeDevFog.setPreset('badlands');nativeDevFog.setStormEnabled(false);nativeDevFog.reset({ahead:0});}''')
    page.wait_for_function('()=>nativeDevFog.material()?.field.ready&&nativeDevFog.snapshot().renderer.mode==="shared-material"',timeout=120000)
    page.wait_for_timeout(2500)
    before=page.evaluate('''enabled=>{nativeDevFog.setStormEnabled(enabled);__stability.frames=[];__stability.longTasks=[];__stability.record=true;
     const s=nativeNpcDev.getState();window.__stormMeasureStart=performance.now();return {seconds:nativeSimulation.seconds(s),storm:nativeDevFog.snapshot().storm.renderer};}''',enabled)
    page.wait_for_timeout(args.seconds*1000)
    row=page.evaluate('''()=>{__stability.record=false;const s=nativeNpcDev.getState();return {wallSeconds:(performance.now()-__stormMeasureStart)/1000,
     frames:__stability.frames,longTasks:__stability.longTasks,simulationSeconds:nativeSimulation.seconds(s),physicsDebt:s.shipSimulation.schedule.pendingSeconds,
     population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,fog:nativeDevFog.snapshot()};}''')
    assert row['population']==population['population']==1210,row['population']
    intervals=sorted(r['intervalMs'] for r in row['frames'] if r['intervalMs']>0)
    renderer=row['fog']['storm']['renderer'];draws=renderer['draws']-before['storm']['draws'];cpu=renderer['paintMs']-before['storm']['paintMs']
    summary={'storm':enabled,'fps':len(row['frames'])/row['wallSeconds'],'p95Ms':intervals[min(len(intervals)-1,int(len(intervals)*.95))],
     'worstMs':max(intervals),'over50':sum(n>50 for n in intervals),'simulationSeconds':row['simulationSeconds']-before['seconds'],'physicsDebt':row['physicsDebt'],
     'lightLayerDraws':draws,'lightPaintCpuMs':cpu,'cpuMsPerLitLayer':cpu/draws if draws else 0,'stormTextureBytes':renderer['textureBytes'],'population':row['population']}
    if enabled:assert draws>0,'The storm timing window contained no visible flashes'
    row['summary']=summary;report['windows'].append(summary)
    (out/f'window-{len(report["windows"])}.json').write_text(json.dumps(row),encoding='utf8')
    print(json.dumps(summary),flush=True);page.close()
   browser.close()
  report['sourceStable']=hashes(source)==report['sourceHashes'];assert report['sourceStable'],'Source changed during measurement'
  assert not report['errors'],report['errors']
 finally:
  (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');server.shutdown();server.server_close()
if __name__=='__main__':main()
