"""Load real interstellar freight, warp, reload the save, and collect at Bajor."""
import ast
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/interstellar-contracts'
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('GAME_BASE_URL', 'http://127.0.0.1:7790').rstrip('/')
source = ast.parse((ROOT / 'tests/browser-planet-cargo.py').read_text(encoding='utf-8'))
SETUP = next(ast.literal_eval(node.value) for node in source.body if isinstance(node, ast.Assign)
             and any(isinstance(target, ast.Name) and target.id == 'SETUP' for target in node.targets))
SETUP = SETUP.replace('const state=nativeNpcDev.getState();', 'const state=__contractGetState();')
SETUP = SETUP.replace('window.__cargoVisit=(system,port)=>{', 'window.__cargoVisit=(system,port)=>{const state=__contractGetState();')
CAPTURE = r"""()=>{
  const open=nativeSystemHub.open,encounter=nativePlanetEncounter.open;
  nativeSystemHub.open=(options,tab)=>{window.__cargoHub=options;return open(options,tab);};
  nativePlanetEncounter.open=options=>{window.__cargoBridge=options;return encounter(options);};
  window.__contractGetState=()=>__cargoHub.getState();
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

    def capture_bridge():
        page.evaluate(CAPTURE)
        page.locator('#tradeBtn').click()
        page.wait_for_function('()=>!!window.__cargoHub')
        page.evaluate('nativeSystemHub.close(false)')

    capture_bridge()
    page.evaluate(SETUP)
    page.evaluate('()=>{__contractGetState().localPrestige=Object.fromEntries(VexedMirrorWorld.systems.map(system=>[system.id,100]));}')
    page.evaluate(r"""()=>{
      const state=__contractGetState(),m=nativeNpcLives.market(state,47,0);
      m.stock.fill(0);m.reserved.fill(0);m.incoming.fill(0);m.target.fill(300);m.credits=1000000;m.fundsReserved=0;
      const ship=nativeShipDefinitions.forEntity(state);state.hull=ship.hull;state.shields=ship.shields;state.antimatter=100000;
      nativeShipSystems.invalidate(state);
    }""")

    def open_interstellar():
        page.locator('#planet-encounter [data-view-tab="cargo"]').click()
        assert page.locator('[data-cargo-view="local"]').get_attribute('aria-pressed') == 'true'
        page.locator('[data-cargo-view="interstellar"]').click()
        assert page.locator('[data-view-tab="cargo"]').get_attribute('aria-pressed') == 'true'

    def visit(system, port):
        page.evaluate('([system,port])=>__cargoVisit(system,port)', [system, port])
        open_interstellar()

    visit(1, 5)
    assert page.locator('.encounter-page-nav [data-view-tab]').all_text_contents() == ['Planet', 'Cargo', 'Shop', 'Trade']
    assert page.locator('.encounter-cargo-tabs [data-cargo-view]').all_text_contents() == ['Local', 'Interstellar']
    assert 'Interstellar Contracts' in page.locator('.encounter-cargo-heading').inner_text()
    assert 'Common ore: Trellium' in page.locator('.encounter-interstellar-origin').inner_text()
    routes = page.locator('.encounter-cargo-offer').count()
    assert routes > 20, routes
    page.wait_for_function('()=>[...document.querySelectorAll(".encounter-cargo-route img,.encounter-cargo-payment img")].every(img=>img.complete&&img.naturalWidth>0)', timeout=120000)
    assert 'Bajor' in page.locator('[data-cargo-system="47"]').locator('xpath=../..').inner_text()
    pricing = page.evaluate(r"""()=>{
      const state=__contractGetState();
      const rows=[...document.querySelectorAll('.encounter-cargo-offer')];
      const displayed=rows.every(row=>{
        const button=row.querySelector('[data-cargo-load]'),distance=row.querySelector('[data-cargo-distance]');
        const quote=nativeNpcLives.playerFreightQuote(state,{fromSystem:state.system,fromPort:state.localBody,
          toSystem:Number(button.dataset.cargoSystem),toPort:Number(button.dataset.cargoLoad),good:Number(button.dataset.cargoGood)});
        return Number(distance?.dataset.cargoDistance)===quote.distance&&
          Number(row.querySelector('.encounter-cargo-terms .encounter-cargo-payment').textContent.replaceAll(',',''))===quote.rate&&
          Number(row.querySelector('.encounter-cargo-row-footer .encounter-cargo-payment').textContent.replaceAll(',',''))===Number(button.dataset.cargoMaxTons)*quote.rate;
      });
      const equalCargo=nativePlayerContracts.destinations(state).filter(port=>!nativeSystemCatalog.sameSystem(1,port.system))
        .map(port=>({planet:port.name,...nativeNpcLives.playerFreightQuote(state,{fromSystem:1,fromPort:5,toSystem:port.system,toPort:port.port,good:8})}))
        .filter(quote=>quote.ok).sort((a,b)=>a.distance-b.distance);
      return {displayed,near:equalCargo[0],middle:equalCargo[Math.floor(equalCargo.length/2)],far:equalCargo.at(-1)};
    }""")
    assert pricing['displayed']
    assert pricing['near']['rate'] < pricing['middle']['rate'] < pricing['far']['rate'], pricing
    report['distancePricing'] = {key: {field: value[field] for field in ['planet','distance','rate']} for key, value in pricing.items() if key != 'displayed'}
    report['routesFromMars'] = routes
    report['viewports'] = []
    for width, height in [(1440, 1000), (1280, 720), (390, 844), (320, 568), (844, 390)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.locator('[data-view-tab="shop"]').click()
        shop = page.locator('.encounter-panel').bounding_box()
        open_interstellar()
        panel = page.locator('.encounter-panel').bounding_box()
        assert abs(shop['width']-panel['width']) < 1 and abs(shop['height']-panel['height']) < 1, (shop, panel)
        metrics = page.evaluate(r"""()=>{
          const panel=document.querySelector('.encounter-panel'),body=panel.querySelector('.encounter-cargo-body');
          const bounds=panel.getBoundingClientRect();
          return {scrolls:body.scrollHeight>body.clientHeight,horizontalOverflow:body.scrollWidth>body.clientWidth,
            allTabsFit:[...panel.querySelectorAll('[data-view-tab]')].every(e=>{const b=e.getBoundingClientRect();return b.left>=bounds.left&&b.right<=bounds.right-37;})};
        }""")
        assert metrics['scrolls'] and not metrics['horizontalOverflow'] and metrics['allTabsFit'], metrics
        page.locator('[data-cargo-load]').last.scroll_into_view_if_needed()
        assert page.locator('.encounter-cargo-notice').is_visible()
        page.locator('.encounter-cargo-body').evaluate('(e)=>e.scrollTop=0')
        page.screenshot(path=str(OUT / f'interstellar-{width}x{height}.png'))
        report['viewports'].append([width, height])

    page.set_viewport_size({'width': 1440, 'height': 1000})
    button = page.locator('[data-cargo-load][data-cargo-system="47"]')
    maximum = int(button.get_attribute('data-cargo-max-tons'))
    money = page.evaluate('__contractGetState().latinum')
    button.press('Enter')
    job = page.evaluate('__contractGetState().localContracts.find(job=>job.kind==="interstellar")')
    assert job['pricingVersion'] == 2 and job['pay'] == job['tons'] * job['rate'] and job['distance'] > 0
    assert job['tons'] == maximum and job['toSystem'] == 47 and job['to'] == 0, job
    assert page.evaluate('__contractGetState().latinum') == money
    assert page.locator('.encounter-cargo-job [data-cargo-planet-icon]').get_attribute('src').endswith('bajora.webp')
    assert page.locator('[data-cargo-deliver]').count() == 0
    assert page.evaluate('nativeSaveStorage.read("normal").localContracts.some(job=>job.kind==="interstellar")')

    # A local shipment uses the same manifest and the same two available slots.
    page.locator('[data-cargo-view="local"]').click()
    page.locator('[data-cargo-load="3"]').click()
    assert page.evaluate('__contractGetState().localContracts.length') == 2
    page.locator('[data-cargo-view="interstellar"]').click()
    assert page.locator('[data-cargo-load]:not(:disabled)').count() == 0
    page.evaluate('nativePlanetEncounter.close(false)')
    page.locator('#inventoryBtn').click()
    page.locator('[data-right-page="deliveries"]').click()
    assert 'Bajor' in page.locator('.inventory-deliveries-page').inner_text()
    assert 'Bajoran system' in page.locator('.inventory-deliveries-page').inner_text()
    page.screenshot(path=str(OUT / 'manifest.png'))
    page.evaluate('nativeShipInventory.close()')

    # Use the actual warp planner, arrival handoff and durable save, not a system reassignment.
    attempt = page.evaluate('nativeNavigation.call("course",47)')
    assert attempt['ok'], attempt
    page.wait_for_function('()=>vexedWarp.phase==="report"||vexedWarp.phase==="error"', timeout=180000)
    assert page.evaluate('vexedWarp.phase') == 'report', page.evaluate('vexedWarp.snapshot()')
    page.locator('.warp-continue').click(timeout=60000)
    page.wait_for_function('()=>!vexedWarp.active||vexedWarp.phase==="error"', timeout=60000)
    assert page.evaluate('__contractGetState().system') == 47
    assert page.evaluate('(id)=>__contractGetState().localContracts.some(job=>job.id===id)', job['id'])
    report['actualWarpRetainedCargo'] = True

    # Reload through the ordinary normal-game save path before collecting.
    page.reload()
    page.wait_for_function('()=>document.querySelector("#startup").hidden&&typeof resumeNativeGame==="function"', timeout=120000)
    page.evaluate('resumeNativeGame("normal")')
    page.wait_for_function('()=>document.body.classList.contains("playing")', timeout=120000)
    capture_bridge()
    assert page.evaluate('__contractGetState().system') == 47
    page.wait_for_function('()=>nativeGameSounds.snapshot().decoded.includes("payment")', timeout=30000)
    restored = page.evaluate('(id)=>__contractGetState().localContracts.find(job=>job.id===id)', job['id'])
    assert restored == job, (restored, job)
    page.evaluate(SETUP.replace('state.localContracts=[];', '').replace('state.solFreightHold={};', ''))
    # SETUP resets the fixture port; move locally after confirming the actual saved destination.
    visit(47, 0)
    assert 'Bajor' in page.locator('.encounter-interstellar-origin').inner_text()
    assert page.locator('[data-cargo-deliver]').count() == 1
    before_money = page.evaluate('__contractGetState().latinum')
    before_sound = page.evaluate('nativeGameSounds.snapshot().played.payment||0')
    page.locator('[data-cargo-deliver]').click()
    assert page.evaluate('__contractGetState().latinum') == before_money + job['pay']
    assert page.locator('.encounter-cargo-paid').is_visible()
    page.wait_for_function('()=>document.querySelector(".encounter-paid-latinum")?.naturalWidth>0')
    page.wait_for_function('(amount)=>document.querySelector("[data-payment-amount]")?.textContent==="+"+amount.toLocaleString()', arg=job['pay'])
    assert page.evaluate('nativeGameSounds.snapshot().played.payment||0') == before_sound + 1
    page.screenshot(path=str(OUT / 'bajor-paid.png'))
    again = page.evaluate('(id)=>__cargoBridge.deliver(id)', job['id'])
    assert not again['ok']
    assert page.evaluate('__contractGetState().latinum') == before_money + job['pay']
    saved = page.evaluate('nativeSaveStorage.read("normal").localContracts')
    assert len(saved) == 1 and saved[0].get('kind') != 'interstellar'
    report.update(savedReloadRetainedCargo=True, delivery={'planet': 'Bajor', 'tons': job['tons'], 'payment': job['pay'], 'paidOnce': True}, errors=errors, failedResponses=failed)
    assert not errors and not failed, (errors, failed)
    (OUT / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2), flush=True)
    browser.close()
