/* Visual showcase: installed ship textures; formulas from rebirth-combat.as,
   rebirth-destruction.as, rebirth-debris.as and rebirth-destruction.js.
   Combat ratings are extracted from the installed game; icons use transparent remasters. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('scene'),ctx=canvas.getContext('2d'),base='showcase-assets/';
  const names=['Intact','Light damage','Heavy damage','Severe damage'],colors={enemy:'#ff3333',fleet:'#46ff46',neutral:'#adacac'};
  const state={ready:false,ship:null,hull:100,shields:100,shieldsEnabled:true,shieldCharge:100,cloaked:false,damage:26,paused:false,slow:false,rotate:false,compare:false,sound:false,zoom:1,angle:0,target:'enemy',destroyed:false,time:0,shots:[],particles:[],debris:[],flash:null,sequence:null,hits:0,weaponReadyAt:{},asteroidTransition:null,asteroidBlast:null};
  let catalog,combat,shooter,shipPicker,asteroidData,last=performance.now(),selectionToken=0;const images=new Map(),pendingImages=new Map(),audio=new Set();
  let lastHit=null;
  const healthOverrides={};
  try{const saved=JSON.parse(localStorage.getItem('creatureHealth')||'{}');for(const [id,v] of Object.entries(saved))if(Number.isFinite(v)&&v>=1&&v<=100000)healthOverrides[id]=v;}catch{}
  const asteroidMaxHealth=()=>Math.round(clamp(45+(state.ship?.previewSize||250)*.19,65,150));
  const stats=()=>asteroid()?{hull:state.ship.maxHealth||asteroidMaxHealth(),shields:0,weaponsRating:0}:creature()?{hull:healthOverrides[state.ship.id]||combat?.creatures?.[state.ship.id]?.health||100,shields:0,weaponsRating:0}:combat.ships[state.ship.id],firingStats=()=>combat.ships[shooter.id];
  const number=n=>Number(n.toFixed(2)).toLocaleString();
  const hullPoints=()=>state.hull*stats().hull/100,shieldPoints=()=>state.shields*stats().shields/100;
  function weaponCards(){
    if(!combat||!shooter)return;
    $('firing-rating').textContent=`Weapon damage and recharge are independent of ship`;
    const [kind,index]=$('weapon-select').value.split(':');
    const w=catalog.weapons[kind]?.[Number(index)];
    if(!w)return;
    $(kind+'-style').value=index;
    $('fire-weapon').dataset.fire=kind;
    $('fire-weapon').className='fire '+kind;
    $('weapon-icon').src=base+w.icon;$('weapon-icon').alt=w.name;
    $('weapon-rating').textContent=`Damage ${number(w.baseDamage)}`;
    $('weapon-details').textContent=`Recharge ${number(w.recharge/13)} seconds`;
    $('selected-weapon-icon').src=base+w.icon;
    $('selected-weapon-name').textContent=w.name;
    document.querySelectorAll('[data-weapon]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.weapon===kind+':'+index)));
    updateRecharge();

  }

  function updateRecharge(){
    if(!catalog||!state.ship)return;
    const [kind,index]=$('weapon-select').value.split(':'),weapon=catalog.weapons[kind]?.[Number(index)];
    if(!weapon)return;
    const bypass=$('visual-damage').checked,remaining=bypass?0:Math.max(0,(state.weaponReadyAt[weapon.id]||0)-state.time),duration=weapon.recharge*1000/13;
    const percent=duration>0?Math.max(0,Math.min(100,(1-remaining/duration)*100)):100;
    const status=bypass?'Visual mode: no recharge':remaining>0?`${(Math.ceil(remaining/100)/10).toFixed(1)}s until ready`:'Ready to fire';
    const bar=$('weapon-recharge-bar');$('weapon-recharge-fill').style.width=percent+'%';
    $('weapon-recharge').dataset.state=remaining>0?'charging':'ready';
    if($('weapon-recharge-status').textContent!==status)$('weapon-recharge-status').textContent=status;
    bar.setAttribute('aria-valuenow',String(Math.round(percent)));bar.setAttribute('aria-valuetext',status);
    $('fire-weapon').disabled=!state.ready||state.destroyed||!!state.eggHatch||remaining>0;
  }

  const movingCreature=()=>creature()&&!egg();
  const larva=()=>state.ship?.creatureType==='larva'||[69,70].includes(state.ship?.id);
  const frameFile=()=>state.ship.frames[stage()]||state.ship.frames[0];
  const egg=()=>state.ship?.creatureType==='egg'||[67,68].includes(state.ship?.id);
  const babyFile=()=>state.ship.babyFile||`creatures/larva-${state.ship.id===67?'a':'b'}-intact.png`;
  const asteroid=()=>state.ship?.kind==='asteroid';
  const asteroid01=()=>asteroid()&&state.ship?.name==='Asteroid 01';
  const creature=()=>state.ship?.kind==='creature';
  const intactOnly=()=>state.ship?.artworkStatus==='intact-only';
  const biological=()=>!!window.starterShips.get(state.ship?.id)?.biological;
  const biology=()=>window.starterShips.get(state.ship?.id)?.biology;
  const starter=()=>window.starterShips.get(state.ship?.id);
  const enhancedShip=()=>!!starter()||[56,57,58,59].includes(state.ship?.id);
  const shipEffects=()=>starter()?.effects||(state.ship?.id===56?window.constitutionTugEffects:state.ship?.id===57?window.tugEffects:state.ship?.id===58?window.olympicEffects:window.cthiaEffects);
  const debrisImpacts=window.createDebrisImpacts();
  const cthiaOptions={lights:true,damage:true,anchors:false};
  let cthiaFragments=[[],[],[],[]];
  function prepareCthiaFragments(){
    const frames=state.ship.frames.map(file=>images.get(file)),w=frames[0].width,h=frames[0].height;
    const read=im=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.drawImage(im,0,0,w,h);return g.getImageData(0,0,w,h);};
    const pixels=frames.map(read),anchors=starter()?.breakAnchors||(state.ship.id===56?window.constitutionTugBreakAnchors:state.ship.id===57?window.tugBreakAnchors:state.ship.id===58?window.olympicBreakAnchors:[[275,199],[84,201],[208,111],[315,261],[220,321],[139,401],[42,319],[328,320],[253,447]]);
    cthiaFragments=[[],[],[],[]];
    for(let s=1;s<4;s++){
      const groups=anchors.map(()=>[]),before=pixels[s-1].data,after=pixels[s].data;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;if(before[i+3]<100||after[i+3]>40)continue;
        let closest=0,distance=Infinity;
        anchors.forEach(([ax,ay],n)=>{const d=(x-ax)**2+(y-ay)**2;if(d<distance){distance=d;closest=n;}});
        groups[closest].push({x,y,i});
      }
      for(const group of groups){
        if(group.length<12)continue;
        const x=Math.min(...group.map(p=>p.x)),y=Math.min(...group.map(p=>p.y)),fw=Math.max(...group.map(p=>p.x))-x+1,fh=Math.max(...group.map(p=>p.y))-y+1;
        const texture=document.createElement('canvas');texture.width=fw;texture.height=fh;const g=texture.getContext('2d'),cut=g.createImageData(fw,fh);
        for(const p of group)cut.data.set(before.subarray(p.i,p.i+4),((p.y-y)*fw+p.x-x)*4);
        g.putImageData(cut,0,0);cthiaFragments[s].push({texture,x:(x+fw/2)/w-.5,y:(y+fh/2)/h-.5,w:fw/w,h:fh/h,pixels:group.length});
      }
    }
  }
  function breakCthia(before,after){
    if(!enhancedShip()||after<=before||state.destroyed)return;
    if(biological()){biology().stageRupture(state,before,after,world,state.zoom);return;}
    const l=layout();
    for(let s=before+1;s<=after;s++)for(const piece of cthiaFragments[s]){
      const p=world(piece),direction=Math.atan2(p.y-l.y,p.x-l.x),speed=(55+s*18)*state.zoom;
      state.debris.push({...p,texture:piece.texture,w:piece.w*l.w,h:piece.h*l.h,vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,
        angle:state.angle,spin:(piece.x<0?-1:1)*1.4,born:state.time,ttl:4200,cthia:true});burst(p,.65,true);
    }
  }
  let seed=743;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const stars=Array.from({length:160},()=>({x:random()*900,y:random()*540,r:random()*.9+.25,a:random()*.6+.2}));
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const stage=()=>state.hull<25?3:state.hull<50?2:state.hull<75?1:0;
  const color=n=>'#'+n.toString(16).padStart(6,'0');
  function explain(text){$('explanation').textContent=text;}
  function loadImage(file){
    if(pendingImages.has(file))return pendingImages.get(file);
    const promise=new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images.set(file,im);resolve(im);};im.onerror=()=>reject(Error('Could not load '+file));im.src=base+file+'?v=asteroid-cutstates-1';});
    pendingImages.set(file,promise);return promise;
  }
  function playSound(file,volume=.18){
    if(!state.sound||!file)return;
    if(audio.size>=6){const old=audio.values().next().value;old.pause();audio.delete(old);}
    const a=new Audio(base+file+'.mp3');a.volume=volume;audio.add(a);const remove=()=>audio.delete(a);a.onended=remove;a.onerror=remove;a.play().catch(remove);
  }
  function stopSequence(){state.sequence=null;$('sequence').textContent='▶ Play damage sequence';}
  function clearEffects(){state.weaponReadyAt={};state.eggHatch=null;state.asteroidTransition=null;state.asteroidBlast=null;if(window.larvaMotion){window.larvaMotion.mode='idle';window.larvaMotion.offset=0;window.larvaMotion.born=state.time;}state.bioLeakAt=0;state.bioDeath=null;state.cthiaBlast=null;state.shots=[];state.particles=[];state.debris=[];state.flash=null;debrisImpacts.reset();$('debris-impact-status').textContent='Shield flashes or hull sparks. No damage.';}
  function reset(repairOnly=false){
    stopSequence();clearEffects();state.hull=100;state.shields=100;state.shieldCharge=100;state.shieldsEnabled=true;state.cloaked=false;state.destroyed=false;state.hits=0;lastHit=null;$('hit-result').textContent='Fire a weapon to measure its hit.';$('shields').checked=true;
    if(!repairOnly){
      state.angle=0;state.paused=false;state.slow=false;state.rotate=false;state.compare=false;state.zoom=1;state.damage=26;state.target='enemy';
      cthiaOptions.lights=true;cthiaOptions.damage=true;cthiaOptions.anchors=false;
      for(const [id,key] of [['ship-lights','lights'],['damage-effects','damage'],['effect-locations','anchors']])$(id).setAttribute('aria-pressed',String(cthiaOptions[key]));
      for(const id of['pause','slow','rotate','compare'])$(id).setAttribute('aria-pressed','false');$('pause').textContent='Ⅱ Pause';$('zoom').value=100;$('hit-strength').value=26;$('damage-output').value='26%';
      document.querySelectorAll('[data-target]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.target==='enemy')));
    }
    updateUI();if(intactOnly()){explain(state.ship.name+' restored to full health. Weapon testing is ready; separate damage artwork is pending.');return;}if(creature()){explain(egg()?'Egg restored: living contents pulse beneath the intact membrane.':'Creature restored: movement, under-shell circulation and intact tissue are restored.');return;}explain(repairOnly?'Hull repaired to 100%. The intact artwork is restored in the same position and at the same size.':'Demo reset. Fire a weapon, enable shields, or play the guided damage sequence.');
  }
  function configureArtworkUI(){
    const only=intactOnly();
    const isAsteroid=asteroid();
    $('hatch').hidden=!egg();$('hatch').disabled=!state.ready||state.destroyed||stage()===3||!!state.eggHatch;
    if(isAsteroid){state.shields=0;state.shieldCharge=0;state.shieldsEnabled=false;}
    document.querySelector('.weapon-console').hidden=false;
    document.querySelector('.health-panel').hidden=false;
    document.querySelector('.damage-strip').hidden=false;
    if(isAsteroid){
      const labels=['Intact rock','Cracked rock','Fractured rock','Breaking apart'];
      document.querySelectorAll('button[data-stage]').forEach((b,i)=>{
        b.querySelector('b').textContent=`0${i+1} · ${labels[i]}`;
        b.querySelector('small').textContent=['75–100% asteroid health','50–under 75%','25–under 50%','Under 25%'][i];
        b.querySelector('img').alt=labels[i];
      });
    }else{
      const labels=['01 · Intact','02 · Light','03 · Heavy','04 · Severe'],details=['75–100% hull','50–under 75%','25–under 50%','Under 25% hull'],alts=['Intact ship','Lightly damaged ship','Heavily damaged ship','Severely damaged ship'];
      document.querySelectorAll('button[data-stage]').forEach((b,i)=>{b.querySelector('b').textContent=labels[i];b.querySelector('small').textContent=details[i];b.querySelector('img').alt=alts[i];});
    }
    document.querySelector('.hull-readout .range-label').firstChild.textContent=creature()?'Health ':'Hull ';
    $('creature-health-controls').hidden=!creature();$('larva-motion-controls').hidden=!movingCreature();document.querySelector('[data-motion=newborn]').hidden=!larva();
    document.querySelector('.cloak-controls').hidden=creature()||isAsteroid;document.querySelector('.shield-readout').hidden=creature()||isAsteroid;
    if(creature()){state.shields=0;state.shieldsEnabled=false;state.shieldCharge=0;}
    $('debris-controls').hidden=creature()||isAsteroid;
    document.querySelector('.target-controls').hidden=creature()||isAsteroid;
    document.querySelector('.viewer-heading .eyebrow').textContent=isAsteroid?'SELECTED ASTEROID':creature()?'SELECTED CREATURE':'SELECTED SHIP';
    $('scene-label').textContent=isAsteroid?'ASTEROID WEAPON TEST':creature()?'CREATURE HEALTH & MOTION':'LIVE DAMAGE PREVIEW';
    $('compare').disabled=only||isAsteroid;
    document.querySelector('label[for="hull"]').textContent=isAsteroid?'Adjust asteroid health':creature()?'Adjust tissue integrity':'Adjust hull manually';
    $('repair').textContent=isAsteroid?'Restore asteroid':creature()?(egg()?'Restore egg':'Restore creature'):'Repair hull';
    $('destroy').textContent=isAsteroid?'Destroy asteroid':creature()?(egg()?'Destroy egg':'Kill creature'):'Destroy ship';
    for(const id of ['hull','repair','destroy','sequence'])$(id).disabled=!state.ready;
    document.querySelectorAll('button[data-stage]').forEach(b=>{
      const pending=only&&Number(b.dataset.stage)>0,small=b.querySelector('small');
      small.dataset.normalText=(asteroid()?['75–100% asteroid health','50–under 75%','25–under 50%','Under 25%']:['75–100% hull','50–under 75%','25–under 50%','Under 25% hull'])[Number(b.dataset.stage)];
      small.textContent=only?(pending?'Artwork pending':'Original artwork'):small.dataset.normalText;
      b.disabled=pending||!state.ready;
      b.querySelector('img').hidden=pending;
    });
    return only;
  }
  function updateUI(){
    if(!state.ship)return;
    if(asteroid()){
      configureArtworkUI();$('cthia-controls').hidden=true;$('hatch').hidden=true;$('hull').value=state.hull;$('hull-output').value=`${number(hullPoints())} / ${stats().hull} health`;$('hull-bar').style.width=state.hull+'%';$('hull-bar').style.background=state.hull<25?'#ed8b94':state.hull<50?'#e9bc73':'#88dcdf';$('stage-badge').textContent=state.destroyed?'DESTROYED':['INTACT','CRACKED','FRACTURED','BREAKING APART'][stage()];$('stage-badge').dataset.stage=state.destroyed?4:stage();
      $('ship-health').textContent=`Asteroid health ${number(hullPoints())} / ${stats().hull} · No shields · Any weapon hit destroys it.`;$('hit-result').textContent=lastHit?`${lastHit.weapon}: destroyed asteroid in one hit · ${number(lastHit.hullDamage)} asteroid health removed`:'Choose any weapon and fire at the asteroid.';
      document.querySelectorAll('[data-fire]').forEach(b=>b.disabled=state.destroyed||!state.ready);$('destroy').disabled=state.destroyed||!state.ready;
      document.querySelectorAll('button[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(!state.destroyed&&Number(b.dataset.stage)===stage())));
      canvas.setAttribute('aria-label',`${state.ship.name}, ${state.destroyed?'destroyed':number(hullPoints())+' health'}, weapon test`);return;
    }
    if(configureArtworkUI()&&!creature()){
      $('hull').value=100;$('stage-badge').textContent='INTACT ONLY';$('stage-badge').dataset.stage=0;
      $('cthia-controls').hidden=true;
      $('ship-health').textContent='Intact artwork ready. Light, heavy and severe damage stages and biological destruction are pending.';
      $('hit-result').textContent='Damage testing will be available after the damage stages are created.';
      document.querySelectorAll('button[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.stage)===0)));
      canvas.setAttribute('aria-label',state.ship.name+', intact creature artwork; damage stages pending');
      return;
    }
    if(creature()){
      const s=stage();$('hull').value=state.hull;$('hull-output').value=`${number(hullPoints())} / ${number(stats().hull)} health`;
      $('hull-bar').style.width=state.hull+'%';$('hull-bar').style.background=s>=2?'#ed8b94':'#88dcdf';$('creature-max-health').value=stats().hull;
      $('stage-badge').textContent=state.eggHatch?(state.eggHatch.complete?'HATCHED':'HATCHING'):state.destroyed?'DEAD':s===3?'DEAD / SEVERE':names[s].toUpperCase();$('stage-badge').dataset.stage=state.destroyed?4:s;
      $('ship-health').textContent=`Health ${number(hullPoints())} / ${stats().hull} · No shields`+(intactOnly()?' · Damage artwork pending':egg()&&s===3?' · Contents dead; no internal glow':'');
      if(!lastHit)$('hit-result').textContent='Fire a weapon to measure tissue damage.';
      document.querySelectorAll('[data-fire]').forEach(b=>b.disabled=state.destroyed||!state.ready||!!state.eggHatch);
      document.querySelectorAll('button[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(!state.destroyed&&Number(b.dataset.stage)===s)));
      document.querySelectorAll('[data-motion]').forEach(b=>{b.disabled=state.destroyed||s===3;b.setAttribute('aria-pressed',String(b.dataset.motion===window.larvaMotion.mode));});
      $('destroy').disabled=state.destroyed||!state.ready;
      $('cthia-controls').hidden=!state.ready;$('animation-example').textContent=state.ship.name+' biological damage';
      $('ship-lights').hidden=false;$('ship-lights').textContent=egg()?'Living interior':'Under-shell glow';$('damage-effects').textContent='Wound activity';
      $('cthia-status').textContent=state.eggHatch?'The baby pulls free; the empty shell fades away.':state.destroyed?'Dead membrane and tissue drift apart.':s===3?'Dead contents: internal glow and breathing have stopped.':egg()?'Internal light pulses beneath the membrane; damaged tissue leaks and tears.':'Living veins pulse beneath shell seams; legs and tissue move with the selected motion.';
      canvas.setAttribute('aria-label',`${state.ship.name}, ${state.destroyed?'dead':names[s]}, ${number(hullPoints())} health`);return;
    }
    const s=stage();$('hull').value=state.hull;$('hull-output').value=`${number(hullPoints())} / ${number(stats().hull)} (${number(state.hull)}%)`;$('hull-bar').style.width=state.hull+'%';$('hull-bar').style.background=s>=2?'#ed8b94':s===1?'#e9bc73':'#88dcdf';
    $('shield-output').value=`${number(shieldPoints())} / ${number(stats().shields)} (${number(state.shields)}%)`;$('shield-bar').style.width=state.shields+'%';$('shields').checked=state.shieldsEnabled;
    $('ship-health').textContent=`Hull ${number(stats().hull)} · Shields ${number(stats().shields)} · Weapons rating ${number(stats().weaponsRating)}`;
    $('cloak').setAttribute('aria-pressed',String(state.cloaked));$('cloak').textContent=state.cloaked?'Uncloak':'Cloak';$('cloak').disabled=state.destroyed||!state.ready;
    $('cloak-status').textContent=state.cloaked?'Cloaked indefinitely. Shields are down. Fire or enable shields to reveal the ship.':'Cloaking lowers shields. Firing or raising shields reveals the ship.';
    $('stage-badge').textContent=state.eggHatch?(state.eggHatch.complete?'HATCHED':'HATCHING'):state.destroyed?'DESTROYED':state.cloaked?'CLOAKED':names[s].toUpperCase();$('stage-badge').dataset.stage=state.destroyed?4:s;
    document.querySelectorAll('[data-stage]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(!state.destroyed&&Number(b.dataset.stage)===s));});
    document.querySelectorAll('[data-fire]').forEach(b=>b.disabled=state.destroyed||!state.ready);
    $('destroy').disabled=state.destroyed||!state.ready;
    $('cthia-controls').hidden=!enhancedShip();$('animation-example').textContent=state.ship.name+' animation example';$('ship-lights').hidden=state.ship.id===23;$('ship-lights').textContent=biological()?'Living pulses':state.ship.id===23?'Sail glints':'Ship lights';$('damage-effects').textContent=biological()?'Wound activity':state.ship.id===23?'Sail damage':'Damage effects';
    if(enhancedShip()){const effects=shipEffects().snapshot(s,state.time,cthiaOptions);$('cthia-status').textContent=state.eggHatch?'Membrane splits and peels back as the matching larva pulls free.':state.destroyed?(state.ship.id===23?'Sails and spars are breaking apart.':biological()?'The body ruptures; detached tissue twitches, then fades.':'Ship destroyed: attached lights and breach effects are off.'):state.ship.id===23?`${effects.damageSites} active damage sites${cthiaOptions.anchors?' · Amber: damage locations':''}`:biological()?`${effects.organs} pulsing organs · ${effects.activeWounds} active wounds${cthiaOptions.anchors?' · Cyan: organs; amber: wounds':''}`:`${effects.lights} light locations · ${effects.damageSites} active breaches${cthiaOptions.anchors?' · Cyan: lights; amber: breaches':''}`;}
    canvas.setAttribute('aria-label',`${state.ship.name}, ${state.destroyed?'destroyed':names[s]}, ${Math.round(state.hull)} percent hull, ${Math.round(state.shields)} percent shields`);
  }
  async function selectShip(id){
    biology()?.release?.();const token=++selectionToken;state.ready=false;stopSequence();clearEffects();state.ship=catalog.ships.find(s=>s.id===id);state.hull=100;state.shields=100;state.shieldCharge=100;state.shieldsEnabled=true;state.cloaked=false;state.destroyed=false;state.angle=0;state.hits=0;lastHit=null;$('hit-result').textContent='Fire a weapon to measure its hit.';
    $('loading').hidden=false;$('loading').textContent='Loading '+state.ship.name+'…';$('ship-name').textContent=state.ship.name;$('ship-source').textContent=asteroid()?'Curated mining artwork':state.ship.origin==='Biological remaster'?'Living tissue artwork':state.ship.origin==='AI remaster'?'Remastered artwork':state.ship.origin==='Rebirth'?'Rebirth artwork':'Your supplied sheet';$('ship-select').value=id;
    for(let i=0;i<4;i++){if(state.ship.frames[i])$('thumb-'+i).src=base+state.ship.frames[i]+'?v=asteroid-cutstates-1';else $('thumb-'+i).removeAttribute('src');}if(intactOnly()||asteroid()){state.compare=false;$('compare').setAttribute('aria-pressed','false');}shipPicker?.sync(id);updateUI();
    try{
      const assets=asteroid()?[...state.ship.frames,shooter.frames[0],'asteroids/asteroid_01_ore.png']:[...state.ship.frames,state.ship.original,shooter.frames[0],...(egg()?[babyFile()]:[]),...(creature()?[]:Array.from({length:6},(_,i)=>`debris-${state.ship.debrisKind}-${i}.png`))];await Promise.all(assets.map(loadImage));
      if(token!==selectionToken)return;
      if(asteroid()){state.ship.hitPoints=opaquePoints(images.get(state.ship.frames[0]));state.ship.maxHealth=asteroidMaxHealth();state.ready=true;$('loading').hidden=true;updateUI();explain(`${state.ship.name} is ready for weapon testing. Any phaser, proton weapon, or other weapon destroys it with one hit. Damage stages remain available for manual animation review.`);return;}
      if(starter()?.alignReference)images.set(state.ship.original,starter().alignReference(images.get(state.ship.original)));
      state.ship.hitPoints=opaquePoints(images.get(state.ship.frames[0]));if(enhancedShip()){if(starter())state.ship.frames.forEach((file,s)=>{const aligned=starter().align(images.get(file),s);images.set(file,aligned);if(aligned.toDataURL)$('thumb-'+s).src=aligned.toDataURL();});if(id===57||id===58)state.ship.frames.forEach((file,s)=>{const aligned=(id===57?window.alignTugFrame:window.alignOlympicFrame)(images.get(file),s);images.set(file,aligned);if(aligned.toDataURL)$('thumb-'+s).src=aligned.toDataURL();});if(state.ship.frames[3]){const severe=shipEffects().unlitFrame(images.get(state.ship.frames[3]));images.set(state.ship.frames[3],severe);$('thumb-3').src=severe.toDataURL();}if(biological()){cthiaFragments=[[],[],[],[]];biology().prepare(state.ship.frames.map(file=>images.get(file)));}else{prepareCthiaFragments();window.cthiaDestruction.prepare(state.ship.frames.map(file=>images.get(file)),window.earthFractureConfigs.get(id)||starter()?.destruction||(id===56?window.constitutionTugDestructionConfig:id===57?window.tugDestructionConfig:id===58?window.olympicDestructionConfig:{}));}}state.ship.hitPoints=opaquePoints(images.get(state.ship.frames[0]));if(egg())biology().prepareHatch(images.get(babyFile()));state.ready=true;$('loading').hidden=true;updateUI();
      if(intactOnly()){explain(state.ship.name+' is ready for weapon testing with editable health and no shields. Separate damage artwork is pending.'+(larva()?' Try Newborn, Idle, Crawl and Settle.':''));return;}
      explain(`${state.ship.name} is ready. ${biological()?'Its four biological stages show torn membranes, exposed organs and necrotic tissue.':state.ship.origin==='AI remaster'?'Its four hull stages use newly rebuilt artwork matched to your approved fleet references.':state.ship.origin==='Rebirth'?'Its four hull stages use Rebirth artwork.':'Its four hull stages use your supplied damage sheet.'} ${egg()?'Choose a damage stage, play the damage sequence, or hatch the healthy egg. Dead eggs cannot hatch.':creature()?'Choose Idle, Crawl or Settle; fire weapons to see tissue damage and weakening circulation.':'Fire a weapon to see the damage develop.'}`);
    }catch(e){if(token===selectionToken){$('loading').textContent=e.message+' — reload the page to try again.';explain('The ship artwork could not be loaded.');}}
  }
  function opaquePoints(im){
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);const rgba=g.getImageData(0,0,c.width,c.height).data,points=[];
    for(let y=2;y<c.height;y+=6)for(let x=2;x<c.width;x+=6)if(rgba[(y*c.width+x)*4+3]>160)points.push({x:x/c.width-.5,y:y/c.height-.5});
    return points.length?points:[{x:0,y:0}];
  }
  function layout(){
    const b=state.ship.bounds,ratio=starter()?.displayRatio??((b[1]-b[0])/(b[3]-b[2])),max=(state.ship.previewSize||235)*state.zoom;
    return {x:state.compare?645:540,y:253+(movingCreature()?window.larvaMotion.offset:0),w:ratio>1?max:max*ratio,h:ratio>1?max/ratio:max};
  }
  function world(p){const l=layout(),a=state.angle,c=Math.cos(a),s=Math.sin(a),x=p.x*l.w,y=p.y*l.h;return{x:l.x+x*c-y*s,y:l.y+x*s+y*c};}
  function hullPoint(){const points=state.ship.hitPoints;return points[Math.floor(Math.random()*points.length)];}
  function emitter(){
    const l=layout(),x=state.compare?110:135,y=425,a=Math.atan2(l.y-y,l.x-x)+Math.PI/2;
    const b=shooter.bounds,r=(b[1]-b[0])/(b[3]-b[2]),w=88*r,h=88,p=shooter.points.find(p=>p.kind==='beam')||{x:0,y:-.42};
    return {x:x+p.x*w*Math.cos(a)-p.y*h*Math.sin(a),y:y+p.x*w*Math.sin(a)+p.y*h*Math.cos(a),centerX:x,centerY:y,w,h,a};
  }
  function burst(point,strength=1,sparksOnly=false,delay=0){
    const unit=catalog.units*.8*state.zoom,nCore=sparksOnly?0:4+Math.floor(Math.random()*5*strength),nSparks=sparksOnly?6+Math.floor(Math.random()*10*strength):10+Math.floor(Math.random()*14*strength);
    for(let i=0;i<nCore+nSparks;i++){
      const core=i<nCore,a=Math.random()*Math.PI*2,sp=(core?20+Math.random()*55:sparksOnly?70+Math.random()*180:90+Math.random()*220)*strength*unit,jitter=(core?4:3)*unit;
      state.particles.push({x:point.x+(Math.random()*2-1)*jitter,y:point.y+(Math.random()*2-1)*jitter,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
        size:(core?3+Math.floor(Math.random()*4):sparksOnly?2+Math.floor(Math.random()*3):2+Math.floor(Math.random()*4))*unit,
        born:state.time+delay,ttl:core?140+Math.random()*120:sparksOnly?140+Math.random()*220:120+Math.random()*220,core});
    }
    if(state.particles.length>12000)state.particles.splice(0,state.particles.length-12000);
  }
  function beginAsteroidTransition(before,after,hitPoint=null){
    if(!asteroid()||before===after)return;
    const from=images.get(state.ship.frames[before]),to=images.get(state.ship.frames[after]);
    if(from&&to){state.asteroidTransition={from,to,born:state.time,duration:720};emitAsteroidTransitionFragments(from,to,layout(),after<before);}
  }
  function drawAsteroidSprite(l){
    const transition=state.asteroidTransition,next=images.get(frameFile());
    shipImage(next,l.x,l.y,l.w,l.h,state.angle);
    if(transition&&state.time-transition.born>=transition.duration)state.asteroidTransition=null;
  }
  function rockBurst(point){
    const shades=['#a9957d','#786b5c','#514940','#c0ab8d'];
    for(let i=0;i<12;i++){const a=Math.random()*Math.PI*2,speed=25+Math.random()*95;state.particles.push({x:point.x,y:point.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:2+Math.random()*4,born:state.time,ttl:260+Math.random()*380,color:shades[i%shades.length]});}
  }
  function extractRockShard(im,cx,cy,radius){
    const sides=5+Math.floor(Math.random()*4),start=Math.random()*Math.PI*2,vertices=[];
    for(let i=0;i<sides;i++){const a=start+i*Math.PI*2/sides,r=radius*(.66+Math.random()*.48);vertices.push({x:clamp(cx+Math.cos(a)*r,0,im.width),y:clamp(cy+Math.sin(a)*r,0,im.height)});}
    const left=Math.max(0,Math.floor(Math.min(...vertices.map(p=>p.x)))),top=Math.max(0,Math.floor(Math.min(...vertices.map(p=>p.y)))),right=Math.min(im.width,Math.ceil(Math.max(...vertices.map(p=>p.x)))),bottom=Math.min(im.height,Math.ceil(Math.max(...vertices.map(p=>p.y))));
    if(right-left<3||bottom-top<3)return null;
    const texture=document.createElement('canvas');texture.width=right-left;texture.height=bottom-top;const g=texture.getContext('2d');
    g.beginPath();vertices.forEach((p,i)=>i?g.lineTo(p.x-left,p.y-top):g.moveTo(p.x-left,p.y-top));g.closePath();g.clip();g.drawImage(im,-left,-top);
    return {texture,x:cx/im.width-.5,y:cy/im.height-.5,w:texture.width/im.width,h:texture.height/im.height};
  }
  function emitAsteroidTransitionFragments(from,to,l,reverse=false){
    if(from.width!==to.width||from.height!==to.height)return;
    const w=from.width,h=from.height,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const g=canvas.getContext('2d');g.drawImage(reverse?to:from,0,0,w,h);
    const pixels=g.getImageData(0,0,w,h).data,fromAlpha=document.createElement('canvas'),toAlpha=document.createElement('canvas');fromAlpha.width=toAlpha.width=w;fromAlpha.height=toAlpha.height=h;
    const a=fromAlpha.getContext('2d'),b=toAlpha.getContext('2d');a.drawImage(reverse?to:from,0,0,w,h);b.drawImage(reverse?from:to,0,0,w,h);
    const oldA=a.getImageData(0,0,w,h).data,newA=b.getImageData(0,0,w,h).data,missing=[];
    let minX=w,minY=h,maxX=-1,maxY=-1,sumX=0,sumY=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(oldA[i+3]>90&&newA[i+3]<24){missing.push([x,y,i]);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);sumX+=x;sumY+=y;}}
    if(missing.length<24)return;
    const meanX=sumX/missing.length,meanY=sumY/missing.length;let xx=0,yy=0,xy=0;
    for(const [x,y]of missing){xx+=(x-meanX)**2;yy+=(y-meanY)**2;xy+=(x-meanX)*(y-meanY);}
    const axis=Math.atan2(2*xy,xx-yy)/2,ux=Math.cos(axis),uy=Math.sin(axis),projected=missing.map(p=>(p[0]-meanX)*ux+(p[1]-meanY)*uy).sort((x,y)=>x-y);
    const centers=[.12,.37,.63,.88].map(q=>{const v=projected[Math.floor(q*(projected.length-1))];return{x:meanX+ux*v,y:meanY+uy*v};});
    const groups=centers.map(()=>[]);
    for(const pixel of missing){let best=0,distance=Infinity;for(let i=0;i<centers.length;i++){const dx=pixel[0]-centers[i].x,dy=pixel[1]-centers[i].y,d=dx*dx+dy*dy;if(d<distance){best=i;distance=d;}}groups[best].push(pixel);}
    for(const group of groups){if(group.length<12)continue;let lx=w,ly=h,rx=0,by=0,cx=0,cy=0;for(const [x,y]of group){lx=Math.min(lx,x);ly=Math.min(ly,y);rx=Math.max(rx,x);by=Math.max(by,y);cx+=x;cy+=y;}cx/=group.length;cy/=group.length;
      const texture=document.createElement('canvas');texture.width=rx-lx+1;texture.height=by-ly+1;const tg=texture.getContext('2d'),image=tg.createImageData(texture.width,texture.height);
      for(const [x,y,i]of group){const dest=((y-ly)*texture.width+x-lx)*4;image.data.set(pixels.subarray(i,i+4),dest);}tg.putImageData(image,0,0);
      let at=world({x:cx/w-.5,y:cy/h-.5}),dx=at.x-l.x,dy=at.y-l.y,len=Math.max(1,Math.hypot(dx,dy)),sign=reverse?-1:1,offset=reverse?18:0;
      at={x:at.x+dx/len*offset,y:at.y+dy/len*offset};const speed=(105+Math.random()*115)*state.zoom*sign;
      state.debris.push({...at,texture,w:(rx-lx+1)/w*l.w,h:(by-ly+1)/h*l.h,vx:dx/len*speed,vy:dy/len*speed,angle:state.angle,spin:(Math.random()-.5)*6,born:state.time,ttl:1900+Math.random()*750,asteroidShard:true,transitionShard:true});
    }
  }
  function emitAsteroidShards(im,l,hitPoint,count,speedScale,lifeScale){
    if(!im)return;
    for(let i=0;i<count;i++){
      const sample=hitPoint||state.ship.hitPoints[Math.floor(Math.random()*state.ship.hitPoints.length)],baseX=sample.x+.5,baseY=sample.y+.5;
      const cx=clamp((baseX+(Math.random()-.5)*.34)*im.width,0,im.width),cy=clamp((baseY+(Math.random()-.5)*.34)*im.height,0,im.height);
      const piece=extractRockShard(im,cx,cy,im.width*(.045+Math.random()*.075));if(!piece)continue;
      const at=world(piece),direction=Math.atan2(at.y-l.y,at.x-l.x)+(Math.random()-.5)*.75,speed=(80+Math.random()*190)*speedScale*state.zoom;
      state.debris.push({...at,texture:piece.texture,w:piece.w*l.w,h:piece.h*l.h,vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,angle:state.angle,spin:(Math.random()-.5)*7,born:state.time,ttl:(1500+Math.random()*1300)*lifeScale,asteroidShard:true});
    }
  }
  function emitAsteroidOres(l){
    const ore=images.get('asteroids/asteroid_01_ore.png');if(!ore)return;
    for(let i=0;i<6;i++){
      const a=Math.random()*Math.PI*2,speed=(72+Math.random()*130)*state.zoom,scale=.11+Math.random()*.05;
      state.debris.push({x:l.x+(Math.random()-.5)*l.w*.16,y:l.y+(Math.random()-.5)*l.h*.16,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,texture:ore,w:l.w*scale,h:l.h*scale,angle:Math.random()*Math.PI*2,spin:(Math.random()-.5)*4,born:state.time+Math.random()*110,ttl:4200+Math.random()*1800,asteroidShard:true,ore:true});
    }
  }
  function drawAsteroidDebris(){
    for(const p of state.debris){if(!p.asteroidShard)continue;const age=state.time-p.born;if(age<0||age>p.ttl)continue;const fade=Math.min(1,(p.ttl-age)/500);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=fade;if(p.ore){ctx.shadowColor='#f4c86d';ctx.shadowBlur=8;}ctx.drawImage(p.texture,-p.w/2,-p.h/2,p.w,p.h);ctx.restore();}
  }
  function drawAsteroidBlast(l){
    if(!state.asteroidBlast)return;const age=state.time-state.asteroidBlast.born,duration=260;if(age>=duration){state.asteroidBlast=null;return;}
    const t=age/duration;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#e5b979';ctx.lineWidth=2+5*(1-t);ctx.beginPath();ctx.ellipse(l.x,l.y,12+t*l.w*.72,10+t*l.h*.72,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  function destroy(sourceStage=stage()){
    if(!state.ready||state.destroyed)return;
    const l=layout(),mass=clamp((state.ship.mass-1)/1199,0,1),strength=4+6*mass,bursts=Math.round(12+18*mass);
    state.eggHatch=null;state.hull=0;state.destroyed=true;state.cloaked=false;state.shields=0;state.shots=[];
    if(asteroid()){
      state.asteroidTransition=null;state.asteroidBlast={born:state.time};
      emitAsteroidShards(images.get(state.ship.frames[3])||images.get(frameFile()),l,null,22,1.9,2.2);
      for(let i=0;i<7;i++)rockBurst(world(hullPoint()));emitAsteroidOres(l);playSound('explodesmall',.16);updateUI();
      explain(`${state.ship.name} fractures and bursts apart. Rock fragments tumble away and mineral ore is ejected. Restore asteroid to test another weapon.`);
      return;
    }
    if(biological()){
      biology().emit(state,l,world,sourceStage,state.zoom);playSound('explodelarge',.10);updateUI();
      explain(creature()&&!egg()?'The creature dies and tears into tissue and ichor. Restore creature returns it to full health.':creature()?'The dead egg collapses and tears into dark membrane, tissue and fluid. Nothing hatches; its interior and fragments stay unlit. Restore egg returns the living intact state.':state.ship.id===50?'The Lifeform contracts, swells and bursts. Fleshy lobes, sticky strands, ichor and spores drift outward as circulation fails. Repair hull restores the living pod.':'The Bioship convulses, swells and ruptures. Chitin, dying organs, ichor and spores drift outward with trailing sinews. Repair hull restores the living body.');return;
    }
    if(enhancedShip()){
      state.particles=[];window.cthiaDestruction.emit(state,l,world,sourceStage,state.zoom,{x:emitter().centerX,y:emitter().centerY});
      playSound('explode',.14);updateUI();explain(state.ship.id===23?'The sailing ship tears into its remaining sails, spars and navigation capsule. Small ignition flashes, sparks and fading smoke follow the torn material. Repair hull restores the ship.':state.ship.name+' breaks into its remaining hull sections. Breach flashes, hot sparks and fading smoke follow the wreckage; the reactor flares, then loses power. Use Repair hull to restore it.');return;
    }
    burst(l,strength);burst(l,strength*.7,false,35);
    for(let i=0;i<bursts;i++)burst(world(hullPoint()),(1.6+3.6*mass)*(.8+Math.random()*.9),false,i*18);
    for(let i=0;i<12;i++)burst(world(hullPoint()),3.2+Math.random()*2.4,true,50+i*26);
    const count=Math.round(5+15*clamp((state.ship.mass-1)/999,0,1));
    for(let i=0;i<count;i++){
      const p=world(hullPoint()),a=Math.random()*Math.PI*2,speed=(20+Math.random()*180)*.8*state.zoom;
      state.debris.push({...p,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,spin:(Math.random()*2-1)*(1.2+Math.random()*2.2),angle:Math.random()*Math.PI*2,
        born:state.time,ttl:10000+Math.random()*10000,size:clamp(state.ship.size*(.09+Math.random()*.07),15,50)*.8*state.zoom,file:`debris-${state.ship.debrisKind}-${Math.floor(Math.random()*6)}.png`});
    }
    playSound(state.ship.mass<400?'explodesmall':state.ship.mass>800?'explodelarge':'explode',.14);updateUI();
    explain('Ship destroyed. Explosions spread across the hull while Rebirth debris spins outward, slows and fades. Use Repair hull to bring it back.');
  }
  function hit(shot){
    if(state.destroyed)return;
    state.hits++;const before=stage(),p=world(shot.hit),shielded=state.shields>0,oldHull=hullPoints(),oldShields=shieldPoints();let amount=shot.damage,absorbed=0;
    if(shielded){absorbed=Math.min(oldShields,amount);state.shields=Number(((oldShields-absorbed)/stats().shields*100).toFixed(12));amount-=absorbed;state.flash={born:state.time,color:shieldColor()};playSound('shieldhit',.12);}
    if(amount>0){if(asteroid())amount=oldHull;state.hull=Number((Math.max(0,oldHull-amount)/stats().hull*100).toFixed(12));if(biological())biology().spray(state,p,state.zoom,20);else if(!asteroid())burst(p,1);}
    lastHit={weaponId:shot.style.id,weapon:shot.style.name,damage:shot.damage,shieldDamage:absorbed,hullDamage:oldHull-hullPoints(),overkill:Math.max(0,amount-oldHull),visual:shot.visual};
    $('hit-result').textContent=`${shot.style.name}: ${number(shot.damage)} damage | Shield damage: ${number(absorbed)} | ${asteroid()?'Asteroid':creature()?'Health':'Hull'} damage: ${number(lastHit.hullDamage)}${lastHit.overkill?' | Overkill: '+number(lastHit.overkill):''}${shot.visual?' | Visual override':''}`;
    updateUI();
    if(state.hull<=0){destroy(before);return;}
    if(asteroid()){explain(`${shot.style.name} hit ${state.ship.name}. One weapon hit destroys the asteroid; rock fragments and mineral ore burst outward.`);return;}
    breakCthia(before,stage());
    if(shielded&&amount===0)explain(`Shield hit: ${Math.round(state.shields)}% shields remain. Hull stays at ${Math.round(state.hull)}%, so its damage artwork stays unchanged.`);
    else if(creature())explain(`${shot.style.name} dealt ${number(lastHit.hullDamage)} health damage. ${number(hullPoints())} / ${stats().hull} health remains.${intactOnly()?' Tissue reactions are visible; separate damage artwork is pending.':''}`);
    else if(stage()>before)explain(`Hull fell to ${Math.round(state.hull)}%. ${names[stage()]} artwork is now visible; the ship keeps the same alignment and size.`);
    else explain(`Hull hit: ${Math.round(state.hull)}% remains. ${biological()?'Ichor marks the injured tissue.':'Sparks mark the impact.'} The next artwork changes below ${stage()===0?75:stage()===1?50:25}% hull.`);
  }
  function shieldColor(ship=state.ship){const s=String(ship.shieldColor);return s==='green'?'#50ff78':s==='yellow'?'#ffd95a':s==='purple'?'#b465ff':'#50d5ff';}
  function fire(kind,visualPercent=null){
    if(!state.ready||state.destroyed||state.eggHatch)return;
    if(state.cloaked){state.cloaked=false;updateUI();}
    const index=Number($(kind+'-style').value),style=catalog.weapons[kind][index],from=emitter(),visual=visualPercent!==null||$('visual-damage').checked,damage=visual?(visualPercent??state.damage)*stats().hull/100:style.baseDamage,shot={kind,style,visual,from:{x:from.x,y:from.y},hit:hullPoint(),born:state.time,damage,spin:Math.random()*Math.PI*2,spinSpeed:4+Math.random()*5};
    if(!visual){
      const remaining=(state.weaponReadyAt[style.id]||0)-state.time;
      if(remaining>0){explain(`${style.name} recharging: ${number(remaining/1000)} seconds remaining.`);return;}
      state.weaponReadyAt[style.id]=state.time+style.recharge*1000/13;
    }
    state.shots.push(shot);playSound(style.sound);
    if(kind==='beam'){hit(shot);shot.impacted=true;}else explain(`${style.name} is traveling toward the hull. Damage is applied when it arrives.`);
    updateRecharge();
  }
  function sequence(){
    state.eggHatch=null;
    if(state.sequence){stopSequence();explain('Damage sequence stopped. Use the controls to continue inspecting the ship.');return;}
    reset(true);state.shields=0;state.shieldsEnabled=false;state.shieldCharge=100;updateUI();state.paused=false;$('pause').setAttribute('aria-pressed','false');$('pause').textContent='Ⅱ Pause';
    state.sequence={born:state.time,index:0,events:[{at:700,kind:'beam'},{at:2400,kind:'torpedo'},{at:4100,kind:'disruptor'},{at:5800,kind:'torpedo'},{at:9200,repair:true}]};
    $('sequence').textContent='■ Stop sequence';explain(creature()?'Biological sequence: shell splits, tissue tears, circulation stops and goes dark, then the dead body breaks apart and restores.':'Guided sequence: four 26% hull hits show light, heavy and severe damage, then destruction and repair.');
  }
  function step(dt){
    state.time+=dt*1000;if(movingCreature()&&!state.destroyed&&stage()<3){const m=window.larvaMotion;if(m.mode==='crawl'){const pace=shipEffects().snapshot(stage(),state.time,cthiaOptions).pace||1;m.offset=-Math.sin((state.time-m.born)*.0006*pace)*(state.ship.creatureType==='queen'||[77,78].includes(state.ship.id)?26:45);}else if(m.mode==='settle')m.offset*=Math.exp(-dt*2.5);}if(state.eggHatch&&!state.eggHatch.complete&&state.time-state.eggHatch.born>=6500){state.eggHatch.complete=true;updateUI();explain('The baby has pulled free and is wriggling beside the empty shell. Restore egg to replay hatching.');}if(state.rotate&&!state.destroyed)state.angle+=dt*.35;
    if(state.sequence){const seq=state.sequence,e=seq.events[seq.index];if(e&&state.time-seq.born>=e.at){seq.index++;if(e.repair){reset(true);explain(creature()?'Sequence complete: all four tissue stages, dead egg breakup and restoration.':'Sequence complete: all four hull stages, destruction and repair. Try another ship or switch weapon styles.');}else if(creature()){const before=stage();state.hull=Math.max(0,state.hull-26);if(!state.hull)destroy(before);else{breakCthia(before,stage());updateUI();}}else fire(e.kind,26);}}
    for(const shot of [...state.shots])if(shot.kind!=='beam'&&!shot.impacted&&state.time-shot.born>=650){shot.impacted=true;hit(shot);}
    state.shots=state.shots.filter(s=>state.time-s.born<(s.kind==='beam'?180:650));
    for(const p of state.particles){if(state.time<p.born)continue;p.x+=p.vx*dt;p.y+=p.vy*dt;const drag=Math.max(0,1-(p.core?3.6:2.8)*dt);p.vx*=drag;p.vy*=drag;}
    state.particles=state.particles.filter(p=>state.time-p.born<p.ttl);
    for(const p of state.debris){if(state.time<p.born)continue;const oldX=p.x,oldY=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;if(p.asteroidShard){const drag=Math.max(0,1-.32*dt);p.vx*=drag;p.vy*=drag;continue;}const impact=debrisImpacts.step(p,oldX,oldY,emitter(),images.get(shooter.frames[0]),state);if(impact){$('debris-impact-status').textContent=impact.kind==='shield'?'Debris hit: shield flash. Shields and hull unchanged.':'Debris hit: hull sparks. Hull unchanged.';if(impact.kind==='shield')playSound('shieldhit',.08);}p.vx*=Math.max(0,1-(p.farTravel?.055:p.structural?(p.small?.35:.65):.2)*dt);p.vy*=Math.max(0,1-(p.farTravel?.055:p.structural?(p.small?.35:.65):.2)*dt);}
    state.debris=state.debris.filter(p=>state.time-p.born<p.ttl);window.cthiaDestruction.updateTrails(state);if(biological()){biology().updateTrails(state);biology().updateLiving(state,world,stage(),state.zoom,cthiaOptions);}
  }
  function gradient(x,y,r,hex,alpha=1){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#ffffff');g.addColorStop(.18,hex);g.addColorStop(1,hex+'00');ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  function shipImage(im,x,y,w,h,a=0,flash=false){
    if(!im)return;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.drawImage(im,-w/2,-h/2,w,h);
    if(flash&&state.flash&&state.time-state.flash.born<140){
      window.drawShowcaseShieldFlash(ctx,im,w,h,state.flash,state.time);
    }ctx.restore();
  }
  function label(text,x,y,align='center',tint='#7089a0'){ctx.textAlign=align;ctx.fillStyle=tint;ctx.font='10px system-ui';ctx.fillText(text,x,y);}
  function draw(){
    ctx.clearRect(0,0,900,540);ctx.fillStyle='#050b12';ctx.fillRect(0,0,900,540);
    const bg=ctx.createRadialGradient(490,265,0,490,265,480);bg.addColorStop(0,'#122d3b90');bg.addColorStop(1,'#050b1200');ctx.fillStyle=bg;ctx.fillRect(0,0,900,540);
    for(const s of stars){ctx.globalAlpha=s.a;ctx.fillStyle='#bcd6f2';ctx.fillRect(s.x,s.y,s.r,s.r);}ctx.globalAlpha=1;
    ctx.strokeStyle='#25495b28';ctx.lineWidth=1;for(let x=30;x<900;x+=90){ctx.beginPath();ctx.moveTo(x,60);ctx.lineTo(x,475);ctx.stroke();}for(let y=70;y<475;y+=90){ctx.beginPath();ctx.moveTo(30,y);ctx.lineTo(870,y);ctx.stroke();}
    if(!state.ready)return;
    if(asteroid()){
      const l=layout(),source=emitter();shipImage(images.get(shooter.frames[0]),source.centerX,source.centerY,source.w,source.h,source.a);label('FIRING SHIP · '+shooter.name.toUpperCase(),source.centerX,source.centerY+64);
      if(!state.destroyed)drawAsteroidSprite(l);
      drawAsteroidDebris();drawAsteroidBlast(l);
      label(state.destroyed?'ASTEROID DESTROYED':`${number(hullPoints())} / ${stats().hull} HEALTH`,l.x,460,state.destroyed?'#ed8b94':'#e9bc73');
      for(const shot of state.shots){const hit=world(shot.hit),age=state.time-shot.born,t=clamp(age/650,0,1);window.drawShowcaseWeapon(ctx,{kind:shot.kind,color:shot.style.color,thickness:shot.style.thickness,units:catalog.units,zoom:state.zoom,x1:shot.from.x,y1:shot.from.y,x2:hit.x,y2:hit.y,x:shot.from.x+(hit.x-shot.from.x)*t,y:shot.from.y+(hit.y-shot.from.y)*t,angle:Math.atan2(hit.y-shot.from.y,hit.x-shot.from.x),spin:shot.spin+age/1000*shot.spinSpeed});}
      for(const p of state.particles){const age=state.time-p.born;if(age<0||age>p.ttl)continue;const fade=1-age/p.ttl,size=Math.max(1,Math.round(p.size));ctx.globalAlpha=fade;ctx.fillStyle=p.color|| (p.core?'#ff8c14':'#ffd25a');ctx.fillRect(Math.round(p.x)-Math.floor(size/2),Math.round(p.y)-Math.floor(size/2),size,size);}ctx.globalAlpha=1;
      ctx.globalAlpha=1;return;
    }
    ctx.save();window.cthiaDestruction.shake(ctx,state);
    const l=layout(),source=emitter();{shipImage(images.get(shooter.frames[0]),source.centerX,source.centerY,source.w,source.h,source.a);label('FIRING SHIP · '+shooter.name.toUpperCase(),source.centerX,source.centerY+64);debrisImpacts.draw(ctx,source,state.time,shieldColor(shooter));}
    if(state.compare){shipImage(images.get(state.ship.original),285,253,l.w,l.h,state.angle);label('ORIGINAL REFERENCE',285,460);label('UPDATED · '+(state.destroyed?'DESTROYED':names[stage()].toUpperCase()),l.x,460);ctx.strokeStyle='#38505e';ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(450,75);ctx.lineTo(450,435);ctx.stroke();ctx.setLineDash([]);}
    else label(state.ship.name.toUpperCase(),l.x,460);
    if(!state.destroyed){
      const r=Math.max(l.w,l.h)*.72,spin=state.time/1000*1.8;ctx.fillStyle=colors[state.target];ctx.globalAlpha=state.target==='fleet'?.95:1;
      if(!creature())for(let i=0;i<5;i++){const a=spin+i*Math.PI*2/5,ux=Math.cos(a),uy=Math.sin(a);ctx.beginPath();ctx.moveTo(l.x+ux*(r-16),l.y+uy*(r-16));ctx.lineTo(l.x+ux*r-uy*3,l.y+uy*r+ux*3);ctx.lineTo(l.x+ux*r+uy*3,l.y+uy*r-ux*3);ctx.closePath();ctx.fill();}ctx.globalAlpha=1;
      ctx.save();if(state.cloaked)ctx.globalAlpha=.18;
      if(state.eggHatch){biology().drawHatch(ctx,state,l);}else if(biological()){biology().drawBody(ctx,images.get(frameFile()),l,state.angle,stage(),state.time);if(state.flash&&state.time-state.flash.born<140){ctx.save();ctx.translate(l.x,l.y);ctx.rotate(state.angle);window.drawShowcaseShieldFlash(ctx,images.get(frameFile()),l.w,l.h,state.flash,state.time);ctx.restore();}}else shipImage(images.get(frameFile()),l.x,l.y,l.w,l.h,state.angle,true);
      if(enhancedShip()&&!state.cloaked&&!state.eggHatch)shipEffects().draw(ctx,l,state.angle,stage(),state.time,cthiaOptions);ctx.restore();
    }
    if(biological()&&state.destroyed)biology().drawDeath(ctx,state);
    for(const shot of state.shots){
      const hit=world(shot.hit),age=state.time-shot.born,t=clamp(age/650,0,1);
      window.drawShowcaseWeapon(ctx,{kind:shot.kind,color:shot.style.color,thickness:shot.style.thickness,units:catalog.units,zoom:state.zoom,
        x1:shot.from.x,y1:shot.from.y,x2:hit.x,y2:hit.y,
        x:shot.from.x+(hit.x-shot.from.x)*t,y:shot.from.y+(hit.y-shot.from.y)*t,
        angle:Math.atan2(hit.y-shot.from.y,hit.x-shot.from.x),spin:shot.spin+age/1000*shot.spinSpeed});
    }
    for(const p of state.debris){const age=state.time-p.born;if(age<0)continue;const fade=age/p.ttl;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=fade<.65?1:Math.max(0,(1-fade)/.35);const im=p.texture||images.get(p.file);if(p.biological)window.bioshipEffects.drawWreck(ctx,p,state.time);else if(p.structural)window.cthiaDestruction.drawStructuralWreck(ctx,p,state.time);else if(im)ctx.drawImage(im,-(p.w||p.size)/2,-(p.h||p.size)/2,p.w||p.size,p.h||p.size);if(p.wreck&&!p.structural)window.cthiaDestruction.drawWreckGlow(ctx,p,state.time);ctx.restore();}
    for(const p of state.particles){const age=state.time-p.born;if(age<0||age>p.ttl)continue;if(p.realistic){if(p.realistic.startsWith('bio-'))window.bioshipEffects.drawParticle(ctx,p,state.time);else window.cthiaDestruction.drawParticle(ctx,p,state.time);continue;}const t=clamp(age/p.ttl,0,1),fade=1-t,size=Math.max(1,Math.round(p.size)),x=Math.round(p.x),y=Math.round(p.y);ctx.fillStyle=p.core?`rgba(255,140,20,${.75*fade})`:`rgba(255,210,90,${.95*fade})`;ctx.fillRect(x-(size>>1),y-(size>>1),size,size);if(p.core&&t<.45){ctx.fillStyle=`rgba(255,255,255,${.65*fade})`;ctx.fillRect(x,y,1,1);}}
    ctx.restore();ctx.globalAlpha=1;
  }
  function frame(now){const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;if(state.ready&&!state.paused)step(dt*(state.slow?.25:1));updateRecharge();draw();requestAnimationFrame(frame);}
  function resize(){const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(900*dpr);canvas.height=Math.round(540*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  window.addEventListener('resize',resize);resize();requestAnimationFrame(frame);
  document.addEventListener('click',event=>{if(!$('weapon-picker').contains(event.target))$('weapon-picker').open=false;});
  $('weapon-picker').addEventListener('keydown',event=>{if(event.key==='Escape'){$('weapon-picker').open=false;$('weapon-picker').querySelector('summary').focus();}});
  $('ship-select').addEventListener('change',()=>selectShip(Number($('ship-select').value)));
  for(const [id,delta]of[['previous',-1],['next',1]])$(id).onclick=()=>shipPicker?.navigate(delta);
  document.querySelectorAll('[data-fire]').forEach(b=>b.onclick=()=>{stopSequence();fire(b.dataset.fire);});
  document.querySelectorAll('[data-stage]').forEach(b=>{if(b.tagName==='BUTTON')b.onclick=()=>{if(!state.ready)return;const before=state.destroyed?3:stage(),asteroidShowcase=asteroid();stopSequence();if(!asteroidShowcase)clearEffects();state.destroyed=false;state.hull=[100,65,40,15][Number(b.dataset.stage)];state.shields=state.shieldsEnabled?100:0;if(asteroidShowcase){state.shots=[];beginAsteroidTransition(before,stage());}else breakCthia(before,stage());updateUI();explain(asteroidShowcase?`${['Intact','Cracked','Fractured','Breaking apart'][stage()]} asteroid state selected. Matching rock fragments fly from the old state as the new image appears.`:`${names[stage()]} at ${state.hull}% ${creature()?'tissue integrity':'hull'}. Compare the four thumbnails: the art stays aligned across every stage.`);};});
  $('hull').oninput=()=>{if(!state.ready)return;const before=state.destroyed?3:stage();stopSequence();state.eggHatch=null;state.shots=[];state.hull=Number($('hull').value);if(state.hull===0)destroy(before);else{state.destroyed=false;beginAsteroidTransition(before,stage());if(stage()<before)state.debris=state.debris.filter(p=>!p.cthia);breakCthia(before,stage());updateUI();explain(`${state.hull}% ${asteroid()?'asteroid integrity':creature()?'tissue integrity':'hull'}: ${names[stage()]}. The stage changes below 75%, 50% and 25%.`);}};
  $('hit-strength').oninput=()=>{state.damage=Number($('hit-strength').value);$('damage-output').value=state.damage+'%';};
  $('debris-target-shields').onchange=()=>{debrisImpacts.setShields($('debris-target-shields').checked);$('debris-impact-status').textContent=$('debris-target-shields').checked?'Nearby ship shields up. Debris causes shield flashs only.':'Nearby ship shields down. Debris causes sparks only.';};
  $('cloak').onclick=()=>{
    if(!state.ready||state.destroyed||creature())return;stopSequence();
    state.cloaked=!state.cloaked;
    if(state.cloaked){if(state.shieldsEnabled)state.shieldCharge=state.shields;state.shieldsEnabled=false;state.shields=0;}
    updateUI();explain(state.cloaked?'Cloaked indefinitely with shields down. Fire or raise shields to reveal the ship.':'Ship revealed. Shields remain down until enabled.');
  };
  $('shields').onchange=()=>{
    if(!state.ready||state.destroyed||creature())return;stopSequence();
    const enabled=$('shields').checked;
    if(enabled){state.cloaked=false;state.shields=state.shieldCharge;}
    else{state.shieldCharge=state.shields;state.shields=0;}
    state.shieldsEnabled=enabled;updateUI();
    explain(enabled?'Ship revealed. Shields enabled at their remaining charge.':'Shields are down. The next weapon hit will damage the hull.');
  };
  document.querySelectorAll('[data-motion]').forEach(b=>b.onclick=()=>{if(!movingCreature()||state.destroyed||stage()===3)return;window.larvaMotion.mode=b.dataset.motion;window.larvaMotion.born=state.time;updateUI();});
  $('creature-max-health').onchange=()=>{const value=Number($('creature-max-health').value);if(!creature()||!Number.isFinite(value)||value<1||value>100000){updateUI();return;}healthOverrides[state.ship.id]=Math.round(value);try{localStorage.setItem('creatureHealth',JSON.stringify(healthOverrides));}catch{}reset(true);explain('Maximum health updated. Creature restored for a fresh weapon test.');};
  $('hatch').onclick=()=>{if(!egg()||!state.ready||state.destroyed||stage()===3||state.eggHatch)return;reset(true);state.paused=false;$('pause').setAttribute('aria-pressed','false');$('pause').textContent='? Pause';state.eggHatch={born:state.time,complete:false};updateUI();explain('The living egg pulses as its baby pushes through the membrane. The shell peels back and wet strands stretch as the larva pulls free.');};
  $('repair').onclick=()=>reset(true);$('reset').onclick=()=>reset();$('destroy').onclick=()=>{stopSequence();destroy();};$('sequence').onclick=()=>{if(state.ready)sequence();};
  for(const id of['pause','slow','rotate','compare'])$(id).onclick=()=>{const key=id==='pause'?'paused':id;state[key]=!state[key];$(id).setAttribute('aria-pressed',String(state[key]));if(id==='pause')$(id).textContent=state.paused?'▶ Resume':'Ⅱ Pause';if(id==='compare')explain(state.compare?'Original reference on the left; updated interactive art on the right. Fire a weapon or select a damage stage to inspect the upgrade.':'Live damage preview restored. The four thumbnails below let you inspect each stage directly.');};
  $('zoom').oninput=()=>state.zoom=Number($('zoom').value)/100;
  for(const [id,key] of [['ship-lights','lights'],['damage-effects','damage'],['effect-locations','anchors']])$(id).onclick=()=>{cthiaOptions[key]=!cthiaOptions[key];$(id).setAttribute('aria-pressed',String(cthiaOptions[key]));updateUI();explain(key==='anchors'?(state.ship.id===23?'Amber markers show damage locations on the sails and spars.':biological()?'Effect locations: cyan markers show living organs; amber markers show tissue wounds.':'Effect locations: cyan markers show lamps, windows and running lights; amber markers show breaches in the selected damage stage.'):state.ship.name+' '+(biological()?(key==='lights'?'living pulses':'wound activity'):(state.ship.id===23?(key==='lights'?'sail glints':'sail damage'):(key==='lights'?'ship lights':'damage effects')))+' '+(cthiaOptions[key]?'enabled.':'disabled.'));};
  document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{state.target=b.dataset.target;document.querySelectorAll('[data-target]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));explain(`${b.textContent} target selected. The five rotating triangles use the upgraded game’s ${b.dataset.target==='enemy'?'red':b.dataset.target==='fleet'?'green':'gray'} selection color.`);});
  $('sound').onclick=()=>{state.sound=!state.sound;$('sound').setAttribute('aria-pressed',String(state.sound));$('sound').textContent=state.sound?'Sound on':'Sound off';if(!state.sound){for(const a of audio)a.pause();audio.clear();}};
  window.showcaseState=()=>({ready:state.ready,ship:state.ship?.id,creatureMotion:movingCreature()?{...window.larvaMotion}:null,larvaMotion:larva()?{...window.larvaMotion}:null,hatching:egg()&&state.eggHatch?biology().hatchSnapshot(state):null,kind:state.ship?.kind||'ship',intactOnly:intactOnly(),combat:combat&&state.ship&&stats()?{hull:hullPoints(),maxHull:stats().hull,shields:shieldPoints(),maxShields:stats().shields,firingShip:shooter.id,weaponsRating:firingStats().weaponsRating,lastHit,visualOverride:$('visual-damage').checked}:null,hull:state.hull,shields:state.shields,shieldsEnabled:state.shieldsEnabled,cloaked:state.cloaked,stage:stage(),destroyed:state.destroyed,paused:state.paused,slow:state.slow,rotate:state.rotate,compare:state.compare,target:state.target,shots:state.shots.length,particles:state.particles.length,debris:state.debris.length,asteroidFragments:state.debris.filter(p=>p.asteroidShard&&!p.ore).length,asteroidOre:state.debris.filter(p=>p.ore).length,asteroidTransition:!!state.asteroidTransition,cthiaPieces:state.debris.filter(p=>p.cthia).length,cthiaWreck:state.debris.filter(p=>p.wreck).map(p=>({name:p.name,stage:p.sourceStage,x:p.x,y:p.y,angle:p.angle,pixels:p.pixels,structural:!!p.structural,edgePixels:p.edgePixels||0,tumbleRate:p.tumbleRate||0,small:!!p.small,farTravel:!!p.farTravel,vx:p.vx,vy:p.vy,ttl:p.ttl,w:p.w,h:p.h})),nearbyShip:debrisImpacts.snapshot(),biological:biological(),bioDeath:state.bioDeath?{born:state.bioDeath.born,rupture:state.bioDeath.rupture,stage:state.bioDeath.stage}:null,cthiaCutAudit:enhancedShip()?(biological()?biology().audit():window.cthiaDestruction.audit()):null,realisticParticles:state.particles.filter(p=>p.realistic).length,cthiaFragmentPixels:enhancedShip()?cthiaFragments.map(parts=>parts.reduce((n,p)=>n+p.pixels,0)):null,sequence:!!state.sequence,angle:state.angle,time:state.time,hits:state.hits,enhancedEffects:enhancedShip()&&!state.destroyed?shipEffects().snapshot(stage(),state.time,cthiaOptions):null,constitutionTug:state.ship?.id===56&&!state.destroyed?shipEffects().snapshot(stage(),state.time,cthiaOptions):null,tug:state.ship?.id===57&&!state.destroyed?shipEffects().snapshot(stage(),state.time,cthiaOptions):null,olympic:state.ship?.id===58&&!state.destroyed?shipEffects().snapshot(stage(),state.time,cthiaOptions):null,cthia:state.ship?.id===59&&!state.destroyed?window.cthiaEffects.snapshot(stage(),state.time,cthiaOptions):null});
  (async()=>{
    try{
      const responses=await Promise.all([fetch(base+'catalog.json?v=mutations-1'),fetch(base+'combat-data.json?v=weapon-independent-1'),fetch(base+'asteroids.json?v=curated-rocks-1')]);if(responses.some(r=>!r.ok))throw Error('Could not load ship, asteroid, or combat data');[catalog,combat,asteroidData]=await Promise.all(responses.map(r=>r.json()));catalog.weapons=combat.weapons;catalog.ships.push(...asteroidData.map((rock,index)=>({id:100+index,name:rock.name,kind:'asteroid',origin:'Curated mining artwork',frames:rock.name==='Asteroid 01'?['asteroids/asteroid_01_intact.png','asteroids/asteroid_01_light.png','asteroids/asteroid_01_heavy.png','asteroids/asteroid_01_severe.png']:[rock.file,`${rock.file.slice(0,-4)}_light.png`,`${rock.file.slice(0,-4)}_heavy.png`,`${rock.file.slice(0,-4)}_severe.png`],original:rock.file,bounds:[0,rock.width,0,rock.height],previewSize:Math.min(235,Math.max(rock.width,rock.height)),debrisKind:1,mass:1})));shooter=catalog.ships.find(s=>s.id===6);
      shipPicker=window.createShipPicker(catalog.ships,id=>window.starterShips.has(id)&&window.starterShips.get(id).animationReady!==false||[56,57,58,59].includes(id),selectShip);
      for(const kind of['beam','torpedo','disruptor']){
        const group=document.createElement('optgroup');group.label={beam:'Phasers / beams',torpedo:'Torpedoes',disruptor:'Disruptors / pulses'}[kind];
        const heading=document.createElement('p');heading.className='weapon-group';heading.textContent=group.label;$('weapon-options').append(heading);
        for(const [index,w]of catalog.weapons[kind].entries()){
          $(kind+'-style').append(new Option(w.name,index));group.append(new Option(w.name,kind+':'+index));
          const button=document.createElement('button');button.type='button';button.dataset.weapon=kind+':'+index;button.setAttribute('aria-pressed','false');
          const icon=document.createElement('img');icon.src=base+w.icon;icon.alt='';
          const label=document.createElement('span');label.textContent=w.name;
          const damage=document.createElement('small');damage.textContent=number(w.baseDamage)+' damage';
          button.append(icon,label,damage);button.onclick=()=>{$('weapon-select').value=button.dataset.weapon;weaponCards();$('weapon-picker').open=false;$('weapon-picker').querySelector('summary').focus();};
          $('weapon-options').append(button);
        }
        $('weapon-select').append(group);
        $(kind+'-style').onchange=weaponCards;
      }
      $('weapon-select').disabled=false;$('weapon-select').onchange=weaponCards;
      for(const s of catalog.ships.filter(s=>combat.ships[s.id]))$('firing-ship').append(new Option(s.name,s.id));$('firing-ship').value=6;
      $('firing-ship').onchange=async()=>{const candidate=catalog.ships.find(s=>s.id===Number($('firing-ship').value));try{await loadImage(candidate.frames[0]);if(Number($('firing-ship').value)!==candidate.id)return;stopSequence();debrisImpacts.reset();shooter=candidate;weaponCards();}catch(e){$('firing-ship').value=shooter.id;explain(e.message);}};
      for(const w of combat.equipment){const row=document.createElement('div');row.className='equipment-item';const img=document.createElement('img');img.src=base+w.icon;img.alt=w.name;img.title=w.iconSharedWith?'Original Photon Torpedo icon, shared by this launcher':w.name;const text=document.createElement('span');text.textContent=`${w.name} · Base ${w.baseDamage} · · Recharge ${w.recharge} ticks${w.id===26?' · Radiation contacts: 10 to player, 100 to NPCs':w.id===27?' · No firing handler in the installed game':''}`;row.append(img,text);$('equipment-list').append(row);}
      weaponCards();
      $('disruptor-style').value=catalog.weapons.disruptor.findIndex(w=>w.name.toLowerCase().includes('disruptor'));$('torpedo-style').value=catalog.weapons.torpedo.findIndex(w=>w.id===15);weaponCards();$('ship-select').disabled=false;const requested=Number(new URLSearchParams(location.search).get('ship'));const first=catalog.ships.some(s=>s.id===requested)?requested:59;shipPicker.init(first);await selectShip(first);
    }catch(e){$('loading').textContent=e.message+' — reload the page to try again.';}
  })();
})();

