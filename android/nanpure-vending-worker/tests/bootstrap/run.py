#!/usr/bin/env python3
"""Run the real registration classes against local Android fakes and dummy data."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app', type=Path, default=here.parents[1],
                    help='Application directory (default: parent of tests/).')
parser.add_argument('--jdk', type=Path, default=os.environ.get('JAVA_HOME'),
                    help='JDK 17 directory (default: JAVA_HOME).')
parser.add_argument('--gson', type=Path, default=os.environ.get('GSON_JAR'),
                    help='Gson JAR (default: GSON_JAR; tested with 2.10).')
parser.add_argument('--out', type=Path,
                    help='Write the JSON report here; otherwise print it to stdout.')
args = parser.parse_args()
if args.jdk is None:
    parser.error('provide --jdk or set JAVA_HOME to a JDK 17 directory')
if args.gson is None:
    parser.error('provide --gson or set GSON_JAR')

app = args.app.resolve()
suffix = '.exe' if os.name == 'nt' else ''
javac = args.jdk.resolve() / 'bin' / ('javac' + suffix)
java = args.jdk.resolve() / 'bin' / ('java' + suffix)
gson = args.gson.resolve()
production = [app / 'src/main/java/jp/nanpure/refill' / name
              for name in ('RefillStore.java', 'RefillBootstrap.java')]
for required in (javac, java, gson, *production):
    if not required.is_file():
        parser.error(f'required file does not exist: {required}')


def source_hashes():
    return {str(p.relative_to(app)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in production}


hashes = source_hashes()
sources = sorted((here / 'src').rglob('*.java')) + production
with tempfile.TemporaryDirectory(prefix='refill-bootstrap-') as classes:
    subprocess.run([str(javac), '-encoding', 'UTF-8', '-cp', str(gson),
                    '-d', classes, *map(str, sources)], check=True)
    result = subprocess.run(
        [str(java), '-ea', '-cp', os.pathsep.join([classes, str(gson)]),
         'jp.nanpure.refill.RefillBootstrapHarness'],
        capture_output=True, text=True)
    if result.returncode:
        sys.stderr.write(result.stdout + result.stderr)
        raise SystemExit(result.returncode)
    report = json.loads(result.stdout)

if hashes != source_hashes():
    raise RuntimeError('production source changed during test')
report['sourceSHA256'] = hashes
report['ranAt'] = datetime.now(timezone.utc).isoformat()
report['java'] = subprocess.run([str(java), '-version'], capture_output=True,
                                text=True, check=True).stderr.splitlines()[0]
encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
if args.out is None:
    print(encoded, end='')
else:
    output = args.out.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(encoded, encoding='utf-8')
    print(json.dumps({'ok': report['ok'], 'tests': report['tests'],
                      'assertions': report['assertions'], 'report': str(output)}))
