const menuControls=document.createElement('nav');
menuControls.id='main-menu-controls';
menuControls.setAttribute('aria-label','Main menu');
menuControls.innerHTML='<button type="button" data-menu="new">New Game</button><button type="button" data-menu="instructions" disabled>Instructions</button><button type="button" data-menu="continue" disabled>Continue</button><button type="button" data-menu="options" disabled>Options</button><button type="button" data-menu="dev">Dev</button>';
menuArt.appendChild(menuControls);
menuControls.querySelector('[data-menu="new"]').addEventListener('click',()=>window.startNativeNewGame());
menuControls.querySelector('[data-menu="dev"]').addEventListener('click',()=>window.startNativeDevGame());
