"""Real current drift, counter-thrust, pause/save and shared gas rendering."""
import argparse
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/badlands-currents/browser'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serve', action='store_true')
args = parser.parse_args()
report = dict(passed=False, errors=[], failedRequests=[])


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = None
if args.serve:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 7790), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport=dict(width=1280, height=800), reduced_motion='no-preference')
        page.add_init_script("Object.defineProperty(navigator,'getGamepads',{value:()=>[]});")
        page.add_init_script('''{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){const c=get.call(this,kind,...args);if(kind==='webgl2'&&this.dataset.nebulaMaterial)window.__currentGL=c;return c;};}''')
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.on('response', lambda r: report['failedRequests'].append(r.url) if r.status >= 400 else None)
        page.goto('http://127.0.0.1:7790/html-games/broken-mirror-port/index.html?devTraffic=off')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('''()=>{const api=nativeNebulaMaterial;window.__currentApi=api;window.nativeNebulaMaterial=Object.create(api,{renderPair:{value:function(...args){if(args[4]?.current)window.__currentLive=args;return api.renderPair(...args);}}});startNativeDevGame();nativeDevFog.setEnabled(true);}''')
        page.wait_for_function('()=>nativeDevFog.material()?.field.ready&&window.__currentLive', timeout=120000)
        assert page.evaluate('nativeDevTraffic.active(nativeNpcDev.getState())')
        page.locator('#devToolsBtn').click()
        assert page.locator('[data-dev-fog-currents]').is_checked()
        page.locator('[data-dev-fog-vortices]').uncheck()
        page.locator('[data-dev-fog-storm-enabled]').uncheck()
        page.locator('[data-dev-fog-fire-enabled]').uncheck()
        page.locator('#dialog [data-close]').click()
        before = page.evaluate('''()=>{const s=nativeNpcDev.getState();nativeShipMotion.stop(s);window.__driftStart={x:s.x,y:s.y,seconds:nativeSimulation.seconds(s)};return __driftStart;}''')
        page.wait_for_function('()=>{const s=nativeNpcDev.getState();return nativeSimulation.seconds(s)-__driftStart.seconds>2&&Math.hypot(s.x-__driftStart.x,s.y-__driftStart.y)>8;}', timeout=15000)
        report['drift'] = page.evaluate('''()=>{const s=nativeNpcDev.getState();return {x:s.x,y:s.y,speed:s.speed,flow:s.motionFlow,current:nativeBadlandsCurrents.sample(s,nativeShipDefinitions.describe(s,s,{category:'player'}))};}''')
        assert report['drift']['flow'] and report['drift']['speed'] > 2
        page.screenshot(path=str(OUT / 'carried-by-current.png'))
        page.keyboard.press('Escape')
        page.wait_for_function('()=>nativePause.active')
        page.evaluate('()=>nativeDevFog.material().field.flush?.()')
        frozen = page.evaluate('''()=>{const s=nativeNpcDev.getState();return JSON.stringify({x:s.x,y:s.y,angle:s.angle,flow:s.motionFlow,seconds:nativeSimulation.seconds(s)});}''')
        page.wait_for_timeout(150)
        assert page.evaluate('''()=>{const s=nativeNpcDev.getState();return JSON.stringify({x:s.x,y:s.y,angle:s.angle,flow:s.motionFlow,seconds:nativeSimulation.seconds(s)});}''') == frozen
        report['save'] = page.evaluate('''()=>{const s=nativeNpcDev.getState(),before=JSON.stringify(s.motionFlow),seconds=nativeSimulation.seconds(s),saved=nativeSaveStorage.write(s);if(!saved.ok)throw Error(saved.error);resumeNativeGame('dev');const next=nativeNpcDev.getState();if(JSON.stringify(next.motionFlow)!==before||nativeSimulation.seconds(next)!==seconds)throw Error('Current momentum/clock changed on continue');return {momentumPreserved:true,clockPreserved:true};}''')
        page.wait_for_function('()=>nativeDevFog.material()?.field.ready', timeout=120000)
        page.evaluate('''()=>{const s=nativeNpcDev.getState(),flow=nativeBadlandsCurrents.sample(s,nativeShipDefinitions.describe(s,s,{category:'player'}));nativeShipMotion.stop(s);s.angle=Math.atan2(-flow.vy,-flow.vx);window.__against={x:s.x,y:s.y,c:Math.cos(s.angle),s:Math.sin(s.angle)};}''')
        page.locator('#space').focus()
        page.keyboard.down('w')
        page.wait_for_timeout(650)
        page.keyboard.up('w')
        report['counterThrust'] = page.evaluate('''()=>{const s=nativeNpcDev.getState();return {distance:(s.x-__against.x)*__against.c+(s.y-__against.y)*__against.s,angle:s.angle};}''')
        assert report['counterThrust']['distance'] > 2, report['counterThrust']
        page.keyboard.down('d')
        page.wait_for_timeout(400)
        page.keyboard.up('d')
        assert page.evaluate('a=>Math.abs(nativeNpcDev.getState().angle-a)>.1', report['counterThrust']['angle'])
        page.keyboard.press('Escape')
        page.wait_for_function('()=>nativePause.active')
        page.evaluate('()=>nativeDevFog.material().field.flush?.()')
        page.evaluate('''()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==='draw'?0:raf(fn);}''')
        page.wait_for_timeout(100)
        report['pixels'] = page.evaluate('''()=>{
          const api=__currentApi,[,source,liveField,,options]=__currentLive,current=options.current;
          const view={w:640,h:480,cameraX:0,cameraY:0,zoom:1},field=api.createField({minX:liveField.minX,minY:liveField.minY,width:liveField.width,height:liveField.height,cell:6,uniform:.7});
          const mask=api.maskForType(438),pose={x:50,y:30,heading:.4,width:52,height:83},bodies=[{id:'player',pose,mask}],out=Object.assign(document.createElement('canvas'),{width:640,height:480}),g=out.getContext('2d',{willReadFrequently:true});
          function read(current,time=4){g.clearRect(0,0,640,480);const pair=api.renderPair(view,source,field,bodies,{worldSource:true,direct:true,current,currentTime:time});if(pair.paint){pair.paint(g,'back');pair.paint(g,'front');}else{g.drawImage(pair.back,0,0,640,480);g.drawImage(pair.front,0,0,640,480);}return new Uint8ClampedArray(g.getImageData(0,0,640,480).data);}
          const baseline=read(null),active=read(current),image=out.toDataURL(),later=read(current,10);let changed=0,animated=0,alphaErrors=0,hullSamples=0,hullLeaks=0;
          for(let i=0;i<active.length;i+=4){if(Math.max(...[0,1,2].map(c=>Math.abs(active[i+c]-baseline[i+c])))>2)changed++;if(Math.max(...[0,1,2].map(c=>Math.abs(active[i+c]-later[i+c])))>2)animated++;if(Math.abs(active[i+3]-baseline[i+3])>1)alphaErrors++;}
          for(let y=3;y<mask.h-3;y+=4)for(let x=3;x<mask.w-3;x+=4){const j=y*mask.w+x;if([j,j-3,j+3,j-mask.w*3,j+mask.w*3].some(k=>mask.alpha[k]<250))continue;const lx=((x+.5)/mask.w-.5)*pose.width,ly=(.5-(y+.5)/mask.h)*pose.height,c=Math.cos(pose.heading),s=Math.sin(pose.heading),px=Math.floor(320+pose.x+c*ly-s*lx),py=Math.floor(240+pose.y+s*ly+c*lx);hullSamples++;if(active[(py*640+px)*4+3]>2)hullLeaks++;}
          if(changed<1000||animated<1000||alphaErrors||hullLeaks||hullSamples<500)throw Error('Current gas presentation failed '+JSON.stringify({changed,animated,alphaErrors,hullSamples,hullLeaks}));
          window.__currentFixture={current,read,active};return {changed,animated,alphaErrors,hullSamples,hullLeaks,image};
        }''')
        (OUT / 'moving-plasma.png').write_bytes(base64.b64decode(report['pixels'].pop('image').split(',')[1]))
        report['worker'] = page.evaluate('''async()=>{
          const api=__currentApi,current=__currentFixture.current,config={minX:-100,minY:-100,width:200,height:200,cell:4,uniform:.7},sync=api.createField(config),runtime=api.createRuntimeField(config),mask=api.maskForType(438),pose={x:-40,y:0,heading:0,width:25,height:40};
          const seed=new Uint8ClampedArray([0,0,0,128]);sync.seed(seed,1,1);runtime.seed(seed,1,1);
          for(let i=0;i<50;i++){pose.x+=1;const bodies=[{id:'player',mask,pose:{...pose}}],o={current,currentTime:i/60};sync.updateMany(bodies,1/60,o);runtime.updateMany(bodies,1/60,o);}
          await runtime.flush();let maximum=0;for(let i=0;i<sync.density.length;i++)maximum=Math.max(maximum,Math.abs(sync.density[i]-runtime.density[i]));const m=runtime.metrics();runtime.dispose();if(maximum>1e-5||m.currentCells<100||m.transport!=='worker'||!m.workerReady||m.failure)throw Error('Current worker mismatch '+JSON.stringify({maximum,m}));return {maximum,currentCells:m.currentCells,clock:m.clock,transport:m.transport};
        }''')
        page.evaluate("window.__currentLoss=__currentGL.getExtension('WEBGL_lose_context');__currentLoss.loseContext()")
        page.wait_for_function('()=>__currentApi.metrics().contextLost')
        report['fallback'] = page.evaluate('''()=>{const f=__currentFixture,a=f.read(f.current),errors=[];for(let y=50;y<430;y+=11)for(let x=60;x<580;x+=11){const i=(y*640+x)*4;if(f.active[i+3]<40)continue;errors.push(Math.max(...[0,1,2,3].map(c=>Math.abs(a[i+c]-f.active[i+c]))));}const average=errors.reduce((a,b)=>a+b,0)/errors.length;if(average>5)throw Error('Current Canvas fallback disagrees '+average);return {samples:errors.length,average};}''')
        page.evaluate('__currentLoss.restoreContext()')
        page.wait_for_function('()=>!__currentApi.metrics().contextLost')
        page.evaluate('__currentApi.prepare()')
        report['recovery'] = page.evaluate('''()=>{const f=__currentFixture,a=f.read(f.current);let maximum=0;for(let i=0;i<a.length;i++)maximum=Math.max(maximum,Math.abs(a[i]-f.active[i]));if(maximum>1)throw Error('Current GPU recovery changed '+maximum);return {maximum};}''')
        assert not report['errors'] and not report['failedRequests'], report
        report.update(passed=True,realCounterThrust=True,realSteering=True,pauseFrozen=True,defaultEnabled=True)
        browser.close()
finally:
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    if server:
        server.shutdown()
        server.server_close()
print(json.dumps(report))
