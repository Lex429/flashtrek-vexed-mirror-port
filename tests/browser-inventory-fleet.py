"""Real Inventory Fleet controls, saved orders, failure rollback and narrow layouts."""
import functools, http.server, json, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'inventory-fleet'
OUT.mkdir(parents=True, exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda r: errors.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200', timeout=120000)

        def observe():
            page.evaluate('''()=>{
              const ensure=nativeShipEquipment.ensure;
              window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&s===h)window.__fleetState=s;return ensure(s,h,d);}};
              window.__fleetClock=nativeSimulation;window.nativeSimulation={...__fleetClock,blocked:()=>true};nativeSimulationHost.checkpoint();
            }''')
        observe()
        page.evaluate('''()=>{
          const s=nativeNpcDev.getState();window.__fleetState=s;
          Object.assign(s,{devMode:false,captain:'Fleet Test',shipName:'ISS Original',shipType:7,system:1,localBody:3,localBodySystem:1,localSystemVersion:2,phase:'flight',landed:false,latinum:10000000,antimatter:0,dilithium:0,deuranium:0,food:0,minerals:{},solFreightHold:{},localContracts:[],vx:0,vy:0,speed:0});
          for(const key of ['shipyardDock','localCruise','arrivalApproach','pendingTransit','manualFlightRegion'])delete s[key];
          const yard=nativeShipConstruction.position(s),earth=nativeSystemCatalog.bodies(1).find(b=>b.id===3);s.x=yard.x-earth.x;s.y=yard.y-earth.y;
          nativeShipEquipment.ensure(s);if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');
        }''')
        page.locator('#inventoryBtn').click()
        assert page.locator('.inventory-right-tabs button').evaluate_all('(items)=>items.map(e=>e.dataset.rightPage)') == ['inventory','fleet','collectables','deliveries']
        page.locator('.inventory-right-tabs [data-right-page="fleet"]').click()
        assert page.locator('.inventory-fleet-empty').is_visible()
        assert page.locator('.inventory-items-page').is_hidden()
        page.locator('[data-open-shipyard]').click()
        assert page.locator('#ship-inventory').is_hidden()
        assert page.locator('#ship-construction').is_visible()
        page.locator('[data-build-open-fleet]').click()
        assert page.locator('#ship-construction').is_hidden()
        assert page.locator('#ship-inventory').get_attribute('data-right-page') == 'fleet'
        page.locator('.inventory-close').click()

        page.evaluate('''()=>{
          const s=__fleetState;
          for(let i=0;i<6;i++){const r=nativeShipConstruction.order(s,{shipType:7,name:'ISS Fleet '+(i+1)},()=>nativeSaveStorage.write(s));if(!r.ok)throw Error(r.error);}
          const duration=s.shipConstruction.orders.at(-1).finishAt-nativeSimulation.seconds(s)+.1;
          window.nativeSimulation={...__fleetClock,blocked:()=>false};nativeSimulation.advance(s,duration);
          const r=nativeShipConstruction.advance(s,duration,()=>nativeSaveStorage.write(s));if(r.commissioned!==6)throw Error('Commission failed');
          window.nativeSimulation={...__fleetClock,blocked:()=>true};nativeSimulationHost.checkpoint();
        }''')
        page.locator('#inventoryBtn').click()
        page.locator('.inventory-right-tabs [data-right-page="fleet"]').click()
        assert page.locator('.inventory-fleet-row').count() == 6
        destination = page.locator('[data-fleet-system] option').evaluate_all('(items)=>items.find(e=>e.value!=="1").value')
        page.locator('[data-fleet-system]').select_option(destination)
        page.locator('[data-fleet-order="follow"]').first.click()
        assert page.evaluate('()=>nativeShipConstruction.fleet(__fleetState)[0].fleetOrder.mode') == 'follow'
        page.locator('[data-fleet-order="hold"]').first.click()
        assert page.evaluate('()=>nativeShipConstruction.fleet(__fleetState)[0].fleetOrder.mode') == 'hold'
        # A rejected verified write must leave the existing order in place.
        page.evaluate('()=>{window.__fleetStorage=nativeSaveStorage;window.nativeSaveStorage={...__fleetStorage,write:()=>({ok:false,error:"Fleet save test failed"})};}')
        page.locator('[data-fleet-order="travel"]').first.click()
        assert page.evaluate('()=>nativeShipConstruction.fleet(__fleetState)[0].fleetOrder.mode') == 'hold'
        assert 'Fleet save test failed' in page.locator('.inventory-fleet-note').inner_text()
        page.evaluate('window.nativeSaveStorage=__fleetStorage')
        page.locator('[data-fleet-order="travel"]').first.click()
        assert page.evaluate('()=>nativeShipConstruction.fleet(__fleetState)[0].fleetOrder')['system'] == int(destination)
        assert 'Travelling to' in page.locator('.inventory-fleet-row').first.inner_text()
        assert page.locator('[data-fleet-system]').input_value() == destination
        for tab in ['collectables','deliveries','inventory','fleet']:
            page.locator(f'.inventory-right-tabs [data-right-page="{tab}"]').click()
            assert page.locator('#ship-inventory').get_attribute('data-right-page') == tab
        assert page.locator('[data-fleet-system]').input_value() == destination
        # Command transfer updates the flagship and retains the original as a fleet vessel.
        page.locator('[data-fleet-command]').nth(1).click()
        assert page.evaluate('()=>__fleetState.shipName') == 'ISS Fleet 2', page.locator('.inventory-fleet-note').inner_text()
        assert 'ISS Fleet 2' in page.locator('.inventory-fleet-flagship').inner_text()
        assert 'Sol' in page.locator('.inventory-fleet-flagship').inner_text()
        assert 'ISS Original' in page.locator('.inventory-fleet-roster').inner_text()
        page.screenshot(path=str(OUT/'fleet-desktop.png'))

        layouts = []
        for width, height in [(1440,1000),(960,720),(640,800),(390,844),(360,640)]:
            page.set_viewport_size({'width':width,'height':height})
            cargo = page.locator('[data-inventory-view="cargo"]')
            if cargo.is_visible(): cargo.click()
            page.locator('.inventory-right-tabs [data-right-page="fleet"]').click()
            page.wait_for_timeout(160)
            tabs = page.locator('.inventory-right-tabs').evaluate('e=>({width:e.clientWidth,scroll:e.scrollWidth,right:e.getBoundingClientRect().right})')
            assert tabs['scroll'] <= tabs['width']+1 and tabs['right'] <= width, tabs
            last = page.locator('[data-fleet-order="hold"]').last
            last.scroll_into_view_if_needed()
            box = last.bounding_box()
            assert box and box['y'] >= 0 and box['y']+box['height'] <= height, box
            last.click()
            assert page.evaluate('()=>nativeShipConstruction.fleet(__fleetState).at(-1).fleetOrder.mode') == 'hold'
            # Mouse wheel scrolling reaches distant ships without moving the modal.
            area = page.locator('.inventory-fleet-page')
            area.evaluate('e=>e.scrollTop=0')
            area.hover()
            page.mouse.wheel(0,1200)
            page.wait_for_timeout(200)
            assert area.evaluate('e=>e.scrollTop>0'), (width,height)
            page.screenshot(path=str(OUT/f'fleet-{width}x{height}.png'))
            layouts.append([width,height])

        page.locator('.inventory-close').click()
        page.reload()
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        observe();page.evaluate('resumeNativeGame("normal")')
        page.wait_for_function('()=>window.__fleetState?.shipName==="ISS Fleet 2"', timeout=120000)
        page.evaluate('nativeShipInventory.open({page:"fleet"})')
        assert page.locator('.inventory-fleet-row').count() == 6
        assert page.evaluate('()=>nativeShipConstruction.fleet(__fleetState)[0].fleetOrder.mode') == 'travel'
        assert not errors, errors
        report = {'tabOrder':['Inventory','Fleet','Collectables','Deliveries'],'fleetShips':6,'savedTravel':True,'saveRollback':True,'commandTransfer':True,'layouts':layouts,'errors':errors}
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report),flush=True)
        browser.close()
finally:
    server.shutdown()
