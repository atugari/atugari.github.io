# 漢字穴埋め 印刷帳 2.3.0

紙で解くための問題を生成する、独立したオフライン印刷ソフト。
Android APKとWindows x64 EXEを同じ画面・辞書で構築します。
ナンプレ帳の公開プレイ機能には組み込みません。

## 機能

- 難しさ10段階、使う熟語2〜4語。保存上限500問。
- A4に1・2・4・6問。ヒントなしなら8・9・12問。
- 「余白を減らす」では6問の盤面も大きく配置。
- 漢字の大きさと太さを各3段階から選択。同梱ゴシック体と字形寸法で調整。
- スマホのプレビューはA4全体を自動表示。横幅・100%表示にも切替可能。
- 235語に705件の独自ヒントを追加。場面・用途・特徴・連想・対比などの視点を自動で分散します。
- 各問題の候補から使うヒントを1つ選択。「難しめ／ふつう／やさしめ」の目安と視点を表示します。
- 問題・難しさ別ヒント・解答例を別々に印刷。選んだヒントは問題帳に保存します。
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

## 検証

Windows版はEXEを起動し、20問を2ページのA4 PDFに出力する自動チェックを行います。
Android API 35のエミュレータでは、問題生成・同梱フォント・A4全体表示・ネイティブ印刷画面・保存ダイアログを自動確認します。
AndroidのPDF保存も端末の印刷画面から実行し、出力した20問がA4縦2ページになっていることと、文字や枠の欠けがないことをPDFの読み込みと画像化で確認しました。
PDF保存画面の操作はOS側の選択状態で変わるため、自動チェックでは印刷画面を開くところまでを扱います。
保存したAndroid PDFのページ数・用紙サイズは `python3 tools/check-android-pdf.py <PDFファイル>` でも確認できます（pypdfが必要）。
