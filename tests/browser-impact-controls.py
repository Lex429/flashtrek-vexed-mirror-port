"""Real keyboard input before/after a ram, speed/offset torque and native rendering."""
import functools
import http.server
import json
import math
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'test-results'/'impact-controls'
OUTPUT.mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = None
if len(sys.argv) > 1:
    base = sys.argv[1].rstrip('/')
else:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
errors, failed = [], []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        host = browser.new_page(viewport={'width': 1280, 'height': 850})
        page = host
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append(response.url)
                if response.status >= 400 and '/html-games/broken-mirror-port/' in response.url else None)
        page.add_init_script('''(()=>{
          const raf=requestAnimationFrame;window.requestAnimationFrame=fn=>raf(t=>{
            if(fn.name==='draw'){window.__impactDraw=fn;window.__impactStamp=t;if(window.__impactHold)return;}
            fn(t);
          });
        })();''')
        if '--hub' in sys.argv:
            host.goto(base+'/games.html?game=broken-mirror-port')
            page = host.locator('#gameFrame').element_handle().content_frame()
        else:
            page.goto(base+'/html-games/broken-mirror-port/index.html')
        page.locator('[data-menu="dev"]').click(timeout=30000)
        page.wait_for_function('()=>nativeNpcDev.getState()&&window.__impactDraw&&nativeSolAsteroids.placements.length')
        page.evaluate('window.__impactHold=true;window.requestAnimationFrame=()=>0')
        host.wait_for_timeout(100)
        page.evaluate(r'''()=>{
          const copy=v=>JSON.parse(JSON.stringify(v));window.__impactBase=copy(nativeNpcDev.getState());
          const template=copy(__impactBase.solEconomy.freighters[0]);
          const check=(v,m)=>{if(!v)throw Error(m);};
          window.__impactCheck=check;
          window.__impactTick=n=>{for(let i=0;i<n;i++){__impactStamp+=1000/60;__impactDraw(__impactStamp);}};
          window.__impactPlayer=(s,x,y)=>{const p=vexedSolFlight.shipPosition(s);s.x+=x-p.x;s.y+=y-p.y;};
          window.__impactActivate=(speed=null)=>{
            const s=copy(__impactBase);Object.assign(s,{system:1,localBody:3,x:6000,y:6000,angle:0,speed:0,vx:0,vy:0,landed:false,localCruise:null,arrivalApproach:null});
            for(const k of ['motionKick','motionSpin','pendingTransit'])delete s[k];
            s.civilianTraffic.ships=[];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
            s.minedAsteroids=nativeSolAsteroids.forSystem(1).map(r=>r.slotId);s.destroyedAsteroids=[];
            if(speed!==null){
              nativeShipDefinitions.register(s.shipType,{mass:1,geometry:{shield:{rx:5,ry:10}}});
              nativeShipDefinitions.register(10,{mass:12,geometry:{shield:{rx:12,ry:60}}});
              Object.assign(s,{angle:Math.PI/2,speed,vx:0,vy:speed,hull:1000,shields:1000,dimensions:{width:10,height:20}});__impactPlayer(s,40,-90);
              const tug=copy(template);for(const k of ['motionKick','motionSpin','lifeLeg','journey'])delete tug[k];
              Object.assign(tug,{x:0,y:0,previousX:0,previousY:0,heading:0,speed:0,vx:0,vy:0,phase:'waiting',hull:1000,shields:1000,lifeEventAt:1e8,dimensions:{width:24,height:120},tons:4});
              s.solEconomy.freighters=[tug];
            }
            localStorage.setItem('broken-mirror-native-save',JSON.stringify(s));resumeNativeGame();__impactTick(1);return nativeNpcDev.getState();
          };
          window.__impactSnapshot=()=>{const s=nativeNpcDev.getState();return copy({x:s.x,y:s.y,angle:s.angle,speed:s.speed,vx:s.vx,vy:s.vy,kick:s.motionKick,spin:s.motionSpin,clock:nativeSimulation.seconds(s)});};
          __impactActivate();
        }''')

        def drive(key, frames):
            host.keyboard.down(key)
            page.evaluate('__impactTick('+str(frames)+')')
            host.keyboard.up(key)
            return page.evaluate('__impactSnapshot()')

        report = {'keys': {}}
        page.locator('#devToolsBtn').click()
        page.locator('#galaxy-map-button').click()
        page.evaluate('__impactTick(1)')
        page.locator('#dev-galaxy-return').click()
        start = page.evaluate('__impactSnapshot()')
        up = drive('w', 60)
        right = drive('d', 30)
        stop = drive('s', 120)
        arrow_up = drive('ArrowUp', 60)
        left = drive('ArrowLeft', 30)
        arrow_right = drive('ArrowRight', 15)
        arrow_stop = drive('ArrowDown', 120)
        assert up['speed'] > 0 and up['x'] > start['x']
        assert right['angle'] > up['angle']+.2
        assert stop['speed'] == 0
        assert arrow_up['speed'] > 0 and left['angle'] < arrow_up['angle']-.2
        assert arrow_right['angle'] > left['angle']+.2
        assert arrow_stop['speed'] == 0
        report['keys'] = {'W': up, 'D': right, 'S': stop, 'ArrowUp': arrow_up, 'ArrowLeft': left, 'ArrowRight': arrow_right, 'ArrowDown': arrow_stop}

        impacts = []
        for speed in (40, 150):
            page.evaluate('(speed)=>__impactActivate(speed)', speed)
            page.evaluate('''async()=>{
              const s=nativeNpcDev.getState();await nativeShipEffects.prepare(s.shipType,'player');await nativeShipEffects.prepare(10,'tug');
            }''')
            impact = page.evaluate('''(speed)=>{
              const s=nativeNpcDev.getState(),t=s.solEconomy.freighters[0];let steps=0;
              while(!t.motionSpin&&steps++<600)__impactTick(1);
              __impactCheck(Math.abs(t.motionSpin?.velocity||0)>.01,'Actual keyboard-frame ram did not twist tug');
              return {speed,heading:t.heading,angularVelocity:t.motionSpin.velocity,vx:t.vx,vy:t.vy,cargo:t.tons,hull:t.hull,shields:t.shields};
            }''', speed)
            assert impact['cargo'] == 4 and impact['hull'] == 1000 and impact['shields'] == 1000
            impacts.append(impact)
        assert abs(impacts[1]['angularVelocity']) > abs(impacts[0]['angularVelocity'])*3
        assert impacts[1]['vy'] > impacts[0]['vy']*3
        report['impacts'] = impacts
        page.evaluate('''()=>{
          window.__impactFlashes=[];const render=drawShowcaseShieldFlash,canvas=document.querySelector('#space'),ctx=canvas.getContext('2d');
          window.drawShowcaseShieldFlash=(context,image,w,h,flash,...rest)=>{
            if(context===ctx)__impactFlashes.push(new DOMPoint(flash.x,flash.y).matrixTransform(context.getTransform()));
            return render(context,image,w,h,flash,...rest);
          };
          __impactTick(3);__impactFlashes=[];__impactTick(1);
          const s=nativeNpcDev.getState(),t=s.solEconomy.freighters[0],d=nativeShipDefinitions.describe(s,t,{category:'tug'}),v=nativeShipEffects.snapshot(d),player=vexedSolFlight.shipPosition(s);
          __impactCheck(!!v.flash,'Native shield flash missing after twisting contact');
          const world=nativeCombatShots.worldPoint(d,v.flash),view=nativeView.measure(canvas),x=(view.w/2+world.x-player.x)*canvas.width/view.w,y=(view.h/2+world.y-player.y)*canvas.height/view.h;
          __impactCheck(__impactFlashes.some(p=>Math.hypot(p.x-x,p.y-y)<2),'Twisting ship shield flash is detached from rendered surface');
        }''')
        host.screenshot(path=str(OUTPUT/'fast-off-center-contact.png'))
        page.evaluate('''()=>{const s=nativeNpcDev.getState();__impactPlayer(s,6000,6000);s.previousX=6000;s.previousY=6000;}''')
        before = page.evaluate('__impactSnapshot()')
        thrust = drive('w', 30)
        steer = drive('a', 30)
        stopped = drive('s', 180)
        wrap = lambda angle: math.atan2(math.sin(angle), math.cos(angle))
        assert wrap(steer['angle']-thrust['angle']) < -.2
        kick_size = lambda sample: sum(abs(v) for k, v in (sample.get('kick') or {}).items() if k in ('vx', 'vy'))
        assert kick_size(thrust) < kick_size(before)
        assert stopped['speed'] == 0 and not stopped.get('kick')
        assert not stopped.get('spin') or abs(stopped['spin']['velocity']) < .0001
        report['afterRealImpact'] = {'before': before, 'thrust': thrust, 'steer': steer, 'stopped': stopped}
        assert not errors, errors
        assert not failed, failed
        report.update(javascriptErrors=errors, failedResponses=failed, passed=True)
        (OUTPUT/'browser-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
        browser.close()
finally:
    if server:
        server.shutdown()
