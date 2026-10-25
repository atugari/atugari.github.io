import copy,hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from publish import oauth_header,publish,validate

class Ledger:
    def __init__(self,events,state=None):self.events=events;self.state=state or {'version':1,'posts':{}}
    def load(self):return copy.deepcopy(self.state)
    def write(self,state):self.state=copy.deepcopy(state);self.events.append('claim' if list(state['posts'].values())[-1]['status']=='posting' else 'sent')

class Client:
    def __init__(self,events,username='parade166',fail=False):self.events=events;self.name=username;self.fail=fail
    def username(self):self.events.append('account');return self.name
    def upload(self,path,alt):self.events.append('upload');return str(len(self.events))
    def create(self,text,ids):
        self.events.append('post');assert len(ids)==4
        if self.fail:raise TimeoutError('uncertain delivery')
        return '123456'

class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        names=['01-shirupure.png','02-sudoku.png','03-wado.png','04-crossword.png']
        images=[]
        for name in names:
            path=self.root/name;Image.new('RGB',(2048,2048),'white').save(path)
            images.append({'file':name,'alt':'ルールと盤面の説明','sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        self.data={'date':'2026-10-26','text':'【今日の問題】\n4問に挑戦！','fingerprints':['a','b','c','d'],'images':images}
        self.save()
    def tearDown(self):self.tmp.cleanup()
    def save(self):(self.root/'post.json').write_text(json.dumps(self.data))
    def test_four_uploads_and_durable_claim_before_post(self):
        events=[];ledger=Ledger(events)
        self.assertEqual(publish(self.root,ledger,Client(events),'parade166'),'123456')
        self.assertEqual(events,['account','claim','upload','upload','upload','upload','post','sent'])
    def test_wrong_account_never_uploads(self):
        events=[]
        with self.assertRaisesRegex(RuntimeError,'account'):publish(self.root,Ledger(events),Client(events,'other'),'parade166')
        self.assertEqual(events,['account'])
    def test_already_sent_day_never_requests_x(self):
        events=[]
        with self.assertRaisesRegex(RuntimeError,'date'):publish(self.root,Ledger(events,{'posts':{'2026-10-26':{'status':'sent'}}}),Client(events),'parade166')
        self.assertEqual(events,[])
    def test_prior_question_is_rejected(self):
        events=[];state={'posts':{'2026-10-24':{'fingerprints':['a']}}}
        with self.assertRaisesRegex(RuntimeError,'previously'):publish(self.root,Ledger(events,state),Client(events),'parade166')
        self.assertEqual(events,[])
    def test_unknown_result_blocks_automatic_retry(self):
        events=[];ledger=Ledger(events)
        with self.assertRaises(TimeoutError):publish(self.root,ledger,Client(events,fail=True),'parade166')
        self.assertEqual(ledger.state['posts']['2026-10-26']['status'],'posting')
        with self.assertRaisesRegex(RuntimeError,'date'):publish(self.root,ledger,Client(events),'parade166')
        self.assertEqual(events.count('post'),1)
    def test_changed_image_is_rejected(self):
        (self.root/self.data['images'][0]['file']).write_bytes(b'broken')
        with self.assertRaises(Exception):validate(self.root)
    def test_answer_file_cannot_replace_question(self):
        self.data['images'][0]['file']='answers-private.png';self.save()
        with self.assertRaisesRegex(ValueError,'four'):validate(self.root)
    def test_missing_alt_rejected(self):
        self.data['images'][1]['alt']='';self.save()
        with self.assertRaises(ValueError):validate(self.root)
    def test_oauth_reference_signature(self):
        # OAuth 1.0 reference request: independently published signature vector.
        from urllib.parse import unquote
        header=oauth_header('GET','http://photos.example.net/photos?file=vacation.jpg&size=original','dpf43f3p2l4k3l03','kd94hf93k423kf44','nnch734d00sl2jdk','pfkkdhi9sl3r4s00',nonce='kllo9940pd9333jh',timestamp=1191242096)
        signature=unquote(header.split('oauth_signature="')[1].split('"')[0])
        self.assertEqual(signature,'tR3+Ty81lMeYAr/Fid0kMTYa/WM=')

if __name__=='__main__':unittest.main()
