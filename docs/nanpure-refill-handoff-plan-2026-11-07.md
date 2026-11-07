# ナンプレ補充係への生成移管・実装計画

更新: 2026-11-07
対象: `nanpure/`、`nanpure/collection/`、`nanpure-api/`、Android `nanpure-vending-worker`

## 結論

サイト内の生成機能は、補充係からの補充が本番で安定するまで削除しない。既存のAndroid 0.3.1の通信先・認証方式を先に把握し、既存の補充ワーカーを壊さず、サイトの一般問題集へ安全に登録できる経路を作る。

## 現行構成で確認できたこと

1. `nanpure/collection/` は問題を遊ぶ配信カタログで、`catalog.json`、設定別index、gzip問題パックをSHA-256と件数で照合して読む。IDは `P-000001` 形式。これは配信済み問題集であり、補充先の書き込みAPIではない。
2. `nanpure/collection/player-storage.js` はブラウザIndexedDB `nanpure-chou-data` の個人ライブラリを管理する。問題本体は `puzzles`、一覧は `summaries`、重複履歴は `seen`。これは利用者端末内の保存領域で、全利用者共通の10万問在庫ではない。
3. `nanpure-api/src/import.js` の管理者インポート許可テーブルは attempts / inquiries / daily_assignments のみ。一般問題集を受け入れる仕組みではない。
4. `nanpure-api/src/generation.js` は現在 normal・9×9・指定levelの生成リレーを扱う。問題自販機向けのAPIを、全ルールの一般問題集補充APIとして流用してはならない。
5. Android 0.3.1の通信先 `/api/vending/worker` に対応するサーバー実装を `nanpure-vending-pilot` ブランチで発見。`nanpure-api/src/vending.js` と `vending-enrollment.js` が実装本体で、専用Workerへの安全な差分適用処理は `.github/nanpure-vending-pilot/patch-worker.mjs` と `deploy.py`。
6. APKの `assets/refill-bootstrap.json` に登録用キーが埋め込まれていることを確認。キー値は文書・GitHub・回答へ転載しない。APKから抽出可能なため、長期の共通秘密として扱わず、既存登録方式の失効・ローテーション計画が必要。
7. private ZIPには署名関連ファイル・端末bootstrap情報等が含まれるが、公開リポジトリへは絶対に追加しない。Androidソースは `nanpure-vending-pilot` ブランチで確認済み。

## 実装方針

### A. 補充APIと既存ワーカー

- 既存 `/api/vending/worker` は別Workersサービスの可能性があるため、既存端末の登録・poll・送信を確認せずに置き換えない。
- 既存ワーカーのAPI契約を確定してから、互換維持のまま一般問題集への受入処理を接続する。必要なら専用の補充APIを追加し、既存の日替わり在庫や利用者の個人ライブラリとは分離する。
- Android端末は端末ごとの認証資格情報で接続。APKに含まれる共通登録キーを長期認証に使わない。既存0.3.1の登録互換性を維持しながら段階移行する。
- サーバーが条件別の在庫数と目標数（初期値100）を集計し、不足分だけをclaimする。claimは期限付きリースと原子的更新で排他制御し、複数端末の二重作業を防止。
- 受信データはバッチ単位で検証。IDの冪等性、条件一致、盤面・解答・追加制約の検証、正規化フィンガープリント重複検査を通過した問題だけを追加保存する。
- 受信・検証・保存を別状態で記録し、保存成功した件数だけを在庫数へ反映する。失敗・タイムアウト・再送は同じbatch/item IDで安全に再試行できる。
- マルチ、模様生成、通常ルールは別々の検証器・プロファイルで受け入れる。検証器のないルールは受け入れず、成功扱いにしない。
- 端末のローカル在庫は送信成功確認まで消去しない。再開カーソルと失敗理由を保持する。

### B. 在庫の正本と配信

