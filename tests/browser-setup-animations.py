"""Exercise shared menu feedback and covered setup navigation with real input."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'setup-animations'
OUTPUT.mkdir(parents=True, exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = None
if len(sys.argv) > 1:
    BASE = sys.argv[1].rstrip('/')
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    BASE = f'http://127.0.0.1:{server.server_port}'
errors = []

with sync_playwright() as p:
    channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
    browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))

    def open_page(**options):
        page = browser.new_page(**options)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda r: errors.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        page.goto(BASE + '/html-games/broken-mirror-port/index.html')
        page.wait_for_function('() => window.nativeSetup && document.querySelector("#startup").hidden', timeout=90000)
        return page

    def idle(page):
        page.wait_for_function('() => !nativeMenuTransition.snapshot().active')

    page = open_page(viewport={'width': 1280, 'height': 850})
    before = page.evaluate('JSON.stringify([nativeSaveStorage.read("normal"),nativeSaveStorage.read("dev")])')
    page.locator('[data-menu="new"]').click()
    page.wait_for_selector('#setup-ui:not([hidden])')
    idle(page)
    page.wait_for_function('() => nativeMenuSounds.snapshot().decoded.length === 3')
    for faction in range(1, 9):
        card = page.locator(f'.faction-card[data-faction="{faction}"]')
        card.hover()
        assert card.evaluate('(b) => getComputedStyle(b,"::before").animationName') == 'menu-light-sweep'
        card.click()
        assert card.get_attribute('aria-pressed') == 'true'
        feedback = card.evaluate('''b => ({
            press: getComputedStyle(b).animationName,
            pulse: getComputedStyle(b, '::after').animationName,
            x: b.style.getPropertyValue('--menu-click-x'),
            color: getComputedStyle(b).getPropertyValue('--menu-edge')
        })''')
        assert feedback['press'] == 'menu-button-press' and feedback['pulse'] == 'menu-edge-pulse', feedback
        assert feedback['x'] and feedback['color']
        assert not page.evaluate('nativeMenuTransition.snapshot().active'), 'Faction previews should respond immediately'
    page.wait_for_function('() => !document.querySelector("#setup-ui .menu-activating")')
    page.screenshot(path=str(OUTPUT / 'factions-desktop.png'))

    # A double activation is held once, changes screens only under opaque cover,
    # and does not illuminate the hidden main menu emblem.
    held = page.evaluate('''() => {
        window.setupSwitches = [];
        new MutationObserver(() => setupSwitches.push({
            step: document.querySelector('#setup-ui').dataset.step,
            opacity: +getComputedStyle(document.querySelector('#menu-transition-cover')).opacity
        })).observe(document.querySelector('#setup-ui'), {attributes:true,attributeFilter:['data-step']});
        const b = document.querySelector('.setup-primary'); b.click(); b.click();
        return {step: document.querySelector('#setup-ui').dataset.step,
            transition: nativeMenuTransition.snapshot(),
            emblem: document.querySelector('.menu-compass').classList.contains('menu-emblem-cinematic')};
    }''')
    assert held['step'] == 'faction' and held['transition']['phase'] == 'holding' and not held['emblem'], held
    idle(page)
    switches = page.evaluate('setupSwitches')
    assert len(switches) == 1 and switches[0] == {'step': 'command', 'opacity': 1}, switches
    assert page.locator('input[name="captain"]').evaluate('(e) => e === document.activeElement')
    captain = page.locator('input[name="captain"]')
    captain.fill('')
    captain.press_sequentially('Avery', delay=45)
    assert page.locator('[data-command-name="captain"]').inner_text() == 'Captain Avery'
    assert captain.evaluate('(e) => e.selectionStart === 5 && e.selectionEnd === 5'), 'Typing feedback moved the caret'
    assert captain.evaluate('(e) => e.parentElement.getAnimations().length') == 1, 'Missing or unbounded typing pulse'
    page.keyboard.press('Tab')
    ship_input = page.locator('input[name="ship"]')
    assert ship_input.evaluate('(e) => e === document.activeElement')
    assert ship_input.evaluate('(e) => getComputedStyle(e.parentElement,"::before").animationName') == 'setup-field-sweep'
    ship_input.fill('<b>USS Meridian</b>')
    assert page.locator('[data-command-name="ship"]').inner_text() == '<b>USS Meridian</b>'
    assert page.locator('[data-command-name="ship"] b').count() == 0, 'Name became markup'
    ship_input.fill('USS Meridian')
    government = page.locator('input[name="government"]')
    government.fill('   ')
    assert not page.locator('#setup-ui').evaluate('(e) => e.classList.contains("command-ready")')
    assert float(page.locator('#setup-ui').evaluate('(e) => e.style.getPropertyValue("--command-charge")')) < 1
    government.fill('United Worlds')
    assert page.locator('#setup-ui').evaluate('(e) => e.classList.contains("command-ready")')
    assert page.locator('.setup-primary').evaluate('(e) => getComputedStyle(e,"::after").animationName') == 'setup-launch-breathe'
    assert page.locator('.setup-scanner').evaluate('(e) => getComputedStyle(e,"::before").animationName') == 'setup-scanner-orbit'
    assert page.locator('.setup-atmosphere').evaluate('(e) => getComputedStyle(e,"::before").animationName') == 'setup-particle-drift'
    page.screenshot(path=str(OUTPUT / 'command-desktop.png'))
    # Preference changes cancel a pulse already in flight, while keeping edits.
    captain.fill('Reduced Motion Captain')
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_function('() => document.querySelector("input[name=captain]").parentElement.getAnimations().length === 0')
    for selector in ['.setup-scanner', '.setup-atmosphere', '.setup-input-shell', '.setup-primary']:
        assert page.locator(selector).first.evaluate('(e) => getComputedStyle(e,"::before").animationName') == 'none'
    assert page.locator('.setup-primary').evaluate('(e) => getComputedStyle(e,"::after").animationName') == 'none'
    page.emulate_media(reduced_motion='no-preference')
    page.locator('input[name="captain"]').fill('Animation Captain')
    captain.evaluate('(e) => {window.__commandField=e.parentElement;}')
    page.locator('.setup-back').click()
    idle(page)
    assert page.locator('.faction-card[data-faction="8"]').get_attribute('aria-pressed') == 'true'
    page.locator('.setup-primary').focus()
    page.keyboard.press('Enter')
    idle(page)
    assert page.locator('input[name="captain"]').input_value() == 'Animation Captain'
    assert page.locator('[data-command-name="ship"]').inner_text() == 'USS Meridian'
    page.locator('.setup-back').focus()
    page.keyboard.press('Space')
    idle(page)
    # Escape cancels a held navigation without leaving an input-blocking cover.
    page.evaluate('document.querySelector(".setup-primary").click()')
    page.keyboard.press('Escape')
    idle(page)
    assert page.locator('#menu-transition-cover').is_hidden()
    assert page.locator('#menu-transition-cover').evaluate('(e) => e.getAnimations().length') == 0
    if page.evaluate('nativeSetup.active'):
        page.locator('.setup-back').click()
        idle(page)
    assert not page.evaluate('nativeSetup.active')
    assert page.locator('#setup-ui').evaluate('(e) => e.classList.contains("setup-suspended")')
    assert page.evaluate('__commandField.getAnimations().length') == 0
    assert page.evaluate('JSON.stringify([nativeSaveStorage.read("normal"),nativeSaveStorage.read("dev")])') == before

    # Reduced motion must keep every setup action synchronous and animation-free.
    page.emulate_media(reduced_motion='reduce')
    instant = page.evaluate('''() => {
        document.querySelector('[data-menu="new"]').click();
        document.querySelector('.faction-card[data-faction="4"]').click();
        const b = document.querySelector('.setup-primary'); b.click();
        return {step: document.querySelector('#setup-ui').dataset.step,
            active: nativeMenuTransition.snapshot().active,
            animation: getComputedStyle(document.querySelector('.setup-back'), '::before').animationName};
    }''')
    assert instant == {'step': 'command', 'active': False, 'animation': 'none'}, instant
    page.locator('input[name="captain"]').fill('')
    page.locator('.setup-primary').click()
    assert not page.evaluate('document.body.classList.contains("playing")'), 'Invalid command launched'
    page.locator('.setup-back').click()
    page.locator('.setup-back').click()
    page.emulate_media(reduced_motion='no-preference')
    page.locator('#menu-sound-toggle').click()
    played = page.evaluate('nativeMenuSounds.snapshot().played')
    page.locator('[data-menu="new"]').click()
    page.wait_for_selector('#setup-ui:not([hidden])')
    idle(page)
    page.locator('.faction-card[data-faction="3"]').click()
    page.wait_for_timeout(250)
    assert page.evaluate('nativeMenuSounds.snapshot().played') == played, 'Setup ignored the sound toggle'

    touch = open_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    touch.locator('[data-menu="new"]').tap()
    touch.wait_for_selector('#setup-ui:not([hidden])')
    idle(touch)
    touch.locator('.faction-card[data-faction="5"]').tap()
    assert touch.locator('.faction-card[data-faction="5"]').get_attribute('aria-pressed') == 'true'
    touch.screenshot(path=str(OUTPUT / 'factions-mobile.png'))
    touch.locator('.setup-primary').tap()
    idle(touch)
    assert touch.locator('#setup-ui').get_attribute('data-step') == 'command'
    touch.locator('input[name="captain"]').fill('Mobile Captain')
    touch.locator('input[name="ship"]').fill('ISS Resolute')
    assert touch.locator('[data-command-name="ship"]').inner_text() == 'ISS Resolute'
    touch.screenshot(path=str(OUTPUT / 'command-mobile.png'))
    assert not touch.evaluate('document.body.scrollWidth > innerWidth || document.body.scrollHeight > innerHeight')
    touch.locator('.setup-back').tap()
    idle(touch)
    touch.locator('.setup-back').tap()
    idle(touch)
    assert not touch.evaluate('nativeSetup.active')
    assert not errors, errors
    report = {'passed': True, 'factions': 8, 'sharedSweepPressPulse': True,
              'opaqueNavigation': True, 'doubleClickGuard': True, 'keyboard': True,
              'touch': True, 'reducedMotion': True, 'muteRespected': True,
              'namesPreserved': True, 'savesPreserved': True, 'typingPulse': True,
              'liveNamesAsText': True, 'caretPreserved': True, 'launchReadiness': True,
              'ambientScanner': True, 'motionPreferenceCancelsPulse': True,
              'effectsStopOnClose': True, 'javascriptErrors': errors}
    (OUTPUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    browser.close()

if server:
    server.shutdown()
