/* Player recovery presentation. Shared damage/effects own the explosion. */
(() => {
  'use strict';
  const stage=document.getElementById('game'),overlay=document.createElement('section');
  overlay.id='player-recovery';overlay.hidden=true;overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Reincarnate');
  overlay.tabIndex=-1;
  const frame='<svg class="recovery-button-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x="1.5" y="1.5" width="97" height="97" rx="5" pathLength="100" vector-effect="non-scaling-stroke"/></svg>';
  overlay.innerHTML=`<div class="recovery-card">
    <svg class="recovery-card-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x=".5" y=".5" width="99" height="99" rx="2" pathLength="100" vector-effect="non-scaling-stroke"/></svg>
    <div class="recovery-faction-emblem"><img data-recovery-faction-logo alt="" width="180" height="180"><span class="recovery-faction-light" aria-hidden="true"></span></div>
    <h2>Reincarnate</h2><p class="recovery-error" role="alert"></p>
    <div class="recovery-actions"><button class="recovery-button" type="button" data-recovery-restore aria-label="Reincarnate">${frame}<span class="recovery-button-icon" aria-hidden="true">↻</span><span class="recovery-button-label">Reincarnate</span><span class="recovery-button-arrow" aria-hidden="true">↗</span></button><button class="recovery-button" type="button" data-recovery-menu aria-label="Main menu">${frame}<span class="recovery-button-icon" aria-hidden="true">⌂</span><span class="recovery-button-label">Main menu</span><span class="recovery-button-arrow" aria-hidden="true">↗</span></button></div>
    <span class="recovery-bottom-line" aria-hidden="true"></span>
  </div>`;
  stage.appendChild(overlay);
  const restore=overlay.querySelector('[data-recovery-restore]'),menu=overlay.querySelector('[data-recovery-menu]'),error=overlay.querySelector('.recovery-error');
  const logo=overlay.querySelector('[data-recovery-faction-logo]');
  // The saved faction is zero-based; these are the same origins and colors
  // used by the actual new-game faction selector, not the current planet owner.
  const factionThemes=[['Non-Aligned','#a6d9ef'],['Earth Empire','#ef879e'],['Klingon Empire','#ef6254'],['Ferengi','#e5c660'],['Romulan Empire','#70dc70'],['Vulcan','#dac68c'],['Cardassian Order','#ca89ed'],['Borg Collective','#a0f052']];
  const duration=8000,fadeDuration=3000,pressDuration=320,motion=matchMedia('(prefers-reduced-motion: reduce)');
  let bridge=null,state=null,born=0,inertChildren=[],disabled=[],revealTimer=0,pressTimer=0,generation=0,activating=false;
  const playable=value=>!!value&&value.hull>0&&value.phase!=='destroyed';
  const gate=()=>dispatchEvent(new CustomEvent('native-flightgatechange',{detail:{at:performance.now()}}));
  function factionEmblem(value){
    const starts=window.VexedMirrorWorld.factionStarts;
    const start=starts.find(entry=>entry.selectionId===Number(value.faction)+1)||starts[0];
    const [name,color]=factionThemes[start.selectionId-1]||factionThemes[0];
    logo.src=`startup/factions/faction-${start.selectionId}.png`;logo.alt=`${name} faction emblem`;
    overlay.dataset.faction=String(start.selectionId);
    overlay.style.setProperty('--recovery-faction-color',color);
    overlay.style.setProperty('--recovery-faction-rgb',[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16)).join(','));
    overlay.style.setProperty('--recovery-faction-art',`url("${logo.src}")`);
  }
  function reset(){
    generation++;clearTimeout(revealTimer);clearTimeout(pressTimer);revealTimer=pressTimer=0;activating=false;
    const active=!overlay.hidden;overlay.hidden=true;state=null;born=0;
    overlay.removeAttribute('aria-busy');delete overlay.dataset.revealing;delete overlay.dataset.activating;
    for(const button of [restore,menu]){button.classList.remove('recovery-pressed');button.style.removeProperty('--recovery-tilt-x');button.style.removeProperty('--recovery-tilt-y');}
    for(const {child,inert} of inertChildren)child.inert=inert;inertChildren=[];
    for(const {button,wasDisabled} of disabled)button.disabled=wasDisabled;disabled=[];
    error.textContent='';
    if(active)gate();
  }
  function begin(value,{immediate=false}={}){
    if(!value||value.hull>0&&value.phase!=='destroyed'||state===value)return false;
    reset();state=value;born=window.nativeSimulation.now(value)-(immediate?duration:0);
    factionEmblem(value);
    window.nativeSaveStorage.retire(value);
    bridge?.prepare();
    return true;
  }
  function update(value){
    if(!state||!overlay.hidden)return;
    if(state!==value||playable(value)){reset();return;}
    if(window.nativeSimulation.blocked()||window.nativeSimulation.now(value)-born<duration)return;
    if(window.nativeSaveStorage.reincarnationPending(value))return;
    const canRestore=playable(bridge?.saved());
    restore.disabled=true;menu.disabled=true;
    error.textContent=canRestore?'':'No playable saved point is available. Start a new command from the main menu.';
    overlay.dataset.revealing='true';overlay.setAttribute('aria-busy','true');
    overlay.hidden=false;
    // The destruction has already advanced normally. Only this recovery screen
    // gates simulation, through the same checkpoint boundary as other dialogs.
    gate();
    disabled=Array.from(document.querySelectorAll('.game-actions button,#save'),button=>({button,wasDisabled:button.disabled}));
    for(const {button} of disabled)button.disabled=true;
    inertChildren=Array.from(stage.children).filter(child=>child!==overlay).map(child=>({child,inert:child.inert}));
    for(const {child} of inertChildren)child.inert=true;
    overlay.focus({preventScroll:true});
    const run=generation;
    revealTimer=setTimeout(()=>{
      if(run!==generation||overlay.hidden)return;
      revealTimer=0;overlay.dataset.revealing='false';overlay.setAttribute('aria-busy','false');
      restore.disabled=!canRestore;menu.disabled=false;
      (restore.disabled?menu:restore).focus({preventScroll:true});
    },motion.matches?160:fadeDuration);
  }
  function activate(button,action){
    if(overlay.hidden||button.disabled||revealTimer||activating)return;
    activating=true;overlay.dataset.activating='true';button.classList.add('recovery-pressed');
    window.nativeMenuSounds?.play('press');const run=generation;
    const commit=()=>{
      if(run!==generation||overlay.hidden)return;
      pressTimer=0;
      try{action();}catch(failure){error.textContent=failure.message||'Unable to restore command.';}
      if(run===generation){activating=false;delete overlay.dataset.activating;button.classList.remove('recovery-pressed');}
    };
    if(motion.matches)commit();else pressTimer=setTimeout(commit,pressDuration);
  }
  restore.addEventListener('click',()=>activate(restore,()=>{
    const result=bridge?.restore();
    if(!result?.ok){error.textContent=result?.error||'Unable to restore this saved point.';return;}
    window.nativeMenuSounds?.play('confirm');reset();document.getElementById('space').focus({preventScroll:true});
  }));
  menu.addEventListener('click',()=>activate(menu,()=>{window.nativeMenuSounds?.play('confirm');bridge?.menu();}));
  for(const button of [restore,menu]){
    const hover=()=>{if(!button.disabled&&!overlay.hidden)window.nativeMenuSounds?.play('hover');};
    button.addEventListener('pointerenter',hover);button.addEventListener('focus',hover);
    button.addEventListener('pointermove',event=>{
      if(button.disabled||motion.matches)return;
      const rect=button.getBoundingClientRect(),x=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
      button.style.setProperty('--recovery-pointer-x',`${x*100}%`);button.style.setProperty('--recovery-pointer-y',`${y*100}%`);
      button.style.setProperty('--recovery-tilt-x',`${(y-.5)*-7}deg`);button.style.setProperty('--recovery-tilt-y',`${(x-.5)*7}deg`);
    });
    button.addEventListener('pointerleave',()=>{button.style.setProperty('--recovery-tilt-x','0deg');button.style.setProperty('--recovery-tilt-y','0deg');});
  }
  addEventListener('keydown',event=>{
    if(overlay.hidden)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();return;}
    if(event.key==='Tab'){
      const buttons=[restore,menu].filter(button=>!button.disabled),first=buttons[0],last=buttons.at(-1);
      if(!buttons.length){event.preventDefault();return;}
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  },true);
  window.nativePlayerDestruction=Object.freeze({attach(value){bridge=value;},begin,update,reset,timing:Object.freeze({waitMs:duration,fadeMs:fadeDuration,pressMs:pressDuration}),get active(){return !overlay.hidden;},get pending(){return !!state;}});
})();
