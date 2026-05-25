const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(rootDir, 'uranai-v5.html'), 'utf8');

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

assert.ok(
  appSource.includes('async function retryCurrentPaidReadingAfterStop()'),
  'paid failure state must provide an in-place retry helper for an unused ticket'
);

assert.ok(
  appSource.includes('onclick="retryCurrentPaidReadingAfterStop()"'),
  'paid failure state must render a retry action after the ticket lock is released'
);

assert.strictEqual(
  appSource.includes("setText('#rs-len .rs-copy','ルノルマン2枚では"),
  false,
  'result Lenormand copy must not describe the paid 9-card result as a 2-card reading'
);

assert.ok(
  appSource.includes("setText('#rs-integration .rs-eyebrow','総合鑑定')"),
  'integration result eyebrow must avoid duplicating the first section heading'
);

assert.strictEqual(
  appSource.includes('美咲さん'),
  false,
  'paid local repair text must not hard-code the verification persona name'
);

assert.ok(
  appSource.includes("replace(/(この恋愛は、[^。]+。)この恋愛は/g,'$1今は')"),
  'dossier verdict normalization must collapse repeated love-subject openings'
);

assert.ok(
  appSource.includes("result_chat:{\n    provider:'openai'"),
  'result chat must be routed through the OpenAI-only task config'
);

assert.ok(
  appSource.includes('model:AI_MODELS.resultChat'),
  'result chat must use the dedicated OpenAI resultChat model'
);

assert.strictEqual(
  appSource.includes("PAID_MODEL_AB_TEST_TASKS=new Set(['paid','dossier','followup','result_chat'])"),
  false,
  'result chat must not be included in paid Anthropic/OpenAI A/B routing'
);

assert.ok(
  appSource.includes("syncResultChatAvailability({autoOpen:true})"),
  'paid success path must auto-open the result chat after the ticket is marked used'
);

assert.ok(
  htmlSource.includes('id="result-chat-drawer"') && htmlSource.includes('id="result-chat-launcher"'),
  'result screen must include the result-chat popout and persistent launcher'
);

assert.ok(
  htmlSource.includes('images/ui/rashin-chat-mini.png') && htmlSource.includes('result-chat-character'),
  'result chat popout must show the configured mini character asset'
);

assert.strictEqual(
  /次に見たいこと|次に見ること|次に意識すること/.test(`${appSource}\n${htmlSource}`),
  false,
  'result chat copy must not imply another paid next-reading prompt'
);

assert.ok(
  serverSource.includes("resultChat: process.env.OPENAI_RESULT_CHAT_MODEL || process.env.OPENAI_LIGHT_MODEL || 'gpt-5.4-mini'"),
  'server must expose a dedicated OpenAI mini model for result chat'
);

assert.ok(
  serverSource.includes('function isResultChatTask') && serverSource.includes('requiresPaidAccess(payload)'),
  'server must treat result chat as a paid-entitled task even though it uses OpenAI'
);

assert.ok(
  serverSource.includes("ticket.status === 'used' && ticket.usedReadingId === paidReadingId"),
  'result chat must allow the same paid result after the ticket has been used'
);

console.log('paid-reading-quality-gate.test.js: ok');
