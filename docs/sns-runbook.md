# SNS運用 Runbook

戦略判断の主軸はThreads / Instagram。Blueskyは現行の同時投稿レーンとして残すが、投稿量・文面・導線の改善判断は `docs/sns-strategy-threads-instagram.md` とThreads / InstagramのKPIを優先する。

## 本番前レビュー後の運用ルール

このSNS自動投稿は、Threads / Bluesky / Instagram本番投稿前に次を満たす。BlueskyはThreadsと同じ予定時刻・投稿種別・本文URL・画像で動かし、本文差分はBluesky用ハッシュタグだけにする。

- APIキー、アクセストークン、アプリパスワード、個人情報はGit管理ファイル、README、投稿台帳、ログに保存しない。
- 実投稿は通常端末ではプレビュー表示後に `yes` 入力が必要。Render Cronだけ `SOCIAL_SCHEDULED_RUN=true` の内部フラグで確認を省略する。
- Threads / Bluesky / Instagramは投稿前に既存投稿を検索し、UTMの `utm_content` を重複判定用markerとして使う。
- APIの一時失敗は `SOCIAL_API_RETRY_ATTEMPTS` と `SOCIAL_API_RETRY_BASE_MS` に従って再試行する。認証失敗、アカウント不一致、画像サイズ超過などは再試行しない。
- すべての投稿には `utm_source`、`utm_medium=social`、`utm_campaign`、`utm_content` 付きの分析用URLを生成し、`posts.csv` に保存する。通常投稿の本文には短い `rashin-senjutsu.onrender.com` だけを出し、返信誘発用の `question` は本文URLなしにする。
- 月・水・金12:00の `empathy` 投稿は、内部名は互換性のため残すが、表向きは「今日のルノルマン一枚」として出す。ポジティブカードは追い風、注意カードは気をつける一点、中立カードは流れの整理として扱い、初回36投稿で重複させない。UTMは `empathy_YYYYMMDD_cardNN`。
- 火・木12:00の `question` 投稿は、A/Bで返信しやすい質問を出す。返信誘発用なので本文URLは出さず、UTM付きURLは台帳とKPIレビュー用にだけ保存する。UTMは `question_YYYYMMDD_vNN`。
- 火20:00の `difference` 投稿は、羅針占術が他のAI占いと違う点を伝える。自由記載、命・卜・相の総合占術、鑑定履歴、占い師兼エンジニア設計をローテーションで扱う。UTMは `difference_YYYYMMDD_vNN`。
- 土20:00の `free_paid_compare` 投稿は、無料版と有料版の違いを整理する。有料導線だが、不安を煽らず「必要な人だけ深掘り」の温度にする。UTMは `freepaid_YYYYMMDD_vNN`。
- `data/social-posts/posts.csv` は投稿台帳。本文とalt textはSHA-256ハッシュだけを保存し、`tracked_url` と `utm_content` でBOOTH側の流入分析と突き合わせる。
- 投稿文は `audit-social-drafts.js` で日跨ぎの重複を検査する。公開後のカレンダー外投稿には日別の視点行を入れる。
- Threads / Bluesky / Instagramの `oracle` / `empathy` / `question` / `difference` / `free_paid_compare` 投稿はいずれも画像とalt textを持つ。`oracle` は `images/social/instagram/oracle/NN.jpg`、`empathy` は `images/social/instagram/lenormand-empathy/NN.jpg`、`question` は `images/ui/app-promo-vertical-social.jpg`、`difference` は `images/social/instagram/difference.jpg`、`free_paid_compare` は `images/social/instagram/free-paid-compare.jpg` を使う。Blueskyの画像は1,000,000 bytes以下のローカル画像を使う。

本番前に必ず実行する。

```powershell
npm run check
npm run social:audit -- --from=2026-05-13 --to=2026-06-30 --platforms=threads,bluesky,instagram,x
git diff --stat
git diff --name-only
```

追加・確認する環境変数:

```text
SOCIAL_POSTS_LEDGER_FILE=data/social-posts/posts.csv
SOCIAL_API_RETRY_ATTEMPTS=3
SOCIAL_API_RETRY_BASE_MS=1500
```

BOOTH購入分析では、アクセス解析またはBOOTH側で確認できる流入URLの `utm_content` を `posts.csv` の `utm_content` / `tracked_url` と照合する。`utm_source=threads` と `utm_source=bluesky` で媒体別、`utm_content=oracle_YYYYMMDD` / `empathy_YYYYMMDD_cardNN` / `question_YYYYMMDD_vNN` / `difference_YYYYMMDD_vNN` / `freepaid_YYYYMMDD_vNN` で投稿別に見る。

