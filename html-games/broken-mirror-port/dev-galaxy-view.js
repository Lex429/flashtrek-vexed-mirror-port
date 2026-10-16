/* Read-only Dev inspector. Saved NPC life owns tasks; visibility owns no gameplay. */
(() => {
  'use strict';
  const flight=window.nativeManualFlight;
  const systems=flight.systems.map(system=>({system,position:flight.planetPosition(system.id)})).filter(entry=>entry.position);
  const names=new Map(systems.map(({system})=>[Number(system.id),system.name]));
  const factions=new Map((window.VexedMirrorWorld?.governments||[]).map(faction=>[String(faction.id),faction.name]));
  const stage=document.getElementById('game'),canvas=stage.querySelector('#space'),panel=document.createElement('aside');
  panel.id='dev-galaxy-ships';panel.hidden=true;
  panel.innerHTML='<div class="dev-galaxy-ships-head"><strong>SHIP INSPECTOR</strong><span data-count></span></div><label>System<select data-system><option value="all">All systems</option></select></label><label>Find individual ship<input data-search type="search" placeholder="Name, ID, role or faction"></label><div class="dev-galaxy-map-controls"><button type="button" data-galaxy>Galaxy</button><button type="button" data-local>Local positions</button></div><div class="dev-galaxy-ship-list" data-list aria-label="Individual ships"></div><section class="dev-galaxy-inspector" data-inspector aria-label="Selected ship"><p>Select a marker or a ship to inspect its saved life.</p></section><div class="dev-galaxy-legend">Blue: civilian · Green: tug · Gold: transit · Gray: inactive. Click clusters to cycle individual ships. Wheel to zoom.</div>';
  stage.append(panel);
  const filter=panel.querySelector('[data-system]'),search=panel.querySelector('[data-search]'),list=panel.querySelector('[data-list]'),count=panel.querySelector('[data-count]'),inspector=panel.querySelector('[data-inspector]');
  for(const {system} of systems)filter.add(new Option(system.name,String(system.id)));
  const key=id=>String(id),num=value=>Number.isFinite(Number(value))?Number(value):0,nameOf=id=>names.get(Number(id))||('System '+id);
  let active=false,lastState=null,lastCollect=-Infinity,lastPanel=-Infinity,lastPosition=-Infinity,records=[],selectedId=null,trackedId=null,hits=[],transform=null,center=null,localView=false,zoom=1,visit=null;
  const stats={collections:0,domRefreshes:0,markerCount:0,clusters:0,artworkPreparations:0};
  const now=()=>typeof performance==='undefined'?Date.now():performance.now();
  const time=()=>window.nativeSimulation?.seconds(lastState)||num(lastState?.shipSimulation?.seconds);
  function position(state,ship){
    if(ship.category==='player')return flight.position(state);
    if(ship.category==='civilian'&&window.nativeNpcLives?.galaxyPosition){
      const point=window.nativeNpcLives.galaxyPosition(state,ship.entity);
      if(point&&Number.isFinite(point.x)&&Number.isFinite(point.y))return point;
    }
    if(ship.category==='tug'&&ship.entity.lifeLeg&&window.nativeShipMotion?.sampleLeg){
      const pose={x:ship.entity.x,y:ship.entity.y,heading:ship.entity.heading,speed:ship.entity.speed},origin=flight.anchor?.(ship.system);
      window.nativeShipMotion.sampleLeg(pose,ship.entity.lifeLeg,Math.min(window.nativeSimulation.seconds(state),ship.entity.lifeEventAt));
      if(origin)return {x:origin.x+pose.x,y:origin.y+pose.y};
    }
    if(ship.galaxy&&Number.isFinite(ship.galaxy.x)&&Number.isFinite(ship.galaxy.y))return ship.galaxy;
    const origin=flight.anchor?.(ship.system);
    return origin&&{x:origin.x+num(ship.entity.x??ship.x),y:origin.y+num(ship.entity.y??ship.y)};
  }
  function normalize(state,entry){
    const entity=entry.entity||entry,life=entity.life||{},category=entry.category||entity.category||'civilian',id=entry.id??entity.id;
    if(id===undefined||category==='asteroid')return null;
    const task=entry.task||entity.task||life.task||null,journey=entry.journey||entity.journey||life.journey||null,phase=entity.phase||entry.phase||'idle',system=entry.system??entity.system??(category==='tug'?1:state.system);
    return {id,category,entity,name:entry.name||entity.name||(category==='player'?'Player':category==='tug'?'Tug Class II #'+(num(entity.id)+1):category+' '+id),
      role:entry.role||entity.role||life.role||(category==='tug'?'freight':category==='player'?'player':'civilian'),
      faction:entry.faction??entity.faction??entity.ownerGovernmentId??entity.governmentId??'Unaffiliated',
      system,x:num(entry.x??entity.x),y:num(entry.y??entity.y),heading:num(entry.heading??entity.heading),
      detail:entry.detail||life.detail||(journey||phase==='warp'?'transit':phase==='destroyed'||phase==='disabled'?'inactive':'distant'),
      location:entry.location||life.location||{kind:journey||phase==='warp'?'transit':'local',system,port:entity.port},
      task,journey,events:entry.events||entry.recentEvents||entity.recentEvents||life.events||[],nextActionAt:entry.nextActionAt??entity.nextActionAt??life.nextActionAt??task?.nextActionAt??null,
      cargo:entry.cargo??entity.cargo,credits:num(entry.credits??entity.credits),hull:num(entry.hull??entity.hull),shields:num(entry.shields??entity.shields),
      equipment:entry.equipment??entity.weaponLoadout??entity.weapons??[],phase,galaxy:entry.galaxy,position:null,
      homeBase:entry.homeBase??entity.homeBase,origin:entry.origin,destination:entry.destination,route:entry.route,eta:entry.eta};
  }
  function fallback(state){
    return [{id:'player',category:'player',entity:state,system:state.system},
      ...(state.civilianTraffic?.ships||[]).map(entity=>({id:entity.id,category:'civilian',entity})),
      ...(state.solEconomy?.freighters||[]).map(entity=>({id:'tug:'+entity.id,category:'tug',entity,system:1}))];
  }
  function collect(state,force=false){
    if(!state)return records;const changed=lastState!==state;lastState=state;const stamp=now();
    if(force||changed||stamp-lastCollect>=1000){
      const all=window.nativeShipSystems?.inspectAll?.(state)||window.nativeNpcLives?.descriptors?.(state)||fallback(state),seen=new Set();
      records=all.map(entry=>normalize(state,entry)).filter(ship=>ship&&!seen.has(key(ship.id))&&seen.add(key(ship.id)));
      lastCollect=stamp;lastPosition=-Infinity;stats.collections++;
    }
    if(force||stamp-lastPosition>=80){for(const ship of records)ship.position=position(state,ship);lastPosition=stamp;}
    return records;
  }
  const find=id=>records.find(ship=>key(ship.id)===key(id))||null;
  const taskName=task=>task?.label||task?.type||task?.kind||'Idle';
  function destination(value){
    if(value===null||value===undefined)return '—';
    if(typeof value==='object'&&Number.isFinite(value.x)&&Number.isFinite(value.y))return Math.round(value.x)+', '+Math.round(value.y)+' u';
    return typeof value==='object'?value.name||nameOf(value.system??value.systemId??value.id):nameOf(value);
  }
  function location(ship){
    if(ship.location?.kind==='transit'||ship.journey)return 'In transit · '+destination(ship.journey?.origin??ship.system)+' → '+destination(ship.journey?.destination??ship.entity.destinationSystem);
    const port=ship.location?.port??ship.entity.port,label=Number(ship.system)===1&&window.nativeSolEconomy?.names?.[port];
    const anchor=flight.anchor?.(ship.system),pose=ship.position&&anchor?{x:ship.position.x-anchor.x,y:ship.position.y-anchor.y}:{x:ship.x,y:ship.y};
    return nameOf(ship.system)+(label?' · '+label:'')+' · '+Math.round(pose.x)+', '+Math.round(pose.y)+' u';
  }
  function report(ship,authoritativeDetails=false){
    if(!ship)return null;
    const authoritative=authoritativeDetails&&ship.category==='civilian'?window.nativeNpcLives?.inspect?.(lastState,ship.id):null;
    const anchor=flight.anchor?.(ship.system),local=ship.position&&anchor?{x:ship.position.x-anchor.x,y:ship.position.y-anchor.y}:{x:num(ship.entity.x??ship.x),y:num(ship.entity.y??ship.y)};
    const cargo=authoritative&&'cargo' in authoritative?authoritative.cargo:'cargo' in ship.entity?ship.entity.cargo:ship.cargo;
    const currentJourney=ship.category==='civilian'?ship.entity.journey||null:ship.entity.journey||ship.journey;
    const journey=currentJourney?{...currentJourney,progress:Math.max(0,Math.min(1,(time()-num(currentJourney.departedAt))/Math.max(.001,num(currentJourney.duration))))}:null;
    const currentTask=authoritative?.task||ship.entity.task||ship.task,task=currentTask?{...currentTask}:null;
    if(task?.phase==='transit'&&journey)task.progress=.2+journey.progress*.6;
    // A saved target descriptor can contain cycles. Export only inspection fields.
    const data={id:ship.id,name:ship.name,category:ship.category,role:ship.role,faction:ship.faction,system:ship.system,location:authoritative?.location||ship.location,detail:authoritative?.detail||ship.detail,
      position:ship.position&&{...ship.position},galaxy:ship.position&&{...ship.position},local:{...local,heading:journey?.galaxyFrom&&journey?.galaxyTo?Math.atan2(journey.galaxyTo.y-journey.galaxyFrom.y,journey.galaxyTo.x-journey.galaxyFrom.x):ship.heading},
      homeBase:ship.homeBase,origin:ship.origin,destination:ship.destination,route:ship.route,eta:ship.eta,
      task,journey,cargo,credits:authoritative?.credits??ship.entity.credits??ship.credits,
      hull:authoritative?.condition?.hull??authoritative?.hull??ship.entity.hull??ship.hull,shields:authoritative?.condition?.shields??authoritative?.shields??ship.entity.shields??ship.shields,equipment:authoritative?.equipment??ship.equipment,
      events:authoritative?.events||ship.events,nextActionAt:authoritative?.nextActionAt??ship.nextActionAt};
    // Inspection consumers receive values, never mutable saved inventory/task references.
    return JSON.parse(JSON.stringify(data));
  }
  function select(id){const ship=find(id);if(!ship)return false;selectedId=ship.id;lastPanel=-Infinity;if(active)refresh(lastState,true);return true;}
  function track(id){
    if(id===false||id===null){trackedId=null;lastPanel=-Infinity;return null;}
    const ship=find(id===true?selectedId:id);if(!ship)return null;
    selectedId=ship.id;trackedId=ship.id;lastPanel=-Infinity;if(active)refresh(lastState,true);return ship.id;
  }
  function inspectLocal(id=selectedId){
    const ship=find(id);if(!ship||typeof visit!=='function')return false;
    // The host relocates only the observer, preserving all inspected ship state.
    const result=visit(lastState,ship.id,report(ship,true));
    return result!==false&&result?.ok!==false;
  }
  function detail(parent,label,value){
    const row=document.createElement('div'),title=document.createElement('dt'),content=document.createElement('dd');
    title.textContent=label;content.textContent=String(value??'—');row.append(title,content);parent.append(row);
  }
  function cargoText(cargo){
    if(!cargo)return 'Empty';
    return (Array.isArray(cargo)?cargo:[cargo]).map(lot=>String(lot.tons??lot.quantity??lot.amount??0)+' t '+(lot.name||lot.commodity||window.nativeSolEconomy?.goods?.[lot.good]||(lot.good===undefined?'cargo':'Good '+lot.good))).join(', ')||'Empty';
  }
  function updateInspector(){
    const ship=find(selectedId);
    if(!ship){const note=document.createElement('p');note.textContent='Select a marker or a ship to inspect its saved life.';inspector.replaceChildren(note);return;}
    const data=report(ship,true),title=document.createElement('h3'),identity=document.createElement('p'),table=document.createElement('dl');
    title.textContent=data.name;identity.textContent=String(data.id)+' · '+data.category+' · '+data.role+' · '+(factions.get(String(data.faction))||'Faction '+data.faction);
    detail(table,'Location',location(ship));detail(table,'Detail',data.detail);
    if(data.homeBase)detail(table,'Home/base',typeof data.homeBase==='object'?destination(data.homeBase):data.homeBase);
    detail(table,'Task',taskName(data.task)+(data.task?.status?' · '+data.task.status:'')+(data.task?.phase?' · '+data.task.phase:''));
    detail(table,'Reason',data.task?.reason||data.task?.chosenBecause||'No work selected');
    if(data.task?.progress!==undefined)detail(table,'Progress',typeof data.task.progress==='number'?Math.round(data.task.progress*100)+'%':JSON.stringify(data.task.progress));
    const journey=data.journey;
    if(journey){
      detail(table,'Origin',destination(journey.origin??journey.originSystem));detail(table,'Destination',destination(journey.destination??journey.destinationSystem));
      detail(table,'Route',(journey.route||[]).map(destination).join(' → ')||'Direct');
      detail(table,'ETA',Math.max(0,Math.ceil(num(journey.remaining??(num(journey.arrivalAt??journey.arriveAt??(num(journey.departedAt)+num(journey.duration)))-time()))))+' sim s');
    }else{
      if(data.origin!==undefined)detail(table,'Origin',destination(data.origin));
      if(data.destination!==undefined||data.task?.destination)detail(table,'Destination',destination(data.destination??data.task.destination));
      if(data.route?.length)detail(table,'Route',data.route.map(destination).join(' → '));
      if(data.eta!==undefined)detail(table,'ETA',Math.max(0,Math.ceil(num(data.eta)))+' sim s');
    }
    detail(table,'Cargo',cargoText(data.cargo)+(ship.entity.oreHold?' · '+ship.entity.oreHold+' t ore':''));
    detail(table,'Credits',Math.round(data.credits).toLocaleString());detail(table,'Condition',Math.round(data.hull)+' hull · '+Math.round(data.shields)+' shields');
    detail(table,'Equipment',Array.isArray(data.equipment)?data.equipment.join(', ')||'None':data.equipment?.slots?.filter(Boolean).join(', ')||'Owned loadout');
    detail(table,'Next action',data.nextActionAt===null?'Unscheduled':Math.max(0,Math.ceil(data.nextActionAt-time()))+' sim s');
    const actions=document.createElement('div');actions.className='dev-galaxy-ship-actions';
    const tracking=document.createElement('button');tracking.type='button';tracking.dataset.track='';tracking.textContent=key(trackedId)===key(ship.id)?'Stop tracking':'Track ship';tracking.onclick=()=>track(key(trackedId)===key(ship.id)?false:ship.id);
    const local=document.createElement('button');local.type='button';local.dataset.visit='';local.textContent='DEV: inspect locally';local.disabled=typeof visit!=='function';local.onclick=()=>inspectLocal(ship.id);actions.append(tracking,local);
    const events=document.createElement('ol');events.className='dev-galaxy-ship-events';
    for(const event of (data.events||[]).slice(0,6)){const item=document.createElement('li');item.textContent=typeof event==='string'?event:(event.message||event.text||event.type||event.kind||'Event')+(Number.isFinite(event.at)?' · '+Math.round(event.at)+' s':'');events.append(item);}
    const eventTitle=document.createElement('strong');eventTitle.textContent='Recent events';inspector.replaceChildren(title,identity,actions,table,eventTitle,events);
  }
  function refresh(state,force=false){
    if(!active||!state)return;collect(state,force);const stamp=now();if(!force&&stamp-lastPanel<500)return;lastPanel=stamp;stats.domRefreshes++;
    const query=search.value.trim().toLowerCase(),system=filter.value;
    const filtered=records.filter(ship=>(system==='all'||String(ship.system)===system||String(ship.journey?.destination?.system??ship.journey?.destination??ship.entity.destinationSystem)===system)&&(!query||[ship.id,ship.name,ship.category,ship.role,ship.faction].join(' ').toLowerCase().includes(query)));
    filtered.sort((a,b)=>num(a.system)-num(b.system)||a.name.localeCompare(b.name));count.textContent=filtered.length+' / '+records.length;
    const fragment=document.createDocumentFragment();
    for(const ship of filtered){
      const row=document.createElement('button');row.type='button';row.className='dev-galaxy-ship '+ship.category+(key(ship.id)===key(selectedId)?' selected':'');
      row.dataset.shipId=key(ship.id);row.setAttribute('aria-pressed',String(key(ship.id)===key(selectedId)));row.onclick=()=>select(ship.id);
      const title=document.createElement('strong'),place=document.createElement('span'),status=document.createElement('small');
      title.textContent=ship.name;place.textContent=location(ship);status.textContent=ship.role+' · '+taskName(ship.task)+' · '+ship.detail;row.append(title,place,status);fragment.append(row);
    }
    list.replaceChildren(fragment);updateInspector();
  }
  function setActive(enabled,state){active=!!enabled;panel.hidden=!active;lastPanel=-Infinity;if(state)lastState=state;if(active)refresh(lastState,true);}
  filter.onchange=()=>refresh(lastState,true);search.oninput=()=>refresh(lastState,true);
  panel.querySelector('[data-galaxy]').onclick=()=>{zoom=1;center=null;localView=false;};
  panel.querySelector('[data-local]').onclick=()=>{center=(find(selectedId)||find('player'))?.position;localView=true;zoom=1;};
  canvas.addEventListener('click',event=>{
    if(!active||!transform)return;
    const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*transform.w/rect.width,y=(event.clientY-rect.top)*transform.h/rect.height;
    if(x>=transform.mapW)return;
    const nearby=hits.filter(point=>Math.hypot(point.x-x,point.y-y)<Math.max(12,point.radius||0));
    const hit=(nearby.some(point=>point.ids)?nearby.filter(point=>point.ids):nearby).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
    if(hit?.ids?.length){const index=hit.ids.findIndex(id=>key(id)===key(selectedId));select(hit.ids[(index+1)%hit.ids.length]);}
    else if(hit?.system){filter.value=String(hit.system);refresh(lastState,true);}
  });
  canvas.addEventListener('wheel',event=>{
    if(!active||!transform)return;event.preventDefault();
    const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*transform.w/rect.width,y=(event.clientY-rect.top)*transform.h/rect.height;if(x>=transform.mapW)return;
    const point=transform.world(x,y),factor=event.deltaY<0?1.3:1/1.3,newZoom=Math.max(.5,Math.min(1000,zoom*factor)),scale=transform.scale*newZoom/zoom;
    zoom=newZoom;center={x:point.x-(x-transform.mapW/2)/scale,y:point.y-(y-transform.h/2)/scale};
  },{passive:false});
  function routePoints(journey){
    return (journey?.route||[journey?.origin,journey?.destination]).map(id=>typeof id==='object'&&Number.isFinite(id?.x)?id:flight.planetPosition(typeof id==='object'?id?.system??id?.id:id)).filter(Boolean);
  }
  function paint(ctx,view,state){
    const {w,h}=view,displayWidth=canvas.getBoundingClientRect().width||w,mapW=active?w-Math.min(340,displayWidth*.4)*w/displayWidth:w,player=flight.position(state);if(!player)return;
    collect(state);if(active)refresh(state);
    const points=[...systems.map(entry=>entry.position),player],minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const base=Math.min((mapW-120)/Math.max(1,maxX-minX),(h-140)/Math.max(1,maxY-minY)),scale=(localView ? .16 : base)*zoom;
    const tracked=find(trackedId),focus=tracked?.position&&(localView||zoom>1)?tracked.position:center||{x:(minX+maxX)/2,y:(minY+maxY)/2};
    const screen=point=>({x:mapW/2+(point.x-focus.x)*scale,y:h/2+(point.y-focus.y)*scale});
    transform={w,h,mapW,scale,focus,world:(x,y)=>({x:focus.x+(x-mapW/2)/scale,y:focus.y+(y-h/2)/scale})};
    const background=ctx.createRadialGradient(mapW*.48,h*.45,10,mapW*.48,h*.45,Math.max(mapW,h)*.7);
    background.addColorStop(0,'#103044');background.addColorStop(.6,'#071a2a');background.addColorStop(1,'#030a13');
    ctx.fillStyle=background;ctx.fillRect(0,0,w,h);ctx.save();ctx.beginPath();ctx.rect(0,48,mapW,h-73);ctx.clip();ctx.strokeStyle='rgba(98,163,187,.12)';ctx.lineWidth=1;
    for(let i=0;i<=10;i++){const x=mapW*i/10,y=h*i/10;ctx.beginPath();ctx.moveTo(x,48);ctx.lineTo(x,h-25);ctx.moveTo(0,y);ctx.lineTo(mapW,y);ctx.stroke();}
    hits=[];
    for(const {system,position} of systems){const p=screen(position);if(p.x<-20||p.x>mapW+20||p.y<25||p.y>h)continue;ctx.beginPath();ctx.arc(p.x,p.y,system.id===state.system?4:2.6,0,Math.PI*2);ctx.fillStyle=system.id===state.system?'#9af3dc':'#88bfd2';ctx.fill();hits.push({...p,system:system.id});}
    const selected=find(selectedId),route=routePoints(selected?.journey||{route:selected?.route});
    if(route.length>1){ctx.strokeStyle='#f8d77899';ctx.lineWidth=1.5;ctx.setLineDash([5,5]);ctx.beginPath();route.forEach((point,index)=>{const p=screen(point);if(index===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.stroke();ctx.setLineDash([]);}
    const groups=new Map();
    for(const ship of records){
      if(!ship.position)continue;const p=screen(ship.position);if(p.x<-10||p.x>mapW+10||p.y<43||p.y>h-20)continue;
      const cell=!localView&&scale<.025?Math.round(p.x/12)+':'+Math.round(p.y/12):key(ship.id),group=groups.get(cell)||{x:0,y:0,ships:[]};group.x+=p.x;group.y+=p.y;group.ships.push(ship);groups.set(cell,group);
    }
    stats.markerCount=0;stats.clusters=0;
    for(const group of groups.values()){
      const x=group.x/group.ships.length,y=group.y/group.ships.length,marked=group.ships.some(ship=>key(ship.id)===key(selectedId)),ship=group.ships.find(ship=>key(ship.id)===key(selectedId))||group.ships[0],radius=group.ships.length>1?Math.min(10,4+Math.log2(group.ships.length)):3;
      ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fillStyle=ship.detail==='inactive'?'#8b929d':ship.detail==='transit'?'#ffd978':ship.category==='player'?'#eafffb':ship.category==='tug'?'#69e4a8':'#61bde9';ctx.fill();
      if(marked){ctx.strokeStyle='#fff1a0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,radius+4,0,Math.PI*2);ctx.stroke();}
      if(group.ships.length>1){ctx.fillStyle='#e8f8ff';ctx.font='700 10px system-ui';ctx.fillText(String(group.ships.length),x+radius+3,y-3);stats.clusters++;}
      if(marked||localView){ctx.font='10px system-ui';ctx.fillStyle='#dff7ff';ctx.fillText(ship.name,x+radius+5,y+10);}
      hits.push({x,y,radius:radius+5,ids:group.ships.map(ship=>ship.id)});stats.markerCount+=group.ships.length;
    }
    ctx.font='10px system-ui';const occupied=[];
    for(const {system,position} of [...systems].sort((a,b)=>Number(b.system.id===state.system)-Number(a.system.id===state.system))){
      const p=screen(position),width=ctx.measureText(system.name).width,x=p.x+8,y=p.y-7;
      if(x<0||x+width>mapW||y<60||y>h-30||occupied.some(box=>x<box.x+box.w&&x+width>box.x&&Math.abs(y-box.y)<13))continue;
      occupied.push({x,y,w:width});ctx.strokeStyle='#061522';ctx.lineWidth=3;ctx.strokeText(system.name,x,y);ctx.fillStyle=system.id===state.system?'#b7ffeb':'#bfd6e2';ctx.fillText(system.name,x,y);
    }
    const p=screen(player);ctx.fillStyle='#d4fff4';ctx.font='700 10px system-ui';ctx.fillText('YOU',p.x+8,p.y-8);ctx.restore();
    ctx.fillStyle='#e4f8ff';ctx.font='600 16px system-ui';ctx.fillText('DEV GALAXY · SHIP LIVES',18,25);
    ctx.fillStyle='#90bbca';ctx.font='11px system-ui';ctx.fillText(systems.length+' SYSTEMS · '+records.length+' SHIPS · '+(localView?'LOCAL WORLD POSITIONS':'GALAXY POSITIONS'),18,43);
    const metrics=window.nativeNpcLives?.metrics?.(state),footer=tracked?'TRACKING '+tracked.name:selected?'SELECTED '+selected.name:'Select a named ship. Map inspection preserves its task.';
    ctx.fillStyle='#b9d9e3';ctx.fillText(footer+(metrics?' · '+(metrics.detailed??metrics.activeDetailed??0)+' detailed · '+(metrics.distantUpdates??0)+' distant updates':''),18,h-12);
  }
  function snapshot(state=lastState){
    if(state)collect(state,true);
    return {active,selectedId,trackedId,localView,zoom,ships:records.map(ship=>report(ship)),markers:hits.filter(hit=>hit.ids).map(hit=>({x:hit.x,y:hit.y,ids:[...hit.ids]})),
      view:transform&&{scale:transform.scale,center:{...transform.focus},width:transform.mapW,height:transform.h},metrics:{...stats}};
  }
  window.nativeGalaxyOverview=Object.freeze({paint,setActive,configure(options={}){visit=options.visit||options.onVisit||null;lastPanel=-Infinity;},snapshot,select,track,inspectLocal});
})();
