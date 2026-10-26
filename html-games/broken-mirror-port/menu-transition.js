/* Hold the illuminated sword, fade through black, then reveal the destination. */
(() => {
  'use strict';
  const stage=document.getElementById('game'),menu=document.getElementById('menu-art'),emblem=menu.querySelector('.menu-compass');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),timing={hold:150,fadeOut:300,fadeIn:350};
  const cover=document.createElement('div');cover.id='menu-transition-cover';cover.hidden=true;cover.setAttribute('aria-hidden','true');stage.append(cover);
  let current=null,phase='idle';
  function finish(run){
    if(current!==run)return;
    current=null;phase='idle';clearTimeout(run.timer);run.wake?.();run.animation?.cancel();
    for(const frame of run.frames)cancelAnimationFrame(frame);
    run.frameWake?.();cover.hidden=true;cover.style.opacity='0';
    menu.classList.remove('menu-cinematic-active');emblem?.classList.remove('menu-emblem-cinematic');
    run.finish?.();
  }
  function cancel(){if(current)finish(current);}
  function wait(run,ms){return new Promise(resolve=>{run.wake=resolve;run.timer=setTimeout(()=>{run.wake=null;resolve();},ms);});}
  function frame(run){return new Promise(resolve=>{
    run.frameWake=resolve;
    const id=requestAnimationFrame(()=>{run.frames.delete(id);run.frameWake=null;resolve();});run.frames.add(id);
  });}
  async function fade(run,from,to,duration){
    cover.style.opacity=String(from);
    run.animation=cover.animate([{opacity:from},{opacity:to}],{duration,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
    try{await run.animation.finished;}catch{return false;}
    if(current!==run)return false;
    cover.style.opacity=String(to);run.animation.cancel();run.animation=null;return true;
  }
  function activate(run){
    if(!run.valid())return false;
    run.switched=true;run.activating=true;
    try{return run.activate()!==false;}finally{run.activating=false;}
  }
  function start(options){
    if(current)return false;
    if(reduced.matches){if(options.valid())options.activate();options.finish?.();return true;}
    const run={source:menu,...options,switched:false,activating:false,frames:new Set(),timer:0,wake:null,frameWake:null,animation:null};
    current=run;phase='holding';cover.style.opacity='0';cover.hidden=false;
    if(run.source===menu){menu.classList.add('menu-cinematic-active');emblem?.classList.add('menu-emblem-cinematic');}
    (async()=>{
      await wait(run,timing.hold);if(current!==run)return;
      if(!run.valid()){finish(run);return;}
      phase='fade-out';run.fadeOut?.();
      if(!await fade(run,0,1,timing.fadeOut))return;
      phase='switching';
      if(!activate(run)){finish(run);return;}
      // Let the destination lay out behind the opaque cover before revealing it.
      await frame(run);if(current!==run)return;
      await frame(run);if(current!==run)return;
      phase='fade-in';
      if(await fade(run,1,0,timing.fadeIn))finish(run);
    })().catch(error=>{finish(run);console.error('Menu transition failed',error);});
    return true;
  }
  // Keep one selection authoritative while the destination is covered.
  const block=event=>{
    if(!current||current.activating||window.nativeOpeningCinematic?.active&&event.target.closest?.('#opening-cinematic'))return;
    event.preventDefault();event.stopImmediatePropagation();
  };
  addEventListener('pointerdown',block,{capture:true});addEventListener('click',block,{capture:true});
  addEventListener('keydown',event=>{
    if(!current)return;
    if(event.key==='Escape'){cancel();return;}
    if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.key.length===1||event.key.startsWith('Arrow')||['Enter','Tab','Home','End','PageUp','PageDown'].includes(event.key)))block(event);
  },{capture:true});
  const check=()=>{if(current&&!current.switched&&(!current.valid()||document.hidden))cancel();};
  new MutationObserver(check).observe(document.body,{attributes:true,attributeFilter:['class']});
  new MutationObserver(check).observe(menu,{attributes:true,attributeFilter:['hidden','inert']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  addEventListener('pagehide',cancel);
  reduced.addEventListener('change',()=>{
    const run=current;if(!reduced.matches||!run)return;
    try{if(!run.switched&&run.valid())activate(run);}finally{finish(run);}
  });
  window.nativeMenuTransition=Object.freeze({start,cancel,snapshot:()=>({active:!!current,phase,covered:!cover.hidden,switched:!!current?.switched,reducedMotion:reduced.matches,timing:{...timing}})});
})();
