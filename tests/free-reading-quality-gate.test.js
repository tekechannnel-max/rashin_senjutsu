const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');

function sliceFromMarker(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `Missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notStrictEqual(end, -1, `Missing marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

[
  'function hasGeneralLuckScopeSignal',
  'function isGeneralLuckFocus',
  'function isClarifyGeneralLuck',
  'function getConsultationCategoryTagsFromContext',
  'function getConsultationThemeSignalsFromTags',
  'function getConsultationTagPriorityMatch',
  'function getDualConcernThemeLabels',
  'function removeUnbalancedMarkdownBoldMarkers',
  'function detectGeneralLuckVisibleScopeIssues',
  'function detectTaskLikeReadingIssues',
  'function getFreeReadingQualityMinimum',
  'function detectFreeLenPairScopeIssues',
  'function buildEmergencyFreeLenPairFallback',
  'function getLenFallbackFlowTextForContext',
  'function validateFreeReadingSectionQuality',
  'function buildFreeReadingQualityFallback',
  'function applyFreeReadingQualityGate',
  'function restoreGeneratedResultBlocksFromOutputs',
].forEach(marker => {
  assert.ok(appSource.includes(marker), `Missing free quality gate marker: ${marker}`);
});

const freeQualityGate = sliceFromMarker(
  appSource,
  'function validateFreeReadingSectionQuality',
  'function buildFreeReadingQualityFallback'
);

[
  'detectPaidTextQualityIssues',
  'detectTaskLikeReadingIssues',
  'detectThemeVocabularyDriftIssues',
  'detectWeakEscapeIssues',
  'detectTruncatedSummaryIssues',
  'detectJapanesePunctuationSpacingIssues',
  'detectIrresponsibleAssertionIssues',
  'detectRepeatedAdviceIssues',
  'detectOracleLabelIssues',
  'detectOracleFallbackJapaneseIssues',
  'validateIntegrationSatisfaction',
].forEach(requiredCheck => {
  assert.ok(
    freeQualityGate.includes(requiredCheck),
    `free quality gate must reuse paid-grade check: ${requiredCheck}`
  );
});

const paidTextQualityGate = sliceFromMarker(
  appSource,
  'function detectPaidTextQualityIssues',
  'function getFreeReadingQualityMinimum'
);

[
  '今回の展開に迷いの中心',
  '迷いの中心を続ける意味',
  '今回の相談の判断に関わる要素',
  '前に出る引っかかりが前に出て',
].forEach(marker => {
  assert.ok(paidTextQualityGate.includes(marker), `paid/free text quality gate missing: ${marker}`);
});

[
  '作業指示・業務メモ',
  'カード由来の兆し',
  'カード意味は今日の運気、兆し、現実の流れ、違和感、支え、転機として読み',
  '現実タスクや確認作業で終わらせず',
  '業務メモで終わらせないでください',
].forEach(marker => {
  assert.ok(appSource.includes(marker), `app reading prompt must preserve divination-not-task rule: ${marker}`);
});

const freeLenPairScope = sliceFromMarker(
  appSource,
  'function detectFreeLenPairScopeIssues',
  'function validateFreeReadingSectionQuality'
);

assert.ok(
  freeLenPairScope.includes('LENORMAND_SECTION_TITLES'),
  'free two-card Lenormand quality check must reject paid 9-card headings'
);

assert.ok(
  freeLenPairScope.includes('normalizeConsultationCategoryTag'),
  'free two-card Lenormand quality check must stay category-aware'
);

const freeGateApply = sliceFromMarker(
  appSource,
  'function applyFreeReadingQualityGate',
  'function detectRepeatedAdviceIssues'
);

assert.strictEqual(
  freeGateApply.includes('callAI('),
  false,
  'free quality gate must not add a second AI audit call'
);

const focusRefiner = sliceFromMarker(
  appSource,
  'function refineFocusWithClarify',
  'function isWorkLifeDirectionFocus'
);

assert.ok(
  focusRefiner.includes("base.shortLabel='総合運'"),
  'general luck focus must not be corrected into a love/work dual concern'
);

[
  'multiSpecificTags',
  'タグが複数選択され、優先順位がまだ明示されていないため',
  "base.explicitUserPriority=''",
  'getConsultationTagPriorityMatch(clarifyText,specificTags)||getConsultationTagPriorityMatch(source,specificTags)',
].forEach(marker => {
  assert.ok(focusRefiner.includes(marker), `multi-tag focus refiner missing: ${marker}`);
});

const tagPriorityDetector = sliceFromMarker(
  appSource,
  'function getConsultationTagPriorityMatch',
  'function getConsultationPrimaryThemeFromCategory'
);

assert.ok(
  tagPriorityDetector.includes('優先して|優先的に'),
  'multi-tag priority detector must require explicit priority wording'
);

[
  '(?:今回|先に|まず|主テーマ|主軸|優先)',
  '(?:先に|優先|主軸|主テーマ|中心)',
].forEach(broadPattern => {
  assert.strictEqual(
    tagPriorityDetector.includes(broadPattern),
    false,
    `multi-tag priority detector must not treat generic 優先順位 text as a selected-tag priority: ${broadPattern}`
  );
});

const clarifyContext = sliceFromMarker(
  appSource,
  'function buildClarifyContext',
  'function buildClarifyCardContext'
);

assert.ok(
  clarifyContext.includes('generalLuckScope') && clarifyContext.includes('hasMultipleThemes:!generalLuckScope'),
  'general luck clarify flow must not ask a love/work priority question'
);

[
  'getConsultationCategoryTagsFromContext(input,category)',
  'getConsultationThemeSignalsFromTags(selectedTags)',
  'specificTags.length>=2',
  "selectedTopicTag:selectedTags.length?selectedTags.join('・'):category",
].forEach(marker => {
  assert.ok(clarifyContext.includes(marker), `multi-tag clarify context missing: ${marker}`);
});

const clarifyQuestions = sliceFromMarker(
  appSource,
  'function buildClarifyAmbiguityQuestion',
  'function getClarifyQuestionLimit'
);

[
  '総合運として、生活リズム・健康・仕事・人間関係・将来の準備のうち',
  '総合運を整えるうえで、今いちばん足を止めている現実的な引っかかり',
  '総合運の流れで、いま一番影響が大きい環境や関わり方',
  '総合運で、これが見えたら動き出せると思える兆し',
  '生活を立て直したい',
].forEach(marker => {
  assert.ok(clarifyQuestions.includes(marker), `general luck clarify question missing: ${marker}`);
});

const paidSupplement = sliceFromMarker(
  appSource,
  'async function supplementPaidReadingSections',
  'async function strengthenPaidIntegration'
);

assert.ok(
  paidSupplement.includes('lenSupplementTarget') && !paidSupplement.includes('相談者の「結婚」「生活リズム」「お金」「曖昧さ」'),
  'paid supplement fallback must not inject marriage-specific wording into general luck readings'
);

const paidLocalRepair = sliceFromMarker(
  appSource,
  "function buildLocalPaidLenormandRepair",
  "function renderPaidCombinedOutputs"
);

[
  'const generalLuckSpecific=isGeneralLuckFocus',
  '生活リズム、健康、仕事、人間関係、将来の準備',
  '生活リズムと健康の余白を最初に戻す',
  '何が先に守られるべきか',
].forEach(marker => {
  assert.ok(paidLocalRepair.includes(marker), `general luck paid local repair missing: ${marker}`);
});

const freeGeneralLuckGate = sliceFromMarker(
  appSource,
  'function detectGeneralLuckVisibleScopeIssues',
  'function validateFreeReadingSectionQuality'
);

[
  '総合運本文に単独テーマへ戻る語彙が混入しています',
  '続ける意味と切り替えのサイン',
  '引っかかりを消すより',
  '生活リズム|健康|仕事|人間関係|将来',
].forEach(marker => {
  assert.ok(freeGeneralLuckGate.includes(marker), `general luck free gate missing: ${marker}`);
});

const integrationFlow = sliceFromMarker(
  appSource,
  'function ensureIntegrationPushLine',
  'function countMeaningfulChars'
);

[
  '回復の余白が最初に戻る流れ',
  '毎日の整い方が運の受け取り方を左右しています',
].forEach(marker => {
  assert.ok(integrationFlow.includes(marker), `general luck integration repair missing: ${marker}`);
});

[
  '先に自分の回復を予定に入れる',
  '休む予定を守れるほど',
  '順番に見てください',
].forEach(marker => {
  assert.strictEqual(integrationFlow.includes(marker), false, `general luck integration repair must not keep task-like phrase: ${marker}`);
});

[
  'RASHIN_SOFT_TASKLIKE_SURFACE_RE',
  '柔らかい作業指示',
  '鑑定本文の切り抜き断片',
].forEach(marker => {
  assert.ok(appSource.includes(marker), `soft task/card fragment quality guard missing: ${marker}`);
});

[
  ["'len'", 'async function runLenReading()', '// ─── ③数秘オラクルリーディング'],
  ["'orc'", 'async function runOrcReading()', '// ─── ④統合メッセージ'],
  ["'integration'", 'async function runIntegration()', 'function buildPremiumDossierSourceContext'],
].forEach(([kind, startMarker, endMarker]) => {
  const runner = sliceFromMarker(appSource, startMarker, endMarker);
  assert.ok(
    runner.includes(`applyFreeReadingQualityGate(${kind}`),
    `${startMarker} must pass output through applyFreeReadingQualityGate(${kind})`
  );
});

const resultBlockRestore = sliceFromMarker(
  appSource,
  'function restoreGeneratedResultBlocksFromOutputs',
  'function updateResultActionState'
);

[
  'LAST_OUTPUTS.len',
  'LAST_OUTPUTS.orc',
  'LAST_OUTPUTS.integration',
  "renderFormattedResultText('r-len-block'",
  "renderFormattedResultText('r-orc-block'",
  "renderFormattedResultText('r-integration'",
].forEach(marker => {
  assert.ok(resultBlockRestore.includes(marker), `result block restore missing: ${marker}`);
});

const completeResultUi = sliceFromMarker(
  appSource,
  'async function completeResultGenerationUI',
  'function completeFailedResultGenerationUI'
);

assert.ok(
  (completeResultUi.match(/restoreGeneratedResultBlocksFromOutputs/g) || []).length >= 2,
  'completion UI must restore generated text after final visibility and dossier renders'
);

const integrationCompletion = sliceFromMarker(
  appSource,
  'async function runIntegration',
  'function buildPremiumDossierSourceContext'
);

assert.ok(
  (integrationCompletion.match(/restoreGeneratedResultBlocksFromOutputs/g) || []).length >= 2,
  'free integration completion must restore generated text after final visibility and dossier renders'
);

const dualConcernLabels = sliceFromMarker(
  appSource,
  'function getDualConcernThemeLabels',
  'function buildDecisionContext'
);

[
  'getConsultationCategoryTagsFromContext',
  'context?.paidUserData?.catTags',
  '仕事・進路',
  '人間関係',
].forEach(marker => {
  assert.ok(dualConcernLabels.includes(marker), `dual concern label resolver missing: ${marker}`);
});

const primaryTopVerdict = sliceFromMarker(
  appSource,
  'function buildPrimaryTopVerdictText',
  'function buildWorkLifeTopVerdictText'
);

assert.ok(
  primaryTopVerdict.includes('ctx.dualThemeText'),
  'dual concern top verdict must use selected tag labels instead of a fixed love/work phrase'
);

assert.strictEqual(
  primaryTopVerdict.includes('恋愛と仕事などを同じ重さ'),
  false,
  'dual concern top verdict must not hard-code love/work for all multi-tag readings'
);

const lenFallbackPath = sliceFromMarker(
  appSource,
  'function buildEmergencyFreeLenPairFallback',
  'function normalizeLenormandReadingText'
);

assert.ok(
  lenFallbackPath.includes('■ 2枚で見えること') &&
    lenFallbackPath.includes('■ 注意したい一点') &&
    lenFallbackPath.includes('■ 羅針の指針'),
  'emergency free Lenormand fallback must produce all free two-card sections'
);

const freeLenRunner = sliceFromMarker(
  appSource,
  'async function runLenReading',
  'async function runOrcReading'
);

assert.ok(
  (freeLenRunner.match(/buildEmergencyFreeLenPairFallback/g) || []).length >= 2,
  'free Lenormand runner must keep a non-empty fallback even when normalization or rich fallback fails'
);

const richLenFallback = sliceFromMarker(
  appSource,
  'function buildRichLenFallback',
  'function buildOracleLifePathUserText'
);

assert.ok(
  richLenFallback.includes('currentId===coreId&&currentSignal===coreSignal?getLenFallbackFlowTextForContext(ctx):currentSignal'),
  'single-card rich Lenormand fallback must not repeat the core focus sentence as the current-flow body'
);

console.log('free-reading-quality-gate.test.js: ok');
