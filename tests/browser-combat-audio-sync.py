"""Exercise real shots and hit animations; record their mixed audio with video."""
import base64
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results/combat-audio'
OUTPUT.mkdir(parents=True, exist_ok=True)
CATALOGUE = json.loads((ROOT / 'html-games/broken-mirror-port/assets/game-sounds/manifest.json').read_text())
PHASER_COUNT = len(CATALOGUE['banks']['phaser'])
BASE = os.environ.get('GAME_BASE_URL', 'http://127.0.0.1:7790').rstrip('/')

CAPTURE = r"""(() => {
  const original=AudioContext.prototype.createDynamicsCompressor;
  window.__audioPeaks=[];
  const createSource=AudioContext.prototype.createBufferSource;
  window.__audioVoices=[];
  AudioContext.prototype.createBufferSource=function(...args){
    const source=createSource.apply(this,args),start=source.start.bind(source),stop=source.stop.bind(source),context=this;
    let record=null;
    source.start=(at,offset,duration)=>{
      record={at,offset,duration,bufferDuration:source.buffer.duration,endedAt:null,stopped:false};
      __audioVoices.push(record);source.addEventListener('ended',()=>record.endedAt=context.currentTime,{once:true});
      return start(at,offset,duration);
    };
    source.stop=(...stopArgs)=>{if(record)record.stopped=true;return stop(...stopArgs);};
    return source;
  };
  AudioContext.prototype.createDynamicsCompressor=function(...args){
    const compressor=original.apply(this,args),connect=compressor.connect.bind(compressor),context=this;
    compressor.connect=(target,...rest)=>{
      if(target!==context.destination)return connect(target,...rest);
      const analyser=context.createAnalyser();analyser.fftSize=1024;
      const recording=context.createMediaStreamDestination();
      window.__combatAudioStream=recording.stream;
      __audioPeaks.push({analyser,peak:0});connect(recording);connect(analyser);return analyser.connect(target);
    };
    return compressor;
  };
  setInterval(()=>{for(const probe of __audioPeaks){const data=new Float32Array(1024);probe.analyser.getFloatTimeDomainData(data);for(const value of data)probe.peak=Math.max(probe.peak,Math.abs(value));}},8);
})();"""

