# Pareasobi X promotion — isolated scheduling core

This directory is the first isolated component for the new promotional stream.
It is intentionally separate from `scripts/x-four/` and
`nanpure-x-worker/`.

## Confirmed operating rules

- Exactly 3 promotional posts per Japan calendar day.
- Existing "今日の4問" remains 4 posts/day and is not modified.
- Combined planned total: 7 posts/day.
- Promotional languages rotate across the 20 locales currently present in
  `nanpure/`: ja, en, zh-hans, zh-hant, ko, es, fr, de, pt, it, nl, sv, pl,
  cs, ru, id, vi, th, hi, ar.
- Each language is assigned a representative audience time zone. Posts are
  scheduled between 16:00 and 20:00 in that zone, with at least 90 minutes
  between UTC publication times.
- The scheduler is planning-only: it cannot publish to X.

## Important limitations before activation

The time zones are representative defaults, not a complete regional strategy.
English, Spanish, Portuguese, Chinese, and Arabic audiences span multiple
time zones. The next content layer must support audience-region variants if
analytics justify them.

No translation provider, media storage, video upload, or X publishing path is
wired here. Do not enable automatic posting until those pieces, a separate
promo queue/history, and dry-run tests are complete.

## Test

```sh
python -m unittest discover -s scripts/pareasobi-promo -p 'test_*.py' -v
```
