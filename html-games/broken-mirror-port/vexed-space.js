/* Original Vexed Mirror star motion, with a black sky and optical lighting.
 * Widescreen has unique bright stars around the original 600x450 field.
 */
(() => {
  'use strict';
  function create(initialSystem=1){
  const color=value=>'#'+Number(value).toString(16).padStart(6,'0');
  let model=window.vexedSpaceModel.create(initialSystem),starSprites=new Map(),light,lastShadow=-Infinity,shadowPaths=[],shadowSignature='',lastView=null;
  let brightTravelX=0,brightTravelY=0,opticalX=0,opticalY=0;
  let skyOrigin=null,initialBright=model.state.stars.filter(star=>star.layer===5).map(star=>({x:star.x,y:star.y}));
  const rgba=(tint,alpha)=>{const value=Number(tint);return `rgba(${value>>16&255},${value>>8&255},${value&255},${alpha})`;};
  const random=seed=>{const value=Math.sin(seed*127.1)*43758.5453;return value-Math.floor(value);};
  const clamp=value=>Math.max(0,Math.min(1,value));
  const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
  function disc(ctx,x,y,r,tint,alpha){
    ctx.fillStyle=color(tint);ctx.globalAlpha=alpha/100;ctx.beginPath();ctx.moveTo(x+r,y);
    for(let n=1;n<=20;n++){const a=n*Math.PI/10;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}ctx.closePath();ctx.fill();
  }
  function ray(ctx,a,length,width,tint,alpha){
    const dx=Math.cos(a),dy=Math.sin(a);ctx.fillStyle=color(tint);ctx.globalAlpha=alpha/100;
    ctx.beginPath();ctx.moveTo(-dy*width,dx*width);ctx.lineTo(dx*length,dy*length);
    ctx.lineTo(dy*width,-dx*width);ctx.lineTo(-dx*length,-dy*length);ctx.closePath();ctx.fill();
  }
  function texture(w,h,x,y,draw){
    const canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=h*2;
    const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.translate(x,y);draw(ctx);return {canvas,w,h,x,y};
  }
  function starSprite(star){
    if(!starSprites.has(star)){
      const pad=star.layer===5?80:Math.ceil(star.radius+1);
      starSprites.set(star,texture(pad*2,pad*2,pad,pad,ctx=>{
        disc(ctx,0,0,star.radius,star.color,100);
        if(star.layer>=3)disc(ctx,0,0,star.radius*.45,16777215,100);
      }));
    }
    return starSprites.get(star);
  }
  function tiles(x,y,periodX,periodY,w,h,margin,draw){
    const minX=Math.ceil((-margin-x)/periodX),maxX=Math.floor((w+margin-x)/periodX);
    const minY=Math.ceil((-margin-y)/periodY),maxY=Math.floor((h+margin-y)/periodY);
    for(let ix=minX;ix<=maxX;ix++)for(let iy=minY;iy<=maxY;iy++)draw(x+ix*periodX,y+iy*periodY,ix,iy);
  }
  function brightStars(state,w,h,ox,oy,view){
    if(!skyOrigin)skyOrigin={x:Number(view.playerX)||0,y:Number(view.playerY)||0};
    const playerX=Number(view.playerX)||0,playerY=Number(view.playerY)||0;
    const result=state.stars.filter(star=>star.layer===5).map((star,index)=>{
      const anchor=initialBright[index],baseWorldX=skyOrigin.x+(anchor.x-300)/.05;
      const baseWorldY=skyOrigin.y+(anchor.y-225)/.05;
      return {x:star.x+ox,y:star.y+oy,color:star.color,phase:star.phase,alpha:star.alpha,radius:star.radius,
        worldX:baseWorldX+Math.round((playerX-baseWorldX)/(820/.05))*(820/.05),
        worldY:baseWorldY+Math.round((playerY-baseWorldY)/(670/.05))*(670/.05),
        depth:900+random(state.system*1097+index*73+6)*1400};
    });
    const baseX=ox-110+brightTravelX,baseY=oy-110+brightTravelY;
    const minX=Math.floor((-100-baseX)/820),maxX=Math.ceil((w+100-baseX)/820);
    const minY=Math.floor((-100-baseY)/670),maxY=Math.ceil((h+100-baseY)/670);
    for(let ix=minX;ix<=maxX;ix++)for(let iy=minY;iy<=maxY;iy++){
      if(ix===0&&iy===0)continue;
      for(let j=0;j<6;j++){
        const seed=state.system*1097+ix*17389+iy*48611+j*73;
        const x=baseX+ix*820+random(seed+1)*820,y=baseY+iy*670+random(seed+2)*670;
        if(x< -80||x>w+80||y< -80||y>h+80)continue;
        result.push({x,y,color:j%3===0?16767902:12048639,phase:random(seed+3)*Math.PI*2,
          alpha:84+random(seed+4)*14,radius:1.2+random(seed+5)*.48,
          worldX:skyOrigin.x+(-410+ix*820+random(seed+1)*820)/.05,
          worldY:skyOrigin.y+(-335+iy*670+random(seed+2)*670)/.05,
          depth:900+random(seed+6)*1400});
      }
    }
    return result;
  }
  function approach(star,view){
    const dx=star.worldX-(Number(view.playerX)||0),dy=star.worldY-(Number(view.playerY)||0);
    const planar=Math.hypot(dx,dy),distance=Math.hypot(planar,star.depth);
    const heading=Number(view.heading)||0,forward=dx*Math.cos(heading)+dy*Math.sin(heading);
    const facing=smooth(((forward+star.depth*.3)/(planar+star.depth*.3)-.25)/.55);
    return smooth((6000-distance)/3800)*facing;
  }
  function flare(ctx,star,w,h,elapsed,reducedMotion,warpPulse,engagement){
    const {x,y,color:tint,phase}=star,cx=w/2+opticalX,cy=h/2+opticalY;
    const edgeFade=clamp((x+24)/24)*clamp((w+24-x)/24)*clamp((y+24)/24)*clamp((h+24-y)/24);
    if(edgeFade<=0)return;
    const twinkle=reducedMotion?1:1+.12*Math.sin(elapsed*2.8+phase);
    const brightness=clamp(star.alpha/100*star.radius/1.45*twinkle)*edgeFade;
    const centrality=clamp(1-Math.hypot(w/2-x,h/2-y)/Math.hypot(w/2,h/2));
    const glare=brightness*(.22+.78*engagement)*(.35+.65*centrality)*(1+(warpPulse||0)*.45);
    const dx=cx-x,dy=cy-y,radius=30+brightness*65;
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=1;
    const halo=ctx.createRadialGradient(x,y,0,x,y,radius);
    halo.addColorStop(0,rgba(tint,.18*glare));halo.addColorStop(.12,rgba(tint,.09*glare));
    halo.addColorStop(.44,rgba(tint,.026*glare));halo.addColorStop(1,rgba(tint,0));
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    // Spikes appear only when the ship approaches the star it is facing.
    if(engagement>.03){
      ctx.save();ctx.translate(x,y);
      for(const [vx,vy,length,opacity] of [[1,0,38,.26],[0,1,27,.2]]){
        const reach=(4+length*brightness)*engagement;
        const beam=ctx.createLinearGradient(-vx*reach,-vy*reach,vx*reach,vy*reach);
        beam.addColorStop(0,rgba(tint,0));beam.addColorStop(.5,rgba(tint,opacity*brightness*engagement));beam.addColorStop(1,rgba(tint,0));
        ctx.strokeStyle=beam;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-vx*reach,-vy*reach);
        ctx.lineTo(vx*reach,vy*reach);ctx.stroke();
      }
      ctx.restore();
    }
    // Reflections cross the optical center and travel opposite the source star.
    for(const [position,r,opacity] of [[1.18,5,.12],[1.52,9,.075],[1.94,4,.09]]){
      const gx=x+dx*position,gy=y+dy*position;
      const ghost=ctx.createRadialGradient(gx,gy,0,gx,gy,r);
      ghost.addColorStop(0,rgba(tint,opacity*glare*engagement));ghost.addColorStop(1,rgba(tint,0));
      ctx.fillStyle=ghost;ctx.beginPath();ctx.arc(gx,gy,r,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function enterSystem(id,force=false){
    if(!force&&model.state.system===Number(id))return;
    model=window.vexedSpaceModel.create(id);starSprites.clear();light=null;lastShadow=-Infinity;shadowPaths=[];shadowSignature='';lastView=null;
    brightTravelX=0;brightTravelY=0;opticalX=0;opticalY=0;
    skyOrigin=null;initialBright=model.state.stars.filter(star=>star.layer===5).map(star=>({x:star.x,y:star.y}));
  }
  function render(ctx,view,objects=[]){
    const {w,h}=view,ox=(w-600)/2,oy=(h-450)/2,state=model.state;
    if(lastView&&(lastView.w!==w||lastView.h!==h)){const dx=(w-lastView.w)/2,dy=(h-lastView.h)/2;for(const path of shadowPaths)for(const point of path.points){point[0]+=dx;point[1]+=dy;}}
    lastView={w,h};
    ctx.save();ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    for(const star of state.stars){
      if(star.layer===5)continue;
      const plane=state.planes[star.layer],sprite=starSprite(star);
      ctx.globalAlpha=Math.min(1,star.alpha/100);
      tiles(star.x+plane.x+ox,star.y+plane.y+oy,820,670,w,h,star.layer===5?80:20,(x,y)=>{
        ctx.drawImage(sprite.canvas,x-sprite.x,y-sprite.y,sprite.w,sprite.h);
        if(star.trailVisible){
          ctx.save();ctx.translate(x,y);ctx.rotate(star.trailAngle);
          // Source trail is a diamond, scaled only along the direction of travel.
          const inherited=ctx.globalAlpha;ctx.scale(star.trailLength,1);
          ray(ctx,0,1,star.radius*.4,13033471,35*star.trailAlpha/100*inherited);ctx.restore();
        }
        if(star.layer>=3&&star.layer<=4&&state.flightSpeed>5){
          const motion=Math.min(1,state.flightSpeed/260),length=star.layer===4?4+30*motion:3+17*motion;
          ctx.save();ctx.translate(x,y);ctx.rotate(star.trailAngle);
          ctx.globalCompositeOperation='screen';ctx.globalAlpha=1;
          const streak=ctx.createLinearGradient(-length,0,0,0);
          streak.addColorStop(0,rgba(star.color,0));streak.addColorStop(1,rgba(star.color,.18+.27*motion));
          ctx.strokeStyle=streak;ctx.lineWidth=Math.max(.65,star.radius*.8);
          ctx.beginPath();ctx.moveTo(-length,0);ctx.lineTo(0,0);ctx.stroke();ctx.restore();
        }
      });
    }
    const bright=brightStars(state,w,h,ox,oy,view);
    for(const star of bright){
      if(star.x< -80||star.x>w+80||star.y< -80||star.y>h+80)continue;
      ctx.globalAlpha=star.alpha/100;ctx.fillStyle=color(star.color);
      ctx.beginPath();ctx.arc(star.x,star.y,star.radius*1.35,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=Math.min(1,star.alpha/100);ctx.fillStyle='#fff';
      ctx.beginPath();ctx.arc(star.x,star.y,star.radius*.58,0,Math.PI*2);ctx.fill();
    }
    // Ship/planet lighting may be disabled for performance. Background optics
    // still belong to the parallax sky and must keep their normal occlusion.
    if(window.nativeFlightLightingEnabled===false){
      light=null;shadowPaths=[];shadowSignature='';
    }else{
      let nearest=null,best=Infinity;
      for(const star of bright){
        if(star.x< -80||star.x>w+80||star.y< -80||star.y>h+80||objects.some(obj=>obj.contains(star.x,star.y)))continue;
        const dx=w/2-star.x,dy=h/2-star.y,d=dx*dx+dy*dy;
        if(d<best){best=d;nearest={x:star.x,y:star.y,color:star.color};}
      }
      light=nearest;
      if(state.elapsed-lastShadow>.4){lastShadow=state.elapsed;updateShadows(objects);}
      for(const path of shadowPaths){ctx.globalAlpha=path.alpha/100;ctx.fillStyle=color(777);ctx.beginPath();path.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
    }
    for(const star of bright){
      const {x,y}=star;
      if(x< -80||x>w+80||y< -80||y>h+80||objects.some(obj=>obj.contains(x,y)))continue;
      flare(ctx,star,w,h,state.elapsed,view.reducedMotion,view.warpPulse,approach(star,view));
    }
    ctx.restore();
  }
  function updateShadows(objects){
    if(!light||!objects.length){shadowPaths=[];shadowSignature='';return;}
    const signature=[Math.round(light.x/3),Math.round(light.y/3),...objects.flatMap(o=>[o.x,o.y,o.width,o.height].map(v=>Math.round(v/3)))].join(':');
    if(signature===shadowSignature)return;shadowSignature=signature;shadowPaths=[];
    for(const obj of objects.slice(0,13)){
      const dx=obj.x-light.x,dy=obj.y-light.y,distance=Math.hypot(dx,dy);if(distance<1)continue;
      const ux=dx/distance,uy=dy/distance,rx=obj.width*.48,ry=obj.height*.48;
      const ax=obj.x-uy*rx,ay=obj.y+ux*ry,bx=obj.x+uy*rx,by=obj.y-ux*ry;
      let avx=ax-light.x,avy=ay-light.y,bvx=bx-light.x,bvy=by-light.y;
      const ad=Math.hypot(avx,avy),bd=Math.hypot(bvx,bvy);avx/=ad;avy/=ad;bvx/=bd;bvy/=bd;
      for(let band=0;band<5;band++){
        const start=[2,16,65,140,240][band],end=[16,65,140,240,370][band];
        shadowPaths.push({alpha:[4,13,11,7,3][band],points:[[ax+avx*start,ay+avy*start],[bx+bvx*start,by+bvy*start],[bx+bvx*end,by+bvy*end],[ax+avx*end,ay+avy*end]]});
      }
    }
  }
  function planetHalo(ctx,planet,system){
    if(window.nativeFlightLightingEnabled===false)return;
    const radius=Math.min(planet.width,planet.height)/2;
    const tint=system===1?0x67bcff:0x9aacc5;
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=1;
    const aura=ctx.createRadialGradient(planet.x,planet.y,radius*.83,planet.x,planet.y,radius*1.32);
    aura.addColorStop(0,rgba(tint,0));aura.addColorStop(.37,rgba(tint,.11));
    aura.addColorStop(.7,rgba(tint,.035));aura.addColorStop(1,rgba(tint,0));
    ctx.fillStyle=aura;ctx.beginPath();ctx.arc(planet.x,planet.y,radius*1.32,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function planetLight(ctx,planet,view={}){
    if(window.nativeFlightLightingEnabled===false||!light)return;
    const zoom=view.zoom||1,cx=view.cx||0,cy=view.cy||0;
    const sourceX=cx+(light.x-cx)/zoom,sourceY=cy+(light.y-cy)/zoom;
    const planetLamp={color:light.color,angle:Math.atan2(sourceY-planet.y,sourceX-planet.x)};
    const radius=Math.min(planet.width,planet.height)*.485;
    ctx.save();ctx.translate(planet.x,planet.y);ctx.rotate(planetLamp.angle);
    ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.clip();
    const daylight=ctx.createLinearGradient(-radius,0,radius,0);
    daylight.addColorStop(0,'rgba(0,0,0,0)');daylight.addColorStop(.35,'rgba(0,0,0,0)');
    daylight.addColorStop(1,rgba(planetLamp.color,.13));
    ctx.globalAlpha=1;ctx.fillStyle=daylight;ctx.fillRect(-radius,-radius,radius*2,radius*2);
    ctx.restore();
  }
  return {create,enterSystem,update(dt,input){
      model.update(dt,input);
      if(!(dt>0))return;
      const dx=Number(input?.locx)||0,dy=Number(input?.locy)||0;
      brightTravelX+=dx*dt*13*.05;brightTravelY+=dy*dt*13*.05;
      const blend=Math.min(1,dt*4);
      opticalX+=(Math.max(-30,Math.min(30,dx*13*.12))-opticalX)*blend;
      opticalY+=(Math.max(-30,Math.min(30,dy*13*.12))-opticalY)*blend;
    },render,
    planetHalo,planetLight,
    get state(){return model.state;},get light(){return light;}};
  }
  window.vexedSpace=create();
})();