report, errors, failed = {'shots': [], 'tiers': []}, [], []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel=os.environ.get('BROWSER_CHANNEL', 'msedge'))
    page = browser.new_page(viewport={'width': 1280, 'height': 850})
    page.add_init_script(CAPTURE)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
    page.goto(BASE + '/html-games/broken-mirror-port/index.html')
    page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
    page.locator('#menu-sound-toggle').click();page.locator('#menu-sound-toggle').click()
    try:
        page.wait_for_function('(count)=>nativeGameSounds.snapshot().decoded.length===count&&nativeGameSounds.snapshot().state==="running"', arg=len(CATALOGUE['clips']), timeout=30000)
    except Exception:
        print(json.dumps({'expectedClips':len(CATALOGUE['clips']),'sounds':page.evaluate('nativeGameSounds.snapshot()'),'errors':errors,'failed':failed}),flush=True)
        raise
    page.evaluate('startNativeDevGame()')
    page.wait_for_function('()=>nativeNpcDev.getState()&&nativeCivilianTraffic.effectsReady()', timeout=120000)
    page.evaluate(r"""()=>{
      const state=nativeNpcDev.getState(),template=JSON.parse(JSON.stringify(state.civilianTraffic.ships[0]));
      window.__audioState=state;nativeCivilianTraffic.advance=()=>{};nativeSolEconomy.advance=()=>{};
      nativeShipMotion.stop(state);nativeCombatShots.reset();nativeShipEffects.reset();nativeEnvironmentalImpacts.reset();
      for(const key of ['localCruise','arrivalApproach','localLeg','motionKick','motionSpin'])delete state[key];
      Object.assign(state,{devMode:false,system:1,localBody:3,x:100000,y:100000,angle:0,speed:0,phase:'cruise',landed:false});
      const origin=vexedSolFlight.shipPosition(state);
      window.__audioTarget={...template,id:98601,name:'Audio timing target',shipType:47,system:1,x:origin.x+220,y:origin.y,heading:0,speed:0,hull:10000,shields:10000,phase:'cruise',scriptedDemo:'audio-sync'};
      for(const key of ['localLeg','journey','motionKick','motionSpin','combatAI','task','berth'])delete __audioTarget[key];
      nativeShipMotion.stop(__audioTarget);state.civilianTraffic.ships=[__audioTarget];state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];state.solEconomy.freighters=[];
      nativeShipSystems.invalidate(state);
      window.__paintedShots={};const paint=window.paintShowcaseWeaponShot;
      window.paintShowcaseWeaponShot=function(ctx,shot,...rest){
        if(shot.event&&!__paintedShots[shot.event.id])__paintedShots[shot.event.id]={wall:performance.now(),kind:shot.kind};
        return paint(ctx,shot,...rest);
      };
      window.__restoreAudioTargetEquipment=()=>{
        // Each audio case needs a healthy target; device-wear persistence has
        // its own gameplay regressions and must not collapse later shield tiers.
        for(const item of Object.values(__audioTarget.shipEquipment?.instances||{})){
          if(item.category==='shield'||item.category==='engineering')item.condition=100;
        }
      };
      window.__launchAudioShot=id=>{
        nativeCombatShots.reset();nativeShipEffects.reset();nativeEnvironmentalImpacts.reset();
        __restoreAudioTargetEquipment();
        delete state.shipEquipment;delete state.weaponLoadout;state.weapons=[id];state.weaponInventory=[];
        __audioTarget.hull=10000;__audioTarget.shields=10000;
        nativeWeaponLoadout.ensure(state);nativeShipSystems.invalidate(state);
        const result=nativeCombatShots.fire({state,getTarget:()=>nativeShipDefinitions.describe(state,__audioTarget,{category:'civilian'})});
        window.__audioEvent=result.event;window.__audioVisual=result.shot;
        return {ok:result.ok,error:result.error,id:result.event?.id,kind:result.kind};
      };
    }""")
    page.wait_for_timeout(350)
    page.evaluate(r"""()=>{
      const video=document.querySelector('#space').captureStream(60);
      const stream=new MediaStream([...video.getVideoTracks(),...__combatAudioStream.getAudioTracks()]);
      const options={mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:2500000,audioBitsPerSecond:128000};
      const recorder=new MediaRecorder(stream,options),parts=[];
      window.__combatRecorder=recorder;
      window.__combatRecording=new Promise(resolve=>{
        recorder.ondataavailable=event=>{if(event.data.size)parts.push(event.data);};
        recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(parts,{type:'video/webm'}));};
      });
      recorder.start(250);
    }""")

    for weapon, family in [(1, 'phaser'), (2, 'laser'), (6, 'disruptor'), (9, 'pulse'), (15, 'torpedo'), (16, 'quantum')]:
        selected = []
        for _ in range(PHASER_COUNT if family == 'phaser' else 3):
            shot = page.evaluate('__launchAudioShot', weapon)
            assert shot['ok'], shot
            page.wait_for_function('()=>__audioEvent.resolved&&nativeGameSounds.snapshot().recent.some(item=>item.phase==="contact"&&item.eventId===__audioEvent.id)', timeout=5000)
            page.wait_for_function('()=>!!__paintedShots[__audioEvent.id]', timeout=5000)
            result = page.evaluate(r"""()=>{
              const sound=nativeGameSounds.snapshot().recent.filter(item=>item.eventId===__audioEvent.id);
              const descriptor=nativeShipDefinitions.describe(__audioState,__audioTarget,{category:'civilian'});
              const flash=nativeShipEffects.snapshot(descriptor).flash;
              return {id:__audioEvent.id,kind:__audioEvent.kind,launchedAt:__audioEvent.launchedAt,resolvedAt:__audioEvent.resolvedAt,
                launch:sound.find(item=>item.phase==='launch'),contact:sound.find(item=>item.phase==='contact'),flash,paint:__paintedShots[__audioEvent.id]};
            }""")
            assert result['launch']['kind'] == family, result
            assert abs(result['launch']['simulationAt'] - result['launchedAt']) < .000001, result
            assert abs(result['contact']['simulationAt'] - result['resolvedAt']) < .000001, result
            assert result['flash']['weaponEventId'] == result['id'], result
            assert abs(result['flash']['born'] / 1000 - result['contact']['simulationAt']) < .000001, result
            assert result['contact']['simulationAt'] > result['launch']['simulationAt'], result
            assert result['launch']['attackMs'] <= 10 and result['contact']['attackMs'] <= 10, result
            assert result['launch']['delayMs'] < 30 and result['contact']['delayMs'] < 30, result
            assert -10 <= result['paint']['wall'] - result['launch']['at'] < 150, result
            selected.append(result['launch']['variant'])
            report['shots'].append(result)
            page.wait_for_timeout(130)
            if family == 'phaser':
                assert .40 <= result['launch']['duration'] <= .65, result
                assert result['launch']['variant'].startswith('phaserVariant'), result
                assert .94 <= result['launch']['variationGain'] <= 1.06, result
        assert len(set(selected)) == (PHASER_COUNT if family == 'phaser' else 3), (family, selected)
        if family == 'phaser':
            page.wait_for_timeout(650)
            phasers = report['shots'][-PHASER_COUNT:]
            for result in phasers:
                voice = page.evaluate('(at)=>__audioVoices.find(voice=>Math.abs(voice.at-at)<.000001&&voice.duration>=.40&&voice.duration<=.65)', result['launch']['scheduledAt'])
                assert voice and voice['endedAt'] is not None and not voice['stopped'], voice
                assert abs(voice['endedAt'] - voice['at'] - voice['duration']) < .12, voice
                result['naturalCompletion'] = voice
            report['rapidPhaserCadenceMs'] = [round(b['launch']['at'] - a['launch']['at'], 2) for a, b in zip(phasers, phasers[1:])]

    for index, (profile, shield_fraction, damage_fraction, kind) in enumerate([
        ('shieldLight', 1, .02, 'beam'), ('shieldHeavy', 1, .18, 'beam'), ('shieldBreak', .015, .05, 'beam'),
        ('hullLight', 0, .02, 'beam'), ('hullHeavy', 0, .12, 'disruptor'), ('hullTorpedo', 0, .12, 'torpedo')]):
        event_id = 100000 + index
        page.evaluate(r"""([shieldFraction,damageFraction,kind,eventId])=>{
          nativeCombatShots.reset();nativeShipEffects.reset();nativeEnvironmentalImpacts.reset();
          __restoreAudioTargetEquipment();
          const state=__audioState,target=__audioTarget,descriptor=nativeShipDefinitions.describe(state,target,{category:'civilian'});
          const shield=descriptor.definition.ratedShields??descriptor.definition.shields,hull=descriptor.definition.hull;
          target.hull=hull;target.shields=shield*shieldFraction;target.phase='cruise';
          nativeShipSystems.refreshShip(state,target,'civilian',1);
          const damage=damageFraction*(shieldFraction>0?shield:hull),from=vexedSolFlight.shipPosition(state);
          window.__audioTierHit=nativeCivilianTraffic.hit(state,target.id,damage,{kind,weaponEventId:eventId,source:'player',sourceId:'player',from});
        }""", [shield_fraction, damage_fraction, kind, event_id])
        try:
            page.wait_for_function('([profile,id])=>nativeGameSounds.snapshot().recent.some(item=>item.eventId===id&&item.profile===profile)', arg=[profile, event_id], timeout=5000)
        except Exception:
            failure = {'profile': profile, 'eventId': event_id, 'shots': len(report['shots']), 'tiers': report['tiers'], 'errors': errors,
                'state': page.evaluate('()=>({sounds:nativeGameSounds.snapshot(),hit:__audioTierHit,target:__audioTarget,player:{hull:__audioState.hull,shields:__audioState.shields,system:__audioState.system,x:__audioState.x,y:__audioState.y},clock:nativeSimulation.seconds(__audioState)})')}
            (OUTPUT / 'sync-failure.json').write_text(json.dumps(failure, indent=2), encoding='utf-8')
            raise
        tier = page.evaluate('(id)=>nativeGameSounds.snapshot().recent.filter(item=>item.eventId===id)', event_id)
        if profile == 'shieldBreak':
            assert {entry['kind'] for entry in tier} == {'shield', 'hull'}, tier
            page.screenshot(path=str(OUTPUT / 'shield-break.png'))
        report['tiers'].append({'profile': profile, 'audio': tier})
        page.wait_for_timeout(300)

    report['salvo'] = page.evaluate(r"""()=>{
      const state=__audioState;nativeCombatShots.reset();nativeShipEffects.reset();nativeEnvironmentalImpacts.reset();
      delete state.shipEquipment;delete state.weaponLoadout;state.weapons=[1,6,15];state.weaponInventory=[];
      __audioTarget.shields=10000;__audioTarget.hull=10000;__audioTarget.phase='cruise';
      nativeWeaponLoadout.ensure(state);nativeShipSystems.invalidate(state);
      const shots=[];for(let i=0;i<3;i++){const result=nativeCombatShots.fire({state,getTarget:()=>nativeShipDefinitions.describe(state,__audioTarget,{category:'civilian'})});shots.push({ok:result.ok,kind:result.kind,error:result.error});}
      return {shots,voices:nativeGameSounds.snapshot().active,limit:nativeGameSounds.snapshot().limits.voices};
    }""")
    assert all(shot['ok'] for shot in report['salvo']['shots']), report['salvo']
    assert report['salvo']['voices'] <= report['salvo']['limit'], report['salvo']
    page.wait_for_timeout(750)
    page.evaluate('__combatRecorder.stop()')
    encoded = page.evaluate('__combatRecording')
    (OUTPUT / 'combat-audio-demo.webm').write_bytes(base64.b64decode(encoded))
    report.update(peaks=page.evaluate('__audioPeaks.map(probe=>probe.peak)'), generatedClips=sum(bool(c.get('generator')) for c in CATALOGUE['clips'].values()), pageErrors=errors, failedResponses=failed)
    assert .01 < max(report['peaks']) < 1, report['peaks']
    assert not errors and not failed, (errors, failed)
    (OUTPUT / 'sync-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'shots': len(report['shots']), 'phaserVariations': PHASER_COUNT, 'rapidPhaserCadenceMs':report['rapidPhaserCadenceMs'], 'impactProfiles': [t['profile'] for t in report['tiers']],
        'launchAndImpactSameSimulationStepAsAnimation': True, 'maxSchedulingDelayMs': max(item[phase]['delayMs'] for item in report['shots'] for phase in ['launch', 'contact']),
        'peaks': report['peaks'], 'salvo':report['salvo'], 'recording': str(OUTPUT / 'combat-audio-demo.webm'), 'errors': errors}, indent=2))
    browser.close()
