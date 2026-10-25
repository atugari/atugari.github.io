from datetime import datetime,timedelta
import unittest
from zoneinfo import ZoneInfo
from daily_plan import daily_plan,RULES,LABELS
from post_schedule import SLOTS,publication_key,resolve_slot,is_current_slot

class ScheduleTests(unittest.TestCase):
    def test_delayed_schedule_keeps_its_intended_slot(self):
        now=datetime(2026,10,25,12,20,tzinfo=ZoneInfo('Asia/Tokyo'))
        self.assertEqual(resolve_slot(now,schedule='0 8 * * *'),('2026-10-25','08:00'))
    def test_late_night_run_belongs_to_the_previous_japan_day(self):
        now=datetime(2026,10,26,0,12,tzinfo=ZoneInfo('Asia/Tokyo'))
        self.assertEqual(resolve_slot(now,schedule='0 21 * * *'),('2026-10-25','21:00'))
    def test_overdue_and_next_day_slots_are_not_publishable(self):
        due=datetime(2026,10,25,21,tzinfo=ZoneInfo('Asia/Tokyo'))
        self.assertTrue(is_current_slot(due,'2026-10-25','21:00'))
        self.assertTrue(is_current_slot(due+timedelta(minutes=15),'2026-10-25','21:00'))
        self.assertFalse(is_current_slot(due+timedelta(minutes=15,seconds=1),'2026-10-25','21:00'))
        self.assertFalse(is_current_slot(datetime(2026,10,26,0,34,tzinfo=ZoneInfo('Asia/Tokyo')),'2026-10-25','21:00'))
    def test_deadline_uses_japan_time_for_utc_clocks(self):
        now=datetime(2026,10,25,23,2,tzinfo=ZoneInfo('UTC'))
        self.assertTrue(is_current_slot(now,'2026-10-26','08:00'))
        self.assertFalse(is_current_slot(now,'2026-10-25','21:00'))
    def test_four_slots_have_distinct_publication_ids(self):
        self.assertEqual(len({publication_key('2026-10-25',slot) for slot in SLOTS}),4)
        with self.assertRaises(ValueError):publication_key('2026-10-25','09:00')
    def test_daily_plan_is_stable_and_varies_rules_and_real_levels(self):
        self.assertEqual(LABELS,('簡単','普通','難しい','とても難しい'))
        day=datetime(2026,10,25);seen_rules=set();seen_plans=set();levels={}
        for offset in range(60):
            date=(day+timedelta(days=offset)).date().isoformat();plan=daily_plan(date)
            self.assertEqual(plan,daily_plan(date));self.assertEqual(len({q['rule'] for q in plan}),4)
            self.assertLessEqual(sum(q['family']=='sudoku' for q in plan),2)
            for item in plan:
                self.assertIn(item['level'],sum(RULES[item['rule']]['levels'],[]))
                self.assertIn(item['difficulty'],LABELS)
                seen_rules.add(item['rule']);levels.setdefault(item['rule'],set()).add(item['level'])
            seen_plans.add(tuple(q['rule'] for q in plan))
        self.assertEqual(seen_rules,set(RULES));self.assertGreater(len(seen_plans),10)
        self.assertTrue(all(len(values)>1 for values in levels.values()))

if __name__=='__main__':unittest.main()
