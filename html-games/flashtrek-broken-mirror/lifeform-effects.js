/* Sentient Lifeform: travelling circulation, soft pod ripples and lobe rupture.
   Its textures and breakup cache are separate from the Alien Bioship. */
(() => {
  'use strict';
  const config={width:294,height:512,vascular:true,ruptureMs:1100,organIndex:6,
    wounds:[[],[[83,142,18]],[[84,144,23],[246,278,26]],
      [[80,143,30],[143,188,16],[245,285,35],[92,398,30]]],
    organs:[[127,171,9],[177,205,8],[104,242,10],[177,286,11],[123,339,10],[159,395,9]],
    sites:[[147,47],[109,124],[189,126],[83,203],[163,209],[229,225],
      [147,285],[67,313],[228,327],[108,387],[187,401],[147,465]]};
  const biology=window.createBiologicalShipEffects(config);
  window.lifeformEffects=biology;
  window.starterShips.set(50,{width:config.width,height:config.height,biological:true,
    effects:biology.effects,biology,align:im=>im,breakAnchors:config.wounds[3].map(([x,y])=>[x,y])});
})();
