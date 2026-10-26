"""Seeded GPU paths, overlap, pause, bounded resources and real native A/B load."""
import functools
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get('VEXED_EFFECT_TEST_ROOT',Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(ROOT/'tools'))
from local_site import Handler
from validate_effect_game import validate
from types import SimpleNamespace

OUTPUT = ROOT/'test-results/cinematic-shields'
OUTPUT.mkdir(parents=True, exist_ok=True)

GPU_CHECK = r"""async () => {
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
  const gpu=await createVexedShieldGPU({canvas,maxShips:2,transparent:true});
  const fleet=[{x:320,y:240,w:120,h:160,rx:130,ry:165,angle:0}];gpu.setFleet(fleet);
  const event={x:-122,y:-20,born:100,strength:1,duration:900};
  const read=time=>{
    gpu.render(time,{effects:true,ships:false,background:false});
    const pixels=new Uint8Array(canvas.width*canvas.height*4);gpu.gl.readPixels(0,0,canvas.width,canvas.height,gpu.gl.RGBA,gpu.gl.UNSIGNED_BYTE,pixels);
    let hash=2166136261,lit=0;for(const byte of pixels){hash=Math.imul(hash^byte,16777619)>>>0;if(byte)lit++;}
    return {hash,lit};
  };
  gpu.hit(0,event);const first=read(180),snapshot=gpu.snapshot();
  for(let i=0;i<10;i++)gpu.hit(0,event);
  const same=read(180),duplicate=gpu.snapshot();
  if(first.hash!==same.hash||!first.lit)throw Error('Pause/duplicate submission changed the image');
  if(snapshot.uniqueEvents!==duplicate.uniqueEvents||snapshot.generatedSegments!==duplicate.generatedSegments)throw Error('Repeated submission regenerated geometry');
  // A submitted flash outlives the short electrical discharge: it must not reseed.
  read(650);gpu.hit(0,event);read(660);
  if(gpu.snapshot().uniqueEvents!==1)throw Error('Retired arcs restarted');
  const seeds=[];
  for(let i=1;i<=4;i++){gpu.hit(0,{...event,born:100+i*90,y:i*6});seeds.push(gpu.snapshot().seedDigest);}
  read(480);const overlap=gpu.snapshot();
  if(overlap.activeContacts!==3||gpu.visibility(480).active!==1)throw Error('Contact history or unique ship coverage is wrong');
  if(new Set(seeds).size!==4)throw Error('Repeated impact seeds');
  const before=gpu.snapshot();
  for(let i=0;i<100;i++){gpu.hit(0,{...event,born:1000+i*20});read(1030+i*20);}
  const bounded=gpu.snapshot();
  if(bounded.bufferBytes!==before.bufferBytes||bounded.textureBytes!==before.textureBytes||bounded.activeContacts>3||bounded.activeSegments>192)throw Error('Impact resources grew');
  gpu.setFleet(fleet);gpu.hit(0,event);if(read(180).hash!==first.hash)throw Error('Seeded replay changed');
  gpu.setFleet([{...fleet[0],motion:3,phase:.6}]);gpu.hit(0,event);read(180);
  gpu.setFleet(fleet);gpu.hit(0,event);if(read(180).hash!==first.hash)throw Error('Fleet reset retained motion');
  const normal=read(180);gpu.setFleet(fleet);gpu.hit(0,{...event,collapse:true});const collapse=read(180);
  if(normal.hash===collapse.hash)throw Error('Collapse did not change');
  const image=canvas.toDataURL();
  gpu.hide(0);read(180);if(gpu.visibility(180).active!==0||gpu.snapshot().activeContacts!==0)throw Error('Hidden shield retained emissions');
  const error=gpu.gl.getError();if(error!==gpu.gl.NO_ERROR)throw Error('WebGL error '+error);
  gpu.destroy();if(!gpu.snapshot().disposed)throw Error('Renderer was not disposed');
  return {first,same,seeds,overlap,bounded,collapse,image};
}"""

