# SNS運用 Runbook

この1枚をSNS運用の正本にする。古いGitHub Actions前提やローカルWindows常駐前提の手順は使わない。

## 現在の運用

- Threads自動投稿: Render Cron Job `rashin-threads-scheduler`
- X: 自動投稿しない。GitHub Actionsで下書きを作り、人間がX画面で確認して投稿する
- ローカルWindows: Task Scheduler、可視PowerShell、ローカルdaemonを使わない
- 対象Threads: `https://www.threads.com/@sensai_teke`
- 対象X: `https://x.com/Teke_Sensai`

## Render Cron

Render Cron Job `rashin-threads-scheduler` の設定:

```text
Runtime: Node
Build Command: npm ci
Command: node scripts/social/run-scheduled-posts.js --once --only-kind=all
Schedule: 0,5,10,15,20,25,30 22,11 * * *
Plan: Starter
```

RenderのcronはUTC。上のscheduleはJSTで次の時間帯だけ動く。

```text
07:00-07:30 JST: oracle
20:00-20:30 JST: concept
```

## Render環境変数

```text
PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com
THREADS_EXPECTED_USERNAME=sensai_teke
THREADS_USER_ID=26630452966614276
THREADS_ACCESS_TOKEN=<Renderにだけ保存する>
SOCIAL_AUTOMATED_POSTING_ENABLED=true
SOCIAL_PLATFORMS=threads
SOCIAL_PAID_CTA_MODE=soft
SOCIAL_BOOTH_ENABLED=false
SOCIAL_UTM_CAMPAIGN=202605_prerelease
SOCIAL_STATELESS_MODE=true
SOCIAL_POST_GRACE_MINUTES=30
SOCIAL_THREADS_IMAGE_FALLBACK_TEXT=true
THREADS_CONTAINER_TIMEOUT_MS=120000
THREADS_POST_VERIFY_TIMEOUT_MS=120000
```

`THREADS_ACCESS_TOKEN` はチャット、Git、mdに書かない。

## 投稿内容のルール

- 07:00: 数秘オラクル。カード画像、alt text、今日の小さな行動を入れる
- 20:00: 信頼形成の短文。売り込みより、自己理解、非依存、次の行動を優先する
- Threadsは500文字以内、基本ハッシュタグは1つ
- XはThreads本文の丸写しにしない。今は下書きのみ
- 不安を煽る、未来を断定する、医療/法律/投資判断の代替に見える表現は禁止
- BOOTHの購入導線が本番確認済みになるまで、強い有料CTAにしない

## 通常確認

ローカル確認は、ユーザーの画面に新しいPowerShellを出さず、既に開いているターミナルでだけ実行する。

```powershell
npm run check
npm run social:audit -- --from=2026-05-13 --to=2026-05-29 --platforms=threads,x
npm run threads:doctor
node scripts/social/run-scheduled-posts.js --dry-run
```

Render側の接続確認だけをしたい時は、一時的にCommandを次に変えてTrigger Runする。

```text
npm run threads:doctor
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
"due": ["concept"]
```

投稿成功は、`posted` または `existing_threads_post` と、Threads APIの検証結果で判断する。`due: []` は投稿成功ではなく、時間外の正常終了。

## 完了と言ってよい条件

- Render CronのCommandとScheduleがこのrunbookと一致している
- Render環境変数に `THREADS_ACCESS_TOKEN` と `THREADS_USER_ID` が入っている
- Render上の `npm run threads:doctor` が `username: sensai_teke` で成功した
- Render上の本番Commandが時間外で `due: []` または期限切れで `expired` を出して成功した
- 実際の投稿時間帯にRenderの自動runが作成され、`posted` または `existing_threads_post` を確認した

最後の1つをまだ見ていない場合は、「Render Cronの起動確認済み。次の投稿時間帯の実投稿は未確認」と言う。

## 失敗時

- `Missing THREADS_ACCESS_TOKEN`: Render環境変数を直す
- `Set THREADS_EXPECTED_USERNAME`: Render環境変数に `sensai_teke` を入れる
- `username` が `sensai_teke` 以外: 投稿を止めてトークンを作り直す
- 画像投稿だけ失敗: `SOCIAL_THREADS_IMAGE_FALLBACK_TEXT=true` ならテキスト投稿に落ちる。ログを確認する
- GitHub Actions scheduleでThreads投稿しようとしている: workflowを直す。Threads本番はRender Cronだけ
- ローカルWindowsで解決しようとしている: やらない

## X

Xは現在、自動投稿対象ではない。公式X APIと費用を明示的に有効化するまで、下書き生成だけにする。

```powershell
npm run social:x:today
```

GitHub ActionsのX draftは、手動投稿用の本文、画像URL、alt textを出すためのもの。Xに投稿した証拠ではない。
