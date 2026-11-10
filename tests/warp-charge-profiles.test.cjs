const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function fixture(){
 const draws=[],stack=[],ctx={globalAlpha:1,filter:'none',globalCompositeOperation:'source-over',
  save(){stack.push([this.globalAlpha,this.filter,this.globalCompositeOperation]);},restore(){[this.globalAlpha,this.filter,this.globalCompositeOperation]=stack.pop();},
  translate(){},rotate(){},scale(){},beginPath(){},arc(){},fill(){},fillRect(){},
  createRadialGradient(){return {addColorStop(){}};},
  drawImage(image,x,y,w,h){draws.push({x,y,w,h,alpha:this.globalAlpha,filter:this.filter});}
 };
 const window={},context=vm.createContext({window,document:{createElement(){return {getContext:()=>ctx};}},Math,Map,WeakMap,Promise,Object});
 for(const file of ['cthia-effects.js','constitution-showcase-lights.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror',file),'utf8'),context,{filename:file});
 return {window,draws,ctx};
}

test('Constitution collectors can charge without relabelling their ordinary running lights',()=>{
 const {window:w}=fixture(),lights=w.constitutionShowcaseLights.definitions(),collectors=lights.filter(p=>p.warpCharge);
 assert.deepEqual(Array.from(collectors,p=>[p.x,p.y]),[[193,724],[831,724]]);
 assert.ok(collectors.every(p=>p.kind==='running'&&p.color==='#ff962f'));
 assert.equal(lights.find(p=>p.x===512&&p.y===1325).warpCharge,undefined,'The stern running lamp must not become a charging emitter');
});

test('a charging collector stays bright during its off blink while unrelated lamps retain their pulse',()=>{
 const {window:w}=fixture(),lights=[{x:193,y:724,r:48,kind:'running',color:'#ff962f',warpCharge:true},{x:512,y:1325,r:18,kind:'running',color:'#ffbb73'}];
 const effects=w.createShowcaseEffects({width:1024,height:1536,lights,damage:[[],[],[],[]]});
 const frame=charge=>{const rows=[];effects.forEachLightPrimitive(0,0,{lightGain:2.8,nacelleCharge:charge},(image,x,y,width,height,alpha,screen,gain)=>rows.push({x:x+width/2,y:y+height/2,alpha,gain}));return rows;};
 const ordinary=frame(0),charged=frame(1);
 assert.equal(ordinary.find(p=>p.x===193).alpha,.03,'Fixture must exercise the collector off phase');
 assert.ok(charged.find(p=>p.x===193).alpha>=.85);
 assert.ok(charged.find(p=>p.x===193).gain>ordinary.find(p=>p.x===193).gain);
 assert.deepEqual(charged.filter(p=>p.x===512),ordinary.filter(p=>p.x===512));
});

test('direct Canvas and primitive rendering both apply the collector charge and preserve zero-charge appearance',()=>{
 const {window:w,ctx,draws}=fixture(),lights=w.constitutionShowcaseLights.definitions(),damage=[[],[],[],[]];
 const effects=w.createShowcaseEffects({width:1024,height:1536,lights,damage});
 const draw=(effect,charge)=>{draws.length=0;effect.draw(ctx,{x:512,y:768,w:1024,h:1536},0,0,0,{lights:true,damage:false,lightGain:2.8,nacelleCharge:charge});return draws.map(p=>({...p}));};
 const ordinary=draw(effects,0),withoutMarkers=w.createShowcaseEffects({width:1024,height:1536,lights:lights.map(({warpCharge,...p})=>p),damage});
 assert.deepEqual(draw(withoutMarkers,0),ordinary);
 const charged=draw(effects,1),collector=charged.find(p=>p.x+p.w/2===193&&p.y+p.h/2===724);
 assert.ok(collector.alpha>=.85);assert.equal(collector.filter,'brightness(16.799999999999997)');
 assert.deepEqual(charged.filter(p=>p.x+p.w/2===512&&p.y+p.h/2===1325),ordinary.filter(p=>p.x+p.w/2===512&&p.y+p.h/2===1325));
});
