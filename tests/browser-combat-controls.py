"""Real active-entry held controls, target ordering and fitted-weapon feedback."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'combat-controls'
OUTPUT.mkdir(parents=True, exist_ok=True)
REPRODUCE = '--reproduce' in sys.argv


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(
    ('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate("""() => {
          const advance=nativeCivilianTraffic.advance;
          nativeCivilianTraffic.advance=(state,dt)=>{window.__controlsState=state;return window.__controlFixture?undefined:advance(state,dt);};
          startNativeDevGame();
        }""")
        page.wait_for_function('() => window.__controlsState && nativeCivilianTraffic.effectsReady() && nativeSolAsteroids.placements.length', timeout=120000)
        page.evaluate("() => {window.requestAnimationFrame=callback=>{if(callback.name==='draw'&&(!window.__controlsFrame||window.__controlsFrame===callback))window.__controlsFrame=callback;return 0;};}")
        # A cold paint can take longer than a fixed sleep before it submits the
        # next callback. Use timer polling because this fixture owns RAF now.
        page.wait_for_function("() => typeof window.__controlsFrame === 'function'", polling=50, timeout=30000)
        page.evaluate("""() => {
          window.__controlFixture=true;
          let state=__controlsState;const clone=value=>JSON.parse(JSON.stringify(value)),template=clone(state.civilianTraffic.ships[0]);
          const weapon=VexedMirrorWeapons.find(model=>model.damage>0&&nativeCombatShots.weaponVisual(model).kind==='beam');
          const torpedo=VexedMirrorWeapons.find(model=>model.damage>0&&nativeCombatShots.weaponVisual(model).kind==='torpedo');
          let time=performance.now();
          const step=(seconds=1/60)=>{time=Math.max(time,performance.now())+seconds*1000;__controlsFrame(time);state=__controlsState;};
          const frames=(seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)step(1/60);};
          // This fixture owns RAF. Slow native paints must not leave its next
          // timestamp behind real UI gate events. Rebinding at an explicit
          // fixture/reload boundary retains all previously accepted physics.
          const rebind=()=>{time=performance.now();const debt=state.shipSimulation?.schedule?.pendingSeconds;nativeSimulationHost.reset(time);if(state.shipSimulation?.schedule?.pendingSeconds!==debt)throw Error('Fixture clock rebind changed saved debt');};
          const fire=nativeCombatShots.fire,accepted=[];
          nativeCombatShots.fire=options=>{const result=fire(options);if(result.ok)accepted.push({at:nativeSimulation.seconds(state),target:result.event.targetId,instance:result.event.weaponInstanceId,readyAt:state.shipEquipment.instances[result.event.weaponInstanceId].readyAt,event:result.event.id});return result;};
          function fixture({distance=220,two=false,weapons=[weapon.id]}={}) {
            nativeCombatShots.reset();nativeShipEffects.reset();
            nativePause.close();nativeShipInventory.close();
            for(const key of ['weaponCombat','shipEquipment','weaponLoadout','localCruise','arrivalApproach','motionSpin','motionKick','localLeg'])delete state[key];
            Object.assign(state,{devMode:false,system:1,localBody:3,shipType:47,x:100000,y:100000,angle:0,speed:0,landed:false,phase:'cruise',hull:100000,shields:100000,weapons,weaponInventory:[],minedAsteroids:[],destroyedAsteroids:[]});
            state.solEconomy.freighters=[];state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];
            const origin=vexedSolFlight.shipPosition(state);
            const target={...clone(template),id:98501,name:'Control target',shipType:47,system:1,phase:'cruise',scriptedDemo:'controls',x:origin.x+distance,y:origin.y,heading:Math.PI/2,speed:0,hull:100000,shields:100000};
            for(const key of ['localLeg','journey','motionSpin','motionKick','combatAI','disputeId','retaliationId'])delete target[key];
            nativeShipMotion.stop(state);nativeShipMotion.stop(target);
            state.civilianTraffic.ships=[target];
            if(two)state.civilianTraffic.ships.push({...clone(target),id:98502,name:'Attacker',x:origin.x+Math.min(distance,190),y:origin.y-90,retaliationTargetId:'player',retaliationUntil:nativeSimulation.seconds(state)+60});
            nativeSolEconomy.clearTarget();nativeCivilianTraffic.clearTarget();nativeAsteroidCombat.deselect();
            nativeCivilianTraffic.select(target.id);nativeWeaponLoadout.ensure(state);nativeShipSystems.invalidate(state);accepted.length=0;rebind();step();
            return {target,origin};
          }
          window.__controls={get state(){return state;},fixture,step,frames,rebind,accepted,weapon,torpedo,clone};
        }""")
        page.evaluate('__controls.fixture()')
        page.keyboard.down('Space')
        page.evaluate('__controls.frames(3.2)')
        page.keyboard.up('Space')
        held = page.evaluate('({shots:__controls.accepted.slice(),recharge:nativeWeaponRules.weaponSpec(__controls.weapon,"beam").recharge})')
        page.evaluate('__controls.fixture({two:true})')
        page.keyboard.down('w')
        page.keyboard.down('d')
        page.evaluate('__controls.frames(.2)')
        before = page.evaluate('({speed:__controls.state.speed,angle:__controls.state.angle})')
        # Hit the actual painted ship while both flight controls remain down.
        point = page.evaluate("""() => {
          const target=__controls.state.civilianTraffic.ships[1],ship=vexedSolFlight.shipPosition(__controls.state),canvas=document.querySelector('#space'),rect=canvas.getBoundingClientRect(),view=nativeView.measure(canvas);
          return {x:rect.left+(view.w/2+target.x-ship.x)*rect.width/view.w,y:rect.top+(view.h/2+target.y-ship.y)*rect.height/view.h};
        }""")
        page.mouse.click(point['x'], point['y'])
        clicked = page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')
        page.evaluate('__controls.frames(.3)')
        after = page.evaluate('({speed:__controls.state.speed,angle:__controls.state.angle})')
        page.keyboard.up('w')
        page.keyboard.up('d')
        if not REPRODUCE:
            page.screenshot(path=str(OUTPUT / 'held-movement-target-selection.png'))
        result = {'held': held, 'movement': {'before': before, 'after': after, 'clicked': clicked}, 'errors': errors}
        if REPRODUCE:
            (OUTPUT / 'reproduction.json').write_text(json.dumps(result, indent=2))
            print(json.dumps(result, indent=2))
        else:
            assert len(held['shots']) >= 2, held
            assert all(b['at']-a['at'] >= held['recharge']-1e-7 for a,b in zip(held['shots'],held['shots'][1:])), held
            assert clicked == 98502, result
            assert after['angle'] > before['angle']+.05 and after['speed'] > before['speed'], result
            assert all(abs(shot['readyAt']-shot['at']-held['recharge']) < 1e-7 for shot in held['shots']), held
            page.evaluate('__controls.fixture()')
            page.keyboard.down('Space')
            page.evaluate('__controls.frames(.1)')
            page.keyboard.up('Space')
            release_before = page.evaluate('__controls.accepted.length')
            page.evaluate('__controls.frames(1.5)')
            assert page.evaluate('__controls.accepted.length') == release_before

            # Pause/Inventory/focus loss clear the latch and do not resume it on return.
            stops = {}
            for gate in ['blur', 'pause', 'inventory', 'disabled', 'destroyed', 'lost-target', 'changed-target', 'warp']:
                page.evaluate('__controls.fixture({two:true})')
                page.keyboard.down('Space')
                page.evaluate('__controls.frames(.1)')
                count = page.evaluate('__controls.accepted.length')
                if gate == 'blur':
                    page.evaluate("dispatchEvent(new Event('blur'))")
                elif gate == 'pause':
                    page.keyboard.press('Escape')
                    frozen = page.evaluate('nativeSimulation.seconds(__controls.state)')
                    page.evaluate('__controls.frames(1)')
                    assert page.evaluate('nativeSimulation.seconds(__controls.state)') == frozen
                    page.keyboard.press('Escape')
                elif gate == 'inventory':
                    page.keyboard.press('i')
                    assert page.evaluate('nativeShipInventory.active')
                    page.evaluate('__controls.frames(1)')
                    page.keyboard.press('i')
                elif gate in ['disabled', 'destroyed']:
                    page.evaluate("gate=>{__controls.state.phase=gate;__controls.state.hull=gate==='destroyed'?0:100;}", gate)
                    page.evaluate('__controls.step()')
                    page.evaluate("Object.assign(__controls.state,{phase:'cruise',hull:100000})")
                elif gate == 'lost-target':
                    page.evaluate('nativeCivilianTraffic.clearTarget()')
                    page.evaluate('__controls.step()')
                    page.evaluate('nativeCivilianTraffic.select(98501)')
                elif gate == 'changed-target':
                    page.evaluate('nativeCivilianTraffic.select(98502)')
                elif gate == 'warp':
                    # A slower CI browser can owe physical work after painting.
                    # Let the real service drain it; never clear saved debt or
                    # bypass the ordinary calendar/warp transition guard.
                    page.evaluate("window.__controlsWarpAttempts=0;window.__controlsWarpInitialDebt=__controls.state.shipSimulation.schedule.pendingSeconds")
                    page.wait_for_function("""() => {
                      window.__controlsWarpAttempts++;
                      const trip=window.__controlsWarpTrip=nativeNavigation.call('course',2);
                      return trip.ok||trip.error!=='Simulation is catching up. Wait for flight to recover before warping.';
                    }""", polling=25, timeout=30000)
                    trip = page.evaluate("__controlsWarpTrip")
                    assert trip['ok'], trip
                    result['warpBacklog'] = page.evaluate("({attempts:__controlsWarpAttempts,initialDebtSeconds:__controlsWarpInitialDebt})")
                    assert page.evaluate('vexedWarp.active')
                    page.evaluate('__controls.step();vexedWarp.reset()')
                page.evaluate('__controls.frames(1.4)')
                stops[gate] = page.evaluate('__controls.accepted.length')
                assert stops[gate] == count, (gate, stops, count)
                page.keyboard.up('Space')
            result['stops'] = stops

            # Shift initially chooses the aggressor but subsequent taps retain every candidate.
            page.evaluate('__controls.fixture({two:true});nativeCivilianTraffic.clearTarget()')
            page.keyboard.down('w')
            page.keyboard.down('d')
            page.keyboard.press('Shift')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id') == 98502
            before_cycle = page.evaluate('({speed:__controls.state.speed,angle:__controls.state.angle})')
            page.evaluate('__controls.frames(.2)')
            after_cycle = page.evaluate('({speed:__controls.state.speed,angle:__controls.state.angle})')
            assert after_cycle['speed'] > before_cycle['speed'] and after_cycle['angle'] > before_cycle['angle']
            page.keyboard.press('Shift')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id') == 98501
            page.keyboard.up('w')
            page.keyboard.up('d')
            result['cycleMovement'] = {'before': before_cycle, 'after': after_cycle}

            # Keep selection at 650 while explaining each fitted weapon's actual reach.
            page.evaluate('__controls.fixture({distance:1200,weapons:[__controls.weapon.id]})')
            page.evaluate('__controls.step()')
            range_text = page.locator('#combat-target-status').inner_text()
            assert '1200 u' in range_text and '1100 u' in range_text and 'Out of range' in range_text, range_text
            page.screenshot(path=str(OUTPUT / 'fitted-phaser-out-of-range.png'))
            page.evaluate('nativeCivilianTraffic.clearTarget()')
            page.keyboard.press('Shift')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id') == 98501
            page.evaluate('__controls.fixture({distance:1200,weapons:[__controls.weapon.id,__controls.torpedo.id]});__controls.step()')
            mixed_text = page.locator('#combat-target-status').inner_text()
            assert '1500 u (ready)' in mixed_text and '1100 u (out of range)' in mixed_text, mixed_text
            page.keyboard.down('Space')
            assert page.evaluate('__controls.accepted.length') == 1
            page.evaluate('__controls.frames(.1)')
            recharge_text = page.locator('#combat-target-status').inner_text()
            assert 'recharg' in recharge_text, recharge_text
            page.keyboard.up('Space')
            page.screenshot(path=str(OUTPUT / 'mixed-weapons-recharge.png'))
            result['feedback'] = {'range': range_text, 'mixed': mixed_text, 'recharge': recharge_text}
            page.evaluate("""() => {
              const {origin}=__controls.fixture({distance:600,two:true,weapons:[__controls.weapon.id,__controls.torpedo.id]});
              Object.assign(__controls.state.civilianTraffic.ships[1],{x:origin.x+300,y:origin.y});nativeShipSystems.invalidate(__controls.state);__controls.step();
            }""")
            blocked_text = page.locator('#combat-target-status').inner_text()
            assert 'Ready' in blocked_text and '1500 u (ready)' in blocked_text, blocked_text
            page.keyboard.down('Space')
            assert page.evaluate('__controls.accepted.length') == 1
            page.keyboard.up('Space')
            page.evaluate('__controls.frames(.1)')
            assert page.evaluate('__controls.state.weaponCombat.events.some(e=>e.hitTargetId===98502)'), 'Intervening ship did not take the physical beam'
            result['feedback']['blocked'] = blocked_text

            # A saved attack preserves charge/cargo, and held input never becomes save data.
            page.evaluate('__controls.fixture();__controls.state.minerals={titanium:17}')
            page.keyboard.down('Space')
            saved = page.evaluate("""() => {
              const state=__controls.state,item=nativeWeaponLoadout.equipped(state)[0];
              const saved=nativeSaveStorage.write(state);return {saved,instance:item.instance.id,readyAt:item.instance.readyAt,events:state.weaponCombat.events.length};
            }""")
            assert saved['saved']['ok'] and saved['events'] == 1, saved
            page.evaluate("resumeNativeGame('normal');__controls.rebind();__controls.step()")
            restored = page.evaluate("""instance=>({readyAt:__controls.state.shipEquipment.instances[instance].readyAt,cargo:__controls.state.minerals.titanium})""", saved['instance'])
            assert restored['readyAt'] == saved['readyAt'] and restored['cargo'] == 17, (saved, restored)
            count = page.evaluate('__controls.accepted.length')
            page.evaluate('__controls.frames(1.5)')
            assert page.evaluate('__controls.accepted.length') == count
            page.keyboard.up('Space')
            result['midwayReload'] = {'saved': saved, 'restored': restored}
            page.evaluate('__controls.fixture({distance:220});__controls.state.angle=Math.PI;__controls.step()')
            page.keyboard.down('Space')
            page.evaluate('__controls.frames(.08)')
            page.screenshot(path=str(OUTPUT / 'rearward-held-phaser-shield-contact.png'))
            page.keyboard.up('Space')
            assert not errors, errors
            (OUTPUT / 'results.json').write_text(json.dumps(result, indent=2))
            print(json.dumps(result, indent=2))
        browser.close()
finally:
    server.shutdown()
