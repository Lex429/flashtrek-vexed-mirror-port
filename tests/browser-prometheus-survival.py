"""Live player-loss routing, partial docking and a paid single-DOT rebuild."""
import base64
import functools
import http.server
import importlib.util
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/prometheus-survival';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('server',ROOT/'tests/browser-npc-performance.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(module.SnapshotHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='msedge');page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
    page.wait_for_function('()=>!!window.nativePrometheus')
    page.evaluate("""()=>{
      const traffic=nativeCivilianTraffic;window.nativeCivilianTraffic={...traffic,initialize(s,...args){window.__survival=s;return traffic.initialize(s,...args);}};
      const frame=nativeSimulationFrame;window.nativeSimulationFrame={...frame,run(){}};
    }""")
    page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>!!window.__survival')
    page.evaluate("""async()=>{
      const s=__survival;nativeShipEquipment.changeHull(s,37);Object.assign(s,{devMode:false,landed:false,phase:'flight',x:3000,y:-3000,angle:-Math.PI/2,speed:0,vx:0,vy:0,shields:0,localCruise:null,arrivalApproach:null,shipyardDock:null,pendingTransit:null,deuranium:100});
      s.hull=nativeShipDefinitions.get(37).hull;nativeShipRepairs.setRepairMode(s,'manual');
      const drones=nativeShipEquipment.ensure(s).slots.repairDrone.map(id=>s.shipEquipment.instances[id]).filter(Boolean);if(!drones.length)throw Error('Fixture needs an existing DOT');
      for(const d of drones.slice(1)){d.hull=0;d.phase='destroyed';}
      await nativeShipEffects.prepare(37,'player');await nativePrometheus.preload(s);window.__survivalBase=JSON.parse(JSON.stringify(s));
      window.__survivalStep=(seconds,repairs=false)=>{const s=__survival,dt=repairs?.25:1/60;for(let i=0;i<Math.ceil(seconds/dt);i++){
       nativeSimulation.advance(s,dt);nativeShipSystems.move(s,s,'player',{brake:true,manualFlight:true},undefined,dt);nativePrometheus.advance(s,dt);if(repairs)nativeShipRepairs.advance(s,dt);nativeShipEffects.advance(s,dt);
      }};
      window.__survivalKill=type=>{const s=__survival;if(nativePrometheus.typeFor(s)===type)return nativeCombatShots.onPlayerHit(s,s.hull+s.shields+1000,{kind:'beam',from:{x:s.x-200,y:s.y},sourceId:'test'});
       const e=s.prometheus.sections.find(e=>e.shipType===type);return nativeShipSystems.applyDamage(s,nativeShipDefinitions.describe(s,e,{category:'prometheus'}),e.hull+e.shields+1000,{kind:'beam',from:{x:e.x-200,y:e.y}});};
      window.__survivalImage=()=>{const s=__survival,c=document.createElement('canvas');c.width=700;c.height=900;const g=c.getContext('2d',{willReadFrequently:true});
       nativePrometheus.paintPlayer(g,s,nativeShipDefinitions.describe(s),{ship:s,cx:350,cy:450,zoom:4,appearance:{lights:false}});return c.toDataURL().split(',')[1];};
      window.__survivalLayerProof=()=>{const s=__survival,before=JSON.stringify(s),actual=document.createElement('canvas'),expected=document.createElement('canvas');actual.width=expected.width=700;actual.height=expected.height=900;
       const a=actual.getContext('2d',{willReadFrequently:true}),b=expected.getContext('2d',{willReadFrequently:true}),view={ship:s,cx:350,cy:450,zoom:4,appearance:{lights:false}};
       nativePrometheus.paintPlayer(a,s,nativeShipDefinitions.describe(s),view);
       for(const key of ['bottom','middle','top']){const part=nativePrometheusDefinitions.parts.find(p=>p.key===key),record=s.prometheus.assembly.parts.find(p=>p.type===part.type);if(record.build<=0)continue;
        const d=nativeShipDefinitions.get(37).dimensions,angle=s.angle+Math.PI/2,x=part.offset.x*d.width,y=part.offset.y*d.height,e={shipType:part.type,system:s.system,x:s.x+x*Math.cos(angle)-y*Math.sin(angle),y:s.y+x*Math.sin(angle)+y*Math.cos(angle),heading:s.angle,hull:record.hull,shields:0,phase:'flight'};
        nativeShipEffects.paintShip(b,nativeShipDefinitions.describe(s,e,{category:'prometheus'}),view);}
       const x=a.getImageData(0,0,700,900).data,y=b.getImageData(0,0,700,900).data;let max=0,visible=0;for(let i=0;i<x.length;i++){max=Math.max(max,Math.abs(x[i]-y[i]));if(i%4===3&&x[i]>100)visible++;}
       if(max>1||visible<500||JSON.stringify(s)!==before)throw Error('Incorrect partial layer rendering '+max+'/'+visible);return {maximumChannelError:max,visiblePixels:visible,readOnly:true};};
    }""")
    report={'cases':[]}
    for survivors in [[3701,3702],[3701,3703],[3702,3703],[3701],[3702],[3703]]:
        result=page.evaluate("""async survivors=>{
          resumeNativeGame('dev',JSON.parse(JSON.stringify(__survivalBase)));const s=__survival;await nativePrometheus.preload(s);nativePrometheus.activate(s);__survivalStep(9);
          for(const type of [3701,3703])if(!survivors.includes(type))__survivalKill(type);
          if(!survivors.includes(3702)){const result=__survivalKill(3702);if(!result.transferred||nativePlayerDestruction.pending)throw Error('Player death was not intercepted');}
          const hp=s.hull+s.prometheus.sections.filter(e=>e.hull>0).reduce((n,e)=>n+e.hull,0),controlled=nativePrometheus.typeFor(s);nativePrometheus.recall(s);__survivalStep(35);
          if(s.prometheus.mode!=='joined'||!s.prometheus.assembly||Math.abs(s.hull-hp)>1e-6)throw Error('Partial docking failed '+survivors);
          const present=s.prometheus.assembly.parts.filter(p=>p.build>0).map(p=>p.type);if(JSON.stringify(present)!==JSON.stringify(survivors))throw Error('Wrong partial hulls');
          const before=JSON.stringify(s.prometheus);resumeNativeGame('dev',JSON.parse(JSON.stringify(s)));if(JSON.stringify(__survival.prometheus)!==before)throw Error('Partial assembly did not restore');
          return {survivors,controlled,hull:__survival.hull,playerDeathPending:nativePlayerDestruction.pending,layers:__survivalLayerProof()};
        }""",survivors)
        report['cases'].append(result);(OUT/('survivors-'+'-'.join(map(str,survivors))+'.png')).write_bytes(base64.b64decode(page.evaluate('__survivalImage()')))
    # The last fixture is Gamma alone, with its real, surviving DOT.
    page.screenshot(path=str(OUT/'single-survivor.png'))
    report['repairStart']=page.evaluate("""()=>{const s=__survival,owned=Object.keys(s.shipEquipment.instances).sort();window.__repairBefore={hull:s.hull,ore:s.deuranium,owned};const result=nativeShipRepairs.deployPlayer(s);if(!result.ok||result.drones!==1)throw Error('Expected exactly one existing DOT');return result;}""")
    page.evaluate('__survivalStep(70,true)');page.screenshot(path=str(OUT/'reconstruction-progress.png'))
    (OUT/'reconstruction-hull.png').write_bytes(base64.b64decode(page.evaluate('__survivalImage()')))
    report['progress']=page.evaluate("""()=>{const s=__survival,parts=s.prometheus.assembly.parts;if(!parts.filter(p=>p.wasMissing).every(p=>p.build>0&&p.build<1))throw Error('No gradual reconstruction');return {hull:s.hull,ore:s.deuranium,build:parts.map(p=>({type:p.type,build:p.build}))};}""")
    page.evaluate("""()=>{const saved=JSON.parse(JSON.stringify(__survival));resumeNativeGame('dev',saved);__survivalStep(260,true)}""")
    report['complete']=page.evaluate("""()=>{const s=__survival,b=__repairBefore,max=nativeShipDefinitions.get(37).hull;
      if(s.prometheus.assembly||s.prometheus.lost||Math.abs(s.hull-max)>1e-6)throw Error('Reconstruction did not finish');
      if(Math.abs((b.ore-s.deuranium)-(s.hull-b.hull)/nativeShipRepairs.rules.hullPerTon)>1e-6)throw Error('Incorrect repair material use');
      if(JSON.stringify(Object.keys(s.shipEquipment.instances).sort())!==JSON.stringify(b.owned))throw Error('Repair duplicated equipment');
      if(nativeShipRepairs.playerDronesDeployed(s))throw Error('DOT failed to return');
      return {hull:s.hull,spent:b.ore-s.deuranium,allSectionsRestored:true,DOTs:s.repairBay.slots.map(d=>({id:d.id,hull:d.hull,phase:d.phase}))};
    }""")
    page.screenshot(path=str(OUT/'reconstruction-complete.png'))
    report['lastLoss']=page.evaluate("""()=>{const s=__survival;nativePrometheus.activate(s);__survivalKill(3701);__survivalKill(3703);const result=__survivalKill(3702);if(!result.destroyed||!nativePlayerDestruction.pending)throw Error('Losing the final section must start normal recovery');return {destroyed:result.destroyed,normalRecoveryPending:nativePlayerDestruction.pending};}""")
    report['errors']=errors;(OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');assert not errors,errors
    print(json.dumps(report),flush=True);browser.close()
server.shutdown()
