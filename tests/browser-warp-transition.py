"""Real warp bearings, destination readiness, durable saves and frame delivery."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/warp-transition';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];failed=[];report={}
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.locator('[data-menu="dev"]').click(timeout=60000)
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200&&nativeCombatShots.isReady()',timeout=120000)
        page.evaluate("""()=>{
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));Object.assign(s,{devMode:false,system:1,localBody:3,x:2000,y:2000,angle:0,antimatter:1000,latinum:10000,landed:false,localCruise:null,arrivalApproach:null});nativeShipMotion.stop(s);nativeManualFlight.initializeRegion(s);
          const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__warpState=s;return restore(s);};
          if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');window.__warpBase=JSON.stringify(__warpState);
          window.__warpAudio=[];const Audio=window.AudioContext;window.AudioContext=new Proxy(Audio,{construct(target,args){__warpAudio.push(vexedWarp.phase);return Reflect.construct(target,args);}});
          window.__warpShipDraws=[];const flightAssets=vexedFlightAssets;window.vexedFlightAssets={...flightAssets,drawShip(ctx,asset,x,y,width,angle,time,appearance){if(ctx.canvas.className==='warp-space')__warpShipDraws.push({phase:vexedWarp.phase,width,time,...appearance});return flightAssets.drawShip(ctx,asset,x,y,width,angle,time,appearance);}};
          window.__warpSky=[];const space=vexedSpace,preparedSpace=Object.create(space);Object.defineProperty(preparedSpace,'prepareSystem',{value:async(...args)=>{const phase=vexedWarp.phase,origin=space.state.system;const result=await space.prepareSystem(...args);__warpSky.push({phase,origin,after:space.state.system,...result});return result;}});window.vexedSpace=preparedSpace;
          const storage=nativeSaveStorage;window.__holdHandoff=true;window.nativeSaveStorage={...storage,async writeAsync(s,options){window.__warpState=s;if(!s.pendingTransit)window.__warpOriginSeconds=nativeSimulation.seconds(s);if(window.__denyWarpSave)return {ok:false,error:'Storage denied for warp check'};const handoff=vexedWarp.phase==='arrival'&&!s.pendingTransit;if(handoff)window.__handoffStartedAt=vexedWarp.snapshot().phaseTime;const result=await storage.writeAsync(s,options);if(handoff&&window.__holdHandoff)await new Promise(resolve=>window.__releaseHandoff=resolve);return result;}};
          const bootstrap=nativeWorldBootstrap;window.__warpPlans=0;window.__preparationPhases=[];window.nativeWorldBootstrap={...bootstrap,planTravel(...args){__warpPlans++;__preparationPhases.push(vexedWarp.phase);if(window.__failWarpPlan)return Promise.reject(Error('Course preparation denied for check'));return bootstrap.planTravel(...args);}};
          const streaming=nativeSystemStreaming;window.__holdArrival=true;window.nativeSystemStreaming={...streaming,async prepareArrival(...args){__preparationPhases.push(vexedWarp.phase);const ready=await streaming.prepareArrival(...args);if(window.__holdAssets)await new Promise(resolve=>window.__releaseAssets=resolve);return ready;}};
          const warp=vexedWarp,wrapped=Object.create(warp);Object.defineProperty(wrapped,'acknowledgeScene',{value:system=>{if(__holdArrival){window.__releaseArrival=()=>{};return;}warp.acknowledgeScene(system);}});window.vexedWarp=wrapped;window.__holdAssets=true;
          window.__warpSlow=[];
          for(const [name,methods] of [['nativeNpcLives',['advance']],['nativeCivilianTraffic',['advance']],['nativeSolEconomy',['advance']],['nativeShipTraffic',['advance','collide']],['nativeAsteroidMotion',['advance','collide']],['nativeShipRepairs',['advance']],['nativeSaveStorage',['write','read','flushDue']],['nativeSaveCodec',['stringify','parse']]]){
            const original=window[name],wrapped=Object.create(original);
            for(const method of methods)Object.defineProperty(wrapped,method,{value:function(...args){const at=performance.now();try{return original[method](...args);}finally{const ms=performance.now()-at;if(ms>8)__warpSlow.push({name:name+'.'+method,ms,phase:vexedWarp.phase});}},enumerable:true});window[name]=wrapped;
          }
          window.__warpFrames=[];window.__warpPhases=[];window.__warpTrace=true;let last=0;
          const frame=at=>{if(!__warpTrace)return;if(last)__warpFrames.push({ms:at-last,phase:vexedWarp.phase});last=at;if(__warpPhases.at(-1)?.phase!==vexedWarp.phase)__warpPhases.push({phase:vexedWarp.phase,at});requestAnimationFrame(frame);};requestAnimationFrame(frame);
        }""")
        (OUT/'fixture.json').write_text(page.evaluate('__warpBase'),encoding='utf8')
        def start(target):
            page.evaluate('window.__warpAttempt=null')
            page.wait_for_function("""target=>{
              if(window.__warpAttempt?.result.ok)return true;
              const at=performance.now(),guidance=nativeManualFlight.guidance(__warpState,target),before={fuel:__warpState.antimatter,day:__warpState.day,angle:__warpState.angle};
              const result=nativeNavigation.call('course',target);window.__warpAttempt={result,before,clickMs:performance.now()-at,heading:Math.atan2(guidance.dy,guidance.dx)};return result.ok;
            }""",arg=target,timeout=30000)
            return page.evaluate('__warpAttempt')
        first=start(9);assert first['result']['ok'],first
        assert page.evaluate('vexedWarp.phase')=='alignment'
        page.wait_for_function('()=>vexedWarp.phase==="alignment"&&vexedWarp.snapshot().phaseTime>350',timeout=15000)
        turn=page.evaluate('()=>({effect:vexedWarp.flightEffect,snapshot:vexedWarp.snapshot()})')
        assert abs(turn['effect']['angle']-turn['snapshot']['originAngle'])>0.01,turn
        assert abs(turn['effect']['angle']-turn['snapshot']['courseAngle'])>0.01,turn
        page.wait_for_function('()=>!!window.__releaseAssets||vexedWarp.phase==="error"',timeout=90000)
        page.wait_for_function('()=>vexedWarp.phase==="charging"&&vexedWarp.snapshot().phaseTime>1300||vexedWarp.phase==="error"',timeout=30000)
        held=page.evaluate('()=>({snapshot:vexedWarp.snapshot(),effect:vexedWarp.flightEffect})')
        assert held['snapshot']['phase']=='charging' and not held['snapshot']['prepared'] and not held['snapshot']['committed'],held
        assert held['effect']['nacelleCharge']==1 and held['effect']['speed']==0,held
        assert page.locator('.warp-preparation').count()==0
        page.screenshot(path=str(OUT/'nacelles-charged-waiting.png'))
        page.locator('#pauseBtn').click();page.wait_for_function('()=>nativePause.active')
        paused=page.evaluate('vexedWarp.snapshot().phaseTime')
        page.evaluate('()=>{__holdAssets=false;__releaseAssets();}')
        page.wait_for_function('()=>vexedWarp.snapshot().prepared||vexedWarp.phase==="error"',timeout=30000)
        page.wait_for_timeout(100)
        assert page.evaluate('vexedWarp.phase')=='charging'
        assert page.evaluate('vexedWarp.snapshot().phaseTime')==paused
        page.locator('#pause-menu [data-resume]').click()
        page.wait_for_function('()=>{if(vexedWarp.phase!=="departure"&&vexedWarp.phase!=="error")return false;window.__departureBearing={angle:vexedWarp.flightEffect?.angle,course:vexedWarp.snapshot().courseAngle,warp:vexedWarp.snapshot()};return true;}',timeout=15000)
        bearing=page.evaluate('__departureBearing')
        assert bearing.get('angle') is not None,bearing
        assert abs(bearing['angle']-(first['heading']+3.141592653589793/2))<1e-6,(first,bearing)
        page.wait_for_function('()=>vexedWarp.phase==="report"||vexedWarp.phase==="error"',timeout=90000)
        assert page.evaluate('vexedWarp.phase')=='report',page.evaluate('vexedWarp.snapshot()')
        button=page.locator('.warp-continue');assert button.is_disabled()
        assert page.evaluate('document.activeElement!==document.querySelector(".warp-continue")')
        assert page.evaluate('getComputedStyle(document.querySelector(".warp-continue")).boxShadow')=='none'
        before=page.evaluate('vexedWarp.snapshot()');button.dispatch_event('click');page.keyboard.press('Enter');page.keyboard.press('Space')
        assert page.evaluate('vexedWarp.phase')=='report'
        page.screenshot(path=str(OUT/'destination-loading.png'))
        page.evaluate('()=>{__holdArrival=false;__releaseArrival();}')
        page.wait_for_function('()=>vexedWarp.assetsReady||vexedWarp.phase==="error"',timeout=90000)
        ready=page.evaluate('vexedWarp.snapshot()');assert ready['ready'] and ready['sceneFrames']>=2,ready
        assert page.evaluate('__preparationPhases.every(phase=>["alignment","charging"].includes(phase))')
        assert page.evaluate('vexedWarp.snapshot().audioReady&&__warpAudio.every(phase=>phase==="idle")')
        assert page.evaluate('__warpSky.length===1&&["alignment","charging"].includes(__warpSky[0].phase)&&__warpSky[0].origin===__warpSky[0].after&&__warpSky[0].textures>0')
        assert page.evaluate('__warpShipDraws.some(draw=>["alignment","charging"].includes(draw.phase))&&__warpShipDraws.every(draw=>draw.kind==="cruise"&&draw.effectRate===60&&draw.rasterWidth===100&&draw.imageSmoothingQuality==="low")')
        assert page.evaluate('nativeDamageArtPreparation.backgroundHeld')
        assert button.is_enabled();page.screenshot(path=str(OUT/'destination-ready.png'))
        receipt=page.evaluate('()=>({report:vexedWarp.report,saved:nativeSaveStorage.read("normal").pendingTransit,fuel:__warpState.antimatter,day:__warpState.day,plans:__warpPlans,seconds:nativeSimulation.seconds(__warpState),originSeconds:__warpOriginSeconds})')
        assert receipt['fuel']==first['before']['fuel']-receipt['report']['fuelUsed'],receipt
        assert receipt['day']==first['before']['day']+receipt['report']['elapsedDays'],receipt
        assert abs(receipt['seconds']-receipt['originSeconds']-receipt['report']['elapsedDays']*120)<1e-7,receipt
        assert receipt['saved']['report']['id']==receipt['report']['id'] and receipt['plans']==1,receipt
        button.focus();page.keyboard.press('Space')
        page.wait_for_function('()=>!!window.__releaseHandoff||vexedWarp.phase==="error"',timeout=45000)
        assert page.evaluate('__handoffStartedAt')<1100,'The final save started after the arrival animation ended'
        page.wait_for_function('()=>vexedWarp.snapshot().phaseTime>=1100||vexedWarp.phase==="error"',timeout=45000)
        assert page.evaluate('vexedWarp.active&&vexedWarp.phase==="arrival"')
        at_handoff=page.evaluate('nativeSimulation.seconds(__warpState)');page.wait_for_timeout(80)
        assert page.evaluate('nativeSimulation.seconds(__warpState)')==at_handoff,'Flight resumed before durable handoff finished'
        page.evaluate('()=>{__holdHandoff=false;__releaseHandoff();}')
        page.wait_for_function('()=>!vexedWarp.active||vexedWarp.phase==="error"',timeout=45000)
        assert page.evaluate('vexedWarp.phase')=='idle'
        assert page.evaluate('!nativeDamageArtPreparation.backgroundHeld')
        page.wait_for_timeout(1800)
        delivery=page.evaluate('()=>{__warpTrace=false;return {frames:__warpFrames,phases:__warpPhases,slow:__warpSlow,backlog:nativeNpcLives.metrics(__warpState).backlog,system:__warpState.system,fuel:__warpState.antimatter,pending:__warpState.pendingTransit}}')
        assert delivery['system']==9 and delivery['fuel']==receipt['fuel'] and not delivery.get('pending'),delivery
        times=[f['ms'] for f in delivery['frames']];report['delivery']={'frames':len(times),'maxMs':max(times),'over50':sum(t>50 for t in times),'phases':delivery['phases'],'note':'Instrumented correctness trace includes fixture startup, screenshots and save reads; use the separate sequential comparison for timing.'}
        if os.environ.get('WARP_PROFILE_ONLY'):
            (OUT/'profile.json').write_text(json.dumps(delivery,indent=2),encoding='utf8');print(json.dumps({'phases':delivery['phases'],'slow':delivery['slow'],'backlog':delivery['backlog']}),flush=True);browser.close();raise SystemExit(0)
        report['firstTrip']={'clickMs':first['clickMs'],'bearing':bearing,'loadingWasDisabled':True,'sceneFrames':ready['sceneFrames'],'fuelOnce':True,'daysOnce':True}
        # A failed durable commit retains the origin; retry reuses the same plan.
        page.evaluate("""()=>{const s=JSON.parse(__warpBase);nativeSimulationFrame.schedule(s).pendingSeconds=0;nativeSaveStorage.write(s);resumeNativeGame('normal');window.__denyWarpSave=true;window.__warpPlans=0;}""")
        second=start(4);page.wait_for_function('()=>vexedWarp.phase==="error"',timeout=90000)
        assert page.evaluate('vexedWarp.snapshot().committed') is False
        saved=page.evaluate('nativeSaveStorage.read("normal")');assert saved['system']==1 and saved['antimatter']==second['before']['fuel']
        page.evaluate('window.__denyWarpSave=false');page.locator('.warp-retry').click()
        page.wait_for_function('()=>vexedWarp.assetsReady||vexedWarp.phase==="error"',timeout=90000);assert page.evaluate('vexedWarp.assetsReady')
        assert page.evaluate('__warpPlans')==1
        retry_receipt=page.evaluate('vexedWarp.report');button.click();page.wait_for_function('()=>!vexedWarp.active||vexedWarp.phase==="error"',timeout=45000)
        assert page.evaluate('__warpState.antimatter')==second['before']['fuel']-retry_receipt['fuelUsed']
        report['retry']={'originRetainedOnFailure':True,'onePlan':True,'oneFuelCharge':True}
        # Restore a saved report: preparation repeats; elapsed days and fuel do not.
        resume_save=page.evaluate('()=>{const s=nativeSaveStorage.read("normal");s.pendingTransit={version:1,phase:"report",report:s.lastJourney};nativeSaveStorage.write(s);return {fuel:s.antimatter,day:s.day,id:s.lastJourney.id};}')
        page.reload();page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000);page.locator('[data-menu="continue"]').click()
        page.wait_for_function('()=>vexedWarp.assetsReady||vexedWarp.phase==="error"',timeout=90000)
        assert page.evaluate('vexedWarp.assetsReady')
        assert page.evaluate('vexedWarp.report.id')==resume_save['id']
        page.locator('.warp-continue').click();page.wait_for_function('()=>!vexedWarp.active||vexedWarp.phase==="error"',timeout=45000)
        resumed=page.evaluate('nativeSaveStorage.read("normal")');assert resumed['antimatter']==resume_save['fuel'] and resumed['day']==resume_save['day'],resumed
        report['resume']={'preparedAgain':True,'fuelAndDaysOnce':True}
        assert not errors and not failed,(errors,failed)
        report.update(passed=True,javascriptErrors=errors,failedRequests=failed);(OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf8');(OUT/'after.json').write_text(json.dumps(delivery,indent=2),encoding='utf8');print(json.dumps(report),flush=True);browser.close()
except Exception:
    if 'page' in locals():
        try:
            print(json.dumps({'errors':errors,'warp':page.evaluate('()=>window.vexedWarp?.snapshot?.()')}),flush=True);page.screenshot(path=str(OUT/'failure.png'))
        except Exception:pass
    raise
finally:server.shutdown();server.server_close()