週次KPIレビュー用の空台帳は次で作る。数値入力は人間が各SNSとアクセス解析から入れるが、行、UTM、投稿種別、追跡URLはスクリプトで生成する。

```powershell
npm run social:kpi-template -- --from=2026-06-01 --to=2026-06-07 --platforms=threads,bluesky,instagram
```

見る順番は `views`、`replies`、`reposts_or_shares`、`saves`、`profile_visits`、`new_follows`、`link_clicks`、`free_reading_starts`、`paid_deep_reading_starts`、`paid_completions`。`question` は返信数、`oracle` はリンククリック、`empathy` は保存と無料鑑定開始、`difference` はプロフィール訪問と新規フォロー、`free_paid_compare` は有料開始と有料完了を主指標にする。週次レビュー後、次週の投稿増減は `next_action` に残す。

トラブル時:

- `missing_utm` / `duplicate_text`: 投稿せず、投稿文生成またはUTM生成を修正してから `npm run social:audit` を再実行する。
- `Real posting requires explicit yes`: 手動実投稿はプレビュー確認後に `yes` を入力するか、確認済みのCI/Renderで `--yes` を使う。
- `existing_threads_post` / `existing_bluesky_post`: 既に同じmarkerの投稿があるため、重複投稿を避けて終了している。
- `Missing THREADS_ACCESS_TOKEN`: Render環境変数だけを修正する。値をファイルやチャットへ貼らない。
- Blueskyを再開する場合の画像サイズエラー: `images/ui/oracle-card-cover-social.jpg`、既存ルノルマンJPG、`images/social/instagram/difference.jpg`、`images/social/instagram/free-paid-compare.jpg` など、1,000,000 bytes以下の画像を使う。

この1枚をSNS運用の正本にする。古いGitHub Actions前提やローカルWindows常駐前提の手順は使わない。

## 現在の運用

- Threads / Bluesky / Instagram自動投稿: Render Cron Job `rashin-threads-scheduler`
- X: 自動投稿しない。GitHub Actions `X social drafts` が 07:03 JST、月水金12:03 JST、火木12:03 JST、火20:03 JST、土20:03 JSTに下書きartifactを作り、人間がX画面で確認して投稿する
- ローカルWindows: Task Scheduler、可視PowerShell、ローカルdaemonを使わない
- 対象Threads: `https://www.threads.com/@sensai_teke`
- 対象Bluesky: `https://bsky.app/profile/tekesensai.bsky.social`
- 対象X: `https://x.com/Teke_Sensai`

## Render Cron

Render Cron Job `rashin-threads-scheduler` の設定:

```text
Runtime: Node
Build Command: npm ci
Command: node scripts/social/run-scheduled-posts.js --once --only-kind=all
Schedule: 0 3,11,22 * * *
Plan: Starter
```

RenderのcronはUTC。上のscheduleはJSTで次の時刻に1回ずつ動く。

```text
07:00 JST: oracle
月・水・金 12:00 JST: empathy
火・木 12:00 JST: question
火 20:00 JST: difference
土 20:00 JST: free_paid_compare
```

5分おきのCronは使わない。Render CronはGit管理の `scheduled-post-state.json` を永続状態として使えないため、広い投稿猶予と複数回起動を組み合わせると同じ投稿が再送される。

## Render環境変数

