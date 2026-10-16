/* Individual ship animation profiles, mapped to their installed art. */
(() => {
  'use strict';
  const blue='#27caff',green='#80ff32',amber='#ffc52a';
  const circle=(x,y,r,color=blue)=>({x,y,r,color,kind:'core',shape:'circle'});
  const panel=(x,y,w,h,color=blue)=>({x,y,w,h,r:Math.max(w,h)*.55,color,kind:'core'});
  const tube=(x,y,h,color=blue)=>({x,y,h,r:12,color,kind:'core',shape:'tube'});
  const running=(x,y,color='#ff452b')=>({x,y,r:4,color,kind:'running',offSevere:true});
  const b=(x,y,r)=>({x,y,r});
  const site=(name,x,y)=>[name,x,y];
  const definitions={
    5:{width:256,height:512,lights:[tube(25,349,86),tube(230,349,86),panel(129,80,30,13),circle(25,232,13,'#ff4826'),circle(230,232,13,'#ff4826'),running(97,92,amber),running(159,92,amber)],
      damage:[[],[b(199,151,7),b(166,225,7),b(231,300,7)],
        [b(198,154,13),b(109,264,8),b(232,307,12),b(31,349,7)],
        [b(188,123,14),b(191,167,15),b(165,219,13),b(155,281,14),b(148,325,12),b(233,303,15),b(225,350,12),b(230,234,8)]],
      core:[129,149],sites:[site('forward sensor housing',129,80),site('port saucer',65,137),site('starboard saucer',191,137),site('reactor housing',129,151),site('port saucer rim',32,178),site('starboard saucer rim',224,178),site('engineering hull',129,258),site('aft hull',129,334),site('port pylon',74,302),site('starboard pylon',184,302),site('port nacelle cap',25,237),site('starboard nacelle cap',230,237),site('port nacelle',25,350),site('starboard nacelle',230,350),site('port engine end',25,437),site('starboard engine end',230,437)]},
    7:{width:315,height:512,lights:[tube(17,338,134),tube(298,338,134),panel(40,244,28,9,'#ff4826'),panel(274,244,28,9,'#ff4826'),running(105,73),running(209,73),running(39,401),running(275,401),running(124,260,amber),running(192,260,amber)],
      damage:[[],[b(188,220,8),b(240,274,6),b(281,344,6)],
        [b(191,136,12),b(206,243,14),b(104,221,8),b(253,358,11),b(241,276,6)],
        [b(195,129,15),b(212,72,9),b(208,242,16),b(105,218,12),b(226,363,15),b(183,438,14),b(298,346,8),b(20,348,8)]],
      core:[157,286],sites:[site('cockpit',157,86),site('left cabin',107,169),site('right cabin',203,169),site('cargo hull',157,268),site('aft hull',157,396),site('left nacelle',30,336),site('right nacelle',282,336),site('left cap',40,240),site('right cap',275,240),site('stern',157,466),site('left nacelle end',40,425),site('right nacelle end',275,425)]},
    10:{width:164,height:512,lights:[panel(21,375,5,54),panel(143,375,5,54),circle(38,317,7,'#ff4826'),circle(126,317,7,'#ff4826'),panel(82,143,21,6,'#bde9ff'),running(50,288),running(114,288),running(82,438,amber)],
      damage:[[],[b(85,180,6),b(55,340,7),b(129,423,6)],
        [b(84,183,10),b(95,280,9),b(48,354,10),b(127,420,9)],
        [b(85,178,14),b(94,272,13),b(76,389,12),b(43,351,14),b(126,425,13),b(83,466,11)]],
      core:[82,304],sites:[site('command bow',82,82),site('forward cabin',82,158),site('cargo spine',82,242),site('reactor housing',82,304),site('aft cargo hull',82,399),site('port nacelle cap',37,346),site('starboard nacelle cap',127,346),site('port nacelle',37,402),site('starboard nacelle',127,402),site('stern',82,474)]},
    6:{width:450,height:512,lights:[tube(40,316,126),tube(410,316,126),circle(224,253,11),circle(224,289,10),circle(38,180,11,amber),circle(412,180,11,amber)],
      damage:[[],[b(317,134,9),b(130,160,7),b(413,355,10),b(159,277,5)],
        [b(125,173,13),b(324,174,13),b(235,313,10),b(401,373,12),b(50,352,12)],
        [b(110,117,15),b(318,124,16),b(325,190,12),b(141,172,13),b(219,188,8),b(257,347,10),b(406,322,12),b(48,352,14)]],
      core:[224,253],sites:[site('bow',225,70),site('port canopy',130,155),site('starboard canopy',318,155),site('reactor housing',224,267),site('aft hull',225,365),site('port nacelle',40,320),site('starboard nacelle',410,320),site('port shoulder',41,183),site('starboard shoulder',410,183),site('port end',40,442),site('starboard end',410,442)]},
    39:{width:512,height:451,energyColor:amber,lights:[circle(255,56,11,amber),panel(255,399,52,17,amber),circle(208,263,9,amber),circle(302,262,9,amber),running(245,118,amber),running(267,118,amber),running(58,204,green),running(451,204,green)],
      damage:[[],[b(143,401,6),b(274,238,5)],
        [b(99,302,13),b(417,281,13),b(273,229,10),b(278,78,9),b(370,389,9)],
        [b(98,296,17),b(156,401,14),b(419,286,16),b(290,236,13),b(284,81,12),b(366,386,11)]],
      core:[255,399],sites:[site('command head',255,57),site('neck',255,147),site('central hull',255,250),site('port wing root',170,318),site('starboard wing root',345,318),site('engine housing',255,398),site('port wing',104,310),site('starboard wing',407,310),site('port tip',57,218),site('starboard tip',451,218),site('port aft',174,405),site('starboard aft',337,405)]},
    18:{width:358,height:512,energyColor:green,lights:[panel(83,124,16,63,green),panel(273,124,16,63,green),panel(27,245,30,22,green),panel(329,245,30,22,green),circle(179,338,7,green),running(91,311,green),running(264,311,green)],
      damage:[[],[b(133,254,8),b(216,290,6),b(223,367,6),b(239,411,6),b(330,161,7)],
        [b(68,101,13),b(289,80,12),b(271,185,13),b(234,253,12),b(113,313,12),b(239,388,12),b(103,422,11)],
        [b(71,106,16),b(296,85,15),b(324,155,12),b(270,200,15),b(269,270,13),b(112,310,16),b(231,391,15),b(106,429,13)]],
      core:[179,338],sites:[site('cockpit',179,157),site('port horn',69,100),site('starboard horn',289,100),site('port pod',33,246),site('starboard pod',325,246),site('reactor housing',179,330),site('port cargo hull',129,249),site('starboard cargo hull',226,249),site('port aft',114,406),site('starboard aft',245,406),site('stern',179,475),site('port horn tip',91,34),site('starboard horn tip',261,34)]},
    29:{width:417,height:512,energyColor:green,lights:[tube(30,199,154,green),tube(386,199,154,green),panel(186,300,6,62,green),panel(230,300,6,62,green),circle(207,20,9,green),circle(207,305,6,green),
        ...[[105,201],[129,233],[156,263],[259,264],[289,233],[306,202]].map(([x,y])=>circle(x,y,4,green))],
      damage:[[],[b(87,236,8),b(124,312,8),b(307,279,8),b(192,160,5)],
        [b(133,295,14),b(306,286,14),b(222,110,9),b(209,197,8),b(186,422,8)],
        [b(58,205,15),b(140,301,16),b(293,252,17),b(224,110,12),b(208,195,12),b(186,414,12),b(208,467,8)]],
      core:[207,305],sites:[site('command bow',207,59),site('forward hull',207,159),site('port wing root',144,243),site('starboard wing root',272,243),site('port wing',95,274),site('reactor hull',207,305),site('starboard wing',320,274),site('port nacelle',30,200),site('starboard nacelle',386,200),site('aft hull',207,393),site('stern',207,478),site('port tip',30,103),site('starboard tip',386,103)]},
    25:{width:368,height:512,lights:[tube(184,103,57),tube(184,208,38),tube(184,452,64),panel(65,367,72,4),panel(301,367,72,4),circle(183,322,5),panel(110,232,7,19),panel(257,232,7,19),tube(120,139,34),tube(248,139,34)],
      damage:[[],[b(100,369,8),b(274,352,8),b(135,217,8)],
        [b(142,94,10),b(134,199,12),b(183,269,13),b(245,288,12),b(92,361,13),b(271,357,13)],
        [b(141,98,13),b(134,199,14),b(218,144,12),b(184,267,16),b(245,293,14),b(127,324,13),b(92,362,16),b(273,359,16),b(184,424,9)]],
      core:[184,267],sites:[site('bow',184,52),site('port shoulder',133,151),site('starboard shoulder',236,151),site('port hull',132,274),site('starboard hull',236,274),site('reactor housing',184,266),site('port crossbar',56,365),site('starboard crossbar',312,365),site('crossbar center',184,363),site('stern',184,447),site('bow tip',184,12),site('port crossbar end',17,365),site('starboard crossbar end',350,365)]},
    16:{width:436,height:512,energyColor:amber,lights:[circle(218,161,11,amber),circle(216,385,7,amber),panel(218,50,5,13,amber),panel(218,102,12,4,amber),panel(218,217,21,5,amber),panel(218,248,5,8,amber),running(143,104,amber),running(295,104,amber)],
      damage:[[],[b(96,133,8),b(329,143,7),b(171,273,7),b(271,294,7),b(163,468,6)],
        [b(71,139,14),b(310,85,12),b(340,146,10),b(264,263,12),b(170,320,10),b(272,423,11),b(161,465,8)],
        [b(137,74,13),b(71,147,17),b(308,80,14),b(349,157,18),b(263,295,14),b(170,265,12),b(162,437,12),b(272,451,12)]],
      core:[218,161],sites:[site('bow',218,48),site('port wing',85,139),site('starboard wing',351,139),site('port shoulder',145,98),site('starboard shoulder',290,98),site('reactor housing',218,163),site('port hull',171,269),site('starboard hull',265,269),site('engineering hull',218,325),site('aft reactor',216,386),site('port tail',155,440),site('starboard tail',278,440),site('port wingtip',31,197),site('starboard wingtip',404,197)]},
    44:{width:512,height:503,energyColor:green,offTint:'green',shifts:[0,-4,-8,-4],lights:[circle(52,39,13,green),circle(323,68,13,green),circle(87,218,11,green),circle(465,178,11,green),panel(374,298,13,26,green),circle(309,418,9,green),
        ...[[157,112],[112,170],[336,254],[206,314],[81,441],[454,403],[229,192],[278,131],[397,361],[37,376]].map(([x,y])=>({x,y,r:3,kind:'window',color:green,offSevere:true}))],
      damage:[[],[b(181,108,14),b(318,172,9),b(135,356,13),b(265,270,11)],
        [b(173,114,20),b(331,167,20),b(256,310,21),b(119,364,22),b(194,64,12),b(372,413,10)],
        [b(168,116,25),b(323,158,25),b(137,346,24),b(268,310,25),b(246,257,14),b(438,93,18),b(414,447,20)]],
      core:[256,251],sites:[site('upper left lattice',65,65),site('upper center lattice',255,65),site('upper right lattice',445,65),site('left mid lattice',65,210),site('right mid lattice',445,210),site('central reactor lattice',255,250),site('left lower lattice',65,365),site('right lower lattice',445,365),site('lower center lattice',255,430),site('left corner',26,465),site('right corner',478,465),site('upper central fragment',185,143),site('lower central fragment',317,332)]}
  };
  window.starterShips=new Map(Object.entries(definitions).map(([id,d])=>{
    const offRegions=d.lights.filter(p=>p.kind==='core'||p.offSevere).map(p=>p.shape==='circle'||p.kind==='running'?{x:p.x,y:p.y,r:p.r+3}:
      {x:p.x,y:p.y,w:p.shape==='tube'?21:(p.w||24)+6,h:(p.h||6)+6});
    const effects=window.createShowcaseEffects({...d,offRegions});
    return [Number(id),{...d,effects,breakAnchors:d.damage[3].map(p=>[p.x,p.y]),
      destruction:{sites:d.sites,core:d.core,coreIndex:d.sites.findIndex(s=>s[0].includes('reactor')||s[0].includes('engine housing')),energyColor:d.energyColor},
      align:(im,stage)=>{if(!d.shifts||im.starterAligned)return im;const c=document.createElement('canvas');c.width=d.width;c.height=d.height;c.getContext('2d').drawImage(im,d.shifts[stage],0);c.starterAligned=true;return c;}}];
  }));
})();
