/* Olympic anchors use aligned 201 x 512 supplied artwork. */
(() => {
  'use strict';
  const breach=(x,y,r)=>({x,y,r});
  const headRight=breach(151,99,11),headLower=breach(146,161,12),neck=breach(127,246,12),
    headLeft=breach(60,140,12),cap=breach(183,220,10),nacelle=breach(180,271,10);
  const lights=[
    {x:120,y:310,r:17,kind:'core'},
    {x:120,y:207,r:7,kind:'running',color:'#ff3024',offSevere:true},
    {x:55,y:219,r:9,kind:'running',color:'#ff3024',offSevere:true},
    {x:186,y:219,r:9,kind:'running',color:'#ff3024',offSevere:true},
    {x:55,y:386,r:6,kind:'running',color:'#ffc52a',offSevere:true},
    {x:186,y:386,r:6,kind:'running',color:'#ffc52a',offSevere:true},
    ...[[85,93],[111,81],[153,106],[169,138],[149,181],[75,169],[65,130]].map(([x,y])=>({x,y,r:3,kind:'window',color:'#ffe9bd'}))
  ];
  const damage=[[],[headRight],[headRight,headLower,neck],
    [headRight,headLower,neck,headLeft,cap,nacelle,breach(78,86,7),breach(147,135,9)]];
  const offRegions=[{x:120,y:310,w:34,h:20},{x:120,y:207,w:25,h:9},
    {x:55,y:219,r:11},{x:186,y:219,r:11},{x:55,y:386,r:8},{x:186,y:386,r:8}];
  window.olympicEffects=window.createShowcaseEffects({width:201,lights,damage,offRegions});
  window.olympicDestructionConfig={core:[120,310],coreIndex:5,sites:[
    ['forward sphere',119,91],['left sphere shell',67,138],['right sphere shell',170,138],
    ['neck',120,223],['left pylon',81,254],['engineering hull',120,315],
    ['right pylon',157,254],['left nacelle',55,304],['right nacelle',186,304],
    ['aft hull',120,415],['left nacelle cap',55,219],['right nacelle cap',186,219],
    ['left nacelle end',55,384],['right nacelle end',186,384]]};
  // Exact painted-pixel masks are prepared by earth-effects.js, using the same
  // aligned frames and damage anchors as the showcase and live medical ship.
  const painted=lights.map(p=>{
    const core=p.kind==='core',radius=Math.ceil(p.r),left=core?107:Math.max(0,p.x-radius),top=core?301:Math.max(0,p.y-radius),
      w=core?27:Math.min(201-left,radius*2+1),h=core?13:Math.min(512-top,radius*2+1);
    const runs=Array.from({length:h},(_,y)=>core&&(y===0||y===h-1)?[y,1,w-2]:[y,0,w]);
    return {...p,left,top,w,h,runs,added:p.kind==='core',hotScale:0,color:p.color||'#27caff',
      tint:core?'lens':p.color==='#ff3024'?'red':'amber'};
  });
  window.olympicAnimationProfile={width:201,height:512,lights:painted,damage,
    shifts:[[0,0],[8,0],[18,0],[41,0]],core:[120,310],sites:window.olympicDestructionConfig.sites,energyColor:'#27caff'};
  window.alignOlympicFrame=(image,stage)=>{
    if(image.olympicAligned)return image;
    const c=document.createElement('canvas');c.width=201;c.height=512;
    c.getContext('2d').drawImage(image,[0,8,18,41][stage],0);c.olympicAligned=true;return c;
  };
  window.olympicBreakAnchors=damage[3].map(p=>[p.x,p.y]);
})();
