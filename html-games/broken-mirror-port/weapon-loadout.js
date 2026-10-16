/* Owned weapon identities. Numeric equipment arrays remain compatible with old saves/UI. */
(() => {
  'use strict';
  const model=id=>window.VexedMirrorWeapons?.find(item=>item.id===Number(id));
  const valid=id=>Number.isInteger(Number(id))&&Number(id)>0&&!!model(id);
  const clock=state=>(window.nativeSimulation?.seconds(state)??Number(state.weaponCombat?.clock))||0;
  function newInstance(loadout,modelId){
    const id='weapon:'+loadout.nextId++;
    return loadout.instances[id]={id,modelId:Number(modelId),readyAt:0};
  }
  function project(holder,loadout){
    holder.weapons=loadout.slots.map(id=>id?loadout.instances[id]?.modelId||null:null);
    holder.weaponInventory=loadout.locker.map(id=>loadout.instances[id]?.modelId).filter(valid);
  }
  function ensure(state,holder=state,defaults){
    let loadout=holder.weaponLoadout;
    if(!loadout||loadout.version!==1||!loadout.instances){
      loadout=holder.weaponLoadout={version:1,nextId:1,nextSlot:Number(holder===state?state.weaponCombat?.nextSlot:holder.nextSlot)||0,slots:[],locker:[],instances:{}};
      const fitted=Array.isArray(holder.weapons)?holder.weapons:defaults||[];
      const now=clock(state),legacy=state.shipSimulation?.legacyClocks;
      const oldClock=holder===state?((legacy?.player??Number(state.weaponCombat?.clock))||0):((legacy?.civilian??Number(state.civilianTraffic?.clock))||0);
      const readiness=holder===state?state.weaponCombat?.weaponReadyAt:holder.weaponReadyAt;
      fitted.forEach((id,slot)=>{
        if(!valid(id)){loadout.slots.push(null);return;}
        const instance=newInstance(loadout,id);
        instance.readyAt=now+Math.max(0,(Number(readiness?.[slot+':'+Number(id)])||0)-oldClock);
        loadout.slots.push(instance.id);
      });
      for(const id of holder.weaponInventory||[])if(valid(id))loadout.locker.push(newInstance(loadout,id).id);
      // All previous slot cooldown keys have now been migrated to their owned items.
      if(holder===state&&state.weaponCombat)delete state.weaponCombat.weaponReadyAt;
      else delete holder.weaponReadyAt;
    }
    loadout.nextId=Math.max(1,Number(loadout.nextId)||1);
    loadout.nextSlot=Math.max(0,Number(loadout.nextSlot)||0);
    loadout.slots=Array.isArray(loadout.slots)?loadout.slots:[];
    loadout.locker=Array.isArray(loadout.locker)?loadout.locker:[];
    project(holder,loadout);
    return loadout;
  }
  function equipped(state,holder=state,defaults){
    const loadout=ensure(state,holder,defaults);
    return loadout.slots.map((id,slot)=>({slot,instance:loadout.instances[id],weapon:model(loadout.instances[id]?.modelId)})).filter(item=>item.instance&&item.weapon);
  }
  function grant(state,modelId,{holder=state,location='locker',slot}={}){
    if(!valid(modelId))return {ok:false,error:'Unknown weapon.'};
    const loadout=ensure(state,holder),instance=newInstance(loadout,modelId);
    if(location==='slot'){
      const index=Number.isInteger(slot)?slot:Math.max(0,loadout.slots.findIndex(id=>!id));
      if(loadout.slots[index])loadout.locker.push(loadout.slots[index]);
      loadout.slots[index]=instance.id;
    }else loadout.locker.push(instance.id);
    project(holder,loadout);return {ok:true,instance};
  }
  function move(state,{holder=state,fromType,fromIndex,toType,toIndex}={}){
    if(!['slot','locker'].includes(fromType)||!['slot','locker'].includes(toType))return {ok:false,error:'Invalid weapon location.'};
    const loadout=ensure(state,holder),source=fromType==='slot'?loadout.slots:loadout.locker,target=toType==='slot'?loadout.slots:loadout.locker;
    if(!Number.isInteger(fromIndex)||fromIndex<0||!source[fromIndex]||!Number.isInteger(toIndex)||toIndex<0||fromType==='slot'&&fromIndex>2||toType==='slot'&&toIndex>2||toType==='locker'&&toIndex>target.length)return {ok:false,error:'Invalid weapon move.'};
    if(fromType===toType&&fromIndex===toIndex)return {ok:true};
    const id=source[fromIndex];
    if(toType==='locker'&&toIndex===target.length){
      target.push(id);if(fromType==='locker')source.splice(fromIndex,1);else source[fromIndex]=null;
    }else if(fromType==='locker'&&toType==='slot'){
      source.splice(fromIndex,1);
      const displaced=target[toIndex];target[toIndex]=id;
      if(displaced)source.splice(Math.min(fromIndex,source.length),0,displaced);
    }else [source[fromIndex],target[toIndex]]=[target[toIndex]||null,id];
    project(holder,loadout);return {ok:true};
  }
  function refit(state,modelIds,{holder=state}={}){
    const loadout=ensure(state,holder);
    loadout.locker.push(...loadout.slots.filter(Boolean));loadout.slots=[];
    for(const id of modelIds||[])loadout.slots.push(valid(id)?newInstance(loadout,id).id:null);
    loadout.nextSlot=0;project(holder,loadout);return loadout;
  }
  function ready(instance,now){return (Number(instance?.readyAt)||0)<=now;}
  function consume(instance,spec,now){instance.readyAt=now+spec.recharge;}
  window.nativeWeaponLoadout=Object.freeze({ensure,equipped,grant,move,refit,ready,consume,project});
})();
