"""Check the static release's required files and JavaScript without changing it."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
from urllib.parse import unquote, urlsplit


class Dependencies(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {'script', 'img', 'audio', 'video', 'source', 'iframe'} and attrs.get('src'):
            self.urls.append(attrs['src'])
        if tag == 'link' and attrs.get('href') and attrs.get('rel') in {'stylesheet', 'icon', 'preload', 'modulepreload'}:
            self.urls.append(attrs['href'])


def validate(root):
    root = Path(root).resolve()
    entries = ['index.html', 'html-games/broken-mirror-port/index.html',
               'html-games/flashtrek-broken-mirror/damage-showcase.html']
    checked = set()
    for name in entries:
        page = root / name
        if not page.is_file():
            raise ValueError('Missing entry page: ' + name)
        parser = Dependencies()
        parser.feed(page.read_text(encoding='utf-8-sig'))
        for url in parser.urls:
            parsed = urlsplit(url)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            target = ((root / unquote(parsed.path).lstrip('/')) if parsed.path.startswith('/')
                      else (page.parent / unquote(parsed.path))).resolve()
            if not target.is_relative_to(root) or not target.is_file():
                raise ValueError('Missing or invalid dependency in ' + name + ': ' + url)
            checked.add(target.relative_to(root).as_posix())
    scripts = sorted((root / 'html-games').rglob('*.js'))
    def check_script(path):
        result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
        if result.returncode:
            raise ValueError(str(path.relative_to(root)) + ': ' + result.stderr)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(check_script, scripts))
    return {'passed': True, 'entry_pages': len(entries), 'direct_dependencies': len(checked),
            'javascript_files': len(scripts)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    print(json.dumps(validate(args.root)))
