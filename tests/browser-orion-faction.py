"""Orion worker population, real weapon contacts, civilian protection, purchases and Continue."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/orion/browser'
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
  artwork=page.evaluate('''async()=>{
    const rows=[];
    for(const type of nativeOrionShips.ids){
      const definition=nativeShipDefinitions.get(type),asset=await vexedFlightAssets.loadShip(type,definition.hull),canvas=document.createElement('canvas');
      canvas.width=asset.width;canvas.height=asset.height;const g=canvas.getContext('2d',{willReadFrequently:true});g.drawImage(asset.art,0,0);
      const pixels=g.getImageData(0,0,canvas.width,canvas.height).data,mounts=[];
      for(const [kind,point] of Object.entries(definition.emitters)){
        const x=Math.round((point.x+.5)*canvas.width),y=Math.round((point.y+.5)*canvas.height),alpha=pixels[(y*canvas.width+x)*4+3];
        if(alpha<150)throw Error('Weapon mount floats outside original Orion hull '+type+'/'+kind+' alpha='+alpha);mounts.push({kind,x,y,alpha});
      }
      let clear=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<8)clear++;
      if(clear<canvas.width*canvas.height*.3)throw Error('Orion sprite contains an opaque background '+type);
      rows.push({type,mounts,transparentFraction:clear/(canvas.width*canvas.height)});
    }
    return rows;
  }''')
  initial=page.evaluate('''()=>{window.__sim=nativeSimulation;window.nativeSimulation={...__sim,blocked:()=>true};nativeSimulationHost.checkpoint();return JSON.stringify(nativeNpcDev.getState());}''')
  page.evaluate('''()=>{
    window.__contacts=[];const api=nativeCivilianTraffic,playerHit=nativeCombatShots.onPlayerHit;
    window.nativeCivilianTraffic={...api,hit(state,id,amount,impact){const result=api.hit(state,id,amount,impact);if(impact?.source==='player')__contacts.push({id,event:impact.weaponEventId,ok:result.ok});return result;}};
    nativeCombatShots.onPlayerHit=(state,damage,impact)=>{if(impact.sourceGovernmentId===45)__contacts.push({player:true,source:impact.sourceId,damage});return playerHit(state,damage,impact);};
    window.__tick=count=>{window.nativeSimulation={...__sim,blocked:()=>false};nativeSimulationHost.checkpoint();try{for(let i=0;i<count;i++){
      const s=nativeNpcDev.getState();nativeSimulationFrame.begin(s);const dt=nativeSimulation.advance(s,1/60);
      nativeSolEconomy.advance(s,dt);nativeCivilianTraffic.advance(s,dt);nativeCombatShots.advance(s,dt);nativeShipEffects.advance(s,dt);nativeShipTraffic.collide(s,dt);nativeSimulationFrame.end(s);
    }}finally{window.nativeSimulation={...__sim,blocked:()=>true};nativeSimulationHost.checkpoint();}};
  }''')
  cases=[]
  for ship_type in [449,446,447,448]:
   setup=page.evaluate('''({saved,type})=>{
    if(!nativeSaveStorage.write(JSON.parse(saved)).ok)throw Error('Fixture save failed');resumeNativeGame('dev');const s=nativeNpcDev.getState();
    const e=s.civilianTraffic.ships.find(e=>e.ownerGovernmentId===45&&e.shipType===type&&e.system===2&&!e.journey&&e.hull>0&&nativeFactionDefence.region(s,e)===2);
    if(!e)throw Error('Orion has no local '+type+' hull');
    const guards=s.civilianTraffic.ships.filter(e=>e.ownerGovernmentId===45&&e.role==='patrol'&&e.system===2&&!e.journey&&e.hull>0);
    if(guards.length<nativeFactionFleets.defenderTarget(s,2))throw Error('All Orion patrols left their home system');
    nativeNpcDev.visit(e.id);const target=nativeShipSystems.resolve(s,e.id);nativeShipMotion.stop(s);
    const away=Math.atan2(target.y-75,target.x+220);Object.assign(s,{x:target.x+Math.cos(away)*240,y:target.y+Math.sin(away)*240,landed:false,phase:'flight',hull:100000,shields:100000,localCruise:null,arrivalApproach:null});
    s.localPrestige[2]=0;nativeWeaponLoadout.refit(s,[1]);nativeManualFlight.initializeRegion(s);nativeShipSystems.refreshShip(s,s,'player');
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
    if(s.localPrestige[2]!==-5)throw Error('The attack did not charge Orion territorial reputation exactly once');
    if(!orders.length||orders.length>3||orders.some(order=>order.targetId!=='player'))throw Error('Orion defenders ignored or abandoned the player attack');
    if(!hits.some(hit=>team.has(hit.source)))throw Error('Orion patrol weapons never physically hit the player');
    if([446,449].includes(type)&&(victim.npcRole!=='civilian'||nativeFactionDefence.isFaction(victim)))throw Error('Civilian protection converted the victim into a military crew');
    const before=JSON.stringify(orders);if(!nativeSaveStorage.write(s).ok)throw Error('Response checkpoint failed');resumeNativeGame('dev');
    const loaded=nativeNpcDev.getState();if(JSON.stringify(loaded.factionDefence.orders)!==before)throw Error('Continue changed the committed Orion response');
    loaded.hull=loaded.shields=100000;return {type,reputation:loaded.localPrestige[2],orders:loaded.factionDefence.orders,realPatrolContacts:hits.length,victimRole:victim.role,continueStable:true,population:loaded.civilianTraffic.ships.length};
   }''',{'id':setup['id'],'type':ship_type,'event':fired})
   page.evaluate('__tick(60)');cases.append({**setup,**result})
   print(json.dumps(cases[-1]),flush=True)
  # Exercise the actual normal-mode purchase buttons and Inventory renderer.
  page.evaluate('''saved=>{
    const api=nativeCombatShots;window.nativeCombatShots={...api,restore(state,...args){window.__normalState=state;return api.restore(state,...args);}};
    const equipment=nativeShipEquipment;window.nativeShipEquipment={...equipment,ensure(state,holder=state,...args){if(state?.captain&&holder===state)window.__normalState=state;return equipment.ensure(state,holder,...args);}};
    const s=JSON.parse(saved);Object.assign(s,{devMode:false,captain:'Orion purchase check',system:2,localBody:0,localNavTarget:0,localBodySystem:2,localCruise:null,arrivalApproach:null,landed:false,phase:'flight',x:500,y:200,latinum:1000000});
    s.localPrestige[2]=100;s.deuranium=12;s.antimatter=80;s.dilithium=25;s.food=40;s.localContracts=[];s.solFreightHold={};s.minerals={};
    nativeShipMotion.stop(s);nativeManualFlight.initializeRegion(s);
    if(!nativeSaveStorage.write(s).ok)throw Error('Purchase fixture save failed');resumeNativeGame('normal');
  }''',initial)
  purchases=[]
  for ship_type in [446,447,448,449]:
   page.locator('#tradeBtn').click();page.locator('#system-hub [data-tab="shipyard"]').click()
   button=page.locator(f'#system-hub [data-ship="{ship_type}"]')
   assert button.is_enabled(),f'Orion hull {ship_type} is not purchasable at Orion'
   before=page.evaluate('__normalState.latinum');price=page.evaluate('id=>nativeShipDefinitions.get(id).price',ship_type)
   button.click();assert page.evaluate('__normalState.shipType')==ship_type,page.locator('#system-hub').inner_text()
   assert page.evaluate('__normalState.latinum')==before-price
   page.locator('#system-hub .hub-close').click();page.locator('#inventoryBtn').click()
   page.wait_for_selector('#ship-inventory canvas.ready',timeout=60000)
   assert page.locator('#ship-inventory [data-equipment-kind="engineering"][data-equipment-place="slot"]').count()==1
   assert page.locator('#ship-inventory [data-equipment-kind="shield"][data-equipment-place="slot"]').count()==1
   page.screenshot(path=str(OUT/f'inventory-{ship_type}.png'))
   page.locator('.inventory-close').click()
   before_flight=page.evaluate('''()=>{const s=__normalState;window.nativeSimulation={...__sim,blocked:()=>false};nativeSimulationHost.checkpoint();return {x:s.x,y:s.y};}''')
   page.keyboard.down('w');page.wait_for_timeout(350);page.keyboard.up('w')
   after_flight=page.evaluate('''()=>{window.nativeSimulation={...__sim,blocked:()=>true};nativeSimulationHost.checkpoint();return {x:__normalState.x,y:__normalState.y};}''')
   moved=((after_flight['x']-before_flight['x'])**2+(after_flight['y']-before_flight['y'])**2)**.5
   assert moved>.1,f'Purchased Orion hull {ship_type} does not fly with the real controls'
   purchases.append({'type':ship_type,'priceCharged':price,'inventoryReady':True,'realKeyMovement':moved})
  page.locator('#tradeBtn').click();page.locator('#system-hub [data-tab="services"]').click()
  page.locator('[data-view-tab="shop"]').click();page.locator('[data-shop-category="services"]').click()
  thruster_quote=page.evaluate('nativeShipThrusters.quote(__normalState)');wallet=page.evaluate('__normalState.latinum')
  page.locator('[data-upgrade-thrusters]').click()
  assert page.evaluate('nativeShipThrusters.level(__normalState)')==1
  assert page.evaluate('__normalState.latinum')==wallet-thruster_quote['price']
  page.locator('.encounter-close').click()
  page.evaluate('''()=>{
    const s=__normalState,owned=JSON.stringify(s.shipEquipment),thrusters=JSON.stringify(s.shipThrusters);
    if(!nativeSaveStorage.write(s).ok)throw Error('Normal Orion save failed');resumeNativeGame('normal');
    if(__normalState.shipType!==449||JSON.stringify(__normalState.shipEquipment)!==owned||JSON.stringify(__normalState.shipThrusters)!==thrusters)throw Error('Continue lost the purchased Orion ship or fitting');
  }''')
  expected=page.evaluate('''()=>({type:__normalState.shipType,equipment:JSON.stringify(__normalState.shipEquipment),thrusters:JSON.stringify(__normalState.shipThrusters)})''')
  page.reload();page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('''expected=>{
    const api=nativeCombatShots;window.nativeCombatShots={...api,restore(state,...args){window.__normalState=state;return api.restore(state,...args);}};
    window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();resumeNativeGame('normal');
    const s=__normalState;
    if(s.shipType!==expected.type||JSON.stringify(s.shipEquipment)!==expected.equipment||JSON.stringify(s.shipThrusters)!==expected.thrusters)throw Error('A real page reload lost the Orion hull, owned fitting or thruster upgrade');
    if(s.civilianTraffic.ships.length!==1200||s.civilianTraffic.ships.filter(e=>e.shipType===58).length!==100)throw Error('Reload changed the population');
  }''',expected)
  assert not errors,errors
  report={'passed':True,'artwork':artwork,'cases':cases,'purchases':purchases,'thrusterUpgrade':{'level':1,'priceCharged':thruster_quote['price']},'normalContinue':True,'pageReload':True,'errors':errors,'scope':'Functional fixed-step game simulation and actual weapon collision owner; no display FPS qualification.'}
  (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({'passed':True,'orionTypes':[r['type'] for r in cases],'realWeaponContacts':sum(r['realPatrolContacts'] for r in cases)}))
  browser.close()
finally:server.shutdown();server.server_close()
