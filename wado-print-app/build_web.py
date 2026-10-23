"""Assemble offline UI assets from the reviewed source and the repository lexicon."""
from pathlib import Path
import base64, html, json, sys
root=Path(__file__).resolve().parent
src=root/'web-source'
repo=root.parent
data=repo/'scripts/client-overrides/public/notebook/wado-data.json'
if not data.exists():
    data=root.parent/'source/wado-data.json'
page=(src/'index.html').read_text(encoding='utf-8')
licenses=(src/'licenses.txt').read_text(encoding='utf-8')
font='@font-face{font-family:WadoPrintKanji;font-style:normal;font-weight:700;font-display:block;src:url(data:font/woff;base64,'+base64.b64encode((src/'kanji-bold.woff').read_bytes()).decode()+') format("woff")}\n'
replacements={'STYLE':(src/'print.css').read_text(encoding='utf-8')+font,'LICENSE':html.escape(licenses),'DICTIONARY':json.dumps(json.loads(data.read_text(encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'),'HINTS':(src/'hints.json').read_text(encoding='utf-8').replace('<','\\u003c'),'FONT_METRICS':(src/'kanji-metrics.json').read_text(encoding='utf-8'),'CLUES':(src/'clues.js').read_text(encoding='utf-8'),'ENGINE':(src/'engine.js').read_text(encoding='utf-8'),'LAYOUT':(src/'layout.js').read_text(encoding='utf-8'),'APP':(src/'app.js').read_text(encoding='utf-8')}
for key,value in replacements.items():
    marker='/*'+key+'*/'
    assert page.count(marker)==1, key
    page=page.replace(marker,value)
out=root/'web'
out.mkdir(exist_ok=True)
(out/'index.html').write_text(page,encoding='utf-8')
assets=root/'android/app/src/main/assets'
assets.mkdir(exist_ok=True)
(assets/'index.html').write_text(page,encoding='utf-8')
print('Offline page built:',len(page.encode('utf-8')),'bytes')
