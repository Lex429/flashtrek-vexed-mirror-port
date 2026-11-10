"""Saved player distress controls, real medical response, and responsive layout."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'distress-call'
OUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(
    ('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200', timeout=120000)
        page.evaluate("""()=>{
          window.__distressSimulation=nativeSimulation;
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          const medic=s.civilianTraffic.ships.find(e=>e.shipType===58&&!e.scriptedDemo&&!e.journey&&e.task?.kind!=='medical');
          if(!medic)throw Error('No existing available medical crew');
          Object.assign(s,{devMode:false,shipType:7,system:medic.system,localBody:medic.system===1?3:0,
            x:4e6,y:4e6,angle:0,speed:0,vx:0,vy:0,hull:35,shields:50,phase:'flight',landed:false,
            localCruise:null,arrivalApproach:null,manualTargetSystem:0,deuranium:2,repairDroneMode:'manual'});
          for(let i=0;i<12;i++){
            s.y=4e6+i*2000;const pose=s.system===1?vexedSolFlight.shipPosition(s):s;
            if(!nativeSolAsteroids.sweptNearby(s.system,pose,{x:pose.x+1000,y:pose.y},600).length)break;
            if(i===11)throw Error('No clear rescue fixture');
          }
          for(const key of ['motionKick','motionSpin','motionDrift','motionReverse','motionAngularVelocity'])delete s[key];
          s.shipSimulation.schedule.pendingSeconds=0;
          const eq=nativeShipEquipment.ensure(s);eq.instances[eq.slots.engineering[0]].condition=100;
          const restore=nativeCombatShots.restore;
          nativeCombatShots.restore=state=>{window.__distressState=state;return restore(state);};
          if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');
          window.__distressMedicId=medic.id;
        }""")
        page.wait_for_function('()=>window.__distressState&&!nativeSystemHub.active&&!nativePlanetEncounter.active')
        medic_id = page.evaluate('__distressMedicId')
        before = page.evaluate("""()=>{
          const s=__distressState;
          return {hull:s.hull,material:s.deuranium,money:s.latinum,ids:Object.keys(s.shipEquipment.instances),fleet:s.civilianTraffic.ships.map(e=>e.id)};
        }""")
        page.wait_for_function('()=>!document.querySelector("#distressBtn").disabled')
        page.locator('#inventoryBtn').click()
        signal = page.locator('#ship-inventory [data-request-distress]')
        assert signal.is_enabled()
        layouts = []
        for width, height in [(1280, 850), (390, 700)]:
            page.set_viewport_size({'width': width, 'height': height})
            if width < 760:
                page.locator('[data-inventory-view="loadout"]').click()
            page.wait_for_timeout(100)
            fits = signal.evaluate("""button=>{
              const b=button.getBoundingClientRect(),panel=button.closest('.inventory-loadout').getBoundingClientRect();
              return b.width>0&&b.left>=panel.left&&b.right<=panel.right+1&&b.top>=panel.top&&b.bottom<=panel.bottom+1;
            }""")
            assert fits, (width, height)
            page.screenshot(path=str(OUT / f'inventory-{width}.png'))
            layouts.append({'width': width, 'height': height, 'fits': fits})
        signal.click()
        assert page.locator('#ship-inventory').is_hidden()
        saved_call = page.evaluate("nativeSaveStorage.read('normal').shipRepairs.calls.find(c=>c.target.category==='player'&&c.playerRequested)")
        assert saved_call and saved_call['status'] == 'queued', saved_call
        assert page.evaluate('nativeShipRepairs.requestPlayerDistress(__distressState).callId') == saved_call['id']
        assert page.evaluate("__distressState.shipRepairs.calls.filter(c=>c.target.category==='player').length") == 1
        page.wait_for_function('()=>document.querySelector("#distressBtn").textContent==="Distress Sent"')
        assert page.locator('#distressBtn').is_disabled()
        footer_fits = page.locator('.game-actions').evaluate("""nav=>[...nav.querySelectorAll('button')].filter(b=>b.getClientRects().length).every(b=>{
          const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight;
        })""")
        assert footer_fits
        page.screenshot(path=str(OUT / 'signal-sent-mobile.png'))
        page.reload()
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate("""()=>{
          window.__distressSimulation=nativeSimulation;
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          const restore=nativeCombatShots.restore;
          nativeCombatShots.restore=s=>{window.__distressState=s;return restore(s);};
        }""")
        page.locator('[data-menu="continue"]').click()
        page.wait_for_function('()=>!!window.__distressState')
        assert page.evaluate("__distressState.shipRepairs.calls.filter(c=>c.target.category==='player').length") == 1
        assert page.evaluate('nativeShipRepairs.playerDistressStatus(__distressState).callId') == saved_call['id']
        page.set_viewport_size({'width': 1280, 'height': 850})
        page.evaluate("""id=>{
          const s=__distressState,medic=s.civilianTraffic.ships.find(e=>e.id===id),p=s.system===1?vexedSolFlight.shipPosition(s):s;
          nativeNpcLives.interrupt(s,medic,'Browser medical response fixture');
          Object.assign(medic,{x:p.x+320,y:p.y,heading:Math.PI,phase:'cruise',repairDeuranium:100});
          delete medic.localLeg;delete medic.journey;nativeShipMotion.stop(medic);
          nativeShipSystems.refreshShip(s,medic,'civilian');nativeShipRepairs.invalidateMembership(s);
          window.nativeSimulation=__distressSimulation;nativeSimulationHost.checkpoint();
        }""", medic_id)
        page.wait_for_function("()=>__distressState.shipRepairs.calls.find(c=>c.target.category==='player'&&c.playerRequested)?.status==='servicing'", timeout=90000)
        response = page.evaluate("""()=>{
          const s=__distressState,c=s.shipRepairs.calls.find(c=>c.target.category==='player'&&c.playerRequested);
          const m=s.shipRepairs.missions.find(m=>m.target.category==='player'&&m.carrier.category==='civilian');
          return {call:c.status,carrier:m?.carrier.id,drones:m?.drones.length};
        }""")
        assert response['drones'] == 6 and response['carrier'] in before['fleet'], response
        page.wait_for_function("()=>__distressState.shipRepairs.calls.find(c=>c.target.category==='player'&&c.playerRequested)?.status==='completed'", timeout=90000)
        page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}')
        after = page.evaluate("""()=>{
          const s=__distressState;return {hull:s.hull,phase:s.phase,material:s.deuranium,money:s.latinum,
            ids:Object.keys(s.shipEquipment.instances),fleet:s.civilianTraffic.ships.map(e=>e.id)};
        }""")
        assert after['hull'] == 50 and after['phase'] == 'flight', after
        for field in ['material', 'money', 'ids', 'fleet']:
            assert after[field] == before[field], field
        page.wait_for_function('()=>document.querySelector("#distressBtn").disabled')
        page.evaluate("()=>{Object.assign(__distressState,{hull:10,phase:'disabled',deuranium:0});nativeShipSystems.refreshShip(__distressState,__distressState,'player');}")
        page.wait_for_function('()=>!document.querySelector("#distressBtn").disabled')
        page.locator('#distressBtn').click()
        second = page.evaluate("nativeSaveStorage.read('normal').shipRepairs.calls.find(c=>c.target.category==='player'&&c.status==='queued')")
        assert second and second['id'] != saved_call['id'], second
        assert page.evaluate('__distressState.deuranium') == 0
        page.screenshot(path=str(OUT / 'footer-distress-call.png'))
        assert page.locator('#notice, #combat-target-status').count() == 0
        assert not errors, errors
        report = {'passed': True, 'partialShortage': True, 'zeroSupplies': True,
                  'inventoryAndFooter': True, 'savedContinue': True, 'noDuplicates': True,
                  'medicalResponse': response, 'repairedHull': after['hull'], 'layouts': layouts,
                  'mobileFooterFits': footer_fits, 'errors': errors}
        (OUT / 'browser.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report), flush=True)
        browser.close()
finally:
    server.shutdown()
