"""Default game entry: GPU shield lifetime, pause, display sizing and context recovery."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'shield-gpu-live'
OUTPUT.mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850}, device_scale_factor=2)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.add_init_script("""(() => {
          const raf=requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>{if(callback.name==='draw')window.__shieldFrame=callback;return raf(callback);};
        })();""")
        url = f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html'
        page.goto(url)
        page.wait_for_function('() => window.vexedShieldGPU?.available && nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
        assert page.locator('#gpu-shield-overlay').count() == 1
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('() => nativeNpcDev.getState() && nativeCivilianTraffic.effectsReady()', timeout=120000)
        page.evaluate('window.requestAnimationFrame=()=>0')
        page.wait_for_timeout(100)
        initial = page.evaluate("""() => {
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          const state=window.__shieldState=nativeNpcDev.getState();
          nativeShipEffects.reset();nativeShipMotion.stop(state);
          Object.assign(state,{x:100000,y:100000,landed:false,hull:100,shields:100});
          // A fractional birth time must remain visible even when paused immediately.
          state.shipSimulation.seconds=1/3;
          state.civilianTraffic.ships=[];state.solEconomy.freighters=[];nativeShipSystems.invalidate(state);
          const d=nativeShipDefinitions.describe(state,state,{category:'player'});
          nativeShipEffects.visualImpact(state,d,{from:{x:d.x+200,y:d.y-150},kind:'beam'});
          __shieldFrame(performance.now());
          const snapshot=vexedShieldGPU.snapshot();
          const before=JSON.stringify(state),time=nativeSimulation.now(state);
          for(let i=0;i<20;i++)vexedShieldGPU.renderer.render(time,{effects:true,ships:false,background:false});
          return {active:snapshot.lastActiveShields,resources:snapshot.resources,clock:time,
            rendererDoesNotMutateState:before===JSON.stringify(state),pointerEvents:getComputedStyle(vexedShieldGPU.canvas).pointerEvents,
            dimensionsMatch:vexedShieldGPU.canvas.width===space.width&&vexedShieldGPU.canvas.height===space.height};
        }""")
        assert initial['active'] == 1 and initial['rendererDoesNotMutateState'], initial
        assert initial['pointerEvents'] == 'none' and initial['dimensionsMatch']
        page.wait_for_timeout(150)
        assert page.evaluate('nativeSimulation.now(__shieldState)') == initial['clock']
        page.evaluate('__shieldFrame(performance.now())')
        assert page.evaluate('vexedShieldGPU.snapshot().lastActiveShields') == 1
        page.screenshot(path=str(OUTPUT / 'native-shield-dpr2.png'))
        page.evaluate('nativeNpcDev.showMap();__shieldFrame(performance.now())')
        assert page.evaluate('vexedShieldGPU.canvas.hidden'), 'Flight shield leaked into galaxy map'
        page.evaluate("document.getElementById('dev-galaxy-return').click()")
        page.evaluate('__shieldState.shipSimulation.seconds+=.91;__shieldFrame(performance.now())')
        assert page.evaluate('vexedShieldGPU.snapshot().lastActiveShields===0'), 'Expired shield remained active'
        # The shared overlay continues painting running lamps after shields expire.
        assert page.evaluate('vexedShieldGPU.canvas.hidden||vexedShieldGPU.snapshot().shipLamps.lastInstances>0')
        page.set_viewport_size({'width': 1024, 'height': 768})
        page.evaluate('__shieldFrame(performance.now())')
        assert page.evaluate('vexedShieldGPU.canvas.width===space.width&&vexedShieldGPU.canvas.height===space.height')
        page.evaluate('window.__previousGPU=vexedShieldGPU;window.__loseGPU=vexedShieldGPU.renderer.gl.getExtension("WEBGL_lose_context");__loseGPU.loseContext()')
        page.wait_for_function('() => !vexedShieldGPU.available', polling=100)
        page.evaluate('__shieldFrame(performance.now());__loseGPU.restoreContext()')
        page.wait_for_function('() => window.vexedShieldGPU?.available && vexedShieldGPU!==__previousGPU', polling=100)
        assert page.locator('#gpu-shield-overlay').count() == 1
        assert page.evaluate('__previousGPU.renderer.snapshot().disposed')
        fallback = browser.new_page()
        fallback.on('pageerror', lambda e: errors.append(str(e)))
        fallback.add_init_script("""(() => {const get=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(type,...args){
            return type==='webgl2'&&this.id==='gpu-shield-overlay'?null:get.call(this,type,...args);};})();""")
        fallback.goto(url)
        fallback.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
        assert fallback.evaluate('vexedShieldGPUReady.then(result=>result===null)')
        assert fallback.locator('#gpu-shield-overlay').count() == 0
        assert fallback.evaluate('typeof drawShowcaseShieldFlash==="function" && typeof drawShowcaseShieldSurface==="function"')
        report = {'passed': True, 'defaultGPUInstallation': True, 'initial': initial, 'pausedClockFrozen': True,
                  'mapClearsOverlay': True, 'expiryClearsOverlay': True, 'resizeAndDPR': True,
                  'actualContextLossAndRestoration': True, 'noWebGLKeepsExistingFallback': True,
                  'freshBrowserProfiles': True, 'javascriptErrors': errors}
        assert not errors, errors
        (OUTPUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
