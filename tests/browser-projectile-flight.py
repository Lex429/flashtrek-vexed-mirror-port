"""Actual flight keys, shared moving projectile physics, turning and reload."""
import functools
import http.server
import json
import math
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/projectile-flight'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

SETUP=r'''()=>{
  const template=JSON.parse(JSON.stringify(__projectileState.civilianTraffic.ships[0]));
  const accepted=[],fire=nativeCombatShots.fire;
  window.nativeCombatShots={...nativeCombatShots,fire(options){const result=fire(options);if(result.ok)accepted.push(result.event);return result;}};
  // Bind the synthetic host ahead of wall time so screenshot/driver latency
  // cannot advance a projectile by extra physical steps between key events.
  let time;
  const rebind=()=>{time=performance.now()+60000;nativeSimulationHost.reset(time);};
  const step=(dt=1/60)=>{time+=dt*1000;__projectileFrame(time);};
  const frames=n=>{for(let i=0;i<n;i++)step();};
  function fixture({weapon=6,heading=0,drift=false,reverse=false,moving=false,locked=true}={}){
    const s=__projectileState;nativePause.close();nativeShipInventory.close();nativeCombatShots.reset();
    for(const key of ['weaponCombat','shipEquipment','weaponLoadout','localCruise','arrivalApproach','motionSpin','motionKick','localLeg'])delete s[key];
    Object.assign(s,{devMode:false,system:1,localBody:3,shipType:47,x:100000,y:100000,angle:heading,speed:0,landed:false,phase:'cruise',hull:100000,shields:100000,weapons:[weapon],weaponInventory:[],minedAsteroids:[],destroyedAsteroids:[]});
    s.solEconomy.freighters=[];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];
    nativeShipMotion.stop(s);nativeShipEquipment.ensure(s);
    const maximum=nativeShipMotion.profiles.manual(nativeShipDefinitions.forEntity(s,s,{category:'player'})).maxSpeed;
    const speed=maximum*.95;
    s.vx=reverse?-speed:speed;s.vy=0;s.speed=speed;s.motionDrift=true;
    const p=vexedSolFlight.shipPosition(s),distance=weapon===6?700:1100;
    const target={...JSON.parse(JSON.stringify(template)),id:99801,name:'Projectile flight target',shipType:47,system:1,phase:'cruise',scriptedDemo:'projectile-flight',x:p.x+Math.cos(heading)*distance,y:p.y+Math.sin(heading)*distance,heading:Math.PI/2,hull:100000,shields:100000};
    target.previousX=target.x;target.previousY=target.y;
    for(const key of ['localLeg','journey','motionSpin','motionKick','combatAI','disputeId','retaliationId'])delete target[key];
    nativeShipMotion.stop(target);if(moving){target.vy=120;target.speed=120;target.motionDrift=true;}
    s.civilianTraffic.ships=[target];s.minedAsteroids=nativeSolAsteroids.nearby(1,p,5000).map(r=>r.slotId);
    nativeSolEconomy.clearTarget();nativeAsteroidCombat.deselect();nativeCivilianTraffic.clearTarget();if(locked)nativeCivilianTraffic.select(target.id);nativeShipSystems.invalidate(s);accepted.length=0;
    rebind();step();
    return {maximum,distance,target:target.id,weapon,heading,drift,reverse,moving};
  }
  window.__projectile={fixture,step,frames,rebind,accepted,state:()=>__projectileState,latest:()=>accepted.at(-1)};
}'''

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    errors=[];rows=[];manual=[]
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1366,'height':768});page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('''()=>{const advance=nativeCivilianTraffic.advance;nativeCivilianTraffic.advance=(s,dt)=>{
              window.__projectileState=s;
              if(!window.__projectileFixture)return advance(s,dt);
              const target=s.civilianTraffic.ships[0];if(target?.speed>0)nativeShipSystems.move(s,target,'civilian',{drift:true},{maxSpeed:200,acceleration:0,braking:0,turnRate:0,vectorFlight:true},dt);
            };startNativeDevGame();}''')
            page.wait_for_function('()=>nativeNpcDev.getState()&&nativeCivilianTraffic.effectsReady()',timeout=120000)
            page.evaluate('''()=>{window.__projectileFixture=true;window.requestAnimationFrame=callback=>{if(callback.name==='draw'&&(!window.__projectileFrame||window.__projectileFrame===callback))window.__projectileFrame=callback;return 0;};}''')
            page.wait_for_function('()=>typeof __projectileFrame==="function"',polling=50)
            page.evaluate(SETUP)
            for weapon in [6,15,16]:
                for mode in ['forward','drift-turn','reverse','moving-target']:
                    info=page.evaluate('__projectile.fixture',{'weapon':weapon,'heading':-1.5707963267948966 if mode=='drift-turn' else 0,'drift':mode=='drift-turn','reverse':mode=='reverse','moving':mode=='moving-target'})
                    print(json.dumps({'weapon':weapon,'mode':mode}),flush=True)
                    page.locator('#space').focus()
                    page.keyboard.down('Space');page.evaluate('__projectile.step()');page.keyboard.up('Space')
                    first=page.evaluate('''()=>{const e=__projectile.latest(),s=__projectile.state();if(!e){const target=nativeCivilianTraffic.target(s),status=nativeCombatShots.firingStatus(s,nativeShipDefinitions.describe(s,s,{category:'player'}),target);throw Error('Actual Space key fired no projectile: '+JSON.stringify({reason:status.reason,message:status.message,target:target?.id,focus:document.activeElement?.id,gate:nativeSimulation.blocked(),notice:document.querySelector('#connection').textContent}));}return {id:e.id,vx:e.vx,vy:e.vy,inheritedVx:e.inheritedVx,inheritedVy:e.inheritedVy,speed:e.speed,x:e.x,y:e.y,source:e.sourceSnapshot,emitter:e.emitter,heading:s.angle};}''')
                    assert abs(((first['vx']-first['inheritedVx'])**2+(first['vy']-first['inheritedVy'])**2)**.5-first['speed'])<1e-6,first
                    page.keyboard.down('KeyD');page.evaluate('__projectile.frames(2)')
                    if mode=='drift-turn':page.screenshot(path=str(OUT/f'weapon-{weapon}-turn.png'))
                    page.evaluate('__projectile.frames(6)');page.keyboard.up('KeyD')
                    turning=page.evaluate('''()=>{const e=__projectile.latest(),s=__projectile.state();return {heading:s.angle,vx:e.vx,vy:e.vy,age:e.age,resolved:e.resolved};}''')
                    assert turning['heading']!=first['heading'],turning
                    if weapon==6:
                        assert abs(turning['vx']-first['vx'])<1e-8 and abs(turning['vy']-first['vy'])<1e-8,turning
                    page.evaluate('__projectile.frames(120)')
                    result=page.evaluate('''()=>{const e=__projectile.latest(),s=__projectile.state();return {resolved:e.resolved,hit:e.hitTargetId,targetShields:s.civilianTraffic.ships[0].shields,age:e.age,ttl:e.ttl};}''')
                    assert result['resolved'] and result['hit']==info['target'] and result['targetShields']<100000,{'info':info,'first':first,'result':result}
                    rows.append({'mode':mode,'fixture':info,'launch':first,'turning':turning,'result':result})
            for weapon in [6,15,16]:
                for mode in ['straight','drift-turn']:
                    page.evaluate('__projectile.fixture',{'weapon':weapon,'heading':-1.5707963267948966 if mode=='drift-turn' else 0,'locked':False})
                    if mode=='straight':page.evaluate('nativeShipMotion.stop(__projectile.state())')
                    page.locator('#space').focus()
                    page.keyboard.down('Space');page.evaluate('__projectile.step()');page.keyboard.up('Space')
                    launch=page.evaluate('''()=>{const e=__projectile.latest();if(!e)throw Error('Space did not fire without a lock');return {unguided:e.unguided,target:e.targetId,snapshot:e.targetSnapshot,turn:e.turn,spread:e.aimError,vx:e.vx,vy:e.vy,inheritedVx:e.inheritedVx,inheritedVy:e.inheritedVy,speed:e.speed,heading:e.sourceSnapshot.heading};}''')
                    assert launch['unguided'] and launch['target'] is None and launch['snapshot'] is None and launch['turn']==0 and launch['spread']==0,launch
                    assert abs(launch['vx']-launch['inheritedVx']-math.cos(launch['heading'])*launch['speed'])<1e-6,launch
                    assert abs(launch['vy']-launch['inheritedVy']-math.sin(launch['heading'])*launch['speed'])<1e-6,launch
                    page.keyboard.down('KeyD');page.evaluate('__projectile.frames(2)')
                    if mode=='drift-turn':page.screenshot(path=str(OUT/f'weapon-{weapon}-unlocked.png'))
                    page.evaluate('__projectile.frames(6)');page.keyboard.up('KeyD')
                    turning=page.evaluate('''()=>{const e=__projectile.latest();return {vx:e.vx,vy:e.vy,heading:__projectile.state().angle};}''')
                    assert abs(turning['vx']-launch['vx'])<1e-7 and abs(turning['vy']-launch['vy'])<1e-7 and turning['heading']!=launch['heading'],turning
                    page.evaluate('__projectile.frames(180)')
                    outcome=page.evaluate('''()=>{const e=__projectile.latest(),s=__projectile.state();return {resolved:e.resolved,hit:e.hitTargetId??null,shields:s.civilianTraffic.ships[0].shields,retaliations:s.civilianTraffic.retaliations.length,selected:nativeCivilianTraffic.target(s)?.id??null};}''')
                    assert outcome['resolved'] and outcome['selected'] is None,outcome
                    if mode=='straight':assert outcome['hit']==99801 and outcome['shields']<100000 and outcome['retaliations']>0,outcome
                    else:assert outcome['hit'] is None and outcome['shields']==100000,outcome
                    manual.append({'weapon':weapon,'mode':mode,'launch':launch,'outcome':outcome})
            # Held forward fire retains normal recharge and stops at lock changes.
            page.evaluate('''()=>{__projectile.fixture({weapon:6,locked:false});const s=__projectile.state(),t=s.civilianTraffic.ships[0];nativeShipMotion.stop(s);t.y+=150;t.previousY=t.y;nativeShipSystems.invalidate(s);}''')
            page.locator('#space').focus();page.keyboard.down('Space');page.evaluate('__projectile.frames(120)')
            held=page.evaluate('''()=>__projectile.accepted.map(e=>({unguided:e.unguided,at:e.launchedAt,recharge:e.spec.recharge}))''')
            assert len(held)>=5 and all(e['unguided'] for e in held),held
            assert all(b['at']-a['at']>=a['recharge']-1e-7 for a,b in zip(held,held[1:])),held
            page.evaluate('''()=>{nativeCivilianTraffic.select(99801);__projectile.frames(60);}''')
            assert page.evaluate('__projectile.accepted.length')==len(held)
            page.keyboard.up('Space');page.keyboard.down('Space');page.evaluate('__projectile.step()')
            assert page.evaluate('''()=>!__projectile.latest().unguided&&__projectile.latest().targetId===99801''')
            count=page.evaluate('__projectile.accepted.length')
            page.evaluate('''()=>{nativeCivilianTraffic.clearTarget();__projectile.frames(60);}''')
            assert page.evaluate('__projectile.accepted.length')==count
            page.keyboard.up('Space')
            # Pause, inventory and lost focus also stop a forward-fire hold.
            for gate in ['pause','inventory','blur']:
                page.evaluate('__projectile.fixture({weapon:6,locked:false})');page.locator('#space').focus()
                page.keyboard.down('Space');page.evaluate('__projectile.frames(8)')
                count=page.evaluate('__projectile.accepted.length')
                if gate=='blur':page.evaluate("dispatchEvent(new Event('blur'))")
                else:
                    page.keyboard.press('Escape' if gate=='pause' else 'i');page.evaluate('__projectile.frames(20)')
                    page.keyboard.press('Escape' if gate=='pause' else 'i')
                page.evaluate('__projectile.frames(80)')
                assert page.evaluate('__projectile.accepted.length')==count,gate
                page.keyboard.up('Space')
            # A beam-only fit cannot fire or spend its charge without a lock.
            page.evaluate('''()=>{const id=VexedMirrorWeapons.find(w=>w.damage>0&&nativeCombatShots.weaponVisual(w).kind==='beam').id;__projectile.fixture({weapon:id,locked:false});}''')
            page.locator('#space').focus();page.keyboard.press('Space');page.evaluate('__projectile.frames(20)')
            assert page.evaluate('__projectile.accepted.length')==0
            assert 'target lock' in page.locator('#connection').inner_text()
            assert page.evaluate('nativeWeaponLoadout.equipped(__projectile.state())[0].instance.readyAt')<=page.evaluate('nativeSimulation.seconds(__projectile.state())')
            page.evaluate('__projectile.fixture({weapon:15})')
            page.locator('#space').focus()
            page.keyboard.down('Space');page.evaluate('__projectile.step()');page.keyboard.up('Space')
            saved=page.evaluate('''()=>{const s=__projectile.state(),e=__projectile.latest();const result=nativeSaveStorage.write(s);if(!result.ok)throw Error(result.error);return {event:JSON.parse(JSON.stringify(e)),stored:nativeSaveStorage.read('normal').weaponCombat.events.length};}''')
            assert saved['stored']>0,saved
            page.evaluate('''()=>{resumeNativeGame('normal');__projectile.rebind();__projectile.frames(1);}''')
            restored=page.evaluate('''()=>{const e=__projectile.state().weaponCombat.events.find(e=>e.id===%d);return e&&{id:e.id,speed:e.speed,inheritedVx:e.inheritedVx,weaponId:e.weaponId};}'''%saved['event']['id'])
            assert restored and restored['speed']==saved['event']['speed'],restored
            page.evaluate('__projectile.frames(120)')
            assert not errors,errors
            # Restore a genuinely unlocked projectile through normal Continue.
            page.evaluate('__projectile.fixture({weapon:15,locked:false})');page.locator('#space').focus()
            page.keyboard.press('Space');page.evaluate('__projectile.step()')
            manual_saved=page.evaluate('''()=>{const e=__projectile.latest(),s=__projectile.state();const saved=nativeSaveStorage.write(s);if(!saved.ok)throw Error(saved.error);return {id:e.id,vx:e.vx,vy:e.vy,readyAt:nativeWeaponLoadout.equipped(s)[0].instance.readyAt};}''')
            page.evaluate('''()=>{resumeNativeGame('normal');__projectile.rebind();__projectile.step();nativeCivilianTraffic.select(99801);}''')
            manual_restored=page.evaluate('''id=>{const s=__projectile.state(),e=s.weaponCombat.events.find(e=>e.id===id);return {unguided:e.unguided,target:e.targetId,turn:e.turn,vx:e.vx,vy:e.vy,readyAt:nativeWeaponLoadout.equipped(s)[0].instance.readyAt};}''',manual_saved['id'])
            assert manual_restored['unguided'] and manual_restored['target'] is None and manual_restored['turn']==0,manual_restored
            assert all(manual_restored[k]==manual_saved[k] for k in ['vx','vy','readyAt']),manual_restored
            page.evaluate('__projectile.frames(180)')
            assert not errors,errors
            result={'passed':True,'cases':rows,'manual':manual,'heldManualShots':len(held),'manualGates':['pause','inventory','blur'],'beamRequiresLock':True,'reload':restored,'manualReload':manual_restored,'errors':errors}
            (OUT/'report.json').write_text(json.dumps(result,indent=2),encoding='utf8')
            print(json.dumps({'passed':True,'lockedCases':len(rows),'manualCases':len(manual),'heldManualShots':len(held),'manualGates':result['manualGates'],'reload':restored,'manualReload':manual_restored,'errors':errors}))
            browser.close()
    finally:server.shutdown();server.server_close()

if __name__=='__main__':main()
