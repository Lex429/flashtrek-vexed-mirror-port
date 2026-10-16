/* Departure, live warp flight, a saved journey report, and manual arrival. */
(() => {
  'use strict';
  const stage = document.getElementById('game');
  const overlay = document.createElement('section');
  overlay.id = 'warp-transition';overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Warp journey');
  overlay.innerHTML = `
    <canvas class="warp-space" aria-label="Your ship travelling through warp"></canvas>
    <section class="warp-report" hidden aria-label="Journey report">
      <div class="warp-report-heading"><span class="warp-kicker">JOURNEY REPORT</span></div>
      <div class="warp-elapsed"><strong data-days></strong><div><span>DAYS ELAPSED</span><b data-stardate></b></div></div>
      <div class="warp-destination"><div data-emblem></div><div><span class="warp-kicker">DESTINATION SYSTEM</span><h2 data-system></h2><span data-government></span></div></div>
      <dl class="warp-readings"><div><dt>Your standing</dt><dd data-standing></dd></div><div><dt>Local prestige</dt><dd data-prestige></dd></div><div><dt>Antimatter used</dt><dd data-fuel-used></dd></div><div><dt>Antimatter aboard</dt><dd data-fuel-remaining></dd></div></dl>
      <div class="warp-bulletins"><h3>During your journey</h3><ol data-events></ol></div>
      <div class="warp-report-footer"><button class="warp-continue" type="button" disabled>Continue <span aria-hidden="true">→</span></button></div>
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
  const durations = () => ({departure:window.vexedRebirthWarp.departureMs, cruise:reduced.matches?250:900, arrival:window.vexedRebirthWarp.arrivalMs});
  let session = null, phase = 'idle', phaseTime = 0, time = 0, last = 0, raf = 0, generation = 0;
  let loaded = 0, assetsReady = false, assets = {}, committed = false, disabledControls = [];
  const soundEnabled = localStorage.getItem('vexed-warp-sound') !== 'off';
  let audioContext, audioGain, oscillator;
  const enterSound = new Audio('assets/warp/rebirth-warpout.mp3');
  const dropSound = new Audio('assets/warp/rebirth-warpin.mp3');
  enterSound.volume = .5;dropSound.volume = .6;
  const starfield = window.vexedWarpStarfield.create();

  function hum(enabled) {
    if (!enabled) {audioGain?.gain.setTargetAtTime(0,audioContext.currentTime,.1);return;}
    try {
      if (!audioContext) {
        audioContext=new (window.AudioContext||window.webkitAudioContext)();
        audioGain=audioContext.createGain();audioGain.gain.value=0;
        const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=340;
        oscillator=audioContext.createOscillator();oscillator.type='sawtooth';oscillator.frequency.value=58;
        oscillator.connect(filter);filter.connect(audioGain);audioGain.connect(audioContext.destination);oscillator.start();
      }
      audioContext.resume().catch(()=>{});audioGain.gain.setTargetAtTime(.018,audioContext.currentTime,.3);
    } catch {}
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
  function setPhase(value){
    phase=value;phaseTime=0;overlay.dataset.phase=value;
    if(value==='cruise')hum(soundEnabled);
    if(value==='arrival')hum(false);

  }
  function freezeControls(){
    disabledControls=Array.from(document.querySelectorAll('.game-actions button:not(#pauseBtn),#save'),button=>({button,disabled:button.disabled}));
    for(const {button} of disabledControls)button.disabled=true;
    document.body.classList.add('warping');stage.setAttribute('aria-busy','true');
  }
  function clean(){
    ++generation;cancelAnimationFrame(raf);raf=0;
    overlay.hidden=true;panel.hidden=true;errorPanel.hidden=true;phase='idle';overlay.dataset.phase='idle';
    document.body.classList.remove('warping');stage.removeAttribute('aria-busy');
    for(const {button,disabled} of disabledControls)button.disabled=disabled;disabledControls=[];
    hum(false);enterSound.pause();dropSound.pause();session=null;
  }
  function fail(error){
    setPhase('error');panel.hidden=true;errorPanel.hidden=false;
    overlay.querySelector('.warp-retry').focus();
    session?.onError?.(error);
  }
  async function prepare(token){
    loaded=0;assetsReady=false;assets={};
    try {
      const requests=[['ship',async()=>{const [ship]=await Promise.all([window.vexedFlightAssets.loadShip(session.report.shipType,session.report.hull),window.vexedFlightAssets.loadWarpRing()]);return ship;}],
        ['origin',()=>window.vexedFlightAssets.loadPlanet(session.report.originId)],
        ['destination',()=>window.vexedFlightAssets.loadPlanet(session.report.systemId)]];
      await Promise.all(requests.map(async([key,load])=>{const art=await load();if(token!==generation)return;assets[key]=art;loaded++;}));
      if(token!==generation)return;assetsReady=true;
    } catch(error){if(token===generation)fail(error);}
  }
  function showReport(){
    try {if(!committed){session.commit();committed=true;}}
    catch(error){fail(error);return;}
    const report=session.report;
    setText('[data-days]',report.elapsedDays);
    setText('[data-stardate]',`STARDATE / DAY ${report.day}`);setText('[data-system]',report.systemName);
    setText('[data-government]',report.governmentName);setText('[data-standing]',report.standing);
    overlay.querySelector('[data-standing]').style.color=standings[report.standing]||'#c4d4df';
    setText('[data-prestige]',`${Math.floor(report.prestige)}%`);setText('[data-fuel-used]',`${report.fuelUsed} t`);
    setText('[data-fuel-remaining]',`${report.fuelRemaining} t`);
    const icon=icons[report.governmentId];
    overlay.querySelector('[data-emblem]').innerHTML=icon?`<img src="startup/factions/faction-${icon}.png" alt="${escape(report.governmentName)} emblem">`:'<span aria-hidden="true">◇</span>';
    overlay.querySelector('[data-events]').innerHTML=report.events.map(event=>`<li class="warp-event-${escape(event.kind)}"><strong>${escape(event.title)}</strong><p>${escape(event.text)}</p></li>`).join('');
    setPhase('report');panel.hidden=false;errorPanel.hidden=true;continueButton.disabled=false;continueButton.focus({preventScroll:true});
  }
  function start(options){
    if(phase!=='idle')return {ok:false,error:'A journey is already in progress.'};
    session=options;committed=!!options.resumed;time=0;last=0;
    panel.hidden=true;errorPanel.hidden=true;continueButton.disabled=true;
    overlay.hidden=false;freezeControls();setPhase(options.resumed?'cruise':'departure');
    const token=++generation;prepare(token);if(!options.resumed)effect(enterSound);
    raf=requestAnimationFrame(draw);return {ok:true};
  }
  continueButton.onclick=()=>{
    if(phase!=='report'||!assetsReady)return;
    continueButton.disabled=true;panel.hidden=true;setPhase('arrival');effect(dropSound);
    try {session.beginArrival?.();}catch(error){fail(error);}
  };
  overlay.querySelector('.warp-retry').onclick=()=>{errorPanel.hidden=true;panel.hidden=true;setPhase('cruise');prepare(++generation);};
  overlay.querySelector('.warp-cancel').onclick=()=>{const cancel=session?.cancel;const wasCommitted=committed;clean();cancel?.(wasCommitted);};
  overlay.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const targets=Array.from(overlay.querySelectorAll('button:not(:disabled)')).filter(button=>button.getClientRects().length);
    const first=targets[0],last=targets[targets.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });

  function fit(){return window.nativeView.fit(canvas,ctx);}
  function paintCruise(dt,view){
    const angle=0;
    starfield.resize(view.w,view.h);starfield.draw(ctx,dt,angle,reduced.matches);
    const forward=reduced.matches?0:Math.min(time*2.4,14);
    const portrait=view.w/view.h<1;
    const x=view.w*(portrait?.5:.25),y=view.h*(portrait?.2:.52)-forward;
    window.vexedFlightAssets.drawShip(ctx,assets.ship||session.originShip,x,y,100,angle,time*1000);
  }
  function draw(now){
    if(phase==='idle')return;
    const dt=document.hidden||window.nativePause?.active?0:Math.min(.05,last?(now-last)/1000:0);last=now;time+=dt;phaseTime+=dt*1000;
    const view=fit();ctx.clearRect(0,0,view.w,view.h);
    if(phase!=='departure'&&phase!=='arrival')paintCruise(dt,view);
    if(phase==='departure'&&phaseTime>=durations().departure)setPhase('cruise');
    if(phase==='cruise'&&assetsReady&&phaseTime>=durations().cruise)showReport();
    if(phase==='arrival'&&phaseTime>=durations().arrival){const finish=session.finish;clean();finish();return;}
    raf=requestAnimationFrame(draw);
  }
  window.vexedWarp = {
    start,
    playNearby,
    reset:clean,
    get active(){return phase!=='idle';},
    get phase(){return phase;},
    get assetsReady(){return assetsReady;},
    get assetProgress(){return Math.round(loaded/3*100);},
    get flightEffect(){
      if(phase==='departure')return window.vexedRebirthWarp.departure(phaseTime,session.originAngle??0);
      if(phase==='arrival')return window.vexedRebirthWarp.arrival(phaseTime,session.arrivalAngle??0);
      return null;
    },
    get flightShip(){return phase==='departure'?session?.originShip||assets.ship:assets.ship;},
    get report(){return session?.report||null;}
  };
  addEventListener('native-pausechange',event=>{if(event.detail.paused){hum(false);enterSound.pause();dropSound.pause();}else if(phase==='cruise'||phase==='report')hum(soundEnabled);else if(soundEnabled&&phase==='departure')enterSound.play().catch(()=>{});else if(soundEnabled&&phase==='arrival')dropSound.play().catch(()=>{});});
  addEventListener('pagehide',()=>{cancelAnimationFrame(raf);hum(false);enterSound.pause();dropSound.pause();});
})();
