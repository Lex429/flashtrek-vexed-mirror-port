/* Saved civilian lives. Policies choose work; shared systems execute mechanics. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld,roles=new Map(),runtime=new WeakMap(),marketStates=new WeakMap();
  const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const quantityEpsilon=1e-9;
  // Cancellation after a large payment can leave a funded fractional remainder
  // slightly short, including across reload. Only an exact owned escrow may
  // use dust tolerance: at most 1e-7 credit and one part per million of payment.
  const coversFunds=(balance,payment,funded=false)=>{
    if(balance>=payment)return true;
    // Whole-credit arithmetic must stay strict, even near MAX_SAFE_INTEGER.
    if(!(balance>0)||Number.isInteger(balance)&&Number.isInteger(payment))return false;
    const relative=4*Number.EPSILON*Math.max(Math.abs(balance),Math.abs(payment));
    return payment-balance<=Math.min(1e-7,funded?payment*1e-6:relative);
  };
  const now=state=>window.nativeSimulation.seconds(state);
  const stats=ship=>window.nativeShipDefinitions.forEntity(null,ship,{category:'civilian'});
  const policy=ship=>stats(ship).npcPolicy;
  const permits=(ship,activity)=>policy(ship).activities.includes(activity);
  const medical=ship=>stats(ship).capabilities.medical===true;
  const costs=[12,24,48,70,30,16,42,55,110];
  const DEFAULTS={secondsPerDay:120,warpUnitsPerSecond:1400,warpGameplayScale:1,minJourneySeconds:8,
    eventBudget:64,distantInterval:5,eventHistory:24,idleSeconds:30,handlingSeconds:3,connectedSystems:[1,2,4],detailedRadius:6500,
    paymentRecoverySeconds:120,paymentRetrySeconds:30,economyEnabled:true,economyInterval:120,economyBudget:4};
  let callbacks={};
  const system=id=>world.systems.find(s=>s.id===Number(id));
  const minerals=()=>window.nativeRegionalMinerals;
  const access=()=>window.nativeCivilianAccess;
  const inhabited=(state,id)=>!access()||access().inhabited(state,id);
  const rocksIn=id=>window.nativeSolAsteroids?.forSystem?.(id)||(Number(id)===1?window.nativeSolAsteroids?.placements:[])||[];
  const rockById=(id,system)=>window.nativeSolAsteroids?.find?.(id,system)||rocksIn(system).find(r=>r.slotId===id);
  const gone=(state,id)=>state.minedAsteroids?.includes(id)||state.destroyedAsteroids?.includes(id);
  function anchor(id){
    const own=window.nativeManualFlight?.anchor(id);if(own)return own;
    const earth=system(1)?.mapPosition||{x:0,y:0},p=system(id)?.mapPosition||({51:{x:-250,y:-125},52:{x:-220,y:-160}}[id]);
    return p?{x:(p.x-earth.x)*1000,y:(p.y-earth.y)*1000}:{x:0,y:0};
  }
  const docking=()=>window.nativePortDocking;
  const portsIn=(state,id)=>!inhabited(state,id)?[]:id===1?window.nativeSolEconomy.ports.filter(p=>state.solEconomy?.ports?.[p]):[0];
  function approachDock(state,ship,port,at,handling){
    const berth=docking().request(state,ship,ship.system,port);
    ship.dockIntent={port,handling};
    if(!berth){ship.task.phase='dock-queue';schedule(state,ship,at+5);return false;}
    const phase=berth.kind==='berth'?(handling==='loading'?'pickup-flight':'approaching'):'holding-flight';
    return localLeg(state,ship,berth,at,phase);
  }
  function atBerth(state,ship){const b=docking().inspect(state,ship,false);return b?.kind==='berth'&&ship.port===b.port&&Math.hypot(ship.x-b.x,ship.y-b.y)<=1e-5;}
  function park(state,ship,at){
    if(!inhabited(state,ship.system)||ship.journey||['disabled','destroyed'].includes(ship.phase))return;
    const b=docking().park(state,ship,ship.system,portFor(state,ship.system,ship.port));if(!b)return;
    const phase=ship.task?.phase,status=ship.task?.status,resumeAt=ship.nextActionAt;
    if(Math.hypot(ship.x-b.x,ship.y-b.y)<=1e-5){docking().parked(state,ship);return;}
    ship.dockingMove={resumeAt};
    // Parking is movement, not a new commercial task. Preserve its outcome and deadline.
    if(!localLeg(state,ship,b,at,'parking')){delete ship.dockingMove;return;}
    if(ship.task){ship.task.phase=phase;ship.task.status=status;}
  }
  const key=(systemId,port)=>`${systemId}:${systemId===1?port:0}`;
  const portFor=(state,systemId,port)=>systemId===1?(state.solEconomy?.ports?.[port]?Number(port):3):0;
  function event(state,ship,kind,message,at=now(state),extra={}){
    ship.recentEvents||=[];ship.recentEvents.unshift({at,day:at/initialize(state).config.secondsPerDay,kind,message,...extra});
    ship.recentEvents.length=Math.min(ship.recentEvents.length,initialize(state).config.eventHistory);
    const traffic=state.civilianTraffic;traffic.log||=[];traffic.log.unshift(`${ship.name}: ${message}`);traffic.log.length=Math.min(18,traffic.log.length);
  }
  // Binary heap holds one scheduled action per ship. The saved deadline remains
  // authoritative; stale heap records are harmless and removed on pop.
  function push(heap,item){let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(heap[p].at<=item.at)break;heap[i]=heap[p];i=p;}heap[i]=item;}
  function pop(heap){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let child=i*2+1;if(child>=heap.length)break;if(child+1<heap.length&&heap[child+1].at<heap[child].at)child++;if(heap[child].at>=last.at)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;}
  function schedule(state,ship,at){ship.nextActionAt=Math.max(0,finite(at,now(state)));ship.lifeScheduleToken=(ship.lifeScheduleToken||0)+1;const rt=runtime.get(state);if(rt){push(rt.heap,{at:ship.nextActionAt,id:ship.id,token:ship.lifeScheduleToken});updateTransit(rt,ship);}window.nativeShipSystems?.refreshShip?.(state,ship,'civilian',ship.system);}
  function updateTransit(rt,ship){const present=rt.transit.has(ship);if(!!ship.journey!==present){if(ship.journey)rt.transit.add(ship);else rt.transit.delete(ship);rt.transitView=null;}
    if(ship.hull>0&&ship.phase!=='destroyed'&&(ship.journey||ship.warpVisual))trackTransit(rt,ship);else if(rt.transitSpace?.entries.has(ship))removeTransit(rt.transitSpace,ship);
    const moving=ship.hull>0&&!ship.journey&&!['destroyed','warp','arriving'].includes(ship.phase)&&!!(ship.localLeg||ship.motionKick||ship.motionSpin||ship.speed>0);if(rt.mobile.has(ship)!==moving){if(moving)rt.mobile.add(ship);else rt.mobile.delete(ship);rt.mobileView=null;}
    const previousSystem=rt.mobileLocations.get(ship),nextSystem=moving?ship.system:undefined;if(previousSystem!==nextSystem){if(previousSystem!==undefined){rt.mobileSystems.get(previousSystem)?.delete(ship);rt.mobileSystemViews.delete(previousSystem);}if(nextSystem!==undefined){let entries=rt.mobileSystems.get(nextSystem);if(!entries)rt.mobileSystems.set(nextSystem,entries=new Set());entries.add(ship);rt.mobileLocations.set(ship,nextSystem);rt.mobileSystemViews.delete(nextSystem);}else rt.mobileLocations.delete(ship);}
    const controlled=!!(ship.scriptedDemo||ship.disputeId||ship.retaliationId||ship.projectileEvade||ship.phase==='fighting'||ship.phase==='ore-theft');if(rt.controlled.has(ship)!==controlled){if(controlled)rt.controlled.add(ship);else rt.controlled.delete(ship);rt.controlledView=null;}
    const mining=['mining','collecting'].includes(ship.phase);if(rt.miners.has(ship)!==mining){if(mining)rt.miners.add(ship);else rt.miners.delete(ship);rt.minerView=null;}}
  const transitCellSize=32768;
  function transitCells(box){const minX=Math.floor(box.minX/transitCellSize),maxX=Math.floor(box.maxX/transitCellSize),minY=Math.floor(box.minY/transitCellSize),maxY=Math.floor(box.maxY/transitCellSize);return {minX,maxX,minY,maxY,count:(maxX-minX+1)*(maxY-minY+1)};}
  function removeTransit(space,ship){const previous=space.entries.get(ship);if(!previous)return;for(const key of previous.cells){const bucket=space.grid.get(key);bucket?.delete(ship);if(!bucket?.size)space.grid.delete(key);}space.entries.delete(ship);space.overflow.delete(ship);}
  function trackTransit(rt,ship){
    const journey=ship.journey,visual=ship.warpVisual,source=journey||visual;if(!source)return;
    let a,b;
    if(journey?.galaxyFrom&&journey.galaxyTo){a=journey.galaxyFrom;b=journey.galaxyTo;}
    else if(visual&&window.vexedRebirthWarp){const origin=anchor(ship.system),warp=window.vexedRebirthWarp,
      start=warp.worldEffect(visual.kind,0,visual.angle,ship.x,ship.y),end=warp.worldEffect(visual.kind,visual.kind==='departure'?warp.departureMs:warp.arrivalMs,visual.angle,ship.x,ship.y);
      a={x:origin.x+start.shipX,y:origin.y+start.shipY};b={x:origin.x+end.shipX,y:origin.y+end.shipY};
    }else return;
    const space=rt.transitSpace||={grid:new Map(),entries:new Map(),overflow:new Set()},previous=space.entries.get(ship),dimensions=window.nativeShipDefinitions.dimensions(ship,'civilian'),revision=window.nativeShipDefinitions.revision?.()||0;
    rt.transitGeometryRevision??=revision;if(previous?.source===source&&previous.ax===a.x&&previous.ay===a.y&&previous.bx===b.x&&previous.by===b.y&&previous.width===dimensions.width&&previous.height===dimensions.height&&previous.revision===revision)return;
    removeTransit(space,ship);
    const padding=Math.max(1024,Math.hypot(dimensions.width,dimensions.height)*4);
    const box={minX:Math.min(a.x,b.x)-padding,minY:Math.min(a.y,b.y)-padding,maxX:Math.max(a.x,b.x)+padding,maxY:Math.max(a.y,b.y)+padding},range=transitCells(box),entry={source,ax:a.x,ay:a.y,bx:b.x,by:b.y,box,padding,cells:[],width:dimensions.width,height:dimensions.height,revision};space.entries.set(ship,entry);
    if(range.count>4096)space.overflow.add(ship);else for(let x=range.minX;x<=range.maxX;x++)for(let y=range.minY;y<=range.maxY;y++){const key=x+':'+y;let bucket=space.grid.get(key);if(!bucket)space.grid.set(key,bucket=new Set());bucket.add(ship);entry.cells.push(key);}
    window.nativeSimulationFrame?.count(rt.state,'transitIndexAdds');
  }
  function queryTransits(state,box){
    initialize(state);const rt=runtime.get(state),space=rt.transitSpace;if(!space)return [];
    const revision=window.nativeShipDefinitions.revision?.()||0;if(rt.transitGeometryRevision!==revision){for(const ship of Array.from(space.entries.keys()))trackTransit(rt,ship);rt.transitGeometryRevision=revision;}
    if(!box||!['minX','minY','maxX','maxY'].every(key=>Number.isFinite(box[key])))return Array.from(space.entries.keys());
    const range=transitCells(box),candidates=new Set(space.overflow);
    if(range.count>4096)for(const ship of space.entries.keys())candidates.add(ship);else for(let x=range.minX;x<=range.maxX;x++)for(let y=range.minY;y<=range.maxY;y++)for(const ship of space.grid.get(x+':'+y)||[])candidates.add(ship);
    const result=[];for(const ship of candidates){const entry=space.entries.get(ship);if(!(ship.journey||ship.warpVisual)||ship.hull<=0||ship.phase==='destroyed')continue;
      let point;if(ship.journey)point=galaxyPosition(state,ship);else{const visual=ship.warpVisual,effect=window.vexedRebirthWarp.worldEffect(visual.kind,visual.elapsedMs,visual.angle,ship.x,ship.y),origin=anchor(ship.system);point={x:origin.x+effect.shipX,y:origin.y+effect.shipY};}
      const padding=entry.padding;if(point.x+padding>=box.minX&&point.x-padding<=box.maxX&&point.y+padding>=box.minY&&point.y-padding<=box.maxY)result.push(ship);}
    window.nativeSimulationFrame?.count(state,'transitSpatialQueries');window.nativeSimulationFrame?.count(state,'transitSpatialCandidates',candidates.size);return result;
  }
  function indexMove(rt,ship,oldSystem){const previous=oldSystem??rt.indexedSystems.get(ship.id);if(previous!==ship.system||!rt.bySystem.get(ship.system)?.has(ship.id)){
    if(previous!==undefined){rt.bySystem.get(previous)?.delete(ship.id);rt.memberViews.delete(previous);rt.systemRevisions.set(previous,(rt.systemRevisions.get(previous)||0)+1);}
    if(!rt.bySystem.has(ship.system))rt.bySystem.set(ship.system,new Set());rt.bySystem.get(ship.system).add(ship.id);rt.indexedSystems.set(ship.id,ship.system);rt.memberViews.delete(ship.system);rt.systemRevisions.set(ship.system,(rt.systemRevisions.get(ship.system)||0)+1);
  }updateTransit(rt,ship);window.nativeShipRepairs?.observe?.(rt.state,ship,'civilian');window.nativeShipSystems?.refreshShip?.(rt.state,ship,'civilian',ship.system);}
  function migrateShip(state,ship,life){
    window.nativeCivilianCombatAI?.traits(ship);
    if(ship.lifeVersion===1)return;
    ship.lifeVersion=1;ship.role||=stats(ship).defaultRole||'freight';
    const home=ship.homeSystem||ship.stationSystem||ship.system;
    ship.homeBase||={system:home,port:home===1?(ship.system===1?ship.port||3:3):0};
    ship.recentEvents||=[];ship.taskSequence||=0;ship.cargoOwner||=ship.id;
    const definition=stats(ship),fitted=definition.equipment.filter(id=>window.VexedMirrorWeapons?.some(w=>w.id===id&&w.damage>0));
    window.nativeWeaponLoadout?.ensure(state,ship,fitted.length?fitted:definition.capabilities.armed&&definition.capabilities.defensiveWeapon?[definition.capabilities.defensiveWeapon]:[]);
    if(ship.phase==='warp'&&ship.destinationSystem){
      const remaining=Math.max(.01,finite(ship.timer,5)),duration=Math.max(remaining,finite(ship.warpDuration,remaining));
      createJourney(state,ship,ship.destinationSystem,now(state)-(duration-remaining),duration);
    }
    // Existing cargo is already paid/loaded. Migration never withdraws it again.
    if(!ship.task&&ship.cargo){
      ship.task={id:`civilian:${ship.id}:${++ship.taskSequence}`,kind:ship.role==='trading'?'trade':'freight',phase:ship.journey?'transit':'loaded',status:'active',createdAt:ship.journey?.departedAt??now(state),reason:'Continue the saved cargo delivery',
        origin:{system:ship.cargo.fromSystem||ship.system,port:ship.cargo.fromPort||ship.port||0},destination:{system:ship.cargo.toSystem||ship.system,port:ship.cargo.toPort||0},requirements:{good:ship.cargo.good,tons:ship.cargo.tons},progress:0};
    }
    if(!ship.task&&ship.journey){ship.task={id:`civilian:${ship.id}:${++ship.taskSequence}`,kind:'reposition',status:'active',phase:'transit',createdAt:ship.journey.departedAt,reason:'Continue the saved interstellar journey',origin:{system:ship.journey.origin,port:ship.port||0},destination:{system:ship.journey.destination,port:ship.journey.destination===1?3:0},requirements:{},progress:0};}
    if(!ship.task&&['mining-flight','mining','collecting'].includes(ship.phase)&&ship.miningRockSlot!==undefined){
      const rock=window.nativeSolAsteroids?.placements?.find(r=>r.slotId===ship.miningRockSlot),phase=ship.phase;
      if(rock){ship.task={id:`civilian:${ship.id}:${++ship.taskSequence}`,kind:'mining',status:'active',phase,createdAt:now(state),reason:'Continue the saved mining claim',origin:{system:ship.system,port:ship.port},destination:{system:1,port:1},requirements:{rockId:rock.slotId,capacity:capacity(ship)},progress:0};
        ship.miningReservation=rock.slotId;life.reservations[`rock:${rock.slotId}`]={owner:ship.id,taskId:ship.task.id};
        if(phase==='mining-flight')localLeg(state,ship,{x:ship.goalX??rock.x+110,y:ship.goalY??rock.y+40},now(state),phase);
        else ship.nextActionAt=now(state)+Math.max(0,finite(ship.timer));}
    }
    if(!ship.task&&!ship.journey){ship.phase=['disabled','destroyed'].includes(ship.phase)?ship.phase:'docked';ship.nextActionAt=now(state)+Math.max(0,finite(ship.timer,ship.id%5));}
    else ship.nextActionAt=ship.journey?.arrivalAt??ship.nextActionAt??now(state);
    ship.lifeScheduleToken||=1;
    delete ship.warpVisual;delete ship.warpResumePhase;delete ship.encounterApproach;
  }
  function initialize(state){
    if(!state.civilianTraffic?.ships)window.nativeCivilianTraffic.initialize(state);
    const traffic=state.civilianTraffic;
    const life=traffic.life||={version:1,config:{...DEFAULTS},markets:{},reservations:{},strandedCargo:[],transactionSequence:0,metrics:{}};
    if(life.configVersion!==2){life.config={...DEFAULTS,...life.config};life.configVersion=2;}life.markets||={};life.reservations||={};life.strandedCargo||=[];life.metrics||={};
    if(minerals()&&life.regionalVersion!==1){
      life.regionalVersion=1;life.config.connectedSystems=world.systems.map(s=>s.id);
      // Preserve existing tasks, poses, cargo and racial homes. Operating bases
      // remember where each existing crew was stationed, without seeding ships.
      const resident=new Set();
      for(const ship of traffic.ships){
        ship.operatingBase??=Number(ship.stationSystem||ship.homeBase?.system||ship.system);
        if(!inhabited(state,ship.operatingBase))ship.operatingBase=access().nearestHome(state,ship.operatingBase)??1;
        if(!resident.has(ship.operatingBase)&&permits(ship,'mining')&&stats(ship).capabilities.canMine!==false){ship.regionalResident=true;resident.add(ship.operatingBase);}
      }
    }
    life.economicLedger||={version:1,produced:costs.map(()=>0),consumed:costs.map(()=>0),householdSpending:0,cycles:0};
    life.economicLedger.initialMarketCredits??=0;life.economicLedger.initialMarketGoods||=costs.map(()=>0);
    life.economicLedger.lost||=costs.map(()=>0);
    life.config.secondsPerDay=window.nativeWorldTime?.secondsPerDay||120;
    const collection=window.nativeShipSystems?.observeCollection?.(traffic,'ships');let rt=runtime.get(state);
    if(!rt||rt.ships!==traffic.ships||rt.count!==traffic.ships.length||collection&&rt.collectionRevision!==collection.revision){
      rt={state,ships:traffic.ships,count:traffic.ships.length,collectionRevision:collection?.revision,initializing:true,byId:new Map(),bySystem:new Map(),indexedSystems:new Map(),memberViews:new Map(),systemRevisions:new Map(),transit:new Set(),transitView:null,mobile:new Set(),mobileView:null,mobileSystems:new Map(),mobileLocations:new Map(),mobileSystemViews:new Map(),controlled:new Set(),controlledView:null,miners:new Set(),minerView:null,heap:[],lastNow:now(state),stats:{detailedShips:0,distantUpdates:0,scheduledEvents:0,backlog:0,simulationMs:0}};
      runtime.set(state,rt);
      for(const ship of traffic.ships){migrateShip(state,ship,life);rt.byId.set(ship.id,ship);indexMove(rt,ship);if(Number.isFinite(ship.nextActionAt))push(rt.heap,{at:ship.nextActionAt,id:ship.id,token:ship.lifeScheduleToken});}
      for(const m of Object.values(life.markets))if(m.system===1&&state.solEconomy){state.solEconomy.stockReserved||={};state.solEconomy.stockReserved[m.port]=m.reserved;state.solEconomy.incomingReserved||={};state.solEconomy.incomingReserved[m.port]=m.incoming;m.stock=state.solEconomy.ports[m.port]||m.stock;}
      migrateContracts(state,life,rt);
      docking().reconcile(state);
      for(const ship of traffic.ships)if(ship.dockingVersion!==1){
        ship.dockingVersion=1;
        if(ship.task&&!ship.journey&&!ship.localLeg&&!ship.combatInterruption&&!['disabled','destroyed'].includes(ship.phase)){
          ship.needsDockRecovery=true;ship.dockRecoveryResumeAt=ship.nextActionAt;schedule(state,ship,now(state));
        }
      }
      rt.initializing=false;
    }
    if(minerals()&&!life.regionalMarketsInitialized){
      life.regionalMarketsInitialized=true;
      for(const entry of world.systems)for(const port of portsIn(state,entry.id))market(state,entry.id,port);
    }
    if(access()&&!rt.initializing&&!rt.accessAuditing&&!rt.accessSignature)auditAccess(state,life,rt);
    return life;
  }
  function miningVisit(state,ship){
    const job=ship.task;if(job?.kind!=='mining'||job.status!=='active')return false;
    if(['disabled','destroyed'].includes(ship.phase)||ship.hull<=0)return false;
    if(ship.journey)return job.phase==='transit'&&inhabited(state,ship.journey.destination);
    if(!['mining-flight','mining','collecting'].includes(job.phase))return false;
    const rock=rockById(job.requirements?.rockId,ship.system);
    if(!rock||access()?.blocked(rock.system??ship.system))return false;
    const claim=state.civilianTraffic.life.reservations[`rock:${rock.slotId}`];
    return claim?.owner===ship.id&&(job.phase==='collecting'?!!state.asteroidOreDrops?.[rock.slotId]:!state.minedAsteroids?.includes(rock.slotId)&&!state.destroyedAsteroids?.includes(rock.slotId));
  }
  function auditAccess(state,life,rt){
    const policy=access(),signature=policy.signature(state);if(rt.accessAuditing||rt.accessSignature===signature)return;
    rt.accessAuditing=true;rt.accessSignature=signature;life.civilianAccessVersion=1;
    life.config.connectedSystems=policy.markets(state);
    try{
      for(const ship of state.civilianTraffic.ships){
        // A claimed medical rescue may enter an empty or excluded system solely
        // to reach this casualty. It grants no residency, market or mining access.
        if(window.nativeShipRepairs?.claimed(state,ship)||medical(ship)&&ship.task?.status==='active'&&ship.task.requirements?.medicalReturn&&inhabited(state,ship.task.destination.system))continue;
        const safe=policy.nearestHome(state,ship.system);if(!safe)continue;
        const base=inhabited(state,ship.operatingBase)?ship.operatingBase:inhabited(state,ship.stationSystem)?ship.stationSystem:safe;
        ship.operatingBase=base;
        if(!inhabited(state,ship.stationSystem))ship.stationSystem=base;
        if(!inhabited(state,ship.homeBase?.system))ship.homeBase={system:base,port:base===1?3:0};
        const job=ship.task,visit=miningVisit(state,ship),outboundMine=job?.kind==='mining'&&job.phase==='mining-transit'&&ship.journey&&!policy.blocked(ship.journey.destination)&&job.requirements.miningSystem===ship.journey.destination;
        // An old regional miner may still target a fabricated empty refinery.
        if(visit&&!inhabited(state,job.destination.system))job.destination={system:base,port:base===1?3:0};
        const invalidHere=policy.blocked(ship.system)||!inhabited(state,ship.system)&&!visit;
        const invalidTrip=ship.journey&&(policy.blocked(ship.journey.destination)||!inhabited(state,ship.journey.destination)&&!outboundMine);
        const invalidJob=job?.status==='active'&&job.kind!=='mining'&&(!inhabited(state,job.destination?.system)||!ship.cargo&&!inhabited(state,job.origin?.system));
        if(!invalidHere&&!invalidTrip&&!invalidJob)continue;
        const original=ship.system,phase=ship.phase;
        interrupt(state,ship,'Civilian access policy: prohibited destination or empty-system commerce');
        delete ship.journey;delete ship.destinationSystem;delete ship.needsDockRecovery;delete ship.dockRecoveryResumeAt;delete ship.miningRockSlot;
        delete ship.scriptedDemo;delete ship.disputeId;delete ship.retaliationId;
        if(invalidHere||invalidTrip){
          ship.system=safe;ship.port=safe===1?3:0;
          const point=docking().relocate(state,ship,safe,ship.port);if(!point)throw Error('No clear civilian refuge position available');
          Object.assign(ship,{x:point.x,y:point.y,speed:0});docking().parked(state,ship);
          ship.previousX=ship.x;ship.previousY=ship.y;indexMove(rt,ship,original);
          event(state,ship,'relocated',`Existing crew relocated from ${system(original)?.name} to ${system(safe)?.name}; cargo and credits retained`);
        }
        if(['disabled','destroyed'].includes(phase)){ship.phase=phase;ship.nextActionAt=null;}
        else schedule(state,ship,now(state)+.01);
      }
      // Tactical fixtures from old saves must not keep ships at forbidden worlds.
      state.civilianTraffic.disputes=state.civilianTraffic.disputes.filter(d=>!policy.blocked(d.system));
      state.civilianTraffic.retaliations=state.civilianTraffic.retaliations.filter(d=>!policy.blocked(d.system));
    }finally{rt.accessAuditing=false;}
  }
  function market(state,systemId,port=0){
    port=portFor(state,systemId,port);
    const life=initialize(state),id=key(systemId,port);let m=life.markets[id];
    if(!m){
      const specialty=systemId===1?(port===3?5:port===4?1:port===5?2:port===1?0:4):systemId%costs.length;
      m=life.markets[id]={id,system:systemId,port:systemId===1?port:0,credits:25000,stock:costs.map((_,g)=>g===specialty?120:12),reserved:costs.map(()=>0),incoming:costs.map(()=>0),fundsReserved:0,target:costs.map((_,g)=>g===specialty?30:60),specialty,lastEconomyAt:now(state)};
      life.economicLedger.initialMarketCredits+=m.credits;
      if(systemId!==1)for(let good=0;good<costs.length;good++)life.economicLedger.initialMarketGoods[good]+=m.stock[good];
    }
    m.incoming||=costs.map(()=>0);m.fundsReserved=finite(m.fundsReserved);
    if(minerals()&&m.regionalMarketVersion!==1){m.regionalMarketVersion=1;m.target[0]=Math.max(160,finite(m.target[0]));}
    // Sol goods are the SAME inventory used by the player and existing tugs.
    if(systemId===1&&state.solEconomy?.ports?.[port]){m.stock=state.solEconomy.ports[port];state.solEconomy.stockReserved||={};state.solEconomy.stockReserved[port]=m.reserved;state.solEconomy.incomingReserved||={};state.solEconomy.incomingReserved[port]=m.incoming;}
    marketStates.set(m,state);return m;
  }
  const available=(m,g)=>Math.max(0,finite(m.stock[g])-finite(m.reserved[g]));
  const cargoTons=ship=>finite(ship.cargo?.tons)+finite(ship.oreHold);
  const capacity=ship=>Math.max(0,finite(stats(ship).cargo)-cargoTons(ship)-finite(ship.repairDeuranium));
  const oreGood=type=>minerals()?.goodForOre(type)??0;
  const medicalOre=ship=>medical(ship)&&ship.cargo?.oreType==='deuranium'&&ship.cargo.raw===true;
  const buyPrice=(m,g)=>costs[g];
  const sellPrice=(m,g,oreType)=>g===0&&minerals()?.ores[oreType]?minerals().orePrice(m.system,oreType):Math.ceil(costs[g]*(finite(m.stock[g])<m.target[g]?1.35:1));
  const availableFunds=m=>Math.max(0,finite(m.credits)-finite(m.fundsReserved));
  const demand=(m,g)=>{
    const tugs=m.system===1?marketStates.get(m)?.solEconomy?.freighters||[]:[];
    const companyIncoming=tugs.reduce((n,ship)=>n+(!['disabled','destroyed'].includes(ship.phase)&&ship.assignment?.to===m.port&&ship.assignment.good===g?finite(ship.assignment.tons):0),0);
    return Math.max(0,finite(m.target[g])-finite(m.stock[g])-finite(m.incoming?.[g])-companyIncoming);
  };
  // One atomic settlement for player retail and owned civilian freight. Quotes
  // are policy; this boundary owns the actual conserved inventory/credit transfer.
  function exchange(state,m,actor,{good,tons,payment,buy,player=false,free=false,capacity:room=0,reservationId,cargo,mineral,repairSupplies=false}){
    if(repairSupplies&&(player||!buy||good!==7))return {ok:false,error:'Invalid repair supply purchase.'};
    if(!player&&!inhabited(state,m.system))return {ok:false,error:'Civilians cannot trade at prohibited or uninhabited worlds.'};
    // Medical refining can leave real fractional freight and its already
    // funded fractional payment. Ordinary retail quotes still choose whole
    // lots; the common settlement must conserve the quantities actually owned.
    if(!Number.isInteger(good)||!costs[good]||!Number.isFinite(tons)||tons<=0||tons>Number.MAX_SAFE_INTEGER||!Number.isFinite(payment)||payment<0||payment>Number.MAX_SAFE_INTEGER)return {ok:false,error:'Invalid cargo transaction.'};
    const reservation=reservationId?initialize(state).reservations[reservationId]:null;
    if(reservationId&&(!reservation||reservation.owner!==actor.id||reservation.good!==good||reservation.tons!==tons))return {ok:false,error:'Cargo contract no longer matches.'};
    const ownStock=reservation?.sourceReserved!==false&&reservation?.system===m.system&&reservation?.port===m.port?reservation.tons:0;
    const ownFunds=reservation?.destinationReserved&&reservation.destination.system===m.system&&reservation.destination.port===m.port?reservation.payment:0;
    const funded=ownFunds>0&&reservation.payment===payment;
    if(mineral&&(!player||buy||good!==oreGood(mineral)||!minerals()?.ores[mineral]))return {ok:false,error:'Invalid mineral refinery transaction.'};
    const creditKey=player?'latinum':'credits',balance=finite(actor[creditKey]),held=mineral?minerals().held(actor,mineral):player?finite(actor.solFreightHold?.[good]):actor.cargo?.good===good?finite(actor.cargo.tons):0;
    if(buy){
      if(available(m,good)+ownStock<tons)return {ok:false,error:'The port does not have that much unreserved cargo.'};
      if(room<tons)return {ok:false,error:'Your cargo hold is full.'};
      if(!free&&balance<payment)return {ok:false,error:'Not enough latinum.'};
    }else{
      if(held<tons)return {ok:false,error:'You do not have that much cargo aboard.'};
      if(!coversFunds(m.credits,payment,funded)||!coversFunds(availableFunds(m)+ownFunds,payment,funded))return {ok:false,error:'The port has insufficient unreserved purchasing funds.'};
      if(finite(m.stock[good])+finite(m.incoming[good])-(ownFunds?reservation.tons:0)+tons>9999)return {ok:false,error:'The port has insufficient unreserved storage space.'};
    }
    // All checks precede all mutations. A saved result contains only settled
    // balances; there is no pending callback or replayable payment to restore.
    m.stock[good]+=buy?-tons:tons;
    // The check above permits only bounded rounding dust. Preserve the accepted
    // payment and canonicalize its tiny negative subtraction to zero.
    m.credits=buy?m.credits+payment:Math.max(0,m.credits-payment);
    if(!free)actor[creditKey]=balance+(buy?-payment:payment);
    else state.solEconomy.flows.devPurchaseSubsidy=(state.solEconomy.flows.devPurchaseSubsidy||0)+payment;
    if(mineral){if(mineral==='dilithium')actor.dilithium=held-tons;else{actor.minerals||={};actor.minerals[mineral]=held-tons;}const ledger=initialize(state).economicLedger;ledger.playerMineralsRefined||={};ledger.playerMineralsRefined[mineral]=finite(ledger.playerMineralsRefined[mineral])+tons;}
    else if(player){actor.solFreightHold||={};actor.solFreightHold[good]=held+(buy?tons:-tons);}
    else if(repairSupplies){actor.repairDeuranium=finite(actor.repairDeuranium)+tons;actor.repairSupplySpent=finite(actor.repairSupplySpent)+payment;}
    else if(buy)actor.cargo={...cargo,good,tons,owner:actor.id,purchasedFor:payment};
    else if(held===tons)actor.cargo=null;else actor.cargo.tons-=tons;
    return {ok:true,payment,tons};
  }
  function release(state,ship,sourceOnly=false){
    const life=initialize(state),reservation=life.reservations[ship.task?.id];if(!reservation)return;
    if(reservation.sourceReserved!==false){const source=market(state,reservation.system,reservation.port);source.reserved[reservation.good]=Math.max(0,finite(source.reserved[reservation.good])-reservation.tons);reservation.sourceReserved=false;}
    if(sourceOnly)return;
    if(reservation.destinationReserved){const destination=market(state,reservation.destination.system,reservation.destination.port);destination.incoming[reservation.good]=Math.max(0,finite(destination.incoming[reservation.good])-reservation.tons);destination.fundsReserved=Math.max(0,finite(destination.fundsReserved)-reservation.payment);reservation.destinationReserved=false;}
    delete life.reservations[ship.task.id];
  }
  function reserveBuyer(state,ship,destination,at){
    if(!inhabited(state,destination.system))return false;
    const cargo=ship.cargo,job=ship.task;if(!cargo||cargo.tons<=0)return false;
    // An Olympic's own mined reserves need a real refinery berth, not a buyer
    // or treasury escrow. The material remains owned aboard throughout travel.
    if(medicalOre(ship)){job.destination={system:destination.system,port:destination.port};cargo.toSystem=destination.system;cargo.toPort=destination.port;return true;}
    const payment=cargo.tons*sellPrice(destination,cargo.good,cargo.oreType);
    if(demand(destination,cargo.good)<cargo.tons||availableFunds(destination)<payment)return false;
    release(state,ship);
    const reservation={version:2,owner:ship.id,system:job.origin.system,port:job.origin.port,good:cargo.good,tons:cargo.tons,sourceReserved:false,destination:{system:destination.system,port:destination.port},destinationReserved:true,payment,unitPrice:payment/cargo.tons};
    initialize(state).reservations[job.id]=reservation;destination.incoming[cargo.good]+=cargo.tons;destination.fundsReserved+=payment;
    job.agreement={version:1,unitBuyPrice:cargo.purchasedFor?cargo.purchasedFor/cargo.tons:0,unitSellPrice:reservation.unitPrice,payment,acceptedAt:at};
    job.destination={...reservation.destination};cargo.toSystem=destination.system;cargo.toPort=destination.port;return true;
  }
  function migrateContracts(state,life,rt){
    // Reconstruct counters from saved contracts. This also repairs old saves whose
    // loading reservation was discarded while destination payment was unfunded.
    for(const m of Object.values(life.markets)){m.reserved=costs.map(()=>0);m.incoming=costs.map(()=>0);m.fundsReserved=0;marketStates.set(m,state);if(m.system===1&&state.solEconomy){state.solEconomy.stockReserved||={};state.solEconomy.stockReserved[m.port]=m.reserved;state.solEconomy.incomingReserved||={};state.solEconomy.incomingReserved[m.port]=m.incoming;}}
    const saved=life.reservations;life.reservations={};
    for(const [id,reservation] of Object.entries(saved))if(id.startsWith('rock:'))life.reservations[id]=reservation;
    // Restore every existing escrow before offering any uncontracted cargo a
    // buyer. Array order must not let a legacy delivery spend another ship's
    // already committed treasury after reload.
    for(const ship of rt.byId.values()){
      const job=ship.task,old=saved[job?.id];if((job?.kind==='medical'||job?.requirements?.medicalReturn)||job?.status!=='active'||job.deliveredAt!==undefined||old?.version!==2||!old.destinationReserved)continue;
      if(!inhabited(state,old.destination.system)||old.sourceReserved!==false&&!inhabited(state,old.system))continue;
      old.port=portFor(state,old.system,old.port);old.destination.port=portFor(state,old.destination.system,old.destination.port);
      const destination=market(state,old.destination.system,old.destination.port);
      life.reservations[job.id]=old;if(old.sourceReserved!==false)market(state,old.system,old.port).reserved[old.good]+=old.tons;
      destination.incoming[old.good]+=old.tons;destination.fundsReserved+=old.payment;
    }
    for(const ship of rt.byId.values()){
      const job=ship.task;if((job?.kind==='medical'||job?.requirements?.medicalReturn)||job?.status!=='active'||job.deliveredAt!==undefined)continue;
      if(job.kind!=='mining'&&(!inhabited(state,job.destination?.system)||!ship.cargo&&!inhabited(state,job.origin?.system)))continue;
      if(ship.localLeg){const result=window.nativeShipMotion.sampleLeg({...ship},ship.localLeg,now(state));
        if(result.invalid){interrupt(state,ship,'invalid route');continue;}
        if(!Number.isFinite(ship.nextActionAt))schedule(state,ship,result.arrived?now(state):ship.localLeg.startedAt+ship.localLeg.duration);}
      if(job.origin)job.origin.port=portFor(state,job.origin.system,job.origin.port);
      if(job.destination)job.destination.port=portFor(state,job.destination.system,job.destination.port);
      if(ship.cargo){ship.cargo.toPort=portFor(state,ship.cargo.toSystem??job.destination.system,ship.cargo.toPort);ship.cargo.fromPort=portFor(state,ship.cargo.fromSystem??job.origin.system,ship.cargo.fromPort);}
      if(medicalOre(ship))continue;
      const old=saved[job.id],good=ship.cargo?.good??job.requirements?.good,tons=ship.cargo?.tons??old?.tons??job.requirements?.tons;
      if(!Number.isInteger(good)||!costs[good]||!(tons>0)||(!ship.cargo&&!old))continue;
      const destination=market(state,job.destination.system,job.destination.port),source=ship.cargo?null:market(state,job.origin.system,job.origin.port);
      if(old?.version===2&&old.destinationReserved){
        // Already installed by the priority pass above.
      }else if(ship.cargo){
        if(!reserveBuyer(state,ship,destination,now(state))){
          job.recovery||={version:1,startedAt:now(state),deadlineAt:now(state)+life.config.paymentRecoverySeconds,attempts:0,reason:'Legacy delivery had no funded purchasing contract'};
          if(!ship.journey&&!ship.localLeg){job.phase='waiting-payment';schedule(state,ship,now(state));}
        }
      }else{
        const payment=tons*sellPrice(destination,good);
        if(available(source,good)>=tons&&demand(destination,good)>=tons&&availableFunds(destination)>=payment){
          const reservation={...old,version:2,sourceReserved:true,destination:{system:destination.system,port:destination.port},destinationReserved:true,payment,unitPrice:payment/tons};
          life.reservations[job.id]=reservation;source.reserved[good]+=tons;destination.incoming[good]+=tons;destination.fundsReserved+=payment;
          job.agreement={version:1,unitBuyPrice:job.requirements.credits/tons,unitSellPrice:payment/tons,payment,acceptedAt:now(state)};
        }else{job.status='failed';job.phase='interrupted';job.failureReason='Legacy unfunded contract cancelled before loading';ship.phase='docked';delete ship.localLeg;schedule(state,ship,now(state));}
      }
    }
    life.contractVersion=2;
    life.nextEconomyAt??=now(state)+life.config.economyInterval;
  }
  function task(state,ship,kind,reason,origin,destination,requirements={},at=now(state)){
    ship.task={id:`civilian:${ship.id}:${++ship.taskSequence}`,kind,status:'active',phase:'selecting',reason,origin,destination,requirements,createdAt:at,progress:0,
      completion:({mining:'Reserved asteroid entitlement is transferred to hold',repair:'Paid hull and shield service completes',idle:'Retry useful work after the scheduled rest',reposition:'Reach and dock at the saved destination'})[kind]||'Dock at destination and transfer the loaded goods once',failure:['destroyed','disabled','goods unavailable','insufficient credits']};
    event(state,ship,'task',reason,at,{taskId:ship.task.id});return ship.task;
  }
  function startDelivery(state,id,options={}){
    initialize(state);const ship=find(state,id);if(!ship||ship.journey||ship.dockingMove||cargoTons(ship)>0||['destroyed','disabled'].includes(ship.phase))return {ok:false,error:'Ship unavailable or carrying cargo.'};
    if(!Number.isFinite(ship.x)||!Number.isFinite(ship.y)){interrupt(state,ship,'invalid route');return {ok:false,error:'Invalid loading route.'};}
    const fromSystem=Number(options.fromSystem??ship.system),fromPort=portFor(state,fromSystem,Number(options.fromPort??(fromSystem===1?ship.port||3:0)));
    if(ship.system!==fromSystem)return {ok:false,error:'Ship is not at the loading system.'};
    const at=finite(options.at,now(state)),toSystem=Number(options.toSystem??initialize(state).config.connectedSystems.find(s=>s!==fromSystem)),good=Number(options.good??5);
    if(!Number.isInteger(good)||!costs[good]||!system(fromSystem)||!system(toSystem))return {ok:false,error:'Choose a valid commodity and market.'};
    if(!inhabited(state,fromSystem)||!inhabited(state,toSystem))return {ok:false,error:'Civilian freight requires permitted inhabited ports.'};
    const candidates=portsIn(state,toSystem).map(port=>market(state,toSystem,port));
    const chosen=options.toPort===undefined?candidates.filter(m=>m.system!==fromSystem||m.port!==fromPort).sort((a,b)=>Math.min(demand(b,good),availableFunds(b)/sellPrice(b,good))-Math.min(demand(a,good),availableFunds(a)/sellPrice(a,good)))[0]?.port:options.toPort;
    const toPort=portFor(state,toSystem,Number(chosen));
    if(!Number.isInteger(good)||!costs[good]||!system(fromSystem)||!system(toSystem)||fromSystem===toSystem&&fromPort===toPort)return {ok:false,error:'Choose a valid commodity and distinct market.'};
    const source=market(state,fromSystem,fromPort),destination=market(state,toSystem,toPort),unitBuyPrice=buyPrice(source,good),unitSellPrice=sellPrice(destination,good),tons=Math.floor(Math.min(finite(options.tons,8),capacity(ship),available(source,good),demand(destination,good),Math.floor(ship.credits/unitBuyPrice),Math.floor(availableFunds(destination)/unitSellPrice)));
    if(tons<=0)return {ok:false,error:'No affordable unreserved stock, purchasing funds or unmet demand.'};
    if(ship.task?.status==='active')release(state,ship);
    const job=task(state,ship,ship.role==='trading'?'trade':'freight',options.reason||`${toSystem===1?window.nativeSolEconomy.names[toPort]:system(toSystem)?.name||toSystem} needs ${window.nativeSolEconomy.goods[good]}; available stock and payment verified`,{system:fromSystem,port:fromPort},{system:toSystem,port:toPort},{good,tons,credits:tons*buyPrice(source,good)},at);
    source.reserved[good]=finite(source.reserved[good])+tons;
    const payment=tons*unitSellPrice;destination.incoming[good]+=tons;destination.fundsReserved+=payment;
    job.agreement={version:1,unitBuyPrice,unitSellPrice,payment,acceptedAt:at};
    initialize(state).reservations[job.id]={version:2,system:fromSystem,port:fromPort,good,tons,owner:ship.id,sourceReserved:true,destination:{system:toSystem,port:toPort},destinationReserved:true,payment,unitPrice:unitSellPrice};
    approachDock(state,ship,fromPort,at,'loading');
    return {ok:true,shipId:ship.id,taskId:job.id,tons,good,origin:job.origin,destination:job.destination};
  }
  function chooseDelivery(state,ship,at){
    if(!inhabited(state,ship.system))return {ok:false};
    const life=initialize(state),from=ship.system,port=portFor(state,from,ship.port);
    const allowed=new Set(life.config.connectedSystems),routes=minerals()?minerals().neighbors(from,6).filter(id=>allowed.has(id)):life.config.connectedSystems;
    const source=market(state,from,port),connected=[...new Set([from,...routes,ship.operatingBase??ship.homeBase.system])];let best=null;
    for(const to of connected){if(!system(to)||!inhabited(state,to))continue;
      for(const toPort of portsIn(state,to)){
        if(to===from&&toPort===port)continue;
        const destination=market(state,to,toPort),a=docking().center(from,port),b=docking().center(to,toPort);
        const distance=Math.hypot(anchor(to).x+b.x-anchor(from).x-a.x,anchor(to).y+b.y-anchor(from).y-a.y);
        for(let good=0;good<costs.length;good++){
          const tons=Math.floor(Math.min(16,capacity(ship),available(source,good),demand(destination,good),ship.credits/buyPrice(source,good),availableFunds(destination)/sellPrice(destination,good)));
          if(tons<=0)continue;
          const baseDistance=minerals()?minerals().distance(to,ship.operatingBase??from)*1000:0;
          const score=tons*(sellPrice(destination,good)-buyPrice(source,good)+2)/(1+distance/(minerals()?25000:100000))/(1+baseDistance/80000);
          if(!best||score>best.score)best={to,toPort,good,tons,score};
        }
      }
    }
    return best?startDelivery(state,ship.id,{fromSystem:from,fromPort:port,toSystem:best.to,toPort:best.toPort,good:best.good,tons:best.tons,at}):{ok:false};
  }
  function localLeg(state,ship,goal,at,phase){
    delete ship.trafficControl;
    const definition=stats(ship),configured=definition.profile?.movement??definition.movement;
    const profile=typeof configured==='function'?configured(state,ship,definition):configured||window.nativeShipMotion.profiles.civilian(definition);
    ship.localLeg=window.nativeShipMotion.planLeg(ship,goal,profile,at);
    if(ship.localLeg.valid===false){interrupt(state,ship,'invalid route',at);return false;}
    ship.phase=phase==='mining-flight'?'mining-flight':'cruise';
    ship.goalX=goal.x;ship.goalY=goal.y;ship.task.phase=phase;schedule(state,ship,at+ship.localLeg.duration);
    return true;
  }
  function arriveLeg(state,ship,at){const result=window.nativeShipMotion.sampleLeg(ship,ship.localLeg,at);if(result.invalid){interrupt(state,ship,'invalid route',at);return false;}if(!result.arrived){schedule(state,ship,Math.max(at+.001,ship.localLeg.startedAt+ship.localLeg.duration));return false;}return true;}
  function createJourney(state,ship,destination,at,durationOverride){
    const config=initializeConfig(state),origin=ship.system,a=anchor(origin),b=anchor(destination),from={x:ship.x,y:ship.y};
    const miningTrip=ship.task?.kind==='mining'&&ship.task.requirements?.miningSystem===destination&&ship.task.minedAt===undefined;
    const rock=miningTrip?rockById(ship.task.requirements.rockId,destination):null;
    const rescue=window.nativeShipRepairs?.claimed(state,ship);
    const approach=rescue?window.nativeShipRepairs.rendezvous(state,rescue,ship):rock?{x:rock.x+110,y:rock.y+40}:docking().center(destination,ship.task?.destination?.port??ship.cargo?.toPort??(destination===1?3:0)),direction=Math.atan2(b.y-a.y,b.x-a.x);
    const to=rock?approach:{x:approach.x-Math.cos(direction)*1400,y:approach.y-Math.sin(direction)*1400};
    const galaxyFrom={x:a.x+from.x,y:a.y+from.y},galaxyTo={x:b.x+to.x,y:b.y+to.y},distance=Math.hypot(galaxyTo.x-galaxyFrom.x,galaxyTo.y-galaxyFrom.y);
    const warpFactor=Math.max(.5,finite(stats(ship).warp,finite(stats(ship).warpSpeed,1))),speed=config.warpUnitsPerSecond*warpFactor/config.warpGameplayScale;
    const duration=durationOverride??Math.max(config.minJourneySeconds,distance/speed);
    ship.journey={version:1,origin,destination,route:[origin,destination],departedAt:at,duration,arrivalAt:at+duration,progress:0,from,to,galaxyFrom,galaxyTo,distance,speed,elapsedDays:duration/config.secondsPerDay};
    ship.destinationSystem=destination;ship.phase='warp';window.nativeShipMotion.stop(ship);ship.warpDuration=duration;ship.timer=duration;
    return ship.journey;
  }
  // Migration may create a journey before initialize has finished its index.
  function initializeConfig(state){return state.civilianTraffic.life?.config||DEFAULTS;}
  function depart(state,ship,at){
    docking().release(state,ship);delete ship.dockIntent;delete ship.dockingMove;
    if(ship.task.destination.system===ship.system){approachDock(state,ship,ship.task.destination.port,at,'unloading');return;}
    const journey=createJourney(state,ship,ship.task.destination.system,at);ship.task.phase='transit';schedule(state,ship,journey.arrivalAt);
    event(state,ship,'departure',`Departed ${system(journey.origin)?.name} for ${system(journey.destination)?.name}`,at);
  }
  function load(state,ship,at){
    if(!atBerth(state,ship)){approachDock(state,ship,ship.task.origin.port,at,'loading');return;}
    window.nativeShipRepairs?.restock(state,ship);
    const job=ship.task,reservation=initialize(state).reservations[job.id],source=market(state,job.origin.system,job.origin.port);
    if(!reservation||finite(source.stock[reservation.good])<reservation.tons||ship.credits<job.requirements.credits||capacity(ship)<reservation.tons){interrupt(state,ship,'goods unavailable',at);return;}
    const settled=exchange(state,source,ship,{good:reservation.good,tons:reservation.tons,payment:job.requirements.credits,buy:true,capacity:capacity(ship),reservationId:job.id,
      cargo:{fromSystem:job.origin.system,fromPort:job.origin.port,toSystem:job.destination.system,toPort:job.destination.port,transactionId:`load:${job.id}`}});
    if(!settled.ok){interrupt(state,ship,settled.error,at);return;}
    release(state,ship,true);job.loadedAt=at;job.phase='loaded';
    event(state,ship,'loaded',`Loaded ${ship.cargo.tons} t ${window.nativeSolEconomy.goods[ship.cargo.good]}`,at,{stock:source.stock[ship.cargo.good],transactionId:ship.cargo.transactionId});depart(state,ship,at);
  }
  function unload(state,ship,at){
    if(!atBerth(state,ship)){approachDock(state,ship,ship.task.destination.port,at,'unloading');return;}
    const job=ship.task;if(job.deliveredAt!==undefined)return finish(state,ship,at);
    const cargo=ship.cargo;if(!cargo||cargo.toSystem!==ship.system){interrupt(state,ship,'cargo unavailable',at);return;}
    if(cargo.raw&&cargo.oreType==='deuranium'){
      const ledger=initialize(state).economicLedger;
      ledger.npcMineralsRefined||={};ledger.npcMineralsRefined.deuranium=finite(ledger.npcMineralsRefined.deuranium)+cargo.tons;
      cargo.raw=false;
      if(medical(ship)){
        let kept=Math.min(cargo.tons,Math.max(0,policy(ship).supplies.target-finite(ship.repairDeuranium)));
        // Complete a numerically exact refill without discarding a tiny owned
        // remainder or creating an endless dust-sized purchasing contract.
        if(cargo.tons-kept<=quantityEpsilon)kept=cargo.tons;
        ship.repairDeuranium=finite(ship.repairDeuranium)+kept;cargo.tons-=kept;
        ship.repairMined=finite(ship.repairMined)+kept;
        event(state,ship,'refined',`Refined ${kept} t mined deuranium into owned medical reserves`,at);
        if(!cargo.tons){ship.cargo=null;job.deliveredAt=at;job.deliveredTons=kept;return finish(state,ship,at);}
      }
    }
    window.nativeShipRepairs?.restock(state,ship);
    let reservation=initialize(state).reservations[job.id];
    const destination=market(state,job.destination.system,job.destination.port);
    if(!reservation?.destinationReserved){if(!reserveBuyer(state,ship,destination,at)){recoverPayment(state,ship,at);return;}reservation=initialize(state).reservations[job.id];}
    const payment=reservation.payment;
    if(reservation.destination.system!==ship.system||reservation.destination.port!==ship.port||reservation.good!==cargo.good||reservation.tons!==cargo.tons||!coversFunds(destination.credits,payment,reservation.owner===ship.id)){release(state,ship);recoverPayment(state,ship,at);return;}
    const settled=exchange(state,destination,ship,{good:cargo.good,tons:cargo.tons,payment,buy:false,reservationId:job.id});
    if(!settled.ok){release(state,ship);recoverPayment(state,ship,at);return;}
    release(state,ship);
    job.deliveredAt=at;job.deliveredTons=cargo.tons;job.payment=payment;job.transactionId=`unload:${job.id}`;ship.deliveries=finite(ship.deliveries)+1;
    event(state,ship,'delivered',`Delivered ${cargo.tons} t ${window.nativeSolEconomy.goods[cargo.good]} and received ${payment} credits`,at,{transactionId:job.transactionId,stock:destination.stock[cargo.good]});
    ship.cargo=null;finish(state,ship,at);
  }
  function recoverPayment(state,ship,at){
    const life=initialize(state),job=ship.task,cargo=ship.cargo;
    const recovery=job.recovery||={version:1,startedAt:at,deadlineAt:at+life.config.paymentRecoverySeconds,attempts:0,reason:'No funded purchasing contract for the carried cargo'};
    recovery.attempts++;let buyer=null;
    const destinations=[...new Set([ship.system,...life.config.connectedSystems,ship.homeBase.system,job.origin.system])];
    for(const id of destinations){if(!system(id)||!inhabited(state,id))continue;const ports=portsIn(state,id);
      for(const port of new Set(ports)){const m=market(state,id,port),price=sellPrice(m,cargo.good,cargo.oreType);if(demand(m,cargo.good)<cargo.tons||availableFunds(m)<cargo.tons*price)continue;
        const point=docking().center(id,port),distance=Math.hypot(anchor(id).x+point.x-anchor(ship.system).x-ship.x,anchor(id).y+point.y-anchor(ship.system).y-ship.y),score=price/(1+distance/100000);
        if(!buyer||score>buyer.score)buyer={market:m,score};}}
    if(buyer&&reserveBuyer(state,ship,buyer.market,at)){
      recovery.resolvedAt=at;recovery.outcome='rerouted';job.status='active';delete job.failureReason;job.reason='A funded buyer has unmet demand for the cargo retained aboard';event(state,ship,'rerouted',`Funded buyer agreed ${job.agreement.payment} credits; cargo retained and a real dock journey scheduled`,at,{destination:{...job.destination}});depart(state,ship,at);return;
    }
    if(at>=recovery.deadlineAt||recovery.attempts>=5){
      release(state,ship);job.phase='payment-idle';job.status='blocked';job.failureReason=`No legitimate funded buyer within the ${life.config.paymentRecoverySeconds}-second recovery window; owned cargo remains aboard`;job.reason='Cargo held safely: no funded buyer has unmet demand. Recheck after the next economic cycle.';recovery.outcome='cargo-held';ship.phase='docked';delete ship.localLeg;schedule(state,ship,Math.max(at,now(state))+life.config.economyInterval);
      event(state,ship,'idle','Recovery ended: no funded buyer has unmet demand. Cargo remains owned aboard; recheck at the next economic cycle.',at);park(state,ship,at);return;
    }
    job.phase='waiting-payment';schedule(state,ship,Math.max(at,now(state))+life.config.paymentRetrySeconds);
    event(state,ship,'waiting',`No funded buyer; cargo retained. Recovery deadline ${Math.ceil(recovery.deadlineAt)} simulation seconds`,at);park(state,ship,at);
  }
  function finish(state,ship,at){ship.task.status='completed';ship.task.phase='completed';ship.task.completedAt=at;ship.task.progress=1;ship.phase='docked';delete ship.localLeg;schedule(state,ship,at+4);park(state,ship,at);}
  function interrupt(state,ship,reason,at=now(state)){
    if(reason==='disabled'&&ship.combatInterruption){
      // A fight detours an existing job. Temporary loss of powered operation
      // does not cancel its funded agreement or consume its cargo again.
      window.nativeShipRepairs?.releaseClaim(state,ship);
      delete ship.localLeg;delete ship.combatReturn;ship.phase='disabled';ship.nextActionAt=null;window.nativeShipMotion.powerOff(ship);return;
    }
    delete ship.combatInterruption;delete ship.combatReturn;
    window.nativeShipRepairs?.releaseClaim(state,ship);
    initialize(state);release(state,ship);docking().release(state,ship);delete ship.dockingMove;delete ship.dockIntent;
    const job=ship.task;if(job?.status==='active'){job.status='failed';job.phase='interrupted';job.failedAt=at;job.failureReason=reason;event(state,ship,'interrupted',`Task interrupted: ${reason}`,at);}
    if(ship.miningReservation!==undefined){delete initialize(state).reservations[`rock:${ship.miningReservation}`];delete ship.miningReservation;}
    if(reason==='destroyed'&&cargoTons(ship)>0){
      const life=initialize(state);life.strandedCargo.push({id:`wreck:${ship.id}:${job?.id||at}`,shipId:ship.id,system:ship.system,x:ship.x,y:ship.y,cargo:ship.cargo,ore:ship.oreHold||0,at,status:'lost'});
      if(ship.cargo)life.economicLedger.lost[ship.cargo.good]+=ship.cargo.tons;life.economicLedger.lost[0]+=finite(ship.oreHold);
      life.strandedCargo.length=Math.min(64,life.strandedCargo.length);ship.cargo=null;ship.oreHold=0;
    }
    delete ship.localLeg;
    if(reason==='disabled'||reason==='destroyed'){ship.phase=reason;delete ship.journey;ship.nextActionAt=null;(reason==='destroyed'?window.nativeShipMotion.stop:window.nativeShipMotion.powerOff)(ship);}
    else{ship.phase='docked';schedule(state,ship,at+initialize(state).config.idleSeconds);}
  }
  function suspendCombat(state,ship,reason='Combat interrupted work',at=now(state)){
    if(!ship||ship.journey||['destroyed','disabled'].includes(ship.phase))return false;
    initialize(state);
    if(!ship.combatInterruption){
      sample(state,ship,at);
      ship.combatInterruption={version:1,taskId:ship.task?.id,phase:ship.task?.phase,dockIntent:ship.dockIntent?{...ship.dockIntent}:null,remaining:ship.combatReturn?.remaining??Math.max(0,finite(ship.nextActionAt,at)-at),at,reason};
      event(state,ship,'suspended',`${reason}; cargo and valid job commitments retained`,at);
    }
    docking().release(state,ship);delete ship.dockingMove;delete ship.dockIntent;delete ship.localLeg;delete ship.combatReturn;
    delete ship.needsDockRecovery;delete ship.dockRecoveryResumeAt;schedule(state,ship,at+5);return true;
  }
  function escapeRoute(state,ship,attacker){
    const dx=ship.x-attacker.x,dy=ship.y-attacker.y,length=Math.hypot(dx,dy)||1,away={x:dx/length,y:dy/length};
    if(!state)return {x:ship.x+away.x*1600,y:ship.y+away.y*1600};
    let best=null;
    for(const port of portsIn(state,ship.system)){
      const center=docking().center(ship.system,port),gx=center.x-ship.x,gy=center.y-ship.y,distance=Math.hypot(gx,gy)||1;
      const separation=Math.hypot(center.x-attacker.x,center.y-attacker.y),alignment=(gx*away.x+gy*away.y)/distance;
      const score=distance+Math.max(0,-alignment)*2500-Math.min(1200,separation)*.3;
      if(!best||score<best.score)best={...center,system:ship.system,port,score};
    }
    // Uninhabited mining/rescue visits have no fabricated port. They first
    // make physical separation, then resume their existing return journey.
    if(best){
      const gx=best.x-ship.x,gy=best.y-ship.y,distance=Math.hypot(gx,gy)||1;
      if((gx*away.x+gy*away.y)/distance>.2&&Math.hypot(best.x-attacker.x,best.y-attacker.y)>1100)return best;
    }
    return {x:ship.x+away.x*1600,y:ship.y+away.y*1600,system:ship.system,refuge:best};
  }
  function resumeWork(state,ship,reason='combat ended'){
    if(!ship||['destroyed','disabled'].includes(ship.phase)||ship.hull<=0)return false;
    const at=now(state),suspended=ship.combatInterruption,job=ship.task;
    if(suspended&&job&&job.id===suspended.taskId&&job.status==='active'){
      delete ship.combatInterruption;delete ship.needsDockRecovery;delete ship.dockRecoveryResumeAt;ship.phase='docked';delete ship.localLeg;
      event(state,ship,'resumed',`${reason}; resuming the retained ${job.kind} job`,at);
      const phase=suspended.phase;job.phase=phase;
      if(['loading','pickup-flight'].includes(phase))approachDock(state,ship,job.origin.port,at,'loading');
      else if(['holding-flight','dock-queue'].includes(phase)){
        const intent=suspended.dockIntent||{port:ship.cargo?job.destination.port:job.origin.port,handling:ship.cargo?'unloading':'loading'};
        approachDock(state,ship,intent.port,at,intent.handling);
      }else if(['approaching','unloading'].includes(phase))approachDock(state,ship,job.destination.port,at,'unloading');
      else if(['mining','mining-flight','collecting'].includes(phase)){
        const rock=rockById(job.requirements.rockId,ship.system);
        if(rock&&phase==='collecting'){ship.combatReturn={version:1,phase,remaining:suspended.remaining};localLeg(state,ship,{x:rock.x+110,y:rock.y+40},at,phase);}
        else if(rock&&!gone(state,rock.slotId))localLeg(state,ship,{x:rock.x+110,y:rock.y+40},at,'mining-flight');
        else interrupt(state,ship,'Mining resource unavailable after combat',at);
      }else if(['rescue-approach','rescue-service'].includes(phase)){
        const call=window.nativeShipRepairs?.claimed(state,ship),goal=call&&window.nativeShipRepairs.rendezvous(state,call,ship);
        if(goal)localLeg(state,ship,goal,at,'rescue-approach');else schedule(state,ship,at+.01);
      }else if(phase==='repairing'){
        ship.combatReturn={version:1,phase,remaining:suspended.remaining,port:job.destination?.port??job.origin?.port??ship.port};returnPaidRepair(state,ship,at);
      }else schedule(state,ship,at+.01);
      return true;
    }
    delete ship.combatInterruption;interrupt(state,ship,reason,at);schedule(state,ship,at+.01);return true;
  }
  function returnPaidRepair(state,ship,at){
    const recovery=ship.combatReturn,berth=docking().request(state,ship,ship.system,recovery.port);
    if(!berth){schedule(state,ship,at+3);return;}
    localLeg(state,ship,berth,at,recovery.phase);
  }
  function startRescue(state,ship,call,at=now(state)){
    const repairs=window.nativeShipRepairs;
    if(!repairs||!repairs.validCall(state,call)||!medical(ship)||ship.hull<=0||['destroyed','disabled'].includes(ship.phase))return false;
    interrupt(state,ship,'Medical distress response; retained cargo remains owned aboard',at);
    delete ship.needsDockRecovery;delete ship.dockRecoveryResumeAt;delete ship.journey;
    call.claim=repairs.key(repairs.ref('civilian',ship));call.status='claimed';
    task(state,ship,'medical','Respond to a claimed disabled-ship distress signal',{system:ship.system,port:ship.port},{system:call.system,port:0},{callId:call.id},at);
    if(ship.system===call.system)return localLeg(state,ship,repairs.rendezvous(state,call,ship),at,'rescue-approach');
    const journey=createJourney(state,ship,call.system,at);ship.task.phase='rescue-transit';schedule(state,ship,journey.arrivalAt);return true;
  }
  function medicalAction(state,ship,at){
    const repairs=window.nativeShipRepairs,c=repairs?.claimed(state,ship),job=ship.task;
    const end=()=>{repairs?.releaseClaim(state,ship);job.status='completed';job.phase='completed';job.completedAt=at;delete ship.localLeg;delete ship.journey;delete ship.destinationSystem;ship.phase='docked';if(!inhabited(state,ship.system)){returnToBase(state,ship,ship.operatingBase,at);ship.task.kind='reposition';ship.task.requirements.medicalReturn=true;ship.task.reason='Medical response ended; return physically to an inhabited port';}else schedule(state,ship,at+.01);};
    if(!c||!repairs.validCall(state,c)){end();return;}
    if(job.phase==='rescue-transit'){
      const journey=ship.journey;if(!journey){end();return;}
      const previous=ship.system;ship.system=journey.destination;Object.assign(ship,journey.to);ship.lastJourney={...journey,progress:1,arrivedAt:at};delete ship.journey;delete ship.destinationSystem;ship.legs=finite(ship.legs)+1;indexMove(runtime.get(state),ship,previous);
      localLeg(state,ship,repairs.rendezvous(state,c,ship),at,'rescue-approach');return;
    }
    if(job.phase==='rescue-approach'){
      if(!arriveLeg(state,ship,at))return;delete ship.localLeg;
      const goal=repairs.rendezvous(state,c,ship);
      if(Math.hypot(ship.x-goal.x,ship.y-goal.y)>50){localLeg(state,ship,goal,at,'rescue-approach');return;}
      ship.phase='medical-service';job.phase='rescue-service';window.nativeShipMotion.stop(ship);
      event(state,ship,'medical','At casualty; launching medical repair drones',at);
    }
    if(job.phase==='rescue-service'){
      if(!repairs.service(state,ship,c,at)){end();return;}
      schedule(state,ship,Math.max(at+1,now(state)+.01));return;
    }
    end();
  }
  function chooseMining(state,ship,at,{oreType,medicalSupply=false}={}){
    if((window.nativeShipEquipment&&!window.nativeShipEquipment.has(state,ship,'mining-laser'))||(!medicalSupply&&!permits(ship,'mining'))||(!minerals()&&ship.system!==1)||access()?.blocked(ship.system)||capacity(ship)<1||stats(ship).capabilities.canMine===false)return false;
    const life=initialize(state),gone=new Set([...(state.minedAsteroids||[]),...(state.destroyedAsteroids||[])]);
    const refineries=new Map();
    const buyersFor=rock=>{
      const buyerSystem=inhabited(state,rock.system??ship.system)?rock.system??ship.system:ship.operatingBase,good=oreGood(rock.oreType),key=buyerSystem+':'+rock.oreType;
      if(!refineries.has(key))refineries.set(key,portsIn(state,buyerSystem).map(id=>market(state,buyerSystem,id)).filter(m=>medicalSupply||demand(m,good)>=Math.min(4,capacity(ship))&&availableFunds(m)>=sellPrice(m,good,rock.oreType)*Math.min(4,capacity(ship))));
      return refineries.get(key);
    };
    let regions=[ship.system];
    if(access()&&minerals()){
      const remote=minerals().neighbors(ship.system,world.systems.length).filter(id=>!access().blocked(id)&&(medicalSupply||!inhabited(state,id)&&access().distance(ship.system,id)<=100)).slice(0,medicalSupply?world.systems.length:3);
      regions=medicalSupply?[ship.system,...remote]:(ship.id+finite(ship.miningTrips))%3===0?[...remote,ship.system]:[ship.system,...remote];
    }
    let rock;
    for(const id of regions){
      const candidates=rocksIn(id).filter(r=>(!oreType||r.oreType===oreType)&&!r.demo&&!gone.has(r.slotId)&&!life.reservations[`rock:${r.slotId}`]&&r.slotId!==window.nativeAsteroidCombat?.miningId);
      if(minerals())candidates.sort((a,b)=>Math.hypot(a.x-ship.x,a.y-ship.y)-Math.hypot(b.x-ship.x,b.y-ship.y));
      rock=candidates.find(r=>!minerals()||buyersFor(r).length);
      if(rock)break;
    }
    if(!rock)return false;
    const miningSystem=rock.system??ship.system,buyerSystem=inhabited(state,miningSystem)?miningSystem:ship.operatingBase;
    let port=1;
    if(minerals()){
      const buyers=buyersFor(rock);
      const source=anchor(miningSystem),buyer=anchor(buyerSystem),distance=m=>{const p=docking().center(buyerSystem,m.port);return Math.hypot(buyer.x+p.x-source.x-rock.x,buyer.y+p.y-source.y-rock.y);};
      buyers.sort((a,b)=>distance(a)-distance(b));
      if(!buyers.length)return false;port=buyers[0].port;
    }
    docking().release(state,ship);
    const job=task(state,ship,'mining',medicalSupply?'Mine deuranium and refine it into owned medical rescue supplies':`Reserved ${rock.oreLabel||'ore'} asteroid; deliver to an inhabited refinery`,{system:miningSystem,port:miningSystem===ship.system?ship.port:0},{system:buyerSystem,port},{rockId:rock.slotId,oreType:rock.oreType,miningSystem,capacity:capacity(ship),...(medicalSupply?{medicalSupply:true}: {})},at);
    ship.miningReservation=rock.slotId;ship.miningRockSlot=rock.slotId;life.reservations[`rock:${rock.slotId}`]={owner:ship.id,taskId:job.id};
    if(access())ship.miningTrips=finite(ship.miningTrips)+1;
    if(miningSystem!==ship.system){
      const journey=createJourney(state,ship,miningSystem,at);job.phase='mining-transit';schedule(state,ship,journey.arrivalAt);
      event(state,ship,'departure',`Mining expedition to ${system(miningSystem)?.name}; asteroid reserved, ore returns to ${system(buyerSystem)?.name}`,at);return true;
    }
    localLeg(state,ship,{x:rock.x+110,y:rock.y+40},at,'mining-flight');return true;
  }
  function mine(state,ship,at){
    const rock=rockById(ship.task.requirements.rockId,ship.system);
    if(rock&&!gone(state,rock.slotId)&&Math.hypot(ship.x-rock.x,ship.y-rock.y)>360){localLeg(state,ship,{x:rock.x+110,y:rock.y+40},at,'mining-flight');return;}
    if(rock?.oreType==='deuranium'){
      const elapsed=at-ship.miningStartedAt,cut=window.nativeAsteroidCombat.miningTiming.cutSeconds;
      window.nativeAsteroidCombat.miningDamage(state,rock,elapsed);
      if(elapsed<cut-1e-7){schedule(state,ship,ship.miningStartedAt+Math.min(cut,(Math.floor((elapsed+1e-7)/2)+1)*2));return;}
    }
    if(!rock||!window.nativeAsteroidCombat.completeMining(state,rock).ok){interrupt(state,ship,'resource unavailable',at);return;}
    ship.task.cutAt=at;ship.task.phase='collecting';ship.phase='collecting';
    event(state,ship,'mining-cut',`Cut the reserved asteroid; ore transport is in progress`,at);
    schedule(state,ship,at+window.nativeAsteroidCombat.miningTiming.transportSeconds);
  }
  function claimMined(state,ship,rock,at){
    if(ship.task.minedAt!==undefined)return;
    const mask=state.asteroidOreDrops?.[rock.slotId]||0,indices=[0,1,2,3].filter(i=>mask&(1<<i)).slice(0,Math.floor(capacity(ship)));
    for(const i of indices)state.asteroidOreDrops[rock.slotId]&=~(1<<i);
    ship.oreHold=finite(ship.oreHold)+indices.length;ship.mined=finite(ship.mined)+indices.length;ship.task.minedAt=at;ship.task.minedTons=indices.length;
    delete initialize(state).reservations[`rock:${rock.slotId}`];delete ship.miningReservation;ship.miningRockSlot=null;
    event(state,ship,'mined',`Consumed asteroid claim and collected ${indices.length} t ore once`,at);
    const destination=ship.task.destination;
    const good=oreGood(rock.oreType);
    ship.cargo={good,tons:ship.oreHold,owner:ship.id,toSystem:destination.system,toPort:destination.port,fromSystem:ship.system,fromPort:ship.port,...(minerals()?{oreType:rock.oreType,name:rock.oreLabel,...(good===7?{raw:true}: {})}: {})};ship.oreHold=0;
    if(good===7){const ledger=initialize(state).economicLedger;ledger.produced[7]+=indices.length;ledger.minedDeuranium=finite(ledger.minedDeuranium)+indices.length;}
    if(destination.system!==ship.system){reserveBuyer(state,ship,market(state,destination.system,destination.port),at);depart(state,ship,at);}
    else approachDock(state,ship,destination.port,at,'unloading');
  }
  function returnToBase(state,ship,base,at){
    if(!inhabited(state,base))base=access().nearestHome(state,ship.system);
    const port=base===1?3:0;docking().release(state,ship);
    const miningReturn=!inhabited(state,ship.system);
    task(state,ship,miningReturn?'mining':'reposition',miningReturn?'Mining trip ended; return to an inhabited port':'Return to the crew operating base for local work',{system:ship.system,port:ship.port},{system:base,port},miningReturn?{returning:true}:{},at);depart(state,ship,at);
  }
  function choose(state,ship,at){
    if(!inhabited(state,ship.system)){returnToBase(state,ship,ship.operatingBase,at);return;}
    window.nativeShipRepairs?.restock(state,ship);
    if(ship.oreHold>0&&!ship.cargo){ship.cargo={good:0,tons:ship.oreHold,owner:ship.id,fromSystem:ship.system,fromPort:ship.port,toSystem:1,toPort:1};ship.oreHold=0;}
    if(ship.cargo){if(!ship.task||ship.task.status!=='active')task(state,ship,'freight','Find a funded buyer for cargo already owned aboard',{system:ship.cargo.fromSystem||ship.system,port:ship.cargo.fromPort??ship.port},{system:ship.cargo.toSystem||ship.system,port:ship.cargo.toPort||0},{good:ship.cargo.good,tons:ship.cargo.tons},at);
      if(!inhabited(state,ship.task.destination.system)){recoverPayment(state,ship,at);return;}
      const reservation=initialize(state).reservations[ship.task.id];
      if(!reservation?.destinationReserved&&!reserveBuyer(state,ship,market(state,ship.task.destination.system,ship.task.destination.port),at)){recoverPayment(state,ship,at);return;}
      depart(state,ship,at);return;}
    const definition=stats(ship);
    if(ship.hull<definition.hull*.8||ship.shields<definition.shields*.5){
      const m=market(state,ship.system,ship.system===1?ship.port:0),missingHull=Math.max(0,definition.hull-ship.hull),missingShields=Math.max(0,definition.shields-ship.shields);
      const quote=Math.ceil(missingHull*.5+missingShields*.2),cost=Math.min(Math.max(0,Math.floor(ship.credits)),quote),fraction=quote?cost/quote:0;
      if(cost>0){task(state,ship,'repair','Hull damage or low shields require paid service before commercial work',{system:ship.system,port:ship.port},{system:ship.system,port:ship.port},
        {cost,quote,hull:ship.hull+missingHull*fraction,shields:ship.shields+missingShields*fraction},at);
        ship.credits-=cost;m.credits+=cost;ship.task.phase='repairing';ship.phase='docked';schedule(state,ship,at+8);return;}}
    if(medical(ship)&&window.nativeShipRepairs){
      ship.medicalSupplyVersion=1;
      if(finite(ship.repairDeuranium)<policy(ship).supplies.low)ship.repairProvisioning=true;
      if(finite(ship.repairDeuranium)>=policy(ship).supplies.target)ship.repairProvisioning=false;
    }
    if(medical(ship)&&ship.repairProvisioning&&window.nativeShipRepairs){
      let supplier=null;
      if(policy(ship).supplies.buy&&ship.credits>=policy(ship).supplies.price)for(const id of initialize(state).config.connectedSystems)for(const port of portsIn(state,id)){
        const m=market(state,id,port),stock=available(m,7);if(stock<1)continue;
        const score=stock/(id===ship.system?1:4);if(!supplier||score>supplier.score)supplier={system:id,port,score};
      }
      if(supplier){task(state,ship,'repair-supply','Purchase finite deuranium reserves for medical distress responses',{system:ship.system,port:ship.port},supplier,{},at);depart(state,ship,at);return;}
      if(policy(ship).supplies.mine&&minerals()&&chooseMining(state,ship,at,{oreType:policy(ship).supplies.material,medicalSupply:true}))return;
    }
    const custom=roles.get(ship.role);if(custom?.(state,ship,{at,startDelivery,chooseMining,schedule}))return;
    if(minerals()&&!medical(ship)&&permits(ship,'mining')&&(ship.regionalResident||ship.role==='mining')){
      const base=ship.operatingBase??ship.stationSystem??ship.system;
      if(ship.system!==base){returnToBase(state,ship,base,at);return;}
      if(chooseMining(state,ship,at))return;
      task(state,ship,'idle','Waiting for a local mining claim or funded ore buyer',{system:ship.system,port:ship.port},{system:ship.system,port:ship.port},{},at);ship.task.phase='idle';ship.phase='docked';schedule(state,ship,at+30);park(state,ship,at);return;
    }
    if(permits(ship,'mining')&&ship.role==='mining'&&chooseMining(state,ship,at))return;
    if(minerals()&&ship.system!==(ship.operatingBase??ship.system)&&finite(ship.legs)%4===0){returnToBase(state,ship,ship.operatingBase,at);return;}
    if(permits(ship,'trade')&&chooseDelivery(state,ship,at).ok)return;
    task(state,ship,'idle','No affordable stock, destination shortage, repair or available mining claim',{system:ship.system,port:ship.port},{system:ship.system,port:ship.port},{},at);ship.task.phase='idle';ship.phase='docked';schedule(state,ship,Math.max(at,now(state))+initialize(state).config.idleSeconds);park(state,ship,at);
  }
  function action(state,ship,at){
    if(['destroyed','disabled'].includes(ship.phase)){interrupt(state,ship,ship.phase,at);return;}
    if(ship.scriptedDemo||ship.disputeId||ship.retaliationId||['fighting','ore-theft'].includes(ship.phase)){schedule(state,ship,now(state)+5);return;}
    const job=ship.task;
    if(ship.combatReturn){
      if(ship.combatReturn.phase==='repairing'&&!ship.localLeg){returnPaidRepair(state,ship,at);return;}
      if(!ship.localLeg||!arriveLeg(state,ship,at))return;
      if(ship.combatReturn.phase==='repairing'){
        ship.port=ship.combatReturn.port;delete ship.localLeg;ship.phase='docked';
        if(!atBerth(state,ship)){schedule(state,ship,at+3);return;}
      }
      const recovery=ship.combatReturn;delete ship.combatReturn;delete ship.localLeg;ship.phase='docked';job.phase=recovery.phase;schedule(state,ship,at+Math.max(.01,recovery.remaining));return;
    }
    if(job?.kind==='medical'&&job.status==='active'){medicalAction(state,ship,at);return;}
    if(ship.dockingMove){
      if(!ship.localLeg||!arriveLeg(state,ship,at))return;
      const next=ship.dockingMove.resumeAt;delete ship.localLeg;delete ship.dockingMove;docking().parked(state,ship);ship.phase='docked';schedule(state,ship,Math.max(at+.01,finite(next,at)));return;
    }
    if(ship.needsDockRecovery){
      delete ship.needsDockRecovery;const resumeAt=ship.dockRecoveryResumeAt;delete ship.dockRecoveryResumeAt;
      if(job?.phase==='loading'||job?.phase==='unloading'){approachDock(state,ship,job.phase==='loading'?job.origin.port:job.destination.port,at,job.phase);return;}
      if(job&&(job.status!=='active'||job.phase==='idle'||job.phase==='repairing')){
        schedule(state,ship,Math.max(at+.01,finite(resumeAt,at)));park(state,ship,at);return;
      }
    }
    if(job?.phase==='holding-flight'){
      if(!arriveLeg(state,ship,at))return;delete ship.localLeg;ship.phase='docked';job.phase='dock-queue';schedule(state,ship,at+3);return;
    }
    if(job?.phase==='dock-queue'){approachDock(state,ship,ship.dockIntent.port,at,ship.dockIntent.handling);return;}
    if(job?.status==='blocked'&&job.phase==='payment-idle'){if(ship.cargo)recoverPayment(state,ship,at);else choose(state,ship,at);return;}
    if(!job||job.status!=='active'){choose(state,ship,at);return;}
    if(job.phase==='pickup-flight'){if(!arriveLeg(state,ship,at))return;ship.port=job.origin.port;if(!atBerth(state,ship)){approachDock(state,ship,job.origin.port,at,'loading');return;}delete ship.localLeg;job.phase='loading';ship.phase='docked';schedule(state,ship,at+initialize(state).config.handlingSeconds);return;}
    if(job.phase==='loading'){load(state,ship,at);return;}
    if(job.phase==='loaded'){depart(state,ship,at);return;}
    if(job.phase==='mining-transit'){
      const journey=ship.journey;if(!journey){interrupt(state,ship,'Mining journey unavailable',at);return;}
      const oldSystem=ship.system;ship.system=journey.destination;Object.assign(ship,journey.to);ship.lastJourney={...journey,progress:1,arrivedAt:at};delete ship.journey;delete ship.destinationSystem;ship.legs=finite(ship.legs)+1;indexMove(runtime.get(state),ship,oldSystem);
      const rock=rockById(job.requirements.rockId,ship.system);
      if(!rock||state.minedAsteroids?.includes(rock.slotId)||state.destroyedAsteroids?.includes(rock.slotId)){
        interrupt(state,ship,'Reserved asteroid depleted before arrival',at);returnToBase(state,ship,ship.operatingBase,at);return;
      }
      event(state,ship,'arrival',`Arrived at the reserved asteroid in ${system(ship.system)?.name}; no civilian port visit`,at);
      localLeg(state,ship,{x:rock.x+110,y:rock.y+40},at,'mining-flight');return;
    }
    if(job.phase==='transit'){
      const journey=ship.journey;if(!journey){depart(state,ship,at);return;}
      const oldSystem=ship.system;ship.system=journey.destination;Object.assign(ship,journey.to);ship.heading=Math.atan2(journey.galaxyTo.y-journey.galaxyFrom.y,journey.galaxyTo.x-journey.galaxyFrom.x);
      ship.lastJourney={...journey,progress:1,arrivedAt:at};ship.journey=null;ship.destinationSystem=null;ship.legs=finite(ship.legs)+1;indexMove(runtime.get(state),ship,oldSystem);
      event(state,ship,'arrival',`Arrived at ${system(ship.system)?.name}; approaching destination dock`,at);approachDock(state,ship,job.destination.port,at,'unloading');return;
    }
    if(job.phase==='approaching'){
      if(!arriveLeg(state,ship,at))return;ship.port=job.destination.port;if(!atBerth(state,ship)){approachDock(state,ship,job.destination.port,at,'unloading');return;}ship.phase='docked';delete ship.localLeg;job.phase='unloading';event(state,ship,'docked',`Docked at ${system(ship.system)?.name}${ship.system===1?' / '+window.nativeSolEconomy.names[ship.port]:''}`,at);if(job.kind==='repair-supply'){window.nativeShipRepairs?.restock(state,ship);finish(state,ship,at);}else if(job.kind==='reposition'||job.requirements.returning)finish(state,ship,at);else schedule(state,ship,at+initialize(state).config.handlingSeconds);return;
    }
    if(job.phase==='waiting-payment'){
      // Migration can fund an old waiting delivery. Its own incoming reservation
      // must not make the already agreed buyer look unavailable to renegotiation.
      if(initialize(state).reservations[job.id]?.destinationReserved)depart(state,ship,at);
      else recoverPayment(state,ship,at);return;
    }
    if(job.phase==='unloading'){unload(state,ship,at);return;}
    if(job.phase==='mining-flight'){
      if(!arriveLeg(state,ship,at))return;
      const rock=rockById(job.requirements.rockId,ship.system);
      if(!rock||gone(state,rock.slotId)){interrupt(state,ship,'resource unavailable',at);return;}
      if(Math.hypot(ship.x-rock.x,ship.y-rock.y)>300){localLeg(state,ship,{x:rock.x+110,y:rock.y+40},at,'mining-flight');return;}
      delete ship.localLeg;job.phase='mining';ship.phase='mining';ship.miningStartedAt=at;ship.miningSourceX=ship.x;ship.miningSourceY=ship.y;schedule(state,ship,at+(rock.oreType==='deuranium'?2:window.nativeAsteroidCombat.miningTiming.cutSeconds));return;
    }
    if(job.phase==='mining'){mine(state,ship,at);return;}
    if(job.phase==='collecting'){const rock=rockById(job.requirements.rockId,ship.system);if(rock)claimMined(state,ship,rock,at);else interrupt(state,ship,'resource unavailable',at);return;}
    if(job.phase==='repairing'){ship.hull=job.requirements.hull;ship.shields=job.requirements.shields;event(state,ship,'repaired','Paid repair completed',at);finish(state,ship,at);return;}
    if(job.phase==='idle'){finish(state,ship,at);return;}
    choose(state,ship,at);
  }
  function playerPosition(state){return state.system===1&&window.vexedSolFlight?.shipPosition?window.vexedSolFlight.shipPosition(state):{x:finite(state.x),y:finite(state.y)};}
  function detail(state,ship,prepared){
    if(!ship||['destroyed','disabled'].includes(ship.phase))return 'inactive';if(ship.journey||ship.phase==='warp')return 'transit';
    if(window.nativeShipDetail)return window.nativeShipDetail.isDetailed(state,ship,{category:'civilian',pose:prepared||localPose(state,ship)})?'detailed':'distant';
    const p=playerPosition(state),radius=initializeConfig(state).detailedRadius,pose=prepared||localPose(state,ship);return ship.system===state.system&&!state.landed&&Math.hypot(pose.x-p.x,pose.y-p.y)<=radius?'detailed':'distant';
  }
  function sample(state,ship,at,prepared){
    const moving=ship.localLeg&&(ship.task?.status==='active'||ship.dockingMove);
    const reuse=moving&&prepared?.sampledLeg===ship.localLeg&&prepared.sampledAt===at;
    const before=moving&&!reuse?{x:ship.x,y:ship.y,heading:ship.heading,system:ship.system,shipType:ship.shipType,speed:ship.speed,vx:ship.vx,vy:ship.vy}:null;
    if(reuse){Object.assign(ship,{x:prepared.x,y:prepared.y,heading:prepared.heading,speed:prepared.speed,vx:prepared.vx,vy:prepared.vy,previousX:prepared.previousX,previousY:prepared.previousY});
      for(const key of ['motionKick','motionSpin'])if(prepared[key])ship[key]=prepared[key];else delete ship[key];
    }else if(moving)window.nativeShipMotion.sampleLeg(ship,ship.localLeg,at);
    if(ship.journey){ship.journey.progress=clamp((at-ship.journey.departedAt)/ship.journey.duration,0,1);ship.timer=Math.max(0,ship.journey.arrivalAt-at);}
    if(ship.task){const job=ship.task;job.progress=job.status==='completed'?1:['transit','mining-transit'].includes(job.phase)?.2+(ship.journey?.progress||0)*.6:job.phase==='approaching'?.85:job.phase==='unloading'?.95:job.phase==='mining'?.5:0;}
    if(moving){const systems=window.nativeShipSystems;if(systems?.sampledShip)systems.sampledShip(state,ship,'civilian',ship.system,before);else systems?.refreshShip?.(state,ship,'civilian',ship.system);}
  }
  function advance(state,dt){
    if(window.nativeSimulation.blocked()||!Number.isFinite(dt)||dt<=0)return;
    const started=performance.now(),life=initialize(state),rt=runtime.get(state),at=now(state),m=rt.stats;m.detailedShips=0;m.distantUpdates=0;m.scheduledEvents=0;
    if(access())auditAccess(state,life,rt);
    advanceEconomy(state,at);
    const origin=playerPosition(state),radius=window.nativeShipDetail?.radius(state)||life.config.detailedRadius;
    const local=window.nativeShipSystems?.query?window.nativeShipSystems.query(state,{minX:origin.x-radius,minY:origin.y-radius,maxX:origin.x+radius,maxY:origin.y+radius,categories:['civilian']}).bystanders:Array.from(rt.bySystem.get(state.system)||[],id=>rt.byId.get(id));
    // Only the player's location is sampled every frame. No artwork is prepared
    // for distant lives or for opening the map.
    for(const target of local){const ship=target.entity||target,prepared=target.entity?target:undefined;if(detail(state,ship,prepared)!=='detailed'||ship.scriptedDemo||ship.disputeId||ship.retaliationId)continue;sample(state,ship,at,prepared);m.detailedShips++;}
    let popped=0;
    while(rt.heap.length&&rt.heap[0].at<=at&&m.scheduledEvents<life.config.eventBudget&&popped++<life.config.eventBudget*4){
      if(window.nativeSimulationFrame?.take&&!window.nativeSimulationFrame.take(state,'civilianHeapPops',life.config.eventBudget*4))break;
      const due=pop(rt.heap),ship=rt.byId.get(due.id);if(!ship||due.token!==ship.lifeScheduleToken||ship.nextActionAt===null)continue;
      if(window.nativeSimulationFrame?.take&&!window.nativeSimulationFrame.take(state,'civilianEvents',life.config.eventBudget)){push(rt.heap,due);break;}
      sample(state,ship,due.at);action(state,ship,due.at);m.scheduledEvents++;if(detail(state,ship)!=='detailed')m.distantUpdates++;
    }
    // Budget exhaustion leaves exact saved deadlines pending, rather than dropping
    // work or recursively running an unbounded multi-day catch-up loop.
    m.backlog=rt.heap.length&&rt.heap[0].at<=at?rt.heap.filter(e=>e.at<=at).length:0;m.pendingEvents=rt.heap.length;m.simulationMs=performance.now()-started;
    life.metrics={...m,totalEvents:finite(life.metrics.totalEvents)+m.scheduledEvents};rt.lastNow=at;
  }
  function advanceEconomy(state,at){
    const life=initialize(state);if(life.config.economyEnabled===false)return;
    let cycles=0;
    while(life.nextEconomyAt<=at&&cycles++<life.config.economyBudget){
      if(window.nativeSimulationFrame?.take&&!window.nativeSimulationFrame.take(state,'civilianEconomy',life.config.economyBudget))break;
      const ledger=life.economicLedger,scale=life.config.economyInterval/30;
      // Households are an explicit external sector: their consumption removes
      // goods and pays the treasury. Offworld extraction/manufacture creates
      // specialty exports; Sol's existing production is not run a second time.
      for(const id of life.config.connectedSystems){if(!inhabited(state,id))continue;const m=market(state,id,id===1?3:0);
        if(id!==1){const made=Math.max(0,Math.min(Math.floor(12*scale),300-finite(m.stock[m.specialty])));m.stock[m.specialty]+=made;ledger.produced[m.specialty]+=made;}
        for(let good=0;good<costs.length;good++)if(good!==m.specialty||minerals()&&good===0){
          const used=Math.min(Math.floor((minerals()&&good===0?12:4)*scale),available(m,good)),payment=used*Math.ceil(costs[good]*1.35);
          m.stock[good]-=used;m.credits+=payment;ledger.consumed[good]+=used;ledger.householdSpending+=payment;
        }
        m.lastEconomyAt=life.nextEconomyAt;
      }
      ledger.cycles++;ledger.lastAt=life.nextEconomyAt;life.nextEconomyAt+=life.config.economyInterval;
    }
  }
  function find(state,id){initialize(state);return runtime.get(state).byId.get(Number(id))||null;}
  function members(state,systemId=state.system){initialize(state);const rt=runtime.get(state);let view=rt.memberViews.get(systemId);if(!view){view=Object.freeze(Array.from(rt.bySystem.get(systemId)||[],id=>rt.byId.get(id)).filter(Boolean));rt.memberViews.set(systemId,view);}return view;}
  function membershipRevision(state,systemId=state.system){initialize(state);const rt=runtime.get(state);return rt.collectionRevision+':'+(rt.systemRevisions.get(systemId)||0);}
  function invalidateMembership(state){const rt=runtime.get(state);if(rt)rt.collectionRevision=-1;}
  function transits(state){initialize(state);const rt=runtime.get(state);return rt.transitView||=Object.freeze(Array.from(rt.transit));}
  function mobile(state,systemId){initialize(state);const rt=runtime.get(state);if(systemId===undefined)return rt.mobileView||=Object.freeze(Array.from(rt.mobile));let view=rt.mobileSystemViews.get(systemId);if(!view){view=Object.freeze(Array.from(rt.mobileSystems.get(systemId)||[]));rt.mobileSystemViews.set(systemId,view);}return view;}
  function controlled(state){initialize(state);const rt=runtime.get(state);return rt.controlledView||=Object.freeze(Array.from(rt.controlled));}
  function mining(state){initialize(state);const rt=runtime.get(state);return rt.minerView||=Object.freeze(Array.from(rt.miners));}
  function observeMotion(state,ship){const rt=runtime.get(state);if(rt)updateTransit(rt,ship);}
  function galaxyPosition(state,ship){
    if(ship.journey){const j=ship.journey,p=clamp((now(state)-j.departedAt)/j.duration,0,1);return {x:j.galaxyFrom.x+(j.galaxyTo.x-j.galaxyFrom.x)*p,y:j.galaxyFrom.y+(j.galaxyTo.y-j.galaxyFrom.y)*p};}
    const a=anchor(ship.system),pose=localPose(state,ship);return {x:a.x+pose.x,y:a.y+pose.y};
  }
  function localPose(state,ship){const pose={x:ship.x,y:ship.y,heading:ship.heading,speed:ship.speed,motionKick:ship.motionKick,motionSpin:ship.motionSpin};if(ship.localLeg)window.nativeShipMotion.sampleLeg(pose,ship.localLeg,Math.min(now(state),ship.nextActionAt));return pose;}
  function descriptor(state,ship){const pose=localPose(state,ship);return {id:ship.id,category:'civilian',entity:ship,name:ship.name,role:ship.role,faction:ship.ownerGovernmentId,system:ship.system,x:pose.x,y:pose.y,heading:pose.heading,detail:detail(state,ship),galaxy:galaxyPosition(state,ship),location:{kind:ship.journey?'transit':'local',system:ship.system,port:ship.port},task:ship.task||null,journey:ship.journey||null,events:ship.recentEvents,nextActionAt:ship.nextActionAt};}
  function descriptors(state){initialize(state);return state.civilianTraffic.ships.map(ship=>descriptor(state,ship));}
  function inspect(state,id){const ship=find(state,id);if(!ship)return null;const d=descriptor(state,ship);return {id:ship.id,name:ship.name,category:'civilian',system:d.system,role:ship.role,faction:ship.ownerGovernmentId,home:ship.homeBase,location:d.location,galaxy:d.galaxy,detail:d.detail,
    docking:docking().inspect(state,ship),task:ship.task,journey:ship.journey||null,lastJourney:ship.lastJourney||null,cargo:ship.cargo,oreHold:ship.oreHold,credits:ship.credits,hull:ship.hull,shields:ship.shields,equipment:ship.weaponLoadout||ship.weapons,events:ship.recentEvents,nextActionAt:ship.nextActionAt};}
  function startDemo(state){
    initialize(state);const ships=state.civilianTraffic.ships;
    let ship=ships.find(s=>s.lifeDemoName==='ISS Meridian');
    if(!ship)ship=ships.find(s=>s.id===2&&!['destroyed','disabled'].includes(s.phase))||ships.find(s=>s.role==='freight'&&!['destroyed','disabled'].includes(s.phase));
    if(!ship)return {ok:false,error:'No operational existing freighter is available.'};
    ship.lifeDemoName='ISS Meridian';ship.name='ISS Meridian';
    if(ship.task?.status==='active'&&['freight','trade'].includes(ship.task.kind))return {ok:true,resumed:true,id:ship.id,name:ship.name,origin:ship.task.origin,destination:ship.task.destination,tons:ship.task.requirements.tons,good:ship.task.requirements.good,taskId:ship.task.id};
    if(ship.journey||ship.cargo||ship.task?.status==='active'&&!['idle','selecting'].includes(ship.task.phase))return {ok:false,error:'The demonstration freighter is still working; inspect its current delivery.',id:ship.id};
    release(state,ship);
    const source=market(state,ship.system,ship.system===1?ship.port||3:0),to=ship.system===1?initialize(state).config.connectedSystems.find(id=>id!==1):1;
    let good=5;if(available(source,good)<1||ship.credits<costs[good])good=costs.findIndex((cost,g)=>available(source,g)>=1&&ship.credits>=cost);
    if(good<0)return {ok:false,error:'The freighter needs available stock and purchase funds.',id:ship.id};
    const result=startDelivery(state,ship.id,{fromSystem:ship.system,fromPort:source.port,toSystem:to,toPort:to===1?3:0,good,tons:4,reason:'Dev delivery demonstration using owned credits and real port stock'});
    return {...result,id:ship.id,name:ship.name,sourceBefore:source.stock[good],destinationBefore:market(state,to,to===1?3:0).stock[good]};
  }
  const metrics=state=>({...initialize(state).metrics});
  const configure=options=>{callbacks={...callbacks,...options};};
  function visit(state,id){const ship=find(state,id);return ship?callbacks.visit?.(state,ship,{galaxy:galaxyPosition(state,ship)})??{ok:false,error:'Local visitor is not configured'}:{ok:false,error:'Ship unavailable'};}
  function registerRole(name,policy){if(typeof name!=='string'||typeof policy!=='function')throw new TypeError('Role needs a name and decision function');roles.set(name,policy);}
  function refreshLocation(state,ship){initialize(state);indexMove(runtime.get(state),ship);}
  function mineralQuote(state,type,port,tons=1){
    const ore=minerals()?.ores[type],amount=Number(tons);
    if(!ore||!Number.isSafeInteger(amount)||amount<1)return {ok:false,error:'Choose a valid mineral amount.'};
    const m=market(state,state.system,port),good=oreGood(type),unit=minerals().orePrice(state.system,type),payment=unit*amount;
    return {ok:true,type,name:ore.name,good,tons:amount,unit,total:payment,held:minerals().held(state,type),funded:availableFunds(m)>=payment,room:m.stock[good]+m.incoming[good]+amount<=9999};
  }
  function sellMineral(state,type,port,tons=1){
    const quote=mineralQuote(state,type,port,tons);if(!quote.ok)return quote;
    const result=exchange(state,market(state,state.system,port),state,{good:quote.good,tons:quote.tons,payment:quote.total,buy:false,player:true,mineral:type});
    return result.ok?{...result,message:`Sold ${quote.tons} ${quote.name} to the local refinery for ${quote.total} latinum.`}:result;
  }
  function refineDeuranium(state,port,tons=1){
    if(!minerals()||!inhabited(state,state.system)||!portsIn(state,state.system).includes(Number(port)))return {ok:false,error:'Reach an inhabited refinery port.'};
    if(!Number.isSafeInteger(tons)||tons<1||minerals().held(state,'deuranium')<tons)return {ok:false,error:'Not enough raw deuranium ore.'};
    state.minerals.deuranium-=tons;state.deuranium=finite(state.deuranium)+tons;
    const ledger=initialize(state).economicLedger;ledger.playerMineralsRefined||={};ledger.playerMineralsRefined.deuranium=finite(ledger.playerMineralsRefined.deuranium)+tons;
    return {ok:true,tons,message:`Refined ${tons} deuranium ore into repair supplies.`};
  }
  function upgradeMinerals(state,kind,port){
    const quote=minerals()?.upgradeQuote(state,kind);if(!quote)return {ok:false,error:'Unknown mineral technology.'};
    if(quote.level>=quote.max)return {ok:false,error:'This hull already has the maximum upgrade.'};
    if(finite(state.latinum)<quote.price||Object.entries(quote.materials).some(([ore,n])=>minerals().held(state,ore)<n))return {ok:false,error:'The upgrade requires the listed minerals and latinum.'};
    const m=market(state,state.system,port),before=window.nativeShipDefinitions.forEntity(state),ledger=initialize(state).economicLedger;
    ledger.technologyMineralsConsumed||={};
    for(const [ore,n] of Object.entries(quote.materials)){
      if(ore==='dilithium')state.dilithium=minerals().held(state,ore)-n;else{state.minerals||={};state.minerals[ore]=minerals().held(state,ore)-n;}
      ledger.technologyMineralsConsumed[ore]=finite(ledger.technologyMineralsConsumed[ore])+n;
    }
    state.latinum-=quote.price;m.credits+=quote.price;state.mineralUpgrades||={};state.mineralUpgrades[state.shipType]||={};state.mineralUpgrades[state.shipType][kind]=quote.level+1;
    const after=window.nativeShipDefinitions.forEntity(state);state.hull+=Math.max(0,after.hull-before.hull);state.shields+=Math.max(0,after.shields-before.shields);
    window.nativeShipSystems?.refreshShip?.(state,state,'player',state.system);
    return {ok:true,message:quote.name+' level '+(quote.level+1)+' installed on this hull.'};
  }
  function reroute(state,ship,leg){
    initialize(state);if(!ship.localLeg||ship.journey||!(ship.task?.status==='active'||ship.dockingMove)||leg.valid===false)return false;
    ship.localLeg=leg;schedule(state,ship,leg.startedAt+leg.duration);return true;
  }
  window.nativeNpcLives={initialize,advance,descriptors,find,members,mobile,controlled,mining,observeMotion,ready:state=>!!runtime.get(state)&&!runtime.get(state).initializing,revision:membershipRevision,invalidateMembership,transits,queryTransits,systems:state=>{initialize(state);return Array.from(runtime.get(state).bySystem.keys());},galaxyPosition,pose:localPose,detail,inspect,metrics,registerRole,configure,visit,startDelivery,startDemo,interrupt,suspendCombat,resumeWork,escapeRoute,market,exchange,refreshLocation,availableFunds,demand,mineralQuote,sellMineral,refineDeuranium,upgradeMinerals,reroute,startRescue,
    scheduled:state=>{initialize(state);return runtime.get(state).heap.length;}};
})();
