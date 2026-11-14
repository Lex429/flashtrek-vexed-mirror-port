"""Restored Dev Sol defaults, durable fleet, and explicit optional isolation."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/dev-traffic';OUT.mkdir(parents=True,exist_ok=True)
report={'passed':False,'errors':[]}
try:
 with sync_playwright() as p:
  channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
  page=browser.new_page(viewport={'width':1366,'height':850})
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  url='http://127.0.0.1:7790/html-games/broken-mirror-port/index.html'
  page.goto(url+'?devTraffic=off');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('startNativeDevGame();nativeDevFog.setEnabled(true)')
  page.wait_for_function('()=>nativeDevFog.material()?.field.ready',timeout=120000)
  read='''()=>{const s=nativeNpcDev.getState(),physical=nativeShipSystems.collectShips(s);return {
   quiet:nativeDevTraffic.active(s),physical:physical.map(d=>({id:d.id,category:d.category})),
   civilians:s.civilianTraffic.ships.length,tugs:s.solEconomy.freighters.length,local:nativeCivilianTraffic.localShips(s).length,
   fogShips:nativeDevFog.snapshot().shipCount,drones:nativeShipRepairs.drones(s).length,demo:!!s.devRepairDemo,
   ids:s.civilianTraffic.ships.map(e=>e.id),x:s.x,y:s.y};}'''
  initial=page.evaluate(read)
  assert initial['quiet'] and initial['physical']==[{'id':'player','category':'player'}],initial
  assert initial['civilians']==1200 and initial['tugs']>=1 and not initial['local'] and initial['fogShips']==1,initial
  assert not initial['drones'] and not initial['demo'],initial
  weapon=page.evaluate('''()=>{const s=nativeNpcDev.getState(),npc=s.civilianTraffic.ships.find(e=>e.system===1&&e.hull>0);return nativeCombatShots.fireFor({state:s,shooter:nativeShipDefinitions.describe(s,npc,{category:'civilian'}),target:nativeShipDefinitions.describe(s)});}''')
  assert weapon['reason']=='quiet-dev',weapon
  page.locator('#space').focus();page.keyboard.down('w')
  try:page.wait_for_function('p=>{const s=nativeNpcDev.getState();return Math.hypot(s.x-p.x,s.y-p.y)>12;}',arg=initial,timeout=20000)
  finally:page.keyboard.up('w')
  after=page.evaluate(read);assert after['physical']==initial['physical'] and after['fogShips']==1,after
  assert after['ids']==initial['ids'] and after['civilians']==initial['civilians'] and after['tugs']==initial['tugs']
  page.screenshot(path=str(OUT/'quiet-dev-sol.png'))
  page.evaluate('''()=>{const s=nativeNpcDev.getState(),saved=nativeSaveStorage.write(s);if(!saved.ok)throw Error(saved.error);resumeNativeGame('dev');}''')
  page.wait_for_function('()=>nativeDevFog.material()?.field.ready',timeout=120000)
  resumed=page.evaluate(read);assert resumed['quiet'] and resumed['physical']==initial['physical'] and resumed['ids']==initial['ids'],resumed
  page.close()
  page=browser.new_page(viewport={'width':1366,'height':850});page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.goto(url);page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
  page.evaluate('startNativeDevGame()');page.wait_for_function('()=>nativeShipSystems.collectShips(nativeNpcDev.getState()).some(d=>d.category==="civilian")',timeout=120000)
  opted=page.evaluate(read);assert not opted['quiet'] and opted['civilians']==1200 and opted['local']>0,opted
  defaults=page.evaluate('''()=>{const s=nativeNpcDev.getState(),fog=nativeDevFog.snapshot();return {fogEnabled:fog.enabled,fogActive:fog.active,field:!!nativeDevFog.material(),preview:!!nativeDevFog.physicalRegion(s),stormAvailable:fog.storm.available,previewCurrents:nativeBadlandsCurrents.regions(s).filter(e=>e.id==='dev-current').length,previewVortices:nativePlasmaVortices.vortices(s).filter(e=>e.id.startsWith('dev-plasma:')).length};}''')
  assert not any(defaults.values()),defaults
  assert any(d['category']=='civilian' for d in opted['physical']),opted
  page.screenshot(path=str(OUT/'restored-dev-sol.png'))
  page.evaluate('''()=>{const result=nativeSaveStorage.write(nativeNpcDev.getState());if(!result.ok)throw Error(result.error);resumeNativeGame('dev');}''')
  page.wait_for_function('()=>nativeShipSystems.collectShips(nativeNpcDev.getState()).some(d=>d.category==="civilian")',timeout=120000)
  continued=page.evaluate(read);assert not continued['quiet'] and continued['ids']==opted['ids'] and continued['tugs']==opted['tugs'] and not page.evaluate('nativeDevFog.snapshot().enabled'),continued
  assert not report['errors'],report['errors']
  report.update(passed=True,isolatedActors=initial['physical'],retainedCivilians=initial['civilians'],retainedTugs=initial['tugs'],fogActors=after['fogShips'],flightWorks=True,continueIsolated=True,defaultTrafficRestored=True,defaultFogDisabled=True,continueRestored=True,defaults=defaults,restoredPhysicalShips=len(opted['physical']))
  browser.close()
finally:(OUT/'browser.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
