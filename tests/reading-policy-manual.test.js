const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const policySource = fs.readFileSync(path.join(rootDir, 'rashin-reading-policy.js'), 'utf8');
const appSource = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(rootDir, 'uranai-v5.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
const docsSource = fs.readFileSync(path.join(rootDir, 'docs', 'rashin-reading-architecture.md'), 'utf8');

[
  'global.RASHIN_READING_POLICY_MANUAL',
  "version:'2026-05-18'",
  'planBoundaries',
  'paidAccess',
  'tagSelection',
  'forbiddenVisibleTerms',
  'themeTargets',
  'textGeneration',
].forEach(marker => {
  assert.ok(policySource.includes(marker), `policy manual must include ${marker}`);
});

[
  'free',
  'paid',
  'len',
  'orc',
  'integration',
  'quality',
  'dossier',
].forEach(scope => {
  assert.ok(policySource.includes(`${scope}:`), `policy manual must define ${scope} scope`);
});

[
  '無料鑑定はルノルマン2枚、数秘オラクル1枚',
  '有料鑑定はルノルマン9枚、数秘オラクル3枚',
  '羅針コード、BOOTH注文番号、購入状態',
  '品質確認できない本文は表示せず、チケットを消費しない',
  'お金タグでは恋愛の距離感語彙へ寄せず',
  'このカードは',
].forEach(requiredText => {
  assert.ok(policySource.includes(requiredText), `policy manual must preserve rule: ${requiredText}`);
});

const policyScriptIndex = htmlSource.indexOf('<script src="rashin-reading-policy.js"></script>');
const appScriptIndex = htmlSource.indexOf('<script src="app.js"></script>');
assert.ok(policyScriptIndex !== -1, 'HTML must load rashin-reading-policy.js');
assert.ok(appScriptIndex !== -1, 'HTML must load app.js');
assert.ok(policyScriptIndex < appScriptIndex, 'policy manual must load before app.js');

assert.ok(
  serverSource.includes("pathname === '/rashin-reading-policy.js'"),
  'server must serve rashin-reading-policy.js'
);

[
  'function getRashinReadingPolicyManual',
  'function buildRashinExternalPolicyBlock',
  'function getExternalRashinForbiddenVisibleTerms',
  'externalManual',
  'getExternalRashinForbiddenVisibleTerms()',
].forEach(marker => {
  assert.ok(appSource.includes(marker), `app.js must consume policy manual via ${marker}`);
});

[
  'rashin-reading-policy.js',
  'lenormand-reading-knowledge.js',
  'oracle-reading-knowledge.js',
  'card-reading-knowledge.js',
].forEach(fileName => {
  assert.ok(docsSource.includes(fileName), `architecture doc must mention ${fileName}`);
});

console.log('reading-policy-manual.test.js: ok');
