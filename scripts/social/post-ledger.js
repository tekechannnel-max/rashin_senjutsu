const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_LEDGER_FILE = path.join(ROOT, 'data', 'social-posts', 'posts.csv');
const DEFAULT_KINDS = ['oracle', 'empathy', 'question', 'difference', 'free_paid_compare'];
const RESULT_SUFFIX_BY_KIND = {
  oracle: 'Oracle',
  empathy: 'Empathy',
  question: 'Question',
  difference: 'Difference',
  free_paid_compare: 'FreePaidCompare',
  midday: 'Midday',
  concept: 'Concept',
};

const COLUMNS = [
  'post_key',
  'date',
  'kind',
  'platform',
  'status',
  'scheduled_time',
  'release_phase',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'tracked_url',
  'permalink',
  'external_id',
  'text_sha256',
  'image_path',
  'image_url',
  'alt_text_sha256',
  'updated_at',
];

function getLedgerFile() {
  const configured = String(process.env.SOCIAL_POSTS_LEDGER_FILE || '').trim();
  if (!configured) return DEFAULT_LEDGER_FILE;
  return path.isAbsolute(configured) ? configured : path.resolve(ROOT, configured);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
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

async function readLedger(file = getLedgerFile()) {
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

async function writeLedger(rows, file = getLedgerFile()) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const lines = [
    COLUMNS.join(','),
    ...rows.map(row => COLUMNS.map(column => csvEscape(row[column])).join(',')),
  ];
  await fs.writeFile(file, `${lines.join('\n')}\n`, 'utf8');
}

function extractFirstUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/);
  return match ? match[0].replace(/[),.、。]+$/u, '') : '';
}

function extractTracking(url) {
  if (!url) return {};
  try {
    const parsed = new URL(url);
    return {
      utm_source: parsed.searchParams.get('utm_source') || '',
      utm_medium: parsed.searchParams.get('utm_medium') || '',
      utm_campaign: parsed.searchParams.get('utm_campaign') || '',
      utm_content: parsed.searchParams.get('utm_content') || '',
    };
  } catch (_error) {
    return {};
  }
}

function relativePath(value) {
  const raw = String(value || '');
  if (!raw) return '';
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(ROOT, raw);
  return path.relative(ROOT, absolute).replace(/\\/g, '/');
}

function getEntryForPlatform(draft, kind, platform) {
  const entry = draft[kind] || {};
  if (platform === 'x') {
    return {
      text: entry.xText,
      trackedUrl: entry.xTrackedUrl,
      imagePath: entry.imagePath,
      imageUrl: entry.imageUrl,
      altText: entry.altText,
    };
  }
  if (platform === 'bluesky') {
    return {
      text: entry.blueskyText,
      trackedUrl: entry.blueskyTrackedUrl,
      imagePath: entry.blueskyImagePath || entry.imagePath,
      imageUrl: entry.blueskyImageUrl || entry.imageUrl,
      altText: entry.altText,
    };
  }
  if (platform === 'instagram') {
    return {
      text: entry.instagramText,
      trackedUrl: entry.instagramTrackedUrl,
      imagePath: entry.instagramImagePath || entry.imagePath,
      imageUrl: entry.instagramImageUrl || entry.imageUrl,
      altText: entry.altText,
    };
  }
  return {
    text: entry.text,
    trackedUrl: entry.trackedUrl,
    imagePath: entry.imagePath,
    imageUrl: entry.imageUrl,
    altText: entry.altText,
  };
}

function resultFor(results, kind, platform) {
  const suffix = RESULT_SUFFIX_BY_KIND[kind] || kind.charAt(0).toUpperCase() + kind.slice(1);
  const key = `${platform}${suffix[0].toUpperCase()}${suffix.slice(1)}`;
  return results?.[key] || null;
}

function normalizeExternalId(result) {
  return String(result?.id || result?.uri || result?.cid || '');
}

function normalizeStatus(defaultStatus, result) {
  if (!result) return defaultStatus;
  if (result.skipped) return 'skipped_duplicate';
  return 'posted';
}

function rowsFromDraft(draft, options = {}) {
  const platforms = Array.isArray(options.platforms) && options.platforms.length
    ? options.platforms
    : ['threads'];
  const kinds = Array.isArray(options.kinds) && options.kinds.length
    ? options.kinds
    : DEFAULT_KINDS;
  const updatedAt = options.updatedAt || new Date().toISOString();
  const rows = [];
  for (const kind of kinds) {
    for (const platform of platforms) {
      const entry = getEntryForPlatform(draft, kind, platform);
      const text = String(entry.text || '');
      const trackedUrl = String(entry.trackedUrl || '').trim() || extractFirstUrl(text);
      const tracking = extractTracking(trackedUrl);
      const result = resultFor(options.results, kind, platform);
      const utmContent = tracking.utm_content || `${kind}_${draft.date.replace(/-/g, '')}`;
      rows.push({
        post_key: `${draft.date}:${kind}:${platform}:${utmContent}`,
        date: draft.date,
        kind,
        platform,
        status: normalizeStatus(options.status || 'draft', result),
        scheduled_time: draft.schedule?.[kind] || '',
        release_phase: draft.meta?.releasePhase || '',
        utm_source: tracking.utm_source || platform,
        utm_medium: tracking.utm_medium || 'social',
        utm_campaign: tracking.utm_campaign || draft.meta?.socialConfig?.campaign || '',
        utm_content: utmContent,
        tracked_url: trackedUrl,
        permalink: result?.permalink || '',
        external_id: normalizeExternalId(result),
        text_sha256: sha256(text),
        image_path: relativePath(entry.imagePath),
        image_url: entry.imageUrl || '',
        alt_text_sha256: sha256(entry.altText || ''),
        updated_at: updatedAt,
      });
    }
  }
  return rows;
}

async function upsertRows(rows, file = getLedgerFile()) {
  const current = await readLedger(file);
  const byKey = new Map(current.map(row => [row.post_key, row]));
  for (const row of rows) {
    byKey.set(row.post_key, {
      ...Object.fromEntries(COLUMNS.map(column => [column, ''])),
      ...byKey.get(row.post_key),
      ...row,
    });
  }
  const next = [...byKey.values()].sort((a, b) => {
    const left = `${a.date} ${a.kind} ${a.platform}`;
    const right = `${b.date} ${b.kind} ${b.platform}`;
    return left.localeCompare(right);
  });
  await writeLedger(next, file);
  return next;
}

async function recordDraft(draft, options = {}) {
  const rows = rowsFromDraft(draft, { ...options, status: options.status || 'draft' });
  await upsertRows(rows, options.file);
  return rows;
}

module.exports = {
  COLUMNS,
  DEFAULT_LEDGER_FILE,
  getLedgerFile,
  extractFirstUrl,
  extractTracking,
  rowsFromDraft,
  readLedger,
  writeLedger,
  upsertRows,
  recordDraft,
  sha256,
};
