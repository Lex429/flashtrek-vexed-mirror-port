const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
test('linear refuge lookup retains exact distance and ID ordering and observes population/chart edits immediately',async()=>{
 const f=await fixture({regional:true,access:true,full:false,economic:false}),w=f.window,s=f.state,policy=w.nativeCivilianAccess,systems=w.VexedMirrorWorld.systems;
 const expected=origin=>systems.filter(row=>policy.inhabited(s,row.id)).sort((a,b)=>policy.distance(origin,a.id)-policy.distance(origin,b.id)||a.id-b.id)[0]?.id??null;
 const verify=()=>{for(const origin of [-1,999,...systems.map(row=>row.id)])assert.equal(policy.nearestHome(s,origin),expected(origin),`origin ${origin}`);};
 verify();s.planetPopulationCounts=Object.fromEntries(systems.filter((_,i)=>i%3===0).map(row=>[row.id,0]));verify();
 delete s.planetPopulationCounts;systems.find(row=>row.id===14).mapPosition={...systems.find(row=>row.id===1).mapPosition};verify();assert.equal(policy.nearestHome(s,14),1);
 s.planetPopulationCounts=Object.fromEntries(systems.map(row=>[row.id,0]));assert.equal(policy.nearestHome(s,1),null);
});
test('one access audit searches once per occupied system while preserving every safe crew',async()=>{
 const f=await fixture({regional:true,access:true,economic:false}),w=f.window,s=f.state,policy=w.nativeCivilianAccess;
 const before=JSON.stringify(s.civilianTraffic.ships.map(e=>({id:e.id,system:e.system,x:e.x,y:e.y,hull:e.hull,credits:e.credits,cargo:e.cargo}))),systems=new Set(s.civilianTraffic.ships.map(e=>e.system));let calls=0;
 w.nativeCivilianAccess={...policy,nearestHome(...args){calls++;return policy.nearestHome(...args);}};
 s.planetPopulationCounts={[90]:0};f.lives.advance(s,1/60);
 assert.ok(calls>0&&calls<=systems.size,`${calls} searches for ${systems.size} occupied systems`);
 assert.equal(JSON.stringify(s.civilianTraffic.ships.map(e=>({id:e.id,system:e.system,x:e.x,y:e.y,hull:e.hull,credits:e.credits,cargo:e.cargo}))),before);
});
