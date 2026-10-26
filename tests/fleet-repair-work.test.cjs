const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function fixture(){
  const window={},context=vm.createContext({window,Math,Object});
  for(const file of ['html-games/flashtrek-broken-mirror/repair-hull-work.js','html-games/broken-mirror-port/ship-repair-sites.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
  return {work:window.nativeRepairWork,ships:window.VexedRepairSites.ships};
}

test('all 66 hulls have bounded work cells from their actual existing damage artwork',()=>{
  const {work,ships}=fixture();assert.equal(Object.keys(ships).length,66);
  for(const [id,data] of Object.entries(ships)){
    assert.ok(data.changed>100&&data.points.length>0,`Missing damage for ${id}`);
    for(let i=0;i<data.points.length;i+=2)assert.ok(data.points[i]>=0&&data.points[i]<data.w*data.h);
    for(let count=1;count<=8;count++)for(const q of [0,.1,.4,.7,.99,1]){
      const seen=new Set();
      for(let lane=0;lane<count;lane++){
        const site=work.site(id,q,lane,count);
        assert.ok(Math.abs(site.x)<=.5&&Math.abs(site.y)<=.5);
        assert.ok(Math.abs(Math.hypot(site.nx,site.ny)-1)<1e-9);
        assert.ok(!seen.has(site.index),`Two workers share the same cell on ${id}`);seen.add(site.index);
      }
    }
  }
});

test('restoration follows assigned damage cells monotonically without a horizontal wipe',()=>{
  const {work,ships}=fixture(),data=ships[1];
  const damaged={},intact={};let cells;
  const ctx={canvas:{width:256,height:320},clearRect(){},drawImage(){},save(){},restore(){},beginPath(){cells=new Set();},rect(...args){cells.add(args.join(','));},clip(){}};
  for(const count of [1,2,6]){
    let prior=new Set();
    for(const q of [.05,.2,.4,.6,.8,.95]){
      work.paintHull(ctx,damaged,intact,data,q,count);
      assert.ok(cells.size>0);
      for(const cell of prior)assert.ok(cells.has(cell),'A repaired hull cell reverted');
      prior=cells;
    }
  }
});

test('shared welding sparks retain ballistic momentum and painting cannot advance them',()=>{
  const {work}=fixture(),hit={x:15,y:20},normal={x:0,y:-1};
  const particles=work.burst(hit,normal,1000,77,0,4,1,2),saved=JSON.stringify(particles);
  assert.ok(particles.length>=7&&particles.some(p=>p.droplet));
  for(const p of particles)assert.ok(p.vy<0,'Spark travels away from its work surface');
  const ctx={save(){},restore(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){}};
  work.drawSparks(ctx,particles,1100);work.drawSparks(ctx,particles,1300);
  assert.equal(JSON.stringify(particles),saved);
  const scaled=work.burst(hit,normal,1000,77,0,4,.1,2,.1);
  for(let i=0;i<particles.length;i++){
    assert.ok(Math.abs(scaled[i].vx-particles[i].vx*.1)<1e-9);
    assert.ok(Math.abs(scaled[i].vy-particles[i].vy*.1)<1e-9);
  }
});
