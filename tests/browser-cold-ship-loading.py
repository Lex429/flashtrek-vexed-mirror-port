"""Current damage plates stay visible while unused cold artwork is deferred."""
import functools
import http.server
import json
import os
from pathlib import Path
import re
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'test-results'/'cold-ship-loading'
OUTPUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors, requested, held = [], [], {}
release_all = False


def gate(route):
    stage = int(re.search(r'ship-35-(\d)\.png', route.request.url).group(1))
    requested.append(stage)
    if not release_all and stage != 3:
        held[stage] = route
    else:
        route.continue_()


def check_player_loading(browser):
    player = browser.new_page(viewport={'width': 1280, 'height': 850})
    player.on('pageerror', lambda error: errors.append(str(error)))
    pending, network = [], []
    released = {'damage': False, 'hull': False}

    def player_gate(route):
        match = re.search(r'ship-(7|36)-(\d)\.png', route.request.url)
        hull, stage = int(match.group(1)), int(match.group(2))
        network.append({'type': hull, 'stage': stage})
        kind = 'damage' if (hull, stage) == (7, 1) else 'hull'
        if ((hull, stage) == (7, 1) or (hull, stage) == (36, 0)) and not released[kind]:
            pending.append((kind, route))
        else:
            route.continue_()

    def release(kind):
        released[kind] = True
        for pending_kind, route in list(pending):
            if pending_kind == kind:
                route.continue_()
                pending.remove((pending_kind, route))

    player.route(re.compile(r'.*/ship-(7|36)-\d\.png(?:\?.*)?$'), player_gate)
    try:
        player.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        player.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
        player.evaluate(r"""()=>{
          startNativeDevGame();
          const s=nativeNpcDev.getState();Object.assign(s,{speed:0,vx:0,vy:0,localCruise:null});
          delete s.arrivalApproach;delete s.motionKick;delete s.motionSpin;
          const effects=nativeShipEffects,p=window.__playerLoading={frames:[]};
          const plate=asset=>asset?.art?{type:asset.type,stage:asset.damageStage}:null;
          window.nativeShipEffects={...effects,paintShip(...args){const rendered=effects.paintShip(...args),d=args[1];
            if(d.entity===nativeNpcDev.getState()&&d.category==='player')p.frames.push({entityType:d.shipType,supplied:plate(args[2].asset),rendered:plate(rendered)});
            return rendered;}};
        }""")
        player.wait_for_function('()=>__playerLoading.frames.some(frame=>frame.supplied?.type===7&&frame.supplied.stage===0)', timeout=30000)
        player.evaluate(r"""()=>{
          const s=nativeNpcDev.getState(),d=nativeShipDefinitions.describe(s,s,{category:'player'});
          __playerLoading.damageStart=__playerLoading.frames.length;s.shields=0;
          const hit=nativeCombatShots.onPlayerHit(s,d.definition.hull*.3,{kind:'beam',from:{x:d.x-100,y:d.y}});
          if(!hit?.ok)throw Error('Actual player damage failed');
        }""")
        deadline = time.monotonic()+10
        while not any(kind == 'damage' for kind, _route in pending) and time.monotonic() < deadline:
            player.wait_for_timeout(20)
        assert any(kind == 'damage' for kind, _route in pending), network
        player.wait_for_function('()=>__playerLoading.frames.length-__playerLoading.damageStart>=5', timeout=10000)
        damage_held = player.evaluate('()=>__playerLoading.frames.slice(__playerLoading.damageStart)')
        assert all(frame['supplied'] == {'type': 7, 'stage': 0} and frame['rendered'] == {'type': 7, 'stage': 0} for frame in damage_held), damage_held
        player.locator('#space').screenshot(path=str(OUTPUT/'player-damage-plate-held.png'))
        release('damage')
        player.wait_for_function('()=>__playerLoading.frames.slice(__playerLoading.damageStart).some(frame=>frame.supplied?.type===7&&frame.supplied.stage===1&&frame.rendered?.stage===1)', timeout=30000)
        player.locator('#space').screenshot(path=str(OUTPUT/'player-damage-plate-ready.png'))

        # A different hull must never inherit the old hull's plate. Switch back
        # before its cold request finishes, then deliver that stale completion.
        player.locator('#devToolsBtn').click()
        player.locator('[data-dev-ship]').select_option('36')
        player.locator('[data-dev-equip]').click()
        player.wait_for_function('()=>__playerLoading.frames.filter(frame=>frame.entityType===36).length>=5', timeout=10000)
        hull_held = player.evaluate('()=>__playerLoading.frames.filter(frame=>frame.entityType===36)')
        assert all(frame['supplied'] is None and frame['rendered'] is None for frame in hull_held), hull_held
        player.locator('#devToolsBtn').click()
        player.locator('[data-dev-ship]').select_option('7')
        player.locator('[data-dev-equip]').click()
        player.wait_for_function('()=>nativeNpcDev.getState().shipType===7&&__playerLoading.frames.at(-1)?.supplied?.type===7', timeout=30000)
        player.evaluate('__playerLoading.lateStart=__playerLoading.frames.length')
        release('hull')
        player.evaluate('async()=>{await vexedFlightAssets.loadShip(36,nativeShipDefinitions.get(36).hull);}')
        player.wait_for_function('()=>__playerLoading.frames.length-__playerLoading.lateStart>=5', timeout=10000)
        late_frames = player.evaluate('()=>__playerLoading.frames.slice(__playerLoading.lateStart)')
        assert all(frame['entityType'] == 7 and frame['supplied']['type'] == 7 and frame['rendered']['type'] == 7 for frame in late_frames), late_frames
        player.locator('#space').screenshot(path=str(OUTPUT/'player-hull-generation-guard.png'))
        assert sum(row == {'type': 7, 'stage': 1} for row in network) == 1, network
        return {'heldDamageFrames': damage_held, 'heldHullChangeFrames': hull_held,
                'lateCompletionFrames': late_frames, 'network': network, 'sameHullAssetRetained': True,
                'wrongHullAssetCleared': True, 'lateCompletionIgnored': True}
    finally:
        for _kind, route in list(pending):
            try:
                route.abort()
            except Exception:
                pass
        player.close()


