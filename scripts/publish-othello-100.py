import base64
import hashlib
import importlib.util
import json
import mimetypes
import re
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

spec=importlib.util.spec_from_file_location('support',Path(__file__).with_name('repair-othello-routing.py'))
support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
BASE='a6939f9d-718f-4b10-9654-faa3b3769d61'
from zipfile import ZipFile
support.CHECKSUMS={'app.js': ('35f2e2002d930f200f9cf92a6e68d047c7e055e46eda7e52af1ef82489afbc05', '6c162e1c709ceb64ced57b6552ac17556fcf75322c39688db44cc8c93aff39bc'), 'i18n.js': ('e34b6a4d189432248df53c918803d3778ca713e968285659752aed419d46cb0a', '2d31fde735b6b373c12ebd60b6f3c36a58289a4d2eb7a05a2f77100d1cb04231'), 'furigana.js': ('ceb96bad939c2c166177e6ef8037cb555388f7a766b3dbc06c2b3d02c97cda90', '354f54cce799e7506a8e734c6331f11318e6014053ce68191e365b33125c0111'), 'style.css': ('c61f2a17c928d8305f6b1e9b130855bba139cfb386afb68e619e7d50aa9201b7', '4c8e5b72bff3a87ec6c6ac6eb849c406ab5bbca5569907f909fe2fab8e184d13')}
def staged_sources():
    result={}
    with ZipFile(Path(__file__).with_name('pareasobi-othello-100.zip')) as archive:
        for name in archive.namelist():
            if name not in support.CHECKSUMS and not re.fullmatch(r'i18n/[A-Za-z-]+\.[0-9a-f]{12}\.json',name):raise SystemExit('Unexpected localized asset path')
            body=archive.read(name)
            if name in support.CHECKSUMS and hashlib.sha256(body).hexdigest()!=support.CHECKSUMS[name][1]:raise SystemExit('Tested asset checksum differs: '+name)
            if name.endswith('.json'):
                if hashlib.sha256(body).hexdigest()[:12]!=name.split('.')[-2]:raise SystemExit('Language pack checksum differs')
                data=json.loads(body)
                if len(data)!=303:raise SystemExit('Incomplete language dictionary: '+name)
            result['/'+name]=body.decode()
    if len(result)!=84:raise SystemExit('Expected four core files and eighty language packs')
    return result
support.checked_sources=staged_sources


def request(url,data,token,mime):
    req=urllib.request.Request(url,data=data,headers={'Authorization':'Bearer '+token,'Content-Type':mime})
    try:
        with urllib.request.urlopen(req,timeout=90) as res:
            payload=json.load(res)
    except urllib.error.HTTPError as e:
        try:codes=[x.get('code') for x in json.load(e).get('errors',[])]
        except Exception:codes=[]
        raise SystemExit(f'Asset API HTTP {e.code}: {codes}') from None
    if not payload.get('success'):raise SystemExit('Asset API rejected the upload')
    return payload['result']

def collect():
    files={};todo=['/index.html'];headers={};seen=set()
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp)
        while todo:
            path=todo.pop()
            if path in seen:continue
            seen.add(path)
            if len(files)>100:raise SystemExit('Unexpected asset graph size')
            dest=root/'body';head=root/'headers'
            url=support.ORIGIN+('/' if path=='/index.html' else path)
            fetched=subprocess.run(['curl','--fail','--silent','--show-error','--max-time','45','--retry','2','-D',str(head),'-o',str(dest),url])
            if fetched.returncode:
                if fetched.returncode==22 and ' 404' in head.read_text():
                    print('Ignored unavailable source-reference path:',path);continue
                raise SystemExit('Unable to download a referenced asset: '+path)
            body=dest.read_bytes();files[path]=body
            if path=='/index.html':
                for line in head.read_text().splitlines():
                    if ':' in line:
                        k,v=line.split(':',1)
                        if k.lower() in ('content-security-policy','referrer-policy','x-content-type-options','x-frame-options','permissions-policy','cache-control'):headers[k]=v.strip()
            if Path(path).suffix.lower() not in ('.html','.css','.js','.json'):continue
            text=body.decode()
            candidates=re.findall(r'''["'(]([^"'()\s<>`]+\.(?:js|css|mp3|png|jpg|jpeg|svg|webp|ico|json|wasm)(?:\?[^"'()\s<>`]*)?)["')]''',text)
            for value in candidates:
                parsed=urllib.parse.urlsplit(urllib.parse.urljoin(support.ORIGIN+path,value))
                if parsed.netloc!=urllib.parse.urlsplit(support.ORIGIN).netloc:continue
                if parsed.path.startswith('/api/'):continue
                if parsed.path not in files:todo.append(parsed.path)
    for name,(expected,_) in support.CHECKSUMS.items():
        if hashlib.sha256(files['/'+name]).hexdigest()!=expected:raise SystemExit('A public source changed during preparation: '+name)
    files.update({name:body.encode() for name,body in support.checked_sources().items()})
    return files,headers

