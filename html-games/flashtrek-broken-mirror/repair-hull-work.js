/* Shared damage-site analysis and repair tools. Simulation owns progress/time. */
(() => {
  'use strict';
  const clamp = n => Math.max(0, Math.min(1, n));
  const noise = n => {const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  const seed = id => typeof id==='number'?id:[...String(id)].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0)%100000;

  function analyze(damaged, intact, maintenance=false) {
    const w=intact.width,h=intact.height,tile=12;
    const c=Object.assign(document.createElement('canvas'),{width:w,height:h}),g=c.getContext('2d',{willReadFrequently:true});
    g.drawImage(damaged,0,0,w,h);const before=g.getImageData(0,0,w,h).data;
    g.clearRect(0,0,w,h);g.drawImage(intact,0,0);const after=g.getImageData(0,0,w,h).data;
    const delta=g.createImageData(w,h),groups=Array.from({length:5},()=>new Map());
    let changedPixels=0,missingPixels=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;if(!before[i+3]&&!after[i+3])continue;
      if(![0,1,2,3].some(k=>before[i+k]!==after[i+k]))continue;
      delta.data.set([255,255,255,255],i);changedPixels++;
      if(before[i+3]<40&&after[i+3]>100)missingPixels++;
      const region=y>h*.47&&x<w*.29?0:y>h*.47&&x>w*.71?1:y<h*.48?(x>w*.5?2:3):4;
      const col=Math.floor(x/tile),row=Math.floor(y/tile),key=row*Math.ceil(w/tile)+col;
      let cell=groups[region].get(key);
      if(!cell){cell={col,row,x:0,y:0,count:0,region};groups[region].set(key,cell);}
      cell.x+=x;cell.y+=y;cell.count++;
    }
    if(maintenance&&groups.every(group=>group.size===0)){
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
    return {w,h,tile,before,after,delta,regions,changedPixels,missingPixels};
  }

  function ordered(regions){
    const result=[];
    for(let chunk=0;chunk<Math.max(0,...regions.map(c=>Math.ceil(c.length/80)));chunk++){
      for(const cells of regions)result.push(...cells.slice(chunk*80,(chunk+1)*80));
    }
    return result;
  }

  function site(type,progress,lane=0,count=1){
    const data=window.VexedRepairSites?.ships[type];if(!data?.points.length)return null;
    const total=data.points.length/2,lanes=Math.max(1,count),offset=lane%lanes;
    const chunk=Math.min(80,Math.max(1,Math.floor(total/lanes)));
    const blocks=Math.ceil(total/chunk),owned=Math.floor((blocks-1-offset)/lanes)+1;
    const length=owned*chunk-((blocks-1)%lanes===offset?blocks*chunk-total:0);
    if(length<=0)return site(type,progress,0,1);
    const local=Math.min(length-1,Math.floor(clamp(progress)*length));
    const index=(Math.floor(local/chunk)*lanes+offset)*chunk+local%chunk;
    const packed=data.points[index*2],angle=data.points[index*2+1]/1000;
    return {x:(packed%data.w)/data.w-.5,y:Math.floor(packed/data.w)/data.h-.5,nx:Math.cos(angle),ny:Math.sin(angle),index};
  }

  function station(width,height,index){
    const slot=[Math.PI,0,-2.35,-.79,2.35,.79,-Math.PI/2,Math.PI/2][index%8];
    return {x:Math.cos(slot)*width*.74,y:Math.sin(slot)*height*.65};
  }

  function paintHull(ctx,damaged,intact,data,progress,count=1){
    const width=ctx.canvas.width,height=ctx.canvas.height,q=clamp(progress);
    ctx.clearRect(0,0,width,height);ctx.drawImage(q>=1?intact:damaged,0,0,width,height);
    if(q<=0||q>=1||!data?.points.length)return;
    const total=data.points.length/2,chunk=Math.min(80,Math.max(1,Math.floor(total/count)));
    ctx.save();ctx.beginPath();
    for(let i=0;i<total;i++){
      const block=Math.floor(i/chunk),lane=block%count,rank=Math.floor(block/count)*chunk+i%chunk,blocks=Math.ceil(total/chunk);
      const owned=Math.floor((blocks-1-lane)/count)+1,length=owned*chunk-((blocks-1)%count===lane?blocks*chunk-total:0);
      if(rank>=Math.floor(q*length))continue;
      const point=data.points[i*2],x=point%data.w,y=Math.floor(point/data.w);
      ctx.rect(Math.floor(x/data.tile)*data.tile/data.w*width,Math.floor(y/data.tile)*data.tile/data.h*height,data.tile/data.w*width,data.tile/data.h*height);
    }
    ctx.clip();ctx.clearRect(0,0,width,height);ctx.drawImage(intact,0,0,width,height);ctx.restore();
  }

  function drawWeld(ctx,d,time,id=0,scale=1){
    const number=seed(id),pulse=.84+Math.sin(time*.039+number)*.08+Math.sin(time*.093)*.08;
    ctx.save();ctx.globalCompositeOperation='lighter';
    const nx=-Math.sin(d.heading),ny=Math.cos(d.heading),twin=d.tier==='advanced';
    for(const [width,color,alpha] of [[7,'#26ed77',.08],[3,'#42ff95',.25],[.9,'#a6ffcb',.95]]){
      ctx.strokeStyle=color;ctx.lineWidth=width*scale;ctx.globalAlpha=alpha*pulse;
      ctx.beginPath();ctx.moveTo(d.nozzle.x-(twin?nx*5*scale:0),d.nozzle.y-(twin?ny*5*scale:0));ctx.lineTo(d.hit.x-(twin?nx*1.8*scale:0),d.hit.y-(twin?ny*1.8*scale:0));ctx.stroke();
      if(twin){ctx.beginPath();ctx.moveTo(d.nozzle.x+nx*5*scale,d.nozzle.y+ny*5*scale);ctx.lineTo(d.hit.x+nx*1.8*scale,d.hit.y+ny*1.8*scale);ctx.stroke();}
    }
    const brightness=.75+noise(Math.floor(time/32)+number)*.25,radius=23*scale;
    const glow=ctx.createRadialGradient(d.hit.x,d.hit.y,0,d.hit.x,d.hit.y,radius);
    glow.addColorStop(0,'#ffffff');glow.addColorStop(.12,'#eaffff');glow.addColorStop(.27,'#c3dfffbb');glow.addColorStop(.58,'#80c8ff44');glow.addColorStop(1,'#63baff00');
    ctx.globalAlpha=brightness;ctx.fillStyle=glow;ctx.fillRect(d.hit.x-radius,d.hit.y-radius,radius*2,radius*2);
    ctx.strokeStyle='#e8ffff';ctx.lineWidth=.8*scale;ctx.globalAlpha=brightness*.7;
    ctx.beginPath();ctx.moveTo(d.hit.x-9*scale,d.hit.y);ctx.lineTo(d.hit.x+9*scale,d.hit.y);ctx.moveTo(d.hit.x,d.hit.y-6*scale);ctx.lineTo(d.hit.x,d.hit.y+6*scale);ctx.stroke();
    ctx.globalAlpha=1;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(d.hit.x,d.hit.y,2.1*scale,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  function drawThrusters(ctx,d){
    if(!d.thrust||d.lights===false||(d.health??100)<=0)return;
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=d.role==='attack'?'#ffb16a':'#8defff';ctx.shadowColor=d.role==='attack'?'#ff5930':'#54bbff';ctx.shadowBlur=5;
    const jet=d.braking?1:-1,length=4+8*d.thrust;
    for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(jet*12,side*5-1.5);ctx.lineTo(jet*(12+length),side*5);ctx.lineTo(jet*12,side*5+1.5);ctx.fill();}ctx.restore();
  }

  function reflection(ctx,hull,contacts,radius=42){
    const w=ctx.canvas.width,h=ctx.canvas.height;
    ctx.clearRect(0,0,w,h);ctx.globalCompositeOperation='source-over';
    for(const p of contacts){
      const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
      glow.addColorStop(0,'#efffffdd');glow.addColorStop(.25,'#b2dcff77');glow.addColorStop(.6,'#5acfff25');glow.addColorStop(1,'#5acfff00');
      ctx.fillStyle=glow;ctx.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);
    }
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(hull,0,0,w,h);ctx.globalCompositeOperation='source-over';
  }

  function burst(hit,normal,born,key,index,burstCount,scale=1,droneId=0,sizeScale=1){
    const result=[],baseAngle=Math.atan2(normal.y,normal.x),count=7+Math.floor(noise(key+2)*7);
    for(let i=0;i<count;i++){
      const n=key+i*13,droplet=i===0&&burstCount%4===0,a=baseAngle+(noise(n+3)-.5)*2.65;
      const speed=(droplet?25+noise(n+4)*48:50+noise(n+4)*145)*scale;
      result.push({droneId,born,ttl:droplet?650+noise(n+5)*260:170+noise(n+5)*350,x:hit.x,y:hit.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,droplet,size:(droplet?1.5:.85+(.55*noise(n+6)))*sizeScale,normal});
    }
    return result;
  }

  function drawSparks(ctx,sparks,time){
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    for(const spark of sparks){
      const age=(time-spark.born)/1000,q=clamp(age*1000/spark.ttl);if(age<0||q>=1)continue;
      const x=spark.x+spark.vx*age,y=spark.y+spark.vy*age;
      const color=q<.18?'#fffbea':q<.42?'#ffe89b':q<.72?'#ff9b36':'#dc3b16';
      ctx.globalAlpha=clamp((1-q)*2);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=spark.size*(1-q*.35);
      if(spark.droplet){ctx.beginPath();ctx.arc(x,y,spark.size*(1-q*.45),0,Math.PI*2);ctx.fill();}
      else{ctx.beginPath();ctx.moveTo(x-spark.vx*.028,y-spark.vy*.028);ctx.lineTo(x,y);ctx.stroke();}
    }
    ctx.restore();
  }
  window.nativeRepairWork=Object.freeze({analyze,ordered,site,station,paintHull,drawWeld,drawThrusters,reflection,burst,drawSparks,noise,seed});
})();
