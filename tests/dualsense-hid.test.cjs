const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/dualsense-hid.js','utf8'),{window,Uint8Array,DataView,setTimeout,clearTimeout});
const api=window.nativeDualSenseHid;
function fixture(bluetooth=true){
  const sent=[],timers=new Map(),events={},inputEvents=new Set();let nextTimer=0,pickers=0,time=0;
  const device={vendorId:0x054c,productId:0x0ce6,opened:false,collections:[{outputReports:[{reportId:bluetooth?0x31:0x02,items:[{reportSize:8,reportCount:bluetooth?77:47}]}]}],
    addEventListener(name,callback){if(name==='inputreport')inputEvents.add(callback);},removeEventListener(name,callback){if(name==='inputreport')inputEvents.delete(callback);},
    async open(){this.opened=true;},async close(){this.opened=false;},async sendReport(id,data){sent.push({id,data:Uint8Array.from(data)});}};
  const hid={async requestDevice(options){pickers++;assert.equal(options.filters.length,2);return [device];},async getDevices(){return [];},addEventListener(name,callback){events[name]=callback;}};
  const direct=api.create({hid,now:()=>time,setTimer:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearTimer:id=>timers.delete(id)});
  return {direct,hid,device,sent,timers,events,pickers:()=>pickers,time:value=>{time=value;},emit:(report,source=device)=>{for(const callback of inputEvents)callback({...report,device:source});}};
}
function inputPacket(kind,{face=8,shoulders=0,extra=0,triggers=[0,0],axes=[128,128,128,128]}={}){
  const simple=kind==='simple'||kind==='padded-simple',bt=kind==='bluetooth',reportId=bt?0x31:1,data=new Uint8Array(simple?(kind==='simple'?9:77):bt?77:63),offset=bt?1:0;
  data.set(axes,offset);data[offset+(simple?4:7)]=face;data[offset+(simple?5:8)]=shoulders;data[offset+(simple?6:9)]=extra;
  data[offset+(simple?7:4)]=triggers[0];data[offset+(simple?8:5)]=triggers[1];
  if(bt)new DataView(data.buffer).setUint32(73,api.crc32(Uint8Array.from([0xa1,0x31,...data.slice(0,73)])),true);
  return {reportId,data:new DataView(data.buffer)};
}
async function drain(){await new Promise(setImmediate);}
test('USB and Bluetooth packets update only the two motors, with Bluetooth sequence and valid CRC32',()=>{
  const usb=api.packet(false,.8,.2);assert.equal(usb.reportId,2);assert.equal(usb.data.length,47);assert.deepEqual(Array.from(usb.data.slice(0,4)),[3,0,51,204]);assert.ok(usb.data.slice(4).every(value=>value===0));
  const bt=api.packet(true,.8,.2,5);assert.equal(bt.reportId,0x31);assert.equal(bt.data.length,77);assert.deepEqual(Array.from(bt.data.slice(0,6)),[0x50,0x10,3,0,51,204]);
  const bytes=Uint8Array.from([0xa2,0x31,...bt.data.slice(0,73)]);assert.equal(new DataView(bt.data.buffer).getUint32(73,true),api.crc32(bytes));
  assert.equal(api.crc32(Uint8Array.from(Buffer.from('123456789'))),0xcbf43926);
});
test('permission is requested only by connect; a pulse always sends an automatic zero-motor report',async()=>{
  const f=fixture();await f.direct.restore();assert.equal(f.pickers(),0);assert.equal(await f.direct.connect(),true);assert.equal(f.pickers(),1);assert.equal(f.direct.inspect().transport,'Bluetooth direct');
  const output=f.direct.output({id:'Wireless Controller (Vendor: 054c Product: 0ce6)'});assert.ok(output);assert.equal(f.direct.output({id:'Xbox'}),null);
  const pulse=output.actuator.playEffect('dual-rumble',{duration:120,strongMagnitude:.8,weakMagnitude:.2});await drain();
  assert.equal(f.sent.at(-1).data[5],204);assert.equal(f.timers.size,1);
  for(const callback of f.timers.values())callback();await pulse;
  assert.equal(f.sent.at(-1).data[4],0);assert.equal(f.sent.at(-1).data[5],0);
});
test('pause/reset preempts a pending pulse and sends zero rather than leaving motors running',async()=>{
  const f=fixture(false);await f.direct.connect();const pulse=f.direct.output().actuator.playEffect('dual-rumble',{duration:200,strongMagnitude:1,weakMagnitude:1});await drain();
  await f.direct.reset();assert.equal(await pulse,'preempted');assert.equal(f.timers.size,0);assert.equal(f.sent.at(-1).data[2],0);assert.equal(f.sent.at(-1).data[3],0);
});
test('already granted access restores without a picker; cancel, unsupported devices and disconnect stay explicit',async()=>{
  const f=fixture();f.hid.getDevices=async()=>[f.device];assert.equal(await f.direct.restore(),true);assert.equal(f.pickers(),0);
  f.events.disconnect({device:f.device});assert.equal(f.direct.inspect().connected,false);
  const cancelled=api.create({hid:{requestDevice:async()=>[]}});assert.equal(await cancelled.connect(),false);assert.equal(cancelled.inspect().error,'No controller selected.');
  const wrong=api.create({hid:{requestDevice:async()=>[{vendorId:1,productId:2}]}});assert.equal(await wrong.connect(),false);assert.match(wrong.inspect().error,/Sony DualSense/);
});
test('USB, Bluetooth and basic reports map sticks, diagonal D-pad, touchpad and face buttons to standard controls',()=>{
  for(const kind of ['usb','bluetooth','simple','padded-simple']){
    const decoded=api.inputReport(...Object.values(inputPacket(kind,{face:0xf1,shoulders:0xf3,extra:3,triggers:[64,192],axes:[0,255,128,64]})));
    assert.deepEqual(Array.from(decoded.axes),[-1,1,0,-.5]);
    for(const index of [0,1,2,3,4,5,8,9,10,11,12,15,16,17])assert.equal(decoded.buttons[index].value,1,`${kind} button ${index}`);
    for(const index of [13,14])assert.equal(decoded.buttons[index].value,0);
    assert.equal(decoded.buttons[6].value,64/255);assert.equal(decoded.buttons[7].value,192/255);
    const neutral=api.inputReport(...Object.values(inputPacket(kind)));assert.ok(neutral.buttons.every(button=>button.value===0));
    const counter=api.inputReport(...Object.values(inputPacket(kind,{extra:0xfc})));assert.equal(counter.buttons[17].value,0);
  }
});
test('truncated, unknown and corrupt Bluetooth reports never become controller input',()=>{
  assert.equal(api.inputReport(9,new DataView(new ArrayBuffer(63))),null);
  assert.equal(api.inputReport(1,new DataView(new ArrayBuffer(8))),null);
  assert.equal(api.inputReport(0x31,new DataView(new ArrayBuffer(12))),null);
  const bad=inputPacket('bluetooth');bad.data.setUint8(2,1);assert.equal(api.inputReport(bad.reportId,bad.data),null);
});
test('direct input requires the selected device, expires on missing reports and clears on disconnect',async()=>{
  const f=fixture();assert.equal(f.direct.inputDevice(),null);await f.direct.connect();assert.equal(f.direct.inputDevice(),null);
  f.emit(inputPacket('bluetooth',{shoulders:0x10}),{});assert.equal(f.direct.inputDevice(),null);
  f.emit(inputPacket('bluetooth',{shoulders:0x10}));assert.equal(f.direct.inputDevice().buttons[8].pressed,true);assert.equal(f.direct.inputDevice().mapping,'standard');
  f.time(1001);assert.equal(f.direct.inputDevice(),null,'lost reports release held flight/fire input');
  f.emit(inputPacket('bluetooth'));assert.ok(f.direct.inputDevice());
  f.events.disconnect({device:f.device});assert.equal(f.direct.inputDevice(),null);f.emit(inputPacket('bluetooth'));assert.equal(f.direct.inputDevice(),null);
});
test('a rumble output failure does not disconnect working direct button input',async()=>{
  const f=fixture();await f.direct.connect();f.emit(inputPacket('bluetooth',{extra:2}));
  const actuator=f.direct.output().actuator;f.device.sendReport=async()=>{throw Error('output failed');};
  await assert.rejects(actuator.playEffect('dual-rumble',{duration:100,strongMagnitude:.5,weakMagnitude:.5}),/output failed/);
  assert.equal(f.direct.output(),null);assert.equal(f.direct.inputDevice().buttons[17].pressed,true);
});
