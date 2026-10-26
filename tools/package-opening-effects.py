"""Measure a listening preview using the browser's actual destruction timeline.

The runtime triggers game explosion clips directly. It does not load this mix.
Run tests/browser-opening-campaign.py --continuous before generating the preview.
"""
import importlib.util,json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('recut_audio',ROOT/'tools/build-opening-recut.py')
recut=importlib.util.module_from_spec(spec);spec.loader.exec_module(recut)
out=ROOT/'html-games/broken-mirror-port/assets/opening'
build=ROOT/'test-results/opening-campaign'
manifest=json.loads((out/'cinematic.json').read_text(encoding='utf8'))
captured=json.loads((build/'continuous.json').read_text(encoding='utf8'))
events=captured['renderer']['campaign']['events']
samples=round(manifest['duration']*recut.RATE)
mix=np.zeros((samples,2),np.float32)
files={k:f'../flashtrek-broken-mirror/showcase-assets/explode{k}.mp3' for k in ['small','large']}
clips={k:recut.decode(ROOT/'html-games/flashtrek-broken-mirror/showcase-assets'/f'explode{k}.mp3') for k in files}
active=[]
for event in sorted(events,key=lambda e:e['at']):
    at=event['at'];a=round(at*recut.RATE)
    clip=clips['small' if event['type'] in [18,7] else 'large']
    speech=any(c['start']-.1<=at<=c['speechEnd']+.1 for c in manifest['cues'])
    clip=clip*(.24*(.6 if speech else 1));b=min(samples,a+len(clip))
    active=[v for v in active if v['end']>a]
    if len(active)>=3:
        oldest=active.pop(0);offset=a-oldest['start']
        mix[a:oldest['end']]-=oldest['clip'][offset:offset+oldest['end']-a]
    if b>a:mix[a:b]+=clip[:b-a];active.append(dict(start=a,end=b,clip=clip))
voice=recut.decode(out/'opening-narration.mp3')[:samples]
music=recut.decode(out/'opening-music-edit.mp3')[:samples]
length=min(len(voice),len(music),len(mix))
combined=voice[:length]*.95+music[:length]*.62+mix[:length]*.4
hop=640;n=length//hop
vrms=np.sqrt(np.mean(voice[:n*hop].reshape(n,hop,2)**2,axis=(1,2)))*.95
brms=np.sqrt(np.mean((music[:n*hop]*.62+mix[:n*hop]*.4).reshape(n,hop,2)**2,axis=(1,2)))
active=vrms>.035
separation=20*np.log10(np.maximum(vrms[active],1e-8)/np.maximum(brms[active],1e-8))
report=dict(duration=manifest['duration'],weaponSounds=False,explosionEvents=len(events),maximumConcurrent=3,
    defaultGains=dict(narration=.95,music=.62,effects=.4),voicePeak=float(np.max(np.abs(voice))),musicPeak=float(np.max(np.abs(music))),
    effectsPeak=float(np.max(np.abs(mix))),defaultMixPeak=float(np.max(np.abs(combined))),
    speechMedianForegroundDb=float(np.median(separation)),clippingSamples=int(np.sum(np.abs(combined)>=1)))
assert report['clippingSamples']==0,report
assert report['speechMedianForegroundDb']>8,report
recut.encode(combined,build/'balanced-listening-preview.mp3')
(build/'audio-mix-validation.json').write_text(json.dumps(report,indent=2)+'\n')
manifest.pop('effects',None);manifest['explosions']=files;manifest['audioMix']=report
manifest['effectsSourceFiles']=list(files.values())
(out/'cinematic.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,indent=2))
