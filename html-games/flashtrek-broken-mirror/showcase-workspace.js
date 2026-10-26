/* Presentation only: move the existing controls without replacing their owners. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const make=(tag,className,text)=>{
    const node=document.createElement(tag);node.className=className;
    if(text)node.textContent=text;
    return node;
  };
  const workbench=$('.workbench'),viewer=$('.viewer'),controls=$('.control-panel');
  if(!workbench||!viewer||!controls)return;
  const picker=$('.ship-picker'),weapon=$('.weapon-console'),health=$('.health-panel');
  const workshop=$('#repair-workshop'),advanced=$('.weapon-advanced'),equipmentList=$('#equipment-list'),repairDemo=$('#repair-demo');
  const info=make('section','workspace-info');
  const infoTitle=make('h3','','Selected artwork');info.append(infoTitle);
  for(const selector of ['.source-tag','.animation-status-card','.fleet-progress','#ship-results','.civilian-note']){
    const node=$(selector);if(node)info.append(node);
  }
  function field(id,label){
    const wrapper=make('label','workspace-field',label);wrapper.htmlFor=id;
    wrapper.append($('#'+id));return wrapper;
  }
  const toolbarFields=[field('fleet-filter','Collection'),field('animation-filter','Animation'),field('ship-select','Ship / artwork')];
  const shipNav=$('.ship-nav');
  $('#previous').textContent='\u2039 Previous';$('#next').textContent='Next \u203a';
  const reset=$('#reset');reset.textContent='Reset';
  picker.replaceChildren(...toolbarFields,shipNav,reset);
  picker.classList.add('workspace-toolbar');
  workbench.prepend(picker);

  let tabSequence=0;
  function tabs(host,entries,kind){
    const bar=make('nav','workspace-tabs '+(kind==='main'?'workspace-main-tabs':'workspace-subtabs'));
    bar.setAttribute('role','tablist');bar.setAttribute('aria-label',kind==='main'?'Showcase controls':kind+' controls');
    const body=make('div','workspace-tab-body'),buttons=new Map();
    function select(id,focus=false){
      if(kind==='main')workbench.dataset.workspaceFocus=id==='preview'?'preview':'controls';
      for(const [key,panel] of entries){
        const selected=key===id,button=buttons.get(key);
        panel.hidden=!selected;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
      }
      if(focus)buttons.get(id).focus();
      if(kind==='main')dispatchEvent(new CustomEvent('showcase-workspace-tab',{detail:{id}}));
    }
    for(const [id,panel,label] of entries){
      const button=make('button','',label||id);button.type='button';button.setAttribute('role','tab');
      button.dataset[kind==='main'?'workspaceTab':'workspacePage']=id;
      const prefix='workspace-'+(++tabSequence);
      button.id=prefix+'-tab';panel.id=prefix+'-panel';
      button.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
      panel.classList.add('workspace-panel');
      button.onclick=()=>select(id);buttons.set(id,button);bar.append(button);body.append(panel);
    }
    bar.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const keys=[...buttons.keys()].filter(key=>buttons.get(key).getClientRects().length),at=keys.findIndex(key=>buttons.get(key)===document.activeElement);
      const index=event.key==='Home'?0:event.key==='End'?keys.length-1:(at+(event.key==='ArrowRight'?1:keys.length-1))%keys.length;
      select(keys[index],true);
    });
    host.append(bar,body);select(entries[0][0]);return select;
  }
  function section(...nodes){const node=make('section','workspace-section');for(const child of nodes)if(child)node.append(child);return node;}

  // Health and playback remain beside the canvas regardless of the active tab.
  $('.viewer-heading').append($('.combat-meters'));
  const playback=$('.viewer > .playback');playback.classList.add('workspace-playback');
  playback.append($('#sound'));
  for(const [id,label] of [['pause','Pause'],['slow','Slow'],['rotate','Rotate'],['compare','Compare']])$('#'+id).textContent=label;
  const lights=$('#cthia-controls');
  for(const id of ['animation-example','cthia-status'])info.append($('#'+id));
  const previewControls=make('div','workspace-preview-controls');previewControls.append(playback,lights);
  viewer.append(previewControls,$('.damage-strip'));
  const status=$('.explanation');status.classList.add('workspace-status');workbench.append(status);
  const statusText=$('#explanation');
  new MutationObserver(()=>{statusText.title=statusText.textContent;}).observe(statusText,{childList:true,characterData:true,subtree:true});

  // Each settings group gets a page rather than expanding the whole workbench.
  const weapons=make('section','workspace-group');
  const settings=section();
  for(const selector of ['label[for="firing-ship"]','#firing-ship','#firing-rating','.weapon-rating','#showcase-shield-controls','.visual-settings'])settings.append($(selector));
  const equipment=$('.equipment-ratings');equipment.open=true;equipment.classList.add('workspace-details');
  const visual=settings.querySelector('.visual-settings');visual.open=true;visual.classList.add('workspace-details');
  const iconLink=advanced.querySelector('.combat-note:last-child');if(iconLink)info.append(iconLink);
  advanced.remove();
  const equipmentPage=section(equipment);
  tabs(weapons,[['fire',section(weapon),'Fire'],['settings',settings,'Settings'],['equipment',equipmentPage,'Equipment']],'weapons');

  const damage=make('section','workspace-group');
  const motion=section($('#creature-health-controls'),$('#larva-motion-controls'),$('#hatch'),$('#evolve'));
  motion.prepend(make('h3','','Creature controls'));
  const impacts=section($('#debris-controls'),$('.target-controls'));
  tabs(damage,[['hull',section(health),'Hull'],['impacts',impacts,'Impacts / target'],['motion',motion,'Creatures']],'damage');

  const repair=make('section','workspace-group workspace-repair');
  const unavailable=make('p','workspace-unavailable','Select a ship to use the repair fleet. Drones, creatures, asteroids and structures have their own inspection controls.');
  const availability=()=>{unavailable.hidden=!workshop.hidden;};availability();
  new MutationObserver(availability).observe(workshop,{attributes:true,attributeFilter:['hidden']});
  const summary=make('div','workspace-repair-summary');
  workshop.querySelector('h3').textContent='Repair Dots';
  summary.append(workshop.querySelector('h3'),$('.drone-budget'),$('.drone-fleet-summary'));
  const fleet=section(),mission=section(),droneCombat=section();
  const repairTools=section($('.drone-flight-note'),repairDemo,$('.drone-workshop-reset'));
  const roles=$('.drone-role-tabs');
  for(const [role,label] of [['repair','Repair'],['defense','Defense'],['attack','Attack']])roles.querySelector(`[data-drone-role="${role}"]`).textContent=label;
  const tierButtons=make('nav','workspace-tier-tabs');tierButtons.setAttribute('aria-label','Drone tier');
  function selectTier(tier){
    workshop.querySelectorAll('.drone-tier').forEach(card=>card.classList.toggle('workspace-tier-hidden',card.dataset.tier!==tier));
    tierButtons.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.workspaceTier===tier)));
  }
  for(const tier of ['basic','upgraded','advanced']){
    const button=make('button','',tier[0].toUpperCase()+tier.slice(1));button.type='button';button.dataset.workspaceTier=tier;button.onclick=()=>selectTier(tier);tierButtons.append(button);
  }
  fleet.append(roles,tierButtons);
  for(const panel of workshop.querySelectorAll('.drone-role-panel'))fleet.append(panel);
  droneCombat.append($('.drone-combat-controls'));
  for(const selector of ['.drone-auto-attack','.drone-wave-summary','.drone-wave-launch']){
    const node=$(selector)||fleet.querySelector(selector);if(node)mission.append(node);
  }
  const launch=$('.drone-workshop-launch'),shopStatus=$('.drone-shop-status');
  launch.textContent='Launch repair fleet';
  workshop.replaceChildren(summary);
  tabs(workshop,[['fleet',fleet,'Fleet'],['mission',mission,'Flight'],['combat',droneCombat,'Combat'],['tools',repairTools,'Tools']],'repair');
  workshop.append(launch,shopStatus);selectTier('basic');
  for(const card of workshop.querySelectorAll('.drone-tier'))card.querySelector('h4').title=card.querySelector('p').textContent;
  for(const button of workshop.querySelectorAll('[data-enemy-upgrade]')){button.title=button.textContent;button.textContent='Upgrade one';}
  repair.append(unavailable,workshop);

  // Equipment is a short page of cards with explicit previous/next buttons.
  const pager=make('nav','workspace-pager');
  const previous=make('button','','Previous'),pageNumber=make('span',''),next=make('button','','Next');
  previous.type=next.type='button';previous.setAttribute('aria-label','Previous equipment page');next.setAttribute('aria-label','Next equipment page');
  pager.append(previous,pageNumber,next);equipmentPage.prepend(pager);let equipmentIndex=0;
  function equipmentPages(){
    const items=[...equipmentList.children],total=Math.max(1,Math.ceil(items.length/3));equipmentIndex=Math.min(equipmentIndex,total-1);
    items.forEach((item,index)=>item.classList.toggle('workspace-tier-hidden',Math.floor(index/3)!==equipmentIndex));
    pageNumber.textContent=`${equipmentIndex+1} / ${total}`;previous.disabled=equipmentIndex===0;next.disabled=equipmentIndex===total-1;
  }
  previous.onclick=()=>{equipmentIndex=Math.max(0,equipmentIndex-1);equipmentPages();};next.onclick=()=>{equipmentIndex++;equipmentPages();};
  new MutationObserver(equipmentPages).observe(equipmentList,{childList:true});equipmentPages();

  // All original IDs remain unique; the original simulator still owns actions.
  controls.replaceChildren();
  const entries=[['weapons',weapons,'Weapons'],['damage',damage,'Damage'],['repair',repair,'Repair'],['info',info,'Info']];
  const lab=window.showcaseEffectLab?.create({tabs,section});if(lab)entries.push(['lab',lab,'Stress']);
  entries.push(['preview',section(),'Preview']);
  const mainSelect=tabs(controls,entries,'main');
  const compact=matchMedia('(max-width:700px) and (max-height:800px)');
  compact.addEventListener('change',()=>{if(!compact.matches&&workbench.dataset.workspaceFocus==='preview')mainSelect('weapons');});
  document.body.classList.add('showcase-workspace');
  if(compact.matches)mainSelect('preview');
})();
