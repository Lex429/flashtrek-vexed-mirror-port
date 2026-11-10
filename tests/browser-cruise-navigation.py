"""Actual cruise controls, manual detours, durable cancellation and body warp."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/navigation-cruise';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];failed=[];report={}
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850})
        page.on('pageerror',lambda error:errors.append(str(error)));page.on('response',lambda response:failed.append(response.url) if response.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.locator('[data-menu="dev"]').click(timeout=90000)
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200&&nativeCombatShots.isReady()',timeout=120000)
        baseline=page.evaluate('''()=>{
          const original=nativeSimulation;window.__simulation=original;window.nativeSimulation={...original,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));Object.assign(s,{devMode:false,system:1,localBody:3,localBodySystem:1,localSystemVersion:nativeSystemCatalog.version,x:600,y:-800,angle:0,antimatter:1000,latinum:10000,localCruise:null,arrivalApproach:null,landed:false});nativeShipMotion.stop(s);nativeManualFlight.initializeRegion(s);
          const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__s=s;return restore(s);};
          if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');
          const storage=nativeSaveStorage;window.nativeSaveStorage={...storage,write(s,...args){if(window.__denyCancelSave)return {ok:false,error:'Storage denied for cancellation check'};return storage.write(s,...args);},async writeAsync(s,...args){window.__s=s;return storage.writeAsync(s,...args);}};
          window.nativeSimulation=original;nativeSimulationHost.checkpoint();
          return {fuel:__s.antimatter,day:__s.day,population:__s.civilianTraffic.ships.length,fixture:JSON.stringify(__s)};
        }''')
        def select_body(system,body):
            # Dispatch to the real node handler, including offscreen chart bodies.
            page.locator(f'#galaxy-map [data-system="{system}"][data-body="{body}"]').dispatch_event('keydown',{'key':'Enter'})
        def action(name):
            try:page.locator(f'[data-action="{name}"]').click(timeout=15000)
            except Exception:
                page.screenshot(path=str(OUT/'map-action-failure.png'))
                print(json.dumps({'errors':errors,'failed':failed,'layout':page.evaluate('''name=>{const button=document.querySelector('[data-action="'+name+'"]'),legend=document.querySelector('.map-legend'),box=button.getBoundingClientRect();return {button:box.toJSON(),legend:legend.getBoundingClientRect().toJSON(),legendPointer:getComputedStyle(legend).pointerEvents,map:document.querySelector('#galaxy-map').getBoundingClientRect().toJSON(),hit:document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.outerHTML.slice(0,300)};}''',name)}),flush=True)
                raise
        page.locator('#mapBtn').click();select_body(1,4)
        assert page.locator('[data-action="cruise"]').is_enabled();assert page.locator('[data-action="warp"]').is_hidden()
        action('cruise');page.wait_for_selector('#cruise-controls:not([hidden])')
        assert 'Moon' in page.locator('.cruise-destination').inner_text()
        page.wait_for_timeout(250);before=page.evaluate('({angle:__s.angle,x:__s.x,y:__s.y,to:__s.localCruise.to})')
        page.keyboard.down('a');page.keyboard.down('w');page.wait_for_timeout(650)
        during=page.evaluate('({angle:__s.angle,x:__s.x,y:__s.y,to:__s.localCruise?.to,manual:nativePlayerCruise.snapshot(__s)?.manual})')
        assert during['manual'] and during['to']==4,during
        assert abs(during['angle']-before['angle'])>.05,(before,during)
        page.screenshot(path=str(OUT/'manual-override.png'))
        page.keyboard.up('a');page.keyboard.up('w');page.wait_for_function('()=>nativePlayerCruise.snapshot(__s)?.manual===false')
        page.wait_for_function('()=>!__s.localCruise&&__s.localBody===4',timeout=90000)
        assert page.locator('#cruise-controls').is_hidden()
        assert page.evaluate('__s.antimatter')==baseline['fuel']
        assert page.evaluate('__s.civilianTraffic.ships.length')==baseline['population']
        report['manualDetour']={'realWASD':True,'retainedDestination':True,'resumedAndArrivedAtMoon':True,'fuelUnchanged':True,'fullFleetRetained':True}
        assert page.evaluate('nativeNavigation.call("cruise",{system:1,body:5}).ok')
        page.wait_for_selector('#cruise-controls:not([hidden])');page.wait_for_timeout(200)
        page.evaluate('window.__denyCancelSave=true');page.locator('.cruise-cancel').click()
        assert page.evaluate('!!__s.localCruise'),'Failed durable cancellation discarded the course'
        page.evaluate('window.__denyCancelSave=false')
        motion=page.evaluate('''()=>{const before={vx:__s.vx,vy:__s.vy,speed:__s.speed};document.querySelector('.cruise-cancel').click();return {before,after:{vx:__s.vx,vy:__s.vy,speed:__s.speed},route:__s.localCruise,saved:nativeSaveStorage.read('normal').localCruise};}''')
        assert motion['before']==motion['after'] and not motion['route'] and not motion['saved'],motion
        assert page.evaluate('nativeNavigation.call("cruise",{system:1,body:5}).ok');page.keyboard.press('Control+c');assert page.evaluate('!!__s.localCruise')
        page.keyboard.press('c');page.wait_for_function('()=>!__s.localCruise')
        # Continue restores the course, with no held manual input.
        assert page.evaluate('nativeNavigation.call("cruise",{system:1,body:5}).ok')
        page.evaluate('resumeNativeGame("normal")');assert page.evaluate('__s.localCruise.to')==5
        page.wait_for_function('()=>nativePlayerCruise.snapshot(__s)?.manual===false');page.locator('.cruise-cancel').focus();page.keyboard.press('Space');page.wait_for_function('()=>!__s.localCruise')
        report['cancellation']={'visibleButton':True,'shortcutC':True,'buttonSpace':True,'verifiedSave':True,'failedWriteRetainsCourse':True,'noForcedStop':True,'continueResumesAutopilot':True}
        # Select a companion star through the map and preserve that body through warp.
        choice=page.evaluate('''()=>{const stars=nativeSystemCatalog.bodies(4).filter(b=>b.kind==='star'&&!b.occludedBy),body=stars[1]||stars[0];return {system:4,body:body.id,name:body.name};}''')
        page.locator('#mapBtn').click();select_body(choice['system'],choice['body'])
        assert page.locator('[data-action="cruise"]').is_hidden();assert page.locator('[data-action="warp"]').is_enabled()
        assert choice['name'] in page.locator('.map-destination-info h3').inner_text()
        action('warp');page.wait_for_function('()=>vexedWarp.assetsReady||vexedWarp.phase==="error"',timeout=90000)
        assert page.evaluate('vexedWarp.assetsReady'),page.evaluate('vexedWarp.snapshot()')
        target=page.evaluate('''()=>{const r=vexedWarp.report,body=nativeSystemCatalog.bodies(__s.system).find(b=>b.id===r.destinationBodyId),goal=vexedSolFlight.bodyPosition(body),ship=vexedSolFlight.shipPosition(__s);return {report:r,body:__s.localBody,distance:Math.hypot(goal.x-ship.x,goal.y-ship.y),home:nativeSystemCatalog.homeId(__s.system)};}''')
        assert target['report']['destinationBodyId']==choice['body'] and target['body']==choice['body'],target
        assert target['distance']<1500 and target['body']!=target['home'],target
        page.screenshot(path=str(OUT/'selected-star-warp.png'));page.locator('.warp-continue').click();page.wait_for_function('()=>!vexedWarp.active||vexedWarp.phase==="error"',timeout=45000)
        assert page.evaluate('vexedWarp.phase')=='idle';page.wait_for_selector('#cruise-controls:not([hidden])');page.keyboard.press('c')
        assert page.evaluate('!__s.arrivalApproach')
        report['bodyWarp']={'selected':choice,'arrivedAtSelectedBody':True,'arrivalApproachCancellable':True}
        # The saved frame may still be Sol even when physically far outside it.
        far=page.evaluate('''fixture=>{
          const s=JSON.parse(fixture),flight=nativeManualFlight,b=nativeSystemCatalog.boundary(1);let point;
          for(let i=0;i<32;i++){const angle=i*Math.PI/16,candidate={x:b.x+Math.cos(angle)*(b.rx+5000),y:b.y+Math.sin(angle)*(b.ry+5000)};if(flight.regionAtPoint(s,candidate,1).system===null){point=candidate;break;}}
          if(!point)throw Error('No interstellar return-warp fixture');Object.assign(s,{x:point.x,y:point.y,localCruise:null,arrivalApproach:null});nativeShipMotion.stop(s);flight.initializeRegion(s);nativeSaveStorage.write(s);resumeNativeGame('normal');return nativeNavigation.call('state',{system:1,body:0}).selected;
        }''',baseline['fixture'])
        assert far['canTravel'] and not far['inLocalSystem'] and far['bodyId']==0,far
        assert page.evaluate('nativeNavigation.call("course",{system:1,body:0}).ok')
        page.wait_for_function('()=>vexedWarp.assetsReady||vexedWarp.phase==="error"',timeout=90000)
        assert page.evaluate('vexedWarp.assetsReady'),page.evaluate('vexedWarp.snapshot()')
        assert page.evaluate('__s.system===1&&__s.localBody===0&&vexedWarp.report.destinationBodyId===0')
        page.locator('.warp-continue').click();page.wait_for_function('()=>!vexedWarp.active||vexedWarp.phase==="error"',timeout=45000);assert page.evaluate('vexedWarp.phase')=='idle'
        page.keyboard.press('c');report['returnWarp']={'savedFrameSol':True,'physicallyOutside':True,'arrivedAtSolStar':True}
        # Keep the visible cancellation control usable on a narrow screen.
        page.evaluate('''fixture=>{nativeSaveStorage.write(JSON.parse(fixture));resumeNativeGame('normal');nativeNavigation.call('cruise',{system:1,body:5});}''',baseline['fixture'])
        page.set_viewport_size({'width':480,'height':850});page.emulate_media(reduced_motion='reduce');page.wait_for_selector('#cruise-controls:not([hidden])')
        box=page.locator('.cruise-cancel').bounding_box();assert box and box['x']>=0 and box['x']+box['width']<=480 and box['y']+box['height']<850,box
        panel=page.locator('#cruise-controls').bounding_box();radar=page.locator('#native-radar').bounding_box()
        assert panel and radar and panel['y']+panel['height']<=radar['y']-8,(panel,radar)
        page.screenshot(path=str(OUT/'cruise-small.png'));page.locator('.cruise-cancel').click()
        assert not errors and not failed,(errors,failed)
        report.update(passed=True,javascriptErrors=errors,failedRequests=failed);(OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True);browser.close()
finally:server.shutdown();server.server_close()
