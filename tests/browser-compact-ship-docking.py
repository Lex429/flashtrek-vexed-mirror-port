"""Exercise normal upgrade-dock approaches with the compact fleet."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/compact-ship-docking';OUT.mkdir(parents=True,exist_ok=True)
errors=[];rows=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='msedge')
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://127.0.0.1:7790/html-games/broken-mirror-port/index.html',wait_until='domcontentloaded')
    page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=90000)
    page.evaluate('()=>startNativeDevGame()')
    page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
    page.evaluate('''()=>{
      window.__compactBase=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
      const ensure=nativeShipEquipment.ensure;
      window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__compactState=s;return ensure(s,h,d);}};
    }''')
    page.evaluate('()=>nativeShipyardServices.ready')
    for ship_type in [7,35,38,440]:
        setup=page.evaluate('''type=>{
          const s=JSON.parse(JSON.stringify(__compactBase));
          Object.assign(s,{devMode:false,captain:'Compact Dock Test',shipName:'Dock fit check',shipType:type,
            system:1,localBody:5,speed:0,vx:0,vy:0,latinum:200000,dilithium:250,phase:'flight',landed:false,
            vitalsVersion:2,weapons:[1],weaponInventory:[],solFreightHold:{},localContracts:[],
            minerals:{trellium:100,tritanium:100,gallicite:60,benamite:20,deuranium:40}});
          for(const key of ['shipEquipment','weaponLoadout','repairBay','inventoryLayout','shipRefit','shipThrusters',
            'shieldResponse','shipyardDock','arrivalApproach','localCruise','pendingTransit'])delete s[key];
          nativeShipEquipment.ensure(s);const d=nativeShipDefinitions.forEntity(s);s.hull=d.hull;s.shields=d.shields;
          const plan=nativeShipyardServices.plan(s);
          const origin=vexedSolFlight.bodies.find(body=>body.id===s.localBody);
          Object.assign(s,{x:plan.entry.x-origin.x,y:plan.entry.y-origin.y,angle:plan.heading,heading:plan.heading});
          if(!nativeSaveStorage.write(s).ok)throw Error('Dock fixture save failed');
          resumeNativeGame('normal');return {id:type,dimensions:d.dimensions,external:plan.external,berth:plan.berth,maxHeight:nativeShipScaleSettings.gameplay.maxFrameHeight};
        }''',ship_type)
        assert setup['dimensions']['height']<=setup['maxHeight']+1e-8,setup
        assert setup['external']==(setup['dimensions']['width']>83 or setup['dimensions']['height']>130),setup
        page.evaluate('()=>nativeShipyardServices.select()')
        page.locator('[data-yard-action="dock"]').click()
        page.wait_for_function('()=>nativeShipyardServices.snapshot().dock?.phase==="approach"||nativeShipyardServices.docked',timeout=10000)
        print('Approaching upgrade dock with hull '+str(ship_type),flush=True)
        page.wait_for_function('()=>nativeShipyardServices.docked&&nativeShipyardServices.active',timeout=45000)
        pose=page.evaluate('''()=>{const s=__compactState,p=vexedSolFlight.shipPosition(s),d=s.shipyardDock;
          return {error:Math.hypot(p.x-d.plan.x,p.y-d.plan.y),berth:d.plan.berth,phase:d.phase};}''')
        assert pose['error']<.7 and pose['phase']=='docked',pose
        assert page.locator('[data-yard-tab]').count()==5
        assert page.locator('.mars-upgrade-choice').count()==9
        page.screenshot(path=str(OUT/f'docked-{ship_type}.png'))
        rows.append({**setup,**pose,'upgradeChoices':9})
        print('Docked compact hull '+str(ship_type),flush=True)
        page.locator('[data-yard-action="close"]').click()
    assert not errors,errors
    result={'passed':True,'hulls':rows,'javascriptErrors':errors}
    (OUT/'report.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({'passed':True,'dockedHulls':len(rows),'javascriptErrors':errors}),flush=True)
    browser.close()
