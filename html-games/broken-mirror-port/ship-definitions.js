/* Shared ship data and world-space target descriptors. No controller behavior. */
(() => {
  'use strict';
  const overrides=new Map(),definitionCache=new Map();
  const profiles={
    player:{artwork:'flight',disableRatio:.25,dimensions:'flight'},
    tug:{artwork:'showcase',disableRatio:.25,dimensions:'regular-tug',shipType:10},
    civilian:{artwork:'showcase',disableRatio:.25,dimensions:'civilian',displayHeights:{23:22.5,47:72,52:90}}
  };
  const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  // Preserve the established active civilian fleet, then use the recovered
  // flight scale for the remaining classes. These are gameplay units, not metres.
  const displayHeights=Object.freeze({18:11.7,23:22.5,47:72,52:90,58:75});
  const references=new Map((window.VexedFlightReference?.shipSizes||[]).map(s=>[s.id,s]));
  const specialProfiles=new Map();
  function artworkProfile(type){
    type=Number(type);if(overrides.get(type)?.artworkProfile)return overrides.get(type).artworkProfile;const standard=window.starterShips?.get(type);if(standard)return standard;
    if(specialProfiles.has(type))return specialProfiles.get(type);
    const special={56:[254,512,'constitutionTug'],57:[278,512,'tug'],58:[201,512,'olympic'],59:[365,512,'cthia']}[type];
    if(!special)return null;const [width,height,name]=special,effects=window[name+'Effects'];if(!effects)return null;
    const profile={width,height,effects,breakAnchors:window[name+'BreakAnchors'],destruction:window[name+'DestructionConfig'],
      align:(image,stage)=>type===57?window.alignTugFrame(image,stage):type===58?window.alignOlympicFrame(image,stage):image};
    specialProfiles.set(type,profile);return profile;
  }
  function presentation(type){
    type=Number(type);const reference=references.get(type);if(!reference)return null;
    const maximum=Math.max(reference.playerWidth,reference.playerHeight),display=maximum<=100?maximum:100+40*(1-Math.exp(-(maximum-100)/90));
    const profile=artworkProfile(type),ratio=number(profile?.displayRatio)||number(profile?.width)/number(profile?.height,1)||reference.playerWidth/reference.playerHeight;
    const height=displayHeights[type]??reference.playerHeight*display/maximum;
    return {width:height*ratio,height};
  }
  const policies=Object.freeze({medical:{activities:['trade','travel'],supplies:{material:'deuranium',good:7,price:55,low:60,target:200,buy:true,mine:true}},cargo:{activities:['trade','travel']},civilian:{activities:['trade','mining','travel']}});
  // Class differences belong here, never in the identity of the controller.
  const classes={18:{npcPolicy:'civilian',defaultRole:'mining'},23:{npcPolicy:'civilian',defaultRole:'trading'},
    10:{npcPolicy:'cargo'},56:{npcPolicy:'cargo'},57:{npcPolicy:'cargo'},
    58:{slots:{repairDrone:6},npcPolicy:'medical',capabilities:{medical:true}}};
  function validate(definition){
    const errors=[],d=definition.dimensions;
    if(!definition.name)errors.push('Missing ship name');
    for(const key of ['hull','shields','cargo'])if(definition[key]!==undefined&&(!Number.isFinite(definition[key])||definition[key]<0))errors.push('Invalid '+key);
    if(definition.mass!==undefined&&(!(definition.mass>0)||!Number.isFinite(definition.mass)))errors.push('Invalid physical mass');
    if(!definition.renderer&&(!definition.artworkProfile||!(definition.artworkProfile.width>0&&definition.artworkProfile.height>0)))errors.push('Missing artwork profile');
    if(!d||!(d.width>0&&d.height>0)||!Number.isFinite(d.width+d.height))errors.push('Invalid display dimensions');
    for(const [kind,n] of Object.entries(definition.slots))if(!Number.isInteger(n)||n<0||n>64)errors.push('Invalid '+kind+' capacity');
    if(definition.slots.engineering!==1||definition.slots.shield!==1)errors.push('Engineering and shield capacities must each be one');
    if(Array.isArray(definition.artwork.frames)&&definition.artwork.frames.length!==4)errors.push('Four aligned damage frames are required');
    const supply=definition.npcPolicy?.supplies;if(supply&&(!(supply.low>=0&&supply.target>=supply.low)||!Number.isFinite(supply.low+supply.target)||!(supply.price>0)||!Number.isInteger(supply.good)||supply.good<0||supply.good>8))errors.push('Invalid medical supply settings');
    if(!policies[definition.npcPolicy?.name])errors.push('Unknown NPC policy');
    for(const activity of definition.npcPolicy?.activities||[])if(!['trade','mining','travel'].includes(activity))errors.push('Unknown activity '+activity);
    for(const [kind,items] of Object.entries(definition.startingEquipment)){
      if(!Array.isArray(items)||items.length>definition.slots[kind]){errors.push('Starting equipment exceeds '+kind+' capacity');continue;}
      for(const id of items.filter(Boolean))if(window.nativeShipEquipment&&!window.nativeShipEquipment.compatible(kind,id))errors.push('Incompatible starting '+kind+' item '+id);
    }
    for(const [kind,items] of Object.entries(definition.npcStartingEquipment||{})){if(!Array.isArray(items)||items.length+(definition.startingEquipment[kind]?.filter(Boolean).length||0)>definition.slots[kind])errors.push('NPC starting equipment exceeds '+kind+' capacity');else for(const id of items)if(window.nativeShipEquipment&&!window.nativeShipEquipment.compatible(kind,id))errors.push('Incompatible NPC starting equipment');}
    return errors;
  }
  function register(type,data){
    type=Number(type);const previous=overrides.get(type);overrides.set(type,data||{});definitionCache.clear();
    const definition=get(type),errors=validate(definition).filter(e=>references.size||!['Missing ship name','Missing artwork profile','Invalid display dimensions'].includes(e));
    if(errors.length){if(previous)overrides.set(type,previous);else overrides.delete(type);definitionCache.clear();throw new TypeError(errors.join('; '));}
    return definition;
  }
  function get(type,category='player'){
    type=Number(type);const cacheKey=type+':'+category;if(definitionCache.has(cacheKey))return {...definitionCache.get(cacheKey)};
    const stats=window.VexedMirrorWorld.ships.find(ship=>ship.id===type)||{id:type,hull:100,shields:100};
    const custom={...classes[type],...overrides.get(type)},role={...(profiles[category]||profiles.player)};
    const slots={weapon:3,repairDrone:(custom.cargo??stats.cargo)<100?1:2,ability:2,engineering:1,shield:1,...classes[type]?.slots,...custom.slots};
    const initial=custom.equipment||stats.defaultWeapons||[];
    const itemKind=id=>window.VexedMirrorWeapons?.find(w=>w.id===Number(id))?.category||'weapon';
    const policyName=typeof custom.npcPolicy==='string'?custom.npcPolicy:custom.npcPolicy?.name||'civilian';
    const npcPolicy={name:policyName,...policies[policyName],...(typeof custom.npcPolicy==='object'?custom.npcPolicy:{})};
    if(policies[policyName]?.supplies)npcPolicy.supplies={...policies[policyName].supplies,...custom.npcPolicy?.supplies};
    const result={...stats,...custom,id:type,category,profile:role,slots,npcPolicy,
      defaultRole:custom.defaultRole||(policyName==='medical'?'medical':'freight'),artworkProfile:custom.artworkProfile||artworkProfile(type),dimensions:custom.dimensions||presentation(type),
      startingEquipment:{weapon:initial.map(id=>itemKind(id)!=='weapon'?null:id||null),repairDrone:Array.from({length:Number.isInteger(slots.repairDrone)&&slots.repairDrone>=0&&slots.repairDrone<=64?slots.repairDrone:0},()=> 'basic-dot'),ability:initial.filter(id=>itemKind(id)==='ability'),engineering:['standard-engine'],shield:(custom.shields??stats.shields)>0?['standard-shield']:[],...custom.startingEquipment},
      npcStartingEquipment:custom.npcStartingEquipment||{ability:custom.capabilities?.canMine!==false&&(npcPolicy.activities?.includes('mining')||npcPolicy.supplies?.mine)?['mining-laser']:[]},
      artwork:{source:role.artwork,frames:4,...custom.artwork},
      damageStages:custom.damageStages||[.75,.5,.25],
      geometry:{hull:{width:.34,height:.44,minX:8,minY:12},...custom.geometry},
      emitters:custom.emitters||{beam:{x:0,y:-.36},projectile:{x:0,y:-.36}},
      equipment:custom.equipment||stats.defaultWeapons||[],
      statUpgrades:custom.statUpgrades||(type===10?[{levelField:'tugEngineLevel',stat:'speedOrOtherStationValue',base:35,perLevel:15,maxLevel:2}]:[]),
      capabilities:{armed:true,canMine:true,canDock:true,canTrade:true,medical:policyName==='medical',disableRatio:.25,defensiveWeapon:type===47?1:10,...custom.capabilities}};
    result.equipment=result.startingEquipment.weapon;
    result.movement=custom.movement||window.nativeShipMotion?.profiles.manual(result);
    const d=result.dimensions;
    if(d?.width>0&&d?.height>0){result.mass=custom.physical?.mass??custom.mass??Math.max(.5,8*(d.width*d.height/2400)**1.5);const hull=surfaceRadii(d,false,result);result.inertia=custom.physical?.inertia??custom.inertia??Math.max(.01,result.mass*(hull.rx**2+hull.ry**2)/4);}
    result.physical={mass:result.mass,inertia:result.inertia,...custom.physical};
    if(custom.physical?.mass!==undefined)result.mass=custom.physical.mass;
    if(custom.physical?.inertia!==undefined)result.inertia=custom.physical.inertia;
    definitionCache.set(cacheKey,result);return {...result};
  }
  function forEntity(state,entity=state,{category=entity===state?'player':'civilian'}={}){
    const type=Number(entity.shipType??(category==='tug'?10:entity.type??entity.id)),definition=get(type,category);
    for(const upgrade of definition.statUpgrades){const installed=entity.shipEquipment?.instances[entity.shipEquipment.slots.engineering[0]],level=number(entity.shipEquipment?installed?.upgrades?.[upgrade.levelField]:entity[upgrade.levelField]);
      if(level>0)definition[upgrade.stat]=upgrade.base+upgrade.perLevel*Math.min(upgrade.maxLevel??Infinity,level);}
    const effective=window.nativeRegionalMinerals?window.nativeRegionalMinerals.stats(entity,definition):definition;
    if(entity.shipEquipment){
      const fitted=kind=>entity.shipEquipment.slots[kind]?.some(id=>entity.shipEquipment.instances[id]);
      if(!fitted('shield'))effective.shields=0;
      effective.engineOnline=fitted('engineering');
    }
    if(!overrides.get(type)?.movement)effective.movement=window.nativeShipMotion?.profiles.manual(effective);
    if(effective.engineOnline===false&&effective.movement)effective.movement={...effective.movement,maxSpeed:0,acceleration:0,turnRate:0};
    return effective;
  }
  function dimensions(entity,category='player'){
    if(entity.dimensions)return {...entity.dimensions};
    const type=Number(entity.shipType??(category==='tug'?10:entity.type??entity.id)),definition=get(type,category);
    if(typeof definition.dimensions==='function')return definition.dimensions(entity,category);
    if(definition.dimensions?.width&&definition.dimensions?.height)return {...definition.dimensions};
    const shared=presentation(type);if(shared)return shared;
    const role=definition.profile,assets=window.vexedFlightAssets;
    const flight=id=>{const size=assets?.size(id);return size&&assets?.flightDimensions?assets.flightDimensions(size,1):{width:60,height:60};};
    if(role.dimensions==='regular-tug'){const base=flight(type);return {width:base.height*164/512,height:base.height};}
    if(role.dimensions==='civilian'){
      const profile=window.starterShips?.get(type),ratio=number(profile?.displayRatio)||number(profile?.width)/number(profile?.height,1)||1;
      const height=type===18?flight(7).height:role.displayHeights?.[type]||75;
      return {width:height*ratio,height};
    }
    return flight(type);
  }
  function surfaceRadii(d,shielded,definition){
    const shape=definition?.geometry?.[shielded?'shield':'hull'];
    if(shape){
      if(typeof shape==='function')return shape(d);
      if(Number.isFinite(shape.rx)&&Number.isFinite(shape.ry))return {...shape};
      if(shape.width||shape.height)return {rx:Math.max(Math.min(shape.minX||0,d.width*.45),d.width*(shape.width||.34)),
        ry:Math.max(Math.min(shape.minY||0,d.height*.48),d.height*(shape.height||.44))};
    }
    return shielded&&window.showcaseShieldRadii?window.showcaseShieldRadii(d.width,d.height):{rx:Math.max(8,d.width*.34),ry:Math.max(12,d.height*.44)};
  }
  function describe(state,entity=state,{category=entity===state?'player':'civilian'}={}){
    const shipType=Number(entity.shipType??(category==='tug'?10:entity.type??entity.id)),definition=forEntity(state,entity,{category});
    const pose=category==='player'&&state.system===1?window.vexedSolFlight.shipPosition(state):entity;
    const heading=number(category==='player'?entity.angle:entity.heading),d=dimensions(entity,category),speed=number(entity.speed);
    const motion=window.nativeShipMotion?.profiles;
    const configured=definition.movement;
    const movement=typeof configured==='function'?configured(state,entity,definition):configured||motion?.manual(definition);
    return {entity,state,id:category==='player'?'player':category==='tug'?`tug:${entity.id}`:entity.id,
      category,shipType,system:category==='tug'?1:entity.system??state.system,definition:{...definition,movement},
      x:number(pose.x),y:number(pose.y),heading,speed,vx:number(entity.vx,Math.cos(heading)*speed),vy:number(entity.vy,Math.sin(heading)*speed),
      previousX:number(entity.previousX,number(pose.x)),previousY:number(entity.previousY,number(pose.y)),
      angularVelocity:window.nativeShipMotion?.spinSample?.(entity.motionSpin,number(state.shipSimulation?.seconds))?.velocity||0,
      hull:number(entity.hull),shields:number(entity.shields),dimensions:d,radius:Math.max(8,Math.max(d.width,d.height)*.35),
      hullRadii:surfaceRadii(d,false,definition),radii:surfaceRadii(d,entity.shields>0,definition)};
  }
  function stage(descriptor){
    const {entity,definition}=descriptor,fraction=number(entity.hull)/Math.max(1,definition.hull);
    return definition.damageStages.filter(threshold=>fraction<threshold).length;
  }
  const registered=()=>[...new Set([...window.VexedMirrorWorld.ships.map(ship=>Number(ship.id)),...overrides.keys()])].map(type=>get(type));
  window.nativeShipDefinitions=Object.freeze({register,get,forEntity,dimensions,describe,surfaceRadii,stage,profiles,registered,artworkProfile,presentation,policies,validate});
})();
