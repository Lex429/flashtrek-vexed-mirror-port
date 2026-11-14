"""Actual Badlands warp, full interior fog, starless flight and durable Continue."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/badlands';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];failed=[];report={}
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850})
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
  page.locator('[data-menu="dev"]').click(timeout=60000);page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200&&nativeCombatShots.isReady()',timeout=120000)
  page.wait_for_function('()=>{if(vexedWarp.active)return true;const r=nativeNavigation.call("course",73);window.__badlandsAttempt=r;return r.ok;}',timeout=45000)
  page.wait_for_function('()=>vexedWarp.phase==="report"&&vexedWarp.snapshot().ready||vexedWarp.phase==="error"',timeout=120000)
  assert page.evaluate('vexedWarp.phase')=='report',page.evaluate('vexedWarp.snapshot()')
  report['receipt']=page.evaluate('()=>({report:vexedWarp.report,save:nativeSaveStorage.read("dev").pendingTransit})')
  # Observe the actual arrival stop. Ambient weather can begin applying a tiny
  # drift between the warp closing and the later browser inspection.
  page.evaluate('''()=>{const motion=nativeShipMotion;window.nativeShipMotion=Object.create(motion,{stop:{value:function(entity,...args){const result=motion.stop(entity,...args);if(entity.system===73&&vexedWarp.active)window.__badlandsArrivalStop={x:entity.x,y:entity.y,speed:entity.speed};return result;}}});}''')
  page.locator('.warp-continue').click();page.wait_for_function('()=>!vexedWarp.active||vexedWarp.phase==="error"',timeout=60000)
  assert page.evaluate('vexedWarp.phase')=='idle',page.evaluate('vexedWarp.snapshot()')
  report['arrival']=page.evaluate('''()=>{const s=nativeNpcDev.getState(),b=nativeSystemCatalog.boundary(73);return {system:s.system,x:s.x,y:s.y,q:Math.hypot(s.x/b.rx,s.y/b.ry),approach:s.arrivalApproach??null,speed:s.speed,population:s.civilianTraffic.ships.length,medical:s.civilianTraffic.ships.filter(e=>e.shipType===58).length,region:nativeManualFlight.currentRegion(s)};}''')
  report['arrival']['initialStop']=page.evaluate('window.__badlandsArrivalStop')
  a=report['arrival'];assert a['system']==73 and .995<a['q']<1 and a['approach'] is None and a['initialStop']['speed']==0 and a['region']['system']==73,a
  page.wait_for_function('()=>nativeGalaxyFog.materials().some(m=>m.field.ready)',timeout=120000);page.screenshot(path=str(OUT/'edge-arrival.png'))
  report['locations']=[]
  for name,x,y in [('interior',0,0),('tile-corner',1000,700),('old-gap',2048,1536),('north',0,-46000),('west',-62000,0),('outside-fringe',65000,0)]:
   page.evaluate('''({x,y})=>{const s=nativeNpcDev.getState();nativeGalaxyFog.dispose();nativeShipMotion.stop(s);Object.assign(s,{system:73,x,y,localBody:0,localBodySystem:73,localNavTarget:0,localCruise:null,arrivalApproach:null,landed:false});nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);}''',{'x':x,'y':y})
   page.wait_for_function('()=>nativeGalaxyFog.materials().some(m=>m.field.ready)',timeout=120000);page.wait_for_timeout(250)
   row=page.evaluate('''()=>{const s=nativeNpcDev.getState(),p=vexedSolFlight.shipPosition(s),b=nativeSystemCatalog.boundary(73),v={w:1280,h:850,cx:640,cy:425,zoom:1,camera:p,cameraX:p.x,cameraY:p.y,playerX:p.x,playerY:p.y};return {x:s.x,y:s.y,starless:nativeBadlands.starless(s.system,v),stars:nativeRegionalStarfield.sample(s.system,v).density,suns:nativeStellarBackground.project(s.system,v).length,bodies:vexedSolFlight.visibleBodies(s,v).length,rocks:nativeSolAsteroids.queryBounds(73,{minX:p.x-700,minY:p.y-450,maxX:p.x+700,maxY:p.y+450}).length,fog:nativeGalaxyFog.snapshot(),material:nativeGalaxyFog.materials().map(m=>({id:m.id,ready:m.field.ready,w:m.field.w,h:m.field.h,metrics:m.field.metrics(true)})),gas:nativeNebulaGas.metrics()};}''')
   row['name']=name;report['locations'].append(row)
   assert row['bodies']==0 and row['gas']['failures']==0,row
   if name!='outside-fringe':assert row['starless'] and row['stars']==0 and row['suns']==0 and row['rocks']==0,row
   assert row['material'] and all(m['ready'] for m in row['material']),row
   page.screenshot(path=str(OUT/(name+'.png')))
  # A real key-driven pass across an existing seam must retain material mass.
  page.evaluate('''()=>{const s=nativeNpcDev.getState();nativeShipMotion.stop(s);Object.assign(s,{x:900,y:700,angle:0});nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);}''')
  page.locator('#space').focus();page.keyboard.down('w');page.wait_for_timeout(2000);page.keyboard.up('w');page.keyboard.down('x');page.wait_for_timeout(1400);page.keyboard.up('x')
  report['wake']=page.evaluate('()=>nativeGalaxyFog.materials().map(m=>({id:m.id,metrics:m.field.metrics(true)}))')
  assert any(m['metrics']['sweeps']>0 for m in report['wake']),report['wake']
  for m in report['wake']:
   a=m['metrics'];assert abs(a['mass']-a['initialMass'])/max(1,a['initialMass'])<.0001,a
  report['save']=page.evaluate('''()=>{const s=nativeNpcDev.getState(),before={system:s.system,x:s.x,y:s.y,latinum:s.latinum,ids:s.civilianTraffic.ships.map(e=>e.id)};const saved=nativeSaveStorage.write(s);if(!saved.ok)throw Error(saved.error);resumeNativeGame('dev');const r=nativeNpcDev.getState();if(r.system!==before.system||r.x!==before.x||r.y!==before.y||r.latinum!==before.latinum||JSON.stringify(before.ids)!==JSON.stringify(r.civilianTraffic.ships.map(e=>e.id)))throw Error('Continue lost saved contents');return {system:r.system,version:r.badlandsRegionVersion,population:r.civilianTraffic.ships.length,holds:true};}''')
  assert not errors and not failed,(errors,failed)
  report.update(passed=True,errors=errors,failed=failed);(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps({'passed':True,'arrival':report['arrival'],'locations':[r['name'] for r in report['locations']],'save':report['save']}))
  browser.close()
finally:
 if errors:print(json.dumps({'errors':errors}))
 server.shutdown();server.server_close()
