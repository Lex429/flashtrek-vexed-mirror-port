/* Continuous chart with galaxy, solar-system and destination navigation. */
(() => {
  'use strict';
  const root = document.createElement('section');
  root.id = 'galaxy-map';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Navigation map');
  document.getElementById('game').append(root);
  root.innerHTML = `<header class="map-header"><div><h2>Map</h2><p class="map-location"></p><p class="map-coordinates" title="Your ship's coordinates"><span data-coordinate="x"></span><span data-coordinate="y"></span></p></div><div class="map-controls"><button type="button" data-action="center">Center on ship</button><div class="map-zoom"><button type="button" data-action="out" aria-label="Zoom out">−</button><button type="button" data-action="in" aria-label="Zoom in">+</button></div><button type="button" data-action="close" class="map-close">Close <span>Esc</span></button></div></header><div class="map-viewport"><svg class="map-chart" role="group" aria-label="Ship position and destinations"></svg><div class="map-scale"></div><div class="map-legend" aria-label="System relationship colors"></div><p class="map-help">Scroll to zoom · Drag to move · Click a destination</p></div><footer class="map-destination"><div class="map-destination-info"><div class="map-destination-heading"><h3></h3><span class="map-welcome"></span><span class="map-system-status" hidden></span></div><p class="map-destination-meta"></p><dl class="map-system-facts" aria-label="System information"></dl><p class="map-message" role="status" aria-live="polite"></p></div><div class="map-actions"><button type="button" data-action="marker" class="map-marker" aria-label="Set marker" title="Set marker">⚑</button><button type="button" data-action="cruise" class="map-primary">Cruise to</button><button type="button" data-action="warp" class="map-primary">Warp to</button><button type="button" data-action="navigate">Select for navigation</button></div></footer>`;
  root.querySelector('.map-header>div').insertAdjacentHTML('afterbegin','<nav class="map-breadcrumbs" aria-label="Map view"></nav>');
  root.querySelector('.map-controls').insertAdjacentHTML('afterbegin','<button type="button" data-map-back class="map-back">← Back <span>○ / B</span></button>');
  root.querySelector('.map-viewport').insertAdjacentHTML('beforeend','<div class="map-focus-caption" aria-hidden="true"><span></span><strong></strong></div>');
  root.querySelector('.map-help').setAttribute('aria-live','polite');
  const svg = root.querySelector('svg');
  const viewport = root.querySelector('.map-viewport');
  const hover=document.createElement('div');hover.className='map-hover';hover.hidden=true;hover.setAttribute('role','tooltip');viewport.append(hover);
  const mapButton = document.getElementById('mapBtn');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const number = value => Math.round(value).toLocaleString();
  const coordinateFormat = new Intl.NumberFormat('en-US', {maximumFractionDigits:0});
  const coordinate = value => coordinateFormat.format(Math.round(Number(value) || 0) || 0);
  const call = (action, value = 0) => window.nativeNavigation.call(action, value);
  const systemName = node => node?.known && window.nativeSystemCatalog ? window.nativeSystemCatalog.name(node.id) : node?.id === 1 && node.known ? 'Sol' : node?.name || 'Unknown system';
  const populationNumber = new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1});
  const labelMeasure=document.createElement('canvas').getContext('2d');
  const mapColors=window.nativeFactionStanding.colors;
  const signed=value=>`${value>0?'+':''}${number(value)}`;
  const blend=(a,b,t)=>a+(b-a)*t;
  const smooth=(a,b,value)=>{const t=clamp((value-a)/(b-a),0,1);return t*t*(3-2*t);};
  root.querySelector('.map-legend').innerHTML=[['Allied','Allied / welcome'],['Hostile','Hostile / not welcome'],['Neutral','Neutral'],['Your territory','Your territory'],['Forbidden','Restricted'],['Uninhabited','Uninhabited'],['Unknown','Unexplored']].map(([status,label])=>`<span><i class="${status==='Forbidden'?'map-key-restricted':''}" style="--key-color:${mapColors[status]}"></i>${label}</span>`).join('');
  function reception(system) {
    if(!system?.known)return {text:'Welcome status unknown',tone:'unknown'};
    if(system.status==='Uninhabited')return {text:'Uninhabited',tone:'uninhabited'};
    return ({Allied:{text:'Welcome · Allied',tone:'friendly'},Hostile:{text:'Not welcome · Hostile',tone:'hostile'},'Your territory':{text:'Your territory',tone:'owned'},Neutral:{text:'Neutral reception',tone:'neutral'}})[system.standing] || {text:'Welcome status unknown',tone:'unknown'};
  }
  const markerKey = 'broken-mirror-map-markers';
  let markers = {};
  try { const saved = JSON.parse(localStorage.getItem(markerKey)); if (saved && typeof saved === 'object' && !Array.isArray(saved)) markers = saved; } catch {}
  if(markers['system:30'])markers['body:31:1']=true;
  let state, selected, timer, returnFocus, drag, pointerSelection, frame = 0, followShip = true, message = '';
  let camera = {x:0, y:0, span:6}, goal = {...camera};
  let lastFrame=0, overviewFollow=true, shipArt=null, shipArtKey='', shipArtToken=0;
  let level='system',cameraFlight=null,lastControllerFrame=0,controllerUsed=false,pathSignature='';
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let zoomDelay,zoomRepeat,zoomHeld=false;
  function stopZoomHold(){clearTimeout(zoomDelay);clearInterval(zoomRepeat);}
  function overviewBounds(){
    const positions=[...state.nodes,state.shipPosition].filter(Boolean),xs=positions.map(node=>node.x),ys=positions.map(node=>node.y);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    return {x:(minX+maxX)/2,y:(minY+maxY)/2,spanX:Math.max(180,(maxX-minX)*1.3),spanY:Math.max(120,(maxY-minY)*1.3)};
  }
  function geometry(span){
    const bounds=overviewBounds(),wide=smooth(95,bounds.spanX,span);
    const legendHeight=root.querySelector('.map-legend').clientHeight;
    return {wide,centerY:viewport.clientHeight/2-wide*(legendHeight/2+12),scaleX:viewport.clientWidth/span,scaleY:blend(viewport.clientWidth/span,Math.max(50,viewport.clientHeight-legendHeight-65)/bounds.spanY,wide)};
  }
  function followGoal(){
    if(!followShip||!state.shipPosition)return;
    const bounds=overviewBounds(),wide=overviewFollow?smooth(95,bounds.spanX,goal.span):0;
    goal.x=blend(state.shipPosition.x,bounds.x,wide);goal.y=blend(state.shipPosition.y,bounds.y,wide);
  }
  function loadMapShip(){
    const maximum=window.VexedMirrorWorld.ships.find(ship=>ship.id===state.shipType)?.hull||100,ratio=state.shipHull/maximum;
    const key=`${state.shipType}:${ratio<.25?3:ratio<.5?2:ratio<.75?1:0}`;
    if(key===shipArtKey)return;
    shipArtKey=key;shipArt=null;const token=++shipArtToken;
    window.vexedFlightAssets.loadShip(state.shipType,state.shipHull).then(asset=>{
      if(token!==shipArtToken)return;
      const sample=document.createElement('canvas');sample.width=asset.width;sample.height=asset.height;
      const context=sample.getContext('2d');context.drawImage(asset.art,0,0);
      const pixels=context.getImageData(0,0,sample.width,sample.height).data;
      let left=sample.width,top=sample.height,right=0,bottom=0;
      for(let y=0;y<sample.height;y++)for(let x=0;x<sample.width;x++)if(pixels[(y*sample.width+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      const width=Math.max(1,right-left+1),height=Math.max(1,bottom-top+1),icon=document.createElement('canvas');
      icon.width=Math.max(1,Math.round(width/Math.max(width,height)*64));icon.height=Math.max(1,Math.round(height/Math.max(width,height)*64));
      icon.getContext('2d').drawImage(sample,left,top,width,height,0,0,icon.width,icon.height);
      shipArt={url:icon.toDataURL('image/png'),ratio:width/height,type:asset.type};requestDraw();
    }).catch(()=>{if(token===shipArtToken)shipArtKey='';});
  }

  function solAnchor() { return state.nodes.find(node => node.id === 1) || window.nativeManualFlight.chartPosition(1); }
  function systemArea(system){
    const bounds=window.nativeSystemCatalog.boundary(system.id);
    return {x:system.x+bounds.x/1000,y:system.y+bounds.y/1000,rx:bounds.rx/1000,ry:bounds.ry/1000};
  }
  function systemAreaView(system){
    const area=systemArea(system),availableHeight=Math.max(120,viewport.clientHeight-root.querySelector('.map-legend').clientHeight-50);
    return {x:area.x,y:area.y,span:Math.max(area.rx*2.7,area.ry*2.7*viewport.clientWidth/availableHeight)};
  }
  function solBodies(system=1) {
    const anchor = window.nativeManualFlight.chartPosition(system);
    return (window.nativeSystemCatalog?.bodies(system)||window.nativeSystemHub.sol).filter(body=>body.render!==false&&!body.occludedBy).map(body => {
      const position = window.vexedSolFlight.bodyPosition(body);
      const residents=state?.selected?.id===system?state.selected.localPopulations?.[body.id]:undefined;
      const port=Number.isFinite(residents)?(body.port||!!body.legacyWorldId)&&residents>0:body.port;
      return {...body, port, system, x:anchor.x + position.x/1000, y:anchor.y + position.y/1000};
    });
  }
  function selectedNode() {
    if (selected.body !== undefined) return solBodies(selected.system).find(body => body.id === selected.body);
    return state.nodes.find(node => node.id === selected.system) || state.selected;
  }
  function flyTo(next,duration=650){
    followShip=false;goal={...next};lastFrame=0;
    cameraFlight=reducedMotion.matches?null:{from:{...camera},to:{...goal},at:performance.now(),duration};
    if(reducedMotion.matches)camera={...goal};requestDraw();
  }
  function setLevel(value){level=value;root.dataset.level=value;}
  function pcControls(){
    controllerUsed=false;
    if(cameraFlight){cameraFlight=null;goal={...camera};}
    for(const button of root.querySelectorAll('.map-action-focus'))button.classList.remove('map-action-focus');
    syncPath();
  }
  function syncPath(){
    const system=state.nodes.find(node=>node.id===selected.system),name=systemName(system),node=selectedNode();
    const signature=[level,selected.system,selected.body,name,node?.name,controllerUsed].join('|');if(signature===pathSignature)return;pathSignature=signature;root.dataset.input=controllerUsed?'controller':'pc';
    root.querySelector('.map-breadcrumbs').innerHTML=`<button type="button" data-map-view="galaxy" ${level==='galaxy'?'aria-current="page"':''}>Galaxy</button>${level!=='galaxy'?`<span>›</span><button type="button" data-map-view="system" ${level==='system'?'aria-current="page"':''}>${escape(name)}</button>`:''}${level==='destination'?`<span>›</span><span aria-current="page">${escape(node?.name||name)}</span>`:''}`;
    const help=controllerUsed?(level==='galaxy'?'D-pad / stick: nearby systems · ✕: open system':level==='system'?'D-pad / stick: nearby planets · ✕: destination details':'D-pad: choose action · ✕: confirm action')+' · L2 / R2: zoom · ○ / B: back · R3: your ship':'Click to select · Double-click to zoom · Scroll to zoom · Drag to move · Esc: close';
    const helpNode=root.querySelector('.map-help');if(helpNode.textContent!==help)helpNode.textContent=help;
    const caption=root.querySelector('.map-focus-caption');caption.querySelector('span').textContent=level==='galaxy'?'GALAXY':level==='system'?'SOLAR SYSTEM':'DESTINATION';caption.querySelector('strong').textContent=level==='galaxy'?name:level==='system'?name:node?.name||name;
    root.querySelector('[data-map-back]').title=level==='destination'?'Back to solar system':level==='system'?'Back to galaxy':'Close map';
  }
  function showGalaxy(){
    setLevel('galaxy');selectDestination(selected.system);const bounds=overviewBounds();
    flyTo({x:bounds.x,y:bounds.y,span:bounds.spanX},750);
  }
  function enterSystem(id=selected.system){
    const system=state.nodes.find(node=>node.id===Number(id));if(!system)return;
    const bodies=system.known?solBodies(system.id):[],body=bodies.find(node=>selected.system===system.id&&node.id===selected.body)||bodies.find(node=>node.id===window.nativeSystemCatalog.homeId(system.id))||bodies[0];
    setLevel('system');selectDestination(system.id,body?.id);flyTo(systemAreaView(system));
  }
  function openDestination(system=selected.system,body=selected.body){
    if(body===undefined&&level==='galaxy'){enterSystem(system);return;}
    setLevel('destination');selectDestination(system,body);const node=selectedNode(),region=state.nodes.find(node=>node.id===selected.system);
    if(node)flyTo({x:node.x,y:node.y,span:Math.min(8,Math.max(2.6,systemAreaView(region).span*.24))},550);
    focusAction();
  }
  function back(){
    if(root.hidden)return;
    if(level==='destination'){enterSystem();return;}
    if(level==='system'){showGalaxy();return;}
    close();
  }
  function actionButtons(){return Array.from(root.querySelectorAll('[data-action="cruise"],[data-action="warp"],[data-action="navigate"]')).filter(node=>!node.hidden&&!node.disabled);}
  function focusAction(direction){
    const buttons=actionButtons();if(!buttons.length)return;
    let index=buttons.indexOf(document.activeElement);
    index=index<0?0:direction?(index+(direction==='left'||direction==='up'?-1:1)+buttons.length)%buttons.length:index;
    for(const button of root.querySelectorAll('.map-actions button'))button.classList.remove('map-action-focus');
    buttons[index].classList.add('map-action-focus');buttons[index].focus({preventScroll:true});return buttons[index];
  }
  function browse(direction){
    const items=level==='galaxy'?state.nodes.map(node=>({...node,key:`system:${node.id}`})):(state.nodes.find(node=>node.id===selected.system)?.known?solBodies(selected.system):[]).map(node=>({...node,key:`body:${node.id}`}));
    const current=items.find(node=>level==='galaxy'?node.id===selected.system:node.id===selected.body)||selectedNode(),view=geometry(goal.span);
    const next=window.nativeMapControls.next(items,current,direction,{x:view.scaleX,y:view.scaleY});if(!next)return;
    selectDestination(level==='galaxy'?next.id:next.system,level==='galaxy'?undefined:next.id);
    flyTo({x:next.x,y:next.y,span:goal.span},320);
    requestDraw();
  }
  function controller(input,at){
    if(root.hidden)return;if(input.direction||input.pressed.length||input.held[6]||input.held[7]){controllerUsed=true;syncPath();}
    const dt=lastControllerFrame?clamp((at-lastControllerFrame)/1000,0,.05):0;lastControllerFrame=at;
    if(input.pressed.includes(1)){back();return;}
    if(input.pressed.includes(11)){centerOnShip(true);return;}
    const zoomAxis=Number(!!input.held[6])-Number(!!input.held[7]);
    if(zoomAxis&&dt){
      followShip=false;const node=selectedNode();if(node){goal.x=node.x;goal.y=node.y;}zoom(Math.exp(zoomAxis*dt*1.7),undefined,true);
    }
    if(input.direction){if(level==='destination')focusAction(input.direction);else browse(input.direction);}
    if(input.pressed.includes(0)){if(level==='galaxy')enterSystem();else if(level==='system')openDestination();else focusAction()?.click();}
  }
  function markerID() { return selected.body !== undefined ? `body:${selected.system}:${selected.body}` : `system:${selected.system}`; }
  function requestDraw() { if (!frame && !root.hidden) frame = requestAnimationFrame(draw); }
  function refresh() {
    if (root.hidden) return;
    const next = call('state', selected);
    if (!next?.ok) { close(false); return; }
    state = next;
    followGoal();loadMapShip();
    updateInfo();
    requestDraw();
  }
  function open({controller=false}={}) {
    if (!window.nativeNavigation.active || !call('open')?.ok) return;
    returnFocus = document.activeElement;
    state = call('state');
    if (!state?.ok) return;
    selected = {system:state.current, body:state.localBody};
    const ship = state.shipPosition || state.nodes.find(node => node.current);
    camera = {x:ship.x, y:ship.y, span:6}; goal = {...camera};
    setLevel('system');cameraFlight=null;lastControllerFrame=0;controllerUsed=controller;pointerSelection=null;
    followShip = true; overviewFollow=true;lastFrame=0; message = ''; drag = null; root.hidden = false;
    window.nativeGameSounds?.ui('map');
    clearInterval(timer); timer = setInterval(refresh, 500);
    refresh(); root.querySelector('.map-close').focus({preventScroll:true});
  }
  function close(focus = true) {
    const wasOpen = !root.hidden;
    root.hidden = true; clearInterval(timer); timer = undefined; drag = null;
    hover.hidden=true;
    cameraFlight=null;lastControllerFrame=0;
    stopZoomHold();zoomHeld=false;
    cancelAnimationFrame(frame); frame = 0;
    if (!wasOpen) return;
    call('close');
    if (focus) window.nativeGameSounds?.ui('close');
    if (focus) (returnFocus?.isConnected ? returnFocus : mapButton).focus({preventScroll:true});
  }
  function centerOnShip(hierarchy=false) {
    if(hierarchy){selected={system:state.current,body:state.localBody};setLevel('system');refresh();}cameraFlight=null;
    followShip = true;overviewFollow=false;
    goal.x = state.shipPosition.x; goal.y = state.shipPosition.y;
    requestDraw();
  }
  function zoom(factor, point, hierarchy=false) {
    cameraFlight=null;
    const nextSpan = clamp(goal.span * factor, 1.2, overviewBounds().spanX);
    if (!followShip && point) {
      const width = viewport.clientWidth, height = viewport.clientHeight;
      const before=geometry(goal.span),after=geometry(nextSpan);
      goal.x += (point.x-width/2) * (1/before.scaleX-1/after.scaleX);
      goal.y += (point.y-before.centerY)/before.scaleY-(point.y-after.centerY)/after.scaleY;
    }
    goal.span = nextSpan;overviewFollow=true;followGoal();
    if(hierarchy){const region=state.nodes.find(node=>node.id===selected.system),span=systemAreaView(region).span;
      if(level==='galaxy'&&factor<1&&goal.span<span*1.08)enterSystem();
      else if(level==='system'&&factor>1&&goal.span>span*1.6)showGalaxy();
      else if(level==='destination'&&factor>1&&goal.span>span*.7)enterSystem();}
    requestDraw();
  }
  function selectDestination(system, body) {
    selected = {system:Number(system)};
    if (body !== undefined) selected.body = Number(body);
    message = ''; refresh();
  }
  function updateInfo() {
    const node = selectedNode();
    if (!node) return;
    const current = state.nodes.find(node => node.current);
    const local = state.selected.inLocalSystem;
    root.querySelector('.map-location').textContent = `Your ship: ${state.region?.kind==='interstellar'?'Interstellar space':systemName(state.nodes.find(node=>node.id===state.region?.system)||current)+' solar system'}${state.inLocalTransit ? ' · Cruising' : ''}`;
    root.querySelector('[data-coordinate="x"]').textContent = `X: ${coordinate(state.galaxyShipPosition.x)}`;
    root.querySelector('[data-coordinate="y"]').textContent = `Y: ${coordinate(state.galaxyShipPosition.y)}`;
    root.querySelector('.map-coordinates').title = "Your ship's galactic coordinates";
    root.querySelector('.map-destination-info h3').textContent = selected.body !== undefined ? node.name : `${systemName(node)} system`;
    const distance = selected.body !== undefined ? Math.hypot(node.x-state.shipPosition.x, node.y-state.shipPosition.y)*1000 : state.selected.manualDistance;
    root.querySelector('.map-destination-meta').textContent = selected.body !== undefined
      ? `${systemName(state.selected)} · ${node.kind?.replaceAll("_"," ")||"world"} · ${number(distance)} units away${node.port ? ' · Port' : ''}`
      : selected.system === state.current ? 'Your current solar system' : state.selected.travelDays >= 0 ? `${number(state.selected.travelDays)} days · ${number(state.selected.fuel)} t antimatter` : 'Manual navigation only';
    const system = selected.body!==undefined && state.selected.localWorlds?.[selected.body] ? {...state.selected,...state.selected.localWorlds[selected.body]} : state.selected, welcome = reception(system);
    const badge = root.querySelector('.map-welcome');
    badge.textContent = welcome.text;
    badge.dataset.tone = welcome.tone;
    badge.title = `Your reception in ${systemName(system)} system`;
    const status = root.querySelector('.map-system-status');
    status.hidden = system.status !== 'Forbidden';
    status.textContent = status.hidden ? '' : 'Restricted space';
    const population = selected.body !== undefined ? system.localPopulations?.[selected.body] : system.population;
    const residents = system.known && Number.isFinite(population) && population >= 0;
    const facts = [
      ['Government',system.governmentName],
      ['Your standing',system.known && Number.isFinite(system.prestige) ? `${system.prestige>0?'+':''}${number(system.prestige)}` : 'Unknown'],
      ['Population',residents ? population ? populationNumber.format(population) : 'Uninhabited' : 'Unknown'],
      ['System strength',system.known ? number(system.strength) : 'Unknown']
    ];
    root.querySelector('.map-system-facts').innerHTML = facts.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd${label==='Population'&&residents?` title="${number(population)} inhabitants"`:''}>${escape(value)}</dd></div>`).join('');
    const cruise = root.querySelector('[data-action="cruise"]');
    const warp = root.querySelector('[data-action="warp"]');
    const nav = root.querySelector('[data-action="navigate"]');
    cruise.hidden = !local&&!state.selected.canCruise;
    cruise.disabled = !state.selected.canCruise;
    cruise.title = state.selected.cruiseError||`Cruise to ${state.selected.bodyName}`;
    warp.hidden = local||state.selected.canCruise;
    warp.textContent = 'Warp to';
    warp.disabled = !state.selected.canTravel;
    warp.title = state.selected.canTravel ? `Warp to ${state.selected.bodyName}` : state.selected.error;
    nav.disabled = false;
    root.querySelector('.map-message').textContent = message || (!warp.hidden && !state.selected.canTravel ? state.selected.error : cruise.disabled&&local ? state.selected.cruiseError : state.inLocalTransit ? 'Cruise active. You can change destination or cancel cruise in flight [C].' : '');
    const marked = !!markers[markerID()];
    const marker = root.querySelector('[data-action="marker"]');
    marker.classList.toggle('marked', marked);
    marker.setAttribute('aria-pressed', String(marked));
    marker.setAttribute('aria-label', marked ? 'Remove marker' : 'Set marker');
    marker.title = marked ? 'Remove marker' : 'Set marker';
    syncPath();
  }
  function travel(action) {
    let result;
    if (action === 'warp') {
      const destination = {...selected};
      close(false);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        result = call('course', destination);
        if (!result?.ok) { open(); selected = destination; message = result?.error || 'Unable to warp here.'; refresh(); }
      }));
      return;
    }
    result = action === 'cruise' ? call('cruise', selected) : selected.body !== undefined && selected.system === state.current ? call('local-target', selected.body) : call('track', selected.system);
    if (result?.ok) { close(false); document.getElementById('space').focus({preventScroll:true}); }
    else { message = result?.error || 'Unable to set this destination.'; updateInfo(); }
  }

  function draw(timestamp) {
    frame = 0;
    if (root.hidden || !state) return;
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    const delta=lastFrame?clamp(timestamp-lastFrame,1,50):16.7,amount=reducedMotion.matches?1:1-Math.exp(-delta/145);
    let moving=Math.abs(Math.log(camera.span/goal.span))>.00015||Math.abs(camera.x-goal.x)>.001||Math.abs(camera.y-goal.y)>.001;
    if(cameraFlight){const progress=reducedMotion.matches?1:clamp((timestamp-cameraFlight.at)/cameraFlight.duration,0,1);camera=window.nativeMapControls.camera(cameraFlight.from,cameraFlight.to,progress);moving=progress<1;if(!moving)cameraFlight=null;lastFrame=timestamp;}
    else if(moving){camera.x=blend(camera.x,goal.x,amount);camera.y=blend(camera.y,goal.y,amount);camera.span=Math.exp(blend(Math.log(camera.span),Math.log(goal.span),amount));lastFrame=timestamp;}
    else {camera={...goal};lastFrame=0;}
    const view=geometry(camera.span),wide=view.wide,legendHeight=root.querySelector('.map-legend').clientHeight;
    const project=point=>({x:width/2+(point.x-camera.x)*view.scaleX,y:view.centerY+(point.y-camera.y)*view.scaleY});
    const onScreen=point=>point.x>-24&&point.x<width+24&&point.y>-24&&point.y<height+24;
    const ship=project(state.shipPosition),compact=width<600,fontSize=compact?10:12;
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    svg.dataset.span=camera.span;svg.dataset.overview=wide;
    const occupied=[];
    labelMeasure.font=`${fontSize}px system-ui`;
    function label(name,point){
      const textWidth=Math.ceil(labelMeasure.measureText(name).width)+2,textHeight=fontSize+5;
      const box={x:point.x+12,y:point.y+4-fontSize,w:textWidth,h:textHeight};
      // Crowded names can disappear, but their anchor never changes sides or moves away.
      if(occupied.some(other=>other.owner!==point&&box.x<other.x+other.w+4&&box.x+box.w+4>other.x&&box.y<other.y+other.h+2&&box.y+box.h+2>other.y))return '';
      occupied.push(box);
      return `<text class="map-label" x="${point.x+12}" y="${point.y+4}" style="font-size:${fontSize}px">${escape(name)}</text>`;
    }
    const spacing=Math.pow(10,Math.floor(Math.log10(camera.span/7))),gridX=spacing*view.scaleX,gridY=spacing*view.scaleY;
    const offsetX=((width/2-camera.x*view.scaleX)%gridX+gridX)%gridX,offsetY=((view.centerY-camera.y*view.scaleY)%gridY+gridY)%gridY;
    let markup=`<defs><pattern id="navigation-grid" width="${gridX}" height="${gridY}" x="${offsetX}" y="${offsetY}" patternUnits="userSpaceOnUse"><path d="M ${gridX} 0 H 0 V ${gridY}" fill="none" stroke="#ffffff" stroke-opacity=".035"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#navigation-grid)"/>`;
    const sol=state.nodes.find(node=>node.id===1),bodyOpacity=1-smooth(62,105,camera.span);
    if(camera.span<175)for(const system of state.nodes){
      const area=systemArea(system),center=project(area),rx=area.rx*view.scaleX,ry=area.ry*view.scaleY;
      if(center.x+rx<0||center.x-rx>width||center.y+ry<0||center.y-ry>height)continue;
      const opacity=(1-smooth(100,175,camera.span))*smooth(18,46,Math.min(rx,ry));
      if(opacity<.02)continue;
      const title=system.known?`${systemName(system)} solar system`:`Unexplored system S-${String(system.id).padStart(3,'0')}`;
      const areaFont=compact||height<300?10:12,tracking=areaFont*.15;
      labelMeasure.font=`${areaFont}px system-ui`;
      const titleWidth=labelMeasure.measureText(title.toUpperCase()).width+(title.length-1)*tracking;
      const titleOpacity=smooth(titleWidth*.85,titleWidth*1.15,rx*2);
      markup+=`<g class="map-system-boundary" data-region-system="${system.id}" aria-label="${escape(title)}" opacity="${opacity}"><ellipse cx="${center.x}" cy="${center.y}" rx="${rx}" ry="${ry}"/>${titleOpacity>.02?`<text x="${center.x}" y="${center.y-ry-13}" text-anchor="middle" opacity="${titleOpacity}" style="font-size:${areaFont}px;letter-spacing:.15em">${escape(title.toUpperCase())}</text>`:''}</g>`;
    }
    labelMeasure.font=`${fontSize}px system-ui`;
    let route;
    if(state.cruiseTarget)route=solBodies(state.cruiseTarget.system).find(body=>body.id===state.cruiseTarget.body);
    else if(state.manualTargetSystem)route=state.nodes.find(node=>node.id===state.manualTargetSystem);
    else route=solBodies(state.current).find(body=>body.id===state.localNavTarget);
    if(route){const end=project(route);markup+=`<path class="map-navigation-line" d="M ${ship.x} ${ship.y} L ${end.x} ${end.y}"/>`;}
    const items=[];
    for(const node of state.nodes){
      const opacity=node.known?1-bodyOpacity:1;if(opacity<.03)continue;
      const point=project(node.id===1?node:{x:node.x-.22,y:node.y+.075});
      const isSelected=selected.system===node.id&&(selected.body===undefined||bodyOpacity<.5);
      const isMarked=!!markers[`system:${node.id}`]||Object.keys(markers).some(key=>key.startsWith(`body:${node.id}:`)&&markers[key]);
      items.push({node,point,isSelected,isCurrent:node.current,isMarked,body:false,opacity});
    }
    for(const region of state.nodes.filter(node=>node.known))for(const body of solBodies(region.id)){
      const point=project(body);
      items.push({node:body,point,isSelected:selected.system===body.system&&selected.body===body.id,isCurrent:state.current===body.system&&state.localBody===body.id,isMarked:!!markers[`body:${body.system}:${body.id}`],body:true,opacity:bodyOpacity});
    }
    items.sort((a,b)=>Number(b.isSelected)-Number(a.isSelected)||Number(b.isCurrent)-Number(a.isCurrent)||Number(b.isMarked)-Number(a.isMarked)||Number(b.node.known)-Number(a.node.known));
    for(const item of items)if(item.opacity>.35)occupied.push({x:item.point.x-8,y:item.point.y-8,w:16,h:16,owner:item.point});
    const planetColors=['#f3c468','#bcb7ac','#dabd87','#7ebbdc','#c5cbd2','#df9475','#a69a86','#d7c3a1','#dfc892','#8acdd5','#6d94d0','#b5bdc8'];
    for(const item of items){
      const {node,point,isSelected,isCurrent,isMarked,body,opacity}=item,relation=body?state.nodes.find(region=>region.id===node.system):node,welcome=reception(relation);
      const status=!relation?.known?'Unknown':relation.status==='Uninhabited'?'Uninhabited':relation.standing;
      const color=body?(planetColors[node.id]||"#9cbdcf"):mapColors[status]||mapColors.Unknown;
      const name=body?node.name:systemName(node),reputation=!body&&node.known?node.prestige:null;
      const text=opacity>.5&&(isSelected||isCurrent||isMarked||body||node.known)?isSelected?`<text class="map-label map-selected-label" x="${point.x+17}" y="${point.y+4}">${escape(name)}</text>`:label(name,point):'';
      const radius=body?(node.kind==='star'?7:5):compact?4.5:5.5;
      const description=`${name} · ${welcome.text}${reputation!==null?` · Standing ${signed(reputation)}`:''}${relation?.status==='Forbidden'?' · Restricted space':''}`;
      markup+=`<g class="map-destination-node ${isSelected?'selected':''} ${isCurrent?'current':''} ${!relation?.known?'unknown':''}" data-system="${body?node.system:node.id}" ${body?`data-body="${node.id}"`:''} data-reputation="${reputation??''}" data-standing="${escape(status)}" tabindex="${opacity>.5&&onScreen(point)?0:-1}" role="button" aria-label="${escape(description)}" aria-pressed="${isSelected}" opacity="${opacity}" style="--node-color:${color};${opacity<.35?'pointer-events:none':''}"><circle class="map-hit" cx="${point.x}" cy="${point.y}" r="${wide>.5?14:19}"/>${!body&&node.status==='Forbidden'?`<circle class="map-restricted-ring" cx="${point.x}" cy="${point.y}" r="${radius+3}"/>`:''}${isSelected?`<circle class="map-selection-ring" cx="${point.x}" cy="${point.y}" r="${radius+8}"/>`:''}<circle class="map-dot" cx="${point.x}" cy="${point.y}" r="${radius}"/>${body&&node.kind!=='star'&&node.art&&opacity>.5&&camera.span<18&&onScreen(point)?`<image href="${escape(node.art)}" x="${point.x-13}" y="${point.y-13}" width="26" height="26" pointer-events="none"/>`:""}${isMarked?`<path class="map-saved-marker" d="M ${point.x-3} ${point.y-12} v -9 h 8 v 5 h -8"/>`:''}${text}</g>`;
    }
    const angle=state.shipAngle*180/Math.PI+90,size=blend(20,16,wide),iconWidth=shipArt?size*Math.min(1,shipArt.ratio):0,iconHeight=shipArt?size*Math.min(1,1/shipArt.ratio):0;
    function shipIcon(point,offscreen=false){return `<g class="map-your-ship ${offscreen?'map-offscreen-ship':''}" transform="translate(${point.x},${point.y})" data-ship-type="${state.shipType}" data-world-x="${state.shipPosition.x}" data-world-y="${state.shipPosition.y}" aria-label="${escape(state.shipName)}, your current ship${offscreen?', outside this view':''}"><circle r="${offscreen?9:blend(11,9,wide)}"/>${shipArt?`<image href="${shipArt.url}" x="${-iconWidth/2}" y="${-iconHeight/2}" width="${iconWidth}" height="${iconHeight}" transform="rotate(${angle})"/>`:'<circle class="map-ship-loading" r="2"/>'}${camera.span<45&&!offscreen?'<text x="15" y="-10">YOU</text>':''}</g>`;}
    markup+=onScreen(ship)?shipIcon(ship):shipIcon({x:clamp(ship.x,18,width-18),y:clamp(ship.y,45,height-legendHeight-48)},true);
    const focused=svg.contains(document.activeElement)?document.activeElement.closest('[data-system]'):null,focusSystem=focused?.dataset.system,focusBody=focused?.dataset.body;
    svg.innerHTML=markup;
    if(focusSystem)svg.querySelector(`[data-system="${focusSystem}"]${focusBody!==undefined?`[data-body="${focusBody}"]`:':not([data-body])'}`)?.focus({preventScroll:true});
    root.querySelector('.map-scale').textContent=`${wide>.92?'All systems':camera.span<20?'Local area':camera.span<100?'Solar system':'Nearby systems'} · ${number(spacing*1000)} units / grid`;
    if(moving)requestDraw();
  }

  root.addEventListener('click', event => {
    const backButton=event.target.closest('[data-map-back]'),viewButton=event.target.closest('[data-map-view]');
    if(backButton){back();return;}if(viewButton){viewButton.dataset.mapView==='galaxy'?showGalaxy():enterSystem();return;}
    const button = event.target.closest('[data-action]');
    if (button && !button.disabled) {
      const action = button.dataset.action;
      if (action === 'close') close();
      else if (action === 'center') centerOnShip();
      else if (action === 'in' || action === 'out') {if(!zoomHeld)zoom(action==='in'?1/1.32:1.32);zoomHeld=false;}
      else if (action === 'marker') { const key=markerID(); if(markers[key])delete markers[key];else markers[key]=true;try{localStorage.setItem(markerKey,JSON.stringify(markers));}catch{}updateInfo();requestDraw(); }
      else travel(action);
    }
  });
  root.addEventListener('pointerdown',event=>{
    if(event.button===0)pcControls();
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(event.button!==0||!['in','out'].includes(action))return;
    stopZoomHold();zoomHeld=false;
    zoomDelay=setTimeout(()=>{zoomHeld=true;zoom(action==='in'?1/1.12:1.12);zoomRepeat=setInterval(()=>zoom(action==='in'?1/1.12:1.12),75);},230);
  });
  addEventListener('pointerup',stopZoomHold);
  addEventListener('pointercancel',stopZoomHold);
  svg.addEventListener('wheel', event => {
    event.preventDefault();
    pcControls();
    const box=svg.getBoundingClientRect();
    zoom(Math.exp(clamp(event.deltaY,-200,200)*.0025),{x:event.clientX-box.left,y:event.clientY-box.top});
  }, {passive:false});
  svg.addEventListener('pointerdown', event => {
    if(event.button!==0)return;
    hover.hidden=true;
    drag={x:event.clientX,y:event.clientY,camera:{...camera},target:event.target.closest('[data-system]'),moved:false};
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    if(!drag){
      const target=event.target.closest('[data-system]');
      if(!target){hover.hidden=true;return;}
      const system=state.nodes.find(node=>node.id===Number(target.dataset.system));
      if(!system){hover.hidden=true;return;}
      const name=target.dataset.body!==undefined?solBodies(Number(target.dataset.system)).find(body=>body.id===Number(target.dataset.body))?.name:systemName(system),welcome=reception(system);
      hover.innerHTML=`<strong>${escape(name)}</strong><span>${escape(welcome.text)}${system.known?` · Standing ${signed(system.prestige)}`:''}</span>${system.status==='Forbidden'?'<small>Restricted space</small>':''}`;
      hover.dataset.tone=welcome.tone;hover.hidden=false;
      const bounds=viewport.getBoundingClientRect();hover.style.left=`${clamp(event.clientX-bounds.left+13,8,Math.max(8,viewport.clientWidth-hover.offsetWidth-8))}px`;hover.style.top=`${clamp(event.clientY-bounds.top+14,8,Math.max(8,viewport.clientHeight-hover.offsetHeight-8))}px`;
      return;
    }
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.hypot(dx,dy)<4&&!drag.moved)return;
    drag.moved=true;followShip=false;cameraFlight=null;
    const view=geometry(drag.camera.span);
    camera={...drag.camera,x:drag.camera.x-dx/view.scaleX,y:drag.camera.y-dy/view.scaleY};
    goal={...camera};requestDraw();
  });
  svg.addEventListener('pointerleave',()=>{hover.hidden=true;});
  svg.addEventListener('pointerup', event => {
    if(!drag)return;
    const {target,moved}=drag;drag=null;
    if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);
    pointerSelection=target&&!moved?{system:target.dataset.system,body:target.dataset.body}:null;
    if(target&&!moved)selectDestination(target.dataset.system,target.dataset.body);
  });
  svg.addEventListener('pointercancel',()=>{drag=null;});
  svg.addEventListener('dblclick', event => {
    // Painting can replace an SVG node between clicks. The browser then sends
    // dblclick to their shared SVG ancestor; retain the actual last selection.
    const target=event.target.closest('[data-system]')?.dataset||pointerSelection;if(!target)return;
    pcControls();selectDestination(target.system,target.body);
    const node=selectedNode();followShip=false;
    goal=selected.body!==undefined?{x:node.x,y:node.y,span:6}:systemAreaView(node);requestDraw();
  });
  svg.addEventListener('keydown', event => {
    const target=event.target.closest('[data-system]');
    if(target&&(event.key==='Enter'||event.key===' ')){event.preventDefault();pcControls();selectDestination(target.dataset.system,target.dataset.body);root.querySelector('[data-action="navigate"]').focus();}
  });
  root.addEventListener('keydown', event => {
    pcControls();
    if(event.key==='Tab'){
      const targets=[...root.querySelectorAll('button:not(:disabled):not([hidden]),[tabindex="0"]')];
      const first=targets[0],last=targets[targets.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }else if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1/1.32);}
    else if(event.key==='-'){event.preventDefault();zoom(1.32);}
    else if(event.code==='Home'){event.preventDefault();centerOnShip();}
  });
  document.addEventListener('keydown',event=>{
    if(root.hidden||event.repeat)return;
    if(event.key==='Escape'||event.code==='KeyM'){
      event.preventDefault();event.stopImmediatePropagation();close();
    }
  },true);
  new ResizeObserver(requestDraw).observe(viewport);
  mapButton.onclick=open;
  window.nativeGalaxyMap={open,close,back,refresh,controller,get isOpen(){return !root.hidden;},inspect:()=>({level,selected:selected?{...selected}:null,camera:{...camera},goal:{...goal},animating:!!cameraFlight,name:state?selectedNode()?.name:null})};
  addEventListener('pagehide',()=>{clearInterval(timer);cancelAnimationFrame(frame);stopZoomHold();});
})();
