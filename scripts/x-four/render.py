from pathlib import Path
from functools import lru_cache
import json,math,os,sys,qrcode,zxingcpp
from PIL import Image,ImageDraw,ImageFont
from fontTools.ttLib import TTFont
from daily_plan import daily_plan
from rule_text import sudoku_rules

ROOT=Path(sys.argv[1]).resolve()
OUT=ROOT/'output';OUT.mkdir(exist_ok=True)
S=2048
BG='#F7F4EC';INK='#1F302B';MUTED='#5A665F';LINE='#ADB5AC';WHITE='#FFFFFF'
URL='atugari.github.io/nanpure/'
REG=Path(os.environ.get('X_FONT_REGULAR','/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'));BOLD=Path(os.environ.get('X_FONT_BOLD','/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'))
META=json.loads((ROOT/'meta.json').read_text());ITEMS=META['questions']
assert ITEMS==daily_plan(META['date'])
DAY=META['date'].replace('-','.')
@lru_cache(maxsize=None)
def font(size,bold=False):return ImageFont.truetype(str(BOLD if bold else REG),size)
texts=[];boxes=[]
def text(draw,xy,value,size=44,fill=INK,bold=False,anchor='lt',limit=None):
 value=str(value);texts.append(value)
 bbox=draw.textbbox(xy,value,font=font(size,bold),anchor=anchor)
 if limit:assert bbox[2]<=limit,(value,bbox,limit)
 assert bbox[0]>=-1 and bbox[1]>=-1 and bbox[2]<=S+1 and bbox[3]<=S+1,(value,bbox)
 boxes.append(bbox);draw.text(xy,value,font=font(size,bold),fill=fill,anchor=anchor)
 return bbox
def center(draw,xy,value,size=80,fill=INK,bold=True):
 # Bounding-box centering includes CJK glyph height and avoids baseline drift.
 value=str(value);f=font(size,bold);b=draw.textbbox((0,0),value,font=f)
 x=xy[0]-(b[2]-b[0])/2-b[0];y=xy[1]-(b[3]-b[1])/2-b[1]
 texts.append(value);draw.text((x,y),value,font=f,fill=fill)
def wrap(draw,value,max_width,size,bold=False):
 lines=[];line=''
 for char in value:
  if draw.textlength(line+char,font=font(size,bold))>max_width:
   lines.append(line);line=char
  else:line+=char
 if line:lines.append(line)
 return lines
def lines(draw,x,y,values,size=42,gap=17,fill=INK,bold=False,width=None):
 for value in values:
  chunks=wrap(draw,value,width,size,bold) if width else [value]
  for chunk in chunks:
   text(draw,(x,y),chunk,size,fill,bold,limit=x+width if width else None);y+=size+gap
 return y
def base(number,title,badge,accent,subtitle,answer=False):
 im=Image.new('RGB',(S,S),BG);d=ImageDraw.Draw(im)
 d.rectangle((0,0,S,20),fill=accent)
 text(d,(104,78),'解答・解答例' if answer else '今日の問題',49,accent,True)
 text(d,(1944,85),DAY,38,MUTED,False,'rt')
 text(d,(104,180),f'{number} {title}',104,INK,True,limit=1480)
 b=d.textbbox((0,0),badge,font=font(35,True));w=b[2]-b[0]+54
 d.rounded_rectangle((1944-w,214,1944,280),radius=20,fill=accent)
 text(d,(1944-w/2,231),badge,35,WHITE,True,'mt')
 d.line((104,320,1944,320),fill=accent,width=5)
 text(d,(104,355),subtitle,43,INK,False,limit=1944)
 d.rectangle((0,1878,2048,2048),fill=INK)
 text(d,(104,1904),'ナンプレ帳',48,WHITE,True)
 text(d,(104,1986),'無料で遊ぶ・問題をつくる・A4印刷',27,'#D5E1D6')
 text(d,(1744,1908),URL,52,WHITE,False,'rt')
 text(d,(1744,1986),'検索のヒント：ナンプレ帳 atugari',28,'#D5E1D6',False,'rt')
 qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,box_size=4,border=4)
 qr.add_data('https://'+URL);qr.make(fit=True)
 q=qr.make_image(fill_color=INK,back_color=WHITE).convert('RGB')
 assert q.width<=156 and q.height<=156
 im.paste(q,(1944-q.width,2036-q.height))

 return im,d

