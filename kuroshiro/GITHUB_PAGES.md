# GitHub Pages 公開

1. GitHub のリポジトリへこのプロジェクトをアップロードします。
2. Settings → Pages → Source を「GitHub Actions」にします。
3. AI対戦だけなら追加設定なしで動きます。
4. ランダム対戦・ルーム対戦も使う場合は、サーバー版を Vercel 等へデプロイし、
   GitHub の Settings → Secrets and variables → Actions → Variables に
   `VITE_API_BASE_URL` を追加して、サーバー版のURL（例: `https://example.vercel.app`）を設定します。

GitHub Pages 自体は静的ホスティングなので、`/api/match` と `/api/rtc` は実行できません。
このプロジェクトではフロント側のAPI接続先を分離し、GitHub Pagesから外部サーバーへ接続できるようにしています。
