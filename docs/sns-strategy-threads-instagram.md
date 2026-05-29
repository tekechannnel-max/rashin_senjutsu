# Threads / Instagram SNS戦略

更新日: 2026-05-29

このメモは、羅針占術のSNS運用をThreadsとInstagram中心に判断するための戦略メモです。実投稿手順の正本は `docs/sns-runbook.md` に置きます。

## 現状評価

- 自動投稿の土台は良いです。`oracle`、`empathy`、`question`、`difference`、`free_paid_compare` の5本柱があり、2026-05-29以降のThreads / Instagram下書き検査はエラー0で通ります。
- Threadsは自動投稿だけで返信を待つ媒体にしないほうがよいです。`question` はURLなしの入口として残し、返信0を通常値として扱います。露出は投稿直後の手動返信と補足リプで作ります。
- Instagramは保存・共有・プロフィール遷移を取りに行く媒体として使います。通常キャプションでは長いURLを主導線にせず、「プロフィールのリンクから」に寄せます。UTM付きURLは投稿台帳で追跡します。
- BlueskyとXは補助レーンです。改善判断はThreads / Instagramの反応を優先し、勝ちパターンが見えたものだけ横展開します。

## 役割分担

| 媒体 | 役割 | 主KPI | 運用判断 |
| --- | --- | --- | --- |
| Threads | 毎日の接触、プロフィール遷移、手動会話の入口 | views、profile_visits、link_clicks、手動起点のreplies | 自動投稿の返信数だけで判断しない |
| Instagram Feed | 保存される占いメモ | saves / views、shares / views、profile_visits | 保存率が高い型を残す |
| Instagram Stories | プロフィールリンクへの誘導 | link taps、replies | 手動で週3回から運用する |
| Instagram Reels / Carousel | 新規発見 | views、shares、new_follows | 週1本の手動企画から始める |

## 投稿柱

1. `oracle`: 毎朝7:00。習慣化とリンククリック用です。Threadsでは短いURL、Instagramではプロフィールリンク誘導を使います。
2. `empathy`: 月水金12:00。表向きは「今日のルノルマン一枚」です。Instagramでは保存用の一枚メモとして扱います。
3. `question`: 火木12:00。ThreadsはA/B返信の入口、Instagramはコメントと保存を狙います。本文URLは出しません。自動投稿だけで返信が増えない週は、投稿量ではなく手動リプと問いの具体性を直します。
4. `difference`: 火20:00。羅針占術が「それっぽいAI占い」と違う理由を伝え、プロフィール確認につなげます。
5. `free_paid_compare`: 土20:00。強い売り込みではなく、無料で十分な人と深掘り向きの人を分けます。

## 30日改善プラン

### 1週目

- Threads / Instagramのプロフィール文、固定投稿、リンク導線を揃えます。
- KPI台帳はThreads / Instagramを主対象にします。Blueskyは比較参考に留めます。
- 毎日、投稿後10分で関連投稿5件に手動返信し、必要なら自投稿に補足リプを1本置きます。

### 2週目

- `question` の返信率を見て、A/Bの問いを2つ追加します。
- Instagramで保存率が高い `oracle` / `empathy` を2つ選び、手動carousel案に変換します。

### 3週目

- `difference` と `free_paid_compare` のプロフィール遷移率を比較します。
- 有料導線はクリックよりも「無料で一度試す」文脈を優先します。

### 4週目

- 反応が高い3投稿だけを固定投稿、プロフィール導線、Storiesで再利用します。
- 伸びなかった型は増やさず、本文冒頭と画像テキストを直して再テストします。

## 週次レビュー

見る順番:

1. Threads: views、profile_visits、link_clicks
2. Instagram: saves / views
3. Instagram: shares / views
4. 両媒体: profile_visits
5. 両媒体: link_clicks / free_reading_starts
6. 有料導線: paid_deep_reading_starts / paid_completions

判断基準:

- repliesは「自動投稿由来」と「手動返信由来」を分けます。自動投稿の返信0だけで失敗扱いにしません。
- savesが高い投稿はInstagram carousel化します。
- sharesが高い投稿はブランド説明よりも「自分ごと化」できている可能性が高いです。
- profile_visitsはあるがlink_clicksが弱い場合、プロフィール文とリンク表示を直します。
- link_clicksはあるがfree_reading_startsが弱い場合、リンク先のファーストビューとCTAを直します。

## 守るルール

- Instagram本文に長いURLを貼りません。プロフィールリンク誘導にします。
- Threadsの `question` はURLなしを維持します。
- 自動投稿の返信0を見て投稿量を増やしません。まず投稿後10分の手動初動を固定します。
- ハッシュタグは増やしません。Instagramは5個以内、Threadsは1個だけです。
- 断定、不安煽り、専門判断の代替に見える表現は禁止です。
- 反応がない投稿を増産しません。週次レビューで勝ち型だけ増やします。
