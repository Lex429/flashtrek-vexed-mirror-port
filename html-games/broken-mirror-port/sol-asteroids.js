/* Stable asteroid geometry. Old Sol slots are immutable; regional belts are lazy data. */
(() => {
  'use strict';
  const catalogUrl='../flashtrek-broken-mirror/showcase-assets/asteroids.json';
  const artRoot='../flashtrek-broken-mirror/showcase-assets/';
  const deuraniumStages=Object.freeze(['deuranium/asteroid.png','deuranium/asteroid_light.png','deuranium/asteroid_heavy.png','deuranium/asteroid_severe.png']);
  const regions=[
    {name:'Earth',x:0,y:0,count:7,range:520,shield:2},
    {name:'Moon',x:1400,y:-250,count:7,range:520,shield:2},
    {name:'Mars',x:4800,y:1800,count:8,range:620,shield:2},
    {name:'Mercury',x:-4100,y:1100,count:4,range:580},
    {name:'Venus',x:-2300,y:-1500,count:4,range:580},
    {name:'Asteroid Belt',x:8000,y:-1400,count:20,range:1100,shield:4},
    {name:'Jupiter',x:11800,y:2700,count:7,range:700,shield:1},
    {name:'Saturn',x:15300,y:-2700,count:6,range:680},
    {name:'Uranus',x:19000,y:3300,count:5,range:640},
    {name:'Neptune',x:23200,y:-4400,count:5,range:640}
  ];
  const routes=[
    ['Mercury','Venus'],['Venus','Earth'],['Earth','Moon'],['Moon','Mars'],
    ['Mars','Asteroid Belt'],['Asteroid Belt','Jupiter'],['Jupiter','Saturn'],
    ['Saturn','Uranus'],['Uranus','Neptune']
  ];
  const abundance={trellium:43,dilithium:30,tritanium:16,gallicite:9,benamite:3};
  const images=new Map();
  let placements=[];
  let catalogData=null,ready,indexBuilds=0,broadphaseQueries=0,broadphaseVisits=0,summaryVisits=0;
  const systems=new Map(),indexes=new Map(),grids=new Map(),beltData=new Map(),cellSize=700;
  // This is the existing geometry index's moving subset, not another target
  // registry. Swept queries must include a rock that crossed the rectangle and
  // finished in a different grid cell.
  const moving=new Map(),maxRadii=new Map(),indexedFields=new Map(),motionBounds=new Map();
  let seed=61357;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  function shuffle(values){for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;}
  const planets=window.nativeSystemHub.sol.filter(body=>body.id!==6).map(body=>({x:body.x-220,y:body.y+75,clearance:body.id===3?760:body.id===0?550:450}));
  const clearOfPlanets=(x,y)=>planets.every(body=>Math.hypot(x-body.x,y-body.y)>=body.clearance);
  function slots(){
    const result=[];
    for(const region of regions){
      for(let i=0;i<region.count;i++){
        let x,y;
        for(let attempt=0;attempt<120;attempt++){
          const angle=random()*Math.PI*2,radius=(region.name==='Asteroid Belt'?180:650)+Math.sqrt(random())*region.range;
          x=region.x-220+Math.cos(angle)*radius;y=region.y+75+Math.sin(angle)*radius;
          if(clearOfPlanets(x,y))break;
          if(attempt===119)throw new Error(`No clear asteroid position near ${region.name}`);
        }
        result.push({x,y,region:region.name,oreType:i<(region.shield||0)?'trellium':null});
      }
    }
    const byName=new Map(regions.map(region=>[region.name,region]));
    for(const [fromName,toName] of routes){
      const from=byName.get(fromName),to=byName.get(toName);
      const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
      for(let i=0;i<3;i++){
        let x,y;
        for(let attempt=0;attempt<120;attempt++){
          const t=(i+1)/4+(random()-.5)*.18,side=(random()-.5)*1100;
          x=from.x+dx*t-dy/length*side;y=from.y+dy*t+dx/length*side;
          if(clearOfPlanets(x,y))break;
          if(attempt===119)throw new Error(`No clear asteroid position between ${fromName} and ${toName}`);
        }
        result.push({x,y,region:`${fromName}–${toName}`,oreType:null});
      }
    }
    result.push({x:30,y:-105,region:'Earth test',oreType:'trellium',guaranteedOre:true});
    return result;
  }
  function populate(catalog){
    const rocksByOre=new Map();
    for(const rock of catalog){const group=rocksByOre.get(rock.oreType)||[];group.push(rock);rocksByOre.set(rock.oreType,group);}
    const points=slots(),remaining={...abundance};
    for(const point of points)if(point.oreType)remaining[point.oreType]--;
    const types=shuffle(Object.entries(remaining).flatMap(([type,count])=>Array(count).fill(type)));
    let next=0;
    for(const point of points)if(!point.oreType)point.oreType=types[next++];
    const indexes=new Map();
    for(const [slotId,point] of points.entries()){
      const group=rocksByOre.get(point.oreType);
      if(!group?.length)throw new Error(`No artwork for ${point.oreType}`);
      const index=indexes.get(point.oreType)||0,rock=group[index%group.length];
      indexes.set(point.oreType,index+1);
      point.slotId=slotId;point.id=rock.id;point.name=rock.name;point.oreLabel=rock.oreLabel;
      point.file=rock.file;point.oreImage=rock.oreImage;point.width=rock.width;point.height=rock.height;point.size=25+random()*18+(point.region==='Asteroid Belt'?random()*5:0);
      if(point.guaranteedOre)point.size=41;
      point.maxHull=Math.max(9,Math.round(point.size*.45));
      point.angle=random()*Math.PI*2;
    }
    // Append new rocks after the original slots so existing mined-asteroid saves keep their IDs.
    let extensionSeed=98127;
    const extraRandom=()=>{extensionSeed=(extensionSeed*1664525+1013904223)>>>0;return extensionSeed/4294967296;};
    const addExtra=(x,y,region,oreType,demo=false)=>{
      const group=rocksByOre.get(oreType),index=indexes.get(oreType)||0,rock=group[index%group.length];
      indexes.set(oreType,index+1);
      const slotId=points.length,size=demo?46:27+extraRandom()*21;
      points.push({slotId,x,y,region,oreType,guaranteedOre:demo,demo,name:rock.name,id:rock.id,oreLabel:rock.oreLabel,
        file:rock.file,oreImage:rock.oreImage,width:rock.width,height:rock.height,size,maxHull:Math.max(9,Math.round(size*.45)),angle:extraRandom()*Math.PI*2});
    };
    addExtra(100,80,'Earth demonstration','trellium',true);
    for(let i=0;i<160;i++){
      for(let attempt=0;attempt<160;attempt++){
        const angle=extraRandom()*Math.PI*2,radius=Math.sqrt(extraRandom())*1250;
        const x=7780+Math.cos(angle)*radius,y=-1325+Math.sin(angle)*radius;
        if(!clearOfPlanets(x,y)||points.some(point=>Math.hypot(x-point.x,y-point.y)<56))continue;
        const oreType=i%17===0?'benamite':i%9===0?'gallicite':i%5===0?'tritanium':i%3===0?'dilithium':'trellium';
        addExtra(x,y,'Asteroid Belt',oreType);break;
      }
    }
    for(const point of points)point.system=1;
    placements=points;catalogData=rocksByOre;
  }
  function forSystem(system=1){
    system=Number(system);if(!catalogData){if(system===1)ensureIndex(system,placements);return system===1?placements:[];}
    if(!systems.has(system)){
      const geology=window.nativeRegionalMinerals;
      if(!geology){if(system===1)ensureIndex(system,placements);return system===1?placements:[];}
      const profile=geology.profile(system),random=geology.seed(system*811+413977),legacy=system===1?placements:[],rocks=[...legacy],types=geology.oreSequence(system,profile.count,legacy),belts=[];
      const origin=system===1?{x:-6220,y:-925}:{x:-220,y:75};
      const neighbors=geology.neighbors(system,4),position=geology.position(system);
      const lanes=neighbors.map(id=>{const p=geology.position(id);return Math.atan2(p.y-position.y,p.x-position.x);});
      const localLanes=system===1?routes.map(([a,b])=>{const from=regions.find(r=>r.name===a),to=regions.find(r=>r.name===b);return {a:{x:from.x-220,y:from.y+75},b:{x:to.x-220,y:to.y+75}};}):[];
      const lineDistance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
      const clear=p=>system===1?clearOfPlanets(p.x,p.y)&&localLanes.every(l=>lineDistance(p,l.a,l.b)>230):Math.hypot(p.x+220,p.y-75)>850&&lanes.every(angle=>Math.abs(Math.atan2(Math.sin(p.angle-angle),Math.cos(p.angle-angle)))>.11);
      for(let belt=0;belt<2;belt++){
        const radius=system===1?[14200,21000][belt]:[2100+(system%6)*220,4400+(system%5)*260][belt],width=system===1?500:280+(system%4)*65;
        const name=(system===1?'Sol':window.VexedMirrorWorld.systems.find(s=>s.id===system)?.name||'Frontier')+' '+(belt===0?'inner':'outer')+' belt';
        belts.push({name,system,x:origin.x,y:origin.y,radius,width,mainOres:Object.entries(profile.weights).filter(([,n])=>n>=30).map(([ore])=>ore)});
        const count=belt===0?Math.ceil(profile.count*.6):Math.floor(profile.count*.4);
        for(let slot=0;slot<count;slot++){
          let point=null;
          for(let attempt=0;attempt<240;attempt++){
            const angle=random()*Math.PI*2,distance=radius+(random()-.5)*width*2,candidate={x:origin.x+Math.cos(angle)*distance,y:origin.y+Math.sin(angle)*distance,angle};
            if(!clear(candidate)||rocks.some(r=>Math.hypot(r.x-candidate.x,r.y-candidate.y)<65))continue;point=candidate;break;
          }
          if(!point)continue;
          const index=rocks.length-legacy.length,oreType=types[index],group=catalogData.get(oreType),art=group[Math.floor(random()*group.length)],size=28+random()*20;
          rocks.push({...art,...point,slotId:system*100000+index,system,region:name,oreType,size,maxHull:Math.max(9,Math.round(size*.45)),angle:random()*Math.PI*2});
        }
      }
      // Version 1 deuranium extension: independent random stream and a reserved
      // index range preserve EVERY existing regional pose, ore and depleted ID.
      const deuranium=catalogData.get('deuranium');
      if(deuranium?.length){
        const extra=geology.seed(system*1297+771041);
        for(let index=0;index<(profile.deposits?.deuranium||0);index++){
          const belt=index%2,radius=belts[belt].radius,width=belts[belt].width;
          let point;
          for(let attempt=0;attempt<240;attempt++){
            const angle=extra()*Math.PI*2,distance=radius+(extra()-.5)*width*2,candidate={x:origin.x+Math.cos(angle)*distance,y:origin.y+Math.sin(angle)*distance,angle};
            if(!clear(candidate)||rocks.some(r=>Math.hypot(r.x-candidate.x,r.y-candidate.y)<70))continue;point=candidate;break;
          }
          if(!point)continue;
          const art=deuranium[index%deuranium.length],size=34+extra()*16;
          rocks.push({...art,...point,slotId:system*100000+90000+index,system,region:belts[belt].name,oreType:'deuranium',size,maxHull:Math.max(9,Math.round(size*.45)),angle:extra()*Math.PI*2,depositVersion:1});
        }
      }
      systems.set(system,rocks);beltData.set(system,belts);
    }
    const field=systems.get(system);ensureIndex(system,field);return field;
  }
  // Public field arrays retain their established editing semantics. Length
  // changes are detected cheaply; explicit shared invalidation covers edits
  // that keep the same length, including object replacement and direct poses.
  // Ordinary motion updates the same index incrementally through relocate.
  function ensureIndex(system,field){
    const indexed=indexedFields.get(system);
    if(indexed&&indexed.field===field&&indexed.length===field.length&&!indexed.dirty)return;
    const byId=new Map(),grid=new Map(),displaced=new Set(),motion={dx:0,dy:0,vx:0,vy:0};let maximum=0;
    for(const rock of field){
      byId.set(rock.slotId,rock);
      const key=Math.floor(rock.x/cellSize)+':'+Math.floor(rock.y/cellSize),bucket=grid.get(key)||[];bucket.push(rock);grid.set(key,bucket);
      if(Number.isFinite(rock.previousX)&&rock.previousX!==rock.x||Number.isFinite(rock.previousY)&&rock.previousY!==rock.y||rock.vx||rock.vy)displaced.add(rock);
      maximum=Math.max(maximum,rock.size*.43);growMotion(motion,rock);
    }
    indexes.set(system,byId);grids.set(system,grid);moving.set(system,displaced);maxRadii.set(system,maximum);motionBounds.set(system,motion);
    indexedFields.set(system,{field,length:field.length,dirty:false});
    indexBuilds++;
  }
  // A swept rock can finish outside a local query. Expand the existing
  // center grid by conservative component-wise motion maxima, then retain the
  // exact swept AABB filter below. This avoids scanning all movers per query.
  function growMotion(bounds,rock){
    bounds.dx=Math.max(bounds.dx,Math.abs(rock.x-(Number.isFinite(rock.previousX)?rock.previousX:rock.x)));
    bounds.dy=Math.max(bounds.dy,Math.abs(rock.y-(Number.isFinite(rock.previousY)?rock.previousY:rock.y)));
    bounds.vx=Math.max(bounds.vx,Math.abs(Number(rock.vx)||0));
    bounds.vy=Math.max(bounds.vy,Math.abs(Number(rock.vy)||0));
  }
  function prepareStep(){
    for(const bounds of motionBounds.values())bounds.dx=bounds.dy=bounds.vx=bounds.vy=0;
    for(const [system,displaced] of moving){
      let bounds=motionBounds.get(system);if(!bounds){bounds={dx:0,dy:0,vx:0,vy:0};motionBounds.set(system,bounds);}
      summaryVisits+=displaced.size;
      for(const rock of displaced)growMotion(bounds,rock);
    }
  }
  function invalidateIndex(system){
    if(system===undefined){for(const indexed of indexedFields.values())indexed.dirty=true;}
    else{const indexed=indexedFields.get(Number(system));if(indexed)indexed.dirty=true;}
  }
  function find(id,system){if(id===null||id===undefined)return null;system=Number(system??(Number(id)>=100000?Math.floor(Number(id)/100000):1));const field=forSystem(system);return indexes.get(system)?.get(Number(id))||field.find(r=>r.slotId===Number(id))||null;}
  // Keep the spatial index authoritative when a saved physical rock moves.
  // Seeded IDs, sizes and ore geology never change.
  function relocate(rock,pose){
    const system=Number(rock.system??1),field=systems.get(system)||(system===1?placements:null);
    if(field)ensureIndex(system,field);
    const registered=indexes.get(system)?.get(rock.slotId)===rock,grid=grids.get(system),key=p=>Math.floor(p.x/cellSize)+':'+Math.floor(p.y/cellSize),before=key(rock),after=key(pose);
    if(registered&&grid&&before!==after){const bucket=grid.get(before),index=bucket?.indexOf(rock)??-1;if(index>=0){bucket.splice(index,1);if(!bucket.length)grid.delete(before);}const next=grid.get(after)||[];if(!next.includes(rock))next.push(rock);grid.set(after,next);}
    Object.assign(rock,{previousX:pose.previousX??rock.x,previousY:pose.previousY??rock.y,x:pose.x,y:pose.y,angle:pose.angle,vx:pose.vx||0,vy:pose.vy||0,spin:pose.spin||0});
    // Save cleanup may restore an object removed or replaced in the public
    // field. Its old reference must not become a collision target again.
    if(!registered)return;
    let displaced=moving.get(system);if(!displaced){displaced=new Set();moving.set(system,displaced);}
    if(rock.previousX!==rock.x||rock.previousY!==rock.y||rock.vx||rock.vy)displaced.add(rock);else displaced.delete(rock);
    maxRadii.set(system,Math.max(maxRadii.get(system)||0,rock.size*.43));
    let bounds=motionBounds.get(system);if(!bounds){bounds={dx:0,dy:0,vx:0,vy:0};motionBounds.set(system,bounds);}growMotion(bounds,rock);
  }
  function queryBounds(system,bounds,{swept=true,predictSeconds=0}={}){
    system=Number(system);const rocks=forSystem(system),grid=grids.get(system);
    if(!bounds||!['minX','minY','maxX','maxY'].every(key=>Number.isFinite(bounds[key])))return rocks;
    const radius=maxRadii.get(system)||55,motion=motionBounds.get(system),horizon=Math.max(0,Number(predictSeconds)||0),
      paddingX=radius+(swept?motion?.dx||0:0)+(motion?.vx||0)*horizon,
      paddingY=radius+(swept?motion?.dy||0:0)+(motion?.vy||0)*horizon,
      left=Math.floor((bounds.minX-paddingX)/cellSize),right=Math.floor((bounds.maxX+paddingX)/cellSize),
      top=Math.floor((bounds.minY-paddingY)/cellSize),bottom=Math.floor((bounds.maxY+paddingY)/cellSize),
      candidates=new Set();
    // Calendar sweeps can cross enormous empty areas; inspecting the existing
    // small geometry field is bounded more tightly than walking empty cells.
    if(!grid||(right-left+1)*(bottom-top+1)>Math.max(16,grid.size*2))for(const rock of rocks)candidates.add(rock);
    else for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++)for(const rock of grid.get(x+':'+y)||[])candidates.add(rock);
    broadphaseQueries++;broadphaseVisits+=candidates.size;
    const result=[];
    for(const rock of candidates){
      const r=rock.size*.43,px=swept&&Number.isFinite(rock.previousX)?rock.previousX:rock.x,py=swept&&Number.isFinite(rock.previousY)?rock.previousY:rock.y,
        fx=rock.x+(Number(rock.vx)||0)*horizon,fy=rock.y+(Number(rock.vy)||0)*horizon;
      if(Math.min(px,rock.x,fx)-r<=bounds.maxX&&Math.max(px,rock.x,fx)+r>=bounds.minX&&Math.min(py,rock.y,fy)-r<=bounds.maxY&&Math.max(py,rock.y,fy)+r>=bounds.minY)result.push(rock);
    }
    return result;
  }
  function nearby(system,point,radius){
    const rocks=forSystem(system),grid=grids.get(Number(system));if(!grid||!point||!Number.isFinite(radius))return rocks;
    const result=[];
    for(let x=Math.floor((point.x-radius-50)/cellSize);x<=Math.floor((point.x+radius+50)/cellSize);x++)for(let y=Math.floor((point.y-radius-50)/cellSize);y<=Math.floor((point.y+radius+50)/cellSize);y++)for(const rock of grid.get(x+':'+y)||[])if(Math.hypot(rock.x-point.x,rock.y-point.y)<=radius+rock.size)result.push(rock);
    return result;
  }
  function sweptNearby(system,from,to,radius){
    const distance=Math.hypot(to.x-from.x,to.y-from.y);
    // Long calendar skips scan the small lazy geometry field rather than an
    // enormous empty grid rectangle. Ordinary physics uses neighboring cells.
    if(distance+radius<cellSize*3)return nearby(system,{x:(from.x+to.x)/2,y:(from.y+to.y)/2},radius+distance/2);
    const dx=to.x-from.x,dy=to.y-from.y,denominator=dx*dx+dy*dy;
    return forSystem(system).filter(rock=>{const t=denominator?Math.max(0,Math.min(1,((rock.x-from.x)*dx+(rock.y-from.y)*dy)/denominator)):0;return Math.hypot(rock.x-from.x-t*dx,rock.y-from.y-t*dy)<=radius+rock.size;});
  }
  function image(file){
    if(!images.has(file)){
      const art=new Image();
      art.src=artRoot+file;
      images.set(file,art);
    }
    const art=images.get(file);
    const stage=deuraniumStages.indexOf(file);
    if(stage>0&&!art.getContext&&art.complete&&art.naturalWidth){
      const prior=image(deuraniumStages[stage-1]);if(!prior.complete||!prior.naturalWidth)return prior;
      // Keep the generated wounds but intersect each silhouette with its prior
      // stage. Missing stone cannot reappear when a later frame is selected.
      const frame=document.createElement('canvas');frame.width=frame.height=512;
      const g=frame.getContext('2d',{willReadFrequently:true});g.drawImage(prior,0,0,512,512);
      const before=g.getImageData(0,0,512,512).data;g.clearRect(0,0,512,512);g.drawImage(art,0,0,512,512);
      const after=g.getImageData(0,0,512,512);for(let i=3;i<after.data.length;i+=4)after.data[i]=Math.min(after.data[i],before[i]);g.putImageData(after,0,0);
      Object.assign(frame,{complete:true,naturalWidth:512,naturalHeight:512,src:art.src});images.set(file,frame);return frame;
    }
    return art;
  }
  function screenSize(rock,zoom){return rock.size*Math.min(zoom,2.2);}
  function artworkDimensions(rock){
    // The catalogue owns source-pixel geometry even before its image loads.
    // Regional placements already retain these fields through their art spread.
    return {width:Math.max(1,Number(rock.width)||512),height:Math.max(1,Number(rock.height)||512)};
  }
  function hitTest({ship,cx,cy,zoom,x,y,mined=[],system=1}){
    if(!ship)return null;
    const point={x:ship.x+(x-cx)/zoom,y:ship.y+(y-cy)/zoom};
    for(const rock of nearby(system,point,70)){
      if(mined.includes(rock.slotId))continue;
      const sx=cx+(rock.x-ship.x)*zoom,sy=cy+(rock.y-ship.y)*zoom;
      if(Math.hypot(x-sx,y-sy)<=Math.max(11,screenSize(rock,zoom)*.6))return rock;
    }
    return null;
  }
  function frame(rock,damage){
    const health=Math.max(0,1-(Number(damage)||0)/rock.maxHull);
    const stage=health<=.25?'severe':health<=.5?'heavy':health<=.75?'light':null;
    if(stage)return rock.file.replace(/\.png$/,`_${stage}.png`);
    return rock.id===100?'asteroids/asteroid_01_intact.png':rock.file;
  }
  function paint(ctx,{ship,cx,cy,zoom,w,h,mined=[],damage={},hiddenId=null,hiddenIds=[],system=1}){
    if(!ship||!placements.length)return;
    const hidden=new Set(hiddenIds);
    for(const rock of nearby(system,ship,Math.hypot(w,h)/(2*zoom)+70)){
      if(mined.includes(rock.slotId)||rock.slotId===hiddenId||hidden.has(rock.slotId))continue;
      const x=cx+rock.x-ship.x,y=cy+rock.y-ship.y;
      const screenX=cx+(x-cx)*zoom,screenY=cy+(y-cy)*zoom,extent=screenSize(rock,zoom);
      if(screenX+extent<0||screenX-extent>w||screenY+extent<0||screenY-extent>h)continue;
      const art=image(frame(rock,damage[rock.slotId]));
      if(!art.complete||!art.naturalWidth)continue;
      ctx.save();ctx.translate(x,y);ctx.rotate(rock.angle);
      const size=screenSize(rock,zoom)/zoom;
      ctx.drawImage(art,-size/2,-size/2,size,size);ctx.restore();
    }
  }
  window.nativeSolAsteroids={paint,hitTest,frame,image,peekImage:file=>images.get(file)||null,artworkDimensions,forSystem,find,nearby,sweptNearby,queryBounds,invalidateIndex,prepareStep,relocate,belts(system){forSystem(system);return (beltData.get(Number(system))||[]).map(b=>({...b,mainOres:[...b.mainOres]}));},metrics(){return {builtSystems:systems.size,rocks:[...systems.values()].reduce((n,r)=>n+r.length,0),images:images.size,indexBuilds,broadphaseQueries,broadphaseVisits,summaryVisits};},get ready(){return ready;},get placements(){return placements;},abundance};
  ready=fetch(catalogUrl).then(response=>{if(!response.ok)throw new Error('Asteroid catalog unavailable');return response.json();})
    .then(populate).catch(error=>console.warn('Sol asteroid artwork unavailable',error));
})();
