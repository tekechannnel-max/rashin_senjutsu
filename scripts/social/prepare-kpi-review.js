const fs = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');
const postLedger = require('./post-ledger');

const ROOT = path.resolve(__dirname, '..', '..');
const DAILY_SCRIPT = path.join(__dirname, 'daily-oracle-post.js');
const OUT_DIR = path.join(ROOT, 'data', 'social-posts', 'kpi-review');
const SOCIAL_EXPANSION_START_DATE = process.env.SOCIAL_EXPANSION_START_DATE || '2026-05-27';
const KINDS = ['oracle', 'empathy', 'question', 'difference', 'free_paid_compare'];
const WEEKDAYS_BY_KIND = {
  oracle: null,
  empathy: [1, 3, 5],
  question: [2, 4],
  difference: [2],
  free_paid_compare: [6],
};
const KPI_FOCUS_BY_KIND = {
  oracle: 'habit_link_clicks',
  empathy: 'saves_and_free_starts',
  question: 'replies',
  difference: 'profile_visits_and_free_starts',
  free_paid_compare: 'paid_starts_and_paid_completions',
};

const COLUMNS = [
  'post_key',
  'date',
  'kind',
  'platform',
  'scheduled_time',
  'utm_content',
  'tracked_url',
  'permalink',
  'kpi_focus',
  'views',
  'replies',
  'reposts_or_shares',
  'saves',
  'profile_visits',
  'link_clicks',
  'free_reading_starts',
  'paid_deep_reading_starts',
  'paid_completions',
  'notes',
  'next_action',
  'updated_at',
];

const MANUAL_COLUMNS = new Set([
  'permalink',
  'views',
  'replies',
  'reposts_or_shares',
  'saves',
  'profile_visits',
  'link_clicks',
  'free_reading_starts',
  'paid_deep_reading_starts',
  'paid_completions',
  'notes',
  'next_action',
]);

function getJstDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const today = getJstDateString();
  const args = {
    from: process.env.SOCIAL_KPI_FROM || today,
    to: process.env.SOCIAL_KPI_TO || today,
    platforms: process.env.SOCIAL_KPI_PLATFORMS || process.env.SOCIAL_PLATFORMS || 'threads,bluesky,instagram',
    out: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from') args.from = argv[++i] || args.from;
    else if (arg.startsWith('--from=')) args.from = arg.slice('--from='.length) || args.from;
    else if (arg === '--to') args.to = argv[++i] || args.to;
    else if (arg.startsWith('--to=')) args.to = arg.slice('--to='.length) || args.to;
    else if (arg === '--platforms') args.platforms = argv[++i] || args.platforms;
    else if (arg.startsWith('--platforms=')) args.platforms = arg.slice('--platforms='.length) || args.platforms;
    else if (arg === '--out') args.out = argv[++i] || args.out;
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length) || args.out;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.from)) throw new Error(`Invalid --from date: ${args.from}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.to)) throw new Error(`Invalid --to date: ${args.to}`);
  if (args.to < args.from) throw new Error(`--to must be on or after --from: ${args.from}..${args.to}`);
  args.platforms = String(args.platforms || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  if (!args.platforms.length) throw new Error('At least one platform is required.');
  args.out = args.out
    ? path.resolve(ROOT, args.out)
    : path.join(OUT_DIR, `social-kpi-${args.from}_${args.to}.csv`);
  return args;
}

function getWeekday(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function isScheduledKindForDate(kind, dateKey) {
  if (kind !== 'oracle' && dateKey < SOCIAL_EXPANSION_START_DATE) return false;
  const weekdays = WEEKDAYS_BY_KIND[kind];
  return !Array.isArray(weekdays) || weekdays.includes(getWeekday(dateKey));
}

function csvEscape(value) {
  const raw = String(value ?? '');
  if (!/[",\r\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      values.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

async function readRows(file) {
  try {
    const source = await fs.readFile(file, 'utf8');
    const lines = source.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const header = parseCsvLine(lines[0]);
    return lines.slice(1).map(line => {
      const values = parseCsvLine(line);
      return Object.fromEntries(header.map((key, index) => [key, values[index] || '']));
    });
  } catch (_error) {
    return [];
  }
}

function writeRows(rows) {
  return [
    COLUMNS.join(','),
    ...rows.map(row => COLUMNS.map(column => csvEscape(row[column])).join(',')),
  ].join('\n') + '\n';
}

function runDraft(dateKey, platforms) {
  const result = spawnSync(process.execPath, [
    DAILY_SCRIPT,
    '--dry-run',
    `--date=${dateKey}`,
    '--kind=all',
    `--platforms=${platforms.join(',')}`,
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      SOCIAL_STATELESS_MODE: 'true',
      SOCIAL_PLATFORMS: platforms.join(','),
    },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`Draft generation failed for ${dateKey}: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function getPlatformEntry(entry, platform) {
  if (platform === 'x') {
    return { text: entry.xText, trackedUrl: entry.xTrackedUrl };
  }
  if (platform === 'bluesky') {
    return { text: entry.blueskyText, trackedUrl: entry.blueskyTrackedUrl };
  }
  if (platform === 'instagram') {
    return { text: entry.instagramText, trackedUrl: entry.instagramTrackedUrl };
  }
  return { text: entry.text, trackedUrl: entry.trackedUrl };
}

function buildRows(args) {
  const updatedAt = new Date().toISOString();
  const rows = [];
  for (let dateKey = args.from; dateKey <= args.to; dateKey = addDays(dateKey, 1)) {
    const draft = runDraft(dateKey, args.platforms);
    for (const kind of KINDS.filter(item => isScheduledKindForDate(item, dateKey))) {
      for (const platform of args.platforms) {
        const entry = getPlatformEntry(draft[kind], platform);
        const tracking = postLedger.extractTracking(entry.trackedUrl);
        const utmContent = tracking.utm_content || `${kind}_${dateKey.replace(/-/g, '')}`;
        rows.push({
          post_key: `${dateKey}:${kind}:${platform}:${utmContent}`,
          date: dateKey,
          kind,
          platform,
          scheduled_time: draft.schedule?.[kind] || '',
          utm_content: utmContent,
          tracked_url: entry.trackedUrl || '',
          permalink: '',
          kpi_focus: KPI_FOCUS_BY_KIND[kind] || '',
          views: '',
          replies: '',
          reposts_or_shares: '',
          saves: '',
          profile_visits: '',
          link_clicks: '',
          free_reading_starts: '',
          paid_deep_reading_starts: '',
          paid_completions: '',
          notes: '',
          next_action: '',
          updated_at: updatedAt,
        });
      }
    }
  }
  return rows;
}

function mergeRows(nextRows, currentRows) {
  const currentByKey = new Map(currentRows.map(row => [row.post_key, row]));
  return nextRows.map(row => {
    const current = currentByKey.get(row.post_key);
    if (!current) return row;
    const merged = { ...row };
    for (const column of MANUAL_COLUMNS) {
      if (current[column]) merged[column] = current[column];
    }
    return merged;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const currentRows = await readRows(args.out);
  const rows = mergeRows(buildRows(args), currentRows);
  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, writeRows(rows), 'utf8');
  console.log(JSON.stringify({
    status: 'kpi_review_written',
    file: path.relative(ROOT, args.out).replace(/\\/g, '/'),
    rows: rows.length,
    from: args.from,
    to: args.to,
    platforms: args.platforms,
  }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
