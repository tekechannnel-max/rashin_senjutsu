# SNS scripts

実運用の正本は `docs/sns-runbook.md`。このREADMEはスクリプト利用メモだけにする。

## 役割

- `daily-oracle-post.js`: Threads/Bluesky/X向けの当日投稿文、画像、alt textを作る
- `run-scheduled-posts.js`: JSTの予定時刻に来た投稿だけThreads/Blueskyへ送る
- `export-x-drafts.js`: X手動投稿用の下書きを出す
- `threads-tool.js`: Threads token確認、OAuth、手動投稿テストを行う
- `bluesky-tool.js`: Blueskyアプリパスワード確認、画像付き手動投稿テストを行う
- `audit-social-drafts.js`: 文字数、タグ、CTA、禁止表現を機械検査する

## 通常確認

```powershell
npm run check
npm run social:audit -- --from=2026-05-13 --to=2026-05-29 --platforms=threads,bluesky,x
npm run threads:doctor
npm run bluesky:doctor
node scripts/social/run-scheduled-posts.js --dry-run
```

## Threads下書き

```powershell
npm run social:draft
npm run social:threads:draft
npm run social:write
```

生成物は `data/social-posts/` に出る。このディレクトリはgitignore対象。

## Render本番

Threads本番投稿はRender Cron Job `rashin-threads-scheduler` が実行する。
Bluesky本番投稿も `SOCIAL_PLATFORMS=threads,bluesky` のとき同じRender Cron Jobが実行する。

```text
node scripts/social/run-scheduled-posts.js --once --only-kind=all
```

Render schedule:

```text
0,5,10,15,20,25,30 22,11 * * *
```

ローカルWindowsのTask Scheduler、可視PowerShell、daemonは使わない。

## X下書き

Xは現在、自動投稿しない。下書きだけ生成する。

```powershell
npm run social:x:today
npm run social:x:drafts -- --from=2026-05-13 --to=2026-05-29 --kind=all
```

出力は `data/social-posts/x-drafts/`。本文、画像URL、alt textを人間が確認してXへ投稿する。

## Bluesky確認

```powershell
npm run social:bluesky:draft
npm run bluesky:doctor
```

実投稿には `BLUESKY_IDENTIFIER=tekesensai.bsky.social`、`BLUESKY_APP_PASSWORD`、`BLUESKY_EXPECTED_HANDLE=tekesensai.bsky.social` が必要。アプリパスワードはGitやmdに書かず、Render環境変数にだけ保存する。

## 緊急時だけ

予定時刻の範囲内で未投稿分だけ実行:

```powershell
npm run social:run-due
```

種類を絞る:

```powershell
node scripts/social/run-scheduled-posts.js --once --only-kind=oracle
node scripts/social/run-scheduled-posts.js --once --only-kind=concept
```

強制投稿は通常禁止。使う前に対象日、対象kind、既存投稿、本文を確認する。

```powershell
node scripts/social/run-scheduled-posts.js --force-kind=oracle
node scripts/social/run-scheduled-posts.js --force-kind=concept
```

## Threads token

ローカル診断用。Render本番では `THREADS_ACCESS_TOKEN` をRender環境変数に入れる。

```powershell
npm run threads:doctor
```

token作成が必要な場合:

```powershell
npm run threads:connect
node scripts/social/threads-tool.js save-token --token="<token-from-user-token-generator>"
```

`THREADS_ACCESS_TOKEN` はmd、Git、チャットに書かない。
