/* Same procedural seed, with the initial GPU readback outside the flight thread. */
'use strict';
importScripts('nebula-gas.js'+self.location.search);
let context=null,renderer=null,texture=null,width=0,height=0;
onmessage=event=>{
  const {id,description,w,h}=event.data;
  try{
    if(!context){
      const canvas=new OffscreenCanvas(1,1);context=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false});
      if(!context)throw Error('Offscreen WebGL2 unavailable');renderer=nativeNebulaGas.createTextureRenderer(context,{flipY:false});texture=context.createTexture();
    }
    if(context.isContextLost())throw Error('Nebula seed GPU context lost');
    context.activeTexture(context.TEXTURE0);context.bindTexture(context.TEXTURE_2D,texture);
    if(width!==w||height!==h){context.texImage2D(context.TEXTURE_2D,0,context.RGBA8,w,h,0,context.RGBA,context.UNSIGNED_BYTE,null);width=w;height=h;}
    renderer.draw(texture,w,h,description);
    const rgba=new Uint8Array(w*h*4);context.readPixels(0,0,w,h,context.RGBA,context.UNSIGNED_BYTE,rgba);
    if(context.getError()!==context.NO_ERROR)throw Error('Nebula seed GPU readback failed');
    // Use the exact display shader coordinates, then reverse readback rows.
    // Flipping interpolated UVs in the vertex shader changed seeded alpha by
    // one byte on software GPUs because its float rounding differed.
    const stride=w*4,row=new Uint8Array(stride);
    for(let y=0;y<Math.floor(h/2);y++){const top=y*stride,bottom=(h-1-y)*stride;row.set(rgba.subarray(top,top+stride));rgba.copyWithin(top,bottom,bottom+stride);rgba.set(row,bottom);}
    postMessage({id,w,h,rgba},[rgba.buffer]);
  }catch(error){postMessage({id,error:String(error.message||error)});}
};
