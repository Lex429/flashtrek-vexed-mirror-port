"""Actual mouse/touch fitting, sparse tile persistence and inventory accessibility."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'inventory-drag'
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
        page.evaluate("""()=>{
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          Object.assign(s,{devMode:false,captain:'Inventory regression',shipName:'USS Danube',shipType:7,system:1,localBody:3,
            latinum:10000,antimatter:80,deuranium:12,dilithium:25,food:40,miningTool:true,weapons:[1],weaponInventory:[],
            minerals:{iron:7},solFreightHold:{0:8},localContracts:[],hull:50,shields:50,phase:'docked',localCruise:null,arrivalApproach:null});
          delete s.shipEquipment;delete s.weaponLoadout;delete s.repairBay;delete s.inventoryLayout;
          const ensure=nativeShipEquipment.ensure;
          window.nativeShipEquipment={...nativeShipEquipment,ensure(value,h=value,d){if(value?.captain&&h===value)window.__inventoryState=value;return ensure(value,h,d);}};
          nativeSaveStorage.write(s);resumeNativeGame('normal');window.nativeSimulation={...nativeSimulation,blocked:()=>true};
        }""")
        page.locator('#inventoryBtn').click()
        page.wait_for_selector('#ship-inventory canvas.ready')

        def cell(index):
            return page.locator(f'#ship-inventory [data-inventory-cell="{index}"]')

        def slot(kind):
            return page.locator(f'#ship-inventory [data-equipment-place="slot"][data-equipment-kind="{kind}"][data-equipment-index="0"]')

        def center(locator):
            box = locator.bounding_box()
            assert box
            return (box['x'] + box['width']/2, box['y'] + box['height']/2)

        store_index=int(page.locator('[data-inventory-cell]').last.get_attribute('data-inventory-cell'))-2
        # Every resource and contract tile is movable, including holes in the grid.
        page.locator('[data-item-key="supply:food"]').drag_to(cell(store_index))
        assert cell(store_index).get_attribute('data-item-key') == 'supply:food'
        engine = slot('engineering').get_attribute('data-item-key')
        slot('engineering').drag_to(cell(store_index))
        assert cell(store_index).get_attribute('data-item-key') == engine
        assert page.locator('[data-item-key="supply:food"]').count() == 1
        assert page.evaluate('nativeShipDefinitions.forEntity(__inventoryState).movement.maxSpeed') == 90
        assert page.evaluate('nativeShipDefinitions.forEntity(__inventoryState).movement.acceleration') > 0
        # Wrong-type drops cannot spend or duplicate an owned item.
        snapshot = page.evaluate('JSON.stringify(__inventoryState.shipEquipment)')
        cell(store_index).click()
        page.locator('[data-equipment-place="slot"][data-equipment-kind="weapon"][data-equipment-index="1"]').click()
        assert 'compatible' in page.locator('.inventory-hint').inner_text().lower()
        assert page.evaluate('JSON.stringify(__inventoryState.shipEquipment)') == snapshot
        cell(store_index).drag_to(slot('engineering'))
        assert page.evaluate('nativeShipDefinitions.forEntity(__inventoryState).movement.acceleration') > 0
        # Extra arrangement space is explicit rather than a phantom blank page.
        page.locator('[data-inventory-page="add"]').click()
        page.locator('[data-inventory-page="previous"]').click()
        # Holding a real mouse drag over the page arrow opens another page.
        origin=center(page.locator('[data-item-key="mineral:iron"]'))
        page.mouse.move(*origin)
        page.mouse.down()
        page.mouse.move(origin[0]+10,origin[1],steps=4)
        arrow=center(page.locator('[data-inventory-page="next"]'))
        page.mouse.move(*arrow,steps=8)
        page.mouse.move(arrow[0]+1,arrow[1])
        page.wait_for_timeout(800)
        page.wait_for_selector('[data-inventory-cell="30"]')
        page.mouse.move(*center(cell(30)),steps=8)
        page.mouse.up()
        assert cell(30).get_attribute('data-item-key')=='mineral:iron'
        page.locator('[data-inventory-page="previous"]').click()
        # Click/keyboard use the same operation as dragging, including between pages.
        page.locator('[data-item-key="supply:food"]').click()
        page.locator('[data-inventory-page="next"]').click()
        cell(36).focus()
        page.keyboard.press('Enter')
        assert cell(36).get_attribute('data-item-key') == 'supply:food'
        page.locator('[data-inventory-page="previous"]').click()
        page.locator('.inventory-close').focus()
        page.keyboard.press('Shift+Tab')
        assert page.evaluate('document.activeElement.closest("#ship-inventory")!==null')
        page.screenshot(path=str(OUTPUT/'danube-desktop.png'))

        # Real touch events move equipment across the compact screen's two views.
        page.set_viewport_size({'width': 390, 'height': 844})
        page.locator('[data-inventory-view="loadout"]').click()
        slot('engineering').scroll_into_view_if_needed()
        cdp = page.context.new_cdp_session(page)

        def touch(event, point=None):
            cdp.send('Input.dispatchTouchEvent', {'type': event, 'touchPoints': [] if point is None else [{'x': point[0], 'y': point[1]}]})

        origin = center(slot('engineering'))
        touch('touchStart', origin)
        touch('touchMove', (origin[0]-10, origin[1]))
        touch('touchMove', center(page.locator('[data-inventory-view="cargo"]')))
        page.wait_for_function('()=>document.querySelector("#ship-inventory").dataset.view==="cargo"')
        target_index=int(page.locator('.inventory-blank').first.get_attribute('data-inventory-cell'))
        target = center(cell(target_index))
        touch('touchMove', target)
        touch('touchEnd')
        assert cell(target_index).get_attribute('data-item-key') == engine
        assert page.evaluate('__inventoryState.shipEquipment.slots.engineering[0]') is None
        page.wait_for_timeout(450)
        origin = center(cell(target_index))
        touch('touchStart', origin)
        touch('touchMove', (origin[0]-10, origin[1]))
        touch('touchMove', center(page.locator('[data-inventory-view="loadout"]')))
        page.wait_for_function('()=>document.querySelector("#ship-inventory").dataset.view==="loadout"')
        touch('touchMove', center(slot('engineering')))
        touch('touchEnd')
        assert slot('engineering').get_attribute('data-item-key') == engine
        assert page.evaluate('__inventoryState.shipEquipment.slots.engineering[0]')
        assert page.evaluate('document.querySelector(".inventory-panel").scrollWidth<=document.querySelector(".inventory-panel").clientWidth+1')
        assert slot('repairDrone').locator('img[src$="dot-basic.png"]').count() == 1
        page.screenshot(path=str(OUTPUT/'danube-mobile.png'))
        page.locator('[data-inventory-view="cargo"]').click()
        page.screenshot(path=str(OUTPUT/'inventory-mobile.png'))
        # Failed durable writes are reported by the drag interaction itself.
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.wait_for_timeout(450)
        page.evaluate("()=>{Storage.prototype.setItem=function(){throw Error('Test quota exhausted')};}")
        page.locator('[data-item-key="supply:dilithium"]').drag_to(page.locator('.inventory-blank').first)
        hint=page.locator('.inventory-hint').inner_text().lower()
        assert 'saving failed' in hint, hint
        assert not errors, errors
        report = {'passed': True, 'mouseFitting': True, 'touchAcrossViews': True, 'sparseCrossPageLayout': True, 'invalidDropPreservesEquipment': True, 'keyboardFitting': True, 'saveFailureFeedback': True, 'javascriptErrors': errors}
        (OUTPUT/'report.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
