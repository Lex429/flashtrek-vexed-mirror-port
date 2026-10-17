// Recreate the audited save from the audited code; never run new code to seed it.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
(async()=>{
 const f=await fixture({revision:'c41559c',full:false,economic:false}),{window:w,state:s}=f;
 vm.runInContext(execFileSync('git',['show','c41559c:html-games/broken-mirror-port/sol-flight.js'],{encoding:'utf8'}),f.context);
 delete s.civilianTraffic;w.nativeCivilianTraffic.initialize(s);w.nativeNpcLives.initialize(s);
 s.system=47;s.x=1000000;s.y=1000000;
 for(let i=0;i<108000;i++){w.nativeSimulation.advance(s,1/60);w.nativeSolEconomy.advance(s,1/60);w.nativeCivilianTraffic.advance(s,1/60);}
 const stuck=s.civilianTraffic.ships.filter(ship=>ship.system===1&&ship.port===3&&ship.task?.phase==='waiting-payment'),positions={};
 for(const ship of stuck)(positions[`${ship.x},${ship.y}`]||=[]).push(ship.id);
 const output=path.join(__dirname,'fixtures/earth-jam-c415.json');fs.writeFileSync(output,JSON.stringify(s));
 console.log(JSON.stringify({revision:'c41559c',seconds:1800,step:1/60,ships:s.civilianTraffic.ships.length,earthWaiting:stuck.length,coordinates:Object.keys(positions).length,maxOverlap:Math.max(...Object.values(positions).map(a=>a.length)),treasury:s.civilianTraffic.life.markets['1:3'].credits,output}));
})().catch(error=>{console.error(error);process.exitCode=1;});
