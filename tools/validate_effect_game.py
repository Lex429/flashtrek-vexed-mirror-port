"""Measure the released effects in actual gameplay in an isolated browser save.

python tools/validate_effect_game.py --count 100 --seconds 10
After promotion, omit --count to repeat the selected fixture. Use --headed for
foreground target-device measurements; headless results are separately labelled.
Use --browser-path to match the browser/GPU used by the actual showcase.
"""
import argparse
import functools
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
import threading

from playwright.sync_api import sync_playwright
from effect_lab import ROOT, DEFAULT_STATE, RELEASE, atomic, read, versions
from local_site import Handler

INSTALL = r"""async config => {
  vexedShieldGPU.setLegacy(config.shieldRenderer==='legacy');
  window.nativeFlightLightingEnabled=config.lights!==false;
  window.nativeShipLampGPUEnabled=config.lampBackend!=="canvas";
  window.nativeHullBatchEnabled=typeof config.hullBatch==='boolean'?config.hullBatch:undefined;
  const state=nativeNpcDev.getState();
  if(!state)throw Error('Isolated Dev game is not ready');
  const system=VexedMirrorWorld.systems.find(s=>s.id!==1&&nativeCivilianAccess.inhabited(state,s.id));
  state.system=system.id;state.x=20000;state.y=20000;state.speed=0;state.vx=0;state.vy=0;state.landed=false;
  delete state.localCruise;delete state.arrivalApproach;
  state.shipType=config.shipType;
  const types=config.mix?[...new Set([config.shipType,6,7,39,29])]:[config.shipType],art=new Map();
  for(const type of types){const ready=await nativeShipEffects.prepare(type,'civilian');art.set(type,ready.assets[0]);}
  const canvas=document.getElementById('space'),bounds=canvas.getBoundingClientRect(),view=nativeView.measure(canvas),w=view.w,h=view.h;
  const columns=Math.ceil(Math.sqrt(config.count*w/h)),rows=Math.ceil(config.count/columns),margin=Math.min(80,bounds.width*.14,bounds.height*.18)/view.scale,cw=(w-margin*2)/columns,ch=(h-margin*2)/rows;
  const spots=Array.from({length:config.count},(_,i)=>({x:margin+(i%columns+.5)*cw-w/2,y:margin+(Math.floor(i/columns)+.5)*ch-h/2}));
  const center=spots.reduce((best,p,i)=>Math.hypot(p.x,p.y)<Math.hypot(spots[best].x,spots[best].y)?i:best,0);
  const order=[spots[center],...spots.filter((_,i)=>i!==center)],fleet=[];
  for(let i=0;i<config.count;i++){
    const type=types[i%types.length],a=art.get(type),ratio=a.width/a.height,d=nativeShipDefinitions.get(type,'civilian');
    const height=Math.min(config.size/view.scale,Math.max(10/view.scale,ch*.75),Math.max(10/view.scale,cw*.75)/ratio);
    const entity=i===0?state:{id:900000+i,name:'Effect fixture '+i,shipType:type,ownerGovernmentId:1,homeSystem:system.id,seedSystem:system.id,stationSystem:system.id,operatingBase:system.id,homeBase:{system:system.id,port:0},system:system.id,port:0,role:'freight',phase:'cruising',timer:999999,cargo:null,oreHold:0,credits:100,lifeVersion:1,dockingVersion:1,nextActionAt:nativeSimulation.seconds(state)+999999,lifeScheduleToken:1,recentEvents:[],taskSequence:0};
    const spot=i===0?{x:0,y:0}:order[i];
    Object.assign(entity,{shipType:type,x:state.x+spot.x,y:state.y+spot.y,heading:-Math.PI/2,angle:-Math.PI/2,speed:0,vx:0,vy:0,hull:d.hull,shields:d.shields,dimensions:{width:height*ratio,height}});
    if(config.mixedDamage)entity.hull*= [1,.7,.4,.1][i%4];
    nativeShipEquipment.ensure(entity);nativeWeaponLoadout.ensure(entity);
    fleet.push({entity,descriptor:nativeShipDefinitions.describe(state,entity,{category:i===0?'player':'civilian'}),phase:i*.37});
  }
  state.civilianTraffic.ships=fleet.slice(1).map(s=>s.entity);
  state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];state.solEconomy.freighters=[];
  nativeNpcLives.initialize(state);nativeShipEffects.reset();
  const combat=await fetch('../flashtrek-broken-mirror/showcase-assets/combat-data.json').then(r=>r.json());
  const fixture=createVexedEffectFixture({state,fleet,config,combat}),simulation=nativeSimulation,shots=nativeCombatShots,effects=nativeShipEffects;
  // Supply the chosen fixture hull to the player renderer; the private flight
  // cache still contains the Dev starter hull. All painting stays in its owner.
  window.nativeShipEffects=Object.freeze({...effects,paintShip(ctx,descriptor,view){return effects.paintShip(ctx,descriptor,{...view,asset:effects.asset(descriptor)||art.get(descriptor.shipType),appearance:{...view.appearance,lights:config.lights}});}});
  window.nativeSimulation=Object.freeze({...simulation,advance(s,dt){const elapsed=simulation.advance(s,dt);if(s===state&&elapsed>0)fixture.step();return elapsed;}});
  window.nativeCombatShots=Object.freeze({...shots,paintAll(ctx,view){const result=shots.paintAll(ctx,view);if(view.state===state)fixture.paint(ctx,view);return result;}});
  document.getElementById('effect-game-probe').style.visibility='hidden';
  window.__effectGameFixture={snapshot:()=>fixture.snapshot(),state};
  return {count:config.count,width:bounds.width,height:bounds.height,logicalWidth:w,logicalHeight:h,scale:view.scale,displayedHullHeight:Math.min(...fleet.map(s=>s.entity.dimensions.height))*view.scale,system:system.id,lightingEnabled:window.nativeFlightLightingEnabled};
}"""


