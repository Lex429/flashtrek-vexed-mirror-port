"""Offscreen NPC mining while flying: gameplay assertions and comparable frame samples.

Default runs one 18-second window; --repetitions 3 --seconds 20 measures longer.
Use --revision SHA --label before, then --label after with the same saved fleet.
Timing is diagnostic; zero offscreen ore draws/cache work is the regression gate.
"""
import argparse
import functools
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'
spec=importlib.util.spec_from_file_location('stability',ROOT/'tests/browser-stability.py')
stability=importlib.util.module_from_spec(spec);spec.loader.exec_module(stability)

SETUP=r'''(saved)=>{
  localStorage.setItem('broken-mirror-native-save',saved);resumeNativeGame();
  const s=nativeNpcDev.getState();window.__oreState=s;
  nativeNpcLives.initialize(s);
  Object.assign(s,{system:1,localBody:3,x:30000,y:28000,speed:0,angle:0,landed:false,arrivalApproach:null,localCruise:null});
  const field=nativeSolAsteroids.forSystem(1),gone=new Set([...(s.minedAsteroids||[]),...(s.destroyedAsteroids||[])]);
  const rocks=field.filter(r=>!r.demo&&!gone.has(r.slotId)&&!s.civilianTraffic.life.reservations['rock:'+r.slotId]);
  // A reproducible accumulated backlog, completed through the real ore owner.
  const deposits=rocks.slice(0,60);for(const r of deposits)nativeAsteroidCombat.completeMining(s,r);
  const miners=s.civilianTraffic.ships.filter(ship=>ship.role==='mining'&&ship.hull>0&&!ship.cargo&&!ship.scriptedDemo&&!ship.needsDockRecovery&&!ship.dockingMove&&!ship.journey).slice(0,4);
  if(miners.length!==4)throw Error('Expected four existing miners');
  miners.forEach((ship,i)=>{
    nativeNpcLives.interrupt(s,ship,'performance fixture');
    // Keep this short timing scenario on local claims; expedition behavior is
    // covered separately and would spend the window travelling between systems.
    const r=rocks[60+i*5];Object.assign(ship,{system:1,operatingBase:1,port:3,x:r.x+110,y:r.y+40,speed:0,oreHold:0,miningTrips:(4-ship.id%3)%3});
    nativeNpcLives.refreshLocation(s,ship);nativeNpcLives.resumeWork(s,ship,'performance fixture ready');
  });
  nativeAsteroidCombat.deselect();
  window.__oreMiners=miners;window.__oreDeposits=deposits;
  return {population:s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,
    miners:miners.map(ship=>({id:ship.id,mined:ship.mined||0})),position:{x:s.x,y:s.y},deposits:deposits.length};
}'''

PROBE=r'''()=>{
  const s=__oreState,api=nativeAsteroidCombat,original=api.paint,proto=CanvasRenderingContext2D.prototype;
  const calls={drawImage:0,arc:0,fillRect:0,gradients:0,filters:0,artRequests:0,pixelReads:0};
  let inside=false;const restored=[];
  function wrap(object,key,field,guard=()=>true){const old=object[key];object[key]=function(...args){if(inside&&guard(this,args))calls[field]++;return old.apply(this,args);};restored.push(()=>object[key]=old);}
  wrap(proto,'drawImage','drawImage');wrap(proto,'arc','arc');wrap(proto,'fillRect','fillRect');wrap(proto,'createRadialGradient','gradients');wrap(proto,'getImageData','pixelReads');
  const filter=Object.getOwnPropertyDescriptor(proto,'filter');
  Object.defineProperty(proto,'filter',{...filter,set(value){if(inside&&value!=='none')calls.filters++;filter.set.call(this,value);}});
  restored.push(()=>Object.defineProperty(proto,'filter',filter));
  wrap(nativeSolAsteroids,'image','artRequests');
  // Collection fades are visual only; the saved ore masks remain authoritative.
  for(const rock of __oreDeposits.slice(0,8))api.collectField(rock,[0,1,2,3]);
  const cacheBefore=window.nativeOreSpriteCache?.snapshot(),before=JSON.stringify(s);
  try{
    const canvas=document.querySelector('#space'),ctx=canvas.getContext('2d'),view=nativeView.measure(canvas),ship=vexedSolFlight.shipPosition(s);
    ctx.save();inside=true;
    try{original(ctx,{state:s,ship,cx:view.w/2,cy:view.h/2,zoom:1,w:view.w,h:view.h});}
    finally{inside=false;ctx.restore();}
  }finally{for(const restore of restored.reverse())restore();}
  return {calls,cacheBefore,cacheAfter:window.nativeOreSpriteCache?.snapshot(),unchanged:JSON.stringify(s)===before};
}'''

