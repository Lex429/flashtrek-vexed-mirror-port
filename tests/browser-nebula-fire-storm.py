"""Local Dev fire/sheet controls, real material pixels, masks and GPU recovery."""
import argparse,base64,functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/plasma-fire-storm/browser';OUT.mkdir(parents=True,exist_ok=True)
report={'passed':False,'errors':[],'failedRequests':[]}
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--serve',action='store_true',help='Serve the checkout at the isolated Dev origin for CI');args=parser.parse_args()
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_args):pass
server=None
if args.serve:
 server=http.server.ThreadingHTTPServer(('127.0.0.1',7790),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1280,'height':800},reduced_motion='no-preference')
  page.add_init_script("Object.defineProperty(navigator,'getGamepads',{value:()=>[]});")
  page.add_init_script('''{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){const c=get.call(this,kind,...args);if(kind==='webgl2'&&this.dataset.nebulaMaterial)window.__fireGL=c;return c;};}''')
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.on('response',lambda r:report['failedRequests'].append(r.url) if r.status>=400 else None)
  page.goto('http://127.0.0.1:7790/html-games/broken-mirror-port/index.html?devTraffic=off')
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('''()=>{const api=nativeNebulaMaterial;window.__fireOwner=api;window.nativeNebulaMaterial=Object.create(api,{renderPair:{value:function(...args){const o=args[4];if(o?.fireFronts?.length)window.__fireLive=args;
   if(o?.sheetFlashes?.some(e=>e.strength>.7)&&(!window.__sheetLive||Math.max(...o.sheetFlashes.map(e=>e.strength))>__sheetLive.strength))window.__sheetLive={args:[...args.slice(0,4),{...o,fireFronts:o.fireFronts.map(e=>({...e})),sheetFlashes:o.sheetFlashes.map(e=>({...e}))}],strength:Math.max(...o.sheetFlashes.map(e=>e.strength))};return api.renderPair(...args);}}});startNativeDevGame();nativeDevFog.setEnabled(true);}''')
  page.wait_for_function('()=>nativeDevFog.material()?.field.ready&&nativeNebulaFire.volume',timeout=120000)
  assert page.evaluate('nativeDevTraffic.active(nativeNpcDev.getState())')
  page.locator('#devToolsBtn').click()
  assert page.locator('[data-dev-fog-fire-enabled]').is_checked()
  page.evaluate('window.__fireField=nativeDevFog.material().field')
  page.locator('[data-dev-fog-fire-enabled]').uncheck();page.locator('[data-dev-fog-fire-enabled]').check()
  page.locator('[data-dev-fog-storm-enabled]').uncheck();page.locator('[data-dev-fog-storm-enabled]').check()
  page.locator('[data-dev-fog-fire]').click();page.locator('[data-dev-fog-sheet]').click()
  queued=page.evaluate('()=>({fire:nativeDevFog.snapshot().fire,storm:nativeDevFog.snapshot().storm})')
  assert queued['fire']['pending']==1 and queued['storm']['pending']==1,queued
  page.wait_for_timeout(150)
  assert page.evaluate('nativeDevFog.snapshot().fire.clock')==queued['fire']['clock']
  assert page.evaluate('nativeDevFog.snapshot().storm.clock')==queued['storm']['clock']
  assert page.evaluate('nativeDevFog.material().field===__fireField')
  page.locator('#dialog [data-close]').click()
  page.wait_for_function('()=>window.__sheetLive&&nativeDevFog.snapshot().fire.fronts.some(e=>e.intensity>.7)',timeout=30000)
  page.screenshot(path=str(OUT/'live-fire.png'))
  report['live']=page.evaluate('''()=>{const [view,source,field,bodies,o]=__sheetLive.args,c=Object.assign(document.createElement('canvas'),{width:view.w,height:view.h}),g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,c.width,c.height);g.globalCompositeOperation='screen';const pair=__fireOwner.renderPair(view,source,field,bodies,o);pair.paint(g,'back');pair.paint(g,'front');return {image:c.toDataURL(),sheetStrength:__sheetLive.strength,fire:nativeDevFog.snapshot().fire,physical:nativeShipSystems.collectShips(nativeNpcDev.getState()).length};}''')
  (OUT/'live-sheet.png').write_bytes(base64.b64decode(report['live'].pop('image').split(',')[1]))
  page.locator('#space').focus();before=page.evaluate('()=>({x:nativeNpcDev.getState().x,y:nativeNpcDev.getState().y})');page.keyboard.down('w');page.wait_for_timeout(500);page.keyboard.up('w')
  assert page.evaluate('p=>Math.hypot(nativeNpcDev.getState().x-p.x,nativeNpcDev.getState().y-p.y)>1',before)
  page.keyboard.press('Escape');page.wait_for_function('()=>nativePause.active')
  # Drain the admitted active tail; renderer diagnostic counters can still grow
  # when the same frozen weather is repainted behind the pause panel.
  page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  # Finish gas-worker jobs admitted before Pause before taking the frozen
  # snapshot; their asynchronous publication is not a new weather step.
  page.evaluate('()=>nativeDevFog.material().field.flush()')
  pause_read='''()=>{const f=nativeDevFog.snapshot().fire,s=nativeDevFog.snapshot().storm;return JSON.stringify({fireClock:f.clock,fronts:f.fronts,stormClock:s.clock,flashes:s.flashes,field:nativeDevFog.material().field.revision});}'''
  paused=page.evaluate(pause_read);page.wait_for_timeout(150);after=page.evaluate(pause_read);assert after==paused,{'before':json.loads(paused),'after':json.loads(after)}
  page.evaluate('''()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==='draw'?0:raf(fn);}''')
  page.wait_for_timeout(100)
  report['pixels']=page.evaluate('''()=>{
   const api=__fireOwner,view={w:640,h:480,cameraX:0,cameraY:0,zoom:1},source=Object.assign(document.createElement('canvas'),{width:640,height:480}),sg=source.getContext('2d');sg.fillStyle='rgba(125,55,35,.7)';sg.fillRect(0,0,640,480);
   const field=api.createField({minX:-320,minY:-240,width:640,height:480,cell:3,uniform:.7});
   for(let y=0;y<22;y++)for(let x=0;x<27;x++)field.density[y*field.w+x]=0;
   const front={id:'fire-pixels',x:0,y:0,halfWidth:190,halfHeight:124,angle:.2,phase:.7,born:0,duration:15},sheet={x:20,y:-5,halfWidth:235,halfHeight:155,c:Math.cos(.3),s:Math.sin(.3),strength:.98};
   const mask=api.maskForType(438),pose={x:45,y:0,heading:.3,width:52,height:83},bodies=[{id:'player',pose,mask}],output=Object.assign(document.createElement('canvas'),{width:640,height:480}),g=output.getContext('2d',{willReadFrequently:true});
   function read(fires=[],sheets=[],time=4,plate=source){g.clearRect(0,0,640,480);const p=api.renderPair(view,plate,field,bodies,{worldSource:true,direct:true,fireFronts:fires,fireTime:time,sheetFlashes:sheets});if(p.paint){p.paint(g,'back');p.paint(g,'front');}else{g.drawImage(p.back,0,0,640,480);g.drawImage(p.front,0,0,640,480);}return new Uint8ClampedArray(g.getImageData(0,0,640,480).data);}
   const gameBefore=JSON.stringify(nativeNpcDev.getState()),mass=field.metrics(true).mass,baseline=read(),fire=read([front]),fireImage=output.toDataURL(),later=read([front],[],5),lit=read([],[sheet]),sheetImage=output.toDataURL(),combined=read([front],[sheet]);
   let firePixels=0,animated=0,broadLit=0,white=0,alphaErrors=0,outside=0,emptyLeaks=0,broadHeat=0,darkFolds=0;
   for(let y=0;y<480;y++)for(let x=0;x<640;x++){const i=(y*640+x)*4,wx=x+.5-320,wy=y+.5-240;
    const fireDiff=Math.max(...[0,1,2].map(c=>Math.abs(fire[i+c]-baseline[i+c])));
    if(fireDiff>8){firePixels++;if(Math.abs(-wx*Math.sin(front.angle)+wy*Math.cos(front.angle))>66)broadHeat++;}
    if(baseline[i]-fire[i]>5&&baseline[i+3]>80)darkFolds++;
    if(Math.max(...[0,1,2].map(c=>Math.abs(fire[i+c]-later[i+c])))>8)animated++;
    const diff=Math.max(...[0,1,2].map(c=>Math.abs(lit[i+c]-baseline[i+c])));
    if(diff>10&&Math.hypot(wx-sheet.x,wy-sheet.y)>160)broadLit++;
    if(Math.min(lit[i],lit[i+1],lit[i+2])>230)white++;
    if(Math.abs(lit[i+3]-baseline[i+3])>1||Math.abs(combined[i+3]-fire[i+3])>1)alphaErrors++;
    const dx=wx-sheet.x,dy=wy-sheet.y,qx=(dx*sheet.c+dy*sheet.s)/sheet.halfWidth,qy=(-dx*sheet.s+dy*sheet.c)/sheet.halfHeight;if(qx*qx+qy*qy>1.03&&diff>2)outside++;
    if(x>8&&x<65&&y>8&&y<50&&combined[i+3]>1)emptyLeaks++;
   }
   let hullSamples=0,hullLeaks=0;for(let y=3;y<mask.h-3;y+=4)for(let x=3;x<mask.w-3;x+=4){const j=y*mask.w+x;if([j,j-3,j+3,j-mask.w*3,j+mask.w*3].some(k=>mask.alpha[k]<250))continue;
    const lx=((x+.5)/mask.w-.5)*pose.width,ly=(.5-(y+.5)/mask.h)*pose.height,c=Math.cos(pose.heading),s=Math.sin(pose.heading),px=Math.floor(320+pose.x+c*ly-s*lx),py=Math.floor(240+pose.y+s*ly+c*lx);hullSamples++;if(combined[(py*640+px)*4+3]>2)hullLeaks++;
   }
   if(firePixels<1000||animated<500||broadHeat<2000||darkFolds<200||broadLit<3000||white<1000||alphaErrors||outside||emptyLeaks||hullLeaks||hullSamples<10)throw Error('Plasma/sheet material failed '+JSON.stringify({firePixels,animated,broadHeat,darkFolds,broadLit,white,alphaErrors,outside,emptyLeaks,hullSamples,hullLeaks}));
   const blue=Object.assign(document.createElement('canvas'),{width:640,height:480}),bg=blue.getContext('2d');bg.fillStyle='rgba(20,30,100,.7)';bg.fillRect(0,0,640,480);
   const blueBase=read([],[],4,blue),blueHot=read([front],[],4,blue);let changedBlue=0,retainedBlue=0;
   for(let i=0;i<blueHot.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(blueHot[i+c]-blueBase[i+c])))>5){changedBlue++;if(blueHot[i+2]>blueHot[i]*2)retainedBlue++;}
   if(changedBlue<1000||retainedBlue<changedBlue*.9)throw Error('Plasma replaced the underlying gas colour '+JSON.stringify({changedBlue,retainedBlue}));
   const uploads=api.metrics().fireUploads;for(let i=0;i<20;i++)read([front],[sheet]);if(api.metrics().fireUploads!==uploads)throw Error('Fire attributes reuploaded while drawing');
   const off=read();if(off.some((v,i)=>v!==baseline[i]))throw Error('Disabled effects changed the ordinary cloud');
   if(field.metrics(true).mass!==mass||JSON.stringify(nativeNpcDev.getState())!==gameBefore)throw Error('Rendering changed physical state');
   window.__fireFixture={view,source,field,bodies,front,sheet,combined,read};return {firePixels,animated,broadHeat,darkFolds,changedBlue,retainedBlue,broadLit,white,alphaErrors,outside,emptyLeaks,hullSamples,hullLeaks,fireUploads:uploads,fireTextureBytes:api.metrics().fireTextureBytes,fireImage,sheetImage};
  }''')
  for key,name in [('fireImage','fire-detail.png'),('sheetImage','sheet-detail.png')]:
   (OUT/name).write_bytes(base64.b64decode(report['pixels'].pop(key).split(',')[1]))
  page.evaluate("window.__fireLoss=__fireGL.getExtension('WEBGL_lose_context');__fireLoss.loseContext()")
  page.wait_for_function('()=>__fireOwner.metrics().contextLost')
  report['fallback']=page.evaluate('''()=>{const f=__fireFixture,a=f.read([f.front],[f.sheet]),points=[];for(let y=110;y<370;y+=13)for(let x=100;x<540;x+=13){const i=(y*640+x)*4;if(f.combined[i+3]<60)continue;points.push(Math.max(...[0,1,2,3].map(c=>Math.abs(a[i+c]-f.combined[i+c]))));}const average=points.reduce((a,b)=>a+b,0)/points.length;if(average>3)throw Error('Fire Canvas fallback diverged '+average);return {backend:__fireOwner.metrics().backend,samples:points.length,averageDifference:average};}''')
  page.evaluate('__fireLoss.restoreContext()');page.wait_for_function('()=>!__fireOwner.metrics().contextLost');page.evaluate('__fireOwner.prepare()')
  report['recovery']=page.evaluate('''()=>{const f=__fireFixture,a=f.read([f.front],[f.sheet]);let error=0;for(let i=0;i<a.length;i++)error=Math.max(error,Math.abs(a[i]-f.combined[i]));if(error>1)throw Error('Recovered fire material changed '+error);return {maximumDifference:error,fireUploads:__fireOwner.metrics().fireUploads};}''')
  assert not report['errors'] and not report['failedRequests'],report
  report.update(passed=True,defaultsEnabled=True,realControls=True,queueWaitsForFlight=True,pauseFrozen=True,fieldPreserved=True,flightWorks=True)
  browser.close()
finally:
 (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
 if server:server.shutdown();server.server_close()
print(json.dumps(report))
