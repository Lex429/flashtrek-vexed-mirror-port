/* Damage-state fragments used by the showcase and live ships. */
(() => {
  'use strict';
  function prepare(frames,anchors) {
    const w=frames[0].width,h=frames[0].height;
    const read=image=>{
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,w,h);
      return ctx.getImageData(0,0,w,h).data;
    };
    const pixels=frames.map(read),fragments=[[],[],[],[]];
    for(let stage=1;stage<4;stage++){
      const groups=anchors.map(()=>[]),before=pixels[stage-1],after=pixels[stage];
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;if(before[i+3]<100||after[i+3]>40)continue;
        let closest=0,distance=Infinity;
        anchors.forEach(([ax,ay],n)=>{const d=(x-ax)**2+(y-ay)**2;if(d<distance){distance=d;closest=n;}});
        groups[closest].push({x,y,i});
      }
      for(const group of groups){
        if(group.length<12)continue;
        const x=Math.min(...group.map(p=>p.x)),y=Math.min(...group.map(p=>p.y));
        const fw=Math.max(...group.map(p=>p.x))-x+1,fh=Math.max(...group.map(p=>p.y))-y+1;
        const texture=document.createElement('canvas');texture.width=fw;texture.height=fh;
        const ctx=texture.getContext('2d'),cut=ctx.createImageData(fw,fh);
        for(const p of group)cut.data.set(before.subarray(p.i,p.i+4),((p.y-y)*fw+p.x-x)*4);
        ctx.putImageData(cut,0,0);
        fragments[stage].push({texture,x:(x+fw/2)/w-.5,y:(y+fh/2)/h-.5,w:fw/w,h:fh/h,pixels:group.length});
      }
    }
    return fragments;
  }
  function emit({debris,fragments,before,after,layout,world,angle,time,zoom,burst}) {
    for(let stage=before+1;stage<=after;stage++)for(const piece of fragments[stage]){
      const point=world(piece),direction=Math.atan2(point.y-layout.y,point.x-layout.x),speed=(55+stage*18)*zoom;
      debris.push({...point,texture:piece.texture,w:piece.w*layout.w,h:piece.h*layout.h,
        vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,
        angle,spin:(piece.x<0?-1:1)*1.4,born:time,ttl:4200,cthia:true});
      burst(point,.65,true);
    }
  }
  function update(piece,dt){
    piece.x+=piece.vx*dt;piece.y+=piece.vy*dt;piece.angle+=piece.spin*dt;
    piece.vx*=Math.max(0,1-.2*dt);piece.vy*=Math.max(0,1-.2*dt);
  }
  function draw(ctx,piece,time){
    const age=time-piece.born;if(age<0||age>=piece.ttl)return;
    const fade=age/piece.ttl;
    ctx.save();ctx.translate(piece.x,piece.y);ctx.rotate(piece.angle);
    ctx.globalAlpha=fade<.65?1:Math.max(0,(1-fade)/.35);
    ctx.drawImage(piece.texture,-piece.w/2,-piece.h/2,piece.w,piece.h);
    ctx.restore();
  }
  window.showcaseStageFragments=Object.freeze({prepare,emit,update,draw});
})();
