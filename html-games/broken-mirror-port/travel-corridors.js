/* Stable interstellar places. Data only: existing owners handle ships and ore. */
(() => {
  'use strict';
  const version=2,baseId=1_000_000_000,stride=65536,cellSize=8192;
  const sectorBase=1_000_000_000_000,sectorSize=2048,sectorBias=32768,sectorStride=65536;
  const sectors=new Map(),restored=new WeakMap(),emptyLanes=Object.freeze([]);let extent=null,addLane=null,activeState=null,activeLanes=new Set();
  const infos=new Map(),lanes=new Map(),sites=new Map(),bySystem=new Map(),grid=new Map();let built=false;
  const enabled=state=>!!(state?.civilianTraffic?.population?.version>=1);
  const anchor=id=>window.nativeManualFlight.anchor(id);
  const random=seed=>{let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};};
  function build(){
    if(built)return;built=true;
    const rows=window.VexedMirrorWorld.systems.filter(s=>s.mapPosition&&Number(s.populationBillions)>0&&!window.nativeCivilianAccess?.blocked(s.id)&&s.id!==30);
    const add=(a,b,dynamic=false)=>{
      if(a.id>b.id)[a,b]=[b,a];const key=a.id*1000+b.id;if(lanes.has(key))return lanes.get(key);
      const from=anchor(a.id),to=anchor(b.id);if(!from||!to)return;
      const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);if(length<10000)return;
      const oldA=window.nativeBadlands?.previousChart(a.id),oldB=window.nativeBadlands?.previousChart(b.id),oldLength=oldA&&oldB?Math.hypot(oldA.x-oldB.x,oldA.y-oldB.y)*1000:0;
      const count=Math.min(2047,Math.max(1,Math.floor((Math.max(length,oldLength)-8000)/4000))),lane={id:key,from:a.id,to:b.id,name:a.name+' – '+b.name,length,sites:[],dynamic};
      lanes.set(key,lane);
      for(const id of [a.id,b.id]){let list=bySystem.get(id);if(!list)bySystem.set(id,list=[]);list.push(lane);}
      for(let i=0;i<count;i++){
        const t=(4000+(length-8000)*(i+.5)/count)/length,side=(i%2?1:-1)*170;
        const site={id:key+':'+i,lane:key,index:i,x:from.x+dx*t-dy/length*side,y:from.y+dy*t+dx/length*side,
          name:lane.name+' prospect '+(i+1),owner:t<.5?a.id:b.id};
        lane.sites.push(site);sites.set(site.id,site);const cell=Math.floor(site.x/cellSize)+':'+Math.floor(site.y/cellSize);let bucket=grid.get(cell);if(!bucket)grid.set(cell,bucket=[]);bucket.push(site);
      }
      return lane;
    };
    addLane=add;
    for(const a of rows){const p=anchor(a.id);if(!p)continue;const near=rows.filter(b=>b!==a).sort((b,c)=>{const x=anchor(b.id),y=anchor(c.id);return Math.hypot(x.x-p.x,x.y-p.y)-Math.hypot(y.x-p.x,y.y-p.y)||b.id-c.id;});for(const b of near.slice(0,3))add(a,b);}
    // Retain old static lane identities too: an in-progress mining claim may
    // refer to one even when cartographic movement changes nearest neighbors.
    const previous=window.nativeBadlands?.previousChart;
    if(previous)for(const a of rows){const p=previous(a.id);if(!p)continue;const near=rows.filter(b=>b!==a&&previous(b.id)).sort((b,c)=>{const x=previous(b.id),y=previous(c.id);return Math.hypot(x.x-p.x,x.y-p.y)-Math.hypot(y.x-p.x,y.y-p.y)||b.id-c.id;});for(const b of near.slice(0,3))add(a,b);}
    const sol=rows.find(s=>s.id===1),orion=rows.find(s=>/^orion$/i.test(s.name));if(sol&&orion)add(sol,orion);
    const points=window.VexedMirrorWorld.systems.map(s=>anchor(s.id)).filter(Boolean);
    extent={minX:Math.min(...points.map(p=>p.x))-12000,minY:Math.min(...points.map(p=>p.y))-12000,maxX:Math.max(...points.map(p=>p.x))+12000,maxY:Math.max(...points.map(p=>p.y))+12000};
  }
  function ensureLane(from,to,state){
    build();from=Number(from);to=Number(to);if(from===to)return null;
    const world=window.VexedMirrorWorld.systems,a=world.find(s=>s.id===from),b=world.find(s=>s.id===to);
    if(!a||!b||window.nativeCivilianAccess?.blocked(from)||window.nativeCivilianAccess?.blocked(to)||!(a.populationBillions>0)||!(b.populationBillions>0))return null;
    const lane=addLane(a,b,true)||null;
    if(lane?.dynamic&&state){
      state.travelCorridors??={version:2,lanes:[]};state.travelCorridors.lanes??=[];
      if(!state.travelCorridors.lanes.includes(lane.id))state.travelCorridors.lanes.push(lane.id);
      if(state===activeState)activeLanes.add(lane.id);
    }
    return lane;
  }
  function restore(state){
    build();const saved=state.travelCorridors?.lanes||emptyLanes,previous=restored.get(state);
    if(activeState===state&&previous?.list===saved&&previous.length===saved.length)return;
    activeState=state;activeLanes=new Set(saved);
    for(const key of saved)ensureLane(Math.floor(Number(key)/1000),Number(key)%1000);
    restored.set(state,{list:saved,length:saved.length});
  }
  function sector(x,y){
    build();if(!Number.isInteger(x)||!Number.isInteger(y)||Math.abs(x)>=sectorBias||Math.abs(y)>=sectorBias)return null;
    const key=x+':'+y;if(sectors.has(key))return sectors.get(key);
    const cx=(x+.5)*sectorSize,cy=(y+.5)*sectorSize;
    if(cx<extent.minX||cx>extent.maxX||cy<extent.minY||cy>extent.maxY)return null;
    const site={id:'sector:'+key,sector:true,index:0,x:cx,y:cy,gx:x,gy:y,slots:[],extent:sectorSize/2+70,name:'Interstellar drift field'};
    const origin=window.nativeManualFlight.boundaries?.().reduce((best,row)=>{const distance=Math.hypot(row.x-cx,row.y-cy);return !best||distance<best.distance?{id:row.id,distance}:best;},null);site.owner=origin?.id??1;
    for(let slot=0;slot<3;slot++){
      const id=sectorBase+((x+sectorBias)*sectorStride+y+sectorBias)*32+slot,r=random(Math.imul(x,73856093)^Math.imul(y,19349663)^slot*83492791);
      const px=x*sectorSize+100+r()*(sectorSize-200),py=y*sectorSize+100+r()*(sectorSize-200);
      if(window.nativeBadlands?.containsGlobal(px,py,80)||window.nativeManualFlight.regionAtPoint?.({devMode:true},{x:px,y:py}).kind==='system')continue;
      site.slots.push({id,x:px,y:py});
    }
    if(sectors.size>=512)sectors.delete(sectors.keys().next().value);sectors.set(key,site);return site;
  }
  function query(box,{capsule=null}={}){
    build();if(!box||!['minX','minY','maxX','maxY'].every(k=>Number.isFinite(box[k])))return [];
    const near=(x,y,extent)=>{if(!capsule)return true;const a=capsule.from,b=capsule.to,dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length)):0;return Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<=capsule.radius+extent;};
    const x0=Math.floor((box.minX-520)/cellSize),x1=Math.floor((box.maxX+520)/cellSize),y0=Math.floor((box.minY-520)/cellSize),y1=Math.floor((box.maxY+520)/cellSize),result=[];
    const include=s=>(!lanes.get(s.lane)?.dynamic||activeLanes.has(s.lane))&&s.x+520>=box.minX&&s.x-520<=box.maxX&&s.y+520>=box.minY&&s.y-520<=box.maxY&&near(s.x,s.y,520);
    if((x1-x0+1)*(y1-y0+1)>grid.size*2){for(const site of sites.values())if(include(site))result.push(site);}
    else for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const site of grid.get(x+':'+y)||[])if(include(site))result.push(site);
    // Sparse interstellar rocks cover free flight too. Only cells intersecting
    // this local query are materialized; map inspection never enumerates them.
    const sx0=Math.max(-sectorBias+1,Math.floor(Math.max(box.minX,extent.minX)/sectorSize)),sx1=Math.min(sectorBias-1,Math.floor(Math.min(box.maxX,extent.maxX)/sectorSize));
    const sy0=Math.max(-sectorBias+1,Math.floor(Math.max(box.minY,extent.minY)/sectorSize)),sy1=Math.min(sectorBias-1,Math.floor(Math.min(box.maxY,extent.maxY)/sectorSize));
    if((sx1-sx0+1)*(sy1-sy0+1)<=4096)for(let x=sx0;x<=sx1;x++)for(let y=sy0;y<=sy1;y++){if(!near((x+.5)*sectorSize,(y+.5)*sectorSize,sectorSize/Math.SQRT2+70))continue;const site=sector(x,y);if(site?.slots.length)result.push(site);}
    return result;
  }
  function rockInfo(id){
    build();if(infos.has(Number(id)))return infos.get(Number(id));
    if(Number(id)>=sectorBase){
      const offset=Number(id)-sectorBase,index=Math.floor(offset/32),slot=offset%32,x=Math.floor(index/sectorStride)-sectorBias,y=index%sectorStride-sectorBias;
      if(!Number.isSafeInteger(offset)||offset<0||slot>=3)return null;
      const site=sector(x,y),point=site?.slots.find(p=>p.id===Number(id));if(!point)return null;const r=random(Number(id));
      const info={slotId:Number(id),site:site.id,name:site.name,region:site.name,corridor:true,sector:true,ownerSystem:site.owner,globalX:point.x,globalY:point.y,oreType:slot===0?'trellium':slot===1?'dilithium':'deuranium',size:27+r()*17,angle:r()*Math.PI*2};infos.set(Number(id),info);return info;
    }
    const offset=Number(id)-baseId;if(!Number.isSafeInteger(offset)||offset<0)return null;
    const key=Math.floor(offset/stride),lane=lanes.get(key)||ensureLane(Math.floor(key/1000),key%1000),rest=offset%stride,index=Math.floor(rest/32),slot=rest%32,site=lane?.sites[index];if(!site||slot>=12)return null;
    const r=random(id),angle=(slot/12+.02*r())*Math.PI*2,radius=110+r()*260;
    const info={slotId:Number(id),site:site.id,lane:site.lane,name:site.name,region:site.name,corridor:true,ownerSystem:site.owner,
      globalX:site.x+Math.cos(angle)*radius,globalY:site.y+Math.sin(angle)*radius,
      oreType:slot===0?'deuranium':slot%7===0?'gallicite':slot%3===0?'dilithium':'trellium',size:27+r()*17,angle:r()*Math.PI*2};if(window.nativeBadlands?.containsGlobal(info.globalX,info.globalY,80))return null;infos.set(Number(id),info);return info;
  }
  function rockIds(site){return site.sector?site.slots.map(p=>p.id):Array.from({length:12},(_,slot)=>baseId+site.lane*stride+site.index*32+slot);}
  function miningSites(system,ship){build();const list=(bySystem.get(Number(system))||[]).filter(l=>!l.dynamic||activeLanes.has(l.id)).flatMap(l=>l.sites).filter(s=>!window.nativeBadlands?.containsGlobal(s.x,s.y,520));if(!list.length)return [];const start=(Number(ship.id)*7+(Number(ship.miningTrips)||0))%list.length,result=Array.from({length:Math.min(3,list.length)},(_,i)=>list[(start+i)%list.length]);
    const bounds=window.nativeManualFlight.boundaries?.().find(row=>row.id===(window.nativeSystemCatalog?.physicalId(system)??Number(system)));
    if(bounds&&(Number(ship.id)+(Number(ship.miningTrips)||0))%3===0){const angle=(Number(ship.id)*2.399963229728653),x=bounds.x+Math.cos(angle)*(bounds.rx+2200),y=bounds.y+Math.sin(angle)*(bounds.ry+2200),site=sector(Math.floor(x/sectorSize),Math.floor(y/sectorSize));if(site?.slots.length)result.unshift(site);}
    return result;
  }
  function waypoints(from,to,start,end,state){const lane=ensureLane(from,to,state);if(!lane)return null;const fields=from===lane.from?lane.sites:[...lane.sites].reverse();return [{...start},...fields.map(s=>({x:s.x,y:s.y})),{...end}];}
  const active=lane=>!lane.dynamic||activeLanes.has(lane.id);
  window.nativeTravelCorridors=Object.freeze({version,enabled,anchor,query,rockInfo,rockIds,miningSites,waypoints,ensureLane,restore,sectorSize,sectorBase,linked(from,to){build();const lane=lanes.get(Math.min(from,to)*1000+Math.max(from,to));return !!lane&&active(lane);},
    lanes(){build();return [...lanes.values()].filter(active);},sites(system){build();return (bySystem.get(Number(system))||[]).filter(active).flatMap(l=>l.sites);},metrics(){build();return {lanes:[...lanes.values()].filter(active).length,sites:sites.size,siteCells:grid.size,sectorCells:sectors.size,rockTemplates:infos.size};}});
})();
