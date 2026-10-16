/* Living circulation, articulated movement and real damage textures for every creature. */
(() => {
  'use strict';
  window.larvaMotion={mode:'idle',born:0,offset:0};
  const sizes=[[69,147,256],[70,99,146],[71,182,333],[72,132,160],[73,312,463],[74,157,191],[75,350,510],[76,173,207],[77,477,665],[78,217,199]];
  const make=()=>{const c=document.createElement('canvas');c.width=512;c.height=704;return c;};
  const originals=sizes.map(([id,width,height])=>({id,width,height,type:id<=70?'larva':id<=72?'juvenile':id<=74?'worker':id<=76?'guard':'queen',glowColor:[255,151,50]}));
  for(const config of [...originals,...(window.creatureMutationProfiles||[]).filter(p=>p.type!=='egg')]){
    const {id,width:w,height:h}=config;
    const larva=config.type==='larva',queen=config.type==='queen',guard=config.type==='guard';
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
        const masks=Array.from({length:13},()=>{const c=make();return {canvas:c,g:c.getContext('2d'),data:c.getContext('2d').createImageData(512,704),left:512,top:704,right:0,bottom:0};});
        const glow=make(),gg=glow.getContext('2d'),gd=gg.createImageData(512,704);let matched=0;
        for(let y=0;y<704;y++)for(let x=0;x<512;x++){
          const i=(y*512+x)*4,[r,g,b,a]=data.subarray(i,i+4);if(!a)continue;
          const fy=(y-(352-h/2))/h,dx=x-256;
          // Only peripheral appendages are separated; central armor retains its shape.
          const outside=Math.abs(dx)>w*(larva?.25:.28)&&fy>.15&&fy<.88;
          const band=Math.max(0,Math.min(5,Math.floor((fy-.15)/.73*6)));
          const group=outside?1+band*2+(dx>0?1:0):0;
          const mask=masks[group];mask.data.data.set(data.subarray(i,i+4),i);mask.left=Math.min(mask.left,x);mask.top=Math.min(mask.top,y);mask.right=Math.max(mask.right,x+1);mask.bottom=Math.max(mask.bottom,y+1);
          const warm=config.mutation==='purple'?r>80&&b>80&&r>g*1.15&&b>g*1.15:config.mutation==='white'?r>170&&g>135&&b>95&&Math.abs(dx)<w*.12:config.mutation==='venom'||config.mutation?.startsWith('borg')?g>70&&g>r*1.08&&g>b*1.15:r>90&&g>45&&r>g*1.23&&g>r*.32&&b<g*.95;
          const spine=Math.abs(dx)<w*.06&&r>120&&r>g*1.35&&b<r*.55;
          if(stage<3&&(warm||spine)){gd.data.set([...config.glowColor,Math.round(a*.7)],i);matched++;}
        }
        textures.push(masks.map((m,n)=>{m.g.putImageData(m.data,0,0);if(!n)return m.canvas;const w=Math.max(1,m.right-m.left),h=Math.max(1,m.bottom-m.top),c=document.createElement('canvas');c.width=w;c.height=h;if(m.right)c.getContext('2d').drawImage(m.canvas,m.left,m.top,w,h,0,0,w,h);m.canvas.width=1;m.canvas.height=1;return {texture:c,x:m.left,y:m.top,w,h};}));gg.putImageData(gd,0,0);glows.push(glow);glowPixels.push(matched);const dim=make(),dg=dim.getContext('2d');dg.drawImage(glow,0,0);dg.globalCompositeOperation='source-in';dg.fillStyle='#26131b';dg.fillRect(0,0,512,704);dimmers.push(dim);
      }
    }
    function intensity(time,s){
      const m=window.larvaMotion,age=(time-m.born)/1000;
      return (m.mode==='crawl'?1:m.mode==='settle'?Math.max(.16,Math.exp(-age*1.2)):m.mode==='newborn'?.5:.16)*(1-s*.24);
    }
    function drawBody(ctx,im,l,a,s,time){
      if(s===3){base.drawBody(ctx,im,l,a,s,time);return;}
      const m=window.larvaMotion,t=time*.001*pace,k=intensity(time,s),u=l.h/704;
      ctx.save();ctx.translate(l.x,l.y);ctx.rotate(a);
      if(m.mode==='newborn'&&larva){const reveal=Math.min(1,(time-m.born)/2000);ctx.beginPath();ctx.rect(-l.w,-h*u/2,l.w*2,reveal*h*u);ctx.clip();}
      for(let y=0;y<704;y+=4){const sh=Math.min(5,704-y),fy=(y-352)/h;
        const wave=Math.sin(t*6-fy*8)*k*(larva?3:queen?1:1.6)*u;
        ctx.drawImage(textures[s][0],0,y,512,sh,-l.w/2+wave,(y/704-.5)*l.h,l.w,sh/704*l.h);
      }
      for(let n=1;n<13;n++){
        const side=n%2?-1:1,band=Math.floor((n-1)/2),ax=side*w*.22*u,ay=(-.28+band*.12)*h*u;
        const turn=Math.sin(t*8-band*1.1+(side>0?Math.PI:0))*k*(queen?.055:larva?.14:.11);
        const part=textures[s][n];ctx.save();ctx.translate(ax,ay);ctx.rotate(turn);ctx.drawImage(part.texture,-l.w/2+part.x*u-ax,-l.h/2+part.y*u-ay,part.w*u,part.h*u);ctx.restore();
      }
      ctx.restore();
    }
    function draw(ctx,l,a,s,t,o){
      base.effects.draw(ctx,l,a,s,t,{...o,lights:false,damage:o.damage&&s<3});
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
