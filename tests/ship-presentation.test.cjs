const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const window={},context=vm.createContext({window,console});
  const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  for(const name of ['cthia-effects','olympic-effects','tug-effects','constitution-tug-effects','starter-effects','earth-profiles','klingon-profiles','romulan-profiles','vulcan-profiles','cardassian-profiles','ferengi-dominion-profiles','independent-profiles','earth-effects','bioship-effects','lifeform-effects'])load('html-games/flashtrek-broken-mirror/'+name+'.js');
  for(const name of ['world-data','flight-reference-data','ship-motion','ship-definitions'])load('html-games/broken-mirror-port/'+name+'.js');
  return window;
}
test('the real 66-class fleet has one aspect-correct world size across player, civilian and tug roles',()=>{
  const w=fixture(),api=w.nativeShipDefinitions;
  for(const {id} of w.VexedMirrorWorld.ships){
    const dimensions=api.dimensions({shipType:id},'player'),profile=api.artworkProfile(id);
    assert.ok(profile,`Ship ${id} has a registered art/effect profile`);
    assert.ok(dimensions.width>0&&dimensions.height>0);
    assert.ok(Math.abs(dimensions.width/dimensions.height-(profile.displayRatio||profile.width/profile.height))<1e-9,`Ship ${id} preserves its frame proportions`);
    for(const category of ['civilian','tug'])assert.deepEqual(plain(api.dimensions({shipType:id},category)),plain(dimensions),`${id}/${category}`);
  }
});
test('the existing civilian references retain their sizes and the Runabout stays below the medical ship and Galaxy',()=>{
  const w=fixture(),d=id=>w.nativeShipDefinitions.dimensions({shipType:id});
  for(const [id,height]of [[18,11.7],[23,22.5],[47,72],[52,90]])assert.equal(d(id).height,height);
  assert.equal(d(58).height,75);assert.ok(Math.abs(d(58).width-75*201/512)<1e-9);
  assert.ok(d(7).height<d(58).height);assert.ok(d(58).height<d(35).height);
  assert.equal(d(7).height,11.7);
});
test('small-craft hulls fit their displayed frame and every role shares shield, hull and emitter attachment geometry',()=>{
  const w=fixture(),api=w.nativeShipDefinitions;
  for(const {id}of w.VexedMirrorWorld.ships){
    const entity={shipType:id,x:50,y:70,hull:100,shields:80,angle:.4,heading:.4},state={system:2};
    const player=api.describe(state,entity,{category:'player'}),npc=api.describe(state,entity,{category:'civilian'});
    assert.deepEqual(plain(player.hullRadii),plain(npc.hullRadii));
    assert.deepEqual(plain(player.radii),plain(npc.radii));
    assert.ok(player.hullRadii.rx<=player.dimensions.width/2,`${id} hull width`);
    assert.ok(player.hullRadii.ry<=player.dimensions.height/2,`${id} hull length`);
    assert.deepEqual(plain(player.definition.emitters),plain(npc.definition.emitters));
  }
});
test('Olympic painted lights use aligned masks and the four damage states retain one coordinate frame',()=>{
  const w=fixture(),p=w.nativeShipDefinitions.artworkProfile(58),m=w.olympicAnimationProfile;
  assert.equal(p.width,201);assert.equal(p.height,512);
  assert.equal(typeof p.alignAsync,'function');assert.ok(p.lights.length>=13);
  assert.deepEqual(plain(p.shifts),[[0,0],[8,0],[18,0],[41,0]]);
  for(const lamp of p.lights){assert.ok(lamp.runs.length>0);assert.ok(lamp.left>=0&&lamp.top>=0);assert.ok(lamp.left+lamp.w<=201&&lamp.top+lamp.h<=512);}
  assert.deepEqual(plain(p.damage),plain(m.damage));assert.ok(p.destruction.sites.length>0);
});
