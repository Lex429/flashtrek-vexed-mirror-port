/* Persistent points in depth. Forward camera travel alone controls recycling;
   a point crosses behind the camera, invisible, before entering at far depth. */
(() => {
  'use strict';
  const speed=.42,behind=-.12,near=.055;
  function hash(id,generation,salt){
    let n=(Math.imul(id+1,374761393)^Math.imul(generation+17,668265263)^salt)>>>0;
    n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
  }
  function smooth(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
  function create(count=720){
    return Object.freeze(Array.from({length:count},(_,id)=>{
      const far=id<count*.23?4:id<count*.57?10:24,z=.2+hash(id,0,31)*(far-.2);
      return Object.freeze({id,far,z,x:(hash(id,0,77)-.5)*1.4*z,y:(hash(id,0,113)-.5)*1.4*z,size:id%19===0?1.15:.45+hash(id,0,197)*.45,color:id%9===0?'#bed8fa':id%17===0?'#ecd4d5':'#dde3ec'});
    }));
  }
  function project(star,travel,w,h,px=0,py=0){
    const raw=star.z-travel,span=star.far-behind,generation=raw>behind?0:Math.floor((behind-raw)/span)+1,z=raw+generation*span;
    const worldX=generation?(hash(star.id,generation,77)-.5)*1.4*star.far:star.x;
    const worldY=generation?(hash(star.id,generation,113)-.5)*1.4*star.far:star.y;
    const depth=Math.max(near,z),x=w*.5+(worldX-px*.04)/depth*w,y=h*.5+(worldY-py*.035)/depth*h;
    const radius=Math.min(2.5,star.size*(.28+.9/(depth+.35)));
    const opacity=smooth(near,.3,z)*smooth(0,Math.min(.75,star.far*.15),star.far-z)*(.2+.65/Math.sqrt(1+depth));
    const oldDepth=depth+speed*.025;
    const oldX=w*.5+(worldX-px*.04)/oldDepth*w,oldY=h*.5+(worldY-py*.035)/oldDepth*h;
    return {id:star.id,generation,x,y,z,worldX,worldY,radius,opacity,trailX:oldX,trailY:oldY,visible:opacity>0&&x>-12&&x<w+12&&y>-12&&y<h+12};
  }
  const api=Object.freeze({create,project,speed,behind,near});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.nativeMenuStarfield=api;
})();
