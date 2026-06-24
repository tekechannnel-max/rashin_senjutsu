# 誕生日数SNSコンテンツ運用メモ

このファイルを、羅針占術の誕生日数SNS画像・投稿案・ミニキャラ選定の正本にする。
AI職場側の調査資料や一時出力は参考にしない。羅針占術の投稿に使う判断、素材、生成ルールはこのリポジトリ内に残す。

## ミニキャラ選定

誕生日の日付を1桁になるまで足し、1〜9系のミニキャラを使う。
実装上の正本は `scripts/social/birthday-mini-family.js` とし、生成・承認・投稿前検査はこの関数の結果と一致させる。
本文上のマスターナンバー表現を、ミニキャラの系に流用しない。11日・22日・29日なども、ミニキャラは必ず1桁化した系で選ぶ。
動画・画像内の保存CTAは「保存していつでも思い出してください。」を使う。

例:

- 11日生まれ: 1 + 1 = 2系
- 7日生まれ: 7系
- 22日生まれ: 2 + 2 = 4系
- 5日生まれ: 5系
- 29日生まれ: 2 + 9 = 11、1 + 1 = 2系

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

## 現在のランキング画像

ランキング画像は、1枚画像で読める範囲ならTop5を基本にする。
辛口評価、恋愛傾向、あるある、人間関係クセはTop5が向く。
月運や強い運勢の要点はTop3でもよい。

### 変人に見られやすい生まれ日TOP5

生成プリセット: `weirdTop5`

生成コマンド:

```powershell
node scripts/social/generate-birthday-instagram-posts.js --kind=ranking --month=2026-06 --ranking-preset=weirdTop5
```

出力:

- `images/social/instagram/generated-birthday/2026-06/ranking/weird-top5.jpg`

内容:

| 順位 | 生まれ日 | ミニキャラ | タイプ | メモ |
| --- | --- | --- | --- | --- |
| 1位 | 11日生まれ | 2系 | 宇宙受信型 | 直感・感性が鋭く、発想が人とズレやすいです。本人は普通でも周囲からは独特に見えます。 |
| 2位 | 7日生まれ | 7系 | マイワールド研究者型 | こだわりが深く、一人で考え込む力が強いタイプです。理解されなくても自分の世界を守ります。 |
| 3位 | 22日生まれ | 4系 | 規格外クリエイター型 | 発想のスケールが大きく、普通では終わらないタイプです。変わった夢を現実にしようとします。 |
| 4位 | 5日生まれ | 5系 | 予測不能な自由人型 | 飽きっぽく、急に動きます。常識より「面白そう」を優先しやすい変人タイプです。 |
| 5位 | 29日生まれ | 2系 | 感情直感ミックス型 | 感受性と直感が強く、考え方が複雑です。気分やひらめきの振れ幅が人より大きめです。 |

### 一目惚れしやすい生まれ日TOP5

生成プリセット: `loveAtFirstSightTop5`

生成コマンド:

```powershell
node scripts/social/generate-birthday-instagram-posts.js --kind=ranking --month=2026-06 --ranking-preset=loveAtFirstSightTop5
```

出力:

- `images/social/instagram/generated-birthday/2026-06/ranking/love-at-first-sight-top5.jpg`

内容:

| 順位 | 生まれ日 | ミニキャラ | タイプ | メモ |
| --- | --- | --- | --- | --- |
| 1位 | 5日生まれ | 5系 | 刺激で恋に落ちるタイプ | ノリ・雰囲気・勢いに弱いです。「面白そう」「楽しそう」で一気に好きになりやすいです。 |
| 2位 | 3日生まれ | 3系 | ときめき優先タイプ | 明るい空気や会話のテンポに弱いです。楽しい相手にすぐ心を持っていかれやすいです。 |
| 3位 | 11日生まれ | 2系 | 運命感じすぎタイプ | 直感が強く、「この人、何かある」と感じると一気に惹かれます。雰囲気や目に弱いです。 |
| 4位 | 15日生まれ | 6系 | 恋愛体質タイプ | 愛されたい・愛したい気持ちが強めです。見た目、声、優しさで急に恋愛スイッチが入ります。 |
| 5位 | 29日生まれ | 2系 | 感情吸収タイプ | 感受性が強く、相手の空気感に飲まれやすいです。切なげな人やミステリアスな人に弱いです。 |

### 金運が強い生まれ日TOP5

生成プリセット: `moneyLuckTop5`

生成コマンド:

