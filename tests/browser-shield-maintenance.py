"""Real shield repair controls, owned equipment, material costs and verified saves."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/shield-maintenance'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':800})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate("""()=>{
          startNativeDevGame();const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          Object.assign(s,{devMode:false,system:1,localBody:3,shipType:7,hull:30,shields:0,dilithium:10,latinum:1000,minerals:{trellium:30,gallicite:30},phase:'flight',landed:false,localCruise:null,arrivalApproach:null});
          delete s.shipEquipment;delete s.weaponLoadout;delete s.repairBay;delete s.inventoryLayout;s.weapons=[1];s.weaponInventory=[];
          const eq=nativeShipEquipment.ensure(s);eq.instances[eq.slots.shield[0]].condition=20;eq.instances[eq.slots.engineering[0]].condition=25;
          const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__shieldState=s;return restore(s);};
          if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
        }""")
        ids=page.evaluate('({shield:__shieldState.shipEquipment.slots.shield[0],engine:__shieldState.shipEquipment.slots.engineering[0]})')
        def slot(kind):
            target=page.locator(f'#ship-inventory [data-equipment-kind="{kind}"][data-equipment-place="slot"][data-equipment-index="0"]')
            page.wait_for_timeout(100)
            if target.is_visible():return target
            previous=page.locator('[data-bay-page="previous"]')
            while previous.is_visible() and previous.is_enabled():previous.click();page.wait_for_timeout(50)
            for _ in range(12):
                if target.is_visible():return target
                next_page=page.locator('[data-bay-page="next"]')
                if not next_page.is_visible() or not next_page.is_enabled():break
                next_page.click();page.wait_for_timeout(50)
            assert target.is_visible(),f'Equipment bay is unreachable: {kind}'
            return target
        def repair():
            return page.locator('#ship-inventory [data-repair-device]')
        def visible_control():
            b=repair().bounding_box();v=page.viewport_size
            assert b and b['x']>=0 and b['y']>=0 and b['x']+b['width']<=v['width'] and b['y']+b['height']<=v['height'],b
        page.locator('#inventoryBtn').click()
        page.wait_for_selector('#ship-inventory canvas.ready')
        assert page.locator('.inventory-shield-maintenance').count()==0
        assert '20%' in slot('shield').inner_text()
        assert '25%' in slot('engineering').inner_text()
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT/'device-condition-cards.png'))
        slot('shield').click()
        assert repair().is_enabled()
        page.screenshot(path=str(OUT/'shield-device-details.png'))
        assert 'trellium' in page.locator('.inventory-device-cost').inner_text().lower(),page.locator('.inventory-device-cost').inner_text()
        assert '8' in page.locator('.inventory-device-cost').inner_text()
        visible_control()
        page.screenshot(path=str(OUT/'shield-device-details.png'))
        repair().click()
        repaired=page.evaluate("""()=>{const s=__shieldState,eq=s.shipEquipment;return {hull:s.hull,shields:s.shields,trellium:s.minerals.trellium,dilithium:s.dilithium,latinum:s.latinum,id:eq.slots.shield[0],condition:eq.instances[eq.slots.shield[0]].condition,saved:nativeSaveStorage.read('normal').shields};}""")
        assert repaired=={'hull':30,'shields':50,'trellium':22,'dilithium':10,'latinum':1000,'id':ids['shield'],'condition':100,'saved':50},repaired
        assert repair().is_disabled()
        page.locator('[data-equipment-action="cancel"]').click()
        slot('engineering').click()
        assert 'gallicite' in page.locator('.inventory-device-cost').inner_text().lower(),page.locator('.inventory-device-cost').inner_text()
        assert 'device condition' in page.locator('.inventory-detail-stats').inner_text().lower()
        for width,height in [(1440,900),(1366,768),(1280,720),(1024,768),(800,600),(360,640),(320,568),(390,844)]:
            page.set_viewport_size({'width':width,'height':height})
            page.wait_for_timeout(250)
            visible_control()
            fit=page.locator('.inventory-inspector').evaluate('(n)=>({client:n.clientHeight,scroll:n.scrollHeight})')
            assert fit['scroll']<=fit['client']+1,(width,height,fit)
        visible_control()
        page.screenshot(path=str(OUT/'engine-device-mobile.png'))
        page.evaluate('()=>{__shieldState.minerals.gallicite=0;nativeShipInventory.refresh();}')
        assert repair().is_disabled()
        assert '8 gallicite ore' in page.locator('#inventory-device-repair-status').inner_text()
        page.evaluate('()=>{__shieldState.minerals.gallicite=30;window.__shieldStorage=nativeSaveStorage;window.nativeSaveStorage={...nativeSaveStorage,write:()=>({ok:false,error:"Storage denied for device check"})};nativeShipInventory.refresh();}')
        repair().click()
        failed=page.evaluate('({condition:__shieldState.shipEquipment.instances[__shieldState.shipEquipment.slots.engineering[0]].condition,ore:__shieldState.minerals.gallicite,count:__shieldState.shipRepairs.ledger.deviceRepairs.count})')
        assert failed=={'condition':25,'ore':30,'count':1},failed
        assert 'storage denied' in page.locator('#inventory-device-repair-status').inner_text().lower(),page.locator('#inventory-device-repair-status').inner_text()
        page.evaluate('window.nativeSaveStorage=__shieldStorage')
        repair().click()
        engine=page.evaluate('({condition:__shieldState.shipEquipment.instances[__shieldState.shipEquipment.slots.engineering[0]].condition,ore:__shieldState.minerals.gallicite,speed:nativeShipDefinitions.forEntity(__shieldState).movement.maxSpeed})')
        assert engine=={'condition':100,'ore':22,'speed':427.5},engine
        page.reload()
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate('()=>{const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__shieldState=s;return restore(s);};}')
        page.locator('[data-menu="continue"]').click()
        page.wait_for_function('()=>!!window.__shieldState')
        assert page.evaluate('__shieldState.shields')==50
        assert page.evaluate('__shieldState.shipEquipment.slots.shield[0]')==ids['shield']
        assert page.evaluate('__shieldState.shipEquipment.instances[__shieldState.shipEquipment.slots.engineering[0]].condition')==100
        page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();Object.assign(__shieldState,{shields:0,localBody:3,localCruise:null,arrivalApproach:null});}')
        page.set_viewport_size({'width':1280,'height':800})
        page.locator('#tradeBtn').click()
        page.locator('#system-hub [data-tab="services"]').click()
        page.locator('[data-view-tab="shop"]').click()
        page.locator('[data-shop-category="services"]').click()
        port=page.locator('#planet-encounter [data-repair-shields]')
        assert port.is_enabled()
        assert '5 Trellium ore' in port.inner_text()
        port.click()
        paid=page.evaluate('({shields:__shieldState.shields,hull:__shieldState.hull,latinum:__shieldState.latinum,trellium:__shieldState.minerals.trellium,id:__shieldState.shipEquipment.slots.shield[0],saved:nativeSaveStorage.read("normal").shields})')
        assert paid=={'shields':50,'hull':30,'latinum':1000,'trellium':17,'id':ids['shield'],'saved':50},paid
        page.screenshot(path=str(OUT/'port-shield-device-service.png'))
        page.evaluate("""()=>{startNativeDevGame();const s=nativeNpcDev.getState();window.__deviceDev=s;const eq=nativeShipEquipment.ensure(s);
          eq.instances[eq.slots.engineering[0]].condition=0;eq.instances[eq.slots.shield[0]].condition=0;
          s.hull=0;s.shields=0;s.phase='destroyed';window.__deviceDevOre=JSON.stringify(s.minerals);}""")
        page.locator('#repairBtn').click()
        dev=page.evaluate("""()=>{const s=__deviceDev,eq=s.shipEquipment;return {engine:eq.instances[eq.slots.engineering[0]].condition,shield:eq.instances[eq.slots.shield[0]].condition,hull:s.hull,shields:s.shields,phase:s.phase,free:JSON.stringify(s.minerals)===__deviceDevOre};}""")
        assert dev['engine']==100 and dev['shield']==100 and dev['hull']>0 and dev['shields']>0 and dev['phase']=='flight' and dev['free'],dev
        assert not errors,errors
        report={'passed':True,'shield':repaired,'engine':engine,'port':paid,'saveFailureRollback':failed,'devRepair':dev,'reloadKeepsUnits':True,'mobileControls':True,'errors':errors}
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
        print(json.dumps(report));browser.close()
finally:
    server.shutdown();server.server_close()
