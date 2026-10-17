"""Exercise the live map through real pointer, wheel and keyboard input."""
from pathlib import Path
import functools
import http.server
import sys
import threading
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'galaxy-controls'
OUTPUT.mkdir(parents=True,exist_ok=True)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = None
if len(sys.argv)>1:
    base=sys.argv[1].rstrip('/')
else:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        **({'channel':os.environ.get('BROWSER_CHANNEL','msedge')} if os.environ.get('BROWSER_CHANNEL','msedge') else {}),
        headless=True,
    )
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.set_default_timeout(10000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base+'/html-games/broken-mirror-port/index.html')
    frame = page
    game = page.main_frame
    frame.locator('[data-menu="dev"]').click(timeout=20000)
    frame.locator('#devToolsBtn').click()
    frame.locator('#galaxy-map-button').click()

    def state():
        return game.evaluate('nativeGalaxyOverview.snapshot()')

    def settle():
        page.wait_for_timeout(150)

    def map_point(x, y):
        box = frame.locator('#space').bounding_box()
        ratio = box['height'] / state()['view']['height']
        return box['x'] + x * ratio, box['y'] + y * ratio

    page.wait_for_function("() => {const s=nativeGalaxyOverview.snapshot();return s.active&&s.markers.length>10;}")
    initial = state()
    assert len(initial['ships']) > 100
    assert frame.locator('#dev-galaxy-ships [data-list]').count() == 0
    assert frame.locator('#dev-galaxy-ships [data-search]').count() == 0

    # A crowded icon selects a real ship and moves closer to its group.
    cluster = next(m for m in initial['markers'] if len(m['ids']) > 1 and m['x'] > 250)
    page.mouse.click(*map_point(cluster['x'], cluster['y']))
    settle()
    selected = state()
    assert selected['selectedId'] is not None
    assert selected['view']['scale'] > initial['view']['scale']
    chosen_id = selected['selectedId']
    chosen = next(s for s in selected['ships'] if s['id'] == chosen_id)
    assert frame.locator('[data-name]').inner_text() == chosen['name']
    assert frame.locator('[data-activity]').inner_text()

    # Dragging pans the map and does not turn the pointer release into selection.
    start = selected['view']['center']
    box = frame.locator('#space').bounding_box()
    x, y = box['x'] + 160, box['y'] + 300
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 90, y + 60, steps=12)
    page.mouse.up()
    settle()
    dragged = state()
    assert dragged['selectedId'] == chosen_id
    assert dragged['view']['center']['x'] < start['x']
    assert dragged['view']['center']['y'] < start['y']

    # Wheel zoom stays anchored to the pointer's world position.
    x, y = box['x'] + 420, box['y'] + 420
    page.mouse.move(x, y)
    before = state()
    ratio = box['height'] / before['view']['height']
    # Both x and y should stay fixed despite zooming.
    world_x = before['view']['center']['x'] + ((x-box['x'])/ratio-before['view']['width']/2)/before['view']['scale']
    page.mouse.wheel(0, -80)
    settle()
    after = state()
    anchored_x = after['view']['center']['x'] + ((x-box['x'])/ratio-after['view']['width']/2)/after['view']['scale']
    assert after['zoom'] > before['zoom']
    assert abs(anchored_x-world_x) < 1

    # Search is separate from the selected-ship panel and closes after choosing.
    frame.locator('.dev-galaxy-finder summary').click()
    frame.locator('[data-search]').fill('Sol Freight 01')
    frame.locator('[data-search]').press('i')
    assert frame.locator('#ship-inventory').is_hidden()
    frame.locator('[data-search]').fill('Sol Freight 01')
    frame.locator('[data-ship-id="tug:0"]').click()
    settle()
    assert state()['selectedId'] == 'tug:0'
    assert not frame.locator('.dev-galaxy-finder').evaluate('(el)=>el.open')
    assert frame.locator('[data-name]').inner_text() == 'Sol Freight 01'
    assert 'undefined' not in frame.locator('#dev-galaxy-ships').inner_text()
    frame.locator('[data-track]').click()
    settle()
    assert state()['trackedId'] == 'tug:0'
    assert frame.locator('[data-track]').inner_text() == 'Stop following'

    # Tracking controls retain focus and technical details stay open during updates.
    frame.locator('[data-track]').focus()
    game.evaluate("document.querySelector('.dev-galaxy-more').open=true")
    page.wait_for_timeout(700)
    assert frame.locator('[data-track]').evaluate('(el)=>el===document.activeElement')
    assert frame.locator('.dev-galaxy-more').evaluate('(el)=>el.open')
    game.evaluate("document.querySelector('.dev-galaxy-more').open=false")
    page.screenshot(path=str(OUTPUT / 'selected-desktop.png'))

    page.mouse.move(box['x']+150, box['y']+300)
    page.mouse.down()
    page.mouse.move(box['x']+220, box['y']+320, steps=8)
    page.mouse.up()
    settle()
    assert state()['trackedId'] is None
    frame.locator('[data-galaxy]').click()
    settle()
    fitted = state()
    assert fitted['zoom'] == 1 and not fitted['localView']
    assert fitted['selectedId'] == 'tug:0'
    page.screenshot(path=str(OUTPUT / 'overview-desktop.png'))

    # Keyboard navigation and visible zoom buttons work without flight controls.
    frame.locator('#space').focus()
    page.keyboard.press('ArrowRight')
    settle()
    assert state()['view']['center']['x'] > fitted['view']['center']['x']
    frame.locator('[data-zoom-in]').click()
    settle()
    assert state()['zoom'] == 1.5
    frame.locator('[data-zoom-out]').click()
    settle()
    assert abs(state()['zoom'] - 1) < .001
    frame.locator('[data-clear]').click()
    settle()
    assert state()['selectedId'] is None

    for width, height in [(900, 540), (390, 740)]:
        page.set_viewport_size({'width': width, 'height': height})
        settle()
        frame.locator('.dev-galaxy-finder summary').click()
        frame.locator('[data-search]').fill('Sol Freight 01')
        frame.locator('[data-ship-id="tug:0"]').click()
        settle()
        assert state()['view']['width'] > 100
        assert state()['markers']
        assert game.evaluate('document.documentElement.scrollWidth<=innerWidth')
        for selector in ['[data-galaxy]', '[data-zoom-in]', '#dev-galaxy-return']:
            button = frame.locator(selector).bounding_box()
            assert button and button['x'] >= 0 and button['y'] >= 0
            assert button['x']+button['width'] <= width+1
            assert button['y']+button['height'] <= height+1
        page.screenshot(path=str(OUTPUT / f'selected-{width}.png'))

    frame.locator('#dev-galaxy-return').click()
    assert not state()['active']
    assert frame.locator('#dev-galaxy-controls').is_hidden()
    assert frame.locator('#dev-galaxy-ships').is_hidden()
    assert not errors, errors
    browser.close()
    print('Galaxy controls passed: selection, drag, anchored zoom, search, tracking, keyboard, responsive layout, return to flight; no browser errors.')

if server:
    server.shutdown()
