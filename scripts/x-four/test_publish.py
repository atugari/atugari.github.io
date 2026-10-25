import copy,hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from publish import oauth_header,publish,validate
from post_text import render_text,weighted_length
from post_schedule import SLOTS

class Ledger:
    def __init__(self,events,state=None):self.events=events;self.state=state or {'version':1,'posts':{}}
    def load(self):return copy.deepcopy(self.state)
    def write(self,state):self.state=copy.deepcopy(state);self.events.append('claim' if list(state['posts'].values())[-1]['status']=='posting' else 'sent')

class Client:
    def __init__(self,events,username='parade166',fail=False):self.events=events;self.name=username;self.fail=fail
    def username(self):self.events.append('account');return self.name
    def upload(self,path,alt):self.events.append('upload');return str(len(self.events))
    def create(self,text,ids):
        self.text=text
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
    def test_four_slots_each_publish_once_without_a_daily_lockout(self):
        events=[];ledger=Ledger(events);client=Client(events)
        for index,slot in enumerate(SLOTS):
            self.data.update(slot=slot,publication_id=self.data['date']+'@'+slot,fingerprints=[str(index)+':'+str(i) for i in range(4)])
            self.save();publish(self.root,ledger,client,'parade166')
        self.assertEqual(len(ledger.state['posts']),4)
        self.assertEqual(events.count('post'),4)
        self.assertEqual(events.count('upload'),16)
        with self.assertRaisesRegex(RuntimeError,'slot'):publish(self.root,ledger,client,'parade166')
        self.assertEqual(events.count('post'),4)
    def test_legacy_day_record_still_blocks_a_slotted_retry(self):
        self.data.update(slot='08:00',publication_id=self.data['date']+'@08:00');self.save()
        events=[];ledger=Ledger(events,{'posts':{self.data['date']:{'status':'sent','fingerprints':[]}}})
        with self.assertRaisesRegex(RuntimeError,'date'):publish(self.root,ledger,Client(events),'parade166')
        self.assertEqual(events,[])
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
    def test_approved_long_post_is_sent_in_full_with_four_images(self):
        self.data['text']=render_text(self.data['date'])
        self.data['requires_longform']=True;self.save()
        self.assertGreater(weighted_length(self.data['text']),280)
        events=[];client=Client(events)
        self.assertEqual(publish(self.root,Ledger(events),client,'parade166'),'123456')
        self.assertEqual(client.text,self.data['text'])
        self.assertEqual(events.count('post'),1)
        self.assertEqual(events.count('upload'),4)
    def test_unapproved_long_text_cannot_bypass_the_length_guard(self):
        self.data['text']='変更された文章。'*100
        self.data['requires_longform']=True;self.save()
        with self.assertRaisesRegex(ValueError,'approved copy'):validate(self.root)
    def test_long_post_requires_explicit_manifest_flag(self):
        self.data['text']=render_text(self.data['date']);self.save()
        with self.assertRaisesRegex(ValueError,'long-form is required'):validate(self.root)
    def test_oauth_reference_signature(self):
        # OAuth 1.0 reference request: independently published signature vector.
        from urllib.parse import unquote
        header=oauth_header('GET','http://photos.example.net/photos?file=vacation.jpg&size=original','dpf43f3p2l4k3l03','kd94hf93k423kf44','nnch734d00sl2jdk','pfkkdhi9sl3r4s00',nonce='kllo9940pd9333jh',timestamp=1191242096)
        signature=unquote(header.split('oauth_signature="')[1].split('"')[0])
        self.assertEqual(signature,'tR3+Ty81lMeYAr/Fid0kMTYa/WM=')

if __name__=='__main__':unittest.main()
