"""Real Dev asteroid registration, cached artwork, mining and plasma clearances."""
import argparse
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/asteroid-nebula/browser'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serve', action='store_true')
args = parser.parse_args()
report = dict(passed=False, errors=[], failedRequests=[])


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = None
if args.serve:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 7790), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport=dict(width=1280, height=800))
        page.add_init_script("Object.defineProperty(navigator,'getGamepads',{value:()=>[]});")
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.on('response', lambda r: report['failedRequests'].append(r.url) if r.status >= 400 else None)
        page.goto('http://127.0.0.1:7790/html-games/broken-mirror-port/index.html?devTraffic=off')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('''()=>{const api=nativeNebulaMaterial;window.__rockApi=api;window.nativeNebulaMaterial=Object.create(api,{renderPair:{value:function(...args){window.__rockLive=args;return api.renderPair(...args);}}});startNativeDevGame();nativeDevFog.setEnabled(true);}''')
        page.wait_for_function('()=>nativeDevFog.material()?.field.ready&&nativeDevFog.snapshot().asteroidCount>0&&nativeNebulaFire.volume', timeout=120000)
        page.screenshot(path=str(OUT / 'live-asteroids.png'))
        report['live'] = page.evaluate('''()=>({asteroids:nativeDevFog.snapshot().asteroids,shipCount:nativeDevFog.snapshot().shipCount,physicalShips:nativeShipSystems.collectShips(nativeNpcDev.getState()).length})''')
        assert report['live']['shipCount'] == 1 and report['live']['physicalShips'] == 1
        # Keep the real completed scene, but stop new game draws while testing
        # exact pixel/owner transitions. This is not a performance measurement.
        page.evaluate('''()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==='draw'?0:raf(fn);}''')
        page.wait_for_timeout(100)
        report['transitions'] = page.evaluate('''async()=>{
          const s=nativeNpcDev.getState(),api=__rockApi,initial=nativeDevFog.material(),view={...__rockLive[0],ship:vexedSolFlight.shipPosition(s)};
          const rock=nativeSolAsteroids.find(100,1),id='asteroid:'+rock.slotId;
          async function frame(){nativeDevFog.frame(s,1/60,view);await nativeDevFog.material().field.flush?.();return nativeDevFog.material().bodies.find(b=>b.id===id);}
          nativeAsteroidMotion.applyContact(s,rock,{x:-150,y:-110,angle:.63,vx:40,vy:-15,spin:.12});
          let b=await frame();if(!b||b.pose.x!==rock.x||b.pose.y!==rock.y||b.pose.heading!==rock.angle-Math.PI/2||b.pose.speed<40)throw Error('Saved asteroid pose not used by gas');
          const first=b.mask,reads=api.metrics().sampledMasks;
          for(let i=0;i<10;i++)await frame();if(api.metrics().sampledMasks!==reads)throw Error('Repeated asteroid GPU readback');
          s.asteroidDamage||={};s.asteroidDamage[rock.slotId]=rock.maxHull*.8;
          const file=nativeSolAsteroids.frame(rock,s.asteroidDamage[rock.slotId]);nativeSolAsteroids.image(file);
          while(!nativeSolAsteroids.peekImage(file)?.naturalWidth)await new Promise(r=>setTimeout(r,20));
          b=await frame();if(!b||b.mask===first)throw Error('Damage retained old asteroid outline');
          const saved=JSON.stringify(s.asteroidMotion.rocks[rock.slotId]);if(JSON.parse(saved).angle!==rock.angle)throw Error('Asteroid save pose changed');
          s.destroyedAsteroids||=[];s.destroyedAsteroids.push(rock.slotId);nativeShipSystems.refreshAsteroid(s,rock);
          if(await frame())throw Error('Destroyed asteroid still blocks gas');
          // Exercise the same cut geometry used by the actual mining renderer.
          const miningRock=nativeSolAsteroids.find(101,1),now=nativeSimulation.now(s),m={rock:miningRock,born:now-4200,state:s,effect:null};
          const combat=nativeAsteroidCombat;window.nativeAsteroidCombat={...combat,miningVisual:()=>m};
          const before=JSON.stringify(s),options={field:initial.field};
          const cut=nativeNebulaAsteroids.miningBodies(s,options),a=nativeAsteroidMiningEffects.appearance(m,now);
          if(cut.bodies.length!==4||!cut.ids.has(miningRock.slotId))throw Error('Mining pieces did not replace whole rock');
          for(let i=0;i<4;i++){const p=cut.bodies[i].pose;if(p.width!==miningRock.size*a.scale||p.heading!==miningRock.angle+a.parts[i].rotation-Math.PI/2)throw Error('Mining mask disagrees with cut artwork');}
          m.born=now-7500;if(nativeNebulaAsteroids.miningBodies(s,options).bodies.length)throw Error('Faded mining rock still obstructs gas');
          window.nativeAsteroidCombat=combat;if(JSON.stringify(s)!==before)throw Error('Visual mining changed gameplay');
          return {liveBodies:initial.bodies.length,damageUpdated:true,destroyedRemoved:true,miningPieces:cut.bodies.length,miningFadeReleased:true,extraRasterSamples:api.metrics().sampledMasks-reads,savedPose:JSON.parse(saved)};
        }''')
        report['pixels'] = page.evaluate('''async()=>{
          const api=__rockApi,files=['asteroids/asteroid_01_intact.png','asteroids/asteroid_04.png','asteroids/asteroid_05_heavy.png','deuranium/asteroid_severe.png'];
          for(const file of files){nativeSolAsteroids.image(file);while(!nativeSolAsteroids.peekImage(file)?.naturalWidth)await new Promise(r=>setTimeout(r,20));}
          // Ensure recursive deuranium predecessors have loaded as well.
          for(const file of ['deuranium/asteroid.png','deuranium/asteroid_light.png','deuranium/asteroid_heavy.png']){nativeSolAsteroids.image(file);while(!nativeSolAsteroids.peekImage(file)?.naturalWidth)await new Promise(r=>setTimeout(r,20));}
          const view={w:640,h:480,zoom:1,cameraX:0,cameraY:0},source=Object.assign(document.createElement('canvas'),{width:640,height:480}),sg=source.getContext('2d');sg.fillStyle='rgba(140,65,25,.8)';sg.fillRect(0,0,640,480);
          const out=Object.assign(document.createElement('canvas'),{width:640,height:480}),g=out.getContext('2d',{willReadFrequently:true}),art=Object.assign(document.createElement('canvas'),{width:640,height:480}),ag=art.getContext('2d',{willReadFrequently:true});
          const field=api.createField({minX:-320,minY:-240,width:640,height:480,cell:3,uniform:.8}),s=nativeNpcDev.getState(),before=JSON.stringify(s);
          let samples=0,leaks=0,gasPixels=0,image;const angles=[0,.71,1.82];
          for(const file of files)for(const angle of angles){
            const im=nativeSolAsteroids.image(file),mask=nativeNebulaAsteroids.maskFor(file,im),pose={x:0,y:0,heading:angle-Math.PI/2,width:170,height:170,speed:0},b={id:'rock-pixels',pose,mask};
            g.clearRect(0,0,640,480);const pair=api.renderPair(view,source,field,[b],{worldSource:true,direct:true,fireFronts:[{id:'heat',x:0,y:0,halfWidth:190,halfHeight:124,angle:.2,phase:.7,born:0,duration:15}],fireTime:4,sheetFlashes:[{x:0,y:0,halfWidth:235,halfHeight:155,c:1,s:0,strength:1}]});
            if(pair.paint){pair.paint(g,'back');pair.paint(g,'front');}else{g.drawImage(pair.back,0,0);g.drawImage(pair.front,0,0);}
            ag.clearRect(0,0,640,480);ag.save();ag.translate(320,240);ag.rotate(angle);ag.drawImage(im,-85,-85,170,170);ag.restore();
            const rgba=g.getImageData(0,0,640,480).data,alpha=ag.getImageData(0,0,640,480).data;
            for(let y=100;y<380;y+=3)for(let x=180;x<460;x+=3){const j=(y*640+x)*4;
              if([j,j-12,j+12,j-640*12,j+640*12].every(i=>alpha[i+3]>250)){samples++;if(rgba[j+3]>2)leaks++;}
              if(alpha[j+3]===0&&rgba[j+3]>40)gasPixels++;
            }
            if(file===files[0]&&angle===angles[1]){g.drawImage(art,0,0);image=out.toDataURL();}
          }
          if(leaks||samples<1000||gasPixels<1000)throw Error('Asteroid plasma clearance failed '+JSON.stringify({samples,leaks,gasPixels}));
          if(JSON.stringify(s)!==before)throw Error('Asteroid drawing changed state');
          return {samples,leaks,gasPixels,rotations:angles.length,plates:files.length,image};
        }''')
        (OUT / 'plasma-clearance.png').write_bytes(base64.b64decode(report['pixels'].pop('image').split(',')[1]))
        assert not report['errors'] and not report['failedRequests'], report
        report['passed'] = True
        browser.close()
finally:
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    if server:
        server.shutdown()
        server.server_close()
print(json.dumps(report))
