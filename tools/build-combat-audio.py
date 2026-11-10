"""Render deterministic combat variants from the game's existing recordings.

Requires ffmpeg, NumPy and SciPy. No network or model service is used.
Run normally to rebuild, or --check to verify assets and their source hashes.
"""
import argparse
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'html-games/broken-mirror-port/assets/game-sounds'
MANIFEST = ASSETS / 'manifest.json'
RATE = 32000
VERSION = 1
# Seconds, recorded entry offset ms, body join, lowpass Hz, attack ms, release ms, peak.
# The first entry reproduces the approved beam exactly.
PHASER_VARIANTS = (
    (.48, 0,  .40, 3400, 4, 55, .110),
    (.54, 12, .32, 3650, 5, 66, .108),
    (.42, 25, .51, 3150, 3, 45, .112),
    (.59, 6,  .28, 3850, 6, 72, .107),
    (.46, 32, .46, 3300, 4, 50, .113),
    (.61, 16, .56, 3600, 5, 64, .109),
    (.44, 9,  .34, 3950, 3, 43, .111),
    (.56, 28, .49, 3250, 6, 68, .106),
    (.50, 19, .30, 3750, 4, 58, .114),
    (.58, 3,  .53, 3450, 5, 75, .108),
    (.43, 35, .38, 3550, 3, 48, .112),
    (.52, 22, .57, 3900, 5, 62, .110),
)

# profile, primary, supporting texture, seconds, visual core seconds, target peak
PROFILES = [
    ('phaser', 'laser', 'laser', .60, .18, .11),
    ('laser', 'laser', 'phaser', .34, .18, .23),
    ('disruptor', 'disruptor', 'pulse', .24, .07, .24),
    ('pulse', 'pulse', 'phaser', .18, .045, .21),
    ('torpedo', 'torpedo', 'disruptor', .40, .06, .27),
    ('quantum', 'quantum', 'torpedo', .42, .055, .27),
    ('shieldLight', 'shield', 'phaser', .28, .025, .18),
    ('shieldHeavy', 'shield', 'hull', .46, .035, .25),
    ('shieldBreak', 'shield', 'disruptor', .68, .03, .27),
    ('hullLight', 'hull', 'pulse', .31, .02, .18),
    ('hullHeavy', 'hull', 'disruptor', .58, .025, .25),
    ('hullTorpedo', 'hull', 'torpedo', .79, .025, .27),
]


def decode(path):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', str(RATE), '-'], capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype='<f4').astype(np.float64)


def encode(samples, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', '-',
                    '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '96k', '-write_xing', '1', str(path)],
                   input=np.asarray(samples, dtype='<f4').tobytes(), capture_output=True, check=True)


@lru_cache(maxsize=None)
def source(file):
    samples = decode(ASSETS / file)
    peak = max(.00001, float(np.max(np.abs(samples))))
    active = np.flatnonzero(np.abs(samples) >= peak * .025)
    start = max(0, int(active[0]) - int(.001 * RATE)) if len(active) else 0
    return samples[start:] / peak


def band(samples, low, high):
    sos = signal.butter(2, [low, high], btype='bandpass', fs=RATE, output='sos')
    return signal.sosfilt(sos, samples)


def stretch(samples, length, pitch=1):
    return np.interp(np.arange(length) * pitch, np.arange(len(samples)), samples, right=0)


def delayed(samples, seconds):
    shift = int(seconds * RATE)
    return np.pad(samples, (shift, 0))[:len(samples)]


def smooth_ship_beam(primary, variant):
    seconds, entry_ms, body_join, cutoff, attack_ms, release_ms, _ = PHASER_VARIANTS[variant]
    length = round(seconds * RATE)
    # The source contains a stray click, a gap, one actual ship beam and several
    # seconds of silence. Isolate the longest sustained burst by energy.
    hop = round(.01 * RATE)
    frames = np.pad(primary, (0, (-len(primary)) % hop)).reshape(-1, hop)
    rms = np.sqrt(np.mean(frames * frames, axis=1))
    active = np.flatnonzero(rms >= np.max(rms) * .12)
    runs = np.split(active, np.flatnonzero(np.diff(active) > 1) + 1)
    burst = max(runs, key=len)
    recorded = primary[max(0, int(burst[0] * hop) - round(.025 * RATE)):
                       min(len(primary), int((burst[-1] + 1) * hop) + round(.025 * RATE))]
    audible = np.flatnonzero(np.abs(recorded) >= np.max(np.abs(recorded)) * .08)
    recorded = recorded[max(0, int(audible[0]) - 32):min(len(recorded), int(audible[-1]) + round(.025 * RATE))]
    recorded = recorded[round(entry_ms * RATE / 1000):]
    # Vary entry, body and release while retaining the recorded beam's pitch.
    assert len(recorded) >= length, 'The source beam is shorter than its firing variant'
    join, overlap = round(length * body_join), round(.025 * RATE)
    front, tail = recorded[:join + overlap], recorded[-(length - join):]
    cross = np.linspace(0, 1, overlap)
    result = np.concatenate([front[:join], front[join:] * (1 - cross) + tail[:overlap] * cross, tail[overlap:]])
    result = signal.sosfilt(signal.butter(2, cutoff, fs=RATE, output='sos'), result)
    result -= np.mean(result)
    result *= .72 / max(.00001, float(np.max(np.abs(result))))
    attack = round(attack_ms * RATE / 1000)
    result[:attack] *= np.linspace(0, 1, attack)
    release = round(release_ms * RATE / 1000)
    result[-release:] *= np.linspace(1, 0, release)
    return result


