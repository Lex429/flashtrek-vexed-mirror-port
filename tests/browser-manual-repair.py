"""Manual repair deployment through the real inventory and shared saved mission owner."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'manual-repair'
OUTPUT.mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, has_touch=True)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length', timeout=120000)
        # The real Dev Repair button must recover disabled/destroyed hulls too.
        page.evaluate("""()=>{
          window.__devRepairState=nativeNpcDev.getState();
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=__devRepairState,eq=nativeShipEquipment.ensure(s),shield=nativeShipEquipment.grant(s,'advanced-shield').instance;
          const result=nativeShipEquipment.move(s,{category:'shield',fromType:'locker',fromIndex:eq.locker.indexOf(shield.id),toType:'slot',toIndex:0});
          if(!result.ok)throw Error(result.error);
          Object.assign(s,{latinum:0,deuranium:0,landed:false,localCruise:null,arrivalApproach:null});
        }""")
        dev_repairs=[]
        for phase,hull in [('flight',30),('disabled',10),('destroyed',0)]:
            before=page.evaluate("""value=>{
              const s=__devRepairState;Object.assign(s,{phase:value.phase,hull:value.hull,shields:0});
              nativeShipSystems.refreshShip(s,s,'player');
              const d=nativeShipDefinitions.forEntity(s);
              return {hull:d.hull,shields:d.shields,equipment:JSON.stringify(s.shipEquipment)};
            }""",{'phase':phase,'hull':hull})
            page.locator('#repairBtn').click()
            result=page.evaluate("""()=>{
              const s=__devRepairState,saved=nativeSaveStorage.read('dev');
              return {hull:s.hull,shields:s.shields,phase:s.phase,latinum:s.latinum,deuranium:s.deuranium,
                equipment:JSON.stringify(s.shipEquipment),savedHull:saved.hull,savedShields:saved.shields,savedPhase:saved.phase};
            }""")
            assert result['hull']==result['savedHull']==before['hull'],result
            assert result['shields']==result['savedShields']==before['shields'],result
            assert result['phase']==result['savedPhase']=='flight',result
            assert result['latinum']==result['deuranium']==0,result
            assert result['equipment']==before['equipment'],'Dev repair changed owned equipment'
            dev_repairs.append({'from':phase,'hull':result['hull'],'shields':result['shields'],'saved':True})
        page.evaluate("""()=>{
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          Object.assign(s,{devMode:false,captain:'Inventory regression',shipName:'USS Danube',shipType:7,system:1,localBody:3,
            latinum:10000,antimatter:80,deuranium:12,dilithium:25,food:40,repairDroneMode:'manual',miningTool:true,weapons:[1],weaponInventory:[],
            minerals:{iron:7},solFreightHold:{0:8},localContracts:[],hull:50,shields:50,phase:'docked',localCruise:null,arrivalApproach:null});
          delete s.shipEquipment;delete s.weaponLoadout;delete s.repairBay;delete s.inventoryLayout;
          const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__inventoryState=s;return restore(s);};
          nativeSaveStorage.write(s);resumeNativeGame('normal');window.nativeSimulation={...nativeSimulation,blocked:()=>true};
        }""")
        normal_vitals=page.evaluate('()=>{const s=__inventoryState;return {phase:s.phase,hull:s.hull,shields:s.shields,latinum:s.latinum,deuranium:s.deuranium};}')
        # Disabled-hull Repair now starts an owned DOT mission; the engine-failure
        # browser regression follows that mission through restored flight input.
        for phase,hull,money,material in [('flight',30,10000,12),('destroyed',0,10000,12),('flight',30,0,0)]:
            page.evaluate('v=>{Object.assign(__inventoryState,v);nativeShipSystems.refreshShip(__inventoryState,__inventoryState,"player");}',{'phase':phase,'hull':hull,'shields':0,'latinum':money,'deuranium':material})
            page.locator('#repairBtn').click()
            actual=page.evaluate('()=>{const s=__inventoryState;return {phase:s.phase,hull:s.hull,shields:s.shields,latinum:s.latinum,deuranium:s.deuranium};}')
            allowed=phase=='flight' and money>=40 and material>=10
            assert actual=={'phase':phase,'hull':43 if allowed else hull,'shields':13 if allowed else 0,'latinum':money-40 if allowed else money,'deuranium':material-10 if allowed else material},actual
        page.evaluate('v=>{Object.assign(__inventoryState,v);nativeShipSystems.refreshShip(__inventoryState,__inventoryState,"player");}',normal_vitals)
        page.locator('#inventoryBtn').click()
        page.wait_for_selector('#ship-inventory canvas.ready')


        deploy=page.locator('[data-deploy-repair-drones]')
        manual=page.locator('[data-repair-mode="manual"]')
        automatic=page.locator('[data-repair-mode="auto"]')
        assert manual.get_attribute('aria-pressed')=='true'
        automatic.click()
        assert automatic.get_attribute('aria-pressed')=='true'
        assert deploy.is_hidden()
        assert page.evaluate('nativeSaveStorage.read("normal").repairDroneMode')=='auto'
        manual.click()
        assert deploy.is_visible()
        assert page.evaluate('nativeSaveStorage.read("normal").repairDroneMode')=='manual'

        assert deploy.is_disabled()
        assert page.locator('#inventory-deploy-status').inner_text()=='Hull fully repaired'
        page.evaluate("()=>{__inventoryState.hull=40;__inventoryState.deuranium=0;nativeShipInventory.refresh();}")
        assert deploy.is_disabled()
        assert page.locator('#inventory-deploy-status').inner_text()=='No repair deuranium'
        page.evaluate("()=>{__inventoryState.deuranium=12;nativeShipInventory.refresh();}")
        dot=page.locator('[data-equipment-kind="repairDrone"][data-equipment-place="slot"]')
        page.wait_for_selector('#ship-inventory canvas.ready')
        storage_cell=page.locator('[data-inventory-cell]').last.get_attribute('data-inventory-cell')
        stored_dot=page.locator(f'[data-inventory-cell="{storage_cell}"]')
        dot.drag_to(stored_dot)
        assert deploy.is_disabled()
        assert page.locator('#inventory-deploy-status').inner_text()=='No DOTs equipped'
        stored_dot.drag_to(dot)
        assert deploy.is_enabled()
        page.evaluate("()=>{__inventoryState.repairBay.slots[0].hull=0;nativeShipInventory.refresh();}")
        assert deploy.is_disabled()
        assert page.locator('#inventory-deploy-status').inner_text()=='No operational DOTs'
        page.evaluate("()=>{__inventoryState.repairBay.slots[0].hull=40;Object.assign(__inventoryState,{x:7000,y:7000,speed:0,landed:false});nativeShipInventory.refresh();}")
        page.screenshot(path=str(OUTPUT/'deploy-ready-desktop.png'))
        for hull,count in [(7,1),(58,6)]:
            page.evaluate('(id)=>{nativeShipEquipment.changeHull(__inventoryState,id);__inventoryState.hull-=10;nativeShipInventory.refresh();}',hull)
            for width,height in [(1440,1000),(1280,720),(390,700)]:
                page.set_viewport_size({'width':width,'height':height})
                if width<=760:page.locator('[data-inventory-view="loadout"]').click()
                assert page.locator('.inventory-dot-slot').count()==count
                # Viewport changes schedule measured bay pagination on RAF.
                # Check the settled layout rather than the preceding frame's bays.
                fit_script="""()=>{const panel=document.querySelector('.inventory-loadout').getBoundingClientRect();return [...document.querySelectorAll('.inventory-slot,.inventory-vitals,[data-deploy-repair-drones],[data-repair-mode],[data-request-distress]')].filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return r.top>=panel.top-1&&r.bottom<=panel.bottom+1&&r.left>=panel.left-1&&r.right<=panel.right+1;});}"""
                try:
                    page.wait_for_function(fit_script,timeout=5000)
                    fits=True
                except PlaywrightTimeoutError:
                    fits=False
                if not fits:
                    page.screenshot(path=str(OUTPUT/'layout-overflow.png'))
                    print(json.dumps(page.evaluate("""()=>{
                      const panel=document.querySelector('.inventory-loadout');
                      return {panel:panel.getBoundingClientRect().toJSON(),scrollHeight:panel.scrollHeight,
                        controls:[...panel.querySelectorAll('.inventory-drone-controls,.inventory-drone-controls>*,.inventory-vitals')].filter(e=>e.getClientRects().length).map(e=>({label:e.textContent,bounds:e.getBoundingClientRect().toJSON()}))};
                    }""")),flush=True)
                assert fits,(hull,width,height)
        page.evaluate("()=>{nativeShipEquipment.changeHull(__inventoryState,7);__inventoryState.hull=40;nativeShipInventory.refresh();}")
        page.screenshot(path=str(OUTPUT/'deploy-ready-mobile.png'))
        assert deploy.is_enabled()
        page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:()=>document.hidden||nativePause.active||nativeShipInventory.active};}')
        start=page.evaluate('({money:__inventoryState.latinum,material:__inventoryState.deuranium})')
        deploy.click()
        assert page.locator('#ship-inventory').is_hidden()
        assert page.evaluate('__inventoryState.phase')!='disabled'
        mission=page.evaluate('nativeSaveStorage.read("normal").shipRepairs.missions.find(m=>m.manual)')
        assert mission and mission['status']=='active' and len(mission['drones'])==1
        assert page.evaluate('nativeShipRepairs.deployPlayer(__inventoryState).ok') is False
        page.wait_for_function('()=>nativeShipRepairs.drones(__inventoryState,__inventoryState.system).filter(d=>d.entity.carrier.category==="player").length===1',timeout=10000)
        page.locator('#inventoryBtn').click()
        assert deploy.is_disabled()
        assert page.locator('#inventory-deploy-status').inner_text()=='Drones already deployed'
        paused=page.evaluate('({hull:__inventoryState.hull,material:__inventoryState.deuranium})')
        page.wait_for_timeout(500)
        assert page.evaluate('({hull:__inventoryState.hull,material:__inventoryState.deuranium})')==paused
        page.locator('.inventory-close').click()
        page.wait_for_function('()=>__inventoryState.shipRepairs.missions.some(m=>m.manual&&m.restoredHull>2)',timeout=90000)
        page.locator('#inventoryBtn').click()
        assert page.evaluate('nativeSaveStorage.write(__inventoryState).ok')
        saved=page.evaluate('JSON.parse(JSON.stringify(__inventoryState.shipRepairs.missions.find(m=>m.manual)))')
        page.reload()
        page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate("""()=>{const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__inventoryState=s;return restore(s);};}""")
        page.locator('[data-menu="continue"]').click()
        page.wait_for_function('()=>window.__inventoryState?.shipRepairs?.missions.some(m=>m.id===\''+saved['id']+'\')',timeout=30000)
        page.wait_for_function('()=>__inventoryState.shipRepairs.missions.some(m=>m.manual&&m.status==="completed")',timeout=90000)
        assert page.evaluate('__inventoryState.hull')==50
        assert abs(page.evaluate('__inventoryState.deuranium')-(start['material']-2))<.00001
        assert page.evaluate('__inventoryState.latinum')==start['money']
        assert page.evaluate('__inventoryState.phase')!='disabled'
        assert page.evaluate('__inventoryState.repairBay.slots[0].phase')=='stowed'
        page.locator('#inventoryBtn').click()
        assert deploy.is_disabled()
        assert page.locator('#inventory-deploy-status').inner_text()=='Hull fully repaired'
        assert manual.get_attribute('aria-pressed')=='true'
        automatic.click()
        assert page.evaluate('nativeSaveStorage.read("normal").repairDroneMode')=='auto'
        page.reload()
        page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate("""()=>{const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__inventoryState=s;return restore(s);};}""")
        page.locator('[data-menu="continue"]').click()
        page.wait_for_function('()=>window.__inventoryState?.repairDroneMode==="auto"',timeout=30000)
        page.locator('#inventoryBtn').click()
        assert automatic.get_attribute('aria-pressed')=='true'
        assert deploy.is_hidden()
        page.evaluate("()=>{__inventoryState.hull=40;__inventoryState.deuranium=12;nativeShipInventory.refresh();}")
        page.screenshot(path=str(OUTPUT/'repair-mode-auto.png'))
        page.locator('.inventory-close').click()
        page.wait_for_function('()=>__inventoryState.shipRepairs.missions.some(m=>m.automatic&&m.status==="active")',timeout=10000)
        page.locator('#inventoryBtn').click()
        auto_job=page.evaluate('__inventoryState.shipRepairs.missions.find(m=>m.automatic&&m.status==="active").id')
        manual.click()
        assert manual.get_attribute('aria-pressed')=='true'
        assert page.evaluate('nativeSaveStorage.read("normal").repairDroneMode')=='manual'
        page.locator('.inventory-close').click()
        page.wait_for_function('(id)=>__inventoryState.shipRepairs.missions.some(m=>m.id===id&&m.status==="completed")',arg=auto_job,timeout=90000)
        assert abs(page.evaluate('__inventoryState.deuranium')-10)<.00001
        page.locator('#inventoryBtn').click()
        page.evaluate("()=>{__inventoryState.hull=10;__inventoryState.shields=0;__inventoryState.phase='disabled';nativeShipInventory.refresh();}")
        assert deploy.is_enabled()
        count=page.evaluate('__inventoryState.shipRepairs.missions.filter(m=>m.carrier.category==="player").length')
        page.screenshot(path=str(OUTPUT/'repair-mode-manual-disabled.png'))
        page.locator('.inventory-close').click()
        page.wait_for_timeout(1600)
        assert page.evaluate('__inventoryState.hull')==10
        assert page.evaluate('__inventoryState.shipRepairs.missions.filter(m=>m.carrier.category==="player").length')==count
        assert page.evaluate('nativeShipRepairs.playerDronesDeployed(__inventoryState)') is False
        assert not errors,errors
        report={'passed':True,'devRepairs':dev_repairs,'normalRepairRules':True,'buttonEligibility':True,'realClickLaunchesOwnedDrones':True,'pauseStopsRepairs':True,'midwayReload':True,'exactMaterialCost':True,'desktopAndMobileFit':True,'modeTogglePersists':True,'autoStartsOnDamage':True,'activeJobFinishesAfterManualSwitch':True,'manualBlocksDisabledLaunch':True,'javascriptErrors':errors}
        (OUTPUT/'report.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
