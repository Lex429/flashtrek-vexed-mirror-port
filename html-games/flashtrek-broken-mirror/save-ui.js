const saveUI=document.createElement('section');saveUI.id='save-ui';saveUI.hidden=true;saveUI.setAttribute('aria-label','Continue a saved game');game.appendChild(saveUI);
const saveReturn=document.createElement('button');saveReturn.type='button';saveReturn.id='save-return';saveReturn.textContent='Back to save picker';saveReturn.hidden=true;game.appendChild(saveReturn);saveReturn.onclick=()=>renderSaves(133);
let selectedSave=null;
function saveCall(action,slot){return player.ruffle().callExternalInterface('vexSaves',action,slot);}
function renderSaves(frame){
 saveReturn.hidden=true;saveUI.hidden=frame!==133;if(saveUI.hidden){selectedSave=null;return;}
 const slots=saveCall('list');if(!Array.isArray(slots)){saveUI.hidden=true;return;}
 saveUI.innerHTML='<div class="save-heading"><p>COMMAND ARCHIVE</p><h2>Continue your journey</h2><p>Choose a saved game, then load it.</p></div><div class="save-slots"></div><p class="save-message" role="status" aria-live="polite"></p><div class="save-actions"><button type="button" class="save-back">Main menu</button><button type="button" class="save-load" disabled>Load saved game</button></div>';
 for(const slot of slots){
  const button=document.createElement('button');button.type='button';button.className='save-slot';button.dataset.slot=slot.slot;button.setAttribute('aria-pressed','false');button.disabled=!slot.valid;
  const title=document.createElement('strong');title.textContent='Slot '+slot.slot+' · '+(slot.empty?'Empty':slot.captain);button.appendChild(title);
  const detail=document.createElement('span');detail.textContent=slot.empty?'No saved game':!slot.valid?'Incomplete save — unable to load':slot.ship+' · '+slot.shipType;button.appendChild(detail);
  if(slot.valid){const extra=document.createElement('small');extra.textContent=slot.government+' · '+Number(slot.latinum).toLocaleString()+' latinum · System '+slot.planet;button.appendChild(extra);}
  button.onclick=()=>{selectedSave=slot.slot;for(const card of saveUI.querySelectorAll('.save-slot'))card.setAttribute('aria-pressed',String(Number(card.dataset.slot)===selectedSave));saveUI.querySelector('.save-load').disabled=false;saveUI.querySelector('.save-message').textContent='Selected slot '+slot.slot+': '+slot.captain+' / '+slot.ship;};
  saveUI.querySelector('.save-slots').appendChild(button);
 }
 saveUI.querySelector('.save-back').onclick=()=>saveCall('cancel');
 const tools=document.createElement('button');tools.type='button';tools.textContent='Original save tools';tools.onclick=()=>{saveUI.hidden=true;saveReturn.hidden=false;};saveUI.querySelector('.save-actions').insertBefore(tools,saveUI.querySelector('.save-load'));
 saveUI.querySelector('.save-load').onclick=()=>{if(selectedSave===null)return;const slot=selectedSave;runWithGameLoading('Loading saved game',()=>saveCall('load',slot),result=>{if(!result||!result.ok){saveUI.querySelector('.save-message').textContent=result?.error||'Unable to load this save.';return false;}});};
 if(!slots.some(slot=>slot.valid))saveUI.querySelector('.save-message').textContent='No playable saves found.';
}
