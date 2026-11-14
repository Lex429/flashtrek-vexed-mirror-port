"""Original black PC map controls alongside the retained controller hierarchy."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'controller-map'
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
        page = browser.new_page(viewport={'width': 1440, 'height': 950}, reduced_motion='no-preference')
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""(()=>{
          window.__mapPolls=0;window.__mapCalls=[];window.__mapKeys=[];window.__mapNavigationCalls=[];
          addEventListener('keydown',event=>__mapKeys.push({code:event.code,key:event.key}),true);
          window.__mapPad={id:'DualSense (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',index:0,connected:true,mapping:'standard',
            axes:[0,0,0,0],buttons:Array.from({length:18},()=>({value:0,pressed:false}))};
          Object.defineProperty(navigator,'getGamepads',{value:()=>{__mapPolls++;return [__mapPad];}});
        })();""")
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.locator('[data-menu="dev"]').click()
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200', timeout=120000)
        page.wait_for_function('()=>!window.nativeMenuTransition?.snapshot().active&&!window.vexedWarp?.active&&!window.nativeOpeningCinematic?.active&&!window.nativeCollectablesView?.active&&!window.nativeShipInventory?.active&&!window.nativePause?.active&&!window.nativeShipyardServices?.busy',timeout=60000)
        baseline = page.evaluate("""()=>{
          const api=nativeSimulation;window.nativeSimulation={...api,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=nativeNpcDev.getState();window.__mapState=s;
          const call=nativeNavigation.call;nativeNavigation.call=(action,value)=>{
            __mapNavigationCalls.push(action);
            if(['course','cruise','track','local-target'].includes(action)){__mapCalls.push({action,value});return {ok:true};}
            return call(action,value);
          };
          return {fuel:s.antimatter,day:s.day,crews:s.civilianTraffic.ships.length};
        }""")

        def polls(count=3):
            start = page.evaluate('__mapPolls')
            page.wait_for_function('goal=>__mapPolls>=goal', arg=start + count, timeout=30000)

        def button(index, value):
            page.evaluate('([i,v])=>{__mapPad.buttons[i].value=v;__mapPad.buttons[i].pressed=!!v;}', [index, value])
            polls()

        def press(index):
            button(index, 1)
            button(index, 0)

        def settled():
            page.wait_for_function('()=>!nativeGalaxyMap.inspect().animating', timeout=15000)
            polls()

        # PC controls retain their original behavior with a controller connected.
        page.locator('#space').focus()
        polls()
        page.keyboard.press('m')
        polls(8)
        assert page.locator('#galaxy-map').get_attribute('data-input') == 'pc', page.evaluate('({open:nativeGalaxyMap.isOpen,input:document.querySelector("#galaxy-map").dataset.input,active:nativeNavigation.active,focus:document.activeElement.id,keys:__mapKeys,calls:__mapNavigationCalls,errors:__mapCalls})')
        assert page.evaluate("getComputedStyle(document.querySelector('#galaxy-map')).backgroundColor") == 'rgb(0, 0, 0)'
        assert page.evaluate("getComputedStyle(document.querySelector('.map-viewport')).backgroundColor") == 'rgb(0, 0, 0)'
        assert page.evaluate("getComputedStyle(document.querySelector('.map-viewport')).backgroundImage") == 'none'
        for _ in range(22):
            page.keyboard.press('-')
        page.wait_for_function('()=>Math.abs(nativeGalaxyMap.inspect().camera.span-nativeGalaxyMap.inspect().goal.span)<.05')
        before_pc = page.evaluate('nativeGalaxyMap.inspect().goal')
        system_node = page.locator('#galaxy-map [data-system="4"]:not([data-body]) .map-dot')
        system_node.click()
        polls(8)
        assert page.evaluate('nativeGalaxyMap.inspect().selected.system===4&&nativeGalaxyMap.inspect().selected.body===undefined')
        assert page.evaluate('nativeGalaxyMap.inspect().goal') == before_pc, 'Single click moved the PC map camera'
        assert page.locator('#galaxy-map').get_attribute('data-input') == 'pc', 'An idle controller took over mouse controls'
        page.screenshot(path=str(OUT / 'pc-black-map.png'))
        system_node.dblclick()
        page.wait_for_function('()=>Math.abs(nativeGalaxyMap.inspect().camera.span-nativeGalaxyMap.inspect().goal.span)<.005')
        assert page.evaluate('nativeGalaxyMap.inspect().goal.span') < before_pc['span'], page.evaluate('nativeGalaxyMap.inspect()')
        body_node = page.locator('#galaxy-map [data-system="4"][data-body][tabindex="0"]').first
        body_node.focus()
        page.keyboard.press('Enter')
        assert page.evaluate('document.activeElement.dataset.action') == 'navigate'
        pc_selection = page.evaluate('nativeGalaxyMap.inspect().selected')
        chart = page.locator('#galaxy-map .map-chart').bounding_box()
        assert chart
        pc_goal = page.evaluate('nativeGalaxyMap.inspect().goal')
        x, y = chart['x'] + 40, chart['y'] + chart['height'] * .45
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 65, y + 25, steps=4)
        page.mouse.up()
        assert page.evaluate('nativeGalaxyMap.inspect().goal.x') < pc_goal['x']
        assert page.evaluate('nativeGalaxyMap.inspect().goal.y') < pc_goal['y']
        zoom_before = page.evaluate('nativeGalaxyMap.inspect().goal.span')
        page.mouse.wheel(0, -80)
        page.wait_for_function('span=>nativeGalaxyMap.inspect().goal.span<span', arg=zoom_before)
        assert not page.evaluate('nativeGalaxyMap.inspect().animating'), 'PC wheel zoom started a controller camera transition'
        assert page.evaluate('nativeGalaxyMap.inspect().selected') == pc_selection
        page.keyboard.press('Home')
        assert page.evaluate('nativeGalaxyMap.inspect().selected') == pc_selection, 'PC centering changed the selected destination'
        page.keyboard.press('Escape')
        assert not page.evaluate('nativeGalaxyMap.isOpen'), 'Escape did not close the PC map directly'
        assert page.evaluate('__mapCalls.length') == 0

        press(8)
        assert page.evaluate('nativeGalaxyMap.inspect().level') == 'system'
        assert page.locator('#galaxy-map').get_attribute('data-input') == 'controller'
        press(1)
        settled()
        assert page.evaluate('nativeGalaxyMap.inspect().level') == 'galaxy'
        page.screenshot(path=str(OUT / 'galaxy.png'))
        first = page.evaluate('nativeGalaxyMap.inspect().selected.system')
        for index in [15, 13, 14, 12]:
            press(index)
            if page.evaluate('nativeGalaxyMap.inspect().selected.system') != first:
                break
        assert page.evaluate('nativeGalaxyMap.inspect().selected.system') != first
        page.evaluate("""()=>{
          window.__mapSamples=[];let count=0;
          const sample=()=>{__mapSamples.push(nativeGalaxyMap.inspect().camera.span);if(++count<90)requestAnimationFrame(sample);};requestAnimationFrame(sample);
        }""")
        before = page.evaluate('nativeGalaxyMap.inspect().camera.span')
        press(0)
        settled()
        system_view = page.evaluate('nativeGalaxyMap.inspect()')
        assert system_view['level'] == 'system' and system_view['selected'].get('body') is not None
        assert page.evaluate('([a,b])=>__mapSamples.some(span=>span<Math.max(a,b)-.01&&span>Math.min(a,b)+.01)', [before, system_view['camera']['span']])
        assert page.evaluate('__mapCalls.length') == 0

        # Mouse selection remains separate from the controller's Cross drill-in.
        press(1)
        settled()
        before_click = page.evaluate('nativeGalaxyMap.inspect().goal')
        page.locator('#galaxy-map [data-system="4"]:not([data-body]) .map-dot').click()
        settled()
        assert page.evaluate('nativeGalaxyMap.inspect().goal') == before_click
        assert page.evaluate('nativeGalaxyMap.inspect().level==="galaxy"&&nativeGalaxyMap.inspect().selected.system===4')
        press(0)
        settled()
        assert page.evaluate('nativeGalaxyMap.inspect().level==="system"&&nativeGalaxyMap.inspect().selected.system===4')
        original = page.evaluate('nativeGalaxyMap.inspect().selected.body')
        for index in [15, 13, 14, 12]:
            press(index)
            if page.evaluate('nativeGalaxyMap.inspect().selected.body') != original:
                break
        destination = page.evaluate('nativeGalaxyMap.inspect()')
        assert destination['selected']['body'] != original
        settled()
        assert page.locator('.map-destination-info h3').inner_text() == destination['name']
        page.screenshot(path=str(OUT / 'solar-system.png'))

        # Triggers zoom the view; they never fire or select a travel action.
        span = page.evaluate('nativeGalaxyMap.inspect().goal.span')
        button(7, 1)
        polls(8)
        button(7, 0)
        assert page.evaluate('nativeGalaxyMap.inspect().goal.span') < span
        zoomed = page.evaluate('nativeGalaxyMap.inspect().goal.span')
        button(6, 1)
        polls(8)
        button(6, 0)
        assert page.evaluate('nativeGalaxyMap.inspect().goal.span') > zoomed
        assert page.evaluate('__mapCalls.length') == 0

        press(0)
        settled()
        assert page.evaluate('nativeGalaxyMap.inspect().level') == 'destination'
        assert page.locator('.map-destination-info h3').inner_text() == destination['name']
        page.screenshot(path=str(OUT / 'destination.png'))
        press(1)
        settled()
        assert page.evaluate('nativeGalaxyMap.inspect().level') == 'system'
        assert page.evaluate('__mapCalls.length') == 0
        press(0)
        settled()
        assert page.locator('[data-action="warp"]').is_enabled()
        # Navigate the real action buttons, then confirm the warp explicitly.
        press(15)
        assert page.evaluate('document.activeElement.dataset.action') == 'navigate'
        press(14)
        assert page.evaluate('document.activeElement.dataset.action') == 'warp'
        press(0)
        page.wait_for_function('()=>__mapCalls.length===1')
        dispatched = page.evaluate('__mapCalls[0]')
        assert dispatched == {'action': 'course', 'value': destination['selected']}, dispatched
        assert not page.evaluate('nativeGalaxyMap.isOpen')
        assert page.evaluate('({fuel:__mapState.antimatter,day:__mapState.day,crews:__mapState.civilianTraffic.ships.length})') == baseline

        press(8)
        press(11)
        goal = page.evaluate('nativeGalaxyMap.inspect().goal')
        ship = page.evaluate('nativeNavigation.call("state").shipPosition')
        assert abs(goal['x'] - ship['x']) < 1e-8 and abs(goal['y'] - ship['y']) < 1e-8
        press(8)
        button(17, 1)
        assert page.evaluate('nativeShipInventory.active')
        polls(8)
        assert page.evaluate('nativeShipInventory.active'), 'held touchpad click repeatedly toggled inventory'
        button(17, 0)
        press(17)
        assert not page.evaluate('nativeShipInventory.active')

        # Compact layout and reduced-motion mode use the same hierarchy.
        page.emulate_media(reduced_motion='reduce')
        page.set_viewport_size({'width': 390, 'height': 844})
        press(8)
        press(1)
        assert page.evaluate('nativeGalaxyMap.inspect().level') == 'galaxy'
        assert not page.evaluate('nativeGalaxyMap.inspect().animating')
        press(0)
        assert page.evaluate('nativeGalaxyMap.inspect().level') == 'system'
        page.screenshot(path=str(OUT / 'compact.png'))
        bounds = page.locator('#galaxy-map').bounding_box()
        assert bounds and bounds['x'] >= -1 and bounds['x'] + bounds['width'] <= 391, bounds
        assert not errors, errors
        report = {'passed': True, 'keyboardDpadCoveredSeparately': True, 'spatialSelection': True,
                  'blackBackground': True, 'mouseSelectsWithoutZoom': True, 'mouseDoubleClickZoom': True,
                  'mouseDragAndWheel': True,
                  'keyboardSelectionAndEscape': True, 'pcCenterRetainsSelection': True, 'idlePadLeavesPcControls': True,
                  'cinematicIntermediateFrames': True, 'backZoomsOut': True, 'triggerZoom': True, 'explicitWarp': dispatched,
                  'r3CentersShip': True, 'touchpadBrowserInput': True, 'reducedMotionAndCompact': True, 'errors': errors}
        (OUT / 'results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
