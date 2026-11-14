// Cosmetic gas only. Keep operations/Float32 stores aligned with flow() in
// nebula-material.js. No allocation, imports, gameplay state or random numbers.
@inline function r(p: usize, i: i32): f64 { return f64(load<f32>(p+usize(i)*4)); }
@inline function put(p: usize, i: i32, value: f64): void { store<f32>(p+usize(i)*4,f32(value)); }
@inline function pressure(p: usize, i: i32): f64 { return load<f64>(p+usize(i)*8); }
@inline function box(p: usize, i: i32): i32 { return load<i32>(p+usize(i)*4); }
@inline function pair(p: usize,i: i32): v128 { return f64x2.promote_low_f32x4(v128.load(p+usize(i)*4)); }
@inline function putPair(p: usize,i: i32,value: v128): void { v128.store64_lane(p+usize(i)*4,f32x4.demote_f64x2_zero(value),0); }

@inline function xy(p: usize,i: i32,axis: i32): f64 { return load<f64>(p+usize(i*2+axis)*8); }
@inline function edgeCeil(x: f64,y: f64,dx: f64,dy: f64,slope: f64,row: f64): f64 {
  const offset=row-y,part=offset*slope,value=x+part,ceiling=Math.ceil(value),guard=1e-8*(1+Math.abs(x)+Math.abs(part));
  // Most intersections are far from an integer. At a cell boundary retain
  // the reference multiplication/division order before choosing a pixel.
  return ceiling-value<guard||value-ceiling+1<guard?Math.ceil(x+offset*dx/dy):ceiling;
}
@inline function turn(p: usize,a: i32,b: i32,c: i32): f64 {
  return (xy(p,b,0)-xy(p,a,0))*(xy(p,c,1)-xy(p,a,1))-(xy(p,b,1)-xy(p,a,1))*(xy(p,c,0)-xy(p,a,0));
}

