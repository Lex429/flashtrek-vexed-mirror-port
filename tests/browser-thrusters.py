"""Permanent thrusters: actual port/station purchases, fitting and Continue."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/thrusters';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':800});page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
        page.evaluate('''()=>{
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));Object.assign(s,{devMode:false,shipType:7,system:1,localBody:3,x:0,y:0,angle:0,speed:0,vx:0,vy:0,hull:50,shields:50,latinum:100000,phase:'flight',landed:false,localCruise:null,arrivalApproach:null,minerals:{}});
          delete s.shipyardDock;nativeShipThrusters.reset(s);nativeShipEquipment.ensure(s);
          const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(state){window.__thrusterState=state;return restore(state);};
          if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');
        }''')
        page.locator('#tradeBtn').click();page.locator('#system-hub [data-tab="services"]').click();page.locator('[data-view-tab="shop"]').click();page.locator('[data-shop-category="services"]').click()
        offer=page.evaluate('({quote:nativeShipThrusters.quote(__thrusterState),credits:__thrusterState.latinum})')
        page.locator('[data-upgrade-thrusters]').click()
        port=page.evaluate('''()=>{const s=__thrusterState;return {level:nativeShipThrusters.level(s),credits:s.latinum,saved:nativeSaveStorage.read('normal').shipThrusters.level,emergency:nativeShipDefinitions.forEntity(s).thrusters.maxSpeed};}''')
        assert port['level']==port['saved']==1 and port['credits']==offer['credits']-offer['quote']['price'],port
        page.screenshot(path=str(OUT/'port-upgrade.png'))
        page.evaluate('()=>{window.__thrusterStorage=nativeSaveStorage;window.nativeSaveStorage={...nativeSaveStorage,write:()=>({ok:false,error:"Thruster storage denied"})};}')
        page.locator('[data-upgrade-thrusters]').click()
        rollback=page.evaluate('({level:nativeShipThrusters.level(__thrusterState),credits:__thrusterState.latinum})')
        assert rollback=={'level':1,'credits':port['credits']},rollback
        assert 'storage denied' in page.locator('.encounter-service-notice').inner_text().lower()
        page.evaluate('window.nativeSaveStorage=__thrusterStorage');page.locator('.encounter-close').click();page.locator('#inventoryBtn').click()
        assert 'Built-in thrusters' in page.locator('.inventory-inspector').inner_text() and 'Mk 2' in page.locator('.inventory-inspector').inner_text()
        assert page.locator('[data-equipment-kind="thrusters"]').count()==0
        thruster=page.locator('[data-hull-system="thrusters"]');assert thruster.is_visible() and 'Mk 2' in thruster.inner_text()
        before_inspect=page.evaluate('JSON.stringify(__thrusterState)')
        thruster.focus();page.keyboard.press('Enter')
        details=page.locator('#inventory-thruster-details');assert details.is_visible()
        for label in ['Emergency speed','Acceleration','Braking','Turn rate','Port Shop','Ship Upgrades']:
            assert label.lower() in details.inner_text().lower(),label
        assert details.locator('[data-equipment-action="equip"],[data-equipment-action="unequip"],[data-repair-device]').count()==0
        assert page.evaluate('JSON.stringify(__thrusterState)')==before_inspect
        assert thruster.get_attribute('draggable')=='false' and thruster.get_attribute('data-item-key') is None
        page.screenshot(path=str(OUT/'inventory-thrusters.png'))
        page.locator('[data-equipment-action="cancel"]').click()
        for width,height in [(390,844),(360,740),(1280,800)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(120)
            assert thruster.is_visible()
            if not page.locator('.inventory-bay-pages').is_hidden():
                page.locator('[data-bay-page="next"]').click();assert thruster.is_visible()
                page.locator('[data-bay-page="previous"]').click()
            bounds=thruster.bounding_box();assert bounds and bounds['y']>=0 and bounds['y']+bounds['height']<=height
            thruster.click();assert details.is_visible()
            assert page.locator('[data-equipment-action="cancel"]').is_visible()
            if width==390:page.screenshot(path=str(OUT/'inventory-thrusters-mobile.png'))
            page.locator('[data-equipment-action="cancel"]').click()
        assert page.evaluate('JSON.stringify(__thrusterState)')==before_inspect
        while not page.locator('[data-equipment-kind="engineering"][data-equipment-place="slot"]').count():
            page.locator('[data-bay-page="next"]').click()
        page.locator('#ship-inventory [data-equipment-kind="engineering"][data-equipment-place="slot"][data-equipment-index="0"]').click()
        assert thruster.is_visible()
        page.locator('[data-equipment-action="unequip"]').click()
        unfitted=page.evaluate('''()=>{const s=__thrusterState,d=nativeShipDefinitions.forEntity(s);return {level:nativeShipThrusters.level(s),engine:s.shipEquipment.slots.engineering[0],speed:d.movement.maxSpeed,reserve:d.thrusters.maxSpeed};}''')
        assert unfitted['level']==1 and unfitted['engine'] is None and unfitted['speed']==unfitted['reserve'],unfitted
        page.locator('.inventory-close').click();page.reload();page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate('()=>{const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__thrusterState=s;return restore(s);};}')
        page.locator('[data-menu="continue"]').click();page.wait_for_function('()=>!!window.__thrusterState')
        assert page.evaluate('nativeShipThrusters.level(__thrusterState)')==1
        page.evaluate('''()=>{
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();const s=__thrusterState;
          Object.assign(s,{system:1,localBody:5,phase:'docked',landed:true,localCruise:null,arrivalApproach:null,speed:0,vx:0,vy:0});
          const plan=nativeShipyardServices.plan(s),position=vexedSolFlight.shipPosition(s);s.x+=plan.x-position.x;s.y+=plan.y-position.y;
          s.shipyardDock={version:1,station:nativeMarsShipyard.definitionFor(s).id,system:1,phase:'docked',plan};nativeShipyardServices.select();
        }''')
        yard_offer=page.evaluate('nativeShipThrusters.quote(__thrusterState)')
        page.locator('[data-yard-action="upgrade-thrusters"]').click()
        station=page.evaluate('({level:nativeShipThrusters.level(__thrusterState),credits:__thrusterState.latinum,saved:nativeSaveStorage.read("normal").shipThrusters.level})')
        assert station['level']==station['saved']==2 and station['credits']==port['credits']-yard_offer['price'],station
        assert page.locator('[data-hull-thrusters] [data-yard-action="remove"]').count()==0
        page.screenshot(path=str(OUT/'station-upgrade.png'))
        page.locator('[data-yard-action="upgrade-thrusters"]').click();assert page.locator('[data-yard-action="upgrade-thrusters"]').is_disabled()
        assert page.evaluate('nativeShipThrusters.level(__thrusterState)')==3
        assert not errors,errors
        report={'passed':True,'port':port,'saveFailureRollback':rollback,'unfittedEngine':unfitted,'reloadRetainsHullUpgrade':True,'station':station,'maximumLevel':3,'noEquipmentSlot':True,'noRemoveControl':True,'inventoryTile':{'readOnly':True,'keyboardDetails':True,'desktopAndMobile':True,'persistsAcrossBayPages':True},'errors':errors}
        (OUT/'browser.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));browser.close()
finally:server.shutdown()
