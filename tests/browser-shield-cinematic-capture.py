"""Normal-speed Canvas/current/revised visual references, outside performance timing."""
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
SETUP=r'''async({variant,geometry,scale})=>{
 const p=shieldGPUReplay,models=[2,0,1,3,4,5],images=[];
 for(const a of shieldReplayShips){const image=new Image();image.src='../../html-games/flashtrek-broken-mirror/showcase-assets/'+a.file;await image.decode();images.push(image);}
 let canvas=p.canvas,ctx;
 if(variant==='canvas'){
   canvas=document.createElement('canvas');canvas.id='reference';canvas.width=1280;canvas.height=850;p.canvas.hidden=true;
   document.body.appendChild(canvas);ctx=canvas.getContext('2d');
 }
 let fleet,flashes,cursor;
 window.__setScene=mode=>{
   if(mode==='fleet')fleet=p.fleet.map(s=>({...s}));
   else fleet=(mode==='detail'?[0]:models).map((i,j)=>{
     const s=p.fleet[i],native=geometry.find(a=>a.type===shieldReplayShips[s.layer].id),zoom=scale*(mode==='detail'?2:1);
     return {...s,x:mode==='detail'?320:[130,330,518][j%3],y:mode==='detail'?425:235+Math.floor(j/3)*365,
       angle:.35,motion:0,w:native.dimensions.width*zoom,h:native.dimensions.height*zoom,rx:native.radii.rx*zoom,ry:native.radii.ry*zoom};
   });
   flashes=new Array(fleet.length);cursor=0;
   if(variant!=='canvas')p.renderer.setFleet(fleet);
   window.__scene=mode;
   return fleet.map(s=>({type:shieldReplayShips[s.layer].id,w:s.w,h:s.h,rx:s.rx,ry:s.ry}));
 };
 window.__paint=time=>{
   if(__scene==='fleet'){
     while(cursor<p.sequence.length&&p.sequence[cursor].born<=time){const hit=p.sequence[cursor++];flashes[hit.ship]=hit;if(variant!=='canvas')p.renderer.hit(hit.ship,hit);}
   }else{
     const cycle=Math.floor(time/1200);
     fleet.forEach((s,i)=>{if(flashes[i]?.born!==cycle*1200){const hit={ship:i,x:s.rx*.94,y:0,born:cycle*1200,strength:1};flashes[i]=hit;if(variant!=='canvas')p.renderer.hit(i,hit);}});
   }
   if(variant!=='canvas')return p.renderer.render(time,{effects:true});
   ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#040913';ctx.fillRect(0,0,1280,850);
   ctx.fillStyle='#597a9e';for(let i=0;i<150;i++)ctx.fillRect(i*67%1280,i*43%850,1,1);
   fleet.forEach((s,i)=>{
     const a=s.angle+Math.sin(time*.0005+s.phase)*s.motion*.125,x=s.x+Math.sin(time*.0007+s.phase)*s.motion,y=s.y+Math.cos(time*.0006+s.phase)*s.motion;
     const hit=flashes[i],impact=hit?{...hit,energy:hit.strength,charge:1,color:'#56c8ff',kind:'beam'}:null,radii={rx:s.rx,ry:s.ry};
     ctx.save();ctx.translate(x,y);ctx.rotate(a);
     drawShowcaseShieldSurface(ctx,0,0,s.w,s.h,'#56c8ff',1,time,{refract:true,impact,surfaceRadii:radii});
     ctx.drawImage(images[s.layer],-s.w/2,-s.h/2,s.w,s.h);
     drawShowcaseShieldSurface(ctx,0,0,s.w,s.h,'#56c8ff',1,time,{front:true,impact,surfaceRadii:radii});
     drawShowcaseShieldFlash(ctx,images[s.layer],s.w,s.h,impact,time,{surfaceRadii:radii});ctx.restore();
   });
 };
 window.__record=()=>{const stream=canvas.captureStream(60),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
   window.__recordDone=false;recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));a.download='shield.webm';a.click();__recordDone=true;};
   let start;recorder.start();function frame(t){start??=t;const elapsed=t-start;
     __paint((__scene==='fleet'?5000:0)+elapsed);if(elapsed<6000)requestAnimationFrame(frame);else recorder.stop();}requestAnimationFrame(frame);
 };
 return canvas.id;
}'''

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--screens-only',action='store_true')
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    sources={'canvas':(args.baseline/'shield-gpu.js').read_bytes(),'current':(args.baseline/'shield-gpu.js').read_bytes(),'revised':(ROOT/CORE).read_bytes()}
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    report={'lighting':'OFF','playbackRate':1,'outsideTiming':True,'viewport':[1280,850],'dpr':1,
      'sourceSHA256':{k:hashlib.sha256(v).hexdigest() for k,v in sources.items()},'scenes':{}}
    try:
      with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');launch={'headless':True,**({'channel':channel} if channel else {})}
        browser=p.chromium.launch(**launch);page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1);page.set_default_timeout(120000)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.nativeView&&window.nativeCombatShots?.isReady()')
        native=page.evaluate('''()=>({scale:nativeView.measure(document.querySelector('#space')).scale,
          geometry:[7,1,2,10,23,58].map(type=>{const definition=nativeShipDefinitions.get(type,'civilian'),dimensions=nativeShipDefinitions.dimensions({shipType:type},'civilian');return {type,dimensions,radii:nativeShipDefinitions.surfaceRadii(dimensions,true,definition)};})})''')
        browser.close();report['native']=native
        for variant,body in sources.items():
          (out/(variant+'-shield-gpu.js')).write_bytes(body)
          browser=p.chromium.launch(**launch);page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1,accept_downloads=True);page.set_default_timeout(120000)
          errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
          page.route('**/shield-gpu.js',lambda route,request,body=body:route.fulfill(status=200,content_type='text/javascript',body=body))
          page.goto(f'http://127.0.0.1:{server.server_port}/demos/shield-gpu/index.html');page.wait_for_function('()=>window.shieldGPUReplay')
          page.evaluate("document.body.classList.add('timing')")
          if variant=='canvas':page.add_script_tag(url=f'http://127.0.0.1:{server.server_port}/html-games/flashtrek-broken-mirror/shield-flash.js')
          canvas=page.evaluate(SETUP,{'variant':variant,**native})
          for mode in ['ordinary','detail','fleet']:
            report['scenes'][mode]=page.evaluate('__setScene',mode)
            for t in ([5160] if mode=='fleet' else [40,100,180,280,380,500,650,899]):
              page.evaluate('__paint',t);page.locator('#'+canvas).screenshot(path=str(out/f'{variant}-{mode}-{t}.png'))
            if not args.screens_only:
              page.evaluate('__setScene',mode)
              with page.expect_download(timeout=45000) as download:
                page.evaluate('__record()');page.wait_for_function('()=>__recordDone',timeout=45000)
              download.value.save_as(out/f'{variant}-{mode}.webm')
          assert not errors,errors;browser.close()
      font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',20) if Path('C:/Windows/Fonts/segoeui.ttf').exists() else ImageFont.load_default()
      for mode in ['ordinary','detail','fleet']:
        width=1280 if mode=='fleet' else 640
        annotation=Image.new('RGBA',(width*3,850));d=ImageDraw.Draw(annotation)
        for i,title in enumerate(['Original Canvas','Current GPU (ab5bb25)','Revised GPU: curved surface']):
          d.rectangle((i*width,0,(i+1)*width,78),fill=(4,9,19,245));d.text((i*width+14,8),title,font=font,fill='white')
          scale='2x spatial detail' if mode=='detail' else 'native game sizes' if mode=='ordinary' else '100 ships | pinned replay dimensions'
          d.text((i*width+14,42),'NORMAL SPEED 1x | '+scale+' | lighting OFF',font=font,fill='#ffd18a')
        annotation.save(out/(mode+'-labels.png'))
        for t in ([5160] if mode=='fleet' else [100,180,280,380,650]):
          im=Image.new('RGB',(width*3,850))
          for i,v in enumerate(sources):im.paste(Image.open(out/f'{v}-{mode}-{t}.png').convert('RGB').crop((0,0,width,850)),(i*width,0))
          im.paste(annotation,(0,0),annotation);im.save(out/f'comparison-{mode}-{t}.png')
        if not args.screens_only:
          streams=';'.join(f'[{i}:v]fps=30,crop={width}:850:0:0,setpts=PTS-STARTPTS[v{i}]' for i in range(3))
          filters=streams+';[v0][v1][v2]hstack=inputs=3[s];[s][3:v]overlay=0:0[v]'
          command=['ffmpeg','-hide_banner','-loglevel','error','-n']
          for v in sources:command+=['-i',str(out/f'{v}-{mode}.webm')]
          command+=['-loop','1','-i',str(out/(mode+'-labels.png')),'-filter_complex',filters,'-map','[v]','-an','-t','6','-c:v','libx264','-threads','2','-preset','veryfast','-crf','19','-pix_fmt','yuv420p',str(out/(mode+'-comparison.mp4'))]
          subprocess.run(command,check=True)
      report['complete']=True;print(json.dumps({'complete':True,'playbackRate':1,'screensOnly':args.screens_only}))
    finally:(out/'results.json').write_text(json.dumps(report,indent=2));server.shutdown()

if __name__=='__main__':main()
