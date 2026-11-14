"""Observe real escort piloting through acceleration, both turns and braking."""
import base64
import functools
import http.server
import importlib.util
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/prometheus-physical-flight';OUT.mkdir(parents=True,exist_ok=True)
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
      const traffic=nativeCivilianTraffic;window.nativeCivilianTraffic={...traffic,initialize(s,...args){window.__escortState=s;return traffic.initialize(s,...args);}};
      const frame=nativeSimulationFrame;window.__escortManual=true;window.nativeSimulationFrame={...frame,run(...args){if(!__escortManual)return frame.run(...args);}};
    }""")
    page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>!!window.__escortState')
    page.evaluate("""async()=>{
      const s=__escortState;nativeShipEquipment.changeHull(s,37);s.landed=false;s.phase='flight';s.localCruise=null;s.arrivalApproach=null;s.shipyardDock=null;s.pendingTransit=null;
      s.x=3000;s.y=-3000;s.angle=-Math.PI/2;s.speed=s.vx=s.vy=0;
      await nativeShipEffects.prepare(37,'player');await nativePrometheus.preload(s);resumeNativeGame('dev',JSON.parse(JSON.stringify(s)));nativePrometheus.updateUi(__escortState,true);
      window.__escortSamples=[];window.__escortPhase='setup';window.__forceProof={steps:0,maximumVelocityError:0,maximumSpinError:0};
      const mvam=nativePrometheus;window.nativePrometheus={...mvam,advance(state,dt){
       const before=(state.prometheus?.sections||[]).map(e=>({id:e.id,vx:e.vx,vy:e.vy,omega:e.motionAngularVelocity||0}));
       mvam.advance(state,dt);
       for(const e of state.prometheus?.sections||[]){const b=before.find(v=>v.id===e.id),a=e.motionActuation;if(!b||!a||e.motionKick||e.motionFlow||e.motionSpin)continue;
        __forceProof.steps++;__forceProof.maximumVelocityError=Math.max(__forceProof.maximumVelocityError,Math.hypot(e.vx-b.vx-a.ax*dt,e.vy-b.vy-a.ay*dt));__forceProof.maximumSpinError=Math.max(__forceProof.maximumSpinError,Math.abs(e.motionAngularVelocity-b.omega-a.alpha*dt));}
       if(state.prometheus?.mode!=='deployed')return;
       const at=nativeSimulation.seconds(state);if(__escortSamples.length&&at-__escortSamples.at(-1).at<.08)return;
       const anchor=state.prometheus.lastLead,frame={from:anchor,to:anchor},fx=nativePrometheusEffects.snapshot(state);
       __escortSamples.push({at,phase:__escortPhase,lead:{speed:state.speed,heading:state.angle},escorts:state.prometheus.sections.map(e=>{const controls=fx.find(v=>v.id===e.id);return {id:e.id,x:e.x-state.x,y:e.y-state.y,heading:e.heading,local:nativeShipMotion.framePose(e,frame),fx:{thrust:controls.thrust,braking:controls.braking,yaw:controls.yaw}};})});
      }};window.__escortManual=false;
    }""")
    page.evaluate("""()=>{
      const recorder=new MediaRecorder(document.querySelector('#space').captureStream(30),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000}),chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.__escortRecorder=recorder;
      window.__escortVideo=new Promise(resolve=>recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});recorder.start();
    }""")
    page.keyboard.press('v');page.wait_for_function('()=>__escortState.prometheus?.mode==="deployed"')
    page.wait_for_function('()=>nativeSimulation.seconds(__escortState)-__escortState.prometheus.startedAt>4')
    def phase(name,seconds):
        page.evaluate('(name)=>{window.__escortPhase=name;window.__escortPhaseAt=nativeSimulation.seconds(__escortState)}',name)
        page.wait_for_function('(seconds)=>nativeSimulation.seconds(__escortState)-__escortPhaseAt>seconds',arg=seconds,timeout=30000)
    phase('idle',2)
    page.keyboard.down('w');phase('accelerating',1.5)
    page.wait_for_function('()=>__escortState.speed>330',timeout=30000)
    phase('straight',1.5);page.screenshot(path=str(OUT/'straight-flight.png'))
    page.keyboard.down('d');phase('right',1.1);page.screenshot(path=str(OUT/'following-right.png'));page.keyboard.up('d')
    page.keyboard.down('a');phase('left',1.3);page.screenshot(path=str(OUT/'following-left.png'));page.keyboard.up('a')
    phase('recovering',1.2);page.keyboard.up('w');page.keyboard.down('x');phase('braking',1.5);page.keyboard.up('x')
    phase('settling',1.8);page.screenshot(path=str(OUT/'station-keeping.png'))
    page.keyboard.press('v');page.wait_for_function('()=>__escortState.prometheus.mode==="joined"',timeout=60000)
    page.wait_for_timeout(400);page.evaluate('__escortRecorder.stop()')
    (OUT/'active-escort-flight.webm').write_bytes(base64.b64decode(page.evaluate('()=>__escortVideo')))
    report=page.evaluate("""()=>{
      const samples=__escortSamples.filter(r=>r.phase!=='setup'),wrap=nativeShipMotion.wrap,span=v=>Math.max(...v)-Math.min(...v),idle=samples.filter(r=>r.phase==='idle');
      return {samples,forceProof:__forceProof,joined:__escortState.prometheus.mode==='joined',maximumSeparation:Math.max(...samples.flatMap(r=>r.escorts.map(e=>Math.hypot(e.x,e.y)))),
       independentHeading:Math.max(...samples.map(r=>Math.abs(wrap(r.escorts[0].heading-r.escorts[1].heading)))),
       pilots:[0,1].map(i=>({id:samples[0].escorts[i].id,idleMovement:Math.hypot(span(idle.map(r=>r.escorts[i].local.x)),span(idle.map(r=>r.escorts[i].local.y))),
        headingChange:span(samples.map(r=>wrap(r.escorts[i].heading-r.lead.heading))),thrustVariation:span(samples.map(r=>r.escorts[i].fx.thrust)),maximumBraking:Math.max(...samples.map(r=>r.escorts[i].fx.braking))}))};
    }""")
    report['errors']=errors;(OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    assert report['joined'] and report['maximumSeparation']<260 and report['independentHeading']>.04 and not errors,{key:value for key,value in report.items() if key!='samples'}
    assert all(pilot['idleMovement']<1 and pilot['headingChange']>.2 and pilot['thrustVariation']>.15 for pilot in report['pilots']),report['pilots']
    assert report['forceProof']['steps']>100 and report['forceProof']['maximumVelocityError']<1e-7 and report['forceProof']['maximumSpinError']<1e-7,report['forceProof']
    print(json.dumps({key:value for key,value in report.items() if key!='samples'}),flush=True);browser.close()
server.shutdown()
