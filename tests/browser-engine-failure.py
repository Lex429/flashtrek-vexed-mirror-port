"""Real flight keys, gradual engine loss, reserve thrusters and Inventory repair."""
import functools,http.server,json,math,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/engine-failure-motion';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':800});page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
        page.evaluate('''()=>{
          const api=nativeSimulation;window.nativeSimulation={...api,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          Object.assign(s,{devMode:false,shipType:7,system:2,localBody:0,x:4e6,y:4e6,angle:0,speed:427.5,vx:427.5,vy:0,hull:50,shields:0,phase:'flight',landed:false,localCruise:null,arrivalApproach:null,minerals:{gallicite:30}});
          for(let i=0;i<12;i++){s.y=4e6+i*2000;if(!nativeSolAsteroids.sweptNearby(2,s,{x:s.x+5000,y:s.y},220).length)break;if(i===11)throw Error('No collision-free flight fixture found');}
          for(const key of ['motionKick','motionSpin','motionDrift','motionReverse','motionAngularVelocity'])delete s[key];s.shipSimulation.schedule.pendingSeconds=0;
          const eq=nativeShipEquipment.ensure(s);eq.instances[eq.slots.engineering[0]].condition=100;
          const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(state){window.__engineState=state;return restore(state);};
          if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');nativeSystemHub.close(false);nativePlanetEncounter.close(false);
          window.__engineFlight={mode:'ready',rows:[]};const systems=nativeShipSystems;
          window.nativeShipSystems={...systems,move(state,entity,category,command,profile,dt){const result=systems.move(state,entity,category,command,profile,dt);if(entity===__engineState)__engineFlight.rows.push({mode:__engineFlight.mode,dt,brakeFactor:command.brakeFactor??1,speed:entity.speed,vx:entity.vx,vy:entity.vy,angle:entity.angle,cap:nativeShipDefinitions.forEntity(state).movement.maxSpeed});return result;}};
          window.nativeSimulation=api;nativeSimulationHost.checkpoint();
        }''')
        page.locator('#space').focus();page.keyboard.down('w')
        page.wait_for_function('()=>__engineFlight.rows.length>=5')
        damage=page.evaluate('''()=>{const s=__engineState,initial=s.speed;__engineFlight.mode='damage';__engineFlight.rows=[];nativeShipDamage.apply(nativeShipDefinitions.describe(s),25);return {initial,condition:nativeShipEquipment.ensure(s).instances[s.shipEquipment.slots.engineering[0]].condition,braking:nativeShipDefinitions.forEntity(s).movement.braking};}''')
        page.wait_for_function('()=>__engineFlight.rows.length>=90',timeout=15000)
        rows=page.evaluate('__engineFlight.rows.filter(r=>r.mode==="damage")');previous=damage['initial']
        assert damage['condition']==50 and rows[0]['speed']>rows[0]['cap'],(damage,rows[0])
        for row in rows:
            assert -1e-7<=previous-row['speed']<=damage['braking']*row['brakeFactor']*row['dt']+1e-7,(previous,row)
            previous=row['speed']
        assert abs(rows[-1]['speed']-rows[-1]['cap'])<1e-7,rows[-1]
        failed=page.evaluate('''()=>{const s=__engineState,eq=nativeShipEquipment.ensure(s);eq.instances[eq.slots.engineering[0]].condition=0;__engineFlight.mode='failed';__engineFlight.rows=[];return {speed:s.speed,vx:s.vx,vy:s.vy,angle:s.angle,id:eq.slots.engineering[0]};}''')
        page.keyboard.down('s');page.keyboard.down('d');page.wait_for_function('()=>__engineFlight.rows.length>=30',timeout=15000)
        drift=page.evaluate('__engineFlight.rows.filter(r=>r.mode==="failed")')
        assert drift[0]['speed']>drift[0]['cap'],drift[0]
        assert 0<drift[-1]['speed']<failed['speed'] and drift[-1]['angle']>failed['angle'],(failed,drift[-1])
        for key in ['w','s','d']:page.keyboard.up(key)
        page.locator('#inventoryBtn').click();before_repair=page.evaluate('__engineState.speed');page.locator('#ship-inventory [data-equipment-kind="engineering"][data-equipment-place="slot"][data-equipment-index="0"]').click()
        page.locator('#ship-inventory [data-repair-device]').click()
        repaired=page.evaluate('''()=>{const s=__engineState,eq=s.shipEquipment,saved=nativeSaveStorage.read('normal');return {condition:eq.instances[eq.slots.engineering[0]].condition,id:eq.slots.engineering[0],ore:s.minerals.gallicite,speed:s.speed,savedCondition:saved.shipEquipment.instances[eq.slots.engineering[0]].condition};}''')
        assert repaired['condition']==repaired['savedCondition']==100 and repaired['ore']==20 and repaired['id']==failed['id'],repaired
        assert abs(repaired['speed']-before_repair)<1e-7,repaired
        page.locator('#ship-inventory .inventory-close').click();page.locator('#space').focus()
        page.evaluate("()=>{__engineFlight.mode='repaired';__engineFlight.rows=[];}");page.keyboard.down('w')
        page.wait_for_function('()=>__engineFlight.rows.length>=30',timeout=15000);page.keyboard.up('w')
        after=page.evaluate('__engineFlight.rows.filter(r=>r.mode==="repaired")');assert after[-1]['speed']>before_repair+50,after[-1]
        # Reproduce the reported save: 10% hull, no active drones, critical phase.
        disabled=page.evaluate('''()=>{
          const s=__engineState,eq=s.shipEquipment;
          Object.assign(s,{hull:5,shields:0,phase:'disabled',speed:0,vx:0,vy:0,angle:0,deuranium:20,repairDroneMode:'manual'});
          for(const key of ['motionKick','motionSpin','motionDrift','motionReverse','motionAngularVelocity'])delete s[key];
          eq.instances[eq.slots.engineering[0]].condition=0;nativeShipSystems.refreshShip(s,s,'player');
          __engineFlight.mode='critical-reserve';__engineFlight.rows=[];
          return {latinum:s.latinum,gallicite:s.minerals.gallicite,ids:Object.keys(eq.instances)};
        }''')
        page.locator('#space').focus();page.keyboard.down('w');page.keyboard.down('d')
        page.wait_for_function('()=>__engineFlight.rows.length>=30',timeout=15000)
        page.keyboard.up('w');page.keyboard.up('d')
        critical_reserve=page.evaluate('__engineFlight.rows.at(-1)')
        assert critical_reserve['speed']>0 and critical_reserve['speed']<=critical_reserve['cap'] and critical_reserve['angle']>.1,critical_reserve
        page.keyboard.down('x');page.wait_for_function('()=>__engineState.speed<.01',timeout=15000);page.keyboard.up('x')
        page.locator('#inventoryBtn').click()
        page.locator('#ship-inventory [data-equipment-kind="engineering"][data-equipment-place="slot"][data-equipment-index="0"]').click()
        page.locator('#ship-inventory [data-repair-device]').click()
        assert 'Manual steering and thrust are available' in page.locator('#ship-inventory').inner_text()
        assert page.evaluate('__engineState.phase')=='disabled'
        page.locator('#ship-inventory .inventory-close').click();page.locator('#space').focus()
        page.evaluate("()=>{__engineFlight.mode='critical-repaired';__engineFlight.rows=[];}")
        critical_start_heading=page.evaluate('__engineState.angle')
        page.keyboard.down('w');page.keyboard.down('d')
        page.wait_for_function('()=>__engineFlight.rows.length>=30',timeout=15000)
        page.keyboard.up('w');page.keyboard.up('d')
        critical_flight=page.evaluate('''()=>({step:__engineFlight.rows.at(-1),hull:__engineState.hull,
          engine:__engineState.shipEquipment.instances[__engineState.shipEquipment.slots.engineering[0]].condition,
          drones:nativeShipRepairs.playerDronesDeployed(__engineState)})''')
        assert critical_flight['hull']==5 and critical_flight['engine']==100 and not critical_flight['drones'],critical_flight
        critical_turn=math.atan2(math.sin(critical_flight['step']['angle']-critical_start_heading),math.cos(critical_flight['step']['angle']-critical_start_heading))
        assert critical_flight['step']['speed']>60 and critical_turn>.1,critical_flight
        page.screenshot(path=str(OUT/'critical-hull-manual-flight.png'))
        page.evaluate('''()=>{
          if(!nativeSaveStorage.write(__engineState).ok)throw Error('Critical-hull save failed');
          window.__criticalPrevious=__engineState;resumeNativeGame('normal');
        }''')
        page.wait_for_function('()=>__engineState!==__criticalPrevious',timeout=30000)
        page.evaluate("()=>{nativeSystemHub.close(false);nativePlanetEncounter.close(false);__engineFlight.mode='critical-continue';__engineFlight.rows=[];}")
        page.locator('#space').focus();page.keyboard.down('w');page.keyboard.down('d')
        page.wait_for_function('()=>__engineFlight.rows.length>=30',timeout=15000)
        page.keyboard.up('w');page.keyboard.up('d')
        critical_continue=page.evaluate('__engineFlight.rows.at(-1)')
        assert critical_continue['speed']>60 and critical_continue['angle']!=critical_flight['step']['angle'],critical_continue
        assert page.evaluate('__engineState.hull')==5
        assert not page.evaluate('nativeShipRepairs.playerDronesDeployed(__engineState)')
        page.keyboard.down('x');page.wait_for_function('()=>__engineState.speed<.01',timeout=15000);page.keyboard.up('x')
        page.locator('#repairBtn').click()
        recovery_mission=page.evaluate("nativeSaveStorage.read('normal').shipRepairs.missions.find(m=>m.manual&&m.target.category==='player')")
        assert recovery_mission and recovery_mission['status']=='active',recovery_mission
        page.locator('#repairBtn').click()
        assert page.evaluate("__engineState.shipRepairs.missions.filter(m=>m.manual&&m.target.category==='player').length")==1
        page.wait_for_function("()=>__engineState.phase==='flight'&&!nativeShipRepairs.playerDronesDeployed(__engineState)",timeout=90000)
        recovered_hull=page.evaluate('''()=>{
          const s=__engineState,eq=s.shipEquipment;
          return {hull:s.hull,phase:s.phase,deuranium:s.deuranium,gallicite:s.minerals.gallicite,latinum:s.latinum,
            ids:Object.keys(eq.instances),engine:eq.instances[eq.slots.engineering[0]].condition};
        }''')
        assert recovered_hull['hull']==50 and abs(recovered_hull['deuranium']-11)<1e-6,recovered_hull
        assert recovered_hull['gallicite']==disabled['gallicite']-10 and recovered_hull['latinum']==disabled['latinum'],recovered_hull
        assert recovered_hull['ids']==disabled['ids'] and recovered_hull['engine']==100,recovered_hull
        page.evaluate("()=>{__engineFlight.mode='hull-recovered';__engineFlight.rows=[];}")
        recovered_start_heading=page.evaluate('__engineState.angle')
        page.locator('#space').focus();page.keyboard.down('w');page.keyboard.down('d')
        page.wait_for_function("()=>__engineFlight.rows.filter(r=>r.mode==='hull-recovered').length>=30",timeout=15000)
        page.keyboard.up('w');page.keyboard.up('d')
        controls_recovered=page.evaluate('__engineFlight.rows.filter(r=>r.mode==="hull-recovered").at(-1)')
        recovered_turn=math.atan2(math.sin(controls_recovered['angle']-recovered_start_heading),math.cos(controls_recovered['angle']-recovered_start_heading))
        assert controls_recovered['speed']>20 and recovered_turn>.1,controls_recovered
        page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}')
        page.screenshot(path=str(OUT/'repaired-flight.png'));assert not errors,errors
        report={'passed':True,'damage':damage,'firstDamagedStep':rows[0],'settled':rows[-1],'failed':failed,'driftSteps':len(drift),'repair':repaired,'recovered':after[-1],'criticalReserve':critical_reserve,'criticalFlight':critical_flight,'criticalContinue':critical_continue,'hullRecovery':recovered_hull,'controlsRecovered':controls_recovered,'errors':errors}
        (OUT/'browser.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));browser.close()
finally:server.shutdown()
