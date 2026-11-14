"""Destroyed player hulls disappear, shared debris moves, and recovery keeps saves."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/player-destruction'
OUT.mkdir(parents=True,exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.locator('[data-menu="dev"]').click()
        page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
        page.evaluate('''()=>{
          window.__recoveryBase=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          const restoreState=nativeCombatShots.restore;
          nativeCombatShots.restore=function(value){window.__recoveryCurrent=value;return restoreState.apply(this,arguments);};
          window.__recoveryInstall=(dev=false)=>{
            const api=nativeSimulation;window.nativeSimulation={...api,blocked:()=>true};nativeSimulationHost.checkpoint();
            const s=JSON.parse(JSON.stringify(__recoveryBase));
            Object.assign(s,{devMode:dev,shipType:7,system:2,localBody:0,x:4e6,y:4e6,angle:0,speed:0,vx:0,vy:0,hull:50,shields:0,phase:'flight',landed:false,localCruise:null,arrivalApproach:null,repairDroneMode:'manual'});
            for(const key of ['motionKick','motionSpin','motionFlow','motionDrift','motionReverse','motionAngularVelocity'])delete s[key];
            s.shipSimulation.schedule||={};s.shipSimulation.schedule.pendingSeconds=0;
            if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');
            resumeNativeGame(dev?'dev':'normal');
            window.__recoveryState=window.__recoveryCurrent;
            window.nativeSimulation=api;nativeSimulationHost.checkpoint();
            return nativeSaveStorage.read(dev?'dev':'normal').hull;
          };
          const draw=vexedFlightAssets.drawShip;window.__recoveryPaints={alive:0,dead:0};
          vexedFlightAssets.drawShip=function(...args){const owner=args.at(-1)?.owner;if(owner===window.__recoveryState)__recoveryPaints[owner.hull>0&&owner.phase!=='destroyed'?'alive':'dead']++;return draw.apply(this,args);};
          const impacts=nativeEnvironmentalImpacts;window.__recoveryPieces=new Map();
          window.nativeEnvironmentalImpacts={...impacts,debris(state,piece,...rest){
            if(state===window.__recoveryState&&piece.sourceKey==='ship:player'){
              let sample=__recoveryPieces.get(piece);if(!sample){sample={first:{x:piece.x,y:piece.y},last:{x:piece.x,y:piece.y}};__recoveryPieces.set(piece,sample);}sample.last={x:piece.x,y:piece.y};
            }
            return impacts.debris(state,piece,...rest);
          }};
          return __recoveryInstall(false);
        }''')
        page.evaluate('async()=>{await nativeShipEffects.prepare(7,"player");}')
        page.wait_for_function('()=>__recoveryPaints.alive>0',timeout=30000)
        # A critically damaged survivor stays paintable and repairable.
        critical=page.evaluate('''()=>{
          const s=__recoveryState;return nativeCombatShots.onPlayerHit(s,40,{kind:'torpedo',from:{x:s.x-100,y:s.y}});
        }''')
        assert critical['hull']==10 and critical['disabled'] and not critical['destroyed'],critical
        page.wait_for_timeout(150)
        assert not page.evaluate('nativePlayerDestruction.pending')
        assert page.evaluate('__recoveryState.phase')=='disabled'
        page.screenshot(path=str(OUT/'critical-survivor.png'))

        def destroy():
            return page.evaluate('''()=>{
              __recoveryPieces.clear();__recoveryPaints.dead=0;
              const s=__recoveryState,mode=s.devMode?'dev':'normal';
              const saved=localStorage.getItem(nativeSaveStorage.keys[mode]);
              const other=localStorage.getItem(nativeSaveStorage.keys[mode==='dev'?'normal':'dev']);
              nativeSaveStorage.schedule(s);
              const result=nativeCombatShots.onPlayerHit(s,999999,{kind:'torpedo',from:{x:s.x-100,y:s.y}});
              return {result,saved,other,mode,at:nativeSimulation.now(s),metrics:nativeShipEffects.metrics()};
            }''')

        killed=destroy()
        assert killed['result']['destroyed'] and killed['result']['hull']==0,killed['result']
        assert killed['metrics']['wreckPieces']>0 and killed['metrics']['wrecks']==1,killed['metrics']
        assert page.locator('#player-recovery').is_hidden()
        page.keyboard.down('w')
        page.wait_for_timeout(450)
        page.keyboard.up('w')
        assert page.evaluate('__recoveryPaints.dead')==0,'The renderer drew the dead hull'
        assert page.evaluate('__recoveryState.speed')==0
        page.screenshot(path=str(OUT/'explosion-debris.png'))
        page.keyboard.press('Escape')
        assert page.evaluate('nativePause.active')
        frozen=page.evaluate('nativeSimulation.now(__recoveryState)')
        page.wait_for_timeout(250)
        assert page.evaluate('nativeSimulation.now(__recoveryState)')==frozen
        assert page.locator('#player-recovery').is_hidden()
        page.keyboard.press('Escape')
        page.wait_for_timeout(3600)
        assert page.locator('#player-recovery').is_hidden(),'Recovery must not appear at the old 3.2-second deadline'
        page.wait_for_function('()=>nativePlayerDestruction.active',timeout=30000)
        waited=page.evaluate('nativeSimulation.now(__recoveryState)')-killed['at']
        assert 8000<=waited<10000,waited
        assert page.locator('[data-recovery-restore]').is_disabled(),'Invisible controls must wait for the fade'
        page.wait_for_timeout(1400)
        fading=page.locator('#player-recovery').evaluate('(e)=>Number(getComputedStyle(e).opacity)')
        assert 0<fading<1,fading
        page.screenshot(path=str(OUT/'recovery-fading.png'))
        page.wait_for_function('()=>document.querySelector("#player-recovery").dataset.revealing==="false"',timeout=10000)
        assert page.locator('#player-recovery h2').inner_text()=='Reincarnate'
        assert page.locator('#player-recovery .recovery-kicker,#player-recovery .recovery-copy').count()==0
        page.locator('[data-recovery-faction-logo]').evaluate('(im)=>im.decode()')
        assert page.locator('[data-recovery-faction-logo]').get_attribute('src')=='startup/factions/faction-1.png'
        assert page.locator('.recovery-faction-light').evaluate('(e)=>getComputedStyle(e).animationName')=='recovery-logo-sweep'
        assert 'faction-1.png' in page.locator('.recovery-faction-light').evaluate('(e)=>getComputedStyle(e).maskImage')
        assert page.locator('[data-recovery-restore]').is_enabled()
        assert page.evaluate('nativeSimulation.blocked()')
        frozen=page.evaluate('nativeSimulation.now(__recoveryState)')
        page.wait_for_timeout(150)
        assert page.evaluate('nativeSimulation.now(__recoveryState)')==frozen
        motion=page.evaluate('''()=>({pieces:__recoveryPieces.size,moved:[...__recoveryPieces.values()].filter(p=>Math.hypot(p.last.x-p.first.x,p.last.y-p.first.y)>.01).length,deadPaints:__recoveryPaints.dead})''')
        assert motion['pieces']>0 and motion['moved']>0 and motion['deadPaints']==0,motion
        assert page.evaluate('mode=>localStorage.getItem(nativeSaveStorage.keys[mode])',killed['mode'])==killed['saved']
        assert page.evaluate('mode=>localStorage.getItem(nativeSaveStorage.keys[mode==="dev"?"normal":"dev"])',killed['mode'])==killed['other']
        page.screenshot(path=str(OUT/'recovery.png'))
        page.locator('[data-recovery-restore]').hover()
        page.wait_for_timeout(200)
        assert page.locator('[data-recovery-restore] .recovery-button-frame rect').evaluate('(e)=>getComputedStyle(e).animationName')=='recovery-perimeter'
        assert page.locator('[data-recovery-restore]').evaluate('(e)=>getComputedStyle(e,"::after").opacity')!='0'
        page.screenshot(path=str(OUT/'recovery-hover.png'))
        page.keyboard.press('Tab')
        assert page.locator('[data-recovery-menu]').evaluate('(e)=>e.matches(":focus-visible")')
        page.keyboard.press('Escape')
        assert page.locator('#player-recovery').is_visible() and not page.evaluate('nativePause.active')
        page.locator('[data-recovery-restore]').click()
        assert page.locator('[data-recovery-restore]').evaluate('(e)=>e.classList.contains("recovery-pressed")')
        page.wait_for_function('()=>__recoveryState!==__recoveryCurrent&&__recoveryCurrent.hull>0')
        assert page.locator('#player-recovery').is_hidden()
        assert not page.evaluate('nativeSimulation.blocked()')
        assert page.evaluate('__recoveryCurrent.hull')==50
        page.evaluate('()=>__recoveryInstall(true)')
        page.wait_for_function('()=>__recoveryPaints.alive>0')
        dev_killed=destroy()
        # Mode recovery and old dead saves use the supported immediate path;
        # the full destruction delay and fade have already been checked above.
        page.emulate_media(reduced_motion='reduce')
        page.evaluate('()=>{nativePlayerDestruction.reset();nativePlayerDestruction.begin(__recoveryState,{immediate:true});}')
        page.wait_for_function('()=>nativePlayerDestruction.active',timeout=30000)
        page.wait_for_function('()=>document.querySelector("#player-recovery").dataset.revealing==="false"')
        assert page.locator('.recovery-card-frame rect').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
        assert page.evaluate('()=>localStorage.getItem(nativeSaveStorage.keys.dev)')==dev_killed['saved']
        page.locator('[data-recovery-restore]').click()
        assert page.evaluate('__recoveryCurrent.devMode')
        assert page.evaluate('__recoveryCurrent.hull')>0
        faction_colors=['#a6d9ef','#ef879e','#ef6254','#e5c660','#70dc70','#dac68c','#ca89ed','#a0f052']
        for faction,color in enumerate(faction_colors):
            page.evaluate('''faction=>{
              nativePlayerDestruction.reset();const s=__recoveryCurrent;
              Object.assign(s,{faction,hull:0,shields:0,phase:'destroyed'});
              nativePlayerDestruction.begin(s,{immediate:true});
            }''',faction)
            page.wait_for_function('()=>nativePlayerDestruction.active&&document.querySelector("#player-recovery").dataset.revealing==="false"')
            page.locator('[data-recovery-faction-logo]').evaluate('(im)=>im.decode()')
            assert page.locator('[data-recovery-faction-logo]').get_attribute('src')==f'startup/factions/faction-{faction+1}.png'
            assert page.locator('#player-recovery').get_attribute('data-faction')==str(faction+1)
            assert page.locator('#player-recovery').evaluate('(e)=>e.style.getPropertyValue("--recovery-faction-color")')==color
            assert page.locator('[data-recovery-faction-logo]').evaluate('(im)=>im.naturalWidth>0')
            assert page.locator('.recovery-faction-light').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
            if faction in (1,7):
                page.screenshot(path=str(OUT/f'recovery-faction-{faction+1}.png'))
        # A saved old dead hull cannot resume invisibly; offer the menu honestly.
        page.evaluate('''()=>{
          const s=JSON.parse(JSON.stringify(__recoveryBase));Object.assign(s,{devMode:false,hull:0,shields:0,phase:'destroyed'});
          delete s.reincarnation;
          localStorage.removeItem(nativeSaveStorage.recoveryKeys.normal);
          if(!nativeSaveStorage.write(s).ok)throw Error('Legacy fixture save failed');resumeNativeGame('normal');
        }''')
        page.wait_for_function('()=>nativePlayerDestruction.active',timeout=30000)
        page.wait_for_function('()=>document.querySelector("#player-recovery").dataset.revealing==="false"')
        assert page.locator('[data-recovery-restore]').is_disabled()
        page.locator('[data-recovery-menu]').click()
        assert page.locator('#menu-art').is_visible()
        assert not page.evaluate('nativePlayerDestruction.pending')
        assert not page.evaluate('nativeSimulation.blocked()')
        assert not errors,errors
        print(json.dumps({'normal':killed['result'],'dev':dev_killed['result'],'debris':motion,'recovery_delay_ms':waited,'mid_fade_opacity':fading,'faction_logos_checked':8,'masked_logo_light':True,'reincarnate_heading':True,'hover_and_keyboard_animation':True,'press_animation':True,'reduced_motion':True,'last_live_saves_preserved':True,'restore_modes_separate':True,'critical_survivor_visible':True,'legacy_dead_save_recovery':True,'errors':errors}))
        browser.close()
finally:
    server.shutdown()
