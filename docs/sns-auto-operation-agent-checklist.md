# SNS自動運用 事故防止 質問チェック集

作成日: 2026-05-13

このチェック集は、羅針占術SNS運用を任された作業者が、ユーザーに完了報告する前に自分で答えるためのものです。
「自動運用」は単発実行ではない。継続スケジュール、実行基盤、認証、重複防止、失敗検知、実投稿確認まで含む。

答えが `No` または `不明` の項目が1つでもある場合は、完了扱いしない。調査、修正、または停止理由を具体的に出す。

## 0. 依頼の意味を取り違えていないか

- ユーザーは単発投稿を頼んでいるのか、継続運用を任せているのか。
- `自動運用`、`毎日`、`スケジュール`、`任せる`、`運用方針` が出ている場合、継続運用として扱っているか。
- 下書き生成だけで「投稿した」「運用できている」と言っていないか。
- dry-run成功だけで「動く」と言っていないか。
- `X` はこのrepoでは手動投稿下書きであり、Threads自動投稿と混同していないか。

## 1. 実行基盤はPC起動不要になっているか

- 本命の実行基盤はGitHub Actionsになっているか。
- Windows Task Schedulerやローカルdaemonを本命扱いしていないか。
- ローカルタスクを使う場合でも、PC起動前提の保険であることを明示しているか。
- `.github/workflows/threads-social.yml` がdefault branch `main` に存在し、workflow stateがactiveであることを確認したか。
- `.github/workflows/x-social-drafts.yml` は下書き生成用で、自動投稿ではないことを確認したか。

## 2. スケジュールは実際に登録されているか

- JSTの予定時刻とUTC cronの対応を確認したか。
- Threads workflowが1日2回だけではなく、遅延やドロップに備えて複数回チェックする設定になっているか。
- 最新のcron定義をdocsとworkflowで一致させたか。
- workflow修正後、pushイベントでGitHub Actions runが実際に作成されることを確認したか。
- cron更新後、次のscheduleイベントが実際に作成されるところまで確認したか。

## 3. 認証とSecretsは本当に投稿可能か

- GitHub Secrets `THREADS_ACCESS_TOKEN` と `THREADS_USER_ID` が存在することをActionsログで確認したか。
- Secrets未設定を「skipで成功」扱いにしていないか。
- `npm run threads:doctor` がActions上で成功し、対象アカウントが `@sensai_teke` であることを確認したか。
- ローカルtokenだけを見てGitHubでも投稿できると誤認していないか。
- token確認に失敗した場合、投稿処理へ進まず失敗扱いにしているか。

## 4. 投稿内容は当日の運用方針に合っているか

- `docs/sns-operation-policy-2026-05.md` の当日フェーズに合っているか。
- `docs/sns-final-review-protocol.md` の最終検査を通すべき投稿か。
- `npm run social:audit -- --from=<JST date> --to=<JST date> --platforms=threads,x` がエラー0か。
- プレリリース前に公開URL、UTM、購入、価格、注文番号、利用可能CTAを出していないか。
- Threadsは500文字以内、ハッシュタグは `#羅針占術` のみになっているか。
- XはThreads本文の単純転載ではなく、かつ手動投稿扱いになっているか。

## 5. 投稿実行は「期限到来分だけ」になっているか

- `scripts/social/run-scheduled-posts.js` でJST日付とJST分を判定していることを確認したか。
- 07:00前に朝投稿、20:00前に夜投稿を出そうとしていないか。
- 期限到来後、`SOCIAL_POST_GRACE_MINUTES` 内だけ同日同種の投稿がdueになることを確認したか。
- grace windowを過ぎた未投稿分が `expired` になり、PC起動後などに遅刻投稿されないことを確認したか。
- GitHub Actionsの `SOCIAL_STATELESS_MODE=true` で、ローカルstateがなくてもカード選定と重複確認が破綻しないことを確認したか。
- `SOCIAL_SKIP_*` が誤って今日の投稿を止めていないか。

## 6. 重複防止は動いているか

- Threadsの直近投稿取得で同日同種の既存投稿を検出できるか。
- 同じ `utm_content` または同一本文の投稿がある場合、二重投稿を止める設計になっているか。
- `SOCIAL_ALLOW_DUPLICATE_POSTS=true` を不用意に使っていないか。
- ローカル `data/social-posts/scheduled-post-state.json` だけを重複防止の根拠にしていないか。

## 7. 実投稿の成功を確認したか

- Actions jobの成功だけで投稿成功と断定していないか。
- 期限前の `due: []` は「基盤確認」であり「投稿成功」ではないと区別しているか。
- 期限後の投稿では、Threads APIのpublish IDだけでなく、permalinkまたは取得結果で本文を確認したか。
- 画像投稿なら、media container ready後にpublishされ、検証済みpermalinkが返っているか。
- 投稿後、同日重複が起きていないことを確認したか。

## 8. 失敗時に沈黙しない設計になっているか

- Secrets未設定、token不一致、audit失敗、投稿API失敗はjob failureとして表に出るか。
- GitHub Actionsのrun履歴で、失敗が成功に見えないか。
- ローカル保険を使う場合、`data/social-posts/logs/scheduled-post-YYYY-MM-DD.log` に開始、出力、終了コードが残るか。
- 失敗時の復旧手順は、手動投稿ではなく、まずGitHub Actions本命の修正から始める形になっているか。

## 9. コード変更後の検証は足りているか

- 作業前に `git status --short --branch`、`git diff --stat`、`git diff --name-only` を確認したか。
- 変更対象ファイルだけをstageしたか。
- `npm run check` を実行したか。
- `git diff --check` を実行したか。
- SNS運用変更なら `rg -n "threads-social|x-social-drafts|SOCIAL_|THREADS_|cron|run-scheduled" .github scripts docs OPERATIONS.md` で痕跡を確認したか。
- commit後にpushし、`HEAD` と `origin/main` が一致することを確認したか。
- push後にGitHub Actions runが作成され、対象jobが成功することを確認したか。

## 10. 完了報告で言ってよいこと、言ってはいけないこと

言ってよい:

- `GitHub Actionsのpush runは成功した`
- `次のschedule runはまだ未確認`
- `期限前なので due: [] だった`
- `Threads SecretsはActions上で存在し、doctorは @sensai_teke で成功した`
- `投稿はまだ出ていない`

言ってはいけない:

- `自動運用できています`、ただしschedule runをまだ確認していない場合
- `投稿できました`、ただしpermalinkまたは取得結果を確認していない場合
- `Xも自動投稿されます`、ただしX API投稿を有効化していない場合
- `ローカルタスクを有効化したので大丈夫です`
- `dry-runが通ったので大丈夫です`

## ユーザーに確認が必要な場合

次の場合だけ、短く確認する。

- 予定時刻を過ぎた投稿を、遅延投稿として今すぐ公開するか。
- 既存の自動運用方針にない新しい媒体、アカウント、CTA、価格、購入導線を使うか。
- 費用が発生するAPI、外部サービス、有料ツールを使うか。
- 同日同種の投稿が既にあるが、例外的に重複投稿するか。

それ以外は、作業者が自分で確認して進める。
