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
for name, expected in manifest['files'].items():
    relative = Path(name)
    assert not relative.is_absolute() and '..' not in relative.parts, name
    content = (root / relative).read_bytes()
    assert hashlib.sha256(content).hexdigest() == expected, f'Release file changed: {name}'
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
# Build helpers are not website pages. Keep them out of the public Pages artifact.
if root.name == '_site':
    shutil.rmtree(root / 'scripts', ignore_errors=True)
    shutil.rmtree(root / 'docs', ignore_errors=True)
    shutil.rmtree(root / 'nanpure-audio', ignore_errors=True)
print(f"Verified Nanpure {manifest['version']}: {len(manifest['files'])} files, source {manifest['sourceCommit']}")
