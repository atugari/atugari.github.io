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
            expected=template.replace('{date_label}',f'{parsed.month}/{parsed.day}').replace('シルプレ・数独・和同開珎・クロスワード。','・'.join(item['title'] for item in daily_plan(day))+'。')
            with self.subTest(day=day):self.assertEqual(render_text(day),expected)

    def test_invalid_calendar_dates_are_rejected(self):
        for day in ('2026-02-29','2026-11-31','2026-13-01'):
            with self.subTest(day=day),self.assertRaises(ValueError):render_text(day)

if __name__=='__main__':unittest.main()
