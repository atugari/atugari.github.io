"""Package licensed audio in bounded text parts for repository transfer."""
from pathlib import Path
from io import BytesIO
import base64, hashlib, json, sys, zipfile

root=Path(__file__).resolve().parent.parent
version=sys.argv[1]
audio=root/'nanpure'/'releases'/version/'audio'
output=root/'nanpure-audio'/version
output.mkdir(parents=True,exist_ok=True)
buffer=BytesIO()
with zipfile.ZipFile(buffer,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for file in sorted(audio.glob('*.mp3')):
        info=zipfile.ZipInfo(file.name,date_time=(2026,1,1,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(info,file.read_bytes())
data=buffer.getvalue()
encoded=base64.b64encode(data).decode('ascii')
for old in output.glob('*.b64'):old.unlink()
parts=[]
for i,start in enumerate(range(0,len(encoded),524288)):
    name=f'part-{i:03}.b64'
    (output/name).write_text(encoded[start:start+524288],encoding='ascii')
    parts.append(name)
(output/'index.json').write_text(json.dumps({'version':version,'sha256':hashlib.sha256(data).hexdigest(),'parts':parts},indent=2)+'\n')
print('Packaged audio:',len(parts),'parts;',len(data),'bytes')
