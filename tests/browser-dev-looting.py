"""Actual Dev menu: nearby disabled ships, live DOTs, looting and Continue."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/dev-looting';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();report={'passed':False,'errors':[]}
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>nativeNpcDev.getState()?.devLootDemo?.ships.length===3',timeout=30000)
  initial=page.evaluate('''()=>{const s=nativeNpcDev.getState();return {population:s.civilianTraffic.ships.length,playerFood:s.solFreightHold[5]||0,ships:s.devLootDemo.ships.map(r=>{const e=nativeNpcLives.find(s,r.id);return {id:e.id,name:e.name,phase:e.phase,hull:e.hull,shields:e.shields,cargo:e.cargo?.tons,distance:Math.hypot(e.x-s.x,e.y-s.y),fitting:Object.keys(e.shipEquipment.instances)};})};}''')
  assert initial['population']==1200 and len(initial['ships'])==3,initial
  assert all(e['phase']=='disabled' and e['shields']==0 and e['cargo']>0 for e in initial['ships']),initial
  assert initial['ships'][0]['distance']<=350,initial
  report['initial']=initial
  page.wait_for_function('()=>!nativeMenuTransition.snapshot().active&&document.querySelector("#modal").hidden',timeout=30000)
  page.wait_for_function('()=>document.querySelector("#space").getBoundingClientRect().width>1000',timeout=30000)
  page.wait_for_function('()=>{const s=nativeNpcDev.getState(),id=s.devLootDemo.ships[0].id;return nativeShipRepairs.drones(s,1).some(d=>d.entity.carrier.id===id);}',timeout=20000)
  page.evaluate('''async()=>{const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,s.devLootDemo.ships[0].id);await nativeShipEffects.prepare(e.shipType,'civilian');}''')
  position=page.evaluate('''()=>{
   const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,s.devLootDemo.ships[0].id),d=nativeSimulationFrame.renderPose(s,nativeShipDefinitions.describe(s,e,{category:'civilian'})),player=nativeSimulationFrame.renderPose(s,nativeShipDefinitions.describe(s)),c=document.querySelector('#space'),r=c.getBoundingClientRect(),v=nativeView.measure(c),dots=nativeShipRepairs.drones(s,1).map(t=>nativeSimulationFrame.renderPose(s,t));
   // Click a visible part of the hull clear of the small working DOTs, whose
   // ordinary mouse acquisition intentionally takes priority at their pixels.
   for(const [dx,dy] of [[0,0],[0,d.dimensions.height*.3],[0,-d.dimensions.height*.3],[d.dimensions.width*.3,0],[-d.dimensions.width*.3,0]]){
    const world={x:d.x+dx,y:d.y+dy};if(dots.some(t=>Math.hypot(t.x-world.x,t.y-world.y)<=13))continue;
    const x=r.left+(v.w/2+world.x-player.x)/v.w*r.width,y=r.top+(v.h/2+world.y-player.y)/v.h*r.height;
    if(document.elementFromPoint(x,y)===c)return {x,y};
   }throw Error('No unobstructed hull point for the mouse');
  }''')
  report['click']=page.evaluate('''p=>{const s=nativeNpcDev.getState(),c=document.querySelector('#space'),r=c.getBoundingClientRect(),v=nativeView.measure(c),x=(p.x-r.left)*v.w/r.width,y=(p.y-r.top)*v.h/r.height,ship=vexedSolFlight.shipPosition(s),hit=nativeCivilianTraffic.hitTest(s,{ship,cx:v.w/2,cy:v.h/2,zoom:1,x,y});return {client:p,logical:{x,y},hit:hit?.id,element:document.elementFromPoint(p.x,p.y)?.id};}''',position)
  page.mouse.click(position['x'],position['y'])
  report['selection']=page.evaluate('''()=>{const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,s.devLootDemo.ships[0].id),d=nativeShipDefinitions.describe(s,e,{category:'civilian'});return {lock:nativeTargetingActions.snapshot().lock,status:document.querySelector('#connection').textContent,player:{x:s.x,y:s.y},camera:vexedSolFlight.shipPosition(s),target:{x:e.x,y:e.y,phase:e.phase,system:e.system,hull:e.hull,leg:e.localLeg,journey:e.journey},descriptor:{x:d.x,y:d.y},detailed:nativeShipDetail.isDetailed(s,d),local:nativeCivilianTraffic.localShips(s).some(t=>t.id===e.id)};}''')
  page.screenshot(path=str(OUT/'selection.png'))
  page.wait_for_selector('#lootBtn:not([hidden]):not([disabled])',timeout=10000)
  page.keyboard.press('l');page.wait_for_selector('#ship-loot:not([hidden])')
  assert page.locator('#ship-loot [data-owner="source"] .loot-grid').is_visible()
  assert page.locator('#ship-loot [data-owner="player"] .loot-grid').is_visible()
  source=page.locator('#ship-loot .loot-owner[data-owner="source"]');player=page.locator('#ship-loot .loot-owner[data-owner="player"]')
  assert player.bounding_box()['x']<source.bounding_box()['x']
  page.evaluate('''()=>{window.__lootTransferWitness={ghost:false,delta:false};window.__lootTransferObserver=new MutationObserver(()=>{const w=__lootTransferWitness;w.ghost ||= !!document.querySelector('.loot-transfer-ghost');w.delta ||= !!document.querySelector('#ship-loot [data-owner="player"] .loot-received-delta');});__lootTransferObserver.observe(document.querySelector('#ship-loot'),{childList:true,subtree:true});}''')
  page.locator('#ship-loot .loot-tile[data-loot-key="cargo"]').click()
  page.wait_for_function('()=>__lootTransferWitness.ghost&&__lootTransferWitness.delta',timeout=3000)
  page.evaluate('__lootTransferObserver.disconnect()')
  page.screenshot(path=str(OUT/'item-transfer-animation.png'))
  held=page.evaluate('''()=>{const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,s.devLootDemo.ships[0].id);return {id:e.id,remaining:e.cargo?.tons||0,player:s.solFreightHold[5],marker:JSON.parse(JSON.stringify(s.devLootDemo))};}''')
  assert held['remaining']==0 and held['player']==initial['playerFood']+initial['ships'][0]['cargo'],held
  page.wait_for_function("""n=>Array.from(document.querySelectorAll('#ship-loot [data-owner=player] .loot-tile')).find(node=>node.dataset.itemKey==='freight:5')?.querySelector('.loot-item-quantity').textContent===n+' t'""",arg=held['player'])
  assert player.locator('[data-loot-page="previous"]').is_enabled()
  old_page=player.locator('.loot-page-number').inner_text();player.locator('[data-loot-page="previous"]').click()
  assert player.locator('.loot-page-number').inner_text()!=old_page
  wheel_page=player.locator('.loot-page-number').inner_text();player.locator('.loot-grid').hover();page.mouse.wheel(0,600);page.wait_for_timeout(150)
  assert player.locator('.loot-page-number').inner_text()==wheel_page
  assert page.locator('#ship-loot .loot-grid').evaluate_all('(nodes)=>nodes.every(n=>n.scrollTop===0&&n.scrollHeight<=n.clientHeight+1)')
  ids=page.evaluate('''()=>{const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,s.devLootDemo.ships[0].id);return {engine:e.shipEquipment.slots.engineering[0],weapon:e.shipEquipment.slots.weapon[0]};}''')
  source.locator('input').fill('engine')
  source.locator('.loot-tile[data-loot-key="equipment:'+ids['engine']+'"]').click()
  assert page.evaluate('''id=>{const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,s.devLootDemo.ships[0].id);return !e.shipEquipment.instances[id]&&s.shipEquipment.locker.some(k=>s.shipEquipment.instances[k].modelId==='standard-engine');}''',ids['engine'])
  source.locator('input').fill('');source.locator('.loot-tile[data-loot-key="equipment:'+ids['weapon']+'"]').click()
  assert page.evaluate('''id=>!nativeNpcLives.find(nativeNpcDev.getState(),nativeNpcDev.getState().devLootDemo.ships[0].id).shipEquipment.instances[id]''',ids['weapon'])
  source.locator('input').press_sequentially('shield');assert page.evaluate('nativeShipLootView.active')
  assert source.locator('.loot-tile').count()==1
  source.locator('input').fill('')
  # Put existing Dev locker items aboard through the shared owner so Take All
  # must traverse several pages; no fixture item is copied or fabricated.
  page.evaluate('''()=>{const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,s.devLootDemo.ships[0].id);for(const id of s.shipEquipment.locker.filter(id=>s.shipEquipment.instances[id].category!=='repairDrone').slice(0,15)){const moved=nativeShipEquipment.transfer(s,{from:s,to:e,id});if(!moved.ok)throw Error(moved.error);}}''')
  source.locator('input').fill(' ');source.locator('input').fill('')
  assert source.locator('[data-loot-page="next"]').is_enabled()
  source.locator('[data-loot-page="next"]').click();assert not source.locator('.loot-page-number').inner_text().startswith('1 /')
  source.locator('input').press_sequentially('shield');assert page.evaluate('nativeShipLootView.active')
  page.wait_for_function('()=>!document.querySelector(".loot-transfer-ghost")')
  gear_before=page.evaluate('''()=>Object.keys(nativeNpcLives.find(nativeNpcDev.getState(),nativeNpcDev.getState().devLootDemo.ships[0].id).shipEquipment.instances).sort()''')
  page.evaluate('''()=>{window.__inventoryStorage=nativeSaveStorage;window.nativeSaveStorage={...nativeSaveStorage,write:()=>({ok:false,error:'Bulk save denied'})};}''')
  source.locator('[data-loot-take-all]').click();assert 'Bulk save denied' in page.locator('.loot-message').inner_text()
  assert page.evaluate('''()=>Object.keys(nativeNpcLives.find(nativeNpcDev.getState(),nativeNpcDev.getState().devLootDemo.ships[0].id).shipEquipment.instances).sort()''')==gear_before
  assert page.locator('.loot-transfer-ghost').count()==0
  page.evaluate('''()=>{window.__takeAllWrites=0;window.nativeSaveStorage={...__inventoryStorage,write:(...args)=>{__takeAllWrites++;return __inventoryStorage.write(...args);}};}''')
  source.locator('[data-loot-take-all]').click();assert page.evaluate('__takeAllWrites')==1
  assert page.evaluate('''()=>{const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,s.devLootDemo.ships[0].id);return Object.values(e.shipEquipment.instances).every(item=>item.category==='repairDrone')&&e.repairDeuranium===0;}''')
  page.evaluate('window.nativeSaveStorage=__inventoryStorage')
  source.locator('input').fill('')
  page.wait_for_function('()=>!document.querySelector(".loot-transfer-ghost")')
  page.screenshot(path=str(OUT/'nearby-practice-ships.png'))
  page.set_viewport_size({'width':620,'height':800})
  page.screenshot(path=str(OUT/'inventories-small-screen.png'))
  boxes=page.locator('#ship-loot .loot-owner').evaluate_all('(nodes)=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,w:r.width,h:r.height};})')
  assert boxes[0]['w']>200 and boxes[1]['x']>boxes[0]['x']+boxes[0]['w'] and min(b['h'] for b in boxes)>200,boxes
  page.set_viewport_size({'width':1440,'height':1000});page.keyboard.press('Escape')
  # Simulate an older played Dev save with the original factioned test ships.
  # Continue must clear only this Sol test alert, without replacing any loot.
  page.evaluate('''()=>{const s=nativeNpcDev.getState();delete s.devLootDemo.neutralVersion;s.localPrestige[1]=-20;s.localPrestige[2]=25;for(const r of s.devLootDemo.ships){const e=nativeNpcLives.find(s,r.id);e.ownerGovernmentId=1;e.npcRole='faction';}s.factionDefence={version:2,revision:0,systems:{1:{government:1,aggressors:[{id:'player',until:9999}]},2:{government:2,aggressors:[{id:'player',until:9999}]}},orders:[]};const saved=nativeSaveStorage.write(s);if(!saved.ok)throw Error(saved.error);}''')
  page.reload();page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.locator('[data-menu="continue-dev"]').click();page.wait_for_function('()=>!!nativeNpcDev.getState()',timeout=30000)
  restored=page.evaluate('''()=>{const s=nativeNpcDev.getState();return {marker:s.devLootDemo,population:s.civilianTraffic.ships.length,cargo:nativeNpcLives.find(s,s.devLootDemo.ships[0].id).cargo?.tons||0,playerFood:s.solFreightHold[5]};}''')
  assert restored['marker']==held['marker'] and restored['population']==1200 and restored['cargo']==held['remaining'],restored
  assert restored['playerFood']==held['player']
  neutral=page.evaluate('''()=>{const s=nativeNpcDev.getState();return {owners:s.devLootDemo.ships.map(r=>nativeNpcLives.find(s,r.id).ownerGovernmentId),solStanding:s.localPrestige[1],otherStanding:s.localPrestige[2],solAggressors:s.factionDefence.systems[1].aggressors,otherAggressors:s.factionDefence.systems[2].aggressors};}''')
  assert neutral['owners']==[0,0,0] and neutral['solStanding']==100 and not neutral['solAggressors'] and neutral['otherStanding']==25 and neutral['otherAggressors'][0]['id']=='player',neutral
  assert not report['errors'],report['errors']
  report.update(passed=True,initial=initial,liveDots=True,actualLootPanel=True,realCargoTransfer=True,singleClick=True,transferAnimation=True,quantityIncrease=True,playerOnLeft=True,pagination=True,noScrollWheel=True,takeAllAcrossPages=True,failedTakeAllRollback=True,oneBulkSave=True,searchWorks=True,bothInventories=True,smallScreen=True,oldDevNeutrality=neutral,continuePreserved=True);browser.close()
finally:
 server.shutdown();(OUT/'browser.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
