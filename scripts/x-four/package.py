from pathlib import Path
import json,os,sys,hashlib
from post_text import render_text,weighted_length
from post_schedule import publication_key
from daily_plan import daily_plan
from rule_text import sudoku_rules

root=Path(sys.argv[1]).resolve();out=root/'output'
meta=json.loads((root/'meta.json').read_text());day=meta['date'];questions=meta['questions']
assert questions==daily_plan(day)

def alt_text(item,p,number):
 text=f"{number}{item['title']}。{item['difficulty']}。難易度{item['level']}/{item['max_level']}。"
 family=item['family']
 if family=='sudoku':
  text+=''.join(sudoku_rules(item['rule']))+'0は空欄。数字は上の行から：'+'／'.join(''.join(map(str,p['puzzle'][r*9:(r+1)*9])) for r in range(9))+'。'
  if item['rule']=='jigsaw':
   text+='枠の番号は上から：'+'／'.join(''.join(str(v+1) for v in p['regions'][r*9:(r+1)*9]) for r in range(9))+'。同じ番号の9マスが1つの枠。'
  if item['rule']=='hyper':text+='追加の領域は左上が2行2列・2行6列・6行2列・6行6列の各3×3。'
 elif family=='shirupure':
  marks=['空','○','△','□','×']
  rows=[' '.join(marks[x] for x in p['marks'][r*p['cols']:(r+1)*p['cols']]) for r in range(p['rows'])]
  text+='全てのマスを上下左右につながる6マスの部屋に分ける。各部屋に○・△・□・×を1つずつ入れる。同じ印が隣り合う間には境界線を引く。空白も部屋に含める。空は印なし。上から：'+'／'.join(rows)+'。'
 elif family=='wado':
  text+='中央に同じ漢字1文字を入れる。上の「'+p['arms']['top']+'」と左の「'+p['arms']['left']+'」から中央へ矢印が向く。中央から右の「'+p['arms']['right']+'」と下の「'+p['arms']['bottom']+'」へ矢印が向く。矢印の向きに読む4つの二字熟語を考える。解答例以外の別解が成立する場合もある。'
 elif family=='crossword':
  rows=[''.join('□' if x else '■' for x in p['grid'][r*p['n']:(r+1)*p['n']]) for r in range(p['n'])]
  text+=str(p['n'])+'×'+str(p['n'])+'。カタカナを1マス1文字で入れる。小さい文字も大きく書く。■は黒マス。盤面は上から：'+'／'.join(rows)+'。開始位置は行・列で1から数える。'
  for d,label in [(0,'ヨコ'),(1,'タテ')]:
   text+=label+'：'+'／'.join(str(e['num'])+'('+str(e['r']+1)+','+str(e['c']+1)+')'+e['clue'] for e in sorted(p['entries'],key=lambda e:e['num']) if e['d']==d)+'。'
 else:raise ValueError('Unknown puzzle family')
 return text+'画像下部に https://atugari.github.io/nanpure/ とQRコード。検索のヒントは「ナンプレ帳 atugari」。'

alts=[alt_text(item,json.loads((root/item['data_file']).read_text()),'①②③④'[i]) for i,item in enumerate(questions)]
assert all(0<len(a)<=1000 for a in alts),[len(a) for a in alts]
include_url=os.environ.get('X_FOUR_INCLUDE_URL','false').lower()=='true'
text=render_text(day,include_url)
names=[item['file'] for item in questions]
assert {p.name for p in out.glob('*.png')}==set(names)
for name in names:assert 0<(out/name).stat().st_size<5*1024*1024
post={'date':day,'slot':meta['slot'],'publication_id':publication_key(day,meta['slot']),
      'plan_version':1,'questions':questions,'text':text,'requires_longform':weighted_length(text)>280,
      'fingerprints':meta['fingerprints'],'images':[{'file':name,'alt':alt,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()} for name,alt in zip(names,alts)]}
(out/'post.json').write_text(json.dumps(post,ensure_ascii=False,indent=2))
(out/'post.txt').write_text(text+'\n')
print('Packaged four question images; ALT lengths: '+str([len(a) for a in alts]))
print('Approved full post: weighted length '+str(weighted_length(text))+'; long-form required: '+str(post['requires_longform']))
