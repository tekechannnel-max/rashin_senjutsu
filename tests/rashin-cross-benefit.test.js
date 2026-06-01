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

const calendarBenefitPaidStart = sliceFromMarker(
  appSource,
  'async function startRashinPaidReadingFromCalendarBenefit',
  'async function preparePaidReadingTicket'
);

assert.ok(
  calendarBenefitPaidStart.includes('RASHIN_YEAR_CALENDAR_PAID_START_PENDING=true') &&
    calendarBenefitPaidStart.includes('prepareRashinYearCalendarPaidStart()') &&
    calendarBenefitPaidStart.includes('startAuthorizedPaidFlowWithTags()'),
  'calendar popup free paid-reading benefit must resume as a comprehensive no-tag paid flow'
);

const ensurePaidAccessBody = sliceFromMarker(
  appSource,
  'async function ensurePaidAccess',
  'function resumePendingMemberIntent'
);

const startPaidBenefitIndex = ensurePaidAccessBody.indexOf("if(intent==='start-paid'&&MEMBER_AUTH.authLoggedIn&&MEMBER_AUTH.authProvider==='google')");
assert.notStrictEqual(startPaidBenefitIndex, -1, 'start-paid must check Google benefit state');
assert.ok(
  ensurePaidAccessBody.indexOf('if(!RASHIN_BONUS_STATUS) await loadRashinBonusStatus({render:true});', startPaidBenefitIndex) <
    ensurePaidAccessBody.indexOf('getRashinCrossBenefitSnapshot().freePaidReadingBenefit?.available', startPaidBenefitIndex),
  'start-paid must load cross-benefit status before checking the free paid-reading benefit'
);

const upgradePaidIndex = ensurePaidAccessBody.indexOf("if(intent==='upgrade-paid'&&PLAN==='free'&&canContinueCurrentReadingToPaid())");
assert.notStrictEqual(upgradePaidIndex, -1, 'upgrade-paid must keep free-result upgrade branch');
assert.ok(
  ensurePaidAccessBody.indexOf('const prepared=await preparePaidReadingTicket(sourceReadingId,PENDING_PAID_READING_ID);', upgradePaidIndex) <
    ensurePaidAccessBody.indexOf('redeemRashinCalendarBenefitForPaidTicket(sourceReadingId,PENDING_PAID_READING_ID', upgradePaidIndex),
  'upgrade-paid must first reuse an existing paid ticket, then fall back to the calendar benefit'
);

console.log('rashin-cross-benefit.test.js: ok');
