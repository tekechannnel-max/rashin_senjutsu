# SNS Research, Design, and Approval System

作成日: 2026-06-20
対象: Instagram Reels / Threads video のリサーチ、TTP、動画生成、承認、投稿事故防止

この文書は、`docs/sns-posting-absolute-rules.md` と `docs/sns-runbook.md` を上書きしません。リサーチ、デザイン、承認manifestの追加ルールです。

## 結論

リサーチ、動画生成、投稿は必ず別工程に分けます。

```text
research -> draft -> review -> approved manifest -> publish -> verify
```

`research` と `draft` は、Instagram / Threads の投稿APIに触れてはいけません。投稿できるのは `approved manifest` だけです。

## 120点ルール

この工程で120点と報告できるのは、次を全部確認した場合だけです。

- 最新指示、正本ルール、承認範囲が一致している。
- 生成物の代表フレームまたはスクリーンショットで可読性、セーフエリア、ミニキャラ、保存CTAを確認している。
- 外部投稿コピー、透かし、第三者素材、既出テーマ重複が残っていない。
- 承認済みmanifestだけが投稿対象で、draft素材や確認用MP4は投稿対象外になっている。
- 投稿URL、クラウドログ、認証、外部状態など確認できないものがある場合は、未確認点として明記している。

どれか欠ける場合は、120点、完成、投稿可能、自動化安全とは報告しません。

## 外部リサーチの扱い

外部アカウントは、ネタ構造を学ぶために使います。本文、順位、画像、動画、構図の丸写しはしません。

TTPしてよいもの:

- テーマの型: TOP5、分類、あるある、比較、保存したくなる表現
- 冒頭の引き: 自分ごと化、少し辛口、コメントしたくなる切り口
- 画面構成: タイトル、ランキング、CTAの視線誘導
- 投稿リズム: 20:00 / 21:00 / 23:00 の夜枠向きテーマ

TTPしてはいけないもの:

- 外部アカウントの画像、動画、背景、キャラクター、独自表現のコピー
- 外部投稿の順位や文章の流用
- スクリーンショットの再投稿
- ロゴ、透かし、第三者素材が見える再利用

外部リサーチから作る場合は、各ネタに次を残します。

```text
sourceAccount:
sourceUrl:
observedPattern:
usedAs:
transformationNote:
duplicateCheck:
```

`usedAs` は「忘れっぽい星座ランキングを、誕生日占い向けにうっかり忘れがちな生まれ日TOP5へ再構成」のように、何を抽象化したかだけを書きます。

## TTP方針

外部調査で重視する点:

- Instagramは短尺Reelsの発見性が重要です。外部報道では、Instagramのプロ向けbest practicesで90秒超のReelsは新規ユーザーへのおすすめに不利と紹介されています。
- Metaはオリジナル性を強める方向です。外部報道では、無加工の転載、透かし付き再利用、低努力な重複投稿はおすすめ面で不利になる流れが報じられています。
- したがって、羅針占術では「外部投稿のコピー」ではなく「占いテーマの構造を学び、誕生日数に変換したオリジナル動画」にします。

参考:

- The Verge, Instagram best practices hub: https://www.theverge.com/2024/10/1/24259462/instagram-best-practices-business-profiles-tips-reach
- The Verge, Instagram unoriginal content direction: https://www.theverge.com/news/920999/instagram-says-it-doesnt-want-your-tweet-round-ups
- Digital Camera World, original content recommendation changes: https://www.digitalcameraworld.com/tech/social-media/two-years-later-instagram-is-finally-giving-photographers-the-same-protection-as-videographers-with-this-key-change

## リサーチ候補アカウント

初期候補:

- `@uranai.kitsune`
- `@costarastrology`

追加する場合は、`data/social-research/source-accounts.json` に記録します。追加理由とTTP対象を必ず書き、アカウント名だけを増やしません。

## ネタ選定基準

採用するネタ:

- 保存したくなる自己診断
- コメントしたくなる軽い辛口
- 恋愛、人間関係、性格、行動癖、仕事適性
- 「自分の誕生日が入っているか」を探したくなるTOP5
- 羅針占術の無料占い導線に自然につながるもの

落とすネタ:

- 医学的、病名的、依存を強める表現
- 不安を煽るだけの恋愛断定
- 外部投稿に近すぎる構成
- 既出テーマと同じ意味の言い換え
- 動画内で説明しないと意味がわからない内輪用語

