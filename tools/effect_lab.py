"""Loopback lab storage and explicit promotion of the selected, tested effects.

python tools/effect_lab.py status
python tools/effect_lab.py promote            # review the selected version
python tools/effect_lab.py promote --apply    # only after 'put it in game'
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import threading
import time
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STATE = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.local/share'))) / 'VexedMirror'
FOLDER = 'html-games/flashtrek-broken-mirror/'
RELEASE = FOLDER + 'effect-release.json'
CORE = [FOLDER + name for name in ['effect-profiles.js', 'shield-gpu.js', 'shield-gpu-live.js', 'ship-lamps-gpu.js',
                                  'weapon-effects.js', 'effect-lab-metrics.js', 'effect-lab-fixture.js', 'effect-release.json']]
CORE += ['html-games/broken-mirror-port/' + name for name in
         ['ship-effects.js', 'flight-assets.js', 'ship-sprite-cache.js', 'ship-definitions.js',
          'combat-shots.js', 'effect-lab-scene.js', 'effect-lab-scene.html', 'effect-lab-game.js', 'index.html']]
LOCK = threading.RLock()
GAME_CHECKS = {}


def profile(value):
    if not isinstance(value, dict) or value.get('schema') != 1:
        raise ValueError('Invalid effect profile')
    for key, limit in [('id', 80), ('name', 100), ('implementation', 80)]:
        if not isinstance(value.get(key), str) or not 0 < len(value[key]) <= limit:
            raise ValueError('Invalid ' + key)
    modules = value.get('modules')
    if not isinstance(modules, list) or len(modules) > 8 or any(
            not isinstance(item, str) or not re.fullmatch(r'effect-candidates/[A-Za-z0-9_-]+\.js', item) for item in modules):
        raise ValueError('Invalid candidate modules')
    result = {key: value[key] for key in ['schema', 'id', 'name', 'implementation']}
    result['modules'] = modules
    for group, rules in [('shield', {'duration': (200, 1800), 'energy': (.5, 1.8)}), ('weapon', {'scale': (.5, 2)})]:
        result[group] = {}
        for key, (low, high) in rules.items():
            settings = value.get(group, {})
            if not isinstance(settings, dict):
                raise ValueError('Invalid '+group+' settings')
            number = settings.get(key)
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not low <= number <= high:
                raise ValueError('Invalid effect setting: ' + group + '.' + key)
            result[group][key] = number
    return result


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False), encoding='utf-8')
    temporary.replace(path)


def read(path, fallback):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else fallback


def versions(root, candidate=None):
    released = read(root / RELEASE, {}).get('modules', [])
    modules = sorted(set(released + (candidate or {}).get('modules', [])))
    # Include all game/effect owners: a timing comparison must not outlive a source change.
    owners = [str(path.relative_to(root)).replace('\\', '/') for directory in
              [root / 'html-games/broken-mirror-port', root / FOLDER]
              for path in directory.glob('*.js')]
    names = sorted(set(CORE + owners + [FOLDER + name for name in modules]))
    return {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in names}


class Lab:
    def __init__(self, root, state):
        self.root, self.state = Path(root).resolve(), Path(state).resolve() / 'effect-lab'

    def manifest(self):
        with LOCK:
            release = profile(read(self.root / RELEASE, None))
            candidates = read(self.root / (FOLDER + 'effect-candidates.json'), {'modules': []})
            session = read(self.state / 'session.json', None)
            return {'schema': 1, 'release': release, 'code': versions(self.root, (session or {}).get('candidate')),
                    'candidates': candidates, 'session': session,
                    'runs': read(self.state / 'runs.json', []),
                    'selected': read(self.state / 'selected.json', None),
                    'gameValidation': read(self.state / 'game-validation.json', {'status': 'not-run'})}

    def post(self, action, value):
        if not isinstance(value, dict):
            raise ValueError('Expected an object')
        with LOCK:
            if action == 'session':
                candidate = profile(value['candidate'])
                fixture = value.get('fixture', {})
                if not isinstance(fixture, dict) or len(json.dumps(fixture)) > 8000:
                    raise ValueError('Invalid fixture')
                result = {'schema': 1, 'candidate': candidate, 'fixture': fixture, 'updated': time.time()}
                atomic(self.state / 'session.json', result)
            elif action == 'runs':
                result = dict(value)
                result['profile'] = profile(value['profile'])
                if value.get('variant') not in ['baseline', 'candidate'] or value.get('fixture', {}).get('count') not in [10, 25, 50, 100, 200]:
                    raise ValueError('Invalid run')
                measurements = value.get('metrics', {})
                if not measurements.get('valid') or not 1 <= measurements.get('samples', 0) <= 20000 or not isinstance(measurements.get('fps'), (int, float)) or not math.isfinite(measurements['fps']):
                    raise ValueError('Run was interrupted or contains invalid measurements')
                session = read(self.state / 'session.json', {})
                if value.get('code') != versions(self.root, session.get('candidate') or result['profile']):
                    raise ValueError('Source changed during the test. Run it again.')
                if len(value.get('frames', [])) > 20000:
                    raise ValueError('Too many frame samples')
                frames=value.get('frames',[])
                if len(frames)!=measurements['samples'] or any(isinstance(ms,bool) or not isinstance(ms,(int,float)) or not math.isfinite(ms) or ms<=0 for ms in frames):
                    raise ValueError('Invalid raw frame samples')
                actual_fps=len(frames)*1000/sum(frames)
                if not math.isclose(actual_fps,measurements['fps'],rel_tol=1e-8):
                    raise ValueError('FPS does not match the saved frame samples')
                if value.get('counters',{}).get('minimumVisible')!=value['fixture']['count']:
                    raise ValueError('Requested fleet was not fully visible')
                result['id'] = hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False).encode()).hexdigest()[:20]
                result['saved'] = time.time()
                runs = read(self.state / 'runs.json', [])
                runs.append(result)
                atomic(self.state / 'runs.json', runs[-20:])
            elif action == 'stage':
                candidate = profile(value['profile'])
                runs = read(self.state / 'runs.json', [])
                run = next((run for run in reversed(runs) if run['id'] == value.get('runId') and run['variant'] == 'candidate' and run['profile'] == candidate), None)
                if not run:
                    raise ValueError('Measure this candidate before selecting it for the game.')
                if run['fixture'].get('shieldRenderer')=='legacy':
                    raise ValueError('Legacy shields are comparison only. Measure the candidate with Latest GPU before staging it.')
                code = versions(self.root, candidate)
                if run['code'] != code:
                    raise ValueError('Source changed since that test. Measure it again.')
                result = {'schema': 1, 'profile': candidate, 'runId': run['id'], 'code': code,
                          'selectedAt': time.time(), 'fixture': run['fixture'], 'metrics': run['metrics'],
                          'gameValidation': 'required-after-promotion'}
                atomic(self.state / 'selected.json', result)
            elif action == 'game-check':
                # A fresh browser context owns this fixture; the user's saves are
                # never read or written. Only one check may run per state folder.
                if self.state in GAME_CHECKS:
                    raise ValueError('An in-game check is already running.')
                fixture = value.get('fixture', {})
                if not isinstance(fixture, dict) or fixture.get('count') not in [10,25,50,100,200] or fixture.get('scenario') not in ['idle','shields','hull','weapons','battle','shielded-battle','full-battle','weapons-hits']:
                    raise ValueError('Invalid game fixture')
                for key,default,low,high in [('width',1280,320,3840),('height',720,240,2160),('dpr',1,1,2),('size',44,16,90),('rate',2,.5,8)]:
                    number=fixture.get(key,default)
                    if isinstance(number,bool) or not isinstance(number,(int,float)) or not math.isfinite(number) or not low<=number<=high:
                        raise ValueError('Invalid fixture '+key)
                chosen=profile(value['profile'])
                session=read(self.state/'session.json',{})
                if chosen not in [profile(read(self.root/RELEASE,None)),session.get('candidate')]:
                    raise ValueError('Save the candidate before checking it in game.')
                seconds=value.get('duration',10);warmup=value.get('warmup',3)
                if not isinstance(seconds,int) or not 2<=seconds<=30 or not isinstance(warmup,int) or not 0<=warmup<=10:
                    raise ValueError('Invalid game check duration')
                result={'status':'running','profile':chosen,'fixture':fixture,'started':time.time()}
                cancelled=threading.Event()
                atomic(self.state/'game-validation.json',result);GAME_CHECKS[self.state]=cancelled
                def work():
                    try:
                        from validate_effect_game import validate
                        args=SimpleNamespace(root=self.root,state=self.state.parent,count=None,seconds=seconds,warmup=warmup,headed=False,cancel_event=cancelled)
                        validate(args,fixture,chosen)
                    except Exception as error:
                        atomic(self.state/'game-validation.json',{'status':'cancelled' if cancelled.is_set() else 'error','error':str(error),'profile':chosen})
                    finally:
                        with LOCK:GAME_CHECKS.pop(self.state,None)
                threading.Thread(target=work,daemon=True,name='effect-game-check').start()
            elif action == 'cancel-game-check':
                if self.state in GAME_CHECKS:GAME_CHECKS[self.state].set()
                result={'cancelRequested':self.state in GAME_CHECKS}
            else:
                raise ValueError('Unknown lab operation')
            return result


def handle(handler, action, post=False):
    lab = Lab(Path(handler.directory), handler.server.state)
    try:
        if post:
            port = handler.server.server_port
            if handler.headers.get('Origin') not in [f'http://127.0.0.1:{port}', f'http://localhost:{port}']:
                handler.send_error(403, 'Same-origin lab requests only');return
            size = int(handler.headers.get('Content-Length', '0'))
            if not 0 < size <= 1024 * 1024 or handler.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                handler.send_error(400, 'Expected a bounded JSON request');return
            result = lab.post(action, json.loads(handler.rfile.read(size)))
        else:
            if action != 'manifest':
                handler.send_error(404);return
            result = lab.manifest()
        body = json.dumps(result, allow_nan=False).encode()
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Cache-Control', 'no-store')
        handler.send_header('Content-Length', str(len(body)));handler.end_headers()
        if handler.command != 'HEAD':
            handler.wfile.write(body)
    except (ValueError, KeyError, TypeError, OSError) as error:
        body = json.dumps({'error': str(error)}).encode()
        handler.send_response(400);handler.send_header('Content-Type', 'application/json')
        handler.send_header('Cache-Control', 'no-store')
        handler.send_header('Content-Length', str(len(body)));handler.end_headers()
        if handler.command != 'HEAD':
            handler.wfile.write(body)


def promote(root, state, apply=False):
    lab = Lab(root, state)
    with LOCK:
        selected = read(lab.state / 'selected.json', None)
        if not selected:
            raise ValueError('No tested candidate selected. Use Stress > Version > Stage candidate.')
        chosen = profile(selected['profile'])
        if selected['code'] != versions(root, chosen):
            raise ValueError('Selected test is stale. Measure and select the candidate again.')
        result = {'action': 'promote' if apply else 'review', 'profile': chosen,
                  'measured': selected['metrics'], 'fixture': selected['fixture'],
                  'sharedModules': list(selected['code']), 'gameValidation': 'pending'}
        if apply:
            atomic(lab.state / 'previous-release.json', read(root / RELEASE, None))
            atomic(root / RELEASE, chosen)
            atomic(lab.state / 'game-validation.json', {'status': 'pending', 'profile': chosen,
                                                      'fixture': selected['fixture'], 'runId': selected['runId']})
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'promote'])
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--state', type=Path, default=DEFAULT_STATE)
    args = parser.parse_args()
    result = Lab(args.root, args.state).manifest() if args.action == 'status' else promote(args.root, args.state, args.apply)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
