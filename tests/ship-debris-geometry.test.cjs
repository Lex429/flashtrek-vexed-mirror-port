const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const root=path.join(__dirname,'..'),port=path.join(root,'html-games/broken-mirror-port');
const window={};
const context=vm.createContext({window});
for(const file of ['world-data.js','ship-debris-geometry.js'])vm.runInContext(fs.readFileSync(path.join(port,file),'utf8'),context,{filename:file});
const geometry=window.VexedMirrorDebrisGeometry;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('all built-in artwork hulls have immutable, conserved physical debris before loading images',()=>{
  assert.equal(geometry.version,1);
  const ids=window.VexedMirrorWorld.ships.map(ship=>String(ship.id)).sort((a,b)=>Number(a)-Number(b));
  assert.deepEqual(Object.keys(geometry.ships).sort((a,b)=>Number(a)-Number(b)),Array.from(ids),'New hull artwork requires rebuilding its physical metadata');
  assert.ok(ids.length>=66,'The full installed hull catalog must be covered');
  const nativeFields=new Set(['texture','lit','edge','hot','side','material']);
  function verify(value){
    if(typeof value==='number')assert.ok(Number.isFinite(value));
    else if(value&&typeof value==='object'){
      assert.ok(Object.isFrozen(value));
      for(const [key,item]of Object.entries(value)){assert.ok(!nativeFields.has(key),'Physical source asset cannot own a native surface');verify(item);}
    }else assert.ok(['string','boolean'].includes(typeof value)||value===null);
  }
  verify(geometry);
  let pieces=0,pixels=0;
  for(const [id,ship]of Object.entries(geometry.ships)){
    assert.ok(ship.width>0&&ship.height>0,id);assert.equal(ship.frameFiles.length,4);assert.match(ship.profileSignature,/^[a-f0-9]{64}$/);
    assert.equal(ship.fragments.length,4);assert.equal(ship.wrecks.length,ship.hasDestruction?4:0);assert.equal(ship.fragments[0].length,0);
    for(const stage of ship.fragments)for(const piece of stage){
      assert.deepEqual(Object.keys(piece).sort(),['h','pixels','w','x','y']);
      assert.ok(piece.w>0&&piece.w<=1&&piece.h>0&&piece.h<=1&&piece.pixels>=12,id);pieces++;
    }
    for(const stage of ship.wrecks){
      assert.ok(stage.sourcePixels>0,id);assert.equal(stage.sourcePixels,stage.cutPixels,id);
      assert.equal(stage.pieces.reduce((sum,piece)=>sum+piece.pixels,0),stage.sourcePixels,id);
      for(const piece of stage.pieces){assert.ok(piece.w>0&&piece.h>0&&piece.pixels>0,id);assert.equal(typeof piece.core,'boolean');pieces++;}
      pixels+=stage.sourcePixels;
    }
  }
  assert.ok(pieces>1000&&pixels>1000000,'Coverage must include the actual complete shapes');
  assert.ok(fs.statSync(path.join(port,'ship-debris-geometry.js')).size<2*1024*1024,'Static geometry must remain bounded');
});

test('geometry signatures reject original artwork or preparation-profile drift',()=>{
  const files=Object.keys(geometry.sourceFiles).sort();
  assert.ok(files.length>=280,'Every original damage frame and profile source is signed');
  assert.ok(!files.some(file=>/\/(ship-effects|ship-definitions)\.js$/.test(file)),'Consumers must not create a circular build signature');
  for(const file of files){
    assert.ok(!file.includes('..')&&!path.isAbsolute(file));
    const bytes=fs.readFileSync(path.join(root,file)),source=/\.(js|json|html)$/.test(file)?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes;
    assert.equal(sha(source),geometry.sourceFiles[file],file+' changed: run python tools/build-debris-geometry.py');
  }
  assert.equal(sha(files.map(file=>file+':'+geometry.sourceFiles[file]+'\n').join('')),geometry.sourceSignature);
});