def badge(item):return f"{item['difficulty']} / Lv.{item['level']}・{item['max_level']}段階"

def mark(d,x,y,value,scale=1):
 radius=40*scale;width=max(3,round(10*scale))
 if value==1:d.ellipse((x-radius,y-radius,x+radius,y+radius),outline=INK,width=width)
 elif value==2:
  pts=[(x,y-47*scale),(x-44*scale,y+32*scale),(x+44*scale,y+32*scale),(x,y-47*scale)]
  d.line(pts,fill=INK,width=width,joint='curve')
 elif value==3:d.rectangle((x-36*scale,y-36*scale,x+36*scale,y+36*scale),outline=INK,width=width)
 elif value==4:
  a=35*scale;d.line((x-a,y-a,x+a,y+a),fill=INK,width=width);d.line((x-a,y+a,x+a,y-a),fill=INK,width=width)
def shiru(item,p,number,answer=False):
 im,d=base(number,item['title'],badge(item),'#2D6251','境界線を引いて6マスずつの部屋に分けよう。',answer)
 cell=142;x=(S-p['cols']*cell)//2;y=465
 d.rectangle((x,y,x+p['cols']*cell,y+p['rows']*cell),fill=WHITE)
 for r in range(p['rows']+1):d.line((x,y+r*cell,x+p['cols']*cell,y+r*cell),fill=LINE,width=3)
 for c in range(p['cols']+1):d.line((x+c*cell,y,x+c*cell,y+p['rows']*cell),fill=LINE,width=3)
 for i,v in enumerate(p['marks']):
  r,c=divmod(i,p['cols']);mark(d,x+(c+.5)*cell,y+(r+.5)*cell,v)
 if answer:
  for edge in p['walls']:
   a,b=map(int,edge.split('-'));r,c=divmod(a,p['cols'])
   if b==a+1:d.line((x+(c+1)*cell,y+r*cell,x+(c+1)*cell,y+(r+1)*cell),fill='#2D6251',width=15)
   else:d.line((x+c*cell,y+(r+1)*cell,x+(c+1)*cell,y+(r+1)*cell),fill='#2D6251',width=15)
 d.rectangle((x,y,x+p['cols']*cell,y+p['rows']*cell),outline=INK,width=9)
 lines(d,104,1660,[
 '全てのマスを使って各部屋に ○・△・□・× を1つずつ。',
 '部屋は上下左右につながる6マス。空白マスも使います。',
 '上下左右で隣り合う同じ印の間には必ず境界線を引きます。'],size=42,gap=19,width=1840)
 text(d,(104,1832),'8×6マス / 4種類の印 / 1部屋6マス',31,MUTED)
 return im

