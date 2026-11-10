"""Real Federation NPCs and an old-save upgrade through the existing fleet owners."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/federation-npcs';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html'
errors=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,channel=os.environ.get('BROWSER_CHANNEL','msedge'))
  legacy=browser.new_context(viewport={'width':1280,'height':850})
  old_fleet=(ROOT/'html-games/broken-mirror-port/federation-fleet.js').read_text(encoding='utf8').replace('id=>id!==58','id=>id<433&&id!==58').replace('rosterVersion:2,','')
  legacy.route('**/federation-fleet.js*',lambda route:route.fulfill(content_type='text/javascript',body=old_fleet))
  old=legacy.new_page();old.on('pageerror',lambda e:errors.append(str(e)));old.goto(base)
  old.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  old.evaluate('startNativeDevGame()');old.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
  saved=old.evaluate('''()=>{window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();return JSON.stringify(nativeNpcDev.getState());}''')
  original=json.loads(saved);old_types=sorted(set(e['shipType'] for e in original['civilianTraffic']['ships']))
  (OUT/'legacy-save.json').write_text(saved,encoding='utf8')
  assert all(t<433 for t in old_types),old_types
  original_ledger=original['civilianTraffic']['life']['federationFleet']
  legacy.close()
  context=browser.new_context(viewport={'width':1280,'height':850});page=context.new_page();page.set_default_timeout(60000)
  page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base)
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.wait_for_function('()=>nativeWorldBootstrap.diagnostics().ready||nativeWorldBootstrap.diagnostics().error',timeout=120000)
  bootstrap=page.evaluate('nativeWorldBootstrap.diagnostics()');assert bootstrap['ready'] and not bootstrap['error'],bootstrap
  migrated=page.evaluate('''saved=>{
   window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
   const original=JSON.parse(saved);if(!nativeSaveStorage.write(original).ok)throw Error('Legacy fixture save failed');resumeNativeGame('dev');
   const s=nativeNpcDev.getState();window.__fleetState=s;
   for(const key of ['assigned','commissioned','equipmentIssued','hullsIssued'])if(JSON.stringify(s.civilianTraffic.life.federationFleet[key])!==JSON.stringify(original.civilianTraffic.life.federationFleet[key]))throw Error('Roster extension reset saved fleet accounting: '+key);
   const fields=['id','name','shipType','system','x','y','hull','shields','credits','cargo','task','journey','nextActionAt','shipEquipment'];
   for(const before of original.civilianTraffic.ships){const after=nativeNpcLives.find(s,before.id);for(const key of fields)if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw Error('Migration changed an existing job/holder: '+before.id+'/'+key);}
   return {oldTypes:[...new Set(s.civilianTraffic.ships.map(e=>e.shipType))],queued:nativeNpcLives.initialize(s).federationFleet.pending.length,population:s.civilianTraffic.ships.length};
  }''',saved)
  assert migrated['population']==1200 and migrated['queued']>0,migrated
  # Let the real saved jobs finish in analytical time. This is a functional
  # calendar exercise, not a display/FPS measurement or a new encounter fleet.
  progressed=page.evaluate('''()=>{
   const s=__fleetState,ids=s.civilianTraffic.ships.map(e=>e.id);s.landed=true;
   window.nativeSimulation={...nativeSimulation,blocked:()=>false};nativeSimulationHost.checkpoint();
   nativeNpcLives.interactive(s,false);
   for(let i=0;i<18000;i++){nativeSimulationFrame.begin(s);nativeSimulation.advance(s,1/60);nativeSolEconomy.advance(s,1/60);nativeCivilianTraffic.advance(s,1/60);nativeSimulationFrame.end(s);}
   nativeNpcLives.interactive(s,true);
   window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();s.landed=false;
   if(JSON.stringify(ids)!==JSON.stringify(s.civilianTraffic.ships.map(e=>e.id)))throw Error('Fleet identities or population changed');
   return {population:s.civilianTraffic.ships.length,medical:s.civilianTraffic.ships.filter(e=>e.shipType===58).length,
    types:[...new Set(s.civilianTraffic.ships.map(e=>e.shipType))],commissioned:nativeNpcLives.initialize(s).federationFleet.commissioned,
    patrols:s.civilianTraffic.ships.filter(e=>e.role==='patrol'&&e.task?.requirements.fleetPatrol).length,
    queue:nativeNpcLives.initialize(s).federationFleet.pending.length};
  }''')
  assert progressed['population']==1200 and progressed['medical']==100 and progressed['commissioned']>=5 and progressed['patrols']>0,progressed
  assert all(t in progressed['types'] for t in page.evaluate('nativeFederationFleet.types')),progressed
  (OUT/'fleet-save.json').write_text(page.evaluate('JSON.stringify(__fleetState)'),encoding='utf8')
  print(json.dumps({'oldSaveMigrated':True,**progressed}),flush=True)
  seen=[]
  for index in range(4):
   target=page.evaluate('''seen=>{
    const s=__fleetState,e=s.civilianTraffic.ships.find(e=>e.federationDutyVersion&&e.role==='patrol'&&!e.journey&&e.hull>0&&!['disabled','destroyed'].includes(e.phase)&&!seen.includes(e.shipType));
    if(!e)return null;const visit=nativeNpcDev.visit(e.id);if(!visit.ok)throw Error(visit.error);
    nativeCivilianTraffic.select(e.id);const d=nativeShipSystems.resolve(s,e.id);if(d?.entity!==e||nativeCivilianTraffic.target(s)!==e)throw Error('NPC is only a visual ghost');
    return {id:e.id,type:e.shipType,name:e.name,phase:e.phase};
   }''',seen)
   if target is None:break
   seen.append(target['type'])
   page.evaluate('async type=>{const d=nativeShipDefinitions.get(type);await vexedFlightAssets.loadShip(type,d.hull);}',target['type'])
   page.wait_for_timeout(200);page.screenshot(path=str(OUT/f'npc-{target["type"]}.png'))
  assert len(seen)>=2,seen
  interaction=page.evaluate('''()=>{
   const s=__fleetState,at=nativeSimulation.seconds(s),traveller=s.civilianTraffic.ships.find(e=>e.federationDutyVersion&&e.role==='patrol'&&e.journey?.arrivalAt>at+1&&e.hull>0);
   if(!traveller)throw Error('No existing patrol is currently travelling between systems');
   const from=nativeNpcLives.galaxyPosition(s,traveller);
   window.nativeSimulation={...nativeSimulation,blocked:()=>false};nativeSimulationHost.checkpoint();nativeSimulation.advance(s,.25);nativeCivilianTraffic.advance(s,.25);
   window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
   const to=nativeNpcLives.galaxyPosition(s,traveller),moved=Math.hypot(to.x-from.x,to.y-from.y);if(!(moved>.01))throw Error('The real Federation patrol is frozen');
   const e=s.civilianTraffic.ships.find(e=>e.federationDutyVersion&&e.role==='patrol'&&!e.journey&&e.hull>0&&!['disabled','destroyed'].includes(e.phase));
   if(!e)throw Error('No local Federation hull available for physical checks');nativeNpcDev.visit(e.id);
   let target=nativeShipSystems.resolve(s,e.id),player=nativeShipDefinitions.describe(s),offset={x:player.x-s.x,y:player.y-s.y};
   nativeShipMotion.stop(s);Object.assign(s,{x:target.x+1-offset.x,y:target.y-offset.y,previousX:target.x+1-offset.x,previousY:target.y-offset.y});nativeShipSystems.refreshShip(s,s,'player');
   window.nativeSimulation={...nativeSimulation,blocked:()=>false};nativeSimulationHost.checkpoint();nativeShipTraffic.collide(s,1/60);
   window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
   target=nativeShipSystems.resolve(s,e.id);player=nativeShipDefinitions.describe(s);
   const distance=Math.hypot(target.x-player.x,target.y-player.y);if(!(distance>2))throw Error('Player passes through the Federation hull');
   const slot=nativeShipEquipment.ensure(s,e).slots.weapon.findIndex(id=>!!id);
   window.nativeSimulation={...nativeSimulation,blocked:()=>false};nativeSimulationHost.checkpoint();
   const fired=nativeCombatShots.fireFor({state:s,shooter:target,target:player,selection:{slot}});
   window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
   if(!fired.ok)throw Error('Real fitted Federation weapons cannot fire: '+fired.error);
   const before=JSON.stringify({type:e.shipType,instances:Object.keys(e.shipEquipment.instances).sort(),fleet:nativeNpcLives.initialize(s).federationFleet});
   if(!nativeSaveStorage.write(s).ok)throw Error('Fleet Continue save failed');resumeNativeGame('dev');
   const loaded=nativeNpcDev.getState(),same=nativeNpcLives.find(loaded,e.id);
   if(before!==JSON.stringify({type:same.shipType,instances:Object.keys(same.shipEquipment.instances).sort(),fleet:nativeNpcLives.initialize(loaded).federationFleet}))throw Error('Reload reissued a hull or lost crew equipment');
   return {type:same.shipType,travellingType:traveller.shipType,moved,collisionDistance:distance,realWeaponFired:true,continueStable:true};
  }''')
  assert not errors,errors
  report={'passed':True,'bootstrap':bootstrap,'oldTypes':old_types,'migration':migrated,'progressed':progressed,'seenPhysicalTypes':seen,'interaction':interaction,'errors':errors}
  (OUT/'browser.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True)
  browser.close()
finally:server.shutdown();server.server_close()
