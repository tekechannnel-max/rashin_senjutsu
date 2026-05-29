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

[
  "const RASHIN_YEAR_CALENDAR_LABEL='2026年羅針カレンダー'",
  "const RASHIN_YEAR_CALENDAR_BG='images/ui/rashin-calendar-bg-2026.png?v=20260526'",
  'function buildRashinYearCalendarSource()',
  'function buildRashinYearCalendarMonths(source)',
  'async function createRashinYearCalendarImageBlob(sourceData=null)',
  'function canOpenPaidRashinYearCalendar()',
  'async function requestRashinYearCalendarFromPaid',
  "window.openRashinYearCalendar=openRashinYearCalendar",
  "window.requestRashinYearCalendarFromPaid=requestRashinYearCalendarFromPaid",
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

const calendarEntryBuilder = sliceFromMarker(
  appSource,
  'function buildRashinYearCalendarEntryHtml',
  'function renderPremiumEntrySection'
);

assert.ok(
  calendarEntryBuilder.includes('姓名判断・四柱推命・動物タイプ診断・カード占い') &&
    calendarEntryBuilder.includes("requestRashinYearCalendarFromPaid('${source}')"),
  'top calendar CTA must explain paid-source materials and route through the paid calendar gate'
);

assert.ok(
  htmlSource.includes('id="rashin-year-calendar-result-btn"') &&
    htmlSource.includes("requestRashinYearCalendarFromPaid('result_paid')"),
  'paid result actions must expose the Rashin calendar button'
);

const topCtaSetup = sliceFromMarker(
  appSource,
  "setText('#s-top .top-kicker'",
  "setText('#s-top .top-note'"
);

[
  'btn-rashin-calendar',
  "topCalendarBtn.textContent='羅針カレンダーを作成'",
  "requestRashinYearCalendarFromPaid('top_code_slot')",
  "topBtns.insertBefore(topCalendarBtn,simpleTopBtn.nextSibling)",
  "topBtns.insertBefore(rashinCodeForm,topPaidBtn.nextSibling)",
].forEach(marker => {
  assert.ok(topCtaSetup.includes(marker), `top CTA placement must include: ${marker}`);
});

assert.ok(
  htmlSource.includes('.btn-rashin-calendar') &&
    htmlSource.includes('.btn-rashin-calendar:hover'),
  'top Rashin calendar CTA must have dedicated visible styling'
);

const paidCalendarGate = sliceFromMarker(
  appSource,
  'function canOpenPaidRashinYearCalendar()',
  'function syncRashinYearCalendarActionButton()'
);

[
  "if(PLAN!=='paid'||!CURRENT_READING_ID) return false;",
  'hasPaidRashinYearCalendarTicket()',
  '深掘り鑑定を作れませんでした',
  '深掘り鑑定を停止しました',
].forEach(marker => {
  assert.ok(paidCalendarGate.includes(marker), `paid calendar gate must check: ${marker}`);
});

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

const monthBuilder = sliceFromMarker(
  appSource,
  'function buildRashinYearCalendarMonths(source)',
  'function buildRashinYearCalendarSummaries(source)'
);

[
  'getRashinYearCalendarSignalItems(source)',
  'sanitizeRashinYearCalendarLine(text,12)',
].forEach(marker => {
  assert.ok(monthBuilder.includes(marker), `calendar month copy must use polished signal text: ${marker}`);
});

[
  'source.topLen.replace',
  'source.topOrc.replace',
  'を見る`',
  'を合図にする',
].forEach(marker => {
  assert.strictEqual(
    monthBuilder.includes(marker),
    false,
    `calendar months must not expose raw card names or internal labels: ${marker}`
  );
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
  "ctx.fillText('注意'",
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
  'getRashinYearCalendarSignalGuideText',
  '手がかりに選び直す',
].forEach(marker => {
  assert.ok(summaryBuilder.includes(marker), `calendar summary must preserve approved layout copy: ${marker}`);
});

[
  'source.topLen.replace',
  'source.topOrc.replace',
  '合図に選び直す',
].forEach(marker => {
  assert.strictEqual(
    summaryBuilder.includes(marker),
    false,
    `calendar summary must not render raw card names or old signal wording: ${marker}`
  );
});

console.log('rashin-year-calendar.test.js: ok');
