/* One continuous Egg A -> Larva A -> Juvenile A life cycle. */
(() => {
  'use strict';
  const files={larva:'creatures/larva-a-intact.png',juvenile:'creatures/juvenile-a-intact.png',rupture:'creatures/egg-a-hatching-wet.png',husk:'creatures/egg-a-empty-husk.png',molt:'creatures/larva-a-mid-molt.png'};
  const clamp=v=>Math.max(0,Math.min(1,v));
  const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
  const offset=origin=>origin===67?6500:0;
  const total=origin=>offset(origin)+12100;
  let moltLipSource=null,moltLip=null;
  function frontMoltLip(im){
    if(moltLipSource===im)return moltLip;
    const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
    const g=canvas.getContext('2d');g.drawImage(im,0,0);
    // Feather the upper edge of the painted cuticle instead of clipping a
    // straight strip from the old larva image across the new body.
    g.globalCompositeOperation='destination-in';
    const mask=g.createLinearGradient(0,im.height*.44,0,im.height*.55);
    mask.addColorStop(0,'rgba(0,0,0,0)');mask.addColorStop(1,'rgba(0,0,0,1)');
    g.fillStyle=mask;g.fillRect(0,0,im.width,im.height);
    moltLipSource=im;moltLip=canvas;return canvas;
  }
  function phase(origin,age){const t=age-offset(origin);return t<0?'hatching':t<2600?'crawling':t<4400?'turning':t<10300?'molting':t<12100?'juvenile':'complete';}
  function drawSprite(ctx,im,x,y,w,h,alpha=1){if(!im||alpha<=0)return;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(im,x-w/2,y-h/2,w,h);ctx.restore();}
  function drawLarva(ctx,im,biology,l,time,angle,wet=0){
    const m=window.larvaMotion,old=m.mode;m.mode='crawl';
    biology.drawBody(ctx,im,l,angle,0,time);m.mode=old;
    if(wet>0){ctx.save();ctx.translate(l.x,l.y);ctx.rotate(angle);ctx.globalAlpha=wet*.55;
      for(let i=0;i<7;i++){const p=(time*.0009+i*.19)%1,x=(i-3)*l.w*.018+Math.sin(time*.004+i)*2,y=l.h*(-.09+i*.021+p*.13);
        ctx.fillStyle=i%2?'#d87778':'#8e3548';ctx.beginPath();ctx.ellipse(x,y,(1.2+i%3*.4)*l.h/704,(2+p*2)*l.h/704,0,0,Math.PI*2);ctx.fill();}
      ctx.restore();}
  }
  function drawMolt(ctx,assets,l,time,progress){
    const larva=assets.get(files.larva),juvenile=assets.get(files.juvenile),mid=assets.get(files.molt),u=l.h/704;
    const strain=smooth(progress/.28),crack=smooth((progress-.18)/.34),emerge=smooth((progress-.36)/.53),shed=smooth((progress-.76)/.24);
    const midAlpha=mid?smooth((progress-.32)/.13)*(1-smooth((progress-.66)/.12)):0;
    const liveIn=smooth((progress-.66)/.12);
    const bodyW=l.w*147/512,bodyH=l.h*256/704,split=y=>(Math.sin(y/bodyH*23)*.023+Math.sin(y/bodyH*49+1)*.01)*bodyW;
    ctx.save();ctx.translate(l.x,l.y);
    const swell=1+strain*(1-crack)*(.018+.016*Math.sin(time*.013));
    if(!crack){ctx.save();ctx.scale(swell,1-.008*strain);ctx.drawImage(larva,-l.w/2,-l.h/2,l.w,l.h);ctx.restore();}
    if(crack){
      const cavity=ctx.createRadialGradient(0,-bodyH*.06,1,0,0,bodyW*.48);
      cavity.addColorStop(0,'rgba(238,118,104,.76)');cavity.addColorStop(.3,'rgba(136,34,51,.82)');cavity.addColorStop(1,'rgba(32,7,20,0)');
      ctx.globalAlpha=crack*(1-shed*.6);ctx.fillStyle=cavity;ctx.beginPath();ctx.ellipse(0,0,bodyW*(.17+.34*crack),bodyH*.5,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      for(const side of [-1,1]){
        const open=crack*(side<0?1:.84),hinge=side*open*bodyW*.39;
        ctx.save();ctx.globalAlpha=(1-midAlpha)*(1-liveIn)*(1-shed*.42);ctx.translate(hinge,open*bodyH*.04);ctx.rotate(side*open*(side<0?.2:.14));
        ctx.beginPath();ctx.moveTo(side*l.w,-l.h);ctx.lineTo(split(-l.h),-l.h);
        for(let y=-l.h;y<=l.h;y+=u*4)ctx.lineTo(split(y),y);
        ctx.lineTo(side*l.w,l.h);ctx.closePath();ctx.clip();
        ctx.drawImage(larva,-l.w/2,-l.h/2,l.w,l.h);
        ctx.globalAlpha=crack*(1-shed*.4);ctx.strokeStyle='#541a2a';ctx.lineWidth=4*u;ctx.lineCap='round';
        ctx.beginPath();for(let y=-bodyH*.44;y<=bodyH*.45;y+=u*3){if(y===-bodyH*.44)ctx.moveTo(split(y)+side*u,y);else ctx.lineTo(split(y)+side*u,y);}ctx.stroke();
        ctx.strokeStyle='rgba(246,137,122,.8)';ctx.lineWidth=1.15*u;ctx.stroke();ctx.restore();
      }
      // The painted mid-molt contains the emerging body. Hand off to the live
      // juvenile only as that painting fades, so there is never a second body.
      if(midAlpha){
        ctx.save();ctx.globalAlpha=midAlpha;ctx.translate(0,-progress*bodyH*.07+Math.sin(time*.008)*u);
        ctx.rotate(Math.sin(time*.009)*.014);ctx.drawImage(mid,-l.w*.85/2,-l.h*.55/2,l.w*.85,l.h*.55);ctx.restore();}
      if(liveIn){
        const y=-emerge*bodyH*.32;
        const growth=smooth((progress-.66)/.3),scale=.58+.42*growth;
        drawSprite(ctx,juvenile,0,y,l.w*scale,l.h*scale,liveIn);
        if(mid){ctx.save();ctx.globalAlpha=liveIn*(1-shed);
          ctx.translate(0,-progress*bodyH*.07+Math.sin(time*.008)*u);
          ctx.rotate(Math.sin(time*.009)*.014);
          ctx.drawImage(frontMoltLip(mid),-l.w*.85/2,-l.h*.55/2,l.w*.85,l.h*.55);ctx.restore();}
      }
      if(!shed){for(let i=0;i<22;i++){
        const side=i%2?-1:1,band=Math.floor(i/2),y0=(-.38+band*.075)*bodyH;
        const x0=side*crack*(side<0?1:.84)*bodyW*.39+split(y0);
        const attachedX=side*bodyW*(.06+.025*(i%4))+Math.sin(time*.007+i)*2*u;
        const attachedY=y0+bodyH*(.1+.045*(i%4))-emerge*bodyH*.16;
        const release=smooth((progress-.58-i*.011)/.11);
        const x1=attachedX*(1-release)+(x0+side*(5+i%5)*u)*release;
        const y1=attachedY*(1-release)+(y0+(14+i%7*3)*u)*release;
        const tension=crack*(1-shed),sway=Math.sin(time*.005+i*1.7)*(2+i%4)*u;
        ctx.globalAlpha=tension*(.62+.18*Math.sin(time*.004+i));ctx.lineCap='round';
        ctx.strokeStyle=i%4?'#a74956':'#e2958c';ctx.lineWidth=(.9+i%4*.38)*u;
        ctx.beginPath();ctx.moveTo(x0,y0);ctx.bezierCurveTo(x0+side*7*u+sway,y0+9*u,x1-side*7*u-sway,y1-7*u,x1,y1);ctx.stroke();
        ctx.strokeStyle='rgba(255,194,174,.58)';ctx.lineWidth=.3*u;ctx.stroke();
        if(i%3===0){ctx.fillStyle='#d87879';ctx.beginPath();ctx.ellipse(x1,y1,1.2*u,(1.5+release)*u,0,0,Math.PI*2);ctx.fill();}
      }}
      for(let i=0;i<12;i++){const p=(time*.00065+i*.23)%1,life=Math.sin(p*Math.PI),side=i%2?-1:1;
        const x=side*(crack*bodyW*.35+bodyW*.05)+Math.sin(i*7.1)*3*u,y=(-.3+i%5*.12)*bodyH+p*p*bodyH*.7;
        ctx.globalAlpha=life*crack*(1-shed*.5);ctx.fillStyle=i%3?'#a43b4a':'#e7887d';
        ctx.beginPath();ctx.ellipse(x,y,(1.3+i%3*.45)*u,(2.4+i%2)*u,0,0,Math.PI*2);ctx.fill();}
    }
    ctx.restore();
  }
  function draw(ctx,{state,evolution:e,layout:l,assets,eggBiology,larvaBiology}){
    const age=state.time-e.born,t=age-offset(e.origin),p=phase(e.origin,age),larva=assets.get(files.larva);
    if(p==='hatching'){eggBiology.drawHatch(ctx,{time:state.time,angle:state.angle,eggHatch:{born:e.born}},l);return p;}
    if(p==='crawling'){
      const move=smooth(t/2600),u=l.h/704;
      const x=e.origin===67?l.x+28*u+(15-28*u)*move:l.x+15*move;
      const y=e.origin===67?l.y-102*u+(-92+102*u)*move:l.y-12-move*20;
      if(e.origin===67&&t<1900){ctx.save();ctx.globalAlpha=1-smooth(t/1900);eggBiology.drawHatch(ctx,{time:e.born+6500+t,angle:0,eggHatch:{born:e.born},shellOnly:true},l);ctx.restore();}
      drawLarva(ctx,larva,larvaBiology,{...l,x,y},state.time,0,e.origin===67?1-move:0);
      if(e.origin===67&&t<1900){ctx.save();ctx.globalAlpha=1-smooth(t/1900);
        ctx.translate(l.x,l.y);eggBiology.drawHatchLip(ctx,l,1,(6500+t)*.001);ctx.restore();}
    }else if(p==='turning'){
      const turn=smooth((t-2600)/1800),angle=turn*Math.PI*2;
      drawLarva(ctx,larva,larvaBiology,{...l,x:l.x+15,y:l.y-(e.origin===67?92:32)},state.time,angle);
    }else if(p==='molting')drawMolt(ctx,assets,{...l,x:l.x+15,y:l.y-(e.origin===67?92:32)},state.time,(t-4400)/5900);
    else{
      const settle=smooth((t-10300)/1800),y=l.y-(e.origin===67?92:32)+settle*(e.origin===67?47:12);
      drawSprite(ctx,assets.get(files.juvenile),l.x+15,y+Math.sin(state.time*.006)*2,l.w,l.h);
    }
    return p;
  }
  window.creatureEvolution={files,total,phase,draw};
})();
