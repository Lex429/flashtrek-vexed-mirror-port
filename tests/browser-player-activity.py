"""Real-job dispatch/persistence checks and an optional ordinary-key encounter tour.

The tour records actual painted ships. It is separate from refresh qualification.
"""
import argparse,functools,http.server,importlib.util,json,os,threading,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('entry_checks',ROOT/'tests/browser-system-entry.py')
entry=importlib.util.module_from_spec(spec);spec.loader.exec_module(entry)

def functional(page,base):
    entry.ready(page,base)
    page.evaluate('''()=>{const s=JSON.parse(JSON.stringify(nativeNpcDev.getState())),a=nativeManualFlight.planetPosition(1),b=nativeManualFlight.planetPosition(2);Object.assign(s,{system:1,localBody:3,x:a.x,y:a.y,angle:Math.atan2(b.y-a.y,b.x-a.x),landed:false,localCruise:null,arrivalApproach:null,manualTargetSystem:1});nativeShipMotion.stop(s);nativeSaveStorage.write(s);resumeNativeGame('dev');}''')
    page.locator('#space').click(position={'x':30,'y':100});page.keyboard.down('w')
    try:page.wait_for_function('()=>nativeNpcLives.activity(nativeNpcDev.getState())?.assigned.mining>0',timeout=45000)
    finally:page.keyboard.up('w')
    assert page.evaluate('nativeNpcDev.getState().manualTargetSystem')==1,'Earth selection was replaced during free flight'
    planned=page.evaluate('''()=>{const s=nativeNpcDev.getState(),a=nativeNpcLives.activity(s),jobs=a.assignments.map(plan=>{const e=nativeNpcLives.find(s,plan.ship),j=e.task,r=j.requirements;return {id:e.id,task:j.id,kind:j.kind,point:r.activity.point,rock:r.rockId,departureAt:r.departureAt,phase:j.phase,hasClaim:r.rockId?s.civilianTraffic.life.reservations['rock:'+r.rockId]?.owner===e.id:true};});return {population:s.civilianTraffic.ships.length,medical:s.civilianTraffic.ships.filter(e=>e.shipType===58).length,activity:a,jobs};}''')
    assert planned['population']==1200 and planned['medical']==100 and any(j['kind']=='mining' and j['hasClaim'] for j in planned['jobs']),planned
    assert page.evaluate('''points=>points.every(p=>nativeManualFlight.regionAtPoint(nativeNpcDev.getState(),p).kind==='interstellar')''',[j['point'] for j in planned['jobs']]),'Route activity was assigned inside a system'
    page.evaluate('nativePause.open()');before=page.evaluate('()=>({at:nativeSimulation.seconds(nativeNpcDev.getState()),passes:nativeNpcLives.activity(nativeNpcDev.getState()).passes})');page.wait_for_timeout(700)
    assert page.evaluate('()=>({at:nativeSimulation.seconds(nativeNpcDev.getState()),passes:nativeNpcLives.activity(nativeNpcDev.getState()).passes})')==before
    page.evaluate('nativePause.close()');page.evaluate('nativeNpcDev.showMap()');passes=page.evaluate('nativeNpcLives.activity(nativeNpcDev.getState()).passes');page.wait_for_timeout(2300)
    assert page.evaluate('nativeGalaxyOverview.active') is True
    assert page.evaluate('nativeNpcLives.activity(nativeNpcDev.getState()).passes')==passes,'Map opened activity planning'
    page.locator('#dev-galaxy-return').click()
    selected=next(j for j in planned['jobs'] if j['kind']=='mining')
    page.evaluate('''()=>{const s=nativeNpcDev.getState();s.manualTargetSystem=4;s.vx=-s.vx;s.vy=-s.vy;}''');page.wait_for_timeout(2200)
    retained=page.evaluate('''id=>{const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,id);return {task:e.task.id,point:e.task.requirements.activity.point,departureAt:e.task.requirements.departureAt};}''',selected['id'])
    assert retained=={k:selected[k] for k in ['task','point','departureAt']},(selected,retained)
    restored=page.evaluate('''id=>{window.__activityBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,id),expected=JSON.stringify({task:e.task,cargo:e.cargo,credits:e.credits,deadline:e.nextActionAt,reservations:s.civilianTraffic.life.reservations});if(!nativeSaveStorage.write(s).ok)throw Error('Save failed');resumeNativeGame('dev');const r=nativeNpcDev.getState(),x=nativeNpcLives.find(r,id),actual=JSON.stringify({task:x.task,cargo:x.cargo,credits:x.credits,deadline:x.nextActionAt,reservations:r.civilianTraffic.life.reservations});const differences=[];function compare(a,b,path=''){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(differences.length<12)compare(a[k],b[k],path+'.'+k);}else differences.push({path,before:a,after:b});}const expectedValue=JSON.parse(expected),actualValue=JSON.parse(actual),additionalBuyerReservations=Object.keys(actualValue.reservations).filter(k=>!Object.hasOwn(expectedValue.reservations,k));for(const k of additionalBuyerReservations)delete actualValue.reservations[k];compare(expectedValue,actualValue);if(differences.length)throw Error('Continue changed the job or its ownership '+JSON.stringify(differences));window.nativeSimulation={...nativeSimulation,blocked:__activityBlocked};nativeSimulationHost.checkpoint();return {population:r.civilianTraffic.ships.length,medical:r.civilianTraffic.ships.filter(e=>e.shipType===58).length,exactJobAndPriorReservations:true,additionalBuyerReservations:additionalBuyerReservations.length};}''',selected['id'])
    assert restored['population']==1200 and restored['medical']==100
    return {'passed':True,'planned':planned,'pause':True,'mapDoesNotDispatch':True,'courseChangeRetainsJob':True,'continue':restored}

