/* Cut the current hull into disjoint sections. Every source pixel belongs to
   one section, so the initial wreckage reconstructs the visible ship exactly. */
window.createShipDestruction = () => {
  'use strict';
  const sites=[['bow',181,100],['left arm',78,209],['right arm',285,209],
    ['left crossbar',60,313],['right crossbar',305,313],['core housing',181,361],
    ['lower left hull',100,431],['lower right hull',262,431],['stern',181,461],
    ['bow chip',181,36],['left edge fragment',12,303],['right edge fragment',350,303],['stern chip',181,479]];
  let stages=[];
  function* preparation(frames,config={}){
    const cutSites=config.sites||sites,core=config.core||[181,362],coreIndex=config.coreIndex??5;
    // All stages share the same hull coordinates. Compute each ownership once.
    const ownerCache=new Int16Array(frames[0].width*frames[0].height).fill(-1);
    const result=[];
    for(const im of frames){
      const w=im.width,h=im.height,c=document.createElement('canvas');c.width=w;c.height=h;
      const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);const source=g.getImageData(0,0,w,h),groups=cutSites.map(()=>[]);
      let sourcePixels=0;const owners=new Int16Array(w*h).fill(-1);yield;
      for(let pixel=0;pixel<w*h;pixel++){
        if((pixel&1023)===1023)yield;
        const i=pixel*4;if(!source.data[i+3])continue;sourcePixels++;
        const x=pixel%w,y=Math.floor(pixel/w);
        let best=ownerCache[pixel],distance=Infinity;
        if(best<0){
          best=0;
          if(config.partition)best=config.partition.owner(x,y);
          else cutSites.forEach(([,sx,sy],n)=>{const d=(x-sx)**2+(y-sy)**2;if(d<distance){distance=d;best=n;}});
          ownerCache[pixel]=best;
        }
        owners[pixel]=best;
        groups[best].push(pixel);
      }
      const pieces=[];
      for(let n=0;n<groups.length;n++){
        const pixels=groups[n];if(!pixels.length)continue;
        let x=w,y=h,right=0,bottom=0;
        for(let i=0;i<pixels.length;i++){const pixel=pixels[i],px=pixel%w,py=Math.floor(pixel/w);x=Math.min(x,px);y=Math.min(y,py);right=Math.max(right,px);bottom=Math.max(bottom,py);if((i&1023)===1023)yield;}
        const width=right-x+1,height=bottom-y+1,texture=document.createElement('canvas');texture.width=width;texture.height=height;
        const tg=texture.getContext('2d'),cut=tg.createImageData(width,height);
        for(let i=0;i<pixels.length;i++){const pixel=pixels[i];cut.data.set(source.data.subarray(pixel*4,pixel*4+4),((Math.floor(pixel/w)-y)*width+pixel%w-x)*4);if((i&1023)===1023)yield;}
        tg.putImageData(cut,0,0);yield;
        let fracture=null;
        if(config.structural){
          const edge=document.createElement('canvas'),hot=document.createElement('canvas'),side=document.createElement('canvas');
          for(const c of [edge,hot,side]){c.width=width;c.height=height;}
          const eg=edge.getContext('2d'),hg=hot.getContext('2d'),ed=eg.createImageData(width,height),hd=hg.createImageData(width,height),boundary=[];
          for(let index=0;index<pixels.length;index++){
            if((index&1023)===1023)yield;
            const pixel=pixels[index],px=pixel%w,py=Math.floor(pixel/w);
            let depth=0;
            for(let d=1;d<=2&&!depth;d++)for(const [dx,dy] of [[d,0],[-d,0],[0,d],[0,-d]]){
              const xx=px+dx,yy=py+dy;
              if(xx>=0&&xx<w&&yy>=0&&yy<h&&owners[yy*w+xx]>=0&&owners[yy*w+xx]!==n){depth=d;break;}
            }
            if(!depth)continue;
            const i=((py-y)*width+px-x)*4,variation=(px*37+py*19)%17;
            ed.data.set(depth===1?[91+variation,83+variation,72+variation,220]:[21,22,24,190],i);
            if(depth===1){boundary.push({x:px,y:py});if(variation<7)hd.data.set([255,105+variation*9,25,210],i);}
          }
          eg.putImageData(ed,0,0);hg.putImageData(hd,0,0);yield;
          const sg=side.getContext('2d');sg.drawImage(texture,0,0);sg.globalCompositeOperation='source-atop';sg.fillStyle='#11151b';sg.fillRect(0,0,width,height);
          const mx=boundary.reduce((sum,p)=>sum+p.x,0)/(boundary.length||1),my=boundary.reduce((sum,p)=>sum+p.y,0)/(boundary.length||1);
          let anchor=boundary[0];for(let i=0;i<boundary.length;i++){const p=boundary[i];if((p.x-mx)**2+(p.y-my)**2<(anchor.x-mx)**2+(anchor.y-my)**2)anchor=p;if((i&1023)===1023)yield;}
          fracture={edge,hot,side,edgePixels:boundary.length,edgeX:anchor?(anchor.x-x-width/2)/w:0,edgeY:anchor?(anchor.y-y-height/2)/h:0};
        }
        const lit=document.createElement('canvas');lit.width=width;lit.height=height;const lg=lit.getContext('2d');lg.drawImage(texture,0,0);
        lg.globalCompositeOperation='source-atop';lg.fillStyle='#c4ebff';lg.fillRect(0,0,width,height);
        pieces.push({texture,lit,...fracture,structural:!!config.structural,farTravel:!!config.farTravel,name:cutSites[n][0],x:(x+width/2)/w-.5,y:(y+height/2)/h-.5,w:width/w,h:height/h,
          core:n===coreIndex,sail:!!config.sail,coreX:(core[0]-x-width/2)/w,coreY:(core[1]-y-height/2)/h,pixels:pixels.length});yield;
      }
      result.push({pieces,structural:!!config.structural,coreEnabled:config.coreEnabled!==false,sail:!!config.sail,
        energyColor:config.energyColor||'#24aaff',core:{x:core[0]/w-.5,y:core[1]/h-.5},sourcePixels,cutPixels:pieces.reduce((n,p)=>n+p.pixels,0)});
    }
    return result;
  }
  function prepare(frames,config={}){const iterator=preparation(frames,config);let result;do{result=iterator.next();}while(!result.done);stages=result.value;}
  async function prepareAsync(frames,config={}){
    const iterator=preparation(frames,config);
    if(window.nativeDamageArtPreparation)stages=await window.nativeDamageArtPreparation.run(iterator);
    else{let result;do{result=iterator.next();if(!result.done)await new Promise(resolve=>setTimeout(resolve,0));}while(!result.done);stages=result.value;}
  }
  function emit(state,layout,world,stage,zoom,target=null,fragmentData=null){
    const data=fragmentData||stages[stage],born=state.time;let demoImpact=false;if(!data)return false;
    for(const [i,piece] of data.pieces.entries()){
      const small=piece.pixels<180,p=world(piece);let a=Math.atan2(p.y-layout.y,p.x-layout.x)+(i%2?.19:-.19);const speed=(piece.farTravel?(small?340+i*5:175+1500/Math.sqrt(piece.pixels)):piece.structural?(small?145+i*2:40+1100/Math.sqrt(piece.pixels)):46+i*6)*zoom;
      // One small fragment crosses the nearby ship for the collision example.
      // Its trajectory is ballistic; it does not track or home on that ship.
      if(piece.farTravel&&small&&target&&!demoImpact){a=Math.atan2(target.y-p.y,target.x-p.x);demoImpact=true;}
      state.debris.push({...piece,...p,w:piece.w*layout.w,h:piece.h*layout.h,coreX:piece.coreX*layout.w,coreY:piece.coreY*layout.h,
        vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,spin:(i%2?-1:1)*(piece.structural?(small?1.7+i*.04:.25+i*.025):.45+i*.085),angle:state.angle,
        edgeX:(piece.edgeX||0)*layout.w,edgeY:(piece.edgeY||0)*layout.h,trailAt:born+140,small,zoom,
        born,ttl:piece.farTravel?14500+i*100:8500+i*140,energyColor:data.energyColor,cthia:true,wreck:true,sourceStage:stage});
      const delay=piece.core?0:90+(i*71)%430;
      state.particles.push({x:p.x+Math.cos(a)*speed*delay/1000,y:p.y+Math.sin(a)*speed*delay/1000,
        vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:(piece.core?30:18)*zoom,
        born:born+delay,ttl:480,realistic:'blast',phase:i*1.7});
      for(let j=0;j<(data.sail?8:22);j++){
        const angle=Math.random()*Math.PI*2,v=(50+Math.random()*135)*zoom;
        state.particles.push({...p,vx:Math.cos(angle)*v,vy:Math.sin(angle)*v,size:(.6+Math.random())*zoom,
          born:born+delay+Math.random()*70,ttl:500+Math.random()*950,realistic:'spark'});
      }
      for(let j=0;j<(data.sail?4:7);j++){
        const angle=Math.random()*Math.PI*2,v=(8+Math.random()*20)*zoom;
        state.particles.push({x:p.x+(Math.random()-.5)*piece.w*layout.w,y:p.y+(Math.random()-.5)*piece.h*layout.h,
          vx:Math.cos(angle)*v,vy:Math.sin(angle)*v,size:(7+Math.random()*13)*zoom,
          born:born+delay+j*23,ttl:800+Math.random()*1200,realistic:j<3?'fire':'smoke',phase:Math.random()*6});
      }
    }
    const core=world(data.core);
    if(data.coreEnabled)state.particles.push({...core,vx:0,vy:0,size:72*zoom,born,ttl:290,realistic:'core',energyColor:data.energyColor});
    state.cthiaBlast={born,zoom};
  }
  function drawParticle(ctx,p,time){
    const age=time-p.born;if(age<0||age>=p.ttl)return;
    const t=age/p.ttl;ctx.save();
    if(p.realistic==='spark'){
      ctx.globalCompositeOperation='screen';ctx.globalAlpha=(1-t)**1.5;ctx.strokeStyle=t<.2?'#fff6dc':'#ed9a48';ctx.lineWidth=p.size;
      const speed=Math.hypot(p.vx,p.vy)||1,len=2+6*(1-t);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx/speed*len,p.y-p.vy/speed*len);ctx.stroke();
    }else{
      const smoke=p.realistic==='smoke',core=p.realistic==='core',r=p.size*(core?.65+t:1+t*2.4);
      ctx.translate(p.x,p.y);ctx.rotate(p.phase||0);ctx.scale(1,smoke?.75:1);
      const glow=ctx.createRadialGradient(0,0,0,0,0,r);
      if(smoke){glow.addColorStop(0,'#302a26');glow.addColorStop(.5,'#242323');glow.addColorStop(1,'#25272900');ctx.globalAlpha=Math.sin(Math.PI*t)*.5;}
      else{ctx.globalCompositeOperation='screen';ctx.globalAlpha=(1-t)**2*(core?1:p.realistic==='blast'?.9:.65);
        glow.addColorStop(0,core?'#e8faff':'#ffe6a7');glow.addColorStop(.2,core?(p.energyColor||'#4ad8ff'):'#e89437');glow.addColorStop(.55,core?(p.energyColor||'#167bff'):'#853514');glow.addColorStop(1,core?(p.energyColor||'#167bff')+'00':'#85351400');}
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
      if(!core&&!smoke){
        // Offset flame lobes break up the circular silhouette of each burst.
        for(let i=0;i<5;i++){const a=i*2.4+(p.phase||0),d=r*(.22+.16*Math.sin(i*7+(p.phase||0)));
          ctx.save();ctx.translate(Math.cos(a)*d,Math.sin(a)*d);ctx.scale(.45+i*.07,.38+i*.06);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.restore();}
      }
    }ctx.restore();
  }
  function drawWreckGlow(ctx,p,time){
    const age=time-p.born;
    if(age<240){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.55*(1-age/240)**2;ctx.drawImage(p.lit,-p.w/2,-p.h/2,p.w,p.h);ctx.restore();}
    if(p.core&&age<1100){
      const g=ctx.createRadialGradient(p.coreX,p.coreY,0,p.coreX,p.coreY,13);
      g.addColorStop(0,'#c9f6ff');g.addColorStop(.35,p.energyColor||'#24aaff');g.addColorStop(1,(p.energyColor||'#24aaff')+'00');
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=(1-age/1100)**2;ctx.fillStyle=g;ctx.fillRect(p.coreX-13,p.coreY-13,26,26);ctx.restore();
    }
    // Dim the painted lamp as the reactor loses power.
    if(p.core){ctx.save();ctx.globalAlpha=Math.min(1,age/850)*.94;const g=ctx.createRadialGradient(p.coreX,p.coreY,0,p.coreX,p.coreY,10);
      g.addColorStop(0,'#071019');g.addColorStop(.65,'#071019');g.addColorStop(1,'#07101900');ctx.fillStyle=g;ctx.fillRect(p.coreX-10,p.coreY-10,20,20);ctx.restore();}
  }
  function drawStructuralWreck(ctx,p,time){
    const age=time-p.born;
    ctx.save();
    ctx.drawImage(p.texture,-p.w/2,-p.h/2,p.w,p.h);
    ctx.drawImage(p.edge,-p.w/2,-p.h/2,p.w,p.h);
    if(age<1700){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=(1-age/1700)**1.5*(.7+.3*Math.sin(age*.035));ctx.drawImage(p.hot,-p.w/2,-p.h/2,p.w,p.h);ctx.restore();}
    drawWreckGlow(ctx,p,time);ctx.restore();
  }
  function updateTrails(state){
    for(const p of state.debris){
      const age=state.time-p.born;if(!p.structural||p.small||!p.edgePixels||age>2200||state.time<p.trailAt)continue;
      p.trailAt=state.time+90;
      const lx=p.edgeX,ly=p.edgeY,cos=Math.cos(p.angle),sin=Math.sin(p.angle),x=p.x+lx*cos-ly*sin,y=p.y+lx*sin+ly*cos;
      state.particles.push({x,y,vx:-p.vx*.16,vy:-p.vy*.16,size:3.5*p.zoom,born:state.time,ttl:950,phase:p.angle,realistic:'smoke'});
      if(age<1300)state.particles.push({x,y,vx:p.vx*.25+(Math.random()-.5)*28,vy:p.vy*.25+(Math.random()-.5)*28,size:.65*p.zoom,born:state.time,ttl:430,realistic:'spark'});
    }
  }
  const audit=()=>stages.map(s=>({sourcePixels:s.sourcePixels,cutPixels:s.cutPixels,pieces:s.pieces.length,structural:s.structural,edgePixels:s.pieces.reduce((n,p)=>n+(p.edgePixels||0),0)}));
  const memoryBytes=()=>stages.reduce((total,stage)=>total+stage.pieces.reduce((sum,piece)=>sum+['texture','lit','edge','hot','side'].reduce((n,key)=>n+(piece[key]?piece[key].width*piece[key].height*4:0),0),0),0);
  function shake(ctx,state){
    if(!state.cthiaBlast)return;
    const age=state.time-state.cthiaBlast.born;if(age<0||age>420)return;
    const amplitude=3.2*state.cthiaBlast.zoom*(1-age/420)**2;
    ctx.translate(Math.sin(age*.093)*amplitude,Math.sin(age*.127+1)*amplitude*.7);
  }
  const emitFragments=(state,layout,world,stage,zoom,data)=>emit(state,layout,world,stage,zoom,null,data);
  return Object.freeze({prepare,prepareAsync,emit,emitFragments,drawParticle,drawWreckGlow,drawStructuralWreck,updateTrails,audit,memoryBytes,shake});
};
window.cthiaDestruction=window.createShipDestruction();
