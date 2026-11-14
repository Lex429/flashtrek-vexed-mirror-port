(() => {
  'use strict';
  const stage=document.getElementById('game'),overlay=document.createElement('section');
  overlay.id='pause-menu';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Pause menu');
  overlay.innerHTML=`<div class="pause-card"><span class="pause-kicker">COMMAND</span><h2 data-pause-title>Paused</h2>
    <p style="max-width:420px;color:#a9c5d3;font-size:13px;line-height:1.7">W / &uarr; Thrust toward nose &middot; A/D Turn<br>Tap S / &darr; Drift &middot; Hold S / &darr; Stop<br>Press S / &darr; again at rest to reverse<br>Tap X Full stop &middot; Q Quick turnaround<br>Shift Smart target &middot; Quick taps Cycle &middot; Hold Clear<br>Space Fire at the locked target</p>
    <p class="controller-help"><strong>Controller</strong><br>Left stick: steer toward the direction pushed; tilt farther for stronger thrust<br>D-pad: keyboard flight — Up thrust, Left/Right turn, Down drift / brake / reverse<br>L1: full stop · Create / Share: map · Touchpad click: inventory · Options: pause<br>R2: fire · Squeeze L2: select / cycle targets<br>Map: D-pad / stick browse · ✕ open system / destination / chosen action<br>L2 / R2 zoom · ○ / B back one view · R3 center on your ship<br>✕: dock / port services / mine / confirm · ○: back / cancel / undock<br>□: inventory shortcut · △: map shortcut<br>Center the stick after closing a menu</p>
    <div class="pause-home"><button data-resume>Resume</button><button data-options>Options</button><button data-save>Save game</button><button data-hub>Return to games</button></div>
    <div class="pause-options" hidden><p>Choose how the game fills your screen.</p><div class="display-choices">
      <button data-display="fullscreen"><strong>Full screen</strong><span>Fill your monitor.</span></button>
      <button data-display="windowed"><strong>Windowed</strong><span>Fill the browser area.</span></button>
      <button data-display="classic"><strong>Classic view</strong><span>Centered original 4:3 layout.</span></button>
    </div><p><button id="pause-sound-toggle" type="button">Sound effects on</button></p><p><button id="pause-vibration-toggle" type="button">Damage vibration on</button> <button id="pause-vibration-test" type="button">Test vibration</button></p><p><button id="pause-vibration-direct" type="button">Enable DualSense vibration</button></p><p id="pause-vibration-status"></p><p class="pause-feedback" role="status"></p><button data-back>Back</button></div></div>`;
  stage.appendChild(overlay);
  const home=overlay.querySelector('.pause-home'),options=overlay.querySelector('.pause-options');
  let bridge=null,returnFocus=null,disabled=[],inertChildren=[];
  function feedback(text){overlay.querySelector('.pause-feedback').textContent=text;}
  function sync(){for(const button of overlay.querySelectorAll('[data-display]'))button.setAttribute('aria-pressed',String(button.dataset.display===window.nativeView.selection));const sound=overlay.querySelector('#pause-sound-toggle'),enabled=window.nativeMenuSounds?.enabled!==false;sound.textContent=enabled?'Sound effects on':'Sound effects off';sound.setAttribute('aria-pressed',String(enabled));}
  function syncVibration(){
    const state=window.nativeControllerHaptics?.inspect()||{enabled:true,status:'disconnected'},toggle=overlay.querySelector('#pause-vibration-toggle'),test=overlay.querySelector('#pause-vibration-test');
    toggle.textContent=state.enabled?'Damage vibration on':'Damage vibration off';toggle.setAttribute('aria-pressed',String(state.enabled));test.disabled=!state.enabled||!state.supported||state.directConnecting;
    const direct=overlay.querySelector('#pause-vibration-direct');direct.disabled=!state.directAvailable||state.directConnecting||state.directConnected;direct.textContent=state.directConnecting?'Connecting DualSense…':state.directConnected?'DualSense connected directly':'Connect DualSense';
    overlay.querySelector('#pause-vibration-status').textContent=state.directError|| (state.status==='ready'?(state.directConnected?`Direct DualSense ready (${state.transport}). Buttons and sticks can use this connection too. Press Test vibration.`:state.singleChannel?'Vibration available. This controller uses a single rumble channel.':'Vibration available. Hit direction uses approximate rumble patterns.'):state.status==='off'?'Damage vibration is off.':state.directAvailable?'Vibration needs setup. If buttons are not detected, select Connect DualSense. In the browser picker, click the controller name first to enable Connect, then click Connect.':state.status==='unsupported'?'This browser does not expose vibration or direct controller access. Try opening this game in Chrome or Edge.':'Click inside the game, then press a controller button to check support.');
  }
  overlay.querySelector('#pause-vibration-toggle').onclick=()=>{const api=window.nativeControllerHaptics;if(api)api.setEnabled(!api.inspect().enabled);syncVibration();};
  overlay.querySelector('#pause-vibration-test').onclick=async()=>{const ok=await window.nativeControllerHaptics?.test();syncVibration();feedback(ok?'Vibration test sent.':'Vibration could not start on this controller connection.');};
  overlay.querySelector('#pause-vibration-direct').onclick=async()=>{const ok=await window.nativeControllerHaptics?.connectDirect();syncVibration();feedback(ok?'DualSense connected directly. Press Test vibration.':'Direct vibration was not connected. Try again: click the controller name in the browser picker, then click Connect.');};
  addEventListener('native-hapticschange',syncVibration);
  overlay.querySelector('#pause-sound-toggle').onclick=()=>window.nativeMenuSounds?.setEnabled(!window.nativeMenuSounds.enabled);
  addEventListener('native-soundchange',sync);
  function show(screen='home'){
    if(window.nativePlayerDestruction?.active)return;
    if(overlay.hidden){
      returnFocus=document.activeElement;overlay.hidden=false;
      dispatchEvent(new CustomEvent('native-pausechange',{detail:{paused:true,at:performance.now()}}));
      bridge?.prepare();document.body.classList.add('paused');bridge?.clearInput();
      disabled=Array.from(document.querySelectorAll('.game-actions button,#save'),button=>({button,disabled:button.disabled}));for(const {button} of disabled)button.disabled=true;
      inertChildren=Array.from(stage.children).filter(child=>child!==overlay).map(child=>({child,inert:child.inert}));for(const {child} of inertChildren)child.inert=true;
    }
    home.hidden=screen==='options';options.hidden=screen!=='options';for(const guide of overlay.querySelectorAll('.pause-card > p'))guide.hidden=screen==='options';feedback('');sync();syncVibration();
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
    if(window.nativePlayerDestruction?.active)return;
    if(window.nativeCollectablesView?.active){if(event.key==='Escape'&&!event.repeat){event.preventDefault();event.stopImmediatePropagation();window.nativeCollectablesView.close();}return;}
    if(window.nativeOpeningCinematic?.active)return;
    if(window.nativeShipLootView?.active){if(event.key==='Escape'&&!event.repeat){event.preventDefault();event.stopImmediatePropagation();window.nativeShipLootView.close();}return;}
    if(event.key==='Escape'){
      if(!document.getElementById('startup').hidden||event.repeat)return;
      if(window.nativeShipInventory?.active){event.preventDefault();event.stopImmediatePropagation();window.nativeShipInventory.close();return;}
      if(window.nativeShipyardServices?.active){event.preventDefault();event.stopImmediatePropagation();window.nativeShipyardServices.close();return;}
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
  document.addEventListener('fullscreenchange',()=>{const fullscreen=!!document.fullscreenElement;sync();if(wasFullscreen&&!fullscreen&&overlay.hidden&&bridge?.active()&&!window.nativeOpeningCinematic?.active)show();wasFullscreen=fullscreen;});
  addEventListener('native-displaychange',sync);
  const mainOptions=document.querySelector('[data-menu="options"]');mainOptions.disabled=false;mainOptions.onclick=()=>show('options');
  document.getElementById('pauseBtn').onclick=()=>show();
  document.getElementById('fullscreen').onclick=()=>window.nativeView.choose(document.fullscreenElement?'windowed':'fullscreen').catch(()=>show('options'));
  window.nativePause={attach(value){bridge=value;},open:show,close,toggle(){overlay.hidden?show():close();},get active(){return !overlay.hidden;}};
})();
