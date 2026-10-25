# Xへ毎日4問を投稿する

スマホ用アプリは不要です。GitHub Actionsで毎日8時（日本時間）にシルプレ・9×9ナンプレ・和同開珎・7×7クロスワードを各1問用意します。2048×2048 PNGの4枚を1投稿へ添付します。GitHubの混雑で開始が遅れる場合があります。

初期状態は **投稿停止中** です。push時は画像を作る試験だけを実行します。Xのキーはコードや画像に含めません。

## 最初の接続

1. X Developer Consoleの既存の開発者アプリでRead and writeを確認します。自分のアカウント用のOAuth 1.0aのAPI Key・API Secret・Access Token・Access Token Secretを用意します。OAuth 2.0 Client IDやアプリ専用Bearer Tokenとは別のものです。
2. GitHubリポジトリのSettings → Secrets and variables → Actions → Secretsに以下の4件を登録します。値はチャット・ソース・公開ファイルへ貼らないでください。
   - `X_API_KEY`
   - `X_API_SECRET`
   - `X_ACCESS_TOKEN`
   - `X_ACCESS_TOKEN_SECRET`
3. Actionsの **X daily four puzzles** を開き、Run workflowのmodeを`check`にして接続先が`@parade166`であることを確認します。この操作は投稿しません。Xのアカウント確認APIの利用料は発生します。
4. 同じ画面のmode `preview`で画像4枚と投稿文を確認できます。Artifactsには問題画像と本文・ALTだけを保存します。解答は含めません。
5. 利用料を確認してから、Settings → Secrets and variables → Actions → Variablesに`X_FOUR_POST_ENABLED`を値`true`で登録すると毎日8時の投稿が有効になります。止めるときは`false`にします。

## 投稿文と費用

初期設定では本文にクリック可能なサイトURLを含めず、サイト名を本文と画像へ記載します。サイトURLは画像内にも載せています。本文へリンクを加える場合は変数`X_FOUR_INCLUDE_URL=true`を設定します。

2026-10-25確認のX公式料金では投稿作成は1回$0.015、URL付きは1回$0.200です。30日で投稿作成料だけなら$0.45または$6.00です。画像のALT設定・アカウント確認などのAPI利用料は別にかかります。残高と最新料金はDeveloper Consoleで確認してください。自動チャージや購入処理は行いません。

## 重複・失敗時の扱い

- 問題は生成後に別の解法チェックも通します。ナンプレとシルプレは一意解を確認します。和同開珎は辞書で4熟語を確認しますが辞書外の別解まで否定しません。
- 以前用意した2026-10-24の4問も重複防止対象です。
- 投稿履歴と問題の識別子を別ブランチ`x-four-history`に保存します。サイトの再公開は起こしません。パスワードや解答は保存しません。
- 送信前に当日分の履歴を確保します。結果不明のまま終了した場合は再送せず停止します。X上の実際の投稿を確認してから対処してください。
- 公開リポジトリの定期実行は長期間の活動がない場合にGitHub側で無効になることがあります。失敗時はActionsの結果を確認してください。

## 開発・検証

`python -m unittest discover -s scripts/x-four -p 'test_*.py' -v`

`X_FOUR_MODE=preview python scripts/x-four/run.py`

ローカルのフォントは`X_FONT_REGULAR`と`X_FONT_BOLD`で指定できます。GitHubではUbuntuのfonts-noto-cjkを利用します。元の前回投稿用レンダラーを引き継ぎ、日付と問題を毎回差し替えます。画像には必要なルールを載せます。シルプレの生成エンジンは既存のナンプレ帳に含まれるものを再利用しています。

実際のXへの投稿は接続情報の登録後に確認する必要があります。モックテストの成功だけを実投稿の成功とは扱いません。
