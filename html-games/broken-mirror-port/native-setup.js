/* Native version of the recovered Vexed Mirror faction and command screens. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld,stage=document.getElementById('game'),menu=document.getElementById('menu-art');
  const ui=document.createElement('section');
  ui.id='setup-ui';ui.hidden=true;ui.setAttribute('role','dialog');ui.setAttribute('aria-modal','true');ui.setAttribute('aria-label','New game setup');
  stage.appendChild(ui);
  const starts=[...world.factionStarts].sort((a,b)=>a.selectionId-b.selectionId);
  const factions=[
    {name:'Non-Aligned',color:'#a6d9ef',role:'An independent beginning',style:'Explore on your own terms'},
    {name:'Earth Empire',color:'#ef879e',role:'Imperial officer',style:'Defend a fractured empire'},
    {name:'Klingon Empire',color:'#ef6254',role:'Warrior captain',style:'Strength through conquest'},
    {name:'Ferengi',color:'#e5c660',role:'Merchant captain',style:'A galaxy of opportunity'},
    {name:'Romulan Empire',color:'#70dc70',role:'Romulan soldier',style:'Power from the shadows'},
    {name:'Vulcan',color:'#dac68c',role:'Explorer',style:'Logic, diplomacy and discovery'},
    {name:'Cardassian Order',color:'#ca89ed',role:'Cardassian minion',style:'Earn your command'},
    {name:'Borg Collective',color:'#a0f052',role:'Collective consciousness',style:'Resistance is futile'}
  ];
  const stories=[
    'Independent worlds grew after the Vulcans broke from Earth. You begin with a personal runabout and modest funds. Most governments leave you alone; earn their trust to gain access to stronger ships.',
    'War and rebellion have weakened the Earth Empire. As a junior officer in a small Saber Class ship, you begin at Earth and fight to restore the Empire’s power.',
    'The Klingons broke free of Earth and now seek revenge. Command a B’rel Bird of Prey and prove yourself as a warrior captain.',
    'Profit guides the Ferengi. Your shuttle has little protection and no weapons, but its cargo space and starting funds give you a strong trading opportunity.',
    'Romulan territory has stayed apart from the war. Your small Scout starts at Romulus; explore carefully and make a name for your people.',
    'The Vulcans favor peace, diplomacy, and exploration after leaving Earth’s empire. Your Warpship has strong range, though your starting funds are limited.',
    'The Cardassians retreated from rebellion and remain isolated. You begin with a Hideki and the lowest captain’s rank; build your standing and command.',
    'Resistance is futile. Begin at Vex with a Borg Cube and immense resources. Most other governments are hostile to the Collective.'
  ];
  let selection=2,step=1,names={captain:'Noname',ship:'Unnamed',government:'Unnamed'};
  const start=()=>starts[selection-1],ship=()=>world.ships.find(entry=>entry.id===start().playership);
  const image=id=>'startup/factions/faction-'+id+'.png';
  const number=value=>Number(value).toLocaleString();
  function heading(){const faction=factions[selection-1];return `<div class="faction-heading"><img src="${image(selection)}" alt=""><div><h3>${faction.name}</h3><p>${faction.role}</p></div></div>`}
  function preview(compact=false){return `<figure class="setup-ship-preview${compact?' setup-ship-preview-compact':''}"><div class="setup-ship-art"><img src="startup/ships/ship-${ship().id}.png" alt="${ship().name}"></div><figcaption>Starting ship · ${ship().name}</figcaption></figure>`}
  function stats(review=false){
    const values=[['Latinum',start().mylatinum],['Deuranium',start().mydeuranium],['Antimatter',start().myantimatter]];
    if(review)values.push(['Hull',ship().hull],['Shields',ship().shields],['Cargo',ship().cargo]);
    return `<dl class="setup-specs ${review?'setup-review-specs':''}">${values.map(([label,value])=>`<div><dt>${label}</dt><dd>${['Latinum','Deuranium','Antimatter'].includes(label)?`<img class="setup-resource-icon" src="startup/resources/${label.toLowerCase()}.png" alt="">`:''}<span>${number(value)}</span></dd></div>`).join('')}</dl>`;
  }
  function theme(){ui.style.setProperty('--faction-color',factions[selection-1].color);ui.dataset.faction=String(selection)}
  function details(){
    theme();
    const panel=ui.querySelector('.setup-panel');
    panel.innerHTML=heading()+'<p class="setup-story"></p>'+preview(true)+stats();
    panel.querySelector('.setup-story').textContent=stories[selection-1];
    for(const card of ui.querySelectorAll('.faction-card'))card.setAttribute('aria-pressed',String(Number(card.dataset.faction)===selection));
  }
  function render(){
    theme();
    ui.innerHTML=`<div class="setup-top"><div><p class="setup-kicker">COMMAND INITIALIZATION / NEW GAME</p><h2>${step===1?'Choose your faction':'Establish your command'}</h2></div><div class="setup-steps"><span class="${step===1?'active':''}">01 FACTION</span><span class="${step===2?'active':''}">02 COMMAND</span></div></div><div class="setup-body"></div><div class="setup-bottom"><button type="button" class="setup-back">${step===1?'Main menu':'Back'}</button><p class="setup-hint">${step===1?'Choose an allegiance. Shape your future.':'Your ship. Your crew. Your story.'}</p><button type="button" class="setup-primary">${step===1?'Continue →':'Launch →'}</button></div>`;
    const body=ui.querySelector('.setup-body');
    if(step===1){
      body.innerHTML='<div class="setup-factions">'+factions.map((f,i)=>`<button type="button" class="faction-card" data-faction="${i+1}" aria-pressed="false"><img src="${image(i+1)}" alt=""><span>${f.name}<small>${f.style}</small></span></button>`).join('')+'</div><article class="setup-panel"></article>';
      for(const card of body.querySelectorAll('.faction-card'))card.onclick=()=>{selection=Number(card.dataset.faction);details()};
      details();
    }else{
      body.innerHTML='<form class="setup-panel setup-form"><label>CAPTAIN NAME<input name="captain" maxlength="40" required autocomplete="off"></label><label>SHIP NAME<input name="ship" maxlength="40" required autocomplete="off"></label><label>YOUR GOVERNMENT<input name="government" maxlength="40" required autocomplete="off"></label><p class="setup-error" role="alert"></p></form><article class="setup-panel">'+heading()+preview()+stats(true)+'</article>';
      for(const input of body.querySelectorAll('input')){input.value=names[input.name];input.oninput=()=>names[input.name]=input.value}
      body.querySelector('form').onsubmit=event=>{event.preventDefault();ui.querySelector('.setup-primary').click()};
    }
    ui.querySelector('.setup-back').onclick=back;
    ui.querySelector('.setup-primary').onclick=()=>{
      if(step===1){step=2;render();ui.querySelector('input').focus();return}
      const form=ui.querySelector('form');if(!form.reportValidity())return;
      const trimmed=Object.fromEntries(Object.entries(names).map(([key,value])=>[key,value.trim()]));
      if(Object.values(trimmed).some(value=>!value)){ui.querySelector('.setup-error').textContent='Please enter a name in each field.';return}
      if(window.startNativeFactionGame(selection,trimmed)){close(false)}
      else ui.querySelector('.setup-error').textContent='Unable to launch this faction.';
    };
  }
  function open(){if(document.body.classList.contains('playing'))return;selection=2;step=1;names={captain:'Noname',ship:'Unnamed',government:'Unnamed'};menu.inert=true;stage.classList.add('setup-open');ui.hidden=false;render();ui.querySelector('.faction-card[aria-pressed="true"]').focus()}
  function close(focus=true){ui.hidden=true;stage.classList.remove('setup-open');menu.inert=false;if(focus)document.querySelector('[data-menu="new"]').focus()}
  function back(){if(ui.hidden)return;if(step===2){step=1;render();ui.querySelector(`.faction-card[data-faction="${selection}"]`).focus()}else close()}
  window.nativeSetup={open,back,get active(){return !ui.hidden}};
})();
