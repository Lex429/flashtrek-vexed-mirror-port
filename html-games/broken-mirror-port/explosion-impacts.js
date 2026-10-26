/* Shared blast/debris contacts. Live particles resolve through common motion. */
(() => {
  'use strict';
  let activeState=null,activeSystem=null,clock=0,ships=[],asteroids=[];
  let rockSource=null,rockTargets=[],targetsDirty=true;
  const cell=160,shipGrid=new Map(),shipByKey=new Map(),rockById=new Map(),ranks=new WeakMap();let movingRocks=[],maxShipSpeed=0;
  function indexShips(){
    shipGrid.clear();shipByKey.clear();maxShipSpeed=0;
    ships.forEach((target,i)=>{ranks.set(target,i);shipByKey.set('ship:'+target.id,target);});
    for(const target of ships){const d=target.descriptor,r=d.hullRadii||d.radii;
      const radius=Math.max(target.radius||0,r?.rx||0,r?.ry||0)+1;
      maxShipSpeed=Math.max(maxShipSpeed,Math.abs(d.vx||0),Math.abs(d.vy||0));
      const px=Number.isFinite(d.previousX)?d.previousX:target.x,py=Number.isFinite(d.previousY)?d.previousY:target.y;
      const left=Math.floor((Math.min(target.x,px)-radius)/cell),right=Math.floor((Math.max(target.x,px)+radius)/cell);
      const top=Math.floor((Math.min(target.y,py)-radius)/cell),bottom=Math.floor((Math.max(target.y,py)+radius)/cell);
      // Teleport-sized histories use the conservative all-ships query below.
      if((right-left+1)*(bottom-top+1)>256){shipGrid.clear();return;}
      for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++){const key=x+':'+y,list=shipGrid.get(key)||[];list.push(target);shipGrid.set(key,list);}
    }
  }
  function nearbyShips(query){
    if(!query||!shipGrid.size)return ships;
    const pad=query.padding+maxShipSpeed*query.dt;
    const left=Math.floor((Math.min(query.from.x,query.to.x)-pad)/cell),right=Math.floor((Math.max(query.from.x,query.to.x)+pad)/cell);
    const top=Math.floor((Math.min(query.from.y,query.to.y)-pad)/cell),bottom=Math.floor((Math.max(query.from.y,query.to.y)+pad)/cell);
    if((right-left+1)*(bottom-top+1)>256)return ships;
    const found=new Set(),parent=shipByKey.get(query.sourceKey);if(parent)found.add(parent);
    for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++)for(const target of shipGrid.get(x+':'+y)||[])found.add(target);
    return [...found].sort((a,b)=>ranks.get(a)-ranks.get(b));
  }
  function nearbyRocks(query){
    if(!query||!window.nativeSolAsteroids?.sweptNearby)return asteroids;
    const found=new Set(movingRocks);
    if(query.sourceKey?.startsWith('asteroid:')){const parent=rockById.get(Number(query.sourceKey.slice(9)));if(parent)found.add(parent);}
    for(const rock of window.nativeSolAsteroids.sweptNearby(activeSystem,query.from,query.to,query.padding)){
      const target=rockById.get(rock.slotId);if(target)found.add(target);
    }return [...found].sort((a,b)=>ranks.get(a)-ranks.get(b));
  }
  function refreshTargets(state){
    activeState=state;activeSystem=state.system;
    window.nativeCivilianTraffic?.initialize(state);
    const scene=window.nativeShipSystems?.scene(state,{system:state.system})||window.nativeCivilianTraffic?.combatScene(state,{system:state.system});
    ships=(scene?.bystanders||[]).map(target=>({...target,id:target.id==='player'||String(target.id).startsWith('tug:')?target.id:`civilian:${target.id}`,system:state.system,descriptor:target}));
    const gone=new Set([...(state.minedAsteroids||[]),...(state.destroyedAsteroids||[])]);
    const source=window.nativeSolAsteroids?.forSystem?.(state.system)||(state.system===1?window.nativeSolAsteroids?.placements:[]);
    if(source!==rockSource){rockSource=source;rockTargets=(source||[]).map(rock=>({get x(){return rock.x;},get y(){return rock.y;},entity:rock,id:rock.slotId,slotId:rock.slotId,system:state.system,radius:rock.size*.45}));}
    asteroids=rockTargets.filter(rock=>!gone.has(rock.slotId));
    indexShips();rockById.clear();movingRocks=[];
    asteroids.forEach((target,i)=>ranks.set(target,i));
    for(const target of asteroids){rockById.set(target.slotId,target);const r=target.entity;
      if(r.vx||r.vy||Number.isFinite(r.previousX)&&r.previousX!==r.x||Number.isFinite(r.previousY)&&r.previousY!==r.y)movingRocks.push(target);}
    targetsDirty=false;
  }
  const impacts=window.createEnvironmentalImpacts({
    getShips:nearbyShips,
    getAsteroids:nearbyRocks,
    debrisContact:(piece,from,target,type)=>window.nativeAsteroidMotion?.debrisContact(activeState,piece,from,target,type),
    resolveDebris:(piece,target,type,result)=>{window.nativeAsteroidMotion?.resolveDebris(activeState,piece,target,type,result);targetsDirty=true;},
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
  function reset(){impacts.reset();activeState=null;activeSystem=null;clock=0;ships=[];asteroids=[];pieceIdentities=new WeakMap();rockSource=null;rockTargets=[];targetsDirty=true;shipGrid.clear();shipByKey.clear();rockById.clear();movingRocks=[];maxShipSpeed=0;}
  function ensureState(state){if(activeState!==state||activeSystem!==state.system){reset();activeState=state;activeSystem=state.system;clock=window.nativeSimulation?.now(state)||0;}}
  function explode(state,source,{radius,duration=850,sourceKey=null}={}){
    if(!state)return;ensureState(state);
    const system=source.system??state.system;if(system!==state.system)return;
    const size=Number(source.size)||Math.max(Number(source.w)||0,Number(source.h)||0)||60;
    impacts.explode({x:source.x,y:source.y,born:clock,radius:radius??Math.min(420,Math.max(120,size*2.2+100)),duration,sourceKey,system,affectAsteroids:false});
  }
  function debris(state,piece,oldX,oldY,{sourceKey=null,dt=1/60}={}){
    if(!state||piece.ore||document.hidden||window.nativePause?.active||window.nativeShipInventory?.active||window.vexedWarp?.active)return;ensureState(state);
    if(targetsDirty)refreshTargets(state);
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
