/* Persistent civilian traffic shared by Sol and nearby star systems. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld, economy=window.nativeSolEconomy,combat=window.nativeCivilianCombatAI;
  const types=[18,23,47,52], homes={18:14,23:47,47:1,52:6};
  const destinations=[2,4,6,14,47];
  const solPorts=[3,4,5,2,1,7,8,9,10];
  const systems=world.systems,neighborCache=new Map();
  const assets=new Map(), effects=new Map(), shots=[], bursts=[], fragments=[], wrecks=[];
  const miningVisuals=new Map();
  const disputeVisuals=new Map();
  let selected=null,selectedAt=0;
  const stats=id=>world.ships.find(ship=>ship.id===id);
  const systemName=id=>world.systems.find(system=>system.id===id)?.name||`System ${id}`;
  const neighbors=id=>{
    if(!neighborCache.has(id)){const origin=systems.find(system=>system.id===id),position=origin?.mapPosition||{x:0,y:0},distance=system=>{const point=system.mapPosition||{x:0,y:0};return Math.hypot(point.x-position.x,point.y-position.y)};neighborCache.set(id,systems.filter(system=>system.id!==id&&(Number(system.populationBillions)>0||system.asteroids)).sort((a,b)=>distance(a)-distance(b)).slice(0,6).map(system=>system.id));}
    return neighborCache.get(id);
  };
  const density=system=>system.id===1?18:Number(system.populationBillions)>=8?4:Number(system.populationBillions)>=2?3:Number(system.populationBillions)>0||system.asteroids?2:1;
  const trafficType=(system,slot)=>{
    const owned={1:47,4:23,7:18,12:52}[Number(system.governmentId)];
    return slot===0&&owned?owned:types[(system.id+slot*3)%types.length];
  };
  const place=(system,port,id)=>{
    if(system===1){const body=window.nativeSystemHub?.sol?.find(entry=>entry.id===port);return {x:(body?.x||0)+180+(id%4)*85,y:(body?.y||0)-130+(id%3)*85};}
    return {x:-130+(id%4)*95,y:80+(id%3)*80};
  };
  const stage=ship=>{const fraction=ship.hull/Math.max(1,stats(ship.shipType).hull);return fraction<.25?3:fraction<.5?2:fraction<.75?1:0};
  const displayHeights={23:22.5,47:72,52:90};
  const dimensions=ship=>{
    const profile=window.starterShips?.get(ship.shipType),ratio=Number(profile?.displayRatio)||Number(profile?.width)/Number(profile?.height)||1;
    const shuttleHeight=window.vexedFlightAssets.flightDimensions(window.vexedFlightAssets.size(7),1).height;
    const height=ship.shipType===18?shuttleHeight:displayHeights[ship.shipType]||75;
    return {width:height*ratio,height};
  };
  function art(ship){
    const key=`${ship.shipType}:${stage(ship)}`;
    if(!assets.has(key)){assets.set(key,null);window.vexedFlightAssets.loadShip(ship.shipType,ship.hull,{showcase:true}).then(value=>assets.set(key,value)).catch(()=>assets.delete(key));}
    return assets.get(key);
  }
  function prepareEffects(type){
    if(effects.has(type))return;
    effects.set(type,null);
    const hull=stats(type).hull;
    Promise.all([hull,hull*.7,hull*.4,hull*.1].map(value=>window.vexedFlightAssets.loadShip(type,value,{showcase:true}))).then(frames=>{
      frames.forEach((asset,index)=>assets.set(`${type}:${index}`,asset));
      const profile=frames[0].profile;
      if(!profile?.breakAnchors||!profile?.destruction)return;
      const art=frames.map(asset=>asset.art),destruction=window.createShipDestruction();
      effects.set(type,{fragments:window.showcaseStageFragments.prepare(art,profile.breakAnchors),destruction});
      destruction.prepare(art,profile.destruction);
    }).catch(error=>{effects.set(type,null);console.warn('Civilian damage art unavailable',type,error);});
  }
  function note(state,message){const traffic=initialize(state);traffic.log.unshift(message);traffic.log.length=Math.min(traffic.log.length,18);}
  function hail(state,ship,text){
    if(!ship)return;
    const traffic=state.civilianTraffic;traffic.hails||=[];
    traffic.hails.unshift({clock:traffic.clock,system:ship.system,speaker:ship.id,text});traffic.hails.length=Math.min(traffic.hails.length,12);
    note(state,`${ship.name}: ${text}`);
    window.nativeCivilianTraffic?.onHail?.({system:ship.system,x:ship.x,y:ship.y,text});
  }
  function queueHail(state,dispute,ship,text){
    if(!dispute)return;
    dispute.hails||=[];dispute.hails.push({speaker:ship.id,text,dueAt:state.civilianTraffic.clock+.3});
  }
  function create(id,type,system,port){const hull=stats(type),position=place(system,port,id);return {
    id,name:`${hull.name} ${String(id+1).padStart(2,'0')}`,shipType:type,ownerGovernmentId:Number(world.systems.find(entry=>entry.id===homes[type])?.governmentId)||1,
    homeSystem:homes[type],stationSystem:system,system,port,x:position.x,y:position.y,heading:-Math.PI/2,phase:'docked',timer:4+(id*7)%15,
    hull:hull.hull,shields:hull.shields,cargo:null,oreHold:0,credits:100+id*25,legs:0,deliveries:0,mined:0,deals:0
  };}
  function initialize(state){
    if(!state.civilianTraffic||!Array.isArray(state.civilianTraffic.ships)){
      state.civilianTraffic={version:1,clock:0,ships:[
        create(0,18,1,3),create(1,23,1,3),create(2,47,1,4),create(3,52,1,5),
        create(4,18,14,0),create(5,23,47,0),create(6,47,6,0),create(7,52,14,0)
      ],log:[]};
    }
    const traffic=state.civilianTraffic;
    traffic.disputes||=[];traffic.nextDisputeId||=1;traffic.nextShotId||=1;
    if(traffic.version<2){
      for(const ship of traffic.ships)ship.stationSystem=ship.stationSystem||ship.system;
      let id=Math.max(...traffic.ships.map(ship=>ship.id))+1;
      for(const system of systems){
        const target=density(system),present=traffic.ships.filter(ship=>ship.system===system.id).length;
        for(let slot=present;slot<target;slot++){
          const port=system.id===1?solPorts[(slot+1)%solPorts.length]:0;
          const ship=create(id++,trafficType(system,slot),system.id,port);
          if(system.id!==1&&slot>0){const angle=(ship.id*.61803398875%1)*Math.PI*2,radius=420+(slot%3)*380;ship.x=-220+Math.cos(angle)*radius;ship.y=75+Math.sin(angle)*radius;ship.goalX=-180+(slot%2)*90;ship.goalY=60+(slot%3)*60;ship.phase='cruise';}
          else if(system.id!==1&&Number(system.populationBillions)<=0){ship.x+=850;ship.timer=16;}
          traffic.ships.push(ship);
        }
      }
      traffic.version=2;
    }
    for(const type of types)prepareEffects(type);
    return traffic;
  }
  function load(state,ship){
    if(ship.cargo)return;
    const good=(ship.id+ship.legs*3)%economy.goods.length,capacity=stats(ship.shipType).cargo;
    let destination=ship.system===1?solPorts[(ship.id+ship.legs+2)%solPorts.length]:1;
    if(ship.system===1&&destination===ship.port)destination=solPorts[(ship.id+ship.legs+3)%solPorts.length];
    let tons=Math.min(capacity-(ship.oreHold||0),12+((ship.id*13+ship.legs*11)%35));
    if(ship.system===1&&state.solEconomy?.ports?.[ship.port]){
      const stock=state.solEconomy.ports[ship.port];tons=Math.min(tons,Math.max(0,Number(stock[good])||0));stock[good]-=tons;
    }
    if(tons>0){const nearby=neighbors(ship.system),interstellar=ship.system!==ship.stationSystem?ship.stationSystem:ship.system===1?destinations[(ship.id+ship.legs)%destinations.length]:nearby[(ship.id+ship.legs)%nearby.length],toSystem=ship.system===1&&ship.stationSystem===1&&ship.legs%3!==2?1:interstellar;
      ship.cargo={good,tons,fromSystem:ship.system,fromPort:ship.port,toSystem,toPort:toSystem===1?ship.system===1?destination:3:0};
      note(state,`${ship.name} loaded ${tons} t of ${economy.goods[good]} at ${ship.system===1?economy.names[ship.port]:systemName(ship.system)}.`);
    }
  }
  function unload(state,ship){
    if(ship.system===1&&ship.port===1&&ship.oreHold>0){state.solEconomy.ports[1][0]=Math.min(9999,state.solEconomy.ports[1][0]+ship.oreHold);ship.credits+=ship.oreHold*12;note(state,`${ship.name} sold ${ship.oreHold} t of mined ore at Mercury.`);ship.oreHold=0;}
    const cargo=ship.cargo;if(!cargo||cargo.toSystem!==ship.system||(ship.system===1&&cargo.toPort!==ship.port))return;
    if(ship.system===1&&state.solEconomy?.ports?.[ship.port])state.solEconomy.ports[ship.port][cargo.good]=Math.min(9999,(Number(state.solEconomy.ports[ship.port][cargo.good])||0)+cargo.tons);
    ship.credits+=cargo.tons*(12+cargo.good*5);ship.deliveries++;
    note(state,`${ship.name} delivered ${cargo.tons} t of ${economy.goods[cargo.good]} to ${ship.system===1?economy.names[ship.port]:systemName(ship.system)}.`);
    ship.cargo=null;
  }
  function cruise(state,ship,port){const target=place(1,port,ship.id);ship.port=port;ship.goalX=target.x;ship.goalY=target.y;ship.phase='cruise';note(state,`${ship.name} departed for ${economy.names[port]}.`);}
  function localPatrol(ship){const near=Math.hypot(ship.x+220,ship.y-75)<350,angle=((ship.id*.754877666+ship.legs*.34)%1)*Math.PI*2;ship.goalX=near?-220+Math.cos(angle)*850:-150+(ship.id%3)*45;ship.goalY=near?75+Math.sin(angle)*850:55+(ship.id%2)*60;ship.phase='cruise';}
  function warpSound(state,ship,kind){
    if(ship.system!==state.system||state.landed||window.vexedWarp?.active)return;
    const player=playerPosition(state);
    window.vexedWarp?.playNearby?.(kind,Math.hypot(ship.x-player.x,ship.y-player.y));
  }
  function warp(state,ship,destination){
    ship.destinationSystem=destination;ship.phase='warp';ship.speed=0;
    ship.timer=9+(ship.id%4)*3;ship.warpDuration=ship.timer;
    ship.warpVisual={kind:'departure',elapsedMs:0,angle:ship.heading+Math.PI/2};
    warpSound(state,ship,'departure');
    note(state,`${ship.name} departed ${systemName(ship.system)} for ${systemName(destination)}.`);
  }
  const rockById=id=>window.nativeSolAsteroids?.placements.find(rock=>rock.slotId===id);
  const rockGone=(state,rock)=>!rock||state.minedAsteroids?.includes(rock.slotId)||state.destroyedAsteroids?.includes(rock.slotId);
  const freeHold=ship=>Math.max(0,stats(ship.shipType).cargo-(ship.cargo?.tons||0)-(ship.oreHold||0));
  const disabledHull=ship=>Math.max(1,stats(ship.shipType).hull*.25);
  const operational=ship=>ship&&!['disabled','destroyed','warp','arriving'].includes(ship.phase)&&ship.hull>disabledHull(ship);
  const availableForDispute=(traffic,ship)=>operational(ship)&&!ship.disputeId&&(ship.disputeCooldownUntil||0)<=traffic.clock;
  const isMiningRock=(state,id)=>initialize(state).ships.some(ship=>ship.system===1&&ship.miningRockSlot===id&&['mining-flight','mining','collecting'].includes(ship.phase));
  function availableRock(state,region){
    return (window.nativeSolAsteroids?.placements||[]).find(rock=>rock.region===region&&!rockGone(state,rock)&&!isMiningRock(state,rock.slotId)&&rock.slotId!==window.nativeAsteroidCombat?.miningId)||null;
  }
  function miningFlight(state,ship,rock){
    ship.miningRockSlot=rock.slotId;ship.goalX=rock.x+110+(ship.id%3)*15;ship.goalY=rock.y+40+(ship.id%2)*20;
    ship.phase='mining-flight';note(state,`${ship.name} is approaching ${rock.name} in the ${rock.region}.`);
  }
  function beginMining(state,ship,rock,{theft=true}={}){
    ship.miningRockSlot=rock.slotId;ship.miningStartedAt=state.civilianTraffic.clock;ship.miningSourceX=ship.x;ship.miningSourceY=ship.y;
    ship.speed=0;ship.heading=Math.atan2(rock.y-ship.y,rock.x-ship.x);ship.phase='mining';ship.timer=7.15;
    miningVisuals.delete(ship.id);note(state,`${ship.name} engaged its mining laser on ${rock.name}.`);
    if(theft)planOreTheft(state,ship,rock);
  }
  function finishMining(state,ship){
    const rock=rockById(ship.miningRockSlot);
    if(rock&&!rockGone(state,rock)){
      state.minedAsteroids=[...(state.minedAsteroids||[]),rock.slotId];
      state.asteroidOreDrops||={};state.asteroidOreDrops[rock.slotId]=15;
      ship.phase='collecting';ship.timer=4.5;
      note(state,`${ship.name} cut ${rock.name}; its ore is waiting for transport.`);
    }else{ship.phase='docked';ship.timer=1;ship.miningRockSlot=null;miningVisuals.delete(ship.id);}
  }
  function collectMinedOre(state,ship){
    const rock=rockById(ship.miningRockSlot),tons=claimOre(state,ship,rock);
    if(tons>0){ship.mined+=tons;note(state,`${ship.name} transported ${tons} t of ${rock.oreLabel} aboard from ${rock.region}.`);}
    ship.port=rock?.demo?3:6;ship.phase='docked';ship.timer=1;ship.miningRockSlot=null;miningVisuals.delete(ship.id);
  }
  function claimOre(state,ship,rock){
    if(!rock)return 0;
    const mask=state.asteroidOreDrops?.[rock.slotId]||0,indices=[0,1,2,3].filter(index=>mask&(1<<index)).slice(0,Math.floor(freeHold(ship)));
    if(!indices.length)return 0;
    for(const index of indices)state.asteroidOreDrops[rock.slotId]&=~(1<<index);
    ship.oreHold=(ship.oreHold||0)+indices.length;
    if(ship.system===state.system)window.nativeAsteroidCombat?.collectField(rock,indices);
    return indices.length;
  }
  function planOreTheft(state,miner,rock,{force=false,thief=null}={}){
    const traffic=initialize(state);
    if(!availableForDispute(traffic,miner)||traffic.disputes.some(dispute=>dispute.system===miner.system))return false;
    const candidates=traffic.ships.filter(other=>other.id!==miner.id&&other.system===miner.system&&['docked','cruise','encounter'].includes(other.phase)&&availableForDispute(traffic,other)&&freeHold(other)>0&&(force||other.id%5===1||other.id%5===4)&&Math.hypot(other.x-rock.x,other.y-rock.y)<750).sort((a,b)=>Math.hypot(a.x-rock.x,a.y-rock.y)-Math.hypot(b.x-rock.x,b.y-rock.y));
    const picked=thief?candidates.find(other=>other.id===thief.id):candidates[0];
    if(!picked||!force&&Math.random()>=.35)return false;
    picked.theftRoute={phase:picked.phase,goalX:picked.goalX,goalY:picked.goalY,timer:picked.timer};
    picked.theftTargetId=miner.id;picked.theftRockSlot=rock.slotId;picked.phase='ore-theft';
    note(state,`${picked.name} changed course toward ${miner.name}'s mining claim.`);return true;
  }
  function cancelOreTheft(ship){
    const route=ship.theftRoute||{phase:'docked',timer:3};Object.assign(ship,route);
    delete ship.theftRoute;delete ship.theftTargetId;delete ship.theftRockSlot;
  }
  function advanceOreTheft(state,ship,dt){
    const traffic=state.civilianTraffic,miner=traffic.ships.find(other=>other.id===ship.theftTargetId),rock=rockById(ship.theftRockSlot);
    if(!rock||!operational(miner)||miner.system!==ship.system||!['mining','collecting'].includes(miner.phase)||!availableForDispute(traffic,ship)||traffic.disputes.some(dispute=>dispute.system===ship.system)||freeHold(ship)<1){cancelOreTheft(ship);return;}
    const dx=rock.x-ship.x,dy=rock.y-ship.y,distance=Math.hypot(dx,dy),speed=Math.max(36,Number(stats(ship.shipType).speedOrOtherStationValue||40)*3);
    ship.heading=Math.atan2(dy,dx);ship.speed=Math.min(speed,(ship.speed||0)+speed*.75*dt);
    const step=Math.min(Math.max(0,distance-85),ship.speed*dt);if(distance>0){ship.x+=dx/distance*step;ship.y+=dy/distance*step;}
    if(distance-step>90)return;
    ship.speed=0;
    if(miner.phase!=='collecting')return;
    const tons=claimOre(state,ship,rock);cancelOreTheft(ship);
    if(!tons)return;
    ship.stolenOre=(ship.stolenOre||0)+tons;
    note(state,`${ship.name} stole ${tons} t of ${rock.oreLabel} from ${miner.name}'s mining claim.`);
    startDispute(state,miner,ship,`theft of ${tons} t of mined ${rock.oreLabel}`);
  }
  function startDispute(state,a,b,reason){
    const traffic=initialize(state);
    if(a.system!==b.system||!availableForDispute(traffic,a)||!availableForDispute(traffic,b)||traffic.disputes.some(dispute=>dispute.system===a.system))return false;
    const player=playerPosition(state),midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const preview=state.devMode&&a.system===state.system&&a.system===1&&Number(state.localBody??3)===3&&Math.hypot(midpoint.x-player.x,midpoint.y-player.y)<500;
    const dispute={id:traffic.nextDisputeId++,combatVersion:2,system:a.system,a:a.id,b:b.id,reason,startedAt:traffic.clock,nextA:traffic.clock+1.5,nextB:traffic.clock+2,
      anchor:preview?{...player}:midpoint,bounds:preview?{x:265,y:155}:{x:440,y:330},pending:[],volleys:0,hits:0,misses:0,blocked:0,hails:[],nextHailAt:traffic.clock+3};
    traffic.disputes.push(dispute);
    for(const ship of [a,b]){combat.begin(ship,ship===a?'claimant':'thief',traffic.clock);ship.disputeId=dispute.id;ship.phase='fighting';ship.miningRockSlot=null;miningVisuals.delete(ship.id);}
    hail(state,a,reason.startsWith('theft')?'Return the ore you stole!':'Pay for that delivery!');
    queueHail(state,dispute,b,'Keep your distance. This cargo is mine.');
    note(state,`${a.name} and ${b.name} opened a dispute over ${reason}. Weapons are targeting engines.`);return true;
  }
  function endDispute(state,dispute,a,b){
    const traffic=state.civilianTraffic;
    for(const ship of [a,b].filter(Boolean)){
      if(ship.disputeId===dispute.id){delete ship.disputeId;ship.disputeCooldownUntil=traffic.clock+180;ship.speed=0;if(ship.phase==='fighting'){ship.phase='docked';ship.timer=8;}}
    }
    for(const event of dispute.pending||[])disputeVisuals.delete(event.id);
    dispute.pending=[];
    for(let i=shots.length-1;i>=0;i--)if(shots[i].disputeId===dispute.id)shots.splice(i,1);
    const loser=[a,b].find(ship=>ship?.phase==='disabled');
    traffic.combatReports||=[];
    traffic.combatReports.unshift({reason:dispute.reason,duration:traffic.clock-dispute.startedAt,shots:dispute.volleys,hits:dispute.hits||0,misses:dispute.misses||0,blocked:dispute.blocked||0,disabled:loser?.id??null});
    traffic.combatReports.length=Math.min(traffic.combatReports.length,8);
    hail(state,loser||a||b,loser?'Engines disabled. Cease fire.':'Breaking contact.');
    note(state,loser?`Weapons cease: ${loser.name} is disabled. The dispute over ${dispute.reason} has ended.`:`The dispute over ${dispute.reason} ended; the ships broke contact.`);
    traffic.disputes=traffic.disputes.filter(entry=>entry.id!==dispute.id);
  }
  function disputeWeapons(ship){
    const fitted=(stats(ship.shipType).defaultWeapons||[]).map(id=>window.VexedMirrorWeapons?.find(weapon=>weapon.id===id)).filter(weapon=>weapon?.damage>0);
    // Civilian hulls without a default armament carry one light defensive weapon.
    return fitted.length?fitted:[window.VexedMirrorWeapons?.find(weapon=>weapon.id===(ship.shipType===47?1:10))||{name:'Defensive phaser',damage:1,recharge:3}];
  }
  function showDisputeShot(state,dispute,event,shooter,victim){
    if(dispute.system!==state.system||disputeVisuals.has(event.id))return;
    const visual=window.nativeCombatShots.weaponVisual(window.VexedMirrorWeapons?.find(weapon=>weapon.id===event.weaponId)||{name:event.kind});
    if(!visual.style)return;
    const shot=window.nativeCombatShots.create({state:{angle:shooter.heading},ship:shooter,shooter,shipHeight:dimensions(shooter).height,target:victim,...visual});
    shot.kind=event.kind;shot.disputeId=dispute.id;shot.system=dispute.system;
    if(event.projectile)shot.projectile=event;
    else shot.targetPoint=from=>window.nativeCombatShots.worldPoint(victim,shot.lockedImpactLocal||window.nativeCombatShots.contact(victim,from,dimensions(victim),victim.shields>0).local);
    shots.push(shot);disputeVisuals.set(event.id,shot);
  }
  function fireDisputeShot(state,dispute,shooter,victim,scene){
    const traffic=state.civilianTraffic,ai=shooter.combatAI;ai.weaponReadyAt||={};
    const options=[];
    for(const weapon of disputeWeapons(shooter)){
      if((ai.weaponReadyAt[weapon.id||weapon.name]||0)>traffic.clock)continue;
      const visual=window.nativeCombatShots.weaponVisual(weapon);if(!visual.style)continue;
      const spec=combat.weaponSpec(weapon,visual.kind,shooter),aim=visual.kind==='beam'?victim:combat.intercept(shooter,victim,spec.speed);
      if(!combat.canFire(shooter,victim,spec,aim,scene.rocks,scene.bystanders)){
        if(combat.obstacleHit(shooter,aim,scene.rocks))ai.lineBlockedUntil=traffic.clock+.7;
        continue;
      }
      const score=weapon.damage+(visual.kind==='beam'&&victim.shields>0?4:0)+(visual.kind==='torpedo'&&victim.shields<=0?3:0);
      options.push({weapon,visual,spec,score});
    }
    if(!options.length)return .1;
    const {weapon,visual,spec}=options.sort((a,b)=>b.score-a.score)[0];
    const id=traffic.nextShotId++,event={id,sourceId:shooter.id,targetId:victim.id,weaponId:weapon.id,damage:weapon.damage,kind:visual.kind};
    if(visual.kind==='beam')event.dueAt=traffic.clock+.07;
    else Object.assign(event,combat.launch(shooter,victim,{...spec,muzzle:dimensions(shooter).height*.36},visual.kind,traffic.clock,id));
    dispute.pending.push(event);dispute.volleys++;ai.shots++;ai.weaponReadyAt[weapon.id||weapon.name]=traffic.clock+spec.recharge;
    showDisputeShot(state,dispute,event,shooter,victim);
    return .1;
  }
  function combatScene(state,dispute){
    const rocks=dispute.system===1?(window.nativeSolAsteroids?.placements||[]).filter(rock=>!rockGone(state,rock)):[];
    const bystanders=state.civilianTraffic.ships.filter(ship=>ship.system===dispute.system&&!['warp','destroyed'].includes(ship.phase)).map(ship=>({id:ship.id,x:ship.x,y:ship.y,radius:Math.max(8,Math.max(dimensions(ship).width,dimensions(ship).height)*.35)}));
    if(dispute.system===1)for(const tug of state.solEconomy?.freighters||[])if(!['warp','destroyed'].includes(tug.phase))bystanders.push({id:`tug:${tug.id}`,x:tug.x,y:tug.y,radius:25});
    const bodies=dispute.system===1?(window.nativeSystemHub?.sol||[]).filter(body=>body.id!==6).map(body=>({x:body.x-220,y:body.y+75,radius:(window.vexedSolFlight?.bodySize(body)||100)*.44})):[];
    return {rocks,bystanders,bodies};
  }
  function resolveDisputeShot(state,dispute,event,source,victim,scene,dt){
    if(!operational(source)||!operational(victim))return true;
    showDisputeShot(state,dispute,event,source,victim);
    let result;
    if(event.projectile){
      const d=dimensions(victim),radii=victim.shields>0?window.showcaseShieldRadii(d.width,d.height):{rx:Math.max(8,d.width*.34),ry:Math.max(12,d.height*.44)};
      const blockers=[...scene.rocks,...scene.bystanders.filter(ship=>ship.id!==source.id&&ship.id!==victim.id).map(ship=>({...ship,size:ship.radius/.43}))];
      result=combat.stepProjectile(event,victim,dt,blockers,radii,d);
    }else if(event.dueAt<=state.civilianTraffic.clock){
      const muzzle=dimensions(source).height*.36,from={x:source.x+Math.cos(source.heading)*muzzle,y:source.y+Math.sin(source.heading)*muzzle};
      const obstacle=combat.obstacleHit(from,victim,scene.rocks);
      result=obstacle?{kind:'blocked',point:{x:from.x+(victim.x-from.x)*obstacle.t,y:from.y+(victim.y-from.y)*obstacle.t}}:{kind:'hit',point:from};
    }
    if(!result)return false;
    if(result.kind==='hit'){
      const from=result.point,contact=window.nativeCombatShots.contact(victim,from,dimensions(victim),victim.shields>0),shot=disputeVisuals.get(event.id);
      if(shot)shot.lockedImpactLocal=contact.local;
      hit(state,victim.id,event.damage,{from,contact,kind:event.kind,nonlethal:true});dispute.hits++;
    }else if(result.kind==='blocked'){
      dispute.blocked++;const shot=disputeVisuals.get(event.id);if(shot&&!event.projectile&&result.point)shot.targetPoint=()=>result.point;
      if(result.point&&dispute.system===state.system)window.showcaseHullBurst?.burst(bursts,result.point,performance.now(),.65,1,.35,true);
    }else dispute.misses++;
    event.alive=false;
    if(event.projectile){const visual=disputeVisuals.get(event.id),index=shots.indexOf(visual);if(index>=0)shots.splice(index,1);}
    disputeVisuals.delete(event.id);return true;
  }
  function advanceDisputes(state,dt){
    const traffic=state.civilianTraffic;
    for(const dispute of [...traffic.disputes]){
      const a=traffic.ships.find(ship=>ship.id===dispute.a),b=traffic.ships.find(ship=>ship.id===dispute.b);
      if(!operational(a)||!operational(b)||a.system!==b.system||a.system!==dispute.system||a.disputeId!==dispute.id||b.disputeId!==dispute.id){endDispute(state,dispute,a,b);continue;}
      if(dispute.combatVersion!==2){
        dispute.combatVersion=2;dispute.anchor={x:(a.x+b.x)/2,y:(a.y+b.y)/2};dispute.pending=[];
        dispute.hits=0;dispute.misses=0;dispute.blocked=0;dispute.hails=[];
        combat.begin(a,'claimant',traffic.clock);combat.begin(b,'thief',traffic.clock);
      }
      const scene=combatScene(state,dispute);
      for(const [ship,opponent] of [[a,b],[b,a]]){
        ship.cruiseSpeed=Math.max(36,Number(stats(ship.shipType).speedOrOtherStationValue||40)*3);ship.maxCombatHull=stats(ship.shipType).hull;
        ship.combatRadius=Math.max(7,Math.max(dimensions(ship).width,dimensions(ship).height)*.35);
        if(!ship.combatAI)combat.begin(ship,ship===a?'claimant':'thief',traffic.clock);
        if(!Number.isFinite(ship.vx)){ship.vx=0;ship.vy=0;}
        opponent.vx=Number(opponent.vx)||0;opponent.vy=Number(opponent.vy)||0;
        combat.steer(ship,opponent,dispute,{...scene,dt,clock:traffic.clock,hull:stats(ship.shipType).hull,shields:stats(ship.shipType).shields});
      }
      if(dispute.hails?.length&&traffic.clock>=(dispute.nextHailAt||0)){
        const entry=dispute.hails.find(message=>message.dueAt<=traffic.clock);
        if(entry){hail(state,entry.speaker===a.id?a:b,entry.text);dispute.hails.splice(dispute.hails.indexOf(entry),1);dispute.nextHailAt=traffic.clock+3;}
      }
      for(const event of [...dispute.pending]){
        const source=event.sourceId===a.id?a:b,victim=event.targetId===a.id?a:b;
        if(resolveDisputeShot(state,dispute,event,source,victim,scene,dt))dispute.pending=dispute.pending.filter(entry=>entry.id!==event.id);
      }
      if(!operational(a)||!operational(b)){endDispute(state,dispute,a,b);continue;}
      if(traffic.clock>=dispute.nextA)dispute.nextA=traffic.clock+fireDisputeShot(state,dispute,a,b,scene);
      if(traffic.clock>=dispute.nextB)dispute.nextB=traffic.clock+fireDisputeShot(state,dispute,b,a,scene);
    }
  }
  function startMiningDemo(state,{force=false,theft=true}={}){
    if(!state.devMode||state.system!==1)return false;
    const traffic=initialize(state),rock=window.nativeSolAsteroids?.placements.find(entry=>entry.demo);
    if(!rock||traffic.devMiningDemoStarted&&!force)return false;
    if(force){state.minedAsteroids=(state.minedAsteroids||[]).filter(id=>id!==rock.slotId);state.destroyedAsteroids=(state.destroyedAsteroids||[]).filter(id=>id!==rock.slotId);if(state.asteroidOreDrops)delete state.asteroidOreDrops[rock.slotId];}
    if(rockGone(state,rock))return false;
    const ship=traffic.ships.find(entry=>entry.id===0&&entry.phase!=='destroyed')||traffic.ships.find(entry=>entry.phase!=='destroyed');
    if(!ship)return false;
    Object.assign(ship,{system:1,stationSystem:1,port:3,x:rock.x-130,y:rock.y+30,cargo:null,oreHold:0,destinationSystem:null});
    beginMining(state,ship,rock,{theft});traffic.devMiningDemoStarted=true;return true;
  }
  function startOreDisputeDemo(state){
    if(!state.devMode||state.system!==1)return false;
    const traffic=initialize(state),rock=window.nativeSolAsteroids?.placements.find(entry=>entry.demo);
    const miner=traffic.ships.find(ship=>ship.id===0),thief=traffic.ships.find(ship=>ship.id===1);
    if(!rock||!miner||!thief)return false;
    for(const dispute of [...traffic.disputes].filter(entry=>entry.system===1))endDispute(state,dispute,traffic.ships.find(ship=>ship.id===dispute.a),traffic.ships.find(ship=>ship.id===dispute.b));
    for(const ship of [miner,thief]){if(ship.phase==='ore-theft')cancelOreTheft(ship);ship.hull=stats(ship.shipType).hull;ship.shields=stats(ship.shipType).shields;ship.disputeCooldownUntil=0;ship.phase='docked';ship.cargo=null;ship.oreHold=0;}
    if(!startMiningDemo(state,{force:true,theft:false}))return false;
    Object.assign(thief,{system:1,port:3,x:rock.x+280,y:rock.y-70,timer:10,speed:0});
    const started=planOreTheft(state,miner,rock,{force:true,thief});
    if(started){traffic.devOreDisputeDemoStarted=true;traffic.devCombatPreviewVersion=2;}
    return started;
  }
  function choose(state,ship){
    if(ship.system===1&&ship.oreHold>0&&ship.port!==1){cruise(state,ship,1);return;}
    if(ship.system!==1&&!ship.cargo&&ship.legs%3===1){const angle=(ship.id*.754877666+ship.legs*.34)%1*Math.PI*2;ship.goalX=-220+Math.cos(angle)*850;ship.goalY=75+Math.sin(angle)*850;ship.phase='cruise';note(state,`${ship.name} is making a local survey flight near ${systemName(ship.system)}.`);return;}
    if(!ship.cargo)load(state,ship);
    const cargo=ship.cargo;
    const resident=state.civilianTraffic.ships.filter(other=>other.stationSystem===ship.stationSystem&&other.system===ship.system&&other.phase!=='warp'&&other.phase!=='destroyed').length;
    if(cargo&&cargo.toSystem!==ship.system){if(ship.system===ship.stationSystem&&resident<=1){if(ship.system===1)ship.timer=8;else localPatrol(ship);return;}warp(state,ship,cargo.toSystem);return;}
    if(ship.system!==1){if(ship.system===ship.stationSystem&&resident<=1){localPatrol(ship);return;}warp(state,ship,ship.system===ship.stationSystem?neighbors(ship.system)[(ship.id+ship.legs)%neighbors(ship.system).length]:ship.stationSystem);return;}
    if(ship.legs%5===3&&stats(ship.shipType).cargo-(ship.cargo?.tons||0)-(ship.oreHold||0)>=4){const rock=availableRock(state,'Asteroid Belt');if(rock){miningFlight(state,ship,rock);return;}}
    const next=cargo?.toPort||solPorts[(ship.id+ship.legs+2)%solPorts.length];
    if(next!==ship.port){cruise(state,ship,next);return;}
    warp(state,ship,destinations[(ship.id+ship.legs+1)%destinations.length]||14);
  }
  function arrive(state,ship){ship.x=ship.goalX;ship.y=ship.goalY;ship.speed=0;ship.phase='docked';ship.timer=5+(ship.id%3)*2;ship.legs++;unload(state,ship);}
  function deals(state){
    const ships=state.civilianTraffic.ships;
    for(let i=0;i<ships.length;i++)for(let j=i+1;j<ships.length;j++){
      const a=ships[i],b=ships[j];if(a.phase!=='docked'||b.phase!=='docked'||a.system!==b.system||a.port!==b.port||Math.hypot(a.x-b.x,a.y-b.y)>430)continue;
      const key=`${a.id}:${b.id}`,last=state.civilianTraffic.meetings?.[key]||0;
      if(state.civilianTraffic.clock-last<35)continue;
      state.civilianTraffic.meetings||={};state.civilianTraffic.meetings[key]=state.civilianTraffic.clock;
      const seller=a.cargo&&!b.cargo?a:b.cargo&&!a.cargo?b:null,buyer=seller===a?b:a;
      let disputeReason=null;
      if(seller){const tons=Math.min(8,seller.cargo.tons,Math.floor(buyer.credits/15),Math.floor(freeHold(buyer)));if(tons>0){
        const fraud=(buyer.id%5===1||buyer.id%5===4)&&availableForDispute(state.civilianTraffic,seller)&&availableForDispute(state.civilianTraffic,buyer)&&!state.civilianTraffic.disputes.some(dispute=>dispute.system===seller.system)&&Math.random()<.08;
        buyer.cargo={...seller.cargo,tons};seller.cargo.tons-=tons;if(!seller.cargo.tons)seller.cargo=null;
        if(fraud){disputeReason=`${buyer.name} taking ${tons} t of ${economy.goods[buyer.cargo.good]} without paying`;note(state,`${buyer.name} took delivery of ${tons} t from ${seller.name} and refused to pay.`);}
        else{buyer.credits-=tons*15;seller.credits+=tons*15;note(state,`${seller.name} traded ${tons} t of ${economy.goods[buyer.cargo.good]} to ${buyer.name}.`);}
      }}
      else if(a.cargo&&b.cargo&&a.cargo.good!==b.cargo.good&&b.credits>=5){const lot=a.cargo;a.cargo=b.cargo;b.cargo=lot;b.credits-=5;a.credits+=5;note(state,`${a.name} and ${b.name} traded ${economy.goods[lot.good]} for ${economy.goods[a.cargo.good]}.`);}
      else note(state,`${a.name} and ${b.name} stopped to talk and negotiate a trade.`);
      a.deals++;b.deals++;a.talkingUntil=state.civilianTraffic.clock+4;b.talkingUntil=state.civilianTraffic.clock+4;a.timer=Math.max(a.timer,3);b.timer=Math.max(b.timer,3);
      if(disputeReason)startDispute(state,seller,buyer,disputeReason);
    }
  }
  function playerPosition(state){return state.system===1&&window.vexedSolFlight?.shipPosition?window.vexedSolFlight.shipPosition(state):{x:Number(state.x)||0,y:Number(state.y)||0};}
  function directEncounter(state,traffic){
    if(!Number.isFinite(Number(state.x))||!Number.isFinite(Number(state.y))||state.landed||window.vexedWarp?.active)return;
    const system=systems.find(entry=>entry.id===state.system),base=state.system===1?22:Number(system?.populationBillions)>0?30:52;
    traffic.encounters||={};const record=traffic.encounters[state.system]||={next:traffic.clock+base};traffic.encounters[state.system]=record;
    const player=playerPosition(state),near=traffic.ships.some(ship=>ship.system===state.system&&ship.phase!=='destroyed'&&ship.phase!=='disabled'&&ship.phase!=='warp'&&Math.hypot(ship.x-player.x,ship.y-player.y)<650);
    if(near){record.next=Math.max(record.next,traffic.clock+base);return;}
    if(traffic.clock<record.next)return;
    const adjacent=new Set(neighbors(state.system));
    const eligible=traffic.ships.filter(ship=>adjacent.has(ship.system)&&['docked','cruise','encounter'].includes(ship.phase)&&!ship.disputeId&&(ship.system!==ship.stationSystem||traffic.ships.filter(other=>other.stationSystem===ship.stationSystem&&other.system===ship.system&&other.phase!=='warp'&&other.phase!=='destroyed').length>1));
    if(!eligible.length){record.next=traffic.clock+12;return;}
    const picked=eligible[(Math.floor(traffic.clock/5)+state.system)%eligible.length];
    picked.encounterApproach=true;warp(state,picked,state.system);picked.timer=6+(picked.id%3)*2;picked.warpDuration=picked.timer;
    record.next=traffic.clock+base+14+(picked.id%13);
  }
  function finishWarp(state,ship){
    ship.system=ship.destinationSystem;ship.destinationSystem=null;ship.speed=0;
    ship.port=ship.system===1?ship.cargo?.toSystem===1&&economy.names[ship.cargo.toPort]?ship.cargo.toPort:solPorts[(ship.id+ship.legs)%solPorts.length]:0;
    if(ship.encounterApproach&&ship.system===state.system&&Number.isFinite(Number(state.x))){
      const player=playerPosition(state),planet=ship.system===1?place(1,ship.port,ship.id):{x:-220,y:75};
      const dx=player.x-planet.x,dy=player.y-planet.y,angle=Math.hypot(dx,dy)>100?Math.atan2(dy,dx):(ship.id*.61803398875%1)*Math.PI*2;
      ship.x=player.x+Math.cos(angle)*760;ship.y=player.y+Math.sin(angle)*760;ship.heading=angle+Math.PI;
      ship.goalX=player.x;ship.goalY=player.y;ship.phase='encounter';ship.timer=0;
      note(state,`${ship.name} warped into ${systemName(ship.system)} and is approaching local traffic.`);
    }else{
      Object.assign(ship,place(ship.system,ship.port,ship.id));ship.phase='docked';ship.timer=3;
      note(state,`${ship.name} arrived in ${systemName(ship.system)}.`);
    }
    ship.encounterApproach=false;ship.legs++;
    ship.warpResumePhase=ship.phase;ship.phase='arriving';
    ship.warpVisual={kind:'arrival',elapsedMs:0,angle:ship.heading+Math.PI/2};
    warpSound(state,ship,'arrival');
  }
  function advance(state,dt){
    const traffic=initialize(state);if(dt<=0)return;dt=Math.min(dt,.25);traffic.clock+=dt;
    if(state.devMode&&state.system===1&&Number(state.localBody??3)===3&&!state.landed&&!state.localCruise&&!state.arrivalApproach&&!window.vexedWarp?.active&&(!traffic.devOreDisputeDemoStarted||traffic.devCombatPreviewVersion!==2))startOreDisputeDemo(state);
    for(const ship of traffic.ships){
      if(ship.phase==='disabled'){combat.coast(ship,dt);continue;}
      if(ship.phase==='destroyed'||ship.phase==='fighting')continue;
      if(ship.phase==='ore-theft'){advanceOreTheft(state,ship,dt);continue;}
      if(ship.phase==='docked'){ship.timer-=dt;if(ship.timer<=0)choose(state,ship);continue;}
      if(ship.phase==='warp'){
        if(ship.warpVisual){ship.warpVisual.elapsedMs+=dt*1000;if(ship.warpVisual.elapsedMs>=window.vexedRebirthWarp.departureMs)delete ship.warpVisual;}
        ship.timer-=dt;if(ship.timer<=0)finishWarp(state,ship);continue;
      }
      if(ship.phase==='arriving'){
        ship.warpVisual.elapsedMs+=dt*1000;
        if(ship.warpVisual.elapsedMs>=window.vexedRebirthWarp.arrivalMs){
          ship.phase=ship.warpResumePhase;delete ship.warpResumePhase;delete ship.warpVisual;
          if(ship.phase==='docked')unload(state,ship);
        }
        continue;
      }
      if(ship.phase==='mining'){ship.timer-=dt;if(ship.timer<=0)finishMining(state,ship);continue;}
      if(ship.phase==='collecting'){ship.timer-=dt;if(ship.timer<=0)collectMinedOre(state,ship);continue;}
      if(ship.phase==='cruise'||ship.phase==='mining-flight'||ship.phase==='encounter'){
        if(ship.phase==='mining-flight'&&rockGone(state,rockById(ship.miningRockSlot))){const replacement=availableRock(state,'Asteroid Belt');if(replacement)miningFlight(state,ship,replacement);else{ship.phase='docked';ship.timer=2;ship.miningRockSlot=null;}continue;}
        const dx=ship.goalX-ship.x,dy=ship.goalY-ship.y,distance=Math.hypot(dx,dy),cruiseSpeed=Math.max(36,Number(stats(ship.shipType).speedOrOtherStationValue||40)*3);
        const speed=Math.min(cruiseSpeed,Math.max(0,Number(ship.speed)||0)+cruiseSpeed*.75*dt,Math.sqrt(450*distance));
        ship.speed=speed;
        ship.heading=Math.atan2(dy,dx);const step=Math.min(distance,speed*dt);if(distance>0){ship.x+=dx/distance*step;ship.y+=dy/distance*step;}
        if(distance<=step+.1){if(ship.phase==='mining-flight'){beginMining(state,ship,rockById(ship.miningRockSlot));ship.port=6;}else if(ship.phase==='encounter'){const destination=ship.system===1?place(1,ship.port,ship.id):{x:-150+(ship.id%3)*45,y:55+(ship.id%2)*60};ship.goalX=destination.x;ship.goalY=destination.y;ship.phase='cruise';}else arrive(state,ship);}
      }
    }
    traffic.dealTick=(traffic.dealTick||0)+dt;if(traffic.dealTick>=1){traffic.dealTick%=1;deals(state);directEncounter(state,traffic);}
    advanceDisputes(state,dt);
    for(let i=bursts.length-1;i>=0;i--){if(performance.now()-bursts[i].born>bursts[i].ttl)bursts.splice(i,1);else window.showcaseHullBurst.update(bursts[i],dt);}
    const now=performance.now();for(let i=fragments.length-1;i>=0;i--){const piece=fragments[i];if(now-piece.born>piece.ttl)fragments.splice(i,1);else window.showcaseStageFragments.update(piece,dt);}
    for(let i=wrecks.length-1;i>=0;i--){const wreck=wrecks[i];wreck.time+=dt*1000;for(const piece of wreck.debris){piece.x+=piece.vx*dt;piece.y+=piece.vy*dt;piece.angle+=piece.spin*dt;}for(const particle of wreck.particles){particle.x+=(particle.vx||0)*dt;particle.y+=(particle.vy||0)*dt;}effects.get(wreck.type)?.destruction.updateTrails(wreck);wreck.debris=wreck.debris.filter(piece=>wreck.time-piece.born<piece.ttl);wreck.particles=wreck.particles.filter(particle=>wreck.time-particle.born<particle.ttl);if(wreck.time>17000)wrecks.splice(i,1);}
  }
  const localShips=state=>initialize(state).ships.filter(ship=>ship.system===state.system&&!['warp','arriving','destroyed'].includes(ship.phase));
  function select(id){selected=id;selectedAt=performance.now();}
  function clearTarget(){selected=null;shots.length=0;bursts.length=0;fragments.length=0;wrecks.length=0;miningVisuals.clear();disputeVisuals.clear();}
  const target=state=>localShips(state).find(ship=>ship.id===selected)||null;
  function hitTest(state,{ship,cx,cy,zoom,x,y}){return localShips(state).map(entry=>({entry,d:Math.hypot(x-cx-(entry.x-ship.x)*zoom,y-cy-(entry.y-ship.y)*zoom)})).filter(item=>item.d<=Math.max(18,Math.hypot(dimensions(item.entry).width,dimensions(item.entry).height)*zoom*.45)).sort((a,b)=>a.d-b.d)[0]?.entry||null;}
  function hit(state,id,damage,impact=null){
    const ship=initialize(state).ships.find(entry=>entry.id===id);if(!ship||ship.phase==='destroyed')return {ok:false,error:'Target already destroyed.'};
    const previous=stage(ship),requested=Math.max(0,Number(damage)||0),floor=impact?.nonlethal?Math.min(ship.hull,disabledHull(ship)):0;
    const amount=impact?.nonlethal?Math.min(requested,ship.shields+Math.max(0,ship.hull-floor)):requested,absorbed=Math.min(ship.shields,amount),from=impact?.from||{x:ship.x,y:ship.y-100};
    const contact=impact?.contact||window.nativeCombatShots.contact(ship,from,dimensions(ship),ship.shields>0);
    ship.shields-=absorbed;ship.hull=Math.max(floor,ship.hull-(amount-absorbed));
    if(ship.combatAI&&amount>0){
      const ai=ship.combatAI,dispute=state.civilianTraffic.disputes.find(entry=>entry.id===ship.disputeId);ai.lastHitAt=state.civilianTraffic.clock;
      if(ship.shields<=0&&!ai.shieldWarning){ai.shieldWarning=true;queueHail(state,dispute,ship,'Shields down. Taking evasive action!');}
      if(ship.hull<stats(ship.shipType).hull*.5&&!ai.engineWarning){ai.engineWarning=true;queueHail(state,dispute,ship,'Engine damage. We are losing speed!');}
    }
    if(absorbed&&ship.system===state.system)ship.shieldFlash={born:performance.now(),x:contact.local.x,y:contact.local.y,dx:contact.dx,dy:contact.dy,kind:impact?.kind||'beam',energy:1+Math.min(.55,absorbed/Math.max(1,absorbed+ship.shields)*.7),charge:ship.shields/Math.max(1,stats(ship.shipType).shields)};
    if(amount>absorbed&&ship.system===state.system){const time=performance.now(),hullContact=absorbed>0?window.nativeCombatShots.contact(ship,from,dimensions(ship),false):contact;window.showcaseHullBurst?.burst(bursts,hullContact.world,time,.91976,1);const prepared=effects.get(ship.shipType),next=stage(ship);if(ship.hull>0&&next>previous&&prepared){const d=dimensions(ship),layout={x:ship.x,y:ship.y,w:d.width,h:d.height},angle=ship.heading+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);window.showcaseStageFragments.emit({debris:fragments,fragments:prepared.fragments,before:previous,after:next,layout,world:piece=>({x:ship.x+(piece.x*d.width)*c-(piece.y*d.height)*s,y:ship.y+(piece.x*d.width)*s+(piece.y*d.height)*c}),angle,time,zoom:1,burst:(point,strength,sparksOnly)=>window.showcaseHullBurst.burst(bursts,point,time,.91976,1,strength,sparksOnly)});}}
    let reputation=null;if(ship.hull===0){const wreck={type:ship.shipType,system:ship.system,x:ship.x,y:ship.y,angle:ship.heading+Math.PI/2,stage:previous,time:0,debris:[],particles:[],prepared:false};wrecks.push(wreck);if(wrecks.length>12)wrecks.shift();ship.phase='destroyed';ship.cargo=null;reputation=window.nativeFactionStanding.shipDestroyed(state,ship.ownerGovernmentId);note(state,`${ship.name} destroyed in ${systemName(ship.system)}.`);if(selected===id)selected=null;}
    else if(ship.hull<=disabledHull(ship)&&ship.phase!=='disabled'){ship.phase='disabled';ship.speed=0;note(state,`${ship.name} disabled with engines offline.`);}
    return {ok:true,destroyed:ship.phase==='destroyed',disabled:ship.phase==='disabled',shields:ship.shields,hull:ship.hull,reputation};
  }
  function fire(state,player,shipHeight,onFinish){
    const victim=target(state);if(!victim)return {ok:false,error:'Choose a civilian ship first.'};
    if(Math.hypot(victim.x-player.x,victim.y-player.y)>650)return {ok:false,error:'Ship is out of weapon range.'};
    const now=performance.now(),armed=window.nativeCombatShots.arm(state,now);if(!armed.ok)return armed;
    const shot=window.nativeCombatShots.create({state,ship:player,shipHeight,target:victim,kind:armed.kind,style:armed.style,now});
    shot.targetPoint=from=>window.nativeCombatShots.worldPoint(victim,shot.lockedImpactLocal||window.nativeCombatShots.contact(victim,from,dimensions(victim),victim.shields>0).local);shots.push(shot);
    setTimeout(()=>{if(['destroyed','warp','arriving'].includes(victim.phase)||victim.system!==state.system)return;const from=window.nativeCombatShots.source(shot,state,state.system===1&&window.vexedSolFlight?.shipPosition?window.vexedSolFlight.shipPosition(state):state),contact=window.nativeCombatShots.contact(victim,from,dimensions(victim),victim.shields>0);shot.lockedImpactLocal=contact.local;const result=hit(state,victim.id,armed.weapon.damage,{from,kind:shot.kind,contact});if(result.ok)onFinish?.(victim,result);},window.nativeCombatShots.hitDelay(shot));
    return {ok:true,weapon:armed.weapon.name};
  }
  function paint(ctx,{state,ship,cx,cy,w,h,zoom}){
    const now=performance.now();for(const vessel of initialize(state).ships){
      if(vessel.system!==state.system||vessel.phase==='destroyed'||vessel.phase==='warp'&&!vessel.warpVisual)continue;
      const visual=vessel.warpVisual;
      const warpEffect=visual?window.vexedRebirthWarp.worldEffect(visual.kind,visual.elapsedMs,visual.angle,vessel.x,vessel.y):null;
      const x=cx+(warpEffect?.shipX??vessel.x)-ship.x,y=cy+(warpEffect?.shipY??vessel.y)-ship.y,d=dimensions(vessel),screenX=cx+(x-cx)*zoom,screenY=cy+(y-cy)*zoom;
      const drawRing=()=>{if(warpEffect?.ring)window.vexedFlightAssets.drawWarpRing(ctx,{...warpEffect.ring,x:cx+warpEffect.ring.x-ship.x,y:cy+warpEffect.ring.y-ship.y},d.width);};
      if(screenX< -120||screenX>w+120||screenY< -120||screenY>h+120){drawRing();continue;}
      const asset=art(vessel),angle=vessel.heading+Math.PI/2,flash=!warpEffect&&vessel.shieldFlash;
      if(asset&&flash&&now-flash.born<620){ctx.save();ctx.translate(x,y);ctx.rotate(angle);window.drawShowcaseShieldSurface(ctx,0,0,d.width,d.height,'#50d5ff',Math.max(.08,flash.charge),now,{refract:true,impact:flash});ctx.restore();}
      if(asset)window.vexedFlightAssets.drawShip(ctx,asset,x,y,d.width,warpEffect?.angle??angle,now,{...warpEffect,height:d.height,lights:vessel.phase!=='disabled',lightGain:1,lightBloom:1});
      drawRing();
      if(asset&&flash&&now-flash.born<620){ctx.save();ctx.translate(x,y);ctx.rotate(angle);window.drawShowcaseShieldFlash(ctx,asset.art,d.width,d.height,flash,now);window.drawShowcaseShieldSurface(ctx,0,0,d.width,d.height,'#50d5ff',Math.max(.08,flash.charge),now,{front:true,impact:flash});ctx.restore();}
      if(selected===vessel.id&&!warpEffect)window.nativeAsteroidCombat?.drawTargetFrame(ctx,{name:vessel.name,size:Math.hypot(d.width,d.height)/Math.SQRT2,kind:vessel.phase==='disabled'?'DISABLED CIVILIAN':'CIVILIAN',color:'#ffd66e',shield:vessel.shields/Math.max(1,stats(vessel.shipType).shields),hull:vessel.hull/Math.max(1,stats(vessel.shipType).hull),selectedAt},x,y,zoom,cx);
    }
  }
  function miningIds(state){return initialize(state).ships.filter(vessel=>vessel.system===1&&vessel.phase==='mining').map(vessel=>vessel.miningRockSlot);}
  function paintMining(ctx,{state,ship,cx,cy,zoom}){
    if(state.system!==1)return;
    const now=performance.now(),clock=initialize(state).clock;
    for(const vessel of localShips(state)){
      if(vessel.phase!=='mining'&&(vessel.phase!=='collecting'||clock-(vessel.miningStartedAt??clock)>=8.5))continue;
      const rock=rockById(vessel.miningRockSlot);if(!rock)continue;
      const born=now-Math.max(0,clock-(vessel.miningStartedAt??clock))*1000;
      let visual=miningVisuals.get(vessel.id);
      if(!visual||visual.rock.slotId!==rock.slotId){visual={rock,ship:{x:vessel.miningSourceX??vessel.x,y:vessel.miningSourceY??vessel.y},born,effect:null};miningVisuals.set(vessel.id,visual);}
      visual.born=born;
      window.nativeAsteroidMiningEffects?.draw(ctx,visual,{x:cx+rock.x-ship.x,y:cy+rock.y-ship.y,source:{x:cx+visual.ship.x-ship.x,y:cy+visual.ship.y-ship.y},zoom,now});
    }
  }
  function paintEffects(ctx,{state,ship,cx,cy,zoom}){const now=performance.now();for(let i=shots.length-1;i>=0;i--){const shot=shots[i];if(shot.projectile?!shot.projectile.alive:now-shot.born>shot.duration){shots.splice(i,1);continue;}if(shot.system==null||shot.system===state.system)window.nativeCombatShots.paint(ctx,shot,{state,ship,cx,cy,zoom,now});}ctx.save();ctx.translate(cx-ship.x,cy-ship.y);for(const piece of fragments)window.showcaseStageFragments.draw(ctx,piece,now);for(const wreck of wrecks){if(wreck.system!==state.system)continue;const prepared=effects.get(wreck.type)?.destruction;if(prepared&&!wreck.prepared){const d=dimensions({shipType:wreck.type}),c=Math.cos(wreck.angle),s=Math.sin(wreck.angle);prepared.emit(wreck,{x:wreck.x,y:wreck.y,w:d.width,h:d.height},piece=>({x:wreck.x+(piece.x*d.width)*c-(piece.y*d.height)*s,y:wreck.y+(piece.x*d.width)*s+(piece.y*d.height)*c}),wreck.stage,1);wreck.prepared=true;}for(const piece of wreck.debris){ctx.save();ctx.translate(piece.x,piece.y);ctx.rotate(piece.angle);if(piece.structural)prepared.drawStructuralWreck(ctx,piece,wreck.time);else{ctx.drawImage(piece.texture,-piece.w/2,-piece.h/2,piece.w,piece.h);prepared.drawWreckGlow(ctx,piece,wreck.time);}ctx.restore();}for(const particle of wreck.particles)prepared?.drawParticle(ctx,particle,wreck.time);}for(const particle of bursts)window.showcaseHullBurst.draw(ctx,particle,now);ctx.restore();}
  function snapshot(state){const traffic=initialize(state);return {ships:traffic.ships.map(ship=>({id:ship.id,name:ship.name,system:ship.system,destinationSystem:ship.destinationSystem,phase:ship.phase,port:ship.port,cargo:[ship.cargo?`${ship.cargo.tons} t ${economy.goods[ship.cargo.good]}`:null,ship.oreHold?`${ship.oreHold} t mined ore`:null].filter(Boolean).join(', ')||'Empty hold',deliveries:ship.deliveries,mined:ship.mined,deals:ship.deals,stolenOre:ship.stolenOre||0,dispute:traffic.disputes.find(dispute=>dispute.id===ship.disputeId)?.reason||null})),disputes:traffic.disputes.map(({id,system,a,b,reason})=>({id,system,a,b,reason})),log:traffic.log.slice()};}
  window.nativeCivilianTraffic={initialize,advance,paint,paintMining,miningIds,isMiningRock,startMiningDemo,startOreDisputeDemo,paintEffects,select,clearTarget,target,hitTest,fire,hit,snapshot,localShips,effectsReady:()=>types.every(type=>Boolean(effects.get(type)))};
})();
