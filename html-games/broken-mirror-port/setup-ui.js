/* Setup presentation; the SWF remains responsible for faction rules and saves. */
const setupFactions=[
 {name:'Non-Aligned',color:'#a6d9ef',role:'An independent beginning',style:'Explore on your own terms'},
 {name:'Earth Empire',color:'#ef879e',role:'Imperial officer',style:'Defend a fractured empire'},
 {name:'Klingon Empire',color:'#ef6254',role:'Warrior captain',style:'Strength through conquest'},
 {name:'Ferengi',color:'#e5c660',role:'Merchant captain',style:'A galaxy of opportunity'},
 {name:'Romulan Empire',color:'#70dc70',role:'Romulan soldier',style:'Power from the shadows'},
 {name:'Vulcan',color:'#dac68c',role:'Explorer',style:'Logic, diplomacy and discovery'},
 {name:'Cardassian Order',color:'#ca89ed',role:'Cardassian minion',style:'Earn your command'},
 {name:'Borg Collective',color:'#a0f052',role:'Collective consciousness',style:'Resistance is futile'}
];
// Condensed from the original faction introductions; starting resources appear below.
const setupFactionStories=[
 'Species leaving the Earth Empire have formed neutral governments.\n\nBegin in a personal runabout. Most races leave you alone, but access to powerful ships requires earning their trust.',
 'Rebellion and war have weakened the Earth Empire. Half its territory has fallen to the Klingons.\n\nAs a junior officer in a small Sabre-class ship, defend the Empire and restore human dominance.',
 "Once enslaved by Earth, the Klingons rebelled and now seek revenge.\n\nCommand a small B’Rel Bird of Prey and bring glory to the Klingon Empire.",
 'The Ferengi value profit above all. Trade kept them free of Imperial enslavement.\n\nYour shuttle is weak and unarmed, but has ample cargo space and a durable warp drive. Use your savings to trade.',
 'The isolated Romulans avoid the war, though traders report powerful ships hidden in their territory.\n\nWary of other races but eager to explore, take your small Scout into the unknown and make a name for your people.',
 'Exiled from the Earth Empire, the Vulcans disarmed and embraced peace, diplomacy, and education. Allies protect them.\n\nYour large starship is fast but unarmed. You have little money and substantial resources.',
 'The Cardassians abandoned their rebellion against Earth, leaving the Klingons to fight alone. Their isolation remains suspicious.\n\nYou have bought promotion to Hideki Gul, the lowest rank of ship captain in the Cardassian Order.',
 'Resistance is futile.\n\nBegin in a Borg Cube in the original Borg starting system. Other governments are hostile to the Collective.'
];
const setupUI=document.createElement('section');setupUI.id='setup-ui';setupUI.hidden=true;setupUI.setAttribute('aria-label','New game setup');game.appendChild(setupUI);
let setupState=null,setupStep=0,setupChosenFaction=1,setupNames={captain:'Noname',ship:'Unnamed',government:'Unnamed'};
let setupPreviewFrame=0;
const setupPreviewReduced=matchMedia('(prefers-reduced-motion: reduce)');
function setupShipPreview(data,compact=false){return `<figure class="setup-ship-preview${compact?' setup-ship-preview-compact':''}"><div class="setup-ship-art"><img src="startup/ships/ship-${Number(data.ship)}.png" alt=""><canvas width="300" height="220" role="img"></canvas></div><figcaption></figcaption></figure>`;}
function startSetupShipPreview(){
 cancelAnimationFrame(setupPreviewFrame);setupPreviewFrame=0;
 const canvas=setupUI.querySelector('.setup-ship-preview canvas');if(!canvas||setupUI.hidden)return;
 const preview=canvas.closest('figure'),fallback=preview.querySelector('img'),type=Number(setupState.ship);
 canvas.setAttribute('aria-label',setupState.shipName+' with animated ship lights');fallback.alt=setupState.shipName;
 preview.querySelector('figcaption').textContent='Starting ship · '+setupState.shipName;
 function draw(now){
  setupPreviewFrame=0;if(!canvas.isConnected||setupUI.hidden||document.hidden)return;
  const rendered=window.vexDrawShipPreview?.(canvas,type,setupPreviewReduced.matches?0:now);
  canvas.hidden=!rendered;fallback.hidden=!!rendered;
  canvas.dataset.frames=String(Number(canvas.dataset.frames||0)+1);
  if(!setupPreviewReduced.matches)setupPreviewFrame=requestAnimationFrame(draw);
 }
 draw(performance.now());
}
document.addEventListener('visibilitychange',startSetupShipPreview);setupPreviewReduced.addEventListener('change',startSetupShipPreview);
function setupCall(action,...args){return player.ruffle().callExternalInterface('vexSetup',action,...args);}
function setupImage(id){return 'startup/factions/faction-'+id+'.png?v='+({2:'earth-2',4:'ferengi-2',5:'romulan-2',6:'vulcan-2',7:'cardassian-2'}[id]||'1');}
function setupNumber(n){return Number(n).toLocaleString();}
function setupStats(data,review=false){return `<dl class="setup-specs ${review?'setup-review-specs':''}">${[['Latinum',data.latinum],['Deuranium',data.deuranium],['Antimatter',data.antimatter],...(review?[['Hull',data.hull],['Shields',data.shields],['Cargo',data.cargo]]:[])].map(([label,value])=>`<div><dt>${label}</dt><dd>${['Latinum','Deuranium','Antimatter'].includes(label)?`<img class="setup-resource-icon" src="startup/resources/${label.toLowerCase()}.png" alt="" aria-hidden="true">`:""}<span>${setupNumber(value)}</span></dd></div>`).join('')}</dl>`;}
function setupHeading(data){const f=setupFactions[data.race-1];return `<div class="faction-heading"><img src="${setupImage(data.race)}" alt=""><div><h3>${f.name}</h3><p>${f.role}</p></div></div>`;}
function applySetupTheme(race){setupUI.style.setProperty('--faction-color',setupFactions[race-1].color);setupUI.dataset.faction=String(race);}
function updateSetupDetails(){
 applySetupTheme(setupState.race);
 const panel=setupUI.querySelector('.setup-panel');panel.innerHTML=setupHeading(setupState)+'<p class="setup-story"></p>'+setupShipPreview(setupState,true)+setupStats(setupState);
 panel.querySelector('.setup-story').textContent=setupFactionStories[setupState.race-1];
 startSetupShipPreview();
 for(const card of setupUI.querySelectorAll('.faction-card'))card.setAttribute('aria-pressed',String(Number(card.dataset.faction)===setupState.race));
}
function renderSetup(frame){
 setupUI.hidden=frame!==108&&frame!==109;
 if(setupUI.hidden){cancelAnimationFrame(setupPreviewFrame);setupPreviewFrame=0;setupStep=0;setupChosenFaction=1;return;}
 const state=frame===108&&setupStep===2?setupCall('faction',setupChosenFaction):setupCall('state');
 if(!state||!setupFactions[state.race-1]){setupUI.hidden=true;return;}
 setupState=state;setupStep=frame===108?1:2;applySetupTheme(state.race);
 setupUI.innerHTML=`<div class="setup-top"><div><p class="setup-kicker">COMMAND INITIALIZATION / NEW GAME</p><h2>${setupStep===1?'Choose your faction':'Establish your command'}</h2></div><div class="setup-steps"><span class="${setupStep===1?'active':''}">01 FACTION</span><span class="${setupStep===2?'active':''}">02 COMMAND</span></div></div><div class="setup-body"></div><div class="setup-bottom"><button type="button" class="setup-back">${setupStep===1?'Main menu':'Back'}</button><p class="setup-hint">${setupStep===1?'Choose an allegiance. Shape your future.':'Your ship. Your crew. Your story.'}</p><button type="button" class="setup-primary">${setupStep===1?'Continue →':'Launch →'}</button></div>`;
 const body=setupUI.querySelector('.setup-body');
 if(setupStep===1){
  body.innerHTML='<div class="setup-factions">'+setupFactions.map((f,i)=>`<button type="button" class="faction-card" data-faction="${i+1}" aria-pressed="false"><img src="${setupImage(i+1)}" alt=""><span>${f.name}<small>${f.style}</small></span></button>`).join('')+'</div><article class="setup-panel"></article>';
  for(const card of body.querySelectorAll('.faction-card'))card.onclick=()=>{const selected=setupCall('faction',Number(card.dataset.faction));if(selected){setupChosenFaction=Number(card.dataset.faction);setupState=selected;updateSetupDetails();}};
  updateSetupDetails();
 }else{
  body.innerHTML='<form class="setup-panel setup-form"><label>CAPTAIN NAME<input name="captain" maxlength="40" required autocomplete="off"></label><label>SHIP NAME<input name="ship" maxlength="40" required autocomplete="off"></label><label>YOUR GOVERNMENT<input name="government" maxlength="40" required autocomplete="off"></label><p class="setup-error" role="alert"></p></form><article class="setup-panel">'+setupHeading(state)+setupShipPreview(state)+setupStats(state,true)+'</article>';
  startSetupShipPreview();
  for(const input of body.querySelectorAll('input')){input.value=setupNames[input.name];input.oninput=()=>setupNames[input.name]=input.value;}
  body.querySelector('form').onsubmit=e=>{e.preventDefault();setupUI.querySelector('.setup-primary').click();};
 }
 setupUI.querySelector('.setup-back').onclick=()=>{setupCall(setupStep===1?'cancel':'back');};
 setupUI.querySelector('.setup-primary').onclick=()=>{
  if(setupStep===1){setupCall('next');return;}
  const form=body.querySelector('form');if(!form.reportValidity())return;
  const names=Object.values(setupNames).map(value=>value.trim());if(names.some(value=>!value)){body.querySelector('.setup-error').textContent='Please enter a name in each field.';return;}
  runWithGameLoading('Preparing your ship',()=>setupCall('launch',...names),result=>{
   if(!result||String(result.error).startsWith('Error:')){body.querySelector('.setup-error').textContent=result?.error||'Unable to launch.';return false;}
  });
 };
}
