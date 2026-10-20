/* All three drone roles use supplied art, cached damage surfaces and painted lamp masks.
   Rendering observes health/time and never changes them. */
(() => {
  'use strict';
  const size=512,ratio=size/1254,canvas=(w=size,h=size)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  const stage=(health=100,maxHealth=100)=>health<=0?4:health/maxHealth<.25?3:health/maxHealth<.5?2:health/maxHealth<.75?1:0;
  const definitions=Object.freeze(Object.fromEntries([
    ['basic',.033,[627,755],[1005,123],[[398,782,77],[855,687,74],[161,507,59],[713,978,84],[1104,409,61],[366,1052,67]]],
    ['upgraded',.037,[627,750],[980,77],[[403,760,80],[847,707,74],[159,449,64],[728,969,82],[1126,414,64],[367,1030,73]]],
    ['advanced',.041,[627,760],[980,23],[[397,755,82],[858,710,78],[155,458,62],[728,964,86],[1112,394,65],[366,1024,73]]]
  ].map(([tier,scale,pivot,tip,damage])=>[tier,Object.freeze({src:`showcase-assets/dot-${tier}.png`,scale,pivot:Object.freeze(pivot),tip:Object.freeze(tip),damage:Object.freeze(damage.map(p=>Object.freeze(p.map(n=>n*ratio))))})])));
  const combatDefinitions=role=>Object.freeze(Object.fromEntries([
    ['basic',.033,[627,755],role==='attack'?[[208,100],[1037,103]]:[[165,244],[1087,244]],[[399,785,76],[855,690,75],[163,510,60],[715,978,82],[1103,465,63],[367,1047,66]]],
    ['upgraded',.037,[627,750],role==='attack'?[[150,75],[239,39],[1007,39],[1099,75]]:[[152,226],[1098,226]],[[401,758,82],[849,706,78],[161,497,67],[727,969,84],[1116,466,68],[366,1028,74]]],
    ['advanced',.041,[627,760],role==='attack'?[[81,94],[138,74],[198,44],[1055,44],[1112,73],[1170,94]]:[[169,147],[160,230],[143,331],[1082,147],[1093,230],[1105,331]],[[398,754,84],[861,709,80],[160,500,69],[728,965,88],[1108,475,71],[365,1026,76]]]
  ].map(([tier,scale,pivot,muzzles,damage])=>[tier,Object.freeze({src:`showcase-assets/${role}-drone-${tier}.png`,scale,pivot:Object.freeze(pivot),muzzles:Object.freeze(muzzles.map(p=>Object.freeze(p))),damage:Object.freeze(damage.map(p=>Object.freeze(p.map(n=>n*ratio))))})])));
  const variants=Object.freeze({repair:definitions,attack:combatDefinitions('attack'),defense:combatDefinitions('defense')});
  const roleColors=Object.freeze({repair:'#3dff97',attack:'#ff4938',defense:'#42bdff'});
  // Native artwork coordinates: service-panel indicators and actual exhaust throats.
  const lightProfiles=Object.freeze(Object.fromEntries([
    ['basic',1,[[491,1054,37,8,-.3],[766,1054,37,8,.3]]],
    ['upgraded',3,[[481,1138,40,9,-.3],[776,1138,40,9,.3]]],
    ['advanced',5,[[482,1124,42,9,-.27],[775,1124,42,9,.27],[386,1041,22,7,0],[865,1041,22,7,0]]]
  ].map(([tier,level,engines])=>[tier,Object.freeze({level,status:Object.freeze(Array.from({length:level},(_,i)=>Object.freeze([(627+(i-(level-1)/2)*10)*ratio,898*ratio]))),engines:Object.freeze(engines.map(p=>Object.freeze(p.map((n,i)=>i<4?n*ratio:n))))})])));
  const key=(tier,role)=>role+':'+tier;
  const matchesLamp=(r,g,b,role)=>role==='attack'?r>180&&g>85&&g>b*1.5&&r>g*1.05:role==='defense'?g>145&&b>170&&g>r*1.4&&b>g*.94:b>115&&b>r*1.45&&b>g*1.12;
  const prepared=new Map(),pictures=new Map();
  function outline(ctx,x,y,r,seed){
    ctx.beginPath();for(let i=0;i<12;i++){const a=i*Math.PI/6,len=r*(.76+noise(seed+i)*.34),px=x+Math.cos(a)*len,py=y+Math.sin(a)*len;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.closePath();
  }
  function* prepare(picture,tier,role){
    const definition=variants[role][tier];
    const base=canvas(),g=base.getContext('2d',{willReadFrequently:true});g.imageSmoothingQuality='high';g.drawImage(picture,0,0,size,size);
    const raw=g.getImageData(0,0,size,size),dark=g.createImageData(size,size);dark.data.set(raw.data);
    const mask=new Uint8Array(size*size),seen=new Uint8Array(mask.length),lamps=[];
    for(let y=0;y<size;y++){
      for(let x=0;x<size;x++){const p=y*size+x,i=p*4,r=raw.data[i],b=raw.data[i+2],green=raw.data[i+1];
        if(raw.data[i+3]>100&&matchesLamp(r,green,b,role)){mask[p]=1;dark.data[i]*=.12;dark.data[i+1]*=.12;dark.data[i+2]*=.12;}}
      if(y%64===63)yield;
    }
    if(role!=='repair'){
      const queue=[];for(let p=0;p<mask.length;p++)if(mask[p])queue.push(p);
      for(let n=0;n<queue.length;n++){
        const q=queue[n],x=q%size,y=Math.floor(q/size);
        for(const k of [x>0?q-1:-1,x<size-1?q+1:-1,y>0?q-size:-1,y<size-1?q+size:-1]){
          if(k<0||mask[k])continue;const i=k*4,r=raw.data[i],g=raw.data[i+1],b=raw.data[i+2];
          if(raw.data[i+3]>100&&r>185&&g>185&&b>170&&Math.max(r,g,b)-Math.min(r,g,b)<75){mask[k]=1;queue.push(k);dark.data[i]*=.12;dark.data[i+1]*=.12;dark.data[i+2]*=.12;}
        }
      }yield;
    }
    for(let p=0;p<mask.length;p++){
      if(!mask[p]||seen[p])continue;
      const queue=[p],pixels=[];seen[p]=1;let left=size,top=size,right=0,bottom=0;
      for(let n=0;n<queue.length;n++){
        const q=queue[n],x=q%size,y=Math.floor(q/size);pixels.push(q);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        for(const k of [x>0?q-1:-1,x<size-1?q+1:-1,y>0?q-size:-1,y<size-1?q+size:-1])if(k>=0&&mask[k]&&!seen[k]){seen[k]=1;queue.push(k);}
      }
      if(pixels.length<3)continue;
      const texture=canvas(right-left+1,bottom-top+1),ctx=texture.getContext('2d'),data=ctx.createImageData(texture.width,texture.height);
      for(const q of pixels){const x=q%size-left,y=Math.floor(q/size)-top;data.data.set(raw.data.subarray(q*4,q*4+4),(y*texture.width+x)*4);}ctx.putImageData(data,0,0);
      const tint=canvas(texture.width,texture.height),t=tint.getContext('2d');t.drawImage(texture,0,0);t.globalCompositeOperation='source-in';t.fillStyle=roleColors[role];t.fillRect(0,0,tint.width,tint.height);
      lamps.push({texture,tint,x:left,y:top,cx:(left+right)/2,cy:(top+bottom)/2});
    }yield;
    g.putImageData(dark,0,0);const frames=[],lampFrames=[],fragments=[];
    const painted=role==='repair'&&tier==='basic'&&window.dotBasicDamage?(yield* window.dotBasicDamage.prepare(base)):window.droneDamageArt?(yield* window.droneDamageArt.prepare(base,tier,role)):null;
    for(let s=0;s<=4;s++){
      const frame=painted?.frames[s]||canvas(),ctx=frame.getContext('2d');if(!painted)ctx.drawImage(base,0,0);
      const count=[0,2,4,6,6][s],strength=[0,.55,.9,1.25,1.5][s];
      if(!painted){
      ctx.save();ctx.globalCompositeOperation='source-atop';
      for(let i=0;i<count;i++){
        const [x,y,radius]=definition.damage[i],r=radius*strength;
        const scorch=ctx.createRadialGradient(x,y,r*.2,x,y,r*1.85);scorch.addColorStop(0,'#080b0def');scorch.addColorStop(.6,'#16100bd8');scorch.addColorStop(1,'#110c0600');
        ctx.fillStyle=scorch;ctx.fillRect(x-r*2,y-r*2,r*4,r*4);
        if(s>=2){
          outline(ctx,x,y,r,i*19);ctx.fillStyle='#111a20';ctx.fill();ctx.strokeStyle='#899295';ctx.lineWidth=2;ctx.stroke();
          ctx.save();ctx.clip();ctx.strokeStyle='#56636a';ctx.lineWidth=3;
          for(let j=-2;j<=2;j++){ctx.beginPath();ctx.moveTo(x-r,y+j*r*.4);ctx.lineTo(x+r,y+j*r*.4+r*.15);ctx.stroke();}
          for(const [j,color] of ['#b9833c','#324d76','#a55b43'].entries()){ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x-r,y-r*.5+j*5);ctx.bezierCurveTo(x-r*.2,y+r,x+r*.2,y-r,x+r,y+r*.4-j*5);ctx.stroke();}ctx.restore();
        }
        ctx.strokeStyle='#111416';ctx.lineWidth=s===1?1.5:3;ctx.beginPath();ctx.moveTo(x-r*1.5,y-r);ctx.lineTo(x-r*.4,y-r*.5);ctx.lineTo(x+r*.1,y-r*.7);ctx.lineTo(x+r*.7,y+r*.2);ctx.lineTo(x+r*1.6,y+r*.55);ctx.stroke();
      }ctx.restore();
      if(s>=2){ctx.globalCompositeOperation='destination-out';ctx.fillStyle='white';for(let i=0;i<count;i++){const [x,y,r]=definition.damage[i];outline(ctx,x+r*.45,y-r*.15,r*strength*(s===2?.3:.53),i*19+3);ctx.fill();}ctx.globalCompositeOperation='source-over';}
      }
      frames.push(frame);
      lampFrames.push(lamps.map(lamp=>{const texture=canvas(lamp.texture.width,lamp.texture.height),c=texture.getContext('2d');c.drawImage(lamp.texture,0,0);c.globalCompositeOperation='destination-in';c.drawImage(frame,-lamp.x,-lamp.y);return {...lamp,texture};}));
      yield;
    }
    // Partition actual severe armor once; deaths reuse these metal pieces.
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){
      const texture=canvas(128,128),c=texture.getContext('2d',{willReadFrequently:true});c.drawImage(frames[3],-col*128,-row*128);
      const data=c.getImageData(0,0,128,128).data;let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i]>100)pixels++;
      if(pixels<60)continue;
      const d=definition,nativeX=(col+.5)*1254/4-d.pivot[0],nativeY=(row+.5)*1254/4-d.pivot[1];
      fragments.push(Object.freeze({texture,x:-nativeY*d.scale,y:nativeX*d.scale,width:1254/4*d.scale,height:1254/4*d.scale}));
    }
    const profile=lightProfiles[tier],hardware=frames.map(frame=>{
      const g=frame.getContext('2d',{willReadFrequently:true}),survives=([x,y])=>g.getImageData(Math.round(x),Math.round(y),1,1).data[3]>160;
      return {status:profile.status.map(survives),engines:profile.engines.map(survives)};
    });
    const local=part=>{const nativeX=part.cx/ratio-definition.pivot[0],nativeY=part.cy/ratio-definition.pivot[1];return Object.freeze({...part,x:-nativeY*definition.scale,y:nativeX*definition.scale,width:part.width/ratio*definition.scale,height:part.height/ratio*definition.scale});};
    prepared.set(key(tier,role),{frames,lampFrames,fragments:painted?painted.wrecks[3].map(local):fragments,wrecks:painted?.wrecks.map(parts=>parts.map(local)),transitions:painted?.transitions.map(parts=>parts.map(local)),damageSites:painted?.damageSites,hardware,lightCache:[]});pictures.delete(key(tier,role));return true;
  }
  const ready=Promise.all(Object.entries(variants).flatMap(([role,tiers])=>Object.entries(tiers).filter(([tier])=>!window.droneSpriteSelection||window.droneSpriteSelection.includes(key(tier,role))).map(([tier,d])=>new Promise(resolve=>{
    let attempts=0;
    const load=()=>{const picture=new Image();picture.onload=async()=>{
      pictures.set(key(tier,role),picture);
      if(window.dotBasicDamage){const loaded=await (role==='repair'&&tier==='basic'?window.dotBasicDamage.ready:window.droneDamageArt?.ready||Promise.resolve([true]));if(!loaded.every(Boolean)){resolve(false);return;}}
      const iterator=prepare(picture,tier,role);
      if(window.nativeDamageArtPreparation)window.nativeDamageArtPreparation.run(iterator).then(()=>resolve(true),()=>resolve(false));
      else{let result;do{result=iterator.next();}while(!result.done);resolve(true);}
    };picture.onerror=()=>{if(attempts<2){attempts++;setTimeout(load,attempts*250);}else resolve(false);};picture.src=d.src+(attempts?`?retry=${attempts}`:'');};load();
  }))));
  function lampOn(i,s,time){return s<4&&(s===0||noise(i+13)>[0,.2,.57,.86][s])&&(s===0||Math.sin(time*.021+i*7)>[-2,-.94,-.65,-.25][s]);}
  function hardwareOn(i,s,time){return s<3?lampOn(i+2,s,time):s===3&&i===0&&time%1800<180;}
  const unit=n=>Math.max(0,Math.min(1,Number(n)||0));
  function activityPoints(tier,role,barrel){const d=variants[role][tier];return (role==='repair'?[d.tip]:[d.muzzles[((barrel%d.muzzles.length)+d.muzzles.length)%d.muzzles.length]]).map(([x,y])=>({x:x*ratio,y:y*ratio}));}
  function lightState(tier,role='repair',health=100,maxHealth=100,time=0,{lights=true,thrust=0,activity=0,barrel=0}={}){
    const p=prepared.get(key(tier,role)),s=stage(health,maxHealth),at=Math.floor(time/75)*75,profile=lightProfiles[tier],powered=lights&&s<4;
    return {color:roleColors[role],level:profile.level,status:profile.status.map(([x,y],i)=>({x,y,on:!!(powered&&p?.hardware[s].status[i]&&hardwareOn(i,s,at))})),
      engines:profile.engines.map(([x,y,rx,ry,angle],i)=>({x,y,rx,ry,angle,on:!!(powered&&p?.hardware[s].engines[i]&&hardwareOn(i+1,s,at))})),
      thrust:powered?unit(thrust):0,activity:powered?unit(activity):0,tools:activityPoints(tier,role,barrel)};
  }
  function glow(g,x,y,r,color,alpha){const gradient=g.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,color);gradient.addColorStop(.23,color+'b0');gradient.addColorStop(1,color+'00');g.globalAlpha=alpha;g.fillStyle=gradient;g.fillRect(x-r,y-r,r*2,r*2);}
  function lighting(p,s,time,role,tier){
    const phase=Math.floor(time/75),at=phase*75;
    let cached=p.lightCache[s];if(cached?.phase===phase)return cached.texture;
    if(!cached){cached={texture:canvas()};p.lightCache[s]=cached;}
    const g=cached.texture.getContext('2d');g.clearRect(0,0,size,size);g.save();
    for(const [i,lamp] of p.lampFrames[s].entries())if(lampOn(i,s,at)){
      g.globalAlpha=.76+.24*Math.sin(at*.002+i)**2;g.drawImage(lamp.texture,lamp.x,lamp.y);
      const pulse=tier==='advanced'?.62+.38*Math.sin(at*.0035-(lamp.cx+lamp.cy)*.025)**2:tier==='upgraded'?.83+.17*Math.sin(at*.004+i):1;
      g.globalCompositeOperation='lighter';g.globalAlpha=(.4+.14*Math.sin(at*.003+i))*pulse;g.shadowColor=roleColors[role];g.shadowBlur=tier==='basic'?8:12;g.drawImage(lamp.tint,lamp.x,lamp.y);g.shadowBlur=0;g.globalCompositeOperation='source-over';
    }
    const hardware=lightState(tier,role,[100,65,40,15,0][s],100,at),color=roleColors[role];g.globalCompositeOperation='lighter';
    for(const [i,light] of hardware.status.entries())if(light.on){
      const pulse=.48+.52*Math.sin(at*.003-i*.65)**2;glow(g,light.x,light.y,9,color,.6*pulse);
      g.globalAlpha=.7+.3*pulse;g.fillStyle=color;g.fillRect(light.x-.7,light.y-2.7,1.4,5.4);g.fillStyle='#edfff8';g.fillRect(light.x-.3,light.y-1.8,.6,3.6);
    }
    for(const engine of hardware.engines)if(engine.on){
      g.save();g.translate(engine.x,engine.y);g.rotate(engine.angle);g.scale(1,engine.ry/engine.rx);
      const energy=.4+.1*Math.sin(at*.037+engine.x);glow(g,0,0,engine.rx*1.8,color,energy*.48);
      g.globalAlpha=energy;g.fillStyle=color;g.beginPath();g.arc(0,0,engine.rx*.8,0,Math.PI*2);g.fill();g.fillStyle='#e3fff7';g.globalAlpha=energy*.7;g.beginPath();g.arc(0,0,engine.rx*.43,0,Math.PI*2);g.fill();g.restore();
    }
    g.restore();g.globalCompositeOperation='destination-in';g.drawImage(p.frames[s],0,0);g.globalCompositeOperation='source-over';cached.phase=phase;return cached.texture;
  }
  // Keep individual thrust/shot variations out of the shared painted-lamp cache.
  // One reusable surface per model clips a few transient glows to surviving metal.
  function workingLight(p,s,time,role,tier,thrust,activity,barrel){
    const throttle=Math.round(unit(thrust)*3)/3,work=Math.round(unit(activity)*5)/5,at=Math.floor(time/32)*32,signature=`${s}:${at}:${throttle}:${work}:${barrel}`;
    if(p.workCache?.signature===signature)return p.workCache.texture;
    if(!p.workCache)p.workCache={texture:canvas()};const cached=p.workCache,g=cached.texture.getContext('2d');g.clearRect(0,0,size,size);g.save();g.globalCompositeOperation='lighter';
    const hardware=lightState(tier,role,[100,65,40,15,0][s],100,time,{thrust:throttle,activity:work,barrel}),color=roleColors[role];
    if(throttle)for(const engine of hardware.engines)if(engine.on){
      g.save();g.translate(engine.x,engine.y);g.rotate(engine.angle);g.scale(1,engine.ry/engine.rx);glow(g,0,0,engine.rx*1.8,color,throttle*.22);glow(g,0,0,engine.rx*.85,'#e3fff7',throttle*.55);g.restore();
    }
    if(work)for(const tool of hardware.tools){glow(g,tool.x,tool.y,role==='repair'?42:58,color,work*.65);glow(g,tool.x,tool.y,16,'#e8ffff',work*.9);}
    g.restore();g.globalCompositeOperation='destination-in';g.drawImage(p.frames[s],0,0);g.globalCompositeOperation='source-over';cached.signature=signature;return cached.texture;
  }
  function paint(ctx,tier,{health=100,maxHealth=100,time=0,lights=true,effects=true,role='repair',thrust=0,activity=0,barrel=0}={}){
    const p=prepared.get(key(tier,role));
    // Keep the supplied body visible while optional damage/lamp caches prepare.
    if(!p){const picture=pictures.get(key(tier,role));if(!picture)return false;ctx.drawImage(picture,0,0,size,size);return true;}
    const s=stage(health,maxHealth);ctx.drawImage(p.frames[s],0,0);
    if(lights&&s<4){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha*=.95+.05*Math.sin(time*.003);ctx.drawImage(lighting(p,s,time,role,tier),0,0);
      if(thrust>0||activity>0)ctx.drawImage(workingLight(p,s,time,role,tier,thrust,activity,barrel),0,0);
      if(activity>0)for(const tool of activityPoints(tier,role,barrel)){
        const intensity=unit(activity)*(role==='repair'?.8+.2*Math.sin(time*.073)**2:1);glow(ctx,tool.x,tool.y,role==='repair'?12:19,roleColors[role],intensity*.8);glow(ctx,tool.x,tool.y,4,'#f4ffff',intensity);
      }ctx.restore();}
    if(effects&&s>0&&s<4&&!(p.transitions&&s===1)){
      const damageSites=p.damageSites?.[s]||variants[role][tier].damage.slice(0,[0,2,4,6][s]);
      for(const [i,site] of damageSites.entries()){
        const [x,y,r]=site,cycle=(time*.001+i*.271)%1.1,hot=Math.sin(time*.028+i*4)>.55;
        ctx.save();
        if(s>=2){for(let j=0;j<2;j++){const age=(cycle+j*.4)%1.1;ctx.globalAlpha=(1-age/1.1)*.23;ctx.fillStyle='#82909a';ctx.beginPath();ctx.ellipse(x+r*.4+age*14,y-r*.3-age*10,r*(.14+age*.4),r*(.12+age*.35),age,0,Math.PI*2);ctx.fill();}}
        ctx.globalCompositeOperation='lighter';ctx.globalAlpha=hot?.95:.3;
        if(s>=2){ctx.fillStyle='#ff9d38';ctx.shadowColor='#ff6c20';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(x-r*.35,y+r*.15,2+s*.5+Math.sin(time*.023+i),0,Math.PI*2);ctx.fill();}
        if(hot){ctx.strokeStyle='#d5edff';ctx.shadowColor='#6dcaff';ctx.shadowBlur=6;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-r*.65,y);ctx.lineTo(x-r*.2,y-r*.4);ctx.lineTo(x+r*.1,y+r*.2);ctx.lineTo(x+r*.6,y-r*.2);ctx.stroke();}
        for(let j=0;j<s+1;j++){const age=(cycle+j*.19)%1.1,a=noise(i*17+j)*Math.PI*2,len=age*(15+s*8);ctx.globalAlpha=Math.max(0,1-age);ctx.strokeStyle=age<.2?'#fff6c9':age<.6?'#ffb54f':'#c24724';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*len,y+Math.sin(a)*len);ctx.lineTo(x+Math.cos(a)*(len+4),y+Math.sin(a)*(len+4));ctx.stroke();}ctx.restore();
      }
    }return true;
  }
  function nozzle(tier){const d=definitions[tier];return {x:(d.pivot[1]-d.tip[1])*d.scale,y:(d.tip[0]-d.pivot[0])*d.scale};}
  function draw(ctx,tier,options={}){
    const role=options.role||'repair';if(!prepared.has(key(tier,role))&&!pictures.has(key(tier,role)))return false;const d=variants[role][tier];ctx.save();ctx.rotate(Math.PI/2);ctx.translate(-d.pivot[0]*d.scale,-d.pivot[1]*d.scale);ctx.scale(1254*d.scale/size,1254*d.scale/size);paint(ctx,tier,options);ctx.restore();return true;
  }
  function drawPreview(ctx,tier,width,height,options={}){
    const id=key(tier,options.role||'repair');if(!prepared.has(id)&&!pictures.has(id))return false;const extent=Math.min(width,height)-12;ctx.clearRect(0,0,width,height);ctx.save();ctx.translate((width-extent)/2,(height-extent)/2);ctx.scale(extent/size,extent/size);paint(ctx,tier,options);ctx.restore();return true;
  }
  function inspect(tier,health=100,maxHealth=100,time=0,role='repair'){const p=prepared.get(key(tier,role)),s=stage(health,maxHealth),at=Math.floor(time/75)*75;return {stage:s,powered:s<4,lamps:p?.lampFrames[s].map((l,i)=>({x:l.cx,y:l.cy,on:lampOn(i,s,at)}))||[],fragments:p?.fragments.length||0};}
  function muzzle(tier,role,volley=0){const d=variants[role][tier],point=d.muzzles[volley%d.muzzles.length];return {x:(d.pivot[1]-point[1])*d.scale,y:(point[0]-d.pivot[0])*d.scale};}
  function damageChange(tier,role,before,after){
    const p=prepared.get(key(tier,role)),d=variants[role][tier],pieces=[],sites=[];
    if(!p?.transitions||after<=before)return {pieces,sites};
    for(let s=Math.max(1,before+1);s<=Math.min(3,after);s++){
      pieces.push(...p.transitions[s]);
      for(const index of new Set(p.transitions[s].map(piece=>piece.site))){const [x,y]=window.dotBasicDamage.sites[index];sites.push({x:(d.pivot[1]-y/ratio)*d.scale,y:(x/ratio-d.pivot[0])*d.scale,stage:s,site:index});}
    }return {pieces,sites};
  }
  const api={ready,stage,nozzle,muzzle,draw,drawPreview,drawSurface:paint,inspect,lightState,lightProfiles,damageChange,fragments:(tier,role='repair',sourceStage=3)=>{const p=prepared.get(key(tier,role));return p?.wrecks?.[Math.max(0,Math.min(3,sourceStage))]||p?.fragments||[];}};
  window.dotSprites=Object.freeze({definitions,...api});
  window.droneSprites=Object.freeze({definitions:variants,...api});
})();
