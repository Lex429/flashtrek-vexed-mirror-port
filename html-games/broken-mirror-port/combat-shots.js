/* One saved firing lifecycle for every controller and physical target. */
(() => {
  'use strict';
  const styles=new Map(),states=new Set(),runtime=new WeakMap(),awareness=new WeakMap(),shotIndexes=new WeakMap();
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
  function collisionScene(state,system=state.system){
    return sceneProvider?.(state,{system})||window.nativeShipSystems?.collisionScene?.(state,{system})||scene(state,system);
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
    return target?.dimensions||adapter?.(target)||{width:Math.max(16,(target?.radius||15)*2),height:Math.max(24,(target?.radius||15)*2)};
  }
  function radii(target,d,shielded){
    return window.nativeShipDefinitions?.surfaceRadii(d,shielded,target.definition)||(shielded?window.showcaseShieldRadii(d.width,d.height):{rx:Math.max(8,d.width*.34),ry:Math.max(12,d.height*.44)});
  }
  function fitTarget(target,entry){
    const d=dimensions(target,entry?.dimensions),shielded=target.rockId!=null?false:target.shields!=null?Number(target.shields)>0:!!entry?.shielded?.(target);
    return {...target,dimensions:d,radii:target.rockId!=null?undefined:radii(target,d,shielded),surfaceShielded:shielded};
  }
  function choicesFor(fitted,selection){
    return selection?(Array.isArray(selection)?selection:[selection]).map(choice=>{
      const slot=choice.slot??fitted.find(item=>choice.instance?item.instance?.id===choice.instance.id:item.weapon.id===(choice.weapon?.id??choice.modelId??choice.id))?.slot;
      return fitted.find(item=>item.slot===slot);
    }).filter(Boolean):fitted;
  }
  function effectiveSpec(state,holder,weapon,kind){
    const damageMultiplier=window.nativeShipDefinitions?.forEntity(state,holder,{category:holder===state?'player':'civilian'}).weaponDamageMultiplier||1;
    return rules.weaponSpec(weapon,kind,{damageMultiplier});
  }
  function firingStatus(state,source,target,{holder,defaults,selection}={}){
    source=describe(state,source||player(state));holder||=source.id==='player'?state:source.entity||source;
    const result={ok:false,reason:'unavailable',message:'Target unavailable.',weapons:[],maxRange:0,range:0,remaining:0,distance:target?Math.hypot(target.x-source.x,target.y-source.y):0};
    const finish=(reason,message)=>({...result,reason,message,error:message,ok:reason==='ready'});
    const validTarget=target&&target.targetable!==false&&(target.system??source.system)===source.system;
    if(source.hull===0||source.entity?.hull<=0)return finish('destroyed','This ship is destroyed.');
    if(source.entity?.phase==='disabled')return finish('disabled','Weapons disabled during hull repair.');
    if(source.definition?.capabilities?.armed===false)return finish('unarmed','This ship cannot fire weapons.');
    const loadouts=window.nativeWeaponLoadout;if(!loadouts)return finish('no-weapons','Shared weapon equipment is unavailable.');
    defaults||=source.definition?.equipment;
    const fitted=choicesFor(loadouts.equipped(state,holder,defaults),selection),clock=now(state),scenery=collisionScene(state,source.system??state.system);
    result.weapons=fitted.filter(item=>item.weapon.damage>0).map(item=>{
      const visual=weaponVisual(item.weapon),spec=effectiveSpec(state,holder,item.weapon,visual.kind),eligible=validTarget?rules.firingStatus(source,target,spec,visual.kind,scenery):{ok:false,reason:'unavailable',inRange:false,inArc:false};
      const remaining=Math.max(0,(Number(item.instance.readyAt)||0)-clock),ready=loadouts.ready(item.instance,clock);
      return {...item,kind:visual.kind,spec,inRange:eligible.inRange,inArc:eligible.inArc,canReach:eligible.ok,ready,remaining,
        reason:!visual.style?'visuals':!eligible.ok?eligible.reason:!ready?'recharge':'ready'};
    });
    result.maxRange=result.range=Math.max(0,...result.weapons.map(item=>item.spec.range));
    if(!validTarget)return finish('unavailable','Target unavailable.');
    if(!result.weapons.length)return finish('no-weapons','This ship has no damaging weapon equipped.');
    if(result.weapons.some(item=>item.reason==='ready'))return finish('ready','Ready to fire.');
    const reachable=result.weapons.filter(item=>item.canReach&&item.reason!=='visuals');
    if(reachable.length){result.remaining=Math.min(...reachable.map(item=>item.remaining));return finish('recharge',`Weapons in range are recharging (${result.remaining.toFixed(1)} s).`);}
    if(result.weapons.every(item=>item.reason==='visuals'))return finish('visuals','Weapon visuals are unavailable or still loading.');
    if(result.weapons.every(item=>!item.inRange))return finish('range',`Out of range. Fitted weapons reach up to ${result.maxRange} units.`);
    if(result.weapons.some(item=>item.reason==='blocked'))return finish('blocked','Projectile firing line is blocked.');
    return finish('arc','Target is outside the firing arc of weapons in range.');
  }
  function threats(state,ship,{horizon=.9,reaction=.15,limit=8}={}){
    const target=describe(state,ship),events=state.weaponCombat?.events||[],clock=now(state);
    horizon=Math.max(.05,Math.min(1.2,Number(horizon)||.9));limit=Math.max(1,Math.min(8,Number(limit)||8));
    const scanned=Math.min(256,events.length),start=events.length>256?(Math.floor(clock*10)*256)%events.length:0,candidates=[];
    const vx=Number(target.vx)||0,vy=Number(target.vy)||0,radius=Math.max(target.radii?.rx||0,target.radii?.ry||0,target.radius||15);
    for(let offset=0;offset<scanned;offset++){
      const event=events[(start+offset)%events.length];
      if(!event.projectile||!event.alive||event.resolved||event.cancelled||event.system!==target.system||String(event.sourceId)===String(target.id)||clock-event.launchedAt<reaction)continue;
      const dx=event.x-target.x,dy=event.y-target.y,rvx=event.vx-vx,rvy=event.vy-vy,speed2=rvx*rvx+rvy*rvy;
      if(!(speed2>0))continue;
      const approach=-(dx*rvx+dy*rvy)/speed2,closest=Math.min(horizon,approach);
      if(approach<0||(dx+rvx*closest)**2+(dy+rvy*closest)**2>(radius+(event.radius||0))**2)continue;
      candidates.push({event,closest,distance:Math.hypot(dx,dy)});
    }
    candidates.sort((a,b)=>a.closest-b.closest);
    const scenery=candidates.length?collisionScene(state,target.system):null,results=[];
    let narrow=0;
    for(const candidate of candidates.slice(0,16)){
      narrow++;const hit=rules.projectileThreat(candidate.event,target,scenery,horizon);if(!hit)continue;
      const event=candidate.event;
      results.push({id:event.id,sourceId:event.sourceId,targetId:event.targetId,kind:event.kind,x:event.x,y:event.y,vx:event.vx,vy:event.vy,distance:candidate.distance,...hit});
    }
    awareness.set(state,{scanned,narrow,candidates:candidates.length});
    return results.sort((a,b)=>a.timeToImpact-b.timeToImpact).slice(0,limit);
  }
  function hasActiveProjectiles(state,system=state.system){
    const events=state.weaponCombat?.events||[],count=Math.min(256,events.length),start=events.length>256?(Math.floor(now(state)*10)*256)%events.length:0;
    for(let offset=0;offset<count;offset++){
      const event=events[(start+offset)%events.length];
      if(event.projectile&&event.alive&&!event.cancelled&&!event.resolved&&event.system===system)return true;
    }
    return false;
  }
  function activeProjectile(state,id){
    const events=state.weaponCombat?.events||[];
    let index=shotIndexes.get(state);
    if(!index||index.events!==events||index.count!==events.length){index={events,count:events.length,byId:new Map(events.map(event=>[String(event.id),event]))};shotIndexes.set(state,index);}
    const event=index.byId.get(String(id));
    return event?.projectile&&event.alive&&!event.cancelled&&!event.resolved?{id:event.id,system:event.system,sourceId:event.sourceId,targetId:event.targetId,
      x:event.x,y:event.y,vx:event.vx,vy:event.vy,launchedAt:event.launchedAt,age:event.age,ttl:event.ttl,kind:event.kind}:null;
  }
  function arm(state,time,eligible=()=>true,{holder=state,defaults,selection}={}){
    combatState(state);const clock=time==null?now(state):time/1000,loadouts=window.nativeWeaponLoadout;
    if(!loadouts)return {ok:false,error:'Shared weapon equipment is unavailable.'};
    const loadout=loadouts.ensure(state,holder,defaults),fitted=loadouts.equipped(state,holder,defaults);
    const choices=choicesFor(fitted,selection);
    if(!choices.some(item=>item.weapon.damage>0))return {ok:false,error:'This ship has no damaging weapon equipped.'};
    let available=false,visible=false;
    for(let offset=0;offset<choices.length;offset++){
      const index=selection?offset:(loadout.nextSlot+offset)%choices.length;
      const {weapon,slot,instance}=choices[index];if(!(weapon.damage>0))continue;
      const visual=weaponVisual(weapon);if(!visual.style)continue;visible=true;
      if(!loadouts.ready(instance,clock))continue;available=true;
      const spec=effectiveSpec(state,holder,weapon,visual.kind);
      if(!eligible(spec,visual.kind,weapon,slot))continue;
      loadouts.consume(instance,spec,clock);loadout.nextSlot=(index+1)%choices.length;if(holder.shipEquipment)holder.shipEquipment.nextSlot=loadout.nextSlot;
      return {ok:true,weapon,slot,instance,spec,...visual};
    }
    return {ok:false,error:!visible?'Weapon visuals are unavailable or still loading.':available?'Target is out of range, outside the firing arc, or blocked.':'All fitted weapons are recharging.'};
  }
  function applyHit(state,result,event,source){
    if(window.nativeShipSystems)return window.nativeShipSystems.applyHit(state,result,event,source);
    const target=result.target;if(!target)return {ok:false};
    const impact={from:result.from||result.point,point:result.point,contact:result.contact,collision:result,kind:event.kind,weaponEventId:event.id,source:source.id==='player'?'player':'ai',sourceId:source.id};
    if(target.rockId!=null)return window.nativeAsteroidCombat?.weaponHit(state,target.rockId,event.damage,impact)||{ok:false};
    if(target.id==='player')return window.nativeCombatShots.onPlayerHit?.(state,event.damage,impact)||{ok:false};
    if(String(target.id).startsWith('tug:'))return window.nativeSolEconomy?.hit(state,Number(String(target.id).slice(4)),event.damage,impact)||{ok:false};
    if(target.category==='civilian'||typeof target.id==='number')return window.nativeCivilianTraffic.hit(state,target.id,event.damage,impact);
    return target.onHit?.(event.damage,impact)||{ok:false};
  }
  function emitterLocal(ship,kind,shipHeight,target){
    const d=ship.dimensions||{width:shipHeight,height:shipHeight},emitters=ship.definition?.emitters;
    const points=kind==='beam'?[emitters?.beam,emitters?.beamAft].filter(Boolean):[emitters?.projectile].filter(Boolean);
    // Select the configured bank closest to the lock. Rear fire starts at aft
    // hardware, while custom hulls can retain their own single emitter.
    const choices=points.map(point=>({x:point.x*d.width,y:point.y*d.height}));
    choices.sort((a,b)=>{
      const distance=emitter=>{const world=rules.emitter(ship,{emitter});return Math.hypot(target.x-world.x,target.y-world.y);};
      return distance(a)-distance(b);
    });
    return choices[0]||{x:0,y:-shipHeight*.36};
  }
  function fireFor(options){
    const {state,getTarget,owner,onHit,onResolved}=options;
    if(blocked()||window.vexedWarp?.active&&(!options.shooter||options.shooter.id==='player'))return {ok:false,error:'Resume flight before firing.'};
    const shooter=describe(state,options.getSource?.()||options.shooter||player(state)),target=getTarget?.()||options.target;
    if(!target||(target.system??shooter.system)!==shooter.system)return {ok:false,reason:'unavailable',error:'Target unavailable.'};
    if(shooter.definition?.capabilities?.armed===false)return {ok:false,error:'This ship cannot fire weapons.'};
    if(shooter.entity?.hull<=0||shooter.hull===0)return {ok:false,error:'This ship is destroyed.'};
    if(shooter.entity?.phase==='disabled')return {ok:false,error:'Engines and weapons are disabled during hull repair.'};
    const system=shooter.system??state.system,holder=shooter.id==='player'?state:shooter.entity||options.shooter||shooter;
    const defaults=options.defaults||shooter.definition?.equipment||window.VexedMirrorWorld?.ships?.find(item=>item.id===Number(shooter.shipType))?.defaultWeapons;
    const scenery=collisionScene(state,system),armed=arm(state,undefined,(spec,kind)=>rules.firingSolution(shooter,target,spec,kind,scenery),{holder,defaults,selection:options.weaponInstance?{instance:options.weaponInstance}:options.selection});
    if(!armed.ok){const status=firingStatus(state,shooter,target,{holder,defaults,selection:options.weaponInstance?{instance:options.weaponInstance}:options.selection});return {...armed,reason:status.reason,error:status.message};}
    const combat=combatState(state),clock=now(state),height=options.shipHeight??shooter.dimensions?.height??0;
    const event=rules.startShot(armed.weapon,armed.kind,shooter,target,clock,height*.36,armed.spec);
    Object.assign(event,{id:combat.nextEventId++,system,owner:owner||shooter.category||'ship',weaponId:armed.weapon.id,weaponInstanceId:armed.instance?.id,
      weapon:{...armed.weapon},slot:armed.slot,sourceSnapshot:snapshot(shooter),targetSnapshot:snapshot(target),emitter:emitterLocal(shooter,armed.kind,height,target),resolved:false});
    const muzzle=rules.emitter(shooter,event);
    if(event.projectile){event.x=muzzle.x;event.y=muzzle.y;}else{event.from=muzzle;const angle=Math.atan2(target.y-muzzle.y,target.x-muzzle.x);event.beamEnd={x:muzzle.x+Math.cos(angle)*event.spec.range,y:muzzle.y+Math.sin(angle)*event.spec.range};}
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
    else shot.targetPoint=()=>beamContact(state,event,entry).point;
    entry.shot=shot;return shot;
  }
  function beamContact(state,event,entry){
    const source=liveSource(state,event,entry);
    // Keep the lock's current firing line even after an off-axis interception.
    // Re-intersect every surface instead of steering to the blocker's center
    // or rotating a saved local contact behind its shield.
    const current=liveTarget(state,event,entry);
    if(event.resolved&&(!current||!resolve(state,event.hitTargetId,event.system))){
      const from=rules.emitter(source,event),end=event.point||event.beamEnd,dx=end.x-from.x,dy=end.y-from.y;
      const scale=Math.min(1,event.spec.range/(Math.hypot(dx,dy)||1)),to={x:from.x+dx*scale,y:from.y+dy*scale};
      return rules.firstContact(from,to,source,null,collisionScene(state,event.system),undefined,undefined,0,{instant:true})||{kind:'miss',point:to,from};
    }
    const target=fitTarget(current||{...event.targetSnapshot,targetable:false},entry);
    return rules.beamTrace(event,source,target,collisionScene(state,event.system),target.radii,target.dimensions);
  }
  function beamContactFor(state,eventId,targetId){
    const event=state.weaponCombat?.events?.find(event=>event.id===eventId);
    if(!event||event.kind!=='beam'||!event.resolved||event.cancelled||now(state)>=event.launchedAt+duration('beam')/1000)return null;
    const result=beamContact(state,event,cache(state).get(event.id));
    return result.kind==='hit'&&String(result.target.id)===String(targetId)?result.contact:null;
  }
  function importEvent(state,legacy,{system=state.system,owner='civilian'}={}){
    if(!legacy||legacy.alive===false)return null;
    const combat=combatState(state),event=JSON.parse(JSON.stringify({...legacy,sourceSnapshot:snapshot(legacy.sourceSnapshot),targetSnapshot:snapshot(legacy.targetSnapshot)}));
    const oldClock=(state.shipSimulation?.legacyClocks?.civilian??Number(state.civilianTraffic?.clock))||0,offset=now(state)-oldClock;
    for(const key of ['launchedAt','dueAt'])if(Number.isFinite(event[key]))event[key]+=offset;
    Object.assign(event,{id:combat.nextEventId++,system,owner,resolved:false,weapon:event.weapon||{...window.VexedMirrorWeapons?.find(item=>item.id===event.weaponId),damage:event.damage}});
    event.sourceSnapshot.id??=event.sourceId;event.targetSnapshot.id??=event.targetId;
    event.spec||=rules.weaponSpec(event.weapon,event.kind);
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
      // A pending instantaneous beam has no flight to integrate. Its preview
      // reads current poses when painted; resolve those poses only when due.
      if(!event.projectile&&now(state)<event.dueAt)continue;
      const entry=cache(state).get(event.id),sourceShip=liveSource(state,event,entry),current=liveTarget(state,event,entry);
      const target=fitTarget(current||{...event.targetSnapshot,targetable:false},entry);
      if(current)event.targetSnapshot=snapshot(current);
      const result=rules.stepShot(event,sourceShip,target,collisionScene(state,event.system),now(state),dt,target.radii,target.dimensions);
      if(!result)continue;
      event.resolved=true;event.alive=false;event.resolvedAt=now(state);event.point=result.point;
      if(result.kind==='hit'){
        event.hitTargetId=result.target.id;event.hitTargetSnapshot=snapshot(result.target);event.contact=result.contact;
        const shot=visualFor(state,event,entry);
        shot.lockedImpactLocal=result.contact?.local;
        if(entry?.onHit&&current&&String(result.target.id)===String(current.id)){
          result.damage=entry.onHit(event.weapon,result.point,shot,result);
          if(current.category==='asteroid'&&current.entity)window.nativeShipSystems?.refreshAsteroid?.(state,current.entity);
          else if(current.entity&&['player','civilian','tug'].includes(current.category))window.nativeShipSystems?.refreshShip?.(state,current.entity,current.category);
          else window.nativeShipSystems?.invalidate?.(state,event.system);
        }else result.damage=applyHit(state,result,event,sourceShip);
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
    scene,configureScene:provider=>{sceneProvider=provider;},importEvent,migrate,restore:migrate,snapshot,beamContactFor,firingStatus,threats,activeProjectile,hasActiveProjectiles,awarenessMetrics:state=>({...awareness.get(state)}),isReady:()=>styles.size>0};
})();
