const deathUI=document.createElement('section');deathUI.id='death-ui';deathUI.hidden=true;
deathUI.setAttribute('aria-label','Recover your saved game');
deathUI.innerHTML='<div><p class="death-kicker">COMMAND RECOVERY</p><h2>Your ship was destroyed</h2><p class="death-copy">Return to this game’s last saved point.</p><p class="death-error" role="alert"></p><button class="death-resume" type="button">Reincarnate</button><button class="death-menu" type="button">Main menu</button></div>';
game.appendChild(deathUI);
const deathStyle=document.createElement('style');deathStyle.textContent='#death-ui{position:absolute;inset:0;z-index:15;display:grid;place-items:center;background:#05090f;color:#d9e6f1;text-align:center;padding:8%}#death-ui[hidden]{display:none}#death-ui h2{font-size:clamp(18px,3cqw,30px);margin:12px 0}#death-ui .death-kicker{color:#d18791;letter-spacing:.18em;font-size:11px}#death-ui .death-copy{color:#9baabd;font-size:14px}#death-ui .death-error{color:#ffabb0;font-size:13px;max-width:38em}#death-ui button{margin:8px}#death-ui .death-resume{background:#733540;border-color:#a85765}';document.head.appendChild(deathStyle);
function reincarnateCall(action){return player.ruffle().callExternalInterface('vexReincarnate',action);}
function restoreAfterDeath(){
 runWithGameLoading('Restoring your saved point',()=>reincarnateCall('restore'),result=>{
  if(!result?.ok){deathUI.hidden=false;deathUI.querySelector('.death-error').textContent=result?.error||'Unable to restore this saved point.';return false;}
 });
}
function renderDeath(frame){
 deathUI.hidden=frame!==182;
 if(frame===182){
  const state=reincarnateCall('state');deathUI.querySelector('.death-error').textContent=state?.ok?'':state?.error||'No saved point is available.';
 }
 // Catch the original native button too, before its restart sequence reaches 197.
 if(frame===184)restoreAfterDeath();
}
deathUI.querySelector('.death-resume').onclick=restoreAfterDeath;
deathUI.querySelector('.death-menu').onclick=()=>reincarnateCall('menu');
