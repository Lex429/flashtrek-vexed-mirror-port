/* Showcase asteroid artwork placed throughout Sol. Positions stay fixed across saves. */
(() => {
  'use strict';
  const catalogUrl='../flashtrek-broken-mirror/showcase-assets/asteroids.json';
  const artRoot='../flashtrek-broken-mirror/showcase-assets/';
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
      point.file=rock.file;point.oreImage=rock.oreImage;point.size=25+random()*18+(point.region==='Asteroid Belt'?random()*5:0);
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
        file:rock.file,oreImage:rock.oreImage,size,maxHull:Math.max(9,Math.round(size*.45)),angle:extraRandom()*Math.PI*2});
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
    placements=points;
  }
  function image(file){
    if(!images.has(file)){
      const art=new Image();
      art.src=artRoot+file;
      images.set(file,art);
    }
    return images.get(file);
  }
  function screenSize(rock,zoom){return rock.size*Math.min(zoom,2.2);}
  function hitTest({ship,cx,cy,zoom,x,y,mined=[]}){
    if(!ship)return null;
    for(const rock of placements){
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
  function paint(ctx,{ship,cx,cy,zoom,w,h,mined=[],damage={},hiddenId=null,hiddenIds=[]}){
    if(!ship||!placements.length)return;
    const hidden=new Set(hiddenIds);
    for(const rock of placements){
      if(mined.includes(rock.slotId)||rock.slotId===hiddenId||hidden.has(rock.slotId))continue;
      const x=cx+rock.x-ship.x,y=cy+rock.y-ship.y;
      const screenX=cx+(x-cx)*zoom,screenY=cy+(y-cy)*zoom,extent=screenSize(rock,zoom);
      if(screenX+extent<0||screenX-extent>w||screenY+extent<0||screenY-extent>h)continue;
      const art=image(frame(rock,0));
      if(!art.complete||!art.naturalWidth)continue;
      ctx.save();ctx.translate(x,y);ctx.rotate(rock.angle);
      const size=screenSize(rock,zoom)/zoom;
      ctx.drawImage(art,-size/2,-size/2,size,size);ctx.restore();
    }
  }
  window.nativeSolAsteroids={paint,hitTest,frame,image,get placements(){return placements;},abundance};
  fetch(catalogUrl).then(response=>{if(!response.ok)throw new Error('Asteroid catalog unavailable');return response.json();})
    .then(populate).catch(error=>console.warn('Sol asteroid artwork unavailable',error));
})();
