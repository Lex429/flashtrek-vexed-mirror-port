/* Swept visual collisions against the nearby ship's shield or opaque hull.
   This demonstration never changes hull or shield strength. */
(() => {
  'use strict';
  window.createDebrisImpacts=()=>{
    let shielded=true,events=[],flash=null,image=null,rgba=null;
    function prepare(im){
      if(image===im)return;
      image=im;const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
      const g=c.getContext('2d');g.drawImage(im,0,0);rgba=g.getImageData(0,0,c.width,c.height).data;
    }
    function contact(p,oldX,oldY,target,im){
      prepare(im);
      const distance=Math.hypot(p.x-oldX,p.y-oldY),steps=Math.max(1,Math.ceil(distance/3)),cos=Math.cos(target.a),sin=Math.sin(target.a);
      const radius=Math.min(10,Math.min(p.w||3,p.h||3)*.3);
      for(let n=0;n<=steps;n++){
        const x=oldX+(p.x-oldX)*n/steps,y=oldY+(p.y-oldY)*n/steps,dx=x-target.centerX,dy=y-target.centerY;
        const lx=dx*cos+dy*sin,ly=-dx*sin+dy*cos;
        if(Math.abs(lx)>target.w/2+radius||Math.abs(ly)>target.h/2+radius)continue;
        for(const [sx,sy] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]){
          const ix=Math.floor((lx+sx)/target.w*im.width+im.width/2),iy=Math.floor((ly+sy)/target.h*im.height+im.height/2);
          if(ix>=0&&ix<im.width&&iy>=0&&iy<im.height&&rgba[(iy*im.width+ix)*4+3]>100)return {x,y};
        }
      }
      return null;
    }
    function step(p,oldX,oldY,target,im,state){
      if(!p.farTravel||p.impactDone||state.time-p.born<100)return;
      const hit=contact(p,oldX,oldY,target,im);if(!hit)return;
      p.impactDone=true;
      const event={...hit,born:state.time,kind:shielded?'shield':'sparks'};
      events.push(event);if(events.length>24)events.shift();flash=event;
      if(!shielded)for(let i=0;i<12;i++){
        const a=i*Math.PI*2/12,speed=35+Math.random()*45;
        state.particles.push({...hit,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:.7,born:state.time,ttl:350+Math.random()*200,realistic:'spark'});
      }
      else {const a=Math.atan2(hit.y-target.centerY,hit.x-target.centerX),dot=p.vx*Math.cos(a)+p.vy*Math.sin(a);p.vx-=1.35*dot*Math.cos(a);p.vy-=1.35*dot*Math.sin(a);}
      return event;
    }
    function draw(ctx,target,time,color='#50d5ff'){
      if(!flash||flash.kind!=='shield'||time-flash.born>=620)return;
      ctx.save();ctx.translate(target.centerX,target.centerY);ctx.rotate(target.a);
      const dx=flash.x-target.centerX,dy=flash.y-target.centerY,c=Math.cos(target.a),s=Math.sin(target.a);
      window.drawShowcaseShieldFlash(ctx,image,target.w,target.h,{born:flash.born,color,x:dx*c+dy*s,y:-dx*s+dy*c,kind:'debris'},time);ctx.restore();
    }
    return Object.freeze({step,draw,currentFlash:()=>flash?.kind==='shield'?flash:null,setShields:value=>{shielded=value;if(!value)flash=null;},reset:()=>{events=[];flash=null;},
      snapshot:()=>({hull:100,shields:shielded?100:0,shielded,impacts:events.map(e=>({...e})),flash:flash?{...flash}:null})});
  };
})();
