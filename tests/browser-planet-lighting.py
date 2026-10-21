"""Active-game eclipse traversal, unchanged art comparisons and fixed-camera optics.

Use --revision HEAD --baseline --label before to capture the original behavior.
Generated screenshots and reports stay under ignored test-results/planet-lighting.
"""
import argparse
import functools
import http.server
import importlib.util
import json
import math
import os
from pathlib import Path
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results/planet-lighting'
spec = importlib.util.spec_from_file_location('lighting_server', ROOT / 'tests/browser-npc-performance.py')
perf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(perf)

INSTALL = r"""async saved => {
 if(saved){nativeSaveStorage.write(JSON.parse(saved));resumeNativeGame();}else startNativeDevGame();
 window.__originalBlocked=nativeSimulation.blocked;
 window.nativeSimulation={...nativeSimulation,blocked:()=>true};
 await Promise.all([0,1,3,4].map(id=>vexedFlightAssets.loadLocalBody(id)));
 const render=vexedSpace.render;
 window.__eclipseFrames=[];
 vexedSpace.render=function(ctx,view,objects){
   const result=render.call(this,ctx,view,objects);
   window.__lightingFrame={view:{...view},objects};
   if(window.__recordEclipse){
     const s=nativeNpcDev.getState(),star=vexedSpace.state.stars.filter(s=>s.layer===5)[window.__sourceIndex],
       source={...star,x:star.x+(view.w-600)/2,y:star.y+(view.h-450)/2},body=objects[0];
     __eclipseFrames.push({x:s.x,y:s.y,angle:s.angle,source:{x:source.x,y:source.y},body,
       visibility:vexedSpace.sourceVisibility?.(source,objects),light:{...vexedSpace.light}});
   }
   return result;
 };
 window.__lightingRender=render;
 return {population:nativeNpcDev.getState().civilianTraffic.ships.length+nativeNpcDev.getState().solEconomy.freighters.length+1};
}"""

PLACE = r"""({id,offset}) => {
 const s=nativeNpcDev.getState(),body=vexedSolFlight.bodies.find(b=>b.id===id),size=vexedSolFlight.bodySize(body);
 nativeShipMotion.stop(s);Object.assign(s,{system:1,localBody:id,speed:0,landed:false,localCruise:null});delete s.arrivalApproach;
 vexedSpace.enterSystem(1,true);
 const stars=vexedSpace.state.stars.filter(star=>star.layer===5);
 window.__sourceIndex=stars.reduce((best,star,i)=>Math.hypot(star.x-300,star.y-225)<Math.hypot(stars[best].x-300,stars[best].y-225)?i:best,0);
 const star=stars[__sourceIndex],position=vexedSolFlight.bodyPosition(body);
 // Fixed measured artwork geometry also makes baseline screenshots comparable.
 const shapes={0:{rx:.289,ox:0,oy:0},1:{rx:.453,ox:0,oy:0},3:{rx:.483,ox:-.002,oy:-.011},4:{rx:.358,ox:0,oy:.003}},shape=shapes[id];
 const cameraX=position.x+size*(shape.ox+shape.rx)+offset-(star.x-300),cameraY=position.y+size*shape.oy-(star.y-225);
 s.x=cameraX-body.x;s.y=cameraY-body.y;s.angle=Math.atan2(star.y-225,star.x-300);
 nativeShipSystems.invalidate(s);
 return {id,name:body.name,size,sourceIndex:__sourceIndex,sourceRadius:star.radius*4,x:s.x,y:s.y};
}"""

