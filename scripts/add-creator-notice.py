"""Creator notice is currently disabled.

The notice used to be injected into the assembled Pages artifact
(_site/nanpure/index.html). It flashed on load: the static HTML shows it,
but the app replaces the page content when it starts, so the notice appears
for a moment and disappears, and the page below jumps. To stop the flash
and the jump, this step now does nothing. The notice text is kept below so
it can be put back later.
"""

notice_id = "20261109-creator-notice"
notice = """【パレあそびにあるゲームの調整や修正について】

調整や修正についてですが、来月15日頃には再開できそうです。今はチャットGPTの月購入を再開しようと頑張っています。

なのでそれまで久しぶりにゲームで遊んだり、テレビアニメを観たり等のんびり過ごしています(≧▽≦)

チャットGPTでサイトを作ったり修正するのも楽しいのですがADHD故ずっとやってしまい、色々な事が疎かになっていました……。

自業自得ではあるのですが、奮発して月1万5000円のチャットGPTを使えるようにしてしまった結果、ずっと制限が来ずにサイト作りや編集という名の作業が出来てしまったのが全ての始まりでした。
　なので12月15日からは月3000円のプランにし、やり過ぎないようにするのでサイトの更新回数が少なくなると思います。いや、なります。

身勝手で申し訳ございませんm(_ _)m

いつも此処の内容はAIが自動で更新しているのですが、コレは自分で書いております。"""

print("Creator notice disabled (no flash, no layout jump).")
