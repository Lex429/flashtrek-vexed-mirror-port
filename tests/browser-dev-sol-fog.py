"""Compatibility entry point for the current shared-hull Sol fog checks.

The old screen-space preview assertions are replaced by real artwork coverage,
shared material/worker checks and live fleet flight in browser-fleet-fog.py.
"""
from pathlib import Path
import runpy

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('browser-fleet-fog.py')), run_name='__main__')
