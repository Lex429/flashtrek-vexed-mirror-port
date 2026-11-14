/* Player intent and its faint preview. Shared owners supply world poses,
   weapon eligibility, incoming threats and physical firing-line contacts. */
(() => {
  'use strict';
  const keyFor=(id,category)=>{const key=String(id);return key.startsWith('tug:')||key.startsWith('civilian:')||key.startsWith('repair-drone:')?key:(category==='tug'?'tug:':category==='repair-drone'?'repair-drone:':'civilian:')+key;};
  const turn=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b))),clamp=n=>Math.max(0,Math.min(1,n));
  function create(memory){
    let cached=null,refreshes=0,owner=null,ownerSystem=null,samples=[],aims=new Map(),suggestion=null,published=null;
    const emergency=(next,previous)=>next&&previous&&(next.active&&!previous.active||next.urgency>=300&&next.urgency>previous.urgency);
    function steady(model){
      const next=memory.peek(model.targets,options(model));if(!next){suggestion=null;return null;}
      const previous=suggestion?.current===model.current?model.targets.find(t=>t.key===suggestion.key):null;
      const replace=()=>{suggestion={key:next.key,current:model.current,heading:model.heading,challenger:null};return next;};
      if(!previous||turn(model.heading,suggestion.heading)>.2||emergency(next,previous))return replace();
      if(next.key===previous.key){suggestion.challenger=null;return previous;}
      if(next.score-previous.score<14){suggestion.challenger=null;return previous;}
      if(suggestion.challenger!==next.key){suggestion.challenger=next.key;suggestion.since=model.at;}
      return model.at-suggestion.since>=.18?replace():previous;
    }
    function update(state,{current=null,force=false}={}){
      const at=window.nativeSimulation.seconds(state),source=window.nativeShipDefinitions.describe(state,state,{category:'player'});
      const heading=source.heading,angle=cached?Math.abs(Math.atan2(Math.sin(heading-cached.heading),Math.cos(heading-cached.heading))):Infinity;
      if(!force&&cached?.state===state&&cached.system===state.system&&cached.current===current&&at>=cached.at&&at-cached.at<.12&&angle<.08&&Math.hypot(source.x-cached.x,source.y-cached.y)<60)return cached;
      const last=samples.at(-1);
      if(owner!==state||ownerSystem!==state.system||last&&(at<last.at||at-last.at>.5||Math.hypot(source.x-last.x,source.y-last.y)>1200)){
        samples=[];aims.clear();suggestion=null;published=null;owner=state;ownerSystem=state.system;
      }
      const prior=samples.at(-1),dt=prior?Math.max(0,at-prior.at):0,turnRate=dt>0?turn(heading,prior.heading)/dt:0,speed=Math.hypot(source.vx||0,source.vy||0);
      const peak=Math.max(speed,...samples.filter(p=>at-p.at<.8).map(p=>p.speed)),braking=clamp((peak-speed)/60);
      if(cached?.state===state&&current&&current!==cached.current)memory.attention(current,at);
      const systems=window.nativeShipSystems,base=window.nativeCombatShots.firingStatus(state,source,null),range=Math.max(1800,base.maxRange||0);
      const scene=systems.query(state,{system:state.system,minX:source.x-range,minY:source.y-range,maxX:source.x+range,maxY:source.y+range,swept:false,categories:['civilian','tug','asteroid','repair-drone']});
      const targets=[];
      for(const pose of scene.targets){
        if(pose.targetable===false||Math.hypot(pose.x-source.x,pose.y-source.y)>range)continue;
        const rock=pose.category==='asteroid';
        if(pose.category==='repair-drone'&&pose.entity.carrier?.category==='player')continue;
        if(rock&&window.nativeCivilianTraffic.isMiningRock(state,pose.rockId))continue;
        if(!rock&&!window.nativeShipDetail.isDetailed(state,pose))continue;
        const entry=pose.entity;
        targets.push({key:rock?'asteroid:'+pose.rockId:keyFor(entry.id,pose.category),kind:rock?'asteroid':pose.category,entry,pose});
      }
      const live=new Set(),urgency=new Map();
      for(const target of targets)if(target.kind!=='asteroid'&&target.entry.retaliationTargetId==='player'&&!target.entry.combatAI?.disengaging&&(target.entry.retaliationUntil||0)>=at)live.add(target.key);
      for(const event of (state.weaponCombat?.events||[]).slice(-128))if(!event.cancelled&&event.targetId==='player'&&at-(event.launchedAt||0)<3){const key=keyFor(event.sourceId);live.add(key);urgency.set(key,20);}
      for(const threat of window.nativeCombatShots.threats(state,source,{horizon:1.2,limit:8})){
        const key=keyFor(threat.sourceId);live.add(key);urgency.set(key,Math.max(urgency.get(key)||0,threat.timeToImpact<.35?300:60*(1-threat.timeToImpact/1.2)));
      }
      const threats=memory.threats(at,live),focus=memory.focus(at),miningRange=window.nativeAsteroidCombat.miningRange;
      const threatWeights=new Map([...threats].map(key=>[key,memory.threatWeight(key,at)]));
      const correction=memory.correction(at),usableCorrection=correction&&targets.some(t=>t.key===correction.chosen)&&turn(heading,correction.heading??heading)<.15?correction:null;
      const context={ship:source,threats,liveThreats:live,threatWeights,urgency,miningRange,focus,correction:usableCorrection,current};
      const scenery=systems.collisionScene(state,{system:state.system});
      // Intent looks at physical hulls, using the canonical contact solver. The
      // weapon scene and its shields, muzzle, collision and damage stay intact.
      const hullScene={...scenery,querySwept(...args){const view=scenery.querySwept(...args);return {...view,bystanders:view.bystanders.map(t=>t.hullRadii?{...t,radii:t.hullRadii}:t)};}};
      const nose=window.nativeWeaponRules.firstContact(source,{x:source.x+Math.cos(heading)*range,y:source.y+Math.sin(heading)*range},source,null,hullScene,undefined,undefined,0,{instant:true});
      const activeKeys=new Set(targets.map(t=>t.key));for(const key of aims.keys())if(!activeKeys.has(key))aims.delete(key);
      const observed=targets.map(target=>{
        const pose=target.pose,dx=pose.x-source.x,dy=pose.y-source.y,distance=Math.hypot(dx,dy),angle=turn(Math.atan2(dy,dx),heading),noseHit=String(nose?.target?.id)===String(pose.id);
        const crossing=Math.abs((dx*((pose.vy||0)-(source.vy||0))-dy*((pose.vx||0)-(source.vx||0)))/(distance*distance+1))>.55;
        const goal=(angle<Math.PI/6||noseHit)?Math.max(0,Math.cos(angle))**12*(turnRate<.8?1:.2):0;
        const old=aims.get(target.key)||0,settled=angle>Math.PI/3?0:clamp(old+(goal-old)*(1-Math.exp(-dt/(goal>old ? .25 : .15))));aims.set(target.key,settled);
        let miningWeight=0;
        if(state.miningTool&&target.kind==='asteroid'){
          if(speed<120)miningWeight=.15+(distance<=miningRange&&(angle<Math.PI/9||noseHit)?.6:0)+settled*.25;
          if(braking>.2&&distance<miningRange*2&&angle<Math.PI/4)miningWeight=Math.max(miningWeight,.55+.45*braking);
          if(focus?.kind==='mine'&&angle<Math.PI/4)miningWeight=Math.max(miningWeight,focus.strength);
        }
        return {...target,noseHit,crossing,settled,miningWeight:clamp(miningWeight)};
      });
      let ranked=window.nativePlayerCombatControls.rankIntent(observed,context);
      // Expensive exact shared queries are bounded; all other candidates remain
      // available for deliberate cycling without a galaxy census or new physics.
      const checked=new Map();
      for(const target of ranked.slice(0,12)){
        const status=window.nativeCombatShots.firingStatus(state,source,target.pose);
        const contact=window.nativeWeaponRules.firstContact(source,target.pose,source,target.pose,scenery,target.pose.radii,target.pose.dimensions,0,{instant:true});
        checked.set(target.key,{canReach:status.weapons.some(row=>row.canReach),ready:status.ok,clear:!contact||String(contact.target?.id)===String(target.pose.id)});
      }
      ranked=window.nativePlayerCombatControls.rankIntent(observed.map(target=>({...target,weapon:checked.get(target.key)})),context);
      const sample={at,heading,x:source.x,y:source.y,speed};if(prior&&dt===0)samples[samples.length-1]=sample;else samples.push(sample);samples=samples.filter(p=>at-p.at<=.8).slice(-32);
      cached={state,system:state.system,at,current,heading,x:source.x,y:source.y,targets:ranked,threats,live,source};cached.preview=steady(cached);refreshes++;
      return cached;
    }
    function options(model){return {at:model.at,current:model.current,heading:model.heading,threats:model.threats,activeThreats:model.live};}
    function choose(state,current){
      const promise=published,model=update(state,{current,force:true}),best=memory.peek(model.targets,options(model)),promised=promise?model.targets.find(t=>t.key===promise.key):null;
      const valid=promise?.state===state&&promise.system===state.system&&promise.current===current&&model.at>=promise.at&&model.at-promise.at<=.3&&turn(model.heading,promise.heading)<=.2&&Math.hypot(model.x-promise.x,model.y-promise.y)<=100&&promised&&!emergency(best,promised);
      const next=memory.choose(model.targets,{...options(model),preferredKey:valid?promised.key:null});
      published=null;suggestion=null;if(next)memory.attention(next.key,model.at);return next;
    }
    function preview(){return cached?.preview||null;}
    function paint(ctx,state,{ship,cx,cy,zoom,w,h,current,visible}){
      if(!visible||cached?.state!==state||cached.system!==state.system){published=null;return;}
      const next=preview();if(!next||next.key===current){published=null;return;}
      const descriptor=window.nativeShipSystems.resolve(state,next.pose.id,state.system);if(!descriptor){published=null;return;}
      const pose=window.nativeSimulationFrame.renderPose(state,descriptor),x=cx+(pose.x-ship.x)*zoom,y=cy+(pose.y-ship.y)*zoom;
      const width=Math.max(26,Math.min(220,(descriptor.dimensions.width+16)*zoom)),height=Math.max(26,Math.min(220,(descriptor.dimensions.height+16)*zoom));
      if(x+width/2<0||x-width/2>w||y+height/2<0||y-height/2>h){published=null;return;}
      const arm=Math.min(9,width/4,height/4);ctx.save();ctx.globalAlpha=.36;ctx.strokeStyle=next.danger?'#ffc68c':'#8de8e2';ctx.lineWidth=1;ctx.beginPath();
      for(const sx of [-1,1])for(const sy of [-1,1]){const bx=x+sx*width/2,by=y+sy*height/2;ctx.moveTo(bx-sx*arm,by);ctx.lineTo(bx,by);ctx.lineTo(bx,by-sy*arm);}ctx.stroke();ctx.restore();
      published={state,system:state.system,key:next.key,current,at:window.nativeSimulation.seconds(state),heading:ship.heading??state.angle,x:ship.x,y:ship.y};
    }
    function droneHitTest(state,{ship,cx,cy,zoom=1,x,y}){
      return (window.nativeShipRepairs?.drones(state,state.system)||[]).filter(d=>d.entity.carrier?.category!=='player').map(d=>{
        const p=window.nativeSimulationFrame?.renderPose(state,d)||d;
        return {target:d,distance:Math.hypot(x-cx-(p.x-ship.x)*zoom,y-cy-(p.y-ship.y)*zoom)};
      }).filter(row=>row.distance<=Math.max(12,row.target.radius*zoom)).sort((a,b)=>a.distance-b.distance)[0]?.target||null;
    }
    return Object.freeze({update,choose,paint,droneHitTest,invalidate(){cached=null;suggestion=null;published=null;},snapshot(){const next=preview();return {refreshes,preview:next?{key:next.key,id:next.pose.id,x:next.pose.x,y:next.pose.y,score:next.score}:null,published:published?.key||null,correction:cached?memory.correction(cached.at):null,candidates:cached?.targets.map(t=>({key:t.key,score:t.score,angle:t.angle,distance:t.distance,weapon:t.weapon,noseHit:t.noseHit,settled:t.settled,miningWeight:t.miningWeight,active:t.active,urgency:t.urgency,threatWeight:t.threatWeight}))||[]};}});
  }
  window.nativePlayerTargeting=Object.freeze({create});
})();
