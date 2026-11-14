const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../html-games');
const scripts=['flashtrek-broken-mirror/cthia-effects.js','flashtrek-broken-mirror/olympic-effects.js',
 'flashtrek-broken-mirror/tug-effects.js','flashtrek-broken-mirror/constitution-tug-effects.js','flashtrek-broken-mirror/starter-effects.js',
 'flashtrek-broken-mirror/earth-profiles.js','flashtrek-broken-mirror/federation-profiles.js','flashtrek-broken-mirror/new-ship-profiles.js',
 'flashtrek-broken-mirror/earth-effects.js','flashtrek-broken-mirror/constitution-showcase-lights.js','flashtrek-broken-mirror/constitution-damage.js',
 'broken-mirror-port/world-data.js','broken-mirror-port/flight-reference-data.js','broken-mirror-port/ship-scale-settings.js','broken-mirror-port/ship-definitions.js',
 'broken-mirror-port/constitution-ships.js','broken-mirror-port/federation-ships.js','broken-mirror-port/ship-scale-data.js'];
function model(){
 const context={console,document:{createElement(){throw Error('Roster inspection must not prepare pixels or run gameplay');}}};
 context.window=context;vm.createContext(context);
 for(const file of scripts)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 return context;
}
const plain=value=>JSON.parse(JSON.stringify(value));
const danubeScale=w=>w.nativeShipScale.createScale(w.nativeShipScale.roster().find(row=>row.id===7),
 {x:0,y:17,width:315,height:477},{width:315,height:512});

test('the atlas reads every live Federation hull and actual current flight dimensions',()=>{
 const w=model(),rows=w.nativeShipScale.roster();
 assert.equal(rows.length,w.nativeFederationShips.ids.length);assert.equal(rows.length,45);
 assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
 for(const row of rows){
  assert.deepEqual(plain(row.dimensions),plain(w.nativeShipDefinitions.get(row.id).dimensions));
  assert.ok(row.dimensions.width>0&&row.dimensions.height>0);
 }
 assert.equal(rows.find(row=>row.id===439).dimensions.height,w.nativeShipScaleSettings.gameplayShips[439].dimensions.height);
 assert.equal(rows.find(row=>row.id===426).dimensions.height,w.nativeShipScaleSettings.gameplayShips[426].dimensions.height);
 assert.equal(w.VexedMirrorWorld.ships.length,82);
});

test('one Danube-based conversion corrects the Enterprise, Voyager and Galaxy ratios',()=>{
 const w=model(),api=w.nativeShipScale,rows=api.roster(),get=id=>rows.find(row=>row.id===id);
 const scale=danubeScale(w);
 const bounds={x:0,y:0,width:80,height:100},art={width:80,height:100};
 const kirk=api.geometry(get(426),bounds,art,scale),voyager=api.geometry(get(439),bounds,art,scale),galaxy=api.geometry(get(440),bounds,art,scale);
 assert.ok(Math.abs(voyager.corrected.height/scale.anchor.units-343/23.1)<1e-12);
 assert.ok(Math.abs(voyager.corrected.height/kirk.corrected.height-343/288.6)<1e-12);
 assert.ok(Math.abs(galaxy.corrected.height/voyager.corrected.height-642.51/343)<1e-12);
 assert.ok(kirk.corrected.height<voyager.corrected.height);
 assert.equal(api.geometry(get(36),bounds,art,scale).corrected.height,voyager.corrected.height);
});

test('Danube keeps its current visible width, length and full flight frame exactly',()=>{
 const w=model(),api=w.nativeShipScale,row=api.roster().find(row=>row.id===7),scale=danubeScale(w);
 const bounds={x:0,y:17,width:315,height:477},art={width:315,height:512};
 const g=api.geometry(row,bounds,art,scale);
 assert.equal(scale.anchor.id,7);assert.equal(scale.anchor.meters,23.1);
 assert.equal(scale.anchor.units,row.dimensions.height*477/512);
 assert.equal(scale.anchor.frameUnits,11.7);
 assert.deepEqual(plain(g.corrected),plain(g.current));assert.equal(g.changePercent,0);
 assert.equal(g.proposedFrameHeight,row.dimensions.height);
 assert.equal(scale.unitsPerMeter,g.current.height/23.1);
 assert.throws(()=>api.geometry(row,bounds,art),/Measure the in-game Danube/);
 assert.throws(()=>api.createScale(api.roster().find(row=>row.id===439),bounds,art),/anchored to the in-game Danube/);
});

