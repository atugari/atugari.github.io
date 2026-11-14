# Pareasobi X promotion — isolated planning and copy core

This directory contains the planning-only foundation for the new Pareasobi
promotional stream. It is intentionally separate from `scripts/x-four/` and
`nanpure-x-worker/`.

## Confirmed operating rules

- Exactly 3 promotional posts per Japan calendar day.
- Existing "今日の4問" remains 4 posts/day and is not modified.
- Combined planned total: 7 posts/day.
- The 20 locales match the current site language set: ja (root Japanese),
  en, zh-hans, zh-hant, ko, es, fr, de, pt, it, nl, sv, pl, cs, ru, id, vi,
  th, hi, ar.
- The language rotation is date-derived and balanced: every language receives
  exactly 3 posts in each 20-day cycle (60 posts total).
- Each language is assigned a representative audience time zone. Posts are
  scheduled between 16:00 and 20:00 in that zone, with at least 90 minutes
  between UTC publication times.
- Promotional copy includes the official Pareasobi URL.
- Only these four puzzle categories are in the promotional catalog:
  Wadōkaichin, Sudoku, Crossword, and Shirupure.

## Implemented

- `schedule.py`: deterministic three-post daily language/time-zone planner.
- `copy_catalog.json`: 20 localized copy entries; three intro variants and
  four puzzle spotlights per language.
- `copy.py`: builds a localized post from the copy catalog and enforces a
  conservative 280-character budget including the shortened URL allowance.
- Unit tests cover the schedule and copy builder.
- A separate queue schema has been added under nanpure-x-promo-worker/; it is
  designed for its own D1 database and R2 bucket and starts with posting OFF.
- A pull-request CI workflow runs these tests.

## Not yet implemented

- Independent publication queue/history and a separate publisher Worker.
- R2 media storage and X API v2 image/video upload.
- Automatic generation/rotation of promotional images and videos.
- OAuth 2.0 user-context authorization for the current X media-upload v2 flow.
- End-to-end dry run against the authorized X account.

The locale time zones are representative defaults, not a claim that a language
is spoken only in one region. English, Spanish, Portuguese, Chinese, and Arabic
audiences span multiple time zones; regional variants can be added later using
audience analytics.

No site pages are modified, and no promotional posts are sent to X by this
planning-only component.

## Test

```sh
python -m unittest discover -s scripts/pareasobi-promo -p 'test_*.py' -v
```
