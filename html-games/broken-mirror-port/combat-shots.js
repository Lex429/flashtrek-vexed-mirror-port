/* One flight-shot path for every target in Sol. Target systems own damage only. */
(() => {
  'use strict';
  const styles=new Map(),readyAt=new Map();
  let nextSlot=0,units=window.showcaseWeaponAppearance.units;
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

  function arm(state,now=performance.now()) {
    const fitted=(state.weapons||[]).map(id=>window.VexedMirrorWeapons?.find(item=>item.id===Number(id))).filter(item=>item?.damage>0);
    if(!fitted.length)return {ok:false,error:'This ship has no damaging weapon equipped.'};
    const weapon=fitted[nextSlot++%fitted.length],remaining=(readyAt.get(weapon.id)||0)-now;
    const visual=weaponVisual(weapon);
    if(!visual.style)return {ok:false,error:styles.size?'This weapon has no showcase appearance.':'Weapon visuals are still loading.'};
    if(remaining>0)return {ok:false,error:`${weapon.name} recharging.`};
    readyAt.set(weapon.id,now+weapon.recharge*1000/13);
    return {ok:true,weapon,...visual};
  }

  function reset(){readyAt.clear();nextSlot=0;}

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
    if(shot.projectile){
      const projectile=shot.projectile;if(!projectile.alive)return false;
      window.paintShowcaseWeaponShot(ctx,shot,{screenPixels:true,x:cx+projectile.x-ship.x,y:cy+projectile.y-ship.y,angle:Math.atan2(projectile.vy,projectile.vx)},projectile.age*1000);
      return true;
    }
    const age=now-shot.born;
    if(age>=shot.duration)return false;
    const from=source(shot,state,ship),to=shot.targetPoint?.(from)||shot.target;
    const x1=cx+from.x-ship.x,y1=cy+from.y-ship.y;
    const x2=cx+to.x-ship.x,y2=cy+to.y-ship.y;
    if(shot.kind==='beam'){
      window.paintShowcaseWeaponShot(ctx,shot,{screenPixels:true,x1,y1,x2,y2},age);
    }else{
      const progress=Math.min(1,age/shot.duration),x=x1+(x2-x1)*progress,y=y1+(y2-y1)*progress;
      window.paintShowcaseWeaponShot(ctx,shot,{screenPixels:true,x,y,angle:Math.atan2(y2-y1,x2-x1)},age);
    }
    return true;
  }

  window.nativeCombatShots={arm,create,source,paint,hitDelay,weaponVisual,reset,contact,worldPoint,ready,setVisualCatalog,isReady:()=>styles.size>0};
})();
