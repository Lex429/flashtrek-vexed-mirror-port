const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const port=path.join(__dirname,'../html-games/broken-mirror-port');

test('invisible mining requests no images or pixel work, even after a visible damage appearance',()=>{
  const calls=[],window={nativeSolAsteroids:{image(){calls.push('image');throw Error('Invisible artwork requested');},frame(){calls.push('frame');}}};
  const sandbox=vm.createContext({window,console});
  for(const file of ['effect-visibility.js','asteroid-mining-effects.js'])vm.runInContext(fs.readFileSync(path.join(port,file),'utf8'),sandbox);
  for(const effect of [undefined,{data:{image:{}},clock:10,parts:[]}]){
    const mining={born:0,rock:{x:9000,y:9000,size:80,oreType:'deuranium',maxHull:100,slotId:7,file:'cold.png'},state:{asteroidDamage:{7:40},ore:3,cargo:12},effect};
    const before=JSON.stringify(mining);
    window.nativeAsteroidMiningEffects.draw({},mining,{x:9000,y:9000,source:{x:8800,y:9000},zoom:1,now:4500,w:800,h:600});
    assert.equal(JSON.stringify(mining),before,'offscreen painting cannot change mining state or resources');
  }
  assert.deepEqual(calls,[]);
});

function fixture(){
  const calls=[],state={system:2},entity={id:1,x:1000,y:40,hull:50,shields:20,phase:'flight'};
  const window={nativeSimulation:{now:()=>1000},nativeCombatShots:{worldPoint:()=>({x:0,y:0})},
    nativeShipDamage:{collision:(_d,event)=>event.contact},
    nativeShipDefinitions:{get:()=>({hull:100,artwork:{source:'showcase'}}),stage:()=>0,surfaceRadii:()=>({rx:20,ry:30})},
    nativeShipSpriteCache:{flush:()=>calls.push('flush')},
    vexedFlightAssets:{loadShip:()=>{calls.push('load');return Promise.resolve(null);},drawShip:(_c,_a,_x,_y,_w,_h,_t,appearance)=>calls.push('hull:'+appearance.canvasOnly)},
    drawShowcaseShieldSurface:(_c,_x,_y,_w,_h,_color,_charge,_time,options)=>calls.push(options.front?'shield-front':'shield-back'),
    drawShowcaseShieldFlash:()=>calls.push('flash')};
  const sandbox=vm.createContext({window,console,performance:{now:()=>0}});
  for(const file of ['effect-visibility.js','ship-effects.js'])vm.runInContext(fs.readFileSync(path.join(port,file),'utf8'),sandbox);
  const descriptor={state,entity,system:2,id:1,shipType:7,category:'civilian',x:1000,y:40,heading:.5,dimensions:{width:40,height:80},definition:{shields:20,hull:100}};
  const view={ship:{x:0,y:0},cx:0,cy:0,w:100,h:100,zoom:1};
  const ctx={save(){},restore(){},translate(){},rotate(){},scale(){},globalAlpha:1};
  return {window,state,entity,descriptor,view,ctx,calls};
}

test('offscreen shared ships are culled before requests, disabled repair plates or custom artwork',()=>{
  for(const custom of [false,true]){
    const f=fixture();f.entity.phase='disabled';
    f.window.nativeRepairVisuals={surface:()=>f.calls.push('repair')};
    if(custom)f.descriptor.definition.renderer={draw:()=>f.calls.push('custom')};
    assert.equal(f.window.nativeShipEffects.paintShip(f.ctx,f.descriptor,f.view),null);
    assert.deepEqual(f.calls,[]);
    assert.equal(f.entity.hull,50);assert.equal(f.entity.shields,20);
  }
});

test('large rotated hulls and peripheral glow remain admitted when their center is offscreen',()=>{
  const f=fixture();f.descriptor.x=-220;f.descriptor.y=50;f.descriptor.heading=Math.PI/2;
  f.descriptor.dimensions={width:600,height:40};f.descriptor.definition.renderer={draw:()=>f.calls.push('custom')};
  f.window.nativeShipEffects.paintShip(f.ctx,f.descriptor,f.view);
  assert.deepEqual(f.calls,['flush','custom']);
  f.calls.length=0;f.descriptor.x=-70;f.descriptor.dimensions={width:10,height:10};
  f.window.nativeShipEffects.paintShip(f.ctx,f.descriptor,f.view);
  assert.deepEqual(f.calls,['flush','custom'],'light bloom entering the view is not clipped at the hull');
});

test('interpolated visible pose is used without moving authoritative state or preparing invisible art',()=>{
  const f=fixture();let painted;
  f.window.nativeSimulationFrame={renderPose:(_state,d)=>({...d,x:50,y:50,heading:.2})};
  f.descriptor.definition.renderer={draw:(_ctx,d)=>{painted=d;}};
  f.window.nativeShipEffects.paintShip(f.ctx,f.descriptor,f.view);
  assert.equal(painted.x,50);assert.equal(painted.heading,.2);
  assert.equal(f.descriptor.x,1000);assert.equal(f.entity.x,1000);assert.equal(f.entity.hull,50);
  assert.deepEqual(f.calls,['flush']);
});

test('a shield flash is an explicit batch barrier preserving back, hull and front order',()=>{
  const f=fixture();f.descriptor.x=50;f.descriptor.y=50;
  const contact={local:{x:0,y:-25},world:{x:50,y:25},dx:0,dy:1};
  f.window.nativeShipEffects.visualImpact(f.state,f.descriptor,{contact,kind:'projectile'});
  f.window.nativeShipEffects.paintShip(f.ctx,f.descriptor,{...f.view,asset:{art:{},width:40,height:80}});
  assert.deepEqual(f.calls,['flush','shield-back','hull:true','flash','shield-front']);
  assert.equal(f.entity.hull,50);assert.equal(f.entity.shields,20,'painting does not replay damage');
});
