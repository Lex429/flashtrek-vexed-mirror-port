"""Real worker catches up after slow inputs without extra poses or discarded time.

This is a stalled-input correctness check, not a gameplay FPS measurement.
"""
import argparse
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root',type=Path,default=ROOT)
parser.add_argument('--output',type=Path,default=ROOT/'test-results/nebula-flow-debt')
parser.add_argument('--baseline',action='store_true',help='Verify the original idle-with-debt reproduction')
args=parser.parse_args();SITE=args.source_root.resolve();OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass
    def translate_path(self,path):
        target=Path(super().translate_path(path))
        if not target.exists() and target.suffix not in {'.js','.html','.css'}:
            fallback=ROOT/target.resolve().relative_to(SITE)
            if fallback.is_file():return str(fallback)
        return str(target)
files=['nebula-material.js','nebula-material-worker.js','nebula-flow-kernel.js']
def hashes():
    return {name:hashlib.sha256((SITE/'html-games/broken-mirror-port'/name).read_bytes()).hexdigest() for name in files}
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(SITE)))
threading.Thread(target=server.serve_forever,daemon=True).start()
report={'passed':False,'baseline':args.baseline,'errors':[],'sourceBefore':hashes(),'scope':__doc__}
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':800})
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeNebulaMaterial&&document.querySelector("#startup").hidden',timeout=120000)
        report['worker']=page.evaluate('''async baseline=>{
          const api=nativeNebulaMaterial,config={minX:-1080,minY:-780,width:2160,height:1560,cell:3},field=api.createRuntimeField(config),rgba=new Uint8Array([90,70,40,128]);
          field.seed(rgba,1,1);await field.flush();
          const mask=api.maskForType(438),commands=Array.from({length:5},(_,step)=>Array.from({length:20},(_,i)=>({id:'ship'+i,mask,pose:{x:-420+(i%5)*210+step*22,y:-300+Math.floor(i/5)*200+Math.sin(step*.4+i)*20,width:52,height:83,heading:.2+step*.08+i*.12}})));
          const began=performance.now();for(const bodies of commands)field.updateMany(bodies,.5);await field.flush();
          const flushMs=performance.now()-began,afterFlush=field.metrics(true),density=Array.from(field.density);
          await new Promise(resolve=>setTimeout(resolve,250));const afterIdle=field.metrics(true);
          let maximumError=null;
          if(!baseline){
            const reference=api.createField(config);reference.seed(rgba,1,1);
            for(const bodies of commands){reference.updateMany(bodies,.5);while(reference.hasPendingFlow)reference.continueFlow();}
            maximumError=0;for(let i=0;i<density.length;i++)maximumError=Math.max(maximumError,Math.abs(density[i]-reference.density[i]));
          }
          field.dispose();return {dimensions:{w:field.w,h:field.h,cell:field.cell},actors:20,acceptedInputs:5,acceptedSeconds:2.5,flushMs,afterFlush,afterIdle,maximumError};
        }''',args.baseline)
        w=report['worker'];assert w['afterIdle']['transport']=='worker',w
        assert w['afterIdle']['clock']==w['afterFlush']['clock']==2.5,w
        assert w['afterIdle']['acceptedPoses']==5,w
        assert abs(w['afterIdle']['mass']-w['afterIdle']['initialMass'])<w['afterIdle']['initialMass']*1e-6,w
        if args.baseline:
            assert w['afterIdle']['pending']>=1/30,'Original reproduction no longer leaves idle fluid debt'
            report['baselineReproduced']=True
        else:
            assert w['afterFlush']['pending']<1/30 and w['afterIdle']['pending']<1/30,w
            assert w['maximumError']==0,w
            assert not report['errors'],report['errors']
            report['passed']=True
        report['sourceStable']=hashes()==report['sourceBefore'];assert report['sourceStable']
        print(json.dumps({'passed':report['passed'],'baselineReproduced':report.get('baselineReproduced'),
            'acceptedSeconds':w['acceptedSeconds'],'pendingAfterFlush':w['afterFlush']['pending'],'pendingAfterIdle':w['afterIdle']['pending'],
            'flushMs':w['flushMs'],'maximumError':w['maximumError'],'sourceStable':report['sourceStable']}),flush=True)
        browser.close()
finally:
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    server.shutdown();server.server_close()
