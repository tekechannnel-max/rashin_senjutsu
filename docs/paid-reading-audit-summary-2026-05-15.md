# 羅針占術 有料鑑定 95点化 切り分け資料

作成日: 2026-05-15
対象リポジトリ: `C:\Users\tf547\uranai`
目的: 画面出力だけで修正判断せず、カード辞書・生成プロンプト・正規化処理・描画処理のどこで品質が落ちているかを切り分ける。

## 現状評価

有料鑑定本編はおおむね92点前後。
主な残課題は、ルノルマンのカード解釈精度、decisionCriteriaの混入、日本語崩れ、オラクルと統合判断の重複、保存用羅針カードの実物未確認。

## 実データの有無

今回の有料鑑定1回分の `paid-reading-debug*.json` は、現時点でローカルに見つかっていない。
確認済み:
- `C:\Users\tf547\uranai` 配下
- `Downloads`
- `Desktop`
- ユーザールート

debug JSONは `?debug=1` または `DEV_MODE` 時にブラウザ内の `PAID_DEBUG_LOG` に保持され、`downloadPaidDebugJson()` で取得する実装。

注意:
`runPaidCombinedReading()` 内では `focus=refineFocusWithClarify(...)` 後の focus が `context.focus` として保存される。
追加確認用に、debug context へ `baseFocus` と `refinedFocus` も別フィールドで保存する。

## カード辞書の概要

### ルノルマン辞書

定義位置: `app.js` line 4 付近 `const LENORMAND={...}`

主要カード例:
- 騎士: 吉報、知らせ、連絡、動き、新しい出会い
- 家: 家族、安定、基盤、安心、プライベート
- 雲: 混乱、不確実性、不安、曖昧さ、判断困難
- 星: 希望、理想、見通し、将来像、指針
- 山: 障害、壁、遅延、超えるべき課題
- 鍵: 解決策、突破口、重要な確認点
- 錨: 安定、固定、長期、安心感、停滞にもなり得る
- 十字架: 重責、試練、背負ってきた課題、負担、価値観

問題になった点:
以前は「十字架」「錨」なども `decisionCriteria` に寄せられ、
「相手との関係で安心感を行動から確かめる材料」のような文に変換されていた。
これはカード本来の意味が薄くなる。

現在の補正:
`buildLenormandCardReadingSentence()` が追加され、カードごとの意味を相談テーマへ翻訳する。
例:
- 十字架: 関係の中で避けてきた重さや負担
- 錨: 安定した関係にも、動かない関係にもなり得る
- 雲: 曖昧さ、不安、確認不足
- 山: 気持ちだけでは越えにくい壁
- 鍵: 確認すれば開く突破口

### オラクル辞書

定義位置: `app.js` line 42 付近 `const ORACLE={...}`

構造:
- `name`
- `msg`
- `essence`
- `keywords`
- `shadow`
- `note`
- `master`

現在の方針:
`msg` や `keywords` を本文に直結しない。
`buildOracleLifePathUserText()` や `buildRichOrcFallback()` で、ユーザー向け自然文へ変換する。

## runPaidCombinedReading()

定義位置: `app.js` line 14215 付近

流れ:
1. `cat`, `theme`, `name` を取得
2. `focus=analyzeConsultationFocus(cat, theme)`
3. ルノルマン9枚展開の詳細 `lenFull` を生成
4. オラクル3枚詳細 `orcFull` を生成
5. 追加質問回答 `clarifyText=buildClarifyPromptText('compact')`
6. `focus=refineFocusWithClarify(focus, clarifyText, {name, cat, theme})`
7. systemPrompt / userPrompt を構築
8. `startPaidDebugLog(paidDebugContext)`
9. `callAI(prompt, 6000, systemPrompt, {taskKey:'paid'})`
10. parse / integration強化 / 品質検査 / 必要なら再生成
11. normalizeして `LAST_OUTPUTS.len/orc/integration` に反映

