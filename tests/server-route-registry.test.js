const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

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

const pageRoutes = sliceFromMarker(serverSource, 'const PAGE_ROUTES = [', 'const API_ROUTES = [');
const apiRoutes = sliceFromMarker(serverSource, 'const API_ROUTES = [', 'function routeMatches');
const handleRequestBody = sliceFromMarker(serverSource, 'async function handleRequest(req, res) {', 'function createServer()');

function assertRoute(registry, method, prefix, handlerMarker) {
  const prefixMarker = `prefix: '${prefix}'`;
  const prefixIndex = registry.indexOf(prefixMarker);
  assert.notStrictEqual(prefixIndex, -1, `Missing route prefix: ${prefix}`);

  const routeStart = registry.lastIndexOf('{', prefixIndex);
  const routeEnd = registry.indexOf('}', prefixIndex);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, `Route entry is not bounded: ${prefix}`);

  const routeEntry = registry.slice(routeStart, routeEnd);
  assert.ok(routeEntry.includes(`method: '${method}'`), `${prefix} must be registered as ${method}`);
  assert.ok(routeEntry.includes(handlerMarker), `${prefix} must dispatch through ${handlerMarker}`);
}

[
  ['GET', '/share/card', 'handleShareCardPage'],
  ['GET', '/auth/threads/callback', 'handleThreadsCallbackPage'],
  ['GET', '/auth/threads/uninstall', "'uninstall'"],
  ['GET', '/auth/threads/delete', "'delete'"],
].forEach(([method, prefix, handlerMarker]) => assertRoute(pageRoutes, method, prefix, handlerMarker));

[
  ['GET', '/api/health', 'handleHealth'],
  ['GET', '/api/member/status', 'handleMemberStatus'],
  ['GET', '/api/rashin-bonus/status', 'handleRashinBonusStatus'],
  ['POST', '/api/rashin-bonus/claim', 'handleRashinBonusClaim'],
  ['POST', '/api/rashin-bonus/redeem-paid-ticket', 'handleRashinBonusRedeemPaidTicket'],
  ['GET', '/api/deep-reading/discount-status', 'handleDeepReadingDiscountStatus'],
  ['POST', '/api/rashin-paid-code/purchase-intent', 'handleRashinPaidCodePurchaseIntent'],
  ['POST', '/api/rashin-paid-code/redeem', 'handleRashinPaidCodeRedeem'],
  ['POST', '/api/rashin-paid-code/booth/claim', 'handleBoothOrderClaim'],
  ['POST', '/api/rashin-paid-code/booth/gmail-test', 'handleBoothGmailVerificationTest'],
  ['POST', '/api/rashin-paid-code/admin/issue', 'handleRashinPaidCodeAdminIssue'],
  ['POST', '/api/auth/google', 'handleGoogleAuth'],
  ['POST', '/api/member/session', 'handleMemberSession'],
  ['POST', '/api/rashin-code/redeem', 'handleRashinCodeRedeem'],
  ['POST', '/api/member/logout', 'handleMemberLogout'],
  ['POST', '/api/client-log', 'handleClientLog'],
  ['GET', '/api/provider-check', 'handleProviderCheck'],
  ['POST', '/api/stripe/checkout-session', 'STRIPE_CHECKOUT_DISABLED'],
  ['POST', '/api/paid-reading/prepare-ticket', 'handlePaidReadingTicketPrepare'],
  ['POST', '/api/paid-reading/use-ticket', 'handlePaidReadingTicketUse'],
  ['POST', '/api/paid-reading/release-ticket', 'handlePaidReadingTicketRelease'],
  ['GET', '/api/stripe/checkout/complete', 'handleStripeCheckoutComplete'],
  ['POST', '/api/stripe/portal-session', 'STRIPE_PORTAL_DISABLED'],
  ['POST', '/api/stripe/webhook', 'handleStripeWebhook'],
  ['POST', '/api/vault/history/query', 'handleVaultQuery'],
  ['POST', '/api/vault/history/save', 'handleVaultSave'],
  ['POST', '/api/vault/history/clear', 'handleVaultClear'],
].forEach(([method, prefix, handlerMarker]) => assertRoute(apiRoutes, method, prefix, handlerMarker));

assert.ok(
  apiRoutes.includes("prefixes: ['/api/ai/generate', '/api/anthropic/messages']") &&
    apiRoutes.includes('handler: handleAiProxy'),
  'AI proxy routes must share one explicit route-table entry'
);

assert.strictEqual(countOccurrences(pageRoutes, /method: '/g), 4, 'page route count changed unexpectedly');
assert.strictEqual(countOccurrences(apiRoutes, /method: '/g), 28, 'API route count changed unexpectedly');

assert.ok(serverSource.includes('async function handleHealth(req, res)'), 'health response must be isolated from request dispatch');
assert.ok(serverSource.includes('function dispatchRequestRoute(req, res, routes)'), 'request dispatch helper is missing');
assert.ok(handleRequestBody.includes('dispatchRequestRoute(req, res, PAGE_ROUTES)'), 'page routes must use registry dispatch');
assert.ok(handleRequestBody.includes('dispatchRequestRoute(req, res, API_ROUTES)'), 'API routes must use registry dispatch');
assert.strictEqual(
  countOccurrences(handleRequestBody, /req\.url\.startsWith\('\/api\//g),
  0,
  'handleRequest must not grow back into a raw API startsWith chain'
);

console.log('server-route-registry.test.js: ok');
