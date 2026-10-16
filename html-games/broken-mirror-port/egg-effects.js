/* Separate living hatch sequence and fatal biological damage. */
(() => {
  'use strict';
  const originalEggs=[{id:67,width:219,height:366,babyName:'Larva A',babyWidth:147,babyHeight:256},{id:68,width:116,height:159,babyName:'Larva B',babyWidth:99,babyHeight:146}];
  for(const config of [...originalEggs,...(window.creatureMutationProfiles||[]).filter(p=>p.type==='egg')]){
    const {id,width:w,height:h}=config,cx=256,cy=352;
    const p=(x,y)=>[cx+(x-.5)*w,cy+(y-.5)*h];
    const wound=(x,y,r)=>[...p(x,y),r*w];
    const wounds=[[],[wound(.34,.29,.05),wound(.73,.65,.04)],
      [wound(.39,.3,.09),wound(.64,.61,.08),wound(.77,.82,.05)],
      [wound(.4,.27,.1),wound(.67,.59,.12),wound(.4,.77,.1)]];
    const sites=[[.5,.08],[.27,.28],[.7,.28],[.22,.51],[.52,.46],[.79,.53],[.33,.72],[.68,.76],[.5,.93]].map(([x,y])=>p(x,y));
    const base=window.createBiologicalShipEffects({width:512,height:704,wounds,organs:[],sites,
      deadFinal:true,fixedSilhouette:true,ruptureMs:1150});
    let coreMasks=[],baby=null,intact=null;
    const clamp=v=>Math.max(0,Math.min(1,v));
    const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
    function prepareHatch(im){baby=im;}
    function hatchSnapshot(state){
      if(!state.eggHatch)return null;
      const age=state.time-state.eggHatch.born;
      return {baby:config.babyName,age,complete:age>=6500,
        phase:age<1400?'pushing':age<2800?'splitting':age<5600?'emerging':'free',
        shellOpacity:1-smooth((age-6500)/2400),internalGlow:1-smooth((age-2800)/2300)};
    }
    function drawHatch(ctx,state,l){
      const age=state.time-state.eggHatch.born,t=age/1000,unit=l.h/704;
      const opening=smooth((age-1400)/2600),escape=smooth((age-2800)/2800),free=smooth((age-5300)/1200);
      const ew=w*unit,eh=h*unit,bw=config.babyWidth*unit,bh=config.babyHeight*unit;
      const bx=escape*ew*.82,by=eh*.13-escape*eh*.62;
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(state.angle);
      // The baby is behind the membrane: its head first clears the upper split.
      if(opening>0&&baby){
        ctx.save();ctx.beginPath();ctx.rect(-ew*2,-eh*2,ew*4,eh*2+opening*eh*.55);ctx.clip();
        ctx.translate(bx,by);ctx.rotate(escape*.3+Math.sin(t*5)*.035);
        for(let y=0;y<704;y+=4){const sh=Math.min(4,704-y),wave=Math.sin(t*7-y*.025)*Math.sin(y/704*Math.PI)*unit*(2+free*2);
          ctx.drawImage(baby,0,y,512,sh,-l.w/2+wave,(y/704-.5)*l.h,l.w,sh/704*l.h);
        }ctx.restore();
      }
      // Two clipped halves retain the intact egg's original registration and scale.
      for(const side of [-1,1]){
        ctx.save();ctx.globalAlpha=1-smooth((age-6500)/2400);ctx.translate(side*opening*ew*.2,opening*eh*.14);ctx.rotate(side*opening*.3);
        ctx.beginPath();ctx.moveTo(side*ew*2,-eh*2);ctx.lineTo(0,-eh*2);
        for(let y=-eh;y<=eh;y+=eh/18)ctx.lineTo(Math.sin(y/eh*17)*ew*.025,y);
        ctx.lineTo(0,eh*2);ctx.lineTo(side*ew*2,eh*2);ctx.closePath();ctx.clip();
        const bulge=1+Math.sin(t*8)*.008*(1-opening);ctx.scale(bulge,1);
        ctx.drawImage(intact,-l.w/2,-l.h/2,l.w,l.h);
        ctx.globalAlpha=(1-smooth((age-6500)/2400))*(opening+(1-opening)*(.28+.2*Math.sin(t*8)));ctx.drawImage(coreMasks[0],-l.w/2,-l.h/2,l.w,l.h);
        ctx.restore();
      }
      if(opening>0&&free<1){
        ctx.strokeStyle='#8b4b50';ctx.lineWidth=Math.max(.5,unit*1.4);ctx.globalAlpha=(1-free)*.7;
        for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo((i-1)*ew*.12,eh*.16);
          ctx.quadraticCurveTo(bx*.6+Math.sin(t*4+i)*ew*.05,by*.2+eh*.2,bx+(i-1)*bw*.15,by+bh*.3);ctx.stroke();}
      }
      ctx.restore();
    }
    function prepare(frames){
      intact=frames[0];
      base.prepare(frames);
      coreMasks=frames.map((im,s)=>{
        const c=document.createElement('canvas');c.width=512;c.height=704;
        const g=c.getContext('2d');g.drawImage(im,0,0);const data=g.getImageData(0,0,512,704);
        for(let y=0;y<704;y++)for(let x=0;x<512;x++){
          const i=(y*512+x)*4,[r,g,b,a]=data.data.subarray(i,i+4);
          const interior=Math.abs(x-cx)<w*.32&&Math.abs(y-cy)<h*.24;
          const colored=config.mutation==='purple'?r>70&&b>70&&r>g*1.08&&b>g*1.08:config.mutation==='white'?r>140&&g>110:config.mutation==='venom'||config.mutation?.startsWith('borg')?g>65&&g>r*1.05&&g>b*1.12:r>g*1.14&&g>65&&b<g*.8;
          data.data.set([38,12,19,s<3&&interior&&colored?a:0],i);
        }
        g.putImageData(data,0,0);return c;
      });
    }
    const effects={...base.effects,
      unlitFrame(im){if(im.deadUnlit)return im;const c=document.createElement('canvas');c.width=512;c.height=704;const g=c.getContext('2d');if(config.mutation)g.filter='saturate(0.12) brightness(0.72)';g.drawImage(im,0,0);c.deadUnlit=true;return c;},
      draw(ctx,l,angle,s,time,o){
        base.effects.draw(ctx,l,angle,s,time,{...o,lights:false,damage:o.damage&&s<3});
        if(s===3)return;
        const pulse=.5+.5*Math.sin(time*.0021),failure=s===2?.5+.5*Math.sin(time*.0073):1;
        ctx.save();ctx.translate(l.x,l.y);ctx.rotate(angle);
        const b=base.effects.snapshot(s,time,o).breathing;ctx.scale(b.x,b.y);
        ctx.globalAlpha=o.lights?Math.min(.94,.2+s*.19+(1-pulse*failure)*.43):.96;
        ctx.drawImage(coreMasks[s],-l.w/2,-l.h/2,l.w,l.h);ctx.restore();
      },
      snapshot(s,t,o){return {...base.effects.snapshot(s,t,o),egg:true,lights:o.lights&&s<3?1:0,
        organs:o.lights&&s<3?1:0,internalGlow:o.lights&&s<3?[1,.6,.18][s]*(.5+.5*Math.sin(t*.0021)):0};}
    };
    const release=()=>{base.prepare([]);coreMasks=[];baby=null;intact=null;};
    const biology={...base,prepare,effects,prepareHatch,drawHatch,hatchSnapshot,release};
    window.starterShips.set(id,{width:512,height:704,biological:true,biology,effects,
      align:im=>im,breakAnchors:wounds[3].map(([x,y])=>[x,y])});
  }
})();
