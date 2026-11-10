"""System-border agreement/preparation and optional ordinary-key Orion–Oce Nu tour.

Functional clock checks and the tour do not qualify delivered display refresh.
"""
import argparse,functools,http.server,json,math,os,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/system-entry'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def ready(page,base):
    page.goto(base+'/html-games/broken-mirror-port/index.html')
    page.locator('[data-menu="dev"]').click(timeout=60000)
    page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200&&nativeCombatShots.isReady()&&nativeSystemStreaming',timeout=120000)

def functional(page,base):
    ready(page,base)
    initial=page.evaluate('''()=>{
      window.__entryBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
      const s=JSON.parse(JSON.stringify(nativeNpcDev.getState())),m=nativeManualFlight,a=m.planetPosition(2),b=m.planetPosition(20),e=nativeSystemCatalog.boundary(20),o=m.anchor(20),dx=a.x-b.x,dy=a.y-b.y;
      const x=b.x-o.x-e.x,y=b.y-o.y-e.y,A=(dx/e.rx)**2+(dy/e.ry)**2,B=2*(x*dx/e.rx**2+y*dy/e.ry**2),C=(x/e.rx)**2+(y/e.ry)**2-1,t=(-B+Math.sqrt(B*B-4*A*C))/(2*A),length=Math.hypot(dx,dy),edge={x:b.x+dx*t,y:b.y+dy*t},frame=m.anchor(2);
      Object.assign(s,{system:2,localBody:0,x:edge.x+dx/length*1500-frame.x,y:edge.y+dy/length*1500-frame.y,angle:Math.atan2(-dy,-dx),speed:0,vx:0,vy:0,landed:false,localCruise:null,arrivalApproach:null,manualTargetSystem:20});
      for(const key of ['motionKick','motionSpin','motionDrift','motionAngularVelocity'])delete s[key];
      nativeNpcLives.initialize(s);
      // A functional fixture relocates ONE existing resident to the border so
      // activation can be tested there. The separate tour relocates no NPCs.
      const resident=s.civilianTraffic.ships.find(e=>e.system===20&&e.shipType!==58&&!e.journey&&!e.scriptedDemo&&!e.cargo&&e.hull>0);
      if(!resident)throw Error('No available existing resident');nativeNpcLives.interrupt(s,resident,'border visibility fixture');
      // Continue also migrates the legacy idle timer; retain this fixture's wait.
      Object.assign(resident,{phase:'holding',x:edge.x-o.x-dx/length*50-dy/length*80,y:edge.y-o.y-dy/length*50+dx/length*80,speed:0,vx:0,vy:0,timer:10000,nextActivityAt:nativeSimulation.seconds(s)+10000,nextActionAt:nativeSimulation.seconds(s)+10000});nativeNpcLives.refreshLocation(s,resident);nativeNpcLives.invalidateMembership(s);nativeNpcLives.initialize(s);
      nativeSaveStorage.write(s);resumeNativeGame('dev');
      const trace=window.__entry={resident:resident.id,edge,events:[],before:[],painted:null};
      document.querySelector('#flight-status').addEventListener('flight-regionchange',event=>{if(event.detail.system===20&&event.detail.kind==='enter'){
        const state=nativeNpcDev.getState(),p=m.position(state);trace.events.push({wall:performance.now(),system:state.system,region:state.manualFlightRegion.system,point:p,planetDistance:Math.hypot(p.x-b.x,p.y-b.y),stream:nativeSystemStreaming.snapshot(state)});
      }});
      const paint=nativeShipEffects.paintShip;window.nativeShipEffects={...nativeShipEffects,paintShip(ctx,d,...rest){const result=paint.call(this,ctx,d,...rest);if(result?.art&&d.entity?.id===trace.resident&&!trace.painted)trace.painted={wall:performance.now(),system:d.state.system};return result;}};
      return {resident:resident.id,type:resident.shipType,edge,population:s.civilianTraffic.ships.length,medical:s.civilianTraffic.ships.filter(e=>e.shipType===58).length};
    }''')
    page.locator('#space').click(position={'x':640,'y':425});page.keyboard.down('w')
    page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:__entryBlocked};nativeSimulationHost.checkpoint();}')
    page.wait_for_timeout(100);page.keyboard.down('w')
    try:
        # Capture preparation while actual activation is still in the old frame.
        page.wait_for_function('()=>nativeNpcDev.getState().system!==20&&nativeSystemStreaming.snapshot(nativeNpcDev.getState())?.system===20',timeout=15000)
        prepared=page.evaluate('''()=>{const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,__entry.resident),d=nativeShipDefinitions.describe(s,e,{category:'civilian'});return {system:s.system,region:s.manualFlightRegion.system,stream:nativeSystemStreaming.snapshot(s),residentDetailed:nativeShipDetail.isDetailed(s,e),at:nativeSimulation.seconds(s)};}''')
        assert prepared['system']!=20 and not prepared['residentDetailed'],prepared
        page.wait_for_function('()=>__entry.events.length&&__entry.painted',timeout=20000)
        crossing=page.evaluate('''()=>{const s=nativeNpcDev.getState(),event=__entry.events[0],e=nativeNpcLives.find(s,__entry.resident);return {event,painted:__entry.painted,paintDelayMs:__entry.painted.wall-event.wall,events:__entry.events.length,ui:nativeFlightStatus.snapshot(),residentDetailed:nativeShipDetail.isDetailed(s,e),population:s.civilianTraffic.ships.length};}''')
        assert crossing['event']['system']==20 and crossing['event']['region']==20 and crossing['ui']['region']['system']==20,crossing
        assert crossing['event']['planetDistance']>native_arrival_radius(page)*2,crossing
        assert crossing['events']==1 and crossing['residentDetailed'] and crossing['population']==1200,crossing
        assert 0<=crossing['paintDelayMs']<2000,crossing
        page.screenshot(path=str(OUT/'border-entry.png'))
    finally:page.keyboard.up('w')
    reload=page.evaluate('''()=>{
      window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();const s=nativeNpcDev.getState(),serial=s.manualFlightRegion.sequence;
      if(!nativeSaveStorage.write(s).ok)throw Error('Entry save failed');resumeNativeGame('dev');nativeFlightStatus.update(nativeNpcDev.getState(),{dt:.1});
      const r=nativeNpcDev.getState(),ui=nativeFlightStatus.snapshot();if(r.system!==20||r.manualFlightRegion.system!==20||r.manualFlightRegion.sequence!==serial||ui.announcement)throw Error('Continue replayed entry or lost activation');
      return {system:r.system,region:r.manualFlightRegion.system,quietContinue:true,population:r.civilianTraffic.ships.length,medical:r.civilianTraffic.ships.filter(e=>e.shipType===58).length};
    }''')
    return {'initial':initial,'preparedBeforeEntry':prepared,'crossing':crossing,'reload':reload}

