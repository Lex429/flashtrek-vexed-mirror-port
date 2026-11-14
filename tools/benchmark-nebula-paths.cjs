// Deterministic 120-Hz fog workload. Throughput is not browser FPS qualification.
// Usage: node tools/benchmark-nebula-paths.cjs SOURCE_ROOT STRESS_REPORT [SECONDS]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||'.'),fixture=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),seconds=Number(process.argv[4]||3),fleet=fixture.fleet;
global.window=global;
const kernelAt=process.argv.indexOf('--kernel-root'),kernelRoot=kernelAt>=0?path.resolve(process.argv[kernelAt+1]):root;
for(const file of ['nebula-hull-masks.js','nebula-flow-kernel.js','nebula-material.js'])vm.runInThisContext(fs.readFileSync(path.join(file==='nebula-flow-kernel.js'?kernelRoot:root,'html-games/broken-mirror-port',file),'utf8'),{filename:file});
const phases={};
if(process.argv.includes('--phases')){const original=nativeNebulaFlowKernel;global.nativeNebulaFlowKernel={...original,create(...args){const k=original.create(...args);if(k)for(const name of ['run','raster','displace']){const fn=k[name];k[name]=(...a)=>{const start=performance.now();try{return fn(...a);}finally{phases[name]=(phases[name]||0)+performance.now()-start;}};}return k;}};}
const api=nativeNebulaMaterial,field=api.createField({minX:-831,minY:-981,width:1662,height:1962,cell:2}),speed=42750,half=1100,leg=half*2/speed,masks=fleet.map(r=>api.maskForType(r.id,r.stage||0));
field.seed(new Uint8ClampedArray([100,80,160,153]),1,1);
function travelClock(t){const cycle=Math.floor(t/10),u=t-cycle*10;return cycle*7+(u<3?u:u<4?3+(u-3)-(u-3)**2/2:u<6?3.5:u<7?3.5+(u-6)**2/2:4+u-7);}
function wallAtTravel(t){const cycle=Math.floor(t/7),u=t-cycle*7;return cycle*10+(u<3?u:u<3.5?4-Math.sqrt(1-2*(u-3)):u<4?6+Math.sqrt(2*(u-3.5)):7+u-4);}
function poses(t){const travel=travelClock(t),n=travel/leg,cycle=Math.floor(n),along=(cycle%2?1-(n-cycle):n-cycle)*half*2-half;
  return fleet.map((r,i)=>{const angle=i*Math.PI/fleet.length+travel*.4,lane=(i%5-2)*85;return {id:'stress:'+i,mask:masks[i],pose:{x:Math.cos(angle)*along-Math.sin(angle)*lane,y:Math.sin(angle)*along+Math.cos(angle)*lane,heading:angle+i*.14+.15*Math.sin(t*.7),width:r.width,height:r.height,speed}};});}
field.updateMany(poses(0),1/120,{rebase:true});let clock=0,commands=0;
function advance(end){while(clock<end-1e-10){const boundary=wallAtTravel((Math.floor((travelClock(clock)+1e-9)/leg)+1)*leg),cycle=Math.floor(clock/10),u=clock-cycle*10,phase=cycle*10+[3,4,6,7,10].find(v=>v>u+1e-9),next=Math.min(end,boundary,phase),dt=next-clock;clock=next;field.updateMany(poses(clock),dt);commands++;}}
for(let i=1;i<=120;i++)advance(i/120);
for(const key of Object.keys(phases))phases[key]=0;
const began=performance.now(),initialCommands=commands;
for(let i=1;i<=seconds*120;i++)advance(1+i/120);
const elapsedMs=performance.now()-began,snapshot=field.checkpoint(),hashes={};
for(const key of ['density','u','v','rate','swept'])hashes[key]=crypto.createHash('sha256').update(Buffer.from(snapshot[key].buffer,snapshot[key].byteOffset,snapshot[key].byteLength)).digest('hex');
process.stdout.write(JSON.stringify({scope:'Single-thread fixed-120-Hz fog simulation throughput; not rendered FPS',elapsedMs,simulationSeconds:seconds,realTimeRatio:seconds*1000/elapsedMs,commands:commands-initialCommands,phases,hashes,metrics:field.metrics(true)}));
