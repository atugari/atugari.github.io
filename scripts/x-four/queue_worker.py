"""Prepare up to three Japan days in advance; Cloudflare alone publishes them."""
import base64,hashlib,json,os,subprocess,sys
from datetime import datetime,timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from publish import Ledger,validate
from post_schedule import SLOTS,publication_key

DEFAULT_URL='https://nanpure-x-scheduler.puzzle-hub-4826.workers.dev'

def queue_token(api_secret,token_secret):
    return hashlib.sha256(('nanpure-x-queue-v1\0'+api_secret+'\0'+token_secret).encode()).hexdigest()

def future_slots(now,days=3):
    local=now.astimezone(ZoneInfo('Asia/Tokyo'))
    for offset in range(days):
        day=local.date()+timedelta(days=offset)
        for slot in SLOTS:
            due=datetime.fromisoformat(day.isoformat()+'T'+slot+':00').replace(tzinfo=ZoneInfo('Asia/Tokyo'))
            if due>local+timedelta(minutes=1):yield day.isoformat(),slot

class Queue:
    def __init__(self):
        self.url=os.environ.get('X_QUEUE_URL',DEFAULT_URL).rstrip('/')
        if self.url!=DEFAULT_URL:raise ValueError('Unexpected queue destination')
        self.token=queue_token(os.environ['X_API_SECRET'],os.environ['X_ACCESS_TOKEN_SECRET'])
    def api(self,path,body=None):
        request={'url':self.url+path,'authorization':'Bearer '+self.token,'body':body}
        process=subprocess.run(['node',str(Path(__file__).with_name('queue_http.mjs'))],input=json.dumps(request),text=True,capture_output=True,timeout=70)
        try:result=json.loads(process.stdout)
        except ValueError:raise RuntimeError('Queue transport failed') from None
        if process.returncode or not 200<=result['status']<300:
            # Never echo request headers or provider error bodies into public logs.
            raise RuntimeError('Queue API request failed: '+str(result.get('status',0))+' '+path)
        return result['data']

def prepare(q,repo,work,legacy,now,*,enabled=True,generate=None):
    q.api('/control',{'enabled':enabled,'history':legacy})
    state=q.api('/state')
    if not enabled:
        print('Cloudflare posting paused.');return state
    work.mkdir(parents=True,exist_ok=True)
    for day,slot in future_slots(now):
        key=publication_key(day,slot);existing=state['posts'].get(key)
        if existing and existing['status']!='assembling':continue
        root=work/key.replace(':','').replace('@','-');root.mkdir(parents=True,exist_ok=True)
        # An interrupted upload owns its fingerprints. Reuse its validated files
        # within a run, otherwise regenerate deterministically without its own reservation.
        history={**state,'posts':{k:p for k,p in state['posts'].items() if k!=key}}
        (root/'history.json').write_text(json.dumps(history))
        if generate:generate(root,day,slot)
        else:
            script=Path(__file__).resolve().parent
            for args in [('node',str(script/'generate.mjs'),str(root),day,slot),(sys.executable,str(script/'verify.py'),str(root)),(sys.executable,str(script/'render.py'),str(root)),(sys.executable,str(script/'package.py'),str(root))]:subprocess.run(args,check=True,cwd=repo)
        post=validate(root/'output')
        result=q.api('/prepare',post)
        if result['status']=='assembling':
            for index,item in enumerate(post['images']):
                raw=(root/'output'/item['file']).read_bytes()
                if len(raw)>1400000:raise ValueError('Question image exceeds the private queue storage limit')
                q.api('/image',{'key':key,'position':index,'media':base64.b64encode(raw).decode()})
            q.api('/ready',{'key':key})
        state=q.api('/state');print('Reserved '+key+'; status '+state['posts'][key]['status'])
    ready=[k for k,p in state['posts'].items() if p['status']=='ready']
    print('Cloudflare ready slots: '+', '.join(ready))
    return state

def main():
    q=Queue();repo=Path(os.environ['REPO_ROOT']).resolve();work=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'x-four-queue'
    ledger=Ledger() if os.environ.get('GITHUB_TOKEN') else None
    legacy=ledger.load() if ledger else json.loads((Path(__file__).parent/'previously-prepared.json').read_text())
    if os.environ.get('X_QUEUE_CHECK')=='true':
        account=q.api('/check',{});print('Cloudflare X connection verified for @'+account['username'])
    state=prepare(q,repo,work,legacy,datetime.now(ZoneInfo('Asia/Tokyo')),enabled=os.environ.get('X_FOUR_POST_ENABLED','true')=='true')
    ready=[k for k,p in state['posts'].items() if p['status']=='ready']
    if ready:
        q.api('/dry-run',{'key':ready[0]});print('Cloudflare publisher dry run passed; no X post was sent.')
    if ledger:ledger.write(state)
    for key,post in list(state['posts'].items())[-16:]:
        if post.get('post_id'):print('History '+key+' sent: https://x.com/parade166/status/'+post['post_id'])

if __name__=='__main__':main()
