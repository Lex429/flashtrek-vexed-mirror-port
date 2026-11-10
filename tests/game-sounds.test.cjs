const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../html-games/broken-mirror-port');
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'assets/game-sounds/manifest.json')));

async function fixture({missingPhaserVariants=false}={}){
  let now=0,enabled=true,blocked=false;
  const listeners=new Map(),sources=[];
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){}});
  const node=()=>({connect(){},disconnect(){},gain:param(),pan:param()});
  class AudioContext{
    constructor(){this.state='running';this.currentTime=0;this.destination={};}
    createGain(){return node();}
    createDynamicsCompressor(){return {...node(),threshold:param(),ratio:param()};}
    createStereoPanner(){return node();}
    createBufferSource(){const source={...node(),start(...args){source.started=true;source.startArgs=args;},stop(){source.stopped=true;}};sources.push(source);return source;}
    async decodeAudioData(){return {duration:8,numberOfChannels:1,getChannelData:()=>new Float32Array([0,.5,-.5])};}
  }
  const add=(kind,fn)=>{if(!listeners.has(kind))listeners.set(kind,[]);listeners.get(kind).push(fn);};
  const document={hidden:false,body:{classList:{contains:()=>true}},addEventListener:add};
  const state={system:1,x:0,y:0,hull:100,shields:20};
  const window={AudioContext,nativeMenuSounds:{get enabled(){return enabled;}},nativeSimulation:{blocked:()=>blocked},vexedSolFlight:{shipPosition:state=>state}};
  const privateMath=Object.create(Math,{random:{value(){throw Error('Cosmetic audio must not use gameplay randomness');}}});
  const context=vm.createContext({window,document,Math:privateMath,console:missingPhaserVariants?{...console,warn(){}}:console,performance:{now:()=>now},addEventListener:add,
    fetch:async url=>({ok:!(missingPhaserVariants&&url.includes('generated/phaser-')),json:async()=>structuredClone(catalogue),arrayBuffer:async()=>new ArrayBuffer(4)})});
  vm.runInContext(fs.readFileSync(path.join(root,'game-sounds.js'),'utf8'),context);
  const api=window.nativeGameSounds;api.attach(()=>state);
  for(const fn of listeners.get('pointerdown'))fn({isTrusted:true});
  await api.ready();
  const event=(kind,detail)=>{for(const fn of listeners.get(kind)||[])fn({detail});};
  return {api,state,sources,document,tick:(ms=200)=>{now+=ms;},block:value=>{blocked=value;},mute(value){enabled=!value;event('native-soundchange',{enabled});},event};
}

