"""Exercise freight paperwork, real payment, documents, warp and normal-save reload."""
import ast
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/cargo-permits'
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('GAME_BASE_URL', 'http://127.0.0.1:7790').rstrip('/')

def literal_from(file, name):
    tree = ast.parse((ROOT / 'tests' / file).read_text(encoding='utf-8'))
    return next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == name for target in node.targets))

SETUP = literal_from('browser-planet-cargo.py', 'SETUP')
SETUP = SETUP.replace('const state=nativeNpcDev.getState();', 'const state=__contractGetState();')
CAPTURE = literal_from('browser-interstellar-contracts.py', 'CAPTURE')
VISIT = r"""([system,port])=>{
  const state=__contractGetState();nativePlanetEncounter.close(false);
  Object.assign(state,{system,localBody:port,localBodySystem:system,localSystemVersion:2,localCruise:null,arrivalApproach:null});
  nativeShipMotion.stop(state);nativeSystemCatalog.initialize(state);nativeShipSystems.invalidate(state);__cargoHub.openEncounter();
}"""
FIXTURE = r"""()=>{
  const state=__contractGetState(),source=nativeNpcLives.market(state,1,5),destination=nativeNpcLives.market(state,47,0);
  state.localPrestige=Object.fromEntries(VexedMirrorWorld.systems.map(system=>[system.id,100]));state.localPrestige[47]=-50;
  source.stock.fill(0);source.stock[8]=800;source.reserved.fill(0);source.incoming.fill(0);
  destination.stock.fill(0);destination.reserved.fill(0);destination.incoming.fill(0);destination.target.fill(300);destination.fundsReserved=0;destination.credits=1000000;
  const ship=nativeShipDefinitions.forEntity(state);state.hull=ship.hull;state.shields=ship.shields;state.antimatter=100000;
  nativeShipSystems.invalidate(state);
}"""
errors, failed, report = [], [], {}

