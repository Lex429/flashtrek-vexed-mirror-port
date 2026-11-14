"""Physical faction yards: real contact UI, shared motion, refits, saves and departure."""
import functools, http.server, json, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/faction-shipyards'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge')
  browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(30000)
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
  url=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html'
  def install_observer():
   page.evaluate('''()=>{
    const ensure=nativeShipEquipment.ensure;
    window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__yardState=s;return ensure(s,h,d);}};
    window.__yardClock=nativeSimulation;
    window.nativeSimulation={...__yardClock,blocked:()=>true};nativeSimulationHost.checkpoint();
    window.__dockTicks=(limit=9000)=>{
     const s=__yardState;window.nativeSimulation={...__yardClock,blocked:()=>false};
     try{for(let i=0;i<limit;i++){
      if(!s.shipyardDock||s.shipyardDock.phase==='docked')return i;
      nativeSimulation.advance(s,1/60);nativeShipyardServices.advance(s,1/60);
     }return limit;}finally{window.nativeSimulation={...__yardClock,blocked:()=>true};nativeSimulationHost.checkpoint();}
    };
   }''')
  page.goto(url)
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('startNativeDevGame()')
  page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
  print('Faction yard browser world ready',flush=True)
  base=page.evaluate('()=>JSON.stringify(nativeNpcDev.getState())')
  install_observer()
  audit=page.evaluate('''()=>{
   const s=nativeNpcDev.getState(),yards=nativeMarsShipyard.definitions,ships=VexedMirrorWorld.ships;
   const owners=new Set(VexedMirrorWorld.systems.filter(s=>s.governmentId>0).map(s=>s.governmentId));
   const covered=new Set(yards.map(y=>VexedMirrorWorld.systems.find(s=>s.id===y.system).governmentId));
   if(yards.length!==17||covered.size!==owners.size)throw Error('Incomplete faction coverage');
   let plans=0;
   for(const y of yards.slice(5))for(const hull of ships){
    const holder={system:y.system,shipType:hull.id},plan=nativeShipyardServices.plan(holder),d=nativeShipDefinitions.dimensions(holder),padding=Math.max(d.width,d.height)/2+8;
    const obstacles=nativeShipMotion.navigationObstacles(s,y.system,plan.entry,plan,padding);
    if(!nativeShipMotion.clearSegment(plan.entry,plan,obstacles,padding))throw Error('Blocked real hull approach '+y.id+'/'+hull.id);
    plans++;
   }
   return {yards:yards.length,factions:covered.size,hulls:ships.length,plans,crews:s.civilianTraffic.ships.length,medics:s.civilianTraffic.ships.filter(e=>e.role==='medical').length};
  }''')
  assert audit['crews']==1200 and audit['medics']==100,audit
  print(json.dumps(audit),flush=True)
  yards=page.evaluate('()=>nativeMarsShipyard.definitions.map(y=>({id:y.id,system:y.system,name:y.name,bodyId:y.bodyId}))')
  # Include the translated Remus view of the Romulan yard.
  cases=[]
  for index,yard in enumerate(yards+[dict(next(y for y in yards if y['system']==31),system=30)]):
   print('Testing '+yard['name']+' in '+str(yard['system']),flush=True)
   ship_type=[7,44,436,447,448,449][index%6]
   page.evaluate('''({base,yard,type})=>{
    const s=JSON.parse(base);
    Object.assign(s,{devMode:false,captain:'Faction Yard Test',shipType:type,system:yard.system,localBody:yard.bodyId,localBodySystem:yard.system,localSystemVersion:2,
     phase:'flight',landed:false,latinum:1000000,dilithium:1000,deuranium:0,minerals:{tritanium:1000,trellium:1000,deuranium:1000,gallicite:1000,benamite:1000},angle:-Math.PI/2,speed:0,vx:0,vy:0});
    for(const key of ['shipEquipment','weaponLoadout','repairBay','shipThrusters','shipRefit','inventoryLayout','shipyardDock','arrivalApproach','localCruise','pendingTransit','motionKick','motionSpin','manualFlightRegion'])delete s[key];
    nativeShipEquipment.ensure(s);const d=nativeShipDefinitions.forEntity(s);s.hull=d.hull;s.shields=d.shields;
    const plan=nativeShipyardServices.plan(s),body=nativeSystemCatalog.bodies(s.system).find(b=>b.id===s.localBody);
    s.x=plan.entry.x-Math.cos(plan.heading)*40-(s.system===1?body.x:0);
    s.y=plan.entry.y-Math.sin(plan.heading)*40-(s.system===1?body.y:0);
    if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');
   }''',{'base':base,'yard':yard,'type':ship_type})
   page.wait_for_function('id=>!__yardState?.shipyardDock&&nativeMarsShipyard.definitionFor(__yardState)?.id===id',arg=yard['id'])
   page.wait_for_timeout(150)
   # Alternate actual canvas station clicks and radar service-square clicks.
   point=page.evaluate('''radar=>{
    const s=__yardState,ship=vexedSolFlight.shipPosition(s),yard=nativeMarsShipyard.position(s);
    if(radar){const canvas=document.querySelector('#native-radar'),r=canvas.getBoundingClientRect(),dx=(yard.x-ship.x)/25,dy=(yard.y-ship.y)/25,k=Math.min(1,69/Math.max(.001,Math.abs(dx)),35/Math.max(.001,Math.abs(dy)));return {x:r.x+(80+dx*k)*r.width/160,y:r.y+(57+dy*k)*r.height/120};}
    const canvas=document.querySelector('#space'),r=canvas.getBoundingClientRect(),v=nativeView.measure(canvas),p=nativeMarsShipyard.visible({state:s,ship,cx:v.w/2,cy:v.h/2,zoom:1,w:v.w,h:v.h});
    if(!p)throw Error('Yard not visible');
    const x=Math.max(45,Math.min(v.w-45,p.x)),y=Math.max(55,Math.min(v.h-55,p.y));
    if(Math.abs(x-p.x)>p.size*.45||Math.abs(y-p.y)>p.size*.43)throw Error('No unobscured station click point');
    return {x:r.x+x*r.width/v.w,y:r.y+y*r.height/v.h};
   }''',index%2==1)
   page.mouse.click(point['x'],point['y'])
   try:
    page.locator('[data-yard-action="dock"]').wait_for(timeout=10000)
   except Exception:
    page.screenshot(path=str(OUT/'contact-failure.png'))
    print(page.evaluate('''point=>({element:document.elementFromPoint(point.x,point.y)?.outerHTML?.slice(0,300),system:__yardState.system,phase:__yardState.phase,landed:__yardState.landed,pose:vexedSolFlight.shipPosition(__yardState),yard:nativeMarsShipyard.position(__yardState),hub:nativeSystemHub.active,encounter:nativePlanetEncounter.active,pause:nativePause.active,opening:nativeOpeningCinematic.active,inventory:nativeShipInventory.active,services:nativeShipyardServices.snapshot()})''',point),flush=True)
    raise
   assert page.locator('#shipyard-services h1').inner_text()==yard['name']
   page.locator('[data-yard-action="dock"]').click()
   page.wait_for_function('()=>__yardState.shipyardDock?.phase==="approach"')
   start=page.evaluate('()=>({...vexedSolFlight.shipPosition(__yardState)})')
   page.evaluate('__dockTicks(120)')
   moved=page.evaluate('()=>({...vexedSolFlight.shipPosition(__yardState)})')
   assert start!=moved,(yard,'No real approach movement')
   if yard['system'] in [2,30]:
    page.evaluate('()=>{if(!nativeSaveStorage.write(__yardState).ok)throw Error("Mid-approach save failed");resumeNativeGame("normal");}')
    assert page.evaluate('()=>__yardState.shipyardDock.phase')=='approach'
   page.evaluate('__dockTicks()')
   assert page.evaluate('()=>nativeShipyardServices.docked&&nativeShipyardServices.active'),yard
   pose=page.evaluate('''()=>{const s=__yardState,p=vexedSolFlight.shipPosition(s),d=s.shipyardDock;return {error:Math.hypot(p.x-d.plan.x,p.y-d.plan.y),external:d.plan.external,lights:nativeShipyardServices.appearance(s).lights};}''')
   assert pose['error']<.7 and pose['lights'] is False,pose
   assert page.locator('[data-yard-tab]').count()==5
   page.locator('[data-yard-tab="upgrades"]').click()
   before=page.evaluate('()=>({latinum:__yardState.latinum,price:nativeShipThrusters.quote(__yardState).price})')
   if yard['id']=='mars-earth-shipyard-01':
    page.locator('.mars-shop-card[data-upgrade-card="thrusters"] h2').click()
    assert page.evaluate('()=>__yardState.latinum')==before['latinum']
    page.locator('[data-yard-action="buy-upgrade"][data-kind="thrusters"]').click()
   else:page.locator('[data-yard-action="upgrade-thrusters"]').click()
   assert page.evaluate('()=>nativeShipDefinitions.forEntity(__yardState).thrusters.level')==1
   assert page.evaluate('()=>__yardState.latinum')==before['latinum']-before['price']
   page.locator('.mars-shop-card[data-upgrade-card="hull"] h2' if yard['id']=='mars-earth-shipyard-01' else '[data-yard-action="upgrade"][data-kind="hull"]').click()
   page.locator('[data-yard-action="buy-upgrade"][data-kind="hull"]' if yard['id']=='mars-earth-shipyard-01' else '[data-yard-action="confirm-upgrade"]').click()
   assert page.evaluate('()=>nativeShipyardRefits.level(__yardState,"hull")')==1
   owned=page.evaluate('()=>nativeShipEquipment.ownedWeapons(__yardState).map(entry=>entry.instance.id)')
   assert page.locator('.mars-owned-weapon').count()==len(owned) and owned
   page.locator(f'.mars-owned-weapon[data-weapon-instance="{owned[0]}"] [data-yard-action="upgrade-owned-weapon"]').click()
   assert page.evaluate('id=>nativeShipyardRefits.weaponQuote(__yardState,id).level',owned[0])==2
   if yard['system'] in [2,30]:
    page.screenshot(path=str(OUT/f'{yard["system"]}-docked.png'))
    page.evaluate('()=>{if(!nativeSaveStorage.write(__yardState).ok)throw Error("Docked save failed");}')
    page.reload();page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden')
    install_observer();page.evaluate('resumeNativeGame("normal")')
    page.wait_for_function('()=>nativeShipyardServices.docked&&nativeShipyardServices.active')
    assert page.locator('#shipyard-services h1').inner_text()==yard['name']
    assert page.evaluate('()=>nativeShipDefinitions.forEntity(__yardState).thrusters.level')==1
    assert page.evaluate('()=>nativeShipyardRefits.level(__yardState,"hull")')==1
   page.locator('[data-yard-action="undock"]').click()
   assert page.evaluate('()=>__yardState.shipyardDock.phase')=='departing'
   ticks=page.evaluate('__dockTicks()')
   assert page.evaluate('()=>!__yardState.shipyardDock&&!__yardState.landed&&__yardState.phase==="flight"'),yard
   assert ticks<9000,(yard,'Departure timed out')
   cases.append({**yard,'hull':ship_type,**pose,'departureTicks':ticks})
   print(json.dumps({'yard':yard['name'],'system':yard['system'],'passed':True}),flush=True)
  assert not errors,errors
  result={'audit':audit,'cases':cases,'errors':errors}
  (OUT/'verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
  print(json.dumps({'passed':len(cases),**audit,'errors':errors}),flush=True)
  browser.close()
finally:
 server.shutdown()
