"""Expanded production fleet, startup worker, medical response and durable reload."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading
import time
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'population'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def main():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    server=None
    if len(sys.argv)>1: base=sys.argv[1].rstrip('/')
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        base=f'http://127.0.0.1:{server.server_port}'
    errors=[]
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1280,'height':850},bypass_csp=True,reduced_motion='reduce')
            page.on('pageerror',lambda error:errors.append(str(error)))
            start=time.monotonic()
            page.goto(base+'/html-games/broken-mirror-port/index.html',wait_until='domcontentloaded')
            page.wait_for_function('()=>nativeCombatShots.isReady()&&document.getElementById("startup").hidden',timeout=120000)
            page.locator('[data-menu="dev"]').click()
            page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=90000)
            report={'startupSeconds':time.monotonic()-start}
            report['fresh']=page.evaluate('''()=>{
              const s=nativeNpcDev.getState(),ships=s.civilianTraffic.ships,plan=nativeCivilianPopulation.plan(s);
              return {civilians:ships.length,medical:ships.filter(e=>e.shipType===58).length,
                tugs:s.solEconomy.freighters.length,bases:plan.length,worker:nativeWorldBootstrap.diagnostics(),
                medicalBases:new Set(ships.filter(e=>e.shipType===58).map(e=>e.medicalRegion)).size,
                excludedResidents:ships.filter(e=>nativeCivilianAccess.blocked(e.system)&&!nativeFactionFleets.militaryResidence(s,e)).length,
                backlog:nativeNpcLives.metrics(s).backlog,phases:ships.reduce((r,e)=>(r[e.phase]=(r[e.phase]||0)+1,r),{})};
            }''')
            assert report['fresh']['medical']==100 and report['fresh']['bases']==69
            assert report['fresh']['medicalBases']==69 and not report['fresh']['excludedResidents']
            assert report['fresh']['worker']['ready'] and not report['fresh']['worker']['error']
            # Reuse this exact production population for separate sequential timing.
            page.evaluate('()=>{window.__populationBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}')
            (OUTPUT/'full-fleet-save.json').write_text(page.evaluate('()=>JSON.stringify(nativeNpcDev.getState())'),encoding='utf-8')
            page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:__populationBlocked};nativeSimulationHost.checkpoint();}')
            # Exercise the actual UI's Dev map and Save controls.
            page.locator('#devToolsBtn').click();page.locator('#galaxy-map-button').click()
            report['map']=page.evaluate('()=>{const snap=nativeGalaxyOverview.snapshot();return {civilianMarkers:snap.ships.filter(e=>e.category==="civilian").length};}')
            assert report['map']['civilianMarkers']==1200
            page.screenshot(path=str(OUTPUT/'galaxy.png'))
            page.keyboard.press('Escape')
            page.locator('[data-save]:visible').click()
            before=page.evaluate('()=>{const s=nativeNpcDev.getState();return {ids:s.civilianTraffic.ships.map(e=>e.id),capital:s.civilianTraffic.population.ledger.initialCapital,medicalCapital:s.shipRepairs.ledger.medicalCapital,initialSupplies:s.shipRepairs.ledger.medicalInitialSupplies};}')
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function('()=>nativeCombatShots.isReady()&&document.getElementById("startup").hidden',timeout=120000)
            page.locator('[data-menu="continue-dev"]').click()
            page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200')
            after=page.evaluate('()=>{const s=nativeNpcDev.getState();return {ids:s.civilianTraffic.ships.map(e=>e.id),capital:s.civilianTraffic.population.ledger.initialCapital,medicalCapital:s.shipRepairs.ledger.medicalCapital,initialSupplies:s.shipRepairs.ledger.medicalInitialSupplies};}')
            assert before==after
            report['reload']={'sameIdentities':True,'sameInitialCapitalAndSupplies':True}
            page.wait_for_function('()=>!nativeSimulation.blocked()',timeout=30000)
            # A disabled civilian creates a real distress call. The existing
            # nearest available crew may be visiting from another regional base.
            report['medicalResponse']=page.evaluate('''()=>{
              const s=nativeNpcDev.getState(),ship=s.civilianTraffic.ships.find(e=>e.populationVersion===1&&e.system===1&&!e.journey&&e.hull>0&&e.phase!=='disabled'),ref=nativeShipRepairs.ref('civilian',ship);
              nativeNpcLives.interrupt(s,ship,'disabled');ship.hull=nativeShipDefinitions.forEntity(s,ship,{category:'civilian'}).hull*.1;ship.shields=0;ship.repairDeuranium=0;
              for(const dot of ship.repairBay.slots){dot.phase='destroyed';dot.hull=0;}
              nativeShipRepairs.observe(s,ship,'civilian');nativeShipSystems.refreshShip(s,ship,'civilian');
              const at=nativeSimulation.seconds(s);nativeShipRepairs.initialize(s).nextPollAt=at;nativeShipRepairs.advance(s,1/60);
              const call=s.shipRepairs.calls.find(c=>nativeShipRepairs.key(c.target)===nativeShipRepairs.key(ref));
              for(let step=0;call&&!call.claim&&step<120;step++){nativeSimulation.advance(s,.25);nativeNpcLives.advance(s,.25);nativeShipRepairs.advance(s,.25);}
              if(!call?.claim)throw Error('Regional medical crew did not claim distress call: '+JSON.stringify({call,blocked:nativeSimulation.blocked(),pause:nativePause.active,target:{id:ship.id,phase:ship.phase,hull:ship.hull},medical:s.civilianTraffic.ships.filter(e=>e.shipType===58&&e.system===1).map(e=>({id:e.id,phase:e.phase,supplies:e.repairDeuranium,job:e.task?.kind,journey:!!e.journey}))}));
              const responder=s.civilianTraffic.ships.find(e=>nativeShipRepairs.key(nativeShipRepairs.ref('civilian',e))===call.claim);
              return {call:call.id,status:call.status,responder:responder.id,responderType:responder.shipType,regionalBase:responder.medicalRegion,targetSystem:ship.system,task:responder.task.kind,
                taskCall:responder.task.requirements.callId,responders:s.civilianTraffic.ships.filter(e=>e.task?.kind==='medical'&&e.task.status==='active'&&e.task.requirements.callId===call.id).length};
            }''')
            assert report['medicalResponse']['task']=='medical'
            assert report['medicalResponse']['responderType']==58
            assert report['medicalResponse']['taskCall']==report['medicalResponse']['call']
            assert report['medicalResponse']['responders']==1
            assert not errors,errors
            report.update(passed=True,javascriptErrors=errors)
            (OUTPUT/'browser.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            print(json.dumps(report))
            browser.close()
    finally:
        if server:server.shutdown()

if __name__=='__main__': main()
