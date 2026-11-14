"""Build the optional numeric fog kernel with pinned AssemblyScript 0.28.9.

Install the compiler outside the repo, then pass --compiler path/to/asc.js.
The generated JS embeds the binary so local workers need no extra fetch/CORS.
"""
import argparse
import base64
import hashlib
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--compiler', type=Path, required=True)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
source = ROOT/'tools/nebula-flow-kernel.ts'
version = subprocess.check_output(['node',str(args.compiler),'--version'],text=True).strip()
if version != 'Version 0.28.9':
    raise RuntimeError('Expected pinned AssemblyScript 0.28.9, got '+version)
with tempfile.TemporaryDirectory(prefix='nebula-flow-') as temp:
    binary = Path(temp)/'flow.wasm'
    subprocess.run(['node',str(args.compiler),str(source),'-O3','--enable','simd','--runtime','stub','--importMemory','--noExportMemory','--initialMemory','1','--noAssert','--outFile',str(binary)],check=True)
    encoded = base64.b64encode(binary.read_bytes()).decode()
digest = hashlib.sha256(source.read_bytes().replace(b'\r\n',b'\n')).hexdigest()
template = (ROOT/'tools/nebula-flow-loader.txt').read_text()
output = template.replace('SOURCE_HASH',digest).replace('KERNEL_BASE64',encoded)
target = ROOT/'html-games/broken-mirror-port/nebula-flow-kernel.js'
if args.check:
    if target.read_text() != output:
        raise RuntimeError('Numeric fog kernel differs; rebuild it')
else:
    target.write_text(output)
print('Numeric fog kernel verified' if args.check else 'Numeric fog kernel built')
