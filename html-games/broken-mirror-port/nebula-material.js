/* Persistent cosmetic gas. World-space material transport, never ship physics. */
(() => {
  'use strict';
  const root=typeof window==='undefined'?self:window;
  const moduleURL=typeof document==='undefined'?null:document.currentScript?.src;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t;
  const supported=id=>Number.isInteger(Number(id))&&Number(id)>=0;
  function createMask(alpha,w,h,aspect=w/h,nearest=true){
    const count=w*h,nearestX=nearest?new Int16Array(count):null,nearestY=nearest?new Int16Array(count):null,distance=nearest?new Float32Array(count):null,sx=aspect/w,sy=1/h;
    if(nearest){
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,empty=alpha[i]<48;nearestX[i]=empty?x:-1;nearestY[i]=empty?y:-1;distance[i]=empty?0:1e9;}
    function visit(x,y,dx,dy){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)return;const i=y*w+x,j=ny*w+nx;if(nearestX[j]<0)return;
      const d=Math.pow((x-nearestX[j])*sx,2)+Math.pow((y-nearestY[j])*sy,2);if(d<distance[i]){distance[i]=d;nearestX[i]=nearestX[j];nearestY[i]=nearestY[j];}}
    for(let pass=0;pass<2;pass++){
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){visit(x,y,-1,0);visit(x,y,0,-1);visit(x,y,-1,-1);visit(x,y,1,-1);}
      for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){visit(x,y,1,0);visit(x,y,0,1);visit(x,y,1,1);visit(x,y,-1,1);}
    }
    }
    // Sub-grid surface streams follow open runs between real pieces of hull.
    // Sampling several places across each run avoids treating pylons as air.
    const channels=[],openings=new Uint8Array(count);
    for(let y=0;y<h;y++){let left=0,right=w-1;while(left<w&&alpha[y*w+left]<48)left++;while(right>left&&alpha[y*w+right]<48)right--;
      for(let x=left;x<=right;x++)if(alpha[y*w+x]<48)openings[y*w+x]=255-alpha[y*w+x];}
    for(let band=0;band<16;band++){
      const y=Math.min(h-1,Math.floor(h*(.08+(band+.5)*.055)));let left=0,right=w-1;
      while(left<w&&alpha[y*w+left]<48)left++;while(right>left&&alpha[y*w+right]<48)right--;
      for(let x=left;x<=right;x++)if(alpha[y*w+x]<48){const first=x;while(x<=right&&alpha[y*w+x]<48)x++;const span=x-first;
        if(span>=2)for(const t of [.25,.5,.75])channels.push({u:(first+span*t)/w,v:(y+.5)/h,weight:span/3});}
    }
    return {alpha,w,h,nearestX,nearestY,aspect,channels,openings};
  }
  const masks=new WeakMap(),typeMasks=new Map();let sampledMasks=0;
  function openingArt(mask){const air=document.createElement('canvas');air.width=mask.w;air.height=mask.h;const ctx=air.getContext('2d'),pixels=ctx.createImageData(mask.w,mask.h);for(let i=0;i<mask.alpha.length;i++)pixels.data[i*4+3]=mask.openings[i];ctx.putImageData(pixels,0,0);return air;}
  function maskForType(type,stage=0){
    const key=Number(type)+':'+clamp(Number(stage)||0,0,3);if(typeMasks.has(key))return typeMasks.get(key);
    const record=root.nativeNebulaHullMasks?.masks?.[key];if(!record)return null;
    const bytes=atob(record.runs),alpha=new Uint8Array(record.w*record.h);let offset=0;
    for(let y=0;y<record.h;y++){let x=0,value=0;while(x<record.w){const length=bytes.charCodeAt(offset)|(bytes.charCodeAt(offset+1)<<8);offset+=2;if(!Number.isFinite(length)||length>record.w-x||offset>bytes.length)throw Error('Invalid hull mask '+key);if(value)alpha.fill(255,y*record.w+x,y*record.w+x+length);x+=length;value=1-value;}}
    const mask=createMask(alpha,record.w,record.h,record.aspect,false);mask.fogPivot=record.pivot;
    if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=mask.w;canvas.height=mask.h;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(mask.w,mask.h);for(let i=0;i<alpha.length;i++)pixels.data[i*4+3]=alpha[i];ctx.putImageData(pixels,0,0);mask.art=mask.stencil=canvas;mask.openingStencil=openingArt(mask);}
    typeMasks.set(key,mask);return mask;
  }
  function maskFor(asset){
    const art=asset?.art;if(!art)return null;const cacheKey=asset;if(masks.has(cacheKey))return masks.get(cacheKey);
    const w=160,h=Math.max(160,Math.round(w*(art.height||art.naturalHeight)/(art.width||art.naturalWidth))),canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(art,0,0,w,h);
    const rgba=ctx.getImageData(0,0,w,h).data,alpha=new Uint8Array(w*h);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
    const mask=createMask(alpha,w,h,(art.width||art.naturalWidth)/(art.height||art.naturalHeight),false);mask.art=art;mask.stencil=canvas;
    mask.openingStencil=openingArt(mask);mask.fogPivot=asset.fogPivot;sampledMasks++;
    masks.set(cacheKey,mask);return mask;
  }
  function maskIndex(mask,pose,x,y){
    const dx=x-pose.x,dy=y-pose.y,c=pose.cos??Math.cos(pose.heading),s=pose.sin??Math.sin(pose.heading),u=.5+(-s*dx+c*dy)*(pose.invWidth??1/pose.width),v=.5-(c*dx+s*dy)*(pose.invHeight??1/pose.height);
    if(u<0||v<0||u>=1||v>=1)return -1;return Math.floor(v*mask.h)*mask.w+Math.floor(u*mask.w);
  }
  const occupied=(mask,pose,x,y)=>{const i=maskIndex(mask,pose,x,y);return i>=0&&mask.alpha[i]>=48;};
  function createField({minX,minY,width,height,cell=2,uniform=1}={}){
    const w=Math.ceil(width/cell),h=Math.ceil(height/cell),count=w*h;
    // Keep the 30 Hz momentum advection stable, including diagonal flow.
    const velocityLimit=Math.min(40,cell*30*.64),velocityLimit2=velocityLimit*velocityLimit;
    const tileSize=16,tileColumns=Math.ceil(w/tileSize),tileRows=Math.ceil(h/tileSize);let activeTiles=new Set();
    const density=new Float32Array(count).fill(uniform),baseline=new Float32Array(density),u=new Float32Array(count),v=new Float32Array(count),delta=new Float32Array(count),nextU=new Float32Array(count),nextV=new Float32Array(count),solid=new Uint8Array(count),swept=new Uint8Array(count),solidOwner=new Int32Array(count);
    let tracks=new Map(),actorCount=0;
    let currentSolid=[],previous=null,revision=1,clock=0,pending=0,bounds=null,dirty={x:0,y:0,w,h},lastVelocity={x:0,y:0},sweeps=0,removed=0,initialMass=count*uniform,flowSpeed=0,travelDistance=0;
    function fastAmount(){const t=clamp((flowSpeed-140)/290,0,1);return t*t*(3-2*t);}
    function touch(x,y){
      if(x<1||y<1||x>=w-1||y>=h-1)return;
      activeTiles.add(Math.floor(y/tileSize)*tileColumns+Math.floor(x/tileSize));
      if(!bounds)bounds={x0:x,y0:y,x1:x,y1:y};else{bounds.x0=Math.min(bounds.x0,x);bounds.y0=Math.min(bounds.y0,y);bounds.x1=Math.max(bounds.x1,x);bounds.y1=Math.max(bounds.y1,y);}
      if(!dirty)dirty={x,y,w:1,h:1};else{const x0=Math.min(dirty.x,x),y0=Math.min(dirty.y,y),x1=Math.max(dirty.x+dirty.w,x+1),y1=Math.max(dirty.y+dirty.h,y+1);dirty.x=x0;dirty.y=y0;dirty.w=x1-x0;dirty.h=y1-y0;}
    }
    function seed(rgba,sw,sh){
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const px=clamp((x+.5)/w*sw-.5,0,sw-1),py=clamp((y+.5)/h*sh-.5,0,sh-1),ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(sw-1,ix+1),jy=Math.min(sh-1,iy+1);
        const a=mix(mix(rgba[(iy*sw+ix)*4+3],rgba[(iy*sw+jx)*4+3],px-ix),mix(rgba[(jy*sw+ix)*4+3],rgba[(jy*sw+jx)*4+3],px-ix),py-iy)/255;
        density[y*w+x]=-Math.log(Math.max(.001,1-a));
      }baseline.set(density);initialMass=0;for(const d of density)initialMass+=d;revision++;dirty={x:0,y:0,w,h};
    }
    function prepareMask(mask){if(!mask.nearestX){const resolved=createMask(mask.alpha,mask.w,mask.h,mask.aspect);mask.nearestX=resolved.nearestX;mask.nearestY=resolved.nearestY;}return mask;}
    function markSolid(mask,pose,owner){
      const c=Math.cos(pose.heading),s=Math.sin(pose.heading),ex=(Math.abs(s)*pose.width+Math.abs(c)*pose.height)/2,ey=(Math.abs(c)*pose.width+Math.abs(s)*pose.height)/2;
      const body={...pose,cos:c,sin:s,invWidth:1/pose.width,invHeight:1/pose.height};
      const x0=clamp(Math.floor((pose.x-ex-minX)/cell),1,w-2),x1=clamp(Math.ceil((pose.x+ex-minX)/cell),1,w-2),y0=clamp(Math.floor((pose.y-ey-minY)/cell),1,h-2),y1=clamp(Math.ceil((pose.y+ey-minY)/cell),1,h-2);
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(occupied(mask,body,minX+(x+.5)*cell,minY+(y+.5)*cell)){
        const i=y*w+x;if(!solid[i]){solid[i]=1;solidOwner[i]=owner;currentSolid.push(i);}else if(solidOwner[i]!==owner)solidOwner[i]=-1;
      }
    }
    function stamp(mask,pose,velocity,owner,fast,eddy){
      const c=Math.cos(pose.heading),s=Math.sin(pose.heading),ex=(Math.abs(s)*pose.width+Math.abs(c)*pose.height)/2,ey=(Math.abs(c)*pose.width+Math.abs(s)*pose.height)/2;
      pose={...pose,cos:c,sin:s,invWidth:1/pose.width,invHeight:1/pose.height};
      const maxExit=Math.ceil(Math.hypot(pose.width,pose.height)/cell)*3+8;
      const x0=clamp(Math.floor((pose.x-ex-minX)/cell)-1,1,w-2),x1=clamp(Math.ceil((pose.x+ex-minX)/cell)+1,1,w-2),y0=clamp(Math.floor((pose.y-ey-minY)/cell)-1,1,h-2),y1=clamp(Math.ceil((pose.y+ey-minY)/cell)+1,1,h-2),deposits=[];
      const motionSpeed=Math.hypot(velocity.x,velocity.y),channels=[];let channelWeight=0,channelMass=0;
      if(motionSpeed>.1)for(const point of mask.channels||[]){const lx=(point.u-.5)*pose.width,ly=(.5-point.v)*pose.height,x=Math.floor((pose.x+c*ly-s*lx-minX)/cell),y=Math.floor((pose.y+s*ly+c*lx-minY)/cell);
        if(x<1||y<1||x>=w-1||y>=h-1||solid[y*w+x]&&solidOwner[y*w+x]!==owner||occupied(mask,pose,minX+(x+.5)*cell,minY+(y+.5)*cell))continue;
        channels.push({x,y,i:y*w+x,weight:point.weight,side:Math.sign(lx)});channelWeight+=point.weight;}
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const wx=minX+(x+.5)*cell,wy=minY+(y+.5)*cell,mi=maskIndex(mask,pose,wx,wy);if(mi<0||mask.alpha[mi]<48)continue;
        const i=y*w+x;swept[i]=1;const amount=density[i];u[i]=0;v[i]=0;
        if(amount<1e-8)continue;
        const nx=mask.nearestX[mi],ny=mask.nearestY[mi];if(nx<0)continue;
        const lx=((nx+.5)/mask.w-.5)*pose.width,ly=(.5-(ny+.5)/mask.h)*pose.height;
        let tx=pose.x+c*ly-s*lx,ty=pose.y+s*ly+c*lx,dx=tx-wx,dy=ty-wy,length=Math.hypot(dx,dy)||1;dx/=length;dy/=length;
        const surfaceX=velocity.x-(velocity.angular||0)*(wy-pose.y),surfaceY=velocity.y+(velocity.angular||0)*(wx-pose.x),motion=Math.hypot(surfaceX,surfaceY);
        if(motion>.1){const sideX=-surfaceY/motion,sideY=surfaceX/motion,cross=(wx-pose.x)*sideX+(wy-pose.y)*sideY,sign=Math.abs(cross)>.001?Math.sign(cross):(i%2?1:-1);
          // The bow splits the flow; flanks retain their actual surface normal,
          // including inward-facing nacelle edges and the open channels aft.
          const bow=clamp((dx*surfaceX+dy*surfaceY)/motion,0,1)*(.65-.20*fast);
          dx=dx*(1-bow)+sideX*sign*bow;dy=dy*(1-bow)+sideY*sign*bow;const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;tx=wx;ty=wy;}
        let exit=false;
        for(let attempt=0;attempt<maxExit;attempt++){
          tx+=dx*cell;ty+=dy*cell;const gx=Math.floor((tx-minX)/cell),gy=Math.floor((ty-minY)/cell);
          if(gx<1||gy<1||gx>=w-1||gy>=h-1)break;
          const index=gy*w+gx;
          if(!(solid[index]&&solidOwner[index]!==owner)&&!occupied(mask,pose,minX+(gx+.5)*cell,minY+(gy+.5)*cell)){exit=true;break;}
        }
        if(!exit)continue;
        const gx=Math.floor((tx-minX)/cell),gy=Math.floor((ty-minY)/cell);if(gx<1||gy<1||gx>=w-1||gy>=h-1)continue;
        const entrained=channelWeight&&mi<mask.w*mask.h*.48?amount*Math.min(.22,motionSpeed/700):0;channelMass+=entrained;
        density[i]=0;removed+=amount;touch(x,y);deposits.push({i:gy*w+gx,x:gx,y:gy,amount:amount-entrained,dx,dy,vx:surfaceX,vy:surfaceY});
      }
      for(const d of deposits){
        const motion=Math.hypot(d.vx,d.vy),leading=Math.max(0,d.vx*d.dx+d.vy*d.dy)/Math.max(1,motion),push=Math.min(28+16*fast,motion*(.25+.05*fast))*(.35+.65*leading);
        const side=(minX+(d.x+.5)*cell-pose.x)*(-velocity.y)+(minY+(d.y+.5)*cell-pose.y)*velocity.x;
        // Alternating flank shear is deposited into the material. It stays in
        // world space and advects after passage, including during braking.
        const shear=eddy*fast*(side<0?-1:1)*8,carry=.008+.026*fast;
        let vx=d.dx*push+d.vx*carry-d.dy*shear,vy=d.dy*push+d.vy*carry+d.dx*shear;
        const square=vx*vx+vy*vy;if(square>velocityLimit2){const scale=velocityLimit/Math.sqrt(square);vx*=scale;vy*=scale;}
        const targets=[];let sum=0;
        for(let offset=-2;offset<=2;offset++){
          const x=Math.round(d.x-d.dy*offset),y=Math.round(d.y+d.dx*offset),weight=mix([.0625,.25,.375,.25,.0625][offset+2],[.01,.09,.80,.09,.01][offset+2],fast*leading);
          if(x<1||y<1||x>=w-1||y>=h-1||solid[y*w+x]&&solidOwner[y*w+x]!==owner||occupied(mask,pose,minX+(x+.5)*cell,minY+(y+.5)*cell))continue;
          targets.push({i:y*w+x,x,y,weight});sum+=weight;
        }
        if(!targets.length){targets.push({i:d.i,x:d.x,y:d.y,weight:1});sum=1;}
        for(const target of targets){const amount=d.amount*target.weight/sum,old=density[target.i],total=old+amount;
          u[target.i]=(u[target.i]*old+vx*amount)/Math.max(1e-9,total);v[target.i]=(v[target.i]*old+vy*amount)/Math.max(1e-9,total);density[target.i]=total;touch(target.x,target.y);}
      }
      // This is transported bow material, not a source or an attached overlay.
      // Short unresolved streams around the saucer deliver it into actual air
      // openings; subsequent motion and refill belong to the world-space grid.
      if(channelMass)for(const target of channels){const amount=channelMass*target.weight/channelWeight,old=density[target.i],total=old+amount,inward=-target.side*Math.min(20+6*fast,motionSpeed*(.06+.02*fast));
        let vx=velocity.x*(.025+.05*fast)-s*inward,vy=velocity.y*(.025+.05*fast)+c*inward;
        const square=vx*vx+vy*vy;if(square>velocityLimit2){const scale=velocityLimit/Math.sqrt(square);vx*=scale;vy*=scale;}
        u[target.i]=(u[target.i]*old+vx*amount)/total;v[target.i]=(v[target.i]*old+vy*amount)/total;density[target.i]=total;touch(target.x,target.y);}
      if(deposits.length)revision++;sweeps++;
    }
    function flow(dt,reduced){
      if(!activeTiles.size)return;
      const work=new Set();for(const id of activeTiles){const x=id%tileColumns,y=Math.floor(id/tileColumns);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<tileColumns&&y+dy>=0&&y+dy<tileRows)work.add((y+dy)*tileColumns+x+dx);}
      const tiles=Array.from(work).sort((a,b)=>a-b).map(id=>{const tx=id%tileColumns,ty=Math.floor(id/tileColumns);return {id,x0:Math.max(1,tx*tileSize),y0:Math.max(1,ty*tileSize),x1:Math.min(w-2,(tx+1)*tileSize-1),y1:Math.min(h-2,(ty+1)*tileSize-1)};});
      const drag=Math.exp(-dt/1.6),diffusion=.12*dt/(cell*cell),advection=dt/cell;
      for(const b of tiles)for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++){
        const i=y*w+x;if(solid[i]){nextU[i]=0;nextV[i]=0;continue;}
        const gx=((density[i+1]-baseline[i+1])-(density[i-1]-baseline[i-1]))/(cell*2),gy=((density[i+w]-baseline[i+w])-(density[i-w]-baseline[i-w]))/(cell*2);
        // Carry momentum with the gas. Perturbation pressure returns compressed
        // banks to the wake without flattening the untouched procedural cloud.
        const vx0=u[i],vy0=v[i],duDx=vx0>=0?vx0-u[i-1]:u[i+1]-vx0,duDy=vy0>=0?vx0-u[i-w]:u[i+w]-vx0;
        const dvDx=vx0>=0?vy0-v[i-1]:v[i+1]-vy0,dvDy=vy0>=0?vy0-v[i-w]:v[i+w]-vy0;
        let nextX=(vx0-(vx0*duDx+vy0*duDy)*advection+(-gx*18+(u[i+1]+u[i-1]+u[i+w]+u[i-w]-vx0*4)*.10)*dt)*drag;
        let nextY=(vy0-(vx0*dvDx+vy0*dvDy)*advection+(-gy*18+(v[i+1]+v[i-1]+v[i+w]+v[i-w]-vy0*4)*.10)*dt)*drag;
        // Float32 subnormals in quiet gas are invisible but make scalar math
        // extremely expensive on some CPUs. Keep the resolved flow normal.
        if(nextX<1e-12&&nextX> -1e-12)nextX=0;if(nextY<1e-12&&nextY> -1e-12)nextY=0;
        if(reduced){nextX*=.5;nextY*=.5;}const square=nextX*nextX+nextY*nextY;if(square>velocityLimit2){const scale=velocityLimit/Math.sqrt(square);nextX*=scale;nextY*=scale;}nextU[i]=nextX;nextV[i]=nextY;
      }
      const velocityStep=dt/(cell*2);
      for(const b of tiles)for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++){
        const i=y*w+x;if(solid[i])continue;
        const di=density[i],change=di-baseline[i];
        if(x<w-2&&!solid[i+1]&&(x< b.x1||work.has(b.id+1))){const j=i+1,a=(nextU[i]+nextU[j])*velocityStep;let amount=a*(a>=0?di:density[j])+(change-(density[j]-baseline[j]))*diffusion;
          if(amount>di*.24)amount=di*.24;else if(amount< -density[j]*.24)amount= -density[j]*.24;delta[i]-=amount;delta[j]+=amount;}
        if(y<h-2&&!solid[i+w]&&(y< b.y1||work.has(b.id+tileColumns))){const j=i+w,a=(nextV[i]+nextV[j])*velocityStep;let amount=a*(a>=0?di:density[j])+(change-(density[j]-baseline[j]))*diffusion;
          if(amount>di*.24)amount=di*.24;else if(amount< -density[j]*.24)amount= -density[j]*.24;delta[i]-=amount;delta[j]+=amount;}
      }
      for(const b of tiles){let changed=false;
      for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++){
        const i=y*w+x,change=delta[i],value=density[i]+change;density[i]=value<1e-20&&value> -1e-20?0:value;delta[i]=0;u[i]=nextU[i];v[i]=nextV[i];
        if(Math.abs(change)>1e-12||u[i]!==0||v[i]!==0)changed=true;
      }
      if(changed){touch(b.x0,b.y0);touch(b.x1,b.y1);}}
      revision++;
    }
    function updateMany(bodies,dt,{suspended=false,reducedMotion=false,rebase=false}={}){
      if(suspended||!(dt>0))return;
      clock+=dt;
      const actors=bodies.filter(b=>b.pose&&b.mask&&b.pose.width>0&&b.pose.height>0).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      actorCount=actors.length;
      for(const i of currentSolid){solid[i]=0;solidOwner[i]=0;}currentSolid=[];
      for(let index=0;index<actors.length;index++){const b=actors[index];prepareMask(b.mask);markSolid(b.mask,b.pose,index+1);}
      const seen=new Set();
      for(let index=0;index<actors.length;index++){
      const {id,pose,mask}=actors[index],key=String(id);seen.add(key);
      const track=tracks.get(key)||{previous:null,flowSpeed:0,travelDistance:0};
      previous=rebase?null:track.previous;flowSpeed=track.flowSpeed;travelDistance=track.travelDistance;
      const old=previous||pose,dx=pose.x-old.x,dy=pose.y-old.y,angle=Math.atan2(Math.sin(pose.heading-old.heading),Math.cos(pose.heading-old.heading));
      const teleport=Math.hypot(dx,dy)>Math.max(600,(pose.speed||0)*dt*4+100),velocity=teleport?{x:0,y:0,angular:0}:{x:dx/dt,y:dy/dt,angular:angle/dt};lastVelocity=velocity;
      const actualSpeed=Math.hypot(velocity.x,velocity.y),distance=teleport?0:Math.hypot(dx,dy);
      if(teleport)flowSpeed=0;else flowSpeed=mix(flowSpeed,actualSpeed,1-Math.exp(-dt/(actualSpeed>flowSpeed ? .22 : .45)));
      travelDistance+=distance;const fast=fastAmount()*Math.min(1,actualSpeed/140);
      const travel=teleport?0:Math.hypot(dx,dy)+Math.abs(angle)*Math.hypot(pose.width,pose.height)*.5,steps=Math.max(1,Math.ceil(travel/(cell*.65)));
      for(let step=1;step<=steps;step++){
        const t=teleport?1:step/steps,p={...pose,x:mix(old.x,pose.x,t),y:mix(old.y,pose.y,t),heading:old.heading+angle*t};
        const eddy=reducedMotion?0:Math.sin((travelDistance-distance*(1-t))/Math.max(cell,pose.width*.50));
        stamp(mask,p,velocity,index+1,fast,eddy);
      }
      tracks.set(key,{previous:{...pose},flowSpeed,travelDistance,lastVelocity:{...velocity}});
      }
      for(const key of tracks.keys())if(!seen.has(key))tracks.delete(key);
      const primary=tracks.get('player')||tracks.values().next().value;
      previous=primary?.previous||null;flowSpeed=primary?.flowSpeed||0;travelDistance=primary?.travelDistance||0;lastVelocity=primary?.lastVelocity||{x:0,y:0,angular:0};
      pending+=dt;let serviced=0;while(pending>=1/30&&serviced<4){flow(1/30,reducedMotion);pending-=1/30;serviced++;}
    }
    function update(pose,mask,dt,options){if(pose&&mask)updateMany([{id:'player',pose,mask}],dt,options);}
    function sample(x,y,data=density){const px=(x-minX)/cell-.5,py=(y-minY)/cell-.5;if(px<0||py<0||px>w-1||py>h-1)return 0;
      const ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1);return mix(mix(data[iy*w+ix],data[iy*w+jx],px-ix),mix(data[jy*w+ix],data[jy*w+jx],px-ix),py-iy);}
    function metrics(audit=false){const result={w,h,cell,clock,revision,initialMass,sweeps,removed,pending,lastVelocity:{...lastVelocity},flowSpeed,fastFlow:fastAmount(),travelDistance,actorCount,actorIds:Array.from(tracks.keys()),activeBounds:bounds&&{...bounds},activeTiles:activeTiles.size,bytes:count*34};
      if(audit){let mass=0,min=Infinity,max=0;for(const d of density){mass+=d;min=Math.min(min,d);max=Math.max(max,d);}Object.assign(result,{mass,min,max});}return result;}
    function pack(data,rect){const out=new data.constructor(rect?rect.w*rect.h:0);if(rect)for(let y=0;y<rect.h;y++)out.set(data.subarray((rect.y+y)*w+rect.x,(rect.y+y)*w+rect.x+rect.w),y*rect.w);return out;}
    function densityPatch(){const rect=dirty&&{...dirty};return {rect,density:pack(density,rect)};}
    function checkpoint(override=dirty){
      const rect=override&&{...override};
      return {rect,density:pack(density,rect),u:pack(u,rect),v:pack(v,rect),swept:pack(swept,rect),solid:Uint32Array.from(currentSolid),state:{previous,revision,clock,pending,bounds,lastVelocity,sweeps,removed,initialMass,flowSpeed,travelDistance,tracks:Array.from(tracks),actorCount,tiles:Array.from(activeTiles)}};
    }
    function restore(snapshot){
      density.set(snapshot.density);u.set(snapshot.u);v.set(snapshot.v);nextU.set(u);nextV.set(v);swept.set(snapshot.swept);solid.fill(0);currentSolid=Array.from(snapshot.solid||[]);for(const i of currentSolid)solid[i]=1;
      ({previous,revision,clock,pending,bounds,lastVelocity,sweeps,removed,initialMass}=snapshot.state);dirty={x:0,y:0,w,h};
      flowSpeed=snapshot.state.flowSpeed||0;travelDistance=snapshot.state.travelDistance||0;
      tracks=new Map(snapshot.state.tracks||previous&&[['player',{previous,flowSpeed,travelDistance,lastVelocity}]]||[]);actorCount=snapshot.state.actorCount??tracks.size;solidOwner.fill(0);
      activeTiles=new Set(snapshot.state.tiles||[]);
    }
    return {minX,minY,width:w*cell,height:h*cell,w,h,cell,density,seed,update,updateMany,sample,sampleInitial:(x,y)=>sample(x,y,baseline),metrics,densityPatch,checkpoint,restore,get revision(){return revision;},get dirty(){return dirty;},uploaded(){dirty=null;}};
  }
  function createRuntimeField(config){
    if(typeof Worker!=='function')return createField(config);
    let worker;try{const base=new URL(moduleURL||location.href),url=new URL('nebula-material-worker.js',base);url.search=base.search;worker=new Worker(url);}catch{return createField(config);}
    const {minX,minY,cell=2}=config,w=Math.ceil(config.width/cell),h=Math.ceil(config.height/cell),count=w*h;
    const density=new Float32Array(count),recoveryDensity=new Float32Array(count),shadowU=new Float32Array(count),shadowV=new Float32Array(count),shadowSwept=new Uint8Array(count),maskIds=new WeakMap(),knownMasks=new Map(),waiters=[];
    let seedData=null,seedW=0,seedH=0,ready=false,busy=true,closed=false,local=null,commands=[],sequence=0,processed=0,published=0,clock=0,revision=0,dirty=null,solid=new Uint32Array(0),state=null,summary={},nextMask=1,failure=null,publishedBodies=[],currentBodies=[],pendingCacheKey='',pendingCache=[];
    function mark(rect){if(!rect)return;if(!dirty){dirty={...rect};return;}const x0=Math.min(dirty.x,rect.x),y0=Math.min(dirty.y,rect.y),x1=Math.max(dirty.x+dirty.w,rect.x+rect.w),y1=Math.max(dirty.y+dirty.h,rect.y+rect.h);dirty={x:x0,y:y0,w:x1-x0,h:y1-y0};}
    function settle(){for(let i=waiters.length-1;i>=0;i--)if(local||published>=waiters[i].sequence){waiters[i].resolve();waiters.splice(i,1);}}
    function send(){if(closed||local||!ready||busy)return;const pending=commands.filter(c=>c.sequence>processed);
      if(pending.length){busy=true;worker.postMessage({kind:'advance',commands:pending});}
      else if(waiters.some(w=>w.sequence>published)){busy=true;worker.postMessage({kind:'publish'});}}
    function fallback(reason='explicit recovery'){
      if(closed||local)return;worker?.terminate();worker=null;failure=reason;
      local=createField(config);if(seedData)local.seed(seedData,seedW,seedH);
      if(state)local.restore({density:recoveryDensity,u:shadowU,v:shadowV,swept:shadowSwept,solid,state});
      for(const c of commands)local.updateMany(c.bodies.map(b=>({id:b.id,pose:b.pose,mask:knownMasks.get(b.maskId)})),c.dt,c.options);processed=published=sequence;commands=[];ready=true;busy=false;revision++;settle();
    }
    worker.onmessage=event=>{
      if(closed||!worker||local)return;const message=event.data;
      if(message.kind==='error'){fallback(message.reason);return;}
      const patch=message.checkpoint||message.frame,rect=patch?.rect;
      if(rect)for(let y=0;y<rect.h;y++){const from=y*rect.w,to=(rect.y+y)*w+rect.x;density.set(patch.density.subarray(from,from+rect.w),to);
        if(message.checkpoint){recoveryDensity.set(patch.density.subarray(from,from+rect.w),to);shadowU.set(patch.u.subarray(from,from+rect.w),to);shadowV.set(patch.v.subarray(from,from+rect.w),to);shadowSwept.set(patch.swept.subarray(from,from+rect.w),to);}}
      if(patch){mark(rect);published=message.sequence;publishedBodies=message.bodies||[];revision++;}
      if(message.checkpoint){solid=patch.solid;state=patch.state;commands=commands.filter(c=>c.sequence>message.sequence);
        const keep=new Set(publishedBodies.map(b=>b.maskId));for(const b of currentBodies)keep.add(maskIds.get(b.mask));for(const c of commands)for(const b of c.bodies)keep.add(b.maskId);
        const release=[];for(const id of knownMasks.keys())if(!keep.has(id)){knownMasks.delete(id);release.push(id);}if(release.length)worker.postMessage({kind:'release',ids:release});}
      summary=message.metrics;processed=message.sequence;ready=true;busy=false;settle();send();
    };
    worker.onerror=event=>{event.preventDefault();fallback(event.message||'Worker failed');};
    function seed(rgba,sw,sh){seedData=new Uint8ClampedArray(rgba);seedW=sw;seedH=sh;worker.postMessage({kind:'init',config,rgba:seedData,sw,sh});}
    function updateMany(bodies,dt,options={}){
      if(closed||options.suspended||!(dt>0))return;clock+=dt;
      currentBodies=bodies.filter(b=>b.mask&&b.pose).map(b=>({id:String(b.id),pose:{...b.pose},mask:b.mask}));
      if(local){local.updateMany(currentBodies,dt,options);return;}
      const packed=currentBodies.map(b=>{const mask=b.mask;let maskId=maskIds.get(mask);
        if(!maskId||!knownMasks.has(maskId)){maskId=maskId||nextMask++;maskIds.set(mask,maskId);knownMasks.set(maskId,mask);worker.postMessage({kind:'mask',id:maskId,mask:{alpha:mask.alpha,w:mask.w,h:mask.h,aspect:mask.aspect}});}
        return {id:b.id,pose:b.pose,maskId};});
      commands.push({sequence:++sequence,bodies:packed,dt,options:{...options}});send();
    }
    function update(pose,mask,dt,options){if(pose&&mask)updateMany([{id:'player',pose,mask}],dt,options);}
    function initialCell(x,y){
      if(!seedData)return config.uniform??1;const px=clamp((x+.5)/w*seedW-.5,0,seedW-1),py=clamp((y+.5)/h*seedH-.5,0,seedH-1),ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(seedW-1,ix+1),jy=Math.min(seedH-1,iy+1);
      const a=mix(mix(seedData[(iy*seedW+ix)*4+3],seedData[(iy*seedW+jx)*4+3],px-ix),mix(seedData[(jy*seedW+ix)*4+3],seedData[(jy*seedW+jx)*4+3],px-ix),py-iy)/255;return Math.fround(-Math.log(Math.max(.001,1-a)));
    }
    function initial(x,y){const px=(x-minX)/cell-.5,py=(y-minY)/cell-.5;if(px<0||py<0||px>w-1||py>h-1)return 0;const ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1);return mix(mix(initialCell(ix,iy),initialCell(jx,iy),px-ix),mix(initialCell(ix,jy),initialCell(jx,jy),px-ix),py-iy);}
    function pendingMasks(){
      if(local||closed)return [];const key=sequence+':'+published;if(key===pendingCacheKey)return pendingCache;
      const result=new Map(),previous=new Map(publishedBodies.map(b=>[b.id,b.pose]));
      for(const command of commands){if(command.sequence<=published)continue;for(const body of command.bodies){const p=body.pose,old=command.options.rebase?p:previous.get(body.id)||p,angle=Math.atan2(Math.sin(p.heading-old.heading),Math.cos(p.heading-old.heading)),travel=Math.hypot(p.x-old.x,p.y-old.y);
        const count=travel>Math.max(600,(p.speed||0)*command.dt*4+100)?1:Math.max(1,Math.ceil(Math.max(travel/Math.max(cell,Math.min(p.width,p.height)*.12),Math.abs(angle)/.10)));
        const samples=result.get(body.id)||[];
        for(let step=1;step<=Math.min(32,count);step++){const t=step/Math.min(32,count);samples.push({...p,id:body.id,x:mix(old.x,p.x,t),y:mix(old.y,p.y,t),heading:old.heading+angle*t,mask:knownMasks.get(body.maskId)});}
        result.set(body.id,samples.slice(-32));previous.set(body.id,p);
      }}pendingCacheKey=key;pendingCache=Array.from(result.values()).flat();return pendingCache;
    }
    function sampleDensity(x,y){if(local)return local.sample(x,y);
      const px=(x-minX)/cell-.5,py=(y-minY)/cell-.5;if(px<0||py<0||px>w-1||py>h-1)return 0;if(!ready)return initial(x,y);
      const ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1);return mix(mix(density[iy*w+ix],density[iy*w+jx],px-ix),mix(density[jy*w+ix],density[jy*w+jx],px-ix),py-iy);
    }
    function sample(x,y){if(local)return local.sample(x,y);let opening=false;
      for(const b of currentBodies){if(occupied(b.mask,b.pose,x,y))return 0;const index=maskIndex(b.mask,b.pose,x,y);if(index>=0&&b.mask.openings?.[index])opening=true;}
      if(!opening)for(const p of pendingMasks())if(occupied(p.mask,p,x,y))return 0;
      return sampleDensity(x,y);
    }
    function metrics(audit=false){const pending=commands.filter(c=>c.sequence>processed),result=local?local.metrics(audit):{...summary,w,h,cell,clock,revision};Object.assign(result,{transport:local?'synchronous-fallback':'worker',workerReady:ready,queuedPoses:pending.length,queuedSeconds:pending.reduce((n,c)=>n+c.dt,0),workerClock:summary.clock||0,failure});
      if(audit&&!local){let mass=0,min=Infinity,max=0;for(const d of density){mass+=d;min=Math.min(min,d);max=Math.max(max,d);}Object.assign(result,{mass,min,max});}return result;}
    const timer=setTimeout(()=>{if(!ready&&!closed)fallback('Worker startup timeout');},3000);
    return {minX,minY,width:w*cell,height:h*cell,w,h,cell,seed,update,updateMany,sample,sampleDensity,sampleInitial:(x,y)=>local?local.sampleInitial(x,y):initial(x,y),metrics,
      get currentBodies(){return currentBodies;},
      get density(){return local?local.density:density;},get revision(){return local?local.revision:revision;},get dirty(){return local?local.dirty:dirty;},get ready(){return ready;},get pendingMasks(){return pendingMasks();},get pendingRevision(){return sequence+':'+published;},
      uploaded(){if(local)local.uploaded();else dirty=null;},flush(){if(local||ready&&published>=sequence)return Promise.resolve();return new Promise(resolve=>{waiters.push({sequence,resolve});send();});},forceFallback:fallback,
      dispose(){closed=true;clearTimeout(timer);worker?.terminate();worker=null;for(const waiter of waiters)waiter.resolve();waiters.length=0;commands=[];currentBodies=[];publishedBodies=[];pendingCache=[];knownMasks.clear();}};
  }
  const vertex=`#version 300 es
  precision highp float;out vec2 uv;
  void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`;
  const fragment=`#version 300 es
  precision highp float;in vec2 uv;out vec4 colour;
  uniform sampler2D u_source,u_density,u_mask;uniform vec2 u_view,u_camera,u_origin,u_grid;
  uniform float u_zoom,u_cell,u_fraction;uniform vec4 u_body;uniform vec2 u_axis;
  uniform bool u_ready,u_screenMask,u_worldSource;
  float rho(ivec2 p){if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,ivec2(u_grid))))return 0.0;return texelFetch(u_density,p,0).r;}
  vec4 weights(float t){float t2=t*t,t3=t2*t;return vec4(1.0-3.0*t+3.0*t2-t3,4.0-6.0*t2+3.0*t3,1.0+3.0*t+3.0*t2-3.0*t3,t3)/6.0;}
  void main(){
    vec2 pixel=vec2(uv.x,1.0-uv.y)*u_view,world=u_camera+(pixel-u_view*.5)/u_zoom,p=(world-u_origin)/u_cell-.5;
    ivec2 i=ivec2(floor(p));vec2 f=fract(p);vec4 wx=weights(f.x),wy=weights(f.y);float material=0.0;
    for(int y=0;y<4;y++)for(int x=0;x<4;x++)material+=rho(i+ivec2(x-1,y-1))*wx[x]*wy[y];
    vec2 sourceUV=u_worldSource?(world-u_origin)/(u_grid*u_cell):pixel/u_view;
    vec4 source=texture(u_source,sourceUV);if(!u_ready)material=-log(max(.001,1.0-source.a));
    vec2 d=world-u_body.xy,local=vec2(dot(d,vec2(-u_axis.y,u_axis.x)),-dot(d,u_axis));vec2 hull=.5+local/u_body.zw;float coverage=0.0;
    if(u_screenMask)coverage=texture(u_mask,pixel/u_view).a;
    else if(all(greaterThanEqual(hull,vec2(0)))&&all(lessThanEqual(hull,vec2(1))))coverage=texture(u_mask,hull).a;
    // The combined screen mask has one more rasterization than original art.
    // Clear its partially covered boundary samples as well as opaque interiors.
    material*=1.0-smoothstep(u_screenMask?.04:.06,u_screenMask?.16:.30,coverage);vec3 tint=source.a>.005?source.rgb/source.a:vec3(.12,.26,.23);
    float alpha=1.0-exp(-max(0.0,material)*u_fraction);colour=vec4(tint*alpha,alpha);
  }`;
  const pairFragment=fragment.replace('out vec4 colour;','layout(location=0) out vec4 backColour;layout(location=1) out vec4 frontColour;').replace('float alpha=1.0-exp(-max(0.0,material)*u_fraction);colour=vec4(tint*alpha,alpha);','float backAlpha=1.0-exp(-max(0.0,material)*.80),frontAlpha=1.0-exp(-max(0.0,material)*.20);backColour=vec4(tint*backAlpha,backAlpha);frontColour=vec4(tint*frontAlpha,frontAlpha);');
  let output=null,gl=null,program=null,pairProgram=null,vao=null,textures=null,locations=null,pairLocations=null,lost=false,failed=false,cpu=null,uploadedField=null,uploadedRevision=-1,uploadedMask=null,uploadedMaskVersion=-1;
  let pairFramebuffer=null,pairTextures=null,pairWidth=0,pairHeight=0,pairImages=null,coverageCanvas=null,coverageVersion=0,coverageArtwork='';
  const coverageIds=new WeakMap();let nextCoverageId=1;
  const coverageMask={art:null,screen:true,version:0};
  function bodiesOf(pose,mask){return Array.isArray(pose)?pose:pose&&mask?[{id:'player',pose,mask}]:[];}
  function coverageFor(view,bodies){
    if(bodies.length===1)return bodies[0].mask;
    const ratio=Math.min(1,1600/view.w,1000/view.h),w=Math.round(view.w*ratio),h=Math.round(view.h*ratio),zoom=view.zoom||1;
    const artwork=bodies.map(({mask})=>{let id=coverageIds.get(mask);if(!id){id=nextCoverageId++;coverageIds.set(mask,id);}return id;}).sort((a,b)=>a-b).join(':');
    // A fresh backing surface on artwork changes avoids stale raster snapshots
    // across damaged variants. Ordinary moving frames reuse the same surface.
    if(!coverageCanvas||artwork!==coverageArtwork){coverageCanvas=document.createElement('canvas');coverageCanvas.dataset.nebulaCoverage='hulls';coverageArtwork=artwork;}
    if(coverageCanvas.width!==w||coverageCanvas.height!==h){coverageCanvas.width=w;coverageCanvas.height=h;}
    const ctx=coverageCanvas.getContext('2d');ctx.clearRect(0,0,w,h);
    for(const {pose:p,mask} of bodies){ctx.save();ctx.translate((view.w/2+(p.x-view.cameraX)*zoom)*ratio,(view.h/2+(p.y-view.cameraY)*zoom)*ratio);ctx.rotate(p.heading+Math.PI/2);ctx.drawImage(mask.art,-p.width*zoom*ratio/2,-p.height*zoom*ratio/2,p.width*zoom*ratio,p.height*zoom*ratio);ctx.restore();}
    coverageVersion++;coverageMask.art=coverageCanvas;coverageMask.version=coverageVersion;return coverageMask;
  }
  let pendingCanvas=null,emptyCanvas=null,pendingField=null,pendingKey='',pendingVersion=0;
  function pendingSurface(view,field,bodyInput){
    const pending=field.pendingMasks||[];
    if(!pending.length){emptyCanvas||=document.createElement('canvas');if(emptyCanvas.width!==1||emptyCanvas.height!==1){emptyCanvas.width=1;emptyCanvas.height=1;}return {source:emptyCanvas,version:0};}
    const key=[view.w,view.h,view.cameraX,view.cameraY,view.zoom,field.pendingRevision].join(':');
    if(pendingField===field&&pendingKey===key)return {source:pendingCanvas,version:pendingVersion};
    pendingCanvas||=document.createElement('canvas');if(pendingCanvas.width!==view.w||pendingCanvas.height!==view.h){pendingCanvas.width=view.w;pendingCanvas.height=view.h;}
    const ctx=pendingCanvas.getContext('2d'),zoom=view.zoom||1;ctx.clearRect(0,0,view.w,view.h);
    const bodies=Array.isArray(bodyInput)?bodyInput:field.currentBodies?.length?field.currentBodies:pending.length?[{id:'player',pose:bodyInput,mask:pending[pending.length-1].mask}]:[];
    const currentById=new Map(bodies.map(b=>[b.id||'player',b.pose]));
    for(const p of pending){const pose=currentById.get(p.id||'player');if(pose&&Math.abs(p.x-pose.x)+Math.abs(p.y-pose.y)+Math.abs(p.heading-pose.heading)<1e-6)continue;
      ctx.save();ctx.translate(view.w/2+(p.x-view.cameraX)*zoom,view.h/2+(p.y-view.cameraY)*zoom);ctx.rotate(p.heading+Math.PI/2);ctx.drawImage(p.mask.stencil||p.mask.art,-p.width*zoom/2,-p.height*zoom/2,p.width*zoom,p.height*zoom);ctx.restore();}
    // Recent swept silhouettes must not close the present nacelle openings.
    // The exact current hull is still cleared by the normal material pass.
    for(const {pose,mask} of bodies)if(mask.openingStencil){ctx.save();ctx.globalCompositeOperation='destination-out';ctx.translate(view.w/2+(pose.x-view.cameraX)*zoom,view.h/2+(pose.y-view.cameraY)*zoom);ctx.rotate(pose.heading+Math.PI/2);ctx.drawImage(mask.openingStencil,-pose.width*zoom/2,-pose.height*zoom/2,pose.width*zoom,pose.height*zoom);ctx.restore();}
    pendingField=field;pendingKey=key;pendingVersion++;return {source:pendingCanvas,version:pendingVersion};
  }
  function clearPending(ctx,view,field,pose){
    const pending=pendingSurface(view,field,pose);if(pending.source.width===1)return;
    ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-out';ctx.drawImage(pending.source,0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();
  }
  const stats={renders:0,pairRenders:0,compiles:0,failures:0,contextLosses:0};
  function prepare(){
    if(program&&!lost||failed||lost)return;
    if(!output){output=document.createElement('canvas');output.dataset.nebulaMaterial='persistent';output.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;program=null;stats.contextLosses++;});output.addEventListener('webglcontextrestored',()=>{lost=false;failed=false;program=null;});}
    try{
      gl=output.getContext('webgl2',{alpha:true,premultipliedAlpha:true,depth:false,stencil:false,antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
      const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
      const link=source=>{const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,source),p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;};
      program=link(fragment);pairProgram=link(pairFragment);
      vao=gl.createVertexArray();textures=[gl.createTexture(),gl.createTexture(),gl.createTexture()];locations={};
      pairLocations={};for(const name of ['u_source','u_density','u_mask','u_view','u_camera','u_origin','u_grid','u_zoom','u_cell','u_fraction','u_body','u_axis','u_ready','u_screenMask','u_worldSource']){locations[name]=gl.getUniformLocation(program,name);pairLocations[name]=gl.getUniformLocation(pairProgram,name);}
      uploadedField=null;uploadedRevision=-1;uploadedMask=null;uploadedMaskVersion=-1;pairFramebuffer=null;pairTextures=null;pairWidth=pairHeight=0;stats.compiles++;
    }catch(error){program=null;failed=true;stats.failures++;stats.reason=String(error.message||error);}
  }
  function fallback(view,source,field,pose,mask,fraction,options={}){
    if(!cpu){const canvas=document.createElement('canvas'),read=document.createElement('canvas'),hull=document.createElement('canvas');cpu={canvas,ctx:canvas.getContext('2d'),read,readCtx:read.getContext('2d',{willReadFrequently:true}),hull,hullCtx:hull.getContext('2d',{willReadFrequently:true})};}
    const ratio=Math.min(1,960/view.w,720/view.h),w=Math.round(view.w*ratio),h=Math.round(view.h*ratio);cpu.canvas.width=w;cpu.canvas.height=h;cpu.read.width=source.width;cpu.read.height=source.height;cpu.readCtx.drawImage(source,0,0);
    cpu.hull.width=w;cpu.hull.height=h;const hc=cpu.hullCtx,zoom=view.zoom||1;
    for(const {pose:p,mask:m} of options.bodies||[{pose,mask}]){hc.save();hc.translate((view.w/2+(p.x-view.cameraX)*zoom)*ratio,(view.h/2+(p.y-view.cameraY)*zoom)*ratio);hc.rotate(p.heading+Math.PI/2);hc.drawImage(m.art,-p.width*zoom*ratio/2,-p.height*zoom*ratio/2,p.width*zoom*ratio,p.height*zoom*ratio);hc.restore();}
    const hull=hc.getImageData(0,0,w,h).data,raw=cpu.readCtx.getImageData(0,0,source.width,source.height).data,image=cpu.ctx.createImageData(w,h),data=image.data,sample=field.sampleDensity||field.sample;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const wx=view.cameraX+((x+.5)/ratio-view.w/2)/view.zoom,wy=view.cameraY+((y+.5)/ratio-view.h/2)/view.zoom;
      let d=hull[(y*w+x)*4+3]>=40?0:sample(wx,wy);
      const alpha=1-Math.exp(-Math.max(0,d)*fraction),u=options.worldSource?(wx-field.minX)/field.width:(x+.5)/w,v=options.worldSource?(wy-field.minY)/field.height:(y+.5)/h;
      const sx=clamp(Math.floor(u*source.width),0,source.width-1),sy=clamp(Math.floor(v*source.height),0,source.height-1),j=(sy*source.width+sx)*4,i=(y*w+x)*4;
      for(let c=0;c<3;c++)data[i+c]=raw[j+3]>1?raw[j+c]:[31,66,59][c];data[i+3]=alpha*255;
    }cpu.ctx.putImageData(image,0,0);return cpu.canvas;
  }
  function ensurePair(w,h){
    if(pairFramebuffer&&pairWidth===w&&pairHeight===h){gl.bindFramebuffer(gl.FRAMEBUFFER,pairFramebuffer);return;}
    pairFramebuffer||=gl.createFramebuffer();pairTextures||=[gl.createTexture(),gl.createTexture()];gl.bindFramebuffer(gl.FRAMEBUFFER,pairFramebuffer);
    for(let i=0;i<2;i++){gl.bindTexture(gl.TEXTURE_2D,pairTextures[i]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,pairTextures[i],0);}
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Fog layer framebuffer unavailable');pairWidth=w;pairHeight=h;
  }
  function retainPair(frame,index){pairImages||=[document.createElement('canvas'),document.createElement('canvas')];const canvas=pairImages[index];if(canvas.width!==frame.width||canvas.height!==frame.height){canvas.width=frame.width;canvas.height=frame.height;}const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(frame,0,0);return canvas;}
  function render(view,source,field,pose,mask,fraction,options={}){
    prepare();stats.renders++;if(!program||lost||failed){if(options.pair){const back=retainPair(fallback(view,source,field,pose,mask,.8,options),0),front=retainPair(fallback(view,source,field,pose,mask,.2,options),1);return {back,front};}return fallback(view,source,field,pose,mask,fraction,options);}
    const ratio=Math.min(1,1600/view.w,1000/view.h),w=Math.round(view.w*ratio),h=Math.round(view.h*ratio);if(output.width!==w||output.height!==h){output.width=w;output.height=h;}
    if(options.pair)ensurePair(w,h);else gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const loc=options.pair?pairLocations:locations;
    gl.viewport(0,0,w,h);gl.disable(gl.BLEND);gl.useProgram(options.pair?pairProgram:program);gl.bindVertexArray(vao);
    for(let t=0;t<3;t++){
      gl.activeTexture(gl.TEXTURE0+t);gl.bindTexture(gl.TEXTURE_2D,textures[t]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,t===1?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,t===1?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(t===0){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);}
      if(t===1){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
        if(uploadedField!==field){gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,field.w,field.h,0,gl.RED,gl.FLOAT,field.density);uploadedField=field;uploadedRevision=field.revision;field.uploaded();}
        else if(uploadedRevision!==field.revision){const d=field.dirty;if(d){gl.pixelStorei(gl.UNPACK_ROW_LENGTH,field.w);gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,d.x);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,d.y);gl.texSubImage2D(gl.TEXTURE_2D,0,d.x,d.y,d.w,d.h,gl.RED,gl.FLOAT,field.density);gl.pixelStorei(gl.UNPACK_ROW_LENGTH,0);gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,0);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,0);}uploadedRevision=field.revision;field.uploaded();}}
      if(t===2&&(uploadedMask!==mask||uploadedMaskVersion!==(mask.version||0))){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,mask.art);uploadedMask=mask;uploadedMaskVersion=mask.version||0;}
      gl.uniform1i(loc[['u_source','u_density','u_mask'][t]],t);
    }
    gl.uniform2f(loc.u_view,view.w,view.h);gl.uniform2f(loc.u_camera,view.cameraX,view.cameraY);gl.uniform2f(loc.u_origin,field.minX,field.minY);gl.uniform2f(loc.u_grid,field.w,field.h);gl.uniform1f(loc.u_zoom,view.zoom||1);gl.uniform1f(loc.u_cell,field.cell);gl.uniform1f(loc.u_fraction,fraction);
    gl.uniform4f(loc.u_body,pose.x,pose.y,pose.width,pose.height);gl.uniform2f(loc.u_axis,Math.cos(pose.heading),Math.sin(pose.heading));
    gl.uniform1i(loc.u_ready,field.ready!==false?1:0);gl.uniform1i(loc.u_screenMask,mask.screen?1:0);gl.uniform1i(loc.u_worldSource,options.worldSource?1:0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    if(options.pair){for(let i=0;i<2;i++){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,pairFramebuffer);gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);gl.blitFramebuffer(0,0,w,h,0,0,w,h,gl.COLOR_BUFFER_BIT,gl.NEAREST);retainPair(output,i);}gl.bindFramebuffer(gl.FRAMEBUFFER,null);stats.pairRenders++;return {back:pairImages[0],front:pairImages[1]};}
    return output;
  }
  function renderPair(view,source,field,bodies,options={}){const mask=coverageFor(view,bodies),pose=bodies[0]?.pose||{x:0,y:0,width:1,height:1,heading:0};return render(view,source,field,pose,mask,1,{...options,bodies,pair:true});}
  root.nativeNebulaMaterial=Object.freeze({supported,createMask,maskFor,maskForType,maskIndex,occupied,createField,createRuntimeField,render,renderPair,clearPending,metrics:()=>({...stats,sampledMasks,cachedHullTypes:typeMasks.size,backend:program&&!lost&&!failed?'webgl2':'canvas-material',contextLost:lost})});
})();