def envelope(length, hold, attack=.0015):
    t = np.arange(length) / RATE
    release = max(.015, length / RATE - hold)
    return np.minimum(1, t / attack) * np.exp(-5.5 * np.maximum(0, t - hold) / release)


def transient(samples, length):
    # Reuse the recorded transient at the front, without the originals' padding.
    peak_at = int(np.argmax(np.abs(samples[:int(.1 * RATE)])))
    start = max(0, peak_at - int(.002 * RATE))
    return stretch(samples[start:start + int(.035 * RATE)], length) * envelope(length, .003)


def render(profile, primary, supporting, seconds, core, variant):
    if profile == 'phaser':
        return smooth_ship_beam(primary, variant)
    length = round(seconds * RATE)
    t = np.arange(length) / RATE
    pitch = [1, .963, 1.038][variant]
    base = stretch(primary, length, pitch)
    texture = stretch(supporting, length, [1.025, .98, 1.05][variant])
    attack = transient(primary, length)
    if profile in ('phaser', 'laser'):
        low, high = (240, 8500) if profile == 'phaser' else (420, 10000)
        body = band(base, low, high - variant * 350)
        body *= 1 + .055 * np.sin(2 * np.pi * (42 + variant * 7) * t)
        result = (.82 * body + .11 * band(texture, 900, 6500)) * envelope(length, core)
        result += .24 * attack + .08 * delayed(body * envelope(length, core), .014 + variant * .003)
    elif profile in ('pulse', 'disruptor'):
        body = band(base, 130 if profile == 'disruptor' else 500, 7500)
        result = (.83 * body + .13 * band(texture, 800, 9500)) * envelope(length, core)
        result += .30 * attack + .17 * delayed(attack, .027 + variant * .006)
    elif profile in ('torpedo', 'quantum'):
        body = band(base, 55, 7000 if profile == 'quantum' else 4800)
        thump = np.sin(2 * np.pi * ((112 if profile == 'quantum' else 76) + variant * 5) * t) * np.exp(-t * 20)
        result = (.82 * body + .10 * band(texture, 1000, 8500)) * envelope(length, core)
        result += .26 * attack + .11 * thump
        result += .055 * delayed(body * envelope(length, .035), .035)
    elif profile.startswith('shield'):
        body = band(base, 450 if profile == 'shieldLight' else 180, 10500 - variant * 500)
        ring = np.sin(2 * np.pi * (1420 + variant * 130) * t) * np.exp(-t * 17)
        result = .78 * body * envelope(length, core) + .32 * attack + .055 * ring
        result += .07 * delayed(body * envelope(length, .01), .021 + variant * .004)
        if profile != 'shieldLight':
            result += .12 * band(texture, 70, 550) * envelope(length, .025)
        if profile == 'shieldBreak':
            falling = stretch(primary, length, .86 - variant * .025)
            result += .28 * band(falling, 100, 3600) * envelope(length, .11)
            result *= 1 + .18 * np.sin(2 * np.pi * (68 * t - 34 * t * t))
    else:
        body = band(base, 65 if profile != 'hullLight' else 280, 6500)
        result = .76 * body * envelope(length, core) + .43 * attack
        result += .13 * band(texture, 180, 8000) * envelope(length, .018)
        result += .11 * delayed(attack, .024) + .06 * delayed(attack, .057 + variant * .005)
        if profile != 'hullLight':
            frequency = 82 if profile == 'hullHeavy' else 54
            result += .15 * np.sin(2 * np.pi * (frequency + variant * 4) * t) * np.exp(-t * 12)
    result -= np.mean(result)
    result = np.tanh(result * 1.15)
    result *= .72 / max(.00001, float(np.max(np.abs(result))))
    # Snap the audible attack to the event and retain a click-free natural tail.
    active = np.flatnonzero(np.abs(result) > .072)
    trim = max(0, int(active[0]) - int(.001 * RATE)) if len(active) else 0
    result = result[trim:]
    fade_in, fade_out = min(48, len(result)), min(192, len(result))
    result[:fade_in] *= np.linspace(0, 1, fade_in)
    result[-fade_out:] *= np.linspace(1, 0, fade_out)
    return result


def metrics(samples):
    peak = float(np.max(np.abs(samples)))
    active = np.flatnonzero(np.abs(samples) > peak * .10)
    return {'durationSeconds': round(len(samples) / RATE, 6), 'peak': round(peak, 6),
            'rms': round(float(np.sqrt(np.mean(samples * samples))), 6),
            'onsetMs': round(float(active[0]) / RATE * 1000, 3) if len(active) else None}


