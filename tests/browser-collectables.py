"""Normal-play galactic relic clicks, transporter presentation, Inventory and verified reload."""
import functools,http.server,json,math,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/collectables-galaxy';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
  def click_pickup(item_id):
   # A drifting world object never has a stable bounding box. Aim at its actual
   # current center with a real pointer; static Inventory buttons use click().
   button=page.locator(f'[data-collectable-id="{item_id}"]');button.wait_for(state='visible');box=button.bounding_box()
   page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
  def check_clue(item_id,expected):
   model=page.evaluate('id=>nativeCollectables.clues(__relicState,id)',item_id)
   assert model['available']==expected,model
   assert page.locator('[data-clue-progress]').inner_text()==('CLUE AVAILABLE' if expected else 'CLUE LOCKED')
   assert page.locator('[data-clue-layer]').count()==0
   if expected:
    assert page.locator('[data-collectable-rumour]').inner_text()==model['text']
    assert page.locator('[data-clue-system]').inner_text()==model['reference']['system']
    assert page.locator('[data-clue-place]').inner_text()==model['reference']['name']
    assert page.locator('[data-clue-planet]').get_attribute('src')==model['reference']['art']
    page.wait_for_function('()=>{const i=document.querySelector("[data-clue-planet]");return !i.hidden&&i.complete&&i.naturalWidth>0;}')
   else:
    assert 'text' not in model and 'reference' not in model
    assert page.locator('[data-collectable-rumour]').is_hidden() and page.locator('[data-collectable-rumour]').inner_text()==''
    assert page.locator('.collectable-clue-reference').is_hidden()
    assert page.locator('[data-clue-planet]').get_attribute('src') is None
    assert page.locator('[data-clue-system]').inner_text()=='' and page.locator('[data-clue-place]').inner_text()==''
    assert f'Find {model["remaining"]} more' in page.locator('.collectable-clue-locked').inner_text()
  url=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html';page.goto(url);page.locator('[data-menu="dev"]').click(timeout=120000)
  page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
  page.wait_for_function('()=>!nativeMenuTransition.snapshot().active')
  def capture_state():
   page.evaluate('()=>{window.__relicState=null;const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__relicState=s;return restore(s);};}')
  capture_state()
  assert page.evaluate('startNativeFactionGame(2,{captain:"Relic check",ship:"ISS Antiquarian",government:"Earth Empire"})')
  page.wait_for_function('()=>__relicState?.collectableMotion?.version===3')
  assert page.evaluate('!__relicState.devMode&&__relicState.system===1')
  # Remote relics must not load images or create Earth hit targets.
  page.wait_for_timeout(300)
  assert page.locator('.collectable-marker').count()==0
  assert page.evaluate('performance.getEntriesByType("resource").filter(r=>r.name.includes("assets/collectables/")).length')==0
  page.screenshot(path=str(OUT/'sol-without-exhibit.png'))
  def approach(item_id,mode='normal'):
   page.evaluate('''({id,mode})=>{const s=JSON.parse(JSON.stringify(__relicState)),item=nativeCollectables.available(s).find(i=>i.id===id);s.system=item.site.system;nativeSystemCatalog.initialize(s);s.localBody=nativeSystemCatalog.homeId(s.system);s.localNavTarget=s.localBody;s.localCruise=null;s.arrivalApproach=null;s.landed=false;s.phase='flight';delete s.pendingTransit;nativeShipMotion.stop(s);
    const anchor=nativeManualFlight.anchor(s.system),base=s.system===1?vexedSolFlight.shipPosition({...s,x:0,y:0}):{x:0,y:0};s.x=item.gx-anchor.x-90-base.x;s.y=item.gy-anchor.y-base.y;s.previousX=item.gx-anchor.x-90;s.previousY=item.gy-anchor.y;nativeManualFlight.initializeRegion(s);
    if(!nativeSaveStorage.write(s).ok)throw Error('Artifact approach save failed');resumeNativeGame(mode);}''',{'id':item_id,'mode':mode})
   page.wait_for_selector(f'[data-collectable-id="{item_id}"]:not([hidden])')
   page.wait_for_function('id=>{const img=document.querySelector(`[data-collectable-id="${id}"] img`);return img?.complete&&img.naturalWidth>0;}',arg=item_id)
  approach('earth-roadster')
  total=page.evaluate('nativeCollectables.catalog.length');assert total==16
  assert page.evaluate('nativeCollectables.available(__relicState).length')==total
  motion_id=page.locator('.collectable-marker:not([hidden])').first.get_attribute('data-collectable-id')
  def pickup_sample():
   return page.evaluate('''id=>{const s=__relicState,item=nativeCollectables.available(s).find(i=>i.id===id),button=document.querySelector(`[data-collectable-id="${id}"]`),img=button.querySelector('img'),m=new DOMMatrix(getComputedStyle(img).transform),b=button.getBoundingClientRect(),r=img.getBoundingClientRect();return {time:s.shipSimulation.seconds,x:item.x,y:item.y,roll:item.roll,paintedRoll:parseFloat(button.style.getPropertyValue('--collectable-roll')),angle:Math.atan2(m.b,m.a),hitContainsArt:r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1,labelAngle:getComputedStyle(button.querySelector('.collectable-marker-label')).transform};}''',motion_id)
  drift_start=pickup_sample();page.wait_for_timeout(1400);drift_end=pickup_sample()
  assert drift_end['time']>drift_start['time'] and abs(drift_end['roll']-drift_start['roll'])>.001,(drift_start,drift_end)
  assert abs(drift_end['x']-drift_start['x'])+abs(drift_end['y']-drift_start['y'])>.1
  # Full-population NPCs can now hit the object. Its interpolated last paint can
  # legitimately trail the latest physical step; the click area follows paint.
  assert drift_end['hitContainsArt'],drift_end
  assert abs(math.remainder(drift_end['angle']-drift_end['paintedRoll'],2*math.pi))<.001 and drift_end['labelAngle'].startswith('matrix(1, 0, 0, 1,'),drift_end
  page.screenshot(path=str(OUT/'ferenginar-roadster.png'))
  page.locator('#inventoryBtn').click();page.locator('.inventory-right-tabs [data-right-page="collectables"]').click();page.wait_for_timeout(300)
  paused_pose=page.evaluate('JSON.stringify(nativeCollectables.available(__relicState))');page.wait_for_timeout(250)
  assert page.evaluate('JSON.stringify(nativeCollectables.available(__relicState))')==paused_pose
  assert page.locator('.inventory-collectables-page .inventory-deliveries-summary strong').inner_text()==f'0 / {total} collected'
  empty_slots=[];clues=[]
  clue_state=page.evaluate('JSON.stringify(__relicState)')
  clue_art=page.evaluate('performance.getEntriesByType("resource").filter(r=>r.name.includes("assets/collectables/")).map(r=>r.name)')
  while True:
   if page.locator('.inventory-collectable-slot').first.get_attribute('data-collectable-slot')=='7':
    assert page.locator('[data-collectable-clue][data-clue-available="false"]').count()==6
    page.wait_for_timeout(300);page.screenshot(path=str(OUT/'second-page-initially-locked.png'))
   for slot in page.locator('.inventory-collectable-slot').all():
    assert slot.locator('.inventory-collectable-question').inner_text()=='?';assert slot.locator('img,[data-collectable-info]').count()==0
    assert slot.get_attribute('data-collected')=='false';assert 'Undiscovered' in slot.get_attribute('aria-label')
    empty_slots.append(int(slot.get_attribute('data-collectable-slot')))
    item_id=slot.get_attribute('data-collectable-clue');assert item_id
    slot.focus();page.keyboard.press('Enter')
    page.wait_for_selector('#collectable-reveal[data-mode="clue"][data-phase="clue"]')
    record=page.evaluate('id=>nativeCollectables.get(id)',item_id)
    available=int(slot.get_attribute('data-collectable-slot'))<=6
    assert slot.get_attribute('data-clue-available')==str(available).lower()
    check_clue(item_id,available)
    if available:assert page.locator('[data-collectable-rumour]').inner_text()==record['site']['clue']
    assert record['name'] not in page.locator('#collectable-reveal').inner_text()
    assert page.locator('.collectable-transporter').is_hidden() and page.locator('.collectable-reveal-info').is_hidden()
    assert page.locator('.collectable-pattern img').get_attribute('src') is None
    assert page.evaluate('nativeSimulation.blocked()&&!nativeCollectablesView.transport.active')
    assert page.locator('#ship-inventory').evaluate('n=>n.inert')
    if not clues:
     page.wait_for_timeout(400)
     page.screenshot(path=str(OUT/'undiscovered-clue-desktop.png'))
     page.keyboard.press('Shift+Tab');assert page.locator('[data-close-clue]').evaluate('n=>n===document.activeElement')
     page.keyboard.press('Tab');assert page.locator('.collectable-dismiss').evaluate('n=>n===document.activeElement')
     page.keyboard.press('w');page.wait_for_timeout(200)
    page.keyboard.press('Escape');assert page.locator('#collectable-reveal').is_hidden()
    assert slot.evaluate('n=>n===document.activeElement')
    assert page.evaluate('JSON.stringify(__relicState)')==clue_state
    clues.append(item_id)
   if page.locator('[data-collectable-page="next"]').is_disabled():break
   page.locator('[data-collectable-page="next"]').click()
  assert empty_slots==list(range(1,total+1)),empty_slots
  assert len(clues)==total and len(set(clues))==total
  assert page.evaluate('performance.getEntriesByType("resource").filter(r=>r.name.includes("assets/collectables/")).map(r=>r.name)')==clue_art
  page.set_viewport_size({'width':320,'height':568});page.wait_for_timeout(300)
  cargo=page.locator('[data-inventory-view="cargo"]')
  if cargo.is_visible():cargo.click()
  while not page.locator('[data-collectable-page="previous"]').is_disabled():page.locator('[data-collectable-page="previous"]').click()
  page.locator('[data-collectable-clue]').first.click();page.wait_for_timeout(300)
  page.screenshot(path=str(OUT/'undiscovered-clue-mobile.png'))
  assert page.locator('.collectable-clue-content').evaluate('n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&n.scrollWidth<=n.clientWidth+1;}')
  page.locator('[data-close-clue]').click();assert page.locator('#collectable-reveal').is_hidden()
  page.set_viewport_size({'width':1440,'height':1000});page.wait_for_timeout(300)
  page.screenshot(path=str(OUT/'album-missing.png'));page.keyboard.press('Escape')
  first=page.locator('.collectable-marker:not([hidden])').first;first_id=first.get_attribute('data-collectable-id')
  # A denied durable save cannot consume the item or open a success effect.
  page.evaluate('()=>{window.__realStorage=nativeSaveStorage;window.nativeSaveStorage={...nativeSaveStorage,write:()=>({ok:false,error:"Collectable test: storage denied"})};}')
  click_pickup(first_id);assert page.locator('#collectable-reveal').is_hidden();assert page.evaluate('(__relicState.collectables||[]).length')==0
  assert page.locator(f'[data-collectable-id="{first_id}"]').is_visible();assert 'storage denied' in page.locator('#connection').inner_text()
  page.evaluate('window.nativeSaveStorage=__realStorage');click_pickup(first_id)
  page.wait_for_selector('#collectable-reveal[data-phase="transport"]');page.wait_for_timeout(220);page.screenshot(path=str(OUT/'transporter.png'))
  assert page.locator('.collectable-transport-fx').is_visible()
  assert page.evaluate('nativeCollectablesView.transport.active&&nativeCollectablesView.transport.progress>0')
  pixels=page.locator('.collectable-transport-fx').evaluate('''canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let visible=0,partial=0;for(let n=3;n<data.length;n+=4){if(data[n])visible++;if(data[n]>0&&data[n]<255)partial++;}return {visible,partial,maxSize:Math.max(canvas.width,canvas.height)};}''')
  assert pixels['visible']>1000 and pixels['partial']>100 and pixels['maxSize']<=640,pixels
  # Hiding the app must suspend the UI effect as well as the world clock.
  page.evaluate('()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));}')
  progress=page.evaluate('nativeCollectablesView.transport.progress');page.wait_for_timeout(250)
  assert page.evaluate('nativeCollectablesView.transport.progress')==progress
  page.evaluate('()=>{delete document.hidden;document.dispatchEvent(new Event("visibilitychange"));}')
  page.wait_for_selector('#collectable-reveal[data-phase="complete"]');page.screenshot(path=str(OUT/'recovered.png'))
  assert 'Clue 07 unlocked' in page.locator('.collectable-saved').inner_text()
  assert page.locator('.collectable-transport-fx').is_hidden() and not page.evaluate('nativeCollectablesView.transport.active')
  hover=page.locator('.collectable-pattern img').evaluate('''img=>{const animation=img.getAnimations()[0];if(!animation)throw Error('Drift animation missing');animation.pause();return [0,2400,4800,7200,9600].map(time=>{animation.currentTime=time;const m=new DOMMatrix(getComputedStyle(img).transform),p=document.querySelector('.collectable-pad').getBoundingClientRect();return {x:m.e,y:m.f,angle:Math.atan2(m.b,m.a),determinant:m.a*m.d-m.b*m.c,padX:p.x,padY:p.y};});}''')
  assert max(s['x'] for s in hover)-min(s['x'] for s in hover)>6 and min(s['y'] for s in hover)<-6.9,hover
  assert hover[1]['angle']>.02 and hover[3]['angle']<-.015,hover
  assert all(abs(s['determinant']-1)<.00001 and s['padX']==hover[0]['padX'] and s['padY']==hover[0]['padY'] for s in hover),hover
  assert abs(hover[-1]['x'])+abs(hover[-1]['y'])+abs(hover[-1]['angle'])<.001,hover
  assert page.evaluate('nativeSimulation.blocked()')
  clock=page.evaluate('nativeSimulation.seconds(__relicState)');page.keyboard.press('w');page.wait_for_timeout(350)
  assert page.evaluate('nativeSimulation.seconds(__relicState)')==clock
  assert page.evaluate('nativeSaveStorage.read("normal").collectables.length')==1
  page.locator('[data-open-collection]').click();assert page.locator('#ship-inventory').get_attribute('data-right-page')=='collectables'
  page.wait_for_timeout(300)
  assert page.locator('.inventory-collectables-page .inventory-deliveries-summary strong').inner_text()==f'1 / {total} collected'
  page.locator('[data-collectable-page="next"]').click()
  assert page.locator('[data-collectable-clue][data-clue-available="true"]').count()==1
  assert page.locator('[data-collectable-clue][data-clue-available="false"]').count()==5
  page.locator('[data-collectable-clue="earth-snoopy"]').click();check_clue('earth-snoopy',True)
  page.wait_for_timeout(400);page.screenshot(path=str(OUT/'next-single-clue-unlocked.png'));page.locator('[data-close-clue]').click()
  page.locator('[data-collectable-clue="earth-phoenix"]').click();check_clue('earth-phoenix',False);page.locator('[data-close-clue]').click()
  page.locator('[data-collectable-page="previous"]').click()
  tile=page.locator('.inventory-collectable-slot.is-collected');assert tile.count()==1
  expected_slot=page.evaluate('id=>nativeCollectables.catalog.findIndex(item=>item.id===id)+1',first_id)
  assert int(tile.get_attribute('data-collectable-slot'))==expected_slot
  assert tile.locator('img').count()==1 and tile.locator('.inventory-collectable-question').count()==0
  page.screenshot(path=str(OUT/'album-partial.png'));tile.focus();page.keyboard.press('Enter')
  assert page.locator('#collectable-reveal').get_attribute('data-phase')=='complete';assert page.locator('[data-record-history]').inner_text()
  assert not page.evaluate('nativeCollectablesView.transport.active')
  page.keyboard.press('Escape');assert page.locator('#ship-inventory').is_visible();page.keyboard.press('Escape')
  page.wait_for_function('()=>!nativePause.active&&!nativeShipInventory.active&&!nativeCollectablesView.active')
  # Visit every authored site through a verified normal save, then collect
  # using the actual flight target and complete original transporter UI.
  remaining=page.evaluate('nativeCollectables.available(__relicState).map(i=>i.id)')
  archive_records=[]
  for item_id in remaining:
   approach(item_id)
   click_pickup(item_id)
   if item_id=='earth-vanguard-1':
    page.wait_for_function('()=>nativeCollectablesView.transport.progress>.1')
    page.keyboard.press('Escape');assert page.locator('#collectable-reveal').is_hidden();assert not page.evaluate('nativeCollectablesView.transport.active')
    page.wait_for_timeout(150);assert page.locator('#collectable-reveal').is_hidden()
    page.locator('#inventoryBtn').click();page.locator('.inventory-right-tabs [data-right-page="collectables"]').click();page.locator(f'[data-collectable-info="{item_id}"]').click()
   elif item_id=='earth-voyager':
    page.wait_for_function('()=>nativeCollectablesView.transport.progress>.1');page.emulate_media(reduced_motion='reduce')
   page.wait_for_selector('#collectable-reveal[data-phase="complete"]')
   if item_id=='earth-voyager':
    assert page.locator('.collectable-transport-fx').is_hidden() and not page.evaluate('nativeCollectablesView.transport.active');page.emulate_media(reduced_motion='no-preference')
   record=page.evaluate('id=>nativeCollectables.get(id)',item_id)
   assert page.locator('#collectable-title').inner_text()==record['name']
   assert page.locator('[data-record-year]').inner_text()==record.get('dateLabel',f'LAUNCHED {record["year"]}')
   assert page.locator('[data-record-history]').inner_text()==record['history']
   assert page.locator('[data-record-recovery]').inner_text()==record['site']['recovery']
   assert page.locator('[data-record-location]').inner_text()==record['site']['location']
   assert 'VEXED MIRROR LORE' in page.locator('.collectable-discovery').inner_text()
   assert page.locator('.collectable-source').get_attribute('href')==record['source']
   assert record.get('sourceLabel','NASA mission record') in page.locator('.collectable-source').inner_text()
   if item_id in ['earth-nx-alpha','earth-kataan-probe','earth-nomad']:
    page.screenshot(path=str(OUT/f'archive-{item_id}.png'))
   archive_records.append(item_id);page.locator('[data-keep-exploring]').click()
   if page.evaluate('nativeShipInventory.active'):page.keyboard.press('Escape')
   if page.evaluate('__relicState.collectables.length')==6:
    # Six real finds open all six second-page rumours; page three stays locked.
    page.reload();page.wait_for_function('()=>!!window.nativeCombatShots');capture_state();page.locator('[data-menu="continue"]').click(timeout=120000)
    page.wait_for_function('()=>__relicState?.collectables?.length===6&&!nativeMenuTransition.snapshot().active',timeout=120000)
    page.locator('#inventoryBtn').click();page.locator('.inventory-right-tabs [data-right-page="collectables"]').click();page.wait_for_timeout(300)
    page.locator('[data-collectable-page="next"]').click()
    assert page.locator('[data-collectable-clue][data-clue-available="true"]').count()==6
    page.wait_for_timeout(300);page.screenshot(path=str(OUT/'second-page-after-six-finds.png'))
    page.locator('[data-collectable-page="next"]').click()
    assert page.locator('[data-collectable-clue][data-clue-available="false"]').count()==4
    page.locator('[data-collectable-clue="earth-friendship-1"]').click();check_clue('earth-friendship-1',False)
    page.locator('[data-close-clue]').click();page.keyboard.press('Escape')
   if page.evaluate('__relicState.collectables.length')==7:
    page.locator('#inventoryBtn').click();page.locator('.inventory-right-tabs [data-right-page="collectables"]').click();page.wait_for_timeout(300)
    page.locator('[data-collectable-page="next"]').click();page.locator('[data-collectable-page="next"]').click()
    assert page.locator('[data-collectable-clue][data-clue-available="true"]').count()==1
    assert page.locator('[data-collectable-clue][data-clue-available="false"]').count()==3
    page.locator('[data-collectable-clue="earth-friendship-1"]').click();check_clue('earth-friendship-1',True)
    page.set_viewport_size({'width':320,'height':568});page.wait_for_timeout(300)
    assert page.locator('.collectable-clue-content').evaluate('n=>n.scrollWidth<=n.clientWidth+1')
    page.screenshot(path=str(OUT/'single-clue-mobile.png'));page.locator('[data-close-clue]').click();page.keyboard.press('Escape')
    page.set_viewport_size({'width':1440,'height':1000});page.wait_for_timeout(300)
  assert page.evaluate('__relicState.collectables.length')==total
  page.wait_for_function('()=>document.querySelectorAll(".collectable-marker").length===0')
  page.reload();page.wait_for_function('()=>!!window.nativeCombatShots');capture_state();page.locator('[data-menu="continue"]').click(timeout=120000);page.wait_for_function('total=>__relicState?.collectables?.length===total',arg=total,timeout=120000)
  assert page.evaluate('nativeCollectables.available(__relicState).length')==0
  page.locator('#inventoryBtn').click();page.locator('.inventory-right-tabs [data-right-page="collectables"]').click();page.wait_for_timeout(300)
  names=set();sizes=[]
  for width,height in [(1440,1000),(1024,768),(800,650),(360,800),(320,568)]:
   page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(300)
   cargo=page.locator('[data-inventory-view="cargo"]')
   if cargo.is_visible():cargo.click()
   assert page.locator('.inventory-collectable-pages [role="status"]').inner_text().endswith('/ 3')
   previous=page.locator('[data-collectable-page="previous"]')
   while not previous.is_disabled():previous.click()
   while True:
    page.wait_for_timeout(250)
    names.update(page.locator('.inventory-collectable-slot .inventory-collectable-name').all_inner_texts())
    fit=page.locator('.inventory-collectables-page').evaluate('''panel=>{const r=panel.getBoundingClientRect(),grid=panel.querySelector('.inventory-collectable-grid'),g=grid.getBoundingClientRect();return {width:innerWidth,height:innerHeight,overflow:[panel,grid].some(n=>n.scrollHeight>n.clientHeight+2||n.scrollWidth>n.clientWidth+2),clipped:[...panel.querySelectorAll('.inventory-collectable-slot,.inventory-delivery-pages')].some(n=>{const b=n.getBoundingClientRect();return b.bottom>r.bottom+1||b.right>r.right+1;}),tileClipped:[...grid.children].some(n=>{const b=n.getBoundingClientRect();return b.bottom>g.bottom+1||b.right>g.right+1;}),columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length};}''')
    assert not fit['overflow'] and not fit['clipped'],fit
    assert not fit['tileClipped'] and fit['columns']>=2,fit
    assert page.locator('.inventory-collectable-question').count()==0
    for tile in page.locator('.inventory-collectable-slot').all():
     number=int(tile.get_attribute('data-collectable-slot'));assert tile.locator('.inventory-collectable-name').inner_text()==page.evaluate('index=>nativeCollectables.catalog[index].name',number-1)
    next_page=page.locator('[data-collectable-page="next"]')
    if next_page.is_disabled():break
    next_page.click()
   sizes.append(fit);page.screenshot(path=str(OUT/f'collection-{width}.png'))
  assert len(names)==total,names
  page.locator('[data-collectable-info]').first.click();page.wait_for_timeout(300);page.screenshot(path=str(OUT/'archive-mobile.png'))
  assert page.locator('[data-keep-exploring]').is_visible();page.keyboard.press('Escape');page.keyboard.press('Escape')
  # A new Dev game uses the same galactic sites but an independent manifest.
  page.set_viewport_size({'width':1440,'height':1000});page.emulate_media(reduced_motion='reduce');page.evaluate('startNativeDevGame()')
  page.wait_for_function('()=>__relicState?.devMode&&nativeCollectables.available(__relicState).length===16')
  assert page.evaluate('nativeSaveStorage.read("normal").collectables.length')==total
  assert page.locator('.collectable-marker').count()==0
  approach('earth-roadster',mode='dev')
  assert page.locator('.collectable-marker:not([hidden])').first.evaluate('b=>parseFloat(b.style.getPropertyValue("--collectable-roll"))')==0
  page.locator('.collectable-marker:not([hidden])').first.focus();page.keyboard.press('Enter');page.wait_for_selector('#collectable-reveal[data-phase="complete"]')
  assert page.locator('.collectable-pattern img').evaluate('(node)=>getComputedStyle(node).animationName')=='none'
  assert not page.evaluate('nativeCollectablesView.transport.active') and page.locator('.collectable-transport-fx').is_hidden()
  page.keyboard.press('Escape');page.locator('#pauseBtn').click();assert page.locator('#collectable-markers').is_hidden();page.locator('[data-resume]').click()
  assert not errors,errors
  report={'passed':True,'artifacts':total,'checkedClueCards':clues,'initialClues':6,'singleOriginalRumours':True,'oneNewCluePerFind':True,'unlocksRetainedByContinue':True,'existingPlanetReferences':True,'rumoursDoNotRevealOrGrant':True,'clueKeyboardAndMobile':True,'normalGameplay':True,'noSolExhibitOrRemoteArt':True,'galacticSites':True,'fictionLabelledRecoveryLogs':True,'actualClicks':True,'driftingPickup':[drift_start,drift_end],'driftPausesWithInventory':True,'archiveDrift':hover,'transportEffect':True,'transportPixels':pixels,'hiddenTransportSuspends':True,'cancelledTransportStops':True,'reducedMotionMidTransport':True,'archiveFromInventory':True,'archiveRecords':archive_records,'fixedAlbumSlots':empty_slots,'missingQuestionMarks':True,'progressCounter':True,'collectedTileKeyboard':True,'verifiedReload':True,'saveFailureRollback':True,'duplicateFree':True,'pausedDuringReveal':True,'modeSeparation':True,'keyboardAndReducedMotion':True,'inventorySizes':sizes,'errors':errors}
  (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True);browser.close()
finally:server.shutdown();server.server_close()
