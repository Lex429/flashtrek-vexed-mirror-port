/* Player docking controller and Mars outfitting UI. Motion stays in ship-systems. */
(() => {
 'use strict';
 const root=document.createElement('section');root.id='shipyard-services';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Mars Orbital Shipyard');document.querySelector('#game').append(root);
 const ribbon=document.createElement('div');ribbon.id='shipyard-docking-status';ribbon.hidden=true;ribbon.setAttribute('role','status');document.querySelector('#game').append(ribbon);
 const refits=()=>window.nativeShipyardRefits;
 const yard=s=>window.nativeMarsShipyard?.definitionFor(s);
 let bridge=null,tab='upgrades',note='',contact=false,previousFocus=null,profileData=null;
 let selection=null,placement=null,highlight=null,selectedItem=null,selectedBay=null;
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=v=>Math.floor(Number(v)||0).toLocaleString();
 const state=()=>bridge?.getState();
 const dock=s=>s?.shipyardDock&&s.shipyardDock.station===yard(s)?.id?s.shipyardDock:null;
 const center=s=>window.nativeMarsShipyard?.position(s);
 const ready=fetch('../flashtrek-broken-mirror/earth-shipyard-docking-profiles.json').then(r=>{if(!r.ok)throw Error('Docking profiles unavailable');return r.json();}).then(data=>{profileData=data;return true;}).catch(()=>false);
 function plan(s){
  const c=center(s);if(!c)return null;
  const d=window.nativeShipDefinitions.dimensions(s,'player'),source=profileData?.ships.find(p=>p.id===Number(s.shipType));
  const external=source?.kind==='external'||d.width>83||d.height>130,span=yard(s).size;
  const x=c.x+(external?span*.31+d.height*.44+6:(source?.x??.195)*span),y=c.y+(external?0:source?.kind==='compact'?Math.max((source?.y??.14)*span,span*.11+d.height*.20):(source?.y??.14)*span);
  const heading=external?Math.PI:(source?.angle||0)-Math.PI/2;
  const reach=Math.max(105,d.height*1.2);
  return {berth:external?'External service collar':source?.berth||'Lower service berth',reason:external?'Oversized hull: approach the outside collar with the hull clear of the frame.':source?.reason||'Approach beneath the lower frame.',external,x,y,heading,collar:external?{x:c.x+span*.30,y:c.y,noseX:x-d.height*.44}:null,
   entry:{x:x-Math.cos(heading)*reach,y:y-Math.sin(heading)*reach}};
 }
 const save=()=>bridge?.save()||window.nativeSaveStorage.write(state());
 function show(isContact=false){
  const s=state();if(!s)return;previousFocus=document.activeElement;contact=isContact;note='';selection=placement=selectedItem=selectedBay=null;bridge.clearInput();window.nativeShipInventory?.close();window.nativeSystemHub?.close(false);window.nativePlanetEncounter?.close(false);root.hidden=false;render();root.querySelector('button')?.focus({preventScroll:true});
 }
 function close(){root.hidden=true;window.nativeOutfittingView?.stopPreview(root);selection=placement=highlight=null;previousFocus?.focus?.({preventScroll:true});}
 function select(){const s=state();if(!center(s))return false;show(dock(s)?.phase!=='docked');return true;}
 function hit(s,view){const p=window.nativeMarsShipyard?.visible({...view,state:s,w:view.w,h:view.h});return !!p&&Math.abs(view.x-p.x)<=p.size*.47&&Math.abs(view.y-p.y)<=p.size*.45;}
 function begin(){
  const s=state(),p=plan(s);if(!s||!p)return {ok:false,error:'There is no shipyard at this location.'};
  if(dock(s))return {ok:false,error:'A docking operation is already in progress.'};
  if(s.hull<=0||s.phase==='disabled')return {ok:false,error:'Repair the hull before docking.'};
  if(s.localCruise||s.arrivalApproach||s.pendingTransit)return {ok:false,error:'Finish your current approach before docking.'};
  if(window.nativeShipRepairs?.playerDronesDeployed(s))return {ok:false,error:'Recover your deployed Dots before docking.'};
  const pose=window.vexedSolFlight.shipPosition(s);
  if(Math.hypot(pose.x-p.x,pose.y-p.y)>1400)return {ok:false,error:'Fly within 1,400 units of the shipyard to request docking.'};
  const previous={phase:s.phase,landed:s.landed};
  s.shipyardDock={version:1,station:yard(s).id,system:Number(s.system),phase:'approach',step:0,plan:p,startedAt:window.nativeSimulation.seconds(s)};s.landed=false;s.phase='flight';
  const saved=save();if(!saved.ok){delete s.shipyardDock;Object.assign(s,previous);return saved;}
  bridge.clearInput();window.nativeCombatShots.cancel();window.nativeAsteroidCombat?.clear();window.nativeSolEconomy?.clearTarget();window.nativeCivilianTraffic?.clearTarget();close();status(s);return {ok:true};
 }
 function depart(){
  const s=state(),d=dock(s);if(d?.phase!=='docked')return {ok:false,error:'The ship is not docked.'};
  d.phase='departing';d.startedAt=window.nativeSimulation.seconds(s);s.landed=false;s.phase='flight';
  const saved=save();if(!saved.ok){d.phase='docked';s.landed=true;s.phase='docked';return saved;}
  close();bridge.clearInput();status(s);return {ok:true};
 }
 function status(s){
  const d=dock(s);ribbon.hidden=!d||d.phase==='docked';if(ribbon.hidden)return;
  ribbon.innerHTML=`<span class="yard-status-light"></span><span>${d.phase==='departing'?'DEPARTING':d.step===0?'DOCKING APPROACH':'ENTERING SERVICE BERTH'} · ${safe(d.plan.berth)}</span>${d.phase==='approach'?'<button data-yard-cancel type="button">Abort</button>':''}`;
 }
 function abort(){const s=state(),d=dock(s);if(d?.phase!=='approach')return;delete s.shipyardDock;s.phase='flight';s.landed=false;save();status(s);bridge.clearInput();}
 function advance(s,dt){
  const d=dock(s);if(!d)return;
  if(!yard(s)||s.hull<=0||s.phase==='disabled'){delete s.shipyardDock;close();status(s);return;}
  if(d.phase==='docked')return;
  const p=d.plan;if(!p?.entry||!Number.isFinite(p.x)||!Number.isFinite(p.y)){delete s.shipyardDock;status(s);return;}
  if(window.nativeSimulation.seconds(s)-d.startedAt>150){delete s.shipyardDock;s.landed=false;s.phase='flight';save();close();status(s);bridge.clearInput();return;}
  const departing=d.phase==='departing',goal=departing||d.step===0?p.entry:{x:p.x,y:p.y};
  const speed=Math.min(departing?38:d.step===0?105:24,window.nativeShipDefinitions.forEntity(s).movement.maxSpeed),movement={...window.nativeShipMotion.profiles.approach(speed),acceleration:75,braking:110,arrivalRadius:.6,arrivalSpeed:10,snap:true,turnRate:departing?0:Infinity};
  const moved=window.nativeShipSystems.move(s,s,'player',{goal,snap:true},movement,dt);
  if(!moved.arrived)return;
  if(departing){delete s.shipyardDock;s.phase='flight';s.speed=0;save();status(s);bridge.refresh();return;}
  if(d.step===0){d.step=1;status(s);return;}
  // Rotate at rest through the shared controller before engaging the clamps.
  const error=Math.atan2(Math.sin(p.heading-s.angle),Math.cos(p.heading-s.angle));
  if(Math.abs(error)>.025){window.nativeShipSystems.move(s,s,'player',{heading:p.heading,speed:0},{...movement,maxSpeed:0,headingResponse:8},dt);return;}
  d.phase='docked';s.phase='docked';s.landed=true;s.speed=0;s.vx=s.vy=0;save();status(s);show(false);bridge.refresh();
 }
 function restore(){const s=state(),d=s?.shipyardDock;close();status(s);if(!d)return;if(dock(s)!==d||d.version!==1||!d.plan?.entry||!['approach','docked','departing'].includes(d.phase)){delete s.shipyardDock;s.landed=false;status(s);return;}if(d.phase==='docked'){s.landed=true;show(false);}}
 function appearance(s){
  const d=dock(s);if(!d)return {};
  const now=window.nativeSimulation.seconds(s),t=Math.max(0,Math.min(1,(now-d.startedAt)/1.5));
  return d.phase==='docked'?{lights:false,lightGain:0}:d.phase==='departing'?{lights:t>.2,lightGain:2.8*Math.floor(t*4)/4}:d.step>0?{lights:true,lightGain:.9}:{};
 }
 function revealPlacement(){const pane=root.querySelector('.yard-vessel'),target=root.querySelector('.outfit-ghost');if(!pane||!target)return;const p=pane.getBoundingClientRect(),t=target.getBoundingClientRect();if(t.bottom>p.bottom-10)pane.scrollTop+=t.bottom-p.bottom+12;}
 function render(){
  const s=state();if(!s||!yard(s))return;
  const y=yard(s);root.setAttribute('aria-label',y.name);
  const b=refits().budget(s),ship=window.nativeShipDefinitions.forEntity(s),v=window.nativeOutfittingView,p=plan(s);
  const tabs=[['upgrades','Ship Upgrades'],['weapons','Weapons'],['shields','Shields'],['materials','Materials'],['build','Current Build']];
  const scroll=root.querySelector('.yard-catalog')?.scrollTop||0;
  const content=contact?`<div class="yard-contact"><img src="../flashtrek-broken-mirror/showcase-assets/structures/280-game-lit.png" alt="${safe(y.name)}"><div><p class="yard-eyebrow">${safe(y.faction)} &middot; ${safe(y.location)}</p><h2>Bring your ship in.</h2><p>Upgrade your hull, fit compatible weapons and configure your deflectors.</p><p><strong>${safe(p?.berth)}</strong><br>${safe(p?.reason)}</p><button type="button" class="yard-primary" data-yard-action="dock">Request docking</button><p class="yard-muted">Your ship will approach beneath the station frame. Services unlock when the docking clamps engage.</p></div></div>`:window.nativeShipyardOutfitting.render(s,{tab,selection,placement,highlight,selectedItem,selectedBay});
  root.dataset.visual=String(!contact);
  root.innerHTML=`<header><div><p class="yard-eyebrow">${safe(y.faction)} &middot; ${safe(y.location)}</p><h1>${safe(y.name)}</h1></div><div class="yard-header-actions"><button data-yard-action="lighting" aria-pressed="${window.nativeFlightLightingEnabled!==false}" title="Toggle flight and station lighting">Lights ${window.nativeFlightLightingEnabled===false?'off':'on'}</button><button data-yard-action="close" class="yard-close" aria-label="Close shipyard">&times;</button></div></header><div class="yard-account">${v.material('latinum',s.latinum,{owned:true})}${v.material('dilithium',s.dilithium,{owned:true})}<span class="yard-budget">REFIT <strong>${b.used} / ${b.total}</strong> <small>${safe(b.className)} hull</small></span></div>${contact?'':`<nav aria-label="Shipyard services">${tabs.map(([key,label])=>`<button data-yard-tab="${key}" aria-current="${tab===key?'page':'false'}">${label}</button>`).join('')}</nav>`}<main>${content}</main><footer><p role="status" class="yard-note">${safe(note||`${s.shipName||ship.name} \u00b7 ${contact?'Docking clearance available':dock(s)?.plan.berth||'Service berth'}`)}</p>${contact?'':`<button data-yard-action="undock" class="yard-primary">Undock</button>`}</footer>`;
  const catalog=root.querySelector('.yard-catalog');if(catalog)catalog.scrollTop=scroll;
  if(!contact)v.preview(root,s,ship);else v.stopPreview(root);
 }
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  const s=state(),r=refits();
  if(button.dataset.yardTab){tab=button.dataset.yardTab;selection=placement=selectedItem=selectedBay=null;note='';render();root.querySelector(`[data-yard-tab="${tab}"]`)?.focus();return;}
  if(button.hasAttribute('data-place-bay')&&selection){
   const pending=window.nativeShipyardOutfitting.draft(s,r.preview(s,selection),placement);
   if(!pending||pending.zone!==button.dataset.bayZone)return;
   placement={cell:Number(button.dataset.placeBay),zone:pending.zone};note='Position selected. Review the cost, then buy and place the bay.';render();revealPlacement();root.querySelector('.outfit-ghost')?.focus({preventScroll:true});return;
  }
  const action=button.dataset.yardAction;let result;
  if(button.dataset.equipmentPlace==='slot'){
   if(selection){note='Choose an unused highlighted mount for the new bay.';render();return;}
   const category=button.dataset.equipmentKind,index=Number(button.dataset.equipmentIndex);
   if(selectedItem){
    if(s.shipEquipment.instances[selectedItem]?.category!==category){note='Choose a compatible bay highlighted on your ship.';render();return;}
    result=r.fit(s,selectedItem,index,save);if(result.ok)selectedItem=null;
   }else{tab='build';selectedBay={category,index};note='';render();return;}
  }
  else if(action==='lighting'){window.nativeFlightLightingEnabled=window.nativeFlightLightingEnabled===false;render();root.querySelector('[data-yard-action="lighting"]')?.focus();return;}
  else if(action==='close'){close();return;}
  else if(action==='dock')result=begin();
  else if(action==='undock')result=depart();
  else if(action==='upgrade'){
   selection=button.dataset.kind;placement=selectedItem=selectedBay=null;note='Preview only. Your resources have not been charged.';render();const catalog=root.querySelector('.yard-catalog');if(catalog)catalog.scrollTop=0;revealPlacement();root.querySelector('[data-yard-action="cancel-preview"]')?.focus({preventScroll:true});return;
  }
  else if(action==='cancel-preview'){selection=placement=null;note='Upgrade preview cancelled. No resources spent.';render();return;}
  else if(action==='confirm-upgrade'&&selection){
   const pending=r.preview(s,selection);if(pending.newBay&&!placement){note='Choose the new bay position before purchasing.';render();return;}
   result=r.upgrade(s,selection,save,placement);if(result.ok){highlight=pending.newBay;selection=placement=null;}
  }
  else if(action==='remove'){result=r.remove(s,button.dataset.kind,save);if(result.ok)selection=placement=highlight=null;}
  else if(action==='buy')result=r.buy(s,button.dataset.model,save);
  else if(action==='choose-equipment'){selectedItem=button.dataset.instance;selectedBay=null;note='Choose a compatible bay highlighted on your ship.';render();return;}
  else if(action==='fit'){const id=button.dataset.instance,select=[...root.querySelectorAll('[data-yard-slot]')].find(n=>n.dataset.yardSlot===id);result=r.fit(s,id,Number(select?.value),save);if(result.ok)selectedItem=null;}
  else if(action==='unfit'){result=r.unfit(s,button.dataset.kind,Number(button.dataset.slot),save);if(result.ok)selectedBay=null;}
  if(result){note=result.message||result.error||'Build updated.';bridge.refresh();if(!root.hidden){render();root.querySelector(`[data-yard-tab="${tab}"]`)?.focus();}}
 });
 ribbon.addEventListener('click',event=>{if(event.target.closest('[data-yard-cancel]'))abort();});
 root.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  if(event.key==='Tab'){const nodes=[...root.querySelectorAll('button:not(:disabled),select')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
 });
 window.addEventListener('keydown',event=>{if(!root.hidden&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},true);
 window.nativeShipyardServices=Object.freeze({attach:api=>bridge=api,ready,plan,hit,select,begin,depart,abort,advance,restore,appearance,close,render,
  get active(){return !root.hidden;},get busy(){return !root.hidden||!!dock(state());},get docked(){return dock(state())?.phase==='docked';},snapshot:()=>({open:!root.hidden,tab,dock:dock(state())})});
})();
