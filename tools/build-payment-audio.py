"""Build the cargo receipt cue from the existing Star Trek computer recordings."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from scipy import signal

ASSETS = Path(__file__).resolve().parents[1] / 'html-games/broken-mirror-port/assets/game-sounds'
MANIFEST = ASSETS / 'manifest.json'
RATE = 32000
SECONDS = 1.12
SOURCES = ('trade', 'confirm', 'navigation')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode(path):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le',
                             '-ac', '1', '-ar', str(RATE), '-'], capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype='<f4').astype(np.float64)


def recording(clip):
    samples = decode(ASSETS / clip['file'])
    start = int(clip.get('offset', 0) * RATE)
    samples = samples[start:start + int(clip['duration'] * RATE)]
    audible = np.flatnonzero(np.abs(samples) > np.max(np.abs(samples)) * .025)
    samples = samples[max(0, int(audible[0]) - 32):]
    return samples / max(.001, np.max(np.abs(samples)))


def tapered(samples):
    samples = samples.copy()
    attack, release = min(96, len(samples) // 3), min(1200, len(samples) // 3)
    samples[:attack] *= np.linspace(0, 1, attack)
    samples[-release:] *= np.linspace(1, 0, release) ** 2
    return samples


def build(manifest):
    originals = {key: recording(manifest['clips'][key]) for key in SOURCES}
    mix = np.zeros(round(SECONDS * RATE))

    def add(samples, at, level, pitch=1):
        shifted = np.interp(np.arange(0, len(samples), pitch), np.arange(len(samples)), samples)
        shifted = tapered(shifted)
        start = round(at * RATE)
        size = min(len(shifted), len(mix) - start)
        mix[start:start + size] += shifted[:size] * level

    # A soft console sweep, three rising transfer pulses, then the confirmation.
    sweep = signal.sosfilt(signal.butter(2, 2300, fs=RATE, output='sos'), originals['navigation'])
    add(sweep, 0, .13, .8)
    for at, pitch, level in [(0, .88, .30), (.14, 1, .27), (.28, 1.12, .24)]:
        add(originals['trade'], at, level, pitch)
    add(originals['confirm'], .56, .62)
    add(originals['confirm'], .60, .21, 1.5)
    add(originals['confirm'], .74, .13)
    add(originals['confirm'], .91, .055)
    mix = signal.sosfilt(signal.butter(2, 6500, fs=RATE, output='sos'), mix)
    mix *= .72 / max(.001, np.max(np.abs(mix)))
    target = ASSETS / 'generated/cargo-payment.mp3'
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1',
                    '-i', '-', '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '96k', str(target)],
                   input=np.asarray(mix, dtype='<f4').tobytes(), capture_output=True, check=True)
    rendered = decode(target)
    audible = np.flatnonzero(np.abs(rendered) > np.max(np.abs(rendered)) * .02)
    manifest['clips']['payment'] = {
        'file': 'generated/cargo-payment.mp3', 'title': 'Cargo payment confirmed',
        'generator': 'build-payment-audio.py', 'generatorVersion': 1,
        'derivedFrom': [{'file': manifest['clips'][key]['file'], 'sha256': manifest['clips'][key]['sha256']}
                        for key in SOURCES],
        'sha256': digest(target), 'bytes': target.stat().st_size,
        'peak': .21, 'duration': None, 'offset': 0,
        'recipe': {'character': 'starship-credit-transfer', 'confirmationMs': 560, 'countCompleteMs': 620},
        'metrics': {'durationSeconds': len(rendered) / RATE,
                    'onsetMs': round(float(audible[0]) / RATE * 1000, 3),
                    'peak': round(float(np.max(np.abs(rendered))), 5)}
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


def check(manifest):
    clip = manifest['clips']['payment']
    assert digest(ASSETS / clip['file']) == clip['sha256']
    for parent in clip['derivedFrom']:
        assert digest(ASSETS / parent['file']) == parent['sha256']
    assert clip['metrics']['onsetMs'] <= 10 and clip['metrics']['peak'] < .95
    assert 1 <= clip['metrics']['durationSeconds'] <= 1.2
    print(json.dumps({'payment': clip['file'], 'sourceHashesValid': True, **clip['metrics']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    catalogue = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if not args.check:
        build(catalogue)
    check(catalogue)
