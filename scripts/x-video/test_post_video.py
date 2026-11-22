import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import post_video as pv

JST = timezone(timedelta(hours=9))
HERE = os.path.dirname(os.path.abspath(__file__))


def entry(**kw):
    e = {
        "youtube_id": "abc123XYZ09",
        "kind": "short",
        "title": "t",
        "youtube_publish_jst": "2026-11-23T19:00:00+09:00",
        "x_time_jst": "2026-11-23T19:30:00+09:00",
        "text": "テスト https://youtube.com/shorts/abc123XYZ09",
    }
    e.update(kw)
    return e


class ValidateTests(unittest.TestCase):
    def test_real_queue_is_valid(self):
        with open(os.path.join(HERE, "queue.json"), encoding="utf-8") as f:
            queue = json.load(f)
        out = pv.validate_queue(queue, {"posted": []})
        self.assertEqual(out["entries"], 7)

    def test_puzzle_slot_rejected(self):
        q = {"entries": [entry(x_time_jst="2026-11-23T21:00:00+09:00")]}
        with self.assertRaises(ValueError):
            pv.validate_queue(q, {"posted": []})

    def test_duplicate_id_rejected(self):
        q = {"entries": [entry(), entry(x_time_jst="2026-11-24T19:30:00+09:00",
                                        youtube_publish_jst="2026-11-24T19:00:00+09:00")]}
        with self.assertRaises(ValueError):
            pv.validate_queue(q, {"posted": []})

    def test_same_time_rejected(self):
        q = {"entries": [entry(), entry(youtube_id="zzz999ZZZ88",
                                        text="x https://youtu.be/zzz999ZZZ88")]}
        with self.assertRaises(ValueError):
            pv.validate_queue(q, {"posted": []})

    def test_backlog_id_clash_rejected(self):
        q = {"entries": [entry()],
             "backlog": [{"youtube_id": "abc123XYZ09", "text": "x abc123XYZ09"}]}
        with self.assertRaises(ValueError):
            pv.validate_queue(q, {"posted": []})

    def test_find_postable_searches_backlog(self):
        q = {"entries": [entry()],
             "backlog": [{"youtube_id": "bk111111111", "text": "x bk111111111"}]}
        self.assertIsNotNone(pv.find_postable(q, "bk111111111"))
        self.assertIsNone(pv.find_postable(q, "nope"))

    def test_before_youtube_publish_rejected(self):
        q = {"entries": [entry(x_time_jst="2026-11-23T19:30:00+09:00",
                               youtube_publish_jst="2026-11-23T20:00:00+09:00")]}
        with self.assertRaises(ValueError):
            pv.validate_queue(q, {"posted": []})


class MediaResponseTests(unittest.TestCase):
    def test_media_id_shapes(self):
        self.assertEqual(pv._media_id_of({"media_id_string": "42"}), "42")
        self.assertEqual(pv._media_id_of({"media_id": 43}), "43")
        self.assertEqual(pv._media_id_of({"data": {"id": "44"}}), "44")
        with self.assertRaises(RuntimeError):
            pv._media_id_of({"data": {}})

    def test_processing_info_shapes(self):
        self.assertEqual(pv._processing_info_of({"processing_info": {"state": "pending"}}),
                         {"state": "pending"})
        self.assertEqual(pv._processing_info_of({"data": {"processing_info": {"state": "succeeded"}}}),
                         {"state": "succeeded"})
        self.assertEqual(pv._processing_info_of({}), {})


class DueTests(unittest.TestCase):
    def test_due_window_and_history_guard(self):
        q = {"entries": [entry()]}
        now = datetime(2026, 11, 23, 19, 35, tzinfo=JST)
        self.assertEqual(len(pv.due_entries(q, {"posted": []}, now)), 1)
        hist = {"posted": [{"youtube_id": "abc123XYZ09"}]}
        self.assertEqual(pv.due_entries(q, hist, now), [])

    def test_not_due_outside_window(self):
        q = {"entries": [entry()]}
        now = datetime(2026, 11, 23, 20, 5, tzinfo=JST)
        self.assertEqual(pv.due_entries(q, {"posted": []}, now), [])


if __name__ == "__main__":
    unittest.main()
