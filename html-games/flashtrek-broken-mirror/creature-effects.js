/* Living circulation, articulated movement and real damage textures for every creature. */
(() => {
  'use strict';
  window.larvaMotion={mode:'idle',born:0,offset:0,xOffset:0};
  const sizes=[[69,147,256],[70,99,146],[71,182,333],[72,132,160],[73,312,463],[74,157,191],[75,350,510],[76,173,207],[77,477,665],[78,217,199]];
  const make=()=>{const c=document.createElement('canvas');c.width=512;c.height=704;return c;};
  const originals=sizes.map(([id,width,height])=>({id,width,height,type:id<=70?'larva':id<=72?'juvenile':id<=74?'worker':id<=76?'guard':'queen',glowColor:[255,151,50]}));
  for(const config of [...originals,...(window.creatureMutationProfiles||[]).filter(p=>p.type!=='egg')]){
    const {id,width:w,height:h}=config;
    const larva=config.type==='larva',queen=config.type==='queen',guard=config.type==='guard';
    const originalLarva=id===69;
    const pace=queen?.55:guard?.78:larva?1.25:1;
    const p=(x,y)=>[256+(x-.5)*w,352+(y-.5)*h];
    const wounds=[[],[[...p(.35,.4),w*.045]],[[...p(.35,.4),w*.07],[...p(.65,.65),w*.06]],[[...p(.35,.4),w*.09],[...p(.65,.65),w*.08],[...p(.48,.78),w*.06]]];
    const sites=[[.5,.12],[.25,.32],[.75,.32],[.5,.45],[.25,.61],[.75,.61],[.5,.68],[.3,.82],[.7,.82]].map(([x,y])=>p(x,y));
    const base=window.createBiologicalShipEffects({width:512,height:704,wounds,organs:[],sites,deadFinal:true,fixedSilhouette:true,ruptureMs:queen?1200:800});
    let textures=[],glows=[],dimmers=[],glowPixels=[];
    function unlitFrame(im){if(im.deadUnlit)return im;const c=make(),g=c.getContext('2d');g.filter='saturate(0.12) brightness(0.68)';g.drawImage(im,0,0);c.deadUnlit=true;return c;}
    function prepare(images){
      base.prepare(images);textures=[];glows=[];dimmers=[];glowPixels=[];
      for(const [stage,im] of images.entries()){
        const source=make(),g=source.getContext('2d');g.drawImage(im,0,0);const data=g.getImageData(0,0,512,704).data;
        const masks=Array.from({length:originalLarva?25:13},()=>{const c=make();return {canvas:c,g:c.getContext('2d'),data:c.getContext('2d').createImageData(512,704),left:512,top:704,right:0,bottom:0};});
        const glow=make(),gg=glow.getContext('2d'),gd=gg.createImageData(512,704);let matched=0;
        const feather=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
        for(let y=0;y<704;y++)for(let x=0;x<512;x++){
          const i=(y*512+x)*4,[r,g,b,a]=data.subarray(i,i+4);if(!a)continue;
          const fy=(y-(352-h/2))/h,dx=x-256;
          const add=(index,weight)=>{const opacity=Math.round(a*weight);if(!opacity)return;
            const mask=masks[index],pixels=mask.data.data;pixels[i]=r;pixels[i+1]=g;pixels[i+2]=b;pixels[i+3]=opacity;
            mask.left=Math.min(mask.left,x);mask.top=Math.min(mask.top,y);mask.right=Math.max(mask.right,x+1);mask.bottom=Math.max(mask.bottom,y+1);};
          if(originalLarva){
            // Share pixels across the body, neighboring leg rows, and both sides
            // of each joint. Their soft overlaps eliminate straight cut edges.
            const edge=feather((Math.abs(dx)/w-.2)/.14);
            const vertical=feather((fy-.12)/.08)*(1-feather((fy-.84)/.08));
            const leg=edge*vertical;add(0,1-leg);
            if(leg){
              const q=(fy-.15)/(.73/6)-.5,side=dx>0?1:0;
              const rows=q<=0?[[0,1]]:q>=5?[[5,1]]:[[Math.floor(q),1-q%1],[Math.floor(q)+1,q%1]];
              const far=feather((Math.abs(dx)/w-.32)/.08);
              for(const [band,share] of rows){const group=1+band*2+side;
                add(group,leg*share*(1-far));add(group+12,leg*share*far);}
            }
          }else{
            const outside=Math.abs(dx)>w*(larva?.25:.28)&&fy>.15&&fy<.88;
            const band=Math.max(0,Math.min(5,Math.floor((fy-.15)/.73*6)));
            add(outside?1+band*2+(dx>0?1:0):0,1);
          }
          const warm=config.mutation==='purple'?r>80&&b>80&&r>g*1.15&&b>g*1.15:config.mutation==='white'?r>170&&g>135&&b>95&&Math.abs(dx)<w*.12:config.mutation==='venom'||config.mutation?.startsWith('borg')?g>70&&g>r*1.08&&g>b*1.15:r>90&&g>45&&r>g*1.23&&g>r*.32&&b<g*.95;
          const spine=Math.abs(dx)<w*.06&&r>120&&r>g*1.35&&b<r*.55;
          if(stage<3&&(warm||spine)){gd.data.set([...config.glowColor,Math.round(a*.7)],i);matched++;}
        }
        textures.push(masks.map((m,n)=>{m.g.putImageData(m.data,0,0);if(!n)return m.canvas;const w=Math.max(1,m.right-m.left),h=Math.max(1,m.bottom-m.top),c=document.createElement('canvas');c.width=w;c.height=h;if(m.right)c.getContext('2d').drawImage(m.canvas,m.left,m.top,w,h,0,0,w,h);m.canvas.width=1;m.canvas.height=1;return {texture:c,x:m.left,y:m.top,w,h};}));gg.putImageData(gd,0,0);glows.push(glow);glowPixels.push(matched);const dim=make(),dg=dim.getContext('2d');dg.drawImage(glow,0,0);dg.globalCompositeOperation='source-in';dg.fillStyle='#26131b';dg.fillRect(0,0,512,704);dimmers.push(dim);
      }
    }
    function intensity(time,s){
      const m=window.larvaMotion,age=(time-m.born)/1000;
      return (m.mode==='crawl'||m.mode==='forward'?1:m.mode==='turn'?.78:m.mode==='settle'?Math.max(.16,Math.exp(-age*1.2)):m.mode==='newborn'?.5:.16)*(1-s*.24);
    }
    function drawBody(ctx,im,l,a,s,time){
      if(s===3){base.drawBody(ctx,im,l,a,s,time);return;}
      const m=window.larvaMotion,t=time*.001*pace,k=intensity(time,s),u=l.h/704;
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(a);
      if(m.mode==='newborn'&&larva&&!originalLarva){const reveal=Math.min(1,(time-m.born)/2000);ctx.beginPath();ctx.rect(-l.w,-h*u/2,l.w*2,reveal*h*u);ctx.clip();}
      for(let y=0;y<704;y+=4){const sh=Math.min(5,704-y),fy=(y-352)/h;
        const wave=Math.sin(t*(m.mode==='newborn'?9:6)-fy*8)*k*(larva?3:queen?1:1.6)*u;
        const breathe=originalLarva?(1+.012*Math.sin(t*3.2-fy*4)*(1-Math.min(1,Math.abs(fy)*1.8))):1;
        ctx.drawImage(textures[s][0],0,y,512,sh,-l.w*breathe/2+wave,(y/704-.5)*l.h,l.w*breathe,sh/704*l.h);
      }
      for(let n=1;n<13;n++){
        const side=n%2?-1:1,band=Math.floor((n-1)/2),ax=side*w*.22*u,ay=(-.28+band*.12)*h*u;
        const phase=t*8-band*1.1+(side>0?Math.PI:0),turn=Math.sin(phase)*k*(queen?.055:larva?.13:.11);
        const stride=originalLarva?Math.sin(phase)*k*1.8*u:0,lift=originalLarva?Math.max(0,Math.cos(phase))*k*1.3*u:0;
        const part=textures[s][n],px=-l.w/2+part.x*u-ax,py=-l.h/2+part.y*u-ay;
        ctx.save();ctx.translate(ax+stride,ay-lift);ctx.rotate(turn);
        if(originalLarva){
          const knee=side*w*.36*u-ax,far=textures[s][n+12];
          ctx.save();ctx.translate(knee,3*u);ctx.rotate(-side*Math.sin(phase+.8)*k*.28);ctx.translate(-knee,-3*u);
          ctx.drawImage(far.texture,-l.w/2+far.x*u-ax,-l.h/2+far.y*u-ay,far.w*u,far.h*u);ctx.restore();
        }
        ctx.drawImage(part.texture,px,py,part.w*u,part.h*u);
        if(originalLarva){const knee=side*w*.36*u-ax;
          const fold=ctx.createRadialGradient(knee,3*u,0,knee,3*u,6*u);
          fold.addColorStop(0,'rgba(48,13,22,.34)');fold.addColorStop(.6,'rgba(93,35,37,.17)');fold.addColorStop(1,'rgba(93,35,37,0)');
          ctx.fillStyle=fold;ctx.beginPath();ctx.ellipse(knee,3*u,6*u,4*u,0,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
      }
      if(originalLarva){
        const born=m.mode==='newborn',life=born?Math.max(0,1-(time-m.born)/3600):0;
        // Fine feelers and exposed underside move at a different tempo from the shell.
        for(let i=0;i<4;i++){
          const side=i%2?-1:1,rootY=(-.25+i*.15)*h*u,rootX=side*w*.18*u;
          ctx.strokeStyle=i%2?'rgba(211,103,83,.67)':'rgba(141,58,60,.68)';ctx.lineWidth=(.75+(i%2)*.35)*u;
          ctx.beginPath();ctx.moveTo(rootX,rootY);
          ctx.bezierCurveTo(rootX+side*10*u,rootY+8*u,rootX+side*(22+3*Math.sin(t*7+i))*u,rootY+16*u,rootX+side*(25+5*Math.sin(t*5+i))*u,rootY+(22+4*Math.sin(t*6+i))*u);ctx.stroke();
          ctx.fillStyle='rgba(245,156,123,.48)';ctx.beginPath();ctx.ellipse(rootX,rootY,1.6*u,2.4*u,0,0,Math.PI*2);ctx.fill();
        }
        if(life){
          for(let i=0;i<5;i++){const x=(i-2)*w*.1*u,y=h*(.05+i*.045)*u,phase=((time-m.born)*.0012+i*.23)%1;
            ctx.globalAlpha=life*(.48+.2*Math.sin(t*6+i));ctx.strokeStyle='#b66065';ctx.lineWidth=Math.max(.5,u*.85);
            ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+Math.sin(t*5+i)*5*u,y+15*u,x+Math.sin(t*4+i)*7*u,y+(24+phase*15)*u);ctx.stroke();
            ctx.fillStyle='#d36f74';ctx.beginPath();ctx.ellipse(x+Math.sin(t*4+i)*7*u,y+(24+phase*15)*u,1.4*u,2*u,0,0,Math.PI*2);ctx.fill();
          }
        }
      }
      ctx.restore();
    }
    function drawLarvaTissue(ctx,l,a,s,t,impact){
      if(!originalLarva||s===3)return;
      const u=l.h/704,beat=Math.sin(t*.006),hurt=impact?Math.max(0,1-(t-impact.born)/600):0;
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(a);
      if(s>0){for(const [i,[px,py,r]] of wounds[s].entries()){
        const x=(px-256)*u,y=(py-352)*u,rx=r*u*(1+.1*beat),ry=rx*1.5;
        const g=ctx.createRadialGradient(x-2*u,y-2*u,0,x,y,rx*1.4);
        g.addColorStop(0,'rgba(254,135,115,.5)');g.addColorStop(.42,'rgba(146,28,43,.42)');g.addColorStop(1,'rgba(48,5,14,0)');
        ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,rx*1.35,ry,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(248,156,126,.72)';ctx.lineWidth=.75*u;
        for(let j=0;j<3;j++){const sx=x+(j-1)*rx*.55;
          ctx.beginPath();ctx.moveTo(sx,y-ry*.5);ctx.bezierCurveTo(sx+Math.sin(t*.007+j)*3*u,y+ry*.2,sx-3*u,y+ry*.8,sx+Math.sin(t*.004+j)*4*u,y+ry*(1.3+j*.16));ctx.stroke();}
      }}
      if(hurt){ctx.globalAlpha=hurt*.7;ctx.strokeStyle='#f0787a';ctx.lineWidth=1.5*u;
        const px=(impact.point.x*l.w),py=(impact.point.y*l.h);
        for(let i=0;i<5;i++){const v=t*.012+i*1.26;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(v)*hurt*18*u,py+Math.sin(v)*hurt*18*u);ctx.stroke();}}
      ctx.restore();
    }
    function draw(ctx,l,a,s,t,o){
      base.effects.draw(ctx,l,a,s,t,{...o,lights:false,damage:o.damage&&s<3});
      if(originalLarva&&o.damage)drawLarvaTissue(ctx,l,a,s,t,o.impact);
      if(!o.lights||s===3)return;
      const pulse=(.35+.65*Math.max(0,Math.sin(t*.002*pace))),failure=s===2?.35+.65*Math.max(0,Math.sin(t*.007)):1;
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(a);ctx.globalAlpha=[.18,.42,.7,0][s]+(1-pulse)*.2;ctx.drawImage(dimmers[s],-l.w/2,-l.h/2,l.w,l.h);ctx.globalCompositeOperation='screen';ctx.globalAlpha=[.5,.3,.1,0][s]*pulse*failure;
      ctx.drawImage(glows[s],-l.w/2,-l.h/2,l.w,l.h);ctx.restore();
    }
    const effects={draw,unlitFrame,snapshot(s,t,o){return {...base.effects.snapshot(s,t,o),creature:true,larva,queen,motion:window.larvaMotion.mode,pace,damageArtworkReady:true,
      lights:o.lights&&s<3?glowPixels[s]:0,organs:o.lights&&s<3?1:0,vascularPixels:glowPixels[s]||0,
      internalGlow:o.lights&&s<3?[1,.55,.15,0][s]*(.35+.65*Math.max(0,Math.sin(t*.002*pace))):0};}};
    const release=()=>{base.prepare([]);textures=[];glows=[];dimmers=[];glowPixels=[];};
    const biology={...base,prepare,drawBody,effects,release};
    window.starterShips.set(id,{width:512,height:704,animationReady:true,biological:true,biology,effects,align:im=>im});
  }
})();
