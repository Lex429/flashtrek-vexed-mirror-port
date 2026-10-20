"""Check real setup lighting, showcase shader identity, lifecycle and screen fit."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'setup-preview'
OUTPUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


TRACK = r"""() => {
  window.__setupCalls = new WeakMap();
  const draw = vexedFlightAssets.drawShip;
  vexedFlightAssets.drawShip = function(ctx, asset, x, y, width, angle, time, appearance) {
    if (ctx.canvas.closest('#setup-ui')) {
      const count = (__setupCalls.get(ctx.canvas)?.count || 0) + 1;
      __setupCalls.set(ctx.canvas, {asset, x, y, width, angle, time, appearance, count});
    }
    return draw.apply(this, arguments);
  };
}"""

PIXELS = r"""() => {
  const canvas = document.querySelector('#setup-ui canvas.ready');
  const call = __setupCalls.get(canvas), a = call.asset;
  const check = (v, m) => { if (!v) throw Error(m); };
  check(a.damageStage === 0, 'Preview loaded damaged artwork');
  check(a.profile.effects === starterShips.get(a.type).effects, 'Showcase shader changed');
  check(call.appearance.lights && !call.appearance.damage, 'Healthy lighting flags changed');
  check(call.appearance.lightGain === 2.8 && call.appearance.lightBloom === 2.5, 'Full lamp gain/bloom missing');
  check(Math.abs(call.width / call.appearance.height - a.width / a.height) < 1e-9, 'Hull distorted');
  check(call.width < canvas.width && call.appearance.height < canvas.height, 'No room for bloom');
  function render(time, lights, light = call.appearance.light) {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    vexedFlightAssets.drawShip(c.getContext('2d'), a, call.x, call.y, call.width,
      call.angle, time, {...call.appearance, lights, light});
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  }
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const expected = render(call.time, true);
  check(pixels.every((v, i) => v === expected[i]), 'Menu pixels differ from shared renderer');
  const on = render(1000, true), off = render(1000, false), later = render(2347, true);
  const unshaded = render(1000, true, null);
  let lit = 0, animated = 0, shaded = 0, visible = 0;
  for (let i = 0; i < on.length; i += 4) {
    const diff = other => Math.abs(on[i] - other[i]) + Math.abs(on[i+1] - other[i+1]) + Math.abs(on[i+2] - other[i+2]);
    if (on[i+3] > 30) visible++;
    if (diff(off) > 8) lit++;
    if (diff(later) > 8) animated++;
    if (diff(unshaded) > 8) shaded++;
  }
  check(visible > 100, 'Ship is invisible');
  check(lit > 5, 'Ship lamps are invisible');
  check(animated > 0, 'Showcase lamps do not animate');
  check(shaded > 10, 'Directional hull illumination missing');
  return {ship: a.type, name: a.name, lit, animated, shaded, sharedPixelsEqual: true};
}"""

FIT = r"""() => {
  const ui = document.querySelector('#setup-ui'), rect = e => e.getBoundingClientRect();
  const check = (v, m) => { if (!v) throw Error(m); };
  const top = rect(ui.querySelector('.setup-top')), body = rect(ui.querySelector('.setup-body'));
  const bottom = rect(ui.querySelector('.setup-bottom'));
  check(top.bottom <= body.top + 1 && body.bottom <= bottom.top + 1, 'Controls overlap');
  for (const el of [ui, ...ui.querySelectorAll('.setup-body,.setup-panel,.faction-card,.setup-specs > div,.setup-ship-preview,.setup-ship-art')]) {
    check(el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1, 'Content overflows ' + el.className);
  }
  for (const panel of ui.querySelectorAll('.setup-panel')) {
    const children = [...panel.children];
    for (let i = 0; i < children.length; i++) for (let j = i+1; j < children.length; j++) {
      const a = rect(children[i]), b = rect(children[j]);
      check(Math.min(a.right,b.right)-Math.max(a.left,b.left) <= 1 || Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top) <= 1, 'Panel sections overlap');
    }
  }
  for (const cell of ui.querySelectorAll('.setup-specs > div')) {
    const label = rect(cell.querySelector('dt')), value = rect(cell.querySelector('dd'));
    check(label.bottom <= value.top+1 || label.right <= value.left+1, 'Stat text overlaps');
    check(rect(cell.querySelector('dd span')).right <= rect(cell).right+1, 'Stat spills into neighbor');
  }
  const canvas = ui.querySelector('canvas.ready'), c = rect(canvas), art = rect(canvas.parentElement);
  const call = __setupCalls.get(canvas);
  check(canvas.dataset.ship === String(call.asset.type), 'Wrong ship after selection');
  check(Math.abs(call.width/call.appearance.height-call.asset.width/call.asset.height) < 1e-9, 'Ship aspect changed');
  check(c.left >= art.left-1 && c.top >= art.top-1 && c.right <= art.right+1 && c.bottom <= art.bottom+1, 'Canvas exceeds preview');
  check(art.bottom <= rect(ui.querySelector('figcaption')).top+1, 'Ship overlaps caption');
  return true;
}"""

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850}, device_scale_factor=2)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('response', lambda r: errors.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('() => window.nativeSetup && document.querySelector("#startup").hidden', timeout=90000)
        page.evaluate(TRACK)
        saved_before = page.evaluate('() => JSON.stringify(localStorage)')
        page.locator('[data-menu="new"]').click()

        def ready():
            page.wait_for_function('() => {const c=document.querySelector("#setup-ui canvas.ready");return c && __setupCalls.has(c);}')

        lighting = []
        for faction in range(1, 9):
            page.locator(f'.faction-card[data-faction="{faction}"]').click()
            ready()
            lighting.append({'faction': faction, 'step': 'faction', **page.evaluate(PIXELS)})
            page.locator('.setup-primary').click()
            ready()
            lighting.append({'faction': faction, 'step': 'command', **page.evaluate(PIXELS)})
            page.screenshot(path=str(OUTPUT / f'command-faction-{faction}.png'))
            page.locator('.setup-back').click()

        sizes = [(1280,850),(1920,1080),(1024,768),(900,600),(768,600),
                 (390,844),(1280,500),(768,500),(1366,768),(1536,864)]
        fits = 0
        for width, height in sizes:
            page.set_viewport_size({'width': width, 'height': height})
            for faction in range(1, 9):
                page.locator(f'.faction-card[data-faction="{faction}"]').click()
                ready()
                page.evaluate(FIT)
                page.locator('.setup-primary').click()
                ready()
                page.evaluate(FIT)
                fits += 2
                if faction == 2 and width in (390, 900, 1280):
                    page.screenshot(path=str(OUTPUT / f'command-{width}-{height}.png'))
                page.locator('.setup-back').click()

        page.set_viewport_size({'width': 1280, 'height': 850})
        page.evaluate('() => document.body.dataset.view="classic"')
        ready()
        page.evaluate(FIT)
        page.locator('.setup-primary').click()
        ready()
        page.evaluate(FIT)
        page.locator('.setup-back').click()
        for faction in range(1, 9):
            page.evaluate('(id) => document.querySelector(`.faction-card[data-faction="${id}"]`).click()', faction)
        ready()
        assert page.locator('#setup-ui canvas').get_attribute('data-ship') == '44'

        page.emulate_media(reduced_motion='reduce')
        page.wait_for_function('() => __setupCalls.get(document.querySelector("#setup-ui canvas")).time===0')
        page.wait_for_timeout(100)
        frozen = page.evaluate('() => __setupCalls.get(document.querySelector("#setup-ui canvas")).count')
        page.wait_for_timeout(180)
        assert page.evaluate('() => __setupCalls.get(document.querySelector("#setup-ui canvas")).count') == frozen
        page.set_viewport_size({'width': 1024, 'height': 768})
        page.wait_for_function('(n) => __setupCalls.get(document.querySelector("#setup-ui canvas")).count>n', arg=frozen)
        page.evaluate(FIT)
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_function('() => __setupCalls.get(document.querySelector("#setup-ui canvas")).time>0')
        count = page.evaluate('() => __setupCalls.get(document.querySelector("#setup-ui canvas")).count')
        page.wait_for_function('(n) => __setupCalls.get(document.querySelector("#setup-ui canvas")).count>n+2', arg=count)

        page.evaluate('() => {window.__oldSetupCanvas=document.querySelector("#setup-ui canvas");}')
        page.locator('.setup-back').click()
        stopped = page.evaluate('() => __setupCalls.get(__oldSetupCanvas).count')
        page.wait_for_timeout(180)
        assert page.evaluate('() => __setupCalls.get(__oldSetupCanvas).count') == stopped
        assert page.evaluate('() => JSON.stringify(localStorage)') == saved_before

        page.locator('[data-menu="new"]').click()
        page.locator('.setup-primary').click()
        ready()
        page.locator('input[name="captain"]').fill('Lighting Check')
        page.locator('.setup-back').click()
        page.locator('.setup-primary').click()
        assert page.locator('input[name="captain"]').input_value() == 'Lighting Check'
        page.locator('.setup-primary').click()
        page.wait_for_function('() => document.body.classList.contains("playing") && !nativeSetup.active')
        assert not errors, errors
        report = {'passed': True, 'lighting': lighting, 'fittedScreens': fits, 'classicView': True,
                  'reducedMotion': True, 'reducedMotionResize': True, 'resumeAnimation': True,
                  'stopsOnClose': True, 'rapidSelection': True, 'menuPreservesSaves': True,
                  'backPreservesNames': True, 'normalLaunch': True, 'javascriptErrors': errors}
        (OUTPUT / 'report.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
