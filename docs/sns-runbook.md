# SNS運用 Runbook

## 本番前レビュー後の運用ルール

このSNS自動投稿は、Threads / Blueskyの本番投稿前に次を満たす。

- APIキー、アクセストークン、アプリパスワード、個人情報はGit管理ファイル、README、投稿台帳、ログに保存しない。
- 実投稿は通常端末ではプレビュー表示後に `yes` 入力が必要。Render Cronだけ `SOCIAL_SCHEDULED_RUN=true` の内部フラグで確認を省略する。
- Threads / Blueskyは投稿前に既存投稿を検索し、UTMの `utm_content` を重複判定用markerとして使う。
- APIの一時失敗は `SOCIAL_API_RETRY_ATTEMPTS` と `SOCIAL_API_RETRY_BASE_MS` に従って再試行する。認証失敗、アカウント不一致、画像サイズ超過などは再試行しない。
- すべての投稿には `utm_source`、`utm_medium=social`、`utm_campaign`、`utm_content` 付きの分析用URLを生成し、`posts.csv` に保存する。朝オラクルの本文には短い `rashin-senjutsu.onrender.com` だけを出す。
- 昼12:00のmidday投稿は、Threads / Blueskyで同じ本文にする。悩みジャンルや具体状況に寄せすぎず、迷いの整理・気持ちと現実・今の流れくらいの抽象度にする。本文URLはThreadsでは短い `rashin-senjutsu.onrender.com`、Blueskyではクリック可能な `https://rashin-senjutsu.onrender.com` にし、分析用URLは `utm_content=midday_YYYYMMDD` として `posts.csv` に残す。
- 夜20:00のconcept投稿は、Threads / Blueskyで同じ本文にする。違うのは分析用URLの `utm_source` と、Bluesky用の軽量画像ファイルだけ。
- 夜20:00の本文は、羅針占術が他のAI占いと違う点と、恋愛・仕事・人間関係などの迷いをどう整理できるかを端的に伝える。
- `data/social-posts/posts.csv` は投稿台帳。本文とalt textはSHA-256ハッシュだけを保存し、`tracked_url` と `utm_content` でBOOTH側の流入分析と突き合わせる。
- 投稿文は `audit-social-drafts.js` で日跨ぎの重複を検査する。公開後のカレンダー外投稿には日別の視点行を入れる。
- Threads / Blueskyのoracle/midday/concept投稿はいずれも画像とalt textを持つ。Bluesky用画像は1,000,000 bytes以下にする。

本番前に必ず実行する。

```powershell
npm run check
npm run social:audit -- --from=2026-05-13 --to=2026-06-30 --platforms=threads,bluesky,x
git diff --stat
git diff --name-only
```

追加・確認する環境変数:

```text
SOCIAL_POSTS_LEDGER_FILE=data/social-posts/posts.csv
SOCIAL_API_RETRY_ATTEMPTS=3
SOCIAL_API_RETRY_BASE_MS=1500
```

BOOTH購入分析では、アクセス解析またはBOOTH側で確認できる流入URLの `utm_content` を `posts.csv` の `utm_content` / `tracked_url` と照合する。`utm_source=threads` と `utm_source=bluesky` で媒体別、`utm_content=oracle_YYYYMMDD` / `midday_YYYYMMDD` / `concept_YYYYMMDD` で投稿別に見る。

トラブル時:

- `missing_utm` / `duplicate_text`: 投稿せず、投稿文生成またはUTM生成を修正してから `npm run social:audit` を再実行する。
- `Real posting requires explicit yes`: 手動実投稿はプレビュー確認後に `yes` を入力するか、確認済みのCI/Renderで `--yes` を使う。
- `existing_threads_post` / `existing_bluesky_post`: 既に同じmarkerの投稿があるため、重複投稿を避けて終了している。
- `Missing THREADS_ACCESS_TOKEN` / `Missing BLUESKY_APP_PASSWORD`: Render環境変数だけを修正する。値をファイルやチャットへ貼らない。
- Bluesky画像サイズエラー: `images/ui/oracle-card-cover-social.jpg`、`images/ui/lenormand-card-cover-social.jpg`、`images/ui/app-promo-vertical-social.jpg` などBluesky用の圧縮済み画像を使い、1,000,000 bytes以下にする。

この1枚をSNS運用の正本にする。古いGitHub Actions前提やローカルWindows常駐前提の手順は使わない。

## 現在の運用

