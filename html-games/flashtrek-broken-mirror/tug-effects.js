/* Constellation Tug: 278 x 512 art, twin blue nacelle lamps. */
(() => {
  'use strict';
  const breach=(x,y,r)=>({x,y,r});
  const leftBow=breach(72,117,12),rightRim=breach(225,211,15),leftRim=breach(29,200,13),
    rightBow=breach(215,132,13),rightTube=breach(185,335,11);
  const lights=[{x:98,y:350,r:18,kind:'core'},{x:183,y:350,r:18,kind:'core'},
    ...[[140,80],[53,131],[225,130],[32,227],[250,232],[83,275],[201,275]].map(([x,y])=>({x,y,r:3,kind:'window',color:'#d8edff'})),
    {x:98,y:295,r:5,kind:'running',color:'#52d7ff',offSevere:true},
    {x:183,y:295,r:5,kind:'running',color:'#52d7ff',offSevere:true}];
  const damage=[[],[leftBow],[leftBow,rightRim],
    [leftBow,rightRim,leftRim,rightBow,rightTube,breach(48,223,9),breach(254,238,9)]];
  const offRegions=[{x:98,y:350,w:25,h:99},{x:183,y:350,w:25,h:99},
    {x:98,y:295,r:10},{x:183,y:295,r:10}];
  window.tugEffects=window.createShowcaseEffects({width:278,coreShape:'tube',lights,damage,offRegions});
  window.tugDestructionConfig={core:[98,350],coreIndex:5,sites:[
    ['forward saucer',140,106],['left saucer',48,174],['right saucer',237,174],
    ['bridge',140,192],['aft saucer',141,264],['left nacelle',98,350],
    ['right nacelle',183,350],['central tug hull',140,350],['neck',141,242],
    ['left nacelle cap',98,298],['right nacelle cap',183,298],
    ['left nacelle end',98,417],['right nacelle end',183,417]]};
  window.alignTugFrame=(image,stage)=>{
    if(image.tugAligned)return image;
    const c=document.createElement('canvas');c.width=278;c.height=512;
    c.getContext('2d').drawImage(image,[0,0,3,5][stage],0);c.tugAligned=true;return c;
  };
  window.tugBreakAnchors=damage[3].map(p=>[p.x,p.y]);
})();
