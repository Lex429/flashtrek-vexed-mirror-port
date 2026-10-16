/* Shared ship data and world-space target descriptors. No controller behavior. */
(() => {
  'use strict';
  const overrides=new Map();
  const profiles={
    player:{artwork:'flight',disableRatio:0,dimensions:'flight'},
    tug:{artwork:'showcase',disableRatio:.25,dimensions:'regular-tug',shipType:10,capabilities:{armed:false,canMine:false}},
    civilian:{artwork:'showcase',disableRatio:.25,dimensions:'civilian',displayHeights:{23:22.5,47:72,52:90}}
  };
  const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  function register(type,data){overrides.set(Number(type),data||{});return get(type);}
  function get(type,category='player'){
    type=Number(type);
    const stats=window.VexedMirrorWorld.ships.find(ship=>ship.id===type)||{id:type,hull:100,shields:100};
    const custom=overrides.get(type)||{},role={...(profiles[category]||profiles.player),...(custom.profiles?.[category]||{})};
    return {...stats,...custom,id:type,category,profile:role,
      artwork:{source:role.artwork,frames:4,...custom.artwork},
      damageStages:custom.damageStages||[.75,.5,.25],
      geometry:{hull:{width:.34,height:.44,minX:8,minY:12},...custom.geometry},
      emitters:custom.emitters||{beam:{x:0,y:-.36},projectile:{x:0,y:-.36}},
      equipment:custom.equipment||stats.defaultWeapons||[],
      statUpgrades:custom.statUpgrades||(type===10?[{levelField:'tugEngineLevel',stat:'speedOrOtherStationValue',base:35,perLevel:15,maxLevel:2}]:[]),
      capabilities:{armed:true,canMine:true,canDock:true,canTrade:true,disableRatio:role.disableRatio,defensiveWeapon:type===47?1:10,...custom.capabilities,...role.capabilities}};
  }
  function forEntity(state,entity=state,{category=entity===state?'player':'civilian'}={}){
    const type=Number(entity.shipType??(category==='tug'?10:entity.type??entity.id)),definition=get(type,category);
    for(const upgrade of definition.statUpgrades){const level=number(entity[upgrade.levelField]);
      if(level>0)definition[upgrade.stat]=upgrade.base+upgrade.perLevel*Math.min(upgrade.maxLevel??Infinity,level);}
    return definition;
  }
  function dimensions(entity,category='player'){
    if(entity.dimensions)return {...entity.dimensions};
    const type=Number(entity.shipType??(category==='tug'?10:entity.type??entity.id)),definition=get(type,category);
    if(typeof definition.dimensions==='function')return definition.dimensions(entity,category);
    if(definition.dimensions?.width&&definition.dimensions?.height)return {...definition.dimensions};
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
      if(shape.width||shape.height)return {rx:Math.max(shape.minX||0,d.width*(shape.width||.34)),ry:Math.max(shape.minY||0,d.height*(shape.height||.44))};
    }
    return shielded&&window.showcaseShieldRadii?window.showcaseShieldRadii(d.width,d.height):{rx:Math.max(8,d.width*.34),ry:Math.max(12,d.height*.44)};
  }
  function describe(state,entity=state,{category=entity===state?'player':'civilian'}={}){
    const shipType=Number(entity.shipType??(category==='tug'?10:entity.type??entity.id)),definition=forEntity(state,entity,{category});
    const pose=category==='player'&&state.system===1?window.vexedSolFlight.shipPosition(state):entity;
    const heading=number(category==='player'?entity.angle:entity.heading),d=dimensions(entity,category),speed=number(entity.speed);
    const motion=window.nativeShipMotion?.profiles;
    const configured=definition.profile.movement??definition.movement;
    const movement=typeof configured==='function'?configured(state,entity,definition):configured||(category==='tug'?motion?.tug():category==='civilian'?motion?.civilian(definition):motion?.manual(definition));
    return {entity,state,id:category==='player'?'player':category==='tug'?`tug:${entity.id}`:entity.id,
      category,shipType,system:category==='tug'?1:entity.system??state.system,definition:{...definition,movement},
      x:number(pose.x),y:number(pose.y),heading,speed,vx:number(entity.vx,Math.cos(heading)*speed),vy:number(entity.vy,Math.sin(heading)*speed),
      previousX:number(entity.previousX,number(pose.x)),previousY:number(entity.previousY,number(pose.y)),
      hull:number(entity.hull),shields:number(entity.shields),dimensions:d,radius:Math.max(8,Math.max(d.width,d.height)*.35),
      radii:surfaceRadii(d,entity.shields>0,definition)};
  }
  function stage(descriptor){
    const {entity,definition}=descriptor,fraction=number(entity.hull)/Math.max(1,definition.hull);
    return definition.damageStages.filter(threshold=>fraction<threshold).length;
  }
  const registered=()=>[...new Set([...window.VexedMirrorWorld.ships.map(ship=>Number(ship.id)),...overrides.keys()])].map(type=>get(type));
  window.nativeShipDefinitions=Object.freeze({register,get,forEntity,dimensions,describe,surfaceRadii,stage,profiles,registered});
})();
