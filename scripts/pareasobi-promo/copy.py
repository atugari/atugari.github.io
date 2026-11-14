"""Build localized, short Pareasobi promotional posts from reviewed copy."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CATALOG_PATH = ROOT / "copy_catalog.json"
URL_RE = re.compile(r"https://atugari\\.github\\.io/plaza\\.html")


def load_catalog(path: Path = CATALOG_PATH) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or data.get("url") != "https://atugari.github.io/plaza.html":
        raise ValueError("Unexpected promo catalog schema or destination")
    if len(data.get("posts_per_language", {})) != 20:
        raise ValueError("Exactly 20 language variants are required")
    return data


def weighted_length(text: str) -> int:
    """Conservative X-style length estimate; URLs count as 23 characters."""
    url = "https://atugari.github.io/plaza.html"
    parts = text.split(url)
    if len(parts) == 1:
        return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in text)
    total = 23 * (len(parts) - 1)
    for part in parts:
        total += sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in part)
    return total


def validate_catalog(data: dict) -> None:
    expected = {
        "ja", "en", "zh-hans", "zh-hant", "ko", "es", "fr", "de", "pt", "it",
        "nl", "sv", "pl", "cs", "ru", "id", "vi", "th", "hi", "ar",
    }
    locales = data["posts_per_language"]
    if set(locales) != expected:
        raise ValueError("Locale set does not match the 20 supported languages")
    for locale, entry in locales.items():
        if len(entry.get("intro", [])) != 3 or len(entry.get("games", [])) != 4 or len(entry.get("spotlight", [])) != 4:
            raise ValueError(f"Incomplete localized copy: {locale}")
        if not entry.get("name") or not entry.get("cta"):
            raise ValueError(f"Missing locale metadata: {locale}")
        if any(not isinstance(value, str) or not value.strip() for key in ("intro", "games", "spotlight") for value in entry[key]):
            raise ValueError(f"Empty localized string: {locale}")


def build_post(locale: str, *, variant: int, focus: int, catalog: dict | None = None) -> str:
    data = catalog or load_catalog()
    validate_catalog(data)
    if locale not in data["posts_per_language"]:
        raise ValueError("Unsupported locale")
    if variant not in range(3) or focus not in range(4):
        raise ValueError("variant and focus must be in their supported ranges")
    entry = data["posts_per_language"][locale]
    text = f'{entry["intro"][variant]} {entry["spotlight"][focus]}\\n{entry["cta"]} {data["url"]}'
    if weighted_length(text) > 280:
        raise ValueError(f"Post exceeds the 280-character budget: {locale} ({weighted_length(text)})")
    if not URL_RE.search(text):
        raise ValueError("Every post must include the official Pareasobi URL")
    return text
