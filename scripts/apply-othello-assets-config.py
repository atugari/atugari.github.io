import hashlib
import json
import os
import re
import urllib.error
import urllib.request
import uuid
from email import policy
from email.parser import BytesParser
from pathlib import Path
from zipfile import ZipFile

ACCOUNT = '3fb1db1d33caddf96fec77fac7d571e6'
WORKER = 'osero'
BASE_VERSION = 'b9681af7-24ce-4b0f-8cf4-5fd768d4fd94'
API = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{WORKER}'
ORIGIN = 'https://osero.puzzle-hub-4826.workers.dev'
CHECKSUMS = {
    'app.js': ('c822494ec9bf839105eb7da48e36c903cdab0d41a3407c30663306a8d046ada8', '35f2e2002d930f200f9cf92a6e68d047c7e055e46eda7e52af1ef82489afbc05'),
    'furigana.js': ('3f7fdfc46aa77d4b2fcc3a32d5bdd181f5dab28a37a75fab7cd90ad35c187574', 'ceb96bad939c2c166177e6ef8037cb555388f7a766b3dbc06c2b3d02c97cda90'),
    'i18n.js': ('e34b6a4d189432248df53c918803d3778ca713e968285659752aed419d46cb0a', 'e34b6a4d189432248df53c918803d3778ca713e968285659752aed419d46cb0a'),
}


def cloud(path, data=None, content_type=None):
    headers = {'Authorization': 'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']}
    if content_type:
        headers['Content-Type'] = content_type
    request = urllib.request.Request(f'{API}/{path}', headers=headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            mime = response.headers['Content-Type']
    except urllib.error.HTTPError as error:
        try:
            codes = [item.get('code') for item in json.load(error).get('errors', [])]
        except (ValueError, AttributeError):
            codes = []
        raise SystemExit(f'Cloudflare {path}: HTTP {error.code}, error codes {codes}') from None
    return (body, mime) if path == 'content/v2' else json.loads(body)['result']


def checked_sources():
    archive = Path(__file__).with_name('pareasobi-othello-reading.zip')
    files = {}
    with ZipFile(archive) as zip_file:
        for name, (_, expected) in CHECKSUMS.items():
            body = zip_file.read(name)
            if hashlib.sha256(body).hexdigest() != expected:
                raise SystemExit(f'{name}: the staged source did not match the tested file')
            files['/'+name] = body.decode()
    return files


def existing_modules():
    body, mime = cloud('content/v2')
    message = BytesParser(policy=policy.default).parsebytes(('Content-Type: '+mime+'\r\n\r\n').encode()+body)
    modules = {}
    for part in message.iter_parts():
        name = part.get_param('name', header='content-disposition')
        if not name or not re.fullmatch(r'[a-zA-Z0-9_./@-]+', name) or name in modules:
            raise SystemExit('Unexpected Worker module filename')
        modules[name] = (part.get_content_type(), part.get_payload(decode=True))
    return modules, 'pareasobi-routing-20261118.mjs'


def multipart(parts):
    boundary = 'pareasobi-'+uuid.uuid4().hex
    chunks = []
    for name, (mime, body) in parts.items():
        chunks.extend([
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode(),
            body, b'\r\n',
        ])
    chunks.append(f'--{boundary}--\r\n'.encode())
    return b''.join(chunks), 'multipart/form-data; boundary='+boundary


def main():
    versions = cloud('versions')['items']
    deployed = cloud('deployments')['deployments'][0]['versions']
    if versions[0]['id'] != BASE_VERSION or len(deployed) != 1 or deployed[0]['version_id'] != BASE_VERSION:
        raise SystemExit('Othello has a newer version or a changed deployment')
    sources = checked_sources()
    mods, entry = existing_modules()
    settings = cloud('settings')
    previous = cloud(f'versions/{BASE_VERSION}')['resources']
    flags=sorted(settings.get('compatibility_flags') or [])
    if settings.get('compatibility_date')!=previous['script_runtime'].get('compatibility_date') or flags!=sorted(previous['script_runtime'].get('compatibility_flags') or []):
        raise SystemExit('The active Worker runtime differs from its settings')
    main_module = entry
    bindings = [{'name': b['name'], 'type': 'assets' if b['type']=='assets' else 'inherit'} for b in settings['bindings']]
    print('Previous asset configuration:',json.dumps(previous.get('assets',{})))
    metadata = {
        'main_module': main_module,
        'compatibility_date': settings['compatibility_date'],
        'compatibility_flags': flags,
        'keep_assets': True,
        'assets': {'config': {'run_worker_first': ['/app.js','/furigana.js','/i18n.js']}},
        'bindings': bindings,
        'annotations': {'workers/message':'Fix Othello furigana and localization without replacing the existing assets'},
    }
    for setting in ('limits','placement','usage_model','logpush','observability','tail_consumers','tags'):
        if settings.get(setting) is not None:
            metadata[setting] = settings[setting]
    mods['metadata'] = ('application/json',json.dumps(metadata).encode())
    body, mime = multipart(mods)
    staged = cloud('versions?bindings_inherit=strict',body,mime)
    version_id = staged['id']
    actual = cloud(f'versions/{version_id}')['resources']
    print('Uploaded asset configuration:',json.dumps(actual.get('assets',{})))
    original = {(b['name'],b['type'],b.get('namespace_id')) for b in previous['bindings']}
    updated = {(b['name'],b['type'],b.get('namespace_id')) for b in actual['bindings']}
    if original != updated:
        raise SystemExit(f'Uploaded version {version_id} has different bindings and is not suitable for deployment')
    print(f'Othello version {version_id} is staged. All previous Cloudflare binding names, types and namespace IDs were retained.')
    deployment = cloud('deployments')['deployments'][0]['versions']
    if len(deployment)!=1 or deployment[0]['version_id']!=BASE_VERSION:
        raise SystemExit('Live deployment changed while the corrected version was uploading')
    payload = json.dumps({'strategy':'percentage','versions':[{'version_id':version_id,'percentage':100}]}).encode()
    cloud('deployments',payload,'application/json')
    print(f'Published Othello reading corrections: {version_id}. Previous version: {BASE_VERSION}.')


if __name__ == '__main__':
    main()
