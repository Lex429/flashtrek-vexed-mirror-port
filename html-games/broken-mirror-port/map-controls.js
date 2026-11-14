/* Pure map selection/camera helpers. Travel remains in native-navigation. */
(() => {
  'use strict';
  const directions={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
  function next(items,current,direction,{x:scaleX=1,y:scaleY=1}={}){
    const vector=directions[direction];if(!vector||!items.length)return null;
    const origin=current||items[0];let best=null,score=Infinity;
    for(const item of items){
      if(item===origin||item.key===origin.key)continue;
      const dx=(item.x-origin.x)*scaleX,dy=(item.y-origin.y)*scaleY,along=dx*vector[0]+dy*vector[1],distance=Math.hypot(dx,dy);
      if(along<=1e-8||!distance)continue;
      const candidate=distance*(1+5*(1-along/distance)**2);
      if(candidate<score-1e-8||Math.abs(candidate-score)<=1e-8&&String(item.key)<String(best?.key)){best=item;score=candidate;}
    }
    return best;
  }
  function camera(from,to,progress){
    const t=Math.max(0,Math.min(1,progress)),ease=t*t*t*(t*(t*6-15)+10);
    if(t===0)return {...from};if(t===1)return {...to};
    return {x:from.x+(to.x-from.x)*ease,y:from.y+(to.y-from.y)*ease,span:Math.exp(Math.log(from.span)+(Math.log(to.span)-Math.log(from.span))*ease)};
  }
  window.nativeMapControls=Object.freeze({next,camera});
})();
