const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/save-snapshot.js'),'utf8');
function setup(clock=performance){const context=vm.createContext({window:{},performance:clock});vm.runInContext(source,context);return context.window.nativeSaveSnapshot;}
const plain=value=>JSON.parse(JSON.stringify(value));

test('fast graph records use their CPU budget without imposing a frame wait per fixed row count',async()=>{
 const api=setup({now:()=>0}),rows=[],queue=[],state={ships:Array.from({length:12000},(_,id)=>({id,credits:id+.125})),debt:.0275};let root,waits=0;
 api.capture(state,{schedule:fn=>queue.push(fn),now:()=>0,part:part=>{for(const row of structuredClone(part))rows[row.id]=row;},complete:value=>root=value,failed:error=>{throw error;}});while(queue.length)queue.shift()();
 const result=await api.restoreAsync(rows,root,{schedule:fn=>{waits++;setImmediate(fn);}});
 assert.equal(waits,0,'Fast rows were forced to wait despite unused CPU budget');assert.deepEqual(plain(result),state);
});

test('both restore paths create mutable own data fields for inherited names without invoking setters',async()=>{
 const context=vm.createContext({window:{},performance});
 vm.runInContext('Object.defineProperty(Object.prototype,"fleetAudit",{configurable:true,set(){throw Error("Inherited setter invoked");}})',context);
 vm.runInContext(source,context);const api=context.window.nativeSaveSnapshot,rows=[{id:0,array:false,keys:['fleetAudit','constructor','__proto__','ordinary'],values:[3.125,'captain',[1],9]},{id:1,array:false,keys:['safe'],values:[true]}];
 for(const restored of [api.restore(rows,[0]),await api.restoreAsync(rows,[0],{schedule:setImmediate})]){
  assert.equal(restored.fleetAudit,3.125);assert.equal(restored.constructor,'captain');assert.equal(Object.getPrototypeOf(restored).safe,undefined);assert.equal(restored.__proto__.safe,true);
  for(const key of rows[0].keys){const d=Object.getOwnPropertyDescriptor(restored,key);assert.ok(d.enumerable&&d.writable&&d.configurable);delete restored[key];assert.equal(Object.hasOwn(restored,key),false);}
 }
});

test('cooperative graph restore retains aliases, fractional records and safe property names, and rejects cancellation',async()=>{
 const api=setup(),rows=[],queue=[],shared={funds:3.125},state={ships:Array.from({length:5000},(_,id)=>({id,credits:id+.25,shared})),debt:.0275};
 Object.defineProperty(state,'__proto__',{value:{safe:true},enumerable:true});let root;
 api.capture(state,{schedule:fn=>queue.push(fn),part:batch=>{for(const row of structuredClone(batch))rows[row.id]=row;},complete:value=>{root=value;},failed:error=>{throw error;}});while(queue.length)queue.shift()();
 let yields=0;const result=await api.restoreAsync(rows,root,{schedule:fn=>{yields++;setImmediate(fn);}});
 assert.ok(yields>1);assert.deepEqual(plain(result),plain(state));assert.equal(result.ships[0].shared,result.ships[4999].shared);assert.equal(Object.getPrototypeOf(result).safe,undefined);
 delete result.ships[0].credits;assert.equal('credits' in result.ships[0],false,'Restored live records cannot delete completed-job fields');
 const controller=new AbortController();await assert.rejects(api.restoreAsync(rows,root,{signal:controller.signal,schedule:fn=>{controller.abort();setImmediate(fn);}}),/cancelled/);
 const damaged=rows.slice();damaged[1]={...damaged[1],id:999};await assert.rejects(api.restoreAsync(damaged,root,{schedule:setImmediate}),/Incomplete/);
});

