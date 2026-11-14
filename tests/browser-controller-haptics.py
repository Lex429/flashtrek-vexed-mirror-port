"""Real shared damage to browser actuator requests, including pause/settings gates."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'controller-haptics'
OUT.mkdir(parents=True, exist_ok=True)


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
        page = browser.new_page(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""(()=>{
          window.__rumble=[];window.__rumbleResets=0;window.__rumblePolls=0;window.__rumbleConnected=true;
          const actuator={effects:['dual-rumble'],playEffect(type,params){__rumble.push({type,...params});return new Promise(resolve=>setTimeout(()=>resolve('complete'),params.duration));},reset(){__rumbleResets++;return Promise.resolve('complete');}};
          window.__rumblePad={id:'DualSense (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',index:0,connected:true,mapping:'standard',vibrationActuator:actuator,
            axes:[0,0,0,0],buttons:Array.from({length:18},()=>({value:0,pressed:false}))};
          Object.defineProperty(navigator,'getGamepads',{value:()=>{__rumblePolls++;return __rumbleConnected?[__rumblePad]:[];}});
        })();""")
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.locator('[data-menu="dev"]').click()
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200', timeout=120000)
        page.evaluate("""()=>{
          const s=nativeNpcDev.getState();window.__rumbleState=s;
          nativeCivilianTraffic.advance=()=>{};nativeSolEconomy.advance=()=>{};
          s.civilianTraffic.ships=[];s.solEconomy.freighters=[];nativeNpcLives.invalidateMembership(s);
          Object.assign(s,{system:2,localBody:0,x:4e6,y:4e6,angle:0,speed:0,vx:0,vy:0,landed:false,phase:'flight',localCruise:null,arrivalApproach:null});
          nativeSystemCatalog.initialize(s);nativeShipMotion.stop(s);nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);
          window.__hitForRumble=(side,hull=false)=>{
            const s=__rumbleState,d=nativeShipDefinitions.describe(s,s,{category:'player'});
            s.hull=d.definition.hull;s.shields=hull?0:d.definition.shields;s.phase='flight';
            const descriptor=nativeShipDefinitions.describe(s,s,{category:'player'}),local=side==='port'?{x:-400,y:0}:side==='starboard'?{x:400,y:0}:side==='bow'?{x:0,y:-400}:{x:0,y:400};
            const from=nativeCombatShots.worldPoint(descriptor,local);
            return nativeShipDamage.apply(descriptor,2,{kind:'beam',from,sourceId:'civilian:test'});
          };
        }""")
        page.locator('#space').focus()

        def polls(count=3):
            start = page.evaluate('__rumblePolls')
            page.wait_for_function('goal=>__rumblePolls>=goal', arg=start + count, timeout=30000)

        def press(index):
            page.evaluate('i=>{__rumblePad.buttons[i].value=1;}', index)
            polls()
            page.evaluate('i=>{__rumblePad.buttons[i].value=0;}', index)
            polls()

        samples = {}
        for side in ['port', 'starboard', 'bow', 'stern']:
            start = page.evaluate('__rumble.length')
            result = page.evaluate('side=>__hitForRumble(side)', side)
            assert result['ok'] and result['amount'] > 0
            page.wait_for_function('n=>__rumble.length>n', arg=start)
            samples[side] = page.evaluate('__rumble.at(-1)')
            assert page.evaluate('nativeControllerHaptics.inspect().last.zone') == side
            polls(8)
        assert samples['port']['strongMagnitude'] > samples['port']['weakMagnitude']
        assert samples['starboard']['weakMagnitude'] > samples['starboard']['strongMagnitude']
        assert samples['stern']['duration'] > samples['bow']['duration']
        start = page.evaluate('__rumble.length')
        hull = page.evaluate('__hitForRumble("port",true)')
        page.wait_for_function('n=>__rumble.length>n', arg=start)
        assert hull['hullDamage'] == 2 and page.evaluate('nativeControllerHaptics.inspect().last.hull')
        assert page.evaluate('__rumble.at(-1).strongMagnitude') > samples['port']['strongMagnitude']

        # Menu/focus gates discard queued and playing effects, including direct
        # damage calls. The explicit Options test is allowed while paused.
        press(9)
        assert page.evaluate('nativePause.active')
        start = page.evaluate('__rumble.length')
        page.evaluate('__hitForRumble("port")')
        polls(6)
        assert page.evaluate('__rumble.length') == start
        page.locator('#pause-menu [data-options]').click()
        assert page.locator('#pause-vibration-test').is_enabled()
        page.locator('#pause-vibration-test').click()
        page.wait_for_function('n=>__rumble.length>n', arg=start)
        page.wait_for_function('()=>document.querySelector(".pause-feedback").textContent.includes("test sent")')
        page.screenshot(path=str(OUT / 'options.png'))
        page.locator('#pause-vibration-toggle').click()
        assert not page.evaluate('nativeControllerHaptics.inspect().enabled')
        assert page.locator('#pause-vibration-test').is_disabled()
        press(9)
        start = page.evaluate('__rumble.length')
        page.evaluate('__hitForRumble("starboard")')
        polls(6)
        assert page.evaluate('__rumble.length') == start
        press(9)
        page.locator('#pause-menu [data-options]').click()
        page.locator('#pause-vibration-toggle').click()
        press(9)
        page.evaluate("dispatchEvent(new Event('blur'))")
        start = page.evaluate('__rumble.length')
        page.evaluate('__hitForRumble("port")')
        polls(6)
        assert page.evaluate('__rumble.length') == start
        page.evaluate("dispatchEvent(new Event('focus'))")
        polls()
        page.evaluate('__rumbleConnected=false')
        polls()
        assert not page.evaluate('nativeControllerHaptics.inspect().connected')
        start = page.evaluate('__rumble.length')
        page.evaluate('__hitForRumble("port")')
        polls()
        assert page.evaluate('__rumble.length') == start

        # A connection without browser vibration support remains playable and
        # accurately disables the test button instead of claiming success.
        page.evaluate('__rumbleConnected=true;__rumblePad.vibrationActuator=null')
        polls()
        press(9)
        page.locator('#pause-menu [data-options]').click()
        assert page.locator('#pause-vibration-test').is_disabled()
        message = page.locator('#pause-vibration-status').inner_text()
        assert 'needs setup' in message or 'does not expose vibration' in message
        assert not errors, errors
        report = {'passed': True, 'samples': samples, 'actualSharedDamage': True, 'hullStronger': True,
                  'pauseAndFocusGates': True, 'optionsTest': True, 'toggleAndDisconnect': True,
                  'unsupportedConnection': True, 'errors': errors}
        (OUT / 'results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
