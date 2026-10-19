"""Loopback-only Vexed Mirror site and conservative, checked Git synchronization."""
import argparse
from contextlib import contextmanager
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STATE = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.local/share'))) / 'VexedMirror'
REMOTE = 'https://github.com/Lex429/flashtrek-vexed-mirror-port.git'
ENTRY = '/html-games/broken-mirror-port/index.html'


def publishable(name):
    path = Path(name)
    lower = [part.lower() for part in path.parts]
    if any(part in {'node_modules', '__pycache__', 'test-results', 'backups', 'saves', 'profiles', '.venv', '.git'} for part in lower):
        return False
    if path.name.lower().startswith(('.env', 'server.json', 'credentials', 'token')) or path.suffix.lower() in {'.log', '.sqlite', '.sqlite3', '.db', '.swf', '.pem', '.key'}:
        return False
    return (lower[0] in {'html-games', 'tests', 'tools', 'docs', '.github'} or
            name in {'index.html', 'README.md', 'AGENTS.md', '.gitignore', 'requirements-test.txt'})


class Sync:
    def __init__(self, repo, state, quiet=60, checks=None, require_ci=True, remote=REMOTE, branch=None):
        self.repo, self.state = Path(repo).resolve(), Path(state).resolve()
        self.state.mkdir(parents=True, exist_ok=True)
        self.quiet, self.require_ci, self.remote = quiet, require_ci, remote
        self.checks = checks
        self.previous, self.changed_at, self.failed = None, 0, None
        self.expected_branch = branch or self.git('branch', '--show-current')
        self.status('starting')

    def git(self, *args, input=None):
        environment = dict(os.environ, GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='Never')
        result = subprocess.run(['git', *args], cwd=self.repo, input=input, text=True,
                                capture_output=True, timeout=180, env=environment,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout).strip()[-3000:])
        return result.stdout.strip()

    def status(self, phase, **details):
        data = {'phase': phase, 'time': time.time(), 'repository': str(self.repo), **details}
        temporary = self.state / 'status.tmp'
        temporary.write_text(json.dumps(data, indent=2), encoding='utf-8')
        temporary.replace(self.state / 'status.json')
        return phase

    def dirty(self):
        tracked = self.git('diff', '--name-only', '-z', 'HEAD').strip('\0').split('\0')
        new = self.git('ls-files', '--others', '--exclude-standard', '-z').strip('\0').split('\0')
        return sorted(name for name in set(tracked + new) if name and publishable(name))

    def fingerprint(self, names):
        result = hashlib.sha256(self.git('rev-parse', 'HEAD').encode())
        for name in names:
            result.update(name.encode())
            file = self.repo / name
            if file.is_symlink():
                raise RuntimeError('Sync pauses for symbolic links: ' + name)
            if file.exists():
                if file.stat().st_size >= 95 * 1024 * 1024:
                    raise RuntimeError('File needs packaging before upload: ' + name)
                with file.open('rb') as stream:
                    while chunk := stream.read(1024 * 1024):
                        result.update(chunk)
            else:
                result.update(b'<deleted>')
        return result.hexdigest()

    def validate(self):
        if self.checks is None:
            tests = sorted(str(p.relative_to(self.repo)) for p in (self.repo / 'tests').glob('*.test.*') if p.suffix in {'.js', '.cjs'})
            commands = [[sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_local_site.py'],
                        ['node', '--test', *tests],
                        [sys.executable, 'tests/browser-smoke.py']]
        else:
            commands = self.checks
        self.status('checking', log=str(self.state / 'checks.log'))
        with (self.state / 'checks.log').open('w', encoding='utf-8') as log:
            for command in commands:
                log.write('$ ' + ' '.join(command) + '\n'); log.flush()
                result = subprocess.run(command, cwd=self.repo, stdout=log, stderr=log,
                                        timeout=1200, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                if result.returncode:
                    return False
        return True

    def remote_passed(self, sha):
        if not self.require_ci:
            return True
        result = subprocess.run(['gh', 'api', f'repos/Lex429/flashtrek-vexed-mirror-port/commits/{sha}/check-runs'],
                                capture_output=True, text=True, timeout=60,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode:
            raise RuntimeError('Could not read GitHub checks: ' + result.stderr[-1000:])
        return any(check['name'] == 'regression' and check['conclusion'] == 'success' and
                   check.get('app', {}).get('slug') == 'github-actions'
                   for check in json.loads(result.stdout).get('check_runs', []))

    def once(self, now=None):
        now = time.monotonic() if now is None else now
        if self.git('remote', 'get-url', 'origin') != self.remote:
            return self.status('paused', reason='The repository remote changed.')
        if self.git('branch', '--show-current') != self.expected_branch:
            return self.status('paused', reason='The working branch changed. Restart after reviewing the branch.')
        if self.git('ls-files', '-u'):
            return self.status('conflict', reason='Resolve the existing Git conflicts first.')
        if self.git('diff', '--cached', '--name-only'):
            return self.status('paused', reason='Files are staged for another commit; sync will leave them alone.')
        self.git('fetch', '--quiet', 'origin', 'main')
        head = self.git('rev-parse', 'HEAD')
        remote = self.git('rev-parse', 'origin/main')
        outgoing, incoming = map(int, self.git('rev-list', '--left-right', '--count', 'HEAD...origin/main').split())
        names = self.dirty()
        if incoming and (outgoing or names):
            return self.status('conflict', reason='Local work and GitHub both changed. Merge them before automatic sync continues.')
        if incoming:
            if not self.remote_passed(remote):
                return self.status('waiting_for_github_checks', commit=remote)
            # Check again after the network request; never stash or reset local work.
            if self.dirty() or self.git('rev-parse', 'HEAD') != head or self.git('diff', '--cached', '--name-only'):
                return self.status('waiting_for_local_edits')
            self.git('merge', '--ff-only', 'origin/main')
            return self.status('synced', direction='github_to_local', commit=remote)
        if not names and not outgoing:
            self.previous = None
            return self.status('synced', commit=head)
        fingerprint = self.fingerprint(names)
        if fingerprint != self.previous:
            self.previous, self.changed_at = fingerprint, now
            return self.status('waiting_for_quiet', files=names)
        if now - self.changed_at < self.quiet:
            return self.status('waiting_for_quiet', files=names)
        if fingerprint == self.failed:
            return self.status('checks_failed', reason='Edit the files to retry, or restart sync after fixing the checks.', log=str(self.state / 'checks.log'))
        if not self.validate():
            self.failed = fingerprint
            return self.status('checks_failed', log=str(self.state / 'checks.log'))
        if self.dirty() != names or self.fingerprint(names) != fingerprint or self.git('diff', '--cached', '--name-only'):
            self.previous = None
            return self.status('waiting_for_local_edits')
        if names:
            self.git('add', '--', *names)
            if self.fingerprint(names) != fingerprint or sorted(self.git('diff', '--cached', '--name-only').splitlines()) != names:
                return self.status('paused', reason='Files changed during staging. Review the staged changes before resuming.')
            self.git('-c', 'user.name=Lex429', '-c', 'user.email=97552270+Lex429@users.noreply.github.com',
                     'commit', '-m', 'Sync checked local Vexed Mirror changes')
        # An ordinary push rejects a concurrent GitHub change. Never force-push.
        self.git('push', 'origin', 'HEAD:refs/heads/main')
        self.previous, self.failed = None, None
        return self.status('synced', direction='local_to_github', commit=self.git('rev-parse', 'HEAD'))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.wasm': 'application/wasm'}

    def log_message(self, *_args):
        pass

    def list_directory(self, _path):
        self.send_error(404)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == '/':
            self.send_response(302); self.send_header('Location', ENTRY); self.end_headers()
            return
        if path == '/__vexed/status':
            file = self.server.state / 'status.json'
            body = file.read_bytes() if file.exists() else b'{"phase":"starting"}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body))); self.end_headers()
            if self.command != 'HEAD': self.wfile.write(body)
            return
        target = Path(self.translate_path(path)).resolve()
        root = Path(self.directory).resolve()
        if not target.is_relative_to(root) or any(part.startswith('.') or part.lower() in {'saves', 'profiles', 'backups', 'test-results'} for part in Path(path).parts):
            self.send_error(404)
            return
        if self.command == 'HEAD': super().do_HEAD()
        else: super().do_GET()


@contextmanager
def instance_lock(state):
    state.mkdir(parents=True, exist_ok=True)
    with (state / 'service.lock').open('a+b') as lock:
        lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, default=ROOT)
    parser.add_argument('--state', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--port', type=int, default=7790)
    parser.add_argument('--quiet', type=int, default=60)
    parser.add_argument('--branch', help='Pause if the checkout moves to a different branch.')
    parser.add_argument('--serve-only', action='store_true')
    args = parser.parse_args()
    with instance_lock(args.state):
        sync = Sync(args.repo, args.state, quiet=args.quiet, branch=args.branch)
        server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(args.repo)))
        server.request_queue_size = 128
        server.state = args.state
        def worker():
            while True:
                try: sync.once()
                except Exception as error: sync.status('error', reason=str(error))
                time.sleep(30)
        if not args.serve_only:
            threading.Thread(target=worker, daemon=True).start()
        if sys.stdout is not None:
            print(f'Vexed Mirror: http://127.0.0.1:{args.port}/', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        DEFAULT_STATE.mkdir(parents=True, exist_ok=True)
        with (DEFAULT_STATE / 'startup-errors.log').open('a', encoding='utf-8') as log:
            log.write(time.strftime('%Y-%m-%d %H:%M:%S ') + str(error) + '\n')
        raise
