/* One flight-shot path for every target in Sol. Target systems own damage only. */
(() => {
  'use strict';
  const styles=new Map(),pending=[];
  const rules=window.nativeWeaponRules;
  let units=window.showcaseWeaponAppearance.units;
  function setVisualCatalog(data,catalog){
      if(!Object.values(data.weapons||{}).some(entries=>entries.length))return false;
      styles.clear();units=Number(catalog.units)||window.showcaseWeaponAppearance.units;
      for(const [kind,entries] of Object.entries(data.weapons||{}))
        for(const style of entries)styles.set(style.id,{...style,kind});
      return true;
  }
  const ready=Promise.all(['combat-data.json?v=weapon-independent-1','catalog.json?v=tug-ii-a-anim-3'].map(file=>fetch('../flashtrek-broken-mirror/showcase-assets/'+file).then(response=>{if(response.ok===false)throw Error('Showcase weapon data unavailable');return response.json();})))
    .then(([data,catalog])=>setVisualCatalog(data,catalog)).catch(error=>{console.warn('Showcase weapon styles unavailable',error);return false;});
  const duration=kind=>kind==='beam'?180:kind==='torpedo'?560:360;
  const hitDelay=shot=>shot.kind==='beam'?70:shot.duration;

  function weaponVisual(weapon) {
    const style=styles.get(Number(weapon.id));
    const kind=style?.kind||(/torpedo|launcher/i.test(weapon.name)?'torpedo':/disruptor|cannon|turrent|turret|pulse/i.test(weapon.name)?'disruptor':'beam');
    return {kind,style:style||null,units};
  }

  function combatState(state){
    if(!state.weaponCombat||state.weaponCombat.version!==1)state.weaponCombat={version:1,clock:0,nextSlot:0,weaponReadyAt:{}};
    return state.weaponCombat;
  }
  function arm(state,now,eligible=()=>true) {
    const owner=combatState(state),clock=now==null?owner.clock:now/1000;
    const fitted=(state.weapons||[]).map((id,slot)=>({slot,weapon:window.VexedMirrorWeapons?.find(item=>item.id===Number(id))})).filter(item=>item.weapon?.damage>0);
    if(!fitted.length)return {ok:false,error:'This ship has no damaging weapon equipped.'};
    let available=false,visible=false;
    for(let offset=0;offset<fitted.length;offset++){
      const index=(owner.nextSlot+offset)%fitted.length,{weapon,slot}=fitted[index],visual=weaponVisual(weapon);
      if(!visual.style)continue;visible=true;
      if(!rules.isReady(owner,slot,weapon,clock))continue;available=true;
      const spec=rules.weaponSpec(weapon,visual.kind);
      if(!eligible(spec,visual.kind))continue;
      rules.consume(owner,slot,weapon,visual.kind,clock);owner.nextSlot=(index+1)%fitted.length;
      return {ok:true,weapon,slot,spec,...visual};
    }
    return {ok:false,error:!visible?'Weapon visuals are unavailable or still loading.':available?'Target is out of range, outside the firing arc, or blocked.':'All fitted weapons are recharging.'};
  }
  function cancel(owner){
    for(let i=pending.length-1;i>=0;i--){const entry=pending[i];if(owner&&entry.owner!==owner)continue;entry.event.alive=false;entry.shot.cancelled=true;pending.splice(i,1);}
  }
  function reset(){cancel();}
  function player(state){
    const position=state.system===1?window.vexedSolFlight.shipPosition(state):state;
    return {id:'player',x:position.x,y:position.y,heading:state.angle,speed:state.speed||0};
  }
  function scene(state){return window.nativeCivilianTraffic.combatScene(state,{system:state.system});}
  function applyHit(state,result,event,source){
    const target=result.target;if(!target)return {ok:false};
    const impact={from:result.point,kind:event.kind,source:source.id==='player'?'player':'ai',sourceId:source.id};
    if(target.rockId!=null)return window.nativeAsteroidCombat?.hit(state,target.rockId,event.damage,impact)||{ok:false};
    if(target.id==='player')return window.nativeCombatShots.onPlayerHit?.(state,event.damage,impact)||{ok:false};
    if(String(target.id).startsWith('tug:'))return window.nativeSolEconomy?.hit(state,Number(String(target.id).slice(4)),event.damage,impact)||{ok:false};
    if(target.category==='civilian'||typeof target.id==='number')return window.nativeCivilianTraffic.hit(state,target.id,event.damage,impact);
    return target.onHit?.(event.damage,impact)||{ok:false};
  }
  function fire({state,shipHeight,getTarget,dimensions,shielded,owner,onHit}){
    if(window.nativePause?.active||window.nativeShipInventory?.active||window.vexedWarp?.active||document.hidden)return {ok:false,error:'Resume flight before firing.'};
    const target=getTarget(),sourceShip=player(state);if(!target)return {ok:false,error:'Target unavailable.'};
    const scenery=scene(state),armed=arm(state,undefined,(spec,kind)=>rules.firingSolution(sourceShip,target,spec,kind,scenery));
    if(!armed.ok)return armed;
    const clock=combatState(state).clock,event=rules.startShot(armed.weapon,armed.kind,sourceShip,target,clock,shipHeight*.36);
    event.muzzle=shipHeight*.36;
    const shot=create({state,ship:sourceShip,shipHeight,target,...armed});
    shot.clock=()=>combatState(state).clock;shot.startedAt=clock;
    if(event.projectile)shot.projectile=event;
    else shot.targetPoint=from=>{const current=getTarget()||target;return worldPoint(current,shot.lockedImpactLocal||contact(current,from,dimensions(current),shielded(current)).local);};
    pending.push({state,system:state.system,event,shot,getTarget,lastTarget:{...target},dimensions,shielded,owner,onHit,weapon:{...armed.weapon,damage:event.damage}});
    return {ok:true,weapon:armed.weapon.name,kind:armed.kind,shot};
  }
  function advance(state,dt){
    for(let i=pending.length-1;i>=0;i--){const entry=pending[i];if(entry.state!==state||entry.system!==state.system){entry.event.alive=false;entry.shot.cancelled=true;pending.splice(i,1);}}
    if(!Number.isFinite(dt)||dt<=0||document.hidden||window.nativePause?.active||window.nativeShipInventory?.active)return;
    combatState(state).clock+=dt;
    if(window.vexedWarp?.active){cancel();return;}
    const sourceShip=player(state);
    for(const entry of [...pending]){
      if(!pending.includes(entry))continue;
      const current=entry.getTarget(),target=current||{...entry.lastTarget,targetable:false};
      if(current)entry.lastTarget={...current};
      const d=entry.dimensions(target),radii=entry.shielded(target)?window.showcaseShieldRadii(d.width,d.height):{rx:Math.max(8,d.width*.34),ry:Math.max(12,d.height*.44)};
      const result=rules.stepShot(entry.event,sourceShip,target,scene(state),combatState(state).clock,dt,radii,d);
      if(!result)continue;
      pending.splice(pending.indexOf(entry),1);entry.event.alive=false;
      if(result.point)entry.shot.targetPoint=()=>result.point;
      if(result.kind==='hit'){
        if(current&&result.target?.id===current.id)entry.onHit?.(entry.weapon,result.point,entry.shot);
        else applyHit(state,result,entry.event,sourceShip);
      }
    }
  }
  function age(shot,now=performance.now()){return shot.clock?(shot.clock()-shot.startedAt)*1000:now-shot.born;}
  function isVisible(shot,now=performance.now()){return !shot.cancelled&&(shot.projectile?shot.projectile.alive:age(shot,now)<shot.duration);}

  function create({state,ship,shipHeight,target,kind,style,units:visualUnits=units,spin,spinSpeed,shooter=null,now=performance.now()}) {
    const muzzleOffset=shipHeight*.36;
    return {
      ...window.createShowcaseWeaponVisual({kind,style,units:visualUnits,spin,spinSpeed}),born:now,target,shooter,muzzleOffset,duration:duration(kind),
      from:{x:ship.x+Math.cos(state.angle)*muzzleOffset,y:ship.y+Math.sin(state.angle)*muzzleOffset}
    };
  }

  function source(shot,state,ship) {
    const firingShip=shot.shooter||ship,heading=shot.shooter?shot.shooter.heading:state.angle;
    return shot.kind==='beam'
      ?{x:firingShip.x+Math.cos(heading)*shot.muzzleOffset,y:firingShip.y+Math.sin(heading)*shot.muzzleOffset}
      :shot.from;
  }

  // Every ship target uses the same rotated contact point as the shield renderer.
  function worldPoint(target,local){
    const angle=target.heading+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    return {x:target.x+local.x*c-local.y*s,y:target.y+local.x*s+local.y*c};
  }
  function contact(target,from,dimensions,shielded){
    const angle=target.heading+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    const dx=from.x-target.x,dy=from.y-target.y;
    let lx=dx*c+dy*s,ly=-dx*s+dy*c;
    if(Math.hypot(lx,ly)<.001){lx=0;ly=-1;}
    const {width,height}=dimensions;
    const {rx,ry}=shielded?window.showcaseShieldRadii(width,height):{rx:Math.max(8,width*.34),ry:Math.max(12,height*.44)};
    const scale=.96/Math.hypot(lx/rx,ly/ry),length=Math.hypot(lx,ly);
    const local={x:lx*scale,y:ly*scale};
    return {local,world:worldPoint(target,local),dx:-lx/length,dy:-ly/length};
  }

  function paint(ctx,shot,{state,ship,cx,cy,zoom,now=performance.now()}) {
    if(!isVisible(shot,now))return false;
    if(shot.projectile){
      const projectile=shot.projectile;if(!projectile.alive)return false;
      window.paintShowcaseWeaponShot(ctx,shot,{screenPixels:true,x:cx+projectile.x-ship.x,y:cy+projectile.y-ship.y,angle:Math.atan2(projectile.vy,projectile.vx)},projectile.age*1000);
      return true;
    }
    const elapsed=age(shot,now);
    if(elapsed>=shot.duration)return false;
    const from=source(shot,state,ship),to=shot.targetPoint?.(from)||shot.target;
    const x1=cx+from.x-ship.x,y1=cy+from.y-ship.y;
    const x2=cx+to.x-ship.x,y2=cy+to.y-ship.y;
    if(shot.kind==='beam'){
      window.paintShowcaseWeaponShot(ctx,shot,{screenPixels:true,x1,y1,x2,y2},elapsed);
    }else{
      const progress=Math.min(1,elapsed/shot.duration),x=x1+(x2-x1)*progress,y=y1+(y2-y1)*progress;
      window.paintShowcaseWeaponShot(ctx,shot,{screenPixels:true,x,y,angle:Math.atan2(y2-y1,x2-x1)},elapsed);
    }
    return true;
  }

  window.nativeCombatShots={arm,fire,advance,cancel,isVisible,create,source,paint,hitDelay,weaponVisual,reset,contact,worldPoint,ready,setVisualCatalog,applyHit,isReady:()=>styles.size>0};
})();
