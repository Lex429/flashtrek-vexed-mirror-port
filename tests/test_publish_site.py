"""Deployment integrity checks use isolated Git repositories and fake FTPS."""
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import call, patch

spec = importlib.util.spec_from_file_location('publish_site', Path(__file__).resolve().parents[1] / 'tools/publish_site.py')
publish_site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publish_site)


class PublishTests(unittest.TestCase):
    def test_preparation_uses_committed_bytes_and_excludes_private_or_uncommitted_files(self):
        with tempfile.TemporaryDirectory() as work:
            repo, stage = Path(work) / 'repo', Path(work) / 'stage'
            repo.mkdir()
            subprocess.run(['git', 'init', '-q', str(repo)], check=True)
            for name, text in [('index.html', 'root\n'), (publish_site.ENTRY, 'game\n'),
                               ('html-games/game.js', 'old\n'), ('private.txt', 'private\n')]:
                path = repo / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(text.encode())
            subprocess.run(['git', '-C', str(repo), 'add', '.'], check=True)
            subprocess.run(['git', '-C', str(repo), '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                            'commit', '-qm', 'fixture'], check=True)
            (repo / 'html-games/game.js').write_text('uncommitted', encoding='utf-8')
            (repo / 'html-games/untracked.js').write_text('untracked', encoding='utf-8')
            receipt = publish_site.prepare(repo, stage)
            self.assertEqual((stage / 'html-games/game.js').read_bytes(), b'old\n')
            self.assertNotIn('private.txt', receipt['files'])
            self.assertNotIn('html-games/untracked.js', receipt['files'])
            self.assertEqual(receipt['files']['html-games/game.js']['sha256'], publish_site.digest(io.BytesIO(b'old\n')))

    def test_paths_cannot_escape_the_public_site(self):
        for name in ['../index.html', '/index.html', 'html-games/../secret', 'html-games\\secret', '.git/config', 'README.md']:
            self.assertFalse(publish_site.public_path(name), name)
        self.assertTrue(publish_site.public_path(publish_site.ENTRY))

    def test_initial_comparison_checks_content_not_only_size(self):
        receipt = {'commit': 'a' * 40, 'files': {'html-games/a.js': {'bytes': 3, 'sha256': 'expected'}}}
        with patch.dict(os.environ, {f'VEXED_FTP_{key}': 'fixture' for key in ['HOST', 'USERNAME', 'PASSWORD']}):
            publisher = publish_site.Publisher('.', receipt, 'https://example.invalid')
        with patch.object(publish_site, 'remote_digest', return_value='different'):
            self.assertEqual(publisher.initial_match('html-games/a.js'), ('html-games/a.js', False))

    def test_failed_verification_does_not_publish_a_success_receipt_or_delete_old_files(self):
        receipt = {'commit': 'b' * 40, 'files': {publish_site.ENTRY: {'bytes': 1, 'sha256': 'new'}}}
        previous = {'files': {publish_site.ENTRY: {'bytes': 1, 'sha256': 'old'}, 'html-games/obsolete.js': {'sha256': 'old'}}}
        with patch.dict(os.environ, {f'VEXED_FTP_{key}': 'fixture' for key in ['HOST', 'USERNAME', 'PASSWORD']}):
            publisher = publish_site.Publisher('.', receipt, 'https://example.invalid')
        with patch.object(publisher, 'previous', return_value=previous), patch.object(publisher, 'connection') as connection, \
                patch.object(publisher, 'upload') as upload, patch.object(publisher, 'verify', side_effect=RuntimeError('mismatch')):
            with self.assertRaisesRegex(RuntimeError, 'mismatch'):
                publisher.deploy()
            self.assertNotIn(call(publish_site.RECEIPT), upload.call_args_list)
            connection.return_value.delete.assert_not_called()


if __name__ == '__main__':
    unittest.main()
