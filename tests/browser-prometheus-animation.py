"""Record the actual smaller Prometheus splitting and docking in flight."""
import base64
import functools
import http.server
import importlib.util
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/prometheus-blue-flames';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('server',ROOT/'tests/browser-npc-performance.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(module.SnapshotHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='msedge')
    page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
    page.wait_for_function('()=>!!window.nativePrometheusEffects')
    page.evaluate("""()=>{
      const traffic=nativeCivilianTraffic;window.nativeCivilianTraffic={...traffic,initialize(s,...args){window.__movieState=s;return traffic.initialize(s,...args);}};
      const frame=nativeSimulationFrame;window.__movieManual=true;window.nativeSimulationFrame={...frame,run(...args){if(!__movieManual)return frame.run(...args);}};
    }""")
    page.locator('[data-menu="dev"]').click()
    page.wait_for_function('()=>!!window.__movieState')
    page.evaluate("""async()=>{
      const s=__movieState;nativeShipEquipment.changeHull(s,37);s.landed=false;s.phase='flight';s.localCruise=null;s.arrivalApproach=null;s.shipyardDock=null;s.pendingTransit=null;
      s.x=3000;s.y=-3000;s.angle=-Math.PI/2;s.speed=s.vx=s.vy=0;s.shields=0;
      await nativeShipEffects.prepare(37,'player');await nativePrometheus.preload(s);
      resumeNativeGame('dev',JSON.parse(JSON.stringify(s)));nativePrometheus.updateUi(__movieState,true);
    }""")
    page.screenshot(path=str(OUT/'smaller-joined.png'))
    page.evaluate("""()=>{
      const recorder=new MediaRecorder(document.querySelector('#space').captureStream(30),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000});
      const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.__movieRecorder=recorder;
      window.__movieDone=new Promise(resolve=>recorder.onstop=async()=>{const blob=new Blob(chunks,{type:'video/webm'}),reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});recorder.start();window.__movieManual=false;
    }""")
    page.keyboard.press('v')
    page.wait_for_function('()=>__movieState.prometheus?.mode==="separating"')
    page.wait_for_function('()=>nativeSimulation.seconds(__movieState)-__movieState.prometheus.startedAt>.25')
    page.screenshot(path=str(OUT/'charge.png'))
    page.wait_for_function('()=>nativeSimulation.seconds(__movieState)-__movieState.prometheus.startedAt>1.35')
    page.screenshot(path=str(OUT/'breakaway.png'))
    effects=page.evaluate("""()=>{
      const s=__movieState,before=JSON.stringify(s),c=document.createElement('canvas');c.width=1200;c.height=600;
      const ctx=c.getContext('2d',{willReadFrequently:true});
      const render=()=>{
       ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);
       const lead=nativeShipDefinitions.describe(s),escorts=s.prometheus.sections.map(e=>nativeShipDefinitions.describe(s,e,{category:'prometheus'}));
       nativePrometheusEffects.paint(ctx,s,lead,escorts,{ship:{x:s.x,y:s.y},cx:600,cy:300,zoom:4},'under');
       nativePrometheusEffects.paint(ctx,s,lead,escorts,{ship:{x:s.x,y:s.y},cx:600,cy:300,zoom:4},'over');
       return ctx.getImageData(0,0,c.width,c.height).data;
      };
      const a=render(),b=render();let colored=0,bright=0,changed=0;
      for(let i=0;i<a.length;i+=4){if(a[i+3]>20&&a[i+2]>a[i]+20)colored++;if(a[i+3]>90&&a[i]>130&&a[i+2]>200)bright++;if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])changed++;}
      window.__flamePlate=c.toDataURL().split(',')[1];
      return {bluePixels:colored,hotCorePixels:bright,repaintChangedPixels:changed,paintingPreservesState:before===JSON.stringify(s)};
    }""")
    (OUT/'exhaust-detail.png').write_bytes(base64.b64decode(page.evaluate('__flamePlate')))
    assert effects['bluePixels']>100 and effects['hotCorePixels']>5 and effects['repaintChangedPixels']==0 and effects['paintingPreservesState'],effects
    page.wait_for_function('()=>__movieState.prometheus.mode==="deployed"')
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT/'formation.png'))
    page.locator('#multiVectorBtn').click()
    page.wait_for_function('()=>nativeSimulation.seconds(__movieState)-__movieState.prometheus.startedAt>.7')
    page.screenshot(path=str(OUT/'returning.png'))
    page.wait_for_function('()=>__movieState.prometheus.dockingAt!=null',timeout=60000)
    page.wait_for_function('()=>nativeSimulation.seconds(__movieState)-__movieState.prometheus.dockingAt>.7')
    page.screenshot(path=str(OUT/'magnetic-docking.png'))
    page.wait_for_function('()=>__movieState.prometheus.mode==="joined"',timeout=30000)
    page.screenshot(path=str(OUT/'lock-confirmed.png'))
    page.wait_for_timeout(800)
    page.evaluate('__movieRecorder.stop()')
    (OUT/'prometheus-split-rejoin.webm').write_bytes(base64.b64decode(page.evaluate('()=>__movieDone')))
    report=page.evaluate('()=>({height:nativeShipDefinitions.get(37).dimensions.height,sections:nativePrometheusDefinitions.parts.map(p=>({id:p.type,height:p.dimensions.height})),mode:__movieState.prometheus.mode})')
    report['effects']=effects;report['errors']=errors;assert report['height']==90 and report['mode']=='joined' and not errors,report
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True)
    browser.close()
server.shutdown()