def sudoku(item,p,number,answer=False):
 kind=item['rule'];rules=sudoku_rules(kind)
 im,d=base(number,item['title'],badge(item),'#315F8A',rules[0],answer)
 cell=138;x=(S-cell*9)//2;y=450
 regions=p.get('regions',[r//3*3+c//3 for r in range(9) for c in range(9)])
 palette=['#FFFFFF','#F0F4E8','#E9F2F6','#F8EEDD','#EAEAF5','#F2E6EE','#E5F1EB','#F6F2E8','#E8EEF1']
 for r in range(9):
  for c in range(9):
   fill=palette[regions[r*9+c]%9] if kind=='jigsaw' else (WHITE if (r//3+c//3)%2==0 else '#F1F5F7')
   if kind=='diagonal' and (r==c or r+c==8):fill='#DCEAF2'
   if kind=='hyper' and any(rr<=r<rr+3 and cc<=c<cc+3 for rr in (1,5) for cc in (1,5)):fill='#DCE9E0'
   d.rectangle((x+c*cell,y+r*cell,x+(c+1)*cell,y+(r+1)*cell),fill=fill)
 if kind=='diagonal':
  d.line((x+cell/2,y+cell/2,x+8.5*cell,y+8.5*cell),fill='#B0CBDC',width=14)
  d.line((x+8.5*cell,y+cell/2,x+cell/2,y+8.5*cell),fill='#B0CBDC',width=14)
 if kind=='hyper':
  for rr in (1,5):
   for cc in (1,5):d.rectangle((x+cc*cell+6,y+rr*cell+6,x+(cc+3)*cell-6,y+(rr+3)*cell-6),outline='#92B69F',width=7)
 for i in range(10):
  w=3 if kind=='jigsaw' else 12 if i%3==0 else 3;color=INK if w==12 else LINE
  d.line((x+i*cell,y,x+i*cell,y+9*cell),fill=color,width=w)
  d.line((x,y+i*cell,x+9*cell,y+i*cell),fill=color,width=w)
 if kind=='jigsaw':
  for r in range(9):
   for c in range(9):
    i=r*9+c
    if c<8 and regions[i]!=regions[i+1]:d.line((x+(c+1)*cell,y+r*cell,x+(c+1)*cell,y+(r+1)*cell),fill=INK,width=12)
    if r<8 and regions[i]!=regions[i+9]:d.line((x+c*cell,y+(r+1)*cell,x+(c+1)*cell,y+(r+1)*cell),fill=INK,width=12)
 d.rectangle((x,y,x+9*cell,y+9*cell),outline=INK,width=12)
 for i,value in enumerate(p['solution'] if answer else p['puzzle']):
  if value:
   r,c=divmod(i,9);center(d,(x+(c+.5)*cell,y+(r+.5)*cell),value,89,INK if p['puzzle'][i] else '#315F8A')
 notes=rules[1:] or ['同じ行・列・枠の中で数字を重ねずに埋めてください。']
 lines(d,104,1744,notes,size=36,gap=14,width=1840)
 text(d,(104,1832),'9×9 / '+item['title'],30,MUTED)
 return im

def arrow(d,start,end,color=INK,width=20,head=36):
 dx=end[0]-start[0];dy=end[1]-start[1];length=math.hypot(dx,dy);ux,uy=dx/length,dy/length
 back=(end[0]-ux*head,end[1]-uy*head)
 d.line((*start,*back),fill=color,width=width)
 d.polygon([end,(back[0]-uy*head*.68,back[1]+ux*head*.68),(back[0]+uy*head*.68,back[1]-ux*head*.68)],fill=color)

def wado(item,WADO,number,answer=False):
 im,d=base(number,item['title'],badge(item),'#875535','同じ漢字1文字で4つの熟語を作ろう。',answer)
 cx,cy=1024,1028
 for pos,(x,y) in {'top':(1024,573),'left':(569,1028),'right':(1479,1028),'bottom':(1024,1483)}.items():
  d.rounded_rectangle((x-122,y-122,x+122,y+122),radius=8,fill=WHITE,outline=INK,width=9)
  center(d,(x,y),WADO['arms'][pos],165)
 d.rounded_rectangle((cx-160,cy-160,cx+160,cy+160),radius=8,fill=WHITE,outline=INK,width=12)
 center(d,(cx,cy),WADO['answer'] if answer else '？',171 if answer else 148,INK if answer else '#84938B')
 # Every arrow ends at least 35 px before a frame. Tips never enter a box.
 arrow(d,(1024,733),(1024,830));arrow(d,(729,1028),(826,1028))
 arrow(d,(1222,1028),(1319,1028));arrow(d,(1024,1226),(1024,1323))
 if answer:
  words=' / '.join(e['word'] for e in WADO['words'])
  text(d,(1024,1665),words,52,INK,True,'mt')
 else:text(d,(1024,1684),'矢印の向きに2文字で読んでください。',48,INK,True,'mt')
 text(d,(1024,1772),'上・左 → 中央 → 右・下',39,MUTED,False,'mt')
 text(d,(104,1832),'※解答例以外にも成立する熟語の組み合わせがある場合があります。',30,MUTED)
 return im

def crossword(item,CW,number,answer=False):
 for entry in CW['entries']:entry['displayClue']=entry['clue']
 im,d=base(number,item['title'],badge(item),'#725887','カタカナで1マス1文字。小さいャ・ュ・ョ・ッも大きく。',answer)
 n=CW['n'];cell=88;x=(S-n*cell)//2;y=435
 starts={e['r']*n+e['c']:e['num'] for e in CW['entries']}
 for i,value in enumerate(CW['grid']):
  r,c=divmod(i,n);box=(x+c*cell,y+r*cell,x+(c+1)*cell,y+(r+1)*cell)
  d.rectangle(box,fill=WHITE if value else INK,outline=INK,width=3)
  if value and i in starts:text(d,(box[0]+7,box[1]+7),starts[i],25,INK,True)
  if answer and value:center(d,((box[0]+box[2])/2,(box[1]+box[3])/2+8),value,59,'#725887')
 d.rectangle((x,y,x+n*cell,y+n*cell),outline=INK,width=6)
 for direction,label,left in [(0,'ヨコのカギ',104),(1,'タテのカギ',1068)]:
  text(d,(left,1080),label,48,'#725887',True)
  yy=1140
  entries=sorted((e for e in CW['entries'] if e['d']==direction),key=lambda e:e['num'])
  clue_size=40
  while clue_size>36 and sum(max(clue_size+15,len(wrap(d,e['displayClue'],810,clue_size))*(clue_size+8)+7) for e in entries)>710:clue_size-=2
  for entry in entries:
   text(d,(left,yy),str(entry['num']),36,'#725887',True)
   clue=entry['answer']+'：'+entry['displayClue'] if answer else entry['displayClue']
   # Answer sheet already shows the completed grid; do not reduce clue readability.
   clue=entry['displayClue']
   chunks=wrap(d,clue,810,clue_size)
   for j,line in enumerate(chunks):text(d,(left+62,yy+j*(clue_size+8)),line,clue_size,INK,False,limit=left+880)
   yy+=max(clue_size+15,len(chunks)*(clue_size+8)+7)
  assert yy<=1850,('クロスワードのカギが画像に収まりません',direction,yy)
 return im

images=[]
renderers={'shirupure':shiru,'sudoku':sudoku,'wado':wado,'crossword':crossword}
for i,item in enumerate(ITEMS):
 name=item['file'];p=json.loads((ROOT/item['data_file']).read_text())
 im=renderers[item['family']](item,p,'①②③④'[i])
 for size in (2048,1024):
  scan=im if size==2048 else im.resize((size,size),Image.Resampling.LANCZOS)
  assert 'https://'+URL in [b.text for b in zxingcpp.read_barcodes(scan)],('QR decode failed',name,size)
 im.save(OUT/name,optimize=True);images.append(im)
check_font=TTFont(BOLD,fontNumber=0);cmap=check_font.getBestCmap();missing=sorted({c for t in texts for c in t if not c.isspace() and ord(c) not in cmap})
assert not missing,missing
assert len([p for p in OUT.glob('0*.png')])==4
for p in OUT.glob('*.png'):
 assert p.stat().st_size<5*1024*1024
 print(p.name,p.stat().st_size)
(ROOT/'render-audit.json').write_text(json.dumps({'canvas':[2048,2048],'all_images_below_5MB':True,'checked_text_objects':len(boxes),'missing_glyphs':missing,'arrow_clearance_pixels':35,'qr_decoded_at':[2048,1024],'search_hint':'ナンプレ帳 atugari'},indent=2))
