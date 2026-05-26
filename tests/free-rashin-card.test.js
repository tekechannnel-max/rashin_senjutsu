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

const compositionHelpers = sliceFromMarker(
  appSource,
  'function getCurrentDossierReadingComposition()',
  'function normalizeDossierCardData'
);

[
  'function canBuildFreeDossierCard()',
  'LAST_OUTPUTS?.integration&&LAST_OUTPUTS?.len&&LAST_OUTPUTS?.orc',
  '無料枠の羅針カードは、ルノルマン2枚・数秘オラクル1枚',
  '深掘り鑑定のような多枚数の流れ・条件表・時系列には広げない',
].forEach(marker => {
  assert.ok(compositionHelpers.includes(marker), `free Rashin card composition helper missing: ${marker}`);
});

assert.ok(
  /lenTarget:3[\s\S]*oracleTarget:1/.test(compositionHelpers),
  'free Rashin card layout must use three Lenormand lines and one Oracle line'
);

const renderDossier = sliceFromMarker(
  appSource,
  'function renderPremiumDossier(loading=false)',
  'function shouldShowDossierActions'
);

assert.ok(
  renderDossier.includes("PLAN==='paid'||hasPayload||canBuildFreeCard"),
  'free Rashin card CTA must render after a free result exists'
);

const actionGate = sliceFromMarker(
  appSource,
  'function shouldShowDossierActions()',
  'function setDossierActionButtonsVisible'
);

assert.ok(
  actionGate.includes("PLAN==='paid'||hasDossierCardPayload()||canBuildFreeDossierCard()"),
  'dossier actions must be available for completed free readings'
);

const readiness = sliceFromMarker(
  appSource,
  'async function ensureDossierReady()',
  'async function copyDossier()'
);

assert.ok(
  /if\(canBuildFreeDossierCard\(\)\)\{[\s\S]*cacheFreeDossierCardSnapshot\(\);[\s\S]*persistCurrentReading\(\);[\s\S]*return true;/.test(readiness),
  'free Rashin card readiness must cache a local snapshot without requiring paid dossier generation'
);

const freeQualityGate = sliceFromMarker(
  appSource,
  'function polishFreeReadingSurfaceText',
  'function detectRepeatedAdviceIssues'
);

[
  'replaceRepeatedPhraseAfterFirst',
  '信頼を作り直せる',
  '安心が戻る',
  'polishFreeReadingSurfaceText(fallback',
].forEach(marker => {
  assert.ok(freeQualityGate.includes(marker), `free reading copy polishing must keep repeated advice under control: ${marker}`);
});

const shareImageBuilder = sliceFromMarker(
  appSource,
  'async function createDossierShareImageBlob(cardData)',
  'async function buildDossierShareImageFile()'
);

[
  'const cardTextW=Math.round(w*.47)',
  'rgba(2,8,28,.68)',
  '650 ${w*.00772}px',
].forEach(marker => {
  assert.ok(shareImageBuilder.includes(marker), `Rashin card share image must preserve improved text readability: ${marker}`);
});

console.log('free-rashin-card.test.js: ok');
