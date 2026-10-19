/* Showcase weapon and mining effects adapted to the Sol flight coordinates. */
(() => {
  'use strict';
  let targetId=null,selectedAt=0,bursts=[],collections=[],collectionFields=[],mining=null;
  let activeState=null,targetSystem=1;
  const now=()=>window.nativeSimulation.now(activeState);
  const placements=(system=activeState?.system??1)=>window.nativeSolAsteroids?.forSystem?.(system)||(Number(system)===1?window.nativeSolAsteroids?.placements:[])||[];
  const rockById=(id,system)=>window.nativeSolAsteroids?.find?.(id,system)||placements(system).find(rock=>rock.slotId===Number(id))||null;
  const target=()=>targetId===null?null:rockById(targetId,targetSystem);
  const gone=(state,id)=>state.destroyedAsteroids?.includes(id)||state.minedAsteroids?.includes(id);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const orePosition=(rock,index,mined=false)=>{const [dx,dy]=(mined?[[-.1144,-.1144],[.1144,-.1144],[-.1144,.1144],[.1144,.1144]]:[[0,-.172],[-.172,.095],[.172,.095]])[index]||[0,0];return{x:rock.x+dx*rock.size,y:rock.y+dy*rock.size};};
  const oreShieldRadius=rock=>rock.size*.36;
  const weaponVisual=weapon=>window.nativeCombatShots.weaponVisual(weapon);
  const miningTiming=Object.freeze({cutSeconds:7.15,animationSeconds:8.5,transportSeconds:4.5});
  function select(rock){targetSystem=rock.system??activeState?.system??1;if(targetId!==rock.slotId)selectedAt=now();targetId=rock.slotId;return rock;}
  function deselect(){targetId=null;}
  function autoTarget(state,ship,{cx,cy,zoom,w,h}){
    const nearby=placements(state.system).filter(rock=>!gone(state,rock.slotId)&&distance(rock,ship)<=650);
    const visible=nearby.filter(rock=>{
      const x=cx+(rock.x-ship.x)*zoom,y=cy+(rock.y-ship.y)*zoom;
      return x>=0&&x<=w&&y>=0&&y<=h;
    });
    const rock=(visible.length?visible:nearby).sort((a,b)=>distance(a,ship)-distance(b,ship))[0];
    if(!rock){targetId=null;return null;}
    return select(rock);
  }
  function clear(){deselect();bursts=[];collections=[];collectionFields=[];mining=null;window.nativeCombatShots.reset();}
  function collect(rock,index,mined=false,born=now()){collections.push({rock,index,position:orePosition(rock,index,mined),born});}
  function collectField(rock,indices){const born=now();collectionFields.push({rock,born});for(const index of indices)collect(rock,index,true,born+index*110);}
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const orePixels=new Map();
  function transportPixels(ore){
    if(orePixels.has(ore.src))return orePixels.get(ore.src);
    if(!ore.complete||!ore.naturalWidth)return null;
    const sample=document.createElement('canvas');sample.width=24;sample.height=24;
    const sampleCtx=sample.getContext('2d',{willReadFrequently:true});sampleCtx.drawImage(ore,0,0,24,24);
    const pixels=sampleCtx.getImageData(0,0,24,24).data,result=[];
    for(let py=0;py<24;py+=2)for(let px=0;px<24;px+=2){
      const at=(py*24+px)*4;if(pixels[at+3]<75)continue;
      result.push({x:(px+.5)/24-.5,y:(py+.5)/24-.5,
        color:`rgb(${Math.min(255,pixels[at]+85)},${Math.min(255,pixels[at+1]+95)},${Math.min(255,pixels[at+2]+105)})`,
        seed:Math.abs(Math.sin(px*12.9898+py*78.233))});
    }
    orePixels.set(ore.src,result);return result;
  }
  function drawMiningFlare(ctx,x,y,r,color,strength=1,angle=0){
    if(strength<=0)return;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.min(.8,strength);
    const bloom=ctx.createRadialGradient(0,0,0,0,0,r);
    bloom.addColorStop(0,'#fffef2');bloom.addColorStop(.12,color);bloom.addColorStop(.42,color+'44');bloom.addColorStop(1,'#00000000');
    ctx.fillStyle=bloom;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
    const streak=ctx.createLinearGradient(-r*1.5,0,r*1.5,0);
    streak.addColorStop(0,'#00000000');streak.addColorStop(.45,color+'00');streak.addColorStop(.5,'#ffffff');streak.addColorStop(.55,color+'00');streak.addColorStop(1,'#00000000');
    ctx.globalAlpha*=.45;ctx.fillStyle=streak;ctx.fillRect(-r*1.5,-.55,r*3,1.1);
    ctx.globalAlpha*=.5;ctx.fillRect(-.45,-r*.55,.9,r*1.1);ctx.restore();
  }
  function drawOreSprite(ctx,art,x,y,size,glow,treated){
    if(window.nativeOreSpriteCache)return window.nativeOreSpriteCache.draw(ctx,art,{x,y,size,glow,treated});
    if(!art.complete||!art.naturalWidth)return false;
    ctx.drawImage(art,x-size/2,y-size/2,size,size);return true;
  }
  function drawOreTransport(ctx,entry,{ship,cx,cy,now,zoom,w,h}){
    const elapsed=now-entry.born,local=elapsed-650,progress=clamp(local/1350,0,1);
    if(progress>=1)return;
    const x=cx+entry.position.x-ship.x,y=cy+entry.position.y-ship.y,size=entry.rock.size*.22;
    // Include shimmer jitter, the flare's longest streak and shadow spill.
    if(!window.nativeEffectVisibility.circle(cx+(x-cx)*zoom,cy+(y-cy)*zoom,size*2*zoom+36,{w,h}))return;
    const ore=window.nativeSolAsteroids.image(entry.rock.oreImage);
    if(!ore.complete||!ore.naturalWidth)return;
    ctx.save();ctx.translate(x,y);
    if(local<0){drawOreSprite(ctx,ore,0,0,size,0,false);ctx.restore();return;}
    const pixels=transportPixels(ore);if(!pixels){ctx.restore();return;}
    const solid=1-clamp((progress-.08)/.62,0,1);
    if(solid>0){ctx.globalAlpha=solid;drawOreSprite(ctx,ore,0,0,size,3+progress*8,false);}
    ctx.globalCompositeOperation='lighter';
    const shimmer=Math.sin(Math.PI*progress),fade=1-clamp((progress-.66)/.34,0,1);
    for(const pixel of pixels){
      const phase=(pixel.seed+entry.index*.13)%1;
      if(progress<phase*.42||progress>.48+phase*.52)continue;
      const flicker=.55+.45*Math.sin(now*.025+phase*41);
      ctx.globalAlpha=shimmer*fade*flicker*(.55+pixel.seed*.45);
      ctx.fillStyle=pixel.seed>.85?'#f4ffff':pixel.color;
      const jitter=Math.sin(now*.008+phase*23)*Math.min(1.5,progress*2),px=pixel.x*size+jitter,py=pixel.y*size-Math.min(2,progress*2)*pixel.seed;
      const pointSize=pixel.seed>.9?2:1.4;
      ctx.fillRect(px,py,pointSize,pointSize);
    }
    drawMiningFlare(ctx,0,0,size*1.2,'#b4eaff',Math.sin(Math.PI*progress)*.18);
    ctx.restore();
  }
  function extractRockShard(im,cx,cy,radius){
    const sides=5+Math.floor(Math.random()*4),start=Math.random()*Math.PI*2,vertices=[];
    for(let i=0;i<sides;i++){const a=start+i*Math.PI*2/sides,r=radius*(.66+Math.random()*.48);vertices.push({x:clamp(cx+Math.cos(a)*r,0,im.width),y:clamp(cy+Math.sin(a)*r,0,im.height)});}
    const left=Math.max(0,Math.floor(Math.min(...vertices.map(p=>p.x)))),top=Math.max(0,Math.floor(Math.min(...vertices.map(p=>p.y)))),right=Math.min(im.width,Math.ceil(Math.max(...vertices.map(p=>p.x)))),bottom=Math.min(im.height,Math.ceil(Math.max(...vertices.map(p=>p.y))));
    if(right-left<3||bottom-top<3)return null;
    const texture=document.createElement('canvas');texture.width=right-left;texture.height=bottom-top;const g=texture.getContext('2d');
    g.beginPath();vertices.forEach((p,i)=>i?g.lineTo(p.x-left,p.y-top):g.moveTo(p.x-left,p.y-top));g.closePath();g.clip();g.drawImage(im,-left,-top);
    return{texture,x:cx/im.width-.5,y:cy/im.height-.5,w:texture.width/im.width,h:texture.height/im.height};
  }
  function makeRockShards(rock,{chips=false}={}){
    const im=chips?window.nativeSolAsteroids.peekImage?.(rock.file):window.nativeSolAsteroids.image(rock.file);if(!im?.complete||!im.naturalWidth)return[];
    const pieces=[];
    for(let i=0;i<(chips?3:22);i++){
      const cx=im.width*(.15+Math.random()*.7),cy=im.height*(.15+Math.random()*.7),piece=extractRockShard(im,cx,cy,im.width*(.045+Math.random()*.075));if(!piece)continue;
      const angle=Math.atan2(piece.y,piece.x)+(Math.random()-.5)*.75;
      pieces.push({...piece,angle,speed:chips?35+Math.random()*55:(80+Math.random()*190)*1.9,spin:(Math.random()-.5)*7,ttl:chips?1000+Math.random()*800:(1500+Math.random()*1300)*2.2});
    }
    return pieces;
  }
  function finishRock(state,rock,fromMining,onFinish){
    activeState=state;
    if(gone(state,rock.slotId))return;
    window.nativeAsteroidMotion?.freeze(state,rock);
    window.nativeShipSystems?.invalidate(state,rock.system??state.system);
    if(targetId===rock.slotId)targetId=null;
    if(fromMining)state.minedAsteroids=[...(state.minedAsteroids||[]),rock.slotId];
    else state.destroyedAsteroids=[...(state.destroyedAsteroids||[]),rock.slotId];
    if(fromMining||rock.oreType!=='deuranium'&&(rock.guaranteedOre||((rock.slotId*37+17)%100)<5)){
      state.asteroidOreDrops ||= {};
      state.asteroidOreDrops[rock.slotId]=fromMining?15:1;
    }
    if(!fromMining){
      bursts.push({rock,born:now(),pieces:makeRockShards(rock)});
      window.nativeEnvironmentalImpacts?.explode(state,{...rock,system:rock.system??1},{sourceKey:'asteroid:'+rock.slotId});
    }
    if(bursts.length>12)bursts.shift();
    onFinish?.(rock,!!state.asteroidOreDrops?.[rock.slotId],fromMining);
  }
  function destroy(state,rockOrId,onFinish){
    const rock=typeof rockOrId==='object'?rockOrId:rockById(rockOrId);
    if(!rock||gone(state,rock.slotId))return {ok:false,destroyed:false};
    finishRock(state,rock,false,onFinish);return {ok:true,destroyed:true};
  }
  function completeMining(state,rockOrId,onFinish){
    const rock=typeof rockOrId==='object'?rockOrId:rockById(rockOrId);
    if(!rock||gone(state,rock.slotId))return {ok:false};
    finishRock(state,rock,true,onFinish);return {ok:true,rock,oreMask:state.asteroidOreDrops[rock.slotId]};
  }
  function hit(state,id,damage,impact=null,onFinish){
    const rock=rockById(id);
    if(!rock||gone(state,id))return {ok:false,destroyed:false};
    activeState=state;state.asteroidDamage||={};
    const maximum=Math.max(1,Number(rock.maxHull)||rock.size*.45),before=Number(state.asteroidDamage[id])||0;
    // All environmental damage shares this floor. Never heal older saves that
    // already contain a rock below 25%, and never call the destruction path.
    const after=before>=maximum*.75?before:Math.min(maximum*.75,before+Math.max(0,Number(damage)||0));
    state.asteroidDamage[id]=after;
    const stage=value=>Math.min(3,Math.floor(value/maximum*4+1e-9)),changedStage=stage(after)>stage(before);
    if(changedStage&&(rock.system??1)===state.system){
      const pieces=makeRockShards(rock,{chips:true});
      if(pieces.length){bursts.push({rock:{...rock},born:now(),pieces,chips:true});if(bursts.length>12)bursts.shift();}
    }
    return {ok:true,destroyed:false,hull:Math.max(0,maximum-after),damage:after-before,changedStage};
  }
  // Combat hits are lethal regardless of weapon strength. Environmental hits
  // stop at 25% remaining health, separate from the mining entitlement.
  function weaponHit(state,id,damage,impact=null,onFinish){return destroy(state,id,onFinish);}
  function debrisHit(state,id,impact){const rock=rockById(id);return rock?hit(state,id,Math.max(1,Number(rock.maxHull)||rock.size*.45)*.25,impact):{ok:false};}
  function miningDamage(state,rock,seconds){
    if(rock?.oreType!=='deuranium'||gone(state,rock.slotId))return;
    const damage=rock.maxHull*.75*clamp(seconds/6,0,1),before=Number(state.asteroidDamage?.[rock.slotId])||0;
    if(damage>before)hit(state,rock.slotId,damage-before);
  }
  function fire(state,ship,shipWidth,shipHeight,onFinish){
    activeState=state;
    const rock=target();
    if(!rock||gone(state,rock.slotId))return{ok:false,error:'Click an intact asteroid to target it first.'};
    if(window.nativeCivilianTraffic?.isMiningRock(state,rock.slotId))return{ok:false,error:'A civilian miner is working this asteroid.'};
    if(mining)return{ok:false,error:'Mining laser is cutting this asteroid.'};
    const result=window.nativeCombatShots.fire({state,shipHeight,owner:'asteroid',
      getTarget:()=>state.system===(rock.system??1)&&!gone(state,rock.slotId)?{...rock,id:'rock:'+rock.slotId,rockId:rock.slotId,heading:rock.angle||0}:null,
      dimensions:()=>({width:rock.size,height:rock.size}),shielded:()=>false,
      onResolved(result){if(result.kind==='hit'&&result.target?.rockId===rock.slotId&&result.damage?.destroyed)onFinish?.(rock,!!state.asteroidOreDrops?.[rock.slotId],false);}});
    return result;
  }

  function mine(state,ship,onFinish){
    activeState=state;
    const rock=target();
    if(!rock||gone(state,rock.slotId))return{ok:false,error:'Target an intact asteroid to mine.'};
    if((rock.system??state.system)!==state.system)return{ok:false,error:'Choose an asteroid in this system.'};
    if(window.nativeCivilianTraffic?.isMiningRock(state,rock.slotId))return{ok:false,error:'A civilian miner is working this asteroid.'};
    if(window.nativeShipDefinitions.get(state.shipType,'player').capabilities.canMine===false)return{ok:false,error:'This ship cannot use mining equipment.'};
    if(window.nativeShipEquipment?!window.nativeShipEquipment.has(state,state,'mining-laser'):!state.miningTool)return{ok:false,error:'Buy the mining laser at a planet shop first.'};
    if(mining)return{ok:false,error:'Mining already in progress.'};
    if(distance(rock,ship)>360)return{ok:false,error:'Move within 360 units of the asteroid to mine.'};
    activeState=state;
    state.miningOperation={version:1,rockId:rock.slotId,source:{...ship},born:now(),system:state.system,finished:false};
    mining={rock,ship:{...ship},born:now(),onFinish,state,effect:null,finished:false};
    return{ok:true,message:'Mining laser engaged. Watch the cutting sequence.'};
  }
  function oreHit(state,ship,{cx,cy,zoom,x,y}){
    for(const [id,count] of Object.entries(state.asteroidOreDrops||{})){
      if(!count)continue;
      const rock=rockById(Number(id),state.system);if(!rock)continue;
      const mined=state.minedAsteroids?.includes(rock.slotId);
      if(mined){
        const sx=cx+(rock.x-ship.x)*zoom,sy=cy+(rock.y-ship.y)*zoom;
        if(Math.hypot(x-sx,y-sy)<=oreShieldRadius(rock)*zoom+4)return{rock,indices:[0,1,2,3].filter(i=>count&(1<<i))};
        continue;
      }
      for(let i=0;i<3;i++){
        if(!(count&(1<<i)))continue;
        const p=orePosition(rock,i),sx=cx+(p.x-ship.x)*zoom,sy=cy+(p.y-ship.y)*zoom;
        if(Math.hypot(x-sx,y-sy)<Math.max(12,rock.size*.12*zoom))return{rock,indices:[i]};
      }
    }
    return null;
  }
  function drawCombatTargetFrame(ctx,{name,size,kind='ASTEROID',shield=0,hull=1,color='#ff7777'},x,y,zoom,cx){
    window.drawShowcaseTargetFrame(ctx,{
      x,y,w:size,h:size,name,kind,shield,hull,zoom,color,
      rightEdge:cx+(ctx.canvas.width-cx)/zoom-15/zoom
    });
  }
  function drawOreShieldRing(ctx,x,y,r,zoom,alpha=1){
    ctx.save();ctx.translate(x,y);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha;
    const glow=ctx.createRadialGradient(0,0,r*.35,0,0,r);
    glow.addColorStop(0,'rgba(24,110,205,0)');glow.addColorStop(.78,'rgba(32,136,236,.06)');glow.addColorStop(1,'rgba(78,205,255,.22)');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.72*alpha;ctx.strokeStyle='#71dcff';ctx.lineWidth=1.7/zoom;ctx.shadowColor='#31baff';ctx.shadowBlur=11/zoom;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();
    ctx.shadowBlur=0;ctx.globalAlpha=.3*alpha;ctx.lineWidth=.6/zoom;ctx.beginPath();ctx.arc(0,0,r-5/zoom,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  function advance(state,dt){
    if(window.nativeSimulation.blocked()||!(dt>0))return;
    activeState=state;const time=now();
    if(targetId!==null&&targetSystem!==state.system)deselect();
    const operation=state.miningOperation;
    if(operation&&operation.system!==state.system){delete state.miningOperation;mining=null;}
    else if(operation&&(!mining||mining.state!==state)){
      const rock=rockById(operation.rockId,operation.system);
      if(rock)mining={rock,ship:operation.source,born:operation.born,finished:operation.finished,state,effect:null};
      else delete state.miningOperation;
    }
    if(mining&&!mining.finished){
      const source=state.system===1?window.vexedSolFlight.shipPosition(state):state;
      if(gone(state,mining.rock.slotId)||distance(source,mining.rock)>360){mining=null;delete state.miningOperation;}
      else{mining.ship={x:source.x,y:source.y};if(state.miningOperation)state.miningOperation.source={...mining.ship};}
    }
    if(mining){
      const age=time-mining.born;
      if(!mining.finished)miningDamage(state,mining.rock,age/1000);
      if(age>=miningTiming.cutSeconds*1000&&!mining.finished){
        mining.finished=true;if(state.miningOperation)state.miningOperation.finished=true;
        completeMining(state,mining.rock,mining.onFinish);
      }
      if(age>=miningTiming.animationSeconds*1000){mining=null;delete state.miningOperation;}
    }
    for(const burst of [...bursts]){
      for(const piece of burst.pieces){
        if(time-burst.born>piece.ttl)continue;
        piece.environmentPiece||={system:burst.rock.system??1,size:Math.max(2,Math.hypot(piece.w,piece.h)*burst.rock.size*.4),
          x:burst.rock.x+piece.x*burst.rock.size,y:burst.rock.y+piece.y*burst.rock.size,
          vx:(burst.rock.vx||0)+Math.cos(piece.angle)*piece.speed,vy:(burst.rock.vy||0)+Math.sin(piece.angle)*piece.speed,spin:piece.spin,angle:burst.rock.angle};
        const p=piece.environmentPiece,oldX=p.x,oldY=p.y,elapsed=Math.min(dt,Math.max(0,(time-(piece.updatedAt??burst.born))/1000));
        p.x+=p.vx*elapsed;p.y+=p.vy*elapsed;p.angle+=p.spin*elapsed;piece.updatedAt=time;
        window.nativeEnvironmentalImpacts?.debris(state,p,oldX,oldY,{sourceKey:'asteroid:'+burst.rock.slotId,dt:elapsed});
        piece.worldX=p.x;piece.worldY=p.y;
      }
    }
    bursts=bursts.filter(burst=>time-burst.born<6200);
    collections=collections.filter(entry=>time-entry.born<2500);
    collectionFields=collectionFields.filter(entry=>time-entry.born<2300);
  }
  function paint(ctx,{state,ship,cx,cy,zoom,w=cx*2,h=cy*2}){
    const time=window.nativeSimulation.now(state);const now=time;
    const visible=(x,y,r)=>window.nativeEffectVisibility.circle(x,y,r,{w,h});
    const oreVisible=(x,y,r)=>visible(cx+(x-cx)*zoom,cy+(y-cy)*zoom,r*zoom+36);
    const rock=target();
    if(rock&&(rock.system??1)===state.system&&!gone(state,rock.slotId)&&mining?.rock.slotId!==rock.slotId&&!window.nativeCivilianTraffic?.isMiningRock(state,rock.slotId)){
      const x=cx+rock.x-ship.x,y=cy+rock.y-ship.y;
      drawCombatTargetFrame(ctx,{name:rock.name,size:rock.size,kind:'ASTEROID',hull:1-(Number(state.asteroidDamage?.[rock.slotId])||0)/Math.max(1,rock.maxHull),selectedAt},x,y,zoom,cx);
    }
    for(const burst of bursts){
      if((burst.rock.system??1)!==state.system)continue;
      const age=now-burst.born,t=age/1000,x=cx+burst.rock.x-ship.x,y=cy+burst.rock.y-ship.y;
      if(!burst.chips&&age<260&&visible(x,y,(16+burst.rock.size*.72)/zoom)){const blast=age/260;ctx.save();ctx.globalAlpha=1-blast;ctx.strokeStyle='#e5b979';ctx.lineWidth=(2+5*(1-blast))/zoom;
        ctx.beginPath();ctx.ellipse(x,y,(12+blast*burst.rock.size*.72)/zoom,(10+blast*burst.rock.size*.72)/zoom,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
      for(const p of burst.pieces){
        if(age>p.ttl)continue;
        const px=cx+(p.worldX??burst.rock.x+p.x*burst.rock.size)-ship.x,py=cy+(p.worldY??burst.rock.y+p.y*burst.rock.size)-ship.y;
        if(!visible(px,py,Math.hypot(p.w,p.h)*burst.rock.size/2))continue;
        ctx.save();ctx.globalAlpha=Math.min(1,(p.ttl-age)/500);ctx.translate(px,py);ctx.rotate(p.environmentPiece?.angle??burst.rock.angle+p.spin*t);
        ctx.drawImage(p.texture,-p.w*burst.rock.size/2,-p.h*burst.rock.size/2,p.w*burst.rock.size,p.h*burst.rock.size);
        ctx.restore();
      }
    }
    if(mining){
      const m=mining,age=now-m.born,r=m.rock;
      window.nativeAsteroidMiningEffects?.draw(ctx,m,{
        x:cx+r.x-ship.x,y:cy+r.y-ship.y,
        source:{x:cx+m.ship.x-ship.x,y:cy+m.ship.y-ship.y},zoom,now,w,h
      });

    }
    for(const [id,count] of Object.entries(state.asteroidOreDrops||{})){
      if(!count)continue;
      const r=rockById(Number(id),state.system);if(!r)continue;
      const x=cx+r.x-ship.x,y=cy+r.y-ship.y;
      // Reject the entire field before image requests, filters or shield work.
      if(!oreVisible(x,y,r.size*.5))continue;
      let art=null;
      if(state.minedAsteroids?.includes(r.slotId)&&oreVisible(x,y,oreShieldRadius(r)))drawOreShieldRing(ctx,x,y,oreShieldRadius(r),zoom);
      for(let i=0;i<(state.minedAsteroids?.includes(r.slotId)?4:3);i++){
        if(!(count&(1<<i)))continue;
        const p=orePosition(r,i,state.minedAsteroids?.includes(r.slotId)),x=cx+p.x-ship.x,y=cy+p.y-ship.y,s=r.size*.22;
        if(!oreVisible(x,y,s/2))continue;
        art||=window.nativeSolAsteroids.image(r.oreImage);
        const growth=clamp((now-(mining?.rock.slotId===r.slotId?mining.born+7150:bursts.find(b=>b.rock.slotId===r.slotId)?.born||0))/800,0,1),drawSize=s*(.015+.985*growth);
        ctx.save();ctx.globalAlpha=.25+.75*growth;
        if(art.complete&&art.naturalWidth)drawOreSprite(ctx,art,x,y,drawSize,12/zoom,true);
        else{ctx.fillStyle='#a9e8ed';ctx.beginPath();ctx.arc(x,y,s*.35,0,Math.PI*2);ctx.fill();}
        ctx.restore();
      }
    }
    for(const field of collectionFields){
      if((field.rock.system??1)!==state.system)continue;
      const x=cx+field.rock.x-ship.x,y=cy+field.rock.y-ship.y,r=oreShieldRadius(field.rock),fade=1-clamp((now-field.born-1800)/500,0,1);
      if(fade>0&&oreVisible(x,y,r))drawOreShieldRing(ctx,x,y,r,zoom,fade);
    }
    for(const entry of collections){if((entry.rock.system??1)===state.system)drawOreTransport(ctx,entry,{ship,cx,cy,now,zoom,w,h});}
  }
  window.nativeAsteroidCombat={select,deselect,autoTarget,clear,collect,collectField,fire,hit,weaponHit,debrisHit,destroy,completeMining,miningTiming,miningDamage,mine,oreHit,advance,paint,weaponVisual,drawTargetFrame:drawCombatTargetFrame,metrics:()=>({bursts:bursts.length,chips:bursts.filter(b=>b.chips).length,pieces:bursts.reduce((n,b)=>n+b.pieces.length,0)}),get target(){return target();},get miningId(){return mining?.rock.slotId??null;}};
})();
