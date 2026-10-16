/* Constitution Tug anchors measured on the 254 x 512 remastered hull. */
(() => {
  'use strict';
  const b=(x,y,r)=>({x,y,r});
  const early=[b(54,94,6),b(180,94,6),b(202,123,6),b(35,157,6),b(56,203,6),b(184,205,6),b(217,318,5)];
  const heavy=[b(54,97,9),b(38,180,14),b(200,88,15),b(199,198,14),b(120,203,6),b(34,370,8),b(217,391,11),b(205,287,7)];
  const severe=[b(78,71,14),b(30,132,12),b(43,204,13),b(215,131,16),b(207,207,16),b(119,199,7),b(142,337,6),b(35,340,14),b(213,315,15),b(218,392,13)];
  const lights=[
    {x:127,y:232,r:11,kind:'core',shape:'circle'},
    {x:127,y:334,r:7,kind:'core'},
    {x:46,y:366,r:15,h:159,kind:'core',shape:'tube'},
    {x:207,y:366,r:15,h:159,kind:'core',shape:'tube'},
    {x:127,y:263,r:6,kind:'running',color:'#ff3024',offSevere:true},
    ...[[46,70],[208,70],[13,146],[239,146],[37,212],[220,211],[81,248],[177,248]].map(([x,y])=>({x,y,r:3,kind:'window',color:'#ffbe54'}))
  ];
  const offRegions=[{x:127,y:232,r:14},{x:127,y:334,w:22,h:21},{x:127,y:263,w:23,h:9},
    {x:46,y:366,w:17,h:170},{x:207,y:366,w:17,h:170}];
  window.constitutionTugEffects=window.createShowcaseEffects({width:254,lights,damage:[[],early,heavy,severe],offRegions});
  window.constitutionTugBreakAnchors=severe.map(p=>[p.x,p.y]);
  window.constitutionTugDestructionConfig={core:[127,232],coreIndex:5,sites:[
    ['forward saucer',127,57],['left saucer',39,134],['right saucer',212,134],
    ['bridge dome',127,142],['aft saucer',127,216],['reactor housing',127,232],
    ['engineering hull',127,323],['left pylon',82,318],['right pylon',173,318],
    ['left nacelle',37,366],['right nacelle',216,366],['left nacelle cap',37,264],
    ['right nacelle cap',216,264],['left nacelle end',37,467],['right nacelle end',216,467],['stern',127,358]]};
})();
