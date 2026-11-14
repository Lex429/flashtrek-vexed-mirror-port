"""Real galaxy weather, removed regions and shared all-hull gas interaction."""
import argparse
import functools
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root',type=Path,default=ROOT)
parser.add_argument('--output',type=Path,default=ROOT/'test-results/galaxy-nebula-weather-20261111/browser')
args=parser.parse_args();OUT=args.output;OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(args.source_root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
MOVE=r'''({x,y,system=2})=>{
 const s=nativeNpcDev.getState(),origin=nativeManualFlight.chartPosition(system);nativeShipMotion.stop(s);
 const target={x:(x-origin.x)*1000,y:(y-origin.y)*1000};
 Object.assign(s,{system,x:target.x,y:target.y,localBody:system===1?3:0,angle:0,phase:'flight',landed:false,localCruise:null,arrivalApproach:null});
 if(system===1){const actual=vexedSolFlight.shipPosition(s);s.x+=target.x-actual.x;s.y+=target.y-actual.y;}
 nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);return {x:s.x,y:s.y};
}'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge');page=browser.new_page(viewport={'width':1280,'height':850});errors=[];failed=[];photos=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
  page.on('request',lambda r:photos.append(r.url) if '/assets/nebulae/' in r.url else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
  page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('startNativeDevGame()');page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
  report={'regions':{},'errors':errors,'failed':failed}
  for name,x,y in [('azure',13,11),('tibor',-121,104),('bassen',-85,210),('badlands',-139.8,-30.7)]:
   page.evaluate(MOVE,{'x':x,'y':y})
   page.wait_for_function('()=>nativeGalaxyFog.materials().some(m=>m.field.ready&&m.bodies.length>0)',timeout=120000)
   page.wait_for_timeout(250)
   state=page.evaluate('()=>({sky:vexedSpace.nebulae,fog:nativeGalaxyFog.snapshot(),population:nativeNpcDev.getState().civilianTraffic.ships.length})')
   limit=16 if name=='badlands' else 3
   assert state['fog']['active']>0 and state['fog']['retained']<=limit and state['population']==1200,state
   assert any(c['material']['transport']=='worker' for c in state['fog']['cores']),state
   report['regions'][name]=state;page.screenshot(path=str(OUT/(name+'.png')))
  for system in [32,33,34]:
   point=page.evaluate('id=>nativeManualFlight.chartPosition(id)',system);page.evaluate(MOVE,{**point,'system':system})
   page.wait_for_function('()=>vexedSpace.nebulae?.draws===0&&nativeGalaxyFog.materials().length===0',timeout=30000)
   page.screenshot(path=str(OUT/f'clear-{system}.png'))
  page.evaluate(MOVE,{'x':13,'y':11,'system':1});page.wait_for_function('()=>nativeGalaxyFog.materials().some(m=>m.field.ready)',timeout=120000)
  # An actual key-driven pass changes the shared field, rather than a visual
  # screen mask alone. Keep the existing fleet and native movement statistics.
  before=page.evaluate('()=>{const m=nativeGalaxyFog.materials()[0];return {id:m.id,metrics:m.field.metrics(true),accepted:m.field.acceptedSequence};}')
  page.keyboard.down('w');page.wait_for_timeout(1300);page.keyboard.up('w');page.keyboard.down('x');page.wait_for_timeout(1200);page.keyboard.up('x')
  after=page.evaluate('()=>{const m=nativeGalaxyFog.materials()[0];return {id:m.id,metrics:m.field.metrics(true),accepted:m.field.acceptedSequence};}')
  assert after['id']==before['id'] and after['metrics']['sweeps']>before['metrics']['sweeps'] and after['accepted']>before['accepted'],(before,after)
  assert abs(after['metrics']['mass']-after['metrics']['initialMass'])/after['metrics']['initialMass']<.0001,after
  report['flight']={'before':before,'after':after};page.screenshot(path=str(OUT/'azure-wake.png'))
  # Optical formation/dispersal scales the resolved material, preserving its
  # displacement and conserved density in both the paired GPU layers.
  report['opticalFade']=page.evaluate('''()=>{
   const api=nativeNebulaMaterial,m=nativeGalaxyFog.materials()[0],source=document.createElement('canvas');source.width=400;source.height=300;const g=source.getContext('2d');g.fillStyle='#3d83dc';g.fillRect(0,0,400,300);
   const b=m.bodies[0],v={w:400,h:300,cameraX:b.pose.x+100,cameraY:b.pose.y,zoom:1},values=[];
   for(const opacity of [1,.5,0]){const pair=api.renderPair(v,source,m.field,m.bodies,{opacity}),pixels=pair.back.getContext('2d').getImageData(0,0,400,300).data;let alpha=0;for(let i=3;i<pixels.length;i+=4)alpha+=pixels[i];values.push(alpha);}
   if(!(values[0]>values[1]&&values[1]>0&&values[2]===0))throw Error('Gas does not fade through its paired layers '+values);return values;
  }''')
  # Move only the camera out and back. The same field and its clock must survive.
  report['cameraRetention']=page.evaluate('''async()=>{
   const s=nativeNpcDev.getState(),m=nativeGalaxyFog.materials()[0],field=m.field,p=vexedSolFlight.shipPosition(s),base={w:1280,h:800,ship:p,cameraX:p.x,cameraY:p.y,zoom:1};
   nativeGalaxyFog.frame(s,1/120,{...base,cameraX:p.x+5000});nativeGalaxyFog.frame(s,1/120,base);const next=nativeGalaxyFog.materials().find(n=>n.id===m.id);
   if(!next||next.field!==field)throw Error('Camera movement erased a persistent core');await next.field.flush();return {sameField:true,clock:next.field.clock};
  }''')
  # Find a seeded moving front, then compare its world position through time.
  report['storm']=page.evaluate('''()=>{
   const api=nativeParallaxNebulae;for(let y=-3;y<6;y++)for(let x=-6;x<5;x++){
    const a=api.candidates({x:x*48+24,y:y*48+24},450).find(p=>!p.permanent&&p.id.startsWith('storm:'+x+':'+y+':'));if(!a)continue;
    const epoch=Number(a.id.split(':').at(-1)),b=api.storm(x,y,epoch,a.born+450),c=api.storm(x,y,epoch,a.born+550);
    if(api.coverage(b,b)>.8&&api.excluded(b)===1)return {first:b,later:c};
   }throw Error('No interstellar storm fixture');
  }''')
  assert report['storm']['first']['x']!=report['storm']['later']['x']
  a=report['storm']['first'];page.evaluate('at=>{nativeNpcDev.getState().shipSimulation.seconds=at;nativeSimulationHost.reset(performance.now());}',a['born']+450)
  page.evaluate(MOVE,a);page.wait_for_function('()=>nativeGalaxyFog.materials().some(m=>m.id.startsWith("storm:"))',timeout=120000)
  page.screenshot(path=str(OUT/'moving-storm.png'))
  page.keyboard.press('Escape');page.wait_for_function('()=>nativePause.active');clock=page.evaluate('vexedSpace.nebulae.elapsed');page.wait_for_timeout(250);assert page.evaluate('vexedSpace.nebulae.elapsed')==clock
  page.keyboard.press('Escape');page.wait_for_function('()=>!nativePause.active')
  assert not errors and not failed and not photos,(errors,failed,photos)
  report.update(passed=True,removedRegions=[32,33,34],pauseStable=True,imageRequests=len(photos));(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps({'passed':True,'regions':list(report['regions']),'removed':report['removedRegions'],'fade':report['opticalFade'],'errors':errors}))
  browser.close()
finally:server.shutdown();server.server_close()
