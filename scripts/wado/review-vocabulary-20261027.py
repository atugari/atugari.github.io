"""Apply a bounded, source-backed review. Never turns absence into invalidity."""
import argparse,csv,hashlib,io,json,math,zipfile
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'nanpure/releases/2026.10.27.62/notebook'
OUT=ROOT/'scripts/client-overrides/public/notebook'
REVIEW=ROOT/'scripts/wado/review-20261027.json'
SELECTED=['何処','何方','御宅','貴兄','貴君','貴殿','一周','二階','二度','数回','番目','身近','間近','一寸','面白','可愛','人達','彼等','成程','此度']
ACCEPT={'何処':'どこ','何方':'どなた','御宅':'おたく','貴兄':'きけい','貴君':'きくん','貴殿':'きでん'}
REASONS={
'何処':'場所を尋ねる独立した代名詞。JMdictとSudachiの「どこ」が一致。',
'何方':'人を丁寧に尋ねる独立した代名詞。両辞書で「どなた」が一致。「どちら」は今回の採用読みとしない。',
'御宅':'相手・相手の家を指す表現。JUMANの既存抽出とSudachiの「おたく」が一致。',
'貴兄':'手紙などで相手を敬う呼び方。日常会話の初級語とは扱わず、表記頻度に従う。',
'貴君':'文章で相手を呼ぶ表現。日常会話の初級語とは扱わず、表記頻度に従う。',
'貴殿':'文書で相手を敬う表現。日常会話の初級語とは扱わず、表記頻度に従う。',
'一周':'現行抽出範囲で同じ読みを2系統確認できない。実在しないという判断ではない。',
'二階':'Sudachi Smallの該当行は姓。「建物の2階」の独立語の裏付けに数えない。',
'二度':'現行抽出範囲で同じ読みを2系統確認できない。数詞を一括で出題に加えない。',
'数回':'現行抽出範囲で同じ読みを2系統確認できない。数詞を一括で出題に加えない。',
'番目':'順序の表現として実在するが、独立語・同一読みの2系統条件を今回確認できない。',
'身近':'既存抽出でJMdict「みぢか」とSudachi「みじか」が異なる。機械的に同一読みへ正規化しない。',
'間近':'既存抽出でJMdict「まぢか」とSudachi「まじか」が異なる。機械的に同一読みへ正規化しない。',
'一寸':'既存抽出でJMdict「いっすん」とSudachi「ちょっと」が異なる。意味の異なる読みを同意票にしない。',
'面白':'Sudachiの該当行は「面白い」の語幹。終止形の独立語として数えない。',
'可愛':'Sudachiの該当行は人名、または「可愛い」の語幹。独立語の裏付けに数えない。',
'人達':'現行抽出範囲で同じ読みを2系統確認できない。表記頻度だけで採用しない。',
'彼等':'現行抽出範囲で同じ読みを2系統確認できない。今回のSmall該当行からは補えない。',
'成程':'Sudachiで読みは確認できるが、現行のJMdict普通語抽出と一致する第二系統がない。',
'此度':'Sudachiで読みは確認できるが、現行のJMdict普通語抽出と一致する第二系統がない。',
}
def sha(b):return hashlib.sha256(b).hexdigest()
def hira(s):return ''.join(chr(ord(c)-96) if 'ァ'<=c<='ヶ' else c for c in s)
def eligible(s):
 return dict((part.split(':',1)[0],set(part.split(':',1)[1].split('/'))) for part in s.split(';') if part)
def dump(p,v,pretty=False):p.write_text(json.dumps(v,ensure_ascii=False,indent=2 if pretty else None,separators=None if pretty else (',',':'))+'\n')
def apply_reviewed_pronouns(small,lexicons,checks):
 """Used by full rebuilds too; exact reviewed source rows, not all pronouns."""
 review=json.loads(REVIEW.read_text());archive=zipfile.ZipFile(small);raw=archive.read(next(n for n in archive.namelist() if n.endswith('.csv')))
 if sha(raw)!=review['sources']['sudachiSmallSha256']:raise ValueError('Reviewed Sudachi snapshot changed')
 selected={r['text']:r for r in review['entries'] if r['decision']=='adopted'};seen=set()
 for row in csv.reader(io.StringIO(raw.decode())):
  if not row or row[0] not in selected:continue
  target=selected[row[0]]
  if len(row)!=19 or int(row[1])<0 or int(row[2])<0 or row[5]!='代名詞' or hira(row[11])!=target['reading']:continue
  if sha('\t'.join(row).encode()) not in target['acceptedRowSha256']:continue
  lexicons['sudachi'][row[0]].add(target['reading']);checks[row[0]]|=2;seen.add(row[0])
 if seen!=set(selected):raise ValueError('Reviewed source rows missing')
