"""Inject PareAsobi analytics into the assembled Pages tree after release integrity checks."""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("_site")
assert (root / "assets/pare-analytics.js").is_file(), "Analytics asset was not published"
script_tag = '<script defer src="/assets/pare-analytics.js?v=1"></script>'
game_pages = {
    "plaza.html": "pareasobi", "nanpure/index.html": "nanpure",
    "index.html": "maru", "dungeon.html": "tobe", "speed.html": "speed",
    "kuroshiro/index.html": "kuroshiro", "combination-blocks.html": "combination-blocks",
    "narabe100.html": "narabe100", "echo-dive.html": "echo-dive", "maze/index.html": "maze",
    "shopping-memo.html": "shopping-memo", "timer-gauge.html": "timer-gauge",
    "skins.html": "skins", "move-moove-mooove.html": "move-moove-mooove",
    "puzzles/index.html": "puzzles", "puzzles/shirupure/index.html": "shirupure",
    "puzzles/wado/index.html": "wado", "puzzles/crossword/index.html": "crossword",
    "puzzles/cross/index.html": "cross", "puzzles/tenbin/index.html": "tenbin",
    "puzzles/paths/index.html": "paths", "puzzles/studio/index.html": "studio",
    "puzzles/workshop/index.html": "workshop", "puzzles/magic-square/index.html": "magic-square",
    "puzzles/cross/stock/index.html": "cross",
}
for name, game in game_pages.items():
    page = root / name
    if not page.is_file():
        continue
    html = page.read_text()
    if not html.strip():
        print(f"Skipped empty game entry: {name}", flush=True)
        continue
    if not re.search(r'<body[^>]*\bdata-game=', html, re.I):
        html, count = re.subn(r'<body\b', f'<body data-game="{game}"', html, count=1, flags=re.I)
        assert count == 1, f"Missing body element: {name}"
    if "/scripts/client-overrides/public/pare-analytics.js" in html:
        html = html.replace("/scripts/client-overrides/public/pare-analytics.js", "/assets/pare-analytics.js")
    if "/assets/pare-analytics.js" not in html and "</body>" in html:
        html = html.replace("</body>", script_tag + "\n</body>", 1)
    assert "/assets/pare-analytics.js" in html, f"Analytics script missing: {name}"
    page.write_text(html)
print("Injected PareAsobi analytics after release integrity checks.")
