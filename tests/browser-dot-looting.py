"""Normal game: real DOT targeting/fire, live theft, actual Inventory and Continue."""
import functools,http.server,json,os,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/dot-looting';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        try:super().do_GET()
        except (BrokenPipeError,ConnectionResetError):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
report={'passed':False,'errors':[]};page=None
observe='''()=>{const api=nativeShipEquipment,ensure=api.ensure;window.nativeShipEquipment={...api,ensure(s,h=s,d){if(s?.captain&&h===s)window.__lootState=s;return ensure(s,h,d);}};}'''
point='''id=>{const s=__lootState,d=id==='carrier'?nativeShipDefinitions.describe(s,s.civilianTraffic.ships.find(e=>e.id===__victim),'civilian'):nativeShipRepairs.resolveDrone(s,id,s.system),
  p=nativeSimulationFrame.renderPose(s,d),player=nativeSimulationFrame.renderPose(s,nativeShipDefinitions.describe(s,s,{category:'player'})),canvas=document.querySelector('#space'),r=canvas.getBoundingClientRect(),v=nativeView.measure(canvas);
  return {x:r.left+(v.w/2+p.x-player.x)/v.w*r.width,y:r.top+(v.h/2+p.y-player.y)/v.h*r.height};}'''
def click_target(identity):
    p=page.evaluate(point,identity);page.mouse.click(p['x'],p['y'])
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.nativeShipLootView&&nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate(observe);page.locator('[data-menu="new"]').click();page.locator('#setup-ui .setup-primary').click()
        page.locator('input[name="captain"]').fill('Loot Regression');page.locator('input[name="ship"]').fill('ISS Recovery');page.locator('input[name="government"]').fill('Test Command');page.locator('#setup-ui .setup-primary').click()
        page.wait_for_function('()=>window.__lootState&&document.body.classList.contains("playing")&&!nativeSetup.active&&!nativeMenuTransition.snapshot().active',timeout=120000)
        fixture=page.evaluate('''()=>{
          const s=__lootState,e=s.civilianTraffic.ships.find(e=>{const d=nativeShipDefinitions.get(e.shipType);return e.role!=='medical'&&d.hull>=400&&d.hull<=1000&&d.slots.repairDrone>=2&&e.hull>0&&e.repairBay?.slots.filter(d=>d.hull>0&&d.phase==='stowed').length>=2;});if(!e)throw Error('No existing large victim with two operational DOTs');
          nativeNpcLives.interrupt(s,e,'disabled');nativeShipMotion.stop(s);nativeShipMotion.stop(e);
          Object.assign(s,{x:4500,y:6500,previousX:4500,previousY:6500,angle:0,deuranium:0});nativeManualFlight.initializeRegion(s);
          const d=nativeShipDefinitions.forEntity(s,e,{category:'civilian'});Object.assign(e,{system:s.system,x:s.x+220,y:s.y,previousX:s.x+220,previousY:s.y,hull:d.hull*.25,shields:0,phase:'disabled',repairDeuranium:40,cargo:{good:5,tons:8,owner:e.id}});
          delete e.journey;delete e.localLeg;delete e.lifeLeg;delete e.combatInterruption;delete e.combatReturn;
          const eq=nativeShipEquipment.ensure(s,e),id=eq.slots.engineering[0],item=eq.instances[id];item.condition=17.5;item.readyAt=123.75;
          const own=nativeShipEquipment.ensure(s);for(let i=1;i<own.slots.weapon.length;i++)if(own.slots.weapon[i])nativeShipEquipment.move(s,{category:'weapon',fromType:'slot',fromIndex:i,toType:'locker',toIndex:own.locker.length});
          window.__victim=e.id;window.__victimItem=id;nativeShipRepairs.observe(s,e,'civilian');nativeNpcLives.invalidateMembership(s);nativeShipSystems.invalidate(s);
          return {id:e.id,item:id,itemName:nativeShipEquipment.model(item.modelId).name,initialHull:e.hull,crews:s.civilianTraffic.ships.length};
        }''')
        page.wait_for_timeout(250);click_target('carrier');page.wait_for_selector('#lootBtn:not([hidden]):not([disabled])',timeout=15000)
        page.locator('#lootBtn').click();page.wait_for_selector('#ship-loot:not([hidden])')
        first=page.evaluate('''()=>({time:nativeSimulation.seconds(__lootState),hull:__lootState.civilianTraffic.ships.find(e=>e.id===__victim).hull})''')
        page.wait_for_function('()=>nativeShipRepairs.drones(__lootState,__lootState.system).some(d=>d.entity.carrier.id===__victim)',timeout=20000)
        page.wait_for_function('(h)=>__lootState.civilianTraffic.ships.find(e=>e.id===__victim).hull>h',arg=first['hull'],timeout=20000)
        assert page.evaluate('nativeSimulation.seconds(__lootState)')>first['time']
        page.locator('#ship-loot .loot-tile[data-loot-key="cargo"]').click()
        assert page.evaluate('__lootState.solFreightHold[5]')==8
        assert page.evaluate('__lootState.civilianTraffic.ships.find(e=>e.id===__victim).cargo') is None
        page.screenshot(path=str(OUT/'live-looting.png'))
        # A verified-save failure must return the fitted item to its original holder.
        before=page.evaluate('''()=>{const e=__lootState.civilianTraffic.ships.find(e=>e.id===__victim);return {source:e.shipEquipment.instances[__victimItem],locker:__lootState.shipEquipment.locker};}''')
        page.evaluate('''()=>{window.__lootStorage=nativeSaveStorage;window.nativeSaveStorage={...nativeSaveStorage,write:()=>({ok:false,error:'Test storage denied'})};}''')
        gear=page.locator('#ship-loot .loot-tile[data-loot-key="equipment:'+fixture['item']+'"]')
        gear.click();assert 'Test storage denied' in page.locator('.loot-message').inner_text()
        after=page.evaluate('''()=>{const e=__lootState.civilianTraffic.ships.find(e=>e.id===__victim);return {source:e.shipEquipment.instances[__victimItem],locker:__lootState.shipEquipment.locker};}''')
        assert after==before,(before,after)
        page.evaluate('window.nativeSaveStorage=__lootStorage');gear.click()
        stolen=page.evaluate('''()=>{const s=__lootState,e=s.civilianTraffic.ships.find(e=>e.id===__victim),id=s.shipEquipment.locker.at(-1);return {id,item:s.shipEquipment.instances[id],sourcePresent:!!e.shipEquipment.instances[__victimItem]};}''')
        assert not stolen['sourcePresent'] and stolen['item']['condition']==17.5 and stolen['item']['readyAt']==123.75,stolen
        page.locator('.loot-close').click()
        # Exercise the existing controller dispatch, not only its menu helper.
        page.evaluate('''()=>{window.__lootPad={id:'Standard Gamepad',index:1,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};
          window.__lootPadConnected=true;window.__lootPadSamples=[];Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{if(__lootPadSamples.length<2000)__lootPadSamples.push({at:performance.now(),buttons:__lootPad.buttons.flatMap((b,i)=>b.pressed?[i]:[]),focused:document.activeElement?.dataset.itemKey||document.activeElement?.tagName});return __lootPadConnected?[null,__lootPad]:[];}});}''')
        def press_pad(index):
            # Keep each hardware state until the real game loop samples it.
            # A fixed sleep could press and release entirely between cold-art frames.
            started=page.evaluate('i=>{__lootPad.buttons[i]={pressed:true,value:1};return performance.now();}',index)
            page.wait_for_function('([i,at])=>__lootPadSamples.some(s=>s.at>=at&&s.buttons.includes(i))',arg=[index,started],timeout=5000)
            released=page.evaluate('i=>{__lootPad.buttons[i]={pressed:false,value:0};return performance.now();}',index)
            page.wait_for_function('([i,at])=>__lootPadSamples.some(s=>s.at>=at&&!s.buttons.includes(i))',arg=[index,released],timeout=5000)
        page.wait_for_function('()=>document.querySelector("#controller-status").dataset.state==="connected"&&document.hasFocus()',timeout=15000)
        page.wait_for_timeout(200);press_pad(0)
        assert page.evaluate('nativeShipLootView.active'),page.evaluate('''()=>({lock:nativeTargetingActions.snapshot().lock,notice:document.querySelector('#connection').textContent,pause:nativePause.active,inventory:nativeShipInventory.active,modal:!document.querySelector('#modal').hidden,menu:!document.querySelector('#menu-art').hidden,game:__lootState&&{landed:__lootState.landed,localCruise:__lootState.localCruise,hull:__lootState.hull},target:__lootState&&nativeCivilianTraffic.target(__lootState)?.phase})''')
        source=page.locator('#ship-loot [data-owner="source"]')
        source.locator('select').select_option('equipment');source.locator('select').focus();press_pad(13)
        assert page.evaluate("document.activeElement?.matches('#ship-loot [data-owner=source] .loot-tile')"),page.evaluate('''()=>({samples:__lootPadSamples.slice(-35),focused:document.activeElement?.outerHTML,active:nativeShipLootView.active,notice:document.querySelector('#connection').textContent})''')
        controller_item=page.evaluate('document.activeElement.dataset.itemKey')
        press_pad(0)
        assert page.evaluate('(key)=>!__lootState.civilianTraffic.ships.find(e=>e.id===__victim).shipEquipment.instances[key.slice(10)]',controller_item),page.evaluate('''key=>({key,samples:__lootPadSamples.slice(-35),focused:document.activeElement?.outerHTML,message:document.querySelector('#ship-loot .loot-message').textContent,notice:document.querySelector('#connection').textContent,active:nativeShipLootView.active,phase:__lootState.civilianTraffic.ships.find(e=>e.id===__victim).phase})''',controller_item)
        assert page.evaluate('__lootState.solFreightHold[5]')==8
        press_pad(1);assert not page.evaluate('nativeShipLootView.active||nativePause.active')
        page.evaluate('__lootPadConnected=false');page.wait_for_timeout(160)
        print(json.dumps({'checkpoint':'cargo and worn equipment transferred; save rollback passed','errors':report['errors']}),flush=True)
        # Actual click + Space uses the ordinary player firing owner on each DOT.
        page.wait_for_function('()=>nativeShipRepairs.drones(__lootState,__lootState.system).filter(d=>d.entity.carrier.id===__victim).length>=2',timeout=20000)
        dots=page.evaluate('nativeShipRepairs.drones(__lootState,__lootState.system).filter(d=>d.entity.carrier.id===__victim).map(d=>d.id)')
        for index,dot in enumerate(dots):
            page.evaluate('''id=>{const s=__lootState,e=s.civilianTraffic.ships.find(e=>e.id===__victim),d=nativeShipRepairs.resolveDrone(s,id,s.system),dx=d.x-e.x,dy=d.y-e.y,length=Math.hypot(dx,dy)||1;
              nativeShipMotion.stop(s);s.x=d.x+dx/length*150;s.y=d.y+dy/length*150;s.previousX=s.x;s.previousY=s.y;s.angle=Math.atan2(d.y-s.y,d.x-s.x);nativeShipSystems.refreshShip(s,s,'player');}''',dot)
            page.wait_for_timeout(200);click_target(dot)
            assert page.evaluate('nativeTargetingActions.snapshot().lock')=='repair-drone:'+dot
            page.screenshot(path=str(OUT/f'dot-target-{index}.png'))
            page.keyboard.down('Space')
            page.wait_for_function('id=>{const s=__lootState,e=s.civilianTraffic.ships.find(e=>e.id===__victim);return e.shipEquipment.instances[id].hull===0;}',arg=dot,timeout=30000)
            page.keyboard.up('Space')
        halted=page.evaluate('''()=>{const e=__lootState.civilianTraffic.ships.find(e=>e.id===__victim);return {hull:e.hull,reserve:e.repairDeuranium};}''')
        page.wait_for_timeout(800)
        assert page.evaluate('__lootState.civilianTraffic.ships.find(e=>e.id===__victim).hull')==halted['hull']
        assert page.evaluate('__lootState.civilianTraffic.ships.find(e=>e.id===__victim).repairDeuranium')==halted['reserve']
        click_target('carrier');page.keyboard.press('l');page.wait_for_selector('#ship-loot:not([hidden])')
        page.locator('#ship-loot [data-loot-take-all]').click()
        assert page.evaluate('__lootState.solFreightHold[5]')==8
        page.keyboard.press('Escape');assert not page.evaluate('nativePause.active')
        page.keyboard.press('i');page.wait_for_selector('#ship-inventory canvas.ready',timeout=60000)
        locker_index=page.evaluate('(id)=>__lootState.shipEquipment.locker.indexOf(id)',stolen['id'])
        page.locator(f'#ship-inventory [data-equipment-kind="engineering"][data-equipment-place="locker"][data-equipment-index="{locker_index}"]').click()
        assert page.locator('#ship-inventory .inventory-detail-heading strong').inner_text()==fixture['itemName']
        page.screenshot(path=str(OUT/'stolen-equipment-inventory.png'));page.locator('.inventory-close').click()
        # Normal save/Continue keeps the same fleet, stolen belongings and destroyed DOTs.
        page.locator('#pauseBtn').click();page.locator('#pause-menu [data-save]').click();page.reload()
        page.wait_for_function('()=>document.querySelector("#startup").hidden',timeout=120000);page.evaluate(observe);page.locator('[data-menu="continue"]').click()
        page.wait_for_function('()=>window.__lootState&&document.body.classList.contains("playing")',timeout=120000)
        persisted=page.evaluate('''([victim,ids,item])=>{const s=__lootState,e=s.civilianTraffic.ships.find(e=>e.id===victim);return {goods:s.solFreightHold[5],item:s.shipEquipment.instances[item],sourceCargo:e.cargo,dots:ids.map(id=>({hull:e.shipEquipment.instances[id].hull,phase:e.shipEquipment.instances[id].phase})),crews:s.civilianTraffic.ships.length};}''',[fixture['id'],dots,stolen['id']])
        assert persisted['goods']==8 and persisted['item']['condition']==17.5 and persisted['sourceCargo'] is None,persisted
        assert persisted['crews']==fixture['crews']==1200 and all(d['hull']==0 and d['phase']=='destroyed' for d in persisted['dots']),persisted
        assert not report['errors'],report['errors']
        report.update(passed=True,normalGame=True,liveRepairsDuringLoot=True,cargoTransferred=8,wornFittedEquipmentPreserved=True,failedSaveRollback=True,controllerLoot=True,actualDotClicksAndWeapons=True,destroyedDots=len(dots),repairsStopped=True,actualInventory=True,normalContinue=True,population=1200)
        print(json.dumps(report),flush=True);browser.close()
finally:
    (OUT/'browser.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    server.shutdown();server.server_close()
