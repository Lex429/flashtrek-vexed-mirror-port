const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function fixture(){
  const window={};
  for(const file of ['gamepad-controls.js','player-combat-controls.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',file),'utf8'),{window});
  const pad={id:'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',index:1,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({value:0,pressed:false}))};
  let pads=[null,pad],throws=false;
  const input=window.nativeGamepadControls.create({read:()=>{if(throws)throw Error('Blocked');return pads;}});
  input.poll(0);
  return {pad,input,window,pads:value=>{pads=value;},fail:()=>{throws=true;}};
}
test('prefers the standard DualSense over an Xbox and tolerates empty gamepad slots',()=>{
  const f=fixture();f.pads([{...f.pad,id:'Xbox',index:0},null,f.pad]);
  const s=f.input.poll(1);assert.equal(s.index,1);assert.equal(s.label,'DualSense');assert.equal(s.supported,true);
});
test('radial dead zone removes drift and partial sticks request a heading with proportional thrust',()=>{
  const f=fixture(),controls=f.window.nativePlayerCombatControls.flightControls();
  f.pad.axes=[.08,-.1];let s=f.input.poll(1);assert.equal(s.flight,null);
  f.pad.axes=[.59,0];s=f.input.poll(2);
  const command=f.window.nativeGamepadControls.flightCommand(s,{angle:0});
  assert.equal(command.heading,0);assert.equal(command.turn,0);assert.ok(Math.abs(command.throttle-.5)<1e-12);
  f.pad.axes=[.59,-.59];s=f.input.poll(3);
  assert.ok(Math.abs(f.window.nativeGamepadControls.flightCommand(s,{angle:0}).heading+Math.PI/4)<1e-12);
  const keyboard=controls.command({speed:0},code=>code==='KeyD'||code==='ArrowUp');
  assert.equal(keyboard.turn,1);assert.equal(keyboard.throttle,1);
});
test('D-pad follows the exact keyboard trajectory through thrust, turns, drift, braking and fresh-press reverse',()=>{
  const f=fixture();vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/ship-motion.js'),'utf8'),{window:f.window});
  const a={x:0,y:0,angle:0,speed:0,vx:0,vy:0},b={...a},controlsA=f.window.nativePlayerCombatControls.flightControls(),controlsB=f.window.nativePlayerCombatControls.flightControls();
  const profile={vectorFlight:true,maxSpeed:160,acceleration:80,braking:100,turnRate:1.5,lateralAcceleration:80},codes={12:'ArrowUp',13:'ArrowDown',14:'ArrowLeft',15:'ArrowRight',4:'KeyX'};
  let at=0,reversed=false,stopped=false;
  for(const [buttons,frames] of [[[12],60],[[12,15],30],[[14],20],[[13],4],[[],10],[[13],100],[[],3],[[13],45],[[],10],[[4],100],[[],4],[[12,14],30]]){
    for(const button of f.pad.buttons)button.value=0;for(const index of buttons)f.pad.buttons[index].value=1;
    const keyboard=new Set(buttons.map(index=>codes[index]));
    for(let i=0;i<frames;i++){
      const snapshot=f.input.poll(at+=1000/60),ca=controlsA.command(a,code=>snapshot.keys[code]),cb=controlsB.command(b,code=>keyboard.has(code));
      assert.deepEqual(JSON.parse(JSON.stringify(ca)),JSON.parse(JSON.stringify(cb)));
      f.window.nativeShipMotion.step(a,ca,profile,1/60);f.window.nativeShipMotion.step(b,cb,profile,1/60);
      assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));reversed||=!!ca.reverse;stopped||=ca.brake&&a.speed===0;
    }
  }
  assert.equal(reversed,true);assert.equal(stopped,true);
});
test('direction requests use the shared bounded turn, coast and brake integration',()=>{
  const f=fixture();vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/ship-motion.js'),'utf8'),{window:f.window});
  const motion=f.window.nativeShipMotion,profile={vectorFlight:true,maxSpeed:160,acceleration:80,braking:100,turnRate:1.5,lateralAcceleration:80};
  const ship={x:0,y:0,angle:Math.PI,speed:0,vx:0,vy:0};f.pad.axes=[1,0];
  const input=f.input.poll(1),initial=f.window.nativeGamepadControls.flightCommand(input,ship);
  assert.equal(initial.throttle,0,'a ship facing away turns before accelerating toward the requested heading');
  motion.step(ship,initial,profile,1/60);assert.ok(Math.abs(Math.abs(ship.angle)-Math.PI)<1.5/60+1e-10);
  for(let i=0;i<240;i++)motion.step(ship,f.window.nativeGamepadControls.flightCommand(input,ship),profile,1/60);
  assert.ok(Math.abs(ship.angle)<.01);assert.ok(ship.vx>100);
  f.pad.axes=[0,0];assert.equal(f.window.nativeGamepadControls.flightCommand(f.input.poll(2),ship),null);
  const velocity=ship.vx;motion.step(ship,{manualFlight:true,throttle:0,turn:0},profile,.1);assert.equal(ship.vx,velocity);
  f.pad.buttons[4].value=1;const brake=f.window.nativeGamepadControls.flightCommand(f.input.poll(3),ship);
  assert.equal(brake.brake,true);assert.equal(brake.throttle,0);
  for(let i=0;i<120;i++)motion.step(ship,brake,profile,1/60);
  assert.equal(ship.speed,0);assert.equal(ship.vx,0);assert.equal(ship.vy,0);
});
test('touchpad and Create presses are distinct edges, with controller labels taken from device identity',()=>{
  const f=fixture();f.pad.buttons[17].value=1;let s=f.input.poll(1);
  assert.equal(s.playstation,true);assert.deepEqual(Array.from(s.pressed),[17]);
  assert.equal(f.input.poll(2).pressed.length,0);
  f.pad.buttons[17].value=0;f.pad.buttons[8].value=1;
  assert.deepEqual(Array.from(f.input.poll(3).pressed),[8]);
  f.pad.id='Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
  assert.equal(f.input.poll(4).label,'DualShock');
});
test('trigger edges use hysteresis and never repeat while held',()=>{
  const f=fixture();f.pad.buttons[6].value=.7;
  assert.deepEqual(Array.from(f.input.poll(10).pressed),[6]);
  f.pad.buttons[6].value=.5;assert.equal(f.input.poll(20).pressed.length,0);
  f.pad.buttons[6].value=.8;assert.equal(f.input.poll(30).pressed.length,0);
  f.pad.buttons[6].value=.3;assert.deepEqual(Array.from(f.input.poll(40).released),[6]);
  f.pad.buttons[6].value=.9;assert.deepEqual(Array.from(f.input.poll(50).pressed),[6]);
});
test('pause/focus resets consume held fire and require centered sticks before flight resumes',()=>{
  const f=fixture();f.pad.buttons[7].value=1;f.pad.axes=[1,-1];f.input.poll(10);f.input.reset();
  assert.equal(f.input.snapshot.flight,null);
  let s=f.input.poll(20);assert.equal(s.pressed.length,0);assert.equal(s.held[7],false);assert.equal(s.flight,null);
  f.input.poll(30,false);s=f.input.poll(40,true);assert.equal(s.held[7],false);assert.equal(s.flight,null);
  f.pad.buttons[7].value=0;f.pad.axes=[0,0];f.input.poll(50);
  f.pad.buttons[7].value=1;f.pad.axes=[0,-1];s=f.input.poll(60);
  assert.deepEqual(Array.from(s.pressed),[7]);assert.equal(s.flight.strength,1);assert.equal(s.flight.y,-1);
});
test('connecting/reconnecting with held triggers never starts fire',()=>{
  const f=fixture();f.pads([]);assert.equal(f.input.poll(10).connected,false);
  f.pad.buttons[7].value=1;f.pads([f.pad]);let s=f.input.poll(20);
  assert.equal(s.changed,true);assert.equal(s.held[7],false);assert.equal(s.pressed.length,0);
  f.pad.buttons[7].value=0;f.input.poll(30);f.pad.buttons[7].value=1;
  assert.deepEqual(Array.from(f.input.poll(40).pressed),[7]);
});
test('D-pad menu repeat has an initial delay and a bounded repeat after a slow frame',()=>{
  const f=fixture();f.pad.buttons[13].value=1;
  assert.equal(f.input.poll(10).direction,'down');assert.equal(f.input.poll(100).direction,null);
  assert.equal(f.input.poll(390).direction,'down');assert.equal(f.input.poll(400).direction,null);
  assert.equal(f.input.poll(10000).direction,'down');assert.equal(f.input.poll(10001).direction,null);
});
test('disconnect, unreadable API and unsupported layouts produce no flight or button input',()=>{
  for(const action of ['disconnect','fail','mapping']){
    const f=fixture();f.pad.axes=[1,-1];f.pad.buttons[7].value=1;f.input.poll(10);
    if(action==='disconnect')f.pad.connected=false;else if(action==='fail')f.fail();else f.pad.mapping='';
    const s=f.input.poll(20);assert.equal(s.flight,null);assert.equal(s.pressed.length,0);assert.equal(s.held.length,0);
  }
});
test('direct DualSense input works when native gamepads are empty or unreadable, without duplicating native Sony input',()=>{
  const f=fixture(),direct={...f.pad,id:'DualSense (WebHID Vendor: 054c Product: 0ce6)',index:4,inputSource:'WebHID',buttons:f.pad.buttons.map(button=>({...button}))};
  let native=[],unreadable=false,available=true;
  const input=f.window.nativeGamepadControls.create({read:()=>{if(unreadable)throw Error('unavailable');return native;},readDirect:()=>available?direct:null});
  assert.equal(input.poll(0).source,'WebHID');direct.buttons[8].value=1;assert.deepEqual(Array.from(input.poll(16).pressed),[8]);
  unreadable=true;direct.axes=[1,0,0,0];assert.equal(input.poll(32).flight.strength,1);
  unreadable=false;native=[{...f.pad,id:'Xbox',index:0}];assert.equal(input.poll(48).source,'WebHID');
  native=[f.pad];assert.equal(input.poll(64).source,'Gamepad');assert.equal(input.device,f.pad);
  native=[];input.poll(80);direct.buttons[8].value=0;input.poll(96);direct.buttons[17].value=1;assert.deepEqual(Array.from(input.poll(112).pressed),[17]);
  available=false;assert.equal(input.poll(128).connected,false);assert.equal(input.poll(144).flight,null);
});
