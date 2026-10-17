"""Repeatable real-browser NPC/Dev-map timing with an optional exact Git baseline.

python tests/browser-npc-performance.py --revision 90998f0 --label before --regressions
python tests/browser-npc-performance.py --label after

The same isolated Edge profile, 1280x850 viewport, saved initial population and
six-second windows are used in both runs. Measurements exclude initial loading.
"""
import argparse
import functools
import hashlib
import http.server
import json
import mimetypes
import os
from pathlib import Path
import platform
import statistics
import subprocess
import threading
import time
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results'


class SnapshotHandler(http.server.SimpleHTTPRequestHandler):
    """Serve mutable source from Git; stable binary artwork stays on disk."""
    revision = None
    cache = {}

    def log_message(self, *_args):
        pass

    def do_GET(self):
        relative = unquote(urlsplit(self.path).path).lstrip('/')
        if self.revision and Path(relative).suffix.lower() in {'.js', '.html', '.css', '.json'}:
            key = (self.revision, relative)
            if key not in self.cache:
                result = subprocess.run(['git', 'show', f'{self.revision}:{relative}'],
                                        cwd=ROOT, capture_output=True)
                self.cache[key] = result.stdout if result.returncode == 0 else None
            content = self.cache[key]
            if content is None:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', mimetypes.guess_type(relative)[0] or 'application/octet-stream')
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(content)
            return
        return super().do_GET()


INSTRUMENT = r"""() => {
  window.__npcPerf = {record:false,frames:[],prepares:[],unreadyPreparations:new Set(),paintedShips:0,distantUpdates:0,scheduledEvents:0,detailedPeak:0,detailedByOwner:{},moves:new Set(),timers:{},simStart:null,simMs:0};
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>raf(function(timestamp){
    if(callback.name!=='draw')return callback(timestamp);
    const p=window.__npcPerf,start=performance.now();p.simMs=0;p.simStart=null;
    p.moves=new Set();p.timers={};const elapsed=timestamp-(p.lastTimestamp??timestamp);p.lastTimestamp=timestamp;
    try{return callback(timestamp);}finally{
      const total=performance.now()-start;
      if(p.record)p.frames.push({simulationMs:p.simMs,renderMs:Math.max(0,total-p.simMs),
        callbackMs:total,intervalMs:elapsed,moved:p.moves.size,owners:{...p.timers}});
    }
  });
}"""

INSTALL = r"""() => {
  const p=window.__npcPerf;
  const replace=(name,methods)=>{
    const original=window[name];if(!original)return;
    const replacement={...original};
    for(const [method,wrapper] of Object.entries(methods))if(typeof original[method]==='function'){
      replacement[method]=wrapper(original[method]);
    }
    window[name]=replacement;
  };
  replace('nativeSimulation',{advance:original=>function(state,dt){p.simStart=performance.now();return original(state,dt);}});
  // End timing after the final physics dispatcher, including ship contacts.
  // Old revisions predate these dispatchers, so retain their actual final owner.
  const finalOwner=window.nativeShipTraffic?'nativeShipTraffic':window.nativeAsteroidMotion?'nativeAsteroidMotion':'nativeAsteroidCombat';
  const finalMethod=finalOwner==='nativeAsteroidCombat'?'advance':'collide';
  replace(finalOwner,{[finalMethod]:original=>function(...args){try{return original(...args);}finally{
    if(p.simStart!==null){p.simMs+=performance.now()-p.simStart;p.simStart=null;}
  }}});
  replace('nativeShipMotion',{step:original=>function(entity,...args){p.moves.add(entity);return original(entity,...args);}});
  replace('nativeShipEffects',{
    prepare:original=>function(...args){if(p.record){p.prepares.push(args);if(!window.nativeShipEffects.ready(...args))p.unreadyPreparations.add(args.join(':'));}return original(...args);},
    paintShip:original=>function(...args){if(p.record)p.paintedShips++;return original(...args);}
  });
  for(const name of ['nativeCivilianTraffic','nativeSolEconomy','nativeNpcLives','nativeCombatShots','nativeShipEffects','nativeShipTraffic']){
    replace(name,{advance:original=>function(...args){const start=performance.now();try{return original(...args);}finally{
      p.timers[name]=(p.timers[name]||0)+performance.now()-start;
    }}});
  }
  for(const name of ['nativeNpcLives','nativeSolEconomy']){
    replace(name,{advance:original=>function(...args){try{return original(...args);}finally{
      if(p.record){const m=name==='nativeNpcLives'?window.nativeNpcLives.metrics(args[0]):args[0].solEconomy.lifeMetrics;
        p.distantUpdates+=m?.distantUpdates||0;p.scheduledEvents+=m?.scheduledEvents||0;
        p.detailedByOwner[name]=m?.detailedShips||m?.detailed||0;
        p.detailedPeak=Math.max(p.detailedPeak,Object.values(p.detailedByOwner).reduce((total,value)=>total+value,0));
      }
    }}});
  }
  replace('nativeCivilianTraffic',{
    initialize:original=>function(state,...args){window.__npcPerfState=state;return original(state,...args);},
    advance:original=>function(state,...args){window.__npcPerfState=state;return original(state,...args);}
  });
  startNativeDevGame();
}"""


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[min(len(ordered)-1, int((len(ordered)-1)*fraction))] if ordered else 0


