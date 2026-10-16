/* Original Vexed Mirror map presentation, connected to native-navigation.js. */
(()=>{
'use strict';
const mapButton=document.getElementById('mapBtn');
const galaxyMap=document.createElement('section');galaxyMap.id='galaxy-map';galaxyMap.hidden=true;galaxyMap.setAttribute('role','dialog');galaxyMap.setAttribute('aria-modal','true');galaxyMap.setAttribute('aria-label','Interstellar navigation');game.appendChild(galaxyMap);
let mapSelected=0,mapState,mapMessage='',mapTimer,mapReturnFocus;
const mapEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mapNumber=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1});
const mapFactions={1:{icon:2,color:'#e999aa'},2:{icon:3,color:'#ef775f'},3:{icon:7,color:'#c08aed'},4:{color:'#e8c480'},5:{icon:6,color:'#81c8e9'},6:{icon:5,color:'#89df73'},7:{icon:4,color:'#deb069'},8:{color:'#8aa5f1'},12:{icon:1,color:'#a4c9d4'},14:{icon:8,color:'#93dc59'},16:{color:'#79e8d2'}};
const mapStandings={'Hostile':{color:'#ff0000',label:'Hostile'},'Allied':{color:'#4ab3ff',label:'Allied'},'Your territory':{color:'#0fff0f',label:'Owned'},'Neutral':{color:'#cacaca',label:'Neutral'},'Forbidden':{color:'#ffed15',label:'Forbidden / restricted'},'Uninhabited':{color:'#eda91d',label:'Uninhabited'},'Unknown':{color:'#858585',label:'Unexplored'}};
function mapRelation(standing){return mapStandings[standing]||mapStandings.Unknown;}
function mapCall(action,value=0){return window.nativeNavigation.call(action,value);}
function openGalaxyMap(){if(!window.nativeNavigation.active)return;const result=mapCall('open');if(!result.ok)return;mapReturnFocus=document.activeElement;galaxyMap.hidden=false;mapSelected=mapCall('state')?.manualTargetSystem||0;mapMessage='';refreshGalaxyMap();clearInterval(mapTimer);mapTimer=setInterval(refreshGalaxyMap,2500);galaxyMap.querySelector('.map-close')?.focus();}
function closeGalaxyMap(focus=true){galaxyMap.hidden=true;clearInterval(mapTimer);mapTimer=undefined;mapCall('close');if(focus)(mapReturnFocus?.isConnected?mapReturnFocus:mapButton).focus({preventScroll:true});}
mapButton.onclick=openGalaxyMap;
document.addEventListener('keydown',event=>{if(galaxyMap.hidden)return;if(event.key==='Escape'){event.preventDefault();closeGalaxyMap();}});
function mapSelect(id){mapSelected=Number(id);mapMessage='';refreshGalaxyMap();}
function mapChart(state){
 const nodes=state.nodes,find=id=>nodes.find(n=>n.id===id),ship=state.shipPosition,xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);
 if(ship){xs.push(ship.x);ys.push(ship.y);}
 const minX=Math.min(...xs)-28,minY=Math.min(...ys)-24,w=Math.max(...xs)-minX+40,h=Math.max(...ys)-minY+30;
 const current=find(state.current),selected=find(state.selected.id);
 let stars='';for(let i=0;i<65;i++){const x=minX+(i*137.43%w),y=minY+(i*83.71%h);stars+=`<circle cx="${x}" cy="${y}" r="${i%9===0?.7:.35}" opacity="${.12+(i%4)*.08}"/>`;}
 return `<svg class="map-chart" viewBox="${minX} ${minY} ${w} ${h}" role="group" aria-label="Systems and surveyed cargo routes"><defs><pattern id="map-coordinates" width="35" height="35" patternUnits="userSpaceOnUse"><path d="M 35 0 L 0 0 0 35" fill="none" stroke="#6fb1c1" stroke-width=".35" opacity=".13"/></pattern><filter id="map-glow"><feGaussianBlur stdDeviation="1.2"/></filter></defs><rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="url(#map-coordinates)"/><g fill="#d2f3ff" aria-hidden="true">${stars}</g>
 <g class="map-route-lines">${state.routes.map(r=>{const a=find(r.a),b=find(r.b);return a&&b?`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${r.suspended?'map-suspended':'map-active-route'}"><title>${mapEscape(r.label)} · ${r.suspended?'Suspended':'Active'}</title></line>`:'';}).join('')}</g>
 ${ship&&selected&&state.manualTargetSystem?`<line class="map-course-preview" x1="${ship.x}" y1="${ship.y}" x2="${selected.x}" y2="${selected.y}"/>`:current&&selected&&current.id!==selected.id?`<line class="map-course-preview" x1="${current.x}" y1="${current.y}" x2="${selected.x}" y2="${selected.y}"/>`:''}
 ${nodes.map(n=>{const relationship=mapRelation(n.status),color=relationship.color,selected=n.id===state.selected.id;return `<g class="map-node ${n.known?'map-discovered':'map-unknown'} ${n.current?'map-current':''} ${selected?'map-selected':''}" data-system="${n.id}" role="button" tabindex="0" aria-label="${mapEscape(n.name)}${n.current?', current location':''}, ${mapEscape(relationship.label)}" aria-pressed="${selected}" style="--system-color:${color};--standing-color:${relationship.color}"><title>${mapEscape(n.name)} · ${mapEscape(relationship.label)}</title><circle class="map-hit" cx="${n.x}" cy="${n.y}" r="12"/><circle class="map-halo" cx="${n.x}" cy="${n.y}" r="8"/>${n.known?`<circle class="map-standing-ring" cx="${n.x}" cy="${n.y}" r="6.5"/>`:''}<circle class="map-contact" cx="${n.x}" cy="${n.y}" r="${n.known?4:3}"/>${n.current?`<path class="map-location" d="M ${n.x-4} ${n.y-12} L ${n.x} ${n.y-7} L ${n.x+4} ${n.y-12}"/>`:''}${n.known||selected?`<text class="map-label" x="${n.x+9}" y="${n.y+3}">${mapEscape(n.known?n.name:'S-'+String(n.id).padStart(3,'0'))}</text>`:''}</g>`;}).join('')}${ship?`<g class="map-ship-position" aria-label="Your live position"><title>Your ship</title><circle cx="${ship.x}" cy="${ship.y}" r="5"/><path d="M ${ship.x} ${ship.y-3} L ${ship.x+2.5} ${ship.y+2} L ${ship.x-2.5} ${ship.y+2} Z"/></g>`:''}${mapFleetMarkers(state,find)}</svg>`;
}
function mapFleetMarkers(state,find){return state.nodes.filter(n=>(state.fleet||[]).some(s=>s.system===n.id)).map(n=>{const ships=state.fleet.filter(s=>s.system===n.id);return `<g class="map-fleet-marker" aria-label="${ships.length} fleet ships at ${mapEscape(n.name)}"><title>${ships.length} of your fleet ships at ${mapEscape(n.name)}</title><path d="M ${n.x-11} ${n.y-3} l -4 8 h 8 z"/><text x="${n.x-15}" y="${n.y+13}">${ships.length}</text></g>`;}).join('');}
function mapDetails(state){
 const s=state.selected,faction=mapFactions[s.government],relationship=mapRelation(s.standing),icon=s.known&&faction?.icon?`<img src="${"startup/factions/faction-"+faction.icon+".png"}" alt="${mapEscape(s.governmentName)} emblem">`:`<span class="map-unidentified">${s.known?mapEscape(s.governmentName.split(' ').map(w=>w[0]).join('').slice(0,3)):'?'}</span>`;
 const fleet=(state.fleet||[]).filter(ship=>ship.system===s.id),fleetMarkup=fleet.length?`<div class="map-deliveries map-fleet-list"><h4>Your fleet in this system · ${fleet.length}</h4>${fleet.map(ship=>`<p>${mapEscape(ship.name)}</p>`).join('')}</div>`:'';
 const deliveries=s.deliveries.length?`<div class="map-deliveries"><h4>Cargo aboard for this system</h4>${s.deliveries.map(d=>`<p><b>${mapNumber(d.tons)} t · ${mapEscape(d.name)}</b><span>${mapNumber(d.payment)} latinum on delivery</span></p>`).join('')}</div>`:'';
 return `<div class="map-faction-display" style="--faction-glow:${s.known?(faction?.color||'#96c6d6'):'#688495'}"><div class="map-system-emblem">${icon}</div><span>${mapEscape(s.governmentName)}</span></div><div class="map-system-title"><div><p class="map-kicker">${s.id===state.current?'CURRENT LOCATION':s.known?'SURVEYED SYSTEM':'UNEXPLORED CONTACT'}</p><h3>${mapEscape(s.name)}</h3></div></div>
 <dl class="map-intel"><div><dt>Government</dt><dd>${mapEscape(s.governmentName)}</dd></div><div><dt>Your standing</dt><dd><span class="map-standing-badge" style="--standing-color:${relationship.color}">${mapEscape(relationship.label)}</span></dd></div><div><dt>Population</dt><dd ${s.known?`data-population-count data-population-value="${Math.max(0,s.population)}"`:''}>${s.known?mapNumber(Math.max(0,s.population)):'Unknown'}</dd></div><div><dt>System strength</dt><dd>${s.known?mapNumber(s.strength):'Unknown'}</dd></div><div><dt>Map status</dt><dd><span class="map-standing-badge" style="--standing-color:${mapRelation(s.status).color}">${mapEscape(mapRelation(s.status).label)}</span></dd></div><div><dt>Survey</dt><dd>${s.known?'Visited':'Unknown'}</dd></div></dl>
 <div class="map-journey"><h4>Journey preview</h4><div><span>Manual distance</span><b>${mapNumber(s.manualDistance)} u</b></div><div><span>Manual flight at full speed</span><b>~${Math.max(1,Math.ceil(s.manualSeconds/60))} min</b></div><div><span>Warp travel time</span><b>${s.days<0?'Unavailable':mapNumber(s.days)+' days'}</b></div><div><span>Antimatter used by warp</span><b>${s.fuel<0?'Unavailable':mapNumber(s.fuel)+' t'}</b></div><div><span>Antimatter aboard</span><b>${state.devMode?'∞':mapNumber(state.fuel)} t</b></div></div>
 ${fleetMarkup}${deliveries}<p class="map-description">${mapEscape(s.description)}</p><p class="map-selection-note">${mapEscape(mapMessage||(s.error?`${s.error} Manual flight is available.`:s.known?'Ready to travel.':'Travel here to reveal this system.'))}</p>`;
}
function refreshGalaxyMap(){
 if(galaxyMap.hidden)return;const previousId=mapSelected,previousCount=galaxyMap.querySelector('[data-population-count]')?.dataset.populationValue;const state=mapCall('state',mapSelected);if(!state?.ok){closeGalaxyMap();return;}mapState=state;mapSelected=state.selected.id;
 const scroll=galaxyMap.querySelector('.map-detail')?.scrollTop||0,focus=document.activeElement,focusID=focus?.closest('[data-system]')?.dataset.system,focusClass=galaxyMap.contains(focus)?focus.className:null;
 galaxyMap.innerHTML=`<div class="map-top"><div><p class="map-kicker">STELLAR CARTOGRAPHY</p><h2>Interstellar map</h2></div><div class="map-exploration"><b>${state.discovered} / ${state.total}</b><span>systems surveyed</span></div><button type="button" class="map-close">Return to flight ×</button></div>
 <div class="map-body"><div class="map-space"><div class="map-position"><span class="map-position-light"></span>${mapEscape(state.currentName)}<small>Current system</small></div>${mapChart(state)}<div class="map-legend"><div class="map-legend-row map-relationship-legend" aria-label="Original map colors"><b>Original map colors</b>${Object.values(mapStandings).map(s=>`<span><i style="background:${s.color};border-color:${s.color}"></i>${mapEscape(s.label)}</span>`).join('')}</div><div class="map-legend-row"><span><i class="map-legend-current"></i>Current system</span><span><i class="map-legend-ship"></i>Your ship</span><span><i class="map-legend-route"></i>Active route</span><span><i class="map-legend-suspended"></i>Suspended</span><span class="map-fleet-key">▲ Your fleet</span><small>System colors = original map status</small></div></div></div><aside class="map-detail" aria-label="Selected system">${mapDetails(state)}</aside></div>
 <div class="map-bottom"><p>Select a system to track for manual flight or travel by warp.<br><span>Manual flight uses your ship's normal controls and takes real time.</span></p><div class="map-actions"><button type="button" class="map-track-flight">Track for manual flight</button><button type="button" class="map-set-course" ${state.selected.canTravel?'':'disabled'}>Warp →</button></div></div>`;
 if(previousId===mapSelected&&previousCount!==undefined){const label=galaxyMap.querySelector('[data-population-count]');if(label&&Number(previousCount)!==Number(label.dataset.populationValue)){const next=Number(label.dataset.populationValue);label.dataset.populationValue=previousCount;label.textContent=mapNumber(previousCount);window.nativePopulation.animateDisplay(label,next);}}
 galaxyMap.querySelector('.map-close').onclick=()=>closeGalaxyMap();
 galaxyMap.querySelectorAll('[data-system]').forEach(node=>{node.onclick=()=>mapSelect(node.dataset.system);node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();mapSelect(node.dataset.system);}};});
 galaxyMap.querySelector('.map-track-flight').onclick=()=>{
  const result=mapCall('track',mapSelected);
  if(result?.ok)closeGalaxyMap(false);
  else{mapMessage=result?.error||'Unable to track this system.';refreshGalaxyMap();}
 };
 galaxyMap.querySelector('.map-set-course').onclick=()=>{
  const destination=mapSelected;
  closeGalaxyMap(false);
  // Paint the flight view with the map closed before starting departure.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const result=mapCall('course',destination);
   if(!result?.ok){openGalaxyMap();mapSelected=destination;mapMessage=result?.error||'Unable to set course.';refreshGalaxyMap();}
  }));
 };
 galaxyMap.querySelector('.map-detail').scrollTop=scroll;
 if(focusID)galaxyMap.querySelector(`[data-system="${focusID}"]`)?.focus();else if(typeof focusClass==='string'&&['map-close','map-set-course','map-track-flight'].includes(focusClass))galaxyMap.querySelector('.'+focusClass)?.focus();
}

window.nativeGalaxyMap={open:openGalaxyMap,close:closeGalaxyMap,refresh:refreshGalaxyMap,get isOpen(){return !galaxyMap.hidden;}};
galaxyMap.addEventListener('keydown',event=>{
 if(event.key!=='Tab')return;
 const targets=Array.from(galaxyMap.querySelectorAll('button:not(:disabled),[tabindex="0"]'));
 const first=targets[0],last=targets[targets.length-1];
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
addEventListener('pagehide',()=>clearInterval(mapTimer));

})();
