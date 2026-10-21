# ナンプレ帳 Cloudflare API

GitHub Pages のナンプレ帳から利用する API の移行準備用です。
現段階は Worker の配信と D1 の接続確認までで、ゲーム用 API は未移植です。
既存の GitHub Pages のリンク・セーブデータはまだ変更していません。

## GitHub Actions からの公開（現在の手順）

Cloudflare の GitHub 連携がリポジトリ選択へ進まないため、公式の
GitHub Actions + Wrangler による公開へ切り替えています。
`.github/workflows/deploy-nanpure-api.yml` を用意済みです。

1. Cloudflare の対象アカウントで API トークンを作ります。
   必要な権限は `Workers Scripts: Edit` と `D1: Edit` です。
   D1 の編集権限は、今後のスキーマ初期化にも使用します。
2. GitHub の **Settings → Secrets and variables → Actions → New repository secret** に、
   名前 `CLOUDFLARE_API_TOKEN`、値にトークンを保存します。
   アカウント ID はワークフローで設定済みのため、別の Secret は不要です。
3. **Actions → Deploy Nanpure API to Cloudflare → Run workflow** で実行します。
   以降は `main` の API 関連ファイルを更新すると、自動でテスト・公開・接続確認を行います。

トークン未登録時はテストだけ実行し、公開をスキップします。
このワークフローは既存の `puzzle-api` を更新します。
現時点では DB マイグレーションを自動実行しません。
トークンをチャット、公開ファイル、スクリーンショットに含めないでください。

参考: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/

## Cloudflare Workers Builds との連携（別方式）

既存の `puzzle-api` Worker の **Settings → Builds → GitHub** から接続します。

| 設定 | 値 |
|---|---|
| Repository | `atugari/atugari.github.io` |
| Production branch | `main` |
| Root directory | `nanpure-api` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Non-production branch builds | 無効（本番 DB と分離するまでは作らない） |

接続後の確認先:
`https://puzzle-api.puzzle-hub-4826.workers.dev/api/health`

`database: connected` は D1 の読み取り成功です。
`schema: pending` はまだテーブルが作られていない状態です。
`gameApi: pending` は日替わり・ランキングなどの移植が未完了という意味です。
この確認 API から SQL の実行やデータの変更はできません。

## データベース

`wrangler.jsonc` に、作成済みの `puzzle-db` を `DB` として設定しています。
database_id はリソースの識別番号です。API トークンや認証情報は含みません。
スキーマは元アプリの `db/schema.ts`（commit `1222640`）に合わせています。
`migrations/0001_initial.sql` は新しい空 DB 用の追加だけの初期化です。
旧サーバーのランキング・お問い合わせ・バックアップは自動では移りません。

テーブル作成は Cloudflare の D1 → puzzle-db → Console でこの SQL を実行するか、
D1 編集権限を持つローカル環境で `npm run db:migrate` を実行します。
通常の Workers Builds のトークンには D1 編集権限が含まれないため、
初期設定のデプロイコマンドに DB マイグレーションを含めていません。

## 移植前に対応する点

- Cookie に依存する日替わり参加者・お問い合わせの識別を、別ドメインの API に対応させる。
- ChatGPT ログインと R2 に依存するクラウド保存の移行方式を確定する。
- 元の問題生成は最大数秒の CPU 処理があるため、そのまま Workers 無料枠へ載せない。
- 日替わり問題の未使用ストック、重複防止、回答確認を移し、GitHub 側のリンクを切り替える。
- 将来問題の解答・利用者データ・認証用秘密情報を公開リポジトリへ追加しない。

ローカル確認: `npm test`。Cloudflare のログイン情報はチャットやリポジトリへ貼り付けないでください。