// Exact binary-artwork rectangles swept along a segment. Scratch is private to
// the field, and each covered grid cell is marked once regardless of distance.
function rasterPart(w: i32,h: i32,cell: f64,minX: f64,minY: f64,fromX: f64,fromY: f64,dx: f64,dy: f64,
  c: f64,s: f64,width: f64,height: f64,rects: usize,length: i32,bits: usize,scratch: usize,bounds: usize,rowLow: usize,rowHigh: usize,reset: bool,
  clip: bool=false,clipX: f64=0,clipY: f64=0,originX: f64=0,originY: f64=0,limit: f64=0): void {
  if(reset){
    // The previous union is the only nonzero scratch. Clear its actual bounds
    // instead of streaming the entire cloud's grid for every moving ship.
    const oldX0=box(bounds,0),oldY0=box(bounds,1),oldX1=box(bounds,2),oldY1=box(bounds,3);
    if(oldX0<=oldX1&&oldY0<=oldY1){
      if(oldX1-oldX0>w/2)memory.fill(bits+usize(oldY0*w+oldX0),0,usize((oldY1-oldY0)*w+oldX1-oldX0+1));
      else for(let y=oldY0;y<=oldY1;y++)memory.fill(bits+usize(y*w+oldX0),0,usize(oldX1-oldX0+1));
    }
    for(let y=0;y<h;y++){store<i32>(rowLow+usize(y)*4,w);store<i32>(rowHigh+usize(y)*4,-1);}
  }
  let x0=reset?w:box(bounds,0),y0=reset?h:box(bounds,1),x1=reset?0:box(bounds,2),y1=reset?0:box(bounds,3);const hull=scratch+128,dirX=clip?clipX:dx,dirY=clip?clipY:dy,tolerance=Math.sqrt(dirX*dirX+dirY*dirY)*1e-8;
  // Parallel edges have tied support corners. Keep the general hull/clip path
  // there rather than letting rounding choose an incomplete six-point chain.
  const degenerate=tolerance>0&&(Math.abs(-dirX*s+dirY*c)<tolerance||Math.abs(dirX*c+dirY*s)<tolerance);
  for(let rect=0;rect<length;rect++){
    const q=rects+usize(rect)*32,rx=load<f64>(q),ry=load<f64>(q+8),rw=load<f64>(q+16),rh=load<f64>(q+24);
    let n=0,points=scratch,pointCount=0;
    if(degenerate){
    for(let v=0;v<2;v++)for(let u=0;u<2;u++){
      const lx=((u?rw:rx)-.5)*width,ly=(.5-(v?rh:ry))*height,wx=fromX+c*ly-s*lx,wy=fromY+s*ly+c*lx,at=(v*2+u)*4;
      store<f64>(scratch+usize(at)*8,wx);store<f64>(scratch+usize(at+1)*8,wy);store<f64>(scratch+usize(at+2)*8,wx+dx);store<f64>(scratch+usize(at+3)*8,wy+dy);
    }
    for(let i=1;i<8;i++){const x=xy(scratch,i,0),y=xy(scratch,i,1);let j=i;
      while(j>0&&(xy(scratch,j-1,0)>x||(xy(scratch,j-1,0)==x&&xy(scratch,j-1,1)>y))){store<f64>(scratch+usize(j*2)*8,xy(scratch,j-1,0));store<f64>(scratch+usize(j*2+1)*8,xy(scratch,j-1,1));j--;}
      store<f64>(scratch+usize(j*2)*8,x);store<f64>(scratch+usize(j*2+1)*8,y);
    }
    for(let i=0;i<8;i++){while(n>=2&&turn(scratch,box(hull,n-2),box(hull,n-1),i)<=0)n--;store<i32>(hull+usize(n++)*4,i);}
    const lower=n;
    for(let i=6;i>=0;i--){while(n>lower&&turn(scratch,box(hull,n-2),box(hull,n-1),i)<=0)n--;store<i32>(hull+usize(n++)*4,i);}n--;
    if(clip&&n>0){const out=scratch+256;let count=0,previous=box(hull,n-1),px=xy(scratch,previous,0),py=xy(scratch,previous,1),pd=clipX*(px-originX)+clipY*(py-originY)-limit;
      for(let i=0;i<n;i++){const at=box(hull,i),x=xy(scratch,at,0),y=xy(scratch,at,1),d=clipX*(x-originX)+clipY*(y-originY)-limit;
        if((d<=0)!=(pd<=0)){const t=pd/(pd-d);store<f64>(out+usize(count*2)*8,px+(x-px)*t);store<f64>(out+usize(count*2+1)*8,py+(y-py)*t);count++;}
        if(d<=0){store<f64>(out+usize(count*2)*8,x);store<f64>(out+usize(count*2+1)*8,y);count++;}px=x;py=y;pd=d;
      }
      n=count;points=out;for(let i=0;i<n;i++)store<i32>(hull+usize(i)*4,i);
    }
      pointCount=clip?n:8;
    }else if(clip){
      // Each original rectangle is inside this end plane. Its complete cap
      // is the trailing three corners plus the two transverse extrema cast
      // onto that plane. No sort, generic hull, or polygon clipping is needed.
      const base=scratch+256;let low=Infinity,high=-Infinity,minimum=Infinity,lowAlong=Infinity,highAlong=Infinity,lo=0,hi=0,back=0;
      for(let v=0;v<2;v++)for(let u=0;u<2;u++){
        const lx=((u?rw:rx)-.5)*width,ly=(.5-(v?rh:ry))*height,x=fromX+c*ly-s*lx,y=fromY+s*ly+c*lx,i=v*2+u,along=clipX*(x-originX)+clipY*(y-originY),side=-clipY*(x-originX)+clipX*(y-originY);
        store<f64>(base+usize(i*2)*8,x);store<f64>(base+usize(i*2+1)*8,y);
        if(side<low||(side==low&&along<lowAlong)){low=side;lowAlong=along;lo=i;}
        if(side>high||(side==high&&along<highAlong)){high=side;highAlong=along;hi=i;}
        if(along<minimum){minimum=along;back=i;}
      }
      const indices=scratch+400;store<i32>(indices,lo);store<i32>(indices+4,back);store<i32>(indices+8,hi);store<i32>(indices+12,hi);store<i32>(indices+16,lo);
      const norm=clipX*clipX+clipY*clipY;
      for(let i=0;i<5;i++){const at=box(indices,i),x=xy(base,at,0),y=xy(base,at,1),amount=i>=3?Math.max(0,(limit-clipX*(x-originX)-clipY*(y-originY))/norm):0;
        store<f64>(scratch+usize(i*2)*8,x+clipX*amount);store<f64>(scratch+usize(i*2+1)*8,y+clipY*amount);store<i32>(hull+usize(i)*4,i);
      }n=5;
    }else{
      // A translated rectangle has a known six-vertex boundary. Construct it
      // directly instead of sorting eight points and finding a generic hull.
      const base=scratch+256;let low=Infinity,high=-Infinity,minimum=Infinity,maximum=-Infinity,lowAlong=Infinity,highAlong=Infinity,lo=0,hi=0,back=0,front=0;
      for(let v=0;v<2;v++)for(let u=0;u<2;u++){
        const lx=((u?rw:rx)-.5)*width,ly=(.5-(v?rh:ry))*height,x=fromX+c*ly-s*lx,y=fromY+s*ly+c*lx,i=v*2+u,along=dx*(x-fromX)+dy*(y-fromY),side=-dy*(x-fromX)+dx*(y-fromY);
        store<f64>(base+usize(i*2)*8,x);store<f64>(base+usize(i*2+1)*8,y);
        if(side<low||(side==low&&along<lowAlong)){low=side;lowAlong=along;lo=i;}
        if(side>high||(side==high&&along<highAlong)){high=side;highAlong=along;hi=i;}
        if(along<minimum){minimum=along;back=i;}if(along>maximum){maximum=along;front=i;}
      }
      const indices=scratch+400;
      if(dx==0&&dy==0){store<i32>(indices,0);store<i32>(indices+4,1);store<i32>(indices+8,3);store<i32>(indices+12,2);n=4;}
      else{store<i32>(indices,lo);store<i32>(indices+4,back);store<i32>(indices+8,hi);store<i32>(indices+12,hi);store<i32>(indices+16,front);store<i32>(indices+20,lo);n=6;}
      for(let i=0;i<n;i++){const at=box(indices,i);store<f64>(scratch+usize(i*2)*8,xy(base,at,0)+(i>=3?dx:0));store<f64>(scratch+usize(i*2+1)*8,xy(base,at,1)+(i>=3?dy:0));store<i32>(hull+usize(i)*4,i);}
    }
    if(n<3)continue;let low=Infinity,high=-Infinity;
    for(let i=0;i<n;i++){const at=box(hull,i),y=(xy(points,at,1)-minY)/cell-.5;low=Math.min(low,y);high=Math.max(high,y);}
    // Convert after building the hull, retaining the JavaScript arithmetic order.
    if(!degenerate)pointCount=n;
    for(let i=0;i<pointCount;i++){store<f64>(points+usize(i*2)*8,(xy(points,i,0)-minX)/cell-.5);store<f64>(points+usize(i*2+1)*8,(xy(points,i,1)-minY)/cell-.5);}
    const first=i32(Math.max(1,Math.min(f64(h-2),Math.ceil(low)))),last=i32(Math.max(1,Math.min(f64(h-2),Math.floor(high))));
    let edges=0,ax: f64=0,ay: f64=0,adx: f64=0,ady: f64=1,aSlope: f64=0,aEnd: f64=0,bx: f64=0,by: f64=0,bdx: f64=0,bdy: f64=1,bSlope: f64=0,bEnd: f64=0;
    for(let y=first;y<=last;y++){
      // A convex swept rectangle has two active scan edges. Keep them until
      // a vertex is crossed instead of searching all six edges on every row.
      if(edges!=2||f64(y)>=aEnd||f64(y)>=bEnd){edges=0;
        for(let i=0;i<n;i++){const a=box(hull,i),b=box(hull,i+1==n?0:i+1),ya=xy(points,a,1),yb=xy(points,b,1);
          if(f64(y)>=Math.min(ya,yb)&&f64(y)<Math.max(ya,yb)){
            if(edges==0){ax=xy(points,a,0);ay=ya;adx=xy(points,b,0)-ax;ady=yb-ya;aSlope=adx/ady;aEnd=Math.max(ya,yb);}
            else{bx=xy(points,a,0);by=ya;bdx=xy(points,b,0)-bx;bdy=yb-ya;bSlope=bdx/bdy;bEnd=Math.max(ya,yb);}edges++;
          }
        }
      }
      if(edges!=2)continue;const xa=edgeCeil(ax,ay,adx,ady,aSlope,f64(y)),xb=edgeCeil(bx,by,bdx,bdy,bSlope,f64(y));
      const start=i32(Math.max(1,Math.min(xa,xb))),end=i32(Math.min(f64(w-2),Math.max(xa,xb)-1));if(start>end)continue;
      const lo=load<i32>(rowLow+usize(y)*4),hi=load<i32>(rowHigh+usize(y)*4);
      // This interval and its bounds were already recorded by an earlier
      // opaque rectangle. Overlapping caps need neither writes nor bookkeeping.
      if(start>=lo&&end<=hi)continue;
      // Most rectangles overlap the already filled middle of a long sweep.
      // Retain one known continuous interval per row; never bridge a real gap.
      if(start<=hi+1&&end>=lo-1){
        if(start<lo){memory.fill(bits+usize(y*w+start),1,usize(lo-start));store<i32>(rowLow+usize(y)*4,start);}
        if(end>hi){memory.fill(bits+usize(y*w+hi+1),1,usize(end-hi));store<i32>(rowHigh+usize(y)*4,end);}
      }else if(start<lo||end>hi){memory.fill(bits+usize(y*w+start),1,usize(end-start+1));if(end-start>hi-lo){store<i32>(rowLow+usize(y)*4,start);store<i32>(rowHigh+usize(y)*4,end);}}
      x0=min(x0,start);x1=max(x1,end);y0=min(y0,y);y1=max(y1,y);
    }
  }
  store<i32>(bounds,x0);store<i32>(bounds+4,y0);store<i32>(bounds+8,x1);store<i32>(bounds+12,y1);
}

