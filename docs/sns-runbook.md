# SNS運用 Runbook

SNS投稿、投稿文生成、画像生成、予約投稿、自動投稿設定、削除、再投稿の前に、必ず `docs/sns-posting-absolute-rules.md` を先に読むこと。不明点、上限衝突、素材不足、投稿文未確定、外部操作の不可逆性がある場合は、推測で進めず停止して質問する。

このファイルを、羅針占術のThreads / Instagram自動投稿の運用手順にします。投稿素材の正本は `docs/sns-posting-absolute-rules.md` の指定フォルダだけです。

## 現行方針

- 本番自動投稿はThreads / Instagramのみ。
- 実行はRender Cron Job / GitHub Actionsのクラウド実行、またはユーザーが許可したローカルCodex常駐 / 予約実行。
- 対象外媒体の再開前提手順は残さない。
- ローカルCodex常駐 / 予約実行は正式経路として許可する。実行時は `SOCIAL_LOCAL_CODEX_AUTOMATION=true` または `SOCIAL_CODEX_RESERVATION_ACTIVE=true` を明示する。
- APIキー、アクセストークン、個人情報はGit管理ファイル、README、投稿台帳、ログに保存しない。
- 夜の通常枠は動画を標準にし、InstagramはReels、Threadsは同じ動画の動画投稿として扱う。
- 誕生日数SNSのミニキャラは `docs/sns-birthday-number-content-guide.md` と `scripts/social/birthday-mini-family.js` だけを正本にする。

## 標準作業フロー

SNS投稿、投稿文生成、画像生成、動画生成、予約投稿、自動投稿設定、削除、再投稿、復旧対応は、次の順序で進めます。

1. `git status --short` と `git diff` で作業前状態を確認します。
2. `docs/sns-posting-absolute-rules.md` を読みます。
3. このRunbookを読みます。
4. 誕生日数、ランキング、あるある、ミニキャラ、Reels動画を扱う場合は `docs/sns-birthday-number-content-guide.md` を読みます。
5. 最新指示から、投稿日時、媒体、素材、順番、本文、ハッシュタグ、公開URL、外部操作の有無を確定します。
6. 未確定があれば停止して質問します。
7. 生成・編集を行う前に、正本素材、出力先、上書き有無を確認します。
8. 外部投稿、削除、再投稿、予約変更、自動投稿設定変更の前に、投稿前承認ゲートを提示します。
9. 実行後に投稿URL、ログ、台帳、重複有無、失敗検知手順を確認します。
10. 作業後に `git status --short` と `git diff` を確認し、変更範囲、検証結果、未確認点を報告します。

この順序を、過去のチャット、古いJSON、古いスクリプト、ローカルdry-run結果で短縮しません。

## 投稿スケジュール

```text
08:00 JST:
  oracle
  素材: images/social/instagram/oracle/

20:00 / 21:00 / 22:00 JST:
  あるある・ランキング系の動画投稿
  対象: Threads / Instagram
  Instagram: Reels
  Threads: 動画投稿
  素材: videos/social/instagram/【インスタ】あるある・ランキング系/
  備考: 静止画像・カルーセルはユーザーが明示した場合だけ例外

木曜日 20:00 JST:
  比較系3枚カルーセル
  対象: Threads / Instagram
  素材:
    images/social/instagram/difference.jpg
    images/social/instagram/free-paid-compare.jpg
    images/social/instagram/rashin_point.jpg

毎月1日 20:00 / 21:00 / 22:00 / 23:00 JST:
  誕生日数×ルノルマンの月次投稿
  対象: Threads / Instagram
  素材: images/social/instagram/誕生日数×ルノルマン/
```

毎月1日の夜4枠を最優先にします。毎月1日は、夜の通常投稿と木曜日20:00の比較系投稿を入れません。

木曜日20:00は比較系3枚カルーセルを優先します。木曜日21:00 / 22:00は通常の生まれ日リール枠です。木曜日20:00に日次リールを入れず、23:00の日次リールも作りません。

## Render / GitHub Actions設定

