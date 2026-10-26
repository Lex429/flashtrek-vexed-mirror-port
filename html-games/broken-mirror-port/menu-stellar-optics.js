/* Exposure response for the menu camera. Full obstruction always cuts optical
   energy immediately; adaptation changes gain, never the source position. */
(() => {
  'use strict';
  function create(){
    let initialized=false,exposure=0,gain=1;
    return {update(visibility,dt,instant=false){
      const visible=Math.max(0,Math.min(1,visibility)),targetGain=1-.13*Math.sqrt(visible);
      if(!initialized||instant){exposure=visible;gain=targetGain;initialized=true;}
      else{
        exposure+=(visible-exposure)*(1-Math.exp(-Math.max(0,dt)/.055));
        gain+=(targetGain-gain)*(1-Math.exp(-Math.max(0,dt)/(targetGain<gain?.22:.36)));
      }
      // A narrow exposed crescent concentrates the edge glint. Its position
      // comes from the exposed-source centroid sampled by the renderer.
      const edgeGlint=Math.pow(visible,.35)*Math.pow(1-visible,1.4)*2.1;
      return {visibility:visible,exposure,effectiveVisibility:Math.min(visible,exposure),cameraGain:gain,edgeGlint};
    }};
  }
  const api=Object.freeze({create});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.nativeMenuStellarOptics=api;
})();
