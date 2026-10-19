"""Painted Basic Dot stages, pre-damage pixel fragments and scar-local events."""
import functools
import http.server
import json
import math
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/('dot-basic-painted-installed' if len(sys.argv)>1 else 'dot-basic-painted')
OUTPUT.mkdir(parents=True,exist_ok=True)
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args): pass
server=None
if len(sys.argv)>1: base=sys.argv[1].rstrip('/')
else:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1050})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.add_init_script("""(()=>{
          let callbacks=[],now;const original=requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>{if(callback.name!=='frame')return original(callback);callbacks.push(callback);return callbacks.length;};
          window.advanceShowcase=seconds=>{now??=performance.now();for(let i=0;i<Math.ceil(seconds*60);i++){now+=1000/60;const batch=callbacks;callbacks=[];batch.forEach(callback=>callback(now));}};
        })();""")
        page.goto(base+'/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=500')
        page.wait_for_function('window.showcaseState&&showcaseState().ready')
        inventory=page.evaluate('JSON.stringify(repairDroneFleet.read())')
        pixel_audit=page.evaluate("""()=>{
          const render=health=>{const c=document.createElement('canvas');c.width=c.height=512;droneSprites.drawSurface(c.getContext('2d'),'basic',{role:'repair',health,lights:false,effects:false});return c;};
          const frames=[100,65,40,15].map(render),data=frames.map(c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,512,512).data),report=[];
          const gallery=document.createElement('div');gallery.id='painted-gallery';gallery.style.cssText='position:absolute;left:0;top:0;z-index:999;display:flex;background:#08141d;gap:8px;padding:12px';
          frames.forEach((c,i)=>{const tile=document.createElement('div'),label=document.createElement('div');label.textContent=['Intact','Light','Heavy','Severe'][i];label.style.cssText='font:13px sans-serif;color:#d2e7ed';c.style.cssText='width:300px;height:300px';tile.append(label,c);gallery.append(tile);});document.body.append(gallery);
          for(let s=1;s<=3;s++){
            const changes=droneSprites.damageChange('basic','repair',s-1,s);if(!changes.pieces.length||!changes.sites.length)throw Error('missing transition '+s);
            let checked=0;
            for(const piece of changes.pieces){const rgba=piece.texture.getContext('2d').getImageData(0,0,piece.texture.width,piece.texture.height).data;
              for(let y=0;y<piece.texture.height;y++)for(let x=0;x<piece.texture.width;x++){const i=(y*piece.texture.width+x)*4,j=((piece.source.y+y)*512+piece.source.x+x)*4;if(rgba[i+3]<250||data[s-1][j+3]<250)continue;
                for(let k=0;k<3;k++)if(Math.abs(rgba[i+k]-data[s-1][j+k])>2)throw Error('fragment pixels do not match previous armor');checked++;
              }
            }
            if(checked<2)throw Error('no source pixels checked');
            report.push({stage:s,pieces:changes.pieces.length,sites:changes.sites.length,sourcePixelsChecked:checked});
          }
          if(droneSprites.damageChange('basic','repair',0,3).pieces.length!==report.reduce((n,r)=>n+r.pieces,0))throw Error('skipped stages lose pieces');
          if(droneSprites.damageChange('basic','repair',3,1).pieces.length)throw Error('healing emits damage');
          if(droneSprites.damageChange('advanced','repair',0,3).pieces.length)throw Error('other model acquired Basic artwork');
          // The central service spine, intact tools and untouched right shoulder stay registered.
          let fixed=0;
          for(const [x,y,w,h] of [[237,250,24,35],[382,273,13,23],[414,80,9,12]])for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
            const i=(yy*512+xx)*4;for(let s=1;s<4;s++)for(let k=0;k<4;k++)if(Math.abs(data[s][i+k]-data[0][i+k])>1)throw Error('unchanged hull moved at '+[s,xx,yy,k,data[0][i+k],data[s][i+k]]);fixed++;
          }
          return {transitions:report,unchangedPixelsChecked:fixed};
        }""")
        page.locator('#painted-gallery').screenshot(path=str(OUTPUT/'four-painted-stages.png'))
        page.evaluate("document.getElementById('painted-gallery').remove()")
        stage_results=[]
        for stage in [1,2,3]:
            page.locator('#repair').click()
            page.locator(f'button[data-stage="{stage}"]').click()
            state=page.evaluate('showcaseState()')
            fx=state['droneInspection']['damageEffects']
            assert fx['pieces'] and fx['flashes'] and fx['sparks'] and fx['smoke'],fx
            assert sorted(set(p['stage'] for p in fx['pieces']))==list(range(1,stage+1))
            # Main preview origin must equal the fragment's own source rectangle center.
            for piece in fx['pieces']:
                expected_x=540+((piece['source']['x']+piece['source']['width']/2)/512-.5)*330
                expected_y=253+((piece['source']['y']+piece['source']['height']/2)/512-.5)*330
                assert abs(piece['origin']['x']-expected_x)<1e-6,(piece,expected_x)
                assert abs(piece['origin']['y']-expected_y)<1e-6,(piece,expected_y)
            page.evaluate('advanceShowcase(.08)')
            page.locator('#scene').screenshot(path=str(OUTPUT/f'stage-{stage}-impact.png'))
            page.locator('#pause').click()
            before=page.evaluate('JSON.stringify(showcaseState())')
            page.evaluate('advanceShowcase(.02)')
            image=page.locator('#scene').evaluate('(c)=>c.toDataURL()')
            page.evaluate('advanceShowcase(.7)')
            assert before==page.evaluate('JSON.stringify(showcaseState())')
            assert image==page.locator('#scene').evaluate('(c)=>c.toDataURL()')
            page.locator('#pause').click()
            page.evaluate('advanceShowcase(3)')
            assert not page.evaluate('showcaseState().droneInspection.damageEffects.pieces.length')
            assert not page.evaluate('showcaseState().droneInspection.damageEffects.sparks')
            stage_results.append({'stage':stage,'pieces':len(fx['pieces']),'scarFlashes':fx['flashes']})
        # Physical weapon hit, rotating and zoomed scar origins, and healing.
        page.locator('#repair').click()
        page.locator('#rotate').click()
        page.evaluate('advanceShowcase(.6)')
        page.locator('#rotate').click()
        page.locator('#zoom').evaluate("e=>{e.value=150;e.dispatchEvent(new Event('input'))}")
        page.locator('#weapon-select').select_option('beam:0',force=True)
        page.evaluate("for(let e=document.getElementById('visual-damage').parentElement;e;e=e.parentElement)if(e.tagName==='DETAILS')e.open=true")
        page.locator('#visual-damage').check()
        page.locator('#hit-strength').evaluate("e=>{e.value=35;e.dispatchEvent(new Event('input'))}")
        page.locator('#fire-weapon').click()
        page.evaluate('advanceShowcase(.13)')
        s=page.evaluate('showcaseState()')
        assert s['stage']==1 and s['droneInspection']['damageEffects']['pieces']
        for piece in s['droneInspection']['damageEffects']['pieces']:
            nx=((piece['source']['x']+piece['source']['width']/2)/512-.5)*495
            ny=((piece['source']['y']+piece['source']['height']/2)/512-.5)*495
            assert abs(piece['origin']['x']-(540+nx*math.cos(s['angle'])-ny*math.sin(s['angle'])))<1e-6
            assert abs(piece['origin']['y']-(253+nx*math.sin(s['angle'])+ny*math.cos(s['angle'])))<1e-6
        page.locator('#hull').evaluate("e=>{e.value=100;e.dispatchEvent(new Event('input'))}")
        assert not page.evaluate('showcaseState().droneInspection.damageEffects.pieces.length')
        assert inventory==page.evaluate('JSON.stringify(repairDroneFleet.read())')
        # Destruction uses the actual ship emitter, with the drone's own fragments.
        page.locator('#reset').click()
        page.locator('#destroy').click()
        explosion=page.evaluate('showcaseState().droneInspection.explosion')
        assert explosion['core']==1 and explosion['blasts']>=12 and explosion['sparks']>=250,explosion
        assert explosion['fire']>=36 and explosion['smoke']>=48 and explosion['wreckCount']>=12,explosion
        assert explosion['blast']['zoom']==1
        page.evaluate('advanceShowcase(.06)')
        page.locator('#scene').screenshot(path=str(OUTPUT/'ship-scale-explosion.png'))
        page.locator('#pause').click()
        paused=page.evaluate('JSON.stringify(showcaseState())')
        page.evaluate('advanceShowcase(.02)')
        frozen=page.locator('#scene').evaluate('(c)=>c.toDataURL()')
        page.evaluate('advanceShowcase(.8)')
        assert paused==page.evaluate('JSON.stringify(showcaseState())')
        assert frozen==page.locator('#scene').evaluate('(c)=>c.toDataURL()')
        page.locator('#pause').click()
        page.evaluate('advanceShowcase(.3)')
        page.locator('#scene').screenshot(path=str(OUTPUT/'ship-explosion-secondary-blasts.png'))
        page.locator('#repair').click()
        assert page.evaluate('showcaseState().droneInspection.explosion.particles')==0
        assert page.evaluate('showcaseState().droneInspection.explosion.blast') is None
        assert inventory==page.evaluate('JSON.stringify(repairDroneFleet.read())')
        # Deployed green Basic uses the same painted atlas and effect positions.
        page.goto(base+'/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=1')
        page.wait_for_function('showcaseState().ready&&showcaseState().ship===1')
        page.locator('#drone-auto-attack').uncheck()
        page.locator('button[data-stage="3"]').click()
        page.locator('.drone-workshop-launch').click()
        page.evaluate('advanceShowcase(3)')
        page.locator('#repair-attack-target').select_option('0')
        page.locator('#weapon-select').select_option('beam:0',force=True)
        page.evaluate("for(let e=document.getElementById('visual-damage').parentElement;e;e=e.parentElement)if(e.tagName==='DETAILS')e.open=true")
        page.locator('#visual-damage').check()
        page.locator('#hit-strength').evaluate("e=>{e.value=35;e.dispatchEvent(new Event('input'))}")
        page.locator('#drone-test-fire').click()
        page.evaluate('advanceShowcase(.13)')
        deployed=page.evaluate('showcaseState().repair')
        assert deployed['drones'][0]['damageStage']==1 and deployed['damageEffects']['pieces'] and deployed['damageEffects']['smoke']
        assert all(p['sourceId']==0 for p in deployed['damageEffects']['pieces'])
        for piece in deployed['damageEffects']['pieces']:
            cx=(piece['source']['x']+piece['source']['width']/2)/512*1254
            cy=(piece['source']['y']+piece['source']['height']/2)/512*1254
            lx,ly=(755-cy)*.033,(cx-627)*.033
            pose=piece['pose']
            assert abs(piece['origin']['x']-(pose['x']+lx*math.cos(pose['heading'])-ly*math.sin(pose['heading'])))<1e-6
            assert abs(piece['origin']['y']-(pose['y']+lx*math.sin(pose['heading'])+ly*math.cos(pose['heading'])))<1e-6
        page.locator('#scene').screenshot(path=str(OUTPUT/'deployed-basic-hit.png'))
        page.locator('#hit-strength').evaluate("e=>{e.value=50;e.dispatchEvent(new Event('input'))}")
        for _ in range(2):
            page.locator('#drone-test-fire').click()
            page.evaluate('advanceShowcase(.13)')
        death=page.evaluate('showcaseState().repair')
        assert death['destruction']['core']==1 and death['destruction']['blasts']>=12,death['destruction']
        assert death['destruction']['sparks']>=250 and death['texturedWreckCount']>=12
        assert death['destruction']['shockwaves']==1
        assert page.evaluate('repairDroneFleet.read().owned.basic')==0
        page.locator('#scene').screenshot(path=str(OUTPUT/'deployed-ship-explosion.png'))
        page.evaluate('advanceShowcase(3)')
        remains=page.evaluate('showcaseState().repair||showcaseState().repairRemainder')
        assert remains['destruction']['particles']==0 and remains['destruction']['wreckCount']>0
        page.evaluate('advanceShowcase(10)')
        remains=page.evaluate('showcaseState().repair||showcaseState().repairRemainder')
        assert remains['destruction']['wreckCount']==0
        assert not errors,errors
        print(json.dumps({'paintedSprites':pixel_audit,'stageAnimations':stage_results,'realWeaponHit':True,'pauseAndExpiry':True,'healingClearsEffects':True,'deployedBasicSharesEffects':True,'previewInventoryUnchanged':True,'shipExplosion':explosion,'deployedShipExplosion':death['destruction'],'browserErrors':errors}))
        browser.close()
finally:
    if server:server.shutdown()
