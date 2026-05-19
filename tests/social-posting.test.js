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

function assertTracked(text, trackedUrl, label) {
  assert.match(String(text || ''), /rashin-senjutsu\.onrender\.com/, `${label} needs visible app URL`);
  assert.match(trackedUrl, /https:\/\/rashin-senjutsu\.onrender\.com\/\S*utm_source=/, `${label} needs tracked URL`);
  assert.match(trackedUrl, /[?&]utm_medium=social\b/, `${label} needs utm_medium`);
  assert.match(trackedUrl, /[?&]utm_campaign=/, `${label} needs utm_campaign`);
  assert.match(trackedUrl, /[?&]utm_content=/, `${label} needs utm_content`);
}

function assertImageAndAlt(imagePath, altText, label) {
  assert.ok(imagePath, `${label} imagePath is required`);
  assert.ok(fs.existsSync(imagePath), `${label} image does not exist: ${imagePath}`);
  assert.ok(String(altText || '').trim().length >= 10, `${label} alt text is too short`);
}

function normalizePlatformOnlyUrl(text) {
  return String(text || '')
    .replace(/https:\/\/rashin-senjutsu\.onrender\.com/g, 'rashin-senjutsu.onrender.com')
    .replace(/(^|\n)#[^\s#]+(?:\s+#[^\s#]+)*/g, '$1#<platform-tags>')
    .replace(/utm_source=(threads|bluesky)/g, 'utm_source=<platform>');
}

function countHashtags(text) {
  return (String(text || '').match(/(^|\s)#[^\s#]+/g) || []).length;
}

function testDraftHasTrackingImagesAndAlt() {
  const draft = parseDraft();
  assertTracked(draft.oracle.text, draft.oracle.trackedUrl, 'threads oracle');
  assertTracked(draft.oracle.blueskyText, draft.oracle.blueskyTrackedUrl, 'bluesky oracle');
  assertTracked(draft.oracle.xText, draft.oracle.xTrackedUrl, 'x oracle');
  assertTracked(draft.midday.text, draft.midday.trackedUrl, 'threads midday');
  assertTracked(draft.midday.blueskyText, draft.midday.blueskyTrackedUrl, 'bluesky midday');
  assertTracked(draft.midday.xText, draft.midday.xTrackedUrl, 'x midday');
  assertTracked(draft.concept.text, draft.concept.trackedUrl, 'threads concept');
  assertTracked(draft.concept.blueskyText, draft.concept.blueskyTrackedUrl, 'bluesky concept');
  assertTracked(draft.concept.xText, draft.concept.xTrackedUrl, 'x concept');

  assertImageAndAlt(draft.oracle.imagePath, draft.oracle.altText, 'oracle');
  assertImageAndAlt(draft.midday.imagePath, draft.midday.altText, 'threads midday');
  assertImageAndAlt(draft.midday.blueskyImagePath, draft.midday.altText, 'bluesky midday');
  assertImageAndAlt(draft.concept.imagePath, draft.concept.altText, 'threads concept');
  assertImageAndAlt(draft.concept.blueskyImagePath, draft.concept.altText, 'bluesky concept');
  assert.ok(fs.statSync(draft.oracle.blueskyImagePath).size <= 1_000_000, 'Bluesky oracle image must be <= 1,000,000 bytes');
  assert.ok(fs.statSync(draft.midday.blueskyImagePath).size <= 1_000_000, 'Bluesky midday image must be <= 1,000,000 bytes');
  assert.ok(fs.statSync(draft.concept.blueskyImagePath).size <= 1_000_000, 'Bluesky concept image must be <= 1,000,000 bytes');
}

function testPlatformHashtagPolicy() {
  const draft = parseDraft('2026-05-20');
  const blueskyTags = ['#羅針占術', '#今日の占い', '#今日の運勢', '#占い師'];
  for (const kind of ['oracle', 'midday', 'concept']) {
    assert.match(draft[kind].text, /#占い鑑定/, `${kind} Threads post should use #占い鑑定`);
    assert.doesNotMatch(draft[kind].text, /#羅針占術/, `${kind} Threads post should not use #羅針占術`);
    assert.equal(countHashtags(draft[kind].text), 1, `${kind} Threads post should keep one hashtag`);

    for (const tag of blueskyTags) {
      assert.ok(draft[kind].blueskyText.includes(tag), `${kind} Bluesky post should include ${tag}`);
    }
    assert.equal(countHashtags(draft[kind].blueskyText), blueskyTags.length, `${kind} Bluesky post should use the configured hashtags`);

    assert.match(draft[kind].xText, /#羅針占術/, `${kind} X draft should keep the brand tag`);
    assert.doesNotMatch(draft[kind].xText, /#占い鑑定/, `${kind} X draft should not use the Threads tag`);
  }
  assert.equal(draft.meta.policy.threadsHashtag, '#占い鑑定', 'policy should expose the Threads discovery tag');
  assert.equal(draft.meta.policy.blueskyHashtags, blueskyTags.join(' '), 'policy should expose the Bluesky hashtag line');
}

function testMiddayCopyIsSharedAcrossThreadsAndBluesky() {
  const draft = parseDraft();
  const middaySpecificPattern = /恋愛|仕事|進路|お金|人間関係|復縁|曖昧な関係|収支|支出|連絡|評価|役割|境界線/;
  assert.equal(
    normalizePlatformOnlyUrl(draft.midday.text),
    normalizePlatformOnlyUrl(draft.midday.blueskyText),
    'Threads and Bluesky midday copy should match except Bluesky clickable URL protocol',
  );
  assert.ok([...draft.midday.blueskyText].length <= 300, 'Bluesky midday post must stay within 300 characters');
  assert.match(draft.midday.text, /昼の羅針｜/, 'midday post should use the lunch-slot title');
  assert.match(draft.midday.text, /無料鑑定はこちら/, 'midday post should include the free reading CTA');
  assert.match(draft.midday.text, /\brashin-senjutsu\.onrender\.com\b/, 'midday post should use the short visible URL');
  assert.match(draft.midday.blueskyText, /https:\/\/rashin-senjutsu\.onrender\.com\b/, 'Bluesky midday post should use a clickable URL');
  assert.doesNotMatch(draft.midday.text, middaySpecificPattern, 'midday Threads post should stay general, not topic-specific');
  assert.doesNotMatch(draft.midday.blueskyText, middaySpecificPattern, 'midday Bluesky post should stay general, not topic-specific');
  assert.doesNotMatch(draft.midday.xText, middaySpecificPattern, 'midday X draft should stay general, not topic-specific');
  assert.doesNotMatch(draft.midday.text, /utm_source=|utm_content=/, 'midday visible text should not include long tracking parameters');
  assert.match(draft.midday.trackedUrl, /utm_content=midday_20260518/, 'midday tracked URL should use the midday utm_content');
  assert.match(draft.midday.blueskyTrackedUrl, /utm_source=bluesky/, 'Bluesky midday tracked URL should keep the Bluesky source in the ledger');
}

function testNightConceptCopyIsSharedAcrossThreadsAndBluesky() {
  const draft = parseDraft();
  assert.equal(
    normalizePlatformOnlyUrl(draft.concept.text),
    normalizePlatformOnlyUrl(draft.concept.blueskyText),
    'Threads and Bluesky night concept copy should match except platform UTM source',
  );
  assert.ok([...draft.concept.blueskyText].length <= 300, 'Bluesky night concept post must stay within 300 characters');
  assert.doesNotMatch(draft.concept.text, /羅針メモ\d{4}/, 'night concept post should not use weak daily memo filler');
  assert.match(draft.concept.text, /他のAI占い|羅針占術|姓名判断|四柱推命|動物タイプ診断|次の一手/, 'night concept post should explain the app difference or capability');
}

function testMorningOracleCopyIsSharedAcrossThreadsAndBluesky() {
  const draft = parseDraft();
  assert.equal(
    normalizePlatformOnlyUrl(draft.oracle.text),
    normalizePlatformOnlyUrl(draft.oracle.blueskyText),
    'Threads and Bluesky morning oracle copy should match except platform UTM source',
  );
  assert.ok([...draft.oracle.blueskyText].length <= 300, 'Bluesky morning oracle post must stay within 300 characters');
  assert.match(draft.oracle.text, /\brashin-senjutsu\.onrender\.com\b/, 'morning oracle post should use the short visible URL');
  assert.match(draft.oracle.blueskyText, /https:\/\/rashin-senjutsu\.onrender\.com\b/, 'Bluesky morning oracle post should use a clickable URL');
  assert.doesNotMatch(draft.oracle.text, /utm_source=|utm_content=|\/share\/card/, 'morning oracle visible text should not include long tracking URL');
  assert.doesNotMatch(draft.oracle.blueskyText, /utm_source=|utm_content=|\/share\/card/, 'Bluesky morning oracle visible text should not include long tracking URL');
  assert.match(draft.oracle.text, /今日の一手：/, 'morning oracle post should keep the today one-move label');
  assert.match(draft.oracle.blueskyText, /今日の一手：/, 'Bluesky morning oracle post should keep the today one-move label');
  assert.ok(!draft.oracle.text.includes(draft.oracle.card.action), 'morning oracle post must not publish the exact card action');
  assert.ok(!draft.oracle.blueskyText.includes(draft.oracle.card.action), 'Bluesky morning oracle post must not publish the exact card action');
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function testMiddayPostsStayGeneralAcrossCalendar() {
  const middaySpecificPattern = /恋愛|仕事|進路|お金|人間関係|復縁|曖昧な関係|収支|支出|連絡|評価|役割|境界線/;
  for (let offset = 0; offset < 25; offset += 1) {
    const dateKey = addDays('2026-05-13', offset);
    const draft = parseDraft(dateKey);
    assert.doesNotMatch(draft.midday.text, middaySpecificPattern, `${dateKey} Threads midday post is too specific`);
    assert.doesNotMatch(draft.midday.blueskyText, middaySpecificPattern, `${dateKey} Bluesky midday post is too specific`);
    assert.doesNotMatch(draft.midday.xText, middaySpecificPattern, `${dateKey} X midday draft is too specific`);
  }
}

function testMorningOracleAllCardsAreExpandedNearBlueskyLimit() {
  const seen = new Map();
  for (let offset = 0; offset < 140 && seen.size < 33; offset += 1) {
    const draft = parseDraft(addDays('2026-05-16', offset));
    if (!seen.has(draft.oracle.card.id)) {
      seen.set(draft.oracle.card.id, draft);
    }
  }
  assert.equal(seen.size, 33, 'morning oracle should cover all 33 fixed cards in the verification range');
  const lengths = [];
  for (const draft of seen.values()) {
    const length = [...draft.oracle.blueskyText].length;
    lengths.push(length);
    assert.ok(length >= 250, `card ${draft.oracle.card.id} morning oracle is too short: ${length}`);
    assert.ok(length <= 300, `card ${draft.oracle.card.id} morning oracle is too long: ${length}`);
    assert.match(draft.oracle.text, /カードメッセージ：/, `card ${draft.oracle.card.id} needs a card message line`);
    assert.doesNotMatch(draft.oracle.text, /問いかけ：/, `card ${draft.oracle.card.id} must not include a question line`);
    assert.match(draft.oracle.text, new RegExp(`${draft.oracle.card.name}\\n\\nテーマ：${draft.oracle.card.title}`), `card ${draft.oracle.card.id} should separate card name and theme`);
    assert.match(draft.oracle.text, /今日の一手：/, `card ${draft.oracle.card.id} needs a today one-move line`);
    assert.ok(!draft.oracle.text.includes(draft.oracle.card.action), `card ${draft.oracle.card.id} must not publish the exact card action`);
  }
  const average = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  assert.ok(average >= 285 && average <= 298, `average morning oracle length should stay near the expanded Bluesky hashtag limit: ${average}`);
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
  assert.equal(rows.length, 7, 'ledger should contain header plus six draft rows');
  assert.match(rows[0], /post_key,date,kind,platform,status/, 'ledger header is missing expected columns');
  assert.match(csv, /utm_content=oracle_20260518/, 'oracle tracked URL is missing from ledger');
  assert.match(csv, /utm_content=midday_20260518/, 'midday tracked URL is missing from ledger');
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

function testStatelessScheduleCapsWideGraceWindow() {
  const stateFile = path.join(ROOT, '.tmp-social-schedule-state.json');
  fs.rmSync(stateFile, { force: true });
  const result = runNode([
    'scripts/social/run-scheduled-posts.js',
    '--once',
    '--dry-run',
    '--only-kind=oracle',
  ], {
    env: {
      SOCIAL_STATELESS_MODE: 'true',
      SOCIAL_POST_GRACE_MINUTES: '30',
      SOCIAL_NOW_ISO: '2026-05-18T22:05:00.000Z',
      SOCIAL_SCHEDULE_STATE_FILE: stateFile,
    },
  });
  const report = JSON.parse(result.stdout);
  assert.equal(report.date, '2026-05-19', 'schedule dry-run should use the JST date');
  assert.equal(report.configuredGraceMinutes, 30, 'report should keep the configured grace window visible');
  assert.equal(report.graceMinutes, 2, 'stateless runs should cap the effective grace window');
  assert.equal(report.graceCappedForStateless, true, 'report should flag the stateless cap');
  assert.deepEqual(report.due, [], 'a 07:05 stateless repeat tick must not repost the 07:00 oracle');
  assert.deepEqual(report.expired, ['oracle'], 'the repeat tick should be treated as expired after the narrow window');
  fs.rmSync(stateFile, { force: true });
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
testPlatformHashtagPolicy();
testMorningOracleCopyIsSharedAcrossThreadsAndBluesky();
testMorningOracleAllCardsAreExpandedNearBlueskyLimit();
testMiddayCopyIsSharedAcrossThreadsAndBluesky();
testMiddayPostsStayGeneralAcrossCalendar();
testNightConceptCopyIsSharedAcrossThreadsAndBluesky();
testPostsLedgerWriteIsTraceableAndSecretSafe();
testRealPostingRequiresExplicitYesOutsideScheduler();
testStatelessScheduleCapsWideGraceWindow();
testBroadSocialAuditPasses();

console.log('social-posting tests passed');