```text
PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com
THREADS_EXPECTED_USERNAME=sensai_teke
THREADS_USER_ID=<クラウドSecretにだけ保存する>
THREADS_ACCESS_TOKEN=<クラウドSecretにだけ保存する>
INSTAGRAM_ENABLED=true
INSTAGRAM_USER_ID=<クラウドSecretにだけ保存する>
INSTAGRAM_ACCESS_TOKEN=<クラウドSecretにだけ保存する>
INSTAGRAM_EXPECTED_USERNAME=sensai_teke
INSTAGRAM_API_VERSION=v23.0
SOCIAL_AUTOMATED_POSTING_ENABLED=true
SOCIAL_LOCAL_CODEX_AUTOMATION=true
SOCIAL_CODEX_RESERVATION_ACTIVE=true
SOCIAL_PLATFORMS=threads,instagram
SOCIAL_THREADS_HASHTAG=#占い師のつぶやき
SOCIAL_ORACLE_TIME=08:00
SOCIAL_BIRTHDAY_MONTHLY_MONTHLY_START_DATE=2026-07-01
SOCIAL_PAID_CTA_MODE=soft
SOCIAL_BOOTH_ENABLED=false
SOCIAL_UTM_CAMPAIGN=202605_prerelease
SOCIAL_STATELESS_MODE=true
SOCIAL_POST_GRACE_MINUTES=59
SOCIAL_INSIGHTS_COLLECTION_ENABLED=false
SOCIAL_VIDEO_PDCA_AUTOMATION=false
SOCIAL_VIDEO_PDCA_APPLY=true
SOCIAL_VIDEO_INSIGHTS_SINCE_DAYS=14
SOCIAL_VIDEO_INSIGHT_PLATFORMS=threads,instagram
SOCIAL_VIDEO_PDCA_FEEDBACK_FILE=data/social-posts/pdca/video-insights-feedback.json
INSTAGRAM_REELS_INSIGHT_METRICS=views,reach,likes,comments,saved,shares,total_interactions
THREADS_INSIGHT_METRICS=views,likes,replies,reposts,quotes,shares
SOCIAL_THREADS_IMAGE_FALLBACK_TEXT=true
THREADS_CONTAINER_TIMEOUT_MS=120000
THREADS_POST_VERIFY_TIMEOUT_MS=120000
```

## 投稿ルール

- `oracle`: 毎朝8:00。画像は `images/social/instagram/oracle/NN.jpg`。Threads / Instagramの両方に投稿します。
- `birthday_monthly`: 毎月1日。対象月の `images/social/instagram/誕生日数×ルノルマン/YYYY-MM/monthly/` だけを素材正本にします。投稿順は表紙→誕生日順です。表紙込みで1投稿あたり最大10枚のため、`1-8` / `9-16` / `17-24` / `25-31` に分けます。指定フォルダー外の表紙、導入画像、別フォルダー画像、manifest内の別パスは使いません。
- 夜の生まれ日動画: 夜20:00 / 21:00 / 22:00。素材は `videos/social/instagram/【インスタ】あるある・ランキング系/` を正本にします。InstagramはReels、Threadsは動画投稿として扱います。ThreadsとInstagramに同じ趣旨で出し、ハッシュタグだけ分けます。自動リサーチ対象は `生まれ日あるある/取説`、`生まれ日グラフ(1〜31日全て網羅)`、`○○な生まれ日TOP5` です。
- 木曜20:00は夜の通常動画より比較系3種を優先します。Threadsは3枚画像投稿。
- `empathy` / `difference` / `free_paid_compare` は手動投稿候補として残しますが、現行の自動投稿スケジュールには入れません。
- Threadsはハッシュタグ1個。Instagramは投稿種別ごとに最大5個。
- ReelsはInstagram上の名称なので、Threadsでは同じ動画をThreads動画投稿として扱う。
- Instagram本文には長いURLを出さず、プロフィールリンク案内にする。
- カード意味と占い読みの共通基準は `docs/card-reading-meaning-grounding.md`、SNS固有ルールは `docs/sns-card-meaning-grounding.md` に従う。

## 誕生日数動画・ミニキャラ生成フロー

