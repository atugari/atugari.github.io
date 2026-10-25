from pathlib import Path
from collections import deque,defaultdict
import json,sys,os

ROOT=Path(sys.argv[1]).resolve()
REPO=Path(os.environ.get('REPO_ROOT',Path(__file__).resolve().parents[2]))
load=lambda name:json.loads((ROOT/name).read_text())
report={}

# Independent Sudoku MRV search, capped at two solutions.
p=load('sudoku.json');grid=p['puzzle'][:];solutions=[];nodes=0
def sudoku_search():
 global nodes
 nodes+=1
 best=None;allowed=None
 for i,value in enumerate(grid):
  if value:continue
  r,c=divmod(i,9)
  used=set(grid[r*9:r*9+9])|{grid[j*9+c] for j in range(9)}|{grid[rr*9+cc] for rr in range(r//3*3,r//3*3+3) for cc in range(c//3*3,c//3*3+3)}
  choices=set(range(1,10))-used
  if not choices:return
  if allowed is None or len(choices)<len(allowed):best,allowed=i,choices
 if best is None:solutions.append(grid[:]);return
 for value in sorted(allowed):
  grid[best]=value;sudoku_search();grid[best]=0
  if len(solutions)>=2:return
sudoku_search()
assert len(solutions)==1 and solutions[0]==p['solution']
assert p['rating']['humanSolvable'] and p['rating']['hardest']==8
assert any(t['id']=='x-wing' for t in p['rating']['techniques'])
report['sudoku']={'solutions':1,'independent_search_nodes':nodes,'clues':sum(bool(x) for x in grid),'rated_level':8,'technique':'X-ウィング'}

# Independent enumeration of connected six-cell rooms and exact cover.
p=load('shiru.json');rows,cols=p['rows'],p['cols'];total=rows*cols;marks=p['marks'];adj=[]
for i in range(total):
 r,c=divmod(i,cols);adj.append([rr*cols+cc for rr,cc in [(r-1,c),(r+1,c),(r,c-1),(r,c+1)] if 0<=rr<rows and 0<=cc<cols])
candidates=set()
for root in range(total):
 shapes={1<<root}
 for size in range(1,7):
  if size==6:
   for mask in shapes:
    values=[marks[i] for i in range(root,total) if mask>>i&1]
    if all(values.count(s)==1 for s in (1,2,3,4)):candidates.add(mask)
   break
  next_shapes=set()
  for mask in shapes:
   cells=[i for i in range(root,total) if mask>>i&1]
   used={marks[i] for i in cells if marks[i]}
   for i in cells:
    for n in adj[i]:
     if n<=root or mask>>n&1 or marks[n] and marks[n] in used:continue
     next_shapes.add(mask|1<<n)
  shapes=next_shapes
bycell=defaultdict(list)
for mask in candidates:
 for i in range(total):
  if mask>>i&1:bycell[i].append(mask)
full=(1<<total)-1;covers=[];cover_nodes=0
def cover(used,parts):
 global cover_nodes
 cover_nodes+=1
 if used==full:covers.append(parts);return
 options=None
 for i in range(total):
  if used>>i&1:continue
  allowed=[m for m in bycell[i] if not m&used]
  if not allowed:return
  if options is None or len(allowed)<len(options):options=allowed
 for mask in options:
  cover(used|mask,parts+[mask])
  if len(covers)>=2:return
cover(0,[])
assert len(covers)==1
labels=[-1]*total
for room,mask in enumerate(sorted(covers[0],key=lambda x:(x&-x).bit_length())):
 for i in range(total):
  if mask>>i&1:labels[i]=room
walls={f'{i}-{j}' for i in range(total) for j in adj[i] if i<j and labels[i]!=labels[j]}
assert walls==set(p['walls'])
assert p['rating']['verified'] and p['rating']['technique']==3
report['shiru']={'solutions':1,'connected_room_candidates':len(candidates),'independent_cover_nodes':cover_nodes,'rows':rows,'cols':cols,'room_size':6,'rated_level':3,'room_labels':labels}

c=load('crossword-generated.json');n=c['n'];grid=c['grid'];covered=set();number_map={}
for e in c['entries']:
 cells=[(e['r']+(j if e['d'] else 0))*n+e['c']+(0 if e['d'] else j) for j in range(len(e['answer']))]
 assert ''.join(grid[i] for i in cells)==e['answer']
 covered.update(cells)
 key=e['r']*n+e['c']
 assert number_map.get(key,e['num'])==e['num'];number_map[key]=e['num']
assert covered=={i for i,v in enumerate(grid) if v}
for i,v in enumerate(grid):
 if not v:
  r,col=divmod(i,n)
  assert col==n-1 or grid[i+1]
  assert r==n-1 or grid[i+n]
for r in range(n):
 for col in range(n):
  for dr,dc in ((1,1),(1,-1)):
   cells=[(r+dr*j,col+dc*j) for j in range(4)]
   if all(0<=rr<n and 0<=cc<n for rr,cc in cells):assert any(grid[rr*n+cc] for rr,cc in cells)
report['crossword']={'grid':f'{n}×{n}','entries':len(c['entries']),'all_crossings_consistent':True,'all_white_cells_covered':True,'black_cells_not_orthogonally_adjacent':True,'no_diagonal_chain_of_four_black_cells':True}

w=load('wado.json');d=json.loads((REPO/'scripts/client-overrides/public/notebook/wado-data.json').read_text());dictionary=set(d['checks'].split())
for e in w['words']:assert e['word'] in dictionary and len(e['sources'])>=2
kanji=set(''.join(dictionary));answers=[]
for char in kanji:
 if all((other+char if pos in ('top','left') else char+other) in dictionary for pos,other in w['arms'].items()):answers.append(char)
assert w['answer'] in answers
report['wado']={'words':[e['word'] for e in w['words']],'dictionary_candidates':sorted(answers),'checked_spellings':len(dictionary),'global_uniqueness_guaranteed':False,'format':'解答例。辞書外を含む別解は排除しない。'}
(ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:{kk:vv for kk,vv in v.items() if kk not in ('room_labels','words','dictionary_candidates')} for k,v in report.items()},ensure_ascii=False,indent=2))
