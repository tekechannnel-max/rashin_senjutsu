# SNS scripts

実行手順の正本は `docs/sns-runbook.md` です。このREADMEは、スクリプト単位の役割だけを残します。

## 現在の運用対象

- Threads
- Instagram

対象外媒体の再開予定がない手順や検証コマンドは残しません。

## 主なスクリプト

- `daily-oracle-post.js`: 投稿文、画像パス、alt text、UTM付きURLを生成します。
- `run-scheduled-posts.js`: Render Cronから対象時刻の投稿だけを実行します。
- `audit-social-drafts.js`: 投稿文、UTM、画像、alt text、ハッシュタグ、重複を検査します。
- `prepare-kpi-review.js`: KPI確認用CSVを生成します。
- `threads-tool.js`: Threadsの接続確認と手動テスト用です。
- `instagram-client.js`: Instagram投稿APIの共通処理です。

投稿素材は主に `scripts/social/content/` と `images/social/instagram/generated-birthday/` に置きます。

## 通常確認

```powershell
npm run check
npm run social:audit -- --from=2026-06-06 --to=2026-06-09 --platforms=threads,instagram
npm run social:draft -- --date=2026-06-06 --kind=birthday_ranking --platforms=threads,instagram
node scripts/social/run-scheduled-posts.js --once --dry-run --only-kind=all
```

## Render本番

Threads / Instagram本番投稿はRender Cron Job `rashin-threads-scheduler` が実行します。

```text
SOCIAL_PLATFORMS=threads,instagram
node scripts/social/run-scheduled-posts.js --once --only-kind=all
```

ローカルWindowsのTask Scheduler、常駐PowerShell、ローカルdaemonはSNS運用に使いません。

## 手動投稿とプレビュー

通常端末では、プレビュー後に `yes` を入力しない限り実投稿しません。

```powershell
npm run social:draft -- --date=2026-06-06 --kind=birthday_ranking --platforms=threads,instagram
npm run social:post -- --date=2026-06-06 --kind=birthday_ranking --platforms=threads,instagram
```

CI、Render Cron、確認済みの手動実行だけ `--yes` を使います。

## 緊急時

予定時刻の範囲内で未投稿分だけ実行します。

```powershell
npm run social:run-due
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
