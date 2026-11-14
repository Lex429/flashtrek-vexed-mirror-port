"""All-hull fog checks and actual foreground frame delivery in a dense fog bank."""
import argparse
import functools
import http.server
import importlib.util
import json
import os
import hashlib
from pathlib import Path
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/fleet-fog'
OUT.mkdir(parents=True, exist_ok=True)


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


stability = module('fleet_stability', 'tests/browser-stability.py')
headed = module('fleet_headed', 'tests/browser-performance-headed.py')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root', type=Path, default=ROOT)
parser.add_argument('--label', default='functional')
parser.add_argument('--performance', action='store_true')
parser.add_argument('--baseline', action='store_true', help='Measure the previous single-hull implementation without asserting new shared coverage')
parser.add_argument('--headed', action='store_true')
parser.add_argument('--seconds', type=float, default=30)
parser.add_argument('--runs', type=int, default=2)
parser.add_argument('--crowd', type=int, default=16)
parser.add_argument('--fixture', type=Path, default=ROOT / 'test-results/intrepid-performance/initial-save.json')
parser.add_argument('--catalog-stages', default='0,3')
parser.add_argument('--types', help='Optional comma-separated catalog IDs for a focused diagnostic')
args = parser.parse_args()


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(args.source_root.resolve())))
threading.Thread(target=server.serve_forever, daemon=True).start()
report = dict(label=args.label, passed=False, headless=not args.headed, viewport=None, errors=[], failedRequests=[], windows=[], catalog=[])
report['sourceHashes']={str(p.relative_to(args.source_root.resolve())).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['html-games/broken-mirror-port','html-games/flashtrek-broken-mirror'] for p in (args.source_root.resolve()/folder).rglob('*') if p.suffix in ['.js','.html']}
report['harnessHash']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

CATALOG_CHECK = r'''async ({id,stage})=>{
 const api=nativeNebulaMaterial,definition=nativeShipDefinitions.get(id),health=definition.hull*[1,.6,.4,.1][stage];let asset;
 if(definition.renderer){await nativeRepairVisuals.ensure();asset=nativeRepairVisuals.fogArtwork({entity:{hull:health}});}else asset=await vexedFlightAssets.loadShip(id,health);
 const mask=api.maskFor(asset),aspect=asset.art.width/asset.art.height,width=aspect>1?86:86*aspect,height=aspect>1?86/aspect:86;
 const numeric=api.maskForType(id,stage);if(!numeric||numeric.w!==mask.w||numeric.h!==mask.h)throw Error('Missing offscreen hull mask '+id+':'+stage);
 for(let i=0;i<mask.alpha.length;i++)if((mask.alpha[i]>=48)!==(numeric.alpha[i]>=48))throw Error('Stale offscreen hull mask '+id+':'+stage+' at '+i);
 window.__catalogFogField||=api.createField({minX:-200,minY:-150,width:400,height:300,cell:2});
 window.__catalogFogSource||=Object.assign(document.createElement('canvas'),{width:400,height:300});
 const source=__catalogFogSource,sg=source.getContext('2d');sg.fillStyle='rgba(70,120,105,.6)';sg.fillRect(0,0,400,300);
 const bodies=[{id:'a',pose:{x:-66,y:-5,heading:.63,width,height},mask},{id:'b',pose:{x:66,y:8,heading:-.4,width,height},mask}],view={w:400,h:300,cameraX:0,cameraY:0,zoom:1.65};
 const ref=document.createElement('canvas');ref.width=400;ref.height=300;const r=ref.getContext('2d',{willReadFrequently:true});
 for(const b of bodies){const p=b.pose;r.save();r.translate(200+p.x*view.zoom,150+p.y*view.zoom);r.rotate(p.heading+Math.PI/2);r.drawImage(asset.art,-p.width*view.zoom/2,-p.height*view.zoom/2,p.width*view.zoom,p.height*view.zoom);r.restore();}
 api.renderPair(view,source,__catalogFogField,bodies);const pair=api.renderPair(view,source,__catalogFogField,bodies),back=pair.back.getContext('2d',{willReadFrequently:true}).getImageData(0,0,400,300).data,front=pair.front.getContext('2d',{willReadFrequently:true}).getImageData(0,0,400,300).data,expected=r.getImageData(0,0,400,300).data;
 let opaque=0,leaks=0,falseClear=0;const leakPixels=[];
 for(let y=6;y<294;y++)for(let x=6;x<394;x++){
  const i=(y*400+x)*4+3;if(expected[i]>128){opaque++;if(back[i]>4||front[i]>4){leaks++;if(leakPixels.length<12)leakPixels.push({x,y,expected:expected[i],back:back[i],front:front[i]});}}
  if(expected[i])continue;let near=false;for(let dy=-2;dy<=2&&!near;dy++)for(let dx=-2;dx<=2;dx++)if(expected[((y+dy)*400+x+dx)*4+3]){near=true;break;}
  if(!near&&(back[i]<130||front[i]<40))falseClear++;
 }
 if(!opaque||leaks>3||falseClear>3)throw Error('All-hull fog mask failure '+JSON.stringify({id,stage,opaque,leaks,falseClear,leakPixels,metrics:api.metrics()}));
 return {id,stage,opaque,leaks,falseClear};
}'''

