const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

function fixture({supported=true,renderer='ANGLE hardware'}={}){
  const calls=[],events=new Map(),uploads=[];
  const gl={getExtension:()=>({UNMASKED_RENDERER_WEBGL:77}),getParameter:()=>renderer,
    getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:()=>({}),
    bufferSubData:(_target,_offset,data)=>uploads.push(Array.from(data)),
    drawArraysInstanced:(...args)=>calls.push({kind:'draw',args}),texStorage3D:(...args)=>calls.push({kind:'storage',args})};
  for(const name of ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER','STATIC_DRAW','DYNAMIC_DRAW','FLOAT','TEXTURE0','TEXTURE_2D_ARRAY','RGBA8','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','UNPACK_PREMULTIPLY_ALPHA_WEBGL','BLEND','ONE','ONE_MINUS_SRC_ALPHA','SCISSOR_TEST','RGBA','UNSIGNED_BYTE','COLOR_BUFFER_BIT','TRIANGLES'])gl[name]=name;
  for(const name of ['createShader','createProgram','createVertexArray','createBuffer','createTexture'])gl[name]=()=>({});
  for(const name of ['shaderSource','compileShader','attachShader','linkProgram','useProgram','uniform1i','bindVertexArray','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','vertexAttribDivisor','activeTexture','bindTexture','texParameteri','pixelStorei','enable','blendFunc','texSubImage3D','viewport','scissor','clearColor','clear','uniform2f'])gl[name]=()=>{};
  const canvas={width:0,height:0,getContext:()=>supported?gl:null,addEventListener:(name,callback)=>events.set(name,callback)},window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/ship-gpu-batch.js'),'utf8'),{window,document:{createElement:()=>canvas}});
  const matrix={a:1,b:0,c:0,d:1,e:50,f:70},ctx={canvas:{width:1280,height:850},globalAlpha:1,getTransform:()=>matrix,save(){},restore(){},setTransform(){},drawImage:(...args)=>calls.push({kind:'present',args})};
  const base={width:32,height:48},effects={width:64,height:80},box={x:-32,y:-40,width:64,height:80,rw:32,rh:48},asset={width:315,height:512},light={direction:0,color:0xffdb9e,bright:.22};
  return {batch:window.nativeShipGpuBatch,ctx,matrix,base,effects,box,asset,light,calls,events,uploads};
}

test('Canvas selection allocates no WebGL surface and unsupported hardware falls back honestly',()=>{
  const f=fixture();assert.equal(f.batch.begin(f.ctx,{backend:'canvas'}),false);assert.equal(f.calls.length,0);assert.equal(f.batch.snapshot().atlasBytes,0);
  const unavailable=fixture({supported:false});assert.equal(unavailable.batch.begin(unavailable.ctx),false);assert.equal(unavailable.batch.snapshot().counters.failures,1);
  const software=fixture({renderer:'ANGLE SwiftShader'});assert.equal(software.batch.begin(software.ctx,{backend:'auto'}),false);assert.equal(software.batch.begin(software.ctx,{backend:'webgl2'}),true,'explicit diagnostic mode remains available');
});

test('many instance headings share immutable texture pixels and one presentation',()=>{
  const f=fixture(),key={};let bases=0;
  f.batch.begin(f.ctx,{backend:'webgl2'});
  for(let i=0;i<25;i++){f.matrix.e=50+i;assert.equal(f.batch.draw(f.ctx,key,()=>{bases++;return f.base;},f.effects,20,f.box,f.asset,{...f.light,direction:i*.1}),true);}
  f.batch.end();
  assert.equal(bases,1);assert.equal(f.batch.snapshot().counters.uploads,2);
  assert.equal(f.calls.filter(call=>call.kind==='draw').length,1);assert.equal(f.calls.find(call=>call.kind==='draw').args.at(-1),25);
  assert.equal(f.calls.filter(call=>call.kind==='present').length,1);
  assert.equal(f.uploads[0][16],50);assert.equal(f.uploads[0][32+16],51,'transforms are copied, not mutable caller snapshots');
  assert.notEqual(f.uploads[0][24],f.uploads[0][32+24],'headings retain independent light parameters');
  assert.ok(f.batch.snapshot().counters.presentationPixels<1280*850,'small batches present only their dirty screen bounds');
  assert.equal(f.batch.snapshot().atlasBytes,2048*2048*2*4);
});

test('updating a different effect texture does not flush unrelated queued ships',()=>{
  const f=fixture(),a={},b={};f.batch.begin(f.ctx,{backend:'webgl2'});
  for(const key of [a,b])f.batch.draw(f.ctx,key,f.base,f.effects,0,f.box,f.asset,f.light);f.batch.end();
  f.batch.begin(f.ctx,{backend:'webgl2'});
  for(const key of [a,b])f.batch.draw(f.ctx,key,f.base,f.effects,1,f.box,f.asset,f.light);f.batch.end();
  assert.equal(f.calls.filter(call=>call.kind==='present').length,2,'one presentation per frame, not one per updated hull');
});

test('atlas pressure flushes before reuse and context failure stops GPU acceptance',()=>{
  const f=fixture();f.batch.begin(f.ctx,{backend:'webgl2'});
  for(let i=0;i<30;i++)f.batch.draw(f.ctx,{}, {width:700,height:700},{width:700,height:700},0,{...f.box,rw:700,rh:700},f.asset,f.light);
  f.batch.end();assert.ok(f.batch.snapshot().counters.atlasResets>0);assert.equal(f.batch.snapshot().atlasBytes,33554432);
  f.events.get('webglcontextlost')({preventDefault(){}});assert.equal(f.batch.active(f.ctx),false);
  assert.equal(f.batch.draw(f.ctx,{},f.base,f.effects,0,f.box,f.asset,f.light),false);
  assert.equal(f.batch.snapshot().counters.contextLosses,1);
  f.events.get('webglcontextrestored')();assert.equal(f.batch.begin(f.ctx,{backend:'webgl2'}),true);
});
