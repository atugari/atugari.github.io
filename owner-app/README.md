# ナンプレ帳 作者室 1.0.0

Android 8.0以降向けの、作者専用のネイティブアプリです。一般公開されるAPKにも管理用キーやCloudflare APIトークンは含みません。

## 使い方

1. 署名済みの `ナンプレ帳_作者室_1.0.0.apk` をインストールします。
2. お問い合わせ管理に使っている64文字の管理用キーを貼り付けます。管理用テキストファイルから読み込むこともできます。
3. 「接続する」を押すと、作者権限を確認したあとキーを端末内のAndroid Keystoreで暗号化して保存します。
4. 画面下の「概況」「訪問」「使用量」「問合せ」「設定」で切り替えます。上の「更新」で最新情報を取得します。

サイトのバージョンと、このアプリのバージョンは別々に表示します。問い合わせへの返答は既存のブラウザー管理画面で行います。キーをURLへ自動で入れることはありません。

訪問端末数はブラウザー単位の目安であり、実人数ではありません。訪問統計は日本時間、Cloudflare無料枠の集計はUTCです。取得できない値は0に置き換えず「未取得」と表示します。

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
java -jar apksigner.jar sign --ks /private/path/owner-release.jks --ks-key-alias nanpure-owner --out ナンプレ帳_作者室_1.0.0.apk nanpure-owner-1.0.0-unsigned.apk
java -jar apksigner.jar verify --verbose --print-certs ナンプレ帳_作者室_1.0.0.apk
```

Keep the private keystore for subsequent updates. Never commit signing keys, keystore passwords, owner keys, or Cloudflare credentials. No private key is uploaded by the build workflow.

## Data and network boundary

- Owner API: `https://puzzle-api.puzzle-hub-4826.workers.dev/api/owner/overview` and `/api/admin` (GET only).
- Public site version: `https://atugari.github.io/nanpure-version.json`, without an authorization header.
- HTTPS only; redirects are rejected, so bearer credentials cannot follow a redirect.
- The encrypted owner key is excluded from cloud backup and device transfer.
- Inquiries are held in memory only. No analytics SDK, advertising SDK, or visit-tracking call is present in this author app.
- The app suppresses screenshots and task-switcher snapshots that could include private inquiries.

## Verification

CI compiles the release APK and runs Android Lint. Install/runtime behavior still needs an Android device or emulator check. The final signed artifact must pass `apksigner verify` before distribution.

## Official references

- Android command-line build and signing: https://developer.android.com/build/building-cmdline
- APK signature verification: https://developer.android.com/tools/apksigner
- AGP 8.7 compatibility: https://developer.android.com/build/releases/agp-8-7-0-release-notes
- Android Keystore: https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec
