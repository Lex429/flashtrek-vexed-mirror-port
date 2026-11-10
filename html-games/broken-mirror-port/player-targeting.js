/* Player intent and its faint preview. Shared owners supply world poses,
   weapon eligibility, incoming threats and physical firing-line contacts. */
(() => {
  'use strict';
  const keyFor=(id,category)=>{const key=String(id);return key.startsWith('tug:')||key.startsWith('civilian:')?key:(category==='tug'?'tug:':'civilian:')+key;};
  function create(memory){
    let cached=null,refreshes=0;
    function update(state,{current=null,force=false}={}){
      const at=window.nativeSimulation.seconds(state),source=window.nativeShipDefinitions.describe(state,state,{category:'player'});
      const heading=source.heading,angle=cached?Math.abs(Math.atan2(Math.sin(heading-cached.heading),Math.cos(heading-cached.heading))):Infinity;
      if(!force&&cached?.state===state&&cached.system===state.system&&cached.current===current&&at>=cached.at&&at-cached.at<.12&&angle<.08&&Math.hypot(source.x-cached.x,source.y-cached.y)<60)return cached;
      if(cached?.state===state&&current&&current!==cached.current)memory.attention(current,at);
      const systems=window.nativeShipSystems,base=window.nativeCombatShots.firingStatus(state,source,null),range=Math.max(1800,base.maxRange||0);
      const scene=systems.query(state,{system:state.system,minX:source.x-range,minY:source.y-range,maxX:source.x+range,maxY:source.y+range,swept:false,categories:['civilian','tug','asteroid']});
      const targets=[];
      for(const pose of scene.targets){
        if(pose.targetable===false||Math.hypot(pose.x-source.x,pose.y-source.y)>range)continue;
        const rock=pose.category==='asteroid';
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
      const mining=!!state.miningTool&&Math.hypot(source.vx||0,source.vy||0)<120||focus?.kind==='mine';
      const context={ship:source,threats,liveThreats:live,urgency,mining,miningRange,focus,current};
      let ranked=window.nativePlayerCombatControls.rankIntent(targets,context);
      const scenery=systems.collisionScene(state,{system:state.system});
      // Expensive exact shared queries are bounded; all other candidates remain
      // available for deliberate cycling without a galaxy census or new physics.
      const checked=new Map();
      for(const target of ranked.slice(0,12)){
        const status=window.nativeCombatShots.firingStatus(state,source,target.pose);
        const contact=window.nativeWeaponRules.firstContact(source,target.pose,source,target.pose,scenery,target.pose.radii,target.pose.dimensions,0,{instant:true});
        checked.set(target.key,{canReach:status.weapons.some(row=>row.canReach),ready:status.ok,clear:!contact||String(contact.target?.id)===String(target.pose.id)});
      }
      ranked=window.nativePlayerCombatControls.rankIntent(targets.map(target=>({...target,weapon:checked.get(target.key)})),context);
      cached={state,system:state.system,at,current,heading,x:source.x,y:source.y,targets:ranked,threats,live,source};refreshes++;
      return cached;
    }
    function options(model){return {at:model.at,current:model.current,heading:model.heading,threats:model.threats,activeThreats:model.live};}
    function choose(state,current){const model=update(state,{current,force:true}),next=memory.choose(model.targets,options(model));if(next)memory.attention(next.key,model.at);return next;}
    function preview(){return cached?memory.peek(cached.targets,options(cached)):null;}
    function paint(ctx,state,{ship,cx,cy,zoom,w,h,current,visible}){
      if(!visible||cached?.state!==state||cached.system!==state.system)return;
      const next=preview();if(!next||next.key===current)return;
      const descriptor=window.nativeShipSystems.resolve(state,next.pose.id,state.system);if(!descriptor)return;
      const pose=window.nativeSimulationFrame.renderPose(state,descriptor),x=cx+(pose.x-ship.x)*zoom,y=cy+(pose.y-ship.y)*zoom;
      const width=Math.max(26,Math.min(220,(descriptor.dimensions.width+16)*zoom)),height=Math.max(26,Math.min(220,(descriptor.dimensions.height+16)*zoom));
      if(x+width/2<0||x-width/2>w||y+height/2<0||y-height/2>h)return;
      const arm=Math.min(9,width/4,height/4);ctx.save();ctx.globalAlpha=.36;ctx.strokeStyle=next.danger?'#ffc68c':'#8de8e2';ctx.lineWidth=1;ctx.beginPath();
      for(const sx of [-1,1])for(const sy of [-1,1]){const bx=x+sx*width/2,by=y+sy*height/2;ctx.moveTo(bx-sx*arm,by);ctx.lineTo(bx,by);ctx.lineTo(bx,by-sy*arm);}ctx.stroke();ctx.restore();
    }
    return Object.freeze({update,choose,paint,invalidate(){cached=null;},snapshot(){const next=preview();return {refreshes,preview:next?{key:next.key,id:next.pose.id,x:next.pose.x,y:next.pose.y,score:next.score}:null,candidates:cached?.targets.map(t=>({key:t.key,score:t.score,angle:t.angle,distance:t.distance,weapon:t.weapon}))||[]};}});
  }
  window.nativePlayerTargeting=Object.freeze({create});
})();
