/* Read-only Dev inspector. Saved NPC life owns tasks; visibility owns no gameplay. */
(() => {
  'use strict';
  const flight=window.nativeManualFlight;
  const physical=id=>window.nativeSystemCatalog?.physicalId(Number(id))??Number(id);
  const systems=flight.systems.filter(system=>physical(system.id)===system.id).map(system=>({system:{...system,name:window.nativeSystemCatalog?.name(system.id)||system.name},position:flight.planetPosition(system.id)})).filter(entry=>entry.position);
  const names=new Map(flight.systems.map(system=>[Number(system.id),system.name]));
  const factions=new Map((window.VexedMirrorWorld?.governments||[]).map(faction=>[String(faction.id),faction.name]));
  const stage=document.getElementById('game'),canvas=stage.querySelector('#space'),panel=document.createElement('aside');
  panel.id='dev-galaxy-ships';panel.hidden=true;
  panel.setAttribute('aria-label','Selected ship activity');
  panel.innerHTML='<div class="dev-galaxy-ships-head"><strong>SELECTED SHIP</strong><button type="button" data-clear aria-label="Clear selected ship">Clear</button></div><section class="dev-galaxy-inspector" data-inspector aria-label="Selected ship"></section>';
  const controls=document.createElement('div');controls.id='dev-galaxy-controls';controls.hidden=true;
  controls.innerHTML='<div class="dev-galaxy-title"><strong>Galaxy traffic</strong><span data-total></span></div><p>Drag to move · Scroll to zoom · Click a ship</p><nav class="dev-galaxy-map-controls" aria-label="Galaxy view controls"><button type="button" data-zoom-out aria-label="Zoom out">−</button><button type="button" data-zoom-in aria-label="Zoom in">+</button><button type="button" data-galaxy>Fit galaxy</button><button type="button" data-local disabled>Zoom to ship</button></nav><details class="dev-galaxy-finder"><summary>Find a ship <span data-count></span></summary><div class="dev-galaxy-finder-body"><label>System<select data-system><option value="all">All systems</option></select></label><label>Search ships<input data-search type="search" placeholder="Name, role or faction"></label><div class="dev-galaxy-ship-list" data-list aria-label="Find individual ships"></div></div></details>';
  const legend=document.createElement('div');legend.id='dev-galaxy-legend';legend.hidden=true;legend.innerHTML='<span>Civilian</span><span>Tug</span><span>In transit</span><span>Inactive</span><small>Numbered icons are groups. Click to zoom in.</small>';
  const tooltip=document.createElement('div');tooltip.id='dev-galaxy-tooltip';tooltip.hidden=true;
  stage.append(panel,controls,legend,tooltip);
  const filter=controls.querySelector('[data-system]'),search=controls.querySelector('[data-search]'),list=controls.querySelector('[data-list]'),count=controls.querySelector('[data-count]'),inspector=panel.querySelector('[data-inspector]'),finder=controls.querySelector('details');
  for(const {system} of systems)filter.add(new Option(system.name,String(system.id)));
  const key=id=>String(id),num=value=>Number.isFinite(Number(value))?Number(value):0,nameOf=id=>names.get(Number(id))||('System '+id);
  let active=false,lastState=null,lastCollect=-Infinity,lastPanel=-Infinity,lastPosition=-Infinity,records=[],selectedId=null,trackedId=null,hits=[],transform=null,center=null,localView=false,zoom=1,visit=null;
  const stats={collections:0,domRefreshes:0,markerCount:0,clusters:0,artworkPreparations:0};
  const now=()=>typeof performance==='undefined'?Date.now():performance.now();
  let drag=null,suppressClick=false,hoveredId=null,lastList='',cameraStatus='';
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
  function tradeStock(ship,task,cargo){
    const good=task?.requirements?.good??task?.good??cargo?.good;
    if(!Number.isInteger(good))return null;
    const read=place=>{
      if(!place)return null;
      const system=Number(place.system),port=system===1?Number(place.port):0;
      const stock=system===1?lastState.solEconomy?.ports?.[port]:lastState.civilianTraffic?.life?.markets?.[system+':'+port]?.stock;
      return Number.isFinite(stock?.[good])?{system,port,tons:stock[good]}:null;
    };
    return {good,name:window.nativeSolEconomy?.goods?.[good]||'Good '+good,
      origin:read(task?.origin||ship.origin),destination:read(task?.destination||ship.destination)};
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
    const data={id:ship.id,name:ship.name,category:ship.category,role:ship.role,faction:ship.faction,system:ship.system,phase:ship.entity.phase||ship.phase,location:authoritative?.location||ship.location,detail:authoritative?.detail||ship.detail,
      position:ship.position&&{...ship.position},galaxy:ship.position&&{...ship.position},local:{...local,heading:journey?.galaxyFrom&&journey?.galaxyTo?Math.atan2(journey.galaxyTo.y-journey.galaxyFrom.y,journey.galaxyTo.x-journey.galaxyFrom.x):ship.heading},
      homeBase:ship.homeBase,origin:ship.origin,destination:ship.destination,route:ship.route,eta:ship.eta,
      docking:authoritative?.docking??window.nativePortDocking?.inspect(lastState,ship.entity,authoritativeDetails),dockingMove:!!ship.entity.dockingMove,task,journey,cargo,tradeStock:tradeStock(ship,task,cargo),credits:authoritative?.credits??ship.entity.credits??ship.credits,
      hull:authoritative?.condition?.hull??authoritative?.hull??ship.entity.hull??ship.hull,shields:authoritative?.condition?.shields??authoritative?.shields??ship.entity.shields??ship.shields,equipment:authoritative?.equipment??ship.equipment,
      repairs:window.nativeShipRepairs?.status(lastState,ship.entity,ship.category),
      events:authoritative?.events||ship.events,nextActionAt:authoritative?.nextActionAt??ship.nextActionAt,
      traffic:(ship.entity.localLeg||ship.entity.lifeLeg)&&ship.entity.trafficControl&&{mode:ship.entity.trafficControl.mode,until:ship.entity.trafficControl.until}};
    // Inspection consumers receive values, never mutable saved inventory/task references.
    return JSON.parse(JSON.stringify(data));
  }
  function select(id){const ship=find(id);if(!ship)return false;if(key(trackedId)!==key(ship.id)){if(trackedId!==null&&transform)center={...transform.focus};trackedId=null;}selectedId=ship.id;lastPanel=-Infinity;if(active)refresh(lastState,true);return true;}
  function track(id){
    if(id===false||id===null){if(trackedId!==null&&transform)center={...transform.focus};trackedId=null;lastPanel=-Infinity;return null;}
    const ship=find(id===true?selectedId:id);if(!ship)return null;
    selectedId=ship.id;trackedId=ship.id;if(!localView&&zoom<3)focusShip(ship);lastPanel=-Infinity;if(active)refresh(lastState,true);return ship.id;
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
  const readable=value=>String(value||'').replace(/[-_]/g,' ').replace(/^./,letter=>letter.toUpperCase());
  function portName(value){
    if(value&&typeof value==='object'&&Number(value.system)===1&&window.nativeSolEconomy?.names?.[value.port])return window.nativeSolEconomy.names[value.port]+' (Sol)';
    return destination(value);
  }
  function activity(data){
    const phase=data.task?.phase||data.phase,goal=portName(data.task?.destination??data.destination??data.journey?.destination),source=portName(data.task?.origin??data.origin);
    if(data.phase==='destroyed')return ['Destroyed','This ship can no longer operate.'];
    if(data.phase==='disabled')return ['Disabled',data.repairs?.mission?'Dot drones are repairing its hull.':data.repairs?.distress?'Broadcasting distress; awaiting Olympic medical assistance.':'Engines offline; checking repair supplies.'];
    if(data.phase==='fighting')return ['In combat','Engaging another ship.'];
    if(data.phase==='ore-theft')return ['Taking ore','Collecting ore claimed by another ship.'];
    if(data.journey)return ['Travelling to '+portName(data.journey.destination??data.journey.destinationSystem),'Flying between star systems.'];
    if(data.traffic?.until>time())return data.traffic.mode==='yielding'?['Giving way to traffic','Waiting for another ship to clear the route, then continuing the current job.']:['Passing another ship','Taking a detour around traffic, then continuing the current job.'];
    if(data.dockingMove)return ['Clearing the dock','Moving to a holding position so another ship can use the berth.'];
    const phases={
      'pickup-flight':['Flying to collect cargo','Heading to '+source+'.'],loading:['Loading cargo','Taking cargo aboard at '+source+'.'],loaded:['Ready to depart','Cargo is aboard. Next stop: '+goal+'.'],
      approaching:['Approaching destination','Heading to the dock at '+goal+'.'],unloading:['Unloading cargo','Delivering cargo at '+goal+'.'],
      'waiting-payment':['Waiting for payment','Holding cargo until a buyer can pay.'], 'payment-idle':['Looking for a buyer','Keeping cargo aboard while waiting for a funded buyer.'],
      'mining-flight':['Flying to an asteroid','Approaching its mining claim.'],mining:['Mining an asteroid','Cutting ore from its claimed asteroid.'],collecting:['Collecting ore','Bringing mined ore aboard.'],
      'rescue-approach':['Responding to distress','Approaching the disabled ship.'],'rescue-service':['Medical repair operation','Deploying Dot drones with finite deuranium supplies.'],
      repairing:['Under repair','Receiving paid hull and shield repairs.'],idle:['Waiting for work','Checking for a suitable job.'],completed:['Job complete','Waiting to choose its next task.'],interrupted:['Task interrupted',data.task?.failureReason||'Its previous task could not continue.'],
      turning:['Turning to depart','Lining up for the journey to '+goal+'.'],travel:['Flying to '+goal,'Transporting cargo along its local route.'],'waiting-route':['Waiting for a route',data.task?.failureReason||'Keeping cargo aboard until a route is available.'],
      'dock-queue':['Waiting for a berth','Waiting its turn to dock at '+portName(data.docking&&{system:data.docking.system,port:data.docking.port}||data.task?.destination)+'.'],
      'holding-flight':['Moving to the waiting area','Flying to a safe holding position until a berth becomes available.'],
      waiting:['Waiting at port','Preparing its next journey.'],cruise:['Flying locally','Travelling within '+nameOf(data.system)+'.'],docked:['Docked','At port in '+nameOf(data.system)+'.']
    };
    if(data.category==='player')return ['Your ship',data.journey?'Travelling between systems.':'In '+nameOf(data.system)+'.'];
    return phases[phase]||[readable(phase)||'Waiting',data.task?.label||readable(data.task?.kind)||'No active task.'];
  }
  function updateInspector(){
    const ship=find(selectedId);
    panel.querySelector('[data-clear]').disabled=!ship;controls.querySelector('[data-local]').disabled=!ship;
    if(!ship){if(inspector.dataset.inspectedId!=='empty'){inspector.dataset.inspectedId='empty';inspector.innerHTML='<div class="dev-galaxy-empty"><span aria-hidden="true">↖</span><h3>Pick a ship to see its activity</h3><p>Click a ship icon on the map, or open <b>Find a ship</b>.</p><p>Drag anywhere on the map to move around. Click a numbered group to see its ships more closely.</p></div>';}return;}
    if(inspector.dataset.inspectedId!==key(ship.id)){
      inspector.dataset.inspectedId=key(ship.id);inspector.scrollTop=0;
      inspector.innerHTML='<h3 data-name></h3><p data-identity></p><div class="dev-galaxy-ship-actions"><button type="button" data-track>Follow ship</button><button type="button" data-center>Center on ship</button></div><div class="dev-galaxy-activity"><small>DOING NOW</small><h4 data-activity></h4><p data-explanation></p><progress data-progress max="1" aria-label="Current task progress"></progress><span data-progress-label></span></div><dl data-main-details></dl><h4 class="dev-galaxy-events-title">Recent activity</h4><ol class="dev-galaxy-ship-events"></ol><details class="dev-galaxy-more"><summary>More ship details</summary><dl data-more-details></dl><button type="button" data-visit>View in flight</button></details>';
      inspector.querySelector('[data-track]').onclick=()=>track(key(trackedId)===key(selectedId)?false:selectedId);
      inspector.querySelector('[data-center]').onclick=()=>focusShip(find(selectedId));
      inspector.querySelector('[data-visit]').onclick=()=>inspectLocal(selectedId);
    }
    const data=report(ship,true),[doing,explanation]=activity(data),table=inspector.querySelector('[data-main-details]'),more=inspector.querySelector('[data-more-details]'),journey=data.journey;
    inspector.querySelector('[data-name]').textContent=data.name;
    inspector.querySelector('[data-identity]').textContent=readable(data.role)+' · '+(factions.get(String(data.faction))||String(data.faction));
    const tracking=inspector.querySelector('[data-track]'),following=key(trackedId)===key(ship.id);
    tracking.textContent=following?'Stop following':'Follow ship';tracking.setAttribute('aria-pressed',String(following));
    inspector.querySelector('[data-activity]').textContent=doing;inspector.querySelector('[data-explanation]').textContent=explanation;
    const progress=inspector.querySelector('[data-progress]'),fraction=journey?.progress??data.task?.progress;
    progress.hidden=typeof fraction!=='number';progress.value=Math.max(0,Math.min(1,num(fraction)));
    inspector.querySelector('[data-progress-label]').textContent=progress.hidden?'':Math.round(progress.value*100)+'% '+(journey?'of journey':'of task');
    table.replaceChildren();more.replaceChildren();
    detail(table,'Location',journey?'Between '+portName(journey.origin??journey.originSystem)+' and '+portName(journey.destination??journey.destinationSystem):nameOf(data.system)+(Number(data.system)===1&&window.nativeSolEconomy?.names?.[data.location?.port]?' / '+window.nativeSolEconomy.names[data.location.port]:''));
    const goal=data.task?.destination??data.destination??journey?.destination;
    if(goal!==undefined&&goal!==null)detail(table,'Destination',portName(goal));
    if(data.docking){
      const dock=data.docking,label=dock.kind==='berth'?'Assigned berth '+(dock.slot+1):dock.kind==='queue'?'Waiting: '+dock.queuePosition+' of '+dock.queueLength:dock.kind==='overflow'?'Holding outside the docking queue':'At a holding position';
      detail(table,'Docking',label+(dock.clearing?' · clearing the previous berth':''));
    }
    if(data.repairs)detail(table,'Repair bay',data.repairs.drones+' Dot drones ? '+Math.round(data.repairs.supplies*10)/10+' t deuranium');
    detail(table,'Cargo',cargoText(data.cargo)+(ship.entity.oreHold?' · '+ship.entity.oreHold+' t ore':''));
    if(journey)detail(table,'Arrival in',Math.max(0,Math.ceil(num(journey.arrivalAt??journey.arriveAt??(num(journey.departedAt)+num(journey.duration)))-time()))+' simulation seconds');
    else if(data.nextActionAt!==null)detail(table,'Next step in',Math.max(0,Math.ceil(data.nextActionAt-time()))+' simulation seconds');
    if(data.task?.reason||data.task?.chosenBecause)detail(table,'Why this job',data.task.reason||data.task.chosenBecause);
    detail(more,'Ship ID',data.id);detail(more,'Position',location(ship));detail(more,'Task',taskName(data.task)+' · '+readable(data.task?.phase||data.phase));
    if(data.homeBase)detail(more,'Home/base',typeof data.homeBase==='object'?portName(data.homeBase):data.homeBase);
    if(data.tradeStock?.origin)detail(more,'Source stock',data.tradeStock.origin.tons+' t '+data.tradeStock.name);
    if(data.tradeStock?.destination)detail(more,'Buyer stock',data.tradeStock.destination.tons+' t '+data.tradeStock.name);
    detail(more,'Credits',Math.round(data.credits).toLocaleString());detail(more,'Condition',Math.round(data.hull)+' hull · '+Math.round(data.shields)+' shields');
    detail(more,'Equipment',Array.isArray(data.equipment)?data.equipment.join(', ')||'None':data.equipment?.slots?.filter(Boolean).join(', ')||'Owned loadout');
    inspector.querySelector('[data-visit]').disabled=typeof visit!=='function';
    const events=inspector.querySelector('ol'),fragment=document.createDocumentFragment();
    for(const event of (data.events||[]).slice(0,5)){const item=document.createElement('li');item.textContent=typeof event==='string'?event:event.message||event.text||readable(event.type||event.kind)||'Event';if(Number.isFinite(event.at)){const age=document.createElement('small');age.textContent=Math.max(0,Math.floor(time()-event.at))+' simulation seconds ago';item.append(age);}fragment.append(item);}
    if(!fragment.childNodes.length){const item=document.createElement('li');item.textContent='No recent activity recorded yet.';fragment.append(item);}events.replaceChildren(fragment);
  }
  function refresh(state,force=false){
    if(!active||!state)return;collect(state,force);const stamp=now();if(!force&&stamp-lastPanel<500)return;lastPanel=stamp;stats.domRefreshes++;
    const query=search.value.trim().toLowerCase(),system=filter.value;
    controls.querySelector('[data-total]').textContent=records.length+' ships';
    const filtered=records.filter(ship=>(system==='all'||String(physical(ship.system))===system||String(physical(ship.journey?.destination?.system??ship.journey?.destination??ship.entity.destinationSystem))===system)&&(!query||[ship.id,ship.name,ship.category,ship.role,ship.faction,factions.get(String(ship.faction))].join(' ').toLowerCase().includes(query)));
    filtered.sort((a,b)=>num(a.system)-num(b.system)||a.name.localeCompare(b.name));count.textContent=filtered.length+' / '+records.length;
    const signature=JSON.stringify([query,system,selectedId,filtered.map(ship=>[ship.id,ship.system,taskName(ship.task),ship.entity.phase])]);
    if(finder.open&&signature!==lastList){lastList=signature;const fragment=document.createDocumentFragment();
    for(const ship of filtered){
      const row=document.createElement('button');row.type='button';row.className='dev-galaxy-ship '+ship.category+(key(ship.id)===key(selectedId)?' selected':'');
      row.dataset.shipId=key(ship.id);row.setAttribute('aria-pressed',String(key(ship.id)===key(selectedId)));row.onclick=()=>{select(ship.id);focusShip(find(ship.id));finder.open=false;};
      const title=document.createElement('strong'),place=document.createElement('span'),status=document.createElement('small');
      title.textContent=ship.name;place.textContent=location(ship);status.textContent=ship.role+' · '+taskName(ship.task)+' · '+ship.detail;row.append(title,place,status);fragment.append(row);
    }
    list.replaceChildren(fragment);}updateInspector();
  }
  function setActive(enabled,state){active=!!enabled;panel.hidden=controls.hidden=legend.hidden=!active;tooltip.hidden=true;hoveredId=null;endDrag();canvas.setAttribute('aria-label',active?'Galaxy traffic map. Drag to pan, scroll to zoom, and click a ship to inspect it.':'Starship flight view');lastPanel=-Infinity;if(state)lastState=state;if(active)refresh(lastState,true);}
  filter.onchange=()=>refresh(lastState,true);search.oninput=()=>refresh(lastState,true);
  controls.addEventListener('keydown',event=>event.stopPropagation());panel.addEventListener('keydown',event=>event.stopPropagation());
  finder.ontoggle=()=>{if(finder.open){lastList='';refresh(lastState,true);}};
  panel.querySelector('[data-clear]').onclick=()=>{selectedId=trackedId=null;refresh(lastState,true);};
  controls.querySelector('[data-galaxy]').onclick=()=>{zoom=1;center=null;localView=false;trackedId=null;cameraStatus='Whole galaxy';lastPanel=-Infinity;};
  function focusShip(ship){if(!ship?.position)return;center={...ship.position};localView=true;zoom=1;cameraStatus='Around '+ship.name;}
  controls.querySelector('[data-local]').onclick=()=>focusShip(find(selectedId));
  function zoomAt(factor,x=transform?.mapW/2,y=transform?.cy){
    if(!transform)return;tooltip.hidden=true;const point=transform.world(x,y),newZoom=Math.max(.35,Math.min(1000,zoom*factor)),scale=transform.scale*newZoom/zoom;
    trackedId=null;zoom=newZoom;center={x:point.x-(x-transform.mapW/2)/scale,y:point.y-(y-transform.cy)/scale};lastPanel=-Infinity;
  }
  controls.querySelector('[data-zoom-in]').onclick=()=>zoomAt(1.5);
  controls.querySelector('[data-zoom-out]').onclick=()=>zoomAt(1/1.5);
  function pointer(event){const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*transform.w/rect.width,y:(event.clientY-rect.top)*transform.h/rect.height};}
  function pick(x,y){return hits.filter(point=>Math.hypot(point.x-x,point.y-y)<Math.max(14*transform.unit,point.radius||0)).sort((a,b)=>Number(!!b.ids)-Number(!!a.ids)||Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];}
  function endDrag(){if(drag&&canvas.hasPointerCapture?.(drag.id))canvas.releasePointerCapture(drag.id);drag=null;canvas.classList.remove('galaxy-dragging');}
  canvas.addEventListener('pointerdown',event=>{
    if(!active||!transform||event.button!==0)return;const p=pointer(event);if(p.x>=transform.mapW)return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,focus:{...transform.focus},scale:transform.scale,ratio:transform.w/canvas.getBoundingClientRect().width,moved:false};suppressClick=false;canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(!active||!transform)return;
    if(drag&&drag.id===event.pointerId){const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(drag.moved){trackedId=null;center={x:drag.focus.x-dx*drag.ratio/drag.scale,y:drag.focus.y-dy*drag.ratio/drag.scale};suppressClick=true;tooltip.hidden=true;hoveredId=null;canvas.classList.add('galaxy-dragging');}return;}
    const p=pointer(event),hit=p.x<transform.mapW?pick(p.x,p.y):null,ship=hit?.ids&&find(hit.ids[0]);hoveredId=ship?.id??null;
    if(!hit){tooltip.hidden=true;canvas.classList.remove('galaxy-hover');return;}
    canvas.classList.add('galaxy-hover');tooltip.textContent=ship?ship.name+' · '+activity(report(ship))[0]+(hit.ids.length>1?' · '+hit.ids.length+' ships here; click to zoom':''):nameOf(hit.system)+' · click to look closer';
    const bounds=stage.getBoundingClientRect(),mapPixels=transform.mapW/transform.w*canvas.getBoundingClientRect().width;tooltip.style.left=Math.max(8,Math.min(event.clientX-bounds.left+14,mapPixels-260))+'px';tooltip.style.top=Math.min(event.clientY-bounds.top+18,bounds.height-80)+'px';tooltip.hidden=false;
  });
  canvas.addEventListener('pointerup',event=>{if(drag?.id===event.pointerId)endDrag();});
  canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',()=>{drag=null;canvas.classList.remove('galaxy-dragging');});
  canvas.addEventListener('pointerleave',()=>{tooltip.hidden=true;hoveredId=null;canvas.classList.remove('galaxy-hover');});
  addEventListener('blur',endDrag);
  canvas.addEventListener('click',event=>{
    if(!active||!transform)return;
    if(suppressClick){suppressClick=false;return;}
    const {x,y}=pointer(event);
    if(x>=transform.mapW)return;
    const hit=pick(x,y);
    if(hit?.ids?.length){
      const index=hit.ids.findIndex(id=>key(id)===key(selectedId));select(hit.ids[(index+1)%hit.ids.length]);
      if(hit.ids.length>1){
        const members=hit.ids.map(find).filter(ship=>ship?.position),xs=members.map(ship=>ship.position.x),ys=members.map(ship=>ship.position.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
        const targetScale=Math.min(1.2*transform.unit,Math.max(40*transform.unit,transform.mapW-100*transform.unit)/Math.max(100,maxX-minX),Math.max(40*transform.unit,transform.mapH-80*transform.unit)/Math.max(100,maxY-minY));
        trackedId=null;center={x:(minX+maxX)/2,y:(minY+maxY)/2};localView=true;zoom=Math.max(.35,Math.min(1000,targetScale/(.16*transform.unit)));
      }
    }
    else if(hit?.system){trackedId=null;center={...flight.planetPosition(hit.system)};localView=true;zoom=1;cameraStatus=nameOf(hit.system);}
  });
  canvas.addEventListener('dblclick',event=>{if(!active||!transform)return;event.preventDefault();const {x,y}=pointer(event);if(x<transform.mapW)zoomAt(2,x,y);});
  canvas.addEventListener('wheel',event=>{
    if(!active||!transform)return;event.preventDefault();
    const {x,y}=pointer(event);if(x>=transform.mapW)return;zoomAt(Math.exp(-Math.max(-100,Math.min(100,event.deltaY))*.003),x,y);
  },{passive:false});
  addEventListener('keydown',event=>{if(!active||event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,select,textarea,button')||window.nativePause?.active)return;if(['+','=','-','_'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();zoomAt(['+','='].includes(event.key)?1.5:1/1.5);}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&transform){event.preventDefault();event.stopImmediatePropagation();trackedId=null;const step=80*transform.unit/transform.scale;center={x:transform.focus.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),y:transform.focus.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)};}},true);
  function routePoints(journey){
    return (journey?.route||[journey?.origin,journey?.destination]).map(id=>typeof id==='object'&&Number.isFinite(id?.x)?id:flight.planetPosition(typeof id==='object'?id?.system??id?.id:id)).filter(Boolean);
  }
  function paint(ctx,view,state){
    const {w,h}=view,rect=canvas.getBoundingClientRect(),unit=w/(rect.width||w),panelRect=panel.getBoundingClientRect(),bottomPanel=active&&panelRect.width>=rect.width*.9,mapW=active&&!bottomPanel?w-panelRect.width*unit:w,player=flight.position(state);if(!player)return;
    const top=(controls.offsetHeight+24)*unit,bottom=(bottomPanel?panelRect.height:0)*unit+(legend.offsetHeight+44)*unit,mapH=Math.max(60*unit,h-top-bottom),cy=top+mapH/2;
    collect(state);if(active)refresh(state);
    const points=[...systems.map(entry=>entry.position),player],minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const base=Math.min(Math.max(40*unit,mapW-110*unit)/Math.max(1,maxX-minX),Math.max(40*unit,mapH-60*unit)/Math.max(1,maxY-minY)),scale=Math.max(.000001,(localView ? .16*unit : base)*zoom);
    const tracked=find(trackedId),focus=tracked?.position||center||{x:(minX+maxX)/2,y:(minY+maxY)/2};
    const screen=point=>({x:mapW/2+(point.x-focus.x)*scale,y:cy+(point.y-focus.y)*scale});
    transform={w,h,mapW,mapH,cy,unit,scale,focus,world:(x,y)=>({x:focus.x+(x-mapW/2)/scale,y:focus.y+(y-cy)/scale})};
    const background=ctx.createRadialGradient(mapW*.48,h*.45,10,mapW*.48,h*.45,Math.max(mapW,h)*.7);
    background.addColorStop(0,'#103044');background.addColorStop(.6,'#071a2a');background.addColorStop(1,'#030a13');
    ctx.fillStyle=background;ctx.fillRect(0,0,w,h);ctx.save();ctx.beginPath();ctx.rect(0,top,mapW,mapH);ctx.clip();ctx.strokeStyle='rgba(98,163,187,.12)';ctx.lineWidth=unit;
    const grid=Math.pow(10,Math.ceil(Math.log10(80*unit/scale))),spacing=grid*scale,origin=screen({x:0,y:0});
    for(let x=((origin.x%spacing)+spacing)%spacing;x<mapW;x+=spacing){ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+mapH);ctx.stroke();}
    for(let y=top+(((origin.y-top)%spacing)+spacing)%spacing;y<top+mapH;y+=spacing){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(mapW,y);ctx.stroke();}
    hits=[];
    for(const {system,position} of systems){const p=screen(position);if(p.x<0||p.x>mapW||p.y<top||p.y>top+mapH)continue;ctx.beginPath();ctx.arc(p.x,p.y,(system.id===physical(state.system)?5:3.5)*unit,0,Math.PI*2);ctx.fillStyle=system.id===physical(state.system)?'#9af3dc':'#88bfd2';ctx.fill();ctx.beginPath();ctx.arc(p.x,p.y,9*unit,0,Math.PI*2);ctx.strokeStyle='#88bfd240';ctx.stroke();hits.push({...p,system:system.id});}
    const selected=find(selectedId),route=routePoints(selected?.journey||{route:selected?.route});
    if(route.length>1){ctx.strokeStyle='#f8d778bb';ctx.lineWidth=2*unit;ctx.setLineDash([7*unit,5*unit]);ctx.beginPath();route.forEach((point,index)=>{const p=screen(point);if(index===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.stroke();ctx.setLineDash([]);}
    const groups=new Map();
    for(const ship of records){
      if(!ship.position)continue;const p=screen(ship.position);if(p.x<10*unit||p.x>mapW-10*unit||p.y<top+10*unit||p.y>top+mapH-10*unit)continue;
      const cell=Math.floor(p.x/(26*unit))+':'+Math.floor(p.y/(26*unit)),group=groups.get(cell)||{x:0,y:0,ships:[]};group.x+=p.x;group.y+=p.y;group.ships.push(ship);groups.set(cell,group);
    }
    stats.markerCount=0;stats.clusters=0;
    for(const group of groups.values()){
      const members=group.ships,marked=members.some(ship=>key(ship.id)===key(selectedId)),ship=members.find(ship=>key(ship.id)===key(selectedId))||members[0],anchor=screen(ship.position),cluster=members.length>1&&(!localView||scale/unit<.35),spread=!cluster&&members.length>1;
      const drawIcon=(vessel,x,y,size,chosen)=>{
        const color=vessel.detail==='inactive'?'#9ba4b3':vessel.journey||vessel.detail==='transit'?'#ffdb83':vessel.category==='player'?'#f0fffa':vessel.category==='tug'?'#79efb0':'#77d6ff';
        ctx.save();ctx.translate(x,y);if(chosen){ctx.beginPath();ctx.arc(0,0,size+5*unit,0,Math.PI*2);ctx.fillStyle='#ffe3911b';ctx.fill();ctx.strokeStyle='#ffe391';ctx.lineWidth=2*unit;ctx.stroke();}
        const journey=vessel.journey,heading=journey?.galaxyFrom&&journey?.galaxyTo?Math.atan2(journey.galaxyTo.y-journey.galaxyFrom.y,journey.galaxyTo.x-journey.galaxyFrom.x):num(vessel.entity.heading??vessel.heading);
        ctx.rotate(heading);ctx.beginPath();ctx.moveTo(size*1.3,0);ctx.lineTo(-size*.85,-size*.7);ctx.lineTo(-size*.45,0);ctx.lineTo(-size*.85,size*.7);ctx.closePath();ctx.fillStyle=color;ctx.strokeStyle='#06121d';ctx.lineWidth=2*unit;ctx.fill();ctx.stroke();ctx.restore();
      };
      if(spread){
        members.forEach((vessel,index)=>{const angle=index*2*Math.PI/members.length,point=screen(vessel.position),distance=(20+members.length*2)*unit,x=group.x/members.length+Math.cos(angle)*distance,y=group.y/members.length+Math.sin(angle)*distance,chosen=key(vessel.id)===key(selectedId);ctx.strokeStyle='#76b5cc66';ctx.lineWidth=unit;ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(x,y);ctx.stroke();drawIcon(vessel,x,y,8*unit,chosen);hits.push({x,y,radius:14*unit,ids:[vessel.id]});if(chosen){ctx.font=600+' '+(12*unit)+'px system-ui';ctx.fillStyle='#fff1b8';ctx.fillText(vessel.name,x+14*unit,y+17*unit);}});
      }else{
        const x=marked?anchor.x:group.x/members.length,y=marked?anchor.y:group.y/members.length;drawIcon(ship,x,y,(cluster?10:8)*unit,marked);
        if(cluster){ctx.font='700 '+(11*unit)+'px system-ui';const label=String(members.length),width=ctx.measureText(label).width;ctx.fillStyle='#193d50';ctx.fillRect(x+7*unit,y-17*unit,width+8*unit,16*unit);ctx.fillStyle='#fff2bb';ctx.fillText(label,x+11*unit,y-5*unit);stats.clusters++;}
        if(marked||key(hoveredId)===key(ship.id)||localView&&!cluster){ctx.font=(marked?'600 ':'')+(12*unit)+'px system-ui';ctx.strokeStyle='#061522';ctx.lineWidth=4*unit;ctx.strokeText(ship.name,x+15*unit,y+16*unit);ctx.fillStyle=marked?'#fff1b8':'#dff7ff';ctx.fillText(ship.name,x+15*unit,y+16*unit);}
        hits.push({x,y,radius:(cluster?20:14)*unit,ids:[ship.id,...members.filter(vessel=>vessel!==ship).map(vessel=>vessel.id)]});
      }
      stats.markerCount+=members.length;
    }
    ctx.font=(12*unit)+'px system-ui';const occupied=[];
    for(const {system,position} of [...systems].sort((a,b)=>Number(b.system.id===physical(state.system))-Number(a.system.id===physical(state.system)))){
      const p=screen(position),width=ctx.measureText(system.name).width,x=p.x+10*unit,y=p.y-13*unit;
      if(x<0||x+width>mapW||y<top+14*unit||y>top+mapH-8*unit||occupied.some(box=>x<box.x+box.w&&x+width>box.x&&Math.abs(y-box.y)<16*unit))continue;
      occupied.push({x,y,w:width});ctx.strokeStyle='#061522';ctx.lineWidth=4*unit;ctx.strokeText(system.name,x,y);ctx.fillStyle=system.id===physical(state.system)?'#b7ffeb':'#9eb9ca';ctx.fillText(system.name,x,y);
    }
    const p=screen(player);ctx.fillStyle='#d4fff4';ctx.font='700 '+(11*unit)+'px system-ui';ctx.fillText('YOU',p.x+12*unit,p.y-14*unit);ctx.restore();
    const footer=tracked?'Following '+tracked.name+' · Drag to stop following':selected?'Selected: '+selected.name:cameraStatus||'Live ship activity';
    ctx.fillStyle='#b9d9e3';ctx.font=(12*unit)+'px system-ui';ctx.fillText(footer,14*unit,top+mapH+17*unit,Math.max(1,mapW-28*unit));
  }
  function snapshot(state=lastState){
    if(state)collect(state,true);
    return {active,selectedId,trackedId,localView,zoom,ships:records.map(ship=>report(ship)),markers:hits.filter(hit=>hit.ids).map(hit=>({x:hit.x,y:hit.y,ids:[...hit.ids]})),
      view:transform&&{scale:transform.scale,center:{...transform.focus},width:transform.mapW,height:transform.h,centerY:transform.cy,mapHeight:transform.mapH},metrics:{...stats}};
  }
  window.nativeGalaxyOverview=Object.freeze({paint,setActive,configure(options={}){visit=options.visit||options.onVisit||null;lastPanel=-Infinity;},snapshot,select,track,inspectLocal});
})();
