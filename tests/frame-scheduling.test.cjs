const test=require('node:test'),assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
const {fixture}=require('./npc-economy-fixture.cjs');

test('scene indexing is shared within a physics step and refreshed after movement, damage and the next step',async()=>{
 const f=await tacticalFixture(),{window:w,state}=f,frames=w.nativeSimulationFrame,systems=w.nativeShipSystems;
 let collections=0;const entity={x:4,y:5,hull:10};
 systems.register('probe',{collect:()=>{collections++;return [{id:'probe:1',system:1,entity,x:entity.x,y:entity.y,hull:entity.hull}];},hit:()=>{entity.hull--;return {ok:true};}});
 frames.begin(state);frames.step(state);
 for(let i=0;i<1000;i++)assert.equal(systems.resolve(state,'probe:1').entity,entity);
 assert.equal(collections,1);assert.equal(frames.snapshot(state).counters.sceneCollections,1);
 systems.applyHit(state,{target:systems.resolve(state,'probe:1'),point:{x:4,y:5}}, {damage:1,kind:'beam'},{id:'player',system:1});
 assert.equal(systems.resolve(state,'probe:1').hull,9);assert.equal(collections,2);
 const civilian=state.civilianTraffic.ships[0],before=systems.resolve(state,civilian.id).x;
 systems.move(state,civilian,'civilian',{heading:0,throttle:1},{maxSpeed:10,acceleration:10,braking:10,turnRate:1},.1);
 assert.ok(systems.resolve(state,civilian.id).x>before);assert.equal(collections,3);
 entity.x=12;frames.step(state);assert.equal(systems.resolve(state,'probe:1').x,12);assert.equal(collections,4);
 civilian.shields=0;assert.equal(systems.resolve(state,civilian.id).shields,0,'shield collapse cannot retain stale collision geometry');
 civilian.phase='destroyed';assert.equal(systems.resolve(state,civilian.id),null);frames.end(state);
 assert.equal(frames.current(state),null);assert.equal(frames.snapshot(state).counters.sceneCollections,4);
});

test('slow-frame catch-up shares Sol work limits across substeps and preserves due-event debt',async()=>{
 const f=await fixture({full:false,economic:false}),{window:w,state}=f,frames=w.nativeSimulationFrame;
 state.solEconomy.clock=100000;
 frames.begin(state);for(let i=0;i<15;i++){frames.step(state);w.nativeSimulation.advance(state,1/60);w.nativeSolEconomy.advance(state,1/60);}
 const first=frames.snapshot(state);assert.equal(first.steps,15);assert.equal(first.counters.solProduction,64);assert.ok((first.counters.solEvents||0)<=96);
 const debt=state.solEconomy.clock;assert.ok(debt>90000);frames.end(state);
 frames.begin(state);frames.step(state);w.nativeSimulation.advance(state,1/60);w.nativeSolEconomy.advance(state,1/60);frames.end(state);
 assert.ok(state.solEconomy.clock<debt,'pending production resumes on the next frame');assert.equal(frames.snapshot(state).counters.solProduction,64);
 assert.ok(Math.abs(w.nativeSimulation.seconds(state)-16/60)<1e-8,'authoritative active time still advances every physics step');
});

test('player retail settles against the saved treasury and rejects storage overflow without losing cargo',async()=>{
 const f=await fixture({full:false,economic:false}),{window:w,state}=f,economy=state.solEconomy,m=f.lives.market(state,1,3);
 state.latinum=10000;state.solFreightHold={};const before=state.latinum,goods=economy.ports[3][5],bank=m.credits;
 assert.equal(w.nativeSolEconomy.buySell(state,3,5,true,10).ok,true);
 assert.equal(before-state.latinum,m.credits-bank);assert.equal(economy.ports[3][5],goods-10);assert.equal(economy.flows.externalPlayerReceipts,undefined);
 economy.ports[3][5]=9998;const money=state.latinum,treasury=m.credits;
 assert.equal(w.nativeSolEconomy.buySell(state,3,5,false,10).ok,false);assert.equal(economy.ports[3][5],9998);assert.equal(economy.flows.lost[5],0);
 assert.equal(state.latinum,money);assert.equal(m.credits,treasury);assert.equal(state.solFreightHold[5],10);
});