with sync_playwright() as p:
    browser = p.chromium.launch(channel=os.environ.get('BROWSER_CHANNEL', 'msedge'), headless=True,
                                ignore_default_args=['--hide-scrollbars'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
    page.goto(BASE + '/html-games/broken-mirror-port/index.html')
    page.wait_for_function('()=>typeof startNativeDevGame==="function"&&document.querySelector("#startup").hidden', timeout=120000)
    page.evaluate('startNativeDevGame()')
    page.wait_for_function('()=>!!nativeNpcDev.getState()', timeout=120000)

    def capture():
        page.evaluate(CAPTURE)
        page.locator('#tradeBtn').click()
        page.wait_for_function('()=>!!window.__cargoHub')
        page.evaluate('nativeSystemHub.close(false)')

    def visit(system=1, port=5):
        page.evaluate(VISIT, [system, port])
        page.locator('[data-view-tab="cargo"]').click()
        page.locator('[data-cargo-view="interstellar"]').click()

    def bajor_row():
        return page.locator('[data-cargo-system="47"]').locator('xpath=../..')

    capture()
    page.evaluate(SETUP)
    page.evaluate(FIXTURE)
    visit()
    assert 'Trade-passage pass required' in bajor_row().inner_text()
    assert page.locator('[data-cargo-load][data-cargo-system="47"]').count() == 0
    before = page.evaluate('()=>({money:__contractGetState().latinum,stock:nativeNpcLives.market(__contractGetState(),1,5).stock[8],bank:nativeNpcLives.market(__contractGetState(),47,0).credits})')
    blocked = page.evaluate('__cargoBridge.interstellar(5,47,0,8,10)')
    assert not blocked['ok'] and 'pass' in blocked['error']
    assert page.evaluate('__contractGetState().localContracts.length') == 0
    page.locator('[data-cargo-permit][data-cargo-system="47"]').scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'hostile-permit-required.png'))
    page.locator('[data-cargo-permit][data-cargo-system="47"]').press('Enter')
    document = page.evaluate('__contractGetState().cargoPermits.documents[0]')
    assert document['kind'] == 'passage' and document['fee'] == 600 and document['status'] == 'valid'
    assert page.evaluate('__contractGetState().latinum') == before['money'] - 600
    assert page.evaluate('nativeNpcLives.market(__contractGetState(),47,0).credits') == before['bank'] + 600
    assert page.evaluate('nativeSaveStorage.read("normal").cargoPermits.documents[0].id') == document['id']
    assert 'Valid pass aboard' in bajor_row().inner_text()
    report['purchasedPass'] = {'reference': document['reference'], 'fee': 600, 'saved': True}

    # Documents are readable inside the same compact Cargo window at every viewport.
    page.locator('[data-cargo-documents]').click()
    assert 'Bajoran Trade Office' in page.locator('.encounter-cargo-documents').inner_text()
    assert 'Hull Sections' in page.locator('.encounter-cargo-documents').inner_text()
    report['viewports'] = []
    for width, height in [(1440, 1000), (1280, 720), (390, 844), (320, 568), (844, 390)]:
        page.set_viewport_size({'width': width, 'height': height})
        dimensions = page.evaluate(r"""()=>{
          const panel=document.querySelector('.encounter-panel'),body=panel.querySelector('.encounter-cargo-body'),bounds=panel.getBoundingClientRect();
          return {fits:bounds.left>=0&&bounds.top>=0&&bounds.right<=innerWidth&&bounds.bottom<=innerHeight,
            noHorizontalScroll:body.scrollWidth<=body.clientWidth+1,
            tabsFit:[...panel.querySelectorAll('.encounter-cargo-tabs button')].every(button=>{const box=button.getBoundingClientRect();return box.left>=bounds.left&&box.right<=bounds.right;})};
        }""")
        assert all(dimensions.values()), dimensions
        page.locator('.encounter-document-seal').scroll_into_view_if_needed()
        assert page.locator('.encounter-cargo-notice').is_visible()
        page.locator('.encounter-cargo-body').evaluate('(e)=>e.scrollTop=0')
        page.screenshot(path=str(OUT / f'documents-{width}x{height}.png'))
        report['viewports'].append([width, height])

    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.locator('[data-cargo-view="local"]').click()
    assert page.locator('.encounter-cargo-clearance[data-clearance="clear"]').count() > 0
    page.locator('[data-cargo-view="interstellar"]').click()
    page.locator('[data-cargo-load][data-cargo-system="47"]').click()
    job = page.evaluate('__contractGetState().localContracts[0]')
    assigned = page.evaluate('__contractGetState().cargoPermits.documents[0]')
    assert assigned['status'] == 'assigned' and assigned['usesRemaining'] == 0
    assert assigned['jobId'] == job['id'] and assigned['tons'] == job['tons']
    assert job['authorization']['permitId'] == document['id']
    assert not page.evaluate('__cargoBridge.interstellar(5,47,0,8,1)')['ok']
    assert page.evaluate('__contractGetState().localContracts.length') == 1
    # Permission for the accepted delivery remains valid after a political change.
    page.evaluate('()=>{const s=__contractGetState();s.localPrestige[47]=-100;s.planetGovts[47]=2;}')
    page.evaluate('nativePlanetEncounter.close(false)')
    attempt = page.evaluate('nativeNavigation.call("course",47)')
    assert attempt['ok'], attempt
    page.wait_for_function('()=>vexedWarp.phase==="report"||vexedWarp.phase==="error"', timeout=180000)
    assert page.evaluate('vexedWarp.phase') == 'report'
    page.locator('.warp-continue').click(timeout=60000)
    page.wait_for_function('()=>!vexedWarp.active||vexedWarp.phase==="error"', timeout=60000)
    assert page.evaluate('__contractGetState().system') == 47
    after_warp_money = page.evaluate('__contractGetState().latinum')
    page.reload()
    page.wait_for_function('()=>document.querySelector("#startup").hidden&&typeof resumeNativeGame==="function"', timeout=120000)
    page.evaluate('resumeNativeGame("normal")')
    page.wait_for_function('()=>document.body.classList.contains("playing")', timeout=120000)
    capture()
    assert page.evaluate('__contractGetState().latinum') == after_warp_money
    restored = page.evaluate('__contractGetState().cargoPermits.documents[0]')
    assert restored == assigned, (restored, assigned)
    assert page.evaluate('__contractGetState().localContracts[0]') == job
    page.evaluate('nativeCivilianTraffic.advance=()=>{};nativeSolEconomy.advance=()=>{};')
    page.wait_for_function('()=>nativeGameSounds.snapshot().decoded.includes("payment")', timeout=30000)
    visit(47, 0)
    before_payment = page.evaluate('__contractGetState().latinum')
    page.locator('[data-cargo-deliver]').click()
    assert page.evaluate('__contractGetState().latinum') == before_payment + job['pay']
    assert page.locator('.encounter-cargo-paid').is_visible()
    assert page.evaluate('nativeSaveStorage.read("normal").cargoPermits.documents[0].status') == 'completed'
    assert not page.evaluate('(id)=>__cargoBridge.deliver(id)', job['id'])['ok']
    page.locator('[data-cargo-documents]').click()
    assert 'Delivery completed' in page.locator('.encounter-cargo-documents').inner_text()
    page.screenshot(path=str(OUT / 'completed-document.png'))
    report.update(actualWarpAndReloadRetainPass=True, politicalChangePreservesAcceptedClearance=True, paidOnce=True)

    # Show neutral and allied versions of the same route, then load a sponsored relief job.
    page.evaluate(FIXTURE)
    page.evaluate('__contractGetState().localPrestige[47]=0')
    visit()
    assert 'Trade permit required' in bajor_row().inner_text()
    assert '200' in bajor_row().locator('.encounter-cargo-clearance').inner_text()
    page.locator('[data-cargo-permit][data-cargo-system="47"]').scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'neutral-permit-required.png'))
    page.evaluate('__contractGetState().localPrestige[47]=100')
    visit()
    assert 'Clearance granted' in bajor_row().inner_text()
    assert page.locator('[data-cargo-permit][data-cargo-system="47"]').count() == 0
    page.evaluate('()=>{const s=__contractGetState();s.localPrestige[47]=-50;const source=nativeNpcLives.market(s,1,5);source.stock.fill(0);source.stock[5]=800;}')
    visit()
    assert 'Employer provides relief pass' in bajor_row().inner_text()
    money = page.evaluate('__contractGetState().latinum')
    page.locator('[data-cargo-load][data-cargo-system="47"]').click()
    assert page.evaluate('__contractGetState().latinum') == money
    sponsored = page.evaluate('__contractGetState().cargoPermits.documents.at(-1)')
    assert sponsored['source'] == 'employer' and sponsored['fee'] == 0 and sponsored['status'] == 'assigned'
    page.locator('[data-cargo-documents]').click()
    assert 'Employer supplied' in page.locator('.encounter-cargo-documents').inner_text()
    page.screenshot(path=str(OUT / 'employer-relief-pass.png'))
    report.update(neutralControlledCargoRequiresPermit=True, alliesNeedNoPermit=True, employerReliefPass=True, errors=errors, failedResponses=failed)
    assert not errors and not failed, (errors, failed)
    (OUT / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2), flush=True)
    browser.close()
