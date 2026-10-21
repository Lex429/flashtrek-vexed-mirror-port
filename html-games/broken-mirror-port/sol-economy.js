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
  let targetId=null,tugSelectedAt=0;const runtimes=new WeakMap(),deadlines=new WeakMap();
  function pushEvent(heap,item){let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(heap[p].at<item.at||heap[p].at===item.at&&heap[p].order<=item.order)break;heap[i]=heap[p];i=p;}heap[i]=item;}
  function popEvent(heap){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&(heap[c+1].at<heap[c].at||heap[c+1].at===heap[c].at&&heap[c+1].order<heap[c].order))c++;if(heap[c].at>last.at||heap[c].at===last.at&&heap[c].order>=last.order)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;}
  function watchDeadline(rt,ship,order){
    let record=deadlines.get(ship);if(record?.rt===rt)return;
    const value=ship.lifeEventAt;record={rt,value,token:0,order};deadlines.set(ship,record);
    const enqueue=()=>{record.token++;if(Number.isFinite(record.value))pushEvent(rt.heap,{ship,at:record.value,token:record.token,order});else if(ship.phase!=='disabled')rt.unscheduled.add(ship);observeMotion(rt.state,ship);};
    Object.defineProperty(ship,'lifeEventAt',{enumerable:true,configurable:true,get:()=>record.value,set(value){if(value===record.value)return;record.value=value;enqueue();}});enqueue();
  }
  function runtime(state,economy=state.solEconomy){
    const collection=window.nativeShipSystems?.observeCollection?.(economy,'freighters');let rt=runtimes.get(economy);
    if(!rt||rt.ships!==economy.freighters||rt.count!==economy.freighters.length||collection&&rt.revision!==collection.revision){
      rt={state,ships:economy.freighters,count:economy.freighters.length,revision:collection?.revision||0,byId:new Map(),heap:[],unscheduled:new Set(),mobile:new Set(),mobileView:null,detailed:[],detailAt:-Infinity,distantAt:-Infinity};runtimes.set(economy,rt);
      for(let order=0;order<economy.freighters.length;order++){const ship=economy.freighters[order];rt.byId.set(Number(ship.id),ship);watchDeadline(rt,ship,order);observeMotion(state,ship);window.nativeShipRepairs?.observe?.(state,ship,'tug');}
    }
    if(rt.heap.length>Math.max(64,rt.count*4)){rt.heap=[];for(const ship of rt.byId.values()){const record=deadlines.get(ship);if(Number.isFinite(record?.value))pushEvent(rt.heap,{ship,at:record.value,token:record.token,order:record.order});}}
    return rt;
  }
  const tugStats=ship=>ship?window.nativeShipDefinitions.forEntity(null,ship,{category:'tug'}):window.nativeShipDefinitions.get(10);
  const lifeNow=economy=>Number(economy.processingAt??economy.lifeClock)||0;
  function lifeEvent(economy,ship,kind,message){
    ship.recentEvents||=[];ship.recentEvents.unshift({at:lifeNow(economy),kind,message});ship.recentEvents.length=Math.min(16,ship.recentEvents.length);
  }
  function ensureLives(economy,state){
    economy.flows||={produced:goods.map(()=>0),consumed:goods.map(()=>0),lost:goods.map(()=>0)};
    if(!Number.isFinite(economy.lifeClock))economy.lifeClock=window.nativeSimulation?.seconds(state)||0;
    economy.lifeMetrics||={detailed:0,distant:0,distantUpdates:0,scheduledEvents:0,deferred:0};
    const rt=runtime(state,economy);if(rt.initialized)return economy;rt.initialized=true;
    for(const ship of economy.freighters){ship.shipType??=10;ship.equipmentOwner??='tug:'+ship.id;ship.weapons||=[];if(ship.shipEquipment?.version!==2)window.nativeShipEquipment?.ensure(state,ship,[]);}
    for(const ship of economy.freighters)if(ship.lifeVersion!==1){
      Object.assign(ship,{lifeVersion:1,identity:`tug:${ship.id}`,name:`Sol Freight ${String(ship.id+1).padStart(2,'0')}`,role:'freight',homeBase:{system:1,port:ship.port},system:1,credits:0,recentEvents:[]});
      ship.shipType=10;ship.equipmentOwner='tug:'+ship.id+':'+(ship.lifeGeneration||0);ship.cargoOwner=ship.ownerGovernmentId;ship.weapons||=[];
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
      ship.task={id:`tug:${ship.id}:${ship.taskSequence}`,kind:job?'freight':'idle',reason:job?'Deliver available surplus to an unmet Sol port shortage.':'No affordable surplus meets a port shortage.',fromPort:job?.from,toPort:job?.to,good:job?.good,requirements:job?{stock:job.tons,capacity:tugStats().cargo}:null,startedAt:lifeNow(economy),status:'active',completion:'Dock and transfer carried cargo once.',failure:'Ship destroyed or disabled; loaded cargo remains stranded or is lost.'};
    }
    ship.task.phase=ship.phase;ship.task.progress=Number(ship.progress)||0;
    if(['disabled','destroyed'].includes(ship.phase)){ship.task.status='failed';ship.task.failureReason=ship.phase;}
  }
  function disable(economy,ship){
    if(ship.phase==='destroyed'||ship.phase==='disabled'||ship.hull<=0)return;
    ship.repairResumePhase=ship.phase;ship.phase='disabled';window.nativeShipMotion.powerOff(ship);ship.turnTimer=0;
    note(economy,`Tug ${ship.id+1} disabled. Engines and lights offline; cargo stranded in space.`);
    ship.lifeLeg=null;ship.lifeEventAt=null;syncTask(economy,ship);lifeEvent(economy,ship,'disabled','Engines disabled; loaded cargo is stranded aboard, no destination stock awarded.');
  }
  const tugDimensions=()=>window.nativeShipDefinitions.dimensions({shipType:10},'tug');
  const center = id => ({x:coords[id][0]-220,y:coords[id][1]+75});
  const clearance = id => bodySizes[id]/2+105;
  const station=(id,shipId=0)=>window.nativePortDocking.tugPoint(id,shipId);
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
    let busy=0;for(const other of economy.freighters)if(other!==ship&&other.port===port&&(other.phase==='loading'||other.phase==='unloading')&&++busy===3)break;
    const queue=busy*1.1;
    const variation=1.5*(1+Math.sin(economy.clock*.73+ship.id*2.17+port*.91+(unloading?1.4:0)))/2;
    return Math.max(2.5,(unloading?1.25:1.75)+Math.max(0,tons)/handlingRate[port]+queue+variation);
  }
  function inbound(economy,port,good,except) {
    return economy.freighters.reduce((sum,other)=>sum+(other!==except && !['disabled','destroyed'].includes(other.phase) && other.assignment?.to===port && other.assignment.good===good ? qty(other.assignment.tons) : 0),qty(economy.incomingReserved?.[port]?.[good]));
  }
  function inboundCommitments(economy,except){
    const totals=new Map(ports.map(port=>[port,goods.map((_,good)=>qty(economy.incomingReserved?.[port]?.[good]))]));
    // One synchronous selection owns this snapshot. Preserve each destination's
    // original summation order, strict saved IDs and integer quantity rules.
    for(const other of economy.freighters){
      if(other===except||other.phase==='disabled'||other.phase==='destroyed')continue;
      const assignment=other.assignment,row=totals.get(assignment?.to),good=assignment?.good;
      if(row&&Number.isInteger(good)&&good>=0&&good<goods.length)row[good]+=qty(assignment.tons);
    }
    return totals;
  }
  function candidate(economy,from,to,good,ship,commitments) {
    const surplus=availableStock(economy,from,good)-targetStock[from][good];
    const shortage=targetStock[to][good]-stock(economy,to,good)-commitments.get(to)[good];
    const tons=Math.floor(Math.min(Math.max(0,tugStats().cargo-qty(ship.repairDeuranium)),surplus,shortage));
    if(from===to||tons<10)return null;
    const urgency=Math.min(2,shortage/Math.max(20,targetStock[to][good]));
    const score=tons*(1+urgency)*Math.sqrt(basePrices[good]/24)/(1+distance(from,to)/16000);
    return {from,to,good,tons,score};
  }
  function bestJob(economy,ship,localOnly,commitments) {
    let best=null;
    for(const from of localOnly?[ship.port]:ports)for(const to of ports)for(let good=0;good<goods.length;good++) {
      const job=candidate(economy,from,to,good,ship,commitments);
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
    const tons=Math.floor(Math.min(job.tons,available,needed,Math.max(0,tugStats().cargo-qty(ship.repairDeuranium))));
    if(tons<10){dispatch(economy,ship);return;}
    ship.handlingTons=tons;ship.phase='loading';ship.dwell=handlingTime(economy,ship.port,tons,ship);ship.progress=0;
  }
  function dispatch(economy,ship) {
    ship.assignment=null;ship.good=null;ship.tons=0;
    const commitments=inboundCommitments(economy,ship),job=bestJob(economy,ship,true,commitments)||bestJob(economy,ship,false,commitments);
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
    delete ship.shipEquipment;delete ship.weaponLoadout;delete ship.repairBay;delete ship.repairResumePhase;ship.repairDeuranium=0;
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
    impact||={};const economy=initialize(state),ship=runtime(state,economy).byId.get(Number(id));
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
    const ship=find(state,id);
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
    delete ship.trafficControl;
    delete ship.lifeSkipPending;
    if(ship.phase==='disabled'){ship.lifeEventAt=null;return;}
    if(ship.phase==='travel'){
      let skipped=0,goal=ship.path[ship.routeIndex];
      while(goal&&Number.isFinite(goal.x)&&Number.isFinite(goal.y)&&Math.hypot(goal.x-ship.x,goal.y-ship.y)<=window.nativeShipMotion.arrivalEpsilon&&skipped++<64){
        ship.x=goal.x;ship.y=goal.y;window.nativeShipMotion.stop(ship);ship.routeIndex++;goal=ship.path[ship.routeIndex];
      }
      if(skipped>64){ship.lifeSkipPending=true;ship.lifeEventAt=at+1/60;return;}
      if(!goal){arriveTug(economy,ship);scheduleTug(economy,ship,at);return;}
      ship.lifeLeg=window.nativeShipMotion.planLeg(ship,goal,window.nativeShipDefinitions.forEntity(null,ship,{category:'tug'}).movement||window.nativeShipMotion.profiles.manual(tugStats()),at);
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
    const rt=runtime(state,economy);
    for(const ship of rt.unscheduled){rt.unscheduled.delete(ship);if(ship.lifeEventAt==null&&ship.phase!=='disabled'&&rt.byId.get(Number(ship.id))===ship)scheduleTug(economy,ship,before);}
    if(now-rt.detailAt>=.2-1e-8){rt.detailAt=now;for(const ship of rt.detailed)ship.simulationDetail='distant';rt.detailed=[];
      if(state.system===1){const player=window.vexedSolFlight?.shipPosition(state)||state,radius=window.nativeShipDetail?.radius(state)||6500;
        const local=window.nativeShipSystems?.query?window.nativeShipSystems.query(state,{minX:player.x-radius,minY:player.y-radius,maxX:player.x+radius,maxY:player.y+radius,categories:['tug']}).bystanders.map(target=>target.entity):economy.freighters;
        for(const ship of local)if(detail(state,ship)==='detailed'){ship.simulationDetail='detailed';rt.detailed.push(ship);}
      }
    }
    metrics.detailed=rt.detailed.length;metrics.distant=economy.freighters.length-metrics.detailed;
    let budget=96;
    // The same saved deadlines now use a heap, including larger company fleets.
    while(budget-->0){
      let due=rt.heap[0];if(!due||due.at>now+1e-8)break;
      const tracked=deadlines.get(due.ship);if(tracked?.rt!==rt||tracked.token!==due.token||rt.byId.get(Number(due.ship.id))!==due.ship){popEvent(rt.heap);continue;}
      if(window.nativeSimulationFrame&&!window.nativeSimulationFrame.take(state,'solEvents',96))break;
      popEvent(rt.heap);const next=due.ship,at=due.at;
      economy.processingAt=at;
      try{tugEvent(economy,next,at);}finally{delete economy.processingAt;}
      window.nativeShipSystems?.refreshShip?.(state,next,'tug',1);
      metrics.scheduledEvents++;if(next.simulationDetail==='distant')metrics.distantUpdates++;changed=true;
    }
    const distant=now-rt.distantAt>=1-1e-8;if(distant)rt.distantAt=now;
    for(const ship of distant?rt.mobile:rt.detailed){
      if(ship.lifeLeg&&(ship.simulationDetail==='detailed'||distant)){
        const before={x:ship.x,y:ship.y,heading:ship.heading,system:1,shipType:ship.shipType,speed:ship.speed,vx:ship.vx,vy:ship.vy};
        window.nativeShipMotion.sampleLeg(ship,ship.lifeLeg,Math.min(now,ship.lifeEventAt));ship.lifeSampleAt=now;
        const systems=window.nativeShipSystems;if(systems?.sampledShip)systems.sampledShip(state,ship,'tug',1,before);else systems?.refreshShip?.(state,ship,'tug',1);
        if(ship.simulationDetail==='distant')metrics.distantUpdates++;
      }
      const legProgress=ship.lifeLeg?Math.max(0,Math.min(1,(now-ship.lifeLeg.startedAt)/Math.max(.001,ship.lifeLeg.duration))):0;
      ship.task.phase=ship.phase;ship.task.progress=ship.lifeLeg?(ship.routeIndex+legProgress)/Math.max(1,ship.path.length):ship.progress||0;
    }
    if(rt.heap[0]?.at<=now)metrics.deferred=new Set(rt.heap.filter(due=>due.at<=now&&deadlines.get(due.ship)?.token===due.token).map(due=>due.ship)).size;
    metrics.totalEvents=(metrics.totalEvents||0)+metrics.scheduledEvents;metrics.totalDistantUpdates=(metrics.totalDistantUpdates||0)+metrics.distantUpdates;
    return changed;
  }
  function lifeDescriptors(state){
    const economy=initialize(state),now=window.nativeSimulation?.seconds(state)||economy.lifeClock;
    return economy.freighters.map(ship=>lifeDescriptor(state,ship,now));
  }
  function lifeDescriptor(state,ship,now=window.nativeSimulation.seconds(state)){
      const pose={...ship};if(ship.lifeLeg)window.nativeShipMotion.sampleLeg(pose,ship.lifeLeg,Math.min(now,ship.lifeEventAt));
      const legProgress=ship.lifeLeg?Math.max(0,Math.min(1,(now-ship.lifeLeg.startedAt)/Math.max(.001,ship.lifeLeg.duration))):0,
        task=ship.task?{...ship.task,phase:ship.phase,progress:ship.lifeLeg?(ship.routeIndex+legProgress)/Math.max(1,ship.path.length):ship.progress||0}:null;
      const anchor=window.nativeManualFlight?.anchor(1)||{x:0,y:0};
      return {id:ship.identity,category:'tug',entity:ship,name:ship.name,role:ship.role,faction:ship.ownerGovernmentId,system:1,port:ship.port,x:pose.x,y:pose.y,heading:pose.heading,
        galaxy:{x:anchor.x+pose.x,y:anchor.y+pose.y},detail:detail(state,pose),simulationDetail:detail(state,pose),phase:ship.phase,homeBase:ship.homeBase,
        task,cargo:ship.tons?{good:ship.good,tons:ship.tons}:null,credits:ship.credits,hull:ship.hull,shields:ship.shields,
        nextActionAt:ship.lifeEventAt,recentEvents:ship.recentEvents,origin:{system:1,port:ship.from},destination:{system:1,port:ship.to},route:ship.path,eta:Math.max(0,(ship.lifeEventAt||now)-now)};
    }
  // Integrate the same stock curve one ton at a time. A sale traverses the
  // reverse marginal prices with the spread, so batching cannot create profit.
  function quote(state,port,good,buy,amount=1) {
    const g=Number(good),n=Number(amount);
    if(!ports.includes(port)||!Number.isInteger(g)||!goods[g]||!Number.isSafeInteger(n)||n<1||n>9999)return {ok:false,error:'Choose a valid Sol cargo lot.'};
    const economy=initialize(state),initial=stock(economy,port,g);let total=0;
    for(let i=0;i<n;i++){
      const marginalStock=buy?initial-i-1:initial+i;
      const unit=Math.round(basePrices[g]*Math.max(.55,Math.min(2.2,1.55-marginalStock/180)));
      total+=buy?unit:Math.max(1,Math.floor(unit*.82));
    }
    return {ok:true,total,tons:n,stock:initial};
  }
  function price(state,port,good,buy){return quote(state,port,good,buy).total;}
  function used(state) {if(window.nativeShipEquipment)return window.nativeShipEquipment.cargoUsed(state);return Object.values(state.solFreightHold||{}).reduce((n,value)=>n+qty(value),0)+(state.localContracts||[]).reduce((n,job)=>n+qty(job.tons),0);}
  function deliveryOffer(state,economy,from,to,good,surplusOnly=false) {
    const capacity=window.nativeShipDefinitions.forEntity(state).cargo||0;
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
  function buySell(state,port,good,buy,amount=10,expectedTotal) {
    const economy=initialize(state),g=Number(good),n=Number(amount);
    if(![10,25,100,500].includes(n))return {ok:false,error:'Choose a valid Sol cargo lot.'};
    const quoted=quote(state,port,g,buy,n);if(!quoted.ok)return quoted;
    if(expectedTotal!==undefined&&quoted.total!==expectedTotal)return {ok:false,error:'The market changed. Review the updated quote.'};
    const market=window.nativeNpcLives.market(state,1,port),capacity=window.nativeShipDefinitions.forEntity(state).cargo||0;
    const result=window.nativeNpcLives.exchange(state,market,state,{good:g,tons:n,payment:quoted.total,buy,player:true,free:!!state.devMode&&buy,capacity:Math.max(0,capacity-used(state))});
    if(!result.ok)return result;
    return {ok:true,total:quoted.total,message:`${buy?'Loaded':'Sold'} ${n} t of ${goods[g]} at ${names[port]} for ${state.devMode&&buy?0:quoted.total} latinum.`};
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
  function find(state,id){if(id==null)return null;const economy=initialize(state);return runtime(state,economy).byId.get(Number(id))||null;}
  function target(state){const ship=state?.solEconomy&&find(state,targetId);return ship?.phase!=='destroyed'?ship:null;}
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
      used:used(state),capacity:window.nativeShipDefinitions.forEntity(state).cargo||0,log:economy.log.slice()};
  }
  function paint(ctx,{state,ship,cx,cy,w,h,zoom=1}) {
    if(!state.solEconomy)return;
    const visible=window.nativeShipSystems.query(state,{minX:ship.x-cx/zoom-64,minY:ship.y-cy/zoom-64,maxX:ship.x+(w-cx)/zoom+64,maxY:ship.y+(h-cy)/zoom+64,categories:['tug']}).bystanders;
    for(const target of visible){const freighter=target.entity;
      if(freighter.phase==='destroyed')continue;
      const dimensions=window.nativeShipDefinitions.dimensions(freighter,'tug');
      const descriptor=window.nativeSimulationFrame?.renderPose?.(state,target)||target,d=descriptor.dimensions;
      if(window.nativeEffectVisibility?.ship&&!window.nativeEffectVisibility.ship(descriptor,{ship,cx,cy,w,h,zoom,dimensions},64))continue;
      const x=cx+(descriptor.x-ship.x)*zoom,y=cy+(descriptor.y-ship.y)*zoom;
      window.nativeShipEffects.paintShip(ctx,descriptor,{ship,cx,cy,w,h,zoom});
      if(targetId===freighter.id){window.nativeShipSpriteCache?.flush?.(ctx);window.nativeAsteroidCombat?.drawTargetFrame(ctx,{
        name:`Tug Class II #${freighter.id+1}`,size:Math.hypot(d.width,d.height)/Math.SQRT2,
        kind:freighter.phase==='disabled'?'DISABLED FREIGHTER':'FREIGHTER',color:'#ffd66e',shield:freighter.shields/Math.max(1,tugStats(freighter).shields),
        hull:freighter.hull/Math.max(1,tugStats(freighter).hull),selectedAt:tugSelectedAt},x,y,zoom,cx);}
    }
  }
  function reroute(state,ship,leg){
    if(!ship.lifeLeg||ship.phase!=='travel'||leg.valid===false)return false;
    ship.lifeLeg=leg;ship.lifeEventAt=leg.startedAt+leg.duration;return true;
  }
  function resumeAfterRepair(state,ship){
    if(ship.hull<=0||ship.phase==='destroyed')return false;
    const economy=initialize(state),previous=ship.repairResumePhase;delete ship.repairResumePhase;
    if(['loading','unloading','waiting'].includes(previous)){ship.phase=previous;ship.dwell=Math.max(.01,ship.dwell||0);}
    else if(ports.includes(ship.to)){ship.path=route({x:ship.x,y:ship.y},station(ship.to,ship.id));ship.routeIndex=0;ship.phase='travel';}
    else{ship.phase='waiting';ship.dwell=.01;}
    syncTask(economy,ship);scheduleTug(economy,ship,window.nativeSimulation.seconds(state));return true;
  }
  function consumeMaterials(state,port,materials){
    const economy=initialize(state);
    const totals=new Map();
    for(const [good,amount] of materials){if(!Number.isInteger(good)||!goods[good]||!(amount>0)||!Number.isFinite(amount))return {ok:false,error:'Invalid construction material.'};totals.set(good,(totals.get(good)||0)+amount);}
    if(!ports.includes(port)||[...totals].some(([good,amount])=>availableStock(economy,port,good)<amount))return {ok:false,error:'Required construction material is unavailable or reserved for another contract.'};
    for(const [good,amount] of totals){economy.ports[port][good]-=amount;economy.flows.consumed[good]+=amount;}
    return {ok:true};
  }
  function invalidateMembership(state){const rt=state.solEconomy&&runtimes.get(state.solEconomy);if(rt)rt.revision=-1;}
  function observeMotion(state,ship){const rt=state.solEconomy&&runtimes.get(state.solEconomy);if(!rt)return;const moving=ship.hull>0&&ship.phase!=='destroyed'&&!!(ship.lifeLeg||ship.motionKick||ship.motionSpin||ship.speed>0);if(rt.mobile.has(ship)!==moving){if(moving)rt.mobile.add(ship);else rt.mobile.delete(ship);rt.mobileView=null;}}
  window.nativeSolEconomy={goods,ports,names,roles,lanes,initialize,advance,snapshot,quote,buySell,contract,deliver,paint,select,clearTarget,target,hitTest,fire,hit,visualImpact,lifeDescriptors,detail,dimensions:()=>tugDimensions(1),reroute,resumeAfterRepair,consumeMaterials,find,invalidateMembership,
    members:(state,system=1)=>system===1?initialize(state).freighters:[],revision:state=>runtime(state,initialize(state)).revision,inspect:(state,id)=>{const ship=find(state,id);return ship?lifeDescriptor(state,ship):null;},observeMotion,mobile:state=>{const rt=runtime(state,initialize(state));return rt.mobileView||=Object.freeze(Array.from(rt.mobile));}};
})();
