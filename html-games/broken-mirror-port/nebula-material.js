/* Persistent cosmetic gas. World-space material transport, never ship physics. */
(() => {
  'use strict';
  const root=typeof window==='undefined'?self:window;
  const moduleURL=typeof document==='undefined'?null:document.currentScript?.src;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t;
  const plasmaColour=[.98,.64,.27];
  const supported=id=>Number.isInteger(Number(id))&&Number(id)>=0;
  function createMask(alpha,w,h,aspect=w/h,nearest=true){
    const count=w*h,nearestX=nearest?new Int16Array(count):null,nearestY=nearest?new Int16Array(count):null,distance=nearest?new Float32Array(count):null,sx=aspect/w,sy=1/h;
    if(nearest){
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,empty=alpha[i]<48;nearestX[i]=empty?x:-1;nearestY[i]=empty?y:-1;distance[i]=empty?0:1e9;}
    function visit(x,y,dx,dy){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)return;const i=y*w+x,j=ny*w+nx;if(nearestX[j]<0)return;
      const d=Math.pow((x-nearestX[j])*sx,2)+Math.pow((y-nearestY[j])*sy,2);if(d<distance[i]){distance[i]=d;nearestX[i]=nearestX[j];nearestY[i]=nearestY[j];}}
    for(let pass=0;pass<2;pass++){
      // Empty pixels already have the exact minimum distance. Only occupied
      // hull pixels can improve; retain the reference visitation/tie order.
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(distance[y*w+x]!==0){visit(x,y,-1,0);visit(x,y,0,-1);visit(x,y,-1,-1);visit(x,y,1,-1);}
      for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--)if(distance[y*w+x]!==0){visit(x,y,1,0);visit(x,y,0,1);visit(x,y,1,1);visit(x,y,-1,1);}
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
  const masks=new WeakMap(),typeMasks=new Map(),recordMasks=new WeakMap();let sampledMasks=0;
  function openingArt(mask){const air=document.createElement('canvas');air.width=mask.w;air.height=mask.h;const ctx=air.getContext('2d'),pixels=ctx.createImageData(mask.w,mask.h);for(let i=0;i<mask.alpha.length;i++)pixels.data[i*4+3]=mask.openings[i];ctx.putImageData(pixels,0,0);return air;}
  function maskForRecord(record){
    if(!record)return null;if(recordMasks.has(record))return recordMasks.get(record);
    const bytes=atob(record.runs),alpha=new Uint8Array(record.w*record.h);let offset=0;
    for(let y=0;y<record.h;y++){let x=0,value=0;while(x<record.w){const length=bytes.charCodeAt(offset)|(bytes.charCodeAt(offset+1)<<8);offset+=2;if(!Number.isFinite(length)||length>record.w-x||offset>bytes.length)throw Error('Invalid nebula mask');if(value)alpha.fill(255,y*record.w+x,y*record.w+x+length);x+=length;value=1-value;}}
    const mask=createMask(alpha,record.w,record.h,record.aspect,false);mask.fogPivot=record.pivot;
    if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=mask.w;canvas.height=mask.h;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(mask.w,mask.h);for(let i=0;i<alpha.length;i++)pixels.data[i*4+3]=alpha[i];ctx.putImageData(pixels,0,0);mask.art=mask.stencil=canvas;mask.openingStencil=openingArt(mask);}
    recordMasks.set(record,mask);return mask;
  }
  function maskForType(type,stage=0){
    const key=Number(type)+':'+clamp(Number(stage)||0,0,3);if(typeMasks.has(key))return typeMasks.get(key);
    const mask=maskForRecord(root.nativeNebulaHullMasks?.masks?.[key]);if(mask)typeMasks.set(key,mask);return mask;
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
  // Merge identical opaque row runs into rectangles. Their swept polygons are
  // the actual binary artwork, including disconnected nacelles and openings.
  function hullRectangles(mask){
    if(mask.rectangles)return mask.rectangles;const rectangles=[];let previous=new Map();
    for(let y=0;y<mask.h;y++){const next=new Map();for(let x=0;x<mask.w;x++)if(mask.alpha[y*mask.w+x]>=48){const first=x;while(x<mask.w&&mask.alpha[y*mask.w+x]>=48)x++;const key=first+':'+x,old=previous.get(key),r=old||{x:first,y,w:x-first,h:0};r.h++;if(!old)rectangles.push(r);next.set(key,r);}previous=next;}
    return mask.rectangles=rectangles;
  }
  function sweptPolygons(mask,from,to,emit){
    const angle=Math.atan2(Math.sin(to.heading-from.heading),Math.cos(to.heading-from.heading)),heading=from.heading+angle*.5,c=Math.cos(heading),s=Math.sin(heading),dx=to.x-from.x,dy=to.y-from.y;
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for(const r of hullRectangles(mask)){
      const points=[];for(const v of [r.y,r.y+r.h])for(const u of [r.x,r.x+r.w]){const lx=(u/mask.w-.5)*to.width,ly=(.5-v/mask.h)*to.height,x=from.x+c*ly-s*lx,y=from.y+s*ly+c*lx;points.push({x,y},{x:x+dx,y:y+dy});}
      points.sort((a,b)=>a.x-b.x||a.y-b.y);const polygon=[];
      for(const p of points){while(polygon.length>=2&&cross(polygon.at(-2),polygon.at(-1),p)<=0)polygon.pop();polygon.push(p);}const lower=polygon.length;
      for(let i=points.length-2;i>=0;i--){const p=points[i];while(polygon.length>lower&&cross(polygon.at(-2),polygon.at(-1),p)<=0)polygon.pop();polygon.push(p);}polygon.pop();emit(polygon);
    }
  }
  function createField({minX,minY,width,height,cell=2,uniform=1,sleepVelocity=1,sleepChange=5e-4,sleepCurvature=1/128,motionEpsilon=1e-4,accelerated=true,reuseStationary=true}={}){
    const w=Math.ceil(width/cell),h=Math.ceil(height/cell),count=w*h;
    // Keep the 30 Hz momentum advection stable, including diagonal flow.
    const velocityLimit=Math.min(40,cell*30*.64),velocityLimit2=velocityLimit*velocityLimit;
    const tileSize=16,tileColumns=Math.ceil(w/tileSize),tileRows=Math.ceil(h/tileSize),tileCount=tileColumns*tileRows;let activeTiles=new Set();
    const kernel=accelerated?root.nativeNebulaFlowKernel?.create(count,tileCount,tileColumns,h):null,allocate=(Type,length)=>kernel?kernel.allocate(Type,length):new Type(length);
    const tileBounds=Array.from({length:tileCount},(_,id)=>{const x=id%tileColumns,y=Math.floor(id/tileColumns);return {id,x,y,x0:Math.max(1,x*tileSize),y0:Math.max(1,y*tileSize),x1:Math.min(w-2,(x+1)*tileSize-1),y1:Math.min(h-2,(y+1)*tileSize-1)};}),workFlags=new Uint8Array(tileCount),workIds=[],dirtyTiles=new Uint8Array(tileCount);let dirtyAll=true;
    const density=allocate(Float32Array,count).fill(uniform),baseline=allocate(Float32Array,count),u=allocate(Float32Array,count),v=allocate(Float32Array,count),delta=allocate(Float32Array,count),nextU=allocate(Float32Array,count),nextV=allocate(Float32Array,count),solid=allocate(Uint8Array,count),swept=allocate(Uint8Array,count),solidOwner=allocate(Int32Array,count);baseline.set(density);
    // Exact differences of the Float32 material values, reused by both flow
    // passes. Float64 avoids adding a second rounding to the pressure field.
    const perturbation=allocate(Float64Array,count),rate=allocate(Float32Array,count);
    if(kernel)for(const b of tileBounds)kernel.boxes.set([b.x0,b.y0,b.x1,b.y1],b.id*4);
    let tracks=new Map(),actorCount=0;const previousMasks=new Map();
    let sweptCells=0,continuousSweeps=0;const sweepBits=allocate(Uint8Array,count);
    let currentSolid=[],previous=null,revision=1,clock=0,pending=0,bounds=null,dirty={x:0,y:0,w,h},lastVelocity={x:0,y:0},sweeps=0,removed=0,initialMass=count*uniform,flowSpeed=0,travelDistance=0;
    let flowOptions={reducedMotion:false,vortices:[]};
    function fastAmount(){const t=clamp((flowSpeed-140)/290,0,1);return t*t*(3-2*t);}
    function touch(x,y,activate=true){
      if(x<1||y<1||x>=w-1||y>=h-1)return;
      const tile=Math.floor(y/tileSize)*tileColumns+Math.floor(x/tileSize);dirtyTiles[tile]=1;if(activate)activeTiles.add(tile);
      if(!bounds)bounds={x0:x,y0:y,x1:x,y1:y};else{bounds.x0=Math.min(bounds.x0,x);bounds.y0=Math.min(bounds.y0,y);bounds.x1=Math.max(bounds.x1,x);bounds.y1=Math.max(bounds.y1,y);}
      if(!dirty)dirty={x,y,w:1,h:1};else{const x0=Math.min(dirty.x,x),y0=Math.min(dirty.y,y),x1=Math.max(dirty.x+dirty.w,x+1),y1=Math.max(dirty.y+dirty.h,y+1);dirty.x=x0;dirty.y=y0;dirty.w=x1-x0;dirty.h=y1-y0;}
    }
    function seed(rgba,sw,sh){
      previousMasks.clear();
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const px=clamp((x+.5)/w*sw-.5,0,sw-1),py=clamp((y+.5)/h*sh-.5,0,sh-1),ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(sw-1,ix+1),jy=Math.min(sh-1,iy+1);
        const a=mix(mix(rgba[(iy*sw+ix)*4+3],rgba[(iy*sw+jx)*4+3],px-ix),mix(rgba[(jy*sw+ix)*4+3],rgba[(jy*sw+jx)*4+3],px-ix),py-iy)/255;
        density[y*w+x]=-Math.log(Math.max(.001,1-a));
      }baseline.set(density);perturbation.fill(0);rate.fill(0);initialMass=0;for(const d of density)initialMass+=d;revision++;dirty={x:0,y:0,w,h};dirtyAll=true;
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
        if(!mask.nearestX)prepareMask(mask);
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
        density[i]=0;perturbation[i]=-baseline[i];rate[i]=0;removed+=amount;touch(x,y);deposits.push({i:gy*w+gx,x:gx,y:gy,amount:amount-entrained,dx,dy,vx:surfaceX,vy:surfaceY});
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
          u[target.i]=(u[target.i]*old+vx*amount)/Math.max(1e-9,total);v[target.i]=(v[target.i]*old+vy*amount)/Math.max(1e-9,total);density[target.i]=total;perturbation[target.i]=density[target.i]-baseline[target.i];rate[target.i]=0;touch(target.x,target.y);}
      }
      // This is transported bow material, not a source or an attached overlay.
      // Short unresolved streams around the saucer deliver it into actual air
      // openings; subsequent motion and refill belong to the world-space grid.
      if(channelMass)for(const target of channels){const amount=channelMass*target.weight/channelWeight,old=density[target.i],total=old+amount,inward=-target.side*Math.min(20+6*fast,motionSpeed*(.06+.02*fast));
        let vx=velocity.x*(.025+.05*fast)-s*inward,vy=velocity.y*(.025+.05*fast)+c*inward;
        const square=vx*vx+vy*vy;if(square>velocityLimit2){const scale=velocityLimit/Math.sqrt(square);vx*=scale;vy*=scale;}
        u[target.i]=(u[target.i]*old+vx*amount)/total;v[target.i]=(v[target.i]*old+vy*amount)/total;density[target.i]=total;perturbation[target.i]=density[target.i]-baseline[target.i];rate[target.i]=0;touch(target.x,target.y);}
      if(deposits.length)revision++;sweeps++;
    }
    function sweepTranslation(mask,from,to,velocity,fast){
      if(kernel?.raster&&hullRectangles(mask).length*4<=kernel.rectangles.length){
        if(!mask.sweepRectangles)mask.sweepRectangles=Float64Array.from(hullRectangles(mask).flatMap(r=>[r.x/mask.w,r.y/mask.h,(r.x+r.w)/mask.w,(r.y+r.h)/mask.h]));
        kernel.rectangles.set(mask.sweepRectangles);const angle=Math.atan2(Math.sin(to.heading-from.heading),Math.cos(to.heading-from.heading)),heading=from.heading+angle*.5;
        kernel.raster(w,h,cell,minX,minY,from.x,from.y,to.x-from.x,to.y-from.y,Math.cos(heading),Math.sin(heading),to.width,to.height,kernel.rectangles.byteOffset,mask.sweepRectangles.length/4,sweepBits.byteOffset,kernel.scratch.byteOffset,kernel.bounds.byteOffset,kernel.rowLow.byteOffset,kernel.rowHigh.byteOffset,kernel.projections.byteOffset);
        const speed=Math.hypot(velocity.x,velocity.y)||1,c=Math.abs(Math.cos(heading)),s=Math.abs(Math.sin(heading));
        kernel.displace(w,h,Math.abs(velocity.x)>=Math.abs(velocity.y),-velocity.y/speed,velocity.x/speed,Math.min(velocityLimit,Math.min(28+16*fast,speed*.30)),kernel.bounds.byteOffset,sweepBits.byteOffset,density.byteOffset,baseline.byteOffset,perturbation.byteOffset,u.byteOffset,v.byteOffset,rate.byteOffset,swept.byteOffset,solid.byteOffset,tileColumns,kernel.result.byteOffset,kernel.sweepResult.byteOffset,(from.x-minX)/cell-.5,(from.y-minY)/cell-.5,(to.x-from.x)/cell,(to.y-from.y)/cell,(s*to.width+c*to.height)/(cell*2),(c*to.width+s*to.height)/(cell*2));
        removed+=kernel.sweepResult[0];sweptCells+=kernel.sweepResult[1];
        for(let id=0;id<tileCount;id++)if(kernel.result[id]){const b=tileBounds[id];activeTiles.add(id);touch(b.x0,b.y0,false);touch(b.x1,b.y1,false);}
        if(kernel.bounds[0]<=kernel.bounds[2]&&kernel.bounds[1]<=kernel.bounds[3]){continuousSweeps++;revision++;}return;
      }
      sweepBits.fill(0);let x0=w,y0=h,x1=0,y1=0;
      sweptPolygons(mask,from,to,polygon=>{
        const p=polygon.map(v=>({x:(v.x-minX)/cell-.5,y:(v.y-minY)/cell-.5}));
        const first=clamp(Math.ceil(Math.min(...p.map(v=>v.y))),1,h-2),last=clamp(Math.floor(Math.max(...p.map(v=>v.y))),1,h-2);
        for(let y=first;y<=last;y++){let left=Infinity,right=-Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if(y>=Math.min(a.y,b.y)&&y<Math.max(a.y,b.y)){const x=a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y);left=Math.min(left,x);right=Math.max(right,x);}}
          const start=Math.max(1,Math.ceil(left)),end=Math.min(w-2,Math.ceil(right)-1);if(start>end)continue;
          sweepBits.fill(1,y*w+start,y*w+end+1);x0=Math.min(x0,start);x1=Math.max(x1,end);y0=Math.min(y0,y);y1=Math.max(y1,y);
        }
      });
      if(x0>x1||y0>y1)return;
      // Clear each covered cell once. Transport its mass to the two exposed
      // banks of each transverse run, rather than repeatedly pushing the same
      // gas through hundreds of intermediate copies of a travelling hull.
      const vertical=Math.abs(velocity.x)>=Math.abs(velocity.y),speed=Math.hypot(velocity.x,velocity.y)||1,sideX=-velocity.y/speed,sideY=velocity.x/speed,impulse=Math.min(velocityLimit,Math.min(28+16*fast,speed*.30));
      function bank(i,amount,sign){if(!(amount>0))return;const old=density[i],total=old+amount,vx=sideX*sign*impulse,vy=sideY*sign*impulse;u[i]=(u[i]*old+vx*amount)/total;v[i]=(v[i]*old+vy*amount)/total;density[i]=total;perturbation[i]=density[i]-baseline[i];rate[i]=0;touch(i%w,Math.floor(i/w));}
      const a0=vertical?x0:y0,a1=vertical?x1:y1,b0=vertical?y0:x0,b1=vertical?y1:x1,stride=vertical?w:1;
      for(let a=a0;a<=a1;a++)for(let b=b0;b<=b1;b++){
        let i=vertical?b*w+a:a*w+b;if(!sweepBits[i])continue;const first=b,start=i;
        while(b<=b1&&sweepBits[i]){b++;i+=stride;}const last=b-1,end=i-stride;
        let lower=start-stride,upper=end+stride,lo=first-1,hi=last+1;
        while(lo>=1&&(sweepBits[lower]||solid[lower])){lo--;lower-=stride;}
        while(hi<(vertical?h:w)-1&&(sweepBits[upper]||solid[upper])){hi++;upper+=stride;}
        const hasLower=lo>=1,hasUpper=hi<(vertical?h:w)-1;if(!hasLower&&!hasUpper)continue;
        let lowMass=0,highMass=0;
        for(let j=first,k=start;j<=last;j++,k+=stride){const amount=density[k];if(j-first<=last-j)lowMass+=amount;else highMass+=amount;density[k]=0;perturbation[k]=-baseline[k];rate[k]=0;u[k]=v[k]=0;swept[k]=1;sweptCells++;removed+=amount;
          if(j===first||j===last||j%tileSize===0)touch(vertical?a:j,vertical?j:a);
        }
        const sign=(vertical?sideY:sideX)>=0?1:-1;
        if(hasLower&&hasUpper){bank(lower,lowMass,-sign);bank(upper,highMass,sign);}else bank(hasLower?lower:upper,lowMass+highMass,hasLower?-sign:sign);
      }
      continuousSweeps++;revision++;
    }
    let vortexSteps=0,forcedCells=0,currentSteps=0,currentCells=0;
    const vortexTransport=new Map();
    function forceVortices(dt,vortices,seconds){
      const sampler=root.nativePlasmaVortices?.flowAt;if(!vortices.length||!sampler)return;
      vortexSteps++;
      const api=root.nativePlasmaVortices,prepared=api.prepareFlow&&api.preparedFlow&&api.flowSurge,retained=new Set();
      for(const vortex of vortices){
        const radius=vortex.radius*1.35,x0=clamp(Math.floor((vortex.x-radius-minX)/cell),1,w-2),x1=clamp(Math.ceil((vortex.x+radius-minX)/cell),1,w-2);
        const y0=clamp(Math.floor((vortex.y-radius-minY)/cell),1,h-2),y1=clamp(Math.ceil((vortex.y+radius-minY)/cell),1,h-2);
        if(prepared){
          // Funnel positions and their radial profiles are fixed in this field.
          // Reuse the shared owner's exact geometry; only the surge and curl
          // phase change at each fluid step. Group independent cells by tile.
          const key=[vortex.x,vortex.y,vortex.radius,vortex.direction,vortex.phase,vortex.strength,dt].join(':');retained.add(key);
          let cached=vortexTransport.get(key);
          if(!cached||cached.prepare!==api.prepareFlow){
            const tiles=new Map();
            for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
              const geometry=api.prepareFlow(vortex,minX+(x+.5)*cell,minY+(y+.5)*cell);if(!geometry)continue;
              const id=Math.floor(y/tileSize)*tileColumns+Math.floor(x/tileSize);let cells=tiles.get(id);if(!cells){cells=[];tiles.set(id,cells);}
              cells.push({i:y*w+x,x,y,geometry,blend:1-Math.exp(-dt*geometry.edge*2.4)});
            }
            cached={prepare:api.prepareFlow,tiles};vortexTransport.set(key,cached);
          }
          const surge=api.flowSurge(vortex,seconds),sample={};let left=w,top=h,right=-1,bottom=-1;
          for(const [id,cells] of cached.tiles){let touched=false;
            for(const point of cells){const {i,x,y,geometry:g,blend}=point;if(solid[i]||density[i]<=1e-8)continue;
              const f=api.preparedFlow(g,surge,sample),turbulent=.78+.22*Math.sin(g.turbulenceBase+seconds*.25+g.turbulenceOffset),scale=.10*turbulent;
              const inward=vortex.radius*.22*(1-f.surge)*f.edge*Math.min(1,f.distance/(vortex.radius*.16));
              u[i]+=(f.vx*scale-g.nx*inward-u[i])*blend;v[i]+=(f.vy*scale-g.ny*inward-v[i])*blend;
              const speed=Math.hypot(u[i],v[i]);if(speed>velocityLimit){u[i]*=velocityLimit/speed;v[i]*=velocityLimit/speed;}
              left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);touched=true;forcedCells++;
            }
            if(touched){activeTiles.add(id);dirtyTiles[id]=1;}
          }
          if(right>=left){touch(left,top,false);touch(right,bottom,false);}continue;
        }
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
          const i=y*w+x;if(solid[i]||density[i]<=1e-8)continue;
          const f=sampler(vortex,minX+(x+.5)*cell,minY+(y+.5)*cell,seconds);if(!f)continue;
          // Cosmetic material transport retains the solver's stable velocity
          // limit. Shared conservative flux moves existing gas between cells.
          const angle=Math.atan2(minY+(y+.5)*cell-vortex.y,minX+(x+.5)*cell-vortex.x);
          const turbulent=.78+.22*Math.sin(angle*3+vortex.phase+seconds*.25+.7*Math.sin(angle*5-f.distance/vortex.radius*4));
          const blend=1-Math.exp(-dt*f.edge*2.4),scale=.10*turbulent;
          const inward=vortex.radius*.22*(1-f.surge)*f.edge*Math.min(1,f.distance/(vortex.radius*.16));
          const nx=f.distance>1e-6?(minX+(x+.5)*cell-vortex.x)/f.distance:0,ny=f.distance>1e-6?(minY+(y+.5)*cell-vortex.y)/f.distance:0;
          u[i]+=(f.vx*scale-nx*inward-u[i])*blend;v[i]+=(f.vy*scale-ny*inward-v[i])*blend;
          const speed=Math.hypot(u[i],v[i]);if(speed>velocityLimit){u[i]*=velocityLimit/speed;v[i]*=velocityLimit/speed;}
          touch(x,y);forcedCells++;
        }
      }
      for(const key of vortexTransport.keys())if(!retained.has(key))vortexTransport.delete(key);
    }
    function forceCurrent(dt,current,seconds){
      const api=root.nativeBadlandsCurrents;if(!current||!api||!activeTiles.size||!currentSolid.length)return;
      currentSteps++;const f={},blend=1-Math.exp(-dt*1.3);
      // Reuse occupied fields' live tiles. Once their last hull leaves,
      // retained wakes coast and settle without keeping distant cores awake.
      // Background optical advection needs no additional simulation grid.
      for(const id of activeTiles){
        const tx=id%tileColumns,ty=Math.floor(id/tileColumns),x0=Math.max(1,tx*tileSize),x1=Math.min(w-2,(tx+1)*tileSize-1),y0=Math.max(1,ty*tileSize),y1=Math.min(h-2,(ty+1)*tileSize-1);
        api.sampleAt(current,minX+(x0+x1+1)*.5*cell,minY+(y0+y1+1)*.5*cell,seconds,f);if(f.edge<1e-6)continue;
        let vx=f.vx*.18,vy=f.vy*.18;const square=vx*vx+vy*vy;
        if(square>velocityLimit2){const scale=velocityLimit/Math.sqrt(square);vx*=scale;vy*=scale;}
        // Both endpoints obey the velocity limit, so their convex blend does
        // too. Clamp the tile target once instead of taking a sqrt per cell.
        for(let y=y0;y<=y1;y++)for(let i=y*w+x0,end=y*w+x1+1;i<end;i++){
          if(solid[i]||density[i]<=1e-8)continue;
          u[i]+=(vx-u[i])*blend;v[i]+=(vy-v[i])*blend;currentCells++;
        }
      }
    }
    function flow(dt,reduced){
      if(!activeTiles.size)return;
      workFlags.fill(0);workIds.length=0;
      for(const id of activeTiles){const b=tileBounds[id];for(let y=Math.max(0,b.y-1);y<=Math.min(tileRows-1,b.y+1);y++)for(let x=Math.max(0,b.x-1);x<=Math.min(tileColumns-1,b.x+1);x++)workFlags[y*tileColumns+x]=1;}
      for(let id=0;id<tileCount;id++)if(workFlags[id])workIds.push(id);
      const drag=Math.exp(-dt/1.6),diffusion=.12*dt/(cell*cell),advection=dt/cell,pressureScale=1/(cell*2),rateScale=1/dt;
      if(kernel){
        kernel.ids.set(workIds);kernel.flags.set(workFlags);
        kernel.run(w,h,cell,dt,drag,reduced,velocityLimit,velocityLimit2,density.byteOffset,baseline.byteOffset,perturbation.byteOffset,u.byteOffset,v.byteOffset,delta.byteOffset,nextU.byteOffset,nextV.byteOffset,solid.byteOffset,rate.byteOffset,kernel.ids.byteOffset,workIds.length,kernel.boxes.byteOffset,kernel.flags.byteOffset,tileColumns,kernel.result.byteOffset,sleepVelocity,sleepChange,motionEpsilon,sleepCurvature);
        const nextActive=new Set();for(const id of workIds){const flags=kernel.result[id],b=tileBounds[id];if(flags&2)nextActive.add(id);if(flags&1){touch(b.x0,b.y0,false);touch(b.x1,b.y1,false);}}
        activeTiles=nextActive;revision++;return;
      }
      for(const id of workIds){const b=tileBounds[id];for(let y=b.y0;y<=b.y1;y++)for(let i=y*w+b.x0,end=y*w+b.x1;i<=end;i++){
        if(solid[i]){nextU[i]=0;nextV[i]=0;continue;}
        // Empty interiors carry no gas momentum. A neighboring gas cell wakes
        // this stencil before material can arrive on the following flow step.
        if(density[i]===0&&density[i-1]===0&&density[i+1]===0&&density[i-w]===0&&density[i+w]===0){nextU[i]=0;nextV[i]=0;continue;}
        const center=perturbation[i],gx=((solid[i+1]?center:perturbation[i+1])-(solid[i-1]?center:perturbation[i-1]))*pressureScale,gy=((solid[i+w]?center:perturbation[i+w])-(solid[i-w]?center:perturbation[i-w]))*pressureScale;
        // Carry momentum with the gas. Perturbation pressure returns compressed
        // banks to the wake without flattening the untouched procedural cloud.
        const vx0=u[i],vy0=v[i],ul=u[i-1],ur=u[i+1],ud=u[i+w],uu=u[i-w],vl=v[i-1],vr=v[i+1],vd=v[i+w],vu=v[i-w],sumU=ur+ul+ud+uu,sumV=vr+vl+vd+vu;
        if(vx0===0&&vy0===0&&gx===0&&gy===0&&sumU===0&&sumV===0){nextU[i]=0;nextV[i]=0;continue;}
        const duDx=vx0>=0?vx0-ul:ur-vx0,duDy=vy0>=0?vx0-uu:ud-vx0,dvDx=vx0>=0?vy0-vl:vr-vy0,dvDy=vy0>=0?vy0-vu:vd-vy0;
        let nextX=(vx0-(vx0*duDx+vy0*duDy)*advection+(-gx*18+(sumU-vx0*4)*.10)*dt)*drag;
        let nextY=(vy0-(vx0*dvDx+vy0*dvDy)*advection+(-gy*18+(sumV-vy0*4)*.10)*dt)*drag;
        // Suppress numerical momentum tails below the visual motion floor.
        // At the default floor, 15 seconds is under .002 world units of travel.
        if(nextX<motionEpsilon&&nextX> -motionEpsilon)nextX=0;if(nextY<motionEpsilon&&nextY> -motionEpsilon)nextY=0;
        if(reduced){nextX*=.5;nextY*=.5;}const square=nextX*nextX+nextY*nextY;if(square>velocityLimit2){const scale=velocityLimit/Math.sqrt(square);nextX*=scale;nextY*=scale;}nextU[i]=nextX;nextV[i]=nextY;
      }}
      const velocityStep=dt/(cell*2);
      for(const id of workIds){const b=tileBounds[id],right=workFlags[id+1],below=workFlags[id+tileColumns];for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0,i=y*w+x;x<=b.x1;x++,i++){
        if(solid[i])continue;
        const di=density[i],change=perturbation[i];
        if(x<w-2&&!solid[i+1]&&(x<b.x1||right)){const j=i+1,a=(nextU[i]+nextU[j])*velocityStep;let amount=a*(a>=0?di:density[j])+(change-perturbation[j])*diffusion;
          if(amount>di*.24)amount=di*.24;else if(amount< -density[j]*.24)amount= -density[j]*.24;if(amount!==0){delta[i]-=amount;delta[j]+=amount;}}
        if(y<h-2&&!solid[i+w]&&(y<b.y1||below)){const j=i+w,a=(nextV[i]+nextV[j])*velocityStep;let amount=a*(a>=0?di:density[j])+(change-perturbation[j])*diffusion;
          if(amount>di*.24)amount=di*.24;else if(amount< -density[j]*.24)amount= -density[j]*.24;if(amount!==0){delta[i]-=amount;delta[j]+=amount;}}
      }}
      const nextActive=new Set();
      for(const id of workIds){const b=tileBounds[id];let changed=false,moving=false;
      for(let y=b.y0;y<=b.y1;y++)for(let i=y*w+b.x0,end=y*w+b.x1;i<=end;i++){
        const change=delta[i],value=density[i]+change;if(change===0&&nextU[i]===0&&nextV[i]===0&&u[i]===0&&v[i]===0&&rate[i]===0)continue;
        const oldRate=rate[i];rate[i]=change*rateScale;density[i]=value<1e-20&&value> -1e-20?0:value;perturbation[i]=density[i]-baseline[i];delta[i]=0;u[i]=nextU[i];v[i]=nextV[i];
        if(oldRate!==rate[i])changed=true;
        if(!changed&&(Math.abs(change)>1e-12||u[i]!==0||v[i]!==0))changed=true;
        if(!moving&&(Math.abs(change)>sleepChange||Math.abs(u[i])>sleepVelocity||Math.abs(v[i])>sleepVelocity))moving=true;
      }
      // A centered pressure gradient cannot see an alternating cell pattern.
      // Keep its conservative diffusion alive until its curvature is small,
      // even when this frame's velocity/density increment is below sleep limits.
      if(!moving)outer:for(let y=b.y0;y<=b.y1;y++)for(let i=y*w+b.x0,end=y*w+b.x1;i<=end;i++){
        if(solid[i]||density[i]===0&&density[i-1]===0&&density[i+1]===0&&density[i-w]===0&&density[i+w]===0)continue;
        const p=perturbation[i],sum=(solid[i-1]?p:perturbation[i-1])+(solid[i+1]?p:perturbation[i+1])+(solid[i-w]?p:perturbation[i-w])+(solid[i+w]?p:perturbation[i+w]);
        if(Math.abs(sum-p*4)>sleepCurvature){moving=true;break outer;}
      }
      if(moving)nextActive.add(id);else for(let y=b.y0;y<=b.y1;y++)for(let i=y*w+b.x0,end=y*w+b.x1;i<=end;i++){if(rate[i]!==0)changed=true;rate[i]=0;}
      if(changed){touch(b.x0,b.y0,false);touch(b.x1,b.y1,false);}}
      activeTiles=nextActive;
      revision++;
    }
    function continueFlow(maxSteps=4){
      const {reducedMotion,vortices,vortexTime,current,currentTime}=flowOptions;
      let serviced=0;while(pending>=1/30&&serviced<maxSteps){if(!reducedMotion){forceCurrent(1/30,current,(currentTime??clock)-pending+1/30);forceVortices(1/30,vortices,(vortexTime??clock)-pending+1/30);}flow(1/30,reducedMotion);pending-=1/30;serviced++;}
      return pending>=1/30;
    }
    function updateMany(bodies,dt,{suspended=false,reducedMotion=false,rebase=false,vortices=[],vortexTime,current=null,currentTime}={}){
      if(suspended||!(dt>0))return;
      clock+=dt;
      const actors=bodies.filter(b=>b.pose&&b.mask&&b.pose.width>0&&b.pose.height>0).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      actorCount=actors.length;
      for(const i of currentSolid){solid[i]=0;solidOwner[i]=0;}currentSolid=[];
      for(let index=0;index<actors.length;index++){const b=actors[index];markSolid(b.mask,b.pose,index+1);}
      const seen=new Set();
      for(let index=0;index<actors.length;index++){
      const {id,pose,mask,from}=actors[index],key=String(id);seen.add(key);
      const track=tracks.get(key)||{previous:null,flowSpeed:0,travelDistance:0};
      previous=rebase?null:track.previous;flowSpeed=rebase?0:track.flowSpeed;travelDistance=track.travelDistance;
      const old=previous||(!rebase&&from?{...pose,...from}:pose),dx=pose.x-old.x,dy=pose.y-old.y,angle=Math.atan2(Math.sin(pose.heading-old.heading),Math.cos(pose.heading-old.heading));
      // Coordinate discontinuities are explicit rebase events. Distance or an
      // old engine speed hint cannot distinguish a teleport from faster flight.
      const velocity={x:dx/dt,y:dy/dt,angular:angle/dt};lastVelocity=velocity;
      const actualSpeed=Math.hypot(velocity.x,velocity.y),distance=Math.hypot(dx,dy);
      flowSpeed=mix(flowSpeed,actualSpeed,1-Math.exp(-dt/(actualSpeed>flowSpeed ? .22 : .45)));
      travelDistance+=distance;const fast=fastAmount()*Math.min(1,actualSpeed/140);
      const travel=distance+Math.abs(angle)*Math.hypot(pose.width,pose.height)*.5;
      if(reuseStationary&&previous&&previousMasks.get(key)===mask&&distance===0&&angle===0&&old.width===pose.width&&old.height===pose.height){
        // The shared solid union prevents every flow/deposit from entering an
        // unchanged hull. Its already cleared cells need no repeated sweep.
        // Retain the diagnostic count and all per-ship/time bookkeeping.
        sweeps++;
      }else if(distance>Math.max(cell*4,Math.min(pose.width,pose.height)*.5)){
        // Translation is continuous; only rotation needs angular subdivisions.
        const turns=Math.max(1,Math.ceil(Math.abs(angle)*Math.hypot(pose.width,pose.height)*.5/(cell*.65)));
        for(let step=0;step<turns;step++){const a=step/turns,b=(step+1)/turns;const at=t=>({...pose,x:mix(old.x,pose.x,t),y:mix(old.y,pose.y,t),heading:old.heading+angle*t});sweepTranslation(mask,at(a),at(b),velocity,fast);}
        stamp(mask,pose,velocity,index+1,fast,0);
      }else{
      const steps=Math.max(1,Math.ceil(travel/(cell*.65)));
      for(let step=1;step<=steps;step++){
        const t=step/steps,p={...pose,x:mix(old.x,pose.x,t),y:mix(old.y,pose.y,t),heading:old.heading+angle*t};
        const eddy=reducedMotion?0:Math.sin((travelDistance-distance*(1-t))/Math.max(cell,pose.width*.50));
        stamp(mask,p,velocity,index+1,fast,eddy);
      }
      }
      tracks.set(key,{previous:{...pose},flowSpeed,travelDistance,lastVelocity:{...velocity}});previousMasks.set(key,mask);
      }
      for(const key of tracks.keys())if(!seen.has(key)){tracks.delete(key);previousMasks.delete(key);}
      const primary=tracks.get('player')||tracks.values().next().value;
      previous=primary?.previous||null;flowSpeed=primary?.flowSpeed||0;travelDistance=primary?.travelDistance||0;lastVelocity=primary?.lastVelocity||{x:0,y:0,angular:0};
      pending+=dt;flowOptions={reducedMotion,vortices,vortexTime,current,currentTime};continueFlow();
    }
    function update(pose,mask,dt,options){if(pose&&mask)updateMany([{id:'player',pose,mask}],dt,options);}
    function sample(x,y,data=density){const px=(x-minX)/cell-.5,py=(y-minY)/cell-.5;if(px<0||py<0||px>w-1||py>h-1)return 0;
      const ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1);return mix(mix(data[iy*w+ix],data[iy*w+jx],px-ix),mix(data[jy*w+ix],data[jy*w+jx],px-ix),py-iy);}
    function metrics(audit=false){const result={w,h,cell,clock,revision,initialMass,sweeps,sweptCells,continuousSweeps,removed,pending,vortexSteps,forcedCells,currentSteps,currentCells,lastVelocity:{...lastVelocity},flowSpeed,fastFlow:fastAmount(),travelDistance,actorCount,actorIds:Array.from(tracks.keys()),activeBounds:bounds&&{...bounds},activeTiles:activeTiles.size,flowKernel:kernel?'webassembly':'javascript',flowVectorized:!!kernel?.simd,bytes:kernel?kernel.bytes:count*47};
      if(audit){let mass=0,min=Infinity,max=0;for(const d of density){mass+=d;min=Math.min(min,d);max=Math.max(max,d);}Object.assign(result,{mass,min,max});}return result;}
    function transportRect(rect){return rect&&(rect.w>w*.75?{x:0,y:rect.y,w,h:rect.h}:{...rect});}
    function pack(data,rect,buffer){const length=rect?rect.w*rect.h:0;
      if(!buffer&&rect&&rect.x===0&&rect.w===w)return data.slice(rect.y*w,(rect.y+rect.h)*w);
      const out=buffer?new data.constructor(buffer,0,length):new data.constructor(length);
      if(rect&&rect.x===0&&rect.w===w)out.set(data.subarray(rect.y*w,(rect.y+rect.h)*w));
      else if(rect)for(let y=0;y<rect.h;y++)out.set(data.subarray((rect.y+y)*w+rect.x,(rect.y+y)*w+rect.x+rect.w),y*rect.w);return out;}
    function densityPatch(reuse,tiled=false){
      const rect=transportRect(dirty);
      // Distant wakes can share a large bounding box with untouched cloud
      // between them. Pack changed tile runs into the same two transferable
      // buffers; dense frames keep the cheaper contiguous rectangle.
      if(tiled&&rect&&!dirtyAll){
        const rects=[];let previous=new Map();
        for(let row=0;row<tileRows;row++){const next=new Map();for(let column=0;column<tileColumns;column++){
          if(!dirtyTiles[row*tileColumns+column])continue;const first=column;while(column+1<tileColumns&&dirtyTiles[row*tileColumns+column+1])column++;
          const x=Math.max(rect.x,first*tileSize),right=Math.min(rect.x+rect.w,(column+1)*tileSize),y=Math.max(rect.y,row*tileSize),bottom=Math.min(rect.y+rect.h,(row+1)*tileSize);if(right<=x||bottom<=y)continue;
          const key=x+':'+right,old=previous.get(key);let run;if(old&&old.y+old.h===y){old.h=bottom-old.y;run=old;}else{run={x,y,w:right-x,h:bottom-y};rects.push(run);}next.set(key,run);
        }previous=next;}
        const length=rects.reduce((sum,r)=>sum+r.w*r.h,0);
        if(length&&length<rect.w*rect.h*.75){
          const a=reuse?.(length*4),b=reuse?.(length*4),packedDensity=a?new Float32Array(a,0,length):new Float32Array(length),packedRate=b?new Float32Array(b,0,length):new Float32Array(length);let offset=0;
          for(const r of rects){r.offset=offset;for(let y=r.y;y<r.y+r.h;y++){const start=y*w+r.x;packedDensity.set(density.subarray(start,start+r.w),offset);packedRate.set(rate.subarray(start,start+r.w),offset);offset+=r.w;}}
          return {rect,rects,density:packedDensity,rate:packedRate};
        }
      }
      const bytes=rect?rect.w*rect.h*4:0;return {rect,density:pack(density,rect,reuse?.(bytes)),rate:pack(rate,rect,reuse?.(bytes))};
    }
    function checkpoint(override=dirty,reuse){
      const rect=transportRect(override);
      const bytes=rect?rect.w*rect.h*4:0;
      return {rect,density:pack(density,rect,reuse?.(bytes)),rate:pack(rate,rect,reuse?.(bytes)),u:pack(u,rect,reuse?.(bytes)),v:pack(v,rect,reuse?.(bytes)),swept:pack(swept,rect,reuse?.(bytes/4)),solid:Uint32Array.from(currentSolid),state:{previous,revision,clock,pending,bounds,lastVelocity,sweeps,sweptCells,continuousSweeps,removed,initialMass,flowSpeed,travelDistance,tracks:Array.from(tracks),actorCount,tiles:Array.from(activeTiles),vortexSteps,forcedCells,currentSteps,currentCells,flowOptions}};
    }
    function restore(snapshot){
      previousMasks.clear();
      density.set(snapshot.density);u.set(snapshot.u);v.set(snapshot.v);nextU.set(u);nextV.set(v);swept.set(snapshot.swept);solid.fill(0);currentSolid=Array.from(snapshot.solid||[]);for(const i of currentSolid)solid[i]=1;
      for(let i=0;i<count;i++)perturbation[i]=density[i]-baseline[i];
      if(snapshot.rate)rate.set(snapshot.rate);else rate.fill(0);
      ({previous,revision,clock,pending,bounds,lastVelocity,sweeps,removed,initialMass}=snapshot.state);dirty={x:0,y:0,w,h};dirtyAll=true;
      flowSpeed=snapshot.state.flowSpeed||0;travelDistance=snapshot.state.travelDistance||0;
      tracks=new Map(snapshot.state.tracks||previous&&[['player',{previous,flowSpeed,travelDistance,lastVelocity}]]||[]);actorCount=snapshot.state.actorCount??tracks.size;solidOwner.fill(0);
      activeTiles=new Set(snapshot.state.tiles||[]);
      sweptCells=snapshot.state.sweptCells||0;continuousSweeps=snapshot.state.continuousSweeps||0;
      vortexSteps=snapshot.state.vortexSteps||0;forcedCells=snapshot.state.forcedCells||0;currentSteps=snapshot.state.currentSteps||0;currentCells=snapshot.state.currentCells||0;
      flowOptions=snapshot.state.flowOptions||{reducedMotion:false,vortices:[]};
    }
    return {minX,minY,width:w*cell,height:h*cell,w,h,cell,density,rate,seed,update,updateMany,continueFlow,get hasPendingFlow(){return pending>=1/30;},sample,sampleInitial:(x,y)=>sample(x,y,baseline),metrics,densityPatch,checkpoint,restore,get clock(){return clock;},get activeTileCount(){return activeTiles.size;},get predictionSeconds(){return Math.min(1/30,pending);},get revision(){return revision;},get dirty(){return dirty;},uploaded(){dirty=null;dirtyAll=false;dirtyTiles.fill(0);}};
  }
  function createRuntimeField(config){
    if(typeof Worker!=='function')return createField(config);
    let worker;try{const base=new URL(moduleURL||location.href),url=new URL('nebula-material-worker.js',base);url.search=base.search;worker=new Worker(url);}catch{return createField(config);}
    const {minX,minY,cell=2}=config,w=Math.ceil(config.width/cell),h=Math.ceil(config.height/cell),count=w*h;
    const density=new Float32Array(count),rate=new Float32Array(count),recoveryDensity=new Float32Array(count),shadowU=new Float32Array(count),shadowV=new Float32Array(count),shadowSwept=new Uint8Array(count),maskIds=new WeakMap(),knownMasks=new Map(),waiters=[];
    const recoveryQueue=[];let recoveryTimer=null;
    let lastSentBodies=[],mergedCommands=0,acceptedPoses=0;
    let seedData=null,seedW=0,seedH=0,ready=false,busy=true,closed=false,local=null,commands=[],sequence=0,processed=0,published=0,publishedClock=0,publishedPending=0,clock=0,revision=0,dirty=null,solid=new Uint32Array(0),state=null,summary={},nextMask=1,failure=null,publishedBodies=[],currentBodies=[],pendingCacheKey='',pendingCache=[];
    function mark(rect){if(!rect)return;if(!dirty){dirty={...rect};return;}const x0=Math.min(dirty.x,rect.x),y0=Math.min(dirty.y,rect.y),x1=Math.max(dirty.x+dirty.w,rect.x+rect.w),y1=Math.max(dirty.y+dirty.h,rect.y+rect.h);dirty={x:x0,y:y0,w:x1-x0,h:y1-y0};}
    function settle(){for(let i=waiters.length-1;i>=0;i--)if(local||published>=waiters[i].sequence&&(published>waiters[i].sequence||publishedPending<1/30)){waiters[i].resolve();waiters.splice(i,1);}}
    function recycle(patch){if(!worker||!patch)return;const buffers=['density','rate','u','v','swept'].map(key=>patch[key]?.buffer).filter(buffer=>buffer?.byteLength);if(buffers.length)worker.postMessage({kind:'recycle',buffers},buffers);}
    function velocities(command,previous){
      if(command.options.rebase||command.options.vortices?.length||previous.length!==command.bodies.length)return null;const old=new Map(previous.map(b=>[b.id,b])),values=new Map();let fast=false;
      for(const b of command.bodies){const a=old.get(b.id),p=b.pose;if(!a||a.maskId!==b.maskId||a.pose.width!==p.width||a.pose.height!==p.height||Math.abs(Math.atan2(Math.sin(p.heading-a.pose.heading),Math.cos(p.heading-a.pose.heading)))>1e-10)return null;
        const x=(p.x-a.pose.x)/command.dt,y=(p.y-a.pose.y)/command.dt;values.set(b.id,{x,y});if(Math.hypot(x,y)>2000)fast=true;
      }return fast?values:null;
    }
    function combine(pending){
      const result=[];let before=lastSentBodies;
      for(let i=0;i<pending.length;i++){
        const first=pending[i],velocity=config.coalesceFast===false?null:velocities(first,before),limit=1/30;let end=first,dt=first.dt;before=first.bodies;
        if(velocity&&(summary.pending||0)<1/30+1e-9)while(i+1<pending.length){const next=pending[i+1];if(dt+next.dt>limit+1e-10||!!next.options.reducedMotion!==!!first.options.reducedMotion)break;
          const v=velocities(next,before);if(!v||Array.from(v).some(([id,b])=>{const a=velocity.get(id);return !a||Math.abs(a.x-b.x)>1e-10*Math.max(1,Math.abs(a.x))||Math.abs(a.y-b.y)>1e-10*Math.max(1,Math.abs(a.y));}))break;
          dt+=next.dt;end=next;before=next.bodies;i++;mergedCommands++;
        }
        result.push(end===first?first:{...end,dt});
      }return result;
    }
    function send(){if(closed||local||!ready||busy)return;const pending=commands.filter(c=>c.sequence>processed);
      if(pending.length){
        // Send immediately. Combine only inputs that already accumulated while
        // the worker was busy; never add a collection delay to fresh movement.
        const batch=combine(pending);commands=commands.filter(c=>c.sequence<=processed).concat(batch);lastSentBodies=batch.at(-1).bodies;busy=true;worker.postMessage({kind:'advance',commands:batch});
      }
      else if(waiters.some(w=>w.sequence>published)){busy=true;worker.postMessage({kind:'publish'});}}
    function retainRecovery(drain=false){
      recoveryTimer=null;const began=performance.now();let copied=0;
      while(recoveryQueue.length){
        const item=recoveryQueue[0],patch=item.message.checkpoint,rect=patch.rect;
        while(rect&&item.row<rect.h){
          const y=item.row,rows=rect.x===0&&rect.w===w?Math.min(16,rect.h-y):1,from=y*rect.w,to=(rect.y+y)*w+rect.x,length=rect.w*rows;item.row+=rows;
          recoveryDensity.set(patch.density.subarray(from,from+length),to);shadowU.set(patch.u.subarray(from,from+length),to);shadowV.set(patch.v.subarray(from,from+length),to);shadowSwept.set(patch.swept.subarray(from,from+length),to);copied+=rows;
          if(!drain&&(rows>1||copied%16===0)&&performance.now()-began>=1){recoveryTimer=setTimeout(()=>retainRecovery(),0);return;}
        }
        solid=patch.solid;state=patch.state;const message=item.message;commands=commands.filter(c=>c.sequence>message.sequence);recoveryQueue.shift();recycle(patch);
        const keep=new Set(publishedBodies.map(b=>b.maskId));for(const b of currentBodies)keep.add(maskIds.get(b.mask));for(const c of commands)for(const b of c.bodies)keep.add(b.maskId);
        const release=[];for(const id of knownMasks.keys())if(!keep.has(id)){knownMasks.delete(id);release.push(id);}if(release.length)worker?.postMessage({kind:'release',ids:release});
      }
    }
    function fallback(reason='explicit recovery'){
      if(closed||local)return;worker?.terminate();worker=null;failure=reason;
      // Asynchronous cloud seeding may still be in flight. Retain its accepted
      // poses until that seed arrives, then replay against the actual material.
      if(config.awaitSeed&&!seedData)return;
      clearTimeout(recoveryTimer);retainRecovery(true);
      local=createField(config);if(seedData)local.seed(seedData,seedW,seedH);
      if(state)local.restore({density:recoveryDensity,u:shadowU,v:shadowV,swept:shadowSwept,solid,state});
      // A partial checkpoint may already contain the pose while retaining its
      // fluid debt. Complete that time before replaying a later hull position.
      while(local.hasPendingFlow)local.continueFlow();
      for(const c of commands){local.updateMany(c.bodies.map(b=>({id:b.id,pose:b.pose,from:b.from,mask:knownMasks.get(b.maskId)})),c.dt,c.options);while(local.hasPendingFlow)local.continueFlow();}processed=published=sequence;commands=[];ready=true;busy=false;revision++;settle();
    }
    worker.onmessage=event=>{
      if(closed||!worker||local)return;const message=event.data;
      if(message.kind==='error'){fallback(message.reason);return;}
      const patch=message.checkpoint||message.frame,rect=patch?.rect;
      if(patch?.rects)for(const r of patch.rects)for(let y=0;y<r.h;y++){const from=r.offset+y*r.w,to=(r.y+y)*w+r.x;density.set(patch.density.subarray(from,from+r.w),to);if(patch.rate)rate.set(patch.rate.subarray(from,from+r.w),to);}
      else if(rect&&rect.x===0&&rect.w===w){density.set(patch.density,rect.y*w);if(patch.rate)rate.set(patch.rate,rect.y*w);}
      else if(rect)for(let y=0;y<rect.h;y++){const from=y*rect.w,to=(rect.y+y)*w+rect.x;density.set(patch.density.subarray(from,from+rect.w),to);
        if(patch.rate)rate.set(patch.rate.subarray(from,from+rect.w),to);}
      if(patch){mark(rect);published=message.sequence;publishedClock=message.metrics.clock;publishedPending=message.metrics.pending;publishedBodies=message.bodies||[];if(rect)revision++;}
      else if(message.sequence===published){publishedClock=message.metrics.clock;publishedPending=message.metrics.pending;}
      // Recovery copies are independent of visible publication. Commit each
      // checkpoint only after its bounded copy tasks finish; failure drains a
      // partial copy before replay, so the material snapshot stays coherent.
      if(message.checkpoint){recoveryQueue.push({message,row:0});if(recoveryTimer===null)recoveryTimer=setTimeout(()=>retainRecovery(),0);}
      else if(message.frame)recycle(message.frame);
      summary=message.metrics;processed=message.sequence;ready=true;if(message.complete!==false)busy=false;settle();send();
    };
    worker.onerror=event=>{event.preventDefault();fallback(event.message||'Worker failed');};
    function seed(rgba,sw,sh){if(closed)return;seedData=new Uint8ClampedArray(rgba);seedW=sw;seedH=sh;if(local)local.seed(seedData,sw,sh);else if(worker)worker.postMessage({kind:'init',config,rgba:seedData,sw,sh});else fallback(failure||'Worker unavailable before seeding');}
    function updateMany(bodies,dt,options={}){
      if(closed||options.suspended||!(dt>0))return;clock+=dt;acceptedPoses++;
      const nextBodies=bodies.filter(b=>b.mask&&b.pose).map(b=>({id:String(b.id),pose:{...b.pose},from:b.from&&{...b.from},sweepEnd:!options.rebase&&b.sweepEnd?{...b.sweepEnd}:undefined,mask:b.mask}));
      if(!options.rebase&&currentBodies.some(b=>b.sweepEnd)){const seen=new Set(nextBodies.map(b=>b.id));for(const old of currentBodies)if(old.sweepEnd&&!seen.has(old.id))nextBodies.push({id:old.id,pose:old.sweepEnd,from:old.pose,mask:old.mask});}
      // A complete physical crossing can leave the shared query before the
      // rendered interpolant reaches its end. Finish that one observed segment
      // once, using the real owner's endpoint, then release the visual track.
      currentBodies=nextBodies;
      if(local){local.updateMany(currentBodies,dt,options);while(local.hasPendingFlow)local.continueFlow();return;}
      const packed=currentBodies.map(b=>{const mask=b.mask;let maskId=maskIds.get(mask);
        if(!maskId||!knownMasks.has(maskId)){maskId=maskId||nextMask++;maskIds.set(mask,maskId);knownMasks.set(maskId,mask);worker?.postMessage({kind:'mask',id:maskId,mask:{alpha:mask.alpha,w:mask.w,h:mask.h,aspect:mask.aspect}});}
        return {id:b.id,pose:b.pose,from:b.from,maskId};});
      commands.push({sequence:++sequence,bodies:packed,dt,options:{...options}});send();
    }
    function update(pose,mask,dt,options){if(pose&&mask)updateMany([{id:'player',pose,mask}],dt,options);}
    function initialCell(x,y){
      if(!seedData)return config.uniform??1;const px=clamp((x+.5)/w*seedW-.5,0,seedW-1),py=clamp((y+.5)/h*seedH-.5,0,seedH-1),ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(seedW-1,ix+1),jy=Math.min(seedH-1,iy+1);
      const a=mix(mix(seedData[(iy*seedW+ix)*4+3],seedData[(iy*seedW+jx)*4+3],px-ix),mix(seedData[(jy*seedW+ix)*4+3],seedData[(jy*seedW+jx)*4+3],px-ix),py-iy)/255;return Math.fround(-Math.log(Math.max(.001,1-a)));
    }
    function initial(x,y){const px=(x-minX)/cell-.5,py=(y-minY)/cell-.5;if(px<0||py<0||px>w-1||py>h-1)return 0;const ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1);return mix(mix(initialCell(ix,iy),initialCell(jx,iy),px-ix),mix(initialCell(ix,jy),initialCell(jx,jy),px-ix),py-iy);}
    function pendingMasks(skipContinuous=false){
      if(local||closed)return [];const key=sequence+':'+published+':'+skipContinuous;if(key===pendingCacheKey)return pendingCache;
      // Only the most recent 32 swept samples can be presented. Walk retained
      // input backwards so a delayed worker never makes the main thread build
      // and immediately discard thousands of older silhouette objects.
      const histories=new Map(),previous=new Map(publishedBodies.map(b=>[b.id,b.pose]));
      for(let i=commands.length-1;i>=0;i--){const command=commands[i];if(command.sequence<=published)break;for(const body of command.bodies){let history=histories.get(body.id);if(!history){history=[];histories.set(body.id,history);}if(history.length<33)history.push({body,command});}}
      const result=[];
      for(const [id,history] of histories){const samples=[];
      for(let index=0;index<history.length&&samples.length<32;index++){const {body,command}=history[index],p=body.pose,old=command.options.rebase?p:history[index+1]?.body.pose||previous.get(id)||p,angle=Math.atan2(Math.sin(p.heading-old.heading),Math.cos(p.heading-old.heading)),travel=Math.hypot(p.x-old.x,p.y-old.y);
        if(skipContinuous&&travel>Math.max(cell*4,Math.min(p.width,p.height)*.5))continue;
        const count=Math.max(1,Math.ceil(Math.max(travel/Math.max(cell,Math.min(p.width,p.height)*.12),Math.abs(angle)/.10)));
        for(let step=Math.min(32,count);step>=1&&samples.length<32;step--){const t=step/Math.min(32,count);samples.push({...p,id,continuous:travel>Math.max(cell*4,Math.min(p.width,p.height)*.5),x:mix(old.x,p.x,t),y:mix(old.y,p.y,t),heading:old.heading+angle*t,mask:knownMasks.get(body.maskId)});}
      }samples.reverse();result.push(...samples);}
      pendingCacheKey=key;pendingCache=result;return pendingCache;
    }
    let sweepCacheKey='',sweepCache=[];
    function pendingSweeps(){
      if(local||closed)return [];const key=sequence+':'+published;if(key===sweepCacheKey)return sweepCache;
      const previous=new Map(publishedBodies.map(b=>[b.id,b.pose])),result=[];
      for(const command of commands)if(command.sequence>published){const seen=new Set();for(const b of command.bodies){seen.add(b.id);const p=b.pose,old=command.options.rebase?p:previous.get(b.id)||b.from&&{...p,...b.from}||p,mask=knownMasks.get(b.maskId);
        if(mask&&Math.hypot(p.x-old.x,p.y-old.y)>Math.max(cell*4,Math.min(p.width,p.height)*.5))result.push({id:b.id,sequence:command.sequence,from:old,to:p,mask});previous.set(b.id,p);
      }for(const id of previous.keys())if(!seen.has(id))previous.delete(id);}
      sweepCacheKey=key;sweepCache=result;return result;
    }
    function sampleDensity(x,y){if(local)return local.sample(x,y);
      const px=(x-minX)/cell-.5,py=(y-minY)/cell-.5;if(px<0||py<0||px>w-1||py>h-1)return 0;if(!ready)return initial(x,y);
      const ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1);return mix(mix(density[iy*w+ix],density[iy*w+jx],px-ix),mix(density[jy*w+ix],density[jy*w+jx],px-ix),py-iy);
    }
    function sample(x,y){if(local)return local.sample(x,y);let opening=false;
      for(const b of currentBodies){if(occupied(b.mask,b.pose,x,y))return 0;const index=maskIndex(b.mask,b.pose,x,y);if(index>=0&&b.mask.openings?.[index])opening=true;}
      if(!opening){for(const p of pendingMasks())if(occupied(p.mask,p,x,y))return 0;
        for(const sweep of pendingSweeps()){let hit=false;sweptPolygons(sweep.mask,sweep.from,sweep.to,polygon=>{if(hit)return;let sign=0,inside=true;for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],cross=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);if(Math.abs(cross)<1e-8)continue;const next=Math.sign(cross);if(sign&&next!==sign){inside=false;break;}sign=next;}if(inside)hit=true;});if(hit)return 0;}
      }
      return sampleDensity(x,y);
    }
    function metrics(audit=false){const pending=commands.filter(c=>c.sequence>processed),result=local?local.metrics(audit):{...summary,w,h,cell,clock,revision};Object.assign(result,{transport:local?'synchronous-fallback':'worker',workerReady:ready,acceptedPoses,mergedCommands,queuedPoses:pending.length,queuedSeconds:pending.reduce((n,c)=>n+c.dt,0),workerClock:summary.clock||0,failure});
      if(audit&&!local){let mass=0,min=Infinity,max=0;for(const d of density){mass+=d;min=Math.min(min,d);max=Math.max(max,d);}Object.assign(result,{mass,min,max});}return result;}
    const timer=setTimeout(()=>{if(!ready&&!closed)fallback('Worker startup timeout');},3000);
    return {minX,minY,width:w*cell,height:h*cell,w,h,cell,seed,update,updateMany,sample,sampleDensity,sampleInitial:(x,y)=>local?local.sampleInitial(x,y):initial(x,y),metrics,
      get clock(){return local?local.clock:clock;},get activeTileCount(){return local?local.activeTileCount:summary.activeTiles||0;},
      get currentBodies(){return currentBodies;},get pendingSweeps(){return pendingSweeps();},get pendingRasterMasks(){return pendingMasks(true);},get acceptedSequence(){return sequence;},get publishedSequence(){return published;},
      get rate(){return local?local.rate:rate;},get predictionSeconds(){return local?local.predictionSeconds:clamp(clock-publishedClock+publishedPending,0,1/30);},
      get density(){return local?local.density:density;},get revision(){return local?local.revision:revision;},get dirty(){return local?local.dirty:dirty;},get ready(){return ready;},get pendingMasks(){return pendingMasks();},get pendingRevision(){return sequence+':'+published;},
      uploaded(){if(local)local.uploaded();else dirty=null;},flush(){if(local||ready&&published>=sequence&&publishedPending<1/30)return Promise.resolve();return new Promise(resolve=>{waiters.push({sequence,resolve});send();});},forceFallback:fallback,
      dispose(){closed=true;clearTimeout(timer);clearTimeout(recoveryTimer);recoveryQueue.length=0;worker?.terminate();worker=null;for(const waiter of waiters)waiter.resolve();waiters.length=0;commands=[];currentBodies=[];publishedBodies=[];pendingCache=[];sweepCache=[];knownMasks.clear();}};
  }
  const vertex=`#version 300 es
  precision highp float;out vec2 uv;
  void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`;
  const fragment=`#version 300 es
  precision highp float;in vec2 uv;out vec4 colour;
  uniform sampler2D u_source,u_density,u_mask,u_pending,u_rate;uniform highp usampler2D u_swept;uniform uint u_published;uniform vec2 u_view,u_camera,u_origin,u_grid;
  uniform float u_zoom,u_cell,u_fraction,u_prediction,u_opacity;uniform vec4 u_body,u_maskRect,u_pendingRect,u_maskTexture,u_pendingTexture;uniform vec2 u_axis;
  uniform bool u_ready,u_screenMask,u_worldSource,u_clearPending,u_linear,u_worldPending;
  uniform vec4 u_tile,u_badlands,u_badlandsEnvelope;uniform float u_feather;
  uniform int u_vortexCount;uniform vec4 u_vortices[8],u_vortexInfo[8];uniform vec2 u_vortexFlow[8];uniform sampler2D u_vortexVolume;
  uniform int u_fireCount,u_sheetCount;uniform vec4 u_fires[3],u_fireInfo[3],u_sheets[3],u_sheetInfo[3];uniform sampler2D u_fireVolume;
  uniform vec4 u_currentRegion,u_currentFrame;uniform float u_currentTime;
  vec3 currentWarp(vec2 world){
    if(u_currentRegion.z<=0.0)return vec3(0);
    vec2 d=world-u_currentRegion.xy,p=vec2(dot(d,u_currentFrame.xy),dot(d,vec2(-u_currentFrame.y,u_currentFrame.x)))/u_currentFrame.z;
    float edge=1.0-smoothstep(.72,1.02,length(p*u_currentFrame.z/u_currentRegion.zw));if(edge<=.000001)return vec3(0);
    float a=p.x*.92+p.y*.36+u_currentTime*.17+u_currentFrame.w,b=-p.x*.43+p.y*.83-u_currentTime*.13+u_currentFrame.w*2.0,dphase=p.x*.51-p.y*.77+u_currentTime*.11+4.1;
    vec3 wave=sin(vec3(a,b,dphase))*vec3(110.0/.17,74.0/-.13,46.0/.11);
    vec2 q=vec2(dot(wave,vec3(-.36,-.83,.77)),dot(wave,vec3(.92,-.43,.51)))*(-.045*edge);
    return vec3(q.x*u_currentFrame.x-q.y*u_currentFrame.y,q.x*u_currentFrame.y+q.y*u_currentFrame.x,edge);
  }
  vec4 fireVolumeAt(float frame,vec2 q){return texture(u_fireVolume,(vec2(mod(frame,4.0),floor(frame/4.0))*96.0+(q*.5+.5)*95.0+.5)/384.0);}
  vec3 plasmaHeating(vec3 gas,float temperature,float coverage,float density){
    float amount=coverage*smoothstep(.02,.65,density)*.8;
    vec3 energized=min(vec3(1),gas*(vec3(1.08,.98,1.08)+temperature*vec3(.72,.64,1.12))+temperature*vec3(.045,.015,.025));
    return mix(gas,energized,amount);
  }
  vec2 fireAt(vec2 world,out float density,out float shade,out float blend,out float temperature){
    vec2 offset=vec2(0);density=1.0;shade=1.0;blend=0.0;temperature=0.0;
    for(int j=0;j<3;j++){
      if(j>=u_fireCount)break;vec4 v=u_fires[j],a=u_fireInfo[j];vec2 d=world-v.xy,q=vec2(dot(d,a.xy),dot(d,vec2(-a.y,a.x)))/v.zw;
      if(any(greaterThanEqual(abs(q),vec2(1))))continue;
      float frame=floor(a.z);vec4 b=mix(fireVolumeAt(frame,q),fireVolumeAt(mod(frame+1.0,16.0),q),fract(a.z));float coverage=b.a*a.w;
      offset+=vec2(-q.y*v.z*a.x-q.x*v.w*a.y,-q.y*v.z*a.y+q.x*v.w*a.x)*coverage*.025;
      if(coverage>blend){density=1.0+coverage*(1.7*b.r-.35);shade=1.0+coverage*(2.0*b.b-.95);blend=coverage;temperature=b.g;}
    }return offset;
  }
  float sheetAt(vec2 world){float light=0.0;for(int j=0;j<3;j++){
    if(j>=u_sheetCount)break;vec4 v=u_sheets[j],a=u_sheetInfo[j];vec2 d=world-v.xy,q=vec2(dot(d,a.xy),dot(d,vec2(-a.y,a.x)))/v.zw;
    float r=dot(q,q);if(r<1.0)light=max(light,(1.0-smoothstep(.05,1.0,r))*a.z);
  }return light;}
  vec4 volumeAt(float frame,vec2 q){
    vec2 tile=vec2(mod(frame,8.0),floor(frame/8.0));
    return texture(u_vortexVolume,(tile*96.0+(q/2.7+.5)*95.0+.5)/vec2(768.0,384.0));
  }
  vec2 sculpt(vec2 world,out float compression,out float shade,out float blend,out float heat){
    vec2 source=world;compression=1.0;shade=1.0;blend=0.0;heat=0.0;
    for(int j=0;j<8;j++){
      if(j>=u_vortexCount)break;vec4 v=u_vortices[j];vec2 d=world-v.xy;
      if(any(greaterThan(abs(d),vec2(v.z*1.35))))continue;
      float r=length(d)/v.z;if(r>=1.35)continue;
      vec4 info=u_vortexInfo[j];vec2 q=vec2(dot(d,info.xy),dot(d,vec2(-info.y,info.x)))/v.z;
      if(any(greaterThan(abs(q),vec2(1.35))))continue;
      float frame=floor(info.z),edge=1.0-smoothstep(1.13,1.35,r);
      vec4 volume=mix(volumeAt(frame,q),volumeAt(mod(frame+1.0,32.0),q),fract(info.z));
      float coverage=volume.a*edge;vec2 turn=u_vortexFlow[j];
      source+=(vec2(d.x*turn.x-d.y*turn.y,d.x*turn.y+d.y*turn.x)*(1.0+.5*coverage)-d)*coverage*.8;
      compression*=1.0+info.w*edge*(8.5*volume.r-.35*volume.a);
      shade*=1.0+info.w*coverage*(1.7*volume.g-.95);
      blend=max(blend,coverage*.85);heat=max(heat,info.w*volume.b*.9*edge);
    }
    return source;
  }
  float waiting(ivec2 p){if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,ivec2(u_grid))))return 0.0;return texelFetch(u_swept,p,0).r>u_published?1.0:0.0;}
  float rho(ivec2 p){if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,ivec2(u_grid))))return 0.0;return texelFetch(u_density,p,0).r;}
  float rateAt(ivec2 p){return texelFetch(u_rate,clamp(p,ivec2(0),ivec2(u_grid)-1),0).r;}
  vec4 weights(float t){float t2=t*t,t3=t2*t;return vec4(1.0-3.0*t+3.0*t2-t3,4.0-6.0*t2+3.0*t3,1.0+3.0*t+3.0*t2-3.0*t3,t3)/6.0;}
  vec2 maskCoordinates(vec2 p,vec4 size){return clamp(p*size.zw,vec2(.5),max(vec2(.5),size.zw-.5))*size.xy;}
  void main(){
    vec2 pixel=vec2(uv.x,1.0-uv.y)*u_view,world=u_camera+(pixel-u_view*.5)/u_zoom,p=(world-u_origin)/u_cell-.5;
    if(any(lessThan(p,vec2(-2)))||any(greaterThan(p,u_grid+1.0))){colour=vec4(0);return;}
    float geographic=1.0,badRadius=0.0,badDistance=0.0;vec2 badDelta=vec2(0);
    if(u_badlands.z>0.0){
      badDelta=world-u_badlands.xy;vec2 q=badDelta/u_badlands.zw;badRadius=length(q);
      geographic=smoothstep(0.0,.38,1.0-length(badDelta/u_badlandsEnvelope.xy));
      if(badRadius>1.0){float angle=atan(q.y,q.x),spread=u_badlandsEnvelope.z*(1.0+.14*sin(angle*3.0+.7)+.08*sin(angle*7.0-1.2));badDistance=1.0+(badRadius-1.0)/spread;geographic*=1.0-smoothstep(1.0,1.22,badDistance);}
      if(geographic<=.000001){colour=vec4(0);return;}
    }
    ivec2 i=ivec2(floor(p));vec2 f=fract(p);vec4 wx=weights(f.x),wy=weights(f.y);float material=0.0;
    if(u_linear&&all(greaterThanEqual(i,ivec2(1)))&&all(lessThan(i,ivec2(u_grid)-2))){
      // The same cubic B-spline, regrouped into four hardware bilinear reads.
      vec2 gx=vec2(wx.x+wx.y,wx.z+wx.w),gy=vec2(wy.x+wy.y,wy.z+wy.w);
      vec2 hx=vec2(-1.0+wx.y/gx.x,1.0+wx.w/gx.y)+vec2(i.x)+.5;
      vec2 hy=vec2(-1.0+wy.y/gy.x,1.0+wy.w/gy.y)+vec2(i.y)+.5;
      material=texture(u_density,vec2(hx.x,hy.x)/u_grid).r*gx.x*gy.x
        +texture(u_density,vec2(hx.y,hy.x)/u_grid).r*gx.y*gy.x
        +texture(u_density,vec2(hx.x,hy.y)/u_grid).r*gx.x*gy.y
        +texture(u_density,vec2(hx.y,hy.y)/u_grid).r*gx.y*gy.y;
    }else for(int y=0;y<4;y++)for(int x=0;x<4;x++)material+=rho(i+ivec2(x-1,y-1))*wx[x]*wy[y];
    // Advance only the resolved fluid flux, for at most one fixed fluid step.
    // This adds no buffered-frame delay. The exact current hull and pending
    // swept path still cut the material after this presentation-only estimate.
    if(u_prediction>0.0){float rate=u_linear?texture(u_rate,(p+.5)/u_grid).r:mix(mix(rateAt(i),rateAt(i+ivec2(1,0)),f.x),mix(rateAt(i+ivec2(0,1)),rateAt(i+ivec2(1,1)),f.x),f.y);material+=clamp(rate*u_prediction,-max(0.0,material)*.25,max(.05,material)*.25);}
    float compression=1.0,illumination=1.0,curlBlend=0.0,plasmaHeat=0.0;vec2 sourceWorld=u_vortexCount>0?sculpt(world,compression,illumination,curlBlend,plasmaHeat):world;
    vec3 current=currentWarp(world);sourceWorld+=current.xy;curlBlend=max(curlBlend,current.z);
    float fireDensity=1.0,fireShade=1.0,fireBlend=0.0,temperature=0.0,heatingDensity=max(0.0,material);
    if(u_fireCount>0){sourceWorld+=fireAt(world,fireDensity,fireShade,fireBlend,temperature);compression*=fireDensity;illumination*=fireShade;curlBlend=max(curlBlend,fireBlend);}
    vec2 sourceUV=u_worldSource?(sourceWorld-u_origin)/(u_grid*u_cell):pixel/u_view;
    vec4 source=texture(u_source,sourceUV);if(curlBlend>0.0&&u_worldSource)source=mix(texture(u_source,(world-u_origin)/(u_grid*u_cell)),source,curlBlend);
    if(!u_ready)material=-log(max(.001,1.0-source.a));material*=compression;
    vec2 d=world-u_body.xy,local=vec2(dot(d,vec2(-u_axis.y,u_axis.x)),-dot(d,u_axis));vec2 hull=.5+local/u_body.zw;float coverage=0.0;
    vec2 maskUV=(pixel-u_maskRect.xy)/u_maskRect.zw;
    vec4 screen=u_screenMask&&all(greaterThanEqual(maskUV,vec2(0)))&&all(lessThanEqual(maskUV,vec2(1)))?texture(u_mask,maskCoordinates(maskUV,u_maskTexture)):vec4(0);
    if(u_screenMask)coverage=screen.r;
    else if(all(greaterThanEqual(hull,vec2(0)))&&all(lessThanEqual(hull,vec2(1))))coverage=texture(u_mask,maskCoordinates(hull,u_maskTexture)).a;
    // The combined screen mask has one more rasterization than original art.
    // Clear its partially covered boundary samples as well as opaque interiors.
    material*=1.0-smoothstep(u_screenMask?.04:.06,u_screenMask?.16:.30,coverage);vec3 tint=(source.a>.005?source.rgb/source.a:vec3(.12,.26,.23))*illumination;
    if(plasmaHeat>0.0)tint=mix(tint,vec3(${plasmaColour.join(',')}),plasmaHeat);
    if(fireBlend>0.0)tint=plasmaHeating(tint,temperature,fireBlend,heatingDensity);
    if(u_sheetCount>0)tint=mix(tint,vec3(1),sheetAt(world));
    vec2 pendingUV=(pixel-u_pendingRect.xy)/u_pendingRect.zw;
    float pending=u_clearPending&&all(greaterThanEqual(pendingUV,vec2(0)))&&all(lessThanEqual(pendingUV,vec2(1)))?1.0-texture(u_pending,maskCoordinates(pendingUV,u_pendingTexture)).a:1.0;
    if(u_worldPending){float path=mix(mix(waiting(i),waiting(i+ivec2(1,0)),f.x),mix(waiting(i+ivec2(0,1)),waiting(i+ivec2(1,1)),f.x),f.y);pending*=1.0-path*(1.0-smoothstep(.04,.16,screen.g));}
    float tileWeight=1.0;
    if(u_feather>0.0){vec2 fade=1.0-smoothstep(u_tile.zw-vec2(u_feather),u_tile.zw+vec2(u_feather),abs(world-u_tile.xy));tileWeight=fade.x*fade.y;}
    if(u_badlands.z>0.0&&badRadius>1.0){
      float warm=1.0-smoothstep(1.0,1.14,badDistance);
      float a=.5+.5*sin(badDelta.x/4600.0+sin(badDelta.y/3900.0)),b=(.5+.5*sin(badDelta.y/5300.0+sin(badDelta.x/6100.0)))*.8;
      vec3 cool=mix(mix(vec3(.20,.46,.95),vec3(.66,.24,.90),a),vec3(.13,.72,.62),b);
      float shade=clamp(dot(tint,vec3(.3,.5,.2))*3.5,.08,1.1);tint=mix(cool*shade,tint,warm);
    }
    material*=u_opacity*geographic;
    float alpha=(1.0-exp(-max(0.0,material)*u_fraction))*pending*tileWeight;colour=vec4(tint*alpha,alpha);
  }`;
  const pairFragment=fragment.replace('out vec4 colour;','layout(location=0) out vec4 backColour;layout(location=1) out vec4 frontColour;').replaceAll('colour=vec4(0);return;','backColour=vec4(0);frontColour=vec4(0);return;').replace('float alpha=(1.0-exp(-max(0.0,material)*u_fraction))*pending*tileWeight;colour=vec4(tint*alpha,alpha);','float backAlpha=(1.0-exp(-max(0.0,material)*.80))*pending*tileWeight,frontAlpha=(1.0-exp(-max(0.0,material)*.20))*pending*tileWeight;backColour=vec4(tint*backAlpha,backAlpha);frontColour=vec4(tint*frontAlpha,frontAlpha);');
  let output=null,gl=null,program=null,pairProgram=null,vao=null,textures=null,locations=null,pairLocations=null,lost=false,failed=false,cpu=null,uploadedField=null,uploadedRevision=-1,uploadedMask=null,uploadedMaskVersion=-1;
  let volumeTexture=null,uploadedVolume=null;
  let fireTexture=null,uploadedFire=null;
  let pairFramebuffer=null,pairTextures=null,pairWidth=0,pairHeight=0,pairImages=null,coverageCanvas=null,coverageVersion=0,coverageArtwork='';
  let uploadedSource=null,uploadedSourceVersion=null,uploadedPending=null,uploadedPendingVersion=-1,warmAtlas=null;const layerAtlases=new WeakMap();
  let floatLinear=false,uploadedRegion=null,pendingGPU=null,pendingGPUFailed=false,openingCanvas=null,uploadedSizes=[],uploadedFilters=[],preparedView='';
  const fieldUploads=new Map(),fieldTextureSlots=[0,1,4,5];
  let batch=null,batchAtlas=null,gasTextureRenderer=null;
  let maskWidth=1,maskHeight=1;
  const deferredPair=Object.freeze({paint(){}});
  function beginBatch(view){prepare();if(!program||lost||failed)return false;batch={view,draws:0};return true;}
  function endBatch(){
    if(!batch)return null;const view=batch.view,draws=batch.draws;batch=null;gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);
    if(!draws)return null;
    const w=pairWidth,h=pairHeight;for(let i=0;i<2;i++)blitLayer(i,w,h,i*w);
    batchAtlas||=document.createElement('canvas');if(batchAtlas.width!==w*2||batchAtlas.height!==h){batchAtlas.width=w*2;batchAtlas.height=h;}
    const ctx=batchAtlas.getContext('2d');ctx.globalCompositeOperation='copy';ctx.drawImage(output,0,0);ctx.globalCompositeOperation='source-over';stats.batchRenders=(stats.batchRenders||0)+1;
    return {paint(ctx,pass){ctx.drawImage(batchAtlas,pass==='front'?w:0,0,w,h,0,0,view.w,view.h);}};
  }
  function releaseField(field){const bank=fieldUploads.get(field);if(!bank)return;for(const texture of bank.textures)gl?.deleteTexture(texture);fieldUploads.delete(field);if(uploadedField===field)uploadedField=null;stats.retainedFields=fieldUploads.size;}
  function selectField(field){
    let bank=fieldUploads.get(field);
    if(!bank){if(fieldUploads.size>=20)releaseField(fieldUploads.keys().next().value);bank={textures:fieldTextureSlots.map(()=>gl.createTexture()),sizes:[],filters:[],revision:-1,region:null,initialized:false,source:null,sourceVersion:undefined};}
    else fieldUploads.delete(field);
    fieldUploads.set(field,bank);
    for(let i=0;i<fieldTextureSlots.length;i++){const slot=fieldTextureSlots[i];textures[slot]=bank.textures[i];uploadedSizes[slot]=bank.sizes[i];uploadedFilters[slot]=bank.filters[i];}
    uploadedField=bank.initialized?field:null;uploadedRevision=bank.revision;uploadedRegion=bank.region;uploadedSource=bank.source;uploadedSourceVersion=bank.sourceVersion;stats.retainedFields=fieldUploads.size;return bank;
  }
  const coverageIds=new WeakMap(),coverageSurfaces=new Map();let nextCoverageId=1;
  const coverageMask={art:null,screen:true,version:0};
  function bodiesOf(pose,mask){return Array.isArray(pose)?pose:pose&&mask?[{id:'player',pose,mask}]:[];}
  function screenBounds(view,poses,ratio=1,continuous=false,clip){
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;const zoom=view.zoom||1;
    for(const p of poses){const x=(view.w/2+(p.x-view.cameraX)*zoom)*ratio,y=(view.h/2+(p.y-view.cameraY)*zoom)*ratio,r=Math.hypot(p.width,p.height)*zoom*ratio/2+3;if(!continuous&&(x+r<0||y+r<0||x-r>view.w*ratio||y-r>view.h*ratio))continue;left=Math.min(left,x-r);right=Math.max(right,x+r);top=Math.min(top,y-r);bottom=Math.max(bottom,y+r);}
    if(clip){left=Math.max(left,(clip.x-4)*ratio);top=Math.max(top,(clip.y-4)*ratio);right=Math.min(right,(clip.x+clip.w+4)*ratio);bottom=Math.min(bottom,(clip.y+clip.h+4)*ratio);}
    const x=clamp(Math.floor(left/16)*16,0,Math.round(view.w*ratio)),y=clamp(Math.floor(top/16)*16,0,Math.round(view.h*ratio)),w=Math.max(1,clamp(Math.ceil(right/16)*16,0,Math.round(view.w*ratio))-x),h=Math.max(1,clamp(Math.ceil(bottom/16)*16,0,Math.round(view.h*ratio))-y);
    if(!poses.length)return {x:0,y:0,w:1,h:1,rect:{x:0,y:0,w:1,h:1}};
    return {x,y,w,h,rect:{x:x/ratio,y:y/ratio,w:w/ratio,h:h/ratio}};
  }
  function coverageFor(view,bodies,clip){
    // Overlapping cloud sections often see exactly the same screen-space hulls.
    // Only reuse the immediately preceding raster in this batch: the backing
    // surface is mutable and a different hull set must invalidate it at once.
    const previous=batch?.coverage,zoom=view.zoom||1;
    if(previous&&previous.w===view.w&&previous.h===view.h&&previous.zoom===zoom&&previous.clipX===clip?.x&&previous.clipY===clip?.y&&previous.clipW===clip?.w&&previous.clipH===clip?.h&&previous.rows.length===bodies.length&&bodies.every(({pose:p,mask},i)=>{
      const row=previous.rows[i];return row.mask===mask&&row.art===mask.art&&row.opening===mask.openingStencil&&row.x===p.x-view.cameraX&&row.y===p.y-view.cameraY&&row.width===p.width&&row.height===p.height&&row.heading===p.heading;
    })){stats.coverageCacheHits=(stats.coverageCacheHits||0)+1;return coverageMask;}
    const ratio=Math.min(1,1600/view.w,1000/view.h),crop=screenBounds(view,bodies.map(b=>b.pose),ratio,false,clip),{w,h}=crop;
    const artwork=bodies.map(({mask})=>{let id=coverageIds.get(mask);if(!id){id=nextCoverageId++;coverageIds.set(mask,id);}return id;}).sort((a,b)=>a-b).join(':');
    // Reuse backing storage for recurring hull sets. Pixels are always cleared
    // and repainted; damage/pose changes still invalidate the batch raster.
    if(!coverageCanvas||artwork!==coverageArtwork){
      coverageCanvas=coverageSurfaces.get(artwork);if(!coverageCanvas){coverageCanvas=document.createElement('canvas');coverageCanvas.dataset.nebulaCoverage='hulls';stats.coverageSurfaceAllocations=(stats.coverageSurfaceAllocations||0)+1;}
      coverageSurfaces.delete(artwork);coverageSurfaces.set(artwork,coverageCanvas);coverageArtwork=artwork;
    }
    if(coverageCanvas.width!==w||coverageCanvas.height!==h){coverageCanvas.width=w;coverageCanvas.height=h;}
    let surfaceBytes=0;for(const canvas of coverageSurfaces.values())surfaceBytes+=canvas.width*canvas.height*4;
    while(coverageSurfaces.size>1&&(coverageSurfaces.size>6||surfaceBytes>16*1024*1024)){const key=coverageSurfaces.keys().next().value,canvas=coverageSurfaces.get(key);coverageSurfaces.delete(key);surfaceBytes-=canvas.width*canvas.height*4;}
    stats.coverageSurfaceBytes=surfaceBytes;
    const ctx=coverageCanvas.getContext('2d');ctx.clearRect(0,0,w,h);
    for(const {pose:p,mask} of bodies){ctx.save();ctx.translate((view.w/2+(p.x-view.cameraX)*zoom)*ratio-crop.x,(view.h/2+(p.y-view.cameraY)*zoom)*ratio-crop.y);ctx.rotate(p.heading+Math.PI/2);ctx.drawImage(mask.art,-p.width*zoom*ratio/2,-p.height*zoom*ratio/2,p.width*zoom*ratio,p.height*zoom*ratio);ctx.restore();}
    ctx.globalCompositeOperation='source-in';ctx.fillStyle='#f00';ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';
    openingCanvas||=document.createElement('canvas');if(openingCanvas.width!==w||openingCanvas.height!==h){openingCanvas.width=w;openingCanvas.height=h;}const oc=openingCanvas.getContext('2d');oc.clearRect(0,0,w,h);
    for(const {pose:p,mask} of bodies)if(mask.openingStencil){oc.save();oc.translate((view.w/2+(p.x-view.cameraX)*zoom)*ratio-crop.x,(view.h/2+(p.y-view.cameraY)*zoom)*ratio-crop.y);oc.rotate(p.heading+Math.PI/2);oc.drawImage(mask.openingStencil,-p.width*zoom*ratio/2,-p.height*zoom*ratio/2,p.width*zoom*ratio,p.height*zoom*ratio);oc.restore();}
    oc.globalCompositeOperation='source-in';oc.fillStyle='#0f0';oc.fillRect(0,0,w,h);oc.globalCompositeOperation='source-over';ctx.globalCompositeOperation='lighter';ctx.drawImage(openingCanvas,0,0);ctx.globalCompositeOperation='source-over';
    if(batch)batch.coverage={w:view.w,h:view.h,zoom,clipX:clip?.x,clipY:clip?.y,clipW:clip?.w,clipH:clip?.h,rows:bodies.map(({pose:p,mask})=>({mask,art:mask.art,opening:mask.openingStencil,x:p.x-view.cameraX,y:p.y-view.cameraY,width:p.width,height:p.height,heading:p.heading}))};
    stats.coverageRasters=(stats.coverageRasters||0)+1;
    coverageVersion++;coverageMask.art=coverageCanvas;coverageMask.version=coverageVersion;coverageMask.rect=crop.rect;return coverageMask;
  }
  let pendingCanvas=null,emptyCanvas=null,pendingField=null,pendingKey='',pendingVersion=0,pendingRect=null;
  function pendingSurface(view,field,bodyInput,worldPending=false,clip){
    const allPending=(worldPending?field.pendingRasterMasks:field.pendingMasks)||[],sweeps=field.pendingSweeps||[],zoom=view.zoom||1;
    const bodies=Array.isArray(bodyInput)?bodyInput:field.currentBodies?.length?field.currentBodies:allPending.length?[{id:'player',pose:bodyInput,mask:allPending[allPending.length-1].mask}]:[];
    const currentById=new Map(bodies.map(b=>[b.id||'player',b.pose]));
    // Current hull coverage already clears the newest pose. Reject those
    // no-op stamps before allocating/clearing a viewport-sized surface. Older
    // unpublished poses and continuous sweeps still retain their whole paths.
    const pending=allPending.filter(p=>{
      if(worldPending&&p.continuous)return false;const pose=currentById.get(p.id||'player');
      if(pose&&Math.abs(p.x-pose.x)+Math.abs(p.y-pose.y)+Math.abs(p.heading-pose.heading)<1e-6)return false;
      const x=view.w/2+(p.x-view.cameraX)*zoom,y=view.h/2+(p.y-view.cameraY)*zoom,radius=Math.hypot(p.width,p.height)*zoom/2+2;
      return !(x+radius<(clip?.x||0)-4||y+radius<(clip?.y||0)-4||x-radius>(clip?clip.x+clip.w:view.w)+4||y-radius>(clip?clip.y+clip.h:view.h)+4);
    });
    if(!pending.length&&(worldPending||!sweeps.length)){stats.emptyPendingSurfaces=(stats.emptyPendingSurfaces||0)+1;emptyCanvas||=document.createElement('canvas');if(emptyCanvas.width!==1||emptyCanvas.height!==1){emptyCanvas.width=1;emptyCanvas.height=1;}return {source:emptyCanvas,version:0};}
    const key=[view.w,view.h,view.cameraX,view.cameraY,view.zoom,field.pendingRevision,worldPending,clip?.x,clip?.y,clip?.w,clip?.h].join(':');
    if(pendingField===field&&pendingKey===key)return {source:pendingCanvas,version:pendingVersion,rect:pendingRect};
    const crop=screenBounds(view,allPending.concat(worldPending?[]:sweeps.flatMap(s=>[s.from,s.to])),1,!worldPending&&sweeps.length>0,clip);pendingRect=crop.rect;
    pendingCanvas||=document.createElement('canvas');if(pendingCanvas.width!==crop.w||pendingCanvas.height!==crop.h){pendingCanvas.width=crop.w;pendingCanvas.height=crop.h;}
    const ctx=pendingCanvas.getContext('2d');ctx.clearRect(0,0,crop.w,crop.h);stats.pendingSurfaceRasters=(stats.pendingSurfaceRasters||0)+1;
    ctx.fillStyle='#fff';ctx.beginPath();
    if(!worldPending)for(const sweep of sweeps)sweptPolygons(sweep.mask,sweep.from,sweep.to,polygon=>{if(!polygon.length)return;for(let i=0;i<polygon.length;i++){const p=polygon[i],x=view.w/2+(p.x-view.cameraX)*zoom-crop.x,y=view.h/2+(p.y-view.cameraY)*zoom-crop.y;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();});
    ctx.fill();
    for(const p of pending){if(worldPending&&p.continuous)continue;const pose=currentById.get(p.id||'player');if(pose&&Math.abs(p.x-pose.x)+Math.abs(p.y-pose.y)+Math.abs(p.heading-pose.heading)<1e-6)continue;
      const x=view.w/2+(p.x-view.cameraX)*zoom,y=view.h/2+(p.y-view.cameraY)*zoom,radius=Math.hypot(p.width,p.height)*zoom/2+2;
      if(x+radius<0||y+radius<0||x-radius>view.w||y-radius>view.h)continue;
      ctx.save();ctx.translate(x-crop.x,y-crop.y);ctx.rotate(p.heading+Math.PI/2);ctx.drawImage(p.mask.stencil||p.mask.art,-p.width*zoom/2,-p.height*zoom/2,p.width*zoom,p.height*zoom);ctx.restore();}
    // Recent swept silhouettes must not close the present nacelle openings.
    // The exact current hull is still cleared by the normal material pass.
    for(const {pose,mask} of bodies){const x=view.w/2+(pose.x-view.cameraX)*zoom,y=view.h/2+(pose.y-view.cameraY)*zoom,r=Math.hypot(pose.width,pose.height)*zoom/2+2;if(x+r<crop.x||y+r<crop.y||x-r>crop.x+crop.w||y-r>crop.y+crop.h)continue;
      if(mask.openingStencil){ctx.save();ctx.globalCompositeOperation='destination-out';ctx.translate(x-crop.x,y-crop.y);ctx.rotate(pose.heading+Math.PI/2);ctx.drawImage(mask.openingStencil,-pose.width*zoom/2,-pose.height*zoom/2,pose.width*zoom,pose.height*zoom);ctx.restore();}}
    pendingField=field;pendingKey=key;pendingVersion++;return {source:pendingCanvas,version:pendingVersion,rect:pendingRect};
  }
  function clearPending(ctx,view,field,pose){
    const pending=pendingSurface(view,field,pose);if(pending.source.width===1)return;
    const rect=pending.rect||{x:0,y:0,w:view.w,h:view.h},sx=ctx.canvas.width/view.w,sy=ctx.canvas.height/view.h;
    ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-out';ctx.drawImage(pending.source,rect.x*sx,rect.y*sy,rect.w*sx,rect.h*sy);ctx.restore();
  }
  const stats={renders:0,pairRenders:0,compiles:0,failures:0,contextLosses:0};
  const vortexData=new Float32Array(32),vortexInfo=new Float32Array(32),vortexFlow=new Float32Array(16);
  const fireData=new Float32Array(12),fireInfo=new Float32Array(12),sheetData=new Float32Array(12),sheetInfo=new Float32Array(12);
  function prepare(){
    if(program&&!lost||failed||lost)return;
    if(!output){output=document.createElement('canvas');output.dataset.nebulaMaterial='persistent';output.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;program=null;stats.contextLosses++;});output.addEventListener('webglcontextrestored',()=>{lost=false;failed=false;program=null;});}
    try{
      gl=output.getContext('webgl2',{alpha:true,premultipliedAlpha:true,depth:false,stencil:false,antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
      const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
      const link=source=>{const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,source),p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;};
      program=link(fragment);pairProgram=link(pairFragment);floatLinear=!!gl.getExtension('OES_texture_float_linear');
      gasTextureRenderer?.dispose();gasTextureRenderer=null;
      try{gasTextureRenderer=root.nativeNebulaGas?.createTextureRenderer?.(gl)||null;}catch(error){stats.gasTextureReason=String(error.message||error);}
      vao=gl.createVertexArray();textures=Array.from({length:6},()=>gl.createTexture());locations={};
      volumeTexture=null;uploadedVolume=null;fireTexture=null;uploadedFire=null;
      pairLocations={};for(const name of ['u_source','u_density','u_mask','u_pending','u_rate','u_swept','u_published','u_worldPending','u_maskRect','u_pendingRect','u_maskTexture','u_pendingTexture','u_view','u_camera','u_origin','u_grid','u_zoom','u_cell','u_fraction','u_prediction','u_opacity','u_body','u_axis','u_ready','u_screenMask','u_worldSource','u_clearPending','u_linear','u_tile','u_feather','u_badlands','u_badlandsEnvelope','u_vortexCount','u_vortices[0]','u_vortexInfo[0]','u_vortexFlow[0]','u_vortexVolume','u_currentRegion','u_currentFrame','u_currentTime','u_fireCount','u_fires[0]','u_fireInfo[0]','u_fireVolume','u_sheetCount','u_sheets[0]','u_sheetInfo[0]']){locations[name]=gl.getUniformLocation(program,name);pairLocations[name]=gl.getUniformLocation(pairProgram,name);}
      fieldUploads.clear();uploadedField=null;uploadedRevision=-1;uploadedRegion=null;pendingGPU=null;pendingGPUFailed=false;uploadedSizes=[];uploadedFilters=[];preparedView='';uploadedMask=null;uploadedMaskVersion=-1;uploadedSource=null;uploadedPending=null;uploadedPendingVersion=-1;pairFramebuffer=null;pairTextures=null;pairWidth=pairHeight=0;stats.compiles++;
    }catch(error){program=null;failed=true;stats.failures++;stats.reason=String(error.message||error);}
  }
  function fallback(view,source,field,pose,mask,fraction,options={}){
    if(!cpu){const canvas=document.createElement('canvas'),read=document.createElement('canvas'),hull=document.createElement('canvas');cpu={canvas,ctx:canvas.getContext('2d'),read,readCtx:read.getContext('2d',{willReadFrequently:true}),hull,hullCtx:hull.getContext('2d',{willReadFrequently:true})};}
    const ratio=Math.min(1,960/view.w,720/view.h),w=Math.round(view.w*ratio),h=Math.round(view.h*ratio);cpu.canvas.width=w;cpu.canvas.height=h;cpu.read.width=source.width;cpu.read.height=source.height;cpu.readCtx.drawImage(source,0,0);
    cpu.hull.width=w;cpu.hull.height=h;const hc=cpu.hullCtx,zoom=view.zoom||1;
    for(const {pose:p,mask:m} of options.bodies||[{pose,mask}]){hc.save();hc.translate((view.w/2+(p.x-view.cameraX)*zoom)*ratio,(view.h/2+(p.y-view.cameraY)*zoom)*ratio);hc.rotate(p.heading+Math.PI/2);hc.drawImage(m.art,-p.width*zoom*ratio/2,-p.height*zoom*ratio/2,p.width*zoom*ratio,p.height*zoom*ratio);hc.restore();}
    const hull=hc.getImageData(0,0,w,h).data,raw=cpu.readCtx.getImageData(0,0,source.width,source.height).data,image=cpu.ctx.createImageData(w,h),data=image.data,sample=field.sampleDensity||field.sample;
    const tint=[0,0,0],optical={},curl={},fireCurl={},wind={},fireAPI=root.nativeNebulaFire,stormAPI=root.nativeDevNebulaStorm,o=options.badlands,tile=options.tile,ease=n=>{const t=clamp(n,0,1);return t*t*(3-2*t);};
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const wx=view.cameraX+((x+.5)/ratio-view.w/2)/view.zoom,wy=view.cameraY+((y+.5)/ratio-view.h/2)/view.zoom;
      let d=hull[(y*w+x)*4+3]>=40?0:sample(wx,wy);
      const heatingDensity=Math.max(0,d);
      const warped=options.vortices?.length&&root.nativePlasmaVortices?root.nativePlasmaVortices.sculpt(options.vortices,wx,wy,options.vortexTime||0,curl):null;d*=warped?.density??1;
      const heated=options.fireFronts?.length&&fireAPI?fireAPI.sculpt(options.fireFronts,wx,wy,options.fireTime||0,fireCurl):null;d*=heated?.density??1;
      const current=options.current&&root.nativeBadlandsCurrents?.offset(options.current,wx,wy,options.currentTime||0,wind);
      const shade=(warped?.shade??1)*(heated?.shade??1),blend=Math.max(warped?.blend||0,heated?.blend||0,current?.weight||0);
      const u=options.worldSource?((warped?.x??wx)+(heated?.x??wx)-wx+(current?.x||0)-field.minX)/field.width:(x+.5)/w,v=options.worldSource?((warped?.y??wy)+(heated?.y??wy)-wy+(current?.y||0)-field.minY)/field.height:(y+.5)/h;
      const sx=clamp(Math.floor(u*source.width),0,source.width-1),sy=clamp(Math.floor(v*source.height),0,source.height-1),j=(sy*source.width+sx)*4,i=(y*w+x)*4;
      let envelope=1,weight=1;
      for(let c=0;c<3;c++)tint[c]=(raw[j+3]>1?raw[j+c]:[31,66,59][c])/255*shade;
      if(blend>0&&options.worldSource){
        const ox=clamp(Math.floor((wx-field.minX)/field.width*source.width),0,source.width-1),oy=clamp(Math.floor((wy-field.minY)/field.height*source.height),0,source.height-1),k=(oy*source.width+ox)*4;
        const a=raw[k+3]*(1-blend),b=raw[j+3]*blend,total=a+b;
        for(let c=0;c<3;c++)tint[c]=total>1?(raw[k+c]*a+raw[j+c]*b)/total/255*shade:[31,66,59][c]/255;
      }
      if(warped?.heat>0)for(let c=0;c<3;c++)tint[c]=mix(tint[c],plasmaColour[c],warped.heat);
      if(heated?.blend>0)fireAPI.heat(tint,heated.temperature,heated.blend,heatingDensity);
      const sheet=options.sheetFlashes?.length&&stormAPI?stormAPI.sheetStrength(options.sheetFlashes,wx,wy):0;if(sheet>0)for(let c=0;c<3;c++)tint[c]=mix(tint[c],1,sheet);
      if(o&&root.nativeBadlands){const center=root.nativeBadlands.centre;root.nativeBadlands.optics(center.x+(wx-o.x)/1000,center.y+(wy-o.y)/1000,tint,optical);envelope=optical.opacity;tint[0]=optical.r;tint[1]=optical.g;tint[2]=optical.b;}
      if(tile?.feather){weight=(1-ease((Math.abs(wx-tile.x)-tile.halfWidth+tile.feather)/(tile.feather*2)))*(1-ease((Math.abs(wy-tile.y)-tile.halfHeight+tile.feather)/(tile.feather*2)));}
      for(let c=0;c<3;c++)data[i+c]=tint[c]*255;data[i+3]=(1-Math.exp(-Math.max(0,d)*fraction*(options.opacity??1)*envelope))*weight*255;
    }cpu.ctx.putImageData(image,0,0);return cpu.canvas;
  }
  function ensurePair(w,h){
    if(pairFramebuffer&&pairWidth===w&&pairHeight===h){gl.bindFramebuffer(gl.FRAMEBUFFER,pairFramebuffer);return;}
    pairFramebuffer||=gl.createFramebuffer();pairTextures||=[gl.createTexture(),gl.createTexture()];gl.bindFramebuffer(gl.FRAMEBUFFER,pairFramebuffer);
    for(let i=0;i<2;i++){gl.bindTexture(gl.TEXTURE_2D,pairTextures[i]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,pairTextures[i],0);}
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Fog layer framebuffer unavailable');pairWidth=w;pairHeight=h;
  }
  function retainPair(frame,index){pairImages||=[document.createElement('canvas'),document.createElement('canvas')];const canvas=pairImages[index];if(canvas.width!==frame.width||canvas.height!==frame.height){canvas.width=frame.width;canvas.height=frame.height;}const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(frame,0,0);return canvas;}
  function blitLayer(index,w,h,offset=0){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,pairFramebuffer);gl.readBuffer(gl.COLOR_ATTACHMENT0+index);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);gl.blitFramebuffer(0,0,w,h,offset,0,offset+w,h,gl.COLOR_BUFFER_BIT,gl.NEAREST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
  function preparePendingGPU(){
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,textures[5]);
    if(!pendingGPU){gl.texImage2D(gl.TEXTURE_2D,0,gl.R32UI,1,1,0,gl.RED_INTEGER,gl.UNSIGNED_INT,null);pendingGPU={field:null,sequence:0,latest:0,program:null,meshes:new Map()};}
    const state=pendingGPU;
    if(!state.program){
      const vertex=`#version 300 es
      precision highp float;layout(location=0) in vec3 point;uniform vec2 u_from,u_travel,u_size,u_axis,u_origin,u_extent;
      void main(){vec2 local=vec2((point.x-.5)*u_size.x,(.5-point.y)*u_size.y),world=u_from+vec2(u_axis.x*local.y-u_axis.y*local.x,u_axis.y*local.y+u_axis.x*local.x)+u_travel*point.z;gl_Position=vec4((world-u_origin)/u_extent*2.0-1.0,0,1);}`;
      const fragment=`#version 300 es
      precision highp int;uniform uint u_sequence;layout(location=0) out uint sequence;void main(){sequence=u_sequence;}`;
      const shaders=[gl.VERTEX_SHADER,gl.FRAGMENT_SHADER].map((type,i)=>{const s=gl.createShader(type);gl.shaderSource(s,i?fragment:vertex);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;});
      state.program=gl.createProgram();for(const s of shaders)gl.attachShader(state.program,s);gl.linkProgram(state.program);for(const s of shaders)gl.deleteShader(s);if(!gl.getProgramParameter(state.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(state.program));
      state.locations={};for(const n of ['u_from','u_travel','u_size','u_axis','u_origin','u_extent','u_sequence'])state.locations[n]=gl.getUniformLocation(state.program,n);state.vao=gl.createVertexArray();state.framebuffer=gl.createFramebuffer();
    }
    return state;
  }
  function warm(){
    prepare();if(program&&!lost&&!failed&&!pendingGPUFailed)try{preparePendingGPU();warmBuffers();}catch(error){pendingGPUFailed=true;stats.sweepFailures=(stats.sweepFailures||0)+1;stats.sweepReason=String(error.message||error);}
  }
  function warmBuffers(){
    // Allocate and exercise the transparent presentation surfaces before play.
    // Never clear an atlas which already contains an actual material frame.
    if(stats.renders||!root.innerWidth||!root.innerHeight)return;
    const rect=document.querySelector('#space')?.getBoundingClientRect(),vw=rect?.width||root.innerWidth,vh=rect?.height||root.innerHeight,ratio=Math.min(1,640/vw,400/vh),w=Math.round(vw*ratio),h=Math.round(vh*ratio),key=w+':'+h;
    if(preparedView===key)return;output.width=w*2;output.height=h;ensurePair(w,h);gl.viewport(0,0,w,h);gl.disable(gl.BLEND);gl.useProgram(pairProgram);gl.bindVertexArray(vao);
    const samplers=['u_source','u_density','u_mask','u_pending','u_rate','u_swept'];
    for(let i=0;i<6;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      if(i===1||i===4)gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,1,1,0,gl.RED,gl.FLOAT,new Float32Array(1));
      else if(i!==5)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));gl.uniform1i(pairLocations[samplers[i]],i);
    }
    gl.uniform2f(pairLocations.u_view,vw,vh);gl.uniform2f(pairLocations.u_grid,1,1);gl.uniform1f(pairLocations.u_zoom,1);gl.uniform1f(pairLocations.u_cell,1);gl.uniform4f(pairLocations.u_body,0,0,1,1);gl.uniform2f(pairLocations.u_axis,1,0);gl.uniform4f(pairLocations.u_maskRect,0,0,1,1);gl.uniform4f(pairLocations.u_pendingRect,0,0,1,1);gl.uniform1i(pairLocations.u_ready,1);gl.uniform1i(pairLocations.u_screenMask,1);gl.drawArrays(gl.TRIANGLES,0,3);
    for(let i=0;i<2;i++)blitLayer(i,w,h,i*w);
    warmAtlas||=document.createElement('canvas');warmAtlas.width=w*2;warmAtlas.height=h;warmAtlas.getContext('2d').drawImage(output,0,0);
    preparedView=key;stats.preparedViews=(stats.preparedViews||0)+1;
  }
  function worldPending(field,bank,warmBodies=null){
    const pipeline=preparePendingGPU(),sweeps=field.pendingSweeps||[];
    let state=bank.pending;
    if(!state){state=bank.pending={sequence:0,latest:0,sized:false};gl.texImage2D(gl.TEXTURE_2D,0,gl.R32UI,1,1,0,gl.RED_INTEGER,gl.UNSIGNED_INT,null);}
    // Dev plasma continuously moves this field. Allocate its retained movement
    // mask while the cloud is first prepared, before the first encounter can
    // force a synchronous framebuffer validation behind background art work.
    if(!sweeps.length&&(!warmBodies||state.sized))return state.latest>(field.publishedSequence||0);
    gl.bindFramebuffer(gl.FRAMEBUFFER,pipeline.framebuffer);
    if(!state.sized){
      gl.texImage2D(gl.TEXTURE_2D,0,gl.R32UI,field.w,field.h,0,gl.RED_INTEGER,gl.UNSIGNED_INT,null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,textures[5],0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Pending sweep framebuffer unavailable');gl.clearBufferuiv(gl.COLOR,0,new Uint32Array(4));state.sized=true;
      stats.pendingAllocations=(stats.pendingAllocations||0)+1;
    }else gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,textures[5],0);
    gl.viewport(0,0,field.w,field.h);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.useProgram(pipeline.program);gl.bindVertexArray(pipeline.vao);
    const loc=pipeline.locations;gl.uniform2f(loc.u_origin,field.minX,field.minY);gl.uniform2f(loc.u_extent,field.w*field.cell,field.h*field.cell);
    function meshFor(mask){
      let mesh=pipeline.meshes.get(mask);if(mesh){pipeline.meshes.delete(mask);pipeline.meshes.set(mask,mesh);return mesh;}
      const data=[],point=(x,y,t)=>data.push(x/mask.w,y/mask.h,t),edge=(x,y,a,b)=>{point(x,y,0);point(a,b,0);point(x,y,1);point(x,y,1);point(a,b,0);point(a,b,1);};
      for(const r of hullRectangles(mask)){const x=r.x,y=r.y,a=x+r.w,b=y+r.h;point(x,y,0);point(a,y,0);point(x,b,0);point(x,b,0);point(a,y,0);point(a,b,0);}
      // Sweeping the boundary plus the starting silhouette gives the exact
      // translated union, with little overdraw and no distance subdivisions.
      for(let y=0;y<mask.h;y++)for(let x=0;x<mask.w;x++)if(mask.alpha[y*mask.w+x]>=48){
        if(!x||mask.alpha[y*mask.w+x-1]<48)edge(x,y,x,y+1);
        if(x===mask.w-1||mask.alpha[y*mask.w+x+1]<48)edge(x+1,y,x+1,y+1);
        if(!y||mask.alpha[(y-1)*mask.w+x]<48)edge(x,y,x+1,y);
        if(y===mask.h-1||mask.alpha[(y+1)*mask.w+x]<48)edge(x,y+1,x+1,y+1);
      }
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);mesh={buffer,count:data.length/3};pipeline.meshes.set(mask,mesh);
      if(pipeline.meshes.size>48){const first=pipeline.meshes.keys().next().value;gl.deleteBuffer(pipeline.meshes.get(first).buffer);pipeline.meshes.delete(first);}return mesh;
    }
    if(warmBodies)for(const body of warmBodies)meshFor(body.mask);
    for(const sweep of sweeps)if(sweep.sequence>state.sequence){
      const mesh=meshFor(sweep.mask),a=sweep.from,b=sweep.to,angle=Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading)),turns=Math.max(1,Math.ceil(Math.abs(angle)*Math.hypot(b.width,b.height)*.5/(field.cell*.65)));
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);gl.uniform2f(loc.u_size,b.width,b.height);gl.uniform1ui(loc.u_sequence,sweep.sequence);
      for(let i=0;i<turns;i++){const t=i/turns,heading=a.heading+angle*(i+.5)/turns;gl.uniform2f(loc.u_axis,Math.cos(heading),Math.sin(heading));gl.uniform2f(loc.u_from,mix(a.x,b.x,t),mix(a.y,b.y,t));gl.uniform2f(loc.u_travel,(b.x-a.x)/turns,(b.y-a.y)/turns);gl.drawArrays(gl.TRIANGLES,0,mesh.count);stats.pendingSweepDraws=(stats.pendingSweepDraws||0)+1;}
      state.latest=sweep.sequence;
    }
    state.sequence=field.acceptedSequence;return state.latest>(field.publishedSequence||0);
  }
  function visibleRegion(view,field,full,clip){
    if(full)return {x:0,y:0,w:field.w,h:field.h};
    const z=view.zoom||1,left=clip?.x||0,top=clip?.y||0,rightPixel=clip?clip.x+clip.w:view.w,bottomPixel=clip?clip.y+clip.h:view.h;
    const x=clamp(Math.floor((view.cameraX+(left-view.w/2)/z-field.minX)/field.cell)-3,0,field.w),y=clamp(Math.floor((view.cameraY+(top-view.h/2)/z-field.minY)/field.cell)-3,0,field.h);
    const right=clamp(Math.ceil((view.cameraX+(rightPixel-view.w/2)/z-field.minX)/field.cell)+3,0,field.w),bottom=clamp(Math.ceil((view.cameraY+(bottomPixel-view.h/2)/z-field.minY)/field.cell)+3,0,field.h);
    return {x,y,w:right-x,h:bottom-y};
  }
  function exposedRegions(next,old){
    if(!old)return [next];const x=Math.max(next.x,old.x),y=Math.max(next.y,old.y),right=Math.min(next.x+next.w,old.x+old.w),bottom=Math.min(next.y+next.h,old.y+old.h);
    if(right<=x||bottom<=y)return [next];
    return [{x:next.x,y:next.y,w:next.w,h:y-next.y},{x:next.x,y:bottom,w:next.w,h:next.y+next.h-bottom},{x:next.x,y,w:x-next.x,h:bottom-y},{x:right,y,w:next.x+next.w-right,h:bottom-y}].filter(r=>r.w>0&&r.h>0);
  }
  function changedRegions(field,region,changedField,changedRevision,full){
    if(changedField||full||changedRevision&&!field.dirty)return [region];
    const regions=exposedRegions(region,uploadedRegion);
    if(changedRevision&&field.dirty){
      const d=field.dirty,x=Math.max(region.x,d.x),y=Math.max(region.y,d.y),right=Math.min(region.x+region.w,d.x+d.w),bottom=Math.min(region.y+region.h,d.y+d.h);
      if(right>x&&bottom>y){const dirty={x,y,w:right-x,h:bottom-y},contains=(a,b)=>a.x<=b.x&&a.y<=b.y&&a.x+a.w>=b.x+b.w&&a.y+a.h>=b.y+b.h;
        if(!regions.some(r=>contains(r,dirty))){for(let i=regions.length-1;i>=0;i--)if(contains(dirty,regions[i]))regions.splice(i,1);regions.push(dirty);}
      }
    }return regions;
  }
  function uploadRegion(field,data,rect){
    if(!data||!rect.w||!rect.h)return;
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH,field.w);
    // Pass only the needed tail, avoiding validation/copying of preceding rows.
    gl.texSubImage2D(gl.TEXTURE_2D,0,rect.x,rect.y,rect.w,rect.h,gl.RED,gl.FLOAT,data.subarray(rect.y*field.w+rect.x));
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH,0);stats.uploadedCells=(stats.uploadedCells||0)+rect.w*rect.h;
  }
  function uploadCanvas(slot,source){
    const width=source.width||source.naturalWidth,height=source.height||source.naturalHeight,old=uploadedSizes[slot];
    if(old&&old.width===width&&old.height===height)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
    else{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);uploadedSizes[slot]={width,height};}
    stats.canvasUploadedPixels=(stats.canvasUploadedPixels||0)+width*height;
  }
  function uploadMaskCanvas(slot,source){
    const width=source.width||source.naturalWidth,height=source.height||source.naturalHeight,old=uploadedSizes[slot];
    if(!old||old.width<width||old.height<height){const w=Math.max(old?.width||1,2**Math.ceil(Math.log2(Math.max(1,width)))),h=Math.max(old?.height||1,2**Math.ceil(Math.log2(Math.max(1,height))));
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);uploadedSizes[slot]={width:w,height:h};stats.maskTextureAllocations=(stats.maskTextureAllocations||0)+1;
    }
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);stats.canvasUploadedPixels=(stats.canvasUploadedPixels||0)+width*height;
    stats.maskTextureBytes=[2,3].reduce((sum,i)=>sum+(uploadedSizes[i]?.width||0)*(uploadedSizes[i]?.height||0)*4,0);
  }
  function render(view,source,field,pose,mask,fraction,options={}){
    prepare();stats.renders++;if(!program||lost||failed){if(options.pair){const back=retainPair(fallback(view,source,field,pose,mask,.8,options),0),front=retainPair(fallback(view,source,field,pose,mask,.2,options),1);return {back,front};}return fallback(view,source,field,pose,mask,fraction,options);}
    const bank=selectField(field);
    const ratio=Math.min(1,1600/view.w,1000/view.h),w=Math.round(view.w*ratio),h=Math.round(view.h*ratio),outputWidth=options.pair&&options.direct?w*2:w;if(output.width!==outputWidth||output.height!==h){output.width=outputWidth;output.height=h;}
    let sourceFallback=null;
    if(options.gasSource&&gasTextureRenderer&&(uploadedSource!==source||uploadedSourceVersion!==options.sourceVersion)){
      try{
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[0]);const size=uploadedSizes[0];
        if(!size||size.width!==source.width||size.height!==source.height){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,source.width,source.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);uploadedSizes[0]={width:source.width,height:source.height};}
        gasTextureRenderer.draw(textures[0],source.width,source.height,options.gasSource);uploadedSource=source;uploadedSourceVersion=options.sourceVersion;
        stats.gasTextureDraws=(stats.gasTextureDraws||0)+1;
      }catch(error){
        gasTextureRenderer.dispose();gasTextureRenderer=null;stats.gasTextureFailures=(stats.gasTextureFailures||0)+1;stats.gasTextureReason=String(error.message||error);
        const d=options.gasSource;sourceFallback=root.nativeNebulaGas.render(d.view,d.planes,d.style,d.time,d.seed,d.options);
      }
    }
    let hasWorldPending=false;if(!pendingGPUFailed)try{hasWorldPending=worldPending(field,bank,options.vortices?.length?options.bodies||[]:null)&&!!options.clearPending;}catch(error){pendingGPUFailed=true;stats.sweepFailures=(stats.sweepFailures||0)+1;stats.sweepReason=String(error.message||error);}
    if(!bank.pending){gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,textures[5]);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32UI,1,1,0,gl.RED_INTEGER,gl.UNSIGNED_INT,null);bank.pending={sequence:0,latest:0,sized:false};}
    if(options.pair)ensurePair(w,h);else gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const loc=options.pair?pairLocations:locations;
    gl.viewport(0,0,w,h);gl.disable(gl.BLEND);gl.useProgram(options.pair?pairProgram:program);gl.bindVertexArray(vao);
    const pending=options.clearPending?pendingSurface(view,field,options.bodies,hasWorldPending,options.clip):null;
    const changedField=uploadedField!==field,changedRevision=uploadedRevision!==field.revision,region=visibleRegion(view,field,options.fullUpload,options.clip),regions=changedRegions(field,region,changedField,changedRevision,options.fullUpload),linear=floatLinear&&options.linear!==false;
    for(let t=0;t<6;t++){
      gl.activeTexture(gl.TEXTURE0+t);gl.bindTexture(gl.TEXTURE_2D,textures[t]);const nearest=t===5||(t===1||t===4)&&!linear;
      if(uploadedFilters[t]!==nearest){if(uploadedFilters[t]===undefined){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,nearest?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,nearest?gl.NEAREST:gl.LINEAR);uploadedFilters[t]=nearest;}
      if(t===0&&(options.sourceVersion===undefined||uploadedSource!==source||uploadedSourceVersion!==options.sourceVersion)){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);uploadCanvas(t,sourceFallback||source);uploadedSource=source;uploadedSourceVersion=options.sourceVersion;}
      if(t===1){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
        if(changedField)gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,field.w,field.h,0,gl.RED,gl.FLOAT,null);
        for(const rect of regions)uploadRegion(field,field.density,rect);}
      if(t===2&&(uploadedMask!==mask||uploadedMaskVersion!==(mask.version||0))){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);uploadMaskCanvas(t,mask.art);maskWidth=mask.art.width||mask.art.naturalWidth;maskHeight=mask.art.height||mask.art.naturalHeight;uploadedMask=mask;uploadedMaskVersion=mask.version||0;stats.coverageUploads=(stats.coverageUploads||0)+1;}
      if(t===3&&pending&&(uploadedPending!==pending.source||uploadedPendingVersion!==pending.version)){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);uploadMaskCanvas(t,pending.source);uploadedPending=pending.source;uploadedPendingVersion=pending.version;}
      if(t===3&&!pending&&!uploadedPending){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));uploadedPending=true;}
      if(t===4){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);if(changedField)gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,field.w,field.h,0,gl.RED,gl.FLOAT,null);
        for(const rect of regions)uploadRegion(field,field.rate,rect);}
      gl.uniform1i(loc[['u_source','u_density','u_mask','u_pending','u_rate','u_swept'][t]],t);
    }
    const retainedRegion=!changedRevision&&uploadedRegion&&uploadedRegion.x<=region.x&&uploadedRegion.y<=region.y&&uploadedRegion.x+uploadedRegion.w>=region.x+region.w&&uploadedRegion.y+uploadedRegion.h>=region.y+region.h;
    uploadedField=field;uploadedRevision=field.revision;if(!retainedRegion)uploadedRegion=region;field.uploaded();
    bank.initialized=true;bank.revision=uploadedRevision;bank.region=uploadedRegion;bank.source=uploadedSource;bank.sourceVersion=uploadedSourceVersion;
    for(let i=0;i<fieldTextureSlots.length;i++){bank.sizes[i]=uploadedSizes[fieldTextureSlots[i]];bank.filters[i]=uploadedFilters[fieldTextureSlots[i]];}
    gl.uniform2f(loc.u_view,view.w,view.h);gl.uniform2f(loc.u_camera,view.cameraX,view.cameraY);gl.uniform2f(loc.u_origin,field.minX,field.minY);gl.uniform2f(loc.u_grid,field.w,field.h);gl.uniform1f(loc.u_zoom,view.zoom||1);gl.uniform1f(loc.u_cell,field.cell);gl.uniform1f(loc.u_fraction,fraction);
    gl.uniform4f(loc.u_body,pose.x,pose.y,pose.width,pose.height);gl.uniform2f(loc.u_axis,Math.cos(pose.heading),Math.sin(pose.heading));
    gl.uniform1i(loc.u_ready,field.ready!==false?1:0);gl.uniform1i(loc.u_screenMask,mask.screen?1:0);gl.uniform1i(loc.u_worldSource,options.worldSource?1:0);
    gl.uniform1i(loc.u_clearPending,!!pending);
    gl.uniform1i(loc.u_linear,linear);
    gl.uniform1i(loc.u_worldPending,hasWorldPending);gl.uniform1ui(loc.u_published,field.publishedSequence||0);
    const mr=mask.rect||{x:0,y:0,w:view.w,h:view.h},pr=pending?.rect||{x:0,y:0,w:view.w,h:view.h};gl.uniform4f(loc.u_maskRect,mr.x,mr.y,mr.w,mr.h);gl.uniform4f(loc.u_pendingRect,pr.x,pr.y,pr.w,pr.h);
    gl.uniform4f(loc.u_maskTexture,1/(uploadedSizes[2]?.width||1),1/(uploadedSizes[2]?.height||1),maskWidth,maskHeight);
    gl.uniform4f(loc.u_pendingTexture,1/(uploadedSizes[3]?.width||1),1/(uploadedSizes[3]?.height||1),pending?.source.width||1,pending?.source.height||1);
    gl.uniform1f(loc.u_prediction,options.smooth?clamp(field.predictionSeconds||0,0,1/30):0);
    gl.uniform1f(loc.u_opacity,clamp(options.opacity??1,0,1));
    const tile=options.tile,o=options.badlands;
    const wind=options.current;gl.uniform4f(loc.u_currentRegion,wind?.x||0,wind?.y||0,wind?.rx||0,wind?.ry||0);gl.uniform4f(loc.u_currentFrame,wind?.c??1,wind?.s||0,wind?.scale||420,wind?.phase||0);gl.uniform1f(loc.u_currentTime,options.currentTime||0);
    const plasma=root.nativePlasmaVortices,volume=plasma?.volume;let vortexCount=0;
    if(volume&&options.vortices?.length){
      const halfW=view.w/(view.zoom||1)/2,halfH=view.h/(view.zoom||1)/2;
      for(const a of plasma.appearance(options.vortices,options.vortexTime||0)){
        const v=a.v,r=v.radius*1.35;if(Math.abs(v.x-view.cameraX)>halfW+r||Math.abs(v.y-view.cameraY)>halfH+r)continue;
        const i=vortexCount++;vortexData[i*4]=v.x;vortexData[i*4+1]=v.y;vortexData[i*4+2]=v.radius;vortexData[i*4+3]=v.direction;
        vortexInfo[i*4]=a.c;vortexInfo[i*4+1]=a.s;vortexInfo[i*4+2]=a.frame;vortexInfo[i*4+3]=a.formation;vortexFlow[i*2]=a.tc;vortexFlow[i*2+1]=a.ts;
        if(vortexCount===8)break;
      }
    }
    // Always bind a distinct sampler unit, including ordinary non-vortex draws.
    // Static data uploads only once per context, and is reused after that.
    gl.activeTexture(gl.TEXTURE0+6);
    if(!volumeTexture){volumeTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,volumeTexture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
    }else gl.bindTexture(gl.TEXTURE_2D,volumeTexture);
    if(vortexCount&&uploadedVolume!==volume){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,volume.width,volume.height,0,gl.RGBA,gl.UNSIGNED_BYTE,volume.bytes);uploadedVolume=volume;
      stats.volumeUploads=(stats.volumeUploads||0)+1;stats.volumeTextureBytes=volume.bytes.byteLength;}
    gl.uniform1i(loc.u_vortexVolume,6);gl.uniform1i(loc.u_vortexCount,vortexCount);
    if(vortexCount){gl.uniform4fv(loc['u_vortices[0]'],vortexData);gl.uniform4fv(loc['u_vortexInfo[0]'],vortexInfo);gl.uniform2fv(loc['u_vortexFlow[0]'],vortexFlow);}
    const fire=root.nativeNebulaFire,fireVolume=fire?.volume;let fireCount=0;
    const halfW=view.w/(view.zoom||1)/2,halfH=view.h/(view.zoom||1)/2;
    if(fireVolume&&options.fireFronts?.length)for(const a of fire.appearance(options.fireFronts,options.fireTime||0)){
      const v=a.v,ex=Math.abs(a.c)*v.halfWidth+Math.abs(a.s)*v.halfHeight,ey=Math.abs(a.s)*v.halfWidth+Math.abs(a.c)*v.halfHeight;
      if(a.intensity<=0||Math.abs(v.x-view.cameraX)>halfW+ex||Math.abs(v.y-view.cameraY)>halfH+ey)continue;
      const i=fireCount++;fireData[i*4]=v.x;fireData[i*4+1]=v.y;fireData[i*4+2]=v.halfWidth;fireData[i*4+3]=v.halfHeight;
      fireInfo[i*4]=a.c;fireInfo[i*4+1]=a.s;fireInfo[i*4+2]=a.frame;fireInfo[i*4+3]=a.intensity;if(fireCount===3)break;
    }
    gl.activeTexture(gl.TEXTURE0+7);
    if(!fireTexture){fireTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,fireTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
    }else gl.bindTexture(gl.TEXTURE_2D,fireTexture);
    if(fireCount&&uploadedFire!==fireVolume){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,fireVolume.width,fireVolume.height,0,gl.RGBA,gl.UNSIGNED_BYTE,fireVolume.bytes);uploadedFire=fireVolume;
      stats.fireUploads=(stats.fireUploads||0)+1;stats.fireTextureBytes=fireVolume.bytes.byteLength;}
    gl.uniform1i(loc.u_fireVolume,7);gl.uniform1i(loc.u_fireCount,fireCount);
    if(fireCount){gl.uniform4fv(loc['u_fires[0]'],fireData);gl.uniform4fv(loc['u_fireInfo[0]'],fireInfo);stats.fireRenders=(stats.fireRenders||0)+1;}
    let sheetCount=0;for(const e of options.sheetFlashes||[]){
      const ex=Math.abs(e.c)*e.halfWidth+Math.abs(e.s)*e.halfHeight,ey=Math.abs(e.s)*e.halfWidth+Math.abs(e.c)*e.halfHeight;
      if(e.strength<=.001||Math.abs(e.x-view.cameraX)>halfW+ex||Math.abs(e.y-view.cameraY)>halfH+ey)continue;
      const i=sheetCount++;sheetData[i*4]=e.x;sheetData[i*4+1]=e.y;sheetData[i*4+2]=e.halfWidth;sheetData[i*4+3]=e.halfHeight;
      sheetInfo[i*4]=e.c;sheetInfo[i*4+1]=e.s;sheetInfo[i*4+2]=e.strength;sheetInfo[i*4+3]=0;if(sheetCount===3)break;
    }
    gl.uniform1i(loc.u_sheetCount,sheetCount);if(sheetCount){gl.uniform4fv(loc['u_sheets[0]'],sheetData);gl.uniform4fv(loc['u_sheetInfo[0]'],sheetInfo);stats.sheetRenders=(stats.sheetRenders||0)+1;}
    gl.uniform4f(loc.u_tile,tile?.x||0,tile?.y||0,tile?.halfWidth||0,tile?.halfHeight||0);gl.uniform1f(loc.u_feather,tile?.feather||0);
    gl.uniform4f(loc.u_badlands,o?.x||0,o?.y||0,o?.rx||0,o?.ry||0);gl.uniform4f(loc.u_badlandsEnvelope,o?.supportRx||1,o?.supportRy||1,o?.spread||1,0);
    if(batch&&options.pair){
      if(!batch.draws){gl.clearBufferfv(gl.COLOR,0,new Float32Array(4));gl.clearBufferfv(gl.COLOR,1,new Float32Array(4));}
      gl.enable(gl.BLEND);if(tile)gl.blendFunc(gl.ONE,gl.ONE);else gl.blendFuncSeparate(gl.ONE,gl.ONE_MINUS_SRC_COLOR,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      const r=options.clip;if(r){const x=Math.round(r.x*w/view.w),right=Math.round((r.x+r.w)*w/view.w),top=Math.round(r.y*h/view.h),bottom=Math.round((r.y+r.h)*h/view.h);gl.enable(gl.SCISSOR_TEST);gl.scissor(x,h-bottom,right-x,bottom-top);}
    }
    gl.drawArrays(gl.TRIANGLES,0,3);
    if(batch&&options.pair){batch.draws++;gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);stats.pairRenders++;return deferredPair;}
    if(options.pair){stats.pairRenders++;if(options.direct){
      // Both optical layers cross the WebGL/Canvas boundary together. Retain
      // one atlas before painting ships, so front-layer presentation cannot
      // force another GPU synchronization halfway through the game frame.
      for(let i=0;i<2;i++)blitLayer(i,w,h,i*w);
      let layerAtlas=layerAtlases.get(field);if(!layerAtlas){layerAtlas=warmAtlas||document.createElement('canvas');warmAtlas=null;layerAtlases.set(field,layerAtlas);}if(layerAtlas.width!==w*2||layerAtlas.height!==h){layerAtlas.width=w*2;layerAtlas.height=h;}
      const ctx=layerAtlas.getContext('2d');ctx.globalCompositeOperation='copy';ctx.drawImage(output,0,0);ctx.globalCompositeOperation='source-over';
      return {paint(ctx,pass){ctx.drawImage(layerAtlas,pass==='front'?w:0,0,w,h,0,0,view.w,view.h);}};
    }for(let i=0;i<2;i++){blitLayer(i,w,h);retainPair(output,i);}return {back:pairImages[0],front:pairImages[1]};}
    return output;
  }
  function renderPair(view,source,field,bodies,options={}){
    const clip=options.clip,zoom=view.zoom||1,shown=clip?bodies.filter(({pose:p})=>{const x=view.w/2+(p.x-view.cameraX)*zoom,y=view.h/2+(p.y-view.cameraY)*zoom,r=Math.hypot(p.width,p.height)*zoom/2+4;return x+r>=clip.x&&y+r>=clip.y&&x-r<=clip.x+clip.w&&y-r<=clip.y+clip.h;}):bodies;
    const mask=coverageFor(view,shown,clip),pose=bodies[0]?.pose||{x:0,y:0,width:1,height:1,heading:0};return render(view,source,field,pose,mask,1,{...options,bodies,pair:true});
  }
  root.nativeNebulaMaterial=Object.freeze({supported,prepare:warm,createMask,maskFor,maskForRecord,maskForType,maskIndex,occupied,createField,createRuntimeField,render,renderPair,clearPending,beginBatch,endBatch,get batching(){return !!batch;},get gasTextureReady(){return !!gasTextureRenderer&&!!program&&!lost&&!failed;},release:releaseField,metrics:()=>({...stats,sampledMasks,cachedHullTypes:typeMasks.size,backend:program&&!lost&&!failed?'webgl2':'canvas-material',contextLost:lost})});
  // Compile while the menu/loading screen is idle, before a first fast pass
  // can put shader linking on an active flight frame. No material is advanced.
  if(typeof document!=='undefined'&&typeof setTimeout==='function'){
    if(typeof root.requestIdleCallback==='function')root.requestIdleCallback(warm,{timeout:1000});else setTimeout(warm,0);
  }
})();
