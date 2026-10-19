"""Role lights, tier progression, clipped spill, actual weapon/welding activity."""
import functools
import http.server
import json
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / ('drone-lighting-installed' if len(sys.argv) > 1 else 'drone-lighting')
OUTPUT.mkdir(parents=True, exist_ok=True)
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = None
if len(sys.argv) > 1:
    base = sys.argv[1].rstrip('/')
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1050})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""(() => {
          let callbacks=[],now;const original=requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>{if(callback.name!=='frame')return original(callback);callbacks.push(callback);return callbacks.length;};
          window.advanceShowcase=seconds=>{now??=performance.now();for(let i=0;i<Math.ceil(seconds*60);i++){
            now+=1000/60;const batch=callbacks;callbacks=[];batch.forEach(callback=>callback(now));
          }};
        })();""")
        page.goto(base + '/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=500')
        page.wait_for_function('window.showcaseState && showcaseState().ready', polling=50)
        inventory = page.evaluate('JSON.stringify(repairDroneFleet.read())')
        pixels = page.evaluate("""() => {
          const results={},gallery=document.createElement('div');gallery.id='lighting-gallery';gallery.style.cssText='position:absolute;left:0;top:0;z-index:999;background:#07121a;display:grid;grid-template-columns:repeat(4,240px);gap:8px;padding:12px';
          const render=(tier,role,options={})=>{const c=document.createElement('canvas');c.width=c.height=512;droneSprites.drawSurface(c.getContext('2d'),tier,{role,time:1234,effects:false,...options});return c;};
          const data=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,512,512).data;
          const energy=(pixels,{x,y},radius=16)=>{let sum=0;for(let yy=Math.max(0,Math.floor(y-radius));yy<Math.min(512,y+radius);yy++)for(let xx=Math.max(0,Math.floor(x-radius));xx<Math.min(512,x+radius);xx++){const i=(yy*512+xx)*4;sum+=(pixels[i]+pixels[i+1]+pixels[i+2])*pixels[i+3]/255;}return sum;};
          for(const role of ['repair','attack','defense'])for(const tier of ['basic','upgraded','advanced']){
            const off=render(tier,role,{lights:false}),idle=render(tier,role),active=render(tier,role,{activity:1,thrust:1}),dead=render(tier,role,{health:0,activity:1,thrust:1});
            const a=data(off),b=data(idle),c=data(active),light=droneSprites.lightState(tier,role,100,100,1234,{activity:1,thrust:1});
            let opaque=0,changed=0,outside=0,statusPixels=0;
            for(let i=0;i<a.length;i+=4){if(a[i+3]>180)opaque++;const delta=Math.max(b[i]-a[i],b[i+1]-a[i+1],b[i+2]-a[i+2]);if(delta>25)changed++;if(!a[i+3]&&b[i+3])outside++;}
            if(outside)throw Error(role+tier+' idle light paints missing armor/space');
            if(changed<100||changed>opaque*.32)throw Error(role+tier+' light spill is absent or washes out hull '+changed+'/'+opaque);
            for(let y=357;y<376;y++)for(let x=242;x<271;x++){const i=(y*512+x)*4,k=role==='attack'?0:role==='repair'?1:2;if(b[i+k]-a[i+k]>35)statusPixels++;}
            if(statusPixels<2)throw Error(role+tier+' role status lights absent');
            if(light.status.filter(x=>x.on).length!==({basic:1,upgraded:3,advanced:5})[tier])throw Error('upgrade status indicators missing');
            if(light.engines.some(x=>!x.on))throw Error(role+tier+' exhaust anchor outside hull');
            const engine=light.engines[0],tool=light.tools[0];
            if(energy(c,engine)<=energy(b,engine)*1.015)throw Error(role+tier+' engine does not respond to thrust');
            if(energy(c,tool)<=energy(b,tool)*1.02)throw Error(role+tier+' working tool has no local spill');
            const disabled=render(tier,role,{lights:false,activity:1,thrust:1});if(disabled.toDataURL()!==off.toDataURL())throw Error('lights toggle does not disable working lights');
            if(dead.toDataURL()!==render(tier,role,{health:0,time:7654,activity:1,thrust:1}).toDataURL())throw Error('dead powered lighting');
            const counts=[100,65,40,15,0].map(health=>{const l=droneSprites.lightState(tier,role,health,100,1234);return l.status.filter(x=>x.on).length+l.engines.filter(x=>x.on).length;});
            if(counts[4]||counts[3]>=counts[0]||counts[2]>counts[1])throw Error('hardware does not fail with damage');
            for(const [label,canvas] of [['Lights off',off],['Idle',idle],['Tools active',active],['Destroyed',dead]]){const tile=document.createElement('div'),title=document.createElement('div');title.textContent=role+' / '+tier+' / '+label;title.style.cssText='color:#c8e0eb;font:11px sans-serif';canvas.style.cssText='width:240px;height:240px';tile.append(title,canvas);gallery.append(tile);}
            results[role+'-'+tier]={statusPixels,changed,opaque,hardwareByStage:counts,color:light.color};
          }document.body.append(gallery);return results;
        }""")
        page.locator('#lighting-gallery').screenshot(path=str(OUTPUT / 'nine-model-lighting.png'))
        page.evaluate("document.getElementById('lighting-gallery').remove()")
        page.locator('#fleet-filter').select_option('drones')
        for drone_id in range(500, 509):
            page.locator('#ship-select').select_option(str(drone_id))
            page.wait_for_function('(id)=>showcaseState().ready&&showcaseState().ship===id', arg=drone_id)
            page.locator('#drone-light-demo').click()
            seen = False
            for _ in range(24):
                page.evaluate('advanceShowcase(.05)')
                seen |= page.evaluate('showcaseState().droneInspection.lighting.activity>0')
            assert seen, drone_id
            if drone_id in [502,505,508]:
                page.locator('#scene').screenshot(path=str(OUTPUT / f'main-{drone_id}.png'))
            page.locator('#pause').click()
            page.evaluate('advanceShowcase(.02)')
            frozen = page.locator('#scene').evaluate('(c)=>c.toDataURL()')
            before = page.evaluate('JSON.stringify(showcaseState())')
            page.evaluate('advanceShowcase(.5)')
            assert frozen == page.locator('#scene').evaluate('(c)=>c.toDataURL()')
            assert before == page.evaluate('JSON.stringify(showcaseState())')
            page.locator('#pause').click()
            page.locator('#ship-lights').click()
            page.evaluate('advanceShowcase(.02)')
            assert page.evaluate('showcaseState().droneInspection.lighting.activity') == 0
            page.locator('#ship-lights').click()
        assert inventory == page.evaluate('JSON.stringify(repairDroneFleet.read())')
        # Real deployed activity reaches the same shared renderer, with actual shot barrels.
        page.locator('#fleet-filter').select_option('all')
        page.locator('#ship-select').select_option('1')
        page.wait_for_function('showcaseState().ready&&showcaseState().ship===1')
        saved = {'version': 2, 'credits': 6000, 'owned': {'basic': 0, 'upgraded': 0, 'advanced': 1},
                 'defense': {'basic': 0, 'upgraded': 0, 'advanced': 1}, 'wave': {'basic': 0, 'upgraded': 0, 'advanced': 2}}
        page.evaluate('(s)=>localStorage.setItem("vexedMirrorRepairWorkshop.v1",JSON.stringify(s))', saved)
        page.goto(base + '/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=1')
        page.wait_for_function('window.showcaseState&&showcaseState().ready&&showcaseState().ship===1')
        page.evaluate("""() => {
          const original=window.droneSprites;window.lightDraws=[];
          window.droneSprites={...original,draw(ctx,tier,options){if(options.activity>0)lightDraws.push({tier,...options});return original.draw(ctx,tier,options);}};
        }""")
        page.locator('button[data-stage="3"]').click()
        page.locator('.drone-workshop-launch').click()
        sampled = page.evaluate("""() => {
          let flashes=0,barrels=new Set();for(let i=0;i<600;i++){
            advanceShowcase(1/60);const battle=showcaseState().droneBattle;if(!battle)continue;
            for(const d of battle.drones)if(d.firedAt!==null&&battle.time-d.firedAt<150){
              if(d.firedBarrel===null)throw Error('missing real firing barrel');
              barrels.add(d.role+':'+d.firedBarrel);flashes++;
            }
          }return {flashes,barrels:[...barrels],roles:[...new Set(lightDraws.map(x=>x.role))],welding:lightDraws.some(x=>x.role==='repair'&&x.activity===1)};
        }""")
        assert set(sampled['roles']) == {'repair', 'attack', 'defense'}, sampled
        assert sampled['flashes'] > 0 and sampled['welding'], sampled
        page.locator('#scene').screenshot(path=str(OUTPUT / 'deployed-lighting.png'))
        assert not errors, errors
        print(json.dumps({'models': pixels, 'mainPreviewControls': True, 'pauseAndToggle': True, 'previewInventoryUnchanged': True, 'actualDeployedLighting': sampled, 'browserErrors': errors}))
        browser.close()
finally:
    if server:
        server.shutdown()
