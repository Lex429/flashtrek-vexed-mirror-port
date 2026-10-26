"""Package locally synthesized, user-written narration with measured cue times."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import wave

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--voice', default='Microsoft David Desktop')
args = parser.parse_args()
story = json.loads((ROOT/'tools/opening-story.json').read_text(encoding='utf-8'))
build = ROOT/'test-results/opening-cinematic/narration-build'
out = ROOT/'html-games/broken-mirror-port/assets/opening'
out.mkdir(parents=True, exist_ok=True)
wav_path = build/'opening-narration.wav'
with wave.open(str(build/'cue-00.wav'), 'rb') as first:
    params = first.getparams()
rate, frame_bytes = params.framerate, params.sampwidth*params.nchannels
cursor = 0
cues = []
with wave.open(str(wav_path), 'wb') as target:
    target.setparams(params)

    def silence(seconds):
        global cursor
        count = round(seconds*rate)
        target.writeframes(b'\x00'*(count*frame_bytes))
        cursor += count

    silence(story['leadSeconds'])
    for index, cue in enumerate(story['cues']):
        start = cursor/rate
        with wave.open(str(build/f'cue-{index:02}.wav'), 'rb') as clip:
            assert clip.getparams()[:3] == params[:3]
            target.writeframes(clip.readframes(clip.getnframes()))
            cursor += clip.getnframes()
        speech_end = cursor/rate
        silence(cue['pause'])
        cues.append({key: cue[key] for key in ['scene', 'chapter', 'location', 'direction', 'text']} |
                    dict(start=round(start, 4), speechEnd=round(speech_end, 4), end=round(cursor/rate, 4)))
    title_start = cursor/rate
    silence(story['tailSeconds'])
audio_path = out/'opening-narration.mp3'
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav_path),
                '-codec:a', 'libmp3lame', '-b:a', '96k', str(audio_path)], check=True)
manifest = dict(version=1, title=story['title'], audio='assets/opening/opening-narration.mp3',
                duration=round(cursor/rate, 4), titleStart=round(title_start, 4),
                voice=dict(name=args.voice, type='offline synthetic narration',
                           delivery='Phrase rate, volume and pauses follow the supplied directions; no actor imitation.'),
                audioSha256=hashlib.sha256(audio_path.read_bytes()).hexdigest(), cues=cues)
(out/'cinematic.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(dict(duration=manifest['duration'], cues=len(cues), bytes=audio_path.stat().st_size, voice=args.voice)))
