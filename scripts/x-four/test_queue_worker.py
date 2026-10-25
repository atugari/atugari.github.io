from datetime import datetime,timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from zoneinfo import ZoneInfo
import hashlib,os,runpy,unittest
from post_schedule import is_current_slot
from queue_worker import future_slots,queue_token,prepare

class QueueTimingTests(unittest.TestCase):
    def test_three_day_buffer_has_only_future_japan_dates(self):
        now=datetime(2026,10,26,0,34,tzinfo=ZoneInfo('Asia/Tokyo'))
        slots=list(future_slots(now))
        self.assertEqual(len(slots),12)
        self.assertEqual(slots[0],('2026-10-26','08:00'))
        self.assertEqual(slots[-1],('2026-10-28','21:00'))
    def test_buffer_skips_started_slots(self):
        now=datetime(2026,10,26,12,1,tzinfo=ZoneInfo('Asia/Tokyo'))
        self.assertEqual(next(future_slots(now)),('2026-10-26','18:00'))
    def test_late_legacy_runner_stops_before_any_api_or_generation(self):
        class Fixed(datetime):
            @classmethod
            def now(cls,tz=None):return cls(2026,10,26,0,34,tzinfo=ZoneInfo('Asia/Tokyo'))
        with TemporaryDirectory() as tmp,patch('datetime.datetime',Fixed),patch.dict(os.environ,{'RUNNER_TEMP':tmp,'X_FOUR_MODE':'publish','X_FOUR_SCHEDULE':'0 21 * * *'}),patch('publish.Ledger') as ledger,patch('publish.XClient') as client,patch('subprocess.run') as generate:
            with self.assertRaises(SystemExit) as result:runpy.run_path(str(Path(__file__).with_name('run.py')))
            self.assertEqual(result.exception.code,0);ledger.assert_not_called();client.assert_not_called();generate.assert_not_called()
    def test_in_time_guard_and_exact_deadline(self):
        due=datetime(2026,10,26,8,tzinfo=ZoneInfo('Asia/Tokyo'))
        self.assertTrue(is_current_slot(due,'2026-10-26','08:00'))
        self.assertTrue(is_current_slot(due+timedelta(minutes=15),'2026-10-26','08:00'))
        self.assertFalse(is_current_slot(due+timedelta(minutes=15,microseconds=1),'2026-10-26','08:00'))
        self.assertFalse(is_current_slot(due,'2026-10-25','21:00'))
    def test_queue_auth_matches_the_worker_protocol(self):
        self.assertEqual(queue_token('test-secret','test-token-secret'),hashlib.sha256(b'nanpure-x-queue-v1\0test-secret\0test-token-secret').hexdigest())
    def test_paused_replenishment_does_not_generate_or_contact_x(self):
        class Queue:
            def __init__(self):self.calls=[]
            def api(self,path,body=None):
                self.calls.append((path,body));return {'posts':{}}
        q=Queue()
        with TemporaryDirectory() as tmp:
            prepare(q,Path(tmp),Path(tmp),{'posts':{}},datetime(2026,10,26,tzinfo=ZoneInfo('Asia/Tokyo')),enabled=False,generate=lambda *args:self.fail('must not generate'))
        self.assertEqual([p for p,b in q.calls],['/control','/state'])
        self.assertFalse(q.calls[0][1]['enabled'])

if __name__=='__main__':unittest.main()
