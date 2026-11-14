const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
  const window={},scope=vm.createContext({window,atob});
  for(const file of ['nebula-flow-kernel.js','nebula-material.js','nebula-asteroid-masks.js','nebula-asteroids.js'])vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+file,'utf8'),scope);
  const rock={slotId:17,id:100,x:10,y:-20,previousX:-400,previousY:-20,angle:.7,size:68,maxHull:100,vx:35,vy:-12,file:'asteroids/asteroid_01.png'},state={system:1,asteroidDamage:{}};
  const arts=new Map();window.nativeSolAsteroids={frame:(r,d)=>d>=75?r.file.replace('.png','_severe.png'):'asteroids/asteroid_01_intact.png',image:file=>{if(!arts.has(file))arts.set(file,{complete:true,naturalWidth:178,src:'http://test/showcase-assets/'+file});return arts.get(file);}};
  return {window,rock,state,api:window.nativeNebulaMaterial,adapter:window.nativeNebulaAsteroids,descriptor:{category:'asteroid',entity:rock,previousX:rock.previousX,previousY:rock.previousY}};
}
test('all 81 asteroid plates decode once from original alpha without runtime raster sampling',()=>{
  const {window,api}=fixture();const records=Object.values(window.nativeNebulaAsteroidMasks.masks);assert.equal(records.length,81);
  for(const r of records){const m=api.maskForRecord(r);assert.equal(m.w,160);assert.equal(m.h,160);assert.ok(m.alpha.some(x=>x>=48));assert.ok(m.alpha.some(x=>x<48));assert.equal(api.maskForRecord(r),m);}
  assert.equal(api.metrics().sampledMasks,0);
});
test('asteroid gas pose matches the exact Canvas angle, size and weather origin',()=>{
  const {rock,state,adapter,descriptor}=fixture(),origin={x:300,y:-70},b=adapter.bodyFor(state,descriptor,{origin});
  assert.equal(b.id,'asteroid:17');assert.equal(b.category,'asteroid');assert.equal(b.pose.x,rock.x-origin.x);assert.equal(b.pose.y,rock.y-origin.y);
  assert.equal(b.pose.heading,rock.angle-Math.PI/2);assert.equal(b.pose.width,rock.size);assert.equal(b.pose.height,rock.size);assert.equal(b.pose.speed,37);
  assert.equal(b.from.x,rock.previousX-origin.x);assert.equal(b.from.y,rock.previousY-origin.y);
  const highZoom=adapter.bodyFor(state,descriptor,{zoom:4});assert.equal(highZoom.pose.width,rock.size*2.2/4);
});
test('damage changes masks, while loading fallback masks match the artwork actually displayed',()=>{
  const {window,rock,state,adapter,descriptor}=fixture(),intact=adapter.bodyFor(state,descriptor);
  state.asteroidDamage[rock.slotId]=80;const severe=adapter.bodyFor(state,descriptor);assert.notEqual(severe.mask,intact.mask);assert.equal(adapter.bodyFor(state,descriptor).mask,severe.mask);
  const file=rock.file.replace('.png','_severe.png');window.nativeSolAsteroids.image=()=>({complete:true,naturalWidth:178,src:'http://test/showcase-assets/asteroids/asteroid_01_intact.png'});
  assert.equal(adapter.bodyFor(state,descriptor).mask,intact.mask);
  window.nativeSolAsteroids.image=()=>({complete:false,naturalWidth:0});assert.equal(adapter.bodyFor(state,descriptor).mask,severe.mask,'Cold artwork cannot suppress a real asteroid crossing');
  assert.equal(window.nativeNebulaMaterial.metrics().sampledMasks,0);assert.ok(file.endsWith('_severe.png'));
});
test('stationary rocks have zero fake speed and a real fast crossing retains both endpoints',()=>{
  const {rock,state,adapter,descriptor}=fixture(),field={minX:-100,minY:-100,width:200,height:200};rock.vx=rock.vy=0;
  assert.equal(adapter.bodyFor(state,descriptor,{field}).pose.speed,0);rock.x=400;
  const crossing=adapter.bodyFor(state,descriptor,{field});assert.equal(crossing.from.x,-400);assert.equal(crossing.sweepEnd.x,400);
  rock.y=400;descriptor.previousY=400;assert.equal(adapter.bodyFor(state,descriptor,{field}).sweepEnd,undefined);
});
test('real asteroid drift and spin displace gas conservatively and removal releases the old solid',()=>{
  const {api,adapter,rock,state,descriptor}=fixture(),f=api.createField({minX:-140,minY:-100,width:280,height:200,cell:3,uniform:.6});
  rock.x=-70;rock.y=0;descriptor.previousX=rock.x;descriptor.previousY=0;
  const mass=f.metrics(true).mass;
  for(let i=0;i<35;i++){rock.x+=3;rock.angle+=.025;const b=adapter.bodyFor(state,descriptor);f.updateMany([b],1/60);descriptor.previousX=rock.x;}
  assert.ok(Math.abs(f.metrics(true).mass-mass)<mass*1e-5);const oldSolid=Array.from(f.checkpoint().solid).filter(Boolean).length;assert.ok(oldSolid>20);
  f.updateMany([],1/60);assert.equal(Array.from(f.checkpoint().solid).filter(Boolean).length,0);assert.ok(Math.abs(f.metrics(true).mass-mass)<mass*1e-5);
});
