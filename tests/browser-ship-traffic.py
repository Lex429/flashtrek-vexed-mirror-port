"""Live frame wiring, native ship contact pixels and saved traffic/delivery behavior."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'test-results'/'ship-traffic'
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
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
        page.goto(base+'/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.startNativeDevGame&&nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=90000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState()&&nativeCombatShots.isReady()&&nativeSolAsteroids.placements.length')
        page.evaluate('''()=>{
          window.__trafficCalls={advance:0,collide:0};const api=nativeShipTraffic;
          window.nativeShipTraffic={...api,advance(...args){__trafficCalls.advance++;return api.advance(...args);},collide(...args){__trafficCalls.collide++;return api.collide(...args);}};
        }''')
        page.wait_for_function('()=>__trafficCalls.advance>5&&__trafficCalls.collide>5')
        page.evaluate('window.requestAnimationFrame=()=>0')
        page.wait_for_timeout(100)
        report = page.evaluate(r'''async()=>{
          const check=(v,m)=>{if(!v)throw Error(m);},near=(a,b,m)=>check(Math.abs(a-b)<.02,m+': '+a+' != '+b),copy=v=>JSON.parse(JSON.stringify(v));
          const liveFrameCalls={...__trafficCalls},original=copy(nativeNpcDev.getState()),templates={civilian:copy(original.civilianTraffic.ships.find(s=>s.id===2)),tug:copy(original.solEconomy.freighters[0])};
          const canvas=document.createElement('canvas');canvas.id='ship-traffic-output';canvas.width=1100;canvas.height=700;
          canvas.style.cssText='position:fixed;left:10px;top:80px;z-index:100000;background:#050a12';document.body.append(canvas);
          const ctx=canvas.getContext('2d',{willReadFrequently:true}),realFlash=drawShowcaseShieldFlash,flashes=[];
          window.drawShowcaseShieldFlash=(context,image,w,h,flash,...rest)=>{
            if(context===ctx)flashes.push(new DOMPoint(flash.x,flash.y).matrixTransform(context.getTransform()));
            return realFlash(context,image,w,h,flash,...rest);
          };
          const contactPixels=[],arc=ctx.arc.bind(ctx);
          ctx.arc=(x,y,r,...args)=>{if(r>0&&r<=5)contactPixels.push(new DOMPoint(x,y).matrixTransform(ctx.getTransform()));return arc(x,y,r,...args);};
          function fresh(){
            nativeShipEffects.reset();nativeCombatShots.reset();nativeEnvironmentalImpacts.reset();
            const s=copy(original);Object.assign(s,{system:1,x:10000,y:10000,speed:0,vx:0,vy:0,hull:1000,shields:1000,landed:false,localCruise:null,arrivalApproach:null});
            s.civilianTraffic.ships=[];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];return s;
          }
          function putPlayer(s,x,y){const p=vexedSolFlight.shipPosition(s);s.x+=x-p.x;s.y+=y-p.y;}
          function put(s,category,id,x,heading,shielded){
            const e=category==='player'?s:copy(templates[category]);
            for(const k of ['localLeg','lifeLeg','journey','disputeId','retaliationId','motionKick','scriptedDemo','dockingMove'])delete e[k];
            Object.assign(e,{id,system:1,phase:category==='tug'?'waiting':'docked',heading,angle:heading,dimensions:{width:30,height:60},hull:1000,shields:shielded?1000:0,speed:id===1?100:0,vx:id===1?100:0,vy:0,credits:1200,cargo:{good:5,tons:4}});
            if(category==='player')putPlayer(s,x,0);else{e.x=x;e.y=0;(category==='tug'?s.solEconomy.freighters:s.civilianTraffic.ships).push(e);}
            e.previousX=x-(id===1?40:0);e.previousY=0;return e;
          }
          const scenarios=[];
          for(const categories of [['player','civilian'],['player','tug'],['civilian','tug']])for(const shielded of [true,false]){
            const s=fresh(),a=put(s,categories[0],1,0,0,shielded),b=put(s,categories[1],2,40,.3,shielded);
            for(const [e,category] of [[a,categories[0]],[b,categories[1]]])await nativeShipEffects.prepare(e.shipType,category);
            nativeShipTraffic.collide(s,.4);check(a.vx<100&&b.vx>0,'Both ships must exchange momentum');
            check(a.hull===1000&&b.hull===1000&&a.shields===(shielded?1000:0)&&b.shields===(shielded?1000:0),'Contact damaged ship health');
            check(a.cargo.tons===4&&b.cargo.tons===4,'Contact lost cargo');
            nativeSimulation.advance(s,.06);nativeShipEffects.advance(s,.06);
            const index=scenarios.length,cx=180+(index%3)*360,cy=index<3?180:520,camera={x:20,y:0};
            for(const [e,category] of [[a,categories[0]],[b,categories[1]]]){
              let d=nativeShipDefinitions.describe(s,e,{category}),v=nativeShipEffects.snapshot(d);
              check(!!v.contact&&!v.flash,'Physical contact should show a local glint');
              const paint=()=>{nativeShipEffects.paintShip(ctx,d,{ship:camera,cx,cy});nativeShipEffects.paint(s,ctx,{ship:camera,cx,cy});};
              flashes.length=0;contactPixels.length=0;paint();
              check(flashes.length===0,'Ship contact painted a shield bubble');
              {
                const world=nativeCombatShots.worldPoint(d,v.contact),pixel=contactPixels.at(-1);check(pixel,'Contact glint was not painted');
                near(pixel.x,cx+world.x-camera.x,'Hull attachment x');near(pixel.y,cy+world.y-camera.y,'Hull attachment y');
                if(category==='player')e.angle+=.25;else e.heading+=.25;d=nativeShipDefinitions.describe(s,e,{category});
                contactPixels.length=0;paint();const moved=nativeCombatShots.worldPoint(d,v.contact);near(contactPixels.at(-1).x,cx+moved.x-camera.x,'Rotated hull attachment');
              }
            }
            ctx.fillStyle='#fff';ctx.font='13px sans-serif';ctx.fillText(categories.join(' / ')+' / '+(shielded?'shields':'hulls'),cx-140,cy+90);
            scenarios.push({categories,shielded,contact:nativeShipTraffic.snapshot(s).contacts[0],cargoPreserved:true,healthPreserved:true});
          }
          // Actual task owner, real inventory and berth; no visual-only arrival.
          const s=fresh(),ship=copy(templates.civilian);Object.assign(ship,{system:1,port:3,phase:'docked',cargo:null,oreHold:0,credits:1200,timer:10000,deliveries:0});
          for(const k of ['lifeVersion','task','localLeg','lifeLeg','journey','nextActionAt','lifeScheduleToken','dockingVersion','motionKick','motionSpin','dockingMove','dockIntent'])delete ship[k];
          s.civilianTraffic.ships=[ship];nativeNpcLives.initialize(s);
          const source=nativeNpcLives.market(s,1,3),buyer=nativeNpcLives.market(s,1,5),before={source:source.stock[5],buyer:buyer.stock[5],money:source.credits+buyer.credits+ship.credits};
          check(nativeNpcLives.startDelivery(s,ship.id,{fromSystem:1,fromPort:3,toSystem:1,toPort:5,good:5,tons:4}).ok,'Delivery reservation failed');
          function tick(state,seconds){for(let i=0;i<Math.round(seconds*60);i++){nativeSimulation.advance(state,1/60);nativeShipTraffic.advance(state,1/60);nativeCivilianTraffic.advance(state,1/60);nativeShipTraffic.collide(state,1/60);}}
          let elapsed=0;while(!(ship.cargo&&ship.localLeg&&ship.task.phase==='approaching')&&elapsed++<1200)tick(s,.25);
          check(ship.cargo&&ship.localLeg,'Cargo did not depart');const berth={...ship.localLeg.goal};putPlayer(s,berth.x,berth.y);s.previousX=berth.x;s.previousY=berth.y;
          elapsed=0;while(ship.trafficControl?.mode!=='yielding'&&elapsed++<1200)tick(s,.25);
          check(ship.trafficControl?.mode==='yielding','Blocked pilot did not yield');tick(s,30);check(ship.cargo.tons===4&&buyer.stock[5]===before.buyer,'Blocked delivery unloaded early');
          const inspectedBefore=JSON.stringify(ship);nativeGalaxyOverview.setActive(true,s);nativeGalaxyOverview.select(ship.id);
          check(document.querySelector('[data-activity]').textContent==='Giving way to traffic','Selected-ship panel did not explain yielding');
          check(JSON.stringify(ship)===inspectedBefore,'Traffic inspection changed the saved ship');nativeGalaxyOverview.setActive(false,s);
          const saved=copy(s);nativeNpcLives.initialize(saved);putPlayer(saved,10000,10000);const restored=nativeNpcLives.find(saved,ship.id);
          elapsed=0;while(restored.deliveries!==1&&elapsed++<1200)tick(saved,.25);
          const src=nativeNpcLives.market(saved,1,3),dst=nativeNpcLives.market(saved,1,5);
          check(restored.deliveries===1&&restored.cargo===null,'Restored delivery did not finish');
          check(src.stock[5]===before.source-4&&dst.stock[5]===before.buyer+4,'Delivery inventory mismatch');check(src.credits+dst.credits+restored.credits===before.money,'Delivery money mismatch');
          // Head-on scheduled traffic, including the Sol company's tug owner.
          const traffic=fresh(),tug=put(traffic,'tug',1,-500,0,true),civilian=put(traffic,'civilian',2,500,Math.PI,true);
          Object.assign(tug,{phase:'travel',lifeLeg:nativeShipMotion.planLeg(tug,{x:500,y:0},nativeShipMotion.profiles.tug(),nativeSimulation.seconds(traffic))});tug.lifeEventAt=tug.lifeLeg.startedAt+tug.lifeLeg.duration;
          Object.assign(civilian,{lifeVersion:1,dockingVersion:1,phase:'cruise',cargo:null,task:{id:'traffic-test',kind:'idle',phase:'idle',status:'active',origin:{system:1,port:3},destination:{system:1,port:3}},localLeg:nativeShipMotion.planLeg(civilian,{x:-500,y:0},nativeShipMotion.profiles.civilian(nativeShipDefinitions.get(civilian.shipType,'civilian')),nativeSimulation.seconds(traffic))});civilian.nextActionAt=civilian.localLeg.startedAt+civilian.localLeg.duration;nativeNpcLives.initialize(traffic);
          let min=Infinity;for(let i=0;i<3600;i++){nativeSimulation.advance(traffic,1/60);nativeShipTraffic.advance(traffic,1/60);nativeShipMotion.sampleLeg(tug,tug.lifeLeg,nativeSimulation.seconds(traffic));nativeShipMotion.sampleLeg(civilian,civilian.localLeg,nativeSimulation.seconds(traffic));nativeShipTraffic.collide(traffic,1/60);min=Math.min(min,Math.hypot(tug.x-civilian.x,tug.y-civilian.y));}
          near(tug.x,500,'Tug destination');near(civilian.x,-500,'Civilian destination');check(nativeShipTraffic.snapshot(traffic).contacts.length===0,'Head-on traffic collided');
          const clearArrivals=[];
          for(const devMode of [false,true])for(const offset of [70,90,110]){
            const s=fresh();s.devMode=devMode;
            const a=put(s,'civilian',1,1000000-500,0,true),b=put(s,'civilian',2,1000000,0,true);
            Object.assign(a,{shipType:47,y:offset,previousY:offset,phase:'cruise',speed:0,vx:0,vy:0,
              lifeVersion:1,dockingVersion:1,task:{id:'clear-arrival',kind:'idle',phase:'idle',status:'active'},nextActionAt:1e8});
            Object.assign(b,{shipType:47,y:0,previousY:0,phase:'docked',speed:0,vx:0,vy:0});
            for(const e of [a,b])Object.assign(e,{role:'freight',ownerGovernmentId:1,homeSystem:1,seedSystem:1,stationSystem:1,operatingBase:1,homeBase:{system:1,port:3},port:3});
            nativeNpcLives.initialize(s);
            check(s.civilianTraffic.ships.includes(a)&&s.civilianTraffic.ships.includes(b),'Arrival fixture must retain both actual NPCs');
            // Initialization restores saved berth/mission state. Set the local
            // travel fixture after that migration, as the real task owner does.
            Object.assign(a,{system:1,x:1000000-500,y:offset,heading:0,speed:0,vx:0,vy:0,phase:'cruise'});
            Object.assign(b,{system:1,x:1000000,y:0,heading:0,speed:0,vx:0,vy:0,phase:'docked'});
            for(const e of [a,b])for(const field of ['journey','localLeg','lifeLeg','disputeId','retaliationId','scriptedDemo','dockingMove'])delete e[field];
            const goal={x:1000000,y:offset},profile=nativeShipDefinitions.forEntity(s,a,{category:'civilian'}).movement;
            a.localLeg=nativeShipMotion.planLeg(a,goal,profile,nativeSimulation.seconds(s));
            a.nextActionAt=a.localLeg.startedAt+a.localLeg.duration;
            const cargo=JSON.stringify(a.cargo),credits=a.credits;let separation=Infinity;
            for(let i=0;i<3600;i++){
              nativeSimulation.advance(s,1/60);nativeShipTraffic.advance(s,1/60);
              nativeShipMotion.sampleLeg(a,a.localLeg,nativeSimulation.seconds(s));nativeShipTraffic.collide(s,1/60);
              separation=Math.min(separation,Math.hypot(a.x-b.x,a.y-b.y));
            }
            near(a.x,goal.x,'Clear adjacent arrival x '+JSON.stringify({devMode,offset,clock:nativeSimulation.seconds(s),leg:a.localLeg,control:a.trafficControl}));near(a.y,goal.y,'Clear adjacent arrival y');
            check(nativeShipTraffic.snapshot(s).contacts.length===0,'Clear approach hit the parked hull');
            check(JSON.stringify(a.cargo)===cargo&&a.credits===credits,'Avoidance changed cargo or credits');
            clearArrivals.push({devMode,offset,minimumSeparation:separation,plans:nativeShipTraffic.snapshot(s).plans});
          }
          return {scenarios,delivery:{savedWhileYielding:true,settledOnce:true,moneyConserved:true,cargoConserved:true},headOn:{minimumSeparation:min,plans:nativeShipTraffic.snapshot(traffic).plans},clearArrivals,liveFrameCalls};
        }''')
        page.screenshot(path=str(OUTPUT/'contacts.png'))
        assert not errors, errors
        assert not failed, failed
        report.update(javascriptErrors=errors, failedResponses=failed)
        (OUTPUT/'browser-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
        browser.close()
finally:
    if server:
        server.shutdown()
