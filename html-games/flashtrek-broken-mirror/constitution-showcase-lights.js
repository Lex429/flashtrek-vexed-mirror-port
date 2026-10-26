/* Measured on the user's 1024 x 1536 Constitution and Enterprise cutouts.
   Keep painted registry text and red hull stripes out of the light profile. */
(() => {
  'use strict';
  const ids = new Set([426, 427]), profiles = new Map();
  const windows = [
    [513,56],[512,99],[486,129],[512,125],[539,129],[486,146],[513,144],[539,146],
    [226,220],[198,286],[198,546],[210,574],[351,710],[371,719],
    [799,220],[827,286],[827,546],[815,574],[673,710],[653,719],
    [286,397],[317,397],[339,400],[339,424],
    [738,397],[707,397],[685,400],[685,424],
    [398,390],[398,401],[398,419],[398,430],
    [627,390],[627,401],[627,419],[627,430],
    [437,272],[445,268],[453,264],[569,264],[577,268],[585,272],
    [445,533],[456,538],[467,542],[478,545],
    [548,545],[559,542],[570,538],[581,533],
    [422,586],[601,586],[512,580],
    [474,779],[550,779],[446,938],[458,936],[566,938],[578,936],
    [333,982],[690,982],[149,1241],[149,1257],[876,1241],[876,1257]
  ];
  const lightDefinitions = windows.map(([x,y]) => ({x,y,r:10,kind:'window',color:'#c9f3ff'}));
  lightDefinitions.push(...[[193,724],[831,724]].map(([x,y]) =>
    ({x,y,r:48,kind:'running',color:'#ff962f'})));
  lightDefinitions.push({x:512,y:1325,r:18,kind:'running',color:'#ffbb73'});
  function prepare(id, image) {
    if (!ids.has(id)) throw Error('Unknown Constitution showcase entry');
    if (profiles.has(id)) return profiles.get(id);
    const lights = lightDefinitions;
    const effects = window.createShowcaseEffects({width:1024,height:1536,lights,damage:[[],[],[],[]]});
    const profile = {effects,total:lights.length,width:image.width,height:image.height};
    profiles.set(id,profile);
    return profile;
  }
  function draw(ctx,id,layout,angle,time,enabled) {
    profiles.get(id)?.effects.draw(ctx,layout,angle,0,time,{lights:enabled,damage:false,anchors:false});
  }
  window.constitutionShowcaseLights = Object.freeze({
    has:id=>ids.has(id),prepare,draw,definitions:()=>lightDefinitions.map(light=>({...light})),
    snapshot:id=>{const profile=profiles.get(id);return profile?{total:profile.total}:null;}
  });
})();
