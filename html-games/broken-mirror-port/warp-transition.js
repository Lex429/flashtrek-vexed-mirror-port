/* Departure, live warp flight, a saved journey report, and manual arrival. */
(() => {
  'use strict';
  const stage = document.getElementById('game');
  const overlay = document.createElement('section');
  overlay.id = 'warp-transition';overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Warp journey');
  overlay.innerHTML = `
    <div class="warp-flash" aria-hidden="true"></div><canvas class="warp-space" aria-label="Your ship travelling through warp"></canvas>
    <section class="warp-report" hidden aria-label="Journey report">
      <div class="warp-report-heading"><span class="warp-kicker">JOURNEY REPORT</span></div>
      <div class="warp-elapsed"><strong data-days></strong><div><span>DAYS ELAPSED</span><b data-stardate></b></div></div>
      <div class="warp-destination"><div data-emblem></div><div><span class="warp-kicker">DESTINATION SYSTEM</span><h2 data-system></h2><span data-government></span></div></div>
      <dl class="warp-readings"><div><dt>Your standing</dt><dd data-standing></dd></div><div><dt>Local prestige</dt><dd data-prestige></dd></div><div><dt>Antimatter used</dt><dd data-fuel-used></dd></div><div><dt>Antimatter aboard</dt><dd data-fuel-remaining></dd></div></dl>
      <div class="warp-bulletins"><h3>During your journey</h3><ol data-events></ol></div>
      <div class="warp-report-footer"><div class="warp-readiness" role="status" aria-live="polite"><span data-loading>Preparing destination…</span><div class="warp-progress" role="progressbar" aria-label="Destination preparation" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div><button class="warp-continue" type="button" disabled>Continue <span aria-hidden="true">→</span></button></div>
    </section>
    <section class="warp-error" hidden><span class="warp-kicker">TRANSIT CONTROL</span><h2>Arrival preparation interrupted</h2><p>Your course is saved. Retry loading the arrival scene or return to flight.</p><div><button class="warp-retry" type="button">Retry</button><button class="warp-cancel" type="button">Return to flight</button></div></section>

  `;
  stage.appendChild(overlay);
  const canvas = overlay.querySelector('canvas'), ctx = canvas.getContext('2d');
  const panel = overlay.querySelector('.warp-report'), errorPanel = overlay.querySelector('.warp-error');
  const continueButton = overlay.querySelector('.warp-continue');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const standings = {'Allied':'#4ab3ff', 'Hostile':'#ff6d76', 'Your territory':'#50e3b1', 'Neutral':'#c4d4df'};
  const icons = {1:2, 2:3, 3:7, 5:6, 6:5, 7:4, 12:1, 14:8};
  const durations=()=>({alignment:reduced.matches?180:Math.max(1100,Math.min(3600,Math.abs(wrap((session.courseAngle??0)-(session.originAngle??0)))*950+900)),charging:reduced.matches?280:1200,departure:reduced.matches?240:window.vexedRebirthWarp.departureMs,cruise:reduced.matches?250:950,arrival:reduced.matches?280:1100});
  const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle)),smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
  let session = null, phase = 'idle', phaseTime = 0, time = 0, last = 0, raf = 0, generation = 0;
  let loaded=0,assetsReady=false,assets={},committed=false,disabledControls=[],planReady=false,sceneRequested=false,sceneFrames=0,sceneResolve=null,cruiseResolve=null,arrivalFadeResolve=null,aborter=null,recovery=null,finalizing=false,lastError=null;
  let releaseBackground=null,handoffReady=false;
  let flightView={w:600,h:450};
  overlay.tabIndex=-1;
  const soundEnabled = localStorage.getItem('vexed-warp-sound') !== 'off';
  let audioContext, audioGain, oscillator;
  const enterSound = new Audio('assets/warp/rebirth-warpout.mp3');
  const dropSound = new Audio('assets/warp/rebirth-warpin.mp3');
  enterSound.volume = .5;dropSound.volume = .6;
  const starfield = window.vexedWarpStarfield.create();

  function prepareAudio() {
    if(!soundEnabled||audioContext)return;
    try {
      audioContext=new (window.AudioContext||window.webkitAudioContext)();
      audioGain=audioContext.createGain();audioGain.gain.value=0;
      const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=340;
      oscillator=audioContext.createOscillator();oscillator.type='sawtooth';oscillator.frequency.value=58;
      oscillator.connect(filter);filter.connect(audioGain);audioGain.connect(audioContext.destination);oscillator.start();
      audioContext.resume().catch(()=>{});
    } catch {}
  }
  function hum(enabled) {
    if (!enabled) {audioGain?.gain.setTargetAtTime(0,audioContext.currentTime,.1);return;}
    prepareAudio();
    try{audioContext?.resume().catch(()=>{});audioGain?.gain.setTargetAtTime(.018,audioContext.currentTime,.3);}catch{}
  }
  function effect(audio) {if(soundEnabled){audio.currentTime=0;audio.play().catch(()=>{});}}
  let nearbySoundAt=-Infinity;
  function playNearby(kind,distance){
    if(!soundEnabled||phase!=='idle'||distance>900||performance.now()-nearbySoundAt<250)return;
    const audio=(kind==='departure'?enterSound:dropSound).cloneNode();
    audio.volume=(kind==='departure'?.5:.6)*.7*Math.max(.1,1-distance/1000);
    nearbySoundAt=performance.now();audio.play().catch(()=>{});
  }
  function setText(selector,value){overlay.querySelector(selector).textContent=String(value);}
  function progress(value,text){
    loaded=Math.max(loaded,Math.min(100,Math.round(value)));setText('[data-loading]',text);
    overlay.querySelector('.warp-progress').setAttribute('aria-valuenow',String(loaded));overlay.querySelector('.warp-progress i').style.transform='scaleX('+(loaded/100)+')';
  }
  function setPhase(value){
    const edge=(phase==='idle')!==(value==='idle'),at=performance.now();phase=value;phaseTime=0;overlay.dataset.phase=value;
    if(edge)dispatchEvent(new CustomEvent('native-flightgatechange',{detail:{at}}));
    if(value==='cruise'){hum(soundEnabled);cruiseResolve?.();cruiseResolve=null;}
    if(value==='charging')hum(soundEnabled);
    if(value==='arrival')hum(false);
  }
  function freezeControls(){
    disabledControls=Array.from(document.querySelectorAll('.game-actions button:not(#pauseBtn),#save'),button=>({button,disabled:button.disabled}));
    for(const {button} of disabledControls)button.disabled=true;
    document.body.classList.add('warping');stage.setAttribute('aria-busy','true');
  }
  function clean(){
    const edge=phase!=='idle',at=performance.now();++generation;aborter?.abort();cancelAnimationFrame(raf);raf=0;
    sceneResolve?.();cruiseResolve?.();arrivalFadeResolve?.();sceneResolve=null;cruiseResolve=null;arrivalFadeResolve=null;
    overlay.hidden=true;panel.hidden=true;errorPanel.hidden=true;phase='idle';overlay.dataset.phase='idle';
    assets={};assetsReady=false;sceneRequested=false;finalizing=false;handoffReady=false;
    releaseBackground?.();releaseBackground=null;
    if(edge)dispatchEvent(new CustomEvent('native-flightgatechange',{detail:{at}}));
    document.body.classList.remove('warping');stage.removeAttribute('aria-busy');
    for(const {button,disabled} of disabledControls)button.disabled=disabled;disabledControls=[];
    hum(false);enterSound.pause();dropSound.pause();session=null;
  }
  function fail(error,retry=null){
    lastError=String(error.message||error);
    recovery=retry;assetsReady=false;continueButton.disabled=true;overlay.dataset.ready='false';
    aborter?.abort();setPhase('error');panel.hidden=true;errorPanel.hidden=false;
    overlay.querySelector('.warp-error p').textContent=(committed?'Your journey is saved. Retry destination preparation or return to flight. ':'Your departure remains unchanged. Retry preparation or return to flight. ')+lastError;
    overlay.querySelector('.warp-retry').focus();session?.onError?.(error);
  }
  async function prepare(token){
    loaded=0;assetsReady=false;sceneRequested=false;sceneFrames=0;planReady=false;assets={};recovery=null;
    aborter?.abort();aborter=new AbortController();const signal=aborter.signal;
    const check=()=>{if(token!==generation||signal.aborted)throw Error('Journey cancelled.');};
    const settle=promise=>Promise.resolve(promise).then(value=>({value}),error=>({error}));
    progress(0,'Plotting course…');
    try{
      prepareAudio();
      await new Promise(resolve=>requestAnimationFrame(resolve));check();
      const origin=settle(Promise.all([
        window.vexedFlightAssets.loadShip(session.report.shipType,session.report.hull),window.vexedFlightAssets.loadWarpRing(),
        window.vexedFlightAssets.loadPlanet(session.report.originId)
      ]));
      const destinationPlanet=settle(window.vexedFlightAssets.loadPlanet(session.report.systemId));
      if(!committed){await session.prepareDeparture?.(signal);check();}
      const base=await origin;check();if(base.error)throw base.error;assets.originShip=base.value[0];assets.ship=base.value[0];
      releaseBackground??=window.nativeDamageArtPreparation?.holdBackground?.();
      if(!committed&&session.prepareTransit)session.report=await session.prepareTransit(signal);
      check();progress(15,'Preparing destination…');
      const destination=settle(session.prepareDestination?.(signal,(done,total)=>progress(20+55*(total?done/total:1),'Preparing destination…')));
      const targetShip=settle(window.vexedFlightAssets.loadShip(session.report.shipType,session.report.hull));
      const planet=await destinationPlanet;check();if(planet.error)throw planet.error;
      const ready=await destination;check();if(ready.error)throw ready.error;assets.scene=ready.value;
      const ship=await targetShip;check();if(ship.error)throw ship.error;assets.ship=ship.value;
      populateReport();panel.hidden=false;
      const emblem=panel.querySelector('[data-emblem] img');
      if(emblem?.decode)await emblem.decode().catch(()=>{});
      check();
      // Allocate the tunnel raster behind the native turning/charging ship.
      await new Promise(resolve=>requestAnimationFrame(resolve));check();
      const view=window.nativeView.fit(canvas,ctx);
      paintTunnelShip(view.w/2,view.h/2,Math.max(100,session.shipWidth||40),1,0);
      await new Promise(resolve=>requestAnimationFrame(resolve));check();
      planReady=true;
      if(['alignment','charging','departure'].includes(phase))await new Promise(resolve=>{cruiseResolve=resolve;});
      check();
      if(!committed){await session.commit(signal);check();committed=true;}
      progress(85,'Preparing arrival view…');sceneRequested=true;
      await new Promise(resolve=>{sceneResolve=resolve;});check();
      assetsReady=true;overlay.dataset.ready='true';progress(100,'Destination ready');
      if(phase==='report')continueButton.disabled=false;
    }catch(error){if(token===generation&&!signal.aborted)fail(error);}
  }
  function populateReport(){
    const report=session.report;
    setText('[data-days]',report.elapsedDays??0);setText('[data-stardate]',`STARDATE / DAY ${report.day??1}`);setText('[data-system]',report.destinationName||report.systemName||session.destinationLabel||'Destination');
    setText('[data-government]',report.governmentName||'');setText('[data-standing]',report.standing||'');
    overlay.querySelector('[data-standing]').style.color=window.nativeFactionStanding?.colors[report.standing]||standings[report.standing]||'#c4d4df';
    setText('[data-prestige]',`${Math.floor(report.prestige||0)}%`);setText('[data-fuel-used]',`${report.fuelUsed||0} t`);setText('[data-fuel-remaining]',`${report.fuelRemaining??0} t`);
    const icon=icons[report.governmentId];overlay.querySelector('[data-emblem]').innerHTML=icon?`<img src="startup/factions/faction-${icon}.png" alt="${escape(report.governmentName)} emblem">`:'<span aria-hidden="true">◇</span>';
    overlay.querySelector('[data-events]').innerHTML=(report.events||[]).map(event=>`<li class="warp-event-${escape(event.kind)}"><strong>${escape(event.title)}</strong><p>${escape(event.text)}</p></li>`).join('');
  }
  function showReport(){
    setPhase('report');panel.hidden=false;errorPanel.hidden=true;continueButton.disabled=!assetsReady;
  }
  function start(options){
    if(phase!=='idle')return {ok:false,error:'A journey is already in progress.'};
    session=options;committed=!!options.resumed;time=0;last=0;finalizing=false;handoffReady=false;lastError=null;
    panel.hidden=true;errorPanel.hidden=true;continueButton.disabled=true;overlay.dataset.ready='false';
    overlay.hidden=false;freezeControls();setPhase(options.resumed?'charging':'alignment');overlay.focus({preventScroll:true});
    prepare(++generation);return {ok:true};
  }
  async function beginArrival(){
    const token=generation;continueButton.disabled=true;progress(100,'Entering system…');setPhase('arrival-preparing');
    try{
      const fade=reduced.matches?Promise.resolve():new Promise(resolve=>{arrivalFadeResolve=resolve;});
      await Promise.all([session.beginArrival?.(aborter.signal),fade]);if(token!==generation)return;
      panel.hidden=true;setPhase('arrival');effect(dropSound);
    }catch(error){if(token===generation)fail(error,beginArrival);}
  }
  continueButton.onclick=()=>{if(phase==='report'&&assetsReady&&!continueButton.disabled)beginArrival();};
  async function finishArrival(){
    if(finalizing)return;finalizing=true;const token=generation;
    try{await session.finish?.(aborter.signal);if(token===generation){handoffReady=true;if(phase!=='arrival'||phaseTime>=durations().arrival)clean();}}
    catch(error){if(token===generation){finalizing=false;fail(error,finishArrival);}}
  }
  overlay.querySelector('.warp-retry').onclick=()=>{
    errorPanel.hidden=true;panel.hidden=true;overlay.dataset.ready='false';
    if(recovery){aborter=new AbortController();recovery();return;}
    setPhase(committed?'charging':'alignment');prepare(++generation);
  };
  overlay.querySelector('.warp-cancel').onclick=()=>{const cancel=session?.cancel,wasCommitted=committed;clean();cancel?.(wasCommitted);};
  overlay.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.code==='Space')&&!assetsReady&&phase!=='error'){event.preventDefault();return;}
    if((event.key==='Enter'||event.code==='Space')&&event.target.tagName==='BUTTON'&&!event.target.disabled){event.stopPropagation();return;}
    if(event.key!=='Tab')return;
    const targets=Array.from(overlay.querySelectorAll('button:not(:disabled)')).filter(button=>button.getClientRects().length),first=targets[0],last=targets[targets.length-1];
    if(!first){event.preventDefault();overlay.focus();return;}
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===overlay)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===overlay)){event.preventDefault();first.focus();}
  });
  function paintTunnelShip(x,y,width,alpha,visualTime){
    const asset=assets.ship||session.originShip,rasterWidth=Math.max(100,session.shipWidth||40);
    window.vexedFlightAssets.drawShip(ctx,asset,x,y,width,session.courseAngle??session.originAngle??0,visualTime,
      {kind:'cruise',alpha,warpPulse:.8,effectRate:60,rasterWidth,rasterHeight:asset? rasterWidth*asset.height/asset.width:undefined,imageSmoothingQuality:'low'});
  }
  function paintCruise(dt,view){
    const angle=session.courseAngle??session.originAngle??0,pan=smooth(time/2),portrait=view.w/view.h<1;
    starfield.resize(view.w,view.h);starfield.draw(ctx,dt,angle,reduced.matches,{intensity:1+pan});
    const x=view.w*(.5+(portrait?0:-.25)*pan),y=view.h*(.5+(portrait?-.3:.02)*pan);
    const width=(session.shipWidth||40)+(100-(session.shipWidth||40))*pan;
    paintTunnelShip(x,y,width,reduced.matches?1:smooth(time/.45),time*1000);
  }
  // The native host calls this once per frame. World and warp share a clock,
  // rather than painting mismatched phases from two independent RAF loops.
  function advance(dt,now){
    if(phase==='idle')return;
    const advancing=!document.hidden&&!window.nativePause?.active;
    const seconds=advancing?Math.min(.1,Math.max(0,dt)):0;last=now;phaseTime+=seconds*1000;
    if(advancing&&phase==='alignment'&&phaseTime>=durations().alignment)setPhase('charging');
    if(advancing&&phase==='charging'&&planReady&&phaseTime>=durations().charging){
      if(session.resumed){time=0;setPhase('cruise');}
      else{setPhase('departure');effect(enterSound);}
    }
    if(advancing&&phase==='departure'&&phaseTime>=durations().departure){time=0;setPhase('cruise');}
    if(['cruise','report','arrival-preparing','error'].includes(phase))time+=seconds;
    if(advancing&&phase==='cruise'&&planReady&&committed&&phaseTime>=durations().cruise)showReport();
    if(advancing&&phase==='arrival-preparing'&&phaseTime>=220){arrivalFadeResolve?.();arrivalFadeResolve=null;}
    const view=window.nativeView.fit(canvas,ctx);
    flightView=view;
    // The tunnel paints its own opaque background. Only the transparent
    // native-flight phases need a separate clear of this overlay canvas.
    if(['alignment','charging','departure','arrival'].includes(phase))ctx.clearRect(0,0,view.w,view.h);
    else paintCruise(seconds,view);
    // Finish the durable handoff while the camera is still easing in. Keep the
    // cinematic on screen until its own end, without a frozen save tail.
    if(advancing&&phase==='arrival'&&phaseTime>=Math.max(0,durations().arrival-600))finishArrival();
    if(advancing&&phase==='arrival'&&handoffReady&&phaseTime>=durations().arrival)clean();
  }
  window.vexedWarp={start,playNearby,advance,prepareAudio,reset:clean,
    acknowledgeScene(system){if(!sceneRequested||assetsReady||Number(system)!==Number(session?.report.systemId))return;sceneFrames++;if(sceneFrames>=2){sceneRequested=false;sceneResolve?.();sceneResolve=null;}},
    get active(){return phase!=='idle';},get phase(){return phase;},get assetsReady(){return assetsReady;},get assetProgress(){return loaded;},
    get coversWorld(){return !['idle','alignment','charging','departure','arrival'].includes(phase);},get needsSceneWarmup(){return sceneRequested;},
    get flightEffect(){
      if(sceneRequested)return window.vexedRebirthWarp.arrival(sceneFrames===0?0:durations().arrival,session.arrivalAngle??session.courseAngle??0,{duration:durations().arrival});
      if(phase==='alignment')return window.vexedRebirthWarp.alignment(phaseTime,session.originAngle??0,session.courseAngle??session.originAngle??0,durations().alignment);
      if(phase==='charging')return window.vexedRebirthWarp.charging(phaseTime,session.courseAngle??session.originAngle??0,durations().charging);
      if(phase==='departure')return window.vexedRebirthWarp.departure(phaseTime,session.courseAngle??session.originAngle??0,{duration:durations().departure,cinematic:true,view:flightView,reducedMotion:reduced.matches});
      if(phase==='arrival')return window.vexedRebirthWarp.arrival(phaseTime,session.arrivalAngle??session.courseAngle??0,{duration:durations().arrival});return null;
    },
    get flightShip(){return ['alignment','charging','departure'].includes(phase)?session?.originShip||assets.originShip||assets.ship:assets.ship;},get report(){return session?.report||null;},
    snapshot(){return {phase,phaseTime,courseAngle:session?.courseAngle,originAngle:session?.originAngle,audioReady:!soundEnabled||!!audioContext,prepared:planReady,ready:assetsReady,progress:loaded,committed,sceneFrames,handoffReady,error:lastError};}
  };
  addEventListener('native-pausechange',event=>{overlay.dataset.paused=String(event.detail.paused);if(event.detail.paused){hum(false);enterSound.pause();dropSound.pause();}else if(['charging','cruise','report'].includes(phase))hum(soundEnabled);else if(soundEnabled&&phase==='departure')enterSound.play().catch(()=>{});else if(soundEnabled&&phase==='arrival')dropSound.play().catch(()=>{});});
  addEventListener('pagehide',()=>{aborter?.abort();hum(false);enterSound.pause();dropSound.pause();});
})();
