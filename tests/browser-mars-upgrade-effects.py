"""Durable upgrade celebrations, responsive geometry, repeated purchases and cleanup."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/mars-upgrade-effects';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
report={'passed':False,'errors':[]}
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1440,'height':1000},has_touch=True);page.set_default_timeout(20000)
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('''()=>{startNativeDevGame();const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));Object.assign(s,{devMode:false,captain:'Equipment Test',shipName:'USS Consistency',shipType:7,system:1,localBody:5,localBodySystem:1,x:230,y:-45,angle:-Math.PI/2,speed:0,vx:0,vy:0,latinum:200000,dilithium:100,deuranium:0,phase:'flight',landed:false,vitalsVersion:2,weapons:[1],weaponInventory:[],solFreightHold:{},localContracts:[],minerals:{tritanium:100,deuranium:40,trellium:100,gallicite:100,benamite:20}});for(const key of ['shipEquipment','weaponLoadout','repairBay','inventoryLayout','mineralUpgrades','shipRefit','shieldResponse','shipyardDock','arrivalApproach','localCruise','pendingTransit','devRepairDemo'])delete s[key];nativeShipEquipment.ensure(s);const d=nativeShipDefinitions.forEntity(s);s.hull=d.hull;s.shields=d.shields;const shots=nativeCombatShots;window.nativeCombatShots=Object.create(shots,{restore:{value:function(state,...args){window.__gearState=state;return shots.restore(state,...args);}}});if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');nativeShipyardServices.select();}''')
  # Load the UI at a valid berth; browser-shipyard.py exercises the physical trip.
  page.evaluate('''()=>{const s=__gearState,p=nativeShipyardServices.plan(s);Object.assign(s,{x:p.x,y:p.y,angle:p.heading,phase:'docked',landed:true,speed:0,vx:0,vy:0});s.shipyardDock={version:1,station:'mars-earth-shipyard-01',system:1,phase:'docked',plan:p,startedAt:nativeSimulation.seconds(s)};nativeShipyardServices.restore();}''')
  page.wait_for_function('()=>nativeShipyardServices.docked&&nativeShipyardServices.active')
  def buy(kind):
   control=page.locator(f'[data-yard-action="buy-upgrade"][data-kind="{kind}"]')
   if not control.count():page.locator(f'.mars-overview-card[data-upgrade-card="{kind}"]').click()
   return control
  def reset():
   page.evaluate('''()=>{nativeShipyardServices.close();const s=__gearState;s.minerals={};s.solFreightHold={};s.deuranium=0;const result=nativeShipEquipment.changeHull(s,7);if(!result.ok)throw Error(result.error);Object.assign(s,{latinum:1000000,dilithium:1000,minerals:{tritanium:1000,deuranium:1000,trellium:1000,gallicite:1000,benamite:1000},phase:'docked',landed:true});nativeShipyardServices.select();}''')
  def check_receipt(kind,before):
   fx=page.locator('.mars-install-fx');fx.wait_for()
   assert fx.count()==1 and fx.get_attribute('data-upgrade-kind')==kind
   assert float(fx.get_attribute('data-before'))==before['value']
   actual=page.evaluate('kind=>nativeMarsUpgradeEffects.capture(__gearState,kind)',kind)
   assert float(fx.get_attribute('data-after'))==actual['value']
   assert int(fx.get_attribute('data-level'))==before['level']+1==actual['level']
   assert page.locator('.mars-install-announcement').is_visible()
   assert 'UPGRADE INSTALLED' in fx.inner_text()
   assert page.locator('.mars-upgrade-choice').count()==9
   assert fx.evaluate('n=>n.querySelectorAll("*").length')<=65
   return actual
  # Failed settlement never displays success or changes the tier/resources.
  original=page.evaluate('()=>({latinum:__gearState.latinum,refits:__gearState.shipRefit||null})')
  page.evaluate("()=>{window.__realWrite=nativeSaveStorage.write;window.nativeSaveStorage={...nativeSaveStorage,write:()=>({ok:false,error:'Test failed purchase'})};}")
  buy('hull').click();assert page.locator('.mars-install-fx').count()==0
  assert page.evaluate('()=>({latinum:__gearState.latinum,refits:__gearState.shipRefit||null})')==original
  page.evaluate('()=>window.nativeSaveStorage={...nativeSaveStorage,write:__realWrite}')
  # Each hardware type animates a real, saved purchase with its exact result.
  receipts=[]
  for kind in ['hull','shield','cargo','engine','thrusters','drive','weapon','dot','utility']:
   reset();before=page.evaluate('kind=>nativeMarsUpgradeEffects.capture(__gearState,kind)',kind)
   money=page.evaluate('__gearState.latinum');buy(kind).click();actual=check_receipt(kind,before)
   assert page.evaluate('__gearState.latinum')<money
   page.wait_for_timeout(180)
   page.evaluate('()=>{window.__effectNode=document.querySelector(".mars-install-fx");nativeShipyardServices.render();}')
   assert page.evaluate('()=>document.querySelector(".mars-install-fx")===__effectNode')
   if kind=='hull':
    page.locator('.mars-install-fx').evaluate('n=>n.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=550;})')
    page.screenshot(path=str(OUT/'01-installation-burst.png'))
    page.locator('.mars-install-fx').evaluate('n=>n.getAnimations({subtree:true}).forEach(a=>a.play())')
   receipts.append({'kind':kind,'before':before['value'],'after':actual['value']})
  # Effects do not intercept a second purchase or accumulate overlay/timer sets.
  reset();first=page.evaluate('nativeMarsUpgradeEffects.capture(__gearState,"hull")');buy('hull').click();check_receipt('hull',first)
  second=page.evaluate('nativeMarsUpgradeEffects.capture(__gearState,"hull")');before_money=page.evaluate('__gearState.latinum');price=page.evaluate('nativeShipyardRefits.quote(__gearState,"hull").price')
  buy('hull').click();check_receipt('hull',second)
  assert page.evaluate('__gearState.latinum')==before_money-price
  assert page.locator('.mars-install-fx').evaluate('n=>getComputedStyle(n).pointerEvents')=='none'
  # Layout stays fixed and the animated banner leaves Lights/Close accessible.
  layouts=[]
  for w,h,mode in [(1920,1080,'widescreen'),(1366,768,'widescreen'),(800,600,'widescreen'),(390,844,'widescreen'),(900,1000,'classic')]:
   page.set_viewport_size({'width':w,'height':h});page.evaluate('mode=>document.body.dataset.view=mode',mode);reset();page.wait_for_timeout(120)
   page.locator('.mars-upgrade-choice[data-upgrade-card="hull"]').scroll_into_view_if_needed()
   bounds=page.locator('.mars-upgrade-choice[data-upgrade-card="hull"]').bounding_box();assert bounds,(w,h,mode)
   before=page.evaluate('nativeMarsUpgradeEffects.capture(__gearState,"hull")');buy('hull').click();check_receipt('hull',before)
   page.wait_for_timeout(300)
   actual_bounds=page.locator('.mars-upgrade-choice[data-upgrade-card="hull"]').bounding_box()
   assert all(abs(actual_bounds[key]-bounds[key])<=(3 if key in ['x','y'] else 1) for key in bounds),(bounds,actual_bounds)
   page.wait_for_timeout(250)
   layout=page.evaluate('''()=>{const fx=document.querySelector('.mars-install-fx'),root=document.querySelector('#shipyard-services'),b=fx.getBoundingClientRect(),r=root.getBoundingClientRect(),header=fx.querySelector('.mars-install-announcement'),hb=header.getBoundingClientRect(),actions=root.querySelector('.yard-header-actions').getBoundingClientRect(),fail=[];
     for(const n of header.querySelectorAll('strong,small,.mars-install-message>span,.mars-install-gain>span')){const range=document.createRange();range.selectNodeContents(n);const a=range.getBoundingClientRect();if(a.left<hb.left-1||a.right>hb.right+1||a.top<hb.top-1||a.bottom>hb.bottom+1)fail.push({text:n.textContent,bounds:[a.x,a.y,a.width,a.height],header:[hb.x,hb.y,hb.width,hb.height],scroll:[n.clientWidth,n.scrollWidth,n.clientHeight,n.scrollHeight]});}
     const control=root.querySelector('[data-yard-action="close"]'),cb=control.getBoundingClientRect(),hit=document.elementFromPoint(cb.x+cb.width/2,cb.y+cb.height/2);
     return {fails:fail,aligned:Math.abs(b.left-r.left)<1&&Math.abs(b.top-r.top)<1&&Math.abs(b.width-r.width)<1&&Math.abs(b.height-r.height)<1,clear:hb.right<=actions.left+1,closeAccessible:control===hit||control.contains(hit)};}''')
   assert not layout['fails'] and layout['aligned'] and layout['clear'] and layout['closeAccessible'],(w,h,mode,layout)
   page.locator('.mars-install-fx').evaluate('n=>n.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=550;})')
   page.screenshot(path=str(OUT/f'install-{w}x{h}-{mode}.png'))
   layouts.append({'width':w,'height':h,'mode':mode})
  # Closing/navigation removes decorations immediately; timed cleanup is bounded.
  page.locator('[data-yard-action="close"]').click();assert page.locator('.mars-install-fx').count()==0
  assert page.locator('#shipyard-services').get_attribute('data-upgrade-installing') is None
  reset();buy('cargo').click();page.locator('[data-yard-tab="materials"]').click();assert page.locator('.mars-install-fx').count()==0
  page.locator('[data-yard-tab="upgrades"]').click()
  reset();buy('hull').click();page.locator('.mars-install-fx').wait_for(state='detached',timeout=6000)
  assert page.locator('[data-installed-upgrade]').count()==0
  # Reduced motion retains a clear static success receipt without moving effects.
  page.emulate_media(reduced_motion='reduce');reset();buy('hull').click()
  assert page.locator('.mars-install-announcement').is_visible()
  assert page.locator('.mars-install-fx').evaluate('n=>n.getAnimations({subtree:true}).length')==0
  assert page.locator('.mars-install-rings').evaluate('n=>getComputedStyle(n).display')=='none'
  page.screenshot(path=str(OUT/'reduced-motion.png'))
  page.locator('[data-yard-action="close"]').click();assert page.locator('.mars-install-fx').count()==0
  assert not report['errors'];report.update(passed=True,receipts=receipts,failedPurchaseHasNoSuccess=True,rerenderPreservesEffects=True,rapidPurchases=True,controlsRemainUsable=True,automaticCleanup=True,reducedMotion=True,layouts=layouts);browser.close()
finally:
 (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');server.shutdown();server.server_close()
print(json.dumps(report))
