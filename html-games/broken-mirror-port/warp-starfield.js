/* Stars pass from the bow to the stern in fixed, parallel depth layers. */
(() => {
  'use strict';
  let fieldSerial=0;
  function visualRandom(){
    // Resizing, heading and delivered paints determine star respawns. Their
    // random stream must never advance the authoritative gameplay generator.
    let seed=(0x57415250+Math.imul(++fieldSerial,0x9e3779b9))>>>0;
    return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  }
  function create(width = 600, height = 450, random = visualRandom()) {
    const margin = 100;
    const layers = [
      {count:150, speed:18, length:.7, width:.45, alpha:.24},
      {count:95, speed:54, length:2.4, width:.55, alpha:.36},
      {count:50, speed:125, length:9, width:.75, alpha:.54},
      {count:25, speed:270, length:28, width:1.05, alpha:.76},
      {count:12, speed:530, length:64, width:1.45, alpha:.94}
    ];
    const stars = layers.flatMap(layer => Array.from({length:layer.count}, () => ({
      x:random()*(width+margin*2)-margin,
      y:random()*(height+margin*2)-margin,
      speed:layer.speed*(.8+random()*.4),
      length:layer.length*(.75+random()*.5),
      width:layer.width, alpha:layer.alpha*(.8+random()*.2),
      color:random()<.08?'#f1e9d9':random()<.4?'#c8dfef':'#e3edf5',
      phase:random()*Math.PI*2
    })));
    let elapsed=0;
    function draw(ctx, dt, angle = 0, reducedMotion = false) {
      elapsed+=dt;
      const dx = -Math.sin(angle), dy = Math.cos(angle);
      ctx.save();ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
      ctx.lineCap='round';
      for (const star of stars) {
        const distance = dt*star.speed*(reducedMotion?.12:1);
        star.x += dx*distance;star.y += dy*distance;
        if(star.y>height+margin+star.length){star.y=-margin;star.x=random()*(width+margin*2)-margin;}
        if(star.y<-margin-star.length){star.y=height+margin;star.x=random()*(width+margin*2)-margin;}
        if(star.x>width+margin)star.x-=width+margin*2;
        if(star.x<-margin)star.x+=width+margin*2;
        const length=reducedMotion?Math.min(2,star.length):star.length;
        const tailX=star.x-dx*length,tailY=star.y-dy*length;
        ctx.globalAlpha=star.alpha*(.94+.06*Math.sin(elapsed*.8+star.phase));
        ctx.strokeStyle=star.color;ctx.lineWidth=star.width;
        if(length>3){
          const trail=ctx.createLinearGradient(tailX,tailY,star.x,star.y);
          trail.addColorStop(0,'#00000000');trail.addColorStop(.55,star.color);trail.addColorStop(1,'#f1f5fa');
          ctx.strokeStyle=trail;
        }
        ctx.beginPath();ctx.moveTo(tailX,tailY);ctx.lineTo(star.x,star.y);ctx.stroke();
      }
      ctx.restore();
    }
    function resize(nextWidth,nextHeight){
      if(width===nextWidth&&height===nextHeight)return;
      for(const star of stars){star.x=(star.x+margin)*(nextWidth+margin*2)/(width+margin*2)-margin;star.y=(star.y+margin)*(nextHeight+margin*2)/(height+margin*2)-margin;}
      width=nextWidth;height=nextHeight;
    }
    return {draw,resize};
  }
  window.vexedWarpStarfield = {create};
})();
