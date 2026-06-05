const { spawnSync } = require('node:child_process');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

const syntaxTargets = [
  'server.js',
  'lenormand-reading-knowledge.js',
  'oracle-reading-knowledge.js',
  'card-reading-knowledge.js',
  'rashin-reading-policy.js',
  'app.js',
  'scripts/check.js',
  'scripts/social/content/lenormand-empathy-posts.js',
  'scripts/social/content/thread-question-posts.js',
  'scripts/social/content/difference-posts.js',
  'scripts/social/content/free-paid-compare-posts.js',
  'scripts/social/daily-oracle-post.js',
  'scripts/social/run-scheduled-posts.js',
  'scripts/social/threads-client.js',
  'scripts/social/threads-tool.js',
  'scripts/social/instagram-client.js',
  'scripts/social/instagram-tool.js',
  'scripts/social/generate-instagram-assets.js',
  'scripts/social/audit-social-drafts.js',
  'scripts/social/post-ledger.js',
  'scripts/social/prepare-kpi-review.js',
  'scripts/rashin/build-free-paid-code-hash-pool.js',
  'scripts/rashin/hash-booth-order-reference.js',
  'scripts/rashin/verify-paid-flow.js',
  'scripts/rashin/verify-free-flow.js',
  'tests/paid-reading-quality-gate.test.js',
  'tests/booth-paid-access-flow.test.js',
  'tests/server-route-registry.test.js',
  'tests/rashin-reusable-paid-code-runtime.test.js',
  'tests/paid-ticket-release-runtime.test.js',
  'tests/name-birth-calculation.test.js',
  'tests/social-posting.test.js',
  'tests/free-lenormand-pair-format.test.js',
  'tests/free-reading-quality-gate.test.js',
  'tests/free-rashin-card.test.js',
  'tests/rashin-year-calendar.test.js',
  'tests/rashin-cross-benefit.test.js',
  'tests/reading-policy-manual.test.js',
];

const runtimeTests = [
  'tests/paid-reading-quality-gate.test.js',
  'tests/booth-paid-access-flow.test.js',
  'tests/server-route-registry.test.js',
  'tests/rashin-reusable-paid-code-runtime.test.js',
  'tests/paid-ticket-release-runtime.test.js',
  'tests/name-birth-calculation.test.js',
  'tests/social-posting.test.js',
  'tests/free-lenormand-pair-format.test.js',
  'tests/free-reading-quality-gate.test.js',
  'tests/free-rashin-card.test.js',
  'tests/rashin-year-calendar.test.js',
  'tests/rashin-cross-benefit.test.js',
  'tests/reading-policy-manual.test.js',
];

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(`${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

for (const filePath of syntaxTargets) {
  runNode(['--check', filePath], `syntax ${filePath}`);
}

for (const filePath of runtimeTests) {
  runNode([filePath], `test ${filePath}`);
}
