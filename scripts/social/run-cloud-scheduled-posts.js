const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const ORACLE_SCRIPT = path.join(__dirname, 'run-scheduled-posts.js');
const REELS_SCRIPT = path.join(__dirname, 'post-daily-birthday-reels.js');
const DEFAULT_REEL_PUBLIC_ORIGIN = 'https://raw.githubusercontent.com/tekechannnel-max/rashin_senjutsu/main';

function parseArgs(argv) {
  const args = {
    dryRun: false,
    yes: false,
    platforms: process.env.SOCIAL_PLATFORMS || 'threads,instagram',
  };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--yes') args.yes = true;
    else if (arg.startsWith('--platforms=')) args.platforms = arg.split('=')[1].trim();
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  return args;
}

function isCloudScheduler() {
  return process.env.SOCIAL_CLOUD_SCHEDULER === 'true'
    || process.env.SOCIAL_SCHEDULED_RUN === 'true'
    || process.env.GITHUB_ACTIONS === 'true'
    || process.env.RENDER === 'true'
    || Boolean(process.env.RENDER_SERVICE_ID);
}

function parseJsonIfPossible(output) {
  const trimmed = String(output || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
}

function runNodeStep(id, scriptPath, stepArgs, envOverrides) {
  const command = ['node', path.relative(ROOT, scriptPath).replace(/\\/g, '/'), ...stepArgs];
  const result = spawnSync(process.execPath, [scriptPath, ...stepArgs], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...envOverrides,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const report = parseJsonIfPossible(stdout);
  return {
    id,
    command,
    exitCode: result.status,
    ...(report ? { report } : { stdout }),
    ...(stderr ? { stderr } : {}),
  };
}

function assertSafeToPost(args) {
  if (args.dryRun) return;
  if (args.yes || isCloudScheduler()) return;
  throw new Error('Real scheduled posting requires Render/GitHub Actions, SOCIAL_CLOUD_SCHEDULER=true, SOCIAL_SCHEDULED_RUN=true, or --yes. Use --dry-run for local checks.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assertSafeToPost(args);

  const oracleArgs = ['--once', '--only-kind=oracle'];
  if (args.dryRun) oracleArgs.push('--dry-run');

  const reelArgs = args.dryRun
    ? ['--dry-run', `--platforms=${args.platforms}`]
    : ['--post', `--platforms=${args.platforms}`];

  const commonEnv = {
    SOCIAL_STATELESS_MODE: process.env.SOCIAL_STATELESS_MODE || 'true',
    SOCIAL_CLOUD_SCHEDULER: 'true',
    SOCIAL_SCHEDULED_RUN: 'true',
  };
  const reelEnv = {
    ...commonEnv,
    SOCIAL_REEL_POST_GRACE_MINUTES: process.env.SOCIAL_REEL_POST_GRACE_MINUTES || process.env.SOCIAL_POST_GRACE_MINUTES || '59',
    SOCIAL_REEL_CATCHUP_HOURS: process.env.SOCIAL_REEL_CATCHUP_HOURS || '8',
    SOCIAL_REEL_PUBLIC_ORIGIN: process.env.SOCIAL_REEL_PUBLIC_ORIGIN || DEFAULT_REEL_PUBLIC_ORIGIN,
  };

  const steps = [
    runNodeStep('oracle', ORACLE_SCRIPT, oracleArgs, commonEnv),
    runNodeStep('daily_birthday_reels', REELS_SCRIPT, reelArgs, reelEnv),
  ];

  const summary = {
    dryRun: args.dryRun,
    platforms: args.platforms,
    cloudScheduler: isCloudScheduler() || args.yes,
    steps,
  };
  console.log(JSON.stringify(summary, null, 2));

  const failed = steps.filter(step => step.exitCode !== 0);
  if (failed.length) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
