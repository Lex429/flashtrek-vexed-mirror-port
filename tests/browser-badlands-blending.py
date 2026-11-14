"""Pixel checks for world colors, weighted tile seams and real uninterrupted flight."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/badlands-blending';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];failed=[];report={}
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850})
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeNebulaMaterial&&document.querySelector("#startup").hidden',timeout=120000)
  report['pixels']=page.evaluate('''()=>{
   const api=nativeNebulaMaterial,v={w:640,h:480,cameraX:65000,cameraY:700,zoom:1},o={...nativeBadlands.opticalProfile,x:0,y:0},source=document.createElement('canvas');source.width=640;source.height=480;const g=source.getContext('2d');g.fillStyle='#b86732';g.fillRect(0,0,640,480);
   const full=api.createField({minX:62000,minY:-1400,width:6000,height:4200,cell:3,uniform:.7}),ref=api.renderPair(v,source,full,[],{badlands:o,sourceVersion:1});
   const reference=[ref.back,ref.front].map(c=>Uint8Array.from(c.getContext('2d').getImageData(0,0,640,480).data));
   const rows=[0,1,2,3].map(i=>{const x=64000+i%2*2000,y=Math.floor(i/2)*1400;return {field:api.createField({minX:x-1080,minY:y-780,width:2160,height:1560,cell:3,uniform:.7}),tile:{x,y,halfWidth:1000,halfHeight:700,feather:64}};});
   if(!api.beginBatch(v))throw Error('GPU tile blending unavailable');for(const r of rows)api.renderPair(v,source,r.field,[],{badlands:o,tile:r.tile,direct:true,sourceVersion:1});const pair=api.endBatch();
   let maximum=0,total=0,rawMaximum=0,alphaMaximum=0;for(let layer=0;layer<2;layer++){const c=document.createElement('canvas');c.width=640;c.height=480;pair.paint(c.getContext('2d'),layer?'front':'back');const actual=c.getContext('2d').getImageData(0,0,640,480).data;for(let i=0;i<actual.length;i++){const channel=i%4,a=actual[i-channel+3]/255,b=reference[layer][i-channel+3]/255,raw=Math.abs(actual[i]-reference[layer][i]),d=channel===3?raw:Math.abs(actual[i]*a-reference[layer][i]*b);maximum=Math.max(maximum,d);rawMaximum=Math.max(rawMaximum,raw);if(channel===3)alphaMaximum=Math.max(alphaMaximum,raw);total+=d;}}
   if(maximum>3)throw Error('A tile join differs from the continuous reference: '+JSON.stringify({maximum,rawMaximum,alphaMaximum}));
   const colors=[];for(const d of [.99,1.04,1.08,1.12]){const radius=d<=1?d:1+(d-1)*nativeBadlands.fringeWidth(0),view={...v,cameraX:radius*64000,cameraY:0},field=api.createField({minX:view.cameraX-1000,minY:-800,width:2000,height:1600,cell:3,uniform:.7}),layers=api.renderPair(view,source,field,[],{badlands:o,sourceVersion:1}),pixels=layers.back.getContext('2d').getImageData(304,224,32,32).data,mean=[0,0,0];for(let i=0;i<pixels.length;i+=4)for(let k=0;k<3;k++)mean[k]+=pixels[i+k]/1024;colors.push(mean);api.release(field);}
   if(!(colors[0][0]>colors[0][2]*1.5&&Math.max(colors[3][1],colors[3][2])>colors[3][0]*1.15))throw Error('The approach is still orange: '+JSON.stringify(colors));
   for(const r of rows)api.release(r.field);api.release(full);return {maximum,rawMaximum,alphaMaximum,average:total/(640*480*4*2),colors};
  }''')
  page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200&&nativeCombatShots.isReady()',timeout=120000)
  page.evaluate('''()=>{const s=nativeNpcDev.getState();nativeGalaxyFog.dispose();nativeShipMotion.stop(s);Object.assign(s,{system:73,x:66600,y:600,angle:Math.PI,localBody:0,localBodySystem:73,localNavTarget:0,manualTargetSystem:0,localCruise:null,arrivalApproach:null,landed:false});s.shipSimulation.seconds=160;nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);nativeSimulationHost.reset(performance.now());}''')
  page.wait_for_function('()=>nativeGalaxyFog.materials().some(m=>m.field.ready)',timeout=60000);page.wait_for_timeout(300);page.screenshot(path=str(OUT/'colored-approach.png'))
  report['flight']=[];page.locator('#space').focus();page.keyboard.down('w')
  try:
   for n in range(12):
    page.wait_for_timeout(1000)
    row=page.evaluate('''()=>{const s=nativeNpcDev.getState(),p=vexedSolFlight.shipPosition(s);const v=nativeGalaxyFog.snapshot().view,c=document.createElement('canvas');c.width=Math.ceil(v.w);c.height=Math.ceil(v.h);const g=c.getContext('2d');nativeGalaxyFog.paint(g,'back');nativeGalaxyFog.paint(g,'front');const pixels=g.getImageData(0,0,c.width,c.height).data,seams=[];const average=(axis,at)=>{let total=0,count=0;for(let k=12;k<(axis==='x'?c.height:c.width)-12;k+=3){const x=axis==='x'?Math.round(at):k,y=axis==='y'?Math.round(at):k;if(Math.hypot(x-v.w/2,y-v.h/2)<70*(v.zoom||1))continue;const a=((y-(axis==='y'?1:0))*c.width+x-(axis==='x'?1:0))*4,b=((y+(axis==='y'?1:0))*c.width+x+(axis==='x'?1:0))*4;for(let j=0;j<4;j++){total+=j===3?Math.abs(pixels[a+j]-pixels[b+j]):Math.abs(pixels[a+j]*pixels[a+3]/255-pixels[b+j]*pixels[b+3]/255);count++;}}return total/Math.max(1,count);};for(const [axis,pitch,half] of [['x',2000,1000],['y',1400,700]]){const camera=axis==='x'?v.cameraX:v.cameraY,extent=(axis==='x'?v.w:v.h)/2,z=v.zoom||1;for(let n=Math.floor((camera-extent/z-half)/pitch);n<=Math.ceil((camera+extent/z-half)/pitch);n++){const at=extent+(n*pitch+half-camera)*z;if(at<40||at>(axis==='x'?v.w:v.h)-40)continue;const jump=average(axis,at),near=(average(axis,at-20)+average(axis,at+20))/2;seams.push({axis,at,jump,near});}}return {x:p.x,y:p.y,clock:s.shipSimulation.seconds,view:v,seams,cores:nativeGalaxyFog.materials().map(m=>({id:m.id,ready:m.field.ready,mass:m.field.metrics(true)}))};}''');report['flight'].append(row)
    if n in [3,7,11]:page.screenshot(path=str(OUT/f'crossing-{n}.png'))
  finally:page.keyboard.up('w')
  positions=[r['x'] for r in report['flight']];assert max(positions)-min(positions)>2200,positions
  for row in report['flight']:
   for seam in row['seams']:assert seam['jump']<max(3,seam['near']*3+.5),seam
   for c in row['cores']:
    m=c['mass'];
    if not c['ready']:continue
    assert abs(m['mass']-m['initialMass'])/max(1,m['initialMass'])<.0001,m
  fallback=browser.new_page()
  fallback.add_init_script("""(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2'&&this.dataset.nebulaMaterial==='persistent')return null;return original.call(this,type,...args);};})()""")
  fallback.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');fallback.wait_for_function('()=>nativeNebulaMaterial&&nativeBadlands&&document.querySelector("#startup").hidden',timeout=120000)
  report['fallback']=fallback.evaluate("""()=>{
   const api=nativeNebulaMaterial,v={w:128,h:96,cameraX:65000,cameraY:700,zoom:1},o={...nativeBadlands.opticalProfile,x:0,y:0},source=document.createElement('canvas');source.width=128;source.height=96;const g=source.getContext('2d');g.fillStyle='#b86732';g.fillRect(0,0,128,96);
   const full=api.createField({minX:62000,minY:-1400,width:6000,height:4200,cell:12,uniform:.7}),reference=api.renderPair(v,source,full,[],{badlands:o});const pixels=[reference.back,reference.front].map(c=>Uint8Array.from(c.getContext('2d').getImageData(0,0,128,96).data));
   const outputs=[document.createElement('canvas'),document.createElement('canvas')];for(const c of outputs){c.width=128;c.height=96;}
   for(let i=0;i<4;i++){const x=64000+i%2*2000,y=Math.floor(i/2)*1400,field=api.createField({minX:x-1080,minY:y-780,width:2160,height:1560,cell:12,uniform:.7}),pair=api.renderPair(v,source,field,[],{badlands:o,tile:{x,y,halfWidth:1000,halfHeight:700,feather:64}});for(let j=0;j<2;j++){const ctx=outputs[j].getContext('2d');ctx.globalCompositeOperation='lighter';ctx.drawImage(j?pair.front:pair.back,0,0);}}
   let maximum=0;for(let j=0;j<2;j++){const actual=outputs[j].getContext('2d').getImageData(0,0,128,96).data,b=pixels[j];for(let i=0;i<actual.length;i++){const channel=i%4,delta=channel===3?Math.abs(actual[i]-b[i]):Math.abs(actual[i]*actual[i-channel+3]/255-b[i]*b[i-channel+3]/255);maximum=Math.max(maximum,delta);}}
   if(maximum>4||api.metrics().backend!=='canvas-material')throw Error('Canvas fallback lost the tile blend '+maximum);return {maximum,backend:api.metrics().backend};
  }""")
  fallback.close()
  assert not errors and not failed,(errors,failed)
  report.update(passed=True,errors=errors,failed=failed);(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps({'passed':True,'pixels':report['pixels'],'distance':max(positions)-min(positions),'seamChecks':sum(len(r['seams']) for r in report['flight'])}));browser.close()
finally:server.shutdown();server.server_close()
