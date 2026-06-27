const fs = require('node:fs');
const path = require('node:path');

const {
  DAILY_BIRTHDAY_REEL_RULE_EFFECTIVE_DATE,
  dailyBirthdayReelTimesForDate,
  validateDailyBirthdayReelSchedule,
} = require('./social-schedule-rules');
const {
  validateMiniCharactersForPost,
} = require('./birthday-mini-review');

const ROOT = path.resolve(__dirname, '..', '..');

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function pathExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

function walk(dir, predicate = () => true) {
  if (!pathExists(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out.sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function parseArgs(argv) {
  const args = {
    from: DAILY_BIRTHDAY_REEL_RULE_EFFECTIVE_DATE,
    to: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--from') args.from = argv[++index] || '';
    else if (arg.startsWith('--from=')) args.from = arg.slice('--from='.length);
    else if (arg === '--to') args.to = argv[++index] || '';
    else if (arg.startsWith('--to=')) args.to = arg.slice('--to='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function inRange(dateKey, args) {
  if (!dateKey) return false;
  if (args.from && dateKey < args.from) return false;
  if (args.to && dateKey > args.to) return false;
  return true;
}

function addIssue(issues, code, file, message, detail = {}) {
  issues.push({ code, file: rel(file), message, ...detail });
}

function checkVisualInspection(issues, file, index, post, review) {
  const visual = review.visualInspection || {};
  if (visual.status !== 'passed') {
    addIssue(issues, 'OPS_MISSING_VISUAL_INSPECTION', file, `posts[${index}] visualInspection.status must be passed.`);
  }
  for (const key of ['method', 'checkedBy', 'checkedAt']) {
    if (!String(visual[key] || '').trim()) {
      addIssue(issues, 'OPS_MISSING_VISUAL_INSPECTION', file, `posts[${index}] visualInspection.${key} is required.`);
    }
  }
  const artifacts = Array.isArray(visual.reviewArtifacts) ? visual.reviewArtifacts : [];
  if (!artifacts.some(item => /contact/i.test(String(item)))) {
    addIssue(issues, 'OPS_MISSING_CONTACT_SHEET', file, `posts[${index}] visualInspection.reviewArtifacts must include a contact sheet.`);
  }
  for (const artifact of artifacts) {
    const value = String(artifact || '').trim();
    if (!value || /^https?:\/\//i.test(value)) continue;
    const artifactPath = path.resolve(ROOT, value);
    if (!pathExists(artifactPath)) {
      addIssue(issues, 'OPS_MISSING_VISUAL_ARTIFACT', file, `posts[${index}] visual artifact does not exist: ${rel(artifactPath)}.`);
    }
  }
}

function checkApprovedManifests(args, issues, warnings) {
  const approvedDir = path.join(ROOT, 'data', 'social-posts', 'approved-reels');
  const files = walk(approvedDir, file => /\.json$/i.test(file));
  const postsByDate = new Map();
  for (const file of files) {
    let manifest;
    try {
      manifest = readJson(file);
    } catch (error) {
      addIssue(issues, 'OPS_INVALID_APPROVED_JSON', file, error.message);
      continue;
    }
    if (manifest.approvalStatus !== 'approved') continue;
    for (const [index, post] of (manifest.posts || []).entries()) {
      if ((post.kind || 'birthday_reel') !== 'birthday_reel') continue;
      if (!inRange(post.date, args)) continue;
      if (!postsByDate.has(post.date)) postsByDate.set(post.date, []);
      postsByDate.get(post.date).push({ file, index, post });

      for (const error of validateDailyBirthdayReelSchedule(post, `posts[${index}]`)) {
        addIssue(issues, 'OPS_DAILY_REEL_SLOT_MISMATCH', file, error);
      }
      const review = post.designReview || post.review || {};
      const miniCharacters = Array.isArray(review.miniCharacters)
        ? review.miniCharacters
        : Array.isArray(post.miniCharacters)
          ? post.miniCharacters
          : [];
      for (const error of validateMiniCharactersForPost(post, miniCharacters, `posts[${index}]`)) {
        addIssue(issues, 'OPS_MINICHARA_MISMATCH', file, error);
      }
      checkVisualInspection(issues, file, index, post, review);
    }
  }

  for (const [dateKey, posts] of postsByDate.entries()) {
    const expected = dailyBirthdayReelTimesForDate(dateKey);
    const actual = posts.map(item => item.post.time).sort();
    const expectedSorted = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expectedSorted)) {
      addIssue(
        issues,
        'OPS_DAILY_REEL_COUNT_OR_TIME_MISMATCH',
        posts[0].file,
        `${dateKey} approved daily reels must be exactly ${expectedSorted.join(', ')}.`,
        { actual }
      );
    }
  }

  if (!postsByDate.size) {
    warnings.push({
      code: 'OPS_NO_APPROVED_REELS_IN_RANGE',
      message: `No approved birthday reels found from ${args.from || 'beginning'}${args.to ? ` to ${args.to}` : ''}.`,
    });
  }
}

function checkStaleRuleText(issues) {
  const stalePatterns = [
    { code: 'OPS_STALE_DAILY_23_RULE_TEXT', pattern: /20:00 \/ 21:00 \/ 23:00.*(?:\u65e5\u6b21|\u591c|\u6295\u7a3f\u30ea\u30ba\u30e0)|(?:\u65e5\u6b21|\u591c|\u6295\u7a3f\u30ea\u30ba\u30e0).*20:00 \/ 21:00 \/ 23:00|20:00, 21:00, and 23:00 JST daily reels|23:00 JST daily reels/i },
    { code: 'OPS_STALE_22_BAN_TEXT', pattern: /22:00\u306e\u65e5\u6b21\u30ea\u30fc\u30eb\u306f.*(?:\u4f5c\u3089\u306a\u3044|\u7981\u6b62)|22:00 JST (?:monthly|is kept only)|without a 22:00 daily reel slot/i },
    { code: 'OPS_STALE_AUTOPREPARE_TIMES', pattern: /\['20:00', '21:00', '23:00'\]/ },
  ];
  const files = [
    'docs/sns-posting-absolute-rules.md',
    'docs/sns-runbook.md',
    'docs/sns-birthday-number-content-guide.md',
    'docs/sns-research-design-approval-system.md',
    'docs/sns-strategy-threads-instagram.md',
    '.github/workflows/threads-social.yml',
    '.github/workflows/sns-automation.yml',
    '.github/workflows/instagram-reels-backup.yml',
    'scripts/social/auto-prepare-approved-reels.js',
    'scripts/social/generate-birthday-reels-20260620.js',
    'tests/social-approved-reels-guard.test.js',
    'tests/social-schedule-rules.test.js',
    'tests/social-posting.test.js',
  ].map(file => path.join(ROOT, file)).filter(pathExists);

  for (const file of files) {
    const text = readText(file);
    for (const stale of stalePatterns) {
      if (stale.pattern.test(text)) {
        addIssue(issues, stale.code, file, 'Stale daily birthday reel schedule text remains.');
      }
    }
  }
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const issues = [];
  const warnings = [];
  checkApprovedManifests(args, issues, warnings);
  checkStaleRuleText(issues);
  return {
    ok: issues.length === 0,
    checkedAt: new Date().toISOString(),
    ruleEffectiveDate: DAILY_BIRTHDAY_REEL_RULE_EFFECTIVE_DATE,
    expectedDailyTimes: dailyBirthdayReelTimesForDate(args.from || DAILY_BIRTHDAY_REEL_RULE_EFFECTIVE_DATE),
    issueCount: issues.length,
    warningCount: warnings.length,
    issues,
    warnings,
  };
}

if (require.main === module) {
  run().then(report => {
    const json = JSON.stringify(report, null, 2);
    if (!report.ok) {
      console.error(json);
      process.exit(1);
    }
    console.log(json);
  }).catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  run,
};
