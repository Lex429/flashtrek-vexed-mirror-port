"""Visible star fade, empty buffer, colored wisps and unchanged Badlands interior."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/badlands-approach';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];failed=[];report={'stages':[],'colors':[],'neighbors':[]}
MOVE='''({x,y,seconds,system=73})=>{const s=nativeNpcDev.getState();nativeGalaxyFog.dispose();nativeShipMotion.stop(s);const body=nativeSystemCatalog.homeId(system);Object.assign(s,{system,x,y,localBody:body,localBodySystem:system,localNavTarget:body,manualTargetSystem:0,localCruise:null,arrivalApproach:null,landed:false});s.shipSimulation.seconds=seconds;nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);nativeSimulationHost.reset(performance.now());}'''
CAPTURE='''()=>{const s=nativeNpcDev.getState(),p=vexedSolFlight.shipPosition(s),v={w:1280,h:850,playerX:p.x,playerY:p.y,cameraX:p.x,cameraY:p.y},a=nativeManualFlight.chartShipPosition(s),c=document.createElement('canvas');c.width=1280;c.height=850;const field=nativeRegionalStarfield.create();field.render(c.getContext('2d'),v,vexedSpaceModel.create(s.system).state);return {chart:a,approach:nativeBadlands.approach(a.x,a.y),stars:field.metrics(),suns:nativeStellarBackground.project(s.system,v).length,nebula:nativeParallaxNebulae.sample(s.system,v,s.shipSimulation.seconds),materials:nativeGalaxyFog.materials().map(m=>({id:m.id,ready:!!m.field?.ready})),gas:nativeNebulaGas.metrics()};}'''
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850})
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.locator('[data-menu="dev"]').click(timeout=60000)
  page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200&&nativeCombatShots.isReady()',timeout=120000)
  report['neighbors']=page.evaluate('''()=>{
   const earth=nativeManualFlight.chartPosition(1),center=nativeManualFlight.anchor(73),rows=nativeManualFlight.boundaries().filter(r=>r.id!==73&&Math.hypot((r.x-center.x)/64000,(r.y-center.y)/48000)<2.5);
   return rows.map(r=>{const origin=nativeManualFlight.anchor(r.id);let closest=null;
    for(let a=0;a<Math.PI*2;a+=.04){const x=r.x+Math.cos(a)*r.rx,y=r.y+Math.sin(a)*r.ry,q=Math.hypot((x-center.x)/64000,(y-center.y)/48000);if(!closest||q<closest.q)closest={x,y,q};}
    const field=nativeRegionalStarfield.create(),canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;const v={w:600,h:400,playerX:closest.x-origin.x,playerY:closest.y-origin.y,cameraX:closest.x-origin.x,cameraY:closest.y-origin.y};field.render(canvas.getContext('2d'),v,vexedSpaceModel.create(r.id).state);
    const suns=nativeStellarBackground.project(r.id,v),stars=field.metrics();if(stars.skyFade!==1||stars.draws===0||suns.some(s=>s.intensity!==(s.primary?1:.72)))throw Error('A neighboring system lost its normal sky: '+r.name);
    return {id:r.id,name:r.name,stars:stars.draws,skyFade:stars.skyFade,suns:suns.length};
   });
  }''')
  for system in [58,47,50,41]:
   point=page.evaluate('id=>{const sun=nativeStellarBackground.sources(id)[0];return {system:id,x:sun.worldX+800,y:sun.worldY+100,seconds:160};}',system)
   page.evaluate(MOVE,point);page.wait_for_timeout(500);row=page.evaluate(CAPTURE)
   assert row['stars']['skyFade']==1 and row['stars']['draws']>0 and row['suns']>0,row
   page.screenshot(path=str(OUT/f'neighbor-{system}.png'))
  def target(distance,index=0):
   return page.evaluate('''({distance,index})=>{const p=nativeParallaxNebulae.plume(index,index*18+160),c=nativeBadlands.centre,angle=Math.atan2((p.y-c.y)/48,(p.x-c.x)/64),q=nativeBadlands.approach(c.x+Math.cos(angle)*128,c.y+Math.sin(angle)*96),fringe=1/(q.distance-1),radius=distance<=1?distance:1+(distance-1)*fringe;return {x:Math.cos(angle)*64000*radius,y:Math.sin(angle)*48000*radius,seconds:index*18+160};}''',{'distance':distance,'index':index})
  for name,distance in [('normal-stars',2.5),('fading-stars',2.05),('few-stars',1.82),('starless-buffer',1.55),('colored-wisps',1.32),('building-plasma',1.12),('badlands-border',.997),('interior',.65)]:
   page.evaluate(MOVE,target(distance));page.wait_for_timeout(500)
   if distance<1.2:page.wait_for_function('()=>nativeGalaxyFog.materials().some(m=>m.field.ready)',timeout=60000)
   row=page.evaluate(CAPTURE);row['name']=name;report['stages'].append(row);page.screenshot(path=str(OUT/(name+'.png')))
   if distance<=1.62:assert row['stars']['draws']==0 and row['suns']==0,row
   if name=='starless-buffer':assert row['nebula']['density']==0 and not row['materials'],row
  assert report['stages'][0]['approach']['stars']==1
  assert 0<report['stages'][2]['approach']['stars']<report['stages'][1]['approach']['stars']<1
  assert report['stages'][-1]['nebula']['density']>=.84
  # Inspect real outer cloud centers for each retained gas palette.
  for index in range(5):
   point=page.evaluate('''i=>{const seconds=i*18+160,p=nativeParallaxNebulae.plume(i,seconds),c=nativeBadlands.centre;return {x:(p.x-c.x)*1000,y:(p.y-c.y)*1000,seconds};}''',index)
   page.evaluate(MOVE,point);page.wait_for_function('i=>nativeGalaxyFog.materials().some(m=>m.id.startsWith("badlands-plume:"+i+":")&&m.field?.ready)',arg=index,timeout=60000);page.wait_for_timeout(150);row=page.evaluate(CAPTURE);report['colors'].append(row)
   assert row['stars']['draws']==0 and row['nebula']['regions'],row
   page.screenshot(path=str(OUT/f'outer-color-{index}.png'))
  styles={p['style'] for row in report['colors'] for p in row['nebula']['regions'] if p['id'].startswith('badlands-plume:')}
  assert len(styles)>=4,styles
  assert not errors and not failed,(errors,failed)
  report.update(passed=True,errors=errors,failed=failed);(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps({'passed':True,'stars':[r['approach']['stars'] for r in report['stages']],'nebula':[r['nebula']['density'] for r in report['stages']],'styles':sorted(styles)}));browser.close()
finally:server.shutdown();server.server_close()
