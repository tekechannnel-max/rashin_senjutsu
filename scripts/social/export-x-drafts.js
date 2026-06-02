const fs = require('fs/promises');
const path = require('path');
const { buildDraft, getJstDateString: getDraftJstDateString } = require('./daily-oracle-post');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'social-posts', 'x-drafts');
const PRERELEASE_START_DATE = '2026-05-16';
const PRERELEASE_END_DATE = '2026-05-29';
const FIX_PERIOD_END_DATE = '2026-06-05';
const FULL_RELEASE_DATE = '2026-06-06';
const DEFAULT_X_DRAFT_GRACE_MINUTES = 60;
const SOCIAL_POST_KINDS = ['oracle'];
const SCHEDULED_TIME_BY_KIND = {
  oracle: '07:00 Asia/Tokyo',
};

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT_DIR,
    kind: 'all',
    due: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') args.date = argv[++i];
    else if (arg.startsWith('--date=')) args.date = arg.split('=')[1];
    else if (arg === '--from') args.from = argv[++i];
    else if (arg.startsWith('--from=')) args.from = arg.split('=')[1];
    else if (arg === '--to') args.to = argv[++i];
    else if (arg.startsWith('--to=')) args.to = arg.split('=')[1];
    else if (arg === '--kind') args.kind = argv[++i] || args.kind;
    else if (arg.startsWith('--kind=')) args.kind = arg.split('=')[1] || args.kind;
    else if (arg === '--out') args.out = argv[++i] || args.out;
    else if (arg.startsWith('--out=')) args.out = arg.split('=')[1] || args.out;
    else if (arg === '--due') args.due = true;
  }
  if (!args.date && !args.from) args.date = 'today';
  if (args.date === 'today') args.date = getJstDateString();
  if (args.from === 'today') args.from = getJstDateString();
  if (args.to === 'today') args.to = getJstDateString();
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error(`Invalid --date: ${args.date}`);
  if (args.from && !/^\d{4}-\d{2}-\d{2}$/.test(args.from)) throw new Error(`Invalid --from: ${args.from}`);
  if (args.to && !/^\d{4}-\d{2}-\d{2}$/.test(args.to)) throw new Error(`Invalid --to: ${args.to}`);
  if (!['all', 'auto', ...SOCIAL_POST_KINDS].includes(args.kind)) throw new Error(`Invalid --kind: ${args.kind}`);
  return args;
}

function getJstDateString(date = new Date()) {
  return getDraftJstDateString(date);
}

