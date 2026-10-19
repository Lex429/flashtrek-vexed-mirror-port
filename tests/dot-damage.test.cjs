const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const window={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror/dot-sprites.js'),'utf8'),{window,Image:class Image{}});
test('Dot health uses exact ship damage boundaries for every model and health pool',()=>{
  const {stage}=window.dotSprites;
  for(const hp of [40,90,180])for(const [fraction,expected] of [[1,0],[.75,0],[.7499,1],[.5,1],[.4999,2],[.25,2],[.2499,3],[.0001,3],[0,4]])assert.equal(stage(hp*fraction,hp),expected);
  assert.equal(stage(100),0,'restoring health restores the intact state');
});
test('each model has independent aligned damage sites and retains the supplied tool mount',()=>{
  const {definitions,nozzle}=window.dotSprites;
  assert.equal(new Set(Object.values(definitions).map(d=>JSON.stringify(d.damage))).size,3);
  for(const [tier,d] of Object.entries(definitions)){
    assert.equal(d.damage.length,6);for(const [x,y,r] of d.damage)assert.ok(x>0&&x<512&&y>0&&y<512&&r>0);
    assert.ok(nozzle(tier).x>0);assert.ok(Object.isFrozen(d.damage));
  }
});
test('all nine models share the renderer with separate source artwork and aligned combat emitters',()=>{
  const {definitions,muzzle}=window.droneSprites,files=[];
  for(const role of ['repair','attack','defense'])for(const tier of ['basic','upgraded','advanced']){
    const d=definitions[role][tier];files.push(d.src);assert.equal(d.damage.length,6);
    if(role==='repair')continue;
    assert.ok(d.muzzles.length>=2);assert.ok(Object.isFrozen(d.muzzles));
    for(let i=0;i<d.muzzles.length;i++){
      const p=muzzle(tier,role,i);assert.ok(p.x>0);assert.ok(Math.abs(p.y)>3,'gun lies on its model arm');
      assert.deepEqual(muzzle(tier,role,i+d.muzzles.length),p,'barrels alternate in a bounded cycle');
    }
  }
  assert.equal(new Set(files).size,9);
});
