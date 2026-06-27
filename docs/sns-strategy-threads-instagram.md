# Threads / Instagram SNS戦略

更新日: 2026-06-15

このメモは、羅針占術のSNS運用をThreadsとInstagram中心に判断するための戦略メモです。実行手順の正本は `docs/sns-runbook.md` です。

## 現在の方針

- 自動運用対象はThreadsとInstagramに限定します。
- 対象外媒体の再開前提手順は残しません。
- 夜20:00 / 21:00 / 23:00の通常枠は、画像ではなく動画を基本にします。2026-06-27以降、22:00の日次リールは作りません。
- InstagramはReels、Threadsは同じ動画の動画投稿として扱います。
- 投稿する動画、順番、本文、公開URL、投稿時刻が確定していないものは自動化対象にしません。

## 投稿枠

1. `oracle`: 毎朝8:00。朝の接触用です。
2. `birthday_monthly`: 毎月1日 20:00 / 21:00 / 22:00 / 23:00。月次カルーセルです。
3. 夜の生まれ日動画: `生まれ日あるある/取説`、`生まれ日グラフ(1〜31日全て網羅)`、`○○な生まれ日TOP5` の確定済み動画、本文、公開URL、投稿時刻だけをInstagram ReelsとThreads動画に出します。
4. `rashin_point`: 羅針占術の違いや強みを説明する単発投稿です。

## 媒体別の役割

| 媒体 | 役割 | 見る指標 |
| --- | --- | --- |
| Threads | 毎日の接触、プロフィール遷移、会話の入口 | views / replies / profile_visits / link_clicks |
| Instagram Reels / Feed | 保存される占いメモ、動画、カルーセル投稿 | saves / shares / profile_visits |
| Instagram Stories | プロフィールリンクへの誘導 | link taps / replies |

## 守るルール

- Instagram本文に長いURLは貼りません。プロフィール導線にします。
- ハッシュタグは増やしすぎません。Instagramは5個以内、Threadsは原則1個です。
- 必須タグは投稿ごとのルールに従います。誕生日系は `#誕生日占い` と `#数秘` を必須にします。
- 自動投稿に入れる前に、画像/動画、本文、alt textまたは動画内容、UTM、公開URL、投稿時刻を確認します。