test('imported originals match their hashes and complete gameplay recordings retain their full duration',()=>{
  assert.equal(Object.keys(catalogue.clips).length,66);
  const full=new Set(['phaser','transport','asteroidHit','asteroidExplosion','asteroidExplosionAlt','shipAsteroidHit','shipExplosion','shipExplosionAlt']);
  for(const [kind,clip] of Object.entries(catalogue.clips)){
    const bytes=fs.readFileSync(path.join(root,'assets/game-sounds',clip.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),clip.sha256);
    if(full.has(kind)||clip.generator)assert.equal(clip.duration,null);
    else assert.ok(clip.duration>0&&clip.duration<=2.1);
    if(clip.generator){
      assert.ok(clip.metrics.onsetMs<=10);assert.ok(clip.metrics.peak<.95);
      for(const original of clip.derivedFrom)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/game-sounds',original.file))).digest('hex'),original.sha256);
    }
  }
});
test('private audio banks vary accepted shots while keeping NPC cooldowns shared across variants',async()=>{
  const f=await fixture(),shot={id:1,kind:'beam',weapon:{name:'Type X Phaser'}};
  const size=catalogue.banks.phaser.length,count=size*2+2;
  for(let i=0;i<count;i++)assert.equal(f.api.weapon(f.state,{...shot,id:i},{id:'player',system:1}),true);
  const recent=f.api.snapshot().recent,chosen=recent.map(item=>item.variant);
  assert.ok(chosen.every(name=>/^phaserVariant/.test(name)));
  assert.equal(new Set(chosen.slice(0,size)).size,size);
  assert.equal(new Set(chosen.slice(size,size*2)).size,size);
  assert.ok(chosen.every((name,i)=>!chosen.slice(Math.max(0,i-3),i).includes(name)));
  assert.notEqual(chosen.slice(0,size).join(','),chosen.slice(size,size*2).join(','));
  assert.ok(recent.every(item=>item.variationGain>=.94&&item.variationGain<=1.06&&item.fadeInMs>=4&&item.fadeInMs<=7&&item.releaseMs>=35&&item.releaseMs<=60));
  const repeat=recent.find((item,i)=>i>0&&item.variant===recent[0].variant);
  assert.ok(repeat);assert.notEqual(repeat.variationGain,recent[0].variationGain);assert.notEqual(repeat.fadeInMs,recent[0].fadeInMs);
  for(const source of f.sources)source.onended();
  f.tick();assert.equal(f.api.weapon(f.state,shot,{id:2,system:1,x:100,y:0}),true);
  assert.equal(f.api.weapon(f.state,shot,{id:2,system:1,x:100,y:0}),false);
  assert.equal(f.api.snapshot().played.phaser,count+1);
});
test('smooth ship beams retain recorded pitch and a complete release while keeping the original archived',()=>{
  assert.ok(!catalogue.banks.phaser.includes('phaser'));assert.equal(catalogue.banks.phaser.length,12);
  assert.equal(catalogue.clips.phaser.duration,null);assert.ok(catalogue.clips.phaser.offset<.03);
  for(const name of catalogue.banks.phaser){
    const clip=catalogue.clips[name];assert.ok(clip.metrics.durationSeconds>=.40&&clip.metrics.durationSeconds<=.65);
    assert.equal(clip.recipe.character,'smooth-tos-ship-beam');assert.equal(clip.recipe.pitch,1);
    assert.ok(clip.recipe.releaseMs>=40&&clip.recipe.releaseMs<=75);assert.ok(clip.peak<=.12);
    assert.ok(clip.derivedFrom.every(parent=>parent.file===catalogue.clips.laser.file));
  }
  assert.equal(catalogue.clips.phaserVariant1.sha256,'231a22e87a630587daba7e08448533e40dc619a82d5b985849ad9664469035cc');
  assert.ok(new Set(catalogue.banks.phaser.map(name=>catalogue.clips[name].recipe.recordedEntryMs)).size>=10);
});
test('unavailable variations never fall back to playing the archived original',async()=>{
  const f=await fixture({missingPhaserVariants:true});
  assert.ok(f.api.snapshot().decoded.includes('phaser'));
  assert.equal(f.api.weapon(f.state,{kind:'beam',weapon:{name:'Phaser'}},{id:'player',system:1}),false);
  assert.equal(f.sources.length,0);
});
test('shield strength, collapse and hull overflow select distinct banks for one real contact',async()=>{
  const f=await fixture(),descriptor={state:f.state,category:'player',system:1,x:0,y:0,definition:{shields:100,hull:100}};
  f.api.impact(descriptor,{ok:true,amount:2,absorbed:2,hullDamage:0,before:{shields:100},shields:98},{weaponEventId:10});f.tick();
  f.api.impact(descriptor,{ok:true,amount:18,absorbed:18,hullDamage:0,before:{shields:100},shields:82},{weaponEventId:11});f.tick();
  f.api.impact(descriptor,{ok:true,amount:14,absorbed:10,hullDamage:4,before:{shields:10},shields:0,contacts:{shield:{world:{x:-30,y:0}},hull:{world:{x:-20,y:0}}}},{weaponEventId:12});f.tick();
  f.api.impact(descriptor,{ok:true,amount:15,absorbed:0,hullDamage:15,before:{shields:0},shields:0},{kind:'torpedo',weaponEventId:13});
  const recent=JSON.parse(JSON.stringify(f.api.snapshot().recent));
  assert.deepEqual(recent.filter(item=>item.kind==='shield').map(item=>item.profile),['shieldLight','shieldHeavy','shieldBreak']);
  assert.deepEqual(recent.filter(item=>item.eventId===12).map(item=>item.kind),['shield','hull']);
  assert.ok(recent.find(item=>item.eventId===12).pan<0);
  assert.equal(recent.at(-1).profile,'hullTorpedo');
});
test('weapon classes select different cues without modifying the simulation state',async()=>{
  const f=await fixture(),before=JSON.stringify(f.state);
  for(const [kind,name,sound] of [['beam','Type X Phaser','phaser'],['beam','Particle Beam','laser'],['disruptor','Disruptor Cannon','disruptor'],['disruptor','Dual Pulse Phasers','pulse'],['torpedo','Photon Torpedo','torpedo'],['torpedo','Quantum Torpedo','quantum']]){
    assert.equal(f.api.weapon(f.state,{kind,weapon:{name}},{id:'player',system:1}),true);f.tick();
    assert.equal(f.api.snapshot().played[sound],1);
  }
  assert.equal(JSON.stringify(f.state),before);
});
test('distant, foreign-system, inactive and paused combat is silent',async()=>{
  const f=await fixture(),shot={kind:'beam',weapon:{name:'Phaser'}};
  assert.equal(f.api.weapon(f.state,shot,{id:2,system:1,x:2000,y:0}),false);
  assert.equal(f.api.weapon(f.state,shot,{id:2,system:2,x:0,y:0}),false);
  assert.equal(f.api.weapon({...f.state},shot,{id:'player',system:1}),false);
  f.block(true);assert.equal(f.api.weapon(f.state,shot,{id:'player',system:1}),false);
  assert.equal(f.sources.length,0);
});
test('only applied damage plays impacts and physical contact uses hull feedback',async()=>{
  const f=await fixture(),descriptor={state:f.state,category:'player',system:1};
  assert.equal(f.api.impact(descriptor,{ok:true,amount:0}),false);
  f.api.impact(descriptor,{ok:true,amount:2,absorbed:2});f.tick();
  f.api.impact(descriptor,{ok:true,amount:2,absorbed:0,hullDamage:2});f.tick();
  f.api.impact(descriptor,{ok:true,amount:2,absorbed:2},{physicalContact:true});
  assert.equal(f.api.snapshot().played.shield,1);assert.equal(f.api.snapshot().played.hull,2);
});
test('destroyed small and large ships use the two downloaded explosion recordings',async()=>{
  const f=await fixture(),descriptor={state:f.state,category:'player',system:1},before=JSON.stringify(f.state);
  f.api.impact({...descriptor,dimensions:{width:30,height:60}},{ok:true,amount:100,destroyed:true});f.tick();
  f.api.impact({...descriptor,dimensions:{width:100,height:160}},{ok:true,amount:100,destroyed:true});
  assert.equal(f.api.snapshot().played.shipExplosionAlt,1);assert.equal(f.api.snapshot().played.shipExplosion,1);
  assert.ok(f.sources.every(source=>source.startArgs[2]===8));assert.equal(JSON.stringify(f.state),before);
});
test('simultaneous small and large ship kills each start their own foreground explosion',async()=>{
  const f=await fixture();
  for(let i=0;i<6;i++){
    const descriptor={id:500+i,state:f.state,category:'civilian',system:1,x:220+i*10,y:0,dimensions:{width:50,height:i<3?60:160}};
    assert.equal(f.api.impact(descriptor,{ok:true,amount:1,destroyed:true},{source:'player',sourceId:'player',weaponEventId:900+i}),true);
  }
  const sounds=f.api.snapshot().recent;
  assert.equal(sounds.length,6);assert.equal(new Set(sounds.map(sound=>sound.shipId)).size,6);
  assert.equal(f.api.snapshot().played.shipExplosionAlt,3);assert.equal(f.api.snapshot().played.shipExplosion,3);
  assert.ok(sounds.every(sound=>sound.phase==='destruction'&&sound.bus==='foregroundExplosion'&&sound.priority===4));
  assert.ok(f.sources.every(source=>!source.stopped));
});
test('ships destroyed by player weapons remain audible at range while distant background deaths stay silent',async()=>{
  const f=await fixture(),descriptor={id:600,state:f.state,category:'civilian',system:1,x:1500,y:0,dimensions:{width:50,height:80}},result={ok:true,amount:1,destroyed:true};
  assert.equal(f.api.impact(descriptor,result,{sourceId:9}),false);
  assert.equal(f.api.impact(descriptor,result,{sourceId:'player',weaponEventId:55}),true);
  const sound=f.api.snapshot().recent.at(-1);
  assert.ok(sound.volume>=.3);assert.equal(sound.shipId,600);assert.equal(sound.eventId,55);assert.equal(sound.position.x,1500);
  assert.equal(f.api.impact({...descriptor,system:2},result,{sourceId:'player'}),false);
});
test('ship kill explosions enter a busy mix without stopping transport or the player firing voices',async()=>{
  const f=await fixture();f.api.transport(f.state);
  for(let i=0;i<6;i++)f.api.weapon(f.state,{kind:'beam',weapon:{name:'Phaser'}},{id:'player',system:1});
  for(let i=0;i<4;i++){f.tick();f.api.impact({state:f.state,category:'player',system:1},{ok:true,amount:1,absorbed:1});}
  f.api.ui('map');assert.equal(f.api.snapshot().active,12);
  assert.equal(f.api.impact({id:700,state:f.state,category:'civilian',system:1,x:200,y:0},{ok:true,amount:1,destroyed:true},{sourceId:'player'}),true);
  assert.ok(f.sources.slice(0,7).every(source=>!source.stopped));assert.equal(f.api.snapshot().active,12);
});
test('asteroid explosions alternate locally without waking distant or inactive audio',async()=>{
  const f=await fixture(),rock={system:1,x:100,y:0};
  assert.equal(f.api.asteroidDestroyed(f.state,{...rock,x:10000}),false);
  f.api.asteroidDestroyed(f.state,rock);f.tick();f.api.asteroidDestroyed(f.state,rock);
  assert.equal(f.api.snapshot().played.asteroidExplosion,1);assert.equal(f.api.snapshot().played.asteroidExplosionAlt,1);
  f.mute(true);f.tick();assert.equal(f.api.asteroidDestroyed(f.state,rock),false);assert.equal(f.api.snapshot().active,0);
});
test('six simultaneous player asteroid destructions each start a positional explosion',async()=>{
  const f=await fixture();
  for(let i=0;i<6;i++){
    assert.equal(f.api.asteroidDestroyed(f.state,{slotId:100+i,system:1,x:200+i*20,y:0},{source:'player',sourceId:'player',weaponEventId:10+i}),true);
  }
  const sounds=f.api.snapshot().recent;
  assert.equal(sounds.length,6);assert.equal(new Set(sounds.map(sound=>sound.rockId)).size,6);
  assert.equal(f.api.snapshot().played.asteroidExplosion,3);assert.equal(f.api.snapshot().played.asteroidExplosionAlt,3);
  assert.ok(sounds.every(sound=>sound.phase==='destruction'&&sound.bus==='foregroundExplosion'&&sound.priority===4&&sound.pan>0));
  assert.ok(f.sources.every(source=>!source.stopped));assert.equal(f.api.snapshot().active,6);
});
test('player asteroid kills remain audible at weapon range while distant background destruction stays silent',async()=>{
  const f=await fixture(),rock={slotId:200,system:1,x:1500,y:0},impact={sourceId:'player',weaponEventId:88};
  assert.equal(f.api.asteroidDestroyed(f.state,rock),false);
  assert.equal(f.api.asteroidDestroyed(f.state,rock,impact),true);
  const sound=f.api.snapshot().recent.at(-1);
  assert.ok(sound.volume>=.3);assert.equal(sound.eventId,88);assert.equal(sound.rockId,200);assert.equal(sound.position.x,1500);
  assert.equal(f.api.asteroidDestroyed(f.state,{...rock,system:2},impact),false);
  f.block(true);assert.equal(f.api.asteroidDestroyed(f.state,rock,impact),false);
});
test('player asteroid explosions replace lower priority audio in a busy mix and preserve transport and firing',async()=>{
  const f=await fixture();assert.equal(f.api.transport(f.state),true);
  for(let i=0;i<6;i++)assert.equal(f.api.weapon(f.state,{kind:'beam',weapon:{name:'Phaser'}},{id:'player',system:1}),true);
  const descriptor={state:f.state,category:'player',system:1};
  for(let i=0;i<4;i++){f.tick();f.api.impact(descriptor,{ok:true,amount:1,absorbed:1});}
  assert.equal(f.api.ui('map'),true);assert.equal(f.api.snapshot().active,12);
  assert.equal(f.api.asteroidDestroyed(f.state,{slotId:300,system:1,x:100,y:0},{sourceId:'player'}),true);
  assert.ok(f.sources.slice(0,7).every(source=>!source.stopped));
  assert.equal(f.api.snapshot().recent.at(-1).priority,4);assert.equal(f.api.snapshot().active,12);
});
test('rock impacts, ship collisions and continuous mining have distinct audio admission',async()=>{
  const f=await fixture(),rock={system:1,x:100,y:0},ship={category:'player',system:1};
  assert.equal(f.api.asteroidHit(f.state,rock),false);
  assert.equal(f.api.asteroidHit(f.state,rock,{kind:'mining'}),false);
  assert.equal(f.api.asteroidHit(f.state,rock,{kind:'asteroid',physicalContact:true}),false);
  assert.equal(f.api.shipAsteroidHit(f.state,ship,{energy:0}),false);
  assert.equal(f.api.asteroidHit(f.state,rock,{kind:'debris'}),true);
  assert.equal(f.api.shipAsteroidHit(f.state,ship,{energy:.5}),true);
  assert.equal(f.api.snapshot().played.asteroidHit,1);assert.equal(f.api.snapshot().played.shipAsteroidHit,1);
});
test('voice limits reserve active player transport against a busy fleet and mute stops all sources',async()=>{
  const f=await fixture();f.api.transport(f.state);
  for(let i=0;i<30;i++){f.tick();f.api.weapon(f.state,{kind:'beam',weapon:{name:'Phaser'}},{id:i,system:1,x:20,y:0});}
  assert.ok(f.api.snapshot().active<=7);assert.equal(f.sources[0].stopped,undefined);
  f.mute(true);assert.equal(f.api.snapshot().active,0);assert.ok(f.sources.every(source=>source.stopped));
  const count=f.sources.length;f.tick();assert.equal(f.api.transport(f.state),false);assert.equal(f.api.ui('map'),false);assert.equal(f.sources.length,count);
});
test('one ore batch produces one cue and hidden tabs cancel ongoing playback',async()=>{
  const f=await fixture();assert.equal(f.api.transport(f.state),true);assert.equal(f.api.transport(f.state),false);
  assert.deepEqual(f.sources[0].startArgs,[0,0,8]);
  f.tick(700);assert.equal(f.api.transport(f.state),false);assert.equal(f.sources[0].stopped,undefined);
  assert.equal(f.api.snapshot().played.transport,1);f.document.hidden=true;f.event('visibilitychange');
  assert.equal(f.api.snapshot().active,0);f.tick();assert.equal(f.api.transport(f.state),false);
});

test('cargo payment plays its complete receipt cue over recent clicks while planet services block flight',async()=>{
  const f=await fixture(),before=JSON.stringify(f.state);
  assert.equal(f.api.ui('click'),true);
  f.block(true);
  assert.equal(f.api.payment(f.state),true);
  const sound=f.api.snapshot().recent.at(-1);
  assert.equal(sound.kind,'payment');assert.equal(sound.phase,'settlement');
  assert.equal(sound.group,'ui');assert.equal(sound.priority,5);
  assert.equal(sound.file,'generated/cargo-payment.mp3');
  assert.deepEqual(f.sources.at(-1).startArgs,[0,0,8]);
  assert.equal(JSON.stringify(f.state),before);
});

test('cargo receipt audio obeys mute, hidden tabs and current game ownership',async()=>{
  const f=await fixture();
  assert.equal(f.api.payment({...f.state}),false);
  assert.equal(f.api.payment(f.state),true);
  f.mute(true);assert.equal(f.api.snapshot().active,0);
  assert.equal(f.api.payment(f.state),false);
  f.mute(false);f.document.hidden=true;
  assert.equal(f.api.payment(f.state),false);
  assert.equal(f.api.snapshot().played.payment,1);
});
