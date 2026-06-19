# SNS scripts

実行手順の正本は `docs/sns-runbook.md` です。このREADMEは、スクリプト単位の役割だけを残します。

SNS投稿、投稿文生成、画像生成、動画生成、予約投稿、自動投稿設定、削除、再投稿、復旧対応の前には、必ず次の順に確認します。

1. `docs/sns-posting-absolute-rules.md`
2. `docs/sns-runbook.md`
3. 誕生日数、ランキング、あるある、ミニキャラ、Reels動画を扱う場合は `docs/sns-birthday-number-content-guide.md`

このREADMEやスクリプトコメントが上記の正本と違う場合は、上記の正本を優先します。

120点と報告できるのは、正本ルール、承認ゲート、対象スクリプト、dry-run、必要なテスト、見た目確認、投稿URLまたは外部状態の確認が揃った場合だけです。どれか未確認なら、未確認点を明記し、完了扱いにしません。

## 現在の運用対象

- Threads
- Instagram

対象外媒体の再開予定がない手順や検証コマンドは残しません。

## 主なスクリプト

- `daily-oracle-post.js`: 朝投稿、月次カルーセル、木曜比較投稿の投稿文、画像パス、alt text、UTM付きURLを生成します。
- `run-scheduled-posts.js`: Render Cronから対象時刻の投稿だけを実行します。
- `audit-social-drafts.js`: 投稿文、UTM、画像、alt text、ハッシュタグ、重複を検査します。
- `prepare-kpi-review.js`: KPI確認用CSVを生成します。
- `threads-tool.js`: Threadsの接続確認と手動テスト用です。
- `instagram-client.js`: Instagram投稿APIの共通処理です。
- `post-approved-reels.js`: 承認済みReels manifestだけを投稿対象にする唯一の動画投稿入口です。
- `post-instagram-reels-20260614-designed.js`: 旧Instagram Reels復旧コマンド互換です。固定配列は持たず、`post-approved-reels.js` に委譲します。
- `post-threads-videos-20260614-designed.js`: 旧Threads動画復旧コマンド互換です。固定配列は持たず、`post-approved-reels.js` に委譲します。
- `birthday-mini-family.js`: 誕生日数ミニキャラの1〜9系還元の正本です。生成スクリプトごとの独自計算はしません。

投稿素材は主に `scripts/social/content/`、`images/social/instagram/oracle/`、`images/social/instagram/誕生日数×ルノルマン/`、`videos/social/instagram/【インスタ】あるある・ランキング系/` に置きます。夜の通常枠は動画を基本にし、静止画像・カルーセルはユーザーが明示した場合だけ例外にします。

## 通常確認

```powershell
npm run check
npm run social:audit -- --from=2026-06-06 --to=2026-06-10 --platforms=threads,instagram
node scripts/social/run-scheduled-posts.js --once --dry-run --only-kind=all
```

## Render本番

Threads / Instagram本番投稿はRender Cron JobまたはGitHub Actionsのクラウド実行だけで行います。現在のジョブ名、workflow名、実行時刻は `docs/sns-runbook.md` とクラウド設定で確認します。

```text
SOCIAL_PLATFORMS=threads,instagram
node scripts/social/run-scheduled-posts.js --once --only-kind=all
```

ローカルWindowsのTask Scheduler、常駐PowerShell、ローカルdaemon、Codex実行中の一時プロセスはSNS運用に使いません。

## 手動投稿とプレビュー

通常端末では、プレビュー後に `yes` を入力しない限り実投稿しません。

夜の通常枠の動画投稿は、投稿する動画、順番、本文、公開URL、投稿時刻が確定している場合だけ、対象の動画投稿スクリプトで実行します。Instagramだけ、またはThreadsだけに片寄せした旧Reels運用は使いません。

動画実行前には、投稿前承認ゲートとして日時、platform、投稿種別、動画パス、動画数、公開URL、本文、ハッシュタグ、既知の制限、未確認点、リスクを提示します。承認前に `--yes` を使いません。

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
