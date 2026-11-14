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
 const materialLayouts=new WeakMap();
 let materialText=null;
 function releaseMaterials(root){const layout=materialLayouts.get(root);layout?.observer?.disconnect();materialLayouts.delete(root);}
 function fitMaterials(root){
  const grid=root.querySelector('.mars-resource-grid');
  if(root.hidden||!grid?.clientWidth)return;
  const tiles=[...grid.querySelectorAll('.mars-resource-tile')];if(!tiles.length)return;
  const height=Math.min(...tiles.map(tile=>tile.clientHeight));
  grid.dataset.materialDensity=height<105?'tight':height<140?'compact':'regular';
  materialText||=document.createElement('canvas').getContext('2d');if(!materialText)return;
  const first=tiles[0].querySelector('.mars-resource-have b'),font=getComputedStyle(first),css=getComputedStyle(grid);
  materialText.font=`${font.fontWeight} 100px ${font.fontFamily}`;
  const digit=Math.max(...'0123456789'.split('').map(c=>materialText.measureText(c).width))/100;
  const em=text=>[...text].reduce((n,c)=>n+(/[0-9]/.test(c)?digit:materialText.measureText(c).width/100),0);
  const cap=parseFloat(css.getPropertyValue('--material-number-cap'))||24;
  for(const tile of tiles){
   const node=tile.querySelector('.mars-resource-have b'),held=Number(tile.dataset.held);
   node.textContent=held>=1000000&&held>=Number(tile.dataset.cost)?Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:2}).format(held):node.dataset.fullAmount;
   node.title=node.dataset.fullAmount;
  }
  let size=cap;
  for(const tile of tiles){
   const rows=getComputedStyle(tile).gridTemplateRows.split(/\s+/).map(parseFloat);
   for(const node of tile.querySelectorAll('.mars-resource-ratio b')){
    const column=getComputedStyle(node.parentElement),label=getComputedStyle(node.previousElementSibling);
    const insets=['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((n,key)=>n+(parseFloat(column[key])||0),0);
    size=Math.min(size,(node.clientWidth-2)/Math.max(.01,em(node.textContent)),(rows[1]-insets-parseFloat(label.lineHeight)-(parseFloat(label.marginBottom)||0)-2)/1.2);
   }
  }
  grid.style.setProperty('--material-number-size',Math.max(12,Math.floor(size*10)/10)+'px');
 }
 function layoutMaterials(root){
  const grid=root.querySelector('.mars-resource-grid'),previous=materialLayouts.get(root);
  if(!grid){releaseMaterials(root);return;}
  if(previous?.grid!==grid){
   releaseMaterials(root);
   const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>fitMaterials(root)):null;
   materialLayouts.set(root,{grid,observer});observer?.observe(grid);
  }
  fitMaterials(root);
 }
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
 function card(s,kind){
  const {q,full,c,after}=info(s,kind),[name,,unit]=labels[kind];
  return `<button type="button" class="mars-upgrade-choice mars-card-select mars-overview-card${full?' maxed':''}" data-upgrade-card="${kind}" data-yard-action="${kind==='thrusters'?'upgrade-thrusters':'upgrade'}" data-kind="${kind}" aria-label="${safe(name)}. ${fmt(c.before)}${full?'':` to ${fmt(after)}`}. ${q.level} of ${q.max} tiers installed. View requirements.">
   <span class="mars-overview-heading">${view().icon(kind)}<strong>${safe(shortNames[kind])}</strong></span>
   <span class="mars-overview-change" data-upgrade-change="${kind}"><span>${fmt(c.before)}${safe(unit)}</span>${full?'':`<i aria-hidden="true">&#8594;</i><b>${fmt(after)}${safe(unit)}</b>`}</span>
   <span class="mars-overview-footer">${tierMeter(q)}<span>Details <i aria-hidden="true">&#8599;</i></span></span>
  </button>`;
 }
 function details(s,kind,placement){
  const {q,p,full,c,after,items,missing,available}=info(s,kind),[name,label,unit]=labels[kind],gain=after-c.before;
  const reason=full?'Every tier is installed.':missing.length?'Collect the missing resources shown above.':p?.newBay?'Adds an empty bay. Equipment is purchased separately.':kind==='shield'&&after===0?'Repair or fit a deflector to use this shield upgrade.':'Everything is ready. Buy installs this upgrade.';
  const materialTiles=items.map(({key,amount,held},index)=>{
   const material=view().minerals[key]?.name||key,need=Math.max(0,amount-held),ratio=Math.max(0,Math.min(1,held/Math.max(1,amount)));
   const longAmount=Math.max(fmt(amount).length,fmt(held).length)>7;
   return `<article class="mars-resource-tile ${need?'short':'ready'}${longAmount?' long-amount':''}" data-upgrade-cost="${key}" data-cost="${amount}" data-held="${held}" data-shortage="${need}" style="--material-row:${index};--resource-fill:${ratio}" aria-label="${safe(material)}. Have ${fmt(held)}. Need ${fmt(amount)}.${need?' Need '+fmt(need)+' more.':' You have enough.'}">
    <div class="mars-resource-name">${view().mineralIcon(key)}<strong>${safe(material)}</strong><span aria-hidden="true">${need?'':'&#10003;'}</span></div>
    <div class="mars-resource-ratio"><div class="mars-resource-have"><small>HAVE</small><b data-full-amount="${safe(fmt(held))}" title="${safe(fmt(held))}">${fmt(held)}</b></div><span aria-hidden="true">/</span><div class="mars-resource-need"><small>NEED</small><b>${fmt(amount)}</b></div></div>
    <div class="mars-resource-status">${need?`<strong class="mars-resource-shortage">Need ${fmt(need)} more</strong>`:'<strong>YOU HAVE IT</strong>'}</div><span class="mars-resource-meter" aria-hidden="true"><i></i></span>
   </article>`;
  }).join('');
  return `<section class="mars-upgrade-detail" data-affordable="${available}" data-upgrade-card="${kind}" data-upgrade-detail="${kind}" aria-label="${safe(name)} requirements">
   <div class="mars-detail-heading"><span>${view().icon(kind)}</span><div><small>SHIP UPGRADE</small><h2>${safe(name)}</h2></div><span class="mars-detail-tier" data-upgrade-tier>${tierMeter(q)}${kind!=='thrusters'&&q.level?`<button type="button" class="mars-detail-remove" data-yard-action="remove" data-kind="${kind}" title="Remove one tier (no refund)" aria-label="Remove one upgrade tier. No refund.">Remove tier</button>`:''}</span></div>
   <div class="mars-detail-change" data-upgrade-change="${kind}"><span>${safe(label)}</span><div><small>NOW</small><strong>${fmt(c.before)}${safe(unit)}</strong></div><i aria-hidden="true">&#8594;</i><div><small>${full?'INSTALLED':'AFTER'}</small><strong>${fmt(after)}${safe(unit)}</strong></div><b>${full?'Maximum tier':`+${fmt(gain)} ${safe(unit||label.toLowerCase())}`}</b></div>
   <div class="mars-resource-grid" data-resource-count="${full?0:items.length}" aria-label="Materials you have and need">${full?'<div class="mars-detail-max">Every tier of this upgrade is installed.</div>':materialTiles}</div>
   <p class="mars-detail-status${missing.length?' short':''}${p?.newBay?' has-bay':''}" role="status" data-upgrade-availability>${p?.newBay?placement?'Empty bay. Position selected.':'Empty bay. Use the glowing mount or choose another.':safe(reason)}</p>
   <div class="mars-detail-actions"><button type="button" class="mars-detail-back" data-yard-action="cancel-preview">&#8592; Back</button><button type="button" class="yard-primary mars-detail-buy" data-yard-action="buy-upgrade" data-kind="${kind}" ${available?'':'disabled'}>${full?'Fully upgraded':'Buy & install'}<span aria-hidden="true">&#8599;</span></button></div>

  </section>`;
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
 function catalog(s,{selection=null,placement=null}={}){
  if(selection)return details(s,selection,placement);
  return `<div class="mars-upgrade-picker"><div class="mars-upgrade-heading"><h2>Upgrade your ship.</h2><p>Choose an improvement to see its price and materials.</p></div><div class="mars-upgrade-choices">${Object.keys(labels).map(kind=>card(s,kind)).join('')}</div></div>`;
 }
 window.nativeMarsUpgrades=Object.freeze({catalog,statHtml,previewStats,layoutMaterials,releaseMaterials});
})();
