# SNS scripts

実運用の正本は `docs/sns-runbook.md`。このREADMEはスクリプト利用メモだけにする。

## 役割

- `daily-oracle-post.js`: Threads/Bluesky/X向けの当日投稿文、画像、alt textを作る
- `run-scheduled-posts.js`: JSTの予定時刻に来た投稿だけ、設定されたSNSへ送る。現運用はThreads / Instagram
- `export-x-drafts.js`: X手動投稿用の下書きを出す
- `content/lenormand-empathy-posts.js`: `empathy` 用の36枚ルノルマン投稿素材
- `content/difference-posts.js`: `difference` 用のローテーション投稿素材
- `content/free-paid-compare-posts.js`: `free_paid_compare` 用のローテーション投稿素材
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

Threads / Instagram本番投稿はRender Cron Job `rashin-threads-scheduler` が実行する。
Bluesky本番投稿は現運用では動かさない。再開する場合だけ `SOCIAL_PLATFORMS` に追加する。

```text
node scripts/social/run-scheduled-posts.js --once --only-kind=all
```

Render schedule:

```text
0 3,11,22 * * *
```

JSTでは次だけ投稿対象にする。指定外の曜日・時刻では `run-scheduled-posts.js` が投稿しない。

```text
07:00: oracle
月・水・金 12:00: empathy
火 20:00: difference
土 20:00: free_paid_compare
```

5分おき実行は使わない。Render Cronでは状態ファイルが永続化されないため、広い猶予で複数回起動すると同じ投稿が再送される。

ローカルWindowsのTask Scheduler、可視PowerShell、daemonは使わない。

## X下書き

Xは現在、自動投稿しない。下書きだけ生成する。
GitHub Actionsの `X social drafts` が、07:03 JST、月・水・金12:03 JST、火20:03 JST、土20:03 JSTに手動投稿用の下書きをArtifactとStep Summaryへ出す。
朝オラクルのX下書きは、数秘オラクル1〜33から日付ごとにランダム選択し、Xの280文字制限では切り詰めない。

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
node scripts/social/run-scheduled-posts.js --once --only-kind=empathy
node scripts/social/run-scheduled-posts.js --once --only-kind=difference
node scripts/social/run-scheduled-posts.js --once --only-kind=free_paid_compare
```

強制投稿は通常禁止。使う前に対象日、対象kind、既存投稿、本文を確認する。

```powershell
node scripts/social/run-scheduled-posts.js --force-kind=oracle
node scripts/social/run-scheduled-posts.js --force-kind=empathy
node scripts/social/run-scheduled-posts.js --force-kind=difference
node scripts/social/run-scheduled-posts.js --force-kind=free_paid_compare
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
## 本番運用前チェック

本番投稿前は、ローカルで次を通す。

```powershell
npm run check
npm run social:audit -- --from=2026-05-13 --to=2026-06-06 --platforms=threads,instagram,x
npm run social:draft -- --date=2026-05-18 --platforms=threads,instagram
```

- `daily-oracle-post.js` は投稿文、UTM付きURL、画像、alt textを生成する。
- `post-ledger.js` は `data/social-posts/posts.csv` に投稿台帳を保存する。本文とalt textはSHA-256ハッシュだけを保存し、APIキー、トークン、投稿全文、個人情報は保存しない。
- `audit-social-drafts.js` は文字数、UTM、画像、alt text、重複本文、禁止表現を検査する。
- `run-scheduled-posts.js` はRender Cron用。JSTの投稿対象時間だけ `daily-oracle-post.js --write --post --yes` 相当を実行する。
- 朝07:00の `oracle` はカード1〜33の投稿文をThreads / Instagram向けに出す。本文URLは短い `rashin-senjutsu.onrender.com` にし、UTM付きURLは `posts.csv` の分析用URLとして保存する。画像は `images/social/instagram/oracle/NN.jpg` を使い、締め文は必ず「今日の1枚はこちら」にする。
- 月・水・金12:00の `empathy` は、悩み共感の一文、ルノルマンカード名、見立て文、自由記載深掘りへの軽いCTAで構成する。画像は `images/social/instagram/lenormand-empathy/NN.jpg` を使い、初回36投稿で重複させない。
- Threadsのハッシュタグは `#占い師のつぶやき` だけにし、`#羅針占術` は使わない。Blueskyは再開時だけ `#羅針占術 #今日の占い #今日の運勢 #占い師` を使い、300文字を超えたら投稿しない。
- Instagramのハッシュタグは投稿種別ごとに最大5個だけ付ける。大量タグではなく、内容に合うタグを `SOCIAL_INSTAGRAM_*_HASHTAGS` で管理する。
- 火20:00の `difference` は、羅針占術が他のAI占いと違う点、自由記載、命・卜・相の総合占術、鑑定履歴をローテーションで伝える。画像は `images/social/instagram/difference.jpg` をThreadsにも使う。
- 土20:00の `free_paid_compare` は、無料版と有料版の違い、カード枚数差、鑑定履歴解析の価値を、強すぎない有料導線として伝える。画像は `images/social/instagram/free-paid-compare.jpg` をThreadsにも使う。

