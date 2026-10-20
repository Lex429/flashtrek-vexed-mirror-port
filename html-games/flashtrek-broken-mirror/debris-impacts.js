/* Shared contact collection. Live scenes supply physical debris response and
   environmental damage policy; the artwork showcase supplies its own adapter. */
(() => {
  'use strict';
  function sweptCircleContact(from,to,center,radius){
    const dx=to.x-from.x,dy=to.y-from.y,fx=from.x-center.x,fy=from.y-center.y,c=fx*fx+fy*fy-radius*radius;
    if(c<=0)return {x:from.x,y:from.y,t:0};
    const a=dx*dx+dy*dy;if(!a)return null;
    const b=2*(fx*dx+fy*dy),disc=b*b-4*a*c;if(disc<0)return null;
    const t=(-b-Math.sqrt(disc))/(2*a);
    return t>=0&&t<=1?{x:from.x+dx*t,y:from.y+dy*t,t}:null;
  }
  window.createEnvironmentalImpacts=({getShips=()=>[],getAsteroids=()=>[],queryTargets=null,querySource=null,onCandidates=()=>{},onShipImpact=()=>{},onAsteroidHit=()=>{},debrisContact=null,resolveDebris=null}={})=>{
    let waves=[],pieceHits=new WeakMap(),sourceCleared=new WeakSet(),history=[];
    const key=(type,target)=>`${type}:${target.id??target.slotId}`;
    const radius=target=>Math.max(1,Number(target.radius)||Number(target.size)*.45||Math.hypot(target.w||0,target.h||0)*.5);
    const position=target=>({x:target.centerX??target.x,y:target.centerY??target.y});
    const matches=(source,target)=>source.system==null||target.system==null||source.system===target.system;
    const targetsIn=(bounds,swept)=>queryTargets?.(bounds,{swept})||{ships:getShips(),asteroids:getAsteroids()};
    function record(type,target,event){
      history.push({target:key(type,target),...event});if(history.length>80)history.shift();
      if(type==='ship')onShipImpact(target,event);else onAsteroidHit(target,event);
    }
    function explode({x,y,born=0,radius=500,duration=900,sourceKey=null,system=null,affectAsteroids=true}={}){
      if(!Number.isFinite(x)||!Number.isFinite(y)||radius<=0)return;
      waves.push({x,y,born,radius,duration:Math.max(1,duration),sourceKey,system,affectAsteroids,hits:new Set()});
      if(waves.length>40)waves.shift();
    }
    function update(time){
      for(const wave of [...waves]){
        const age=time-wave.born;if(age<0)continue;
        const reach=wave.radius*Math.min(1,age/wave.duration);
        // Pressure flashes keep their existing visual radii, which can exceed
        // physical contact radii slightly. Their rare full view is cached by
        // the host; physical fragments below use the spatial query instead.
        const nearby=targetsIn(null,false);
        for(const [type,targets] of [['ship',nearby.ships],['asteroid',nearby.asteroids]])for(const target of targets){
          if(type==='asteroid'&&!wave.affectAsteroids)continue;
          const id=key(type,target);if(id===wave.sourceKey||wave.hits.has(id)||!matches(wave,target))continue;
          const center=position(target),dx=center.x-wave.x,dy=center.y-wave.y,distance=Math.hypot(dx,dy),r=radius(target);
          if(distance-r>reach)continue;
          wave.hits.add(id);const length=distance||1;
          record(type,target,{x:center.x-dx/length*r,y:center.y-dy/length*r,born:time,kind:'explosion',from:{x:wave.x,y:wave.y},visualOnly:true});
        }
      }
      waves=waves.filter(wave=>time-wave.born<=wave.duration);
    }
    function stepDebris(piece,oldX,oldY,time,{sourceKey=null,system=null,skipShips=false}={}){
      if(time<(piece.born||0)||piece.ore)return [];
      let hits=pieceHits.get(piece);if(!hits){hits=new Set();pieceHits.set(piece,hits);}
      const from={x:oldX,y:oldY},to={x:piece.x,y:piece.y},padding=Math.min(12,Math.max(piece.w||0,piece.h||0,piece.size||0)*.25),contacts=[];
      const margin=Math.max(padding,(piece.size||0)*.43),nearby=targetsIn({minX:Math.min(from.x,to.x)-margin,minY:Math.min(from.y,to.y)-margin,maxX:Math.max(from.x,to.x)+margin,maxY:Math.max(from.y,to.y)+margin},true);
      let tested=0,best=null,sourceSeen=false;
      for(const [type,targets] of [['ship',nearby.ships],['asteroid',nearby.asteroids]])for(const target of targets){
        if(skipShips&&type==='ship')continue;
        const id=key(type,target);if((!resolveDebris&&hits.has(id))||!matches({system},target))continue;
        if(id===sourceKey)sourceSeen=true;
        if(id===sourceKey&&(!resolveDebris||!sourceCleared.has(piece))){
          const center=position(target),r=target.descriptor?.hullRadii||target.descriptor?.radii,bound=r?Math.max(r.rx,r.ry):radius(target);
          if(resolveDebris&&Math.hypot(to.x-center.x,to.y-center.y)>bound+padding)sourceCleared.add(piece);
          continue; // Birth immunity ends once the fragment leaves its parent.
        }
        tested++;
        const contact=debrisContact?debrisContact(piece,from,target,type):sweptCircleContact(from,to,position(target),radius(target)+padding);
        if(contact){const entry={type,target,id,contact};if(resolveDebris){if(!best||contact.t<best.contact.t)best=entry;}else contacts.push(entry);}
      }
      // A fragment can already be outside its parent on its first sample.
      // Narrow bounds then omit that parent; end birth immunity through one
      // direct lookup so the first returning fragment still rebounds.
      if(resolveDebris&&sourceKey&&!sourceSeen&&!sourceCleared.has(piece)&&!(skipShips&&sourceKey.startsWith('ship:'))){
        const source=querySource?.(sourceKey);
        if(source&&matches({system},source)){
          const center=position(source),r=source.descriptor?.hullRadii||source.descriptor?.radii,bound=r?Math.max(r.rx,r.ry):radius(source);
          if(Math.hypot(to.x-center.x,to.y-center.y)>bound+padding)sourceCleared.add(piece);
        }
      }
      onCandidates(tested);
      if(best)contacts.push(best);else contacts.sort((a,b)=>a.contact.t-b.contact.t);
      for(const {type,target,id,contact} of contacts){
        const firstHit=!hits.has(id);hits.add(id);
        if(resolveDebris)resolveDebris(piece,target,type,contact);
        if(!resolveDebris||contact.closing>.000001)record(type,target,{x:resolveDebris?piece.x:contact.x,y:resolveDebris?piece.y:contact.y,born:time,kind:'debris',from,visualOnly:true,firstHit,closing:contact.closing});
        if(resolveDebris)return [{type,target,id,contact}]; // Follow the reflected path on the next physics step.
      }
      return contacts;
    }
    function draw(ctx,time,{offsetX=0,offsetY=0}={}){
      ctx.save();ctx.lineWidth=1.5;
      for(const wave of waves){const t=(time-wave.born)/wave.duration;if(t<0||t>1)continue;ctx.globalAlpha=Math.sin(Math.PI*t)*.24;ctx.strokeStyle='#ffd7a1';ctx.beginPath();ctx.arc(wave.x+offsetX,wave.y+offsetY,Math.max(.1,wave.radius*t),0,Math.PI*2);ctx.stroke();}
      ctx.restore();
    }
    return Object.freeze({explode,update,stepDebris,draw,hasWaves:()=>waves.length>0,reset:()=>{waves=[];pieceHits=new WeakMap();sourceCleared=new WeakSet();history=[];},snapshot:()=>({waves:waves.length,impacts:history.map(event=>({...event}))})});
  };
  window.sweptDebrisCircleContact=sweptCircleContact;
  window.createDebrisImpacts=()=>{
    let shielded=true,events=[],flash=null,image=null,rgba=null;
    function prepare(im){
      if(!im||image===im)return;
      image=im;const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
      const g=c.getContext('2d');g.drawImage(im,0,0);rgba=g.getImageData(0,0,c.width,c.height).data;
    }
    function contact(p,oldX,oldY,target,im){
      if(!im||!target)return null;
      prepare(im);
      const distance=Math.hypot(p.x-oldX,p.y-oldY),steps=Math.max(1,Math.ceil(distance/3)),cos=Math.cos(target.a),sin=Math.sin(target.a);
      const radius=Math.min(10,Math.min(p.w||p.size||3,p.h||p.size||3)*.3);
      if(shielded){
        const r=window.showcaseShieldRadii?.(target.w,target.h)||{rx:target.w*.54+13,ry:target.h*.54+13};
        const local=(x,y)=>{const dx=x-target.centerX,dy=y-target.centerY;return {x:(dx*cos+dy*sin)/(r.rx+radius),y:(-dx*sin+dy*cos)/(r.ry+radius)};};
        const hit=sweptCircleContact(local(oldX,oldY),local(p.x,p.y),{x:0,y:0},1);
        return hit?{x:oldX+(p.x-oldX)*hit.t,y:oldY+(p.y-oldY)*hit.t}:null;
      }
      for(let n=0;n<=steps;n++){
        const x=oldX+(p.x-oldX)*n/steps,y=oldY+(p.y-oldY)*n/steps,dx=x-target.centerX,dy=y-target.centerY;
        const lx=dx*cos+dy*sin,ly=-dx*sin+dy*cos;
        if(Math.abs(lx)>target.w/2+radius||Math.abs(ly)>target.h/2+radius)continue;
        for(const [sx,sy] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]){
          const ix=Math.floor((lx+sx)/target.w*im.width+im.width/2),iy=Math.floor((ly+sy)/target.h*im.height+im.height/2);
          if(ix>=0&&ix<im.width&&iy>=0&&iy<im.height&&rgba[(iy*im.width+ix)*4+3]>100)return {x,y};
        }
      }
      return null;
    }
    function impact(point,target,im,state,kind='debris'){
      prepare(im);
      const from=point.from||point,hit=contact({x:target.centerX,y:target.centerY},from.x,from.y,target,im)||point;
      const event={x:hit.x,y:hit.y,born:state.time,kind:shielded?'shield':'sparks',source:kind,visualOnly:true};
      events.push(event);if(events.length>24)events.shift();flash=event;
      if(!shielded)for(let i=0;i<12;i++){
        const a=i*Math.PI*2/12,speed=35+Math.random()*45;
        state.particles.push({...hit,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:.7,born:state.time,ttl:350+Math.random()*200,realistic:'spark'});
      }
      return event;
    }
    function step(p,oldX,oldY,target,im,state){
      if(p.ore||p.impactDone||state.time-p.born<100)return;
      const hit=contact(p,oldX,oldY,target,im);if(!hit)return;
      p.impactDone=true;
      const event=impact({...hit,from:{x:oldX,y:oldY}},target,im,state);
      if(shielded){const a=Math.atan2(hit.y-target.centerY,hit.x-target.centerX),dot=p.vx*Math.cos(a)+p.vy*Math.sin(a);if(dot<0){p.vx-=1.35*dot*Math.cos(a);p.vy-=1.35*dot*Math.sin(a);}}
      return event;
    }
    function draw(ctx,target,time,color='#50d5ff'){
      if(!flash||flash.kind!=='shield'||time-flash.born>=620)return;
      ctx.save();ctx.translate(target.centerX,target.centerY);ctx.rotate(target.a);
      const dx=flash.x-target.centerX,dy=flash.y-target.centerY,c=Math.cos(target.a),s=Math.sin(target.a);
      window.drawShowcaseShieldFlash(ctx,image,target.w,target.h,{born:flash.born,color,x:dx*c+dy*s,y:-dx*s+dy*c,kind:flash.source},time);ctx.restore();
    }
    return Object.freeze({step,impact,draw,currentFlash:()=>flash?.kind==='shield'?flash:null,setShields:value=>{shielded=!!value;if(!value)flash=null;},reset:()=>{events=[];flash=null;},
      snapshot:()=>({hull:100,shields:shielded?100:0,shielded,impacts:events.map(e=>({...e})),flash:flash?{...flash}:null})});
  };
})();