- 既存の `nanpure/collection/catalog.json` には合計104,619問の配信登録が記録されている（catalog内のimports情報）。ただし、この数値は現在の公開配信物の登録数であり、最新の本番同期状態や未プレイ在庫数を保証するものではない。
- 公開カタログの実データを集計すると、リリース `2026.10.27.65` は104,619問。Android側の427プロフィールに照合すると、公開問題がある条件302、0問の条件125、1〜99問の条件82、100問以上の条件220で、Excelの不足一覧と一致する。カタログ内の302条件の件数合計も104,619問。
- `0010_refill_pipeline.sql` はこの427プロフィールの基準数を保持できるよう `baseline_count` / `catalogue_key` / `catalog_release` を持つ。`0011_refill_catalogue_baseline.sql` は427件を初期登録し、合計104,619件のスナップショットを保存する。各条件の `target_count` は100。初期状態は全プロフィール `enabled=0` とし、受入APIと配信接続の検証前に端末へ仕事を配らない。
- このbaselineは公開カタログ上の登録数であり、利用者ごとのプレイ履歴・未プレイ数ではない。現行の `seen` 履歴は各利用者のブラウザ内にあるため、全利用者共通の「未プレイ」をサーバーが把握しているとは扱わない。
- 10万問超の既存配信データを破壊・上書きしない。現在のカタログ／パックは読み取り専用の既存配信物として扱う。
- 新規補充分は追加専用の保管単位で保存し、検証後に新しいカタログ世代を生成する。旧カタログ・旧パックは新世代の検証完了まで残す。
- 条件キーはルール、盤面サイズ、難易度、形状・連結配置、複雑度など、生成プロファイルの全要素を含める。表示名だけで集計しない。
- 「100問」は同一条件内の未プレイ在庫を基準にし、既存数が1問なら99問を依頼する。条件の定義と集計対象を本番データで照合してから有効化する。

### C. 生成機能の停止条件

以下すべてを満たすまでサイト内生成UI・生成エンジンを削除しない。

1. 既存問題のバックアップと復元テストが完了。
2. Android 0.3.1との通信・認証・再送・中断再開の互換テストが完了。
3. 通常・マルチ・模様生成の各対象プロファイルでサーバー検証が完了。
4. 複数端末同時実行で二重登録・在庫数の不整合がない。
5. 少なくとも一定期間の並行稼働で、補充成功数・失敗数・不足条件が一致。
6. 配信カタログの再生成と旧版へのロールバックを確認。

停止は一括削除ではなく、まず生成UIを無効化するフラグで切り替え、問題があれば即時に戻せるようにする。安定確認後にサイト内生成エンジンのコードを別リリースで削除する。


## Android 0.3.1の既存API契約（ソース確認済み）

Androidソースは同リポジトリの `nanpure-vending-pilot` ブランチ、コミット `085607c4faf16281c24411e66d94f4fbd937be4a` の `android/nanpure-vending-worker/` で確認した。

- 接続先は専用Workersサービスの `/api/vending/worker`。HTTPSのPOSTでJSONを送信し、端末トークンは `Authorization: Bearer <token>`。リダイレクトは追従しない。タイムアウトは接続・読取各15秒。成功時はHTTP 200かつJSON `ok:true` を要求する。
- `poll`: `action:"poll"`、`version:2`、端末側の `ready`（在庫のあるprofile key配列）、`stock`（端末内の総件数とバイト数）を送る。応答の `job` がなければ待機。
- jobには少なくとも `id`、`lease`、`profile`、`kind`、`n`、`level`、`complexity`、`multiShape`、`linkedShape` が必要。Androidはローカル427プロフィールと全項目一致しない依頼を処理しない。
- `result`: `action:"result"`、`id`、`lease`、`p`（完成した問題JSON）を送る。成功応答後に限り端末SQLiteから配送記録と完成品を消去する。
- `release`: `action:"release"`、`id`、`lease`。未送信時に依頼を返却する。失敗時はリース期限切れで再割当てされる想定。
- HTTP 400/413は端末側で完成品を破棄。409 `duplicate` も破棄。409 `lease_expired` / `shelf_full` / `already_finished` は配送割当てだけを解除し、端末内完成品を保持。403は端末登録拒否として処理。
- 端末側はSQLiteで完成品・配送割当てを永続化し、再送では同じjob IDとleaseを使う。完成品はサーバーの成功応答まで保持される。端末側の重複ID/digestもチェックする。
- 新規端末登録は別のenrollment手順で行い、端末ごとに異なるトークンを作る設計。管理者資格情報はAndroidアプリへ入れない。

