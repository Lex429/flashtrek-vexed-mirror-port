"""Simple upgrade cards, clear material review, uncapped refits and durable purchases."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/mars-material-clarity';OUT.mkdir(parents=True,exist_ok=True)
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
  def open_review(kind):
   if page.locator('.mars-upgrade-detail').count():page.locator('.mars-detail-back').click()
   page.locator(f'.mars-overview-card[data-upgrade-card="{kind}"]').click()
   page.wait_for_timeout(500)
  def geometry():return page.evaluate('''()=>{
    const root=document.querySelector('#shipyard-services'),fail=[];
    const targets=root.querySelectorAll('.mars-overview-card,.mars-resource-tile,.mars-detail-heading,.mars-detail-change,.mars-detail-actions,.inventory-slot,[data-hull-system]');
    for(const n of targets){
      const b=n.getBoundingClientRect();
      for(let p=n.parentElement;p;p=p.parentElement){const a=p.getBoundingClientRect(),c=getComputedStyle(p),l=a.left+p.clientLeft,t=a.top+p.clientTop;
        if(c.overflowX!=='visible'&&(b.left<l-1||b.right>l+p.clientWidth+1)||c.overflowY!=='visible'&&(b.top<t-1||b.bottom>t+p.clientHeight+1))fail.push({node:n.className,parent:p.className||p.id,why:'clipped',bounds:[b.x,b.y,b.width,b.height],parentBounds:[l,t,p.clientWidth,p.clientHeight]});
        if(p===root)break;
      }
    }
    for(const n of root.querySelectorAll('.mars-resource-tile')){const b=n.getBoundingClientRect();for(const text of n.querySelectorAll('strong,small,b')){const range=document.createRange();range.selectNodeContents(text);const a=range.getBoundingClientRect();if(a.left<b.left-1||a.right>b.right+1||a.top<b.top-1||a.bottom>b.bottom+1)fail.push({text:text.textContent,tile:n.dataset.upgradeCost,why:'text cut off',bounds:[a.x,a.y,a.width,a.height],tileBounds:[b.x,b.y,b.width,b.height]});}}
    for(const n of root.querySelectorAll('main,.yard-workspace,.yard-vessel,.yard-catalog,.mars-upgrade-detail,.mars-resource-grid')){const c=getComputedStyle(n);if(['auto','scroll'].includes(c.overflowY)&&n.scrollHeight>n.clientHeight+1||['auto','scroll'].includes(c.overflowX)&&n.scrollWidth>n.clientWidth+1)fail.push({node:n.className||n.tagName,why:'scrollable',height:[n.clientHeight,n.scrollHeight],width:[n.clientWidth,n.scrollWidth]});}
    return fail;
  }''')
  cases=[]
  for w,h,mode in [(1920,1080,'widescreen'),(1440,1000,'widescreen'),(1366,768,'widescreen'),(800,650,'widescreen'),(800,600,'widescreen'),(390,844,'widescreen'),(900,1000,'classic'),(1280,720,'classic')]:
   if page.locator('.mars-upgrade-detail').count():page.locator('.mars-detail-back').click()
   page.set_viewport_size({'width':w,'height':h});page.evaluate('mode=>document.body.dataset.view=mode',mode);page.wait_for_timeout(400)
   failures=geometry()
   if failures:page.screenshot(path=str(OUT/f'FAIL-overview-{w}x{h}-{mode}.png'))
   assert not failures,(w,h,mode,'overview',failures)
   page.evaluate('''()=>{Object.assign(__gearState,{latinum:1000,dilithium:14,minerals:{...__gearState.minerals,tritanium:40,gallicite:2}});nativeShipyardServices.render();}''')
   open_review('weapon')
   tiles=page.locator('.mars-resource-tile');assert tiles.count()==4
   for key,ready in [('latinum',False),('tritanium',True),('dilithium',True),('gallicite',False)]:
    tile=page.locator(f'[data-upgrade-cost="{key}"]');held=int(tile.get_attribute('data-held'));cost=int(tile.get_attribute('data-cost'))
    assert tile.locator('.mars-resource-have small').inner_text()=='HAVE' and tile.locator('.mars-resource-need small').inner_text()=='NEED'
    assert int(tile.locator('.mars-resource-have b').inner_text().replace(',',''))==held
    assert int(tile.locator('.mars-resource-need b').inner_text().replace(',',''))==cost
    assert ('ready' in tile.get_attribute('class').split())==ready
    shadow=tile.evaluate('n=>getComputedStyle(n).boxShadow')
    if ready:assert shadow!='none' and 'YOU HAVE IT' in tile.inner_text() and tile.locator('.mars-resource-shortage').count()==0
    else:
     assert shadow=='none' and f'Need {cost-held:,} more' in tile.inner_text()
     assert tile.locator('.mars-resource-shortage').evaluate('n=>n.getAnimations().some(a=>a.playState==="running")')
   assert page.locator('.mars-detail-buy').is_disabled()
   failures=geometry()
   page.screenshot(path=str(OUT/f'requirements-{w}x{h}-{mode}.png'))
   assert not failures,(w,h,mode,'review',failures)
   scroll_before=page.locator('.yard-catalog').evaluate('n=>n.scrollTop');page.locator('.yard-catalog').hover();page.mouse.wheel(0,650);page.wait_for_timeout(120)
   assert page.locator('.yard-catalog').evaluate('n=>n.scrollTop')==scroll_before==0
   cases.append({'width':w,'height':h,'mode':mode})
  # Installed tiers add a remove control; large stock values must still fit.
  page.set_viewport_size({'width':390,'height':844});page.evaluate('''()=>{document.body.dataset.view='widescreen';const s=__gearState;s.shipRefit={version:1,hullType:s.shipType,levels:{weapon:1}};s.latinum=1000000;s.minerals.tritanium=1000000;s.dilithium=28;nativeShipEquipment.ensure(s);nativeShipSystems.invalidate(s);nativeShipyardServices.render();}''');page.wait_for_timeout(500)
  failures=geometry();page.screenshot(path=str(OUT/'phone-installed-tier.png'));assert not failures,('installed tier',failures)
  assert page.locator('.mars-detail-remove').is_visible()
  page.emulate_media(reduced_motion='reduce');open_review('weapon')
  assert page.locator('.mars-resource-shortage').first.evaluate('n=>n.getAnimations().length')==0
  assert page.locator('.mars-resource-tile.ready').first.evaluate('n=>getComputedStyle(n).boxShadow')!='none'
  assert not report['errors'];report.update(passed=True,noScrolling=True,allMaterialsVisible=True,explicitHaveNeed=True,readyGlows=True,exactEnoughGlows=True,onlyShortagePulses=True,reducedMotion=True,cases=cases);browser.close()
finally:
 (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');server.shutdown();server.server_close()
print(json.dumps(report))
