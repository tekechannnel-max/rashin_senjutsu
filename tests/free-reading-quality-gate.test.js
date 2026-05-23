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
  'function removeUnbalancedMarkdownBoldMarkers',
  'function detectGeneralLuckVisibleScopeIssues',
  'function getFreeReadingQualityMinimum',
  'function detectFreeLenPairScopeIssues',
  'function validateFreeReadingSectionQuality',
  'function buildFreeReadingQualityFallback',
  'function applyFreeReadingQualityGate',
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
  '何を増やすかより、何を先に守るか',
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
  '先に自分の回復を予定に入れる',
  '毎日の整い方が運の受け取り方を左右しています',
].forEach(marker => {
  assert.ok(integrationFlow.includes(marker), `general luck integration repair missing: ${marker}`);
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

console.log('free-reading-quality-gate.test.js: ok');
