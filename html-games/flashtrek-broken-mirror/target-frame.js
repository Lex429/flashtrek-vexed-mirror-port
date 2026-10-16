/* The showcase target frame, shared with the playable flight scene. */
(() => {
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  window.drawShowcaseTargetFrame=(ctx,{x,y,w,h,name,kind='ENEMY',color='#ff7777',shield=0,hull=1,shieldColor='#50d5ff',zoom=1,rightEdge=885})=>{
    const unit=1/zoom;
    const radius=Math.max(32*unit,Math.hypot(w,h)*.41),r=radius+8*unit,corner=Math.max(12*unit,r*.32);
    const meterWidth=clamp(radius*1.35,74*unit,180*unit),meterX=x-meterWidth/2,meterY=y+radius+8*unit;
    const labelText=name.length>20?name.slice(0,19)+'.':name;
    const labelWidth=Math.max(112*unit,Math.min(156*unit,(labelText.length*7.2+10)*unit));
    const labelX=x+radius+16*unit+labelWidth<rightEdge?x+radius+16*unit:x-radius-16*unit-labelWidth;
    const labelY=y-radius-8*unit;
    ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.lineWidth=1.8*unit;ctx.shadowColor=color;ctx.shadowBlur=8;
    ctx.beginPath();ctx.moveTo(-r,-r+corner);ctx.lineTo(-r,-r);ctx.lineTo(-r+corner,-r);
    ctx.moveTo(r-corner,-r);ctx.lineTo(r,-r);ctx.lineTo(r,-r+corner);
    ctx.moveTo(r,r-corner);ctx.lineTo(r,r);ctx.lineTo(r-corner,r);
    ctx.moveTo(-r+corner,r);ctx.lineTo(-r,r);ctx.lineTo(-r,r-corner);ctx.stroke();ctx.restore();
    ctx.save();ctx.fillStyle='rgba(4,10,20,.78)';ctx.fillRect(meterX,meterY,meterWidth,4*unit);ctx.fillRect(meterX,meterY+6*unit,meterWidth,5*unit);
    ctx.fillStyle=shieldColor;ctx.fillRect(meterX,meterY,meterWidth*clamp(shield,0,1),4*unit);
    ctx.fillStyle=hull>.45?'#9cffb4':'#ff7777';ctx.fillRect(meterX,meterY+6*unit,meterWidth*clamp(hull,0,1),5*unit);
    ctx.strokeStyle=color;ctx.globalAlpha=.78;ctx.lineWidth=1*unit;ctx.beginPath();
    ctx.moveTo(x+(labelX>x?radius:-radius)*.58,y-radius*.58);
    ctx.lineTo(labelX+(labelX>x?-6*unit:labelWidth+6*unit),labelY+12*unit);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle='rgba(4,10,20,.72)';ctx.fillRect(labelX-2*unit,labelY-13*unit,labelWidth+4*unit,30*unit);
    ctx.textAlign='start';ctx.fillStyle=color;ctx.font=`${11*unit}px system-ui`;ctx.fillText(labelText,labelX+4*unit,labelY);
    ctx.fillStyle='rgba(223,234,255,.82)';ctx.font=`${9*unit}px system-ui`;ctx.fillText(kind.toUpperCase()+' TARGET',labelX+4*unit,labelY+12*unit);ctx.restore();
  };
})();
