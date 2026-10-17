const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
async function setup(){const f=await fixture({full:false,economic:false});Object.assign(f.state,{shipType:60,latinum:1000000,devMode:false});f.market=f.lives.market(f.state,1,3);f.api=f.window.nativeSolEconomy;return f;}
function reset(f,g,stock,held=0){f.market.stock[g]=stock;f.market.reserved.fill(0);f.market.incoming.fill(0);f.market.fundsReserved=0;f.market.credits=1000000;f.state.solFreightHold={};f.state.solFreightHold[g]=held;f.state.latinum=1000000;}
function trade(f,g,buy,n){const quote=f.api.quote(f.state,3,g,buy,n),before=f.state.latinum,bank=f.market.credits,result=f.api.buySell(f.state,3,g,buy,n,quote.total);assert.equal(result.ok,true,result.error);assert.equal(result.total,quote.total);assert.equal(f.state.latinum+f.market.credits,before+bank);return result.total;}

test('every commodity/lot/threshold has nonprofitable buy-sell and sell-buy round trips',async()=>{
 const f=await setup();
 for(let g=0;g<9;g++)for(const n of [10,25,100,500])for(const edge of [0,1,10,25,119,120,179,180,181,500,9000]){
  reset(f,g,n+edge);const stock=f.market.stock[g];trade(f,g,true,n);trade(f,g,false,n);assert.ok(f.state.latinum<=1000000,`${g}/${n}/${edge} buy-sell`);assert.equal(f.market.stock[g],stock);assert.equal(f.state.solFreightHold[g],0);
  reset(f,g,edge,n);trade(f,g,false,n);trade(f,g,true,n);assert.ok(f.state.latinum<=1000000,`${g}/${n}/${edge} sell-buy`);assert.equal(f.market.stock[g],edge);assert.equal(f.state.solFreightHold[g],n);
 }
});
test('fragmented lots have exactly the same marginal price and cannot evade the spread',async()=>{
 const f=await setup();for(let g=0;g<9;g++)for(const [n,part] of [[100,10],[100,25],[500,10],[500,25],[500,100]]){
  reset(f,g,600);const wholeBuy=trade(f,g,true,n),wholeSell=trade(f,g,false,n);
  reset(f,g,600);let bought=0,sold=0;for(let i=0;i<n/part;i++)bought+=trade(f,g,true,part);for(let i=0;i<n/part;i++)sold+=trade(f,g,false,part);
  assert.equal(bought,wholeBuy);assert.equal(sold,wholeSell);
  for(let i=0;i<10;i++){trade(f,g,true,part);trade(f,g,false,part);}assert.ok(f.state.latinum<1000000);
 }
});
test('treasury, stock, storage and capacity failures are atomic and exclude existing escrow',async()=>{
 const f=await setup(),g=6;const check=buy=>{const before=JSON.stringify({market:f.market,hold:f.state.solFreightHold,money:f.state.latinum}),r=f.api.buySell(f.state,3,g,buy,10);assert.equal(r.ok,false);assert.equal(JSON.stringify({market:f.market,hold:f.state.solFreightHold,money:f.state.latinum}),before);};
 reset(f,g,120,100);f.market.credits=0;check(false);
 f.market.credits=1000;f.market.fundsReserved=1000;check(false);
 reset(f,g,120);f.market.reserved[g]=115;check(true);
 reset(f,g,120);f.state.latinum=0;check(true);
 reset(f,g,120,19995);check(true);
 reset(f,g,9995,100);check(false);
 reset(f,g,9980,100);f.market.incoming[g]=15;check(false);
 reset(f,g,120);const quoted=f.api.quote(f.state,3,g,true,100);f.market.stock[g]--;assert.equal(f.api.buySell(f.state,3,g,true,100,quoted.total).ok,false);
});
test('a completed retail transaction persists once and repeated initialization retains treasury balances',async()=>{
 const f=await setup();reset(f,6,120);const cost=trade(f,6,true,100),saved=copy(f.state),bank=f.market.credits;
 const next=await fixture({saved,economic:false}),m=next.lives.market(next.state,1,3);
 for(let i=0;i<20;i++){next.lives.initialize(next.state);next.lives.market(next.state,1,3);next.lives.inspect(next.state,next.ship.id);}
 assert.equal(next.state.latinum,1000000-cost);assert.equal(m.credits,bank);assert.equal(m.stock[6],20);assert.equal(next.state.solFreightHold[6],100);
 const again=await fixture({saved:copy(next.state),economic:false});assert.equal(again.lives.market(again.state,1,3).credits,bank);assert.equal(again.state.solFreightHold[6],100);
});
test('real cross-port scarcity still allows transport profit',async()=>{
 const f=await setup();reset(f,6,800);const buyer=f.lives.market(f.state,1,5);buyer.stock[6]=0;buyer.credits=1000000;
 const start=f.state.latinum;trade(f,6,true,100);const r=f.api.buySell(f.state,5,6,false,100);assert.ok(r.ok);assert.ok(f.state.latinum>start);
});
