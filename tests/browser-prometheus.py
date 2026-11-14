"""Exercise Prometheus artwork and MVAM through the actual game owners."""
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/prometheus'
OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('server',ROOT/'tests/browser-npc-performance.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(module.SnapshotHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel=os.environ.get('BROWSER_CHANNEL','msedge'))
    page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    errors=[]
    def on_error(error):
        errors.append(str(error));print('PAGE ERROR: '+str(error),flush=True)
    page.on('pageerror',on_error)
    page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
    page.wait_for_function('()=>window.startNativeDevGame && window.nativePrometheus')
    print('Game loaded',flush=True)
    page.evaluate("""()=>{
      const owner=nativeCivilianTraffic;
      window.nativeCivilianTraffic={...owner,initialize(s,...args){window.__mvamState=s;return owner.initialize(s,...args);}};
      const frame=nativeSimulationFrame;window.__manualMvam=true;
      window.nativeSimulationFrame={...frame,run(...args){if(!window.__manualMvam)return frame.run(...args);}};
    }""")
    page.locator('[data-menu="dev"]').click()
    page.wait_for_function('()=>!!window.__mvamState',timeout=30000)
    print('Game state captured',flush=True)
    report=page.evaluate("""async()=>{
      const s=__mvamState,check=(v,m)=>{if(!v)throw Error(m)};
      check(nativeShipEquipment.changeHull(s,37).ok,'Could not equip Prometheus');
      nativeWeaponLoadout.refit(s,[1,10,10]);
      s.devMode=false;
      s.landed=false;s.phase='flight';s.localCruise=null;s.arrivalApproach=null;s.pendingTransit=null;s.shipyardDock=null;
      s.x=3000;s.y=-3000;s.angle=-Math.PI/2;s.vx=s.vy=s.speed=0;
      const d=nativeShipDefinitions.forEntity(s,s);s.hull=d.hull*.8;s.shields=d.shields*.6;
      await nativeShipEffects.prepare(37,'player');await nativePrometheus.preload(s);
      window.__mvamInitial={hull:s.hull,shields:s.shields,equipment:Object.keys(s.shipEquipment.instances).sort(),population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1};
      window.__mvamStep=(seconds)=>{const s=__mvamState;for(let i=0;i<Math.ceil(seconds*60);i++){
        nativeSimulation.advance(s,1/60);nativePrometheus.advance(s,1/60);
        nativeShipSystems.move(s,s,'player',nativePrometheus.playerCommand(s,{speed:0,brake:true}),undefined,1/60);
      }};
      nativeShipSystems.invalidateShips(s);
      const plate=document.createElement('canvas');plate.width=1280;plate.height=1680;const pg=plate.getContext('2d');pg.fillStyle='#07111b';pg.fillRect(0,0,1280,1680);
      const art={};for(const [row,id]of [37,3701,3702,3703].entries()){
        const ready=await nativeShipEffects.prepare(id,'civilian'),profile=nativeShipDefinitions.artworkProfile(id);
        check(ready.assets.length===4&&ready.assets.every(a=>a.art),'Missing damage frame '+id);
        check(profile.lights.length>0,'Missing measured lighting '+id);
        const render=(stage,lights,time=1)=>{
          const c=document.createElement('canvas');c.width=320;c.height=420;
          const d=nativeShipDefinitions.get(id),e={shipType:id,system:2,x:0,y:0,heading:-Math.PI/2,hull:d.hull*[1,.7,.4,.1][stage],shields:0},world={system:2,shipSimulation:{version:1,seconds:time}};
          nativeShipEffects.paintShip(c.getContext('2d'),nativeShipDefinitions.describe(world,e,{category:'civilian'}),{ship:{x:0,y:0},cx:160,cy:220,zoom:2.4,asset:ready.assets[stage],appearance:{lights}});return c;
        };
        const pixels=c=>c.getContext('2d').getImageData(0,0,320,420).data;
        const changed=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>8)n++;return n;};
        const lit=changed(pixels(render(0,true)),pixels(render(0,false))),animated=changed(pixels(render(0,true,1)),pixels(render(0,true,2))),dead=changed(pixels(render(3,true)),pixels(render(3,false)));
        check(lit>2&&animated>0,'Lamps must be visible and animated '+id);check(dead===0,'Critical ship lamps must be dark '+id+' '+dead);
        for(let stage=0;stage<4;stage++){pg.drawImage(render(stage,true),stage*320,row*420);pg.fillStyle='#c9edf4';pg.font='14px sans-serif';pg.fillText(id+' / '+['INTACT','LIGHT','HEAVY','SEVERE'][stage],stage*320+20,row*420+28);}
        art[id]={frames:ready.assets.map(a=>[a.width,a.height]),lamps:profile.lights.length,litPixels:lit,animatedPixels:animated,criticalLitPixels:dead};
      }
      window.__mvamPlate=plate.toDataURL().split(',')[1];
      const images={};for(const id of [37,3701,3702,3703])images[id]=await Promise.all(nativeShipDefinitions.artworkProfile(id).artworkFrames.map(file=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src='../flashtrek-broken-mirror/showcase-assets/'+file;})));
      const assembly=[];for(let stage=0;stage<4;stage++){
        const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=512;a.height=b.height=1024;const ag=a.getContext('2d'),bg=b.getContext('2d');ag.drawImage(images[37][stage],0,0);
        for(const key of ['bottom','middle','top']){const part=prometheusArtwork.parts.find(p=>p.key===key),r=prometheusArtwork.layout[key];bg.drawImage(images[part.type][stage],r.x,r.y);}
        const x=ag.getImageData(0,0,512,1024).data,y=bg.getImageData(0,0,512,1024).data;let max=0;
        for(let i=0;i<x.length;i+=4){max=Math.max(max,Math.abs(x[i+3]-y[i+3]));for(let k=0;k<3;k++)max=Math.max(max,Math.abs(x[i+k]*x[i+3]-y[i+k]*y[i+3])/255);}
        // Three source-over layers can each round one 8-bit channel step.
        check(max<=3,'Joined state does not match section stack '+stage+' '+max);assembly.push({stage,maxPremultipliedPixelError:max});
      }
      return {art,assembly,population:__mvamInitial.population,joined:nativeShipDefinitions.describe(s).dimensions};
    }""")
    import base64
    (OUT/'all-damage-stages.png').write_bytes(base64.b64decode(page.evaluate('__mvamPlate')))
    page.screenshot(path=str(OUT/'joined.png'))
    report['activate']=page.evaluate("""()=>{
      const s=__mvamState,result=nativePrometheus.activate(s);if(!result.ok)throw Error(result.error);
      const sum=field=>s[field]+s.prometheus.sections.reduce((n,e)=>n+e[field],0);
      if(Math.abs(sum('hull')-__mvamInitial.hull)>1e-6||Math.abs(sum('shields')-__mvamInitial.shields)>1e-6)throw Error('Separation changed vitals');
      if(nativeShipDefinitions.describe(s).shipType!==3702)throw Error('Player did not become Beta');
      const activeFitted=[...nativeWeaponLoadout.equipped(s),...s.prometheus.sections.flatMap(e=>nativeWeaponLoadout.equipped(s,e))];if(new Set(activeFitted.map(v=>v.instance.id)).size!==activeFitted.length)throw Error('Duplicated equipped weapons');
      return nativePrometheus.snapshot(s);
    }""")
    page.evaluate('__mvamStep(.8)');page.screenshot(path=str(OUT/'separating.png'))
    page.evaluate('__mvamStep(8)');page.screenshot(path=str(OUT/'deployed.png'))
    report['deployed']=page.evaluate('()=>{const result=nativePrometheus.snapshot(__mvamState);window.__formationBefore=result.sections;return result;}')
    report['combat']=page.evaluate("""()=>{
      const s=__mvamState,enemy={id:'mvam-enemy',shipType:35,system:s.system,x:s.x,y:s.y-350,heading:Math.PI/2,hull:10000,shields:0,phase:'flight'};
      nativeShipSystems.register('mvam-test',{collect:(state,system)=>system===enemy.system?[nativeShipDefinitions.describe(state,enemy,{category:'mvam-test'})]:[],hit:(state,target,damage,impact)=>nativeShipDamage.apply(target,damage,impact)});
      nativeShipSystems.invalidateShips(s);
      const traffic=nativeCivilianTraffic;window.nativeCivilianTraffic={...traffic,target:()=>enemy};
      const emissions=[],fire=nativeCombatShots.fireFor;
      window.nativeCombatShots={...nativeCombatShots,fireFor(options){const result=fire(options);if(result.ok)emissions.push({source:options.shooter.id,instance:result.event.weaponInstanceId});return result;}};
      for(let i=0;i<60*45;i++){__mvamStep(1/60);nativeCombatShots.advance(s,1/60);}
      const result={...nativePrometheus.snapshot(s),enemyHull:enemy.hull,emissions,details:s.prometheus.sections.map(e=>({speed:e.speed,heading:e.heading,intent:e.avoidanceIntent,phase:e.phase,movement:nativeShipDefinitions.describe(s,e,{category:'prometheus'}).definition.movement}))};
      if(!s.prometheus.sections.every(e=>e.shots>0))throw Error('Both escorts must fire '+JSON.stringify(result));
      if(!result.sections.every((e,i)=>Math.hypot(e.x-window.__formationBefore[i].x,e.y-window.__formationBefore[i].y)>20))throw Error('Escorts did not maneuver into attack positions');
      if(!(enemy.hull<10000))throw Error('Escort weapons did not damage the target');
      for(const e of emissions)if(!__mvamInitial.equipment.includes(e.instance))throw Error('Escort fired an unowned weapon');
      const first=nativeWeaponLoadout.equipped(s,s)[0];
      if(emissions.some(e=>e.instance===first.instance.id))throw Error('Escorts consumed the reserved player weapon');
      const manual=nativeCombatShots.fireFor({state:s,shooter:nativeShipDefinitions.describe(s),target:nativeShipDefinitions.describe(s,enemy,{category:'mvam-test'}),selection:[first]});
      if(!manual.ok)throw Error('Player could not fire their reserved bank: '+manual.error);result.playerFire=true;
      window.nativeCivilianTraffic=traffic;s.prometheus.attackTargetId=null;enemy.phase='destroyed';enemy.hull=0;return result;
    }""")
    page.screenshot(path=str(OUT/'attack.png'))
    report['reload']=page.evaluate("""()=>{
      const saved=JSON.parse(JSON.stringify(__mvamState)),before=nativePrometheus.snapshot(saved);
      resumeNativeGame('dev',saved);const after=nativePrometheus.snapshot(__mvamState);
      if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Save/reload changed the deployed group');
      return {restored:true,mode:after.mode,sections:after.sections.length};
    }""")
    report['recall']=page.evaluate("""()=>{nativePrometheus.recall(__mvamState);__mvamStep(40);return nativePrometheus.snapshot(__mvamState)}""")
    if report['recall']['mode']!='joined':
      print(page.evaluate("""()=>{const s=__mvamState,lead={x:s.x,y:s.y,heading:s.angle,vx:s.vx,vy:s.vy,omega:s.motionAngularVelocity||0};return {mode:s.prometheus.mode,dockingAt:s.prometheus.dockingAt,sections:s.prometheus.sections.map(e=>({type:e.shipType,relative:nativeShipMotion.framePose(e,{from:lead,to:lead}),goal:e.approachTarget,phase:e.phase,hull:e.hull,heading:e.heading,omega:e.motionAngularVelocity,avoid:e.actuatedAvoidance}))};}"""),flush=True)
      raise AssertionError('Manual combat recall failed')
    page.screenshot(path=str(OUT/'rejoined.png'))
    report['final']=page.evaluate("""()=>{const s=__mvamState;return {hull:s.hull,shields:s.shields,type:nativeShipDefinitions.describe(s).shipType,equipment:Object.keys(s.shipEquipment.instances).sort(),initial:__mvamInitial}}""")
    # Release the real host scheduler and exercise the controls the player uses.
    page.evaluate('()=>{__mvamStep(Math.max(0,(__mvamState.prometheus.cooldownUntil||0)-nativeSimulation.seconds(__mvamState))+.05);window.__manualMvam=false;__mvamState.devMode=true;nativePrometheus.updateUi(__mvamState,true)}')
    page.keyboard.press('v')
    try:
      page.wait_for_function('()=>nativePrometheus.snapshot(__mvamState).mode==="deployed"',timeout=30000)
    except Exception:
      print(page.evaluate("()=>({mode:__mvamState.prometheus.mode,at:nativeSimulation.seconds(__mvamState),hull:__mvamState.hull,phase:__mvamState.phase,blocked:nativeSimulation.blocked(),allowed:nativePrometheus.allowed(__mvamState),button:document.querySelector('#multiVectorBtn').outerHTML,body:document.body.className,sections:__mvamState.prometheus.sections.map(e=>({type:e.shipType,x:e.x,y:e.y,stage:e.prometheusReturn,goal:e.approachTarget}))})"),flush=True)
      raise
    page.screenshot(path=str(OUT/'live-formation.png'))
    samples=[]
    for _ in range(12):
        page.wait_for_timeout(100)
        samples.append(page.evaluate('()=>({at:nativeSimulation.seconds(__mvamState),...nativePrometheus.snapshot(__mvamState)})'))
    page.locator('#multiVectorBtn').click()
    page.wait_for_function('()=>nativePrometheus.snapshot(__mvamState).mode==="joined"',timeout=60000)
    report['liveControls']={'keyVLaunched':True,'buttonRecalled':True,'samples':samples}
    page.screenshot(path=str(OUT/'live-rejoined.png'))
    report['errors']=errors
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps({'passed':not errors and report['recall']['mode']=='joined','art':report['art'],'escortShots':[e['shots'] for e in report['combat']['sections']],'enemyHull':report['combat']['enemyHull'],'reload':report['reload'],'recalled':report['recall']['mode'],'errors':errors}),flush=True)
    assert report['recall']['mode']=='joined','Sections failed to rejoin'
    assert report['final']['type']==37
    assert abs(report['final']['hull']-report['final']['initial']['hull'])<1e-6
    assert report['final']['equipment']==report['final']['initial']['equipment']
    assert not errors,errors
    browser.close()
server.shutdown()
