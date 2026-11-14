/* Uniform scene scaling; wider windows reveal extra space. */
(() => {
  'use strict';
  const stage=document.getElementById('game');
  let layoutVersion=0;
  const fitted=new WeakMap(),sizes=new ResizeObserver(entries=>{for(const entry of entries)fitted.delete(entry.target);});
  let mode=localStorage.getItem('vexed-display-view')==='classic'?'classic':'widescreen';
  function fromRect(rect){
    const scale=Math.max(.001,Math.min(rect.width/600,rect.height/450));
    const toolbar=document.querySelector('body > footer')?.getBoundingClientRect();
    return {w:rect.width/scale,h:rect.height/scale,scale,safeBottom:toolbar?Math.max(0,Math.min(toolbar.height,rect.bottom-toolbar.top))/scale:0};
  }
  function measure(element=stage){return fromRect(element.getBoundingClientRect());}
  function canvasLayout(canvas){
    const density=devicePixelRatio||1;
    let cached=fitted.get(canvas);
    if(!cached||cached.version!==layoutVersion||cached.density!==density){
      const rect=canvas.getBoundingClientRect();cached={rect,view:fromRect(rect),density,version:layoutVersion};
      fitted.set(canvas,cached);sizes.observe(canvas);
    }
    return cached;
  }
  function fit(canvas,ctx){
    const cached=canvasLayout(canvas);
    const {rect,view}=cached;
    const pixels=Math.max(1,rect.width*rect.height);
    const d=Math.min(devicePixelRatio||1,2,Math.sqrt(4000000/pixels));
    const width=Math.max(1,Math.round(rect.width*d)),height=Math.max(1,Math.round(rect.height*d));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.setTransform(canvas.width/view.w,0,0,canvas.height/view.h,0,0);return view;
  }
  function sync(){
    layoutVersion++;
    const view=measure();
    for(const [key,value] of Object.entries({'game-scale':view.scale,'classic-width':600*view.scale+'px','classic-height':450*view.scale+'px','hud-width':282*view.scale+'px','hud-height':43*view.scale+'px'}))stage.style.setProperty('--'+key,String(value));
    dispatchEvent(new CustomEvent('native-displaychange'));
  }
  function setView(value){mode=value==='classic'?'classic':'widescreen';document.body.dataset.view=mode;localStorage.setItem('vexed-display-view',mode);sync();}
  async function choose(value){
    if(value==='fullscreen'){setView('widescreen');if(!document.fullscreenElement)await document.documentElement.requestFullscreen();}
    else{if(document.fullscreenElement)await document.exitFullscreen();setView(value==='classic'?'classic':'widescreen');}
    sync();
  }
  function pixelRatio(canvas){const cached=fitted.get(canvas);return cached&&cached.version===layoutVersion&&cached.density===(devicePixelRatio||1)?canvas.width/Math.max(1,cached.rect.width):null;}
  window.nativeView={measure,fit,pixelRatio,choose,get mode(){return mode;},get selection(){return document.fullscreenElement?'fullscreen':mode==='classic'?'classic':'windowed';}};
  document.body.dataset.view=mode;const layout=new ResizeObserver(sync);layout.observe(stage);const toolbar=document.querySelector('body > footer');if(toolbar)layout.observe(toolbar);addEventListener('resize',sync);document.addEventListener('fullscreenchange',sync);sync();
})();
