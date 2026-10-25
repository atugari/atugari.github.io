"""Send exactly four verified PNGs. Secrets are read from the environment only."""
import base64,hashlib,hmac,json,os,secrets,time
from pathlib import Path
from urllib.parse import quote,urlsplit,parse_qsl
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
from PIL import Image
from post_text import render_text,weighted_length
from post_schedule import publication_key
from daily_plan import daily_plan

def encoded(value):return quote(str(value),safe='~-._')

def oauth_header(method,url,key,secret,token,token_secret,nonce=None,timestamp=None):
    oauth={'oauth_consumer_key':key,'oauth_nonce':nonce or secrets.token_hex(16),'oauth_signature_method':'HMAC-SHA1','oauth_timestamp':str(timestamp or int(time.time())),'oauth_token':token,'oauth_version':'1.0'}
    u=urlsplit(url);params=list(parse_qsl(u.query,keep_blank_values=True))+list(oauth.items())
    normalized='&'.join(k+'='+v for k,v in sorted((encoded(k),encoded(v)) for k,v in params))
    canonical=u.scheme+'://'+u.netloc+u.path
    signature='&'.join([method.upper(),encoded(canonical),encoded(normalized)])
    signing_key=encoded(secret)+'&'+encoded(token_secret)
    oauth['oauth_signature']=base64.b64encode(hmac.new(signing_key.encode(),signature.encode(),hashlib.sha1).digest()).decode()
    return 'OAuth '+', '.join(encoded(k)+'="'+encoded(v)+'"' for k,v in sorted(oauth.items()))

