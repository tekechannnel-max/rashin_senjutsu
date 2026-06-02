const fs = require('fs/promises');
const path = require('path');
const { exportXDrafts } = require('./export-x-drafts');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'social-posts', 'x-card-drafts');
const X_GREETING_BY_KIND = Object.freeze({
  oracle: 'おはてけ🌸🦦',
});
const ALLOWED_KINDS = new Set(['oracle']);
const BLOCKED_KINDS = new Set(['empathy', 'question', 'difference', 'free_paid_compare', 'midday', 'concept']);
const REQUIRED_ORACLE_TEXT_PARTS = ['🫶✨', '🔮✨', '今日の1枚はこちら！👇'];

function parseArgs(argv) {
  const args = {
    days: 2,
    startOffset: 1,
    out: DEFAULT_OUT_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--from') args.from = argv[++index];
    else if (arg.startsWith('--from=')) args.from = arg.split('=')[1];
    else if (arg === '--to') args.to = argv[++index];
    else if (arg.startsWith('--to=')) args.to = arg.split('=')[1];
    else if (arg === '--days') args.days = Number(argv[++index]);
    else if (arg.startsWith('--days=')) args.days = Number(arg.split('=')[1]);
    else if (arg === '--start-offset') args.startOffset = Number(argv[++index]);
    else if (arg.startsWith('--start-offset=')) args.startOffset = Number(arg.split('=')[1]);
    else if (arg === '--out') args.out = argv[++index] || args.out;
    else if (arg.startsWith('--out=')) args.out = arg.split('=')[1] || args.out;
  }
  if (!Number.isInteger(args.days) || args.days < 1) throw new Error(`Invalid --days: ${args.days}`);
  if (!Number.isInteger(args.startOffset) || args.startOffset < 0) throw new Error(`Invalid --start-offset: ${args.startOffset}`);
  if (args.from) args.from = resolveDateValue(args.from);
  if (args.to) args.to = resolveDateValue(args.to);
  if (!args.from) args.from = addDays(getJstDateString(), args.startOffset);
  if (!args.to) args.to = addDays(args.from, args.days - 1);
  assertDate(args.from, '--from');
  assertDate(args.to, '--to');
  if (args.to < args.from) throw new Error('--to must be on or after --from');
  args.out = path.resolve(ROOT, args.out);
  return args;
}

function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error(`Invalid ${label}: ${value}`);
}

