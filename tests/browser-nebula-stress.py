"""Sustained fog capacity test; separate from native full-game FPS qualification.

Twenty actual catalog hulls cross the complete production-sized field at 1/10/
50/100 times the Intrepid's 427.5 world units/second. Reversals split accepted
time at the exact path endpoint; neither frames nor movement are discarded.
"""
import argparse, functools, hashlib, http.server, importlib.util, json, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--multipliers',default='1,10,50,100')
parser.add_argument('--seconds',type=float,default=8)
mode=parser.add_mutually_exclusive_group();mode.add_argument('--headless',dest='headless',action='store_true');mode.add_argument('--headed',dest='headless',action='store_false');parser.set_defaults(headless=True)
parser.add_argument('--profile',action='store_true')
parser.add_argument('--warmup',type=float,default=2)
parser.add_argument('--motion',choices=['straight','maneuvers'],default='straight')
parser.add_argument('--fleet',choices=['intrepid','mixed','largest'],default='intrepid')
parser.add_argument('--count',type=int,default=20)
parser.add_argument('--stages',default='0',help='Cycle these original damage stages through the fleet')
parser.add_argument('--cell',type=float,help='Override the served game fluid grid; the default reads nativeDevFog.fluidCell')
parser.add_argument('--source-root',type=Path,default=ROOT)
parser.add_argument('--output',type=Path,default=ROOT/'test-results/nebula-stress')
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass
    def copyfile(self,source,output):
        try:super().copyfile(source,output)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
    def do_GET(self):
        if self.path=='/__nebula_stress__':
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<link rel="icon" href="data:,">');return
        super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(args.source_root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
spec=importlib.util.spec_from_file_location('headed',ROOT/'tests/browser-performance-headed.py');headed=importlib.util.module_from_spec(spec);spec.loader.exec_module(headed)
spec=importlib.util.spec_from_file_location('support',ROOT/'tests/nebula-browser-support.py');support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
RUN=r'''async ({multiplier,seconds,count,warmup,motion,fleet,cell})=>{
 const api=nativeNebulaMaterial,canvas=document.querySelector('canvas');canvas.width=innerWidth;canvas.height=innerHeight;const ctx=canvas.getContext('2d');
 const source=Object.assign(document.createElement('canvas'),{width:32,height:32}),sg=source.getContext('2d');sg.fillStyle='rgba(100,80,160,.6)';sg.fillRect(0,0,32,32);
 const field=api.createRuntimeField({minX:-831,minY:-981,width:1662,height:1962,cell,uniform:0});field.seed(sg.getImageData(0,0,32,32).data,32,32);await field.flush();
 if(window.__stressProfile){window.__stressReady=true;await new Promise(resolve=>window.__stressStart=resolve);}
 const speed=427.5*multiplier,half=1100,leg=half*2/speed,view={w:canvas.width,h:canvas.height,cameraX:0,cameraY:0,zoom:Math.min(canvas.width/1800,canvas.height/2100)};
 const masks=new Map(fleet.map(r=>[r.id+':'+r.stage,api.maskForType(r.id,r.stage)]));
 let clock=0,commands=0,body=[],last=null,start=null,maxQueue=0,maxLag=0,maxActors=0,maxSubmitMs=0,maxPaintMs=0,travel=0,measuredStart=null,steadyMaxQueue=0,steadyMaxLag=0;const intervals=[],warmIntervals=[],samples=[];
 function travelClock(t){if(motion==='straight')return t;const cycle=Math.floor(t/10),u=t-cycle*10;return cycle*7+(u<3?u:u<4?3+(u-3)-(u-3)**2/2:u<6?3.5:u<7?3.5+(u-6)**2/2:4+u-7);}
 function wallAtTravel(t){if(motion==='straight')return t;const cycle=Math.floor(t/7),u=t-cycle*7;return cycle*10+(u<3?u:u<3.5?4-Math.sqrt(1-2*(u-3)):u<4?6+Math.sqrt(2*(u-3.5)):7+u-4);}
 function nextPhase(t){if(motion==='straight')return Infinity;const cycle=Math.floor(t/10),u=t-cycle*10;return cycle*10+[3,4,6,7,10].find(v=>v>u+1e-9);}
 function poses(t){const travel=travelClock(t),n=travel/leg,cycle=Math.floor(n),along=(cycle%2?1-(n-cycle):n-cycle)*half*2-half;
   return Array.from({length:count},(_,i)=>{const r=fleet[i],angle=i*Math.PI/count+(motion==='straight'?0:travel*.4),lane=(i%5-2)*85;return {id:'stress:'+i,mask:masks.get(r.id+':'+r.stage),pose:{shipType:r.id,x:Math.cos(angle)*along-Math.sin(angle)*lane,y:Math.sin(angle)*along+Math.cos(angle)*lane,heading:angle+i*.14+(motion==='straight'?0:.15*Math.sin(t*.7)),width:r.width,height:r.height,speed}};});}
 body=poses(0);field.updateMany(body,1/120,{rebase:true});await field.flush();
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Stress animation did not finish')),Math.max(60000,(seconds+warmup)*1000+30000));function tick(at){try{if(start===null)start=last=at;const dt=(at-last)/1000;last=at;const measured=at-start>=warmup*1000;if(dt>0)(measured?intervals:warmIntervals).push(dt*1000);if(measured&&measuredStart===null)measuredStart=clock;const began=performance.now(),end=clock+dt;
   while(clock<end-1e-10){const boundary=wallAtTravel((Math.floor((travelClock(clock)+1e-9)/leg)+1)*leg),next=Math.min(end,boundary,nextPhase(clock)),elapsed=next-clock;travel+=(travelClock(next)-travelClock(clock))*speed;clock=next;body=poses(clock);field.updateMany(body,elapsed);commands++;}
   maxSubmitMs=Math.max(maxSubmitMs,performance.now()-began);const paint=performance.now(),pair=api.renderPair(view,source,field,body,{worldSource:true,sourceVersion:0,direct:true,clearPending:true,smooth:true});
   ctx.fillStyle='#02040b';ctx.fillRect(0,0,canvas.width,canvas.height);pair.paint(ctx,'back');for(const b of body){const p=b.pose;ctx.save();ctx.translate(view.w/2+p.x*view.zoom,view.h/2+p.y*view.zoom);ctx.rotate(p.heading+Math.PI/2);ctx.drawImage(b.mask.art,-p.width*view.zoom/2,-p.height*view.zoom/2,p.width*view.zoom,p.height*view.zoom);ctx.restore();}pair.paint(ctx,'front');maxPaintMs=Math.max(maxPaintMs,performance.now()-paint);
   const m=field.metrics();maxQueue=Math.max(maxQueue,m.queuedSeconds||0);maxLag=Math.max(maxLag,m.clock-(m.workerClock||0));maxActors=Math.max(maxActors,m.actorCount||0);
   if(measured){steadyMaxQueue=Math.max(steadyMaxQueue,m.queuedSeconds||0);steadyMaxLag=Math.max(steadyMaxLag,m.clock-(m.workerClock||0));}samples.push({at:at-start,measured,queue:m.queuedSeconds||0,lag:m.clock-(m.workerClock||0),active:m.activeTiles||0});
   if(at-start<(seconds+warmup)*1000)requestAnimationFrame(tick);else{clearTimeout(timeout);resolve();}}catch(error){clearTimeout(timeout);reject(error);}}requestAnimationFrame(tick);});
 const before=field.metrics(),drainStart=performance.now();let drained=true,drainTimer;await Promise.race([field.flush(),new Promise(resolve=>{drainTimer=setTimeout(()=>{drained=false;resolve();},30000);})]);clearTimeout(drainTimer);const drainMs=performance.now()-drainStart,after=field.metrics(true),sorted=intervals.slice().sort((a,b)=>a-b),measuredSeconds=clock-measuredStart;
 const result={protocol:2,multiplier,count,speed,motion,fleet,seconds:measuredSeconds,totalSeconds:clock,warmup:{seconds:measuredStart,worstMs:Math.max(0,...warmIntervals),intervals:warmIntervals},commands,crossingsPerShip:travel/(half*2),fps:intervals.length/measuredSeconds,p95Ms:sorted[Math.floor(sorted.length*.95)],worstMs:Math.max(...intervals),intervals,maxQueue,maxLag,steadyMaxQueue,steadyMaxLag,maxActors,maxSubmitMs,maxPaintMs,drained,drainMs,before,after,samples,conditions:{focused:document.hasFocus(),visible:document.visibilityState,fullscreen:!!document.fullscreenElement,w:innerWidth,h:innerHeight,dpr:devicePixelRatio},acceptedTimeError:after.clock-clock-1/120,massError:after.mass-after.initialMass};if(window.__stressProfile)window.__stressDispose=()=>field.dispose();else field.dispose();return result;
}'''
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=args.headless)
        report={'scope':'Fog capacity with original catalog silhouettes; native gameplay is measured separately','headless':args.headless,'diagnostic':args.profile,'browser':browser.version,'display':headed.display_modes(),'powerBefore':support.power_status(),'sourceHashes':support.source_hashes(args.source_root.resolve()),'harnessSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'cases':[]}
        catalog_page=browser.new_page(viewport={'width':1280,'height':800})
        catalog_page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        catalog_page.wait_for_function('()=>window.nativeShipDefinitions&&window.nativeNebulaHullMasks&&nativeShipDefinitions.registered().length>80')
        catalog=catalog_page.evaluate('''()=>nativeShipDefinitions.registered().filter(d=>nativeNebulaHullMasks.masks[d.id+':0']).map(d=>({id:d.id,name:d.name,...nativeShipDefinitions.dimensions({shipType:d.id},'player')}))''');production_cell=catalog_page.evaluate('window.nativeDevFog?.fluidCell??2');cell=args.cell if args.cell is not None else production_cell;report.update(productionFluidCell=production_cell,testedFluidCell=cell);catalog_page.close()
        by_id={r['id']:r for r in catalog}
        if args.fleet=='intrepid':selected=[by_id[438]]
        elif args.fleet=='largest':selected=sorted(catalog,key=lambda r:r['width']*r['height'],reverse=True)
        else:
            priority=[438,439,36,7,23,47,52,58,56,57,59,9001];selected=[by_id[i] for i in priority if i in by_id]+[r for r in catalog if r['id'] not in priority]
        stages=list(map(int,args.stages.split(',')));fleet=[{**selected[i%len(selected)],'stage':stages[i%len(stages)]} for i in range(args.count)];report['fleet']=fleet
        for multiplier in map(float,args.multipliers.split(',')):
            page=browser.new_page(**({'viewport':{'width':1280,'height':800}} if args.headless else {'no_viewport':True}));errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('Browser error: '+str(e),flush=True)))
            page.goto(f'http://127.0.0.1:{server.server_port}/__nebula_stress__')
            page.set_content('<style>body{margin:0;background:#02040b}canvas{position:fixed;inset:0;width:100%;height:100%}</style><canvas></canvas><button style="position:fixed;z-index:10" onclick="document.documentElement.requestFullscreen().then(()=>this.remove())">Start stress test</button>')
            for script in ['nebula-flow-kernel.js','nebula-hull-masks.js','nebula-material.js']:
                page.add_script_tag(url=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/{script}')
            if not args.headless:
                page.locator('button').click();page.wait_for_function('()=>document.fullscreenElement');session=page.context.new_cdp_session(page);target=session.send('Browser.getWindowForTarget');session.send('Browser.setWindowBounds',{'windowId':target['windowId'],'bounds':{'windowState':'fullscreen'}});session.detach();page.bring_to_front()
            params={'multiplier':multiplier,'seconds':args.seconds,'count':args.count,'warmup':args.warmup,'motion':args.motion,'fleet':fleet,'cell':cell}
            if args.profile:
                page.evaluate('window.__stressProfile=true');page.evaluate('(params)=>{window.__stressResult=('+RUN+')(params);}',params);page.wait_for_function('()=>window.__stressReady');stop=support.worker_profile(browser,page);page.evaluate('__stressStart()');result=page.evaluate('__stressResult');(args.output/f'{multiplier:g}x-worker.cpuprofile').write_text(json.dumps(stop()));page.evaluate('__stressDispose()')
            else:result=page.evaluate(RUN,params)
            result['cell']=cell;result['errors']=errors;result['strict120Pass']=not args.headless and not args.profile and result['conditions']['fullscreen'] and result['conditions']['focused'] and result['worstMs']<=1000/120*1.08
            # A separate fog-capacity gate. Main RAF can look smooth while a
            # worker accumulates seconds of stale fluid; retain those failures.
            reasons=[]
            if result['steadyMaxQueue']>.1:reasons.append('Queued fog exceeds three 30-Hz fluid intervals')
            if not result['drained'] or result['drainMs']>100:reasons.append('Worker does not drain within 100 ms')
            if abs(result['acceptedTimeError'])>1e-8:reasons.append('Accepted elapsed fog time was not retained')
            if abs(result['massError'])>result['after']['initialMass']*1e-6:reasons.append('Relative material error exceeds 0.0001 percent')
            if errors:reasons.append('Browser errors')
            result['capacityQualification']={'passed':not reasons,'maximumQueuedSeconds':.1,'maximumDrainMs':100,'failures':reasons,'scope':'Isolated fog capacity only; does not qualify full gameplay or 120 FPS'}
            report['cases'].append(result)
            (args.output/f'{multiplier:g}x.json').write_text(json.dumps(result,indent=2));page.screenshot(path=str(args.output/f'{multiplier:g}x.png'));print(json.dumps({k:v for k,v in result.items() if k not in ['samples','before','after','intervals','fleet','warmup']}),flush=True);page.close()
        report.update(powerAfter=support.power_status(),displayAfter=headed.display_modes(),sourceStable=report['sourceHashes']==support.source_hashes(args.source_root.resolve()));(args.output/'report.json').write_text(json.dumps(report,indent=2));browser.close()
finally:server.shutdown();server.server_close()
