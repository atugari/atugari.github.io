import json,pathlib
root=pathlib.Path(__file__).resolve().parents[2]
a=json.loads((root/'scripts/achievements/catalog-source.json').read_text())
supported=json.loads((root/'scripts/achievements/supported-kinds.json').read_text())
limits={k['key']+':'+str(l['n']):l['count'] for k in supported for l in k['levels']}
for x in a:
 sig=x['signature']; target=x['target']
 if sig.startswith('clear:first-level:'): key=sig;target=1
 elif sig.startswith('nohint:max:'):key=sig;target=1
 elif x['id']=='NP-0455':key='daily:kind-variety';target=4
 elif x['id'] in ['NP-0456','NP-0457']:key='daily:past';target=10 if x['id']=='NP-0456' else 50
 elif x['id']=='NP-0458':key='ranked:tier-variety';target=3
 elif sig.startswith('secret:') or sig in ['guide:three-in-one','meta:visibility','meta:rarities']:key=sig;target=1
 else:
  target=target if isinstance(target,int) else int(sig.rsplit(':',1)[-1])
  key=sig.rsplit(':',1)[0]
 x['rule']=key;x['target']=target
 assert 1<=x['rarity']<=6
 assert x['visibility'] in ['明記','抽象','完全秘密']
rows=[{k:x[k] for k in ['id','name','category','chapter','rarity','visibility','public','condition','rule','target']} for x in a]
out={'version':1,'rows':rows,'limits':limits,'kinds':[x['key'] for x in supported]}
(root/'scripts/client-overrides/public/achievements-catalog.js').write_text('(function(g){g.NPAchievementCatalog='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';})(globalThis);\n')
assert len(rows)==1000 and len(set(x['id'] for x in rows))==1000
print('Built exactly',len(rows),'titles')
