/* Conservative bounds for drawing only; simulation continues outside the view. */
(() => {
  'use strict';
  function bounds(left,top,right,bottom,{w=Infinity,h=Infinity}={}){
    return !(right<0||bottom<0||left>w||top>h);
  }
  function circle(x,y,r,view){return bounds(x-r,y-r,x+r,y+r,view);}
  function mining(x,y,source,size,view){
    // Include the full beam, rotating rock, shield, seams, sparks and bloom.
    const margin=size+64;
    return bounds(Math.min(x,source.x)-margin,Math.min(y,source.y)-margin,
      Math.max(x,source.x)+margin,Math.max(y,source.y)+margin,view);
  }
  window.nativeEffectVisibility=Object.freeze({bounds,circle,mining});
})();
