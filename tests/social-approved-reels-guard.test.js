const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
process.env.SOCIAL_APPROVED_REELS_DIR = path.join(ROOT, 'tests', 'fixtures', 'social-approved-reels');
process.env.SOCIAL_NOW_ISO = '2026-06-20T11:05:00.000Z';
process.env.SOCIAL_APPROVED_REELS_STATE_FILE = path.join(ROOT, 'output', 'test-approved-reels-state.json');
process.env.SOCIAL_APPROVED_REELS_RESULTS_FILE = path.join(ROOT, 'output', 'test-approved-reels-results.json');
const approvedReels = require('../scripts/social/post-approved-reels');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const approvedPublisher = read('scripts/social/post-approved-reels.js');
assert.equal(typeof approvedReels.run, 'function', 'approved reel publisher must export run');
assert.equal(typeof approvedReels.loadApprovedPosts, 'function', 'approved reel publisher must export loadApprovedPosts');
assert.match(approvedPublisher, /data['"], ['"]social-posts['"], ['"]approved-reels/, 'approved reel publisher must read the approved-reels directory');
assert.match(approvedPublisher, /designReview/, 'approved reel publisher must require visual design review evidence');
assert.match(approvedPublisher, /postVideoToThreads/, 'approved reel publisher must support Threads video posting through the shared client');
assert.doesNotMatch(approvedPublisher, /videos[\\/]+social[\\/]+instagram[\s\S]*manifest\.json/, 'approved reel publisher must not read draft video manifests');

const legacyPublisher = read('scripts/social/post-birthday-reels-20260618.js');
assert.match(legacyPublisher, /post-approved-reels/, 'legacy dated reel publisher must delegate to the approved publisher');
assert.doesNotMatch(legacyPublisher, /const\s+REELS\s*=\s*\[/, 'legacy dated reel publisher must not contain hardcoded reel arrays');
assert.doesNotMatch(legacyPublisher, /daily_reel_|birthday_reel_20260618/, 'legacy dated reel publisher must not keep old dated reel ids');

for (const relativePath of [
  'scripts/social/post-instagram-reels-20260614-designed.js',
  'scripts/social/post-threads-videos-20260614-designed.js',
]) {
  const source = read(relativePath);
  assert.match(source, /post-approved-reels/, `${relativePath} must delegate to the approved publisher`);
  assert.doesNotMatch(source, /const\s+(?:REELS|THREADS_VIDEOS|VIDEOS)\s*=\s*\[/, `${relativePath} must not contain hardcoded video arrays`);
}

const scheduler = read('scripts/social/run-scheduled-posts.js');
assert.match(scheduler, /post-approved-reels\.js/, 'scheduler must call the approved reel publisher');
assert.match(scheduler, /readApprovedReelScheduleSync/, 'scheduler must load reel schedule from approved manifests');
assert.doesNotMatch(scheduler, /BIRTHDAY_REEL_SLOTS\s*=\s*\[/, 'scheduler must not keep hardcoded birthday reel slots');

const backupWorkflow = read('.github/workflows/instagram-reels-backup.yml');
assert.doesNotMatch(backupWorkflow, /--post\s+--force/, 'backup workflow must not publish with --post --force');
assert.doesNotMatch(backupWorkflow, /\[post-\d{8}/, 'backup workflow must not post from commit-message triggers');
assert.doesNotMatch(backupWorkflow, /\bPOST_\d{8}\b/, 'backup workflow must not expose dated POST_ triggers');
assert.doesNotMatch(backupWorkflow, /\bpost_\d{8}_\d{2}\b/, 'backup workflow must not expose dated recovery modes');

const guard = read('scripts/social/validate-social-pipeline-guardrails.js');
assert.match(guard, /NO_POST_FORCE_IN_WORKFLOW/, 'social guard must block workflow --post --force');
assert.match(guard, /POST_SCRIPT_HARDCODES_REELS/, 'social guard must block hardcoded reel arrays');
assert.match(guard, /APPROVED_POST_MISSING_DESIGN_CHECK/, 'social guard must require approved reel design checks');

const approvedPosts = approvedReels.loadApprovedPosts();
assert.equal(approvedPosts.length, 1, 'fixture approved manifest should load one approved post');
assert.equal(approvedPosts[0].id, 'birthday_reel_20260620_20_fixture');
assert.equal(approvedReels.isDue(approvedPosts[0], new Date(process.env.SOCIAL_NOW_ISO)), true, 'fixture post should be due at 20:05 JST');

(async () => {
  const report = await approvedReels.run(approvedReels.parseArgs(['--dry-run', '--once', '--platforms=threads,instagram']));
  assert.equal(report.ok, true, 'approved reel dry-run should report ok');
  assert.equal(report.selectedCount, 1, 'approved reel dry-run should select the due fixture post');
  assert.deepEqual(report.selected[0].platforms, ['threads', 'instagram'], 'approved reel dry-run should target both approved platforms');
})().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
