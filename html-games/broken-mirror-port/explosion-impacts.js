/* Shared blast/debris contacts. Ship callbacks only show existing impact art. */
(() => {
  'use strict';
  let activeState=null,activeSystem=null,clock=0,ships=[],asteroids=[],suppressBlast=false;
  let rockSource=null,rockTargets=[],targetsDirty=true;
  function refreshTargets(state){
    activeState=state;activeSystem=state.system;
    window.nativeCivilianTraffic?.initialize(state);
    const scene=window.nativeShipSystems?.scene(state,{system:state.system})||window.nativeCivilianTraffic?.combatScene(state,{system:state.system});
    ships=(scene?.bystanders||[]).map(target=>({...target,id:target.id==='player'||String(target.id).startsWith('tug:')?target.id:`civilian:${target.id}`,system:state.system,descriptor:target}));
    const gone=new Set([...(state.minedAsteroids||[]),...(state.destroyedAsteroids||[])]);
    const source=window.nativeSolAsteroids?.forSystem?.(state.system)||(state.system===1?window.nativeSolAsteroids?.placements:[]);
    if(source!==rockSource){rockSource=source;rockTargets=(source||[]).map(rock=>({...rock,id:rock.slotId,system:state.system,radius:rock.size*.45}));}
    asteroids=rockTargets.filter(rock=>!gone.has(rock.slotId));
    targetsDirty=false;
  }
  const impacts=window.createEnvironmentalImpacts({
    getShips:()=>ships,
    getAsteroids:()=>asteroids,
    onShipImpact(target,event){
      const visual={...event,born:clock,visualOnly:true};
      if(window.nativeShipSystems)window.nativeShipSystems.visualImpact(activeState,target.descriptor,visual);
      else if(target.id==='player')window.nativeCombatShots.onPlayerImpact?.(visual);
      else if(target.id.startsWith('tug:'))window.nativeSolEconomy.visualImpact?.(activeState,Number(target.id.slice(4)),visual);
      else window.nativeCivilianTraffic.visualImpact?.(activeState,Number(target.id.slice(9)),visual);
    },
    onAsteroidHit(target){
      // The normal asteroid burst still plays. Suppress a new pressure wave
      // from blast-destroyed rocks so a dense belt cannot chain indefinitely.
      suppressBlast=true;
      try{window.nativeAsteroidCombat?.destroy(activeState,target.slotId);}finally{suppressBlast=false;}
    }
  });
  function reset(){impacts.reset();activeState=null;activeSystem=null;clock=0;ships=[];asteroids=[];suppressBlast=false;pieceIdentities=new WeakMap();rockSource=null;rockTargets=[];targetsDirty=true;}
  function ensureState(state){if(activeState!==state||activeSystem!==state.system){reset();activeState=state;activeSystem=state.system;clock=window.nativeSimulation?.now(state)||0;}}
  function explode(state,source,{radius,duration=850,sourceKey=null}={}){
    if(!state||suppressBlast)return;ensureState(state);
    const system=source.system??state.system;if(system!==state.system)return;
    const size=Number(source.size)||Math.max(Number(source.w)||0,Number(source.h)||0)||60;
    impacts.explode({x:source.x,y:source.y,born:clock,radius:radius??Math.min(420,Math.max(120,size*2.2+100)),duration,sourceKey,system});
  }
  function debris(state,piece,oldX,oldY,{sourceKey=null}={}){
    if(!state||piece.ore||document.hidden||window.nativePause?.active||window.nativeShipInventory?.active||window.vexedWarp?.active)return;ensureState(state);
    if(targetsDirty)refreshTargets(state);
    // Some wreck renderers use local effect clocks for particle birth times.
    // This wrapper preserves them and uses the adapter's paused simulation clock.
    const sample={x:piece.x,y:piece.y,w:piece.w,h:piece.h,size:piece.size??piece.radius*2};
    sample.born=0;
    let identity=pieceIdentities.get(piece);if(!identity){identity=sample;pieceIdentities.set(piece,identity);}else Object.assign(identity,sample);
    impacts.stepDebris(identity,oldX,oldY,clock,{sourceKey,system:piece.system??state.system});
  }
  let pieceIdentities=new WeakMap();
  function advance(state,dt){
    if(!state||!Number.isFinite(dt)||dt<=0||document.hidden||window.nativePause?.active||window.nativeShipInventory?.active||window.vexedWarp?.active)return;
    ensureState(state);clock=window.nativeSimulation?window.nativeSimulation.now(state):clock+dt*1000;
    // Idle flight pays no scene-query cost. Active pressure waves get fresh
    // positions each simulation step; many debris pieces share one scene query.
    if(impacts.hasWaves()){refreshTargets(state);impacts.update(clock);}
    targetsDirty=true;
  }
  function paint(ctx,{state,ship,cx,cy}){
    if(state!==activeState)return;
    impacts.draw(ctx,clock,{offsetX:cx-ship.x,offsetY:cy-ship.y});
  }
  window.nativeEnvironmentalImpacts=Object.freeze({explode,debris,advance,paint,reset,snapshot:()=>({clock,...impacts.snapshot()})});
})();
