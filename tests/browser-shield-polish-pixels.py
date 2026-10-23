"""GPU ripple travel/fade and visibility readbacks, outside performance measurements."""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
PROBE=r'''async()=>{
 const p=shieldGPUReplay,g=p.renderer.gl,r={...p.fleet[0],x:640,y:425,angle:.35,motion:0};
 p.renderer.setFleet([r]);p.renderer.hit(0,{x:r.rx,y:0,born:0,strength:1});
 function region(x,y){const a=new Uint8Array(7*7*4);g.readPixels(Math.round(x)-3,g.canvas.height-Math.round(y)-4,7,7,g.RGBA,g.UNSIGNED_BYTE,a);
  const rgb=[0,0,0];let blue=0;for(let i=0;i<a.length;i+=4){for(let k=0;k<3;k++)rgb[k]=Math.max(rgb[k],a[i+k]);blue+=a[i+2];}return {rgb,blueSum:blue};}
 const phases=[];
 for(const time of [0,40,60,75,80,150,300,440,650,900]){
  const status=p.renderer.render(time,{effects:true,ships:false,background:false});
  phases.push({time,active:status.active,front:region(r.x+Math.cos(r.angle)*r.rx,r.y+Math.sin(r.angle)*r.rx),
    back:region(r.x-Math.cos(r.angle)*r.rx,r.y-Math.sin(r.angle)*r.rx)});
 }
 const collapse=[];
 p.renderer.hit(0,{x:r.rx,y:0,born:0,strength:1,collapse:true});
 for(const time of [0,100,250,429,430]){
  p.renderer.render(time,{effects:true,ships:false,background:false});
  const a=new Uint8Array(g.canvas.width*g.canvas.height*4);g.readPixels(0,0,g.canvas.width,g.canvas.height,g.RGBA,g.UNSIGNED_BYTE,a);
  const digest=await crypto.subtle.digest('SHA-256',a);collapse.push({time,sha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')});
 }
 p.reset();let minContactBlue=255,minActive=100;
 for(let t=5000;t<=5450;t+=25){
  const status=p.paint(t,true);minActive=Math.min(minActive,status.fullyActive);
  for(let i=0;i<100;i++){
   const s=p.fleet[i],a=s.angle+Math.sin(t*.0005+s.phase)*s.motion*.125,
    x=s.x+Math.sin(t*.0007+s.phase)*s.motion,y=s.y+Math.cos(t*.0006+s.phase)*s.motion,
    h=-.6+(i%7)*.19,lx=Math.cos(h)*s.rx*.94,ly=Math.sin(h)*s.ry*.94;
   minContactBlue=Math.min(minContactBlue,region(x+Math.cos(a)*lx-Math.sin(a)*ly,y+Math.sin(a)*lx+Math.cos(a)*ly).rgb[2]);
  }
 }
 const journeys=[];
 for(const i of [2,0,1,4,5]){
  const ship={...p.fleet[i],x:640,y:425,angle:.35,motion:0};p.renderer.setFleet([ship]);
  p.renderer.hit(0,{x:ship.rx*.94,y:0,born:0,strength:1});
  const samples=[.3,-.15,-.6,-.82].map(f=>({fraction:f,peakBlue:0,peakTime:0}));
  for(let time=0;time<=400;time+=10){
   p.renderer.render(time,{effects:true,ships:false,background:false});
   for(const point of samples){const x=ship.rx*point.fraction,c=Math.cos(ship.angle),s=Math.sin(ship.angle),a=new Uint8Array(3*3*4);
    g.readPixels(Math.round(ship.x+c*x)-1,g.canvas.height-Math.round(ship.y+s*x)-2,3,3,g.RGBA,g.UNSIGNED_BYTE,a);
    let blue=0;for(let j=2;j<a.length;j+=4)blue=Math.max(blue,a[j]);
    if(blue>point.peakBlue){point.peakBlue=blue;point.peakTime=time;}
   }
  }
  journeys.push({type:shieldReplayShips[ship.layer].id,width:ship.w,height:ship.h,samples});
 }
 return {phases,collapse,minContactBlue,minActive,journeys,glError:g.getError()};
}'''

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--baseline',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();results={}
    try:
      with sync_playwright() as p:
       for variant in ['baseline','polished']:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1);page.set_default_timeout(120000)
        source=(args.baseline/'shield-gpu.js').read_bytes() if variant=='baseline' else (ROOT/'html-games/flashtrek-broken-mirror/shield-gpu.js').read_bytes()
        page.route('**/shield-gpu.js',lambda route:route.fulfill(status=200,content_type='text/javascript',body=source))
        page.goto(f'http://127.0.0.1:{server.server_port}/demos/shield-gpu/index.html');page.wait_for_function('()=>window.shieldGPUReplay')
        results[variant]=page.evaluate(PROBE);browser.close()
      b={x['time']:x for x in results['baseline']['phases']};v={x['time']:x for x in results['polished']['phases']}
      checks={'whiteHotAt40ms':min(v[40]['front']['rgb'])>=245,
              'cyanBy80ms':v[80]['front']['rgb'][2]-v[80]['front']['rgb'][0]>80,
              'clearerCyanRimThanPolishedBaseline':v[150]['back']['blueSum']>b[150]['back']['blueSum']*1.4,
              'impactSectionBrighterThanFarRim':v[150]['front']['rgb'][2]>v[150]['back']['rgb'][2]*3,
              'rimSustainsUntilRippleCompletes':v[440]['back']['blueSum']>v[150]['back']['blueSum']*.7,
              'faintTailAt650ms':v[650]['back']['rgb'][2]>0,
              'smoothFadeAfterCrossing':0<v[650]['back']['blueSum']<v[440]['back']['blueSum'],
              'visibleJourneyOnSmallAndLargeShips':all(min(p['peakBlue'] for p in j['samples'])>=90 for j in results['polished']['journeys']),
              'rippleTravelsAcrossShieldInOrder':all(all(a['peakTime']<=b['peakTime'] for a,b in zip(j['samples'],j['samples'][1:])) for j in results['polished']['journeys']),
              'expiredAt900ms':v[900]['active']==0 and v[900]['front']['rgb']==[0,0,0],
              'collapsePixelsUnchanged':results['baseline']['collapse']==results['polished']['collapse'],
              '100ContactsRemainVisibleThroughoutHitCycle':results['polished']['minActive']==100 and results['polished']['minContactBlue']>=8,
              'noGLErrors':results['baseline']['glError']==0 and results['polished']['glError']==0}
      results.update(checks=checks,passed=all(checks.values()));print(json.dumps({'checks':checks,'minimumContactBlue':results['polished']['minContactBlue']}))
      assert results['passed'],checks
    finally:(out/'results.json').write_text(json.dumps(results,indent=2));server.shutdown()

if __name__=='__main__':main()
