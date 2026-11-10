"""Real-key system crossings, telemetry presentation and corridor ram identity.

Clock-controlled UI assertions are functional checks, not FPS qualification.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/flight-status'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    errors=[];failed=[];report={}
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1280,'height':850})
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.locator('[data-menu="dev"]').click(timeout=60000)
            page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200&&nativeCombatShots.isReady()&&nativeFlightStatus.snapshot().region',timeout=120000)
            page.evaluate('''()=>{
              window.__flightBase=JSON.stringify(nativeNpcDev.getState());window.__flightBlocked=nativeSimulation.blocked;
              window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
            }''')
            report['galacticCoordinates']=page.evaluate('''()=>{
              const check=(v,m)=>{if(!v)throw Error(m)},s=nativeNpcDev.getState(),ui=nativeFlightStatus,m=nativeManualFlight;
              const saved=Object.fromEntries(['system','localBody','x','y','faction'].map(k=>[k,s[k]]));
              const canvas=document.querySelector('#native-radar'),context=canvas.getContext('2d'),paint=context.fillText;
              let radar='',cases=0;context.fillText=function(text,x,y){if(y===14)radar=text;return paint.apply(this,arguments);};
              const number=n=>(Math.round(n)||0).toLocaleString('en-US'),points=[{x:123.125,y:234.875}];
              const a=m.planetPosition(1),b=m.planetPosition(2);points.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
              nativeGalaxyMap.open();
              try{
                for(const point of points)for(let faction=0;faction<8;faction++)for(const system of [1,2,30,31,51,52]){
                  Object.assign(s,{system,faction,localBody:system===1?4:0});
                  const origin=m.anchor(system),offset=system===1?vexedSolFlight.shipPosition({...s,x:0,y:0}):{x:0,y:0};
                  s.x=point.x-origin.x-offset.x;s.y=point.y-origin.y-offset.y;
                  const held=JSON.stringify([s.system,s.localBody,s.x,s.y,s.faction,s.latinum,s.shipEquipment]);
                  ui.update(s,{dt:.1});nativeRadar.paint(s,true);nativeGalaxyMap.refresh();
                  const x='X: '+number(point.x),y='Y: '+number(point.y);
                  check(document.querySelector('.flight-coordinate-x').textContent===x&&document.querySelector('.flight-coordinate-y').textContent===y,'HUD changed coordinates for frame '+system+' / faction '+faction);
                  check(radar===x+'  '+y,'Radar differs from HUD for frame '+system+' / faction '+faction);
                  check(document.querySelector('#galaxy-map [data-coordinate="x"]').textContent===x&&document.querySelector('#galaxy-map [data-coordinate="y"]').textContent===y,'Map differs from HUD for frame '+system+' / faction '+faction);
                  check(held===JSON.stringify([s.system,s.localBody,s.x,s.y,s.faction,s.latinum,s.shipEquipment]),'Coordinate display changed game state');cases++;
                }
              }finally{
                context.fillText=paint;Object.assign(s,saved);nativeGalaxyMap.close(false);ui.update(s,{dt:5});
              }
              return {cases,factions:8,frames:[1,2,30,31,51,52],samePointSameNumbers:true,deepSpaceFrameIndependent:true,threeDisplaysAgree:true,readOnly:true};
            }''')
            report['devNeighborhood']=page.evaluate('''()=>{
              const check=(v,m)=>{if(!v)throw Error(m)},s=nativeNpcDev.getState(),ui=nativeFlightStatus,origin=nativeManualFlight.anchor(1);
              check(s.devNeighborhoodVersion===1,'New Dev game lacks the saved neighborhood version');
              const rows=[];
              for(const [id,value,status,color] of [[55,-75,'Hostile','#ff0000'],[4,125,'Allied','#4ab3ff'],[2,0,'Neutral','#cacaca'],[8,100,'Your territory','#0fff0f']]){
                const map=nativeNavigation.call('state',id).selected,p=nativeManualFlight.planetPosition(id);
                Object.assign(s,{system:1,x:p.x-origin.x,y:p.y-origin.y});ui.update(s,{dt:.1});
                const shown=ui.snapshot().standing;
                check(map.prestige===value&&map.standing===status,'Incorrect map relationship for '+id);
                check(shown.value===value&&shown.status===status&&shown.color===color,'HUD differs from map in '+id);
                rows.push({id,standing:status,reputation:value,color});
              }
              check(s.devDiplomacyVersion===1&&s.localPrestige[1]===100&&s.localPrestige[20]===-60&&s.localPrestige[47]===25,'Fresh Dev galaxy lacks diverse faction relationships');
              Object.assign(s,{system:1,x:0,y:0});ui.update(s,{dt:.1});ui.update(s,{dt:4.1});
              return {newDevSetup:true,mapAndHudAgree:true,systems:rows};
            }''')
            report['presentation']=page.evaluate('''()=>{
              const check=(v,m)=>{if(!v)throw Error(m)},s=nativeNpcDev.getState(),ui=nativeFlightStatus,e=nativeSystemCatalog.boundary(1),a=nativeManualFlight.anchor(2);
              const place=(x,y)=>{Object.assign(s,{system:1,localBody:3,x,y});ui.update(s,{dt:.1});return ui.snapshot();};
              const held=()=>JSON.stringify({x:s.x,y:s.y,system:s.system,cargo:s.cargo,latinum:s.latinum,equipment:s.shipEquipment,reputation:s.localPrestige,governments:s.planetGovts,hull:s.hull,shields:s.shields});
              s.localPrestige[1]=125;s.localPrestige[2]=-20;
              const reputation=()=>document.querySelector('.flight-standing').textContent;
              place(0,0);ui.update(s,{dt:.8});check(ui.snapshot().region.name==='Sol','Earth was not labelled as Sol');
              check(reputation()==='+125','Sol reputation was not displayed');
              check(document.querySelector('.flight-reputation').getAttribute('aria-label').includes('Sol: +125'),'Reputation lacks an accessible system label');
              const color=()=>document.querySelector('#flight-status').style.getPropertyValue('--standing-color');
              const mapColor=label=>[...document.querySelectorAll('.map-legend>span')].find(n=>n.textContent.startsWith(label)).querySelector('i').style.getPropertyValue('--key-color');
              check(color()===mapColor('Allied'),'Allied light disagrees with the map');
              const government=s.planetGovts[1];s.planetGovts[1]=16;ui.update(s,{dt:.1});
              check(color()===mapColor('Your territory')&&ui.snapshot().standing.status==='Your territory','Owned space did not turn green');
              s.planetGovts[1]=government;ui.update(s,{dt:.1});
              let base=ui.snapshot().transitions;place(e.x-e.rx+20,e.y);
              for(const dx of [-1e-7,1e-7,-1e-8,1e-8])place(e.x-e.rx+dx,e.y);
              check(ui.snapshot().transitions===base,'Floating-point noise at the exact map border replayed announcements');
              place(e.x-e.rx-220,e.y);check(ui.snapshot().region.kind==='interstellar','Leaving Sol retained its old system name');
              check(ui.snapshot().announcement.kind==='leave','No departure announcement');
              check(reputation()==='—','Interstellar travel retained the old system reputation');
              base=ui.snapshot().transitions;for(const dx of [40,90,60])place(e.x-e.rx-dx,e.y);
              check(ui.snapshot().transitions===base,'Interstellar edge replayed announcements');
              place(a.x-220,a.y+75);check(ui.snapshot().region.name==='Orion','New envelope did not update the label');
              check(ui.snapshot().announcement.kind==='enter','No entering-system announcement');
              check(reputation()==='-20'&&document.querySelector('#flight-status').dataset.standing==='hostile','Reputation followed the saved coordinate frame instead of the physical system');
              check(color()===mapColor('Hostile'),'Hostile light disagrees with the map');
              s.localPrestige[2]=0;ui.update(s,{dt:.1});ui.update(s,{dt:.8});check(reputation()==='0','Neutral reputation was not updated');
              check(color()===mapColor('Neutral'),'Neutral light disagrees with the map');
              s.localPrestige[2]=44;ui.update(s,{dt:.1});ui.update(s,{dt:.8});check(reputation()==='+44','A changed reputation was not updated');
              const before=held();for(let i=0;i<20;i++)ui.update(s,{dt:.05});check(held()===before,'Telemetry changed physical pose or owned resources');
              check(ui.snapshot().transitions===base+1,'Stationary entry repeated');
              ui.update(s,{dt:10,paused:true});check(ui.snapshot().announcement,'Pause expired an announcement');
              check(getComputedStyle(document.querySelector('.flight-beacon')).animationPlayState==='paused','Paused beacon kept animating');
              ui.update(s,{dt:4.1});check(!ui.snapshot().announcement,'Entry card did not clear');
              const count=ui.snapshot().transitions;ui.update(s,{dt:.1,warping:true,speed:1800});
              check(document.querySelector('.flight-name').textContent==='Warp transit','Warp status missing');
              check(reputation()==='—','Warp retained a local reputation');
              check(ui.snapshot().transitions===count,'Warp replayed a system crossing');
              ui.update(s,{dt:.1,warping:false});
              return {boundaryChatterPrevented:true,readOnly:true,pauseRetainsAnnouncement:true,warpStatus:true,localReputation:true,transitions:ui.snapshot().transitions};
            }''')
            page.evaluate('''()=>{const s=nativeNpcDev.getState();Object.assign(s,{system:1,localBody:3,x:0,y:0});nativeFlightStatus.update(s,{dt:.1});nativeFlightStatus.update(s,{dt:4.1});}''')
            page.wait_for_timeout(350)
            page.screenshot(path=str(OUT/'in-system.png'))
            report['responsive']=[]
            for width,height in [(1920,1080),(1440,900),(1280,850),(720,800),(620,800),(390,844),(360,640),(320,568),(844,390)]:
                page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
                bounds=page.evaluate('''()=>{
                  const panel=document.querySelector('.flight-panel').getBoundingClientRect(),resources=document.querySelector('#game-hud').getBoundingClientRect(),stage=document.querySelector('#game').getBoundingClientRect();
                  const expectedTop=resources.top+resources.height*4/43,expectedBottom=resources.top+resources.height*40/43;
                  const children=[...document.querySelectorAll('.flight-name,.flight-reputation,.flight-speed')].map(n=>{const b=n.getBoundingClientRect();return {name:n.className,left:b.left,right:b.right,top:b.top,bottom:b.bottom,client:n.clientWidth,scroll:n.scrollWidth};});
                  return {left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom,resourcesLeft:resources.left,stageRight:stage.right,stageBottom:stage.bottom,expectedTop,expectedBottom,children};
                }''')
                assert bounds['right']<=bounds['resourcesLeft'] and bounds['bottom']<=bounds['stageBottom'],bounds
                assert abs(bounds['top']-bounds['expectedTop'])<1 and abs(bounds['bottom']-bounds['expectedBottom'])<1,bounds
                for child in bounds['children']:
                    assert child['left']>=bounds['left'] and child['right']<=bounds['right'] and child['top']>=bounds['top'] and child['bottom']<=bounds['bottom'],(width,height,child,bounds)
                assert bounds['children'][0]['scroll']<=bounds['children'][0]['client']+1,('Sol name clipped',width,height,bounds)
                report['responsive'].append({'width':width,'height':height,**bounds});page.screenshot(path=str(OUT/f'layout-{width}.png'))
            page.set_viewport_size({'width':1280,'height':850})
            report['motion']=page.evaluate('''async()=>{
              const check=(v,m)=>{if(!v)throw Error(m)},ui=nativeFlightStatus,root=document.querySelector('#flight-status');
              const s=JSON.parse(__flightBase);Object.assign(s,{system:1,localBody:3,x:0,y:0,hull:50,shields:50,landed:false,speed:0});s.planetGovts[1]=1;s.localPrestige[1]=125;
              const effects=()=>root.getAnimations({subtree:true}).filter(a=>a.id.startsWith('flight:'));
              const has=event=>effects().some(a=>a.id.includes(':'+event+':'));
              const number=()=>Number(root.querySelector('.flight-standing').textContent);
              const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
              window.nativeFlightStatus={...ui,update(){}};
              try{
                const quiet=ui.snapshot().reactions;ui.update(s,{dt:.1});ui.update(s,{dt:.2});
                check(ui.snapshot().reactions===quiet,'Continue invented an event');
                s.localPrestige[1]=80;ui.update(s,{dt:.1});check(has('reputation'),'No reputation reaction');
                ui.update(s,{dt:.35});check(number()>80&&number()<125,'Reputation did not count toward its target');
                ui.update(s,{dt:0,paused:true});const moving=root.getAnimations({subtree:true});await Promise.all(moving.map(a=>a.ready.catch(()=>{})));const times=moving.map(a=>a.currentTime),held=number();
                await wait(180);ui.update(s,{dt:3,paused:true});
                check(number()===held,'Pause advanced the reputation counter');
                check(moving.every((a,i)=>Math.abs(a.currentTime-times[i])<2),'Pause advanced an event animation');
                ui.update(s,{dt:.8});check(number()===80,'Reputation count did not settle');
                s.localPrestige[1]=-10;ui.update(s,{dt:.1});await wait(650);ui.update(s,{dt:.8});
                check(getComputedStyle(root.querySelector('.flight-beacon')).backgroundColor==='rgb(255, 0, 0)','Hostile glow did not settle on map red');
                check(getComputedStyle(root.querySelector('.flight-beacon')).animationName==='flight-hostile','Hostile light lacks its double pulse');
                s.planetGovts[1]=16;ui.update(s,{dt:.1});await wait(650);
                check(getComputedStyle(root.querySelector('.flight-beacon')).backgroundColor==='rgb(15, 255, 15)','Owned glow did not settle on map green');
                ui.update(s,{dt:.1,warping:true,speed:1800});check(has('warp'),'No warp sweep');
                ui.update(s,{dt:.1});check(has('warp-exit'),'No warp exit transition');
                s.landed=true;ui.update(s,{dt:.1});check(has('docked'),'No docking transition');
                s.landed=false;ui.update(s,{dt:.1});const before=JSON.stringify(s);s.shields--;
                const damaged=JSON.stringify(s);ui.update(s,{dt:.8});check(has('damage'),'No impact warning');
                check(JSON.stringify(s)===damaged&&before!==damaged,'Visual reaction changed saved state');
                for(let i=0;i<25;i++){s.localPrestige[1]++;ui.update(s,{dt:.07});}
                check(effects().length<=8,'Event animations accumulated without a bound');
                const discovery=JSON.parse(JSON.stringify(s));Object.assign(discovery,{devMode:false,system:2,x:-220,y:75,discovered:[1]});discovery.localPrestige[2]=125;
                nativeManualFlight.initializeRegion(discovery);ui.update(discovery,{dt:.1});
                check(ui.snapshot().standing.status==='Unknown','Uncharted standing was revealed');
                discovery.discovered.push(2);ui.update(discovery,{dt:.1});
                check(ui.snapshot().standing.status==='Allied','Discovery retained a stale unknown light while stationary');
                const pageMotion={discoveryUpdates:true,paletteMatchesMap:true,reputationCounts:true,pauseFreezesEffects:true,hostileDoublePulse:true,warp:true,docking:true,damage:true,boundedEffects:true};
                return {...pageMotion,readOnly:true};
              }finally{window.nativeFlightStatus=ui;ui.update(nativeNpcDev.getState(),{dt:.1});}
            }''')
            report['devMigration']=page.evaluate('''()=>{
              const check=(v,m)=>{if(!v)throw Error(m)},legacy=JSON.parse(__flightBase);
              delete legacy.devNeighborhoodVersion;
              for(const id of [55,4,2,8]){legacy.localPrestige[id]=100;legacy.planetGovts[id]=1;}
              legacy.localPrestige[7]=37;
              check(nativeSaveStorage.write(legacy).ok,'Legacy Dev fixture could not save');resumeNativeGame('dev');
              let live=nativeNpcDev.getState();
              check(live.devNeighborhoodVersion===1&&live.localPrestige[55]===-75&&live.localPrestige[4]===125&&live.localPrestige[2]===0&&live.planetGovts[8]===16,'Legacy Dev save was not migrated');
              check(live.localPrestige[7]===37,'Migration replaced an unrelated custom reputation');
              check(nativeSaveStorage.read('dev').devNeighborhoodVersion===1,'Migration version was not saved');
              live.localPrestige[55]=-33;live.localPrestige[4]=80;live.localPrestige[2]=12;live.planetGovts[8]=2;
              check(nativeSaveStorage.write(live).ok,'Updated Dev fixture could not save');resumeNativeGame('dev');live=nativeNpcDev.getState();
              check(live.localPrestige[55]===-33&&live.localPrestige[4]===80&&live.localPrestige[2]===12&&live.planetGovts[8]===2,'Continue reset later standing changes');
              return {legacyMigrates:true,unrelatedStandingRetained:true,versionSaved:true,continueKeepsChanges:true};
            }''')
            page.locator('#devToolsBtn').click()
            page.locator('[data-dev-ship]').select_option('10')
            page.locator('[data-dev-equip]').click()
            assert page.evaluate('(()=>{const s=nativeNpcDev.getState();return s.shipType===10&&s.localPrestige[55]===-33&&s.localPrestige[4]===80&&s.localPrestige[2]===12&&s.planetGovts[8]===2})()')
            report['devMigration']['shipChangeKeepsChanges']=True
            report['normalIsolation']=page.evaluate('''()=>{
              const check=(v,m)=>{if(!v)throw Error(m)},normal=JSON.parse(__flightBase);normal.devMode=false;delete normal.devNeighborhoodVersion;
              normal.localPrestige[55]=44;normal.localPrestige[2]=-9;normal.planetGovts[8]=4;
              check(nativeSaveStorage.write(normal).ok,'Normal fixture could not save');const before=JSON.stringify(nativeSaveStorage.read('normal'));
              resumeNativeGame('normal');
              check(nativeNavigation.call('state',55).selected.prestige===44&&nativeNavigation.call('state',2).selected.prestige===-9&&nativeNavigation.call('state',8).selected.government===4,'Normal game received Dev presets');
              check(JSON.stringify(nativeSaveStorage.read('normal'))===before,'Dev migration wrote to the normal save');
              resumeNativeGame('dev');return {normalStandingsRetained:true,normalSaveUntouched:true};
            }''')
            report['reload']=page.evaluate('''()=>{
              const s=JSON.parse(__flightBase),e=nativeSystemCatalog.boundary(1);Object.assign(s,{system:1,localBody:3,x:e.x-e.rx-400,y:e.y,landed:false});
              nativeSaveStorage.write(s);resumeNativeGame('dev');nativeFlightStatus.update(nativeNpcDev.getState(),{dt:.1});
              const result=nativeFlightStatus.snapshot();if(result.region.kind!=='interstellar'||result.announcement)throw Error('Reload replayed entry or restored a stale system label');return result;
            }''')
            # These crossings use ordinary input and the real host loop. Only the
            # initial fixture placement is controlled, before the flight starts.
            page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:__flightBlocked};nativeSimulationHost.checkpoint();}')
            report['crossings']=[]
            for kind,system in [('leave',1),('enter',2)]:
                page.evaluate('''({kind,system})=>{
                  const s=JSON.parse(__flightBase),e=nativeSystemCatalog.boundary(system),a=nativeManualFlight.anchor(system),margin=kind==='leave'?250:-300;
                  Object.assign(s,{system:1,localBody:3,x:a.x+e.x-e.rx+margin,y:a.y+e.y,angle:kind==='leave'?Math.PI:0,speed:0,vx:0,vy:0,landed:false,localCruise:null,arrivalApproach:null});
                  for(const k of ['motionKick','motionSpin','motionDrift','motionAngularVelocity'])delete s[k];
                  nativeSaveStorage.write(s);resumeNativeGame('dev');
                }''',{'kind':kind,'system':system})
                page.locator('#space').click(position={'x':640,'y':425});page.wait_for_timeout(100)
                page.keyboard.down('w')
                try:
                    page.wait_for_function('(kind)=>nativeFlightStatus.snapshot().announcement?.kind===kind',arg=kind,timeout=15000)
                    result=page.evaluate('()=>({ui:nativeFlightStatus.snapshot(),position:nativeManualFlight.position(nativeNpcDev.getState()),speed:nativeNpcDev.getState().speed,activeSystem:nativeNpcDev.getState().system,activeRegion:nativeNpcDev.getState().manualFlightRegion})')
                    assert result['speed']>0,result
                    if kind=='enter':assert result['ui']['region']['system']==2 and result['activeSystem']==2 and result['activeRegion']['system']==2,result
                    else:assert result['ui']['region']['kind']=='interstellar',result
                    report['crossings'].append({'kind':kind,**result});page.wait_for_timeout(350);page.screenshot(path=str(OUT/('entry-orion.png' if kind=='enter' else 'interstellar.png')))
                finally:page.keyboard.up('w')
            report['ram']=page.evaluate('''()=>{
              const s=JSON.parse(__flightBase),site=nativeTravelCorridors.lanes().find(l=>l.from===1&&l.to===2).sites[3],id=nativeTravelCorridors.rockIds(site)[5];
              nativeAsteroidMotion.ensure(s);const rock=nativeSolAsteroids.find(id,2);
              Object.assign(s,{system:2,localBody:0,x:rock.x-350,y:rock.y,angle:0,speed:0,vx:0,vy:0,landed:false,localCruise:null,arrivalApproach:null});
              for(const k of ['motionKick','motionSpin','motionDrift','motionAngularVelocity'])delete s[k];
              nativeSaveStorage.write(s);resumeNativeGame('dev');window.__flightRamId=id;return {rockId:id,startX:rock.x};
            }''')
            page.locator('#space').click(position={'x':640,'y':425});page.wait_for_timeout(100)
            page.keyboard.down('w');page.wait_for_timeout(2000);page.keyboard.up('w');page.wait_for_timeout(2000)
            ram=page.evaluate('''()=>{
              const s=nativeNpcDev.getState(),snapshot=nativeAsteroidMotion.snapshot(),rock=nativeSolAsteroids.find(__flightRamId,2);
              return {x:rock.x,saved:s.asteroidMotion.rocks[__flightRamId],contacts:snapshot.contacts.filter(c=>c.rockId===__flightRamId),selfContacts:snapshot.rockContacts.filter(c=>c.a===c.b),population:s.civilianTraffic.ships.length};
            }''')
            assert ram['contacts'] and not ram['selfContacts'] and ram['population']==1200,ram
            assert ram['x']>=report['ram']['startX']-1,ram
            report['ram'].update(ram);page.screenshot(path=str(OUT/'ram-after.png'))
            page.keyboard.press('Escape');page.wait_for_function('()=>nativePause.active&&document.querySelector("#flight-status").dataset.paused==="true"')
            paused_at=page.evaluate('nativeSimulation.seconds(nativeNpcDev.getState())');page.wait_for_timeout(150)
            assert page.evaluate('nativeSimulation.seconds(nativeNpcDev.getState())')==paused_at
            page.keyboard.press('Escape');page.wait_for_function('()=>!nativePause.active')
            page.keyboard.press('i');page.wait_for_function('()=>nativeShipInventory.active&&nativeFlightStatus.snapshot().hidden')
            page.keyboard.press('i');page.wait_for_function('()=>!nativeShipInventory.active&&!nativeFlightStatus.snapshot().hidden')
            page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(100)
            assert page.evaluate('getComputedStyle(document.querySelector(".flight-beacon")).animationName')=='none'
            assert page.evaluate('document.querySelector("#flight-status").getAnimations({subtree:true}).filter(a=>a.id.startsWith("flight:")).length')==0
            report['gates']={'actualPause':True,'actualInventory':True,'reducedMotion':True}
            assert not errors and not failed,(errors,failed)
            report.update(passed=True,javascriptErrors=errors,failedRequests=failed)
            (OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            print(json.dumps(report),flush=True);browser.close()
    finally:server.shutdown()

if __name__=='__main__':main()
