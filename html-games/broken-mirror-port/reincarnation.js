/* Safe timeline policy. Save storage owns snapshots; flight owns coordinates. */
(() => {
  'use strict';
  const runtimes=new WeakMap(),interval=15,quietPeriod=15;
  let sequence=0;
  const mode=state=>state.devMode?'dev':'normal';
  const now=state=>window.nativeSimulation.seconds(state);
  const playable=state=>!!state&&state.hull>0&&state.phase!=='destroyed'&&
    window.nativeManualFlight.systems.some(system=>system.id===Number(state.system));
  function initialize(state){
    if(!state.reincarnation||state.reincarnation.version!==1||!state.reincarnation.id){
      // A private identity stream never consumes gameplay randomness.
      const id=window.crypto?.randomUUID?.()||`${Date.now()}-${++sequence}-${window.performance?.now?.()||0}`;
      state.reincarnation={version:1,id,safeAfter:now(state)};
    }
    if(!runtimes.has(state))runtimes.set(state,{epoch:0,lastAt:-Infinity});
    return runtimes.get(state);
  }
  function inDanger(state){
    if(!playable(state)||state.pendingTransit)return true;
    const region=window.nativeManualFlight.currentRegion(state);
    if(region.system!=null&&window.nativeFactionStanding.relationship(state,region.system).status==='Hostile')return true;
    const at=now(state);
    for(const alert of Object.values(state.factionDefence?.systems||{})){
      if(alert.aggressors?.some(entry=>entry.id==='player'&&entry.until>at))return true;
    }
    if(state.factionDefence?.orders?.some(order=>(order.targetId??order.target?.id)==='player'))return true;
    if(state.civilianTraffic?.retaliations?.some(record=>record.a==='player'||record.b==='player'))return true;
    // Include beams and newly launched rounds, before their reaction delay.
    if(state.weaponCombat?.events?.some(event=>!event.cancelled&&!event.resolved&&
      (event.alive||!event.projectile)&&(event.sourceId==='player'||event.targetId==='player')))return true;
    return !!window.nativeCombatShots.threats(state,state,{reaction:0,limit:1}).length;
  }
  function safe(state){
    if(inDanger(state)||state.phase==='disabled'||now(state)<Number(state.reincarnation?.safeAfter||0))return false;
    const maximum=window.nativeShipDefinitions.forEntity(state).hull;
    return state.hull>=maximum*.75;
  }
  function candidate(state,{force=false}={}){
    const runtime=initialize(state),at=now(state);
    if(!safe(state)||!force&&at-runtime.lastAt<interval)return null;
    return {id:state.reincarnation.id,epoch:runtime.epoch,at};
  }
  function valid(state,token){
    return !!token&&state.reincarnation?.id===token.id&&runtimes.get(state)?.epoch===token.epoch&&safe(state);
  }
  function remembered(state,token){if(valid(state,token))runtimes.get(state).lastAt=token.at;}
  function danger(state){
    const runtime=initialize(state);runtime.epoch++;
    state.reincarnation.safeAfter=Math.max(Number(state.reincarnation.safeAfter)||0,now(state)+quietPeriod);
  }
  function beforeDanger(state){
    const result=window.nativeSaveStorage.checkpointReincarnation(state,{force:true});
    danger(state);return result;
  }
  function saved(state){
    if(!state)return null;
    const checkpoint=window.nativeSaveStorage.readReincarnation(state);
    if(playable(checkpoint))return checkpoint;
    // Old saves have no safe history. Recover their last living world, then
    // find refuge; never borrow a checkpoint from another campaign or mode.
    const legacy=window.nativeSaveStorage.read(mode(state));
    if(!playable(legacy))return null;
    if(legacy.reincarnation?.id&&legacy.reincarnation.id!==state.reincarnation?.id)return null;
    return legacy;
  }
  function prepare(state){
    if(!playable(state))return {ok:false,error:'No playable saved point is available.'};
    state.system=Number(state.system);
    for(const key of ['x','y'])state[key]=Number.isFinite(Number(state[key]))?Number(state[key]):0;
    initialize(state);
    const dangerous=inDanger(state);
    if(dangerous){
      // Keep every crew, grievance, cargo agreement and projectile in this
      // earlier world. Only the player is placed outside the danger zone.
      const separation=Math.max(12000,window.nativeShipDetail?.radius(state)||0);
      const ships=[...(state.civilianTraffic?.ships||[]),...(state.solEconomy?.freighters||[])];
      const obstacles=ships.filter(ship=>ship.hull>0&&!ship.journey).map(ship=>{
        const origin=window.nativeManualFlight.anchor(ship.system);
        const pose=window.nativeShipDetail.pose(state,ship,{category:ship.lifeLeg?'tug':'civilian'});
        return origin&&{x:origin.x+pose.x,y:origin.y+pose.y};
      }).filter(Boolean);
      for(const event of state.weaponCombat?.events||[]){
        if(!event.alive||event.cancelled||event.resolved)continue;
        const origin=window.nativeManualFlight.anchor(event.system);
        if(origin)obstacles.push({x:origin.x+event.x,y:origin.y+event.y});
      }
      const refuge=window.nativeManualFlight.relocateOutside(state,{clearance:separation,
        accepts:point=>obstacles.every(other=>Math.hypot(point.x-other.x,point.y-other.y)>separation)});
      if(!refuge)return {ok:false,error:'Unable to find a safe return location.'};
    }
    // Re-entry starts under manual control, without replaying an old cruise or
    // pending warp into the same fight. NPC jobs and paid reservations rewind.
    delete state.pendingTransit;delete state.arrivalApproach;state.localCruise=null;
    window.nativeShipMotion.stop(state);state.manualTargetSystem=0;
    window.nativeManualFlight.initializeRegion(state);
    return {ok:true,state,relocated:dangerous};
  }
  window.nativeReincarnation=Object.freeze({initialize,candidate,valid,remembered,danger,beforeDanger,saved,prepare,
    timing:Object.freeze({intervalSeconds:interval,quietSeconds:quietPeriod})});
})();
