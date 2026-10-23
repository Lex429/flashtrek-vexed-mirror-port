"""Matched native-scale shield videos and screenshots. Never a timing benchmark."""
import argparse
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import subprocess
import threading
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
CORE='html-games/flashtrek-broken-mirror/shield-gpu.js'
PREPARE=r'''({scale,geometry})=>{
 const p=shieldGPUReplay,indices=[2,0,1,3,4,5],columns=[130,330,518];
 const fleet=indices.map((i,j)=>{const native=geometry.find(s=>s.type===shieldReplayShips[p.fleet[i].layer].id);
   return {...p.fleet[i],x:columns[j%3],y:235+Math.floor(j/3)*365,angle:.35,motion:0,
     w:native.dimensions.width*scale,h:native.dimensions.height*scale,rx:native.radii.rx*scale,ry:native.radii.ry*scale};});
 p.renderer.setFleet(fleet);let last=-1;
 window.__casePaint=time=>{const cycle=Math.floor(time/1200);
  if(cycle!==last){fleet.forEach((s,i)=>p.renderer.hit(i,{x:s.rx*.94,y:0,born:cycle*1200,strength:1}));last=cycle;}
  return p.renderer.render(time,{effects:true});};
 __casePaint(0);
 return fleet.map(s=>({type:shieldReplayShips[s.layer].id,name:shieldReplayShips[s.layer].name,x:s.x,y:s.y,width:s.w,height:s.h}));
}'''

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--baseline',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    sources={'baseline':(args.baseline/'shield-gpu.js').read_bytes(),'revised':(ROOT/CORE).read_bytes(),
             'original':subprocess.check_output(['git','show','e0445ac:'+CORE],cwd=ROOT)}
    for variant,body in sources.items():(out/(variant+'-shield-gpu.js')).write_bytes(body)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();report={'outsideTiming':True,'lighting':'OFF','dpr':1,
        'sourceSHA256':{k:hashlib.sha256(v).hexdigest() for k,v in sources.items()},'normalSpeedSeconds':4.8,'slowMotionSeconds':2.4,'slowMotionRate':.5}
    try:
      with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        launch={'headless':True,**({'channel':channel} if channel else {})}
        browser=p.chromium.launch(**launch);page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.nativeView&&window.nativeCombatShots?.isReady()')
        view=page.evaluate('()=>nativeView.measure(document.querySelector("#space"))')
        geometry=page.evaluate('''()=>[7,1,2,10,23,58].map(type=>{
          const definition=nativeShipDefinitions.get(type,'civilian'),dimensions=nativeShipDefinitions.dimensions({shipType:type},'civilian');
          return {type,dimensions,radii:nativeShipDefinitions.surfaceRadii(dimensions,true,definition)};})''');browser.close()
        report['nativeShipGeometry']=geometry
        report['nativeGameView']=view;scale=view['scale'];report['browser']=browser.version
        for variant,body in sources.items():
          browser=p.chromium.launch(**launch);page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1,accept_downloads=True)
          errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
          page.route('**/shield-gpu.js',lambda route,request,body=body:route.fulfill(status=200,content_type='text/javascript',body=body))
          page.goto(f'http://127.0.0.1:{server.server_port}/demos/shield-gpu/index.html');page.wait_for_function('()=>window.shieldGPUReplay')
          page.evaluate("document.body.classList.add('timing')")
          page.evaluate('()=>shieldGPUReplay.paint(5160,true)');page.locator('#gpu').screenshot(path=str(out/(variant+'-100.png')))
          report['ordinaryShips']=page.evaluate(PREPARE,{'scale':scale,'geometry':geometry})
          for time in [40,160,300,380,460,620,800]:
            page.evaluate('(t)=>__casePaint(t)',time);page.locator('#gpu').screenshot(path=str(out/f'{variant}-ordinary-{time}.png'))
          if variant!='original':
            page.evaluate('__casePaint(0)')
            with page.expect_download(timeout=30000) as download:
              page.evaluate('''()=>{const stream=shieldGPUReplay.canvas.captureStream(60),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
                window.__recordDone=false;recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
                recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));a.download='shields.webm';a.click();__recordDone=true;};
                let start;recorder.start();function frame(t){start??=t;const elapsed=t-start,simulation=elapsed<4800?elapsed:4800+(elapsed-4800)*.5;
                  __casePaint(simulation);if(elapsed<7200)requestAnimationFrame(frame);else recorder.stop();}requestAnimationFrame(frame);
              }''')
              page.wait_for_function('()=>__recordDone',timeout=30000)
            download.value.save_as(out/(variant+'-ordinary.webm'))
          assert not errors,errors;browser.close()
      fontPath='C:/Windows/Fonts/segoeui.ttf'
      font=ImageFont.truetype(fontPath,22) if Path(fontPath).exists() else ImageFont.load_default()
      small=ImageFont.truetype(fontPath,16) if Path(fontPath).exists() else ImageFont.load_default()
      for mode,playbackLabel in [('normal','NORMAL SPEED 1x'),('slow','SLOW MOTION 0.5x')]:
        annotation=Image.new('RGBA',(1280,850));draw=ImageDraw.Draw(annotation)
        for panel,title in enumerate(['Polished baseline (8987ef3)','Revised: clear ripple, then fade']):
          draw.rectangle((panel*640,0,(panel+1)*640,78),fill=(4,9,19,245))
          draw.text((panel*640+16,8),title,font=font,fill='white');draw.text((panel*640+16,42),playbackLabel+' | normal game scale | lighting OFF',font=small,fill='#ffda99')
          for s in report['ordinaryShips']:
            labels=[s['name'].replace(' Class',''),f"{s['width']:.1f} x {s['height']:.1f} px"]
            for line,shipLabel in enumerate(labels):
              width=draw.textbbox((0,0),shipLabel,font=small)[2]
              draw.text((panel*640+s['x']-width/2,(380 if s['y']<400 else 770)+line*21),shipLabel,font=small,fill='#d5ebfa')
        annotation.save(out/('labels-'+mode+'.png'))
      filters="[0:v]fps=30,crop=640:850:0:0,setpts=PTS-STARTPTS[b];[1:v]fps=30,crop=640:850:0:0,setpts=PTS-STARTPTS[r];[b][r]hstack=inputs=2[s];[s][2:v]overlay=0:0:enable='lt(t,4.8)'[n];[n][3:v]overlay=0:0:enable='gte(t,4.8)'[v]"
      subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-n','-i',str(out/'baseline-ordinary.webm'),'-i',str(out/'revised-ordinary.webm'),
        '-loop','1','-i',str(out/'labels-normal.png'),'-loop','1','-i',str(out/'labels-slow.png'),'-filter_complex',filters,'-map','[v]',
        '-an','-t','7.2','-c:v','libx264','-threads','2','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',str(out/'before-after.mp4')],check=True)
      for time in [160,300,620]:
        pair=Image.new('RGB',(1280,850))
        for j,v in enumerate(['baseline','revised']):pair.paste(Image.open(out/f'{v}-ordinary-{time}.png').convert('RGB').crop((0,0,640,850)),(j*640,0))
        pair.paste(Image.open(out/'labels-normal.png'),(0,0),Image.open(out/'labels-normal.png'))
        pair.save(out/f'before-after-{time}.png')
      report.update(complete=True,recording='before-after.mp4',nativeScaleUnchanged=True,
        annotation='Offline labels and unused-space crop only; no artwork or video resizing. 100-ship benchmark unchanged.')
      print(json.dumps(report))
    finally:(out/'results.json').write_text(json.dumps(report,indent=2));server.shutdown()

if __name__=='__main__':main()
