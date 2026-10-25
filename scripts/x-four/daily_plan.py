"""Choose four distinct daily rules and real generator difficulty levels."""
from datetime import date
from pathlib import Path
import hashlib,json,random,sys

CATALOG=json.loads((Path(__file__).parent/'rule-catalog.json').read_text(encoding='utf-8'))
RULES={item['rule']:item for item in CATALOG}
LABELS=('やさしい','ふつう','むずかしい')

def daily_plan(day):
    date.fromisoformat(day)
    rng=random.Random(int.from_bytes(hashlib.sha256(('x-four-plan-v1:'+day).encode()).digest(),'big'))
    while True:
        selected=rng.sample(CATALOG,4)
        if sum(item['family']=='sudoku' for item in selected)<=2:break
    result=[]
    for index,item in enumerate(selected,1):
        tier=rng.randrange(3)
        result.append({'rule':item['rule'],'title':item['title'],'family':item['family'],
                       'level':rng.choice(item['levels'][tier]),'max_level':item['max_level'],
                       'difficulty':LABELS[tier],'file':f'{index:02}-question.png',
                       'data_file':f'puzzle-{index:02}.json'})
    return result

if __name__=='__main__':print(json.dumps(daily_plan(sys.argv[1]),ensure_ascii=False))
