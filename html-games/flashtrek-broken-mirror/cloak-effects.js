/* Shared cloak presentation for the showcase and opening film. No combat mutation. */
(() => {
  'use strict';
  const tracks=new WeakMap(),masks=new WeakMap();
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
  function mix(state,time){
    const target=state.cloaked?1:0;let track=tracks.get(state);
    if(!track){track={target,from:target,at:time};tracks.set(state,track);}
    const current=track.from+(track.target-track.from)*smooth((time-track.at)/1400);
    if(target!==track.target){track={target,from:current,at:time};tracks.set(state,track);}
    return track.from+(track.target-track.from)*smooth((time-track.at)/1400);
  }
  function draw(ctx,image,w,h,amount,time){
    if(!image||amount<=.002||amount>=.998)return;
    let mask=masks.get(image);
    if(!mask){mask=document.createElement('canvas');const scale=Math.min(1,512/Math.max(image.width,image.height));mask.width=Math.max(1,Math.round(image.width*scale));mask.height=Math.max(1,Math.round(image.height*scale));masks.set(image,mask);}
    const g=mask.getContext('2d');g.clearRect(0,0,mask.width,mask.height);g.drawImage(image,0,0,mask.width,mask.height);g.globalCompositeOperation='source-in';
    const y=mask.height*amount,band=Math.max(12,mask.height*.14),gradient=g.createLinearGradient(0,y-band,0,y+band);
    gradient.addColorStop(0,'#b7e9ff00');gradient.addColorStop(.42,'#5fa6ce65');gradient.addColorStop(.5,'#d7f4ffc0');gradient.addColorStop(.58,'#6fbaea55');gradient.addColorStop(1,'#b7e9ff00');
    g.fillStyle=gradient;g.fillRect(0,0,mask.width,mask.height);g.globalCompositeOperation='source-over';
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha*=.8+.2*Math.sin(time*.031);ctx.drawImage(mask,-w/2,-h/2,w,h);ctx.restore();
  }
  window.CinematicCloak=Object.freeze({mix,draw,opacity:(value,ghost=.18)=>ghost+(1-ghost)*(1-smooth(value)),reset:state=>tracks.delete(state)});
})();
