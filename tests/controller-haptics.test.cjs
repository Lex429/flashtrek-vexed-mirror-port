const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/controller-haptics.js','utf8'),{window});
const api=window.nativeControllerHaptics;
function fixture(){
  let time=0,live=true;const state={hull:100,shields:100},calls=[],resets=[],settings=new Map();
  const descriptor={entity:state,state,category:'player',definition:{hull:100,shields:100},dimensions:{width:80,height:120},radii:{rx:40,ry:60}};
  const actuator={effects:['dual-rumble'],playEffect(type,params){calls.push({type,params});return Promise.resolve('complete');},reset(){resets.push(true);return Promise.resolve('complete');}};
  const device={id:'DualSense',index:1,connected:true,vibrationActuator:actuator};
  const haptics=api.create({now:()=>time,storage:{getItem:key=>settings.get(key),setItem:(key,value)=>settings.set(key,value)}});
  haptics.attach({getState:()=>state,allowed:()=>live,testAllowed:()=>true});haptics.setDevice(device);
  const result=(local={x:-40,y:0},hull=false,amount=10)=>({ok:true,amount,absorbed:hull?0:amount,hullDamage:hull?amount:0,contacts:{[hull?'hull':'shield']:{local,radii:{rx:40,ry:60}}}});
  return {haptics,device,actuator,state,descriptor,result,calls,resets,settings,at:value=>{time=value;},live:value=>{live=value;}};
}
test('port and starboard contacts favor opposite motor mixes in ship coordinates at every heading',()=>{
  const f=fixture();for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    f.descriptor.heading=heading;
    const left=api.damageEffect(f.descriptor,f.result({x:-40,y:0})),right=api.damageEffect(f.descriptor,f.result({x:40,y:0}));
    assert.equal(left.zone,'port');assert.equal(right.zone,'starboard');assert.ok(left.strongMagnitude>left.weakMagnitude*3);assert.ok(right.weakMagnitude>right.strongMagnitude*3);
    assert.equal(left.strongMagnitude,right.weakMagnitude);
  }
});
test('bow/stern hits have distinct pulse lengths and actual hull damage produces stronger feedback',()=>{
  const f=fixture(),bow=api.damageEffect(f.descriptor,f.result({x:0,y:-60})),stern=api.damageEffect(f.descriptor,f.result({x:0,y:60})),hull=api.damageEffect(f.descriptor,f.result({x:0,y:-60},true));
  assert.equal(bow.zone,'bow');assert.equal(stern.zone,'stern');assert.ok(stern.duration>bow.duration);assert.ok(hull.duration>bow.duration);assert.ok(hull.strongMagnitude>bow.strongMagnitude);
  assert.equal(bow.strongMagnitude,bow.weakMagnitude);
});
test('shield overflow uses the authoritative hull contact and rumble magnitudes/duration remain bounded',()=>{
  const f=fixture(),result=f.result({x:40,y:0},true,10000);result.contacts.shield={local:{x:-40,y:0}};
  const effect=api.damageEffect(f.descriptor,result);assert.equal(effect.zone,'starboard');
  assert.ok(effect.duration>=50&&effect.duration<=240);assert.ok(effect.strongMagnitude>=0&&effect.strongMagnitude<=1);assert.ok(effect.weakMagnitude>=0&&effect.weakMagnitude<=1);
});
test('no damage, visual effects and NPC damage never vibrate or alter authoritative state',()=>{
  const f=fixture(),before=JSON.stringify(f.state);
  assert.equal(f.haptics.impact(f.descriptor,{...f.result(),amount:0}),false);
  assert.equal(f.haptics.impact(f.descriptor,f.result(),{visualOnly:true}),false);
  assert.equal(f.haptics.impact({...f.descriptor,category:'civilian'},f.result()),false);
  assert.equal(f.haptics.impact({...f.descriptor,entity:{}},f.result()),false);
  f.haptics.step(f.device);assert.equal(f.calls.length,0);assert.equal(JSON.stringify(f.state),before);
});
test('simultaneous hits merge into one request and sustained damage is rate limited without catch-up bursts',()=>{
  const f=fixture();f.haptics.impact(f.descriptor,f.result({x:-40,y:0}));f.haptics.impact(f.descriptor,f.result({x:40,y:0}));
  f.haptics.step(f.device);assert.equal(f.calls.length,1);assert.equal(f.calls[0].params.strongMagnitude,f.calls[0].params.weakMagnitude);
  for(let i=0;i<80;i++){f.at(i);f.haptics.impact(f.descriptor,f.result());f.haptics.step(f.device);}
  assert.equal(f.calls.length,1);f.at(90);f.haptics.step(f.device);assert.equal(f.calls.length,2);
  f.at(100);f.haptics.impact(f.descriptor,f.result());f.at(10000);f.haptics.step(f.device);assert.equal(f.calls.length,2,'stale queued impacts are discarded');
});
test('pause/focus gates, disabling vibration and disconnect cancel playback and discard queued hits',()=>{
  for(const gate of ['pause','off','disconnect']){
    const f=fixture();f.haptics.impact(f.descriptor,f.result());f.haptics.step(f.device);
    if(gate==='pause'){f.live(false);f.haptics.step(f.device);}else if(gate==='off')f.haptics.setEnabled(false);else f.haptics.step(null);
    assert.equal(f.resets.length,1,gate);f.at(300);f.live(true);f.haptics.step(f.device);assert.equal(f.calls.length,1);
  }
});
test('a fatal hit requests vibration immediately so a slow destruction frame cannot discard it as stale',()=>{
  const f=fixture();f.haptics.impact(f.descriptor,{...f.result(),destroyed:true});
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].params.duration,240);assert.ok(f.calls[0].params.strongMagnitude>=.8);assert.equal(f.haptics.inspect().last.fatal,true);
  f.at(1500);f.haptics.step(f.device);assert.equal(f.calls.length,1);
});
test('explicit test vibration can finish in paused Options and the on/off preference persists separately',async()=>{
  const f=fixture();let complete;f.actuator.playEffect=(type,params)=>{f.calls.push({type,params});return new Promise(resolve=>{complete=resolve;});};
  f.live(false);const pending=f.haptics.test();f.haptics.step(f.device);assert.equal(f.resets.length,0);assert.equal(f.calls[0].params.duration,220);
  complete('complete');assert.equal(await pending,true);
  f.haptics.setEnabled(false);assert.equal(f.settings.get('vexed-controller-damage-vibration'),'off');assert.equal(await f.haptics.test(),false);
});
test('unsupported and legacy single-channel devices degrade gracefully',async()=>{
  const f=fixture();f.haptics.setDevice({...f.device,vibrationActuator:null});assert.equal(f.haptics.inspect().supported,false);assert.equal(await f.haptics.test(),false);
  const pulse=[];f.haptics.setDevice({...f.device,vibrationActuator:null,hapticActuators:[{pulse:(level,duration)=>{pulse.push({level,duration});return Promise.resolve(true);}}]});
  assert.equal(f.haptics.inspect().singleChannel,true);assert.equal(await f.haptics.test(),true);assert.equal(pulse.length,1);
});
test('API failures are caught and old rejected promises cannot disable a newly selected controller',async()=>{
  const f=fixture();f.actuator.playEffect=()=>Promise.reject(Error('Not available'));f.haptics.impact(f.descriptor,f.result());f.haptics.step(f.device);await new Promise(setImmediate);
  assert.equal(f.haptics.inspect().status,'error');assert.equal(f.haptics.impact(f.descriptor,f.result()),false);
  f.haptics.setDevice({...f.device,id:'Replacement',vibrationActuator:{effects:['dual-rumble'],playEffect:()=>Promise.resolve('complete')}});
  assert.equal(f.haptics.inspect().status,'ready');assert.equal(await f.haptics.test(),true);
  const old=fixture();let reject;old.actuator.playEffect=()=>new Promise((_resolve,fail)=>{reject=fail;});old.haptics.impact(old.descriptor,old.result());old.haptics.step(old.device);
  old.haptics.setDevice({...old.device,id:'New pad',vibrationActuator:{effects:['dual-rumble'],playEffect:()=>Promise.resolve('complete')}});reject(Error('Old device disconnected'));await new Promise(setImmediate);
  assert.equal(old.haptics.inspect().status,'ready');
});
