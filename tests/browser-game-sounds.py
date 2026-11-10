"""Real audio output, semantic UI, accepted shots, ore pickup and persistent mute."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'game-sounds'
OUTPUT.mkdir(parents=True, exist_ok=True)
EXPECTED_CLIPS = len(json.loads((ROOT / 'html-games/broken-mirror-port/assets/game-sounds/manifest.json').read_text())['clips'])


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


AUDIO_PROBE = r"""(() => {
  const original=AudioContext.prototype.createDynamicsCompressor;
  window.__soundProbes=[];
  const createSource=AudioContext.prototype.createBufferSource;
  window.__soundSources=[];
  AudioContext.prototype.createBufferSource=function(...args){
    const source=createSource.apply(this,args),start=source.start.bind(source),context=this;
    source.start=(at,offset,duration)=>{
      const record={at,offset,duration,bufferDuration:source.buffer.duration,endedAt:null};
      __soundSources.push(record);source.addEventListener('ended',()=>record.endedAt=context.currentTime,{once:true});
      return start(at,offset,duration);
    };
    return source;
  };
  AudioContext.prototype.createDynamicsCompressor=function(...args){
    const compressor=original.apply(this,args),connect=compressor.connect.bind(compressor),context=this;
    compressor.connect=(target,...rest)=>{
      if(target!==context.destination)return connect(target,...rest);
      const analyser=context.createAnalyser();analyser.fftSize=1024;
      __soundProbes.push({analyser,peak:0});connect(analyser);return analyser.connect(target);
    };
    return compressor;
  };
  setInterval(()=>{for(const probe of __soundProbes){const data=new Float32Array(1024);probe.analyser.getFloatTimeDomainData(data);for(const value of data)probe.peak=Math.max(probe.peak,Math.abs(value));}},8);
})();"""

server = None
base = os.environ.get('GAME_BASE_URL')
if not base:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
url = base.rstrip('/') + '/html-games/broken-mirror-port/index.html'
errors, failed, report = [], [], {}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel=os.environ.get('BROWSER_CHANNEL', 'msedge'))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.add_init_script(AUDIO_PROBE)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
        page.goto(url)
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        assert page.evaluate('nativeGameSounds.snapshot().state') == 'locked'
        page.locator('#menu-sound-toggle').click();page.locator('#menu-sound-toggle').click()
        page.wait_for_function('(expected)=>nativeGameSounds.snapshot().decoded.length===expected', arg=EXPECTED_CLIPS, timeout=30000)
        assert not page.evaluate('nativeGameSounds.snapshot().failed')
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState()&&nativeCivilianTraffic.effectsReady()&&nativeSolAsteroids.placements.length', timeout=120000)
        page.evaluate('window.__soundState=nativeNpcDev.getState()')

        def cue(kind, action):
            before = page.evaluate('(kind)=>nativeGameSounds.snapshot().played[kind]||0', kind)
            page.wait_for_timeout(90)
            action()
            try:
                page.wait_for_function('([kind,before])=>(nativeGameSounds.snapshot().played[kind]||0)>before', arg=[kind, before], timeout=5000)
            except Exception:
                page.screenshot(path=str(OUTPUT / 'failed-cue.png'))
                print(json.dumps(page.evaluate("""()=>({sounds:nativeGameSounds.snapshot(),connection:document.querySelector('#connection').textContent,blocked:nativeSimulation.blocked(),pause:nativePause.active,inventory:nativeShipInventory.active,rock:window.__soundRock,state:window.__soundState&&{x:__soundState.x,y:__soundState.y,world:vexedSolFlight.shipPosition(__soundState),mined:__soundState.minedAsteroids,ore:__soundState.asteroidOreDrops,minerals:__soundState.minerals}})""")), flush=True)
                raise

        cue('navigation', lambda: page.locator('#mapBtn').click())
        page.keyboard.press('Escape')
        cue('inventory', lambda: page.locator('#inventoryBtn').click())
        page.locator('.inventory-close').click()
        cue('trade', lambda: page.locator('#tradeBtn').click())
        page.evaluate('nativeSystemHub.close(false)')
        page.wait_for_timeout(100)
        page.evaluate("""()=>{
          nativePlanetEncounter.open({getState:()=>__soundState,price:()=>10});
        }""")
        assert page.evaluate('nativeGameSounds.snapshot().played.comms') >= 1
        page.evaluate('nativePlanetEncounter.close(false)')
        report['ui'] = page.evaluate('nativeGameSounds.snapshot().played')
        assert report['ui']['navigation'] == 1 and report['ui']['inventory'] == 1 and report['ui']['trade'] == 1, report['ui']

        # A small stationary scene uses the real firing, damage and collection owners.
        page.evaluate("""()=>{
          const state=__soundState,template=JSON.parse(JSON.stringify(state.civilianTraffic.ships[0]));
          nativeCivilianTraffic.advance=()=>{};nativeSolEconomy.advance=()=>{};
          nativePause.close();nativeShipInventory.close();nativeCombatShots.reset();nativeAsteroidCombat.clear();
          for(const key of ['shipEquipment','weaponLoadout','localCruise','arrivalApproach','motionKick','motionSpin','localLeg'])delete state[key];
          Object.assign(state,{devMode:false,system:1,localBody:3,shipType:47,x:100000,y:100000,angle:0,speed:0,hull:10000,shields:10000,landed:false,phase:'cruise',weapons:[1],weaponInventory:[]});
          state.solEconomy.freighters=[];
          const origin=vexedSolFlight.shipPosition(state);
          window.__soundTarget={...template,id:98501,name:'Audio target',shipType:47,system:1,x:origin.x+220,y:origin.y,heading:0,speed:0,hull:10000,shields:10000,phase:'cruise',scriptedDemo:'sounds'};
          for(const key of ['localLeg','journey','motionKick','motionSpin','combatAI','task','berth'])delete __soundTarget[key];
          state.civilianTraffic.ships=[__soundTarget];state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];
          nativeShipMotion.stop(state);nativeShipMotion.stop(__soundTarget);nativeShipSystems.invalidate(state);
          window.__soundFire=(id,distance=220)=>{
            nativeCombatShots.reset();delete state.shipEquipment;delete state.weaponLoadout;
            state.weapons=[id];state.weaponInventory=[];nativeWeaponLoadout.ensure(state);
            const origin=vexedSolFlight.shipPosition(state);__soundTarget.x=origin.x+distance;__soundTarget.y=origin.y;
            nativeShipSystems.invalidate(state);
            const result=nativeCombatShots.fire({state,getTarget:()=>nativeShipDefinitions.describe(state,__soundTarget,{category:'civilian'})});
            return {ok:result.ok,error:result.error,kind:result.kind};
          };
        }""")
        for weapon, kind in [(1, 'phaser'), (2, 'laser'), (6, 'disruptor'), (9, 'pulse'), (15, 'torpedo'), (16, 'quantum')]:
            result = []
            cue(kind, lambda weapon=weapon: result.append(page.evaluate('__soundFire', weapon)))
            assert result[0]['ok'], result
            if weapon == 1:
                page.wait_for_function('()=>nativeGameSounds.snapshot().played.shield>0', timeout=5000)
        cue('hull', lambda: page.evaluate("""()=>{
          __soundState.shields=0;
          const descriptor=nativeShipDefinitions.describe(__soundState,__soundState,{category:'player'});
          return nativeShipDamage.apply(descriptor,1,{kind:'torpedo',from:{x:descriptor.x+150,y:descriptor.y}});
        }"""))
        before = page.evaluate('JSON.stringify(nativeGameSounds.snapshot().played)')
        result = page.evaluate('__soundFire(1,100000)')
        assert not result['ok'], result
        assert page.evaluate('JSON.stringify(nativeGameSounds.snapshot().played)') == before
        report['weapons'] = page.evaluate('nativeGameSounds.snapshot().played')

        # These calls enter the same damage/destruction owners used by live shots.
        for kind, large in [('shipExplosionAlt', False), ('shipExplosion', True)]:
            cue(kind, lambda large=large: page.evaluate("""large=>{
              const state=__soundState,target=__soundTarget,origin=vexedSolFlight.shipPosition(state);
              Object.assign(target,{x:origin.x+220,y:origin.y,shields:0,hull:10,phase:'cruise'});
              const descriptor=nativeShipDefinitions.describe(state,target,{category:'civilian'});
              descriptor.dimensions=large?{width:110,height:160}:{width:30,height:60};
              return nativeShipDamage.apply(descriptor,10,{kind:'torpedo',from:origin});
            }""", large))

        # Real simultaneous ship kills must each keep their explosion cue.
        ships = page.evaluate("""()=>{
          const state=__soundState;nativeCombatShots.reset();nativeShipEffects.reset();nativeEnvironmentalImpacts.reset();nativeGameSounds.stop();
          state.shipType=7;state.weapons=[1,1,1];state.weaponInventory=[];
          delete state.shipEquipment;delete state.weaponLoadout;nativeWeaponLoadout.ensure(state);nativeShipMotion.stop(state);
          const origin=vexedSolFlight.shipPosition(state);
          window.__explodingShips=[-.8,.8,2.2].map((angle,i)=>{
            const ship=JSON.parse(JSON.stringify(__soundTarget));
            for(const key of ['journey','localLeg','lifeLeg','motionKick','motionSpin','combatAI','task','berth','disputeId','retaliationId'])delete ship[key];
            Object.assign(ship,{id:98511+i,system:1,x:origin.x+Math.cos(angle)*240,y:origin.y+Math.sin(angle)*240,heading:0,speed:0,hull:.5,shields:0,phase:'cruise'});
            nativeShipMotion.stop(ship);return ship;
          });
          state.civilianTraffic.ships=__explodingShips;state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];state.solEconomy.freighters=[];
          nativeShipSystems.invalidate(state);window.__shipExplosionSourceStart=__soundSources.length;window.__shipKillEvents=[];
          return __explodingShips.map(ship=>{
            const result=nativeCombatShots.fire({state,getTarget:()=>nativeShipDefinitions.describe(state,ship,{category:'civilian'})});
            if(result.event)__shipKillEvents.push(result.event);return {ok:result.ok,error:result.error};
          });
        }""")
        assert len(ships) == 3 and all(shot['ok'] for shot in ships), ships
        page.wait_for_function("""()=>__explodingShips.every(ship=>ship.hull<=0)&&__shipKillEvents.every(event=>
          nativeGameSounds.snapshot().recent.some(sound=>sound.group==='explosion'&&sound.eventId===event.id&&sound.phase==='destruction'))""", timeout=5000)
        report['shipVolley'] = page.evaluate("""()=>{
          const ids=__explodingShips.map(ship=>ship.id);
          return {shots:__shipKillEvents.map(event=>({id:event.id,resolvedAt:event.resolvedAt})),
            sounds:nativeGameSounds.snapshot().recent.filter(sound=>sound.group==='explosion'&&ids.includes(sound.shipId))};
        }""")
        assert len(report['shipVolley']['sounds']) == 3, report['shipVolley']
        for sound in report['shipVolley']['sounds']:
            event = next(event for event in report['shipVolley']['shots'] if event['id'] == sound['eventId'])
            assert sound['bus'] == 'foregroundExplosion' and sound['priority'] == 4 and sound['volume'] >= .3, sound
            assert abs(sound['simulationAt'] - event['resolvedAt']) < .000001, sound
        page.wait_for_timeout(2200)
        report['shipVolley']['playback'] = page.evaluate("""()=>__soundSources.slice(__shipExplosionSourceStart).filter(source=>source.bufferDuration>1.8&&source.bufferDuration<2.1)""")
        assert len(report['shipVolley']['playback']) == 3, report['shipVolley']
        for voice in report['shipVolley']['playback']:
            assert voice['endedAt'] is not None and abs(voice['endedAt'] - voice['at'] - voice['duration']) < .12, voice
        page.evaluate("""()=>{
          const state=__soundState;nativeCombatShots.reset();nativeShipEffects.reset();nativeEnvironmentalImpacts.reset();
          state.shipType=47;state.weapons=[1];state.weaponInventory=[];
          delete state.shipEquipment;delete state.weaponLoadout;nativeWeaponLoadout.ensure(state);nativeShipMotion.stop(state);
          nativeShipSystems.invalidate(state);
        }""")

        page.evaluate("""()=>{
          const state=__soundState,origin=vexedSolFlight.shipPosition(state);
          nativeCombatShots.reset();nativeAsteroidCombat.clear();state.civilianTraffic.ships=[];state.solEconomy.freighters=[];
          state.minedAsteroids=[];state.destroyedAsteroids=[];state.asteroidDamage={};
          window.__impactRocks=nativeSolAsteroids.placements.slice(0,4);
          __impactRocks.forEach((rock,index)=>{
            nativeSolAsteroids.relocate(rock,{x:origin.x+120+index*60,y:origin.y+160,angle:0});
            nativeAsteroidMotion.freeze(state,rock);
          });
          nativeShipSystems.invalidate(state);
        }""")
        cue('asteroidHit', lambda: page.evaluate("""()=>nativeAsteroidCombat.hit(__soundState,__impactRocks[0].slotId,1,{kind:'debris',system:1})"""))
        for index, kind in [(1, 'asteroidExplosion'), (2, 'asteroidExplosionAlt')]:
            cue(kind, lambda index=index: page.evaluate("""index=>nativeAsteroidCombat.weaponHit(__soundState,__impactRocks[index].slotId,1,{kind:'beam',system:1})""", index))

        # The actual shared collision solver produces the ship/asteroid thunk.
        # Own the flight RAF while arranging this single contact, so the live
        # scene cannot move its pieces between the fixture setup and its sweep.
        page.evaluate("""()=>{
          window.__impactRAF=requestAnimationFrame;
          window.requestAnimationFrame=callback=>{
            if(callback.name==='draw'){window.__impactDraw=callback;return 0;}
            return __impactRAF(callback);
          };
        }""")
        page.wait_for_function("()=>typeof __impactDraw==='function'", polling=50, timeout=10000)
        cue('shipAsteroidHit', lambda: page.evaluate("""()=>{
          const state=__soundState,rock=__impactRocks[3];
          window.__collisionHealth={before:{hull:state.hull,shields:state.shields}};
          nativeEnvironmentalImpacts.reset();nativeShipMotion.stop(state);
          nativeSimulation.advance(state,.25);nativeAsteroidMotion.advance(state,.25);
          Object.assign(state,{dimensions:{width:30,height:60},previousX:state.x-40,previousY:state.y,angle:0,speed:80,vx:80,vy:0});
          const origin=vexedSolFlight.shipPosition(state),descriptor=nativeShipDefinitions.describe(state,state,{category:'player'});
          rock.size=40;rock.maxHull=100;
          const distance=descriptor.hullRadii.ry+rock.size*.43-.5;
          nativeSolAsteroids.relocate(rock,{x:origin.x+distance,y:origin.y,angle:0});nativeAsteroidMotion.freeze(state,rock);
          nativeShipSystems.invalidate(state);nativeAsteroidMotion.collide(state,.25);
          __collisionHealth.after={hull:state.hull,shields:state.shields};
        }"""))
        collision_health = page.evaluate('__collisionHealth')
        assert collision_health['after'] == collision_health['before'], collision_health
        page.evaluate('nativeShipMotion.stop(__soundState);window.requestAnimationFrame=__impactRAF;__impactRAF(__impactDraw)')
        report['downloadedImpacts'] = page.evaluate("""()=>Object.fromEntries(['shipExplosion','shipExplosionAlt','asteroidExplosion','asteroidExplosionAlt','asteroidHit','shipAsteroidHit'].map(kind=>[kind,nativeGameSounds.snapshot().played[kind]||0]))""")
        assert all(count > 0 for count in report['downloadedImpacts'].values()), report['downloadedImpacts']

        # A real three-weapon volley destroys three rocks in one simulation step.
        # Their two alternating recordings must not share a cooldown or lose tails.
        volley = page.evaluate("""()=>{
          const state=__soundState;nativeCombatShots.reset();nativeAsteroidCombat.clear();nativeEnvironmentalImpacts.reset();nativeGameSounds.stop();
          Object.assign(state,{shipType:7,angle:0,speed:0,vx:0,vy:0,phase:'cruise',weapons:[1,1,1],weaponInventory:[]});
          delete state.shipEquipment;delete state.weaponLoadout;nativeWeaponLoadout.ensure(state);nativeShipMotion.stop(state);
          const origin=vexedSolFlight.shipPosition(state);
          for(const [i,rock] of __impactRocks.entries()){
            nativeSolAsteroids.relocate(rock,{x:origin.x+5000+i*200,y:origin.y+5000,angle:0});nativeAsteroidMotion.freeze(state,rock);
          }
          window.__explosionRocks=nativeSolAsteroids.placements.slice(4,7);
          __explosionRocks.forEach((rock,i)=>{
            const angle=[-.8,.8,2.2][i];rock.size=35;rock.maxHull=100;
            nativeSolAsteroids.relocate(rock,{x:origin.x+Math.cos(angle)*240,y:origin.y+Math.sin(angle)*240,angle:0});
            nativeAsteroidMotion.freeze(state,rock);
          });
          nativeShipSystems.invalidate(state);window.__explosionSourceStart=__soundSources.length;window.__explosionEvents=[];
          const shots=__explosionRocks.map(rock=>{
            nativeAsteroidCombat.select(rock);const result=nativeAsteroidCombat.fire(state,origin,40,60);
            if(result.event)__explosionEvents.push(result.event);
            return {ok:result.ok,error:result.error,eventId:result.event?.id,rockId:rock.slotId};
          });
          return shots;
        }""")
        assert len(volley) == 3 and all(shot['ok'] for shot in volley), volley
        page.wait_for_function("""()=>__explosionRocks.every(rock=>__soundState.destroyedAsteroids.includes(rock.slotId))&&
          __explosionEvents.every(event=>nativeGameSounds.snapshot().recent.some(sound=>sound.phase==='destruction'&&sound.eventId===event.id))""", timeout=5000)
        report['asteroidVolley'] = page.evaluate("""()=>{
          const snapshot=nativeGameSounds.snapshot(),ids=__explosionRocks.map(rock=>rock.slotId);
          return {shots:__explosionEvents.map(event=>({id:event.id,resolvedAt:event.resolvedAt})),
            sounds:snapshot.recent.filter(sound=>sound.phase==='destruction'&&ids.includes(sound.rockId)),bursts:nativeAsteroidCombat.metrics().bursts};
        }""")
        assert len(report['asteroidVolley']['sounds']) == 3 and report['asteroidVolley']['bursts'] >= 3, report['asteroidVolley']
        for sound in report['asteroidVolley']['sounds']:
            event = next(event for event in report['asteroidVolley']['shots'] if event['id'] == sound['eventId'])
            assert sound['bus'] == 'foregroundExplosion' and sound['priority'] == 4 and sound['volume'] >= .3, sound
            assert abs(sound['simulationAt'] - event['resolvedAt']) < .000001, sound
        page.wait_for_timeout(4350)
        report['asteroidVolley']['playback'] = page.evaluate("""()=>__soundSources.slice(__explosionSourceStart).filter(source=>source.bufferDuration>3.7&&source.bufferDuration<4.2)""")
        assert len(report['asteroidVolley']['playback']) == 3, report['asteroidVolley']
        for voice in report['asteroidVolley']['playback']:
            assert voice['endedAt'] is not None and abs(voice['endedAt'] - voice['at'] - voice['duration']) < .12, voice

        # One actual click transports a four-chunk field, rather than four sounds.
        point = page.evaluate("""()=>{
          const state=__soundState;nativeCombatShots.reset();nativeAsteroidCombat.clear();
          // Restore the cargo hull after the small combat hull used by the volley.
          state.shipType=47;state.weapons=[1];state.weaponInventory=[];
          delete state.shipEquipment;delete state.weaponLoadout;nativeWeaponLoadout.ensure(state);
          state.civilianTraffic.ships=[];state.solEconomy.freighters=[];
          const rock=nativeSolAsteroids.placements.find(r=>r.size<200&&r.oreType!=='dilithium');
          window.__soundRock=rock;
          const origin=vexedSolFlight.shipPosition(state);state.x+=rock.x-origin.x-200;state.y+=rock.y-origin.y;
          state.minedAsteroids=[rock.slotId];state.destroyedAsteroids=[];state.asteroidOreDrops={[rock.slotId]:15};state.minerals={};
          state.stocks={};state.localContracts=[];state.freightCargo={};state.food=0;state.deuranium=0;state.antimatter=0;
          nativeShipMotion.stop(state);nativeShipSystems.invalidate(state);
          return {id:rock.slotId,type:rock.oreType};
        }""")
        page.wait_for_timeout(200)

        def collect():
            coordinates = page.evaluate("""()=>{
              const canvas=document.querySelector('#space'),rect=canvas.getBoundingClientRect(),view=nativeView.measure(canvas),ship=vexedSolFlight.shipPosition(__soundState);
              return {x:rect.left+(view.w/2+__soundRock.x-ship.x)*rect.width/view.w,y:rect.top+(view.h/2+__soundRock.y-ship.y)*rect.height/view.h};
            }""")
            page.mouse.click(**coordinates)

        page.evaluate('__soundState.deuranium=1000000')
        collect()
        assert page.evaluate('__soundState.asteroidOreDrops[__soundRock.slotId]') == 15
        assert page.evaluate('nativeGameSounds.snapshot().played.transport||0') == 0
        page.evaluate('__soundState.deuranium=0')
        source_index = page.evaluate('__soundSources.length')
        cue('transport', collect)
        transport = page.evaluate('(index)=>__soundSources.slice(index).find(source=>source.bufferDuration>3.8&&source.bufferDuration<4.1)', source_index)
        assert transport and abs(transport['duration'] - transport['bufferDuration']) < .001, transport
        assert transport['offset'] == 0, transport
        collection = page.evaluate("""()=>({mask:__soundState.asteroidOreDrops[__soundRock.slotId],tons:__soundState.minerals[__soundRock.oreType],sounds:nativeGameSounds.snapshot().played.transport})""")
        assert collection['mask'] == 0 and collection['tons'] == 4, collection
        assert collection['sounds'] == 1, collection
        page.wait_for_timeout(500)
        collect()
        assert page.evaluate('nativeGameSounds.snapshot().played.transport') == 1
        report['collection'] = collection
        page.wait_for_function('(index)=>__soundSources.slice(index).some(source=>source.bufferDuration>3.8&&source.bufferDuration<4.1&&source.endedAt!==null)', arg=source_index, timeout=8000)
        transport = page.evaluate('(index)=>__soundSources.slice(index).find(source=>source.bufferDuration>3.8&&source.bufferDuration<4.1)', source_index)
        assert transport['endedAt'] - transport['at'] >= transport['bufferDuration'] - .1, transport
        report['fullTransporterPlayback'] = transport
        page.wait_for_function('()=>__soundProbes.some(probe=>probe.peak>.01)', timeout=5000)
        report['renderedAudioPeaks'] = page.evaluate('__soundProbes.map(probe=>probe.peak)')
        assert max(report['renderedAudioPeaks']) <= 1

        page.keyboard.press('Escape')
        page.locator('#pause-menu [data-options]').click()
        page.locator('#pause-sound-toggle').click()
        assert page.evaluate('nativeGameSounds.snapshot().active') == 0
        assert not page.evaluate('nativeMenuSounds.enabled')
        page.screenshot(path=str(OUTPUT / 'sound-options-desktop.png'))
        page.set_viewport_size({'width': 390, 'height': 844})
        button = page.locator('#pause-sound-toggle').bounding_box()
        assert button and button['x'] >= 0 and button['y'] >= 0 and button['y'] + button['height'] <= 844, button
        page.screenshot(path=str(OUTPUT / 'sound-options-mobile.png'))
        page.evaluate('nativePause.close()')
        before = page.evaluate('JSON.stringify(nativeGameSounds.snapshot().played)')
        result = page.evaluate('__soundFire(1)')
        assert result['ok'], result
        page.wait_for_timeout(250)
        assert page.evaluate('JSON.stringify(nativeGameSounds.snapshot().played)') == before
        page.reload()
        page.wait_for_function('()=>window.nativeGameSounds&&document.querySelector("#startup").hidden', timeout=120000)
        assert not page.evaluate('nativeGameSounds.snapshot().enabled')
        assert page.locator('#menu-sound-toggle').inner_text() == 'Sound off'
        report.update(baseURL=base, fullCargoStaysSilent=True, muteStopsActive=True, mutePersists=True, allClipsDecoded=EXPECTED_CLIPS, failedResponses=failed, pageErrors=errors)
        assert not errors, errors
        assert not failed, failed
        (OUTPUT / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
        browser.close()
finally:
    if server:
        server.shutdown()
