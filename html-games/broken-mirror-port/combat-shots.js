/* One flight-shot path for every target in Sol. Target systems own damage only. */
(() => {
  'use strict';
  const styles=new Map(),readyAt=new Map();
  let nextSlot=0;
  fetch('../flashtrek-broken-mirror/showcase-assets/combat-data.json')
    .then(response=>response.json()).then(data=>{
      for(const [kind,entries] of Object.entries(data.weapons||{}))
        for(const style of entries)styles.set(style.id,{...style,kind});
    }).catch(error=>console.warn('Showcase weapon styles unavailable',error));
  const duration=kind=>kind==='beam'?180:kind==='torpedo'?560:360;
  const hitDelay=shot=>shot.kind==='beam'?70:shot.duration;

  function weaponVisual(weapon) {
    const style=styles.get(weapon.id);
    const kind=style?.kind||(/torpedo|launcher/i.test(weapon.name)?'torpedo':/disruptor|cannon|turrent|turret|pulse/i.test(weapon.name)?'disruptor':'beam');
    return {kind,style:style||{color:kind==='torpedo'?0x85dfff:0x6fe8ff,thickness:3}};
  }

  function arm(state,now=performance.now()) {
    const fitted=(state.weapons||[]).map(id=>window.VexedMirrorWeapons?.find(item=>item.id===Number(id))).filter(item=>item?.damage>0);
    if(!fitted.length)return {ok:false,error:'This ship has no damaging weapon equipped.'};
    const weapon=fitted[nextSlot++%fitted.length],remaining=(readyAt.get(weapon.id)||0)-now;
    if(remaining>0)return {ok:false,error:`${weapon.name} recharging.`};
    readyAt.set(weapon.id,now+weapon.recharge*1000/13);
    return {ok:true,weapon,...weaponVisual(weapon)};
  }

  function reset(){readyAt.clear();nextSlot=0;}

  function create({state,ship,shipHeight,target,kind,style,now=performance.now()}) {
    const muzzleOffset=shipHeight*.36;
    return {
      born:now,kind,style,target,muzzleOffset,duration:duration(kind),
      from:{x:ship.x+Math.cos(state.angle)*muzzleOffset,y:ship.y+Math.sin(state.angle)*muzzleOffset}
    };
  }

  function source(shot,state,ship) {
    return shot.kind==='beam'
      ?{x:ship.x+Math.cos(state.angle)*shot.muzzleOffset,y:ship.y+Math.sin(state.angle)*shot.muzzleOffset}
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
    const age=now-shot.born;
    if(age>=shot.duration)return false;
    const from=source(shot,state,ship),to=shot.targetPoint?.(from)||shot.target;
    const x1=cx+from.x-ship.x,y1=cy+from.y-ship.y;
    const x2=cx+to.x-ship.x,y2=cy+to.y-ship.y;
    if(shot.kind==='beam'){
      window.drawShowcaseWeapon(ctx,{kind:'beam',color:shot.style.color,thickness:shot.style.thickness||3,units:1,zoom:1/zoom,x1,y1,x2,y2});
    }else{
      const progress=Math.min(1,age/shot.duration),x=x1+(x2-x1)*progress,y=y1+(y2-y1)*progress;
      window.drawShowcaseWeapon(ctx,{kind:shot.kind,color:shot.style.color,units:1,zoom:1/zoom,x,y,spin:age*.015,angle:Math.atan2(y2-y1,x2-x1)});
    }
    return true;
  }

  window.nativeCombatShots={arm,create,source,paint,hitDelay,weaponVisual,reset,contact,worldPoint};
})();
