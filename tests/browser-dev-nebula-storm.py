"""Actual Dev Sol controls and localized, cloud-masked lightning pixels."""
import base64,functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/dev-nebula-storm';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
PIXELS=r'''()=>{
 const api=nativeDevNebulaStorm,renderer=api.createRenderer(),state={devMode:true,system:1},patch={x:0,y:0,width:900,height:700,angle:0};
 const current={eligible:true,enabled:true,preset:'badlands',patch},view={w:900,h:700,cameraX:0,cameraY:0,zoom:1};
 renderer.frame(state,.01,view,current);renderer.trigger(state,current);renderer.frame(state,.01,view,current);renderer.frame(state,.205,view,current);
 const flash=renderer.snapshot().flashes[0],x=450+flash.x,y=350+flash.y;
 const cloud=document.createElement('canvas');cloud.width=900;cloud.height=700;const c=cloud.getContext('2d');
 c.fillStyle='rgba(125,55,35,.7)';c.fillRect(0,0,900,700);
 // A canonical transparent hull/wake sample must remain empty under lightning.
 c.clearRect(x-15,y-15,30,30);
 const output=document.createElement('canvas');output.width=900;output.height=700;const g=output.getContext('2d',{willReadFrequently:true});
 const drawCloud=ctx=>ctx.drawImage(cloud,0,0);
 const baseline=c.getImageData(0,0,900,700).data;let lit=0,white=0,leaks=0,outside=0,alphaErrors=0;
 for(const pass of ['back','front']){
  g.clearRect(0,0,900,700);renderer.paint(g,pass,drawCloud);
  const rgba=g.getImageData(0,0,900,700).data;
  for(let py=0;py<700;py++)for(let px=0;px<900;px++){
   const i=(py*900+px)*4;if(Math.abs(rgba[i+3]-baseline[i+3])>1)alphaErrors++;
   if(px>x-14&&px<x+14&&py>y-14&&py<y+14&&rgba[i+3])leaks++;
   if(rgba[i+3]<2)continue;
   const changed=Math.max(...[0,1,2].map(k=>Math.abs(rgba[i+k]-baseline[i+k])))>2;
   if(changed){lit++;if(Math.abs(px-x)>flash.radius+2||Math.abs(py-y)>flash.radius+2)outside++;}
   if(Math.min(rgba[i],rgba[i+1],rgba[i+2])>=230&&Math.max(rgba[i],rgba[i+1],rgba[i+2])-Math.min(rgba[i],rgba[i+1],rgba[i+2])<20)white++;
  }
 }
 if(lit<1000||white<500||leaks||outside||alphaErrors)throw Error('Storm material failed '+JSON.stringify({lit,white,leaks,outside,alphaErrors}));
 const image=output.toDataURL();
 const warm=renderer.snapshot().renderer;
 for(let i=0;i<80;i++)renderer.paint(g,'back',drawCloud);
 if(renderer.snapshot().renderer.canvases!==warm.canvases)throw Error('Lightning allocated artwork while painting');
 // Overlapping flashes must not double-paint the original cloud's opacity.
 renderer.trigger(state,current);renderer.trigger(state,current);renderer.frame(state,.01,view,current);
 g.clearRect(0,0,900,700);renderer.paint(g,'back',drawCloud);
 const overlap=g.getImageData(0,0,900,700).data;let overlapAlphaErrors=0;
 for(let i=3;i<overlap.length;i+=4)if(Math.abs(overlap[i]-baseline[i])>1)overlapAlphaErrors++;
 if(overlapAlphaErrors)throw Error('Overlapping lightning changed cloud opacity '+overlapAlphaErrors);
 renderer.setEnabled(false);g.clearRect(0,0,900,700);renderer.paint(g,'back',drawCloud);
 if(g.getImageData(0,0,900,700).data.some((n,i)=>n!==baseline[i]))throw Error('Disabled storm changed the cloud');
 return {lit,white,leaks,outside,alphaErrors,overlapAlphaErrors,canvases:warm.canvases,textureBytes:warm.textureBytes,image};
}'''
report={'passed':False,'errors':[],'failedRequests':[]}
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge')
  browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1366,'height':768},reduced_motion='no-preference')
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.on('response',lambda r:report['failedRequests'].append(r.url) if r.status>=400 else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('startNativeDevGame();nativeDevFog.setEnabled(true)')
  page.wait_for_function('()=>nativeDevFog.material()?.field.ready',timeout=120000)
  page.evaluate('nativeShipMotion.stop(nativeNpcDev.getState())')
  page.locator('#devToolsBtn').click()
  assert page.locator('[data-dev-fog-preset]').input_value()=='badlands'
  assert page.locator('[data-dev-fog-colour]').input_value()=='original'
  assert page.locator('[data-dev-fog-storm-enabled]').is_checked()
  assert page.locator('[data-dev-fog-lightning]').is_enabled()
  page.locator('[data-dev-fog-lightning]').click()
  queued=page.evaluate('nativeDevFog.snapshot().storm');assert queued['pending']==1,queued
  page.wait_for_timeout(150);assert page.evaluate('nativeDevFog.snapshot().storm.clock')==queued['clock']
  page.screenshot(path=str(OUT/'dev-controls.png'))
  page.evaluate('''()=>{window.requestAnimationFrame=callback=>{if(callback.name==='draw')window.__stormDraw=callback;return 0;};}''')
  page.wait_for_function('()=>typeof __stormDraw==="function"',polling=50,timeout=30000)
  page.locator('#dialog [data-close]').click()
  page.evaluate('''()=>{window.__stormTime=performance.now()+60000;nativeSimulationHost.reset(__stormTime);window.__stormStep=(n=1)=>{for(let i=0;i<n;i++){__stormTime+=1000/60;__stormDraw(__stormTime);}};__stormStep(13);}''')
  report['flash']=page.evaluate('nativeDevFog.snapshot().storm')
  assert report['flash']['flashes'] and report['flash']['renderer']['draws']>0,report['flash']
  assert page.evaluate('nativeDevFog.snapshot().patch.width')==2100
  assert page.evaluate('nativeDevFog.snapshot().patch.height')==1600
  page.screenshot(path=str(OUT/'badlands-lightning.png'))
  page.evaluate('__stormStep(100)');page.screenshot(path=str(OUT/'badlands-cloud.png'))
  # Storm toggling preserves the actual material field, density and wake owner.
  page.evaluate('''()=>{window.__stormField=nativeDevFog.material().field;window.__stormFieldClock=__stormField.clock;}''')
  page.locator('#devToolsBtn').click();page.locator('[data-dev-fog-storm-enabled]').uncheck()
  assert page.locator('[data-dev-fog-lightning]').is_disabled()
  assert page.evaluate('nativeDevFog.material().field===__stormField&&__stormField.clock===__stormFieldClock')
  assert page.evaluate('nativeDevFog.snapshot().storm.flashes.length')==0
  page.locator('[data-dev-fog-storm-enabled]').check();page.locator('#dialog [data-close]').click()
  page.evaluate('__stormStep(180)')
  report['auto']=page.evaluate('nativeDevFog.snapshot().storm');assert report['auto']['emitted']>1,report['auto']
  page.keyboard.press('Escape');paused=page.evaluate('nativeDevFog.snapshot().storm.clock');page.evaluate('__stormStep(30)')
  assert page.evaluate('nativeDevFog.snapshot().storm.clock')==paused
  page.keyboard.press('Escape');page.emulate_media(reduced_motion='reduce');page.evaluate('__stormStep(2)')
  assert not page.evaluate('nativeDevFog.snapshot().storm.visible')
  page.emulate_media(reduced_motion='no-preference');page.evaluate('__stormStep(2)')
  pixels=page.evaluate(PIXELS);(OUT/'masked-lightning.png').write_bytes(base64.b64decode(pixels.pop('image').split(',')[1]));report['pixels']=pixels
  before=page.evaluate('''()=>{const s=nativeNpcDev.getState();return {x:s.x,y:s.y,patch:nativeDevFog.snapshot().patch};}''')
  page.locator('#space').focus();page.keyboard.down('w');page.evaluate('__stormStep(40)');page.keyboard.down('d');page.evaluate('__stormStep(20)');page.keyboard.up('w');page.keyboard.up('d')
  flight=page.evaluate('''()=>{const s=nativeNpcDev.getState(),f=nativeDevFog.snapshot();return {x:s.x,y:s.y,patch:f.patch,ships:f.shipCount,missingMasks:f.missingMasks,population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1};}''')
  assert abs(flight['x']-before['x'])+abs(flight['y']-before['y'])>10,flight
  assert flight['patch']==before['patch'] and flight['ships']>=1 and not flight['missingMasks'],flight
  report['flight']=flight;page.screenshot(path=str(OUT/'flying-through-storm.png'))
  assert not report['errors'],report['errors'];assert not report['failedRequests'],report['failedRequests']
  report.update(passed=True,defaultBadlands=True,queuedWhileMenuPaused=True,fieldPreservedOnToggle=True,pauseFrozen=True,reducedMotionRespected=True)
  browser.close()
finally:
 (OUT/'functional.json').write_text(json.dumps(report,indent=2),encoding='utf8');server.shutdown();server.server_close()
print(json.dumps(report))
