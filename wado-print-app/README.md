# 漢字穴埋め 印刷帳 2.1.0

紙で解くための問題を生成する、独立したオフライン印刷ソフト。
Android APKとWindows x64 EXEを同じ画面・辞書で構築します。
ナンプレ帳の公開プレイ機能には組み込みません。

## 機能

- 難しさ10段階、使う熟語2〜4語。保存上限500問。
- A4に1・2・4・6問。ヒントなしなら8・9・12問。
- 「余白を減らす」では6問の盤面も大きく配置。
- 漢字の大きさと太さを各3段階から選択。同梱ゴシック体と字形寸法で調整。
- スマホのプレビューはA4全体を自動表示。横幅・100%表示にも切替可能。
- 分野・種類・意味の3段階ヒント。問題・ヒント・解答例を別々に印刷。
- JSONファイルへの保存と読み込み。2.0.0の問題帳は新設定を補って読み込み可能。
- Androidの印刷/PDF保存とファイル選択、Windowsの印刷/PDF保存とファイル選択に対応。

## 構築

リポジトリのルートから `python3 wado-print-app/build_web.py` を実行します。
辞書は既存の `scripts/client-overrides/public/notebook/wado-data.json` を利用します。
フォント、ヒント、ライセンスは `web-source` に収録しています。

Android: Java 17、Gradle 8.9、Android SDK 35で `gradle :app:assembleRelease`。
Windows: .NET 8 SDKで `dotnet publish windows/WadoPrint.csproj -c Release -r win-x64 --self-contained true`。
Windows版には.NETランタイムを同梱し、表示にはMicrosoft Edge WebView2 Runtimeを使用します。
APKはCIでは未署名のまま取り出し、ローカルに保管した専用の鍵で署名します。
鍵・パスワードはリポジトリ、CI成果物、配布ソフトに含めません。

出題辞書、語彙、フォントの全文ライセンスは `web-source/licenses.txt` にあります。
