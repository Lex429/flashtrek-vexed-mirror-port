/* The original showcase shield hit: tint the ship silhouette for 140 ms.
   Weapon and debris hits call the same renderer; no surrounding bubble. */
(() => {
  'use strict';
  const masks=new WeakMap();
  window.drawShowcaseShieldFlash=(ctx,image,w,h,flash,time)=>{
    const age=time-flash.born;if(age<0||age>=140)return;
    let colors=masks.get(image);if(!colors){colors=new Map();masks.set(image,colors);}
    let mask=colors.get(flash.color);
    if(!mask){
      mask=document.createElement('canvas');mask.width=image.width;mask.height=image.height;
      const g=mask.getContext('2d');g.drawImage(image,0,0);g.globalCompositeOperation='source-atop';g.fillStyle=flash.color;g.fillRect(0,0,mask.width,mask.height);colors.set(flash.color,mask);
    }
    ctx.save();ctx.globalAlpha=.55*(1-age/140);ctx.drawImage(mask,-w/2,-h/2,w,h);ctx.restore();
  };
})();