```text
PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com
THREADS_EXPECTED_USERNAME=sensai_teke
THREADS_USER_ID=26630452966614276
THREADS_ACCESS_TOKEN=<Renderにだけ保存する>
INSTAGRAM_ENABLED=true
INSTAGRAM_USER_ID=<Renderにだけ保存する>
INSTAGRAM_ACCESS_TOKEN=<Renderにだけ保存する>
INSTAGRAM_EXPECTED_USERNAME=sensai_teke
INSTAGRAM_API_VERSION=v23.0
BLUESKY_IDENTIFIER=tekesensai.bsky.social
BLUESKY_APP_PASSWORD=<Renderにだけ保存する>
BLUESKY_EXPECTED_HANDLE=tekesensai.bsky.social
SOCIAL_AUTOMATED_POSTING_ENABLED=true
SOCIAL_PLATFORMS=threads,bluesky,instagram
SOCIAL_THREADS_HASHTAG=#占い師のつぶやき
SOCIAL_INSTAGRAM_ORACLE_HASHTAGS=#羅針占術 #今日の占い #オラクルカード #占い好きな人と繋がりたい #AI占い
SOCIAL_INSTAGRAM_EMPATHY_HASHTAGS=#羅針占術 #ルノルマンカード #今日の占い #カード占い #AI占い
SOCIAL_INSTAGRAM_QUESTION_HASHTAGS=#羅針占術 #悩み相談 #占い好きな人と繋がりたい #今日の占い #AI占い
SOCIAL_INSTAGRAM_DIFFERENCE_HASHTAGS=#羅針占術 #AI占い #無料占い #占い師のつぶやき #悩み相談
SOCIAL_INSTAGRAM_FREE_PAID_COMPARE_HASHTAGS=#羅針占術 #無料占い #占い師のつぶやき #ルノルマンカード #AI占い
SOCIAL_BLUESKY_HASHTAGS=#羅針占術 #今日の占い #今日の運勢 #占い師
SOCIAL_EMPATHY_TIME=12:00
SOCIAL_QUESTION_TIME=12:00
SOCIAL_DIFFERENCE_TIME=20:00
SOCIAL_FREE_PAID_COMPARE_TIME=20:00
SOCIAL_EXPANSION_START_DATE=2026-05-27
SOCIAL_PAID_CTA_MODE=soft
SOCIAL_BOOTH_ENABLED=false
SOCIAL_UTM_CAMPAIGN=202605_prerelease
SOCIAL_STATELESS_MODE=true
SOCIAL_POST_GRACE_MINUTES=2
SOCIAL_THREADS_IMAGE_FALLBACK_TEXT=true
THREADS_CONTAINER_TIMEOUT_MS=120000
THREADS_POST_VERIFY_TIMEOUT_MS=120000
```

`THREADS_ACCESS_TOKEN`、`INSTAGRAM_ACCESS_TOKEN`、`BLUESKY_APP_PASSWORD` はチャット、Git、mdに書かない。

## 投稿内容のルール

- 07:00: `oracle`。数秘オラクル1〜33の投稿はThreads / Bluesky / Instagram向けにし、短いURL、`images/social/instagram/oracle/NN.jpg`、alt text、カードメッセージ、今日の一手を入れる。締め文は必ず「今日の1枚はこちら」にする
- 月・水・金12:00: `empathy`。表向きは「今日のルノルマン一枚」。カード番号、日本語名、英語名、カードの一言、今日のヒントで構成し、不安訴求へ寄せない。画像は `images/social/instagram/lenormand-empathy/NN.jpg` を使う
- 火・木12:00: `question`。A/Bで返せる質問で返信の入口を作る。本文URLは出さず、台帳用の `tracked_url` だけを保存する。画像は `images/ui/app-promo-vertical-social.jpg` を使う
- `question` 本文は、A/Bだけで返信できることを明示する。返信0が続く場合も投稿数を増やさず、投稿後10分で関連投稿5件に手動返信し、自投稿に補足リプを1本だけ置く
- 火20:00: `difference`。他のAI占いとの差、自由記載、命・卜・相の総合占術、鑑定履歴、占い師兼エンジニア設計をローテーションで伝える
- 土20:00: `free_paid_compare`。無料版でできること、有料版で深掘りできること、カード枚数差、鑑定履歴解析の価値を、強すぎない有料導線として伝える
- Threadsは500文字以内、ハッシュタグは `#占い師のつぶやき` だけにする。`#羅針占術` はThreadsでは使わない
- Instagramは2,200文字以内。ハッシュタグは投稿種別ごとに最大5個だけ付ける。大量タグではなく、`oracle` はオラクル、`empathy` はルノルマン、`question` はコメントしやすさ、`difference` はAI占いの違い、`free_paid_compare` は無料版/有料版に寄せる。`oracle` / `empathy` / `difference` / `free_paid_compare` はThreads本文と同じ構成にし、差分はハッシュタグとプロフィールリンク誘導だけにする。通常キャプションに `rashin-senjutsu.onrender.com` は出さず、「プロフィールのリンクから」にする
- Blueskyは300文字以内、`#羅針占術 #今日の占い #今日の運勢 #占い師`、画像1枚、alt textを付ける。Threadsとの差分はハッシュタグだけにし、本文URLと画像はThreadsと同じにする。`question` はThreadsと同じく本文URLなしで、差分はハッシュタグだけにする
- XはThreads本文の丸写しにしない。今は下書きのみ
- 不安を煽る、未来を断定する、医療/法律/投資判断の代替に見える表現は禁止
- BOOTHの購入導線が本番確認済みになるまで、強い有料CTAにしない

