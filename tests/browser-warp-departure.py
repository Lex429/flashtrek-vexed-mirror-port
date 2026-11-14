"""Actual Aries warp: visible disappearance point, bright flash and paused clock. No FPS claim."""
import base64,functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/warp-departure';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];failed=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850})
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.wait_for_function('()=>nativeWorldBootstrap.ready()||nativeWorldBootstrap.diagnostics().error',timeout=45000)
        bootstrap=page.evaluate('nativeWorldBootstrap.diagnostics()');assert bootstrap['ready'] and bootstrap['geometryChecked']>0 and not bootstrap['error'],bootstrap
        page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
        page.locator('#devToolsBtn').click();page.locator('[data-dev-ship]').select_option('12');page.locator('[data-dev-equip]').click()
        page.wait_for_function('()=>nativeShipEffects.stageReady(12,0)',timeout=60000)
        page.evaluate('''()=>{
          window.__departureDraws=[];const api=vexedFlightAssets;window.vexedFlightAssets={...api,
           drawShip(ctx,asset,x,y,width,angle,time,appearance){
            if(ctx.canvas.id==='space'&&appearance?.kind==='departure'&&vexedWarp.flightEffect?.kind==='departure'&&asset.type===12)__departureDraws.push({type:asset.type,x,y,alpha:appearance.alpha,phaseTime:vexedWarp.snapshot().phaseTime});
            return api.drawShip(ctx,asset,x,y,width,angle,time,appearance);
           },
           drawWarpFlash(ctx,flash){
            api.drawWarpFlash(ctx,flash);
            if(flash&&ctx.canvas.id==='space'&&vexedWarp.flightEffect?.kind==='departure'&&vexedWarp.flightEffect.alpha===0&&!window.__liveFlash){
             const m=ctx.getTransform(),x=Math.round(m.a*flash.x+m.c*flash.y+m.e),y=Math.round(m.b*flash.x+m.d*flash.y+m.f);
             window.__liveFlash={flash,effect:vexedWarp.flightEffect,phaseTime:vexedWarp.snapshot().phaseTime,viewport:nativeView.measure(),pixel:Array.from(ctx.getImageData(x,y,1,1).data),auxiliary:api.cacheSnapshot().auxiliary};
             window.__flashImage=ctx.canvas.toDataURL();nativePause.open();
            }
           }
          };
          const result=nativeNavigation.call('course',9);if(!result.ok)throw Error(result.error);
        }''')
        page.wait_for_function('()=>!!window.__liveFlash||vexedWarp.phase==="error"',timeout=90000)
        live=page.evaluate('__liveFlash');assert live and live['effect']['alpha']==0,live
        assert all(c>220 for c in live['pixel'][:3]),live
        x,y,r=live['flash']['x'],live['flash']['y'],live['flash']['radius'];assert r<x<live['viewport']['w']-r and r<y<live['viewport']['h']-r,live
        assert abs(x-(live['effect']['shipX']+live['viewport']['w']/2-300))<1e-6,live
        assert abs(y-(live['effect']['shipY']+live['viewport']['h']/2-225))<1e-6,live
        draws=page.evaluate('__departureDraws');assert any(d['alpha']>.9 for d in draws) and draws[-1]['alpha']==0,draws
        assert draws[-1]['x']==x and draws[-1]['y']==y
        assert live['auxiliary']['warpFlash']
        (OUT/'live-flash.png').write_bytes(base64.b64decode(page.evaluate('__flashImage.split(",")[1]')))
        page.wait_for_timeout(120);assert page.evaluate('vexedWarp.snapshot().phaseTime')==live['phaseTime']
        assert page.evaluate('vexedWarp.flightEffect.flash.x')==live['effect']['flash']['x']
        page.locator('#pause-menu [data-resume]').click()
        page.wait_for_function('()=>vexedWarp.phase==="report"&&vexedWarp.assetsReady||vexedWarp.phase==="error"',timeout=90000);assert page.evaluate('vexedWarp.assetsReady')
        page.locator('.warp-continue').click();page.wait_for_function('()=>!vexedWarp.active||vexedWarp.phase==="error"',timeout=45000);assert page.evaluate('vexedWarp.phase')=='idle'
        assert page.evaluate('nativeNpcDev.getState().shipType')==12
        page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}')
        gallery=page.evaluate('''async()=>{
          const c=document.createElement('canvas');c.width=1200;c.height=600;const g=c.getContext('2d'),asset=await vexedFlightAssets.loadShip(12,nativeShipDefinitions.get(12).hull),d=nativeShipDefinitions.dimensions({shipType:12},'player');
          const before=vexedFlightAssets.cacheSnapshot().auxiliary.additionalBytes;
          for(const [i,t] of [0,.26,.46,.58,.72,.95].entries()){
           const tile=document.createElement('canvas');tile.width=600;tile.height=450;const ctx=tile.getContext('2d');ctx.fillStyle='#030a15';ctx.fillRect(0,0,600,450);
           for(let k=0;k<55;k++){ctx.fillStyle=k%2?'#668aab':'#bdcad6';ctx.fillRect((k*137)%600,(k*89)%450,1,1);}
           const e=vexedRebirthWarp.departure(t*1100,0,{duration:1100,cinematic:true,view:{w:600,h:450}});
           vexedFlightAssets.drawShip(ctx,asset,e.shipX,e.shipY,d.width,e.angle,t*1100,{...e,height:d.height});vexedFlightAssets.drawWarpFlash(ctx,e.flash);
           const x=i%3*400,y=Math.floor(i/3)*300;g.drawImage(tile,x,y+20,400,280);g.fillStyle='#cedfe8';g.font='14px Arial';g.fillText(`${Math.round(t*1100)} ms / ${e.alpha===0?'vanished':'accelerating'}`,x+8,y+16);
          }
          window.__departureGallery=c;return {before,after:vexedFlightAssets.cacheSnapshot().auxiliary.additionalBytes};
        }''')
        assert gallery['before']==gallery['after'],gallery
        (OUT/'sequence.png').write_bytes(base64.b64decode(page.evaluate('__departureGallery.toDataURL().split(",")[1]')))
        assert not errors and not failed,(errors,failed)
        report={'passed':True,'bootstrap':bootstrap,'liveFlash':live,'visibleShipThenFlash':True,'pausedFlashFrozen':True,'reusedFlashTexture':True,'arrivalCompleted':True,'javascriptErrors':errors,'failedRequests':failed}
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True);browser.close()
except Exception:
    if 'page' in locals():
        try:
            diagnostic=page.evaluate('()=>({warp:vexedWarp.snapshot(),effect:vexedWarp.flightEffect,paused:nativeSimulation.blocked(),shipType:nativeNpcDev.getState()?.shipType,gamePhase:nativeNpcDev.getState()?.phase,draws:window.__departureDraws?.length,flash:window.__liveFlash,errors:window.__warpErrors})')
            (OUT/'failure.json').write_text(json.dumps(diagnostic,indent=2),encoding='utf8')
        except Exception:pass
        try:page.screenshot(path=str(OUT/'failure.png'))
        except Exception:pass
    raise
finally:server.shutdown();server.server_close()
