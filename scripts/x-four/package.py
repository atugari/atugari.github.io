from pathlib import Path
import json,os,sys,hashlib

root=Path(sys.argv[1]).resolve();out=root/'output'
meta=json.loads((root/'meta.json').read_text());day=meta['date']
load=lambda name:json.loads((root/name).read_text())
s=load('sudoku.json');p=load('shiru.json');w=load('wado.json');c=load('crossword-generated.json')
marks=['空','○','△','□','×']
shiru_rows=[' '.join(marks[x] for x in p['marks'][r*p['cols']:(r+1)*p['cols']]) for r in range(p['rows'])]
alt1='①シルプレ。全てのマスを上下左右につながる6マスの部屋に分ける。各部屋に○・△・□・×を1つずつ入れる。同じ印が隣り合う間には境界線を引く。空白も部屋に含める。空は印なし。上から：'+'／'.join(shiru_rows)+'。'
alt2='②ナンプレ・数独。9×9の難問。行・列・太い3×3の枠に1〜9を1回ずつ入れる。0は空欄。上から：'+'／'.join(''.join(map(str,s['puzzle'][r*9:(r+1)*9])) for r in range(9))+'。'
alt3='③和同開珎。中央に同じ漢字1文字を入れる。上の「'+w['arms']['top']+'」と左の「'+w['arms']['left']+'」から中央へ矢印が向く。中央から右の「'+w['arms']['right']+'」と下の「'+w['arms']['bottom']+'」へ矢印が向く。矢印の向きに読む4つの二字熟語を考える。解答例以外の別解が成立する場合もある。'
rows=[''.join('□' if x else '■' for x in c['grid'][r*c['n']:(r+1)*c['n']]) for r in range(c['n'])]
alt4='④クロスワード。'+str(c['n'])+'×'+str(c['n'])+'。カタカナを1マス1文字で入れる。小さい文字も大きく書く。■は黒マス。盤面は上から：'+'／'.join(rows)+'。開始位置は行・列で1から数える。'
for d,label in [(0,'ヨコ'),(1,'タテ')]:
 alt4+=label+'：'+'／'.join(str(e['num'])+'('+str(e['r']+1)+','+str(e['c']+1)+')'+e['clue'] for e in sorted(c['entries'],key=lambda e:e['num']) if e['d']==d)+'。'
alts=[a+'画像下部に https://atugari.github.io/nanpure/ とQRコード。検索のヒントは「ナンプレ帳 atugari」。' for a in [alt1,alt2,alt3,alt4]]
assert all(0<len(a)<=1000 for a in alts),[len(a) for a in alts]
include_url=os.environ.get('X_FOUR_INCLUDE_URL','false').lower()=='true'
label=day[5:].replace('-','/')
guide='画像のURL・QRから。'
if include_url:guide='https://atugari.github.io/nanpure/'
text=('【今日の4問｜'+label+'】\n'
      'ナンプレ帳は無料。脳トレや学校・施設のプリントに自由にどうぞ。\n\n'
      'OFUSEはSoziの応援窓口。\n'
      '無料メッセージや100円からの支援を送れます。\n'
      '決済は専門サービスStripe。カード情報はナンプレ帳に入力しません。\n'
      'サイトのOFUSEから応援を！\n\n'
      +guide+'\n'
      '#ナンプレ帳')

names=['01-shirupure.png','02-sudoku.png','03-wado.png','04-crossword.png']
assert len([x for x in out.glob('*.png')])==4
for name in names:assert 0<(out/name).stat().st_size<5*1024*1024
# Public output contains only questions and ALT. No answer material is copied.
post={'date':day,'text':text,'fingerprints':meta['fingerprints'],'images':[{'file':name,'alt':alt,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()} for name,alt in zip(names,alts)]}
(out/'post.json').write_text(json.dumps(post,ensure_ascii=False,indent=2))
(out/'post.txt').write_text(text+'\n')
print('Packaged four question images; ALT lengths: '+str([len(a) for a in alts]))
