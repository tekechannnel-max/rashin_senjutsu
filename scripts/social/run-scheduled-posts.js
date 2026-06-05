const { spawnSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
require('./threads-client');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'social-posts');
const DEFAULT_STATE_FILE = path.join(OUT_DIR, 'scheduled-post-state.json');
const DAILY_SCRIPT = path.join(__dirname, 'daily-oracle-post.js');
const DEFAULT_SOCIAL_PLATFORMS = 'threads,instagram';
const DEFAULT_POST_GRACE_MINUTES = 59;
const MAX_STATELESS_POST_GRACE_MINUTES = 59;
const SOCIAL_POST_KINDS = ['oracle', 'rashin_point', 'birthday_monthly', 'birthday_ranking'];
const SOCIAL_EXPANSION_START_DATE = process.env.SOCIAL_EXPANSION_START_DATE || '2026-05-27';
const SOCIAL_BIRTHDAY_MONTHLY_JUNE_DATE = process.env.SOCIAL_BIRTHDAY_MONTHLY_JUNE_DATE || '2026-06-05';
const SOCIAL_BIRTHDAY_MONTHLY_MONTHLY_START_DATE = process.env.SOCIAL_BIRTHDAY_MONTHLY_MONTHLY_START_DATE || '2026-07-01';
const ONE_OFF_POSTS = [
  {
    kind: 'rashin_point',
    date: '2026-06-04',
    time: '20:00',
  },
  {
    id: 'birthday_ranking_love_at_first_sight',
    kind: 'birthday_ranking',
    date: '2026-06-06',
    time: '20:00',
    platforms: 'threads,instagram',
  },
  {
    id: 'birthday_ranking_money_luck',
    kind: 'birthday_ranking',
    date: '2026-06-07',
    time: '20:00',
    platforms: 'threads,instagram',
  },
  {
    id: 'birthday_ranking_horror_resistance',
    kind: 'birthday_ranking',
    date: '2026-06-08',
    time: '20:00',
    platforms: 'threads,instagram',
  },
  {
    id: 'birthday_ranking_weird',
    kind: 'birthday_ranking',
    date: '2026-06-09',
    time: '20:00',
    platforms: 'threads,instagram',
  },
];
const BIRTHDAY_MONTHLY_SLOTS = [
  { id: 'birthday_monthly_01_10', kind: 'birthday_monthly', time: '20:00', birthdayDays: '1-10' },
  { id: 'birthday_monthly_11_20', kind: 'birthday_monthly', time: '21:00', birthdayDays: '11-20' },
  { id: 'birthday_monthly_21_30', kind: 'birthday_monthly', time: '22:00', birthdayDays: '21-30' },
  { id: 'birthday_monthly_31', kind: 'birthday_monthly', time: '23:00', birthdayDays: '31' },
];

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

