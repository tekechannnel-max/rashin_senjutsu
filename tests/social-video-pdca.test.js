const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
process.env.SOCIAL_INSIGHTS_COLLECTION_ENABLED = 'false';

const collector = require('../scripts/social/collect-video-insights');
const analyzer = require('../scripts/social/analyze-video-pdca');

function runNode(args, options = {}) {
  const result = spawnSync(NODE, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
  });
  assert.equal(result.status, 0, `${args.join(' ')} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

(async () => {
  const dryRun = await collector.run(collector.parseArgs([
    '--dry-run',
    '--from=2026-06-20',
    '--to=2026-06-20',
    '--platforms=instagram',
    '--max-posts=2',
  ]));
  assert.equal(dryRun.status, 'dry_run', 'collector should default to safe dry-run');
  assert.ok(dryRun.targetCount >= 1, 'collector dry-run should find posted approved reel targets');
  assert.equal(dryRun.records.length, 0, 'collector dry-run must not call external insight APIs');

  const disabled = await collector.run(collector.parseArgs([
    '--live',
    '--from=2026-06-20',
    '--to=2026-06-20',
    '--platforms=instagram',
    '--max-posts=1',
  ]));
  assert.equal(disabled.status, 'skipped_disabled', 'live collection must require SOCIAL_INSIGHTS_COLLECTION_ENABLED=true');
  assert.equal(disabled.requiredEnv, 'SOCIAL_INSIGHTS_COLLECTION_ENABLED=true');

  const fixture = path.join(ROOT, 'tests', 'fixtures', 'social-video-insights', 'sample-video-insights.json');
  const reportOut = path.join(ROOT, 'output', 'test-video-pdca-report.json');
  const feedbackOut = path.join(ROOT, 'output', 'test-video-pdca-feedback.json');
  fs.rmSync(reportOut, { force: true });
  fs.rmSync(feedbackOut, { force: true });

  const report = await analyzer.run(analyzer.parseArgs([
    `--insights-file=${fixture}`,
    `--out=${reportOut}`,
    '--write-feedback',
    `--feedback-out=${feedbackOut}`,
  ]));
  assert.equal(report.status, 'analyzed', 'PDCA analyzer should score fixture insights');
  assert.equal(report.feedback.preferredTopicTypes[0], 'birthday_graph_1_31', 'highest-scoring graph post should become the preferred topic type');
  assert.ok(report.feedback.topicTypeWeights.birthday_graph_1_31 > report.feedback.topicTypeWeights.birthday_top5, 'graph feedback weight should beat top5 in fixture');
  assert.ok(fs.existsSync(reportOut), 'PDCA report should be written');
  assert.ok(fs.existsSync(feedbackOut), 'PDCA feedback file should be written');

  const prepared = runNode([
    'scripts/social/auto-prepare-approved-reels.js',
    '--dry-run',
    '--date=2026-06-30',
  ], {
    env: {
      SOCIAL_VIDEO_PDCA_FEEDBACK_FILE: feedbackOut,
    },
  });
  const preparedJson = JSON.parse(prepared.stdout);
  assert.equal(preparedJson.pdcaFeedbackApplied, true, 'auto-prepare should read PDCA feedback when available');
  assert.equal(preparedJson.posts[0].topicType, 'birthday_graph_1_31', 'PDCA feedback should move the strongest topic type to the first normal night slot');
  assert.ok(preparedJson.posts.some(post => post.topicType === 'birthday_top5'), 'PDCA must preserve TOP5 as a required research target');
  assert.ok(preparedJson.posts.some(post => post.researchTarget === 'birthday_day_aruaru_manual'), 'PDCA must preserve single-day aruaru/manual research');

  fs.rmSync(reportOut, { force: true });
  fs.rmSync(feedbackOut, { force: true });
})().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
