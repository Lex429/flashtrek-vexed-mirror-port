/* Downloaded gameplay cues. Simulation owners request sounds; painting never does. */
(() => {
  'use strict';
  const root='assets/game-sounds/',buffers=new Map(),voices=new Set(),last=new Map(),selections=new Map(),shuffleBags=new Map(),played={},recent=[],failed=[],buses={};
  const limits=Object.freeze({voices:12,ui:3,weapon:6,impact:4,explosion:6,transport:1,hearing:1100});
  let clips={},banks={},context=null,master=null,decoding=null,getState=()=>null,generation=0,asteroidExplosionIndex=0;
  let variationSeed=(Math.trunc(performance.now()*1000)^0x9e3779b9)>>>0;
  function audioRandom(){
    variationSeed^=variationSeed<<13;variationSeed^=variationSeed>>>17;variationSeed^=variationSeed<<5;
    return (variationSeed>>>0)/4294967296;
  }
  function phaserChoice(available){
    const signature=available.join('|');let bag=shuffleBags.get('phaser');
    if(!bag||bag.signature!==signature){bag={signature,remaining:[],history:[]};shuffleBags.set('phaser',bag);}
    if(!bag.remaining.length){
      bag.remaining=[...available];
      for(let i=bag.remaining.length-1;i>0;i--){
        const j=Math.floor(audioRandom()*(i+1));[bag.remaining[i],bag.remaining[j]]=[bag.remaining[j],bag.remaining[i]];
      }
    }
    const next=bag.remaining.findIndex(name=>!bag.history.includes(name));
    if(next>0)[bag.remaining[0],bag.remaining[next]]=[bag.remaining[next],bag.remaining[0]];
    return bag.remaining[0]||available[0];
  }
  const enabled=()=>window.nativeMenuSounds?.enabled!==false;
  const visible=()=>!document.hidden;
  const inGame=()=>!!getState()&&document.body.classList.contains('playing');
  const live=state=>state===getState()&&inGame()&&visible()&&!window.nativeSimulation?.blocked?.()&&!window.nativeOpeningCinematic?.active;
  const ready=fetch(root+'manifest.json').then(response=>{
    if(!response.ok)throw Error('Sound catalogue unavailable');return response.json();
  }).then(async catalogue=>{
    clips=catalogue.clips;banks=catalogue.banks||{};
    await Promise.all(Object.entries(clips).map(async([kind,clip])=>{
      try{
        const response=await fetch(root+clip.file);if(!response.ok)throw Error('Missing sound: '+clip.file);
        clip.encoded=await response.arrayBuffer();
      }catch(error){failed.push(kind);console.warn(error);}
    }));
  }).catch(error=>{failed.push('catalogue');console.warn(error);});

  function unlock(){
    if(!enabled())return;
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    if(!context){
      context=new Audio();master=context.createGain();master.gain.value=.7;
      const compressor=context.createDynamicsCompressor();compressor.threshold.value=-12;compressor.ratio.value=5;
      if(compressor.knee)compressor.knee.value=18;if(compressor.attack)compressor.attack.value=.003;if(compressor.release)compressor.release.value=.16;
      master.connect(compressor);compressor.connect(context.destination);
      for(const group of ['ui','weapon','impact','explosion','foregroundExplosion','transport']){buses[group]=context.createGain();buses[group].gain.value=1;buses[group].connect(master);}
    }
    if(context.state==='suspended')context.resume().catch(()=>{});
    decoding||=ready.then(()=>Promise.all(Object.entries(clips).map(async([kind,clip])=>{
      if(!clip.encoded)return;
      try{
        const buffer=await context.decodeAudioData(clip.encoded);delete clip.encoded;
        let peak=.001;
        for(let channel=0;channel<buffer.numberOfChannels;channel++){
          const values=buffer.getChannelData(channel);for(let i=0;i<values.length;i++)peak=Math.max(peak,Math.abs(values[i]));
        }
        buffers.set(kind,{buffer,peak});
      }catch(error){failed.push(kind);console.warn('Sound could not decode',kind,error);}
    })));
  }
  function disconnect(voice){
    if(voice.disconnected)return;voice.disconnected=true;
    voice.source.disconnect();voice.gain.disconnect();voice.pan?.disconnect();voice.filter?.disconnect();
  }
  function retire(voice,fade=0){
    if(!voices.delete(voice))return;
    if(fade>0&&context.state==='running'){
      const at=context.currentTime;voice.gain.gain.cancelScheduledValues?.(at);voice.gain.gain.setValueAtTime(voice.gain.gain.value,at);
      voice.gain.gain.linearRampToValueAtTime(0,at+fade);try{voice.source.stop(at+fade);}catch{disconnect(voice);}
    }else{try{voice.source.stop();}catch{}disconnect(voice);}
  }
  function stop(){generation++;for(const voice of [...voices])retire(voice);last.clear();}
  function stopWorld(){generation++;for(const voice of [...voices])if(voice.group!=='ui')retire(voice);}
  function duckExplosions(){
    const gain=buses.explosion?.gain;if(!gain)return;const at=context.currentTime;
    if(gain.cancelAndHoldAtTime)gain.cancelAndHoldAtTime(at);else{gain.cancelScheduledValues?.(at);gain.setValueAtTime(gain.value,at);}
    gain.linearRampToValueAtTime(.55,at+.012);gain.linearRampToValueAtTime(1,at+.48);
  }
  function play(kind,{profile=kind,group='ui',volume=1,pan=0,lowpass=20000,priority=3,cooldown=65,check=()=>true,eventId=null,rockId=null,shipId=null,simulationAt=null,phase=null,position=null}={}){
    if(!enabled()||!visible()||!context||!check())return false;
    const requested=performance.now(),key=group+':'+kind;
    if(requested-(last.get(key)??-Infinity)<cooldown||group==='ui'&&priority<5&&requested-(last.get('ui')??-Infinity)<55)return false;
    last.set(key,requested);if(group==='ui')last.set('ui',requested);
    const ticket=generation;
    const start=()=>{
      if(ticket!==generation||!enabled()||!visible()||!check()||context.state!=='running'||performance.now()-requested>180)return false;
      const available=(banks[profile]||[]).filter(name=>buffers.has(name)),cursor=selections.get(profile)||0;
      if(profile==='phaser'&&!available.length)return false;
      const selected=available.length?(profile==='phaser'?phaserChoice(available):available[cursor%available.length]):kind;
      const decoded=buffers.get(selected),clip=clips[selected];if(!decoded||!clip)return false;
      const members=[...voices].filter(voice=>voice.group===group);
      if(voices.size>=limits.voices||members.length>=(limits[group]||limits.voices)){
        const candidates=members.length>=(limits[group]||limits.voices)?members:[...voices];
        const oldest=candidates.filter(voice=>voice.priority<=priority).sort((a,b)=>a.priority-b.priority)[0];if(!oldest)return false;retire(oldest,.008);
      }
      const source=context.createBufferSource(),gain=context.createGain(),panner=context.createStereoPanner?.();
      source.buffer=decoded.buffer;
      const offset=clip.offset||0,duration=Math.min(clip.duration??Infinity,decoded.buffer.duration-offset);if(!(duration>0))return false;
      const variationGain=profile==='phaser'?.94+audioRandom()*.12:1;
      const fadeInMs=profile==='phaser'?4+audioRandom()*3:6,releaseMs=profile==='phaser'?35+audioRandom()*25:40;
      const filterHz=Math.min(lowpass,profile==='phaser'?3100+audioRandom()*1200:20000);
      const at=context.currentTime,level=Math.min(2.5,clip.peak/decoded.peak)*Math.max(0,Math.min(1,volume))*variationGain;
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+fadeInMs/1000);
      gain.gain.setValueAtTime(level,at+Math.max(fadeInMs/1000,duration-releaseMs/1000));gain.gain.linearRampToValueAtTime(0,at+duration);
      const filter=context.createBiquadFilter?.();
      if(filter){filter.type='lowpass';filter.frequency.value=Math.min(20000,Math.max(1500,filterHz));filter.Q.value=.5;source.connect(filter);filter.connect(gain);}else source.connect(gain);
      const bus=group==='explosion'&&priority>=4?'foregroundExplosion':group,output=buses[bus]||master;
      if(panner){panner.pan.value=Math.max(-.8,Math.min(.8,pan));gain.connect(panner);panner.connect(output);}else gain.connect(output);
      const voice={source,gain,pan:panner,filter,group,priority};voices.add(voice);
      source.onended=()=>{voices.delete(voice);disconnect(voice);};
      if(priority>=4&&(group==='weapon'||group==='impact'))duckExplosions();
      source.start(at,offset,duration);if(available.length){
        selections.set(profile,cursor+1);
        if(profile==='phaser'){const bag=shuffleBags.get('phaser');bag.remaining.shift();bag.history.push(selected);if(bag.history.length>3)bag.history.shift();}
      }
      played[kind]=(played[kind]||0)+1;recent.push({kind,profile,variant:selected,file:clip.file,group,bus,priority,volume,pan,lowpass,position,at:requested,eventId,rockId,shipId,simulationAt,phase,
        scheduledAt:at,duration,variationGain,fadeInMs,releaseMs,filterHz,attackMs:clip.metrics?.onsetMs??null,delayMs:performance.now()-requested});if(recent.length>32)recent.shift();
      return true;
    };
    if(buffers.has(kind)||banks[profile]?.some(name=>buffers.has(name)))return start();
    decoding?.then(start).catch(()=>{});return true;
  }
  function location(state,point,personal=false,foreground=false){
    if(!live(state)||(point.system??state.system)!==state.system)return null;
    if(personal)return {volume:1,pan:0,lowpass:20000,priority:4};
    const player=state.system===1?window.vexedSolFlight.shipPosition(state):state;
    const dx=point.x-player.x,dy=point.y-player.y,distance=Math.hypot(dx,dy);
    if(!Number.isFinite(distance)||!foreground&&distance>limits.hearing)return null;
    // The player's own resolved hit remains audible throughout weapon range.
    if(foreground)return {volume:Math.max(.35,.78/(1+distance/700)),pan:dx/700,lowpass:Math.max(3200,14000/(1+distance/1200)),priority:4};
    return {volume:.48*(1-distance/limits.hearing)**2,pan:dx/700,lowpass:Math.max(1800,18000*(1-distance/limits.hearing)),priority:1};
  }
  function weapon(state,event,source){
    const muzzle=event.projectile?event:event.from,point=Number.isFinite(muzzle?.x)&&Number.isFinite(muzzle?.y)?{...source,x:muzzle.x,y:muzzle.y}:source;
    const where=location(state,point,source.id==='player'||source.category==='player');if(!where)return false;
    const name=event.weapon?.name||'',kind=event.kind==='torpedo'?(/quantum|transphasic/i.test(name)?'quantum':'torpedo'):
      /disruptor/i.test(name)?'disruptor':/pulse|cannon|turrent|turret/i.test(name)?'pulse':/cutting|particle|laser/i.test(name)?'laser':'phaser';
    return play(kind,{...where,group:'weapon',cooldown:where.priority===4?0:110,check:()=>live(state),eventId:event.id,
      simulationAt:window.nativeSimulation?.seconds?.(state)??null,phase:'launch',position:{x:point.x??0,y:point.y??0}});
  }
  function impact(descriptor,result,event={}){
    if(!result?.ok||!(result.amount>0))return false;
    const state=descriptor.state,contact=result.contacts?.shield?.world||result.contacts?.hull?.world;
    const foreground=result.destroyed&&(event.sourceId==='player'||event.source==='player');
    const point=result.destroyed?descriptor:contact?{...descriptor,x:contact.x,y:contact.y}:descriptor,where=location(state,point,descriptor.category==='player',foreground);if(!where)return false;
    if(contact&&descriptor.category==='player')where.pan=Math.max(-.65,Math.min(.65,(contact.x-descriptor.x)/100));
    const info={...where,check:()=>live(state),eventId:event.weaponEventId??null,shipId:descriptor.id??descriptor.entity?.id??null,
      simulationAt:window.nativeSimulation?.seconds?.(state)??null,phase:result.destroyed?'destruction':'contact',position:{x:point.x??0,y:point.y??0}};
    const definition=descriptor.definition||{},torpedo=event.kind==='torpedo';
    const shieldCapacity=Math.max(1,Number(definition.ratedShields??definition.shields)||100),hullCapacity=Math.max(1,Number(definition.hull)||100);
    const broken=result.before?.shields>0&&result.shields<=0;
    const shieldProfile=broken?'shieldBreak':torpedo||result.absorbed/shieldCapacity>=.06?'shieldHeavy':'shieldLight';
    const hullProfile=torpedo?'hullTorpedo':result.hullDamage/hullCapacity>=.06?'hullHeavy':'hullLight';
    if(result.destroyed){
      if(result.hullDamage>0)play('hull',{...info,profile:torpedo?'hullTorpedo':'hullHeavy',group:'impact',volume:where.volume*.65,cooldown:70});
      const large=Math.max(descriptor.dimensions?.width||0,descriptor.dimensions?.height||0)>=100;
      return play(large?'shipExplosion':'shipExplosionAlt',{...info,group:'explosion',cooldown:0});
    }
    let accepted=false;
    if(result.absorbed>0&&!event.physicalContact)accepted=play('shield',{...info,profile:shieldProfile,group:'impact',cooldown:65});
    if(result.hullDamage>0||event.physicalContact||!(result.absorbed>0))accepted=play('hull',{...info,profile:hullProfile,group:'impact',cooldown:65})||accepted;
    return accepted;
  }
  function asteroidDestroyed(state,rock,event={}){
    event||={};
    const foreground=event.sourceId==='player'||event.source==='player',where=location(state,rock,false,foreground);if(!where)return false;
    const kind=asteroidExplosionIndex%2?'asteroidExplosionAlt':'asteroidExplosion';
    // The destruction owner already admits each rock once. A shared cooldown
    // would discard distinct rocks destroyed by the same volley.
    const accepted=play(kind,{...where,group:'explosion',cooldown:0,check:()=>live(state),eventId:event.weaponEventId??null,rockId:rock.slotId??null,
      simulationAt:window.nativeSimulation?.seconds?.(state)??null,phase:'destruction',position:{x:rock.x,y:rock.y}});
    if(accepted)asteroidExplosionIndex++;return accepted;
  }
  function asteroidHit(state,rock,event={}){
    // Mining wears down a rock continuously; ship contacts have their own cue.
    if(!event?.kind||event.kind==='mining'||event.physicalContact)return false;
    const where=location(state,rock);if(!where)return false;
    return play('asteroidHit',{...where,group:'impact',cooldown:450,check:()=>live(state)});
  }
  function shipAsteroidHit(state,ship,event){
    if(!(event?.energy>.02))return false;
    const where=location(state,ship,ship.category==='player');if(!where)return false;
    return play('shipAsteroidHit',{...where,volume:where.volume*(.3+.7*Math.min(1,event.energy)),group:'impact',cooldown:180,check:()=>live(state)});
  }
  function transport(state){
    if(!live(state)||[...voices].some(voice=>voice.group==='transport'))return false;
    return play('transport',{group:'transport',priority:5,cooldown:450,check:()=>live(state)});
  }
  const uiKinds={map:'navigation',navigation:'navigation',inventory:'inventory',scan:'scan',trade:'trade',comms:'comms',repair:'repair',save:'confirm',confirm:'confirm',close:'close',reject:'deny',pause:'click',click:'click'};
  function ui(action){return play(uiKinds[action]||'click');}
  function payment(state){
    return play('payment',{group:'ui',priority:5,cooldown:0,phase:'settlement',check:()=>state===getState()&&inGame()});
  }
  function buttonKind(button){
    const id=button.id||'',data=button.dataset,attributes=button.getAttributeNames().join(' ');
    if(data.close!==undefined||data.back!==undefined||data.resume!==undefined||button.matches('.inventory-close,.encounter-close,.comm-exit'))return 'close';
    if(/data-(?:buy|sell|trade|freight-(?:buy|sell)|purchase)/.test(attributes)||data.tab==='market'||data.hubTab==='market'||button.matches('.comm-trade,.comm-sell,.comm-resource'))return 'trade';
    if(data.save!==undefined||id==='save')return 'save';
    if(/scan|mine/i.test(id)||data.prospect!==undefined)return 'scan';
    if(/repair/i.test(id)||/data-(?:repair|refine)/.test(attributes)||button.classList.contains('comm-repair'))return 'repair';
    if(/data-(?:upgrade|cargo-load|cargo-deliver|contract|deliver)/.test(attributes))return 'confirm';
    if(/map|nav/i.test(id)||data.hubTab==='navigation'||data.tab==='navigation')return 'map';
    if(/comm|hail/i.test(id)||data.hail!==undefined)return 'comms';if(/inventory/i.test(id))return 'inventory';
    return 'click';
  }
  for(const type of ['pointerdown','keydown'])document.addEventListener(type,event=>{if(event.isTrusted)unlock();},{capture:true});
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button');
    if(!button||button.disabled||button.getAttribute('aria-disabled')==='true'||button.id==='menu-sound-toggle'||button.id==='pause-sound-toggle')return;
    if(!inGame()&&!button.closest('#pause-menu'))return;
    // These controls already emit a cue from their actual open/close owner.
    if(button.matches('#mapBtn,#inventoryBtn,#tradeBtn,#pauseBtn,.inventory-close,.map-close,[data-resume]'))return;
    // Equipment transfers retain their existing success/rejection feedback.
    if(button.closest('[data-equipment-action],[data-repair-device],[data-equipment-place]'))return;
    // Delivery feedback comes from the completed transaction, including failures.
    if(button.hasAttribute('data-cargo-deliver'))return;
    ui(buttonKind(button));
  });
  addEventListener('native-soundchange',event=>{if(event.detail.enabled){if(master)master.gain.value=.7;unlock();}else{stop();if(master)master.gain.value=0;}});
  addEventListener('native-pausechange',event=>{if(event.detail.paused)stopWorld();if(inGame())ui(event.detail.paused?'pause':'close');});
  addEventListener('native-inventorychange',event=>{if(event.detail.active)stopWorld();if(inGame())ui(event.detail.active?'inventory':'close');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.nativeGameSounds=Object.freeze({attach(state){getState=state;},ui,payment,weapon,impact,asteroidDestroyed,asteroidHit,shipAsteroidHit,transport,stop,
    ready:()=>decoding||ready,
    snapshot:()=>({enabled:enabled(),state:context?.state||'locked',decoded:[...buffers.keys()],banks:Object.fromEntries(Object.entries(banks).map(([name,entries])=>[name,entries.length])),failed:[...failed],played:{...played},active:voices.size,limits,recent:recent.map(item=>({...item}))})});
})();
