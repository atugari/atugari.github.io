# 登録presetのローカル検査

本体の `RefillStore.java` と `RefillBootstrap.java` を改変せずコンパイルし、初回登録・再起動・既存登録の保護・解除・不正preset・保存失敗・同時操作を検査します。接続先とtokenは架空の値だけを使用し、ネットワーク、管理者キー、本番API、署名鍵は使いません。

## 実行

Python 3、JDK 17、Gson JARが必要です（Gson 2.10で確認）。アプリのディレクトリで実行する例：

```sh
python3 tests/bootstrap/run.py \
  --jdk /path/to/jdk-17 \
  --gson /path/to/gson-2.10.jar \
  --out /tmp/refill-bootstrap-results.json
```

`--jdk` は `JAVA_HOME`、`--gson` は `GSON_JAR` でも指定できます。`--app` は検査対象アプリのディレクトリを変更するときに使います。既定値はこの `tests/` の親なので、実行時のカレントディレクトリには依存しません。`--out` を省略すると結果JSONを標準出力に出します。コンパイル先は一時ディレクトリで、実行後に削除します。

## 検査の範囲

AndroidのSharedPreferencesとAssetManagerは模擬実装です。保存済み状態とプロセス内の状態を分け、保存失敗、再起動、競合を確認します。JSONはGsonを使う最小adapterで、AndroidのJSONパーサー自体の互換性試験ではありません。

実機へのインストール、Android上の画面操作・SQLite・JobScheduler、OSが提供するアプリ間の分離、サーバーへの端末登録は検査しません。2つのapplicationIdを使うテストは、分離したContextを与えたときに設定が混ざらないことだけを確認します。本体ソースのSHA-256を結果に記録し、実行中に本体が変更された場合は失敗します。
