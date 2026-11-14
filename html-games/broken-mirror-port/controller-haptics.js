/* Damage feedback only: consume the shared hit result, never apply damage. */
(() => {
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const settingKey='vexed-controller-damage-vibration';
  function damageEffect(descriptor,result,impact={}){
    if(!result?.ok||!(result.amount>0)||impact.visualOnly)return null;
    const hull=result.hullDamage>0,contact=(hull?result.contacts?.hull:result.contacts?.shield)||impact.contact;
    const radii=contact?.radii||descriptor.radii||{},local=contact?.local;
    let side=0,fore=0,zone='center';
    if(Number.isFinite(local?.x)&&Number.isFinite(local?.y)){
      const x=local.x/Math.max(1,radii.rx||descriptor.dimensions?.width/2||1),y=local.y/Math.max(1,radii.ry||descriptor.dimensions?.height/2||1),length=Math.hypot(x,y);
      if(length>1e-8){side=x/length;fore=y/length;zone=Math.abs(side)>Math.abs(fore)?side<0?'port':'starboard':fore<0?'bow':'stern';}
    }
    const capacity=Math.max(1,hull?descriptor.definition.hull:descriptor.definition.ratedShields??descriptor.definition.shields);
    const fraction=clamp((hull?result.hullDamage:result.absorbed)/capacity,0,1),strength=clamp(.2+Math.sqrt(fraction)*.8+(hull?.16:0),.2,1);
    // The browser exposes low/high-frequency channels, conventionally the
    // left/right rumble motors. These mixes approximate a side, not 3-D haptics.
    return {zone,hull,duration:Math.round(clamp((hull?125:75)*(1+fore*.3)+fraction*65,50,240)),startDelay:0,
      strongMagnitude:clamp(strength*(.6-.4*side),0,1),weakMagnitude:clamp(strength*(.6+.4*side),0,1)};
  }
  function create({now=()=>performance.now(),storage=null,notify=()=>{},direct=null}={}){
    let getState=()=>null,allowed=()=>false,testAllowed=()=>false,device=null,identity=null,pending=null,lastAt=-Infinity,actuator=null,playing=false,previewing=false,generation=0,failed=false,enabled=true;
    let played=0,lastEffect=null,lastStatus='';
    try{enabled=storage?.getItem(settingKey)!=='off';}catch{}
    function output(){
      try{
      const connected=direct?.output(device);if(connected)return connected;
      if(!device||device.connected===false)return null;
      const candidates=[device.vibrationActuator,...Array.from(device.hapticActuators||[])].filter(Boolean);
      for(const candidate of candidates){
        if(typeof candidate.playEffect==='function'){
          const effects=candidate.effects?Array.from(candidate.effects):null;
          if(!effects||effects.includes('dual-rumble'))return {actuator:candidate,type:'dual-rumble'};
          if(effects.includes('trigger-rumble'))return {actuator:candidate,type:'trigger-rumble'};
        }else if(typeof candidate.pulse==='function')return {actuator:candidate,type:'pulse'};
      }
      return null;
      }catch{return null;}
    }
    function inspect(){
      const target=output(),link=direct?.inspect()||{};return {enabled,connected:!!device&&device.connected!==false||!!target,supported:!!target,status:!device&&!target?'disconnected':!target?'unsupported':!enabled?'off':failed?'error':'ready',singleChannel:target?.type==='pulse',transport:target?.transport||'browser',directAvailable:!!link.available,directConnected:!!link.connected,directConnecting:!!link.connecting,directError:link.error||'',played,last:lastEffect?{...lastEffect}:null};
    }
    function publish(){const status=inspect(),signature=[status.enabled,status.connected,status.supported,status.status,status.singleChannel,status.directAvailable,status.directConnected,status.directConnecting,status.directError,status.transport].join(':');if(signature!==lastStatus){lastStatus=signature;notify(status);}}
    function stop(){
      pending=null;generation++;lastAt=-Infinity;previewing=false;
      if(playing&&actuator){
        try{const value=typeof actuator.reset==='function'?actuator.reset():typeof actuator.pulse==='function'?actuator.pulse(0,0):actuator.playEffect('dual-rumble',{duration:0,startDelay:0,strongMagnitude:0,weakMagnitude:0});Promise.resolve(value).catch(()=>{});}catch{}
      }
      playing=false;actuator=null;
    }
    function setDevice(next){
      const nextIdentity=next&&next.connected!==false?`${next.index}:${next.id}`:null;
      if(identity!==nextIdentity){stop();identity=nextIdentity;failed=false;}
      device=nextIdentity?next:null;publish();
    }
    function setEnabled(value){enabled=!!value;if(!enabled)stop();try{storage?.setItem(settingKey,enabled?'on':'off');}catch{}publish();return enabled;}
    function play(effect){
      const target=output();if(!enabled||!target||failed)return Promise.resolve(false);
      actuator=target.actuator;playing=true;const token=++generation;
      const params={duration:effect.duration,startDelay:0,strongMagnitude:effect.strongMagnitude,weakMagnitude:effect.weakMagnitude};
      if(target.type==='trigger-rumble'){params.leftTrigger=0;params.rightTrigger=0;}
      let result;
      try{result=target.type==='pulse'?actuator.pulse(Math.max(params.strongMagnitude,params.weakMagnitude),params.duration):actuator.playEffect(target.type,params);}
      catch{failed=true;playing=false;publish();return Promise.resolve(false);}
      played++;lastEffect={...effect};
      return Promise.resolve(result).then(value=>{
        if(token===generation){playing=false;if(value===false){failed=true;publish();return false;}}
        return true;
      },()=>{if(token===generation){failed=true;playing=false;pending=null;publish();}return false;});
    }
    function impact(descriptor,result,event={}){
      if(descriptor?.category!=='player'||descriptor.entity!==getState()||!enabled||failed||!allowed()||!output())return false;
      const effect=damageEffect(descriptor,result,event);if(!effect)return false;
      const at=now();
      if(result.destroyed){pending=null;lastAt=at;void play({...effect,fatal:true,duration:240,strongMagnitude:Math.max(.8,effect.strongMagnitude),weakMagnitude:Math.max(.8,effect.weakMagnitude)});return true;}
      if(pending&&at-pending.at<=120){effect.strongMagnitude=Math.max(effect.strongMagnitude,pending.effect.strongMagnitude);effect.weakMagnitude=Math.max(effect.weakMagnitude,pending.effect.weakMagnitude);effect.duration=Math.max(effect.duration,pending.effect.duration);}
      pending={at,effect};return true;
    }
    function step(next){
      setDevice(next);
      if(!enabled||!allowed()){if(!(previewing&&enabled&&testAllowed()))stop();return false;}
      if(!pending||failed)return false;
      const at=now();if(at-pending.at>300){pending=null;return false;}if(at-lastAt<90)return false;
      const effect=pending.effect;pending=null;lastAt=at;void play(effect);return true;
    }
    async function test(){
      stop();failed=false;if(!enabled||!testAllowed()||!output()){publish();return false;}
      previewing=true;const result=await play({zone:'center',hull:false,duration:220,strongMagnitude:.65,weakMagnitude:.65});previewing=false;publish();return result;
    }
    return Object.freeze({attach(options){getState=options.getState;allowed=options.allowed;testAllowed=options.testAllowed||allowed;void direct?.restore().then(publish);},async connectDirect(){stop();failed=false;const ok=await direct?.connect();publish();return !!ok;},inputDevice:()=>direct?.inputDevice?.()||null,refresh:publish,setDevice,setEnabled,impact,step,stop,test,inspect});
  }
  let storage=null;try{storage=localStorage;}catch{}
  let api;const direct=window.nativeDualSenseHid?.create({notify:()=>api?.refresh()});
  api=create({storage,direct,notify:()=>{if(typeof dispatchEvent==='function'&&typeof CustomEvent==='function')dispatchEvent(new CustomEvent('native-hapticschange'));}});
  window.nativeControllerHaptics=Object.freeze({...api,create,damageEffect});
})();
