/* Transfers from a real disabled holder. Rendering never owns inventory changes. */
(() => {
  'use strict';
  const range=350,qty=v=>Math.max(0,Number(v)||0),same=(a,b)=>String(a)===String(b);
  function reference(target){
    if(!target||!['civilian','tug'].includes(target.category)||!target.entity)return null;
    return {category:target.category,id:String(target.entity.id),generation:target.entity.lifeGeneration||0};
  }
  function resolve(state,ref){
    if(!state||!ref||!['civilian','tug'].includes(ref.category))return null;
    const target=window.nativeShipSystems.resolve(state,ref.category==='tug'?'tug:'+ref.id:ref.id,state.system);
    return target?.category===ref.category&&(target.entity.lifeGeneration||0)===(ref.generation||0)?target:null;
  }
  function status(state,ref){
    const target=resolve(state,ref),out={ok:false,range,target,items:[],repairing:0,free:0};
    const fail=error=>({...out,error});
    if(!target)return fail('Select a disabled ship.');
    out.name=target.entity.name||target.definition.name;
    if(target.hull<=0||target.entity.phase!=='disabled')return fail('The target must be disabled and still intact.');
    if(target.shields>0)return fail('The target’s shields must be down.');
    if(!(state.hull>0)||state.phase==='destroyed'||state.landed||state.journey||state.localCruise||state.arrivalApproach||window.vexedWarp?.active)return fail('Looting is available during local flight.');
    const source=window.nativeShipDefinitions.describe(state,state,{category:'player'});
    out.distance=Math.hypot(target.x-source.x,target.y-source.y);
    if(out.distance>range)return fail(`Move within ${range} units to transport belongings.`);
    const equipment=window.nativeShipEquipment,holder=target.entity,bank=equipment.ensure(state,holder);
    out.capacity=window.nativeShipDefinitions.forEntity(state,state).cargo;out.used=equipment.cargoUsed(state);out.free=Math.max(0,out.capacity-out.used);
    const goods=window.nativeSolEconomy.goods;
    const add=(key,name,amount,extra={})=>{if(amount>0)out.items.push({key,name,amount,cargo:true,...extra});};
    if(ref.category==='civilian'){
      const c=holder.cargo;
      if(c?.tons>0&&goods[c.good]){
        const mineral=c.oreType&&window.nativeRegionalMinerals?.ores[c.oreType]?c.oreType:null;
        add('cargo',c.name||goods[c.good],qty(c.tons),{good:c.good,mineral,raw:!!c.raw,cargo:mineral!=='dilithium'});
      }
      add('oreHold',goods[0],qty(holder.oreHold),{good:0});
    }else if(goods[holder.good])add('tons',goods[holder.good],qty(holder.tons),{good:holder.good});
    add('repairDeuranium','Repair deuranium',qty(holder.repairDeuranium),{supply:'deuranium',good:7,cargo:!state.devMode});
    const equipmentOrder=new Set([...equipment.kinds.flatMap(kind=>bank.slots[kind]),...bank.locker,...Object.keys(bank.instances)]);
    for(const id of equipmentOrder){
      const item=bank.instances[id];if(!item)continue;
      const data=equipment.model(item.modelId);if(!data)continue;
      if(item.category==='repairDrone'&&(item.hull<=0||item.phase!=='stowed'||item.missionId))continue;
      const fitted=equipment.kinds.some(kind=>bank.slots[kind].includes(id));
      add('equipment:'+id,data.name,1,{equipment:true,cargo:false,fitted,condition:equipment.condition(item)});
    }
    const missions=(state.shipRepairs?.missions||[]).filter(m=>m.target?.category===ref.category&&same(m.target.id,ref.id));
    out.repairing=window.nativeShipRepairs?.drones(state,state.system).filter(d=>missions.some(m=>m.id===d.entity.missionId)).length||0;
    return {...out,ok:true,error:null};
  }
  function stage(state,ref,key,amount){
    const current=status(state,ref);if(!current.ok)return {ok:false,error:current.error};
    const row=current.items.find(row=>row.key===key);if(!row)return {ok:false,error:'That belonging is no longer aboard.'};
    if(!Number.isFinite(amount)||amount<=0)return {ok:false,error:'Choose a positive quantity.'};
    const tons=Math.min(amount,row.amount,row.cargo?current.free:row.amount);
    if(!(tons>0))return {ok:false,error:'Your cargo hold is full.'};
    const holder=current.target.entity,equipment=window.nativeShipEquipment;
    const oldMinerals=state.minerals,oldFreight=state.solFreightHold;
    let result,dest,field,previous,hadField;
    if(row.equipment)result=equipment.transfer(state,{from:holder,id:key.slice(10)});
    else{
      const owner=ref.category==='tug'?window.nativeSolEconomy:window.nativeNpcLives;
      result=owner.seizeCargo(state,holder,key,tons);
      if(result.ok){
        if(row.supply){dest=state;field=row.supply;}
        else if(row.mineral==='dilithium'){dest=state;field='dilithium';}
        else if(row.mineral){dest=state.minerals||={};field=row.mineral;}
        else{dest=state.solFreightHold||={};field=String(row.good);}
        hadField=Object.hasOwn(dest,field);previous=dest[field];dest[field]=qty(previous)+tons;
      }
    }
    if(!result.ok)return result;
    const oldLog=state.shipLoot;
    state.shipLoot={version:1,transfers:(oldLog?.transfers||0)+1,history:[{at:window.nativeSimulation.seconds(state),from:{...ref},item:key,name:row.name,quantity:tons},...(oldLog?.history||[])].slice(0,40)};
    const rollback=()=>{
      if(dest){if(hadField)dest[field]=previous;else delete dest[field];}
      if(oldMinerals===undefined)delete state.minerals;if(oldFreight===undefined)delete state.solFreightHold;
      result.undo();if(oldLog===undefined)delete state.shipLoot;else state.shipLoot=oldLog;
      window.nativeShipSystems.refreshShip(state,holder,ref.category);window.nativeShipSystems.refreshShip(state,state,'player');
    };
    window.nativeShipSystems.refreshShip(state,holder,ref.category);window.nativeShipSystems.refreshShip(state,state,'player');
    window.nativeShipRepairs?.observe(state,holder,ref.category);
    const destinationKey=row.equipment?'equipment:'+result.instance.id:row.supply?'supply:'+row.supply:row.mineral==='dilithium'?'supply:dilithium':row.mineral?'mineral:'+row.mineral:'freight:'+row.good;
    return {ok:true,name:row.name,quantity:tons,equipment:!!row.equipment,sourceKey:key,destinationKey,beforeQuantity:row.equipment?0:qty(previous),afterQuantity:row.equipment?1:dest[field],undo:rollback};
  }
  const receipt=({undo,...result})=>result;
  function commitStages(stages,commit){
    try{const saved=commit?.();if(saved?.ok===false)throw Error(saved.error||'Unable to save the transfer. Nothing was taken.');}
    catch(error){for(const item of [...stages].reverse())item.undo();return {ok:false,error:'Unable to save the transfer: '+error.message};}
    return {ok:true};
  }
  function take(state,ref,key,amount=1,{commit}={}){
    const result=stage(state,ref,key,amount);if(!result.ok)return result;
    const saved=commitStages([result],commit);return saved.ok?receipt(result):saved;
  }
  function takeAll(state,ref,{commit}={}){
    const initial=status(state,ref);if(!initial.ok)return {ok:false,error:initial.error};
    if(!initial.items.length)return {ok:false,error:'No belongings remain aboard.'};
    const stages=[];
    for(const key of initial.items.map(row=>row.key)){
      const current=status(state,ref),row=current.items.find(row=>row.key===key);
      if(!current.ok){for(const item of stages.reverse())item.undo();return {ok:false,error:current.error};}
      if(!row||row.cargo&&current.free<=0)continue;
      const result=stage(state,ref,key,row.amount);
      if(!result.ok){for(const item of stages.reverse())item.undo();return result;}
      stages.push(result);
    }
    if(!stages.length)return {ok:false,error:'Your cargo hold is full.'};
    const saved=commitStages(stages,commit);if(!saved.ok)return saved;
    const after=status(state,ref);return {ok:true,transfers:stages.map(receipt),remaining:after.items.length,full:after.free<=0};
  }
  window.nativeShipLoot=Object.freeze({range,reference,resolve,status,take,takeAll});
})();