SETUP_DENSE = r'''count=>{
 const s=nativeNpcDev.getState(),p=vexedSolFlight.shipPosition(s);nativeShipMotion.stop(s);
 nativeDevFog.setPreset('vex');nativeDevFog.setColour('four');nativeDevFog.reset({ahead:0});
 const chosen=s.civilianTraffic.ships.filter(ship=>ship.hull>0&&ship.system===1&&!ship.journey).slice(0,count);
 if(chosen.length!==count)throw Error('Not enough existing Sol ships for fog fixture');
 chosen.forEach((ship,i)=>{nativeNpcLives.interrupt(s,ship,'shared fog test fixture');ship.scriptedDemo='benchmark';nativeShipMotion.stop(ship);
  const angle=i*Math.PI*2/count,radius=180+(i%3)*65;Object.assign(ship,{system:1,x:p.x+Math.cos(angle)*radius,y:p.y+Math.sin(angle)*radius,heading:angle+Math.PI/2,phase:'docked',timer:1e6,speed:0});nativeNpcLives.refreshLocation(s,ship);});
 nativeShipSystems.invalidate(s);window.__fogChosen=chosen.map(ship=>ship.id);
 return {population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,ids:chosen.map(ship=>ship.id)};
}'''

try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=not args.headed, **({'channel': channel} if channel else {}))
        report['browserVersion'] = browser.version
        report['displayModes'] = headed.display_modes()
        context = browser.new_context(**({'no_viewport': True} if args.headed else {'viewport': dict(width=1280, height=850)}), reduced_motion='no-preference')
        page = context.new_page()
        page.add_init_script('(' + stability.INSTRUMENT + ')()')

        page.add_init_script('''(()=>{let seed=4292026;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};})()''')
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.on('response', lambda r: report['failedRequests'].append(r.url) if r.status >= 400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        if args.headed:
            page.evaluate('''()=>{const b=document.createElement('button');b.id='fog-fullscreen';b.textContent='Start foreground fog test';b.style.cssText='position:fixed;top:8px;left:8px;z-index:999999;padding:18px';b.onclick=()=>document.documentElement.requestFullscreen().then(()=>b.remove());document.body.append(b);}''')
            page.locator('#fog-fullscreen').click()
            page.wait_for_function('()=>document.fullscreenElement')
            session = context.new_cdp_session(page)
            target = session.send('Browser.getWindowForTarget')
            session.send('Browser.setWindowBounds', {'windowId': target['windowId'], 'bounds': {'windowState': 'fullscreen'}})
            session.detach()
            page.bring_to_front()
            page.wait_for_function('()=>document.hasFocus()&&document.visibilityState==="visible"')
        page.evaluate(stability.INSTALL)
        page.evaluate('nativeDevFog.setEnabled(true)')
        page.wait_for_function('()=>nativeNpcDev.getState()?.devMode', timeout=120000)
        if args.performance and args.fixture.exists():
            page.evaluate(stability.SETUP, dict(saved=args.fixture.read_text(encoding='utf8'), mode='flight'))
        page.wait_for_function('()=>nativeDevFog.material()?.field.ready', timeout=120000)
        report['viewport'] = page.evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visible:document.visibilityState,focused:document.hasFocus(),fullscreen:!!document.fullscreenElement})')
        displays=report['displayModes'].get('displays',[])
        display=next((d for d in displays if d.get('primary')),None)
        v=report['viewport']
        report['nativeFullscreenVerified']=bool(args.headed and display and v['fullscreen'] and abs(v['width']*v['dpr']-display['width'])<=3*v['dpr'] and abs(v['height']*v['dpr']-display['height'])<=3*v['dpr'])
        report['display120Active']=bool(display and display.get('frequencyHz')==120)

        if not args.performance:
            page.locator('#devToolsBtn').click()
            report['frameControls'] = page.evaluate("""()=>{
              const fog=nativeDevFog;fog.resetFrameStats();const before=fog.frameDelivery();
              const show=document.querySelector('[data-dev-fog-frame-hud]'),reset=document.querySelector('[data-dev-fog-frame-reset]');
              if(!show||!reset)throw Error('Missing foreground frame controls');show.click();
              return {before,enabled:show.checked};
            }""")
            page.wait_for_timeout(150)
            assert page.evaluate('nativeDevFog.frameDelivery().frames') == 0, 'Paused tools recorded inactive frames'
            page.locator('[data-dev-fog-frame-reset]').click()
            assert page.evaluate('nativeDevFog.frameDelivery().frames') == 0
            definitions = page.evaluate('nativeShipDefinitions.registered().map(d=>d.id)')
            if args.types:
                definitions=[ship_type for ship_type in definitions if ship_type in set(map(int,args.types.split(',')))]
            for index, ship_type in enumerate(definitions):
                for stage in map(int, args.catalog_stages.split(',')):
                    report['catalog'].append(page.evaluate(CATALOG_CHECK, dict(id=ship_type, stage=stage)))
                if index % 20 == 0:
                    (OUT / f'{args.label}.json').write_text(json.dumps(report, indent=2))
                    print(json.dumps(dict(catalogChecked=index+1, total=len(definitions))), flush=True)
            report['catalogTypes'] = len(definitions)
            page.locator('#dialog [data-close]').click()
            page.wait_for_timeout(500)
            report['batchParity'] = page.evaluate('''async()=>{
              const api=nativeNebulaMaterial,m=nativeDevFog.material(),config={minX:-150,minY:-120,width:300,height:240,cell:2},reference=api.createField(config),worker=api.createRuntimeField(config),rgba=new Uint8ClampedArray(16*16*4);for(let i=0;i<256;i++)rgba[i*4+3]=160;
              reference.seed(rgba,16,16);worker.seed(rgba,16,16);const bodies=i=>[{id:'player',pose:{x:-85+i*2,y:-8,heading:0,width:24,height:38,speed:120},mask:m.mask},{id:'civilian:4',pose:{x:65-i*1.5,y:8,heading:Math.PI,width:35,height:56,speed:90},mask:m.mask}];
              for(let i=0;i<66;i++){reference.updateMany(bodies(i),1/60);worker.updateMany(bodies(i),1/60);if(i%12===11)await worker.flush();}await worker.flush();let error=0;for(let i=0;i<reference.density.length;i++)error=Math.max(error,Math.abs(reference.density[i]-worker.density[i]));if(error>1e-6)throw Error('Batch worker changed density '+error);
              for(let i=66;i<70;i++){reference.updateMany(bodies(i),1/60);worker.updateMany(bodies(i),1/60);}worker.forceFallback('batch recovery test');let recovery=0;for(let i=0;i<reference.density.length;i++)recovery=Math.max(recovery,Math.abs(reference.density[i]-worker.density[i]));if(recovery>1e-6)throw Error('Batch recovery lost a hull '+recovery);const result={error,recovery,actors:worker.metrics().actorCount,clock:worker.metrics().clock};worker.dispose();return result;
            }''')

        saved = args.fixture.read_text(encoding='utf8') if args.fixture.exists() else page.evaluate('JSON.stringify(nativeNpcDev.getState())')
        for run in range(args.runs if args.performance else 1):
            page.evaluate(stability.SETUP, dict(saved=saved, mode='flight'))
            page.wait_for_function('()=>nativeDevFog.material()?.mask&&nativeDevFog.material()?.field.ready', timeout=120000)
            setup = page.evaluate(SETUP_DENSE, args.crowd)
            page.wait_for_function('n=>(n===0||nativeDevFog.snapshot().shipCount>=n)&&nativeDevFog.snapshot().renderer.backend==="webgl2"', arg=0 if args.baseline else args.crowd+1, timeout=120000)
            page.wait_for_timeout(3000)
            before = page.evaluate('''()=>{const s=nativeNpcDev.getState();return {population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,fog:nativeDevFog.snapshot(),clock:nativeSimulation.seconds(s),debt:s.shipSimulation.schedule.pendingSeconds};}''')
            page.locator('#space').focus()
            page.keyboard.down('w')
            page.keyboard.down('d')
            page.evaluate('''()=>{window.__fogFocusEvents=[];for(const type of ['blur','visibilitychange'])addEventListener(type,()=>{if(__stability.record)__fogFocusEvents.push({type,focused:document.hasFocus(),visible:document.visibilityState});});window.__fogWarmFrames=nativeDevFog.frameDelivery?.()||null;nativeDevFog.resetFrameStats?.();__stability.frames=[];__stability.longTasks=[];__stability.record=true;window.__fogAt=performance.now();}''')
            page.wait_for_timeout((args.seconds if args.performance else 3) * 1000)
            row = page.evaluate('''()=>{__stability.record=false;const s=nativeNpcDev.getState();return {seconds:(performance.now()-__fogAt)/1000,frames:__stability.frames,longTasks:__stability.longTasks,population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,simulationSeconds:nativeSimulation.seconds(s),debt:s.shipSimulation.schedule.pendingSeconds,fog:nativeDevFog.snapshot(),focusEvents:__fogFocusEvents,monitor:nativeDevFog.frameDelivery?.()||null,warmupMonitor:__fogWarmFrames,visible:document.visibilityState,focused:document.hasFocus()};}''')
            page.keyboard.up('w')
            page.keyboard.up('d')
            row['before'] = before
            row['fps'] = len(row['frames']) / row['seconds']
            intervals = sorted(f['intervalMs'] for f in row['frames'] if f['intervalMs'] > 0)
            row['p95Ms'] = intervals[int(len(intervals)*.95)]
            row['p99Ms'] = intervals[int(len(intervals)*.99)]
            row['worstMs'] = max(intervals)
            row['overBudget'] = sum(ms > 1000/120*1.08 for ms in intervals)
            row['missedRefreshIntervals'] = sum(ms > 1000/120*1.5 for ms in intervals)
            row['simulationKeptUp'] = row['simulationSeconds']-before['clock']>=row['seconds']*.98 and row['debt']<=.1
            row['strict120WindowPass'] = bool(args.headed and report['nativeFullscreenVerified'] and report['display120Active'] and row['simulationKeptUp'] and row['fps'] >= 118 and row['overBudget'] == 0 and not row['focusEvents'] and row['focused'] and row['visible'] == 'visible')
            assert row['population'] == setup['population']
            if not args.baseline:
                assert row['fog']['material']['actorCount'] >= 2, row['fog']
            assert row['fog']['material']['transport'] == 'worker', row['fog']
            assert not row['fog'].get('missingMasks'), row['fog'].get('missingMasks')
            report['windows'].append(row)
            (OUT / f'{args.label}.json').write_text(json.dumps(report, indent=2))
            page.screenshot(path=str(OUT / f'{args.label}-{run+1}.png'))
            print(json.dumps(dict(run=run+1, fps=row['fps'], p95Ms=row['p95Ms'], overBudget=row['overBudget'], hulls=row['fog']['material'].get('actorCount',1), strict120WindowPass=row['strict120WindowPass'])), flush=True)
        assert not report['errors'], report['errors']
        assert not report['failedRequests'], report['failedRequests']
        report['passed'] = True
        report['strict120Pass'] = bool(args.headed and all(r['strict120WindowPass'] for r in report['windows']))
        (OUT / f'{args.label}.json').write_text(json.dumps(report, indent=2))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
