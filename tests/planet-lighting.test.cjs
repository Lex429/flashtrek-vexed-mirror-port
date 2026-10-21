const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

function fixture(){
  const gradient={addColorStop(){}};
  const ctx=new Proxy({}, {get:(target,key)=>target[key]??(()=>key.startsWith('create')?gradient:undefined),set:(target,key,value)=>(target[key]=value,true)});
  const window={},document={createElement:()=>({getContext:()=>ctx})};
  const sandbox=vm.createContext({window,document});
  for(const name of ['flight-reference-data.js','vexed-space-model.js','vexed-space.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',name),'utf8'),sandbox);
  return {api:window.vexedSpace,ctx};
}

test('eclipse entry and exit cover a finite source continuously, including overlapping bodies',()=>{
  const {api}=fixture(),body={x:0,y:0,rx:90,ry:80},star={x:0,y:0,radius:1.5};
  assert.equal(api.sourceVisibility(star,[body]),0);
  star.x=97;assert.equal(api.sourceVisibility(star,[body]),1);
  star.x=90;const partial=api.sourceVisibility(star,[body]);assert.ok(partial>.49&&partial<.53);
  assert.equal(api.sourceVisibility(star,[body,body]),partial,'overlap must not double-count covered light');
  const forward=[];
  for(let x=83;x<=97;x+=.02){star.x=x;forward.push(api.sourceVisibility(star,[body]));}
  for(let i=1;i<forward.length;i++){
    assert.ok(forward[i]>=forward[i-1]-1e-12,'enter/exit must be monotonic');
    assert.ok(forward[i]-forward[i-1]<.005,'no center-containment brightness step');
  }
  for(let i=forward.length-1;i>=0;i--){star.x=83+i*.02;assert.ok(Math.abs(api.sourceVisibility(star,[body])-forward[i])<1e-10,'reveal must retrace coverage without lag');}
  const upper={x:0,y:-35,rx:90,ry:40},lower={x:0,y:35,rx:90,ry:40};
  star.x=0;assert.ok(api.sourceVisibility(star,[upper,lower])<.001,'union can fully cover the source even if neither body does alone');
});

test('occlusion and artwork limbs share camera, scale and fallback geometry',()=>{
  const {api}=fixture(),planet={x:230,y:120,width:180,height:180};
  const earth=api.bodyDisk(planet,1,3),moon=api.bodyDisk(planet,1,4),mercury=api.bodyDisk(planet,1,1),sun=api.bodyDisk(planet,1,0);
  assert.ok(earth.profile.atmosphere);
  assert.equal(moon.profile.atmosphere,undefined);assert.equal(mercury.profile.atmosphere,undefined);
  assert.ok(sun.profile.emission);assert.equal(sun.profile.atmosphere,undefined);
  assert.ok(moon.rx<earth.rx*.76,'Moon limb follows its padded artwork');
  assert.ok(sun.rx<earth.rx*.61,'Sun emission follows its own disk');
  const fallback=api.bodyDisk(planet,1,4,false);assert.equal(fallback.rx,180*.35);
  for(const scale of [.4,1,2.7]){
    const star={x:earth.x+earth.rx,y:earth.y,radius:1.5},before=api.sourceVisibility(star,[earth]);
    const shifted={...earth,x:earth.x*scale+177,y:earth.y*scale-93,rx:earth.rx*scale,ry:earth.ry*scale};
    const after=api.sourceVisibility({x:star.x*scale+177,y:star.y*scale-93,radius:star.radius*scale},[shifted]);
    assert.ok(Math.abs(before-after)<1e-12);
  }
});

test('primary illumination survives background-star movement, occlusion, camera changes and resizing',()=>{
  const {api,ctx}=fixture(),view={w:600,h:450,playerX:0,playerY:0,cameraX:0,cameraY:0,zoom:1,reducedMotion:true};
  api.render(ctx,view,[]);const original={...api.light};
  for(const star of api.state.stars)if(star.layer===5){star.x=300;star.y=225;star.color=0x0000ff;}
  api.render(ctx,view,[{x:300,y:225,rx:150,ry:150}]);assert.deepEqual({...api.light},original);
  api.render(ctx,{...view,w:900,h:600,cameraX:70,cameraY:-25,zoom:2},[]);
  assert.equal(api.light.x,450+(-6220-70)*2);assert.equal(api.light.y,300+(-925+25)*2);
  api.enterSystem(9);api.render(ctx,view,[]);const directional={...api.light};
  assert.equal(directional.direction,api.systemStars.default.direction);
  api.update(1,{locx:500,locy:-300,speed:200});
  api.render(ctx,{...view,playerX:10000,playerY:-17000,heading:Math.PI},[]);
  assert.deepEqual({...api.light},directional);
});
