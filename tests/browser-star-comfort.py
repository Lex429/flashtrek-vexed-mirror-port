"""Exercise real flight inputs and compare rendered low/high-speed star optics."""
import base64,functools,http.server,json,math,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/star-comfort';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850},reduced_motion='no-preference')
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate('''()=>{
          const update=vexedSpace.update;window.__skyCourseError=0;
          vexedSpace.update=function(dt,input){
            window.__skyInput={...input};const result=update.call(this,dt,input),s=this.state;
            if(input.courseLocked&&Math.hypot(input.locx,input.locy)>0&&Math.hypot(s.motionX,s.motionY)>0){
              const cross=Math.abs(input.locx*s.motionY-input.locy*s.motionX)/(Math.hypot(input.locx,input.locy)*Math.hypot(s.motionX,s.motionY));
              __skyCourseError=Math.max(__skyCourseError,cross);
            }return result;
          };
          startNativeDevGame();const s=nativeNpcDev.getState();nativeShipMotion.stop(s);
          Object.assign(s,{system:11,x:30000,y:30000,angle:0,phase:'flight',landed:false,localCruise:null,arrivalApproach:null});
          delete s.journey;delete s.shipyardDock;nativeShipSystems.invalidate(s);
        }''')
        page.keyboard.down('w');page.wait_for_function('()=>nativeNpcDev.getState().speed>60',timeout=15000);page.keyboard.up('w')
        page.keyboard.down('d');page.wait_for_timeout(400);page.keyboard.up('d')
        live=page.evaluate('''()=>({speed:nativeNpcDev.getState().speed,effect:vexedSpace.state.speedEffect,input:__skyInput,
          courseError:__skyCourseError,trails:vexedSpace.state.stars.filter(s=>s.trailVisible).length})''')
        assert live['input']['maxSpeed']>0 and live['input']['reducedMotion'] is False,live
        assert live['input']['courseLocked'] is True and live['courseError']<1e-8,live
        assert live['effect']==0 and live['trails']==0,live
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_function('()=>__skyInput?.reducedMotion===true')
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_function('()=>__skyInput?.reducedMotion===false')
        page.evaluate('''()=>{
          const s=nativeNpcDev.getState();s.angle=-Math.PI/2;s.vx=0;s.vy=-427.5;s.speed=427.5;s.motionDrift=true;
          const update=vexedSpace.update;window.__trailRows=[];
          vexedSpace.update=function(dt,input){const result=update.call(this,dt,input),m=this.state;
            __trailRows.push({dt,locx:input.locx,locy:input.locy,inputSpeed:input.speed,physicalSpeed:Math.hypot(s.vx,s.vy),effect:m.speedEffect,
              angle:m.trailAngle??Math.atan2(m.motionY,m.motionX),frozen:!!window.__trailCameraFreeze});return result;
          };
        }''')
        page.locator('#space').focus();page.keyboard.down('w')
        page.wait_for_function('()=>vexedSpace.state.speedEffect>.6',timeout=20000)
        page.evaluate('''()=>{
          const owner=nativeSimulationFrame,s=nativeNpcDev.getState(),pose=owner.renderPose(s,nativeShipDefinitions.describe(s,s,{category:'player'}));
          window.__trailFrameOwner=owner;window.__trailCameraFreeze={x:pose.x,y:pose.y};
          window.nativeSimulationFrame={...owner,renderPose(state,descriptor){const shown=owner.renderPose(state,descriptor);
            return window.__trailCameraFreeze&&descriptor?.category==='player'?{...shown,...__trailCameraFreeze}:shown;
          }};
        }''')
        page.wait_for_function('()=>__trailRows.filter(r=>r.frozen).length>=5',timeout=15000)
        page.evaluate('''()=>{window.__trailCameraFreeze=null;window.nativeSimulationFrame=__trailFrameOwner;}''')
        page.keyboard.down('d');page.wait_for_timeout(2000);page.keyboard.up('d');page.wait_for_timeout(300);page.keyboard.up('w')
        trail_rows=page.evaluate('__trailRows')
        empty=[r for r in trail_rows if r['effect']>.2 and r['physicalSpeed']>350 and abs(r['locx'])+abs(r['locy'])<1e-9]
        assert len(empty)>=3,'The explicit empty-camera regression was not exercised'
        assert all(r['inputSpeed']>350 for r in empty),'An empty camera frame falsely reported physical braking'
        jumps=[]
        for a,b in zip(trail_rows,trail_rows[1:]):
            if min(a['effect'],b['effect'])<.2:continue
            step=abs(math.atan2(math.sin(b['angle']-a['angle']),math.cos(b['angle']-a['angle'])))
            if step>.5:jumps.append(step)
            assert step<=5*b['dt']+1e-8,{'before':a,'after':b,'angleStep':step}
        assert not jumps,jumps
        trail_result={'realFrames':len(trail_rows),'emptyCameraFramesWhileFast':len(empty),'directionSnaps':len(jumps),'frames':trail_rows}
        (OUT/'turning-trails.json').write_text(json.dumps(trail_result,indent=2),encoding='utf8')
        page.screenshot(path=str(OUT/'turning-trails.png'))
        report=page.evaluate('''()=>{
          window.requestAnimationFrame=()=>0;
          const game=nativeNpcDev.getState(),before=JSON.stringify(game),canvas=document.createElement('canvas');canvas.width=600;canvas.height=450;
          const ctx=canvas.getContext('2d',{willReadFrequently:true}),view={w:600,h:450,playerX:0,playerY:0,reducedMotion:false};
          function capture(speed){
            const sky=vexedSpace.create(11);sky.render(ctx,view,[]);
            const star=sky.state.stars.find(s=>s.layer===5),anchor={x:star.x,y:star.y};
            for(let i=0;i<240;i++)sky.update(1/60,{speed,locx:-speed/13,locy:0,maxSpeed:450});
            const trails=sky.state.stars.filter(s=>s.trailVisible).length,effect=sky.state.speedEffect;
            sky.render(ctx,view,[]);const field=canvas.toDataURL();
            // Compare one identical source/location so brightness cannot be explained by a different star or camera angle.
            for(const s of sky.state.stars)s.alpha=0;Object.assign(star,{x:220,y:140,alpha:100});
            const fixed={...view,playerX:(anchor.x-300)/.05,playerY:(anchor.y-225)/.05};
            sky.render(ctx,fixed,[]);const a=ctx.getImageData(200,120,40,40).data;
            const energy=a.reduce((sum,value,i)=>sum+(i%4===3?0:value),0),image=canvas.toDataURL();
            sky.render(ctx,fixed,[]);const b=ctx.getImageData(200,120,40,40).data;
            if(!a.every((v,i)=>v===b[i]))throw Error('Paused optics changed');
            sky.render(ctx,{...fixed,heading:Math.PI},[]);const c=ctx.getImageData(200,120,40,40).data;
            if(!a.every((v,i)=>v===c[i]))throw Error('Ship heading rotated the optics');
            return {speed,effect,trails,energy,image,field};
          }
          const slow=capture(200),fast=capture(450);
          if(slow.trails!==0||fast.trails===0||fast.energy<slow.energy*1.3)throw Error('Speed visuals did not require fast travel: '+JSON.stringify({slow:slow.energy,fast:fast.energy}));
          if(JSON.stringify(game)!==before)throw Error('Background rendering changed gameplay state');
          return {slow,fast,pausedPixelsStable:true,headingIndependent:true,gameplayUnchanged:true};
        }''')
        for name in ['slow','fast']:
            for key in ['image','field']:
                (OUT/f'{name}-{key}.png').write_bytes(base64.b64decode(report[name].pop(key).split(',',1)[1]))
        assert not errors,errors
        report.update(passed=True,live=live,reducedMotionWired=True,turningTrails={k:v for k,v in trail_result.items() if k!='frames'},errors=errors)
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
        browser.close()
finally:server.shutdown();server.server_close()
