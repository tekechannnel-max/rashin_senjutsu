const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
process.env.SOCIAL_APPROVED_REELS_DIR = path.join(ROOT, 'tests', 'fixtures', 'social-approved-reels');
process.env.SOCIAL_NOW_ISO = '2026-06-20T11:05:00.000Z';
process.env.SOCIAL_APPROVED_REELS_STATE_FILE = path.join(ROOT, 'output', 'test-approved-reels-state.json');
process.env.SOCIAL_APPROVED_REELS_RESULTS_FILE = path.join(ROOT, 'output', 'test-approved-reels-results.json');
const approvedReels = require('../scripts/social/post-approved-reels');
const visualReview = require('../scripts/social/verify-approved-reels-visuals');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const approvedPublisher = read('scripts/social/post-approved-reels.js');
const miniReview = read('scripts/social/birthday-mini-review.js');
const packageJson = JSON.parse(read('package.json'));
assert.equal(typeof approvedReels.run, 'function', 'approved reel publisher must export run');
assert.equal(typeof approvedReels.loadApprovedPosts, 'function', 'approved reel publisher must export loadApprovedPosts');
assert.equal(typeof visualReview.run, 'function', 'visual review script must export run');
assert.equal(packageJson.scripts['social:visual-review'], 'node scripts/social/verify-approved-reels-visuals.js', 'package scripts must expose the visual review command');
assert.match(approvedPublisher, /data['"], ['"]social-posts['"], ['"]approved-reels/, 'approved reel publisher must read the approved-reels directory');
assert.match(approvedPublisher, /designReview/, 'approved reel publisher must require visual design review evidence');
assert.match(miniReview, /birthdayMiniFamilyForDay/, 'approved reel publisher must verify mini character families from birth days');
assert.match(miniReview, /assetPath/, 'mini character proof must remember the exact source asset path');
assert.match(miniReview, /designReview\.miniCharacters/, 'approved reel publisher must require per-day mini character proof');
assert.match(approvedPublisher, /validateMiniCharactersForPost/, 'approved reel publisher must compare mini character proof with reel content days');
assert.match(approvedPublisher, /visualInspection/, 'approved reel publisher must require visual inspection proof before posting');
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
assert.match(scheduler, /SOCIAL_LOCAL_CODEX_AUTOMATION/, 'scheduler must allow explicit local Codex automation mode');
assert.match(scheduler, /SOCIAL_CODEX_RESERVATION_ACTIVE/, 'scheduler must allow explicit local Codex reservation mode');
assert.doesNotMatch(scheduler, /Local daemon mode is disabled/, 'scheduler must not reject local Codex daemon mode outright');
assert.doesNotMatch(scheduler, /BIRTHDAY_REEL_SLOTS\s*=\s*\[/, 'scheduler must not keep hardcoded birthday reel slots');

const localAutoPost = read('scripts/social/run-auto-post-reels.cmd');
assert.match(localAutoPost, /SOCIAL_LOCAL_CODEX_AUTOMATION=true/, 'local Codex scheduled posting wrapper must mark the local automation route explicitly');
assert.match(localAutoPost, /--only-kind=all/, 'local Codex scheduled posting wrapper must run all due night lanes');
assert.doesNotMatch(localAutoPost, /--only-kind=birthday_reel/, 'local Codex scheduled posting wrapper must not skip Thursday 20:00 comparison by filtering to birthday reels');

const autoPrepare = read('scripts/social/auto-prepare-approved-reels.js');
assert.match(autoPrepare, /\['20:00', '21:00', '22:00'\]/, 'auto prepare must keep daily reels to 20:00, 21:00, and 22:00');
assert.doesNotMatch(autoPrepare, /\['20:00', '21:00', '22:00', '23:00'\]/, 'auto prepare must not create a 23:00 daily reel slot');
assert.match(autoPrepare, /birthday_day_aruaru/, 'auto prepare must generate single-day aruaru topics');
assert.match(autoPrepare, /birthday_day_manual/, 'auto prepare must generate single-day manual topics');
assert.match(autoPrepare, /birthday_graph_1_31/, 'auto prepare must generate all-days birthday graph topics');
assert.match(autoPrepare, /video-insights-feedback\.json/, 'auto prepare must read video PDCA feedback for next research priority');

const videoInsights = read('scripts/social/collect-video-insights.js');
assert.match(videoInsights, /SOCIAL_INSIGHTS_COLLECTION_ENABLED/, 'video insight collection must require an explicit live collection gate');
assert.match(videoInsights, /approved-reels-results\.json/, 'video insight collection must start from posted approved reel results');
assert.match(videoInsights, /getInstagramMediaInsights/, 'video insight collection must support Instagram media insights');
assert.match(videoInsights, /getThreadInsights/, 'video insight collection must support Threads media insights');

const videoPdca = read('scripts/social/analyze-video-pdca.js');
assert.match(videoPdca, /video-insights-feedback\.json/, 'video PDCA analysis must write feedback for later automation');
assert.match(videoPdca, /preferredTopicTypes/, 'video PDCA analysis must rank topic types');
assert.match(scheduler, /SOCIAL_VIDEO_PDCA_AUTOMATION/, 'scheduler must be able to run video insight PDCA after approved reel posting');

const backupWorkflow = read('.github/workflows/instagram-reels-backup.yml');
assert.doesNotMatch(backupWorkflow, /--post\s+--force/, 'backup workflow must not publish with --post --force');
assert.doesNotMatch(backupWorkflow, /\[post-\d{8}/, 'backup workflow must not post from commit-message triggers');
assert.doesNotMatch(backupWorkflow, /\bPOST_\d{8}\b/, 'backup workflow must not expose dated POST_ triggers');
assert.doesNotMatch(backupWorkflow, /\bpost_\d{8}_\d{2}\b/, 'backup workflow must not expose dated recovery modes');

const guard = read('scripts/social/validate-social-pipeline-guardrails.js');
assert.match(guard, /NO_POST_FORCE_IN_WORKFLOW/, 'social guard must block workflow --post --force');
assert.match(guard, /POST_SCRIPT_HARDCODES_REELS/, 'social guard must block hardcoded reel arrays');
assert.match(guard, /APPROVED_POST_MISSING_DESIGN_CHECK/, 'social guard must require approved reel design checks');
assert.match(guard, /APPROVED_POST_MISSING_VISUAL_INSPECTION/, 'social guard must require visual inspection proof');
assert.match(guard, /APPROVED_POST_MISSING_MINICHARA_SELECTION/, 'social guard must require per-day mini character selections');
assert.match(guard, /APPROVED_POST_INVALID_MINICHARA_SELECTION/, 'social guard must reject mini character selections that do not match birthday-mini-family');
assert.match(guard, /APPROVED_POST_MINICHARA_CONTENT_MISMATCH/, 'social guard must reject mini character proof that does not match reel content days');
assert.match(guard, /APPROVED_DAILY_REEL_23_SLOT/, 'social guard must reject deleted 23:00 daily birthday reel slots');

const approvedPosts = approvedReels.loadApprovedPosts();
assert.equal(approvedPosts.length, 1, 'fixture approved manifest should load one approved post');
assert.equal(approvedPosts[0].id, 'birthday_reel_20260620_20_fixture');
assert.deepEqual(
  approvedPosts[0].designReview.miniCharacters.map(entry => [entry.day, entry.family, entry.asset]),
  [
    [11, 2, 'birthday-family-2-chibi.png'],
    [22, 4, 'birthday-family-4-chibi.png'],
    [29, 2, 'birthday-family-2-chibi.png'],
    [5, 5, 'birthday-family-5-chibi.png'],
    [14, 5, 'birthday-family-5-chibi.png'],
  ],
  'fixture approved manifest should preserve reduced 1-9 mini character proof'
);
assert.equal(approvedReels.isDue(approvedPosts[0], new Date(process.env.SOCIAL_NOW_ISO)), true, 'fixture post should be due at 20:05 JST');

(async () => {
  const report = await approvedReels.run(approvedReels.parseArgs(['--dry-run', '--once', '--platforms=threads,instagram']));
  assert.equal(report.ok, true, 'approved reel dry-run should report ok');
  assert.equal(report.selectedCount, 1, 'approved reel dry-run should select the due fixture post');
  assert.deepEqual(report.selected[0].platforms, ['threads', 'instagram'], 'approved reel dry-run should target both approved platforms');

  const visualOutDir = path.join(ROOT, 'output', 'test-social-visual-review');
  const usageFile = path.join(ROOT, 'output', 'test-mini-character-usage.json');
  fs.rmSync(visualOutDir, { recursive: true, force: true });
  fs.rmSync(usageFile, { force: true });
  const visualReport = await visualReview.run(visualReview.parseArgs([
    '--date=2026-06-20',
    '--write-review',
    '--write-usage',
    `--out-dir=${visualOutDir}`,
    `--usage-file=${usageFile}`,
  ]));
  assert.equal(visualReport.ok, true, 'visual review should pass for the fixture');
  assert.equal(visualReport.posts.length, 1, 'visual review should inspect the fixture post');
  assert.ok(fs.existsSync(path.join(visualOutDir, '2026-06-20', 'index.html')), 'visual review should write an HTML review page');
  assert.ok(fs.existsSync(usageFile), 'visual review should write the mini character usage ledger');
  const usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
  assert.equal(usage.posts[0].miniCharacters[0].assetPath, 'images/social/instagram/birthday-mini/birthday-family-2-chibi.png', 'usage ledger should remember the exact mini character asset path');
  fs.rmSync(visualOutDir, { recursive: true, force: true });
  fs.rmSync(usageFile, { force: true });
})().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
