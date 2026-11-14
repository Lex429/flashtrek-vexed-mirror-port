/* Frozen ee12e544 regional renderer, before star batching, for real pixel comparisons.
   The browser fixture renames only the public export. */
(() => {
  'use strict';
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const mix=(a,b,t)=>a+(b-a)*t;
  const families=Object.freeze(['white','blue','cyan','green','gold','red','violet']);
  const colors=Object.freeze([
    [0xdce4f3,0xbfcddd,0xf1ecde], [0x669dff,0x86baff,0xadd7ff],
    [0x64d8ed,0x83ece6,0xa9ecff], [0x60df91,0x8deca2,0x4ecdb0],
    [0xffd68b,0xffb86c,0xefd7a0], [0xff777e,0xf39b83,0xe86965],
    [0xb89aff,0xd49eea,0xa9afff]
  ].map(row=>Object.freeze(row)));
  // White, blue, cyan, green, gold, red, violet. These are authored palettes,
  // not canonical stellar censuses or political ownership colours.
  const palettes={
    sol:[.48,.27,.07,.015,.12,.035,.01], blue:[.16,.64,.13,.01,.025,.015,.02],
    green:[.15,.10,.17,.47,.035,.025,.05], warm:[.16,.07,.025,.015,.27,.42,.04],
    badlands:[.08,.025,.015,.01,.30,.48,.09],
    harman:[.13,.12,.25,.36,.025,.025,.09],
    kardon:[.13,.12,.04,.10,.09,.32,.20], vex:[.10,.14,.19,.40,.02,.04,.11]
  };
  const systems=new Map((window.VexedMirrorWorld?.systems||[]).map(s=>[s.id,s]));
  const position=id=>window.nativeManualFlight?.chartPosition(id)||systems.get(Number(id))?.mapPosition;
  function zone(name,system,rx,ry,density,palette,offset={x:0,y:0}){
    const p=position(system);return p&&Object.freeze({name,x:p.x+offset.x,y:p.y+offset.y,rx,ry,density,weights:Object.freeze(palettes[palette])});
  }
  const regions=Object.freeze([
    zone('Sol neighbourhood',1,82,72,1,'sol'),
    zone('Andorian blue-rich concentration',25,86,72,3.5,'blue',{x:8,y:-8}),
    zone('Klingon-side warm field',38,88,84,1.9,'warm'),
    zone('Romulan-side anomalous field',31,78,65,1.5,'green',{x:10,y:-8}),
    zone('Vulcan neighbourhood',12,24,23,.95,'warm'),
    zone('Vega blue-rich concentration',58,24,27,3.9,'blue'),
    Object.freeze({name:'Outer chart gap',x:-285,y:-145,rx:80,ry:72,density:.17,weights:Object.freeze(palettes.sol)}),
    zone('Harman anomaly outskirts',32,48,45,.38,'harman'),
    zone('Kardon anomaly field',33,47,43,.65,'kardon'),
    zone('Vex anomalous concentration',34,66,57,3.6,'vex'),
    zone('Badlands plasma obscuration',73,29,26,.24,'badlands')
  ].filter(Boolean));
  function hash(x,y,salt){
    let n=(Math.imul(x,374761393)^Math.imul(y,668265263)^salt)>>>0;
    n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
  }
  function noise(x,y,scale,salt){
    x/=scale;y/=scale;const ix=Math.floor(x),iy=Math.floor(y),tx=smooth(x-ix),ty=smooth(y-iy);
    return mix(mix(hash(ix,iy,salt),hash(ix+1,iy,salt),tx),mix(hash(ix,iy+1,salt),hash(ix+1,iy+1,salt),tx),ty);
  }
  function sampleAt(x,y){
    x=Number.isFinite(x)?x:0;y=Number.isFinite(y)?y:0;
    const blue=noise(x,y,71,0x424c5545),green=noise(x,y,59,0x47524545),warm=noise(x,y,83,0x52454453);
    const weights=[.27,.08+blue*.48,.04+blue*.10,.02+green*.32,.06+warm*.16,.03+warm*.32,.045];
    const total=weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++)weights[i]/=total;
    let density=.17+3.65*Math.pow(noise(x,y,62,0x44454e53),1.65),name='Interstellar mixed field';
    density*=.42+.85*noise(x,y,117,0x47415053);
    for(const region of regions){
      const distance=Math.hypot((x-region.x)/region.rx,(y-region.y)/region.ry),influence=smooth(1-distance);
      if(influence<=0)continue;
      density=mix(density,region.density,influence);
      for(let i=0;i<weights.length;i++)weights[i]=mix(weights[i],region.weights[i],influence);
      if(influence>.5)name=region.name;
    }
    return {x,y,name,density:clamp(density,.15,4),weights};
  }
  function sample(system,view={}){
    const p=position(system)||{x:0,y:0},scale=window.nativeManualFlight?.unitsPerChartPoint||1000;
    const localX=Number(view.playerX??view.cameraX)||0,localY=Number(view.playerY??view.cameraY)||0;
    return sampleAt(p.x+localX/scale,p.y+localY/scale);
  }
  const tile=8,resolution=3,cell=tile*resolution,counts=[135,100,65,32,12],rates=[.008,.025,.07,.16,.32],radii=[.33,.44,.60,.84,1.08];
  let atlas=null,builds=0;
  function prepare(){
    if(atlas)return atlas;
    const canvas=document.createElement('canvas');canvas.width=21*cell;canvas.height=10*cell;
    const ctx=canvas.getContext('2d');ctx.scale(resolution,resolution);
    for(let family=0;family<7;family++)for(let shade=0;shade<3;shade++)for(let layer=0;layer<5;layer++)for(let size=0;size<2;size++){
      const x=(family*3+shade)*tile+tile/2,y=(layer*2+size)*tile+tile/2,r=radii[layer]*(size?1.13:.88);
      ctx.fillStyle='#'+colors[family][shade].toString(16).padStart(6,'0');
      if(layer>=3){ctx.globalAlpha=.10;ctx.beginPath();ctx.arc(x,y,r*1.8,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=1;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    atlas=canvas;builds++;return atlas;
  }
  function create(){
    let seed=0x52454753;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const stars=[];
    for(let layer=0;layer<5;layer++)for(let i=0;i<counts[layer]*4;i++)stars.push(Object.freeze({
      x:random()*820-110,y:random()*670-110,layer,rate:rates[layer],
      rank:(i+.5)/counts[layer],colorRank:(i*73+layer*19)%128,shade:i%3,size:i%2,
      alpha:.34+random()*.46,phase:random()*Math.PI*2
    }));
    const colorMix=new Float32Array(128*7);
    let travelX=0,travelY=0,elapsed=0,lastRegion=null,last=null;
    function rebase(state){travelX+=state.travelX||0;travelY+=state.travelY||0;elapsed+=state.elapsed||0;}
    function render(ctx,view,state){
      const region=sample(state.system,view),image=prepare(),{w,h}=view;
      if(!lastRegion||region.x!==lastRegion.x||region.y!==lastRegion.y){
        for(let rank=0;rank<128;rank++){
          const u=(rank+.5)/128;let start=0;
          for(let family=0;family<7;family++){
            const end=start+region.weights[family];
            // Adjacent spectral bands crossfade as their regional shares change.
            colorMix[rank*7+family]=(family===0?1:smooth((u-start)/.045+.5))-(family===6?0:smooth((u-end)/.045+.5));
            start=end;
          }
        }
        lastRegion=region;
      }
      let visible=0,draws=0;const familyEnergy=[0,0,0,0,0,0,0];
      const ox=(w-600)/2,oy=(h-450)/2,tx=travelX+state.travelX,ty=travelY+state.travelY,time=elapsed+state.elapsed;
      const heading=Math.atan2(state.motionY,state.motionX),dx=Math.cos(heading),dy=Math.sin(heading);
      const motion=view.reducedMotion?0:state.speedEffect;
      ctx.save();
      for(const star of stars){
        const presence=smooth((region.density-star.rank)/.16+.5);if(presence===0)continue;
        const alpha=star.alpha*presence*(view.reducedMotion?1:1+.045*Math.sin(time*.325+star.phase));
        const x=star.x+tx*star.rate+ox,y=star.y+ty*star.rate+oy;
        const length=star.layer>=2?motion*((star.layer-1)*9+state.warp*(18+star.layer*8)):0;
        const glowLength=star.layer>=3&&motion>.01?(star.layer===4?34:20)*motion:0;
        const margin=Math.max(4,length,glowLength),radius=radii[star.layer]*(star.size?1.13:.88),halfWidth=radius*.4;
        const minX=Math.ceil((-margin-x)/820),maxX=Math.floor((w+margin-x)/820),minY=Math.ceil((-margin-y)/670),maxY=Math.floor((h+margin-y)/670);
        if(minX>maxX||minY>maxY)continue;
        const row=(star.layer*2+star.size)*cell;
        for(let ix=minX;ix<=maxX;ix++)for(let iy=minY;iy<=maxY;iy++){
          const px=x+ix*820,py=y+iy*670;if(px<-margin||px>w+margin||py<-margin||py>h+margin)continue;
          visible+=presence;
          for(let family=0;family<7;family++){
            const weight=colorMix[star.colorRank*7+family];if(weight<.001)continue;
            ctx.globalAlpha=alpha*weight;familyEnergy[family]+=alpha*weight;
            ctx.drawImage(image,(family*3+star.shade)*cell,row,cell,cell,px-4,py-4,tile,tile);draws++;
            const tint=colors[family][star.shade];
            if(length>.6){
              // Original narrow diamond: stretch only along the travel axis.
              ctx.fillStyle='#'+tint.toString(16).padStart(6,'0');
              ctx.globalAlpha=alpha*weight*.007*Math.min(35,8+length);
              ctx.beginPath();ctx.moveTo(px-dy*halfWidth,py+dx*halfWidth);
              ctx.lineTo(px+dx*length,py+dy*length);ctx.lineTo(px+dy*halfWidth,py-dx*halfWidth);
              ctx.lineTo(px-dx*length,py-dy*length);ctx.closePath();ctx.fill();
            }
            if(glowLength>0){
              const composite=ctx.globalCompositeOperation;
              const gradient=ctx.createLinearGradient(px-dx*glowLength,py-dy*glowLength,px,py);
              const rgb=`${tint>>16&255},${tint>>8&255},${tint&255}`;
              gradient.addColorStop(0,`rgba(${rgb},0)`);
              gradient.addColorStop(1,`rgba(${rgb},${.45*motion*presence*weight})`);
              ctx.globalCompositeOperation='screen';ctx.globalAlpha=1;
              ctx.strokeStyle=gradient;ctx.lineWidth=Math.max(.65,radius*.8);
              ctx.beginPath();ctx.moveTo(px-dx*glowLength,py-dy*glowLength);ctx.lineTo(px,py);ctx.stroke();
              ctx.globalCompositeOperation=composite;
            }
          }
        }
      }
      ctx.restore();
      last={...region,visible,draws,familyEnergy,pool:stars.length,atlasBuilds:builds,textures:210};
    }
    return Object.freeze({render,rebase,prepare,metrics:()=>last&&{...last,weights:[...last.weights],familyEnergy:[...last.familyEnergy]}});
  }
  window.nativeRegionalStarfield=Object.freeze({create,sample,sampleAt,regions,families,colors,prepare});
})();