- Threads自動投稿: Render Cron Job `rashin-threads-scheduler`
- Bluesky自動投稿: Render Cron Job `rashin-threads-scheduler` で `SOCIAL_PLATFORMS=threads,bluesky` にした場合だけThreadsと同じ予定時刻で投稿する
- X: 自動投稿しない。GitHub Actions `X social drafts` が 07:03 / 12:03 / 20:03 JST に下書きartifactを作り、人間がX画面で確認して投稿する
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
12:00 JST: midday
20:00 JST: concept
```

5分おきのCronは使わない。Render CronはGit管理の `scheduled-post-state.json` を永続状態として使えないため、広い投稿猶予と複数回起動を組み合わせると同じ投稿が再送される。

## Render環境変数

```text
PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com
THREADS_EXPECTED_USERNAME=sensai_teke
THREADS_USER_ID=26630452966614276
THREADS_ACCESS_TOKEN=<Renderにだけ保存する>
BLUESKY_IDENTIFIER=tekesensai.bsky.social
BLUESKY_APP_PASSWORD=<Renderにだけ保存する>
BLUESKY_EXPECTED_HANDLE=tekesensai.bsky.social
SOCIAL_AUTOMATED_POSTING_ENABLED=true
SOCIAL_PLATFORMS=threads,bluesky
SOCIAL_THREADS_HASHTAG=#占い鑑定
SOCIAL_BLUESKY_HASHTAGS=#羅針占術 #今日の占い #今日の運勢 #占い師
SOCIAL_MIDDAY_TIME=12:00
SOCIAL_PAID_CTA_MODE=soft
SOCIAL_BOOTH_ENABLED=false
SOCIAL_UTM_CAMPAIGN=202605_prerelease
SOCIAL_STATELESS_MODE=true
SOCIAL_POST_GRACE_MINUTES=2
SOCIAL_THREADS_IMAGE_FALLBACK_TEXT=true
THREADS_CONTAINER_TIMEOUT_MS=120000
THREADS_POST_VERIFY_TIMEOUT_MS=120000
```

`THREADS_ACCESS_TOKEN` と `BLUESKY_APP_PASSWORD` はチャット、Git、mdに書かない。

## 投稿内容のルール

- 07:00: 数秘オラクル。カード1〜33の投稿はThreads / Blueskyで同じ本文にし、短いURL、カード画像、alt text、`カードメッセージ`、具体指示に寄せすぎない「今日の一手」を入れる。カード名の次行に `テーマ：...` を出し、Bluesky向けに250〜300文字、平均270文字前後を目安にする
- 12:00: midday。悩みジャンルや具体状況を前面に出さず、迷いの整理、気持ちと現実、今の流れ、本音の輪郭などの一般的な整理文をローテーションする。Threads / BlueskyはURLプロトコル差とハッシュタグ差を除いて同じ本文、画像、alt textを使い、UTM付きURLは `posts.csv` に保存する
- 20:00: 信頼形成の短文。売り込みより、自己理解、非依存、次の行動を優先する
- Threadsは500文字以内、ハッシュタグは `#占い鑑定` だけにする。`#羅針占術` はThreadsでは使わない
- Blueskyは300文字以内、ハッシュタグは `#羅針占術 #今日の占い #今日の運勢 #占い師` を使う。画像1枚とalt textを付ける。運用上の画像上限は1,000,000 bytesなので、告知画像は小さい既存JPEGを使う
- XはThreads本文の丸写しにしない。今は下書きのみ
- 不安を煽る、未来を断定する、医療/法律/投資判断の代替に見える表現は禁止
- BOOTHの購入導線が本番確認済みになるまで、強い有料CTAにしない

## 通常確認

ローカル確認は、ユーザーの画面に新しいPowerShellを出さず、既に開いているターミナルでだけ実行する。

```powershell
npm run check
npm run social:audit -- --from=2026-05-13 --to=2026-06-30 --platforms=threads,bluesky,x
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
"due": ["midday"]
```

または:

```json
"due": ["concept"]
```

投稿成功は、`posted`、`existing_threads_post`、`existing_bluesky_post` と、対象SNS側の検証結果で判断する。`due: []` は投稿成功ではなく、時間外の正常終了。

## 完了と言ってよい条件

- Render CronのCommandとScheduleがこのrunbookと一致している
- Render環境変数に `THREADS_ACCESS_TOKEN` と `THREADS_USER_ID` が入っている
- Render環境変数に `BLUESKY_IDENTIFIER`、`BLUESKY_APP_PASSWORD`、`BLUESKY_EXPECTED_HANDLE` が入っている
- Render上の `npm run threads:doctor` が `username: sensai_teke` で成功した
- Render上の `npm run bluesky:doctor` が `handle: tekesensai.bsky.social` で成功した
- Render上の本番Commandが時間外で `due: []` または期限切れで `expired` を出して成功した
- 実際の投稿時間帯にRenderの自動runが作成され、`posted`、`existing_threads_post`、`existing_bluesky_post` を確認した

最後の1つをまだ見ていない場合は、「Render Cronの起動確認済み。次の投稿時間帯の実投稿は未確認」と言う。

## 失敗時

- `Missing THREADS_ACCESS_TOKEN`: Render環境変数を直す
- `Missing BLUESKY_APP_PASSWORD`: Blueskyのアプリパスワードを作り、Render環境変数にだけ保存する
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
