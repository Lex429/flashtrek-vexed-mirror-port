/* One saved firing lifecycle for every controller and physical target. */
(() => {
  'use strict';
  const styles=new Map(),states=new Set(),runtime=new WeakMap();
  const rules=window.nativeWeaponRules;
  let units=window.showcaseWeaponAppearance.units,sceneProvider=null;
  const blocked=()=>window.nativeSimulation?.blocked?.()||document.hidden||window.nativePause?.active||window.nativeShipInventory?.active;
  const now=state=>window.nativeSimulation?.seconds(state)??combatState(state).clock;
  const duration=kind=>kind==='beam'?180:kind==='torpedo'?560:360;
  const hitDelay=shot=>shot.kind==='beam'?70:shot.duration;
  function setVisualCatalog(data,catalog){
    if(!Object.values(data.weapons||{}).some(entries=>entries.length))return false;
    styles.clear();units=Number(catalog.units)||window.showcaseWeaponAppearance.units;
    for(const [kind,entries] of Object.entries(data.weapons||{}))for(const style of entries)styles.set(Number(style.id),{...style,kind});
    return true;
  }
  const ready=Promise.all(['combat-data.json?v=weapon-independent-1','catalog.json?v=tug-ii-a-anim-3'].map(file=>fetch('../flashtrek-broken-mirror/showcase-assets/'+file).then(response=>{if(response.ok===false)throw Error('Showcase weapon data unavailable');return response.json();})))
    .then(([data,catalog])=>setVisualCatalog(data,catalog)).catch(error=>{console.warn('Showcase weapon styles unavailable',error);return false;});
  function weaponVisual(weapon){
    const style=styles.get(Number(weapon.id));
    const kind=style?.kind||(/torpedo|launcher/i.test(weapon.name)?'torpedo':/disruptor|cannon|turrent|turret|pulse/i.test(weapon.name)?'disruptor':'beam');
    return {kind,style:style||null,units};
  }
  function combatState(state){
    if(!state.weaponCombat||![1,2].includes(state.weaponCombat.version))state.weaponCombat={version:2,clock:0,nextSlot:0,weaponReadyAt:{},events:[],nextEventId:1};
    const combat=state.weaponCombat;
    combat.version=2;combat.events||=[];combat.nextEventId||=1;combat.clock=Number(combat.clock)||0;
    states.add(state);return combat;
  }
  function cache(state){if(!runtime.has(state))runtime.set(state,new Map());return runtime.get(state);}
  function snapshot(target){
    const result={};
    for(const key of ['id','category','shipType','system','x','y','heading','speed','vx','vy','previousX','previousY','hull','shields','targetable','rockId','slotId','size','radius'])if(target?.[key]!=null&&typeof target[key]!=='function')result[key]=target[key];
    for(const key of ['dimensions','radii'])if(target?.[key])result[key]={...target[key]};
    return result;
  }
  function player(state){
    if(window.nativeShipDefinitions)return window.nativeShipDefinitions.describe(state,state,{category:'player'});
    const position=state.system===1?window.vexedSolFlight.shipPosition(state):state;
    return {id:'player',category:'player',system:state.system,x:position.x,y:position.y,heading:state.angle,speed:state.speed||0,hull:state.hull,shields:state.shields};
  }
  function scene(state,system=state.system){
    return sceneProvider?.(state,{system})||window.nativeShipSystems?.scene(state,{system})||window.nativeCivilianTraffic?.combatScene(state,{system})||{bystanders:[],rocks:[]};
  }
  function resolve(state,id,system){
    if(window.nativeShipSystems)return window.nativeShipSystems.resolve(state,id,system);
    if(id==='player')return state.system===system&&state.hull!==0?player(state):null;
    const scenery=scene(state,system);
    return [...(scenery.bystanders||[]),...(scenery.destructibles||[]),...(scenery.rocks||[]).map(rock=>({...rock,id:rock.id??'rock:'+rock.slotId,rockId:rock.slotId,category:'asteroid'}))].find(target=>String(target.id)===String(id))||null;
  }
  function describe(state,ship){
    if(ship?.entity)return ship;
    if(ship===state||ship?.id==='player')return player(state);
    if(window.nativeShipDefinitions&&ship?.shipType)return window.nativeShipDefinitions.describe(state,ship,{category:ship.category||'civilian'});
    return {...ship,heading:ship?.heading??ship?.angle??0};
  }
  function dimensions(target,adapter){
    return adapter?.(target)||target?.dimensions||{width:Math.max(16,(target?.radius||15)*2),height:Math.max(24,(target?.radius||15)*2)};
  }
  function radii(target,d,shielded){
    return window.nativeShipDefinitions?.surfaceRadii(d,shielded,target.definition)||(shielded?window.showcaseShieldRadii(d.width,d.height):{rx:Math.max(8,d.width*.34),ry:Math.max(12,d.height*.44)});
  }
  function fitTarget(target,entry){
    const d=dimensions(target,entry?.dimensions),shielded=entry?.shielded?entry.shielded(target):Number(target.shields)>0;
    return {...target,dimensions:d,radii:target.rockId!=null?undefined:radii(target,d,shielded),surfaceShielded:shielded};
  }
  function arm(state,time,eligible=()=>true,{holder=state,defaults,selection}={}){
    combatState(state);const clock=time==null?now(state):time/1000,loadouts=window.nativeWeaponLoadout;
    if(!loadouts)return {ok:false,error:'Shared weapon equipment is unavailable.'};
    const loadout=loadouts.ensure(state,holder,defaults),fitted=loadouts.equipped(state,holder,defaults);
    const choices=selection?(Array.isArray(selection)?selection:[selection]).map(choice=>{
      const slot=choice.slot??fitted.find(item=>choice.instance?item.instance?.id===choice.instance.id:item.weapon.id===(choice.weapon?.id??choice.modelId??choice.id))?.slot;
      return fitted.find(item=>item.slot===slot);
    }).filter(Boolean):fitted;
    if(!choices.some(item=>item.weapon.damage>0))return {ok:false,error:'This ship has no damaging weapon equipped.'};
    let available=false,visible=false;
    for(let offset=0;offset<choices.length;offset++){
      const index=selection?offset:(loadout.nextSlot+offset)%choices.length;
      const {weapon,slot,instance}=choices[index];if(!(weapon.damage>0))continue;
      const visual=weaponVisual(weapon);if(!visual.style)continue;visible=true;
      if(!loadouts.ready(instance,clock))continue;available=true;
      const damageMultiplier=window.nativeShipDefinitions?.forEntity(state,holder,{category:holder===state?'player':'civilian'}).weaponDamageMultiplier||1;
      const spec=rules.weaponSpec(weapon,visual.kind,{damageMultiplier});
      if(!eligible(spec,visual.kind,weapon,slot))continue;
      loadouts.consume(instance,spec,clock);loadout.nextSlot=(index+1)%choices.length;
      return {ok:true,weapon,slot,instance,spec,...visual};
    }
    return {ok:false,error:!visible?'Weapon visuals are unavailable or still loading.':available?'Target is out of range, outside the firing arc, or blocked.':'All fitted weapons are recharging.'};
  }
  function applyHit(state,result,event,source){
    if(window.nativeShipSystems)return window.nativeShipSystems.applyHit(state,result,event,source);
    const target=result.target;if(!target)return {ok:false};
    const impact={from:result.from||result.point,point:result.point,contact:result.contact,collision:result,kind:event.kind,source:source.id==='player'?'player':'ai',sourceId:source.id};
    if(target.rockId!=null)return window.nativeAsteroidCombat?.hit(state,target.rockId,event.damage,impact)||{ok:false};
    if(target.id==='player')return window.nativeCombatShots.onPlayerHit?.(state,event.damage,impact)||{ok:false};
    if(String(target.id).startsWith('tug:'))return window.nativeSolEconomy?.hit(state,Number(String(target.id).slice(4)),event.damage,impact)||{ok:false};
    if(target.category==='civilian'||typeof target.id==='number')return window.nativeCivilianTraffic.hit(state,target.id,event.damage,impact);
    return target.onHit?.(event.damage,impact)||{ok:false};
  }
  function emitterLocal(ship,kind,shipHeight){
    const d=ship.dimensions||{width:shipHeight,height:shipHeight},point=ship.definition?.emitters?.[kind==='beam'?'beam':'projectile'];
    return point?{x:point.x*d.width,y:point.y*d.height}:{x:0,y:-shipHeight*.36};
  }
  function fireFor(options){
    const {state,getTarget,owner,onHit,onResolved}=options;
    if(blocked()||window.vexedWarp?.active&&(!options.shooter||options.shooter.id==='player'))return {ok:false,error:'Resume flight before firing.'};
    const shooter=describe(state,options.getSource?.()||options.shooter||player(state)),target=getTarget?.()||options.target;
    if(!target)return {ok:false,error:'Target unavailable.'};
    if(shooter.definition?.capabilities?.armed===false)return {ok:false,error:'This ship cannot fire weapons.'};
    if(shooter.entity?.hull<=0||shooter.hull===0)return {ok:false,error:'This ship is destroyed.'};
    const system=shooter.system??state.system,holder=shooter.id==='player'?state:shooter.entity||options.shooter||shooter;
    const defaults=options.defaults||shooter.definition?.equipment||window.VexedMirrorWorld?.ships?.find(item=>item.id===Number(shooter.shipType))?.defaultWeapons;
    const scenery=scene(state,system),armed=arm(state,undefined,(spec,kind)=>rules.firingSolution(shooter,target,spec,kind,scenery),{holder,defaults,selection:options.weaponInstance?{instance:options.weaponInstance}:options.selection});
    if(!armed.ok)return armed;
    const combat=combatState(state),clock=now(state),height=options.shipHeight??shooter.dimensions?.height??0;
    const event=rules.startShot(armed.weapon,armed.kind,shooter,target,clock,height*.36);
    Object.assign(event,{id:combat.nextEventId++,system,owner:owner||shooter.category||'ship',weaponId:armed.weapon.id,weaponInstanceId:armed.instance?.id,
      weapon:{...armed.weapon},slot:armed.slot,sourceSnapshot:snapshot(shooter),targetSnapshot:snapshot(target),emitter:emitterLocal(shooter,armed.kind,height),resolved:false});
    const muzzle=rules.emitter(shooter,event);
    if(event.projectile){event.x=muzzle.x;event.y=muzzle.y;}else{event.from=muzzle;const angle=Math.atan2(target.y-muzzle.y,target.x-muzzle.x);event.beamHeadingOffset=rules.wrap(angle-shooter.heading);event.beamEnd={x:muzzle.x+Math.cos(angle)*event.spec.range,y:muzzle.y+Math.sin(angle)*event.spec.range};}
    const entry={getSource:options.getSource,getTarget,dimensions:options.dimensions,shielded:options.shielded,onHit,onResolved};
    cache(state).set(event.id,entry);combat.events.push(event);
    const shot=visualFor(state,event,entry);return {ok:true,weapon:armed.weapon.name,kind:armed.kind,shot,event};
  }
  function fire(options){return fireFor({...options,shooter:player(options.state)});}
  function liveSource(state,event,entry){
    return describe(state,entry?.getSource?.()||resolve(state,event.sourceId,event.system)||event.sourceSnapshot);
  }
  function liveTarget(state,event,entry){
    const supplied=entry?.getTarget?.();
    if(supplied)return supplied;
    // An explicit getter returning null is authoritative (target destroyed or left).
    return entry?.getTarget?null:resolve(state,event.targetId,event.system);
  }
  function visualFor(state,event,entry=cache(state).get(event.id)){
    entry||={};if(!cache(state).has(event.id))cache(state).set(event.id,entry);
    if(entry.shot)return entry.shot;
    const ship=liveSource(state,event,entry),visual=weaponVisual(event.weapon||window.VexedMirrorWeapons?.find(item=>item.id===event.weaponId)||{name:event.kind});
    const shot=create({state,ship,shipHeight:Math.abs(event.emitter?.y??event.muzzle??0)/.36,target:event.targetSnapshot,...visual});
    shot.kind=event.kind;shot.system=event.system;shot.event=event;shot.emitter=event.emitter;
    shot.clock=()=>now(state);shot.startedAt=event.launchedAt;shot.getSource=()=>liveSource(state,event,entry);
    if(event.projectile)shot.projectile=event;
    else shot.targetPoint=from=>{
      if(event.contact){const target=resolve(state,event.hitTargetId,event.system)||event.hitTargetSnapshot;return target?worldPoint(target,event.contact.local):event.contact.world;}
      if(event.resolved)return event.point||event.beamEnd;
      // Preview through the same pure collision query; painting never resolves a hit.
      const source=liveSource(state,event,entry),angle=(source.heading||0)+(event.beamHeadingOffset||0);
      const to={x:from.x+Math.cos(angle)*event.spec.range,y:from.y+Math.sin(angle)*event.spec.range};
      const target=fitTarget(liveTarget(state,event,entry)||{...event.targetSnapshot,targetable:false},entry);
      return rules.firstContact(from,to,source,target,scene(state,event.system),target.radii,target.dimensions)?.point||to;
    };
    entry.shot=shot;return shot;
  }
  function importEvent(state,legacy,{system=state.system,owner='civilian'}={}){
    if(!legacy||legacy.alive===false)return null;
    const combat=combatState(state),event=JSON.parse(JSON.stringify({...legacy,sourceSnapshot:snapshot(legacy.sourceSnapshot),targetSnapshot:snapshot(legacy.targetSnapshot)}));
    const oldClock=(state.shipSimulation?.legacyClocks?.civilian??Number(state.civilianTraffic?.clock))||0,offset=now(state)-oldClock;
    for(const key of ['launchedAt','dueAt'])if(Number.isFinite(event[key]))event[key]+=offset;
    Object.assign(event,{id:combat.nextEventId++,system,owner,resolved:false,weapon:event.weapon||{...window.VexedMirrorWeapons?.find(item=>item.id===event.weaponId),damage:event.damage}});
    event.sourceSnapshot.id??=event.sourceId;event.targetSnapshot.id??=event.targetId;
    event.spec||=rules.weaponSpec(event.weapon,event.kind);
    if(!event.projectile&&event.beamHeadingOffset==null&&event.from&&event.beamEnd)event.beamHeadingOffset=rules.wrap(Math.atan2(event.beamEnd.y-event.from.y,event.beamEnd.x-event.from.x)-(event.sourceSnapshot.heading||0));
    combat.events.push(event);return event;
  }
  function migrate(state){
    const combat=combatState(state);
    if(combat.legacyEventsMigrated)return combat;
    window.nativeSimulation?.ensure(state);
    for(const conflict of [...(state.civilianTraffic?.disputes||[]),...(state.civilianTraffic?.retaliations||[])]){
      for(const event of conflict.pending||[])importEvent(state,event,{system:conflict.system,owner:conflict.id});conflict.pending=[];
    }
    for(const stray of state.civilianTraffic?.strayShots||[])importEvent(state,stray.event,{system:stray.system});
    if(state.civilianTraffic)state.civilianTraffic.strayShots=[];
    combat.legacyEventsMigrated=true;return combat;
  }
  function advance(state,dt){
    const combat=migrate(state);
    if(!Number.isFinite(dt)||dt<=0||blocked())return;
    if(!window.nativeSimulation)combat.clock+=dt;else combat.clock=now(state);
    for(const event of [...combat.events]){
      if(event.cancelled||event.resolved)continue;
      if(event.sourceId==='player'&&(event.system!==state.system||window.vexedWarp?.active)){event.cancelled=true;event.alive=false;continue;}
      const entry=cache(state).get(event.id),sourceShip=liveSource(state,event,entry),current=liveTarget(state,event,entry);
      const target=fitTarget(current||{...event.targetSnapshot,targetable:false},entry);
      if(current)event.targetSnapshot=snapshot(current);
      const result=rules.stepShot(event,sourceShip,target,scene(state,event.system),now(state),dt,target.radii,target.dimensions);
      if(!result)continue;
      event.resolved=true;event.alive=false;event.resolvedAt=now(state);event.point=result.point;
      if(result.kind==='hit'){
        event.hitTargetId=result.target.id;event.hitTargetSnapshot=snapshot(result.target);event.contact=result.contact;
        const shot=visualFor(state,event,entry);
        shot.lockedImpactLocal=result.contact?.local;
        if(entry?.onHit&&current&&String(result.target.id)===String(current.id))result.damage=entry.onHit(event.weapon,result.point,shot,result);
        else result.damage=applyHit(state,result,event,sourceShip);
        window.nativeShipSystems?.invalidate?.(state,event.system);
      }
      entry?.onResolved?.(result,event,visualFor(state,event,entry));
      window.nativeShipSystems?.resolved?.(state,result,event);
      window.nativeCombatShots.onResolved?.(state,result,event);
    }
    combat.events=combat.events.filter(event=>{
      const visible=!event.cancelled&&(event.projectile?event.alive:now(state)<event.launchedAt+duration(event.kind)/1000);
      if(!visible)cache(state).delete(event.id);return visible;
    });
  }
  function cancel(owner){
    for(const state of states){const combat=combatState(state);for(const event of combat.events)if(!owner||event.owner===owner){event.cancelled=true;event.alive=false;const shot=cache(state).get(event.id)?.shot;if(shot)shot.cancelled=true;}combat.events=combat.events.filter(event=>!event.cancelled);}
  }
  function reset(){cancel();for(const state of states)runtime.delete(state);states.clear();}
  function age(shot,time=performance.now()){return shot.clock?(shot.clock()-shot.startedAt)*1000:time-shot.born;}
  function isVisible(shot,time=performance.now()){return !shot.cancelled&&!shot.event?.cancelled&&(shot.projectile?shot.projectile.alive:age(shot,time)<shot.duration);}
  function create({state,ship,shipHeight,target,kind,style,units:visualUnits=units,spin,spinSpeed,shooter=null,now:time=performance.now()}){
    const muzzleOffset=shipHeight*.36,heading=shooter?.heading??ship.heading??state.angle??0;
    return {...window.createShowcaseWeaponVisual({kind,style,units:visualUnits,spin,spinSpeed}),born:time,target,shooter,muzzleOffset,duration:duration(kind),from:{x:ship.x+Math.cos(heading)*muzzleOffset,y:ship.y+Math.sin(heading)*muzzleOffset}};
  }
  function source(shot,state,ship){
    const firingShip=shot.getSource?.()||shot.shooter||ship,heading=firingShip.heading??state.angle??0;
    return shot.kind==='beam'?rules.emitter({...firingShip,heading},{muzzle:shot.muzzleOffset,emitter:shot.emitter}):shot.from;
  }
  function worldPoint(target,local){
    const angle=target.rockId!=null?0:(target.heading||0)+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    return {x:target.x+local.x*c-local.y*s,y:target.y+local.x*s+local.y*c};
  }
  function contact(target,from,d,shielded){
    const shape=radii(target,d,shielded),angle=(target.heading||0)+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),dx=from.x-target.x,dy=from.y-target.y;
    let lx=dx*c+dy*s,ly=-dx*s+dy*c;if(Math.hypot(lx,ly)<.001){lx=0;ly=-1;}
    const scale=.96/Math.hypot(lx/shape.rx,ly/shape.ry),length=Math.hypot(lx,ly),local={x:lx*scale,y:ly*scale};
    return {local,world:worldPoint(target,local),dx:-lx/length,dy:-ly/length,from:{...from},shielded,radii:shape,dimensions:{...d}};
  }
  function paint(ctx,shot,{state,ship,cx,cy,zoom=1,now:time=performance.now()}){
    if(!isVisible(shot,time))return false;
    if(shot.projectile){const projectile=shot.projectile;window.paintShowcaseWeaponShot(ctx,shot,{screenPixels:true,x:cx+(projectile.x-ship.x)*zoom,y:cy+(projectile.y-ship.y)*zoom,angle:Math.atan2(projectile.vy,projectile.vx)},projectile.age*1000);return true;}
    const elapsed=age(shot,time),from=source(shot,state,ship),to=shot.targetPoint?.(from)||shot.target;
    if(!to)return false;
    const x1=cx+(from.x-ship.x)*zoom,y1=cy+(from.y-ship.y)*zoom,x2=cx+(to.x-ship.x)*zoom,y2=cy+(to.y-ship.y)*zoom;
    if(shot.kind==='beam')window.paintShowcaseWeaponShot(ctx,shot,{screenPixels:true,x1,y1,x2,y2},elapsed);
    else{const progress=Math.min(1,elapsed/shot.duration);window.paintShowcaseWeaponShot(ctx,shot,{screenPixels:true,x:x1+(x2-x1)*progress,y:y1+(y2-y1)*progress,angle:Math.atan2(y2-y1,x2-x1)},elapsed);}
    return true;
  }
  function paintAll(ctx,view){
    for(const event of combatState(view.state).events)if(event.system===view.state.system)paint(ctx,visualFor(view.state,event),view);
  }
  window.nativeCombatShots={arm,fire,fireFor,advance,cancel,isVisible,create,source,paint,paintAll,hitDelay,weaponVisual,reset,contact,worldPoint,ready,setVisualCatalog,applyHit,
    scene,configureScene:provider=>{sceneProvider=provider;},importEvent,migrate,restore:migrate,snapshot,isReady:()=>styles.size>0};
})();
