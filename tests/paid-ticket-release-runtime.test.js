const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

function sliceFromMarker(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `Missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notStrictEqual(end, -1, `Missing marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

const releaseHandlerSource = sliceFromMarker(
  serverSource,
  'async function handlePaidReadingTicketRelease',
  'function buildStripeCheckoutUrls'
);

async function runReleaseScenario({ requestPaidReadingId, ticketLockedReadingId, ticketStatus = 'unused' }) {
  const writes = [];
  let responsePayload = null;
  const context = {
    console,
    writes,
    requestPaidReadingId,
    ticketLockedReadingId,
    ticketStatus,
  };
  vm.createContext(context);
  vm.runInContext(
    `
function normalizePaidTicketId(value) { return String(value || '').trim(); }
function normalizeVaultRecordId(value) { return String(value || '').trim(); }
async function readJsonBody() {
  return {
    ticketId: 'ticket-1',
    sourceReadingId: 'source-1',
    paidReadingId: requestPaidReadingId,
    identity: { vaultId: 'vault-1' }
  };
}
async function readPaidReadingTicket(ticketId) {
  if (ticketId !== 'ticket-1') return null;
  return {
    id: 'ticket-1',
    ownerType: 'vault',
    userId: '',
    vaultId: 'vault-1',
    sourceReadingId: 'source-1',
    status: ticketStatus,
    lockedReadingId: ticketLockedReadingId,
    lockedAt: '2026-05-23T03:00:00.000Z'
  };
}
async function resolvePurchaseOwner(_req, identity) {
  return { ownerType: 'vault', userId: '', vaultId: identity?.vaultId || '' };
}
function ownerMatchesTicket(owner, ticket) {
  return !!owner && !!ticket && owner.ownerType === ticket.ownerType && owner.vaultId === ticket.vaultId;
}
async function writePaidReadingTicket(ticket) { writes.push(ticket); }
function sendJson(_res, statusCode, payload) { responsePayload = { statusCode, payload }; }

${releaseHandlerSource}

this.runScenario = async () => {
  await handlePaidReadingTicketRelease({}, {});
  return { responsePayload, writes };
};`,
    context,
    { filename: 'paid-ticket-release-runtime-slice.js' }
  );
  return context.runScenario();
}

(async () => {
  const mismatch = await runReleaseScenario({
    requestPaidReadingId: 'new-paid-id-after-client-state-shift',
    ticketLockedReadingId: 'old-paid-id-from-failed-generation',
  });

  assert.strictEqual(mismatch.responsePayload.statusCode, 200, 'release must succeed for the owner even when paidReadingId drifted');
  assert.strictEqual(mismatch.responsePayload.payload.ok, true, 'release response must be ok');
  assert.strictEqual(mismatch.responsePayload.payload.lockMismatch, true, 'release response must report the lock id mismatch');
  assert.strictEqual(mismatch.writes.length, 1, 'release must clear the stale lock');
  assert.strictEqual(mismatch.writes[0].lockedReadingId, '', 'release must clear lockedReadingId');
  assert.strictEqual(mismatch.writes[0].lockedAt, '', 'release must clear lockedAt');

  const used = await runReleaseScenario({
    requestPaidReadingId: 'new-paid-id-after-client-state-shift',
    ticketLockedReadingId: 'old-paid-id-from-failed-generation',
    ticketStatus: 'used',
  });
  assert.strictEqual(used.responsePayload.statusCode, 200, 'used ticket release must remain idempotent');
  assert.strictEqual(used.writes.length, 0, 'used ticket release must not mutate used tickets');

  console.log('paid-ticket-release-runtime.test.js: ok');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
