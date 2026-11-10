"""Verify diverse Dev relationships, real permit offers and one-time save migration."""
import ast
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/dev-diplomacy'
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('GAME_BASE_URL', 'http://127.0.0.1:7790').rstrip('/')

def literal(file, name):
    tree = ast.parse((ROOT / 'tests' / file).read_text(encoding='utf-8'))
    return next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == name for target in node.targets))

SETUP = literal('browser-planet-cargo.py', 'SETUP').replace('state.devMode=false;', 'state.devMode=true;')
CAPTURE = literal('browser-interstellar-contracts.py', 'CAPTURE')
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
    report['freshRelationships'] = page.evaluate(r"""()=>{
      const state=nativeNpcDev.getState(),counts={},examples={};
      if(state.devDiplomacyVersion!==1)throw Error('Missing Dev diplomacy version');
      for(const system of VexedMirrorWorld.systems){const standing=nativeFactionStanding.relationship(state,system.id).status;counts[standing]=(counts[standing]||0)+1;}
      for(const id of [1,2,4,8,14,20,31,47,55]){
        const chart=nativeNavigation.call('state',id).selected,standing=nativeFactionStanding.relationship(state,id);
        if(chart.standing!==standing.status)throw Error('Chart and faction relationship disagree');
        examples[id]={name:chart.name,standing:standing.status,prestige:standing.prestige};
      }
      return {counts,examples};
    }""")
    counts = report['freshRelationships']['counts']
    assert counts['Allied'] >= 10 and counts['Neutral'] >= 10 and counts['Hostile'] >= 10, counts
    page.evaluate(CAPTURE)
    page.locator('#tradeBtn').click()
    page.wait_for_function('()=>!!window.__cargoHub')
    page.evaluate('nativeSystemHub.close(false)')
    page.evaluate(SETUP)
    # Seed stock only; keep the real fresh-Dev diplomatic relationships.
    page.evaluate(r"""()=>{
      const state=nativeNpcDev.getState(),source=nativeNpcLives.market(state,1,5);
      source.stock.fill(0);source.stock[8]=800;source.reserved.fill(0);
      for(const system of [4,20,47]){const m=nativeNpcLives.market(state,system,0);m.stock.fill(0);m.incoming.fill(0);m.reserved.fill(0);m.target.fill(300);m.credits=1000000;m.fundsReserved=0;}
      __cargoVisit(1,5);
    }""")
    page.locator('[data-view-tab="cargo"]').click()
    page.locator('[data-cargo-view="interstellar"]').click()

    def row(system):
        return page.locator(f'[data-cargo-system="{system}"]').locator('xpath=../..')

    assert 'Clearance granted' in row(4).inner_text()
    assert 'Trade permit required' in row(47).inner_text()
    assert 'Trade-passage pass required' in row(20).inner_text()
    assert '200' in row(47).locator('.encounter-cargo-clearance').inner_text()
    assert '600' in row(20).locator('.encounter-cargo-clearance').inner_text()
    report['realPermitRulesVisible'] = True
    row(47).scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'neutral-bajor.png'))
    row(20).scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'hostile-klingon.png'))
    page.set_viewport_size({'width': 320, 'height': 568})
    row(20).scroll_into_view_if_needed()
    assert page.locator('.encounter-cargo-body').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    page.screenshot(path=str(OUT / 'hostile-mobile.png'))
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.locator('[data-cargo-permit][data-cargo-system="20"]').click()
    page.locator('[data-cargo-load][data-cargo-system="20"]').click()
    held = page.evaluate('()=>({jobs:__contractGetState().localContracts,documents:__contractGetState().cargoPermits})')
    assert len(held['jobs']) == 1 and held['documents']['documents'][0]['status'] == 'assigned'
    page.evaluate('nativePlanetEncounter.close(false)')
    page.evaluate(r"""()=>{
      const legacy=JSON.parse(JSON.stringify(__contractGetState()));
      delete legacy.devDiplomacyVersion;legacy.devNeighborhoodVersion=1;
      legacy.localPrestige=Object.fromEntries(VexedMirrorWorld.systems.map(system=>[system.id,100]));
      Object.assign(legacy.localPrestige,{55:-75,4:125,2:0,8:100,7:37,47:44});legacy.planetGovts[31]=16;
      const saved=nativeSaveStorage.write(legacy);if(!saved.ok)throw Error('Legacy Dev fixture did not save');
      resumeNativeGame('dev');
    }""")
    page.wait_for_function('()=>nativeNpcDev.getState()?.devDiplomacyVersion===1', timeout=120000)
    migrated = page.evaluate('()=>{const s=nativeNpcDev.getState();return {version:s.devDiplomacyVersion,klingon:s.localPrestige[20],customTrey:s.localPrestige[7],customBajor:s.localPrestige[47],ownedRomulus:s.planetGovts[31],jobs:s.localContracts,documents:s.cargoPermits,savedVersion:nativeSaveStorage.read("dev").devDiplomacyVersion};}')
    assert migrated['version'] == migrated['savedVersion'] == 1
    assert migrated['klingon'] == -60 and migrated['customTrey'] == 37 and migrated['customBajor'] == 44 and migrated['ownedRomulus'] == 16, migrated
    assert migrated['jobs'] == held['jobs'] and migrated['documents'] == held['documents']
    report['legacyDevMigration'] = {'savedOnce': True, 'standingChangesPreserved': True, 'ownershipPreserved': True, 'cargoAndPassesPreserved': True}

    page.evaluate('()=>{const state=nativeNpcDev.getState();state.localPrestige[20]=35;state.localPrestige[47]=-7;state.planetGovts[31]=12;}')
    page.evaluate('()=>{const saved=nativeSaveStorage.write(nativeNpcDev.getState());if(!saved.ok)throw Error("Changed Dev standing did not save");}')
    page.evaluate('resumeNativeGame("dev")')
    page.wait_for_function('()=>!!nativeNpcDev.getState()', timeout=120000)
    assert page.evaluate('(()=>{const s=nativeNpcDev.getState();return s.localPrestige[20]===35&&s.localPrestige[47]===-7&&s.planetGovts[31]===12;})()')
    report['continuePreservesLaterChanges'] = True

    page.evaluate(r"""()=>{
      const normal=JSON.parse(JSON.stringify(nativeNpcDev.getState()));normal.devMode=false;
      delete normal.devDiplomacyVersion;delete normal.devNeighborhoodVersion;
      normal.localPrestige[20]=17;normal.localPrestige[47]=-22;normal.deuranium=0;
      const saved=nativeSaveStorage.write(normal);if(!saved.ok)throw Error('Normal fixture did not save');
      resumeNativeGame('normal');
    }""")
    page.wait_for_function('()=>document.body.classList.contains("playing")&&!nativeNpcDev.getState()', timeout=120000)
    assert page.evaluate('(()=>{const s=__contractGetState();return !s.devMode&&s.devDiplomacyVersion===undefined&&s.localPrestige[20]===17&&s.localPrestige[47]===-22;})()')
    report.update(normalGameUnchanged=True, errors=errors, failedResponses=failed)
    assert not errors and not failed, (errors, failed)
    (OUT / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2), flush=True)
    browser.close()
