# BLOCK BATTLE v24 — 公開版

ゲームと対戦サーバーを1ファイル・2万文字以内に収めた、2〜9人の落ち物パズル。公開版のゲーム・通信・配信ファイルは、ユーザーの既存Cloudflare環境で動く。ChatGPTのサーバー、ChatGPTログイン、外部ゲームライブラリは使用しない。

## 遊ぶ

「1人で練習」で開始し、盤面へ自動で移動する。友達とは全員で人数と合言葉を同じにして「合言葉で対戦」を押す。指定人数がそろうと自動で開始し、全員に同じ順番のブロックが出る。ランダム対戦も同じ人数の人がそろうまで待機する。

矢印で移動と右回転、Zで左回転、SpaceでDROP、C/ShiftでHOLD。スマホの操作ボタン、標準Gamepad API、合成BGM・効果音にも対応。音は初期状態でOFF。「操作を変更」からキーボード・コントローラーを別々に割り当て、端末に保存できる。コントローラーの初期設定は十字キー↑で一気に落とす。重複した入力は元の割り当てと入れ替え、設定中は練習を停止する。

2人戦は2勝先取。脱落後も観戦でき、全員が再戦準備をすると次のラウンドが始まる。途中退室・切断は脱落扱いで、入り直しは次の募集に入る。切断者がいる試合は再戦できないため、全員いったん退室して人数を合わせて再募集する。

## 公開と文字数

- `public/block-battle.mjs`：ブラウザのHTML/CSS/JS、WebSocket対戦管理、Cloudflare用Worker/Durable Object、Node起動用HTTP/WebSocketサーバーを内包する。
- `public/x-post.txt`：全文をXへ載せるための実行説明付きソース。実投稿は別途行う。
- `generated/size.json`：文字数の実測。日本語などを多めに数えた値でも、投稿全文が20,000以内でなければビルドを止める。
- `public/test-checklist.html` と `public/TEST_CHECKLIST.txt`：こちらで実施した検証結果と、実機で残る3件。チェックとメモは端末内だけに保存し、送信しない。

HTML/CSS/JSはBrotliで圧縮し、制御文字や結合文字を含まないLatin Extendedの文字へ1バイト1文字で符号化して同じソース内に保持し、標準の`node:zlib`で展開する。実行中に外部のゲームコードや圧縮ライブラリを読み込まない。Cloudflareの配信用設定とGitHub Actionsは、環境を用意するための設定である。

## 1ファイルで起動

Node.js 24以上で `node block-battle.mjs` を実行し、`http://localhost:8787` を開く。同じLANの別端末は起動したPCのLANアドレスと8787番で参加する。ネット越しに公開する場合は、誰もがアクセスできるChatGPT以外のホストへ配置する。

## 通信

WebSocketで変更のあった盤面だけを送る。対戦中にD1を繰り返し読み書きしない。接続に付随するスナップショットを保持し、Durable Objectが休止後に再作成されても同じ試合を復元する。待機・試合終了時の心拍応答はHibernation APIで自動返信する。退室・無応答の参加者は脱落扱いにする。

サーバーは定員、共通開始時刻と乱数種、攻撃の配送と重複防止、勝敗、再戦を管理する。盤面の合法性を毎手検算する競技用の完全な不正対策は含まない。操作名・本名・メールアドレスなどを取得する認証や解析機能はない。入力した表示名は同じ試合の相手に見える。

## 開発・公開

```sh
npm ci
npm run build
npm test
npm run deploy
```

既存のGitHubリポジトリと`CLOUDFLARE_API_TOKEN`で、専用Worker `block-battle` と専用Durable Objectだけを配置する。他のゲーム、D1、アカウントのプランを変更しない。一般公開のホストとしてChatGPT Sitesを選ばない。以前の本人限定v21 Siteは維持する。

ローカルブラウザ確認時だけ`tests/browser-qa.html`を`public/_qa.html`へコピーする。公開前に取り除く。公開後の検証は`node scripts/check-live.mjs <公開URL>`で、固有のQA用合言葉を使う。実ユーザーのランダム待機所には入らない。

Cloudflareの利用上限は契約プランに従う。無料枠でも無制限という意味ではない。自動テスト・同一ブラウザの複数画面と、実機・別回線・実物コントローラーでの確認は区別する。

追加検証は `tests/extended-input.test.mjs`、`tests/endurance.test.mjs`、`tests/network-session.test.mjs`。公開先の実時間通信は `node scripts/soak-live.mjs https://block-battle.puzzle-hub-4826.workers.dev 1200`。固有のQA部屋の2接続で実施し、ゲーム状態は合成入力である。
