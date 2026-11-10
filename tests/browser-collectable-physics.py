"""Real keyboard ram, saved slowdown, finite rest and transport after a bump."""
import functools,http.server,json,math,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/collectable-physics';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
  url=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html';page.goto(url);page.locator('[data-menu="dev"]').click(timeout=120000)
  page.wait_for_function('()=>nativeNpcDev.getState()?.collectableMotion?.items&&nativeSolAsteroids.placements.length',timeout=120000)
  def capture_state():
   page.evaluate('''()=>{window.__relicState=null;const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__relicState=s;return restore(s);};}''')
  capture_state()
  # A quiet, saved approach uses the production game and real physics loop.
  # Remove unrelated traffic only in this collision fixture, then steer with W.
  page.evaluate('''()=>{
    const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));s.devMode=false;s.system=14;s.localCruise=null;s.arrivalApproach=null;s.landed=false;s.phase='flight';nativeSystemCatalog.initialize(s);s.localBody=0;
    s.civilianTraffic.ships=[];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
    s.minedAsteroids=nativeSolAsteroids.forSystem(14).map(r=>r.slotId);
    s.collectables=nativeCollectables.catalog.filter(i=>i.id!=='earth-roadster').map(i=>({id:i.id,name:i.name,icon:i.icon}));
    nativeShipMotion.stop(s);s.angle=0;
    const origin=vexedSolFlight.shipPosition(s);s.x+=1080-origin.x;s.y+=604-origin.y;s.previousX=1080;s.previousY=604;
    const anchor=nativeManualFlight.anchor(14);
    s.collectableMotion={version:3,layout:1,items:{'earth-roadster':{x:anchor.x+1200,y:anchor.y+600,heading:-Math.PI/2,vx:.09,vy:.03,angularVelocity:.002,settling:false,at:s.shipSimulation.seconds}}};
    if(!nativeSaveStorage.write(s).ok)throw Error('Approach save failed');resumeNativeGame('normal');
  }''')
  page.wait_for_selector('[data-collectable-id="earth-roadster"]:not([hidden])')
  def sample():
   return page.evaluate('''()=>{const s=__relicState,item=nativeCollectables.available(s)[0],b=document.querySelector('[data-collectable-id="earth-roadster"]'),r=b.getBoundingClientRect(),i=b.querySelector('img').getBoundingClientRect();return {time:s.shipSimulation.seconds,x:item.x,y:item.y,gx:item.gx,gy:item.gy,roll:item.roll,vx:item.vx,vy:item.vy,spin:item.angularVelocity,contacts:nativeCollectableMotion.snapshot(s).contacts,contains:i.left>=r.left-1&&i.right<=r.right+1&&i.top>=r.top-1&&i.bottom<=r.bottom+1};}''')
  before=sample();page.wait_for_timeout(1500);coast=sample();elapsed=coast['time']-before['time']
  assert elapsed>1 and not coast['contacts'],coast
  assert abs(coast['x']-before['x']-.09*elapsed)<1e-6 and abs(coast['y']-before['y']-.03*elapsed)<1e-6
  assert abs(math.remainder(coast['roll']-before['roll']-.002*elapsed,2*math.pi))<1e-6
  page.screenshot(path=str(OUT/'slow-coast.png'))
  page.keyboard.down('w')
  try:page.wait_for_function('()=>nativeCollectableMotion.snapshot(__relicState).contacts.some(c=>c.item==="earth-roadster"&&c.category==="player")',timeout=15000)
  finally:page.keyboard.up('w')
  hit=sample();assert hit['vx']>.09 and abs(hit['spin']-.002)>.01,hit
  assert hit['contains'] and hit['contacts'][0]['closing']>1,hit
  page.screenshot(path=str(OUT/'keyboard-ram.png'))
  page.locator('#pauseBtn').click();frozen=sample();page.wait_for_timeout(300);assert sample()==frozen
  # Move the observer clear after the ram so a second contact cannot interfere
  # with the isolated save/reload comparison. Preserve all pickup motion.
  saved=page.evaluate('''()=>{const s=__relicState,item=nativeCollectables.available(s)[0],p=vexedSolFlight.shipPosition(s);nativeShipMotion.stop(s);s.x+=item.x-120-p.x;s.y+=item.y-p.y;s.previousX=item.x-120;s.previousY=item.y;
    if(!nativeSaveStorage.write(s).ok)throw Error('Impact save failed');return JSON.parse(JSON.stringify(nativeSaveStorage.read('normal').collectableMotion.items['earth-roadster']));}''')
  page.reload();page.wait_for_function('()=>!!window.nativeCombatShots');capture_state();page.locator('[data-menu="continue"]').click(timeout=120000);page.wait_for_selector('[data-collectable-id="earth-roadster"]:not([hidden])')
  page.wait_for_function('()=>!nativeMenuTransition.snapshot().active')
  restored=sample()
  predicted=page.evaluate('''({saved,time})=>nativeCollectableMotion.sample({shipSimulation:{seconds:time},collectableMotion:{version:3,layout:1,items:{'earth-roadster':saved}}},nativeCollectables.get('earth-roadster'),saved)''',{'saved':saved,'time':restored['time']})
  assert math.hypot(restored['vx'],restored['vy'])<math.hypot(saved['vx'],saved['vy']) and abs(restored['spin'])<abs(saved['angularVelocity']),(saved,restored)
  for actual,expected in [('gx','x'),('gy','y'),('vx','vx'),('vy','vy')]:assert abs(restored[actual]-predicted[expected])<1e-6,(actual,predicted,restored)
  assert abs(math.remainder(restored['roll']-predicted['roll'],2*math.pi))<1e-6
  page.wait_for_function('''()=>{const p=__relicState.collectableMotion.items['earth-roadster'];return p.vx===0&&p.vy===0&&p.angularVelocity===0;}''',timeout=20000)
  stopped=sample();page.wait_for_timeout(400);rest=sample()
  for field in ['x','y','roll','vx','vy','spin']:assert rest[field]==stopped[field],(field,rest,stopped)
  page.screenshot(path=str(OUT/'settled-after-impact.png'))
  box=page.locator('[data-collectable-id="earth-roadster"]').bounding_box();page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
  page.wait_for_timeout(250)
  if page.locator('#collectable-reveal').is_hidden():
   page.screenshot(path=str(OUT/'activation-failed.png'))
   diagnostic=page.evaluate('''()=>{const s=__relicState,p=vexedSolFlight.shipPosition(s),item=nativeCollectables.available(s)[0],b=document.querySelector('[data-collectable-id="earth-roadster"]');return {player:p,item,range:item?Math.hypot(p.x-item.x,p.y-item.y):null,paused:nativePause.active,inventory:nativeShipInventory.active,warp:vexedWarp.active,focused:document.activeElement.outerHTML,button:b.outerHTML,notice:document.querySelector('#connection').textContent,modal:document.querySelector('#modal')?.hidden,hull:s.hull,landed:s.landed,owned:s.collectables.length};}''')
   raise AssertionError({'activation':diagnostic,'saved':saved,'restored':restored,'errors':errors})
  page.wait_for_selector('#collectable-reveal[data-phase="complete"]');assert page.locator('#collectable-title').inner_text()=='Tesla Roadster'
  page.locator('[data-open-collection]').click();page.wait_for_timeout(250)
  assert page.locator('.inventory-collectables-page .inventory-deliveries-summary strong').inner_text()=='16 / 16 collected'
  page.screenshot(path=str(OUT/'recovered-after-impact.png'));assert not errors,errors
  report={'passed':True,'slowInertialCoast':[before,coast],'actualKeyboardRam':hit,'pauseFreezesMotion':True,'savedImpact':saved,'continueRetainsSlowdown':restored,'settlesToStop':stopped,'staysStopped':True,'transportAfterCollision':True,'errors':errors}
  (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True);browser.close()
finally:server.shutdown();server.server_close()
