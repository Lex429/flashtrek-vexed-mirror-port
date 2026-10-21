/* Lossless large-save packing. Storage and transaction ownership stays in save-storage. */
(() => {
  'use strict';
  const format='vexed-mirror-shapes',version=1,maxNodes=1_000_000,maxShapes=32768,maxStrings=1_000_000;
  const scalar=value=>value===null||['string','number','boolean'].includes(typeof value);
  const omitted=value=>value===undefined||typeof value==='function'||typeof value==='symbol';
  // Objects use a shared key dictionary, and references retain existing aliases
  // such as equipment projections and market inventories. No field, item,
  // deadline or numerical precision is removed, and no stale snapshot is reused.
  function pack(state){
    const shapes=[],shapeIds=new Map(),nodes=[],sources=[],identities=new WeakMap(),strings=[],stringIds=new Map();
    function value(item,key,normalized=false){
      if(!normalized&&item&&typeof item.toJSON==='function')item=item.toJSON(key);
      if(typeof item==='string'&&item.length>=8){let id=stringIds.get(item);if(id===undefined){if(strings.length>=maxStrings)throw RangeError('Save exceeds packed string limit');id=strings.length;strings.push(item);stringIds.set(item,id);}return [-id-1];}
      if(scalar(item))return item;
      if(omitted(item))return null;
      if(typeof item!=='object')throw TypeError('Unsupported saved value');
      const old=identities.get(item);if(old!==undefined)return [old];
      if(nodes.length>=maxNodes)throw RangeError('Save exceeds packed object limit');
      const id=nodes.length;identities.set(item,id);nodes.push(null);sources.push(item);return [id];
    }
    const root=value(state,'');
    for(let index=0;index<sources.length;index++){
      const source=sources[index];
      if(Array.isArray(source)){
        const row=[-1];for(let i=0;i<source.length;i++)row.push(value(source[i],String(i)));nodes[index]=row;
      }else{
        const keys=[],values=[];
        for(const key of Object.keys(source)){let item=source[key];if(item&&typeof item.toJSON==='function')item=item.toJSON(key);if(omitted(item))continue;keys.push(key);values.push(value(item,key,true));}
        const signature=JSON.stringify(keys);let id=shapeIds.get(signature);
        if(id===undefined){if(shapes.length>=maxShapes)throw RangeError('Save exceeds packed shape limit');id=shapes.length;shapes.push(keys);shapeIds.set(signature,id);}
        nodes[index]=[id,...values];
      }
    }
    checkGraph(nodes,root,strings.length);
    return {saveSlotVersion:2,format,codecVersion:version,shapes,strings,nodes,root};
  }
  function reference(value,count,stringCount){
    if(!Array.isArray(value))return -1;
    if(value.length!==1||!Number.isSafeInteger(value[0])||value[0]<-stringCount||value[0]>=count)throw Error('Invalid packed save reference');
    if(value[0]<0)return -1;
    return value[0];
  }
  // JSON saves have always rejected cycles. Retain that rule and validate all
  // references before allocating/restoring an untrusted stored object graph.
  function checkGraph(nodes,root,stringCount){
    const colors=new Uint8Array(nodes.length),rootId=reference(root,nodes.length,stringCount);
    const visit=start=>{
      const stack=[[start,1]];colors[start]=1;
      while(stack.length){
        const top=stack.at(-1),row=nodes[top[0]];
        if(top[1]>=row.length){colors[top[0]]=2;stack.pop();continue;}
        const item=row[top[1]++],id=reference(item,nodes.length,stringCount);
        if(id<0){if(!scalar(item)&&!Array.isArray(item))throw Error('Invalid packed save value');continue;}
        if(colors[id]===1)throw Error('Cyclic save state');
        if(!colors[id]){colors[id]=1;stack.push([id,1]);}
      }
    };
    if(rootId>=0)visit(rootId);else if(!scalar(root)&&!Array.isArray(root))throw Error('Invalid packed save root');
    // Unreachable payload is rejected rather than becoming hidden storage work.
    if(colors.some(color=>color!==2))throw Error('Unreachable packed save objects');
  }
  function unpack(saved){
    if(saved?.format!==format)return saved;
    const {shapes,nodes,root,strings}=saved;
    if(saved.saveSlotVersion!==2||saved.codecVersion!==version||!Array.isArray(shapes)||shapes.length>maxShapes||!Array.isArray(nodes)||nodes.length>maxNodes||!Array.isArray(strings)||strings.length>maxStrings||strings.some(item=>typeof item!=='string'))throw Error('Unsupported packed save');
    for(const keys of shapes){
      if(!Array.isArray(keys)||keys.some(key=>typeof key!=='string')||new Set(keys).size!==keys.length)throw Error('Invalid packed save shape');
    }
    for(const row of nodes){
      if(!Array.isArray(row)||!Number.isSafeInteger(row[0])||row[0]<-1||row[0]>=shapes.length||row[0]>=0&&row.length!==shapes[row[0]].length+1)throw Error('Invalid packed save object');
    }
    checkGraph(nodes,root,strings.length);
    const objects=nodes.map(row=>row[0]===-1?[]:{});
    const value=item=>Array.isArray(item)?item[0]<0?strings[-item[0]-1]:objects[item[0]]:item;
    for(let index=0;index<nodes.length;index++){
      const row=nodes[index],object=objects[index];
      if(row[0]===-1){for(let i=1;i<row.length;i++)object.push(value(row[i]));}
      else for(let i=1;i<row.length;i++){
        const key=shapes[row[0]][i-1],item=value(row[i]);
        if(key==='__proto__')Object.defineProperty(object,key,{value:item,writable:true,enumerable:true,configurable:true});else object[key]=item;
      }
    }
    return value(root);
  }
  const large=state=>(state?.civilianTraffic?.ships?.length||0)+(state?.solEconomy?.freighters?.length||0)>=512;
  const prefix='VM2:';
  // Web Storage charges UTF-16 code units. Pack two ASCII JSON bytes in one
  // code unit; non-ASCII text uses standard JSON escapes, preserving every name.
  // This is deterministic encoding, with no asynchronous transaction window.
  function storageText(text){
    const ascii=text.replace(/[\u0080-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')),parts=[];
    for(let offset=0;offset<ascii.length;offset+=16384){const end=Math.min(ascii.length,offset+16384),codes=[];
      for(let i=offset;i<end;i+=2)codes.push(ascii.charCodeAt(i)*256+(ascii.charCodeAt(i+1)||0));
      parts.push(String.fromCharCode(...codes));}
    return prefix+ascii.length+':'+parts.join('');
  }
  function jsonText(text){
    if(!text.startsWith(prefix))return text;
    const separator=text.indexOf(':',prefix.length),length=Number(text.slice(prefix.length,separator)),payload=text.slice(separator+1);
    if(separator<0||!Number.isSafeInteger(length)||length<0||length>64*1024*1024||payload.length!==Math.ceil(length/2))throw Error('Invalid packed save text length');
    const parts=[];
    for(let offset=0;offset<payload.length;offset+=8192){const end=Math.min(payload.length,offset+8192),codes=[];
      for(let i=offset;i<end;i++){const code=payload.charCodeAt(i);if((code>>8)>127||(code&255)>127)throw Error('Invalid packed save text');codes.push(code>>8,code&255);}
      parts.push(String.fromCharCode(...codes));}
    return parts.join('').slice(0,length);
  }
  // Version 3 uses bounded LZ sequences over UTF-16 JSON units. Matching saved
  // structure directly avoids constructing a second large object graph on each
  // durable write. Literal units preserve Unicode exactly; offsets are bounded
  // to 65535 units. This is a text codec only, never a cached game snapshot.
  const compressedPrefix='VM3:',maxTextUnits=32*1024*1024;
  function compress(text){
    if(text.length>maxTextUnits)throw RangeError('Save exceeds text limit');
    const output=new Uint16Array(text.length+Math.ceil(text.length/255)+16),table=new Int32Array(65536).fill(-1);
    let written=0,index=0,anchor=0;
    const hash=at=>Math.imul(text.charCodeAt(at)+text.charCodeAt(at+1)*31+text.charCodeAt(at+2)*131+text.charCodeAt(at+3)*571,2654435761)>>>16;
    const length=value=>{while(value>=255){output[written++]=255;value-=255;}output[written++]=value;};
    while(index+4<=text.length){
      const slot=hash(index),previous=table[slot];table[slot]=index;
      if(previous<0||index-previous>65535||text.charCodeAt(previous)!==text.charCodeAt(index)||text.charCodeAt(previous+1)!==text.charCodeAt(index+1)||text.charCodeAt(previous+2)!==text.charCodeAt(index+2)||text.charCodeAt(previous+3)!==text.charCodeAt(index+3)){index++;continue;}
      let end=index+4;while(end<text.length&&text.charCodeAt(previous+end-index)===text.charCodeAt(end))end++;
      const literal=index-anchor,match=end-index-4;
      output[written++]=(Math.min(literal,15)<<4)|Math.min(match,15);if(literal>=15)length(literal-15);
      for(let at=anchor;at<index;at++)output[written++]=text.charCodeAt(at);
      output[written++]=index-previous;if(match>=15)length(match-15);
      index=end;anchor=end;if(index+4<=text.length){table[hash(index-2)]=index-2;table[hash(index-1)]=index-1;}
    }
    const literal=text.length-anchor;output[written++]=Math.min(literal,15)<<4;if(literal>=15)length(literal-15);
    for(let at=anchor;at<text.length;at++)output[written++]=text.charCodeAt(at);
    const parts=[];for(let at=0;at<written;at+=8192)parts.push(String.fromCharCode(...output.subarray(at,Math.min(written,at+8192))));
    return compressedPrefix+text.length+':'+parts.join('');
  }
  function decompress(text){
    if(typeof text!=='string'||!text.startsWith(compressedPrefix))throw Error('Unsupported compressed save text');
    const separator=text.indexOf(':',compressedPrefix.length),expected=Number(text.slice(compressedPrefix.length,separator)),payload=text.slice(separator+1);
    if(separator<0||!Number.isSafeInteger(expected)||expected<0||expected>maxTextUnits||payload.length>expected+Math.ceil(expected/255)+16)throw Error('Invalid compressed save length');
    const output=new Uint16Array(expected);let index=0,written=0;
    const length=base=>{let result=base;if(base===15){let next;do{if(index>=payload.length)throw Error('Truncated compressed save length');next=payload.charCodeAt(index++);if(next>255)throw Error('Invalid compressed save length unit');result+=next;if(result>expected)throw Error('Oversized compressed save length');}while(next===255);}return result;};
    while(index<payload.length){
      const token=payload.charCodeAt(index++);if(token>255)throw Error('Invalid compressed save token');
      const literal=length(token>>4);if(index+literal>payload.length||written+literal>expected)throw Error('Truncated compressed save literal');
      for(let at=0;at<literal;at++)output[written++]=payload.charCodeAt(index++);
      if(index===payload.length){if(token&15)throw Error('Missing compressed save offset');break;}
      const offset=payload.charCodeAt(index++);if(!offset||offset>written)throw Error('Invalid compressed save offset');
      const match=length(token&15)+4;if(written+match>expected)throw Error('Oversized compressed save match');
      for(let at=0;at<match;at++){output[written]=output[written-offset];written++;}
    }
    if(written!==expected)throw Error('Incomplete compressed save');
    // JSON.stringify emits lone surrogates as ASCII escapes. Decoding its valid
    // UTF-16 with the native decoder avoids millions of boxed argument values.
    if(typeof TextDecoder!=='undefined'){
      const little=new Uint8Array(new Uint16Array([0x1234]).buffer)[0]===0x34;
      try{return new TextDecoder(little?'utf-16le':'utf-16be',{fatal:true,ignoreBOM:true}).decode(new Uint8Array(output.buffer));}
      catch{/* Direct diagnostic text may contain lone units; preserve them too. */}
    }
    const parts=[];for(let at=0;at<expected;at+=8192)parts.push(String.fromCharCode(...output.subarray(at,Math.min(expected,at+8192))));return parts.join('');
  }
  function stringify(state){return large(state)?compress(JSON.stringify({...state,saveSlotVersion:3})):JSON.stringify({...state,saveSlotVersion:1});}
  function parse(text){const compressed=typeof text==='string'&&text.startsWith(compressedPrefix),value=unpack(JSON.parse(compressed?decompress(text):jsonText(text)));if(compressed&&value?.saveSlotVersion!==3)throw Error('Unsupported compressed save');return value;}
  window.nativeSaveCodec=Object.freeze({pack,unpack,stringify,parse,compress,decompress,version,slotVersion:3,format,limits:Object.freeze({maxNodes,maxShapes,maxStrings,maxTextUnits})});
})();