test('staged capture rechecks mutations, deletions, replaced subgraphs, array edits and aliases at the exact final boundary',()=>{
 const api=setup(),queue=[],rows=[];let clock=0,result,expected;
 const dot={id:'dot:1',hull:17.25,condition:.875},s={day:1,shipSimulation:{schedule:{pendingSeconds:.735}},cargo:{tons:2.125},ships:Array.from({length:600},(_,id)=>({id,credits:300.75,task:{id:'job:'+id,paid:true},dot:id===0?dot:null})),old:{removed:true},bay:[dot]};
 Object.defineProperty(s,'__proto__',{value:{safe:true},writable:true,configurable:true,enumerable:true});
 api.capture(s,{schedule:fn=>queue.push(fn),now:()=>++clock,budgetMs:1,part(batch){for(const row of structuredClone(batch))rows[row.id]=row;},complete(root){expected=plain(s);result=api.restore(rows,root);},failed:error=>{throw error;}});
 for(let i=0;queue.length;i++){
  queue.shift()();if(i===10){s.day=2;delete s.old;s.newField={funded:123.625};s.cargo={tons:.375};dot.hull=9.5;s.ships[0].credits=111.125;s.ships.push({id:600,credits:5});s.bay.push({id:'dot:2',hull:4});s.shipSimulation.schedule.pendingSeconds=1.125;}
 }
 assert.deepEqual(plain(result),expected);assert.equal(result.bay[0],result.ships[0].dot);assert.equal(Object.getPrototypeOf(result).safe,undefined);dot.hull=1;assert.equal(result.bay[0].hull,9.5);
});

test('staged capture retains holes and ordinary JSON omissions and can be cancelled without a commit',()=>{
 const api=setup(),queue=[],rows=[];let result,commits=0;
 const s={empty:undefined,fn(){},array:[1,,undefined,Infinity],nested:new Proxy({value:12},{})};
 api.capture(s,{schedule:fn=>queue.push(fn),part(batch){for(const row of structuredClone(batch))rows[row.id]=row;},complete(root){result=api.restore(rows,root);},failed:error=>{throw error;}});while(queue.length)queue.shift()();assert.deepEqual(plain(result),plain(s));
 const task=api.capture(s,{schedule:fn=>queue.push(fn),part(){},complete(){commits++;},failed:error=>{throw error;}});task.cancel();while(queue.length)queue.shift()();assert.equal(commits,0);
});

test('custom toJSON asks for the direct JSON fallback and invalidated captures never publish',()=>{
 const api=setup(),queue=[];let failures=0,commits=0,valid=true;
 api.capture({nested:{toJSON(){return 'custom';}}},{schedule:fn=>queue.push(fn),part(){},complete(){commits++;},failed(){failures++;}});while(queue.length)queue.shift()();assert.equal(failures,1);assert.equal(commits,0);
 api.capture({a:{value:1}},{schedule:fn=>queue.push(fn),valid:()=>valid,part(){},complete(){commits++;},failed:error=>{throw error;}});valid=false;while(queue.length)queue.shift()();assert.equal(commits,0);
});

test('mutations after final validation cannot leak into the immutable transfer records',()=>{
 const api=setup(),queue=[],rows=[],s={value:1,child:{paid:2},ships:Array.from({length:400},(_,id)=>({id,x:0}))};let result,expected,tick=0;
 const task=api.capture(s,{schedule:fn=>queue.push(fn),now:()=>++tick,budgetMs:1,part(batch){for(const row of structuredClone(batch))rows[row.id]=row;},complete(root){result=api.restore(rows,root);},failed:error=>{throw error;}});
 while(!task.stats.validationMs){queue.shift()();s.child.paid=3;}
 expected=plain(s);s.value=9;s.child.paid=8;s.ships.push({id:401,x:4});
 while(queue.length)queue.shift()();assert.deepEqual(plain(result),expected);
});

test('shape-cache collisions cannot confuse different middle properties with identical first/last keys',()=>{
 const api=setup(),queue=[],rows=[],s={ships:Array.from({length:600},(_,id)=>id%2?{id,x:id,end:true}:{id,y:id,end:true})};let tick=0,result;
 api.capture(s,{schedule:fn=>queue.push(fn),now:()=>++tick,budgetMs:1,part(batch){for(const row of JSON.parse(JSON.stringify(batch)))rows[row.id]=row;},complete(root){result=api.restore(rows,root);},failed:error=>{throw error;}});
 for(let i=0;queue.length;i++){queue.shift()();if(i===20){delete s.ships[0].y;s.ships[0].z=4;}}
 assert.deepEqual(plain(result),plain(s));
});
