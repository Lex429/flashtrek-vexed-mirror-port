/* Persistent civilian traffic shared by Sol and nearby star systems. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld, economy=window.nativeSolEconomy,combat=window.nativeCivilianCombatAI;
  const types=[18,23,47,52], homes={18:14,23:47,47:1,52:6};
  const destinations=[2,4,6,14,47];
  const solPorts=[3,4,5,2,1,7,8,9,10];
  const systems=world.systems,neighborCache=new Map();
  const miningVisuals=new Map();
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
  const dimensions=ship=>window.nativeShipDefinitions.dimensions(ship,'civilian');
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
    traffic.disputes||=[];traffic.retaliations||=[];traffic.strayShots||=[];traffic.nextDisputeId||=1;traffic.nextShotId||=1;
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
    migrateClock(state,traffic);
    window.nativeCombatShots.migrate?.(state);
    return traffic;
  }
  function migrateClock(state,traffic){
    if(traffic.timingVersion===1)return;
    const offset=window.nativeSimulation.seconds(state)-(Number(traffic.clock)||0);
    const shift=(object,keys)=>{for(const key of keys)if(Number.isFinite(object?.[key]))object[key]+=offset;};
    for(const ship of traffic.ships){
      shift(ship,['miningStartedAt','talkingUntil','retaliationUntil','disputeCooldownUntil']);
      shift(ship.combatAI,['until','nextEvade','lastHitAt','modeSince','lineBlockedUntil']);
    }
    for(const conflict of [...traffic.disputes,...traffic.retaliations]){
      shift(conflict,['startedAt','nextA','nextB','nextHailAt','nextShotAt']);
      for(const hail of conflict.hails||[])shift(hail,['dueAt']);
    }
    for(const encounter of Object.values(traffic.encounters||{}))shift(encounter,['next']);
    for(const key of Object.keys(traffic.meetings||{}))if(Number.isFinite(traffic.meetings[key]))traffic.meetings[key]+=offset;
    traffic.clock=window.nativeSimulation.seconds(state);traffic.timingVersion=1;
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
  const rockById=id=>window.nativeSolAsteroids?.find?.(id)||window.nativeSolAsteroids?.placements.find(rock=>rock.slotId===id);
  const rockGone=(state,rock)=>!rock||state.minedAsteroids?.includes(rock.slotId)||state.destroyedAsteroids?.includes(rock.slotId);
  const freeHold=ship=>Math.max(0,stats(ship.shipType).cargo-(ship.cargo?.tons||0)-(ship.oreHold||0));
  const canMine=ship=>window.nativeShipDefinitions.get(ship.shipType,'civilian').capabilities.canMine!==false;
  const disabledHull=ship=>Math.max(1,stats(ship.shipType).hull*.25);
  const operational=ship=>ship&&!['disabled','destroyed','warp','arriving'].includes(ship.phase)&&ship.hull>disabledHull(ship);
  const availableForDispute=(traffic,ship)=>operational(ship)&&!ship.disputeId&&!ship.retaliationId&&(ship.disputeCooldownUntil||0)<=traffic.clock;
  const isMiningRock=(state,id)=>initialize(state).ships.some(ship=>ship.miningRockSlot===id&&['mining-flight','mining','collecting'].includes(ship.phase));
  function availableRock(state,region){
    return (window.nativeSolAsteroids?.placements||[]).find(rock=>rock.region===region&&!rockGone(state,rock)&&!isMiningRock(state,rock.slotId)&&rock.slotId!==window.nativeAsteroidCombat?.miningId)||null;
  }
  function miningFlight(state,ship,rock){
    ship.miningRockSlot=rock.slotId;ship.goalX=rock.x+110+(ship.id%3)*15;ship.goalY=rock.y+40+(ship.id%2)*20;
    ship.phase='mining-flight';note(state,`${ship.name} is approaching ${rock.name} in the ${rock.region}.`);
  }
  function beginMining(state,ship,rock,{theft=true}={}){
    if(!canMine(ship)){ship.phase='docked';ship.timer=1;return;}
    ship.miningRockSlot=rock.slotId;ship.miningStartedAt=state.civilianTraffic.clock;ship.miningSourceX=ship.x;ship.miningSourceY=ship.y;
    ship.speed=0;ship.heading=Math.atan2(rock.y-ship.y,rock.x-ship.x);ship.phase='mining';ship.timer=window.nativeAsteroidCombat.miningTiming.cutSeconds;
    miningVisuals.delete(ship.id);note(state,`${ship.name} engaged its mining laser on ${rock.name}.`);
    if(theft)planOreTheft(state,ship,rock);
  }
  function finishMining(state,ship){
    const rock=rockById(ship.miningRockSlot);
    if(rock&&window.nativeAsteroidCombat.completeMining(state,rock).ok){
      ship.phase='collecting';ship.timer=window.nativeAsteroidCombat.miningTiming.transportSeconds;
      note(state,`${ship.name} cut ${rock.name}; its ore is waiting for transport.`);
    }else{ship.phase='docked';ship.timer=1;ship.miningRockSlot=null;miningVisuals.delete(ship.id);}
  }
  function collectMinedOre(state,ship){
    const rock=rockById(ship.miningRockSlot),tons=claimOre(state,ship,rock);
    if(tons>0){ship.mined+=tons;note(state,`${ship.name} transported ${tons} t of ${rock.oreLabel} aboard from ${rock.region}.`);}
    ship.port=rock?.demo?3:6;ship.phase='docked';ship.timer=1;ship.miningRockSlot=null;miningVisuals.delete(ship.id);
    delete ship.scriptedDemo;
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
    const moved=window.nativeShipMotion.step(ship,{goal:rock,arrivalRadius:85,stopAtRadius:true,snap:false,braking:false},window.nativeShipDefinitions.describe(state,ship,{category:'civilian'}).definition.movement,dt);
    if(moved.distance>90)return;
    window.nativeShipMotion.stop(ship);
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
    if(!tacticallyDetailed(state,a)||!tacticallyDetailed(state,b))return false;
    const player=playerPosition(state),midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const preview=state.devMode&&a.system===state.system&&a.system===1&&Number(state.localBody??3)===3&&Math.hypot(midpoint.x-player.x,midpoint.y-player.y)<500;
    const dispute={id:traffic.nextDisputeId++,combatVersion:3,system:a.system,a:a.id,b:b.id,reason,startedAt:traffic.clock,nextA:traffic.clock+1.5,nextB:traffic.clock+2,
      anchor:preview?{...player}:midpoint,bounds:preview?{x:265,y:155}:{x:440,y:330},pending:[],volleys:0,hits:0,misses:0,blocked:0,hails:[],nextHailAt:traffic.clock+3};
    traffic.disputes.push(dispute);
    for(const ship of [a,b]){if(!ship.scriptedDemo)window.nativeNpcLives?.interrupt(state,ship,'combat');combat.begin(ship,ship===a?'claimant':'thief',traffic.clock);ship.disputeId=dispute.id;ship.phase='fighting';ship.miningRockSlot=null;miningVisuals.delete(ship.id);}
    hail(state,a,reason.startsWith('theft')?'Return the ore you stole!':'Pay for that delivery!');
    queueHail(state,dispute,b,'Keep your distance. This cargo is mine.');
    note(state,`${a.name} and ${b.name} opened a dispute over ${reason}. Weapons are targeting engines.`);return true;
  }
  function endDispute(state,dispute,a,b){
    const traffic=state.civilianTraffic;
    for(const ship of [a,b].filter(Boolean)){
      if(ship.disputeId===dispute.id){
        delete ship.disputeId;ship.disputeCooldownUntil=traffic.clock+180;window.nativeShipMotion.stop(ship);if(ship.phase==='fighting'){ship.phase='docked';ship.timer=8;}
        if(ship.scriptedDemo==='ore-dispute'||ship.scriptedDemo==='mining'&&ship.miningRockSlot==null)delete ship.scriptedDemo;
        window.nativeNpcLives?.resumeWork?.(state,ship,'Dispute ended; resume useful work');
      }
    }
    const loser=[a,b].find(ship=>ship?.phase==='disabled');
    traffic.combatReports||=[];
    traffic.combatReports.unshift({reason:dispute.reason,duration:traffic.clock-dispute.startedAt,shots:dispute.volleys,hits:dispute.hits||0,misses:dispute.misses||0,blocked:dispute.blocked||0,disabled:loser?.id??null});
    traffic.combatReports.length=Math.min(traffic.combatReports.length,8);
    hail(state,loser||a||b,loser?'Engines disabled. Cease fire.':'Breaking contact.');
    note(state,loser?`Weapons cease: ${loser.name} is disabled. The dispute over ${dispute.reason} has ended.`:`The dispute over ${dispute.reason} ended; the ships broke contact.`);
    traffic.disputes=traffic.disputes.filter(entry=>entry.id!==dispute.id);
  }
  function disputeWeapons(ship){
    const definition=window.nativeShipDefinitions.get(ship.shipType,'civilian');
    const fitted=definition.equipment.filter(id=>window.VexedMirrorWeapons?.some(weapon=>weapon.id===id&&weapon.damage>0));
    return fitted.length?fitted:definition.capabilities.defensiveWeapon?[definition.capabilities.defensiveWeapon]:[];
  }
  function fireDisputeShot(state,dispute,shooter,victim,scene){
    window.nativeSimulationFrame?.count(state,'tacticalFiringAttempts');
    const traffic=state.civilianTraffic,descriptor=window.nativeShipDefinitions.describe(state,shooter,{category:'civilian'});
    const selection=window.nativeWeaponLoadout.equipped(state,shooter,disputeWeapons(shooter)).sort((a,b)=>{
      const score=entry=>entry.weapon.damage+(window.nativeCombatShots.weaponVisual(entry.weapon).kind==='beam'&&victim.shields>0?4:0)+(window.nativeCombatShots.weaponVisual(entry.weapon).kind==='torpedo'&&victim.shields<=0?3:0);
      return score(b)-score(a);
    });
    const result=window.nativeCombatShots.fireFor({state,shooter:descriptor,target:victim,owner:dispute.id,selection});
    if(result.ok){dispute.volleys++;shooter.combatAI.shots++;}
    return .1;
  }
  function combatScene(state,dispute){return window.nativeShipSystems.scene(state,{system:dispute.system});}
  const tacticallyDetailed=(state,ship)=>window.nativeShipDetail?window.nativeShipDetail.isDetailed(state,ship):window.nativeNpcLives?window.nativeNpcLives.detail(state,ship)==='detailed':ship?.system===state.system;
  function conflictTarget(state,id,system){
    if(id==='player')return state.system===system&&state.hull>0?window.nativeShipDefinitions.describe(state,state,{category:'player'}):null;
    const category=typeof id==='string'&&id.startsWith('tug:')?'tug':'civilian';
    const entity=category==='tug'?state.solEconomy?.freighters.find(ship=>ship.id===Number(id.slice(4))):state.civilianTraffic.ships.find(ship=>String(ship.id)===String(id));
    if(entity)return window.nativeShipDefinitions.describe(state,entity,{category});
    return category==='civilian'&&typeof id==='string'&&id.includes(':')?window.nativeShipSystems.resolve(state,id,system):null;
  }
  function endRetaliation(state,record,ship){
    if(ship?.retaliationId===record.id){delete ship.retaliationId;delete ship.retaliationTargetId;
      if(ship.phase==='fighting'){ship.phase='docked';ship.timer=5;window.nativeShipMotion.stop(ship);}
      if(ship.scriptedDemo==='ore-dispute'||ship.scriptedDemo==='mining'&&ship.miningRockSlot==null)delete ship.scriptedDemo;
      window.nativeNpcLives?.resumeWork?.(state,ship,'Contact lost outside detailed simulation');
    }
    state.civilianTraffic.retaliations=state.civilianTraffic.retaliations.filter(other=>other!==record);
  }
  function advanceDisputes(state,dt){
    const traffic=state.civilianTraffic;
    for(const dispute of [...traffic.disputes]){
      const a=traffic.ships.find(ship=>ship.id===dispute.a),b=traffic.ships.find(ship=>ship.id===dispute.b);
      if(!operational(a)||!operational(b)||a.system!==b.system||a.system!==dispute.system||a.disputeId!==dispute.id||b.disputeId!==dispute.id){endDispute(state,dispute,a,b);continue;}
      if(!tacticallyDetailed(state,a)||!tacticallyDetailed(state,b)){endDispute(state,dispute,a,b);continue;}
      if(dispute.combatVersion!==3){
        dispute.combatVersion=3;dispute.anchor={x:(a.x+b.x)/2,y:(a.y+b.y)/2};dispute.pending=[];
        dispute.hits=0;dispute.misses=0;dispute.blocked=0;dispute.hails=[];
        combat.begin(a,'claimant',traffic.clock);combat.begin(b,'thief',traffic.clock);
      }
      let scene=combatScene(state,dispute);
      for(const [ship,opponent] of [[a,b],[b,a]]){
        ship.cruiseSpeed=Math.max(36,Number(stats(ship.shipType).speedOrOtherStationValue||40)*3);ship.maxCombatHull=stats(ship.shipType).hull;
        ship.combatRadius=Math.max(7,Math.max(dimensions(ship).width,dimensions(ship).height)*.35);
        if(!ship.combatAI)combat.begin(ship,ship===a?'claimant':'thief',traffic.clock);
        if(!Number.isFinite(ship.vx)){ship.vx=0;ship.vy=0;}
        opponent.vx=Number(opponent.vx)||0;opponent.vy=Number(opponent.vy)||0;
        const attacker=traffic.clock<=ship.retaliationUntil&&scene.bystanders.find(candidate=>candidate.id===ship.retaliationTargetId&&candidate.hull>0&&tacticallyDetailed(state,candidate));
        combat.steer(ship,attacker||opponent,dispute,{...scene,dt,clock:traffic.clock,hull:stats(ship.shipType).hull,shields:stats(ship.shipType).shields});
        window.nativeShipSystems.invalidate?.(state,dispute.system);window.nativeSimulationFrame?.count(state,'tacticalUpdates');
      }
      if(dispute.hails?.length&&traffic.clock>=(dispute.nextHailAt||0)){
        const entry=dispute.hails.find(message=>message.dueAt<=traffic.clock);
        if(entry){hail(state,entry.speaker===a.id?a:b,entry.text);dispute.hails.splice(dispute.hails.indexOf(entry),1);dispute.nextHailAt=traffic.clock+3;}
      }
      scene=combatScene(state,dispute);
      if(!operational(a)||!operational(b)){endDispute(state,dispute,a,b);continue;}
      if(traffic.clock>=dispute.nextA)dispute.nextA=traffic.clock+fireDisputeShot(state,dispute,a,(traffic.clock<=a.retaliationUntil&&scene.bystanders.find(ship=>ship.id===a.retaliationTargetId&&ship.hull>0&&tacticallyDetailed(state,ship)))||b,scene);
      if(traffic.clock>=dispute.nextB)dispute.nextB=traffic.clock+fireDisputeShot(state,dispute,b,(traffic.clock<=b.retaliationUntil&&scene.bystanders.find(ship=>ship.id===b.retaliationTargetId&&ship.hull>0&&tacticallyDetailed(state,ship)))||a,scene);
    }
  }
  function retaliate(state,ship,sourceId){
    const traffic=state.civilianTraffic;
    if(!operational(ship)||sourceId==null||sourceId===ship.id)return;
    if(!tacticallyDetailed(state,ship))return;
    const attacker=conflictTarget(state,sourceId,ship.system);
    if(!attacker||attacker.hull<=0||!tacticallyDetailed(state,attacker))return;
    ship.retaliationTargetId=sourceId;ship.retaliationUntil=traffic.clock+60;
    if(ship.disputeId||ship.retaliationId)return;
    if(!ship.scriptedDemo)window.nativeNpcLives?.interrupt(state,ship,'combat');
    const retaliation={id:'retaliation:'+ship.id,system:ship.system,a:ship.id,b:sourceId,anchor:{x:ship.x,y:ship.y},bounds:{x:650,y:500},pending:[],volleys:0,hits:0,misses:0,blocked:0,nextShotAt:traffic.clock+.35};
    traffic.retaliations.push(retaliation);ship.retaliationId=retaliation.id;
    combat.begin(ship,'defender',traffic.clock);ship.phase='fighting';ship.miningRockSlot=null;miningVisuals.delete(ship.id);
    hail(state,ship,'Watch your fire! Returning fire on the ship that hit us.');
  }
  function advanceRetaliations(state,dt){
    const traffic=state.civilianTraffic;
    for(const retaliation of [...traffic.retaliations]){
      const ship=traffic.ships.find(other=>other.id===retaliation.a);
      if(!operational(ship)||ship.retaliationId!==retaliation.id||ship.system!==retaliation.system||traffic.clock>ship.retaliationUntil||!tacticallyDetailed(state,ship)){endRetaliation(state,retaliation,ship);continue;}
      const target=conflictTarget(state,ship.retaliationTargetId,retaliation.system);
      if(!target||target.hull<=0||!tacticallyDetailed(state,target)){endRetaliation(state,retaliation,ship);continue;}
      let scene=combatScene(state,retaliation);
      const attacker=scene.bystanders.find(other=>other.id===ship?.retaliationTargetId&&other.hull>0&&!['disabled','destroyed'].includes(other.phase));
      if(!operational(ship)||!attacker||ship.system!==retaliation.system||traffic.clock>ship.retaliationUntil||window.nativeNpcLives&&retaliation.system!==state.system){
        endRetaliation(state,retaliation,ship);continue;
      }
      retaliation.b=attacker.id;retaliation.anchor={x:(ship.x+attacker.x)/2,y:(ship.y+attacker.y)/2};
      ship.cruiseSpeed=Math.max(36,Number(stats(ship.shipType).speedOrOtherStationValue||40)*3);ship.maxCombatHull=stats(ship.shipType).hull;
      ship.combatRadius=Math.max(7,Math.max(dimensions(ship).width,dimensions(ship).height)*.35);
      combat.steer(ship,attacker,retaliation,{...scene,dt,clock:traffic.clock,hull:stats(ship.shipType).hull,shields:stats(ship.shipType).shields});
      window.nativeShipSystems.invalidate?.(state,retaliation.system);window.nativeSimulationFrame?.count(state,'tacticalUpdates');
      scene=combatScene(state,retaliation);
      if(traffic.clock>=retaliation.nextShotAt)retaliation.nextShotAt=traffic.clock+fireDisputeShot(state,retaliation,ship,attacker,scene);
    }
  }
  function startMiningDemo(state,{force=false,theft=true}={}){
    if(!state.devMode||state.system!==1)return false;
    const traffic=initialize(state),rock=window.nativeSolAsteroids?.placements.find(entry=>entry.demo);
    if(!rock||traffic.devMiningDemoStarted&&!force)return false;
    if(force){state.minedAsteroids=(state.minedAsteroids||[]).filter(id=>id!==rock.slotId);state.destroyedAsteroids=(state.destroyedAsteroids||[]).filter(id=>id!==rock.slotId);if(state.asteroidOreDrops)delete state.asteroidOreDrops[rock.slotId];}
    if(rockGone(state,rock))return false;
    const ship=traffic.ships.find(entry=>entry.id===0&&entry.phase!=='destroyed')||traffic.ships.find(entry=>entry.phase!=='destroyed');
    if(!ship||!canMine(ship))return false;
    window.nativeNpcLives?.interrupt(state,ship,'scripted demonstration');ship.scriptedDemo='mining';
    Object.assign(ship,{system:1,stationSystem:1,port:3,x:rock.x-130,y:rock.y+30,cargo:null,oreHold:0,destinationSystem:null});
    window.nativeNpcLives?.refreshLocation(state,ship);
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
    window.nativeNpcLives?.refreshLocation(state,thief);
    thief.scriptedDemo='ore-dispute';
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
    if(canMine(ship)&&ship.legs%5===3&&stats(ship.shipType).cargo-(ship.cargo?.tons||0)-(ship.oreHold||0)>=4){const rock=availableRock(state,'Asteroid Belt');if(rock){miningFlight(state,ship,rock);return;}}
    const next=cargo?.toPort||solPorts[(ship.id+ship.legs+2)%solPorts.length];
    if(next!==ship.port){cruise(state,ship,next);return;}
    warp(state,ship,destinations[(ship.id+ship.legs+1)%destinations.length]||14);
  }
  function arrive(state,ship){window.nativeShipMotion.stop(ship);ship.phase='docked';ship.timer=5+(ship.id%3)*2;ship.legs++;unload(state,ship);}
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
    const traffic=initialize(state);if(window.nativeSimulation.blocked()||dt<=0)return;traffic.clock=window.nativeSimulation.seconds(state);
    const lives=window.nativeNpcLives;
    if(lives)lives.advance(state,dt);
    dt=Math.min(dt,.25);
    for(const ship of traffic.ships){
      // Scripted mining demonstrations and active tactical encounters explicitly
      // retain their controller. Ordinary jobs belong to the saved life scheduler.
      if(lives&&!ship.scriptedDemo&&!ship.disputeId&&!ship.retaliationId&&!['fighting','ore-theft'].includes(ship.phase))continue;
      if(lives&&!tacticallyDetailed(state,ship))continue;
      ship.previousX=ship.x;ship.previousY=ship.y;
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
        const moved=window.nativeShipMotion.step(ship,{goal:{x:ship.goalX,y:ship.goalY},snap:true},window.nativeShipDefinitions.describe(state,ship,{category:'civilian'}).definition.movement,dt);
        if(moved.arrived){if(ship.phase==='mining-flight'){beginMining(state,ship,rockById(ship.miningRockSlot));ship.port=6;}else if(ship.phase==='encounter'){const destination=ship.system===1?place(1,ship.port,ship.id):{x:-150+(ship.id%3)*45,y:55+(ship.id%2)*60};ship.goalX=destination.x;ship.goalY=destination.y;ship.phase='cruise';}else arrive(state,ship);}

      }
    }
    traffic.dealTick=(traffic.dealTick||0)+dt;if(traffic.dealTick>=1){traffic.dealTick%=1;if(!lives)deals(state);}
    advanceDisputes(state,dt);
    advanceRetaliations(state,dt);
  }
  const localShips=state=>initialize(state).ships.filter(ship=>ship.system===state.system&&!['warp','arriving','destroyed'].includes(ship.phase));
  function select(id){selected=id;selectedAt=0;}
  function clearTarget(){selected=null;miningVisuals.clear();}
  const target=state=>localShips(state).find(ship=>ship.id===selected)||null;
  function hitTest(state,{ship,cx,cy,zoom,x,y}){return localShips(state).map(entry=>({entry,d:Math.hypot(x-cx-(entry.x-ship.x)*zoom,y-cy-(entry.y-ship.y)*zoom)})).filter(item=>item.d<=Math.max(18,Math.hypot(dimensions(item.entry).width,dimensions(item.entry).height)*zoom*.45)).sort((a,b)=>a.d-b.d)[0]?.entry||null;}
  function visualImpact(state,id,event={}){
    const ship=initialize(state).ships.find(entry=>entry.id===id);if(!ship)return {ok:false};
    return window.nativeShipEffects.visualImpact(state,window.nativeShipDefinitions.describe(state,ship,{category:'civilian'}),event);
  }
  function hit(state,id,damage,impact={}){
    impact||={};const ship=initialize(state).ships.find(entry=>entry.id===id);if(!ship)return {ok:false,error:'Target unavailable.'};
    const descriptor=window.nativeShipDefinitions.describe(state,ship,{category:'civilian'}),result=window.nativeShipDamage.apply(descriptor,damage,impact);
    if(!result.ok)return result;
    window.nativeShipEffects.hit(state,descriptor,result,impact);
    if(ship.combatAI&&result.amount>0){
      const ai=ship.combatAI,dispute=state.civilianTraffic.disputes.find(entry=>entry.id===ship.disputeId);ai.lastHitAt=state.civilianTraffic.clock;
      if(ship.shields<=0&&!ai.shieldWarning){ai.shieldWarning=true;queueHail(state,dispute,ship,'Shields down. Taking evasive action!');}
      if(ship.hull<descriptor.definition.hull*.5&&!ai.engineWarning){ai.engineWarning=true;queueHail(state,dispute,ship,'Engine damage. We are losing speed!');}
    }
    let reputation=null;
    if(result.destroyed){window.nativeNpcLives?.interrupt(state,ship,'destroyed');ship.phase='destroyed';ship.cargo=null;reputation=impact.source==='ai'?null:window.nativeFactionStanding.shipDestroyed(state,ship.ownerGovernmentId);note(state,`${ship.name} destroyed in ${systemName(ship.system)}.`);if(selected===id)selected=null;}
    else if(result.disabled&&ship.phase!=='disabled'){window.nativeNpcLives?.interrupt(state,ship,'disabled');ship.phase='disabled';window.nativeShipMotion.stop(ship);note(state,`${ship.name} disabled with engines offline.`);}
    if(result.amount>0)retaliate(state,ship,impact.sourceId??(impact.source==='ai'?null:'player'));
    return {...result,reputation};
  }
  function fire(state,player,shipHeight,onFinish){
    const victim=target(state);if(!victim)return {ok:false,error:'Choose a civilian ship first.'};
    return window.nativeCombatShots.fire({state,shipHeight,owner:'civilian',getTarget:()=>window.nativeShipSystems.resolve(state,victim.id),
      dimensions,shielded:ship=>ship.shields>0,
      onResolved(result){if(result.target?.id===victim.id&&result.damage?.ok)onFinish?.(victim,result.damage);}});
  }

  function paint(ctx,{state,ship,cx,cy,w,h,zoom}){
    for(const vessel of state.civilianTraffic?.ships||[]){
      if(vessel.phase==='destroyed')continue;
      const transit=!!vessel.journey&&!!window.nativeNpcLives;
      if(!transit&&(vessel.system!==state.system||vessel.phase==='warp'&&!vessel.warpVisual))continue;
      let pose=vessel;
      if(transit){const global=window.nativeNpcLives.galaxyPosition(state,vessel),origin=window.nativeManualFlight?.anchor(state.system);if(!origin)continue;pose={x:global.x-origin.x,y:global.y-origin.y,heading:Math.atan2(vessel.journey.galaxyTo.y-vessel.journey.galaxyFrom.y,vessel.journey.galaxyTo.x-vessel.journey.galaxyFrom.x)};}
      else if(vessel.localLeg&&window.nativeNpcLives)pose=window.nativeNpcLives.pose(state,vessel);
      const visual=vessel.warpVisual;
      const warpEffect=transit?{kind:'transit',angle:pose.heading+Math.PI/2,alpha:1,squeezeX:.85,shipX:pose.x,shipY:pose.y}:visual?window.vexedRebirthWarp.worldEffect(visual.kind,visual.elapsedMs,visual.angle,vessel.x,vessel.y):null;
      const x=cx+(warpEffect?.shipX??pose.x)-ship.x,y=cy+(warpEffect?.shipY??pose.y)-ship.y,d=dimensions(vessel),screenX=cx+(x-cx)*zoom,screenY=cy+(y-cy)*zoom;
      const drawRing=()=>{if(warpEffect?.ring)window.vexedFlightAssets.drawWarpRing(ctx,{...warpEffect.ring,x:cx+warpEffect.ring.x-ship.x,y:cy+warpEffect.ring.y-ship.y},d.width);};
      if(screenX< -120||screenX>w+120||screenY< -120||screenY>h+120){drawRing();continue;}
      const descriptor={...window.nativeShipDefinitions.describe(state,vessel,{category:'civilian'}),x:pose.x,y:pose.y,heading:pose.heading,system:state.system};
      window.nativeShipEffects.paintShip(ctx,descriptor,{ship,cx,cy,x,y,warpEffect});
      drawRing();
      if(selected===vessel.id&&!warpEffect)window.nativeAsteroidCombat?.drawTargetFrame(ctx,{name:vessel.name,size:Math.hypot(d.width,d.height)/Math.SQRT2,kind:vessel.phase==='disabled'?'DISABLED CIVILIAN':'CIVILIAN',color:'#ffd66e',shield:vessel.shields/Math.max(1,stats(vessel.shipType).shields),hull:vessel.hull/Math.max(1,stats(vessel.shipType).hull),selectedAt},x,y,zoom,cx);
    }
  }
  function miningIds(state){return initialize(state).ships.filter(vessel=>vessel.system===state.system&&vessel.phase==='mining').map(vessel=>vessel.miningRockSlot);}
  function paintMining(ctx,{state,ship,cx,cy,zoom,w=cx*2,h=cy*2}){
    const now=window.nativeSimulation.now(state),clock=window.nativeSimulation.seconds(state);
    for(const vessel of localShips(state)){
      if(vessel.phase!=='mining'&&(vessel.phase!=='collecting'||clock-(vessel.miningStartedAt??clock)>=8.5))continue;
      const rock=rockById(vessel.miningRockSlot);if(!rock)continue;
      const born=now-Math.max(0,clock-(vessel.miningStartedAt??clock))*1000;
      let visual=miningVisuals.get(vessel.id);
      if(!visual||visual.rock.slotId!==rock.slotId){visual={rock,ship:{x:vessel.miningSourceX??vessel.x,y:vessel.miningSourceY??vessel.y},born,effect:null};miningVisuals.set(vessel.id,visual);}
      visual.born=born;
      window.nativeAsteroidMiningEffects?.draw(ctx,visual,{x:cx+rock.x-ship.x,y:cy+rock.y-ship.y,source:{x:cx+visual.ship.x-ship.x,y:cy+visual.ship.y-ship.y},zoom,now,w,h});
    }
  }
  function snapshot(state){const traffic=initialize(state);return {ships:traffic.ships.map(ship=>({id:ship.id,name:ship.name,system:ship.system,destinationSystem:ship.destinationSystem,phase:ship.phase,port:ship.port,cargo:[ship.cargo?`${ship.cargo.tons} t ${economy.goods[ship.cargo.good]}`:null,ship.oreHold?`${ship.oreHold} t mined ore`:null].filter(Boolean).join(', ')||'Empty hold',deliveries:ship.deliveries,mined:ship.mined,deals:ship.deals,stolenOre:ship.stolenOre||0,dispute:traffic.disputes.find(dispute=>dispute.id===ship.disputeId)?.reason||null})),disputes:traffic.disputes.map(({id,system,a,b,reason})=>({id,system,a,b,reason})),log:traffic.log.slice()};}
  // Explicit readiness clients (browser checks/showcase tools) may request the
  // representative artwork. Ordinary initialization and the galaxy map do not.
  const effectsReady=()=>{for(const type of types)if(!window.nativeShipEffects.ready(type,'civilian'))window.nativeShipEffects.prepare(type,'civilian');return types.every(type=>window.nativeShipEffects.ready(type,'civilian'));};
  window.nativeCivilianTraffic={initialize,advance,paint,paintMining,miningIds,isMiningRock,startMiningDemo,startOreDisputeDemo,select,clearTarget,target,hitTest,fire,hit,visualImpact,snapshot,localShips,combatScene,effectsReady};
})();
