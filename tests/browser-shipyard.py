"""Real Mars station clicks, shared flight, atomic purchases, fitting and saved docking."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'mars-outfitting'
OUTPUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1440,'height':1000})
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda response:errors.append(f'{response.status} {response.url}') if response.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden && nativeShipyardServices',timeout=120000)
        page.evaluate('()=>startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length',timeout=120000)
        page.evaluate('''()=>{window.__shipyardState=nativeNpcDev.getState();const ensure=nativeShipEquipment.ensure;window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__shipyardState=s;return ensure(s,h,d);}};}''')
        page.evaluate('''()=>{
          const s=JSON.parse(JSON.stringify(window.__shipyardState));
          Object.assign(s,{devMode:false,captain:'Yard Test',shipName:'USS Refit',shipType:7,system:1,localBody:5,x:230,y:-45,angle:-Math.PI/2,speed:0,vx:0,vy:0,latinum:200000,dilithium:250,deuranium:0,phase:'flight',landed:false,vitalsVersion:2,weapons:[1],weaponInventory:[],solFreightHold:{},localContracts:[],minerals:{trellium:100,tritanium:100,gallicite:60,benamite:20,deuranium:40}});
          for(const key of ['shipEquipment','weaponLoadout','repairBay','shipRefit','shieldResponse','shipyardDock','arrivalApproach','localCruise','pendingTransit'])delete s[key];
          nativeShipEquipment.ensure(s);const d=nativeShipDefinitions.forEntity(s);s.hull=d.hull;s.shields=d.shields;
          if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');
        }''')
        page.wait_for_function('()=>nativeMarsShipyard.snapshot().ready',timeout=120000)
        def click_station():
            point=page.evaluate('''()=>{const s=window.__shipyardState,ship=vexedSolFlight.shipPosition(s),canvas=document.querySelector('#space'),rect=canvas.getBoundingClientRect(),v=nativeView.measure(canvas),p=nativeMarsShipyard.visible({state:s,ship,cx:v.w/2,cy:v.h/2,zoom:1,w:v.w,h:v.h});return {x:rect.x+p.x*rect.width/v.w,y:rect.y+p.y*rect.height/v.h};}''')
            page.mouse.click(point['x'],point['y'])
        click_station()
        page.locator('[data-yard-action="dock"]').wait_for()
        page.screenshot(path=str(OUTPUT/'01-contact.png'))
        start=page.evaluate('()=>({x:window.__shipyardState.x,y:window.__shipyardState.y})')
        page.locator('[data-yard-action="dock"]').click()
        page.wait_for_function('()=>nativeShipyardServices.snapshot().dock?.phase==="approach"')
        page.wait_for_timeout(450)
        assert page.evaluate('()=>!nativeShipyardServices.active')
        moved=page.evaluate('()=>({x:window.__shipyardState.x,y:window.__shipyardState.y})')
        assert moved!=start
        page.screenshot(path=str(OUTPUT/'02-approach.png'))
        page.evaluate('()=>{if(!nativeSaveStorage.write(window.__shipyardState).ok)throw Error("Mid-approach save failed");resumeNativeGame("normal");}')
        page.wait_for_function('()=>nativeShipyardServices.snapshot().dock?.phase==="approach" && !nativeShipyardServices.active')
        page.wait_for_function('()=>nativeShipyardServices.docked && nativeShipyardServices.active',timeout=90000)
        pose=page.evaluate('''()=>{const s=window.__shipyardState,p=vexedSolFlight.shipPosition(s),d=s.shipyardDock;return {error:Math.hypot(p.x-d.plan.x,p.y-d.plan.y),berth:d.plan.berth,lights:nativeShipyardServices.appearance(s).lights};}''')
        assert pose['error']<.7 and pose['lights'] is False,pose
        assert page.locator('[data-yard-tab]').count()==5
        page.wait_for_function('()=>document.querySelector("#shipyard-services [data-ship-preview]")?.classList.contains("ready")')
        assert page.evaluate('()=>getComputedStyle(document.querySelector("#shipyard-services .inventory-drone-grid")).gridTemplateColumns.split(" ").length')==6
        page.screenshot(path=str(OUTPUT/'03-upgrades.png'))
        original=page.evaluate('()=>({latinum:__shipyardState.latinum,dilithium:__shipyardState.dilithium,minerals:{...__shipyardState.minerals},slots:JSON.stringify(__shipyardState.shipEquipment.slots),instances:JSON.stringify(__shipyardState.shipEquipment.instances)})')
        page.locator('[data-yard-action="upgrade"][data-kind="dot"]').click()
        assert page.locator('.outfit-ghost').count()==1
        assert page.locator('[data-yard-action="confirm-upgrade"]').is_disabled()
        assert page.evaluate('()=>nativeShipEquipment.capacities(__shipyardState).repairDrone')==1
        page.locator('[data-yard-action="cancel-preview"]').first.click()
        assert page.locator('.outfit-ghost').count()==0
        cancelled=page.evaluate('()=>({latinum:__shipyardState.latinum,dilithium:__shipyardState.dilithium,minerals:{...__shipyardState.minerals},slots:JSON.stringify(__shipyardState.shipEquipment.slots),instances:JSON.stringify(__shipyardState.shipEquipment.instances)})')
        assert cancelled==original
        page.locator('[data-yard-action="upgrade"][data-kind="dot"]').click()
        page.locator('[data-place-bay="5"][data-bay-zone="drones"]').click()
        assert page.locator('.outfit-ghost').get_attribute('data-bay-cell')=='5'
        assert page.evaluate('()=>__shipyardState.latinum')==original['latinum']
        page.screenshot(path=str(OUTPUT/'03a-dot-placement-preview.png'))
        page.locator('[data-yard-action="confirm-upgrade"]').click()
        assert page.evaluate('()=>nativeShipEquipment.capacities(__shipyardState).repairDrone')==2
        assert page.locator('[data-bay-key="repairDrone:1"]').get_attribute('data-bay-cell')=='5'
        assert page.locator('[data-bay-key="repairDrone:0"]').get_attribute('data-bay-cell')=='0'
        assert page.evaluate('()=>__shipyardState.latinum')==original['latinum']-3600
        assert page.evaluate('()=>__shipyardState.dilithium')==original['dilithium']-8
        assert page.evaluate('()=>__shipyardState.shipEquipment.slots.repairDrone[1]') is None
        before=page.evaluate('()=>({latinum:window.__shipyardState.latinum,dilithium:window.__shipyardState.dilithium})')
        page.locator('[data-yard-action="upgrade"][data-kind="weapon"]').click()
        assert page.locator('[data-yard-action="confirm-upgrade"]').is_disabled()
        page.locator('[data-place-bay="4"][data-bay-zone="weapons"]').click()
        page.locator('[data-yard-action="confirm-upgrade"]').click()
        assert page.evaluate('()=>nativeShipEquipment.capacities(window.__shipyardState).weapon')==4
        after=page.evaluate('()=>({latinum:window.__shipyardState.latinum,dilithium:window.__shipyardState.dilithium})')
        assert before['latinum']-after['latinum']==5500 and before['dilithium']-after['dilithium']==14
        page.locator('[data-yard-tab="weapons"]').click()
        assert page.locator('[data-yard-action="buy"]').count()==10
        page.locator('[data-yard-action="buy"][data-model="1002"]').click()
        page.screenshot(path=str(OUTPUT/'04-weapons.png'))
        page.locator('[data-yard-tab="shields"]').click()
        page.locator('[data-yard-action="buy"][data-model="fed-regenerative"]').click()
        page.screenshot(path=str(OUTPUT/'05-shields.png'))
        page.locator('[data-yard-tab="build"]').click()
        ids=page.evaluate('''()=>{const eq=nativeShipEquipment.ensure(window.__shipyardState);return Object.fromEntries(eq.locker.map(id=>[String(eq.instances[id].modelId),id]));}''')
        page.locator(f'[data-yard-slot="{ids["1002"]}"]').select_option('3')
        page.locator(f'[data-yard-action="fit"][data-instance="{ids["1002"]}"]').click()
        page.locator(f'[data-yard-action="choose-equipment"][data-instance="{ids["fed-regenerative"]}"]').click()
        page.locator('#shipyard-services [data-equipment-kind="shield"][data-equipment-place="slot"]').click()
        page.screenshot(path=str(OUTPUT/'06-build.png'))
        page.evaluate('()=>resumeNativeGame("normal")')
        page.wait_for_function('()=>nativeShipyardServices.active && nativeShipyardServices.docked')
        assert page.evaluate('()=>nativeShipEquipment.ensure(window.__shipyardState).slots.weapon[3]')==ids['1002']
        assert page.evaluate('()=>nativeShipEquipment.ensure(window.__shipyardState).slots.shield[0]')==ids['fed-regenerative']
        assert page.locator('[data-bay-key="repairDrone:1"]').get_attribute('data-bay-cell')=='5'
        assert page.locator('[data-bay-key="weapon:3"]').get_attribute('data-bay-cell')=='4'
        page.locator('[data-yard-tab="materials"]').click()
        for mineral in ['trellium','tritanium','dilithium','gallicite','benamite','deuranium']:
            assert page.locator(f'.yard-mineral-row [data-mineral-icon="{mineral}"]').count()==1
        page.wait_for_function('()=>[...document.querySelectorAll("#shipyard-services .yard-mineral-row img")].every(i=>i.complete && i.naturalWidth>0)')
        page.screenshot(path=str(OUTPUT/'06a-mineral-icons.png'))
        page.locator('[data-yard-tab="upgrades"]').click()
        page.locator('[data-yard-action="upgrade"][data-kind="hull"]').click()
        assert '50' in page.locator('[data-upgrade-change="hull"]').inner_text()
        assert page.locator('[data-yard-action="confirm-upgrade"]').is_disabled()
        page.locator('[data-yard-action="cancel-preview"]').first.click()
        page.locator('[data-yard-action="lighting"]').click()
        assert page.evaluate('()=>window.nativeFlightLightingEnabled') is True
        page.locator('[data-yard-action="close"]').click()
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUTPUT/'07-berthed-lights.png'))
        page.keyboard.press('e')
        page.locator('[data-yard-action="undock"]').wait_for()
        page.locator('[data-yard-action="undock"]').click()
        page.wait_for_function('()=>nativeShipyardServices.snapshot().dock?.phase==="departing"')
        page.screenshot(path=str(OUTPUT/'08-departure.png'))
        page.wait_for_function('()=>!nativeShipyardServices.snapshot().dock',timeout=60000)
        assert page.evaluate('()=>!nativeShipyardServices.busy && !window.__shipyardState.landed')
        page.locator('#inventoryBtn').click()
        page.locator('#ship-inventory').wait_for(state='visible')
        assert page.locator('#ship-inventory [data-bay-key="repairDrone:1"]').get_attribute('data-bay-cell')=='5'
        assert page.locator('#ship-inventory [data-bay-key="weapon:3"]').get_attribute('data-bay-cell')=='4'
        assert page.evaluate('()=>getComputedStyle(document.querySelector("#ship-inventory .inventory-drone-grid")).gridTemplateColumns.split(" ").length')==6
        for mineral in ['trellium','tritanium','gallicite','benamite','deuranium']:
            assert f'/minerals/{mineral}.svg' in page.locator(f'#ship-inventory [data-item-key="mineral:{mineral}"] img').get_attribute('src')
        page.screenshot(path=str(OUTPUT/'09-inventory.png'))
        page.keyboard.press('i')
        page.evaluate('''async()=>{
          const s=window.__shipyardState,result=nativeShipEquipment.changeHull(s,44);if(!result.ok)throw Error(result.error);
          Object.assign(s,{localBody:5,x:570,y:-45,landed:false,phase:'flight',speed:0,vx:0,vy:0});
          if(!nativeSaveStorage.write(s).ok)throw Error('Large-hull fixture save failed');resumeNativeGame('normal');await vexedFlightAssets.loadShip(44);
        }''')
        click_station()
        page.locator('[data-yard-action="dock"]').click()
        page.wait_for_function('()=>nativeShipyardServices.docked && nativeShipyardServices.active',timeout=90000)
        external=page.evaluate('()=>nativeShipyardServices.snapshot().dock.plan')
        assert external['external'] and external['entry']['x']>external['x'] and external['collar']['noseX']>external['collar']['x']
        page.keyboard.press('Escape')
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUTPUT/'10-large-hull-collar.png'))
        page.keyboard.press('e')
        page.set_viewport_size({'width':800,'height':650})
        page.screenshot(path=str(OUTPUT/'11-compact-menu.png'))
        assert page.locator('[data-yard-action="undock"]').is_visible()
        compact_before=page.evaluate('()=>__shipyardState.latinum')
        page.locator('[data-yard-action="upgrade"][data-kind="dot"]').click()
        page.locator('[data-place-bay="7"][data-bay-zone="drones"]').click()
        assert page.evaluate('''()=>{const p=document.querySelector('.yard-vessel').getBoundingClientRect(),g=document.querySelector('.outfit-ghost').getBoundingClientRect();return g.top>=p.top && g.bottom<=p.bottom;}''')
        page.screenshot(path=str(OUTPUT/'11a-compact-placement.png'))
        page.locator('[data-yard-action="cancel-preview"]').first.click()
        assert page.evaluate('()=>__shipyardState.latinum')==compact_before
        page.locator('[data-yard-action="undock"]').click()
        page.wait_for_function('()=>!nativeShipyardServices.snapshot().dock',timeout=60000)
        assert not errors,errors
        result={'passed':True,'docking':pose,'physicalApproach':True,'typedFourthWeapon':True,'shieldFitting':True,'chargedLatinumAndDilithium':True,'midApproachReload':True,'savedDockReload':True,'animatedUndock':True,'inventoryEvidence':True,'largeHullExternalCollar':True,'compactMenu':True,'mineralIcons':True,'upgradeStatPreview':True,'noChargeUntilConfirmation':True,'cancelledPreviewIsFree':True,'placedDotAndWeaponMatchInventory':True,'bayPositionsSurviveReload':True,'errors':errors}
        (OUTPUT/'result.json').write_text(json.dumps(result,indent=2))
        print(json.dumps(result))
        browser.close()
finally:
    server.shutdown()
