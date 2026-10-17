/* Regional geology, ore values and explicit mineral technology data. No artwork or simulation. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld,byId=new Map(world.systems.map(s=>[Number(s.id),s]));
  const ores=Object.freeze({
    trellium:{name:'Trellium',use:'Shields and protection',value:28},
    tritanium:{name:'Tritanium',use:'Hull strength and armor',value:24},
    dilithium:{name:'Dilithium',use:'Weapon upgrades',value:32},
    gallicite:{name:'Gallicite',use:'Engines and speed',value:38},
    benamite:{name:'Benamite',use:'Advanced interstellar drives',value:180}
  });
  const mixes={
    earth:{name:'Earth and nearby independent space',weights:{trellium:60,tritanium:18,dilithium:12,gallicite:9.7,benamite:.3}},
    klingon:{name:'Klingon space',weights:{dilithium:60,tritanium:25,gallicite:5,trellium:9.7,benamite:.3}},
    vulcan:{name:'Vulcan space',weights:{gallicite:60,dilithium:18,trellium:12,tritanium:9.7,benamite:.3}},
    cardassian:{name:'Cardassian space',weights:{tritanium:60,dilithium:25,trellium:5,gallicite:9.7,benamite:.3}},
    romulan:{name:'Romulan space',weights:{gallicite:30,trellium:30,dilithium:30,tritanium:9.7,benamite:.3}},
    ferengi:{name:'Ferengi space',weights:{tritanium:30,dilithium:30,gallicite:19.85,trellium:19.85,benamite:.3}},
    frontier:{name:'Remote and dangerous frontier',weights:{tritanium:27,dilithium:26,trellium:24,gallicite:20,benamite:3}}
  };
  const major={1:'earth',2:'klingon',3:'cardassian',5:'vulcan',6:'romulan',7:'ferengi'},profiles=new Map(),nearby=new Map();
  const position=id=>byId.get(Number(id))?.mapPosition||({51:{x:-250,y:-125},52:{x:-220,y:-160}}[id])||{x:0,y:0};
  const distance=(a,b)=>Math.hypot(position(a).x-position(b).x,position(a).y-position(b).y);
  function region(id){
    const s=byId.get(Number(id));if(!s)return 'frontier';
    if(major[s.governmentId])return major[s.governmentId];
    if([0,13,14,15].includes(Number(s.governmentId))||!s.charted||s.governmentId===12&&distance(id,1)>180)return 'frontier';
    if(s.governmentId===12&&distance(id,1)<=120)return 'earth';
    const nearest=world.systems.filter(other=>major[other.governmentId]).sort((a,b)=>distance(id,a.id)-distance(id,b.id)||a.id-b.id)[0];
    return major[nearest?.governmentId]||'earth';
  }
  function profile(id){
    id=Number(id);if(!profiles.has(id)){const key=region(id),mix=mixes[key];profiles.set(id,Object.freeze({system:id,key,name:mix.name,weights:Object.freeze({...mix.weights}),count:id===1?360:144+(id*17%5)*24}));}
    return profiles.get(id);
  }
  function neighbors(id,count=6){
    id=Number(id);if(!nearby.has(id))nearby.set(id,world.systems.filter(s=>s.id!==id).sort((a,b)=>distance(id,a.id)-distance(id,b.id)||a.id-b.id).map(s=>s.id));
    return nearby.get(id).slice(0,count);
  }
  function seed(value){let n=value>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
  function oreSequence(id,count,existing=[]){
    const p=profile(id),total=count+existing.length,remaining=Object.fromEntries(Object.entries(p.weights).map(([ore,weight])=>[ore,Math.max(0,Math.floor(total*weight/100)-existing.filter(r=>r.oreType===ore).length)]));
    // Old Sol slots retain their ores, including their original rare deposits.
    if(id===1)remaining.benamite=0;
    const result=[];
    for(let i=0;i<count;i++){
      const ore=Object.keys(remaining).sort((a,b)=>remaining[b]-remaining[a]||p.weights[b]-p.weights[a])[0];result.push(ore);remaining[ore]--;
    }
    const random=seed(id*9301+712367);
    for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
    return result;
  }
  function orePrice(system,type){const ore=ores[type];if(!ore)return 0;const weight=profile(system).weights[type];return Math.max(1,Math.round(ore.value*(weight>=30?.85:weight>=10?1:1.25)));}
  const recipes=Object.freeze({
    shield:{name:'Trellium shield reinforcement',benefit:'+10% shield capacity per level',materials:{trellium:12,tritanium:4},cost:500,max:3},
    hull:{name:'Tritanium hull plating',benefit:'+10% hull capacity per level',materials:{tritanium:12,dilithium:4},cost:500,max:3},
    engine:{name:'Gallicite engine tuning',benefit:'+8% flight speed per level',materials:{gallicite:12,tritanium:4},cost:650,max:3},
    weapons:{name:'Dilithium weapon tuning',benefit:'+8% weapon damage per level',materials:{dilithium:12,trellium:4},cost:650,max:3},
    drive:{name:'Benamite interstellar drive',benefit:'+15% warp speed and fuel efficiency per level',materials:{benamite:4,gallicite:8},cost:1200,max:3}
  });
  const held=(state,type)=>Math.max(0,Math.floor(Number(type==='dilithium'?state.dilithium:state.minerals?.[type])||0));
  function level(state,kind){return Math.max(0,Math.min(3,Math.floor(Number(state.mineralUpgrades?.[state.shipType]?.[kind])||0)));}
  function upgradeQuote(state,kind){const recipe=recipes[kind];if(!recipe)return null;const current=level(state,kind),factor=current+1;return {...recipe,kind,level:current,price:recipe.cost*factor,materials:Object.fromEntries(Object.entries(recipe.materials).map(([ore,n])=>[ore,n*factor]))};}
  function stats(state,definition){
    const value={...definition};value.shields=Math.round(value.shields*(1+.1*level(state,'shield')));value.hull=Math.round(value.hull*(1+.1*level(state,'hull')));
    value.speedOrOtherStationValue*=1+.08*level(state,'engine');value.weaponDamageMultiplier=1+.08*level(state,'weapons');value.warpSpeedMultiplier=1+.15*level(state,'drive');value.antimatterUseOrPopulationEffect*=value.warpSpeedMultiplier;
    return value;
  }
  window.nativeRegionalMinerals=Object.freeze({ores,profile,neighbors,position,distance,seed,oreSequence,orePrice,recipes,held,level,upgradeQuote,stats});
})();
