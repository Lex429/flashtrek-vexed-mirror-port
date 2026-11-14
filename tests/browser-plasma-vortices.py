"""Real-key entry, shared heat/force response, pause and saved ejection momentum."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/plasma-vortices';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
report={'passed':False,'errors':[],'failedRequests':[]}
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1366,'height':850},reduced_motion='no-preference')
  page.add_init_script("Object.defineProperty(navigator,'getGamepads',{value:()=>[]});")
  page.add_init_script('''{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){const ctx=original.call(this,kind,...args);if(kind==='webgl2'&&this.dataset.nebulaMaterial==='persistent')window.__plasmaGL=ctx;return ctx;};}''')
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.on('response',lambda r:report['failedRequests'].append(r.url) if r.status>=400 else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  # Keep this fixed vortex encounter independent of ambient current drift.
  # The current suite and canonical combined-force regression cover coexistence.
  page.evaluate('nativeBadlandsCurrents?.setEnabled(false)')
  page.locator('[data-menu="dev"]').click()
  page.evaluate('nativeDevFog.setEnabled(true)')
  page.wait_for_function('()=>nativeDevFog.material()?.field.ready&&nativeDevFog.snapshot().renderer.mode==="shared-material"&&(nativeDevFog.material().field.metrics().vortexSteps||0)>0',timeout=120000)
  page.wait_for_function('()=>nativePlasmaVortices.volume')
  page.evaluate('''()=>{
   window.__plasmaRows=[];const systems=nativeShipSystems;
   window.__plasmaMaterialOwner=nativeNebulaMaterial;window.nativeNebulaMaterial=Object.create(__plasmaMaterialOwner,{renderPair:{value:function(...args){if(args[4]?.vortices?.length)window.__plasmaLive=args;return __plasmaMaterialOwner.renderPair(...args);}}});
   window.nativeShipSystems={...systems,move(state,entity,category,command,profile,dt){const result=systems.move(state,entity,category,command,profile,dt);
    if(entity===state){__plasmaRows.push({at:nativeSimulation.seconds(state),x:state.x,y:state.y,speed:state.speed,vx:state.vx,vy:state.vy,angle:state.angle,hull:state.hull,shields:state.shields,flow:state.motionFlow,spin:state.motionSpin?.velocity||0,thrust:command?.throttle});if(__plasmaRows.length>2400)__plasmaRows.shift();}return result;}};
  }''')
  report['start']=page.evaluate('''()=>{const s=nativeNpcDev.getState();return {x:s.x,y:s.y,shields:s.shields,hull:s.hull,vortices:nativePlasmaVortices.snapshot(s)};}''')
  page.wait_for_function('()=>window.__plasmaLive')
  report['visibility']=page.evaluate('''()=>{
   const [,source,field,bodies,options]=__plasmaLive,v=options.vortices[0],view={w:480,h:480,cameraX:v.x,cameraY:v.y,zoom:1.7};
   const c=Object.assign(document.createElement('canvas'),{width:480,height:480}),g=c.getContext('2d',{willReadFrequently:true});
   function read(vortices,at){g.globalCompositeOperation='source-over';g.fillStyle='#000';g.fillRect(0,0,480,480);g.globalCompositeOperation='screen';
    const pair=__plasmaMaterialOwner.renderPair(view,source,field,bodies,{...options,vortices,vortexTime:at,clip:null,direct:true});pair.paint(g,'back');pair.paint(g,'front');return new Uint8ClampedArray(g.getImageData(0,0,480,480).data);}
   const baseline=read([],4),active=read(options.vortices,4),image=c.toDataURL(),release=read(options.vortices,10.5);let brightCrests=0,releaseDifference=0,hotCrests=0,peakLight=0;
   for(let y=0;y<480;y++)for(let x=0;x<480;x++){
    const r=Math.hypot(x+.5-240,y+.5-240)/(v.radius*view.zoom);if(r<.2||r>1.1)continue;const i=(y*480+x)*4;
    const light=data=>data[i]*.3+data[i+1]*.59+data[i+2]*.11;
    if(light(active)>light(baseline)+18&&active[i]>active[i+2]+30)brightCrests++;
    if(light(active)>light(baseline)+25&&active[i]>150&&active[i]>active[i+2]+40)hotCrests++;
    peakLight=Math.max(peakLight,light(active));
    if(Math.abs(light(active)-light(release))>12)releaseDifference++;
   }
   if(brightCrests<800||releaseDifference<800||hotCrests<800||peakLight<110)throw Error('Funnel is not readable at normal game scale '+JSON.stringify({brightCrests,releaseDifference,hotCrests,peakLight}));
   return {brightCrests,releaseDifference,hotCrests,peakLight,image};
  }''')
  import base64
  (OUT/'live-funnel.png').write_bytes(base64.b64decode(report['visibility'].pop('image').split(',')[1]))
  page.screenshot(path=str(OUT/'badlands-vortices.png'))
  page.locator('#space').focus();page.keyboard.down('w')
  try:page.wait_for_function('()=>__plasmaRows.some(r=>r.flow&&r.speed>20)',timeout=20000)
  finally:page.keyboard.up('w')
  page.wait_for_function('()=>__plasmaRows.some(r=>r.flow&&Math.abs(r.spin)>.1)&&__plasmaRows.some(r=>r.shields<__plasmaRows[0].shields-.01)',timeout=20000)
  page.keyboard.down('d');page.wait_for_timeout(250);page.keyboard.up('d')
  page.screenshot(path=str(OUT/'caught-in-vortex.png'))
  report['encounter']=page.evaluate('''()=>({rows:__plasmaRows,renderer:nativePlasmaVortices.snapshot(nativeNpcDev.getState()).renderer})''')
  page.keyboard.press('Escape');page.wait_for_function('()=>nativePause.active')
  paused=page.evaluate('JSON.stringify({x:nativeNpcDev.getState().x,y:nativeNpcDev.getState().y,flow:nativeNpcDev.getState().motionFlow,seconds:nativeSimulation.seconds(nativeNpcDev.getState())})')
  page.wait_for_timeout(180)
  assert page.evaluate('JSON.stringify({x:nativeNpcDev.getState().x,y:nativeNpcDev.getState().y,flow:nativeNpcDev.getState().motionFlow,seconds:nativeSimulation.seconds(nativeNpcDev.getState())})')==paused
  page.keyboard.press('Escape')
  # Exercise the real Dev control; disengaging the field retains momentum.
  page.locator('#devToolsBtn').click();assert page.locator('[data-dev-fog-vortices]').is_checked()
  page.locator('[data-dev-fog-vortices]').uncheck();assert not page.evaluate('nativePlasmaVortices.snapshot(nativeNpcDev.getState()).enabled')
  page.locator('#dialog [data-close]').click()
  page.keyboard.press('Escape');page.wait_for_function('()=>nativePause.active')
  # The native save owner and actual Continue path must retain carried velocity.
  saved=page.evaluate('''()=>{const s=nativeNpcDev.getState(),result=nativeSaveStorage.write(s);if(!result.ok)throw Error(result.error);return {x:s.x,y:s.y,flow:{...s.motionFlow},vx:s.vx,vy:s.vy};}''')
  page.evaluate('''()=>{const api=nativeSimulation;window.nativeSimulation={...api,blocked:()=>true};nativeSimulationHost.checkpoint();resumeNativeGame('dev');}''')
  restored=page.evaluate('''()=>{const s=nativeNpcDev.getState();return {x:s.x,y:s.y,flow:s.motionFlow,vx:s.vx,vy:s.vy};}''')
  assert restored==saved,{'saved':saved,'restored':restored}
  report['savedMomentum']=restored
  page.wait_for_function('()=>nativeDevFog.physicalRegion(nativeNpcDev.getState())')
  # Exercise the actual cloud/material passes, including transported density.
  report['pixels']=page.evaluate('''()=>{
   nativePlasmaVortices.setEnabled(true);const s=nativeNpcDev.getState(),v=nativePlasmaVortices.vortices(s)[0],before=JSON.stringify(s),api=nativeNebulaMaterial;
   const view={w:480,h:480,cameraX:v.x,cameraY:v.y,zoom:1.7},sourceView={w:360,h:360},planes=[{x:180,y:180,width:450,height:450,angle:0,alpha:.86},{x:180,y:180,width:450,height:450,angle:0,alpha:0},{x:180,y:180,width:450,height:450,angle:0,alpha:0}];
   const raw=nativeNebulaGas.render(sourceView,planes,3,1.2,19.813,{densityFloor:.18,colourPreview:'original'}),source=document.createElement('canvas');source.width=raw.width;source.height=raw.height;source.getContext('2d').drawImage(raw,0,0);
   const sourceBytes=source.getContext('2d').getImageData(0,0,source.width,source.height).data;
   const field=api.createField({minX:v.x-180,minY:v.y-180,width:360,height:360,cell:3});field.seed(sourceBytes,source.width,source.height);
   for(let i=0;i<60;i++)field.updateMany([],1/30,{vortices:[v],vortexTime:4+i/30});
   const output=Object.assign(document.createElement('canvas'),{width:480,height:480}),g=output.getContext('2d',{willReadFrequently:true});
   function read(list,at=4,bodies=[]){g.clearRect(0,0,480,480);const pair=api.renderPair(view,source,field,bodies,{worldSource:true,vortices:list,vortexTime:at,direct:true});pair.paint(g,'back');pair.paint(g,'front');return new Uint8ClampedArray(g.getImageData(0,0,480,480).data);}
   const baseline=read([]),curled=read([v]),image=output.toDataURL(),later=read([v],6);let changed=0,outside=0,animated=0,warm=0,white=0;
   for(let y=0;y<480;y++)for(let x=0;x<480;x++){
    const i=(y*480+x)*4,diff=Math.max(...[0,1,2,3].map(c=>Math.abs(curled[i+c]-baseline[i+c])));
    if(diff>3){changed++;if(Math.hypot(x+.5-240,y+.5-240)>v.radius*1.35*view.zoom+2)outside++;}
    if(Math.max(...[0,1,2,3].map(c=>Math.abs(curled[i+c]-later[i+c])))>3)animated++;
    if(curled[i]>curled[i+2]+15&&curled[i+3]>20)warm++;if(Math.min(curled[i],curled[i+1],curled[i+2])>230)white++;
   }
   if(changed<1000||animated<300||warm<2000||outside||white)throw Error('Cloud deformation failed '+JSON.stringify({changed,animated,warm,outside,white}));
   const snapshot=nativePlasmaVortices.snapshot(s);if(snapshot.renderer.canvases||typeof nativePlasmaVortices.paint==='function')throw Error('Separate tornado artwork remains');
   if(!field.metrics().vortexSteps||!field.metrics().forcedCells)throw Error('The actual fluid was not driven');
   const mask=api.maskForType(438),pose={x:v.x+v.radius*.45,y:v.y,heading:.3,width:52,height:83,speed:0};
   field.updateMany([{id:'player',pose,mask}],1/30,{vortices:[v],vortexTime:6});const masked=read([v],6,[{id:'player',pose,mask}]);let hullSamples=0,hullLeaks=0;
   for(let y=3;y<mask.h-3;y+=4)for(let x=3;x<mask.w-3;x+=4){const i=y*mask.w+x;
    if([i,i-3,i+3,i-mask.w*3,i+mask.w*3].some(j=>mask.alpha[j]<250))continue;
    const lx=((x+.5)/mask.w-.5)*pose.width,ly=(.5-(y+.5)/mask.h)*pose.height,c=Math.cos(pose.heading),sn=Math.sin(pose.heading);
    const wx=pose.x+c*ly-sn*lx,wy=pose.y+sn*ly+c*lx,px=Math.floor(240+(wx-v.x)*view.zoom),py=Math.floor(240+(wy-v.y)*view.zoom);
    if(px<0||py<0||px>=480||py>=480)continue;hullSamples++;if(masked[(py*480+px)*4+3]>2)hullLeaks++;
   }
   if(hullSamples<10||hullLeaks)throw Error('Deformed gas leaked into hull '+JSON.stringify({hullSamples,hullLeaks}));
   window.__plasmaPixelFixture={view,source,field,v};
   if(JSON.stringify(s)!==before)throw Error('Painting changed physical ship state');
   return {changed,animated,warm,outside,white,hullSamples,hullLeaks,renderer:snapshot.renderer,fluid:field.metrics(true),image};
  }''')
  import base64
  (OUT/'vortex-detail.png').write_bytes(base64.b64decode(report['pixels'].pop('image').split(',')[1]))
  report['preparedMovement']=page.evaluate('''()=>{
   const api=nativeNebulaMaterial,{view,source,v}=__plasmaPixelFixture;
   const field=api.createField({minX:v.x-180,minY:v.y-180,width:360,height:360,cell:3,uniform:.7}),state={sequence:1,published:0,sweeps:[]};
   Object.defineProperties(field,{pendingSweeps:{get:()=>state.sweeps},acceptedSequence:{get:()=>state.sequence},publishedSequence:{get:()=>state.published},pendingRasterMasks:{value:[]},pendingMasks:{value:[]},pendingRevision:{get:()=>state.sequence+':'+state.published}});
   const c=Object.assign(document.createElement('canvas'),{width:480,height:480}),g=c.getContext('2d',{willReadFrequently:true});
   function read(){g.clearRect(0,0,480,480);const p=api.renderPair(view,source,field,[],{worldSource:true,vortices:[v],vortexTime:4,clearPending:true,direct:true});p.paint(g,'back');p.paint(g,'front');return g.getImageData(0,0,480,480).data;}
   const beforeAlloc=api.metrics().pendingAllocations||0,first=read(),allocated=api.metrics().pendingAllocations-beforeAlloc;
   if(allocated!==1)throw Error('The first plasma frame did not prepare its movement mask');
   state.sequence=2;state.sweeps=[{id:'ship',sequence:2,mask:api.maskForType(438),from:{x:v.x-95,y:v.y,heading:0,width:52,height:83},to:{x:v.x+90,y:v.y,heading:0,width:52,height:83}}];
   const moved=read(),extraAllocations=api.metrics().pendingAllocations-beforeAlloc-allocated;let cleared=0;
   for(let i=3;i<first.length;i+=4)if(first[i]>80&&moved[i]<2)cleared++;
   if(cleared<1000||extraAllocations)throw Error('Prepared first movement failed '+JSON.stringify({cleared,extraAllocations}));
   state.published=2;state.sweeps=[];const acknowledged=read();let error=0;for(let i=0;i<first.length;i++)error=Math.max(error,Math.abs(first[i]-acknowledged[i]));
   if(error>1)throw Error('Acknowledging the prepared movement did not restore gas '+error);
   api.release(field);return {allocated,extraAllocations,cleared,restoredMaximumError:error};
  }''')
  report['worker']=page.evaluate('''async()=>{
   const api=nativeNebulaMaterial,s=nativeNpcDev.getState(),v={...nativePlasmaVortices.vortices(s)[0],x:0,y:0},config={minX:-105,minY:-105,width:210,height:210,cell:3};
   const direct=api.createField(config),worker=api.createRuntimeField(config),rgba=new Uint8ClampedArray(16*16*4);
   for(let i=0;i<16*16;i++){rgba[i*4]=115;rgba[i*4+1]=55;rgba[i*4+2]=28;rgba[i*4+3]=170;}
   direct.seed(rgba,16,16);worker.seed(rgba,16,16);
   function step(i){const options={vortices:[v],vortexTime:4+i/30};direct.updateMany([],1/30,options);worker.updateMany([],1/30,options);}
   for(let i=0;i<30;i++)step(i);await worker.flush();
   function difference(){let error=0;for(let i=0;i<direct.density.length;i++)error=Math.max(error,Math.abs(direct.density[i]-worker.density[i]));return error;}
   const error=difference();if(error>1e-5)throw Error('Vortex worker/direct divergence '+error);
   for(let i=30;i<40;i++)step(i);worker.forceFallback();for(let i=40;i<60;i++)step(i);await worker.flush();
   const recoveryError=difference();if(recoveryError>1e-5)throw Error('Vortex recovery divergence '+recoveryError);
   const metrics=worker.metrics();worker.dispose?.();return {error,recoveryError,forcedCells:metrics.forcedCells,clock:metrics.clock};
  }''')
  page.evaluate("window.__plasmaContextLoss=__plasmaGL.getExtension('WEBGL_lose_context');__plasmaContextLoss.loseContext()")
  page.wait_for_function('()=>nativeNebulaMaterial.metrics().contextLost')
  report['canvasFallback']=page.evaluate('''()=>{
   const api=nativeNebulaMaterial,{view,source,field,v}=__plasmaPixelFixture,c=Object.assign(document.createElement('canvas'),{width:480,height:480}),g=c.getContext('2d',{willReadFrequently:true});
   function read(list){g.clearRect(0,0,480,480);const pair=api.renderPair(view,source,field,[],{worldSource:true,vortices:list,vortexTime:4});
    if(pair.paint){pair.paint(g,'back');pair.paint(g,'front');}else{g.drawImage(pair.back,0,0,480,480);g.drawImage(pair.front,0,0,480,480);}return g.getImageData(0,0,480,480).data;}
   const before=read([]),after=read([v]);let changed=0;for(let i=0;i<before.length;i++)if(Math.abs(before[i]-after[i])>3)changed++;
   if(changed<1000)throw Error('Canvas fallback did not curl the gas '+changed);return {changed,backend:api.metrics().backend};
  }''')
  page.evaluate("__plasmaContextLoss.restoreContext()")
  page.wait_for_function('()=>!nativeNebulaMaterial.metrics().contextLost')
  page.evaluate('nativeNebulaMaterial.prepare()')
  page.wait_for_function('()=>nativeNebulaMaterial.metrics().backend==="webgl2"')
  assert not report['errors'],report['errors'];assert not report['failedRequests'],report['failedRequests']
  report.update(passed=True,realKeyEntry=True,steeringDuringEncounter=True,pauseFrozen=True,continuePreserved=True,readOnlyPainting=True,sharedNebulaMaterial=True)
  browser.close()
finally:
 (OUT/'browser.json').write_text(json.dumps(report,indent=2),encoding='utf8');server.shutdown();server.server_close()
print(json.dumps({k:v for k,v in report.items() if k!='encounter'}))
