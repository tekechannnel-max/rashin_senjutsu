const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const ACTIVE_KINDS = ['oracle', 'empathy', 'difference', 'free_paid_compare'];

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

function parseDraft(date = '2026-05-27', options = {}) {
  const result = runNode([
    'scripts/social/daily-oracle-post.js',
    '--dry-run',
    `--date=${date}`,
    '--platforms=threads,bluesky,x,instagram',
    '--kind=all',
  ], options);
  return JSON.parse(result.stdout);
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function scheduledDates(from, weekdays, count) {
  const dates = [];
  for (let date = from; dates.length < count; date = addDays(date, 1)) {
    if (weekdays.includes(new Date(`${date}T00:00:00.000Z`).getUTCDay())) dates.push(date);
  }
  return dates;
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
  for (const kind of ACTIVE_KINDS) {
    assertTracked(draft[kind].text, draft[kind].trackedUrl, `threads ${kind}`);
    assertTracked(draft[kind].blueskyText, draft[kind].blueskyTrackedUrl, `bluesky ${kind}`);
    assertTracked(draft[kind].xText, draft[kind].xTrackedUrl, `x ${kind}`);
    assertTracked(draft[kind].instagramText, draft[kind].instagramTrackedUrl, `instagram ${kind}`);
    assertImageAndAlt(draft[kind].imagePath, draft[kind].altText, `threads ${kind}`);
    assertImageAndAlt(draft[kind].blueskyImagePath, draft[kind].altText, `bluesky ${kind}`);
    assertImageAndAlt(draft[kind].instagramImagePath, draft[kind].altText, `instagram ${kind}`);
    assert.match(draft[kind].instagramImageUrl, /\.jpg$/i, `${kind} Instagram image must be JPEG`);
    if (kind === 'oracle') {
      assert.match(draft[kind].imagePath, /images[\\/]social[\\/]instagram[\\/]oracle[\\/]\d{2}\.jpg$/, 'oracle Threads should use the text-added generated image');
      assert.match(draft[kind].imageUrl, /\/images\/social\/instagram\/oracle\/\d{2}\.jpg$/, 'oracle Threads URL should use the generated image');
      assert.match(draft[kind].instagramImagePath, /images[\\/]social[\\/]instagram[\\/]oracle[\\/]\d{2}\.jpg$/, 'oracle Instagram should use the text-added generated image');
      assert.match(draft[kind].instagramImageUrl, /\/images\/social\/instagram\/oracle\/\d{2}\.jpg$/, 'oracle Instagram URL should use the generated image');
    } else if (kind === 'empathy') {
      assert.match(draft[kind].imagePath, /images[\\/]social[\\/]instagram[\\/]lenormand-empathy[\\/]\d{2}\.jpg$/, 'empathy Threads should use the text-added generated image');
      assert.match(draft[kind].imageUrl, /\/images\/social\/instagram\/lenormand-empathy\/\d{2}\.jpg$/, 'empathy Threads URL should use the generated image');
      assert.match(draft[kind].instagramImagePath, /images[\\/]social[\\/]instagram[\\/]lenormand-empathy[\\/]\d{2}\.jpg$/, 'empathy Instagram should use the text-added generated image');
      assert.match(draft[kind].instagramImageUrl, /\/images\/social\/instagram\/lenormand-empathy\/\d{2}\.jpg$/, 'empathy Instagram URL should use the generated image');
    } else if (kind === 'difference') {
      assert.match(draft[kind].instagramImagePath, /images[\\/]social[\\/]instagram[\\/]difference\.jpg$/, 'difference Instagram should use the dedicated Instagram image');
    } else if (kind === 'free_paid_compare') {
      assert.match(draft[kind].instagramImagePath, /images[\\/]social[\\/]instagram[\\/]free-paid-compare\.jpg$/, 'free_paid_compare Instagram should use the dedicated Instagram image');
    }
    assert.ok(fs.statSync(draft[kind].blueskyImagePath).size <= 1_000_000, `${kind} Bluesky image must be <= 1,000,000 bytes`);
  }
}

function testPlatformHashtagPolicy() {
  const draft = parseDraft('2026-06-06');
  const legacyEnvDraft = parseDraft('2026-06-06', {
    env: { SOCIAL_THREADS_HASHTAG: '#占い鑑定' },
  });
  const customInstagramDraft = parseDraft('2026-06-06', {
    env: { SOCIAL_INSTAGRAM_HASHTAGS: '#one #two #three #four #five #six' },
  });
  const blueskyTags = ['#羅針占術', '#今日の占い', '#今日の運勢', '#占い師'];
  const instagramKindTags = {
    oracle: ['#今日の占い', '#オラクルカード'],
    empathy: ['#ルノルマンカード', '#悩み相談'],
    difference: ['#AI占い', '#無料占い'],
    free_paid_compare: ['#無料占い', '#ルノルマンカード'],
  };
  for (const kind of ACTIVE_KINDS) {
    assert.match(draft[kind].text, /#占い師のつぶやき/, `${kind} Threads post should use #占い師のつぶやき`);
    assert.doesNotMatch(draft[kind].text, /#羅針占術/, `${kind} Threads post should not use #羅針占術`);
    assert.equal(countHashtags(draft[kind].text), 1, `${kind} Threads post should keep one hashtag`);
    assert.match(legacyEnvDraft[kind].text, /#占い師のつぶやき/, `${kind} legacy Threads hashtag env should normalize to #占い師のつぶやき`);
    assert.doesNotMatch(legacyEnvDraft[kind].text, /#占い鑑定/, `${kind} legacy Threads hashtag env should not leak #占い鑑定`);

    for (const tag of blueskyTags) {
      assert.ok(draft[kind].blueskyText.includes(tag), `${kind} Bluesky post should include ${tag}`);
    }
    assert.equal(countHashtags(draft[kind].blueskyText), blueskyTags.length, `${kind} Bluesky post should use configured hashtags`);

    assert.match(draft[kind].xText, /#羅針占術/, `${kind} X draft should keep the brand tag`);
    assert.doesNotMatch(draft[kind].xText, /#占い師のつぶやき/, `${kind} X draft should not use the Threads tag`);

    assert.match(draft[kind].instagramText, /#羅針占術/, `${kind} Instagram post should keep the brand tag`);
    assert.equal(countHashtags(draft[kind].instagramText), 5, `${kind} Instagram post should use five focused hashtags`);
    for (const tag of instagramKindTags[kind]) {
      assert.ok(draft[kind].instagramText.includes(tag), `${kind} Instagram post should include ${tag}`);
    }
    assert.doesNotMatch(draft[kind].instagramText, /#占い鑑定/, `${kind} Instagram post should not use the legacy Threads tag`);
    assert.equal(countHashtags(customInstagramDraft[kind].instagramText), 5, `${kind} custom Instagram hashtags should be capped at five`);
    assert.doesNotMatch(customInstagramDraft[kind].instagramText, /#six/, `${kind} custom Instagram hashtags should drop tags after the fifth`);
  }
}

function testMorningOracleCopyStillKeepsRequiredClosing() {
  const draft = parseDraft('2026-05-27');
  assert.match(draft.oracle.text, /今日の数秘オラクル/, 'morning oracle post should keep the oracle label');
  assert.ok(draft.oracle.text.trim().endsWith('今日の1枚はこちら'), 'oracle Threads post must keep the required closing line');
  assert.doesNotMatch(draft.oracle.text, /utm_source=|utm_content=|\/share\/card/, 'oracle visible text should not include long tracking URL');
  assert.match(draft.oracle.trackedUrl, /utm_content=oracle_20260527/, 'oracle tracked URL should keep the oracle utm_content');
}

function testEmpathyUsesRandomLenormandRotation() {
  const seen = new Set();
  for (const dateKey of scheduledDates('2026-05-27', [1, 3, 5], 36)) {
    const draft = parseDraft(dateKey);
    const cardNumber = draft.empathy.card.cardNumber;
    seen.add(cardNumber);
    assert.match(draft.empathy.text, /ルノルマンカード「.+」/, `${dateKey} empathy post should show card name`);
    assert.match(draft.empathy.text, /迷いを現実の流れとして読みます。/, `${dateKey} empathy post should keep soft CTA`);
    assert.match(draft.empathy.trackedUrl, new RegExp(`utm_content=empathy_${dateKey.replace(/-/g, '')}_card\\d{2}`), `${dateKey} empathy utm_content should include card number`);
    assert.match(draft.empathy.imagePath, new RegExp(`images[\\\\/]social[\\\\/]instagram[\\\\/]lenormand-empathy[\\\\/]${String(cardNumber).padStart(2, '0')}\\.jpg$`), `${dateKey} empathy should use the matching text-added Lenormand image`);
    assert.match(draft.empathy.imageUrl, new RegExp(`/images/social/instagram/lenormand-empathy/${String(cardNumber).padStart(2, '0')}\\.jpg$`), `${dateKey} empathy URL should use the matching text-added Lenormand image`);
  }
  assert.equal(seen.size, 36, 'first empathy rotation cycle should use all 36 Lenormand cards without repeats');
}

function testDifferenceAndFreePaidCompareAxes() {
  const difference = parseDraft('2026-06-02').difference;
  assert.match(difference.text, /AI占い|自由記載|四柱推命|姓名判断|動物タイプ|命・卜・相|総合占術|エンジニア|本質|本音|カード|断定|整理|次に動ける/, 'difference post should explain the Rashin distinction');
  assert.match(difference.trackedUrl, /utm_content=difference_20260602_v\d{2}/, 'difference tracked URL should use versioned utm_content');
  assert.match(difference.imagePath, /images[\\/]social[\\/]instagram[\\/]difference\.jpg$/, 'difference Threads should use the dedicated comparison image');
  assert.match(difference.imageUrl, /\/images\/social\/instagram\/difference\.jpg$/, 'difference Threads image URL should use the public Instagram asset path');

  const compare = parseDraft('2026-05-30').free_paid_compare;
  assert.match(compare.text, /無料版|有料版/, 'free_paid_compare should compare free and paid versions');
  assert.match(compare.text, /ルノルマン|数秘オラクル|鑑定履歴|深掘り|解像度/, 'free_paid_compare should explain the paid value without hard selling');
  assert.match(compare.trackedUrl, /utm_content=freepaid_20260530_v\d{2}/, 'free_paid_compare tracked URL should use versioned utm_content');
  assert.match(compare.imagePath, /images[\\/]social[\\/]instagram[\\/]free-paid-compare\.jpg$/, 'free_paid_compare Threads should use the dedicated comparison image');
  assert.match(compare.imageUrl, /\/images\/social\/instagram\/free-paid-compare\.jpg$/, 'free_paid_compare Threads image URL should use the public Instagram asset path');
}

function testPostsLedgerWriteIsTraceableAndSecretSafe() {
  const ledgerFile = path.join(ROOT, '.tmp-social-posts-test.csv');
  fs.rmSync(ledgerFile, { force: true });

  runNode([
    'scripts/social/daily-oracle-post.js',
    '--write',
    '--date=2026-05-27',
    '--platforms=threads,bluesky,instagram',
    '--kind=all',
  ], {
    env: {
      SOCIAL_POSTS_LEDGER_FILE: ledgerFile,
      THREADS_ACCESS_TOKEN: 'unit-test-threads-token',
      BLUESKY_APP_PASSWORD: 'unit-test-bluesky-password',
      INSTAGRAM_ACCESS_TOKEN: 'unit-test-instagram-token',
    },
  });

  const csv = fs.readFileSync(ledgerFile, 'utf8');
  const rows = csv.trim().split(/\r?\n/);
  assert.equal(rows.length, 13, 'ledger should contain header plus twelve draft rows');
  assert.match(rows[0], /post_key,date,kind,platform,status/, 'ledger header is missing expected columns');
  assert.match(csv, /utm_content=oracle_20260527/, 'oracle tracked URL is missing from ledger');
  assert.match(csv, /utm_content=empathy_20260527_card\d{2}/, 'empathy tracked URL is missing from ledger');
  assert.match(csv, /utm_content=difference_20260527_v\d{2}/, 'difference tracked URL is missing from ledger');
  assert.match(csv, /utm_content=freepaid_20260527_v\d{2}/, 'free_paid_compare tracked URL is missing from ledger');
  assert.doesNotMatch(csv, /unit-test-threads-token|unit-test-bluesky-password|unit-test-instagram-token/, 'ledger must not leak tokens');
  assert.doesNotMatch(csv, /今日の数秘オラクル|ルノルマンカード|無料版 \/ 有料版/, 'ledger should store hashes, URLs, and metadata, not full post copy');

  fs.rmSync(ledgerFile, { force: true });
}

function testRealPostingRequiresExplicitYesOutsideScheduler() {
  const ledgerFile = path.join(ROOT, '.tmp-social-posts-preview-test.csv');
  fs.rmSync(ledgerFile, { force: true });
  const result = runNode([
    'scripts/social/daily-oracle-post.js',
    '--post',
    '--date=2026-05-27',
    '--platforms=threads',
    '--kind=empathy',
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

function scheduleReport(nowIso, onlyKind = 'all') {
  const stateFile = path.join(ROOT, `.tmp-social-schedule-${onlyKind}-${nowIso.replace(/[^0-9]/g, '')}.json`);
  fs.rmSync(stateFile, { force: true });
  const result = runNode([
    'scripts/social/run-scheduled-posts.js',
    '--once',
    '--dry-run',
    `--only-kind=${onlyKind}`,
  ], {
    env: {
      SOCIAL_STATELESS_MODE: 'true',
      SOCIAL_NOW_ISO: nowIso,
      SOCIAL_SCHEDULE_STATE_FILE: stateFile,
    },
  });
  fs.rmSync(stateFile, { force: true });
  return JSON.parse(result.stdout);
}

function testScheduledPostsRespectJstWeekdays() {
  assert.deepEqual(scheduleReport('2026-05-27T03:01:00.000Z').due, ['empathy'], 'Wed 12:01 JST should post empathy');
  assert.deepEqual(scheduleReport('2026-06-02T11:01:00.000Z').due, ['difference'], 'Tue 20:01 JST should post difference');
  assert.deepEqual(scheduleReport('2026-05-30T11:01:00.000Z').due, ['free_paid_compare'], 'Sat 20:01 JST should post free_paid_compare');
  assert.deepEqual(scheduleReport('2026-06-02T03:01:00.000Z').due, [], 'Tue 12:01 JST should not post empathy');
  assert.deepEqual(scheduleReport('2026-05-29T11:01:00.000Z').due, [], 'Fri 20:01 JST should not post difference/free_paid_compare');
}

function testStatelessScheduleCapsWideGraceWindow() {
  const report = scheduleReport('2026-05-18T22:05:00.000Z', 'oracle');
  assert.equal(report.date, '2026-05-19', 'schedule dry-run should use the JST date');
  assert.equal(report.graceMinutes, 2, 'stateless runs should cap the effective grace window');
  assert.equal(report.graceCappedForStateless, false, 'default stateless grace should already be narrow');
  assert.deepEqual(report.due, [], 'a 07:05 stateless repeat tick must not repost the 07:00 oracle');
  assert.deepEqual(report.expired, ['oracle'], 'the repeat tick should be treated as expired after the narrow window');
}

function testBroadSocialAuditPasses() {
  const result = runNode([
    'scripts/social/audit-social-drafts.js',
    '--from=2026-05-13',
    '--to=2026-06-30',
    '--platforms=threads,bluesky,x,instagram',
  ]);
  assert.match(result.stdout, /"errors": 0/, 'audit should report zero errors');
}

function testXDraftExportUsesRandomOracleAndNoLengthLimit() {
  const outDir = path.join(ROOT, '.tmp-x-drafts-test');
  fs.rmSync(outDir, { recursive: true, force: true });
  const result = runNode([
    'scripts/social/export-x-drafts.js',
    '--date=2026-05-27',
    '--kind=oracle',
    `--out=${path.basename(outDir)}`,
  ], {
    env: {
      SOCIAL_ORACLE_CARD_MODE: 'random',
      SOCIAL_ORACLE_CARD_ID: '1',
    },
  });
  assert.match(result.stdout, /"status": "x_drafts_written"/, 'X draft export should write artifacts');
  const entry = JSON.parse(fs.readFileSync(path.join(outDir, '2026-05-27-oracle.json'), 'utf8'));
  assert.equal(entry.kind, 'oracle', 'exported X draft should be the oracle lane');
  assert.ok(entry.oracleCard.id >= 1 && entry.oracleCard.id <= 33, 'exported X draft should record an oracle card from 1 to 33');
  assert.ok(entry.characterCount > 280, 'exported X draft should allow long manual-post text');
  fs.rmSync(outDir, { recursive: true, force: true });
}

function testXDraftDueWindowsCreateScheduledDrafts() {
  const outDir = path.join(ROOT, '.tmp-x-drafts-due-test');
  fs.rmSync(outDir, { recursive: true, force: true });
  const cases = [
    { kind: 'oracle', date: '2026-05-28', now: '2026-05-27T22:03:00.000Z' },
    { kind: 'empathy', date: '2026-05-27', now: '2026-05-27T03:03:00.000Z' },
    { kind: 'difference', date: '2026-06-02', now: '2026-06-02T11:03:00.000Z' },
    { kind: 'free_paid_compare', date: '2026-05-30', now: '2026-05-30T11:03:00.000Z' },
  ];
  for (const item of cases) {
    const result = runNode([
      'scripts/social/export-x-drafts.js',
      `--date=${item.date}`,
      '--kind=auto',
      '--due',
      `--out=${path.basename(outDir)}`,
    ], {
      env: {
        SOCIAL_ORACLE_CARD_MODE: 'random',
        SOCIAL_NOW_ISO: item.now,
      },
    });
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'x_drafts_written', `${item.kind} due run should write a draft`);
    assert.equal(report.entries.length, 1, `${item.kind} due run should write only the due lane`);
    assert.equal(report.entries[0].kind, item.kind, `${item.kind} due run should select the correct lane`);
    assert.ok(fs.existsSync(path.join(outDir, `${item.date}-${item.kind}.md`)), `${item.kind} markdown draft should exist`);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

function testXSocialDraftWorkflowCreatesVisibleDrafts() {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'x-social-drafts.yml'), 'utf8');
  assert.match(workflow, /cron: '3 22 \* \* \*'/, 'X draft workflow should run at the JST morning slot');
  assert.match(workflow, /cron: '3 3 \* \* 1,3,5'/, 'X draft workflow should run at the JST empathy slot');
  assert.match(workflow, /cron: '3 11 \* \* 2'/, 'X draft workflow should run at the JST difference slot');
  assert.match(workflow, /cron: '3 11 \* \* 6'/, 'X draft workflow should run at the JST free/paid slot');
  assert.match(workflow, /default: 'oracle'/, 'manual X draft dispatch should default to the oracle draft');
  assert.match(workflow, /"3 22 \* \* \*"\) kind="oracle"/, 'morning schedule should explicitly export the oracle draft');
  assert.match(workflow, /"3 3 \* \* 1,3,5"\) kind="empathy"/, 'MWF noon schedule should explicitly export the empathy draft');
  assert.match(workflow, /"3 11 \* \* 2"\) kind="difference"/, 'Tuesday evening schedule should explicitly export the difference draft');
  assert.match(workflow, /"3 11 \* \* 6"\) kind="free_paid_compare"/, 'Saturday evening schedule should explicitly export the free/paid draft');
  assert.match(workflow, /\$status" != "x_drafts_written"/, 'empty X draft runs should not pass as success');
}

function testXWebDraftWorkflowUsesPlaywrightAndSecrets() {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'x-social-drafts.yml'), 'utf8');
  const webDraftScript = fs.readFileSync(path.join(ROOT, 'scripts', 'social', 'save-x-web-draft.js'), 'utf8');
  const captureScript = fs.readFileSync(path.join(ROOT, 'scripts', 'social', 'capture-x-auth-state.js'), 'utf8');
  assert.match(workflow, /X_AUTH_STORAGE_BASE64: \$\{\{ secrets\.X_AUTH_STORAGE_BASE64 \}\}/, 'workflow should use an encrypted X browser session secret');
  assert.match(workflow, /npx playwright install --with-deps chromium/, 'workflow should install Chromium for Playwright');
  assert.match(workflow, /node scripts\/social\/save-x-web-draft\.js/, 'workflow should save a real X Web draft, not only an artifact');
  assert.match(webDraftScript, /https:\/\/x\.com\/compose\/post/, 'web draft script should open the X compose UI');
  assert.match(webDraftScript, /Save draft prompt|下書き/, 'web draft script should close the compose box through the draft save UI');
  assert.match(webDraftScript, /CreateTweet\|\\\/2\\\/tweets\|statuses\\\/update/, 'web draft script should block accidental post requests');
  assert.match(captureScript, /storageState/, 'auth capture script should export Playwright storage state');
}

testDraftHasTrackingImagesAndAlt();
testPlatformHashtagPolicy();
testMorningOracleCopyStillKeepsRequiredClosing();
testEmpathyUsesRandomLenormandRotation();
testDifferenceAndFreePaidCompareAxes();
testPostsLedgerWriteIsTraceableAndSecretSafe();
testRealPostingRequiresExplicitYesOutsideScheduler();
testScheduledPostsRespectJstWeekdays();
testStatelessScheduleCapsWideGraceWindow();
testBroadSocialAuditPasses();
testXDraftExportUsesRandomOracleAndNoLengthLimit();
testXDraftDueWindowsCreateScheduledDrafts();
testXSocialDraftWorkflowCreatesVisibleDrafts();
testXWebDraftWorkflowUsesPlaywrightAndSecrets();

console.log('social-posting tests passed');
