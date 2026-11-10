"""Exercise the planet Cargo controls against the actual game transaction handlers."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/planet-cargo'
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('GAME_BASE_URL', 'http://127.0.0.1:7790').rstrip('/')
errors, failed, report = [], [], {}

AUDIO_PROBE = r"""(()=>{
  window.__cargoAudioSources=[];window.__cargoAudioProbes=[];
  const createSource=AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource=function(...args){
    const source=createSource.apply(this,args),start=source.start.bind(source),context=this;
    source.start=(at,offset,duration)=>{
      const record={at,duration,endedAt:null};__cargoAudioSources.push(record);
      source.addEventListener('ended',()=>record.endedAt=context.currentTime,{once:true});
      return start(at,offset,duration);
    };return source;
  };
  const createCompressor=AudioContext.prototype.createDynamicsCompressor;
  AudioContext.prototype.createDynamicsCompressor=function(...args){
    const compressor=createCompressor.apply(this,args),connect=compressor.connect.bind(compressor),context=this;
    compressor.connect=(target,...rest)=>{
      if(target!==context.destination)return connect(target,...rest);
      const analyser=context.createAnalyser();analyser.fftSize=1024;
      __cargoAudioProbes.push({analyser,peak:0});connect(analyser);return analyser.connect(target);
    };return compressor;
  };
  setInterval(()=>{for(const probe of __cargoAudioProbes){
    const values=new Float32Array(1024);probe.analyser.getFloatTimeDomainData(values);
    for(const value of values)probe.peak=Math.max(probe.peak,Math.abs(value));
  }},8);
})();"""

SETUP = r"""()=>{
  const state=nativeNpcDev.getState();
  nativeCivilianTraffic.advance=()=>{};nativeSolEconomy.advance=()=>{};
  state.devMode=false;state.shipType=60;state.latinum=1000000;
  state.system=1;state.localBody=5;state.localBodySystem=1;state.localSystemVersion=2;
  state.localContracts=[];state.solFreightHold={};state.minerals={};
  state.deuranium=0;state.antimatter=0;state.dilithium=0;state.food=0;
  state.localCruise=null;state.arrivalApproach=null;state.landed=false;
  delete state.shipEquipment;delete state.weaponLoadout;state.weapons=[1];state.weaponInventory=[];
  nativeShipEquipment.ensure(state);nativeShipMotion.stop(state);
  for(const port of nativeSolEconomy.ports){
    const market=nativeNpcLives.market(state,1,port);
    market.stock.fill(port===5?800:0);market.reserved.fill(0);market.incoming.fill(0);
    market.credits=1000000;market.fundsReserved=0;
  }
  nativeShipSystems.invalidate(state);
  window.__cargoVisit=(system,port)=>{
    nativePlanetEncounter.close(false);state.system=system;state.localBodySystem=system;
    state.localSystemVersion=2;state.localBody=port;state.localCruise=null;state.arrivalApproach=null;
    nativeShipMotion.stop(state);nativeSystemCatalog.initialize(state);nativeShipSystems.invalidate(state);
    __cargoHub.openEncounter();
  };
  window.__cargoState=state;
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(channel=os.environ.get('BROWSER_CHANNEL', 'msedge'), headless=True,
                                ignore_default_args=['--hide-scrollbars'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.add_init_script(AUDIO_PROBE)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('response', lambda r: failed.append(r.url) if r.status >= 400 else None)
    page.goto(BASE + '/html-games/broken-mirror-port/index.html')
    page.wait_for_function('()=>typeof startNativeDevGame==="function"&&document.querySelector("#startup").hidden', timeout=120000)
    page.evaluate('startNativeDevGame()')
    page.wait_for_function('()=>!!nativeNpcDev.getState()', timeout=120000)
    page.evaluate(r"""()=>{
      const open=nativeSystemHub.open,encounter=nativePlanetEncounter.open;
      nativeSystemHub.open=(options,tab)=>{window.__cargoHub=options;return open(options,tab);};
      nativePlanetEncounter.open=options=>{window.__cargoBridge=options;return encounter(options);};
    }""")
    page.locator('#tradeBtn').click()
    page.wait_for_function('()=>!!window.__cargoHub')
    page.evaluate('nativeSystemHub.close(false)')
    page.evaluate(SETUP)
    page.wait_for_function('()=>nativeGameSounds.snapshot().decoded.includes("payment")', timeout=30000)

    def visit(system, port):
        page.evaluate('([system,port])=>__cargoVisit(system,port)', [system, port])
        page.locator('#planet-encounter [data-view-tab="cargo"]').click()

    visit(1, 5)
    assert 'Mars' in page.locator('.encounter-cargo-heading').inner_text()
    expected_routes = page.evaluate('nativeSolEconomy.snapshot(__cargoState,5).lanes.length')
    assert expected_routes >= 5
    assert page.locator('.encounter-cargo-offer').count() == expected_routes
    assert page.locator('.encounter-cargo-controls').locator('[data-cargo-page], [data-cargo-tons], input[type=range]').count() == 0
    page.wait_for_function("""()=>[...document.querySelectorAll('.encounter-cargo-route img')].every(e=>e.complete&&e.naturalWidth>0)""")
    report['allRoutesAndActualIcons'] = expected_routes

    def geometry():
        return page.evaluate(r"""()=>{
          const panel=document.querySelector('.encounter-panel'),body=document.querySelector('.encounter-cargo-body');
          const controls=document.querySelector('.encounter-cargo-controls'),notice=document.querySelector('.encounter-cargo-notice');
          const bounds=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
          return {panel:bounds(panel),body:bounds(body),notice:bounds(notice),
            bodyHeight:body.clientHeight,bodyWidth:body.clientWidth,scrollHeight:body.scrollHeight,scrollWidth:body.scrollWidth,
            controlsWidth:controls.clientWidth,controlsScroll:controls.scrollWidth,
            controlsHeight:controls.clientHeight,controlsScrollHeight:controls.scrollHeight,
            scrollbar:getComputedStyle(body).overflowY,scrollbarWidth:body.offsetWidth-body.clientWidth,
            worldVisible:getComputedStyle(panel.querySelector('.encounter-world')).display!=='none'};
        }""")

    def check_sizes(suffix):
        results = []
        for width, height in [(1440, 1000), (1280, 720), (390, 844), (320, 568), (844, 390)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.locator('#planet-encounter [data-view-tab="shop"]').click()
            shop = page.locator('.encounter-panel').bounding_box()
            page.locator('#planet-encounter [data-view-tab="cargo"]').click()
            cargo = geometry()
            box = cargo['panel']
            assert abs(shop['width'] - box['width']) < 1 and abs(shop['height'] - box['height']) < 1, (shop, cargo)
            assert box['x'] >= 0 and box['y'] >= 0 and box['right'] <= width + 1 and box['bottom'] <= height + 1, box
            assert cargo['bodyHeight'] >= 60 and cargo['scrollWidth'] <= cargo['bodyWidth'] + 1, cargo
            assert cargo['controlsScroll'] <= cargo['controlsWidth'] + 1, cargo
            assert cargo['controlsScrollHeight'] <= cargo['controlsHeight'] + 1, cargo
            assert cargo['worldVisible'] and cargo['scrollbar'] == 'scroll', cargo
            assert cargo['scrollbarWidth'] >= 6, cargo
            assert cargo['notice']['bottom'] <= box['bottom'], cargo
            last = page.locator('[data-cargo-load]').last
            last.scroll_into_view_if_needed()
            last_box = last.bounding_box()
            assert last_box['y'] >= cargo['body']['y'] - 1 and last_box['y'] + last_box['height'] <= cargo['body']['bottom'] + 1, (last_box, cargo)
            assert page.locator('.encounter-page-nav').is_visible()
            assert page.locator('.encounter-cargo-notice').is_visible()
            page.locator('.encounter-cargo-body').evaluate('(e)=>e.scrollTop=0')
            page.wait_for_function("""()=>[...document.querySelectorAll('.encounter-cargo-route img')].every(e=>e.complete&&e.naturalWidth>0)""")
            page.screenshot(path=str(OUT / f'compact-{suffix}-{width}x{height}.png'))
            results.append({'viewport': [width, height], 'shopSize': [shop['width'], shop['height']], **cargo})
        page.set_viewport_size({'width': 1440, 'height': 1000})
        return results

    report['emptyHoldLayouts'] = check_sizes('available')
    assert geometry()['scrollHeight'] > geometry()['bodyHeight']
    button = page.locator('[data-cargo-load="3"]')
    assert int(button.get_attribute('data-cargo-max-tons')) > 7 and not button.is_disabled()
    money_before = page.evaluate('__cargoState.latinum')
    source_before = page.evaluate('nativeNpcLives.market(__cargoState,1,5).stock[8]')
    page.evaluate(r"""()=>{
      const s=__cargoState,capacity=nativeShipDefinitions.forEntity(s).cargo;
      s.solFreightHold[0]=(s.solFreightHold[0]||0)+Math.max(0,capacity-nativeShipEquipment.cargoUsed(s)-7);
    }""")
    button.press('Enter')
    first = page.evaluate('__cargoState.localContracts[0]')
    assert first['to'] == 3 and first['tons'] == 7, first
    assert page.evaluate('nativeNpcLives.market(__cargoState,1,5).stock[8]') == source_before - 7
    assert page.evaluate('__cargoState.latinum') == money_before
    assert page.locator('.encounter-cargo-summary').is_visible()
    assert page.locator('.encounter-cargo-job').count() == 1
    assert 'Hull Sections' in page.locator('.encounter-cargo-job').inner_text()
    assert page.evaluate('document.activeElement.classList.contains("encounter-cargo-notice")')
    report['haulMaxUsesCurrentFreeHold'] = {'tons': first['tons'], 'chargedUpfront': False}

    page.evaluate("""()=>{
      __cargoState.solFreightHold[0]=0;
      nativeNpcLives.market(__cargoState,1,5).stock[8]=2;
    }""")
    visit(1, 5)
    moon_button = page.locator('[data-cargo-load="4"]')
    assert int(moon_button.get_attribute('data-cargo-max-tons')) == 2
    moon_button.click()
    second = page.evaluate('__cargoState.localContracts[1]')
    assert second['to'] == 4 and second['tons'] == 2, second
    assert page.evaluate('nativeNpcLives.market(__cargoState,1,5).stock[8]') == 0
    assert page.locator('.encounter-cargo-summary').is_visible()
    assert 'Two shipments' in page.locator('.encounter-cargo-restriction').inner_text()
    assert page.locator('[data-cargo-load]:not(:disabled)').count() == 0
    report['haulMaxCapsAtSourceStockAndTwoShipments'] = True
    report['loadedLayouts'] = check_sizes('aboard')

    visit(1, 3)
    assert page.locator('[data-cargo-deliver]').count() == 1
    # A stale/invalid shipment must not celebrate or play a payment cue.
    page.evaluate('nativeGameSounds.stop()')
    paid_before = page.evaluate('nativeGameSounds.snapshot().played.payment||0')
    page.locator('[data-cargo-deliver]').evaluate('(e)=>e.dataset.cargoDeliver="-1"')
    page.locator('[data-cargo-deliver]').click()
    assert page.locator('.encounter-cargo-paid').count() == 0
    assert page.evaluate('nativeGameSounds.snapshot().played.payment||0') == paid_before
    assert page.evaluate('__cargoState.localContracts.length') == 2
    page.evaluate('nativeGameSounds.stop();__cargoAudioProbes.forEach(p=>p.peak=0);__cargoAudioSources.length=0')
    panel_before = page.locator('.encounter-panel').bounding_box()
    page.locator('[data-cargo-deliver]').click()
    assert page.evaluate('__cargoState.localContracts.length') == 1
    assert page.evaluate('__cargoState.latinum') == money_before + first['pay']
    assert page.locator('.encounter-cargo-paid').is_visible()
    page.wait_for_function('(amount)=>document.querySelector("[data-payment-amount]")?.textContent==="+"+amount.toLocaleString()', arg=first['pay'])
    assert page.locator('.encounter-panel').bounding_box() == panel_before
    assert page.evaluate('nativeGameSounds.snapshot().played.payment||0') == paid_before + 1
    assert page.locator('.encounter-cargo-paid').evaluate('(e)=>getComputedStyle(e).pointerEvents') == 'none'
    page.screenshot(path=str(OUT / 'paid-desktop.png'))
    page.wait_for_function('()=>__cargoAudioSources.some(s=>s.duration>1&&s.duration<1.2&&s.endedAt!==null)')
    payment_audio = page.evaluate('()=>({source:__cargoAudioSources.find(s=>s.duration>1&&s.duration<1.2),peak:Math.max(...__cargoAudioProbes.map(p=>p.peak)),recent:nativeGameSounds.snapshot().recent.at(-1)})')
    assert payment_audio['peak'] > .005, payment_audio
    assert payment_audio['source']['endedAt'] - payment_audio['source']['at'] >= payment_audio['source']['duration'] - .03, payment_audio
    assert payment_audio['recent']['kind'] == 'payment'
    page.wait_for_function('()=>!document.querySelector(".encounter-cargo-paid")')
    second_payment = page.evaluate('(id)=>__cargoBridge.deliver(id)', first['id'])
    assert not second_payment['ok']
    assert page.evaluate('__cargoState.latinum') == money_before + first['pay']
    report['delivery'] = {'tons': first['tons'], 'payment': first['pay'], 'paidOnce': True}
    report['paidEffect'] = {'countedAmount': first['pay'], 'failureDoesNotCelebrate': True, 'audio': payment_audio}

    visit(47, 0)
    assert 'Bajor' in page.locator('.encounter-cargo-heading').inner_text()
    assert page.locator('.encounter-cargo-empty').is_visible()
    assert page.locator('.encounter-cargo-job').count() == 1
    moon_icon = page.locator('.encounter-cargo-job [data-cargo-planet-icon]')
    assert 'Moon' in moon_icon.get_attribute('src')
    page.wait_for_function("""()=>[...document.querySelectorAll('.encounter-cargo-route img')].every(e=>e.complete&&e.naturalWidth>0)""")
    page.screenshot(path=str(OUT / 'compact-bajor-empty.png'))
    report['emptyPortKeepsCargoAboardVisible'] = True

    # Repeat actual loading and settlement at small viewports, keeping the Moon shipment aboard.
    report['paidEffect']['viewports'] = []
    for width, height in [(390, 844), (320, 568), (844, 390)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate('()=>{nativeNpcLives.market(__cargoState,1,5).stock[8]=800;nativeNpcLives.market(__cargoState,1,3).stock[8]=0;}')
        visit(1, 5)
        page.locator('[data-cargo-load="3"]').click()
        visit(1, 3)
        page.locator('[data-cargo-deliver]').click()
        page.wait_for_timeout(750)
        receipt = page.locator('.encounter-cargo-paid').bounding_box()
        panel = page.locator('.encounter-panel').bounding_box()
        assert receipt['x'] >= panel['x'] and receipt['y'] >= panel['y'], (receipt, panel)
        assert receipt['x'] + receipt['width'] <= panel['x'] + panel['width'], (receipt, panel)
        assert receipt['y'] + receipt['height'] <= panel['y'] + panel['height'], (receipt, panel)
        page.screenshot(path=str(OUT / f'paid-{width}x{height}.png'))
        assert page.locator('.encounter-cargo-paid').evaluate('''(e)=>{
          const outer=e.getBoundingClientRect();
          return [...e.querySelectorAll('.encounter-paid-top,.encounter-paid-credit,strong,small')].every(child=>{
            const box=child.getBoundingClientRect();return box.left>=outer.left&&box.right<=outer.right;
          });
        }''')
        report['paidEffect']['viewports'].append([width, height])

    # Muting removes audio but preserves the confirmation, including reduced-motion mode.
    page.emulate_media(reduced_motion='reduce')
    page.evaluate('nativeMenuSounds.setEnabled(false)')
    paid_before = page.evaluate('nativeGameSounds.snapshot().played.payment||0')
    visit(1, 4)
    page.locator('[data-cargo-deliver]').click()
    assert page.locator('[data-payment-amount]').inner_text() == '+' + f'{second["pay"]:,}'
    assert page.locator('.encounter-cargo-paid').evaluate('(e)=>getComputedStyle(e).animationName') == 'none'
    assert page.evaluate('nativeGameSounds.snapshot().played.payment||0') == paid_before
    page.locator('#planet-encounter [data-view-tab="shop"]').click()
    assert page.locator('.encounter-cargo-paid').count() == 0
    page.emulate_media(reduced_motion='no-preference')
    page.evaluate('nativeMenuSounds.setEnabled(true)')
    report['paidEffect'].update(muteRespected=True, reducedMotionRespected=True, tabSwitchClearsEffect=True)

    page.set_viewport_size({'width': 1280, 'height': 850})
    page.evaluate(r"""()=>{
      const s=__cargoState,capacity=nativeShipDefinitions.forEntity(s).cargo;
      s.solFreightHold[0]=(s.solFreightHold[0]||0)+Math.max(0,capacity-nativeShipEquipment.cargoUsed(s));
    }""")
    visit(1, 5)
    assert 'hold is full' in page.locator('.encounter-cargo-restriction').inner_text()
    assert page.locator('[data-cargo-load]:not(:disabled)').count() == 0
    page.screenshot(path=str(OUT / 'compact-full-hold.png'))
    page.keyboard.press('Escape')
    assert page.locator('#planet-encounter').is_hidden()
    report.update(fullHoldExplained=True, escapeCloses=True, errors=errors, failedResponses=failed)
    assert not errors and not failed, (errors, failed)
    (OUT / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if not k.endswith('Layouts')}, indent=2))
    print('Shop/Cargo dimensions match at all five viewports, with empty and occupied holds.')
    browser.close()
