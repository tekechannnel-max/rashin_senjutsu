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

function countOccurrences(source, pattern) {
  return (source.match(pattern) || []).length;
}

const paidRunBody = sliceFromMarker(
  appSource,
  'async function runPaidCombinedReading()',
  '// ─── ②ルノルマンリーディング'
);

const failurePath = sliceFromMarker(
  paidRunBody,
  "type:'paid_generation_failed'",
  'return false;'
);

const releaseIndex = failurePath.indexOf('releasePaidReadingTicketLock()');
const renderStopIndex = failurePath.indexOf("renderPaidCombinedOutputs({len:'',orc:'',integration:''},name,cat,theme,{...paidDebugContext,allowFallback:false");
const markUsedIndex = failurePath.indexOf('markPaidReadingTicketUsed()');

assert.ok(releaseIndex >= 0, 'paid failure path must try to release the ticket lock');
assert.ok(renderStopIndex >= 0, 'paid failure path must render the non-fallback stop state');
assert.ok(releaseIndex < renderStopIndex, 'ticket lock release must be attempted before rendering the stop state');
assert.strictEqual(markUsedIndex, -1, 'paid failure path must not mark the ticket as used');
assert.ok(failurePath.includes('ticket_release_unconfirmed'), 'paid failure path must surface unconfirmed ticket release state');

assert.strictEqual(
  appSource.includes('paid_generation_fallback_rendered'),
  false,
  'paid failure path must not retain the old fallback delivery event'
);

assert.ok(
  countOccurrences(paidRunBody, /evaluatePaidReadingQuality\(/g) >= 3,
  'paid generation must use the async quality evaluator for initial, supplement, and retry checks'
);

assert.strictEqual(
  paidRunBody.includes('validatePaidReadingQuality(parsed'),
  false,
  'paid generation must not bypass the async quality evaluator with only local validation'
);

const successRenderIndex = paidRunBody.indexOf('renderPaidCombinedOutputs(parsed,name,cat,theme,{...paidDebugContext,allowFallback:true}');
const completeUiIndex = paidRunBody.indexOf('await completeResultGenerationUI();', successRenderIndex);
const successMarkUsedIndex = paidRunBody.indexOf('await markPaidReadingTicketUsed();', successRenderIndex);

assert.ok(successRenderIndex >= 0, 'paid success path must render a successful paid output');
assert.ok(completeUiIndex > successRenderIndex, 'paid success path must complete the result UI after rendering output');
assert.ok(successMarkUsedIndex > completeUiIndex, 'paid ticket must be marked used only after successful render and UI completion');

const releaseFunction = sliceFromMarker(
  appSource,
  'async function releasePaidReadingTicketLock()',
  'async function openStripeCheckout'
);

assert.ok(
  releaseFunction.includes('ACTIVE_PAID_READING_TICKET={...ACTIVE_PAID_READING_TICKET,status:data?.ticketStatus'),
  'release helper must refresh the local ticket status after a successful release'
);

console.log('paid-reading-quality-gate.test.js: ok');