1. テーマ、順位、生まれ日、本文、投稿時刻、投稿媒体を確認します。
2. ミニキャラが出る場合は、必ず `scripts/social/birthday-mini-family.js` の `birthdayMiniFamilyForDay(day)` で1〜9系へ還元します。
3. 11日、22日、29日などの本文でマスターナンバーに触れる場合でも、ミニキャラは1桁還元後の系にします。
4. 生成スクリプト側で独自のミニキャラ計算、手入力の系指定、テーマや順位によるキャラ選定をしません。
5. 承認済みリールJSONの `designReview.miniCharacters` に、各順位の `day`、還元後の `family`、使用アセット名を残します。
6. `minicharaByNumber: true` だけでは確認済みにしません。投稿スクリプトと `npm run social:guard` が `birthday-mini-family.js` で照合できる状態にします。
7. 動画の保存CTAは「保存していつでも思い出してください。」を基本にします。
8. 羅針占術への誘導は保存CTAの後に置き、無料鑑定から必要な方だけ深掘り鑑定へ進める導線にします。
9. 生成後に、タイトル、順位、生まれ日、理由、保存CTA、羅針占術誘導が読めることをスクリーンショットまたは動画フレームで確認します。
10. 文字と模様、背景、ミニキャラ、装飾が重なって読みにくい場合は不合格にします。

## 投稿前承認ゲート

外部投稿、削除、再投稿、予約変更、自動投稿設定変更の前に、次を提示して明確な承認を得ます。

```text
日時:
platform:
投稿種別:
素材パス:
素材数:
公開URL:
本文:
ハッシュタグ:
既知の制限:
未確認点:
リスク:
```

「進めてよろしいです」「そのようにしてください」などの承認は、このゲートで提示した内容に対するものだけを承認扱いにします。ゲート提示前の曖昧な返事や、別件の承認を流用しません。

## 確認コマンド

```powershell
npm run check
npm run social:audit -- --from=2026-06-08 --to=2026-06-15 --platforms=threads,instagram
node scripts/social/run-scheduled-posts.js --once --dry-run --only-kind=all
npm run social:video-insights -- --dry-run --since-days=14 --platforms=threads,instagram
npm run social:video-pdca -- --write-feedback
node tests/social-posting.test.js
```

## KPI

週次KPIテンプレートは次で作ります。

```powershell
npm run social:kpi-template -- --from=2026-06-08 --to=2026-06-14 --platforms=threads,instagram
```

見る順番は `views`、`replies`、`reposts_or_shares`、`saves`、`profile_visits`、`new_follows`、`link_clicks`、`free_reading_starts`、`paid_deep_reading_starts`、`paid_completions`。`oracle` はリンククリック、夜投稿と月次投稿は保存とプロフィール訪問を主指標にします。

## 動画インサイトPDCA

夜の動画投稿は、投稿結果 `data/social-posts/approved-reels-results.json` の投稿IDを起点に、Instagram Reels / Threads動画のインサイトを収集します。実API取得は外部読み取りなので、`SOCIAL_INSIGHTS_COLLECTION_ENABLED=true` が明示されていない場合はスキップします。

```powershell
npm run social:video-insights -- --dry-run --since-days=14 --platforms=threads,instagram
$env:SOCIAL_INSIGHTS_COLLECTION_ENABLED='true'; npm run social:video-insights -- --live --since-days=14 --write-latest
npm run social:video-pdca -- --write-feedback
```

PDCA分析は、保存、シェア、返信/コメント、プロフィール訪問、再生/表示をスコア化し、`data/social-posts/pdca/video-insights-feedback.json` に次回用の改善指示を保存します。`scripts/social/auto-prepare-approved-reels.js` はこのフィードバックを読み、必須3系統（生まれ日あるある/取説、生まれ日グラフ、TOP5）を維持したまま、強かったネタ型を早い夜枠へ優先配置します。

ローカルCodex常駐/予約で投稿後PDCAまで自動化する場合は、投稿用の `SOCIAL_AUTOMATED_POSTING_ENABLED=true` に加えて、次を明示します。

```text
SOCIAL_LOCAL_CODEX_AUTOMATION=true
SOCIAL_VIDEO_PDCA_AUTOMATION=true
SOCIAL_INSIGHTS_COLLECTION_ENABLED=true
```

## 完了条件

- `npm run check` が通る。
- 対象期間の `social:audit` が errors 0 / warnings 0。
- 投稿予定時刻のdry-runで `due` が想定どおり。
- クラウド環境変数がThreads / Instagramのみで揃っている。
- 実投稿結果が `posted`、または重複防止の `existing_threads_post` / `existing_instagram_post` で確認できる。
- Reels動画や画像など見た目が関係する作業は、スクリーンショット、プレビュー、または動画フレームで可読性を確認している。
- 未確認の外部状態、権限、クラウドログ、投稿URLがある場合は、未確認のまま120点と報告しない。