test('transparent padding is excluded from the hull and accounted for in proposed flight frames',()=>{
 const w=model(),api=w.nativeShipScale,rgba=new Uint8ClampedArray(10*20*4);
 for(let y=3;y<18;y++)for(let x=2;x<8;x++)rgba[(y*10+x)*4+3]=255;
 rgba[3]=12; // A faint halo outside the painted hull must not set its bounds.
 const bounds=api.alphaBounds(rgba,10,20);
 assert.deepEqual(plain(bounds),{x:2,y:3,width:6,height:15});
 const row=api.roster().find(row=>row.id===439),before=plain(row.dimensions),g=api.geometry(row,bounds,{width:10,height:20},danubeScale(w));
 assert.ok(Math.abs(g.current.height-row.dimensions.height*.75)<1e-12);assert.ok(Math.abs(g.corrected.height-343*danubeScale(w).unitsPerMeter)<1e-12);
 assert.ok(Math.abs(g.corrected.width/g.corrected.height-6/15)<1e-12);
 assert.ok(Math.abs(g.proposedFrameHeight*.75-g.corrected.height)<1e-12);
 assert.deepEqual(plain(row.dimensions),before);
 assert.throws(()=>api.alphaBounds(new Uint8ClampedArray(16),2,2),/no visible hull/);
});

test('custom hulls stay unverified, production estimates stay provisional, and references link to evidence',()=>{
 const w=model(),api=w.nativeShipScale,rows=api.roster();
 for(const row of rows){
  if(row.reference){assert.ok(row.reference.meters>0);assert.match(row.reference.source.url,/^https:\/\//);}
  else{assert.equal(row.status,'unverified');assert.ok(row.notes);assert.equal(api.geometry(row,{width:1,height:1},{width:1,height:1},danubeScale(w)).corrected,null);}
 }
 for(const id of [10,47,56,57,60,416])assert.equal(rows.find(row=>row.id===id).reference,null);
 for(const id of [49,433,436,445])assert.equal(rows.find(row=>row.id===id).status,'provisional');
 assert.equal(api.references.ambassador.meters,520);assert.match(api.references.ambassador.notes,/526/);
 assert.equal(api.references.prometheus.meters,415);assert.match(api.references.prometheus.notes,/414/);
 assert.equal(rows.filter(row=>row.reference&&row.status!=='provisional').length,29);
});

test('new estimates and parent hull evidence never turn an uncertain conversion into a confirmed size',()=>{
 const w=model(),api=w.nativeShipScale,rows=api.roster(),get=id=>rows.find(row=>row.id===id);
 assert.equal(get(436).reference.meters,8.5);assert.equal(get(436).reference.approximate,true);
 assert.ok(get(436).supportingSources.some(source=>source.url.includes('startrek.com')));
 assert.equal(get(49).reference.meters,641);assert.match(get(49).notes,/Closest artwork match/);
 assert.equal(get(47).parentReferences[0].meters,120);
 assert.deepEqual(plain(get(56).parentReferences.map(parent=>parent.meters)),[288.6,305]);
 assert.equal(get(57).parentReferences[0].meters,310);
 for(const id of [47,56,57]){
  const row=get(id);assert.equal(row.status,'unverified');assert.equal(row.reference,null);
  assert.equal(api.geometry(row,{width:1,height:1},{width:1,height:1},danubeScale(w)).corrected,null);
 }
 assert.equal(rows.filter(row=>!row.reference&&!row.parentReferences.length).length,9);
 assert.equal(rows.filter(row=>row.parentReferences.length).length,3);
 assert.equal(rows.filter(row=>row.status==='provisional').length,4);
 assert.ok(api.references.ambassador.supportingSources.length);
});

test('the atlas uses the live artwork catalog and never changes shared definitions or gameplay statistics',()=>{
 const w=model(),catalog=JSON.parse(fs.readFileSync(path.join(root,'flashtrek-broken-mirror/showcase-assets/catalog.json'),'utf8'));
 const before=JSON.stringify(w.VexedMirrorWorld.ships),definitions=w.nativeFederationShips.ids.map(id=>plain(w.nativeShipDefinitions.get(id).dimensions));
 for(const row of w.nativeShipScale.roster()){
  const entry=catalog.ships.find(ship=>ship.id===row.id);assert.ok(entry?.frames?.[0]);
  assert.ok(fs.existsSync(path.join(root,'flashtrek-broken-mirror/showcase-assets',entry.frames[0])));
  w.nativeShipScale.geometry(row,{x:0,y:0,width:20,height:100},{width:30,height:120},danubeScale(w));
 }
 assert.equal(JSON.stringify(w.VexedMirrorWorld.ships),before);
 assert.deepEqual(w.nativeFederationShips.ids.map(id=>plain(w.nativeShipDefinitions.get(id).dimensions)),definitions);
 assert.equal(w.nativeWorldBootstrap,undefined);assert.equal(w.nativeSaveStorage,undefined);
});