def native_arrival_radius(page):return page.evaluate('nativeManualFlight.arrivalRadius')

def tour(page,base,navigation=20,require_travellers=True):
    ready(page,base)
    page.evaluate('''navigation=>{
      const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));Object.assign(s,{system:2,localBody:0,x:-220,y:75,landed:false,localCruise:null,arrivalApproach:null,manualTargetSystem:navigation});nativeShipMotion.stop(s);
      nativeSaveStorage.write(s);resumeNativeGame('dev');nativeSystemHub.close(false);const live=nativeNpcDev.getState();nativeShipTraffic.clearSpawn(live,{nearTraffic:true,view:nativeView.measure(document.querySelector('#space'))});nativeNpcLives.observeCourse(live,2,navigation);
      const m=nativeManualFlight,lane=nativeTravelCorridors.ensureLane(2,20,live),g=m.guidance(live,20);live.angle=Math.atan2(g.dy,g.dx);nativeShipSystems.refreshShip(live,live,'player');
      const t=window.__entryTour={course:[...lane.sites.map(p=>({x:p.x,y:p.y})),m.planetPosition(20)],index:0,ships:new Map(),travellers:new Set(),miners:new Set(),rocks:new Set(),sectors:new Set(),entries:[],frames:[],active:true,last:performance.now()};
      document.querySelector('#flight-status').addEventListener('flight-regionchange',event=>{if(event.detail.kind==='enter'){const s=nativeNpcDev.getState(),g=m.guidance(s,20);t.entries.push({system:event.detail.system,activeSystem:s.system,region:s.manualFlightRegion.system,distance:g.distance,at:nativeSimulation.seconds(s)});}});
      const paint=nativeShipEffects.paintShip;window.nativeShipEffects={...nativeShipEffects,paintShip(ctx,d,...rest){const r=paint.call(this,ctx,d,...rest);if(r?.art&&d.category==='civilian'){
        t.ships.set(d.entity.id,{id:d.entity.id,type:d.shipType,phase:d.entity.phase,task:d.entity.task?.kind,at:nativeSimulation.seconds(d.state)});if(d.entity.travelResume)t.travellers.add(d.entity.id);if(d.entity.phase==='mining')t.miners.add(d.entity.id);
      }return r;}};
      const rocks=nativeSolAsteroids.paint;nativeSolAsteroids.paint=function(ctx,v){for(const r of nativeSolAsteroids.nearby(v.system,v.ship,Math.hypot(v.w,v.h)/2+70)){
        const art=nativeSolAsteroids.peekImage(nativeSolAsteroids.frame(r,v.damage?.[r.slotId]));if(r.corridor&&art?.complete&&art.naturalWidth&&!v.mined.includes(r.slotId)&&Math.abs(r.x-v.ship.x)<v.w/2+r.size&&Math.abs(r.y-v.ship.y)<v.h/2+r.size){t.rocks.add(r.slotId);if(r.sector)t.sectors.add(r.slotId);}
      }return rocks.call(this,ctx,v);};
      const frame=stamp=>{if(!t.active)return;t.frames.push(stamp-t.last);t.last=stamp;requestAnimationFrame(frame);};requestAnimationFrame(frame);
    }''',navigation)
    # A canvas click can select the nearby planet and open its encounter panel.
    # Focus without issuing a world-selection action before ordinary thrust.
    page.bring_to_front();page.locator('#space').focus();page.wait_for_timeout(200);page.keyboard.down('w');page.wait_for_timeout(100);page.keyboard.up('w');page.keyboard.down('w')
    started=time.monotonic();rows=[];screens=0
    try:
        while time.monotonic()-started<600:
            # Match a physically held key's repeat after UI/focus gate edges.
            page.keyboard.down('w')
            page.wait_for_timeout(400)
            row=page.evaluate('''()=>{const s=nativeNpcDev.getState(),m=nativeManualFlight,g=m.guidance(s,20),t=__entryTour,p=m.position(s);while(t.index<t.course.length-1&&(Math.hypot(t.course[t.index].x-p.x,t.course[t.index].y-p.y)<500||(t.course[t.index].x-p.x)*g.dx+(t.course[t.index].y-p.y)*g.dy<-200*g.distance))t.index++;
              const q=t.course[t.index],heading=Math.atan2(q.y-p.y,q.x-p.x);return {system:s.system,region:s.manualFlightRegion.system,distance:g.distance,speed:s.speed,error:Math.atan2(Math.sin(heading-s.angle),Math.cos(heading-s.angle)),at:nativeSimulation.seconds(s),rocks:t.rocks.size,sectors:t.sectors.size,ships:t.ships.size,travellers:t.travellers.size,miners:t.miners.size,activity:nativeNpcLives.activity?.(s)?.assigned,miningJobs:(nativeNpcLives.activity?.(s)?.assignments||[]).filter(a=>a.kind==='mining').map(a=>{const e=nativeNpcLives.find(s,a.ship),p=nativeNpcLives.galaxyPosition(s,e),q=nativeManualFlight.position(s);return {id:e.id,phase:e.phase,job:e.task.phase,workAt:e.task.requirements.workAt,planned:a.point,distance:Math.hypot(p.x-q.x,p.y-q.y)};}),debt:s.shipSimulation.schedule.pendingSeconds};}''')
            row['wallSeconds']=time.monotonic()-started
            if not rows or row['wallSeconds']>=len(rows)*5:rows.append(row);print(json.dumps({'tour':row}),flush=True)
            if row['system']==20 and row['distance']<1600:break
            if row['wallSeconds']>12 and row['speed']<.01:raise AssertionError('Ordinary flight stopped: '+json.dumps(row))
            wanted='d' if row['error']>.03 else 'a' if row['error']<-.03 else None
            if wanted:page.keyboard.down(wanted);page.wait_for_timeout(min(100,max(15,abs(row['error'])*180)));page.keyboard.up(wanted)
            if row['distance']<90000-screens*35000 and screens<3:page.screenshot(path=str(OUT/f'orion-oce-nu-{screens+1}.png'));screens+=1
    finally:page.keyboard.up('w')
    result=page.evaluate('''()=>{const t=__entryTour;t.active=false;const s=nativeNpcDev.getState();return {system:s.system,region:s.manualFlightRegion.system,distance:nativeManualFlight.guidance(s,20).distance,population:s.civilianTraffic.ships.length,medical:s.civilianTraffic.ships.filter(e=>e.shipType===58).length,ships:[...t.ships.values()],travellers:[...t.travellers],miners:[...t.miners],rocks:t.rocks.size,sectors:t.sectors.size,entries:t.entries,frames:t.frames,stream:nativeSystemStreaming.snapshot(s),debt:s.shipSimulation.schedule.pendingSeconds};}''')
    result.update(wallSeconds=time.monotonic()-started,rows=rows,scope='Actual host loop and ordinary keys. Initial player scene placement only; no NPC relocation, replacement fleet, fast-forward, renderer changes or debt resets. Not FPS qualification.')
    result['passed']=result['system']==20 and result['distance']<1600 and result['rocks']>20 and result['sectors']>0 and (not require_travellers or len(result['travellers'])>0)
    (OUT/'orion-oce-nu-flight.json').write_text(json.dumps(result,indent=2),encoding='utf-8');assert result['passed'],{k:v for k,v in result.items() if k not in ['frames','rows']}
    return {k:v for k,v in result.items() if k not in ['frames','rows']}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tour-only',action='store_true');parser.add_argument('--source-root',type=Path,default=ROOT);args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(args.source_root)));threading.Thread(target=server.serve_forever,daemon=True).start();errors=[];failed=[]
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=False,executable_path='C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe') if args.tour_only else p.chromium.launch(headless=True,**({'channel':os.environ.get('BROWSER_CHANNEL','msedge')} if os.environ.get('BROWSER_CHANNEL','msedge') else {}))
            page=browser.new_page(viewport={'width':1280,'height':850});page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
            result=tour(page,f'http://127.0.0.1:{server.server_port}') if args.tour_only else functional(page,f'http://127.0.0.1:{server.server_port}')
            assert not errors and not failed,(errors,failed);result.update(passed=True,javascriptErrors=errors,failedRequests=failed)
            (OUT/('tour-report.json' if args.tour_only else 'browser-entry.json')).write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result),flush=True);browser.close()
    finally:server.shutdown()

if __name__=='__main__':main()
