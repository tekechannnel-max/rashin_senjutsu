const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_INPUT = path.join(ROOT_DIR, 'data', 'rashin-free-paid-codes-2026-04-30.csv');
const DEFAULT_OUTPUT = path.join(ROOT_DIR, 'config', 'rashin-free-paid-code-hashes.json');
const ACTIVE_STATUSES = new Set(['stock', 'issued', 'env_ready']);

function readArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const direct = process.argv.find(arg => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] || fallback;
  return fallback;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map(value => value.trim());
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = cells[index] || '';
      return row;
    }, {});
  });
}

function normalizeRashinPaidCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function getRashinPaidCodeHash(code) {
  const normalized = normalizeRashinPaidCode(code);
  if (!/^[A-Z0-9]{12}$/.test(normalized)) return '';
  return crypto.createHash('sha256').update(`rashin_paid_code:${normalized}`).digest('hex');
}

function buildPool({ input, output, limit, minimum }) {
  const rows = readCsv(input);
  const picked = [];
  const seenCodes = new Set();
  for (const row of rows) {
    const status = String(row.status || '').trim().toLowerCase();
    if (!ACTIVE_STATUSES.has(status)) continue;
    const code = normalizeRashinPaidCode(row.code || '');
    if (!/^[A-Z0-9]{12}$/.test(code) || seenCodes.has(code)) continue;
    const hash = getRashinPaidCodeHash(code);
    if (!hash) continue;
    picked.push({ code, hash });
    seenCodes.add(code);
    if (limit > 0 && picked.length >= limit) break;
  }
  if (picked.length < minimum) {
    throw new Error(`Only ${picked.length} active Rashin codes found; ${minimum} required.`);
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT_DIR, input).replace(/\\/g, '/'),
    purpose: 'Prepared manual free Rashin paid-code hash pool. Plain codes stay in the private ledger.',
    hashAlgorithm: 'sha256("rashin_paid_code:" + NORMALIZED_12_CHAR_CODE)',
    minimumPreparedCount: minimum,
    count: picked.length,
    hashes: picked.map(item => item.hash),
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

const input = path.resolve(ROOT_DIR, readArg('input', path.relative(ROOT_DIR, DEFAULT_INPUT)));
const output = path.resolve(ROOT_DIR, readArg('output', path.relative(ROOT_DIR, DEFAULT_OUTPUT)));
const limit = Math.max(0, parseInt(readArg('limit', '0'), 10) || 0);
const minimum = Math.max(1, parseInt(readArg('minimum', '100'), 10) || 100);

const result = buildPool({ input, output, limit, minimum });
console.log(`Wrote ${result.count} Rashin paid-code hashes to ${path.relative(ROOT_DIR, output)}`);