debug contextに入るもの:
- `paidUserData`
- `focus` ただし refine 後
- `answerNeed`
- `clarifyText`
- `birthDetail`
- `nameDetail`
- `lifeDetail`
- `reactionText`
- `historyText`
- `lenFull`
- `orcFull`
- `systemPrompt`
- `userPrompt`
- `name`
- `cat`
- `theme`

## systemPrompt の要点

役割:
ルノルマンを主軸、オラクルを補助線として使い、相談者が判断できる文章を書く。

主な制約:
- 無根拠な未来、他人の心、専門判断は断定しない
- 相談者が次に動くための判断条件は言い切る
- ルノルマンは現実、障害、見落とし、反応を見る
- オラクルは気持ちの整理と次の一手
- 統合判断は進む/止まる/保留条件へ落とす
- 追加質問の回答を優先する
- `decisionCriteria` は固定例文でなくユーザー入力から抽出する

## userPrompt の要点

含まれるデータ:
- 相談者入力データ
- 追加質問への回答
- 動物タイプ診断
- 四柱推命/姓名判断/数秘
- 鑑定履歴
- ルノルマン全カード詳細
- オラクル全カード詳細

重要な指示:
「ルノルマンを主軸に読み、オラクルは補助線として使ってください。
メイン本文ではカード名や占術名を最小限にし、相談者の現実の言葉に翻訳してください。根拠は別レイヤーに残します。」

## buildReadingOutputFormatGuide()

定義位置: `app.js` line 8144 付近

### len

目的:
ルノルマンを条件カードにせず、現実・障害・見落とし・反応を読む。

形式:
- 迷いの構造
- 今の流れ
- 気をつけること
- あなたの引力

制約:
- 合計700〜1100字
- 内部配置語を本文に出さない
- カード名は本文で最大2〜3枚
- カード辞書の列挙禁止
- カード本来の意味と `decisionCriteria` を混同しない
- 十字架は負担や避けてきた課題、錨は安定と固定の両面として読む
- 「合図」の多用禁止

### orc

目的:
オラクルは「今週どう動くか」「内面の整え方」「選択肢を増やす行動」に寄せる。

形式:
- 光のメッセージ
- 内なる羅針盤
- 次の一手

制約:
- 次の一手は具体行動3つ
- 統合判断の条件ラベルをそのまま繰り返さない
- 抽象動詞だけで終わらせない

### integration

目的:
最終判断として、相談者が次に動ける条件を残す。

形式:
- 今回の最終判断
- 進む/残る条件
- 止まる/動く条件
- 保留条件
- 7日以内の一手
- 30日以内に見ること
- 背中を押す一文

制約:
- 最終判断は1〜3文
- 条件は2〜4項目
- 7日以内/30日以内は具体的に
- 無責任な断定は禁止、判断条件は言い切る

## normalizeLenormandReadingText()

定義位置: `app.js` line 13134 付近

処理:
1. `normalizePaidReadingText()`
2. 見出し正規化
3. 明示優先テーマがある場合、旧dual concern表現を補正
4. `removeLenormandInternalExplanations()` で内部配置語を現実語に変換
5. `translateLenormandDictionaryText()` で辞書説明を相談文へ翻訳
6. `normalizeLenormandCardCriteriaBlendText()` で decisionCriteria 混入文を補正
7. `softenLenormandSignalWording()` で「合図」連発を言い換え
8. 4セクション形式へ整形
9. 壊れた場合は `buildRichLenFallback()` に切替

品質NG:
- 見出し漏れ
- 途中終了
- 300字未満
- 4セクション欠落
- integrationと同じ内容

## normalizeOracleReadingText()

定義位置: `app.js` line 7956 付近

処理:
1. ORC本文内の「ルノルマンカード」を「オラクルカード」へ置換
2. 近接重複を補正
3. セクション分解
4. 光のメッセージ、内なる羅針盤、次の一手を抽出
5. テーマに合わせて文面補正
6. 羅針盤文が統合判断の再掲なら `getOracleCompassFallback()` へ差し替え
7. 次の一手は `buildThemeSpecificActionPlan()` で補完

