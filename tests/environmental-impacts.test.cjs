const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function load(context,file){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});}
function context(){
  const target={window:{},console,performance:{now:()=>5000},document:{hidden:false,createElement:()=>({width:10,height:10,getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(400).fill(255)})})})}};
  vm.createContext(target);load(target,'html-games/flashtrek-broken-mirror/debris-impacts.js');return target;
}
{
  const {window}=context(),ship={id:'s',x:80,y:0,radius:10,hull:73,shields:26,system:1},rock={id:'r',x:50,y:0,radius:8,system:1};
  const hits=[],controller=window.createEnvironmentalImpacts({getShips:()=>[ship,{id:'other-system',x:1,y:0,radius:2,system:2}],getAsteroids:()=>rock.destroyed?[]:[rock],onShipImpact:(target,event)=>hits.push([target.id,event]),onAsteroidHit:target=>target.destroyed=true});
  controller.explode({x:0,y:0,born:0,radius:100,duration:1000,system:1});
  controller.update(100);assert.equal(hits.length,0);assert.equal(rock.destroyed,undefined);
  controller.update(500);assert.equal(rock.destroyed,true);assert.equal(hits.length,0);
  controller.update(800);controller.update(900);assert.equal(hits.length,1);assert.equal(hits[0][1].visualOnly,true);assert.equal(hits[0][1].kind,'explosion');
  assert.equal(ship.hull,73);assert.equal(ship.shields,26);
  controller.reset();controller.explode({x:0,y:0,radius:100,sourceKey:'ship:s',system:1});controller.update(1000);assert.equal(hits.length,1);
}
{
  const {window}=context(),hits=[],controller=window.createEnvironmentalImpacts({getShips:()=>[{id:'s',x:50,y:0,radius:5}],getAsteroids:()=>[{id:'r',x:150,y:0,radius:5}],onShipImpact:(_,event)=>hits.push(event),onAsteroidHit:(_,event)=>hits.push(event)});
  const piece={x:200,y:0,born:0,size:2};controller.stepDebris(piece,0,0,1);assert.equal(hits.length,2);assert.equal(hits[0].kind,'debris');assert(hits[0].x<50);
  controller.stepDebris(piece,0,0,2);assert.equal(hits.length,2,'one piece hits each object once');
  assert.equal(window.sweptDebrisCircleContact({x:0,y:30},{x:200,y:30},{x:100,y:0},5),null);
}
{
  const {window}=context(),controller=window.createDebrisImpacts(),image={width:10,height:10},ship={centerX:0,centerY:0,w:20,h:20,a:0,hull:77,shields:23},state={time:200,particles:[],hull:77,shields:23};
  const piece=()=>({x:50,y:0,vx:100,vy:0,w:4,h:4,born:0});
  const shield=controller.step(piece(),-50,0,ship,image,state);assert.equal(shield.kind,'shield');assert.equal(state.particles.length,0);assert(shield.x< -10,'shield catches debris outside the hull');
  controller.setShields(false);const hull=controller.step(piece(),-50,0,ship,image,state);assert.equal(hull.kind,'sparks');assert.equal(state.particles.length,12);
  assert.equal(ship.hull,77);assert.equal(ship.shields,23);assert.equal(state.hull,77);assert.equal(state.shields,23);
}
{
  const c=context(),w=c.window,state={system:1,shipType:1,angle:0,destroyedAsteroids:[],minedAsteroids:[]},ship={id:1,hull:87,shields:42},rock={slotId:3,x:45,y:0,size:20};
  let playerHits=0,shipHits=0,destroyed=0,sceneQueries=0;
  w.nativeCivilianTraffic={initialize(){},combatScene(){sceneQueries++;return {bystanders:[{id:1,x:70,y:0,radius:10},{id:'player',x:80,y:0,radius:10}]};},visualImpact(_,id,event){assert.equal(id,1);assert.equal(event.visualOnly,true);shipHits++;}};
  w.nativeCombatShots={onPlayerImpact(event){assert.equal(event.visualOnly,true);playerHits++;}};
  w.nativeSolAsteroids={placements:[rock]};
  w.nativeAsteroidCombat={destroy(_,slot){destroyed++;state.destroyedAsteroids.push(slot);w.nativeEnvironmentalImpacts.explode(state,rock,{radius:120,sourceKey:'asteroid:3'});}};
  load(c,'html-games/broken-mirror-port/explosion-impacts.js');
  w.nativeEnvironmentalImpacts.advance(state,.1);assert.equal(sceneQueries,0,'idle flight skips collision scene queries');w.nativeEnvironmentalImpacts.reset();
  w.nativeEnvironmentalImpacts.explode(state,{x:0,y:0,system:1},{radius:100,duration:1000});
  w.nativePause={active:true};w.nativeEnvironmentalImpacts.advance(state,.8);w.nativeEnvironmentalImpacts.debris(state,{x:100,y:0,radius:3},0,0);assert.equal(w.nativeEnvironmentalImpacts.snapshot().clock,0);assert.equal(destroyed,0);assert.equal(shipHits,0);assert.equal(playerHits,0);
  w.nativePause.active=false;w.nativeEnvironmentalImpacts.advance(state,.8);
  assert.equal(destroyed,0,'live ship explosions cannot destroy asteroids');assert.equal(shipHits,1);assert.equal(playerHits,1);assert.equal(w.nativeEnvironmentalImpacts.snapshot().waves,1,'blast remains visual without asteroid pressure destruction');
  assert.equal(ship.hull,87);assert.equal(ship.shields,42);
  state.system=2;w.nativeEnvironmentalImpacts.advance(state,.1);assert.equal(w.nativeEnvironmentalImpacts.snapshot().waves,0,'old system effects are cleared');
  const stoppedClock=w.nativeEnvironmentalImpacts.snapshot().clock,queriesBeforeWarp=sceneQueries;w.vexedWarp={active:true};w.nativeEnvironmentalImpacts.advance(state,1);w.nativeEnvironmentalImpacts.debris(state,{x:100,y:0,radius:3},0,0);assert.equal(w.nativeEnvironmentalImpacts.snapshot().clock,stoppedClock);assert.equal(sceneQueries,queriesBeforeWarp);
}
{
  const c=context(),w=c.window,state={system:1},visited=[];
  const ship=(id,x)=>({id,x,y:0,previousX:x,previousY:0,radius:10,radii:{rx:10,ry:10},entity:{hull:100,phase:'cruising'},system:1});
  const targets=[ship(0,20),ship(1,-20),...Array.from({length:100},(_,i)=>ship(i+2,1000+i*500))];
  const rocks=[{slotId:1,x:5000,y:0,size:20,vx:100000,previousX:-5000}];
  w.nativeCivilianTraffic={initialize(){}};w.nativeShipSystems={scene:()=>({bystanders:targets})};
  w.nativeSolAsteroids={placements:rocks,sweptNearby:()=>[]};
  w.nativeAsteroidMotion={debrisContact:(_,p,f,t,type)=>{visited.push(type+':'+t.id);return null;}};
  load(c,'html-games/broken-mirror-port/explosion-impacts.js');
  w.nativeEnvironmentalImpacts.debris(state,{x:30,y:0,size:2,vx:600,vy:0},-30,0,{dt:.1});
  assert.deepEqual(visited,['ship:civilian:0','ship:civilian:1','asteroid:1'],'Grid preserves target order, includes moving rocks, and skips distant static ships');
  visited.length=0;
  const piece={x:10000,y:0,size:2};
  w.nativeEnvironmentalImpacts.debris(state,piece,9999,0,{sourceKey:'ship:civilian:2',dt:.1});
  piece.x=1000;w.nativeEnvironmentalImpacts.debris(state,piece,10000,0,{sourceKey:'ship:civilian:2',dt:.1});
  assert.ok(visited.includes('ship:civilian:2'),'Parent immunity ends even when its fragment first moves outside indexed cells');
}
console.log('Environmental impacts: blast reach, swept collisions, shield/hull visuals, no ship damage, pause, bounded asteroid destruction and spatial candidate order passed.');