def run(small):
 import wordfreq
 data=json.loads((BASE/'wado-data.json').read_text());lock=json.loads((ROOT/'scripts/wado/sources.lock.json').read_text());bank=json.loads((BASE/'wado-hints.json').read_text())
 with (BASE/'wado-audit.tsv').open() as f:next(f);rows=list(csv.DictReader(f,delimiter='\t'))
 indexed={r['text']:r for r in rows};z=zipfile.ZipFile(small);raw=z.read(next(n for n in z.namelist() if n.endswith('.csv')))
 assert sha(raw)==lock['sha256']['sudachiSmall'];source_rows={t:[] for t in SELECTED}
 for line,row in enumerate(csv.reader(io.StringIO(raw.decode())),1):
  if row and row[0] in source_rows:source_rows[row[0]].append({'line':line,'columns':row,'sha256':sha('\t'.join(row).encode())})
 frequency=wordfreq.get_frequency_dict('ja');entries=[];new_words=[]
 for t in SELECTED:
  row=indexed[t];assert row['decision']=='pending';reading=ACCEPT.get(t);old=eligible(row['eligibleReadings']);facts=source_rows[t]
  accepted=[s for s in facts if s['columns'][5]=='代名詞' and int(s['columns'][1])>=0 and int(s['columns'][2])>=0 and hira(s['columns'][11])==reading]
  sources=sorted([k for k,v in old.items() if reading in v]+(['sudachi'] if accepted and 'sudachi' not in [k for k,v in old.items() if reading in v] else [])) if reading else []
  zipf=round(9+math.log10(frequency[t]),2) if frequency.get(t) else 0
  e={'text':t,'beforeDecision':'pending','decision':'adopted' if reading else 'pending','reading':reading,'reason':REASONS[t],'before':row.copy(),'zipf':zipf,'readingSources':sources,'sudachiRows':facts,'acceptedRowSha256':[s['sha256'] for s in accepted],'commercialUseReview':{'jmdict':'CC BY-SA 4.0; 既存の帰属・継承・許諾文を保持','sudachi':'Apache-2.0 / UniDic BSD-3-Clause; 既存の著作権・条件・免責を保持','juman':'BSD-3-Clause; 既存の著作権・条件・免責を保持'},'evidenceScope':'Existing pinned audit readings plus direct inspection of the pinned Sudachi Small CSV. No inference from a search result count.'}
  entries.append(e)
  if not reading:continue
  assert len(sources)>=2 and accepted
  rank=1 if zipf>=3.5 else 2 if zipf>=2.8 else 3
  new_words.append({'text':t,'reading':reading,'rank':rank,'readingSources':sources,'zipf':zipf})
  old['sudachi']=old.get('sudachi',set())|{reading};found=set(row['foundIn'].split(','))|{'sudachi'}
  row.update(decision='adopted',reason='reading-supported',reading=reading,readingSources=','.join(sources),zipf=str(zipf),rank=str(rank),foundIn=','.join(k for k in ['jmdict','sudachi','juman'] if k in found),eligibleReadings=';'.join(k+':'+'/'.join(sorted(old[k])) for k in ['jmdict','sudachi','juman'] if k in old))
 review={'reviewedOn':'2026-10-27','baselineRelease':'2026.10.27.62','selection':'日常の指示語・生活語・文章での呼称から選定した保留20表記。すべてを初級日常語として採用するものではない。','sources':{'baselineAuditSha256':sha((BASE/'wado-audit.tsv').read_bytes()),'sudachiSmallSha256':sha(raw),'jmdictInputSha256':lock['sha256']['jmdict'],'jumanInputSha256':lock['sha256']['juman'],'jmdictLicenseUrl':lock['sources'][0]['licenseUrl'],'sudachiLicenseUrl':lock['sources'][1]['licenseUrl'],'jumanLicenseUrl':lock['sources'][2]['licenseUrl'],'licenseNotices':'wado-licenses.txt','licenseReviewedOn':'2026-10-27'},'counts':{'reviewed':20,'adopted':len(new_words),'pending':20-len(new_words)},'entries':entries}
 dump(REVIEW,review,True)
 data['revision']='whole-lexicon-3';data['words']=sorted(data['words']+new_words,key=lambda w:w['text']);spellings=data['checks'].split(' ');masks=list(data['checkSources'])
 for word in new_words:
  i=spellings.index(word['text']);masks[i]=str(int(masks[i])|2)
 data['checkSources']=''.join(masks);stats=data['stats'];stats['generationWords']=len(data['words']);stats['classification']=dict(Counter(r['decision'] for r in rows));stats['reasons']=dict(Counter(r['reason'] for r in rows));stats['byRank']={str(k):sum(w['rank']==k for w in data['words']) for k in [1,2,3]};stats['bySource']={k:sum(bool(int(mask)&b) for mask in masks) for k,b in [('jmdict',1),('sudachi',2),('juman',4)]}
 coverage=json.loads((BASE/'wado-coverage.json').read_text())
 for entry in coverage['entries']:
  if entry['text'] in ACCEPT:entry.update(decision='adopted',reason='reading-supported')
 coverage['generationMatches']=sum(e['decision']=='adopted' for e in coverage['entries']);data['coverage']={k:v for k,v in coverage.items() if k not in {'entries','unmatched'}};data['reviewedSupplement']={'file':'review-20261027.json','sha256':sha(REVIEW.read_bytes()),'scope':'six individually reviewed pronouns, exact source rows and matching readings'}
 dump(OUT/'wado-data.json',data);dump(OUT/'wado-coverage.json',coverage)
 with (OUT/'wado-audit.tsv').open('w') as f:
  f.write('# Derived lexicon: CC BY-SA 4.0. Attribution and full notices: wado-licenses.txt\n');writer=csv.DictWriter(f,fieldnames=list(rows[0]),delimiter='\t',lineterminator='\n');writer.writeheader();writer.writerows(rows)
 report=json.loads((ROOT/'scripts/wado/dictionary-report.json').read_text());report.update(revision=data['revision'],stats=stats,coverage=coverage,auditSha256=sha((OUT/'wado-audit.tsv').read_bytes()),reviewedSupplement=data['reviewedSupplement']);dump(ROOT/'scripts/wado/dictionary-report.json',report,True)
 print(json.dumps({'reviewed':20,'adopted':[w['text'] for w in new_words],'generationWords':len(data['words']),'alternativeWords':len(spellings)},ensure_ascii=False))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--sudachi-small',type=Path,required=True);run(p.parse_args().sudachi_small)
