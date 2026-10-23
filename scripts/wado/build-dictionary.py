"""Refresh the compact JMdict subset. See README.md for source and monthly refresh.
Usage: python3 scripts/wado/build-dictionary.py /path/to/jmdict-eng.json.zip
"""
import hashlib,json,re,sys,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
z=zipfile.ZipFile(sys.argv[1]); raw=z.read(next(n for n in z.namelist() if n.endswith('.json'))); data=json.loads(raw)
ranks={}; rank=1
for line in (Path(__file__).parent/'vocabulary.txt').read_text().splitlines():
 if not line or line.startswith('#'):continue
 if line.isdigit():rank=int(line);continue
 for text in line.split():
  if re.fullmatch('[\u3400-\u9fff]{2}',text):ranks[text]=min(ranks.get(text,rank),rank)
checks=set(); words={}
for entry in data['words']:
 for spelling in entry['kanji']:
  text=spelling['text']
  if not re.fullmatch('[\u3400-\u9fff]{2}',text):continue
  checks.add(text)
  if text not in ranks or any(t in spelling['tags'] for t in ['rK','sK','oK','iK']):continue
  readings=[k for k in entry['kana'] if ('*' in k['appliesToKanji'] or text in k['appliesToKanji']) and not k['tags'] and re.fullmatch('[ぁ-ゖー]+',k['text'])]
  if not readings:continue
  senses=[s for s in entry['sense'] if ('*' in s['appliesToKanji'] or text in s['appliesToKanji']) and not any(t in s['misc'] for t in ['arch','obs','vulg','derog','sl'])]
  if not senses:continue
  readings.sort(key=lambda k:not k['common'])
  words.setdefault(text,{'text':text,'reading':readings[0]['text'],'rank':ranks[text]})
# Do not silently accept made-up vocabulary: omitted source spellings are recorded for review.
missing=sorted(set(ranks)-set(words))
result={'version':1,'source':'JMdict / EDRDG via scriptin/jmdict-simplified','sourceDate':data['dictDate'],'sourceSha256':hashlib.sha256(raw).hexdigest(),'copyright':'Copyright James William BREEN and The Electronic Dictionary Research and Development Group; JSON conversion by scriptin.','license':'CC BY-SA 4.0','licenseUrl':'https://www.edrdg.org/edrdg/licence.html','projectUrl':'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project','words':[words[k] for k in sorted(words)],'checks':' '.join(sorted(checks))}
output=root/'scripts/client-overrides/public/notebook/wado-data.json'; output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print('Words:',len(words),'alternative-check spellings:',len(checks),'bytes:',output.stat().st_size)
print('Omitted vocabulary:',','.join(missing))
