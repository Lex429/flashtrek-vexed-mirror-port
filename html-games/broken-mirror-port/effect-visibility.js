/* Conservative bounds for drawing only; simulation continues outside the view. */
(() => {
  'use strict';
  function bounds(left,top,right,bottom,{w=Infinity,h=Infinity}={}){
    return !(right<0||bottom<0||left>w||top>h);
  }
  function circle(x,y,r,view){return bounds(x-r,y-r,x+r,y+r,view);}
  function segment(x1,y1,x2,y2,padding=0,view){
    return bounds(Math.min(x1,x2)-padding,Math.min(y1,y2)-padding,Math.max(x1,x2)+padding,Math.max(y1,y2)+padding,view);
  }
  function worldCircle(x,y,r,view){
    const zoom=view.zoom??1;
    return circle((view.cx??0)+(x-(view.ship?.x??0))*zoom,(view.cy??0)+(y-(view.ship?.y??0))*zoom,r*zoom,view);
  }
  function ship(descriptor,view,padding=64){
    const zoom=view.zoom??1,d=view.dimensions||descriptor.dimensions||{width:descriptor.radius*2||0,height:descriptor.radius*2||0};
    const radius=Math.max(Math.hypot(d.width,d.height)/2,descriptor.radii?.rx||0,descriptor.radii?.ry||0)+padding;
    const x=view.x??(view.cx??0)+(descriptor.x-(view.ship?.x??0))*zoom,y=view.y??(view.cy??0)+(descriptor.y-(view.ship?.y??0))*zoom;
    // Rotation, full native glow, shield flashes and warp stretch fit inside
    // this circle. There is no opaque-planet rejection: ships draw in front.
    return circle(x,y,radius*zoom*Math.max(1,view.warpEffect?.squeezeX||1),view);
  }
  function mining(x,y,source,size,view){
    // Include the full beam, rotating rock, shield, seams, sparks and bloom.
    const margin=size+64;
    return bounds(Math.min(x,source.x)-margin,Math.min(y,source.y)-margin,
      Math.max(x,source.x)+margin,Math.max(y,source.y)+margin,view);
  }
  window.nativeEffectVisibility=Object.freeze({bounds,circle,segment,worldCircle,ship,mining});
})();