HYBRID_CHECK = r"""async () => {
  const source=document.createElement('canvas');source.width=640;source.height=480;
  const ctx=source.getContext('2d',{willReadFrequently:true});
  for(let y=0;y<480;y+=8)for(let x=0;x<640;x+=8){ctx.fillStyle=(x+y)%16?'#c7d9e7':'#122331';ctx.fillRect(x,y,8,8);}
  const fleet=[{x:320,y:240,w:120,h:160,rx:130,ry:165,angle:0}],event={x:-122,y:-20,born:100,strength:1,duration:900};
  async function make(scale){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    const gpu=await createVexedShieldGPU({canvas,sourceCanvas:source,maxShips:2,transparent:true,refractionScale:scale});gpu.setFleet(fleet);gpu.hit(0,event);return gpu;}
  function read(gpu,time){gpu.render(time,{effects:true,ships:false,background:false});const bytes=new Uint8Array(640*480*4);gpu.gl.readPixels(0,0,640,480,gpu.gl.RGBA,gpu.gl.UNSIGNED_BYTE,bytes);return bytes;}
  const gpu=await make(1),withoutLens=await make(0),first=read(gpu,180),flat=read(withoutLens,180);
  function perimeter(bytes,threshold){let lit=0;for(let i=0;i<72;i++){const a=i*Math.PI/36,x=Math.round(320+Math.cos(a)*130),y=Math.round(240+Math.sin(a)*165),o=((479-y)*640+x)*4;if(bytes[o+2]>=threshold&&bytes[o+3]>=threshold*.35)lit++;}return lit/72;}
  const earlyCoverage=perimeter(first,45),late=read(gpu,800),lateCoverage=perimeter(late,16);
  if(earlyCoverage<.9||lateCoverage<.8)throw Error('Bubble rim is too faint or expires early: '+JSON.stringify({earlyCoverage,lateCoverage}));
  let displacedPixels=0;for(let i=0;i<first.length;i+=4)if(Math.abs(first[i]-flat[i])+Math.abs(first[i+1]-flat[i+1])+Math.abs(first[i+2]-flat[i+2])>12)displacedPixels++;
  if(displacedPixels<1500)throw Error('The lens did not visibly displace the source image: '+displacedPixels);
  const before=gpu.snapshot().sourceCaptures;
  gpu.hit(0,{...event,born:190,y:35});gpu.hit(0,{...event,born:230,y:-45});read(gpu,300);
  if(gpu.snapshot().sourceCaptures!==before+1)throw Error('Overlapping contacts copied the scene more than once');
  const active=gpu.snapshot();read(gpu,1500);if(gpu.snapshot().sourceCaptures!==active.sourceCaptures)throw Error('Idle shields still copy the scene');
  const image=document.createElement('canvas');image.width=640;image.height=480;const g=image.getContext('2d');
  read(gpu,300);g.drawImage(source,0,0);g.drawImage(gpu.gl.canvas,0,0);
  const screenshot=image.toDataURL();
  source.width=3000;source.height=1600;ctx.fillStyle='#182d41';ctx.fillRect(0,0,3000,1600);read(gpu,300);
  const bounded=gpu.snapshot();if(bounded.captureWidth>2048||bounded.captureHeight>1024||bounded.textureBytes>bounded.maxTextureBytes)throw Error('Refraction exceeded its texture budget');
  if(gpu.gl.getError()!==gpu.gl.NO_ERROR)throw Error('Hybrid material raised a WebGL error');
  gpu.destroy();withoutLens.destroy();return {earlyCoverage,lateCoverage,displacedPixels,active,bounded,screenshot};
}"""

