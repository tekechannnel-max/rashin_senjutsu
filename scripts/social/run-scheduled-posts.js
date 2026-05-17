const { spawnSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
require('./threads-client');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'social-posts');
const DEFAULT_STATE_FILE = path.join(OUT_DIR, 'scheduled-post-state.json');
const DAILY_SCRIPT = path.join(__dirname, 'daily-oracle-post.js');
const DEFAULT_POST_GRACE_MINUTES = 30;

function parseArgs(argv) {
  const args = { once: false, dryRun: false, forceKind: '', onlyKind: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--once') args.once = true;
    else if (arg === '--daemon') {
      throw new Error('Local daemon mode is disabled. Threads automation must run from Render Cron Job, not a local PC process.');
    }
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force-kind') args.forceKind = argv[++i] || '';
    else if (arg.startsWith('--force-kind=')) args.forceKind = arg.split('=')[1] || '';
    else if (arg === '--only-kind') args.onlyKind = argv[++i] || '';
    else if (arg.startsWith('--only-kind=')) args.onlyKind = arg.split('=')[1] || '';
  }
  if (!args.once && !args.forceKind) args.once = true;
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

function getNow() {
  const override = String(process.env.SOCIAL_NOW_ISO || '').trim();
  if (!override) return new Date();
  const date = new Date(override);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid SOCIAL_NOW_ISO: ${override}`);
  return date;
}

function getStateFile() {
  const configured = String(process.env.SOCIAL_SCHEDULE_STATE_FILE || '').trim();
  if (!configured) return DEFAULT_STATE_FILE;
  return path.isAbsolute(configured) ? configured : path.resolve(ROOT, configured);
}

function getPostGraceMinutes() {
  const raw = String(process.env.SOCIAL_POST_GRACE_MINUTES || DEFAULT_POST_GRACE_MINUTES).trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid SOCIAL_POST_GRACE_MINUTES: ${raw}`);
  return value;
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

function splitCsv(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function isSkippedByEnv(kind, dateKey) {
  const specific = process.env[`SOCIAL_SKIP_${kind.toUpperCase()}_DATES`];
  const all = process.env.SOCIAL_SKIP_DATES;
  return splitCsv(specific).includes(dateKey) || splitCsv(all).includes(dateKey);
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
    env: {
      ...process.env,
      SOCIAL_SCHEDULED_RUN: 'true',
    },
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
  const now = getNow();
  const dateKey = getJstDateKey(now);
  const nowMinute = getJstMinutes(now);
  const graceMinutes = getPostGraceMinutes();
  const schedule = filterScheduleByKind(getSchedule(), args.onlyKind);
  const stateFile = getStateFile();
  const state = await readJson(stateFile, {});
  state[dateKey] = state[dateKey] || {};

  const due = args.forceKind
    ? schedule.filter(item => args.forceKind === 'all' || item.kind === args.forceKind)
    : schedule.filter(item => {
      const lateByMinutes = nowMinute - item.minute;
      return lateByMinutes >= 0 && lateByMinutes <= graceMinutes && !state[dateKey][item.kind];
    });
  const dueAfterSkips = due.filter(item => !isSkippedByEnv(item.kind, dateKey));
  const expired = args.forceKind ? [] : schedule
    .filter(item => nowMinute - item.minute > graceMinutes && !state[dateKey][item.kind])
    .map(item => item.kind);

  const report = {
    date: dateKey,
    nowMinute,
    graceMinutes,
    schedule: schedule.map(item => ({ kind: item.kind, time: item.time })),
    onlyKind: args.onlyKind || null,
    due: dueAfterSkips.map(item => item.kind),
    expired,
    skippedByEnv: due.filter(item => isSkippedByEnv(item.kind, dateKey)).map(item => item.kind),
    dryRun: args.dryRun,
  };
  console.log(JSON.stringify(report, null, 2));

  if (args.dryRun || !dueAfterSkips.length) return;
  requirePostingEnabled();

  for (const item of dueAfterSkips) {
    runPost(item.kind, dateKey);
    state[dateKey][item.kind] = new Date().toISOString();
    await writeJson(stateFile, state);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await runDue(args);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