動画内では「1系」「7系」などの内部ワードを使いません。ミニキャラ選定だけで内部的に使います。

## 動画デザイン基準

基本仕様:

- 1080 x 1920
- 12秒から18秒を基本にする
- 静止画1枚ではなく、最低でもタイトル、順位、CTAに弱い動きを入れる
- 最初の1秒でテーマを読み切れる
- 文字は背景模様、ミニキャラ、装飾に重ねない
- 画面端のUI被りを避けるため、主要テキストは左右72px以上、上120px以上、下260px以上を基本安全域に置く

構成:

```text
0.0-1.2s: タイトルと一言フック
1.2-9.5s: TOP5を縦に読ませる
9.5-11.0s: ひとこと要約
11.0-12.0s: 保存CTA + 羅針占術導線
```

画面内優先順位:

1. タイトル
2. 順位
3. 生まれ日
4. 一言理由
5. 保存CTA
6. 羅針占術導線
7. ミニキャラ
8. 装飾

ミニキャラは主役ではありません。順位カードの余白に置き、理由文にはかぶせません。

## 保存CTA

動画内CTA:

```text
保存していつでも思い出してください。
```

Instagram本文:

```text
＼無料占いはプロフィールURLから／

{title}

保存していつでも思い出してください。
もっと深く見たい方は羅針占術へ。
無料鑑定から、必要な方だけ深掘り鑑定できます。

#羅針占術 #誕生日占い #数秘 #誕生日数 #占い好きな人と繋がりたい
```

Threads本文:

```text
無料占いはプロフィールURLから👀✨

{title}

保存していつでも思い出してください。
もっと深く見たい方は羅針占術へ。
無料鑑定から、必要な方だけ深掘り鑑定できます。

#誕生日占い
```

## 承認済みmanifest

投稿スクリプトは、今後 `data/social-posts/approved-reels/` のJSONだけを投稿対象にします。

必須フィールド:

```json
{
  "approvalStatus": "approved",
  "approvedBy": "user",
  "approvedAt": "2026-06-20T00:00:00+09:00",
  "approvalText": "承認します",
  "approvalScope": "instagram,threads",
  "posts": []
}
```

各 `posts[]` には最低限、次を入れます。

```json
{
  "id": "birthday_reel_YYYYMMDD_HH_topic",
  "kind": "birthday_reel",
  "date": "YYYY-MM-DD",
  "time": "20:00",
  "title": "動画タイトル",
  "videoPath": "videos/social/instagram/.../movie.mp4",
  "platforms": "threads,instagram",
  "captions": {
    "instagram": "Instagram投稿文",
    "threads": "無料占いはプロフィールURLから👀✨\n\nThreads投稿文\n\n#誕生日占い"
  },
  "designReview": {
    "screenshots": ["output/.../representative-frame.png"],
    "saveCueText": "保存していつでも思い出してください。",
    "checks": {
      "safeArea": true,
      "readability": true,
      "noTextPatternOverlap": true,
      "saveCue": true,
      "minicharaByNumber": true
    }
  }
}
```

`designReview` は、実際に代表フレームを見て確認した証跡です。模様と文字が重なる、セーフエリア外、保存CTAが弱い、ミニキャラの数字対応が未確認、のどれかが残る場合は承認済みにしてはいけません。

`draft_for_user_review`、`postingAction: none`、`approvalStatus: draft` の素材は、投稿スクリプトから参照してはいけません。

## 投稿事故防止

禁止:

- GitHub Actions のpushだけで `--post --force` を動かす
- コミットメッセージの `[post-...]` で投稿を発火する
- 生成スクリプトが `instagram-client` / `threads-client` を読み込む
- 投稿スクリプトに日付別Reelsをハードコードする
- 投稿URL未確認のまま台帳を成功扱いにする

緊急復旧で `--force` が必要な場合:

```text
SOCIAL_BREAK_GLASS=true
BREAK_GLASS_APPROVAL_ID=<承認ゲートID>
```

を必須にします。通常workflowには置きません。

## 日次15:00フロー

毎日15:00 JSTまでに出すもの:

- リサーチメモ
- 重複チェック結果
- 確認用MP4
- 代表フレーム
- 投稿文案
- 未承認manifest

この時点では、投稿、予約投稿、公開URL化、削除、再投稿を行いません。

## 検証

最低限の確認:

```powershell
node scripts/social/validate-social-pipeline-guardrails.js
```

このガードが落ちる場合は、投稿自動化を安全とは報告しません。
