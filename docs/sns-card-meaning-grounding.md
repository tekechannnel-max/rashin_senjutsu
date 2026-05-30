# SNSカード意味準拠ルール

共通のカード意味・鑑定品質ルールは [card-reading-meaning-grounding.md](card-reading-meaning-grounding.md) に置く。このファイルはSNS画像・投稿文だけの追加運用を扱う。

対象: `scripts/social/daily-oracle-post.js`、`scripts/social/generate-instagram-assets.js`、`scripts/social/content/oracle-card-copy.js`、`scripts/social/content/lenormand-empathy-posts.js`

## SNS追加ルール

- 投稿画像と投稿文は、カード意味に忠実な「状態・流れ・支え」の表現にする。
- 「今日の一手」は行動指示に見えるため、オラクル画像では `今日のよりどころ` を使う。
- ルノルマン画像では事務的な `カードの一言 / 今日のヒント` を避け、`今日の兆し / 流れのサイン` にする。
- 中立カードの補助ラベルも `流れのカード` では弱いため、`兆しのカード` にする。
- 1枚画像では短いぶん、最低1つは `兆し`、`予兆`、`気配`、`運気`、`流れ`、`サイン`、`暗示`、`導き`、`光`、`影`、`扉`、`鍵`、`巡り`、`転機`、`山場` などの占い語感を入れる。
- 生成物はコード確認だけで終わらせず、実際に生成された画像を確認して証跡として残す。

## SNS検証項目

- `npm run check` を通す。
- `node scripts/social/generate-instagram-assets.js --kind=oracle --quality=92` と `--kind=empathy` を実行する。
- 代表画像を実際に開き、背景、文字、カード意味、重なり、可読性を確認する。
- `見る`、`書く`、`整理`、`測る`、`読む` がSNS用カード文言へ混入していないことをテストで検査する。
