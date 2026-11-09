"""Add the creator notice after all release integrity checks, before Pages upload."""
from pathlib import Path
import html
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("_site")
assert root.name == "_site", "Notice may only be added to the assembled Pages artifact"
page = root / "nanpure/index.html"
page_text = page.read_text()
assert "</header>" in page_text, "Nanpure header not found"
assert 'class="creator-notice"' not in page_text, "Creator notice already exists"

notice = """【パレあそびにあるゲームの調整や修正について】

調整や修正についてですが、来月15日頃には再開できそうです。今はチャットGPTの月購入を再開しようと頑張っています。

なのでそれまで久しぶりにゲームで遊んだり、テレビアニメを観たり等のんびり過ごしています(⁠≧⁠▽⁠≦⁠)

チャットGPTでサイトを作ったり修正するのも楽しいのですがADHD故ずっとやってしまい、色々な事が疎かになっていました……。

自業自得ではあるのですが、奮発して月1万5000円のチャットGPTを使えるようにしてしまった結果、ずっと制限が来ずにサイト作りや編集という名の作業が出来てしまったのが全ての始まりでした。
　なので12月15日からは月3000円のプランにし、やり過ぎないようにするのでサイトの更新回数が少なくなると思います。いや、なります。

身勝手で申し訳ございませんm(_ _)m

いつも此処の内容はAIが自動で更新しているのですが、コレは自分で書いております。"""

section = (
    '<section class="creator-notice" aria-label="製作者からのお知らせ" '
    'style="margin:0 auto 12px;padding:12px 16px;max-width:760px;'
    'border:1px solid #d8cbb5;border-radius:12px;background:#fffaf0;'
    'color:#443b30;line-height:1.7">'
    '<div><strong style="display:block;font-weight:700">'
    '製作者からのお知らせ</strong><div style="padding-top:10px;white-space:pre-wrap">'
    + html.escape(notice) +
    '</div></div></section>'
)
page.write_text(page_text.replace("</header>", "</header>" + section, 1))
print("Creator notice added to assembled Pages artifact.")
