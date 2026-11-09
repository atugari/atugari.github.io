"""Inject Pareasobi analytics after immutable release integrity checks have passed."""
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
source = Path("scripts/client-overrides/public/pareasobi-analytics.js")
if not source.is_file():
    raise SystemExit("Pareasobi analytics tracker source is missing.")
target = root / "assets/pareasobi-analytics.js"
target.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(source, target)
tag = '<script defer src="/assets/pareasobi-analytics.js?v=20261110"></script>'
pages = [
    "plaza.html", "nanpure/index.html", "index.html", "dungeon.html",
    "speed.html", "kuroshiro/index.html", "combination-blocks.html",
    "narabe100.html", "echo-dive.html", "maze/index.html",
    "shopping-memo.html", "timer-gauge.html", "skins.html",
    "move-moove-mooove.html", "puzzles/index.html",
    "puzzles/magic-square/index.html", "puzzles/cross/stock/index.html",
]
for name in pages:
    page = root / name
    if page.is_file():
        html = page.read_text()
        if "/assets/pareasobi-analytics.js" not in html and "</body>" in html:
            page.write_text(html.replace("</body>", tag + "\n</body>"))
entry = root / "puzzles/entry.js"
if entry.is_file():
    text = entry.read_text()
    marker = "const frame=document.getElementById('game')"
    if marker in text and "pareasobi-analytics.js" not in text:
        loader = "const analytics=document.createElement('script');analytics.defer=true;analytics.src='/assets/pareasobi-analytics.js?v=20261110';document.head.append(analytics);\n"
        entry.write_text(text.replace(marker, loader + marker, 1))
print("Pareasobi analytics injected into assembled Pages output.")
