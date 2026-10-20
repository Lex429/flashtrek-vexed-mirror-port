"""Same-save sustained-hit frame delivery and verified-save cost measurements.

Uses isolated browser storage. No player's local save is read or changed.
Example: python tests/browser-combat-performance.py --revision 01d5ea2 --label before
         python tests/browser-combat-performance.py --label after
Timing results are diagnostic measurements, not portable pass/fail thresholds.
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

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'combat-performance'
spec = importlib.util.spec_from_file_location('npc_performance', ROOT / 'tests/browser-npc-performance.py')
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)

INSTRUMENT = r"""() => {
  const p=window.__combatPerf={record:false,frames:[],saves:[],hits:[],depth:0,last:null,frame:null};
  const raf=requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>raf(timestamp=>{
    if(callback.name!=='draw')return callback(timestamp);
    const started=performance.now(),interval=p.last===null?0:timestamp-p.last;p.last=timestamp;p.frame=null;
    try{return callback(timestamp);}finally{if(p.record)p.frames.push({intervalMs:interval,
      callbackMs:performance.now()-started,simulationMs:p.frame?.simulation||0,renderMs:p.frame?.render||0});}
  });
  const stringify=JSON.stringify;
  JSON.stringify=function(...args){const started=performance.now();try{return stringify.apply(this,args);}
    finally{if(p.depth&&p.current){p.current.stringifyMs+=performance.now()-started;p.current.stringifyCalls++;}}};
  for(const method of ['setItem','getItem']){const original=Storage.prototype[method];
    Storage.prototype[method]=function(...args){const started=performance.now();try{return original.apply(this,args);}
      finally{if(p.depth&&p.current){p.current[method+'Ms']+=performance.now()-started;p.current[method+'Calls']++;}}};}
}"""

INSTALL = r"""() => {
  const p=__combatPerf;
  const metrics=nativeSimulationMetrics.record;
  window.nativeSimulationMetrics={...nativeSimulationMetrics,record(state,data){p.frame=data;return metrics(state,data);}};
  const saves={...nativeSaveStorage};
  // Coalesced flushes call the save owner's private write function. Instrument
  // their public boundary as well, admitting only real storage writes.
  for(const api of ['write','flush','flushDue'])if(typeof saves[api]==='function'){
    const original=saves[api];saves[api]=function(state,...args){
      const started=performance.now(),entry={api,at:started,simulationSeconds:nativeSimulation.seconds(state),
        stringifyMs:0,stringifyCalls:0,setItemMs:0,setItemCalls:0,getItemMs:0,getItemCalls:0};
      p.current=entry;p.depth++;
      try{const result=original(state,...args);entry.ok=result.ok;return result;}
      finally{p.depth--;p.current=null;entry.totalMs=performance.now()-started;
        if(p.record&&(entry.setItemCalls||entry.ok===false))p.saves.push(entry);}
    };
  }
  window.nativeSaveStorage=saves;
  const advance=nativeCivilianTraffic.advance;
  nativeCivilianTraffic.advance=function(state,...args){window.__combatState=state;return advance(state,...args);};
  const hit=nativeCivilianTraffic.hit;
  nativeCivilianTraffic.hit=function(state,id,damage,impact){const result=hit(state,id,damage,impact);
    if(p.record&&impact?.source==='player'&&result?.ok)p.hits.push({at:performance.now(),simulationSeconds:nativeSimulation.seconds(state),id,damage});
    return result;};
  startNativeDevGame();
}"""

MAKE_FIXTURE = r"""mounts => {
  const state=__combatState,clone=value=>JSON.parse(JSON.stringify(value));
  const target=state.civilianTraffic.ships.find(ship=>ship.shipType===52);
  if(!target)throw Error('Production fixture has no type52 civilian');
  nativeNpcLives.interrupt?.(state,target,'controlled-combat-measurement');
  for(const key of ['localLeg','journey','motionKick','motionSpin','dockingMove','arrivalApproach','localCruise'])delete target[key];
  const def=nativeShipDefinitions.forEntity(state,target,{category:'civilian'});
  Object.assign(target,{system:1,x:100240,y:100000,heading:Math.PI,speed:0,vx:0,vy:0,
    hull:def.hull*.25,shields:def.shields,phase:'disabled'});
  nativeShipMotion.stop(target);
  Object.assign(state,{devMode:false,system:1,localBody:3,x:100000,y:100000,angle:0,speed:0,
    landed:false,shipType:47,phase:'cruise',weapons:[4,mounts===3?4:null,mounts===3?4:null],weaponInventory:[]});
  for(const key of ['shipEquipment','weaponLoadout','localCruise','arrivalApproach','motionKick','motionSpin','weaponCombat'])delete state[key];
  nativeShipEquipment.ensure(state);const player=nativeShipDefinitions.forEntity(state,state,{category:'player'});
  state.hull=player.hull;state.shields=player.shields;nativeShipMotion.stop(state);
  // Preserve the registered fleet and normal shared hardware. Only the two
  // participants' poses and this legitimate disabled state define the scenario.
  const origin=vexedSolFlight.shipPosition(state);target.x=origin.x+240;target.y=origin.y;
  state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];
  nativeShipSystems.invalidate(state);state.combatPerformanceFixture={version:1,targetId:target.id};
  return JSON.stringify(clone(state));
}"""

SETUP = r"""async saved => {
  const p=__combatPerf;p.record=false;
  nativePause.close();nativeShipInventory.close();
  const state=JSON.parse(saved);if(!nativeSaveStorage.write(state).ok)throw Error('Fixture write failed');
  resumeNativeGame('normal');
  return true;
}"""

def stat(values):
    return {'mean': sum(values) / len(values) if values else 0,
            'p50': legacy.percentile(values, .5), 'p95': legacy.percentile(values, .95),
            'p99': legacy.percentile(values, .99), 'max': max(values, default=0)}


def summarize(sample):
    frames, saves = sample['frames'], sample['saves']
    return {'frames': len(frames), 'playerHits': len(sample['hits']), 'verifiedSaves': len(saves),
            'saveFailures': sum(not save['ok'] for save in saves),
            'saveCpuTotalMs': sum(save['totalMs'] for save in saves),
            'frameSpikesOver33ms': sum(frame['intervalMs'] > 33.34 for frame in frames),
            'frameSpikesOver50ms': sum(frame['intervalMs'] > 50 for frame in frames),
            **{field: stat([frame[field] for frame in frames]) for field in ['intervalMs', 'callbackMs', 'simulationMs', 'renderMs']},
            'saveCostMs': {field: stat([save[field] for save in saves]) for field in ['totalMs', 'stringifyMs', 'setItemMs', 'getItemMs']}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision')
    parser.add_argument('--label', default='after')
    parser.add_argument('--seconds', type=float, default=20)
    parser.add_argument('--runs', type=int, default=3)
    parser.add_argument('--mounts', type=int, choices=[1, 3], default=3)
    parser.add_argument('--fixture', type=Path)
    parser.add_argument('--note', action='append', default=[], help='Record environmental or sampling limitations')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    args.fixture = args.fixture or OUTPUT / f'initial-save-{args.mounts}-mounts.json'
    legacy.SnapshotHandler.revision = args.revision
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(legacy.SnapshotHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors, failed = [], []
    report = {'label': args.label, 'revision': args.revision or 'working tree',
              'workingHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'platform': platform.platform(), 'viewport': {'width': 1280, 'height': 850},
              'windowSeconds': args.seconds, 'runCount': args.runs, 'mounts': args.mounts,
              'notes': args.note,
              'scenario': 'Actual Space taps every 100 ms against a disabled civilian with ordinary shared shields/hull and installed equipment; full saved production fleet remains active. This isolates sustained-hit save costs; it does not establish AI combat smoothness.',
              'runs': []}
    try:
        with sync_playwright() as playwright:
            channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
            browser = playwright.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
            report.update(browserVersion=browser.version, channel=channel)
            report['workingSourceSha256'] = {str(path.relative_to(ROOT)).replace('\\', '/'):
                hashlib.sha256(path.read_bytes()).hexdigest()
                for path in sorted((ROOT / 'html-games' / 'broken-mirror-port').glob('*.js'))}
            for index in range(args.runs):
                page = browser.new_page(viewport=report['viewport'])
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
                page.add_init_script('(' + INSTRUMENT + ')()')
                page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
                report['device'] = page.evaluate('({hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,devicePixelRatio:devicePixelRatio,userAgent:navigator.userAgent})')
                page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
                page.evaluate(INSTALL)
                page.wait_for_function('() => __combatState && nativeCivilianTraffic.effectsReady() && nativeSolAsteroids.placements.length', timeout=120000)
                if not args.fixture.exists():
                    args.fixture.parent.mkdir(parents=True, exist_ok=True)
                    args.fixture.write_text(page.evaluate(MAKE_FIXTURE, args.mounts), encoding='utf-8')
                saved = args.fixture.read_text(encoding='utf-8')
                report['initialSaveSha256'] = hashlib.sha256(args.fixture.read_bytes()).hexdigest()
                page.evaluate(SETUP, saved)
                page.wait_for_function('() => __combatState.combatPerformanceFixture?.version===1')
                page.wait_for_timeout(2500)
                start = page.evaluate(r"""async () => {
                  const s=__combatState,p=__combatPerf,id=s.combatPerformanceFixture.targetId;
                  const target=s.civilianTraffic.ships.find(ship=>ship.id===id);
                  await nativeShipEffects.prepare(s.shipType,'player');await nativeShipEffects.prepare(target.shipType,'civilian');
                  nativeSolEconomy.clearTarget();nativeAsteroidCombat.deselect();nativeCivilianTraffic.select(id);
                  document.querySelector('#space').focus();p.frames=[];p.saves=[];p.hits=[];p.record=true;
                  window.__combatFireTimer=setInterval(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
                    document.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));},100);
                  return {population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,
                    civilians:s.civilianTraffic.ships.length,tugs:s.solEconomy.freighters.length,targetId:id,
                    targetHull:target.hull,targetShields:target.shields,simulationSeconds:nativeSimulation.seconds(s),
                    fitted:nativeWeaponLoadout.equipped(s).map(item=>({model:item.weapon.id,instance:item.instance.id}))};
                }""")
                report['population'] = start['population']
                assert len(start['fitted']) == args.mounts, 'Fixture mount count differs from the requested workload'
                assert len({item['instance'] for item in start['fitted']}) == args.mounts, 'Mounts must own distinct equipment'
                page.wait_for_timeout(args.seconds * 1000)
                sample = page.evaluate(r"""() => {
                  clearInterval(__combatFireTimer);const p=__combatPerf;p.record=false;const s=__combatState;
                  const target=s.civilianTraffic.ships.find(ship=>ship.id===s.combatPerformanceFixture.targetId);
                  return {frames:p.frames,saves:p.saves,hits:p.hits,end:{simulationSeconds:nativeSimulation.seconds(s),
                    targetHull:target.hull,targetShields:target.shields,targetPhase:target.phase,
                    targetDistance:Math.hypot(target.x-vexedSolFlight.shipPosition(s).x,target.y-vexedSolFlight.shipPosition(s).y)}};
                }""")
                assert sample['hits'], 'No actual player hits; cannot measure sustained-hit saving'
                assert all(save['ok'] for save in sample['saves']), 'A measured save failed'
                run = {'index': index + 1, 'start': start, 'end': sample['end'], **summarize(sample)}
                report['runs'].append(run)
                (OUTPUT / f'{args.label}-{index + 1}-raw.json').write_text(json.dumps(sample), encoding='utf-8')
                page.screenshot(path=str(OUTPUT / f'{args.label}-{index + 1}.png'))
                page.close()
                print(json.dumps(run), flush=True)
            browser.close()
        assert not errors, errors
        assert not failed, failed
        report.update(passed=True, javascriptErrors=errors, failedResponses=failed)
        (OUTPUT / f'{args.label}.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
