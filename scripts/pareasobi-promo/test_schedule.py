import unittest
from datetime import datetime

from schedule import LANGUAGES, POSTS_PER_DAY, plan_day, validate_plan


class PromotionScheduleTests(unittest.TestCase):
    def test_three_posts_each_day_and_no_collision(self):
        for day in ("2026-11-14", "2026-12-31", "2027-03-28", "2027-10-31"):
            plan = plan_day(day)
            self.assertEqual(len(plan), POSTS_PER_DAY)
            validate_plan(plan)

    def test_twenty_languages_rotate_without_skipping(self):
        seen = []
        for day_index in range(7):
            day = f"2026-11-{14 + day_index:02d}"
            seen.extend(item["language"] for item in plan_day(day, sequence_start=day_index * 3))
        # The planner returns chronological order, not rotation order.
        self.assertEqual(len(seen), 21)
        chronological = sorted(
            (item["sequence"], item["language"])
            for day_index in range(7)
            for item in plan_day(
                f"2026-11-{14 + day_index:02d}",
                sequence_start=day_index * 3,
            )
        )
        self.assertEqual([language for _, language in chronological[:20]], list(LANGUAGES))

    def test_all_local_times_are_audience_evening(self):
        plan = plan_day("2026-11-14", sequence_start=12)
        for item in plan:
            local = datetime.fromisoformat(item["scheduled_at_local"])
            self.assertIn(local.hour, (16, 17, 18, 19, 20))
            self.assertIsNotNone(local.utcoffset())

    def test_rejects_invalid_date(self):
        with self.assertRaises(ValueError):
            plan_day("not-a-date")


if __name__ == "__main__":
    unittest.main()
