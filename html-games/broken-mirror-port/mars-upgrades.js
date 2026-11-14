/* Inline Mars upgrade cards. Shared owners supply tiers, previews and settlement. */
(() => {
 'use strict';
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
 const labels={
  cargo:['More cargo space','Cargo','t'],hull:['Stronger hull','Hull',''],shield:['Stronger shields','Shields',''],
  engine:['Faster impulse engines','Speed',''],thrusters:['Better maneuvering','Emergency speed',''],
  drive:['Faster warp travel','Warp','×'],weapon:['Extra weapon bay','Weapon bays',''],
  dot:['Extra repair Dot bay','Dot bays',''],utility:['Extra ability bay','Ability bays','']
 };
 const stats=[['hull','HULL','hull'],['shield','SHIELDS','shields'],['cargo','CARGO','cargo'],['engine','SPEED','speedOrOtherStationValue']];
 const view=()=>window.nativeOutfittingView,refits=()=>window.nativeShipyardRefits;
 const quote=(s,kind)=>kind==='thrusters'?window.nativeShipThrusters.quote(s):refits().quote(s,kind);
 function costs(s,q){return [['latinum',q.price],...Object.entries(q.materials||{})].map(([key,amount])=>({key,amount,held:key==='latinum'?Math.floor(Number(s.latinum)||0):window.nativeRegionalMinerals.held(s,key)}));}
 const shortNames={cargo:'Cargo',hull:'Hull',shield:'Shields',engine:'Impulse engines',thrusters:'Thrusters',drive:'Warp drive',weapon:'Weapon bays',dot:'Repair Dot bays',utility:'Ability bays'};
 function info(s,kind){
  const q=quote(s,kind),full=q.level>=q.max,p=kind==='thrusters'?null:refits().preview(s,kind);
  const c=kind==='thrusters'?{before:q.before.maxSpeed,after:q.after.maxSpeed}:window.nativeShipyardOutfitting.change(p,kind);
  const items=costs(s,q),missing=items.filter(i=>i.held<i.amount);
  return {q,p,full,c,items,missing,after:full?c.before:c.after,available:q.allowed&&!missing.length&&(kind!=='thrusters'||s.hull>0&&s.phase!=='destroyed')};
 }
 function tierMeter(q){
  return `<span class="mars-tier-meter" data-tier-level="${q.level}" data-tier-max="${q.max}" role="img" aria-label="${q.level} of ${q.max} upgrade tiers installed"><span class="mars-tier-bars" aria-hidden="true">${Array.from({length:q.max},(_,i)=>`<i class="mars-tier-bar${i<q.level?' installed':''}"></i>`).join('')}</span></span>`;
 }
 const compact=n=>n>=1000000?Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:2}).format(n):fmt(n);
 function requirements(s,q,full){
  const items=costs(s,q);
  const rows=items.map(({key,amount,held})=>{
   const shortage=Math.max(0,amount-held),material=view().minerals[key]?.name||key;
   return `<tr class="${shortage?'short':'ready'}" data-upgrade-cost="${key}" data-cost="${amount}" data-held="${held}" data-shortage="${shortage}" aria-label="${safe(material)}. Need ${fmt(amount)}. Have ${fmt(held)}.${shortage?' Need '+fmt(shortage)+' more.':' Ready.'}">
    <th scope="row">${view().mineralIcon(key)}<span>${safe(material)}</span></th>
    <td class="mars-shop-need"><b>${fmt(amount)}</b><small class="${shortage?'mars-resource-shortage':'mars-shop-covered'}">${shortage?'Need '+fmt(shortage)+' more':'Covered'}</small></td>
    <td class="mars-shop-have"><b title="${safe(fmt(held))}" data-full-amount="${safe(fmt(held))}">${held>=amount?compact(held):fmt(held)}</b><small>${shortage?'Collect more':'&#10003; Ready'}</small></td>
   </tr>`;
  }).join('');
  return `<div class="mars-shop-requirements">${full?'<div class="mars-shop-max"><span aria-hidden="true">&#10003;</span> Every upgrade installed.</div>':`<table class="mars-shop-costs"><thead><tr><th scope="col">Resources</th><th scope="col">NEED</th><th scope="col">HAVE</th></tr></thead><tbody>${rows}</tbody></table>`}</div>`;
 }
 function card(s,kind,selection){
  const {q,p,full,c,after,items,missing,available}=info(s,kind),[name,,unit]=labels[kind],selected=selection===kind;

  return `<article class="yard-offer mars-upgrade-choice mars-shop-card${full?' maxed':''}${selected?' positioning':''}" data-upgrade-card="${kind}" data-affordable="${available}" style="--shop-cost-rows:${items.length}" tabindex="0" role="listitem" aria-label="${safe(name)}. ${q.level} of ${q.max} upgrades installed.">
   <div class="mars-shop-heading"><span class="mars-shop-icon" aria-hidden="true">${view().icon(kind)}</span><h2>${safe(name)}</h2>${tierMeter(q)}</div>
   <div class="mars-shop-change" data-upgrade-change="${kind}"><span>${fmt(c.before)}${safe(unit)}</span>${full?'<small>Fully upgraded</small>':`<i aria-hidden="true">&#8594;</i><strong>${fmt(after)}${safe(unit)}</strong>`}</div>
   ${requirements(s,q,full)}
   <div class="mars-shop-actions"><button type="button" class="mars-shop-remove" data-yard-action="remove" data-kind="${kind}" title="Remove one installed upgrade. No refund." aria-label="Remove one ${safe(shortNames[kind])} upgrade. No refund." ${q.level&&kind!=='thrusters'?'':'disabled aria-hidden="true"'}>Remove</button>
    ${p?.newBay&&!full?`<button type="button" class="mars-shop-position" data-yard-action="${selected?'cancel-preview':'upgrade'}" data-kind="${kind}" aria-pressed="${selected}">${selected?'Cancel position':'Choose position'}</button>`:`<span class="mars-shop-status">${full?'Complete':missing.length?'Missing resources':'Ready to install'}</span>`}
    <button type="button" class="yard-primary mars-shop-buy" data-yard-action="buy-upgrade" data-kind="${kind}" ${available?'':'disabled'}>${full?'Fully upgraded':'Buy & install'}<span aria-hidden="true">&#8599;</span></button>
   </div>${['weapon','dot','utility'].includes(kind)?`<p class="mars-shop-bay-note">${full?'All additional bays installed.':'Adds an empty bay. Equipment sold separately.'}</p>`:''}
  </article>`;
 }
 function weaponCard(s,entry){
  const q=refits().weaponQuote(s,entry.instance.id);if(!q)return '';
  const full=!q.allowed,items=costs(s,q),missing=items.some(row=>row.held<row.amount),available=!full&&!missing;
  const kind='equipment:'+entry.instance.id,ship=window.nativeShipDefinitions.forEntity(s),visual=window.nativeCombatShots.weaponVisual(q.before);
  const before=window.nativeWeaponRules.weaponSpec(q.before,visual.kind,{damageMultiplier:ship.weaponDamageMultiplier||1}),after=window.nativeWeaponRules.weaponSpec(q.after,visual.kind,{damageMultiplier:ship.weaponDamageMultiplier||1});
  const location=entry.slot>=0?'Weapon bay '+(entry.slot+1):'Stored in Inventory';
  return `<article class="yard-offer mars-shop-card mars-owned-weapon${full?' maxed':''}" data-upgrade-card="${safe(kind)}" data-weapon-instance="${safe(entry.instance.id)}" data-affordable="${available}" style="--shop-cost-rows:${items.length}" tabindex="0" role="listitem" aria-label="${safe(q.before.name)}. ${safe(location)}. ${q.level} of 3 weapon stages installed.">
   <div class="mars-shop-heading"><span class="mars-shop-icon" aria-hidden="true">${view().art(q.before)}</span><h2>${safe(q.before.name)}</h2>${tierMeter(q)}</div>
   <div class="mars-weapon-meta"><span>${safe(location)}</span><span>${full?'Current: X':'Next: '+window.nativeWeaponGrades.names[q.level]}</span></div>
   <div class="mars-shop-change"><span>${fmt(before.recharge)}s</span>${full?'<small>Fully upgraded</small>':`<i aria-hidden="true">&#8594;</i><strong>${fmt(after.recharge)}s</strong><small>Recharge</small>`}</div>
   <p class="mars-weapon-spec">${fmt(before.damage)} damage &#183; ${fmt(before.range)} range &#183; ${q.before.power||1} power</p>
   ${requirements(s,q,full)}
   <div class="mars-shop-actions mars-weapon-actions"><span class="mars-shop-status">${full?'Complete':missing?'Missing resources':'Ready to upgrade'}</span><button type="button" class="yard-primary mars-shop-buy" data-yard-action="upgrade-owned-weapon" data-instance="${safe(entry.instance.id)}" ${available?'':'disabled'}>${full?'Fully upgraded':'Upgrade weapon'}<span aria-hidden="true">&#8599;</span></button></div>
  </article>`;
 }
 function ownedSection(s,owned=window.nativeShipEquipment.ownedWeapons(s)){
  return `<section class="mars-owned-section" data-upgrade-section="weapons" aria-label="Your weapons"><div class="mars-owned-heading"><h2>Your weapons <small>${owned.length}</small></h2><button type="button" data-yard-jump="ship">Ship upgrades &#8593;</button></div><p class="mars-owned-intro">Upgrade each weapon you own. I &#8594; V &#8594; X improves recharge.</p><div class="mars-shop-list" role="list" aria-label="Owned weapon upgrades">${owned.length?owned.map(entry=>weaponCard(s,entry)).join(''):'<p class="mars-no-weapons">Your weapons will appear here after you buy one in Weapons.</p>'}</div></section>`;
 }
 function statHtml(s,kind=null){
  const ship=window.nativeShipDefinitions.forEntity(s),q=kind&&quote(s,kind),after=q&&q.level<q.max&&kind!=='thrusters'?refits().preview(s,kind).after:ship;
  return stats.map(([key,label,field])=>{
   const before=ship[field]||0,next=after[field]||0,changed=Math.abs(next-before)>.0001,unit=key==='cargo'?' t':'';
   return `<span data-ship-stat="${key}" class="${changed?'previewing':''}" title="${key==='cargo'?'Maximum cargo capacity':key==='engine'?'Maximum normal flight speed':label}"><small>${label}</small><strong><b>${fmt(before)}${unit}</b>${changed?`<i>&#8594; ${fmt(next)}${unit}</i>`:''}</strong></span>`;
  }).join('');
 }
 function previewStats(root,s,kind=null){
  const panel=root.querySelector('.yard-build-stats');if(!panel)return;
  const next=kind&&Object.hasOwn(labels,kind)?kind:null;
  if(panel.dataset.previewKind===(next||''))return;
  panel.dataset.previewKind=next||'';panel.innerHTML=statHtml(s,next);
  root.querySelectorAll('[data-upgrade-card]').forEach(card=>card.classList.toggle('previewing',card.dataset.upgradeCard===next));
 }
 function catalog(s,{selection=null}={}){
  const owned=window.nativeShipEquipment.ownedWeapons(s);
  return `<div class="mars-upgrade-shop"><div class="mars-upgrade-jumps" role="navigation" aria-label="Upgrade sections"><button type="button" data-yard-jump="ship">Ship upgrades</button><button type="button" data-yard-jump="weapons">Your weapons <b>${owned.length}</b> &#8595;</button></div><div data-upgrade-section="ship"><p class="mars-shop-intro">Upgrade your ship. <span>Compare what you need with what you have.</span></p><div class="mars-shop-list" role="list" aria-label="Ship upgrades">${Object.keys(labels).map(kind=>card(s,kind,selection)).join('')}</div></div>${ownedSection(s,owned)}</div>`;
 }
 window.nativeMarsUpgrades=Object.freeze({catalog,ownedSection,statHtml,previewStats});
})();
