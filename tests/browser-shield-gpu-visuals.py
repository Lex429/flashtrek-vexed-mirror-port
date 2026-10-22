"""New-design GPU pixels/lifecycle/resource checks; never an FPS benchmark."""
import base64
import functools
import hashlib
import http.server
import io
import json
import math
import os
from pathlib import Path
import threading
from PIL import Image,ImageChops
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def main():
 import argparse
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);a=parser.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
 class Quiet(http.server.SimpleHTTPRequestHandler):
  def log_message(self,*args):pass
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
 report={'scope':'New shield design; captures and readbacks outside timing','checks':[]}
 def check(name,value):
  report['checks'].append({'name':name,'passed':bool(value)});assert value,name
 try:
  with sync_playwright() as p:
   channel=os.environ.get('BROWSER_CHANNEL','msedge')
   browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/demos/shield-gpu/index.html')
   page.wait_for_function('window.shieldGPUReplay!==undefined');page.evaluate("document.body.classList.add('timing')")
   report['layout']=page.evaluate('shieldGPUReplay.auditLayout()');report['browser']=browser.version
   report['sources']={f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['html-games/flashtrek-broken-mirror/shield-gpu.js','demos/shield-gpu/replay.js']}
   def capture(name,script,args=None):
    result=page.evaluate(script,args);png=page.locator('#gpu').screenshot();(out/(name+'.png')).write_bytes(png);return Image.open(io.BytesIO(png)).convert('RGB'),result
   off,_=capture('100-off','()=>shieldGPUReplay.paint(5160,false)')
   on,status=capture('100-on','()=>shieldGPUReplay.paint(5160,true)')
   check('100 fully visible hulls and 100 active effects',status['fullyVisible']==100 and status['fullyActive']==100)
   diff=ImageChops.difference(off,on)
   points=page.evaluate('''()=>shieldGPUReplay.fleet.map(r=>{const t=5160,a=r.angle+Math.sin(t*.0005+r.phase)*r.motion*.125,x=r.x+Math.sin(t*.0007+r.phase)*r.motion,y=r.y+Math.cos(t*.0006+r.phase)*r.motion;return [0,Math.PI/2,Math.PI,Math.PI*1.5].map(p=>{const xx=r.rx*Math.cos(p),yy=r.ry*Math.sin(p);return [x+Math.cos(a)*xx-Math.sin(a)*yy,y+Math.sin(a)*xx+Math.cos(a)*yy];});})''')
   minima=[]
   for row in points:
    values=[]
    for x,y in row:
     box=(max(0,int(x)-3),max(0,int(y)-3),min(1280,int(x)+4),min(850,int(y)+4));values.append(max(hi for lo,hi in diff.crop(box).getextrema()))
    minima.append(max(values))
   report['perShipOutlineDifference']=minima;check('every shield has a visible GPU pixel contribution',min(minima)>8)
   report['resourcesStart']=page.evaluate('shieldGPUReplay.renderer.snapshot()')
   page.evaluate('''()=>{const p=shieldGPUReplay;window.__qualityFleet=[p.fleet[0],p.fleet[1],p.fleet[4]].map((r,i)=>({...r,x:420+i*215,y:425,angle:[.35,-.6,.9][i],motion:0}));p.renderer.setFleet(__qualityFleet);}''')
   frozen=page.evaluate('''()=>{const p=shieldGPUReplay.renderer,h=Object.freeze({x:__qualityFleet[0].rx,y:0,born:0,strength:1});const before=JSON.stringify(h);p.hit(0,h);return before===JSON.stringify(h);}''');check('immutable impact input remains unchanged',frozen)
   before,_=capture('contact-reference','()=>shieldGPUReplay.renderer.render(100,{effects:false})')
   active,st=capture('contact-wave-100','()=>shieldGPUReplay.renderer.render(100,{effects:true})')
   contact=page.evaluate('''()=>{const r=__qualityFleet[0];return {x:r.x+Math.cos(r.angle)*r.rx,y:r.y+Math.sin(r.angle)*r.rx};}''')
   x,y=contact['x'],contact['y'];roi=ImageChops.difference(before,active).crop((int(x)-3,int(y)-3,int(x)+4,int(y)+4))
   check('contact flash lands on the rotated impact point',max(hi for lo,hi in roi.getextrema())>40)
   later,_=capture('wave-350','()=>shieldGPUReplay.renderer.render(350,{effects:true})');check('expanding wave and shimmer visibly animate',ImageChops.difference(active,later).getbbox() is not None)
   expired,st=capture('expired-900','()=>shieldGPUReplay.renderer.render(900,{effects:true})')
   expiredOff,_=capture('expired-reference','()=>shieldGPUReplay.renderer.render(900,{effects:false})')
   check('normal expiry removes every effect pixel',st['active']==0 and ImageChops.difference(expired,expiredOff).getbbox() is None)
   page.evaluate('()=>shieldGPUReplay.renderer.hit(0,{x:__qualityFleet[0].rx,y:0,born:1000,collapse:true})')
   collapse,st=capture('collapse-early','()=>shieldGPUReplay.renderer.render(1100,{effects:true})')
   check('collapse is visible',st['active']==1 and ImageChops.difference(collapse,expiredOff).getbbox() is not None)
   collapseEnd,st=capture('collapse-expired','()=>shieldGPUReplay.renderer.render(1430,{effects:true})')
   collapseRef,_=capture('collapse-reference','()=>shieldGPUReplay.renderer.render(1430,{effects:false})')
   check('collapse expiry removes every effect pixel',st['active']==0 and ImageChops.difference(collapseEnd,collapseRef).getbbox() is None)
   page.evaluate('()=>{const r=shieldGPUReplay.renderer;r.hit(0,{x:15,y:0,born:2000,strength:.6});r.hit(0,{x:20,y:0,born:2200,strength:1.6});}')
   refresh,st=capture('refreshed','()=>shieldGPUReplay.renderer.render(2250,{effects:true})');check('repeated hit refreshes one bounded effect slot',st['active']==1)
   page.evaluate('''()=>{const p=shieldGPUReplay;window.__overlap=[{...__qualityFleet[0],x:630,y:425,angle:0},{...__qualityFleet[1],x:650,y:425,angle:0}];p.renderer.setFleet(__overlap);}''')
   bg,_=capture('overlap-base','()=>shieldGPUReplay.renderer.render(100,{effects:false,ships:false})')
   aa,_=capture('overlap-a','()=>{const r=shieldGPUReplay.renderer;r.hit(0,{x:30,y:0,born:0});r.hide(1);return r.render(100,{effects:true,ships:false});}')
   bb,_=capture('overlap-b','()=>{const r=shieldGPUReplay.renderer;r.hide(0);r.hit(1,{x:-20,y:0,born:0});return r.render(100,{effects:true,ships:false});}')
   ab,_=capture('overlap-combined','()=>{const r=shieldGPUReplay.renderer;r.hit(0,{x:30,y:0,born:0});r.hit(1,{x:-20,y:0,born:0});return r.render(100,{effects:true,ships:false});}')
   maxError=max(abs(min(255,max(0,a+b-c))-d) for a,b,c,d in zip(aa.tobytes(),bb.tobytes(),bg.tobytes(),ab.tobytes()))
   report['overlapAdditiveMaxChannelError']=maxError;check('overlapping fields accumulate light without occluding each other',maxError<=2)
   budget=page.evaluate('''()=>{const r=shieldGPUReplay.renderer;let rejected=false;try{r.setFleet(new Array(129).fill(__qualityFleet[0]));}catch(e){rejected=true;}return rejected&&!r.hit(-1,{born:0});}''');check('fixed capacity and invalid hit rejection',budget)
   report['resourcesEnd']=page.evaluate('shieldGPUReplay.renderer.snapshot()');check('no new texture uploads or retained GPU storage',report['resourcesStart']['textureUploads']==report['resourcesEnd']['textureUploads'] and report['resourcesStart']['textureBytes']==report['resourcesEnd']['textureBytes'] and report['resourcesStart']['bufferBytes']==report['resourcesEnd']['bufferBytes'])
   check('no GL errors',page.evaluate('shieldGPUReplay.renderer.gl.getError()')==0);check('no browser errors',not errors)
   page.evaluate('shieldGPUReplay.renderer.destroy()');check('explicit resource disposal',page.evaluate('shieldGPUReplay.renderer.snapshot().disposed'))
   browser.close();report['passed']=True
 except BaseException as e:report['error']=repr(e);report['passed']=False;raise
 finally:(out/'results.json').write_text(json.dumps(report,indent=2));server.shutdown()
 print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'minimumShieldPixelDifference':min(minima)}))

if __name__=='__main__':main()
