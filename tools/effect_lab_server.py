"""Dedicated loopback effect lab; leaves the existing game service running.

python tools/effect_lab_server.py
The installed showcase uses port 7791. Files are served from the active game
checkout and results use the normal VexedMirror/effect-lab state directory.
"""
import argparse
from functools import partial
from http.server import ThreadingHTTPServer
import importlib
from pathlib import Path
import sys
import threading

from local_site import Handler, ROOT, DEFAULT_STATE

refresh_lock=threading.RLock()
signatures={}


class LabHandler(Handler):
    def refresh(self):
        # Reload the lab backend after edits when no isolated game is running.
        # Static game modules are freshly loaded by each scene/browser session.
        with refresh_lock:
            import effect_lab
            if effect_lab.GAME_CHECKS:
                return
            for name in ['effect_lab','validate_effect_game']:
                path=Path(__file__).with_name(name+'.py')
                signature=(path.stat().st_mtime_ns,path.stat().st_size)
                if name in signatures and signatures[name]!=signature and name in sys.modules:
                    importlib.invalidate_caches();importlib.reload(sys.modules[name])
                signatures[name]=signature

    def do_GET(self):
        if self.path.startswith('/__vexed/effect-lab/'):
            self.refresh()
        super().do_GET()

    def do_POST(self):
        self.refresh();super().do_POST()

    def end_headers(self):
        if self.path.split('?',1)[0].endswith(('.js','.html','.json')):
            self.send_header('Cache-Control','no-store')
        super().end_headers()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=7791)
    parser.add_argument('--repo',type=Path,default=ROOT)
    parser.add_argument('--state',type=Path,default=DEFAULT_STATE)
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(LabHandler,directory=str(args.repo)))
    server.state=args.state
    if sys.stdout is not None:print(f'Effect lab: http://127.0.0.1:{args.port}',flush=True)
    server.serve_forever()


if __name__=='__main__':main()