課題:
統合判断と近い文が入る可能性はまだあるため、debug JSONで実物確認が必要。

## normalizeDossierCardData()

定義位置: `app.js` line 10087 付近

目的:
AI出力またはfallbackから、短い羅針カード用データへ正規化する。

出力:
- `TITLE`
- `ONE_LINE`
- `VERDICT`
- `POSITIVE_LABEL`
- `NEGATIVE_LABEL`
- `HOLD_LABEL`
- `REMAIN_CONDITIONS`
- `MOVE_CONDITIONS`
- `HOLD_CONDITIONS`
- `ACTION7`
- `KEYWORDS`
- `CLOSING`
- `EVIDENCE_SUMMARY`

品質方針:
- 条件は各最大2項目
- 今週の一手は1文
- キーワード4〜6個
- raw追加質問、カード番号、配置名は本体に出さない

## renderDossierCards()

定義位置: `app.js` line 10802 付近

処理:
`normalizeDossierCardData(data)` 後、`renderDossierSaveCard(card)` と必要なら `renderDossierEvidenceDetails(card)` を返す。

本体と根拠は分離されている。
ただし、保存カード実物はまだ未確認。

## buildPremiumDossierCardSystemPrompt()

定義位置: `app.js` line 15080 付近

目的:
長文鑑定書ではなく、SNSでスクショ保存したくなる短い羅針カードを作る。

制約:
- 羅針カード全体400〜800字
- SNSで見える主部分220〜450字
- 条件は各2項目まで
- ACTION7は1文だけ
- KEYWORDSは4〜6個
- CLOSINGは最大60字
- 配列/JSON/カンマ区切り禁止
- 「安心感のどれか」のような単独語 + のどれか禁止

## 現時点での切り分け仮説

1. ルノルマンのカード解釈品質は、辞書そのものよりも、`translateLenormandDictionaryText()` と fallback の翻訳層で落ちやすい。
2. decisionCriteria が強すぎると、カードごとの意味が「確認材料」に平準化される。
3. 現在は `buildLenormandCardReadingSentence()` で補正済みだが、AI raw がどの程度崩れているかは debug JSON がないと判断できない。
4. オラクルは `normalizeOracleReadingText()` で統合判断の再掲をある程度抑えているが、実出力での重複率確認が必要。
5. 保存用羅針カードは実物未確認。`normalizeDossierCardData()` と品質検査はあるが、画面表示・PDF・コピー対象の実物確認が必要。

## ChatGPTに確認してほしいこと

1. ルノルマン辞書の意味と、本文への翻訳方針は妥当か。
2. `buildLenormandCardReadingSentence()` のカード別解釈が、ルノルマン本来の意味からズレていないか。
3. `buildReadingOutputFormatGuide('len')` はカード感を残す指示として十分か。
4. `normalizeLenormandReadingText()` が強すぎて、AI raw の良い表現まで削っていないか。
5. オラクルの `内なる羅針盤` が統合判断の再掲にならない設計になっているか。
6. `normalizeDossierCardData()` は保存カードの破損を防げるか。
7. 次に見るべき最優先は、debug JSONなのか、保存カード実物なのか。

## 次に必要な実データ

次回検証時はURLに `?debug=1` を付け、鑑定完了後に `downloadPaidDebugJson()` でJSONを取得する。

必要項目:
- focus / refinedFocus 相当
- paidUserData
- systemPrompt
- userPrompt
- rawOutputs.initial
- parsed.initial
- parsed.after_integration_strengthen
- normalization.len/orc/integration
- rendered.len/orc/integration/foundation/dossier
- qualityIssues
- qualitySnapshots

debug context には `baseFocus` と `refinedFocus` を分離して入れる。
羅針カードは `rawOutputs.dossier`、`parsed.dossier`、`normalization.dossier.after`、`dossier.normalized`、`dossier.renderedHtml`、`dossier.renderedText`、`dossier.qualityIssues` を確認する。
