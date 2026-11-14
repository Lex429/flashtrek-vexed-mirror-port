/* Independent DualSense WebHID adapter. Packet layout checked against SDL's
   PS5 HIDAPI backend. Output changes only rumble; input feeds the existing controls. */
(() => {
  'use strict';
  const products=[0x0ce6,0x0df2],filters=products.map(productId=>({vendorId:0x054c,productId}));
  const sony=device=>device?.vendorId===0x054c&&products.includes(device.productId);
  function crc32(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
  function packet(bluetooth,strong,weak,sequence=0,usbBytes=47){
    const data=new Uint8Array(bluetooth?77:usbBytes),offset=bluetooth?2:0;
    if(bluetooth){data[0]=(sequence&15)<<4;data[1]=0x10;}
    data[offset]=0x03; // Compatible vibration + haptic mode select, only.
    data[offset+2]=Math.round(Math.max(0,Math.min(1,Number(weak)||0))*255);
    data[offset+3]=Math.round(Math.max(0,Math.min(1,Number(strong)||0))*255);
    if(bluetooth){const checked=new Uint8Array(75);checked[0]=0xa2;checked[1]=0x31;checked.set(data.subarray(0,73),2);new DataView(data.buffer).setUint32(73,crc32(checked),true);}
    return {reportId:bluetooth?0x31:0x02,data};
  }
  function inputReport(reportId,data){
    if(typeof data?.getUint8!=='function')return null;
    const size=data.byteLength,simple=reportId===1&&(size===9||size===77),offset=reportId===0x31?1:0;
    if(reportId===0x31){
      if(size!==77)return null;
      const checked=new Uint8Array(75);checked[0]=0xa1;checked[1]=0x31;
      for(let i=0;i<73;i++)checked[i+2]=data.getUint8(i);
      if(data.getUint32(73,true)!==crc32(checked))return null;
    }else if(reportId!==1||!simple&&size!==63)return null;
    const read=index=>data.getUint8(offset+index),face=read(simple?4:7),shoulders=read(simple?5:8),extra=read(simple?6:9),hat=face&15;
    const values=Array(18).fill(0);
    for(const [index,mask] of [[0,0x20],[1,0x40],[2,0x10],[3,0x80]])values[index]=Number(!!(face&mask));
    for(const [index,mask] of [[4,1],[5,2],[8,16],[9,32],[10,64],[11,128]])values[index]=Number(!!(shoulders&mask));
    values[6]=Math.max(read(simple?7:4)/255,Number(!!(shoulders&4)));
    values[7]=Math.max(read(simple?8:5)/255,Number(!!(shoulders&8)));
    values[12]=Number(hat===0||hat===1||hat===7);values[13]=Number(hat===3||hat===4||hat===5);
    values[14]=Number(hat===5||hat===6||hat===7);values[15]=Number(hat===1||hat===2||hat===3);
    values[16]=extra&1;values[17]=Number(!!(extra&2));
    const axes=Array.from({length:4},(_,index)=>{const value=read(index)-128;return value/(value<0?128:127);});
    return {axes,buttons:values.map(value=>({value,pressed:value>=.5,touched:value>0}))};
  }
  function reports(device){
    const found=[];const visit=collection=>{found.push(...collection.outputReports||[]);for(const child of collection.children||[])visit(child);};
    for(const collection of device.collections||[])visit(collection);return found;
  }
  function create({hid=typeof navigator!=='undefined'?navigator.hid:null,notify=()=>{},now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
    let device=null,ready=false,bluetooth=false,usbBytes=47,sequence=0,queue=Promise.resolve(),timer=null,finish=null,generation=0,connecting=false,attemptedRestore=false,error='';
    let input=null,lastInputAt=-Infinity,inputReports=0;
    function inputDevice(){return device?.opened&&input&&now()-lastInputAt<=1000?input:null;}
    function inspect(){return {available:!!hid?.requestDevice,connected:ready&&!!device?.opened,connecting,error,transport:ready&&device?.opened?(bluetooth?'Bluetooth direct':'USB direct'):null,inputReports};}
    function publish(){notify(inspect());}
    function onInput(event){
      if(event.device!==device)return;
      const decoded=inputReport(event.reportId,event.data);if(!decoded)return;
      lastInputAt=now();inputReports++;
      input={...decoded,id:`DualSense${device.productId===0x0df2?' Edge':''} (WebHID Vendor: 054c Product: ${device.productId.toString(16).padStart(4,'0')})`,index:4,connected:true,mapping:'standard',timestamp:lastInputAt,inputSource:'WebHID'};
    }
    function write(target,strong,weak,token,force=false){
      const report=packet(bluetooth,strong,weak,sequence++,usbBytes);
      queue=queue.catch(()=>{}).then(()=>{if(!target?.opened||!force&&token!==generation)return;return target.sendReport(report.reportId,report.data);});
      return queue;
    }
    async function reset(){
      generation++;clearTimer(timer);timer=null;finish?.('preempted');finish=null;
      if(device?.opened)await write(device,0,0,generation,true);return 'complete';
    }
    function playEffect(_type,params){
      if(!device?.opened)return Promise.reject(new Error('DualSense vibration is disconnected.'));
      generation++;const token=generation,target=device;clearTimer(timer);finish?.('preempted');finish=null;
      return new Promise((resolve,reject)=>{
        finish=resolve;
        const fail=reason=>{if(token===generation){ready=false;error='Direct vibration failed. Reconnect the controller.';finish=null;void write(target,0,0,token,true).catch(()=>{});publish();}reject(reason);};
        write(target,params.strongMagnitude,params.weakMagnitude,token).then(()=>{
          if(token!==generation){resolve('preempted');return;}
          timer=setTimer(()=>{timer=null;write(target,0,0,token).then(()=>{if(token===generation)finish=null;resolve('complete');},fail);},Math.max(1,Math.min(500,Number(params.duration)||1)));
        },fail);
      });
    }
    const actuator=Object.freeze({effects:['dual-rumble'],playEffect,reset});
    async function open(next){
      if(!sony(next))throw new Error('Select a Sony DualSense or DualSense Edge controller.');
      const output=reports(next),bt=output.find(report=>report.reportId===0x31),usb=output.find(report=>report.reportId===0x02);
      if(!bt&&!usb)throw new Error('The browser did not expose the controller vibration report.');
      ready=false;if(device!==next){await reset();device?.removeEventListener?.('inputreport',onInput);if(device?.opened)await device.close();device=null;}
      if(!next.opened)await next.open();device=next;bluetooth=!!bt;sequence=0;input=null;lastInputAt=-Infinity;inputReports=0;
      device.removeEventListener?.('inputreport',onInput);device.addEventListener?.('inputreport',onInput);
      const bits=(usb?.items||[]).reduce((sum,item)=>sum+(item.reportSize||0)*(item.reportCount||0),0);
      usbBytes=bits>=47*8&&bits<=63*8?Math.ceil(bits/8):47;
      await reset();ready=true;error='';publish();return true;
    }
    async function connect(){
      if(!hid?.requestDevice){error='This browser does not allow direct controller access. Use Chrome or Edge.';publish();return false;}
      connecting=true;error='';publish();
      try{const selected=await hid.requestDevice({filters});if(!selected.length){error='No controller selected.';return false;}return await open(selected.find(next=>sony(next)&&reports(next).some(report=>report.reportId===0x31||report.reportId===0x02))||selected[0]);}
      catch(reason){error=reason?.message||'Could not connect to DualSense vibration.';return false;}
      finally{connecting=false;publish();}
    }
    async function restore(){
      if(attemptedRestore||!hid?.getDevices)return false;attemptedRestore=true;
      try{const known=(await hid.getDevices()).filter(next=>sony(next)&&reports(next).some(report=>report.reportId===0x31||report.reportId===0x02));if(known.length===1)return await open(known[0]);}catch{error='Reconnect DualSense vibration in Options.';publish();}return false;
    }
    hid?.addEventListener?.('disconnect',event=>{if(event.device===device){generation++;clearTimer(timer);finish?.('preempted');finish=null;device.removeEventListener?.('inputreport',onInput);device=null;ready=false;input=null;error='DualSense disconnected.';publish();}});
    return Object.freeze({connect,restore,reset,inspect,inputDevice,output(pad){if(!ready||!device?.opened)return null;if(pad&&!/dualsense|0ce6|0df2/i.test(pad.id))return null;return {actuator,type:'dual-rumble',transport:bluetooth?'Bluetooth direct':'USB direct'};}});
  }
  window.nativeDualSenseHid=Object.freeze({create,packet,inputReport,crc32});
})();
