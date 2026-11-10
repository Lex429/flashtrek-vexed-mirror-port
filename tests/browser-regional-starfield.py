"""Real small-star pixels, density, coordinate continuity and live integration."""
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'regional-starfield'
OUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = None
if len(sys.argv) > 1:
    base = sys.argv[1].rstrip('/')
else:
    server = http.server.ThreadingHTTPServer(
        ('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
errors, failed = [], []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
        page.goto(base + '/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.nativeRegionalStarfield&&nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>vexedSpace.starfield?.visible>0&&nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200', timeout=120000)
        live = page.evaluate('()=>({system:nativeNpcDev.getState().system,sky:vexedSpace.starfield})')
        assert live['system'] == 1 and live['sky']['name'] == 'Sol neighbourhood', live
        page.screenshot(path=str(OUT / 'live-earth.png'))
        report = page.evaluate('''()=>{
          const game=nativeNpcDev.getState(),saved=JSON.stringify(game),api=nativeRegionalStarfield;
          const canvas=document.createElement('canvas');canvas.width=900;canvas.height=600;
          const ctx=canvas.getContext('2d',{willReadFrequently:true}),view={w:900,h:600,playerX:0,playerY:0,reducedMotion:true};
          const field=api.create();
          const makeGradient=ctx.createLinearGradient.bind(ctx);let segments=[];
          ctx.createLinearGradient=(...points)=>{
            const gradient=makeGradient(...points),addStop=gradient.addColorStop.bind(gradient),segment={points,stops:[]};
            gradient.addColorStop=(offset,color)=>{segment.stops.push([offset,color]);addStop(offset,color);};
            segments.push(segment);return gradient;
          };
          function capture(system,extra={},model=vexedSpaceModel.create(system)){
            segments=[];
            ctx.fillStyle='#000';ctx.globalAlpha=1;ctx.fillRect(0,0,900,600);
            field.render(ctx,{...view,...extra},model.state);
            const pixels=ctx.getImageData(0,0,900,600).data;
            const counts={lit:0,blue:0,green:0,red:0};let energy=0;
            for(let i=0;i<pixels.length;i+=4){
              const r=pixels[i],g=pixels[i+1],b=pixels[i+2];energy+=r+g+b;
              if(Math.max(r,g,b)<12)continue;counts.lit++;
              if(b>r*1.25&&b>g*1.05)counts.blue++;
              if(g>r*1.25&&g>b*1.08)counts.green++;
              if(r>g*1.25&&r>b*1.15)counts.red++;
            }
            return {system,metrics:field.metrics(),counts,energy,pixels,image:canvas.toDataURL(),segments};
          }
          const scenes=[1,58,31,38,73,34].map(id=>capture(id));
          const [,blue,green,red,sparse]=scenes;
          if(blue.counts.blue<blue.counts.red*3||green.counts.green<green.counts.red*2||red.counts.red<red.counts.blue*3)
            throw Error('Regional colours are absent from the actual small-star pixels: '+JSON.stringify(scenes.map(s=>s.counts)));
          if(blue.counts.lit<sparse.counts.lit*8)throw Error('Dense and sparse regions look too similar');
          const paused=capture(31),repeat=capture(31,{heading:Math.PI});
          if(!paused.pixels.every((n,i)=>n===repeat.pixels[i]))throw Error('Paused star pixels changed');
          const moving=vexedSpaceModel.create(1);moving.update(5,{speed:200,locx:-200/13,locy:0,maxSpeed:450,courseLocked:true});
          const earth=nativeManualFlight.chartPosition(1),alpha=nativeManualFlight.chartPosition(4);
          const before=capture(1,{playerX:(alpha.x-earth.x)*1000,playerY:(alpha.y-earth.y)*1000,reducedMotion:false},moving);
          field.rebase(moving.state);
          const after=capture(4,{reducedMotion:false});
          if(!before.pixels.every((n,i)=>n===after.pixels[i]))throw Error('Small stars popped at a system coordinate rebase');
          const edgeA=capture(73,{playerX:14000}),edgeB=capture(73,{playerX:14001});
          let difference=0;for(let i=0;i<edgeA.pixels.length;i++)if(i%4!==3)difference+=Math.abs(edgeA.pixels[i]-edgeB.pixels[i]);
          if(difference>edgeA.energy*.005)throw Error('Regional palette or density changes abruptly');
          const builds=field.metrics().atlasBuilds;
          for(const system of VexedMirrorWorld.systems)field.render(ctx,view,vexedSpaceModel.create(system.id).state);
          if(field.metrics().atlasBuilds!==builds)throw Error('Travel rebuilt the spectral atlas');
          const trails=[58,31,38].map(system=>{
            const model=vexedSpaceModel.create(system);
            for(let i=0;i<240;i++)model.update(1/60,{speed:450,locx:-450/13,locy:0,maxSpeed:450,courseLocked:true});
            const dots=capture(system,{},model),fast=capture(system,{reducedMotion:false},model),repeat=capture(system,{reducedMotion:false},model);
            if(!fast.segments.length||!fast.pixels.every((n,i)=>n===repeat.pixels[i]))throw Error('Fast trails are missing or change while paused');
            const reduced=capture(system,{},model);
            if(reduced.segments.length||!reduced.pixels.every((n,i)=>n===dots.pixels[i]))throw Error('Reduced motion retains trails');
            const difference={blue:0,green:0,red:0};
            for(let i=0;i<fast.pixels.length;i+=4){
              const r=Math.max(0,fast.pixels[i]-dots.pixels[i]),g=Math.max(0,fast.pixels[i+1]-dots.pixels[i+1]),b=Math.max(0,fast.pixels[i+2]-dots.pixels[i+2]);
              if(Math.max(r,g,b)<5)continue;
              if(b>r*1.25&&b>g*1.05)difference.blue++;
              if(g>r*1.25&&g>b*1.08)difference.green++;
              if(r>g*1.25&&r>b*1.15)difference.red++;
            }
            const expected=system===58?'blue':system===31?'green':'red';
            if(difference[expected]<20)throw Error('The new star colours are missing from the actual trail pixels');
            let nearEnergy=0,farEnergy=0,samples=0;
            for(const segment of fast.segments){
              const [x0,y0,x1,y1]=segment.points,length=Math.hypot(x1-x0,y1-y0);
              if(![20,34].some(n=>Math.abs(length-n*model.state.speedEffect)<1e-8))throw Error('Original speed-to-length response changed');
              if(x0<3||x0>896||x1<3||x1>896||y0<3||y0>596||y1<3||y1>596)continue;
              function patch(t){
                const x=Math.round(x0+(x1-x0)*t),y=Math.round(y0+(y1-y0)*t);let energy=0;
                for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)for(let channel=0;channel<3;channel++){
                  const i=((y+oy)*900+x+ox)*4+channel;energy+=Math.max(0,fast.pixels[i]-dots.pixels[i]);
                }
                return energy;
              }
              nearEnergy+=patch(.8);farEnergy+=patch(.15);samples++;
            }
            if(samples<5||nearEnergy<farEnergy*1.2)throw Error('Tail pixels do not fade toward their ends');
            return {system,expectedColor:expected,coloredTrailPixels:difference,streaks:fast.segments.length,
              nearEnergy,farEnergy,samples,pausedPixelsStable:true,reducedMotionSuppressed:true,image:fast.image,dots:dots.image};
          });
          const times=[],dense=vexedSpaceModel.create(58);
          for(let i=0;i<100;i++){
            const started=performance.now();field.render(ctx,view,dense.state);times.push(performance.now()-started);
          }
          times.sort((a,b)=>a-b);
          if(JSON.stringify(game)!==saved)throw Error('Decorative star rendering changed the saved game');
          for(const scene of scenes){delete scene.pixels;delete scene.segments;}
          return {scenes,trails,pausedPixelsStable:true,systemRebasePixelsStable:true,smoothPalettePixels:true,
            gameplayUnchanged:true,atlasBuilds:builds,allDestinations:VexedMirrorWorld.systems.length,
            denseSubmissionMs:{median:times[50],p95:times[95]}};
        }''')
        sheet = Image.new('RGB', (1200, 1290), '#080b10')
        drawing = ImageDraw.Draw(sheet)
        for index, scene in enumerate(report['scenes']):
            image_path = OUT / f"system-{scene['system']}.png"
            image_path.write_bytes(base64.b64decode(scene.pop('image').split(',', 1)[1]))
            x, y = (index % 2) * 600, (index // 2) * 430
            with Image.open(image_path) as image:
                sheet.paste(image.resize((600, 400), Image.Resampling.LANCZOS), (x, y + 30))
            drawing.text((x + 12, y + 8), f"{scene['metrics']['name']} / density {scene['metrics']['density']:.2f}", fill='#e0e8f4')
        sheet.save(OUT / 'regional-comparison.png')
        trail_sheet = Image.new('RGB', (1200, 1290), '#080b10')
        trail_drawing = ImageDraw.Draw(trail_sheet)
        for index, scene in enumerate(report['trails']):
            for column, key in enumerate(['dots', 'image']):
                image_path = OUT / f"trails-{scene['system']}-{key}.png"
                image_path.write_bytes(base64.b64decode(scene.pop(key).split(',', 1)[1]))
                x, y = column * 600, index * 430
                with Image.open(image_path) as image:
                    trail_sheet.paste(image.resize((600, 400), Image.Resampling.LANCZOS), (x, y + 30))
                label = 'Reduced motion' if key == 'dots' else 'Restored fast-flight trails'
                trail_drawing.text((x + 12, y + 8), f"{scene['expectedColor'].title()} region / {label}", fill='#e0e8f4')
        trail_sheet.save(OUT / 'speed-trails-comparison.png')
        assert not errors, errors
        assert not failed, failed
        report.update(passed=True, live=live, errors=errors, failed=failed)
        (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
        print(json.dumps({key: value for key, value in report.items() if key != 'live'}))
        browser.close()
finally:
    if server:
        server.shutdown()
        server.server_close()
