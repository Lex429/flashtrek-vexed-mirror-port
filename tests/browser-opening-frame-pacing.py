"""Exercise the real film lifecycle at deterministic display refresh rates.

Rendering and audio are stubbed to isolate scheduling; this is not an FPS benchmark.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / 'html-games/broken-mirror-port'
SETUP = r'''() => {
  let serial=0;
  const callbacks=new Map();
  window.requestAnimationFrame=fn=>{callbacks.set(++serial,fn);return serial;};
  window.cancelAnimationFrame=id=>callbacks.delete(id);
  window.stepDisplay=(hz,seconds=1)=>{
    const start=performance.now();
    for(let i=1;i<=hz*seconds;i++){
      const pending=[...callbacks.values()];callbacks.clear();
      for(const fn of pending)fn(start+i*1000/hz);
    }
  };
  window.Audio=class extends EventTarget {
    constructor(){super();this.dataset={};this.currentTime=0;this.paused=true;this.seeking=false;}
    load(){queueMicrotask(()=>this.dispatchEvent(new Event('loadedmetadata')));}
    play(){return Promise.reject(Error('Use the fallback clock for deterministic scheduling'));}
    pause(){this.paused=true;}
  };
  let frames=0;
  const noop=()=>{},done=()=>Promise.resolve();
  window.nativeOpeningRenderer={create:()=>({prepare:done,warm:done,resize:noop,advance:noop,
    draw(){frames++;},explosions:()=>[],cancelPreparation:noop,release:noop,snapshot:()=>({frames})})};
  window.nativeOpeningScore={create:()=>({start:noop,volume:noop,prepare:done,tick:noop,
    explosions:noop,pause:noop,sync:noop,stop:noop,snapshot:()=>({})})};
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('http://film.test/**', lambda route: route.fulfill(
        content_type='application/json', body=(GAME / 'assets/opening/cinematic.json').read_text()
    ) if route.request.url.endswith('cinematic.json') else route.fulfill(
        content_type='text/html', body='<div id="menu-art"></div><canvas id="space"></canvas>'
    ))
    page.goto('http://film.test/index.html')
    page.evaluate(SETUP)
    page.add_script_tag(content=(GAME / 'opening-storyboard.js').read_text(encoding='utf-8'))
    page.add_script_tag(content=(GAME / 'opening-cinematic.js').read_text(encoding='utf-8'))
    page.evaluate('nativeOpeningCinematic.play()')
    page.wait_for_function('nativeOpeningCinematic.snapshot().ready', polling=100)
    results = []
    for hz in [120, 165]:
        before = page.evaluate('nativeOpeningCinematic.snapshot()')
        page.evaluate('(hz)=>stepDisplay(hz)', hz)
        after = page.evaluate('nativeOpeningCinematic.snapshot()')
        frames = after['renderer']['frames'] - before['renderer']['frames']
        assert frames == hz, (hz, frames)
        # Wall-clock time between separate tasks precedes the first callback.
        elapsed = after['time'] - before['time']
        assert 1 <= elapsed < 1.1, elapsed
        page.locator('[data-film-action=pause]').click()
        paused = page.evaluate('nativeOpeningCinematic.snapshot()')
        page.evaluate('(hz)=>stepDisplay(hz)', hz)
        still = page.evaluate('nativeOpeningCinematic.snapshot()')
        assert still['time'] == paused['time']
        assert still['renderer']['frames'] == paused['renderer']['frames']
        page.locator('[data-film-action=pause]').click()
        results.append({'refreshHz': hz, 'draws': frames, 'pauseFrozen': True})
    page.evaluate('nativeOpeningCinematic.skip()')
    assert not errors, errors
    print(json.dumps({'scheduling': results, 'errors': errors, 'performanceBenchmark': False}))
    browser.close()
