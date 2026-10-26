"""Compare setup pixels with artwork and draw calls captured from a real showcase.

Pass http://127.0.0.1:7788 to audit the user's live reference. By default both
pages use the isolated repository server, so the same check also runs in CI.
"""
import argparse
import base64
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'setup-showcase'
OUTPUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


CAPTURE = r"""() => {
  const drawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
    const matrix = this.getTransform();
    if (this.canvas.id === 'scene' && image.width > 128 && image.height > 128 && args.length === 4 &&
        Math.abs(matrix.e - 540) < 1 && Math.abs(matrix.f - 253) < 1) {
      window.__referenceArt = image;
    }
    return drawImage.call(this, image, ...args);
  };
  for (const id of [7,6,39,18,29,25,16,44]) {
    const profile = starterShips.get(id), draw = profile.effects.draw;
    starterShips.set(id, {...profile, effects: {...profile.effects, draw(...args) {
      window.__referenceCall = {id, profile, layout: {...args[1]}, angle: args[2],
        stage: args[3], options: {...args[5]}, art: window.__referenceArt};
      return draw.apply(this, args);
    }}});
  }
}"""

REFERENCE = r"""({id, time}) => {
  const call = __referenceCall;
  if (call.id !== id || call.stage !== 0 || call.angle !== 0 || !call.art) throw Error('Reference not intact and ready');
  const ratio = call.layout.w / call.layout.h;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 540;
  const ctx = canvas.getContext('2d');
  const w = Math.min(380, 380 * ratio), h = w / ratio, layout = {x:270, y:270, w, h};
  ctx.save(); ctx.translate(270,270); ctx.drawImage(call.art,-w/2,-h/2,w,h); ctx.restore();
  call.profile.effects.draw(ctx, layout, 0, 0, time, call.options);
  return {ratio, png: canvas.toDataURL(), options: call.options};
}"""

MENU = r"""async ({id, time, ratio}) => {
  const asset = await nativeSetupShipPreview.load(id);
  if (Math.abs(asset.ratio - ratio) > 1e-9) throw Error('Preview proportions differ from reference');
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 540;
  const w = Math.min(380, 380 * ratio), h = w / ratio;
  nativeSetupShipPreview.draw(canvas.getContext('2d'), asset, {x:270, y:270, w, h}, time);
  return canvas.toDataURL();
}"""

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('reference_base', nargs='?')
args = parser.parse_args()
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
reference_base = (args.reference_base or base).rstrip('/')
errors, cases = [], []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        menu = browser.new_page(viewport={'width': 1280, 'height': 850}, reduced_motion='reduce')
        reference = browser.new_page(viewport={'width': 1280, 'height': 1000})
        for page in (menu, reference):
            page.on('pageerror', lambda e: errors.append(str(e)))
        menu.goto(base + '/html-games/broken-mirror-port/index.html')
        menu.wait_for_function('() => window.nativeSetupShipPreview && document.querySelector("#startup").hidden', timeout=90000)
        reference.goto(reference_base + '/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=6')
        reference.wait_for_function('() => window.showcaseState?.().ready', timeout=120000)
        reference.evaluate(CAPTURE)
        for id in (7,6,39,18,29,25,16,44):
            reference.evaluate('() => {window.__referenceCall=null;window.__referenceArt=null;}')
            reference.locator('#ship-select').select_option(str(id))
            reference.wait_for_function('(id) => showcaseState().ready && showcaseState().ship===id && window.__referenceCall?.id===id && !!__referenceCall.art', arg=id, timeout=60000)
            for time in (0,1000,2347):
                expected = reference.evaluate(REFERENCE, {'id': id, 'time': time})
                actual = menu.evaluate(MENU, {'id': id, 'time': time, 'ratio': expected['ratio']})
                if actual != expected['png'] or (id == 6 and time == 1000):
                    for label, png in [('reference', expected['png']), ('menu', actual)]:
                        (OUTPUT / f'{label}-{id}-{time}.png').write_bytes(base64.b64decode(png.split(',')[1]))
                assert actual == expected['png'], f'Actual showcase pixels differ for ship {id} at {time} ms'
                cases.append({'ship': id, 'time': time, 'ratio': expected['ratio'],
                              'identical': True, 'sha256': hashlib.sha256(actual.encode()).hexdigest()})
            print(f'Ship {id}: three exact showcase comparisons passed', flush=True)
            if id == 6:
                reference.locator('#scene').screenshot(path=str(OUTPUT / 'live-showcase-saber.png'))
        assert not errors, errors
        report = {'passed': True, 'reference': reference_base, 'comparisons': cases, 'javascriptErrors': errors}
        (OUTPUT / 'report.json').write_text(json.dumps(report, indent=2))
        print(json.dumps({'passed': True, 'reference': reference_base, 'exactPixelComparisons': len(cases), 'ships': 8, 'javascriptErrors': errors}))
        browser.close()
finally:
    server.shutdown()
