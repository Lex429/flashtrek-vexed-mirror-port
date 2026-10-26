"""Real engine purchases, artwork, dragging, keyboard propulsion and saved fitting."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'engine-equipment'
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
        }""")
        def slot(kind,index):
            return page.locator(f'#ship-inventory [data-equipment-kind="{kind}"][data-equipment-place="slot"][data-equipment-index="{index}"]')
        page.locator('#tradeBtn').click()
        page.locator('#system-hub [data-tab="services"]').click()
        page.locator('[data-view-tab="shop"]').click()
        page.locator('[data-shop-category="equipment"]').click()
        page.locator('[data-shop-page="next"]').click()
        wallet=page.evaluate('__equipmentState.latinum')
        for model in ['upgraded-engine','advanced-engine']:
            icon=page.locator(f'.encounter-equipment-icon[src$="{model}.png"]')
            assert icon.count()==1 and icon.evaluate('(im)=>im.complete && im.naturalWidth>0')
            page.locator(f'[data-buy-equipment="{model}"]').click()
        assert page.evaluate('__equipmentState.latinum')==wallet-7500
        page.screenshot(path=str(OUTPUT/'engine-shop.png'))
        page.locator('.encounter-close').click()
        def open_inventory():
            page.keyboard.press('i')
            page.wait_for_selector('#ship-inventory canvas.ready',timeout=30000)
        def fly(expected):
            page.locator('.inventory-close').click()
            page.evaluate("""()=>{const s=__equipmentState;Object.assign(s,{x:30000,y:30000,angle:0,speed:0,vx:0,vy:0,phase:'flight',landed:false});delete s.motionKick;delete s.motionSpin;window.nativeSimulation={...nativeSimulation,blocked:()=>!!nativePause.active||!!nativeShipInventory.active};}""")
            page.keyboard.down('w')
            page.wait_for_function('(expected)=>__equipmentState.speed>=expected-.05',arg=expected,timeout=20000)
            page.keyboard.up('w')
            observed=page.evaluate('__equipmentState.speed')
            assert abs(observed-expected)<.1,(observed,expected)
            angle=page.evaluate('__equipmentState.angle')
            page.keyboard.down('d');page.wait_for_timeout(250);page.keyboard.up('d')
            assert abs(page.evaluate('__equipmentState.angle')-angle)>.05
            page.keyboard.down('s')
            page.wait_for_function('()=>__equipmentState.speed<.05',timeout=20000)
            page.keyboard.up('s')
            page.evaluate('window.nativeSimulation={...nativeSimulation,blocked:()=>true}')
            open_inventory()
            return observed
        open_inventory()
        assert slot('engineering',0).locator('img[src$="standard-engine.png"]').count()==1
        speeds={'standard':fly(427.5)}
        for model,name,speed in [('upgraded-engine','Upgraded warp engine',470.25),('advanced-engine','Advanced warp engine',513)]:
            page.locator(f'[aria-label="Stored {name}"]').drag_to(slot('engineering',0))
            assert name in slot('engineering',0).inner_text()
            im=slot('engineering',0).locator('img')
            assert im.get_attribute('src').endswith(model+'.png')
            assert im.evaluate('(im)=>im.complete && im.naturalWidth>0')
            page.screenshot(path=str(OUTPUT/(model+'-inventory.png')))
            speeds[model]=fly(speed)
            assert page.evaluate("()=>{const s=nativeSaveStorage.read('normal');return s.shipEquipment.instances[s.shipEquipment.slots.engineering[0]].modelId;}")==model
        slot('engineering',0).drag_to(page.locator('#ship-inventory .inventory-blank').first)
        assert 'Flight speed 20' in slot('engineering',0).inner_text()
        speeds['emptyBay']=fly(90)
        page.screenshot(path=str(OUTPUT/'basic-propulsion-inventory.png'))
        assert page.evaluate("nativeSaveStorage.read('normal').shipEquipment.slots.engineering[0]") is None
        owned=page.evaluate('Object.keys(__equipmentState.shipEquipment.instances).sort()')
        page.reload()
        page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate("()=>{const ensure=nativeShipEquipment.ensure;window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__equipmentState=s;return ensure(s,h,d);}};}")
        page.locator('[data-menu="continue"]').click()
        page.wait_for_function('()=>document.body.classList.contains("playing") && !nativeMenuTransition.snapshot().active && window.__equipmentState')
        page.evaluate('window.nativeSimulation={...nativeSimulation,blocked:()=>true}')
        assert page.evaluate('__equipmentState.shipEquipment.slots.engineering[0]') is None
        assert page.evaluate('Object.keys(__equipmentState.shipEquipment.instances).sort()')==owned
        assert page.evaluate('nativeShipDefinitions.forEntity(__equipmentState).movement.maxSpeed')==90
        open_inventory()
        page.locator('[aria-label="Stored Advanced warp engine"]').drag_to(slot('engineering',0))
        for width,height in [(390,844),(360,740),(1440,1000)]:
            page.set_viewport_size({'width':width,'height':height})
            page.wait_for_timeout(200)
            assert slot('engineering',0).locator('img').is_visible()
            overflow=page.locator('#ship-inventory').evaluate('(el)=>[el,...el.querySelectorAll(".inventory-panel,.inventory-loadout,.inventory-cargo,.inventory-grid")].filter(n=>n.clientHeight && n.scrollHeight>n.clientHeight+2).map(n=>n.className)')
            page.screenshot(path=str(OUTPUT/f'inventory-{width}.png'))
            assert not overflow,(width,height,overflow,page.locator('.inventory-loadout').evaluate('(n)=>({h:n.clientHeight,s:n.scrollHeight})'))
        assert not errors,errors
        report={'passed':True,'actualKeyboardSpeeds':speeds,'portPurchases':True,'generatedArtworkLoaded':True,'dragSwapAndRemoval':True,'emptyBayReload':True,'mobileNoOverflow':True,'javascriptErrors':errors}
        (OUTPUT/'report.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