def main():
    deployed=support.cloud('deployments')['deployments'][0]['versions']
    if len(deployed)!=1 or deployed[0]['version_id']!=BASE:raise SystemExit('Othello deployment changed; refusing to overwrite it')
    files,headers=collect()
    print('Prepared complete referenced asset graph:',len(files),'files,',sum(map(len,files.values())),'bytes')
    manifest={p:{'hash':hashlib.sha256(b).hexdigest()[:32],'size':len(b)} for p,b in files.items()}
    session=support.cloud('assets-upload-session',json.dumps({'manifest':manifest}).encode(),'application/json')
    upload_token=session['jwt'];completion=upload_token
    by_hash={m['hash']:files[p] for p,m in manifest.items()}
    by_name={m['hash']:p for p,m in manifest.items()}
    for bucket in session.get('buckets',[]):
        parts={h:(mimetypes.guess_type(by_name[h])[0] or 'application/octet-stream',base64.b64encode(by_hash[h])) for h in bucket}
        body,mime=support.multipart(parts)
        result=request(f'https://api.cloudflare.com/client/v4/accounts/{support.ACCOUNT}/workers/assets/upload?base64=true',body,upload_token,mime)
        if result.get('jwt'):completion=result['jwt']
    mods,_=support.existing_modules()
    originals=[n for n,(kind,_) in mods.items() if kind=='application/javascript+module' and not n.startswith('pareasobi-')]
    if len(originals)!=1:raise SystemExit('Cannot identify the unchanged original Worker entry')
    for name in list(mods):
        if name.startswith('pareasobi-'):del mods[name]
    if '_headers' not in mods:
        mods['_headers']=('text/plain',('/*\n'+''.join('  '+k+': '+v+'\n' for k,v in headers.items())).encode())
    old_headers=mods['_headers'][1].decode()
    mods['_headers']=('text/plain',(old_headers+'\n/i18n/*\n  Cache-Control: public, max-age=31536000, immutable\n').encode())
    settings=support.cloud('settings');previous=support.cloud('versions/'+BASE)['resources']
    metadata={'main_module':originals[0],'compatibility_date':settings['compatibility_date'],'compatibility_flags':settings.get('compatibility_flags') or [],'assets':{'jwt':completion,'config':{'html_handling':'auto-trailing-slash','not_found_handling':'none','run_worker_first':['/api/*','/ws*']}},'bindings':[{'name':b['name'],'type':'assets' if b['type']=='assets' else 'inherit'} for b in settings['bindings']],'annotations':{'workers/message':'Add the matching 100 languages, searchable picker and sentence furigana without changing game state'}}
    for key in ('limits','placement','usage_model','logpush','observability','tail_consumers','tags'):
        if settings.get(key) is not None:metadata[key]=settings[key]
    mods['metadata']=('application/json',json.dumps(metadata).encode())
    body,mime=support.multipart(mods);staged=support.cloud('versions?bindings_inherit=strict',body,mime);version=staged['id']
    actual=support.cloud('versions/'+version)['resources']
    bindings=lambda resource:{(b['name'],b['type'],b.get('namespace_id')) for b in resource['bindings']}
    if bindings(previous)!=bindings(actual):raise SystemExit('Bindings differ; not deploying '+version)
    deployed=support.cloud('deployments')['deployments'][0]['versions']
    if len(deployed)!=1 or deployed[0]['version_id']!=BASE:raise SystemExit('Live version changed during upload; not deploying')
    support.cloud('deployments',json.dumps({'strategy':'percentage','versions':[{'version_id':version,'percentage':100}]}).encode(),'application/json')
    print('Published static Othello reading corrections:',version)

if __name__=='__main__':main()
