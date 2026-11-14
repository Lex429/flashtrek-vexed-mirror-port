/* Frozen pre-cache contact calculation for exact parity checks. */
(()=>{
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const validPoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
  const shipMass=ship=>Math.max(.5,finite(ship.definition?.mass,8*(ship.dimensions.width*ship.dimensions.height/2400)**1.5));
  const hullRadii=ship=>ship.hullRadii||ship.radii;
  const shipInertia=ship=>Math.max(.01,finite(ship.definition?.inertia,shipMass(ship)*(hullRadii(ship).rx**2+hullRadii(ship).ry**2)/4));
  const shipRadius=ship=>Math.max(1,hullRadii(ship).rx,hullRadii(ship).ry);
  function ellipseSupport(ship,nx,ny){
    const angle=ship.heading+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),x=nx*c+ny*s,y=-nx*s+ny*c;
    const length=Math.hypot(ship.radii.rx*x,ship.radii.ry*y)||1;
    const lx=ship.radii.rx**2*x/length,ly=ship.radii.ry**2*y/length;
    return {x:lx*c-ly*s,y:lx*s+ly*c,r:length};
  }
  const contactAxes=Array.from({length:32},(_,i)=>({x:Math.cos(i*Math.PI/32),y:Math.sin(i*Math.PI/32)}));
  // Swept supporting planes of both oriented physical hull ellipses. Sampled
  // directions conservatively bound the curves; circles are broad phase only.
  function shipPairContact(a,b,dt){
    if(!(dt>0)||!validPoint(a)||!validPoint(b)||!a.radii||!b.radii)return null;
    if(window.nativeShipRepairs?.bayPassage(a,b)||window.nativeShipRepairs?.bayPassage(b,a))return null;
    const ax=finite(a.previousX,a.x),ay=finite(a.previousY,a.y),bx=finite(b.previousX,b.x),by=finite(b.previousY,b.y);
    const fx=bx-ax,fy=by-ay,dx=b.x-a.x-fx,dy=b.y-a.y-fy;
    const sweep=dx*dx+dy*dy,closest=sweep?clamp(-(fx*dx+fy*dy)/sweep,0,1):0;
    if(Math.hypot(fx+dx*closest,fy+dy*closest)>shipRadius(a)+shipRadius(b))return null;
    a={...a,radii:hullRadii(a)};b={...b,radii:hullRadii(b)};
    const ac=Math.cos(a.heading+Math.PI/2),as=Math.sin(a.heading+Math.PI/2),bc=Math.cos(b.heading+Math.PI/2),bs=Math.sin(b.heading+Math.PI/2);
    let enter=0,exit=1,normal=null,shallow=Infinity,overlap=true,shallowNormal=null;
    for(let i=0;i<36;i++){
      const axis=i<32?contactAxes[i]:i===32?{x:ac,y:as}:i===33?{x:-as,y:ac}:i===34?{x:bc,y:bs}:{x:-bs,y:bc};
      const nx=axis.x,ny=axis.y,r=Math.hypot(a.radii.rx*(nx*ac+ny*as),a.radii.ry*(-nx*as+ny*ac))+Math.hypot(b.radii.rx*(nx*bc+ny*bs),b.radii.ry*(-nx*bs+ny*bc));
      const p=fx*nx+fy*ny,v=dx*nx+dy*ny,depth=r-Math.abs(p);
      if(depth<0)overlap=false;
      if(depth<shallow){shallow=depth;const sign=p<0?-1:1;shallowNormal={x:nx*sign,y:ny*sign,r};}
      if(Math.abs(v)<1e-10){if(Math.abs(p)>r)return null;continue;}
      const t1=(-r-p)/v,t2=(r-p)/v,lo=Math.min(t1,t2),hi=Math.max(t1,t2);
      if(lo>enter){enter=lo;const sign=p+v*lo<0?-1:1;normal={x:nx*sign,y:ny*sign,r};}
      exit=Math.min(exit,hi);if(enter>exit||exit<0||enter>1)return null;
    }
    normal=overlap?shallowNormal:normal;if(!normal)return null;
    const t=overlap?0:Math.max(0,enter),nx=normal.x,ny=normal.y;
    const ma=shipMass(a),mb=shipMass(b),ia=shipInertia(a),ib=shipInertia(b),inverse=1/ma+1/mb;
    const ca={x:ax+(a.x-ax)*t,y:ay+(a.y-ay)*t},cb={x:bx+(b.x-bx)*t,y:by+(b.y-by)*t};
    const sa=ellipseSupport(a,nx,ny),sb=ellipseSupport(b,-nx,-ny),point={x:(ca.x+sa.x+cb.x+sb.x)/2,y:(ca.y+sa.y+cb.y+sb.y)/2};
    const ra={x:point.x-ca.x,y:point.y-ca.y},rb={x:point.x-cb.x,y:point.y-cb.y};
    const wa=finite(a.angularVelocity),wb=finite(b.angularVelocity),cross=(r,x,y)=>r.x*y-r.y*x;
    const contactVelocity=(vx,vy,w,r)=>({x:vx-w*r.y,y:vy+w*r.x});
    const va=contactVelocity(finite(a.vx),finite(a.vy),wa,ra),vb=contactVelocity(finite(b.vx),finite(b.vy),wb,rb);
    const closing=Math.max(0,(va.x-vb.x)*nx+(va.y-vb.y)*ny),rnA=cross(ra,nx,ny),rnB=cross(rb,nx,ny);
    const impulse=1.12*closing/(inverse+rnA*rnA/ia+rnB*rnB/ib);
    const normalWA=wa-rnA*impulse/ia,normalWB=wb+rnB*impulse/ib;
    const na=contactVelocity(finite(a.vx)-nx*impulse/ma,finite(a.vy)-ny*impulse/ma,normalWA,ra),nb=contactVelocity(finite(b.vx)+nx*impulse/mb,finite(b.vy)+ny*impulse/mb,normalWB,rb);
    const tx=-ny,ty=nx,rtA=cross(ra,tx,ty),rtB=cross(rb,tx,ty),tangent=(na.x-nb.x)*tx+(na.y-nb.y)*ty;
    const friction=clamp(tangent/(inverse+rtA*rtA/ia+rtB*rtB/ib),-impulse*.08,impulse*.08),ix=nx*impulse+tx*friction,iy=ny*impulse+ty*friction;
    const avx=finite(a.vx)-ix/ma,avy=finite(a.vy)-iy/ma,bvx=finite(b.vx)+ix/mb,bvy=finite(b.vy)+iy/mb,remaining=dt*(1-t);
    const angularA=wa-cross(ra,ix,iy)/ia,angularB=wb+cross(rb,ix,iy)/ib;
    const pa={x:ca.x+avx*remaining,y:ca.y+avy*remaining,vx:avx,vy:avy,angularVelocity:angularA,heading:wrap(a.heading+(angularA-wa)*remaining)};
    const pb={x:cb.x+bvx*remaining,y:cb.y+bvy*remaining,vx:bvx,vy:bvy,angularVelocity:angularB,heading:wrap(b.heading+(angularB-wb)*remaining)};
    const penetration=Math.max(0,normal.r-((pb.x-pa.x)*nx+(pb.y-pa.y)*ny))+.02;
    if(!closing&&penetration<.03)return null;
    pa.x-=nx*penetration*mb/(ma+mb);pa.y-=ny*penetration*mb/(ma+mb);pb.x+=nx*penetration*ma/(ma+mb);pb.y+=ny*penetration*ma/(ma+mb);
    const surfaceA=ellipseSupport({...a,heading:pa.heading},nx,ny),surfaceB=ellipseSupport({...b,heading:pb.heading},-nx,-ny);
    return {t,closing,massA:ma,massB:mb,inertiaA:ia,inertiaB:ib,contactPoint:point,centerA:ca,centerB:cb,normal:{x:nx,y:ny},a:pa,b:pb,
      pointA:{x:pa.x+surfaceA.x,y:pa.y+surfaceA.y},pointB:{x:pb.x+surfaceB.x,y:pb.y+surfaceB.y}};
  }
window.referenceShipPairContact=shipPairContact;
})();
