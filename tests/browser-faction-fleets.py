"""Actual worker populations, native faction targets, contacts, weapons and Continue."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/faction-fleets/browser'
OUT.mkdir(parents=True,exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):
        pass


server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
failed=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850})
        page.set_default_timeout(60000)
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda response:failed.append(str(response.status)+' '+response.url) if response.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
        summary=page.evaluate('''()=>{
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=window.__fleetState=nativeNpcDev.getState(),check=(value,message)=>{if(!value)throw Error(message);};
          const fleets=nativeFactionFleets.rosters.filter(f=>f.governmentId!==1).map(f=>{
            const ships=s.civilianTraffic.ships.filter(e=>nativeFactionFleets.forShip(s,e)?.governmentId===f.governmentId),seen=[...new Set(ships.map(e=>e.shipType))];
            check(f.types.every(type=>seen.includes(type)),'Worker omitted a native faction class: '+f.label);
            check(ships.every(e=>nativeFactionFleets.government(s,e.operatingBase??e.stationSystem)===f.governmentId),'Wrong faction territory: '+f.label);
            check(ships.some(e=>e.role==='patrol'&&e.task?.requirements.fleetPatrol),'No working patrol: '+f.label);
            return {government:f.governmentId,name:f.label,types:f.types,seen,population:ships.length,bases:f.bases(s)};
          });
          check(s.civilianTraffic.ships.filter(e=>e.shipType===58).length===100,'Medical coverage changed');
          check(!Object.values(nativeNpcLives.initialize(s).markets).some(m=>[32,33,34,51,52].includes(m.system)),'A prohibited civilian market was created');
          check(s.civilianTraffic.ships.filter(e=>e.shipType===44).every(e=>e.system===34&&e.role==='patrol'),'Borg patrols were relocated out of Vex');
          return {population:s.civilianTraffic.ships.length,medical:100,fleets,bootstrap:nativeWorldBootstrap.diagnostics()};
        }''')
        assert summary['bootstrap']['ready'] and not summary['bootstrap']['error'],summary['bootstrap']
        assert len(summary['fleets'])==13 and sum(len(f['types']) for f in summary['fleets'])==39
        contacts=[]
        for fleet in summary['fleets']:
            visit=page.evaluate('''government=>{
              const s=__fleetState,e=s.civilianTraffic.ships.find(e=>e.ownerGovernmentId===government&&e.role==='patrol'&&!e.journey&&e.hull>0&&!['disabled','destroyed','warp','arriving'].includes(e.phase));
              if(!e)throw Error('No local patrol available for government '+government);
              const visited=nativeNpcDev.visit(e.id);if(!visited.ok)throw Error(visited.error);
              nativeCivilianTraffic.select(e.id);
              if(nativeCivilianTraffic.target(s)!==e||nativeShipSystems.resolve(s,e.id)?.entity!==e)throw Error('Faction NPC is a visual ghost');
              return {id:e.id,type:e.shipType,system:e.system};
            }''',fleet['government'])
            page.evaluate('async type=>{await vexedFlightAssets.loadShip(type,nativeShipDefinitions.get(type).hull);}',visit['type'])
            interaction=page.evaluate('''({id,government})=>{
              const s=__fleetState,e=nativeNpcLives.find(s,id),api=nativeSimulation,check=(value,message)=>{if(!value)throw Error(message);};
              let target=nativeShipSystems.resolve(s,e.id),player=nativeShipDefinitions.describe(s),offset={x:player.x-s.x,y:player.y-s.y};
              nativeShipMotion.stop(s);Object.assign(s,{x:target.x+1-offset.x,y:target.y-offset.y,previousX:target.x+1-offset.x,previousY:target.y-offset.y,landed:false,phase:'flight'});
              nativeShipSystems.refreshShip(s,s,'player');
              window.nativeSimulation={...api,blocked:()=>false};nativeSimulationHost.checkpoint();
              try{nativeShipTraffic.collide(s,1/60);}finally{window.nativeSimulation=api;nativeSimulationHost.checkpoint();}
              target=nativeShipSystems.resolve(s,e.id);player=nativeShipDefinitions.describe(s);
              const separation=Math.hypot(target.x-player.x,target.y-player.y);check(separation>2,'Player passes through faction hull '+e.shipType);
              // Patrol routes can leave this contact fixture at any bearing.
              // Align the static firing fixture; pursuit is tested separately.
              nativeNpcLives.suspendCombat(s,e,'Static fitted-weapon fixture after physical contact');nativeShipMotion.stop(e);
              e.heading=Math.atan2(player.y-e.y,player.x-e.x);nativeShipSystems.refreshShip(s,e,'civilian');target=nativeShipSystems.resolve(s,e.id);
              const eq=nativeShipEquipment.ensure(s,e),slot=eq.slots.weapon.findIndex(id=>id&&nativeShipEquipment.model(eq.instances[id].modelId)?.damage>0);
              check(slot>=0,'Patrol has no fitted weapon: '+e.shipType);
              let fired;window.nativeSimulation={...api,blocked:()=>false};nativeSimulationHost.checkpoint();
              try{fired=nativeCombatShots.fireFor({state:s,shooter:target,target:player,selection:{slot}});}finally{window.nativeSimulation=api;nativeSimulationHost.checkpoint();}
              check(fired.ok,'Fitted faction weapon did not fire: '+fired.error);check(fired.event.sourceGovernmentId===government,'Launched weapon lost faction ownership');
              const region=nativeFactionDefence.region(s,e);s.localPrestige[region]=0;nativeManualFlight.initializeRegion(s);
              const attacked=nativeCivilianTraffic.hit(s,e.id,1,{source:'player',sourceId:'player',weaponEventId:8000+government});
              check(attacked.reputation?.amount===5&&s.localPrestige[region]===-5,'Player attack did not affect the native faction standing: '+JSON.stringify({government,ship:id,system:e.system,region,attacked,standing:s.localPrestige[region]}));
              check(nativeFactionDefence.target(s,e)?.id==='player','Native faction does not defend its own system');
              check(nativeFactionDefence.friendly(s,e,{source:'ai',sourceId:999999,sourceGovernmentId:government}),'Allied projectile ownership was lost');
              return {id:e.id,type:e.shipType,government,system:e.system,physicalRegion:region,separation,realWeaponFired:true,reputation:s.localPrestige[region],defendsTerritory:true};
            }''',{'id':visit['id'],'government':fleet['government']})
            contacts.append(interaction)
            if fleet['government'] in [2,5,6,7,13,14]:
                page.wait_for_timeout(100)
                page.screenshot(path=str(OUT/f'faction-{fleet["government"]}.png'))
        travel=page.evaluate('''()=>{
          const s=__fleetState,e=s.civilianTraffic.ships.find(e=>e.factionDutyVersion&&e.role==='patrol'&&e.journey&&e.journey.arrivalAt>nativeSimulation.seconds(s)+1);
          if(!e)throw Error('No actual interstellar faction patrol');
          const before=nativeNpcLives.galaxyPosition(s,e),api=nativeSimulation;
          window.nativeSimulation={...api,blocked:()=>false};nativeSimulationHost.checkpoint();
          try{nativeSimulation.advance(s,.25);nativeCivilianTraffic.advance(s,.25);}finally{window.nativeSimulation=api;nativeSimulationHost.checkpoint();}
          const after=nativeNpcLives.galaxyPosition(s,e),moved=Math.hypot(after.x-before.x,after.y-before.y);
          if(!(moved>.01))throw Error('Interstellar faction patrol is frozen');
          const snapshot=state=>JSON.stringify({ships:state.civilianTraffic.ships.map(e=>[e.id,e.shipType,e.ownerGovernmentId,e.role,e.factionDutyVersion]),fleet:state.civilianTraffic.life.factionFleets});
          const saved=snapshot(s);if(!nativeSaveStorage.write(s).ok)throw Error('Faction fleet save failed');resumeNativeGame('dev');
          const loaded=nativeNpcDev.getState();if(snapshot(loaded)!==saved)throw Error('Continue changed faction hulls, ownership or commissioning');
          return {id:e.id,type:e.shipType,government:e.ownerGovernmentId,moved,continueStable:true};
        }''')
        assert not errors,errors
        assert not failed,failed
        report={'passed':True,'summary':summary,'physicalContacts':contacts,'travel':travel,'errors':errors,'failedResponses':failed}
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
        print(json.dumps({'passed':True,'factions':len(summary['fleets']),'additionalHullTypes':35,'population':1200,'medical':100,'physicalContacts':len(contacts),'travel':travel}))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
