"""Align the supplied recording and edit the installed song to the film cues.

The original recording and song are read only. Word timestamps are measured
locally with faster-whisper; this edit decision list remains independently
reviewable and does not stretch the recording or alter its pitch.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT/'html-games/broken-mirror-port'
OUT = GAME/'assets/opening'
BUILD = ROOT/'test-results/opening-recut'
SOURCE = OUT/'intro-speech-original.mp3'
SONG = GAME/'startup/the-void-beyond.mp3'
RATE = 32000
LEAD = 3.0


def run(args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def decode(path, channels=2):
    data = run(['ffmpeg','-v','error','-i',str(path),'-ac',str(channels),'-ar',str(RATE),'-f','f32le','-']).stdout
    return np.frombuffer(data, dtype='<f4').reshape(-1, channels).copy()


def encode(samples, path):
    result = subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac',str(samples.shape[1]),'-i','-',
        '-c:a','libmp3lame','-b:a','160k',str(path)], input=samples.astype('<f4').tobytes(), capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode())


def norm(word):
    value = re.sub(r'[^a-z0-9]', '', word.lower())
    return {'20':'twenty'}.get(value, value)


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    transcript = json.loads((ROOT/'tools/opening-narration-timing.json').read_text(encoding='utf8'))
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='abc3bb07966216a597916c7643e36e4cde25d7c8c69b017a8775a7b90b6432ca', 'Recording differs from measured word timings'
    words = [word for segment in transcript['segments'] for word in segment['words']]
    tokens = [norm(word['word']) for word in words]
    starts = ['the earth empire','its drive for','within twenty years','but revolution would','of those powers',
        'without the firm','empires rise and','humanity and the','the galaxy now','for a firm','and restore law']
    indices=[]
    for phrase in starts:
        target=phrase.split()
        found=next(i for i in range((indices[-1]+1) if indices else 0,len(tokens)-len(target)+1) if tokens[i:i+len(target)]==target)
        indices.append(found)
    story=json.loads((ROOT/'tools/opening-story.json').read_text(encoding='utf8'))
    cues=[]
    for index, cue in enumerate(story['cues']):
        first=indices[index]
        last=(indices[index+1] if index+1<len(indices) else len(words))-1
        cues.append({key:cue[key] for key in ['scene','chapter','location','direction','text']} |
            dict(start=round(LEAD+words[first]['start'],4),speechEnd=round(LEAD+words[last]['end'],4),
                 words=[dict(text=w['word'].strip(),start=round(LEAD+w['start'],4),end=round(LEAD+w['end'],4)) for w in words[first:last+1]]))
    title_start=round(cues[-1]['speechEnd']+1.25,4)
    duration=round(title_start+7.0,4)
    for i,cue in enumerate(cues):
        cue['end']=cues[i+1]['start'] if i+1<len(cues) else title_start
    klingon_word=next(w for w in cues[4]['words'] if norm(w['text'])=='klingons')
    reveal=round(klingon_word['start']+.12,4)
    war_first=round(cues[7]['start']+(cues[7]['end']-cues[7]['start'])*.62,4)
    events=dict(klingonDecloakAt=reveal,klingonFirstVolleyAt=round(reveal+.86,4),
                heroDisabledAt=war_first,heroDestroyedAt=round(war_first+.96,4),
                titleHits=[round(title_start+.5,4),round(title_start+.88,4)])
    # Continuous sections of the actual song, joined with equal-power fades.
    boundaries=[0,cues[1]['start'],cues[2]['start'],cues[3]['start'],cues[4]['start'],cues[5]['start'],
                cues[7]['start'],cues[8]['start'],cues[9]['start'],title_start,duration]
    source_starts=[0,19,45,96,120.76-(reveal-boundaries[4]),205,
                   240.76-(war_first-boundaries[6]),283,297,277.08-(events['titleHits'][0]-title_start)]
    names=['founding','expansion','annexation','revolution','klingons','anarchy','war','aftermath','resolve','title']
    song=decode(SONG);total=round(duration*RATE);music=np.zeros((total,2),np.float32)
    time=np.arange(total)/RATE
    segments=[]
    for index,name in enumerate(names):
        start,end=boundaries[index:index+2];source=source_starts[index]
        # Fade overlap extends the preceding passage, leaving each dramatic hit
        # at its exact measured musical-source and visual-timeline position.
        extra=.6 if index<len(names)-1 else 0
        a,b=round(start*RATE),min(total,round((end+extra)*RATE));length=b-a
        source_a=round(source*RATE);piece=song[source_a:source_a+length].copy()
        assert len(piece)==length
        gain=np.ones(length,np.float32)
        fade=min(round(.6*RATE),length)
        if index:gain[:fade]=np.sin(np.linspace(0,np.pi/2,fade))
        else:gain[:min(length,RATE*2)]=np.linspace(0,1,min(length,RATE*2))
        if extra:gain[-fade:]=np.cos(np.linspace(0,np.pi/2,fade))
        music[a:b]+=piece*gain[:,None]
        segments.append(dict(scene=name,timelineStart=round(start,4),timelineEnd=round(end,4),sourceStart=round(source,4),crossfade=.6))
    # Speech-aware automation uses measured words/phrases, not guessed intervals.
    duck=np.ones(total,np.float32)
    for cue in cues:
        a=cue['start'];b=cue['speechEnd']
        attack=np.clip((time-(a-.22))/.22,0,1)
        release=1-np.clip((time-(b+.14))/.7,0,1)
        duck=np.minimum(duck,1-.76*np.minimum(attack,release))
    music*=duck[:,None]
    music*=.48/max(.001,float(np.max(np.abs(music))))
    fade=min(total,round(2.1*RATE));music[-fade:]*=np.linspace(1,0,fade)[:,None]
    encode(music,OUT/'opening-music-edit.mp3')
    # Two-pass speech loudness normalization, preserving the supplied performance.
    analysis=run(['ffmpeg','-hide_banner','-i',str(SOURCE),'-af','highpass=f=70,loudnorm=I=-17:TP=-2:LRA=8:print_format=json','-f','null','-']).stderr.decode(errors='replace')
    loud=json.JSONDecoder().raw_decode(analysis[analysis.rindex('{'):])[0]
    parameters=':'.join(f'{key}={loud[value]}' for key,value in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
    filt=f'highpass=f=70,loudnorm=I=-17:TP=-2:LRA=8:{parameters}:linear=true'
    raw=run(['ffmpeg','-v','error','-i',str(SOURCE),'-af',filt,'-ar',str(RATE),'-ac','1','-f','f32le','-']).stdout
    voice=np.frombuffer(raw,dtype='<f4').reshape(-1,1)
    # Pad decoded PCM explicitly: filter timestamps must not discard the lead
    # or shorten the exported MP3 relative to the word/camera timeline.
    padded=np.zeros((total,1),np.float32);lead=round(LEAD*RATE)
    copied=min(len(voice),total-lead);padded[lead:lead+copied]=voice[:copied]
    encode(padded,OUT/'opening-narration.mp3')
    measured=decode(OUT/'opening-narration.mp3',channels=1)
    assert abs(len(measured)/RATE-duration)<.01, 'Narration export length differs from film'
    assert np.max(np.abs(measured[:lead-100]))<.0001, 'Narration lead was lost'
    manifest=dict(version=2,title='A Firm Hand',audio='assets/opening/opening-narration.mp3',music='assets/opening/opening-music-edit.mp3',
        explosions=dict(small='../flashtrek-broken-mirror/showcase-assets/explodesmall.mp3',large='../flashtrek-broken-mirror/showcase-assets/explodelarge.mp3'),duration=duration,titleStart=title_start,narrationLead=LEAD,
        voice=dict(name='Intro Speach.mp3',type='user-supplied recording',source='assets/opening/intro-speech-original.mp3',
            sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),processing='70 Hz high-pass; measured two-pass -17 LUFS / -2 dBTP normalization; original pace and pitch'),
        audioSha256=hashlib.sha256((OUT/'opening-narration.mp3').read_bytes()).hexdigest(),cues=cues,events=events,
        musicEdit=dict(source='startup/the-void-beyond.mp3',sourceSha256=hashlib.sha256(SONG.read_bytes()).hexdigest(),segments=segments,
            ducking=dict(speechGain=.24,attack=.22,release=.7),hits=[
              dict(source=120.76,timeline=reveal,event='Klingon decloak'),dict(source=121.62,timeline=events['klingonFirstVolleyAt'],event='First Klingon volley'),
              dict(source=240.76,timeline=war_first,event='Ship disabled'),dict(source=241.72,timeline=events['heroDestroyedAt'],event='Ship destruction'),
              dict(source=277.08,timeline=events['titleHits'][0],event='Flash Trek reveal'),dict(source=277.46,timeline=events['titleHits'][1],event='Vexed Mirror reveal')]))
    (OUT/'cinematic.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (BUILD/'audio-edit-decisions.json').write_text(json.dumps(manifest['musicEdit'],indent=2)+'\n',encoding='utf8')
    (BUILD/'narration-loudness-input.json').write_text(json.dumps(loud,indent=2)+'\n')
    print(json.dumps(dict(duration=duration,cues=[{k:c[k] for k in ['scene','start','speechEnd']} for c in cues],events=events),indent=2))


if __name__=='__main__':
    build()
