"""Real shipyard purchases, typed fitting, mode-separated reloads and Inventory evidence."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'unified-equipment'
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
        page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length',timeout=120000)
        page.evaluate("""()=>{window.__equipmentState=nativeNpcDev.getState();const ensure=nativeShipEquipment.ensure;window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__equipmentState=s;return ensure(s,h,d);}};}""")
        page.evaluate("""()=>{
          const s=JSON.parse(JSON.stringify(__equipmentState));
          s.devMode=false;s.captain='Captain Alex';s.shipName='ISS Concord';s.system=11;s.latinum=1000000;s.antimatter=80;s.deuranium=12;s.food=40;s.dilithium=25;
          s.shipType=7;s.weapons=[1];s.weaponInventory=[];delete s.shipEquipment;delete s.weaponLoadout;delete s.repairBay;
          s.minerals={};s.solFreightHold={};s.localContracts=[];s.hull=50;s.shields=50;s.phase='docked';s.localCruise=null;delete s.arrivalApproach;
          s.localPrestige[11]=s.localPrestige[8]=s.localPrestige[1]=100;
          if(!nativeSaveStorage.write(s).ok)throw Error('fixture save failed');resumeNativeGame('normal');
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};
          window.nativeSimulationHost?.checkpoint();
        }""")
        def purchase(ship_id):
            page.locator('#tradeBtn').click()
            page.locator('#system-hub [data-tab="shipyard"]').click()
            for _ in range(12):
                if page.locator(f'#system-hub [data-ship="{ship_id}"]').count(): break
                page.locator('#system-hub [data-page="ships:next"]').click()
            before=page.evaluate('__equipmentState.latinum')
            price=page.evaluate('(id)=>nativeShipDefinitions.get(id).price',ship_id)
            page.locator(f'#system-hub [data-ship="{ship_id}"]').click()
            assert page.evaluate('__equipmentState.shipType')==ship_id
            assert page.evaluate('__equipmentState.latinum')==before-price
            page.locator('#system-hub .hub-close').click()
        def inventory():
            page.locator('#inventoryBtn').click()
            page.wait_for_selector('#ship-inventory canvas.ready',timeout=30000)
        def slot(kind,index):
            return page.locator(f'#ship-inventory [data-equipment-kind="{kind}"][data-equipment-place="slot"][data-equipment-index="{index}"]')
        purchase(58)
        inventory()
        assert page.locator('[data-equipment-kind="repairDrone"][data-equipment-place="slot"]').count()==6
        assert 'Empty' in slot('repairDrone',5).inner_text()
        for index in range(1,6):
            page.locator('[data-equipment-shop]').select_option('basic-dot')
            page.locator('[data-buy-equipment]').click()
            page.locator('[data-equipment-place="locker"][aria-label="Stored Basic Dot"]').last.click()
            slot('repairDrone',index).click()
        assert page.evaluate('__equipmentState.repairBay.slots.filter(d=>d.hull>0).length')==6
        # The same fitting boundary rejects out-of-range grants without new identities.
        assert page.evaluate("()=>{const s=__equipmentState,before=Object.keys(s.shipEquipment.instances).length,r=nativeShipEquipment.grant(s,1,{location:'slot',slot:9});return !r.ok&&before===Object.keys(s.shipEquipment.instances).length;}")
        page.screenshot(path=str(OUTPUT/'inventory-olympic.png'))
        page.locator('.inventory-close').click()
        # Exercise six actual drones through the common repair simulation, then restore this UI fixture.
        repair=page.evaluate("""()=>{
          const original=__equipmentState,s=JSON.parse(JSON.stringify(original));s.phase='disabled';s.hull=80;s.shields=0;s.deuranium=100;
          const clock=nativeSimulation;window.nativeSimulation={...clock,blocked:()=>false};
          try{nativeShipRepairs.initialize(s);const r=nativeShipRepairs.ref('player',s),mission=nativeShipRepairs.launch(s,r,r);return {drones:mission.drones.length,capacity:nativeShipDefinitions.get(s.shipType).slots.repairDrone};}
          finally{window.nativeSimulation=clock;window.__equipmentState=original;}
        }""")
        assert repair['drones']==6
        # Move the observer to another real shipyard without changing owned equipment.
        page.evaluate("()=>{const s=__equipmentState;s.system=8;s.planet='Epsilon';nativeSaveStorage.write(s);resumeNativeGame('normal');}")
        purchase(57)
        inventory()
        assert page.locator('[data-equipment-kind="repairDrone"][data-equipment-place="slot"]').count()==2
        assert page.locator('[data-equipment-place="locker"][aria-label="Stored Basic Dot"]').count()==4
        assert '450 t' in page.locator('.inventory-cargo .inventory-section-title').inner_text()
        page.screenshot(path=str(OUTPUT/'inventory-cargo.png'))
        page.locator('.inventory-close').click()
        page.evaluate("()=>{const s=__equipmentState;s.system=1;s.localBody=3;nativeSaveStorage.write(s);resumeNativeGame('normal');}")
        page.evaluate("()=>{__equipmentState.solFreightHold={0:51};}")
        page.locator('#tradeBtn').click()
        page.locator('#system-hub [data-tab="shipyard"]').click()
        wallet=page.evaluate('__equipmentState.latinum')
        page.locator('#system-hub [data-ship="7"]').click()
        assert page.evaluate('__equipmentState.shipType')==57
        assert page.evaluate('__equipmentState.latinum')==wallet
        assert 'Cargo aboard' in page.locator('#system-hub footer').inner_text()
        page.locator('#system-hub .hub-close').click()
        page.evaluate("()=>{__equipmentState.solFreightHold={};}")
        purchase(7)
        inventory()
        assert page.locator('[data-equipment-kind="repairDrone"][data-equipment-place="slot"]').count()==1
        assert '50 t' in page.locator('.inventory-cargo .inventory-section-title').inner_text()
        assert page.locator('[data-equipment-place="locker"][aria-label="Stored Basic Dot"]').count()==5
        page.screenshot(path=str(OUTPUT/'inventory-small.png'))
        # An ability fits independently of weapons and retains its owned deadline.
        page.evaluate("()=>{const s=__equipmentState,r=nativeShipEquipment.grant(s,22);r.instance.readyAt=999;nativeShipInventory.refresh();}")
        page.locator('[data-equipment-place="locker"][aria-label="Stored Cloaking Device"]').click()
        slot('ability',1).click()
        assert page.evaluate("()=>{const s=__equipmentState,eq=s.shipEquipment;return !s.weapons.includes(22)&&eq.instances[eq.slots.ability[1]].readyAt===999;}")
        page.locator('.inventory-close').click()
        page.locator('#pauseBtn').click()
        page.locator('#pause-menu [data-save]').click()
        assert page.locator('[data-pause-title]').inner_text()=='Game saved'
        page.locator('#pause-menu [data-resume]').click()
        saved=page.evaluate('JSON.parse(JSON.stringify(__equipmentState.shipEquipment))')
        page.reload()
        page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
        assert not page.locator('[data-menu="continue"]').is_disabled()
        assert not page.locator('[data-menu="continue-dev"]').is_disabled()
        page.evaluate("()=>{const ensure=nativeShipEquipment.ensure;window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__equipmentState=s;return ensure(s,h,d);}};}")
        page.locator('[data-menu="continue"]').click()
        page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();}')
        restored=page.evaluate('__equipmentState.shipEquipment')
        assert restored==saved
        # Upgrade purchase reads the fitted engine, rather than a stale legacy hull field.
        page.evaluate("""()=>{const s=__equipmentState;nativeShipEquipment.changeHull(s,10);s.localBody=7;s.localNavTarget=7;vexedSolFlight.setTarget(7);s.tugEngineLevel=2;const eq=nativeShipEquipment.ensure(s);eq.instances[eq.slots.engineering[0]].upgrades.tugEngineLevel=0;}""")
        page.locator('#tradeBtn').click()
        page.locator('#system-hub [data-tab="shipyard"]').click()
        upgrade=page.locator('#system-hub [data-upgrade-tug]')
        assert not upgrade.is_disabled()
        upgrade.click()
        assert page.evaluate("()=>{const s=__equipmentState,eq=s.shipEquipment;return eq.instances[eq.slots.engineering[0]].upgrades.tugEngineLevel===1&&nativeShipDefinitions.forEntity(s).speedOrOtherStationValue===50;}")
        page.locator('#system-hub .hub-close').click()
        # A quota error must reach the actual pause UI as a failure.
        page.evaluate("()=>{Storage.prototype.setItem=function(){throw Error('Test quota exhausted')};}")
        page.locator('#pauseBtn').click()
        page.locator('#pause-menu [data-save]').click()
        assert page.locator('[data-pause-title]').inner_text()=='Save failed'
        assert not errors,errors
        report={'passed':True,'normalPurchases':[58,57,7],'sixWorkingDrones':repair,'abilityIdentityAndRecharge':True,'midwayReload':True,'saveFailureUI':True,'fittedEngineUpgrade':True,'screenshots':['inventory-olympic.png','inventory-cargo.png','inventory-small.png'],'javascriptErrors':errors}
        (OUTPUT/'report.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
