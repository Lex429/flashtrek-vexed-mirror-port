(() => {
  'use strict';
  const stage=document.getElementById('game'),overlay=document.createElement('section');
  overlay.id='pause-menu';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Pause menu');
  overlay.innerHTML=`<div class="pause-card"><span class="pause-kicker">COMMAND</span><h2 data-pause-title>Paused</h2>
    <div class="pause-home"><button data-resume>Resume</button><button data-options>Options</button><button data-save>Save game</button><button data-hub>Return to games</button></div>
    <div class="pause-options" hidden><p>Choose how the game fills your screen.</p><div class="display-choices">
      <button data-display="fullscreen"><strong>Full screen</strong><span>Fill your monitor.</span></button>
      <button data-display="windowed"><strong>Windowed</strong><span>Fill the browser area.</span></button>
      <button data-display="classic"><strong>Classic view</strong><span>Centered original 4:3 layout.</span></button>
    </div><p class="pause-feedback" role="status"></p><button data-back>Back</button></div></div>`;
  stage.appendChild(overlay);
  const home=overlay.querySelector('.pause-home'),options=overlay.querySelector('.pause-options');
  let bridge=null,returnFocus=null,disabled=[],inertChildren=[];
  function feedback(text){overlay.querySelector('.pause-feedback').textContent=text;}
  function sync(){for(const button of overlay.querySelectorAll('[data-display]'))button.setAttribute('aria-pressed',String(button.dataset.display===window.nativeView.selection));}
  function show(screen='home'){
    if(overlay.hidden){
      returnFocus=document.activeElement;overlay.hidden=false;
      dispatchEvent(new CustomEvent('native-pausechange',{detail:{paused:true,at:performance.now()}}));
      bridge?.prepare();document.body.classList.add('paused');bridge?.clearInput();
      disabled=Array.from(document.querySelectorAll('.game-actions button,#save'),button=>({button,disabled:button.disabled}));for(const {button} of disabled)button.disabled=true;
      inertChildren=Array.from(stage.children).filter(child=>child!==overlay).map(child=>({child,inert:child.inert}));for(const {child} of inertChildren)child.inert=true;
    }
    home.hidden=screen==='options';options.hidden=screen!=='options';feedback('');sync();
    const active=!!bridge?.active();overlay.querySelector('[data-save]').hidden=!active;
    overlay.querySelector('[data-resume]').textContent=active?'Resume':'Back to menu';overlay.querySelector('[data-pause-title]').textContent=screen==='options'?'Options':active?'Paused':'Game menu';
    overlay.querySelector(screen==='options'?`[data-display="${window.nativeView.selection}"]`:'[data-resume]').focus({preventScroll:true});
  }
  function close(){
    if(overlay.hidden)return;
    overlay.hidden=true;dispatchEvent(new CustomEvent('native-pausechange',{detail:{paused:false,at:performance.now()}}));document.body.classList.remove('paused');bridge?.clearInput();
    for(const {button,disabled:wasDisabled} of disabled)button.disabled=wasDisabled;disabled=[];
    for(const {child,inert} of inertChildren)child.inert=inert;inertChildren=[];
    if(returnFocus?.isConnected&&!returnFocus.closest('[hidden]'))returnFocus.focus({preventScroll:true});else document.getElementById('space').focus({preventScroll:true});
  }
  overlay.querySelector('[data-resume]').onclick=close;overlay.querySelector('[data-options]').onclick=()=>show('options');overlay.querySelector('[data-back]').onclick=()=>show('home');
  overlay.querySelector('[data-save]').onclick=()=>{const result=bridge?.save();overlay.querySelector('[data-pause-title]').textContent=result?.ok?'Game saved':'Save failed';};
  overlay.querySelector('[data-hub]').onclick=async()=>{if(bridge?.active()&&!bridge.save()?.ok){overlay.querySelector('[data-pause-title]').textContent='Save failed';return;}if(document.fullscreenElement)await document.exitFullscreen();if(parent!==window&&typeof parent.closeOverlay==='function')parent.closeOverlay();else close();};
  for(const button of overlay.querySelectorAll('[data-display]'))button.onclick=async()=>{try{await window.nativeView.choose(button.dataset.display);sync();feedback('Display updated.');}catch{feedback('Full screen could not open. You can use Windowed or Classic view.');sync();}};
  addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      if(!document.getElementById('startup').hidden||event.repeat)return;
      if(window.nativeGalaxyMap?.isOpen){event.preventDefault();event.stopImmediatePropagation();window.nativeGalaxyMap.close();return;}
      if(window.nativeSetup?.active){event.preventDefault();event.stopImmediatePropagation();window.nativeSetup.back();return;}
      event.preventDefault();event.stopImmediatePropagation();if(!overlay.hidden){if(!options.hidden)show('home');else close();}else show();return;
    }
    if(overlay.hidden)return;event.stopImmediatePropagation();
    if(event.key==='Tab'){
      const targets=Array.from(overlay.querySelectorAll('button')).filter(button=>button.getClientRects().length&&!button.disabled),first=targets[0],last=targets.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  },true);
  let wasFullscreen=!!document.fullscreenElement;
  document.addEventListener('fullscreenchange',()=>{const fullscreen=!!document.fullscreenElement;sync();if(wasFullscreen&&!fullscreen&&overlay.hidden&&bridge?.active())show();wasFullscreen=fullscreen;});
  addEventListener('native-displaychange',sync);
  const mainOptions=document.querySelector('[data-menu="options"]');mainOptions.disabled=false;mainOptions.onclick=()=>show('options');
  document.getElementById('pauseBtn').onclick=()=>show();
  document.getElementById('fullscreen').onclick=()=>window.nativeView.choose(document.fullscreenElement?'windowed':'fullscreen').catch(()=>show('options'));
  window.nativePause={attach(value){bridge=value;},open:show,close,toggle(){overlay.hidden?show():close();},get active(){return !overlay.hidden;}};
})();
