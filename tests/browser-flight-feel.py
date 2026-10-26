"""Real-key reverse/stop/turnaround and contextual locks through the active game."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/flight-feel-20261026';OUTPUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850});page.on('pageerror',lambda e:errors.append(e.stack))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate('startNativeDevGame()');page.wait_for_function('()=>!!nativeNpcDev.getState()')
        page.evaluate('''()=>{
          const s=nativeNpcDev.getState();window.__feelTemplate=JSON.parse(JSON.stringify(s.civilianTraffic.ships.find(e=>e.shipType===47)));
          Object.assign(s,{system:11,x:30000,y:30000,angle:0,phase:'flight',landed:false,localCruise:null,arrivalApproach:null});
          delete s.journey;delete s.shipyardDock;nativeShipMotion.stop(s);
          s.civilianTraffic.ships=[];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
          s.shipRepairs.missions=[];s.shipRepairs.calls=[];
          s.minedAsteroids=nativeSolAsteroids.forSystem(11).map(r=>r.slotId);nativeNpcLives.invalidateMembership?.(s);nativeShipSystems.invalidate(s);
        }''')
        page.keyboard.down('w');page.wait_for_function('()=>nativeNpcDev.getState().speed>60');page.keyboard.up('w')
        page.keyboard.down('s');page.wait_for_function('()=>{const s=nativeNpcDev.getState();return s.motionReverse&&s.vx< -35;}',timeout=15000);page.keyboard.up('s')
        reverse=page.evaluate('()=>{const s=nativeNpcDev.getState();nativeSaveStorage.write(s);resumeNativeGame("dev");return {reverse:nativeNpcDev.getState().motionReverse,vx:nativeNpcDev.getState().vx};}')
        assert reverse['reverse'] and reverse['vx']<0,reverse
        page.keyboard.down('x');page.wait_for_function('()=>nativeNpcDev.getState().speed===0',timeout=15000);page.keyboard.up('x')
        assert page.evaluate('()=>{const s=nativeNpcDev.getState();return Math.hypot(s.vx,s.vy)===0;}')
        page.keyboard.down('w');page.wait_for_function('()=>nativeNpcDev.getState().speed>40');page.keyboard.up('w')
        angle=page.evaluate('nativeNpcDev.getState().angle');page.keyboard.press('q')
        page.wait_for_function('(a)=>{const s=nativeNpcDev.getState();return Math.abs(nativeShipMotion.wrap(s.angle-a-Math.PI))<.04&&s.speed===0;}',arg=angle,timeout=10000)
        page.evaluate('''()=>{
          const s=nativeNpcDev.getState();nativeShipMotion.stop(s);Object.assign(s,{x:30000,y:30000,angle:Math.PI,hull:10000,shields:10000});
          const origin={x:s.x,y:s.y},create=(id,x)=>{const e=JSON.parse(JSON.stringify(__feelTemplate));
            for(const key of ['localLeg','lifeLeg','journey','dockingMove','task','retaliationId','retaliationTargetId','retaliationUntil','combatAI','motionKick','motionSpin'])delete e[key];
            Object.assign(e,{id,system:11,x:origin.x+x,y:origin.y,shipType:47,phase:'docked',heading:Math.PI,speed:0,vx:0,vy:0,hull:1000,shields:1000,cargo:null,scriptedDemo:'flight-feel',nextActionAt:1e9,timer:1e9});return e;};
          const neutral=create(990001,100),enemy=create(990002,850);s.civilianTraffic.ships=[neutral,enemy];
          const rock=nativeSolAsteroids.forSystem(11)[0];nativeSolAsteroids.relocate(rock,{x:s.x+35,y:s.y,previousX:s.x+35,previousY:s.y});
          s.minedAsteroids=s.minedAsteroids.filter(id=>id!==rock.slotId);window.__feelRock=rock.slotId;
          nativeNpcLives.invalidateMembership?.(s);nativeShipSystems.invalidate(s);nativeCivilianTraffic.clearTarget();nativeAsteroidCombat.clear();
        }''')
        page.wait_for_timeout(800);page.keyboard.press('Shift')
        assert page.evaluate('nativeAsteroidCombat.target?.slotId')==page.evaluate('__feelRock')
        fire=page.evaluate('''()=>{
          const s=nativeNpcDev.getState(),enemy=s.civilianTraffic.ships.find(e=>e.id===990002),model=VexedMirrorWeapons.find(w=>w.damage>0&&nativeCombatShots.weaponVisual(w).kind==='torpedo');
          nativeWeaponLoadout.refit(s,[model.id],{holder:enemy});nativeShipSystems.refreshShip(s,enemy,'civilian');
          const fired=nativeCombatShots.fireFor({state:s,shooter:nativeShipDefinitions.describe(s,enemy,{category:'civilian'}),target:nativeShipDefinitions.describe(s)});
          return {ok:fired.ok,error:fired.error,source:fired.event?.sourceId};
        }''')
        assert fire['ok'],fire
        page.wait_for_timeout(800);page.keyboard.press('Shift')
        assert page.evaluate('nativeCivilianTraffic.target(nativeNpcDev.getState())?.id')==990002
        page.evaluate('''()=>{const s=nativeNpcDev.getState();nativeCombatShots.onPlayerHit(s,1,{source:'ai',sourceId:990002,from:{x:s.x+850,y:s.y},kind:'beam'});for(const event of s.weaponCombat.events)event.cancelled=true;nativeAsteroidCombat.select(nativeSolAsteroids.find(__feelRock,11));nativeCivilianTraffic.clearTarget();}''')
        page.wait_for_timeout(900);page.keyboard.press('Shift')
        assert page.evaluate('nativeCivilianTraffic.target(nativeNpcDev.getState())?.id')==990002,'incoming-fire memory lost between volleys'
        status=page.evaluate('''()=>{
          const s=nativeNpcDev.getState(),model=VexedMirrorWeapons.find(w=>w.damage>0&&nativeCombatShots.weaponVisual(w).kind==='beam');
          nativeWeaponLoadout.refit(s,[model.id]);s.angle=Math.PI;nativeShipSystems.refreshShip(s,s,'player');
          const enemy=nativeCivilianTraffic.target(s),target=nativeShipDefinitions.describe(s,enemy,{category:'civilian'});
          const status=nativeCombatShots.firingStatus(s,nativeShipDefinitions.describe(s),target);
          const fire=nativeCombatShots.fire;window.__feelFired=null;nativeCombatShots.fire=function(...args){const r=fire(...args);__feelFired={ok:r.ok,error:r.error,event:r.event};return r;};
          return {ok:status.ok,range:status.maxRange,distance:status.distance};
        }''')
        assert status['ok'] and status['distance']>650,status
        page.keyboard.press('Space');page.wait_for_function('()=>__feelFired?.ok',timeout=10000)
        page.screenshot(path=str(OUTPUT/'reverse-smart-target-long-range.png'))
        assert not errors,errors
        report={'passed':True,'reverseAndReload':reverse,'exactStop':True,'quickTurn':True,'closestRock':True,'actualIncomingShotPriority':fire,'betweenVolleyMemory':True,'rearLongRangeFire':status,'javascriptErrors':errors}
        (OUTPUT/'browser-flight-feel.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));browser.close()
finally:server.shutdown();server.server_close()
