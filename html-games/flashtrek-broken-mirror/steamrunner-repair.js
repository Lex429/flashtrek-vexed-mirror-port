/* Showcase-only hull reconstruction. Progress follows simulation time;
   painting never advances repairs or changes the ship's health. */
(() => {
  'use strict';
  const surface=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const clamp=n=>Math.max(0,Math.min(1,n));
  const regionNames=['PORT NACELLE','STARBOARD NACELLE','STARBOARD HULL','PORT HULL','CENTRAL SYSTEMS'];
  const mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>t*t*t*(t*(t*6-15)+10);
  const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  const tiers=window.repairDroneFleet.tiers;
  function plan(regions,owned={basic:1,upgraded:0,advanced:0},damageScale=1,{launchDelay=0}={}){
    const drones=[];
    for(const tier of [...tiers].reverse())for(let n=0;n<Math.max(0,Math.min(8,Math.floor(owned[tier.id]||0)))&&drones.length<8;n++){
      const id=drones.length,launch=Math.max(0,launchDelay)+id*240,approach=2250/tier.travel,start=launch+approach+300;
      drones.push({id,tier:tier.id,rate:tier.rate,travel:tier.travel,health:tier.health,maxHealth:tier.health,launch,approach,start,available:start,jobs:[],cursor:0,bursts:0});
    }
    if(!drones.length)return {drones:[],weldEnd:0,duration:50,jobs:0};
    const chunks=regions.map((cells,region)=>Array.from({length:Math.ceil(cells.length/80)},(_,i)=>({region,cells:cells.slice(i*80,(i+1)*80)})));
    const queue=[];
    for(let i=0;i<Math.max(0,...chunks.map(c=>c.length));i++)for(const region of chunks)if(region[i])queue.push(region[i]);
    for(const [id,part] of queue.entries()){
      // A breach has exactly one owner. New drones work on other sections;
      // the last unclaimed section cannot be accelerated by duplicating it.
      const drone=drones.reduce((best,d)=>d.available+part.cells.length/(60*d.rate)*1000*damageScale<best.available+part.cells.length/(60*best.rate)*1000*damageScale?d:best);
      const start=drone.available,end=start+part.cells.length/(60*drone.rate)*1000*damageScale;
      const job={...part,id,droneId:drone.id,start,end,cursor:0,nextBurst:start+35};
      drone.jobs.push(job);drone.available=end+300/drone.travel;
    }
    for(const drone of drones){
      drone.start=drone.jobs[0]?.start??drone.start;
      drone.end=drone.jobs.at(-1)?.end??0;
      drone.returnAt=drone.end+450;drone.returnFlight=2400/drone.travel;drone.dockAt=drone.returnAt+drone.returnFlight;
    }
    const active=drones.filter(d=>d.jobs.length);
    return {drones:active,weldEnd:Math.max(0,...active.map(d=>d.end)),duration:Math.max(0,...active.map(d=>d.dockAt))+50,jobs:queue.length};
  }
  function drawDrone(ctx,d,time=0){
    if(window.droneSprites?.draw(ctx,d.tier,{role:d.role||'repair',health:d.health??100,maxHealth:d.maxHealth??100,time,lights:d.lights!==false,effects:d.effects!==false,thrust:d.thrust||0,activity:d.phase==='welding'?1:d.weaponFlash||0,barrel:d.firedBarrel||0})){
      if(d.thrust&&d.lights!==false&&(d.health??100)>0){
        ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=d.role==='attack'?'#ffb16a':'#8defff';ctx.shadowColor=d.role==='attack'?'#ff5930':'#54bbff';ctx.shadowBlur=5;
        const jet=d.braking?1:-1,length=4+8*d.thrust;
        for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(jet*12,side*5-1.5);ctx.lineTo(jet*(12+length),side*5);ctx.lineTo(jet*12,side*5+1.5);ctx.fill();}ctx.restore();
      }
      return;
    }
    const upgraded=d.tier!=='basic',advanced=d.tier==='advanced',size=advanced?1.22:upgraded?1.1:.85;
    const palette=({repair:['#244b36','#9cddb1','#78ffa9'],attack:['#592a31','#efa1a5','#ff6c64'],defense:['#243f65','#a0cfff','#71caff']})[d.role||'repair'];
    ctx.save();ctx.scale(size,size);ctx.lineWidth=.8;
    ctx.fillStyle=palette[0];ctx.strokeStyle=palette[1];
    ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(1,-4);ctx.lineTo(-6,-5);ctx.lineTo(-7,5);ctx.lineTo(1,4);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=palette[2];ctx.fillRect(-3,-2,5,4);
    if(upgraded){
      ctx.fillStyle=palette[0];ctx.fillRect(-5,-8,7,4);ctx.fillRect(-5,4,7,4);
      ctx.strokeStyle=palette[1];ctx.lineWidth=1.3;
      for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(0,side*5);ctx.lineTo(5,side*7);ctx.lineTo(11,side*(advanced?4:2));ctx.stroke();}
      if(!advanced){ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(12,0);ctx.stroke();}
    }else{ctx.fillStyle=palette[0];ctx.fillRect(-4,-7,3,3);ctx.fillRect(-4,4,3,3);}
    if(advanced){
      ctx.strokeStyle=palette[2];ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-8,-7);ctx.lineTo(-10,-10);ctx.lineTo(3,-10);ctx.moveTo(-8,7);ctx.lineTo(-10,10);ctx.lineTo(3,10);ctx.stroke();
      ctx.fillStyle=palette[2];ctx.fillRect(9,-5,4,2);ctx.fillRect(9,3,4,2);
    }else{ctx.fillStyle=palette[2];ctx.fillRect(upgraded?10:5,-1,upgraded?3:4,2);}
    if(d.thrust){
      const length=(3+8*d.thrust)*(1+Math.sin(time*.09+(Number(d.id)||0))*.12),jet=d.braking?1:-1;
      ctx.globalCompositeOperation='lighter';ctx.fillStyle=palette[2];ctx.shadowColor=palette[2];ctx.shadowBlur=5;
      ctx.beginPath();ctx.moveTo(jet*7,-2);ctx.lineTo(jet*(7+length),0);ctx.lineTo(jet*7,2);ctx.fill();
    }
    ctx.restore();
  }
  function create(damaged,intact,born,initialGeometry){
    const w=intact.width,h=intact.height,tile=12;
    const body=surface(w,h),mask=surface(w,h),paint=surface(w,h),patch=surface(w,h);
    const reflection=surface(w,h),light=reflection.getContext('2d');
    const g=body.getContext('2d'),m=mask.getContext('2d'),brush=paint.getContext('2d'),p=patch.getContext('2d');
    g.drawImage(damaged,0,0,w,h);const before=g.getImageData(0,0,w,h).data;
    g.clearRect(0,0,w,h);g.drawImage(intact,0,0);const after=g.getImageData(0,0,w,h).data;
    const delta=m.createImageData(w,h),groups=Array.from({length:5},()=>new Map());
    let changedPixels=0,missingPixels=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      if(!before[i+3]&&!after[i+3])continue;
      if(![0,1,2,3].some(c=>before[i+c]!==after[i+c]))continue;
      delta.data.set([255,255,255,255],i);changedPixels++;
      if(before[i+3]<40&&after[i+3]>100)missingPixels++;
      const region=y>h*.47&&x<w*.29?0:y>h*.47&&x>w*.71?1:y<h*.48?(x>w*.5?2:3):4;
      const col=Math.floor(x/tile),row=Math.floor(y/tile),key=row*Math.ceil(w/tile)+col;
      let cell=groups[region].get(key);
      if(!cell){cell={col,row,x:0,y:0,count:0,region};groups[region].set(key,cell);}
      cell.x+=x;cell.y+=y;cell.count++;
    }
    m.putImageData(delta,0,0);
    // Integrity above the first painted damage threshold still needs a short
    // maintenance pass. Its artwork remains intact while actual hull recovers.
    if(groups.every(group=>group.size===0)&&initialGeometry?.damageScale>0){
      for(let y=20;y<h;y+=24)for(let x=20;x<w;x+=24)if(after[(y*w+x)*4+3]>150){
        const col=Math.floor(x/tile),row=Math.floor(y/tile),region=x<w*.5?0:1;
        groups[region].set(row*Math.ceil(w/tile)+col,{col,row,x,y,count:1,region});
      }
    }
    const score=(x,y)=>{
      x=Math.max(0,Math.min(w-1,Math.round(x)));y=Math.max(0,Math.min(h-1,Math.round(y)));
      const i=(y*w+x)*4;
      return Math.abs(before[i+3]-after[i+3])+Math.abs(before[i]-after[i])*.3+Math.abs(before[i+1]-after[i+1])*.5+Math.abs(before[i+2]-after[i+2])*.2;
    };
    const regions=groups.map(group=>[...group.values()].sort((a,b)=>a.row-b.row||(a.row%2?b.col-a.col:a.col-b.col)).map(cell=>{
      const x=cell.x/cell.count,y=cell.y/cell.count;
      let nx=score(x+6,y)-score(x-6,y),ny=score(x,y+6)-score(x,y-6);
      if(Math.hypot(nx,ny)<8){nx=x/w-.5;ny=y/h-.5;}
      const length=Math.hypot(nx,ny)||1;
      return {...cell,x,y,nx:nx/length,ny:ny/length};
    }));
    const damageScale=Math.max(.02,Math.min(1.2,initialGeometry?.damageScale??1));
    const mission=plan(regions,initialGeometry?.fleet,damageScale,{launchDelay:initialGeometry?.launchDelay||0}),{drones}=mission;
    let {duration,weldEnd}=mission;
    const totalCells=regions.reduce((n,cells)=>n+cells.length,0),completedCells=new Set();
    const damageEffects=window.dotBasicDamage?.createEffects(),destruction=window.droneShowcase?.createDestruction();
    let nextJobId=mission.jobs,progress=0,elapsed=0,finished=false,sparks=[],wrecks=[],impacts=[],recalling=false,outcome='repairing',threats=[];
    let geometry=initialGeometry||{layout:{x:540,y:253,w:275,h:353},angle:0,source:{centerX:135,centerY:425,w:58,h:88,a:1.17,shipId:6}};
    const sample=(drone,at=elapsed)=>{
      const job=drone.jobs.find(j=>at<j.end)||drone.jobs.at(-1);
      const fraction=job?clamp((at-job.start)/(job.end-job.start)):0;
      return job?.cells[Math.min(job.cells.length-1,Math.max(0,Math.floor(fraction*job.cells.length)-1))]||{x:w/2,y:h/2,nx:0,ny:-1,region:4};
    };
    const point=(x,y,l,angle)=>{
      const dx=(x/w-.5)*l.w,dy=(y/h-.5)*l.h,c=Math.cos(angle),s=Math.sin(angle);
      return {x:l.x+dx*c-dy*s,y:l.y+dx*s+dy*c};
    };
    const hangar=source=>({
      x:source.centerX+source.w*.08*Math.cos(source.a)-source.h*.07*Math.sin(source.a),
      y:source.centerY+source.w*.08*Math.sin(source.a)+source.h*.07*Math.cos(source.a)
    });
    function pose(drone,l,angle,source,at=elapsed){
      if(drone.dead)return {id:drone.id,tier:drone.tier,phase:'destroyed',position:drone.deathPoint,hit:drone.deathPoint,nozzle:drone.deathPoint,normal:{x:0,y:-1},target:sample(drone,at),visible:false};
      const target=sample(drone,Math.min(at,drone.returnAt)),hit=point(target.x,target.y,l,angle);
      const slot=[Math.PI,0,-2.35,-.79,2.35,.79,-Math.PI/2,Math.PI/2][drone.id];
      const station=point(w*(.5+Math.cos(slot)*.74),h*(.5+Math.sin(slot)*.65),l,angle);
      const home=hangar(source),back=drone.returnAt,job=drone.jobs.find(j=>at>=j.start&&at<j.end);
      let phase=at<drone.launch?'waiting':at<drone.launch+drone.approach?'approach':at<drone.start?'stabilizing':job?'welding':at<drone.end?'relocating':at<back?'holding':at<drone.dockAt?'returning':'docked';
      let position=station,heading=Math.atan2(hit.y-station.y,hit.x-station.x),thrust=0,braking=false;
      if(phase==='approach'||phase==='returning'||phase==='waiting'||phase==='docked'){
        const returning=phase==='returning'||phase==='docked';
        const fraction=phase==='waiting'?0:phase==='docked'?1:clamp((at-(returning?back:drone.launch))/(returning?drone.returnFlight:drone.approach));
        const t=returning?1-smooth(fraction):smooth(fraction),v=1-t;
        const bow={x:home.x+Math.sin(source.a)*75,y:home.y-Math.cos(source.a)*75};
        const right=Math.cos(slot)>0;
        const c1=right?{x:home.x+110,y:Math.min(510,l.y+l.h*.72)}:bow;
        const c2=right?{x:station.x+65,y:Math.min(510,l.y+l.h*.72)}:{x:station.x-65,y:station.y+30};
        position={x:v*v*v*home.x+3*v*v*t*c1.x+3*v*t*t*c2.x+t*t*t*station.x,
          y:v*v*v*home.y+3*v*v*t*c1.y+3*v*t*t*c2.y+t*t*t*station.y};
        const dx=3*v*v*(c1.x-home.x)+6*v*t*(c2.x-c1.x)+3*t*t*(station.x-c2.x);
        const dy=3*v*v*(c1.y-home.y)+6*v*t*(c2.y-c1.y)+3*t*t*(station.y-c2.y);
        heading=Math.atan2(dy,dx)+(returning?Math.PI:0);
        thrust=fraction<.28?1:fraction>.76?.7:.14;
        braking=fraction>.76;
      }
      if(drone.returnPath&&at>=drone.returnPath.at){
        const path=drone.returnPath,q=clamp((at-path.at)/path.duration),t=smooth(q),v=1-t;
        const c1={x:path.from.x-30,y:Math.min(505,path.from.y+60)},c2={x:home.x+Math.sin(source.a)*60,y:home.y-Math.cos(source.a)*60};
        position={x:v*v*v*path.from.x+3*v*v*t*c1.x+3*v*t*t*c2.x+t*t*t*home.x,y:v*v*v*path.from.y+3*v*v*t*c1.y+3*v*t*t*c2.y+t*t*t*home.y};
        heading=Math.atan2(home.y-position.y,home.x-position.x);phase=q>=1?'docked':'returning';thrust=q<.25?1:q>.75?.6:.1;braking=q>.75;
      }
      if(drone.diversion&&at>=drone.diversion.at&&at<drone.diversion.end){
        const q=smooth(clamp((at-drone.diversion.at)/(drone.diversion.end-drone.diversion.at)));
        position={x:mix(drone.diversion.from.x,station.x,q),y:mix(drone.diversion.from.y,station.y,q)};
        heading=Math.atan2(station.y-drone.diversion.from.y,station.x-drone.diversion.from.x);phase='diverting';thrust=.6;
      }
      if(['welding','relocating','stabilizing','holding'].includes(phase)&&drone.evasion){
        position={x:position.x+drone.evasion.x,y:position.y+drone.evasion.y};heading=Math.atan2(hit.y-position.y,hit.x-position.x);
      }
      const normal={x:target.nx*Math.cos(angle)-target.ny*Math.sin(angle),y:target.nx*Math.sin(angle)+target.ny*Math.cos(angle)};
      const reach=drone.tier==='advanced'?15.8:drone.tier==='upgraded'?12:7.65;
      const tool=window.dotSprites?.nozzle(drone.tier)||{x:reach,y:0},c=Math.cos(heading),s=Math.sin(heading);
      return {id:drone.id,role:'repair',tier:drone.tier,phase,position,heading,hit,normal,target,thrust,braking,visible:phase!=='waiting'&&phase!=='docked',
        nozzle:{x:position.x+tool.x*c-tool.y*s,y:position.y+tool.x*s+tool.y*c}};
    }
    const compose=()=>{
      // Remove the old material before inserting the new pixels. This also
      // replaces the ragged silhouette rather than ghosting two hulls together.
      p.clearRect(0,0,w,h);p.globalCompositeOperation='source-over';p.drawImage(paint,0,0);
      p.globalCompositeOperation='destination-in';p.drawImage(mask,0,0);p.globalCompositeOperation='source-over';
      g.clearRect(0,0,w,h);g.globalCompositeOperation='source-over';g.drawImage(damaged,0,0,w,h);
      g.globalCompositeOperation='destination-out';g.drawImage(patch,0,0);
      p.globalCompositeOperation='source-in';p.drawImage(intact,0,0);p.globalCompositeOperation='source-over';
      g.globalCompositeOperation='source-over';g.drawImage(patch,0,0);
    };
    function clipRegion(region){
      const left=Math.ceil(w*.29),right=Math.floor(w*.71)+1,middle=Math.floor(w*.5)+1,upper=Math.floor(h*.47)+1,lower=Math.ceil(h*.48);
      brush.beginPath();
      if(region===0)brush.rect(0,upper,left,h-upper);
      else if(region===1)brush.rect(right,upper,w-right,h-upper);
      else if(region===2){brush.rect(middle,0,w-middle,upper);brush.rect(middle,upper,right-middle,lower-upper);}
      else if(region===3){brush.rect(0,0,middle,upper);brush.rect(left,upper,middle-left,lower-upper);}
      else brush.rect(left,lower,right-left,h-lower);
      brush.clip();
    }
    function advance(time,nextGeometry){
      if(nextGeometry)geometry=nextGeometry;
      const previous=elapsed;elapsed=Math.max(elapsed,time-born);
      const blend=1-Math.exp(-(elapsed-previous)/240);
      for(const d of drones){
        const p=pose(d,geometry.layout,geometry.angle,geometry.source).position;let x=0,y=0;
        for(const threat of threats){const dx=p.x-threat.x,dy=p.y-threat.y,dist=Math.hypot(dx,dy)||1;if(dist<160){x+=dx/dist*(1-dist/160)*32;y+=dy/dist*(1-dist/160)*32;}}
        const scale=Math.min(1,28/(Math.hypot(x,y)||1));d.evasion={x:mix(d.evasion?.x||0,x*scale,blend),y:mix(d.evasion?.y||0,y*scale,blend)};
      }
      let changed=false;
      brush.fillStyle='white';brush.strokeStyle='white';brush.lineWidth=tile*2.6;brush.lineCap='round';
      for(const drone of drones){
        if(drone.dead||recalling)continue;
        for(const job of drone.jobs){
        if(job.cancelled)continue;
        const limit=Math.min(job.cells.length,Math.floor(clamp((elapsed-job.start)/(job.end-job.start))*job.cells.length));
        for(;job.cursor<limit;job.cursor++){
          const next=job.cells[job.cursor];
          // Clip to this job's tile: another drone's reserved section must
          // remain damaged until its own welding tool gets there.
          brush.save();brush.beginPath();brush.rect(next.col*tile,next.row*tile,tile,tile);brush.clip();clipRegion(next.region);
          brush.beginPath();brush.arc(next.x,next.y,tile*1.5,0,Math.PI*2);brush.fill();brush.restore();drone.cursor++;completedCells.add(`${next.region}:${next.row*Math.ceil(w/tile)+next.col}`);changed=true;
        }
        while(job.nextBurst<=Math.min(elapsed,job.end-1)){
          const at=job.nextBurst,seed=drone.id*10000+drone.bursts*31;
          drone.bursts++;job.nextBurst+=55+noise(seed+1)*70;
          // Expired catch-up events need no particles. No gravity, drag or
          // attraction: each hot metal fragment keeps its launch momentum.
          if(elapsed-at>950)continue;
          const contact=pose(drone,geometry.layout,geometry.angle,geometry.source,at);
          const baseAngle=Math.atan2(contact.normal.y,contact.normal.x),scale=geometry.layout.h/353;
          const count=7+Math.floor(noise(seed+2)*7);
          for(let i=0;i<count;i++){
            const key=seed+i*13,droplet=i===0&&drone.bursts%4===0;
            const a=baseAngle+(noise(key+3)-.5)*2.65;
            const speed=(droplet?25+noise(key+4)*48:50+noise(key+4)*145)*scale;
            sparks.push({droneId:drone.id,born:born+at,ttl:droplet?650+noise(key+5)*260:170+noise(key+5)*350,
              x:contact.hit.x,y:contact.hit.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,droplet,size:droplet?1.5:mix(.85,1.4,noise(key+6)),
              normal:contact.normal});
          }
        }
        }
      }
      sparks=sparks.filter(s=>time-s.born<s.ttl);
      wrecks=wrecks.filter(p=>time-p.born<p.ttl);impacts=impacts.filter(p=>time-p.born<p.ttl);damageEffects?.update(time);destruction?.advance(time);
      progress=totalCells?completedCells.size/totalCells:1;
      if(changed)compose();
      if(progress===1&&!finished){finished=true;outcome='complete';g.clearRect(0,0,w,h);g.drawImage(intact,0,0);}
      return elapsed>=duration;
    }
    function cutJobs(drone){
      const remaining=[];
      for(const job of drone.jobs){
        if(job.cursor<job.cells.length)remaining.push({region:job.region,cells:job.cells.slice(job.cursor)});
      }
      drone.jobs=drone.jobs.filter(j=>j.cursor>0).map(j=>({...j,cells:j.cells.slice(0,j.cursor),end:Math.min(j.end,elapsed),cancelled:true}));
      return remaining;
    }
    function hit(id,amount,time){
      advance(time);
      const drone=drones.find(d=>d.id===id),p=drone&&pose(drone,geometry.layout,geometry.angle,geometry.source);
      if(!drone||!p.visible||!Number.isFinite(amount)||amount<=0)return {hit:false};
      const before=window.dotSprites?.stage(drone.health,drone.maxHealth)??0,damage=Math.min(drone.health,amount);drone.health-=damage;
      damageEffects?.emit({tier:drone.tier,role:'repair',before,after:drone.health?(window.dotSprites?.stage(drone.health,drone.maxHealth)??0):3,position:p.position,heading:p.heading,scale:1,time,sourceId:drone.id,impact:p.position});
      impacts.push({x:p.position.x,y:p.position.y,born:time,ttl:drone.health?180:420,destroyed:!drone.health});
      if(drone.health)return {hit:true,damage,health:drone.health,destroyed:false,tier:drone.tier};
      drone.dead=true;drone.deathPoint={...p.position};drone.diedAt=elapsed;
      const shipBlast=destruction?.emit({tier:drone.tier,role:'repair',position:p.position,heading:p.heading,scale:1,time});
      if(shipBlast)initialGeometry?.onExplosion?.({born:time,zoom:.35});
      const armor=window.dotSprites?.fragments(drone.tier)||[];
      for(let i=0;!shipBlast&&i<(armor.length||12);i++){
        const a=i*2.399+noise(id+time)*Math.PI*2,speed=25+noise(i+time)*65;
        const part=armor[i],c=Math.cos(p.heading),s=Math.sin(p.heading);
        wrecks.push({x:p.position.x+(part?part.x*c-part.y*s:0),y:p.position.y+(part?part.x*s+part.y*c:0),vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,angle:part?p.heading+Math.PI/2:a,spin:(noise(i+id)-.5)*7,born:time,ttl:1000+noise(i+8)*1400,size:i<4?3.2:1.6,texture:part?.texture,width:part?.width,height:part?.height});
      }
      const orphans=cutJobs(drone),survivors=drones.filter(d=>!d.dead);
      initialGeometry?.onDestroyed?.(drone.tier,id);
      if(!recalling&&survivors.length){
        for(const d of survivors){
          const current=pose(d,geometry.layout,geometry.angle,geometry.source);
          if(d.end<elapsed){d.diversion={from:{...current.position},at:elapsed,end:elapsed+700/d.travel};delete d.returnPath;}
          d.available=Math.max(d.jobs.at(-1)?.end??0,elapsed+(d.diversion?700:250)/d.travel)+300/d.travel;
        }
        for(const part of orphans){
          const receiver=survivors.reduce((best,d)=>d.available+part.cells.length/(60*d.rate)*1000*damageScale<best.available+part.cells.length/(60*best.rate)*1000*damageScale?d:best);
          const start=receiver.available,end=start+part.cells.length/(60*receiver.rate)*1000*damageScale;
          receiver.jobs.push({...part,id:nextJobId++,droneId:receiver.id,start,end,cursor:0,nextBurst:start+35});receiver.available=end+300/receiver.travel;
        }
        for(const d of survivors){d.end=d.jobs.at(-1)?.end??elapsed;d.returnAt=d.end+450;d.dockAt=d.returnAt+d.returnFlight;}
        weldEnd=Math.max(...survivors.map(d=>d.end));duration=Math.max(...survivors.map(d=>d.dockAt))+50;
      }else if(!survivors.length){outcome=finished?'complete':'failed';duration=elapsed+1500;}
      else duration=Math.max(elapsed+450,...survivors.map(d=>d.dockAt))+50;
      return {hit:true,damage,health:0,destroyed:true,tier:drone.tier,reassigned:survivors.length>0&&!recalling,allLost:survivors.length===0};
    }
    function recall(time){
      advance(time);if(recalling)return false;
      recalling=true;outcome=finished?'complete':'recalled';
      for(const d of drones){
        if(d.dead)continue;
        const current=pose(d,geometry.layout,geometry.angle,geometry.source);cutJobs(d);
        const home=hangar(geometry.source),distance=Math.hypot(current.position.x-home.x,current.position.y-home.y);
        const travel=current.visible?Math.max(250,Math.min(d.returnFlight,distance*7/d.travel)):0;
        d.returnPath={from:{...current.position},at:elapsed,duration:Math.max(1,travel)};d.end=elapsed;d.returnAt=elapsed;d.dockAt=elapsed+travel;
      }
      duration=Math.max(elapsed,...drones.filter(d=>!d.dead).map(d=>d.dockAt))+50;return true;
    }
    function target(id){
      const drone=drones.find(d=>d.id===id);if(!drone)return null;
      const p=pose(drone,geometry.layout,geometry.angle,geometry.source);
      return p.visible?{id,role:'repair',tier:drone.tier,health:drone.health,maxHealth:drone.maxHealth,position:{...p.position}}:null;
    }
    function drawBody(ctx,l,angle){
      const texture=finished?intact:drones.every(d=>d.cursor===0)?damaged:body;
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(angle);ctx.drawImage(texture,-l.w/2,-l.h/2,l.w,l.h);ctx.restore();
    }
    function drawBeam(ctx,l,angle,time,source=geometry.source,selectedId=-1,options={}){
      light.clearRect(0,0,w,h);light.globalCompositeOperation='source-over';
      for(const drone of drones){
        const d=pose(drone,l,angle,source);if(d.phase!=='welding')continue;
        const glow=light.createRadialGradient(d.target.x,d.target.y,0,d.target.x,d.target.y,42);
        glow.addColorStop(0,'#efffffdd');glow.addColorStop(.25,'#b2dcff77');glow.addColorStop(.6,'#5acfff25');glow.addColorStop(1,'#5acfff00');
        light.fillStyle=glow;light.fillRect(d.target.x-42,d.target.y-42,84,84);
      }
      light.globalCompositeOperation='destination-in';light.drawImage(finished?intact:drones.every(d=>d.cursor===0)?damaged:body,0,0,w,h);light.globalCompositeOperation='source-over';
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(l.x,l.y);ctx.rotate(angle);ctx.drawImage(reflection,-l.w/2,-l.h/2,l.w,l.h);ctx.restore();
      for(const drone of drones){
        const d=pose(drone,l,angle,source);if(!d.visible)continue;
        ctx.save();ctx.translate(d.position.x,d.position.y);ctx.rotate(d.heading);
        drawDrone(ctx,{...d,health:drone.health,maxHealth:drone.maxHealth,lights:options.lights,effects:options.damage},time);
        ctx.restore();
        ctx.save();ctx.fillStyle='#10212b';ctx.fillRect(d.position.x-11,d.position.y+25,22,2);
        ctx.fillStyle=drone.health/drone.maxHealth<.4?'#ff704a':'#88dfb0';ctx.fillRect(d.position.x-11,d.position.y+25,22*drone.health/drone.maxHealth,2);
        if(drone.id===selectedId){ctx.strokeStyle='#ff967d';ctx.lineWidth=1;ctx.strokeRect(d.position.x-28,d.position.y-28,60,58);}
        ctx.restore();
        if(d.phase!=='welding')continue;
        const pulse=.84+Math.sin(time*.039+drone.id)*.08+Math.sin(time*.093)*.08;
        ctx.save();ctx.globalCompositeOperation='lighter';
        const nx=-Math.sin(d.heading),ny=Math.cos(d.heading),twin=d.tier==='advanced';
        for(const [width,color,alpha] of [[7,'#26ed77',.08],[3,'#42ff95',.25],[.9,'#a6ffcb',.95]]){
          ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha*pulse;
          ctx.beginPath();ctx.moveTo(d.nozzle.x-(twin?nx*5:0),d.nozzle.y-(twin?ny*5:0));ctx.lineTo(d.hit.x-(twin?nx*1.8:0),d.hit.y-(twin?ny*1.8:0));ctx.stroke();
          if(twin){
            ctx.beginPath();ctx.moveTo(d.nozzle.x+nx*5,d.nozzle.y+ny*5);ctx.lineTo(d.hit.x+nx*1.8,d.hit.y+ny*1.8);ctx.stroke();
          }
        }
        const brightness=.75+noise(Math.floor(time/32)+drone.id)*.25;
        const glow=ctx.createRadialGradient(d.hit.x,d.hit.y,0,d.hit.x,d.hit.y,23);
        glow.addColorStop(0,'#ffffff');glow.addColorStop(.12,'#eaffff');glow.addColorStop(.27,'#c3dfffbb');glow.addColorStop(.58,'#80c8ff44');glow.addColorStop(1,'#63baff00');
        ctx.globalAlpha=brightness;ctx.fillStyle=glow;ctx.fillRect(d.hit.x-23,d.hit.y-23,46,46);
        ctx.strokeStyle='#e8ffff';ctx.lineWidth=.8;ctx.globalAlpha=brightness*.7;
        ctx.beginPath();ctx.moveTo(d.hit.x-9,d.hit.y);ctx.lineTo(d.hit.x+9,d.hit.y);ctx.moveTo(d.hit.x,d.hit.y-6);ctx.lineTo(d.hit.x,d.hit.y+6);ctx.stroke();
        ctx.globalAlpha=1;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(d.hit.x,d.hit.y,2.1,0,Math.PI*2);ctx.fill();ctx.restore();
      }
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
      for(const spark of sparks){
        const age=(time-spark.born)/1000,q=clamp(age*1000/spark.ttl);
        if(age<0||q>=1)continue;
        const x=spark.x+spark.vx*age,y=spark.y+spark.vy*age;
        const color=q<.18?'#fffbea':q<.42?'#ffe89b':q<.72?'#ff9b36':'#dc3b16';
        ctx.globalAlpha=clamp((1-q)*2);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=spark.size*(1-q*.35);
        if(spark.droplet){ctx.beginPath();ctx.arc(x,y,spark.size*(1-q*.45),0,Math.PI*2);ctx.fill();}
        else{ctx.beginPath();ctx.moveTo(x-spark.vx*.028,y-spark.vy*.028);ctx.lineTo(x,y);ctx.stroke();}
      }
      for(const piece of wrecks){
        const age=(time-piece.born)/1000,q=age*1000/piece.ttl;if(q<0||q>=1)continue;
        ctx.save();ctx.globalAlpha=1-q;ctx.translate(piece.x+piece.vx*age,piece.y+piece.vy*age);ctx.rotate(piece.angle+piece.spin*age);
        if(piece.texture){ctx.globalCompositeOperation='source-over';if(!window.wreckageEffects?.draw(ctx,piece.texture,piece.width,piece.height,time-piece.born))ctx.drawImage(piece.texture,-piece.width/2,-piece.height/2,piece.width,piece.height);}
        else{ctx.fillStyle=q<.15?'#ffe2ad':q<.45?'#9da4a4':'#596471';ctx.fillRect(-piece.size/2,-piece.size/2,piece.size,piece.size*.6);}ctx.restore();
      }
      for(const impact of impacts){
        const q=(time-impact.born)/impact.ttl;if(q<0||q>=1)continue;
        const radius=(impact.destroyed?21:10)*(1+q*.5),flash=ctx.createRadialGradient(impact.x,impact.y,0,impact.x,impact.y,radius);
        flash.addColorStop(0,'#fff4da');flash.addColorStop(.18,'#ffd293');flash.addColorStop(.45,'#ff802a99');flash.addColorStop(1,'#ff502000');
        ctx.globalAlpha=1-q;ctx.fillStyle=flash;ctx.fillRect(impact.x-radius,impact.y-radius,radius*2,radius*2);
      }
      ctx.restore();
      damageEffects?.draw(ctx,time);destruction?.draw(ctx,time);
      const caption=outcome==='failed'?'REPAIRS HALTED / FLEET LOST':recalling?'DOT’S RECALLED / REPAIRS STOPPED':finished?'DOT’S RETURNING / HULL SEALED':elapsed<Math.min(...drones.map(d=>d.start))?'DOT’S LAUNCHING / APPROACH':`${drones.filter(d=>pose(d,l,angle,source).phase==='welding').length} DOT’S WELDING / HULL RECONSTRUCTION`;
      ctx.save();ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillStyle='#94edb6';
      ctx.fillText(`${caption}  /  ${Math.round(progress*100)}%`,l.x,443);
      ctx.fillStyle='#18392c';ctx.fillRect(l.x-95,452,190,3);ctx.fillStyle='#61efa0';ctx.fillRect(l.x-95,452,190*progress,3);ctx.restore();
    }
    g.clearRect(0,0,w,h);g.drawImage(damaged,0,0,w,h);
    return {advance,advanceEffects:time=>{damageEffects?.update(time);destruction?.advance(time);},drawBody,drawBeam,hit,recall,target,deploymentTargets:()=>drones.filter(d=>!d.dead).map(d=>({id:d.id,role:'repair',position:{...pose(d,geometry.layout,geometry.angle,geometry.source,d.start).position}})),setThreats:positions=>{threats=positions.slice(0,8).map(p=>({...p}));},frame:()=>finished?intact:drones.every(d=>d.cursor===0)?damaged:body,snapshot:()=>{
      const poses=drones.map(drone=>pose(drone,geometry.layout,geometry.angle,geometry.source));
      const target=poses[0]?.target||{x:w/2,y:h/2,region:4};
      return {progress,elapsed,duration,weldEnd,firstWeldAt:born+Math.min(...drones.map(d=>d.start)),changedPixels,missingPixels,recalling,outcome,phase:outcome==='failed'?'failed':recalling?'recalling':finished?'returning':elapsed<Math.min(...drones.map(d=>d.start))?'deploying':'welding',
        supportShip:geometry.source.shipId,hangar:hangar(geometry.source),region:regionNames[target.region],target:{x:target.x/w-.5,y:target.y/h-.5},
        cursor:completedCells.size,steps:totalCells,
        jobs:drones.flatMap(d=>d.jobs.map(j=>({id:j.id,droneId:d.id,region:j.region,start:j.start,end:j.end,cells:j.cells.length,completed:j.cursor}))),
        drones:poses.map((d,i)=>({id:d.id,role:'repair',tier:d.tier,health:drones[i].health,maxHealth:drones[i].maxHealth,damageStage:window.dotSprites?.stage(drones[i].health,drones[i].maxHealth)??0,powered:drones[i].health>0,launch:drones[i].launch,start:drones[i].start,phase:d.phase,position:d.position,hit:d.hit,nozzle:d.nozzle,normal:d.normal,evading:Math.hypot(drones[i].evasion?.x||0,drones[i].evasion?.y||0)>2})),destruction:destruction?.snapshot()||null,damageEffects:damageEffects?.snapshot()||null,sparkCount:sparks.length,wreckCount:wrecks.length+(destruction?.snapshot().wreckCount||0),texturedWreckCount:wrecks.filter(p=>p.texture).length+(destruction?.snapshot().wreckCount||0),
        sparks:sparks.slice(0,12).map(s=>({...s,age:born+elapsed-s.born,position:{x:s.x+s.vx*(born+elapsed-s.born)/1000,y:s.y+s.vy*(born+elapsed-s.born)/1000}}))};
    }};
  }
  window.steamrunnerRepair={create,plan,drawDrone};
})();
