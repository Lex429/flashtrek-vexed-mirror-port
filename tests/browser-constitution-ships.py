"""Equip both new hulls through Dev tools, then fly, fire and reload real saves."""
import functools,json,os,tempfile,threading,sys
from pathlib import Path
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from local_site import Handler
OUTPUT=ROOT/'test-results/constitution-flight';OUTPUT.mkdir(parents=True,exist_ok=True)
class Quiet(Handler):
    def log_message(self,*args):pass

errors=[];report=[]
with tempfile.TemporaryDirectory(prefix='constitution-flight-') as storage:
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    server.state=Path(storage)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,channel=os.environ.get('BROWSER_CHANNEL','msedge'))
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
            page.locator('[data-menu="dev"]').click()
            page.wait_for_function('()=>nativeNpcDev.getState()&&nativeSolAsteroids.placements.length',timeout=120000)
            page.evaluate('''()=>{
              const draw=vexedFlightAssets.drawShip;window.__constitutionDraws={};
              vexedFlightAssets.drawShip=function(ctx,asset,...args){if(asset&&[426,427].includes(asset.type))__constitutionDraws[asset.type]=asset.damageStage;return draw.call(this,ctx,asset,...args);};
            }''')
            for id in [426,427]:
                before=page.evaluate('()=>Object.keys(nativeNpcDev.getState().shipEquipment.instances).sort()')
                page.locator('#devToolsBtn').click()
                page.locator('[data-dev-ship]').select_option(str(id))
                page.wait_for_selector('[data-dev-preview].ready',timeout=30000)
                assert page.locator('[data-dev-placeholder]').evaluate('(im)=>im.complete&&im.naturalWidth===1024')
                page.screenshot(path=str(OUTPUT/f'{id}-dev-preview.png'))
                page.locator('[data-dev-equip]').click()
                page.wait_for_function('(id)=>nativeNpcDev.getState().shipType===id',arg=id)
                assert page.evaluate('()=>Object.keys(nativeNpcDev.getState().shipEquipment.instances).sort()')==before
                page.locator('#inventoryBtn').click()
                page.wait_for_selector('#ship-inventory canvas.ready',timeout=30000)
                for kind,count in [('weapon',3),('repairDrone',2),('ability',2),('engineering',1),('shield',1)]:
                    assert page.locator(f'#ship-inventory [data-equipment-kind="{kind}"][data-equipment-place="slot"]').count()==count
                page.screenshot(path=str(OUTPUT/f'{id}-inventory.png'))
                page.locator('.inventory-close').click()
                page.locator('#devToolsBtn').click()
                page.locator('[data-dev-system]').select_option('11');page.locator('[data-dev-jump]').click()
                page.evaluate('''()=>{const s=nativeNpcDev.getState();Object.assign(s,{x:30000,y:30000,angle:0,speed:0,vx:0,vy:0,phase:'flight',landed:false,localCruise:null,arrivalApproach:null});delete s.motionKick;delete s.motionSpin;}''')
                start=page.evaluate('()=>({x:nativeNpcDev.getState().x,y:nativeNpcDev.getState().y,angle:nativeNpcDev.getState().angle})')
                page.keyboard.down('w')
                page.wait_for_function('()=>nativeNpcDev.getState().speed>40',timeout=10000)
                page.keyboard.up('w');page.keyboard.down('a')
                page.wait_for_function('(angle)=>Math.abs(nativeNpcDev.getState().angle-angle)>.1',arg=start['angle'],timeout=10000)
                page.keyboard.up('a')
                flown=page.evaluate('()=>({x:nativeNpcDev.getState().x,y:nativeNpcDev.getState().y,speed:nativeNpcDev.getState().speed,angle:nativeNpcDev.getState().angle})')
                assert abs(flown['x']-start['x'])+abs(flown['y']-start['y'])>1
                page.wait_for_function('(id)=>__constitutionDraws[id]===0',arg=id,timeout=30000)
                page.screenshot(path=str(OUTPUT/f'{id}-flight.png'))
                rock=page.evaluate('''()=>{
                  const s=nativeNpcDev.getState(),spec=nativeWeaponRules.weaponSpec(VexedMirrorWeapons.find(w=>w.id===1),'beam');
                  let rock;
                  search:for(const candidate of nativeSolAsteroids.forSystem(11).slice(0,40)){
                    if(nativeCivilianTraffic.isMiningRock(s,candidate.slotId)||(s.destroyedAsteroids||[]).includes(candidate.slotId))continue;
                    for(let i=0;i<16;i++){
                      const angle=i*Math.PI/8,distance=Math.max(160,candidate.size*.43+85);
                      Object.assign(s,{x:candidate.x-Math.cos(angle)*distance,y:candidate.y-Math.sin(angle)*distance,angle,speed:0,vx:0,vy:0});
                      nativeShipSystems.invalidate(s);
                      const target={...candidate,id:'rock:'+candidate.slotId,rockId:candidate.slotId};
                      if(nativeWeaponRules.firingSolution(nativeShipDefinitions.describe(s),target,spec,'beam',nativeCombatShots.scene(s))){rock=candidate;break search;}
                    }
                  }
                  if(!rock)throw Error('No unobstructed asteroid firing fixture');
                  nativeAsteroidCombat.select(rock);
                  window.__constitutionRock=rock;
                  const fire=nativeCombatShots.fire;window.__constitutionShot=null;
                  nativeCombatShots.fire=function(options){const result=fire(options);__constitutionShot={ok:result.ok,error:result.error,event:result.event};return result;};
                  return rock.slotId;
                }''')
                page.keyboard.press('Space')
                page.wait_for_function('()=>window.__constitutionShot?.ok',timeout=10000)
                page.wait_for_function('(id)=>{const s=nativeNpcDev.getState();return s.asteroidDamage?.[id]>0||(s.destroyedAsteroids||[]).includes(id);}',arg=rock,timeout=15000)
                # The ordinary collision owner applies damage; the active flight
                # renderer must subsequently display each matching artwork stage.
                page.evaluate('''()=>{const s=nativeNpcDev.getState();nativeAsteroidCombat.clear();Object.assign(s,{x:30000,y:30000,speed:0,vx:0,vy:0,shields:0});}''')
                stages=[]
                for amount,stage in [(70,1),(50,2),(50,3)]:
                    hit=page.evaluate('(amount)=>{const s=nativeNpcDev.getState();return nativeCombatShots.onPlayerHit(s,amount,{from:{x:s.x-100,y:s.y},kind:"beam"});}',amount)
                    assert hit['ok']
                    page.wait_for_function('([id,stage])=>__constitutionDraws[id]===stage',arg=[id,stage],timeout=60000)
                    stage_info=page.evaluate('([id,stage])=>({hull:nativeNpcDev.getState().hull,lights:starterShips.get(id).effects.snapshot(stage,0,{lights:true,damage:true}).lights})',[id,stage])
                    if stage==3:assert stage_info['lights']==0
                    stages.append(stage_info)
                    page.screenshot(path=str(OUTPUT/f'{id}-damage-{stage}.png'))
                cache=page.evaluate('''async id=>{
                  const data=await nativeShipEffects.prepare(id),before=nativeShipEffects.metrics();
                  await nativeShipEffects.prepare(id);const after=nativeShipEffects.metrics();
                  return {sizes:data.assets.map(a=>[a.width,a.height]),ready:data.optionalReady,loadsBefore:before.loads,loadsAfter:after.loads,bytes:after.cacheBytes,limit:after.limits.bytes};
                }''',id)
                assert cache['ready'] and all(size==[384,576] for size in cache['sizes']),cache
                assert cache['loadsBefore']==cache['loadsAfter'] and cache['bytes']<=cache['limit'],cache
                # Save the actual damaged hull and its equipment, then use the
                # same Dev Continue route offered to the player after a reload.
                saved=page.evaluate('''()=>{const s=nativeNpcDev.getState();if(!nativeSaveStorage.write(s).ok)throw Error('Save failed');return {shipType:s.shipType,hull:s.hull,equipment:JSON.stringify(s.shipEquipment)};}''')
                page.reload()
                page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
                page.locator('[data-menu="continue-dev"]').click()
                page.wait_for_function('(id)=>nativeNpcDev.getState()?.shipType===id',arg=id,timeout=30000)
                # Existing Dev Continue refills health/resources for every hull.
                assert page.evaluate('()=>nativeNpcDev.getState().hull===nativeShipDefinitions.forEntity(nativeNpcDev.getState()).hull')
                assert page.evaluate('()=>JSON.stringify(nativeNpcDev.getState().shipEquipment)')==saved['equipment']
                # Restore through Dev tools for the next hull, preserving owned fitting.
                page.locator('#devToolsBtn').click();page.locator('[data-dev-ship]').select_option(str(id));page.locator('[data-dev-equip]').click()
                page.evaluate('''()=>{const draw=vexedFlightAssets.drawShip;window.__constitutionDraws={};vexedFlightAssets.drawShip=function(ctx,asset,...args){if(asset&&[426,427].includes(asset.type))__constitutionDraws[asset.type]=asset.damageStage;return draw.call(this,ctx,asset,...args);};}''')
                report.append({'ship':id,'keyboardFlight':flown,'inventory':True,'weaponHit':True,'damageStages':stages,'shipAndFittingReload':True,'existingDevHealthRefill':True,'flightCache':cache})
                print(json.dumps(report[-1]),flush=True)
            diagnostics=page.evaluate('()=>nativeWorldBootstrap.diagnostics()')
            assert diagnostics['ready'] and not diagnostics['error'],diagnostics
            assert not errors,errors
            (OUTPUT/'report.json').write_text(json.dumps({'ships':report,'bootstrap':diagnostics,'errors':errors},indent=2),encoding='utf-8')
            print(json.dumps({'passed':True,'errors':errors,'bootstrap':diagnostics}),flush=True)
            browser.close()
    finally:server.shutdown();server.server_close()
