"""Exercise the active game's shared ships with actual Canvas output in a browser."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results'
OUTPUT.mkdir(exist_ok=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = None
if len(sys.argv) > 1:
    base = sys.argv[1].rstrip('/')
else:
    server = http.server.ThreadingHTTPServer(
        ('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'

errors, failed = [], []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
        page.goto(base + '/html-games/broken-mirror-port/index.html')
        page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate("""() => {
          const advance=nativeCivilianTraffic.advance;
          nativeCivilianTraffic.advance=(state,dt)=>{window.__contractState=state;return advance(state,dt);};
          startNativeDevGame();
        }""")
        page.wait_for_function('() => window.__contractState && nativeCivilianTraffic.effectsReady() && nativeSolAsteroids.placements.length', timeout=120000)
        # Finish the already scheduled frame, then run controlled simulation steps.
        page.evaluate('window.requestAnimationFrame=()=>0')
        page.wait_for_timeout(100)
        results = page.evaluate("""async () => {
          function check(value,message){if(!value)throw Error(message);}
          const near=(actual,wanted,message)=>check(Math.abs(actual-wanted)<.001,`${message}: ${actual} vs ${wanted}`);
          const clone=value=>JSON.parse(JSON.stringify(value));
          const base=clone(window.__contractState);
          const canvas=document.createElement('canvas');canvas.width=900;canvas.height=500;
          canvas.id='ship-contract-output';canvas.style.cssText='position:fixed;top:100px;left:20px;z-index:10000;background:#000;border:1px solid #678';
          document.body.append(canvas);const ctx=canvas.getContext('2d',{willReadFrequently:true});
          const painted=[],flashes=[],ellipses=[];
          const ellipse=ctx.ellipse.bind(ctx);ctx.ellipse=(...args)=>{ellipses.push(args);return ellipse(...args);};
          const renderWeapon=window.paintShowcaseWeaponShot;
          window.paintShowcaseWeaponShot=(context,shot,geometry,age)=>{
            if(context===ctx)painted.push({...geometry,age});
            return renderWeapon(context,shot,geometry,age);
          };
          const renderFlash=window.drawShowcaseShieldFlash;
          window.drawShowcaseShieldFlash=(context,image,w,h,flash,time,...options)=>{
            if(context===ctx){const transform=context.getTransform(),point=new DOMPoint(flash.x,flash.y).matrixTransform(transform);flashes.push({x:point.x,y:point.y,localX:flash.x,localY:flash.y});}
            return renderFlash(context,image,w,h,flash,time,...options);
          };
          function pixels(x,y,radius=8){
            const left=Math.max(0,Math.floor(x-radius)),top=Math.max(0,Math.floor(y-radius));
            const data=ctx.getImageData(left,top,Math.min(canvas.width-left,radius*2+1),Math.min(canvas.height-top,radius*2+1)).data;
            let count=0;for(let i=3;i<data.length;i+=4)if(data[i]>10)count++;
            return count;
          }
          const clear=()=>ctx.clearRect(0,0,canvas.width,canvas.height);
          const models={};for(const model of VexedMirrorWeapons)if(model.damage>0){const kind=nativeCombatShots.weaponVisual(model).kind;if(!models[kind])models[kind]=model;}
          check(models.beam&&models.disruptor&&models.torpedo,'Missing actual weapon models');
          const templateCivilian=base.civilianTraffic.ships[0],templateTug=base.solEconomy.freighters[0];
          const categories=Object.keys(nativeShipDefinitions.profiles);
          check(categories.includes('player')&&categories.includes('tug')&&categories.includes('civilian'),'Missing ship categories');
          // This fixture explicitly fits the same armed hull for each controller.
          nativeShipDefinitions.register(10,{profiles:{tug:{capabilities:{armed:true}}}});
          nativeShipDefinitions.register(9001,{name:'Contract test ship',artworkProfile:nativeShipDefinitions.artworkProfile(7),hull:1000,shields:1000,speedOrOtherStationValue:40,turn:8,
            dimensions:{width:38,height:66},movement:{maxSpeed:73,acceleration:80,braking:90,turnRate:.9},
            emitters:{beam:{x:.17,y:-.28},projectile:{x:-.12,y:-.32}}});
          function scenario(sourceCategory,targetCategory,kind='beam',shieldState='active',custom=false){
            nativeCombatShots.reset();nativeShipEffects.reset();
            const state=clone(base);delete state.weaponCombat;delete state.shipSimulation;delete state.shipEquipment;delete state.weaponLoadout;
            Object.assign(state,{devMode:false,system:1,localBody:3,x:100000,y:100000,angle:0,speed:0,landed:false,hull:1000,shields:1000,weapons:[models[kind].id,null,null],weaponInventory:[]});
            state.civilianTraffic.ships=[];state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];state.civilianTraffic.strayShots=[];
            state.solEconomy.freighters=[];
            const origin=vexedSolFlight.shipPosition(state);
            const putPlayer=point=>{const current=vexedSolFlight.shipPosition(state);state.x+=point.x-current.x;state.y+=point.y-current.y;};
            const create=(category,point,id,isSource)=>{
              let entity;
              if(category==='player'){entity=state;putPlayer(point);}
              else if(category==='tug'){entity={...clone(templateTug),id,shipType:10,phase:'waiting',x:point.x,y:point.y,heading:0,speed:0,hull:1000,shields:1000};state.solEconomy.freighters.push(entity);}
              else{entity={...clone(templateCivilian),id,shipType:custom&&isSource?9001:47,system:1,phase:'cruise',x:point.x,y:point.y,heading:0,speed:0,hull:1000,shields:1000};state.civilianTraffic.ships.push(entity);}
              if(isSource){delete entity.shipEquipment;delete entity.weaponLoadout;entity.weapons=[models[kind].id,null,null];}
              return {entity,category};
            };
            const source=create(sourceCategory,origin,88001,true),target=create(targetCategory,{x:origin.x+240,y:origin.y},88002,false);
            if(![sourceCategory,targetCategory].includes('player'))putPlayer({x:origin.x,y:origin.y+1000});
            if(shieldState==='absent')target.entity.shields=0;
            else if(shieldState==='collapse')target.entity.shields=Math.max(.1,models[kind].damage*.5);
            const describe=actor=>nativeShipDefinitions.describe(state,actor.entity,{category:actor.category});
            return {state,source,target,describe,camera:{x:origin.x,y:origin.y},view(){return {state,ship:this.camera,cx:210,cy:250,zoom:1};}};
          }
          function tick(test,dt){const elapsed=nativeSimulation.advance(test.state,dt);nativeCombatShots.advance(test.state,elapsed);nativeShipEffects.advance(test.state,elapsed);return elapsed;}
          function fire(test){
            const source=test.describe(test.source),target=test.describe(test.target);
            const result=nativeCombatShots.fireFor({state:test.state,shooter:source,target,shipHeight:source.dimensions.height,owner:'browser-contract'});
            check(result.ok,'Shared firing failed: '+result.error);return result;
          }
          function expectedEmitter(test){
            const source=test.describe(test.source),emitter=source.definition.emitters.beam;
            const x=emitter.x*source.dimensions.width,y=emitter.y*source.dimensions.height,angle=source.heading+Math.PI/2;
            return {x:source.x+x*Math.cos(angle)-y*Math.sin(angle),y:source.y+x*Math.sin(angle)+y*Math.cos(angle)};
          }
          function draw(test,fired){clear();painted.length=0;nativeCombatShots.paint(ctx,fired.shot,test.view());check(painted.length===1,'Shot did not reach the actual showcase renderer');return painted[0];}
          const attachment=[];
          const roster=categories.map((category,index)=>[category,categories[(index+1)%categories.length],false]);
          roster.push(['civilian','tug',true]);
          for(const [sourceCategory,targetCategory,custom] of roster){
            const test=scenario(sourceCategory,targetCategory,'beam','active',custom),fired=fire(test);
            tick(test,.015);
            let geometry=draw(test,fired),emitter=expectedEmitter(test);
            near(geometry.x1,210+emitter.x-test.camera.x,'Initial emitter x');near(geometry.y1,250+emitter.y-test.camera.y,'Initial emitter y');
            check(pixels(geometry.x1+5,geometry.y1)>0,'Actual beam has no pixels at its emitter');
            const initial={x:geometry.x1,y:geometry.y1};
            test.source.entity.speed=120;test.target.entity.speed=25;
            const profile={maxSpeed:150,acceleration:90,braking:120,turnRate:3};
            nativeShipSystems.move(test.state,test.source.entity,sourceCategory,{turn:1,throttle:1},profile,.035);
            nativeShipSystems.move(test.state,test.target.entity,targetCategory,{turn:-.7,throttle:.3},profile,.035);
            tick(test,.035);geometry=draw(test,fired);emitter=expectedEmitter(test);
            near(geometry.x1,210+emitter.x-test.camera.x,'Moving and rotating emitter x');near(geometry.y1,250+emitter.y-test.camera.y,'Moving and rotating emitter y');
            check(Math.hypot(geometry.x1-initial.x,geometry.y1-initial.y)>1,'Beam failed to follow moving ship '+JSON.stringify({sourceCategory,custom,phase:test.source.entity.phase,speed:test.source.entity.speed,engine:test.source.entity.shipEquipment?.slots.engineering,initial,geometry,source:test.describe(test.source).definition}));
            check(pixels(geometry.x1+5,geometry.y1)>0,'Moving emitter has no beam pixels');
            test.camera.x+=37;test.camera.y-=19;
            const pan=draw(test,fired);near(pan.x1,geometry.x1-37,'Camera pan emitter x');near(pan.y1,geometry.y1+19,'Camera pan emitter y');
            check(pixels(pan.x1+5,pan.y1)>0,'Camera-pan beam output vanished');
            attachment.push({source:custom?'registered custom ship':sourceCategory,target:targetCategory,movingShooter:true,rotatingShooter:true,movingTarget:true,rotatingTarget:true,camera:true,pixels:true});
          }
          const impacts=[];
          for(const category of categories)for(const shieldState of ['active','collapse','absent']){
            const sourceCategory=category==='player'?'civilian':'player';
            const test=scenario(sourceCategory,category,'beam',shieldState),fired=fire(test);
            await nativeShipEffects.prepare(test.describe(test.target).shipType,category);
            nativeShipSystems.move(test.state,test.target.entity,category,{turn:.8,throttle:.2},{maxSpeed:60,acceleration:40,braking:80,turnRate:3},.04);
            tick(test,.09);const descriptor=test.describe(test.target),snapshot=nativeShipEffects.snapshot(descriptor);
            check(fired.event.contact,'The firing lifecycle did not preserve its authoritative contact');
            const contact=fired.event.contact;
            if(shieldState!=='absent'){
              check(snapshot.flash,'No shared shield flash for '+category+' '+shieldState);
              near(snapshot.flash.x,contact.local.x,'Shield local contact x');near(snapshot.flash.y,contact.local.y,'Shield local contact y');
              if(shieldState==='collapse')check(test.target.entity.shields===0&&snapshot.flash.charge===0,'Shield collapse flash did not preserve zero charge');
              nativeShipSystems.move(test.state,test.target.entity,category,{turn:1,throttle:.2},{maxSpeed:60,acceleration:40,braking:80,turnRate:3},.04);
              tick(test,.04);clear();flashes.length=0;
              nativeShipEffects.paintSurface(ctx,test.describe(test.target),test.view(),{front:true});
              check(flashes.length===1,'Shield effect did not reach the actual renderer');
              const expected=nativeCombatShots.worldPoint(test.describe(test.target),{x:snapshot.flash.x,y:snapshot.flash.y});
              near(flashes[0].x,210+expected.x-test.camera.x,'Rendered shield patch x');near(flashes[0].y,250+expected.y-test.camera.y,'Rendered shield patch y');
              check(pixels(flashes[0].x,flashes[0].y,12)>0,'Shield patch produced no visible pixels');
            }else{
              check(!snapshot.flash&&snapshot.particles>0,'Unshielded contact did not produce shared hull sparks');
              tick(test,.035);clear();nativeShipEffects.paint(test.state,ctx,test.view());
              check(pixels(210+contact.world.x-test.camera.x,250+contact.world.y-test.camera.y,30)>0,'Hull contact produced no visible spark pixels');
            }
            impacts.push({target:category,shieldState,authoritativeContact:true,renderedPixels:true});
          }
          nativeShipDefinitions.register(47,{geometry:{shield:{rx:58,ry:24}}});
          const customTarget=scenario('player','civilian'),customShot=fire(customTarget);
          await nativeShipEffects.prepare(47,'civilian');
          nativeShipSystems.move(customTarget.state,customTarget.target.entity,'civilian',{turn:.8},{maxSpeed:60,acceleration:40,braking:80,turnRate:3},.04);
          tick(customTarget,.09);
          check(customShot.event.contact,'Custom ellipse was not hit');
          const customContact=customShot.event.contact;
          near(Math.hypot(customContact.local.x/58,customContact.local.y/24),.96,'Custom collision ellipse');
          tick(customTarget,.04);clear();flashes.length=0;ellipses.length=0;
          nativeShipEffects.paintSurface(ctx,customTarget.describe(customTarget.target),customTarget.view(),{front:true});
          check(ellipses.some(args=>Math.abs(args[2]-58)<.001&&Math.abs(args[3]-24)<.001),'Actual shield renderer ignored custom collision ellipse');
          check(flashes.length===1&&pixels(flashes[0].x,flashes[0].y,12)>0,'Custom shield contact produced no visible pixels');
          impacts.push({target:'registered custom shield ellipse',shieldState:'active',authoritativeContact:true,renderedPixels:true});
          nativeShipDefinitions.register(47,{});
          const inherited=scenario('civilian','player','beam','active',true);
          // Definition speed is measured in clear space. Traffic avoidance is
          // exercised separately; the former target would now make this ship yield.
          inherited.state.y+=10000;
          for(let i=0;i<30;i++)nativeShipSystems.move(inherited.state,inherited.source.entity,'civilian',{turn:0,throttle:1},undefined,.05);
          near(inherited.source.entity.speed,73,'New registered ship must inherit its movement definition');
          const projectile=[];
          for(const kind of ['torpedo','disruptor'])for(const category of categories){
            const test=scenario(category,category==='player'?'civilian':'player',kind),fired=fire(test);
            tick(test,.06);const before={x:fired.event.x,y:fired.event.y};
            const first=draw(test,fired);check(pixels(first.x,first.y,15)>0,'Projectile produced no visible pixels');
            test.camera.x+=49;test.camera.y+=23;const second=draw(test,fired);
            near(second.x,first.x-49,'Projectile camera x');near(second.y,first.y-23,'Projectile camera y');
            near(fired.event.x,before.x,'Rendering moved projectile world x');near(fired.event.y,before.y,'Rendering moved projectile world y');
            for(const overlay of [nativePause,nativeShipInventory]){
              overlay.open();check(overlay.active,'Overlay did not open');const frozen=JSON.stringify(fired.event),clock=nativeSimulation.seconds(test.state);
              check(tick(test,.4)===0,'Overlay allowed gameplay time');near(nativeSimulation.seconds(test.state),clock,'Overlay changed simulation clock');
              check(JSON.stringify(fired.event)===frozen,'Overlay moved a projectile');const paused=draw(test,fired);
              near(paused.x,second.x,'Paused projectile draw x');near(paused.y,second.y,'Paused projectile draw y');overlay.close();
            }
            tick(test,.02);check(Math.hypot(fired.event.x-before.x,fired.event.y-before.y)>0,'Projectile did not resume');
            const saved=JSON.stringify(test.state),restored=JSON.parse(saved);nativeCombatShots.reset();
            const restoredTest={...test,state:restored,view(){return {state:restored,ship:this.camera,cx:210,cy:250,zoom:1};}};
            nativeCombatShots.advance(restored,0);clear();painted.length=0;nativeCombatShots.paintAll(ctx,restoredTest.view());
            check(painted.length>0,'Saved in-flight projectile did not render after reload');
            projectile.push({source:category,kind,cameraIndependent:true,pausedAndInventoryFrozen:true,resumed:true,saveReload:true});
          }
          return {attachment,impacts,projectile,newShipInheritsMovement:true,passed:true};
        }""")
        page.screenshot(path=str(OUTPUT / 'ship-contract.png'))
        assert not errors, errors
        assert not failed, failed
        results.update(javascriptErrors=errors, failedResponses=failed)
        (OUTPUT / 'browser-ship-contract.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
        print(json.dumps(results, indent=2))
        browser.close()
finally:
    if server:
        server.shutdown()
