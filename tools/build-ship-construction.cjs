/* Export the authoritative playable hulls for the standalone construction showcase. */
const fs=require('node:fs');
const {fixture}=require('../tests/npc-economy-fixture.cjs');
(async()=>{
 const {window:w}=await fixture({full:false,economic:false,regional:true,access:true,corridors:true,factions:true,orion:true,shipyards:true});
 const catalog=JSON.parse(fs.readFileSync('html-games/flashtrek-broken-mirror/showcase-assets/catalog.json','utf8'));
 const ships=w.VexedMirrorWorld.ships.filter(h=>!h.devOnly).map(h=>{
  const d=w.nativeShipDefinitions.get(h.id),dimensions=w.nativeShipDefinitions.dimensions({shipType:h.id});
  const frames=Array.isArray(d.artwork.frames)?d.artwork.frames:catalog.ships.find(s=>s.id===h.id)?.frames;
  if(!frames?.length)throw Error('Missing construction artwork for '+h.name);
  return {id:h.id,name:h.name,massClass:h.massClass,price:h.price,frames,dimensions};
 });
 fs.writeFileSync('html-games/flashtrek-broken-mirror/ship-construction-profiles.json',JSON.stringify({version:1,ships},null,2)+'\n');
 console.log(`Exported ${ships.length} construction hulls from shared definitions.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
