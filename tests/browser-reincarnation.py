"""Actual Reincarnate rolls back faction consequences and avoids unsafe spawns."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/reincarnation'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850},reduced_motion='reduce')
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
        url=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html'
        page.goto(url)
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.locator('[data-menu="dev"]').click()
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
        page.evaluate('''()=>{
          window.__base=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          const activate=nativeCombatShots.restore;
          nativeCombatShots.restore=function(value){
            window.__current=value;window.__activated=JSON.parse(JSON.stringify(value));
            return activate.apply(this,arguments);
          };
          const api=nativeSimulation;window.nativeSimulation={...api,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=JSON.parse(JSON.stringify(__base));
          Object.assign(s,{devMode:false,shipType:7,system:2,localBody:0,x:4e6,y:4e6,hull:50,shields:0,phase:'flight',landed:false,
            latinum:4321,day:12,speed:0,vx:0,vy:0,localCruise:null,arrivalApproach:null,repairDroneMode:'manual',
            reincarnation:{version:1,id:'browser-normal-timeline',safeAfter:0}});
          s.shipSimulation.schedule.pendingSeconds=0;
          s.localPrestige[1]=0;s.localPrestige[55]=-75;
          delete s.factionDefence;s.civilianTraffic.retaliations=[];s.weaponCombat.events=[];
          if(!nativeSaveStorage.write(s).ok)throw Error('Initial checkpoint failed');
          resumeNativeGame('normal');
          const written=nativeSaveStorage.write(__current);if(!written.ok||written.reincarnationError)throw Error(JSON.stringify(written));
          window.__safe=nativeSaveStorage.readReincarnation(__current);
          if(!__safe)throw Error('Safe checkpoint missing');
          window.__devSave=localStorage.getItem(nativeSaveStorage.keys.dev);
          window.__sim=api;
        }''')
        offence=page.evaluate('''()=>{
          const s=__current;
          // Real territory and law owners record an attack on a real Earth crew.
          Object.assign(s,{system:1,localBody:3,x:1800,y:800,speed:0,vx:0,vy:0});nativeManualFlight.initializeRegion(s);
          const owner=nativeFactionDefence.government(s,1);
          const victim=s.civilianTraffic.ships.find(ship=>ship.ownerGovernmentId===owner&&nativeFactionDefence.isFaction(ship));
          if(!victim)throw Error('Earth patrol missing');
          Object.assign(victim,{system:1,x:1800,y:850,phase:'holding',hull:100,journey:null});delete victim.localLeg;
          nativeReincarnation.danger(s);
          const penalty=nativeFactionDefence.hit(s,victim,{source:'player',sourceId:'player',weaponEventId:999999});
          nativeFactionStanding.shipDestroyed(s,owner);
          s.latinum=1;s.day=30;s.civilianTraffic.ships[0].credits=0;
          s.shipSimulation.seconds+=60;
          const saved=nativeSaveStorage.write(s);if(!saved.ok)throw Error(saved.error);
          const recovery=nativeSaveStorage.readReincarnation(s);
          if(recovery.latinum!==4321)throw Error('Combat replaced the safe timeline');
          const result=nativeCombatShots.onPlayerHit(s,1e6,{sourceId:victim.id,source:'ai',kind:'torpedo',from:{x:s.x-100,y:s.y}});
          window.nativeSimulation=__sim;nativeSimulationHost.checkpoint();
          return {penalty,hostile:s.localPrestige[1],result};
        }''')
        assert offence['hostile']<0 and offence['result']['destroyed'],offence
        page.wait_for_function('()=>nativePlayerDestruction.active&&document.querySelector("#player-recovery").dataset.revealing==="false"',timeout=30000)
        page.locator('[data-recovery-restore]').click()
        page.wait_for_function('()=>!nativePlayerDestruction.pending&&__current.hull>0')
        rewound=page.evaluate('''()=>{
          const s=__activated,b=__safe;
          const reservations=value=>Object.keys(value).sort().map(key=>[key,value[key]]);
          return {latinum:s.latinum,day:s.day,standing:s.localPrestige[1],oldEnemy:s.localPrestige[55],
            alerts:JSON.stringify(s.factionDefence||null)===JSON.stringify(b.factionDefence||null),
            clock:s.shipSimulation.seconds===b.shipSimulation.seconds,crew:s.civilianTraffic.ships.length,
            crewCredits:s.civilianTraffic.ships[0].credits===b.civilianTraffic.ships[0].credits,
            jobs:JSON.stringify(reservations(s.civilianTraffic.life.reservations))===JSON.stringify(reservations(b.civilianTraffic.life.reservations)),
            location:s.system===b.system&&s.x===b.x&&s.y===b.y,
            otherMode:localStorage.getItem(nativeSaveStorage.keys.dev)===__devSave};
        }''')
        assert rewound=={'latinum':4321,'day':12,'standing':0,'oldEnemy':-75,'alerts':True,'clock':True,'crew':1200,'crewCredits':True,'jobs':True,'location':True,'otherMode':True},rewound
        page.screenshot(path=str(OUT/'rewound-flight.png'))
        # Reload and use actual Continue: the abandoned future must stay gone.
        page.reload()
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate('''()=>{
          const restore=nativeCombatShots.restore;
          nativeCombatShots.restore=function(s){window.__continued=s;return restore.apply(this,arguments);};
        }''')
        page.locator('[data-menu="continue"]').click()
        page.wait_for_function('()=>!!window.__continued')
        continued=page.evaluate('()=>({standing:__continued.localPrestige[1],latinum:__continued.latinum,day:__continued.day})')
        assert continued=={'standing':0,'latinum':4321,'day':12},continued
        database_rewind=page.evaluate('''async()=>{
          await nativeSaveStorage.reincarnationReady(__continued);
          const saved=nativeSaveStorage.readReincarnation(__continued);
          return !!saved&&saved.latinum===4321&&saved.localPrestige[1]===0&&
            !localStorage.getItem(nativeSaveStorage.recoveryKeys.normal);
        }''')
        assert database_rewind,'The independent rewind database did not survive reload'
        # Import a genuine old unsafe save, with no identity or safe checkpoint.
        page.evaluate('''()=>{
          const api=nativeSimulation;window.nativeSimulation={...api,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=JSON.parse(JSON.stringify(__continued));delete s.reincarnation;
          Object.assign(s,{system:55,localBody:0,x:0,y:0,hull:50,shields:0,speed:100,vx:100,vy:0,phase:'flight',landed:false});
          s.localPrestige[55]=-75;s.factionDefence={version:2,revision:1,systems:{55:{government:1,aggressors:[{id:'player',at:0,until:1e6}]}},orders:[]};
          s.weaponCombat.events=[];s.civilianTraffic.retaliations=[];
          nativeSaveStorage.flush(__continued);
          localStorage.removeItem(nativeSaveStorage.recoveryKeys.normal);
          localStorage.setItem(nativeSaveStorage.keys.normal,nativeSaveCodec.stringify(s));
          const restore=nativeCombatShots.restore;
          nativeCombatShots.restore=function(value){window.__legacyCurrent=value;window.__legacyActivated=JSON.parse(JSON.stringify(value));return restore.apply(this,arguments);};
          resumeNativeGame('normal');window.__legacyJobs=JSON.stringify(__legacyCurrent.civilianTraffic.life.reservations);
          if(!nativeReincarnation.saved(__legacyCurrent))throw Error('Imported living save unavailable');
          nativeCombatShots.onPlayerHit(__legacyCurrent,1e6,{kind:'torpedo',from:{x:-100,y:0}});
          nativePlayerDestruction.reset();nativePlayerDestruction.begin(__legacyCurrent,{immediate:true});
          window.nativeSimulation=api;nativeSimulationHost.checkpoint();
        }''')
        page.wait_for_function('()=>nativePlayerDestruction.active&&document.querySelector("#player-recovery").dataset.revealing==="false"')
        page.locator('[data-recovery-restore]').click()
        page.wait_for_function('()=>!nativePlayerDestruction.pending&&__legacyCurrent.hull>0')
        refuge=page.evaluate('''()=>{
          const s=__legacyActivated,point=nativeManualFlight.position(s),boundaries=nativeManualFlight.boundaries();
          return {region:nativeManualFlight.currentRegion(s).system,frame:s.system,standing:s.localPrestige[55],
            outside:boundaries.every(b=>Math.hypot((point.x-b.x)/b.rx,(point.y-b.y)/b.ry)>1),
            jobs:JSON.stringify(s.civilianTraffic.life.reservations)===__legacyJobs,crew:s.civilianTraffic.ships.length,
            stopped:s.speed===0&&s.vx===0&&s.vy===0,
            alert:s.factionDefence.systems[55].aggressors[0].id==='player'};
        }''')
        assert refuge=={'region':None,'frame':55,'standing':-75,'outside':True,'jobs':True,'crew':1200,'stopped':True,'alert':True},refuge
        page.wait_for_timeout(2000)
        assert page.evaluate('__legacyCurrent.hull')>0,'The legacy return immediately died again'
        page.screenshot(path=str(OUT/'legacy-safe-refuge.png'))
        # The initial local-key implementation migrates without using up the
        # Continue quota, and verifies the full imported snapshot on reload.
        page.evaluate('''async()=>{
          await nativeSaveStorage.reincarnationReady(__legacyCurrent);
          const s=JSON.parse(JSON.stringify(__legacyCurrent));s.factionDefence.systems={};
          const database=await new Promise((resolve,reject)=>{const request=indexedDB.open('vexed-mirror-reincarnation',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
          await new Promise((resolve,reject)=>{const tx=database.transaction('snapshots','readwrite');tx.objectStore('snapshots').delete('normal');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
          database.close();localStorage.setItem(nativeSaveStorage.recoveryKeys.normal,nativeSaveCodec.stringify(s));
        }''')
        page.reload()
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        migrated=page.evaluate('''async()=>{
          const s=nativeSaveStorage.read('normal');await nativeSaveStorage.reincarnationReady(s);
          const checkpoint=nativeSaveStorage.readReincarnation(s);
          return !!checkpoint&&checkpoint.reincarnation.id===s.reincarnation.id&&
            Object.keys(checkpoint.factionDefence.systems).length===0&&!localStorage.getItem(nativeSaveStorage.recoveryKeys.normal);
        }''')
        assert migrated,'The local-only checkpoint did not migrate intact'
        assert not errors,errors
        print(json.dumps({'rewound':rewound,'continued':continued,'database_rewind_after_reload':database_rewind,'legacy_refuge':refuge,'legacy_checkpoint_migrated':migrated,'errors':errors}))
        browser.close()
finally:
    server.shutdown()
