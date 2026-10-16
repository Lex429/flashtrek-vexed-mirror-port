/* Showcase weapon and mining effects adapted to the Sol flight coordinates. */
(() => {
  'use strict';
  let targetId=null,selectedAt=0,bursts=[],collections=[],collectionFields=[],mining=null;
  let activeState=null;
  const now=()=>window.nativeSimulation.now(activeState);
  const placements=()=>window.nativeSolAsteroids?.placements||[];
  const target=()=>placements().find(rock=>rock.slotId===targetId)||null;
  const gone=(state,id)=>state.destroyedAsteroids?.includes(id)||state.minedAsteroids?.includes(id);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const orePosition=(rock,index,mined=false)=>{const [dx,dy]=(mined?[[-.1144,-.1144],[.1144,-.1144],[-.1144,.1144],[.1144,.1144]]:[[0,-.172],[-.172,.095],[.172,.095]])[index]||[0,0];return{x:rock.x+dx*rock.size,y:rock.y+dy*rock.size};};
  const oreShieldRadius=rock=>rock.size*.36;
  const weaponVisual=weapon=>window.nativeCombatShots.weaponVisual(weapon);
  function select(rock){if(targetId!==rock.slotId)selectedAt=now();targetId=rock.slotId;return rock;}
  function deselect(){targetId=null;}
  function autoTarget(state,ship,{cx,cy,zoom,w,h}){
    const nearby=placements().filter(rock=>!gone(state,rock.slotId)&&distance(rock,ship)<=650);
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
    const sampleCtx=sample.getContext('2d');sampleCtx.drawImage(ore,0,0,24,24);
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
  function drawOreTransport(ctx,entry,{ship,cx,cy,now}){
    const elapsed=now-entry.born,shieldFade=650,ore=window.nativeSolAsteroids.image(entry.rock.oreImage);
    const pixels=transportPixels(ore);if(!pixels)return;
    const local=elapsed-shieldFade,progress=clamp(local/1350,0,1);
    if(progress>=1)return;
    const x=cx+entry.position.x-ship.x,y=cy+entry.position.y-ship.y,size=entry.rock.size*.22;
    ctx.save();ctx.translate(x,y);
    if(local<0){ctx.drawImage(ore,-size/2,-size/2,size,size);ctx.restore();return;}
    const solid=1-clamp((progress-.08)/.62,0,1);
    if(solid>0){ctx.globalAlpha=solid;ctx.shadowColor='#bdeaff';ctx.shadowBlur=3+progress*8;ctx.drawImage(ore,-size/2,-size/2,size,size);}
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
  function makeRockShards(rock){
    const im=window.nativeSolAsteroids.image(rock.file);if(!im.complete||!im.naturalWidth)return[];
    const pieces=[];
    for(let i=0;i<22;i++){
      const cx=im.width*(.15+Math.random()*.7),cy=im.height*(.15+Math.random()*.7),piece=extractRockShard(im,cx,cy,im.width*(.045+Math.random()*.075));if(!piece)continue;
      const angle=Math.atan2(piece.y,piece.x)+(Math.random()-.5)*.75;
      pieces.push({...piece,angle,speed:(80+Math.random()*190)*1.9,spin:(Math.random()-.5)*7,ttl:(1500+Math.random()*1300)*2.2});
    }
    return pieces;
  }
  function finishRock(state,rock,fromMining,onFinish){
    activeState=state;
    if(gone(state,rock.slotId))return;
    if(targetId===rock.slotId)targetId=null;
    if(fromMining)state.minedAsteroids=[...(state.minedAsteroids||[]),rock.slotId];
    else state.destroyedAsteroids=[...(state.destroyedAsteroids||[]),rock.slotId];
    if(fromMining||rock.guaranteedOre||((rock.slotId*37+17)%100)<5){
      state.asteroidOreDrops ||= {};
      state.asteroidOreDrops[rock.slotId]=fromMining?15:1;
    }
    if(!fromMining){
      bursts.push({rock,born:now(),pieces:makeRockShards(rock)});
      window.nativeEnvironmentalImpacts?.explode(state,{...rock,system:1},{sourceKey:'asteroid:'+rock.slotId});
    }
    if(bursts.length>12)bursts.shift();
    onFinish?.(rock,!!state.asteroidOreDrops?.[rock.slotId],fromMining);
  }
  function destroy(state,rockOrId,onFinish){
    const rock=typeof rockOrId==='object'?rockOrId:placements().find(entry=>entry.slotId===rockOrId);
    if(!rock||gone(state,rock.slotId))return {ok:false,destroyed:false};
    finishRock(state,rock,false,onFinish);return {ok:true,destroyed:true};
  }
  function hit(state,id,damage,impact=null,onFinish){
    const rock=placements().find(entry=>entry.slotId===id);
    if(!rock||gone(state,id))return {ok:false,destroyed:false};
    state.asteroidDamage||={};
    state.asteroidDamage[id]=(Number(state.asteroidDamage[id])||0)+Math.max(0,Number(damage)||0);
    if(state.asteroidDamage[id]>=Math.max(1,Number(rock.maxHull)||rock.size*.45))return destroy(state,rock,onFinish);
    return {ok:true,destroyed:false,hull:Math.max(0,(Number(rock.maxHull)||rock.size*.45)-state.asteroidDamage[id])};
  }
  function fire(state,ship,shipWidth,shipHeight,onFinish){
    activeState=state;
    const rock=target();
    if(!rock||gone(state,rock.slotId))return{ok:false,error:'Click an intact asteroid to target it first.'};
    if(window.nativeCivilianTraffic?.isMiningRock(state,rock.slotId))return{ok:false,error:'A civilian miner is working this asteroid.'};
    if(mining)return{ok:false,error:'Mining laser is cutting this asteroid.'};
    const result=window.nativeCombatShots.fire({state,shipHeight,owner:'asteroid',
      getTarget:()=>state.system===1&&!gone(state,rock.slotId)?{...rock,id:'rock:'+rock.slotId,rockId:rock.slotId,heading:rock.angle||0}:null,
      dimensions:()=>({width:rock.size,height:rock.size}),shielded:()=>false,
      onResolved(result){if(result.kind==='hit'&&result.target?.rockId===rock.slotId&&result.damage?.destroyed)onFinish?.(rock,!!state.asteroidOreDrops?.[rock.slotId],false);}});
    return result;
  }

  function mine(state,ship,onFinish){
    activeState=state;
    const rock=target();
    if(!rock||gone(state,rock.slotId))return{ok:false,error:'Target an intact asteroid to mine.'};
    if(window.nativeCivilianTraffic?.isMiningRock(state,rock.slotId))return{ok:false,error:'A civilian miner is working this asteroid.'};
    if(!state.miningTool)return{ok:false,error:'Buy the mining laser at a planet shop first.'};
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
      const rock=placements().find(entry=>entry.slotId===Number(id));if(!rock)continue;
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
    const operation=state.miningOperation;
    if(operation&&operation.system!==state.system){delete state.miningOperation;mining=null;}
    else if(operation&&(!mining||mining.state!==state)){
      const rock=placements().find(entry=>entry.slotId===operation.rockId);
      if(rock)mining={rock,ship:operation.source,born:operation.born,finished:operation.finished,state,effect:null};
      else delete state.miningOperation;
    }
    if(mining){
      const age=time-mining.born;
      if(age>=7150&&!mining.finished){
        mining.finished=true;if(state.miningOperation)state.miningOperation.finished=true;
        finishRock(state,mining.rock,true,mining.onFinish);
      }
      if(age>=8500){mining=null;delete state.miningOperation;}
    }
    for(const burst of [...bursts]){
      const t=(time-burst.born)/1000;
      for(const piece of burst.pieces){
        if(time-burst.born>piece.ttl)continue;
        const x=burst.rock.x+piece.x*burst.rock.size+Math.cos(piece.angle)*piece.speed*t;
        const y=burst.rock.y+piece.y*burst.rock.size+Math.sin(piece.angle)*piece.speed*t;
        piece.environmentPiece||={system:1,size:Math.max(2,Math.hypot(piece.w,piece.h)*burst.rock.size*.4)};
        Object.assign(piece.environmentPiece,{x,y});
        window.nativeEnvironmentalImpacts?.debris(state,piece.environmentPiece,piece.worldX??burst.rock.x+piece.x*burst.rock.size,piece.worldY??burst.rock.y+piece.y*burst.rock.size,{sourceKey:'asteroid:'+burst.rock.slotId});
        piece.worldX=x;piece.worldY=y;
      }
    }
    bursts=bursts.filter(burst=>time-burst.born<6200);
    collections=collections.filter(entry=>time-entry.born<2500);
    collectionFields=collectionFields.filter(entry=>time-entry.born<2300);
  }
  function paint(ctx,{state,ship,cx,cy,zoom,w=cx*2,h=cy*2}){
    const time=window.nativeSimulation.now(state);const now=time;
    if(state.system!==1)return;
    const visible=(x,y,r)=>window.nativeEffectVisibility.circle(x,y,r,{w,h});
    const rock=target();
    if(rock&&!gone(state,rock.slotId)&&mining?.rock.slotId!==rock.slotId&&!window.nativeCivilianTraffic?.isMiningRock(state,rock.slotId)){
      const x=cx+rock.x-ship.x,y=cy+rock.y-ship.y;
      drawCombatTargetFrame(ctx,{name:rock.name,size:rock.size,kind:'ASTEROID',hull:1-(Number(state.asteroidDamage?.[rock.slotId])||0)/Math.max(1,rock.maxHull),selectedAt},x,y,zoom,cx);
    }
    for(const burst of bursts){
      const age=now-burst.born,t=age/1000,x=cx+burst.rock.x-ship.x,y=cy+burst.rock.y-ship.y;
      if(age<260&&visible(x,y,(16+burst.rock.size*.72)/zoom)){const blast=age/260;ctx.save();ctx.globalAlpha=1-blast;ctx.strokeStyle='#e5b979';ctx.lineWidth=(2+5*(1-blast))/zoom;
        ctx.beginPath();ctx.ellipse(x,y,(12+blast*burst.rock.size*.72)/zoom,(10+blast*burst.rock.size*.72)/zoom,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
      for(const p of burst.pieces){
        if(age>p.ttl)continue;
        const px=x+p.x*burst.rock.size+Math.cos(p.angle)*p.speed*t,py=y+p.y*burst.rock.size+Math.sin(p.angle)*p.speed*t;
        if(!visible(px,py,Math.hypot(p.w,p.h)*burst.rock.size/2))continue;
        ctx.save();ctx.globalAlpha=Math.min(1,(p.ttl-age)/500);ctx.translate(px,py);ctx.rotate(burst.rock.angle+p.spin*t);
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
      const r=placements().find(entry=>entry.slotId===Number(id));if(!r)continue;
      const art=window.nativeSolAsteroids.image(r.oreImage);
      if(state.minedAsteroids?.includes(r.slotId)&&count)drawOreShieldRing(ctx,cx+r.x-ship.x,cy+r.y-ship.y,oreShieldRadius(r),zoom);
      for(let i=0;i<(state.minedAsteroids?.includes(r.slotId)?4:3);i++){
        if(!(count&(1<<i)))continue;
        const p=orePosition(r,i,state.minedAsteroids?.includes(r.slotId)),x=cx+p.x-ship.x,y=cy+p.y-ship.y,s=r.size*.22;
        const growth=clamp((now-(mining?.rock.slotId===r.slotId?mining.born+7150:bursts.find(b=>b.rock.slotId===r.slotId)?.born||0))/800,0,1),drawSize=s*(.015+.985*growth);
        ctx.save();ctx.globalAlpha=.25+.75*growth;ctx.shadowColor='#65dfff';ctx.shadowBlur=12/zoom;ctx.filter='brightness(1.16) saturate(1.18)';
        if(art.complete&&art.naturalWidth)ctx.drawImage(art,x-drawSize/2,y-drawSize/2,drawSize,drawSize);
        else{ctx.fillStyle='#a9e8ed';ctx.beginPath();ctx.arc(x,y,s*.35,0,Math.PI*2);ctx.fill();}
        ctx.restore();
      }
    }
    for(const field of collectionFields){const fade=1-clamp((now-field.born-1800)/500,0,1);drawOreShieldRing(ctx,cx+field.rock.x-ship.x,cy+field.rock.y-ship.y,oreShieldRadius(field.rock),zoom,fade);}
    for(const entry of collections)drawOreTransport(ctx,entry,{ship,cx,cy,now});
  }
  window.nativeAsteroidCombat={select,deselect,autoTarget,clear,collect,collectField,fire,hit,destroy,mine,oreHit,advance,paint,weaponVisual,drawTargetFrame:drawCombatTargetFrame,get target(){return target();},get miningId(){return mining?.rock.slotId??null;}};
})();
