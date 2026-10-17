/* Compare the audited source with --working; not a test glob. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
(async()=>{
  const working=process.argv.includes('--working'),revision=working?undefined:process.argv[2]||'c41559c',fixture=await tacticalFixture({revision});
  fixture.start();fixture.clearCounts();for(let i=0;i<60;i++)fixture.step();
  const window={},source=working?fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/ship-motion.js'),'utf8'):execFileSync('git',['show',revision+':html-games/broken-mirror-port/ship-motion.js'],{encoding:'utf8'});
  vm.runInNewContext(source,{window});
  const ship={x:10,y:20,heading:.7,speed:0},leg=window.nativeShipMotion.planLeg(ship,{x:10,y:20},{maxSpeed:100,acceleration:50,braking:60},0);
  window.nativeShipMotion.sampleLeg(ship,leg,1);
  const report={revision:revision||'working tree',distantCombat:{detail:fixture.window.nativeNpcLives.detail(fixture.state,fixture.ships[0]),...fixture.calls},
    zeroDistance:{finiteDuration:Number.isFinite(leg.duration),finiteVelocity:Number.isFinite(ship.vx)&&Number.isFinite(ship.vy),duration:String(leg.duration),vx:String(ship.vx)}};
  fs.mkdirSync(path.join(__dirname,'../test-results'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../test-results/stabilization-reproduction-'+(working?'after':'before')+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
