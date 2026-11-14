"""Deterministic, isolated schedule planner for Pareasobi X promotion.

This module plans three promotional posts per Japan calendar day. It does not
publish, call external APIs, or touch the existing x-four queue.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from itertools import product
from zoneinfo import ZoneInfo

POSTS_PER_DAY = 3
LANGUAGES = (
    "ja", "en", "zh-hans", "zh-hant", "ko", "es", "fr", "de", "pt", "it",
    "nl", "sv", "pl", "cs", "ru", "id", "vi", "th", "hi", "ar",
)
# Representative audience time zones. These are defaults for scheduling,
# not claims that a language is spoken only in this region.
LANGUAGE_ZONES = {
    "ja": "Asia/Tokyo",
    "en": "America/New_York",
    "zh-hans": "Asia/Shanghai",
    "zh-hant": "Asia/Taipei",
    "ko": "Asia/Seoul",
    "es": "Europe/Madrid",
    "fr": "Europe/Paris",
    "de": "Europe/Berlin",
    "pt": "America/Sao_Paulo",
    "it": "Europe/Rome",
    "nl": "Europe/Amsterdam",
    "sv": "Europe/Stockholm",
    "pl": "Europe/Warsaw",
    "cs": "Europe/Prague",
    "ru": "Europe/Moscow",
    "id": "Asia/Jakarta",
    "vi": "Asia/Ho_Chi_Minh",
    "th": "Asia/Bangkok",
    "hi": "Asia/Kolkata",
    "ar": "Asia/Riyadh",
}
LOCAL_HOURS = (16, 17, 18, 19, 20)
MIN_GAP_MINUTES = 90


def language_for_sequence(sequence_number: int) -> str:
    if sequence_number < 0:
        raise ValueError("sequence_number must be non-negative")
    return LANGUAGES[sequence_number % len(LANGUAGES)]


def _candidates(day: date, language: str):
    zone = ZoneInfo(LANGUAGE_ZONES[language])
    for hour in LOCAL_HOURS:
        local = datetime.combine(day, time(hour=hour), tzinfo=zone)
        yield local.astimezone(timezone.utc), hour


def sequence_start_for_day(japan_day: str) -> int:
    """Return a stable sequence offset that advances by three every Japan day."""
    return date.fromisoformat(japan_day).toordinal() * POSTS_PER_DAY


def plan_day(japan_day: str, *, sequence_start: int | None = None) -> list[dict]:
    """Return exactly three language posts with non-colliding local-time slots.

    Languages rotate through the supported 20-language list. Each post is
    placed between 16:00 and 20:00 in its representative audience time zone.
    The planner searches the five-hour window to keep UTC publication times
    at least 90 minutes apart.
    """
    day = date.fromisoformat(japan_day)
    if sequence_start is None:
        sequence_start = sequence_start_for_day(japan_day)
    selected = [language_for_sequence(sequence_start + i) for i in range(POSTS_PER_DAY)]
    options = [list(_candidates(day, language)) for language in selected]
    best = None
    for combination in product(*options):
        ordered = sorted((entry[0], index, entry[1]) for index, entry in enumerate(combination))
        gaps = [
            (ordered[i + 1][0] - ordered[i][0]).total_seconds() / 60
            for i in range(len(ordered) - 1)
        ]
        if min(gaps) < MIN_GAP_MINUTES:
            continue
        preference_cost = sum(abs(hour - 18) for _, hour in combination)
        tie_break = tuple(item[0].isoformat() for item in ordered)
        score = (preference_cost, tie_break)
        if best is None or score < best[0]:
            best = (score, ordered)
    if best is None:
        raise RuntimeError("Could not find three separated audience-time slots")

    result = []
    for utc_at, index, local_hour in best[1]:
        language = selected[index]
        local_at = utc_at.astimezone(ZoneInfo(LANGUAGE_ZONES[language]))
        result.append({
            "sequence": sequence_start + index,
            "language": language,
            "timezone": LANGUAGE_ZONES[language],
            "scheduled_at_utc": utc_at.isoformat(),
            "scheduled_at_local": local_at.isoformat(),
            "local_hour": local_hour,
        })
    return result


def validate_plan(plan: list[dict]) -> None:
    if len(plan) != POSTS_PER_DAY:
        raise ValueError("A promotion day must contain exactly three posts")
    if len({item["language"] for item in plan}) != POSTS_PER_DAY:
        raise ValueError("A language cannot be repeated within the same day")
    times = sorted(datetime.fromisoformat(item["scheduled_at_utc"]) for item in plan)
    if any((b - a).total_seconds() < MIN_GAP_MINUTES * 60 for a, b in zip(times, times[1:])):
        raise ValueError("Promotional posts are too close together")
    for item in plan:
        local = datetime.fromisoformat(item["scheduled_at_local"])
        if not 16 <= local.hour <= 20:
            raise ValueError("Post falls outside the local audience window")
        if local.tzinfo is None:
            raise ValueError("Local schedule must include its UTC offset")
