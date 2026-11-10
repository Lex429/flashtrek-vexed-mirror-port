const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
 const window={},counts={gradients:0,images:0,imageLoads:[],artDraws:[]};
 const ctx=new Proxy({}, {get:(target,key)=>target[key]??((...args)=>{
  if(String(key).startsWith('create')){counts.gradients++;return {addColorStop(){}};}
  if(key==='drawImage'){counts.images++;if(args[0]?.path)counts.artDraws.push(args[0].path);}
 }),set:(target,key,value)=>(target[key]=value,true)});
 const context=vm.createContext({window,document:{createElement:()=>({getContext:()=>ctx})},requestAnimationFrame:callback=>callback(0)});
 for(const name of ['world-data.js','system-catalog-data.js','system-catalog.js','stellar-background.js','flight-reference-data.js','vexed-space-model.js','vexed-space.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',name),'utf8'),context,{filename:name});
 window.vexedFlightAssets={loadImage:async path=>{counts.imageLoads.push(path);return {path,width:1254,height:1254};}};
 return {w:window,api:window.nativeStellarBackground,ctx,counts};
}
const view={w:1280,h:850,cameraX:0,cameraY:0,zoom:1,reducedMotion:true};

test('every physical system uses its existing star artwork as a nearer background disk, including companions',()=>{
 const {api,w}=fixture(),before=JSON.stringify(w.VexedMirrorSystemData);
 for(const record of w.nativeSystemCatalog.records){
  const id=record.legacyIds[0],expected=w.nativeSystemCatalog.bodies(id).filter(b=>b.kind==='star'&&!b.occludedBy),suns=api.project(id,view);
  assert.equal(suns.length,expected.length,record.name);
  assert.equal(suns.filter(s=>s.primary).length,1);
  for(let i=0;i<suns.length;i++){
   const sun=suns[i];assert.equal(sun.id,expected[i].id);assert.equal(sun.worldX,expected[i].x-220);assert.equal(sun.worldY,expected[i].y+75);
   assert.ok(Number.isFinite(sun.x)&&Number.isFinite(sun.y));
   assert.equal(sun.art,expected[i].art);assert.ok(sun.radius>=24&&sun.radius<=68);assert.ok(sun.intensity>0);
  }
 }
 assert.equal(api.project(12,view).length,3);
 assert.equal(JSON.stringify(w.VexedMirrorSystemData),before);
});

test('the nearer star plane has one fixed parallax rate without a camera or viewport leash',()=>{
 const {api}=fixture(),source=api.sources(1)[0],near={...view,cameraX:source.worldX-200,cameraY:source.worldY};
 const a=api.project(1,near)[0],b=api.project(1,{...near,cameraX:near.cameraX+100})[0];
 assert.ok(a.x-b.x>20&&a.x-b.x<100,'A nearby sun moves visibly but less than foreground geometry');
 for(const zoom of [.25,1,4]){
  const c=api.project(1,{...near,zoom,heading:Math.PI})[0];assert.equal(c.x,a.x);assert.equal(c.y,a.y);assert.equal(c.radius,a.radius);
 }
 const resized=api.project(1,{...near,w:1920,h:1080})[0];
 assert.equal(resized.x-960,a.x-view.w/2);assert.equal(resized.y-540,a.y-view.h/2);
 const centered=api.project(1,{...view,cameraX:source.worldX,cameraY:source.worldY})[0];
 assert.equal(centered.x,view.w/2);assert.equal(centered.y,view.h/2);
 const far=api.project(1,{...view,cameraX:1e7})[0];assert.equal(far.intensity,a.intensity);assert.equal(far.radius,a.radius);
});

test('camera travel slides a fixed-size star layer on and off screen without proximity growth',()=>{
 const {api}=fixture(),source=api.sources(1)[0],rows=[];
 for(let x=-8000;x<=8000;x+=100)rows.push(api.project(1,{...view,cameraX:source.worldX+x,cameraY:source.worldY})[0]);
 assert.ok(rows[0].x>view.w+500);assert.ok(rows.at(-1).x<-500);
 for(let i=1;i<rows.length;i++)assert.ok(rows[i].x<rows[i-1].x,'Passing the sun must never drag it back onto the screen');
 for(const row of rows){assert.equal(row.radius,rows[0].radius);assert.equal(row.intensity,rows[0].intensity);assert.equal(row.parallax,rows[0].parallax);}
 for(let i=1;i<rows.length;i++)assert.ok(Math.abs(rows[i-1].x-rows[i].x-100*rows[i].parallax)<1e-9);
});

test('shared illumination points at the actual visible primary instead of a decorative background star',()=>{
 const {w,ctx}=fixture(),sky=w.vexedSpace;
 for(const id of [1,2,4,12,50]){
  sky.enterSystem(id,true);sky.render(ctx,view,[]);const primary=sky.suns.find(s=>s.primary);
  assert.equal(sky.light.x,primary.x);assert.equal(sky.light.y,primary.y);assert.equal(sky.light.color,primary.color);
  const saved={...sky.light};for(const star of sky.state.stars){star.x=200;star.y=100;star.color=0xff00ff;}
  sky.render(ctx,view,[{x:primary.x,y:primary.y,rx:100,ry:100}]);assert.deepEqual({...sky.light},saved);
 }
 const source=w.nativeStellarBackground.sources(1)[0];sky.enterSystem(1,true);
 w.nativeFlightLightingEnabled=false;sky.render(ctx,{...view,cameraX:source.worldX-200,cameraY:source.worldY},[]);
 assert.equal(sky.light,null);assert.ok(w.nativeStellarBackground.metrics().draws>0);
});

test('warm solar flare painting reuses a bounded spectral texture cache and covered sources submit no draws',async()=>{
 const {api,w,ctx,counts}=fixture();
 for(const record of w.nativeSystemCatalog.records)await api.prepare(record.legacyIds[0]);
 const warm=api.metrics(),gradients=counts.gradients;
 assert.ok(warm.textures<=6&&warm.bytes<12*1024*1024);
 assert.equal(warm.loadedImages,5);assert.equal(counts.imageLoads.length,5,'Existing artwork is decoded once per path');
 assert.ok(warm.imageBytes+warm.bytes<48*1024*1024);
 const sources=api.sources(12);
 for(const source of sources){
  const near={...view,cameraX:source.worldX-100,cameraY:source.worldY+50};
  const sun=api.project(12,near).find(s=>s.id===source.id);
  for(let i=0;i<40;i++)api.render(ctx,[sun],near,[],()=>1,{elapsed:1});
  assert.ok(api.metrics().draws<=16);assert.equal(api.metrics().bodies,1);
  assert.ok(counts.artDraws.includes(source.art),'Paint the real catalog image');
 }
 assert.equal(counts.gradients,gradients);assert.equal(api.metrics().builds,warm.builds);
 const source=sources[0],near={...view,cameraX:source.worldX,cameraY:source.worldY};
 api.render(ctx,api.project(12,near),near,[],()=>0);assert.equal(api.metrics().draws,0);
});

test('fully offscreen suns paint neither their bodies nor stranded lens reflections',async()=>{
 const {api,ctx}=fixture();await api.prepare(1);const source=api.sources(1)[0];
 for(const offset of [-8000,8000]){
  const away={...view,cameraX:source.worldX+offset,cameraY:source.worldY};
  api.render(ctx,api.project(1,away),away,[],()=>1,{elapsed:1});
  assert.equal(api.metrics().draws,0);assert.equal(api.metrics().bodies,0);
 }
});
