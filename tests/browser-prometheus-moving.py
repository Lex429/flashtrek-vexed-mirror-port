"""Real W+D flight through split and reconnection, with a shareable recording."""
import base64
import functools
import http.server
import importlib.util
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/prometheus-moving';OUT.mkdir(parents=True,exist_ok=True)
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
      const traffic=nativeCivilianTraffic;window.nativeCivilianTraffic={...traffic,initialize(s,...args){window.__movingShip=s;return traffic.initialize(s,...args);}};
      const frame=nativeSimulationFrame;window.__movingManual=true;window.nativeSimulationFrame={...frame,run(...args){if(!__movingManual)return frame.run(...args);}};
    }""")
    page.locator('[data-menu="dev"]').click()
    page.wait_for_function('()=>!!window.__movingShip')
    page.evaluate("""async()=>{
      const s=__movingShip;nativeShipEquipment.changeHull(s,37);s.landed=false;s.phase='flight';s.localCruise=null;s.arrivalApproach=null;s.shipyardDock=null;s.pendingTransit=null;
      s.x=3000;s.y=-3000;s.angle=-Math.PI/2;s.speed=s.vx=s.vy=0;
      await nativeShipEffects.prepare(37,'player');await nativePrometheus.preload(s);
      resumeNativeGame('dev',JSON.parse(JSON.stringify(s)));nativePrometheus.updateUi(__movingShip,true);
      window.__flightSamples=[];window.__lockErrors=[];
      const ships=nativeShipSystems;window.nativeShipSystems={...ships,move(...args){
        const result=ships.move(...args),[state,entity,category,command]=args;
        if(category==='prometheus'&&command.referenceFrame&&state.prometheus?.dockingAt!=null){const p=nativeShipMotion.framePose(entity,command.referenceFrame);__lockErrors.push({at:nativeSimulation.seconds(state),error:Math.hypot(p.x-command.goal.x,p.y-command.goal.y),speed:Math.hypot(p.vx,p.vy),angle:Math.abs(nativeShipMotion.wrap(p.heading+Math.PI/2))});}return result;
      }};
      const mvam=nativePrometheus;window.nativePrometheus={...mvam,advance(state,dt){mvam.advance(state,dt);if(__flightSamples.length===0||nativeSimulation.seconds(state)-__flightSamples.at(-1).at>.09)__flightSamples.push({at:nativeSimulation.seconds(state),x:state.x,y:state.y,angle:state.angle,speed:state.speed,mode:state.prometheus?.mode||'joined'});}};
      window.__movingManual=false;
    }""")
    page.keyboard.down('w')
    page.wait_for_function('()=>__movingShip.speed>350',timeout=30000)
    page.keyboard.down('d')
    page.wait_for_timeout(350)
    page.evaluate("""()=>{
      const recorder=new MediaRecorder(document.querySelector('#space').captureStream(30),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000}),chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.__movingRecorder=recorder;
      window.__movingVideo=new Promise(resolve=>recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});recorder.start();
    }""")
    page.keyboard.press('v')
    page.wait_for_function('()=>__movingShip.prometheus?.mode==="separating"')
    page.wait_for_function('()=>nativeSimulation.seconds(__movingShip)-__movingShip.prometheus.startedAt>1.3')
    page.screenshot(path=str(OUT/'turning-split.png'))
    page.wait_for_function('()=>__movingShip.prometheus.mode==="deployed"')
    page.wait_for_timeout(700)
    page.keyboard.press('v')
    page.wait_for_function('()=>__movingShip.prometheus.dockingAt!=null',timeout=60000)
    page.wait_for_function('()=>nativeSimulation.seconds(__movingShip)-__movingShip.prometheus.dockingAt>.65')
    page.screenshot(path=str(OUT/'turning-dock.png'))
    page.wait_for_function('()=>__movingShip.prometheus.mode==="joined"',timeout=30000)
    page.screenshot(path=str(OUT/'turning-rejoined.png'))
    page.wait_for_timeout(600)
    page.keyboard.up('w');page.keyboard.up('d')
    page.evaluate('__movingRecorder.stop()')
    (OUT/'prometheus-turning-rejoin.webm').write_bytes(base64.b64decode(page.evaluate('()=>__movingVideo')))
    report=page.evaluate("""()=>{
      const active=__flightSamples.filter(p=>p.mode!=='joined'),recall=active.filter(p=>p.mode==='recalling');
      const angularTravel=recall.reduce((n,p,i)=>n+(i?Math.abs(nativeShipMotion.wrap(p.angle-recall[i-1].angle)):0),0);
      return {samples:__flightSamples,lockErrors:__lockErrors,joined:__movingShip.prometheus.mode==='joined',minimumRecallSpeed:Math.min(...recall.map(p=>p.speed)),turnDuringRecall:angularTravel};
    }""")
    report['errors']=errors
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    assert report['joined'] and report['minimumRecallSpeed']>80 and report['turnDuringRecall']>.5 and not errors,report
    print(json.dumps({key:report[key] for key in ['joined','minimumRecallSpeed','turnDuringRecall','errors']}),flush=True)
    browser.close()
server.shutdown()
