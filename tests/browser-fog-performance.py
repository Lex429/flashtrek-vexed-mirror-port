"""Same-save, full-game Intrepid timing; diagnostics are separate from clean runs."""
import argparse
import functools
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'intrepid-performance'
OUT.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location('stability', ROOT / 'tests/browser-stability.py')
stability = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stability)
parser = argparse.ArgumentParser()
parser.add_argument('--label', required=True)
parser.add_argument('--fixture', type=Path, default=OUT / 'initial-save.json')
parser.add_argument('--seconds', type=float, default=12)
parser.add_argument('--runs', type=int, default=2)
parser.add_argument('--diagnostic', action='store_true')
parser.add_argument('--disable-pending', action='store_true')
parser.add_argument('--synchronous', action='store_true')
parser.add_argument('--source-override', type=Path)
parser.add_argument('--fog-off', action='store_true')
parser.add_argument('--native-random', action='store_true')
args = parser.parse_args()


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        relative = urlsplit(self.path).path.lstrip('/')
        allowed = {'html-games/broken-mirror-port/' + n for n in ['index.html','nebula-material.js','dev-sol-fog.js']}
        if args.source_override and relative in allowed:
            path = args.source_override / relative
            data = path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html' if path.suffix == '.html' else 'application/javascript')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
report = dict(label=args.label, diagnostic=args.diagnostic, sourceOverride=str(args.source_override) if args.source_override else None, synchronous=args.synchronous, disablePending=args.disable_pending, nativeRandom=args.native_random, fogEnabled=not args.fog_off, randomSeed=None if args.native_random else 4292026, viewport=dict(width=1280, height=850), runs=[], errors=[], scope='Full game in headless Edge; not physical display refresh qualification.')
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        report['browserVersion'] = browser.version

        def open_page():
            page = browser.new_page(viewport=report['viewport'], reduced_motion='no-preference')
            if not args.native_random:
                page.add_init_script('''(()=>{let seed;window.__resetFogRandom=()=>{seed=4292026;};__resetFogRandom();Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};})()''')
            else:
                page.add_init_script('window.__resetFogRandom=()=>{}')
            page.add_init_script('(' + stability.INSTRUMENT + ')()')
            page.on('pageerror', lambda e: report['errors'].append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
            if args.synchronous:
                page.evaluate('window.nativeNebulaMaterial={...nativeNebulaMaterial,createRuntimeField:nativeNebulaMaterial.createField}')
            page.evaluate(stability.INSTALL)
            page.evaluate('nativeDevFog.setEnabled(true)')
            page.wait_for_function('()=>nativeNpcDev.getState()?.devMode', timeout=120000)
            return page

        if not args.fixture.exists():
            page = open_page()
            page.evaluate('__resetFogRandom()')
            page.locator('#devToolsBtn').click()
            page.locator('[data-dev-ship]').select_option('438')
            page.locator('[data-dev-equip]').click()
            page.wait_for_function('()=>nativeDevFog.material()?.pose.shipType===438', timeout=120000)
            page.keyboard.press('Escape')
            page.wait_for_function('()=>nativePause.active')
            args.fixture.write_text(page.evaluate('JSON.stringify(nativeNpcDev.getState())'), encoding='utf8')
            page.close()
        saved = args.fixture.read_text(encoding='utf8')
        report['fixtureHash'] = hashlib.sha256(saved.encode()).hexdigest()
        for run in range(args.runs):
            page = open_page()
            page.evaluate('__resetFogRandom()')
            page.evaluate(stability.SETUP, dict(saved=saved, mode='flight'))
            page.wait_for_function('()=>nativeDevFog.material()?.pose.shipType===438&&nativeDevFog.snapshot().renderer.backend==="webgl2"', timeout=120000)
            page.evaluate("nativeDevFog.setPreset('vex');nativeDevFog.setColour('four');nativeDevFog.reset()")
            page.wait_for_timeout(1200)
            if args.fog_off:
                page.evaluate('nativeDevFog.setEnabled(false)')
            if args.disable_pending:
                page.evaluate('Object.defineProperty(nativeDevFog.material().field,"pendingMasks",{get:()=>[]})')
            if args.diagnostic:
                page.evaluate('''()=>{
                  window.__fogCosts=[];const material=nativeDevFog.material(),update=material.field.update;
                  material.field.update=function(...args){const at=performance.now();try{return update(...args);}finally{if(__stability.record)__fogCosts.push({kind:'update',ms:performance.now()-at,bounds:material.field.metrics().activeBounds});}};
                  const api=nativeNebulaMaterial;window.nativeNebulaMaterial={...api,render(...args){const at=performance.now();try{return api.render(...args);}finally{if(__stability.record)__fogCosts.push({kind:'renderSubmission',ms:performance.now()-at});}}};
                  const fog=nativeDevFog;window.nativeDevFog={...fog,paint(...args){const at=performance.now();try{return fog.paint(...args);}finally{if(__stability.record)__fogCosts.push({kind:'paint',ms:performance.now()-at});}}};
                }''')
            page.locator('#space').focus()
            start = page.evaluate('vexedSolFlight.shipPosition(nativeNpcDev.getState())')
            page.keyboard.down('w')
            page.wait_for_function('p=>{const q=vexedSolFlight.shipPosition(nativeNpcDev.getState());return Math.hypot(q.x-p.x,q.y-p.y)>700;}', arg=start, timeout=45000)
            page.keyboard.down('d')
            page.evaluate('''()=>{__stability.frames=[];__stability.longTasks=[];__stability.record=true;window.__fogMeasureStart=performance.now();}''')
            page.wait_for_timeout(args.seconds * 1000)
            row = page.evaluate('''()=>{
              __stability.record=false;const s=nativeNpcDev.getState();
              window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
              return {seconds:(performance.now()-__fogMeasureStart)/1000,frames:__stability.frames,longTasks:__stability.longTasks,
                fog:nativeDevFog.material().field.metrics(),population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,
                state:{x:s.x,y:s.y,angle:s.angle,speed:s.speed,simulationSeconds:nativeSimulation.seconds(s),debt:s.shipSimulation.schedule.pendingSeconds},costs:window.__fogCosts||[]};
            }''')
            row['densityDiagnostics'] = page.evaluate('''()=>{let subnormal=0,minimum=Infinity;for(const d of nativeDevFog.material().field.density)if(d>0){minimum=Math.min(minimum,d);if(d<1.17549435e-38)subnormal++;}return {subnormalCells:subnormal,minimumPositive:minimum};}''')
            page.keyboard.up('w')
            page.keyboard.up('d')
            frames = row['frames']
            intervals = sorted(f['intervalMs'] for f in frames if f['intervalMs'] > 0)
            callbacks = sorted(f['callbackMs'] for f in frames)
            row['summary'] = dict(fps=len(frames)/row['seconds'], intervalP95=intervals[int(len(intervals)*.95)], callbackP95=callbacks[int(len(callbacks)*.95)], over33=sum(f['intervalMs']>33.4 for f in frames), over50=sum(f['intervalMs']>50 for f in frames))
            if row['costs']:
                row['costSummary'] = {}
                for kind in ['update','renderSubmission','paint']:
                    values = sorted(c['ms'] for c in row['costs'] if c['kind'] == kind)
                    row['costSummary'][kind] = dict(mean=sum(values)/len(values), p95=values[int(len(values)*.95)], maximum=max(values))
            report['runs'].append(row)
            (OUT / f'{args.label}.json').write_text(json.dumps(report, indent=2), encoding='utf8')
            page.screenshot(path=str(OUT / f'{args.label}-{run+1}.png'))
            print(json.dumps(dict(run=run+1, summary=row['summary'], costs=row.get('costSummary'), population=row['population'], fog=row['fog'])), flush=True)
            page.close()
        assert not report['errors'], report['errors']
        report['passed'] = True
        (OUT / f'{args.label}.json').write_text(json.dumps(report, indent=2), encoding='utf8')
        browser.close()
finally:
    server.shutdown()
    server.server_close()
