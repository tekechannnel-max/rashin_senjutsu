# 誕生日数SNSコンテンツ運用メモ

このファイルを、羅針占術の誕生日数SNS画像・投稿案・ミニキャラ選定の正本にする。
AI職場側の調査資料や一時出力は参考にしない。羅針占術の投稿に使う判断、素材、生成ルールはこのリポジトリ内に残す。

ただし実行手順、投稿承認、停止条件、120点報告条件は `AGENTS.md`、`docs/sns-posting-absolute-rules.md`、`docs/sns-runbook.md` を優先する。このファイル単体で投稿可能、完成、120点とは判断しない。

## 120点ルール

誕生日数SNSで120点と報告できるのは、本文、動画/画像、ミニキャラ、投稿時刻、媒体、公開URL、承認状態、代表フレームまたはスクリーンショットを確認した場合だけです。

見た目、素材、外部状態、承認、投稿URL、クラウドログのどれかが未確認なら、確認済みと未確認を分けて報告し、未確認のまま120点・完成・投稿可能と断言しない。

## ミニキャラ選定

誕生日の日付を1桁になるまで足し、1〜9系のミニキャラを使う。これは見た目のキャラクター選定ルールなので、本文で11や22などのマスターナンバーに触れる場合でも、ミニキャラは必ず1桁還元後の1〜9系にする。

実装上の正本は `scripts/social/birthday-mini-family.js`。生成スクリプトごとの独自計算、手入力の系指定、テーマ・順位・背景色・本文の雰囲気によるキャラ選定をしない。

承認済みリールのJSONには、`designReview.miniCharacters` として各順位の `day`、還元後の `family`、使用アセット名、`assetPath` を残す。投稿前ガードでこの表を `scripts/social/birthday-mini-family.js` と照合できない場合は、`minicharaByNumber: true` があっても不合格にする。使用したミニキャラ画像は `images/social/instagram/birthday-mini/birthday-family-N-chibi.png` まで記録する。

| ミニキャラ | 該当する生まれ日 |
| --- | --- |
| 1系 | 1日、10日、19日、28日 |
| 2系 | 2日、11日、20日、29日 |
| 3系 | 3日、12日、21日、30日 |
| 4系 | 4日、13日、22日、31日 |
| 5系 | 5日、14日、23日 |
| 6系 | 6日、15日、24日 |
| 7系 | 7日、16日、25日 |
| 8系 | 8日、17日、26日 |
| 9系 | 9日、18日、27日 |

例:

- 11日生まれ: 1 + 1 = 2系
- 7日生まれ: 7系
- 22日生まれ: 2 + 2 = 4系
- 5日生まれ: 5系
- 29日生まれ: 2 + 9 = 11、1 + 1 = 2系

禁止:

- 11日生まれや29日生まれを「11系ミニキャラ」として扱わない。
- 22日生まれを「22系ミニキャラ」として扱わない。
- 投稿テーマ、順位、背景色、本文の雰囲気でミニキャラを選ばない。
- 本文上のマスターナンバー表現を、ミニキャラの系に流用しない。
- 旧画像、旧JSON、過去チャット、仮出力のキャラ配置を正本扱いしない。

素材:

- `images/social/instagram/birthday-mini/birthday-family-1-chibi.png`
- `images/social/instagram/birthday-mini/birthday-family-2-chibi.png`
- `images/social/instagram/birthday-mini/birthday-family-3-chibi.png`
- `images/social/instagram/birthday-mini/birthday-family-4-chibi.png`
- `images/social/instagram/birthday-mini/birthday-family-5-chibi.png`
- `images/social/instagram/birthday-mini/birthday-family-6-chibi.png`
- `images/social/instagram/birthday-mini/birthday-family-7-chibi.png`
- `images/social/instagram/birthday-mini/birthday-family-8-chibi.png`
- `images/social/instagram/birthday-mini/birthday-family-9-chibi.png`

## 現在のランキング動画

夜のあるある・ランキング系は、画像ではなく動画を標準にする。InstagramはReels、Threadsは動画投稿として扱う。

