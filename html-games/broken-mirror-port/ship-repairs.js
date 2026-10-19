/* Saved repair equipment and material accounting. Civilian lives own rescue travel;
   shared motion, damage and effects own every launched Dot. Painting is read-only. */
(() => {
  'use strict';
  const BASIC=9001,EPS=1e-7,HULL_PER_TON=5,RATE=1.5,MEDICAL_STOCK=200;
  const initialized=new WeakSet(),clock=s=>window.nativeSimulation.seconds(s);
  const qty=n=>Math.max(0,Number(n)||0),alive=e=>e&&e.hull>0&&e.phase!=='destroyed';
  const definition=(s,e,category)=>window.nativeShipDefinitions.forEntity(s,e,{category});
  const ref=(category,e)=>({category,id:category==='player'?'player':e.id,generation:e.lifeGeneration||0});
  const key=r=>`${r.category}:${r.id}:${r.generation||0}`;
  function resolve(s,r){
    if(!r)return null;
    const e=r.category==='player'?s:r.category==='tug'?s.solEconomy?.freighters.find(e=>e.id===r.id):s.civilianTraffic?.ships.find(e=>e.id===r.id);
    return e&&(e.lifeGeneration||0)===(r.generation||0)?e:null;
  }
  const fleet=s=>[{category:'player',entity:s},...(s.solEconomy?.freighters||[]).map(entity=>({category:'tug',entity})),...(s.civilianTraffic?.ships||[]).map(entity=>({category:'civilian',entity}))];
  function pose(s,r){const e=resolve(s,r);if(!e)return null;return window.nativeShipDefinitions.describe(s,e,{category:r.category});}
  function bay(s,e,category){
    const generation=e.lifeGeneration||0;
    if(e.repairBay?.generation===generation)return e.repairBay;
    const count=category==='civilian'&&e.shipType===58?6:definition(s,e,category).cargo<100?1:2;
    e.repairBay={version:1,generation,slots:Array.from({length:count},(_,i)=>({id:`dot:${key(ref(category,e))}:${i}`,slot:i,shipType:BASIC,hull:40,shields:0,phase:'stowed',heading:0,speed:0}))};
    e.repairDeuranium??=0;return e.repairBay;
  }
  function initialize(s){
    if(initialized.has(s))return s.shipRepairs;
    const r=s.shipRepairs||={version:1,sequence:0,calls:[],missions:[],ledger:{consumed:0,lost:0,medicalCapital:0},nextPollAt:clock(s)};
    r.calls||=[];r.missions||=[];r.ledger||={consumed:0,lost:0,medicalCapital:0};
    initialized.add(s);
    // Install medical crews once in the existing persistent fleet. Initial capital
    // is an explicit source; all deuranium thereafter comes from actual markets.
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
    if(category!=='player'){s.shipRepairs.ledger.lost+=qty(e.repairDeuranium);e.repairDeuranium=0;}
    for(const d of e.repairBay?.slots||[]){d.hull=0;d.phase='destroyed';delete d.localLeg;}
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
    s.shipRepairs.calls.push(c);announce(s,r,`Distress signal: disabled, ${supplies(s,r)>EPS?'no operational repair drones':'repair deuranium exhausted'}. Requesting Olympic medical assistance.`);
  }
  function restock(s,e){
    if(!alive(e)||e.journey||e.phase==='disabled')return 0;
    const b=window.nativePortDocking.inspect(s,e,false);
    if(b?.kind!=='berth'||b.port!==e.port||Math.hypot(e.x-b.x,e.y-b.y)>.01)return 0;
    const d=definition(s,e,'civilian'),target=e.shipType===58?MEDICAL_STOCK:d.cargo<100?4:12;
    const committed=!e.cargo&&e.task?.phase==='loading'?qty(e.task.requirements?.tons):0;
    const room=Math.max(0,d.cargo-qty(e.cargo?.tons)-qty(e.oreHold)-qty(e.repairDeuranium)-committed);
    const committedPayment=!e.cargo&&e.task?.phase==='loading'?qty(e.task.requirements?.credits):0;
    const budget=Math.min(Math.max(0,qty(e.credits)-committedPayment),e.shipType===58?Infinity:qty(e.credits)*.25);
    const m=window.nativeNpcLives.market(s,e.system,e.port),tons=Math.floor(Math.min(target-qty(e.repairDeuranium),room,qty(m.stock[7])-qty(m.reserved[7]),budget/55));
    if(tons<1)return 0;
    const result=window.nativeNpcLives.exchange(s,m,e,{good:7,tons,payment:tons*55,buy:true,capacity:room,repairSupplies:true});
    return result.ok?tons:0;
  }
  function restockTug(s,e){
    if(!alive(e)||!['waiting','loading','unloading'].includes(e.phase))return;
    const stock=s.solEconomy.ports[e.port],reserved=s.solEconomy.stockReserved?.[e.port]?.[7]||0;
    if(!stock)return;
    const tons=Math.floor(Math.min(12-qty(e.repairDeuranium),qty(stock[7])-reserved));
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
        const e=s.civilianTraffic.ships.find(e=>key(ref('civilian',e))===c.claim);
        if(!alive(e)||e.phase==='disabled'||e.task?.kind!=='medical'||e.task?.status!=='active'){c.claim=null;c.status='queued';}
        else continue;
      }
      const candidates=s.civilianTraffic.ships.filter(e=>e.shipType===58&&alive(e)&&e.phase!=='disabled'&&!e.journey&&!e.disputeId&&!e.retaliationId&&!e.scriptedDemo&&e.task?.kind!=='medical'&&qty(e.repairDeuranium)>EPS&&bay(s,e,'civilian').slots.some(d=>d.phase==='stowed'&&d.hull>0));
      candidates.sort((a,b)=>{
        const distance=e=>{const p=window.nativeNpcLives.galaxyPosition(s,e),anchor=window.nativeManualFlight.anchor(c.system);return Math.hypot(p.x-anchor.x-c.x,p.y-anchor.y-c.y);};
        return distance(a)-distance(b)||a.id-b.id;
      });
      const e=candidates[0];if(!e)continue;
      c.claim=key(ref('civilian',e));c.status='claimed';c.claimedAt=clock(s);
      if(!window.nativeNpcLives.startRescue(s,e,c,clock(s))){c.claim=null;c.status='queued';continue;}
      announce(s,ref('civilian',e),'Olympic medical team responding to distress. Repair drones standing by.');
    }
  }
  function dronePose(s,d){const p={...d};if(d.localLeg)window.nativeShipMotion.sampleLeg(p,d.localLeg,clock(s));return p;}
  function leg(d,goal,at,phase){
    d.localLeg=window.nativeShipMotion.planLeg(d,goal,window.nativeShipDefinitions.get(BASIC,'repair-drone').movement,at);
    d.phase=phase;d.lastAt=at;
  }
  function launch(s,carrier,target,at=clock(s)){
    if(missionFor(s,target)||supplies(s,carrier)<=EPS||s.shipRepairs.missions.filter(active).length>=16)return null;
    const e=resolve(s,carrier),t=resolve(s,target);if(!alive(e)||!alive(t)||t.phase!=='disabled')return null;
    const origin=pose(s,carrier),dest=pose(s,target);if(origin.system!==dest.system||Math.hypot(origin.x-dest.x,origin.y-dest.y)>500)return null;
    const drones=bay(s,e,carrier.category).slots.filter(d=>d.hull>0&&d.phase==='stowed');if(!drones.length)return null;
    const m={id:`repair:${++s.shipRepairs.sequence}`,carrier,target,status:'active',startedAt:at,startHull:t.hull,restoredHull:0,spent:0,drones:drones.map(d=>d.id)};
    s.shipRepairs.missions.push(m);
    for(const [i,d] of drones.entries()){
      const a=(i/drones.length)*Math.PI*2,rx=dest.hullRadii.rx,ry=dest.hullRadii.ry;
      d.workLocal={x:Math.cos(a)*rx*.75,y:Math.sin(a)*ry*.75};
      const contact=workPoint(dest,d),heading=Math.atan2(contact.y-origin.y,contact.x-origin.x);
      const exit=bayPoint(origin,heading);
      Object.assign(d,{x:exit.x,y:exit.y,heading,speed:0,system:origin.system,missionId:m.id,carrier:carrier,target:target,approachTarget:{category:dest.category,id:dest.id}});
      leg(d,{x:contact.x+Math.cos(a)*(32+rx*.5),y:contact.y+Math.sin(a)*(32+ry*.5)},at+i*.8,'launching');
    }
    window.nativeShipSystems.invalidate(s);return m;
  }
  function workPoint(p,d){const a=p.heading+Math.PI/2,c=Math.cos(a),sn=Math.sin(a);return {x:p.x+d.workLocal.x*c-d.workLocal.y*sn,y:p.y+d.workLocal.x*sn+d.workLocal.y*c};}
  function bayPoint(p,heading=p.heading){const a=heading-p.heading-Math.PI/2,c=Math.cos(a),sn=Math.sin(a),r=1/Math.sqrt((c/p.hullRadii.rx)**2+(sn/p.hullRadii.ry)**2)+25;return {x:p.x+Math.cos(heading)*r,y:p.y+Math.sin(heading)*r};}
  function returnDrone(s,m,d,at){
    if(d.hull<=0){d.phase='destroyed';delete d.localLeg;return;}
    const p=pose(s,m.carrier);if(!p||!alive(p.entity)){d.phase='destroyed';d.hull=0;delete d.localLeg;return;}
    const goal=bayPoint(p,Math.atan2(d.y-p.y,d.x-p.x));d.returnHeading=Math.atan2(d.y-p.y,d.x-p.x);d.approachTarget={category:p.category,id:p.id};leg(d,goal,at,'returning');
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
  function advanceMission(s,m,at){
    const carrier=resolve(s,m.carrier),target=resolve(s,m.target),slots=carrier?.repairBay?.slots||[],ds=m.drones.map(id=>slots.find(d=>d.id===id)).filter(Boolean);
    const carrierPose=alive(carrier)?pose(s,m.carrier):null,targetPose=alive(target)?pose(s,m.target):null;
    const self=key(m.carrier)===key(m.target),valid=alive(target)&&target.phase==='disabled'&&alive(carrier)&&(self||carrier.task?.kind==='medical'&&carrier.task.status==='active'&&carrier.phase!=='disabled'&&!carrier.journey&&carrierPose.system===targetPose.system&&Math.hypot(carrierPose.x-targetPose.x,carrierPose.y-targetPose.y)<=1000);
    const returning=d=>{
      if(d.phase!=='returning'||!d.localLeg)return;
      const sampled=window.nativeShipMotion.sampleLeg(d,d.localLeg,at);if(!sampled.arrived&&!sampled.invalid)return;
      const ended=d.localLeg.startedAt+d.localLeg.duration;delete d.localLeg;
      const p=pose(s,m.carrier);
      if(!alive(carrier)||!p||p.system!==d.system){d.hull=0;d.phase='destroyed';return;}
      const goal=bayPoint(p,d.returnHeading);
      if(Math.hypot(d.x-goal.x,d.y-goal.y)>20){leg(d,goal,Math.max(at,ended),'returning');return;}
      d.phase='stowed';delete d.missionId;
    };
    for(const d of ds){
      if(d.hull<=0||!alive(carrier)){d.phase='destroyed';d.hull=0;delete d.localLeg;continue;}
      returning(d);
      if(d.phase==='launching'&&d.localLeg){
        const sampled=window.nativeShipMotion.sampleLeg(d,d.localLeg,at);
        if(sampled.arrived){d.lastAt=d.localLeg.startedAt+d.localLeg.duration;delete d.localLeg;d.phase='repairing';}
        else if(sampled.invalid){returnDrone(s,m,d,at);continue;}
      }
    }
    const limit=alive(target)?definition(s,target,m.target.category).hull:0;
    const stopAt=finish=>{
      for(const [index,d] of ds.entries())if(['repairing','launching'].includes(d.phase)){
        if(d.localLeg)window.nativeShipMotion.sampleLeg(d,d.localLeg,finish);
        returnDrone(s,m,d,finish+index*.6);
      }
    };
    if(!valid||target.hull>=limit-EPS||supplies(s,m.carrier)<=EPS)stopAt(at);
    else{
      const working=ds.filter(d=>d.phase==='repairing');
      for(const d of working){
        if(d.system!==targetPose.system||Math.hypot(d.x-targetPose.x,d.y-targetPose.y)>Math.max(targetPose.dimensions.width,targetPose.dimensions.height)+150){returnDrone(s,m,d,at);continue;}
        const point=workPoint(targetPose,d);
        window.nativeShipMotion.step(d,{heading:Math.atan2(point.y-d.y,point.x-d.x),hold:true},window.nativeShipDefinitions.get(BASIC,'repair-drone').movement,Math.max(.000001,at-d.lastAt));
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
    window.nativeRepairVisuals?.advance(s,dt);
    for(const m of r.missions)if(active(m))advanceMission(s,m,at);
    if(r.missions.some(active))window.nativeShipSystems.invalidate(s);
    if(at+EPS<r.nextPollAt)return;
    r.nextPollAt=at+1;
    for(const {category,entity:e} of fleet(s)){
      const reference=ref(category,e),b=bay(s,e,category);
      if(!alive(e)){
        destroyed(s,e,category);
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
    for(const m of s.shipRepairs?.missions||[])if(active(m))for(const d of resolve(s,m.carrier)?.repairBay?.slots||[])if(d.missionId===m.id&&d.hull>0&&(system===undefined||d.system===system)&&!['stowed','destroyed'].includes(d.phase)&&!(d.phase==='launching'&&d.localLeg?.startedAt>clock(s))){
      const p=dronePose(s,d),base=window.nativeShipDefinitions.describe(s,d,{category:'repair-drone'});
      result.push({...base,x:p.x,y:p.y,heading:p.heading,speed:p.speed,vx:p.vx,vy:p.vy});
    }
    return result;
  }
  function hit(s,t,amount,impact){
    const r=s.shipRepairs,m=r?.missions.find(m=>m.id===t.entity.missionId),e=m&&resolve(s,m.carrier),d=e?.repairBay?.slots.find(d=>d.id===t.entity.id);
    if(!d)return {ok:false};
    const descriptor={...t,entity:d},result=window.nativeShipDamage.apply(descriptor,amount,impact);
    window.nativeShipEffects.hit(s,descriptor,result,impact);
    if(result.destroyed){d.phase='destroyed';delete d.localLeg;}return result;
  }
  const renderer={draw:(...args)=>window.nativeRepairVisuals?.drawDrone(...args),hit:(...args)=>window.nativeRepairVisuals?.hit(...args)};
  window.nativeShipDefinitions.register(BASIC,{name:'Basic Dot repair drone',hull:40,shields:0,cargo:0,equipment:[],movement:{maxSpeed:85,acceleration:100,braking:120,turnRate:Infinity,directGoal:true,snap:true,arrivalRadius:.1,serviceApproach:true},dimensions:{width:41.382,height:41.382},
    geometry:{hull:{width:.34,height:.34,minX:0,minY:0}},capabilities:{armed:false,canMine:false,canDock:false,canTrade:false,disableRatio:0},renderer});
  window.nativeShipSystems.register('repair-drone',{collect:drones,inspect:s=>[],hit,resolve:(s,id,system)=>drones(s,system).find(d=>d.id===id),visualImpact:(s,t,e)=>window.nativeShipEffects.visualImpact(s,t,e)});
  window.nativeShipRepairs=Object.freeze({initialize,advance,restock,call,claimed,validCall,releaseClaim,rendezvous,service,ref,key,resolve,pose,launch,missionFor,supplies,workPoint,drones,destroyed,
    reroute:(s,d,route)=>{if(!d.localLeg||route.valid===false)return false;d.localLeg=route;return true;},
    status:(s,e,category)=>({supplies:supplies(s,ref(category,e)),drones:e.repairBay?.slots.filter(d=>d.hull>0).length||0,mission:missionFor(s,ref(category,e))?.id,distress:callFor(s,ref(category,e))?.status}),
    rules:Object.freeze({hullPerTon:HULL_PER_TON,ratePerDrone:RATE,medicalStock:MEDICAL_STOCK,basicType:BASIC})});
})();
