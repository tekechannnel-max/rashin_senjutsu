const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
const reusableCodeConfig = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'config', 'rashin-reusable-paid-code-hashes.json'), 'utf8')
);

function sliceFromMarker(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `Missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notStrictEqual(end, -1, `Missing marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

const boothVerifierBody = sliceFromMarker(
  serverSource,
  'async function verifyBoothOrderReferenceWithGmail',
  'function getBoothPaymentPayload'
);

assert.ok(
  boothVerifierBody.indexOf('boothOrderReferenceAllowlisted(orderReference)') >= 0,
  'BOOTH order verification must support the confirmed order-number hash allowlist'
);

assert.ok(
  boothVerifierBody.indexOf('boothOrderReferenceAllowlisted(orderReference)') <
    boothVerifierBody.indexOf('BOOTH_GMAIL_NOT_CONFIGURED'),
  'BOOTH allowlist verification must run before Gmail configuration failure'
);

assert.ok(
  serverSource.includes('function boothOrderClaimVerificationConfigured()'),
  'BOOTH readiness must be based on a real verification path'
);

assert.ok(
  serverSource.includes('boothOrderClaimVerificationConfigured: boothOrderClaimVerificationConfigured()'),
  'health must expose whether BOOTH order-number verification is configured'
);

const purchaseIntentBody = sliceFromMarker(
  serverSource,
  'async function handleRashinPaidCodePurchaseIntent',
  'async function handleRashinPaidCodeRedeem'
);

assert.ok(
  purchaseIntentBody.includes('!boothOrderClaimVerificationConfigured()'),
  'BOOTH purchase intent must only reject setup when no order-number verification path exists'
);

const boothClientBody = sliceFromMarker(
  appSource,
  'async function requestRashinCodePurchaseBooth',
  'requestRashinCodePurchase=requestRashinCodePurchaseBooth'
);

assert.strictEqual(
  boothClientBody.includes('BOOTH購入番号の自動照合は準備中です'),
  false,
  'client must not stop the BOOTH order-number flow with the old preparation-only message'
);

assert.strictEqual(
  boothClientBody.includes('if(!RASHIN_BOOTH_ORDER_CLAIM_READY)'),
  false,
  'client must not hide the BOOTH order-number claim flow based only on health readiness'
);

assert.ok(
  appSource.includes('function hasUsableActivePaidReadingTicket()'),
  'client must have a single guard for whether an active paid ticket is still usable'
);

assert.ok(
  appSource.includes("if(plan==='paid'&&!isMemberActive()&&!hasUsableActivePaidReadingTicket())"),
  'paid start must not accept a stale or already-used paid ticket'
);

assert.ok(
  appSource.includes("if(!isMemberActive()&&!hasUsableActivePaidReadingTicket())"),
  'paid upgrade must not accept a stale or already-used paid ticket'
);

assert.ok(
  appSource.includes("if(ticketStatus&&ticketStatus!=='unused')"),
  'client must reject a redeemed Rashin-code response if the returned ticket is already used'
);

assert.ok(
  boothClientBody.includes('const reuseActiveSource=canReuseActivePaidSourceForPendingCode();') &&
    boothClientBody.includes('sourceReadingId=reuseActiveSource?ACTIVE_PAID_SOURCE_READING_ID:createReadingId();'),
  'direct Rashin-code starts must create a fresh source reading after a previous ticket has been used'
);

const advertisedReusableHash = '0820a04669514cfbd7845e70a0f8b2203d46ac18af400062f96e1761f682f1fe';
const advertisedReusableEntry = (Array.isArray(reusableCodeConfig.hashes) ? reusableCodeConfig.hashes : [])
  .find(entry => (typeof entry === 'string' ? entry : entry?.hash) === advertisedReusableHash);

assert.ok(
  advertisedReusableEntry && typeof advertisedReusableEntry === 'object',
  'advertised reusable Rashin code must keep an explicit expiry entry'
);

assert.ok(
  new Date(advertisedReusableEntry.expiresAt).getTime() >= new Date('2026-05-30T16:47:30.097+09:00').getTime(),
  'advertised reusable Rashin code must remain valid through the compensation window'
);

console.log('booth-paid-access-flow.test.js: ok');
