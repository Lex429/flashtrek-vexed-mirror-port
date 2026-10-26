/* Opening-film lifecycle, audio clock and controls. Save data is never accessed. */
(() => {
  'use strict';
  const root=document.createElement('section');root.id='opening-cinematic';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','A Firm Hand — opening cinematic');
  root.innerHTML=`<canvas aria-label="The rise and fall of the Earth Empire, a narrated space battle cinematic"></canvas>
    <div class="opening-top"><p class="opening-kicker">FLASH TREK · VEXED MIRROR<span class="opening-location"></span></p>
    <div class="opening-controls"><button type="button" data-film-action="pause">Pause</button><button type="button" data-film-action="subtitles" aria-pressed="true">Subtitles on</button><button type="button" data-film-action="audio" aria-expanded="false">Audio</button><button type="button" data-film-action="skip">Skip ↗</button></div></div>
    <div class="opening-audio" hidden><label>Narration<input data-film-volume="narration" aria-label="Narration volume" type="range" min="0" max="100"></label><label>Music<input data-film-volume="music" aria-label="Music volume" type="range" min="0" max="100"></label><label>Explosions<input data-film-volume="effects" aria-label="Explosion volume" type="range" min="0" max="100"></label></div>
    <p class="opening-subtitles" aria-live="polite"><span></span></p><p class="opening-status" role="status"></p>
    <div class="opening-bottom"><span>A FIRM HAND</span><span class="opening-time"></span></div><div class="opening-progress"><span></span></div>`;
  document.body.append(root);
  const renderer=window.nativeOpeningRenderer.create(root.querySelector('canvas'));
  const audio=new Audio();audio.preload='auto';audio.dataset.openingNarration='true';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),key='vexed-opening-settings-v1';
  let settings={narration:.95,music:.62,effects:.4,subtitles:true};
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved){for(const field of ['narration','music','effects'])if(Number.isFinite(saved[field]))settings[field]=Math.max(0,Math.min(1,saved[field]));if(typeof saved.subtitles==='boolean')settings.subtitles=saved.subtitles;}}catch{}
  let manifest,preparing,narrationURL,narrationReady,run=null,frame=0,previousOutcome=null;
  const button=action=>root.querySelector(`[data-film-action="${action}"]`);
  const status=text=>{root.querySelector('.opening-status').textContent=text;};
  const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  const paused=()=>!!run&&(run.userPaused||document.hidden);
  function syncSettings(){
    audio.volume=settings.narration;run?.score.volume(settings);
    button('subtitles').textContent=settings.subtitles?'Subtitles on':'Subtitles off';button('subtitles').setAttribute('aria-pressed',String(settings.subtitles));
    root.querySelector('.opening-subtitles').hidden=!settings.subtitles;
    for(const field of ['narration','music','effects'])root.querySelector(`[data-film-volume="${field}"]`).value=String(Math.round(settings[field]*100));
  }
  function saveSettings(){try{localStorage.setItem(key,JSON.stringify(settings));}catch{}syncSettings();}
  function prepare(needed=()=>true){
    if(preparing)return preparing;
    const pending=(async()=>{
      const response=await fetch('assets/opening/cinematic.json');if(!response.ok)throw Error('Opening narration unavailable');
      manifest=await response.json();if(!needed())return manifest;
      narrationReady||=(async()=>{
        const voice=await fetch(manifest.audio);if(!voice.ok)throw Error('Opening narration unavailable');
        const blob=await voice.blob();narrationURL=URL.createObjectURL(blob);audio.src=narrationURL;
        await new Promise((resolve,reject)=>{
          const loaded=()=>{clearTimeout(timer);audio.removeEventListener('error',failed);resolve();};
          const failed=()=>{clearTimeout(timer);audio.removeEventListener('loadedmetadata',loaded);reject(Error('Opening narration could not be decoded'));};
          const timer=setTimeout(failed,15000);audio.addEventListener('loadedmetadata',loaded,{once:true});audio.addEventListener('error',failed,{once:true});audio.load();
        });
      })().catch(error=>{narrationReady=null;throw error;});
      await Promise.all([narrationReady,renderer.prepare()]);return manifest;
    })();preparing=pending;pending.catch(()=>{if(preparing===pending)preparing=null;});return pending;
  }
  function paint(){
    if(!run||!manifest)return;
    const view=window.nativeOpeningStoryboard.sample(manifest,run.time,reduced.matches);
    view.manifest=manifest;view.reducedMotion=reduced.matches;
    // Synchronize before drawing: a media element's currentTime can be cached
    // for the duration of this task while the audio thread keeps playing.
    if(run.ready)run.score.tick({time:run.audioMaster?audio.currentTime:run.time});
    renderer.advance(view);
    if(run.ready)run.score.explosions(renderer.explosions(),run.time,paused()||audio.seeking);
    renderer.draw(view);root.dataset.scene=view.scene;root.dataset.cue=String(view.index);
    root.querySelector('.opening-location').textContent=view.location;
    root.querySelector('.opening-subtitles span').textContent=view.subtitle;
    root.querySelector('.opening-progress span').style.transform=`scaleX(${run.time/manifest.duration})`;
    root.querySelector('.opening-time').textContent=`${clock(run.time)} / ${clock(manifest.duration)}`;
  }
  function animate(now){
    frame=0;if(!run)return;
    if(run.ready&&!paused()){
      if(run.audioMaster&&!audio.paused&&!audio.seeking)run.time=Math.min(manifest.duration,audio.currentTime);
      else if(!run.audioMaster)run.time=Math.min(manifest.duration,run.time+Math.min(.1,Math.max(0,(now-run.last)/1000)));
      if(run.time>=manifest.duration-.06){finish('complete');return;}
    }
    run.last=now;
    const period=1000/30,elapsed=now-(run.lastPaint??now);
    if(!run.painted||run.ready&&!paused()&&elapsed>=period-.75){
      paint();run.lastPaint=run.painted?run.lastPaint+Math.max(1,Math.floor((elapsed+.75)/period))*period:now;run.painted=true;
    }
    frame=requestAnimationFrame(animate);
  }
  async function resumeAudio(ticket){
    if(run!==ticket||paused()||!ticket.ready)return;
    if(!ticket.audioMaster)audio.currentTime=ticket.time;
    try{await audio.play();if(run===ticket){if(ticket.pendingSeek!==undefined){audio.currentTime=ticket.pendingSeek;delete ticket.pendingSeek;}ticket.audioMaster=true;ticket.score.sync(audio.currentTime,true);status('');if(paused())audio.pause();}}
    catch{if(run===ticket){ticket.audioMaster=false;status('Narration paused by your browser. Press Pause, then Resume to enable sound.');}}
  }
  function syncPause(){
    if(!run)return;
    button('pause').textContent=run.userPaused?'Resume':'Pause';button('pause').setAttribute('aria-pressed',String(run.userPaused));
    if(paused()){audio.pause();run.score.pause(true);}else{run.last=performance.now();run.score.pause(false);resumeAudio(run);}
  }
  function finish(reason='skip'){
    if(!run)return false;
    const ended=run;run=null;cancelAnimationFrame(frame);frame=0;audio.pause();audio.currentTime=0;ended.score.stop();
    renderer.cancelPreparation();renderer.release?.();preparing=null;
    root.hidden=true;document.body.classList.remove('cinematic-playing');root.querySelector('.opening-audio').hidden=true;button('audio').setAttribute('aria-expanded','false');
    for(const [node,value] of ended.inert)node.inert=value;
    ended.menu.hidden=ended.menuHidden;previousOutcome={reason,mode:ended.mode,time:ended.time};
    if(reason!=='unload')ended.onFinish?.(reason);
    if(reason!=='unload'){
      if(ended.mode==='new-game')document.querySelector('#space')?.focus({preventScroll:true});
      else if(ended.focus?.isConnected)ended.focus.focus({preventScroll:true});
    }
    return true;
  }
  function play(options={}){
    if(run)return false;
    const menu=document.getElementById('menu-art');
    const ticket={mode:options.mode||'replay',onFinish:options.onFinish,time:0,last:performance.now(),ready:false,userPaused:false,audioMaster:false,
      score:window.nativeOpeningScore.create(),sounded:new Set(),focus:document.activeElement,menu,menuHidden:menu.hidden,inert:new Map()};
    run=ticket;
    for(const child of document.body.children)if(child!==root&&child.tagName!=='SCRIPT'){ticket.inert.set(child,child.inert);child.inert=true;}
    root.hidden=false;menu.hidden=true;document.body.classList.add('cinematic-playing');renderer.resize();status('Preparing the opening film…');
    ticket.score.start(settings);syncSettings();button('pause').textContent='Pause';button('pause').setAttribute('aria-pressed','false');button('skip').focus({preventScroll:true});
    document.dispatchEvent(new Event('opening-cinematic-start'));
    frame=requestAnimationFrame(animate);
    prepare(()=>run===ticket).then(async()=>{
      if(run!==ticket)return;
      await ticket.score.prepare(manifest);if(run!==ticket)return;
      await renderer.warm(manifest,()=>run===ticket);if(run!==ticket)return;
      ticket.ready=true;ticket.last=performance.now();audio.currentTime=0;status('');syncPause();paint();
    }).catch(error=>{
      if(run!==ticket)return;status('The opening film could not load. Select Skip to continue.');console.warn(error.message);
    });
    return true;
  }
  function seek(seconds){
    if(!run?.ready)return false;run.time=Math.max(0,Math.min(manifest.duration,Number(seconds)||0));if(!run.audioMaster)run.pendingSeek=run.time;audio.currentTime=run.time;run.last=performance.now();run.sounded.clear();paint();return true;
  }
  root.addEventListener('click',event=>{
    const action=event.target.closest('[data-film-action]')?.dataset.filmAction;
    if(action==='skip')finish('skip');
    else if(action==='pause'){if(!run)return;run.userPaused=!run.userPaused;syncPause();}
    else if(action==='subtitles'){settings.subtitles=!settings.subtitles;saveSettings();}
    else if(action==='audio'){const panel=root.querySelector('.opening-audio');panel.hidden=!panel.hidden;button('audio').setAttribute('aria-expanded',String(!panel.hidden));}
  });
  root.addEventListener('input',event=>{const field=event.target.dataset.filmVolume;if(field){settings[field]=Number(event.target.value)/100;saveSettings();}});
  addEventListener('keydown',event=>{
    if(!run)return;
    event.stopImmediatePropagation();
    if(event.key==='Escape'){event.preventDefault();finish('skip');return;}
    if(event.key==='Tab'){
      const nodes=[...root.querySelectorAll('button,input')].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }else if(event.code==='Space'&&!event.target.closest('button,input')){event.preventDefault();run.userPaused=!run.userPaused;syncPause();}
  },true);
  document.addEventListener('visibilitychange',syncPause);
  audio.addEventListener('ended',()=>{if(run&&audio.ended){run.time=manifest?.duration||run.time;finish('complete');}});
  addEventListener('resize',()=>{if(run){renderer.resize();paint();}});
  addEventListener('pagehide',()=>{finish('unload');if(narrationURL)URL.revokeObjectURL(narrationURL);});
  const replay=document.createElement('button');replay.id='menu-opening-film';replay.type='button';replay.textContent='Opening film';replay.addEventListener('click',()=>play());document.getElementById('menu-art').append(replay);
  syncSettings();
  window.nativeOpeningCinematic=Object.freeze({play,prepare,seek,skip:()=>finish('skip'),get active(){return !!run;},
    snapshot:()=>({active:!!run,ready:!!run?.ready,time:run?.time||0,duration:manifest?.duration||0,paused:paused(),audioMaster:!!run?.audioMaster,audioPaused:audio.paused,audioTime:audio.currentTime,seeking:audio.seeking,settings:{...settings},
      reducedMotion:reduced.matches,score:run?.score.snapshot()||null,renderer:renderer.snapshot(),outcome:previousOutcome})});
})();
