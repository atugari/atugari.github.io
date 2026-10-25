from pathlib import Path
from collections import deque,defaultdict
import json,sys,os,time
from daily_plan import daily_plan

ROOT=Path(sys.argv[1]).resolve()
REPO=Path(os.environ.get('REPO_ROOT',Path(__file__).resolve().parents[2]))
load=lambda name:json.loads((ROOT/name).read_text())
meta=load('meta.json')
assert meta['questions']==daily_plan(meta['date'])
report={}

def verify_sudoku(p,item):
 n=9;grid=p['puzzle'][:];solutions=[];nodes=0;started=time.monotonic()
 assert p['kind']==item['rule'] and p['level']==item['level'] and p['rating']['level']==item['level']
 assert len(grid)==81 and len(p['solution'])==81 and all(type(v)==int and 0<=v<=9 for v in grid)
 units=[[r*9+c for c in range(9)] for r in range(9)]+[[r*9+c for r in range(9)] for c in range(9)]
 if item['rule']=='jigsaw':
  regions=p['regions'];assert len(regions)==81 and len(set(regions))==9
  for region in sorted(set(regions)):
   cells={i for i,v in enumerate(regions) if v==region};assert len(cells)==9
   seen={min(cells)};todo=list(seen)
   while todo:
    i=todo.pop();r,c=divmod(i,9)
    for rr,cc in ((r-1,c),(r+1,c),(r,c-1),(r,c+1)):
     j=rr*9+cc
     if 0<=rr<9 and 0<=cc<9 and j in cells and j not in seen:seen.add(j);todo.append(j)
   assert seen==cells
   units.append(sorted(cells))
 else:units += [[(r+dr)*9+c+dc for dr in range(3) for dc in range(3)] for r in (0,3,6) for c in (0,3,6)]
 if item['rule']=='diagonal':units += [[i*10 for i in range(9)],[8+i*8 for i in range(9)]]
 if item['rule']=='hyper':units += [[(r+dr)*9+c+dc for dr in range(3) for dc in range(3)] for r in (1,5) for c in (1,5)]
 peers=[set().union(*(set(u) for u in units if i in u))-{i} for i in range(81)]
 if item['rule']=='antiknight':
  for i in range(81):
   r,c=divmod(i,9)
   peers[i]|={rr*9+cc for dr,dc in ((-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)) for rr,cc in [(r+dr,c+dc)] if 0<=rr<9 and 0<=cc<9}
 assert all(not grid[i] or all(grid[j]!=grid[i] for j in peers[i]) for i in range(81))
 def search():
  nonlocal nodes
  nodes+=1
  if nodes%1000==0 and time.monotonic()-started>60:raise TimeoutError('Independent Sudoku verification timed out')
  best=None;allowed=None
  for i,value in enumerate(grid):
   if value:continue
   choices=set(range(1,10))-{grid[j] for j in peers[i]}
   if not choices:return
   if allowed is None or len(choices)<len(allowed):best,allowed=i,choices
  if best is None:solutions.append(grid[:]);return
  for value in sorted(allowed):
   grid[best]=value;search();grid[best]=0
   if len(solutions)>=2:return
 search()
 assert len(solutions)==1 and solutions[0]==p['solution']
 return {'solutions':1,'independent_search_nodes':nodes,'clues':sum(bool(x) for x in grid),'rated_level':item['level'],'kind':item['rule']}

def verify_shiru(p,item):
 rows,cols=p['rows'],p['cols'];total=rows*cols;marks=p['marks'];adj=[]
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
    cells=[i for i in range(root,total) if mask>>i&1];used={marks[i] for i in cells if marks[i]}
    for i in cells:
     for n in adj[i]:
      if n<=root or mask>>n&1 or marks[n] and marks[n] in used:continue
      next_shapes.add(mask|1<<n)
   shapes=next_shapes
 bycell=defaultdict(list)
 for mask in candidates:
  for i in range(total):
   if mask>>i&1:bycell[i].append(mask)
 full=(1<<total)-1;covers=[];nodes=0
 def cover(used,parts):
  nonlocal nodes
  nodes+=1
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
 assert p['rating']['verified'] and p['rating']['technique']==item['level']
 return {'solutions':1,'connected_room_candidates':len(candidates),'independent_cover_nodes':nodes,'rows':rows,'cols':cols,'room_size':6,'rated_level':item['level']}

def verify_crossword(p,item):
 n=p['n'];grid=p['grid'];covered=set();number_map={}
 assert p['options']['level']==item['level']
 for e in p['entries']:
  cells=[(e['r']+(j if e['d'] else 0))*n+e['c']+(0 if e['d'] else j) for j in range(len(e['answer']))]
  assert ''.join(grid[i] for i in cells)==e['answer']
  covered.update(cells);key=e['r']*n+e['c']
  assert number_map.get(key,e['num'])==e['num'];number_map[key]=e['num']
 assert covered=={i for i,v in enumerate(grid) if v}
 for i,v in enumerate(grid):
  if not v:
   r,c=divmod(i,n);assert c==n-1 or grid[i+1];assert r==n-1 or grid[i+n]
 for r in range(n):
  for c in range(n):
   for dr,dc in ((1,1),(1,-1)):
    cells=[(r+dr*j,c+dc*j) for j in range(4)]
    if all(0<=rr<n and 0<=cc<n for rr,cc in cells):assert any(grid[rr*n+cc] for rr,cc in cells)
 return {'grid':f'{n}×{n}','entries':len(p['entries']),'rated_level':item['level'],'all_crossings_consistent':True,'black_cells_valid':True}

def verify_wado(p,item):
 assert p['level']==item['level']
 data=json.loads((REPO/'scripts/client-overrides/public/notebook/wado-data.json').read_text())
 dictionary=set(data['checks'].split())
 for e in p['words']:assert e['word'] in dictionary and len(e['sources'])>=2
 answers=[char for char in set(''.join(dictionary)) if all((other+char if pos in ('top','left') else char+other) in dictionary for pos,other in p['arms'].items())]
 assert p['answer'] in answers
 return {'rated_level':item['level'],'words':[e['word'] for e in p['words']],'dictionary_candidates':sorted(answers),'global_uniqueness_guaranteed':False}

functions={'sudoku':verify_sudoku,'shirupure':verify_shiru,'crossword':verify_crossword,'wado':verify_wado}
for item in meta['questions']:report[item['rule']]=functions[item['family']](load(item['data_file']),item)
(ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:{kk:vv for kk,vv in v.items() if kk not in ('words','dictionary_candidates')} for k,v in report.items()},ensure_ascii=False,indent=2))
