/* Original Vexed Mirror star motion, with a black sky and optical lighting.
 * Widescreen has unique bright stars around the original 600x450 field.
 */
(() => {
  'use strict';
  const color=value=>'#'+Number(value).toString(16).padStart(6,'0');
  let model=window.vexedSpaceModel.create(1),starSprites=new Map(),light,shadowPaths=[],shadowSignature='';
  let brightTravelX=0,brightTravelY=0,opticalX=0,opticalY=0;
  let skyOrigin=null,initialBright=model.state.stars.filter(star=>star.layer===5).map(star=>({x:star.x,y:star.y}));
  const rgba=(tint,alpha)=>{const value=Number(tint);return `rgba(${value>>16&255},${value>>8&255},${value&255},${alpha})`;};
  const random=seed=>{const value=Math.sin(seed*127.1)*43758.5453;return value-Math.floor(value);};
  const clamp=value=>Math.max(0,Math.min(1,value));
  const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
  // Physical illumination is independent of the decorative, parallax starfield.
  // Uncharted primary stars inherit this explicit offscreen direction (world radians).
  const systemStars=Object.freeze({
    default:Object.freeze({direction:-2.4,color:0xffdb9e}),
    1:Object.freeze({bodyId:0,x:-6220,y:-925,color:0xffdb9e})
  });
  // Opaque limb ellipses measured in the unchanged artwork's normalized image space.
  // Rings and transparent image padding are not the planet's opaque disk.
  const bodyProfiles=[
    {rx:.289,ry:.289,emission:0xffbb55},
    {rx:.453,ry:.454},
    {rx:.414,ry:.423,oy:.013,atmosphere:0xe2c795,thickness:.035},
    {rx:.483,ry:.475,ox:-.002,oy:-.011,atmosphere:0x67bcff,thickness:.045},
    {rx:.358,ry:.357,oy:.003},
    {rx:.439,ry:.441,atmosphere:0xdca17b,thickness:.018},
    {rx:0,ry:0},
    {rx:.483,ry:.476,atmosphere:0xe0c49c,thickness:.025},
    {rx:.21,ry:.21,oy:.003},
    {rx:.398,ry:.398,oy:.003,atmosphere:0x99d4db,thickness:.03},
    {rx:.416,ry:.42,atmosphere:0x648bda,thickness:.03},
    {rx:.452,ry:.453}
  ].map(profile=>Object.freeze(profile));
  const plainBody=Object.freeze({rx:.48,ry:.48});
  function bodyProfile(system,id){return Number(system)===1?bodyProfiles[Number(id)]||plainBody:plainBody;}
  function bodyDisk(planet,system,id,artReady=true){
    const profile=bodyProfile(system,id),fallback=Number(system)===1?.35:28/180;
    return {x:planet.x+(artReady?profile.ox||0:0)*planet.width,y:planet.y+(artReady?profile.oy||0:0)*planet.height,
      rx:planet.width*(artReady?profile.rx:fallback),ry:planet.height*(artReady?profile.ry:fallback),profile,artReady};
  }
  function systemLight(view){
    const definition=systemStars[model.state.system]||systemStars.default;
    if(definition.direction!==undefined)return definition;
    const body=window.vexedSolFlight?.bodies.find(body=>body.id===definition.bodyId);
    const world=body?window.vexedSolFlight.bodyPosition(body):definition;
    const zoom=view.zoom??1,cx=view.w/2,cy=view.h/2;
    return {x:cx+(world.x-(view.cameraX??view.playerX??0))*zoom,y:cy+(world.y-(view.cameraY??view.playerY??0))*zoom,
      worldX:world.x,worldY:world.y,color:definition.color};
  }
  // Integrate the finite source disk against the union of nearby opaque limbs.
  // Midpoint slices are bounded work only at an eclipse edge; no temporal lag or
  // star-center switch, including overlapping planets and a stationary camera.
  function sourceVisibility(star,objects){
    const radius=star.sourceRadius??star.radius*4;
    const nearby=objects.filter(o=>o.rx>0&&o.ry>0&&Math.abs(star.x-o.x)<o.rx+radius&&Math.abs(star.y-o.y)<o.ry+radius);
    if(!nearby.length)return 1;
    if(nearby.some(o=>Math.hypot((star.x-o.x)/o.rx,(star.y-o.y)/o.ry)+radius/Math.min(o.rx,o.ry)<=1))return 0;
    let total=0,covered=0;
    for(let i=0;i<128;i++){
      const dx=radius*((i+.5)/64-1),half=Math.sqrt(radius*radius-dx*dx),intervals=[];
      total+=2*half;
      for(const o of nearby){
        const nx=(star.x+dx-o.x)/o.rx;if(Math.abs(nx)>=1)continue;
        const height=o.ry*Math.sqrt(1-nx*nx),low=Math.max(-half,o.y-height-star.y),high=Math.min(half,o.y+height-star.y);
        if(high>low)intervals.push([low,high]);
      }
      intervals.sort((a,b)=>a[0]-b[0]);let end=-half;
      for(const [low,high] of intervals){covered+=Math.max(0,high-Math.max(end,low));end=Math.max(end,high);}
    }
    return clamp(1-covered/total);
  }
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
    return smooth((6000-distance)/3800);
  }
  function flare(ctx,star,w,h,elapsed,reducedMotion,warpPulse,engagement,visibility){
    const {x,y,color:tint,phase}=star,cx=w/2+opticalX,cy=h/2+opticalY;
    const edgeFade=clamp((x+24)/24)*clamp((w+24-x)/24)*clamp((y+24)/24)*clamp((h+24-y)/24);
    if(edgeFade<=0)return;
    const twinkle=reducedMotion?1:1+.12*Math.sin(elapsed*2.8+phase);
    const brightness=clamp(star.alpha/100*star.radius/1.45*twinkle)*edgeFade;
    const centrality=clamp(1-Math.hypot(w/2-x,h/2-y)/Math.hypot(w/2,h/2));
    const glare=brightness*(.22+.78*engagement)*(.35+.65*centrality)*(1+(warpPulse||0)*.45)*visibility;
    const dx=cx-x,dy=cy-y,radius=30+brightness*65;
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=1;
    const halo=ctx.createRadialGradient(x,y,0,x,y,radius);
    halo.addColorStop(0,rgba(tint,.18*glare));halo.addColorStop(.12,rgba(tint,.09*glare));
    halo.addColorStop(.44,rgba(tint,.026*glare));halo.addColorStop(1,rgba(tint,0));
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    // The camera does not rotate with ship heading. Approach, not heading, sets engagement.
    if(engagement>.03){
      ctx.save();ctx.translate(x,y);
      for(const [vx,vy,length,opacity] of [[1,0,38,.26],[0,1,27,.2]]){
        const reach=(4+length*brightness)*engagement;
        const beam=ctx.createLinearGradient(-vx*reach,-vy*reach,vx*reach,vy*reach);
        beam.addColorStop(0,rgba(tint,0));beam.addColorStop(.5,rgba(tint,opacity*brightness*engagement*visibility));beam.addColorStop(1,rgba(tint,0));
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
    model=window.vexedSpaceModel.create(id);starSprites.clear();light=null;shadowPaths=[];shadowSignature='';
    brightTravelX=0;brightTravelY=0;opticalX=0;opticalY=0;
    skyOrigin=null;initialBright=model.state.stars.filter(star=>star.layer===5).map(star=>({x:star.x,y:star.y}));
  }
  function render(ctx,view,objects=[]){
    const {w,h}=view,ox=(w-600)/2,oy=(h-450)/2,state=model.state;
    light=systemLight(view);
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
    // Opaque disks hide the sky even where the supplied texture has transparency.
    // Clip only the bright sources/optics, keeping ordinary star painting cheap.
    // Separate inverse clips preserve the union when two bodies overlap.
    ctx.globalAlpha=1;ctx.fillStyle='#000';
    for(const o of objects){
      if(!(o.rx>0&&o.ry>0)||o.x+o.rx<0||o.y+o.ry<0||o.x-o.rx>w||o.y-o.ry>h)continue;
      ctx.beginPath();ctx.ellipse(o.x,o.y,o.rx,o.ry,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.rect(0,0,w,h);ctx.moveTo(o.x+o.rx,o.y);ctx.ellipse(o.x,o.y,o.rx,o.ry,0,0,Math.PI*2);ctx.clip('evenodd');
    }
    const bright=brightStars(state,w,h,ox,oy,view);
    for(const star of bright){
      if(star.x< -80||star.x>w+80||star.y< -80||star.y>h+80)continue;
      ctx.globalAlpha=star.alpha/100;ctx.fillStyle=color(star.color);
      ctx.beginPath();ctx.arc(star.x,star.y,star.radius*1.35,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=Math.min(1,star.alpha/100);ctx.fillStyle='#fff';
      ctx.beginPath();ctx.arc(star.x,star.y,star.radius*.58,0,Math.PI*2);ctx.fill();
    }
    updateShadows(objects);
    for(const path of shadowPaths){ctx.globalAlpha=path.alpha/100;ctx.fillStyle=color(777);ctx.beginPath();path.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
    for(const star of bright){
      const {x,y}=star;
      if(x< -80||x>w+80||y< -80||y>h+80)continue;
      const visibility=sourceVisibility(star,objects);
      if(visibility>0)flare(ctx,star,w,h,state.elapsed,view.reducedMotion,view.warpPulse,approach(star,view),visibility);
    }
    ctx.restore();
  }
  function updateShadows(objects){
    if(!light||!objects.length){shadowPaths=[];shadowSignature='';return;}
    const signature=[light.direction??light.x,light.y,...objects.flatMap(o=>[o.x,o.y,o.rx,o.ry])].join(':');
    if(signature===shadowSignature)return;shadowSignature=signature;shadowPaths=[];
    for(const obj of objects.slice(0,13)){
      const directional=light.direction!==undefined,dx=directional?-Math.cos(light.direction):obj.x-light.x,dy=directional?-Math.sin(light.direction):obj.y-light.y,distance=Math.hypot(dx,dy);if(distance<1e-9||obj.profile?.emission)continue;
      const ux=dx/distance,uy=dy/distance,rx=obj.rx,ry=obj.ry;
      const ax=obj.x-uy*rx,ay=obj.y+ux*ry,bx=obj.x+uy*rx,by=obj.y-ux*ry;
      let avx=directional?ux:ax-light.x,avy=directional?uy:ay-light.y,bvx=directional?ux:bx-light.x,bvy=directional?uy:by-light.y;
      const ad=Math.hypot(avx,avy),bd=Math.hypot(bvx,bvy);avx/=ad;avy/=ad;bvx/=bd;bvy/=bd;
      for(let band=0;band<5;band++){
        const start=[2,16,65,140,240][band],end=[16,65,140,240,370][band];
        shadowPaths.push({alpha:[4,13,11,7,3][band],points:[[ax+avx*start,ay+avy*start],[bx+bvx*start,by+bvy*start],[bx+bvx*end,by+bvy*end],[ax+avx*end,ay+avy*end]]});
      }
    }
  }
  function planetGlow(ctx,disk){
    const {profile,rx,ry}=disk;if(!disk.artReady||!(rx>0&&ry>0)||(!profile.atmosphere&&!profile.emission))return;
    const emission=Boolean(profile.emission),tint=profile.emission||profile.atmosphere,outer=emission?1.5:1+profile.thickness;
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=1;
    ctx.translate(disk.x,disk.y);ctx.scale(rx,ry);
    const aura=ctx.createRadialGradient(0,0,.995,0,0,outer);
    aura.addColorStop(0,rgba(tint,emission ? .24 : .13));aura.addColorStop(.3,rgba(tint,emission ? .1 : .055));aura.addColorStop(1,rgba(tint,0));
    ctx.fillStyle=aura;ctx.beginPath();ctx.arc(0,0,outer,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function planetLight(ctx,disk){
    if(!light||disk.profile?.emission||!(disk.rx>0&&disk.ry>0))return;
    const angle=light.direction??Math.atan2(light.y-disk.y,light.x-disk.x);
    ctx.save();ctx.translate(disk.x,disk.y);ctx.scale(disk.rx,disk.ry);
    ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.clip();
    const vx=Math.cos(angle)*disk.rx,vy=Math.sin(angle)*disk.ry,length=Math.hypot(vx,vy),dx=vx/length,dy=vy/length;
    const daylight=ctx.createLinearGradient(-dx,-dy,dx,dy);
    daylight.addColorStop(0,'rgba(0,0,0,0)');daylight.addColorStop(.35,'rgba(0,0,0,0)');
    daylight.addColorStop(1,rgba(light.color,.13));
    ctx.globalAlpha=1;ctx.fillStyle=daylight;ctx.fillRect(-1,-1,2,2);
    ctx.restore();
  }
  window.vexedSpace={enterSystem,update(dt,input){
      model.update(dt,input);
      if(!(dt>0))return;
      const dx=Number(input?.locx)||0,dy=Number(input?.locy)||0;
      brightTravelX+=dx*dt*13*.05;brightTravelY+=dy*dt*13*.05;
      const blend=Math.min(1,dt*4);
      opticalX+=(Math.max(-30,Math.min(30,dx*13*.12))-opticalX)*blend;
      opticalY+=(Math.max(-30,Math.min(30,dy*13*.12))-opticalY)*blend;
    },render,
    planetGlow,planetLight,bodyDisk,bodyProfile,systemStars,sourceVisibility,
    get state(){return model.state;},get light(){return light;}};
})();
