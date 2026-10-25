from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import json,os,subprocess,sys
from publish import Ledger,XClient,publish,validate

script=Path(__file__).resolve().parent
repo=Path(os.environ.get('REPO_ROOT',script.parents[1])).resolve()
work=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'x-four-work';work.mkdir(exist_ok=True)
day=datetime.now(ZoneInfo('Asia/Tokyo')).date().isoformat()
mode=os.environ.get('X_FOUR_MODE','preview')
if mode not in ('preview','check','publish'):raise ValueError('Invalid mode')
if mode=='check':
    username=XClient().username()
    if username.lower()!=os.environ.get('X_EXPECTED_USERNAME','parade166').lower():raise RuntimeError('Wrong X account')
    print('X connection verified for @'+username)
    sys.exit(0)
if os.environ.get('GITHUB_TOKEN'):
    ledger=Ledger();history=ledger.load()
    if day in history.get('posts',{}) and mode=='publish':raise RuntimeError('This date already has an attempt; check its history before continuing')
else:history=json.loads((script/'previously-prepared.json').read_text())
(work/'history.json').write_text(json.dumps(history))
def run(*args):subprocess.run(args,check=True,cwd=repo)
run('node',str(script/'generate.mjs'),str(work),day)
run(sys.executable,str(script/'verify.py'),str(work))
run(sys.executable,str(script/'render.py'),str(work))
run(sys.executable,str(script/'package.py'),str(work))
validate(work/'output')
if mode=='publish':
    if os.environ.get('X_FOUR_POST_ENABLED')!='true':raise RuntimeError('Posting is disabled; finish the connection check before enabling it')
    post_id=publish(work/'output',ledger,XClient(),os.environ.get('X_EXPECTED_USERNAME','parade166'))
    print('Published: https://x.com/'+os.environ.get('X_EXPECTED_USERNAME','parade166')+'/status/'+post_id)
else:print('Preview ready. Nothing was sent to X.')
