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
  "const RASHIN_YEAR_CALENDAR_LABEL='2026年羅針カレンダー'",
  "const RASHIN_YEAR_CALENDAR_BG='images/ui/rashin-calendar-bg-2026.png?v=20260526'",
  'function buildRashinYearCalendarSource()',
  'function buildRashinYearCalendarMonths(source)',
  'async function createRashinYearCalendarImageBlob(sourceData=null)',
  "window.openRashinYearCalendar=openRashinYearCalendar",
].forEach(marker => {
  assert.ok(appSource.includes(marker), `Rashin year calendar marker missing: ${marker}`);
});

const entrySection = sliceFromMarker(
  appSource,
  'function renderPremiumEntrySection()',
  'async function toggleMemberPreview()'
);

assert.ok(
  entrySection.includes("buildRashinYearCalendarEntryHtml('top_entry')"),
  'top paid/free/mini entry must include the 2026 Rashin calendar CTA'
);

const sourceBuilder = sliceFromMarker(
  appSource,
  'function buildRashinYearCalendarSource()',
  'function pickRashinCalendarItem'
);

[
  'getReadingHistory()',
  'buildCurrentReadingRecord()',
  'computeReadingStats(records)',
  'LAST_OUTPUTS',
  'MEIMEI',
  'NAMEJUDGE',
  'REACTION_PROFILE',
  'record.selLen',
  'record.selOrc',
  'record.outputs',
].forEach(marker => {
  assert.ok(sourceBuilder.includes(marker), `calendar source must use all reading material: ${marker}`);
});

[
  'const safeInput={',
  'input:safeInput',
  'birthPlain',
  'namePlain',
  'outputSignal',
].forEach(marker => {
  assert.ok(sourceBuilder.includes(marker), `calendar source must sanitize personal data before image generation: ${marker}`);
});

[
  'input,',
  'outputs:outputFragments',
  'meimei:MEIMEI',
  'nameJudge:NAMEJUDGE',
  'reaction:REACTION_PROFILE,',
  'outputFragments,',
  '\n    records,',
  '\n    focus,',
].forEach(marker => {
  assert.strictEqual(
    sourceBuilder.includes(marker),
    false,
    `calendar source must not pass raw personal reading data into the share image source: ${marker}`
  );
});

const imageBuilder = sliceFromMarker(
  appSource,
  'async function createRashinYearCalendarImageBlob(sourceData=null)',
  'function getRashinYearCalendarPopupHtml'
);

[
  'RASHIN_YEAR_CALENDAR_BG',
  'RASHIN_YEAR_CALENDAR_CHARACTER',
  'あなたの内に眠る羅針盤が示すアドバイス',
  '2026年のテーマ',
  '意識すること',
  '注意:',
  '羅針占術',
].forEach(marker => {
  assert.ok(imageBuilder.includes(marker), `calendar image must preserve approved layout copy: ${marker}`);
});

assert.strictEqual(
  imageBuilder.includes('2026年は「選ぶ力」が未来を変える'),
  false,
  'calendar footer must not use the old hard-to-read long copy'
);

assert.strictEqual(
  imageBuilder.includes('整えながら、自分に合う流れを太くする一年。'),
  false,
  'calendar footer must not use the old hard-to-read second line'
);

[
  'SNS共有用',
  '個人情報なし',
  '使った鑑定',
  '現在の入力',
  '履歴${source.stats.total}件',
  "fillRashinYearText(ctx,'羅針の合図'",
  "fillRashinYearText(ctx,'残すものを決める',680",
].forEach(marker => {
  assert.strictEqual(
    imageBuilder.includes(marker),
    false,
    `calendar image must not expose reading source metadata: ${marker}`
  );
});

assert.ok(
  imageBuilder.includes("fillRashinYearText(ctx,'2026年のテーマ',512"),
  'calendar theme block must be centered instead of using a right-side label'
);

const summaryBuilder = sliceFromMarker(
  appSource,
  'function buildRashinYearCalendarSummaries(source)',
  'function drawCanvasImageCover'
);

assert.strictEqual(
  summaryBuilder.includes('source?.input?.theme'),
  false,
  'calendar summary must not render the user-entered consultation theme for SNS sharing'
);

[
  '恋愛運',
  '仕事・金運',
  '全体運',
  '羅針アドバイス',
].forEach(marker => {
  assert.ok(summaryBuilder.includes(marker), `calendar summary must preserve approved layout copy: ${marker}`);
});

console.log('rashin-year-calendar.test.js: ok');
