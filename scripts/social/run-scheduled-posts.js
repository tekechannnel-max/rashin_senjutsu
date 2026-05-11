const { spawnSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
require('./threads-client');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'social-posts');
const STATE_FILE = path.join(OUT_DIR, 'scheduled-post-state.json');
const DAILY_SCRIPT = path.join(__dirname, 'daily-oracle-post.js');

function parseArgs(argv) {
  const args = { once: false, daemon: false, dryRun: false, forceKind: '', onlyKind: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--once') args.once = true;
    else if (arg === '--daemon') args.daemon = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force-kind') args.forceKind = argv[++i] || '';
    else if (arg.startsWith('--force-kind=')) args.forceKind = arg.split('=')[1] || '';
    else if (arg === '--only-kind') args.onlyKind = argv[++i] || '';
    else if (arg.startsWith('--only-kind=')) args.onlyKind = arg.split('=')[1] || '';
  }
  if (!args.once && !args.daemon && !args.forceKind) args.once = true;
  return args;
}

function getJstParts(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
}

function getJstDateKey(date = new Date()) {
  const parts = getJstParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getJstMinutes(date = new Date()) {
  const parts = getJstParts(date);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function parseTimeToMinutes(value, fallback) {
  const raw = String(value || fallback || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid schedule time: ${raw}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error(`Invalid schedule time: ${raw}`);
  return hour * 60 + minute;
}

function getSchedule() {
  return [
    {
      kind: 'oracle',
      time: process.env.SOCIAL_ORACLE_TIME || '07:00',
      minute: parseTimeToMinutes(process.env.SOCIAL_ORACLE_TIME, '07:00'),
    },
    {
      kind: 'concept',
      time: process.env.SOCIAL_CONCEPT_TIME || '20:00',
      minute: parseTimeToMinutes(process.env.SOCIAL_CONCEPT_TIME, '20:00'),
    },
  ];
}

function filterScheduleByKind(schedule, onlyKind) {
  if (!onlyKind || onlyKind === 'all') return schedule;
  if (!['oracle', 'concept'].includes(onlyKind)) {
    throw new Error(`Invalid --only-kind: ${onlyKind}`);
  }
  return schedule.filter(item => item.kind === onlyKind);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function requirePostingEnabled() {
  if (process.env.SOCIAL_AUTOMATED_POSTING_ENABLED !== 'true') {
    throw new Error('Set SOCIAL_AUTOMATED_POSTING_ENABLED=true before real automated posting.');
  }
}

function runPost(kind, dateKey) {
  const platforms = process.env.SOCIAL_PLATFORMS || 'threads';
  const result = spawnSync(process.execPath, [
    DAILY_SCRIPT,
    '--write',
    '--post',
    `--kind=${kind}`,
    `--date=${dateKey}`,
    `--platforms=${platforms}`,
  ], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Scheduled ${kind} post failed with exit code ${result.status}`);
  }
}

async function runDue(args) {
  const dateKey = getJstDateKey();
  const nowMinute = getJstMinutes();
  const schedule = filterScheduleByKind(getSchedule(), args.onlyKind);
  const state = await readJson(STATE_FILE, {});
  state[dateKey] = state[dateKey] || {};

  const due = args.forceKind
    ? schedule.filter(item => args.forceKind === 'all' || item.kind === args.forceKind)
    : schedule.filter(item => nowMinute >= item.minute && !state[dateKey][item.kind]);

  const report = {
    date: dateKey,
    nowMinute,
    schedule: schedule.map(item => ({ kind: item.kind, time: item.time })),
    onlyKind: args.onlyKind || null,
    due: due.map(item => item.kind),
    dryRun: args.dryRun,
  };
  console.log(JSON.stringify(report, null, 2));

  if (args.dryRun || !due.length) return;
  requirePostingEnabled();

  for (const item of due) {
    runPost(item.kind, dateKey);
    state[dateKey][item.kind] = new Date().toISOString();
    await writeJson(STATE_FILE, state);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.daemon) {
    await runDue(args);
    setInterval(() => {
      runDue(args).catch(error => {
        console.error(error?.stack || error?.message || String(error));
      });
    }, 60 * 1000);
    return;
  }
  await runDue(args);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
