"""Fog atlas/layer equivalence, exact pending openings and bounded flux smoothing."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/nebula-presentation'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.nativeNebulaMaterial&&window.nativeNebulaHullMasks&&document.querySelector("#startup").hidden',timeout=120000)
        report=page.evaluate('''()=>{
          const api=nativeNebulaMaterial,view={w:600,h:400,cameraX:0,cameraY:0,zoom:1.65};
          const drawsBeforeWarm=api.metrics().renders;api.prepare();api.prepare();if(api.metrics().renders!==drawsBeforeWarm)throw Error('Shader preparation advanced material drawing');
          const source=Object.assign(document.createElement('canvas'),{width:600,height:400});
          const sg=source.getContext('2d');sg.fillStyle='rgba(70,120,105,.6)';sg.fillRect(0,0,600,400);
          const field=api.createField({minX:-300,minY:-200,width:600,height:400,cell:2});
          const bodies=[{id:'player',pose:{x:-65,y:0,width:52,height:83,heading:.63},mask:api.maskForType(438)},{id:'other',pose:{x:65,y:10,width:60,height:91,heading:-.4},mask:api.maskForType(439,2)}];
          const c=Object.assign(document.createElement('canvas'),{width:600,height:400}),ctx=c.getContext('2d',{willReadFrequently:true});
          function read(pair,pass){ctx.clearRect(0,0,600,400);if(pair.paint)pair.paint(ctx,pass);else ctx.drawImage(pair[pass],0,0);return ctx.getImageData(0,0,600,400).data;}
          function compare(a,b){let maximum=0,total=0;for(let i=0;i<a.length;i++){const e=Math.abs(a[i]-b[i]);maximum=Math.max(maximum,e);total+=e;}return {maximum,average:total/a.length};}
          api.renderPair(view,source,field,bodies);
          const ordinary=api.renderPair(view,source,field,bodies),back=read(ordinary,'back'),front=read(ordinary,'front');
          const atlas=api.renderPair(view,source,field,bodies,{direct:true}),atlasErrors=[compare(back,read(atlas,'back')),compare(front,read(atlas,'front'))];
          if(atlasErrors.some(e=>e.maximum>1))throw Error('Atlas changed optical layers '+JSON.stringify(atlasErrors));
          const pose=bodies[0].pose,mask=bodies[0].mask;
          const newest=api.createField({minX:-300,minY:-200,width:600,height:400,cell:2}),currentOnly=[{id:'player',pose,mask}];
          const currentReference=read(api.renderPair(view,source,newest,currentOnly,{direct:true,clearPending:true}),'back'),rasters=api.metrics().pendingSurfaceRasters||0;
          Object.defineProperties(newest,{pendingMasks:{value:[{...pose,id:'player',mask}]},pendingSweeps:{value:[]},pendingRevision:{value:'current-only'}});
          const currentPixels=read(api.renderPair(view,source,newest,currentOnly,{direct:true,clearPending:true}),'back'),currentOnlyError=compare(currentReference,currentPixels);
          if(currentOnlyError.maximum||(api.metrics().pendingSurfaceRasters||0)!==rasters)throw Error('An already cleared current pose changed pixels or rasterized a redundant pending surface '+JSON.stringify(currentOnlyError));
          const offscreenMask=new Proxy(mask,{get(target,key){if(key==='stencil'||key==='art')throw Error('Offscreen pending hull requested artwork');return target[key];}});
          Object.defineProperties(field,{pendingMasks:{value:[{...pose,x:pose.x-18,id:'player',mask},{...pose,id:'player',mask},{...pose,x:10000,id:'far',mask:offscreenMask}]},pendingRevision:{value:'presentation-check'}});
          const pending=api.renderPair(view,source,field,bodies);for(const pass of ['back','front'])api.clearPending(pending[pass].getContext('2d'),view,field,bodies);
          const expected=[read(pending,'back'),read(pending,'front')],shader=api.renderPair(view,source,field,bodies,{direct:true,clearPending:true}),pendingErrors=[compare(expected[0],read(shader,'back')),compare(expected[1],read(shader,'front'))];
          // RGB at near-transparent pixels is unpremultiplied by getImageData;
          // compare alpha directly for this optical-equivalence gate.
          const shaderBytes=[read(shader,'back'),read(shader,'front')];let alphaMaximum=0,alphaTotal=0;
          for(let pass=0;pass<2;pass++)for(let i=3;i<expected[pass].length;i+=4){const e=Math.abs(expected[pass][i]-shaderBytes[pass][i]);alphaMaximum=Math.max(alphaMaximum,e);alphaTotal+=e;}
          if(alphaMaximum>2||alphaTotal/(600*400*2)>.05)throw Error('Shader pending path changed clearance '+alphaMaximum);
          const smoothField=api.createField({minX:-300,minY:-200,width:600,height:400,cell:2});smoothField.rate.fill(3);
          let seconds=0;Object.defineProperty(smoothField,'predictionSeconds',{get:()=>seconds});const rows=[];
          for(seconds of [0,1/120,2/120,1/30,.2]){const pair=api.renderPair(view,source,smoothField,bodies,{direct:true,smooth:true}),pixels=read(pair,'back');rows.push(pixels[(30*600+30)*4+3]);}
          if(!(rows[0]<rows[1]&&rows[1]<rows[2]&&rows[2]<rows[3]&&rows[3]===rows[4]))throw Error('Unbounded or stepped smoothing '+rows);
          if(smoothField.density.some(d=>d!==1))throw Error('Presentation smoothing mutated conserved material');
          // Pan/zoom out of the uploaded region and return after a new material
          // revision. Compare against the original 16-read/full-upload path.
          const cropField=api.createField({minX:-800,minY:-600,width:1600,height:1200,cell:2});let revision=1;
          Object.defineProperty(cropField,'revision',{get:()=>revision});
          const fill=phase=>{for(let y=0;y<cropField.h;y++)for(let x=0;x<cropField.w;x++){const i=y*cropField.w+x;cropField.density[i]=1+Math.sin(x*.17+phase)*Math.cos(y*.13)*.85;cropField.rate[i]=Math.cos(x*.09-y*.11)*2;}};fill(0);
          const views=[[-700,-500,2],[650,450,2],[-100,60,1.1],[-100,60,.23],[900,650,1],[-700,-500,2]],cropped=[];
          for(let i=0;i<views.length;i++){if(i===4){revision++;fill(1.7);}const [cameraX,cameraY,zoom]=views[i],v={...view,cameraX,cameraY,zoom};cropped.push(read(api.renderPair(v,source,cropField,[],{direct:true,smooth:true}),'back'));}
          const cropErrors=[];revision++;fill(0);
          for(let i=0;i<views.length;i++){if(i===4){revision++;fill(1.7);}const [cameraX,cameraY,zoom]=views[i],v={...view,cameraX,cameraY,zoom},reference=read(api.renderPair(v,source,cropField,[],{direct:true,fullUpload:true,linear:false,smooth:true}),'back');let maximum=0,total=0;
            for(let j=3;j<reference.length;j+=4){const error=Math.abs(reference[j]-cropped[i][j]);maximum=Math.max(maximum,error);total+=error;}cropErrors.push({maximum,average:total/(600*400)});
          }
          if(cropErrors.some(e=>e.maximum>2||e.average>.06))throw Error('Cropped/linear density changed the image '+JSON.stringify(cropErrors));
          // Change gas outside the viewport, reveal it, then make a small push.
          // Incremental texture uploads must retain the full reconstruction.
          const incremental=api.createField({minX:-800,minY:-600,width:1600,height:1200,cell:2}),probeMask=api.maskForType(438),probe={x:0,y:0,heading:0,width:52,height:83},leftView={...view,cameraX:-600,cameraY:-400,zoom:2};
          api.renderPair(leftView,source,incremental,[],{direct:true});let uploaded=api.metrics().uploadedCells;
          incremental.update(probe,probeMask,1/120);api.renderPair(leftView,source,incremental,[],{direct:true});const hiddenUploads=api.metrics().uploadedCells-uploaded;
          if(hiddenUploads!==0)throw Error('Offscreen gas changed a visible GPU texture region');
          const centerView={...view,cameraX:0,cameraY:0,zoom:2};api.renderPair(centerView,source,incremental,[],{direct:true});
          uploaded=api.metrics().uploadedCells;incremental.update({...probe,x:2},probeMask,1/120);
          const localPixels=read(api.renderPair(centerView,source,incremental,[],{direct:true}),'back'),localUploads=api.metrics().uploadedCells-uploaded;
          const fullPixels=read(api.renderPair(centerView,source,incremental,[],{direct:true,fullUpload:true}),'back'),incrementalErrors=compare(localPixels,fullPixels);
          if(incrementalErrors.maximum>1||localUploads>=300*200/2)throw Error('A local gas push uploaded the whole viewport or changed its image: '+JSON.stringify({localUploads,incrementalErrors}));
          // Retained integer GPU stamps survive camera changes, stop clearing
          // once acknowledged, and preserve the present Intrepid's openings.
          const fastField=api.createField({minX:-300,minY:-200,width:600,height:400,cell:2}),fastMask=api.maskForType(438),from={x:-200,y:0,heading:0,width:52,height:83},to={...from,x:170};let published=0,accepted=1,sweeps=[{id:'fast',sequence:1,from,to,mask:fastMask}];
          Object.defineProperties(fastField,{acceptedSequence:{get:()=>accepted},publishedSequence:{get:()=>published},pendingSweeps:{get:()=>sweeps},pendingMasks:{value:[]},pendingRevision:{get:()=>accepted+':'+published}});
          const fastBodies=[{id:'fast',pose:to,mask:fastMask}],fastView={...view,zoom:1},fast=read(api.renderPair(fastView,source,fastField,fastBodies,{direct:true,clearPending:true}),'back');
          if(fast[(200*600+300)*4+3]>2)throw Error('Fast GPU path had an interior hole');
          const draws=api.metrics().pendingSweepDraws;if(!Number.isFinite(draws)||draws<1||api.metrics().sweepFailures)throw Error('The GPU sweep path failed: '+JSON.stringify(api.metrics()));api.renderPair({...fastView,cameraX:20},source,fastField,fastBodies,{direct:true,clearPending:true});
          if(api.metrics().pendingSweepDraws!==draws)throw Error('An unchanged path was rebuilt');
          const gapView={...view,cameraX:140,zoom:2.2},gapBytes=read(api.renderPair(gapView,source,fastField,fastBodies,{direct:true,clearPending:true}),'back');let gapSamples=0,gapAlpha=0;
          for(const p of fastMask.channels){const x=to.x+(.5-p.v)*to.height,y=(p.u-.5)*to.width,px=Math.round(300+(x-gapView.cameraX)*gapView.zoom),py=Math.round(200+y*gapView.zoom);if(px>1&&px<599&&py>1&&py<399){gapSamples++;gapAlpha+=gapBytes[(py*600+px)*4+3];}}
          if(!gapSamples||gapAlpha/gapSamples<60)throw Error('Fast pending wake sealed current nacelle openings');
          published=1;sweeps=[];const released=read(api.renderPair(fastView,source,fastField,fastBodies,{direct:true,clearPending:true}),'back');
          if(released[(200*600+300)*4+3]<130)throw Error('An acknowledged GPU stamp kept cutting the material');
          const held=api.renderPair(view,source,field,bodies,{direct:true}),heldBefore=read(held,'front');api.renderPair(view,source,incremental,[],{direct:true});
          const interleaved=compare(heldBefore,read(held,'front'));if(interleaved.maximum)throw Error('Another cloud overwrote its retained foreground '+JSON.stringify(interleaved));
          return {passed:true,atlasErrors,interleaved,currentOnlyError,pendingAlphaMaximum:alphaMaximum,pendingAlphaAverage:alphaTotal/(600*400*2),smoothAlpha:rows,cropErrors,incremental:{hiddenUploads,localUploads,errors:incrementalErrors},retainedSweep:{draws,gapSamples,gapAlpha:gapAlpha/gapSamples,released:true},flowKernel:field.metrics().flowKernel,renderer:api.metrics()};
        }''')
        assert not errors,errors
        assert report['flowKernel']=='webassembly',report
        assert report['renderer']['backend']=='webgl2',report
        page.evaluate('startNativeDevGame();nativeDevFog.setEnabled(true)')
        page.wait_for_function('()=>nativeDevFog.material()?.field.ready',timeout=120000)
        page.evaluate("nativeDevFog.setPreset('vex');nativeDevFog.setColour('four');nativeDevFog.reset({ahead:0})")
        page.wait_for_function('()=>nativeDevFog.material()?.field.ready&&nativeDevFog.material().field.metrics().activeTiles>0',timeout=120000)
        report['offscreen']=page.evaluate('''()=>{
          const s=nativeNpcDev.getState(),m=nativeDevFog.material(),f=m.field,clock=f.metrics().clock,renders=nativeNebulaMaterial.metrics().renders;
          const c=Object.assign(document.createElement('canvas'),{width:600,height:400}),ctx=c.getContext('2d'),v={w:600,h:400,zoom:1,cameraX:f.minX+f.width+10000,cameraY:f.minY+f.height+10000,ship:vexedSolFlight.shipPosition(s),dimensions:{width:m.pose.width,height:m.pose.height},reducedMotion:false};
          nativeDevFog.frame(s,1/120,v);nativeDevFog.paint(ctx,'back');nativeDevFog.paint(ctx,'front');
          if(nativeNebulaMaterial.metrics().renders!==renders)throw Error('An invisible cloud was rendered');
          if(f.metrics().clock<=clock)throw Error('Hiding the cloud stopped its material clock');
          const descriptor=Object.getOwnPropertyDescriptor(f,'predictionSeconds');let phase=0;
          Object.defineProperty(f,'predictionSeconds',{get:()=>phase,configurable:true});
          try{
            nativeDevFog.frame(s,0,{...v,cameraX:f.minX+f.width/2,cameraY:f.minY+f.height/2});
            const before=nativeNebulaMaterial.metrics().renders;
            for(const value of [0,1/120,2/120]){phase=value;nativeDevFog.paint(ctx,'back');}
            if(nativeNebulaMaterial.metrics().renders-before!==3)throw Error('A stationary camera cached intermediate fluid phases');
          }finally{Object.defineProperty(f,'predictionSeconds',descriptor);}
          return {draws:0,materialContinues:true,stationarySmoothing:true};
        }''')
        report['interpolatedEntry']=page.evaluate('''()=>{
          const s=nativeNpcDev.getState(),m=nativeDevFog.material(),systems=nativeShipSystems,frame=nativeSimulationFrame,simulation=nativeSimulation;
          const entity=s.civilianTraffic.ships.find(e=>e.hull>0&&e.system===1),d={...nativeShipDefinitions.describe(s,entity,{category:'civilian'}),x:300,y:10,previousX:100,previousY:10};
          const v={w:600,h:400,zoom:1,cameraX:m.field.minX+m.field.width/2,cameraY:m.field.minY+m.field.height/2,ship:vexedSolFlight.shipPosition(s),dimensions:{width:m.pose.width,height:m.pose.height},reducedMotion:false};
          window.nativeSimulation={...simulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          try{
            window.nativeShipSystems={...systems,query:()=>({bystanders:[d]})};window.nativeSimulationFrame={...frame,renderPose:(state,target)=>target.id===d.id?{...target,x:200,y:10}:frame.renderPose(state,target)};
            nativeDevFog.frame(s,1/120,v);const body=nativeDevFog.material().bodies.find(b=>b.id==='civilian:'+d.id);
            if(!body||Math.abs(body.pose.x-body.from.x-100)>1e-8)throw Error('Interpolation was added to the previous world pose');return {displayedDelta:body.pose.x-body.from.x,expectedDelta:100};
          }finally{window.nativeShipSystems=systems;window.nativeSimulationFrame=frame;window.nativeSimulation=simulation;nativeSimulationHost.checkpoint();}
        }''')
        report['batch']=page.evaluate("""()=>{
          const api=nativeNebulaMaterial,v={w:600,h:400,cameraX:0,cameraY:0,zoom:1};
          const canvas=()=>{const c=document.createElement('canvas');c.width=600;c.height=400;return c;};
          const rows=[0,1,2,3,4].map(i=>{const f=api.createField({minX:-400,minY:-300,width:800,height:600,cell:3,uniform:.4+i*.1}),source=canvas();const g=source.getContext('2d');g.fillStyle=['#a04321','#3e7e94','#7e438e','#798e43','#a4856b'][i];g.fillRect(0,0,600,400);return {f,source,clip:{x:i===4?150:i%2*300,y:i===4?100:Math.floor(i/2)*200,w:300,h:200}};});
          const hull=api.maskForType(438),damaged=api.maskForType(438,2),pose={x:0,y:0,width:52,height:83,heading:.63};
          for(const [i,r]of rows.entries()){r.view={...v,cameraX:i===1?8:0};r.bodies=[{id:'ship',mask:i===2?damaged:hull,pose:{...pose,x:i===1?8:0,heading:i===3?.7:.63}}];}
          rows[1].clip={...rows[0].clip};
          const reference=[canvas(),canvas()],actual=[canvas(),canvas()];
          for(const r of rows){const pair=api.renderPair(r.view,r.source,r.f,r.bodies,{sourceVersion:1});for(let i=0;i<2;i++){const g=reference[i].getContext('2d');g.save();g.globalCompositeOperation='screen';g.beginPath();g.rect(r.clip.x,r.clip.y,r.clip.w,r.clip.h);g.clip();g.drawImage(i?pair.front:pair.back,0,0);g.restore();}}
          const uploads=api.metrics().uploadedCells;
          const before=api.metrics();
          if(!api.beginBatch(v))throw Error('Batch renderer unavailable');
          for(const r of rows)api.renderPair(r.view,r.source,r.f,r.bodies,{sourceVersion:1,direct:true,clip:r.clip});
          const batch=api.endBatch();for(let i=0;i<2;i++)batch.paint(actual[i].getContext('2d'),i?'front':'back');
          const after=api.metrics(),coverage={rasters:after.coverageRasters-before.coverageRasters,uploads:after.coverageUploads-before.coverageUploads,hits:(after.coverageCacheHits||0)-(before.coverageCacheHits||0)};
          if(coverage.rasters!==4||coverage.uploads!==4||coverage.hits!==1)throw Error('Coverage reuse missed exact screen equality or retained a stale hull '+JSON.stringify(coverage));
          api.beginBatch(v);api.renderPair(v,rows[0].source,rows[0].f,rows[0].bodies,{direct:true});api.endBatch();
          if(api.metrics().coverageRasters!==after.coverageRasters+1)throw Error('Coverage survived across frames');
          let maximum=0,total=0;for(let i=0;i<2;i++){const a=actual[i].getContext('2d').getImageData(0,0,600,400).data,b=reference[i].getContext('2d').getImageData(0,0,600,400).data;for(let j=0;j<a.length;j++){const e=Math.abs(a[j]-b[j]);maximum=Math.max(maximum,e);total+=e;}}
          const newUploads=api.metrics().uploadedCells-uploads;for(const r of rows)api.release(r.f);
          if(maximum>2||newUploads!==0)throw Error('Batched tiles changed pixels or reuploaded unchanged fields '+JSON.stringify({maximum,newUploads}));
          return {maximum,average:total/(600*400*4*2),unchangedFieldUploads:newUploads,coverage};
        }""")
        (OUT/'report.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