def summary(samples):
    result = {'frames': len(samples)}
    for field in ['simulationMs', 'renderMs', 'callbackMs', 'intervalMs', 'moved']:
        values = [frame[field] for frame in samples]
        result[field] = {'mean': statistics.mean(values) if values else 0,
                         'p50': percentile(values, .5), 'p95': percentile(values, .95),
                         'p99': percentile(values, .99), 'max': max(values, default=0)}
    result['frameSpikesOver33ms'] = sum(frame['intervalMs'] > 33.34 for frame in samples)
    result['frameSpikesOver50ms'] = sum(frame['intervalMs'] > 50 for frame in samples)
    owners = sorted({owner for frame in samples for owner in frame['owners']})
    result['ownerMsPerFrame'] = {owner: statistics.mean(frame['owners'].get(owner, 0) for frame in samples) for owner in owners}
    return result


def state_metrics(page):
    return page.evaluate(r"""() => {
      const state=window.__npcPerfState;
      const npcs=state.civilianTraffic.ships,tugs=state.solEconomy.freighters;
      const lives=window.nativeNpcLives;
      return {population:npcs.length+tugs.length+1,civilians:npcs.length,tugs:tugs.length,
        localCivilianPopulation:npcs.filter(ship=>ship.system===state.system).length,
        system:state.system,simulationSeconds:nativeSimulation.seconds(state),
        scheduler:lives?.metrics?lives.metrics(state):null,
        artworkPreparationCalls:window.__npcPerf.prepares.length,
        distinctUnreadyArtworkRequests:window.__npcPerf.unreadyPreparations.size,
        shipArtworkDraws:window.__npcPerf.paintedShips,
        measuredDistantUpdates:window.__npcPerf.distantUpdates,
        measuredScheduledEvents:window.__npcPerf.scheduledEvents,
        detailedShipPeak:window.__npcPerf.detailedPeak,
        gameDiagnostics:window.nativeSimulationMetrics?.snapshot?.()||null};
    }""")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', help='Serve tracked text from this exact Git revision')
    parser.add_argument('--label', default='after')
    parser.add_argument('--seconds', type=float, default=6)
    parser.add_argument('--regressions', action='store_true')
    parser.add_argument('--base-url')
    args = parser.parse_args()
    OUTPUT.mkdir(exist_ok=True)
    SnapshotHandler.revision = args.revision
    server = None
    if args.base_url:
        base = args.base_url.rstrip('/')
    else:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(SnapshotHandler, directory=str(ROOT)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
    errors, failed = [], []
    report = {'label': args.label, 'sourceRevision': args.revision or 'working tree', 'viewport': {'width':1280,'height':850},
              'windowSeconds':args.seconds,'warmupSeconds':2,'platform':platform.system(),'channel':os.environ.get('BROWSER_CHANNEL','msedge')}
    try:
        with sync_playwright() as playwright:
            channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
            browser = playwright.chromium.launch(headless=True, **({'channel':channel} if channel else {}))
            report['browserVersion'] = browser.version
            page = browser.new_page(viewport=report['viewport'])
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
            page.add_init_script('('+INSTRUMENT+')()')
            page.goto(base+'/html-games/broken-mirror-port/index.html')
            report['device'] = page.evaluate('({hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,devicePixelRatio:window.devicePixelRatio,userAgent:navigator.userAgent})')
            page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate(INSTALL)
            page.wait_for_function('() => window.__npcPerfState && nativeCivilianTraffic.effectsReady() && nativeSolAsteroids.placements.length',timeout=120000)
            page.wait_for_timeout(2000)
            # Reuse the identical serialized initial population for before/after.
            fixture = OUTPUT/'npc-performance-initial-save.json'
            if not fixture.exists():
                fixture.write_text(page.evaluate('JSON.stringify(window.__npcPerfState)'),encoding='utf-8')
            saved = fixture.read_text(encoding='utf-8')
            page.evaluate('(saved)=>{window.__npcPerfPreviousState=window.__npcPerfState;window.__npcPerfBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};localStorage.setItem("broken-mirror-native-save",saved);resumeNativeGame();}',saved)
            page.wait_for_function('() => window.__npcPerfState!==window.__npcPerfPreviousState')
            # Rewarm the restored artwork without advancing the saved lives.
            page.wait_for_timeout(2000)
            page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:window.__npcPerfBlocked};}')
            page.wait_for_timeout(100)
            report['initialSaveSha256'] = hashlib.sha256(fixture.read_bytes()).hexdigest()
            for mode in ['flight','devMap']:
                if mode=='devMap':
                    page.locator('#devToolsBtn').click()
                    page.locator('#galaxy-map-button').click()
                    page.wait_for_timeout(2000)
                page.evaluate('()=>{const p=window.__npcPerf;p.frames=[];p.prepares=[];p.unreadyPreparations=new Set();p.paintedShips=0;p.distantUpdates=0;p.scheduledEvents=0;p.detailedPeak=0;p.detailedByOwner={};p.record=true;window.nativeSimulationMetrics?.reset?.();}')
                before = state_metrics(page)
                page.wait_for_timeout(args.seconds*1000)
                page.evaluate('window.__npcPerf.record=false')
                after = state_metrics(page)
                samples = page.evaluate('window.__npcPerf.frames')
                report[mode] = {**summary(samples),'before':before,'after':after}
                (OUTPUT/f'npc-performance-{args.label}-{mode}-frames.json').write_text(json.dumps(samples),encoding='utf-8')
                page.screenshot(path=str(OUTPUT/f'npc-performance-{args.label}-{mode}.png'))
            assert not errors, errors
            assert not failed, failed
            report.update(passed=True,javascriptErrors=errors,failedResponses=failed)
            browser.close()
        (OUTPUT/f'npc-performance-{args.label}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        if args.regressions:
            report['regressions']={}
            for name in ['browser-smoke.py','browser-ship-contract.py']:
                start=time.perf_counter()
                result=subprocess.run(['python',str(ROOT/'tests'/name),base],cwd=ROOT,capture_output=True,text=True)
                (OUTPUT/f'npc-{args.label}-{name}.txt').write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
                report['regressions'][name]={'exitCode':result.returncode,'elapsedSeconds':time.perf_counter()-start}
                assert result.returncode==0, result.stdout+'\n'+result.stderr
        (OUTPUT/f'npc-performance-{args.label}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        before_file=OUTPUT/'npc-performance-before.json'
        if args.label=='after' and before_file.exists():
            before=json.loads(before_file.read_text(encoding='utf-8'))
            assert before['initialSaveSha256']==report['initialSaveSha256'],'Performance runs used different saved populations'
            comparison={'sameInitialSaveSha256':report['initialSaveSha256'],'sameViewport':before['viewport']==report['viewport'],
                        'sameBrowser':before['browserVersion']==report['browserVersion']}
            for mode in ['flight','devMap']:
                assert before[mode]['before']['population']==report[mode]['before']['population'],'Population changed between measurements'
                comparison[mode]={field:{'beforeMs':before[mode][field]['mean'],'afterMs':report[mode][field]['mean'],
                                        'reductionPercent':100*(1-report[mode][field]['mean']/before[mode][field]['mean'])}
                                  for field in ['simulationMs','renderMs','callbackMs']}
                comparison[mode].update(population=report[mode]['before']['population'],
                                        beforeP95FrameMs=before[mode]['intervalMs']['p95'],afterP95FrameMs=report[mode]['intervalMs']['p95'],
                                        beforeSpikesOver50ms=before[mode]['frameSpikesOver50ms'],afterSpikesOver50ms=report[mode]['frameSpikesOver50ms'])
            (OUTPUT/'npc-performance-comparison.json').write_text(json.dumps(comparison,indent=2),encoding='utf-8')
        print(json.dumps({'passed':report['passed'],'label':args.label,'initialSaveSha256':report['initialSaveSha256'],
                          'flight':report['flight']['simulationMs'],'devMap':report['devMap']['simulationMs'],
                          'regressions':report.get('regressions',{})},indent=2))
    finally:
        if server:
            server.shutdown()


if __name__=='__main__':
    main()
