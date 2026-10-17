/* Saved civilian lives. Policies choose work; shared systems execute mechanics. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld,roles=new Map(),runtime=new WeakMap(),marketStates=new WeakMap();
  const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const now=state=>window.nativeSimulation.seconds(state);
  const stats=ship=>window.nativeShipDefinitions.forEntity(null,ship,{category:'civilian'});
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
  function schedule(state,ship,at){ship.nextActionAt=Math.max(0,finite(at,now(state)));ship.lifeScheduleToken=(ship.lifeScheduleToken||0)+1;const rt=runtime.get(state);if(rt)push(rt.heap,{at:ship.nextActionAt,id:ship.id,token:ship.lifeScheduleToken});}
  function indexMove(rt,ship,oldSystem){const previous=oldSystem??rt.indexedSystems.get(ship.id);if(previous!==undefined)rt.bySystem.get(previous)?.delete(ship.id);if(!rt.bySystem.has(ship.system))rt.bySystem.set(ship.system,new Set());rt.bySystem.get(ship.system).add(ship.id);rt.indexedSystems.set(ship.id,ship.system);}
  function migrateShip(state,ship,life){
    if(ship.lifeVersion===1)return;
    ship.lifeVersion=1;ship.role||=ship.shipType===18?'mining':ship.shipType===23?'trading':'freight';
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
        if(!resident.has(ship.operatingBase)&&stats(ship).capabilities.canMine!==false){ship.regionalResident=true;resident.add(ship.operatingBase);}
      }
    }
    life.economicLedger||={version:1,produced:costs.map(()=>0),consumed:costs.map(()=>0),householdSpending:0,cycles:0};
    life.economicLedger.initialMarketCredits??=0;life.economicLedger.initialMarketGoods||=costs.map(()=>0);
    life.economicLedger.lost||=costs.map(()=>0);
    life.config.secondsPerDay=window.nativeWorldTime?.secondsPerDay||120;
    let rt=runtime.get(state);
    if(!rt||rt.ships!==traffic.ships||rt.count!==traffic.ships.length){
      rt={ships:traffic.ships,count:traffic.ships.length,initializing:true,byId:new Map(),bySystem:new Map(),indexedSystems:new Map(),heap:[],lastNow:now(state),stats:{detailedShips:0,distantUpdates:0,scheduledEvents:0,backlog:0,simulationMs:0}};
      runtime.set(state,rt);
      for(const ship of traffic.ships){migrateShip(state,ship,life);rt.byId.set(ship.id,ship);indexMove(rt,ship);if(Number.isFinite(ship.nextActionAt))push(rt.heap,{at:ship.nextActionAt,id:ship.id,token:ship.lifeScheduleToken});}
      for(const m of Object.values(life.markets))if(m.system===1&&state.solEconomy){state.solEconomy.stockReserved||={};state.solEconomy.stockReserved[m.port]=m.reserved;state.solEconomy.incomingReserved||={};state.solEconomy.incomingReserved[m.port]=m.incoming;m.stock=state.solEconomy.ports[m.port]||m.stock;}
      migrateContracts(state,life,rt);
      docking().reconcile(state);
      for(const ship of traffic.ships)if(ship.dockingVersion!==1){
        ship.dockingVersion=1;
        if(ship.task&&!ship.journey&&!ship.localLeg&&!['disabled','destroyed'].includes(ship.phase)){
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
  const capacity=ship=>Math.max(0,finite(stats(ship).cargo)-cargoTons(ship));
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
  function exchange(state,m,actor,{good,tons,payment,buy,player=false,free=false,capacity:room=0,reservationId,cargo,mineral}){
    if(!player&&!inhabited(state,m.system))return {ok:false,error:'Civilians cannot trade at prohibited or uninhabited worlds.'};
    if(!Number.isInteger(good)||!costs[good]||!Number.isSafeInteger(tons)||tons<=0||!Number.isSafeInteger(payment)||payment<0)return {ok:false,error:'Invalid cargo transaction.'};
    const reservation=reservationId?initialize(state).reservations[reservationId]:null;
    if(reservationId&&(!reservation||reservation.owner!==actor.id||reservation.good!==good||reservation.tons!==tons))return {ok:false,error:'Cargo contract no longer matches.'};
    const ownStock=reservation?.sourceReserved!==false&&reservation?.system===m.system&&reservation?.port===m.port?reservation.tons:0;
    const ownFunds=reservation?.destinationReserved&&reservation.destination.system===m.system&&reservation.destination.port===m.port?reservation.payment:0;
    if(mineral&&(!player||buy||good!==0||!minerals()?.ores[mineral]))return {ok:false,error:'Invalid mineral refinery transaction.'};
    const creditKey=player?'latinum':'credits',balance=finite(actor[creditKey]),held=mineral?minerals().held(actor,mineral):player?finite(actor.solFreightHold?.[good]):actor.cargo?.good===good?finite(actor.cargo.tons):0;
    if(buy){
      if(available(m,good)+ownStock<tons)return {ok:false,error:'The port does not have that much unreserved cargo.'};
      if(room<tons)return {ok:false,error:'Your cargo hold is full.'};
      if(!free&&balance<payment)return {ok:false,error:'Not enough latinum.'};
    }else{
      if(held<tons)return {ok:false,error:'You do not have that much cargo aboard.'};
      if(availableFunds(m)+ownFunds<payment)return {ok:false,error:'The port has insufficient unreserved purchasing funds.'};
      if(finite(m.stock[good])+finite(m.incoming[good])-(ownFunds?reservation.tons:0)+tons>9999)return {ok:false,error:'The port has insufficient unreserved storage space.'};
    }
    // All checks precede all mutations. A saved result contains only settled
    // balances; there is no pending callback or replayable payment to restore.
    m.stock[good]+=buy?-tons:tons;m.credits+=buy?payment:-payment;
    if(!free)actor[creditKey]=balance+(buy?-payment:payment);
    else state.solEconomy.flows.devPurchaseSubsidy=(state.solEconomy.flows.devPurchaseSubsidy||0)+payment;
    if(mineral){if(mineral==='dilithium')actor.dilithium=held-tons;else{actor.minerals||={};actor.minerals[mineral]=held-tons;}const ledger=initialize(state).economicLedger;ledger.playerMineralsRefined||={};ledger.playerMineralsRefined[mineral]=finite(ledger.playerMineralsRefined[mineral])+tons;}
    else if(player){actor.solFreightHold||={};actor.solFreightHold[good]=held+(buy?tons:-tons);}
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
      const job=ship.task,old=saved[job?.id];if(job?.status!=='active'||job.deliveredAt!==undefined||old?.version!==2||!old.destinationReserved)continue;
      if(!inhabited(state,old.destination.system)||old.sourceReserved!==false&&!inhabited(state,old.system))continue;
      old.port=portFor(state,old.system,old.port);old.destination.port=portFor(state,old.destination.system,old.destination.port);
      const destination=market(state,old.destination.system,old.destination.port);
      life.reservations[job.id]=old;if(old.sourceReserved!==false)market(state,old.system,old.port).reserved[old.good]+=old.tons;
      destination.incoming[old.good]+=old.tons;destination.fundsReserved+=old.payment;
    }
    for(const ship of rt.byId.values()){
      const job=ship.task;if(job?.status!=='active'||job.deliveredAt!==undefined)continue;
      if(job.kind!=='mining'&&(!inhabited(state,job.destination?.system)||!ship.cargo&&!inhabited(state,job.origin?.system)))continue;
      if(ship.localLeg){const result=window.nativeShipMotion.sampleLeg({...ship},ship.localLeg,now(state));
        if(result.invalid){interrupt(state,ship,'invalid route');continue;}
        if(!Number.isFinite(ship.nextActionAt))schedule(state,ship,result.arrived?now(state):ship.localLeg.startedAt+ship.localLeg.duration);}
      if(job.origin)job.origin.port=portFor(state,job.origin.system,job.origin.port);
      if(job.destination)job.destination.port=portFor(state,job.destination.system,job.destination.port);
      if(ship.cargo){ship.cargo.toPort=portFor(state,ship.cargo.toSystem??job.destination.system,ship.cargo.toPort);ship.cargo.fromPort=portFor(state,ship.cargo.fromSystem??job.origin.system,ship.cargo.fromPort);}
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
    const approach=rock?{x:rock.x+110,y:rock.y+40}:docking().center(destination,ship.task?.destination?.port??ship.cargo?.toPort??(destination===1?3:0)),direction=Math.atan2(b.y-a.y,b.x-a.x);
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
    let reservation=initialize(state).reservations[job.id];
    const destination=market(state,job.destination.system,job.destination.port);
    if(!reservation?.destinationReserved){if(!reserveBuyer(state,ship,destination,at)){recoverPayment(state,ship,at);return;}reservation=initialize(state).reservations[job.id];}
    const payment=reservation.payment;
    if(reservation.destination.system!==ship.system||reservation.destination.port!==ship.port||reservation.good!==cargo.good||reservation.tons!==cargo.tons||destination.credits<payment){release(state,ship);recoverPayment(state,ship,at);return;}
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
    initialize(state);release(state,ship);docking().release(state,ship);delete ship.dockingMove;delete ship.dockIntent;
    const job=ship.task;if(job?.status==='active'){job.status='failed';job.phase='interrupted';job.failedAt=at;job.failureReason=reason;event(state,ship,'interrupted',`Task interrupted: ${reason}`,at);}
    if(ship.miningReservation!==undefined){delete initialize(state).reservations[`rock:${ship.miningReservation}`];delete ship.miningReservation;}
    if(reason==='destroyed'&&cargoTons(ship)>0){
      const life=initialize(state);life.strandedCargo.push({id:`wreck:${ship.id}:${job?.id||at}`,shipId:ship.id,system:ship.system,x:ship.x,y:ship.y,cargo:ship.cargo,ore:ship.oreHold||0,at,status:'lost'});
      if(ship.cargo)life.economicLedger.lost[ship.cargo.good]+=ship.cargo.tons;life.economicLedger.lost[0]+=finite(ship.oreHold);
      life.strandedCargo.length=Math.min(64,life.strandedCargo.length);ship.cargo=null;ship.oreHold=0;
    }
    delete ship.localLeg;
    if(reason==='disabled'||reason==='destroyed'){ship.phase=reason;delete ship.journey;ship.nextActionAt=null;window.nativeShipMotion.stop(ship);}
    else{ship.phase='docked';schedule(state,ship,at+initialize(state).config.idleSeconds);}
  }
  function resumeWork(state,ship,reason='combat ended'){
    if(!ship||['destroyed','disabled'].includes(ship.phase)||ship.hull<=0)return false;
    const at=now(state);interrupt(state,ship,reason,at);schedule(state,ship,at+.01);return true;
  }
  function chooseMining(state,ship,at){
    if((!minerals()&&ship.system!==1)||access()?.blocked(ship.system)||capacity(ship)<1||stats(ship).capabilities.canMine===false)return false;
    const life=initialize(state),gone=new Set([...(state.minedAsteroids||[]),...(state.destroyedAsteroids||[])]);
    let regions=[ship.system];
    if(access()&&minerals()){
      const remote=minerals().neighbors(ship.system,world.systems.length).filter(id=>!access().blocked(id)&&!inhabited(state,id)&&access().distance(ship.system,id)<=100).slice(0,3);
      regions=(ship.id+finite(ship.miningTrips))%3===0?[...remote,ship.system]:[ship.system,...remote];
    }
    let rock;
    for(const id of regions){
      const candidates=rocksIn(id).filter(r=>!r.demo&&!gone.has(r.slotId)&&!life.reservations[`rock:${r.slotId}`]&&r.slotId!==window.nativeAsteroidCombat?.miningId);
      if(minerals())candidates.sort((a,b)=>Math.hypot(a.x-ship.x,a.y-ship.y)-Math.hypot(b.x-ship.x,b.y-ship.y));
      if(candidates.length){rock=candidates[0];break;}
    }
    if(!rock)return false;
    const miningSystem=rock.system??ship.system,buyerSystem=inhabited(state,miningSystem)?miningSystem:ship.operatingBase;
    let port=1;
    if(minerals()){
      const buyers=portsIn(state,buyerSystem).map(id=>market(state,buyerSystem,id)).filter(m=>demand(m,0)>=Math.min(4,capacity(ship))&&availableFunds(m)>=sellPrice(m,0,rock.oreType)*Math.min(4,capacity(ship)));
      const source=anchor(miningSystem),buyer=anchor(buyerSystem),distance=m=>{const p=docking().center(buyerSystem,m.port);return Math.hypot(buyer.x+p.x-source.x-rock.x,buyer.y+p.y-source.y-rock.y);};
      buyers.sort((a,b)=>distance(a)-distance(b));
      if(!buyers.length)return false;port=buyers[0].port;
    }
    docking().release(state,ship);
    const job=task(state,ship,'mining',`Reserved ${rock.oreLabel||'ore'} asteroid; deliver to an inhabited refinery`,{system:miningSystem,port:miningSystem===ship.system?ship.port:0},{system:buyerSystem,port},{rockId:rock.slotId,oreType:rock.oreType,miningSystem,capacity:capacity(ship)},at);
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
    ship.cargo={good:0,tons:ship.oreHold,owner:ship.id,toSystem:destination.system,toPort:destination.port,fromSystem:ship.system,fromPort:ship.port,...(minerals()?{oreType:rock.oreType,name:rock.oreLabel}: {})};ship.oreHold=0;
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
    const custom=roles.get(ship.role);if(custom?.(state,ship,{at,startDelivery,chooseMining,schedule}))return;
    if(minerals()&&(ship.regionalResident||ship.role==='mining')){
      const base=ship.operatingBase??ship.stationSystem??ship.system;
      if(ship.system!==base){returnToBase(state,ship,base,at);return;}
      if(chooseMining(state,ship,at))return;
      task(state,ship,'idle','Waiting for a local mining claim or funded ore buyer',{system:ship.system,port:ship.port},{system:ship.system,port:ship.port},{},at);ship.task.phase='idle';ship.phase='docked';schedule(state,ship,at+30);park(state,ship,at);return;
    }
    if(ship.role==='mining'&&chooseMining(state,ship,at))return;
    if(minerals()&&ship.system!==(ship.operatingBase??ship.system)&&finite(ship.legs)%4===0){returnToBase(state,ship,ship.operatingBase,at);return;}
    if(chooseDelivery(state,ship,at).ok)return;
    task(state,ship,'idle','No affordable stock, destination shortage, repair or available mining claim',{system:ship.system,port:ship.port},{system:ship.system,port:ship.port},{},at);ship.task.phase='idle';ship.phase='docked';schedule(state,ship,Math.max(at,now(state))+initialize(state).config.idleSeconds);park(state,ship,at);
  }
  function action(state,ship,at){
    if(['destroyed','disabled'].includes(ship.phase)){interrupt(state,ship,ship.phase,at);return;}
    if(ship.scriptedDemo||ship.disputeId||ship.retaliationId||['fighting','ore-theft'].includes(ship.phase)){schedule(state,ship,now(state)+5);return;}
    const job=ship.task;
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
      if(!arriveLeg(state,ship,at))return;ship.port=job.destination.port;if(!atBerth(state,ship)){approachDock(state,ship,job.destination.port,at,'unloading');return;}ship.phase='docked';delete ship.localLeg;job.phase='unloading';event(state,ship,'docked',`Docked at ${system(ship.system)?.name}${ship.system===1?' / '+window.nativeSolEconomy.names[ship.port]:''}`,at);if(job.kind==='reposition'||job.requirements.returning)finish(state,ship,at);else schedule(state,ship,at+initialize(state).config.handlingSeconds);return;
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
      delete ship.localLeg;job.phase='mining';ship.phase='mining';ship.miningStartedAt=at;ship.miningSourceX=ship.x;ship.miningSourceY=ship.y;schedule(state,ship,at+window.nativeAsteroidCombat.miningTiming.cutSeconds);return;
    }
    if(job.phase==='mining'){mine(state,ship,at);return;}
    if(job.phase==='collecting'){const rock=rockById(job.requirements.rockId,ship.system);if(rock)claimMined(state,ship,rock,at);else interrupt(state,ship,'resource unavailable',at);return;}
    if(job.phase==='repairing'){ship.hull=job.requirements.hull;ship.shields=job.requirements.shields;event(state,ship,'repaired','Paid repair completed',at);finish(state,ship,at);return;}
    if(job.phase==='idle'){finish(state,ship,at);return;}
    choose(state,ship,at);
  }
  function playerPosition(state){return state.system===1&&window.vexedSolFlight?.shipPosition?window.vexedSolFlight.shipPosition(state):{x:finite(state.x),y:finite(state.y)};}
  function detail(state,ship){
    if(!ship||['destroyed','disabled'].includes(ship.phase))return 'inactive';if(ship.journey||ship.phase==='warp')return 'transit';
    if(window.nativeShipDetail)return window.nativeShipDetail.isDetailed(state,ship,{category:'civilian',pose:localPose(state,ship)})?'detailed':'distant';
    const p=playerPosition(state),radius=initializeConfig(state).detailedRadius,pose=localPose(state,ship);return ship.system===state.system&&!state.landed&&Math.hypot(pose.x-p.x,pose.y-p.y)<=radius?'detailed':'distant';
  }
  function sample(state,ship,at){
    if(ship.localLeg&&(ship.task?.status==='active'||ship.dockingMove))window.nativeShipMotion.sampleLeg(ship,ship.localLeg,at);
    if(ship.journey){ship.journey.progress=clamp((at-ship.journey.departedAt)/ship.journey.duration,0,1);ship.timer=Math.max(0,ship.journey.arrivalAt-at);}
    if(ship.task){const job=ship.task;job.progress=job.status==='completed'?1:['transit','mining-transit'].includes(job.phase)?.2+(ship.journey?.progress||0)*.6:job.phase==='approaching'?.85:job.phase==='unloading'?.95:job.phase==='mining'?.5:0;}
  }
  function advance(state,dt){
    if(window.nativeSimulation.blocked()||!Number.isFinite(dt)||dt<=0)return;
    const started=performance.now(),life=initialize(state),rt=runtime.get(state),at=now(state),m=rt.stats;m.detailedShips=0;m.distantUpdates=0;m.scheduledEvents=0;
    if(access())auditAccess(state,life,rt);
    advanceEconomy(state,at);
    const local=rt.bySystem.get(state.system)||new Set();
    // Only the player's location is sampled every frame. No artwork is prepared
    // for distant lives or for opening the map.
    for(const id of local){const ship=rt.byId.get(id);if(detail(state,ship)!=='detailed'||ship.scriptedDemo||ship.disputeId||ship.retaliationId)continue;sample(state,ship,at);m.detailedShips++;}
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
  function galaxyPosition(state,ship){
    if(ship.journey){const j=ship.journey,p=clamp((now(state)-j.departedAt)/j.duration,0,1);return {x:j.galaxyFrom.x+(j.galaxyTo.x-j.galaxyFrom.x)*p,y:j.galaxyFrom.y+(j.galaxyTo.y-j.galaxyFrom.y)*p};}
    const a=anchor(ship.system),pose=localPose(state,ship);return {x:a.x+pose.x,y:a.y+pose.y};
  }
  function localPose(state,ship){const pose={x:ship.x,y:ship.y,heading:ship.heading,speed:ship.speed,motionKick:ship.motionKick};if(ship.localLeg)window.nativeShipMotion.sampleLeg(pose,ship.localLeg,Math.min(now(state),ship.nextActionAt));return pose;}
  function descriptors(state){initialize(state);return state.civilianTraffic.ships.map(ship=>{const pose=localPose(state,ship);return {id:ship.id,category:'civilian',entity:ship,name:ship.name,role:ship.role,faction:ship.ownerGovernmentId,system:ship.system,x:pose.x,y:pose.y,heading:pose.heading,detail:detail(state,ship),galaxy:galaxyPosition(state,ship),location:{kind:ship.journey?'transit':'local',system:ship.system,port:ship.port},task:ship.task||null,journey:ship.journey||null,events:ship.recentEvents,nextActionAt:ship.nextActionAt};});}
  function inspect(state,id){const ship=find(state,id);if(!ship)return null;const d=descriptors(state).find(s=>s.id===ship.id);return {id:ship.id,name:ship.name,category:'civilian',role:ship.role,faction:ship.ownerGovernmentId,home:ship.homeBase,location:d.location,galaxy:d.galaxy,detail:d.detail,
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
    const m=market(state,state.system,port),unit=minerals().orePrice(state.system,type),payment=unit*amount;
    return {ok:true,type,name:ore.name,tons:amount,unit,total:payment,held:minerals().held(state,type),funded:availableFunds(m)>=payment,room:m.stock[0]+m.incoming[0]+amount<=9999};
  }
  function sellMineral(state,type,port,tons=1){
    const quote=mineralQuote(state,type,port,tons);if(!quote.ok)return quote;
    const result=exchange(state,market(state,state.system,port),state,{good:0,tons:quote.tons,payment:quote.total,buy:false,player:true,mineral:type});
    return result.ok?{...result,message:`Sold ${quote.tons} ${quote.name} to the local refinery for ${quote.total} latinum.`}:result;
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
    return {ok:true,message:quote.name+' level '+(quote.level+1)+' installed on this hull.'};
  }
  window.nativeNpcLives={initialize,advance,descriptors,find,galaxyPosition,pose:localPose,detail,inspect,metrics,registerRole,configure,visit,startDelivery,startDemo,interrupt,resumeWork,market,exchange,refreshLocation,availableFunds,demand,mineralQuote,sellMineral,upgradeMinerals,
    scheduled:state=>{initialize(state);return runtime.get(state).heap.length;}};
})();
