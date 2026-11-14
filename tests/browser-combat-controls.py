"""Real active-entry held controls, target ordering and quiet fitted-weapon checks."""
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
            // These ship-only cases need an explicitly clear scene: free-flight
            // rocks now exist around the old distant fixture coordinates too.
            state.minedAsteroids=nativeSolAsteroids.nearby(1,origin,5000).map(rock=>rock.slotId);
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
        # Actual Shift taps must see the same bounded asteroid fields as flight,
        # including corridor and free-flight rocks absent from forSystem().
        asteroid_targets=[]
        for area,frame in [('sun',1),('corridor',1),('corridor',2),('free-flight',2)]:
            approach=page.evaluate("""({area,frame})=>{
              __controls.fixture();const s=__controls.state;
              s.civilianTraffic.ships=[];s.solEconomy.freighters=[];
              s.minedAsteroids=[];s.destroyedAsteroids=[];
              nativeCivilianTraffic.clearTarget();nativeSolEconomy.clearTarget();nativeAsteroidCombat.deselect();
              const paths=nativeTravelCorridors,rocks=nativeSolAsteroids,anchor=nativeManualFlight.anchor(frame);
              let rock;
              if(area==='sun'){
                const sun=vexedSolFlight.bodyPosition(nativeSystemCatalog.bodies(1).find(b=>b.kind==='star'));
                rock=[...rocks.forSystem(1)].sort((a,b)=>Math.hypot(a.x-sun.x,a.y-sun.y)-Math.hypot(b.x-sun.x,b.y-sun.y))[0];
              }else if(area==='corridor'){
                const route=paths.lanes().find(l=>l.from===1&&l.to===2);
                const site=route.sites.find(p=>nativeManualFlight.regionAtPoint(s,p).kind==='interstellar');
                if(!site)throw Error('No interstellar corridor fixture');
                rock=rocks.find(paths.rockIds(site)[0],frame);
              }else{
                const edge=nativeManualFlight.boundaries().find(b=>b.id===1);
                const x=edge.x,y=edge.y-edge.ry-5000;
                const site=paths.query({minX:x-2048,minY:y-2048,maxX:x+2048,maxY:y+2048}).find(p=>p.sector&&paths.rockIds(p).length);
                if(!site)throw Error('No sparse free-flight fixture');
                rock=rocks.find(paths.rockIds(site)[0],frame);
              }
              s.system=frame;nativeSystemCatalog.initialize(s);s.localBody=frame===1?0:nativeSystemCatalog.homeId(frame);
              const base=frame===1?vexedSolFlight.shipPosition({...s,x:0,y:0}):{x:0,y:0};
              Object.assign(s,{x:rock.x-180-base.x,y:rock.y-base.y,previousX:rock.x-180,previousY:rock.y,angle:0,landed:false});
              nativeShipMotion.stop(s);nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);
              __controls.rebind();__controls.step();
              const ship=frame===1?vexedSolFlight.shipPosition(s):s;
              const candidates=rocks.nearby(frame,ship,1800).filter(r=>!s.minedAsteroids.includes(r.slotId)&&!s.destroyedAsteroids.includes(r.slotId)&&Math.hypot(r.x-ship.x,r.y-ship.y)<=1800);
              return {area,frame,rock:rock.slotId,candidates:candidates.map(r=>r.slotId),inRegionalList:rocks.forSystem(frame).some(r=>r.slotId===rock.slotId),
                region:nativeManualFlight.regionAtPoint(s,{x:ship.x+anchor.x,y:ship.y+anchor.y}).kind};
            }""",{'area':area,'frame':frame})
            assert approach['candidates'],approach
            if area!='sun':assert not approach['inRegionalList'] and approach['region']=='interstellar',approach
            page.keyboard.press('Shift')
            lock=page.evaluate("""()=>{const s=__controls.state,r=nativeAsteroidCombat.target;return {id:r?.slotId,system:r?.system,resolved:r?!!nativeShipSystems.resolve(s,'rock:'+r.slotId,s.system):false,notice:document.querySelector('#connection').textContent};}""")
            print(json.dumps({'area':area,'frame':frame,'candidateCount':len(approach['candidates']),'shiftLock':lock}),flush=True)
            assert lock.get('id') in approach['candidates'] and lock['system']==frame and lock['resolved'],{'approach':approach,'lock':lock}
            page.keyboard.press('Space')
            assert page.evaluate("id=>__controls.accepted.some(e=>String(e.target)==='rock:'+id)",lock['id'])
            if area=='sun':
                visited={lock['id']}
                for _ in approach['candidates']:
                    page.keyboard.press('Shift')
                    visited.add(page.evaluate('nativeAsteroidCombat.target?.slotId'))
                assert visited==set(approach['candidates']),{'visited':list(visited),'expected':approach['candidates']}
            page.screenshot(path=str(OUTPUT/f'shift-asteroid-{area}-{frame}.png'))
            if area=='free-flight':
                # The ordinary hold-to-clear gesture remains separate from taps.
                page.keyboard.down('Shift');page.wait_for_timeout(550);page.keyboard.up('Shift')
                assert page.evaluate('nativeAsteroidCombat.target') is None
            asteroid_targets.append({'area':area,'frame':frame,'lock':lock,'region':approach['region']})
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
        result = {'held': held, 'movement': {'before': before, 'after': after, 'clicked': clicked}, 'asteroidTargeting':asteroid_targets,'errors': errors}
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
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id') == 98502,page.evaluate('nativeTargetingActions.snapshot()')
            before_cycle = page.evaluate('({speed:__controls.state.speed,angle:__controls.state.angle})')
            page.evaluate('__controls.frames(.2)')
            after_cycle = page.evaluate('({speed:__controls.state.speed,angle:__controls.state.angle})')
            assert after_cycle['speed'] > before_cycle['speed'] and after_cycle['angle'] > before_cycle['angle']
            page.keyboard.press('Shift')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id') == 98501
            page.keyboard.up('w')
            page.keyboard.up('d')
            result['cycleMovement'] = {'before': before_cycle, 'after': after_cycle}

            def firing_status():
                return page.evaluate("""() => {
                  const s=__controls.state,target=nativeCivilianTraffic.target(s);
                  const status=nativeCombatShots.firingStatus(s,
                    nativeShipDefinitions.describe(s,s,{category:'player'}),
                    nativeShipSystems.resolve(s,String(target.id),s.system));
                  return {ok:status.ok,reason:status.reason,distance:status.distance,
                    weapons:status.weapons.map(row=>({range:row.spec.range,
                      inRange:row.inRange,ready:row.ready,remaining:row.remaining}))};
                }""")

            # Removing floating feedback must preserve range, charge and selection.
            page.evaluate('__controls.fixture({distance:1200,weapons:[__controls.weapon.id]})')
            page.evaluate('__controls.step()')
            range_status = firing_status()
            assert not range_status['ok'] and range_status['reason'] == 'range', range_status
            assert round(range_status['distance']) == 1200, range_status
            assert all(row['range'] == 1100 and not row['inRange'] for row in range_status['weapons']), range_status
            page.keyboard.press('Space')
            assert page.evaluate('__controls.accepted.length') == 0
            assert page.locator('#combat-target-status, #notice, .flight-keys').count() == 0
            assert page.locator('#space').get_attribute('title') is None
            page.screenshot(path=str(OUTPUT / 'fitted-phaser-out-of-range.png'))
            page.evaluate('nativeCivilianTraffic.clearTarget()')
            page.keyboard.press('Shift')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id') == 98501
            page.evaluate('__controls.fixture({distance:1200,weapons:[__controls.weapon.id,__controls.torpedo.id]});__controls.step()')
            mixed_status = firing_status()
            assert mixed_status['ok'], mixed_status
            assert any(row['range'] == 1500 and row['inRange'] and row['ready'] for row in mixed_status['weapons']), mixed_status
            assert any(row['range'] == 1100 and not row['inRange'] for row in mixed_status['weapons']), mixed_status
            page.keyboard.down('Space')
            assert page.evaluate('__controls.accepted.length') == 1
            page.evaluate('__controls.frames(.1)')
            recharge_status = firing_status()
            assert not recharge_status['ok'] and recharge_status['reason'] == 'recharge', recharge_status
            assert any(not row['ready'] and row['remaining'] > 0 for row in recharge_status['weapons']), recharge_status
            page.keyboard.up('Space')
            page.screenshot(path=str(OUTPUT / 'mixed-weapons-recharge.png'))
            result['firingStatus'] = {'range': range_status, 'mixed': mixed_status, 'recharge': recharge_status}
            page.evaluate("""() => {
              const {origin}=__controls.fixture({distance:600,two:true,weapons:[__controls.weapon.id,__controls.torpedo.id]});
              Object.assign(__controls.state.civilianTraffic.ships[1],{x:origin.x+300,y:origin.y});nativeShipSystems.invalidate(__controls.state);__controls.step();
            }""")
            blocked_status = firing_status()
            assert blocked_status['ok'], blocked_status
            assert any(row['range'] == 1500 and row['ready'] for row in blocked_status['weapons']), blocked_status
            page.keyboard.down('Space')
            assert page.evaluate('__controls.accepted.length') == 1
            page.keyboard.up('Space')
            page.evaluate('__controls.frames(.1)')
            assert page.evaluate('__controls.state.weaponCombat.events.some(e=>e.hitTargetId===98502)'), 'Intervening ship did not take the physical beam'
            result['firingStatus']['blocked'] = blocked_status
            assert page.locator('#combat-target-status, #notice, .flight-keys').count() == 0

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
            # Exercise actual W/Space input while both ships coast at full speed.
            page.evaluate("""()=>{
              window.__movingTargetAdvance=nativeCivilianTraffic.advance;
              nativeCivilianTraffic.advance=(s,dt)=>{
                if(!window.__movingShotCheck)return __movingTargetAdvance(s,dt);
                const target=s.civilianTraffic.ships[0];
                nativeShipSystems.move(s,target,'civilian',{coast:true},{maxSpeed:Infinity,turnRate:0,damping:0,inertial:true},dt);
              };
            }""")
            moving_shots=[]
            for kind in ['disruptor','torpedo']:
                fixture=page.evaluate("""kind=>{
                  const model=VexedMirrorWeapons.find(m=>m.damage>0&&nativeCombatShots.weaponVisual(m).kind===kind);
                  __controls.fixture({distance:500,weapons:[model.id]});const s=__controls.state;
                  const speed=nativeShipMotion.profiles.manual(nativeShipDefinitions.forEntity(s)).maxSpeed;
                  Object.assign(s,{angle:0,speed,vx:speed,vy:0});
                  const p=vexedSolFlight.shipPosition(s),target=s.civilianTraffic.ships[0];
                  Object.assign(target,{x:p.x+500,y:p.y,heading:0,speed,vx:speed,vy:0});
                  nativeShipSystems.refreshShip(s,s,'player');nativeShipSystems.refreshShip(s,target,'civilian');
                  window.__movingShotCheck=true;__controls.rebind();return {speed,shields:target.shields};
                }""",kind)
                page.keyboard.down('w');page.keyboard.down('Space');page.keyboard.up('Space')
                initial=page.evaluate('()=>{const s=__controls.state,e=s.weaponCombat.events.find(e=>e.projectile);return {vx:e.vx,sourceVx:e.inheritedVx,speed:s.speed};}')
                assert initial['vx']>initial['sourceVx'] and initial['sourceVx']>400,initial
                moving=page.evaluate("""()=>{
                  const e=__controls.state.weaponCombat.events.find(e=>e.projectile);
                  for(let i=0;i<360&&!e.resolved;i++)__controls.step();
                  const s=__controls.state,t=s.civilianTraffic.ships[0];
                  return {hit:e.hitTargetId??null,shields:t.shields,inheritedVx:e.inheritedVx,
                    resolved:e.resolved,alive:e.alive,cancelled:e.cancelled,shot:{x:e.x,y:e.y,vx:e.vx,vy:e.vy,age:e.age},
                    player:vexedSolFlight.shipPosition(s),target:{x:t.x,y:t.y,vx:t.vx,vy:t.vy}};
                }""")
                page.keyboard.up('w')
                assert moving['hit']==98501 and moving['shields']<fixture['shields'],moving
                moving_shots.append({'kind':kind,'initial':initial,'result':moving})
            page.evaluate('()=>{window.__movingShotCheck=false;nativeCivilianTraffic.advance=__movingTargetAdvance;}')
            result['movingProjectiles']=moving_shots
            # Controller-friendly nose intent: preview, keyboard and trigger all
            # share the same production decision without reading pointer location.
            page.evaluate("""()=>{
              const {origin}=__controls.fixture({two:true}),s=__controls.state;
              for(const t of s.civilianTraffic.ships){delete t.retaliationTargetId;delete t.retaliationUntil;t.shipType=7;}
              const [side,ahead]=s.civilianTraffic.ships;
              Object.assign(side,{x:origin.x,y:origin.y+140});Object.assign(ahead,{x:origin.x+340,y:origin.y});
              Object.assign(s,{miningTool:false,vx:0,vy:120,speed:120,motionDrift:true,angle:0});
              nativeShipSystems.invalidate(s);nativeTargetingActions.clear();__controls.rebind();__controls.frames(.15);
            }""")
            preview=page.evaluate('nativeTargetingActions.snapshot()')
            assert preview['preview']['key']=='civilian:98502',preview
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)') is None
            page.screenshot(path=str(OUTPUT/'nose-preview-sideways-drift.png'))
            page.mouse.move(10,10);page.keyboard.press('Shift')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==98502
            # Turning changes the next choice, while the existing lock stays put.
            page.evaluate('()=>{nativeShipMotion.stop(__controls.state);__controls.state.angle=Math.PI/2;nativeShipSystems.refreshShip(__controls.state,__controls.state,"player");__controls.frames(.15);}')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==98502
            assert page.evaluate('nativeTargetingActions.snapshot().preview.key')=='civilian:98501'
            page.keyboard.press('Shift');assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==98501
            # An analog trigger stays locked beyond the keyboard hold duration.
            page.evaluate('nativeTargetingActions.clear();__controls.state.angle=0;nativeShipSystems.refreshShip(__controls.state,__controls.state,"player");nativeTargetingActions.trigger(0);nativeTargetingActions.trigger(.8)')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==98502
            page.wait_for_timeout(600)
            page.evaluate('()=>{for(let n=0;n<100;n++)nativeTargetingActions.trigger(1);__controls.frames(.2);}')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==98502
            page.evaluate('nativeTargetingActions.trigger(0);nativeTargetingActions.trigger(.8)')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==98501
            page.evaluate('nativeTargetingActions.trigger(0)')
            # A trigger press during Inventory is consumed until the trigger is released.
            page.locator('#inventoryBtn').click()
            assert not page.evaluate('nativeTargetingActions.trigger(1)')
            page.keyboard.press('Escape');page.evaluate('__controls.rebind();__controls.step()')
            assert not page.evaluate('nativeTargetingActions.trigger(1)')
            assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==98501
            page.evaluate('nativeTargetingActions.trigger(0)')
            # A rearward attacker takes precedence over a peaceful ship ahead.
            page.evaluate("""()=>{
              const {origin}=__controls.fixture({two:true}),s=__controls.state,[front,rear]=s.civilianTraffic.ships;
              Object.assign(front,{x:origin.x+350,y:origin.y,shipType:7});delete front.retaliationTargetId;delete front.retaliationUntil;
              Object.assign(rear,{x:origin.x-250,y:origin.y,shipType:7,retaliationTargetId:'player',retaliationUntil:nativeSimulation.seconds(s)+60});
              nativeShipSystems.invalidate(s);nativeTargetingActions.clear();__controls.rebind();__controls.frames(.15);
            }""")
            page.keyboard.press('Shift');assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==98502
            # A slow approach with a mining tool favours the usable asteroid.
            mining=page.evaluate("""()=>{
              __controls.fixture();const s=__controls.state,rock=nativeSolAsteroids.forSystem(1)[0],p=vexedSolFlight.shipPosition(s);
              s.x+=rock.x-320-p.x;s.y+=rock.y-p.y;nativeShipMotion.stop(s);s.miningTool=true;
              const ship=vexedSolFlight.shipPosition(s),friend={...s.civilianTraffic.ships[0],id:98777};Object.assign(friend,{x:ship.x+270,y:ship.y+70,shipType:7});
              s.civilianTraffic.ships=[friend];nativeNpcLives.invalidateMembership(s);
              s.minedAsteroids=nativeSolAsteroids.nearby(1,ship,5000).filter(r=>r.slotId!==rock.slotId).map(r=>r.slotId);
              nativeShipSystems.invalidate(s);nativeTargetingActions.clear();__controls.rebind();__controls.frames(.15);return rock.slotId;
            }""")
            page.keyboard.press('Shift');assert page.evaluate('nativeAsteroidCombat.target?.slotId')==mining,page.evaluate('nativeTargetingActions.snapshot()')
            page.screenshot(path=str(OUTPUT/'nose-mining-choice.png'))
            result['noseTargeting']={'noCursorDependency':True,'previewBeforeLock':preview['preview'],'sidewaysDrift':True,'turnReacquires':True,'lockDoesNotJump':True,'rearAttacker':True,'miningContext':True,'controllerPressEdges':True,'controllerHoldRetainsLock':True,'controllerInventoryGate':True}
            # Similar scores must not flicker or change what the visible preview
            # promises. A deliberate cycle followed by firing confirms a correction.
            page.evaluate("""()=>{
              const {origin}=__controls.fixture({two:true}),s=__controls.state;
              s.civilianTraffic.ships=s.civilianTraffic.ships.map((t,i)=>({...t,id:99101+i,shipType:7,x:origin.x+260,y:origin.y+(i?45:-45)}));
              for(const t of s.civilianTraffic.ships){delete t.retaliationTargetId;delete t.retaliationUntil;}
              s.miningTool=false;nativeNpcLives.invalidateMembership(s);nativeShipSystems.invalidate(s);nativeTargetingActions.clear();__controls.rebind();__controls.frames(.15);
            }""")
            assert page.evaluate('nativeTargetingActions.snapshot().preview.key')=='civilian:99101'
            page.evaluate("""()=>{const s=__controls.state,p=vexedSolFlight.shipPosition(s),b=s.civilianTraffic.ships[1];b.x=p.x+250;b.y=p.y+45*250/260;nativeShipSystems.refreshShip(s,b,'civilian');__controls.frames(.15);}""")
            tie=page.evaluate('nativeTargetingActions.snapshot()')
            assert tie['candidates'][0]['key']=='civilian:99102' and tie['preview']['key']=='civilian:99101',tie
            assert tie['published']=='civilian:99101',tie
            page.keyboard.press('Shift');assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==99101
            page.keyboard.press('Shift');assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==99102
            assert page.evaluate('nativeTargetingActions.snapshot().correction') is None
            page.keyboard.press('Space');page.evaluate('__controls.frames(.03)')
            correction=page.evaluate('nativeTargetingActions.snapshot().correction')
            assert correction['chosen']=='civilian:99102' and 'civilian:99101' in correction['skipped'],correction
            page.screenshot(path=str(OUTPUT/'preview-promise-and-confirmed-correction.png'))
            page.evaluate("()=>{if(!nativeSaveStorage.write(__controls.state).ok)throw Error('Intent reload save failed');resumeNativeGame('normal');__controls.rebind();__controls.step();}")
            assert page.evaluate('nativeTargetingActions.snapshot().correction') is None
            # A genuinely new attack can override the visible peaceful choice.
            page.evaluate("""()=>{
              const {origin}=__controls.fixture({two:true}),s=__controls.state;
              s.civilianTraffic.ships=s.civilianTraffic.ships.map((t,i)=>({...t,id:99201+i,shipType:7,x:origin.x+(i?-250:280),y:origin.y}));
              for(const t of s.civilianTraffic.ships){delete t.retaliationTargetId;delete t.retaliationUntil;}
              nativeNpcLives.invalidateMembership(s);nativeShipSystems.invalidate(s);nativeTargetingActions.clear();__controls.rebind();__controls.frames(.15);
            }""")
            assert page.evaluate('nativeTargetingActions.snapshot().published')=='civilian:99201'
            page.evaluate("()=>{const s=__controls.state,t=s.civilianTraffic.ships[1];t.retaliationTargetId='player';t.retaliationUntil=nativeSimulation.seconds(s)+60;nativeShipSystems.refreshShip(s,t,'civilian');}")
            page.keyboard.press('Shift');assert page.evaluate('nativeCivilianTraffic.target(__controls.state)?.id')==99202
            result['refinedIntent']={'stableNearTies':True,'visiblePreviewHonoured':True,'cyclingAloneDoesNotTeach':True,'confirmedCorrection':correction,'correctionNotSaved':True,'newAttackOverridesPreview':True}
            assert not errors, errors
            (OUTPUT / 'results.json').write_text(json.dumps(result, indent=2))
            print(json.dumps(result, indent=2))
        browser.close()
finally:
    server.shutdown()