## 既存サーバー実装の発見・確認結果

`nanpure-vending-pilot` ブランチの以下の実装を確認した。

- `nanpure-api/src/vending.js`: `/api/vending/worker` の `register` / `enroll` / `poll` / `result` / `release` と、管理者・注文APIを実装。
- `nanpure-api/src/vending-enrollment.js`: 登録キーのハッシュ保存、端末ごとのトークン、再送の冪等性、登録失効、端末数上限を実装。
- `nanpure-api/migrations/0010_vending.sql`〜`0015_vending_enrollment.sql`: 端末、ジョブ、問題、プロファイル、カタログ、登録管理のD1スキーマ。
- `nanpure-api/scripts/generate-vending-catalogue.mjs`: Androidの固定リリースから427プロファイルを生成し、`0014_vending_catalogue_profiles.sql`を作る。
- `.github/nanpure-vending-pilot/patch-worker.mjs`: 既存Workerの外側のルート・資産・bindingを保持し、`vending()`関数だけを専用モジュールへ転送する差分を生成。
- `.github/nanpure-vending-pilot/deploy.py`とデプロイworkflow: 対象Workerのバージョン・モジュールhash・設定を確認し、対象が想定どおりの場合だけ差分をアップロード。失敗時も自分のアップロードと確認できる場合に限って復元する。

既存サーバーの処理は次のとおり。

1. 端末認証は `Authorization: Bearer <端末別token>`。tokenそのものではなくハッシュをD1に保存。
2. pollは端末ごとに同時1ジョブ。leaseは8分で、同じ端末からの再pollでは有効なジョブを返す。
3. 427プロファイルの全条件をジョブに含め、Android側のプロファイルと照合。
4. resultはプロファイルに応じて盤面・解答・追加制約・唯一解・難易度等を検証し、フィンガープリントとUIDの重複を拒否。
5. D1への問題保存とジョブ完了をトリガーで連動。保存できたものだけを在庫として計上。
6. `duplicate` / `lease_expired` / `shelf_full` / `already_finished` の再送応答を実装。
7. 登録枠は全体32台、enrollment grantは最大30台。既存の手動登録端末も枠に含む。

### まだ解決していない重要な差

既存の補充Workerは、ユーザーが求めるサイト共通の10万問超の問題集を直接参照していない。専用WorkerのD1にある `vending_puzzles` / `vending_catalogue` が在庫の正本であり、GitHub Pagesの `nanpure/collection/catalog.json` とgzipパックは別の保管・配信系統。

また既存Workerの `vending_catalogue.target` は現行migration上1〜30の制約で、Android 0.3.1の既存プロファイル目標も小規模な補充棚を想定している。したがって、現在のWorkerをそのまま「各条件100問」に設定するだけでは要件を満たさない。既存10万問超をプロファイル別に集計し、既存配信データと新規受入データの重複を横断して防ぎ、検証済み補充分をサイトの次世代カタログへ安全に取り込む接続が別途必要。

**重要:** Androidの `ready` は端末内在庫のあるprofile一覧であり、サイト全体の未プレイ在庫数ではない。端末内の在庫目標とサイト共通の条件別目標100問は別概念。

## 今回の変更範囲

- 設計文書を追加。
- `nanpure-api/migrations/0010_refill_pipeline.sql` と `0011_refill_catalogue_baseline.sql` を追加。補充プロフィール427件、基準在庫104,619問、補充ジョブ、受信バッチ、受入問題のテーブルと索引を定義。既存の `0002_cloudflare_application.sql` とmigration番号が衝突しないよう `0010` 以降へ修正済み。
- `nanpure-api/test/refill-schema.test.mjs` と `.github/workflows/test-refill-pipeline.yml` を追加。migration適用後に427プロフィール・104,619件・不足分布・目標100・初期無効状態を自動検証する。
- migrationはGitHub上のDraft PRに追加済みだが、本番D1には未適用。
- このPRでは専用の4テーブルmigrationと設計文書を整備中。既存pilot Workerの実装は別ブランチに存在するが、10万問超の既存コレクションとの統合、100問目標、サイト用カタログの安全な再生成は未実装。
- 秘密情報は含めない。
