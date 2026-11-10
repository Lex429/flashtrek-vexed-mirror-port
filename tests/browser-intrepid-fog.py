"""Real Intrepid drift, nacelle inflow, conservative wake refill and artwork alignment."""
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'intrepid-fog'
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
        page = browser.new_page(viewport={'width': 1280, 'height': 850}, reduced_motion='no-preference')
        page.add_init_script('''{
          const getContext=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(kind,...args){const ctx=getContext.call(this,kind,...args);if(kind==='webgl2'&&this.dataset.nebulaMaterial)window.__materialGL=ctx;return ctx;};
        }''')
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('response', lambda r: failed.append(r.url) if r.status >= 400 else None)
        page.goto(base + '/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.nativeNebulaMaterial&&nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('''()=>{
          window.__legacyIntrepidDraws=0;const flow=nativeNebulaFlow;
          window.nativeNebulaFlow={...flow,render(...args){if(nativeNebulaMaterial.supported(nativeNpcDev.getState()?.shipType))__legacyIntrepidDraws++;return flow.render(...args);}};
          startNativeDevGame();
        }''')
        page.wait_for_function('()=>nativeNpcDev.getState()?.devMode', timeout=120000)

        def equip(ship_type):
            page.locator('#devToolsBtn').click()
            page.locator('[data-dev-ship]').select_option(str(ship_type))
            page.locator('[data-dev-equip]').click()
            page.wait_for_function('id=>nativeNpcDev.getState().shipType===id&&nativeDevFog.material()?.pose.shipType===id&&nativeDevFog.material()?.mask&&nativeDevFog.snapshot().renderer.mode==="shared-material"&&nativeDevFog.snapshot().renderer.backend==="webgl2"', arg=ship_type, timeout=120000)

        equip(438)
        assert page.evaluate('nativeNpcDev.getState().civilianTraffic.ships.length') == 1200
        page.locator('#devToolsBtn').click()
        page.locator('[data-dev-fog-reset]').click()
        page.locator('#dialog [data-close]').click()
        page.wait_for_function('()=>nativeDevFog.material()?.field.metrics().clock>.1', timeout=30000)
        start = page.evaluate('vexedSolFlight.shipPosition(nativeNpcDev.getState())')
        page.keyboard.down('w')
        try:
            page.wait_for_function('p=>{const q=vexedSolFlight.shipPosition(nativeNpcDev.getState());return Math.hypot(q.x-p.x,q.y-p.y)>700;}', arg=start, timeout=60000)
        finally:
            page.keyboard.up('w')
        cut = page.evaluate('''()=>{const m=nativeDevFog.material(),p={x:m.pose.x,y:m.pose.y};return {...p,density:m.field.sample(p.x,p.y),initial:m.field.sampleInitial(p.x,p.y)};}''')
        assert cut['initial'] > .03 and cut['density'] < .02, cut
        page.screenshot(path=str(OUT / 'forward-cut.png'))
        page.keyboard.down('s')
        try:
            page.wait_for_function('()=>nativeNpcDev.getState().motionDrift', timeout=10000)
        finally:
            page.keyboard.up('s')
        before_angle = page.evaluate('nativeNpcDev.getState().angle')
        page.keyboard.down('d')
        try:
            page.wait_for_function('a=>Math.abs(nativeNpcDev.getState().angle-a)>1.15', arg=before_angle, timeout=15000)
        finally:
            page.keyboard.up('d')
        drift_start = page.evaluate('vexedSolFlight.shipPosition(nativeNpcDev.getState())')
        page.wait_for_function('p=>{const q=vexedSolFlight.shipPosition(nativeNpcDev.getState());return Math.hypot(q.x-p.x,q.y-p.y)>25;}', arg=drift_start, timeout=10000)
        drift = page.evaluate('''p=>{const m=nativeDevFog.material(),q=vexedSolFlight.shipPosition(nativeNpcDev.getState()),v={x:q.x-p.x,y:q.y-p.y},axis={x:Math.cos(m.pose.heading),y:Math.sin(m.pose.heading)};return {pose:m.pose,travel:v,headingCosine:(v.x*axis.x+v.y*axis.y)/Math.hypot(v.x,v.y)};}''', drift_start)
        assert abs(drift['headingCosine']) < .6, drift
        page.screenshot(path=str(OUT / 'sideways-drift.png'))
        page.keyboard.down('x')
        try:
            page.wait_for_function('()=>Math.abs(nativeNpcDev.getState().speed)<.1', timeout=30000)
        finally:
            page.keyboard.up('x')
        stopped_clock = page.evaluate('nativeDevFog.material().field.metrics().clock')
        refill = []
        for seconds in [.5, 2, 5, 10, 15]:
            page.wait_for_function('a=>nativeDevFog.material().field.metrics().clock-a.start>a.seconds', arg=dict(start=stopped_clock, seconds=seconds), timeout=45000)
            refill.append(page.evaluate('''async p=>{const m=nativeDevFog.material();await m.field.flush?.();return {clock:m.field.metrics().clock,density:m.field.sample(p.x,p.y)};}''', cut))
        persistence = page.evaluate('p=>{const m=nativeDevFog.material();return {remaining:m.field.sample(p.x,p.y),initial:m.field.sampleInitial(p.x,p.y),audit:m.field.metrics(true)};}', cut)
        assert persistence['remaining'] > max(.025, persistence['initial'] * .1), persistence
        assert abs(persistence['audit']['mass'] - persistence['audit']['initialMass']) / persistence['audit']['initialMass'] < .0001, persistence
        page.screenshot(path=str(OUT / 'stopped-refilling-wake.png'))
        page.keyboard.press('Escape')
        page.wait_for_function('()=>nativePause.active')
        paused = page.evaluate('nativeDevFog.material().field.metrics().clock')
        page.wait_for_timeout(200)
        assert page.evaluate('nativeDevFog.material().field.metrics().clock') == paused
        page.keyboard.press('Escape')
        page.wait_for_function('()=>!nativePause.active')
        alignments = []
        gap_flow = []
        for ship_type in [438, 439, 36]:
            if ship_type != 438:
                equip(ship_type)
            gap_flow.append(page.evaluate('''()=>{
              const api=nativeNebulaMaterial,m=nativeDevFog.material(),mask=m.mask,points=[];
              // Independent samples from alpha openings, not the solver's
              // selected surface-stream anchors.
              for(let y=Math.floor(mask.h*.53);y<mask.h*.94;y+=7){
                let left=0,right=mask.w-1;while(left<mask.w&&mask.alpha[y*mask.w+left]<48)left++;while(right>left&&mask.alpha[y*mask.w+right]<48)right--;
                for(let x=left;x<=right;x++)if(mask.alpha[y*mask.w+x]<48){const first=x;while(x<=right&&mask.alpha[y*mask.w+x]<48)x++;
                  if(x-first>=4)for(const t of [.35,.65])points.push({u:(first+(x-first)*t)/mask.w,v:(y+.5)/mask.h});}
              }
              const rows=[];
              for(const heading of [0,.63])for(const speed of [120,270,427.5]){
                const field=api.createField({minX:-220,minY:-220,width:440,height:440,cell:2}),c=Math.cos(heading),s=Math.sin(heading),pose={...m.pose,x:-160*c,y:-160*s,heading,speed};
                field.update(pose,mask,1/30);for(let step=1;step<=Math.ceil(240*30/speed);step++){const distance=step*speed/30-160;pose.x=distance*c;pose.y=distance*s;field.update(pose,mask,1/30);}
                const sample=point=>{const lx=(point.u-.5)*pose.width,ly=(.5-point.v)*pose.height;return field.sample(pose.x+c*ly-s*lx,pose.y+s*ly+c*lx);};
                const sides=[-1,1].map(sign=>{const values=points.filter(p=>Math.sign(p.u-.5)===sign).map(sample);return {count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,filled:values.filter(d=>d>.08).length/values.length};});
                if(sides.some(side=>!side.count||side.mean<.10||side.filled<.25))throw Error('Intrepid nacelle openings did not receive fog: '+JSON.stringify({shipType:pose.shipType,heading,speed,sides}));
                const cp=field.checkpoint();let energy=0,mass=0,bowPeak=0;
                for(let y=0;y<field.h;y++)for(let x=0;x<field.w;x++){const i=y*field.w+x,wx=field.minX+(x+.5)*field.cell,wy=field.minY+(y+.5)*field.cell,dx=wx-pose.x,dy=wy-pose.y,along=dx*c+dy*s,across=dy*c-dx*s,d=field.density[i];
                  if(Math.abs(along)<pose.height*.7&&Math.abs(across)<pose.width*.9){energy+=d*(cp.u[i]*cp.u[i]+cp.v[i]*cp.v[i]);mass+=d;}
                  if(along>0&&along<pose.height*.6&&Math.abs(across)<pose.width*.6&&!api.occupied(mask,pose,wx,wy))bowPeak=Math.max(bowPeak,d);
                }
                const drive=field.metrics(),wake={x:pose.x-c*pose.height*.65,y:pose.y-s*pose.height*.65},before=field.sample(wake.x,wake.y);
                for(let i=0;i<180;i++)field.update({...pose,speed:0},mask,1/30);
                const after=field.sample(wake.x,wake.y),audit=field.metrics(true);
                if(after<.08||after<=before+.02)throw Error('The wake did not flood from neighboring fog: '+JSON.stringify({before,after,heading,speed}));
                if(Math.abs(audit.mass-audit.initialMass)/audit.initialMass>1e-5)throw Error('Inflow created gas');
                rows.push({heading,speed,sides,flowEnergy:energy/mass,bowPeak,drive,wake:{before,after},massError:audit.mass-audit.initialMass});
              }
              for(const heading of [0,.63]){const cases=rows.filter(r=>r.heading===heading),slow=cases[0],fast=cases[cases.length-1];
                if(fast.flowEnergy<slow.flowEnergy*1.5||fast.drive.fastFlow<.6)throw Error('Fast Intrepid flow did not gain force: '+JSON.stringify(cases));}
              return {shipType:m.pose.shipType,rows};
            }'''))
            alignment = page.evaluate('''()=>{
              const api=nativeNebulaMaterial,m=nativeDevFog.material(),field=api.createField({minX:-200,minY:-200,width:400,height:400,cell:1}),source=document.createElement('canvas');source.width=400;source.height=400;source.getContext('2d').fillStyle='rgba(70,120,105,.6)';source.getContext('2d').fillRect(0,0,400,400);
              const reference=document.createElement('canvas'),output=document.createElement('canvas');reference.width=output.width=400;reference.height=output.height=400;
              const ref=reference.getContext('2d',{willReadFrequently:true}),ctx=output.getContext('2d',{willReadFrequently:true}),results=[];
              for(const zoom of [1,2.2])for(const heading of [0,Math.PI/2,.63,Math.PI]){
                const pose={...m.pose,x:0,y:0,heading},view={w:400,h:400,cameraX:0,cameraY:0,zoom};
                ref.clearRect(0,0,400,400);ref.save();ref.translate(200,200);ref.rotate(heading+Math.PI/2);ref.drawImage(m.mask.art,-pose.width*zoom/2,-pose.height*zoom/2,pose.width*zoom,pose.height*zoom);ref.restore();
                ctx.clearRect(0,0,400,400);ctx.drawImage(api.render(view,source,field,pose,m.mask,1),0,0,400,400);
                const expected=ref.getImageData(0,0,400,400).data,actual=ctx.getImageData(0,0,400,400).data;let opaque=0,leaks=0,falseClear=0,checkedOutside=0;
                for(let y=3;y<397;y++)for(let x=3;x<397;x++){const i=(y*400+x)*4;
                  if(expected[i+3]>128){opaque++;if(actual[i+3]>4)leaks++;}
                  if(expected[i+3]!==0)continue;let near=false;for(let oy=-2;oy<=2&&!near;oy++)for(let ox=-2;ox<=2;ox++)if(expected[((y+oy)*400+x+ox)*4+3]>0){near=true;break;}
                  if(!near){checkedOutside++;if(actual[i+3]<150)falseClear++;}
                }
                if(!opaque||leaks>2||falseClear>2)throw Error('Hull mask misalignment: '+JSON.stringify({heading,zoom,opaque,leaks,falseClear}));
                results.push({heading,zoom,opaque,leaks,falseClear,checkedOutside});
              }
              const pose={...m.pose,x:0,y:0,heading:0},view={w:400,h:400,cameraX:0,cameraY:0,zoom:2.2};
              Object.defineProperties(field,{pendingMasks:{value:[{...pose,x:-pose.height*.35,mask:m.mask},{...pose,mask:m.mask}]},pendingRevision:{value:'lagged-hull-pixel-test'}});
              ctx.clearRect(0,0,400,400);ctx.drawImage(api.render(view,source,field,pose,m.mask,1),0,0,400,400);
              const before=ctx.getImageData(0,0,400,400).data;api.clearPending(ctx,view,field,pose);const after=ctx.getImageData(0,0,400,400).data;
              let openingBefore=0,openingAfter=0,openingPixels=0;
              for(let y=Math.floor(m.mask.h*.53);y<m.mask.h*.94;y+=7){let left=0,right=m.mask.w-1;while(left<m.mask.w&&m.mask.alpha[y*m.mask.w+left]<48)left++;while(right>left&&m.mask.alpha[y*m.mask.w+right]<48)right--;
                for(let x=left;x<=right;x++)if(m.mask.alpha[y*m.mask.w+x]<48){const first=x;while(x<=right&&m.mask.alpha[y*m.mask.w+x]<48)x++;if(x-first<4)continue;
                  const px=Math.floor(200+(.5-(y+.5)/m.mask.h)*pose.height*view.zoom),py=Math.floor(200+((first+x)*.5/m.mask.w-.5)*pose.width*view.zoom),i=(py*400+px)*4+3;
                  openingBefore+=before[i];openingAfter+=after[i];openingPixels++;}
              }
              const pendingOpeningRatio=openingAfter/openingBefore;
              if(!openingPixels||pendingOpeningRatio<.95)throw Error('Pending hull history erased current nacelle gaps: '+JSON.stringify({openingPixels,pendingOpeningRatio}));
              window.__alignmentFixture={view:{...view,zoom:1},source,field,pose,mask:m.mask};
              window.__materialLoss=__materialGL.getExtension('WEBGL_lose_context');return {shipType:nativeNpcDev.getState().shipType,dimensions:{width:m.pose.width,height:m.pose.height},results,pendingOpeningRatio};
            }''')
            alignments.append(alignment)
        worker_transport = page.evaluate('''async()=>{
          const api=nativeNebulaMaterial,mask=nativeDevFog.material().mask,config={minX:-280,minY:-120,width:560,height:240,cell:2,uniform:0};
          const reference=api.createField(config),transport=api.createRuntimeField(config),rgba=new Uint8ClampedArray(16*16*4);
          for(let i=0;i<16*16;i++)rgba[i*4+3]=160;
          reference.seed(rgba,16,16);transport.seed(rgba,16,16);
          const pose=i=>({x:-180+i*5,y:-20+Math.sin(i*.12)*15,heading:i*.04,width:32,height:51,speed:200});
          for(let batch=0;batch<8;batch++){
            for(let i=batch*8;i<(batch+1)*8;i++){reference.update(pose(i),mask,.025);transport.update(pose(i),mask,.025);}
            await transport.flush();
          }
          const mode=transport.metrics().transport;
          if(mode!=='worker')throw Error('Worker not active: '+JSON.stringify(transport.metrics()));
          let error=0;for(let i=0;i<reference.density.length;i++)error=Math.max(error,Math.abs(reference.density[i]-transport.density[i]));
          if(error>1e-6)throw Error('Off-thread solver changed material: '+error);
          if(transport.metrics().fastFlow<.05)throw Error('Worker parity did not exercise speed response');
          for(let i=64;i<72;i++){reference.update(pose(i),mask,.025);transport.update(pose(i),mask,.025);}
          transport.forceFallback('deliberate recovery test');await transport.flush();let recoveryError=0;
          for(let i=0;i<reference.density.length;i++)recoveryError=Math.max(recoveryError,Math.abs(reference.density[i]-transport.density[i]));
          if(recoveryError>1e-6)throw Error('Worker recovery lost material or queued poses: '+recoveryError);
          const result={mode,error,recoveryError,recovered:transport.metrics().transport==='synchronous-fallback',clock:transport.metrics().clock,fastFlow:transport.metrics().fastFlow};transport.dispose();return result;
        }''')
        page.evaluate('__materialLoss.loseContext()')
        page.wait_for_function('()=>nativeNebulaMaterial.metrics().contextLost', timeout=30000)
        fallback = page.evaluate('''()=>{const a=__alignmentFixture;nativeNebulaMaterial.render(a.view,a.source,a.field,a.pose,a.mask,1);return nativeNebulaMaterial.metrics();}''')
        assert fallback['backend'] == 'canvas-material', fallback
        page.evaluate('__materialLoss.restoreContext()')
        page.wait_for_function('()=>!nativeNebulaMaterial.metrics().contextLost', timeout=30000)
        page.wait_for_function('()=>nativeDevFog.snapshot().renderer.backend==="webgl2"', timeout=30000)
        assert page.evaluate('__legacyIntrepidDraws') == 0
        assert not errors, errors
        assert not failed, failed
        report = dict(passed=True, cut=cut, drift=drift, persistence=persistence, refill=refill, gapFlow=gap_flow, alignments=alignments, workerTransport=worker_transport, pauseStable=True, legacyVDraws=0, gpuRestored=True, errors=errors)
        (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
        print(json.dumps(report))
        browser.close()
finally:
    if server:
        server.shutdown()
        server.server_close()
