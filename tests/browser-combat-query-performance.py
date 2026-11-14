"""Matched firing-feedback CPU probe. This deliberately does not measure FPS.

Compare frozen sources with identical weapon rules/stats to isolate query reuse.
Whole-game timing belongs to browser-performance-review.py.
"""
import argparse
import functools
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import statistics
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('combat_stability', ROOT/'tests/browser-stability.py')
stability = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stability)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

PROBE = r'''() => {
  const s=nativeNpcDev.getState(),owner=nativeShipSystems;
  window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
  // Exercise the two projectile families, rather than this save's beam-only
  // starter fit. Both sources keep the original speeds, arcs and damage data.
  s.shipType=47;s.weapons=[6,15];delete s.shipEquipment;delete s.weaponLoadout;
  nativeShipEquipment.ensure(s);owner.invalidateShips(s);
  const source=nativeShipDefinitions.describe(s,s,{category:'player'}),
    target=owner.resolve(s,s.civilianTraffic.ships[0].id,s.system);
  let scenes=0,sweeps=0;
  window.nativeShipSystems={...owner,collisionScene(...args){
    scenes++;const scene=owner.collisionScene(...args);
    return {...scene,querySwept(...query){sweeps++;return scene.querySwept(...query);}};
  }};
  const feedback=()=>nativeCombatShots.firingStatus(s,source,target);
  for(let i=0;i<200;i++)feedback();
  scenes=0;sweeps=0;
  const samples=[],callsPerSample=200;
  for(let batch=0;batch<16;batch++){
    const start=performance.now();
    for(let i=0;i<callsPerSample;i++)feedback();
    samples.push(performance.now()-start);
  }
  const result=feedback();
  return {samples,callsPerSample,measuredCalls:3201,scenes,sweeps,
    population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,
    weapons:result.weapons.map(w=>({id:w.weapon.id,spec:w.spec})),reason:result.reason};
}'''

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before',type=Path,required=True)
    parser.add_argument('--after',type=Path,required=True)
    parser.add_argument('--fixture',type=Path,required=True)
    args=parser.parse_args()
    saved=args.fixture.read_text(encoding='utf8')
    report={'fixtureSha256':hashlib.sha256(args.fixture.read_bytes()).hexdigest(),
            'kind':'isolated firing-feedback CPU; not FPS','runs':[]}
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        # Alternate order to expose one-time preparation/order effects.
        for name in ['before','after','after','before']:
            source=getattr(args,name).resolve()
            server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(source)))
            threading.Thread(target=server.serve_forever,daemon=True).start()
            page=browser.new_page(viewport={'width':1366,'height':768});errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            try:
                page.add_init_script('('+stability.INSTRUMENT+')()')
                page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
                page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
                page.evaluate(stability.INSTALL)
                page.wait_for_function('()=>nativeNpcDev.getState()&&nativeCivilianTraffic.effectsReady()',timeout=120000)
                page.evaluate(stability.SETUP,{'saved':saved,'mode':'crowdedCombat'})
                result=page.evaluate(PROBE)
                assert not errors,errors
                result.update(source=name,root=str(source),javascriptErrors=errors)
                result['medianBatchMs']=statistics.median(result['samples'])
                report['runs'].append(result)
                print(json.dumps({k:result[k] for k in ['source','medianBatchMs','scenes','sweeps','population']}),flush=True)
            finally:
                page.close();server.shutdown();server.server_close()
        browser.close()
    runs=report['runs']
    assert all(r['weapons']==runs[0]['weapons'] for r in runs),'Weapon tuning confounded CPU comparison'
    assert [w['id'] for w in runs[0]['weapons']]==[6,15],'Projectile fixture was not fitted'
    assert all(r['population']==runs[0]['population'] for r in runs),'Different populations'
    assert all(r['scenes']==0 and r['sweeps']==0 for r in runs if r['source']=='after'),'Feedback still queries unused geometry'
    output=ROOT/'test-results/combat-refine/query-performance.json'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2),encoding='utf8')

if __name__=='__main__':
    main()
