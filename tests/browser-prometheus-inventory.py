"""Four real Inventory views, owned weapon fitting, command switching and reload."""
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/prometheus-inventory'
OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('server',ROOT/'tests/browser-npc-performance.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(module.SnapshotHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,channel=os.environ.get('BROWSER_CHANNEL','msedge'))
  page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
  page.wait_for_function('()=>window.startNativeDevGame && window.nativePrometheusLoadouts')
  page.evaluate("""()=>{
   const owner=nativeCivilianTraffic;window.nativeCivilianTraffic={...owner,initialize(s,...args){window.__inventoryState=s;return owner.initialize(s,...args);}};
   const frame=nativeSimulationFrame;window.nativeSimulationFrame={...frame,run(){}};
  }""")
  page.locator('[data-menu="dev"]').click()
  page.wait_for_function('()=>!!window.__inventoryState',timeout=30000)
  page.evaluate("""async()=>{
   const s=__inventoryState;nativeShipEquipment.changeHull(s,37);nativeWeaponLoadout.refit(s,[1,10,10]);
   Object.assign(s,{devMode:false,landed:false,phase:'flight',localCruise:null,arrivalApproach:null,pendingTransit:null,shipyardDock:null,x:3000,y:-3000,angle:-Math.PI/2,vx:0,vy:0,speed:0,hull:320,shields:150});
   await nativePrometheus.preload(s);nativePrometheus.activate(s);
   for(let i=0;i<540;i++){nativeSimulation.advance(s,1/60);nativePrometheus.advance(s,1/60);}
   const bodies=[s,...s.prometheus.sections];bodies.forEach((e,i)=>{e.hull=60+i;e.shields=20+i;});
   window.__physical=Object.fromEntries(bodies.map(e=>[e===s?3702:e.shipType,{x:e.x,y:e.y,vx:e.vx,vy:e.vy,hull:e.hull,shields:e.shields,heading:e.heading??e.angle}]));
   window.__owned=Object.keys(s.shipEquipment.instances).sort();
   window.__moveWeapon=s.prometheusLoadouts.plans.middle.weapon[0];s.shipEquipment.instances[__moveWeapon].readyAt=999;
  }""")
  page.locator('#inventoryBtn').click()
  page.wait_for_selector('#ship-inventory canvas.ready')
  assert page.locator('button[data-prometheus-tab]').count()==4
  assert page.locator('#ship-inventory').get_attribute('data-prometheus-tab')=='middle'
  def tab(key):
   page.locator(f'button[data-prometheus-tab="{key}"]').click()
   page.wait_for_selector('#ship-inventory canvas.ready')
  def weapon_slot(index):
   return page.locator(f'#ship-inventory [data-equipment-kind="weapon"][data-equipment-place="slot"][data-equipment-index="{index}"]')
  ratios={}
  for key in ['combined','top','middle','bottom']:
   tab(key)
   ratios[key]=float(page.locator('[data-ship-preview]').get_attribute('data-preview-ratio'))
   assert page.evaluate('nativePrometheus.typeFor(__inventoryState)')==3702,'Browsing must not transfer command'
  tab('top')
  # Drag the existing Beta weapon from the common store into Alpha's second mount.
  weapon_id=page.evaluate('__moveWeapon')
  source=page.locator(f'[data-item-key="equipment:{weapon_id}"]')
  for _ in range(20):
   if source.count(): break
   page.locator('[data-inventory-page="next"]').click()
  assert source.count()==1, 'Missing owned weapon '+weapon_id
  source.drag_to(weapon_slot(1))
  assert page.evaluate('__inventoryState.prometheusLoadouts.plans.top.weapon[1]===__moveWeapon')
  assert page.evaluate('!__inventoryState.prometheusLoadouts.plans.middle.weapon.includes(__moveWeapon)')
  assert page.evaluate('__inventoryState.shipEquipment.instances[__moveWeapon].readyAt')==999
  # Pilot changes are real, while Inventory pauses the simulation.
  for key,type_id in [('top',3701),('bottom',3703),('middle',3702),('top',3701)]:
   tab(key)
   page.locator('[data-pilot-section]').click()
   assert page.evaluate('nativePrometheus.typeFor(__inventoryState)')==type_id
   assert page.evaluate("""(type)=>{const s=__inventoryState,p=__physical[type];return ['x','y','vx','vy','hull','shields'].every(k=>s[k]===p[k])&&s.angle===p.heading;}""",type_id)
   assert page.evaluate('JSON.stringify(Object.keys(__inventoryState.shipEquipment.instances).sort())===JSON.stringify(__owned)')
   assert page.locator('[data-pilot-section]').is_disabled()
   try:
    page.wait_for_function("""()=>{const s=__inventoryState,eq=nativeWeaponLoadout.ensure(s),label=document.getElementById('game-hud').getAttribute('aria-label');return eq.slots.every((id,i)=>label.includes('Weapon '+(i+1)+': '+((nativeShipEquipment.forInstance?.(eq.instances[id])||nativeShipEquipment.model(eq.instances[id]?.modelId))?.name||'Empty')));} """,timeout=7000)
   except Exception:
    print(page.evaluate("()=>({type:nativePrometheus.typeFor(__inventoryState),slots:nativeWeaponLoadout.ensure(__inventoryState).slots,label:document.getElementById('game-hud').getAttribute('aria-label')})"),flush=True)
    raise
  page.screenshot(path=str(OUT/'inventory-alpha.png'))
  page.set_viewport_size({'width':1050,'height':700})
  for key in ['combined','top','middle','bottom']:
   tab(key)
   assert page.locator('[data-pilot-section]').is_visible()
   assert page.evaluate("()=>{const e=document.querySelector('.inventory-prometheus-tabs'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}")
  page.screenshot(path=str(OUT/'inventory-compact.png'))
  page.set_viewport_size({'width':1440,'height':1000})
  tab('combined')
  page.screenshot(path=str(OUT/'inventory-combined.png'))
  page.locator('.inventory-close').click()
  saved=page.evaluate("""()=>{const s=__inventoryState;if(!nativeSaveStorage.write(s).ok)throw Error('save failed');return JSON.stringify(s.prometheusLoadouts);} """)
  page.evaluate("resumeNativeGame('normal')")
  assert page.evaluate('nativePrometheus.typeFor(__inventoryState)')==3701
  assert page.evaluate('JSON.stringify(__inventoryState.prometheusLoadouts)')==saved
  page.locator('#inventoryBtn').click()
  assert page.locator('#ship-inventory').get_attribute('data-prometheus-tab')=='top'
  assert page.evaluate('__inventoryState.prometheusLoadouts.plans.top.weapon[1]===__moveWeapon')
  page.locator('.inventory-close').click()
  # Confirm the old pilot is moving under AI and that the edited loadouts survive docking.
  flight=page.evaluate("""()=>{const s=__inventoryState,old=s.prometheus.sections.find(e=>e.shipType===3702),before={x:old.x,y:old.y};
   for(let i=0;i<120;i++){nativeSimulation.advance(s,1/60);nativePrometheus.advance(s,1/60);}return Math.hypot(old.x-before.x,old.y-before.y);}""")
  assert flight>0
  page.evaluate("""()=>{const s=__inventoryState;nativePrometheus.recall(s);for(let i=0;i<3600&&s.prometheus.mode!=='joined';i++){nativeSimulation.advance(s,1/60);nativePrometheus.advance(s,1/60);}if(s.prometheus.mode!=='joined')throw Error('dock did not finish');}""")
  page.locator('#inventoryBtn').click()
  assert page.locator('#ship-inventory').get_attribute('data-prometheus-tab')=='combined'
  assert page.locator('[data-pilot-section]').is_disabled()
  assert not errors, errors
  report={'passed':True,'tabs':4,'pilotSwitches':4,'previewRatios':ratios,'oldPilotTravel':flight,'savedLoadouts':json.loads(saved),'errors':errors}
  (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
  print(json.dumps({'passed':True,'tabs':4,'pilotSwitches':4,'oldPilotTravel':flight,'errors':errors}),flush=True)
  browser.close()
finally:
 server.shutdown()