ランキング動画は、1本で読める範囲ならTop5を基本にする。辛口評価、恋愛傾向、あるある、人間関係クセはTop5が向く。月運や強い運勢の要点はTop3でもよい。

## 2026-06-25 日次自動リサーチ対象

日次の生まれ日リールは、次の3系統を自動準備の正本にする。

- `生まれ日あるある/取説`: 1日〜31日のいずれか1日を自動選定し、5ポイントの動画にする。
- `生まれ日グラフ`: 1日〜31日を毎回すべて網羅し、1本のグラフ動画にする。
- `○○な生まれ日TOP5`: 既存投稿・承認済みmanifestと重複しないテーマを自動選定する。

投稿後は `social:video-insights` で動画インサイトを集め、`social:video-pdca` で保存、シェア、返信/コメント、プロフィール訪問、再生/表示を評価する。PDCA結果は `data/social-posts/pdca/video-insights-feedback.json` に保存し、次回の自動リサーチ・動画生成では必須3系統を維持したまま、強かったネタ型と時刻を優先する。

参考アカウントは `https://www.instagram.com/uranai.kitsune/?hl=ja`。参考にするのは型だけで、本文、順位、画像、動画、占断をコピーしない。

動画素材の正本:

```text
videos/social/instagram/【インスタ】あるある・ランキング系/
```

投稿する動画、順番、本文、公開URL、投稿時刻が未確定なら投稿しない。

## 誕生日数Reelsのデザイン確認

動画は、装飾より可読性を優先する。画像切り替えが少ない動画でも、保存したくなる整理された読み物にする。

- タイトル、順位、生まれ日、理由、保存CTA、羅針占術誘導の順に視線が流れること。
- 文字の上に模様、背景柄、ミニキャラ、装飾を重ねないこと。
- 理由文は読み切れる長さと行間にし、長い場合はブロックを分けること。
- ミニキャラは該当する生まれ日の1〜9系に対応していること。
- 保存CTAは「保存していつでも思い出してください。」を基本にすること。
- 羅針占術誘導は、保存CTAの後に自然につなげること。
- 生成後にスクリーンショット、プレビュー、または動画フレームで読みにくさを確認すること。
- 承認前に `npm run social:visual-review -- --date=YYYY-MM-DD --write-review --write-usage` を実行し、動画、contact sheet、ミニキャラ画像パス、使用日を同じレビューHTMLで確認すること。
- 読みにくい、重なっている、誘導が弱い、ミニキャラがずれている場合は不合格にすること。

## 投稿案の置き場所

誕生日数ランキング、あるある、月次カルーセル、比較系の投稿案は、今後このリポジトリ配下の `docs/` または `scripts/social/` に置く。
AI職場側には正本を増やさない。

## 夜のあるある・ランキング系投稿ルール

毎日20:00 / 21:00 / 22:00の通常枠は、動画を標準にする。InstagramはReels、Threadsは動画投稿として扱う。23:00の日次リールは作らない。静止画像・カルーセルはユーザーが明示した場合だけ例外にする。

通常枠の動画素材は、次のフォルダだけを正本にする。別フォルダの素材は使わない。

```text
videos/social/instagram/【インスタ】あるある・ランキング系/
```

投稿する動画、順番、本文、公開URL、投稿時刻が未確定なら投稿しない。

通常枠はThreads / Instagramの両方に投稿する。本文は同一趣旨にし、ThreadsとInstagramで変えるのはハッシュタグだけにする。

ReelsはInstagram上の名称なので、Threadsでは同じ動画をThreads動画投稿として扱う。Threads投稿のハッシュタグは1個だけにする。

Instagram captions for this lane must include `#誕生日占い` and `#数秘`.

Caption template:

```text
\無料占いはプロフィールURLから/

{title}{emoji}

保存していつでも思い出してください。
もっと深く見たい方は羅針占術へ。
無料鑑定から、必要な方だけ深掘り鑑定できます。

#羅針占術 #誕生日占い #数秘 #誕生日数 #占い好きな人と繋がりたい
```
