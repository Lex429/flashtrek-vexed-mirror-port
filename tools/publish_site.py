"""Publish exact Git files over explicit FTPS, with SHA-256 deployment receipts."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from ftplib import FTP_TLS, error_perm
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import ssl
import subprocess
import tarfile
import tempfile
import threading
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

REPOSITORY = 'https://github.com/Lex429/flashtrek-vexed-mirror-port'
RECEIPT = 'deployment.json'
ENTRY = 'html-games/broken-mirror-port/index.html'


def public_path(name):
    path = PurePosixPath(name)
    return (not path.is_absolute() and '..' not in path.parts and
            '\\' not in name and not any(ord(c) < 32 for c in name) and
            (name == 'index.html' or (len(path.parts) > 1 and path.parts[0] == 'html-games')))


def digest(stream):
    result = hashlib.sha256()
    while block := stream.read(1024 * 1024):
        result.update(block)
    return result.hexdigest()


def prepare(repo, destination, ref='HEAD'):
    """Git archive avoids platform checkout conversions and uncommitted files."""
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError('The staging directory must be empty.')
    commit = subprocess.check_output(['git', 'rev-parse', ref + '^{commit}'], cwd=repo, text=True).strip()
    process = subprocess.Popen(['git', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf',
                                'archive', commit, '--', 'index.html', 'html-games'],
                               cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|') as archive:
            for member in archive:
                if member.isdir():
                    continue
                if not member.isfile() or not public_path(member.name):
                    raise ValueError('Unexpected archive member: ' + member.name)
                archive.extract(member, destination, filter='data')
    finally:
        process.stdout.close()
    error = process.stderr.read().decode(errors='replace')
    process.stderr.close()
    if process.wait():
        raise RuntimeError('git archive failed: ' + error)
    files = {}
    for path in sorted(destination.rglob('*')):
        if path.is_file():
            with path.open('rb') as stream:
                files[path.relative_to(destination).as_posix()] = {'sha256': digest(stream), 'bytes': path.stat().st_size}
    if ENTRY not in files or 'index.html' not in files:
        raise ValueError('The committed game entry points are missing.')
    receipt = {'schema': 1, 'repository': REPOSITORY, 'commit': commit,
               'created_at': datetime.now(timezone.utc).isoformat(), 'files': files}
    (destination / RECEIPT).write_text(json.dumps(receipt, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    return receipt


def remote_digest(base, name, commit):
    # A unique query avoids an old edge cache during integrity verification.
    url = base.rstrip('/') + '/' + quote(name, safe='/') + '?deployment=' + commit
    request = Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'VexedMirror-Publisher/1'})
    with urlopen(request, timeout=90) as response:
        return digest(response)


class Publisher:
    def __init__(self, stage, receipt, base, workers=6):
        self.stage, self.receipt, self.base = Path(stage), receipt, base
        self.workers, self.local = workers, threading.local()
        self.connections, self.lock = [], threading.Lock()
        self.completed, self.last_report = 0, 0
        self.credentials = {key: os.environ.get('VEXED_FTP_' + key.upper(), '')
                            for key in ('host', 'username', 'password')}
        if not all(self.credentials.values()):
            raise ValueError('VEXED_FTP_HOST, VEXED_FTP_USERNAME and VEXED_FTP_PASSWORD must be set.')

    def connect(self):
        ftp = FTP_TLS(context=ssl.create_default_context(), timeout=90)
        ftp.connect(self.credentials['host'], 21)
        ftp.login(self.credentials['username'], self.credentials['password'])
        ftp.prot_p()
        ftp.voidcmd('TYPE I')
        ftp.cwd('/')
        with self.lock:
            self.connections.append(ftp)
        return ftp

    def connection(self):
        if not getattr(self.local, 'ftp', None):
            self.local.ftp = self.connect()
        return self.local.ftp

    def previous(self):
        content = io.BytesIO()
        try:
            self.connection().retrbinary('RETR ' + RECEIPT, content.write)
        except error_perm as error:
            if str(error).startswith('550'):
                return None
            raise
        previous = json.loads(content.getvalue())
        if previous.get('repository') != REPOSITORY or previous.get('schema') != 1:
            raise ValueError('The existing deployment receipt is not from this repository.')
        if not all(public_path(name) for name in previous.get('files', {})):
            raise ValueError('Unsafe path in the previous deployment receipt.')
        return previous

    def report(self, phase, total):
        with self.lock:
            self.completed += 1
            now = time.monotonic()
            if now - self.last_report > 10 or self.completed == total:
                print(json.dumps({'phase': phase, 'completed': self.completed, 'total': total}), flush=True)
                self.last_report = now

    def initial_match(self, name):
        try:
            matched = remote_digest(self.base, name, self.receipt['commit']) == self.receipt['files'][name]['sha256']
        except HTTPError as error:
            if error.code != 404:
                raise
            matched = False
        self.report('compare_existing_site', len(self.receipt['files']))
        return name, matched

    def upload(self, name):
        path_name = PurePosixPath(name)
        temporary = str(path_name.parent / ('.upload-' + self.receipt['commit'][:12] + '-' + path_name.name))
        for attempt in range(4):
            try:
                ftp = self.connection()
                path = self.stage / name
                with path.open('rb') as stream:
                    ftp.storbinary('STOR ' + temporary, stream, blocksize=262144)
                if ftp.size(temporary) != path.stat().st_size:
                    raise RuntimeError('Uploaded file length differs: ' + name)
                ftp.rename(temporary, name)
                return
            except Exception:
                if getattr(self.local, 'ftp', None):
                    self.local.ftp.close()
                    self.local.ftp = None
                if attempt == 3:
                    raise
                time.sleep(attempt + 1)

    def verify(self, name):
        for attempt in range(4):
            try:
                actual = remote_digest(self.base, name, self.receipt['commit'])
                if actual != self.receipt['files'][name]['sha256']:
                    raise RuntimeError('Public SHA-256 differs from Git: ' + name)
                return
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 * (attempt + 1))

    def deploy(self):
        try:
            previous = self.previous()
            files = self.receipt['files']
            if previous:
                changed = [name for name, info in files.items() if previous['files'].get(name) != info]
            else:
                with ThreadPoolExecutor(max_workers=self.workers) as pool:
                    changed = [name for name, matched in pool.map(self.initial_match, files) if not matched]
            print(json.dumps({'phase': 'upload', 'commit': self.receipt['commit'],
                              'changed_files': len(changed), 'total_files': len(files)}), flush=True)
            # The initial comparison can outlast an idle FTP session.
            if getattr(self.local, 'ftp', None):
                self.local.ftp.close()
                self.local.ftp = None
            ftp = self.connection()
            directories = sorted({str(PurePosixPath(name).parent) for name in changed}, key=lambda p: (p.count('/'), p))
            created = set()
            for directory in directories:
                prefix = ''
                for part in PurePosixPath(directory).parts:
                    prefix = prefix + '/' + part if prefix else part
                    if prefix in created:
                        continue
                    try:
                        ftp.mkd(prefix)
                    except error_perm as error:
                        if not str(error).startswith('550'):
                            raise
                    created.add(prefix)
            assets = [name for name in changed if not name.endswith('.html')]
            with ThreadPoolExecutor(max_workers=self.workers) as pool:
                list(pool.map(self.upload, assets))
            # Publish entry pages after their dependencies, and the root last.
            for name in sorted(set(changed) - set(assets), key=lambda p: (p == 'index.html', p == ENTRY, p)):
                self.upload(name)
            # The first run checks all existing files; later runs check all code,
            # entry pages and changed assets against the exact Git archive bytes.
            verify = set(changed) | {name for name in files if Path(name).suffix in {'.html', '.js', '.css', '.json'}}
            with ThreadPoolExecutor(max_workers=self.workers) as pool:
                list(pool.map(self.verify, sorted(verify)))
            # Remove only files owned by this repository's previous receipt.
            if getattr(self.local, 'ftp', None):
                self.local.ftp.close()
                self.local.ftp = None
            ftp = self.connection()
            for name in sorted(set((previous or {}).get('files', {})) - set(files)):
                try:
                    ftp.delete(name)
                except error_perm as error:
                    if not str(error).startswith('550'):
                        raise
            self.upload(RECEIPT)
            expected = hashlib.sha256((self.stage / RECEIPT).read_bytes()).hexdigest()
            if remote_digest(self.base, RECEIPT, self.receipt['commit']) != expected:
                raise RuntimeError('The public deployment receipt could not be verified.')
            print(json.dumps({'status': 'published', 'commit': self.receipt['commit'], 'files': len(files),
                              'uploaded': len(changed), 'verified_this_run': len(verify),
                              'url': self.base.rstrip('/') + '/' + ENTRY}), flush=True)
        finally:
            for ftp in self.connections:
                try:
                    ftp.quit()
                except Exception:
                    ftp.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--base', default='https://vexedmirror.com')
    parser.add_argument('--prepare', type=Path, help='Prepare an exact Git snapshot without connecting to hosting.')
    parser.add_argument('--workers', type=int, default=6)
    args = parser.parse_args()
    if args.prepare:
        receipt = prepare(args.repo, args.prepare)
        print(json.dumps({'commit': receipt['commit'], 'files': len(receipt['files']), 'stage': str(args.prepare)}))
    else:
        with tempfile.TemporaryDirectory(prefix='vexed-publish-') as stage:
            receipt = prepare(args.repo, stage)
            Publisher(stage, receipt, args.base, workers=args.workers).deploy()


if __name__ == '__main__':
    main()