LOCAL_CHECK = r"""async () => {
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
  const gpu=await createVexedShieldGPU({canvas,maxShips:1,transparent:true});
  const fleet=[{x:320,y:240,w:120,h:160,rx:130,ry:165,angle:0}];
  function read(time){gpu.render(time,{effects:true,ships:false,background:false});const bytes=new Uint8Array(640*480*4);gpu.gl.readPixels(0,0,640,480,gpu.gl.RGBA,gpu.gl.UNSIGNED_BYTE,bytes);return bytes;}
  function brightness(bytes,x,y){let sum=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const i=((479-Math.round(y+dy))*640+Math.round(x+dx))*4;sum+=bytes[i]+bytes[i+1]+bytes[i+2];}return sum;}
  const locations=[];
  for(let i=0;i<9;i++){
    const a=i*Math.PI/4,x=i===8?0:Math.cos(a)*130*.86,y=i===8?0:Math.sin(a)*165*.86;
    gpu.setFleet(fleet);gpu.hit(0,{x,y,born:100,eventId:i});const image=read(112);
    const contact=brightness(image,320+x,240+y),opposite=brightness(image,320-x,240-y);
    if(i<8&&contact<opposite*1.35)throw Error('Impact core is not localized at sector '+i);
    locations.push({x,y,contact,opposite});
  }
  gpu.setFleet(fleet);
  const contacts=[{x:-100,y:0,born:100},{x:100,y:0,born:112},{x:0,y:130,born:124}];
  for(const hit of contacts)gpu.hit(0,hit);const overlap=read(136),snapshot=gpu.snapshot();
  gpu.setFleet(fleet);gpu.hit(0,contacts[2]);const single=read(136);
  for(const hit of contacts.slice(0,2))if(brightness(overlap,320+hit.x,240+hit.y)<brightness(single,320+hit.x,240+hit.y)*1.25)throw Error('New hit erased an earlier contact');
  if(snapshot.activeContacts!==3||snapshot.activeSegments>72)throw Error('Overlapping sparks exceeded the fixed contact budget');
  gpu.setFleet(fleet);gpu.hit(0,{x:0,y:0,born:100});const early=read(150),late=read(230);
  let changed=0;for(let i=0;i<early.length;i+=4)if(Math.abs(early[i+2]-late[i+2])>20)changed++;
  if(changed<800)throw Error('Ripple did not propagate');
  gpu.destroy();return {locations,overlap:snapshot,propagatingPixels:changed};
}"""

READABILITY_CHECK = r"""async () => {
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
  const gpu=await createVexedShieldGPU({canvas,maxShips:1,transparent:true});
  gpu.setFleet([{x:160,y:120,w:24,h:44,rx:20,ry:28,angle:0}]);
  gpu.hit(0,{x:19,y:0,born:100});
  const gl=gpu.gl,draw=gl.drawArraysInstanced.bind(gl);let details=true;
  // Isolate the existing detail pass, so a brighter bubble cannot masquerade
  // as readable sparks. No timing result uses this pixel-test instrumentation.
  gl.drawArraysInstanced=(...args)=>{if(details||args[3]<=3)draw(...args);};
  function read(time){gpu.render(time,{effects:true,ships:false,background:false});const bytes=new Uint8Array(320*240*4);gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;}
  const full=read(160);details=false;const membrane=read(160);details=true;
  let sparkPixels=0,flarePixels=0;
  for(let y=0;y<240;y++)for(let x=0;x<320;x++){
    const i=((239-y)*320+x)*4;
    if(full[i]+full[i+1]+full[i+2]-membrane[i]-membrane[i+1]-membrane[i+2]>24)sparkPixels++;
    if(Math.hypot(x-179,y-120)<10&&full[i]+full[i+1]+full[i+2]>180)flarePixels++;
  }
  gl.drawArraysInstanced=draw;
  if(sparkPixels<12)throw Error('Sparks disappear on fleet-sized hulls: '+sparkPixels);
  if(flarePixels<24)throw Error('Fleet-sized impact is too faint: '+flarePixels);
  if(gl.getError()!==gl.NO_ERROR)throw Error('Impact readability check raised WebGL error');
  const snapshot=gpu.snapshot();gpu.destroy();return {sparkPixels,flarePixels,snapshot};
}"""


