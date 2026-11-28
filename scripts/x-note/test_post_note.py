import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import post_note as pn

JST = timezone(timedelta(hours=9))
HERE = os.path.dirname(os.path.abspath(__file__))

EXPECTED_TEXTS = {
    "n75fb9f6e4343": "顔出しなしで授業や研修や商品説明の動画を作る方法をnoteに書きました。声の選び方と台本の型と台本見本入りで500円です\nhttps://note.com/jolly_crocus986/n/n75fb9f6e4343",
    "nf394410092b4": "コードが書けなくてもAIに頼んで仕事の小さな道具を作る方法をnoteに書きました。在庫表や予定表を自分で作れるようになる記事です\nhttps://note.com/jolly_crocus986/n/nf394410092b4",
}
EXPECTED_TIMES = {
    "n75fb9f6e4343": "2026-11-29T12:00:00+09:00",
    "nf394410092b4": "2026-11-30T12:00:00+09:00",
}


def entry(**kw):
    e = {
        "note_id": "nabcd12345678",
        "title": "t",
        "x_time_jst": "2026-12-01T12:00:00+09:00",
        "text": "テスト\nhttps://note.com/jolly_crocus986/n/nabcd12345678",
    }
    e.update(kw)
    return e


def queue_of(*entries):
    return {"account": "parade166", "entries": list(entries)}


class ValidateTests(unittest.TestCase):
    def test_real_queue_is_valid_and_exact(self):
        with open(os.path.join(HERE, "queue.json"), encoding="utf-8") as f:
            queue = json.load(f)
        out = pn.validate_queue(queue, {"posted": []})
        self.assertEqual(out["entries"], 2)
        for e in queue["entries"]:
            self.assertEqual(e["text"], EXPECTED_TEXTS[e["note_id"]])
            self.assertEqual(e["x_time_jst"], EXPECTED_TIMES[e["note_id"]])

    def test_duplicate_id_rejected(self):
        q = queue_of(entry(), entry(x_time_jst="2026-12-02T12:00:00+09:00"))
        with self.assertRaises(ValueError):
            pn.validate_queue(q, {"posted": []})

    def test_same_time_rejected(self):
        q = queue_of(entry(), entry(note_id="nzzzz12345678",
                                    text="x\nhttps://note.com/jolly_crocus986/n/nzzzz12345678"))
        with self.assertRaises(ValueError):
            pn.validate_queue(q, {"posted": []})

    def test_link_must_be_at_end(self):
        q = queue_of(entry(text="https://note.com/jolly_crocus986/n/nabcd12345678\nテスト"))
        with self.assertRaises(ValueError):
            pn.validate_queue(q, {"posted": []})

    def test_wrong_account_rejected(self):
        q = queue_of(entry())
        q["account"] = "someoneelse"
        with self.assertRaises(ValueError):
            pn.validate_queue(q, {"posted": []})


class DueTests(unittest.TestCase):
    def test_due_window_and_history_guard(self):
        q = queue_of(entry())
        now = datetime(2026, 12, 1, 12, 10, tzinfo=JST)
        self.assertEqual(len(pn.due_entries(q, {"posted": []}, now)), 1)
        hist = {"posted": [{"note_id": "nabcd12345678"}]}
        self.assertEqual(pn.due_entries(q, hist, now), [])
        hist = {"uncertain": [{"note_id": "nabcd12345678"}]}
        self.assertEqual(pn.due_entries(q, hist, now), [])

    def test_not_due_outside_window(self):
        q = queue_of(entry())
        now = datetime(2026, 12, 1, 12, 35, tzinfo=JST)
        self.assertEqual(pn.due_entries(q, {"posted": []}, now), [])
        now = datetime(2026, 12, 1, 11, 59, tzinfo=JST)
        self.assertEqual(pn.due_entries(q, {"posted": []}, now), [])


if __name__ == "__main__":
    unittest.main()
