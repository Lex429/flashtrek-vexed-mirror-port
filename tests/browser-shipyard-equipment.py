"""Shared Inventory equipment controls at Mars: inspection, repair, drag, fit and Continue."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/shipyard-equipment';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
report={'passed':False,'errors':[]}
def check_layout(page):
    cases=[]
    # Long fitted names and OFFLINE badges need more room than an empty bay.
    for hull in [7,58,436]:
        page.evaluate('''hull=>{const s=__gearState;s.shipType=hull;delete s.shipRefit;
          const eq=nativeShipEquipment.ensure(s);
          for(const [kind,model] of [['engineering','advanced-engine'],['shield','fed-adaptive']]){
            const item=eq.instances[eq.slots[kind][0]];if(item){item.modelId=model;item.condition=0;}
          }
          nativeShipSystems.invalidate(s);nativeShipyardServices.render();}''',hull)
        for w,h,mode in [(1366,768,'widescreen'),(960,540,'widescreen'),(800,650,'widescreen'),(800,600,'widescreen'),(390,844,'widescreen'),(900,1000,'classic'),(1280,720,'classic')]:
            page.set_viewport_size({'width':w,'height':h})
            page.evaluate('mode=>document.body.dataset.view=mode',mode)
            page.wait_for_timeout(350)
            previous=page.locator('#shipyard-services [data-bay-page="previous"]')
            while previous.count() and previous.is_enabled():previous.click()
            visited=[];seen=set()
            for number in range(30):
                page.wait_for_timeout(120)
                result=page.evaluate('''()=>{
                  const root=document.querySelector('#shipyard-services'),fail=[],keys=[],summary=root.querySelector('.yard-build-stats').getBoundingClientRect();
                  for(const card of root.querySelectorAll('.inventory-slot,[data-hull-system]')){
                    const b=card.getBoundingClientRect(),key=card.dataset.bayKey||card.dataset.hullSystem;
                    if(b.right>summary.left&&b.left<summary.right&&b.bottom>summary.top&&b.top<summary.bottom)fail.push({key,reason:'equipment overlaps ship strength summary'});
                    if(card.dataset.bayKey)keys.push(key);
                    const nodes=[card.firstElementChild,...card.querySelectorAll('strong,small,svg,img,.outfit-device-condition,.inventory-hull-system-label,.inventory-dot-caption,.inventory-dot-number,.inventory-dot-health')];
                    for(const n of nodes){
                      if(!n||!n.getClientRects().length)continue;
                      const a=n.getBoundingClientRect();
                      if(a.left<b.left-1||a.right>b.right+1||a.top<b.top-1||a.bottom>b.bottom+1||n.scrollHeight>n.clientHeight+1||n.scrollWidth>n.clientWidth+1)
                        fail.push({key,text:n.textContent.trim(),reason:'card content clipped'});
                    }
                    for(let parent=card.parentElement;parent;parent=parent.parentElement){
                      const a=parent.getBoundingClientRect(),css=getComputedStyle(parent),left=a.left+parent.clientLeft,top=a.top+parent.clientTop;
                      if(css.overflowX!=='visible'&&(b.left<left-1||b.right>left+parent.clientWidth+1)||css.overflowY!=='visible'&&(b.top<top-1||b.bottom>top+parent.clientHeight+1))
                        fail.push({key,ancestor:parent.className||parent.id,reason:'card clipped by ancestor'});
                      if(parent===root)break;
                    }
                  }
                  return {fails:fail,keys,pages:root.querySelector('.inventory-bay-pages')?.textContent.trim()};
                }''')
                seen.update(result.pop('keys'));visited.append(result)
                assert not result['fails'],(hull,w,h,mode,number,result)
                if hull==7 and number==1:page.screenshot(path=str(OUT/f'layout-{w}x{h}-{mode}.png'))
                nxt=page.locator('#shipyard-services [data-bay-page="next"]')
                if not nxt.count() or nxt.is_disabled():break
                nxt.click()
            expected=set(page.evaluate('()=>nativeShipEquipment.bayLayout(__gearState).bays.map(b=>b.key)'))
            assert seen==expected,{'hull':hull,'missing':list(expected-seen)}
            cases.append({'hull':hull,'width':w,'height':h,'mode':mode,'pages':visited})
    return cases
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1440,'height':1000},has_touch=True);page.set_default_timeout(20000)
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('''()=>{startNativeDevGame();const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));Object.assign(s,{devMode:false,captain:'Equipment Test',shipName:'USS Consistency',shipType:7,system:1,localBody:5,localBodySystem:1,x:230,y:-45,angle:-Math.PI/2,speed:0,vx:0,vy:0,latinum:200000,dilithium:100,deuranium:0,phase:'flight',landed:false,vitalsVersion:2,weapons:[1],weaponInventory:[],solFreightHold:{},localContracts:[],minerals:{tritanium:100,deuranium:40,trellium:100,gallicite:100,benamite:20}});for(const key of ['shipEquipment','weaponLoadout','repairBay','inventoryLayout','shipRefit','shieldResponse','shipyardDock','arrivalApproach','localCruise','pendingTransit','devRepairDemo'])delete s[key];nativeShipEquipment.ensure(s);const d=nativeShipDefinitions.forEntity(s);s.hull=d.hull;s.shields=d.shields;const shots=nativeCombatShots;window.nativeCombatShots=Object.create(shots,{restore:{value:function(state,...args){window.__gearState=state;return shots.restore(state,...args);}}});if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');nativeShipyardServices.select();}''')
  page.locator('[data-yard-action="dock"]').click();page.wait_for_function('()=>nativeShipyardServices.docked&&nativeShipyardServices.active',timeout=90000)
  def slot(root,kind,index):return page.locator(f'{root} [data-equipment-place="slot"][data-equipment-kind="{kind}"][data-equipment-index="{index}"]')
  def reveal(root,selector):
   for _ in range(35):
    if page.locator(root+' '+selector).count() and page.locator(root+' '+selector).first.is_visible():return
    nxt=page.locator(root+' [data-bay-page="next"]');prev=page.locator(root+' [data-bay-page="previous"]')
    if nxt.count() and nxt.is_enabled():nxt.click()
    else:
     while prev.count() and prev.is_enabled():prev.click()
   raise AssertionError('Missing equipment '+selector)
  for tab in ['upgrades','weapons','shields','materials','build']:
   page.locator(f'[data-yard-tab="{tab}"]').click();assert slot('#shipyard-services','weapon',0).is_visible();assert page.locator('#shipyard-services [data-hull-system]').is_visible();assert page.locator('[data-yard-action="toggle-layout"]').count()==0
  page.locator('[data-yard-tab="upgrades"]').click()
  page.evaluate('''()=>{const s=__gearState,eq=nativeShipEquipment.ensure(s);eq.instances[eq.slots.engineering[0]].condition=50;nativeShipSystems.invalidate(s);nativeShipyardServices.render();}''')
  parity=[]
  for kind,index in [('weapon',0),('engineering',0),('shield',0),('repairDrone',0),('hull',0)]:
   if kind=='hull':page.locator('#shipyard-services [data-hull-system]').click()
   else:
    reveal('#shipyard-services',f'[data-equipment-kind="{kind}"][data-equipment-index="{index}"]');slot('#shipyard-services',kind,index).click()
   actual=page.locator('#shipyard-services .inventory-inspector').inner_text()
   page.locator('[data-yard-action="close"]').click();page.evaluate('nativeShipInventory.open()');page.wait_for_selector('#ship-inventory canvas.ready')
   if kind=='hull':page.locator('#ship-inventory [data-hull-system]').click()
   else:
    reveal('#ship-inventory',f'[data-equipment-kind="{kind}"][data-equipment-index="{index}"]');slot('#ship-inventory',kind,index).click()
   expected=page.locator('#ship-inventory .inventory-inspector').inner_text();assert actual==expected,(kind,actual,expected);parity.append(kind)
   page.locator('.inventory-close').click();page.evaluate('nativeShipyardServices.select()')
  reveal('#shipyard-services','[data-equipment-kind="engineering"][data-equipment-index="0"]');slot('#shipyard-services','engineering',0).click()
  quote=page.evaluate('''()=>{const s=__gearState,id=s.shipEquipment.slots.engineering[0],q=nativeShipRepairs.deviceRepairQuote(s,id);return {id,cost:q.cost,currency:q.currency,held:q.held};}''')
  page.locator('#shipyard-services [data-repair-device]').click();assert page.evaluate('(q)=>nativeShipEquipment.condition(__gearState.shipEquipment.instances[q.id])',quote)==100
  assert page.evaluate('(q)=>nativeRegionalMinerals.held(__gearState,q.currency)',quote)==quote['held']-quote['cost']
  page.locator('#shipyard-services [data-equipment-action="cancel"]').click();reveal('#shipyard-services','[data-equipment-kind="weapon"][data-equipment-index="0"]');slot('#shipyard-services','weapon',0).click()
  weapon=page.evaluate('__gearState.shipEquipment.slots.weapon[0]');page.locator('#shipyard-services [data-equipment-action="unequip"]').click();assert page.evaluate('__gearState.shipEquipment.slots.weapon[0]') is None
  page.locator('[data-yard-tab="build"]').click();page.locator(f'#shipyard-services [data-inventory-cell][data-item-key="equipment:{weapon}"]').click();page.locator('#shipyard-services [data-fit-slot]').select_option('1');page.locator('#shipyard-services [data-equipment-action="equip"]').click();assert page.evaluate('__gearState.shipEquipment.slots.weapon[1]')==weapon
  reveal('#shipyard-services','[data-equipment-kind="weapon"][data-equipment-index="2"]');slot('#shipyard-services','weapon',1).drag_to(slot('#shipyard-services','weapon',2));assert page.evaluate('__gearState.shipEquipment.slots.weapon[2]')==weapon
  before=page.evaluate('JSON.stringify(__gearState.shipEquipment)');reveal('#shipyard-services','[data-equipment-kind="engineering"][data-equipment-index="0"]');slot('#shipyard-services','engineering',0).drag_to(slot('#shipyard-services','weapon',1));assert page.evaluate('JSON.stringify(__gearState.shipEquipment)')==before
  page.locator('[data-yard-tab="weapons"]').click();page.locator('[data-yard-action="buy"][data-model="1002"]').click();second=page.evaluate('()=>__gearState.shipEquipment.locker.find(id=>String(__gearState.shipEquipment.instances[id].modelId)==="1002")');assert second
  page.locator('[data-yard-tab="build"]').click();page.locator(f'#shipyard-services [data-inventory-cell][data-item-key="equipment:{second}"]').click();page.locator('#shipyard-services [data-fit-slot]').select_option('0');page.locator('#shipyard-services [data-equipment-action="equip"]').click();assert page.evaluate('__gearState.shipEquipment.slots.weapon[0]')==second
  reveal('#shipyard-services','[data-equipment-kind="weapon"][data-equipment-index="2"]');slot('#shipyard-services','weapon',2).drag_to(slot('#shipyard-services','weapon',0));assert page.evaluate('__gearState.shipEquipment.slots.weapon[0]')==weapon and page.evaluate('__gearState.shipEquipment.slots.weapon[2]')==second
  source=slot('#shipyard-services','weapon',0).bounding_box();target=slot('#shipyard-services','weapon',1).bounding_box();assert source and target
  start={'x':source['x']+source['width']/2,'y':source['y']+source['height']/2,'id':1};end={'x':target['x']+target['width']/2,'y':target['y']+target['height']/2,'id':1};touch=page.context.new_cdp_session(page)
  touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[start]})
  for step in range(1,6):
   point={**start,'x':start['x']+(end['x']-start['x'])*step/5,'y':start['y']+(end['y']-start['y'])*step/5};touch.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[point]});page.wait_for_timeout(35)
  touch.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});touch.detach();assert page.evaluate('__gearState.shipEquipment.slots.weapon[1]')==weapon and page.evaluate('__gearState.shipEquipment.slots.weapon[0]') is None
  page.screenshot(path=str(OUT/'shared-equipment.png'));saved=page.evaluate('''()=>{const s=__gearState,result=nativeSaveStorage.write(s);if(!result.ok)throw Error(result.error);const resultState={equipment:JSON.stringify(s.shipEquipment),layout:JSON.stringify(s.inventoryLayout),latinum:s.latinum};resumeNativeGame('normal');return resultState;}''')
  page.wait_for_function('()=>nativeShipyardServices.docked&&nativeShipyardServices.active');assert page.evaluate('JSON.stringify(__gearState.shipEquipment)')==saved['equipment'];assert page.evaluate('JSON.stringify(__gearState.inventoryLayout)')==saved['layout'];assert page.evaluate('__gearState.latinum')==saved['latinum']
  report['layoutCases']=check_layout(page)
  assert not report['errors'];report.update(passed=True,inspectorParity=parity,alwaysVisible=True,repairUsesInventoryOwner=True,unequipRefit=True,dragMoveAndSwap=True,touchDrag=True,invalidTypeRejected=True,continuePreservesGear=True);browser.close()
finally:
 (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');server.shutdown();server.server_close()
print(json.dumps(report))