def run():
    with tempfile.TemporaryDirectory(prefix='vexed-cinematic-test-') as temp:
        server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
        server.state=Path(temp);threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                channel=os.environ.get('BROWSER_CHANNEL','msedge')
                browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
                page=browser.new_page(viewport={'width':1440,'height':900});errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=6')
                page.wait_for_function('window.showcaseState?.().ready&&(window.showcaseShields?.snapshot().ready||window.showcaseShields?.snapshot().error)',timeout=90000)
                assert page.evaluate('showcaseShields.snapshot().ready'),page.evaluate('showcaseShields.snapshot().error')
                page.locator('[data-workspace-page=settings]:visible').click();page.locator('#shield-renderer').select_option('cinematic')
                page.wait_for_function('showcaseShields.snapshot().ready&&showcaseShields.snapshot().profile.implementation==="cinematic-shields-v1"')
                assert page.evaluate('showcaseShields.snapshot().profile.implementation')=='cinematic-shields-v1'
                assert page.locator('#shield-renderer').input_value()=='cinematic'
                visual=page.evaluate(GPU_CHECK)
                hybrid=page.evaluate(HYBRID_CHECK)
                localized=page.evaluate(LOCAL_CHECK)
                readability=page.evaluate(READABILITY_CHECK)
                import base64
                (OUTPUT/'collapse.png').write_bytes(base64.b64decode(visual.pop('image').split(',')[1]))
                (OUTPUT/'hybrid-refraction.png').write_bytes(base64.b64decode(hybrid.pop('screenshot').split(',')[1]))
                visual['hybrid']=hybrid
                visual['localized']=localized
                visual['readability']=readability
                if '--visual-only' in sys.argv:
                    assert not errors,errors
                    (OUTPUT/'visual.json').write_text(json.dumps(visual,indent=2),encoding='utf-8')
                    browser.close();print('Cinematic GPU pixel, motion reset, overlap and bounds checks passed.',flush=True);return
                page.locator('[data-workspace-tab=lab]').click()
                page.wait_for_function('document.querySelector(".lab-notice").textContent.includes("Choose a scene")')
                child=page.frames[1]
                # Use the exact catalog profile, save before measuring so both
                # arms hash the same candidate module along with production.
                manifest=child.evaluate('effectLabScene.command("manifest")')
                candidate=manifest['candidates']['profiles'][0]
                fixture={'count':100,'scenario':'shields','shipType':6,'mix':False,'rate':2,'size':44,'seed':429,'pattern':'staggered','lights':'--lights-off' not in sys.argv,'shieldRenderer':'gpu','weapon':'beam:0'}
                child.evaluate('(payload)=>effectLabScene.command("session",payload)',{'candidate':candidate,'fixture':fixture})
                runs=[]
                for count in ([100,200] if '--targets' in sys.argv else [10,25,50,100,200]):
                    for variant,profile in [('baseline',manifest['release']),('candidate',candidate)]:
                        report=child.evaluate('''payload=>effectLabScene.command('measure',payload)''',{'fixture':{**fixture,'count':count},'profile':profile,'variant':variant,'warmup':1,'duration':5})
                        assert report['counters']['minimumVisible']==count
                        assert report['metrics']['valid']
                        if variant=='candidate':
                            stats=report['resources']['shields']
                            assert stats['implementation']=='cinematic-shields-v1'
                            assert stats['uniqueEvents']>count and stats['peakSegments']<=stats['maxSegments']
                        runs.append(report)
                        print(json.dumps({'count':count,'variant':variant,'fps':report['metrics']['fps'],'p95':report['metrics']['p95Ms'],'gpuMs':report['metrics']['gpuMs'],'target':report['metrics']['targetObserved']}),flush=True)
                    assert child.evaluate('pair=>EffectLabMetrics.comparable(...pair)',runs[-2:])
                # Rapid volleys retain bounded overlapping events at maximum load.
                rapid=child.evaluate('''payload=>effectLabScene.command('measure',payload)''',{'fixture':{**fixture,'count':200,'rate':8,'pattern':'volley'},'profile':candidate,'variant':'candidate','warmup':1,'duration':5})
                assert rapid['counters']['minimumVisible']==200
                assert rapid['resources']['shields']['activeContacts']<=600
                assert rapid['resources']['shields']['peakSegments']<=rapid['resources']['shields']['maxSegments']
                page.screenshot(path=str(OUTPUT/'stress-200.png'))
                child.evaluate('effectLabScene.command("stop")')
                assert not errors,errors
                browser.close()
            games=[]
            if '--game' in sys.argv:
                for count in [100,200]:
                    for variant,profile in [('baseline',manifest['release']),('candidate',candidate)]:
                        args=SimpleNamespace(root=ROOT,state=Path(temp),count=count,seconds=10,warmup=3,headed=False)
                        game=validate(args,fixture_override={**fixture,'count':count},preview_profile=profile)
                        assert game['minimumVisible']==count and not game['errors']
                        game['variant']=variant;games.append(game)
                        print(json.dumps({'gameShips':count,'variant':variant,'status':game['status'],'fps':game['metrics']['fps'],'p95':game['metrics']['p95Ms'],'low1FPS':game['metrics']['low1FPS']}),flush=True)
            result={'sourceRoot':str(ROOT),'visual':visual,'runs':runs,'rapid':rapid,'games':games,'errors':errors}
            (OUTPUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
            print('Cinematic shader, bounded overlap and A/B checks completed'+(' with actual gameplay checks.' if games else '.'),flush=True)
        finally:
            server.shutdown();server.server_close()


if __name__=='__main__':run()