export function rasterSweep(w: i32,h: i32,cell: f64,minX: f64,minY: f64,fromX: f64,fromY: f64,dx: f64,dy: f64,
  c: f64,s: f64,width: f64,height: f64,rects: usize,length: i32,bits: usize,scratch: usize,bounds: usize,rowLow: usize,rowHigh: usize,projections: usize): void {
  if(!length){rasterPart(w,h,cell,minX,minY,fromX,fromY,dx,dy,c,s,width,height,rects,0,bits,scratch,bounds,rowLow,rowHigh,true);return;}
  const distance=Math.sqrt(dx*dx+dy*dy),ex=dx/distance,ey=dy/distance,nx=-ey,ny=ex,alongX=-ex*s+ey*c,alongY=ex*c+ey*s,sideX=-nx*s+ny*c,sideY=nx*c+ny*s;
  let a=Infinity,b=-Infinity;
  for(let i=0;i<length;i++){
    const q=rects+usize(i)*32,lx=(load<f64>(q)-.5)*width,rx=(load<f64>(q+16)-.5)*width,ty=(.5-load<f64>(q+8))*height,by=(.5-load<f64>(q+24))*height;
    a=Math.min(a,Math.min(lx*alongX,rx*alongX)+Math.min(ty*alongY,by*alongY));b=Math.max(b,Math.max(lx*alongX,rx*alongX)+Math.max(ty*alongY,by*alongY));
    store<f64>(projections+usize(i)*16,Math.min(lx*sideX,rx*sideX)+Math.min(ty*sideY,by*sideY));store<f64>(projections+usize(i)*16+8,Math.max(lx*sideX,rx*sideX)+Math.max(ty*sideY,by*sideY));
  }
  const span=b-a;
  if(!(distance>span*2)){
    rasterPart(w,h,cell,minX,minY,fromX,fromY,dx,dy,c,s,width,height,rects,length,bits,scratch,bounds,rowLow,rowHigh,true);return;
  }
  // The long middle is already fully covered on each projected opaque run.
  // Raster detailed artwork only at the two ends. This is an exact union:
  // each short end sweep spans the hull's complete longitudinal extent.
  rasterPart(w,h,cell,minX,minY,fromX,fromY,0,0,c,s,width,height,rects,0,bits,scratch,bounds,rowLow,rowHigh,true);
  for(let i=1;i<length;i++){const lo=load<f64>(projections+usize(i)*16),hi=load<f64>(projections+usize(i)*16+8);let j=i;
    while(j>0&&load<f64>(projections+usize(j-1)*16)>lo){store<f64>(projections+usize(j)*16,load<f64>(projections+usize(j-1)*16));store<f64>(projections+usize(j)*16+8,load<f64>(projections+usize(j-1)*16+8));j--;}
    store<f64>(projections+usize(j)*16,lo);store<f64>(projections+usize(j)*16+8,hi);
  }
  let low=load<f64>(projections),high=load<f64>(projections+8);const middle=scratch+480;
  store<f64>(middle,0);store<f64>(middle+8,0);store<f64>(middle+16,1);store<f64>(middle+24,1);
  for(let i=1;i<=length;i++){
    const lo=i<length?load<f64>(projections+usize(i)*16):Infinity,hi=i<length?load<f64>(projections+usize(i)*16+8):Infinity;
    if(lo<=high){high=Math.max(high,hi);continue;}
    const centerAlong=(b+a+distance)*.5,centerSide=(low+high)*.5;
    rasterPart(w,h,cell,minX,minY,fromX+ex*centerAlong+nx*centerSide,fromY+ey*centerAlong+ny*centerSide,0,0,ex,ey,high-low,distance-span,middle,1,bits,scratch,bounds,rowLow,rowHigh,false);low=lo;high=hi;
  }
  // End caps need only the material outside the already filled middle slab.
  rasterPart(w,h,cell,minX,minY,fromX,fromY,ex*span,ey*span,c,s,width,height,rects,length,bits,scratch,bounds,rowLow,rowHigh,false,true,ex,ey,fromX,fromY,b);
  rasterPart(w,h,cell,minX,minY,fromX+dx,fromY+dy,-ex*span,-ey*span,c,s,width,height,rects,length,bits,scratch,bounds,rowLow,rowHigh,false,true,-ex,-ey,fromX,fromY,-a-distance);
}

