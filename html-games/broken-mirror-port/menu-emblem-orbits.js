/* Visual geometry only. Units are fractions of the emblem's height. */
(() => {
  'use strict';
  const hiltY=-.265;
  const bodies=[
    {name:'guard',a:[-.125,hiltY,0],b:[.125,hiltY,0],radius:.03},
    {name:'grip',a:[0,-.472,0],b:[0,-.285,0],radius:.042},
    {name:'blade socket',a:[0,-.25,0],b:[0,-.174,0],radius:.034},
    {name:'skull',a:[0,-.045,0],b:[0,.12,0],radius:.14},
    {name:'exposed blade',a:[0,.18,0],b:[0,.475,0],radius:.022}
  ];
  function distance(point,body){
    const axis=body.b.map((v,i)=>v-body.a[i]),delta=point.map((v,i)=>v-body.a[i]);
    const t=Math.max(0,Math.min(1,delta.reduce((s,v,i)=>s+v*axis[i],0)/axis.reduce((s,v)=>s+v*v,0)));
    return Math.hypot(...delta.map((v,i)=>v-t*axis[i]))-body.radius;
  }
  function sample(profile,seconds,viewTilt=0){
    const phase=profile.phase+seconds*Math.PI*2/profile.period,tilt=profile.tilt+viewTilt;
    const x=Math.cos(phase)*profile.radius,y=Math.sin(phase)*profile.radius*Math.sin(profile.inclination);
    return {x:Math.cos(tilt)*x-Math.sin(tilt)*y,y:hiltY+Math.sin(tilt)*x+Math.cos(tilt)*y,z:Math.sin(phase)*profile.radius*Math.cos(profile.inclination),phase};
  }
  const profiles=Array.from({length:12},(_,i)=>{
    const length=.03+(i%4)*.004,aspect=[118/134,155/149,1,1,176/141,170/110,169/159,187/181,155/150,134/152,174/123,149/166][i];
    const profile={phase:i*2.399,period:65+(i%6)*11,radius:.205+(i%3)*.014,inclination:.28+(i%3)*.12,tilt:Math.sin(i*1.8)*.3,length,aspect,boundRadius:length*Math.hypot(1,aspect)*.5,spin:(i%2?-.012:.014)+(i%3)*.001};
    // Enlarge an entire path rather than pushing pieces away frame by frame.
    // Every part of the orbit has clearance, including the mouse-driven tilt.
    for(let attempt=0;attempt<20;attempt++){
      let minimum=Infinity;
      for(const tilt of [-.055,0,.055])for(let step=0;step<256;step++){
        const p=sample(profile,step*profile.period/256,tilt);
        for(const body of bodies)minimum=Math.min(minimum,distance([p.x,p.y,p.z],body)-profile.boundRadius);
      }
      if(minimum>=.014)break;
      profile.radius+=.003;
    }
    return Object.freeze(profile);
  });
  function rotate(p,angle){const c=Math.cos(angle),s=Math.sin(angle);return [p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]];}
  function closest(p,a,b){
    const d=b.map((v,i)=>v-a[i]),q=p.map((v,i)=>v-a[i]);
    const t=Math.max(0,Math.min(1,q.reduce((s,v,i)=>s+v*d[i],0)/d.reduce((s,v)=>s+v*v,0)));
    return a.map((v,i)=>v+d[i]*t);
  }
  function createDynamics(){
    let pose=null,particles=[],contacts=0,elapsed=0;
    function reset(next){
      pose={...next};contacts=0;elapsed=0;
      particles=profiles.map((profile,i)=>{
        const p=sample(profile,0),n=sample(profile,.01),local=[p.x,p.y,p.z],world=rotate(local,pose.angle);
        const velocity=rotate([(n.x-p.x)/.01,(n.y-p.y)/.01,(n.z-p.z)/.01],pose.angle);
        const tangent=rotate([0,-Math.cos(profile.inclination),Math.sin(profile.inclination)],pose.angle+profile.tilt);
        const mass=Math.max(.4,Math.min(2.5,Math.pow(profile.boundRadius/.027,3)));
        return {index:i,mass,position:[world[0]+pose.x,world[1]+pose.y,world[2]],velocity,normal:tangent,spin:profile.phase,spinVelocity:profile.spin};
      });
    }
    function step(dt,next){
      if(!pose)reset(next);
      if(dt<=0)return;
      const previous={...pose},steps=Math.max(1,Math.ceil(dt*240)),h=dt/steps;
      const angularVelocity=(next.angle-previous.angle)/dt,pivotVelocity=[(next.x-previous.x)/dt,(next.y-previous.y)/dt,0];
      for(let tick=0;tick<steps;tick++){
        const f=(tick+1)/steps,current={x:previous.x+(next.x-previous.x)*f,y:previous.y+(next.y-previous.y)*f,angle:previous.angle+(next.angle-previous.angle)*f};
        const centerOffset=rotate([0,hiltY,0],current.angle),center=[current.x+centerOffset[0],current.y+centerOffset[1],0];
        const obstacles=bodies.map(body=>({a:rotate(body.a,current.angle).map((v,i)=>v+(i===0?current.x:i===1?current.y:0)),b:rotate(body.b,current.angle).map((v,i)=>v+(i===0?current.x:i===1?current.y:0)),radius:body.radius}));
        for(const particle of particles){
          const profile=profiles[particle.index],rel=particle.position.map((v,i)=>v-center[i]),r=Math.max(.001,Math.hypot(...rel)),unit=rel.map(v=>v/r),omega=2*Math.PI/profile.period;
          const radialVelocity=particle.velocity.reduce((s,v,i)=>s+v*unit[i],0);
          const planeOffset=rel.reduce((sum,v,i)=>sum+v*particle.normal[i],0);
          const tangent=[particle.normal[1]*rel[2]-particle.normal[2]*rel[1],particle.normal[2]*rel[0]-particle.normal[0]*rel[2],particle.normal[0]*rel[1]-particle.normal[1]*rel[0]].map(v=>v*omega);
          // Gravity maintains slow free orbits. A soft radial spring returns
          // disturbed pieces; position is never assigned from sword rotation.
          const response=1/Math.sqrt(particle.mass);
          const radial=-omega*omega*r-3.2*(r-profile.radius)*response-2.4*radialVelocity*Math.sqrt(response);
          for(let axis=0;axis<3;axis++)particle.velocity[axis]+=(unit[axis]*radial+(tangent[axis]-particle.velocity[axis])*.7*response-particle.normal[axis]*planeOffset*(.38+(particle.index%4)*.08))*h;
          const speed=Math.hypot(...particle.velocity);if(speed>.5)particle.velocity=particle.velocity.map(v=>v*.5/speed);
          for(let axis=0;axis<3;axis++)particle.position[axis]+=particle.velocity[axis]*h;
          // Resolve the moving solid, including its contact-point velocity.
          for(let pass=0;pass<3;pass++)for(const body of obstacles){
            const contact=closest(particle.position,body.a,body.b),delta=particle.position.map((v,i)=>v-contact[i]),length=Math.hypot(...delta),minimum=body.radius+profile.boundRadius+.003;
            if(length>=minimum)continue;
            const normal=length>.00001?delta.map(v=>v/length):[0,0,1];
            particle.position=contact.map((v,i)=>v+normal[i]*minimum);
            const surface=[pivotVelocity[0]-angularVelocity*(contact[1]-current.y),pivotVelocity[1]+angularVelocity*(contact[0]-current.x),0];
            const approach=particle.velocity.reduce((s,v,i)=>s+(v-surface[i])*normal[i],0);
            if(approach<0){
              const impulse=Math.min(.25,-approach*1.12);
              for(let axis=0;axis<3;axis++)particle.velocity[axis]+=normal[axis]*impulse;
              particle.spinVelocity+=Math.max(-.12,Math.min(.12,angularVelocity*.003));contacts++;
            }
          }
          const resolvedSpeed=Math.hypot(...particle.velocity);if(resolvedSpeed>.5)particle.velocity=particle.velocity.map(v=>v*.5/resolvedSpeed);
          particle.spinVelocity+=(profile.spin-particle.spinVelocity)*(1-Math.exp(-h*.5));particle.spin+=particle.spinVelocity*h;
        }
        // Whole fragments occupy space as well: exchange contact impulses,
        // rather than piling up at one projected point after a fast sweep.
        for(let iteration=0;iteration<3;iteration++){
          for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){
            const a=particles[i],b=particles[j],delta=b.position.map((v,k)=>v-a.position[k]),length=Math.hypot(...delta);
            const minimum=profiles[i].boundRadius+profiles[j].boundRadius+.012;
            if(length>=minimum)continue;
            const n=length>.00001?delta.map(v=>v/length):[0,0,1],invA=1/a.mass,invB=1/b.mass,total=invA+invB;
            for(let k=0;k<3;k++){a.position[k]-=n[k]*(minimum-length)*invA/total;b.position[k]+=n[k]*(minimum-length)*invB/total;}
            const approach=b.velocity.reduce((sum,v,k)=>sum+(v-a.velocity[k])*n[k],0);
            if(approach<0){
              const impulse=-approach*1.15/total;
              for(let k=0;k<3;k++){a.velocity[k]-=n[k]*impulse*invA;b.velocity[k]+=n[k]*impulse*invB;}
              a.spinVelocity-=impulse*.08;b.spinVelocity+=impulse*.08;
            }
          }
          for(const particle of particles)for(const body of obstacles){
            const q=closest(particle.position,body.a,body.b),d=particle.position.map((v,k)=>v-q[k]),length=Math.hypot(...d),minimum=body.radius+profiles[particle.index].boundRadius+.003;
            if(length<minimum){const n=length>.00001?d.map(v=>v/length):[0,0,1];particle.position=q.map((v,k)=>v+n[k]*minimum);}
          }
        }
        pose=current;elapsed+=h;
      }
    }
    return {reset,step,snapshot:()=>({contacts,elapsed,pose:pose&&{...pose},particles:particles.map(p=>({...p,position:[...p.position],velocity:[...p.velocity],normal:[...p.normal]}))})};
  }
  const api=Object.freeze({hiltY,profiles:Object.freeze(profiles),bodies:Object.freeze(bodies.map(b=>Object.freeze({...b,a:Object.freeze(b.a),b:Object.freeze(b.b)}))),sample:(index,seconds,viewTilt=0)=>sample(profiles[index],seconds,Math.max(-.055,Math.min(.055,viewTilt))),createDynamics});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.nativeMenuEmblemOrbits=api;
})();
