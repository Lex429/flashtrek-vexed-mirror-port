const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),game=path.join(root,'html-games/broken-mirror-port');
const manifest=JSON.parse(fs.readFileSync(path.join(game,'assets/opening/cinematic.json'),'utf8'));
function storyboard(){const window={};vm.runInNewContext(fs.readFileSync(path.join(game,'opening-storyboard.js'),'utf8'),{window});return window.nativeOpeningStoryboard;}
function director(){const window={};vm.runInNewContext(fs.readFileSync(path.join(game,'opening-campaign.js'),'utf8'),{window});return window.nativeOpeningCampaign;}
test('the supplied narration is packaged offline with ordered, measured subtitle cues',()=>{
 const story=JSON.parse(fs.readFileSync(path.join(root,'tools/opening-story.json'),'utf8'));
 assert.equal(manifest.cues.length,11);assert.equal(manifest.cues.map(c=>c.text).join(' '),story.cues.map(c=>c.text).join(' '));
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(game,manifest.audio))).digest('hex'),manifest.audioSha256);
 assert.ok(manifest.duration>85&&manifest.duration<130);let end=0;
 for(const c of manifest.cues){assert.ok(c.start>=end-.001);assert.ok(c.speechEnd>c.start);assert.ok(c.end>=c.speechEnd);assert.doesNotMatch(c.text,/\[(thoughtful|whisper|tense|angry|.*pause)\]/);end=c.end;
  let previous=c.start;for(const word of c.words){assert.ok(word.start>=previous-.001);assert.ok(word.end>=word.start);assert.ok(word.end<=c.speechEnd+.001);previous=word.end;}
 }
 assert.equal(end,manifest.titleStart);assert.equal(manifest.voice.type,'user-supplied recording');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(game,manifest.voice.source))).digest('hex'),manifest.voice.sourceSha256);
 assert.equal(manifest.voice.sourceSha256,'abc3bb07966216a597916c7643e36e4cde25d7c8c69b017a8775a7b90b6432ca');
});
test('each spoken passage receives its planned scene and matching subtitle, followed by the title',()=>{
 const api=storyboard();
 for(const c of manifest.cues){const frame=api.sample(manifest,(c.start+c.speechEnd)/2);assert.equal(frame.scene,c.scene);assert.equal(frame.subtitle,c.text);}
 assert.equal(api.sample(manifest,manifest.titleStart+2).scene,'title');assert.equal(api.sample(manifest,manifest.titleStart+2).subtitle,'');
});
test('the campaign covers every film second, with recurring Enterprise raids and distinct worlds',()=>{
 const api=director(),before=JSON.stringify(manifest),cuts=api.cuts(manifest);let end=0;
 for(const cut of cuts){assert.equal(cut.start,end);assert.ok(cut.end>cut.start);end=cut.end;}
 assert.equal(end,manifest.duration);assert.ok(cuts.filter(c=>c.kind==='raid').length>=4);assert.ok(cuts.some(c=>c.kind==='bombardment'));
 assert.ok(new Set(cuts.map(c=>c.world)).size>=10);assert.ok(api.types.includes(426)&&api.types.includes(427));assert.ok(api.types.length>=20);
 for(let t=0;t<manifest.duration;t+=.07){const cut=api.shotAt(manifest,t);assert.ok(cut.local>=0&&Number.isFinite(cut.progress));assert.ok(cut.progress>=0&&cut.progress<=1);}
 assert.equal(JSON.stringify(manifest),before);
});
test('reduced motion freezes choreography while narration and subtitles continue',()=>{
 const api=storyboard(),c=manifest.cues.find(c=>c.scene==='war'),a=api.sample(manifest,c.start+1,true),b=api.sample(manifest,c.start+3,true);
 assert.equal(a.visualTime,b.visualTime);assert.notEqual(a.time,b.time);assert.equal(a.subtitle,c.text);assert.ok(a.reducedMotion);
});
test('opening playback blocks the shared world clock without modifying the saved clock',()=>{
 const window={nativeOpeningCinematic:{active:true}},document={hidden:false};
 vm.runInNewContext(fs.readFileSync(path.join(game,'simulation-clock.js'),'utf8'),{window,document});
 const state={shipSimulation:{version:1,seconds:1234}};
 assert.equal(window.nativeSimulation.advance(state,120),0);assert.equal(state.shipSimulation.seconds,1234);
 window.nativeOpeningCinematic.active=false;assert.equal(window.nativeSimulation.advance(state,.25),.25);assert.equal(state.shipSimulation.seconds,1234.25);
});

test('music accents align to decloaking, battle consequences and both title reveals',()=>{
 for(const hit of manifest.musicEdit.hits){
  const edit=manifest.musicEdit.segments.find(s=>hit.timeline>=s.timelineStart&&hit.timeline<s.timelineEnd);
  assert.ok(edit,hit.event);assert.ok(Math.abs(edit.timelineStart+hit.source-edit.sourceStart-hit.timeline)<.001,hit.event);
 }
 const hits=manifest.musicEdit.hits.map(h=>h.timeline);
 assert.deepEqual(hits,[manifest.events.klingonDecloakAt,manifest.events.klingonFirstVolleyAt,manifest.events.heroDisabledAt,manifest.events.heroDestroyedAt,...manifest.events.titleHits]);
 assert.equal(manifest.audioMix.clippingSamples,0);assert.ok(manifest.audioMix.speechMedianForegroundDb>8);
 assert.ok(fs.statSync(path.join(game,manifest.music)).size>100000);
});

test('camera changes retain a battle encounter through shield failures, destruction and aftermath',()=>{
 const api=director(),cuts=api.cuts(manifest),war=cuts.filter(c=>c.id==='war');assert.equal(war.length,4);
 const origin=war[0].start;
 for(const c of war){const sample=api.shotAt(manifest,c.start+.1);assert.equal(sample.origin,origin);assert.equal(sample.id,'war');}
 assert.deepEqual(Array.from(war,c=>c.view),['wide','shield','wreck','aftermath']);
});

test('shared cloak transitions reverse smoothly without altering ship state',()=>{
 const window={};vm.runInNewContext(fs.readFileSync(path.join(root,'html-games/flashtrek-broken-mirror/cloak-effects.js'),'utf8'),{window});
 const c=window.CinematicCloak,state={cloaked:false};assert.equal(c.mix(state,0),0);state.cloaked=true;assert.equal(c.mix(state,100),0);
 assert.equal(c.mix(state,800),.5);state.cloaked=false;assert.equal(c.mix(state,800),.5);assert.equal(c.mix(state,2200),0);
 assert.equal(c.opacity(1,.025),.025);assert.deepEqual(state,{cloaked:false});
});

test('the film can advance the real parallax renderer without advancing the gameplay sky',()=>{
 const window={};const sandbox={window};
 for(const file of ['flight-reference-data.js','vexed-space-model.js','vexed-space.js'])vm.runInNewContext(fs.readFileSync(path.join(game,file),'utf8'),sandbox);
 const live=window.vexedSpace,initial=JSON.stringify(live.state),film=live.create();
 film.update(2,{locx:10,locy:4,speed:100});assert.equal(JSON.stringify(live.state),initial);assert.notEqual(film.state.elapsed,live.state.elapsed);
 film.enterSystem(38,true);assert.equal(live.state.system,1);assert.equal(film.state.system,38);assert.equal(film.state.stars.length,350);
});