@inline function sweepTouch(i: i32,w: i32,columns: i32,flags: usize): void {store<u8>(flags+usize((i/w/16)*columns+(i%w)/16),1);}
@inline function sweepBank(i: i32,amount: f64,sign: f64,sideX: f64,sideY: f64,impulse: f64,d: usize,baseline: usize,p: usize,u: usize,v: usize,rate: usize,w: i32,columns: i32,flags: usize): void {
  if(!(amount>0))return;const old=r(d,i),total=old+amount;
  put(u,i,(r(u,i)*old+sideX*sign*impulse*amount)/total);put(v,i,(r(v,i)*old+sideY*sign*impulse*amount)/total);put(d,i,total);store<f64>(p+usize(i)*8,r(d,i)-r(baseline,i));put(rate,i,0);sweepTouch(i,w,columns,flags);
}
export function displaceSweep(w: i32,h: i32,vertical: bool,sideX: f64,sideY: f64,impulse: f64,bounds: usize,bits: usize,
  d: usize,baseline: usize,p: usize,u: usize,v: usize,rate: usize,swept: usize,solid: usize,columns: i32,flags: usize,result: usize,
  fromX: f64,fromY: f64,dx: f64,dy: f64,ex: f64,ey: f64): void {
  const x0=box(bounds,0),y0=box(bounds,1),x1=box(bounds,2),y1=box(bounds,3),a0=vertical?x0:y0,a1=vertical?x1:y1,b0=vertical?y0:x0,b1=vertical?y1:x1,stride=vertical?w:1;
  let removed: f64=0,count: f64=0;memory.fill(flags,0,usize(columns*((h+15)/16)));
  for(let a=a0;a<=a1;a++){
    const fromA=vertical?fromX:fromY,deltaA=vertical?dx:dy,radiusA=vertical?ex:ey,fromB=vertical?fromY:fromX,deltaB=vertical?dy:dx,radiusB=vertical?ey:ex;
    const t0=(f64(a)-fromA-radiusA)/deltaA,t1=(f64(a)-fromA+radiusA)/deltaA,low=Math.max(0,Math.min(t0,t1)),high=Math.min(1,Math.max(t0,t1));if(low>high)continue;
    const firstB=max(b0,i32(Math.ceil(Math.min(fromB+deltaB*low,fromB+deltaB*high)-radiusB-1e-8))),lastB=min(b1,i32(Math.floor(Math.max(fromB+deltaB*low,fromB+deltaB*high)+radiusB+1e-8)));
    for(let b=firstB;b<=lastB;b++){
    let i=vertical?b*w+a:a*w+b;if(!load<u8>(bits+usize(i)))continue;const first=b,start=i;
    while(b<=lastB&&load<u8>(bits+usize(i))){b++;i+=stride;}const last=b-1,end=i-stride;
    let lower=start-stride,upper=end+stride,lo=first-1,hi=last+1;const endLimit=vertical?h-1:w-1;
    while(lo>=1&&(load<u8>(bits+usize(lower))||load<u8>(solid+usize(lower)))){lo--;lower-=stride;}
    while(hi<endLimit&&(load<u8>(bits+usize(upper))||load<u8>(solid+usize(upper)))){hi++;upper+=stride;}
    const hasLower=lo>=1,hasUpper=hi<endLimit;if(!hasLower&&!hasUpper)continue;
    let lowMass: f64=0,highMass: f64=0;
    for(let j=first,k=start;j<=last;j++,k+=stride){const amount=r(d,k);if(j-first<=last-j)lowMass+=amount;else highMass+=amount;put(d,k,0);store<f64>(p+usize(k)*8,-r(baseline,k));put(rate,k,0);put(u,k,0);put(v,k,0);store<u8>(swept+usize(k),1);count++;removed+=amount;
      if(j==first||j==last||j%16==0)sweepTouch(k,w,columns,flags);
    }
    const sign: f64=(vertical?sideY:sideX)>=0?1:-1;
    if(hasLower&&hasUpper){sweepBank(lower,lowMass,-sign,sideX,sideY,impulse,d,baseline,p,u,v,rate,w,columns,flags);sweepBank(upper,highMass,sign,sideX,sideY,impulse,d,baseline,p,u,v,rate,w,columns,flags);}
    else sweepBank(hasLower?lower:upper,lowMass+highMass,hasLower?-sign:sign,sideX,sideY,impulse,d,baseline,p,u,v,rate,w,columns,flags);
    }
  }
  store<f64>(result,removed);store<f64>(result+8,count);
}

