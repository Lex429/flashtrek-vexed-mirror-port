const menuControls=document.createElement('nav');menuControls.id='main-menu-controls';menuControls.setAttribute('aria-label','Main menu');
menuControls.innerHTML='<button type="button" data-menu="new">New Game</button><button type="button" data-menu="instructions">Instructions</button><button type="button" data-menu="continue">Continue</button><button type="button" data-menu="options">Options</button><p class="menu-error" role="alert"></p>';
menuArt.appendChild(menuControls);
const menuDialog=document.createElement('section');menuDialog.id='main-menu-dialog';menuDialog.hidden=true;menuDialog.setAttribute('role','dialog');menuDialog.setAttribute('aria-modal','true');game.appendChild(menuDialog);
let menuDialogAction=null;
function closeMenuDialog(){menuDialog.hidden=true;menuControls.querySelector(`[data-menu="${menuDialogAction}"]`)?.focus();menuDialogAction=null;}
function openMenuDialog(action){
 menuDialogAction=action;menuDialog.hidden=false;
 if(action==='instructions')menuDialog.innerHTML='<div class="menu-dialog-card"><p class="menu-dialog-kicker">COMMAND MANUAL</p><h2>Explore. Trade. Command.</h2><p>Choose a faction and name your captain, ship, and government. Explore systems, trade cargo, upgrade your ship, and build your fleet.</p><dl><dt>Arrow keys</dt><dd>Accelerate, brake, and turn.</dd><dt>Weapons</dt><dd>Select a target and use the weapon controls.</dd><dt>S</dt><dd>Raise or lower shields.</dd><dt>Navigation</dt><dd>Use the Interstellar map and Sol system buttons.</dd></dl><p>Continue loads a saved game. After death, Reincarnate returns to your last saved point.</p><button type="button" class="menu-dialog-close">Back to menu</button></div>';
 else menuDialog.innerHTML='<div class="menu-dialog-card"><p class="menu-dialog-kicker">SYSTEM SETTINGS</p><h2>Options</h2><div class="menu-option-buttons"><button type="button" data-setting="sound">'+sound.textContent+'</button><button type="button" data-setting="size">'+(large?'Comfortable view':'Larger view')+'</button><button type="button" data-setting="fullscreen">Full screen</button></div><button type="button" class="menu-dialog-close">Back to menu</button></div>';
 menuDialog.querySelector('.menu-dialog-close').onclick=closeMenuDialog;
 for(const button of menuDialog.querySelectorAll('[data-setting]'))button.onclick=()=>{document.getElementById(button.dataset.setting).click();button.textContent=button.dataset.setting==='sound'?sound.textContent:button.dataset.setting==='size'?(large?'Comfortable view':'Larger view'):'Full screen';};
 menuDialog.querySelector('button').focus();
}
for(const button of menuControls.querySelectorAll('[data-menu]'))button.onclick=()=>{
 const action=button.dataset.menu;
 if(action==='instructions'||action==='options'){openMenuDialog(action);return;}
 const result=player.ruffle().callExternalInterface('vexMenu',action);
 menuControls.querySelector('.menu-error').textContent=result?.ok?'':result?.error||'Unable to open this screen.';
};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menuDialog.hidden){event.preventDefault();closeMenuDialog();}});
new MutationObserver(()=>{if(Number(game.dataset.frame)!==106){menuDialog.hidden=true;menuDialogAction=null;}}).observe(game,{attributes:true,attributeFilter:['data-frame']});
