const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(rootDir, 'uranai-v5.html'), 'utf8');

function sliceFromMarker(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `Missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notStrictEqual(end, -1, `Missing marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

const freePairScope = sliceFromMarker(
  appSource,
  "function buildFreeLenPairScopePrompt(cat='総合')",
  "function buildReadingOutputFormatGuide"
);

assert.ok(
  appSource.includes("const LENORMAND_FREE_PAIR_SECTION_TITLES=['2枚で見えること','注意したい一点','羅針の指針'];"),
  'free Lenormand pair readings must use dedicated section titles'
);

assert.ok(
  freePairScope.includes('無料ルノルマン2枚は、相談テーマに対する一点判断です。'),
  'free Lenormand pair scope must define the reading as one focused judgment'
);

assert.ok(
  appSource.includes('金運なら、お金の流れ、収入と支出の偏り、手元に安心が残るかを読みます。'),
  'money readings must use money-specific targets, not relationship copy'
);

assert.ok(
  appSource.includes('総合なら、生活リズム、健康、人間関係、仕事、将来の準備の中で'),
  'general luck readings must keep overall-life targets instead of collapsing to love/work'
);

assert.ok(
  freePairScope.includes('原因の深掘り、相手の本音の断定、細かい時系列未来、確実な行動指示は書かない。'),
  'free two-card readings must not claim deep causes, inner feelings, exact timelines, or guaranteed actions'
);

const runLenReading = sliceFromMarker(
  appSource,
  'async function runLenReading()',
  '// ─── ③数秘オラクルリーディング'
);

['■ 2枚で見えること', '■ 注意したい一点', '■ 羅針の指針'].forEach(title => {
  assert.ok(runLenReading.includes(title), `runLenReading must request ${title}`);
});

assert.ok(
  runLenReading.includes("相談者が読みたいのは${isFreePair?'「2枚から今見える一点」「注意したい一点」「判断するときに戻る視点」です。'"),
  'free pair prompt must describe the narrower two-card output goal'
);

assert.ok(
  runLenReading.includes("document.querySelector('#r-len-block .ai-load')"),
  'free Lenormand rendering must not leave the loading placeholder after generation settles'
);

assert.ok(
  appSource.includes('ルノルマン2枚では、金運ならお金の流れ、恋愛なら距離感、仕事なら案件や評価など、相談テーマに合わせて「今見える流れ」と「注意したい一点」を確認できます。'),
  'runtime FAQ must explain the category-specific free two-card scope'
);

assert.ok(
  htmlSource.includes('ルノルマン2枚では、金運ならお金の流れ、恋愛なら距離感、仕事なら案件や評価など、相談テーマに合わせて「今見える流れ」と「注意したい一点」を確認できます。'),
  'static FAQ must explain the category-specific free two-card scope'
);

assert.strictEqual(
  /相手との関係、注意点/.test(appSource) || /相手との関係、注意点/.test(htmlSource),
  false,
  'generic Lenormand description must not be hard-coded as relationship-first'
);

console.log('free-lenormand-pair-format.test.js: ok');