// Two independent momentum cells use identical f64 operation order. Horizontal
// fluxes below keep their sequential Float32 accumulator rounding; independent
// vertical pairs vectorize only after those contributions have been rounded.
@inline function velocityPair(i: i32,w: i32,p: usize,u: usize,v: usize,nu: usize,nv: usize,solid: usize,
  pressureScale: f64,advection: f64,dt: f64,drag: f64,reduced: bool,limit: f64,limit2: f64,epsilon: f64): void {
  const zero=f64x2.splat(0),vx=pair(u,i),vy=pair(v,i),ul=pair(u,i-1),ur=pair(u,i+1),ud=pair(u,i+w),uu=pair(u,i-w),vl=pair(v,i-1),vr=pair(v,i+1),vd=pair(v,i+w),vu=pair(v,i-w);
  let left=v128.load(p+usize(i-1)*8),right=v128.load(p+usize(i+1)*8),above=v128.load(p+usize(i-w)*8),below=v128.load(p+usize(i+w)*8);
  if((load<u32>(solid+usize(i-1))|load<u16>(solid+usize(i-w))|load<u16>(solid+usize(i+w)))!=0){
    const a=pressure(p,i),b=pressure(p,i+1);
    if(load<u8>(solid+usize(i-1)))left=f64x2.replace_lane(left,0,a);
    if(load<u8>(solid+usize(i+2)))right=f64x2.replace_lane(right,1,b);
    if(load<u8>(solid+usize(i-w)))above=f64x2.replace_lane(above,0,a);
    if(load<u8>(solid+usize(i-w+1)))above=f64x2.replace_lane(above,1,b);
    if(load<u8>(solid+usize(i+w)))below=f64x2.replace_lane(below,0,a);
    if(load<u8>(solid+usize(i+w+1)))below=f64x2.replace_lane(below,1,b);
  }
  const gx=f64x2.mul(f64x2.sub(right,left),f64x2.splat(pressureScale));
  const gy=f64x2.mul(f64x2.sub(below,above),f64x2.splat(pressureScale));
  const sumU=f64x2.add(f64x2.add(f64x2.add(ur,ul),ud),uu),sumV=f64x2.add(f64x2.add(f64x2.add(vr,vl),vd),vu);
  if(!v128.any_true(v128.or(v128.or(v128.or(vx,vy),v128.or(gx,gy)),v128.or(sumU,sumV)))){putPair(nu,i,zero);putPair(nv,i,zero);return;}
  const xPositive=f64x2.ge(vx,zero),yPositive=f64x2.ge(vy,zero);
  const duDx=v128.bitselect(f64x2.sub(vx,ul),f64x2.sub(ur,vx),xPositive),duDy=v128.bitselect(f64x2.sub(vx,uu),f64x2.sub(ud,vx),yPositive);
  const dvDx=v128.bitselect(f64x2.sub(vy,vl),f64x2.sub(vr,vy),xPositive),dvDy=v128.bitselect(f64x2.sub(vy,vu),f64x2.sub(vd,vy),yPositive);
  const advX=f64x2.mul(f64x2.add(f64x2.mul(vx,duDx),f64x2.mul(vy,duDy)),f64x2.splat(advection));
  const advY=f64x2.mul(f64x2.add(f64x2.mul(vx,dvDx),f64x2.mul(vy,dvDy)),f64x2.splat(advection));
  const viscX=f64x2.mul(f64x2.sub(sumU,f64x2.mul(vx,f64x2.splat(4))),f64x2.splat(.10)),viscY=f64x2.mul(f64x2.sub(sumV,f64x2.mul(vy,f64x2.splat(4))),f64x2.splat(.10));
  const forceX=f64x2.mul(f64x2.add(f64x2.mul(f64x2.neg(gx),f64x2.splat(18)),viscX),f64x2.splat(dt)),forceY=f64x2.mul(f64x2.add(f64x2.mul(f64x2.neg(gy),f64x2.splat(18)),viscY),f64x2.splat(dt));
  let nx=f64x2.mul(f64x2.add(f64x2.sub(vx,advX),forceX),f64x2.splat(drag)),ny=f64x2.mul(f64x2.add(f64x2.sub(vy,advY),forceY),f64x2.splat(drag));
  nx=v128.bitselect(zero,nx,f64x2.lt(f64x2.abs(nx),f64x2.splat(epsilon)));ny=v128.bitselect(zero,ny,f64x2.lt(f64x2.abs(ny),f64x2.splat(epsilon)));
  if(reduced){nx=f64x2.mul(nx,f64x2.splat(.5));ny=f64x2.mul(ny,f64x2.splat(.5));}
  const square=f64x2.add(f64x2.mul(nx,nx),f64x2.mul(ny,ny)),limited=f64x2.gt(square,f64x2.splat(limit2));
  if(v128.any_true(limited)){const scale=v128.bitselect(f64x2.div(f64x2.splat(limit),f64x2.sqrt(square)),f64x2.splat(1),limited);nx=f64x2.mul(nx,scale);ny=f64x2.mul(ny,scale);}
  putPair(nu,i,nx);putPair(nv,i,ny);
}

