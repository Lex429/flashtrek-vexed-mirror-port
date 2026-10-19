/* Standalone inspection uses the deployed fleet's artwork and profiles.
   Its hull and fragments belong only to the current showcase selection. */
(() => {
  'use strict';
  const roles=['repair','attack','defense'],labels={repair:"Repair Dot’s",attack:'Attack Drone',defense:'Defence Drone'};
  const entries=()=>roles.flatMap((role,r)=>window.repairDroneFleet.roles[role].map((tier,t)=>{
    const id=500+r*3+t,frames=Array.from({length:4},(_,s)=>`drone-inspector-${id}-${s}`);
    return {id,name:`${labels[role]} — ${tier.name}`,kind:'drone',droneRole:role,droneTier:tier.id,
      maxHealth:tier.health,damageReady:true,origin:'Supplied drone artwork',frames,original:frames[0],
      bounds:[0,512,0,512],previewSize:330,mass:10,size:330};
  }));
  async function prepare(entry){
    await window.droneSprites.ready;
    const frames=entry.frames.map((_,s)=>{
      const c=Object.assign(document.createElement('canvas'),{width:512,height:512});
      if(!window.droneSprites.drawSurface(c.getContext('2d'),entry.droneTier,{role:entry.droneRole,health:[100,65,40,15][s],time:1234,effects:false}))throw Error('Could not load '+entry.name);
      return c;
    });
    return frames;
  }
  function draw(ctx,entry,layout,angle,health,time,options){
    ctx.save();ctx.translate(layout.x,layout.y);ctx.rotate(angle);ctx.scale(layout.w/512,layout.h/512);ctx.translate(-256,-256);
    window.droneSprites.drawSurface(ctx,entry.droneTier,{role:entry.droneRole,health,time,lights:options.lights,effects:options.damage,...demo(entry,time,options.toolDemo)});ctx.restore();
  }
  function explode(entry,layout,angle,time){
    const definition=window.droneSprites.definitions[entry.droneRole][entry.droneTier],extent=1254*definition.scale,c=Math.cos(angle),s=Math.sin(angle);
    return window.droneSprites.fragments(entry.droneTier,entry.droneRole).map((piece,i)=>{
      const x=(definition.pivot[0]/1254+piece.y/extent-.5)*layout.w,y=(definition.pivot[1]/1254-piece.x/extent-.5)*layout.h,
        a=Math.atan2(y,x)+angle,speed=35+(i%5)*13;
      return {texture:piece.texture,x:layout.x+x*c-y*s,y:layout.y+x*s+y*c,
        w:piece.width/extent*layout.w,h:piece.height/extent*layout.h,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
        angle,spin:(i%2?1:-1)*(.3+i*.07),born:time,ttl:8500,droneWreck:true};
    });
  }
  function damagePose(entry,layout,angle){
    const d=window.droneSprites.definitions[entry.droneRole][entry.droneTier],x=(d.pivot[0]/1254-.5)*layout.w,y=(d.pivot[1]/1254-.5)*layout.h,c=Math.cos(angle),s=Math.sin(angle);
    return {tier:entry.droneTier,role:entry.droneRole,position:{x:layout.x+x*c-y*s,y:layout.y+x*s+y*c},heading:angle-Math.PI/2,scale:layout.w/(1254*d.scale)};
  }
  function shipExplosion(state,pose){
    if(!window.cthiaDestruction?.emitFragments)return false;
    const d=window.droneSprites.definitions[pose.role][pose.tier],extent=1254*d.scale,scale=pose.scale||1,angle=pose.heading+Math.PI/2,
      c=Math.cos(angle),s=Math.sin(angle),cx=(627-d.pivot[0])*d.scale*scale,cy=(627-d.pivot[1])*d.scale*scale;
    const layout={x:pose.position.x+cx*c-cy*s,y:pose.position.y+cx*s+cy*c,w:extent*scale,h:extent*scale};
    const world=p=>({x:layout.x+p.x*layout.w*c-p.y*layout.h*s,y:layout.y+p.x*layout.w*s+p.y*layout.h*c});
    const pieces=window.droneSprites.fragments(pose.tier,pose.role).map((p,i)=>({texture:p.texture,lit:p.texture,
      x:d.pivot[0]/1254+p.y/extent-.5,y:d.pivot[1]/1254-p.x/extent-.5,w:p.width/extent,h:p.height/extent,
      pixels:p.pixels||Math.round(p.texture.width*p.texture.height*.4),name:p.name||`drone hull ${i+1}`,coreX:0,coreY:0,droneWreck:true}));
    if(!pieces.length)return false;
    const core={x:d.pivot[0]/1254-.5,y:d.pivot[1]/1254-.5};
    pieces.reduce((best,p)=>Math.hypot(p.x-core.x,p.y-core.y)<Math.hypot(best.x-core.x,best.y-core.y)?p:best).core=true;
    const emission={time:pose.time,angle,particles:state.particles,debris:state.debris},zoom=Math.max(.35,Math.min(3,layout.w/330));
    window.cthiaDestruction.emitFragments(emission,layout,world,3,zoom,{pieces,core,coreEnabled:true,energyColor:({repair:'#3dff97',attack:'#ff4938',defense:'#42bdff'})[pose.role]});
    state.cthiaBlast=emission.cthiaBlast;return true;
  }
  function createDestruction(){
    const state={time:0,particles:[],debris:[],cthiaBlast:null},waves=window.createEnvironmentalImpacts?.();let last=null;
    function advance(time){
      const dt=last===null?0:Math.max(0,(time-last)/1000);last=time;state.time=time;
      for(const p of state.particles){if(time<p.born)continue;p.x+=p.vx*dt;p.y+=p.vy*dt;const drag=Math.max(0,1-2.8*dt);p.vx*=drag;p.vy*=drag;}
      for(const p of state.debris){p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;const drag=Math.max(0,1-.2*dt);p.vx*=drag;p.vy*=drag;}
      state.particles=state.particles.filter(p=>time-p.born<p.ttl);state.debris=state.debris.filter(p=>time-p.born<p.ttl);waves?.update(time);
    }
    function emit(pose){advance(pose.time);if(!shipExplosion(state,pose))return false;state.particles=state.particles.slice(-1800);state.debris=state.debris.slice(-160);waves?.explode({...pose.position,born:pose.time,radius:90,duration:700});return true;}
    function draw(ctx,time){
      ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';waves?.draw(ctx,time);
      for(const p of state.debris){const age=time-p.born;if(age<0||age>=p.ttl)continue;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=age/p.ttl<.65?1:(1-age/p.ttl)/.35;window.cthiaDestruction.drawWreckSurface(ctx,p,time);window.cthiaDestruction.drawWreckGlow(ctx,p,time);ctx.restore();}
      for(const p of state.particles)window.cthiaDestruction.drawParticle(ctx,p,time);ctx.restore();
    }
    const snapshot=()=>({...explosionSnapshot(state),shockwaves:waves?.snapshot().waves||0});
    return {emit,advance,draw,snapshot};
  }
  const explosionSnapshot=state=>({particles:state.particles.filter(p=>p.realistic).length,wreckCount:state.debris.filter(p=>p.droneWreck).length,
    core:state.particles.filter(p=>p.realistic==='core').length,blasts:state.particles.filter(p=>p.realistic==='blast').length,sparks:state.particles.filter(p=>p.realistic==='spark').length,
    fire:state.particles.filter(p=>p.realistic==='fire').length,smoke:state.particles.filter(p=>p.realistic==='smoke').length,blast:state.cthiaBlast?{...state.cthiaBlast}:null});
  function demo(entry,time,enabled=false){
    if(!enabled)return {activity:0,thrust:0,barrel:0};
    const cycle=time%2400,barrel=Math.floor(time/800);
    return {activity:entry.droneRole==='repair'?(cycle<1600?.85+.15*Math.sin(time*.073)**2:0):Math.max(0,1-(time%800)/150),thrust:.65,barrel};
  }
  function inspect(entry,health,time,options={}){return {role:entry.droneRole,tier:entry.droneTier,...window.droneSprites.inspect(entry.droneTier,health,100,time,entry.droneRole),lighting:window.droneSprites.lightState(entry.droneTier,entry.droneRole,health,100,time,{lights:options.lights,...demo(entry,time,options.toolDemo)})};}
  window.droneShowcase=Object.freeze({entries,prepare,draw,explode,inspect,damagePose,shipExplosion,createDestruction,explosionSnapshot});
})();
