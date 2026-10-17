/* Frozen c41559c lighting/warp renderer for pixel regression comparisons. */
window.referenceFlightRenderer=()=>{
 const warpShipCanvas=document.createElement("canvas"),warpShipContext=warpShipCanvas.getContext("2d");
 const litShipCanvas=document.createElement("canvas"),litShipContext=litShipCanvas.getContext("2d");
  function drawShip(ctx, asset, x, y, width, angle, time, appearance = {}) {
    if (!asset) return;
    const height = appearance.height ?? width * asset.height / asset.width;
    const fading = appearance.kind && asset.profile;
    if (fading) {
      const pad = 32, cw = asset.width + pad*2, ch = asset.height + pad*2;
      if(warpShipCanvas.width!==cw||warpShipCanvas.height!==ch){warpShipCanvas.width=cw;warpShipCanvas.height=ch;}
      warpShipContext.clearRect(0,0,cw,ch);
      warpShipContext.drawImage(asset.art,pad,pad);
      asset.profile.effects.draw(warpShipContext,{x:cw/2,y:ch/2,w:asset.width,h:asset.height},0,asset.damageStage,time,
        {lights:appearance.lights !== false,damage:appearance.damage !== false,lightGain:appearance.lightGain??2.8,lightBloom:appearance.lightBloom??2.5});
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);ctx.rotate(angle);ctx.scale(appearance.squeezeX ?? 1, 1);
    ctx.globalAlpha *= appearance.alpha ?? 1;
    const cached=!fading&&!appearance.light&&asset.profile&&window.nativeShipSpriteCache?.draw(ctx,asset,width,height,time,appearance);
    if(fading){const px=32*width/asset.width,py=32*height/asset.height;ctx.drawImage(warpShipCanvas,-width/2-px,-height/2-py,width+px*2,height+py*2);}
    else if(!cached)ctx.drawImage(asset.art, -width / 2, -height / 2, width, height);
    if(appearance.light){
      const source=appearance.light,tint=Number(source.color);
      const direction=Math.atan2(source.y-y,source.x-x)-angle,ux=Math.cos(direction),uy=Math.sin(direction);
      const extent=Math.max(asset.width,asset.height),bright=appearance.warpPulse?Math.min(.34,.22+appearance.warpPulse*.12):.22;
      if(litShipCanvas.width!==asset.width||litShipCanvas.height!==asset.height){litShipCanvas.width=asset.width;litShipCanvas.height=asset.height;}
      litShipContext.clearRect(0,0,asset.width,asset.height);
      litShipContext.drawImage(asset.art,0,0,asset.width,asset.height);
      litShipContext.globalCompositeOperation='source-in';
      const gradient=litShipContext.createLinearGradient(asset.width/2+ux*extent*.55,asset.height/2+uy*extent*.55,asset.width/2-ux*extent*.55,asset.height/2-uy*extent*.55);
      const rgb=`${tint>>16&255},${tint>>8&255},${tint&255}`;
      gradient.addColorStop(0,`rgba(${rgb},${bright})`);gradient.addColorStop(.54,`rgba(${rgb},.035)`);gradient.addColorStop(1,`rgba(${rgb},0)`);
      litShipContext.fillStyle=gradient;litShipContext.fillRect(0,0,asset.width,asset.height);
      litShipContext.globalCompositeOperation='source-over';
      ctx.drawImage(litShipCanvas,-width/2,-height/2,width,height);
    }
    if(!fading&&!cached)asset.profile?.effects.draw(ctx, {x:0, y:0, w: width, h: height}, 0, asset.damageStage, time,
      {lights: appearance.lights !== false, damage: appearance.damage !== false, lightGain: appearance.lightGain??2.8, lightBloom: appearance.lightBloom??2.5});
    ctx.restore();
  }

return drawShip;
};
