"""Finished Federation roster, real previews/purchases/flight and bounded shared effects."""
import base64,functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/federation-fleet';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,channel=os.environ.get('BROWSER_CHANNEL','msedge'))
  page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(60000)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.locator('[data-menu="dev"]').click()
  page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
  initial=page.evaluate('''()=>{
   const s=nativeNpcDev.getState();window.__federationState=s;
   return {population:s.civilianTraffic.ships.length,medics:s.civilianTraffic.ships.filter(e=>e.shipType===58).length,
    armoredTugs:s.civilianTraffic.ships.filter(e=>e.shipType===416).length,
    npcTypes:[...new Set(s.civilianTraffic.ships.map(e=>e.shipType))],
    owned:Object.keys(s.shipEquipment.instances).sort()};
  }''')
  assert initial['armoredTugs']>0 and initial['medics']==100,initial
  assert all(ship in initial['npcTypes'] for ship in page.evaluate('nativeFederationFleet.types')),initial
  page.locator('#devToolsBtn').click();page.locator('[data-dev-ship]').select_option('416')
  page.wait_for_selector('[data-dev-preview].ready');page.screenshot(path=str(OUT/'armored-tug-dev.png'))
  page.locator('[data-dev-equip]').click()
  assert page.evaluate('nativeNpcDev.getState().shipType')==416
  assert page.evaluate('Object.keys(nativeNpcDev.getState().shipEquipment.instances).sort()')==initial['owned']
  page.locator('#inventoryBtn').click();page.wait_for_selector('#ship-inventory canvas.ready')
  assert 'thruster' in page.locator('#ship-inventory').inner_text().lower()
  page.screenshot(path=str(OUT/'armored-tug-inventory.png'));page.locator('.inventory-close').click()
  page.evaluate('''()=>{
   const s=nativeNpcDev.getState();nativeShipMotion.stop(s);
   Object.assign(s,{system:11,x:30000,y:30000,angle:0,phase:'flight',landed:false,localCruise:null,arrivalApproach:null});
   nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);
  }''')
  start=page.evaluate('({x:__federationState.x,y:__federationState.y,angle:__federationState.angle})')
  page.locator('#space').focus();page.keyboard.down('w')
  page.wait_for_function('()=>__federationState.speed>40',timeout=10000)
  page.keyboard.up('w');page.keyboard.down('a');page.wait_for_timeout(350);page.keyboard.up('a')
  motion=page.evaluate('({x:__federationState.x,y:__federationState.y,angle:__federationState.angle,speed:__federationState.speed})')
  assert abs(motion['x']-start['x'])+abs(motion['y']-start['y'])>10 and motion['angle']!=start['angle'],motion
  page.evaluate('''()=>{window.__federationSimulation=nativeSimulation;window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}''')
  print('Real Dev selection, inventory, new-game NPCs and manual flight passed',flush=True)
  gallery=page.evaluate('''async()=>{
   const s=__federationState,canvas=document.createElement('canvas');canvas.width=1120;canvas.height=Math.ceil(nativeFederationShips.ids.length/8)*180;
   const ctx=canvas.getContext('2d'),rows=[],assets=[];ctx.fillStyle='#050c15';ctx.fillRect(0,0,canvas.width,canvas.height);
   for(const [index,id]of nativeFederationShips.ids.entries()){
    const definition=nativeShipDefinitions.get(id),asset=await vexedFlightAssets.loadShip(id,definition.hull);
    if(!asset?.profile?.effects)throw Error('Finished Federation hull has no live effects: '+id);
    const errors=nativeShipDefinitions.validate(definition);if(errors.length)throw Error(id+': '+errors.join(', '));
    const entity={shipType:id,hull:definition.hull,shields:0,x:(index%8)*140+70,y:Math.floor(index/8)*180+84,heading:0,phase:'holding',system:s.system};
    const descriptor=nativeShipDefinitions.describe(s,entity,{category:'civilian'}),d=descriptor.dimensions;
    nativeShipEffects.paintShip(ctx,descriptor,{ship:{x:0,y:0},cx:0,cy:0,w:1120,h:canvas.height,zoom:1,asset,visualTime:1400});
    nativeShipSpriteCache.flush(ctx);
    ctx.fillStyle='#a7d7ee';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(definition.name.replace(' Class',''),entity.x,Math.floor(index/8)*180+164,132);
    rows.push({id,name:definition.name,width:d.width,height:d.height,art:[asset.width,asset.height]});assets.push(asset);
   }
   const asset=assets.find(a=>a.type===416),sample=document.createElement('canvas');sample.width=200;sample.height=280;
   const g=sample.getContext('2d',{willReadFrequently:true}),hashes=[];
   for(const time of [0,280,670,1100]){
    g.clearRect(0,0,200,280);vexedFlightAssets.drawShip(g,asset,100,130,72,0,time,{height:200,lights:true,damage:true});nativeShipSpriteCache.flush(g);
    let hash=2166136261;for(const byte of g.getImageData(0,0,200,280).data)hash=Math.imul(hash^byte,16777619);hashes.push(hash>>>0);
   }
   if(new Set(hashes).size<3)throw Error('Armored tug lamps are not animated');
   const prepared=await nativeShipEffects.prepare(416),geometry=VexedMirrorDebrisGeometry.ships[416];
   if(!prepared.optionalReady||prepared.assets.length!==4||geometry.fragments.slice(1).some(pieces=>!pieces.length)||geometry.wrecks.length!==4)throw Error('Armored tug damage or physical debris is incomplete');
   const expansion=[],hash=()=>{let value=2166136261;for(const byte of g.getImageData(0,0,200,280).data)value=Math.imul(value^byte,16777619);return value>>>0;};
   for(const [id]of nativeFederationShips.additions){
    const value=await nativeShipEffects.prepare(id),metadata=VexedMirrorDebrisGeometry.ships[id],states=[];
    if(!value.optionalReady||value.assets.length!==4||metadata.fragments.slice(1).some(p=>!p.length)||metadata.wrecks.length!==4)throw Error('Incomplete new hull damage/debris '+id);
    for(const stage of [0,1,2,3]){
     const frames=[];for(const time of [0,350,900]){g.clearRect(0,0,200,280);vexedFlightAssets.drawShip(g,value.assets[stage],100,130,150,0,time,{height:200,lights:stage===0,damage:stage>0});nativeShipSpriteCache.flush(g);frames.push(hash());}
     if(new Set(frames).size<2)throw Error('Frozen '+(stage===0?'lamps':'breach fires')+' for '+id+'/'+stage);
     states.push({stage,animatedFrames:new Set(frames).size});
    }
    let severeLamps=0;value.assets[3].profile.effects.forEachLamp(3,1000,()=>severeLamps++);if(severeLamps)throw Error('Severe lamps remain powered '+id);
    expansion.push({id,states,fragments:metadata.fragments.map(p=>p.length),severeLamps});
   }
   return {rows,expansion,animatedFrames:new Set(hashes).size,damageFrames:prepared.assets.map(a=>({stage:a.damageStage,width:a.width,height:a.height})),
    fragments:geometry.fragments.map(p=>p.length),wrecks:geometry.wrecks.map(stage=>stage.pieces.length),image:canvas.toDataURL()};
  }''')
  (OUT/'animated-federation-roster.png').write_bytes(base64.b64decode(gallery.pop('image').split(',')[1]))
  assert len(gallery['rows'])==45,gallery
  impacts=page.evaluate('''()=>{
   const base=JSON.parse(JSON.stringify(__federationState)),template=base.civilianTraffic.ships[0],rows=[],blocked=nativeSimulation.blocked;
   window.nativeSimulation={...nativeSimulation,blocked:()=>false};nativeSimulationHost.checkpoint();
   try{for(const [type]of nativeFederationShips.additions){
    nativeCombatShots.reset();nativeShipEffects.reset();
    const s=JSON.parse(JSON.stringify(base));for(const key of ['weaponCombat','shipEquipment','weaponLoadout','shipSimulation'])delete s[key];
    Object.assign(s,{devMode:false,system:1,shipType:7,phase:'flight',landed:false,x:100000,y:100000,angle:0,hull:50,shields:50,weapons:[1,0,0],weaponInventory:[],mineralUpgrades:{}});
    const origin=nativeShipDefinitions.describe(s),definition=nativeShipDefinitions.get(type);
    const e={...JSON.parse(JSON.stringify(template)),id:990000+type,shipType:type,system:1,x:origin.x+160,y:origin.y,heading:0,speed:0,phase:'holding',hull:definition.hull*.751,shields:0,mineralUpgrades:{},nextActionAt:999999};
    for(const key of ['localLeg','journey','dockingMove','shipEquipment','weaponLoadout','combatInterruption','retaliationId','disputeId'])delete e[key];
    nativeShipMotion.stop(e);s.civilianTraffic.ships=[e];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];nativeShipSystems.invalidate(s);
    const before=e.hull,pieces=nativeShipEffects.metrics().stageGeometryEmissions;
    const fired=nativeCombatShots.fireFor({state:s,shooter:nativeShipDefinitions.describe(s),target:nativeShipDefinitions.describe(s,e,{category:'civilian'}),owner:'browser-federation'});
    if(!fired.ok)throw Error('Shared firing failed for '+type+': '+fired.error);
    const dt=nativeSimulation.advance(s,.09);nativeCombatShots.advance(s,dt);nativeShipEffects.advance(s,dt);
    const target=nativeShipDefinitions.describe(s,e,{category:'civilian'}),effects=nativeShipEffects.snapshot(target);
    if(!fired.event.contact||!(e.hull<before)||effects.particles===0||nativeShipDefinitions.stage(target)!==1)throw Error('Actual beam impact/sparks/damage failed for '+type);
    if(!(nativeShipEffects.metrics().stageGeometryEmissions>pieces))throw Error('Actual impact did not eject physical armor for '+type);
    rows.push({type,damage:before-e.hull,contact:fired.event.contact.local,sparks:effects.particles,physicalArmor:true});
   }}finally{window.nativeSimulation={...nativeSimulation,blocked};nativeSimulationHost.checkpoint();}
   return rows;
  }''')
  assert len(impacts)==13,impacts
  # Enter the real Mars encounter, using its ordinary purchase callback.
  placement=page.evaluate('''()=>{
   const s=__federationState,body=nativeSystemCatalog.bodies(1).find(b=>b.id===5),p=vexedSolFlight.bodyPosition(body);
   nativeShipMotion.stop(s);Object.assign(s,{system:1,localBody:5,localBodySystem:1,localSystemVersion:2,x:0,y:75,phase:'flight',landed:false,localCruise:null,arrivalApproach:null});
   nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);vexedSpace.enterSystem(1,true);
   const rect=document.querySelector('#space').getBoundingClientRect(),v=nativeView.measure(document.querySelector('#space'));
   return {x:rect.left+(v.w/2-220)/v.w*rect.width,y:rect.top+rect.height/2};
  }''')
  page.wait_for_timeout(200);page.mouse.click(placement['x'],placement['y'])
  page.screenshot(path=str(OUT/'mars-entry.png'))
  page.locator('[data-view-tab="shop"]').click()
  for _ in range(20):
   if page.locator('[data-select-ship="436"]').count():break
   page.locator('[data-shop-page="next"]').click()
  page.locator('[data-select-ship="436"]').click();page.wait_for_selector('.encounter-ship-preview.ready')
  page.screenshot(path=str(OUT/'mars-finished-fleet.png'))
  purchase_before=page.evaluate('''()=>{
   const s=__federationState,changed=nativeShipEquipment.changeHull(s,7);if(!changed.ok)throw Error(changed.error);
   s.devMode=false;s.latinum=50000;s.localPrestige[1]=100;s.deuranium=0;s.minerals={};s.solFreightHold={};s.localContracts=[];
   nativePlanetEncounter.refresh();return {latinum:s.latinum,owned:Object.keys(s.shipEquipment.instances).sort()};
  }''')
  page.locator('[data-select-ship="436"]').click()
  page.locator('[data-buy-ship="436"]').click()
  purchase=page.evaluate('''()=>{const s=__federationState;const result={type:s.shipType,latinum:s.latinum,owned:Object.keys(s.shipEquipment.instances).sort(),thrusters:nativeShipThrusters.level(s)};s.devMode=true;return result;}''')
  assert purchase['type']==436 and purchase['latinum']==purchase_before['latinum']-3100,purchase
  assert purchase['owned']==purchase_before['owned'] and purchase['thrusters']==0,purchase
  upgrade_before=page.evaluate('''()=>{const s=__federationState;s.devMode=false;return {latinum:s.latinum,quote:nativeShipThrusters.quote(s)};}''')
  page.locator('[data-shop-category="services"]').click();page.locator('[data-upgrade-thrusters]').click()
  upgrade=page.evaluate('''()=>{const s=__federationState,r={latinum:s.latinum,level:nativeShipThrusters.level(s),speed:nativeShipDefinitions.forEntity(s).thrusters.maxSpeed};s.devMode=true;return r;}''')
  assert upgrade['level']==1 and upgrade['latinum']==upgrade_before['latinum']-upgrade_before['quote']['price'],upgrade
  assert upgrade['speed']>upgrade_before['quote']['before']['maxSpeed'],upgrade
  page.locator('.encounter-close').click()
  page.locator('#inventoryBtn').click();page.wait_for_selector('#ship-inventory canvas.ready')
  assert 'Class 9' in page.locator('#ship-inventory').inner_text()
  page.screenshot(path=str(OUT/'class-9-inventory.png'));page.locator('.inventory-close').click()
  # Continue restores the real hull, bays and thruster ownership.
  reload=page.evaluate('''()=>{
   const s=__federationState;s.devMode=true;const owned=Object.keys(s.shipEquipment.instances).sort();
   if(!nativeSaveStorage.write(s).ok)throw Error('Federation hull save failed');resumeNativeGame('dev');
   const r=nativeNpcDev.getState();return {type:r.shipType,owned:Object.keys(r.shipEquipment.instances).sort(),before:owned,thrusters:nativeShipThrusters.level(r)};
  }''')
  assert reload['type']==436 and reload['owned']==reload['before'] and reload['thrusters']==1,reload
  assert not errors,errors
  report={'passed':True,'roster':45,'excludedUnfinished':11,'initial':initial,'motion':motion,'gallery':gallery,'impacts':impacts,'purchase':purchase,'upgrade':upgrade,'continue':True,'errors':errors}
  (OUT/'browser.json').write_text(json.dumps(report,indent=2),encoding='utf8')
  print(json.dumps({'passed':True,'roster':45,'armoredTugs':initial['armoredTugs'],'animatedFrames':gallery['animatedFrames'],'purchase':purchase['type'],'continue':True}),flush=True)
  browser.close()
except Exception:
 if 'page' in locals():
  try:page.screenshot(path=str(OUT/'failure.png'))
  except Exception:pass
 raise
finally:server.shutdown();server.server_close()