OPTICS = r"""async () => {
 const check=(ok,message)=>{if(!ok)throw Error(message);},canvas=document.createElement('canvas');canvas.width=600;canvas.height=450;
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),render=__lightingRender,
   view={w:600,h:450,zoom:1,playerX:0,playerY:0,cameraX:0,cameraY:0,reducedMotion:true};
 vexedSpace.enterSystem(1,true);
 const draw=(v,objects=[])=>{render(ctx,v,objects);return ctx.getImageData(0,0,600,450).data;};
 const a=draw({...view,heading:0}),b=draw({...view,heading:Math.PI});
 check(a.every((value,i)=>value===b[i]),'Fixed-camera flare brightness follows ship heading');
 const light={...vexedSpace.light};
 for(let n=0;n<40;n++)vexedSpace.update(.1,{locx:30,locy:-12,speed:200});
 draw(view);check(JSON.stringify(vexedSpace.light)===JSON.stringify(light),'Decorative parallax changed the physical primary star');
 const disk=vexedSpace.bodyDisk({x:300,y:225,width:180,height:180},1,3);
 draw(view,[disk]);const pixels=ctx.getImageData(290,215,20,20).data;
 check(pixels.every((value,i)=>i%4===3||value===0),'Background source glow leaks through an opaque planet');
 // Exercise the real flare renderer with one isolated original source. Record
 // actual gradient alpha for glare, streaks and each existing optical reflection.
 vexedSpace.enterSystem(1,true);draw(view);
 const bright=vexedSpace.state.stars.filter(s=>s.layer===5);
 bright.forEach(s=>s.alpha=0);const star=bright[0],probeView={...view,playerX:(star.x-300)/.05,playerY:(star.y-225)/.05};Object.assign(star,{x:190,y:150,radius:1.5,alpha:100});
 const gradient=ctx.createRadialGradient.bind(ctx),linear=ctx.createLinearGradient.bind(ctx),alphas=[];let current;
 const intercept=(g,kind)=>{const add=g.addColorStop.bind(g);g.addColorStop=(at,color)=>{const match=color.match(/,([^,]+)\)$/);if(match)current[kind].push(Number(match[1]));return add(at,color);};return g;};
 ctx.createRadialGradient=(...args)=>intercept(gradient(...args),args[0]===190&&args[1]===150?'glare':'ghosts');
 ctx.createLinearGradient=(...args)=>intercept(linear(...args),'streaks');
 for(let delta=-8;delta<=8;delta+=.25){
   current={delta,glare:[],ghosts:[],streaks:[]};
   draw(probeView,[{x:190-90-delta,y:150,rx:90,ry:90}]);
   if(delta===-8){const covered=ctx.getImageData(188,148,4,4).data;check(covered.every((v,i)=>i%4===3||v===0),'Covered source pixels leak through the opaque disk');}
   for(const key of ['glare','ghosts','streaks'])current[key]=Math.max(0,...current[key]);
   alphas.push(current);
 }
 for(const key of ['glare','ghosts','streaks']){
   check(alphas[0][key]===0,'Fully covered '+key+' remains visible');
   check(alphas.at(-1)[key]>0,'Revealed '+key+' did not return');
   for(let i=1;i<alphas.length;i++)check(alphas[i][key]>=alphas[i-1][key]-1e-10,'Non-monotonic eclipse '+key);
   const middle=alphas.find(row=>row.delta===0)[key];check(middle>alphas.at(-1)[key]*.45&&middle<alphas.at(-1)[key]*.55,'No partial-source fade in '+key);
 }
 ctx.createRadialGradient=gradient;ctx.createLinearGradient=linear;
 vexedSpace.enterSystem(7,true);draw(view);const offscreen={...vexedSpace.light};
 draw({...view,w:900,h:650,heading:1.7,playerX:1e6,playerY:-1e6,zoom:2});
 check(JSON.stringify(vexedSpace.light)===JSON.stringify(offscreen),'Offscreen primary direction changed');
 const shipCanvas=document.createElement('canvas');shipCanvas.width=shipCanvas.height=320;
 const shipCtx=shipCanvas.getContext('2d',{willReadFrequently:true}),asset=await vexedFlightAssets.loadShip(7),width=110*asset.width/asset.height;
 const shipPixels=light=>{shipCtx.clearRect(0,0,320,320);vexedFlightAssets.drawShip(shipCtx,asset,160,160,width,.7,1000,{height:110,light});return shipCtx.getImageData(0,0,320,320).data;};
 const expected=shipPixels({x:160+200*Math.cos(offscreen.direction),y:160+200*Math.sin(offscreen.direction),color:offscreen.color}),actual=shipPixels(offscreen);
 check(expected.every((value,i)=>value===actual[i]),'Configured offscreen direction did not reach ship illumination');
 return {headingPixelsIdentical:true,opaqueDiskBlack:true,coveredSourcePixelsBlack:true,stablePrimary:true,directionalShipPixelsIdentical:true,offscreen,alphas};
}"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision')
    parser.add_argument('--label', default='after')
    parser.add_argument('--baseline', action='store_true')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    perf.SnapshotHandler.revision = args.revision
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(perf.SnapshotHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors, failed = [], []
    report = {'revision': args.revision or 'working tree', 'label': args.label}
    fixture = ROOT / 'test-results/performance-review/initial-save.json'
    try:
        with sync_playwright() as p:
            channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
            browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
            page = browser.new_page(viewport={'width': 1280, 'height': 850})
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('response', lambda r: failed.append(r.url) if r.status >= 400 else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
            report.update(page.evaluate(INSTALL, fixture.read_text(encoding='utf-8') if fixture.exists() else None))
            page.wait_for_function('()=>nativeCivilianTraffic.effectsReady() && !nativeShipEffects.metrics().pending', timeout=120000)
            report['bodies'] = []
            for body in [3, 1, 4, 0]:
                row = page.evaluate(PLACE, {'id': body, 'offset': 0})
                page.wait_for_timeout(150)
                page.screenshot(path=str(OUTPUT / f'{args.label}-{row["name"].lower()}.png'))
                report['bodies'].append(row)
            # Small deterministic camera steps across the same edge in both
            # directions, with ordinary active-game painting and unchanged sky.
            row = page.evaluate(PLACE, {'id': 3, 'offset': 0})
            page.evaluate('window.__recordEclipse=true')
            for direction in ['cover', 'reveal']:
                offsets = list(range(10, -11, -1)) if direction == 'cover' else list(range(-10, 11))
                for offset in offsets:
                    page.evaluate('({x,offset})=>{nativeNpcDev.getState().x=x+offset;}', {'x': row['x'], 'offset': offset})
                    page.wait_for_timeout(35)
                    if offset in [10, 0, -10]:
                        page.screenshot(path=str(OUTPUT / f'{args.label}-earth-{direction}-{offset}.png'))
            report['cameraTraversal'] = page.evaluate('window.__recordEclipse=false; __eclipseFrames')
            if not args.baseline:
                values = [r['visibility'] for r in report['cameraTraversal']]
                assert any(v == 0 for v in values) and any(v == 1 for v in values) and any(.1 < v < .9 for v in values), values
                report['optics'] = page.evaluate(OPTICS)
                # Public visibleBodies projection includes arrival/departure camera offsets.
                report['projection'] = page.evaluate('''() => {
                  const s=nativeNpcDev.getState(),body=vexedSolFlight.bodies.find(b=>b.id===3),pos=vexedSolFlight.bodyPosition(body),rows=[];
                  for(const zoom of [.5,1,2,4])for(const [w,h]of [[600,450],[980,620]]){
                    const camera={x:pos.x+40,y:pos.y-30},view={w,h,cx:w/2,cy:h/2,zoom,camera};
                    const entry=vexedSolFlight.visibleBodies(s,view).find(e=>e.body.id===3);
                    if(Math.abs(entry.screenX-(w/2-40*zoom))>1e-8||Math.abs(entry.screenY-(h/2+30*zoom))>1e-8)throw Error('Camera/zoom mismatch');
                    rows.push({zoom,w,h,x:entry.screenX,y:entry.screenY});
                  }
                  const sun=vexedSolFlight.bodies.find(b=>b.id===0),sunPos=vexedSolFlight.bodyPosition(sun),zoom=4,w=600,h=450;
                  const edge=vexedSolFlight.visibleBodies(s,{w,h,cx:w/2,cy:h/2,zoom,camera:{x:sunPos.x-(w/2+250)/zoom,y:sunPos.y}}).find(e=>e.body.id===0);
                  if(!edge||edge.screenX!==w+250)throw Error('Zoom culled a visible stellar limb/corona');
                  return rows;
                }''')
                page.set_viewport_size({'width': 960, 'height': 720})
                page.evaluate(PLACE, {'id': 3, 'offset': 0})
                page.wait_for_timeout(150)
                page.screenshot(path=str(OUTPUT / f'{args.label}-earth-resized.png'))
                # Real W input drives the authoritative camera through the limb,
                # then reverses along the same course. Fleet membership is retained.
                row = page.evaluate(PLACE, {'id': 3, 'offset': -15})
                page.evaluate('''() => {
                  nativeNpcDev.getState().angle=0;window.__eclipseFrames=[];window.__recordEclipse=true;
                  window.nativeSimulation={...nativeSimulation,blocked:window.__originalBlocked};
                }''')
                page.locator('#space').focus()
                page.keyboard.down('w')
                page.wait_for_function('(x)=>nativeNpcDev.getState().x>x+40', arg=row['x'], timeout=20000)
                page.keyboard.up('w')
                # A physical hull contact can alter the course during traversal.
                # Pilot the return with normal braking/turning/throttle instead
                # of resetting a heading and assuming an unobstructed corridor.
                deadline=time.monotonic()+20
                controls=[]
                turn_key=None
                def pose():
                    return page.evaluate('''()=>{const s=nativeNpcDev.getState();return{x:s.x,y:s.y,angle:s.angle,speed:s.speed,clock:nativeSimulation.seconds(s)};}''')
                def key(code,down):
                    (page.keyboard.down if down else page.keyboard.up)(code)
                    controls.append({'key':code,'down':down,**pose()})
                def steer(position):
                    nonlocal turn_key
                    bearing=math.atan2(row['y']-position['y'],row['x']-20-position['x'])
                    error=math.atan2(math.sin(bearing-position['angle']),math.cos(bearing-position['angle']))
                    chosen='d' if error>.025 else 'a' if error<-.025 else None
                    if chosen!=turn_key:
                        if turn_key:key(turn_key,False)
                        if chosen:key(chosen,True)
                        turn_key=chosen
                    return abs(error)
                try:
                    key('s',True)
                    while time.monotonic()<deadline:
                        position=pose();error=steer(position)
                        if position['speed']<.5 and error<.04:break
                        page.wait_for_timeout(40)
                    else:raise AssertionError('Normal braking/turning did not prepare return inside 20-second travel budget')
                    key('s',False);key('w',True)
                    while time.monotonic()<deadline:
                        position=pose()
                        if position['x']<row['x']:break
                        steer(position);page.wait_for_timeout(40)
                    else:raise AssertionError('Real keyboard return did not cross the original eclipse edge within 20 seconds')
                except Exception:
                    diagnostic=page.evaluate('''()=>{const s=nativeNpcDev.getState(),d=nativeShipDefinitions.describe(s),near=nativeShipSystems.query(s,{minX:d.x-300,minY:d.y-300,maxX:d.x+300,maxY:d.y+300});return{state:{x:s.x,y:s.y,angle:s.angle,heading:s.heading,speed:s.speed,vx:s.vx,vy:s.vy,hull:s.hull,phase:s.phase,localBody:s.localBody,motionKick:s.motionKick,motionSpin:s.motionSpin,localCruise:s.localCruise,arrivalApproach:s.arrivalApproach},clock:s.shipSimulation,frame:nativeSimulationFrame.snapshot(s),contacts:nativeShipTraffic.snapshot(s).contacts,near:near.targets.map(t=>({id:t.id,category:t.category,x:t.x,y:t.y,hull:t.hull,phase:t.entity?.phase})),frames:__eclipseFrames.slice(-6),activeElement:document.activeElement?.id,pause:nativePause.active,inventory:nativeShipInventory.active};}''')
                    diagnostic.update(initial=row,correctiveInputs=controls)
                    (OUTPUT / f'{args.label}-traversal-failure.json').write_text(json.dumps(diagnostic,indent=2),encoding='utf-8')
                    print(json.dumps({'traversalFailure':diagnostic}),flush=True)
                    raise
                finally:
                    for code in ['w','s','a','d']:key(code,False)
                report['keyboardCorrection']={'inputs':controls,'physicalContacts':page.evaluate("nativeShipTraffic.snapshot(nativeNpcDev.getState()).contacts.filter(c=>c.a==='player:player'||c.b==='player:player')"),'returnBudgetSeconds':20}
                report['keyboardTraversal'] = page.evaluate('window.__recordEclipse=false; __eclipseFrames')
                values = [r['visibility'] for r in report['keyboardTraversal']]
                assert min(values) == 0 and max(values) == 1 and any(.05 < v < .95 for v in values), values
                frames = report['keyboardTraversal']
                ray = (frames[0]['light']['x']-frames[0]['body']['x'], frames[0]['light']['y']-frames[0]['body']['y'])
                assert all(abs((f['light']['x']-f['body']['x'])-ray[0]) < 1e-6 and abs((f['light']['y']-f['body']['y'])-ray[1]) < 1e-6 for f in frames), 'Illumination changed as background stars moved'
                assert max(f['source']['x'] for f in frames)-min(f['source']['x'] for f in frames) > .5, 'No real parallax was exercised'
                assert page.evaluate('nativeNpcDev.getState().civilianTraffic.ships.length+nativeNpcDev.getState().solEconomy.freighters.length+1') == report['population']
            report.update(browserVersion=browser.version, errors=errors, failedRequests=failed)
            assert not errors, errors
            assert not failed, failed
            (OUTPUT / f'{args.label}.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
            print(json.dumps({'passed': True, 'label': args.label, 'bodies': [r['name'] for r in report['bodies']], 'population': report['population'], 'output': str(OUTPUT)}))
            browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
