/* Faction roles and shared alerts. Existing life/combat owners move and fire. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld,passes=new WeakMap(),plans=new WeakMap();
  // Awareness is system-wide; pursuit is a small, stable response team.
  const responseLimit=3,reinforcementLimit=1,reinforcementRadius=8000;
  const military=new Set(['patrol','military','security','defence','defense','faction']);
  const seconds=state=>window.nativeSimulation.seconds(state);
  const allegiance=ship=>{const value=Number(ship?.ownerGovernmentId??ship?.faction??ship?.government);return Number.isFinite(value)&&value>0?value:null;};
  const isFaction=ship=>ship?.npcRole==='faction'||ship?.npcRole!=='civilian'&&military.has(ship?.role);
  const role=ship=>isFaction(ship)?'faction':'civilian';
  const government=(state,id)=>Number(state.planetGovts?.[id]??world.systems.find(system=>system.id===Number(id))?.governmentId)||null;
  function playerRegion(state){return window.nativeManualFlight?.currentRegion?window.nativeManualFlight.currentRegion(state).system:state.manualFlightRegion?state.manualFlightRegion.system:state.system;}
  function region(state,ship){
    if(ship===state)return playerRegion(state);
    const origin=window.nativeManualFlight?.anchor?.(ship.system);
    if(!origin||!window.nativeManualFlight?.regionAtPoint)return ship.system;
    const pose=window.nativeNpcLives?.pose?.(state,ship)||ship;
    return window.nativeManualFlight.regionAtPoint(state,{x:origin.x+pose.x,y:origin.y+pose.y},ship.system).system;
  }
  function resolve(state,id){
    if(id==='player')return state.hull>0&&!state.landed?window.nativeShipDefinitions.describe(state):null;
    const tug=String(id).startsWith('tug:'),entity=tug?window.nativeSolEconomy?.find?.(state,Number(String(id).slice(4))):window.nativeNpcLives?.find?.(state,id);
    if(!entity||entity.hull<=0||entity.journey||['destroyed','disabled','warp','arriving'].includes(entity.phase))return null;
    const pose=window.nativeNpcLives?.pose?.(state,entity)||entity;
    return {...window.nativeShipDefinitions.describe(state,entity,{category:tug?'tug':'civilian'}),...pose};
  }
  function sourceId(impact={}){
    if(impact.source==='environment')return null;
    if(window.nativePrometheus?.isSource(impact.sourceId))return 'player';
    if(impact.sourceId!=null)return impact.sourceId;
    return impact.source==='player'||impact.source==null&&!impact.physicalContact?'player':null;
  }
  function friendly(state,ship,impact){
    const id=sourceId(impact);if(id==='player')return !!ship?.playerOwned;if(id==null)return false;
    const owner=allegiance(ship),other=Number(impact.sourceGovernmentId)||allegiance(resolve(state,id)?.entity);
    return owner!=null&&other!=null&&owner===other;
  }
  function ensure(state){const data=state.factionDefence||={version:2,revision:0,systems:{},recentAttacks:[]};data.version=2;data.orders||=[];return data;}
  function assigned(state,ship){
    return plans.get(state)?.get(String(ship.id))||state.factionDefence?.orders?.find(order=>String(order.shipId)===String(ship.id));
  }
  const orderSystem=order=>order?.jurisdiction??order?.system;
  function jurisdiction(state,ship){
    const system=orderSystem(assigned(state,ship)),owner=allegiance(ship);
    return system!=null&&government(state,system)===owner?system:region(state,ship);
  }
  function committed(state,system,id){
    for(const order of plans.get(state)?.values()||[])if(orderSystem(order)===system&&order.target.id===id)return true;
    return state.factionDefence?.orders?.some(order=>order.system===system&&order.targetId===id)||false;
  }
  function hit(state,ship,impact={}){
    // Local law protects civilian citizens too. Their survival policy remains
    // civilian; only the existing military response team receives these orders.
    if(window.nativeDevLootDemo?.isPractice(state,ship)||friendly(state,ship,impact))return null;
    const attacker=sourceId(impact),system=region(state,ship),owner=allegiance(ship);
    if(attacker==null||system==null||!owner||government(state,system)!==owner)return null;
    const data=ensure(state),at=seconds(state);let alert=data.systems[system];
    if(!alert||alert.government!==owner)alert=data.systems[system]={government:owner,aggressors:[]};
    const repeated=alert.aggressors.some(entry=>String(entry.id)===String(attacker)&&entry.until>at);
    alert.aggressors=alert.aggressors.filter(entry=>entry.until>at&&String(entry.id)!==String(attacker));
    alert.aggressors.unshift({id:attacker,at,until:at+120});alert.aggressors.length=Math.min(16,alert.aggressors.length);if(!repeated)data.revision++;
    if(attacker!=='player')return null;
    const key=impact.weaponEventId==null?null:system+':'+impact.weaponEventId;
    if(key&&data.recentAttacks.includes(key))return null;
    if(key){data.recentAttacks.push(key);if(data.recentAttacks.length>128)data.recentAttacks.shift();}
    return window.nativeFactionStanding.shipAttacked(state,system,owner);
  }
  function threat(state,system,owner){
    const alert=state.factionDefence?.systems?.[system],at=seconds(state);
    const playerAlert=alert?.government===owner&&alert.aggressors.some(entry=>entry.id==='player'&&(entry.until>at||committed(state,system,'player')));
    if(playerRegion(state)===system&&(playerAlert||window.nativeFactionStanding.relationship(state,system).status==='Hostile')){
      const player=resolve(state,'player');if(player)return player;
    }
    if(alert?.government===owner)for(const entry of alert.aggressors){
      if(entry.until<=at&&!committed(state,system,entry.id))continue;const actor=resolve(state,entry.id);
      if(actor&&region(state,actor.entity??state)===system&&(actor.id==='player'||allegiance(actor.entity)!==owner))return actor;
    }
    return playerRegion(state)===system&&window.nativeFactionStanding.relationship(state,system).status==='Hostile'?resolve(state,'player'):null;
  }
  function target(state,ship){
    if(!isFaction(ship)||ship.hull<=0||ship.journey||['destroyed','disabled','warp','arriving'].includes(ship.phase))return null;
    const system=jurisdiction(state,ship),owner=allegiance(ship);
    return system!=null&&owner&&government(state,system)===owner?threat(state,system,owner):null;
  }
  function hostileToPlayer(state,ship){
    if(ship?.playerOwned)return false;
    if(!isFaction(ship))return false;
    const system=jurisdiction(state,ship),owner=allegiance(ship),alert=state.factionDefence?.systems?.[system];
    return system!=null&&government(state,system)===owner&&(window.nativeFactionStanding.relationship(state,system).status==='Hostile'||alert?.government===owner&&alert.aggressors.some(entry=>entry.id==='player'&&(entry.until>seconds(state)||committed(state,system,'player'))));
  }
  function ordersDue(state){
    if(state.landed)return false;
    const system=playerRegion(state),signature=system+':'+government(state,system)+':'+window.nativeFactionStanding.relationship(state,system).status+':'+(state.factionDefence?.revision||0),at=seconds(state),previous=passes.get(state);
    if(previous?.signature===signature&&at<previous.nextAt)return false;
    passes.set(state,{signature,nextAt:at+.25});return true;
  }
  function plan(state,ships){
    const previous=plans.get(state);
    if(previous&&!ordersDue(state))return previous;
    if(!previous)ordersDue(state);
    ships||=window.nativeNpcLives?.members?.(state)||[];
    const groups=new Map(),candidates=[],commitments=new Map();
    for(const order of state.factionDefence?.version>=2?state.factionDefence.orders||[]:[])commitments.set(String(order.shipId),order);
    for(const [id,order] of previous||[])commitments.set(id,{targetId:order.target.id,engaged:order.engaged});
    for(const ship of ships){
      if(!isFaction(ship)||ship.journey||ship.scriptedDemo||ship.disputeId||ship.hull<=0||['disabled','destroyed','warp','arriving'].includes(ship.phase))continue;
      if(ship.hull<=Math.max(1,window.nativeShipDefinitions.forEntity(state,ship,{category:'civilian'}).hull*.25))continue;
      const system=jurisdiction(state,ship),owner=allegiance(ship);
      if(system==null||!owner||government(state,system)!==owner)continue;
      const key=system+':'+owner;
      if(!groups.has(key))groups.set(key,threat(state,system,owner));
      const actor=groups.get(key);if(!actor)continue;
      if(!window.nativeCivilianCombatAI.combatRange(state,ship).range)continue;
      const pose=window.nativeNpcLives?.pose?.(state,ship)||ship,distance=Math.hypot(pose.x-actor.x,pose.y-actor.y);
      const detailed=window.nativeShipDetail.isDetailed(state,ship)&&window.nativeShipDetail.isDetailed(state,actor);
      const held=commitments.get(String(ship.id)),committed=held?.targetId===actor.id;
      const responding=ship.retaliationTargetId===actor.id||ship.factionResponse?.targetId===actor.id;
      if(!detailed&&!committed&&distance>reinforcementRadius)continue;
      // A committed pursuit survives chunk changes. Nearby reserve crews fill
      // genuinely vacant slots; they do not replace a defender that is hunting.
      candidates.push({ship,target:actor,jurisdiction:system,committed,engaged:detailed||committed&&held.engaged,reinforcement:!detailed,score:distance*(responding?.7:1)});
    }
    candidates.sort((a,b)=>Number(b.committed)-Number(a.committed)||Number(a.reinforcement)-Number(b.reinforcement)||a.score-b.score||String(a.ship.id).localeCompare(String(b.ship.id)));
    const next=new Map();let reserves=0;
    for(const order of candidates){
      if(next.size>=responseLimit)break;
      const reserve=order.reinforcement&&!order.engaged;
      if(reserve&&reserves>=reinforcementLimit)continue;
      next.set(String(order.ship.id),order);if(reserve)reserves++;
      // Assigned hunters retain the incident while approaching analytically.
      // The target's jurisdiction boundary ends pursuit; detail culling does not.
      const alert=state.factionDefence?.systems?.[order.jurisdiction],at=seconds(state);
      const entry=alert?.aggressors.find(entry=>entry.id===order.target.id);
      if(entry)entry.until=Math.max(entry.until,at+120);
    }
    if(next.size||state.factionDefence)ensure(state).orders=[...next.values()].map(order=>({shipId:order.ship.id,targetId:order.target.id,system:order.jurisdiction,engaged:order.engaged}));
    plans.set(state,next);return next;
  }
  function engagement(state,ship){
    const order=plan(state).get(String(ship.id));
    return order?target(state,ship):null;
  }
  function clearPlayerAlert(state,system){
    const data=state.factionDefence;if(!data)return;
    const alert=data.systems[system];if(alert)alert.aggressors=alert.aggressors.filter(entry=>entry.id!=='player');
    data.orders=(data.orders||[]).filter(order=>!(order.system===system&&order.targetId==='player'));
    data.revision++;plans.delete(state);passes.delete(state);
  }
  window.nativeFactionDefence=Object.freeze({role,isFaction,allegiance,government,region,playerRegion,sourceId,friendly,hit,target,hostileToPlayer,ordersDue,plan,engagement,responseLimit,reinforcementLimit,clearPlayerAlert});
})();
