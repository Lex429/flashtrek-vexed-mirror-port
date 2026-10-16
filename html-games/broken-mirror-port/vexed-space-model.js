/* Direct translation of recovered sprite 1263's seeded field and update rules. */
(() => {
  'use strict';
  const config=window.VexedFlightReference.space;
  const wrap=(value,offset,period)=>((value+offset)%period+period)%period-offset;
  function create(system=1){
    let seed=config.seedBase+Number(system)*config.seedSystemMultiplier;
    if(!Number.isFinite(seed))seed=config.seedBase;
    const random=()=>{seed=seed*config.randomMultiplier%config.randomModulus;return seed/config.randomModulus;};
    const clouds=Array.from({length:7},(_,i)=>({
      x:random()*1100-250,y:random()*850-200,rate:i%2===0?.008:.026,phase:random()*6.28,
      tint:[5653624,2444905,2640725][i%3],alpha:100,
      lobes:Array.from({length:5},()=>({x:random()*190-95,y:random()*90-45}))
    }));
    const planes=Array.from({length:6},()=>({x:0,y:0})),stars=[];
    for(let layer=0;layer<6;layer++)for(let j=0;j<config.counts[layer];j++){
      const star={x:random()*820-110,y:random()*670-110,rate:config.rates[layer],layer,
        phase:random()*6.28,baseAlpha:35+random()*50,radius:config.sizes[layer]*(.8+random()*.45),
        color:config.colors[layer],alpha:100,trailLength:0,trailVisible:false,trailAngle:0,trailAlpha:0};
      if(layer===5){star.color=j%3===0?16767902:12048639;star.baseAlpha=92;}
      stars.push(star);
    }
    const state={system:Number(system),seed,tick:0,warp:0,elapsed:0,frames:0,clouds,planes,stars,
      vexTravelX:0,vexTravelY:0,nebula:[0,1,2].map(()=>({x:-100,y:-75})),velocity:0,flightSpeed:0};
    function update(dt,input={}){
      if(!(dt>0))return;
      dt=Math.max(.001,dt);state.elapsed+=dt;state.frames=input.frame??Math.floor(state.elapsed*config.sourceRenderFps);
      state.tick+=dt*13;
      let mx=input.speed!==0?Number(input.locx):0,my=input.speed!==0?Number(input.locy):0;
      if(!Number.isFinite(mx))mx=0;if(!Number.isFinite(my))my=0;
      state.velocity=Math.hypot(mx,my);state.flightSpeed=Math.max(0,Number(input.speed)||0);mx*=dt*13;my*=dt*13;
      const warp=Number(input.warp)>1&&Number(input.warp)<21;
      state.warp+=((warp?1:0)-state.warp)*Math.min(1,dt*2.34);
      for(const cloud of clouds){cloud.x=wrap(cloud.x+mx*cloud.rate,350,1300);cloud.y=wrap(cloud.y+my*cloud.rate,250,950);cloud.alpha=85+Math.sin(state.tick*.006+cloud.phase)*8;}
      if(state.system===34){
        state.vexTravelX=Math.max(-65,Math.min(65,state.vexTravelX+mx*.24));state.vexTravelY=Math.max(-45,Math.min(45,state.vexTravelY+my*.24));
        for(let v=0;v<3;v++){
          const amplitude=[12,20,28][v],cameraRate=[.18,.52,1][v],driftRate=[.002,.004,.006][v];
          state.nebula[v].x=-100+state.vexTravelX*cameraRate+Math.sin(state.tick*driftRate+v*.7)*amplitude;
          state.nebula[v].y=-75+state.vexTravelY*cameraRate+Math.sin(state.tick*driftRate*.73+v*1.3)*amplitude*.7;
        }
      }
      const heading=Math.atan2(my,mx),wrapping=[];
      for(let layer=0;layer<3;layer++){
        const plane=planes[layer];plane.x+=mx*config.rates[layer];plane.y+=my*config.rates[layer];
        wrapping[layer]=Math.abs(plane.x)>50||Math.abs(plane.y)>50;
      }
      const group=state.frames%6;
      stars.forEach((star,index)=>{
        if(star.layer>=3){star.x=wrap(star.x+mx*star.rate,110,820);star.y=wrap(star.y+my*star.rate,110,670);}
        else if(wrapping[star.layer]){const plane=planes[star.layer];star.x=wrap(star.x+plane.x,110,820);star.y=wrap(star.y+plane.y,110,670);}
        if(index%6===group)star.alpha=Math.round(star.baseAlpha+Math.sin(state.tick*.025+star.phase)*4);
        if(star.layer>=2&&star.layer<5){
          const speedCue=Math.min(1.6,state.flightSpeed/200);
          const length=Math.min(28,Math.max(0,state.velocity-2)*star.rate*1.8+speedCue*(star.layer-1)*4.5)+state.warp*(18+star.layer*8);
          star.trailLength=length;star.trailVisible=length>.6;
          if(star.trailVisible){star.trailAngle=heading;star.trailAlpha=Math.min(35,8+length)*2;}
        }
      });
      for(let layer=0;layer<3;layer++)if(wrapping[layer]){planes[layer].x=0;planes[layer].y=0;}
    }
    return {state,update};
  }
  window.vexedSpaceModel={create};
})();
