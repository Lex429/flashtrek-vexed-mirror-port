/* One bounded purchase celebration. Reads hardware; never installs, charges or saves. */
(() => {
 'use strict';
 const duration=3200,refits=()=>window.nativeShipyardRefits;
 const names={cargo:['Cargo expanded','Cargo capacity','t'],hull:['Hull reinforced','Hull strength',''],shield:['Shields upgraded','Shield strength',''],engine:['Engines upgraded','Flight speed',''],thrusters:['Thrusters upgraded','Emergency speed',''],drive:['Warp drive upgraded','Warp speed','×'],weapon:['Weapon bay installed','Weapon bays',''],dot:['Repair bay installed','Repair Dot bays',''],utility:['Ability bay installed','Ability bays','']};
 const fmt=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let active=null;
 function capture(state,kind){
  if(kind?.startsWith('equipment:')){
   const instance=kind.slice(10),q=refits().weaponQuote(state,instance);if(!q)return null;
   return {kind,instance,weapon:true,name:q.before.name,value:q.before.recharge/13,level:q.level,max:q.max};
  }
  if(!names[kind])return null;
  const q=kind==='thrusters'?window.nativeShipThrusters.quote(state):refits().quote(state,kind);
  const value=kind==='thrusters'?q.before.maxSpeed:window.nativeShipyardOutfitting.change(refits().preview(state,kind),kind).before;
  return {kind,value,level:q.level,max:q.max};
 }
 function stop(root){
  if(!active||active.root!==root)return;
  clearTimeout(active.timer);active.observer?.disconnect();active.element.remove();
  delete root.dataset.upgradeInstalling;
  root.querySelectorAll('[data-installed-upgrade]').forEach(node=>{delete node.dataset.installedUpgrade;node.style.removeProperty('--install-elapsed');});
  root.querySelectorAll('.mars-installed-old').forEach(node=>node.remove());
  active=null;
 }
 function sync(root){
  if(!active||active.root!==root)return;
  if(root.hidden||root.dataset.visual!=='true'||root.dataset.serviceTab!=='upgrades'){stop(root);return;}
  const fx=active.element,r=root.getBoundingClientRect(),sx=root.offsetWidth/r.width,sy=root.offsetHeight/r.height;
  const local=node=>{const b=node.getBoundingClientRect();return {x:(b.left-r.left)*sx,y:(b.top-r.top)*sy,w:b.width*sx,h:b.height*sy};};
  const pane=root.querySelector('.yard-catalog'),ship=root.querySelector('.inventory-ship'),card=root.querySelector(`[data-upgrade-card="${active.kind}"]`),header=root.querySelector('header');
  if(!pane||!ship||!card||!header){stop(root);return;}
  Object.assign(fx.style,{left:root.offsetLeft+'px',top:root.offsetTop+'px',width:root.offsetWidth+'px',height:root.offsetHeight+'px'});
  const a=local(card),b=local(ship),p=local(pane),x=b.x+b.w/2,y=b.y+b.h/2,cx=a.x+a.w/2,cy=Math.max(p.y+12,Math.min(p.y+p.h-12,a.y+a.h/2)),dx=x-cx,dy=y-cy;
  const visible=a.y+a.h>p.y&&a.y<p.y+p.h;fx.querySelector('.mars-install-card-clip').hidden=!visible;fx.querySelector('.mars-install-ray').style.opacity=visible?'':'0';
  const vars={sx:x,sy:y,shipLeft:b.x,shipTop:b.y,shipWidth:b.w,shipHeight:b.h,cardLeft:a.x-p.x,cardTop:a.y-p.y,cardWidth:a.w,cardHeight:a.h,paneLeft:p.x,paneTop:p.y,paneWidth:p.w,paneHeight:p.h,rayX:cx,rayY:cy,rayLength:Math.hypot(dx,dy),headerHeight:header.offsetHeight,actionsWidth:(root.querySelector('.yard-header-actions')?.offsetWidth||100)+36};
  for(const [key,value] of Object.entries(vars))fx.style.setProperty('--'+key,value+'px');
  fx.style.setProperty('--rayAngle',Math.atan2(dy,dx)+'rad');
  fx.style.setProperty('--ringSize',Math.max(140,Math.min(360,b.w*1.45,b.h*1.2))+'px');
  const mark=(node,type)=>{if(node&&!node.dataset.installedUpgrade){node.dataset.installedUpgrade=type;node.style.setProperty('--install-elapsed',Math.max(0,performance.now()-active.started)+'ms');}};
  mark(card,'card');mark(card.querySelectorAll('.mars-tier-bar')[active.level-1],'tier');root.dataset.upgradeInstalling=active.kind;
  const stat=root.querySelector(`[data-ship-stat="${active.kind}"]`);
  if(stat){
   mark(stat,'stat');
   if(!stat.querySelector('.mars-installed-old')){const old=document.createElement('span');old.className='mars-installed-old';old.setAttribute('aria-hidden','true');old.textContent=fmt(active.before)+(active.kind==='cargo'?' t':'');stat.querySelector('strong').append(old);}
  }
  if(active.instance)mark([...root.querySelectorAll('[data-item-key]')].find(node=>node.dataset.itemKey==='equipment:'+active.instance),'equipment');
  if(active.observer&&active.pane!==pane){if(active.pane)active.observer.unobserve(active.pane);if(active.ship)active.observer.unobserve(active.ship);active.pane=pane;active.ship=ship;active.observer.observe(pane);active.observer.observe(ship);}

 }
 function celebrate(root,state,before){
  if(!before)return;
  const after=capture(state,before.kind);
  // A durable, successful transaction must actually advance exactly one tier.
  if(!after||after.level!==before.level+1)return;
  stop(root);
  if(root.dataset.screen==='mars-services')window.nativeMarsUpgrades.previewStats(root,state,null);
  const [name,label,unit]=before.weapon?[after.name,'Recharge','s']:names[before.kind],gain=after.value-before.value,element=document.createElement('div');
  element.className='mars-install-fx';element.dataset.upgradeKind=before.kind;
  if(before.weapon)element.dataset.weaponUpgrade='true';
  Object.assign(element.dataset,{before:String(before.value),after:String(after.value),level:String(after.level)});
  const sparks=Array.from({length:14},(_,i)=>{const angle=i*Math.PI*2/14,radius=72+(i%3)*24;return `<i style="--dx:${Math.cos(angle)*radius}px;--dy:${Math.sin(angle)*radius}px;--sparkDelay:${.2+(i%4)*.025}s"></i>`;}).join('');
  const tiers=Array.from({length:after.max},(_,i)=>`<i class="mars-install-tier-bar${i<after.level?' installed':''}${i===after.level-1?' new':''}"></i>`).join('');
  element.innerHTML=`<div class="mars-install-halo" aria-hidden="true"></div><div class="mars-install-ray" aria-hidden="true"><i></i><b style="--packet-delay:.12s"></b><b style="--packet-delay:.26s"></b><b style="--packet-delay:.4s"></b></div><div class="mars-install-rings" aria-hidden="true"><i></i><i></i><i></i></div><div class="mars-install-sparks" aria-hidden="true">${sparks}</div><div class="mars-install-scan" aria-hidden="true"><i></i></div><div class="mars-install-card-clip" aria-hidden="true"><div class="mars-install-card-frame"></div></div><div class="mars-install-lock" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="mars-install-perimeter" aria-hidden="true"></div>
   <div class="mars-install-announcement" role="status" aria-live="polite" aria-atomic="true" aria-label="${safe(name)}. Tier ${after.level} of ${after.max}. ${safe(label)} ${fmt(before.value)} to ${fmt(after.value)} ${safe(unit)}."><span class="mars-install-check" aria-hidden="true">${window.nativeOutfittingView.icon(before.weapon?'weapon':before.kind)}<b>✓</b></span><div class="mars-install-message"><small>UPGRADE INSTALLED</small><strong>${safe(name)}</strong><span><span class="mars-install-tier-bars" aria-hidden="true">${tiers}</span><i>COMPLETE</i></span></div><div class="mars-install-gain"><span>${fmt(before.value)}${safe(unit)} <i>→</i> <b>${fmt(after.value)}${safe(unit)}</b></span><small>${before.weapon?fmt(-gain)+' s faster':'+'+fmt(gain)+' '+safe(label)}</small></div></div>`;
  active={root,element,kind:before.kind,instance:before.instance,level:after.level,before:before.value,started:performance.now(),timer:0,observer:null,pane:null,ship:null};root.parentElement.append(element);sync(root);if(!active)return;
  if(typeof ResizeObserver==='function'){active.observer=new ResizeObserver(()=>sync(root));active.observer.observe(root);sync(root);}
  active.timer=setTimeout(()=>stop(root),duration);
  window.nativeMenuSounds?.inventory('equip');
 }
 document.addEventListener('scroll',event=>{if(active&&active.root.contains(event.target))sync(active.root);},true);
 window.addEventListener('resize',()=>{if(active)sync(active.root);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop(active.root);});
 window.nativeMarsUpgradeEffects=Object.freeze({capture,celebrate,sync,stop});
})();
