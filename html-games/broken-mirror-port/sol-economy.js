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
  const tugAssets=[],wrecks=[],tugStageDebris=[];
  const buildMaterials=[[1,15],[2,12],[3,6],[7,5],[8,2]];
  const solGovernmentId=Number(world.systems.find(system=>system.id===1)?.governmentId)||1;
  const shots=[],hullBursts=[];
  let tugPending,destruction,stageTemplates=null,targetId=null,tugSelectedAt=0,tugRenderDimensions=null;
  const tugStats=()=>window.VexedMirrorWorld.ships.find(ship=>ship.id===10);
  const damageStage=ship=>ship.hull/Math.max(1,tugStats().hull)<=.25?3:ship.hull/tugStats().hull<.5?2:ship.hull/tugStats().hull<.75?1:0;
  function disable(economy,ship){
    if(ship.phase==='destroyed'||ship.phase==='disabled'||ship.hull<=0||ship.hull>tugStats().hull*.25)return;
    ship.phase='disabled';ship.speed=0;ship.turnTimer=0;
    note(economy,`Tug ${ship.id+1} disabled. Engines and lights offline; cargo stranded in space.`);
  }
  function tugDimensions(zoom){
    const base=window.vexedFlightAssets.flightDimensions(window.vexedFlightAssets.size(10),zoom);
    return {width:base.height*(tugAssets[0]?.width||164)/(tugAssets[0]?.height||512),height:base.height};
  }
  function tugWorldPoint(tug,local) {
    const angle=tug.heading+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    return {x:tug.x+local.x*c-local.y*s,y:tug.y+local.x*s+local.y*c};
  }
  function tugContactPoint(tug,from,shielded=tug.shields>0) {
    const dimensions=tugRenderDimensions||tugDimensions(1);
    return window.nativeCombatShots.contact(tug,from,dimensions,shielded);
  }
  function tugLayout(ship) {
    const dimensions=tugRenderDimensions||tugDimensions(1);
    return {x:ship.x,y:ship.y,w:dimensions.width,h:dimensions.height};
  }
  function ensureTugArt() {
    if(!tugAssets[0] && !tugPending && window.vexedFlightAssets) {
      const profile=window.starterShips.get(10);
      tugPending=Promise.all([0,1,2,3].map(stage=>new Promise((resolve,reject)=>{
        const image=new Image();
        image.onload=()=>image.decode().then(()=>resolve(image),reject);
        image.onerror=()=>reject(Error('Regular Tug Class II artwork unavailable'));
        image.src=`../flashtrek-broken-mirror/showcase-assets/ship-10-${stage}.png`;
      }))).then(images=>{
          images.forEach((image,stage)=>{
            const aligned=profile.align(image,stage);
            const art=stage===3?profile.effects.unlitFrame(aligned):aligned;
            tugAssets[stage]={art,width:art.width,height:art.height};
          });
          const frames=tugAssets.map(asset=>asset.art);
          stageTemplates=window.showcaseStageFragments.prepare(frames,profile.breakAnchors);
          destruction=window.createShipDestruction();
          destruction.prepare(frames,profile.destruction);
        }).catch(error=>console.warn('Tug damage art unavailable',error)).finally(()=>{tugPending=null;});
    }
  }
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
  const distance = (a,b) => Math.hypot(coords[a][0]-coords[b][0],coords[a][1]-coords[b][1]);
  function handlingTime(economy,port,tons,ship,unloading=false) {
    const busy=economy.freighters.filter(other=>other!==ship&&other.port===port&&['loading','unloading'].includes(other.phase)).length;
    const queue=Math.min(3,busy)*1.1;
    const variation=1.5*(1+Math.sin(economy.clock*.73+ship.id*2.17+port*.91+(unloading?1.4:0)))/2;
    return Math.max(2.5,(unloading?1.25:1.75)+Math.max(0,tons)/handlingRate[port]+queue+variation);
  }
  function inbound(economy,port,good,except) {
    return economy.freighters.reduce((sum,other)=>sum+(other!==except && other.assignment?.to===port && other.assignment.good===good ? qty(other.assignment.tons) : 0),0);
  }
  function candidate(economy,from,to,good,ship) {
    const surplus=stock(economy,from,good)-targetStock[from][good];
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
  }
  function beginLoading(economy,ship) {
    const job=ship.assignment;
    if(!job||job.from!==ship.port){dispatch(economy,ship);return;}
    const available=stock(economy,job.from,job.good)-targetStock[job.from][job.good];
    const needed=targetStock[job.to][job.good]-stock(economy,job.to,job.good)-inbound(economy,job.to,job.good,ship);
    const tons=Math.floor(Math.min(job.tons,available,needed));
    if(tons<10){dispatch(economy,ship);return;}
    ship.handlingTons=tons;ship.phase='loading';ship.dwell=handlingTime(economy,ship.port,tons,ship);ship.progress=0;
  }
  function dispatch(economy,ship) {
    ship.assignment=null;ship.good=null;ship.tons=0;
    const job=bestJob(economy,ship,true)||bestJob(economy,ship);
    if(!job) {ship.phase='waiting';ship.dwell=5;ship.from=ship.port;ship.to=ship.port;return;}
    ship.assignment={from:job.from,to:job.to,good:job.good,tons:job.tons};ship.good=job.good;
    if(job.from===ship.port) {
      ship.from=ship.port;ship.to=job.to;beginLoading(economy,ship);
    } else setCourse(ship,job.from);
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
      return economy;
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
    return state.solEconomy;
  }
  function note(economy,message) {economy.log.unshift(message);economy.log.length=Math.min(economy.log.length,12);}
  function beginRebuild(economy,ship){
    if(ship.phase!=='destroyed'||ship.rebuild>0||buildMaterials.some(([good,amount])=>stock(economy,5,good)<amount))return false;
    for(const [good,amount] of buildMaterials)economy.ports[5][good]-=amount;
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
  }
  function destroy(economy,ship,stage){
    const lost=ship.tons,good=ship.good;
    hullBursts.length=0;
    wrecks.push({x:ship.x,y:ship.y,angle:ship.heading+Math.PI/2,stage,time:0,debris:[],particles:[],prepared:false});
    if(wrecks.length>12)wrecks.shift();
    Object.assign(ship,{hull:0,shields:0,shieldFlash:null,phase:'destroyed',rebuild:0,speed:0,tons:0,good:null,
      handlingTons:0,assignment:null,path:[]});
    if(targetId===ship.id)targetId=null;
    note(economy,`Tug ${ship.id+1} destroyed${lost?`; ${lost} t of ${goods[good]} lost in space`:''}.`);
    beginRebuild(economy,ship);
  }
  function hit(state,id,damage,impact=null){
    const economy=initialize(state),ship=economy.freighters.find(entry=>entry.id===id);
    if(!ship||ship.phase==='destroyed')return {ok:false,error:'Target already destroyed.'};
    const amount=Math.max(0,Number(damage)||0),absorbed=Math.min(ship.shields,amount);
    const stage=damageStage(ship);
    const contact=impact?.contact||tugContactPoint(ship,impact?.from||{x:ship.x,y:ship.y-100},ship.shields>0);
    ship.shields=Math.max(0,ship.shields-absorbed);
    ship.hull=Math.max(0,ship.hull-(amount-absorbed));
    if(absorbed>0){
      ship.shieldFlash={born:performance.now(),color:'#50d5ff',
        x:contact.local.x,y:contact.local.y,
        dx:contact.dx,dy:contact.dy,kind:impact?.kind||'beam',
        energy:1+Math.min(.55,absorbed/Math.max(1,absorbed+ship.shields)*.7),
        charge:ship.shields/Math.max(1,tugStats().shields)};
    }
    if(amount>absorbed){
      const hullContact=absorbed>0?tugContactPoint(ship,impact?.from||{x:ship.x,y:ship.y-100},false):contact;
      window.showcaseHullBurst.burst(hullBursts,hullContact.world,performance.now(),.91976,1);
      const nextStage=damageStage(ship);
      if(ship.hull>0&&nextStage>stage&&stageTemplates){
        const layout=tugLayout(ship),time=performance.now();
        window.showcaseStageFragments.emit({debris:tugStageDebris,fragments:stageTemplates,before:stage,after:nextStage,
          layout,world:piece=>tugWorldPoint(ship,{x:piece.x*layout.w,y:piece.y*layout.h}),
          angle:ship.heading+Math.PI/2,time,zoom:1,
          burst:(point,strength,sparksOnly)=>window.showcaseHullBurst.burst(hullBursts,point,time,.91976,1,strength,sparksOnly)});
      }
    }
    const reputation=ship.hull<=0?window.nativeFactionStanding.shipDestroyed(state,Number(ship.ownerGovernmentId)||solGovernmentId):null;
    if(reputation)destroy(economy,ship,stage);
    else disable(economy,ship);
    return {ok:true,destroyed:ship.phase==='destroyed',shields:ship.shields,hull:ship.hull,reputation};
  }
  function produce(economy) {
    const p=economy.ports;
    const make=(port,output,amount,inputs=[])=>{
      if(inputs.some(([good,needed])=>stock(economy,port,good)<needed))return;
      for(const [good,needed] of inputs)p[port][good]-=needed;
      p[port][output]=Math.min(9999,stock(economy,port,output)+amount);
    };
    make(1,0,16);make(1,7,5);make(2,4,12);make(3,5,12);
    make(3,6,4,[[5,2]]);make(4,1,8,[[0,10]]);make(4,2,5,[[1,6]]);
    make(5,8,3,[[1,4],[2,3],[3,1],[7,1]]);
    make(7,3,6,[[2,4]]);make(8,4,9);make(9,4,10);
    make(10,3,3,[[2,2]]);
    for(const port of ports)for(const good of [4,5,6])if(port!==3&&port!==2&&port!==8&&port!==9)p[port][good]=Math.max(0,p[port][good]-1);
  }
  function load(economy,ship) {
    const job=ship.assignment;
    if(!job||job.from!==ship.port){dispatch(economy,ship);return;}
    const available=stock(economy,job.from,job.good)-targetStock[job.from][job.good];
    const needed=targetStock[job.to][job.good]-stock(economy,job.to,job.good)-inbound(economy,job.to,job.good,ship);
    const tons=Math.floor(Math.min(job.tons,ship.handlingTons||job.tons,available,needed));
    if(tons<10){dispatch(economy,ship);return;}
    economy.ports[job.from][job.good]-=tons;
    ship.tons=tons;job.tons=tons;ship.good=job.good;
    note(economy,`${names[job.from]} loaded ${tons} t of ${goods[job.good]} aboard Tug ${ship.id+1} for ${names[job.to]}.`);
    setCourse(ship,job.to);
  }
  function steer(ship,dt) {
    const points=ship.path,goal=points[Math.min(ship.routeIndex,points.length-1)];
    if(!goal)return true;
    const dx=goal.x-ship.x,dy=goal.y-ship.y,distanceToGoal=Math.hypot(dx,dy),final=ship.routeIndex===points.length-1;
    const wanted=Math.atan2(dy,dx),turn=Math.atan2(Math.sin(wanted-ship.heading),Math.cos(wanted-ship.heading));
    ship.heading+=Math.max(-1.35*dt,Math.min(1.35*dt,turn));
    const turnFactor=Math.max(.26,1-Math.abs(turn)/Math.PI);
    const targetSpeed=final?Math.min(135*turnFactor,Math.sqrt(2*45*Math.max(0,distanceToGoal-4))):135*turnFactor;
    ship.speed+=Math.max(-45*dt,Math.min(38*dt,targetSpeed-ship.speed));
    const step=Math.min(distanceToGoal,ship.speed*dt);
    ship.x+=Math.cos(ship.heading)*step;ship.y+=Math.sin(ship.heading)*step;
    if(!final&&distanceToGoal<Math.max(12,ship.speed*dt+4))ship.routeIndex++;
    const start=ship.pathStart||{x:ship.x,y:ship.y};
    const total=points.reduce((sum,p,i)=>sum+Math.hypot(p.x-(i?points[i-1].x:start.x),p.y-(i?points[i-1].y:start.y)),0);
    let remaining=Math.hypot(goal.x-ship.x,goal.y-ship.y);
    for(let i=ship.routeIndex+1;i<points.length;i++)remaining+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
    ship.progress=Math.max(0,Math.min(1,1-remaining/Math.max(1,total)));
    return final&&distanceToGoal<7&&ship.speed<24;
  }
  function advance(state,dt) {
    const economy=initialize(state);
    if(!Number.isFinite(dt)||dt<=0)return false;
    const elapsed=Math.min(dt,1);
    economy.clock+=elapsed;
    let changed=false;
    while(economy.clock>=30){economy.clock-=30;produce(economy);changed=true;}
    for(const ship of economy.freighters) {
      if(ship.phase==='destroyed') {
        if(ship.rebuild>0){ship.rebuild=Math.max(0,ship.rebuild-elapsed);if(ship.rebuild===0){finishRebuild(economy,ship);changed=true;}}
        else if(beginRebuild(economy,ship))changed=true;
      } else if(ship.phase==='disabled') {
        ship.speed=0;
      } else if(ship.phase==='waiting') {
        ship.dwell-=elapsed;
        if(ship.dwell<=1e-6){dispatch(economy,ship);changed=true;}
      } else if(ship.phase==='loading') {
        ship.dwell-=elapsed;
        if(ship.dwell<=1e-6){load(economy,ship);changed=true;}
      } else if(ship.phase==='unloading') {
        ship.dwell-=elapsed;
        if(ship.dwell<=1e-6) {
          if(ship.tons){economy.ports[ship.port][ship.good]=Math.min(9999,stock(economy,ship.port,ship.good)+ship.tons);note(economy,`${names[ship.port]} received ${ship.tons} t of ${goods[ship.good]} from Tug ${ship.id+1}.`);}
          ship.lastDestination={to:ship.port,good:ship.good};ship.tons=0;dispatch(economy,ship);changed=true;
        }
      } else if(ship.phase==='turning') {
        const goal=ship.path[0],wanted=Math.atan2(goal.y-ship.y,goal.x-ship.x);
        const turn=Math.atan2(Math.sin(wanted-ship.heading),Math.cos(wanted-ship.heading));
        ship.heading+=Math.max(-.45*elapsed,Math.min(.45*elapsed,turn));
        ship.turnTimer=Math.max(0,ship.turnTimer-elapsed);
        if(ship.turnTimer<=1e-6&&Math.abs(turn)<.08){ship.phase='travel';changed=true;}
      } else if(ship.phase==='travel'&&steer(ship,Math.min(elapsed,.05))) {
        ship.port=ship.to;ship.speed=0;ship.progress=1;
        if(ship.tons){ship.phase='unloading';ship.handlingTons=ship.tons;ship.dwell=handlingTime(economy,ship.port,ship.tons,ship,true);}
        else {ship.from=ship.port;ship.to=ship.assignment?.to||ship.port;beginLoading(economy,ship);}
        changed=true;
      }
    }
    const now=performance.now();
    for(const piece of tugStageDebris)if(now>=piece.born)window.showcaseStageFragments.update(piece,elapsed);
    for(let i=tugStageDebris.length-1;i>=0;i--)if(now-tugStageDebris[i].born>tugStageDebris[i].ttl)tugStageDebris.splice(i,1);
    for(const wreck of wrecks){
      wreck.time+=elapsed*1000;
      for(const piece of wreck.debris){piece.x+=piece.vx*elapsed;piece.y+=piece.vy*elapsed;piece.angle+=piece.spin*elapsed;}
      for(const particle of wreck.particles){particle.x+=(particle.vx||0)*elapsed;particle.y+=(particle.vy||0)*elapsed;}
      destruction?.updateTrails(wreck);
      wreck.debris=wreck.debris.filter(piece=>wreck.time-piece.born<piece.ttl);
      wreck.particles=wreck.particles.filter(particle=>wreck.time-particle.born<particle.ttl);
    }
    for(let i=wrecks.length-1;i>=0;i--)if(wrecks[i].time>17000)wrecks.splice(i,1);
    for(const particle of hullBursts)if(now>=particle.born)window.showcaseHullBurst.update(particle,elapsed);
    for(let i=hullBursts.length-1;i>=0;i--)if(now-hullBursts[i].born>hullBursts[i].ttl)hullBursts.splice(i,1);
    return changed;
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
    const available=Math.max(0,stock(economy,from,good)-(surplusOnly?targetStock[from][good]:0));
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
      if(stock(economy,port,g)<n) return {ok:false,error:'The port does not have that much cargo.'};
      if(used(state)+n>capacity) return {ok:false,error:'Your cargo hold is full.'};
      if(!state.devMode&&state.latinum<cost) return {ok:false,error:'Not enough latinum.'};
      economy.ports[port][g]-=n;state.solFreightHold[g]=qty(state.solFreightHold[g])+n;
      if(!state.devMode) state.latinum-=cost;
    } else {
      if(qty(state.solFreightHold[g])<n) return {ok:false,error:'You do not have that much cargo aboard.'};
      state.solFreightHold[g]-=n;economy.ports[port][g]=Math.min(9999,stock(economy,port,g)+n);state.latinum+=cost;
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
    if(Number.isInteger(job.good)) economy.ports[job.to][job.good]=Math.min(9999,stock(economy,job.to,job.good)+job.tons);
    state.localContracts=state.localContracts.filter(c=>c!==job);state.latinum+=job.pay;
    note(economy,`Your Tug delivered ${job.tons} t${goods[job.good]?' of '+goods[job.good]:''} to ${names[job.to]}.`);
    return {ok:true,message:`Delivered ${job.tons} t to ${names[job.to]}. ${job.pay} latinum received.`};
  }
  function select(id){if(targetId!==id)tugSelectedAt=performance.now();targetId=id;return id;}
  function clearTarget(){targetId=null;shots.length=0;hullBursts.length=0;tugStageDebris.length=0;wrecks.length=0;}
  function target(state){return state?.solEconomy?.freighters.find(ship=>ship.id===targetId&&ship.phase!=='destroyed')||null;}
  function hitTest(state,{ship,cx,cy,zoom,x,y}){
    const economy=initialize(state),dimensions=tugDimensions(zoom);
    const radius=Math.max(14,Math.hypot(dimensions.width,dimensions.height)*zoom*.41);
    return economy.freighters.filter(tug=>tug.phase!=='destroyed')
      .map(tug=>({tug,distance:Math.hypot(x-cx-(tug.x-ship.x)*zoom,y-cy-(tug.y-ship.y)*zoom)}))
      .filter(entry=>entry.distance<=radius).sort((a,b)=>a.distance-b.distance)[0]?.tug||null;
  }
  function fire(state,player,shipHeight,onFinish){
    const tug=target(state);
    if(!tug)return {ok:false,error:'Click a Tug to target it first.'};
    if(Math.hypot(tug.x-player.x,tug.y-player.y)>650)return {ok:false,error:'Tug is out of weapon range. Fly closer.'};
    const now=performance.now(),armed=window.nativeCombatShots.arm(state,now);
    if(!armed.ok)return armed;
    const {weapon,kind,style}=armed;
    const shot=window.nativeCombatShots.create({state,ship:player,shipHeight,target:tug,kind,style,now});
    shot.targetPoint=from=>window.nativeCombatShots.worldPoint(tug,shot.lockedImpactLocal||tugContactPoint(tug,from,tug.shields>0).local);
    shots.push(shot);
    setTimeout(()=>{
      const from=window.nativeCombatShots.source(shot,state,window.vexedSolFlight.shipPosition(state));
      const contact=tugContactPoint(tug,from,tug.shields>0);
      shot.lockedImpactLocal=contact.local;
      const result=hit(state,tug.id,weapon.damage,{from,kind:shot.kind,contact});
      if(result.ok)onFinish?.(tug,result);
    },window.nativeCombatShots.hitDelay(shot));
    return {ok:true,weapon:weapon.name};
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
  function paintEffects(ctx,{state,ship,cx,cy,zoom}){
    const now=performance.now();
    for(let i=shots.length-1;i>=0;i--){
      const shot=shots[i],age=now-shot.born;if(age>shot.duration){shots.splice(i,1);continue;}
      window.nativeCombatShots.paint(ctx,shot,{state,ship,cx,cy,zoom,now});
    }
    ctx.save();ctx.translate(cx-ship.x,cy-ship.y);
    for(const piece of tugStageDebris)window.showcaseStageFragments.draw(ctx,piece,now);
    const dimensions=tugDimensions(zoom);
    for(const wreck of wrecks){
      if(destruction&&!wreck.prepared){
        const cos=Math.cos(wreck.angle),sin=Math.sin(wreck.angle);
        destruction.emit(wreck,{x:wreck.x,y:wreck.y,w:dimensions.width,h:dimensions.height},piece=>{
          const dx=piece.x*dimensions.width,dy=piece.y*dimensions.height;
          return {x:wreck.x+dx*cos-dy*sin,y:wreck.y+dx*sin+dy*cos};
        },wreck.stage,1);
        wreck.prepared=true;
      }
      for(const piece of wreck.debris){
        ctx.save();ctx.translate(piece.x,piece.y);ctx.rotate(piece.angle);
        if(piece.structural)destruction.drawStructuralWreck(ctx,piece,wreck.time);
        else {ctx.drawImage(piece.texture,-piece.w/2,-piece.h/2,piece.w,piece.h);destruction.drawWreckGlow(ctx,piece,wreck.time);}
        ctx.restore();
      }
      for(const particle of wreck.particles)destruction?.drawParticle(ctx,particle,wreck.time);
    }
    for(const particle of hullBursts)window.showcaseHullBurst.draw(ctx,particle,now);
    ctx.restore();
  }
  function paint(ctx,{state,ship,cx,cy,w,h,zoom}) {
    const economy=state?.solEconomy;
    if(!economy)return;
    ensureTugArt();
    const dimensions=tugDimensions(zoom);
    tugRenderDimensions=dimensions;
    const now=performance.now();
    for(const freighter of economy.freighters) {
      if(freighter.phase==='destroyed')continue;
      const x=cx+freighter.x-ship.x,y=cy+freighter.y-ship.y;
      const screenX=cx+(x-cx)*zoom,screenY=cy+(y-cy)*zoom;
      if(screenX+dimensions.width*zoom/2< -20||screenX-dimensions.width*zoom/2>w+20||screenY+dimensions.height*zoom/2< -35||screenY-dimensions.height*zoom/2>h+35)continue;
      const stage=damageStage(freighter),asset=tugAssets[stage];
      const impact=freighter.shieldFlash;
      const shieldVisible=asset&&impact&&now-impact.born<(impact.charge===0?430:620);
      const shieldCharge=Math.max(.08,freighter.shields/Math.max(1,tugStats().shields));
      if(shieldVisible){
        ctx.save();ctx.translate(x,y);ctx.rotate(freighter.heading+Math.PI/2);
        window.drawShowcaseShieldSurface(ctx,0,0,dimensions.width,dimensions.height,'#50d5ff',shieldCharge,now,{refract:true,impact});
        ctx.restore();
      }
      if(asset){
        window.vexedFlightAssets.drawShip(ctx,asset,x,y,dimensions.width,freighter.heading+Math.PI/2,now,{height:dimensions.height});
        window.starterShips.get(10).effects.draw(ctx,{x,y,w:dimensions.width,h:dimensions.height},freighter.heading+Math.PI/2,stage,now,{lights:freighter.phase!=='disabled',damage:true,anchors:false});
      }
      if(shieldVisible){
        ctx.save();ctx.translate(x,y);ctx.rotate(freighter.heading+Math.PI/2);
        window.drawShowcaseShieldFlash(ctx,asset.art,dimensions.width,dimensions.height,impact,now);
        window.drawShowcaseShieldSurface(ctx,0,0,dimensions.width,dimensions.height,'#50d5ff',shieldCharge,now,{front:true,impact});
        ctx.restore();
      }
      const selected=targetId===freighter.id;
      if(selected)window.nativeAsteroidCombat?.drawTargetFrame(ctx,{
        name:`Tug Class II #${freighter.id+1}`,size:Math.hypot(dimensions.width,dimensions.height)/Math.SQRT2,
        kind:freighter.phase==='disabled'?'DISABLED FREIGHTER':'FREIGHTER',color:'#ffd66e',shield:freighter.shields/Math.max(1,tugStats().shields),
        hull:freighter.hull/Math.max(1,tugStats().hull),selectedAt:tugSelectedAt
      },x,y,zoom,cx);
    }
  }
  window.nativeSolEconomy={goods,ports,names,roles,lanes,initialize,advance,snapshot,buySell,contract,deliver,paint,paintEffects,select,clearTarget,target,hitTest,fire,hit};
})();
