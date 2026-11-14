"""Simple upgrade cards, clear material review, uncapped refits and durable purchases."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/mars-inline-upgrades';OUT.mkdir(parents=True,exist_ok=True)
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
  kinds=['cargo','hull','shield','engine','thrusters','drive','weapon','dot','utility']
  def card(kind):return page.locator(f'.mars-overview-card[data-upgrade-card="{kind}"]')
  def detail():return page.locator('.mars-upgrade-detail')
  def back():page.locator('.mars-detail-back').click()
  def review(kind):
   if not page.locator(f'[data-upgrade-detail="{kind}"]').count():
    if detail().count():back()
    card(kind).click()
   return detail()
  def buy(kind):return review(kind).locator('[data-yard-action="buy-upgrade"]')
  def snapshot():return page.evaluate('()=>JSON.parse(JSON.stringify(Object.fromEntries(["shipType","shipName","latinum","dilithium","minerals","shipRefit","shipThrusters","shipEquipment","inventoryLayout","hull","shields","shipyardLedger","weapons","weaponInventory","repairBay","miningTool"].map(k=>[k,__gearState[k]]))))')
  def check_tiers(scope,kind):
   q=page.evaluate('''kind=>{const q=kind==='thrusters'?nativeShipThrusters.quote(__gearState):nativeShipyardRefits.quote(__gearState,kind);return {level:q.level,max:q.max};}''',kind)
   meter=scope.locator('.mars-tier-meter');assert meter.get_attribute('data-tier-level')==str(q['level']) and meter.get_attribute('data-tier-max')==str(q['max'])
   assert meter.locator('.mars-tier-bar').count()==q['max'] and meter.locator('.mars-tier-bar.installed').count()==q['level']
   assert not meter.inner_text().strip()
   for bar in meter.locator('.installed').all():assert bar.evaluate('n=>{const c=getComputedStyle(n);return c.boxShadow!=="none"&&c.backgroundImage!=="none";}')
  def check_stats():
   expected=page.evaluate('''()=>{const d=nativeShipDefinitions.forEntity(__gearState);return {hull:d.hull,shield:d.shields,cargo:d.cargo,engine:d.speedOrOtherStationValue};}''')
   assert page.locator('.yard-vessel-title>.yard-build-stats').count()==1
   for key,value in expected.items():
    stat=page.locator(f'[data-ship-stat="{key}"]');assert stat.is_visible()
    assert abs(float(stat.locator('strong>b').inner_text().replace(',','').replace('t','').strip())-value)<.011
    assert stat.evaluate('''n=>{const b=n.getBoundingClientRect(),root=n.closest('.yard-vessel-title').getBoundingClientRect();return b.left>=root.left-1&&b.right<=root.right+1&&b.top>=root.top-1&&b.bottom<=root.bottom+1&&[...n.querySelectorAll('small,b,i')].every(t=>{const r=document.createRange();r.selectNodeContents(t);const a=r.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom;});}'''),(key,'ship summary clipped')
  assert page.locator('.mars-overview-card').count()==9
  assert page.locator('.yard-budget,[data-upgrade-cost],[data-yard-action="buy-upgrade"]').count()==0
  assert 'UPGRADE SPACE' not in page.locator('#shipyard-services').inner_text()
  page.wait_for_selector('#shipyard-services [data-ship-preview].ready');page.screenshot(path=str(OUT/'01-simple-overview.png'))
  # Opening/back only shows a quote; every named required/owned amount is exact.
  for kind in kinds:
   print('Reviewing '+kind,flush=True)
   check_tiers(card(kind),kind)
   expected=page.evaluate('''kind=>{const s=__gearState,q=kind==='thrusters'?nativeShipThrusters.quote(s):nativeShipyardRefits.quote(s,kind);return {level:q.level,max:q.max,price:q.price,materials:q.materials};}''',kind)
   original=snapshot();review(kind)
   assert detail().is_visible()
   check_tiers(detail(),kind);check_stats()
   assert detail().locator('.mars-resource-grid').count()==1
   for key,amount in {'latinum':expected['price'],**expected['materials']}.items():
    row=detail().locator(f'[data-upgrade-cost="{key}"]')
    held=page.evaluate('key=>key==="latinum"?__gearState.latinum:nativeRegionalMinerals.held(__gearState,key)',key)
    assert int(row.get_attribute('data-cost'))==amount and int(row.get_attribute('data-held'))==held
    assert int(row.locator('.mars-resource-need b').inner_text().replace(',',''))==amount
    assert int(row.locator('.mars-resource-have b').inner_text().replace(',',''))==held
    assert row.locator('.mars-resource-name strong').inner_text()
   assert 'points' not in detail().inner_text().lower() and 'upgrade space' not in detail().inner_text().lower()
   if kind in ['hull','shield','cargo','engine']:
    assert chr(8594) in page.locator(f'[data-ship-stat="{kind}"]').inner_text()
   if kind=='hull':
    page.screenshot(path=str(OUT/'02-hull-requirements.png'))
   back();assert snapshot()==original and page.locator('.mars-overview-card').count()==9
  # Shortages name the material and exact missing amount, rather than a tiny icon.
  page.evaluate('''()=>{Object.assign(__gearState,{latinum:1000,minerals:{...__gearState.minerals,tritanium:8,deuranium:2}});nativeShipyardServices.render();}''')
  review('hull');assert buy('hull').is_disabled()
  assert 'Need 6 more' in detail().locator('[data-upgrade-cost="tritanium"]').inner_text()
  assert 'Need 4 more' in detail().locator('[data-upgrade-cost="deuranium"]').inner_text()
  assert 'Need 1,400 more' in detail().locator('[data-upgrade-cost="latinum"]').inner_text()
  page.screenshot(path=str(OUT/'03-missing-materials.png'));back()
  page.evaluate('''()=>{const s=__gearState;s.latinum=1000000;s.dilithium=1000;s.minerals={tritanium:1000,deuranium:1000,trellium:1000,gallicite:1000,benamite:1000};s.hull=nativeShipDefinitions.forEntity(s).hull*.6;nativeShipyardServices.render();}''')
  # Hull + shield tiers alone exceed the former limit. Each keeps its own cap.
  for kind in ['hull','shield']:
   for tier in [1,2,3]:
    before=page.evaluate('''kind=>{const s=__gearState,q=nativeShipyardRefits.quote(s,kind);return {latinum:s.latinum,dilithium:s.dilithium,minerals:{...s.minerals},q,hull:s.hull,max:nativeShipDefinitions.forEntity(s).hull};}''',kind)
    buy(kind).click()
    after=page.evaluate('''kind=>{const s=__gearState;return {latinum:s.latinum,dilithium:s.dilithium,minerals:s.minerals,level:nativeShipyardRefits.level(s,kind),hull:s.hull,max:nativeShipDefinitions.forEntity(s).hull};}''',kind)
    assert after['level']==tier and after['latinum']==before['latinum']-before['q']['price']
    check_tiers(card(kind),kind)
    for key,value in before['q']['materials'].items():
     assert (after['dilithium'] if key=='dilithium' else after['minerals'][key])==(before['dilithium'] if key=='dilithium' else before['minerals'][key])-value
    assert abs(after['hull']/after['max']-before['hull']/before['max'])<1e-8
    assert page.locator('.mars-overview-card').count()==9 and page.locator('.mars-install-fx').count()==1
   assert buy(kind).is_disabled() and 'Fully upgraded' in buy(kind).inner_text();back()
  # Failed durable writes preserve all owned state and leave the review open.
  review('engine');original=snapshot()
  page.evaluate("()=>{window.__realWrite=nativeSaveStorage.write;window.nativeSaveStorage={...nativeSaveStorage,write:()=>({ok:false,error:'Test save failure'})};}")
  buy('engine').click();assert snapshot()==original and detail().count()==1
  assert 'Test save failure' in page.locator('.yard-note').inner_text() and page.locator('.mars-install-fx').count()==0
  page.evaluate('()=>window.nativeSaveStorage={...nativeSaveStorage,write:__realWrite}')
  buy('engine').click();assert page.evaluate('nativeShipyardRefits.level(__gearState,"engine")')==1
  # Default bay placement and continuation retain identities and all bought tiers.
  before=page.evaluate('()=>nativeShipEquipment.capacities(__gearState).ability')
  buy('utility').click();assert page.evaluate('()=>nativeShipEquipment.capacities(__gearState).ability')==before+1
  assert page.evaluate('()=>__gearState.shipEquipment.slots.ability.at(-1)') is None
  saved=page.evaluate('''()=>{const s=__gearState;if(!nativeSaveStorage.write(s).ok)throw Error('Save failed');const value=JSON.stringify({levels:s.shipRefit.levels,gear:s.shipEquipment,latinum:s.latinum});resumeNativeGame('normal');return value;}''')
  page.wait_for_function('()=>nativeShipyardServices.active&&nativeShipyardServices.docked')
  assert page.evaluate('()=>JSON.stringify({levels:__gearState.shipRefit.levels,gear:__gearState.shipEquipment,latinum:__gearState.latinum})')==saved
  page.evaluate('''()=>{__gearState.latinum=0;nativeShipyardServices.render();}''')
  layouts=[]
  for w,h,mode in [(1920,1080,'widescreen'),(1366,768,'widescreen'),(800,650,'widescreen'),(800,600,'widescreen'),(390,844,'widescreen'),(900,1000,'classic'),(1280,720,'classic')]:
   if detail().count():back()
   page.set_viewport_size({'width':w,'height':h});page.evaluate('mode=>document.body.dataset.view=mode',mode);page.wait_for_timeout(300)
   check_stats()
   assert page.locator('.mars-overview-card').count()==9
   for kind in kinds:
    check_tiers(card(kind),kind)
    failures=card(kind).evaluate('''card=>{const b=card.getBoundingClientRect(),fail=[];for(const n of card.querySelectorAll('strong,.mars-overview-change,.mars-overview-footer')){const a=n.getBoundingClientRect();if(a.left<b.left-1||a.right>b.right+1||a.top<b.top-1||a.bottom>b.bottom+1||n.scrollWidth>n.clientWidth+1)fail.push(n.textContent);}return fail;}''')
    assert not failures,(w,h,mode,kind,failures)
   page.screenshot(path=str(OUT/f'overview-{w}x{h}-{mode}.png'))
   review('weapon');assert buy('weapon').is_disabled()
   for key in ['latinum','tritanium','dilithium','gallicite']:
    row=detail().locator(f'[data-upgrade-cost="{key}"]')
    assert row.locator('.mars-resource-name strong').is_visible()
   assert detail().evaluate('n=>n.scrollHeight<=n.clientHeight+1'),(w,h,mode,'review overflow')
   page.screenshot(path=str(OUT/f'requirements-{w}x{h}-{mode}.png'))
   back();layouts.append({'width':w,'height':h,'mode':mode})
  page.emulate_media(reduced_motion='reduce');review('engine')
  assert detail().evaluate('n=>n.getAnimations({subtree:true}).length')==0
  back();assert not report['errors'];report.update(passed=True,simpleOverview=True,installedTierBars=True,allFourStatsVisible=True,cargoAndSpeedPreviews=True,clearRequiredAndOwned=True,exactShortages=True,pointLimitRemoved=True,tierCapsRetained=True,exactCharges=True,damagePreserved=True,saveRollback=True,baysAndContinue=True,layouts=layouts);browser.close()
finally:
 (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');server.shutdown();server.server_close()
print(json.dumps(report))
