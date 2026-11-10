"""Actual shared weapons, faction alerts, 1,200-crew saves and system entry.

Controlled simulation steps test behavior; they do not qualify display FPS.
"""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/faction-defence';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,channel=os.environ.get('BROWSER_CHANNEL','msedge'));page=browser.new_page(viewport={'width':1280,'height':850});page.set_default_timeout(60000)
  page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
  page.wait_for_function('()=>nativeWorldBootstrap.diagnostics().ready||nativeWorldBootstrap.diagnostics().error',timeout=120000)
  assert page.evaluate('nativeWorldBootstrap.diagnostics().ready')
  page.evaluate('()=>{window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();startNativeDevGame();}')
  page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
  fixture=page.evaluate('''async()=>{
   const s=nativeNpcDev.getState(),ships=s.civilianTraffic.ships,ids=ships.map(e=>e.id),guards=ships.filter(e=>e.system===1&&e.role==='patrol'&&!e.journey&&e.hull>0).slice(0,3);
   const civilian=ships.find(e=>e.role==='freight'&&!e.journey&&e.ownerGovernmentId===1&&e.hull>0&&!guards.includes(e)),foreign=ships.find(e=>e.role==='freight'&&!e.journey&&e.ownerGovernmentId!==1&&e.hull>0);
   if(guards.length!==3||!civilian||!foreign)throw Error('No suitable real existing crews for defence fixture');
   nativeShipMotion.stop(s);Object.assign(s,{system:1,x:12000,y:3500,angle:0,landed:false,phase:'flight',localBody:nativeSystemCatalog.homeId(1),localSystemVersion:2,localCruise:null,ownerGovernmentId:1});delete s.arrivalApproach;
   const player=nativeShipDefinitions.describe(s);s.x+=12000-player.x;s.y+=3500-player.y;s.localPrestige[1]=100;delete s.factionDefence;
   const actors=[guards[0],guards[1],guards[2],civilian,foreign],points=[[12200,3500],[12300,3750],[17000,3500],[12500,4000],[12400,3250]];
   for(let i=0;i<actors.length;i++){
    const e=actors[i];nativeNpcLives.interrupt(s,e,'Controlled browser defence fixture');nativePortDocking.release(s,e);
    for(const key of ['localLeg','journey','dockingMove','dockIntent','disputeId','retaliationId','combatAI','factionResponse','combatInterruption'])delete e[key];
    Object.assign(e,{system:1,x:points[i][0],y:points[i][1],heading:i===2?Math.PI:0,phase:'holding',cargo:null,oreHold:0,nextActionAt:100000});nativeShipMotion.stop(e);
    const d=nativeShipDefinitions.forEntity(s,e);e.hull=d.hull;e.shields=d.shields;
    e.task={id:'browser-defence:'+e.id,kind:'reposition',status:'active',phase:'idle',origin:{system:1,port:3},destination:{system:1,port:3},requirements:{},createdAt:nativeSimulation.seconds(s),progress:0};
    nativeNpcLives.observeMotion(s,e);
   }
   for(const e of [s,guards[1],foreign])nativeWeaponLoadout.refit(s,[1],{holder:e});
   nativeNpcLives.invalidateMembership(s);nativeNpcLives.initialize(s);nativeShipSystems.invalidate(s);nativeManualFlight.initializeRegion(s);
   for(const e of actors)await nativeShipEffects.prepare(e.shipType);
   window.__defenceIds={a:guards[0].id,b:guards[1].id,far:guards[2].id,civilian:civilian.id,foreign:foreign.id};window.__defenceState=s;
   window.__policyTick=(count,flight=null)=>{window.nativeSimulation={...nativeSimulation,blocked:()=>false};nativeSimulationHost.checkpoint();try{for(let i=0;i<count;i++){nativeSimulationFrame.begin(__defenceState);const dt=nativeSimulation.advance(__defenceState,1/60);if(flight)nativeShipSystems.move(__defenceState,__defenceState,'player',flight,undefined,dt);nativeSolEconomy.advance(__defenceState,dt);nativeCivilianTraffic.advance(__defenceState,dt);nativeCombatShots.advance(__defenceState,dt);nativeShipEffects.advance(__defenceState,dt);nativeShipTraffic.collide(__defenceState,dt);nativeSimulationFrame.end(__defenceState);}}finally{window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}};
   window.__policyShoot=(sourceId,targetId)=>{
    const e=sourceId==='player'?s:nativeNpcLives.find(__defenceState,sourceId),source=sourceId==='player'?nativeShipDefinitions.describe(__defenceState):nativeShipDefinitions.describe(__defenceState,e,{category:'civilian'}),target=nativeShipSystems.resolve(__defenceState,targetId);
    window.nativeSimulation={...nativeSimulation,blocked:()=>false};nativeSimulationHost.checkpoint();
    try{const fired=nativeCombatShots.fireFor({state:__defenceState,shooter:source,target,selection:{slot:0},owner:'browser-faction-defence'});if(!fired.ok)throw Error(fired.error);return fired.event;}finally{window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}
   };
   window.__policyRestore=saved=>{if(!nativeSaveStorage.write(JSON.parse(saved)).ok)throw Error('Fixture save failed');resumeNativeGame('dev');window.__defenceState=nativeNpcDev.getState();};
   window.__defenceFixture=JSON.stringify(s);return {ids:__defenceIds,population:ships.length,crewIds:ids};
  }''')
  neutral_save=page.evaluate('__defenceFixture');(OUT/'neutral-save.json').write_text(neutral_save,encoding='utf8')
  # Keep the observer alive throughout both timing windows. Ordinary weapon
  # damage still resolves; this fixture measures sustained load, not difficulty.
  hostile_save=json.loads(neutral_save);hostile_save['localPrestige']['1']=-1;hostile_save['hull']=100000;hostile_save['shields']=100000
  (OUT/'hostile-save.json').write_text(json.dumps(hostile_save),encoding='utf8')
  friendly=page.evaluate('''()=>{
   const s=__defenceState,a=nativeNpcLives.find(s,__defenceIds.a),before=a.shields;window.__friendlyEvent=__policyShoot(__defenceIds.b,a.id);__policyTick(12);
   if(!__friendlyEvent.contact||!(a.shields<before))throw Error('Actual friendly beam did not connect');
   if(a.retaliationId||s.factionDefence||s.localPrestige[1]!==100)throw Error('Allied collateral started a feud or a player crime');
   return {realContact:true,shieldDamage:before-a.shields,noFeud:true};
  }''')
  player=page.evaluate('''()=>{
   __policyRestore(__defenceFixture);const s=__defenceState,a=nativeNpcLives.find(s,__defenceIds.a),far=nativeNpcLives.find(s,__defenceIds.far),from={x:far.x,y:far.y};
   window.__playerEvent=__policyShoot('player',a.id);__policyTick(150);
   const b=nativeNpcLives.find(s,__defenceIds.b),civilian=nativeNpcLives.find(s,__defenceIds.civilian);
   if(!__playerEvent.contact||s.localPrestige[1]!==95)throw Error('Player beam crime was not charged exactly once: '+s.localPrestige[1]);
   if(a.retaliationTargetId!=='player'||b.retaliationTargetId!=='player'||!far.factionResponse||civilian.retaliationId)throw Error('Shared faction alert/civilian separation failed');
   let pose=nativeNpcLives.pose(s,far);for(let i=0;i<10&&Math.hypot(pose.x-from.x,pose.y-from.y)<=1;i++){__policyTick(30);pose=nativeNpcLives.pose(s,far);}
   if(!(Math.hypot(pose.x-from.x,pose.y-from.y)>1)||nativeShipDetail.isDetailed(s,far))throw Error('Distant response is frozen or using tactical physics: '+JSON.stringify({from,pose,detailed:nativeShipDetail.isDetailed(s,far),navigation:!!far.navigationRequest,at:nativeSimulation.seconds(s),next:far.nextActionAt}));
   nativeCivilianTraffic.select(a.id);return {localPrestige:s.localPrestige[1],nearDefenders:[a.id,b.id],farResponse:far.id,farMoved:Math.hypot(pose.x-from.x,pose.y-from.y),civilianUninvolved:true,shots:s.weaponCombat.events.filter(e=>e.sourceId!=='player').length};
  }''')
  page.wait_for_timeout(150);page.screenshot(path=str(OUT/'system-alert.png'))
  continued=page.evaluate('''()=>{
   const s=__defenceState,credits=s.localPrestige[1],alert=JSON.stringify(s.factionDefence),id=__defenceIds.far;
   if(!nativeSaveStorage.write(s).ok)throw Error('Alert save failed');resumeNativeGame('dev');window.__defenceState=nativeNpcDev.getState();
   if(__defenceState.localPrestige[1]!==credits||JSON.stringify(__defenceState.factionDefence)!==alert||!nativeNpcLives.find(__defenceState,id).factionResponse)throw Error('Continue lost defence state');
   return true;
  }''')
  foreign=page.evaluate('''()=>{
   __policyRestore(__defenceFixture);const s=__defenceState,a=nativeNpcLives.find(s,__defenceIds.a),b=nativeNpcLives.find(s,__defenceIds.b);
   window.__foreignEvent=__policyShoot(__defenceIds.foreign,a.id);__policyTick(90);
   if(!__foreignEvent.contact||a.retaliationTargetId!==__defenceIds.foreign||b.retaliationTargetId!==__defenceIds.foreign||s.localPrestige[1]!==100)throw Error('Foreign collateral did not rally the defenders against the actual NPC attacker');
   return {attacker:__defenceIds.foreign,realContact:true,playerStandingUnaffected:true};
  }''')
  entry=page.evaluate('''()=>{
   __policyRestore(__defenceFixture);const s=__defenceState,row=nativeManualFlight.boundaries().find(row=>row.id===1);s.localPrestige[1]=-1;s.manualTargetSystem=2;
   let outside,inside;for(let i=0;i<64;i++){const angle=i*Math.PI/32,p=margin=>({x:row.x+Math.cos(angle)*(row.rx+margin),y:row.y+Math.sin(angle)*(row.ry+margin)});if(nativeManualFlight.regionAtPoint(s,p(2)).system==null){outside=p(2);inside=p(-2);break;}}
   if(!outside)throw Error('No empty boundary fixture');Object.assign(s,outside);nativeManualFlight.initializeRegion(s);__policyTick(1);
   if(s.civilianTraffic.ships.some(e=>e.factionResponse||e.retaliationId))throw Error('Defenders activated before system entry');
   Object.assign(s,inside);window.nativeSimulation={...nativeSimulation,blocked:()=>false};nativeSimulationHost.checkpoint();const crossing=nativeManualFlight.advanceRegion(s);window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();__policyTick(35);
   const defenders=s.civilianTraffic.ships.filter(e=>e.system===1&&nativeFactionDefence.isFaction(e)&&e.hull>0&&!e.journey&&!['disabled','destroyed','warp','arriving'].includes(e.phase));
   if(!crossing||nativeManualFlight.currentRegion(s).system!==1||!defenders.length||defenders.some(e=>nativeFactionDefence.target(s,e)?.id!=='player'))throw Error('Hostile entry did not alert all local defending crews');
   return {system:1,defenders: defenders.length,boundaryCrossing:true,navigationSelectionIgnored:s.manualTargetSystem===2,population:s.civilianTraffic.ships.length,crewIds:s.civilianTraffic.ships.map(e=>e.id)};
  }''')
  assert entry.pop('crewIds')==fixture.pop('crewIds')
  pursuit=page.evaluate('''()=>{
   __policyRestore(__defenceFixture);let s=__defenceState;const a=nativeNpcLives.find(s,__defenceIds.a),start=nativeShipDefinitions.describe(s),chunk=nativeShipDetail.region(s);
   s.hull=10000;s.angle=Math.PI;__policyShoot('player',a.id);__policyTick(30);
   const team=s.factionDefence.orders.map(order=>order.shipId).sort(),original=nativeCombatShots.onPlayerHit,hits=[],beganAt=nativeSimulation.seconds(s);
   a.hull=nativeShipDefinitions.forEntity(s,a).hull*.28;Object.assign(a.combatAI,{disengaging:true,escaped:true,escapeGoal:{x:30000,y:3500}});
   nativeCombatShots.onPlayerHit=(state,damage,impact)=>{const result=original(state,damage,impact);if(state===__defenceState&&team.includes(impact.sourceId))hits.push({at:nativeSimulation.seconds(state),source:impact.sourceId});return result;};
   const speed=Math.min(140,...team.map(id=>nativeShipDefinitions.forEntity(s,nativeNpcLives.find(s,id)).movement.maxSpeed*.55)),command={heading:Math.PI,speed,throttle:1,manualFlight:true};
   try{
    __policyTick(360,command);if(!nativeSaveStorage.write(__defenceState).ok)throw Error('Pursuit save failed');resumeNativeGame('dev');window.__defenceState=nativeNpcDev.getState();s=__defenceState;
    if(JSON.stringify(s.factionDefence.orders.map(order=>order.shipId).sort())!==JSON.stringify(team))throw Error('Continue changed the committed pursuit team');
    // Activation normalizes the small test hull. Keep this diagnostic observer
    // alive for the long chase; the separate real-hull scenario verifies death.
    s.hull=10000;
    __policyTick(360,command);
   }finally{nativeCombatShots.onPlayerHit=original;}
   const player=nativeShipDefinitions.describe(s),endChunk=nativeShipDetail.region(s),near=team.filter(id=>nativeShipDetail.isDetailed(s,nativeNpcLives.find(s,id))),fighters=team.map(id=>nativeNpcLives.find(s,id)),distance=Math.min(...fighters.map(ship=>{const pose=nativeNpcLives.pose(s,ship);return Math.hypot(pose.x-player.x,pose.y-player.y);}));
   if(JSON.stringify(s.factionDefence.orders.map(order=>order.shipId).sort())!==JSON.stringify(team)||s.factionDefence.orders.length>3)throw Error('Moving target lost its bounded committed pursuit team: '+JSON.stringify({team,defence:s.factionDefence,at:nativeSimulation.seconds(s),prestige:s.localPrestige[1],government:nativeFactionDefence.government(s,1),fighters:fighters.map(ship=>({id:ship.id,hull:ship.hull,maxHull:nativeShipDefinitions.forEntity(s,ship).hull,phase:ship.phase,system:ship.system,region:nativeFactionDefence.region(s,ship),government:ship.ownerGovernmentId,target:nativeFactionDefence.target(s,ship)?.id})),player:{x:player.x,y:player.y,hull:s.hull,landed:s.landed,phase:s.phase,region:nativeManualFlight.currentRegion(s)}}));
   if(fighters.some(ship=>ship.combatAI?.disengaging||ship.combatAI?.escaped))throw Error('Armed military pursuer resumed a civilian retreat');
   if(!(start.x-player.x>500)||chunk.chunkX===endChunk.chunkX||!near.length||distance>700||hits.length<4||!hits.some(hit=>hit.at-beganAt>8))throw Error('Military attack did not follow the moving player: '+JSON.stringify({start: start.x,end:player.x,distance,hits,chunk,endChunk,near}));
   return {team,playerTravel:start.x-player.x,chunkCrossed:true,continuedAfterReload:true,nearPursuers:near.length,closestDistance:distance,realWeaponContacts:hits.length,lastContactAfterSeconds:hits.at(-1).at-beganAt,population:s.civilianTraffic.ships.length};
  }''')
  offscreen=page.evaluate('''()=>{
   __policyRestore(__defenceFixture);let s=__defenceState;s.hull=100000;__policyShoot('player',__defenceIds.a);__policyTick(30);
   const team=s.factionDefence.orders.map(order=>order.shipId),began=nativeSimulation.seconds(s),waypoints=[{x:2500,y:3000},{x:2500,y:-3000},{x:27000,y:-3000},{x:27000,y:3000}];
   // Real damaged engines let the ordinary player ship open a physical gap.
   // Keep the saved crews, weapons and shared motion/route owners.
   for(const id of team){const ship=nativeNpcLives.find(s,id),eq=nativeShipEquipment.ensure(s,ship),engine=eq.instances[eq.slots.engineering[0]];engine.condition=40;nativeShipSystems.refreshShip(s,ship,'civilian');}
   let waypoint=0,sleepingSamples=0,longestSleep=0,currentSleep=0,restored=false;
   for(let sample=0;sample<300;sample++){
    const player=nativeShipDefinitions.describe(s),goal=waypoints[waypoint];
    if(Math.hypot(goal.x-player.x,goal.y-player.y)<500)waypoint=(waypoint+1)%waypoints.length;
    const next=waypoints[waypoint],flight={heading:Math.atan2(next.y-player.y,next.x-player.x),throttle:1,manualFlight:true};__policyTick(30,flight);
    if(nativeManualFlight.currentRegion(s).system!==1)throw Error('Off-screen pursuit fixture accidentally left Sol');
    const detailed=team.some(id=>nativeShipDetail.isDetailed(s,nativeNpcLives.find(s,id)));if(!detailed){sleepingSamples++;currentSleep+=.5;longestSleep=Math.max(longestSleep,currentSleep);}else currentSleep=0;
    if(s.factionDefence.orders.length>3)throw Error('Off-screen pursuit exceeded the bounded response');
    for(const id of team){const ship=nativeNpcLives.find(s,id),d=nativeShipDefinitions.forEntity(s,ship),canFight=ship.hull>d.hull*.25&&!['destroyed','disabled'].includes(ship.phase)&&nativeCivilianCombatAI.combatRange(s,ship).range>0;
     if(canFight&&!s.factionDefence.orders.some(order=>order.shipId===id&&order.targetId==='player')){const p=nativeShipDefinitions.describe(s);throw Error('An operational hunter dropped an inside-system target: '+JSON.stringify({at:nativeSimulation.seconds(s)-began,id,orders:s.factionDefence.orders,phase:ship.phase,pose:nativeNpcLives.pose(s,ship),player:{x:p.x,y:p.y,hull:s.hull},defence:s.factionDefence}));}
    }
    if(sample===259){if(!nativeSaveStorage.write(s).ok)throw Error('Off-screen pursuit checkpoint failed');resumeNativeGame('dev');window.__defenceState=nativeNpcDev.getState();s=__defenceState;s.hull=100000;restored=true;}
   }
   if(longestSleep<=120||nativeSimulation.seconds(s)-began<149)throw Error('Fixture did not exercise off-screen flight beyond the old incident timeout: '+JSON.stringify({longestSleep,sleepingSamples}));
   const insideOrders=s.factionDefence.orders.length,region=nativeManualFlight.currentRegion(s),row=nativeManualFlight.boundaries().find(row=>row.id===1),position=nativeManualFlight.position(s),angle=Math.atan2((position.y-row.y)/row.ry,(position.x-row.x)/row.rx),outside={x:row.x+Math.cos(angle)*(row.rx+2),y:row.y+Math.sin(angle)*(row.ry+2)};
   s.x+=outside.x-position.x;s.y+=outside.y-position.y;s.previousX=s.x;s.previousY=s.y;nativeShipSystems.refreshShip(s,s,'player');nativeManualFlight.initializeRegion(s);__policyTick(30);
   if(nativeManualFlight.currentRegion(s).system===1)throw Error('Exit fixture did not cross the physical boundary');
   if(s.factionDefence.orders.length)throw Error('Coordinated pursuit survived actual escape from the system');
   return {elapsedSeconds:nativeSimulation.seconds(s)-began-.5,insideSystem:region.system,offscreenSeconds:sleepingSamples*.5,longestOffscreenSeconds:longestSleep,continuedAfterReload:restored,insideOrders,endedAtBoundary:true,population:s.civilianTraffic.ships.length};
  }''')
  lethal=page.evaluate('''()=>{
   __policyRestore(__defenceFixture);const s=__defenceState,a=nativeNpcLives.find(s,__defenceIds.a);nativeWeaponLoadout.refit(s,[1],{holder:a});
   Object.assign(s,{hull:9,shields:0,phase:'disabled'});s.localPrestige[1]=-1;
   const original=nativeCombatShots.onPlayerHit,assets=vexedFlightAssets.loadShip,hud=vexedHud.update,hits=[];let artworkRequests=0,hudRefreshes=0;
   vexedFlightAssets.loadShip=(...args)=>{artworkRequests++;return assets(...args);};vexedHud.update=(...args)=>{hudRefreshes++;return hud(...args);};
   nativeCombatShots.onPlayerHit=(state,damage,impact)=>{const before=state.hull,result=original(state,damage,impact);if(state===s)hits.push({before,after:state.hull,source:impact.sourceId,phase:state.phase});return result;};
   try{for(let i=0;i<20&&s.hull>0;i++)__policyTick(30);}finally{nativeCombatShots.onPlayerHit=original;vexedFlightAssets.loadShip=assets;vexedHud.update=hud;}
   if(s.hull!==0||s.phase!=='destroyed'||!hits.some(hit=>hit.before>0&&hit.after===0)||!hits.some(hit=>hit.after>0&&hit.phase==='disabled'))throw Error('Faction fire failed to destroy a critical player: '+JSON.stringify(hits));
   if(nativeShipSystems.resolve(s,'player'))throw Error('Destroyed hull remained an active target');
   if(hudRefreshes||artworkRequests>1)throw Error('Sustained contacts rebuilt the player HUD/artwork: '+JSON.stringify({hudRefreshes,artworkRequests}));
   return {hull:s.hull,phase:s.phase,realContacts:hits.length,criticalHit:hits.some(hit=>hit.after>0&&hit.phase==='disabled'),hudRefreshes,artworkRequests};
  }''')
  # A dense attack uses only existing saved military crews and their normal
  # equipment. The high-health observer measures sustained combat load.
  dense=page.evaluate('''()=>{
   __policyRestore(__defenceFixture);const s=__defenceState,guards=s.civilianTraffic.ships.filter(e=>e.system===1&&nativeFactionDefence.isFaction(e)&&!e.journey&&e.hull>0&&!['warp','arriving','disabled','destroyed'].includes(e.phase));
   for(let i=0;i<guards.length;i++){
    const ship=guards[i],angle=i*Math.PI*2/guards.length;nativeNpcLives.suspendCombat(s,ship,'Performance fixture: existing local defence crews');
    Object.assign(ship,{x:12000+Math.cos(angle)*450,y:3500+Math.sin(angle)*450,heading:angle+Math.PI,phase:'holding',nextActionAt:100000});nativeShipMotion.stop(ship);nativeNpcLives.observeMotion(s,ship);
   }
   s.hull=s.shields=100000;nativeShipSystems.invalidate(s);nativeNpcLives.invalidateMembership(s);window.__denseAttack=__policyShoot('player',guards[0].id);__policyTick(15);
   if(!__denseAttack.contact||!s.factionDefence)throw Error('Dense measurement must begin with a real player attack');
   return {save:JSON.stringify(s),guards:guards.length,responders:guards.filter(ship=>ship.retaliationId||ship.factionResponse).length};
  }''')
  (OUT/'dense-attack-save.json').write_text(dense.pop('save'),encoding='utf8')
  assert dense['guards']>3 and dense['responders']<=3,dense
  assert not errors,errors
  report={'passed':True,'fixture':fixture,'friendly':friendly,'playerAttack':player,'continue':continued,'foreignAttack':foreign,'hostileEntry':entry,'pursuit':pursuit,'offscreenPursuit':offscreen,'lethal':lethal,'denseAttack':dense,'errors':errors}
  (OUT/'browser.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True);browser.close()
finally:server.shutdown();server.server_close()