VISIBLE=r'''async ()=>{
  const cache=window.nativeOreSpriteCache;if(!cache)return null;
  const art=nativeSolAsteroids.image(__oreDeposits[0].oreImage);await art.decode();
  const rows=[];
  for(const ratio of [1,1.5,2]){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128*ratio;
    const g=canvas.getContext('2d');g.scale(ratio,ratio);
    const before=cache.snapshot();cache.draw(g,art,{x:64,y:64,size:24,glow:12});
    const cold=g.getImageData(0,0,canvas.width,canvas.height).data;
    g.clearRect(0,0,128,128);cache.draw(g,art,{x:64,y:64,size:24,glow:12});
    const warm=g.getImageData(0,0,canvas.width,canvas.height).data,after=cache.snapshot();
    let opaque=0,halo=0,difference=0;
    for(let i=0;i<cold.length;i+=4){if(cold[i+3])opaque++;difference+=Math.abs(cold[i]-warm[i])+Math.abs(cold[i+1]-warm[i+1])+Math.abs(cold[i+2]-warm[i+2])+Math.abs(cold[i+3]-warm[i+3]);
      const x=i/4%canvas.width/ratio,y=Math.floor(i/4/canvas.width)/ratio;
      if((Math.abs(x-64)>13||Math.abs(y-64)>13)&&cold[i+3])halo++;
    }
    rows.push({ratio,opaque,halo,meanChannelDifference:difference/cold.length,builds:after.counters.builds-before.counters.builds,hits:after.counters.hits-before.counters.hits});
  }
  return rows;
}'''

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision');parser.add_argument('--label',default='after')
    parser.add_argument('--seconds',type=float,default=18);parser.add_argument('--repetitions',type=int,default=1)
    parser.add_argument('--base-url')
    parser.add_argument('--fixture',type=Path,default=OUTPUT/'npc-performance-initial-save.json')
    args=parser.parse_args();OUTPUT.mkdir(exist_ok=True)
    stability.legacy.SnapshotHandler.revision=args.revision
    server=None
    if args.base_url:base=args.base_url.rstrip('/')
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(stability.legacy.SnapshotHandler,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
    report={'revision':args.revision or 'working tree','viewport':{'width':1280,'height':850},'seconds':args.seconds,'runs':[]}
    errors=[]
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            report.update(browserVersion=browser.version,channel=channel)
            for repeat in range(args.repetitions):
                page=browser.new_page(viewport=report['viewport']);page.add_init_script('('+stability.INSTRUMENT+')()')
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(base+'/html-games/broken-mirror-port/index.html')
                page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
                page.evaluate(stability.INSTALL)
                page.wait_for_function('()=>nativeSolAsteroids.placements.length&&nativeCivilianTraffic.effectsReady()',timeout=120000)
                fixture=args.fixture
                if not fixture.exists():
                    fixture.parent.mkdir(parents=True,exist_ok=True)
                    fixture.write_text(page.evaluate('JSON.stringify(nativeNpcDev.getState())'),encoding='utf-8')
                saved=fixture.read_text(encoding='utf-8');report['initialSaveSha256']=hashlib.sha256(fixture.read_bytes()).hexdigest()
                initial=page.evaluate(SETUP,saved)
                initial_save=json.loads(saved)
                medical_added=3 if page.evaluate('()=>!!window.nativeShipRepairs') and not initial_save.get('shipRepairs',{}).get('medicalFleetVersion') else 0
                expected_population=len(initial_save['civilianTraffic']['ships'])+len(initial_save['solEconomy']['freighters'])+1+medical_added
                assert initial['population']==expected_population,initial
                try:
                    page.wait_for_function('()=>__oreMiners.every(ship=>ship.task?.kind==="mining"&&ship.task.status==="active")',timeout=10000)
                except Exception as error:
                    raise AssertionError(page.evaluate('()=>({clock:nativeSimulation.seconds(__oreState),blocked:nativeSimulation.blocked(),miners:__oreMiners.map(ship=>({id:ship.id,phase:ship.phase,task:ship.task,credits:ship.credits,next:ship.nextActionAt})),metrics:nativeNpcLives.metrics(__oreState)})')) from error
                initial['claims']=page.evaluate('__oreMiners.map(ship=>ship.task.requirements.rockId)')
                page.locator('#space').focus();page.keyboard.down('ArrowUp')
                probe=page.evaluate(PROBE);assert probe['unchanged'],probe
                if not args.revision:
                    assert all(value==0 for value in probe['calls'].values()),probe
                    assert probe['cacheBefore']==probe['cacheAfter'],probe
                stability.reset_measurement(page)
                page.wait_for_timeout(args.seconds*1000)
                page.keyboard.up('ArrowUp');page.evaluate('__stability.record=false')
                after=page.evaluate('''()=>({system:__oreState.system,position:{x:__oreState.x,y:__oreState.y},miners:__oreMiners.map(ship=>({id:ship.id,mined:ship.mined||0,cargo:ship.cargo,task:ship.task})),population:__oreState.civilianTraffic.ships.length+__oreState.solEconomy.freighters.length+1,cache:window.nativeOreSpriteCache?.snapshot(),clock:nativeSimulation.seconds(__oreState),oreMask:__oreState.asteroidOreDrops})''')
                assert after['population']==initial['population']
                assert after['system']==1,'Scenario must stay in the miners\' system to exercise viewport culling'
                assert abs(after['position']['x']-initial['position']['x'])+abs(after['position']['y']-initial['position']['y'])>100,'Player did not fly'
                for before,ship,claim in zip(initial['miners'],after['miners'],initial['claims']):
                    assert ship['mined']>=before['mined']+4,(before,ship)
                    assert after['oreMask'][str(claim)]==0,(claim,ship)
                if not args.revision:
                    assert after['cache']==probe['cacheAfter'],'Offscreen flight built or used ore sprites'
                samples=page.evaluate('__stability.frames');assert len(samples)>30
                entry={**stability.summarize(samples),'initial':initial,'after':after,'offscreenProbe':probe}
                if not args.revision:
                    entry['visiblePixels']=page.evaluate(VISIBLE)
                    for row in entry['visiblePixels']:
                        # Canvas readback can switch GPU/CPU rounding. Allow
                        # <0.05 of one 8-bit channel step averaged per pixel.
                        assert row['opaque']>0 and row['halo']>0 and row['meanChannelDifference']<.05,row
                        assert row['builds']==1 and row['hits']==1,row
                report['runs'].append(entry)
                (OUTPUT/f'ore-performance-{args.label}-{repeat+1}-frames.json').write_text(json.dumps(samples),encoding='utf-8')
                page.screenshot(path=str(OUTPUT/f'ore-performance-{args.label}-{repeat+1}.png'))
                page.close()
                print(json.dumps({'repeat':repeat+1,'simulationMean':entry['simulationMs']['mean'],'renderMean':entry['renderMs']['mean'],'intervalP95':entry['intervalMs']['p95'],'offscreenCalls':probe['calls']}),flush=True)
            browser.close();report.update(passed=not errors,javascriptErrors=errors)
            (OUTPUT/f'ore-performance-{args.label}.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            assert not errors,errors
    finally:
        if server:server.shutdown()

if __name__=='__main__':main()
