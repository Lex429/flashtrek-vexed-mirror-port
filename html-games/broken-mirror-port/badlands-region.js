/* Badlands geography: one boundary for charts, arrivals and physical content. */
(() => {
  'use strict';
  const version=1,system=73,units=1000,world=window.VexedMirrorWorld;
  const rows=world.systems,centre={...rows.find(r=>r.id===system).mapPosition};
  const boundary=Object.freeze({x:0,y:0,rx:64000,ry:48000});
  const fog=Object.freeze({rx:94,ry:74}),oldPositions=new Map(rows.filter(r=>r.mapPosition).map(r=>[r.id,{...r.mapPosition}]));
  world.geologyMapPositions??={};for(const [id,p] of oldPositions)world.geologyMapPositions[id]??={...p};
  const records=window.VexedMirrorSystemData.systems;
  const record=records.find(r=>r.id===system);
  record.bodies=record.bodies.filter(b=>b.kind==='region').map(b=>({...b,render:false,port:false}));
  const region=rows.find(r=>r.id===system);
  Object.assign(region,{asteroids:false,nebula:true,description:'A vast starless plasma region. Warp arrivals stop at its perimeter; dense storms fill the interior and stream beyond its borders.'});
  region.geology={key:'frontier',name:'Badlands plasma — no asteroid deposits',weights:{tritanium:27,dilithium:26,trellium:24,gallicite:20,benamite:3},count:0,deposits:{deuranium:0}};
  // Keep the earlier geological seed map. Cartographic movement cannot reseed
  // depleted rocks or change a neighboring system's local mineral fields.
  const envelopes=new Map(records.filter(r=>r.id!==system).map(r=>{
    const boxes=r.bodies.filter(b=>!b.occludedBy).map(b=>({x:b.x,y:b.y,r:(b.size||100)/2+1100}));
    const minX=Math.min(...boxes.map(b=>b.x-b.r)),maxX=Math.max(...boxes.map(b=>b.x+b.r));
    const minY=Math.min(...boxes.map(b=>b.y-b.r)),maxY=Math.max(...boxes.map(b=>b.y+b.r));
    const home=r.bodies.find(b=>b.id===Number(r.homeBodyByLegacy[r.id]??0));
    const x=(minX+maxX)/2,y=(minY+maxY)/2,rx=Math.max(2800,(maxX-minX)/2),ry=Math.max(2300,(maxY-minY)/2);
    const fit=Math.max(1,...boxes.map(b=>Math.hypot((Math.abs(b.x-x)+b.r)/rx,(Math.abs(b.y-y)+b.r)/ry)));
    return [r.id,{id:r.id,dx:(x-(r.id===1?0:home.x)-220)/units,dy:(y-(r.id===1?0:home.y)+75)/units,rx:rx*fit/units,ry:ry*fit/units}];
  }));
  const movable=new Set(rows.filter(r=>r.id!==1&&r.id!==system&&r.id!==30&&r.mapPosition&&Math.hypot((r.mapPosition.x-centre.x)/115,(r.mapPosition.y-centre.y)/95)<1.5).map(r=>r.id));
  const points=rows.filter(r=>r.mapPosition&&envelopes.has(r.id)).map(r=>({row:r,...envelopes.get(r.id),x:r.mapPosition.x,y:r.mapPosition.y}));
  function clear(p){
    const x=p.x+p.dx-centre.x,y=p.y+p.dy-centre.y,rx=88+p.rx,ry=68+p.ry,q=Math.hypot(x/rx,y/ry);
    if(q<1){const k=1/Math.max(.001,q);p.x=centre.x+x*k-p.dx;p.y=centre.y+y*k-p.dy;}
  }
  for(const p of points)if(movable.has(p.id))clear(p);
  // Resolve crowding caused by opening a large hole in the old dense chart.
  // Directions stay recognizable; Sol and distant geography remain fixed.
  for(let pass=0;pass<180;pass++){
    for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++){
      const p=points[a],q=points[b],mp=movable.has(p.id),mq=movable.has(q.id);if(!mp&&!mq)continue;
      const dx=q.x+q.dx-p.x-p.dx,dy=q.y+q.dy-p.y-p.dy,rx=p.rx+q.rx+5,ry=p.ry+q.ry+5,d=Math.hypot(dx/rx,dy/ry);
      if(d>=1)continue;const length=Math.hypot(dx,dy)||1,push=Math.min(3,(1-d)*Math.min(rx,ry)),div=mp&&mq?2:1;
      if(mp){p.x-=dx/length*push/div;p.y-=dy/length*push/div;}
      if(mq){q.x+=dx/length*push/div;q.y+=dy/length*push/div;}
    }
    for(const p of points)if(movable.has(p.id))clear(p);
  }
  for(const p of points)if(movable.has(p.id))p.row.mapPosition={x:p.x,y:p.y};
  const delta=id=>{const old=oldPositions.get(Number(id)),now=rows.find(r=>r.id===Number(id))?.mapPosition;return old&&now?{x:(now.x-old.x)*units,y:(now.y-old.y)*units}:{x:0,y:0};};
  function containsChart(x,y,padding=0){return Math.hypot((x-centre.x)/(boundary.rx/units+padding),(y-centre.y)/(boundary.ry/units+padding))<=1;}
  function containsGlobal(x,y,padding=0){const earth=rows.find(r=>r.id===1).mapPosition;return containsChart(earth.x+x/units,earth.y+y/units,padding/units);}
  const smooth=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
  // Fit the approach into the short gap before the surrounding solar systems.
  const opticalProfile=Object.freeze({rx:64000,ry:48000,supportRx:94000,supportRy:74000,spread:.24});
  const fringeWidth=angle=>opticalProfile.spread*(1+.14*Math.sin(angle*3+.7)+.08*Math.sin(angle*7-1.2));
  function optics(x,y,tint,out={}){
    const dx=(x-centre.x)*units,dy=(y-centre.y)*units,radius=Math.hypot(dx/64000,dy/48000),angle=Math.atan2(dy/48000,dx/64000);
    const distance=radius<=1?radius:1+(radius-1)/fringeWidth(angle);
    out.opacity=(1-smooth((distance-1)/.22))*smooth((1-Math.hypot(dx/94000,dy/74000))/.38);
    const warm=radius<=1?1:1-smooth((distance-1)/.14),a=.5+.5*Math.sin(dx/4600+Math.sin(dy/3900)),b=(.5+.5*Math.sin(dy/5300+Math.sin(dx/6100)))*.8;
    const shade=Math.max(.08,Math.min(1.1,(tint[0]*.3+tint[1]*.5+tint[2]*.2)*3.5));
    const r=(.20+(.66-.20)*a)*(1-b)+.13*b,g=(.46+(.24-.46)*a)*(1-b)+.72*b,blue=(.95+(.90-.95)*a)*(1-b)+.62*b;
    out.r=tint[0]*warm+r*shade*(1-warm);out.g=tint[1]*warm+g*shade*(1-warm);out.b=tint[2]*warm+blue*shade*(1-warm);return out;
  }
  // Use the same complete envelopes as the map, not a list of planet centers.
  // A short margin outside them eases the first stars away after departure.
  let protectedOwner=null,protectedFlight=null,protectedSystems=[];
  function systemStarlight(x,y){
    const owner=window.nativeSystemCatalog,flight=window.nativeManualFlight;
    if(protectedOwner!==owner||protectedFlight!==flight){
      protectedOwner=owner;protectedFlight=flight;const earth=rows.find(r=>r.id===1).mapPosition;
      protectedSystems=(window.nativeManualFlight?.boundaries?.()||[]).filter(r=>r.id!==system).map(r=>({x:earth.x+r.x/units,y:earth.y+r.y/units,rx:r.rx/units,ry:r.ry/units}));
    }
    let visibility=0;
    for(const r of protectedSystems){
      if(Math.abs(x-r.x)>r.rx+3||Math.abs(y-r.y)>r.ry+3)continue;
      const q=Math.hypot((x-r.x)/r.rx,(y-r.y)/r.ry);
      if(q<=1+1e-10)return 1;
      visibility=Math.max(visibility,1-smooth((q-1)*Math.min(r.rx,r.ry)/2));
    }
    return visibility;
  }
  function approach(x,y){
    const dx=(x-centre.x)/64,dy=(y-centre.y)/48,radius=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
    // Only the outskirts vary with direction. The actual navigation border
    // and the approved interior remain the original shared ellipse.
    const fringe=fringeWidth(angle);
    const distance=radius<=1?radius:1+(radius-1)/fringe;
    let stars=smooth((distance-1.62)/.62);
    if(radius>1&&stars<1)stars=Math.max(stars,systemStarlight(x,y));
    return {radius,distance,stars,
      plasma:1-smooth((distance-1)/.22),wisps:1-smooth((distance-1.18)/.30),
      otherWeather:smooth((distance-1.62)/.73)};
  }
  function starlight(id,view={}){
    const p=window.nativeManualFlight?.chartPosition(id)||rows.find(r=>r.id===Number(id))?.mapPosition;if(!p)return 1;
    return approach(p.x+(Number(view.playerX??view.ship?.x??view.cameraX)||0)/units,p.y+(Number(view.playerY??view.ship?.y??view.cameraY)||0)/units).stars;
  }
  function starless(id,view={}){return starlight(id,view)===0;}
  function arrival(heading){const x=-Math.cos(heading),y=-Math.sin(heading),r=1/Math.hypot(x/boundary.rx,y/boundary.ry);return {x:x*(r-180),y:y*(r-180)};}
  function reconcile(state){
    if(!state||state.badlandsRegionVersion>=version)return state;
    const seen=new Set();
    const journey=j=>{
      if(!j||seen.has(j))return;seen.add(j);
      const a=delta(j.origin),b=delta(j.destination),old=j.waypoints||[j.galaxyFrom,j.galaxyTo];
      if(!old.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return;
      const lengths=[0];for(let i=1;i<old.length;i++)lengths[i]=lengths[i-1]+Math.hypot(old[i].x-old[i-1].x,old[i].y-old[i-1].y);
      const total=lengths.at(-1)||1,points=old.map((p,i)=>{const t=lengths[i]/total;return {...p,x:p.x+a.x*(1-t)+b.x*t,y:p.y+a.y*(1-t)+b.y*t};});
      j.galaxyFrom={...points[0]};j.galaxyTo={...points.at(-1)};if(j.waypoints)j.waypoints=points;
      j.distance=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
      // Existing funded trips retain their paid terms, progress and deadlines.
      if(j.duration>0)j.speed=j.distance/j.duration;
    };
    for(const ship of [...(state.civilianTraffic?.ships||[]),...(state.solEconomy?.freighters||[])]){
      journey(ship.journey);journey(ship.travelResume?.journey);journey(ship.combatInterruption?.journey);
    }
    if(state.system===system){
      state.landed=false;if(state.localBody===900)state.localBody=0;if(state.localNavTarget===900)state.localNavTarget=0;if(state.localCruise?.to===900)state.localCruise=null;
      for(const report of [state.pendingTransit?.report,state.lastJourney])if(report?.systemId===system&&report.destinationBodyId===900){report.destinationBodyId=0;report.destinationName='Badlands perimeter';}
      if(state.pendingTransit?.report?.systemId===system){
        const angle=Number.isFinite(state.pendingTransit.report.courseAngle)?state.pendingTransit.report.courseAngle-Math.PI/2:Number(state.angle)||0;
        Object.assign(state,arrival(angle),{speed:0,vx:0,vy:0,localCruise:null});delete state.arrivalApproach;
      }
    }
    state.badlandsRegionVersion=version;return state;
  }
  window.nativeBadlands=Object.freeze({version,system,centre:Object.freeze(centre),boundary,fog,arrival,containsChart,containsGlobal,approach,fringeWidth,optics,opticalProfile,starlight,starless,reconcile,previousChart:id=>oldPositions.get(Number(id)),
    moved:()=>[...movable].map(id=>({id,from:oldPositions.get(id),to:rows.find(r=>r.id===id).mapPosition}))});
})();
