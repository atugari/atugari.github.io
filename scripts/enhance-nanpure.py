"""Validate the prebuilt Nanpure release before the Pages deployment.

The former single-file patcher is intentionally retired. Its old copy would
otherwise overwrite the current games and reintroduce completed-game/back bugs.
"""
from pathlib import Path
import base64, hashlib, json, re, shutil, sys, zipfile
from io import BytesIO

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
manifest = json.loads((root / 'nanpure/release-manifest.json').read_text())
assert re.fullmatch(r'\d{4}\.\d{2}\.\d{2}\.\d+', manifest['version'])
for package in (root/'nanpure-audio').glob('*/index.json'):
    metadata=json.loads(package.read_text())
    assert re.fullmatch(r'\d{4}\.\d{2}\.\d{2}\.\d+',metadata['version'])
    assert all(re.fullmatch(r'part-\d{3}\.b64',name) for name in metadata['parts'])
    data=base64.b64decode(''.join((package.parent/name).read_text() for name in metadata['parts']),validate=True)
    assert hashlib.sha256(data).hexdigest()==metadata['sha256'],'Audio package checksum mismatch'
    target=root/'nanpure'/'releases'/metadata['version']/'audio'
    target.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(BytesIO(data)) as archive:
        assert sum(item.file_size for item in archive.infolist()) < 32*1024*1024
        for item in archive.infolist():
            assert re.fullmatch(r'[a-z0-9_-]+\.mp3',item.filename),item.filename
            (target/item.filename).write_bytes(archive.read(item))
mismatches = []
for name, expected in manifest['files'].items():
    relative = Path(name)
    assert not relative.is_absolute() and '..' not in relative.parts, name
    content = (root / relative).read_bytes()
    actual = hashlib.sha256(content).hexdigest()
    if actual != expected:
        print(f'INTEGRITY DEBUG {name}: expected={expected} actual={actual} bytes={len(content)}', flush=True)
        mismatches.append(name)
assert not mismatches, 'Release files changed: ' + ', '.join(mismatches)
base = root / manifest['base'].lstrip('/')
assert (base / 'notebook/shirupure.html').is_file()
assert (base / 'notebook/crossword.html').is_file()
assert (base / 'notebook/tenbin.html').is_file()
for file in base.rglob('*'):
    if file.is_file():
        assert file.suffix != '.map', f'Client source map: {file}'
        if file.suffix in ('.js', '.html', '.css'):
            text = file.read_text()
            # A root-relative old asset path would escape /nanpure on Pages.
            assert not re.search(r'''["'(]/(?:notebook|audio|themes)/''', text), f'Unmapped asset URL: {file}'
            assert 'sourceMappingURL=' not in text, f'Client source map URL: {file}'
# Publish the first-party analytics tracker at a stable public asset path. This happens
# after the release integrity check so protected game sources remain untouched.
if root.name == '_site':
    tracker_source = root / 'scripts/client-overrides/public/pare-analytics.js'
    tracker_target = root / 'assets/pare-analytics.js'
    tracker_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tracker_source, tracker_target)
    script_tag = '<script defer src="/assets/pare-analytics.js?v=1"></script>'
    game_pages = {
        'plaza.html':'pareasobi', 'nanpure/index.html':'nanpure',
        'index.html':'maru', 'dungeon.html':'tobe', 'speed.html':'speed',
        'kuroshiro/index.html':'kuroshiro', 'combination-blocks.html':'combination-blocks',
        'narabe100.html':'narabe100', 'echo-dive.html':'echo-dive', 'maze/index.html':'maze',
        'shopping-memo.html':'shopping-memo', 'timer-gauge.html':'timer-gauge',
        'skins.html':'skins', 'move-moove-mooove.html':'move-moove-mooove',
        'puzzles/index.html':'puzzles', 'puzzles/shirupure/index.html':'shirupure',
        'puzzles/wado/index.html':'wado', 'puzzles/crossword/index.html':'crossword',
        'puzzles/cross/index.html':'cross', 'puzzles/tenbin/index.html':'tenbin',
        'puzzles/paths/index.html':'paths', 'puzzles/studio/index.html':'studio',
        'puzzles/workshop/index.html':'workshop', 'puzzles/magic-square/index.html':'magic-square',
        'puzzles/cross/stock/index.html':'cross'
    }
    for name, game in game_pages.items():
        page = root / name
        if not page.is_file():
            continue
        html = page.read_text()
        if not html.strip():
            print(f'Skipped empty game entry: {name}', flush=True)
            continue
        if not re.search(r'<body[^>]*\bdata-game=', html, re.I):
            html, count = re.subn(r'<body\b', f'<body data-game="{game}"', html, count=1, flags=re.I)
            assert count == 1, f'Missing body element: {name}'
        if '/scripts/client-overrides/public/pare-analytics.js' in html:
            html = html.replace('/scripts/client-overrides/public/pare-analytics.js', '/assets/pare-analytics.js')
        if '/assets/pare-analytics.js' not in html and '</body>' in html:
            html = html.replace('</body>', script_tag + '\n</body>', 1)
        assert '/assets/pare-analytics.js' in html, f'Analytics script missing: {name}'
        page.write_text(html)

# Build helpers are not website pages. Keep them out of the public Pages artifact.
if root.name == '_site':
    shutil.rmtree(root / 'scripts', ignore_errors=True)
    shutil.rmtree(root / 'docs', ignore_errors=True)
    shutil.rmtree(root / 'nanpure-audio', ignore_errors=True)
print(f"Verified Nanpure {manifest['version']}: {len(manifest['files'])} files, source {manifest['sourceCommit']}")
