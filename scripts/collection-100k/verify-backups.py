"""Verify supplied normal boards independently before append.cjs accepts them."""
import argparse, base64, hashlib, json, pathlib, subprocess, tempfile, zlib

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--proof', required=True, type=pathlib.Path)
parser.add_argument('backups', nargs='+', type=pathlib.Path)
args = parser.parse_args()
source = pathlib.Path(__file__).with_name('normal-solver.cpp')
report = dict(format='normal-independent-proof-v1', solverSha256=hashlib.sha256(source.read_bytes()).hexdigest(), inputs=[], checked=0, unique=0, invalid=[], maxSearchVisits=0)
with tempfile.TemporaryDirectory(prefix='normal-backup-check-') as temp:
    binary = str(pathlib.Path(temp) / 'solver')
    subprocess.run(['g++', '-O3', '-std=c++17', str(source), '-o', binary], check=True)
    solver = subprocess.Popen([binary], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        for file in args.backups:
            raw = file.read_bytes()
            backup = json.loads(raw)
            if backup.get('format') == 'nanpure-compressed-v1':
                backup = json.loads(zlib.decompress(base64.b64decode(backup['data'], validate=True)))
            if backup.get('format') != 'nanpure-recovery-v1':
                raise ValueError('Unsupported recovery format: ' + file.name)
            rows = backup['puzzles']
            report['inputs'].append(dict(file=file.name, sha256=hashlib.sha256(raw).hexdigest(), count=len(rows)))
            for index, p in enumerate(rows):
                if p['kind'] != 'normal':
                    raise ValueError('Only normal boards are supported by this independent verifier')
                solver.stdin.write(' '.join(map(str, [p['n'], p['blockRows'], p['blockCols'], *p['puzzle'], *p['solution']])) + '\n')
                solver.stdin.flush()
                result = solver.stdout.readline().strip().split()
                report['checked'] += 1
                if result and result[0] == '1':
                    report['unique'] += 1
                    report['maxSearchVisits'] = max(report['maxSearchVisits'], int(result[1]))
                else:
                    report['invalid'].append(dict(file=file.name, index=index, uid=p.get('uid'), result=' '.join(result)))
                if (index + 1) % 200 == 0:
                    print(f"Verified {report['checked']}; unique {report['unique']}", flush=True)
        solver.stdin.close()
        if solver.wait() != 0:
            raise RuntimeError('Verifier process failed')
    finally:
        if solver.poll() is None:
            solver.kill()
            solver.wait()
args.proof.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['checked', 'unique', 'invalid', 'maxSearchVisits']}))
if report['checked'] != report['unique'] or report['invalid']:
    raise SystemExit(1)
