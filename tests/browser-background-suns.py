"""Actual flight suns, cached bright optics, eclipses and responsive projection."""
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'background-suns'
OUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(
    ('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200', timeout=120000)
        page.evaluate("""()=>{
          window.__solarSimulation=nativeSimulation;
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          window.nativeFlightLightingEnabled=true;
          const render=vexedSpace.render,art=vexedSolFlight.art;
          window.__solarArt=[];window.__solarFrame=0;
          vexedSolFlight.art=(id,system)=>{__solarArt.push({id,system});return art(id,system);};
          vexedSpace.render=(ctx,view,objects)=>{
            render(ctx,view,objects);__solarFrame++;
            window.__solarView={...view};window.__solarObjects=objects;
          };
        }""")
        scenes = []
        for system, star_id, x, y, label in [(1, None, 0, 0, 'sol-earth'), (1, 0, 450, -130, 'sol-near-star'),
                                            (2, 900, 500, 150, 'orion'), (12, 900, 500, 150, 'triple-star'),
                                            (12, 901, 500, 150, 'white-dwarf'), (12, 902, 500, 150, 'red-companion')]:
            scene = page.evaluate("""async ({system,starId,x,y})=>{
              if(starId!==null){const star=nativeStellarBackground.sources(system).find(s=>s.id===starId);x+=star.worldX;y+=star.worldY;}
              const s=nativeNpcDev.getState();nativeShipMotion.stop(s);
              Object.assign(s,{system,localBody:nativeSystemCatalog.homeId(system),x,y,phase:'flight',landed:false,localCruise:null,arrivalApproach:null});
              delete s.journey;delete s.shipyardDock;delete s.manualFlightRegion;
              nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);
              vexedSpace.enterSystem(system,true);__solarArt=[];
              await Promise.all([nativeStellarBackground.prepare(system),vexedSolFlight.prepareArt(nativeSystemCatalog.homeId(system),system)]);
              return {system,frame:__solarFrame};
            }""", {'system': system, 'starId': star_id, 'x': x, 'y': y})
            page.wait_for_function('frame=>__solarFrame>frame+2', arg=scene['frame'])
            row = page.evaluate("""()=>{
              const s=nativeNpcDev.getState(),primary=vexedSpace.suns.find(s=>s.primary);
              const bad=__solarArt.filter(call=>nativeSystemCatalog.bodies(call.system).find(b=>b.id===call.id)?.kind==='star');
              return {system:s.system,suns:vexedSpace.suns.map(s=>({id:s.id,x:s.x,y:s.y,radius:s.radius})),
                primaryAligned:vexedSpace.light.x===primary.x&&vexedSpace.light.y===primary.y,
                foregroundStars:bad.length,metrics:nativeStellarBackground.metrics()};
            }""")
            assert row['suns'] and row['primaryAligned'] and row['foregroundStars'] == 0, row
            assert row['metrics']['loadedImages']>0 and all(sun['radius']>0 for sun in row['suns']),row
            assert row['metrics']['bodies']>=1 if star_id is not None else row['metrics']['bodies']==0,row
            if system == 12:
                assert len(row['suns']) == 3, row
            page.screenshot(path=str(OUT / f'{label}.png'))
            scenes.append(row)
        optics = page.evaluate("""()=>{
          const s=nativeNpcDev.getState(),saved=JSON.stringify(s),canvas=document.createElement('canvas');
          canvas.width=900;canvas.height=650;const ctx=canvas.getContext('2d',{willReadFrequently:true});
          const api=nativeStellarBackground,view={w:900,h:650,cameraX:0,cameraY:0,reducedMotion:true};
          const source=api.sources(1)[0];
          const star={...api.project(1,{...view,cameraX:source.worldX-400,cameraY:source.worldY})[0],x:320,y:200};
          function draw(objects=[],elapsed=0,v=view){
            ctx.fillStyle='#000';ctx.fillRect(0,0,900,650);
            ctx.save();
            for(const o of objects){ctx.beginPath();ctx.rect(0,0,900,650);ctx.ellipse(o.x,o.y,o.rx,o.ry,0,0,Math.PI*2);ctx.clip('evenodd');}
            api.render(ctx,[star],v,objects,vexedSpace.sourceVisibility,{elapsed});
            ctx.restore();
            const pixels=ctx.getImageData(0,0,900,650).data;
            let energy=0,lit=0;for(let i=0;i<pixels.length;i+=4){const value=pixels[i]+pixels[i+1]+pixels[i+2];energy+=value;if(value>12)lit++;}
            return {pixels,energy,lit};
          }
          const clear=draw(),core=ctx.getImageData(star.x-4,star.y-4,9,9).data;
          let whiteCenterPixels=0;
          for(let i=0;i<core.length;i+=4)if(Math.min(core[i],core[i+1],core[i+2])>=249)whiteCenterPixels++;
          if(whiteCenterPixels>36)throw Error('An artificial white disk covers the star surface');
          if(clear.lit<15000)throw Error('Bright sun has insufficient flare coverage '+clear.lit);
          if(api.metrics().bodies!==1)throw Error('The actual catalog artwork was not painted');
          const textured=ctx.getImageData(star.x+10,star.y-30,20,16).data;
          const values=[];for(let i=0;i<textured.length;i+=4)values.push(textured[i]+textured[i+1]+textured[i+2]);
          const surfaceRange=Math.max(...values)-Math.min(...values);
          if(surfaceRange<15)throw Error('The star surface detail is washed out');
          const image=canvas.toDataURL(),covered=draw([{x:star.x,y:star.y,rx:100,ry:100}]);
          if(covered.energy!==0||api.metrics().draws!==0)throw Error('Covered source still emits flare');
          const middle=draw([{x:star.x+90,y:star.y,rx:90,ry:90}]);
          const coverage=vexedSpace.sourceVisibility(star,[{x:star.x+90,y:star.y,rx:90,ry:90}]);
          if(!(middle.energy>0&&middle.energy<clear.energy&&coverage>.45&&coverage<.75))throw Error('Partial eclipse does not fade continuously');
          const paused=draw([],100),heading=draw([],100,{...view,heading:Math.PI});
          if(!clear.pixels.every((v,i)=>v===paused.pixels[i])||!paused.pixels.every((v,i)=>v===heading.pixels[i]))throw Error('Reduced/paused optics changed');
          const animated=draw([],3,{...view,reducedMotion:false});
          if(clear.pixels.every((v,i)=>v===animated.pixels[i]))throw Error('Stellar illumination and corona are static');
          const activityImages=[];let limbChanges=0;
          for(const elapsed of [0,6.5,13]){
            const frame=draw([],elapsed,{...view,reducedMotion:false});
            activityImages.push(canvas.toDataURL());
            if(elapsed===13)for(let y=star.y-80;y<=star.y+80;y++)for(let x=star.x-80;x<=star.x+80;x++){
              const radius=Math.hypot(x-star.x,y-star.y);if(radius<star.radius*1.04||radius>star.radius*1.5)continue;
              const i=(y*canvas.width+x)*4;
              const difference=Math.abs(frame.pixels[i]-clear.pixels[i])+Math.abs(frame.pixels[i+1]-clear.pixels[i+1])+Math.abs(frame.pixels[i+2]-clear.pixels[i+2]);
              if(difference>16)limbChanges++;
            }
          }
          if(limbChanges<20)throw Error('No visible evolving plasma activity above the limb');
          const warm=api.metrics();for(let i=0;i<120;i++)draw();
          if(api.metrics().builds!==warm.builds)throw Error('Flare textures rebuilt while warm');
          if(JSON.stringify(s)!==saved)throw Error('Background painting changed the saved game');
          return {whiteCenterPixels,centerSamplePixels:81,litPixels:clear.lit,clearEnergy:clear.energy,coveredEnergy:covered.energy,
            partialRatio:middle.energy/clear.energy,surfaceRange,limbChanges,animatedLighting:true,pausedStable:true,headingIndependent:true,readOnly:true,
            cache:api.metrics(),image,activityImages};
        }""")
        (OUT / 'flare-detail.png').write_bytes(base64.b64decode(optics.pop('image').split(',', 1)[1]))
        for i, image in enumerate(optics.pop('activityImages')):
            (OUT / f'solar-activity-{i}.png').write_bytes(base64.b64decode(image.split(',', 1)[1]))
        # Actual keyboard flight pans a fixed-size nearer star layer.
        # Retain the complete samples, including entry and exit.
        page.evaluate("""()=>{
          const s=nativeNpcDev.getState();nativeShipMotion.stop(s);
          const source=nativeStellarBackground.sources(1)[0];window.__solarFlybyX=source.worldX;
          Object.assign(s,{system:1,localBody:3,x:source.worldX-2400,y:source.worldY+130,angle:0,phase:'flight',landed:false,localCruise:null,arrivalApproach:null});
          delete s.manualFlightRegion;nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);
          vexedSpace.enterSystem(1,true);
          const stellar=nativeStellarBackground,metrics=nativeSimulationMetrics;
          window.__solarRows=[];window.__solarMeasure=false;window.__solarRenderMs=0;
          window.nativeStellarBackground={...stellar,render(...args){const at=performance.now();const result=stellar.render(...args);__solarRenderMs=performance.now()-at;return result;}};
          window.nativeSimulationMetrics={...metrics,record(state,row){if(__solarMeasure){const sun=vexedSpace.suns[0];__solarRows.push({...row,sunMs:__solarRenderMs,cameraX:__solarView.cameraX,sunX:sun.x,sunRadius:sun.radius,bodies:stellar.metrics().bodies});}return metrics.record(state,row);}};
          window.nativeSimulation=__solarSimulation;nativeSimulationHost.checkpoint();
        }""")
        page.locator('#space').focus()
        page.wait_for_timeout(700)
        motion_start = page.evaluate("""()=>{__solarMeasure=true;const sun=vexedSpace.suns[0];return {camera:__solarView.cameraX,sun:sun.x,radius:sun.radius,bodies:nativeStellarBackground.metrics().bodies};}""")
        assert motion_start['bodies']==0,motion_start
        page.screenshot(path=str(OUT / 'layer-before-entry.png'))
        page.keyboard.down('w')
        page.wait_for_function('()=>__solarView.cameraX>__solarFlybyX+2400&&__solarRows.length>=180', timeout=30000)
        page.keyboard.up('w')
        flight = page.evaluate("""()=>{
          __solarMeasure=false;
          const camera=__solarView.cameraX,sun=vexedSpace.suns[0].x;
          window.nativeSimulation={...__solarSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          const mean=key=>__solarRows.reduce((n,row)=>n+row[key],0)/__solarRows.length;
          return {camera,sun,frames:__solarRows.length,sunMs:mean('sunMs'),renderMs:mean('render'),
            simulationMs:mean('simulation'),fps:1000/mean('frame'),bodies:nativeStellarBackground.metrics().bodies,
            minRadius:Math.min(...__solarRows.map(r=>r.sunRadius)),maxRadius:Math.max(...__solarRows.map(r=>r.sunRadius)),
            visibleFrames:__solarRows.filter(r=>r.bodies>0).length,rows:__solarRows};
        }""")
        camera_travel = abs(flight['camera'] - motion_start['camera'])
        sun_travel = abs(flight['sun'] - motion_start['sun'])
        assert camera_travel > 4800 and abs(sun_travel / camera_travel-.24)<1e-8, (motion_start, flight['camera'], flight['sun'])
        assert flight['visibleFrames']>0 and flight['minRadius']==flight['maxRadius']==motion_start['radius'],flight
        assert flight['bodies']==0 and flight['sun'] < -motion_start['radius'],flight
        page.screenshot(path=str(OUT / 'layer-after-exit.png'))
        flight['parallaxRatio'] = sun_travel / camera_travel
        (OUT / 'flight-frames.json').write_text(json.dumps(flight.pop('rows'), indent=2))
        layouts = []
        for width, height in [(1920, 1080), (390, 700)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_function('()=>Math.abs(__solarView.w-nativeView.measure(document.querySelector("#space")).w)<.01')
            row = page.evaluate("""()=>({w:__solarView.w,h:__solarView.h,
              offscreen:vexedSpace.suns.every(s=>s.x<-s.radius),bodies:nativeStellarBackground.metrics().bodies})""")
            assert row['offscreen'] and row['bodies']==0, row
            page.screenshot(path=str(OUT / f'background-suns-{width}.png'))
            layouts.append(row)
        assert not errors, errors
        report = {'passed': True, 'scenes': scenes, 'optics': optics, 'flight': flight,
                  'measurementScope': 'Warm headless full-game flight; not display refresh qualification.',
                  'layouts': layouts, 'errors': errors}
        (OUT / 'browser.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report), flush=True)
        browser.close()
finally:
    server.shutdown()
