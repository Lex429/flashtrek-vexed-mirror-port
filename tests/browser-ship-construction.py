"""Real construction pixels, paid fleet purchases, midway reload and physical orders."""
import functools, http.server, json, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'/'ship-construction'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge')
  browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1440,'height':1050})
  page.set_default_timeout(30000)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
  base=f'http://127.0.0.1:{server.server_port}'
  page.goto(base+'/html-games/flashtrek-broken-mirror/damage-showcase.html?view=construction&build=35&speed=2')
  assert page.locator('[data-workspace-tab="construction"]').get_attribute('aria-selected')=='true'
  page.wait_for_function('()=>showcaseShipConstruction.snapshot().ready')
  assert page.evaluate('()=>showcaseShipConstruction.snapshot().ship===35&&showcaseShipConstruction.snapshot().speed===2')
  ids=page.evaluate('()=>showcaseShipConstruction.snapshot().ships')
  print(f'Construction showcase loaded with {len(ids)} hulls',flush=True)
  coverage=page.evaluate('''async ids=>{
   const results=[],metadata=await fetch('ship-construction-profiles.json').then(r=>r.json());
   for(const id of ids){await showcaseShipConstruction.choose(id);const s=showcaseShipConstruction.snapshot();if(!s.ready||s.ship!==id)throw Error('Hull failed '+id);if(s.bytes>s.limit)throw Error('Cache over budget');
    const entry=await shipConstructionView.prepare(metadata.ships.find(h=>h.id===id));
    if(!entry.assembly.counts.beams||!entry.assembly.counts.modules||!entry.assembly.counts.plates)throw Error('Missing physical assembly '+id);
    if(!s.dotReady||s.dotSource!=='showcase-assets/dot-basic.png')throw Error('Construction is not using the actual DOT '+id);
    results.push(id);}
   return results;
  }''',ids)
  assert len(coverage)>=80
  page.locator('[data-construction-ship]').select_option('35')
  page.wait_for_function('()=>showcaseShipConstruction.snapshot().ready&&showcaseShipConstruction.snapshot().ship===35')
  hashes=[]
  for value,name in [(14,'frame'),(42,'components'),(72,'plating'),(90,'power'),(99,'launch')]:
   page.locator('[data-construction-scrub]').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}',str(value))
   page.wait_for_timeout(120)
   state=page.evaluate('()=>shipConstructionView.snapshot()')
   assert state['last']['underFramework'] and state['last']['materialOpacity']==1,state
   if value<94: assert state['last']['dotDraws']==6,state
   hashes.append(page.locator('.construction-preview canvas').evaluate('c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let sum=0;for(let i=0;i<d.length;i+=16)sum=(sum+d[i]+d[i+1]*3+d[i+2]*7)>>>0;return sum;}'))
   page.locator('.construction-preview').screenshot(path=str(OUT/f'{name}.png'))
  assert len(set(hashes))==5,hashes
  realism=page.evaluate('''async()=>{
   const v=shipConstructionView,core=shipConstruction,data=await fetch('ship-construction-profiles.json').then(r=>r.json()),e=await v.prepare(data.ships.find(h=>h.id===35));
   const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=720;const g=canvas.getContext('2d',{willReadFrequently:true});
   const sources=new Set(e.materials.map(m=>m.image)),alphas=[],draw=g.drawImage.bind(g);
   g.drawImage=function(source,...args){if(sources.has(source))alphas.push(this.globalAlpha);return draw(source,...args);};
   for(const p of [.14,.42,.72])v.paintScene(g,e,{width:1100,height:720,seconds:e.plan.seconds*p,time:e.plan.seconds*p});
   if(!alphas.length||alphas.some(a=>a!==1))throw Error('Material faded instead of being carried');
   const job=e.assembly.jobs.find(j=>j.kind==='panel'),deliveries=[];
   for(const q of [.05,.5,.95]){const progress=job.pickup+(job.arrival-job.pickup)*q;v.paintScene(g,e,{width:1100,height:720,seconds:e.plan.seconds*progress,time:e.plan.seconds*progress});
    const d=v.snapshot().last.deliveries.find(d=>d.id===job.id);if(!d||d.alpha!==1)throw Error('Missing physical panel delivery');deliveries.push(d);}
   const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
   if(distance(deliveries[0].position,deliveries[0].origin)>3||distance(deliveries[2].position,deliveries[2].target)>3||distance(deliveries[1].position,deliveries[0].position)<5)throw Error('Panel has no continuous rack-to-hull route');
   const seconds=e.plan.seconds*.90;v.paintScene(g,e,{width:1100,height:720,seconds,time:seconds});const scene=v.snapshot().last,final=g.getImageData(0,0,1100,720).data;
   const front=document.createElement('canvas');front.width=1100;front.height=720;const f=front.getContext('2d',{willReadFrequently:true});
   f.drawImage(v.yard,scene.yard.x-scene.yard.w/2,scene.yard.y-scene.yard.h/2,scene.yard.w,scene.yard.h);const roof=f.getImageData(0,0,1100,720).data;
   f.clearRect(0,0,1100,720);const height=e.gameHeight*scene.yard.w/340;
   v.paintShip(f,e,{x:scene.berth.x,y:scene.berth.y,height,seconds,time:seconds});const under=f.getImageData(0,0,1100,720).data;
   // The supplied station has slightly translucent metal. Composite its real alpha
   // over the independent hull render rather than assuming every beam is alpha 255.
   f.drawImage(v.yard,scene.yard.x-scene.yard.w/2,scene.yard.y-scene.yard.h/2,scene.yard.w,scene.yard.h);
   const expected=f.getImageData(0,0,1100,720).data;
   let occluded=0;const halfW=height*e.w/e.h/2;
   for(let y=Math.max(0,Math.floor(scene.berth.y-height/2));y<Math.min(720,scene.berth.y+height/2);y++)for(let x=Math.max(0,Math.floor(scene.berth.x-halfW));x<Math.min(1100,scene.berth.x+halfW);x++){
    const i=(y*1100+x)*4;if(roof[i+3]<240||under[i+3]!==255)continue;
    if(Math.abs(roof[i]-under[i])+Math.abs(roof[i+1]-under[i+1])+Math.abs(roof[i+2]-under[i+2])<20)continue;
    if([0,1,2].some(c=>Math.abs(final[i+c]-expected[i+c])>2))throw Error('Ship painted over foreground station metal '+JSON.stringify({x,y,expected:Array.from(expected.slice(i,i+4)),final:Array.from(final.slice(i,i+4))}));occluded++;
   }
   if(occluded<30)throw Error('The hull does not actually pass beneath the yard frame');
   return {actualDotSprite:v.snapshot().dotSource,workers:6,solidMaterialDraws:alphas.length,continuousDeliveries:deliveries.length,occludedHullPixels:occluded,assembly:e.assembly.counts};
  }''')
  paused=page.evaluate('()=>showcaseShipConstruction.snapshot().seconds')
  page.wait_for_timeout(150)
  assert page.evaluate('()=>showcaseShipConstruction.snapshot().seconds')==paused
  print('All hull artwork prepared; five construction phases have distinct real pixels; scrub and pause passed',flush=True)
  page.goto(base+'/html-games/broken-mirror-port/index.html')
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('startNativeDevGame()')
  page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
  def observe():
   page.evaluate('''()=>{
    const ensure=nativeShipEquipment.ensure;
    window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__buildState=s;return ensure(s,h,d);}};
    window.__buildClock=nativeSimulation;window.nativeSimulation={...__buildClock,blocked:()=>true};nativeSimulationHost.checkpoint();
    window.__buildTick=seconds=>{const s=__buildState;window.nativeSimulation={...__buildClock,blocked:()=>false};try{nativeSimulation.advance(s,seconds);const result=nativeShipConstruction.advance(s,seconds,()=>nativeSaveStorage.write(s));if(!result.ok)throw Error(result.error);return result;}finally{window.nativeSimulation={...__buildClock,blocked:()=>true};nativeSimulationHost.checkpoint();}};
   }''')
  observe()
  initial=page.evaluate('''()=>{
   const s=nativeNpcDev.getState();window.__buildState=s;
   Object.assign(s,{devMode:false,captain:'Construction Test',government:'Test Fleet',shipType:7,system:1,localBody:3,localBodySystem:1,localSystemVersion:2,phase:'flight',landed:false,latinum:500000,deuranium:0,minerals:{},solFreightHold:{},localContracts:[],angle:-Math.PI/2,speed:0,vx:0,vy:0});
   for(const key of ['shipyardDock','localCruise','arrivalApproach','pendingTransit','manualFlightRegion'])delete s[key];
   const yard=nativeShipConstruction.position(s),body=nativeSystemCatalog.bodies(1).find(b=>b.id===3);s.x=yard.x-body.x;s.y=yard.y-body.y;
   nativeShipEquipment.ensure(s);nativeSaveStorage.write(s);
   return {count:s.civilianTraffic.ships.length,money:s.latinum,shipType:s.shipType};
  }''')
  page.locator('#fleet-shipyard-button').click()
  page.locator('[data-build-class]').select_option('7')
  page.locator('[data-build-name]').fill('ISS First Commission')
  page.locator('[data-build-order]').click()
  first=page.evaluate('()=>__buildState.shipConstruction.orders[0]')
  assert first['price']>0,first
  assert page.evaluate('()=>__buildState.shipType')==initial['shipType']
  assert page.evaluate('()=>__buildState.latinum')==initial['money']-first['price']
  page.locator('[data-build-class]').select_option('6')
  page.locator('[data-build-name]').fill('ISS Second Commission')
  page.locator('[data-build-order]').click()
  second=page.evaluate('()=>__buildState.shipConstruction.orders[1]')
  assert second['startAt']==first['finishAt']
  page.locator('[data-build-class]').select_option('7')
  page.evaluate('__buildTick(__buildState.shipConstruction.orders[0].duration*.47)')
  page.wait_for_function('()=>document.querySelector("[data-build-mode]").textContent==="LIVE CONSTRUCTION"')
  page.screenshot(path=str(OUT/'game-mid-construction.png'))
  page.evaluate('()=>nativeSaveStorage.write(__buildState)')
  page.reload()
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  observe();page.evaluate('resumeNativeGame("normal")')
  page.wait_for_function('()=>window.__buildState?.shipConstruction?.orders?.length===2',timeout=120000)
  assert page.evaluate('()=>nativeShipConstruction.fleet(__buildState).length')==0
  result=page.evaluate('__buildTick(__buildState.shipConstruction.orders[1].finishAt-nativeSimulation.seconds(__buildState)+.1)')
  assert result['commissioned']==2,result
  assert page.evaluate('__buildTick(.1).commissioned')==0
  assert page.evaluate('()=>__buildState.civilianTraffic.ships.length')==initial['count']+2
  page.locator('#fleet-shipyard-button').click()
  page.locator('[data-build-open-fleet]').click()
  assert page.locator('#ship-construction').is_hidden()
  assert page.locator('.inventory-fleet-row').count()==2
  page.locator('[data-fleet-order="follow"]').first.click()
  assert page.evaluate('()=>nativeShipConstruction.fleet(__buildState)[0].fleetOrder.mode')=='follow'
  page.locator('[data-fleet-order="hold"]').first.click()
  assert page.evaluate('()=>nativeShipConstruction.fleet(__buildState)[0].fleetOrder.mode')=='hold'
  page.locator('[data-fleet-command]').nth(1).click()
  assert page.evaluate('()=>__buildState.shipType')==6
  assert page.evaluate('()=>__buildState.shipName')=='ISS Second Commission'
  page.screenshot(path=str(OUT/'fleet-purchased.png'))
  # Sol port catalogs expose the destination and have no direct hull purchase action.
  shop=page.evaluate('()=>nativePlanetServices.shop(__buildState,{id:3,name:"Earth",port:true},{},"",true)')
  assert 'data-buy-ship' not in shop and 'Earth Heavy Shipyard' in shop
  page.locator('.inventory-close').click()
  page.evaluate('()=>nativeSaveStorage.write(__buildState)')
  page.reload();page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  observe();page.evaluate('resumeNativeGame("normal")')
  page.wait_for_function('()=>window.__buildState?.shipConstruction?.orders?.length===2',timeout=120000)
  assert page.evaluate('()=>nativeShipConstruction.fleet(__buildState).length')==2
  assert page.evaluate('()=>__buildState.shipType')==6
  assert not errors,errors
  report={'previewHulls':len(coverage),'phasePixelHashes':hashes,'realisticAssembly':realism,'purchased':2,'charged':first['price']+second['price'],'midwayReload':True,'commissionedReload':True,'commandTransfer':True,'errors':errors}
  (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
  print(json.dumps(report),flush=True)
  browser.close()
finally:
 server.shutdown()
