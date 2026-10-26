"""Real active-entry regressions for shared-shot awareness and civilian survival."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'civilian-tactics'
OUTPUT.mkdir(parents=True, exist_ok=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.add_init_script("""(()=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>{if(callback.name==='draw')window.__tacticsDraw=callback;return raf(timestamp=>{if(callback.name==='draw'){if(window.__freezeTactics)return;window.__tacticsFrameTime=timestamp;}return callback(timestamp);});};})()""")
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate("""() => {
          const advance=nativeCivilianTraffic.advance;
          nativeCivilianTraffic.advance=(state,dt)=>{window.__tacticsState=state;return advance(state,dt);};
          startNativeDevGame();
        }""")
        page.wait_for_function('() => window.__tacticsState && nativeCivilianTraffic.effectsReady()', timeout=120000)
        page.evaluate('()=>{window.__freezeTactics=true;window.requestAnimationFrame=()=>0;window.__tacticsBase=JSON.parse(JSON.stringify(nativeNpcDev.getState()));}')
        page.wait_for_timeout(100)
        reproduction = page.evaluate("""() => {
          const state=__tacticsState,ship=state.civilianTraffic.ships.find(s=>s.shipType===47),target=state.civilianTraffic.ships.find(s=>s!==ship);
          nativeCombatShots.reset();state.system=ship.system=target.system=1;state.landed=false;
          Object.assign(ship,{x:100000,y:100000,heading:Math.PI,vx:0,vy:0,hull:100,shields:100});
          Object.assign(target,{x:100300,y:100000,heading:Math.PI,vx:0,vy:0,hull:100,shields:100});
          const model=VexedMirrorWeapons.find(w=>w.damage>0&&nativeCombatShots.weaponVisual(w).kind==='disruptor');
          delete target.shipEquipment;delete target.weaponLoadout;target.weapons=[model.id];
          const fired=nativeCombatShots.fireFor({state,shooter:nativeShipDefinitions.describe(state,target,{category:'civilian'}),target:nativeShipDefinitions.describe(state,ship,{category:'civilian'})});
          if(!fired.ok)throw Error(fired.error);
          Object.assign(fired.event,{x:ship.x+90,y:ship.y,vx:-340,vy:0,age:.2});
          const clock=nativeSimulation.seconds(state)+5,dispute={a:ship.id,b:target.id,anchor:{x:ship.x,y:ship.y},pending:[]};
          const scene={state,clock,hull:100,shields:100};
          nativeCivilianCombatAI.begin(ship,'defender',clock-5);nativeCivilianCombatAI.decide(ship,target,dispute,scene);
          const sharedOnly=ship.combatAI.mode;
          nativeCivilianCombatAI.begin(ship,'defender',clock-5);dispute.pending=[fired.event];nativeCivilianCombatAI.decide(ship,target,dispute,scene);
          const copiedToObsolete=ship.combatAI.mode;
          dispute.pending=[];nativeCivilianCombatAI.begin(ship,'defender',0);
          const sides=[];for(const at of [0,2.6,6.2,9.8,13.4]){nativeCivilianCombatAI.decide(ship,target,dispute,{...scene,clock:at});sides.push({at,side:ship.combatAI.side,mode:ship.combatAI.mode});}
          return {sharedOnly,copiedToObsolete,sides,shot:{id:fired.event.id,owner:'weaponCombat.events'}};
        }""")
        if '--reproduce' in sys.argv:
            (OUTPUT / 'before.json').write_text(json.dumps(reproduction, indent=2), encoding='utf-8')
            print(json.dumps(reproduction, indent=2))
        else:
            helper_source = """() => {
              const copy=value=>JSON.parse(JSON.stringify(value)),check=(value,message)=>{if(!value)throw Error(message);};
              const h=window.__tactics={copy,check,report:{},base:__tacticsBase};
              h.state=()=>nativeNpcDev.getState();h.ship=()=>h.state().civilianTraffic.ships[0];
              h.tick=(seconds)=>{for(let left=seconds;left>1e-8;){const dt=Math.min(1/60,left),s=h.state(),elapsed=nativeSimulation.advance(s,dt);check(elapsed>0,'Unexpected pause');nativeCivilianTraffic.advance(s,elapsed);nativeCombatShots.advance(s,elapsed);nativeShipEffects.advance(s,elapsed);nativeAsteroidCombat.advance(s,elapsed);left-=dt;}};
              h.fixture=(policy='civilian')=>{
                nativeCombatShots.reset();nativeShipEffects.reset();const s=copy(h.base),ship=copy(s.civilianTraffic.ships.find(e=>e.shipType===47));
                const type={civilian:47,cargo:56,medical:58}[policy],definition=nativeShipDefinitions.get(type,'civilian');
                delete s.weaponCombat;delete s.shipRepairs;delete s.civilianTraffic.life;s.civilianTraffic.ships=[ship];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.civilianTraffic.strayShots=[];s.civilianTraffic.clock=0;s.civilianTraffic.timingVersion=1;s.civilianTraffic.nextAwarenessAt=0;s.civilianTraffic.awarenessCursor=0;s.solEconomy.freighters=[];
                s.shipSimulation.seconds=0;Object.assign(s,{system:1,localBody:3,x:100000,y:100000,angle:0,speed:0,landed:false,hull:100000,shields:100000});nativeShipMotion.stop(s);
                for(const key of ['dockingMove','repairBay','shipEquipment','weaponLoadout','localLeg','task','journey','lastJourney','lifeVersion','combatAI','combatInterruption','combatReturn','disputeId','retaliationId','projectileEvade','projectileWatch','nextActionAt','needsDockRecovery','motionKick','motionSpin'])delete ship[key];
                Object.assign(ship,{shipType:type,system:1,stationSystem:1,homeSystem:1,operatingBase:1,port:3,x:100000,y:100000,heading:0,vx:0,vy:0,speed:0,hull:definition.hull,shields:definition.shields,phase:'docked',cargo:null,oreHold:0,repairDeuranium:policy==='medical'?100:0,credits:10000,timer:10000,deliveries:0,lifeScheduleToken:1,taskSequence:0});
                check(nativeSaveStorage.write(s).ok,'Fixture write failed');resumeNativeGame();nativeNpcLives.initialize(h.state()).config.economyEnabled=false;
                return h.ship();
              };
              h.caption=text=>{let label=document.querySelector('#tactics-caption');if(!label){label=document.createElement('div');label.id='tactics-caption';label.style.cssText='position:fixed;left:24px;top:70px;z-index:9999;padding:10px 14px;color:#e1f7ff;background:#07131ee8;border:1px solid #558397;font:16px sans-serif;max-width:600px';document.body.append(label);}label.textContent=text;};
              h.draw=()=>{const effects=nativeShipEffects,painted=[];window.nativeShipEffects={...effects,paintShip(ctx,descriptor,view){const art=effects.paintShip(ctx,descriptor,view);if(descriptor.category==='civilian')painted.push({id:descriptor.id,x:descriptor.x,y:descriptor.y,screenX:view.x,screenY:view.y,art:!!art});return art;}};window.__tacticsDraw(window.__tacticsFrameTime);window.nativeShipEffects=effects;h.lastPaint=painted;};
              h.putPlayer=(x,y)=>{const s=h.state(),body=nativeSystemHub.sol.find(b=>b.id===s.localBody);s.x=x-body.x;s.y=y-body.y;nativeShipMotion.stop(s);};
              h.fit=(ship,kind)=>{const model=VexedMirrorWeapons.find(w=>w.damage>0&&nativeCombatShots.weaponVisual(w).kind===kind);delete ship.shipEquipment;delete ship.weaponLoadout;ship.weapons=[model.id];nativeWeaponLoadout.ensure(h.state(),ship,[model.id]);return model;};
            }"""
            page.evaluate(helper_source)
            page.evaluate("Promise.all([47,56,58].map(type=>nativeShipEffects.prepare(type,'civilian')))")
            page.wait_for_function("()=>[47,56,58].every(type=>nativeShipEffects.ready(type,'civilian'))", timeout=120000)
            detection = page.evaluate("""() => {
              const h=__tactics,ship=h.fixture(),s=h.state(),shooter=h.copy(ship);Object.assign(shooter,{id:99002,name:'Projectile source',x:ship.x+400,heading:Math.PI});h.fit(shooter,'disruptor');
              s.civilianTraffic.ships.push(shooter);nativeNpcLives.initialize(s);ship.nextActionAt=shooter.nextActionAt=10000;
              h.putPlayer(ship.x-150,ship.y+300);
              h.fit(ship,'beam');const fired=nativeCombatShots.fireFor({state:s,shooter:nativeShipDefinitions.describe(s,shooter,{category:'civilian'}),target:nativeShipDefinitions.describe(s,ship,{category:'civilian'})});h.check(fired.ok,fired.error);
              // The launch was physical; its original lock is subsequently lost.
              fired.event.targetId='departed-target';h.tick(.14);h.check(!ship.projectileEvade,'Crew reacted before the minimum launch-age delay');
              h.tick(.41);h.check(ship.projectileEvade&&ship.combatAI.mode==='dodge','Ordinary working civilian did not dodge the shared live projectile '+JSON.stringify({clock:nativeSimulation.seconds(s),watch:ship.projectileWatch,ai:ship.combatAI,phase:ship.phase,event:fired.event,pose:{x:ship.x,y:ship.y},next:s.civilianTraffic.nextAwarenessAt}));
              h.check(ship.combatAI.threatId===fired.event.id,'Dodge did not identify the live shot');h.check(!s.civilianTraffic.retaliations.length,'Stray avoidance invented a retaliation');
              h.report.incoming={mode:ship.combatAI.mode,reason:ship.combatAI.decisionReason,shot:fired.event.id,moved:Math.hypot(ship.x-100000,ship.y-100000),owner:'weaponCombat.events'};
              nativeCivilianTraffic.select(ship.id);h.putPlayer(ship.x-180,ship.y+60);h.caption('Civilian crew dodges an incoming live projectile after a reaction delay.');h.draw();return h.report.incoming;
            }""")
            page.screenshot(path=str(OUTPUT / 'incoming-projectile-dodge.png'))
            decisions = page.evaluate("""() => {
              const h=__tactics,ship=h.fixture(),s=h.state(),target={id:'player',x:ship.x+300,y:ship.y,heading:0,hull:100000,shields:100000};h.fit(ship,'beam');nativeCivilianCombatAI.begin(ship,'defender',0);
              const sides=[],modes=[];for(let clock=0;clock<40;clock+=.1){nativeCivilianCombatAI.decide(ship,target,{b:'player'},{state:s,clock,hull:ship.hull,shields:ship.shields});sides.push(ship.combatAI.side);modes.push(ship.combatAI.mode);}
              h.check(new Set(sides).size===1,'Healthy defender still reverses on a timer');
              const distances={};for(const kind of ['disruptor','beam','torpedo']){h.fit(ship,kind);nativeCivilianCombatAI.decide(ship,target,{b:'player'},{state:s,clock:41,hull:ship.hull,shields:ship.shields});distances[kind]=ship.combatAI.desiredRange;}
              h.check(distances.disruptor<distances.beam&&distances.beam<distances.torpedo,'Tactics ignore installed weapon reach');return {seconds:40,sideChanges:new Set(sides).size-1,distances};
            }""")
            pursuit = page.evaluate("""() => {
              const h=__tactics,ship=h.fixture(),s=h.state(),start={x:ship.x,y:ship.y};ship.shipType=s.shipType=52;h.fit(ship,'beam');
              // Equal hulls and shared powered motion keep a pursuer nearby;
              // neither controller receives a speed or steering advantage.
              const hardware=nativeShipDefinitions.forEntity(s,ship,{category:'civilian'});
              s.shipEquipment=h.copy(ship.shipEquipment);s.mineralUpgrades=h.copy(ship.mineralUpgrades||{});
              s.hull=hardware.hull;s.shields=hardware.shields;ship.hull=hardware.hull*.35;ship.shields=hardware.shields;
              s.angle=ship.heading=0;h.putPlayer(ship.x-300,ship.y);nativeShipMotion.stop(ship);
              nativeCivilianTraffic.hit(s,ship.id,1,{source:'player',sourceId:'player',from:vexedSolFlight.shipPosition(s)});
              let originalGoal=null,minimumForward=1;
              for(let i=0;i<1800;i++){
                const dt=nativeSimulation.advance(s,1/60),definition=nativeShipDefinitions.forEntity(s,s,{category:'player'});
                nativeShipSystems.move(s,s,'player',{heading:0,throttle:1},definition.movement,dt);
                nativeCivilianTraffic.advance(s,dt);nativeCombatShots.advance(s,dt);nativeShipEffects.advance(s,dt);
                if(!originalGoal&&ship.combatAI.escapeGoal)originalGoal=h.copy(ship.combatAI.escapeGoal);
                minimumForward=Math.min(minimumForward,Math.cos(ship.heading));
                h.check(ship.combatAI.disengaging&&!ship.combatAI.escaped,'Civilian abandoned committed escape under pursuit');
                h.check(Math.cos(ship.heading)>.5,'Civilian turned back at its old escape waypoint '+JSON.stringify({i,heading:ship.heading,mode:ship.combatAI.mode,ai:ship.combatAI,ship:{x:ship.x,y:ship.y,vx:ship.vx,vy:ship.vy},player:vexedSolFlight.shipPosition(s)}));
              }
              const player=vexedSolFlight.shipPosition(s);
              h.check(originalGoal&&ship.x>originalGoal.x+1600,'Pursuit did not continue beyond the first escape waypoint');
              h.check(ship.combatAI.escapeLegs>=2,'Continued pursuit did not extend physical escape legs');
              h.check(Math.hypot(ship.x-player.x,ship.y-player.y)<650,'Equal-hardware pursuer lost contact in the fixture');
              nativeCivilianTraffic.select(ship.id);h.caption('A pursued civilian continues escaping beyond its first waypoint without turning back.');h.draw();
              return {distance:ship.x-start.x,originalGoal,currentGoal:h.copy(ship.combatAI.escapeGoal),legs:ship.combatAI.escapeLegs,minimumForward,separation:Math.hypot(ship.x-player.x,ship.y-player.y),pursuer:{hull:s.hull,shields:s.shields}};
            }""")
            page.screenshot(path=str(OUTPUT / 'continued-pursuit-escape.png'))
            survival = []
            for policy in ['cargo', 'medical']:
                midway = page.evaluate("""async policy => {
                  const h=__tactics,ship=h.fixture(policy),s=h.state();ship.x=250;ship.y=-150;h.putPlayer(550,-150);
                  const delivery=nativeNpcLives.startDelivery(s,ship.id,{fromSystem:1,fromPort:3,toSystem:1,toPort:5,good:5,tons:4});h.check(delivery.ok,'Funded local job failed '+JSON.stringify({delivery,ship:{id:ship.id,phase:ship.phase,journey:ship.journey,dockingMove:ship.dockingMove,cargo:ship.cargo,oreHold:ship.oreHold},found:nativeNpcLives.find(s,ship.id)===ship}));
                  for(let elapsed=0;elapsed<100&&!ship.cargo;elapsed+=.25)h.tick(.25);h.check(ship.cargo,'Cargo was not physically loaded');
                  h.putPlayer(ship.x+300,ship.y);const before={id:ship.task.id,cargo:h.copy(ship.cargo),escrow:h.copy(nativeNpcLives.initialize(s).reservations[ship.task.id]),supplies:ship.repairDeuranium,origin:{x:ship.x,y:ship.y},traits:h.copy(ship.crewTraits)};
                  nativeCivilianTraffic.hit(s,ship.id,1,{source:'player',sourceId:'player',from:vexedSolFlight.shipPosition(s)});h.tick(2);
                  h.check(ship.combatAI.disengaging&&ship.combatAI.mode==='disengage','Crew returned to attack instead of protecting work');
                  h.check(Math.hypot(ship.x-before.origin.x,ship.y-before.origin.y)>20,'Escape did not use physical flight');
                  h.check(ship.task.id===before.id,'Combat replaced the funded task');h.check(JSON.stringify(ship.cargo)===JSON.stringify(before.cargo),'Combat altered cargo');
                  nativePause.open();const paused=JSON.stringify(s);nativeCivilianTraffic.advance(s,.5);nativeCombatShots.advance(s,.5);h.check(JSON.stringify(s)===paused,'Pause advanced combat or jobs');nativePause.close();
                  nativeCivilianTraffic.select(ship.id);h.caption(policy==='cargo'?'Cargo crew escapes toward safety while retaining its funded delivery and cargo.':'Medical crew protects its repair supplies and disengages physically.');
                  // Briefly frame the escaping hull for the screenshot. No simulation
                  // advances during this camera/observer adjustment.
                  await nativeShipEffects.prepare(ship.shipType,'civilian');
                  const observer={x:s.x,y:s.y};h.putPlayer(ship.x+160,ship.y+40);h.draw();Object.assign(s,observer);
                  h.check(h.lastPaint.some(p=>p.id===ship.id&&p.art),'Escaping ship did not reach the native artwork renderer '+JSON.stringify(h.lastPaint));
                  h.savedBefore=before;h.check(nativeSaveStorage.write(s).ok,'Mid-combat durable save failed');return {before,mode:ship.combatAI.mode,escape:h.copy(ship.combatAI.escapeGoal),position:{x:ship.x,y:ship.y},painted:h.lastPaint,saved:JSON.stringify(s)};
                }""", policy)
                page.screenshot(path=str(OUTPUT / f'{policy}-physical-escape.png'))
                saved_helpers = page.evaluate('({base:__tactics.base,before:__tactics.savedBefore})')
                # A real page reload and Continue Dev exercises the production save boundary.
                page.reload()
                page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
                page.evaluate('()=>{window.__freezeTactics=true;}')
                page.locator('[data-menu="continue-dev"]').click()
                page.wait_for_function('()=>!!nativeNpcDev.getState()',timeout=30000)
                page.evaluate('()=>{window.requestAnimationFrame=()=>0;}')
                resumed = page.evaluate("""before => {
                  const s=nativeNpcDev.getState(),ship=s.civilianTraffic.ships[0],check=(value,message)=>{if(!value)throw Error(message);};
                  check(ship.task.id===before.id&&ship.combatAI.disengaging,'Reload lost committed escape or job');check(JSON.stringify(ship.crewTraits)===JSON.stringify(before.traits),'Reload changed crew traits');
                  check(JSON.stringify(nativeNpcLives.initialize(s).reservations[ship.task.id])===JSON.stringify(before.escrow),'Reload changed funded escrow');
                  const tick=()=>{const dt=nativeSimulation.advance(s,1/60);nativeCivilianTraffic.advance(s,dt);nativeCombatShots.advance(s,dt);nativeShipEffects.advance(s,dt);};
                  for(let i=0;i<4800&&ship.retaliationId;i++)tick();check(!ship.retaliationId,'Crew failed to physically break contact');
                  check(ship.task.id===before.id&&ship.task.status==='active'&&ship.localLeg,'Job did not resume through shared navigation');check(JSON.stringify(ship.cargo)===JSON.stringify(before.cargo),'Escape lost paid cargo');check(ship.repairDeuranium===before.supplies,'Escape changed repair supplies');
                  const player=vexedSolFlight.shipPosition(s);check(Math.hypot(ship.x-player.x,ship.y-player.y)>820,'Contact ended before physical separation');
                  return {jobId:ship.task.id,phase:ship.task.phase,cargo:ship.cargo,supplies:ship.repairDeuranium,separation:Math.hypot(ship.x-player.x,ship.y-player.y),traits:ship.crewTraits};
                }""", midway['before'])
                survival.append({'policy': policy, 'midway': {key: value for key, value in midway.items() if key != 'saved'}, 'resumed': resumed})
                page.evaluate('(value)=>{window.__tacticsBase=value.base;}', saved_helpers)
                page.evaluate(helper_source)
            repair_mid = page.evaluate("""() => {
              const h=__tactics,ship=h.fixture(),s=h.state();ship.x=250;ship.y=-150;h.putPlayer(550,-150);
              h.check(nativeNpcLives.startDelivery(s,ship.id,{fromSystem:1,fromPort:3,toSystem:1,toPort:5,good:5,tons:4}).ok,'Repair fixture job failed');
              for(let seconds=0;seconds<100&&!ship.cargo;seconds+=.25)h.tick(.25);h.check(ship.cargo,'Repair fixture failed physical loading');
              const before={id:ship.task.id,cargo:h.copy(ship.cargo),escrow:h.copy(nativeNpcLives.initialize(s).reservations[ship.task.id]),hull:ship.hull};
              ship.repairDeuranium=30;ship.shields=0;nativeNpcLives.suspendCombat(s,ship,'Combat interruption before disabling impact');
              nativeCivilianTraffic.hit(s,ship.id,ship.hull*.8,{source:'player',sourceId:'player',from:vexedSolFlight.shipPosition(s)});
              h.check(ship.phase==='disabled'&&ship.combatInterruption,'Shared disabling discarded suspension');
              h.tick(2);h.check(ship.phase==='disabled','Repair should take physical drone time');
              h.check(ship.repairBay.slots.some(d=>!['stowed','destroyed'].includes(d.phase)),'Shared repair drones did not launch');
              h.check(nativeSaveStorage.write(s).ok,'Mid-repair save failed');return before;
            }""")
            page.reload()
            page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
            page.evaluate('()=>{window.__freezeTactics=true;}')
            page.locator('[data-menu="continue-dev"]').click()
            page.wait_for_function('()=>!!nativeNpcDev.getState()',timeout=30000)
            page.evaluate('()=>{window.requestAnimationFrame=()=>0;}')
            repair = page.evaluate("""before => {
              const s=nativeNpcDev.getState(),ship=s.civilianTraffic.ships[0],check=(value,message)=>{if(!value)throw Error(message);};
              check(ship.phase==='disabled'&&ship.task.id===before.id,'Reload lost disabled job');
              for(let i=0;i<12000&&ship.phase==='disabled';i++){const dt=nativeSimulation.advance(s,1/60);nativeCivilianTraffic.advance(s,dt);nativeCombatShots.advance(s,dt);nativeShipEffects.advance(s,dt);}
              check(ship.phase!=='disabled'&&ship.hull===before.hull,'Shared drones failed to repair the real hull');check(ship.task.id===before.id&&ship.task.status==='active','Shared repair discarded the retained funded job');
              check(JSON.stringify(ship.cargo)===JSON.stringify(before.cargo),'Repair lost retained cargo');check(JSON.stringify(nativeNpcLives.initialize(s).reservations[ship.task.id])===JSON.stringify(before.escrow),'Repair changed funded escrow');
              check(ship.repairBay.slots.every(d=>['stowed','destroyed'].includes(d.phase)),'Job resumed before drones physically recovered');
              return {jobId:ship.task.id,phase:ship.task.phase,hull:ship.hull,cargo:ship.cargo,suppliesRemaining:ship.repairDeuranium,droneStates:ship.repairBay.slots.map(d=>d.phase)};
            }""", repair_mid)
            report = {'incoming': detection, 'decisions': decisions, 'pursuit': pursuit, 'survival': survival, 'sharedRepair': repair}
            (OUTPUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
            print(json.dumps(report, indent=2))
        assert not errors, errors
        browser.close()
finally:
    server.shutdown()
