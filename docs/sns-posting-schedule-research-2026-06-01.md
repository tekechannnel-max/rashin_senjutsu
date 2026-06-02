# SNS投稿頻度・時間帯 調査メモ

更新日: 2026-06-01

対象: Threads / Instagram / Blueskyの共通自動投稿レーン。Xは現行どおり `oracle` の下書き生成のみ。

## 調査ソース

- Buffer, "Best Time to Post on Instagram: 2026 Data from 9.6M Posts"
  https://buffer.com/resources/when-is-the-best-time-to-post-on-instagram/
- Sprout Social, "Best Times to Post on Instagram in 2026"
  https://sproutsocial.com/insights/best-times-to-post-on-instagram/
- Buffer, "The Best Time to Post on Threads in 2026 -- Data from 2.5M Posts"
  https://buffer.com/resources/the-best-time-to-post-on-threads/
- Buffer, "How Often Should You Post on Instagram in 2026?"
  https://buffer.com/resources/how-often-to-post-on-instagram/
- Instagram Help Center, "About Instagram Insights"
  https://www.facebook.com/help/instagram/788388387972460

## 判断

- `oracle`: 毎日08:00。Instagram全体の最高枠だけを見ると水曜昼・夕方や木曜朝が強いが、`今日のオラクル` は朝の習慣化が本体なので、毎朝の約束を優先する。Threadsの強い時間帯である平日朝にも乗る。
- `empathy`: 月〜木12:00。火・木の旧question枠もルノルマンに統一し、「今日のルノルマン一枚」として出す。
- `difference`: 火19:00。Instagramの火曜夕方から夜の強さを使い、朝オラクルと昼の質問レーンから十分に間隔を空ける。
- `free_paid_compare`: 木19:00。土曜夜はInstagram/Threadsともに弱く出やすいため外す。週後半の比較・検討向き投稿として、火曜の `difference` から2日空ける。
- `question`: 自動投稿対象外。火・木12:00枠は `empathy`（今日のルノルマン一枚）に統一する。

## 採用スケジュール

```text
08:00 JST: oracle 毎日
12:00 JST: empathy 月〜木
19:00 JST: difference 火
19:00 JST: free_paid_compare 木
```

Render CronはJST 08:00 / 12:00 / 19:00に対応するため、UTCでは次を使う。

```text
0 3,10,22 * * *
```
