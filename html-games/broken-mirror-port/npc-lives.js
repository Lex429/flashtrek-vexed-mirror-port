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
  function anchor(id){
    const own=window.nativeManualFlight?.anchor(id);if(own)return own;
    const earth=system(1)?.mapPosition||{x:0,y:0},p=system(id)?.mapPosition||({51:{x:-250,y:-125},52:{x:-220,y:-160}}[id]);
    return p?{x:(p.x-earth.x)*1000,y:(p.y-earth.y)*1000}:{x:0,y:0};
  }
  function berth(systemId,port,id=0){
    if(systemId===1){const body=window.nativeSystemHub?.sol?.find(b=>b.id===port);if(body)return {x:finite(body.x)+180+(id%4)*35,y:finite(body.y)-130+(id%3)*35};}
    return {x:-130+(id%4)*35,y:80+(id%3)*35};
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
    life.economicLedger||={version:1,produced:costs.map(()=>0),consumed:costs.map(()=>0),householdSpending:0,cycles:0};
    life.economicLedger.initialMarketCredits??=0;life.economicLedger.initialMarketGoods||=costs.map(()=>0);
    life.economicLedger.lost||=costs.map(()=>0);
    life.config.secondsPerDay=window.nativeWorldTime?.secondsPerDay||120;
    let rt=runtime.get(state);
    if(!rt||rt.ships!==traffic.ships||rt.count!==traffic.ships.length){
      rt={ships:traffic.ships,count:traffic.ships.length,byId:new Map(),bySystem:new Map(),indexedSystems:new Map(),heap:[],lastNow:now(state),stats:{detailedShips:0,distantUpdates:0,scheduledEvents:0,backlog:0,simulationMs:0}};
      runtime.set(state,rt);
      for(const ship of traffic.ships){migrateShip(state,ship,life);rt.byId.set(ship.id,ship);indexMove(rt,ship);if(Number.isFinite(ship.nextActionAt))push(rt.heap,{at:ship.nextActionAt,id:ship.id,token:ship.lifeScheduleToken});}
      for(const m of Object.values(life.markets))if(m.system===1&&state.solEconomy){state.solEconomy.stockReserved||={};state.solEconomy.stockReserved[m.port]=m.reserved;state.solEconomy.incomingReserved||={};state.solEconomy.incomingReserved[m.port]=m.incoming;m.stock=state.solEconomy.ports[m.port]||m.stock;}
      migrateContracts(state,life,rt);
    }
    return life;
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
    // Sol goods are the SAME inventory used by the player and existing tugs.
    if(systemId===1&&state.solEconomy?.ports?.[port]){m.stock=state.solEconomy.ports[port];state.solEconomy.stockReserved||={};state.solEconomy.stockReserved[port]=m.reserved;state.solEconomy.incomingReserved||={};state.solEconomy.incomingReserved[port]=m.incoming;}
    marketStates.set(m,state);return m;
  }
  const available=(m,g)=>Math.max(0,finite(m.stock[g])-finite(m.reserved[g]));
  const cargoTons=ship=>finite(ship.cargo?.tons)+finite(ship.oreHold);
  const capacity=ship=>Math.max(0,finite(stats(ship).cargo)-cargoTons(ship));
  const buyPrice=(m,g)=>costs[g];
  const sellPrice=(m,g)=>Math.ceil(costs[g]*(finite(m.stock[g])<m.target[g]?1.35:1));
  const availableFunds=m=>Math.max(0,finite(m.credits)-finite(m.fundsReserved));
  const demand=(m,g)=>{
    const tugs=m.system===1?marketStates.get(m)?.solEconomy?.freighters||[]:[];
    const companyIncoming=tugs.reduce((n,ship)=>n+(!['disabled','destroyed'].includes(ship.phase)&&ship.assignment?.to===m.port&&ship.assignment.good===g?finite(ship.assignment.tons):0),0);
    return Math.max(0,finite(m.target[g])-finite(m.stock[g])-finite(m.incoming?.[g])-companyIncoming);
  };
  function release(state,ship,sourceOnly=false){
    const life=initialize(state),reservation=life.reservations[ship.task?.id];if(!reservation)return;
    if(reservation.sourceReserved!==false){const source=market(state,reservation.system,reservation.port);source.reserved[reservation.good]=Math.max(0,finite(source.reserved[reservation.good])-reservation.tons);reservation.sourceReserved=false;}
    if(sourceOnly)return;
    if(reservation.destinationReserved){const destination=market(state,reservation.destination.system,reservation.destination.port);destination.incoming[reservation.good]=Math.max(0,finite(destination.incoming[reservation.good])-reservation.tons);destination.fundsReserved=Math.max(0,finite(destination.fundsReserved)-reservation.payment);reservation.destinationReserved=false;}
    delete life.reservations[ship.task.id];
  }
  function reserveBuyer(state,ship,destination,at){
    const cargo=ship.cargo,job=ship.task;if(!cargo||cargo.tons<=0)return false;
    const payment=cargo.tons*sellPrice(destination,cargo.good);
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
      old.port=portFor(state,old.system,old.port);old.destination.port=portFor(state,old.destination.system,old.destination.port);
      const source=market(state,old.system,old.port),destination=market(state,old.destination.system,old.destination.port);
      life.reservations[job.id]=old;if(old.sourceReserved!==false)source.reserved[old.good]+=old.tons;
      destination.incoming[old.good]+=old.tons;destination.fundsReserved+=old.payment;
    }
    for(const ship of rt.byId.values()){
      const job=ship.task;if(job?.status!=='active'||job.deliveredAt!==undefined)continue;
      if(ship.localLeg){const result=window.nativeShipMotion.sampleLeg({...ship},ship.localLeg,now(state));
        if(result.invalid){interrupt(state,ship,'invalid route');continue;}
        if(!Number.isFinite(ship.nextActionAt))schedule(state,ship,result.arrived?now(state):ship.localLeg.startedAt+ship.localLeg.duration);}
      if(job.origin)job.origin.port=portFor(state,job.origin.system,job.origin.port);
      if(job.destination)job.destination.port=portFor(state,job.destination.system,job.destination.port);
      if(ship.cargo){ship.cargo.toPort=portFor(state,ship.cargo.toSystem??job.destination.system,ship.cargo.toPort);ship.cargo.fromPort=portFor(state,ship.cargo.fromSystem??job.origin.system,ship.cargo.fromPort);}
      const old=saved[job.id],good=ship.cargo?.good??job.requirements?.good,tons=ship.cargo?.tons??old?.tons??job.requirements?.tons;
      if(!Number.isInteger(good)||!costs[good]||!(tons>0)||(!ship.cargo&&!old))continue;
      const destination=market(state,job.destination.system,job.destination.port),source=market(state,job.origin.system,job.origin.port);
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
    initialize(state);const ship=find(state,id);if(!ship||ship.journey||cargoTons(ship)>0||['destroyed','disabled'].includes(ship.phase))return {ok:false,error:'Ship unavailable or carrying cargo.'};
    if(!Number.isFinite(ship.x)||!Number.isFinite(ship.y)){interrupt(state,ship,'invalid route');return {ok:false,error:'Invalid loading route.'};}
    const fromSystem=Number(options.fromSystem??ship.system),fromPort=portFor(state,fromSystem,Number(options.fromPort??(fromSystem===1?ship.port||3:0)));
    if(ship.system!==fromSystem)return {ok:false,error:'Ship is not at the loading system.'};
    const at=finite(options.at,now(state)),toSystem=Number(options.toSystem??initialize(state).config.connectedSystems.find(s=>s!==fromSystem)),toPort=portFor(state,toSystem,Number(options.toPort??(toSystem===1?3:0))),good=Number(options.good??5);
    if(!Number.isInteger(good)||!costs[good]||!system(fromSystem)||!system(toSystem)||fromSystem===toSystem&&fromPort===toPort)return {ok:false,error:'Choose a valid commodity and distinct market.'};
    const source=market(state,fromSystem,fromPort),destination=market(state,toSystem,toPort),unitBuyPrice=buyPrice(source,good),unitSellPrice=sellPrice(destination,good),tons=Math.floor(Math.min(finite(options.tons,8),capacity(ship),available(source,good),demand(destination,good),Math.floor(ship.credits/unitBuyPrice),Math.floor(availableFunds(destination)/unitSellPrice)));
    if(tons<=0)return {ok:false,error:'No affordable unreserved stock, purchasing funds or unmet demand.'};
    if(ship.task?.status==='active')release(state,ship);
    const job=task(state,ship,ship.role==='trading'?'trade':'freight',options.reason||`${system(toSystem)?.name||toSystem} needs ${window.nativeSolEconomy.goods[good]}; available stock and payment verified`,{system:fromSystem,port:fromPort},{system:toSystem,port:toPort},{good,tons,credits:tons*buyPrice(source,good)},at);
    source.reserved[good]=finite(source.reserved[good])+tons;
    const payment=tons*unitSellPrice;destination.incoming[good]+=tons;destination.fundsReserved+=payment;
    job.agreement={version:1,unitBuyPrice,unitSellPrice,payment,acceptedAt:at};
    initialize(state).reservations[job.id]={version:2,system:fromSystem,port:fromPort,good,tons,owner:ship.id,sourceReserved:true,destination:{system:toSystem,port:toPort},destinationReserved:true,payment,unitPrice:unitSellPrice};
    if(ship.port!==fromPort||Math.hypot(ship.x-berth(fromSystem,fromPort,ship.id).x,ship.y-berth(fromSystem,fromPort,ship.id).y)>15){
      job.phase='pickup-flight';if(!localLeg(state,ship,berth(fromSystem,fromPort,ship.id),at,'pickup-flight'))return {ok:false,error:'Invalid loading route.'};
    }else{job.phase='loading';ship.phase='docked';schedule(state,ship,at+initialize(state).config.handlingSeconds);}
    return {ok:true,shipId:ship.id,taskId:job.id,tons,good,origin:job.origin,destination:job.destination};
  }
  function chooseDelivery(state,ship,at){
    const life=initialize(state),from=ship.system,port=from===1?(state.solEconomy?.ports?.[ship.port]?ship.port:3):0;
    const source=market(state,from,port),connected=[...new Set([from,...life.config.connectedSystems,ship.homeBase.system])];let best=null;
    for(const to of connected){if(to===from||!system(to))continue;const destination=market(state,to,to===1?3:0);
      for(let good=0;good<costs.length;good++){
        const shortage=demand(destination,good),tons=Math.floor(Math.min(16,capacity(ship),available(source,good),shortage,ship.credits/buyPrice(source,good),availableFunds(destination)/sellPrice(destination,good)));
        if(tons<=0)continue;const score=tons*(sellPrice(destination,good)-buyPrice(source,good)+2)/(1+Math.hypot(anchor(to).x-anchor(from).x,anchor(to).y-anchor(from).y)/100000);
        if(!best||score>best.score)best={to,good,tons,score};
      }
    }
    return best?startDelivery(state,ship.id,{fromSystem:from,fromPort:port,toSystem:best.to,toPort:best.to===1?3:0,good:best.good,tons:best.tons,at}):{ok:false};
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
    const approach=berth(destination,ship.cargo?.toPort??(destination===1?3:0),ship.id),direction=Math.atan2(b.y-a.y,b.x-a.x);
    const to={x:approach.x-Math.cos(direction)*1400,y:approach.y-Math.sin(direction)*1400};
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
    if(ship.task.destination.system===ship.system){localLeg(state,ship,berth(ship.system,ship.task.destination.port,ship.id),at,'approaching');return;}
    const journey=createJourney(state,ship,ship.task.destination.system,at);ship.task.phase='transit';schedule(state,ship,journey.arrivalAt);
    event(state,ship,'departure',`Departed ${system(journey.origin)?.name} for ${system(journey.destination)?.name}`,at);
  }
  function load(state,ship,at){
    const job=ship.task,reservation=initialize(state).reservations[job.id],source=market(state,job.origin.system,job.origin.port);
    if(!reservation||finite(source.stock[reservation.good])<reservation.tons||ship.credits<job.requirements.credits||capacity(ship)<reservation.tons){interrupt(state,ship,'goods unavailable',at);return;}
    source.stock[reservation.good]-=reservation.tons;ship.credits-=job.requirements.credits;source.credits+=job.requirements.credits;
    ship.cargo={good:reservation.good,tons:reservation.tons,fromSystem:job.origin.system,fromPort:job.origin.port,toSystem:job.destination.system,toPort:job.destination.port,owner:ship.id,purchasedFor:job.requirements.credits,transactionId:`load:${job.id}`};
    release(state,ship,true);job.loadedAt=at;job.phase='loaded';
    event(state,ship,'loaded',`Loaded ${ship.cargo.tons} t ${window.nativeSolEconomy.goods[ship.cargo.good]}`,at,{stock:source.stock[ship.cargo.good],transactionId:ship.cargo.transactionId});depart(state,ship,at);
  }
  function unload(state,ship,at){
    const job=ship.task;if(job.deliveredAt!==undefined)return finish(state,ship,at);
    const cargo=ship.cargo;if(!cargo||cargo.toSystem!==ship.system){interrupt(state,ship,'cargo unavailable',at);return;}
    let reservation=initialize(state).reservations[job.id];
    const destination=market(state,job.destination.system,job.destination.port);
    if(!reservation?.destinationReserved){if(!reserveBuyer(state,ship,destination,at)){recoverPayment(state,ship,at);return;}reservation=initialize(state).reservations[job.id];}
    const payment=reservation.payment;
    if(reservation.destination.system!==ship.system||reservation.destination.port!==ship.port||reservation.good!==cargo.good||reservation.tons!==cargo.tons||destination.credits<payment){release(state,ship);recoverPayment(state,ship,at);return;}
    destination.stock[cargo.good]=finite(destination.stock[cargo.good])+cargo.tons;destination.credits-=payment;ship.credits+=payment;
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
    for(const id of destinations){if(!system(id))continue;const ports=id===1?[job.destination.system===1?job.destination.port:3,job.origin.system===1?job.origin.port:3,1,4,5]:[0];
      for(const port of new Set(ports)){const m=market(state,id,port),price=sellPrice(m,cargo.good);if(demand(m,cargo.good)<cargo.tons||availableFunds(m)<cargo.tons*price)continue;
        const distance=Math.hypot(anchor(id).x-anchor(ship.system).x,anchor(id).y-anchor(ship.system).y),score=price/(1+distance/100000);
        if(!buyer||score>buyer.score)buyer={market:m,score};}}
    if(buyer&&reserveBuyer(state,ship,buyer.market,at)){
      recovery.resolvedAt=at;recovery.outcome='rerouted';job.status='active';delete job.failureReason;job.reason='A funded buyer has unmet demand for the cargo retained aboard';event(state,ship,'rerouted',`Funded buyer agreed ${job.agreement.payment} credits; cargo retained and a real dock journey scheduled`,at,{destination:{...job.destination}});depart(state,ship,at);return;
    }
    if(at>=recovery.deadlineAt||recovery.attempts>=5){
      release(state,ship);job.phase='payment-idle';job.status='blocked';job.failureReason=`No legitimate funded buyer within the ${life.config.paymentRecoverySeconds}-second recovery window; owned cargo remains aboard`;job.reason='Cargo held safely: no funded buyer has unmet demand. Recheck after the next economic cycle.';recovery.outcome='cargo-held';ship.phase='docked';delete ship.localLeg;schedule(state,ship,Math.max(at,now(state))+life.config.economyInterval);
      event(state,ship,'idle','Recovery ended: no funded buyer has unmet demand. Cargo remains owned aboard; recheck at the next economic cycle.',at);return;
    }
    job.phase='waiting-payment';schedule(state,ship,Math.max(at,now(state))+life.config.paymentRetrySeconds);
    event(state,ship,'waiting',`No funded buyer; cargo retained. Recovery deadline ${Math.ceil(recovery.deadlineAt)} simulation seconds`,at);
  }
  function finish(state,ship,at){ship.task.status='completed';ship.task.phase='completed';ship.task.completedAt=at;ship.task.progress=1;ship.phase='docked';delete ship.localLeg;schedule(state,ship,at+4);}
  function interrupt(state,ship,reason,at=now(state)){
    initialize(state);release(state,ship);
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
    if(ship.system!==1||capacity(ship)<1||stats(ship).capabilities.canMine===false)return false;
    const life=initialize(state),rocks=window.nativeSolAsteroids?.placements||[],rock=rocks.find(r=>!r.demo&&!state.minedAsteroids?.includes(r.slotId)&&!state.destroyedAsteroids?.includes(r.slotId)&&!life.reservations[`rock:${r.slotId}`]&&r.slotId!==window.nativeAsteroidCombat?.miningId);
    if(!rock)return false;
    const job=task(state,ship,'mining',`Available ${rock.oreLabel||'ore'} claim and free cargo space`,{system:1,port:ship.port},{system:1,port:1},{rockId:rock.slotId,capacity:capacity(ship)},at);
    ship.miningReservation=rock.slotId;ship.miningRockSlot=rock.slotId;life.reservations[`rock:${rock.slotId}`]={owner:ship.id,taskId:job.id};
    localLeg(state,ship,{x:rock.x+110,y:rock.y+40},at,'mining-flight');return true;
  }
  function mine(state,ship,at){
    const rock=window.nativeSolAsteroids?.placements?.find(r=>r.slotId===ship.task.requirements.rockId);
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
    ship.cargo={good:0,tons:ship.oreHold,owner:ship.id,toSystem:1,toPort:1,fromSystem:1,fromPort:ship.port};ship.oreHold=0;
    ship.task.destination={system:1,port:1};localLeg(state,ship,berth(1,1,ship.id),at,'approaching');
  }
  function choose(state,ship,at){
    if(ship.oreHold>0&&!ship.cargo){ship.cargo={good:0,tons:ship.oreHold,owner:ship.id,fromSystem:ship.system,fromPort:ship.port,toSystem:1,toPort:1};ship.oreHold=0;}
    if(ship.cargo){if(!ship.task||ship.task.status!=='active')task(state,ship,'freight','Find a funded buyer for cargo already owned aboard',{system:ship.cargo.fromSystem||ship.system,port:ship.cargo.fromPort??ship.port},{system:ship.cargo.toSystem||ship.system,port:ship.cargo.toPort||0},{good:ship.cargo.good,tons:ship.cargo.tons},at);
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
    if(ship.role==='mining'&&chooseMining(state,ship,at))return;
    if(chooseDelivery(state,ship,at).ok)return;
    task(state,ship,'idle','No affordable stock, destination shortage, repair or available mining claim',{system:ship.system,port:ship.port},{system:ship.system,port:ship.port},{},at);ship.task.phase='idle';ship.phase='docked';schedule(state,ship,Math.max(at,now(state))+initialize(state).config.idleSeconds);
  }
  function action(state,ship,at){
    if(['destroyed','disabled'].includes(ship.phase)){interrupt(state,ship,ship.phase,at);return;}
    if(ship.scriptedDemo||ship.disputeId||ship.retaliationId||['fighting','ore-theft'].includes(ship.phase)){schedule(state,ship,now(state)+5);return;}
    const job=ship.task;
    if(job?.status==='blocked'&&job.phase==='payment-idle'){if(ship.cargo)recoverPayment(state,ship,at);else choose(state,ship,at);return;}
    if(!job||job.status!=='active'){choose(state,ship,at);return;}
    if(job.phase==='pickup-flight'){if(!arriveLeg(state,ship,at))return;ship.port=job.origin.port;delete ship.localLeg;job.phase='loading';ship.phase='docked';schedule(state,ship,at+initialize(state).config.handlingSeconds);return;}
    if(job.phase==='loading'){load(state,ship,at);return;}
    if(job.phase==='loaded'){depart(state,ship,at);return;}
    if(job.phase==='transit'){
      const journey=ship.journey;if(!journey){depart(state,ship,at);return;}
      const oldSystem=ship.system;ship.system=journey.destination;Object.assign(ship,journey.to);ship.heading=Math.atan2(journey.galaxyTo.y-journey.galaxyFrom.y,journey.galaxyTo.x-journey.galaxyFrom.x);
      ship.lastJourney={...journey,progress:1,arrivedAt:at};ship.journey=null;ship.destinationSystem=null;ship.legs=finite(ship.legs)+1;indexMove(runtime.get(state),ship,oldSystem);
      event(state,ship,'arrival',`Arrived at ${system(ship.system)?.name}; approaching destination dock`,at);localLeg(state,ship,berth(ship.system,job.destination.port,ship.id),at,'approaching');return;
    }
    if(job.phase==='approaching'){
      if(!arriveLeg(state,ship,at))return;ship.port=job.destination.port;ship.phase='docked';delete ship.localLeg;job.phase='unloading';event(state,ship,'docked',`Docked at ${system(ship.system)?.name}${ship.system===1?' / '+window.nativeSolEconomy.names[ship.port]:''}`,at);if(job.kind==='reposition')finish(state,ship,at);else schedule(state,ship,at+initialize(state).config.handlingSeconds);return;
    }
    if(job.phase==='unloading'||job.phase==='waiting-payment'){unload(state,ship,at);return;}
    if(job.phase==='mining-flight'){
      if(!arriveLeg(state,ship,at))return;delete ship.localLeg;job.phase='mining';ship.phase='mining';ship.miningStartedAt=at;ship.miningSourceX=ship.x;ship.miningSourceY=ship.y;schedule(state,ship,at+window.nativeAsteroidCombat.miningTiming.cutSeconds);return;
    }
    if(job.phase==='mining'){mine(state,ship,at);return;}
    if(job.phase==='collecting'){const rock=window.nativeSolAsteroids?.placements?.find(r=>r.slotId===job.requirements.rockId);if(rock)claimMined(state,ship,rock,at);else interrupt(state,ship,'resource unavailable',at);return;}
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
    if(ship.localLeg&&ship.task?.status==='active')window.nativeShipMotion.sampleLeg(ship,ship.localLeg,at);
    if(ship.journey){ship.journey.progress=clamp((at-ship.journey.departedAt)/ship.journey.duration,0,1);ship.timer=Math.max(0,ship.journey.arrivalAt-at);}
    if(ship.task){const job=ship.task;job.progress=job.status==='completed'?1:job.phase==='transit'?.2+ship.journey.progress*.6:job.phase==='approaching'?.85:job.phase==='unloading'?.95:job.phase==='mining'?.5:0;}
  }
  function advance(state,dt){
    if(window.nativeSimulation.blocked()||!Number.isFinite(dt)||dt<=0)return;
    const started=performance.now(),life=initialize(state),rt=runtime.get(state),at=now(state),m=rt.stats;m.detailedShips=0;m.distantUpdates=0;m.scheduledEvents=0;
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
      for(const id of life.config.connectedSystems){const m=market(state,id,id===1?3:0);
        if(id!==1){const made=Math.max(0,Math.min(Math.floor(12*scale),300-finite(m.stock[m.specialty])));m.stock[m.specialty]+=made;ledger.produced[m.specialty]+=made;}
        for(let good=0;good<costs.length;good++)if(good!==m.specialty){
          const used=Math.min(Math.floor(4*scale),available(m,good)),payment=used*Math.ceil(costs[good]*1.35);
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
  function localPose(state,ship){const pose={x:ship.x,y:ship.y,heading:ship.heading,speed:ship.speed};if(ship.localLeg)window.nativeShipMotion.sampleLeg(pose,ship.localLeg,Math.min(now(state),ship.nextActionAt));return pose;}
  function descriptors(state){initialize(state);return state.civilianTraffic.ships.map(ship=>{const pose=localPose(state,ship);return {id:ship.id,category:'civilian',entity:ship,name:ship.name,role:ship.role,faction:ship.ownerGovernmentId,system:ship.system,x:pose.x,y:pose.y,heading:pose.heading,detail:detail(state,ship),galaxy:galaxyPosition(state,ship),location:{kind:ship.journey?'transit':'local',system:ship.system,port:ship.port},task:ship.task||null,journey:ship.journey||null,events:ship.recentEvents,nextActionAt:ship.nextActionAt};});}
  function inspect(state,id){const ship=find(state,id);if(!ship)return null;const d=descriptors(state).find(s=>s.id===ship.id);return {id:ship.id,name:ship.name,category:'civilian',role:ship.role,faction:ship.ownerGovernmentId,home:ship.homeBase,location:d.location,galaxy:d.galaxy,detail:d.detail,
    task:ship.task,journey:ship.journey||null,lastJourney:ship.lastJourney||null,cargo:ship.cargo,oreHold:ship.oreHold,credits:ship.credits,hull:ship.hull,shields:ship.shields,equipment:ship.weaponLoadout||ship.weapons,events:ship.recentEvents,nextActionAt:ship.nextActionAt};}
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
  window.nativeNpcLives={initialize,advance,descriptors,find,galaxyPosition,pose:localPose,detail,inspect,metrics,registerRole,configure,visit,startDelivery,startDemo,interrupt,resumeWork,market,refreshLocation,availableFunds,demand,
    scheduled:state=>{initialize(state);return runtime.get(state).heap.length;}};
})();
