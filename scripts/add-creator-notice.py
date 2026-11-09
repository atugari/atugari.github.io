"""Add an optional, unread-badged creator notice after release checks."""
from pathlib import Path
import html
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("_site")
assert root.name == "_site", "Notice may only be added to the assembled Pages artifact"
page = root / "nanpure/index.html"
page_text = page.read_text(encoding="utf-8")
assert "</header>" in page_text, "Nanpure header not found"
assert 'class="creator-notice"' not in page_text, "Creator notice already exists"

notice_id = "20261109-creator-notice"
notice = """【パレあそびにあるゲームの調整や修正について】

調整や修正についてですが、来月15日頃には再開できそうです。今はチャットGPTの月購入を再開しようと頑張っています。

なのでそれまで久しぶりにゲームで遊んだり、テレビアニメを観たり等のんびり過ごしています(⁠≧⁠▽⁠≦⁠)

チャットGPTでサイトを作ったり修正するのも楽しいのですがADHD故ずっとやってしまい、色々な事が疎かになっていました……。

自業自得ではあるのですが、奮発して月1万5000円のチャットGPTを使えるようにしてしまった結果、ずっと制限が来ずにサイト作りや編集という名の作業が出来てしまったのが全ての始まりでした。
　なので12月15日からは月3000円のプランにし、やり過ぎないようにするのでサイトの更新回数が少なくなると思います。いや、なります。

身勝手で申し訳ございませんm(_ _)m

いつも此処の内容はAIが自動で更新しているのですが、コレは自分で書いております。"""

section = (
    '<details class="creator-notice" data-notice-id="' + notice_id + '" '
    'style="margin:8px auto 12px;padding:0;max-width:760px;'
    'border:1px solid #d8cbb5;border-radius:12px;background:#fffaf0;'
    'color:#443b30;line-height:1.6">'
    '<summary style="display:flex;align-items:center;gap:9px;'
    'padding:11px 15px;cursor:pointer;list-style:none;font-weight:700">'
    '<span>お知らせ・更新情報</span>'
    '<span class="creator-notice-dot" aria-label="未読のお知らせ" '
    'style="display:inline-block;width:8px;height:8px;flex:0 0 8px;'
    'border-radius:50%;background:#e04444"></span>'
    '<span aria-hidden="true" style="margin-left:auto;font-size:12px;'
    'font-weight:400;opacity:.7">開く</span>'
    '</summary>'
    '<div style="padding:0 15px 14px;white-space:pre-wrap">'
    '<strong style="display:block;margin:2px 0 8px">製作者からのお知らせ</strong>'
    + html.escape(notice) +
    '</div></details>'
    '<script>(function(){'
    'var box=document.querySelector(".creator-notice");if(!box)return;'
    'var dot=box.querySelector(".creator-notice-dot");'
    'var key="nanpure.notice.read."+box.getAttribute("data-notice-id");'
    'try{if(localStorage.getItem(key)==="1"&&dot)dot.hidden=true;}catch(e){}'
    'box.addEventListener("toggle",function(){if(!box.open)return;'
    'try{localStorage.setItem(key,"1");}catch(e){}'
    'if(dot)dot.hidden=true;});'
    '})();</script>'
)
page.write_text(page_text.replace("</header>", "</header>" + section, 1), encoding="utf-8")
print("Optional creator notice with unread badge added to assembled Pages artifact.")