## 手動投稿とプレビュー

実投稿は、通常の端末ではプレビュー後に `yes` を入力しない限り進まない。

```powershell
npm run social:draft -- --date=2026-05-18 --platforms=threads,instagram
npm run social:post -- --date=2026-05-18 --platforms=threads,instagram
```

CI、Render Cron、確認済みの手動実行だけ `--yes` を使う。

```powershell
node scripts/social/daily-oracle-post.js --write --post --yes --date=2026-05-18 --platforms=threads,instagram --kind=oracle
```

## 環境変数

```text
PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com
THREADS_USER_ID=<Renderに保存>
THREADS_ACCESS_TOKEN=<Renderに保存>
THREADS_EXPECTED_USERNAME=sensai_teke
INSTAGRAM_ENABLED=true
INSTAGRAM_USER_ID=<Renderに保存>
INSTAGRAM_ACCESS_TOKEN=<Renderに保存>
INSTAGRAM_EXPECTED_USERNAME=sensai_teke
INSTAGRAM_API_VERSION=v23.0
BLUESKY_IDENTIFIER=tekesensai.bsky.social
BLUESKY_APP_PASSWORD=<Renderに保存>
BLUESKY_EXPECTED_HANDLE=tekesensai.bsky.social
SOCIAL_AUTOMATED_POSTING_ENABLED=true
SOCIAL_PLATFORMS=threads,instagram
SOCIAL_THREADS_HASHTAG=#占い師のつぶやき
SOCIAL_INSTAGRAM_ORACLE_HASHTAGS=#羅針占術 #今日の占い #オラクルカード #占い好きな人と繋がりたい #AI占い
SOCIAL_INSTAGRAM_EMPATHY_HASHTAGS=#羅針占術 #ルノルマンカード #悩み相談 #占い好きな人と繋がりたい #AI占い
SOCIAL_INSTAGRAM_DIFFERENCE_HASHTAGS=#羅針占術 #AI占い #無料占い #占い師のつぶやき #悩み相談
SOCIAL_INSTAGRAM_FREE_PAID_COMPARE_HASHTAGS=#羅針占術 #無料占い #占い師のつぶやき #ルノルマンカード #AI占い
SOCIAL_BLUESKY_HASHTAGS=#羅針占術 #今日の占い #今日の運勢 #占い師
SOCIAL_EMPATHY_TIME=12:00
SOCIAL_DIFFERENCE_TIME=20:00
SOCIAL_FREE_PAID_COMPARE_TIME=20:00
SOCIAL_EXPANSION_START_DATE=2026-05-27
SOCIAL_POSTS_LEDGER_FILE=data/social-posts/posts.csv
SOCIAL_API_RETRY_ATTEMPTS=3
SOCIAL_API_RETRY_BASE_MS=1500
SOCIAL_UTM_CAMPAIGN=202605_prerelease
```

`THREADS_ACCESS_TOKEN`、`INSTAGRAM_ACCESS_TOKEN`、`BLUESKY_APP_PASSWORD` はGit、README、チャット、ログに書かない。Renderの環境変数だけに保存する。

## BOOTH分析

投稿ごとのURLには `utm_source`、`utm_medium=social`、`utm_campaign`、`utm_content` が入る。`posts.csv` の `tracked_url`、`platform`、`kind`、`status`、`permalink`、`external_id` を残しておけば、BOOTH側・アクセス解析側の流入データと `utm_content` で突き合わせられる。

## トラブル対応

- 重複投稿が疑わしい: `data/social-posts/posts.csv` の `post_key`、SNS側の既存投稿検索、Renderログの `existing_threads_post` / `existing_instagram_post` / `existing_bluesky_post` を確認する。
- API失敗: 一時的な5xx/429/タイムアウトは `SOCIAL_API_RETRY_ATTEMPTS` 回まで待って再試行する。認証不備、expected handle不一致、画像サイズ超過は再試行せず止める。
- UTMがない: `npm run social:audit -- --from=<開始日> --to=<終了日> --platforms=threads,bluesky,x` を実行し、`missing_utm` を直すまで投稿しない。
- Bluesky画像で失敗: 画像は1,000,000 bytes以下にする。`images/social/instagram/difference.jpg`、`images/social/instagram/free-paid-compare.jpg`、既存ルノルマンJPGを含めて、`audit-social-drafts.js` と `tests/social-posting.test.js` がこの条件を検査する。
