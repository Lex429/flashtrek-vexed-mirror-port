const test=require('node:test'),assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');

test('indexed mining claims follow approach, work, collection and cancellation without scanning the fleet',async()=>{
 const {state:s,window:w}=await tacticalFixture(),lives=w.nativeNpcLives,ships=s.civilianTraffic.ships;
 const miner=ships[0],other=ships[1],id=123456;
 Object.assign(miner,{phase:'mining-flight',miningRockSlot:id});lives.refreshLocation(s,miner);
 Object.assign(other,{phase:'docked',miningRockSlot:id+1});lives.refreshLocation(s,other);
 let scans=0;ships.some=function(...args){scans++;return Array.prototype.some.apply(this,args);};lives.initialize(s);
 for(const phase of ['mining-flight','mining','collecting']){
  miner.phase=phase;lives.refreshLocation(s,miner);
  for(let i=0;i<60;i++)assert.equal(w.nativeCivilianTraffic.isMiningRock(s,id),true);
  assert.equal(w.nativeCivilianTraffic.isMiningRock(s,id+1),false);
 }
 miner.phase='docked';lives.refreshLocation(s,miner);
 assert.equal(w.nativeCivilianTraffic.isMiningRock(s,id),false);
 other.phase='mining-flight';lives.refreshLocation(s,other);
 assert.equal(w.nativeCivilianTraffic.isMiningRock(s,id+1),true);
 assert.equal(scans,0,'A repeated claim query scanned the saved fleet');delete ships.some;
});
