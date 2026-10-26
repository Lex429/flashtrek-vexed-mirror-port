"""Distant-star eclipse, compass aiming, slow satellite depth and menu lifecycle."""
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'menu-emblem'
OUTPUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args): pass
server=None
if len(sys.argv)>1:base=sys.argv[1].rstrip('/')
else:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
url=base+'/html-games/broken-mirror-port/index.html'
manifest=json.loads((ROOT/'html-games/broken-mirror-port/startup/menu-emblem-assets.json').read_text(encoding='utf-8'))
for asset in manifest['assets']:
    assert hashlib.sha256((ROOT/'html-games/broken-mirror-port/startup'/asset['file']).read_bytes()).hexdigest()==asset['sha256']

PIXELS="""()=>{
  nativeMenuEmblem.repaint();
  const canvas=document.querySelector('#menu-emblem-scene'),gl=canvas.getContext('webgl');
  const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const star=nativeMenuEmblem.snapshot(),sx=star.light.x*canvas.width/canvas.clientWidth,sy=canvas.height-star.light.y*canvas.height/canvas.clientHeight,r=star.star.radius*canvas.width/canvas.clientWidth*1.5;
  let glow=0,art=0,core=0,redLight=0,hash=2166136261;
  for(let i=0;i<pixels.length;i+=4){
    if(pixels[i+3]===0&&pixels[i]>8&&pixels[i]>pixels[i+1]*2)glow++;
    if(pixels[i+3]>240)art++;
    if(pixels[i+3]<16&&pixels[i]>60&&pixels[i]>pixels[i+1]*2&&pixels[i]>pixels[i+2]*2)redLight++;
    if(pixels[i+3]<16&&pixels[i]>180&&Math.abs((i/4)%canvas.width-sx)<r&&Math.abs(Math.floor(i/4/canvas.width)-sy)<r)core++;
    hash=Math.imul(hash^pixels[i],16777619);
  }
  return {glow,art,core,redLight,hash:hash>>>0};
}"""
GEOMETRY="""()=>{
  const c=document.querySelector('#menu-emblem-scene').getBoundingClientRect();
  const buttons=[...document.querySelectorAll('#main-menu-controls button:not([hidden])')].map(b=>b.getBoundingClientRect());
  const outside=nativeMenuEmblem.snapshot().fragments.some(p=>p.x<0||p.y<0||p.x>c.width||p.y>c.height);
  const overlaps=nativeMenuEmblem.snapshot().fragments.some(p=>{
    const radius=Math.hypot(p.w,p.h)*.5,x=p.x+c.x,y=p.y+c.y;
    return buttons.some(b=>x+radius>b.x&&x-radius<b.right&&y+radius>b.y&&y-radius<b.bottom);
  });
  return {outside,overlaps,scroll:document.body.scrollWidth>innerWidth||document.body.scrollHeight>innerHeight};
}"""
COMPASS="""target=>{
  const s=nativeMenuEmblem.snapshot(),bounds=document.querySelector('#menu-emblem-scene').getBoundingClientRect();
  const dx=target.x-bounds.x-s.pivot.x,dy=target.y-bounds.y-s.pivot.y;
  const tx=s.tip.x-s.pivot.x,ty=s.tip.y-s.pivot.y;
  return (dx*tx+dy*ty)/(Math.hypot(dx,dy)*Math.hypot(tx,ty));
}"""
errors=[];failed=[];warnings=[];report={}
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1440,'height':1000})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:failed.append(f'{r.status} {r.url}') if r.status>=400 else None)
        page.on('console',lambda m:warnings.append(m.text) if 'Menu lighting unavailable' in m.text else None)
        page.goto(url)
        page.wait_for_function('()=>window.nativeMenuEmblem?.snapshot().ready&&document.querySelector("#startup").hidden',timeout=90000)
        assert page.locator('.menu-pointer').get_attribute('src')=='startup/menu-skull.png'
        assert page.locator('.menu-compass').evaluate('(e)=>getComputedStyle(e).filter')=='none','Old CSS halo remains'
        assert page.locator('.menu-pointer').evaluate('(e)=>getComputedStyle(e).visibility')=='hidden'
        page.mouse.move(250,500);page.wait_for_timeout(450)
        left=page.evaluate('nativeMenuEmblem.snapshot()');sky_left=page.evaluate('menuSpace.state');report['pixelsLeft']=page.evaluate(PIXELS)
        assert page.evaluate(COMPASS,{'x':250,'y':500})>.999,'Blade did not point at the cursor'
        assert report['pixelsLeft']['art']>1000,report
        page.screenshot(path=str(OUTPUT/'light-left.png'))
        page.mouse.move(1200,300);page.wait_for_timeout(450)
        right=page.evaluate('nativeMenuEmblem.snapshot()');sky_right=page.evaluate('menuSpace.state');report['pixelsRight']=page.evaluate(PIXELS)
        assert len(sky_left['projected'])==len(sky_right['projected'])==720
        travelled=sky_right['travel']-sky_left['travel']
        assert travelled>.1,'Forward camera travel is missing'
        approaching=0
        for a,b in zip(sky_left['projected'],sky_right['projected']):
            assert a['id']==b['id']
            if a['generation']==b['generation']:
                assert abs((a['z']-b['z'])-travelled)<1e-6
                assert a['worldX']==b['worldX'] and a['worldY']==b['worldY'],'Mouse movement recycled a star'
                if a['visible'] and b['visible'] and b['radius']>a['radius']:approaching+=1
        assert approaching>25,'Stars did not visibly approach and grow'
        assert right['light']==left['light'],'Lamp moved with the cursor'
        assert page.evaluate(COMPASS,{'x':1200,'y':300})>.999
        assert report['pixelsLeft']['hash']!=report['pixelsRight']['hash'],'Rotating artwork did not change the rendered light'
        assert right['pivot']!=left['pivot'],'Foreground did not respond to mouse perspective'
        assert all(65<=p['period']<=120 for p in right['fragments'])
        assert len(right['fragments'])==12 and right['fragments']!=left['fragments']
        assert right['time']>left['time']
        page.screenshot(path=str(OUTPUT/'light-right.png'))
        # Sweep around the artifact: one fixed star must become fully hidden,
        # partly exposed, and fully visible, with matching real rendered pixels.
        from math import sin,cos,pi
        eclipses=[]
        fronts={p['index']:{p['front']} for p in right['fragments']}
        for i in range(12):
            a=i*pi/6;x=720+450*cos(a);y=500+380*sin(a)
            page.mouse.move(x,y);page.wait_for_timeout(350)
            state=page.evaluate('nativeMenuEmblem.snapshot()');pixels=page.evaluate(PIXELS)
            assert page.evaluate(COMPASS,{'x':x,'y':y})>.999
            assert state['light']==left['light'],'Distant source moved with the foreground'
            assert not any(page.evaluate(GEOMETRY).values())
            visibility=state['star']['visibility']
            optics=state['star']
            assert .87-1e-8<=optics['cameraGain']<=1,'Camera exposure left its restrained range'
            assert optics['effectiveVisibility']<=visibility+1e-8,'Flare outlived its visible source'
            if .05<visibility<.4:
                assert optics['edgeGlint']>.5,'Partial exposure did not produce an edge glint'
                page.screenshot(path=str(OUTPUT/'cinematic-sliver.png'))
            if visibility==0 or visibility==1:
                assert optics['edgeGlint']==0,'Edge glint remained outside the eclipse reveal'
            if visibility>.98:
                assert pixels['core']>10 and pixels['redLight']>100,('Exposed star was not strongly red',visibility,pixels)
                page.screenshot(path=str(OUTPUT/'star-exposed.png'))
                edge=page.evaluate("""()=>{
                  nativeMenuEmblem.repaint();const c=document.querySelector('#menu-emblem-scene'),g=c.getContext('webgl'),s=nativeMenuEmblem.snapshot();
                  const size=Math.hypot(s.tip.x-s.pivot.x,s.tip.y-s.pivot.y)*2,result=[];
                  for(const dy of [-.604,-.598,-.59]){
                    const rgba=new Uint8Array(4);g.readPixels(Math.round(s.light.x*c.width/c.clientWidth),Math.round(c.height-(s.light.y+size*dy)*c.height/c.clientHeight),1,1,g.RGBA,g.UNSIGNED_BYTE,rgba);result.push([...rgba]);
                  }return result;
                }""")
                assert all(max(rgba)==0 for rgba in edge),('Rectangular lighting edge remains',edge)
            if visibility<.001:
                assert pixels['core']<3,('Hidden star shone through the artwork',visibility,pixels)
                page.screenshot(path=str(OUTPUT/'star-eclipsed.png'))
            eclipses.append({'visibility':visibility,'corePixels':pixels['core']})
            for p in state['fragments']:fronts[p['index']].add(p['front'])
        assert any(e['visibility']<.001 for e in eclipses) and any(e['visibility']>.98 for e in eclipses),eclipses
        assert any(.02<e['visibility']<.95 for e in eclipses),'No partial eclipse'
        assert page.locator('#main-menu-controls').evaluate('(e)=>getComputedStyle(e).filter')=='none','Exposure altered menu controls'
        assert page.locator('#menu-space').evaluate('(e)=>e.style.filter').startswith('brightness('),'Background exposure was not applied'
        report['eclipses']=eclipses
        assert any(len(values)==2 for values in fronts.values()),'No fragment moved between front and back'
        # Cross the atan2 boundary without spinning the long way around.
        page.mouse.move(180,480);page.wait_for_timeout(400);seam=page.evaluate('nativeMenuEmblem.snapshot().angle')
        page.mouse.move(180,535);page.wait_for_timeout(400)
        assert abs(page.evaluate('nativeMenuEmblem.snapshot().angle')-seam)<.2
        before_orbit=page.evaluate('nativeMenuEmblem.snapshot()')
        page.wait_for_timeout(750)
        orbit=page.evaluate('nativeMenuEmblem.snapshot()')
        assert orbit['light']==before_orbit['light']
        assert any(abs(p['z']-next(n['z'] for n in orbit['fragments'] if n['index']==p['index']))>1 for p in before_orbit['fragments'])
        assert any(p['w']!=next(n['w'] for n in orbit['fragments'] if n['index']==p['index']) for p in before_orbit['fragments'])
        page.screenshot(path=str(OUTPUT/'orbit-depth.png'))
        report['viewports']=[]
        for width,height in [(1440,1000),(800,600),(390,844),(320,568)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(120)
            geometry=page.evaluate(GEOMETRY)
            assert not any(geometry.values()),(width,height,geometry)
            report['viewports'].append([width,height])
        page.screenshot(path=str(OUTPUT/'mobile.png'))
        page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(80)
        static=page.evaluate('nativeMenuEmblem.snapshot()');page.wait_for_timeout(180)
        assert not static['running'] and page.evaluate('nativeMenuEmblem.snapshot().frames')==static['frames']
        page.set_viewport_size({'width':1280,'height':850});page.wait_for_timeout(120)
        assert page.evaluate('nativeMenuEmblem.snapshot().frames')>static['frames'],'Static scene did not repaint on resize'
        assert not any(page.evaluate(GEOMETRY).values())
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_timeout(180)
        assert page.evaluate('nativeMenuEmblem.snapshot().running'),page.evaluate('({state:nativeMenuEmblem.snapshot(),hidden:document.hidden,paused:nativePause.active,stage:document.querySelector("#game").className})')
        before_save=page.evaluate('JSON.stringify([nativeSaveStorage.read("normal"),nativeSaveStorage.read("dev")])')
        page.locator('[data-menu="new"]').click()
        page.wait_for_function('()=>nativeMenuEmblem.snapshot().burst>.1',polling=10)
        page.wait_for_selector('#setup-ui:not([hidden])')
        page.wait_for_function('()=>!nativeMenuTransition.snapshot().active&&!nativeMenuEmblem.snapshot().running')
        assert page.locator('#menu-space').evaluate('(e)=>e.style.filter')=='','Menu exposure leaked into the next screen'
        stopped=page.evaluate('nativeMenuEmblem.snapshot().frames');page.wait_for_timeout(180)
        assert page.evaluate('nativeMenuEmblem.snapshot().frames')==stopped,'Hidden menu still rendered'
        assert page.evaluate('JSON.stringify([nativeSaveStorage.read("normal"),nativeSaveStorage.read("dev")])')==before_save
        page.locator('.setup-back').click();page.wait_for_function('()=>nativeMenuEmblem.snapshot().running')
        page.evaluate('nativePause.open()');page.wait_for_function('()=>!nativeMenuEmblem.snapshot().running')
        paused=page.evaluate('nativeMenuEmblem.snapshot().frames');page.wait_for_timeout(150)
        assert page.evaluate('nativeMenuEmblem.snapshot().frames')==paused
        page.evaluate('nativePause.close()');page.wait_for_function('()=>nativeMenuEmblem.snapshot().running')
        # A device without WebGL retains the actual supplied artwork and working input.
        fallback=browser.new_page(reduced_motion='reduce')
        fallback.on('pageerror',lambda e:errors.append(str(e)))
        fallback.add_init_script("""(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl'?null:get.call(this,kind,...args);};})();""")
        fallback.goto(url);fallback.wait_for_function('()=>window.nativeSetup&&document.querySelector("#startup").hidden',timeout=90000)
        assert fallback.locator('.menu-pointer').is_visible()
        fallback.locator('[data-menu="new"]').click();fallback.wait_for_function('()=>nativeSetup.active')
        assert not errors and not failed and not warnings,(errors,failed,warnings)
        report.update(ok=True,cinematicEdgeReveal=True,cameraExposure=True,worldOnlyExposure=True,sourceArtworkUnchanged=True,compassAimsAtCursor=True,persistentParallaxStars=720,forwardTravel=True,redStar=True,lightingBoundaryFixed=True,inertialFragments=True,movingSolidContacts=True,highRadianceStar=True,fixedDistantStar=True,fullAndPartialEclipses=True,occlusionPixelsChecked=True,slowOrbitPeriods=[65,120],mouseParallax=True,orbitingFragments=12,frontBackCrossings=True,depthChangesScale=True,reducedMotion=True,stopsOffscreenAndPaused=True,artworkFallback=True,savePreserved=True,errors=errors,failed=failed)
        (OUTPUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
        browser.close()
finally:
    if server:server.shutdown()
