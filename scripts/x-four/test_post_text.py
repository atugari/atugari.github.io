from datetime import date, timedelta
from pathlib import Path
import unittest

from post_text import render_text


class PostDateTests(unittest.TestCase):
    def test_every_calendar_date_uses_the_workers_unpadded_label(self):
        # Include leap day and both single- and double-digit months/days.
        day = date(2028, 1, 1)
        while day.year == 2028:
            with self.subTest(day=day):
                self.assertEqual(
                    render_text(day.isoformat()).splitlines()[0],
                    f'【今日の4問｜{day.month}/{day.day}】',
                )
            day += timedelta(days=1)

    def test_date_fix_preserves_approved_body_and_optional_url(self):
        template = (Path(__file__).parent / 'approved-post.txt').read_text(encoding='utf-8').rstrip('\n')
        # Only the first two lines contain date/daily-plan substitutions.
        expected_body = template.split('\n', 2)[2]
        for day in ('2026-10-31', '2026-11-01', '2027-01-01', '2028-02-29'):
            with self.subTest(day=day):
                text = render_text(day)
                self.assertEqual(text.split('\n', 2)[2], expected_body)
                guide = 'サイトへは画像に載せたURLかQRコードからどうぞ！'
                self.assertEqual(render_text(day, True), text.replace(guide, guide + '\nhttps://atugari.github.io/nanpure/'))


if __name__ == '__main__':
    unittest.main()
