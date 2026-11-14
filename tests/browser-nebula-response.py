"""Measure rendered compression-bank response, separately from FPS qualification.

Each trial compares a real alpha pixel outside both hull poses against a known
conservative push. GPU readback makes this diagnostic unsuitable for FPS claims.
"""
import argparse
import functools
import hashlib
import http.server
import importlib.util
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root',type=Path,default=ROOT)
parser.add_argument('--output',type=Path,default=ROOT/'test-results/nebula-response-pixels')
parser.add_argument('--trials',type=int,default=12)
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(args.source_root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
spec=importlib.util.spec_from_file_location('response_support',ROOT/'tests/nebula-browser-support.py');support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
RUN=r'''async count=>{
 const api=nativeNebulaMaterial,source=Object.assign(document.createElement('canvas'),{width:1,height:1}),sg=source.getContext('2d');sg.fillStyle='rgba(80,120,160,.6)';sg.fillRect(0,0,1,1);const rgba=sg.getImageData(0,0,1,1).data;
 const canvas=Object.assign(document.createElement('canvas'),{width:600,height:400}),ctx=canvas.getContext('2d',{willReadFrequently:true}),view={w:600,h:400,cameraX:0,cameraY:0,zoom:2};
 const config={minX:-300,minY:-200,width:600,height:400,cell:nativeDevFog.fluidCell||3},mask=api.maskForType(438),rows=[];
 function paint(field,pose){const pair=api.renderPair(view,source,field,[{id:'player',mask,pose}],{worldSource:true,sourceVersion:0,direct:true,clearPending:true});ctx.clearRect(0,0,600,400);pair.paint(ctx,'back');}
 for(let trial=0;trial<count;trial++){
  const heading=[0,.63,Math.PI/2,Math.PI][trial%4],direction=heading+(trial%2?Math.PI/2:0),start={x:-20,y:0,heading,width:52.032202,height:83,speed:240},end={...start,x:start.x+Math.cos(direction)*2,y:start.y+Math.sin(direction)*2};
  const reference=api.createField(config);reference.seed(rgba,1,1);reference.update(start,mask,1/120);const oldDensity=reference.density.slice();
  // Hold the final hull mask fixed in both images. A newly exposed hull-edge
  // pixel must not be mistaken for a visible change in displaced gas.
  paint(reference,end);const before=ctx.getImageData(0,0,600,400).data;
  reference.update(end,mask,1/120);paint(reference,end);const after=ctx.getImageData(0,0,600,400).data;let probe=null;
  for(let y=70;y<330;y++)for(let x=100;x<500;x++){
   const i=(y*600+x)*4+3,difference=after[i]-before[i];if(difference<5||probe&&difference<=probe.difference)continue;
   const wx=(x+.5-300)/2,wy=(y+.5-200)/2;if(api.occupied(mask,start,wx,wy)||api.occupied(mask,end,wx,wy))continue;
   if(reference.sample(wx,wy)-reference.sample(wx,wy,oldDensity)<.05)continue;
   probe={x,y,difference,before:before[i],target:after[i],threshold:before[i]+Math.ceil(difference*.5)};
  }
  if(!probe)throw Error('No independently displaced compression-bank pixel for trial '+trial);
  const field=api.createRuntimeField(config);field.seed(rgba,1,1);field.update(start,mask,1/120);await field.flush();if(field.metrics().transport!=='worker')throw Error('Worker response test fell back to synchronous flow');paint(field,end);
  const initial=ctx.getImageData(probe.x,probe.y,1,1).data[3];if(Math.abs(initial-probe.before)>1)throw Error('Worker/reference starting image differs');
  const observations=[];let visible=false,latencyMs=null,frames=null,last=null,began=null;
  await new Promise((resolve,reject)=>{let step=0;function tick(at){try{
   if(began===null){began=performance.now();last=at;field.update(end,mask,1/120);}
   else{field.update({...end,speed:0},mask,(at-last)/1000);last=at;step++;}
   paint(field,end);const alpha=ctx.getImageData(probe.x,probe.y,1,1).data[3],elapsed=performance.now()-began;observations.push({frame:step,elapsedMs:elapsed,alpha,publishedSequence:field.publishedSequence});
   if(alpha>=probe.threshold){if(step===0)throw Error('Probe changed before a worker gas publication');visible=true;latencyMs=elapsed;frames=step;resolve();}
   else if(elapsed>=500)resolve();else requestAnimationFrame(tick);
  }catch(error){reject(error);}}requestAnimationFrame(tick);});
  await field.flush();const audit=field.metrics(true);rows.push({trial,heading,sideways:trial%2===1,probe,visible,latencyMs,frames,observations,massError:audit.mass-audit.initialMass});field.dispose();
 }
 const times=rows.filter(r=>r.visible).map(r=>r.latencyMs).sort((a,b)=>a-b);
 return {scope:'Rendered gas-bank pixels in an isolated fixture, not game FPS or physical display scanout',rows,summary:{trials:rows.length,visible:times.length,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.min(times.length-1,Math.floor(times.length*.95))],maximumMs:Math.max(...times),withinOneFrame:rows.filter(r=>r.visible&&r.frames<=1).length}};
}'''
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True);page=browser.new_page(viewport={'width':1280,'height':850});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        hashes=support.source_hashes(args.source_root.resolve())
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.nativeNebulaMaterial&&nativeNebulaHullMasks&&document.querySelector("#startup").hidden',timeout=120000)
        result=page.evaluate(RUN,args.trials);result.update(errors=errors,browser=browser.version,sourceHashes=hashes,sourceStable=hashes==support.source_hashes(args.source_root.resolve()),harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),power=support.power_status())
        (args.output/'report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result['summary']));assert not errors;assert result['summary']['visible']==args.trials;browser.close()
finally:server.shutdown();server.server_close()
