from datetime import date, timedelta
from pathlib import Path
import unittest
from daily_plan import daily_plan
from post_text import render_text

class PostDateTests(unittest.TestCase):
    def test_full_leap_and_nonleap_years_have_canonical_month_day_headers(self):
        for year in (2024,2026):
            day=date(year,1,1)
            while day.year==year:
                with self.subTest(day=day):
                    self.assertTrue(render_text(day.isoformat()).startswith(f'【今日の4問｜{day.month}/{day.day}】\n'))
                day+=timedelta(days=1)

    def test_month_and_year_boundaries_keep_approved_copy_unchanged(self):
        template=Path(__file__).with_name('approved-post.txt').read_text(encoding='utf-8').rstrip('\n')
        for day in ('2026-10-31','2026-11-01','2026-11-02','2026-12-31','2027-01-01','2024-02-29'):
            parsed=date.fromisoformat(day)
            expected=template.replace('{date_label}',f'{parsed.month}/{parsed.day}').replace('{slot_message}','朝の頭の体操に、まずは1問！').replace('シルプレ・数独・和同開珎・クロスワード。','・'.join(item['title'] for item in daily_plan(day))+'。')
            with self.subTest(day=day):self.assertEqual(render_text(day),expected)

    def test_url_is_included_in_the_approved_link_post(self):
        text=render_text('2026-11-06',True)
        self.assertIn('https://atugari.github.io/nanpure/',text)
        self.assertEqual(text.count('https://atugari.github.io/nanpure/'),1)

    def test_each_daily_slot_has_distinct_hook_and_standard_length(self):
        from post_text import weighted_length
        messages=[render_text('2026-11-06',True,slot) for slot in ('08:00','12:00','18:00','21:00')]
        self.assertEqual(len(set(messages)),4)
        self.assertTrue(all('https://atugari.github.io/nanpure/' in message for message in messages))
        self.assertTrue(all(weighted_length(message)<=280 for message in messages))

    def test_invalid_slots_are_rejected(self):
        with self.assertRaises(ValueError):render_text('2026-11-06',True,'15:00')

    def test_invalid_calendar_dates_are_rejected(self):
        for day in ('2026-02-29','2026-11-31','2026-13-01'):
            with self.subTest(day=day),self.assertRaises(ValueError):render_text(day)

if __name__=='__main__':unittest.main()
