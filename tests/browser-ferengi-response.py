"""Real Ferenginar weapon contacts, civilian protection, resident patrols and Continue."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/ferengi-response/browser'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge')
  browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1280,'height':850});page.set_default_timeout(120000)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('startNativeDevGame()');page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200')
  initial=page.evaluate('''()=>{window.__sim=nativeSimulation;window.nativeSimulation={...__sim,blocked:()=>true};nativeSimulationHost.checkpoint();return JSON.stringify(nativeNpcDev.getState());}''')
  page.evaluate('''()=>{
    window.__contacts=[];const api=nativeCivilianTraffic,playerHit=nativeCombatShots.onPlayerHit;
    window.nativeCivilianTraffic={...api,hit(state,id,amount,impact){const result=api.hit(state,id,amount,impact);if(impact?.source==='player')__contacts.push({id,event:impact.weaponEventId,ok:result.ok});return result;}};
    nativeCombatShots.onPlayerHit=(state,damage,impact)=>{if(impact.sourceGovernmentId===7)__contacts.push({player:true,source:impact.sourceId,damage});return playerHit(state,damage,impact);};
    window.__tick=count=>{window.nativeSimulation={...__sim,blocked:()=>false};nativeSimulationHost.checkpoint();try{for(let i=0;i<count;i++){
      const s=nativeNpcDev.getState();nativeSimulationFrame.begin(s);const dt=nativeSimulation.advance(s,1/60);
      nativeSolEconomy.advance(s,dt);nativeCivilianTraffic.advance(s,dt);nativeCombatShots.advance(s,dt);nativeShipEffects.advance(s,dt);nativeShipTraffic.collide(s,dt);nativeSimulationFrame.end(s);
    }}finally{window.nativeSimulation={...__sim,blocked:()=>true};nativeSimulationHost.checkpoint();}};
  }''')
  cases=[]
  for ship_type in [19,18,17]:
   setup=page.evaluate('''({saved,type})=>{
    if(!nativeSaveStorage.write(JSON.parse(saved)).ok)throw Error('Fixture save failed');resumeNativeGame('dev');const s=nativeNpcDev.getState();
    const e=s.civilianTraffic.ships.find(e=>e.ownerGovernmentId===7&&e.shipType===type&&e.system===14&&!e.journey&&e.hull>0&&nativeFactionDefence.region(s,e)===14&&Math.hypot(e.x,e.y)>750);
    if(!e)throw Error('Ferenginar has no local '+type+' hull');
    const guards=s.civilianTraffic.ships.filter(e=>e.ownerGovernmentId===7&&e.role==='patrol'&&e.system===14&&!e.journey&&e.hull>0);
    if(guards.length<nativeFactionFleets.defenderTarget(s,14))throw Error('All Ferenginar patrols left their home system');
    nativeNpcDev.visit(e.id);const target=nativeShipSystems.resolve(s,e.id);nativeShipMotion.stop(s);
    Object.assign(s,{x:target.x+240,y:target.y+120,landed:false,phase:'flight',hull:100000,shields:100000,localCruise:null,arrivalApproach:null});
    s.localPrestige[14]=0;nativeWeaponLoadout.refit(s,[1]);nativeManualFlight.initializeRegion(s);nativeShipSystems.refreshShip(s,s,'player');
    window.__victimId=e.id;__contacts=[];return {id:e.id,type,role:e.role,localPatrols:guards.length};
   }''',{'saved':initial,'type':ship_type})
   fired=page.evaluate('''()=>{
    const s=nativeNpcDev.getState(),id=__victimId;window.nativeSimulation={...__sim,blocked:()=>false};nativeSimulationHost.checkpoint();
    try{const result=nativeCombatShots.fireFor({state:s,shooter:nativeShipDefinitions.describe(s),getSource:()=>nativeShipDefinitions.describe(s),target:nativeShipSystems.resolve(s,id),getTarget:()=>nativeShipSystems.resolve(s,id),selection:{slot:0},owner:'player'});if(!result.ok)throw Error(result.error);return result.event.id;}
    finally{window.nativeSimulation={...__sim,blocked:()=>true};nativeSimulationHost.checkpoint();}
   }''')
   page.evaluate('__tick(1200)')
   result=page.evaluate('''({id,type,event})=>{
    const s=nativeNpcDev.getState(),victim=nativeNpcLives.find(s,id),orders=s.factionDefence?.orders||[],hits=__contacts.filter(hit=>hit.player),team=new Set(orders.map(order=>order.shipId));
    if(!__contacts.some(hit=>hit.id===id&&hit.event===event&&hit.ok))throw Error('The player weapon did not physically hit the chosen '+type+' hull');
    if(s.localPrestige[14]!==-5)throw Error('The attack did not charge Ferengi territorial reputation exactly once');
    if(!orders.length||orders.length>3||orders.some(order=>order.targetId!=='player'))throw Error('Ferengi defenders ignored or abandoned the player attack');
    if(!hits.some(hit=>team.has(hit.source)))throw Error('Ferengi patrol weapons never physically hit the player');
    if(type!==17&&(victim.npcRole!=='civilian'||nativeFactionDefence.isFaction(victim)))throw Error('Civilian protection converted the victim into a military crew');
    const before=JSON.stringify(orders);if(!nativeSaveStorage.write(s).ok)throw Error('Response checkpoint failed');resumeNativeGame('dev');
    const loaded=nativeNpcDev.getState();if(JSON.stringify(loaded.factionDefence.orders)!==before)throw Error('Continue changed the committed Ferengi response');
    loaded.hull=loaded.shields=100000;return {type,reputation:loaded.localPrestige[14],orders:loaded.factionDefence.orders,realPatrolContacts:hits.length,victimRole:victim.role,continueStable:true,population:loaded.civilianTraffic.ships.length};
   }''',{'id':setup['id'],'type':ship_type,'event':fired})
   page.evaluate('__tick(60)');cases.append({**setup,**result})
   print(json.dumps(cases[-1]),flush=True)
  assert not errors,errors
  report={'passed':True,'cases':cases,'errors':errors,'scope':'Functional fixed-step game simulation and actual weapon collision owner; no display FPS qualification.'}
  (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({'passed':True,'ferengiTypes':[r['type'] for r in cases],'realWeaponContacts':sum(r['realPatrolContacts'] for r in cases)}))
  browser.close()
finally:server.shutdown();server.server_close()