function getNow() {
  const override = String(process.env.SOCIAL_NOW_ISO || '').trim();
  if (!override) return new Date();
  const date = new Date(override);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid SOCIAL_NOW_ISO: ${override}`);
  return date;
}

function getJstDateString(date = getNow()) {
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

function resolveDateValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'today') return getJstDateString();
  if (raw === 'tomorrow') return addDays(getJstDateString(), 1);
  if (raw === 'day-after-tomorrow' || raw === 'day_after_tomorrow') return addDays(getJstDateString(), 2);
  return raw;
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

function weekday(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function scheduledKindsForDate(dateKey) {
  return ['oracle'];
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function runExport(date, kind, outDir) {
  return exportXDrafts({
    date,
    kind,
    out: outDir,
    due: false,
  });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function draftBaseName(date, kind) {
  return `${date}-${kind}`;
}

function existingSummaryForTarget(target, outDir) {
  const base = draftBaseName(target.date, target.kind);
  return {
    date: target.date,
    kind: target.kind,
    files: {
      json: rel(path.join(outDir, `${base}.json`)),
      md: rel(path.join(outDir, `${base}.md`)),
    },
  };
}

async function canReuseExistingTarget(target, outDir, expectedTargets) {
  try {
    await validateWrittenEntry(existingSummaryForTarget(target, outDir), expectedTargets, 'reused_existing');
    return true;
  } catch (_error) {
    return false;
  }
}

async function validateWrittenEntry(summary, expectedTargets, action = 'written') {
  if (!ALLOWED_KINDS.has(summary.kind)) throw new Error(`Unexpected X card draft kind: ${summary.kind}`);
  if (BLOCKED_KINDS.has(summary.kind)) throw new Error(`Blocked X draft kind was written: ${summary.kind}`);
  const key = `${summary.date}:${summary.kind}`;
  if (!expectedTargets.has(key)) throw new Error(`Unexpected X card draft target: ${key}`);

  const jsonPath = path.join(ROOT, summary.files.json);
  const mdPath = path.join(ROOT, summary.files.md);
  const entry = await readJson(jsonPath);
  await fs.access(mdPath);
  await fs.access(entry.imagePath);

  if (entry.kind !== summary.kind || entry.date !== summary.date) {
    throw new Error(`X card draft file mismatch: ${summary.files.json}`);
  }
  if (entry.platform !== 'x') throw new Error(`${key}: platform must be x`);
  if (entry.characterCount > 280) throw new Error(`${key}: X text exceeds 280 characters`);
  if (!String(entry.altText || '').trim()) throw new Error(`${key}: alt text is missing`);
  const expectedGreeting = X_GREETING_BY_KIND[entry.kind];
  if (!String(entry.text || '').startsWith(expectedGreeting)) {
    throw new Error(`${key}: X card draft must start with ${expectedGreeting}`);
  }
  if (entry.kind === 'oracle' && !String(entry.text || '').includes('#おはようVtuber')) {
    throw new Error(`${key}: morning oracle draft must include #おはようVtuber`);
  }
  if (entry.kind === 'oracle') {
    for (const required of REQUIRED_ORACLE_TEXT_PARTS) {
      if (!String(entry.text || '').includes(required)) throw new Error(`${key}: missing required X oracle wording: ${required}`);
    }
    if (/ルノルマン|こんてけ/.test(String(entry.text || ''))) {
      throw new Error(`${key}: X oracle draft must not include Lenormand or noon greeting wording.`);
    }
  }
  return {
    date: entry.date,
    kind: entry.kind,
    action,
    scheduledTime: entry.scheduledTime,
    characterCount: entry.characterCount,
    imagePath: entry.imagePath,
    imagePathRelative: entry.imagePathRelative,
    altText: entry.altText,
    files: {
      json: rel(jsonPath),
      md: rel(mdPath),
    },
  };
}

function markdownForReport(report) {
  return [
    `# X card drafts ${report.from} to ${report.to}`,
    '',
    `- Status: ${report.status}`,
    '- Scope: oracle daily only',
    '- Blocked kinds: empathy, question, difference, free_paid_compare, midday, concept',
    '',
    '## Entries',
    '',
    ...report.entries.flatMap(entry => [
      `- ${entry.date} ${entry.kind} (${entry.scheduledTime})`,
      `  - Action: ${entry.action}`,
      `  - Text: ${entry.files.md}`,
      `  - Image: ${entry.imagePathRelative}`,
      `  - Characters: ${entry.characterCount}`,
    ]),
    '',
  ].join('\n');
}

async function writeReport(report, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const base = `x-card-drafts-${report.from}-to-${report.to}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(mdPath, markdownForReport(report), 'utf8');
  return {
    json: rel(jsonPath),
    md: rel(mdPath),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out;
  const targets = eachDate(args.from, args.to).flatMap(date => (
    scheduledKindsForDate(date).map(kind => ({ date, kind }))
  ));
  const expectedTargets = new Set(targets.map(target => `${target.date}:${target.kind}`));
  const entries = [];

  for (const target of targets) {
    if (await canReuseExistingTarget(target, outDir, expectedTargets)) {
      entries.push(await validateWrittenEntry(existingSummaryForTarget(target, outDir), expectedTargets, 'reused_existing'));
      continue;
    }
    const report = await runExport(target.date, target.kind, outDir);
    if (report.status !== 'x_drafts_written' || report.entries.length !== 1) {
      throw new Error(`Unexpected export report for ${target.date} ${target.kind}`);
    }
    entries.push(await validateWrittenEntry(report.entries[0], expectedTargets));
  }

  const report = {
    status: 'x_card_drafts_written',
    from: args.from,
    to: args.to,
    outputDir: rel(outDir),
    schedulePolicy: {
      oracle: 'daily 07:00 Asia/Tokyo',
    },
    blockedKinds: [...BLOCKED_KINDS],
    writtenCount: entries.filter(entry => entry.action === 'written').length,
    reusedCount: entries.filter(entry => entry.action === 'reused_existing').length,
    entries,
  };
  report.files = await writeReport(report, outDir);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
