const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');

function sliceFromMarker(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `Missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notStrictEqual(end, -1, `Missing marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

const calculationSource = sliceFromMarker(appSource, 'const TG=', 'const PAGE_PARAMS=');
const context = {
  console,
  SOLAR_TERM_BOUNDARIES: JSON.parse(fs.readFileSync(path.join(rootDir, 'solar-term-boundaries.json'), 'utf8')),
  SOLAR_TERM_DATA_READY: true,
  GENDER: 'male',
};

vm.createContext(context);
vm.runInContext(
  `${calculationSource}
this.calcMeimei = calcMeimei;
this.calcNameJudge = calcNameJudge;
this.getStrokeInfo = getStrokeInfo;`,
  context,
  { filename: 'app-calculation-slice.js' }
);

function kakuMap(nameJudge) {
  assert.ok(nameJudge, 'name judge result must exist');
  return Object.fromEntries(nameJudge.kakus.map(item => [item.name, item.num]));
}

function assertKakus(fullname, expected) {
  assert.deepStrictEqual(kakuMap(context.calcNameJudge(fullname)), expected, `${fullname} kaku numbers must match`);
}

function pillarKeys(meimei) {
  return Array.from(meimei.pillars, pillar => `${pillar.kan}${pillar.zhi}`);
}

function assertStroke(char, count) {
  const info = context.getStrokeInfo(char);
  assert.strictEqual(info.count, count, `${char} stroke count must match modern table`);
  assert.notStrictEqual(info.source, 'approx', `${char} must not use approximate stroke count`);
  assert.notStrictEqual(info.source, 'fallback', `${char} must not use fallback stroke count`);
}

assertKakus('\u5c71\u7530 \u592a\u90ce', {
  '\u5929\u683c': 8,
  '\u4eba\u683c': 9,
  '\u5730\u683c': 13,
  '\u5916\u683c': 12,
  '\u7dcf\u683c': 21,
});

assertKakus('\u4f50\u85e4 \u82b1\u5b50', {
  '\u5929\u683c': 25,
  '\u4eba\u683c': 25,
  '\u5730\u683c': 10,
  '\u5916\u683c': 10,
  '\u7dcf\u683c': 35,
});

assertKakus('\u6797 \u84ee', {
  '\u5929\u683c': 9,
  '\u4eba\u683c': 21,
  '\u5730\u683c': 14,
  '\u5916\u683c': 2,
  '\u7dcf\u683c': 21,
});

assertKakus('\u5c0f\u9ce5\u904a \u7ffc', {
  '\u5929\u683c': 26,
  '\u4eba\u683c': 29,
  '\u5730\u683c': 18,
  '\u5916\u683c': 15,
  '\u7dcf\u683c': 43,
});

[
  ['\u82b1', 7],
  ['\u8fba', 5],
  ['\u9ce5', 11],
  ['\u904a', 12],
  ['\u7ffc', 17],
].forEach(([char, count]) => assertStroke(char, count));

const beforeRisshun = context.calcMeimei(2026, 2, 4, 4);
assert.deepStrictEqual(pillarKeys(beforeRisshun).slice(0, 2), ['\u4e59\u5df3', '\u5df1\u4e11']);

const justBeforeRisshun = context.calcMeimei(2026, 2, 4, 5);
assert.deepStrictEqual(pillarKeys(justBeforeRisshun).slice(0, 2), ['\u4e59\u5df3', '\u5df1\u4e11']);

const afterRisshun = context.calcMeimei(2026, 2, 4, 6);
assert.deepStrictEqual(pillarKeys(afterRisshun).slice(0, 2), ['\u4e19\u5348', '\u5e9a\u5bc5']);

const beforeBoshu = context.calcMeimei(2026, 6, 6, 0);
assert.deepStrictEqual(pillarKeys(beforeBoshu).slice(0, 2), ['\u4e19\u5348', '\u7678\u5df3']);

const afterBoshu = context.calcMeimei(2026, 6, 6, 1);
assert.deepStrictEqual(pillarKeys(afterBoshu).slice(0, 2), ['\u4e19\u5348', '\u7532\u5348']);

const noHourBoundaryDay = context.calcMeimei(2026, 2, 4, null);
assert.ok(
  noHourBoundaryDay.solarTermPrecisionNotes.some(note => note.includes('\u7acb\u6625 05:02')),
  'boundary-day reading without hour must surface the exact Risshun time note'
);
