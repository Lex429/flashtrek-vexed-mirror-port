"""Exercise the active game through an injected standard Gamepad API device."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'gamepad-controls'
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
        page = browser.new_page(viewport={'width': 1280, 'height': 850}, reduced_motion='reduce')
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""(() => {
          window.__padConnected=false;window.__padPolls=0;
          window.__pad={id:'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',index:1,
            connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};
          Object.defineProperty(navigator,'getGamepads',{value:()=>{__padPolls++;return __padConnected?[null,__pad]:[];}});
        })();""")
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)

        def polls(count=3):
            start = page.evaluate('__padPolls')
            page.wait_for_function('goal=>__padPolls>=goal', arg=start + count, timeout=30000)

        def button(index, value):
            page.evaluate('([i,v])=>{__pad.buttons[i].value=v;__pad.buttons[i].pressed=v>=.65;}', [index, value])
            polls()

        def press(index):
            button(index, 1)
            button(index, 0)

        page.evaluate('__padConnected=true')
        page.wait_for_function('()=>document.querySelector("#controller-status").dataset.state==="connected"')
        assert page.locator('#controller-status').is_visible()
        assert page.locator('#controller-notice').is_visible()
        assert 'DualSense connected' in page.locator('#controller-notice').inner_text()
        page.screenshot(path=str(OUTPUT / 'controller-connected-menu.png'))
        # The actual main-menu controls and pause options work from the pad.
        press(13)
        assert page.evaluate('document.activeElement.dataset.menu') == 'new', page.evaluate('({focus:document.hasFocus(),active:document.activeElement.outerHTML.slice(0,500),status:document.querySelector("#controller-status").textContent,buttons:__pad.buttons,polls:__padPolls})')
        press(13)
        assert page.evaluate('document.activeElement.dataset.menu') == 'options'
        press(0)
        assert page.evaluate('nativePause.active')
        press(1)
        press(1)
        assert not page.evaluate('nativePause.active')

        page.locator('[data-menu="dev"]').click()
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200', timeout=120000)
        page.evaluate("""()=>{
          const state=nativeNpcDev.getState();window.__padState=state;
          window.__padTemplate=JSON.parse(JSON.stringify(state.civilianTraffic.ships[0]));
          nativeCivilianTraffic.advance=()=>{};nativeSolEconomy.advance=()=>{};
          state.civilianTraffic.ships=[];state.solEconomy.freighters=[];
          Object.assign(state,{system:2,localBody:0,x:4e6,y:4e6,angle:0,speed:0,vx:0,vy:0,landed:false,phase:'flight',localCruise:null,arrivalApproach:null});
          nativeSystemCatalog.initialize(state);
          for(let i=0;i<12;i++){state.y=4e6+i*2000;if(!nativeSolAsteroids.sweptNearby(2,state,{x:state.x+5000,y:state.y},220).length)break;if(i===11)throw Error('No clear controller fixture');}
          for(const key of ['motionKick','motionSpin','motionDrift','motionReverse','motionAngularVelocity','shipEquipment','weaponLoadout'])delete state[key];
          const weapon=VexedMirrorWeapons.find(model=>model.damage>0&&nativeCombatShots.weaponVisual(model).kind==='torpedo');
          state.weapons=[weapon.id];state.weaponInventory=[];nativeShipEquipment.ensure(state);nativeWeaponLoadout.ensure(state);
          nativeShipMotion.stop(state);nativeManualFlight.initializeRegion(state);nativeShipSystems.invalidate(state);
          const systems=nativeShipSystems;window.__padMoves=[];
          window.nativeShipSystems={...systems,move(s,e,category,command,profile,dt){
            const result=systems.move(s,e,category,command,profile,dt);
            if(e===state){__padMoves.push({...command});if(__padMoves.length>300)__padMoves.shift();}return result;
          }};
          window.__padShots=[];const fire=nativeCombatShots.fire;
          nativeCombatShots.fire=options=>{const result=fire(options);if(result.ok)__padShots.push({target:result.event.targetId,at:nativeSimulation.seconds(state)});return result;};
        }""")
        page.locator('#space').focus()
        polls()
        page.evaluate('__pad.axes=[.59,0,0,0];__padMoves=[]')
        page.wait_for_function('()=>__padMoves.some(c=>c.heading===0&&Math.abs(c.throttle-.5)<1e-8)')
        page.wait_for_function('()=>__padState.speed>10')
        flight = page.evaluate('({speed:__padState.speed,angle:__padState.angle,command:__padMoves.at(-1)})')
        page.evaluate('__pad.axes=[0,-1,0,0];__padMoves=[]')
        page.wait_for_function('()=>__padMoves.some(c=>c.heading===-Math.PI/2)&&__padState.angle<-.1')
        page.evaluate('__pad.axes=[0,0,0,0]')
        polls()
        # D-pad uses the same thrust/turn intent as the keyboard arrows.
        page.evaluate('__pad.buttons[12].value=1;__pad.buttons[15].value=1;__padMoves=[]')
        page.wait_for_function('()=>__padMoves.some(c=>c.throttle===1&&c.turn===1&&!Number.isFinite(c.heading))')
        page.evaluate('__pad.buttons[12].value=0;__pad.buttons[15].value=0;__padMoves=[]')
        polls()
        assert page.evaluate('__padMoves.length>0&&__padMoves.at(-1).throttle===0&&!Number.isFinite(__padMoves.at(-1).heading)')
        button(4, 1)
        page.wait_for_function('()=>__padState.speed===0')
        assert page.evaluate('__padMoves.at(-1).brake')
        button(4, 0)

        # A held R2 fires using the real recharge owner. Inventory clears it,
        # and neither fire nor a deflected stick can leak through menu close.
        button(7, 1)
        page.wait_for_function('()=>__padShots.length>=1')
        page.evaluate('__pad.axes=[1,-1,0,0]')
        press(17)
        assert page.evaluate('nativeShipInventory.active')
        shots_at_inventory = page.evaluate('__padShots.length')
        press(1)
        assert not page.evaluate('nativeShipInventory.active')
        page.evaluate('__padMoves=[]')
        polls(12)
        assert page.evaluate('__padMoves.every(c=>!c.throttle&&!c.turn)')
        assert page.evaluate('__padShots.length') == shots_at_inventory
        press(17)
        assert page.evaluate('nativeShipInventory.active')
        press(17)
        assert not page.evaluate('nativeShipInventory.active')
        button(7, 0)
        page.evaluate('__pad.axes=[0,0,0,0]')
        polls()

        # Map, pause and their Back actions use the real overlays.
        press(8)
        assert page.evaluate('nativeGalaxyMap.isOpen')
        assert page.locator('#controller-status').is_visible()
        # Existing map focus navigation is retained; no new map flight/cursor
        # behavior or trigger zoom is installed by this revision.
        page.screenshot(path=str(OUTPUT / 'controller-map-badge.png'))
        press(8)
        assert not page.evaluate('nativeGalaxyMap.isOpen')
        press(9)
        assert page.evaluate('nativePause.active')
        page.screenshot(path=str(OUTPUT / 'controller-help.png'))
        press(9)
        assert not page.evaluate('nativePause.active')

        # Two visible targets verify that L2 selects once per squeeze and that
        # acquiring another lock stops a held R2 until a fresh press.
        page.evaluate("""()=>{
          const s=__padState;nativeShipMotion.stop(s);s.angle=0;
          s.civilianTraffic.ships=[0,1].map(i=>({...JSON.parse(JSON.stringify(__padTemplate)),id:98701+i,name:'Pad target '+i,
            system:2,phase:'cruise',scriptedDemo:'gamepad',x:s.x+220+i*80,y:s.y+i*30,speed:0,hull:100000,shields:100000,
            localLeg:null,journey:null,combatAI:null,retaliationTargetId:null}));
          nativeCivilianTraffic.clearTarget();nativeSolEconomy.clearTarget();nativeAsteroidCombat.deselect();nativeShipSystems.invalidate(s);
        }""")
        button(6, 1)
        first = page.evaluate('nativeCivilianTraffic.target(__padState)?.id')
        assert first in [98701, 98702], first
        polls(12)
        assert page.evaluate('nativeCivilianTraffic.target(__padState)?.id') == first
        button(6, 0)
        button(7, 1)
        page.wait_for_function('()=>__padShots.some(shot=>shot.target===98701||shot.target===98702)')
        before_change = page.evaluate('__padShots.length')
        press(6)
        second = page.evaluate('nativeCivilianTraffic.target(__padState)?.id')
        assert second != first, (first, second)
        polls(12)
        assert page.evaluate('__padShots.length') == before_change
        button(7, 0)

        # Disconnect clears controller commands and leaves keyboard flight live.
        page.evaluate('__pad.axes=[1,-1,0,0]')
        polls()
        page.evaluate('__padConnected=false;__padMoves=[]')
        polls()
        assert page.locator('#controller-status').get_attribute('data-state') == 'disconnected'
        assert page.locator('#controller-notice').inner_text() == 'Controller disconnected'
        assert page.locator('#controller-notice').is_visible()
        page.evaluate('__padMoves=[]')
        polls()
        assert page.evaluate('__padMoves.every(c=>!c.throttle&&!c.turn)')
        page.keyboard.down('w')
        page.wait_for_function('()=>__padMoves.at(-1)?.throttle===1')
        page.keyboard.up('w')
        page.evaluate('__padConnected=true;__pad.buttons[7].value=1;__padMoves=[]')
        polls(6)
        assert page.locator('#controller-status').get_attribute('data-state') == 'connected'
        assert page.evaluate('__padMoves.every(c=>!c.throttle&&!c.turn)')
        assert page.evaluate('__padShots.length') == before_change
        button(7, 0)
        page.evaluate('__pad.axes=[0,0,0,0]')
        polls()

        # A focus loss consumes held controls until release after refocusing.
        page.evaluate('__pad.axes=[0,-1,0,0]')
        polls()
        page.evaluate("dispatchEvent(new Event('blur'));__padMoves=[]")
        polls()
        page.evaluate("dispatchEvent(new Event('focus'));__padMoves=[]")
        polls(6)
        assert page.evaluate('__padMoves.every(c=>!c.throttle&&!c.turn)')
        page.evaluate('__pad.axes=[0,0,0,0]')
        polls()
        page.screenshot(path=str(OUTPUT / 'controller-flight.png'))
        # Cross reaches actual port services; left/right edits the real freight
        # selector through its existing change handler, including its rerender.
        page.evaluate("""()=>{
          const s=__padState;nativeCivilianTraffic.clearTarget();nativeSolEconomy.clearTarget();nativeAsteroidCombat.deselect();
          Object.assign(s,{system:1,localBody:3,x:-220,y:75,landed:false,localCruise:null,arrivalApproach:null});
          nativeSystemCatalog.initialize(s);nativeShipMotion.stop(s);nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);
        }""")
        polls()
        press(0)
        assert page.evaluate('__padState.landed&&nativeSystemHub.active')
        page.locator('#freight-lot').focus()
        press(15)
        assert page.locator('#freight-lot').input_value() == '25'
        page.locator('#freight-lot').focus()
        press(14)
        assert page.locator('#freight-lot').input_value() == '10'
        press(1)
        assert not page.evaluate('nativeSystemHub.active')
        press(1)
        assert not page.evaluate('__padState.landed')
        result = {'flight': flight, 'targets': [first, second], 'shots': page.evaluate('__padShots.length'),
                  'directionalStick': True, 'keyboardDpad': True, 'l1Braking': True, 'createMapAndTouchpadInventory': True,
                  'connectionNotifications': True, 'menuNavigation': True, 'portServicesAndFields': True,
                  'inventoryAndPauseGates': True, 'disconnectAndFocus': True, 'errors': errors}
        (OUTPUT / 'results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        assert not errors, errors
        print(json.dumps(result, indent=2))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
