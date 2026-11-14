"""Same-shader gas textures match Canvas transfer, including pause and GPU loss."""
import functools
import http.server
import json
import os
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/nebula-texture'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
report={'passed':False,'errors':[]}
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':800})
        page.add_init_script('''(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){const ctx=get.call(this,kind,...args);if(kind==='webgl2'&&this.dataset.nebulaMaterial)window.__textureGL=ctx;return ctx;};})()''')
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeNebulaMaterial&&document.querySelector("#startup").hidden',timeout=120000)
        report['pixels']=page.evaluate('''()=>{
          const api=nativeNebulaMaterial,gas=nativeNebulaGas;api.prepare();if(!api.gasTextureReady)throw Error('Gas texture renderer unavailable');
          const view={w:640,h:480,cameraX:0,cameraY:0,zoom:1},canvas=Object.assign(document.createElement('canvas'),{width:640,height:480}),ctx=canvas.getContext('2d',{willReadFrequently:true});
          const field=api.createField({minX:-1080,minY:-780,width:2160,height:1560,cell:3,uniform:.7}),bodies=[{id:'player',pose:{x:20,y:10,width:52,height:83,heading:.63},mask:api.maskForType(438)}];
          function read(pair,pass){ctx.clearRect(0,0,640,480);pair.paint(ctx,pass);return ctx.getImageData(0,0,640,480).data;}
          const errors=[];let first=null,later=null;
          for(const [index,style,time,continuous,colour] of [[0,3,0,true,'original'],[1,3,3,true,'original'],[2,4,1.2,false,'original'],[3,2,8,false,'four'],[4,3,0,true,'original']]){
            const d={view:{w:2160,h:1560},planes:[0,1,2].map(i=>({x:1080+index*21,y:780-index*17,width:2000*(1-i*.09),height:1400*(1-i*.09),angle:.15+i*.08,alpha:i===0?.85*.78:i===1?.85*.22:.28})),style,time,seed:53.363,options:{densityFloor:.18,colourPreview:colour,continuous}};
            const raw=gas.render(d.view,d.planes,d.style,d.time,d.seed,d.options),source=Object.assign(document.createElement('canvas'),{width:raw.width,height:raw.height});source.getContext('2d').drawImage(raw,0,0);
            const options={worldSource:true,direct:true,sourceVersion:'legacy:'+index},reference=api.renderPair(view,source,field,bodies,options),expected=[read(reference,'back'),read(reference,'front')];
            const direct=api.renderPair(view,source,field,bodies,{...options,sourceVersion:'texture:'+index,gasSource:d}),actual=[read(direct,'back'),read(direct,'front')];
            let maximum=0,total=0,alphaMaximum=0;
            for(let layer=0;layer<2;layer++)for(let i=0;i<actual[layer].length;i++){
              const channel=i%4,a=actual[layer],b=expected[layer],j=i-channel+3,e=channel===3?Math.abs(a[i]-b[i]):Math.abs(a[i]*a[j]/255-b[i]*b[j]/255);
              maximum=Math.max(maximum,e);total+=e;if(channel===3)alphaMaximum=Math.max(alphaMaximum,e);
            }
            errors.push({style,time,maximum,average:total/(640*480*8),alphaMaximum});
            if(maximum>3||total/(640*480*8)>.08)throw Error('Direct source changed gas pixels '+JSON.stringify(errors.at(-1)));
            const draws=api.metrics().gasTextureDraws,repeat=api.renderPair(view,source,field,bodies,{...options,sourceVersion:'texture:'+index,gasSource:d});
            if(api.metrics().gasTextureDraws!==draws)throw Error('Paused source reran its shader');
            const stable=read(repeat,'back');if(!stable.every((v,i)=>v===actual[0][i]))throw Error('Paused source changed pixels');
            if(index===0)first=actual[0];if(index===1)later=actual[0];window.__gasTextureFixture={view,source,field,bodies,description:d};
          }
          let changed=0;for(let i=0;i<first.length;i++)if(Math.abs(first[i]-later[i])>3)changed++;
          if(changed<1000)throw Error('Direct gas stopped animating');
          return {errors,changedPixels:changed/4,metrics:api.metrics(),gas:gas.metrics()};
        }''')
        report['fieldMasks']=page.evaluate('''()=>{
          const api=nativeNebulaMaterial,view={w:600,h:400,cameraX:0,cameraY:0,zoom:1},source=Object.assign(document.createElement('canvas'),{width:1,height:1});
          source.getContext('2d').fillStyle='#b86732';source.getContext('2d').fillRect(0,0,1,1);
          const mask=api.maskForType(438),config={minX:-300,minY:-200,width:600,height:400,cell:3,uniform:.7};
          const make=(sequence,y)=>{const field=api.createField(config),state={sequence,published:0,sweeps:[{id:'ship',sequence,mask,from:{x:-180,y,heading:0,width:52,height:83},to:{x:160,y,heading:0,width:52,height:83}}]};
            Object.defineProperties(field,{pendingSweeps:{get:()=>state.sweeps},acceptedSequence:{get:()=>state.sequence},publishedSequence:{get:()=>state.published},pendingRasterMasks:{value:[]},pendingMasks:{value:[]},pendingRevision:{get:()=>state.sequence+':'+state.published}});return {field,state};};
          const a=make(1,-65),b=make(80,65),canvas=Object.assign(document.createElement('canvas'),{width:600,height:400}),ctx=canvas.getContext('2d',{willReadFrequently:true});
          function read(row){ctx.clearRect(0,0,600,400);api.renderPair(view,source,row.field,[],{worldSource:true,direct:true,clearPending:true,sourceVersion:0}).paint(ctx,'back');return ctx.getImageData(0,0,600,400).data;}
          const first=read(a),second=read(b),allocations=api.metrics().pendingAllocations;
          a.state.sweeps=[];b.state.sweeps=[];
          for(let i=0;i<8;i++){if(!read(a).every((v,k)=>v===first[k])||!read(b).every((v,k)=>v===second[k]))throw Error('Changing cloud sections lost their pending hull path');}
          if(api.metrics().pendingAllocations!==allocations)throw Error('Changing sections reallocated their movement textures');
          a.state.published=1;const acknowledged=read(a),retained=read(b);let restored=0;
          for(let i=3;i<first.length;i+=4)if(acknowledged[i]>first[i]+5)restored++;
          if(restored<1000||!retained.every((v,k)=>v===second[k]))throw Error("One section acknowledged another section's movement");
          for(const row of [a,b]){if(row.field.density.some(v=>v!==Math.fround(.7)))throw Error('GPU movement masks changed fluid mass');api.release(row.field);}
          return {allocations,additionalAllocations:api.metrics().pendingAllocations-allocations,restoredPixels:restored};
        }''')
        report['seedWorker']=page.evaluate('''async()=>{
          const gas=nativeNebulaGas,rows=[];
          for(const continuous of [false,true]){
            const d={...__gasTextureFixture.description,options:{...__gasTextureFixture.description.options,continuous}},raw=gas.render(d.view,d.planes,d.style,d.time,d.seed,d.options);
            const c=Object.assign(document.createElement('canvas'),{width:raw.width,height:raw.height});c.getContext('2d').drawImage(raw,0,0);const expected=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
            const started=performance.now(),result=await gas.requestSeed(d,c.width,c.height).promise;let alphaMaximum=0;
            for(let i=3;i<expected.length;i+=4)alphaMaximum=Math.max(alphaMaximum,Math.abs(expected[i]-result.rgba[i]));
            if(alphaMaximum)throw Error('Worker changed seeded density '+alphaMaximum);rows.push({continuous,alphaMaximum,latencyMs:performance.now()-started});
          }
          const d=__gasTextureFixture.description,request=gas.requestSeed(d,64,48);request.cancel();if(await request.promise!==null)throw Error('Cancelled region received a stale seed');
          return {rows,cancelled:true,metrics:gas.metrics()};
        }''')
        page.evaluate("window.__textureLoss=__textureGL.getExtension('WEBGL_lose_context');__textureLoss.loseContext()")
        page.wait_for_function('()=>nativeNebulaMaterial.metrics().contextLost')
        report['fallback']=page.evaluate('''()=>{const f=__gasTextureFixture,pair=nativeNebulaMaterial.renderPair(f.view,f.source,f.field,f.bodies,{worldSource:true,direct:true,gasSource:f.description});if(!pair.back||!pair.front)throw Error('Missing CPU fallback layers');return nativeNebulaMaterial.metrics().backend;}''')
        page.evaluate('__textureLoss.restoreContext()')
        page.wait_for_function('()=>!nativeNebulaMaterial.metrics().contextLost')
        report['recovery']=page.evaluate('''()=>{const a=nativeNebulaMaterial,f=__gasTextureFixture;a.prepare();if(!a.gasTextureReady)throw Error('Gas texture did not recover');a.renderPair(f.view,f.source,f.field,f.bodies,{worldSource:true,direct:true,sourceVersion:'restored',gasSource:f.description});return a.metrics();}''')
        assert not report['errors'],report['errors']
        report['passed']=True
        print(json.dumps(report),flush=True)
        browser.close()
finally:
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    server.shutdown();server.server_close()
