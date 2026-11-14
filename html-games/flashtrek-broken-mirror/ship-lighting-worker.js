/* Prepare the existing lamp-atlas recipes without painting on the flight thread. */
'use strict';
onmessage=event=>{
 const {id,bitmap,recipe}=event.data||{},started=performance.now();let scratch=null,glow=null;
 try{
  if(!Number.isSafeInteger(id)||id<1||!bitmap||bitmap.width*bitmap.height>1_048_576||!['core','glow','primitive','sun'].includes(recipe?.kind))throw Error('Invalid lighting preparation request');
  scratch=new OffscreenCanvas(128,128);const g=scratch.getContext('2d',{willReadFrequently:true});
  if(!g)throw Error('Lighting worker canvas unavailable');
  if(recipe.kind==='core'||recipe.kind==='glow'){
   const {rw,rh,pad,cw,ch,gain,bloom}=recipe;
   if(![rw,rh,pad,cw,ch].every(Number.isSafeInteger)||rw<1||rh<1||pad<0||cw<rw||ch<rh||cw*ch>1_048_576||!Number.isFinite(gain)||!Number.isFinite(bloom)||gain<0||bloom<0)throw Error('Lighting recipe exceeds its bounds');
   if(recipe.kind==='core')g.drawImage(bitmap,pad/cw*128,pad/ch*128,rw/cw*128,rh/ch*128);
   else{glow=new OffscreenCanvas(cw,ch);const b=glow.getContext('2d',{willReadFrequently:true});b.filter=`brightness(${gain}) blur(${4*bloom*2}px)`;b.drawImage(bitmap,pad,pad,rw,rh);g.drawImage(glow,0,0,128,128);}
  }else g.drawImage(bitmap,0,0,128,128);
  const image=g.getImageData(0,0,128,128);postMessage({id,buffer:image.data.buffer,workMs:performance.now()-started},[image.data.buffer]);
 }catch(error){postMessage({id,error:String(error.message||error).slice(0,180)});}
 finally{bitmap?.close?.();if(scratch)scratch.width=scratch.height=0;if(glow)glow.width=glow.height=0;}
};
