/* Saved repair equipment and material accounting. Civilian lives own rescue travel;
   shared motion, damage and effects own every launched Dot. Painting is read-only. */
(() => {
  'use strict';
  const BASIC=9001,EPS=1e-7,HULL_PER_TON=5,RATE=1.5,MEDICAL_STOCK=200;
  // A maintenance Dot is a small service craft, about 30% of a Runabout.
  const DOT_SIZE=3.5,DOT_SCALE=DOT_SIZE/41.382;
  const initialized=new WeakSet(),runtimes=new WeakMap(),clock=s=>window.nativeSimulation.seconds(s);
  const qty=n=>Math.max(0,Number(n)||0),alive=e=>e&&e.hull>0&&e.phase!=='destroyed';
  const definition=(s,e,category)=>window.nativeShipDefinitions.forEntity(s,e,{category});
  const medical=e=>definition(null,e,'civilian').capabilities.medical===true;
  const policy=e=>definition(null,e,'civilian').npcPolicy.supplies;
  const ref=(category,e)=>({category,id:category==='player'?'player':e.id,generation:e.lifeGeneration||0});
  const key=r=>`${r.category}:${r.id}:${r.generation||0}`;
  function resolve(s,r){
    if(!r)return null;
    const e=r.category==='player'?s:r.category==='tug'?(window.nativeSolEconomy?.find?window.nativeSolEconomy.find(s,r.id):s.solEconomy?.freighters.find(e=>e.id===r.id)):(window.nativeNpcLives?.find?window.nativeNpcLives.find(s,r.id):s.civilianTraffic?.ships.find(e=>e.id===r.id));
    return e&&(e.lifeGeneration||0)===(r.generation||0)?e:null;
  }
  const fleet=s=>[{category:'player',entity:s},...(s.solEconomy?.freighters||[]).map(entity=>({category:'tug',entity})),...(s.civilianTraffic?.ships||[]).map(entity=>({category:'civilian',entity}))];
  function pose(s,r){const e=resolve(s,r);if(!e)return null;return window.nativeShipDefinitions.describe(s,e,{category:r.category});}
  function bay(s,e,category){
    window.nativeShipEquipment.ensure(s,e);e.repairDeuranium??=0;return e.repairBay;
  }
  // Mutation hooks maintain the existing repair owner's working set. They never
  // initialize another owner while a population migration is in progress.
  function observe(s,e,category){
    const rt=runtimes.get(s);if(!rt||!e||!['player','civilian','tug'].includes(category))return;
    const old=rt.known.get(e),revision=window.nativeShipDefinitions.revision?.()||0;
    let item=old;
    if(!old||old.type!==e.shipType||old.revision!==revision||old.reference.generation!==(e.lifeGeneration||0)){
      if(old){rt.disabled.delete(old.key);rt.medical.delete(old.key);rt.tugs.delete(old.key);rt.dead.delete(old.key);}
      item={entity:e,category,reference:ref(category,e),type:e.shipType,revision,medical:category==='civilian'&&medical(e)};
      item.key=key(item.reference);rt.known.set(e,item);
    }
    if(alive(e)&&e.phase==='disabled')rt.disabled.set(item.key,item);else rt.disabled.delete(item.key);
    if(alive(e)&&item.medical)rt.medical.set(item.key,item);else rt.medical.delete(item.key);
    if(category==='tug'&&alive(e))rt.tugs.set(item.key,item);else rt.tugs.delete(item.key);
    if(!alive(e)&&!item.deadHandled)rt.dead.set(item.key,item);else if(alive(e)){rt.dead.delete(item.key);item.deadHandled=false;}
  }
  function census(s){
    const rt=runtimes.get(s);rt.disabled.clear();rt.medical.clear();rt.tugs.clear();rt.dead.clear();
    for(const {category,entity} of fleet(s))observe(s,entity,category);
    rt.dirty=false;
  }
  function invalidateMembership(s){const rt=runtimes.get(s);if(rt)rt.dirty=true;}

  function initialize(s){
    if(initialized.has(s))return s.shipRepairs;
    const r=s.shipRepairs||={version:1,sequence:0,calls:[],missions:[],ledger:{consumed:0,lost:0,medicalCapital:0},nextPollAt:clock(s)};
    r.calls||=[];r.missions||=[];r.ledger||={consumed:0,lost:0,medicalCapital:0};
    initialized.add(s);
    runtimes.set(s,{known:new WeakMap(),previousPoses:new WeakMap(),disabled:new Map(),medical:new Map(),tugs:new Map(),dead:new Map(),dirty:false,audit:0});
    // Install medical crews once in the existing persistent fleet. Initial capital
    // is an explicit source; later deuranium comes from paid markets or finite mining.
    if(!r.medicalFleetVersion&&s.civilianTraffic?.ships){
      r.medicalFleetVersion=1;
      let id=Math.max(-1,...s.civilianTraffic.ships.map(e=>e.id))+1;
      const homes=[1,4,14];
      for(const home of homes){
        const system=window.nativeCivilianAccess?.nearestHome(s,home)??home,type=definition(s,{shipType:58},'civilian');
        const e={id:id++,shipType:58,name:`Olympic Medical ${id}`,role:'medical',ownerGovernmentId:1,homeSystem:1,stationSystem:system,operatingBase:system,
          system,port:system===1?1:0,x:0,y:0,heading:-Math.PI/2,speed:0,phase:'docked',timer:1,hull:type.hull,shields:type.shields,cargo:null,oreHold:0,credits:15000,legs:0,deliveries:0,mined:0,deals:0};
        s.civilianTraffic.ships.push(e);r.ledger.medicalCapital+=15000;
      }
    }
    for(const {category,entity} of fleet(s))bay(s,entity,category);
    census(s);
    return r;
  }
  function supplies(s,r){return qty(r.category==='player'?s.deuranium:resolve(s,r)?.repairDeuranium);}
  function consume(s,r,tons){
    tons=Math.min(qty(tons),supplies(s,r));const e=resolve(s,r);if(!e)return 0;
    if(r.category==='player')s.deuranium=Math.max(0,qty(s.deuranium)-tons);else e.repairDeuranium=Math.max(0,qty(e.repairDeuranium)-tons);
    s.shipRepairs.ledger.consumed+=tons;return tons;
  }
  function destroyed(s,e,category){
    if(!s.shipRepairs||category==='repair-drone')return;
    const rt=runtimes.get(s),item=rt?.known.get(e);if(item){item.deadHandled=true;rt.dead.delete(item.key);}
    if(category!=='player'){s.shipRepairs.ledger.lost+=qty(e.repairDeuranium);e.repairDeuranium=0;}
    for(const d of [...(e.repairBay?.slots||[]),...Object.values(e.shipEquipment?.instances||{}).filter(d=>d.category==='repairDrone'&&!['stowed','destroyed'].includes(d.phase))]){d.hull=0;d.phase='destroyed';delete d.localLeg;}
  }
  function announce(s,r,text){
    const e=resolve(s,r);if(!e)return;
    const p=pose(s,r);window.nativeCivilianTraffic?.hail?.(s,{...e,id:r.category==='player'?'player':e.id,name:r.category==='player'?'Your ship':e.name,system:p.system,x:p.x,y:p.y},text);
  }
  const active=m=>m.status==='active';
  function missionFor(s,r){return s.shipRepairs.missions.find(m=>active(m)&&key(m.target)===key(r));}
  function callFor(s,r){return s.shipRepairs.calls.find(c=>['queued','claimed','servicing'].includes(c.status)&&key(c.target)===key(r));}
  function distress(s,r){
    if(callFor(s,r))return;
    const p=pose(s,r),c={id:`distress:${++s.shipRepairs.sequence}`,target:r,system:p.system,x:p.x,y:p.y,createdAt:clock(s),status:'queued',claim:null};
    s.shipRepairs.calls.push(c);announce(s,r,`Distress signal: disabled, ${supplies(s,r)>EPS?'no operational repair drones':'repair deuranium exhausted'}. Requesting medical assistance.`);
  }
  function restock(s,e){
    if(!alive(e)||e.journey||e.phase==='disabled')return 0;
    const b=window.nativePortDocking.inspect(s,e,false);
    if(b?.kind!=='berth'||b.port!==e.port||Math.hypot(e.x-b.x,e.y-b.y)>.01)return 0;
    const d=definition(s,e,'civilian'),target=medical(e)?policy(e).target:d.cargo<100?4:12;
    const committed=!e.cargo&&e.task?.phase==='loading'?qty(e.task.requirements?.tons):0;
    const room=Math.max(0,d.cargo-qty(e.cargo?.tons)-qty(e.oreHold)-qty(e.repairDeuranium)-committed);
    const committedPayment=!e.cargo&&e.task?.phase==='loading'?qty(e.task.requirements?.credits):0;
    const budget=Math.min(Math.max(0,qty(e.credits)-committedPayment),medical(e)?Infinity:qty(e.credits)*.25);
    const supply=medical(e)?policy(e):{good:7,price:55},m=window.nativeNpcLives.market(s,e.system,e.port),tons=Math.floor(Math.min(target-qty(e.repairDeuranium),room,qty(m.stock[supply.good])-qty(m.reserved[supply.good]),budget/supply.price));
    if(tons<1)return 0;
    const result=window.nativeNpcLives.exchange(s,m,e,{good:supply.good,tons,payment:tons*supply.price,buy:true,capacity:room,repairSupplies:true});
    return result.ok?tons:0;
  }
  function restockTug(s,e){
    if(!alive(e)||!['waiting','loading','unloading'].includes(e.phase))return;
    const stock=s.solEconomy.ports[e.port],reserved=s.solEconomy.stockReserved?.[e.port]?.[7]||0;
    if(!stock)return;
    const tons=Math.floor(Math.min(12-qty(e.repairDeuranium),definition(s,e,'tug').cargo-qty(e.tons)-qty(e.repairDeuranium),qty(stock[7])-reserved));
    if(tons>0){stock[7]-=tons;e.repairDeuranium=qty(e.repairDeuranium)+tons;}
  }
  function call(s,id){return s.shipRepairs?.calls.find(c=>c.id===id);}
  function claimed(s,e){const c=call(s,e.task?.requirements?.callId);return c&&c.claim===key(ref('civilian',e))&&['claimed','servicing'].includes(c.status)?c:null;}
  function validCall(s,c){const e=resolve(s,c?.target);return alive(e)&&e.phase==='disabled';}
  function releaseClaim(s,e){const c=claimed(s,e);if(c){c.claim=null;if(validCall(s,c))c.status='queued';else c.status=alive(resolve(s,c.target))?'completed':'lost';}}
  function rendezvous(s,c,e){
    const p=pose(s,c.target),d=window.nativeShipDefinitions.dimensions(e,'civilian');
    return {x:p.x+Math.max(p.dimensions.width,p.dimensions.height)/2+Math.max(d.width,d.height)/2+100,y:p.y};
  }
  function assign(s){
    const r=s.shipRepairs;
    for(const c of r.calls){
      if(!['queued','claimed','servicing'].includes(c.status))continue;
      if(!validCall(s,c)){c.status=alive(resolve(s,c.target))?'completed':'lost';c.claim=null;continue;}
      const p=pose(s,c.target);Object.assign(c,{system:p.system,x:p.x,y:p.y});
      if(c.claim){
        const e=runtimes.get(s).medical.get(c.claim)?.entity;
        if(!alive(e)||e.phase==='disabled'||e.task?.kind!=='medical'||e.task?.status!=='active'){c.claim=null;c.status='queued';}
        else continue;
      }
      const candidates=[...runtimes.get(s).medical.values()].map(item=>item.entity).filter(e=>alive(e)&&e.phase!=='disabled'&&!e.journey&&!e.disputeId&&!e.retaliationId&&!e.scriptedDemo&&e.task?.kind!=='medical'&&qty(e.repairDeuranium)>EPS&&bay(s,e,'civilian').slots.some(d=>d.phase==='stowed'&&d.hull>0));
      candidates.sort((a,b)=>{
        const distance=e=>{const p=window.nativeNpcLives.galaxyPosition(s,e),anchor=window.nativeManualFlight.anchor(c.system);return Math.hypot(p.x-anchor.x-c.x,p.y-anchor.y-c.y);};
        return distance(a)-distance(b)||a.id-b.id;
      });
      const e=candidates[0];if(!e)continue;
      c.claim=key(ref('civilian',e));c.status='claimed';c.claimedAt=clock(s);
      if(!window.nativeNpcLives.startRescue(s,e,c,clock(s))){c.claim=null;c.status='queued';continue;}
      announce(s,ref('civilian',e),'Medical team responding to distress. Repair drones standing by.');
    }
  }
  function dronePose(s,d){const p={...d};if(d.localLeg)window.nativeShipMotion.sampleLeg(p,d.localLeg,clock(s));return p;}
  function playerDronesDeployed(s){
    return !!s?.shipRepairs?.missions.some(m=>active(m)&&m.carrier.category==='player')||Object.values(s?.shipEquipment?.instances||{}).some(d=>d.category==='repairDrone'&&d.hull>0&&!['stowed','destroyed'].includes(d.phase));
  }
  const repairMode=s=>s?.repairDroneMode==='auto'?'auto':'manual';
  function setRepairMode(s,mode){
    if(!s||!['manual','auto'].includes(mode))return {ok:false,error:'Choose Manual or Auto repair mode.'};
    s.repairDroneMode=mode;
    const repairs=initialize(s);repairs.nextPollAt=Math.min(repairs.nextPollAt,clock(s));
    return {ok:true,mode};
  }
  function deploymentStatus(s){
    if(!alive(s))return {ok:false,error:'Hull destroyed',available:0};
    initialize(s);
    const drones=bay(s,s,'player').slots,available=drones.filter(d=>d.hull>0&&d.phase==='stowed').length;
    const unavailable=error=>({ok:false,error,available});
    if(playerDronesDeployed(s)||missionFor(s,ref('player',s)))return unavailable('Drones already deployed');
    if(s.hull>=definition(s,s,'player').hull-EPS)return unavailable('Hull fully repaired');
    if(!drones.length)return unavailable('No DOTs equipped');
    if(!available)return unavailable('No operational DOTs');
    if(supplies(s,ref('player',s))<=EPS)return unavailable('No repair deuranium');
    if(s.journey||s.pendingTransit||s.localCruise||s.arrivalApproach||s.phase==='warp')return unavailable('Finish travelling before deployment');
    if(s.shipRepairs.missions.filter(active).length>=16)return unavailable('Repair traffic busy; try again shortly');
    return {ok:true,available};
  }
  function deployPlayer(s,{automatic=false}={}){
    if(automatic&&repairMode(s)!=='auto')return {ok:false,error:'Automatic repairs are off.'};
    const status=deploymentStatus(s);if(!status.ok)return status;
    const player=ref('player',s),mission=launch(s,player,player,clock(s),{manual:!automatic,automatic});
    return mission?{ok:true,missionId:mission.id,drones:mission.drones.length}:{ok:false,error:'Unable to deploy repair drones.'};
  }
  function leg(d,goal,at,phase){
    d.localLeg=window.nativeShipMotion.planLeg(d,goal,window.nativeShipDefinitions.get(BASIC,'repair-drone').movement,at);
    if(d.phase!==phase)delete d.trafficControl;
    d.phase=phase;d.lastAt=at;d.motionAt=at;
  }
  function launch(s,carrier,target,at=clock(s),options={}){
    const origin=pose(s,carrier),dest=pose(s,target);
    const attached=!options.manual&&!options.automatic&&(moving(origin)||moving(dest)||carrier.category!=='player'&&key(carrier)===key(target));
    const result=attached?launchAttached(s,carrier,target,at):launchBay(s,carrier,target,at,options);
    if(result){invalidateMembership(s);window.nativeShipSystems?.invalidateShips?.(s,origin.system);}return result;
  }
  function returnDrone(s,m,d,at){return m.attachmentVersion===1?returnDroneAttached(s,m,d,at):returnDroneBay(s,m,d,at);}
  function advanceMission(s,m,at){
    const carrier=resolve(s,m.carrier),slots=carrier?.repairBay?.slots||[],ds=m.drones.map(id=>slots.find(d=>d.id===id)||carrier?.shipEquipment?.instances[id]).filter(Boolean),before=ds.map(d=>[d,d.x,d.y,d.phase]);
    if(m.attachmentVersion===1)advanceMissionAttached(s,m,at);else advanceMissionBay(s,m,at);
    if(before.some(([d,x,y,phase])=>['stowed','destroyed'].includes(phase)!==['stowed','destroyed'].includes(d.phase))){invalidateMembership(s);window.nativeShipSystems?.invalidateShips?.(s);}
    for(const [d,x,y] of before){d.previousX=x;d.previousY=y;window.nativeShipSystems.refreshShip(s,d,'repair-drone',d.system);}
    const target=resolve(s,m.target);if(target)window.nativeShipSystems.refreshShip(s,target,m.target.category);
  }
  function launchBay(s,carrier,target,at=clock(s),options={}){
    if(missionFor(s,target)||supplies(s,carrier)<=EPS||s.shipRepairs.missions.filter(active).length>=16)return null;
    const playerSelf=carrier.category==='player'&&key(carrier)===key(target);
    const manual=options.manual===true&&playerSelf,automatic=options.automatic===true&&playerSelf;
    const e=resolve(s,carrier),t=resolve(s,target);if(!alive(e)||!alive(t)||t.phase!=='disabled'&&!manual&&!automatic||t.hull>=definition(s,t,target.category).hull-EPS)return null;
    const origin=pose(s,carrier),dest=pose(s,target);if(origin.system!==dest.system||Math.hypot(origin.x-dest.x,origin.y-dest.y)>500)return null;
    const drones=bay(s,e,carrier.category).slots.filter(d=>d.hull>0&&d.phase==='stowed');if(!drones.length)return null;
    const m={id:`repair:${++s.shipRepairs.sequence}`,carrier,target,status:'active',startedAt:at,startHull:t.hull,restoredHull:0,spent:0,drones:drones.map(d=>d.id),workVersion:1};
    if(manual)m.manual=true;
    if(automatic)m.automatic=true;
    s.shipRepairs.missions.push(m);
    for(const [i,d] of drones.entries()){
      const a=(i/drones.length)*Math.PI*2,rx=dest.hullRadii.rx,ry=dest.hullRadii.ry;
      d.workSlot=i;d.workCount=drones.length;d.bayMission=true;
      const hatch=bayGeometry(origin);
      Object.assign(d,{x:hatch.dock.x,y:hatch.dock.y,previousX:hatch.dock.x,previousY:hatch.dock.y,heading:hatch.heading,speed:0,system:origin.system,missionId:m.id,carrier,target,approachTarget:{category:dest.category,id:dest.id}});
      if(key(carrier)!==key(target))configureWork(dest,d);
      else{
        updateWork(dest,d,0);
        const station=window.nativeRepairWork?.station(dest.dimensions.width,dest.dimensions.height,i);
        if(station){
          const clearance=Math.max(rx,ry)+30,factor=Math.max(1,clearance/(Math.hypot(station.x,station.y)||1));
          station.x*=factor;station.y*=factor;
        }
        d.workStation=station||{x:d.workLocal.x+Math.cos(a)*(32+rx*.5),y:d.workLocal.y+Math.sin(a)*(32+ry*.5)};
      }
      depart(d,origin,dest,at+i*.8,i>0);
    }
    window.nativeShipSystems.invalidate(s);return m;
  }
  function launchAttached(s,carrier,target,at=clock(s)){
    if(missionFor(s,target)||supplies(s,carrier)<=EPS||s.shipRepairs.missions.filter(active).length>=16)return null;
    const e=resolve(s,carrier),t=resolve(s,target);if(!alive(e)||!alive(t)||t.phase!=='disabled')return null;
    const origin=pose(s,carrier),dest=pose(s,target);if(origin.system!==dest.system||Math.hypot(origin.x-dest.x,origin.y-dest.y)>500)return null;
    const drones=bay(s,e,carrier.category).slots.filter(d=>d.hull>0&&d.phase==='stowed');if(!drones.length)return null;
    const m={id:`repair:${++s.shipRepairs.sequence}`,carrier,target,status:'active',startedAt:at,startHull:t.hull,restoredHull:0,spent:0,drones:drones.map(d=>d.id),attachmentVersion:1};
    observedPose(m,'carrierMotion',origin,at);observedPose(m,'targetMotion',dest,at);
    s.shipRepairs.missions.push(m);
    for(const [i,d] of drones.entries()){
      d.workSlot=i;configureWork(dest,d);
      const exit=attachmentBayPoint(origin);
      const heading=Math.atan2(exit.y-origin.y,exit.x-origin.x),vx=origin.vx||0,vy=origin.vy||0;
      const launchAt=at+i*.8;
      Object.assign(d,{x:exit.x,y:exit.y,heading,speed:Math.hypot(vx,vy),vx,vy,motionKick:Math.hypot(vx,vy)>.001?{version:1,mode:'free',vx,vy,inherited:true}:undefined,
        launchPending:true,launchAt,system:origin.system,missionId:m.id,carrier:carrier,target:target,approachTarget:{category:dest.category,id:dest.id}});
      delete d.trafficControl;
      if(moving(origin)||moving(dest)){delete d.localLeg;d.phase='launching';d.lastAt=launchAt;d.motionAt=launchAt;}
      else leg(d,attachmentStationPoint(dest,d),launchAt,'launching');
      window.nativeShipSystems.refreshShip(s,d,'repair-drone',d.system);
    }
    return m;
  }
  function localPoint(p,point){const a=p.heading+Math.PI/2,c=Math.cos(a),sn=Math.sin(a);return {x:p.x+point.x*c-point.y*sn,y:p.y+point.x*sn+point.y*c};}
  function attachment(p,direction){
    const {rx,ry}=p.hullRadii,length=Math.hypot(direction.x,direction.y),dx=direction.x/length,dy=direction.y/length;
    const r=1/Math.hypot(dx/rx,dy/ry),x=dx*r,y=dy*r,nx=x/(rx*rx),ny=y/(ry*ry),n=Math.hypot(nx,ny);
    return {x,y,nx:nx/n,ny:ny/n};
  }
  function configureWork(p,d){
    const config=p.definition.repair,site=attachment(p,config.work[(d.workSlot||0)%config.work.length]);
    d.workLocal={x:site.x,y:site.y};d.workNormal={x:site.nx,y:site.ny};
    const clearance=config.standOff+DOT_SIZE*.34;
    d.workStation={x:site.x+site.nx*clearance,y:site.y+site.ny*clearance};
  }
  function workPoint(p,d){return localPoint(p,d.workLocal);}
  function attachmentStationPoint(p,d){return localPoint(p,d.workStation);}
  function bayPoint(p){return attachmentBayPoint(p);}
  function stationPoint(p,d){return attachmentStationPoint(p,d);}
  function attachmentBayPoint(p){const site=attachment(p,p.definition.repair.bay),gap=DOT_SIZE*.34+.25;return localPoint(p,{x:site.x+site.nx*gap,y:site.y+site.ny*gap});}
  const moving=p=>p&&(Math.hypot(p.vx||0,p.vy||0)>.05||Math.abs(p.angularVelocity||0)>.01);
  function observedPose(m,key,p,at){
    if(!p)return null;
    const previous=m[key],dt=previous?at-previous.at:0;
    // Attachment velocity follows authoritative pose progress. This also keeps
    // old stationary saves/standalone owners with stale velocity fields honest.
    const vx=dt>EPS?(p.x-previous.x)/dt:previous?.vx??p.vx??0,vy=dt>EPS?(p.y-previous.y)/dt:previous?.vy??p.vy??0;
    const angularVelocity=dt>EPS?window.nativeShipMotion.wrap(p.heading-previous.heading)/dt:previous?.angularVelocity??p.angularVelocity??0;
    m[key]={version:1,at,x:p.x,y:p.y,heading:p.heading,vx,vy,angularVelocity};return {...p,vx,vy,angularVelocity};
  }
  function followHull(s,d,p,goal,dt){
    if(!(dt>0))return;
    const motion=window.nativeShipMotion,profile=window.nativeShipDefinitions.get(BASIC,'repair-drone').movement,spin=p.angularVelocity||0;
    const descriptorBase=window.nativeShipDefinitions.describe(s,d,{category:'repair-drone'});goal=motion.attachmentGoal(descriptorBase,p,goal);
    const carried=d.speed===0&&!d.motionKick?.inherited?{vx:0,vy:0}:motion.kickSample(d.motionKick,clock(s));
    const worldVelocity={x:(p.vx||0)-spin*(goal.y-p.y),y:(p.vy||0)+spin*(goal.x-p.x)};
    const velocity={x:worldVelocity.x-carried.vx,y:worldVelocity.y-carried.vy};
    let command=motion.followCommand(d,goal,velocity,Math.min(8,1/Math.max(.001,dt))),descriptor={...descriptorBase,followGoal:goal};
    if(Math.hypot(velocity.x,velocity.y)>profile.maxSpeed&&Math.hypot(worldVelocity.x,worldVelocity.y)<Math.hypot(carried.vx,carried.vy)*.5){command.brake=true;command.brakeInherited=true;}
    command=window.nativeShipTraffic?.steer(s,descriptor,command,profile)||command;
    motion.step(d,command,profile,dt);d.motionAt=clock(s);
  }
  function localPoint(p,local){const a=p.heading+Math.PI/2,c=Math.cos(a),sn=Math.sin(a);return {x:p.x+local.x*c-local.y*sn,y:p.y+local.x*sn+local.y*c};}
  function updateWork(p,d,progress){
    const site=window.nativeRepairWork?.site(p.shipType,progress,d.workSlot||0,d.workCount||1);
    if(site){d.workLocal={x:site.x*p.dimensions.width,y:site.y*p.dimensions.height};d.workNormal={x:site.nx,y:site.ny};d.workSite=site.index;}
    else d.workLocal||={x:0,y:0};
  }
  function workPoint(p,d){return localPoint(p,d.workLocal);}
  function emitWelds(s,m,d,pose,at){
    if(!window.nativeRepairWork||pose.system!==s.system)return;
    const sparks=s.shipRepairs.weldSparks||=[],key=window.nativeRepairWork.seed(d.id);
    let next=Math.max(d.nextWeldAt??d.lastAt,at-.9);
    while(next<=at){
      const hit=workPoint(pose,d),angle=pose.heading+Math.PI/2,c=Math.cos(angle),sn=Math.sin(angle),n=d.workNormal||{x:0,y:-1};
      const normal={x:n.x*c-n.y*sn,y:n.x*sn+n.y*c},burst=Math.floor(next*1000/90);
      sparks.push(...window.nativeRepairWork.burst(hit,normal,next*1000,key+burst*31,0,burst,DOT_SCALE,d.id,DOT_SCALE).map(p=>({...p,system:pose.system})));
      next+=(55+window.nativeRepairWork.noise(key+burst+1)*70)/1000;
    }
    d.nextWeldAt=next;s.shipRepairs.weldSparks=sparks.filter(p=>at*1000-p.born<p.ttl).slice(-768);
  }
  function bayGeometry(p){
    const geometry=p.definition.repairBayGeometry,hatch=geometry.hatch,normal=geometry.outward;
    const length=Math.hypot(normal.x,normal.y)||1,n={x:normal.x/length,y:normal.y/length};
    const localDock={x:hatch.x*p.dimensions.width,y:hatch.y*p.dimensions.height};
    const reach=Math.max(p.hullRadii.rx,p.hullRadii.ry)+(geometry.clearance??30);
    const localExit={x:localDock.x+n.x*reach,y:localDock.y+n.y*reach};
    const dock=localPoint(p,localDock),exit=localPoint(p,localExit);
    return {dock,exit,localDock,localExit,heading:Math.atan2(exit.y-dock.y,exit.x-dock.x)};
  }
  function depart(d,origin,dest,at,waiting=false){
    const hatch=bayGeometry(origin),profile=window.nativeShipDefinitions.get(BASIC,'repair-drone').movement;
    Object.assign(d,{x:hatch.dock.x,y:hatch.dock.y,previousX:hatch.dock.x,previousY:hatch.dock.y,heading:hatch.heading,speed:0,vx:0,vy:0});
    d.localLeg=window.nativeShipMotion.routeLeg(d,localPoint(dest,d.workStation),[hatch.exit],profile,at);
    d.phase='launching';d.lastAt=at;
    const segment=d.localLeg.segments[0];
    d.bayTransit={version:1,stage:'exit',startedAt:at,endsAt:segment.startedAt+segment.duration};
    if(waiting)d.bayTransit.waiting=true;
  }
  function keepInBay(d,p){
    const dock=bayGeometry(p).dock;Object.assign(d,{x:dock.x,y:dock.y,previousX:dock.x,previousY:dock.y,speed:0,vx:0,vy:0,phase:'stowed'});
    delete d.localLeg;delete d.bayTransit;delete d.missionId;
  }
  // A DOT can pass only through its own carrier's launch/recovery corridor.
  // Other hulls and all contacts outside this brief bay passage stay physical.
  function bayPassage(drone,other){
    if(drone?.category!=='repair-drone'||!drone.state)return false;
    const d=drone.entity,transit=d?.bayTransit,s=drone.state;
    if(!transit||transit.waiting||!['exit','enter'].includes(transit.stage)||!['launching','returning'].includes(d.phase)||clock(s)<transit.startedAt-EPS||clock(s)>transit.endsAt+EPS)return false;
    if(resolve(s,d.carrier)!==other?.entity||!s.shipRepairs?.missions.some(m=>m.id===d.missionId&&active(m)))return false;
    const p=pose(s,d.carrier);if(!p||p.system!==drone.system)return false;
    const {dock,exit}=bayGeometry(p),dx=exit.x-dock.x,dy=exit.y-dock.y,length=dx*dx+dy*dy;
    const q=Math.max(0,Math.min(1,((drone.x-dock.x)*dx+(drone.y-dock.y)*dy)/Math.max(EPS,length)));
    return Math.hypot(drone.x-dock.x-dx*q,drone.y-dock.y-dy*q)<=DOT_SIZE*1.5;
  }
  function returnDroneBay(s,m,d,at){
    if(d.hull<=0){d.phase='destroyed';delete d.localLeg;return;}
    const p=pose(s,m.carrier);if(!p||!alive(p.entity)){d.phase='destroyed';d.hull=0;delete d.localLeg;return;}
    delete d.bayTransit;d.approachTarget={category:p.category,id:p.id};leg(d,bayGeometry(p).exit,at,'returning');
  }
  function returnDroneAttached(s,m,d,at){
    if(d.hull<=0){d.phase='destroyed';delete d.localLeg;return;}
    const p=pose(s,m.carrier);if(!p||!alive(p.entity)){d.phase='destroyed';d.hull=0;delete d.localLeg;return;}
    const goal=attachmentBayPoint(p);d.approachTarget={category:p.category,id:p.id};d.returnAt=at;
    if(moving(p)||d.motionKick){delete d.localLeg;delete d.trafficControl;d.phase='returning';d.lastAt=at;d.motionAt=at;}
    else leg(d,goal,at,'returning');
  }
  function resume(s,r){
    const e=resolve(s,r);if(!alive(e)||e.phase!=='disabled')return;
    if(e.hull+EPS<definition(s,e,r.category).hull)return;
    e.phase=r.category==='player'?'flight':'docked';window.nativeShipMotion.stop(e);
    if(r.category==='civilian')window.nativeNpcLives.resumeWork(s,e,'Drone hull repair completed; recover retained cargo');
    if(r.category==='tug')window.nativeSolEconomy.resumeAfterRepair(s,e);
    const c=callFor(s,r);if(c){c.status='completed';c.completedAt=clock(s);c.claim=null;}
    announce(s,r,'Hull repair complete. Drones recovered; resuming operations.');
  }
  function advanceMissionBay(s,m,at){
    const carrier=resolve(s,m.carrier),target=resolve(s,m.target),slots=carrier?.repairBay?.slots||[],ds=m.drones.map(id=>slots.find(d=>d.id===id)||carrier?.shipEquipment?.instances[id]).filter(Boolean);
    const carrierPose=alive(carrier)?pose(s,m.carrier):null,targetPose=alive(target)?pose(s,m.target):null;
    const self=key(m.carrier)===key(m.target),playerRepair=(m.manual===true||m.automatic===true)&&self&&m.carrier.category==='player';
    const valid=alive(target)&&(target.phase==='disabled'||playerRepair)&&alive(carrier)&&(self||carrier.task?.kind==='medical'&&carrier.task.status==='active'&&carrier.phase!=='disabled'&&!carrier.journey&&carrierPose.system===targetPose.system&&Math.hypot(carrierPose.x-targetPose.x,carrierPose.y-targetPose.y)<=1000);
    const returning=d=>{
      for(let transitions=0;transitions<4&&d.phase==='returning'&&d.localLeg;transitions++){
        const sampled=window.nativeShipMotion.sampleLeg(d,d.localLeg,at);if(!sampled.arrived&&!sampled.invalid)return;
        const ended=d.localLeg.startedAt+d.localLeg.duration;delete d.localLeg;
        const p=pose(s,m.carrier);
        if(!alive(carrier)||!p||p.system!==d.system){d.hull=0;d.phase='destroyed';return;}
        const entering=d.bayTransit?.stage==='enter',geometry=bayGeometry(p),goal=entering?geometry.dock:geometry.exit;
        if(Math.hypot(d.x-goal.x,d.y-goal.y)>1){
          leg(d,goal,at,'returning');
          if(entering)d.bayTransit={version:1,stage:'enter',startedAt:d.localLeg.startedAt,endsAt:d.localLeg.startedAt+d.localLeg.duration};
          return;
        }
        if(!entering){
          leg(d,geometry.dock,sampled.invalid?at:ended,'returning');
          d.bayTransit={version:1,stage:'enter',startedAt:d.localLeg.startedAt,endsAt:d.localLeg.startedAt+d.localLeg.duration};continue;
        }
        d.phase='stowed';delete d.missionId;delete d.bayTransit;
      }
    };
    for(const d of ds){
      if(d.hull<=0||!alive(carrier)){d.phase='destroyed';d.hull=0;delete d.localLeg;continue;}
      if(d.bayTransit?.waiting){
        if(at+EPS<d.bayTransit.startedAt)continue;
        if(!valid||target.hull>=targetPose.definition.hull-EPS||supplies(s,m.carrier)<=EPS){keepInBay(d,carrierPose);continue;}
        depart(d,carrierPose,targetPose,d.bayTransit.startedAt);
      }
      returning(d);
      if(d.phase==='launching'&&d.localLeg){
        const sampled=window.nativeShipMotion.sampleLeg(d,d.localLeg,at);
        if(d.bayTransit?.stage==='exit'&&at>=d.bayTransit.endsAt)delete d.bayTransit;
        if(sampled.arrived){d.lastAt=d.localLeg.startedAt+d.localLeg.duration;delete d.localLeg;d.phase='repairing';}
        else if(sampled.invalid){returnDroneBay(s,m,d,at);continue;}
      }
    }
    const limit=alive(target)?definition(s,target,m.target.category).hull:0;
    const stopAt=finish=>{
      for(const [index,d] of ds.entries())if(['repairing','launching'].includes(d.phase)){
        if(d.bayTransit?.waiting){keepInBay(d,carrierPose);continue;}
        if(d.localLeg)window.nativeShipMotion.sampleLeg(d,d.localLeg,finish);
        returnDroneBay(s,m,d,finish+index*.6);
      }
    };
    if(!valid||target.hull>=limit-EPS||supplies(s,m.carrier)<=EPS)stopAt(at);
    else{
      const working=ds.filter(d=>d.phase==='repairing');
      for(const d of working){
        if(d.system!==targetPose.system||Math.hypot(d.x-targetPose.x,d.y-targetPose.y)>Math.max(targetPose.dimensions.width,targetPose.dimensions.height)+150){returnDroneBay(s,m,d,at);continue;}
        d.workSlot??=ds.indexOf(d);d.workCount??=ds.length;
        const progress=Math.min(1,Math.max(0,(target.hull-m.startHull)/Math.max(.001,limit-m.startHull)));
        if(self)updateWork(targetPose,d,progress);else configureWork(targetPose,d);
        const point=workPoint(targetPose,d),goal=d.workStation&&localPoint(targetPose,d.workStation);
        const following=goal&&Math.hypot(goal.x-d.x,goal.y-d.y)>.1;
        if(goal&&(moving(targetPose)||d.motionKick))followHull(s,d,targetPose,goal,Math.max(.000001,at-d.lastAt));
        else window.nativeShipMotion.step(d,following?{goal}:{heading:Math.atan2(point.y-d.y,point.x-d.x),hold:true},window.nativeShipDefinitions.get(BASIC,'repair-drone').movement,Math.max(.000001,at-d.lastAt));
      }
      // Integrate simultaneous welders over their actual arrival intervals. A
      // calendar skip and many small frames spend the same material exactly once.
      const welders=working.filter(d=>d.phase==='repairing'),boundaries=[...new Set([...welders.map(d=>Math.min(at,d.lastAt)),at])].sort((a,b)=>a-b);
      for(let i=0;i+1<boundaries.length;i++){
        const from=boundaries[i],to=boundaries[i+1],count=welders.filter(d=>d.lastAt<=from+EPS).length;if(!count)continue;
        const hull=Math.min((to-from)*RATE*count,limit-target.hull,supplies(s,m.carrier)*HULL_PER_TON),spent=consume(s,m.carrier,hull/HULL_PER_TON),restored=spent*HULL_PER_TON;
        target.hull=Math.min(limit,target.hull+restored);m.spent+=spent;m.restoredHull+=restored;
        if(target.hull>=limit-EPS||supplies(s,m.carrier)<=EPS){stopAt(from+restored/(RATE*count));break;}
      }
      for(const d of welders)if(d.phase==='repairing'){emitWelds(s,m,d,targetPose,at);d.lastAt=at;}
    }
    for(const d of ds)returning(d);
    if(ds.every(d=>['stowed','destroyed'].includes(d.phase))){
      m.status=alive(target)&&target.hull>=definition(s,target,m.target.category).hull-EPS?'completed':valid?'exhausted':'cancelled';m.endedAt=at;resume(s,m.target);
    }
  }
  function advanceMissionAttached(s,m,at){
    m.attachmentVersion??=1;
    const carrier=resolve(s,m.carrier),target=resolve(s,m.target),slots=carrier?.repairBay?.slots||[],ds=m.drones.map(id=>slots.find(d=>d.id===id)||carrier?.shipEquipment?.instances[id]).filter(Boolean);
    const previousPoses=runtimes.get(s).previousPoses;
    for(const d of ds){let previous=previousPoses.get(d);if(!previous){previous={};previousPoses.set(d,previous);}previous.x=d.x;previous.y=d.y;}
    const carrierPose=alive(carrier)?observedPose(m,'carrierMotion',pose(s,m.carrier),at):null,targetPose=alive(target)?observedPose(m,'targetMotion',pose(s,m.target),at):null;
    const self=key(m.carrier)===key(m.target),valid=alive(target)&&target.phase==='disabled'&&alive(carrier)&&(self||carrier.task?.kind==='medical'&&carrier.task.status==='active'&&carrier.phase!=='disabled'&&!carrier.journey&&carrierPose.system===targetPose.system&&Math.hypot(carrierPose.x-targetPose.x,carrierPose.y-targetPose.y)<=1000);
    const returning=d=>{
      if(d.phase!=='returning')return;
      const queue=ds.filter(craft=>craft.phase==='returning'&&craft.hull>0),rank=queue.indexOf(d);
      const currentBay=carrierPose&&attachmentBayPoint(carrierPose);
      let goal=currentBay;
      if(goal&&rank>0){
        // Keep the shared predictor's six-unit gap and speed padding clear of
        // the bay. A queue spaced only by hull size would still block its goal.
        const site=attachment(carrierPose,carrierPose.definition.repair.bay),gap=DOT_SIZE*.34+.25+20,side=Math.ceil(rank/2)*32*(rank%2?1:-1);
        goal=localPoint(carrierPose,{x:site.x+site.nx*gap-site.ny*side,y:site.y+site.ny*gap+site.nx*side});
      }
      if(at<(d.returnAt??0))return;
      if(goal&&(moving(carrierPose)||d.motionKick)){
        if(d.localLeg&&at<d.localLeg.startedAt)return;
        const elapsed=Math.max(0,at-(d.motionAt??d.lastAt));delete d.localLeg;followHull(s,d,carrierPose,goal,elapsed);d.motionAt=at;
        if(rank>0||Math.hypot(d.x-goal.x,d.y-goal.y)>.6)return;
        d.phase='stowed';delete d.missionId;window.nativeShipMotion.stop(d);return;
      }
      if(!d.localLeg&&goal)leg(d,goal,at,'returning');
      if(!d.localLeg)return;
      if(goal&&at>=d.localLeg.startedAt&&Math.hypot(goal.x-d.localLeg.goal.x,goal.y-d.localLeg.goal.y)>.75){
        window.nativeShipMotion.sampleLeg(d,d.localLeg,at);leg(d,goal,at,'returning');
      }
      const sampled=window.nativeShipMotion.sampleLeg(d,d.localLeg,at);if(!sampled.arrived&&!sampled.invalid)return;
      // One physical bay admits one craft at a time. The others hold at
      // distinct clear approach points rather than mutually blocking its lip.
      if(rank>0)return;
      const ended=d.localLeg.startedAt+d.localLeg.duration;delete d.localLeg;
      const p=pose(s,m.carrier);
      if(!alive(carrier)||!p||p.system!==d.system){d.hull=0;d.phase='destroyed';return;}
      const finalBay=attachmentBayPoint(p);
      if(Math.hypot(d.x-finalBay.x,d.y-finalBay.y)>.6){leg(d,finalBay,Math.max(at,ended),'returning');return;}
      d.phase='stowed';delete d.missionId;window.nativeShipMotion.stop(d);
    };
    for(const d of ds){
      if(d.hull<=0||!alive(carrier)){d.phase='destroyed';d.hull=0;delete d.localLeg;continue;}
      returning(d);
      if(d.phase==='launching'&&at<(d.launchAt??d.localLeg?.startedAt??d.lastAt))continue;
      if(d.phase==='launching'&&d.launchPending&&carrierPose){
        const exit=attachmentBayPoint(carrierPose),physicalCarrier=pose(s,m.carrier),vx=physicalCarrier?.vx||0,vy=physicalCarrier?.vy||0;
        Object.assign(d,{x:exit.x,y:exit.y,vx,vy,speed:Math.hypot(vx,vy),motionKick:Math.hypot(vx,vy)>.001?{version:1,mode:'free',vx,vy,inherited:true}:undefined,
          heading:Math.atan2(exit.y-carrierPose.y,exit.x-carrierPose.x),launchPending:false});
      }
      if(d.phase==='launching'&&targetPose&&(moving(targetPose)||d.motionKick)){
        if(d.localLeg&&at<d.localLeg.startedAt)continue;
        d.workSlot??=ds.indexOf(d);configureWork(targetPose,d);const goal=attachmentStationPoint(targetPose,d);
        const elapsed=Math.max(0,at-(d.motionAt??d.lastAt));delete d.localLeg;followHull(s,d,targetPose,goal,elapsed);d.motionAt=at;d.lastAt=at;
        if(Math.hypot(d.x-goal.x,d.y-goal.y)<Math.max(1,Math.hypot(targetPose.vx||0,targetPose.vy||0)*elapsed+.1))d.phase='repairing';
      }
      if(d.phase==='launching'&&!d.localLeg&&targetPose&&!moving(targetPose)&&!d.motionKick)leg(d,attachmentStationPoint(targetPose,d),at,'launching');
      if(d.phase==='launching'&&d.localLeg){
        if(targetPose){
          d.workSlot??=ds.indexOf(d);configureWork(targetPose,d);
          const currentStation=attachmentStationPoint(targetPose,d);
          if(at>=d.localLeg.startedAt&&Math.hypot(currentStation.x-d.localLeg.goal.x,currentStation.y-d.localLeg.goal.y)>1.5){
            window.nativeShipMotion.sampleLeg(d,d.localLeg,at);leg(d,currentStation,at,'launching');
          }
        }
        const sampled=window.nativeShipMotion.sampleLeg(d,d.localLeg,at);
        if(sampled.arrived){d.lastAt=d.localLeg.startedAt+d.localLeg.duration;delete d.localLeg;d.phase='repairing';}
        else if(sampled.invalid){returnDroneAttached(s,m,d,at);continue;}
      }
    }
    const limit=alive(target)?definition(s,target,m.target.category).hull:0;
    const stopAt=finish=>{
      for(const [index,d] of ds.entries())if(['repairing','launching'].includes(d.phase)){
        if(d.localLeg)window.nativeShipMotion.sampleLeg(d,d.localLeg,finish);
        returnDroneAttached(s,m,d,finish+index*.6);
      }
    };
    if(!valid||target.hull>=limit-EPS||supplies(s,m.carrier)<=EPS)stopAt(at);
    else{
      const working=ds.filter(d=>d.phase==='repairing');
      for(const d of working){
        if(d.system!==targetPose.system||Math.hypot(d.x-targetPose.x,d.y-targetPose.y)>Math.max(targetPose.dimensions.width,targetPose.dimensions.height)+150){returnDroneAttached(s,m,d,at);continue;}
        d.workSlot??=ds.indexOf(d);configureWork(targetPose,d);
        const point=workPoint(targetPose,d),station=attachmentStationPoint(targetPose,d),distance=Math.hypot(station.x-d.x,station.y-d.y);
        if(moving(targetPose)||d.motionKick)followHull(s,d,targetPose,station,Math.max(.000001,at-d.lastAt));
        else{
          const command=distance>.1?{goal:station}:{heading:Math.atan2(point.y-d.y,point.x-d.x),hold:true};
          window.nativeShipMotion.step(d,command,window.nativeShipDefinitions.get(BASIC,'repair-drone').movement,Math.max(.000001,at-d.lastAt));
        }
        // A craft catching a drifting casualty cannot repair it remotely.
        if(Math.hypot(station.x-d.x,station.y-d.y)>DOT_SIZE*2)d.lastAt=at;
      }
      // Integrate simultaneous welders over their actual arrival intervals. A
      // calendar skip and many small frames spend the same material exactly once.
      const welders=working.filter(d=>d.phase==='repairing'),boundaries=[...new Set([...welders.map(d=>Math.min(at,d.lastAt)),at])].sort((a,b)=>a-b);
      for(let i=0;i+1<boundaries.length;i++){
        const from=boundaries[i],to=boundaries[i+1],count=welders.filter(d=>d.lastAt<=from+EPS).length;if(!count)continue;
        const hull=Math.min((to-from)*RATE*count,limit-target.hull,supplies(s,m.carrier)*HULL_PER_TON),spent=consume(s,m.carrier,hull/HULL_PER_TON),restored=spent*HULL_PER_TON;
        target.hull=Math.min(limit,target.hull+restored);m.spent+=spent;m.restoredHull+=restored;
        if(target.hull>=limit-EPS||supplies(s,m.carrier)<=EPS){stopAt(from+restored/(RATE*count));break;}
      }
      for(const d of welders)if(d.phase==='repairing')d.lastAt=at;
    }
    for(const d of ds)returning(d);
    if(ds.every(d=>['stowed','destroyed'].includes(d.phase))){
      m.status=alive(target)&&target.hull>=definition(s,target,m.target.category).hull-EPS?'completed':valid?'exhausted':'cancelled';m.endedAt=at;resume(s,m.target);
    }
    // Moving repair craft and changing hull condition update only their own
    // descriptors; terminal craft are removed by the same registered resolver.
    for(const d of ds){const previous=previousPoses.get(d);d.previousX=previous.x;d.previousY=previous.y;window.nativeShipSystems.refreshShip(s,d,'repair-drone',d.system);}
    if(target)window.nativeShipSystems.refreshShip(s,target,m.target.category,targetPose?.system);
  }
  function service(s,e,c,at){
    if(!validCall(s,c))return false;
    if(!missionFor(s,c.target)){
      if(supplies(s,ref('civilian',e))<=EPS)return false;
      if(!launch(s,ref('civilian',e),c.target,at))return false;
      c.status='servicing';
    }
    return true;
  }
  function advance(s,dt){
    if(!s||!(dt>0)||window.nativeSimulation.blocked())return;
    const r=initialize(s),at=clock(s);
    if(r.weldSparks)r.weldSparks=r.weldSparks.filter(p=>at*1000-p.born<p.ttl);
    window.nativeRepairVisuals?.advance(s,dt);
    for(const m of r.missions)if(active(m))advanceMission(s,m,at);
    if(at+EPS<r.nextPollAt)return;
    r.nextPollAt=at+1;
    const rt=runtimes.get(s);if(rt.dirty)census(s);
    observe(s,s,'player');
    // A bounded safety reconciliation also recognizes old direct-mutating
    // integrations without scanning an entire large fleet every second.
    const civilians=s.civilianTraffic?.ships||[],tugs=s.solEconomy?.freighters||[],count=civilians.length+tugs.length;
    for(let i=0;i<Math.min(64,count);i++){const index=rt.audit++%count;observe(s,index<civilians.length?civilians[index]:tugs[index-civilians.length],index<civilians.length?'civilian':'tug');}
    const pending=new Map([...rt.tugs,...rt.disabled,...rt.dead]);
    if(repairMode(s)==='auto')pending.set('player:player',{category:'player',entity:s});
    for(const {category,entity:e} of pending.values()){
      const reference=ref(category,e),b=bay(s,e,category);
      if(!alive(e)){
        destroyed(s,e,category);
        continue;
      }
      if(category==='player'){
        if(e.phase==='disabled'&&!missionFor(s,reference))resume(s,reference);
        if(repairMode(s)==='auto'){
          if(deploymentStatus(s).ok)deployPlayer(s,{automatic:true});
          else if(e.phase==='disabled'&&!missionFor(s,reference)&&(supplies(s,reference)<=EPS||!b.slots.some(d=>d.hull>0&&d.phase==='stowed')))distress(s,reference);
        }
        continue;
      }
      if(e.phase==='disabled'){
        if(!missionFor(s,reference))resume(s,reference);if(e.phase!=='disabled')continue;
        if(!missionFor(s,reference)){
          if(supplies(s,reference)>EPS&&b.slots.some(d=>d.hull>0&&d.phase==='stowed'))launch(s,reference,reference,at);
          else distress(s,reference);
        }
      }else if(category==='tug')restockTug(s,e);
    }
    assign(s);
    // Completed history is bounded. Active jobs/calls are never discarded.
    r.missions=r.missions.filter(m=>active(m)||at-(m.endedAt??at)<120);
    r.calls=r.calls.filter(c=>['queued','claimed','servicing'].includes(c.status)||at-(c.completedAt??(c.completedAt=at))<120);
  }
  function drones(s,system){
    const result=[];
    for(const m of s.shipRepairs?.missions||[])if(active(m))for(const d of m.drones.map(id=>resolve(s,m.carrier)?.shipEquipment?.instances[id]||resolve(s,m.carrier)?.repairBay?.slots.find(d=>d.id===id)).filter(Boolean))if(d.missionId===m.id&&d.hull>0&&(system===undefined||d.system===system)&&!d.bayTransit?.waiting&&!['stowed','destroyed'].includes(d.phase)&&!(d.phase==='launching'&&d.localLeg?.startedAt>clock(s))){
      const p=dronePose(s,d),base=window.nativeShipDefinitions.describe(s,d,{category:'repair-drone'});
      result.push({...base,x:p.x,y:p.y,heading:p.heading,speed:p.speed,vx:p.vx,vy:p.vy});
    }
    return result;
  }
  function droneTarget(s,m,d,system){
    if(!d||d.missionId!==m.id||!(d.hull>0)||system!==undefined&&d.system!==system||['stowed','destroyed'].includes(d.phase)||d.phase==='launching'&&(d.launchAt??d.localLeg?.startedAt)>clock(s))return null;
    const p=dronePose(s,d),base=window.nativeShipDefinitions.describe(s,d,{category:'repair-drone'});
    return {...base,x:p.x,y:p.y,heading:p.heading,speed:p.speed,vx:p.vx,vy:p.vy};
  }
  function resolveDrone(s,id,system){
    for(const m of s.shipRepairs?.missions||[])if(active(m)&&m.drones.includes(id)){
      const carrier=resolve(s,m.carrier),d=carrier?.shipEquipment?.instances[id]||carrier?.repairBay?.slots.find(d=>d.id===id);
      return droneTarget(s,m,d,system);
    }
    return null;
  }
  function hit(s,t,amount,impact){
    const r=s.shipRepairs,m=r?.missions.find(m=>m.id===t.entity.missionId),e=m&&resolve(s,m.carrier),d=e?.shipEquipment?.instances[t.entity.id]||e?.repairBay?.slots.find(d=>d.id===t.entity.id);
    if(!d)return {ok:false};
    const descriptor={...t,entity:d},result=window.nativeShipDamage.apply(descriptor,amount,impact);
    window.nativeShipEffects.hit(s,descriptor,result,impact);
    if(result.destroyed){d.phase='destroyed';delete d.localLeg;}return result;
  }
  const renderer={draw:(...args)=>window.nativeRepairVisuals?.drawDrone(...args),hit:(...args)=>window.nativeRepairVisuals?.hit(...args)};
  window.nativeShipDefinitions.register(BASIC,{name:'Basic Dot repair drone',slots:{weapon:0,repairDrone:0,ability:0},hull:40,shields:0,cargo:0,equipment:[],movement:{maxSpeed:85,acceleration:100,braking:120,turnRate:Infinity,directGoal:true,inertial:true,snap:true,arrivalRadius:.1,serviceApproach:true},artwork:{scale:DOT_SCALE},dimensions:{width:DOT_SIZE,height:DOT_SIZE},
    geometry:{hull:{width:.34,height:.34,minX:0,minY:0}},capabilities:{armed:false,canMine:false,canDock:false,canTrade:false,disableRatio:0},renderer});
  window.nativeShipSystems.register('repair-drone',{collect:drones,inspect:s=>[],hit,resolve:resolveDrone,visualImpact:(s,t,e)=>window.nativeShipEffects.visualImpact(s,t,e)});
  window.nativeShipRepairs=Object.freeze({initialize,advance,restock,call,claimed,validCall,releaseClaim,rendezvous,service,ref,key,resolve,pose,launch,deployPlayer,deploymentStatus,playerDronesDeployed,repairMode,setRepairMode,missionFor,supplies,workPoint,stationPoint,bayPoint,bayGeometry,bayPassage,drones,destroyed,observe,invalidateMembership,
    reroute:(s,d,route)=>{if(!d.localLeg||route.valid===false)return false;d.localLeg=route;if(d.bayTransit){d.bayTransit.startedAt=route.startedAt;d.bayTransit.endsAt=route.startedAt+route.duration;}return true;},
    status:(s,e,category)=>({supplies:supplies(s,ref(category,e)),drones:e.repairBay?.slots.filter(d=>d.hull>0).length||0,mission:missionFor(s,ref(category,e))?.id,distress:callFor(s,ref(category,e))?.status}),
    rules:Object.freeze({hullPerTon:HULL_PER_TON,ratePerDrone:RATE,medicalStock:MEDICAL_STOCK,basicType:BASIC})});
})();