function getConfiguredPostGraceMinutes() {
  const raw = String(process.env.SOCIAL_POST_GRACE_MINUTES || DEFAULT_POST_GRACE_MINUTES).trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid SOCIAL_POST_GRACE_MINUTES: ${raw}`);
  return value;
}

function getPostGracePolicy() {
  const configuredMinutes = getConfiguredPostGraceMinutes();
  const statelessMode = process.env.SOCIAL_STATELESS_MODE === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const allowWideStatelessWindow = process.env.SOCIAL_ALLOW_WIDE_STATELESS_WINDOW === 'true';
  const effectiveMinutes = statelessMode && !allowWideStatelessWindow
    ? Math.min(configuredMinutes, MAX_STATELESS_POST_GRACE_MINUTES)
    : configuredMinutes;
  return {
    configuredMinutes,
    effectiveMinutes,
    cappedForStateless: effectiveMinutes !== configuredMinutes,
  };
}

function getJstDateKey(date = new Date()) {
  const parts = getJstParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getJstWeekday(date = new Date()) {
  return new Date(`${getJstDateKey(date)}T00:00:00.000Z`).getUTCDay();
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
      id: 'oracle',
      kind: 'oracle',
      time: process.env.SOCIAL_ORACLE_TIME || '08:00',
      minute: parseTimeToMinutes(process.env.SOCIAL_ORACLE_TIME, '08:00'),
      days: null,
    },
    ...BIRTHDAY_MONTHLY_SLOTS.map(item => ({
      ...item,
      minute: parseTimeToMinutes(item.time, item.time),
      days: null,
    })),
    ...ONE_OFF_POSTS.map(item => ({
      ...item,
      id: item.id || item.kind,
      minute: parseTimeToMinutes(item.time, item.time),
      days: null,
    })),
  ];
}

function filterScheduleByKind(schedule, onlyKind) {
  if (!onlyKind || onlyKind === 'all') return schedule;
  const hasKindOrId = SOCIAL_POST_KINDS.includes(onlyKind) || schedule.some(item => item.id === onlyKind);
  if (!hasKindOrId) {
    throw new Error(`Invalid --only-kind: ${onlyKind}`);
  }
  return schedule.filter(item => item.kind === onlyKind || item.id === onlyKind);
}

function splitCsv(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function isSkippedByEnv(kind, dateKey) {
  const specific = process.env[`SOCIAL_SKIP_${kind.toUpperCase()}_DATES`];
  const all = process.env.SOCIAL_SKIP_DATES;
  return splitCsv(specific).includes(dateKey) || splitCsv(all).includes(dateKey);
}

function isScheduledForDate(item, dateKey, weekday) {
  if (item.date && item.date !== dateKey) return false;
  if (item.kind === 'birthday_monthly') {
    const monthlyStart = SOCIAL_BIRTHDAY_MONTHLY_MONTHLY_START_DATE;
    const isJuneKickoff = dateKey === SOCIAL_BIRTHDAY_MONTHLY_JUNE_DATE;
    const isMonthlyFirst = dateKey >= monthlyStart && dateKey.endsWith('-01');
    if (!isJuneKickoff && !isMonthlyFirst) return false;
  }
  if (item.kind !== 'oracle' && dateKey < SOCIAL_EXPANSION_START_DATE) return false;
  return !Array.isArray(item.days) || item.days.includes(weekday);
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

function runPost(item, dateKey) {
  const platforms = item.platforms || process.env.SOCIAL_PLATFORMS || DEFAULT_SOCIAL_PLATFORMS;
  const result = spawnSync(process.execPath, [
    DAILY_SCRIPT,
    '--write',
    '--post',
    `--kind=${item.kind}`,
    `--date=${dateKey}`,
    `--platforms=${platforms}`,
    ...(item.birthdayDays ? [`--birthday-days=${item.birthdayDays}`] : []),
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      SOCIAL_SCHEDULED_RUN: 'true',
      ...(item.birthdayDays ? { SOCIAL_BIRTHDAY_MONTHLY_DAYS: item.birthdayDays } : {}),
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Scheduled ${item.id || item.kind} post failed with exit code ${result.status}`);
  }
}

async function runDue(args) {
  const now = getNow();
  const dateKey = getJstDateKey(now);
  const weekday = getJstWeekday(now);
  const nowMinute = getJstMinutes(now);
  const gracePolicy = getPostGracePolicy();
  const graceMinutes = gracePolicy.effectiveMinutes;
  const schedule = filterScheduleByKind(getSchedule(), args.onlyKind);
  const stateFile = getStateFile();
  const state = await readJson(stateFile, {});
  state[dateKey] = state[dateKey] || {};

  const scheduledToday = schedule.filter(item => isScheduledForDate(item, dateKey, weekday));
  const due = args.forceKind
    ? scheduledToday.filter(item => args.forceKind === 'all' || item.kind === args.forceKind || item.id === args.forceKind)
    : scheduledToday.filter(item => {
      const lateByMinutes = nowMinute - item.minute;
      return lateByMinutes >= 0 && lateByMinutes <= graceMinutes && !state[dateKey][item.id || item.kind];
    });
  const dueAfterSkips = due.filter(item => !isSkippedByEnv(item.kind, dateKey));
  const expired = args.forceKind ? [] : scheduledToday
    .filter(item => nowMinute - item.minute > graceMinutes && !state[dateKey][item.id || item.kind])
    .map(item => item.id || item.kind);

  const report = {
    date: dateKey,
    weekday,
    nowMinute,
    graceMinutes,
    configuredGraceMinutes: gracePolicy.configuredMinutes,
    graceCappedForStateless: gracePolicy.cappedForStateless,
    schedule: schedule.map(item => ({ id: item.id || item.kind, kind: item.kind, time: item.time, days: item.days, birthdayDays: item.birthdayDays || null, platforms: item.platforms || null })),
    scheduledToday: scheduledToday.map(item => item.id || item.kind),
    onlyKind: args.onlyKind || null,
    due: dueAfterSkips.map(item => item.id || item.kind),
    expired,
    skippedByEnv: due.filter(item => isSkippedByEnv(item.kind, dateKey)).map(item => item.id || item.kind),
    dryRun: args.dryRun,
  };
  console.log(JSON.stringify(report, null, 2));

  if (args.dryRun || !dueAfterSkips.length) return;
  requirePostingEnabled();

  for (const item of dueAfterSkips) {
    runPost(item, dateKey);
    state[dateKey][item.id || item.kind] = new Date().toISOString();
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