function getNow() {
  const override = String(process.env.SOCIAL_NOW_ISO || '').trim();
  if (!override) return new Date();
  const date = new Date(override);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid SOCIAL_NOW_ISO: ${override}`);
  return date;
}

function getJstMinutes(date = getNow()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function getJstWeekday(date = getNow()) {
  return new Date(`${getJstDateString(date)}T00:00:00.000Z`).getUTCDay();
}

function getDraftGraceMinutes() {
  const raw = String(process.env.SOCIAL_X_DRAFT_GRACE_MINUTES || DEFAULT_X_DRAFT_GRACE_MINUTES).trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid SOCIAL_X_DRAFT_GRACE_MINUTES: ${raw}`);
  return value;
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eachDate(from, to) {
  const dates = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function getReleasePhase(dateKey) {
  if (dateKey < PRERELEASE_START_DATE) return 'prelaunch';
  if (dateKey <= PRERELEASE_END_DATE) return 'prerelease';
  if (dateKey <= FIX_PERIOD_END_DATE) return 'fix';
  return 'release';
}

function getDateRange(args) {
  if (args.date) return [args.date];
  return eachDate(args.from, args.to || args.from);
}

function getSchedule() {
  return [
    { kind: 'oracle', time: '07:00', minute: 7 * 60, days: null },
  ];
}

function getDueKinds() {
  const dateKey = getJstDateString();
  const weekday = getJstWeekday();
  const minutes = getJstMinutes();
  const graceMinutes = getDraftGraceMinutes();
  return getSchedule()
    .filter(item => !Array.isArray(item.days) || item.days.includes(weekday))
    .filter(item => {
      const lateByMinutes = minutes - item.minute;
      return lateByMinutes >= 0 && lateByMinutes <= graceMinutes;
    })
    .map(item => item.kind);
}

function getKinds(args) {
  if (args.due || args.kind === 'auto') {
    const due = getDueKinds();
    if (SOCIAL_POST_KINDS.includes(args.kind)) return due.includes(args.kind) ? [args.kind] : [];
    return due;
  }
  if (SOCIAL_POST_KINDS.includes(args.kind)) return [args.kind];
  return SOCIAL_POST_KINDS;
}

function runDailyDraft(dateKey) {
  const originalEnv = {
    SOCIAL_STATELESS_MODE: process.env.SOCIAL_STATELESS_MODE,
    SOCIAL_ORACLE_CARD_MODE: process.env.SOCIAL_ORACLE_CARD_MODE,
    SOCIAL_RELEASE_MODE: process.env.SOCIAL_RELEASE_MODE,
    SOCIAL_PLATFORMS: process.env.SOCIAL_PLATFORMS,
  };
  process.env.SOCIAL_STATELESS_MODE = 'true';
  process.env.SOCIAL_ORACLE_CARD_MODE = process.env.SOCIAL_ORACLE_CARD_MODE || 'random';
  process.env.SOCIAL_RELEASE_MODE = process.env.SOCIAL_RELEASE_MODE || 'auto';
  process.env.SOCIAL_PLATFORMS = 'threads,x';
  return buildDraft({
    dryRun: true,
    date: dateKey,
    kind: 'all',
    platforms: ['threads', 'x'],
  }).finally(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function textLength(text) {
  return [...String(text || '')].length;
}

async function assertFileExists(file) {
  await fs.access(file);
}

async function buildEntry(draft, kind) {
  const source = draft[kind];
  if (!source) throw new Error(`Missing draft kind: ${kind}`);
  const text = source.xText;
  const imagePath = source.imagePath;
  const altText = source.altText;
  if (!String(text || '').trim()) throw new Error(`${draft.date} ${kind}: X text is empty.`);
  if (!String(imagePath || '').trim()) throw new Error(`${draft.date} ${kind}: imagePath is missing.`);
  if (!String(altText || '').trim()) throw new Error(`${draft.date} ${kind}: altText is missing.`);
  await assertFileExists(imagePath);
  const entry = {
    date: draft.date,
    kind,
    platform: 'x',
    scheduledTime: SCHEDULED_TIME_BY_KIND[kind] || '',
    releasePhase: draft.meta?.releasePhase || getReleasePhase(draft.date),
    releasePlan: draft.meta?.releasePlan || {
      prelaunchUntil: '2026-05-15',
      prereleaseStart: PRERELEASE_START_DATE,
      prereleaseEnd: PRERELEASE_END_DATE,
      fixPeriodStart: '2026-05-30',
      fixPeriodEnd: FIX_PERIOD_END_DATE,
      fullReleaseDate: FULL_RELEASE_DATE,
    },
    status: 'manual_post_required',
    browserAutomation: false,
    apiPosting: false,
    text,
    characterCount: textLength(text),
    imagePath,
    imagePathRelative: rel(imagePath),
    imageUrl: source.imageUrl || null,
    altText,
    notes: [
      'X API is not used.',
      'X website browser automation is not used.',
      'Open this draft, attach the listed image, paste the text, set alt text, and post manually.',
    ],
  };
  if (kind === 'oracle' && source.card) {
    entry.oracleCard = {
      id: source.card.id,
      name: source.card.name,
      title: source.card.title,
    };
  }
  return entry;
}

function markdownForEntry(entry) {
  return [
    `# X draft ${entry.date} ${entry.kind}`,
    '',
    `- Scheduled: ${entry.scheduledTime}`,
    `- Phase: ${entry.releasePhase}`,
    `- Status: ${entry.status}`,
    `- Characters: ${entry.characterCount}`,
    entry.oracleCard ? `- Oracle card: ${entry.oracleCard.id} ${entry.oracleCard.name} / ${entry.oracleCard.title}` : null,
    `- Image: ${entry.imagePathRelative}`,
    entry.imageUrl ? `- Image URL: ${entry.imageUrl}` : null,
    `- Alt: ${entry.altText}`,
    '',
    '## Text',
    '',
    '```text',
    entry.text,
    '```',
    '',
    '## Posting Notes',
    '',
    '- X API is not used.',
    '- Browser automation is not used.',
    '- Attach the image first, add the alt text, then paste the text.',
    '',
  ].filter(line => line !== null).join('\n');
}

async function writeEntry(entry, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const base = `${entry.date}-${entry.kind}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
  await fs.writeFile(mdPath, markdownForEntry(entry), 'utf8');
  return { jsonPath, mdPath };
}

async function exportXDrafts(args) {
  const dates = getDateRange(args);
  const kinds = getKinds(args);
  const outDir = path.resolve(ROOT, args.out);
  const written = [];

  if (!kinds.length) {
    return {
      status: 'no_due_x_drafts',
      date: getJstDateString(),
      nowMinute: getJstMinutes(),
      graceMinutes: getDraftGraceMinutes(),
      schedule: getSchedule().map(item => ({ kind: item.kind, time: item.time })),
      reason: 'No X draft lane is inside its JST due window.',
    };
  }

  for (const dateKey of dates) {
    const draft = await runDailyDraft(dateKey);
    for (const kind of kinds) {
      const entry = await buildEntry(draft, kind);
      const files = await writeEntry(entry, outDir);
      written.push({
        date: entry.date,
        kind,
        releasePhase: entry.releasePhase,
        textLength: entry.characterCount,
        imagePath: entry.imagePathRelative,
        files: {
          json: rel(files.jsonPath),
          md: rel(files.mdPath),
        },
      });
    }
  }

  return {
    status: 'x_drafts_written',
    outputDir: rel(outDir),
    nowMinute: getJstMinutes(),
    graceMinutes: getDraftGraceMinutes(),
    entries: written,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await exportXDrafts(args);
  console.log(JSON.stringify(report, null, 2));
}

module.exports = {
  exportXDrafts,
  parseArgs,
};

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
