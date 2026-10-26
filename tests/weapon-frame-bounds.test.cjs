const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');

test('weapon positions share one bounds read per frame and refresh after backing-size changes',()=>{
  let reads=0,scale=2;const painted=[];
  const canvas={width:800,getBoundingClientRect(){reads++;return {width:400};}};
  const ctx={canvas,save(){},restore(){},setTransform(){},getTransform:()=>({a:scale,b:0,c:0,d:scale,e:0,f:0})};
  const window={nativeEffectProfiles:{weapon:()=>({scale:1}),drawWeapon:(_,ctx,shot)=>painted.push(shot)}};
  vm.runInNewContext(fs.readFileSync('html-games/flashtrek-broken-mirror/weapon-effects.js','utf8'),{window});
  const shot={kind:'beam',style:{color:0xffa000,thickness:2},spin:0,spinSpeed:5},geometry={screenPixels:true,x1:10,y1:20,x2:100,y2:200};
  window.showcaseWeaponAppearance.beginFrame(canvas);
  for(let i=0;i<20;i++)window.paintShowcaseWeaponShot(ctx,shot,geometry,50);
  assert.equal(reads,1);assert.equal(painted[0].x1,10);assert.equal(painted[0].x2,100);
  canvas.width=1600;scale=4;window.paintShowcaseWeaponShot(ctx,shot,geometry,50);
  assert.equal(reads,2);assert.equal(painted.at(-1).x2,100);
  window.showcaseWeaponAppearance.endFrame(canvas);window.paintShowcaseWeaponShot(ctx,shot,geometry,50);assert.equal(reads,3);
});

test('GPU weapon packets preserve transformed CSS coordinates without writing Canvas drawing state',()=>{
  let packet=null,transform=null;
  const canvas={width:800,getBoundingClientRect:()=>({width:400})};
  const ctx=new Proxy({canvas,getTransform:()=>({a:0,b:2,c:-2,d:0,e:300,f:80})},
    {set(){assert.fail('GPU submission wrote Canvas state');},get(target,key){if(['save','restore','setTransform'].includes(key))return()=>assert.fail('GPU submission queued Canvas commands');return target[key];}});
  const window={nativeEffectProfiles:{weapon:()=>({scale:1.5}),queueWeapon:(_,shot,matrix)=>{packet=shot;transform=matrix;return true;},drawWeapon:()=>assert.fail('GPU packet fell through to Canvas')}};
  vm.runInNewContext(fs.readFileSync('html-games/flashtrek-broken-mirror/weapon-effects.js','utf8'),{window});
  const source={screenPixels:true,x1:10,y1:20,x2:100,y2:200},before=JSON.stringify(source);
  window.paintShowcaseWeaponShot(ctx,{kind:'beam',style:{color:0xabcdef,thickness:2},spin:.5,spinSpeed:6},source,50);
  assert.equal(packet.x1,130);assert.equal(packet.y1,50);assert.equal(packet.x2,-50);assert.equal(packet.y2,140);
  assert.equal(packet.zoom,1.5);assert.equal(packet.color,0xabcdef);assert.equal(packet.seed,.5);
  assert.deepEqual(JSON.parse(JSON.stringify(transform)),{a:2,b:0,c:0,d:2,e:0,f:0});
  assert.equal(JSON.stringify(source),before,'A paint packet must not mutate its authoritative geometry');
});
