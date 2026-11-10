"""Retained top-right HUD: actual purchases/trades, weapon deadlines and UI gates."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/hud-feedback';OUT.mkdir(parents=True,exist_ok=True)
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
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          Object.assign(s,{devMode:false,system:1,localBody:3,shipType:7,x:0,y:0,angle:0,speed:0,vx:0,vy:0,hull:50,shields:50,phase:'flight',landed:false,latinum:5000,deuranium:12,antimatter:80,dilithium:25,food:40,minerals:{},solFreightHold:{},localContracts:[],localCruise:null,arrivalApproach:null});
          delete s.shipyardDock;const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(state){window.__hudState=state;return restore(state);};
          if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');resumeNativeGame('normal');
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
        }''')
        page.wait_for_function('()=>vexedHud.snapshot().visible&&vexedHud.snapshot().resources.find(r=>r.key==="latinum").text==="5000"')
        page.evaluate('()=>vexedHud.ready');page.wait_for_timeout(100)
        layer=page.locator('#hud-feedback');assert layer.is_visible()
        initial=page.evaluate('vexedHud.snapshot()');assert sum(initial['reactions'].values())==0
        retained=page.evaluate('''()=>{const s=__hudState,before=JSON.stringify(s),renders=vexedHud.snapshot().renderCount;for(let i=0;i<100;i++)vexedHud.frame(s,{dt:0});return {readOnly:before===JSON.stringify(s),draws:vexedHud.snapshot().renderCount-renders};}''')
        assert retained=={'readOnly':True,'draws':0},retained
        page.screenshot(path=str(OUT/'normal.png'))
        purchase=page.evaluate('''()=>{const s=__hudState,before=s.latinum,r=nativeShipEquipment.purchase(s,'standard-engine');if(!r.ok)throw Error(r.error);vexedHud.update(s);return {spent:before-s.latinum,hud:vexedHud.snapshot(),actual:s.latinum};}''')
        assert purchase['spent']==500 and purchase['hud']['reactions']['spent']==1
        assert next(r for r in purchase['hud']['resources'] if r['key']=='latinum')['text']==str(purchase['actual'])
        assert layer.locator('[data-kind="resource"][data-index="2"] [class="hud-cell-halo"]').evaluate('(n)=>n.getAnimations().length')>0
        trade=page.evaluate('''()=>{const s=__hudState,m=nativeNpcLives.market(s,1,3),good=m.stock.findIndex((n,i)=>n-(m.reserved?.[i]||0)>=10);if(good<0)throw Error('No stock for trade fixture');
          const bought=nativeSolEconomy.buySell(s,3,good,true,10);if(!bought.ok)throw Error(bought.error);vexedHud.update(s);
          const sold=nativeSolEconomy.buySell(s,3,good,false,10);if(!sold.ok)throw Error(sold.error);vexedHud.update(s);
          return {bought:bought.total,sold:sold.total,actual:s.latinum,hud:vexedHud.snapshot()};}''')
        assert trade['hud']['reactions']['gain']==1 and trade['hud']['reactions']['spent']==2,trade
        assert next(r for r in trade['hud']['resources'] if r['key']=='latinum')['text']==str(trade['actual'])
        page.screenshot(path=str(OUT/'resource-gain.png'))
        warnings=page.evaluate('''()=>{const s=__hudState,held=[s.deuranium,s.antimatter,s.latinum];Object.assign(s,{deuranium:4,antimatter:5,latinum:20});vexedHud.frame(s,{dt:0});const low=vexedHud.snapshot().resources.map(r=>r.warning);
          s.devMode=true;vexedHud.frame(s,{dt:0});const unlimited=vexedHud.snapshot().resources.map(r=>({text:r.text,warning:r.warning}));
          s.devMode=false;[s.deuranium,s.antimatter,s.latinum]=held;vexedHud.frame(s,{dt:0});return {low,unlimited};}''')
        assert all(warnings['low']) and all(r=={'text':'∞','warning':False} for r in warnings['unlimited']),warnings
        enemy=page.evaluate('''()=>{const s=__hudState,e=s.civilianTraffic.ships[0];Object.assign(s,{system:2,localBody:0,x:4e6,y:4e6});Object.assign(e,{system:2,shipType:7,x:s.x+180,y:s.y,heading:Math.PI,speed:0,vx:0,vy:0,hull:50,shields:50,phase:'cruise'});
          for(const k of ['journey','localLeg','motionSpin','motionKick'])delete e[k];nativeNpcLives.invalidateMembership(s);nativeShipSystems.invalidate(s);vexedHud.frame(s,{dt:0});return e.id;}''')
        def fire():
            return page.evaluate('''id=>{const s=__hudState,e=s.civilianTraffic.ships.find(e=>e.id===id),api=nativeSimulation;window.nativeSimulation={...api,blocked:()=>false};
              try{const target=()=>nativeShipDefinitions.describe(s,e,{category:'civilian'}),r=nativeCombatShots.fireFor({state:s,target:target(),getTarget:target,owner:'player'});vexedHud.frame(s,{dt:0});return {ok:r.ok,reason:r.reason,hud:vexedHud.snapshot()};}
              finally{window.nativeSimulation=api;nativeSimulationHost.checkpoint();}}''',enemy)
        def advance(seconds):
            return page.evaluate('''seconds=>{const s=__hudState,api=nativeSimulation;window.nativeSimulation={...api,blocked:()=>false};
              try{for(let left=seconds;left>1e-8;){const dt=Math.min(left,1/60);nativeSimulation.advance(s,dt);nativeCombatShots.advance(s,dt);left-=dt;}vexedHud.frame(s,{dt:seconds});return vexedHud.snapshot();}
              finally{window.nativeSimulation=api;nativeSimulationHost.checkpoint();}}''',seconds)
        shot=fire();assert shot['ok'] and shot['hud']['reactions']['fire']==1,shot
        charged=next(w for w in shot['hud']['weapons'] if w['remaining']>0)
        assert charged['fraction']<.01 and not charged['ready']
        rejected=fire();assert not rejected['ok'] and rejected['hud']['reactions']['fire']==1,rejected
        midway=advance(charged['recharge']/2);fraction=midway['weapons'][charged['slot']]['fraction'];assert .49<fraction<.51,fraction
        page.screenshot(path=str(OUT/'weapon-recharge.png'))
        page.locator('#pauseBtn').click();page.wait_for_function('()=>vexedHud.snapshot().paused')
        times=layer.evaluate('(n)=>n.getAnimations({subtree:true}).map(a=>a.currentTime)');page.wait_for_timeout(150)
        assert times==layer.evaluate('(n)=>n.getAnimations({subtree:true}).map(a=>a.currentTime)')
        page.locator('#pause-menu [data-resume]').click();page.wait_for_function('()=>!vexedHud.snapshot().paused')
        page.evaluate('()=>{if(!nativeSaveStorage.write(__hudState).ok)throw Error("Save failed");}')
        page.reload();page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate('()=>{const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__hudState=s;return restore(s);};}')
        page.locator('[data-menu="continue"]').click();page.wait_for_function('()=>window.__hudState&&vexedHud.snapshot().visible')
        page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}')
        restored=page.evaluate('vexedHud.snapshot()');assert sum(restored['reactions'].values())==0 and 0<restored['weapons'][charged['slot']]['fraction']<1,restored
        completed=advance(restored['weapons'][charged['slot']]['remaining']+.01);assert completed['weapons'][charged['slot']]['ready'] and completed['reactions']['ready']==1,completed
        multi=page.evaluate('''()=>{const s=__hudState;s.shipRefit={version:1,hullType:s.shipType,levels:{weapon:2}};nativeShipEquipment.ensure(s);nativeWeaponLoadout.refit(s,[1,1,1,1,1]);vexedHud.update(s);return {slots:s.shipEquipment.slots.weapon.length,hud:vexedHud.snapshot()};}''')
        assert multi['slots']==len(multi['hud']['weapons'])==5 and multi['hud']['reactions']['fire']==0,multi
        resource=layer.locator('[data-kind="resource"][data-index="2"]');bounds=resource.bounding_box();page.mouse.move(bounds['x']+bounds['width']/2,bounds['y']+bounds['height']/2)
        assert resource.get_attribute('data-hover')=='true'
        assert layer.evaluate('(n)=>getComputedStyle(n).pointerEvents')=='none'
        page.evaluate('dispatchEvent(new CustomEvent("native-displaychange"))')
        assert resource.get_attribute('data-hover')=='false'
        page.mouse.move(640,400)
        responsive=[]
        for width,height in [(1920,1080),(1280,850),(620,740),(390,844),(360,740)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
            boxes=page.evaluate('''()=>{const a=document.querySelector('#game-hud').getBoundingClientRect(),b=document.querySelector('#hud-feedback').getBoundingClientRect(),g=document.querySelector('#game').getBoundingClientRect();return {canvas:{x:a.x,y:a.y,w:a.width,h:a.height},overlay:{x:b.x,y:b.y,w:b.width,h:b.height},inside:b.right<=g.right+.1&&b.top>=g.top};}''')
            assert boxes['inside'] and all(abs(boxes['canvas'][k]-boxes['overlay'][k])<.1 for k in ['x','y','w','h']),boxes
            responsive.append({'width':width,**boxes});page.screenshot(path=str(OUT/f'hud-{width}.png'))
        page.emulate_media(reduced_motion='reduce');advance(2);fire()
        assert layer.evaluate('(n)=>n.getAnimations({subtree:true}).length')==0 and page.evaluate('vexedHud.snapshot().animations')==0
        page.locator('#inventoryBtn').click();page.wait_for_function('()=>!vexedHud.snapshot().visible')
        page.locator('.inventory-close').click();page.wait_for_function('()=>vexedHud.snapshot().visible')
        assert not errors,errors
        report={'passed':True,'retainedCanvas':retained,'actualPurchase':purchase['spent'],'actualTrade':{'bought':trade['bought'],'sold':trade['sold']},'resourceReactions':trade['hud']['reactions'],'lowAndUnlimitedWarnings':warnings,'actualFiringAndRejectedShot':True,'midRechargeFraction':fraction,'pauseFreezesEffects':True,'quietContinue':True,'readyFeedback':True,'fiveOwnedWeaponBays':True,'nonblockingHover':True,'responsive':responsive,'reducedMotion':True,'inventoryVisibility':True,'errors':errors}
        (OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));browser.close()
finally:server.shutdown();server.server_close()
