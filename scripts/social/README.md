# SNS scripts

実行手順の正本は `docs/sns-runbook.md` です。このREADMEは、スクリプト単位の役割だけを残します。

## 現在の運用対象

- Threads
- Instagram

対象外媒体の再開予定がない手順や検証コマンドは残しません。

## 主なスクリプト

- `daily-oracle-post.js`: 投稿文、画像パス、alt text、UTM付きURLを生成します。
- `run-cloud-scheduled-posts.js`: Render CronまたはGitHub Actionsから朝占いと夜リール動画をまとめてdue確認します。
- `run-scheduled-posts.js`: 朝占い投稿だけを実行します。
- `post-daily-birthday-reels.js`: 夜リール動画をThreads / Instagramに投稿します。
- `generate-birthday-reels-20260613.js`: 2026-06-13分の夜リール動画を生成します。
- `audit-social-drafts.js`: 投稿文、UTM、画像、alt text、ハッシュタグ、重複を検査します。
- `prepare-kpi-review.js`: KPI確認用CSVを生成します。
- `threads-tool.js`: Threadsの接続確認と手動テスト用です。
- `instagram-client.js`: Instagram投稿APIの共通処理です。

投稿素材は主に `scripts/social/content/` と `images/social/instagram/generated-birthday/` に置きます。

## 通常確認

```powershell
npm run check
npm run social:audit -- --from=2026-06-13 --to=2026-06-13 --platforms=threads,instagram
node scripts/social/run-scheduled-posts.js --once --dry-run --only-kind=oracle
node scripts/social/post-daily-birthday-reels.js --dry-run --platforms=threads,instagram
npm run social:cloud-run-due -- --dry-run
```

## Render本番

Threads / Instagram本番投稿はRender Cron Job `rashin-threads-scheduler` が実行します。

```text
SOCIAL_PLATFORMS=threads,instagram
npm run social:cloud-run-due
```

ローカルWindowsのTask Scheduler、常駐PowerShell、ローカルdaemonはSNS運用に使いません。

## 手動投稿とプレビュー

通常端末では、プレビュー後に `yes` を入力しない限り実投稿しません。

```powershell
npm run social:draft -- --date=2026-06-13 --kind=oracle --platforms=threads,instagram
node scripts/social/post-daily-birthday-reels.js --dry-run --platforms=threads,instagram
```

CI、Render Cron、確認済みの手動実行だけ `--yes` を使います。

## 緊急時

予定時刻の範囲内で未投稿分だけ実行します。

```powershell
npm run social:run-due
npm run social:cloud-run-due -- --dry-run
```

種類を絞る例:

```powershell
node scripts/social/run-scheduled-posts.js --once --only-kind=oracle
```

## 接続確認

```powershell
npm run threads:doctor
npm run instagram:doctor
```

`THREADS_ACCESS_TOKEN` と `INSTAGRAM_ACCESS_TOKEN` はGit、README、チャット、ログに書きません。Render環境変数だけに保存します。
