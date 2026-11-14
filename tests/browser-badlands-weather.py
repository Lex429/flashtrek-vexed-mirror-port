"""Normal-game Badlands storms, shared tile coordinates and real vortex damage."""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/badlands-weather/browser'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serve', action='store_true')
args = parser.parse_args()
report = dict(passed=False, errors=[], failedRequests=[])


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = None
if args.serve:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 7790), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport=dict(width=1280, height=800), reduced_motion='no-preference')
        page.add_init_script("Object.defineProperty(navigator,'getGamepads',{value:()=>[]});")
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.on('response', lambda r: report['failedRequests'].append(r.url) if r.status >= 400 else None)
        page.goto('http://127.0.0.1:7790/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&nativeBadlandsWeather&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('''()=>{
          const material=nativeNebulaMaterial;window.__weatherMaterial=material;window.nativeNebulaMaterial=Object.create(material,{renderPair:{value:function(...args){if(args[4]?.vortices?.some(v=>v.id.startsWith('badlands-vortex:')))window.__weatherDraw=args;return material.renderPair(...args);}}});
          const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__weatherState=s;return restore(s);};startNativeDevGame();
        }''')
        page.wait_for_function('()=>nativeDevFog.material()?.field.ready', timeout=120000)
        report['fixture'] = page.evaluate('''()=>{
          const gate=nativeSimulation;window.nativeSimulation={...gate,blocked:()=>true};nativeSimulationHost.checkpoint();
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));nativeShipMotion.stop(s);Object.assign(s,{devMode:false,system:73,localBody:0,localBodySystem:73,localNavTarget:0,manualTargetSystem:0,localCruise:null,arrivalApproach:null,phase:'flight',landed:false});
          const list=nativeBadlandsWeather.vortices(s,{minX:-800,minY:-800,maxX:800,maxY:800}),v=list.slice().sort((a,b)=>Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y))[0];
          Object.assign(s,{x:v.x+v.radius*2.6,y:v.y,angle:Math.PI,speed:0,vx:0,vy:0});
          const size=nativeView.measure(document.querySelector('#space')),view={w:size.w,h:size.h,cameraX:s.x,cameraY:s.y,zoom:1};let target;
          for(let t=nativeSimulation.seconds(s)+8;t<nativeSimulation.seconds(s)+240;t+=.05){const flashes=nativeBadlandsWeather.lightning(s,view,t),heat=nativeBadlandsWeather.heat(s,view,t);if(flashes.some(e=>e.kind==='branch'&&nativeDevNebulaStorm.envelope(t-e.born).glow>.8)&&heat.some(e=>nativeNebulaFire.envelope(t-e.born,e.duration,e.phase)>.5)){target=t;break;}}
          if(!target)throw Error('No deterministic local storm window');s.shipSimulation.seconds=target-5;s.shipSimulation.schedule.pendingSeconds=0;
          window.__weatherVortex=v;window.__weatherTarget=target;
          const saved=nativeSaveStorage.write(s);if(!saved.ok)throw Error(saved.error);resumeNativeGame('normal');window.nativeSimulation=gate;nativeSimulationHost.checkpoint();
          return {target,vortex:v,normal:__weatherState.devMode===false,population:__weatherState.civilianTraffic.ships.length+__weatherState.solEconomy.freighters.length+1};
        }''')
        assert report['fixture']['normal'] and report['fixture']['population'] == 1210
        page.locator('#space').focus()
        page.keyboard.down('x')
        page.wait_for_function('()=>nativeGalaxyFog.materials().some(m=>m.field.ready)&&window.__weatherDraw', timeout=120000)
        page.wait_for_function('()=>{const g=nativeGalaxyFog.snapshot();return g.storm.flashes.some(e=>e.kind==="branch"&&e.glow>.6)&&g.fire.fronts.some(e=>e.intensity>.4);}', timeout=45000)
        page.screenshot(path=str(OUT / 'normal-game-branch-and-heat.png'))
        report['weather'] = page.evaluate('''()=>{const g=nativeGalaxyFog.snapshot();return {normal:!__weatherState.devMode,storm:g.storm,fire:g.fire,drawVortices:__weatherDraw[4].vortices.map(v=>({id:v.id,radius:v.radius})),cores:g.cores.length};}''')
        assert report['weather']['normal'] and report['weather']['drawVortices']
        assert all(64 <= v['radius'] <= 98 for v in report['weather']['drawVortices'])
        page.wait_for_function('()=>nativeGalaxyFog.snapshot().storm.flashes.some(e=>e.kind==="sheet"&&e.glow>.6)', timeout=45000)
        page.screenshot(path=str(OUT / 'normal-game-sheet-lightning.png'))
        report['tiles'] = page.evaluate('''()=>{
          const s=__weatherState,g=nativeGalaxyFog.snapshot(),worldHeat=g.fire.fronts,worldSheets=g.storm.flashes.filter(e=>e.sheet).map(e=>e.sheet);let vortexMatches=0,heatMatches=0,sheetMatches=0;
          for(const m of nativeGalaxyFog.materials()){
            const origin=nativeGalaxyFog.snapshot().cores.find(c=>c.id===m.id).origin;
            for(const v of m.vortices){const world=nativeBadlandsWeather.vortices(s,{minX:origin.x+m.field.minX,minY:origin.y+m.field.minY,maxX:origin.x+m.field.minX+m.field.width,maxY:origin.y+m.field.minY+m.field.height}).find(e=>e.id===v.id);if(!world||Math.hypot(world.x-v.x-origin.x,world.y-v.y-origin.y)>1e-7)throw Error('Vortex tile coordinate mismatch');vortexMatches++;}
            for(const e of m.heat?.fronts||[]){const w=worldHeat.find(f=>f.id===e.id);if(!w||Math.hypot(w.x-e.x-origin.x,w.y-e.y-origin.y)>1e-6)throw Error('Heat tile coordinate mismatch');heatMatches++;}
            for(const e of m.sheets||[]){if(!worldSheets.some(w=>Math.hypot(w.x-e.x-origin.x,w.y-e.y-origin.y)<1e-6))throw Error('Sheet tile coordinate mismatch');sheetMatches++;}
          }return {vortexMatches,heatMatches,sheetMatches};
        }''')
        assert report['tiles']['vortexMatches'] > 0 and report['tiles']['sheetMatches'] > 0
        report['pixels'] = page.evaluate('''()=>{
          const before=JSON.stringify(__weatherState),view=nativeGalaxyFog.snapshot().view,materials=nativeGalaxyFog.materials(),m=materials.find(e=>e.mask&&e.pose),origin=nativeGalaxyFog.snapshot().cores.find(c=>c.id===m.id).origin;
          const out=Object.assign(document.createElement('canvas'),{width:Math.ceil(view.w),height:Math.ceil(view.h)}),g=out.getContext('2d',{willReadFrequently:true});nativeGalaxyFog.paint(g,'back');nativeGalaxyFog.paint(g,'front');const rgba=g.getImageData(0,0,out.width,out.height).data,p=m.pose,mask=m.mask;
          // Probe actual opaque screen pixels. Metadata-space margins can map
          // back onto antialiased edges of the small default runabout sprite.
          const stencil=Object.assign(document.createElement('canvas'),{width:out.width,height:out.height}),sg=stencil.getContext('2d',{willReadFrequently:true}),z=view.zoom||1;
          sg.translate(view.w/2+(origin.x+p.x-view.cameraX)*z,view.h/2+(origin.y+p.y-view.cameraY)*z);sg.rotate(p.heading+Math.PI/2);sg.drawImage(mask.art,-p.width*z/2,-p.height*z/2,p.width*z,p.height*z);const alpha=sg.getImageData(0,0,out.width,out.height).data;let samples=0,leaks=0;
          for(let y=2;y<out.height-2;y++)for(let x=2;x<out.width-2;x++){const i=(y*out.width+x)*4;if([i,i-4,i+4,i-out.width*4,i+out.width*4].some(j=>alpha[j+3]<250))continue;samples++;if(rgba[i+3]>2)leaks++;}
          if(samples<5||leaks)throw Error('Production weather covered the ship '+JSON.stringify({samples,leaks}));if(JSON.stringify(__weatherState)!==before)throw Error('Weather painting changed gameplay');return {samples,leaks,drawReadOnly:true};
        }''')
        page.keyboard.up('x')
        page.keyboard.press('Escape')
        page.wait_for_function('()=>nativePause.active')
        frozen = page.evaluate('JSON.stringify({x:__weatherState.x,y:__weatherState.y,t:nativeSimulation.seconds(__weatherState),storm:nativeGalaxyFog.snapshot().storm.flashes,heat:nativeGalaxyFog.snapshot().fire.fronts})')
        page.wait_for_timeout(150)
        assert page.evaluate('JSON.stringify({x:__weatherState.x,y:__weatherState.y,t:nativeSimulation.seconds(__weatherState),storm:nativeGalaxyFog.snapshot().storm.flashes,heat:nativeGalaxyFog.snapshot().fire.fronts})') == frozen
        page.evaluate('''()=>{const s=__weatherState,v=__weatherVortex;nativeShipMotion.stop(s);nativeShipSystems.applyContact(s,nativeShipDefinitions.describe(s,s,{category:'player'}),{x:v.x+v.radius*.55,y:v.y,heading:0,vx:0,vy:0});window.__weatherShield=s.shields;window.__weatherSources=[];const hit=nativeCombatShots.onPlayerHit;nativeCombatShots.onPlayerHit=function(state,amount,impact){if(state===__weatherState)__weatherSources.push(impact.sourceId);return hit(state,amount,impact);};}''')
        page.keyboard.press('Escape')
        page.wait_for_function('()=>__weatherState.motionFlow&&__weatherState.speed>15&&__weatherState.shields<__weatherShield-.01&&Math.abs(__weatherState.motionSpin?.velocity||0)>.05', timeout=15000)
        page.screenshot(path=str(OUT / 'normal-game-vortex-encounter.png'))
        page.keyboard.press('Escape')
        page.wait_for_function('()=>nativePause.active')
        report['encounter'] = page.evaluate('''()=>({speed:__weatherState.speed,flow:__weatherState.motionFlow,spin:__weatherState.motionSpin,shields:__weatherState.shields,beforeShields:__weatherShield,sources:__weatherSources})''')
        assert report['encounter']['sources'] and all(str(s).startswith('badlands-vortex:') for s in report['encounter']['sources'])
        report['save'] = page.evaluate('''()=>{
          const s=__weatherState,before={x:s.x,y:s.y,flow:JSON.stringify(s.motionFlow),seconds:nativeSimulation.seconds(s),latinum:s.latinum,ids:JSON.stringify(s.civilianTraffic.ships.map(e=>e.id))};const stored=nativeSaveStorage.write(s);if(!stored.ok)throw Error(stored.error);resumeNativeGame('normal');const next=__weatherState;if(next.devMode||next.x!==before.x||next.y!==before.y||JSON.stringify(next.motionFlow)!==before.flow||nativeSimulation.seconds(next)!==before.seconds||next.latinum!==before.latinum||JSON.stringify(next.civilianTraffic.ships.map(e=>e.id))!==before.ids)throw Error('Normal Continue changed weather momentum, time or saved contents');return {normal:true,momentum:true,clock:true,population:next.civilianTraffic.ships.length+next.solEconomy.freighters.length+1};
        }''')
        page.keyboard.press('Escape')
        page.wait_for_function('()=>nativePause.active')
        page.evaluate('''()=>{const s=__weatherState;nativeGalaxyFog.dispose();nativeShipMotion.stop(s);nativeShipSystems.applyContact(s,nativeShipDefinitions.describe(s,s,{category:'player'}),{x:30000,y:18000,heading:0,vx:0,vy:0});nativeManualFlight.initializeRegion(s);}''')
        page.keyboard.press('Escape')
        page.locator('#space').focus()
        page.keyboard.down('x')
        page.wait_for_function('()=>nativeGalaxyFog.snapshot().cores.some(c=>c.visible&&c.origin.x>25000)&&nativeGalaxyFog.materials().some(m=>m.field.ready&&m.vortices.length)', timeout=120000)
        page.screenshot(path=str(OUT / 'distant-section.png'))
        report['distant'] = page.evaluate('''()=>{const g=nativeGalaxyFog.snapshot();return {normal:!__weatherState.devMode,x:__weatherState.x,y:__weatherState.y,clock:g.storm.clock,vortices:g.cores.filter(c=>c.visible).flatMap(c=>c.vortices.map(v=>({id:v.id,radius:v.radius}))),cache:nativeBadlandsWeather.metrics()};}''')
        page.keyboard.up('x')
        assert report['distant']['normal'] and report['distant']['vortices']
        assert not set(v['id'] for v in report['weather']['drawVortices']) & set(v['id'] for v in report['distant']['vortices'])
        assert not report['errors'] and not report['failedRequests'], report
        report.update(passed=True,normalGameplay=True,pauseFrozen=True,realVortexPullSpinDamage=True,sharedWorldEvents=True)
        browser.close()
finally:
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    if server:
        server.shutdown()
        server.server_close()
print(json.dumps(report))
