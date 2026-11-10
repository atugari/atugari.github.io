"""Inject the digit-size correction only after immutable Nanpure release checks."""
from pathlib import Path
import json, shutil, sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("_site")
manifest = json.loads((root / "nanpure/release-manifest.json").read_text())
version = manifest["version"]
source = Path(__file__).resolve().parent / "client-overrides/public/notebook-digit-size.js"
asset = root / "nanpure/assets/notebook-digit-size.js"
asset.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(source, asset)
page = root / "nanpure/releases" / version / "notebook/index.html"
html = page.read_text()
tag = f'<script defer src="/nanpure/assets/notebook-digit-size.js?v=1"></script>'
if tag not in html:
    assert "</body>" in html, f"Missing body close in {page}"
    html = html.replace("</body>", tag + "\\n</body>", 1)
    page.write_text(html)
assert asset.is_file() and tag in page.read_text()
print(f"Injected notebook digit-size correction for Nanpure {version}.")
