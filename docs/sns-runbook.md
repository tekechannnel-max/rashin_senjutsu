# SNS運用 Runbook

SNS投稿、投稿文生成、画像生成、予約投稿、自動投稿設定、削除、再投稿の前に、必ず `docs/sns-posting-absolute-rules.md` を先に読むこと。不明点、上限衝突、素材不足、投稿文未確定、外部操作の不可逆性がある場合は、推測で進めず停止して質問する。

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
20:00 JST: birthday_monthly_01_10 on 2026-06-05 and monthly 1st from 2026-07-01
21:00 JST: birthday_monthly_11_20 on 2026-06-05 and monthly 1st from 2026-07-01
22:00 JST: birthday_monthly_21_31 on 2026-06-05 and monthly 1st from 2026-07-01
20:00 JST: birthday_monthly_recovery_01_10 on 2026-06-07
21:00 JST: birthday_monthly_recovery_11_20 on 2026-06-07
22:00 JST: birthday_monthly_recovery_21_30 on 2026-06-07
23:00 JST: birthday_monthly_recovery_31 on 2026-06-07
20:00 JST: birthday_ranking one-off on 2026-06-08..2026-06-11
```

毎月1日以外の20:00「誕生日数あるある/ランキング」は、素材と投稿文が確定したものだけ一回限りで入れます。木曜20:00は比較系3種に差し替え、Threadsでは3枚画像投稿として扱います。同じ画像を毎週繰り返す設定にはしません。

毎月1日の月次カルーセル投稿と、毎月1日以外の20:00「誕生日数あるある/ランキング」は、絶対に同じ日に投稿しません。月次がある日は③の20:00投稿を入れず、月次がない日に③を入れます。

毎週木曜20:00は③の通常投稿ではなく、比較系3種のカルーセル投稿に差し替えます。Threadsでは3枚画像投稿として扱います。

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
SOCIAL_BIRTHDAY_MONTHLY_JUNE_DATE=2026-06-05
SOCIAL_BIRTHDAY_MONTHLY_MONTHLY_START_DATE=2026-07-01
SOCIAL_PAID_CTA_MODE=soft
SOCIAL_BOOTH_ENABLED=false
SOCIAL_UTM_CAMPAIGN=202605_prerelease
SOCIAL_STATELESS_MODE=true
SOCIAL_POST_GRACE_MINUTES=59
SOCIAL_THREADS_IMAGE_FALLBACK_TEXT=true
THREADS_CONTAINER_TIMEOUT_MS=120000
THREADS_POST_VERIFY_TIMEOUT_MS=120000
```

## 投稿ルール

- `oracle`: 毎朝8:00。画像は `images/social/instagram/oracle/NN.jpg`。
- `birthday_monthly`: 毎月1日。対象月の `images/social/instagram/generated-birthday/YYYY-MM/monthly/manifest.json` と画像が必要。
- `birthday_ranking`: 2026-06-08から2026-06-11の一回限り。ThreadsとInstagramに同じ趣旨で出し、ハッシュタグだけ分けます。
- 木曜20:00は `birthday_ranking` / `birthday_aruaru` より比較系3種を優先します。Threadsは3枚画像投稿。
- `empathy` / `difference` / `free_paid_compare` は手動投稿候補として残しますが、現行の自動投稿スケジュールには入れません。
- Threadsはハッシュタグ1個。Instagramは投稿種別ごとに最大5個。
- Instagram本文には長いURLを出さず、プロフィールリンク案内にします。
- カード意味と占い読みの共通基準は `docs/card-reading-meaning-grounding.md`、SNS固有ルールは `docs/sns-card-meaning-grounding.md` に従います。

## 確認コマンド

```powershell
npm run check
npm run social:audit -- --from=2026-06-01 --to=2026-07-01 --platforms=threads,instagram
npm run social:draft -- --date=2026-06-06 --kind=birthday_ranking --platforms=threads,instagram
node scripts/social/run-scheduled-posts.js --dry-run
```

## KPI

週次KPIテンプレートは次で作ります。

```powershell
npm run social:kpi-template -- --from=2026-06-01 --to=2026-06-07 --platforms=threads,instagram
```

見る順番は `views`、`replies`、`reposts_or_shares`、`saves`、`profile_visits`、`new_follows`、`link_clicks`、`free_reading_starts`、`paid_deep_reading_starts`、`paid_completions`。`oracle` はリンククリック、`birthday_monthly` と `birthday_ranking` は保存とプロフィール訪問を主指標にします。

## 完了条件

- `npm run check` が通る。
- 対象期間の `social:audit` が errors 0 / warnings 0。
- 投稿予定時刻のdry-runで `due` が想定どおり。
- Render環境変数がThreads / Instagramのみで揃っている。
- 実投稿結果が `posted`、または重複防止の `existing_threads_post` / `existing_instagram_post` で確認できる。
