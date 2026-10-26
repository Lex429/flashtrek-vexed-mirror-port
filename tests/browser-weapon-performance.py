"""Repeatable mixed weapons/shields load, native renderer and real game.

Use VEXED_EFFECT_TEST_ROOT for a frozen game build. The matrix keeps ordinary
game simulation active and reports all raw stalls, browser, GPU and light state.
"""
import argparse,functools,json,os,sys,tempfile,threading,shutil
from pathlib import Path
from http.server import ThreadingHTTPServer
from types import SimpleNamespace
from playwright.sync_api import sync_playwright
REPO=Path(__file__).resolve().parents[1];ROOT=Path(os.environ.get('VEXED_EFFECT_TEST_ROOT',REPO));sys.path.insert(0,str(REPO/'tools'))
from effect_lab import atomic,versions
from local_site import Handler
from validate_effect_game import validate
OUTPUT=REPO/'test-results/cinematic-weapons';OUTPUT.mkdir(parents=True,exist_ok=True)
BROWSER=Path('C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe')
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--matrix',action='store_true');parser.add_argument('--game',action='store_true')
 parser.add_argument('--seconds',type=int,default=10);parser.add_argument('--renderer-seconds',type=int,default=8);parser.add_argument('--baseline',action='store_true')
 args=parser.parse_args();counts=[10,25,50,100,200] if args.matrix else [100]
 candidate=next(p for p in json.loads((ROOT/'html-games/flashtrek-broken-mirror/effect-candidates.json').read_text())['profiles'] if p['implementation']=='cinematic-weapons-v1')
 code=versions(ROOT,candidate);fixture={'count':100,'scenario':'shielded-battle','shipType':6,'mix':True,'mixedWeapons':True,'mixedDamage':False,'rate':2,'size':44,'seed':429,'pattern':'staggered','lights':False,'shieldRenderer':'gpu','weapon':'beam:0'}
 result={'sourceRoot':str(ROOT),'profile':candidate,'code':code,'renderer':[],'games':[]}
 with tempfile.TemporaryDirectory(prefix='vexed-weapon-matrix-') as state:
  server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));server.state=Path(state)
  threading.Thread(target=server.serve_forever,daemon=True).start()
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=str(BROWSER));page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/effect-lab-scene.html');page.wait_for_function('window.__labCombat && window.effectLabScene')
    page.evaluate('(p)=>effectLabScene.command("session",p)',{'candidate':candidate,'fixture':fixture})
    manifest=page.evaluate('effectLabScene.command("manifest")')
    for lights in [False,True]:
     for count in counts:
      profiles=[('candidate',candidate)]
      if args.baseline and count==100:profiles.insert(0,('baseline',manifest['release']))
      for variant,profile in profiles:
       r=page.evaluate('(p)=>effectLabScene.command("measure",p)',{'fixture':{**fixture,'count':count,'lights':lights},'profile':profile,'variant':variant,'warmup':3,'duration':args.renderer_seconds})
       assert r['counters']['minimumVisible']==count and not errors
       assert r['code']==code==versions(ROOT,candidate)
       if variant=='candidate':
        assert r['resources']['shields']['weaponAppearance']=='cinematic-weapons-v1'
        assert r['resources']['candidate']['gpuWeaponPaints']>0
        assert not r['resources']['shields']['primitiveRejected']
       result['renderer'].append(r);atomic(OUTPUT/'performance.json',result)
       print(json.dumps({'context':'renderer','count':count,'lights':lights,'variant':variant,'fps':r['metrics']['fps'],'low1':r['metrics']['low1FPS'],'p99':r['metrics']['p99Ms'],'pass':r['metrics']['targetObserved']}),flush=True)
    page.evaluate('effectLabScene.command("stop")');browser.close()
  finally:server.shutdown();server.server_close()
  if args.game:
   for lights in [False,True]:
    for count in counts:
     v=SimpleNamespace(root=ROOT,state=Path(state),count=count,seconds=args.seconds,warmup=5,headed=True,browser_path=BROWSER)
     r=validate(v,fixture_override={**fixture,'count':count,'lights':lights},preview_profile=candidate)
     assert r['code']==code==versions(ROOT,candidate) and r['minimumVisible']==count and not r['errors']
     assert r['shields']['resources']['weaponAppearance']=='cinematic-weapons-v1'
     assert r['candidate']['gpuWeaponPaints']>0 and not r['shields']['resources']['primitiveRejected']
     result['games'].append(r);atomic(OUTPUT/'performance.json',result)
     shutil.copyfile(ROOT/'test-results/effect-lab/game-validation.png',OUTPUT/f'game-{count}-lights-{lights}.png')
     print(json.dumps({'context':'game','count':count,'lights':lights,'status':r['status'],'fps':r['metrics']['fps'],'low1':r['metrics']['low1FPS'],'p99':r['metrics']['p99Ms'],'gpuMs':r['metrics']['gpuMs']}),flush=True)
 print('Saved '+str(OUTPUT/'performance.json'),flush=True)
if __name__=='__main__':main()
