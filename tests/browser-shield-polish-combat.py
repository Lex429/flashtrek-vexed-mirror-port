"""Separate native-combat verification, with normal ship lighting ON. Not 100-ship battle acceptance."""
import argparse
import collections
import functools
import hashlib
import http.server
import json
import math
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
CORE='html-games/flashtrek-broken-mirror/shield-gpu.js'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline',type=Path,required=True)
    parser.add_argument('--driver-fixture',type=Path,required=True)
    parser.add_argument('--save',type=Path,required=True,help='Previously isolated test save; read only')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    driver=json.loads(args.driver_fixture.read_text());saved=args.save.read_text(encoding='utf-8')
    install=driver['INSTALL'];begin=install.index(' const cache=nativeShipSpriteCache;');end=install.index(' const metrics=nativeSimulationMetrics;')
    install=install[:begin]+install[end:]  # Retain ordinary ship lighting and its actual costs.
    civilian_path='html-games/broken-mirror-port/civilian-traffic.js'
    civilian=(ROOT/civilian_path).read_text(encoding='utf-8');needle='  window.nativeCivilianTraffic={hail,initialize,'
    assert civilian.count(needle)==1
    civilian=civilian.replace(needle,'  window.__battleRetaliate=retaliate;\n'+needle)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    report={'scope':__doc__,'lighting':'ON','viewport':[1280,850],'dpr':1,'freshProfiles':True,
            'saveSHA256':hashlib.sha256(args.save.read_bytes()).hexdigest(),'runs':[]}
    def write():(out/'results.json').write_text(json.dumps(report,indent=2))
    try:
      with sync_playwright() as p:
       for variant in ['baseline','polished']:
        print('Native combat',variant,'setup',flush=True)
        source=(args.baseline/'shield-gpu.js').read_bytes() if variant=='baseline' else (ROOT/CORE).read_bytes()
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));report['browser']=browser.version
        page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1);page.set_default_timeout(180000)
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)));page.add_init_script(driver['INIT'])
        page.route('**/shield-gpu.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=source))
        page.route('**/'+civilian_path+'*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=civilian))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.vexedShieldGPU?.available&&nativeCombatShots.isReady()&&document.querySelector("#startup").hidden')
        page.evaluate('()=>startNativeDevGame()');page.wait_for_function('()=>nativeNpcDev.getState()&&nativeSolAsteroids.placements.length')
        page.evaluate(install);scene=page.evaluate(driver['SETUP'],{'saved':saved,'count':20})
        page.wait_for_function('()=>!nativeShipEffects.metrics().pending&&!vexedFlightAssets.cacheSnapshot().ships.pending&&!nativeDamageArtPreparation.snapshot().pending')
        setup=page.evaluate(driver['BATTLE']);page.locator('#space').focus()
        print('Native combat',variant,'20 seconds',flush=True)
        raw=page.evaluate(driver['MEASURE']);visual=page.evaluate('vexedShieldGPU.snapshot()')
        frames=raw['frames'];intervals=[f['interval'] for f in frames];ordered=sorted(intervals)
        counts=collections.Counter(hit['event'] for hit in raw['damage'] if hit.get('event') is not None)
        shots=raw['shots'];targets={shot['id']:str(shot['target']) for shot in shots}
        row={'variant':variant,'sourceSHA256':hashlib.sha256(source).hexdigest(),'scene':scene,'setup':setup,
             'fps':1000*len(intervals)/sum(intervals),'meanMs':sum(intervals)/len(intervals),
             'p95Ms':ordered[math.ceil(.95*len(ordered))-1],'p99Ms':ordered[math.ceil(.99*len(ordered))-1],
             'worstMs':max(intervals),'over50':sum(v>50 for v in intervals),
             'visibleMin':min(f['drawn'] for f in frames),'visibleMax':max(f['drawn'] for f in frames),
             'activeCombatantsMin':min(f['activeCombatants'] for f in frames),'activeCombatantsMax':max(f['activeCombatants'] for f in frames),
             'shots':len(shots),'beamShots':sum(s['kind']=='beam' for s in shots),
             'projectileShots':sum(s['kind']!='beam' for s in shots),'maxDamagePerShot':max(counts.values(),default=0),
             'shieldImpacts':sum(h['absorbed']>0 for h in raw['damage']),
             'interveningHits':sum(str(h['target'])!=targets.get(h.get('event'),str(h['target'])) for h in raw['damage']),
             'shieldDamage':sum(h['absorbed'] for h in raw['damage']),'hullDamage':sum(h['hullDamage'] for h in raw['damage']),
             'simulationSeconds':raw['end']['simulation']-raw['start']['simulation'],
             'wallSeconds':(raw['end']['wall']-raw['start']['wall'])/1000,'debtEnd':raw['end']['pending'],'visual':visual}
        assert row['shots']>0 and row['beamShots']>0 and row['projectileShots']>0 and row['shieldImpacts']>0 and row['hullDamage']>0
        assert row['maxDamagePerShot']==1 and visual['events']>0 and visual['peakActiveShields']>0
        assert not errors,errors
        stateCheck=page.evaluate('''()=>{const state=nativeNpcDev.getState(),before=JSON.stringify(state),time=nativeSimulation.now(state);
          for(let i=0;i<20;i++)vexedShieldGPU.renderer.render(time,{effects:true,ships:false,background:false});
          return before===JSON.stringify(state);}''');assert stateCheck
        row['pureRenderPreservesWholeState']=stateCheck
        (out/(variant+'-raw.json')).write_text(json.dumps(raw));page.screenshot(path=str(out/(variant+'-combat.png')))
        report['runs'].append(row);write();browser.close()
        print(json.dumps({k:row[k] for k in ['variant','fps','p95Ms','visibleMin','visibleMax','shots','shieldImpacts','maxDamagePerShot']}),flush=True)
       report['complete']=True
    finally:write();server.shutdown()

if __name__=='__main__':main()
