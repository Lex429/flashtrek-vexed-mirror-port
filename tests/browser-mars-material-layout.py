"""Material tile clipping, shared baselines, large stocks and short-window layouts."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/mars-material-layout';OUT.mkdir(parents=True,exist_ok=True)
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
  sizes=[(2560,1389,'widescreen'),(1920,936,'widescreen'),(1366,768,'widescreen'),(1280,720,'widescreen'),(1280,600,'widescreen'),(1366,600,'widescreen'),(1024,600,'widescreen'),(960,540,'widescreen'),(1440,700,'classic'),(390,844,'widescreen')]
  for w,h,mode in sizes:
   if page.locator('.mars-upgrade-detail').count():page.locator('.mars-detail-back').click()
   page.set_viewport_size({'width':w,'height':h});page.evaluate('''mode=>{document.body.dataset.view=mode;Object.assign(__gearState,{latinum:1234567890123,dilithium:1000000000,minerals:{...__gearState.minerals,tritanium:1234567890,gallicite:2}});nativeShipyardServices.render();}''',mode)
   for kind in ['cargo','weapon','hull','thrusters']:
    open_review(kind)
    failures=geometry()
    alignment=page.evaluate('''()=>[...document.querySelectorAll('.mars-resource-tile')].map(t=>{const b=t.getBoundingClientRect(),have=t.querySelector('.mars-resource-have b'),need=t.querySelector('.mars-resource-need b');return {top:b.top,width:b.width,font:parseFloat(getComputedStyle(have).fontSize),have:have.getBoundingClientRect().bottom-b.top,need:need.getBoundingClientRect().bottom-b.top};})''')
    if alignment:
     assert min(t['font'] for t in alignment)>=12,(w,h,mode,kind,alignment)
     assert max(t['font'] for t in alignment)-min(t['font'] for t in alignment)<.1,alignment
     assert max(t['have'] for t in alignment)-min(t['have'] for t in alignment)<1.1,(w,h,mode,kind,alignment)
     assert all(abs(t['have']-t['need'])<.1 for t in alignment),alignment
     assert max(t['width'] for t in alignment)-min(t['width'] for t in alignment)<1,(w,h,mode,kind,alignment)
    for tile in page.locator('.mars-resource-tile').all():
     assert tile.evaluate('''t=>{const b=t.getBoundingClientRect(),parts=[...t.children].filter(n=>!n.classList.contains('mars-resource-meter')).map(n=>n.getBoundingClientRect());return b.height<=191&&parts.every(p=>p.left>=b.left+2&&p.right<=b.right-2&&p.top>=b.top+2&&p.bottom<=b.bottom-2)&&parts.every((p,i)=>!i||p.top>=parts[i-1].bottom-1);}'''),(w,h,mode,kind,'card content escapes or overlaps')
     assert tile.evaluate('''t=>[...t.querySelectorAll('.mars-resource-have b,.mars-resource-need b')].every(n=>{const r=document.createRange();r.selectNodeContents(n);const text=r.getBoundingClientRect(),column=n.parentElement.getBoundingClientRect();return text.left>=column.left-1&&text.right<=column.right+1;})'''),(w,h,mode,kind,'numbers overlap their columns')
     full=tile.locator('.mars-resource-have b').get_attribute('data-full-amount')
     assert tile.locator('.mars-resource-have b').get_attribute('title')==full
     assert full in tile.get_attribute('aria-label')
     assert int(tile.locator('.mars-resource-need b').inner_text().replace(',',''))==int(tile.get_attribute('data-cost'))
    page.screenshot(path=str(OUT/f'{kind}-{w}x{h}-{mode}.png'))
    assert not failures,(w,h,mode,kind,failures)
    cases.append({'width':w,'height':h,'mode':mode,'kind':kind})
  # The reported Dev cargo values must stay together inside the same cards.
  page.locator('.mars-detail-back').click();page.set_viewport_size({'width':1366,'height':768})
  page.evaluate('''()=>{const s=__gearState;s.latinum=1000000000;s.minerals.tritanium=25;s.minerals.deuranium=25;document.body.dataset.view='widescreen';nativeShipyardServices.render();}''')
  open_review('cargo');assert not geometry()
  for key,held,cost in [('latinum',1000000000,1600),('tritanium',25,8),('deuranium',25,4)]:
   tile=page.locator(f'[data-upgrade-cost="{key}"]');assert tile.get_attribute('data-held')==str(held) and tile.get_attribute('data-cost')==str(cost)
   assert tile.locator('.mars-resource-have b').inner_text()==('1B' if key=='latinum' else str(held))
   assert 'YOU HAVE IT' in tile.inner_text()
  page.screenshot(path=str(OUT/'reported-cargo-values.png'))
  page.locator('.mars-detail-back').click();page.locator('.mars-overview-card[data-upgrade-card="cargo"]').click()
  assert page.locator('.mars-resource-tile').first.evaluate('''n=>n.getAnimations({subtree:true}).some(a=>a.animationName==='mars-material-card-sweep')''')
  assert page.locator('.mars-resource-tile').first.evaluate('''n=>n.getAnimations({subtree:true}).some(a=>a.animationName==='mars-material-ready-breathe')''')
  page.emulate_media(reduced_motion='reduce')
  assert page.locator('.mars-resource-tile').first.evaluate('''n=>!n.getAnimations({subtree:true}).some(a=>a.animationName?.startsWith('mars-material-'))''')
  assert not report['errors'];report.update(passed=True,cases=cases,allCountsFit=True,baselinesAligned=True,uniformTileSizes=True,readableNumbers=True,exactStockAvailable=True,reportedValues=True,containedAnimations=True,reducedMotion=True,noScrolling=True);browser.close()
finally:
 (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');server.shutdown();server.server_close()
print(json.dumps({'passed':report['passed'],'cases':len(report.get('cases',[])),'errors':report['errors']}))
