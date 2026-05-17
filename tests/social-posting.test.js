const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;

function runNode(args, options = {}) {
  const result = spawnSync(NODE, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
  });
  if (options.expectSuccess !== false) {
    assert.equal(result.status, 0, `${args.join(' ')} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

function parseDraft(date = '2026-05-18') {
  const result = runNode([
    'scripts/social/daily-oracle-post.js',
    '--dry-run',
    `--date=${date}`,
    '--platforms=threads,bluesky,x',
    '--kind=all',
  ]);
  return JSON.parse(result.stdout);
}

function assertTracked(text, label) {
  assert.match(text, /https:\/\/rashin-senjutsu\.onrender\.com\/\S*utm_source=/, `${label} needs tracked URL`);
  assert.match(text, /[?&]utm_medium=social\b/, `${label} needs utm_medium`);
  assert.match(text, /[?&]utm_campaign=/, `${label} needs utm_campaign`);
  assert.match(text, /[?&]utm_content=/, `${label} needs utm_content`);
}

function assertImageAndAlt(imagePath, altText, label) {
  assert.ok(imagePath, `${label} imagePath is required`);
  assert.ok(fs.existsSync(imagePath), `${label} image does not exist: ${imagePath}`);
  assert.ok(String(altText || '').trim().length >= 10, `${label} alt text is too short`);
}

function testDraftHasTrackingImagesAndAlt() {
  const draft = parseDraft();
  assertTracked(draft.oracle.text, 'threads oracle');
  assertTracked(draft.oracle.blueskyText, 'bluesky oracle');
  assertTracked(draft.oracle.xText, 'x oracle');
  assertTracked(draft.concept.text, 'threads concept');
  assertTracked(draft.concept.blueskyText, 'bluesky concept');
  assertTracked(draft.concept.xText, 'x concept');

  assertImageAndAlt(draft.oracle.imagePath, draft.oracle.altText, 'oracle');
  assertImageAndAlt(draft.concept.imagePath, draft.concept.altText, 'threads concept');
  assertImageAndAlt(draft.concept.blueskyImagePath, draft.concept.altText, 'bluesky concept');
  assert.ok(fs.statSync(draft.oracle.blueskyImagePath).size <= 1_000_000, 'Bluesky oracle image must be <= 1,000,000 bytes');
  assert.ok(fs.statSync(draft.concept.blueskyImagePath).size <= 1_000_000, 'Bluesky concept image must be <= 1,000,000 bytes');
}

function testPostsLedgerWriteIsTraceableAndSecretSafe() {
  const ledgerFile = path.join(ROOT, '.tmp-social-posts-test.csv');
  fs.rmSync(ledgerFile, { force: true });

  runNode([
    'scripts/social/daily-oracle-post.js',
    '--write',
    '--date=2026-05-18',
    '--platforms=threads,bluesky',
    '--kind=all',
  ], {
    env: {
      SOCIAL_POSTS_LEDGER_FILE: ledgerFile,
      THREADS_ACCESS_TOKEN: 'unit-test-threads-token',
      BLUESKY_APP_PASSWORD: 'unit-test-bluesky-password',
    },
  });

  const csv = fs.readFileSync(ledgerFile, 'utf8');
  const rows = csv.trim().split(/\r?\n/);
  assert.equal(rows.length, 5, 'ledger should contain header plus four draft rows');
  assert.match(rows[0], /post_key,date,kind,platform,status/, 'ledger header is missing expected columns');
  assert.match(csv, /utm_content=oracle_20260518/, 'oracle tracked URL is missing from ledger');
  assert.match(csv, /utm_content=concept_20260518/, 'concept tracked URL is missing from ledger');
  assert.doesNotMatch(csv, /unit-test-threads-token|unit-test-bluesky-password/, 'ledger must not leak tokens');
  assert.doesNotMatch(csv, /今日の|羅針占術|無料鑑定/, 'ledger should store hashes, URLs, and metadata, not full post copy');

  fs.rmSync(ledgerFile, { force: true });
}

function testRealPostingRequiresExplicitYesOutsideScheduler() {
  const ledgerFile = path.join(ROOT, '.tmp-social-posts-preview-test.csv');
  fs.rmSync(ledgerFile, { force: true });
  const result = runNode([
    'scripts/social/daily-oracle-post.js',
    '--post',
    '--date=2026-05-18',
    '--platforms=bluesky',
    '--kind=oracle',
  ], {
    expectSuccess: false,
    env: {
      SOCIAL_POSTS_LEDGER_FILE: ledgerFile,
      SOCIAL_AUTOMATED_POSTING_ENABLED: 'false',
      SOCIAL_SCHEDULED_RUN: 'false',
    },
  });

  assert.notEqual(result.status, 0, 'posting without --yes or scheduler context must fail');
  assert.match(result.stderr, /explicit yes|Type yes/, 'failure should explain the required yes confirmation');
  fs.rmSync(ledgerFile, { force: true });
}

function testBroadSocialAuditPasses() {
  const result = runNode([
    'scripts/social/audit-social-drafts.js',
    '--from=2026-05-13',
    '--to=2026-06-06',
    '--platforms=threads,bluesky,x',
  ]);
  assert.match(result.stdout, /"errors": 0/, 'audit should report zero errors');
}

testDraftHasTrackingImagesAndAlt();
testPostsLedgerWriteIsTraceableAndSecretSafe();
testRealPostingRequiresExplicitYesOutsideScheduler();
testBroadSocialAuditPasses();

console.log('social-posting tests passed');
