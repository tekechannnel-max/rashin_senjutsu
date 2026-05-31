const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');

function sliceFromMarker(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `Missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notStrictEqual(end, -1, `Missing marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

[
  'rashin_calendar_free_credits',
  'rashin_paid_reading_free_credits',
  'function buildRashinCrossBenefitView',
  'function paidTicketEarnsCalendarBenefit',
  'async function grantCalendarBenefitForPaidTicket',
  'async function consumeRashinCalendarBenefitForPaidReadingCredit',
  'async function createPaidTicketFromRashinCalendarBenefit',
  'async function handleRashinCrossBenefitUseCalendar',
  'async function handleRashinCrossBenefitRedeemPaidTicket',
].forEach(marker => {
  assert.ok(serverSource.includes(marker), `server cross-benefit marker missing: ${marker}`);
});

const grantGuard = sliceFromMarker(
  serverSource,
  'function paidTicketEarnsCalendarBenefit',
  'async function grantCalendarBenefitForPaidTicket'
);

[
  'rashin_calendar_cross_benefit',
  'rashin_fragments_free_reading',
  'manual_free_code',
  'rashin_calendar_benefit',
  'rashin_fragments',
].forEach(marker => {
  assert.ok(grantGuard.includes(marker), `free-benefit loop guard must exclude: ${marker}`);
});

const paidTicketUse = sliceFromMarker(
  serverSource,
  'async function handlePaidReadingTicketUse',
  'async function handlePaidReadingTicketRelease'
);

[
  'grantCalendarBenefitForPaidTicket(ticket)',
  'grantCalendarBenefitForPaidTicket(used)',
  'calendarBenefit',
  'crossBenefit',
].forEach(marker => {
  assert.ok(paidTicketUse.includes(marker), `paid ticket use must return calendar benefit: ${marker}`);
});

[
  "const RASHIN_CROSS_BENEFIT_STATUS_ENDPOINT='/api/rashin-cross-benefit/status'",
  "const RASHIN_CROSS_BENEFIT_USE_CALENDAR_ENDPOINT='/api/rashin-cross-benefit/use-calendar'",
  "const RASHIN_CROSS_BENEFIT_REDEEM_PAID_TICKET_ENDPOINT='/api/rashin-cross-benefit/redeem-paid-ticket'",
  'function normalizeRashinCrossBenefitView',
  'async function redeemRashinCalendarBenefitForPaidTicket',
  'async function startRashinPaidReadingFromCalendarBenefit',
  'async function completeRashinYearCalendarBenefit',
  "window.startRashinPaidReadingFromCalendarBenefit=startRashinPaidReadingFromCalendarBenefit",
].forEach(marker => {
  assert.ok(appSource.includes(marker), `app cross-benefit marker missing: ${marker}`);
});

const calendarPopup = sliceFromMarker(
  appSource,
  'async function openRashinYearCalendar',
  'async function createDossierShareImageBlob'
);

[
  'completeRashinYearCalendarBenefit(source)',
  '羅針カレンダー特典を受け取りました',
  "window.opener?.startRashinPaidReadingFromCalendarBenefit?.('calendar_popup')",
  '無料特典で深掘り鑑定へ',
].forEach(marker => {
  assert.ok(calendarPopup.includes(marker), `calendar popup must expose reciprocal CTA: ${marker}`);
});

const calendarButtonSync = sliceFromMarker(
  appSource,
  'function syncRashinYearCalendarActionButton',
  'async function requestRashinYearCalendarFromPaid'
);

assert.ok(
  calendarButtonSync.includes('特典で羅針カレンダーを作成') &&
    calendarButtonSync.includes('getRashinCrossBenefitSnapshot().freeCalendarBenefit'),
  'paid result calendar button must reflect the free calendar benefit state'
);

console.log('rashin-cross-benefit.test.js: ok');
