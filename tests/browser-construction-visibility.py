"""The complete yard, deliveries, workers and launch fit responsive showcase stages."""
import functools, http.server, json, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'/'construction-visibility'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge')
  browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1440,'height':900})
  page.on('pageerror',lambda e:errors.append(str(e)))
  # Previously supplied close-up links must now show the full scene, too.
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/flashtrek-broken-mirror/damage-showcase.html?view=construction&build=35&speed=2&zoom=3')
  page.wait_for_function('()=>showcaseShipConstruction.snapshot().ready&&shipConstructionView.snapshot().last?.camera?.mode==="fit"')
  rows=[]
  for width,height in [(1440,900),(1280,720),(1024,768),(800,600),(390,844),(375,667)]:
   page.set_viewport_size({'width':width,'height':height})
   page.wait_for_timeout(120)
   for ship in [35,7,449]:
    page.locator('[data-construction-ship]').select_option(str(ship))
    page.wait_for_function('id=>showcaseShipConstruction.snapshot().ready&&showcaseShipConstruction.snapshot().ship===id',arg=ship)
    for progress in [0,14,42,72,90,95,98,100]:
     page.locator('[data-construction-scrub]').evaluate('(e,p)=>{e.value=p;e.dispatchEvent(new Event("input",{bubbles:true}));}',progress)
     page.wait_for_function('p=>Math.abs((shipConstructionView.snapshot().last?.progress??-1)-p/100)<.00001',arg=progress)
     check=page.evaluate('''()=>{
      const c=document.querySelector('.construction-stage canvas'),stage=c.parentElement,s=shipConstructionView.snapshot().last,cam=s.camera;
      const fits=b=>b.minX>=-1&&b.minY>=-1&&b.maxX<=c.width+1&&b.maxY<=c.height+1;
      if(!fits(cam.bounds)||!fits(cam.shipBounds))throw Error('Scene or departing hull cropped '+JSON.stringify(cam));
      const yard={minX:s.yard.x-s.yard.w/2,minY:s.yard.y-s.yard.h/2,maxX:s.yard.x+s.yard.w/2,maxY:s.yard.y+s.yard.h/2};
      if(!fits(yard))throw Error('Yard frame cropped');
      for(const w of s.workers)if(w.x<0||w.y<0||w.x>c.width||w.y>c.height)throw Error('DOT cropped');
      for(const d of s.deliveries)if(d.position.x<0||d.position.y<0||d.position.x>c.width||d.position.y>c.height)throw Error('Delivery cropped');
      if(Math.abs(c.clientWidth-stage.clientWidth)>2||Math.abs(c.clientHeight-stage.clientHeight)>2)throw Error('Canvas does not fill its fitted stage');
      if(document.documentElement.scrollWidth>innerWidth+2)throw Error('Horizontal page clipping');
      const desktop=innerWidth>760&&innerHeight>650;
      for(const selector of ['[data-construction-ship]','[data-construction-replay]','[data-construction-pause]','[data-construction-speed]','[data-construction-scrub]','[data-construction-detail]']){
       const e=document.querySelector(selector),r=e.getBoundingClientRect();
       if(r.width<=0||r.height<=0)throw Error('Missing control '+selector);
       if(desktop&&(r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1))throw Error('Desktop control outside viewport '+selector);
       for(let parent=e.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
        const style=getComputedStyle(parent),p=parent.getBoundingClientRect();
        if(['hidden','clip'].includes(style.overflowY)&&(r.top<p.top-2||r.bottom>p.bottom+2))throw Error('Control clipped by parent '+selector);
       }
      }
      return {canvas:[c.width,c.height],fit:true};
     }''')
     rows.append({'viewport':[width,height],'ship':ship,'progress':progress,**check})
   page.locator('[data-construction-ship]').select_option('35')
   page.wait_for_function('()=>showcaseShipConstruction.snapshot().ready&&showcaseShipConstruction.snapshot().ship===35')
   page.locator('[data-construction-scrub]').evaluate('(e)=>{e.value=72;e.dispatchEvent(new Event("input",{bubbles:true}));}')
   page.wait_for_timeout(80)
   page.screenshot(path=str(OUT/f'{width}x{height}.png'),full_page=width<=760 or height<=650)
  assert not errors,errors
  report={'passed':True,'checks':len(rows),'viewports':6,'hulls':3,'legacyZoomFits':True,'errors':errors,'cases':rows}
  (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
  print(json.dumps({k:v for k,v in report.items() if k!='cases'}),flush=True)
  browser.close()
finally:
 server.shutdown()
