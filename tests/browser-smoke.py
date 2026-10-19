"""Run against an isolated local server and a fresh Edge browser profile."""
import functools
import http.server
import json
from pathlib import Path
import threading
import sys
import os

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results'
OUTPUT.mkdir(exist_ok=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = None
if len(sys.argv)>1:
    base = sys.argv[1].rstrip('/')
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
errors, failed = [], []
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser = p.chromium.launch(headless=True, **({'channel':channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
        page.goto(base + '/html-games/broken-mirror-port/index.html')
        page.wait_for_function('() => window.nativeCombatShots?.isReady() && document.querySelector("#startup").hidden', timeout=90000)
        page.evaluate("""() => {
          const advance=nativeCivilianTraffic.advance;
          nativeCivilianTraffic.advance=(state,dt)=>{window.__flightState=state;return advance(state,dt);};
          const mark=(owner,name,label)=>{const original=owner[name];owner[name]=function(...args){window.__layers.push(label);return original.apply(this,args);};};
          window.__layers=[];
          const render=vexedSpace.render;
          vexedSpace.render=function(...args){window.__layers=[];return render.apply(this,args);};
          mark(vexedSpace,'planetLight','planet');mark(nativeSolEconomy,'paint','freighter');mark(nativeCivilianTraffic,'paint','civilian');
          startNativeDevGame();
        }""")
        page.wait_for_function('() => window.__flightState && window.__layers.includes("civilian") && nativeCivilianTraffic.effectsReady() && nativeSolAsteroids.placements.length', timeout=120000)
        layers = page.evaluate('window.__layers')
        assert max(i for i, layer in enumerate(layers) if layer == 'planet') < layers.index('freighter'), layers
        assert layers.index('freighter') < layers.index('civilian'), layers
        before_flight = page.evaluate('({x:__flightState.x,y:__flightState.y,angle:__flightState.angle})')
        page.keyboard.down('w')
        page.wait_for_timeout(180)
        page.keyboard.up('w')
        page.keyboard.down('d')
        page.wait_for_timeout(180)
        page.keyboard.up('d')
        after_flight = page.evaluate('({x:__flightState.x,y:__flightState.y,angle:__flightState.angle,speed:__flightState.speed})')
        assert after_flight['speed'] > 0
        assert (after_flight['x'],after_flight['y']) != (before_flight['x'],before_flight['y'])
        assert after_flight['angle'] != before_flight['angle']
        page.screenshot(path=str(OUTPUT / 'flight.png'))
        page.evaluate('window.requestAnimationFrame=()=>0')
        page.wait_for_timeout(100)
        results = page.evaluate("""() => {
          function check(value,message){if(!value)throw Error(message);}
          const state=JSON.parse(JSON.stringify(window.__flightState));
          const civilianTemplate=state.civilianTraffic.ships.find(ship=>ship.system===state.system);
          const tugTemplate=state.solEconomy.freighters[0];
          Object.assign(state,{devMode:false,x:100000,y:100000,angle:0,speed:0,hull:100,shields:100});
          state.civilianTraffic.ships=[];state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];
          state.solEconomy.freighters=[];
          const origin=vexedSolFlight.shipPosition(state),sampleRock=nativeSolAsteroids.placements[0];
          const rock={...sampleRock,slotId:state.system*100000+99999,x:origin.x+100,y:origin.y,size:35,maxHull:1};
          const rocks=nativeSolAsteroids.forSystem(state.system);
          const beam=VexedMirrorWeapons.find(weapon=>weapon.damage>0&&nativeCombatShots.weaponVisual(weapon).kind==='beam');
          nativeWeaponLoadout.refit(state,[beam.id,null,null]);
          const target={id:'probe-target',x:origin.x+180,y:origin.y,heading:0};
          let intendedHits=0;
          const fired=nativeCombatShots.fire({state,shipHeight:40,owner:'browser-probe',getTarget:()=>target,
            dimensions:()=>({width:30,height:40}),shielded:()=>false,onHit(){intendedHits++;}});
          check(fired.ok,'Could not fire real beam: '+fired.error);
          target.previousX=target.x;target.previousY=target.y=origin.y+400;
          rocks.push(rock);
          for(let i=0;i<8;i++){nativeSimulation.advance(state,1/60);nativeCombatShots.advance(state,1/60);}
          check(state.destroyedAsteroids?.includes(rock.slotId),'Missed beam did not destroy the intervening asteroid');
          check(intendedHits===0,'Missed beam damaged its original target');
          nativeCombatShots.cancel();nativeEnvironmentalImpacts.reset();
          state.destroyedAsteroids=[];
          const civilian={...civilianTemplate,id:9999,system:state.system,x:origin.x+45,y:origin.y,heading:0,phase:'cruise',hull:100,shields:100};
          const tug={...tugTemplate,id:9999,x:origin.x+70,y:origin.y,heading:0,phase:'waiting',hull:100,shields:100};
          state.civilianTraffic.ships=[civilian];state.solEconomy.freighters=[tug];
          const before=JSON.stringify([state.hull,state.shields,civilian.hull,civilian.shields,tug.hull,tug.shields]);
          nativeEnvironmentalImpacts.explode(state,{x:origin.x+25,y:origin.y,size:80},{radius:180});
          for(let i=0;i<65;i++){nativeSimulation.advance(state,1/60);nativeEnvironmentalImpacts.advance(state,1/60);}
          check(!state.destroyedAsteroids.includes(rock.slotId),'Blast destroyed nearby asteroid');
          check(JSON.stringify([state.hull,state.shields,civilian.hull,civilian.shields,tug.hull,tug.shields])===before,'Explosion damaged ship health');
          check(nativeShipEffects.snapshot(nativeShipDefinitions.describe(state,civilian,{category:'civilian'})).flash&&nativeShipEffects.snapshot(nativeShipDefinitions.describe(state,tug,{category:'tug'})).flash,'Blast did not flash nearby ship shields');
          const snapshot=nativeEnvironmentalImpacts.snapshot();
          check(snapshot.impacts.some(event=>event.target==='ship:player'),'Player was omitted from explosion contacts');
          const oldClock=snapshot.clock;nativePause.open();nativeEnvironmentalImpacts.advance(state,1);
          check(nativeEnvironmentalImpacts.snapshot().clock===oldClock,'Paused blast clock advanced');nativePause.close();
          nativeEnvironmentalImpacts.reset();
          civilian.shields=0;tug.shields=0;
          nativeEnvironmentalImpacts.explode(state,{x:origin.x+25,y:origin.y,size:80},{radius:180});
          for(let i=0;i<65;i++){nativeSimulation.advance(state,1/60);nativeEnvironmentalImpacts.advance(state,1/60);}
          check(civilian.hull===100&&tug.hull===100,'Unshielded blast contact damaged hull');
          rocks.splice(rocks.indexOf(rock),1);
          return {layers:window.__layers,beam:beam.name,missedBeamDestroyedAsteroid:true,
            blastPreservedAsteroid:true,shipHealthUnchanged:true,shipShieldFlashes:true,unshieldedHullUnchanged:true,
            pauseFreezesBlast:true,environmentalImpacts:snapshot.impacts.length};
        }""")
        owned_before = page.evaluate("""() => {
          const state=window.__flightState,owned=nativeWeaponLoadout.equipped(state)[0];
          owned.instance.readyAt=nativeSimulation.seconds(state)+3;
          document.querySelector('#save').click();
          return {id:owned.instance.id,readyAt:owned.instance.readyAt,clock:nativeSimulation.seconds(state)};
        }""")
        page.reload()
        page.wait_for_function('() => window.nativeCombatShots?.isReady() && document.querySelector("#startup").hidden', timeout=90000)
        page.evaluate("""() => {
          const advance=nativeCivilianTraffic.advance;
          nativeCivilianTraffic.advance=(state,dt)=>{window.__restoredState=state;return advance(state,dt);};
          document.querySelector('[data-menu="continue-dev"]').click();
        }""")
        page.wait_for_function('() => !!window.__restoredState')
        owned_after = page.evaluate("""() => {
          const state=window.__restoredState,owned=nativeWeaponLoadout.equipped(state)[0];
          return {id:owned.instance.id,readyAt:owned.instance.readyAt,clock:nativeSimulation.seconds(state)};
        }""")
        assert owned_after['id'] == owned_before['id']
        assert owned_after['readyAt'] == owned_before['readyAt']
        assert owned_after['clock'] >= owned_before['clock']
        results['saveContinuePreservesOwnedRecharge'] = True
        page.goto(base + '/html-games/flashtrek-broken-mirror/damage-showcase.html')
        page.wait_for_function('() => window.showcaseState?.().ready', timeout=120000)
        page.locator('#ship-select').select_option('59')
        page.wait_for_function('() => window.showcaseState().ship===59 && window.showcaseState().ready')
        page.locator('#destroy').click()
        page.wait_for_function('() => window.showcaseEnvironment().nearbyAsteroids.some(rock=>rock.destroyed)', timeout=30000)
        page.wait_for_function('() => window.showcaseState().nearbyShip.impacts.some(event=>event.kind==="shield")', timeout=30000)
        shielded = page.evaluate('window.showcaseState()')
        assert shielded['nearbyShip']['hull'] == 100 and shielded['nearbyShip']['shields'] == 100
        page.screenshot(path=str(OUTPUT / 'showcase-shield-impact.png'))
        page.locator('#repair').click()
        page.locator('#debris-target-shields').uncheck()
        page.locator('#destroy').click()
        page.wait_for_function('() => window.showcaseState().nearbyShip.impacts.some(event=>event.kind==="sparks")', timeout=30000)
        unshielded = page.evaluate('window.showcaseState()')
        assert unshielded['nearbyShip']['hull'] == 100 and unshielded['nearbyShip']['shields'] == 0
        page.screenshot(path=str(OUTPUT / 'showcase-hull-impact.png'))
        results['showcase'] = {'shieldImpact': True, 'hullImpact': True, 'nearbyAsteroidsDestroyed': page.evaluate('window.showcaseEnvironment().nearbyAsteroids.filter(rock=>rock.destroyed).length')}
        assert not errors, errors
        assert not failed, failed
        results.update(passed=True, ordinaryKeyboardFlight=True, javascriptErrors=errors, failedResponses=failed)
        (OUTPUT / 'browser-report.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
        print(json.dumps(results, indent=2))
        browser.close()
finally:
    if server:
        server.shutdown()
