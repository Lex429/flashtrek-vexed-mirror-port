"""Cinematic shield pixel regressions. Readbacks/captures are outside clean timing."""
import argparse
import functools
import http.server
import io
import json
import os
from pathlib import Path
import threading
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
PROBE=r'''async()=>{
 const p=shieldGPUReplay,g=p.renderer.gl;
 const r={...p.fleet[0],x:640,y:425,angle:0,motion:0,w:96,h:124,rx:91,ry:91};
 p.renderer.setFleet([r]);p.renderer.hit(0,{x:r.rx*.94,y:0,born:0});
 function pixel(x,y){const a=new Uint8Array(3*3*4);g.readPixels(Math.round(x)-1,g.canvas.height-Math.round(y)-2,3,3,g.RGBA,g.UNSIGNED_BYTE,a);return [0,1,2].map(k=>{let v=0;for(let i=k;i<a.length;i+=4)v=Math.max(v,a[i]);return v;});}
 const phases=[];for(const t of [40,80,120,260,440,580,650,800,900]){
  const status=p.renderer.render(t,{effects:true,ships:false,background:false});
  phases.push({time:t,active:status.active,contact:pixel(r.x+r.rx*.94,r.y),far:pixel(r.x-r.rx,r.y)});
 }
 const scans=[];
 for(const y of [0,.45,.70]){
  p.renderer.render(260,{effects:true,ships:false,background:false});
  const values=[];for(let x=-.85;x<=.88;x+=.008)values.push({x,blue:pixel(r.x+x*r.rx,r.y+y*r.ry)[2]});scans.push({y,values});
 }
 const journeys=[];
 for(const i of [2,0,1,4,5]){
  const s={...p.fleet[i],x:640,y:425,angle:.35,motion:0};p.renderer.setFleet([s]);p.renderer.hit(0,{x:s.rx*.94,y:0,born:0});
  const points=[.3,-.15,-.6,-.82].map(f=>({fraction:f,peak:0,time:0}));
  for(let t=0;t<=600;t+=10){
   p.renderer.render(t,{effects:true,ships:false,background:false});
   for(const q of points){const x=q.fraction*s.rx,v=pixel(s.x+Math.cos(s.angle)*x,s.y+Math.sin(s.angle)*x)[2];if(v>q.peak){q.peak=v;q.time=t;}}
  }
  journeys.push({type:shieldReplayShips[s.layer].id,width:s.w,height:s.h,points});
 }
 p.renderer.setFleet([r]);p.renderer.hit(0,{x:r.rx*.94,y:0,born:0,collapse:true});const collapse=[];
 for(const time of [0,100,250,429,430]){
  p.renderer.render(time,{effects:true,ships:false,background:false});const a=new Uint8Array(g.canvas.width*g.canvas.height*4);
  g.readPixels(0,0,g.canvas.width,g.canvas.height,g.RGBA,g.UNSIGNED_BYTE,a);const hash=await crypto.subtle.digest('SHA-256',a);
  collapse.push(Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join(''));
 }
 p.reset();let active=100,fullyVisible=100,minContact=255;
 for(let t=5000;t<=5450;t+=25){const row=p.paint(t,true);active=Math.min(active,row.fullyActive);fullyVisible=Math.min(fullyVisible,row.fullyVisible);
  p.fleet.forEach((s,i)=>{const a=s.angle+Math.sin(t*.0005+s.phase)*s.motion*.125,theta=-.6+(i%7)*.19,
   x=Math.cos(theta)*s.rx*.94,y=Math.sin(theta)*s.ry*.94;
   minContact=Math.min(minContact,pixel(s.x+Math.sin(t*.0007+s.phase)*s.motion+Math.cos(a)*x-Math.sin(a)*y,
     s.y+Math.cos(t*.0006+s.phase)*s.motion+Math.sin(a)*x+Math.cos(a)*y)[2]);});
 }
 return {phases,scans,journeys,collapse,active,fullyVisible,minContact,glError:g.getError(),resources:p.renderer.snapshot()};
}'''

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--baseline',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    shader=(ROOT/'html-games/flashtrek-broken-mirror/shield-gpu.js').read_text()
    # Isolate the visible contribution of each feature in the same renderer.
    assert shader.count('branchEnvelope,.08')==1
    sources={'baseline':(args.baseline/'shield-gpu.js').read_text(),'revised':shader,
             'no-branches':shader.replace('branchEnvelope,.08','0.,.08'),
             'flat-surface':shader.replace('(depth-surfaceContact.z)*.68','(depth-surfaceContact.z)*0.')}
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    report={'scope':__doc__,'checks':{},'probes':{}}
    def check(name,value):report['checks'][name]=bool(value);assert value,name
    images={}
    try:
      with sync_playwright() as p:
       for variant,body in sources.items():
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1);page.set_default_timeout(180000)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('**/shield-gpu.js',lambda route,request,body=body:route.fulfill(status=200,content_type='text/javascript',body=body))
        page.goto(f'http://127.0.0.1:{server.server_port}/demos/shield-gpu/index.html');page.wait_for_function('()=>window.shieldGPUReplay')
        page.evaluate("document.body.classList.add('timing')")
        if variant in ['baseline','revised']:report['probes'][variant]=page.evaluate(PROBE)
        page.evaluate('''()=>{const p=shieldGPUReplay,r={...p.fleet[0],x:640,y:425,angle:0,motion:0,rx:91,ry:91,w:96,h:124};
          p.renderer.setFleet([r]);p.renderer.hit(0,{x:r.rx*.94,y:0,born:0});}''')
        for t in [40,120,260,360,650]:
          page.evaluate('(t)=>shieldGPUReplay.renderer.render(t,{effects:true,ships:false,background:false})',t)
          png=page.locator('#gpu').screenshot();(out/f'{variant}-{t}.png').write_bytes(png);images[variant,t]=Image.open(io.BytesIO(png)).convert('RGB')
        check(variant+' has no browser or GL errors',not errors and page.evaluate('shieldGPUReplay.renderer.gl.getError()')==0);browser.close()
      b=report['probes']['baseline'];v=report['probes']['revised'];phases={r['time']:r for r in v['phases']}
      check('compact white-hot contact at 40 ms',min(phases[40]['contact'])>=245)
      check('contact cools to cyan by 80 ms',phases[80]['contact'][2]-phases[80]['contact'][0]>70)
      check('outer rim is quieter than current GPU',phases[120]['far'][2]<next(r for r in b['phases'] if r['time']==120)['far'][2]*.65)
      check('contact is much brighter than distant boundary',phases[120]['contact'][2]>phases[120]['far'][2]*4)
      check('main waves visible on small and large ships',all(min(p['peak'] for p in j['points'])>=70 for j in v['journeys']))
      check('wave crosses every sampled ship before fading',all(max(p['time'] for p in j['points'])<600 for j in v['journeys']))
      check('first wave travels in order',all(all(a['time']<=b['time'] for a,b in zip(j['points'],j['points'][1:])) for j in v['journeys']))
      # Count separated bright bands on an interior scan, away from the contact.
      scan=images['no-branches',260]
      values=[{'x':(x-640)/91,'blue':max(scan.getpixel((x,y))[2] for y in [424,425,426])} for x in range(563,704)]
      bands=[];start=None
      for point in values+[{'x':2,'blue':0}]:
        if point['blue']>=30 and start is None:start=point['x']
        if point['blue']<30 and start is not None:bands.append([start,point['x']]);start=None
      report['interiorWaveBands']=bands
      check('three readable interior wavefronts',len(bands)>=3)
      branches=ImageChops.difference(images['revised',120],images['no-branches',120]);report['branchPixels']=sum(max(p)>12 for p in branches.get_flattened_data())
      check('brief branching electricity contributes visible pixels',report['branchPixels']>60)
      check('electricity has expired by 360 ms',ImageChops.difference(images['revised',360],images['no-branches',360]).getbbox() is None)
      curved=ImageChops.difference(images['revised',260],images['flat-surface',260]);report['curvedSurfacePixels']=sum(max(p)>12 for p in curved.get_flattened_data())
      check('curvature changes projected wave shapes',report['curvedSurfacePixels']>150)
      # A broad, opaque fill would light most of this interior. Thin waves must not.
      patch=images['revised',260].crop((585,370,695,480));bright=sum(max(p)>30 for p in patch.get_flattened_data())
      report['brightInteriorFraction']=bright/(110*110);check('most underlying hull area stays clear',report['brightInteriorFraction']<.35)
      check('smooth fading tail remains at 650 ms',0<phases[650]['far'][2]<phases[580]['far'][2])
      check('normal expiry unchanged',phases[900]['active']==0 and phases[900]['contact']==[0,0,0])
      check('collapse pixels unchanged at five ages',v['collapse']==b['collapse'])
      check('100 visible active shields throughout hit cycle',v['active']==v['fullyVisible']==100 and v['minContact']>=8)
      for key in ['textureBytes','bufferBytes','instanceBytes','textureUploads','nominalDrawingBufferBytes']:
        check('retained '+key+' unchanged',b['resources'][key]==v['resources'][key])
      report['passed']=True;print(json.dumps({'passed':True,'checks':len(report['checks']),'waveBands':bands,'branchPixels':report['branchPixels'],'brightInteriorFraction':report['brightInteriorFraction']}))
    except BaseException as error:
      report.update(passed=False,error=repr(error));raise
    finally:(out/'results.json').write_text(json.dumps(report,indent=2));server.shutdown()

if __name__=='__main__':main()
