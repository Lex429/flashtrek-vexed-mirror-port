"""Production deuranium sprites, real player controls and an Olympic supply/rescue life."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'/'deuranium-mining'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

RANDOM_ISOLATION=r'''()=>{
  const check=(v,m)=>{if(!v)throw Error(m);},clone=v=>JSON.parse(JSON.stringify(v)),base=clone(__deuraniumState),
    rock=nativeSolAsteroids.forSystem(43).find(r=>r.oreType==='deuranium'),originalAngle=rock.angle,
    random=Math.random,impacts=nativeEnvironmentalImpacts,results=[],evidence=Object.assign(document.createElement('canvas'),{width:800,height:600,id:'mining-rng-evidence'});
  const hash=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;return h.toString(16);};
  check(!nativeSimulation.blocked(),'The isolated replay requires an unblocked manual simulation');
  // The ordinary artwork assertions above already warmed all four real damage
  // images. This comparison isolates painting from the shared physical owner;
  // separate cold-debris regressions cover image-independent physical admission.
  for(const damage of [0,.35,.6,.8]){const image=nativeSolAsteroids.image(nativeSolAsteroids.frame(rock,damage*rock.maxHull));check(image.complete&&image.naturalWidth,'Replay artwork is not ready');}
  try{
    for(const camera of ['none','visible','moving']){
      let seed=4292026,calls=0;Math.random=()=>{calls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const s=clone(base),physical=[],canvas=Object.assign(document.createElement('canvas'),{width:800,height:600}),g=canvas.getContext('2d');
      Object.assign(s,{system:43,x:rock.x-350,y:rock.y,angle:Math.PI/2,speed:0,vx:0,vy:0,phase:'flight',landed:false,miningOperation:null,
        shipSimulation:{version:1,seconds:0},asteroidDamage:{},asteroidOreDrops:{},minedAsteroids:[],
        destroyedAsteroids:nativeSolAsteroids.forSystem(43).filter(other=>other.slotId!==rock.slotId).map(other=>other.slotId),
        populationClock:0,planetPopulationCounts:{1:1000000000,2:2000000000},solPopulations:{3:1000000000,4:100000000}});
      s.civilianTraffic.ships=[];s.solEconomy.freighters=[];delete s.localCruise;delete s.arrivalApproach;delete s.motionKick;delete s.motionSpin;
      nativeAsteroidCombat.clear();impacts.reset();nativeShipSystems.invalidate(s);
      window.nativeEnvironmentalImpacts={...impacts,debris(state,p,oldX,oldY,options){
        const result=impacts.debris(state,p,oldX,oldY,options);physical.push({x:p.x,y:p.y,vx:p.vx,vy:p.vy,spin:p.spin,oldX,oldY});return result;}};
      nativeAsteroidCombat.select(rock);check(nativeAsteroidCombat.mine(s,{x:s.x,y:s.y}).ok,'Actual mining owner rejected the replay');
      for(let step=0;step<36;step++){
        rock.angle=originalAngle+step*.017;
        nativeSimulation.advance(s,.25);nativeAsteroidCombat.advance(s,.25);impacts.advance(s,.25);
        if(camera==='none')continue;
        const offset=camera==='moving'&&step%4!==0?5000:0;
        g.clearRect(0,0,800,600);g.save();g.translate(400,300);g.rotate(step*.013);g.translate(-400,-300);
        nativeAsteroidCombat.paint(g,{state:s,ship:{x:rock.x+offset,y:rock.y},cx:400,cy:300,zoom:1,w:800,h:600});g.restore();
        if(camera==='visible'&&step===11)evidence.getContext('2d').drawImage(canvas,0,0);
      }
      nativePopulation.advanceSeconds(s,3);
      const future=Array.from({length:8},()=>Math.random()),outcome={damage:s.asteroidDamage,ore:s.asteroidOreDrops,mined:s.minedAsteroids,
        hull:s.hull,shields:s.shields,minerals:s.minerals,latinum:s.latinum,population:s.planetPopulationCounts,settlements:s.solPopulations,physical,future,calls};
      check(physical.length>0&&s.minedAsteroids.includes(rock.slotId)&&s.asteroidOreDrops[rock.slotId]===15,'Replay lost physical chips or mining entitlement');
      if(results.length)check(JSON.stringify(outcome)===JSON.stringify(results[0].outcome),'Camera/rotation painting changed actual mining, physical debris, population or future gameplay RNG');
      results.push({camera,outcome});canvas.width=canvas.height=0;
    }
  }finally{Math.random=random;window.nativeEnvironmentalImpacts=impacts;rock.angle=originalAngle;nativeAsteroidCombat.clear();impacts.reset();}
  const image=evidence.getContext('2d').getImageData(0,0,800,600).data;
  let support=0;for(let i=3;i<image.length;i+=4)if(image[i]>30)support++;
  check(support>100,'The replay must capture real visible mining artwork');
  evidence.style.cssText='position:absolute;left:0;top:0;z-index:2147483647';document.body.append(evidence);
  return {cameraSchedules:results.map(row=>row.camera),sameAuthoritativeOutcomes:true,physicalSamples:results[0].outcome.physical.length,
    minedOreMask:15,gameplayRandomCalls:results[0].outcome.calls,outcomeHash:hash(JSON.stringify(results[0].outcome)),visiblePaintedPixels:support,
    scope:'Synchronous isolated actual mining/debris/population replay with equal ready artwork; no frame-rate claim or gameplay RNG isolation shortcut'};
}'''

server=None
if len(sys.argv)>1:base=sys.argv[1].rstrip('/')
else:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,**({'channel':os.environ.get('BROWSER_CHANNEL','msedge')} if os.environ.get('BROWSER_CHANNEL','msedge') else {}))
        page=browser.new_page(viewport={'width':1450,'height':1000})
        errors=[];failed=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:failed.append(f'{r.status} {r.url}') if r.status>=400 else None)
        page.goto(base+'/html-games/broken-mirror-port/index.html')
        page.locator('[data-menu="dev"]').click(timeout=30000)
        page.wait_for_function('window.nativeNpcDev?.getState() && nativeSolAsteroids.placements.length')
        report={}
        report['artwork']=page.evaluate(r'''async()=>{
          const check=(v,m)=>{if(!v)throw Error(m);};
          const rock=nativeSolAsteroids.forSystem(43).find(r=>r.oreType==='deuranium');
          const files=[0,.35,.6,.8].map(d=>nativeSolAsteroids.frame(rock,d*rock.maxHull));files.push(rock.oreImage);
          const images=[];
          for(const file of files){
            let im;for(let i=0;i<500;i++){im=nativeSolAsteroids.image(file);if(im.complete&&im.naturalWidth&&im.src.endsWith(file))break;await new Promise(r=>setTimeout(r,20));}
            check(im?.complete&&im.naturalWidth&&im.src.endsWith(file),'Missing '+file);images.push(im);
          }
          const canvas=Object.assign(document.createElement('canvas'),{width:1440,height:880,id:'deuranium-art-review'}),g=canvas.getContext('2d');
          g.fillStyle='#09131e';g.fillRect(0,0,1440,880);g.fillStyle='#e6f4ff';g.font='bold 36px Segoe UI';g.fillText('Deuranium asteroid: actual game damage states',38,58);
          const labels=['Intact','Light damage','Heavy damage','Severe damage'],stats=[];let previous;
          images.slice(0,4).forEach((im,col)=>{
            const c=Object.assign(document.createElement('canvas'),{width:512,height:512}),cg=c.getContext('2d',{willReadFrequently:true});cg.drawImage(im,0,0,512,512);
            const data=cg.getImageData(0,0,512,512).data;let opaque=0,alpha=0,changed=0;
            for(let i=3;i<data.length;i+=4){if(data[i]>100)opaque++;alpha+=data[i];if(previous){check(data[i]<=previous[i],'Missing rock grew back');if(Math.abs(data[i-3]-previous[i-3])+Math.abs(data[i-2]-previous[i-2])+Math.abs(data[i-1]-previous[i-1])>40)changed++;}}
            if(previous)check(changed>1000,'Damage state did not change the actual rock');previous=data;
            stats.push({file:files[col],opaque,alpha,changed});g.fillStyle='#b8d8e9';g.font='bold 24px Segoe UI';g.fillText(labels[col],col*360+36,112);g.drawImage(im,col*360+10,145,340,340);
          });
          check(stats[3].opaque<stats[0].opaque*.95,'Severe asteroid has no actual missing stone');
          g.fillStyle='#d2eff5';g.font='bold 28px Segoe UI';g.fillText('Collectible deuranium ore',40,600);g.drawImage(images[4],50,620,220,220);
          g.font='22px Segoe UI';g.fillStyle='#9cbacc';g.fillText('Mine → collect ore → refine at an inhabited port → repair supplies',310,665);
          g.fillText('Refining is one-for-one. Olympic ships retain their own mined supplies.',310,710);
          [12,24,48].forEach((size,i)=>{g.drawImage(images[4],340+i*130,755,size,size);g.fillText(size+' px',330+i*130,835);});
          canvas.style.cssText='position:absolute;left:0;top:0;z-index:9999';document.body.append(canvas);
          return {states:stats,ore:files[4]};
        }''')
        page.locator('#deuranium-art-review').screenshot(path=str(OUT/'asteroid-states-and-ore.png'))
        page.evaluate('document.querySelector("#deuranium-art-review").remove()')
        point=page.evaluate(r'''()=>{
          const s=nativeNpcDev.getState(),rock=nativeSolAsteroids.forSystem(43).find(r=>r.oreType==='deuranium'&&!s.minedAsteroids?.includes(r.slotId)&&!s.destroyedAsteroids?.includes(r.slotId));
          for(const e of s.civilianTraffic.ships){nativeNpcLives.interrupt(s,e,'browser fixture');e.nextActionAt=null;e.lifeScheduleToken++;}
          s.solEconomy.freighters=[];nativeAsteroidCombat.clear();
          Object.assign(s,{devMode:false,deuranium:20,latinum:500,system:43,planet:'Hof-Maso',x:rock.x-100,y:rock.y,speed:0,angle:Math.PI/2,miningTool:true,localCruise:null,arrivalApproach:null,phase:'flight',landed:false});
          nativeShipEquipment.grant(s,'mining-laser',{location:'slot',slot:0});window.__deuraniumState=s;window.__deuraniumRock=rock;window.__oreBefore=s.minerals?.deuranium||0;
          vexedSpace.enterSystem(43,true);const view=nativeView.measure(document.querySelector('#space'));return {x:view.w/2+100,y:view.h/2,w:view.w,h:view.h};
        }''')
        page.wait_for_timeout(500)
        box=page.locator('#space').bounding_box()
        x=box['x']+point['x']/point['w']*box['width'];y=box['y']+point['y']/point['h']*box['height']
        page.mouse.click(x,y);page.locator('#asteroid-mine-action').click()
        page.wait_for_function('()=>__deuraniumState.asteroidDamage?.[__deuraniumRock.slotId]>=__deuraniumRock.maxHull*.5',timeout=15000)
        page.evaluate('window.__originalBlocked=nativeSimulation.blocked; window.nativeSimulation={...nativeSimulation,blocked:()=>true}; window.nativeSimulationHost?.checkpoint(); window.__damagePaused=__deuraniumState.asteroidDamage[__deuraniumRock.slotId]')
        page.wait_for_timeout(300)
        assert page.evaluate('__deuraniumState.asteroidDamage[__deuraniumRock.slotId]===__damagePaused')
        page.screenshot(path=str(OUT/'actual-player-mining.png'))
        page.evaluate('()=>{nativeSaveStorage.write(__deuraniumState);const initialize=nativeShipRepairs.initialize;window.nativeShipRepairs={...nativeShipRepairs,initialize:s=>{window.__deuraniumState=s;return initialize(s);}};resumeNativeGame();window.nativeShipRepairs={...nativeShipRepairs,initialize};window.nativeSimulation={...nativeSimulation,blocked:__originalBlocked};window.nativeSimulationHost?.checkpoint();}')
        page.wait_for_function('()=>__deuraniumState.minedAsteroids?.includes(__deuraniumRock.slotId)',timeout=15000)
        page.mouse.click(x,y)
        page.wait_for_function('()=>__deuraniumState.asteroidOreDrops[__deuraniumRock.slotId]===0')
        assert page.evaluate('__deuraniumState.minerals.deuranium===__oreBefore+4')
        page.mouse.click(x,y)
        assert page.evaluate('__deuraniumState.minerals.deuranium===__oreBefore+4')
        before=page.evaluate('''()=>{const s=__deuraniumState;Object.assign(s,{x:0,y:0,speed:0,localCruise:null,arrivalApproach:null});const m=nativeNpcLives.market(s,43,0);window.__deuraniumMarket=m;return {supply:s.deuranium,raw:s.minerals.deuranium,wallet:s.latinum,stock:m.stock[7],ore:m.stock[0],treasury:m.credits};}''')
        page.locator('#tradeBtn').click()
        page.locator('[data-refine-deuranium]').click()
        assert page.evaluate('__deuraniumState.deuranium')==before['supply']+1
        assert page.evaluate('__deuraniumState.minerals.deuranium')==before['raw']-1
        page.locator('[data-sell-mineral="deuranium"]').click()
        result=page.evaluate('({raw:__deuraniumState.minerals.deuranium,supply:__deuraniumState.deuranium,wallet:__deuraniumState.latinum,stock:__deuraniumMarket.stock[7],ore:__deuraniumMarket.stock[0],treasury:__deuraniumMarket.credits})')
        assert result['raw']==before['raw']-2 and result['stock']==before['stock']+1 and result['ore']==before['ore']
        assert result['wallet']+result['treasury']==before['wallet']+before['treasury']
        page.locator('[data-refine-deuranium]').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'actual-refinery-controls.png'))
        page.locator('[data-prospect-ore="deuranium"]').click()
        assert page.evaluate('nativeAsteroidCombat.target.oreType')=='deuranium'
        report['player']={'realMouseMining':True,'savedMidCut':True,'pausedDamage':True,'collectedExactlyOnce':True,'refinery':result,'typedProspecting':True}
        report['medical']=page.evaluate(r'''async()=>{
          const check=(v,m)=>{if(!v)throw Error(m);},s=JSON.parse(JSON.stringify(__deuraniumState));
          const medic=s.civilianTraffic.ships.find(e=>e.shipType===58),target=s.civilianTraffic.ships.find(e=>e.shipType!==58&&e.hull>0&&nativeShipDefinitions.forEntity(s,e,{category:'civilian'}).hull===100);
          check(medic&&target,'Need existing persistent medical and civilian crews');
          s.civilianTraffic.ships=[target,medic];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];s.system=47;
          s.shipRepairs.calls=[];s.shipRepairs.missions=[];s.shipRepairs.nextPollAt=0;
          for(const e of [medic,target]){nativeNpcLives.interrupt(s,e,'isolate existing life');e.nextActionAt=null;e.lifeScheduleToken++;e.cargo=null;delete e.localLeg;delete e.journey;e.repairDeuranium=0;}
          nativeShipRepairs.initialize(s);const life=nativeNpcLives.initialize(s);life.config.economyEnabled=false;for(const m of Object.values(life.markets))m.stock[7]=0;
          Object.assign(medic,{system:1,port:3,x:0,y:0,credits:0,phase:'docked',repairProvisioning:true,repairDeuranium:56});
          const berth=nativePortDocking.request(s,medic,1,3);Object.assign(medic,{x:berth.x,y:berth.y});nativeNpcLives.refreshLocation(s,medic);
          const tick=()=>{nativeSimulation.advance(s,.25);nativeCivilianTraffic.advance(s,.25);};
          const until=predicate=>{let n=0;while(!predicate()){tick();check(n++<8000,'Medical operation timed out: '+medic.task?.phase);}};
          nativeNpcLives.resumeWork(s,medic,'Mine missing medical reserves');until(()=>medic.task?.phase==='mining');
          const rock=nativeSolAsteroids.find(medic.task.requirements.rockId,medic.system);check(rock.oreType==='deuranium','Medical selected another ore');
          const beforeArt=nativeSolAsteroids.metrics().images;until(()=>medic.repairMined>=4);check(medic.repairDeuranium===60,'Refinery failed to retain owned ore');check(medic.credits===0,'Unfunded mining minted money');check(nativeSolAsteroids.metrics().images===beforeArt,'Offscreen life prepared art');
          const minedId=rock.slotId;until(()=>medic.task.kind==='mining'&&medic.task.status==='active');check(medic.repairProvisioning,'Refill stopped at low-water mark');
          nativeNpcLives.interrupt(s,target,'disabled');Object.assign(target,{system:1,x:2500,y:2500,hull:10,shields:0,phase:'disabled',repairDeuranium:0});
          until(()=>medic.task.kind==='medical');check(!nativeNpcLives.initialize(s).reservations['rock:'+medic.miningReservation],'Rescue retained a mining reservation');
          until(()=>medic.repairBay.slots.filter(d=>d.phase==='repairing').length===6);
          const inspected=nativeNpcLives.inspect(s,medic.id),pose=nativeNpcLives.galaxyPosition(s,medic);check(inspected.galaxy.x===pose.x&&inspected.galaxy.y===pose.y,'Inspector does not track real medic');
          s.system=1;
          await Promise.all([nativeShipEffects.prepare(58,'civilian'),nativeShipEffects.prepare(target.shipType,'civilian'),nativeRepairVisuals.ensure()]);
          const c=Object.assign(document.createElement('canvas'),{width:1100,height:650,id:'medical-supply-rescue'}),g=c.getContext('2d');
          c.style.cssText='position:absolute;left:0;top:0;z-index:99999';document.body.append(c);g.fillStyle='#09131e';g.fillRect(0,0,c.width,c.height);
          const view={ship:{x:target.x+100,y:target.y},cx:550,cy:330,w:1100,h:650,zoom:1};
          for(const e of [target,medic])nativeShipEffects.paintShip(g,nativeShipDefinitions.describe(s,e,{category:'civilian'}),view);
          nativeRepairVisuals.paint(s,g,view);g.fillStyle='#bfece2';g.font='25px Segoe UI';g.fillText('Olympic: mined deuranium → refined supplies → six repair drones',25,45);
          until(()=>target.phase!=='disabled');check(target.hull===100,'Casualty not restored');check(Math.abs(medic.repairDeuranium-42)<1e-5,'Rescue did not consume actual mined supplies');
          return {id:medic.id,minedId,ownedMinedSupplies:4,continuedPast60:true,workingDrones:6,rescuedHull:target.hull,supplyRemaining:medic.repairDeuranium,inspectorMatches:true};
        }''')
        page.locator('#medical-supply-rescue').screenshot(path=str(OUT/'medical-mining-to-rescue.png'))
        report['cameraRandomIsolation']=page.evaluate(RANDOM_ISOLATION)
        page.locator('#mining-rng-evidence').screenshot(path=str(OUT/'camera-independent-mining.png'))
        report['browserErrors']=errors;report['failedResponses']=failed
        assert not errors,errors
        assert not failed,failed
        (OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report));browser.close()
finally:
    if server:server.shutdown()
