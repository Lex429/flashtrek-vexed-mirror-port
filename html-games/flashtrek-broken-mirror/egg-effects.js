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
    let coreMasks=[],baby=null,intact=null,rupture=null,husk=null;
    const clamp=v=>Math.max(0,Math.min(1,v));
    const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
    const original=id===67;
    function drawBody(ctx,im,l,angle,s,time){
      if(!original||s===3){base.drawBody(ctx,im,l,angle,s,time);return;}
      const u=l.h/704,t=time*.001,breath=Math.sin(t*2.5),spasm=s===2?Math.sin(t*11)*1.3:0;
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(angle);
      // Warp the existing pixels gently, with the strongest motion at the soft waist.
      for(let y=0;y<704;y+=3){const sh=Math.min(3,704-y),fy=(y-352)/h;
        const envelope=Math.max(0,1-fy*fy*1.7),shift=(breath*1.8+spasm)*envelope*u;
        const swell=1+(.006*breath+(s===2?.005*Math.sin(t*8):0))*envelope;
        ctx.drawImage(im,0,y,512,sh,-l.w*swell/2+shift,(y/704-.5)*l.h,l.w*swell,sh/704*l.h);
      }
      ctx.restore();
    }
    function drawLivingTissue(ctx,l,angle,s,time,lights,impact){
      const u=l.h/704,t=time*.001,beat=Math.sin(t*(s===2?7.2:3.4));
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(angle);
      // The pressure and moving embryo remain inside the egg silhouette.
      if(s===0){
        ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=lights?.07+.035*beat:.025;
        const g=ctx.createRadialGradient(-13*u,-38*u,3*u,0,-32*u,66*u);
        g.addColorStop(0,'#f9a057');g.addColorStop(.45,'#a53930');g.addColorStop(1,'#2e1114');
        ctx.fillStyle=g;ctx.beginPath();ctx.ellipse((Math.sin(t*1.7)*5-4)*u,-32*u,52*u,91*u,-.12,0,Math.PI*2);ctx.fill();ctx.restore();
      }
      if(s>0){
        const active=wounds[s];
        for(let i=0;i<active.length;i++){
          const [px,py,r]=active[i],x=(px-256)*u,y=(py-352)*u,rx=r*u*(i===0?1.25:1),ry=rx*(s===2?1.4:.9);
          ctx.save();ctx.translate(x,y);ctx.rotate((i%2?-.35:.35)+beat*.025);
          ctx.globalAlpha=.24+.12*Math.max(0,beat);ctx.fillStyle='#6e1521';ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();
          const wet=ctx.createRadialGradient(-rx*.2,-ry*.2,0,0,0,rx*1.2);
          wet.addColorStop(0,'rgba(244,110,94,.48)');wet.addColorStop(.45,'rgba(158,32,39,.2)');wet.addColorStop(1,'rgba(43,4,13,0)');
          ctx.fillStyle=wet;ctx.beginPath();ctx.ellipse(0,0,rx*1.15,ry*1.1,0,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle='rgba(255,165,134,.4)';ctx.lineWidth=Math.max(.6,u*.85);ctx.beginPath();ctx.ellipse(-rx*.14,-ry*.23,rx*.7,ry*.57,-.2,Math.PI*1.08,Math.PI*1.87);ctx.stroke();
          if(s===2){
            for(let j=0;j<3;j++){const sx=(j-1)*rx*.6,drip=(18+j*8+4*Math.sin(t*3+j))*u;
              ctx.strokeStyle=j===1?'rgba(224,81,75,.72)':'rgba(129,34,43,.66)';ctx.lineWidth=(1.8-j*.35)*u;
              ctx.beginPath();ctx.moveTo(sx,-ry*.2);ctx.bezierCurveTo(sx+5*u,ry*.3,sx-4*u,drip*.72,sx+Math.sin(t*2+j)*3*u,drip);ctx.stroke();
              ctx.fillStyle='rgba(210,61,63,.7)';ctx.beginPath();ctx.ellipse(sx+Math.sin(t*2+j)*3*u,drip,1.5*u,2.6*u,0,0,Math.PI*2);ctx.fill();
            }
          }
          ctx.restore();
        }
      }
      if(impact){const hurt=Math.max(0,1-(time-impact.born)/650);
        if(hurt){const x=impact.point.x*l.w,y=impact.point.y*l.h;
          ctx.globalAlpha=hurt*.7;ctx.strokeStyle='#ef8a80';ctx.lineWidth=1.5*u;
          for(let i=0;i<6;i++){const a=t*13+i*Math.PI/3;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+Math.cos(a+.4)*11*u,y+Math.sin(a+.4)*11*u,x+Math.cos(a)*22*u*hurt,y+Math.sin(a)*22*u*hurt);ctx.stroke();}
        }
      }
      ctx.restore();
    }
    function prepareHatch(im,ruptureImage=null,huskImage=null){baby=im;rupture=ruptureImage;husk=huskImage;}
    function hatchSnapshot(state){
      if(!state.eggHatch)return null;
      const age=state.time-state.eggHatch.born;
      return {baby:config.babyName,age,complete:age>=6500,
        phase:age<1400?'pushing':age<2800?'splitting':age<5600?'emerging':'free',
        shellOpacity:1-smooth((age-6500)/2400),internalGlow:1-smooth((age-2800)/2300)};
    }
    function drawOriginalHatch(ctx,state,l){
      const age=Math.max(0,state.time-state.eggHatch.born),t=age*.001,u=l.h/704,ew=w*u,eh=h*u,bw=config.babyWidth*u,bh=config.babyHeight*u;
      const crack=smooth((age-800)/1550),ruptureIn=smooth((age-1700)/1450),emptyIn=smooth((age-4300)/1750),shellFade=1-smooth((age-7200)/2000);
      const escape=smooth((age-4300)/2300),babyAlpha=state.shellOnly?0:emptyIn;
      const bx=(10+18*escape)*u,by=(-25-77*escape)*u+Math.sin(t*8)*2*u;
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(state.angle);
      const pressure=Math.sin(t*8)*(1-smooth((age-2100)/850));
      if(ruptureIn<1){ctx.save();ctx.globalAlpha=(1-smooth((age-2700)/650))*shellFade;ctx.scale(1+pressure*.018,1-pressure*.007);
        ctx.drawImage(intact,-l.w/2,-l.h/2,l.w,l.h);ctx.restore();}
      if(rupture&&ruptureIn>0&&emptyIn<1){ctx.save();ctx.globalAlpha=ruptureIn*(1-emptyIn)*shellFade;
        if(ruptureIn<.96){ctx.beginPath();ctx.ellipse(0,-eh*.06,ew*(.15+.55*ruptureIn),eh*(.22+.4*ruptureIn),0,0,Math.PI*2);ctx.clip();}
        ctx.translate(Math.sin(t*7)*u,Math.sin(t*9)*u);ctx.rotate(Math.sin(t*7)*.013);
        for(let row=0;row<rupture.height;row+=12){const sh=Math.min(12,rupture.height-row),bend=Math.sin(t*8+row*.018)*u*1.2;
          ctx.drawImage(rupture,0,row,rupture.width,sh,-l.w*.78/2+bend,-l.h*.83/2+row/rupture.height*l.h*.83,l.w*.78,sh/rupture.height*l.h*.83+.15);
        }ctx.restore();}
      if(husk&&emptyIn>0){ctx.save();ctx.globalAlpha=emptyIn*shellFade;
        ctx.translate(Math.sin(t*3)*u*.5,emptyIn*4*u);ctx.scale(1+.012*Math.sin(t*5)*(1-emptyIn),1-.03*emptyIn);
        ctx.drawImage(husk,-l.w*.78/2,-l.h*.83/2,l.w*.78,l.h*.83);ctx.restore();}
      // The cavity is behind the emerging larva; the lower torn lip is in front.
      if(baby&&babyAlpha){
        ctx.save();ctx.globalAlpha=babyAlpha;
        ctx.beginPath();ctx.moveTo(-bw*.57,-eh*.9);ctx.lineTo(bw*.57,-eh*.9);
        ctx.lineTo(bw*.57,-eh*.36);ctx.lineTo(bw*.43,-eh*.2);
        ctx.lineTo(bw*.43,eh*.18);ctx.lineTo(bw*.26,eh*.34);
        ctx.lineTo(-bw*.26,eh*.34);ctx.lineTo(-bw*.43,eh*.18);
        ctx.lineTo(-bw*.43,-eh*.2);ctx.lineTo(-bw*.57,-eh*.36);ctx.closePath();ctx.clip();
        ctx.translate(bx,by);ctx.rotate(Math.sin(t*8)*.045);
        const scale=.76+.24*escape;
        for(let row=0;row<704;row+=5){const sh=Math.min(5,704-row),bend=Math.sin(t*9-row*.029)*Math.sin(row/704*Math.PI)*2*u;
          ctx.drawImage(baby,0,row,512,sh,-l.w*scale/2+bend,(row/704-.5)*l.h*scale,l.w*scale,sh/704*l.h*scale+.2);
        }ctx.restore();
        drawHatchLip(ctx,l,emptyIn*shellFade,t);
      }
      if(crack&&ruptureIn<.85){const top=-eh*.32,bottom=top+crack*eh*.64;
        ctx.save();ctx.globalAlpha=(1-ruptureIn)*crack;ctx.strokeStyle='#551b2b';ctx.lineCap='round';ctx.lineWidth=3.2*u;
        ctx.beginPath();for(let y=top;y<=bottom;y+=3*u){const x=(Math.sin(y/eh*29)*.018+Math.sin(y/eh*61)*.007)*ew;if(y===top)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
        ctx.strokeStyle='rgba(248,131,116,.85)';ctx.lineWidth=1.1*u;ctx.stroke();ctx.restore();}
      if(emptyIn&&!state.shellOnly){for(let i=0;i<20;i++){
        const side=i%2?-1:1,band=Math.floor(i/2),rootY=(-.37+band*.077)*eh;
        const x0=side*(ew*(.15+.022*Math.sin(band*2.7))),y0=rootY;
        const x1=bx+side*bw*(.09+.035*(i%3)),y1=by+bh*(-.33+.07*(i%5));
        const breakAt=6100+i*55,release=smooth((age-breakAt)/390);
        const endX=x1*(1-release)+(x0+side*(7+band)*u)*release;
        const endY=y1*(1-release)+(y0+(17+band*3)*u)*release;
        const sway=Math.sin(t*(5.2+i*.07)+i*1.9)*(3+i%4)*u;
        const alpha=emptyIn*(1-smooth((age-7700)/950))*(.66+.18*Math.sin(t*4+i));
        ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.strokeStyle=i%4?'#9d4350':'#dd8980';ctx.lineWidth=(.9+i%4*.4)*u;
        ctx.beginPath();ctx.moveTo(x0,y0);ctx.bezierCurveTo(x0+side*10*u+sway,y0+12*u,endX-side*8*u-sway,endY-10*u,endX,endY);ctx.stroke();
        ctx.strokeStyle='rgba(255,193,171,.65)';ctx.lineWidth=.35*u;ctx.stroke();
        if(i%3===0){ctx.fillStyle='#d36e75';ctx.beginPath();ctx.ellipse(endX,endY,1.1*u,(1.4+release)*u,0,0,Math.PI*2);ctx.fill();}
      }}
      if(ruptureIn&&shellFade){for(let i=0;i<4;i++){
        const side=i%2?-1:1,band=Math.floor(i/2),x0=side*ew*(.18+band*.04),y0=(-.08+band*.13)*eh;
        const phase=(t*.32+i*.27)%1,hang=(18+phase*28)*u,sway=Math.sin(t*4+i)*5*u;
        ctx.globalAlpha=ruptureIn*shellFade*(.48+.24*Math.sin(t*3+i));ctx.lineCap='round';ctx.strokeStyle='#8f3543';ctx.lineWidth=(3.2+band*.7)*u;
        ctx.beginPath();ctx.moveTo(x0,y0);ctx.bezierCurveTo(x0+side*7*u,y0+hang*.27,x0+sway,y0+hang*.7,x0+sway,y0+hang);ctx.stroke();
        ctx.strokeStyle='rgba(247,158,139,.65)';ctx.lineWidth=.9*u;ctx.stroke();
        ctx.fillStyle='#c35b62';ctx.beginPath();ctx.ellipse(x0+sway,y0+hang,2.5*u,3.6*u,0,0,Math.PI*2);ctx.fill();
      }}
      const burst=smooth((age-1850)/500)*(1-smooth((age-2900)/1250));
      if(burst){for(let i=0;i<11;i++){
        const theta=i*2.399,travel=Math.max(0,(age-2100)/1250),x=Math.cos(theta)*(8+travel*28)*u,y=Math.sin(theta)*(5+travel*17)*u+travel*travel*24*u;
        ctx.globalAlpha=burst*(1-i*.035);ctx.fillStyle=i%3?'#ad4250':'#e99b8d';ctx.beginPath();ctx.ellipse(x,y,(1.5+i%3*.55)*u,(2.6+i%2)*u,theta,0,Math.PI*2);ctx.fill();}}
      if(ruptureIn){for(let i=0;i<14;i++){
        const p=(t*.58+i*.17)%1,life=Math.sin(Math.PI*p),side=i%2?-1:1;
        const x=side*(ew*.18+Math.sin(i*9.2)*5*u),y=(-.16+i%5*.08)*eh+p*p*eh*.49;
        ctx.globalAlpha=life*ruptureIn*(1-shellFade*.1);ctx.fillStyle=i%3?'#a83d4b':'#e58a7e';
        ctx.beginPath();ctx.ellipse(x,y,(1.4+i%3*.4)*u,(2.4+i%2)*u,0,0,Math.PI*2);ctx.fill();}}
      ctx.restore();
    }
    function drawHatchLip(ctx,l,alpha,t){
      if(!original||!husk||alpha<=0)return;
      const u=l.h/704;
      ctx.save();ctx.globalAlpha=alpha;
      ctx.translate(Math.sin(t*3)*u*.5,alpha*4*u);
      ctx.scale(1+.012*Math.sin(t*5)*(1-alpha),1-.03*alpha);
      // Only the near, lower rim crosses in front of the escaping body.
      ctx.beginPath();ctx.moveTo(-l.w*.21,34*u);
      ctx.quadraticCurveTo(-l.w*.1,39*u,0,48*u);
      ctx.quadraticCurveTo(l.w*.1,39*u,l.w*.21,34*u);
      ctx.lineTo(l.w*.24,l.h*.29);ctx.lineTo(-l.w*.24,l.h*.29);ctx.closePath();ctx.clip();
      ctx.drawImage(husk,-l.w*.78/2,-l.h*.83/2,l.w*.78,l.h*.83);ctx.restore();
    }
    function drawHatch(ctx,state,l){
      if(original){drawOriginalHatch(ctx,state,l);return;}
      const age=state.time-state.eggHatch.born,t=age/1000,unit=l.h/704;
      const opening=smooth((age-1400)/2600),escape=smooth((age-2800)/2800),free=smooth((age-5300)/1200);
      const ew=w*unit,eh=h*unit,bw=config.babyWidth*unit,bh=config.babyHeight*unit;
      const bx=escape*ew*.82,by=eh*.13-escape*eh*.62;
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(state.angle);
      // The baby is behind the membrane: its head first clears the upper split.
      if(opening>0&&baby){
        ctx.save();ctx.beginPath();ctx.rect(-ew*2,-eh*2,ew*4,eh*2+opening*eh*.55);ctx.clip();
        ctx.translate(bx+Math.sin(t*7)*unit*3,by+Math.sin(t*5.5)*unit*3);ctx.rotate(escape*.3+Math.sin(t*5)*.065);
        for(let y=0;y<704;y+=4){const sh=Math.min(4,704-y),wave=Math.sin(t*7-y*.025)*Math.sin(y/704*Math.PI)*unit*(2+free*2);
          ctx.drawImage(baby,0,y,512,sh,-l.w/2+wave,(y/704-.5)*l.h,l.w,sh/704*l.h);
        }ctx.restore();
      }
      // Two clipped halves retain the intact egg's original registration and scale.
      for(const side of [-1,1]){
        ctx.save();ctx.globalAlpha=1-smooth((age-6500)/2400);ctx.translate(side*opening*ew*.2,opening*eh*.14+Math.sin(t*8+side)*opening*unit*2);ctx.rotate(side*opening*(.3+.035*Math.sin(t*7)));
        ctx.beginPath();ctx.moveTo(side*ew*2,-eh*2);ctx.lineTo(0,-eh*2);
        for(let y=-eh;y<=eh;y+=eh/18)ctx.lineTo(Math.sin(y/eh*17)*ew*.025,y);
        ctx.lineTo(0,eh*2);ctx.lineTo(side*ew*2,eh*2);ctx.closePath();ctx.clip();
        const bulge=1+Math.sin(t*8)*.018*(1-opening);ctx.scale(bulge,1);
        ctx.drawImage(intact,-l.w/2,-l.h/2,l.w,l.h);
        ctx.globalAlpha=(1-smooth((age-6500)/2400))*(opening+(1-opening)*(.28+.2*Math.sin(t*8)));ctx.drawImage(coreMasks[0],-l.w/2,-l.h/2,l.w,l.h);
        ctx.restore();
      }
      if(opening>0&&free<1){
        const strandCount=original?7:3;
        for(let i=0;i<strandCount;i++){
          const x0=(i-(strandCount-1)/2)*ew*(original?.048:.12),y0=eh*(.08+.03*(i%3));
          const x1=bx+(i-(strandCount-1)/2)*bw*.085,y1=by+bh*(.19+.055*(i%3));
          const sway=Math.sin(t*(4+i*.2)+i)*ew*.035;
          ctx.globalAlpha=(1-free)*(.65+.2*Math.sin(t*4+i));ctx.strokeStyle=i%3===0?'#d77d71':'#8b3944';ctx.lineWidth=Math.max(.5,unit*(original?1.9-i*.16:1.4));
          ctx.beginPath();ctx.moveTo(x0,y0);ctx.bezierCurveTo(x0+sway,y0+eh*.19,x1-sway,y1-bh*.2,x1,y1);ctx.stroke();
          if(original){ctx.strokeStyle='rgba(255,184,154,.52)';ctx.lineWidth=Math.max(.4,unit*.5);ctx.stroke();}
        }
        if(original){for(let i=0;i<5;i++){const drip=smooth(((t*1.2+i*.21)%1));ctx.fillStyle='rgba(194,62,69,.65)';ctx.beginPath();ctx.ellipse((i-2)*ew*.06+Math.sin(t*4+i)*unit*3,eh*(.13+drip*.37),unit*(1.2+drip),unit*(2+drip),0,0,Math.PI*2);ctx.fill();}}
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
        if(original&&o.damage)drawLivingTissue(ctx,l,angle,s,time,o.lights,o.impact);
      },
      snapshot(s,t,o){return {...base.effects.snapshot(s,t,o),egg:true,lights:o.lights&&s<3?1:0,
        organs:o.lights&&s<3?1:0,internalGlow:o.lights&&s<3?[1,.6,.18][s]*(.5+.5*Math.sin(t*.0021)):0};}
    };
    function drawDeath(ctx,state){
      base.drawDeath(ctx,state);
      if(!original||!state.bioDeath||state.time>=state.bioDeath.rupture)return;
      const d=state.bioDeath,age=state.time-d.born,fade=1-age/(d.rupture-d.born),u=d.layout.h/704;
      ctx.save();ctx.translate(d.layout.x,d.layout.y);ctx.rotate(d.angle);ctx.globalAlpha=fade*.8;
      for(let i=0;i<6;i++){
        const x=(i-2.5)*w*.09*u,y=(-.05+i*.045)*h*u,slump=age*.025*u;
        ctx.strokeStyle=i%2?'#8a3545':'#bc5960';ctx.lineWidth=(1.1+i*.12)*u;
        ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+Math.sin(age*.03+i)*5*u,y+slump*.4,x-4*u,y+slump*.8,x+Math.sin(age*.012+i)*6*u,y+slump+25*u);ctx.stroke();
      }
      ctx.restore();
    }
    const release=()=>{base.prepare([]);coreMasks=[];baby=null;intact=null;rupture=null;husk=null;};
    const biology={...base,prepare,drawBody,drawDeath,effects,prepareHatch,drawHatch,drawHatchLip,hatchSnapshot,release};
    window.starterShips.set(id,{width:512,height:704,biological:true,biology,effects,
      align:im=>im,breakAnchors:wounds[3].map(([x,y])=>[x,y])});
  }
})();
