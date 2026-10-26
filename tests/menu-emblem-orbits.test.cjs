const test=require('node:test');
const assert=require('node:assert/strict');
const orbits=require('../html-games/broken-mirror-port/menu-emblem-orbits.js');

// Independent finite-segment distance using a cross product for the interior.
function segmentDistance(p,a,b){
  const v=b.map((x,i)=>x-a[i]),q=p.map((x,i)=>x-a[i]);
  const along=q.reduce((sum,x,i)=>sum+x*v[i],0),length=Math.hypot(...v);
  if(along<=0)return Math.hypot(...q);
  if(along>=length*length)return Math.hypot(...p.map((x,i)=>x-b[i]));
  return Math.hypot(q[1]*v[2]-q[2]*v[1],q[2]*v[0]-q[0]*v[2],q[0]*v[1]-q[1]*v[0])/length;
}

test('The entire fragment stays clear of the hilt at every phase and viewing tilt',()=>{
  let minimum=Infinity;
  for(let i=0;i<orbits.profiles.length;i++){
    const profile=orbits.profiles[i];
    for(const tilt of [-.055,-.025,0,.025,.055])for(let step=0;step<1440;step++){
      const p=orbits.sample(i,profile.period*step/1440,tilt);
      for(const body of orbits.bodies){
        const clearance=segmentDistance([p.x,p.y,p.z],body.a,body.b)-body.radius-profile.boundRadius;
        minimum=Math.min(minimum,clearance);
        assert.ok(clearance>.012,`Fragment ${i} touches ${body.name} at phase ${step}, tilt ${tilt}: ${clearance}`);
      }
    }
  }
  assert.ok(minimum>.012);
});

test('Cinematic periods are 65–120 seconds and close continuously after one orbit',()=>{
  for(let i=0;i<orbits.profiles.length;i++){
    const profile=orbits.profiles[i];assert.ok(profile.period>=65&&profile.period<=120);
    const start=orbits.sample(i,0),end=orbits.sample(i,profile.period),oneSecond=orbits.sample(i,1);
    assert.ok(Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)<1e-12);
    assert.ok(Math.abs(oneSecond.phase-start.phase)<.1,'Orbit moves too quickly');
    assert.ok(Math.abs(profile.spin)<.02,'Individual fragment tumbles too quickly');
    const a=orbits.sample(i,profile.period*.25-profile.phase*profile.period/(2*Math.PI));
    const b=orbits.sample(i,profile.period*.75-profile.phase*profile.period/(2*Math.PI));
    assert.ok(a.z>0&&b.z<0,'Orbit never crosses from front to back');
  }
});

test('Turning the sword preserves fragment position, then changes velocity through forces',()=>{
  const still=orbits.createDynamics(),moving=orbits.createDynamics(),origin={x:0,y:0,angle:0};
  still.reset(origin);moving.reset(origin);
  const before=moving.snapshot();moving.step(1/240,{x:0,y:0,angle:.04});
  const after=moving.snapshot();
  for(let i=0;i<before.particles.length;i++)assert.ok(Math.hypot(...after.particles[i].position.map((v,j)=>v-before.particles[i].position[j]))<.001,'A piece was carried around by the sword transform');
  for(let frame=0;frame<120;frame++){
    still.step(1/120,origin);
    moving.step(1/120,{x:0,y:0,angle:Math.min(Math.PI/2,frame/30*Math.PI/2)});
  }
  const a=still.snapshot(),b=moving.snapshot();
  assert.ok(b.particles.some((p,i)=>Math.hypot(...p.position.map((v,j)=>v-a.particles[i].position[j]))>.04));
  assert.ok(b.particles.some(p=>Math.hypot(...p.velocity)>.06),'Turning did not disturb the orbit');
  const old=b.particles.map(p=>[...p.position]);moving.step(1/60,b.pose);
  assert.ok(moving.snapshot().particles.some((p,i)=>Math.hypot(...p.position.map((v,j)=>v-old[i][j]))>.0002),'Pieces lost momentum when the sword stopped');
});

test('Moving solids deflect pieces without penetration; disturbed orbits settle again',()=>{
  const dynamics=orbits.createDynamics();dynamics.reset({x:0,y:0,angle:0});
  let peak=0;
  for(let frame=0;frame<2400;frame++){
    const angle=frame<240?Math.sin(frame/20)*2.8:0;
    dynamics.step(1/120,{x:0,y:0,angle});
    const state=dynamics.snapshot(),c=Math.cos(angle),s=Math.sin(angle);
    for(const piece of state.particles){
      peak=Math.max(peak,Math.hypot(...piece.velocity));
      const [x,y,z]=piece.position,local=[c*x+s*y,-s*x+c*y,z];
      for(const body of orbits.bodies){
        const clearance=segmentDistance(local,body.a,body.b)-body.radius-orbits.profiles[piece.index].boundRadius;
        assert.ok(clearance>-.0001,`Piece ${piece.index} penetrated ${body.name}: ${clearance}`);
      }
      assert.ok(Math.hypot(...piece.position)<.7,'A fragment escaped the composition');
    }
  }
  const settled=dynamics.snapshot();
  assert.ok(settled.contacts>0&&peak>.1,'Moving sword never imparted an impulse');
  assert.ok(settled.particles.every(p=>Math.hypot(...p.velocity)<.04),'Pieces did not return to slow drift');
});
