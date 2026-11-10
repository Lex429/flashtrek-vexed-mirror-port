"""One full-fleet warp pacing diagnostic. No screenshots/slot reads during capture.

Sequential variants reuse the exact seed and viewport; these headless samples
are not foreground monitor refresh qualification. Set WARP_PACING_LABEL.
"""
import functools,hashlib,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/warp-pacing';OUT.mkdir(parents=True,exist_ok=True)
LABEL=os.environ.get('WARP_PACING_LABEL','after');SEED=OUT/'fixture.json'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];failed=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850})
        baseline={}
        if os.environ.get('WARP_PACING_SOURCE')=='before':
            for name in ['native-game.js','warp-transition.js','warp-transition.css','world-bootstrap.js','world-bootstrap-worker.js','system-streaming.js','ship-effects.js','showcase-stage-fragments.js']:
                source=(OUT/'before'/name).read_text(encoding='utf8');baseline[name]=source
                page.context.route('**/'+name+'?*',lambda route,request,source=source,name=name:route.fulfill(status=200,content_type='text/css' if name.endswith('.css') else 'text/javascript',body=source))
        hashes={str(file.relative_to(ROOT)):hashlib.sha256((baseline.get(file.name) or file.read_text(encoding='utf8')).encode()).hexdigest() for folder in ['broken-mirror-port','flashtrek-broken-mirror'] for file in (ROOT/'html-games'/folder).glob('*.js')}
        page.on('pageerror',lambda error:errors.append(str(error)));page.on('response',lambda response:failed.append(response.url) if response.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        if not SEED.exists():
            page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
            seed=page.evaluate('''()=>{const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));Object.assign(s,{devMode:false,system:1,localBody:3,x:2000,y:2000,angle:0,antimatter:1000,latinum:10000,landed:false,localCruise:null,arrivalApproach:null});nativeShipMotion.stop(s);nativeManualFlight.initializeRegion(s);return JSON.stringify(s);}''');SEED.write_text(seed,encoding='utf8')
        seed=SEED.read_text(encoding='utf8')
        page.evaluate('''seed=>{
          const simulation=nativeSimulation;window.nativeSimulation={...simulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          const restore=nativeCombatShots.restore;nativeCombatShots.restore=function(s){window.__warpState=s;return restore(s);};
          if(!nativeSaveStorage.write(JSON.parse(seed)).ok)throw Error('Fixture save failed');resumeNativeGame('normal');
          window.nativeSimulation=simulation;nativeSimulationHost.checkpoint();
          window.__pacing={frames:[],slow:[],phases:[],saves:[]};window.__done=false;
          const log=(name,start,phase)=>{const ms=performance.now()-start;if(ms>4)__pacing.slow.push({name,ms,phase,at:start});};
          for(const method of ['parse','stringify']){const original=JSON[method];JSON[method]=function(...args){const at=performance.now(),phase=vexedWarp.phase;try{return original.apply(this,args);}finally{log('JSON.'+method,at,phase);}};}
          for(const [name,methods,first] of [
            ['nativeNpcLives',['initialize'],true],['nativeSolEconomy',['initialize'],true],['nativeShipRepairs',['initialize'],true],
            ['nativeShipSystems',['query'],false],['nativeWorldBootstrap',['planTravel'],false],['nativeSystemStreaming',['prepareArrival'],false],
            ['nativeNpcLives',['advance'],false],['nativeSolEconomy',['advance'],false],['nativeShipEffects',['request','paintShip'],false]]){
            const original=window[name],wrapped=Object.create(original);
            for(const method of methods){const seen=new WeakSet();Object.defineProperty(wrapped,method,{value:function(...args){
              if(first&&seen.has(args[0]))return original[method](...args);if(first)seen.add(args[0]);const at=performance.now(),phase=vexedWarp.phase;
              try{return original[method](...args);}finally{log(name+'.'+method,at,phase);}},enumerable:true});}window[name]=wrapped;
          }
          const storage=nativeSaveStorage;window.nativeSaveStorage={...storage,async writeAsync(...args){const value=await storage.writeAsync(...args);__pacing.saves.push({phase:vexedWarp.phase,...storage.metrics()});return value;}};
          window.__pacingStart=()=>{
            const at=performance.now(),result=nativeNavigation.call('course',9);__pacing.clickMs=performance.now()-at;if(!result.ok)throw Error(result.error);
            let last=at,previous=vexedWarp.phase,continueAt=0,finishAt=0;
            const tick=now=>{
              const phase=vexedWarp.phase;__pacing.frames.push({ms:now-last,phase,previousPhase:previous,at:now});last=now;previous=phase;
              if(__pacing.phases.at(-1)?.phase!==phase)__pacing.phases.push({phase,at:now});
              if(phase==='report'&&vexedWarp.assetsReady){if(!continueAt)continueAt=now+1000;if(now>=continueAt)document.querySelector('.warp-continue').click();}
              if(phase==='error'){__pacing.error=vexedWarp.snapshot().error;__done=true;return;}
              if(phase==='idle'){if(!finishAt)finishAt=now;if(now-finishAt>=1000){__done=true;return;}}
              requestAnimationFrame(tick);
            };requestAnimationFrame(tick);
          };
        }''',seed)
        client=page.context.new_cdp_session(page);client.send('Profiler.enable');client.send('Profiler.setSamplingInterval',{'interval':1000});client.send('Profiler.start')
        page.evaluate('__pacingStart()');page.wait_for_function('()=>__done',timeout=90000);profile=client.send('Profiler.stop')['profile'];data=page.evaluate('__pacing')
        assert not errors and not failed and not data.get('error'),(errors,failed,data.get('error'))
        stats={}
        for phase in dict.fromkeys(f['phase'] for f in data['frames']):
            values=sorted(f['ms'] for f in data['frames'] if f['phase']==phase and f['ms']>=0)
            stats[phase]={'frames':len(values),'maxMs':max(values),'p95Ms':values[min(len(values)-1,int(len(values)*.95))],'over50':sum(ms>50 for ms in values)}
        nodes={n['id']:n for n in profile['nodes']};costs={}
        for sample,dt in zip(profile.get('samples',[]),profile.get('timeDeltas',[])):
            frame=nodes[sample]['callFrame'];name=frame['functionName']+' '+frame['url'].split('/')[-1]+':'+str(frame['lineNumber']+1);costs[name]=costs.get(name,0)+dt/1000
        data.update(stats=stats,sourceHashes=hashes,fixtureSha256=hashlib.sha256(seed.encode()).hexdigest(),viewport={'width':1280,'height':850},topCpu=sorted(costs.items(),key=lambda row:row[1],reverse=True)[:35],javascriptErrors=errors,failedRequests=failed)
        (OUT/(LABEL+'.json')).write_text(json.dumps(data,indent=2),encoding='utf8');(OUT/(LABEL+'-cpu.json')).write_text(json.dumps(profile),encoding='utf8')
        print(json.dumps({'label':LABEL,'stats':stats,'slow':[row for row in data['slow'] if row['phase']!='idle'],'topCpu':data['topCpu'][:8]}),flush=True);browser.close()
finally:server.shutdown();server.server_close()
