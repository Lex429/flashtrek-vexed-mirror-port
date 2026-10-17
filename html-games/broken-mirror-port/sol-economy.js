/* Sol's saved port inventories, production, and Tug Class II freight traffic. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld;
  const goods = ['Ore', 'Metal', 'Components', 'Computers', 'Fuel', 'Food', 'Medicine', 'Deuranium', 'Hull Sections'];
  const basePrices = [12, 24, 48, 70, 30, 16, 42, 55, 110];
  const ports = [1, 2, 3, 4, 5, 7, 8, 9, 10];
  const names = {1:'Mercury',2:'Venus',3:'Earth',4:'Moon',5:'Mars',7:'Jupiter',8:'Saturn',9:'Uranus',10:'Neptune'};
  const roles = {1:'Mineral extraction',2:'Fuel processing',3:'Food and medical supply',4:'Metal and component works',5:'Utopia Planitia shipyards',7:'Computer and engine research',8:'Outer fuel depot',9:'Gas harvesting',10:'Frontier research'};
  const lanes = [
    {a:1,b:4,forward:0,back:2}, {a:4,b:5,forward:2,back:8},
    {a:3,b:5,forward:6,back:8}, {a:3,b:2,forward:6,back:4},
    {a:3,b:7,forward:5,back:3}, {a:7,b:8,forward:3,back:4},
    {a:8,b:9,forward:4,back:4}, {a:9,b:10,forward:4,back:3},
    {a:10,b:3,forward:3,back:5}
  ];
  const coords = {1:[-4100,1100],2:[-2300,-1500],3:[0,0],4:[1400,-250],5:[4800,1800],7:[11800,2700],8:[15300,-2700],9:[19000,3300],10:[23200,-4400]};
  const bodySizes = {1:62,2:105,3:128,4:48,5:85,7:165,8:155,9:112,10:110};
  const handlingRate = {1:12,2:18,3:30,4:25,5:28,7:24,8:15,9:14,10:12};
  const targetStock = {
    1:[35,18,18,25,45,45,30,25,12],
    2:[18,18,18,25,50,45,30,18,12],
    3:[25,45,50,65,55,60,40,30,60],
    4:[140,40,40,55,55,45,30,65,25],
    5:[45,160,160,125,65,55,35,100,30],
    7:[25,35,130,40,65,55,30,25,18],
    8:[20,25,35,55,45,45,30,20,12],
    9:[20,25,35,55,45,45,30,20,12],
    10:[25,35,75,40,55,45,30,25,18]
  };
  const buildMaterials=[[1,15],[2,12],[3,6],[7,5],[8,2]];
  const solGovernmentId=Number(world.systems.find(system=>system.id===1)?.governmentId)||1;
  let targetId=null,tugSelectedAt=0;
  const tugStats=()=>window.VexedMirrorWorld.ships.find(ship=>ship.id===10);
  const lifeNow=economy=>Number(economy.processingAt??economy.lifeClock)||0;
  function lifeEvent(economy,ship,kind,message){
    ship.recentEvents||=[];ship.recentEvents.unshift({at:lifeNow(economy),kind,message});ship.recentEvents.length=Math.min(16,ship.recentEvents.length);
  }
  function ensureLives(economy,state){
    economy.flows||={produced:goods.map(()=>0),consumed:goods.map(()=>0),lost:goods.map(()=>0)};
    if(!Number.isFinite(economy.lifeClock))economy.lifeClock=window.nativeSimulation?.seconds(state)||0;
    economy.lifeMetrics||={detailed:0,distant:0,distantUpdates:0,scheduledEvents:0,deferred:0};
    for(const ship of economy.freighters)if(ship.lifeVersion!==1){
      Object.assign(ship,{lifeVersion:1,identity:`tug:${ship.id}`,name:`Sol Freight ${String(ship.id+1).padStart(2,'0')}`,role:'freight',homeBase:{system:1,port:ship.port},system:1,credits:0,recentEvents:[]});
      ship.cargoOwner=ship.ownerGovernmentId;ship.weapons||=[];
      window.nativeWeaponLoadout?.ensure(state,ship,[]);
      lifeEvent(economy,ship,'registered','Existing Sol fleet identity retained; internal company freight.');
      syncTask(economy,ship);
    }
    return economy;
  }
  function syncTask(economy,ship){
    const job=ship.assignment,old=ship.task;
    if(!old||old.status!=='active'||old.kind!==(job?'freight':'idle')||old.fromPort!==job?.from||old.toPort!==job?.to||old.good!==job?.good){
      ship.taskSequence=(ship.taskSequence||0)+1;
      ship.task={id:`tug:${ship.id}:${ship.taskSequence}`,kind:job?'freight':'idle',reason:job?'Deliver available surplus to an unmet Sol port shortage.':'No affordable surplus meets a port shortage.',fromPort:job?.from,toPort:job?.to,good:job?.good,requirements:job?{stock:job.tons,capacity:160}:null,startedAt:lifeNow(economy),status:'active',completion:'Dock and transfer carried cargo once.',failure:'Ship destroyed or disabled; loaded cargo remains stranded or is lost.'};
    }
    ship.task.phase=ship.phase;ship.task.progress=Number(ship.progress)||0;
    if(['disabled','destroyed'].includes(ship.phase)){ship.task.status='failed';ship.task.failureReason=ship.phase;}
  }
  function disable(economy,ship){
    if(ship.phase==='destroyed'||ship.phase==='disabled'||ship.hull<=0)return;
    ship.phase='disabled';ship.speed=0;ship.turnTimer=0;
    note(economy,`Tug ${ship.id+1} disabled. Engines and lights offline; cargo stranded in space.`);
    ship.lifeLeg=null;ship.lifeEventAt=null;syncTask(economy,ship);lifeEvent(economy,ship,'disabled','Engines disabled; loaded cargo is stranded aboard, no destination stock awarded.');
  }
  const tugDimensions=()=>window.nativeShipDefinitions.dimensions({shipType:10},'tug');
  const center = id => ({x:coords[id][0]-220,y:coords[id][1]+75});
  const clearance = id => bodySizes[id]/2+105;
  const station = (id,shipId=0) => {
    const body=center(id),angle=-Math.PI/2+(shipId%9)*Math.PI*2/9,radius=bodySizes[id]/2+220;
    return {x:body.x+Math.cos(angle)*radius,y:body.y+Math.sin(angle)*radius};
  };
  function legacyWaypoint(from,to,arrival=false) {
    const a=center(from),b=center(to),distance=Math.hypot(b.x-a.x,b.y-a.y)||1;
    const id=arrival?to:from,body=arrival?b:a,direction=arrival?-1:1;
    return {x:body.x+direction*(b.x-a.x)/distance*clearance(id),y:body.y+direction*(b.y-a.y)/distance*clearance(id)};
  }
  // Insert a wide two-point bypass wherever a leg would cross a planet's approach zone.
  function route(start,end) {
    const path=[start,end];
    for(let pass=0;pass<24;pass++) {
      let changed=false;
      for(let segment=0;segment<path.length-1&&!changed;segment++) {
        const a=path[segment],b=path[segment+1],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
        if(length<1)continue;
        let obstruction=null;
        for(const id of ports) {
          const body=center(id),t=((body.x-a.x)*dx+(body.y-a.y)*dy)/(length*length);
          if(t<=0||t>=1)continue;
          const side=((body.x-a.x)*-dy+(body.y-a.y)*dx)/length;
          if(Math.abs(side)<clearance(id)+25 && (!obstruction||t<obstruction.t))obstruction={id,t,side};
        }
        if(!obstruction)continue;
        const margin=clearance(obstruction.id)*2.3,sign=obstruction.side>=0?-1:1;
        const foot={x:a.x+dx*obstruction.t,y:a.y+dy*obstruction.t};
        path.splice(segment+1,0,
          {x:foot.x-dx/length*margin+sign*-dy/length*margin,y:foot.y-dy/length*margin+sign*dx/length*margin},
          {x:foot.x+dx/length*margin+sign*-dy/length*margin,y:foot.y+dy/length*margin+sign*dx/length*margin});
        changed=true;
      }
      if(!changed)break;
    }
    return path.slice(1);
  }
  const qty = value => Math.max(0,Math.floor(Number(value)||0));
  const stock = (economy,port,good) => qty(economy.ports[port]?.[good]);
  const availableStock=(economy,port,good)=>Math.max(0,stock(economy,port,good)-qty(economy.stockReserved?.[port]?.[good]));
  const distance = (a,b) => Math.hypot(coords[a][0]-coords[b][0],coords[a][1]-coords[b][1]);
  function handlingTime(economy,port,tons,ship,unloading=false) {
    const busy=economy.freighters.filter(other=>other!==ship&&other.port===port&&['loading','unloading'].includes(other.phase)).length;
    const queue=Math.min(3,busy)*1.1;
    const variation=1.5*(1+Math.sin(economy.clock*.73+ship.id*2.17+port*.91+(unloading?1.4:0)))/2;
    return Math.max(2.5,(unloading?1.25:1.75)+Math.max(0,tons)/handlingRate[port]+queue+variation);
  }
  function inbound(economy,port,good,except) {
    return economy.freighters.reduce((sum,other)=>sum+(other!==except && !['disabled','destroyed'].includes(other.phase) && other.assignment?.to===port && other.assignment.good===good ? qty(other.assignment.tons) : 0),qty(economy.incomingReserved?.[port]?.[good]));
  }
  function candidate(economy,from,to,good,ship) {
    const surplus=availableStock(economy,from,good)-targetStock[from][good];
    const shortage=targetStock[to][good]-stock(economy,to,good)-inbound(economy,to,good,ship);
    const tons=Math.floor(Math.min(160,surplus,shortage));
    if(from===to||tons<10)return null;
    const urgency=Math.min(2,shortage/Math.max(20,targetStock[to][good]));
    const score=tons*(1+urgency)*Math.sqrt(basePrices[good]/24)/(1+distance(from,to)/16000);
    return {from,to,good,tons,score};
  }
  function bestJob(economy,ship,localOnly=false) {
    let best=null;
    for(const from of localOnly?[ship.port]:ports)for(const to of ports)for(let good=0;good<goods.length;good++) {
      const job=candidate(economy,from,to,good,ship);
      if(!job)continue;
      const approach=from===ship.port?1:1+distance(ship.port,from)/12000;
      const variety=to===ship.lastDestination?.to && good===ship.lastDestination.good ? .68:1;
      job.score=job.score/approach*variety;
      if(!best||job.score>best.score)best=job;
    }
    return best;
  }
  function setCourse(ship,to) {
    ship.from=ship.port;ship.to=to;ship.pathStart={x:ship.x,y:ship.y};ship.path=route(ship.pathStart,station(to,ship.id));
    ship.routeIndex=0;ship.progress=0;ship.turnTimer=6;ship.phase='turning';ship.speed=0;
    ship.lifeLeg=null;ship.lifeEventAt=null;
  }
  function beginLoading(economy,ship) {
    const job=ship.assignment;
    if(!job||job.from!==ship.port){dispatch(economy,ship);return;}
    const available=availableStock(economy,job.from,job.good)-targetStock[job.from][job.good];
    const needed=targetStock[job.to][job.good]-stock(economy,job.to,job.good)-inbound(economy,job.to,job.good,ship);
    const tons=Math.floor(Math.min(job.tons,available,needed));
    if(tons<10){dispatch(economy,ship);return;}
    ship.handlingTons=tons;ship.phase='loading';ship.dwell=handlingTime(economy,ship.port,tons,ship);ship.progress=0;
  }
  function dispatch(economy,ship) {
    ship.assignment=null;ship.good=null;ship.tons=0;
    const job=bestJob(economy,ship,true)||bestJob(economy,ship);
    if(!job) {ship.phase='waiting';ship.dwell=5;ship.from=ship.port;ship.to=ship.port;syncTask(economy,ship);return;}
    ship.assignment={from:job.from,to:job.to,good:job.good,tons:job.tons};ship.good=job.good;
    if(job.from===ship.port) {
      ship.from=ship.port;ship.to=job.to;beginLoading(economy,ship);
    } else setCourse(ship,job.from);
    syncTask(economy,ship);
  }
  function repairShip(ship) {
    if(!ports.includes(ship.port))ship.port=ship.from;
    if(!Number.isFinite(ship.x)||!Number.isFinite(ship.y)) {
      const start=legacyWaypoint(ship.from,ship.to),end=legacyWaypoint(ship.from,ship.to,true);
      const points=route(start,end),total=points.reduce((sum,p,i)=>sum+Math.hypot(p.x-(i?points[i-1].x:start.x),p.y-(i?points[i-1].y:start.y)),0);
      let traveled=total*Math.max(0,Math.min(1,Number(ship.progress)||0)),previous=start;
      for(const point of points) {
        const segment=Math.hypot(point.x-previous.x,point.y-previous.y);
        if(traveled<=segment||point===points[points.length-1]) {
          const t=segment?Math.min(1,traveled/segment):0;
          ship.x=previous.x+(point.x-previous.x)*t;ship.y=previous.y+(point.y-previous.y)*t;
          break;
        }
        traveled-=segment;previous=point;
      }
    }
    if(!Number.isFinite(ship.heading))ship.heading=Math.atan2(station(ship.to,ship.id).y-ship.y,station(ship.to,ship.id).x-ship.x);
    if(!Number.isFinite(ship.speed))ship.speed=0;
    if(!Number.isFinite(ship.dwell))ship.dwell=0;
    if(!Number.isInteger(ship.routeIndex))ship.routeIndex=0;
    if(!Array.isArray(ship.path)){ship.pathStart={x:ship.x,y:ship.y};ship.path=route(ship.pathStart,station(ship.to,ship.id));}
    return ship;
  }
  function initialize(state) {
    state.solFreightHold ||= {};
    if(state.solEconomy?.ports && Array.isArray(state.solEconomy.freighters)) {
      const economy=state.solEconomy;
      const oldVersion=economy.version||0;
      if(economy.version<3) {
        for(const ship of economy.freighters) {
          repairShip(ship);
          if(ship.departing) {ship.port=ship.from;ship.assignment=null;ship.phase='waiting';ship.dwell=0;ship.tons=0;}
          else {ship.phase='travel';ship.pathStart={x:ship.x,y:ship.y};ship.path=route(ship.pathStart,station(ship.to,ship.id));ship.routeIndex=0;ship.assignment=ship.tons?{from:ship.from,to:ship.to,good:ship.good,tons:ship.tons}:null;}
          delete ship.departing;
        }
        economy.version=3;
        for(const ship of economy.freighters)if(ship.phase==='waiting')dispatch(economy,ship);
      }
      if(oldVersion===3)for(const ship of economy.freighters) {
        if(ship.phase==='loading'||ship.phase==='unloading') {
          const tons=ship.phase==='loading'?ship.assignment?.tons||0:ship.tons;
          const remaining=Math.max(0,Math.min(1,(Number(ship.dwell)||0)/60));
          ship.handlingTons=tons;
          ship.dwell=handlingTime(economy,ship.port,tons,ship,ship.phase==='unloading')*remaining;
        }
      }
      if(economy.version<4)economy.version=4;
      if(oldVersion<5) {
        for(const ship of economy.freighters) {
          if(ship.phase!=='travel') {
            const berth=station(ship.port,ship.id);
            ship.x=berth.x;ship.y=berth.y;ship.speed=0;
          }
          if(ship.phase==='travel'||ship.phase==='turning') {
            ship.pathStart={x:ship.x,y:ship.y};ship.path=route(ship.pathStart,station(ship.to,ship.id));
            ship.routeIndex=0;
          }
        }
        economy.version=5;
      }
      if(economy.version<6){
        for(const ship of economy.freighters){ship.hull=tugStats().hull;ship.shields=tugStats().shields;ship.rebuild=0;}
        economy.version=6;
      }
      if(economy.version<7){
        for(const ship of economy.freighters)disable(economy,ship);
        economy.version=7;
      }
      if(economy.version<8){
        for(const ship of economy.freighters)ship.ownerGovernmentId=Number(ship.ownerGovernmentId)||solGovernmentId;
        economy.version=8;
      }
      return ensureLives(economy,state);
    }
    const inventory={};
    for(const port of ports)inventory[port]=goods.map((_,i)=>i===5?30:12);
    Object.assign(inventory,{
      1:[200,50,20,8,18,20,10,80,2],2:[25,20,18,12,180,25,15,15,2],
      3:[20,35,35,35,35,180,120,25,15],4:[100,110,85,25,25,35,15,50,10],
      5:[30,100,95,70,40,40,30,70,70],7:[15,30,75,120,35,50,15,15,8],
      8:[12,20,30,45,130,25,15,15,2],9:[12,20,20,30,140,20,12,15,2],
      10:[15,25,30,70,90,25,15,15,3]
    });
    const freighters=lanes.map((lane,id)=>({id,port:lane.a,from:lane.a,to:lane.a,good:null,tons:0,progress:0,phase:'waiting',dwell:0,turnTimer:0,routeIndex:0,path:[],x:station(lane.a,id).x,y:station(lane.a,id).y,heading:-Math.PI/2,speed:0,assignment:null,hull:tugStats().hull,shields:tugStats().shields,rebuild:0,ownerGovernmentId:solGovernmentId}));
    state.solEconomy={version:8,ports:inventory,clock:0,freighters,log:[]};
    for(const ship of freighters)dispatch(state.solEconomy,ship);
    return ensureLives(state.solEconomy,state);
  }
  function note(economy,message) {economy.log.unshift(message);economy.log.length=Math.min(economy.log.length,12);}
  function beginRebuild(economy,ship){
    if(ship.phase!=='destroyed'||ship.rebuild>0||buildMaterials.some(([good,amount])=>availableStock(economy,5,good)<amount))return false;
    for(const [good,amount] of buildMaterials){economy.ports[5][good]-=amount;economy.flows.consumed[good]+=amount;}
    ship.rebuild=120;
    note(economy,`Mars began constructing replacement Tug ${ship.id+1}.`);
    return true;
  }
  function finishRebuild(economy,ship){
    const berth=station(5,ship.id);
    Object.assign(ship,{port:5,from:5,to:5,x:berth.x,y:berth.y,heading:-Math.PI/2,speed:0,
      hull:tugStats().hull,shields:tugStats().shields,shieldFlash:null,phase:'waiting',rebuild:0,dwell:3,
      assignment:null,good:null,tons:0,handlingTons:0,path:[],routeIndex:0,progress:0});
    note(economy,`Mars launched replacement Tug ${ship.id+1}.`);
    ship.lifeGeneration=(ship.lifeGeneration||0)+1;ship.lifeLeg=null;ship.lifeEventAt=null;
    lifeEvent(economy,ship,'replacement',`Replacement hull generation ${ship.lifeGeneration}; previous cargo was not restored.`);
    syncTask(economy,ship);
  }
  function destroy(economy,ship,stage){
    const lost=ship.tons,good=ship.good;
    if(lost>0&&Number.isInteger(good))economy.flows.lost[good]+=lost;
    Object.assign(ship,{hull:0,shields:0,shieldFlash:null,phase:'destroyed',rebuild:0,speed:0,tons:0,good:null,
      handlingTons:0,assignment:null,path:[]});
    if(targetId===ship.id)targetId=null;
    note(economy,`Tug ${ship.id+1} destroyed${lost?`; ${lost} t of ${goods[good]} lost in space`:''}.`);
    ship.lifeLeg=null;ship.lifeEventAt=null;syncTask(economy,ship);lifeEvent(economy,ship,'destroyed',`${lost||0} t of carried stock lost; destination receives nothing.`);
    beginRebuild(economy,ship);
  }
  function hit(state,id,damage,impact={}){
    impact||={};const economy=initialize(state),ship=economy.freighters.find(entry=>entry.id===id);
    if(!ship)return {ok:false,error:'Target unavailable.'};
    const descriptor=window.nativeShipDefinitions.describe(state,ship,{category:'tug'});
    const result=window.nativeShipDamage.apply(descriptor,damage,impact);
    if(!result.ok)return result;
    window.nativeShipEffects.hit(state,descriptor,result,impact);
    const reputation=result.destroyed&&impact.source!=='ai'?window.nativeFactionStanding.shipDestroyed(state,Number(ship.ownerGovernmentId)||solGovernmentId):null;
    if(result.destroyed)destroy(economy,ship,result.beforeStage);else if(result.disabled)disable(economy,ship);
    return {...result,reputation};
  }
  function visualImpact(state,id,event={}){
    const ship=initialize(state).freighters.find(entry=>entry.id===id);
    if(!ship||state.system!==1)return {ok:false};
    return window.nativeShipEffects.visualImpact(state,window.nativeShipDefinitions.describe(state,ship,{category:'tug'}),event);
  }
  function produce(economy) {
    const p=economy.ports;
    const make=(port,output,amount,inputs=[])=>{
      if(inputs.some(([good,needed])=>availableStock(economy,port,good)<needed))return;
      for(const [good,needed] of inputs){p[port][good]-=needed;economy.flows.consumed[good]+=needed;}
      const before=stock(economy,port,output);p[port][output]=Math.min(9999,before+amount);economy.flows.produced[output]+=p[port][output]-before;
    };
    make(1,0,16);make(1,7,5);make(2,4,12);make(3,5,12);
    make(3,6,4,[[5,2]]);make(4,1,8,[[0,10]]);make(4,2,5,[[1,6]]);
    make(5,8,3,[[1,4],[2,3],[3,1],[7,1]]);
    make(7,3,6,[[2,4]]);make(8,4,9);make(9,4,10);
    make(10,3,3,[[2,2]]);
    for(const port of ports)for(const good of [4,5,6])if(port!==3&&port!==2&&port!==8&&port!==9&&availableStock(economy,port,good)>0){p[port][good]=Math.max(0,p[port][good]-1);economy.flows.consumed[good]++;}
  }
  function load(economy,ship) {
    const job=ship.assignment;
    if(!job||job.from!==ship.port){dispatch(economy,ship);return;}
    const available=availableStock(economy,job.from,job.good)-targetStock[job.from][job.good];
    const needed=targetStock[job.to][job.good]-stock(economy,job.to,job.good)-inbound(economy,job.to,job.good,ship);
    const tons=Math.floor(Math.min(job.tons,ship.handlingTons||job.tons,available,needed));
    if(tons<10){dispatch(economy,ship);return;}
    economy.ports[job.from][job.good]-=tons;
    ship.tons=tons;job.tons=tons;ship.good=job.good;
    note(economy,`${names[job.from]} loaded ${tons} t of ${goods[job.good]} aboard Tug ${ship.id+1} for ${names[job.to]}.`);
    lifeEvent(economy,ship,'loaded',`Loaded ${tons} t of ${goods[job.good]} from ${names[job.from]} inventory for ${names[job.to]}.`);
    setCourse(ship,job.to);
  }
  function scheduleTug(economy,ship,at){
    ship.lifeLeg=null;
    delete ship.lifeSkipPending;
    if(ship.phase==='disabled'){ship.lifeEventAt=null;return;}
    if(ship.phase==='travel'){
      let skipped=0,goal=ship.path[ship.routeIndex];
      while(goal&&Number.isFinite(goal.x)&&Number.isFinite(goal.y)&&Math.hypot(goal.x-ship.x,goal.y-ship.y)<=window.nativeShipMotion.arrivalEpsilon&&skipped++<64){
        ship.x=goal.x;ship.y=goal.y;window.nativeShipMotion.stop(ship);ship.routeIndex++;goal=ship.path[ship.routeIndex];
      }
      if(skipped>64){ship.lifeSkipPending=true;ship.lifeEventAt=at+1/60;return;}
      if(!goal){arriveTug(economy,ship);scheduleTug(economy,ship,at);return;}
      ship.lifeLeg=window.nativeShipMotion.planLeg(ship,goal,window.nativeShipDefinitions.get(10,'tug').movement||window.nativeShipMotion.profiles.tug(),at);
      if(ship.lifeLeg.valid!==false){ship.lifeEventAt=at+ship.lifeLeg.duration;return;}
      ship.lifeLeg=null;ship.phase='waiting-route';window.nativeShipMotion.stop(ship);ship.task.status='blocked';ship.task.failureReason='Invalid saved route; cargo remains aboard';
    }
    const delay=ship.phase==='waiting-route'?30:ship.phase==='destroyed'?(ship.rebuild||5):ship.phase==='turning'?(ship.turnTimer||0):ship.dwell||0;
    ship.lifeEventAt=at+Math.max(.001,delay);
  }
  function arriveTug(economy,ship){
    if(!ports.includes(ship.to)){ship.phase='waiting-route';window.nativeShipMotion.stop(ship);ship.task.status='blocked';ship.task.failureReason='Unknown freight destination; cargo remains aboard';return;}
    ship.port=ship.to;window.nativeShipMotion.stop(ship);ship.progress=1;
    if(ship.tons){ship.phase='unloading';ship.handlingTons=ship.tons;ship.dwell=handlingTime(economy,ship.port,ship.tons,ship,true);}
    else{ship.from=ship.port;ship.to=ship.assignment?.to||ship.port;beginLoading(economy,ship);}
  }
  function tugEvent(economy,ship,at){
    if(ship.phase==='destroyed'){
      if(ship.rebuild>0){ship.rebuild=0;finishRebuild(economy,ship);}else beginRebuild(economy,ship);
    }else if(ship.phase==='waiting')dispatch(economy,ship);
    else if(ship.phase==='waiting-route'){
      if(ports.includes(ship.to)&&Number.isFinite(ship.x)&&Number.isFinite(ship.y)){ship.path=route({x:ship.x,y:ship.y},station(ship.to,ship.id));ship.routeIndex=0;ship.phase='travel';}
      else ship.dwell=30;
    }
    else if(ship.phase==='loading')load(economy,ship);
    else if(ship.phase==='unloading'){
      if(ship.tons){
        economy.ports[ship.port][ship.good]=stock(economy,ship.port,ship.good)+ship.tons;
        note(economy,`${names[ship.port]} received ${ship.tons} t of ${goods[ship.good]} from Tug ${ship.id+1}.`);
        lifeEvent(economy,ship,'delivered',`Transferred ${ship.tons} t of ${goods[ship.good]} into ${names[ship.port]} inventory.`);
      }
      ship.lastDestination={to:ship.port,good:ship.good};ship.tons=0;ship.deliveries=(ship.deliveries||0)+1;ship.task.status='complete';dispatch(economy,ship);
    }else if(ship.phase==='turning'){ship.turnTimer=0;ship.phase='travel';}
    else if(ship.phase==='travel'){
      if(ship.lifeSkipPending){scheduleTug(economy,ship,at);return;}
      if(ship.lifeLeg){
        const sampled=window.nativeShipMotion.sampleLeg(ship,ship.lifeLeg,at);
        if(sampled.invalid){ship.lifeLeg=null;ship.phase='waiting-route';window.nativeShipMotion.stop(ship);ship.task.status='blocked';ship.task.failureReason='Invalid saved movement; cargo remains aboard';ship.lifeEventAt=at+30;return;}
        if(!sampled.arrived){ship.lifeEventAt=Math.max(at+1/60,ship.lifeLeg.startedAt+ship.lifeLeg.duration);return;}
      }
      ship.routeIndex++;
      if(ship.routeIndex>=ship.path.length){
        arriveTug(economy,ship);
      }
    }
    syncTask(economy,ship);scheduleTug(economy,ship,at);
  }
  function detail(state,ship){
    if(state.system!==1||window.vexedWarp?.active)return 'distant';
    if(window.nativeShipDetail)return window.nativeShipDetail.isDetailed(state,ship,{category:'tug'})?'detailed':'distant';
    const player=window.vexedSolFlight?.shipPosition(state)||state;
    return Math.hypot(ship.x-player.x,ship.y-player.y)<2400?'detailed':'distant';
  }
  function advance(state,dt) {
    if(window.nativeSimulation.blocked()||!Number.isFinite(dt)||dt<=0)return false;
    const economy=initialize(state),before=economy.lifeClock,now=Math.max(before+dt,window.nativeSimulation.seconds(state));
    economy.lifeClock=now;economy.clock+=now-before;
    let changed=false,production=0;
    // Production debt remains saved and drains over later frames; work per call is bounded.
    while(economy.clock>=30&&production++<64&&(!window.nativeSimulationFrame||window.nativeSimulationFrame.take(state,'solProduction',64))){economy.clock-=30;produce(economy);changed=true;}
    const metrics=economy.lifeMetrics;metrics.detailed=0;metrics.distant=0;metrics.deferred=0;metrics.scheduledEvents=0;metrics.distantUpdates=0;
    for(const ship of economy.freighters){
      if(ship.lifeEventAt==null&&ship.phase!=='disabled')scheduleTug(economy,ship,before);
      const level=detail(state,ship);ship.simulationDetail=level;metrics[level==='detailed'?'detailed':'distant']++;
    }
    if(metrics.detailed&&!window.nativeShipEffects.ready?.(10,'tug'))window.nativeShipEffects.prepare(10,'tug');
    let budget=96;
    // Nine Sol fleet members: choose the next due event globally, independent of visibility.
    while(budget-->0){
      let next=null;
      for(const ship of economy.freighters)if(ship.lifeEventAt!=null&&ship.lifeEventAt<=now+1e-8&&(!next||ship.lifeEventAt<next.lifeEventAt))next=ship;
      if(!next)break;
      if(window.nativeSimulationFrame&&!window.nativeSimulationFrame.take(state,'solEvents',96))break;
      const at=next.lifeEventAt;
      economy.processingAt=at;
      try{tugEvent(economy,next,at);}finally{delete economy.processingAt;}
      metrics.scheduledEvents++;if(next.simulationDetail==='distant')metrics.distantUpdates++;changed=true;
    }
    for(const ship of economy.freighters){
      if(ship.lifeEventAt!=null&&ship.lifeEventAt<=now)metrics.deferred++;
      if(ship.lifeLeg&&(ship.simulationDetail==='detailed'||now-(ship.lifeSampleAt||0)>=1)){
        window.nativeShipMotion.sampleLeg(ship,ship.lifeLeg,Math.min(now,ship.lifeEventAt));ship.lifeSampleAt=now;
        if(ship.simulationDetail==='distant')metrics.distantUpdates++;
      }
      const legProgress=ship.lifeLeg?Math.max(0,Math.min(1,(now-ship.lifeLeg.startedAt)/Math.max(.001,ship.lifeLeg.duration))):0;
      ship.task.phase=ship.phase;ship.task.progress=ship.lifeLeg?(ship.routeIndex+legProgress)/Math.max(1,ship.path.length):ship.progress||0;
    }
    metrics.totalEvents=(metrics.totalEvents||0)+metrics.scheduledEvents;metrics.totalDistantUpdates=(metrics.totalDistantUpdates||0)+metrics.distantUpdates;
    return changed;
  }
  function lifeDescriptors(state){
    const economy=initialize(state),now=window.nativeSimulation?.seconds(state)||economy.lifeClock;
    return economy.freighters.map(ship=>{
      const pose={...ship};if(ship.lifeLeg)window.nativeShipMotion.sampleLeg(pose,ship.lifeLeg,Math.min(now,ship.lifeEventAt));
      const anchor=window.nativeManualFlight?.anchor(1)||{x:0,y:0};
      return {id:ship.identity,category:'tug',entity:ship,name:ship.name,role:ship.role,faction:ship.ownerGovernmentId,system:1,port:ship.port,x:pose.x,y:pose.y,heading:pose.heading,
        galaxy:{x:anchor.x+pose.x,y:anchor.y+pose.y},detail:detail(state,pose),simulationDetail:detail(state,pose),phase:ship.phase,homeBase:ship.homeBase,
        task:ship.task,cargo:ship.tons?{good:ship.good,tons:ship.tons}:null,credits:ship.credits,hull:ship.hull,shields:ship.shields,
        nextActionAt:ship.lifeEventAt,recentEvents:ship.recentEvents,origin:{system:1,port:ship.from},destination:{system:1,port:ship.to},route:ship.path,eta:Math.max(0,(ship.lifeEventAt||now)-now)};
    });
  }
  function price(state,port,good,buy) {
    const available = stock(initialize(state),port,good);
    const multiplier = Math.max(.55,Math.min(2.2,1.55-available/180));
    const amount = Math.round(basePrices[good]*multiplier);
    return buy ? amount : Math.max(1,Math.floor(amount*.82));
  }
  function used(state) {return Object.values(state.solFreightHold||{}).reduce((n,value)=>n+qty(value),0)+(state.localContracts||[]).reduce((n,job)=>n+qty(job.tons),0);}
  function deliveryOffer(state,economy,from,to,good,surplusOnly=false) {
    const capacity=window.VexedMirrorWorld.ships.find(ship=>ship.id===state.shipType)?.cargo||0;
    const committed=(state.localContracts||[]).reduce((total,job)=>total+(Number(job.to)===to&&Number(job.good)===good?qty(job.tons):0),0);
    const demand=Math.max(0,targetStock[to][good]*5-stock(economy,to,good)-committed);
    const available=Math.max(0,availableStock(economy,from,good)-(surplusOnly?targetStock[from][good]:0));
    const maxLoad=Math.max(0,Math.min(available,demand,capacity-used(state)));
    const rate=basePrices[good]*.25+distance(from,to)/400;
    return {demand,available,maxLoad,rate};
  }
  function deliveryLanes(state,economy,from) {
    const regular=lanes.filter(lane=>lane.a===from||lane.b===from).map(lane=>({to:lane.a===from?lane.b:lane.a,good:lane.a===from?lane.forward:lane.back}));
    const established=new Set(regular.map(lane=>lane.to));
    const extra=ports.filter(to=>to!==from&&!established.has(to)).map(to=>{
      let best=null;
      for(let good=0;good<goods.length;good++) {
        const surplus=stock(economy,from,good)-targetStock[from][good];
        const offer=deliveryOffer(state,economy,from,to,good);
        const tons=Math.min(surplus,offer.demand);
        if(tons<10)continue;
        const score=tons*offer.rate;
        if(!best||score>best.score)best={to,good,score};
      }
      return best;
    }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,3).map(({to,good})=>({to,good,surplusOnly:true}));
    return [...regular,...extra];
  }
  function buySell(state,port,good,buy,amount=10) {
    const economy=initialize(state), g=Number(good), n=Number(amount);
    if(!ports.includes(port)||!Number.isInteger(g)||!goods[g]||![10,25,100,500].includes(n)) return {ok:false,error:'Choose a valid Sol cargo lot.'};
    const cost=price(state,port,g,buy)*n;
    const capacity=window.VexedMirrorWorld.ships.find(s=>s.id===state.shipType)?.cargo || 0;
    if(buy) {
      if(availableStock(economy,port,g)<n) return {ok:false,error:'The port does not have that much unreserved cargo.'};
      if(used(state)+n>capacity) return {ok:false,error:'Your cargo hold is full.'};
      if(!state.devMode&&state.latinum<cost) return {ok:false,error:'Not enough latinum.'};
      economy.ports[port][g]-=n;state.solFreightHold[g]=qty(state.solFreightHold[g])+n;
      if(!state.devMode){state.latinum-=cost;economy.flows.externalPlayerReceipts=(economy.flows.externalPlayerReceipts||0)+cost;}
      else economy.flows.devPurchaseSubsidy=(economy.flows.devPurchaseSubsidy||0)+cost;
    } else {
      if(qty(state.solFreightHold[g])<n) return {ok:false,error:'You do not have that much cargo aboard.'};
      const delivered=stock(economy,port,g)+n;
      state.solFreightHold[g]-=n;economy.ports[port][g]=Math.min(9999,delivered);state.latinum+=cost;
      economy.flows.lost[g]+=Math.max(0,delivered-9999);economy.flows.externalPlayerPayments=(economy.flows.externalPlayerPayments||0)+cost;
    }
    return {ok:true,message:`${buy?'Loaded':'Sold'} ${n} t of ${goods[g]} at ${names[port]} for ${cost} latinum.`};
  }
  function contract(state,from,to,amount) {
    const economy=initialize(state),lane=ports.includes(from)&&ports.includes(to)?deliveryLanes(state,economy,from).find(entry=>entry.to===to):null;
    const tons=Number(amount),good=lane?.good;
    if(!lane||!Number.isSafeInteger(tons)||tons<1) return {ok:false,error:'Choose a whole number of tons on a listed freight lane.'};
    if((state.localContracts||[]).length>=2) return {ok:false,error:'Complete one of your two deliveries first.'};
    const offer=deliveryOffer(state,economy,from,to,good,lane.surplusOnly);
    if(tons>offer.available) return {ok:false,error:'This port must produce more cargo before it can load that shipment.'};
    if(tons>offer.demand) return {ok:false,error:`${names[to]} only needs ${offer.demand} t of ${goods[good]} right now.`};
    if(tons>offer.maxLoad) return {ok:false,error:'Not enough space in your cargo hold.'};
    economy.ports[from][good]-=tons;
    const pay=Math.round(tons*offer.rate);
    state.localContracts.push({id:Date.now()+Math.random(),from,to,good,tons,pay});
    return {ok:true,message:`Loaded ${tons} t of ${goods[good]} for ${names[to]}. Payment: ${pay} latinum.`};
  }
  function deliver(state,id) {
    const economy=initialize(state),job=state.localContracts?.find(c=>Number(c.id)===Number(id));
    if(!job) return {ok:false,error:'Shipment unavailable.'};
    if(Number.isInteger(job.good)){const delivered=stock(economy,job.to,job.good)+job.tons;economy.ports[job.to][job.good]=Math.min(9999,delivered);economy.flows.lost[job.good]+=Math.max(0,delivered-9999);}
    state.localContracts=state.localContracts.filter(c=>c!==job);state.latinum+=job.pay;
    economy.flows.externalPlayerPayments=(economy.flows.externalPlayerPayments||0)+job.pay;
    note(economy,`Your Tug delivered ${job.tons} t${goods[job.good]?' of '+goods[job.good]:''} to ${names[job.to]}.`);
    return {ok:true,message:`Delivered ${job.tons} t to ${names[job.to]}. ${job.pay} latinum received.`};
  }
  function select(id){if(targetId!==id)tugSelectedAt=0;targetId=id;return id;}
  function clearTarget(){targetId=null;}
  function target(state){return state?.solEconomy?.freighters.find(ship=>ship.id===targetId&&ship.phase!=='destroyed')||null;}
  function hitTest(state,{ship,cx,cy,zoom,x,y}){
    const economy=initialize(state),dimensions=tugDimensions(zoom);
    const radius=Math.max(14,Math.hypot(dimensions.width,dimensions.height)*zoom*.41);
    return economy.freighters.filter(tug=>tug.phase!=='destroyed')
      .map(tug=>({tug,distance:Math.hypot(x-cx-(tug.x-ship.x)*zoom,y-cy-(tug.y-ship.y)*zoom)}))
      .filter(entry=>entry.distance<=radius).sort((a,b)=>a.distance-b.distance)[0]?.tug||null;
  }
  function fire(state,player,shipHeight,onFinish){
    const tug=target(state);if(!tug)return {ok:false,error:'Click a Tug to target it first.'};
    return window.nativeCombatShots.fire({state,shipHeight,owner:'tug',
      getTarget:()=>window.nativeShipSystems.resolve(state,'tug:'+tug.id),
      dimensions:()=>tugDimensions(),shielded:ship=>ship.shields>0,
      onResolved(result){if(result.target?.id==='tug:'+tug.id&&result.damage?.ok)onFinish?.(tug,result.damage);}});
  }
  function snapshot(state,port) {
    const economy=initialize(state);
    const activity=ship=>{
      if(ship.phase==='destroyed')return ship.rebuild>0?'Replacement under construction at Mars':'Destroyed; awaiting Mars materials';
      if(ship.phase==='disabled')return `Disabled in space; engines offline${ship.tons?` with ${ship.tons} t aboard`:''}`;
      if(ship.phase==='waiting')return `Waiting for orders at ${names[ship.port]}`;
      if(ship.phase==='loading')return `Loading ${ship.handlingTons||0} t of ${goods[ship.good]||'freight'} at ${names[ship.port]}`;
      if(ship.phase==='unloading')return `Unloading ${ship.tons} t at ${names[ship.port]}`;
      if(ship.phase==='turning')return `Turning toward ${names[ship.to]}`;
      return ship.tons?`Delivering ${ship.tons} t of ${goods[ship.good]} to ${names[ship.to]}`:`Flying empty to ${names[ship.to]} for pickup`;
    };
    return {role:roles[port],goods:goods.map((name,id)=>({id,name,stock:stock(economy,port,id),aboard:qty(state.solFreightHold?.[id]),buy:price(state,port,id,true),sell:price(state,port,id,false)})),
      lanes:deliveryLanes(state,economy,port).map(({to,good,surplusOnly})=>({to,good,name:goods[good],...deliveryOffer(state,economy,port,to,good,surplusOnly)})),
      freighters:economy.freighters.map(ship=>({...ship,name:`Tug Class II #${ship.id+1} · ${names[ship.from]} → ${names[ship.to]}`,cargo:goods[ship.good]||'No cargo',activity:activity(ship)})),
      used:used(state),capacity:window.VexedMirrorWorld.ships.find(s=>s.id===state.shipType)?.cargo||0,log:economy.log.slice()};
  }
  function paint(ctx,{state,ship,cx,cy,w,h,zoom=1}) {
    if(!state.solEconomy)return;
    for(const freighter of state.solEconomy.freighters){
      if(freighter.phase==='destroyed')continue;
      const descriptor=window.nativeShipDefinitions.describe(state,freighter,{category:'tug'}),d=descriptor.dimensions;
      const x=cx+descriptor.x-ship.x,y=cy+descriptor.y-ship.y;
      if(x+d.width/2< -20||x-d.width/2>w+20||y+d.height/2< -35||y-d.height/2>h+35)continue;
      window.nativeShipEffects.paintShip(ctx,descriptor,{ship,cx,cy});
      if(targetId===freighter.id)window.nativeAsteroidCombat?.drawTargetFrame(ctx,{
        name:`Tug Class II #${freighter.id+1}`,size:Math.hypot(d.width,d.height)/Math.SQRT2,
        kind:freighter.phase==='disabled'?'DISABLED FREIGHTER':'FREIGHTER',color:'#ffd66e',shield:freighter.shields/Math.max(1,tugStats().shields),
        hull:freighter.hull/Math.max(1,tugStats().hull),selectedAt:tugSelectedAt},x,y,zoom,cx);
    }
  }
  window.nativeSolEconomy={goods,ports,names,roles,lanes,initialize,advance,snapshot,buySell,contract,deliver,paint,select,clearTarget,target,hitTest,fire,hit,visualImpact,lifeDescriptors,detail,dimensions:()=>tugDimensions(1)};
})();
