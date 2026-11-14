/* Reference lengths for the read-only Federation scale atlas. No gameplay overrides. */
(() => {
  'use strict';
  const magazine=(file,title,notes='')=>({title:'Official Starships Collection · '+title,
    url:'https://www.wixiban.com/downloads/'+file,kind:'licensed',notes});
  const official=(url,title)=>({url,title,kind:'official'});
  const ds9={title:'Deep Space Nine Technical Manual · starship specifications',
    url:'https://engineering.thetafleet.net/Journals/DS9/Franchise%20-%20Star%20Trek%20Deep%20Space%20Nine%20Technical%20Manual%20.pdf',kind:'licensed'};
  const ds9Article=official('https://www.startrek.com/news/deep-cut-ds9-25th-anniversary-ships','StarTrek.com · DS9 anniversary ships');
  const references={
    steamrunner:{name:'Steamrunner',meters:356,source:magazine('em-mags-regular/reg-mag-054-steamrunner-class.pdf','Steamrunner, issue 54')},
    excelsior:{name:'Excelsior',meters:467,source:magazine('em-mags-xl/xl-mag-15-uss-excelsior-ncc-2000.pdf','Excelsior, XL 15')},
    miranda:{name:'Miranda',meters:277.76,source:{...ds9,title:'DS9 Technical Manual · p. 154',url:ds9.url+'#page=164'},notes:'Reference choice: DS9 Technical Manual, 277.76 m. The licensed Reliant issue instead lists 233 m.'},
    nebula:{name:'Nebula',meters:442,source:official('https://www.startrek.com/news/inside-the-nebula-class-starship','StarTrek.com · Nebula class')},
    nova:{name:'Nova',meters:222,source:official('https://www.startrek.com/news/inside-the-u-s-s-equinox-ncc-72381','StarTrek.com · U.S.S. Equinox'),approximate:true},
    saber:{name:'Saber',meters:223,source:magazine('em-mags-regular/reg-mag-056-saber-class.pdf','Saber, issue 56'),approximate:true},
    danube:{name:'Danube',meters:23.1,source:ds9Article},
    centaur:{name:'Centaur',meters:210,source:magazine('em-mags-regular/reg-mag-052-uss-centaur.pdf','Centaur, issue 52'),notes:'Licensed collection choice: 210 m. Other publications scale this design differently.'},
    ambassador:{name:'Ambassador',meters:520,source:magazine('em-mags-regular/reg-mag-046-uss-enterprise-ncc-1701-c.pdf','Enterprise-C, issue 46'),
      supportingSources:[{title:'Ex Astris Scientia · Encyclopedia alternative of 526 m',url:'https://www.ex-astris-scientia.org/schematics/size-annotations.htm'}],
      notes:'Reference choice: the linked licensed issue specifies 520 m. Ex Astris Scientia reports 526 m from the Star Trek Encyclopedia; both values are documented alternatives.'},
    akira:{name:'Akira',meters:464.43,source:ds9Article},
    defiant:{name:'Defiant',meters:170.68,source:ds9Article,notes:'StarTrek.com specifies 170.68 m. Production shots and other publications also use smaller scales.'},
    galaxy:{name:'Galaxy',meters:642.51,source:{...ds9,title:'DS9 Technical Manual · p. 151',url:ds9.url+'#page=161'}},
    intrepid:{name:'Intrepid',meters:343,source:official('https://www.startrek.com/news/celebrating-the-ships-of-the-line-uss-voyager-ncc-74656','StarTrek.com · U.S.S. Voyager')},
    prometheus:{name:'Prometheus',meters:415,source:magazine('em-mags-xl/xl-mag-30-uss-prometheus-nx-59650.pdf','Prometheus, XL 30'),notes:'The licensed XL issue specifies 415 m; the supplied comparison rounded to about 414 m.'},
    sovereign:{name:'Sovereign',meters:685,source:official('https://www.startrek.com/news/celebrating-the-ships-of-the-line-ncc-1701-e','StarTrek.com · Enterprise-E')},
    newOrleans:{name:'New Orleans',meters:340,source:magazine('em-mags-regular/reg-mag-095-new-orleans-class.pdf','New Orleans, issue 95'),approximate:true},
    olympic:{name:'Olympic',meters:320,source:magazine('em-mags-regular/reg-mag-042-uss-pasteur.pdf','U.S.S. Pasteur, issue 42')},
    constitution:{name:'Constitution · original series',meters:288.6,source:{...official('https://www.smithsonianmag.com/blogs/air-space-museum/2024/06/10/get-a-closer-look-at-the-star-trek-enterprise-model/','Smithsonian · original Enterprise'),kind:'museum'},
      notes:'Original television Enterprise counterpart, rounded from the Smithsonian’s 947 ft. This is not the movie refit or Enterprise-A.'},
    nx:{name:'NX',meters:225,source:magazine('em-mags-regular/reg-mag-004-enterprise-nx-01.pdf','Enterprise NX-01, issue 4')},
    delta:{name:'Delta Flyer',meters:21,source:magazine('em-mags-regular/reg-mag-038-delta-flyer.pdf','Delta Flyer, issue 38')},
    type9:{name:'Type-9 shuttle · estimated match',meters:8.5,approximate:true,
      source:{title:'Ex Astris Scientia · Type-9 length reference',url:'https://www.ex-astris-scientia.org/schematics/size-annotations.htm#shuttles',kind:'provisional'},
      supportingSources:[official('https://www.startrek.com/news/eaglemoss-adds-four-shuttlecraft-to-starships-collection','StarTrek.com · Voyager’s Type-9 shuttle')],
      notes:'Estimated artwork match: the game’s Class 9 Shuttle resembles Voyager’s Type-9. Use approximately 8.5 m provisionally. StarTrek.com identifies the shuttle design but does not state this length; Ex Astris Scientia supplies the length, attributed to Star Trek Fact Files.'},
    galaxyFuture:{name:'Future Galaxy · estimated match',meters:641,approximate:true,
      source:{...magazine('em-mags-xl/xl-mag-20-future-uss-enterprise-ncc-1701-d.pdf','Future Enterprise-D, XL 20'),kind:'provisional'},
      notes:'Closest artwork match: the three-nacelle future Enterprise-D from All Good Things…. Its licensed XL guide specifies 641 m. The game’s Galaxy Dreadnaught is treated as a provisional match to that configuration.'},
    sagan:{name:'Sagan',meters:540.7,source:{title:'DITL · production-designer reference for Sagan',url:'https://www.ditl.org/ship-page.php?ClassID=fedsagan&ListID=ListLists',kind:'provisional'},
      supportingSources:[{title:'Ex Astris Scientia · Picard season 2 scale-chart annotation',url:'https://www.ex-astris-scientia.org/schematics/size-annotations.htm'}],
      notes:'Provisional production length: DITL and Ex Astris Scientia both report 540.7 m, attributed to Dave Blass and the Picard season 2 scale chart. The original production chart/post has not been directly inspected.'}
  };
  const mapping={1:'steamrunner',2:'excelsior',3:'miranda',4:'nebula',5:'nova',6:'saber',7:'danube',14:'centaur',15:'ambassador',
    33:'akira',34:'defiant',35:'galaxy',36:'intrepid',37:'prometheus',38:'sovereign',46:'newOrleans',49:'galaxyFuture',58:'olympic',
    426:'constitution',427:'constitution',433:'sagan',434:'nx',435:'nx',436:'type9',437:'delta',438:'intrepid',439:'intrepid',
    440:'galaxy',441:'excelsior',442:'defiant',443:'defiant',444:'defiant',445:'sagan'};
  const notes={
    8:'Custom game design; no verified length for this exact hull.',9:'Custom game design; no verified length for this exact hull.',
    10:'Custom freight tug. A screen-ship length cannot be assigned from the name alone.',
    11:'Custom game design; no verified length for this exact hull.',12:'Custom game design; no verified length for this exact hull.',
    13:'Custom game design; no verified length for this exact hull.',45:'Custom game design; no verified length for this exact hull.',
    47:'Modified Oberth tug: the original Grissom production chart gives the parent ship 395 ft (about 120 m). This is a parent-hull reference, not a verified length for the game’s tug conversion.',
    56:'Modified Constitution tug: original-series parent about 289 m; movie-refit parent about 305 m. The exact conversion and its length remain unverified.',
    57:'Modified Constellation tug: the older Stargazer NCC-2893 has a licensed length of 310 m. That parent length is not verified for the game’s tug conversion.',
    60:'Game dreadnaught design; no verified screen length for this exact configuration.',
    416:'Custom armored freight tug; no verified screen length for this exact design.'
  };
  const productionChart={title:'Star Trek III production scale chart · via Ex Astris Scientia',
    url:'https://www.ex-astris-scientia.org/articles/excelsior/probert-sizechart.jpg',kind:'production'};
  const parentReferences={
    47:[{name:'Oberth parent hull',meters:120,approximate:true,source:productionChart}],
    56:[{name:'Original Constitution parent hull',meters:288.6,approximate:true,source:references.constitution.source},
      {name:'Movie-refit Constitution parent hull',meters:305,approximate:true,source:productionChart}],
    57:[{name:'Constellation parent hull',meters:310,source:magazine('em-mags-xl/xl-mag-31-uss-stargazer-ncc-2893.pdf','Stargazer NCC-2893, XL 31')}]
  };
  const labels={426:'Kirk’s Enterprise',439:'U.S.S. Voyager',440:'Enterprise-D',441:'U.S.S. Excelsior',
    433:'U.S.S. Stargazer',435:'Enterprise NX-01',442:'U.S.S. São Paulo',444:'U.S.S. Defiant',416:'Armored freight tug'};
  const anchor=Object.freeze({meters:references.danube.meters,name:'Danube runabout',id:7});
  function roster(){
    return window.nativeFederationShips.ids.map(id=>{
      const definition=window.nativeShipDefinitions.get(id),key=mapping[id],reference=references[key]||null;
      return {id,name:definition.name,label:labels[id]||definition.name,referenceKey:key||null,reference,
        status:reference?reference.source.kind:'unverified',notes:notes[id]||reference?.notes||'',
        supportingSources:reference?.supportingSources||[],parentReferences:parentReferences[id]||[],
        dimensions:{...definition.dimensions},profile:definition.artworkProfile};
    });
  }
  function alphaBounds(rgba,width,height,threshold=32){
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>=threshold){
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left)throw Error('Ship artwork has no visible hull');
    return {x:left,y:top,width:right-left+1,height:bottom-top+1};
  }
  function currentHull(row,bounds,artwork){
    return {width:row.dimensions.width*bounds.width/artwork.width,height:row.dimensions.height*bounds.height/artwork.height};
  }
  function createScale(row,bounds,artwork){
    if(row.id!==anchor.id)throw Error('The scale must be anchored to the in-game Danube');
    const current=currentHull(row,bounds,artwork);
    if(!(current.width>0&&current.height>0)||!Number.isFinite(current.width+current.height))throw Error('Danube hull bounds are invalid');
    return Object.freeze({anchor:Object.freeze({...anchor,units:current.height,widthUnits:current.width,frameUnits:row.dimensions.height}),
      unitsPerMeter:current.height/anchor.meters});
  }
  function geometry(row,bounds,artwork,scale){
    if(!(scale?.unitsPerMeter>0))throw Error('Measure the in-game Danube before sizing the fleet');
    const fraction=bounds.height/artwork.height,current=currentHull(row,bounds,artwork),fixed=row.id===scale.anchor.id;
    const height=row.reference?row.reference.meters*scale.unitsPerMeter:null;
    return {current,corrected:height===null?null:fixed?{...current}:{height,width:height*bounds.width/bounds.height},
      proposedFrameHeight:height===null?null:fixed?row.dimensions.height:height/fraction,
      changePercent:height===null?null:fixed?0:(height/current.height-1)*100,bounds,artwork:{width:artwork.width,height:artwork.height}};
  }
  for(const reference of Object.values(references)){
    Object.freeze(reference.source);for(const source of reference.supportingSources||[])Object.freeze(source);
    if(reference.supportingSources)Object.freeze(reference.supportingSources);Object.freeze(reference);
  }
  for(const parents of Object.values(parentReferences)){for(const parent of parents){Object.freeze(parent.source);Object.freeze(parent);}Object.freeze(parents);}
  window.nativeShipScale=Object.freeze({anchor,references:Object.freeze(references),mapping:Object.freeze(mapping),
    roster,alphaBounds,createScale,geometry,featured:Object.freeze([7,426,439,440,38])});
})();