@inline function rightFlux(i: i32,x: i32,x1: i32,w: i32,right: bool,d: usize,p: usize,nu: usize,solid: usize,delta: usize,velocityStep: f64,diffusion: f64): void {
  if(x>=w-2||load<u8>(solid+usize(i+1))||!(x<x1||right))return;
  const j=i+1,di=r(d,i),dj=r(d,j),a=(r(nu,i)+r(nu,j))*velocityStep;
  let amount=a*(a>=0?di:dj)+(pressure(p,i)-pressure(p,j))*diffusion;
  if(amount>di*.24)amount=di*.24;else if(amount< -dj*.24)amount= -dj*.24;
  if(amount!=0){put(delta,i,r(delta,i)-amount);put(delta,j,r(delta,j)+amount);}
}

@inline function rightFluxPair(i: i32,d: usize,p: usize,nu: usize,delta: usize,velocityStep: f64,diffusion: f64): void {
  const zero=f64x2.splat(0),di=pair(d,i),dj=pair(d,i+1),a=f64x2.mul(f64x2.add(pair(nu,i),pair(nu,i+1)),f64x2.splat(velocityStep));
  let amount=f64x2.add(f64x2.mul(a,v128.bitselect(di,dj,f64x2.ge(a,zero))),f64x2.mul(f64x2.sub(v128.load(p+usize(i)*8),v128.load(p+usize(i+1)*8)),f64x2.splat(diffusion)));
  const upper=f64x2.mul(di,f64x2.splat(.24)),lower=f64x2.mul(f64x2.neg(dj),f64x2.splat(.24));amount=v128.bitselect(upper,v128.bitselect(lower,amount,f64x2.lt(amount,lower)),f64x2.gt(amount,upper));
  // Keep the two shared-cell Float32 accumulations in their original order.
  const first=f64x2.extract_lane(amount,0),second=f64x2.extract_lane(amount,1);
  if(first!=0){put(delta,i,r(delta,i)-first);put(delta,i+1,r(delta,i+1)+first);}
  if(second!=0){put(delta,i+1,r(delta,i+1)-second);put(delta,i+2,r(delta,i+2)+second);}
}

@inline function downFluxPair(i: i32,w: i32,d: usize,p: usize,nv: usize,delta: usize,velocityStep: f64,diffusion: f64): void {
  const zero=f64x2.splat(0),di=pair(d,i),dj=pair(d,i+w),a=f64x2.mul(f64x2.add(pair(nv,i),pair(nv,i+w)),f64x2.splat(velocityStep));
  let amount=f64x2.add(f64x2.mul(a,v128.bitselect(di,dj,f64x2.ge(a,zero))),f64x2.mul(f64x2.sub(v128.load(p+usize(i)*8),v128.load(p+usize(i+w)*8)),f64x2.splat(diffusion)));
  const upper=f64x2.mul(di,f64x2.splat(.24)),lower=f64x2.mul(f64x2.neg(dj),f64x2.splat(.24));
  amount=v128.bitselect(upper,v128.bitselect(lower,amount,f64x2.lt(amount,lower)),f64x2.gt(amount,upper));
  const current=pair(delta,i),below=pair(delta,i+w),nonzero=f64x2.ne(amount,zero);
  putPair(delta,i,v128.bitselect(f64x2.sub(current,amount),current,nonzero));putPair(delta,i+w,v128.bitselect(f64x2.add(below,amount),below,nonzero));
}

@inline function quietFlux4(i: i32,w: i32,p: usize,nu: usize,nv: usize): bool {
  if(pressure(p,i+4)!=0||r(nu,i+4)!=0)return false;
  const pressures=v128.or(v128.or(v128.load(p+usize(i)*8),v128.load(p+usize(i+2)*8)),v128.or(v128.load(p+usize(i+w)*8),v128.load(p+usize(i+w+2)*8)));
  if(v128.any_true(f64x2.abs(pressures)))return false;
  const velocities=v128.or(v128.or(v128.load(nu+usize(i)*4),v128.load(nv+usize(i)*4)),v128.load(nv+usize(i+w)*4));
  return !v128.any_true(f32x4.abs(velocities));
}

