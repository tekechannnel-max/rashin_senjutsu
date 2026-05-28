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

const activeTicketHelpers = sliceFromMarker(
  appSource,
  'function hasUsableActivePaidReadingTicket()',
  'function setRashinCodeStatus'
);

const boothPurchaseBody = sliceFromMarker(
  appSource,
  'async function requestRashinCodePurchaseBooth',
  'requestRashinCodePurchase=requestRashinCodePurchaseBooth'
);

async function runStartPaidScenario({ existingTicketStatus }) {
  const context = {
    assert,
    console,
  };
  vm.createContext(context);

  vm.runInContext(
    `
let ACTIVE_PAID_READING_TICKET = {
  id: 'old-ticket',
  sourceReadingId: 'old-source',
  paidReadingId: 'old-paid',
  status: ${JSON.stringify(existingTicketStatus)}
};
let ACTIVE_PAID_SOURCE_READING_ID = 'old-source';
let PENDING_PAID_READING_ID = 'old-paid';
let CURRENT_READING_ID = 'current-free-reading';
let PLAN = 'free';

const MEMBER_AUTH = { authLoggedIn: true };
const RASHIN_BOOTH_PURCHASE_ENABLED = true;
const redeemCalls = [];
const prepareCalls = [];
const toasts = [];
let startedPaidFlowCount = 0;
let nextIds = ['fresh-source', 'fresh-paid'];

function canUseProxy() { return true; }
function openMemberAccessModal() { throw new Error('login modal must not open in this scenario'); }
function canContinueCurrentReadingToPaid() { return true; }
function buildCurrentReadingRecord() { return {}; }
async function saveHistoryRecordToVault() {}
function readPendingRashinPaidCode() { return 'TESTCODE0001'; }
async function promptForPendingRashinPaidCode() { throw new Error('pending code must be used without prompting'); }
function createReadingId() { return nextIds.shift() || 'unexpected-extra-id'; }
async function redeemRashinPaidCodeForReading(code, sourceReadingId) {
  redeemCalls.push({ code, sourceReadingId });
  return { ok: true, data: { ticketStatus: 'unused' } };
}
function clearPendingRashinPaidCode() {}
function showToast(message) { toasts.push(message); }
function trackEvent() {}
function checkoutSourceFromIntent(intent) { return intent; }
async function preparePaidReadingTicket(sourceReadingId, paidReadingId) {
  prepareCalls.push({ sourceReadingId, paidReadingId });
  ACTIVE_PAID_READING_TICKET = {
    id: 'prepared-ticket',
    sourceReadingId,
    paidReadingId,
    status: 'unused'
  };
  return { ok: true, ticket: ACTIVE_PAID_READING_TICKET };
}
function startAuthorizedPaidFlowWithTags() { startedPaidFlowCount += 1; }

${activeTicketHelpers}
${boothPurchaseBody}

this.runScenario = async () => {
  const ok = await requestRashinCodePurchaseBooth('start-paid');
  return {
    ok,
    activeSource: ACTIVE_PAID_SOURCE_READING_ID,
    pendingPaid: PENDING_PAID_READING_ID,
    activeTicket: ACTIVE_PAID_READING_TICKET,
    redeemCalls,
    prepareCalls,
    toasts,
    startedPaidFlowCount,
  };
};`,
    context,
    { filename: 'rashin-reusable-paid-code-runtime-slice.js' }
  );

  return context.runScenario();
}

(async () => {
  const stale = await runStartPaidScenario({ existingTicketStatus: 'used' });
  assert.strictEqual(stale.ok, true, 'start-paid should continue after replacing a stale paid ticket');
  assert.strictEqual(stale.redeemCalls.length, 1, 'start-paid should redeem the pending reusable code once');
  assert.strictEqual(
    stale.redeemCalls[0].sourceReadingId,
    'fresh-source',
    'used paid-ticket state must not reuse the old source reading id'
  );
  assert.strictEqual(
    stale.prepareCalls[0].paidReadingId,
    'fresh-paid',
    'used paid-ticket state must not reuse the old pending paid reading id'
  );
  assert.strictEqual(stale.activeSource, 'fresh-source', 'active paid source must point to the fresh source reading');
  assert.strictEqual(stale.startedPaidFlowCount, 1, 'paid flow must start after the fresh reusable-code ticket is prepared');

  const unused = await runStartPaidScenario({ existingTicketStatus: 'unused' });
  assert.strictEqual(unused.ok, true, 'start-paid should continue with an existing unused paid ticket');
  assert.strictEqual(
    unused.redeemCalls[0].sourceReadingId,
    'old-source',
    'unused paid-ticket state may reuse the existing source reading id'
  );
  assert.strictEqual(
    unused.prepareCalls[0].paidReadingId,
    'old-paid',
    'unused paid-ticket state may reuse the existing pending paid reading id'
  );

  console.log('rashin-reusable-paid-code-runtime.test.js: ok');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
