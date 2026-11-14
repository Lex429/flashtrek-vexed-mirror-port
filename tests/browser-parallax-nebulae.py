"""Evolving GPU gas, fixed-camera deformation, fallback and foreground ordering."""
import base64
import functools
import http.server
import io
import json
import os
from pathlib import Path
import sys
import threading

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'parallax-nebulae'
OUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = None
if len(sys.argv) > 1:
    base = sys.argv[1].rstrip('/')
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
errors, failed = [], []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.add_init_script('''{
          const getContext=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(kind,...args){
            const ctx=getContext.call(this,kind,...args);
            if(kind==='webgl2'&&this.dataset.nebulaGas==='procedural')window.__nebulaGL=ctx;
            return ctx;
          };
        }''')
        photo_requests = []
        page.on('request', lambda request: photo_requests.append(request.url) if '/assets/nebulae/' in request.url else None)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
        page.goto(base + '/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.nativeParallaxNebulae&&nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>vexedSpace.nebulae&&nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200', timeout=120000)
        page.screenshot(path=str(OUT / 'live-sol.png'))
        page.evaluate('''()=>{
          const s=nativeNpcDev.getState();nativeShipMotion.stop(s);
          Object.assign(s,{system:34,x:0,y:0,localBody:0,landed:false,localCruise:null,arrivalApproach:null});
          delete s.journey;nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);
        }''')
        page.wait_for_function('()=>vexedSpace.state.system===34&&vexedSpace.nebulae?.draws===0', timeout=120000)
        page.evaluate('()=>{const s=nativeNpcDev.getState();s.system=73;nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);}')
        # Full physical coverage omits the redundant background-gas pass. Check
        # the actual shared material GPU and its direct gas texture instead.
        page.wait_for_function('()=>nativeGalaxyFog.materials().some(m=>m.field.ready)&&nativeNebulaMaterial.metrics().backend==="webgl2"&&nativeNebulaMaterial.metrics().gasTextureDraws>0',timeout=120000)
        page.screenshot(path=str(OUT / 'live-badlands.png'))
        page.keyboard.press('Escape')
        page.wait_for_function('()=>nativePause.active')
        paused_clock = page.evaluate('vexedSpace.nebulae.elapsed')
        page.wait_for_timeout(250)
        assert page.evaluate('vexedSpace.nebulae.elapsed') == paused_clock, 'Game pause advances nebula time'
        page.keyboard.press('Escape')
        page.wait_for_function('()=>!nativePause.active')
        report = page.evaluate('''async()=>{
          const api=nativeParallaxNebulae,field=api.create(),order=[];const galaxyFog=nativeGalaxyFog;window.nativeGalaxyFog={...galaxyFog,parallaxHoles:()=>[]};
          const starAPI=nativeRegionalStarfield;
          window.nativeParallaxNebulae={...api,create(){const child=api.create();return {...child,render(...args){order.push('nebula');return child.render(...args);}};}};
          window.nativeRegionalStarfield={...starAPI,create(){const child=starAPI.create();return {...child,render(...args){order.push('stars');return child.render(...args);}};}};
          const integrated=vexedSpace.create(73);
          window.nativeParallaxNebulae=api;window.nativeRegionalStarfield=starAPI;
          await Promise.all([field.prepare(33),field.prepare(34),field.prepare(73),integrated.prepareSystem(73)]);
          const game=nativeNpcDev.getState(),saved=JSON.stringify(game),canvas=document.createElement('canvas');
          canvas.width=1200;canvas.height=800;
          const ctx=canvas.getContext('2d',{willReadFrequently:true}),view={w:1200,h:800,playerX:0,playerY:0,cameraX:0,cameraY:0,reducedMotion:false};
          function capture(system,time=0,extra={},owner=field){
            ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,1200,800);
            owner.render(ctx,{...view,weatherSeconds:time,...extra},{system,elapsed:time});
            const pixels=ctx.getImageData(0,0,1200,800).data;let lit=0,energy=0;
            for(let i=0;i<pixels.length;i+=4){const value=pixels[i]+pixels[i+1]+pixels[i+2];energy+=value;if(value>12)lit++;}
            return {system,time,pixels,lit,energy,metrics:owner.metrics(),image:canvas.toDataURL()};
          }
          function difference(a,b){let pixels=0,energy=0;for(let i=0;i<a.pixels.length;i+=4){const d=Math.abs(a.pixels[i]-b.pixels[i])+Math.abs(a.pixels[i+1]-b.pixels[i+1])+Math.abs(a.pixels[i+2]-b.pixels[i+2]);energy+=d;if(d>2)pixels++;}return {pixels,energy};}
          const scenes=[1,73,32,33,34,31].map(system=>capture(system,12));
          if(scenes.filter(scene=>![1,31,32,33,34].includes(scene.system)).some(scene=>scene.lit<10000||scene.metrics.draws===0))throw Error('Regional clouds are missing or too faint');
          if(scenes.filter(scene=>[1,31,32,33,34].includes(scene.system)).some(scene=>scene.energy!==0||scene.metrics.draws!==0))throw Error('An ordinary homeworld has an unsupported nebula');
          const badlands=scenes.find(scene=>scene.system===73);
          if(scenes.some(scene=>scene.metrics.layers.some(layer=>layer.source!=='procedural-gas')))throw Error('A region still uses a fixed image');
          if(scenes.some(scene=>scene.metrics.imageRequests!==0||scene.metrics.loadedImages!==0))throw Error('Procedural clouds requested images');
          if(nativeNebulaGas.metrics().backend!=='webgl2'||nativeNebulaGas.metrics().compiles!==1)throw Error('The actual gas shader did not compile');
          const storm=capture(73,40),stormMotion=difference(badlands,storm);
          if(stormMotion.pixels<1000)throw Error('Plasma fronts and eddies do not visibly move');
          const stormPaused=capture(73,40);if(difference(storm,stormPaused).energy!==0)throw Error('Paused plasma changes');
          const stormReducedA=capture(73,0,{reducedMotion:true}),stormReducedB=capture(73,500,{reducedMotion:true});
          if(difference(stormReducedA,stormReducedB).energy!==0)throw Error('Reduced motion animates plasma');
          const first=capture(73,0),animated=capture(73,40),repeat=capture(73,40);
          const motion=difference(first,animated);
          if(motion.pixels<1000)throw Error('The nebula does not visibly animate');
          if(JSON.stringify(first.metrics.layers)!==JSON.stringify(animated.metrics.layers))throw Error('Cloud geometry moved instead of testing internal gas deformation');
          const warmRenders=field.metrics().fieldRenders;
          if(difference(animated,repeat).energy!==0)throw Error('Paused nebula pixels changed');
          capture(73,40);if(field.metrics().fieldRenders!==warmRenders)throw Error('Paused gas reran the field');
          const reducedA=capture(73,0,{reducedMotion:true}),reducedB=capture(73,500,{reducedMotion:true});
          if(difference(reducedA,reducedB).energy!==0)throw Error('Reduced motion still animates the clouds');
          const base=capture(73,20),moved=capture(73,20,{cameraX:4000});
          for(let i=0;i<base.metrics.layers.length;i++){
            const a=base.metrics.layers[i],b=moved.metrics.layers[i];
            if(Math.abs(a.x-b.x-4000*a.rate)>1e-8||a.width!==b.width)throw Error('Clouds lost fixed-rate, fixed-size parallax');
          }
          if(difference(base,moved).pixels<1000)throw Error('Camera movement does not move nebula pixels');
          const earth=nativeManualFlight.chartPosition(1),destination=nativeManualFlight.chartPosition(73);
          const oldView={playerX:(destination.x-earth.x)*1000,playerY:(destination.y-earth.y)*1000,cameraX:(destination.x-earth.x)*1000,cameraY:(destination.y-earth.y)*1000};
          const crossing=api.create(),before=capture(1,35,oldView,crossing);crossing.rebase({elapsed:35});
          const after=capture(73,35,{},crossing),rebase=difference(before,after);
          if(rebase.energy>10)throw Error('Nebula jumped at a physical coordinate rebase');
          const gap=capture(1,0,{playerX:(-285-earth.x)*1000,playerY:(-145-earth.y)*1000});
          if(gap.energy!==0||gap.metrics.draws!==0)throw Error('Finite nebula regions fill an empty chart gap');
          integrated.render(ctx,view,[]);const open=ctx.getImageData(500,300,200,200).data;
          integrated.render(ctx,view,[{x:600,y:400,rx:115,ry:115}]);const covered=ctx.getImageData(570,370,60,60).data;
          if(order[0]!=='nebula'||order.includes('stars'))throw Error('The starless Badlands painted a star layer');
          let openEnergy=0,coveredEnergy=0;for(let i=0;i<open.length;i++)if(i%4!==3)openEnergy+=open[i];
          for(let i=0;i<covered.length;i++)if(i%4!==3)coveredEnergy+=covered[i];
          if(!openEnergy||coveredEnergy!==0)throw Error('Nebula leaks through an opaque foreground body');
          const compiles=field.metrics().compiles;
          for(const system of VexedMirrorWorld.systems)field.render(ctx,view,{system:system.id,elapsed:50});
          const warm=field.metrics();if(warm.compiles!==compiles||warm.loadedImages!==0||warm.imageRequests!==0||warm.surfaceBytes>384*288*4||warm.failures)throw Error('Procedural surfaces grew or failed');
          const timingCanvas=document.createElement('canvas');timingCanvas.width=1200;timingCanvas.height=800;const timingCtx=timingCanvas.getContext('2d'),times=[];
          for(let i=0;i<30;i++){const started=performance.now();field.render(timingCtx,view,{system:73,elapsed:i/60});times.push(performance.now()-started);}
          times.sort((a,b)=>a-b);
          const preview=document.createElement('canvas');preview.width=720;preview.height=480;const previewCtx=preview.getContext('2d'),frames=[];
          for(let i=0;i<24;i++){
            previewCtx.fillStyle='#000';previewCtx.fillRect(0,0,720,480);
            field.render(previewCtx,{...view,w:720,h:480},{system:73,elapsed:i*1.5});
            previewCtx.fillStyle='#ced8df';previewCtx.font='13px sans-serif';previewCtx.fillText('Procedural gas / fixed camera / 12x preview',14,24);
            frames.push(preview.toDataURL());
          }
          window.nativeGalaxyFog=galaxyFog;if(JSON.stringify(game)!==saved)throw Error('Decorative clouds changed gameplay state');
          for(const scene of scenes)delete scene.pixels;
          delete first.pixels;delete animated.pixels;
          return {scenes,frames,animation:{changedPixels:motion.pixels,first:first.image,animated:animated.image},stationaryGeometry:true,shaderBackend:'webgl2',imageRequests:0,stormAnimationPixels:stormMotion.pixels,clearHomeworlds:true,pauseStable:true,reducedMotionStable:true,
            rebasePixelsStable:true,emptyGap:true,foregroundOcclusion:true,layerOrder:order.slice(0,2),warmCache:warm,
            gameplayUnchanged:true,allDestinations:VexedMirrorWorld.systems.length,submissionMs:{median:times[15],p95:times[28]}};
        }''')
        animation_frames = [Image.open(io.BytesIO(base64.b64decode(frame.split(',', 1)[1]))).convert('RGB') for frame in report.pop('frames')]
        animation_frames[0].save(OUT / 'procedural-gas.gif', save_all=True, append_images=animation_frames[1:], duration=125, loop=0)
        sheet = Image.new('RGB', (1200, 1290), '#080b10')
        drawing = ImageDraw.Draw(sheet)
        labels = {1: 'Sol / clear ordinary space', 31: 'Romulus / clear ordinary space', 32: 'Harman / cleared', 33: 'Kardon / cleared', 73: 'Badlands / plasma storms', 34: 'Vex / cleared'}
        for index, scene in enumerate(report['scenes']):
            path = OUT / f"system-{scene['system']}.png"
            path.write_bytes(base64.b64decode(scene.pop('image').split(',', 1)[1]))
            x, y = (index % 2) * 600, (index // 2) * 430
            with Image.open(path) as image:
                sheet.paste(image.resize((600, 400), Image.Resampling.LANCZOS), (x, y + 30))
            drawing.text((x + 12, y + 8), labels[scene['system']], fill='#e0e8f4')
        sheet.save(OUT / 'nebula-comparison.png')
        for key in ['first', 'animated']:
            (OUT / f'animation-{key}.png').write_bytes(base64.b64decode(report['animation'].pop(key).split(',', 1)[1]))
        has_loss_extension = page.evaluate('()=>{window.__nebulaLossExtension=window.__nebulaGL?.getExtension("WEBGL_lose_context");return !!window.__nebulaLossExtension;}')
        assert has_loss_extension, 'Browser cannot exercise GPU context-loss recovery'
        page.evaluate('()=>{window.__savedGalaxyFog=nativeGalaxyFog;window.nativeGalaxyFog={...nativeGalaxyFog,parallaxHoles:()=>[]};window.__nebulaLossExtension.loseContext();}')
        page.wait_for_function('()=>nativeNebulaGas.metrics().contextLost', timeout=30000)
        fallback = page.evaluate('''()=>{
          const field=nativeParallaxNebulae.create(),canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
          const ctx=canvas.getContext('2d',{willReadFrequently:true}),view={w:320,h:240,playerX:0,playerY:0,cameraX:0,cameraY:0,reducedMotion:false};
          function draw(time){ctx.fillStyle='#000';ctx.fillRect(0,0,320,240);field.render(ctx,{...view,weatherSeconds:time},{system:73,elapsed:time});return ctx.getImageData(0,0,320,240).data;}
          const a=draw(0),b=draw(30);let changed=0,lit=0;
          for(let i=0;i<a.length;i+=4){if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>3)changed++;if(b[i]+b[i+1]+b[i+2]>6)lit++;}
          if(changed<100||lit<100||field.metrics().backend!=='canvas-procedural')throw Error('Lost GPU context disabled evolving gas');
          const stable=draw(30);if(!b.every((n,i)=>n===stable[i]))throw Error('Fallback pixels change while paused');
          return {changedPixels:changed,litPixels:lit,backend:field.metrics().backend,imageRequests:field.metrics().imageRequests};
        }''')
        page.evaluate('window.__nebulaLossExtension.restoreContext()')
        page.wait_for_function('()=>!nativeNebulaGas.metrics().contextLost', timeout=30000)
        recovery = page.evaluate('''()=>{
          nativeNebulaGas.prepare();const field=nativeParallaxNebulae.create(),canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
          field.render(canvas.getContext('2d'),{w:320,h:240,playerX:0,playerY:0,cameraX:0,cameraY:0,reducedMotion:false},{system:73,elapsed:31});
          if(field.metrics().backend!=='webgl2')throw Error('Restored GPU did not resume procedural gas');return nativeNebulaGas.metrics();
        }''')
        page.evaluate('window.nativeGalaxyFog=__savedGalaxyFog;delete window.__savedGalaxyFog')
        assert not errors, errors
        assert not failed, failed
        assert not photo_requests, photo_requests
        report.update(passed=True, actualPauseClockStable=True, gpuLossFallback=fallback, gpuRestored=recovery['backend']=='webgl2', errors=errors, failed=failed)
        (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
        print(json.dumps({key: value for key, value in report.items() if key not in ['scenes', 'warmCache']}))
        browser.close()
finally:
    if server:
        server.shutdown()
        server.server_close()
