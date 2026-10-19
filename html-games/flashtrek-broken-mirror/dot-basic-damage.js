/* Painted Basic Dot damage and the armor layers removed at each transition.
   Preparation is cooperative; these immutable surfaces never own hull or time. */
(() => {
  'use strict';
  const size=512,scale=size/1254,canvas=(w=size,h=size)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const patches=[
    [[348,565],[440,461],[546,477],[568,578],[565,733],[459,776],[364,720]],
    [[658,726],[764,721],[853,808],[831,925],[690,930],[665,849]],
    [[145,420],[244,433],[293,562],[233,612],[139,558]],
    [[970,425],[1117,413],[1166,561],[1094,635],[997,570]],
    [[409,965],[534,974],[565,1089],[466,1111],[408,1062]]
  ];
  const sites=[[444,653,55],[734,812,45],[205,503,34],[1080,517,44],[477,1048,32]].map(p=>p.map(n=>n*scale));
  const layers=[[],[
    {site:0,poly:[[429,646],[437,641],[442,648],[438,654],[430,652]]},
    {site:1,poly:[[731,805],[738,806],[742,814],[736,818],[730,812]]},
    {site:2,poly:[[169,482],[175,479],[179,487],[175,493],[169,490]],through:true}
  ],[
    {site:0,poly:[[407,619],[439,606],[470,630],[463,665],[432,679],[409,656]]},
    {site:1,poly:[[713,779],[741,778],[759,802],[748,830],[721,825],[707,806]]},
    {site:2,poly:[[150,466],[166,462],[177,481],[169,506],[154,513],[148,490]],through:true}
  ],[
    {site:0,poly:[[387,644],[407,647],[428,677],[460,673],[478,699],[449,732],[409,719],[386,690]]},
    {site:1,poly:[[755,820],[784,815],[813,843],[807,886],[777,905],[751,873]]},
    {site:3,poly:[[1046,468],[1081,456],[1117,477],[1128,517],[1104,542],[1061,528]]},
    {site:4,poly:[[431,1030],[456,1025],[472,1044],[460,1071],[438,1080],[426,1055]],through:true}
  ]];
  const images=[];
  // Measured from unchanged mechanical details; applies only when sampling new art.
  const registration=[[1,0,0,1,0,0],[.99902458,.00020832,-.00020832,.99902458,.29864238,.25927464],[.95634068,-.00241697,.00241697,.95634068,26.19106326,40.51045129]];
  const ready=Promise.all(['light','heavy','severe'].map((name,i)=>new Promise(resolve=>{
    let attempts=0;const load=()=>{const im=new Image();im.onload=()=>{images[i]=im;resolve(true);};im.onerror=()=>{if(attempts++<2)setTimeout(load,200*attempts);else resolve(false);};im.src=`showcase-assets/dot-basic-${name}-v2.png`+(attempts?`?retry=${attempts}`:'');};load();
  })));
  const path=(g,poly,ox=0,oy=0)=>{g.beginPath();poly.forEach(([x,y],i)=>{const px=x*scale-ox,py=y*scale-oy;if(i)g.lineTo(px,py);else g.moveTo(px,py);});g.closePath();};
  function piece(frame,poly,extra={}){
    const left=Math.floor(Math.min(...poly.map(p=>p[0]))*scale),top=Math.floor(Math.min(...poly.map(p=>p[1]))*scale),right=Math.ceil(Math.max(...poly.map(p=>p[0]))*scale),bottom=Math.ceil(Math.max(...poly.map(p=>p[1]))*scale);
    const texture=canvas(Math.max(1,right-left),Math.max(1,bottom-top)),g=texture.getContext('2d',{willReadFrequently:true});g.save();path(g,poly,left,top);g.clip();g.drawImage(frame,-left,-top);g.restore();
    const data=g.getImageData(0,0,texture.width,texture.height).data;let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i]>100)pixels++;
    return Object.freeze({texture,cx:(left+right)/2,cy:(top+bottom)/2,width:texture.width,height:texture.height,pixels,source:Object.freeze({x:left,y:top,width:texture.width,height:texture.height}),...extra});
  }
  function* prepare(base){
    if(images.length!==3||images.some(im=>!im))throw Error('Basic Dot damage artwork did not load');
    const frames=[base],transitions=[[]],damageSites=[[]];
    for(let stage=1;stage<=3;stage++){
      const painted=canvas(),pg=painted.getContext('2d',{willReadFrequently:true}),[a,b,c,d,e,f]=registration[stage-1];pg.setTransform(a,b,c,d,e*scale,f*scale);pg.drawImage(images[stage-1],0,0,size,size);pg.resetTransform();
      const pixels=pg.getImageData(0,0,size,size);for(let i=0;i<pixels.data.length;i+=4){const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];if(b>115&&b>r*1.45&&b>g*1.12){pixels.data[i]*=.12;pixels.data[i+1]*=.12;pixels.data[i+2]*=.12;}}pg.putImageData(pixels,0,0);yield;
      const mask=canvas(),mg=mask.getContext('2d');mg.fillStyle='white';mg.shadowColor='white';mg.shadowBlur=4;
      for(const poly of patches.slice(0,stage===3?5:3)){path(mg,poly);mg.fill();}
      const patch=canvas(),p=patch.getContext('2d');p.drawImage(painted,0,0);p.globalCompositeOperation='destination-in';p.drawImage(mask,0,0);
      const frame=canvas(),g=frame.getContext('2d');g.drawImage(frames[stage-1],0,0);g.globalCompositeOperation='destination-out';g.drawImage(mask,0,0);g.globalCompositeOperation='source-over';g.drawImage(patch,0,0);
      // Missing silhouette material can never grow back at a later damage stage.
      const prior=frames[stage-1].getContext('2d').getImageData(0,0,size,size),current=g.getImageData(0,0,size,size);for(let i=3;i<current.data.length;i+=4)current.data[i]=Math.min(prior.data[i],current.data[i]);g.putImageData(current,0,0);
      const pieces=layers[stage].map((layer,i)=>piece(frames[stage-1],layer.poly,{stage,site:layer.site,name:`${['','paint chip','armor plate','torn assembly'][stage]} ${i+1}`}));
      g.globalCompositeOperation='destination-out';g.fillStyle='white';for(const layer of layers.slice(1,stage+1).flat())if(layer.through){path(g,layer.poly);g.fill();}g.globalCompositeOperation='source-over';
      frames.push(frame);transitions.push(pieces.filter(p=>p.pixels));damageSites.push(sites.slice(0,stage===3?5:3));yield;
    }
    const dead=canvas(),dg=dead.getContext('2d');dg.drawImage(frames[3],0,0);dg.globalCompositeOperation='source-atop';dg.fillStyle='#080c1260';dg.fillRect(0,0,size,size);dg.globalCompositeOperation='destination-out';
    for(const poly of [[[1023,470],[1065,459],[1093,488],[1084,535],[1048,550],[1021,520]],[[770,839],[806,846],[814,890],[781,919],[759,893]]]){path(dg,poly);dg.fill();}dg.globalCompositeOperation='source-over';frames.push(dead);
    const wrecks=[];
    for(let stage=0;stage<4;stage++){
      const parts=[];for(let row=0;row<5;row++)for(let col=0;col<4;col++){
        const x=col*1254/4,y=row*1254/5,w=1254/4,h=1254/5;
        const part=piece(frames[stage],[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],{stage,name:`remaining hull ${row*4+col+1}`});if(part.pixels>45)parts.push(part);
      }wrecks.push(parts);yield;
    }
    return {frames,transitions,damageSites,wrecks};
  }
  function createEffects(){
    let pieces=[],particles=[],events=[],serial=0;
    const point=(p,pose)=>{const c=Math.cos(pose.heading),s=Math.sin(pose.heading),z=pose.scale||1;return{x:pose.position.x+(p.x*c-p.y*s)*z,y:pose.position.y+(p.x*s+p.y*c)*z};};
    function emit(pose){
      if(pose.tier!=='basic'||pose.role!=='repair')return;
      const changes=window.droneSprites.damageChange(pose.tier,pose.role,pose.before,pose.after),time=pose.time,id=serial++;
      const origins=changes.sites.map(site=>({...point(site,pose),stage:site.stage,site:site.site}));
      if(!origins.length&&pose.impact)origins.push({...pose.impact,stage:pose.after,site:-1});
      if(!origins.length)return;
      for(const part of changes.pieces){
        const origin=point(part,pose),a=Math.atan2(origin.y-pose.position.y,origin.x-pose.position.x)+(id%3-1)*.2,speed=(pose.after===1?18:32)+(serial++%5)*9;
        pieces.push({...origin,origin:{...origin},pose:{x:pose.position.x,y:pose.position.y,heading:pose.heading,scale:pose.scale||1},source:part.source,name:part.name,stage:part.stage,texture:part.texture,
          w:part.width*(pose.scale||1),h:part.height*(pose.scale||1),vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
          angle:pose.heading+Math.PI/2,spin:(serial%2?1:-1)*(.8+serial%4),born:time,ttl:pose.after===1?1100:2500,sourceId:pose.sourceId});
      }
      for(const [j,origin] of origins.entries()){
        events.push({...origin,born:time,ttl:650,sourceId:pose.sourceId});
        particles.push({...origin,born:time,ttl:220,kind:'flash',size:pose.after===1?8:13});
        for(let i=0;i<(pose.after===1?10:17);i++){const a=i*2.39996+j*.7,speed=18+(i%7)*11;particles.push({...origin,born:time,ttl:260+(i%5)*70,kind:'spark',size:.6+i%3*.25,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed});}
        for(let i=0;i<3;i++)particles.push({...origin,born:time+i*45,ttl:600+i*150,kind:'smoke',size:3+i*2,vx:(i-1)*5,vy:-6-i*3});
      }
      pieces=pieces.slice(-96);particles=particles.slice(-320);events=events.slice(-32);
    }
    function update(time){pieces=pieces.filter(p=>time-p.born<p.ttl);particles=particles.filter(p=>time-p.born<p.ttl);events=events.filter(p=>time-p.born<p.ttl);}
    function draw(ctx,time){
      ctx.save();ctx.globalCompositeOperation='source-over';
      for(const p of pieces){const age=(time-p.born)/1000,q=age*1000/p.ttl;if(q<0||q>=1)continue;ctx.save();ctx.translate(p.x+p.vx*age,p.y+p.vy*age);ctx.rotate(p.angle+p.spin*age);ctx.globalAlpha=q<.5?1:(1-q)*2;ctx.drawImage(p.texture,-p.w/2,-p.h/2,p.w,p.h);ctx.restore();}
      for(const p of particles){const age=(time-p.born)/1000,q=age*1000/p.ttl;if(q<0||q>=1)continue;const x=p.x+(p.vx||0)*age,y=p.y+(p.vy||0)*age;ctx.save();
        if(p.kind==='smoke'){ctx.globalAlpha=(1-q)*.19;ctx.fillStyle='#78848d';ctx.beginPath();ctx.ellipse(x,y,p.size*(1+q*2),p.size*(.65+q*1.5),q,0,Math.PI*2);ctx.fill();}
        else{ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1-q;if(p.kind==='flash'){const r=p.size*(1+q),g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#fffdeb');g.addColorStop(.2,'#ffe5a9');g.addColorStop(.55,'#ff913855');g.addColorStop(1,'#ff913800');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
          else{ctx.lineWidth=p.size;ctx.strokeStyle=q<.2?'#fff7d2':q<.6?'#ffc062':'#d86630';ctx.beginPath();ctx.moveTo(x-p.vx*.025,y-p.vy*.025);ctx.lineTo(x,y);ctx.stroke();}}
        ctx.restore();
      }ctx.restore();
    }
    const clear=()=>{pieces=[];particles=[];events=[];};
    const snapshot=()=>({pieces:pieces.map(p=>({origin:{...p.origin},pose:{...p.pose},source:{...p.source},name:p.name,stage:p.stage,w:p.w,h:p.h,born:p.born,sourceId:p.sourceId})),flashes:particles.filter(p=>p.kind==='flash').length,sparks:particles.filter(p=>p.kind==='spark').length,smoke:particles.filter(p=>p.kind==='smoke').length,sites:events.map(e=>({x:e.x,y:e.y,stage:e.stage,site:e.site,born:e.born,sourceId:e.sourceId}))});
    return {emit,update,draw,clear,snapshot};
  }
  window.dotBasicDamage=Object.freeze({ready,prepare,sites:Object.freeze(sites.map(p=>Object.freeze(p))),layers:Object.freeze(layers.map(list=>Object.freeze(list))),createEffects});
})();
