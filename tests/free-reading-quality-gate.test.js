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
