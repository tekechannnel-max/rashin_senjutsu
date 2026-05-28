# X Web draft automation

目的: PCを起動していなくても、GitHub Actions上のPlaywrightでX Webの投稿画面を開き、生成済み本文を入れて、投稿せずにXの下書きとして保存する。

## できること

- GitHub Actionsで実行するため、ローカルPCの起動は不要。
- `07:03 JST` は `oracle`、月・水・金 `12:03 JST` は `empathy`、火・木 `12:03 JST` は `question`、火 `20:03 JST` は `difference`、土 `20:03 JST` は `free_paid_compare` を作る。
- X APIの投稿エンドポイントは使わない。
- Playwrightで `https://x.com/compose/post` を開き、本文と画像を入れて、閉じる操作から `Save` / `保存` を押す。
- 誤投稿防止として、`CreateTweet` / `/2/tweets` / `statuses/update` への投稿リクエストを検出したら止める。

## 注意点

- X公式APIには、通常のX下書きを作る公開エンドポイントがない。これはX Web UI操作で実現する。
- XのUI変更、ログイン期限切れ、追加認証、bot判定で失敗する可能性がある。
- X側が下書きをブラウザ内ローカル保存だけにしている場合、GitHub Actions上で保存した下書きがスマホや別PCに同期されない可能性がある。X側の同期仕様に依存する。
- 長文投稿はX Premium対象だが、X Helpでは長文投稿のWeb下書き・予約に制限がある。Web UIで保存できない場合は、本文を短くする必要がある。

## 初回セットアップ

ローカルPCで一度だけXログイン状態を取得する。

```powershell
npm ci
npx playwright install chromium
npm run social:x:capture-auth
```

ブラウザが開いたら `https://x.com/Teke_Sensai` のアカウントでログインする。ログイン完了後、コマンドが `.tmp-x-auth-state.json` を保存する。

次にGitHub Secret用にbase64化する。

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".tmp-x-auth-state.json")) | Set-Clipboard
```

GitHubで次を設定する。

```text
Repository -> Settings -> Secrets and variables -> Actions -> New repository secret
Name: X_AUTH_STORAGE_BASE64
Value: クリップボードのbase64文字列
```

設定後、ローカルの認証ファイルは削除する。

```powershell
Remove-Item .tmp-x-auth-state.json
```

## 手動実行

GitHub上で:

```text
Actions -> X social drafts -> Run workflow
kind: oracle / empathy / question / difference / free_paid_compare / all
```

ローカル確認だけなら:

```powershell
npm run social:x:web-draft -- --date=2026-05-21 --kind=oracle --storage-state=.tmp-x-auth-state.json --headed
```

`--headed` を外すとヘッドレスで実行する。

## 失敗時に見るもの

- GitHub Actionsの `Save X Web draft` step
- artifact `x-web-drafts-<run_id>`
- `x-web-drafts/x-web-draft-error.png`
- エラーが `X redirected to login` / `login prompt` の場合は、`X_AUTH_STORAGE_BASE64` を作り直す。

## 実行ファイル

- 認証状態の取得: `scripts/social/capture-x-auth-state.js`
- X Web下書き保存: `scripts/social/save-x-web-draft.js`
- Workflow: `.github/workflows/x-social-drafts.yml`
