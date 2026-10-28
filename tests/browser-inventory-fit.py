"""Inventory fits Dev and normal stock without scrolling, clipping or tiny tiles."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/inventory-fit';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();errors=[]
CHECK=r'''() => {
 const root=document.querySelector('#ship-inventory'),visible=n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden';
 const panels=[root,...root.querySelectorAll('.inventory-panel,.inventory-body,.inventory-loadout,.outfit-loadout,.inventory-rig,.inventory-weapons,.inventory-systems,.inventory-cargo,.inventory-grid,.inventory-items-page,.inventory-deliveries-page,.inventory-inspector')].filter(visible);
 const overflow=panels.filter(n=>n.scrollHeight>n.clientHeight+2||n.scrollWidth>n.clientWidth+2).map(n=>({name:n.className||n.id,w:n.clientWidth,sw:n.scrollWidth,h:n.clientHeight,sh:n.scrollHeight}));
 const clipped=[];for(const n of root.querySelectorAll('button,select,.inventory-ship-label'))if(visible(n)){
   const b=n.getBoundingClientRect();if(b.left< -1||b.top< -1||b.right>innerWidth+1||b.bottom>innerHeight+1)clipped.push({name:n.getAttribute('aria-label')||n.textContent,box:{x:b.x,y:b.y,w:b.width,h:b.height}});
 }
 const tiles=[...root.querySelectorAll('[data-inventory-cell]')].filter(visible).map(n=>({w:n.clientWidth,h:n.clientHeight,icon:n.querySelector('.inventory-item-icon')?.getBoundingClientRect().height||0}));
 return {view:root.dataset.view,details:root.dataset.details,overflow,clipped,tiles,scrolls:panels.map(n=>n.scrollTop)};
}'''
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(e.stack))
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('()=>{startNativeDevGame();window.__fitState=nativeNpcDev.getState();nativeShipEquipment.changeHull(__fitState,58);__fitState.shipName="ISS Inventory Fit";__fitState.localContracts=[{id:91001,from:3,to:4,good:0,tons:3.75,pay:120},{id:91002,from:3,to:5,good:2,tons:4.5,pay:150}];}')
  page.locator('#inventoryBtn').click();page.wait_for_selector('#ship-inventory canvas.ready');rows=[]
  for mode in ['dev','normal']:
   page.evaluate('mode=>{__fitState.devMode=mode==="dev";nativeShipInventory.refresh();}',mode)
   for width,height in [(1440,1000),(1366,768),(1280,720),(1024,768),(800,600),(390,844),(360,740),(320,568)]:
    page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(300)
    for view in ['loadout','cargo']:
     if width<=760:page.locator(f'[data-inventory-view="{view}"]').click();page.wait_for_timeout(150)
     result=page.evaluate(CHECK);result.update(mode=mode,width=width,height=height)
     assert not result['overflow'] and not result['clipped'],result
     for tile in result['tiles']:assert tile['w']>=86 and tile['h']>=88,(result,tile)
     page.mouse.move(width/2,height/2);page.mouse.wheel(0,1200);page.wait_for_timeout(30)
     assert page.evaluate(CHECK)['scrolls']==result['scrolls'],'Wheel moved inventory'
     if mode=='dev':page.screenshot(path=str(OUT/f'{mode}-{view}-{width}.png'))
     rows.append(result)
     if width>760:break
    # Contracts use pages too, rather than hiding a second delivery below a fold.
    if width<=760:page.locator('[data-inventory-view="cargo"]').click()
    page.locator('[data-right-page="deliveries"]').click();page.wait_for_timeout(150)
    if page.locator('[data-delivery-page="previous"]').count():
     while not page.locator('[data-delivery-page="previous"]').is_disabled():page.locator('[data-delivery-page="previous"]').click()
    result=page.evaluate(CHECK);assert not result['overflow'] and not result['clipped'],{'deliveries':result,'width':width,'height':height}
    destinations=set(page.locator('.inventory-contract-destination').all_inner_texts())
    if page.locator('[data-delivery-page="next"]').count():
     page.locator('[data-delivery-page="next"]').click();destinations.update(page.locator('.inventory-contract-destination').all_inner_texts())
    assert len(destinations)==2
    page.locator('[data-right-page="inventory"]').click()
    # A selected installed item exposes all its controls without a scroll area.
    if width<=760:page.locator('[data-inventory-view="loadout"]').click();page.wait_for_timeout(150)
    page.locator('[data-equipment-place="slot"][data-item-key]:not([data-item-key=""])').first.click();page.wait_for_timeout(150)
    result=page.evaluate(CHECK);assert not result['overflow'] and not result['clipped'],{'selection':result,'width':width,'height':height}
    assert page.locator('[data-equipment-action="cancel"]').is_visible();page.locator('[data-equipment-action="cancel"]').click();page.wait_for_timeout(150)
    # Every fitted bay remains reachable through actual page buttons.
    seen=set()
    if page.locator('[data-bay-page="previous"]').is_visible():
     while not page.locator('[data-bay-page="previous"]').is_disabled():page.locator('[data-bay-page="previous"]').click()
    while True:
     seen.update(page.locator('[data-bay-key]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.bayKey)'))
     if not page.locator('[data-bay-page="next"]').is_visible() or page.locator('[data-bay-page="next"]').is_disabled():break
     page.locator('[data-bay-page="next"]').click();page.wait_for_timeout(100)
    expected=page.evaluate('nativeShipEquipment.bayLayout(__fitState).bays.map(b=>b.key)');assert set(expected)<=seen,(expected,seen)
  assert not errors,errors
  report={'passed':True,'cases':len(rows),'noScrolling':True,'noClippedControls':True,'largeTiles':True,'allBaysReachable':True,'errors':errors}
  (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report));browser.close()
finally:server.shutdown();server.server_close()
