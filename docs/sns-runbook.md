# SNS運用 Runbook

SNS投稿、投稿文生成、画像生成、動画生成、予約投稿、自動投稿設定、削除、再投稿の前に、必ず `docs/sns-posting-absolute-rules.md` を先に読むこと。不明点、上限衝突、素材不足、投稿文未確定、外部操作の不可逆性がある場合は、推測で進めず停止して質問する。

このファイルを、羅針占術のThreads / Instagram自動投稿の正本にします。

## 現行方針

- 本番自動投稿はThreads / Instagramのみ。
- 実行はRender Cron Job `rashin-threads-scheduler`。
- 対象外媒体の再開前提手順は残しません。
- ローカルWindowsのTask Scheduler、常駐PowerShell、daemon運用は使いません。
- APIキー、アクセストークン、個人情報はGit管理ファイル、README、投稿台帳、ログに保存しません。

## 投稿スケジュール

```text
08:00 JST: oracle
20:00 JST: daily birthday reel video
21:00 JST: daily birthday reel video
22:00 JST: daily birthday reel video
```

夜は画像投稿を一切しません。月初画像、木曜比較画像、ランキング画像、カルーセル画像は夜枠に入れません。

夜のリール動画は `videos/social/instagram/【インスタ】あるある・ランキング系/` を正本にし、Threads / Instagramの両方に投稿します。リール動画内の文字隠し、中央隠し、スタンプ隠し、絵文字隠しは入れません。

## Render設定

```text
PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com
THREADS_EXPECTED_USERNAME=sensai_teke
THREADS_USER_ID=<Renderにだけ保存する>
THREADS_ACCESS_TOKEN=<Renderにだけ保存する>
INSTAGRAM_ENABLED=true
INSTAGRAM_USER_ID=<Renderにだけ保存する>
INSTAGRAM_ACCESS_TOKEN=<Renderにだけ保存する>
INSTAGRAM_EXPECTED_USERNAME=sensai_teke
INSTAGRAM_API_VERSION=v23.0
SOCIAL_AUTOMATED_POSTING_ENABLED=true
SOCIAL_PLATFORMS=threads,instagram
SOCIAL_THREADS_HASHTAG=#占い師のつぶやき
SOCIAL_ORACLE_TIME=08:00
SOCIAL_PAID_CTA_MODE=soft
SOCIAL_BOOTH_ENABLED=false
SOCIAL_UTM_CAMPAIGN=202605_prerelease
SOCIAL_STATELESS_MODE=true
SOCIAL_CLOUD_SCHEDULER=true
SOCIAL_POST_GRACE_MINUTES=59
SOCIAL_REEL_POST_GRACE_MINUTES=59
SOCIAL_REEL_CATCHUP_HOURS=8
SOCIAL_REEL_PUBLIC_ORIGIN=https://raw.githubusercontent.com/tekechannnel-max/rashin_senjutsu/main
SOCIAL_THREADS_IMAGE_FALLBACK_TEXT=true
THREADS_CONTAINER_TIMEOUT_MS=120000
THREADS_POST_VERIFY_TIMEOUT_MS=120000
```

Render Cron Job `rashin-threads-scheduler` の実行コマンドは次にします。朝占いと夜リールを同じクラウド実行でdue確認します。

```text
npm run social:cloud-run-due
```

## 投稿ルール

- `oracle`: 毎朝8:00。画像は `images/social/instagram/oracle/NN.jpg`。Threads / Instagramの両方に投稿します。
- `daily birthday reel video`: 毎日20:00 / 21:00 / 22:00。動画は `videos/social/instagram/【インスタ】あるある・ランキング系/`。Threads / Instagramの両方に投稿します。
- `birthday_monthly` / `birthday_ranking` / `rashin_point` / `empathy` / `difference` / `free_paid_compare` は過去検証や手動素材確認用として残っていても、現行の自動投稿スケジュールには入れません。
- Threadsはハッシュタグ1個。Instagramは投稿種別ごとに最大5個。
- Instagram本文には長いURLを出さず、プロフィールリンク案内にします。
- カード意味と占い読みの共通基準は `docs/card-reading-meaning-grounding.md`、SNS固有ルールは `docs/sns-card-meaning-grounding.md` に従います。

## 確認コマンド

```powershell
npm run check
npm run social:audit -- --from=2026-06-13 --to=2026-06-13 --platforms=threads,instagram
node scripts/social/run-scheduled-posts.js --dry-run --only-kind=oracle
node scripts/social/post-daily-birthday-reels.js --dry-run --platforms=threads,instagram
npm run social:cloud-run-due -- --dry-run
```

## KPI

週次KPIテンプレートは次で作ります。

```powershell
npm run social:kpi-template -- --from=2026-06-01 --to=2026-06-07 --platforms=threads,instagram
```

見る順番は `views`、`replies`、`reposts_or_shares`、`saves`、`profile_visits`、`new_follows`、`link_clicks`、`free_reading_starts`、`paid_deep_reading_starts`、`paid_completions`。`oracle` はリンククリック、夜リールは再生数、保存、プロフィール訪問を主指標にします。

## 完了条件

- `npm run check` が通る。
- 対象期間の `social:audit` が errors 0 / warnings 0。
- 投稿予定時刻のdry-runで `due` が想定どおり。
- Render Cron Job `rashin-threads-scheduler` のコマンドが `npm run social:cloud-run-due`。
- Render環境変数がThreads / Instagramのみで揃っている。
- 実投稿結果が `posted`、または重複防止の `existing_threads_post` / `existing_instagram_post` で確認できる。
