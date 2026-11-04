# 複数スマホ登録への移行に伴う在庫保持の検査

本体の `RefillVault.java` を改変せずコンパイルし、旧共有登録の配送情報を解除しても完成済みの盤面が失われないことを検査します。Android の SQLite API を最小限の Java adapter に置き換え、SQL は Python 標準の `sqlite3` が一時データベースで実行します。実際のテーブル制約、トリガー、トランザクションが動きます。

## 実行

Python 3、JDK 17、Gson JAR が必要です。追加の SQLite パッケージやネットワーク接続は不要です。アプリのディレクトリで実行する例：

```sh
python3 tests/multi-registration/run-vault.py \
  --jdk /path/to/jdk-17 \
  --gson /path/to/gson-2.10.jar \
  --out /tmp/refill-vault-migration-results.json
```

`--jdk` は `JAVA_HOME`、`--gson` は `GSON_JAR` でも指定できます。`--app` で対象アプリの場所を変更できます。`--out` を省略すると結果 JSON を標準出力に出します。コンパイル先と SQLite データベースは一時ディレクトリに作成し、実行後に削除します。

## 確認する動作

1. 旧登録の配送情報を解除しても、完成盤面の内容・件数・条件別集計・バイト数・送信済み件数が残る。
2. 別接続先の盤面と配送情報には影響しない。
3. 新 token が在庫を使うときは、新しい job / lease を取得する。
4. 古い配送の遅延 ACK が、新登録の配送情報やその盤面を削除しない。
5. 異なる所有者の配送は解除されず、同じ旧登録の解除を繰り返しても安全に終わる。
6. 不一致の接続先を指定して配送を解除できない。
7. SQLite の解除操作が失敗してもデータが残り、同じ解除を再試行できる。
8. 別 JVM から同じデータベースを開き直しても、盤面と新登録の配送情報が残る。

結果には検査数、assertion 数、対象ソースの SHA-256、SQLite のバージョンを記録します。検査中に本体ソースが変更された場合は失敗します。コンパイルと各 JVM の実行には、それぞれ 45 秒の上限があります。

## 範囲と限界

対象は `RefillVault` の実 SQL と所有者判定です。Android SQLite ランタイム、実機インストール、画面、通信 API、実際の端末データは使いません。空き容量はテスト用の固定値とし、ディスク不足検知や Android のファイル管理の再現試験は行いません。書き込み失敗は狙った SQL 操作に対して注入します。

`RefillRunner.prepareEnrollmentStock` の処理順序、生成処理との排他制御、Service / Job の起動順は、この SQL 検査の実行対象に含まれません。登録候補・設定保持・SharedPreferences の失敗と再試行は `tests/bootstrap/run.py` が担当します。JSON と Context の共通 adapter は `tests/bootstrap/src` のものを使用します。
