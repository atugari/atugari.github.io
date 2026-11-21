import sqlite3
import unittest
from pathlib import Path


class PromoSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        schema = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
        self.db.executescript(schema)

    def tearDown(self):
        self.db.close()

    def test_queue_is_disabled_by_default(self):
        enabled = self.db.execute(
            "SELECT enabled FROM promo_settings WHERE id=1"
        ).fetchone()[0]
        self.assertEqual(enabled, 0)

    def test_supported_locale_and_media_can_be_queued(self):
        self.db.execute(
            """INSERT INTO promo_posts (
                id, locale, copy_variant, puzzle_focus, text, scheduled_at,
                media_key, media_type, media_sha256, media_bytes, status,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "post-1", "ja", 0, "sudoku", "パレあそび https://atugari.github.io/plaza.html",
                1794650400, "posts/post-1.mp4", "video/mp4", "a" * 64, 123456,
                "queued", 1794640000, 1794640000,
            ),
        )
        row = self.db.execute(
            "SELECT locale, media_type, status FROM promo_posts WHERE id='post-1'"
        ).fetchone()
        self.assertEqual(row, ("ja", "video/mp4", "queued"))

    def test_duplicate_schedule_is_rejected(self):
        values = (
            "post-1", "en", 0, "general", "text", 1794650400,
            "posts/post-1.png", "image/png", "b" * 64, 1024,
            "queued", 1794640000, 1794640000,
        )
        sql = """INSERT INTO promo_posts (
            id, locale, copy_variant, puzzle_focus, text, scheduled_at,
            media_key, media_type, media_sha256, media_bytes, status,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
        self.db.execute(sql, values)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(sql, ("post-2",) + values[1:])

    def test_existing_puzzle_queue_tables_are_not_created_or_touched(self):
        names = {
            row[0] for row in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        self.assertIn("promo_posts", names)
        self.assertNotIn("x_four_posts", names)
        self.assertNotIn("x_four_fingerprints", names)


if __name__ == "__main__":
    unittest.main()