def check(manifest):
    generated = [clip for clip in manifest['clips'].values() if clip.get('generator') == 'build-combat-audio.py']
    expected = 27 + len(PHASER_VARIANTS)
    assert len(generated) == expected, f'Expected {expected} generated sounds, found {len(generated)}'
    for clip in generated:
        path = ASSETS / clip['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == clip['sha256'], path
        for parent in clip['derivedFrom']:
            assert hashlib.sha256((ASSETS / parent['file']).read_bytes()).hexdigest() == parent['sha256'], parent
        measured = metrics(decode(path))
        assert measured['peak'] < .95 and measured['rms'] > .01, (path, measured)
        assert measured['onsetMs'] <= 10, (path, measured)
        assert measured == clip['metrics'], (path, measured, clip['metrics'])
    print(json.dumps({'checked': len(generated), 'sourceHashesValid': True, 'maxOnsetMs': max(c['metrics']['onsetMs'] for c in generated),
                      'maxPeak': max(c['metrics']['peak'] for c in generated)}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--profile', choices=[profile[0] for profile in PROFILES], help='Rebuild just one bank')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if args.check:
        check(manifest)
        return
    banks, preview, cue_sheet, elapsed = dict(manifest.get('banks', {})), [], [], 0
    for profile, primary, secondary, seconds, core, peak in PROFILES:
        if args.profile and args.profile != profile:
            continue
        banks[profile] = []
        if profile == 'phaser':
            original = manifest['clips']['phaser']
            samples = decode(ASSETS / original['file'])
            active = np.flatnonzero(np.abs(samples) >= np.max(np.abs(samples)) * .025)
            offset = max(0, int(active[0]) - 32)
            original.update(duration=None, offset=offset / RATE, metrics=metrics(samples[offset:]))
        count = len(PHASER_VARIANTS) if profile == 'phaser' else 3 if profile in ('laser', 'disruptor', 'pulse', 'torpedo', 'quantum') else 2
        for variant in range(count):
            kind, file = f'{profile}Variant{variant+1}', f'generated/{profile}-{variant+1}.mp3'
            sources = [manifest['clips'][key] for key in (primary, secondary)]
            samples = render(profile, source(sources[0]['file']), source(sources[1]['file']), seconds, core, variant)
            encode(samples, ASSETS / file)
            decoded, data = decode(ASSETS / file), (ASSETS / file).read_bytes()
            measurement = metrics(decoded)
            target_peak = PHASER_VARIANTS[variant][-1] if profile == 'phaser' else peak
            manifest['clips'][kind] = {'file': file, 'title': f'{profile} variation {variant+1}', 'generator': 'build-combat-audio.py',
                'generatorVersion': 6 if profile == 'phaser' else VERSION, 'derivedFrom': [{'file': clip['file'], 'sha256': clip['sha256']} for clip in {clip['file']:clip for clip in sources}.values()],
                'recipe': {'profile': profile, 'variant': variant+1, 'coreMs': round(core * 1000), 'sampleRate': RATE},
                'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'peak': target_peak, 'duration': None, 'offset': 0, 'metrics': measurement}
            if profile == 'phaser':
                seconds, entry_ms, body_join, cutoff, attack_ms, release_ms, _ = PHASER_VARIANTS[variant]
                manifest['clips'][kind]['recipe'].update(character='smooth-tos-ship-beam', outputSeconds=seconds,
                    pitch=1, sourceTreatment='body-crossfade', recordedEntryMs=entry_ms, bodyJoin=body_join,
                    lowpassHz=cutoff, attackMs=attack_ms, releaseMs=release_ms)
            banks[profile].append(kind)
            if variant == 0 or args.profile:
                cue_sheet.append({'profile': profile, 'startsAt': round(elapsed, 3)})
                part = np.concatenate([decoded * target_peak * .7 / max(.001, measurement['peak']), np.zeros(round(.30 * RATE))])
                preview.append(part)
                elapsed += len(part) / RATE
    manifest['banks'] = banks
    manifest['notes'] = ('Original recordings are preserved. Generated combat banks use locally processed source recordings; '
                         'their audible attacks begin at launch/contact. Null duration preserves each complete recording. '
                         'Only generated variations play in the phaser bank: the actual TOS ship beam at its natural pitch, '
                         'with a crossfaded body, soft high frequencies and a complete release. The original TNG recording remains archived. '
                         'Selection shuffles with private audio state.')
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    output = ROOT / 'test-results/combat-audio'
    preview_name = f'preview-{args.profile}' if args.profile else 'preview'
    encode(np.concatenate(preview), output / (preview_name + '.mp3'))
    (output / (preview_name + '-cues.json')).write_text(json.dumps(cue_sheet, indent=2) + '\n', encoding='utf-8')
    check(manifest)


if __name__ == '__main__':
    main()