```powershell
node scripts/social/generate-birthday-instagram-posts.js --kind=ranking --month=2026-06 --ranking-preset=moneyLuckTop5
```

出力:

- `images/social/instagram/generated-birthday/2026-06/ranking/money-luck-top5.jpg`
- 背景: `money` テーマ。金貨・ゴールド感を強めた専用背景。

内容:

| 順位 | 生まれ日 | ミニキャラ | タイプ | メモ |
| --- | --- | --- | --- | --- |
| 1位 | 8日生まれ | 8系 | 王道の金運タイプ | 数秘8は、成功・権力・ビジネス・お金を象徴します。稼ぐ力、勝負運、結果を出す力が強いです。 |
| 2位 | 22日生まれ | 4系 | 大きなお金を動かすタイプ | 数秘22は、現実化・大きな事業・スケールの大きさを持つマスターナンバーです。小銭より大きな成果に縁があります。 |
| 3位 | 17日生まれ | 8系 | 才能で稼ぐタイプ | 1＋7＝8なので金運数8の影響があります。独自の知性や専門性を活かして収入につなげやすいです。 |
| 4位 | 26日生まれ | 8系 | 人脈で金運を呼ぶタイプ | 2＋6＝8で、こちらも8系の金運です。人とのつながり、信頼、サポート役からお金を引き寄せやすいです。 |
| 5位 | 4日生まれ | 4系 | 堅実に財を築くタイプ | 数秘4は、安定・継続・管理の数字です。一発逆転より、貯める・増やす・守る金運に強いです。 |

### ホラー耐性のある生まれ日TOP5

生成プリセット: `horrorResistanceTop5`

生成コマンド:

```powershell
node scripts/social/generate-birthday-instagram-posts.js --kind=ranking --month=2026-06 --ranking-preset=horrorResistanceTop5
```

出力:

- `images/social/instagram/generated-birthday/2026-06/ranking/horror-resistance-top5.jpg`
- 背景: `horror` テーマ。暗めで少し怖そうな専用背景。

内容:

| 順位 | 生まれ日 | ミニキャラ | タイプ | メモ |
| --- | --- | --- | --- | --- |
| 1位 | 7日生まれ | 7系 | 冷静すぎる観察者タイプ | 怖がるより先に「この演出うまいな」「伏線かな」と分析します。血を見ながら普通にご飯食べられるタイプです。 |
| 2位 | 8日生まれ | 8系 | 肝が据わったボスタイプ | 圧・恐怖・グロに動じにくいです。ビビるより「で？」となりやすい強心臓タイプです。 |
| 3位 | 5日生まれ | 5系 | 刺激を求めるスリル中毒タイプ | 怖いものを怖がりながらも楽しめます。「うわ無理！」と言いつつ最後まで見ます。 |
| 4位 | 16日生まれ | 7系 | 闇に強い考察タイプ | 1＋6＝7なので、7の分析力があります。ホラーの怖さより、背景・心理・真相が気になるタイプです。 |
| 5位 | 22日生まれ | 4系 | 規格外メンタルタイプ | 普通の人が怖がる場面でも、どこか俯瞰しています。スケールの大きい恐怖や世界観ホラーに強いです。 |

## 投稿案の置き場所

誕生日数ランキング、あるある、月次カルーセル、比較系の投稿案は、今後このリポジトリ配下の `docs/` または `scripts/social/` に置く。
AI職場側には正本を増やさない。

## 2026-06 ranking post schedule

Threads and Instagram, 20:00 Asia/Tokyo.

| Date | Preset | Image |
| --- | --- | --- |
| 2026-06-07 | `loveAtFirstSightTop5` | `images/social/instagram/generated-birthday/2026-06/ranking/love-at-first-sight-top5.jpg` |
| 2026-06-08 | `moneyLuckTop5` | `images/social/instagram/generated-birthday/2026-06/ranking/money-luck-top5.jpg` |
| 2026-06-09 | `horrorResistanceTop5` | `images/social/instagram/generated-birthday/2026-06/ranking/horror-resistance-top5.jpg` |
| 2026-06-10 | `weirdTop5` | `images/social/instagram/generated-birthday/2026-06/ranking/weird-top5.jpg` |

Instagram captions for this lane must include `#誕生日占い` and `#数秘`.

Caption template:

```text
\無料占いはプロフィールURLから/

{title}{emoji}

🌸当てはまったら保存
🦦周りの人の誕生日も見てみて
🪭何日生まれかコメントで教えてね

#羅針占術 #誕生日占い #数秘 #誕生日数 #占い好きな人と繋がりたい
```
