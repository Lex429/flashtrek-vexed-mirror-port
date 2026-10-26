/* Showcase damage profiles for the user's two Constitution hulls.
   The shared effects, fragment and repair owners handle their animation. */
(() => {
  'use strict';
  const width=1024,height=1536;
  const breach=(x,y,r)=>({x,y,r});
  const damage=[[],
    [breach(274,305,24),breach(769,480,23),breach(480,1140,21),breach(832,1030,22)],
    [breach(330,300,31),breach(741,443,35),breach(541,1090,34),breach(835,1050,29),breach(473,775,22),breach(330,965,22)],
    [breach(422,321,32),breach(700,443,38),breach(492,1015,40),breach(818,880,28),breach(190,1110,32),breach(490,720,25),breach(430,1170,26),breach(770,604,25)]
  ];
  const sites=[
    ['forward saucer',512,120],['port forward saucer',290,230],['starboard forward saucer',720,230],
    ['port saucer rim',195,410],['bridge housing',512,400],['starboard saucer rim',820,410],
    ['port aft saucer',330,620],['aft saucer',512,620],['starboard aft saucer',720,620],
    ['connecting neck',512,780],['forward engineering',512,925],['reactor housing',512,1075],
    ['aft engineering',512,1230],['stern exhaust',512,1320],
    ['port nacelle collector',193,725],['starboard nacelle collector',831,725],
    ['port nacelle forward',193,900],['starboard nacelle forward',831,900],
    ['port nacelle middle',193,1110],['starboard nacelle middle',831,1110],
    ['port nacelle aft',193,1360],['starboard nacelle aft',831,1360],
    ['port pylon',335,985],['starboard pylon',690,985]
  ];
  for(const id of [426,427]){
    const prepared=new Map(),definitions=window.constitutionShowcaseLights.definitions();
    const create=lights=>window.createShowcaseEffects({width,height,lights,damage,damageScale:.9});
    const fallback=create(definitions.map(light=>({...light,offSevere:true})));
    const stageEffects=stage=>prepared.get(stage)?.effects||fallback;
    const effects=Object.freeze({
      draw:(ctx,layout,angle,stage,time,options)=>stageEffects(stage).draw(ctx,layout,angle,stage,time,options),
      snapshot:(stage,time,options)=>stageEffects(stage).snapshot(stage,time,options),
      damageSites:stage=>stageEffects(stage).damageSites(stage),
      forEachLightPrimitive:(stage,time,options,paint)=>stageEffects(stage).forEachLightPrimitive(stage,time,options,paint),
      // The loader expects a canvas for the unpowered thumbnail. Preserve the
      // authored severe pixels instead of repainting lamps over missing hull.
      unlitFrame:image=>{
        if(image.constitutionUnlit)return image;
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        canvas.getContext('2d').drawImage(image,0,0);canvas.constitutionUnlit=true;
        return canvas;
      }
    });
    function align(image,stage){
      if(image.width!==width||image.height!==height)throw Error('Constitution damage frame must use the original 1024 x 1536 canvas');
      if(prepared.get(stage)?.image===image)return image;
      let lights=[];
      if(stage<3){
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,width,height).data;
        lights=definitions.filter(light=>{
          const p=(Math.round(light.y)*width+Math.round(light.x))*4;
          return pixels[p+3]>160&&Math.max(pixels[p],pixels[p+1],pixels[p+2])>(stage===0?100:170);
        }).map(light=>({...light,offSevere:true}));
      }
      prepared.set(stage,{image,effects:create(lights)});
      return image;
    }
    window.starterShips.set(id,{
      width,height,animationReady:true,align,effects,
      breakAnchors:sites.map(([,x,y])=>[x,y]),
      destruction:{sites,core:[512,1075],coreIndex:11,energyColor:'#ffac55'}
    });
  }
})();