def validate(args, fixture_override=None, preview_profile=None):
    selected=read(args.state/'effect-lab/selected.json', {})
    fixture={**{'count':100,'scenario':'shields','shipType':6,'mix':False,'rate':2,'size':44,
                'seed':429,'pattern':'staggered','lights':True,'weapon':'beam:0'}, **selected.get('fixture', {})}
    if fixture_override:
        fixture.update(fixture_override)
    if args.count:
        fixture['count']=args.count
    release=read(args.root/RELEASE,None)
    if selected and selected['profile']!=release and not args.count and not fixture_override:
        raise ValueError('Selected candidate has not been promoted. Review and promote it first.')
    expected=preview_profile or release
    before=versions(args.root,expected)
    with tempfile.TemporaryDirectory(prefix='vexed-game-check-') as isolated:
        server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(args.root)))
        server.state=Path(isolated);threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                channel=os.environ.get('BROWSER_CHANNEL','msedge')
                executable=getattr(args,'browser_path',None) or os.environ.get('VEXED_BROWSER_EXECUTABLE')
                launch={'executable_path':str(executable)} if executable else ({'channel':channel} if channel else {})
                browser=p.chromium.launch(headless=not args.headed,**launch)
                page=browser.new_page(viewport={'width':int(fixture.get('width',1280)),'height':int(fixture.get('height',720))},device_scale_factor=fixture.get('dpr',1),bypass_csp=True)
                def wait(seconds):
                    remaining=seconds*1000
                    while remaining>0:
                        if getattr(args,'cancel_event',None) and args.cancel_event.is_set():
                            raise ValueError('Game check cancelled')
                        step=min(250,remaining);page.wait_for_timeout(step);remaining-=step
                errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html?effectLabCheck=1')
                page.wait_for_function('window.nativeEffectGameProbe && window.nativeDevRepairDemo && window.nativeWorldBootstrap',timeout=120000)
                page.evaluate('''async profile=>{await nativeEffectProfiles.ready;if(profile){await nativeEffectProfiles.preview(profile);vexedShieldGPU?.destroy();await installVexedShieldGPU();}}''',preview_profile)
                wait(2.8);page.evaluate('startNativeDevGame()')
                page.wait_for_function('nativeNpcDev.getState()?.civilianTraffic?.ships?.length>0',timeout=120000)
                page.add_script_tag(url='../flashtrek-broken-mirror/effect-lab-fixture.js')
                actual=page.evaluate(INSTALL,fixture)
                page.bring_to_front()
                diagnostic_script=getattr(args,'diagnostic_script',None)
                if diagnostic_script:page.evaluate(diagnostic_script)
                wait(args.warmup)
                diagnostic=getattr(args,'cpu_profile',None)
                profiler=None
                if diagnostic:
                    profiler=page.context.new_cdp_session(page)
                    profiler.send('Profiler.enable')
                    profiler.send('Profiler.setSamplingInterval',{'interval':1000})
                    profiler.send('Profiler.start')
                page.evaluate('(count)=>nativeEffectGameProbe.begin(count)',fixture['count'])
                wait(args.seconds)
                report=page.evaluate('()=>({...nativeEffectGameProbe.finish(),counters:__effectGameFixture.snapshot(),shipEffects:nativeShipEffects.metrics(),sprites:nativeShipSpriteCache.snapshot(),hullBatch:window.nativeHullBatch?.snapshot(),radar:window.nativeRadar?.snapshot?.(),environment:{userAgent:navigator.userAgent,gpu:vexedShieldGPU.renderer.environment,dpr:devicePixelRatio,lightingEnabled:window.nativeFlightLightingEnabled,visibility:document.visibilityState,focused:document.hasFocus()},clock:nativeSimulation.seconds(__effectGameFixture.state)})')
                report.update({'fixture':fixture,'actual':actual,'code':before,'errors':errors,'headless':not args.headed,
                    'browserLaunch':{'executable':str(executable) if executable else None,'channel':None if executable else channel},
                    'load':'Scripted visual effect load in actual game; ordinary simulation and rendering active. Autonomous battle decisions are not part of this fixture.'})
                if before!=versions(args.root,expected):
                    report['metrics'].update(valid=False,invalidReason='Source changed during game check')
                if errors:
                    report['metrics'].update(valid=False,invalidReason='Game raised JavaScript errors')
                if report.get('hullBatch',{}).get('rejected',0):
                    report['metrics'].update(valid=False,invalidReason='Hull batch capacity exceeded')
                if report.get('hullBatch',{}).get('glError') or report.get('hullBatch',{}).get('contextLosses'):
                    report['metrics'].update(valid=False,invalidReason='Hull batch raised a GPU error or lost its context')
                if report['profile']!=expected:
                    report['metrics'].update(valid=False,invalidReason='Game did not load the requested effect profile')
                report['releaseApplied']=expected==release
                report['status']='passed' if report['metrics']['valid'] and report['metrics']['targetObserved'] else 'below-target' if report['metrics']['valid'] else 'invalid'
                if profiler:
                    atomic(Path(diagnostic),profiler.send('Profiler.stop')['profile'])
                    profiler.detach()
                    report.update(status='diagnostic',instrumentation='CPU sampling profiler; not a performance approval',cpuProfile=str(diagnostic))
                elif diagnostic_script:
                    report.update(status='diagnostic',instrumentation='Visual-owner isolation; not a performance approval')
                atomic(args.state/'effect-lab/game-validation.json',report)
                output=args.root/'test-results/effect-lab';output.mkdir(parents=True,exist_ok=True)
                atomic(output/'game-validation.json',report);page.screenshot(path=str(output/'game-validation.png'))
                browser.close()
                return report
        finally:
            server.shutdown();server.server_close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--state',type=Path,default=DEFAULT_STATE)
    parser.add_argument('--count',type=int,choices=[10,25,50,100,200])
    parser.add_argument('--seconds',type=int,choices=range(2,31),default=10)
    parser.add_argument('--warmup',type=int,choices=range(0,11),default=3)
    parser.add_argument('--headed',action='store_true')
    parser.add_argument('--browser-path',type=Path,help='Browser executable to match the showcase browser; uses an isolated temporary profile')
    parser.add_argument('--cpu-profile',type=Path,help='Save a diagnostic CDP CPU profile; this run cannot approve performance')
    parser.add_argument('--lights',choices=['on','off'],help='Override the fixture lighting for a matched comparison')
    parser.add_argument('--lamp-backend',choices=['gpu','canvas'],help='Compare running lamps on the same sources and effect profile')
    args=parser.parse_args()
    fixture={}
    if args.lights is not None:fixture['lights']=args.lights=='on'
    if args.lamp_backend is not None:fixture['lampBackend']=args.lamp_backend
    report=validate(args,fixture_override=fixture or None)
    print(json.dumps({key:report[key] for key in ['status','headless','metrics','minimumVisible','requested','counters','errors']},indent=2))


if __name__=='__main__':
    main()
