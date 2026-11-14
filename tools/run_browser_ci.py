"""Run every existing browser regression, partitioned across CI workers."""
import argparse
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shard', type=int, required=True)
    parser.add_argument('--shards', type=int, default=8)
    parser.add_argument('--list', action='store_true')
    args = parser.parse_args()
    if not 0 <= args.shard < args.shards:
        parser.error('The shard must be between zero and shards - 1.')
    root = Path(__file__).resolve().parents[1]
    suites = json.loads((root / '.github/browser-suites.json').read_text(encoding='utf-8'))
    failed = []
    for index, suite in enumerate(suites):
        if index % args.shards != args.shard:
            continue
        print('::group::' + suite['name'], flush=True)
        print(suite['run'], flush=True)
        if not args.list:
            result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', suite['run']], cwd=root)
            if result.returncode:
                failed.append(suite['name'])
        print('::endgroup::', flush=True)
    if failed:
        raise SystemExit('Browser suites failed: ' + ', '.join(failed))


if __name__ == '__main__':
    main()
