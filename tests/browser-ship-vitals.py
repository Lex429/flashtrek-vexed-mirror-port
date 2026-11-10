"""Defense console: resolved weapon hits, shared damage, accurate capacity and UI gates."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/ship-vitals';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850});page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
        page.evaluate('''()=>{
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=window.__vitalsState=nativeNpcDev.getState();
          Object.assign(s,{system:2,shipType:7,x:4e6,y:4e6,angle:0,speed:0,vx:0,vy:0,hull:50,shields:50,phase:'flight',landed:false,localCruise:null,arrivalApproach:null});
          const eq=nativeShipEquipment.ensure(s);for(const kind of ['shield','engineering'])eq.instances[eq.slots[kind][0]].condition=100;
          nativeShipSystems.invalidate(s);nativeShipVitals.update(s,{dt:0});
        }''')
        panel=page.locator('#ship-vitals');assert panel.is_visible()
        assert panel.locator('[role="meter"]').count()==2 and panel.locator('.vitals-schematic,.vitals-grid').count()==0
        assert all(not text.strip() for text in panel.locator('.vitals-track').all_inner_texts())
        shield_blue=page.locator('[data-vital="shield"]').evaluate('(n)=>getComputedStyle(n).getPropertyValue("--meter-color").trim()')
        assert shield_blue=='#50d5ff'
        initial=page.evaluate('nativeShipVitals.snapshot()');assert initial['values']['hull']['ratio']==initial['values']['shield']['ratio']==1
        readonly=page.evaluate('''()=>{const s=__vitalsState,before=JSON.stringify(s);for(let i=0;i<100;i++)nativeShipVitals.update(s,{dt:.01});return before===JSON.stringify(s);}''');assert readonly
        page.screenshot(path=str(OUT/'healthy.png'))
        weapon=page.evaluate('''()=>{
          const s=__vitalsState,enemy=s.civilianTraffic.ships[0],api=nativeSimulation;
          Object.assign(enemy,{shipType:7,system:2,x:s.x+180,y:s.y,heading:Math.PI,speed:0,vx:0,vy:0,hull:50,shields:50,phase:'cruise'});
          for(const k of ['journey','localLeg','motionSpin','motionKick'])delete enemy[k];
          const eq=nativeShipEquipment.ensure(s,enemy),beam=VexedMirrorWeapons.find(m=>m.damage>0&&nativeCombatShots.weaponVisual(m).kind==='beam');
          const grant=nativeShipEquipment.grant(s,beam.id,{holder:enemy});if(!grant.ok)throw Error(grant.error);
          const fit=nativeShipEquipment.move(s,{holder:enemy,category:'weapon',fromType:'locker',fromIndex:eq.locker.indexOf(grant.instance.id),toType:'slot',toIndex:0});if(!fit.ok)throw Error(fit.error);
          nativeShipSystems.invalidate(s);window.nativeSimulation={...api,blocked:()=>false};
          try{
            const source=()=>nativeShipDefinitions.describe(s,enemy,{category:'civilian'}),target=()=>nativeShipDefinitions.describe(s);
            const fired=nativeCombatShots.fireFor({state:s,shooter:source(),getSource:source,target:target(),getTarget:target,owner:'vitals-test'});
            if(!fired.ok)throw Error('Weapon fixture failed: '+JSON.stringify(fired));
            for(let i=0;i<120&&s.shields===50;i++){nativeSimulation.advance(s,1/60);nativeCombatShots.advance(s,1/60);}
            nativeShipVitals.update(s,{dt:.01});return {hud:nativeShipVitals.snapshot(),actual:s.shields,event:fired.event.id};
          }finally{window.nativeSimulation=api;nativeSimulationHost.checkpoint();}
        }''')
        assert weapon['actual']<50 and weapon['hud']['shieldHits']==1 and weapon['hud']['hullHits']==0,weapon
        assert weapon['hud']['values']['shield']['value']==weapon['actual'] and weapon['hud']['values']['shield']['maximum']==50
        assert weapon['hud']['values']['shieldCondition']<100 and weapon['hud']['animations']>0,weapon
        assert page.locator('[data-vital="shield"] .vitals-hit-ripple').evaluate('(n)=>n.getAnimations().some(a=>a.id.startsWith("vitals:"))')
        assert page.locator('[data-vital="shield"] .vitals-hit-arcs').evaluate('(n)=>n.getAnimations().some(a=>a.id.startsWith("vitals:"))')
        # Capture a reproducible peak of the real resolved hit's visual effects.
        panel.evaluate('''n=>{window.__vitalsCapture=n.getAnimations({subtree:true}).filter(a=>a.id.startsWith('vitals:'));for(const a of __vitalsCapture){a.pause();a.currentTime=a.effect.getTiming().duration*.08;}}''')
        panel.screenshot(path=str(OUT/'shield-hit-peak.png'))
        page.evaluate('()=>{for(const a of __vitalsCapture)a.play();delete window.__vitalsCapture;}')
        page.screenshot(path=str(OUT/'shield-hit.png'))
        panel.screenshot(path=str(OUT/'shield-hit-detail.png'))
        strength=page.evaluate('''()=>{
          const s=__vitalsState,eq=s.shipEquipment,device=eq.instances[eq.slots.shield[0]],peaks=[];
          for(const damage of [1,12]){
            device.condition=100;s.shields=40;nativeShipVitals.update(s,{dt:0});nativePlayerCombat.hit(s,damage,{kind:'beam'});nativeShipVitals.update(s,{dt:0});
            const animation=document.querySelector('[data-vital="shield"] .vitals-hit-flash').getAnimations()[0];
            peaks.push(Math.max(...animation.effect.getKeyframes().map(f=>Number(f.opacity))));
          }
          return {small:peaks[0],large:peaks[1]};
        }''');assert strength['large']>strength['small'],strength
        overflow=page.evaluate('''()=>{
          const s=__vitalsState;s.shields=2;nativeShipVitals.update(s,{dt:0});
          const before=nativeShipVitals.snapshot();nativePlayerCombat.hit(s,8,{kind:'beam',from:{x:s.x-150,y:s.y}});nativeShipVitals.update(s,{dt:.01});
          return {before,after:nativeShipVitals.snapshot(),actual:{hull:s.hull,shields:s.shields}};
        }''')
        assert overflow['after']['shieldHits']==overflow['before']['shieldHits']+1 and overflow['after']['hullHits']==1,overflow
        assert overflow['after']['values']['hull']['value']==overflow['actual']['hull']==44 and overflow['actual']['shields']==0,overflow
        assert overflow['after']['lastImpact']['shield']==2 and overflow['after']['lastImpact']['hull']==6
        assert page.locator('[data-vital="shield"] .vitals-hit-flash').evaluate('(n)=>n.getAnimations()[0].effect.getTiming().duration')>=1000
        page.screenshot(path=str(OUT/'hull-breach.png'))
        isolation=page.evaluate('''()=>{
          const s=__vitalsState,before=nativeShipVitals.snapshot(),other=s.civilianTraffic.ships[0];
          nativePlayerCombat.hit(s,0);nativeShipDamage.apply(nativeShipDefinitions.describe(s,other,{category:'civilian'}),1);
          nativeShipVitals.update(s,{dt:0});const after=nativeShipVitals.snapshot();return before.shieldHits===after.shieldHits&&before.hullHits===after.hullHits;
        }''');assert isolation
        page.locator('#pauseBtn').click();page.wait_for_function('()=>nativeShipVitals.snapshot().paused')
        paused_times=page.locator('#ship-vitals').evaluate('(n)=>n.getAnimations({subtree:true}).map(a=>a.currentTime)');page.wait_for_timeout(150)
        assert paused_times==page.locator('#ship-vitals').evaluate('(n)=>n.getAnimations({subtree:true}).map(a=>a.currentTime)')
        page.locator('#pause-menu [data-resume]').click();page.wait_for_function('()=>!nativeShipVitals.snapshot().paused')
        equipment=page.evaluate('''()=>{
          const s=__vitalsState,eq=s.shipEquipment,item=eq.instances[eq.slots.shield[0]],hits=nativeShipVitals.snapshot().shieldHits;
          item.modelId='advanced-shield';nativeShipVitals.update(s,{dt:0});const upgraded=nativeShipVitals.snapshot();
          s.minerals.trellium=30;const repair=nativeShipRepairs.repairDevice(s,item.id);if(!repair.ok)throw Error(repair.error);
          nativeShipVitals.update(s,{dt:.01});const repaired=nativeShipVitals.snapshot(),recoveryBlue=getComputedStyle(document.querySelector('[data-vital="shield"]')).getPropertyValue('--recovery-color').trim();
          const id=eq.slots.shield[0],index=eq.locker.length;
          const removed=nativeShipEquipment.move(s,{category:'shield',fromType:'slot',fromIndex:0,toType:'locker',toIndex:index});if(!removed.ok)throw Error(removed.error);
          nativeShipVitals.update(s,{dt:0});const absent=nativeShipVitals.snapshot();
          const fitted=nativeShipEquipment.move(s,{category:'shield',fromType:'locker',fromIndex:eq.locker.indexOf(id),toType:'slot',toIndex:0});if(!fitted.ok)throw Error(fitted.error);
          nativeShipVitals.update(s,{dt:0});return {upgraded,repaired,absent,hits,recoveryBlue};
        }''')
        assert equipment['upgraded']['values']['shield']['maximum']==60
        assert equipment['repaired']['values']['shieldCondition']==100 and equipment['repaired']['values']['shield']['value']==60,equipment
        assert equipment['absent']['values']['shield']['maximum']==0 and equipment['absent']['values']['shield']['label']=='NOT FITTED'
        assert equipment['repaired']['shieldHits']==equipment['hits']==equipment['absent']['shieldHits']
        assert equipment['recoveryBlue']==shield_blue
        critical=page.evaluate('''()=>{const s=__vitalsState;s.shields=0;nativePlayerCombat.hit(s,100,{kind:'collision',nonlethal:true,physicalContact:true,from:{x:s.x,y:s.y-200}});nativeShipVitals.update(s,{dt:.01});return {ui:nativeShipVitals.snapshot(),phase:s.phase};}''')
        assert critical['phase']=='disabled' and critical['ui']['values']['hull']['ratio']==.25,critical
        assert panel.get_attribute('data-critical')=='true' and 'DISABLED' in page.locator('[data-vital="hull"] .vitals-readout').inner_text()
        assert page.locator('[data-vital="shield"]').evaluate('(n)=>getComputedStyle(n).getPropertyValue("--meter-color").trim()')==shield_blue
        page.screenshot(path=str(OUT/'critical.png'))
        burst=page.evaluate('''()=>{const s=__vitalsState;s.phase='flight';s.hull=50;s.shields=40;nativeShipVitals.update(s,{dt:0});for(let i=0;i<40;i++)nativePlayerCombat.hit(s,.1,{kind:'beam'});nativeShipVitals.update(s,{dt:.01});return nativeShipVitals.snapshot();}''')
        assert burst['animations']<=9,burst
        for width,height in [(1280,850),(620,740),(390,844),(360,740)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
            bounds=panel.bounding_box();toolbar=page.locator('body > footer').bounding_box();radar=page.locator('#native-radar').bounding_box()
            assert bounds and toolbar and bounds['x']>=0 and bounds['y']>=0 and bounds['y']+bounds['height']<=toolbar['y'],(width,bounds,toolbar)
            if radar and page.locator('#native-radar').is_visible():assert bounds['x']+bounds['width']<=radar['x'] or bounds['y']+bounds['height']<=radar['y'],(width,bounds,radar)
            page.screenshot(path=str(OUT/f'defenses-{width}.png'))
        page.emulate_media(reduced_motion='reduce');page.evaluate('()=>{nativePlayerCombat.hit(__vitalsState,.1);nativeShipVitals.update(__vitalsState,{dt:.01});}')
        assert panel.evaluate('(n)=>n.getAnimations({subtree:true}).length')==0
        page.locator('#inventoryBtn').click();page.wait_for_function('()=>nativeShipVitals.snapshot().hidden')
        page.locator('.inventory-close').click();page.wait_for_function('()=>!nativeShipVitals.snapshot().hidden')
        saved=page.evaluate('''()=>{const s=__vitalsState;nativeShipVitals.update(s,{dt:0});if(!nativeSaveStorage.write(s).ok)throw Error('Save failed');return {hull:s.hull,shields:s.shields,maximum:nativeShipVitals.snapshot().values.shield.maximum};}''')
        page.reload();page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.locator('[data-menu="continue-dev"]').click();page.wait_for_function('()=>!nativeShipVitals.snapshot().hidden&&nativeNpcDev.getState()')
        restored=page.evaluate('nativeShipVitals.snapshot()');assert restored['shieldHits']==restored['hullHits']==0
        assert restored['values']['hull']['value']==saved['hull'] and restored['values']['shield']['maximum']==saved['maximum']
        assert not errors,errors
        report={'passed':True,'resolvedWeaponImpact':weapon,'shieldOverflow':overflow,'readOnly':readonly,'npcAndZeroHitsIgnored':isolation,'pauseFreezesEffects':True,'equipmentAndRepairAccurate':True,'criticalDisabledState':True,'shieldBlue':shield_blue,'impactStrength':strength,'noCenterNumbers':True,'boundedBurstAnimations':burst['animations'],'mobileAndRadarClearance':True,'reducedMotion':True,'quietReload':True,'errors':errors}
        (OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));browser.close()
finally:server.shutdown();server.server_close()