try:
    with sync_playwright() as playwright:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = playwright.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/ship-35-*.png', gate)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('()=>{startNativeDevGame();nativeNpcDev.showMap();}')
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships.length')
        page.wait_for_function('()=>!nativeShipEffects.metrics().pending && !vexedFlightAssets.cacheSnapshot().ships.pending', timeout=120000)
        page.evaluate(r"""() => {
          const s=nativeNpcDev.getState(),ship=s.civilianTraffic.ships.find(ship=>ship.id===2),definition=nativeShipDefinitions.get(35,'civilian');
          if(nativeShipEffects.ready(35,'civilian'))throw Error('Cold Galaxy class was already prepared');
          Object.assign(s,{speed:0,vx:0,vy:0,localCruise:null});delete s.arrivalApproach;delete s.motionKick;delete s.motionSpin;
          nativeNpcLives.interrupt(s,ship,'cold appearance regression');
          const observer=s.system===1?vexedSolFlight.shipPosition(s):s;
          Object.assign(ship,{shipType:35,system:s.system,x:observer.x+130,y:observer.y-65,heading:.35,speed:0,
            hull:definition.hull*.1,shields:0,phase:'docked',timer:1000000,scriptedDemo:'cold-art-regression'});
          delete ship.localLeg;delete ship.journey;ship.nextActionAt=s.civilianTraffic.clock+1000000;
          nativeNpcLives.refreshLocation(s,ship);nativeShipSystems.invalidate(s);
          const probe=window.__coldShip={ship,maximum:definition.hull,started:performance.now(),firstVisibleMs:null,draws:0,blankAfterVisible:0,stages:[]};
          const effects=nativeShipEffects;
          window.nativeShipEffects={...effects,paintShip(...args){const asset=effects.paintShip(...args);
            if(args[1].entity===ship){probe.draws++;if(asset?.art){probe.firstVisibleMs??=performance.now()-probe.started;probe.stages.push(asset.damageStage);}
              else if(probe.firstVisibleMs!==null)probe.blankAfterVisible++;}return asset;}};
        }""")
        page.locator('#dev-galaxy-return').click()
        page.wait_for_function('()=>__coldShip.stages.filter(stage=>stage===3).length>=3', timeout=30000)
        assert requested[0] == 3, requested
        cold = page.evaluate('()=>({firstVisibleMs:__coldShip.firstVisibleMs,stages:__coldShip.stages.slice(),metrics:nativeShipEffects.metrics(),loader:vexedFlightAssets.cacheSnapshot().preparation})')
        page.locator('#space').screenshot(path=str(OUTPUT/'cold-severe-galaxy.png'))

        # A newly needed plate bypasses the queued unused stages. The existing
        # severe plate stays visible while its replacement request is held.
        page.evaluate('()=>{__coldShip.ship.hull=__coldShip.maximum*.7;nativeShipSystems.invalidate(nativeNpcDev.getState());__coldShip.transitionStart=__coldShip.stages.length;}')
        deadline = time.monotonic()+10
        while 1 not in held and time.monotonic() < deadline:
            page.wait_for_timeout(20)
        assert 1 in held, requested
        page.wait_for_timeout(150)
        fallback = page.evaluate('()=>({stages:__coldShip.stages.slice(__coldShip.transitionStart),blanks:__coldShip.blankAfterVisible})')
        assert fallback['stages'] and all(stage == 3 for stage in fallback['stages']), fallback
        assert fallback['blanks'] == 0, fallback
        held.pop(1).continue_()
        page.wait_for_function('()=>__coldShip.stages.slice(__coldShip.transitionStart).filter(stage=>stage===1).length>=3', timeout=30000)
        page.locator('#space').screenshot(path=str(OUTPUT/'promoted-damage-stage.png'))
        release_all = True
        for route in list(held.values()):
            route.continue_()
        held.clear()
        page.wait_for_function('()=>!nativeShipEffects.metrics().pending', timeout=120000)
        page.evaluate("async()=>{await nativeShipEffects.prepare(35,'civilian');}")

        # Use the real shared damage boundary once plates are warm and confirm
        # the rendered stage follows actual hull health, including fragments.
        page.evaluate(r"""()=>{
          const s=nativeNpcDev.getState(),p=__coldShip,observer=s.system===1?vexedSolFlight.shipPosition(s):s;
          // The ordinary fleet continues working while optional art prepares.
          // Return this visual fixture to the camera before the separate hit.
          nativeNpcLives.interrupt(s,p.ship,'warm appearance regression');
          Object.assign(p.ship,{x:observer.x+130,y:observer.y-65,vx:0,vy:0,speed:0,phase:'docked',timer:1000000});
          nativeShipSystems.invalidate(s);
          const d=nativeShipDefinitions.describe(s,p.ship,{category:'civilian'});
          p.damageStart=p.stages.length;
          const result=nativeShipSystems.applyHit(s,{target:d,point:{x:d.x,y:d.y},from:{x:d.x-100,y:d.y}},
            {damage:p.maximum*.3,kind:'beam'},{id:'player',system:s.system});
          if(!result?.ok)throw Error('Shared damage transition failed');p.damageResult=result;
        }""")
        try:
            page.wait_for_function('()=>__coldShip.stages.slice(__coldShip.damageStart).includes(2)', timeout=10000)
        except Exception:
            print(json.dumps(page.evaluate('()=>({hull:__coldShip.ship.hull,shields:__coldShip.ship.shields,phase:__coldShip.ship.phase,damage:{before:__coldShip.damageResult.beforeStage,after:__coldShip.damageResult.afterStage},stages:__coldShip.stages.slice(-20),draws:__coldShip.draws,position:{x:__coldShip.ship.x,y:__coldShip.ship.y}})')))
            raise
        page.locator('#space').screenshot(path=str(OUTPUT/'warm-shared-damage-transition.png'))
        result = page.evaluate(r"""()=>({
          firstVisibleMs:__coldShip.firstVisibleMs,blankAfterVisible:__coldShip.blankAfterVisible,
          draws:__coldShip.draws,observedStages:[...new Set(__coldShip.stages)],
          preparations:vexedFlightAssets.cacheSnapshot().preparation.recent.filter(row=>row.type===35),
          metrics:nativeShipEffects.metrics(),population:nativeNpcDev.getState().civilianTraffic.ships.length+nativeNpcDev.getState().solEconomy.freighters.length+1
        })""")
        assert result['blankAfterVisible'] == 0, result
        assert sorted(requested) == [0, 1, 2, 3], requested
        assert sorted(row['stage'] for row in result['preparations']) == [0, 1, 2, 3], result['preparations']
        assert {1, 2, 3}.issubset(result['observedStages']), result
        page.close()
        player_result = check_player_loading(browser)
        assert not errors, errors
        report = {'passed': True, 'browser': browser.version, 'viewport': {'width': 1280, 'height': 850},
                  'cold': cold, 'heldTransition': fallback, 'result': result, 'networkStageOrder': requested, 'player': player_result,
                  'scope': 'Functional gated cold visibility test; first-visible latency includes deliberate network gates and is not a performance comparison.'}
        (OUTPUT/'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps({'passed': True, 'firstVisibleMs': result['firstVisibleMs'], 'networkStageOrder': requested,
                          'blankAfterVisible': result['blankAfterVisible'], 'observedStages': result['observedStages'],
                          'playerSameHullRetained': player_result['sameHullAssetRetained'],
                          'playerWrongHullCleared': player_result['wrongHullAssetCleared'], 'playerLateCompletionIgnored': player_result['lateCompletionIgnored']}))
        browser.close()
finally:
    for route in list(held.values()):
        try:
            route.abort()
        except Exception:
            pass
    server.shutdown()
