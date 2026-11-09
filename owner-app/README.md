# パレあそび管理室 1.1.0

Android 8.0以降向けの、作者専用のネイティブアプリです。一般公開されるAPKにも管理用キーやCloudflare APIトークンは含みません。

## 使い方

1. 署名済みの `パレあそび管理室_1.1.0.apk` をインストールします。
2. お問い合わせ管理に使っている64文字の管理用キーを貼り付けます。管理用テキストファイルから読み込むこともできます。
3. 「接続する」を押すと、作者権限を確認したあとキーを端末内のAndroid Keystoreで暗号化して保存します。
4. 画面下の「概況」「訪問」「使用量」「問合せ」「分析」「設定」で切り替えます。上の「更新」で最新情報を取得します。

サイトのバージョンと、このアプリのバージョンは別々に表示します。問い合わせへの返答は既存のブラウザー管理画面で行います。キーをURLへ自動で入れることはありません。

パレあそび分析では、サイト全体と各ゲームのページ表示・アクセス・ゲーム開始・遊んだ端末の延べ数・セッション・クリア数・画面別広告表示とクリックを確認できます。訪問端末数・遊んだ端末数は日ごとに集計したブラウザー単位の延べ数であり、実人数や期間内の重複を除いた人数ではありません。DNT/GPCを有効にした訪問は記録しません。広告表示は広告配信側の実表示イベントを接続した場合のみ集計します。訪問統計は日本時間、Cloudflare無料枠の集計はUTCです。取得できない値は0に置き換えず「未取得」と表示します。

## Build

- JDK 17
- Gradle 8.9
- Android Gradle Plugin 8.7.3
- compile/target SDK 35, Build Tools 35.0.0, min SDK 26
- No third-party runtime libraries or WebView

From `owner-app/`, run `gradle :app:assembleRelease :app:lintRelease`.
The GitHub workflow builds **an unsigned release APK** and packages the official Android `apksigner.jar` for local signing. The unsigned APK cannot be installed.

Sign locally using a persistent private keystore outside this public repository:

```text
java -jar apksigner.jar sign --ks /private/path/owner-release.jks --ks-key-alias nanpure-owner --out パレあそび管理室_1.1.0.apk pareasobi-owner-1.1.0-unsigned.apk
java -jar apksigner.jar verify --verbose --print-certs パレあそび管理室_1.1.0.apk
```

Keep the private keystore for subsequent updates. Never commit signing keys, keystore passwords, owner keys, or Cloudflare credentials. No private key is uploaded by the build workflow.

## Data and network boundary

- Owner API: `/api/owner/overview`, `/api/admin`, and `/api/pare/analytics` (GET only). Public analytics events are aggregated by the API; the app reads them using the existing owner key.
- Public site version: `https://atugari.github.io/nanpure-version.json`, without an authorization header.
- HTTPS only; redirects are rejected, so bearer credentials cannot follow a redirect.
- The encrypted owner key is excluded from cloud backup and device transfer.
- Inquiries are held in memory only. The native app retrieves aggregated analytics over HTTPS. It does not embed an analytics SDK or advertising SDK and does not collect visitor data.
- The app suppresses screenshots and task-switcher snapshots that could include private inquiries.

## Verification

CI compiles the release APK and runs Android Lint. Install/runtime behavior still needs an Android device or emulator check. The final signed artifact must pass `apksigner verify` before distribution.

## Official references

- Android command-line build and signing: https://developer.android.com/build/building-cmdline
- APK signature verification: https://developer.android.com/tools/apksigner
- AGP 8.7 compatibility: https://developer.android.com/build/releases/agp-8-7-0-release-notes
- Android Keystore: https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec
