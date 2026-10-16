/* Galaxy-only destruction example. Coordinates follow its installed 383x512
   artwork: saucer plating, bridge/neck, engineering hull, pylons and engines. */
(() => {
  'use strict';
  const profile=window.starterShips.get(35);
  const sites=[['bridge reactor housing',201,159],['neck and collar',201,271],
    ['port forward saucer',78,105],['forward saucer plating',169,77],
    ['starboard forward saucer',308,110],['starboard aft saucer',313,198],
    ['aft saucer plating',233,224],['port aft saucer',96,218],
    ['port engineering hull',180,365],['starboard engineering hull',225,369],
    ['port nacelle',104,407],['starboard nacelle',296,407],
    ['port pylon',149,416],['starboard pylon',252,416],
    ['port nacelle cap',104,310],['starboard nacelle cap',296,310]];
  const hash=n=>{const v=Math.sin(n*12.9898+73.217)*43758.5453;return v-Math.floor(v);};
  const jag=(n,seed)=>{const cell=Math.floor(n/5);return (hash(cell+seed)-.5)*5+(hash(Math.floor(n/2)+seed*7)-.5)*2;};
  const seams=[-Math.PI,-2.2,-1.2,-.15,.85,1.8,Math.PI];
  const chips=[];
  for(let i=0;i<6;i++)for(let j=0;j<2;j++){
    const angle=seams[i]+.025,r=65+j*39;
    chips.push({x:201+Math.cos(angle)*r,y:159+Math.sin(angle)*r,r:3+i%3});
    sites.push(['torn saucer plating chip '+(chips.length),chips.at(-1).x,chips.at(-1).y]);
  }
  function owner(x,y){
    if(y<267){
      for(let i=0;i<chips.length;i++)if(Math.hypot(x-chips[i].x,y-chips[i].y)<chips[i].r+jag(y,i+23)*.25)return 16+i;
      const dx=x-201,dy=y-159,r=Math.hypot(dx,dy);
      if(r<38+jag(Math.atan2(dy,dx)*35,9))return 0;
      if(y>203+jag(x,7)&&Math.abs(dx)<31+jag(y,4))return 1;
      const angle=Math.atan2(dy,dx)+jag(r,3)/Math.max(38,r);
      for(let i=0;i<6;i++)if(angle<seams[i+1])return 2+i;
      return 7;
    }
    if(y>290&&x<134+jag(y,11))return y<337+jag(x,14)?14:10;
    if(y>290&&x>267+jag(y,12))return y<337+jag(x,15)?15:11;
    if(y<324+jag(x,6))return 1;
    if(y>379+jag(x,17)&&x<166+jag(y,13))return 12;
    if(y>379+jag(x,18)&&x>239+jag(y,16))return 13;
    return x<201+jag(y,19)?8:9;
  }
  profile.destruction={...profile.destruction,sites,core:[201,159],coreIndex:0,
    partition:{owner},structural:true};
})();
