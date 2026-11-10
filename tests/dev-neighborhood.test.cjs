const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
  const window={},context=vm.createContext({window});
  for(const file of ['world-data.js','faction-standing.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',file),'utf8'),context);
  return {world:window.VexedMirrorWorld,owner:window.nativeFactionStanding};
}
test('Dev neighbors seed actual map relationships without changing world defaults or unrelated saved standings',()=>{
  const {owner,world}=fixture(),original=JSON.stringify(world);
  const state={devMode:true,localPrestige:{55:100,4:100,2:100,8:-30,7:37},planetGovts:{55:16,4:16,2:16,8:1,7:3},shipEquipment:{keep:'owned'},minerals:{trellium:9}};
  assert.equal(owner.initializeDev(state),true);assert.equal(state.devNeighborhoodVersion,1);
  for(const [id,value,status,color] of [[55,-75,'Hostile','#ff0000'],[4,125,'Allied','#4ab3ff'],[2,0,'Neutral','#cacaca'],[8,100,'Your territory','#0fff0f']]){
    const relationship=owner.relationship(state,id);
    assert.equal(relationship.prestige,value);assert.equal(relationship.status,status);assert.equal(relationship.color,color);
  }
  assert.equal(state.localPrestige[7],37);assert.equal(state.planetGovts[7],3);
  assert.deepEqual(state.shipEquipment,{keep:'owned'});assert.deepEqual(state.minerals,{trellium:9});assert.equal(JSON.stringify(world),original);
});
test('saved Dev version preserves later reputation and ownership changes on every subsequent setup',()=>{
  const {owner}=fixture(),state={devMode:true};owner.initializeDev(state);
  state.localPrestige[55]=-33;state.localPrestige[4]=80;state.localPrestige[2]=12;state.planetGovts[8]=2;
  const loaded=JSON.parse(JSON.stringify(state)),before=JSON.stringify(loaded);
  for(let i=0;i<3;i++)assert.equal(owner.initializeDev(loaded),false);
  assert.equal(JSON.stringify(loaded),before);
});
test('normal games and future Dev setup versions are never migrated by this preset',()=>{
  const {owner}=fixture();
  for(const state of [{localPrestige:{55:44},planetGovts:{8:4}},{devMode:false,devNeighborhoodVersion:0},{devMode:true,devNeighborhoodVersion:2,localPrestige:{2:-12}},{devMode:true,devNeighborhoodVersion:1,devDiplomacyVersion:2,localPrestige:{20:100}}]){
    const before=JSON.stringify(state);assert.equal(owner.initializeDev(state),false);assert.equal(JSON.stringify(state),before);
  }
});

test('fresh Dev galaxies contain stable allied, neutral and hostile factions beyond the nearby presets',()=>{
  const {owner,world}=fixture(),state={devMode:true,localPrestige:Object.fromEntries(world.systems.map(system=>[system.id,100]))};
  owner.initializeDev(state);assert.equal(state.devDiplomacyVersion,1);
  for(const [id,status]of [[1,'Allied'],[4,'Allied'],[20,'Hostile'],[31,'Hostile'],[14,'Neutral'],[47,'Neutral'],[8,'Your territory']])assert.equal(owner.relationship(state,id).status,status);
  const counts={};for(const system of world.systems){const status=owner.relationship(state,system.id).status;counts[status]=(counts[status]||0)+1;}
  assert.ok(counts.Allied>=10&&counts.Neutral>=10&&counts.Hostile>=10,JSON.stringify(counts));
  const before=JSON.stringify(state);assert.equal(owner.initializeDev(state),false);assert.equal(JSON.stringify(state),before);
});

test('existing Dev saves replace untouched all-allied defaults once while retaining progress and ownership',()=>{
  const {owner,world}=fixture(),state={devMode:true,devNeighborhoodVersion:1,
    localPrestige:Object.fromEntries(world.systems.map(system=>[system.id,100])),planetGovts:{31:16,7:3},
    localContracts:[{id:9,tons:7,toSystem:47,to:0,pay:1234,authorization:{reference:'TRD-00001'}}],
    cargoPermits:{version:1,nextId:2,documents:[{id:'cargo-permit:1',status:'assigned',jobId:9}]},shipEquipment:{keep:'owned'},minerals:{trellium:9}};
  Object.assign(state.localPrestige,{55:-33,4:80,2:12,8:100,47:44});state.planetGovts[8]=16;
  const held=JSON.stringify({jobs:state.localContracts,documents:state.cargoPermits,equipment:state.shipEquipment,minerals:state.minerals,governments:state.planetGovts});
  assert.equal(owner.initializeDev(state),true);assert.equal(state.localPrestige[20],-60);
  assert.equal(state.localPrestige[47],44);assert.equal(state.localPrestige[55],-33);assert.equal(state.localPrestige[4],80);assert.equal(state.localPrestige[2],12);
  assert.equal(state.localPrestige[7],100);assert.equal(state.planetGovts[31],16);
  assert.equal(JSON.stringify({jobs:state.localContracts,documents:state.cargoPermits,equipment:state.shipEquipment,minerals:state.minerals,governments:state.planetGovts}),held);
  state.localPrestige[20]=35;const saved=JSON.parse(JSON.stringify(state));assert.equal(owner.initializeDev(saved),false);assert.equal(saved.localPrestige[20],35);
});
