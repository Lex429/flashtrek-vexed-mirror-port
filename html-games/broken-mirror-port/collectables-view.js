/* Flight markers and the transporter/archive presentation; never grants items. */
(() => {
  'use strict';
  const stage=document.getElementById('game'),markers=document.createElement('div'),reveal=document.createElement('section');
  markers.id='collectable-markers';markers.hidden=true;markers.setAttribute('aria-label','Collectable artifacts');stage.append(markers);
  reveal.id='collectable-reveal';reveal.hidden=true;reveal.setAttribute('role','dialog');reveal.setAttribute('aria-modal','true');reveal.setAttribute('aria-labelledby','collectable-title');document.body.append(reveal);
  reveal.innerHTML=`<div class="collectable-reveal-card"><button type="button" class="collectable-dismiss" aria-label="Close item information">×</button><div class="collectable-transporter" aria-hidden="true"><div class="collectable-pattern"><img alt=""></div><span class="collectable-pad"></span><canvas class="collectable-transport-fx" hidden></canvas></div><div class="collectable-reveal-info"><span class="collectable-eyebrow" role="status"></span><h2 id="collectable-title"></h2><div class="collectable-record"><span data-record-kind></span><span data-record-year></span></div><p data-record-history></p><section class="collectable-discovery" aria-label="Recovery log"><span>RECOVERY LOG · VEXED MIRROR LORE</span><p data-record-recovery></p><small data-record-location></small></section><p class="collectable-saved"></p><div class="collectable-reveal-actions"><button type="button" data-open-collection>View in Collectables <span aria-hidden="true">↗</span></button><button type="button" data-keep-exploring>Continue exploring</button></div><a class="collectable-source" target="_blank" rel="noopener noreferrer">Archive reference ↗</a></div></div>`;
  reveal.querySelector('.collectable-reveal-card').insertAdjacentHTML('beforeend',`<div class="collectable-clue-content"><figure class="collectable-clue-reference"><div class="collectable-clue-planet"><img data-clue-planet alt="" hidden><span aria-hidden="true">?</span></div><figcaption><span data-clue-reference-label></span><strong data-clue-system></strong><small data-clue-place></small></figcaption></figure><span class="collectable-eyebrow">UNCONFIRMED ARCHIVE REPORT</span><h2 id="collectable-clue-title"></h2><div class="collectable-clue-progress"><strong data-clue-progress></strong><span data-clue-found></span></div><p data-collectable-rumour></p><p class="collectable-clue-locked" hidden></p><p class="collectable-clue-help"></p><button type="button" data-close-clue>Back to collection</button></div>`);
  const image=reveal.querySelector('.collectable-pattern img'),eyebrow=reveal.querySelector('.collectable-eyebrow'),saved=reveal.querySelector('.collectable-saved');
  let bridge=null,signature='',visible=false,previousFocus=null,inspecting=false,background=[];
  const buttons=new Map();
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const transporter=window.nativeCollectableTransporter.create(reveal.querySelector('.collectable-transport-fx'),reveal.querySelector('.collectable-transporter'),reveal.querySelector('.collectable-pattern'),image,complete);
  function gate(){dispatchEvent(new CustomEvent('native-flightgatechange',{detail:{at:performance.now()}}));}
  function close({restore=true}={}){
    if(reveal.hidden)return;
    transporter.stop();
    reveal.hidden=true;reveal.removeAttribute('data-phase');gate();
    for(const {node,inert} of background)node.inert=inert;background=[];
    if(restore){if(previousFocus?.isConnected&&!previousFocus.closest('[hidden]'))previousFocus.focus({preventScroll:true});else document.getElementById('space').focus({preventScroll:true});}
  }
  function present(label){
    reveal.setAttribute('aria-labelledby',label);reveal.hidden=false;reveal.querySelector('.collectable-reveal-card').scrollTop=0;gate();
    background=[stage,document.querySelector('body > footer'),document.querySelector('#ship-inventory')].filter(Boolean).map(node=>({node,inert:node.inert}));for(const {node} of background)node.inert=true;
    markers.hidden=true;reveal.querySelector('.collectable-dismiss').focus({preventScroll:true});
  }
  function complete(){
    transporter.stop();if(reveal.hidden||reveal.dataset.mode==='clue')return;reveal.dataset.phase='complete';eyebrow.textContent=inspecting?'COLLECTION ARCHIVE':'TRANSPORT COMPLETE';
    const progress=window.nativeCollectables.clueProgress(bridge?.getState());
    const unlocked=!inspecting&&progress.found>0&&progress.found<=progress.total-window.nativeCollectables.initialClues;
    saved.textContent=inspecting?'Preserved in your collection.':`Added to Inventory → Collectables${unlocked?` · Clue ${String(progress.unlocked).padStart(2,'0')} unlocked.`:''}`;
  }
  function showClue(id){
    const item=window.nativeCollectables.get(id),clues=window.nativeCollectables.clues(bridge?.getState(),id);if(!clues)return;
    if(!reveal.hidden)close({restore:false});
    previousFocus=document.activeElement;transporter.stop();image.removeAttribute('src');
    reveal.dataset.mode='clue';reveal.dataset.phase='clue';
    reveal.querySelector('#collectable-clue-title').textContent=`Undiscovered artifact ${String(item.index+1).padStart(2,'0')}`;
    const planet=reveal.querySelector('[data-clue-planet]');planet.hidden=true;planet.removeAttribute('src');
    planet.alt=clues.reference?.name||'';planet.onload=()=>{planet.hidden=false;};planet.onerror=()=>{planet.hidden=true;};
    if(clues.reference?.art)planet.src=clues.reference.art;
    reveal.querySelector('.collectable-clue-reference').hidden=!clues.available;
    reveal.querySelector('[data-clue-reference-label]').textContent=clues.reference?.label||'';
    reveal.querySelector('[data-clue-system]').textContent=clues.reference?.system||'';
    reveal.querySelector('[data-clue-place]').textContent=clues.reference?.name||'';
    reveal.querySelector('[data-clue-progress]').textContent=clues.available?'CLUE AVAILABLE':'CLUE LOCKED';
    reveal.querySelector('[data-clue-found]').textContent=`${clues.found} / ${clues.total} artifacts recovered`;
    const rumour=reveal.querySelector('[data-collectable-rumour]');rumour.hidden=!clues.available;rumour.textContent=clues.text||'';
    const locked=reveal.querySelector('.collectable-clue-locked');locked.hidden=clues.available;
    locked.textContent=clues.available?'':`Find ${clues.remaining} more ${clues.remaining===1?'artifact':'artifacts'} to reveal this clue.`;
    reveal.querySelector('.collectable-clue-help').textContent=clues.available?"A lead to investigate. The artifact's identity is still unknown.":'The first six clues are available from the start. Each recovered artifact reveals one more clue.';
    present('collectable-clue-title');
  }
  function show(id,{inspect=false}={}){
    const item=window.nativeCollectables.get(id);if(!item)return;
    if(!reveal.hidden)close({restore:false});
    inspecting=inspect;previousFocus=document.activeElement;reveal.dataset.mode='record';
    image.src=item.icon;reveal.querySelector('#collectable-title').textContent=item.name;
    reveal.querySelector('[data-record-kind]').textContent=item.kind;reveal.querySelector('[data-record-year]').textContent=item.dateLabel||`LAUNCHED ${item.year}`;
    reveal.querySelector('[data-record-history]').textContent=item.history;reveal.querySelector('.collectable-source').href=item.source;reveal.querySelector('.collectable-source').textContent=`Archive reference · ${item.sourceLabel||'NASA mission record'} ↗`;
    reveal.querySelector('[data-record-recovery]').textContent=item.site.recovery;
    reveal.querySelector('[data-record-location]').textContent=item.site.location;
    eyebrow.textContent='TRANSPORTER PATTERN LOCKED';saved.textContent='Materializing a recovered artifact…';
    reveal.dataset.phase=inspect||reducedMotion.matches?'complete':'transport';present('collectable-title');
    if(reveal.dataset.phase==='complete')complete();else transporter.start();
    markers.hidden=true;reveal.querySelector('[data-keep-exploring]').textContent=inspect?'Back to collection':'Continue exploring';reveal.querySelector('[data-open-collection]').hidden=inspect;
  }
  reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)transporter.finish();});
  image.addEventListener('error',()=>{if(!reveal.hidden)complete();});
  reveal.querySelector('.collectable-dismiss').onclick=()=>close();reveal.querySelector('[data-keep-exploring]').onclick=()=>close();
  reveal.querySelector('[data-close-clue]').onclick=()=>close();
  reveal.querySelector('[data-open-collection]').onclick=()=>{close({restore:false});bridge?.openCollection();};
  reveal.addEventListener('keydown',event=>{
    event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key==='Tab'){
      const nodes=[...reveal.querySelectorAll('button:not(:disabled),a[href]')].filter(node=>node.getClientRects().length),first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  function visibility(value){visible=!!value;markers.hidden=!visible||!reveal.hidden;transporter.step();}
  function frame(state,{cx,cy,cameraX,cameraY,w,h,scale,safeBottom=0,paused=false}){
    if(!visible||!reveal.hidden)return;
    const entries=[],relicScale=Math.max(.7,Math.min(1.6,scale));
    for(const target of window.nativeCollectables.available(state)){
      const item=window.nativeCollectableMotion?.presentation(state,target)||target;
      const x=cx+item.x-cameraX,y=cy+item.y-cameraY,size=Math.max(item.minPixels,item.spaceSize*scale);
      const roll=reducedMotion.matches?0:item.roll,rotatedSize=size*(Math.abs(Math.cos(roll))+Math.abs(Math.sin(roll)));
      const hitSize=Math.max(44,48*relicScale,rotatedSize+12),margin=(hitSize/2+8)/Math.max(.1,scale);
      if(x<margin||x>w-margin||y<margin+35/scale||y>h-safeBottom-margin)continue;
      entries.push({item,x,y,size,roll,hitSize});
    }
    const items=entries.map(entry=>entry.item),key=items.map(item=>item.id).join('|');
    if(signature!==key){
      signature=key;markers.replaceChildren();buttons.clear();
      for(const item of items){
        const button=document.createElement('button');button.type='button';button.className='collectable-marker';button.dataset.collectableId=item.id;button.setAttribute('aria-label',`Transport ${item.name}`);button.title=`${item.name} · Click to transport`;
        button.style.setProperty('--collectable-glow-delay',`${-item.index*.45}s`);
        const art=document.createElement('img');art.src=item.icon;art.alt='';art.draggable=false;
        const label=document.createElement('span');label.className='collectable-marker-label';label.textContent=item.name;
        const hint=document.createElement('small');hint.textContent='CLICK TO TRANSPORT';button.append(art,label,hint);
        button.onclick=event=>{event.stopPropagation();const result=bridge?.transport(item.id);if(result?.ok)show(item.id);else bridge?.notice(result?.error||'Transport unavailable.');};
        markers.append(button);buttons.set(item.id,button);
      }
    }
    markers.dataset.paused=String(paused);markers.style.setProperty('--relic-scale',String(relicScale));
    for(const {item,x,y,size,roll,hitSize} of entries){
      const button=buttons.get(item.id);
        button.style.left=x*scale+'px';button.style.top=y*scale+'px';
        button.style.setProperty('--collectable-size',size+'px');button.style.setProperty('--collectable-hit-size',hitSize+'px');
        button.style.setProperty('--collectable-roll',roll+'rad');
    }
  }
  document.addEventListener('visibilitychange',()=>{reveal.dataset.paused=String(document.hidden);markers.dataset.paused=String(document.hidden);transporter.suspend();});
  window.nativeCollectablesView=Object.freeze({attach(value){bridge=value;},visibility,frame,show,showClue,close,get active(){return !reveal.hidden;},get transport(){return {active:transporter.active,progress:transporter.progress};}});
})();
