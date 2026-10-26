/* Reuse each hull's measured structural anchors, adding torn seams and chips.
   Galaxy retains its reviewed saucer/pylon layout. No width-changing motion. */
(() => {
  'use strict';
  const ids=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,33,34,35,36,37,38,45,46,47,49,56,57,58,60,39,40,41,42,43,61,27,28,29,53,64,25,26,59,63,16,31,32,62,17,18,19,30,48,65,20,66,21,22,51,23,24,52,54];
  const configs=new Map();
  for(const id of ids){
    const original=(id===59?{core:[181,362],coreIndex:5,energyColor:"#27caff",sites:[["bow",181,100],["left arm",78,209],["right arm",285,209],["left crossbar",60,313],["right crossbar",305,313],["reactor housing",181,361],["lower left hull",100,431],["lower right hull",262,431],["stern",181,461],["bow chip",181,36],["left edge fragment",12,303],["right edge fragment",350,303],["stern chip",181,479]]}:null)||window.starterShips.get(id)?.destruction||(id===56?window.constitutionTugDestructionConfig:id===57?window.tugDestructionConfig:window.olympicDestructionConfig);
    if(id===35){configs.set(id,{...original,farTravel:true});continue;}
    const anchors=original.sites,sites=anchors.map(p=>[...p]),chips=[];
    // Small plates peel from seams between neighboring structural sections.
    for(let i=0;i<Math.min(12,anchors.length);i++){
      const a=anchors[i];let next=null,distance=Infinity;
      for(const b of anchors){const d=(a[1]-b[1])**2+(a[2]-b[2])**2;if(b!==a&&d>100&&d<distance){distance=d;next=b;}}
      if(!next)continue;
      const chip={x:(a[1]+next[1])/2,y:(a[2]+next[2])/2,r:3+i%3};
      if(chips.some(p=>Math.hypot(p.x-chip.x,p.y-chip.y)<9))continue;
      chips.push(chip);sites.push(['torn hull chip '+chips.length,chip.x,chip.y]);
    }
    const partition=window.createTornHullPartition({id,anchors,chips});
    configs.set(id,{...original,sites,partition,structural:true,farTravel:true});
  }
  window.fleetFractureConfigs=configs;
  window.earthFractureConfigs=configs;
})();
