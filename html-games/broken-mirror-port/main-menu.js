const menuControls=document.createElement('nav');
menuControls.id='main-menu-controls';
menuControls.setAttribute('aria-label','Main menu');
menuControls.innerHTML='<button type="button" data-menu="new">New Game</button><button type="button" data-menu="instructions" disabled>Instructions</button><button type="button" data-menu="continue" disabled>Continue</button><button type="button" data-menu="continue-dev" disabled>Continue Dev</button><button type="button" data-menu="options" disabled>Options</button><button type="button" data-menu="dev">Dev</button>';
menuArt.appendChild(menuControls);
menuControls.querySelector('[data-menu="new"]').addEventListener('click',()=>window.startNativeNewGame());
menuControls.querySelector('[data-menu="dev"]').addEventListener('click',()=>window.startNativeDevGame());

// Keep the sword visible before handing off to the existing menu action.
const menuReducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let menuSelection=null,menuDispatching=false;
const menuHover=event=>{
  const button=event.target.closest('button[data-menu]');
  if(!button||button.disabled||button.hidden||button.closest('[inert]')||menuArt.hidden||menuSelection)return;
  if(event.relatedTarget&&button.contains(event.relatedTarget))return;
  window.nativeMenuSounds?.play('hover');
};
menuControls.addEventListener('pointerover',menuHover);
menuControls.addEventListener('focusin',menuHover);
menuControls.addEventListener('click',event=>{
  const button=event.target.closest('button[data-menu]');
  if(!button||button.disabled||button.hidden||menuDispatching)return;
  if(menuSelection){event.preventDefault();event.stopImmediatePropagation();return;}
  window.nativeMenuSounds?.play('press');
  if(menuReducedMotion.matches){window.nativeMenuSounds?.play('confirm',.12);return;}
  event.preventDefault();event.stopImmediatePropagation();
  const bounds=button.getBoundingClientRect();
  const percent=(value,start,size)=>`${Math.max(0,Math.min(100,(value-start)/Math.max(1,size)*100))}%`;
  button.style.setProperty('--menu-click-x',event.detail?percent(event.clientX,bounds.left,bounds.width):'50%');
  button.style.setProperty('--menu-click-y',event.detail?percent(event.clientY,bounds.top,bounds.height):'50%');
  button.classList.remove('menu-activating');void button.offsetWidth;button.classList.add('menu-activating');
  menuSelection=button;
  const valid=()=>button.isConnected&&!button.disabled&&!button.hidden&&!button.closest('[inert]')&&!menuArt.hidden;
  const finish=()=>{menuSelection=null;button.classList.remove('menu-activating');};
  const activate=()=>{
    if(!valid())return false;
    menuDispatching=true;
    try{button.click();}finally{menuDispatching=false;}
    return true;
  };
  if(window.nativeMenuTransition)window.nativeMenuTransition.start({valid,activate,finish,fadeOut:()=>window.nativeMenuSounds?.play('confirm')});
  else{activate();finish();}
},true);
