/* Hull-scale gas transport. Reads visual poses only; no ship or save mutations. */
(() => {
  'use strict';
  const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
  const tileSize=64;
  const vertex=`#version 300 es
  precision highp float;
  out vec2 v_uv;
  void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));v_uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`;
  const fragment=`#version 300 es
  precision highp float;
  precision highp int;
  in vec2 v_uv;out vec4 fragColor;
  uniform sampler2D u_fog,u_data,u_tiles,u_indices;
  uniform vec2 u_view;
  vec4 row(int x,int y){return texelFetch(u_data,ivec2(x,y),0);}
  float profile(int id,float f){
    float p=clamp((f+1.0)*7.5,0.0,15.0);int i=int(floor(p)),j=min(15,i+1);
    vec4 a=row(2+i/4,id),b=row(2+j/4,id);return mix(a[i%4],b[j%4],fract(p));
  }
  void main(){
    vec2 pixel=vec2(v_uv.x,1.0-v_uv.y)*u_view,push=vec2(0);float clearing=0.0,mass=0.0,weight=0.0,detail=0.0;
    ivec2 tile=ivec2(pixel/64.0);vec4 range=texelFetch(u_tiles,ivec2(tile.x,tile.y),0);
    int start=int(range.x),count=int(range.y);
    for(int k=0;k<count;k++){
      int index=start+k,id=int(texelFetch(u_indices,ivec2(index%256,index/256),0).x);
      vec4 a=row(0,id),b=row(1,id),info=row(6,id);vec2 delta=pixel-row(7,id).xy;
      if(any(greaterThan(abs(delta),info.zw)))continue;
      if(info.x<0.5){
        vec2 axis=a.zw,side=vec2(-axis.y,axis.x);float along=dot(delta,axis),across=dot(delta,side);
        float length=max(1.0,b.x),width=max(.4,b.y),f=along/length,band=max(1.2,width*.27),speed=b.z;
        float signSide=across/sqrt(across*across+pow(max(.6,width*.10),2.0));
        float edge=profile(id,f)+min(.8,max(.35,width*.02));
        float tip=max(0.0,abs(along)-length),sd=max(abs(across)-edge,tip);
        if(tip==0.0)sd=abs(across)-edge;
        float core=(1.0-smoothstep(-.3,.55,sd))*(1.0-smoothstep(length,length+.8,abs(along)))*.97;
        float envelope=1.0-smoothstep(length,length+band*2.0,abs(along));
        float aft=1.0-smoothstep(-.7,.9,f),phase=f*7.0+b.w*3.0+signSide*1.4;
        float rolling=sin(phase)*band*.23*aft*speed;
        float shoulder=exp(-pow((abs(across)-edge-band*.65-rolling)/band,2.0))*envelope;
        float bowBand=max(1.2,width*.45),bow=exp(-pow((along-length)/bowBand,2.0)-pow(across/(width*.75+1.0),2.0))*speed;
        float strength=.18+.82*speed;
        push+=side*signSide*shoulder*width*(.28+.85*speed)+axis*(bow*width*.42-sin(phase)*band*.38*shoulder*aft*speed);
        weight+=shoulder*.45;clearing=max(clearing,core);
        mass=max(mass,shoulder*strength*(.72+.28*cos(phase))+bow*.30);
        detail=max(detail,shoulder*speed);
        // A blade-like bow sheet opens diagonally from the nose. Its banks
        // carry source gas well beyond the hull without enlarging the mask.
        float downstream=length-along,waveBand=max(1.4,width*(.30+.20*speed));
        float waveEdge=max(edge+band*.65,profile(id,1.0)+max(0.0,downstream)*(.24+.48*speed)+band*.5);
        float wavePhase=downstream/max(2.0,width)*1.8+b.w*2.0+signSide*1.3;
        waveEdge+=sin(wavePhase)*waveBand*.24*aft*speed;
        float waveEnvelope=smoothstep(-band,band*.8,downstream)*(1.0-smoothstep(length*2.2,length*3.2,downstream));
        float wave=exp(-pow((abs(across)-waveEdge)/waveBand,2.0))*waveEnvelope*speed;
        push+=side*signSide*wave*width*(1.6+1.4*speed)-axis*wave*width*(.32+.22*sin(wavePhase));
        push+=axis*bow*width*.35;
        weight+=wave*.35;mass=max(mass,wave*(.90+.25*cos(wavePhase)));detail=max(detail,wave);
      }else{
        vec2 ab=a.zw-a.xy;float t=clamp(dot(pixel-a.xy,ab)/max(.01,dot(ab,ab)),0.0,1.0);
        vec4 startInfo=row(2,id);float spread=mix(startInfo.x,info.y,t),strength=mix(startInfo.y,b.y,t);
        vec2 d=pixel-(a.xy+ab*t);float distance=length(d),radius=max(.5,b.x);
        if(distance>max(radius*3.3,radius*2.5+spread*1.3+3.0))continue;
        vec2 axis=normalize(ab+vec2(.0001)),side=vec2(-axis.y,axis.x);
        float across=dot(pixel-a.xy,side),signSide=across<0.0?-1.0:1.0,cap=max(0.0,dot(d,axis)*dot(d,axis));
        float phase=t*5.0-b.z*3.1+b.w;
        float bank=radius*(1.05+.12*sin(phase))+spread,band=radius*.38+.8+spread*.10;
        float shoulder=exp(-pow((abs(across)-bank)/band,2.0)-cap/pow(radius*.7+1.0,2.0))*strength;
        clearing=max(clearing,exp(-distance*distance/(radius*radius)*3.4)*strength*.78);
        push+=side*signSide*(radius*1.5+spread*.65)*shoulder+axis*sin(phase)*(radius*.3+spread*.14)*shoulder;
        mass=max(mass,shoulder*(.62+.22*cos(phase)));weight+=shoulder*.45;detail=max(detail,shoulder);
      }
    }
    push/=max(1.0,weight);
    vec2 source=clamp((pixel-push)/u_view,vec2(.0001),vec2(.9999));
    vec4 fog=texture(u_fog,source);
    // Transport the source gas into the shoulders. Fine folds move with the
    // transported coordinates rather than painting a fixed luminous outline.
    float folds=.80+.20*sin((pixel.x-push.x)*.39+sin((pixel.y-push.y)*.31)*1.7);
    float gain=(1.0-min(.97,clearing))*(1.0+mass*(1.1+detail*.5)*folds);
    float alpha=clamp(fog.a*gain,0.0,.94);
    fragColor=vec4(fog.rgb*gain*(1.0+mass*.16)*min(1.0,.94/max(.001,fog.a*gain)),alpha);
  }`;
  // CPU contract matches the GPU, also used to check transport direction and
  // the distance between a hull edge and the undisturbed fog.
  function sampleAt(x,y,records){
    let pushX=0,pushY=0,clearing=0,mass=0,weight=0,detail=0;
    for(const r of records){
      const dx=x-r.x,dy=y-r.y;if(Math.abs(dx)>r.boundX||Math.abs(dy)>r.boundY)continue;
      if(r.kind==='hull'){
        const c=r.cos,s=r.sin,along=dx*c+dy*s,across=-dx*s+dy*c;
        const length=Math.max(1,r.length),width=Math.max(.4,r.width),f=along/length,band=Math.max(1.2,width*.27),speed=r.speed;
        const sign=across/Math.sqrt(across*across+Math.pow(Math.max(.6,width*.10),2));
        const p=clamp((f+1)/2)*15,i=Math.floor(p),j=Math.min(15,i+1),edge=r.profile[i]+(r.profile[j]-r.profile[i])*(p-i)+Math.min(.8,Math.max(.35,width*.02));
        const tip=Math.max(0,Math.abs(along)-length),sd=tip?Math.max(Math.abs(across)-edge,tip):Math.abs(across)-edge;
        const core=(1-smooth((sd+.3)/.85))*(1-smooth((Math.abs(along)-length)/.8))*.97;
        const envelope=1-smooth((Math.abs(along)-length)/(band*2)),aft=1-smooth((f+.7)/1.6),phase=f*7+r.phase*3+sign*1.4;
        const rolling=Math.sin(phase)*band*.23*aft*speed,shoulder=Math.exp(-Math.pow((Math.abs(across)-edge-band*.65-rolling)/band,2))*envelope;
        const bowBand=Math.max(1.2,width*.45),bow=Math.exp(-Math.pow((along-length)/bowBand,2)-Math.pow(across/(width*.75+1),2))*speed;
        const sidePush=sign*shoulder*width*(.28+.85*speed),forwardPush=bow*width*.42-Math.sin(phase)*band*.38*shoulder*aft*speed;
        pushX+=-s*sidePush+c*forwardPush;pushY+=c*sidePush+s*forwardPush;weight+=shoulder*.45;clearing=Math.max(clearing,core);
        mass=Math.max(mass,shoulder*(.18+.82*speed)*(.72+.28*Math.cos(phase))+bow*.30);detail=Math.max(detail,shoulder*speed);
        const downstream=length-along,waveBand=Math.max(1.4,width*(.30+.20*speed));
        let waveEdge=Math.max(edge+band*.65,r.profile[15]+Math.max(0,downstream)*(.24+.48*speed)+band*.5);
        const wavePhase=downstream/Math.max(2,width)*1.8+r.phase*2+sign*1.3;
        waveEdge+=Math.sin(wavePhase)*waveBand*.24*aft*speed;
        const waveEnvelope=smooth((downstream+band)/(band*1.8))*(1-smooth((downstream-length*2.2)/length));
        const wave=Math.exp(-Math.pow((Math.abs(across)-waveEdge)/waveBand,2))*waveEnvelope*speed;
        const outward=sign*wave*width*(1.6+1.4*speed),backward=-wave*width*(.32+.22*Math.sin(wavePhase))+bow*width*.35;
        pushX+=-s*outward+c*backward;pushY+=c*outward+s*backward;
        weight+=wave*.35;mass=Math.max(mass,wave*(.90+.25*Math.cos(wavePhase)));detail=Math.max(detail,wave);
      }else{
        const ax=r.ax,ay=r.ay,bx=r.bx,by=r.by,abx=bx-ax,aby=by-ay,t=clamp(((x-ax)*abx+(y-ay)*aby)/Math.max(.01,abx*abx+aby*aby));
        const spread=(r.spreadA??r.spread??0)*(1-t)+(r.spread||0)*t,strength=(r.strengthA??r.strength)*(1-t)+r.strength*t;
        const ex=x-ax-abx*t,ey=y-ay-aby*t,distance=Math.hypot(ex,ey),radius=Math.max(.5,r.radius);if(distance>Math.max(radius*3.3,radius*2.5+spread*1.3+3))continue;
        const axisLength=Math.hypot(abx+.0001,aby+.0001),cx=(abx+.0001)/axisLength,cy=(aby+.0001)/axisLength,across=(x-ax)*-cy+(y-ay)*cx,sign=across<0?-1:1;
        const cap=Math.pow(ex*cx+ey*cy,2),phase=t*5-r.age*3.1+r.phase,bank=radius*(1.05+.12*Math.sin(phase))+spread,band=radius*.38+.8+spread*.10;
        const shoulder=Math.exp(-Math.pow((Math.abs(across)-bank)/band,2)-cap/Math.pow(radius*.7+1,2))*strength;
        clearing=Math.max(clearing,Math.exp(-distance*distance/(radius*radius)*3.4)*strength*.78);
        const sidePush=sign*(radius*1.5+spread*.65)*shoulder,axialPush=Math.sin(phase)*(radius*.3+spread*.14)*shoulder;
        pushX+=-cy*sidePush+cx*axialPush;pushY+=cx*sidePush+cy*axialPush;
        mass=Math.max(mass,shoulder*(.62+.22*Math.cos(phase)));weight+=shoulder*.45;detail=Math.max(detail,shoulder);
      }
    }
    return {pushX:pushX/Math.max(1,weight),pushY:pushY/Math.max(1,weight),clearing,mass,detail};
  }
  function bins(view,records){
    const columns=Math.ceil(view.w/tileSize),rows=Math.ceil(view.h/tileSize),cells=Array.from({length:columns*rows},()=>[]);
    records.forEach((r,id)=>{
      const minX=Math.max(0,Math.floor((r.x-r.boundX)/tileSize)),maxX=Math.min(columns-1,Math.floor((r.x+r.boundX)/tileSize));
      const minY=Math.max(0,Math.floor((r.y-r.boundY)/tileSize)),maxY=Math.min(rows-1,Math.floor((r.y+r.boundY)/tileSize));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)cells[y*columns+x].push(id);
    });return {columns,rows,cells};
  }
  let canvas=null,gl=null,program=null,vao=null,textures=null,locations=null,lost=false,failed=false,cpu=null;
  const counters={renders:0,compiles:0,failures:0,records:0,width:0,height:0,contextLosses:0};
  function prepare(){
    if(program&&!lost||failed||lost)return;
    if(!canvas){canvas=document.createElement('canvas');canvas.dataset.nebulaFlow='hull-transport';
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;program=null;counters.contextLosses++;});
      canvas.addEventListener('webglcontextrestored',()=>{lost=false;failed=false;program=null;});}
    try{
      gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
      const compile=(kind,source)=>{const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
      const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      vao=gl.createVertexArray();textures=Array.from({length:4},()=>gl.createTexture());locations={};
      for(const name of ['u_fog','u_data','u_tiles','u_indices','u_view'])locations[name]=gl.getUniformLocation(program,name);counters.compiles++;
    }catch(error){failed=true;program=null;counters.failures++;}
  }
  function fallback(view,source,records,grid){
    if(!cpu){const output=document.createElement('canvas'),input=document.createElement('canvas');cpu={output,ctx:output.getContext('2d'),input,read:input.getContext('2d',{willReadFrequently:true})};}
    const ratio=Math.min(1,960/view.w,720/view.h),w=Math.round(view.w*ratio),h=Math.round(view.h*ratio);
    cpu.output.width=w;cpu.output.height=h;cpu.input.width=source.width;cpu.input.height=source.height;
    cpu.read.drawImage(source,0,0);const raw=cpu.read.getImageData(0,0,source.width,source.height).data;
    cpu.ctx.drawImage(source,0,0,w,h);const image=cpu.ctx.getImageData(0,0,w,h),out=image.data;
    for(let tile=0;tile<grid.cells.length;tile++){
      if(!grid.cells[tile].length)continue;const local=grid.cells[tile].map(id=>records[id]),tx=tile%grid.columns,ty=Math.floor(tile/grid.columns);
      for(let y=Math.floor(ty*64*ratio);y<Math.min(h,(ty+1)*64*ratio);y++)for(let x=Math.floor(tx*64*ratio);x<Math.min(w,(tx+1)*64*ratio);x++){
        const px=(x+.5)/ratio,py=(y+.5)/ratio,v=sampleAt(px,py,local);
        const sx=Math.max(0,Math.min(source.width-1,Math.floor((px-v.pushX)/view.w*source.width))),sy=Math.max(0,Math.min(source.height-1,Math.floor((py-v.pushY)/view.h*source.height))),i=(sy*source.width+sx)*4,j=(y*w+x)*4;
        const folds=.80+.20*Math.sin((px-v.pushX)*.39+Math.sin((py-v.pushY)*.31)*1.7),gain=(1-Math.min(.97,v.clearing))*(1+v.mass*(1.1+v.detail*.5)*folds);
        for(let c=0;c<3;c++)out[j+c]=Math.min(255,raw[i+c]*(1+v.mass*.16));out[j+3]=Math.min(240,raw[i+3]*gain);
      }
    }
    cpu.ctx.putImageData(image,0,0);counters.width=w;counters.height=h;return cpu.output;
  }
  function render(view,source,options){
    prepare();const records=options.records||[],grid=bins(view,records);counters.records=records.length;counters.renders++;
    if(!program||lost||failed)return fallback(view,source,records,grid);
    const ratio=Math.min(1,1600/view.w,1000/view.h),w=Math.round(view.w*ratio),h=Math.round(view.h*ratio);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}counters.width=w;counters.height=h;
    gl.viewport(0,0,w,h);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.useProgram(program);gl.bindVertexArray(vao);
    const data=new Float32Array(Math.max(1,records.length)*32);
    records.forEach((r,id)=>{const offset=id*32;
      data.set(r.kind==='hull'?[r.x,r.y,r.cos,r.sin,r.length,r.width,r.speed,r.phase]:[r.ax,r.ay,r.bx,r.by,r.radius,r.strength,r.age,r.phase],offset);
      if(r.profile)data.set(r.profile,offset+8);else data.set([r.spreadA??r.spread??0,r.strengthA??r.strength,0,0],offset+8);
      data.set([r.kind==='hull'?0:1,r.spread||0,r.boundX,r.boundY],offset+24);
      // Wake broad-phase uses its segment midpoint while the first row stores A/B.
      data.set([r.x,r.y,0,0],offset+28);
    });
    const ranges=new Float32Array(grid.cells.length*4),ids=[];
    grid.cells.forEach((cell,i)=>{ranges[i*4]=ids.length;ranges[i*4+1]=cell.length;ids.push(...cell);});
    const indexRows=Math.max(1,Math.ceil(ids.length/256)),indices=new Float32Array(256*indexRows*4);ids.forEach((id,i)=>indices[i*4]=id);
    textures.forEach((texture,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,i===0?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,i===0?gl.LINEAR:gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(i===0){gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);}
      else{gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,i===1?8:i===2?grid.columns:256,i===1?Math.max(1,records.length):i===2?grid.rows:indexRows,0,gl.RGBA,gl.FLOAT,i===1?data:i===2?ranges:indices);}
      gl.uniform1i(locations[['u_fog','u_data','u_tiles','u_indices'][i]],i);
    });
    gl.uniform2f(locations.u_view,view.w,view.h);gl.drawArrays(gl.TRIANGLES,0,3);return canvas;
  }
  window.nativeNebulaFlow=Object.freeze({render,sampleAt,bins,metrics:()=>({...counters,backend:program&&!lost&&!failed?'webgl2':'canvas-transport',contextLost:lost,imageRequests:0})});
})();