def install_tour_audit(page):
    page.evaluate('''()=>{const audit=window.__activityTour={ships:new Map(),miners:new Set(),traders:new Set(),battles:new Set(),disabled:new Set(),rescues:new Set(),openShips:new Set(),openMiners:new Set(),openTraders:new Set()};const paint=nativeShipEffects.paintShip;
      window.nativeShipEffects={...nativeShipEffects,paintShip(ctx,d,...args){const r=paint.call(this,ctx,d,...args);if(r?.art&&d.category==='civilian'&&window.__entryTour?.active){const e=d.entity;
        audit.ships.set(e.id,{id:e.id,type:e.shipType,phase:e.phase,task:e.task?.kind,planned:!!e.task?.requirements?.activity});
        if(e.phase==='mining')audit.miners.add(e.id);if(e.travelResume&&['trade','freight'].includes(e.task?.kind))audit.traders.add(e.id);
        if(e.phase==='fighting')audit.battles.add(e.id);if(e.phase==='disabled')audit.disabled.add(e.id);if(e.phase==='medical-service')audit.rescues.add(e.id);
        if(nativeManualFlight.regionAtPoint(d.state,nativeNpcLives.galaxyPosition(d.state,e)).kind==='interstellar'){audit.openShips.add(e.id);if(e.phase==='mining')audit.openMiners.add(e.id);if(e.travelResume&&['trade','freight'].includes(e.task?.kind))audit.openTraders.add(e.id);}
      }return r;}};}''')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source-root',type=Path,default=ROOT);parser.add_argument('--tour-only',action='store_true');parser.add_argument('--label',default='final');parser.add_argument('--comparison-before',action='store_true');parser.add_argument('--fixture',type=Path);parser.add_argument('--navigation-target',type=int,default=20);args=parser.parse_args()
    out=ROOT/'test-results/player-activity'/args.label;out.mkdir(parents=True,exist_ok=True);entry.OUT=out
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(args.source_root)));threading.Thread(target=server.serve_forever,daemon=True).start();errors=[];failed=[]
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=False,executable_path='C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe') if args.tour_only else p.chromium.launch(headless=True,**({'channel':os.environ.get('BROWSER_CHANNEL','msedge')} if os.environ.get('BROWSER_CHANNEL','msedge') else {}))
            page=browser.new_page(viewport={'width':1280,'height':850});page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
            if args.tour_only:
                original_ready=entry.ready
                def ready_with_audit(page,base):
                    original_ready(page,base)
                    if args.fixture:
                        if not args.fixture.exists():
                            args.fixture.parent.mkdir(parents=True,exist_ok=True);args.fixture.write_text(page.evaluate('JSON.stringify(nativeNpcDev.getState())'),encoding='utf-8')
                        page.evaluate('''saved=>{const simulation=nativeSimulation;window.nativeSimulation={...simulation,blocked:()=>true};nativeSimulationHost.checkpoint();nativeSaveStorage.write(JSON.parse(saved));resumeNativeGame('dev');window.nativeSimulation=simulation;nativeSimulationHost.checkpoint();}''',args.fixture.read_text(encoding='utf-8'))
                    install_tour_audit(page)
                entry.ready=ready_with_audit;result=entry.tour(page,f'http://127.0.0.1:{server.server_port}',navigation=args.navigation_target,require_travellers=not args.comparison_before)
                result['visibleActivity']=page.evaluate('''()=>{const a=__activityTour;return {ships:[...a.ships.values()],miners:[...a.miners],traders:[...a.traders],battles:[...a.battles],disabled:[...a.disabled],rescues:[...a.rescues],openShips:[...a.openShips],openMiners:[...a.openMiners],openTraders:[...a.openTraders],planning:nativeNpcLives.activity?.(nativeNpcDev.getState())||null};}''')
                if not args.comparison_before:assert len(result['visibleActivity']['miners'])>=2,result['visibleActivity']
            else:result=functional(page,f'http://127.0.0.1:{server.server_port}')
            result.update(javascriptErrors=errors,failedRequests=failed,sourceRoot=str(args.source_root),fixtureSha256=hashlib.sha256(args.fixture.read_bytes()).hexdigest() if args.fixture else None);(out/'report.json').write_text(json.dumps(result,indent=2),encoding='utf-8');page.screenshot(path=str(out/'complete.png'))
            assert not errors and not failed,(errors,failed);print(json.dumps(result),flush=True);browser.close()
    finally:server.shutdown()

if __name__=='__main__':main()
