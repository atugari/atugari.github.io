from datetime import date, timedelta
from pathlib import Path
import unittest
from daily_plan import daily_plan
from post_text import render_text, weighted_length, SLOT_COPY

class PostDateTests(unittest.TestCase):
    def test_full_leap_and_nonleap_years_have_canonical_month_day_headers(self):
        for year in (2024, 2026):
            day = date(year, 1, 1)
            while day.year == year:
                with self.subTest(day=day):
                    for slot in SLOT_COPY:
                        self.assertEqual(render_text(day.isoformat(), slot).splitlines()[0], f'【今日の4問｜{day.month}/{day.day}】')
                day += timedelta(days=1)

    def test_all_four_slots_cover_distinct_search_phrases_and_hashtags(self):
        day = '2026-11-06'
        posts = [render_text(day, slot) for slot in SLOT_COPY]
        self.assertEqual(len(set(posts)), 4)
        combined = ''.join(posts)
        for phrase in ('ナンプレ', '数独', '無料パズル', '脳トレ', '問題集', '頭の体操', '毎日更新'):
            self.assertIn(phrase, combined)
        for slot, (_, tags) in SLOT_COPY.items():
            self.assertIn(tags, render_text(day, slot))

    def test_no_url_is_included_in_any_slot(self):
        for slot in SLOT_COPY:
            text = render_text('2026-11-06', slot)
            self.assertNotIn('http://', text)
            self.assertNotIn('https://', text)

    def test_every_day_and_slot_fits_standard_x_post_limit(self):
        start = date(2026, 1, 1)
        for offset in range(365):
            day = start + timedelta(days=offset)
            for slot in SLOT_COPY:
                text = render_text(day.isoformat(), slot)
                with self.subTest(day=day, slot=slot):
                    self.assertLessEqual(weighted_length(text), 280)

    def test_no_url_mode_is_supported(self):
        text = render_text('2026-11-06', '08:00')
        self.assertNotIn('https://atugari.github.io/nanpure/', text)

    def test_invalid_slots_and_dates_are_rejected(self):
        with self.assertRaises(ValueError):
            render_text('2026-11-06', '15:00')
        for day in ('2026-02-29', '2026-11-31', '2026-13-01'):
            with self.subTest(day=day), self.assertRaises(ValueError):
                render_text(day)

if __name__ == '__main__':
    unittest.main()