## 通常確認

ローカル確認は、ユーザーの画面に新しいPowerShellを出さず、既に開いているターミナルでだけ実行する。

```powershell
npm run check
npm run social:audit -- --from=2026-05-13 --to=2026-06-30 --platforms=threads,bluesky,instagram,x
npm run threads:doctor
npm run bluesky:doctor
node scripts/social/run-scheduled-posts.js --dry-run
```

Render側の接続確認だけをしたい時は、一時的にCommandを次に変えてTrigger Runする。

```text
npm run threads:doctor
npm run bluesky:doctor
```

確認後は必ず本番Commandに戻す。

```text
node scripts/social/run-scheduled-posts.js --once --only-kind=all
```

## Renderログの見方

時間外で正常:

```json
"due": []
```

朝投稿の時間を過ぎたあとで正常:

```json
"expired": ["oracle"]
```

投稿対象時間内で正常:

```json
"due": ["oracle"]
```

または:

```json
"due": ["empathy"]
```

または:

```json
"due": ["question"]
```

または:

```json
"due": ["difference"]
```

または:

```json
"due": ["free_paid_compare"]
```

投稿成功は、`posted`、`existing_threads_post`、`existing_bluesky_post` と、対象SNS側の検証結果で判断する。`due: []` は投稿成功ではなく、時間外の正常終了。

## 完了と言ってよい条件

- Render CronのCommandとScheduleがこのrunbookと一致している
- Render環境変数に `THREADS_ACCESS_TOKEN` と `THREADS_USER_ID` が入っている
- Render環境変数に `INSTAGRAM_ENABLED=true`、`INSTAGRAM_ACCESS_TOKEN`、`INSTAGRAM_USER_ID`、`INSTAGRAM_EXPECTED_USERNAME=sensai_teke` が入っている
- Render環境変数に `BLUESKY_IDENTIFIER`、`BLUESKY_APP_PASSWORD`、`BLUESKY_EXPECTED_HANDLE` が入っている
- Render上の `npm run threads:doctor` が `username: sensai_teke` で成功した
- Render上の `npm run instagram:doctor` が `username: sensai_teke` で成功した
- Render上の `npm run bluesky:doctor` が `handle: tekesensai.bsky.social` で成功した
- Render上の本番Commandが時間外で `due: []` または期限切れで `expired` を出して成功した
- 実際の投稿時間帯にRenderの自動runが作成され、Threadsは `posted` または `existing_threads_post`、Blueskyは `posted` または `existing_bluesky_post`、Instagramは `posted` または `existing_instagram_post` を確認した

最後の1つをまだ見ていない場合は、「Render Cronの起動確認済み。次の投稿時間帯の実投稿は未確認」と言う。

## 失敗時

- `Missing THREADS_ACCESS_TOKEN`: Render環境変数を直す
- `Instagram posting is disabled`: Render環境変数の `INSTAGRAM_ENABLED=true` と `SOCIAL_PLATFORMS=threads,bluesky,instagram` を確認する
- `Missing INSTAGRAM_ACCESS_TOKEN`: Render環境変数を直す
- `Missing BLUESKY_APP_PASSWORD`: アプリパスワードを作り、Render環境変数にだけ保存する
- `Set THREADS_EXPECTED_USERNAME`: Render環境変数に `sensai_teke` を入れる
- `Set BLUESKY_EXPECTED_HANDLE`: Render環境変数に `tekesensai.bsky.social` を入れる
- `username` が `sensai_teke` 以外: 投稿を止めてトークンを作り直す
- `handle` が `tekesensai.bsky.social` 以外: 投稿を止めてBluesky認証情報を作り直す
- 画像投稿だけ失敗: `SOCIAL_THREADS_IMAGE_FALLBACK_TEXT=true` ならテキスト投稿に落ちる。ログを確認する
- GitHub Actions scheduleでThreads投稿しようとしている: workflowを直す。Threads本番はRender Cronだけ
- ローカルWindowsで解決しようとしている: やらない

## X

Xは現在、自動投稿対象ではない。公式X APIと費用を明示的に有効化するまで、下書き生成だけにする。

```powershell
npm run social:x:today
```

GitHub ActionsのX draftは、手動投稿用の本文、画像URL、alt textを出すためのもの。Xに投稿した証拠ではない。
