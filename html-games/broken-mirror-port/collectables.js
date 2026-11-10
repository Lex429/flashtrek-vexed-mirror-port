/* Bonus-item ownership. Only an explicit, verified transport can add an item. */
(() => {
  'use strict';
  const art='assets/collectables/';
  const catalog=Object.freeze([
    {id:'earth-roadster',mass:0.5,aspect:0.500000,name:'Tesla Roadster',file:'tesla-roadster.png',year:'2018',kind:'Demonstration payload',spaceSize:2,minPixels:28,
      description:'A red Roadster and its spacesuited passenger, Starman. Carried into space on the first Falcon Heavy test flight.',
      history:'Launched on 6 February 2018, this unlikely passenger rode the first Falcon Heavy demonstration flight. The Roadster remained attached to the rocket’s second stage on a journey around the Sun.',
      source:'https://www.nasa.gov/history/5-years-ago-first-flight-of-the-falcon-heavy-rocket/'},
    {id:'earth-vanguard-1',mass:0.5,aspect:1.000000,name:'Vanguard 1',file:'vanguard-1.png',year:'1958',kind:'Earth satellite',spaceSize:.5,minPixels:24,
      description:'A small satellite with a huge place in history: Vanguard 1 was the world’s first satellite powered by solar cells.',
      history:'Launched on 17 March 1958, Vanguard 1 demonstrated solar power in space. Its compact spherical body and long antennas recall the earliest days of Earth’s space age.',
      source:'https://www.nasa.gov/image-article/vanguard-satellite-1958/'},
    {id:'earth-voyager',mass:0.8,aspect:1.094245,name:'Voyager',file:'voyager.png',year:'1977',kind:'Deep-space probe',spaceSize:8.5,minPixels:42,
      description:'An explorer from the Voyager program. The twin probes carried Golden Records filled with sounds and images from Earth.',
      history:'The two Voyager spacecraft launched in 1977 to explore the outer planets. Each carried a Golden Record: a collection of sounds and images intended as a greeting from Earth.',
      source:'https://science.nasa.gov/mission/voyager/golden-record-contents/'},
    {id:'earth-lageos-1',mass:0.5,aspect:1.094245,name:'LAGEOS-1',file:'lageos-1.png',year:'1976',kind:'Laser-ranging satellite',spaceSize:.3,minPixels:20,
      description:'A dense sphere covered in 426 retroreflectors. Ground stations bounced laser pulses off it to measure Earth with extraordinary precision.',
      history:'Launched on 4 May 1976, the Laser Geodynamics Satellite used a stable orbit and mirrored prisms to support precise measurements of Earth, including the motion of its tectonic plates.',
      source:'https://ilrs.cddis.eosdis.nasa.gov/missions/satellite_missions/current_missions/lag1_general.html'},
    {id:'earth-pioneer-10',mass:0.7,aspect:0.750000,name:'Pioneer 10',file:'pioneer-10.png',year:'1972',kind:'Jupiter explorer',spaceSize:3.4,minPixels:34,
      description:'The first spacecraft to cross the main asteroid belt and fly past Jupiter. A pathfinder for the outer solar system.',
      history:'Launched on 2 March 1972, Pioneer 10 crossed the main asteroid belt and made the first spacecraft flyby of Jupiter in December 1973, opening a route for later explorers.',
      source:'https://science.nasa.gov/mission/pioneer-10/'},
    {id:'earth-pioneer-11',mass:0.7,aspect:0.750000,name:'Pioneer 11',file:'pioneer-11.png',year:'1973',kind:'Saturn explorer',spaceSize:3.4,minPixels:34,
      description:'Pioneer 10’s sister ship, and the first spacecraft to fly past Saturn. Its dish once sent discoveries across interplanetary space.',
      history:'Launched on 6 April 1973, Pioneer 11 visited Jupiter before becoming the first spacecraft to fly past Saturn on 1 September 1979.',
      source:'https://science.nasa.gov/mission/pioneer-11/'},
    {id:'earth-snoopy',mass:1.2,aspect:1.000000,name:'Apollo 10 “Snoopy”',file:'apollo-10-snoopy.png',year:'1969',kind:'Lunar module',spaceSize:4.7,minPixels:36,
      description:'Apollo 10’s lunar module, callsign Snoopy. It rehearsed the lunar approach ahead of humanity’s first landing on the Moon.',
      history:'In May 1969, Thomas Stafford and Eugene Cernan flew Snoopy above the lunar surface while John Young remained in Charlie Brown. Apollo 10 was the dress rehearsal for the first Moon landing.',
      source:'https://www.nasa.gov/missions/apollo/apollo-10-mission-details/'},
    {id:'earth-phoenix',mass:3,aspect:0.416152,name:'Phoenix',file:'phoenix.png',year:'2063',kind:'Warp prototype',spaceSize:10,minPixels:42,sourceLabel:'Star Trek archive',
      description:'Zefram Cochrane’s warp ship. Its historic flight drew the attention of a passing Vulcan vessel and led to First Contact.',
      history:'Built by Zefram Cochrane with Lily Sloane, the Phoenix made Earth’s first successful crewed warp flight on 5 April 2063. The flight attracted a Vulcan survey ship and led to humanity’s First Contact with the Vulcans.',
      source:'https://www.startrek.com/news/celebrating-the-ships-of-the-line-the-phoenix'},
    {id:'earth-les-1',mass:0.5,aspect:0.666667,name:'LES-1',file:'les-1.png',year:'1965',kind:'Communications satellite',spaceSize:1,minPixels:26,sourceLabel:'MIT Lincoln Laboratory',
      description:'Lincoln Experimental Satellite 1, an early communications experiment. Its signal was detected again decades after its original mission ended.',
      history:'MIT Lincoln Laboratory’s LES-1 launched in February 1965 to demonstrate satellite communications technology. Its transmitter shut down after two years of experiments; amateur radio operators detected a signal from it again in 2012.',
      source:'https://www.ll.mit.edu/about/history/les/les-1'},
    {id:'earth-botany-bay',mass:8,aspect:0.416152,name:'S.S. Botany Bay',file:'botany-bay.png',year:'1996',dateLabel:'ORIGINAL TOS HISTORY · 1996',kind:'DY-100 sleeper ship',spaceSize:18,minPixels:48,sourceLabel:'Star Trek archive',
      description:'The DY-100 sleeper ship that carried Khan Noonien Singh and his followers in suspended animation, later discovered by Kirk’s Enterprise.',
      history:'In the original history told in “Space Seed,” Khan and his followers left Earth aboard the Botany Bay in 1996. The DY-100 carried them in suspended animation until Captain Kirk’s Enterprise discovered the drifting ship centuries later.',
      source:'https://www.startrek.com/gallery/most-powerful-star-trek-ships-ranked'},
    {id:'earth-ares-iv',mass:3,aspect:0.416152,name:'Ares IV',file:'ares-iv.png',year:'2032',dateLabel:'MARS MISSION 2032',kind:'Mars command module',spaceSize:12,minPixels:40,sourceLabel:'Star Trek archive',
      description:'Lieutenant John Kelly’s Mars command module, lost inside a graviton ellipse during the 2032 Ares IV mission.',
      history:'During the Ares IV mission to Mars in 2032, a graviton ellipse engulfed the command module with Lieutenant John Kelly aboard. In “One Small Step,” Voyager’s crew found the lost craft and recovered Kelly’s final logs and remains.',
      source:'https://www.startrek.com/news/moon-to-delta-quadrant-nasa-imprint-on-star-trek-voyager'},
    {id:'earth-nx-alpha',mass:4,aspect:0.833333,name:'NX-Alpha',file:'nx-alpha.png',year:'2143',dateLabel:'TEST FLIGHT 2143',kind:'NX Project test vehicle',spaceSize:10,minPixels:42,sourceLabel:'Memory Alpha · First Flight',
      description:'A.G. Robinson’s NX Project test craft. It broke the warp 2 barrier before a catastrophic failure forced him to eject.',
      history:'In 2143, A.G. Robinson piloted NX-Alpha past warp 2, reaching warp 2.2 before the craft broke apart. He survived using its escape pod. Archer and Robinson’s later warp 2.5 flight used NX-Beta, a different test vehicle.',
      source:'https://memory-alpha.fandom.com/wiki/NX-Alpha'},
    {id:'earth-friendship-1',mass:0.8,aspect:0.334101,name:'Friendship 1',file:'friendship-1.png',year:'2067',kind:'Interstellar greeting probe',spaceSize:4,minPixels:32,sourceLabel:'Star Trek archive',
      description:'An early Earth warp probe carrying greetings and technical knowledge. Voyager later discovered the consequences of its arrival in the Delta Quadrant.',
      history:'Launched in 2067, four years after First Contact, Friendship 1 carried Earth’s greetings and technological knowledge into deep space. In “Friendship One,” Voyager found that its antimatter information had contributed to a catastrophe on the world that received it.',
      source:'https://www.startrek.com/gallery/most-powerful-star-trek-ships-ranked'},
    {id:'earth-conestoga',mass:12,aspect:0.666667,name:'S.S. Conestoga',file:'conestoga.png',year:'2069',kind:'Colony ship',spaceSize:22,minPixels:52,sourceLabel:'Memory Alpha · Terra Nova',
      description:'An early Earth colony ship sent to Terra Nova. Its modules became the settlement’s first buildings when the colonists arrived.',
      history:'Launched in 2069 under Captain Mitchell, the Conestoga carried colonists to Terra Nova on a nine-year journey. After arriving in 2078, its modules were dismantled to build the colony’s initial structures, as recounted in “Terra Nova.”',
      source:'https://memory-alpha.fandom.com/wiki/SS_Conestoga'},
    {id:'earth-kataan-probe',mass:1.5,aspect:0.666667,name:'Kataan probe',file:'kataan-probe.png',year:'Unknown',dateLabel:'LAUNCH DATE UNKNOWN',kind:'Civilization memory archive',spaceSize:3,minPixels:30,sourceLabel:'Star Trek archive',
      description:'A memory archive from the lost world Kataan. It preserved a way of life by allowing Picard to experience decades as a man named Kamin.',
      history:'In “The Inner Light,” this probe let Captain Picard live decades as Kamin while only minutes passed aboard the Enterprise. It preserved the memory of Kataan, destroyed about a thousand years earlier, and carried the Ressikan flute recovered by the crew.',
      source:'https://www.startrek.com/news/essential-libraries-and-archives-guide'},
    {id:'earth-nomad',mass:0.8,aspect:0.666667,name:'Nomad',file:'nomad.png',year:'2002',dateLabel:'ORIGINAL EARTH PROBE · 2002',kind:'Nomad / Tan Ru hybrid probe',spaceSize:1.5,minPixels:28,sourceLabel:'Star Trek archive',
      description:'An Earth probe transformed after merging with the alien Tan Ru. Its damaged logic turned a search for life into a mission to sterilize imperfections.',
      history:'Jackson Roykirk designed the original Nomad probe, launched in 2002, to seek new life. After damage in space it merged with Tan Ru, an alien sterilization probe. The rebuilt machine encountered Kirk’s Enterprise in “The Changeling,” confusing exploration with the destruction of imperfect life.',
      source:'https://www.startrek.com/news/star-trek-megalomaniacal-ai-guide'}
  // Presentation uses the game's ship scale with readable screen-space floors
  // so artifacts stay findable rather than shrinking into star-sized specks.
  ].map((item,index)=>Object.freeze({...item,icon:art+item.file,index,site:window.nativeCollectableSites.get(item.id),spaceSize:Math.max(item.spaceSize,item.minPixels/2.25),
    physics:Object.freeze({vx:Math.cos(index*2.399963229728653)*(.09+(index%4)*.015),vy:Math.sin(index*2.399963229728653)*(.09+(index%4)*.015),
      spin:(index%2?-1:1)*.0024*(1+(index%3)*.16)/(1+item.spaceSize/10),heading:Math.sin(index*2.399963229728653)*.16-Math.PI/2})})));
  const byId=new Map(catalog.map(item=>[item.id,item])),range=700;
  const owned=state=>new Set((Array.isArray(state?.collectables)?state.collectables:[]).map(item=>item?.id));
  const initialClues=6;
  function clueProgress(state){
    const ids=owned(state),found=catalog.filter(item=>ids.has(item.id)).length;
    return {found,total:catalog.length,unlocked:Math.min(catalog.length,initialClues+found)};
  }
  function clues(state,id){
    const item=byId.get(id);if(!item)return null;
    const progress=clueProgress(state),requires=Math.max(0,item.index+1-initialClues),available=progress.found>=requires;
    const result={...progress,available,requires,remaining:Math.max(0,requires-progress.found)};
    if(available){
      const body=window.nativeSystemCatalog.bodies(item.site.system).find(entry=>entry.id===item.site.body);
      result.text=item.site.clue;
      result.reference={name:body.name,art:body.art,system:window.nativeSystemCatalog.name(item.site.system),label:'REPORTED LANDMARK'};
    }
    return result;
  }
  function spawn(id){const item=byId.get(id);return item?{...window.nativeCollectableSites.position(id),heading:item.physics.heading}:null;}
  function available(state){
    if(!state)return [];
    const origin=window.nativeManualFlight.anchor(state.system);if(!origin)return [];
    const ids=owned(state);
    return catalog.filter(item=>!ids.has(item.id)).map(item=>{
      const seed=spawn(item.id);
      const pose=window.nativeCollectableMotion?.sample(state,item,seed)||{...seed,roll:seed.heading+Math.PI/2};
      return {...item,...pose,gx:pose.x,gy:pose.y,x:pose.x-origin.x,y:pose.y-origin.y,system:Number(state.system)};
    });
  }
  function collect(state,id,{save}={}){
    const item=available(state).find(entry=>entry.id===id);
    if(!item)return {ok:false,error:owned(state).has(id)?'This item is already aboard.':'No bonus item is available here.'};
    if(state.landed||Number(state.hull)<=0)return {ok:false,error:'Launch a working ship to transport this item.'};
    const ship=window.nativeManualFlight.position(state);
    if(!ship||Math.hypot(item.gx-ship.x,item.gy-ship.y)>range)return {ok:false,error:`Move within ${range} units to transport this item.`};
    const previous=state.collectables,had=Object.hasOwn(state,'collectables');
    const entry={id:item.id,name:item.name,icon:item.icon,description:item.description,year:item.year,kind:item.kind,collectedAt:{system:state.system,galaxy:{x:item.gx,y:item.gy},day:Number(state.day)||1}};
    state.collectables=[...(Array.isArray(previous)?previous:[]),entry];
    let result;
    try{result=(save||window.nativeSaveStorage?.write)?.(state);}catch(error){result={ok:false,error:error.message};}
    if(result?.ok!==true){
      if(had)state.collectables=previous;else delete state.collectables;
      return {ok:false,error:result?.error||'Unable to save the transport. The item remains in space.'};
    }
    return {ok:true,item:entry};
  }
  window.nativeCollectables=Object.freeze({catalog,range,initialClues,clueProgress,clues,spawn,get:id=>byId.get(id)||null,available,collect});
})();