def http(method,url,headers,body=None):
    request=Request(url,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
    try:
        with urlopen(request,timeout=60) as response:
            raw=response.read()
            return json.loads(raw) if raw else {}
    except HTTPError as e:
        # Do not echo response bodies, headers or credentials into public CI logs.
        raise RuntimeError('API request failed: '+str(e.code)+' '+urlsplit(url).path) from None
    except (URLError,TimeoutError):
        raise RuntimeError('API connection failed; the request is not automatically retried') from None

class XClient:
    def __init__(self):
        names=['X_API_KEY','X_API_SECRET','X_ACCESS_TOKEN','X_ACCESS_TOKEN_SECRET']
        if any(not os.environ.get(n) for n in names):raise RuntimeError('X connection is not configured. Add the four X repository secrets first.')
        self.credentials=[os.environ[n] for n in names]
    def request(self,method,route,body=None):
        url='https://api.x.com'+route
        headers={'Authorization':oauth_header(method,url,*self.credentials),'Content-Type':'application/json'}
        result=http(method,url,headers,body)
        if result.get('errors'):raise RuntimeError('X reported an error; publication was stopped')
        return result
    def username(self):return self.request('GET','/2/users/me')['data']['username']
    def upload(self,path,alt):
        result=self.request('POST','/2/media/upload',{'media':base64.b64encode(path.read_bytes()).decode(),'media_category':'tweet_image'})
        media_id=str(result['data']['id'])
        info=result['data'].get('processing_info')
        for _ in range(10):
            if not info or info.get('state')=='succeeded':break
            if info.get('state')=='failed':raise RuntimeError('Image processing failed')
            time.sleep(min(10,max(1,int(info.get('check_after_secs',1)))))
            result=self.request('GET','/2/media/upload?media_id='+encoded(media_id)+'&command=STATUS')
            info=result['data'].get('processing_info')
        else:raise RuntimeError('Image processing did not finish')
        self.request('POST','/2/media/metadata',{'id':media_id,'metadata':{'alt_text':{'text':alt}}})
        return media_id
    def create(self,text,ids):return str(self.request('POST','/2/tweets',{'text':text,'media':{'media_ids':ids}})['data']['id'])

class Ledger:
    branch='x-four-history'
    filename='x-four-history.json'
    def __init__(self):
        self.repo=os.environ['GITHUB_REPOSITORY'];self.token=os.environ['GITHUB_TOKEN'];self.sha=None
        self.headers={'Authorization':'Bearer '+self.token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}
    def api(self,method,route,body=None):return http(method,'https://api.github.com/repos/'+self.repo+route,self.headers,body)
    def load(self):
        # A missing branch is the expected initial state. Other failures must stop.
        try:
            item=self.api('GET','/contents/'+self.filename+'?ref='+self.branch)
        except RuntimeError as e:
            if '404 ' not in str(e):raise
            self.sha=None;return json.loads((Path(__file__).parent/'previously-prepared.json').read_text())
        self.sha=item['sha'];return json.loads(base64.b64decode(item['content']))
    def write(self,state):
        data=json.dumps(state,ensure_ascii=False,indent=2).encode()
        if len(data)>900000:raise RuntimeError('History is approaching the storage limit; retain it and review before continuing')
        if self.sha is None:
            try:self.api('POST','/git/refs',{'ref':'refs/heads/'+self.branch,'sha':os.environ['GITHUB_SHA']})
            except RuntimeError as e:
                if '422 ' not in str(e):raise
        body={'message':'Record daily puzzle post state','branch':self.branch,'content':base64.b64encode(data).decode()}
        if self.sha:body['sha']=self.sha
        item=self.api('PUT','/contents/'+self.filename,body);self.sha=item['content']['sha']

def validate(directory):
    directory=Path(directory);post=json.loads((directory/'post.json').read_text())
    key=publication_key(post['date'],post.get('slot'))
    if 'publication_id' in post and post['publication_id']!=key:raise ValueError('Publication ID does not match the date and slot')
    expected=['01-shirupure.png','02-sudoku.png','03-wado.png','04-crossword.png']
    if 'questions' in post:
        if post.get('plan_version')!=1 or post['questions']!=daily_plan(post['date']):raise ValueError('Question rules and difficulty do not match the daily plan')
        expected=[item['file'] for item in post['questions']]
    if [i['file'] for i in post['images']]!=expected:raise ValueError('Exactly four question images are required in the approved order')
    if len(post['fingerprints'])!=4 or len(set(post['fingerprints']))!=4:raise ValueError('Four distinct puzzle fingerprints are required')
    if not post['text'] or len(post['text'])>25000:raise ValueError('Invalid post text')
    weighted=weighted_length(post['text'])
    if weighted>25000:raise ValueError('Post exceeds the long-form X text length')
    if weighted>280:
        if post.get('requires_longform') is not True:raise ValueError('Post exceeds the standard X text length; long-form is required')
        if post['text'] not in (render_text(post['date']),render_text(post['date'],True)):
            raise ValueError('Long-form text does not match the approved copy')
    for item in post['images']:
        p=directory/item['file']
        if not 0<p.stat().st_size<5*1024*1024 or not 0<len(item['alt'])<=1000:raise ValueError('Invalid image or ALT')
        with Image.open(p) as image:
            if image.format!='PNG' or image.size!=(2048,2048):raise ValueError('Invalid image dimensions')
        if hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Image changed after validation')
    return post

def publish(directory,ledger,client,expected_username):
    post=validate(directory);state=ledger.load();posts=state.setdefault('posts',{});day=post['date']
    key=publication_key(day,post.get('slot'))
    if key in posts or day in posts:raise RuntimeError('This date or slot already has a sent or uncertain attempt. Review it; it will not be reposted automatically.')
    old={h for p in posts.values() for h in p.get('fingerprints',[])}
    if any(h in old for h in post['fingerprints']):raise RuntimeError('A previously used puzzle was found')
    if client.username().lower()!=expected_username.lower():raise RuntimeError('Connected X account does not match the intended account')
    posts[key]={'date':day,'status':'posting','fingerprints':post['fingerprints']}
    if post.get('slot') is not None:posts[key]['slot']=post['slot']
    ledger.write(state)  # A durable claim precedes every upload or post request.
    ids=[client.upload(Path(directory)/item['file'],item['alt']) for item in post['images']]
    post_id=client.create(post['text'],ids)
    posts[key].update(status='sent',post_id=post_id)
    ledger.write(state)
    return post_id
