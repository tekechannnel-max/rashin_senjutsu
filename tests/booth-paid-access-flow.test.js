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

const userRequestBody = sliceFromMarker(
  serverSource,
  'async function readGoogleUserForRequest',
  'async function ensureDir'
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
  userRequestBody.includes("authSession?.source === 'developer'") &&
    userRequestBody.includes('readDeveloperEmailFromHeader(req)'),
  'local developer auth must be accepted by paid-code APIs so the full paid flow can be tested'
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

const boothModalBody = sliceFromMarker(
  appSource,
  'function openBoothOrderModal',
  'async function requestRashinCodePurchaseBooth'
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
  serverSource.includes("process.env.DEEP_READING_PRERELEASE_AMOUNT || '2000'") &&
    serverSource.includes("process.env.DEEP_READING_RELEASE_AMOUNT || '2000'") &&
    serverSource.includes('String(DEEP_READING_RELEASE_AMOUNT)'),
  'server BOOTH purchase amount must default to the 2000 yen release amount'
);

assert.ok(
  appSource.includes('const DEEP_READING_PRICE=DEEP_READING_RELEASE_PRICE;') &&
    appSource.includes('const DEEP_READING_RELEASE_PRICE=2000;'),
  'client paid amount must render and track the 2000 yen release amount'
);

assert.ok(
  boothModalBody.includes('booth-rashin-code-input') &&
    boothModalBody.includes('booth-rashin-code-submit') &&
    boothModalBody.includes('savePendingRashinPaidCode(code)'),
  'BOOTH modal must include inline Rashin-code input below the order-number field'
);

assert.strictEqual(
  boothModalBody.includes('id="booth-reference-code"'),
  false,
  'BOOTH modal must not use the old separate Rashin-code prompt button'
);

assert.strictEqual(
  boothModalBody.includes('フィードバックやご感想も、同じ連絡先でお待ちしております。'),
  false,
  'BOOTH modal help copy must stay compact'
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

const reusableHashes = Array.isArray(reusableCodeConfig.hashes) ? reusableCodeConfig.hashes : [];
const revokedVerificationHash = '0820a04669514cfbd7845e70a0f8b2203d46ac18af400062f96e1761f682f1fe';
const revokedVerificationEntry = reusableHashes
  .find(entry => (typeof entry === 'string' ? entry : entry?.hash) === revokedVerificationHash);

assert.ok(
  !revokedVerificationEntry,
  'revoked verification Rashin code must not remain reusable'
);

assert.ok(
  reusableCodeConfig.count === reusableHashes.length,
  'reusable Rashin code count must match configured hashes'
);

console.log('booth-paid-access-flow.test.js: ok');
