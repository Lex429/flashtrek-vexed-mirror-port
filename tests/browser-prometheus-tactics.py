"""Pilot-lock squadron combat and exhaust gating in the actual game."""
import functools
import base64
import http.server
import importlib.util
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/prometheus-tactics';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('server',ROOT/'tests/browser-npc-performance.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(module.SnapshotHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,channel='msedge');page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
  page.wait_for_function('()=>!!window.nativePrometheusTactics')
  page.evaluate("""()=>{
   const traffic=nativeCivilianTraffic;window.nativeCivilianTraffic={...traffic,initialize(s,...args){window.__squad=s;return traffic.initialize(s,...args);}};
   const frame=nativeSimulationFrame;window.nativeSimulationFrame={...frame,run(){}};
  }""")
  page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>!!window.__squad')
  page.evaluate("""async()=>{
   const s=__squad;nativeShipEquipment.changeHull(s,37);nativeWeaponLoadout.refit(s,[1,10,10]);
   Object.assign(s,{devMode:false,landed:false,phase:'flight',system:2,x:3000,y:-3000,angle:-Math.PI/2,vx:0,vy:0,speed:0,hull:400,shields:500,localCruise:null,arrivalApproach:null,shipyardDock:null,pendingTransit:null});
   await nativePrometheus.preload(s);nativePrometheus.activate(s);
   window.__squadStep=(n)=>{for(let i=0;i<n;i++){nativeSimulation.advance(s,1/60);nativeShipSystems.move(s,s,'player',{speed:0,brake:true},undefined,1/60);nativePrometheus.advance(s,1/60);nativeCombatShots.advance(s,1/60);}};
   __squadStep(60);
   window.__jetPixels=()=>{const c=document.createElement('canvas');c.width=c.height=900;const g=c.getContext('2d'),lead=nativeShipDefinitions.describe(s),wings=nativePrometheus.descriptors(s),view={cx:450,cy:450,ship:{x:s.x,y:s.y},zoom:1};
    for(const layer of ['under','over'])nativePrometheusEffects.paint(g,s,lead,wings,view,layer);const pixels=g.getImageData(0,0,900,900).data;let blue=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>0&&pixels[i+2]>pixels[i+1]*1.03&&pixels[i+2]>pixels[i]*1.4)blue++;return blue;};
   if(!__jetPixels())throw Error('No separation flames');__squadStep(480);
   if(__jetPixels())throw Error('Flames persisted after release');
   window.__targets=[0,1].map(i=>({id:'squad-enemy-'+i,shipType:35,system:2,x:s.x+i*250,y:s.y-400,heading:Math.PI/2,vx:0,vy:0,speed:0,hull:10000,shields:0,phase:'flight'}));
   nativeShipSystems.register('squad-test',{collect:(state,system)=>system===2?__targets.map(e=>nativeShipDefinitions.describe(state,e,{category:'squad-test'})):[],hit:(state,t,amount,impact)=>nativeShipDamage.apply(t,amount,impact)});
   const traffic=nativeCivilianTraffic;window.__activeEnemy=null;window.__selectEnemy=i=>{__activeEnemy=i==null?null:__targets[i];};window.nativeCivilianTraffic={...traffic,target:()=>__activeEnemy};
   nativeShipSystems.invalidateShips(s);__selectEnemy(0);
   if(nativeTargetingActions.snapshot().lock!=='civilian:'+__targets[0].id)throw Error('Pilot lock unavailable');
   __squadStep(1200);
   const actors=[nativeShipDefinitions.describe(s),...nativePrometheus.descriptors(s),nativeShipDefinitions.describe(s,__targets[0],{category:'squad-test'})];
   const c=document.createElement('canvas');c.width=1440;c.height=1000;const ctx=c.getContext('2d');ctx.fillStyle='#06121a';ctx.fillRect(0,0,c.width,c.height);
   const xs=actors.map(d=>d.x),ys=actors.map(d=>d.y),mid={x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2};
   const zoom=Math.min(1120/(Math.max(...xs)-Math.min(...xs)+150),720/(Math.max(...ys)-Math.min(...ys)+150)),view={ship:mid,cx:720,cy:520,zoom};
   ctx.fillStyle='#c4edf4';ctx.font='26px Segoe UI';ctx.fillText('PROMETHEUS / COORDINATED FLANKING',40,50);ctx.font='17px Segoe UI';ctx.fillStyle='#91b2bd';ctx.fillText('Actual combat poses · Blue maneuvering jets inactive',40,82);
   for(const [i,d]of actors.entries()){
    const assets=await nativeShipEffects.prepare(d.shipType,'civilian');nativeShipEffects.paintShip(ctx,d,{...view,asset:assets.assets[0]});
    const x=720+(d.x-mid.x)*zoom,y=520+(d.y-mid.y)*zoom;ctx.textAlign='center';ctx.font='20px Segoe UI';ctx.fillStyle=i===3?'#ffbd91':'#b5eeec';ctx.fillText(i===0?'BETA / PILOT':i===3?'LOCKED ENEMY':d.entity.name.replace('Prometheus ','').toUpperCase()+' / FLANK',x,y+d.dimensions.height*zoom*.6+25);
   }
   window.__squadPlate=c.toDataURL().split(',')[1];
  }""")
  (OUT/'coordinated-flanks.png').write_bytes(base64.b64decode(page.evaluate('__squadPlate')))
  page.screenshot(path=str(OUT/'coordinated-attack.png'))
  report=page.evaluate("""()=>{
   const s=__squad,wings=s.prometheus.sections,target=__targets[0];
   if(!wings.every(e=>e.shots>0&&String(e.prometheusCombat.targetId)===String(target.id)))throw Error('Both escorts must attack the pilot lock '+JSON.stringify({mode:s.prometheus.mode,lock:nativeTargetingActions.snapshot().lock,attack:s.prometheus.attackTargetId,wings:wings.map(e=>({shots:e.shots,plan:e.prometheusCombat}))}));
   const angles=wings.map(e=>Math.atan2(e.y-target.y,e.x-target.x)),spread=Math.abs(nativeShipMotion.wrap(angles[0]-angles[1]));
   if(spread<1.3)throw Error('Attack flanks too close '+spread);if(__jetPixels())throw Error('Blue flames during combat');
   const result={shots:wings.map(e=>e.shots),targetHull:target.hull,spread,roles:wings.map(e=>e.prometheusCombat.side),pilotLock:nativeTargetingActions.snapshot().lock};
   __selectEnemy(1);__squadStep(1);
   if(!wings.every(e=>String(e.prometheusCombat.targetId)===String(__targets[1].id)))throw Error('Retarget not synchronized');
   const hurt=wings[0];hurt.hull=nativeShipDefinitions.get(hurt.shipType).hull*.32;hurt.shields=0;__squadStep(60);
   if(hurt.prometheusCombat.mode!=='recover'||wings[1].prometheusCombat.mode!=='flank')throw Error('Damaged escort must give way');
   result.recovery=true;result.retarget=true;__selectEnemy(null);const shots=wings.map(e=>e.shots);__squadStep(120);
   if(wings.some((e,i)=>e.shots!==shots[i])||s.prometheus.attackTargetId!==null)throw Error('Escorts ignored cleared lock');
   result.clearedLock=true;
   nativePrometheus.recall(s);__squadStep(60);result.recallJetPixels=__jetPixels();if(!result.recallJetPixels)throw Error('Missing recall jets');
   __squadStep(3600);if(s.prometheus.mode!=='joined')throw Error('Combat recall stuck '+JSON.stringify({mode:s.prometheus.mode,dockingAt:s.prometheus.dockingAt,sections:s.prometheus.sections.map(e=>({type:e.shipType,hull:e.hull,phase:e.phase,x:e.x,y:e.y,goal:e.approachTarget,avoid:e.actuatedAvoidance}))}));if(__jetPixels())throw Error('Blue flames after joining');result.joined=true;
   return result;
  }""")
  page.screenshot(path=str(OUT/'rejoined-after-combat.png'))
  assert not errors,errors
  report.update({'passed':True,'errors':errors});(OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True)
  browser.close()
finally:
 server.shutdown()
