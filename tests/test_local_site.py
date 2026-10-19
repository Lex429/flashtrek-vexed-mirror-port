from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from local_site import Handler, Sync, publishable


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.origin = self.root / 'origin.git'
        self.seed, self.local = self.root / 'seed', self.root / 'local'
        self.run_git(self.root, 'init', '--bare', '--initial-branch=main', str(self.origin))
        self.run_git(self.root, 'clone', str(self.origin), str(self.seed))
        (self.seed / 'index.html').write_text('original')
        self.commit(self.seed, 'initial')
        self.run_git(self.seed, 'push', 'origin', 'main')
        self.run_git(self.root, 'clone', str(self.origin), str(self.local))
        self.sync = Sync(self.local, self.root / 'state', quiet=0,
                         checks=[[sys.executable, '-c', 'pass']], require_ci=False, remote=str(self.origin))

    def tearDown(self):
        # Git object files can be read-only on Windows.
        import os, shutil, stat
        def writable(function, path, _error):
            os.chmod(path, stat.S_IWRITE); function(path)
        shutil.rmtree(self.root, onexc=writable)
        self.temp.cleanup()

    def run_git(self, directory, *args):
        result = subprocess.run(['git', *args], cwd=directory, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def commit(self, directory, message):
        self.run_git(directory, 'add', '.')
        self.run_git(directory, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', message)

    def test_local_changes_reach_github_and_private_files_stay_local(self):
        (self.local / 'index.html').write_text('local update')
        (self.local / '.env').write_text('private')
        (self.local / 'saves').mkdir()
        (self.local / 'saves/slot.json').write_text('private save')
        self.assertEqual(self.sync.once(0), 'waiting_for_quiet')
        self.assertEqual(self.sync.once(1), 'synced')
        self.assertEqual(self.run_git(self.root, '--git-dir', str(self.origin), 'show', 'main:index.html'), 'local update')
        tree = self.run_git(self.root, '--git-dir', str(self.origin), 'ls-tree', '-r', '--name-only', 'main')
        self.assertNotIn('.env', tree)
        self.assertNotIn('saves/', tree)

    def test_github_update_fast_forwards_local_site(self):
        (self.seed / 'index.html').write_text('GitHub update')
        self.commit(self.seed, 'remote update')
        self.run_git(self.seed, 'push', 'origin', 'main')
        self.assertEqual(self.sync.once(), 'synced')
        self.assertEqual((self.local / 'index.html').read_text(), 'GitHub update')

    def test_simultaneous_changes_pause_without_overwriting_either_side(self):
        (self.local / 'index.html').write_text('unfinished local work')
        (self.seed / 'index.html').write_text('independent GitHub work')
        self.commit(self.seed, 'remote update'); self.run_git(self.seed, 'push', 'origin', 'main')
        self.assertEqual(self.sync.once(), 'conflict')
        self.assertEqual((self.local / 'index.html').read_text(), 'unfinished local work')
        self.assertEqual(self.run_git(self.root, '--git-dir', str(self.origin), 'show', 'main:index.html'), 'independent GitHub work')
        self.assertEqual(self.run_git(self.local, 'ls-files', '-u'), '')

    def test_failed_checks_prevent_commit_and_push(self):
        initial = self.run_git(self.local, 'rev-parse', 'HEAD')
        (self.local / 'index.html').write_text('broken edit')
        self.sync.checks = [[sys.executable, '-c', 'raise SystemExit(1)']]
        self.sync.once(0)
        self.assertEqual(self.sync.once(1), 'checks_failed')
        self.assertEqual(self.run_git(self.local, 'rev-parse', 'HEAD'), initial)
        self.assertEqual(self.run_git(self.local, 'diff', '--cached', '--name-only'), '')

    def test_staged_work_is_left_for_its_owner(self):
        (self.local / 'index.html').write_text('staged edit')
        self.run_git(self.local, 'add', 'index.html')
        self.assertEqual(self.sync.once(), 'paused')
        self.assertEqual(self.run_git(self.local, 'show', ':index.html'), 'staged edit')

    def test_edit_during_validation_is_never_committed(self):
        (self.local / 'index.html').write_text('first draft')
        self.sync.checks = [[sys.executable, '-c', "from pathlib import Path; Path('index.html').write_text('newer draft')"]]
        self.sync.once(0)
        self.assertEqual(self.sync.once(1), 'waiting_for_local_edits')
        self.assertEqual(self.run_git(self.local, 'diff', '--cached', '--name-only'), '')

    def test_incoming_update_waits_for_passing_checks(self):
        (self.seed / 'index.html').write_text('not yet checked')
        self.commit(self.seed, 'remote update'); self.run_git(self.seed, 'push', 'origin', 'main')
        self.sync.remote_passed = lambda _sha: False
        self.assertEqual(self.sync.once(), 'waiting_for_github_checks')
        self.assertEqual((self.local / 'index.html').read_text(), 'original')


class SiteTest(unittest.TestCase):
    def test_direct_game_address_private_paths_and_live_file_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.git').mkdir(); (root / '.git/config').write_text('private')
            (root / 'game.js').write_text('first version')
            (root / 'status.json').write_text('{"phase":"synced"}')
            server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=directory))
            server.state = root
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            base = f'http://127.0.0.1:{server.server_port}'
            try:
                with urllib.request.urlopen(base + '/game.js') as response:
                    self.assertEqual(response.read(), b'first version')
                    self.assertEqual(response.headers['Cache-Control'], 'no-cache')
                    self.assertEqual(response.headers['Content-Type'], 'text/javascript')
                (root / 'game.js').write_text('second version')
                with urllib.request.urlopen(base + '/game.js') as response:
                    self.assertEqual(response.read(), b'second version')
                with urllib.request.urlopen(base + '/__vexed/status') as response:
                    self.assertEqual(json.load(response)['phase'], 'synced')
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(base + '/.git/config')
                self.assertEqual(error.exception.code, 404)
            finally:
                server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()
