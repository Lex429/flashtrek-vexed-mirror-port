"""Civilian exclusions, old-save relocation and real mining-only journeys in a browser."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'civilian-access'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

HELPERS=r'''()=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
  window.__accessTest={check,original:JSON.stringify(nativeNpcDev.getState())};const t=__accessTest;
  t.state=()=>nativeNpcDev.getState();
  t.reload=value=>{localStorage.setItem('broken-mirror-native-save',typeof value==='string'?value:JSON.stringify(value));resumeNativeGame();const s=t.state();nativeNpcLives.initialize(s);return s;};
  t.tick=()=>{const s=t.state(),dt=.25;nativeSimulation.advance(s,dt);nativeSolEconomy.advance(s,dt);nativeCivilianTraffic.advance(s,dt);nativeCombatShots.advance(s,dt);nativeEnvironmentalImpacts.advance(s,dt);nativeShipEffects.advance(s,dt);nativeAsteroidCombat.advance(s,dt);};
  t.until=(predicate)=>{let n=0;while(!predicate()){t.tick();check(++n<6000,'Civilian access scenario stalled');}};
  t.assert=()=>{const s=t.state(),a=nativeCivilianAccess;
    for(const ship of s.civilianTraffic.ships){check(!a.blocked(ship.system),'Civilian at prohibited system '+ship.system);check(a.inhabited(s,ship.operatingBase),'Empty civilian operating base');
      if(!a.inhabited(s,ship.system)){check(ship.task?.kind==='mining','Non-mining visit to an empty world');check(!nativePortDocking.inspect(s,ship,false),'Civilian dock at an empty world');}
      if(ship.journey)check(!a.blocked(ship.journey.destination),'Civilian route to prohibited system');
    }
  };
  nativeNpcLives.initialize(t.state());t.assert();
  return {population:t.state().civilianTraffic.ships.length,prohibited:nativeCivilianAccess.prohibitedSystems.map(id=>VexedMirrorWorld.systems.find(s=>s.id===id).name)};
}'''

def main():
    OUTPUT.mkdir(parents=True,exist_ok=True);server=None;errors=[]
    if len(sys.argv)>1:base=sys.argv[1].rstrip('/')
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1280,'height':850});page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(base+'/html-games/broken-mirror-port/index.html');page.locator('[data-menu="dev"]').click(timeout=20000)
            page.wait_for_function('()=>nativeSolAsteroids.placements.length>0')
            report=page.evaluate(HELPERS);assert report['population']==159
            # The ordinary galaxy UI must show no civilian residents in excluded sectors.
            page.locator('#devToolsBtn').click();page.locator('#galaxy-map-button').click()
            snapshot=page.evaluate('nativeGalaxyOverview.snapshot()')
            assert not [s for s in snapshot['ships'] if s['category']=='civilian' and s['system'] in [32,33,34,51,52]]
            page.screenshot(path=str(OUTPUT/'galaxy-exclusions.png'))
            report['migration']=page.evaluate(r'''()=>{
              const t=__accessTest,s=JSON.parse(t.original),ids=[32,33,34,51,52],expected=[];
              ids.forEach((id,i)=>{const ship=s.civilianTraffic.ships[i];
                Object.assign(ship,{system:id,stationSystem:id,operatingBase:id,phase:'docked',cargo:{good:1,tons:4,owner:ship.id,fromSystem:1,fromPort:3,toSystem:52,toPort:0},credits:4000+i});
                for(const key of ['task','journey','localLeg','lifeVersion','needsDockRecovery','dockingMove','scriptedDemo'])delete ship[key];
                expected.push({id:ship.id,credits:ship.credits,cargo:JSON.stringify(ship.cargo)});
              });
              const restored=t.reload(s);t.assert();
              for(const before of expected){const ship=nativeNpcLives.find(restored,before.id);t.check(ship.credits===before.credits&&JSON.stringify(ship.cargo)===before.cargo,'Relocation changed owned cargo or credits');}
              t.check(restored.civilianTraffic.ships.length===159,'Migration replaced the fleet');
              return expected.map(before=>({id:before.id,relocatedTo:nativeNpcLives.find(restored,before.id).system}));
            }''')
            report['expedition']=page.evaluate(r'''()=>{
              const t=__accessTest,s=t.reload(t.original);s.civilianTraffic.life.config.economyEnabled=false;
              const ship=s.civilianTraffic.ships.find(ship=>ship.role==='mining'&&!ship.cargo&&!ship.journey&&!ship.dockingMove&&!ship.needsDockRecovery&&!ship.scriptedDemo);
              t.check(ship,'No available existing miner');nativeNpcLives.interrupt(s,ship,'browser mining fixture');
              const point=nativePortDocking.center(1,3);Object.assign(ship,{system:1,stationSystem:1,operatingBase:1,port:3,x:point.x+220,y:point.y,miningTrips:(3-ship.id%3)%3});
              nativeNpcLives.refreshLocation(s,ship);nativeNpcLives.resumeWork(s,ship);
              t.until(()=>ship.task?.phase==='mining-transit');t.assert();
              const mineSystem=ship.journey.destination,rockId=ship.task.requirements.rockId,id=ship.id,deliveries=ship.deliveries||0;
              t.check(!nativeCivilianAccess.inhabited(s,mineSystem),'Expedition must target an empty belt');
              t.until(()=>ship.task.phase==='mining');t.assert();
              t.check(!s.civilianTraffic.life.markets[mineSystem+':0'],'Created a refinery at an empty world');
              t.reload(s);const active=nativeNpcLives.find(t.state(),id);t.assert();
              t.until(()=>active.deliveries>deliveries);t.assert();
              t.check(t.state().asteroidOreDrops[rockId]===0,'Ore entitlement was not consumed');
              t.check(nativeCivilianAccess.inhabited(t.state(),active.system)&&!active.cargo,'Ore did not reach an inhabited buyer');
              return {id,miningSystem:mineSystem,rockId,deliveredTo:active.system,phase:active.task.phase,mined:active.mined};
            }''')
            assert not errors,errors
            (OUTPUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            browser.close();print('Civilian exclusions, galaxy markers, preserved migration cargo, mining-only expedition/reload and inhabited delivery passed; no browser errors.')
    finally:
        if server:server.shutdown()

if __name__=='__main__':main()
