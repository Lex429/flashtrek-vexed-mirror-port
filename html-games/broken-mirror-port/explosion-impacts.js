/* Shared blast/debris contacts. Live particles resolve through common motion. */
(() => {
  'use strict';
  let activeState=null,activeSystem=null,clock=0,shipTargets=new WeakMap(),rockTargets=new WeakMap();
  function shipTarget(target,state){
    let entry=shipTargets.get(target);
    if(!entry){entry={...target,id:target.id==='player'||String(target.id).startsWith('tug:')?target.id:`civilian:${target.id}`,system:state.system,descriptor:target};shipTargets.set(target,entry);}
    return entry;
  }
  function rockTarget(target,state){
    const rock=target.entity||target;
    let entry=rockTargets.get(rock);
    if(!entry){entry={get x(){return rock.x;},get y(){return rock.y;},get radius(){return rock.size*.45;},entity:rock,id:rock.slotId,slotId:rock.slotId,system:state.system};rockTargets.set(rock,entry);}
    return entry;
  }
  function querySource(sourceKey){
    const state=activeState,asteroid=sourceKey.startsWith('asteroid:'),ship=sourceKey.startsWith('ship:');
    if(!asteroid&&!ship)return null;
    const id=asteroid?'rock:'+sourceKey.slice(9):sourceKey.slice(5).replace(/^civilian:/,''),target=window.nativeShipSystems?.resolve(state,id,state.system);
    return target?(asteroid?rockTarget(target,state):shipTarget(target,state)):null;
  }
  function queryTargets(bounds,{swept=true}={}){
    const state=activeState,scene=(bounds&&window.nativeShipSystems?.query?.(state,{system:state.system,...bounds,swept}))||
      window.nativeShipSystems?.scene(state,{system:state.system})||window.nativeCivilianTraffic?.combatScene(state,{system:state.system});
    const ships=(scene?.bystanders||[]).map(target=>shipTarget(target,state));
    const asteroids=(scene?.rocks||[]).map(target=>rockTarget(target,state));
    return {ships,asteroids};
  }
  const impacts=window.createEnvironmentalImpacts({
    queryTargets,querySource,
    onCandidates(count){window.nativeSimulationFrame?.count(activeState,'debrisCandidates',count);window.nativeSimulationFrame?.count(activeState,'collisionCandidates',count);},
    debrisContact:(piece,from,target,type)=>window.nativeAsteroidMotion?.debrisContact(activeState,piece,from,target,type),
    resolveDebris:(piece,target,type,result)=>window.nativeAsteroidMotion?.resolveDebris(activeState,piece,target,type,result),
    onShipImpact(target,event){
      const visual={...event,born:clock,visualOnly:true,physicalContact:event.kind==='debris'};
      if(window.nativeShipSystems)window.nativeShipSystems.visualImpact(activeState,target.descriptor,visual);
      else if(target.id==='player')window.nativeCombatShots.onPlayerImpact?.(visual);
      else if(target.id.startsWith('tug:'))window.nativeSolEconomy.visualImpact?.(activeState,Number(target.id.slice(4)),visual);
      else window.nativeCivilianTraffic.visualImpact?.(activeState,Number(target.id.slice(9)),visual);
    },
    onAsteroidHit(target,event){
      if(event.kind==='debris'&&event.firstHit)window.nativeAsteroidCombat?.debrisHit(activeState,target.slotId,event);
    }
  });
  function reset(){impacts.reset();activeState=null;activeSystem=null;clock=0;pieceIdentities=new WeakMap();shipTargets=new WeakMap();rockTargets=new WeakMap();}
  function ensureState(state){if(activeState!==state||activeSystem!==state.system){reset();activeState=state;activeSystem=state.system;clock=window.nativeSimulation?.now(state)||0;}}
  function explode(state,source,{radius,duration=850,sourceKey=null}={}){
    if(!state)return;ensureState(state);
    const system=source.system??state.system;if(system!==state.system)return;
    const size=Number(source.size)||Math.max(Number(source.w)||0,Number(source.h)||0)||60;
    impacts.explode({x:source.x,y:source.y,born:clock,radius:radius??Math.min(420,Math.max(120,size*2.2+100)),duration,sourceKey,system,affectAsteroids:false});
  }
  function debris(state,piece,oldX,oldY,{sourceKey=null,dt=1/60}={}){
    if(!state||piece.ore||document.hidden||window.nativePause?.active||window.nativeShipInventory?.active||window.vexedWarp?.active)return;ensureState(state);
    // Some wreck renderers use local effect clocks for particle birth times.
    // This wrapper preserves them and uses the adapter's paused simulation clock.
    if(!(dt>0)||!Number.isFinite(dt))return;
    const sample={x:piece.x,y:piece.y,w:piece.w,h:piece.h,size:Math.max(2,Number(piece.size)||Number(piece.radius)*2||Math.hypot(piece.w||0,piece.h||0)*.6||2),
      vx:Number.isFinite(piece.vx)?piece.vx:(piece.x-oldX)/dt,vy:Number.isFinite(piece.vy)?piece.vy:(piece.y-oldY)/dt,spin:piece.spin||0,dt};
    sample.born=0;
    let identity=pieceIdentities.get(piece);if(!identity){identity=sample;pieceIdentities.set(piece,identity);}else Object.assign(identity,sample);
    impacts.stepDebris(identity,oldX,oldY,clock,{sourceKey,system:piece.system??state.system});
    Object.assign(piece,{x:identity.x,y:identity.y,vx:identity.vx,vy:identity.vy,spin:identity.spin});
  }
  let pieceIdentities=new WeakMap();
  function advance(state,dt){
    if(!state||!Number.isFinite(dt)||dt<=0||document.hidden||window.nativePause?.active||window.nativeShipInventory?.active||window.vexedWarp?.active)return;
    ensureState(state);clock=window.nativeSimulation?window.nativeSimulation.now(state):clock+dt*1000;
    // Idle flight pays no scene-query cost. Each active wave or fragment asks
    // the common spatial owner only for its own conservative swept bounds.
    if(impacts.hasWaves())impacts.update(clock);
  }
  function paint(ctx,{state,ship,cx,cy,zoom=1,w=Infinity,h=Infinity}){
    if(state!==activeState)return;
    impacts.draw(ctx,clock,{offsetX:cx-ship.x,offsetY:cy-ship.y,
      visible:(x,y,r)=>!window.nativeEffectVisibility||window.nativeEffectVisibility.circle(cx+(x-ship.x)*zoom,cy+(y-ship.y)*zoom,r*zoom,{w,h})});
  }
  window.nativeEnvironmentalImpacts=Object.freeze({explode,debris,advance,paint,reset,snapshot:()=>({clock,...impacts.snapshot()})});
})();