@inline function dryFlux4(i: i32,w: i32,d: usize): bool {
  // Both sides of every outgoing face have exactly zero gas. The existing
  // donor limits therefore make every flux zero, even with pressure/momentum.
  // Preserve incoming delta; velocity and the final accumulation still run.
  if(r(d,i+4)!=0)return false;
  const bits=v128.or(v128.load(d+usize(i)*4),v128.load(d+usize(i+w)*4));
  return !v128.any_true(v128.and(bits,i32x4.splat(0x7fffffff)));
}

export function flow(w: i32,h: i32,cell: f64,dt: f64,drag: f64,reduced: bool,limit: f64,limit2: f64,
  d: usize,baseline: usize,p: usize,u: usize,v: usize,delta: usize,nu: usize,nv: usize,solid: usize,rate: usize,
  ids: usize,length: i32,boxes: usize,flags: usize,columns: i32,result: usize,sleepVelocity: f64,sleepChange: f64,epsilon: f64,sleepCurvature: f64): void {
  const diffusion=.12*dt/(cell*cell),advection=dt/cell,velocityStep=dt/(cell*2),pressureScale=1/(cell*2),rateScale=1/dt;
  for(let k=0;k<length;k++){
    const id=box(ids,k),b=boxes+usize(id)*16,x0=box(b,0),y0=box(b,1),x1=box(b,2),y1=box(b,3);
    for(let y=y0;y<=y1;y++)for(let i=y*w+x0,end=y*w+x1,nextDry=i;i<=end;i++){
      if(i>=nextDry&&i+3<=end){nextDry=i+4;
        if(r(d,i)==0&&r(d,i-1)==0&&r(d,i+4)==0){
          const bits=v128.or(v128.or(v128.load(d+usize(i)*4),v128.load(d+usize(i-w)*4)),v128.load(d+usize(i+w)*4));
          if(!v128.any_true(v128.and(bits,i32x4.splat(0x7fffffff)))){v128.store(nu+usize(i)*4,i32x4.splat(0));v128.store(nv+usize(i)*4,i32x4.splat(0));i+=3;continue;}
        }
      }
      if(i<end&&!load<u8>(solid+usize(i))&&!load<u8>(solid+usize(i+1))&&!(r(d,i)==0||r(d,i+1)==0)){velocityPair(i,w,p,u,v,nu,nv,solid,pressureScale,advection,dt,drag,reduced,limit,limit2,epsilon);i++;continue;}
      if(load<u8>(solid+usize(i))){put(nu,i,0);put(nv,i,0);continue;}
      if(r(d,i)==0&&r(d,i-1)==0&&r(d,i+1)==0&&r(d,i-w)==0&&r(d,i+w)==0){put(nu,i,0);put(nv,i,0);continue;}
      const center=pressure(p,i),gx=((load<u8>(solid+usize(i+1))?center:pressure(p,i+1))-(load<u8>(solid+usize(i-1))?center:pressure(p,i-1)))*pressureScale,gy=((load<u8>(solid+usize(i+w))?center:pressure(p,i+w))-(load<u8>(solid+usize(i-w))?center:pressure(p,i-w)))*pressureScale;
      const vx=r(u,i),vy=r(v,i),ul=r(u,i-1),ur=r(u,i+1),ud=r(u,i+w),uu=r(u,i-w),vl=r(v,i-1),vr=r(v,i+1),vd=r(v,i+w),vu=r(v,i-w),sumU=ur+ul+ud+uu,sumV=vr+vl+vd+vu;
      if(vx==0&&vy==0&&gx==0&&gy==0&&sumU==0&&sumV==0){put(nu,i,0);put(nv,i,0);continue;}
      const duDx=vx>=0?vx-ul:ur-vx,duDy=vy>=0?vx-uu:ud-vx,dvDx=vx>=0?vy-vl:vr-vy,dvDy=vy>=0?vy-vu:vd-vy;
      let nx=(vx-(vx*duDx+vy*duDy)*advection+(-gx*18+(sumU-vx*4)*.10)*dt)*drag;
      let ny=(vy-(vx*dvDx+vy*dvDy)*advection+(-gy*18+(sumV-vy*4)*.10)*dt)*drag;
      if(nx<epsilon&&nx> -epsilon)nx=0;if(ny<epsilon&&ny> -epsilon)ny=0;
      if(reduced){nx*=.5;ny*=.5;}
      const square=nx*nx+ny*ny;if(square>limit2){const scale=limit/Math.sqrt(square);nx*=scale;ny*=scale;}
      put(nu,i,nx);put(nv,i,ny);
    }
  }
  for(let k=0;k<length;k++){
    const id=box(ids,k),b=boxes+usize(id)*16,x0=box(b,0),y0=box(b,1),x1=box(b,2),y1=box(b,3);
    const right=load<u8>(flags+usize(id+1)),below=load<u8>(flags+usize(id+columns));
    for(let y=y0;y<=y1;y++)for(let x=x0,i=y*w+x,nextQuad=x0;x<=x1;x++,i++){
      // All outgoing amounts are exactly zero. Leave any incoming delta intact
      // for the final pass; no material or elapsed fluid time is discarded.
      if(x>=nextQuad&&x+3<=x1){nextQuad=x+4;if(dryFlux4(i,w,d)||quietFlux4(i,w,p,nu,nv)){x+=3;i+=3;continue;}}
      if(x<x1&&y<h-2&&(y<y1||below)&&!load<u8>(solid+usize(i))&&!load<u8>(solid+usize(i+1))&&!load<u8>(solid+usize(i+w))&&!load<u8>(solid+usize(i+w+1))){
        // Each cell still rounds its right-edge contribution before its down
        // contribution. Moving the first down edge past the second right edge
        // is safe: those writes address disjoint cells (including next row).
        if(x+1<w-2&&(x+1<x1||right)&&!load<u8>(solid+usize(i+2)))rightFluxPair(i,d,p,nu,delta,velocityStep,diffusion);
        else{rightFlux(i,x,x1,w,right!=0,d,p,nu,solid,delta,velocityStep,diffusion);rightFlux(i+1,x+1,x1,w,right!=0,d,p,nu,solid,delta,velocityStep,diffusion);}
        downFluxPair(i,w,d,p,nv,delta,velocityStep,diffusion);x++;i++;continue;
      }
      if(load<u8>(solid+usize(i)))continue;
      const di=r(d,i),change=pressure(p,i);
      if(x<w-2&&!load<u8>(solid+usize(i+1))&&(x<x1||right)){
        const j=i+1,dj=r(d,j),a=(r(nu,i)+r(nu,j))*velocityStep;
        let amount=a*(a>=0?di:dj)+(change-pressure(p,j))*diffusion;
        if(amount>di*.24)amount=di*.24;else if(amount< -dj*.24)amount= -dj*.24;
        if(amount!=0){put(delta,i,r(delta,i)-amount);put(delta,j,r(delta,j)+amount);}
      }
      if(y<h-2&&!load<u8>(solid+usize(i+w))&&(y<y1||below)){
        const j=i+w,dj=r(d,j),a=(r(nv,i)+r(nv,j))*velocityStep;
        let amount=a*(a>=0?di:dj)+(change-pressure(p,j))*diffusion;
        if(amount>di*.24)amount=di*.24;else if(amount< -dj*.24)amount= -dj*.24;
        if(amount!=0){put(delta,i,r(delta,i)-amount);put(delta,j,r(delta,j)+amount);}
      }
    }
  }
  for(let k=0;k<length;k++){
    const id=box(ids,k),b=boxes+usize(id)*16,x0=box(b,0),y0=box(b,1),x1=box(b,2),y1=box(b,3);
    let changed=false,moving=false;
    for(let y=y0;y<=y1;y++)for(let i=y*w+x0,start=i,end=y*w+x1;i<=end;i++){
      // Four exactly quiet cells need no conversion, writes or bookkeeping.
      // Mask sign bits so negative zero follows the scalar equality checks.
      if(((i-start)&3)==0&&i+3<=end){const offset=usize(i)*4;
        const bits=v128.or(v128.or(v128.load(delta+offset),v128.load(nu+offset)),v128.or(v128.or(v128.load(nv+offset),v128.load(u+offset)),v128.or(v128.load(v+offset),v128.load(rate+offset))));
        if(!v128.any_true(v128.and(bits,i32x4.splat(0x7fffffff)))){i+=3;continue;}
      }
      const change=r(delta,i),value=r(d,i)+change,vx=r(nu,i),vy=r(nv,i);
      if(change==0&&vx==0&&vy==0&&r(u,i)==0&&r(v,i)==0&&r(rate,i)==0)continue;
      const oldRate=r(rate,i);put(rate,i,change*rateScale);put(d,i,value<1e-20&&value> -1e-20?0:value);store<f64>(p+usize(i)*8,r(d,i)-r(baseline,i));
      if(oldRate!=r(rate,i))changed=true;
      put(delta,i,0);put(u,i,vx);put(v,i,vy);
      if(!changed&&(Math.abs(change)>1e-12||vx!=0||vy!=0))changed=true;
      if(!moving&&(Math.abs(change)>sleepChange||Math.abs(vx)>sleepVelocity||Math.abs(vy)>sleepVelocity))moving=true;
    }
    if(!moving){
      for(let y=y0;y<=y1&&!moving;y++)for(let i=y*w+x0,end=y*w+x1;i<=end;i++){
        if(load<u8>(solid+usize(i))||r(d,i)==0&&r(d,i-1)==0&&r(d,i+1)==0&&r(d,i-w)==0&&r(d,i+w)==0)continue;
        const at=pressure(p,i),sum=(load<u8>(solid+usize(i-1))?at:pressure(p,i-1))+(load<u8>(solid+usize(i+1))?at:pressure(p,i+1))+(load<u8>(solid+usize(i-w))?at:pressure(p,i-w))+(load<u8>(solid+usize(i+w))?at:pressure(p,i+w));
        if(Math.abs(sum-at*4)>sleepCurvature){moving=true;break;}
      }
    }
    if(!moving)for(let y=y0;y<=y1;y++)for(let i=y*w+x0,end=y*w+x1;i<=end;i++){if(r(rate,i)!=0)changed=true;put(rate,i,0);}
    store<u8>(result+usize(id),u8(changed?1:0)|u8(moving?2:0));
  }
}
