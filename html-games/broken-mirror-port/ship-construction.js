/* Paid hull production. The existing saved fleet owns all commissioned vessels. */
(() => {
  'use strict';
  const station=Object.freeze({id:'earth-heavy-shipyard',name:'Earth Heavy Shipyard',system:1,bodyId:3,artworkId:278,size:340});
  const now=s=>window.nativeSimulation.seconds(s);
  const allowedIds=[1,2,3,4,5,6,7,8,9,10,12,13,15,16,17,18,26,34,36];
  function initialize(s){
    const value=s.shipConstruction||={version:1,nextId:1,orders:[],revenue:0,refunded:0};
    value.orders||=[];value.nextId=Math.max(1,Number(value.nextId)||1);return value;
  }
  function catalog(s){
    const ids=new Set([...allowedIds,...(window.nativeFederationShips?.ids||[])]);
    return window.VexedMirrorWorld.ships.filter(h=>ids.has(h.id)&&!h.devOnly).map(h=>window.nativeShipDefinitions.get(h.id));
  }
  function position(s){
    if(!s||!window.nativeSystemCatalog.sameSystem(s.system,1))return null;
    const earth=window.nativeSystemCatalog.bodies(1).find(b=>b.id===3);
    return {x:(earth?.x||0)+2200,y:(earth?.y||0)-1800};
  }
  function berth(s,type){
    const center=position({...s,system:1}),d=window.nativeShipDefinitions.dimensions({shipType:type},'civilian');
    const height=d.height,span=station.size,plan=window.shipConstruction.profile(window.nativeShipDefinitions.get(type));
    const b=window.shipConstruction.berth(plan),release=window.shipConstruction.release(plan,height,span,1);
    const x=center.x+(b.u-.5)*span,y=center.y+(b.v-.5)*span*1421/1107;
    return {x,y,height,launchX:x+release.x,launchY:y+release.y,heading:release.rotation-Math.PI/2};
  }
  const write=(s,save)=>{try{return (save?save():window.nativeSaveStorage.write(s))||{ok:false,error:'The save could not be verified.'};}catch(e){return {ok:false,error:e.message};}};
  function quote(s,type){
    const hull=catalog(s).find(h=>h.id===Number(type));if(!hull)return {ok:false,error:'This hull is not sold at Earth Heavy Shipyard.'};
    const plan=window.shipConstruction.profile(hull),price=Math.max(0,Math.round(Number(hull.price)||0));
    return {ok:true,hull,price,seconds:plan.seconds,affordable:s.devMode||Number(s.latinum)>=price};
  }
  function order(s,{shipType,name='',requestId}={},save){
    if(!s||!position(s))return {ok:false,error:'Travel to Sol to order a ship.'};
    const p=window.vexedSolFlight.shipPosition(s),center=position(s);
    if(Math.hypot(p.x-center.x,p.y-center.y)>1400)return {ok:false,error:'Fly within 1,400 units of Earth Heavy Shipyard to order a ship.'};
    if(s.hull<=0||s.phase==='disabled'||s.pendingTransit||s.localCruise)return {ok:false,error:'Finish your approach before ordering a ship.'};
    const q=quote(s,shipType);if(!q.ok)return q;
    const value=initialize(s),prior=requestId&&value.orders.find(o=>o.requestId===String(requestId));
    if(prior)return {ok:true,order:prior,repeated:true};
    if(value.orders.filter(o=>!['commissioned','cancelled'].includes(o.status)).length>=20)return {ok:false,error:'The construction queue is full.'};
    if(!q.affordable)return {ok:false,error:'Not enough latinum for this ship.'};
    const before=JSON.stringify(value),money=s.latinum,at=now(s),startAt=value.orders.reduce((n,o)=>o.status==='cancelled'?n:Math.max(n,o.finishAt||0),at);
    const item={id:value.nextId++,shipType:q.hull.id,name:String(name).trim().slice(0,60)||`${q.hull.name} ${value.nextId-1}`,
      requestId:requestId?String(requestId):null,status:'ordered',orderedAt:at,startAt,finishAt:startAt+q.seconds,
      duration:q.seconds,price:s.devMode?0:q.price,station:station.id,system:1};
    s.latinum=Number(s.latinum||0)-item.price;value.revenue+=item.price;value.orders.push(item);
    const saved=write(s,save);if(!saved.ok){s.shipConstruction=JSON.parse(before);s.latinum=money;return saved;}
    return {ok:true,order:item,message:`${item.name} ordered. Construction ${startAt>at?'queued':'started'}.`};
  }
  function cancel(s,id,save){
    const value=initialize(s),item=value.orders.find(o=>o.id===Number(id));
    if(!item||item.status!=='ordered'||now(s)>=item.startAt)return {ok:false,error:'Only ships waiting for a construction berth can be cancelled.'};
    const before=JSON.stringify(value),money=s.latinum;item.status='cancelled';s.latinum+=item.price;value.refunded+=item.price;
    let cursor=now(s);for(const o of value.orders)if(!['commissioned','cancelled'].includes(o.status)){
      if(o.startAt<=now(s)){cursor=o.finishAt;continue;}o.startAt=cursor;o.finishAt=cursor+o.duration;cursor=o.finishAt;
    }
    const saved=write(s,save);if(!saved.ok){s.shipConstruction=JSON.parse(before);s.latinum=money;return saved;}
    return {ok:true,message:'Queued ship cancelled and payment refunded.'};
  }
  function advance(s,dt,save){
    if(!s||window.nativeSimulation.blocked())return {ok:true,commissioned:0};
    const value=s.shipConstruction;if(!value)return {ok:true,commissioned:0};
    let count=0;
    for(const item of value.orders){
      if(item.status!=='ordered'||now(s)<item.finishAt)continue;
      // A saved order's identity is the commissioning key, including after interrupted writes.
      const existing=s.constructionOrder===item.id?s:s.civilianTraffic?.ships?.find(ship=>ship.constructionOrder===item.id&&ship.playerOwned);
      if(existing){item.status='commissioned';item.shipId=existing.id;continue;}
      window.nativeCivilianTraffic.initialize(s);
      const ships=s.civilianTraffic.ships,b=berth(s,item.shipType),definition=window.nativeShipDefinitions.get(item.shipType);
      const ship={id:ships.reduce((n,h)=>Math.max(n,Number(h.id)||0),-1)+1,name:item.name,shipType:item.shipType,
        playerOwned:true,constructionOrder:item.id,vesselId:station.id+':'+item.id,ownerGovernmentId:16,npcRole:'faction',role:'player-fleet',
        system:1,stationSystem:1,homeSystem:1,operatingBase:1,port:3,x:b.launchX,y:b.launchY,heading:b.heading,speed:0,
        previousX:b.launchX,previousY:b.launchY,phase:'holding',hull:definition.hull,shields:definition.shields,
        credits:0,cargo:null,oreHold:0,lifeVersion:1,lifeScheduleToken:1,taskSequence:0,recentEvents:[],
        homeBase:{system:1,port:3},nextActionAt:item.finishAt+.01,
        fleetOrder:{mode:'park',system:1,x:b.launchX+360+(item.id%4)*90,y:b.launchY+(item.id%5-2)*110}};
      window.nativeShipEquipment.ensure(s,ship,definition.equipment);
      const fitted=window.nativeShipDefinitions.forEntity(s,ship,{category:'civilian'});ship.hull=fitted.hull;ship.shields=fitted.shields;
      ships.push(ship);item.status='commissioned';item.shipId=ship.id;item.commissionedAt=now(s);
      const saved=write(s,save);
      if(!saved.ok){ships.splice(ships.indexOf(ship),1);item.status='ordered';delete item.shipId;delete item.commissionedAt;return {...saved,commissioned:count};}
      window.nativeNpcLives.invalidateMembership(s);window.nativeShipSystems.invalidateShips(s,1);count++;
    }
    return {ok:true,commissioned:count};
  }
  const fleet=s=>(s.civilianTraffic?.ships||[]).filter(ship=>ship.playerOwned);
  function command(s,id,mode,system=s.system,save){
    const ship=fleet(s).find(h=>h.id===Number(id));
    if(!ship||ship.hull<=0||['disabled','destroyed'].includes(ship.phase))return {ok:false,error:'This fleet ship is unavailable.'};
    if(!['hold','follow','travel'].includes(mode))return {ok:false,error:'Choose a fleet order.'};
    if(!window.VexedMirrorWorld.systems.some(h=>h.id===Number(system)))return {ok:false,error:'Choose a valid destination system.'};
    const before=JSON.stringify(ship),p=window.vexedSolFlight.shipPosition(s);
    ship.fleetOrder={mode,system:Number(system),x:mode==='hold'?ship.x:p.x,y:mode==='hold'?ship.y:p.y};
    if(!ship.journey){delete ship.localLeg;delete ship.navigationRequest;ship.phase='holding';window.nativeShipMotion.stop(ship,{preserveImpulse:true});}
    ship.nextActionAt=now(s)+.01;ship.lifeScheduleToken=(ship.lifeScheduleToken||0)+1;
    const saved=write(s,save);if(!saved.ok){for(const key of Object.keys(ship))delete ship[key];Object.assign(ship,JSON.parse(before));return saved;}
    window.nativeNpcLives.invalidateMembership(s);window.nativeShipSystems.refreshShip(s,ship,'civilian');
    return {ok:true,message:`${ship.name}: ${mode==='follow'?'following your flagship':mode==='hold'?'holding position':'travelling to '+window.VexedMirrorWorld.systems.find(h=>h.id===Number(system)).name}.`};
  }
  function takeCommand(s,id,save){
    const ship=fleet(s).find(h=>h.id===Number(id));
    if(!ship||ship.hull<=0||ship.phase==='disabled'||ship.journey)return {ok:false,error:'This vessel is unavailable for command transfer.'};
    if(ship.system!==s.system||s.localCruise||s.shipyardDock||s.pendingTransit)return {ok:false,error:'Meet the vessel in open space before transferring command.'};
    const p=window.vexedSolFlight.shipPosition(s);
    if(Math.hypot(ship.x-p.x,ship.y-p.y)>1400)return {ok:false,error:'Move within 1,400 units of the vessel to transfer command.'};
    const blocked=window.nativePrometheus?.blockedTravel(s);if(blocked)return blocked;
    const capacity=window.nativeShipDefinitions.forEntity(s,ship,{category:'civilian'}).cargo;
    if(window.nativeShipEquipment.cargoUsed(s)>capacity)return {ok:false,error:'Cargo aboard exceeds the capacity of the selected vessel.'};
    if(window.nativeShipRepairs?.playerDronesDeployed(s)||Object.values(ship.shipEquipment?.instances||{}).some(i=>i.category==='repairDrone'&&!['stowed','destroyed'].includes(i.phase||'stowed')))return {ok:false,error:'Recover deployed repair Dots before transferring command.'};
    const fields=['shipType','hull','shields','shipEquipment','weaponLoadout','weapons','weaponInventory','repairBay','shipThrusters','shipRefit','inventoryLayout','miningTool','mineralUpgrades','tugEngineLevel','constructionOrder','vesselId'];
    const before=Object.fromEntries([...fields,'shipName','shipClass','x','y','angle','vx','vy','speed','phase','landed'].map(k=>[k,{present:Object.hasOwn(s,k),value:s[k]}])),oldShip=JSON.parse(JSON.stringify(ship));
    const oldName=s.shipName,oldHeading=s.angle,oldVx=s.vx,oldVy=s.vy,oldSpeed=s.speed;
    for(const key of fields){const value=s[key];if(Object.hasOwn(ship,key))s[key]=ship[key];else delete s[key];if(before[key].present)ship[key]=value;else delete ship[key];}
    s.shipName=ship.name;s.shipClass=window.nativeShipDefinitions.get(s.shipType).name;
    const body=s.system===1?window.nativeSystemCatalog.bodies(1).find(b=>b.id===window.nativeSystemCatalog.currentId(s)):null;
    s.x=oldShip.x-(body?.x||0);s.y=oldShip.y-(body?.y||0);s.angle=oldShip.heading;s.vx=oldShip.vx||0;s.vy=oldShip.vy||0;s.speed=oldShip.speed||0;s.phase='flight';s.landed=false;
    ship.name=oldName||window.nativeShipDefinitions.get(ship.shipType).name;ship.x=p.x;ship.y=p.y;ship.previousX=p.x;ship.previousY=p.y;ship.heading=oldHeading;ship.vx=oldVx||0;ship.vy=oldVy||0;ship.speed=oldSpeed||0;
    ship.vesselId||='flagship:original';
    delete ship.localLeg;delete ship.navigationRequest;ship.phase='holding';ship.fleetOrder={mode:'hold',system:ship.system,x:ship.x,y:ship.y};ship.nextActionAt=now(s)+.01;ship.lifeScheduleToken++;
    const saved=write(s,save);if(!saved.ok){for(const [key,item] of Object.entries(before)){if(item.present)s[key]=item.value;else delete s[key];}for(const key of Object.keys(ship))delete ship[key];Object.assign(ship,oldShip);return saved;}
    window.nativeNpcLives.invalidateMembership(s);window.nativeShipSystems.invalidateShips(s,s.system);
    return {ok:true,message:`Command transferred to ${s.shipName}. ${ship.name} remains in your fleet.`};
  }
  function orders(s){return (s.shipConstruction?.orders||[]).map(item=>({...item,...window.shipConstruction.sample(window.shipConstruction.profile(window.nativeShipDefinitions.get(item.shipType)),Math.max(0,now(s)-item.startAt)),
    queued:now(s)<item.startAt,wait:Math.max(0,item.startAt-now(s))}));}
  const active=s=>s.shipConstruction?.orders?.find(o=>o.status==='ordered'&&o.startAt<=now(s))||null;
  window.nativeShipConstruction=Object.freeze({station,initialize,catalog,position,berth,quote,order,cancel,advance,orders,active,fleet,command,takeCommand});
})();
