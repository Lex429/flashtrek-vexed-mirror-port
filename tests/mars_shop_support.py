"""Shared real-game fixture and geometry checks for the Mars upgrade shop."""
import functools,http.server,json,os,threading
from contextlib import contextmanager
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
KINDS=['cargo','hull','shield','engine','thrusters','drive','weapon','dot','utility']
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
@contextmanager
def shop(folder):
 out=ROOT/'test-results'/folder;out.mkdir(parents=True,exist_ok=True)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
 threading.Thread(target=server.serve_forever,daemon=True).start();report={'passed':False,'errors':[]}
 try:
  with sync_playwright() as p:
   channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(**({'channel':channel} if channel else {}))
   page=browser.new_page(viewport={'width':1440,'height':1000},has_touch=True);page.set_default_timeout(20000)
   page.on('pageerror',lambda e:report['errors'].append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
   page.evaluate('''()=>{startNativeDevGame();const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));Object.assign(s,{devMode:false,captain:'Equipment Test',shipName:'USS Consistency',shipType:7,system:1,localBody:5,localBodySystem:1,x:230,y:-45,angle:-Math.PI/2,speed:0,vx:0,vy:0,latinum:200000,dilithium:100,deuranium:0,phase:'flight',landed:false,vitalsVersion:2,weapons:[1],weaponInventory:[],solFreightHold:{},localContracts:[],minerals:{tritanium:100,deuranium:40,trellium:100,gallicite:100,benamite:20}});for(const key of ['shipEquipment','weaponLoadout','repairBay','inventoryLayout','mineralUpgrades','shipRefit','shieldResponse','shipyardDock','arrivalApproach','localCruise','pendingTransit','devRepairDemo'])delete s[key];nativeShipEquipment.ensure(s);const d=nativeShipDefinitions.forEntity(s);s.hull=d.hull;s.shields=d.shields;const shots=nativeCombatShots;window.nativeCombatShots=Object.create(shots,{restore:{value:function(state,...args){window.__gearState=state;return shots.restore(state,...args);}}});if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');nativeShipyardServices.select();}''')
   # Load the UI at a valid berth; browser-shipyard.py exercises the physical trip.
   page.evaluate('''()=>{const s=__gearState,p=nativeShipyardServices.plan(s);Object.assign(s,{x:p.x,y:p.y,angle:p.heading,phase:'docked',landed:true,speed:0,vx:0,vy:0});s.shipyardDock={version:1,station:'mars-earth-shipyard-01',system:1,phase:'docked',plan:p,startedAt:nativeSimulation.seconds(s)};nativeShipyardServices.restore();}''')
   page.wait_for_function('()=>nativeShipyardServices.docked&&nativeShipyardServices.active')
   page.wait_for_selector('#shipyard-services [data-ship-preview].ready')
   yield page,report,out
   assert not report['errors'];report['passed']=True;browser.close()
 except Exception as error:
  report['failure']=repr(error);raise
 finally:
  (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');server.shutdown();server.server_close()
 print(json.dumps({'passed':report['passed'],'cases':len(report.get('cases',[])),'errors':report['errors']}))
def card(page,kind):return page.locator(f'.mars-shop-card[data-upgrade-card="{kind}"]')
def buy(page,kind):return card(page,kind).locator('.mars-shop-buy')
def quote(page,kind):return page.evaluate("""kind=>{const q=kind==='thrusters'?nativeShipThrusters.quote(__gearState):nativeShipyardRefits.quote(__gearState,kind);return {level:q.level,max:q.max,price:q.price,materials:q.materials};}""",kind)
def rich(page):page.evaluate("""()=>{Object.assign(__gearState,{latinum:1000000,dilithium:1000,minerals:{tritanium:1000,deuranium:1000,trellium:1000,gallicite:1000,benamite:1000}});nativeShipyardServices.render();}""")
def snapshot(page):return page.evaluate("""()=>JSON.parse(JSON.stringify(Object.fromEntries(['shipType','shipRefit','shipThrusters','shipEquipment','inventoryLayout','latinum','dilithium','minerals','hull','shields'].map(k=>[k,__gearState[k]]))))""")
def tiers(page,kind):
 q=quote(page,kind);meter=card(page,kind).locator('.mars-tier-meter')
 assert meter.locator('.mars-tier-bar').count()==q['max'] and meter.locator('.installed').count()==q['level']
 assert not meter.inner_text().strip()
def stats(page):
 expected=page.evaluate("""()=>{const d=nativeShipDefinitions.forEntity(__gearState);return {hull:d.hull,shield:d.shields,cargo:d.cargo,engine:d.speedOrOtherStationValue};}""")
 for key,value in expected.items():
  n=page.locator(f'[data-ship-stat="{key}"]');assert n.is_visible()
  assert abs(float(n.locator('strong>b').inner_text().replace(',','').replace('t','').strip())-value)<.011
 assert page.locator('.mars-upgrade-detail,.mars-detail-back').count()==0
 assert page.locator('.mars-upgrade-choice').count()==9
 assert page.locator('.yard-vessel').evaluate('n=>n.scrollHeight<=n.clientHeight+1')
def fits(page,kind):
 return card(page,kind).evaluate("""card=>{const b=card.getBoundingClientRect(),fail=[];for(const n of card.querySelectorAll('h2,th,td,button,.mars-shop-change,.mars-shop-actions,.mars-shop-bay-note,.mars-tier-bars')){if(!n.getClientRects().length||getComputedStyle(n).visibility==='hidden')continue;const a=n.getBoundingClientRect();if(a.left<b.left-1||a.right>b.right+1||a.top<b.top-1||a.bottom>b.bottom+1||n.scrollWidth>n.clientWidth+1)fail.push({text:n.textContent,why:'box overflow'});}for(const n of card.querySelectorAll('h2,th>span,td b,td small,.mars-shop-change>span,.mars-shop-change>strong,.mars-shop-bay-note')){if(getComputedStyle(n).visibility==='hidden')continue;const r=document.createRange();r.selectNodeContents(n);const a=r.getBoundingClientRect();if(a.left<b.left+1||a.right>b.right-1||a.top<b.top+1||a.bottom>b.bottom-1)fail.push({text:n.textContent,why:'text overflow'});}return fail;}""")
