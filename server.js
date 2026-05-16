const http = require('http');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const VAULT_DIR = path.join(DATA_DIR, 'vault-history');
const MEMBER_DIR = path.join(DATA_DIR, 'member-access');
const STRIPE_EVENT_DIR = path.join(DATA_DIR, 'stripe-events');
const STRIPE_CHECKOUT_COMPLETION_DIR = path.join(DATA_DIR, 'stripe-checkout-completions');
const PURCHASE_ORDER_DIR = path.join(DATA_DIR, 'purchase-orders');
const PAID_READING_TICKET_DIR = path.join(DATA_DIR, 'paid-reading-tickets');
const RASHIN_CODE_REDEEM_DIR = path.join(DATA_DIR, 'rashin-codes');
const RASHIN_PAID_CODE_DIR = path.join(DATA_DIR, 'rashin-paid-codes');
const RASHIN_DISCOUNT_CHECKOUT_LOCK_DIR = path.join(DATA_DIR, 'rashin-discount-checkout-locks');
const USER_DIR = path.join(DATA_DIR, 'users');
const INDEX_DIR = path.join(DATA_DIR, 'indexes');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const AI_USAGE_LOG_DIR = path.join(LOG_DIR, 'ai-usage');
const CLIENT_ERROR_LOG_DIR = path.join(LOG_DIR, 'client-errors');
const AI_EVENT_LOG_DIR = LOG_DIR;
const AI_FREE_DAILY_QUOTA_DIR = path.join(DATA_DIR, 'ai-free-daily-quotas');

function applyDotEnv(rootDir) {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) return;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!key || !value) return;
    const current = String(process.env[key] || '').trim();
    const currentLooksPlaceholder = /replace-with|xxxxxxxx|your-|example|sample|dummy|changeme|todo/i.test(current);
    if (!current || currentLooksPlaceholder) {
      process.env[key] = value;
    }
  });
}

applyDotEnv(ROOT_DIR);

function normalizeEnvValue(value) {
  return String(value || '').trim();
}

function isPlaceholderEnvValue(value) {
  const normalized = normalizeEnvValue(value).toLowerCase();
  if (!normalized) return true;
  return /replace-with|xxxxxxxx|your-|example|sample|dummy|changeme|todo/.test(normalized);
}

function isConfiguredAnthropicKey(value) {
  const normalized = normalizeEnvValue(value);
  return /^sk-ant-[a-z0-9_-]{10,}$/i.test(normalized) && !isPlaceholderEnvValue(normalized);
}

function isConfiguredOpenAIKey(value) {
  const normalized = normalizeEnvValue(value);
  return /^sk-[a-z0-9_-]{10,}$/i.test(normalized) && !isPlaceholderEnvValue(normalized);
}

function isConfiguredGoogleClientId(value) {
  const normalized = normalizeEnvValue(value);
  return /\.apps\.googleusercontent\.com$/i.test(normalized) && !isPlaceholderEnvValue(normalized);
}

function isConfiguredStripeSecretKey(value) {
  const normalized = normalizeEnvValue(value);
  return /^sk_(test|live)_[a-z0-9_]+$/i.test(normalized) && !isPlaceholderEnvValue(normalized);
}

function isConfiguredStripeWebhookSecret(value) {
  const normalized = normalizeEnvValue(value);
  return /^whsec_[a-z0-9_]+$/i.test(normalized) && !isPlaceholderEnvValue(normalized);
}

function isConfiguredStripePriceId(value) {
  const normalized = normalizeEnvValue(value);
  return /^price_[a-z0-9_]+$/i.test(normalized) && !isPlaceholderEnvValue(normalized);
}

function isConfiguredAppSecret(value) {
  const normalized = normalizeEnvValue(value);
  return normalized.length >= 24 && !isPlaceholderEnvValue(normalized);
}

function parseStripePaymentMethodTypes(value) {
  const allowed = new Set(['card']);
  const parsed = String(value || 'card')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(item => allowed.has(item));
  return parsed.length ? Array.from(new Set(parsed)) : ['card'];
}

function readCliArg(flag) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag) {
      return args[i + 1] || '';
    }
    if (args[i].startsWith(`${flag}=`)) {
      return args[i].slice(flag.length + 1);
    }
  }
  return '';
}

function normalizeOriginValue(value) {
  const raw = normalizeEnvValue(value).replace(/\/+$/, '');
  if (!raw || isPlaceholderEnvValue(raw)) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch (_error) {
    return '';
  }
}

function normalizeRemoteAddress(value) {
  let address = String(value || '').trim().toLowerCase();
  if (!address) return '';
  if (address.startsWith('::ffff:')) address = address.slice('::ffff:'.length);
  if (address === '0:0:0:0:0:0:0:1') return '::1';
  if (address === '[::1]') return '::1';
  return address;
}

function isLocalAddress(value) {
  const address = normalizeRemoteAddress(value);
  return address === 'localhost' || address === '::1' || address === '127.0.0.1' || address.startsWith('127.');
}

const HOST = readCliArg('--host') || process.env.HOST || '127.0.0.1';
const PORT = parseInt(readCliArg('--port') || process.env.PORT || '3000', 10);
const NODE_ENV = normalizeEnvValue(process.env.NODE_ENV || '');
const IS_PRODUCTION = NODE_ENV === 'production';
const IS_RENDER_RUNTIME = !!normalizeEnvValue(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL || '');
const IS_DEPLOYED_RUNTIME = IS_PRODUCTION || IS_RENDER_RUNTIME;
const ENABLE_DEV_ACCESS = normalizeEnvValue(process.env.ENABLE_DEV_ACCESS || '').toLowerCase() === 'true';
const TRUST_PROXY = IS_RENDER_RUNTIME || normalizeEnvValue(process.env.TRUST_PROXY || '').toLowerCase() === 'true';
const PUBLIC_ORIGIN = normalizeOriginValue(process.env.PUBLIC_ORIGIN || '');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GA_TRACKING_ID_RAW = normalizeEnvValue(process.env.GA_TRACKING_ID || process.env.GA4_TRACKING_ID || '');
const GA_TRACKING_ID = isPlaceholderEnvValue(GA_TRACKING_ID_RAW) ? '' : GA_TRACKING_ID_RAW;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY || '';
const STRIPE_PRICE_ID_DEEP_READING_780 = process.env.STRIPE_PRICE_ID_DEEP_READING_780 || '';
const STRIPE_SUCCESS_PATH = process.env.STRIPE_SUCCESS_PATH || '/uranai-v5.html?stripe_success=1&session_id={CHECKOUT_SESSION_ID}';
const STRIPE_CANCEL_PATH = process.env.STRIPE_CANCEL_PATH || '/uranai-v5.html?stripe_cancel=1';
const STRIPE_PORTAL_RETURN_PATH = process.env.STRIPE_PORTAL_RETURN_PATH || '/uranai-v5.html';
const STRIPE_SUBSCRIPTION_NAME = process.env.STRIPE_SUBSCRIPTION_NAME || '\u6df1\u6398\u308a\u9451\u5b9a';
const STRIPE_TRIAL_PERIOD_DAYS = Math.max(0, parseInt(process.env.STRIPE_TRIAL_PERIOD_DAYS || '7', 10) || 0);
const STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES = parseStripePaymentMethodTypes(process.env.STRIPE_PAYMENT_METHOD_TYPES);
const RASHIN_CODE_ADMIN_SECRET = normalizeEnvValue(process.env.RASHIN_CODE_ADMIN_SECRET || '');
const BOOTH_DEEP_READING_URL = normalizeEnvValue(process.env.BOOTH_DEEP_READING_URL || process.env.BOOTH_PRODUCT_URL || process.env.BOOTH_SHOP_URL || 'https://teke-sensai.booth.pm/');
const BOOTH_PAYMENT_LABEL = normalizeEnvValue(process.env.BOOTH_PAYMENT_LABEL || '羅針占術 BOOTH');
const BOOTH_PAYMENT_NOTE = normalizeEnvValue(process.env.BOOTH_PAYMENT_NOTE || 'BOOTH内のどのグッズを購入しても、購入後のBOOTH注文番号で深掘り羅針鑑定を利用できます。');
const BOOTH_GMAIL_VERIFICATION_REQUIRED = normalizeEnvValue(process.env.BOOTH_GMAIL_VERIFICATION_REQUIRED || 'true').toLowerCase() !== 'false';
const BOOTH_GMAIL_IMAP_USER = normalizeEnvValue(process.env.BOOTH_GMAIL_IMAP_USER || process.env.BOOTH_GMAIL_USER || '');
const BOOTH_GMAIL_IMAP_APP_PASSWORD = normalizeEnvValue(process.env.BOOTH_GMAIL_IMAP_APP_PASSWORD || process.env.BOOTH_GMAIL_APP_PASSWORD || '');
const BOOTH_GMAIL_IMAP_HOST = normalizeEnvValue(process.env.BOOTH_GMAIL_IMAP_HOST || 'imap.gmail.com');
const BOOTH_GMAIL_IMAP_PORT = Math.max(1, parseInt(process.env.BOOTH_GMAIL_IMAP_PORT || '993', 10) || 993);
const BOOTH_GMAIL_IMAP_MAILBOX = normalizeEnvValue(process.env.BOOTH_GMAIL_IMAP_MAILBOX || 'INBOX');
const BOOTH_GMAIL_SEARCH_QUERY = normalizeEnvValue(process.env.BOOTH_GMAIL_SEARCH_QUERY || '');
const BOOTH_GMAIL_SEARCH_FROM = normalizeEnvValue(process.env.BOOTH_GMAIL_SEARCH_FROM || 'booth.pm');
const BOOTH_GMAIL_SEARCH_DAYS = Math.max(1, parseInt(process.env.BOOTH_GMAIL_SEARCH_DAYS || '90', 10) || 90);
const BOOTH_GMAIL_VERIFY_TIMEOUT_MS = Math.min(30000, Math.max(3000, parseInt(process.env.BOOTH_GMAIL_VERIFY_TIMEOUT_MS || '12000', 10) || 12000));
const BOOTH_GMAIL_MATCH_BUYER_EMAIL = normalizeEnvValue(process.env.BOOTH_GMAIL_MATCH_BUYER_EMAIL || '').toLowerCase() === 'true';
const AI_MODELS = {
  free: process.env.OPENAI_FREE_MODEL || 'gpt-5.4-mini',
  paid: process.env.ANTHROPIC_PAID_MODEL || 'claude-sonnet-4-6',
  history: process.env.ANTHROPIC_HISTORY_MODEL || 'claude-sonnet-4-6',
  light: process.env.OPENAI_LIGHT_MODEL || 'gpt-5.4-mini',
  paidFallback: process.env.OPENAI_PAID_FALLBACK_MODEL || 'gpt-5.4',
  paidAbOpenai: process.env.OPENAI_PAID_AB_MODEL || 'gpt-5.5',
  structure: process.env.OPENAI_STRUCTURE_MODEL || 'gpt-5.4-mini',
};
const MEMBER_ACCESS_CODES = new Set(
  String(process.env.MEMBER_ACCESS_CODE || process.env.MEMBER_ACCESS_CODES || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
);
const RASHIN_ACCESS_CODES = new Set(
  String(process.env.RASHIN_CODE || process.env.RASHIN_ACCESS_CODE || process.env.RASHIN_ACCESS_CODES || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => /^\d{7}$/.test(value))
);
const DEVELOPER_ACCESS_EMAILS = new Set(
  String(process.env.DEVELOPER_ACCESS_EMAILS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
);
const MEMBER_SESSION_COOKIE = 'uranai_member_session';
const AUTH_SESSION_COOKIE = 'uranai_auth_session';
const MEMBER_SESSION_DAYS = Math.max(1, parseInt(process.env.MEMBER_SESSION_DAYS || '30', 10) || 30);
const RASHIN_CODE_SESSION_DAYS = Math.max(1, parseInt(process.env.RASHIN_CODE_SESSION_DAYS || String(MEMBER_SESSION_DAYS), 10) || MEMBER_SESSION_DAYS);
const RASHIN_CODE_REUSE_DAYS = Math.max(1, parseInt(process.env.RASHIN_CODE_REUSE_DAYS || String(RASHIN_CODE_SESSION_DAYS), 10) || RASHIN_CODE_SESSION_DAYS);
const AUTH_SESSION_DAYS = Math.max(1, parseInt(process.env.AUTH_SESSION_DAYS || String(MEMBER_SESSION_DAYS), 10) || MEMBER_SESSION_DAYS);
// Development access must be explicitly enabled and is never available on deployed runtimes.
const DEV_ACCESS_ENABLED = ENABLE_DEV_ACCESS && !IS_DEPLOYED_RUNTIME;
if ((IS_PRODUCTION || IS_RENDER_RUNTIME) && !PUBLIC_ORIGIN) {
  throw new Error('PUBLIC_ORIGIN is required in production/Render runtime.');
}
if (IS_PRODUCTION && !isConfiguredAppSecret(process.env.MEMBER_SESSION_SECRET || '')) {
  throw new Error('MEMBER_SESSION_SECRET is required in production.');
}
const MEMBER_SESSION_SECRET = process.env.MEMBER_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || process.env.MEMBER_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_COOKIE_SECURE = IS_PRODUCTION;
const ANTHROPIC_KEY_CONFIGURED = isConfiguredAnthropicKey(ANTHROPIC_API_KEY);
const OPENAI_KEY_CONFIGURED = isConfiguredOpenAIKey(OPENAI_API_KEY);
const GOOGLE_CLIENT_CONFIGURED = isConfiguredGoogleClientId(GOOGLE_CLIENT_ID);
const STRIPE_SECRET_CONFIGURED = isConfiguredStripeSecretKey(STRIPE_SECRET_KEY);
const STRIPE_WEBHOOK_CONFIGURED = isConfiguredStripeWebhookSecret(STRIPE_WEBHOOK_SECRET);
const STRIPE_PRICE_CONFIGURED = isConfiguredStripePriceId(STRIPE_PRICE_ID_MONTHLY);
const STRIPE_DEEP_READING_PRICE_CONFIGURED = isConfiguredStripePriceId(STRIPE_PRICE_ID_DEEP_READING_780);
const MEMBER_SESSION_PERSISTENT = isConfiguredAppSecret(process.env.MEMBER_SESSION_SECRET || '');
const AUTH_SESSION_PERSISTENT = isConfiguredAppSecret(process.env.AUTH_SESSION_SECRET || process.env.MEMBER_SESSION_SECRET || '');
const MAX_JSON_BYTES = 1024 * 1024;
const STRIPE_WEBHOOK_TOLERANCE_SEC = Math.max(60, parseInt(process.env.STRIPE_WEBHOOK_TOLERANCE_SEC || '300', 10) || 300);
const CORS_ALLOWED_ORIGINS = (() => {
  const origins = new Set();
  if (PUBLIC_ORIGIN) origins.add(PUBLIC_ORIGIN);
  String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOriginValue)
    .filter(Boolean)
    .forEach(origin => origins.add(origin));
  if (!IS_DEPLOYED_RUNTIME) {
    [PORT, 3000, 3001, 3060, 3061, 3062].forEach(port => {
      origins.add(`http://127.0.0.1:${port}`);
      origins.add(`http://localhost:${port}`);
    });
  }
  return origins;
})();
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
let GOOGLE_JWK_CACHE = { expiresAt: 0, keys: [] };
const RATE_LIMIT_STATE = new Map();
const USER_MUTATION_LOCKS = new Map();
const CHECKOUT_SESSION_LOCKS = new Map();
const PURCHASE_ORDER_MUTATION_LOCKS = new Map();
const RASHIN_PAID_CODE_MUTATION_LOCKS = new Map();
const RATE_LIMIT_RULES = {
  ai: { windowMs: 10 * 60 * 1000, max: 24 },
  google_auth: { windowMs: 10 * 60 * 1000, max: 12 },
  member_session: { windowMs: 10 * 60 * 1000, max: 20 },
  rashin_code: { windowMs: 10 * 60 * 1000, max: 10 },
  rashin_paid_code: { windowMs: 10 * 60 * 1000, max: 10 },
  rashin_code_purchase: { windowMs: 10 * 60 * 1000, max: 8 },
  booth_order_claim: { windowMs: 10 * 60 * 1000, max: 8 },
  rashin_code_admin: { windowMs: 10 * 60 * 1000, max: 30 },
  stripe_checkout: { windowMs: 10 * 60 * 1000, max: 8 },
  stripe_portal: { windowMs: 10 * 60 * 1000, max: 20 },
  client_log: { windowMs: 10 * 60 * 1000, max: 80 },
};
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const AI_FREE_DAILY_LIMIT = Math.max(1, parseInt(process.env.AI_FREE_DAILY_LIMIT || '5', 10) || 5);
const PAID_MODEL_AB_TEST_NAME = 'paid_model_gpt55_vs_sonnet46';
const PAID_MODEL_AB_TEST_ENABLED = normalizeEnvValue(process.env.PAID_MODEL_AB_TEST_ENABLED || '').toLowerCase() === 'true';
const PAID_MODEL_AB_TEST_OPENAI_WEIGHT_RAW = parseInt(process.env.PAID_MODEL_AB_TEST_OPENAI_WEIGHT || '50', 10);
const PAID_MODEL_AB_TEST_OPENAI_WEIGHT = Number.isFinite(PAID_MODEL_AB_TEST_OPENAI_WEIGHT_RAW)
  ? Math.min(100, Math.max(0, PAID_MODEL_AB_TEST_OPENAI_WEIGHT_RAW))
  : 50;
const PAID_MODELS = new Set([AI_MODELS.paid, AI_MODELS.history, AI_MODELS.paidFallback, AI_MODELS.paidAbOpenai]);
const DEEP_READING_PRERELEASE_AMOUNT = Math.max(1, parseInt(process.env.DEEP_READING_PRERELEASE_AMOUNT || '780', 10) || 780);
const DEEP_READING_RELEASE_AMOUNT = Math.max(1, parseInt(process.env.DEEP_READING_RELEASE_AMOUNT || '1000', 10) || 1000);
const DEEP_READING_NORMAL_AMOUNT = Math.max(1, parseInt(process.env.DEEP_READING_ONCE_AMOUNT || String(DEEP_READING_PRERELEASE_AMOUNT), 10) || DEEP_READING_PRERELEASE_AMOUNT);
const RASHIN_BONUS_REWARD_AMOUNT = 1;
const RASHIN_BONUS_VALID_DAYS = 7;
const RASHIN_BONUS_FREE_READING_REQUIRED_STONES = 30;
const RASHIN_BONUS_DISCOUNTS = [];
const RASHIN_FREE_PAID_CODE_HASH_FILE = normalizeEnvValue(process.env.RASHIN_FREE_PAID_CODE_HASH_FILE || 'config/rashin-free-paid-code-hashes.json');
const RASHIN_REUSABLE_PAID_CODE_HASH_FILE = normalizeEnvValue(process.env.RASHIN_REUSABLE_PAID_CODE_HASH_FILE || 'config/rashin-reusable-paid-code-hashes.json');
const RASHIN_FREE_PAID_CODE_HASHES = loadRashinFreePaidCodeHashes();
const RASHIN_REUSABLE_PAID_CODE_HASHES = loadRashinReusablePaidCodeHashes();

function normalizeRashinPaidCodeHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : '';
}

function readRashinFreePaidCodeHashFilePath() {
  const configured = normalizeEnvValue(RASHIN_FREE_PAID_CODE_HASH_FILE);
  if (!configured || isPlaceholderEnvValue(configured)) return '';
  return path.isAbsolute(configured) ? configured : path.join(ROOT_DIR, configured);
}

function readRashinFreePaidCodeHashFile() {
  const filePath = readRashinFreePaidCodeHashFilePath();
  if (!filePath || !fs.existsSync(filePath)) return [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`RASHIN_FREE_PAID_CODE_HASH_FILE could not be parsed: ${error.message}`);
  }
  const entries = Array.isArray(parsed) ? parsed : parsed?.hashes;
  if (!Array.isArray(entries)) {
    throw new Error('RASHIN_FREE_PAID_CODE_HASH_FILE must contain an array or a hashes array.');
  }
  const hashes = [];
  const invalid = [];
  entries.forEach((entry, index) => {
    const hash = normalizeRashinPaidCodeHash(entry);
    if (hash) hashes.push(hash);
    else invalid.push(index + 1);
  });
  if (invalid.length) {
    throw new Error(`RASHIN_FREE_PAID_CODE_HASH_FILE has invalid hash entries at positions: ${invalid.slice(0, 10).join(', ')}`);
  }
  return hashes;
}

function readRashinFreePaidCodeEnvHashes() {
  return String(process.env.RASHIN_FREE_PAID_CODES || process.env.RASHIN_PROMO_PAID_CODES || '')
    .split(/[\s,]+/)
    .map(value => value.trim())
    .filter(value => value && !isPlaceholderEnvValue(value))
    .map(value => normalizeRashinPaidCode(value))
    .filter(value => /^[A-Z0-9]{12}$/.test(value))
    .map(value => getRashinPaidCodeHash(value))
    .filter(Boolean);
}

function loadRashinFreePaidCodeHashes() {
  return new Set([
    ...readRashinFreePaidCodeEnvHashes(),
    ...readRashinFreePaidCodeHashFile(),
  ]);
}

function readRashinReusablePaidCodeHashFilePath() {
  const configured = normalizeEnvValue(RASHIN_REUSABLE_PAID_CODE_HASH_FILE);
  if (!configured || isPlaceholderEnvValue(configured)) return '';
  return path.isAbsolute(configured) ? configured : path.join(ROOT_DIR, configured);
}

function readRashinReusablePaidCodeHashFile() {
  const filePath = readRashinReusablePaidCodeHashFilePath();
  if (!filePath || !fs.existsSync(filePath)) return [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`RASHIN_REUSABLE_PAID_CODE_HASH_FILE could not be parsed: ${error.message}`);
  }
  const entries = Array.isArray(parsed) ? parsed : parsed?.hashes;
  if (!Array.isArray(entries)) {
    throw new Error('RASHIN_REUSABLE_PAID_CODE_HASH_FILE must contain an array or a hashes array.');
  }
  const hashes = [];
  const invalid = [];
  entries.forEach((entry, index) => {
    const hash = normalizeRashinPaidCodeHash(entry);
    if (hash) hashes.push(hash);
    else invalid.push(index + 1);
  });
  if (invalid.length) {
    throw new Error(`RASHIN_REUSABLE_PAID_CODE_HASH_FILE has invalid hash entries at positions: ${invalid.slice(0, 10).join(', ')}`);
  }
  return hashes;
}

function readRashinReusablePaidCodeEnvHashes() {
  return String(process.env.RASHIN_REUSABLE_PAID_CODES || process.env.RASHIN_SPECIAL_PAID_CODES || '')
    .split(/[\s,]+/)
    .map(value => value.trim())
    .filter(value => value && !isPlaceholderEnvValue(value))
    .map(value => normalizeRashinPaidCode(value))
    .filter(value => /^[A-Z0-9]{12}$/.test(value))
    .map(value => getRashinPaidCodeHash(value))
    .filter(Boolean);
}

function loadRashinReusablePaidCodeHashes() {
  return new Set([
    ...readRashinReusablePaidCodeEnvHashes(),
    ...readRashinReusablePaidCodeHashFile(),
  ]);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

const ALLOWED_MODELS = {
  anthropic: new Set([
    AI_MODELS.paid,
    AI_MODELS.history,
  ]),
  openai: new Set([
    AI_MODELS.free,
    AI_MODELS.light,
    AI_MODELS.paidFallback,
    AI_MODELS.paidAbOpenai,
    AI_MODELS.structure,
  ]),
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function handleThreadsCallbackPage(req, res) {
  const requestUrl = new URL(req.url, PUBLIC_ORIGIN || 'https://rashin-senjutsu.onrender.com');
  const code = requestUrl.searchParams.get('code') || '';
  const error = requestUrl.searchParams.get('error')
    || requestUrl.searchParams.get('error_message')
    || requestUrl.searchParams.get('error_reason')
    || requestUrl.searchParams.get('error_description')
    || '';
  const fullUrl = `${requestUrl.pathname}${requestUrl.search}`;
  const exchangeCommand = code
    ? `node scripts/social/threads-tool.js exchange --url="${escapeHtml(requestUrl.href)}"`
    : '';
  const body = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Threads OAuth callback</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7;margin:32px;max-width:860px;color:#171717;background:#f7f7f8}
    main{background:#fff;border:1px solid #ddd;border-radius:8px;padding:24px}
    code,pre{background:#f1f2f4;border-radius:6px}
    pre{white-space:pre-wrap;word-break:break-all;padding:14px}
    .ok{color:#066b36;font-weight:700}.ng{color:#a40e10;font-weight:700}
  </style>
</head>
<body>
<main>
  <h1>Threads callback</h1>
  ${code ? '<p class="ok">認証コードを受け取りました。</p>' : '<p class="ng">認証コードがありません。</p>'}
  ${error ? `<p class="ng">Error: ${escapeHtml(error)}</p>` : ''}
  <p>PowerShellで次を実行してください。</p>
  ${exchangeCommand ? `<pre>${exchangeCommand}</pre>` : '<pre>PowerShellに戻って、表示された https://threads.net/oauth/authorize?... のURLから開き直してください。</pre>'}
  <p>受信URL:</p>
  <pre>${escapeHtml(fullUrl)}</pre>
</main>
</body>
</html>`;
  sendText(res, code ? 200 : 400, body, 'text/html; charset=utf-8');
}

function handleThreadsLifecycleCallback(req, res, kind) {
  const label = kind === 'delete' ? 'data deletion callback' : 'uninstall callback';
  const body = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Threads ${escapeHtml(label)}</title>
</head>
<body>
  <main>
    <h1>Threads ${escapeHtml(label)}</h1>
    <p>OK</p>
  </main>
</body>
</html>`;
  sendText(res, 200, body, 'text/html; charset=utf-8');
}

function applySecurityHeaders(req, res) {
  // TODO(security): Remove unsafe-inline after moving inline JS/CSS to nonce/hash based assets.
  // This is intentionally left for a larger frontend refactor.
  const imgSrc = "img-src 'self' data: blob: https://*.googleusercontent.com https://www.google-analytics.com";
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://js.stripe.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    imgSrc,
    "media-src 'self'",
    "connect-src 'self' https://accounts.google.com https://api.stripe.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com",
    "frame-src 'self' https://accounts.google.com https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.stripe.com")');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (IS_PRODUCTION || getRequestProto(req) === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
}

function getAllowedCorsOrigin(req) {
  const origin = String(req?.headers?.origin || '').trim();
  if (!origin) return '';
  if (origin === 'null') return !IS_DEPLOYED_RUNTIME && isLocalRequest(req) ? 'null' : '';
  const normalizedOrigin = normalizeOriginValue(origin);
  if (normalizedOrigin && CORS_ALLOWED_ORIGINS.has(normalizedOrigin)) return normalizedOrigin;
  return '';
}

function applyCorsHeaders(req, res) {
  const origin = getAllowedCorsOrigin(req);
  if (!origin) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', isLocalRequest(req) ? 'Content-Type, X-Uranai-Developer-Email' : 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function getRemoteAddress(req) {
  return normalizeRemoteAddress(req?.socket?.remoteAddress || '');
}

function isLocalRequest(req) {
  // Never trust Host/X-Forwarded-* for local-only privileges.
  return isLocalAddress(getRemoteAddress(req));
}

function getClientAddress(req) {
  const forwarded = TRUST_PROXY ? String(req?.headers?.['x-forwarded-for'] || '').trim() : '';
  if (forwarded) return forwarded.split(',')[0].trim();
  return getRemoteAddress(req) || 'unknown';
}

function consumeRateLimit(req, bucket) {
  if (isLocalRequest(req)) return { ok: true, remaining: 999 };
  const rule = RATE_LIMIT_RULES[bucket];
  if (!rule) return { ok: true, remaining: 999 };
  const now = Date.now();
  const key = `${bucket}:${getClientAddress(req)}`;
  const entries = (RATE_LIMIT_STATE.get(key) || []).filter(timestamp => now - timestamp < rule.windowMs);
  if (entries.length >= rule.max) {
    const retryAfterMs = Math.max(1000, rule.windowMs - (now - entries[0]));
    RATE_LIMIT_STATE.set(key, entries);
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
    };
  }
  entries.push(now);
  RATE_LIMIT_STATE.set(key, entries);
  return {
    ok: true,
    remaining: Math.max(0, rule.max - entries.length),
  };
}

function getAiDailyQuotaOwner(req, payload = {}) {
  const authSession = readAuthSession(req);
  if (authSession?.userId) return `user:${authSession.userId}`;
  const vaultId = String(payload?.identity?.vaultId || '').trim();
  if (/^[A-Za-z0-9_-]{16,100}$/.test(vaultId)) return `vault:${vaultId}`;
  return `ip:${getClientAddress(req)}`;
}

function getAiDailyQuotaPath(ownerKey, dateStamp = getJstDateStamp()) {
  const ownerHash = crypto.createHash('sha256').update(ownerKey).digest('hex');
  return path.join(AI_FREE_DAILY_QUOTA_DIR, `${dateStamp}-${ownerHash}.json`);
}

async function consumeFreeAiDailyQuota(req, payload = {}) {
  if (isLocalRequest(req)) return { ok: true, remaining: AI_FREE_DAILY_LIMIT };
  if (payload?.plan === 'paid' || isPaidModel(payload?.model)) return { ok: true, remaining: AI_FREE_DAILY_LIMIT };
  const dateStamp = getJstDateStamp();
  const ownerKey = getAiDailyQuotaOwner(req, payload);
  const filePath = getAiDailyQuotaPath(ownerKey, dateStamp);
  const current = await readJsonFileSafe(filePath, { date: dateStamp, count: 0, freeReadingIds: [], paidRestores: 0, restoredPaidReadingIds: [] });
  const freeReadingIds = current?.date === dateStamp && Array.isArray(current.freeReadingIds)
    ? current.freeReadingIds.slice(0, 200)
    : [];
  const readingId = normalizeVaultRecordId(payload?.reading_id || '');
  const legacyCount = current?.date === dateStamp ? Math.max(0, Number(current.count || 0) || 0) : 0;
  const count = Math.max(legacyCount, freeReadingIds.length);
  const paidRestores = current?.date === dateStamp ? Math.max(0, Number(current.paidRestores || 0) || 0) : 0;
  const limit = AI_FREE_DAILY_LIMIT + paidRestores;
  if (readingId && freeReadingIds.includes(readingId)) {
    return { ok: true, remaining: Math.max(0, limit - count), limit };
  }
  if (count >= limit) {
    return { ok: false, remaining: 0, limit };
  }
  const nextCount = count + 1;
  const nextFreeReadingIds = readingId ? [...freeReadingIds, readingId] : freeReadingIds;
  await writeJsonFileAtomic(filePath, {
    ...(current && typeof current === 'object' ? current : {}),
    date: dateStamp,
    count: nextCount,
    freeReadingIds: nextFreeReadingIds,
    paidRestores,
    restoredPaidReadingIds: Array.isArray(current?.restoredPaidReadingIds) ? current.restoredPaidReadingIds.slice(0, 100) : [],
    updatedAt: new Date().toISOString(),
  });
  return {
    ok: true,
    remaining: Math.max(0, limit - nextCount),
    limit,
  };
}

async function restoreFreeAiDailyQuota(req, payload = {}, restoreId = '') {
  if (isLocalRequest(req)) return { ok: true, restored: false };
  const safeRestoreId = normalizeVaultRecordId(restoreId || '');
  if (!safeRestoreId) return { ok: true, restored: false };
  const dateStamp = getJstDateStamp();
  const ownerKey = getAiDailyQuotaOwner(req, payload);
  const filePath = getAiDailyQuotaPath(ownerKey, dateStamp);
  const current = await readJsonFileSafe(filePath, { date: dateStamp, count: 0, paidRestores: 0, restoredPaidReadingIds: [] });
  const restoredIds = current?.date === dateStamp && Array.isArray(current.restoredPaidReadingIds)
    ? current.restoredPaidReadingIds.slice(0, 100)
    : [];
  if (restoredIds.includes(safeRestoreId)) return { ok: true, restored: false };
  restoredIds.push(safeRestoreId);
  await writeJsonFileAtomic(filePath, {
    ...(current && typeof current === 'object' ? current : {}),
    date: dateStamp,
    count: current?.date === dateStamp ? Math.max(0, Number(current.count || 0) || 0) : 0,
    paidRestores: restoredIds.length,
    restoredPaidReadingIds: restoredIds,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, restored: true };
}

async function restoreFreeAiDailyQuotaFromPaid(req, payload = {}) {
  if (payload?.plan !== 'paid' || !isPaidModel(payload?.model) || payload?.task_key !== 'paid') {
    return { ok: true, restored: false };
  }
  return restoreFreeAiDailyQuota(req, payload, payload?.paid_reading_id || '');
}

// TODO: Move rate limiting to Redis or another shared store before multi-process production scaling.
function cleanupRateLimitState() {
  const now = Date.now();
  const maxWindowMs = Math.max(...Object.values(RATE_LIMIT_RULES).map(rule => rule.windowMs || 0), 0);
  for (const [key, timestamps] of RATE_LIMIT_STATE.entries()) {
    const fresh = (Array.isArray(timestamps) ? timestamps : []).filter(timestamp => now - timestamp < maxWindowMs);
    if (fresh.length) RATE_LIMIT_STATE.set(key, fresh);
    else RATE_LIMIT_STATE.delete(key);
  }
}

const RATE_LIMIT_CLEANUP_TIMER = setInterval(cleanupRateLimitState, RATE_LIMIT_CLEANUP_INTERVAL_MS);
if (typeof RATE_LIMIT_CLEANUP_TIMER.unref === 'function') RATE_LIMIT_CLEANUP_TIMER.unref();

function sendRateLimitExceeded(res, result, message) {
  const retryAfter = Math.max(1, Number(result?.retryAfterSec || 60) || 60);
  res.setHeader('Retry-After', String(retryAfter));
  sendJson(res, 429, {
    error: 'RATE_LIMITED',
    message: message || 'Too many requests. Please retry later.',
    retryAfterSec: retryAfter,
  });
}

function isPaidModel(model) {
  return PAID_MODELS.has(String(model || '').trim());
}

function getRequestProto(req) {
  const forwarded = String(req?.headers?.['x-forwarded-proto'] || '').trim().toLowerCase();
  if (forwarded) return forwarded.split(',')[0].trim() || 'http';
  return req?.socket?.encrypted ? 'https' : 'http';
}

function getRequestOrigin(req) {
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
  if (!host) return '';
  return `${getRequestProto(req)}://${host}`;
}

function makeAbsoluteUrl(req, pathValue) {
  const origin = getRequestOrigin(req);
  if (!origin) return pathValue || '';
  const raw = String(pathValue || '/');
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      return new URL(`${url.pathname}${url.search}${url.hash}`, origin).toString();
    } catch (_error) {
      return new URL('/', origin).toString();
    }
  }
  return new URL(raw, origin).toString();
}

function normalizeShareText(value, fallback = '', maxLength = 140) {
  const text = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

const SHARE_ORACLE_META = {
  1: { name: 'The Guide', description: '今日は、自分の中の道しるべを信じる日。' },
  2: { name: 'The Supporter', description: '今日は、無理なく支える日。' },
  3: { name: 'The Innocent', description: '今日は、軽さが本音を連れてくる日。' },
  4: { name: 'The Diligent', description: '今日は、足元を整える日。' },
  5: { name: 'The Adventurer', description: '今日は、小さな冒険が流れを動かす日。' },
  6: { name: 'The Caregiver', description: '今日は、自分も優しさの輪に入れる日。' },
  7: { name: 'The Artisan', description: '今日は、自分の質を磨く日。' },
  8: { name: 'The Warrior', description: '今日は、力の使い道を決める日。' },
  9: { name: 'The Sage', description: '今日は、手放すほど見えてくる日。' },
  10: { name: 'The Great Power', description: '今日は、新しい入口を見つける日。' },
  11: { name: 'The Inspired One', description: '今日は、ひらめきを形にする日。' },
  12: { name: 'The Harmonizer', description: '今日は、間に余白を作る日。' },
  13: { name: 'The Wise King', description: '今日は、古い型を更新する日。' },
  14: { name: 'The Transformer', description: '今日は、ちょうどいい配合を探す日。' },
  15: { name: 'The Servant', description: '今日は、動機を澄ませる日。' },
  16: { name: 'The Perceptive One', description: '今日は、違和感を見過ごさない日。' },
  17: { name: 'The Benefactor', description: '今日は、小さな希望を渡す日。' },
  18: { name: 'The Seeker', description: '今日は、霧の中で事実を拾う日。' },
  19: { name: 'The Unwavering One', description: '今日は、自分の光を曲げない日。' },
  20: { name: 'The Unifier', description: '今日は、過去の学びを今に戻す日。' },
  21: { name: 'The Completer', description: '今日は、美しく終える日。' },
  22: { name: 'The Charism', description: '今日は、誠実な一手が影響力になる日。' },
  23: { name: 'The Flowrider', description: '今日は、予定外の流れを味方にする日。' },
  24: { name: 'The Gracebearer', description: '今日は、柔らかさが力になる日。' },
  25: { name: 'The Wayfarer', description: '今日は、自分の歩幅に戻る日。' },
  26: { name: 'The Trailblazer', description: '今日は、未舗装の道を試す日。' },
  27: { name: 'The Gatewalker', description: '今日は、次の扉の前で整える日。' },
  28: { name: 'The Resonator', description: '今日は、響き合う場を選ぶ日。' },
  29: { name: 'The Visionweaver', description: '今日は、理想を一手に編み込む日。' },
  30: { name: 'The Creator', description: '今日は、ひらめきを形にして残す日。' },
  31: { name: 'The Architect', description: '今日は、設計図を引く日。' },
  32: { name: 'The Collaborator', description: '今日は、ひとりで抱えず共に動かす日。' },
  33: { name: 'The Awakened', description: '今日は、自分の灯を守ってから照らす日。' },
};

function getShareCardImagePath(type, idValue) {
  const id = Number.parseInt(String(idValue || ''), 10);
  if (!Number.isInteger(id) || id < 1 || id > 99) return '';
  const folder = String(type || '').toLowerCase() === 'len' || String(type || '').toLowerCase() === 'lenormand'
    ? 'lenormand'
    : 'oracle';
  return `/images/cards/${folder}/${String(id).padStart(2, '0')}.jpg`;
}

function handleShareCardPage(req, res) {
  const url = new URL(req.url, makeAbsoluteUrl(req, '/'));
  const type = url.searchParams.get('type');
  const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
  const imagePath = getShareCardImagePath(type, id);
  if (!imagePath) {
    sendText(res, 404, 'Not Found');
    return;
  }
  const isOracle = String(type || '').toLowerCase() !== 'len' && String(type || '').toLowerCase() !== 'lenormand';
  const oracleMeta = isOracle ? SHARE_ORACLE_META[id] : null;
  const title = normalizeShareText(url.searchParams.get('title'), oracleMeta?.name || '羅針占術のカード', 80);
  const description = normalizeShareText(url.searchParams.get('message'), oracleMeta?.description || '迷いを、次の一手に変える占い。', 160);
  const pageUrl = makeAbsoluteUrl(req, `${url.pathname}${url.search}`);
  const imageUrl = makeAbsoluteUrl(req, imagePath);
  const appUrl = makeAbsoluteUrl(req, '/uranai-v5.html');
  const body = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | 羅針占術</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="羅針占術">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}">
</head>
<body>
  <p><a href="${escapeHtml(appUrl)}">羅針占術を開く</a></p>
</body>
</html>`;
  sendText(res, 200, body, 'text/html; charset=utf-8');
}

function stripeReady() {
  return !!(STRIPE_SECRET_CONFIGURED && STRIPE_DEEP_READING_PRICE_CONFIGURED);
}

function stripeSubscriptionReady() {
  return !!(STRIPE_SECRET_CONFIGURED && STRIPE_PRICE_CONFIGURED);
}

function stripePortalReady() {
  return !!STRIPE_SECRET_CONFIGURED;
}

function stripeWebhookReady() {
  return !!(STRIPE_SECRET_CONFIGURED && STRIPE_WEBHOOK_CONFIGURED);
}

function rashinPaidCodeReady() {
  return true;
}

function normalizeBoothOrderReference(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function isPlausibleBoothOrderReference(value) {
  const normalized = normalizeBoothOrderReference(value);
  if (!normalized || /booth\s*注文番号|注文番号|replace-with|example|sample|dummy|test/i.test(normalized)) return false;
  if (!/^[\x20-\x7e]+$/.test(normalized)) return false;
  return normalized.replace(/[^a-z0-9]/gi, '').length >= 5;
}

function boothGmailVerificationConfigured() {
  return !!(
    BOOTH_GMAIL_IMAP_HOST &&
    BOOTH_GMAIL_IMAP_PORT > 0 &&
    BOOTH_GMAIL_IMAP_USER &&
    BOOTH_GMAIL_IMAP_APP_PASSWORD &&
    !isPlaceholderEnvValue(BOOTH_GMAIL_IMAP_USER) &&
    !isPlaceholderEnvValue(BOOTH_GMAIL_IMAP_APP_PASSWORD)
  );
}

function escapeGmailSearchPhrase(value) {
  const normalized = String(value || '').replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? `"${normalized}"` : '';
}

function buildBoothGmailSearchQuery(orderReference, userRecord = null) {
  const parts = [];
  if (BOOTH_GMAIL_SEARCH_QUERY) {
    parts.push(BOOTH_GMAIL_SEARCH_QUERY);
  } else {
    if (BOOTH_GMAIL_SEARCH_FROM) parts.push(`from:(${BOOTH_GMAIL_SEARCH_FROM})`);
    if (BOOTH_GMAIL_SEARCH_DAYS > 0) parts.push(`newer_than:${BOOTH_GMAIL_SEARCH_DAYS}d`);
  }
  const referencePhrase = escapeGmailSearchPhrase(orderReference);
  if (referencePhrase) parts.push(referencePhrase);
  if (BOOTH_GMAIL_MATCH_BUYER_EMAIL) {
    const emailPhrase = escapeGmailSearchPhrase(normalizeCustomerEmail(userRecord?.email || ''));
    if (emailPhrase) parts.push(emailPhrase);
  }
  return parts.filter(Boolean).join(' ');
}

function quoteImapString(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

function parseImapSearchUids(lines) {
  const searchLine = (lines || []).find(line => /^\* SEARCH\b/i.test(line));
  if (!searchLine) return [];
  return searchLine.split(/\s+/).slice(2).filter(value => /^\d+$/.test(value));
}

function sanitizeImapDiagnostic(value) {
  let detail = String(value || '');
  if (BOOTH_GMAIL_IMAP_USER) detail = detail.replace(BOOTH_GMAIL_IMAP_USER, '[gmail-user]');
  if (BOOTH_GMAIL_IMAP_APP_PASSWORD) detail = detail.replace(BOOTH_GMAIL_IMAP_APP_PASSWORD, '[gmail-password]');
  return detail.slice(0, 240);
}

function buildBoothGmailDiagnostic(error, publicCode) {
  const detail = sanitizeImapDiagnostic(error?.imapLine || error?.message || '');
  const stage = String(error?.stage || '').slice(0, 40);
  let hint = 'Check Render logs for the BOOTH Gmail verification failure detail.';
  if (/AUTHENTICATIONFAILED|LOGIN|PASSWORD|CREDENTIAL|APPLICATION-SPECIFIC|WEB LOGIN REQUIRED|ALERT/i.test(detail)) {
    hint = 'Check the Gmail address, app password, 2-step verification, and IMAP setting.';
  } else if (/BAD|parse|X-GM-RAW|SEARCH/i.test(detail)) {
    hint = 'Check the BOOTH order number and Gmail search settings.';
  } else if (/TIMEOUT|CONNECTION|ENOTFOUND|ECONN|TLS/i.test(detail)) {
    hint = 'Check IMAP host, port, and network connection from Render.';
  }
  return {
    code: publicCode,
    stage,
    detail,
    hint,
  };
}

async function runImapCommand(client, stage, commandText) {
  try {
    return await client.command(commandText);
  } catch (error) {
    error.stage = stage;
    throw error;
  }
}

class SimpleImapClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = '';
    this.tagCounter = 0;
    this.pending = null;
    this.greeted = false;
    this.closed = false;
    this.greetingPromise = new Promise((resolve, reject) => {
      this.greetingResolve = resolve;
      this.greetingReject = reject;
    });

    socket.setEncoding('utf8');
    socket.setTimeout(BOOTH_GMAIL_VERIFY_TIMEOUT_MS);
    socket.on('data', chunk => this.handleData(chunk));
    socket.on('timeout', () => this.fail(new Error('IMAP_TIMEOUT')));
    socket.on('error', error => this.fail(error));
    socket.on('close', () => {
      this.closed = true;
      if (!this.greeted) this.fail(new Error('IMAP_CONNECTION_CLOSED'));
      if (this.pending) this.fail(new Error('IMAP_CONNECTION_CLOSED'));
    });
  }

  handleData(chunk) {
    this.buffer += chunk;
    let lineEnd = this.buffer.indexOf('\n');
    while (lineEnd >= 0) {
      const rawLine = this.buffer.slice(0, lineEnd).replace(/\r$/, '');
      this.buffer = this.buffer.slice(lineEnd + 1);
      this.handleLine(rawLine);
      lineEnd = this.buffer.indexOf('\n');
    }
  }

  handleLine(line) {
    if (!this.greeted) {
      if (/^\* OK\b/i.test(line)) {
        this.greeted = true;
        this.greetingResolve();
      } else if (/^\* (NO|BAD)\b/i.test(line)) {
        const error = new Error('IMAP_GREETING_REJECTED');
        error.imapLine = line;
        this.greetingReject(error);
      }
      return;
    }

    if (!this.pending) return;
    this.pending.lines.push(line);
    if (line.toUpperCase().startsWith(`${this.pending.tag} `)) {
      const pending = this.pending;
      this.pending = null;
      if (new RegExp(`^${pending.tag} OK\\b`, 'i').test(line)) {
        pending.resolve(pending.lines);
      } else {
        const error = new Error('IMAP_COMMAND_FAILED');
        error.imapLine = line;
        pending.reject(error);
      }
    }
  }

  fail(error) {
    if (!this.greeted && this.greetingReject) this.greetingReject(error);
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      pending.reject(error);
    }
    if (!this.closed) this.socket.destroy();
  }

  waitForGreeting() {
    return this.greetingPromise;
  }

  command(commandText) {
    if (this.pending) return Promise.reject(new Error('IMAP_COMMAND_IN_PROGRESS'));
    if (this.closed) return Promise.reject(new Error('IMAP_CONNECTION_CLOSED'));
    const tag = `A${String(++this.tagCounter).padStart(4, '0')}`;
    return new Promise((resolve, reject) => {
      this.pending = { tag, lines: [], resolve, reject };
      this.socket.write(`${tag} ${commandText}\r\n`);
    });
  }

  async close() {
    if (this.closed) return;
    try {
      await this.command('LOGOUT');
    } catch (_error) {
      // Closing the socket is enough after a failed verification attempt.
    }
    this.socket.end();
  }
}

async function connectSimpleImapClient() {
  try {
    const socket = tls.connect({
      host: BOOTH_GMAIL_IMAP_HOST,
      port: BOOTH_GMAIL_IMAP_PORT,
      servername: BOOTH_GMAIL_IMAP_HOST,
      rejectUnauthorized: true,
    });
    const client = new SimpleImapClient(socket);
    await client.waitForGreeting();
    return client;
  } catch (error) {
    error.stage = 'connect';
    throw error;
  }
}

async function searchBoothOrderInGmail(orderReference, userRecord = null) {
  const query = buildBoothGmailSearchQuery(orderReference, userRecord);
  if (!query) {
    const error = new Error('BOOTH_GMAIL_QUERY_EMPTY');
    error.statusCode = 500;
    throw error;
  }
  const client = await connectSimpleImapClient();
  try {
    await runImapCommand(client, 'login', `LOGIN ${quoteImapString(BOOTH_GMAIL_IMAP_USER)} ${quoteImapString(BOOTH_GMAIL_IMAP_APP_PASSWORD)}`);
    await runImapCommand(client, 'mailbox', `EXAMINE ${quoteImapString(BOOTH_GMAIL_IMAP_MAILBOX)}`);
    const lines = await runImapCommand(client, 'search', `UID SEARCH X-GM-RAW ${quoteImapString(query)}`);
    const uids = parseImapSearchUids(lines);
    return {
      verified: uids.length > 0,
      matchCount: uids.length,
      queryHash: hashPrivateLookupValue('booth_gmail_query', query),
    };
  } finally {
    await client.close();
  }
}

async function verifyBoothOrderReferenceWithGmail(orderReference, { userRecord = null } = {}) {
  if (!BOOTH_GMAIL_VERIFICATION_REQUIRED) {
    return { verified: true, skipped: true, reason: 'disabled', matchCount: 0, queryHash: '' };
  }
  if (!boothGmailVerificationConfigured()) {
    const error = new Error('BOOTH_GMAIL_NOT_CONFIGURED');
    error.statusCode = 503;
    throw error;
  }
  try {
    const result = await searchBoothOrderInGmail(orderReference, userRecord);
    if (!result.verified) {
      const error = new Error('BOOTH_ORDER_NOT_FOUND_IN_GMAIL');
      error.statusCode = 404;
      error.verification = result;
      throw error;
    }
    return result;
  } catch (error) {
    if (error.statusCode) throw error;
    const failed = new Error(/AUTHENTICATIONFAILED|LOGIN|PASSWORD|CREDENTIAL|APPLICATION-SPECIFIC|WEB LOGIN REQUIRED|ALERT/i.test(error.imapLine || error.message || '')
      ? 'BOOTH_GMAIL_AUTH_FAILED'
      : 'BOOTH_GMAIL_VERIFY_FAILED');
    failed.statusCode = 503;
    failed.diagnostic = buildBoothGmailDiagnostic(error, failed.message);
    console.error('BOOTH Gmail verification failed', {
      error: failed.message,
      detail: error.imapLine || error.message || '',
      stage: error.stage || '',
      host: BOOTH_GMAIL_IMAP_HOST,
      mailbox: BOOTH_GMAIL_IMAP_MAILBOX,
    });
    throw failed;
  }
}

function getBoothPaymentPayload() {
  return {
    provider: 'booth',
    url: normalizePublicUrl(BOOTH_DEEP_READING_URL),
    label: BOOTH_PAYMENT_LABEL,
    note: BOOTH_PAYMENT_NOTE,
  };
}

function boothPurchaseReady() {
  return !!getBoothPaymentPayload().url && (!BOOTH_GMAIL_VERIFICATION_REQUIRED || boothGmailVerificationConfigured());
}

async function getRuntimeSetupStatus(req) {
  const issues = [];
  if (!OPENAI_KEY_CONFIGURED) issues.push('OPENAI_API_KEY');
  if (!ANTHROPIC_KEY_CONFIGURED) issues.push('ANTHROPIC_API_KEY');
  if (!GOOGLE_CLIENT_CONFIGURED) issues.push('GOOGLE_CLIENT_ID');
  if (!MEMBER_SESSION_PERSISTENT) issues.push('MEMBER_SESSION_SECRET');
  if (!AUTH_SESSION_PERSISTENT) issues.push('AUTH_SESSION_SECRET');
  if (BOOTH_GMAIL_VERIFICATION_REQUIRED && !boothGmailVerificationConfigured()) {
    issues.push('BOOTH_GMAIL_IMAP_USER / BOOTH_GMAIL_IMAP_APP_PASSWORD');
  }
  const productionReady = issues.length === 0;
  return {
    ok: productionReady,
    googleClientConfigured: GOOGLE_CLIENT_CONFIGURED,
    rashinPaidCodeReady: rashinPaidCodeReady(),
    boothPurchaseReady: boothPurchaseReady(),
    boothProductUrlConfigured: !!getBoothPaymentPayload().url,
    boothGmailVerificationRequired: BOOTH_GMAIL_VERIFICATION_REQUIRED,
    boothGmailVerificationConfigured: boothGmailVerificationConfigured(),
    deepReadingAmount: DEEP_READING_NORMAL_AMOUNT,
    deepReadingPrereleaseAmount: DEEP_READING_PRERELEASE_AMOUNT,
    deepReadingReleaseAmount: DEEP_READING_RELEASE_AMOUNT,
    paidModelAbTest: {
      name: PAID_MODEL_AB_TEST_NAME,
      enabled: PAID_MODEL_AB_TEST_ENABLED,
      openaiWeight: PAID_MODEL_AB_TEST_OPENAI_WEIGHT,
      anthropicModel: AI_MODELS.paid,
      openaiModel: AI_MODELS.paidAbOpenai,
    },
    rashinCodeAdminSecretConfigured: isConfiguredAppSecret(RASHIN_CODE_ADMIN_SECRET),
    stripeSecretConfigured: STRIPE_SECRET_CONFIGURED,
    stripePriceConfigured: STRIPE_PRICE_CONFIGURED,
    stripeDeepReadingPriceConfigured: STRIPE_DEEP_READING_PRICE_CONFIGURED,
    stripeWebhookConfigured: STRIPE_WEBHOOK_CONFIGURED,
    memberSessionPersistent: MEMBER_SESSION_PERSISTENT,
    authSessionPersistent: AUTH_SESSION_PERSISTENT,
    productionReady,
    issues,
    codePurchasePath: '/api/rashin-paid-code/purchase-intent',
    codeRedeemPath: '/api/rashin-paid-code/redeem',
    codeAdminIssuePath: '/api/rashin-paid-code/admin/issue',
    boothOrderClaimPath: '/api/rashin-paid-code/booth/claim',
    boothGmailTestPath: '/api/rashin-paid-code/booth/gmail-test',
    legacyStripeWebhookPath: '/api/stripe/webhook',
    legacyStripeWebhookUrl: makeAbsoluteUrl(req, '/api/stripe/webhook'),
  };
}

function safeCompareText(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function toBase64Url(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function parseCookies(req) {
  const header = String(req?.headers?.cookie || '');
  return header.split(';').reduce((acc, entry) => {
    const [rawKey, ...rest] = entry.split('=');
    const key = String(rawKey || '').trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('=').trim());
    return acc;
  }, {});
}

function appendSetCookie(res, cookieValue) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }
  const next = Array.isArray(current) ? [...current, cookieValue] : [current, cookieValue];
  res.setHeader('Set-Cookie', next);
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  if (options.expires instanceof Date) parts.push(`Expires=${options.expires.toUTCString()}`);
  return parts.join('; ');
}

function signMemberToken(encodedPayload) {
  return crypto.createHmac('sha256', MEMBER_SESSION_SECRET).update(encodedPayload).digest('base64url');
}

function signAuthToken(encodedPayload) {
  return crypto.createHmac('sha256', AUTH_SESSION_SECRET).update(encodedPayload).digest('base64url');
}

function createMemberSessionPayload(source, maxAgeSeconds, claims = {}) {
  const issuedAt = Date.now();
  return {
    v: 1,
    sub: 'member',
    source,
    iat: issuedAt,
    exp: issuedAt + (maxAgeSeconds * 1000),
    ...claims,
  };
}

function issueMemberSession(res, options = {}) {
  const source = options.source || 'access_code';
  const maxAgeSeconds = Math.max(60, Math.floor(options.maxAgeSeconds || (MEMBER_SESSION_DAYS * 24 * 60 * 60)));
  const payload = createMemberSessionPayload(source, maxAgeSeconds, options.claims || {});
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signMemberToken(encodedPayload);
  const token = `${encodedPayload}.${signature}`;
  appendSetCookie(res, serializeCookie(MEMBER_SESSION_COOKIE, token, {
    path: '/',
    maxAge: maxAgeSeconds,
    sameSite: 'Lax',
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
  }));
  return payload;
}

function clearMemberSession(res) {
  appendSetCookie(res, serializeCookie(MEMBER_SESSION_COOKIE, '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    sameSite: 'Lax',
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
  }));
}

function issueAuthSession(res, options = {}) {
  const source = options.source || 'google';
  const maxAgeSeconds = Math.max(60, Math.floor(options.maxAgeSeconds || (AUTH_SESSION_DAYS * 24 * 60 * 60)));
  const payload = createMemberSessionPayload(source, maxAgeSeconds, options.claims || {});
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signAuthToken(encodedPayload);
  const token = `${encodedPayload}.${signature}`;
  appendSetCookie(res, serializeCookie(AUTH_SESSION_COOKIE, token, {
    path: '/',
    maxAge: maxAgeSeconds,
    sameSite: 'Lax',
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
  }));
  return payload;
}

function clearAuthSession(res) {
  appendSetCookie(res, serializeCookie(AUTH_SESSION_COOKIE, '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    sameSite: 'Lax',
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
  }));
}

function readMemberSession(req) {
  const token = parseCookies(req)[MEMBER_SESSION_COOKIE];
  if (!token) return null;
  const [encodedPayload, signature] = String(token).split('.');
  if (!encodedPayload || !signature) return null;
  const expectedSignature = signMemberToken(encodedPayload);
  if (!safeCompareText(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload));
    if (payload?.sub !== 'member') return null;
    if (!payload?.exp || Number(payload.exp) <= Date.now()) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function readAuthSession(req) {
  const token = parseCookies(req)[AUTH_SESSION_COOKIE];
  if (!token) return null;
  const [encodedPayload, signature] = String(token).split('.');
  if (!encodedPayload || !signature) return null;
  const expectedSignature = signAuthToken(encodedPayload);
  if (!safeCompareText(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload));
    if (!payload?.sub || payload.sub !== 'member') return null;
    if (!payload?.exp || Number(payload.exp) <= Date.now()) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

function normalizeMemberId(memberId) {
  const value = String(memberId || '').trim();
  if (!value || !/^[A-Za-z0-9_-]{3,80}$/.test(value)) return '';
  return value;
}

function getIsoDayStamp(dateValue = new Date()) {
  return new Date(dateValue).toISOString().slice(0, 10);
}

function getJstDateStamp(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return new Date(date.getTime() + (9 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function getJstEndOfDayAfterDaysIso(dateValue = new Date(), days = 0) {
  const base = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const jst = new Date(base.getTime() + (9 * 60 * 60 * 1000));
  jst.setUTCDate(jst.getUTCDate() + Math.max(0, Math.floor(days || 0)));
  jst.setUTCHours(23, 59, 59, 999);
  return new Date(jst.getTime() - (9 * 60 * 60 * 1000)).toISOString();
}

function normalizeRashinStones(value) {
  const count = Math.floor(Number(value || 0));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function getRashinDiscountForStones(stones) {
  const count = normalizeRashinStones(stones);
  return RASHIN_BONUS_DISCOUNTS.find(item => count >= item.requiredStones) || null;
}

function getNextRashinDiscount(stones) {
  const count = normalizeRashinStones(stones);
  const next = [...RASHIN_BONUS_DISCOUNTS].reverse().find(item => count < item.requiredStones);
  return next ? {
    requiredStones: next.requiredStones,
    discountAmount: next.discountAmount,
    remainingStones: Math.max(0, next.requiredStones - count),
  } : null;
}

function getRashinFreeReadingBenefit(stones) {
  const count = normalizeRashinStones(stones);
  return {
    requiredStones: RASHIN_BONUS_FREE_READING_REQUIRED_STONES,
    discountAmount: DEEP_READING_NORMAL_AMOUNT,
    finalAmount: 0,
    available: count >= RASHIN_BONUS_FREE_READING_REQUIRED_STONES,
    remainingStones: Math.max(0, RASHIN_BONUS_FREE_READING_REQUIRED_STONES - count),
  };
}

function readAmount(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
}

function readFirstAmount(fallback, ...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const amount = Number(value);
    if (Number.isFinite(amount)) return amount;
  }
  return fallback;
}

function buildRashinBonusView(userRecord, today = getJstDateStamp()) {
  const rashinStones = normalizeRashinStones(userRecord?.rashin_stones);
  const canClaim = String(userRecord?.last_rashin_bonus_claimed_date || '') !== today;
  const payload = {
    today,
    canClaim,
    rashinStones,
    reward: {
      type: 'rashin_fragment',
      amount: RASHIN_BONUS_REWARD_AMOUNT,
    },
    freeReadingBenefit: getRashinFreeReadingBenefit(rashinStones),
  };
  if (!canClaim) payload.reason = 'already_claimed';
  return payload;
}

function clipText(value, maxLength = 400) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function getMemberFilePath(memberId) {
  const safeId = normalizeMemberId(memberId);
  if (!safeId) return '';
  return path.join(MEMBER_DIR, `${safeId}.json`);
}

function getMemberIndexDir() {
  return INDEX_DIR;
}

function getMemberSubscriptionIndexPath() {
  return path.join(getMemberIndexDir(), 'members-by-subscription.json');
}

async function readJsonFileSafe(filePath, fallback = null) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    console.warn(`[index] Failed to read JSON index ${filePath}. Rebuilding or falling back.`, error);
    return fallback;
  }
}

async function writeJsonFileAtomic(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(data || {}, null, 2), 'utf8');
  await fsp.rename(tmpPath, filePath);
}

async function readMemberRecord(memberId) {
  const filePath = getMemberFilePath(memberId);
  if (!filePath) return null;
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeMemberRecord(memberId, record) {
  const filePath = getMemberFilePath(memberId);
  if (!filePath) throw new Error('INVALID_MEMBER_ID');
  const existing = await readMemberRecord(memberId);
  await ensureDir(MEMBER_DIR);
  await fsp.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
  await updateMembersBySubscriptionIndex({
    ...record,
    memberId: normalizeMemberId(memberId) || record?.memberId || record?.stripeCustomerId || '',
  }, existing);
}

async function listMemberRecords() {
  try {
    const entries = await fsp.readdir(MEMBER_DIR, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const fullPath = path.join(MEMBER_DIR, entry.name);
      try {
        const raw = await fsp.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        if (parsed && typeof parsed === 'object') items.push(parsed);
      } catch (_error) {}
    }
    return items;
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readMembersBySubscriptionIndex() {
  return readJsonFileSafe(getMemberSubscriptionIndexPath(), null);
}

async function writeMembersBySubscriptionIndex(index) {
  await writeJsonFileAtomic(getMemberSubscriptionIndexPath(), index || {});
}

function getMemberRecordIndexId(record = {}) {
  return normalizeMemberId(record.memberId || record.stripeCustomerId || record.customerId || '');
}

async function updateMembersBySubscriptionIndex(record = {}, previousRecord = null) {
  const memberId = getMemberRecordIndexId(record);
  if (!memberId) return;
  const currentSubscriptionId = String(record.stripeSubscriptionId || '').trim();
  const previousSubscriptionId = String(previousRecord?.stripeSubscriptionId || '').trim();
  const existingIndex = await readMembersBySubscriptionIndex();
  const index = existingIndex || await rebuildMembersBySubscriptionIndex();
  if (previousSubscriptionId && previousSubscriptionId !== currentSubscriptionId && index[previousSubscriptionId] === memberId) {
    delete index[previousSubscriptionId];
  }
  if (currentSubscriptionId) {
    index[currentSubscriptionId] = memberId;
  }
  await writeMembersBySubscriptionIndex(index);
}

async function rebuildMembersBySubscriptionIndex() {
  const records = await listMemberRecords();
  const index = {};
  records.forEach(record => {
    const subscriptionId = String(record?.stripeSubscriptionId || '').trim();
    const memberId = getMemberRecordIndexId(record);
    if (subscriptionId && memberId) index[subscriptionId] = memberId;
  });
  await writeMembersBySubscriptionIndex(index);
  return index;
}

async function findMemberRecordBySubscriptionId(subscriptionId) {
  const safeSubId = String(subscriptionId || '').trim();
  if (!safeSubId) return null;
  const readFromIndex = async index => {
    const indexedMemberId = normalizeMemberId(index?.[safeSubId] || '');
    if (!indexedMemberId) return null;
    const record = await readMemberRecord(indexedMemberId);
    if (String(record?.stripeSubscriptionId || '').trim() === safeSubId) return record;
    return null;
  };

  const indexed = await readFromIndex(await readMembersBySubscriptionIndex());
  if (indexed) return indexed;

  const rebuilt = await readFromIndex(await rebuildMembersBySubscriptionIndex());
  if (rebuilt) return rebuilt;

  console.warn('[index] member subscription lookup not found in index. Falling back to full member scan.');
  const records = await listMemberRecords();
  const found = records.find(record => String(record?.stripeSubscriptionId || '').trim() === safeSubId) || null;
  if (found) await updateMembersBySubscriptionIndex(found);
  return found;
}

function normalizeUserId(userId) {
  const value = String(userId || '').trim();
  if (!value || !/^[A-Za-z0-9._-]{3,128}$/.test(value)) return '';
  return value;
}

function getUserFilePath(userId) {
  const safeId = normalizeUserId(userId);
  if (!safeId) return '';
  return path.join(USER_DIR, `${safeId}.json`);
}

async function readUserRecord(userId) {
  const filePath = getUserFilePath(userId);
  if (!filePath) return null;
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeUserRecord(userId, record) {
  const filePath = getUserFilePath(userId);
  if (!filePath) throw new Error('INVALID_USER_ID');
  const existing = await readUserRecord(userId);
  await ensureDir(USER_DIR);
  await fsp.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
  await updateUserIndexesForRecord({ ...record, userId: normalizeUserId(userId) || record?.userId || '' }, existing);
}

async function withUserMutation(userId, operation) {
  const safeUserId = normalizeUserId(userId);
  if (!safeUserId) throw new Error('INVALID_USER_ID');
  const previous = USER_MUTATION_LOCKS.get(safeUserId) || Promise.resolve();
  let release;
  const current = new Promise(resolve => {
    release = resolve;
  });
  const next = previous.then(() => current, () => current);
  USER_MUTATION_LOCKS.set(safeUserId, next);
  await previous.catch(() => {});
  try {
    return await operation(safeUserId);
  } finally {
    release();
    if (USER_MUTATION_LOCKS.get(safeUserId) === next) USER_MUTATION_LOCKS.delete(safeUserId);
  }
}

async function withCheckoutSessionMutation(sessionId, operation) {
  const safeSessionId = normalizeStripeObjectId(sessionId);
  if (!safeSessionId) throw new Error('INVALID_STRIPE_SESSION_ID');
  const previous = CHECKOUT_SESSION_LOCKS.get(safeSessionId) || Promise.resolve();
  let release;
  const current = new Promise(resolve => {
    release = resolve;
  });
  const next = previous.then(() => current, () => current);
  CHECKOUT_SESSION_LOCKS.set(safeSessionId, next);
  await previous.catch(() => {});
  try {
    return await operation(safeSessionId);
  } finally {
    release();
    if (CHECKOUT_SESSION_LOCKS.get(safeSessionId) === next) CHECKOUT_SESSION_LOCKS.delete(safeSessionId);
  }
}

async function withRashinPaidCodeMutation(codeHash, operation) {
  const safeHash = String(codeHash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(safeHash)) throw new Error('INVALID_RASHIN_PAID_CODE_HASH');
  const previous = RASHIN_PAID_CODE_MUTATION_LOCKS.get(safeHash) || Promise.resolve();
  let release;
  const current = new Promise(resolve => {
    release = resolve;
  });
  const next = previous.then(() => current, () => current);
  RASHIN_PAID_CODE_MUTATION_LOCKS.set(safeHash, next);
  await previous.catch(() => {});
  try {
    return await operation(safeHash);
  } finally {
    release();
    if (RASHIN_PAID_CODE_MUTATION_LOCKS.get(safeHash) === next) RASHIN_PAID_CODE_MUTATION_LOCKS.delete(safeHash);
  }
}

async function withPurchaseOrderMutation(purchaseOrderId, operation) {
  const safePurchaseOrderId = normalizePurchaseOrderId(purchaseOrderId);
  if (!safePurchaseOrderId) throw new Error('INVALID_PURCHASE_ORDER_ID');
  const previous = PURCHASE_ORDER_MUTATION_LOCKS.get(safePurchaseOrderId) || Promise.resolve();
  let release;
  const current = new Promise(resolve => {
    release = resolve;
  });
  const next = previous.then(() => current, () => current);
  PURCHASE_ORDER_MUTATION_LOCKS.set(safePurchaseOrderId, next);
  await previous.catch(() => {});
  try {
    return await operation(safePurchaseOrderId);
  } finally {
    release();
    if (PURCHASE_ORDER_MUTATION_LOCKS.get(safePurchaseOrderId) === next) PURCHASE_ORDER_MUTATION_LOCKS.delete(safePurchaseOrderId);
  }
}

async function listUserRecords() {
  try {
    const entries = await fsp.readdir(USER_DIR, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const fullPath = path.join(USER_DIR, entry.name);
      try {
        const raw = await fsp.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        if (parsed && typeof parsed === 'object') items.push(parsed);
      } catch (_error) {}
    }
    return items;
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

const USER_INDEX_FILES = {
  email: 'users-by-email.json',
  stripeCustomer: 'users-by-stripe-customer.json',
  subscription: 'users-by-subscription.json',
  googleSub: 'users-by-google-sub.json',
};

function getUserIndexPath(indexName) {
  const filename = USER_INDEX_FILES[indexName];
  return filename ? path.join(INDEX_DIR, filename) : '';
}

async function readUserIndex(indexName) {
  const filePath = getUserIndexPath(indexName);
  if (!filePath) return {};
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeUserIndex(indexName, data) {
  const filePath = getUserIndexPath(indexName);
  if (!filePath) return;
  await writeJsonFileAtomic(filePath, data || {});
}

function collectUserIndexEntries(userRecord = {}) {
  const userId = normalizeUserId(userRecord.userId || userRecord.googleSub || '');
  if (!userId) return null;
  return {
    userId,
    email: normalizeCustomerEmail(userRecord.email || ''),
    stripeCustomer: String(userRecord.stripeCustomerId || '').trim(),
    subscription: String(userRecord.stripeSubscriptionId || '').trim(),
    googleSub: normalizeUserId(userRecord.googleSub || userRecord.userId || ''),
  };
}

async function rebuildUserIndexes() {
  const users = await listUserRecords();
  const indexes = {
    email: {},
    stripeCustomer: {},
    subscription: {},
    googleSub: {},
  };
  users.forEach(user => {
    const entries = collectUserIndexEntries(user);
    if (!entries) return;
    if (entries.email) indexes.email[entries.email] = entries.userId;
    if (entries.stripeCustomer) indexes.stripeCustomer[entries.stripeCustomer] = entries.userId;
    if (entries.subscription) indexes.subscription[entries.subscription] = entries.userId;
    if (entries.googleSub) indexes.googleSub[entries.googleSub] = entries.userId;
  });
  await Promise.all(Object.keys(indexes).map(indexName => writeUserIndex(indexName, indexes[indexName])));
  return indexes;
}

async function getUserIndex(indexName) {
  const existing = await readUserIndex(indexName);
  if (existing) return existing;
  const rebuilt = await rebuildUserIndexes();
  return rebuilt[indexName] || {};
}

async function updateUserIndexesForRecord(userRecord = {}, previousRecord = null) {
  const entries = collectUserIndexEntries(userRecord);
  if (!entries) return;
  const previous = previousRecord ? collectUserIndexEntries(previousRecord) : null;
  const updates = [
    ['email', entries.email, previous?.email],
    ['stripeCustomer', entries.stripeCustomer, previous?.stripeCustomer],
    ['subscription', entries.subscription, previous?.subscription],
    ['googleSub', entries.googleSub, previous?.googleSub],
  ];
  for (const [indexName, key, previousKey] of updates) {
    const index = (await readUserIndex(indexName)) || {};
    if (previousKey && previousKey !== key && index[previousKey] === entries.userId) {
      delete index[previousKey];
    }
    if (!key) {
      await writeUserIndex(indexName, index);
      continue;
    }
    index[key] = entries.userId;
    await writeUserIndex(indexName, index);
  }
}

async function findUserRecordByIndex(indexName, key, fallbackLabel, predicate) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return null;
  const index = await getUserIndex(indexName);
  const indexedUserId = normalizeUserId(index[safeKey] || '');
  if (indexedUserId) {
    const record = await readUserRecord(indexedUserId);
    if (record && (!predicate || predicate(record))) return record;
  }
  console.warn(`[index] ${fallbackLabel} not found in index. Falling back to full user scan.`);
  const users = await listUserRecords();
  const found = users.find(user => predicate(user)) || null;
  if (found?.userId) await updateUserIndexesForRecord(found);
  return found;
}

async function findUserRecordByStripeCustomerId(customerId) {
  const safeId = String(customerId || '').trim();
  if (!safeId) return null;
  return findUserRecordByIndex(
    'stripeCustomer',
    safeId,
    'stripe customer lookup',
    user => String(user?.stripeCustomerId || '').trim() === safeId
  );
}

async function findUserRecordByStripeSubscriptionId(subscriptionId) {
  const safeId = String(subscriptionId || '').trim();
  if (!safeId) return null;
  return findUserRecordByIndex(
    'subscription',
    safeId,
    'stripe subscription lookup',
    user => String(user?.stripeSubscriptionId || '').trim() === safeId
  );
}

async function findUserRecordByEmail(email) {
  const normalized = normalizeCustomerEmail(email);
  if (!normalized) return null;
  return findUserRecordByIndex(
    'email',
    normalized,
    'email lookup',
    user => normalizeCustomerEmail(user?.email || '') === normalized
  );
}

async function findUserRecordByGoogleSub(googleSub) {
  const safeSub = normalizeUserId(googleSub);
  if (!safeSub) return null;
  return findUserRecordByIndex(
    'googleSub',
    safeSub,
    'google sub lookup',
    user => normalizeUserId(user?.googleSub || user?.userId || '') === safeSub
  );
}

function normalizeGoogleProfile(profile = {}) {
  const sub = normalizeUserId(profile.sub || profile.googleSub || profile.userId);
  if (!sub) return null;
  return {
    userId: sub,
    googleSub: sub,
    email: normalizeCustomerEmail(profile.email || ''),
    emailVerified: !!(profile.email_verified ?? profile.emailVerified),
    name: String(profile.name || '').trim(),
    givenName: String(profile.given_name || profile.givenName || '').trim(),
    familyName: String(profile.family_name || profile.familyName || '').trim(),
    picture: String(profile.picture || '').trim(),
    locale: String(profile.locale || '').trim(),
  };
}

function buildUserRecordFromGoogleProfile(profile, existing = null) {
  const safeProfile = normalizeGoogleProfile(profile);
  if (!safeProfile) throw new Error('INVALID_GOOGLE_PROFILE');
  const now = new Date().toISOString();
  return {
    userId: safeProfile.userId,
    googleSub: safeProfile.googleSub,
    email: safeProfile.email || existing?.email || '',
    emailVerified: safeProfile.emailVerified,
    name: safeProfile.name || existing?.name || '',
    givenName: safeProfile.givenName || existing?.givenName || '',
    familyName: safeProfile.familyName || existing?.familyName || '',
    picture: safeProfile.picture || existing?.picture || '',
    locale: safeProfile.locale || existing?.locale || '',
    stripeCustomerId: existing?.stripeCustomerId || '',
    stripeSubscriptionId: existing?.stripeSubscriptionId || '',
    stripeSubscriptionStatus: existing?.stripeSubscriptionStatus || '',
    currentPeriodEnd: existing?.currentPeriodEnd || '',
    cancelAtPeriodEnd: !!existing?.cancelAtPeriodEnd,
    latestCheckoutSessionId: existing?.latestCheckoutSessionId || '',
    rashin_stones: normalizeRashinStones(existing?.rashin_stones),
    last_rashin_bonus_claimed_date: existing?.last_rashin_bonus_claimed_date || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function normalizeCustomerEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value.includes('@') ? value : '';
}

function hashPrivateLookupValue(prefix, value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return crypto.createHash('sha256').update(`${prefix}:${normalized}`).digest('hex');
}

function maskEmail(email) {
  const normalized = normalizeCustomerEmail(email);
  if (!normalized) return '';
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return '';
  const head = local.slice(0, 2);
  const tail = local.length > 4 ? local.slice(-1) : '';
  return `${head}${'*'.repeat(Math.max(2, Math.min(8, local.length - head.length - tail.length)))}${tail}@${domain}`;
}

function normalizePublicUrl(value) {
  const raw = normalizeEnvValue(value);
  if (!raw || isPlaceholderEnvValue(raw)) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch (_error) {
    return '';
  }
}

function readDeveloperEmailFromHeader(req) {
  if (!DEV_ACCESS_ENABLED) return '';
  if (!isLocalRequest(req)) return '';
  const email = normalizeCustomerEmail(req?.headers?.['x-uranai-developer-email'] || '');
  return emailHasDeveloperAccess(email) ? email : '';
}

function normalizeStripeSubscriptionStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function stripeSubscriptionGrantsAccess(status) {
  return new Set(['active', 'trialing']).has(normalizeStripeSubscriptionStatus(status));
}

function emailHasDeveloperAccess(email) {
  const normalized = normalizeCustomerEmail(email);
  return !!(normalized && DEVELOPER_ACCESS_EMAILS.has(normalized));
}

function userRecordHasDeveloperAccess(userRecord) {
  return !!(userRecord && userRecord.emailVerified && emailHasDeveloperAccess(userRecord.email));
}

async function ensureDeveloperUserRecord(email, name = '') {
  const normalizedEmail = normalizeCustomerEmail(email);
  if (!normalizedEmail || !emailHasDeveloperAccess(normalizedEmail)) return null;
  const existingByEmail = await findUserRecordByEmail(normalizedEmail);
  if (existingByEmail?.userId) {
    if (!existingByEmail.emailVerified) {
      const next = {
        ...existingByEmail,
        emailVerified: true,
        updatedAt: new Date().toISOString(),
      };
      await writeUserRecord(existingByEmail.userId, next);
      return next;
    }
    return existingByEmail;
  }
  const stableId = `dev_${crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 24)}`;
  const now = new Date().toISOString();
  const record = {
    userId: stableId,
    googleSub: stableId,
    email: normalizedEmail,
    emailVerified: true,
    name: String(name || '').trim() || normalizedEmail,
    givenName: '',
    familyName: '',
    picture: '',
    locale: 'ja',
    stripeCustomerId: '',
    stripeSubscriptionId: '',
    stripeSubscriptionStatus: '',
    currentPeriodEnd: '',
    cancelAtPeriodEnd: false,
    latestCheckoutSessionId: '',
    rashin_stones: 0,
    last_rashin_bonus_claimed_date: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeUserRecord(stableId, record);
  return record;
}

function buildMemberRecordFromStripe(data = {}, existing = null) {
  const now = new Date().toISOString();
  const customerId = String(data.customerId || existing?.customerId || existing?.stripeCustomerId || '').trim();
  const subscriptionId = String(data.subscriptionId || existing?.stripeSubscriptionId || '').trim();
  const subscriptionStatus = normalizeStripeSubscriptionStatus(data.subscriptionStatus || existing?.subscriptionStatus || '');
  return {
    memberId: customerId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: subscriptionStatus,
    customerEmail: normalizeCustomerEmail(data.customerEmail || existing?.customerEmail || ''),
    customerName: String(data.customerName || existing?.customerName || '').trim(),
    latestCheckoutSessionId: String(data.checkoutSessionId || existing?.latestCheckoutSessionId || '').trim(),
    productLabel: String(data.productLabel || existing?.productLabel || STRIPE_SUBSCRIPTION_NAME).trim(),
    currentPeriodEnd: data.currentPeriodEnd || existing?.currentPeriodEnd || '',
    cancelAtPeriodEnd: !!(data.cancelAtPeriodEnd ?? existing?.cancelAtPeriodEnd),
    source: String(data.source || existing?.source || 'stripe').trim(),
    active: stripeSubscriptionGrantsAccess(subscriptionStatus),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function buildUserRecordFromStripe(data = {}, existing = null) {
  const safeUserId = normalizeUserId(data.userId || existing?.userId || existing?.googleSub || '');
  if (!safeUserId) return null;
  const now = new Date().toISOString();
  const subscriptionStatus = normalizeStripeSubscriptionStatus(data.subscriptionStatus || existing?.stripeSubscriptionStatus || '');
  return {
    userId: safeUserId,
    googleSub: safeUserId,
    email: normalizeCustomerEmail(data.customerEmail || existing?.email || ''),
    emailVerified: existing?.emailVerified ?? true,
    name: String(data.customerName || existing?.name || '').trim(),
    givenName: existing?.givenName || '',
    familyName: existing?.familyName || '',
    picture: existing?.picture || '',
    locale: existing?.locale || '',
    stripeCustomerId: String(data.customerId || existing?.stripeCustomerId || '').trim(),
    stripeSubscriptionId: String(data.subscriptionId || existing?.stripeSubscriptionId || '').trim(),
    stripeSubscriptionStatus: subscriptionStatus,
    currentPeriodEnd: data.currentPeriodEnd || existing?.currentPeriodEnd || '',
    cancelAtPeriodEnd: !!(data.cancelAtPeriodEnd ?? existing?.cancelAtPeriodEnd),
    latestCheckoutSessionId: String(data.checkoutSessionId || existing?.latestCheckoutSessionId || '').trim(),
    rashin_stones: normalizeRashinStones(existing?.rashin_stones),
    last_rashin_bonus_claimed_date: existing?.last_rashin_bonus_claimed_date || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

async function buildMemberStatus(req, sessionPayload = null) {
  const hasSessionOverrides = !!(sessionPayload && typeof sessionPayload === 'object' && (
    Object.prototype.hasOwnProperty.call(sessionPayload, 'memberSession')
    || Object.prototype.hasOwnProperty.call(sessionPayload, 'authSession')
  ));
  const memberSession = hasSessionOverrides
    ? (Object.prototype.hasOwnProperty.call(sessionPayload, 'memberSession') ? sessionPayload.memberSession : readMemberSession(req))
    : (sessionPayload || readMemberSession(req));
  const authSession = hasSessionOverrides
    ? (Object.prototype.hasOwnProperty.call(sessionPayload, 'authSession') ? sessionPayload.authSession : readAuthSession(req))
    : readAuthSession(req);
  const userRecord = authSession?.userId ? await readUserRecord(authSession.userId) : null;
  const memberRecord = userRecord?.stripeCustomerId ? await readMemberRecord(userRecord.stripeCustomerId) : null;
  const headerDeveloperEmail = !userRecord ? readDeveloperEmailFromHeader(req) : '';
  const headerDeveloperRecord = headerDeveloperEmail ? (await findUserRecordByEmail(headerDeveloperEmail)) : null;
  const stripeStatus = normalizeStripeSubscriptionStatus(userRecord?.stripeSubscriptionStatus || memberRecord?.stripeSubscriptionStatus || '');
  const authLoggedIn = !!(authSession && userRecord) || !!headerDeveloperEmail;
  const developerAccess = DEV_ACCESS_ENABLED && ((authLoggedIn && userRecordHasDeveloperAccess(userRecord)) || !!headerDeveloperEmail);
  const hasStripeAccess = authLoggedIn && stripeSubscriptionGrantsAccess(stripeStatus);
  const hasLocalPreview = DEV_ACCESS_ENABLED && !!(memberSession && memberSession.source === 'local_preview' && isLocalRequest(req));
  const hasAccessCode = DEV_ACCESS_ENABLED && !!(memberSession && memberSession.source === 'access_code');
  const hasRashinCode = !!(memberSession && memberSession.source === 'rashin_code');
  const active = developerAccess || hasLocalPreview || hasAccessCode || hasRashinCode || hasStripeAccess;
  const source = developerAccess
    ? 'developer'
    : hasLocalPreview
    ? 'local_preview'
    : hasAccessCode
      ? 'access_code'
      : hasRashinCode
        ? 'rashin_code'
        : hasStripeAccess
          ? 'stripe'
          : (authLoggedIn ? 'google' : '');
  const expiresAt = hasLocalPreview || hasAccessCode || hasRashinCode
    ? (memberSession?.exp ? new Date(memberSession.exp).toISOString() : '')
    : (authSession?.exp ? new Date(authSession.exp).toISOString() : '');
  return {
    ok: true,
    active,
    source,
    expiresAt,
    production: IS_PRODUCTION,
    localTestMode: DEV_ACCESS_ENABLED && isLocalRequest(req),
    codeConfigured: DEV_ACCESS_ENABLED && MEMBER_ACCESS_CODES.size > 0,
    rashinCodeConfigured: RASHIN_ACCESS_CODES.size > 0,
    sessionPersistent: MEMBER_SESSION_PERSISTENT,
    authLoggedIn,
    authProvider: authLoggedIn ? (developerAccess ? 'developer' : 'google') : '',
    authSessionPersistent: AUTH_SESSION_PERSISTENT,
    developerAccess,
    googleClientConfigured: GOOGLE_CLIENT_CONFIGURED,
    googleClientId: GOOGLE_CLIENT_CONFIGURED ? GOOGLE_CLIENT_ID : '',
    userId: userRecord?.userId || headerDeveloperRecord?.userId || '',
    userName: userRecord?.name || headerDeveloperRecord?.name || '',
    userEmail: userRecord?.email || headerDeveloperEmail || '',
    userPicture: userRecord?.picture || '',
    stripeEnabled: false,
    stripeCheckoutReady: false,
    stripePortalReady: false,
    stripeWebhookReady: false,
    rashinPaidCodeReady: rashinPaidCodeReady(),
    subscriptionStatus: stripeStatus,
    customerEmail: userRecord?.email || headerDeveloperEmail || memberRecord?.customerEmail || '',
    customerName: userRecord?.name || headerDeveloperRecord?.name || memberRecord?.customerName || '',
    productLabel: memberRecord?.productLabel || STRIPE_SUBSCRIPTION_NAME,
    currentPeriodEnd: userRecord?.currentPeriodEnd || memberRecord?.currentPeriodEnd || '',
    cancelAtPeriodEnd: !!(userRecord?.cancelAtPeriodEnd ?? memberRecord?.cancelAtPeriodEnd),
    manageBillingAvailable: false,
    rashinStones: normalizeRashinStones(userRecord?.rashin_stones),
    lastRashinBonusClaimedDate: userRecord?.last_rashin_bonus_claimed_date || null,
  };
}

async function hasPaidAccess(req, payload = null) {
  if (readDeveloperEmailFromHeader(req)) return true;
  const memberSession = readMemberSession(req);
  if (DEV_ACCESS_ENABLED && memberSession?.source === 'local_preview') return isLocalRequest(req);
  if (DEV_ACCESS_ENABLED && memberSession?.source === 'access_code') return true;
  if (memberSession?.source === 'rashin_code') return true;
  const authSession = readAuthSession(req);
  const userRecord = authSession?.userId ? await readUserRecord(authSession.userId) : null;
  if (DEV_ACCESS_ENABLED && userRecordHasDeveloperAccess(userRecord)) return true;
  if (userRecord && stripeSubscriptionGrantsAccess(userRecord.stripeSubscriptionStatus)) return true;
  return validatePaidReadingTicketAccess(req, payload);
}

async function readGoogleUserForRequest(req) {
  const authSession = readAuthSession(req);
  const userId = normalizeUserId(authSession?.userId || '');
  if (!userId || authSession?.source !== 'google') return null;
  const userRecord = await readUserRecord(userId);
  return userRecord?.userId ? userRecord : null;
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function appendJsonlRecord(dirPath, prefix, record) {
  await ensureDir(dirPath);
  const filePath = path.join(dirPath, `${prefix}-${getIsoDayStamp()}.jsonl`);
  await fsp.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

async function appendLogRecord(dirPath, prefix, record) {
  await ensureDir(dirPath);
  const filePath = path.join(dirPath, `${prefix}-${getIsoDayStamp()}.log`);
  await fsp.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function extractUsageMetrics(provider, raw) {
  if (provider === 'anthropic') {
    const usage = raw?.usage || {};
    return {
      inputTokens: Number(usage?.input_tokens || 0) || 0,
      outputTokens: Number(usage?.output_tokens || 0) || 0,
      cacheReadInputTokens: Number(usage?.cache_read_input_tokens || 0) || 0,
      cacheCreationInputTokens: Number(usage?.cache_creation_input_tokens || 0) || 0,
    };
  }
  if (provider === 'openai') {
    const usage = raw?.usage || {};
    return {
      inputTokens: Number(usage?.input_tokens || 0) || 0,
      outputTokens: Number(usage?.output_tokens || 0) || 0,
      totalTokens: Number(usage?.total_tokens || 0) || 0,
    };
  }
  return {};
}

function estimateInputTokens(payload) {
  const messageChars = (Array.isArray(payload?.messages) ? payload.messages : [])
    .reduce((sum, message) => sum + String(message?.content || '').length, 0);
  const systemChars = String(payload?.system || '').length;
  return Math.max(0, Math.ceil((messageChars + systemChars) / 4));
}

function getPayloadReadingType(payload) {
  return payload?.plan === 'paid' ? 'paid' : 'free';
}

function getSafePayloadCategory(payload) {
  const value = String(payload?.category || '').trim();
  return value ? value.slice(0, 40) : '邱丞粋';
}

function sanitizeAbTestPayload(value) {
  if (!value || typeof value !== 'object') return null;
  const name = String(value.name || '').trim().slice(0, 80);
  const variant = String(value.variant || '').trim().slice(0, 40);
  const bucket = Number(value.bucket);
  const openaiWeight = Number(value.openaiWeight);
  return {
    name: name || PAID_MODEL_AB_TEST_NAME,
    variant,
    provider: value.provider === 'openai' ? 'openai' : (value.provider === 'anthropic' ? 'anthropic' : ''),
    model: String(value.model || '').trim().slice(0, 80),
    bucket: Number.isFinite(bucket) ? Math.min(99, Math.max(0, Math.floor(bucket))) : null,
    openai_weight: Number.isFinite(openaiWeight) ? Math.min(100, Math.max(0, Math.floor(openaiWeight))) : PAID_MODEL_AB_TEST_OPENAI_WEIGHT,
    seed: String(value.seed || '').trim().slice(0, 120),
  };
}

function buildAiLogBase(payload, event) {
  const abTest = payload?.ab_test || null;
  return {
    timestamp: new Date().toISOString(),
    event,
    provider: String(payload?.provider || '').slice(0, 20),
    model: String(payload?.model || '').slice(0, 80),
    reading_type: getPayloadReadingType(payload),
    category: getSafePayloadCategory(payload),
    task_key: String(payload?.task_key || '').slice(0, 40),
    ab_test_name: abTest?.name || '',
    ab_test_variant: abTest?.variant || '',
    ab_test_bucket: Number.isFinite(abTest?.bucket) ? abTest.bucket : null,
  };
}

async function writeAiUsageLog(entry) {
  await appendJsonlRecord(AI_USAGE_LOG_DIR, 'ai-usage', entry);
}

async function writeAiEventLog(entry) {
  try {
    await appendLogRecord(AI_EVENT_LOG_DIR, 'ai', entry);
  } catch (_error) {}
}

async function writeClientErrorLog(entry) {
  await appendJsonlRecord(CLIENT_ERROR_LOG_DIR, 'client-errors', entry);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;

    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_JSON_BYTES) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (error) {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getAllowedStaticPath(urlPath) {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (pathname === '/' || pathname === '/uranai-v5.html') {
    return path.join(ROOT_DIR, 'uranai-v5.html');
  }
  if (pathname === '/terms.html' || pathname === '/privacy.html' || pathname === '/commercial-transactions.html') {
    return path.join(ROOT_DIR, pathname.slice(1));
  }
  if (pathname === '/app.js') {
    return path.join(ROOT_DIR, 'app.js');
  }
  if (
    pathname === '/lenormand-reading-knowledge.js' ||
    pathname === '/oracle-reading-knowledge.js' ||
    pathname === '/card-reading-knowledge.js'
  ) {
    return path.join(ROOT_DIR, pathname.slice(1));
  }
  if (pathname === '/solar-term-boundaries.json') {
    return path.join(ROOT_DIR, 'solar-term-boundaries.json');
  }
  if (!pathname.startsWith('/images/') && !pathname.startsWith('/\u97f3\u7d20\u6750/') && !pathname.startsWith('/\u5360\u3044\u7d20\u6750/')) return null;

  const relativePath = pathname.replace(/^\/+/, '');
  const resolvedPath = path.resolve(ROOT_DIR, relativePath);
  const allowedRoots = [
    path.resolve(ROOT_DIR, 'images'),
    path.resolve(ROOT_DIR, '\u97f3\u7d20\u6750'),
    path.resolve(ROOT_DIR, '\u5360\u3044\u7d20\u6750'),
  ];
  if (!allowedRoots.some(rootPath => resolvedPath === rootPath || resolvedPath.startsWith(rootPath + path.sep))) return null;
  return resolvedPath;
}

function pathnameIsImage(urlPath) {
  const pathname = decodeURIComponent((urlPath || '').split('?')[0]);
  return pathname.startsWith('/images/') || pathname.startsWith('/\u5360\u3044\u7d20\u6750/');
}

function pathnameIsAudio(urlPath) {
  const pathname = decodeURIComponent((urlPath || '').split('?')[0]);
  return pathname.startsWith('/\u97f3\u7d20\u6750/');
}

async function serveStatic(req, res) {
  const filePath = getAllowedStaticPath(req.url);
  if (!filePath) {
    sendText(res, 404, 'Not Found');
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      sendText(res, 404, 'Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    if (path.basename(filePath) === 'uranai-v5.html') {
      const body = (await fsp.readFile(filePath, 'utf8'))
        .replace("window.GA_TRACKING_ID=window.GA_TRACKING_ID||'';", `window.GA_TRACKING_ID=window.GA_TRACKING_ID||${JSON.stringify(GA_TRACKING_ID)};`);
      sendText(res, 200, body, contentType);
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': (pathnameIsImage(req.url) || pathnameIsAudio(req.url)) ? 'public, max-age=86400' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      sendText(res, 404, 'Not Found');
      return;
    }
    sendText(res, 500, 'Internal Server Error');
  }
}

function normalizeVaultIdentity(identity) {
  const raw = identity && typeof identity === 'object' ? identity : {};
  const fullname = typeof raw.fullname === 'string' ? raw.fullname.trim().replace(/\s+/g, ' ') : '';
  const gender = typeof raw.gender === 'string' ? raw.gender.trim().toLowerCase() : '';
  const vaultId = typeof raw.vaultId === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(raw.vaultId.trim())
    ? raw.vaultId.trim()
    : '';
  const year = Number(raw.year);
  const month = Number(raw.month);
  const dayRaw = raw.day;
  const day = dayRaw === null || dayRaw === undefined || dayRaw === '' || dayRaw === 'unknown'
    ? 'unknown'
    : String(parseInt(dayRaw, 10) || 'unknown');

  if (!fullname || !Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  return {
    fullname: fullname.toLowerCase(),
    gender: gender || 'unknown',
    year: String(Math.trunc(year)),
    month: String(Math.trunc(month)),
    day,
    vaultId,
  };
}

function makeLegacyProfileVaultKey(identity) {
  const normalized = normalizeVaultIdentity(identity);
  if (!normalized) return '';
  const seed = [
    normalized.fullname,
    normalized.gender,
    normalized.year,
    normalized.month,
    normalized.day,
  ].join('|');
  return crypto.createHash('sha256').update(seed).digest('hex');
}

function makeVaultKey(identity) {
  const normalized = normalizeVaultIdentity(identity);
  if (!normalized?.vaultId) return '';
  return crypto.createHash('sha256').update(`anon:${normalized.vaultId}`).digest('hex');
}

function makeUserVaultKey(userId) {
  const safeUserId = normalizeUserId(userId);
  if (!safeUserId) return '';
  return crypto.createHash('sha256').update(`user:${safeUserId}`).digest('hex');
}

function getVaultFilePath(vaultKey) {
  if (!vaultKey) return '';
  return path.join(VAULT_DIR, `${vaultKey}.json`);
}

async function readVaultRecords(vaultKey) {
  if (!vaultKey) return [];
  const filePath = getVaultFilePath(vaultKey);
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeVaultRecords(vaultKey, records) {
  if (!vaultKey) {
    throw new Error('VAULT_KEY_MISSING');
  }
  await ensureDir(VAULT_DIR);
  const filePath = getVaultFilePath(vaultKey);
  await fsp.writeFile(filePath, JSON.stringify(records, null, 2), 'utf8');
}

function mergeVaultRecordLists(...recordLists) {
  const merged = [];
  const seen = new Set();
  recordLists.flat().forEach(record => {
    if (!record || typeof record !== 'object' || !record.id || seen.has(record.id)) return;
    seen.add(record.id);
    merged.push(record);
  });
  merged.sort((a, b) => {
    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
  return merged.slice(0, 48);
}

async function resolveVaultContext(req, identity) {
  const authSession = readAuthSession(req);
  const authUserId = normalizeUserId(authSession?.userId || '');
  if (authUserId) {
    const userRecord = await readUserRecord(authUserId);
    if (userRecord?.userId) {
      const primaryKey = makeUserVaultKey(userRecord.userId);
      const legacyKey = makeLegacyProfileVaultKey(identity);
      return {
        mode: 'google-user',
        userId: userRecord.userId,
        vaultKey: primaryKey,
        legacyVaultKey: legacyKey && legacyKey !== primaryKey ? legacyKey : '',
      };
    }
  }

  const vaultKey = makeVaultKey(identity);
  if (!vaultKey) return null;
  const legacyKey = makeLegacyProfileVaultKey(identity);
  return {
    mode: 'anonymous-vault',
    userId: '',
    vaultKey,
    legacyVaultKey: legacyKey && legacyKey !== vaultKey ? legacyKey : '',
  };
}

function mergeVaultRecord(records, record) {
  const safeRecords = Array.isArray(records) ? records : [];
  const next = safeRecords.filter(item => item && item.id && item.id !== record.id);
  next.unshift(record);
  next.sort((a, b) => {
    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
  return next.slice(0, 48);
}

function normalizeVaultRecordId(recordId) {
  const value = String(recordId || '').trim();
  if (!value || !/^[A-Za-z0-9._-]{3,96}$/.test(value)) return '';
  return value;
}

function sanitizeVaultRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('INVALID_RECORD');
  }
  const safeId = normalizeVaultRecordId(record.id);
  if (!safeId) {
    throw new Error('INVALID_RECORD');
  }
  return { ...record, id: safeId };
}

function generateRecordId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
}

function getRashinCodeRedeemKey(code) {
  const safeCode = String(code || '').trim();
  if (!/^\d{7}$/.test(safeCode)) return '';
  return crypto.createHash('sha256').update(`rashin_code:${safeCode}`).digest('hex');
}

function getRashinCodeRedeemPath(code) {
  const key = getRashinCodeRedeemKey(code);
  return key ? path.join(RASHIN_CODE_REDEEM_DIR, `${key}.json`) : '';
}

async function readRashinCodeRedeemRecord(code) {
  const filePath = getRashinCodeRedeemPath(code);
  if (!filePath) return null;
  return readJsonFileSafe(filePath, null);
}

async function writeRashinCodeRedeemRecordIfAbsent(code, record) {
  const key = getRashinCodeRedeemKey(code);
  if (!key) throw new Error('INVALID_RASHIN_CODE');
  await ensureDir(RASHIN_CODE_REDEEM_DIR);
  const filePath = getRashinCodeRedeemPath(code);
  const safeRecord = {
    ...(record || {}),
    id: key,
    codeHash: key,
  };
  try {
    await fsp.writeFile(filePath, JSON.stringify(safeRecord, null, 2), { encoding: 'utf8', flag: 'wx' });
    return { created: true, record: safeRecord };
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      const existing = await readRashinCodeRedeemRecord(code);
      if (isExpiredIso(existing?.expiresAt)) {
        await writeJsonFileAtomic(filePath, {
          ...safeRecord,
          previousRedeemedAt: existing?.redeemedAt || '',
          revivedAt: safeRecord.redeemedAt || new Date().toISOString(),
        });
        return { created: true, revived: true, record: safeRecord };
      }
      return { created: false, record: existing };
    }
    throw error;
  }
}

function addDaysIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function normalizePurchaseOrderId(value) {
  const raw = String(value || '').trim();
  if (!/^po_[A-Za-z0-9_-]{8,96}$/.test(raw)) return '';
  return raw;
}

function normalizePaidTicketId(value) {
  const raw = String(value || '').trim();
  if (!/^prt_[A-Za-z0-9_-]{8,96}$/.test(raw)) return '';
  return raw;
}

function makePaidTicketIdForCheckoutSession(sessionId) {
  const safeSessionId = normalizeStripeObjectId(sessionId);
  if (!safeSessionId) return '';
  return `prt_${crypto.createHash('sha256').update(`stripe_checkout:${safeSessionId}`).digest('hex')}`;
}

function normalizeStripeObjectId(value) {
  const raw = String(value || '').trim();
  if (!/^[A-Za-z0-9_]{3,255}$/.test(raw)) return '';
  return raw;
}

function getPurchaseOrderPath(orderId) {
  const safeId = normalizePurchaseOrderId(orderId);
  return safeId ? path.join(PURCHASE_ORDER_DIR, `${safeId}.json`) : '';
}

function getPaidReadingTicketPath(ticketId) {
  const safeId = normalizePaidTicketId(ticketId);
  return safeId ? path.join(PAID_READING_TICKET_DIR, `${safeId}.json`) : '';
}

function getRashinDiscountCheckoutLockPath(userId) {
  const safeUserId = normalizeUserId(userId);
  if (!safeUserId) return '';
  const key = crypto.createHash('sha256').update(`rashin_discount_checkout:${safeUserId}`).digest('hex');
  return path.join(RASHIN_DISCOUNT_CHECKOUT_LOCK_DIR, `${key}.json`);
}

async function readPurchaseOrder(orderId) {
  const filePath = getPurchaseOrderPath(orderId);
  if (!filePath) return null;
  return readJsonFileSafe(filePath, null);
}

async function writePurchaseOrder(record) {
  const safeId = normalizePurchaseOrderId(record?.id);
  if (!safeId) throw new Error('INVALID_PURCHASE_ORDER_ID');
  await writeJsonFileAtomic(getPurchaseOrderPath(safeId), { ...record, id: safeId });
}

async function readPaidReadingTicket(ticketId) {
  const filePath = getPaidReadingTicketPath(ticketId);
  if (!filePath) return null;
  return readJsonFileSafe(filePath, null);
}

async function writePaidReadingTicket(record) {
  const safeId = normalizePaidTicketId(record?.id);
  if (!safeId) throw new Error('INVALID_PAID_TICKET_ID');
  await writeJsonFileAtomic(getPaidReadingTicketPath(safeId), { ...record, id: safeId });
}

async function writePaidReadingTicketIfAbsent(record) {
  const safeId = normalizePaidTicketId(record?.id);
  if (!safeId) throw new Error('INVALID_PAID_TICKET_ID');
  await ensureDir(PAID_READING_TICKET_DIR);
  const filePath = getPaidReadingTicketPath(safeId);
  try {
    await fsp.writeFile(filePath, JSON.stringify({ ...record, id: safeId }, null, 2), { encoding: 'utf8', flag: 'wx' });
    return { created: true, ticket: { ...record, id: safeId } };
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      return { created: false, ticket: await readPaidReadingTicket(safeId) };
    }
    throw error;
  }
}

function normalizeRashinPaidCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function formatRashinPaidCode(value) {
  const code = normalizeRashinPaidCode(value);
  return code.length === 12 ? `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}` : code;
}

function generateRashinPaidCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  while (code.length < 12) {
    const bytes = crypto.randomBytes(16);
    for (const byte of bytes) {
      if (code.length >= 12) break;
      code += alphabet[byte % alphabet.length];
    }
  }
  return code;
}

function getRashinPaidCodeHash(code) {
  const safeCode = normalizeRashinPaidCode(code);
  if (!/^[A-Z0-9]{12}$/.test(safeCode)) return '';
  return crypto.createHash('sha256').update(`rashin_paid_code:${safeCode}`).digest('hex');
}

function getRashinPaidCodePathByHash(codeHash) {
  const safeHash = String(codeHash || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(safeHash) ? path.join(RASHIN_PAID_CODE_DIR, `${safeHash}.json`) : '';
}

function getRashinPaidCodePath(code) {
  return getRashinPaidCodePathByHash(getRashinPaidCodeHash(code));
}

async function readRashinPaidCodeRecordByHash(codeHash) {
  const filePath = getRashinPaidCodePathByHash(codeHash);
  if (!filePath) return null;
  return readJsonFileSafe(filePath, null);
}

async function readRashinPaidCodeRecord(code) {
  const filePath = getRashinPaidCodePath(code);
  if (!filePath) return null;
  return readJsonFileSafe(filePath, null);
}

async function writeRashinPaidCodeRecord(record) {
  const codeHash = String(record?.codeHash || '').trim().toLowerCase();
  const filePath = getRashinPaidCodePathByHash(codeHash);
  if (!filePath) throw new Error('INVALID_RASHIN_PAID_CODE_HASH');
  await writeJsonFileAtomic(filePath, { ...record, codeHash });
}

function isConfiguredFreeRashinPaidCode(code) {
  const codeHash = getRashinPaidCodeHash(code);
  return !!codeHash && RASHIN_FREE_PAID_CODE_HASHES.has(codeHash);
}

function isConfiguredReusableRashinPaidCode(code) {
  const codeHash = getRashinPaidCodeHash(code);
  return !!codeHash && RASHIN_REUSABLE_PAID_CODE_HASHES.has(codeHash);
}

function createFreeRashinPaidCodeRecord({ code, userRecord, sourceReadingId }) {
  const normalizedCode = normalizeRashinPaidCode(code);
  const codeHash = getRashinPaidCodeHash(normalizedCode);
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  const now = new Date().toISOString();
  return {
    codeHash,
    codeSuffix: normalizedCode.slice(-4),
    product: 'deep_reading_once',
    status: 'issued',
    purchaseOrderId: '',
    sourceReadingId: sourceId,
    ownerType: 'user',
    userId: normalizeUserId(userRecord?.userId || ''),
    vaultId: '',
    paymentProvider: 'manual_free_code',
    providerPaymentId: '',
    recipientEmailHash: '',
    recipientEmailMasked: '',
    deliveryChannel: 'manual_free_code',
    deliveryStatus: 'redeemed_by_input',
    baseAmount: DEEP_READING_NORMAL_AMOUNT,
    originalAmount: DEEP_READING_NORMAL_AMOUNT,
    discountAmount: DEEP_READING_NORMAL_AMOUNT,
    finalAmount: 0,
    discountStonesUsed: 0,
    discountType: 'manual_free_code',
    currency: 'jpy',
    issuedAt: now,
    expiresAt: '',
    redeemedAt: '',
    redeemedByUserId: '',
    redeemedSourceReadingId: '',
    createdAt: now,
    updatedAt: now,
  };
}

function createReusableRashinPaidCodeRecord({ code, userRecord, sourceReadingId }) {
  const record = createFreeRashinPaidCodeRecord({ code, userRecord, sourceReadingId });
  return {
    ...record,
    reusable: true,
    paymentProvider: 'manual_reusable_code',
    deliveryChannel: 'manual_reusable_code',
    deliveryStatus: 'reusable_code_redeemed_by_input',
    discountType: 'manual_reusable_code',
  };
}

function makePaidTicketIdForRashinPaidCode(codeHash, sourceReadingId) {
  const safeHash = String(codeHash || '').trim().toLowerCase();
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  if (!/^[a-f0-9]{64}$/.test(safeHash) || !sourceId) return '';
  return `prt_${crypto.createHash('sha256').update(`rashin_paid_code:${safeHash}:${sourceId}`).digest('hex')}`;
}

function makePaidTicketIdForRashinFragments(userId, sourceReadingId) {
  const safeUserId = normalizeUserId(userId);
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  if (!safeUserId || !sourceId) return '';
  return `prt_${crypto.createHash('sha256').update(`rashin_fragments:${safeUserId}:${sourceId}`).digest('hex')}`;
}

function getRashinCodeAdminSecret(req, body = {}) {
  return normalizeEnvValue(req?.headers?.['x-rashin-code-admin-secret'] || body?.adminSecret || body?.admin_secret || '');
}

function canUseRashinCodeAdmin(req, body = {}) {
  const configured = isConfiguredAppSecret(RASHIN_CODE_ADMIN_SECRET);
  if (configured) return safeCompareText(RASHIN_CODE_ADMIN_SECRET, getRashinCodeAdminSecret(req, body));
  return !IS_DEPLOYED_RUNTIME && isLocalRequest(req);
}

async function listJsonRecords(dirPath) {
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    const records = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const parsed = await readJsonFileSafe(path.join(dirPath, entry.name), null);
      if (parsed && typeof parsed === 'object') records.push(parsed);
    }
    return records;
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function findPaidReadingTicketByCheckoutSessionId(sessionId) {
  const safeSessionId = normalizeStripeObjectId(sessionId);
  if (!safeSessionId) return null;
  const tickets = await listJsonRecords(PAID_READING_TICKET_DIR);
  return tickets.find(ticket => String(ticket?.stripeCheckoutSessionId || '') === safeSessionId) || null;
}

function isExpiredIso(isoValue) {
  const time = new Date(isoValue || '').getTime();
  return Number.isFinite(time) && time > 0 && time <= Date.now();
}

async function resolvePurchaseOwner(req, identity = null) {
  const authSession = readAuthSession(req);
  const authUserId = normalizeUserId(authSession?.userId || '');
  if (authUserId) {
    const userRecord = await readUserRecord(authUserId);
    if (userRecord?.userId) {
      return {
        ownerType: 'user',
        userId: userRecord.userId,
        vaultId: '',
      };
    }
  }
  const normalized = normalizeVaultIdentity(identity);
  if (normalized?.vaultId) {
    return {
      ownerType: 'vault',
      userId: '',
      vaultId: normalized.vaultId,
    };
  }
  return null;
}

function ownerMatchesTicket(owner, ticket) {
  if (!owner || !ticket) return false;
  if (owner.ownerType !== ticket.ownerType) return false;
  if (owner.ownerType === 'user') return !!owner.userId && owner.userId === ticket.userId;
  if (owner.ownerType === 'vault') return !!owner.vaultId && owner.vaultId === ticket.vaultId;
  return false;
}

function getRecordCreatedTime(record = {}) {
  const created = new Date(record?.createdAt || record?.updatedAt || 0).getTime();
  return Number.isFinite(created) && created > 0 ? created : 0;
}

function getRashinDiscountExpiry(record = {}) {
  const created = getRecordCreatedTime(record);
  return created ? getJstEndOfDayAfterDaysIso(new Date(created), RASHIN_BONUS_VALID_DAYS) : '';
}

async function getUserFreeReadingRecords(userId) {
  const vaultKey = makeUserVaultKey(userId);
  const records = await readVaultRecords(vaultKey);
  return (Array.isArray(records) ? records : [])
    .filter(record => record && normalizeVaultRecordId(record.id) && record.plan === 'free')
    .sort((a, b) => getRecordCreatedTime(b) - getRecordCreatedTime(a));
}

async function hasDeepReadingPurchaseForSource(owner, sourceReadingId) {
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  if (!owner || !sourceId) return false;
  const tickets = await listJsonRecords(PAID_READING_TICKET_DIR);
  return tickets.some(ticket => ownerMatchesTicket(owner, ticket) && ticket.sourceReadingId === sourceId);
}

function isOpenRashinDiscountOrder(order) {
  if (!order || order.purchaseType !== 'deep_reading_once') return false;
  if (order.discountType !== 'rashin_bonus' || normalizeRashinStones(order.discountStonesUsed) <= 0) return false;
  if (order.paidAt || order.rashinBonusConsumedAt) return false;
  if (['paid', 'completed', 'requires_manual_review', 'payment_requires_review', 'manual_review', 'canceled', 'cancelled', 'expired', 'stripe_create_failed'].includes(String(order.status || '').trim())) return false;
  if (isExpiredIso(order.expiresAt)) return false;
  return true;
}

async function findOpenRashinDiscountOrder({ userId, sourceReadingId = '' }) {
  const safeUserId = normalizeUserId(userId);
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  if (!safeUserId) return null;
  const orders = await listJsonRecords(PURCHASE_ORDER_DIR);
  return orders.find(order => {
    if (!isOpenRashinDiscountOrder(order)) return false;
    if (normalizeUserId(order.userId || '') !== safeUserId) return false;
    if (sourceId && order.sourceReadingId === sourceId) return true;
    return !sourceId;
  }) || null;
}

async function acquireRashinDiscountCheckoutLock({ userId, sourceReadingId, purchaseOrderId }) {
  const safeUserId = normalizeUserId(userId);
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  const safeOrderId = normalizePurchaseOrderId(purchaseOrderId);
  const filePath = getRashinDiscountCheckoutLockPath(safeUserId);
  if (!safeUserId || !sourceId || !safeOrderId || !filePath) return false;
  await ensureDir(RASHIN_DISCOUNT_CHECKOUT_LOCK_DIR);
  const payload = {
    userId: safeUserId,
    sourceReadingId: sourceId,
    purchaseOrderId: safeOrderId,
    createdAt: new Date().toISOString(),
  };
  try {
    await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (error) {
    if (!error || error.code !== 'EEXIST') throw error;
  }

  const existingLock = await readJsonFileSafe(filePath, null);
  const existingOrder = existingLock?.purchaseOrderId ? await readPurchaseOrder(existingLock.purchaseOrderId) : null;
  if (isOpenRashinDiscountOrder(existingOrder)) return false;
  await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return true;
}

async function getRashinDiscountEligibility(userRecord, sourceReadingId) {
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  const normalAmount = DEEP_READING_NORMAL_AMOUNT;
  const rashinStones = normalizeRashinStones(userRecord?.rashin_stones);
  const freeReadingBenefit = getRashinFreeReadingBenefit(rashinStones);
  const base = {
    eligible: false,
    normalAmount,
    finalAmount: normalAmount,
    rashinStones,
    freeReadingBenefit: {
      ...freeReadingBenefit,
      available: false,
    },
  };
  if (!userRecord?.userId) return { ...base, reason: 'login_required' };
  if (!sourceId) return { ...base, reason: 'result_required' };

  const freeRecords = await getUserFreeReadingRecords(userRecord.userId);
  const requested = freeRecords.find(record => record.id === sourceId) || null;
  if (!requested) return { ...base, reason: 'result_not_found' };
  const latest = freeRecords[0] || null;
  if (!latest || latest.id !== sourceId) return { ...base, reason: 'not_latest_result' };

  const expiresAt = getRashinDiscountExpiry(requested);
  if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
    return { ...base, reason: 'expired', expiresAt };
  }

  const owner = { ownerType: 'user', userId: userRecord.userId, vaultId: '' };
  if (await hasDeepReadingPurchaseForSource(owner, sourceId)) {
    return { ...base, reason: 'already_purchased', expiresAt };
  }

  if (freeReadingBenefit.available) {
    return {
      eligible: false,
      reason: 'free_reading_available',
      normalAmount,
      discountAmount: normalAmount,
      finalAmount: 0,
      stonesRequired: RASHIN_BONUS_FREE_READING_REQUIRED_STONES,
      rashinStones,
      freeReadingBenefit,
      expiresAt,
    };
  }

  const discount = getRashinDiscountForStones(userRecord.rashin_stones);
  if (!discount) {
    return {
      ...base,
      reason: 'insufficient_stones',
      freeReadingBenefit,
      expiresAt,
    };
  }
  return {
    eligible: true,
    normalAmount,
    discountAmount: discount.discountAmount,
    finalAmount: Math.max(0, normalAmount - discount.discountAmount),
    stonesRequired: discount.requiredStones,
    rashinStones: normalizeRashinStones(userRecord.rashin_stones),
    freeReadingBenefit: getRashinFreeReadingBenefit(userRecord.rashin_stones),
    expiresAt,
  };
}

async function findUsablePaidReadingTicket({ owner, sourceReadingId, paidReadingId = '' }) {
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  if (!owner || !sourceId) return null;
  const tickets = await listJsonRecords(PAID_READING_TICKET_DIR);
  return tickets.find(ticket => {
    if (!ownerMatchesTicket(owner, ticket)) return false;
    if (ticket.sourceReadingId !== sourceId) return false;
    if (ticket.status !== 'unused') return false;
    if (isExpiredIso(ticket.expiresAt)) return false;
    if (ticket.lockedReadingId && paidReadingId && ticket.lockedReadingId !== paidReadingId) return false;
    if (ticket.lockedReadingId && !paidReadingId) return false;
    return true;
  }) || null;
}

async function createPurchaseOrder({ owner, sourceReadingId, rashinDiscount = null, orderId = '' }) {
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  if (!owner || !sourceId) throw new Error('INVALID_PURCHASE_ORDER');
  const now = new Date().toISOString();
  const discountAmount = Math.max(0, Math.floor(Number(rashinDiscount?.discountAmount || 0)) || 0);
  const stonesRequired = Math.max(0, Math.floor(Number(rashinDiscount?.stonesRequired || 0)) || 0);
  const finalAmount = Math.max(0, DEEP_READING_NORMAL_AMOUNT - discountAmount);
  const order = {
    id: normalizePurchaseOrderId(orderId) || generateRecordId('po'),
    ownerType: owner.ownerType,
    userId: owner.ownerType === 'user' ? owner.userId : '',
    vaultId: owner.ownerType === 'vault' ? owner.vaultId : '',
    sourceReadingId: sourceId,
    oracleResultId: sourceId,
    purchaseType: 'deep_reading_once',
    baseAmount: DEEP_READING_NORMAL_AMOUNT,
    originalAmount: DEEP_READING_NORMAL_AMOUNT,
    discountAmount,
    finalAmount,
    discountStonesUsed: stonesRequired,
    discountType: discountAmount > 0 ? 'rashin_bonus' : '',
    rashinBonusConsumedAt: '',
    currency: 'jpy',
    status: 'created',
    stripeCheckoutSessionId: '',
    stripePaymentIntentId: '',
    createdAt: now,
    paidAt: '',
    expiresAt: addDaysIso(1),
  };
  await writePurchaseOrder(order);
  return order;
}

async function createRashinCodePurchaseOrder({ userRecord, sourceReadingId, intent = 'upgrade-paid' }) {
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  if (!userRecord?.userId || !sourceId) {
    const error = new Error('SOURCE_READING_REQUIRED');
    error.statusCode = 400;
    error.publicCode = 'SOURCE_READING_REQUIRED';
    throw error;
  }
  const owner = { ownerType: 'user', userId: userRecord.userId, vaultId: '' };
  if (await hasDeepReadingPurchaseForSource(owner, sourceId)) {
    const error = new Error('DEEP_READING_ALREADY_PURCHASED');
    error.statusCode = 409;
    error.publicCode = 'DEEP_READING_ALREADY_PURCHASED';
    throw error;
  }
  return withUserMutation(userRecord.userId, async safeUserId => {
    const latestUser = await readUserRecord(safeUserId);
    const discountStatus = await getRashinDiscountEligibility(latestUser, sourceId);
    if (['login_required', 'result_required', 'result_not_found'].includes(discountStatus.reason)) {
      const error = new Error('ORACLE_RESULT_NOT_AVAILABLE');
      error.statusCode = 403;
      error.publicCode = 'ORACLE_RESULT_NOT_AVAILABLE';
      throw error;
    }
    if (discountStatus.reason === 'already_purchased') {
      const error = new Error('DEEP_READING_ALREADY_PURCHASED');
      error.statusCode = 409;
      error.publicCode = 'DEEP_READING_ALREADY_PURCHASED';
      throw error;
    }
    let orderId = '';
    if (discountStatus.eligible) {
      const openForResult = await findOpenRashinDiscountOrder({ userId: safeUserId, sourceReadingId: sourceId });
      const openForUser = await findOpenRashinDiscountOrder({ userId: safeUserId });
      if (openForResult || openForUser) {
        const error = new Error('RASHIN_DISCOUNT_CHECKOUT_ALREADY_OPEN');
        error.statusCode = 409;
        error.publicCode = 'RASHIN_DISCOUNT_CHECKOUT_ALREADY_OPEN';
        throw error;
      }
      orderId = generateRecordId('po');
      const lockAcquired = await acquireRashinDiscountCheckoutLock({
        userId: safeUserId,
        sourceReadingId: sourceId,
        purchaseOrderId: orderId,
      });
      if (!lockAcquired) {
        const error = new Error('RASHIN_DISCOUNT_CHECKOUT_ALREADY_OPEN');
        error.statusCode = 409;
        error.publicCode = 'RASHIN_DISCOUNT_CHECKOUT_ALREADY_OPEN';
        throw error;
      }
    }
    const order = await createPurchaseOrder({
      owner,
      sourceReadingId: sourceId,
      orderId,
      rashinDiscount: discountStatus.eligible ? {
        discountAmount: discountStatus.discountAmount,
        stonesRequired: discountStatus.stonesRequired,
      } : null,
    });
    const email = normalizeCustomerEmail(latestUser?.email || userRecord.email || '');
    const pendingOrder = {
      ...order,
      status: 'awaiting_payment',
      paymentProvider: 'rashin_code',
      checkoutProvider: 'rashin_code',
      requestedIntent: String(intent || '').slice(0, 40),
      deliveryChannel: 'google_email',
      recipientEmailHash: hashPrivateLookupValue('email', email),
      recipientEmailMasked: maskEmail(email),
      updatedAt: new Date().toISOString(),
    };
    await writePurchaseOrder(pendingOrder);
    return pendingOrder;
  });
}

async function findPurchaseOrderByProviderPaymentId(paymentProvider, providerPaymentId, exceptOrderId = '') {
  const provider = String(paymentProvider || '').trim();
  const reference = normalizeBoothOrderReference(providerPaymentId);
  const skipOrderId = normalizePurchaseOrderId(exceptOrderId);
  if (!provider || !reference) return null;
  const orders = await listJsonRecords(PURCHASE_ORDER_DIR);
  return orders.find(order => {
    if (skipOrderId && order?.id === skipOrderId) return false;
    return String(order?.paymentProvider || '') === provider
      && normalizeBoothOrderReference(order?.providerPaymentId || '') === reference;
  }) || null;
}

async function createRashinCodePurchaseOrderForBooth({ userRecord, sourceReadingId = '', intent = 'upgrade-paid' }) {
  if (!userRecord?.userId) {
    const error = new Error('GOOGLE_LOGIN_REQUIRED');
    error.statusCode = 401;
    error.publicCode = 'GOOGLE_LOGIN_REQUIRED';
    throw error;
  }
  const safeIntent = String(intent || '').trim() || 'upgrade-paid';
  const sourceId = normalizeVaultRecordId(sourceReadingId) || (safeIntent === 'start-paid' ? generateRecordId('direct') : '');
  if (!sourceId) {
    const error = new Error('SOURCE_READING_REQUIRED');
    error.statusCode = 400;
    error.publicCode = 'SOURCE_READING_REQUIRED';
    throw error;
  }
  if (safeIntent !== 'start-paid') {
    const order = await createRashinCodePurchaseOrder({ userRecord, sourceReadingId: sourceId, intent: safeIntent });
    const boothOrder = {
      ...order,
      paymentProvider: 'booth',
      checkoutProvider: 'booth',
      deliveryChannel: 'in_app',
      updatedAt: new Date().toISOString(),
    };
    await writePurchaseOrder(boothOrder);
    return boothOrder;
  }
  const owner = { ownerType: 'user', userId: userRecord.userId, vaultId: '' };
  const order = await createPurchaseOrder({ owner, sourceReadingId: sourceId, rashinDiscount: null });
  const email = normalizeCustomerEmail(userRecord.email || '');
  const pendingOrder = {
    ...order,
    status: 'awaiting_payment',
    paymentProvider: 'booth',
    checkoutProvider: 'booth',
    requestedIntent: safeIntent.slice(0, 40),
    deliveryChannel: 'in_app',
    recipientEmailHash: hashPrivateLookupValue('email', email),
    recipientEmailMasked: maskEmail(email),
    updatedAt: new Date().toISOString(),
  };
  await writePurchaseOrder(pendingOrder);
  return pendingOrder;
}

async function createRashinPaidCodeRecordForOrder({ order, userRecord, providerPaymentId = '', paymentProvider = 'booth', deliveryChannel = 'in_app' }) {
  const sourceId = normalizeVaultRecordId(order?.sourceReadingId || '');
  if (!order?.id || !userRecord?.userId || !sourceId) throw new Error('INVALID_RASHIN_PAID_CODE_ORDER');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateRashinPaidCode();
    const codeHash = getRashinPaidCodeHash(code);
    if (!codeHash) continue;
    const existing = await readRashinPaidCodeRecordByHash(codeHash);
    if (existing) continue;
    return withRashinPaidCodeMutation(codeHash, async () => {
      const lockedExisting = await readRashinPaidCodeRecordByHash(codeHash);
      if (lockedExisting) throw new Error('RASHIN_PAID_CODE_COLLISION');
      const now = new Date().toISOString();
      const email = normalizeCustomerEmail(userRecord.email || '');
      const record = {
        codeHash,
        codeSuffix: code.slice(-4),
        product: 'deep_reading_once',
        status: 'issued',
        purchaseOrderId: normalizePurchaseOrderId(order.id),
        sourceReadingId: sourceId,
        ownerType: 'user',
        userId: normalizeUserId(userRecord.userId),
        vaultId: '',
        paymentProvider,
        providerPaymentId: normalizeBoothOrderReference(providerPaymentId),
        recipientEmailHash: hashPrivateLookupValue('email', email),
        recipientEmailMasked: maskEmail(email),
        deliveryChannel,
        deliveryStatus: 'issued_to_app',
        baseAmount: readAmount(order.baseAmount, DEEP_READING_NORMAL_AMOUNT),
        originalAmount: readAmount(order.originalAmount, DEEP_READING_NORMAL_AMOUNT),
        discountAmount: readAmount(order.discountAmount, 0),
        finalAmount: readAmount(order.finalAmount, DEEP_READING_NORMAL_AMOUNT),
        discountStonesUsed: Number(order.discountStonesUsed || 0),
        discountType: order.discountType || '',
        currency: order.currency || 'jpy',
        issuedAt: now,
        expiresAt: addDaysIso(30),
        redeemedAt: '',
        redeemedByUserId: '',
        redeemedSourceReadingId: '',
        createdAt: now,
        updatedAt: now,
      };
      await writeRashinPaidCodeRecord(record);
      return { code, codeHash, record };
    });
  }
  throw new Error('RASHIN_PAID_CODE_GENERATION_FAILED');
}

async function completeBoothOrderWithTicket({ order, userRecord, providerPaymentId = '', issuedBy = 'booth_order_claim' }) {
  const owner = { ownerType: 'user', userId: userRecord.userId, vaultId: '' };
  if (order.paidReadingTicketId) {
    const existingTicket = await readPaidReadingTicket(order.paidReadingTicketId);
    if (existingTicket) return { order, ticket: existingTicket, codeRecord: null };
  }
  if (await hasDeepReadingPurchaseForSource(owner, order.sourceReadingId)) {
    const error = new Error('DEEP_READING_ALREADY_PURCHASED');
    error.statusCode = 409;
    error.publicCode = 'DEEP_READING_ALREADY_PURCHASED';
    throw error;
  }
  const issued = await createRashinPaidCodeRecordForOrder({
    order,
    userRecord,
    providerPaymentId,
    paymentProvider: 'booth',
    deliveryChannel: issuedBy,
  });
  const ticket = await createPaidTicketFromRashinPaidCode({
    codeRecord: issued.record,
    owner,
    sourceReadingId: order.sourceReadingId,
  });
  const now = new Date().toISOString();
  const redeemedRecord = {
    ...issued.record,
    status: 'redeemed',
    redeemedAt: now,
    redeemedByUserId: userRecord.userId,
    redeemedSourceReadingId: order.sourceReadingId,
    paidReadingTicketId: ticket.id,
    updatedAt: now,
  };
  await writeRashinPaidCodeRecord(redeemedRecord);
  const completedOrder = {
    ...order,
    status: 'paid',
    paymentProvider: 'booth',
    checkoutProvider: 'booth',
    providerPaymentId: normalizeBoothOrderReference(providerPaymentId),
    paidAt: now,
    paymentClaimedAt: order.paymentClaimedAt || now,
    paidReadingTicketId: ticket.id,
    rashinPaidCodeHash: issued.codeHash,
    codeSuffix: issued.record.codeSuffix,
    deliveryChannel: issuedBy,
    deliveryStatus: 'ticket_created',
    updatedAt: now,
  };
  await writePurchaseOrder(completedOrder);
  return { order: completedOrder, ticket, codeRecord: redeemedRecord };
}

async function createPaidTicketFromRashinPaidCode({ codeRecord, owner, sourceReadingId }) {
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  if (!codeRecord?.codeHash || !owner || !sourceId) throw new Error('INVALID_RASHIN_PAID_CODE_TICKET');
  const ticketId = makePaidTicketIdForRashinPaidCode(codeRecord.codeHash, sourceId);
  const existing = ticketId ? await readPaidReadingTicket(ticketId) : null;
  if (existing) return existing;
  const now = new Date().toISOString();
  const ticket = {
    id: ticketId || generateRecordId('prt'),
    ownerType: owner.ownerType,
    userId: owner.ownerType === 'user' ? owner.userId : '',
    vaultId: owner.ownerType === 'vault' ? owner.vaultId : '',
    sourceReadingId: sourceId,
    purchaseOrderId: normalizePurchaseOrderId(codeRecord.purchaseOrderId || ''),
    paymentProvider: codeRecord.paymentProvider || 'rashin_code',
    rashinPaidCodeHash: codeRecord.codeHash,
    codeSuffix: codeRecord.codeSuffix || '',
    baseAmount: readFirstAmount(DEEP_READING_NORMAL_AMOUNT, codeRecord.originalAmount, codeRecord.baseAmount),
    originalAmount: readFirstAmount(DEEP_READING_NORMAL_AMOUNT, codeRecord.originalAmount, codeRecord.baseAmount),
    discountAmount: readAmount(codeRecord.discountAmount, 0),
    finalAmount: readAmount(codeRecord.finalAmount, DEEP_READING_NORMAL_AMOUNT),
    discountStonesUsed: Number(codeRecord.discountStonesUsed || 0),
    discountType: codeRecord.discountType || '',
    currency: 'jpy',
    status: 'unused',
    createdAt: now,
    usedAt: '',
    expiresAt: addDaysIso(30),
    usedReadingId: '',
    lockedReadingId: '',
    lockedAt: '',
  };
  const writeResult = await writePaidReadingTicketIfAbsent(ticket);
  return writeResult.ticket;
}

async function createPaidTicketFromRashinFragments({ userRecord, sourceReadingId, paidReadingId = '', allowDirectPaid = false }) {
  const sourceId = normalizeVaultRecordId(sourceReadingId);
  const paidId = normalizeVaultRecordId(paidReadingId);
  if (!userRecord?.userId || !sourceId || !paidId) {
    const error = new Error('READING_ID_REQUIRED');
    error.statusCode = 400;
    throw error;
  }
  return withUserMutation(userRecord.userId, async safeUserId => {
    const latestUser = await readUserRecord(safeUserId);
    const owner = { ownerType: 'user', userId: safeUserId, vaultId: '' };
    const reusableTicket = await findUsablePaidReadingTicket({ owner, sourceReadingId: sourceId, paidReadingId: paidId });
    if (reusableTicket) {
      const now = new Date().toISOString();
      const locked = reusableTicket.lockedReadingId ? reusableTicket : {
        ...reusableTicket,
        lockedReadingId: paidId,
        lockedAt: now,
      };
      if (!reusableTicket.lockedReadingId) await writePaidReadingTicket(locked);
      return { ticket: locked, consumed: false, userRecord: latestUser };
    }
    if (await hasDeepReadingPurchaseForSource(owner, sourceId)) {
      const error = new Error('DEEP_READING_ALREADY_PURCHASED');
      error.statusCode = 409;
      throw error;
    }

    if (!allowDirectPaid) {
      const freeRecords = await getUserFreeReadingRecords(safeUserId);
      const requested = freeRecords.find(record => record.id === sourceId) || null;
      const latest = freeRecords[0] || null;
      if (!requested || !latest) {
        const error = new Error('ORACLE_RESULT_NOT_AVAILABLE');
        error.statusCode = 403;
        throw error;
      }
      if (latest.id !== sourceId) {
        const error = new Error('LATEST_RESULT_REQUIRED');
        error.statusCode = 409;
        throw error;
      }
      const expiresAt = getRashinDiscountExpiry(requested);
      if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
        const error = new Error('ORACLE_RESULT_EXPIRED');
        error.statusCode = 410;
        throw error;
      }
    }
    const currentStones = normalizeRashinStones(latestUser?.rashin_stones);
    if (currentStones < RASHIN_BONUS_FREE_READING_REQUIRED_STONES) {
      const error = new Error('RASHIN_FRAGMENTS_INSUFFICIENT');
      error.statusCode = 409;
      error.rashinStones = currentStones;
      throw error;
    }

    const now = new Date().toISOString();
    const ticket = {
      id: makePaidTicketIdForRashinFragments(safeUserId, sourceId) || generateRecordId('prt'),
      ownerType: 'user',
      userId: safeUserId,
      vaultId: '',
      sourceReadingId: sourceId,
      purchaseOrderId: '',
      paymentProvider: 'rashin_fragments',
      checkoutProvider: 'rashin_fragments',
      baseAmount: DEEP_READING_NORMAL_AMOUNT,
      originalAmount: DEEP_READING_NORMAL_AMOUNT,
      discountAmount: DEEP_READING_NORMAL_AMOUNT,
      finalAmount: 0,
      discountStonesUsed: RASHIN_BONUS_FREE_READING_REQUIRED_STONES,
      discountType: 'rashin_fragments_free_reading',
      currency: 'jpy',
      status: 'unused',
      createdAt: now,
      usedAt: '',
      expiresAt: addDaysIso(30),
      usedReadingId: '',
      lockedReadingId: paidId,
      lockedAt: now,
    };
    const writeResult = await writePaidReadingTicketIfAbsent(ticket);
    if (!writeResult.created) return { ticket: writeResult.ticket, consumed: false, userRecord: latestUser };
    const nextUser = {
      ...(latestUser || userRecord),
      rashin_stones: currentStones - RASHIN_BONUS_FREE_READING_REQUIRED_STONES,
      updatedAt: now,
    };
    await writeUserRecord(safeUserId, nextUser);
    return { ticket: writeResult.ticket, consumed: true, userRecord: nextUser };
  });
}

async function issueRashinPaidCodeForOrder(order, issueMeta = {}) {
  const purchaseOrderId = normalizePurchaseOrderId(order?.id || '');
  if (!purchaseOrderId || order?.purchaseType !== 'deep_reading_once') {
    const error = new Error('PURCHASE_ORDER_NOT_FOUND');
    error.statusCode = 404;
    throw error;
  }
  if (order.rashinPaidCodeHash) {
    const error = new Error('RASHIN_CODE_ALREADY_ISSUED');
    error.statusCode = 409;
    throw error;
  }
  const paidAt = issueMeta.paidAt || new Date().toISOString();
  const paidOrder = {
    ...order,
    status: 'paid',
    paymentProvider: issueMeta.paymentProvider || order.paymentProvider || 'manual',
    providerPaymentId: String(issueMeta.providerPaymentId || '').trim().slice(0, 160),
    paidAt,
    updatedAt: paidAt,
  };
  await writePurchaseOrder(paidOrder);
  const consumeResult = await consumeRashinBonusForPaidOrder(paidOrder);
  const consumedOrder = consumeResult.order || paidOrder;
  if (!consumeResult.ok) return { requiresManualReview: true, order: consumedOrder };

  let rawCode = '';
  let codeHash = '';
  for (let i = 0; i < 8; i += 1) {
    rawCode = generateRashinPaidCode();
    codeHash = getRashinPaidCodeHash(rawCode);
    if (codeHash && !await readRashinPaidCodeRecordByHash(codeHash)) break;
    rawCode = '';
    codeHash = '';
  }
  if (!rawCode || !codeHash) throw new Error('RASHIN_CODE_GENERATE_FAILED');
  const now = new Date().toISOString();
  const codeRecord = {
    codeHash,
    codeSuffix: rawCode.slice(-4),
    product: 'deep_reading_once',
    status: 'issued',
    purchaseOrderId,
    sourceReadingId: consumedOrder.sourceReadingId,
    ownerType: consumedOrder.ownerType,
    userId: consumedOrder.userId || '',
    vaultId: consumedOrder.vaultId || '',
    paymentProvider: paidOrder.paymentProvider,
    providerPaymentId: paidOrder.providerPaymentId || '',
    recipientEmailHash: consumedOrder.recipientEmailHash || '',
    recipientEmailMasked: consumedOrder.recipientEmailMasked || '',
    deliveryChannel: consumedOrder.deliveryChannel || 'google_email',
    deliveryStatus: issueMeta.deliveryStatus || 'pending_delivery',
    baseAmount: readFirstAmount(DEEP_READING_NORMAL_AMOUNT, consumedOrder.originalAmount, consumedOrder.baseAmount),
    originalAmount: readFirstAmount(DEEP_READING_NORMAL_AMOUNT, consumedOrder.originalAmount, consumedOrder.baseAmount),
    discountAmount: readAmount(consumedOrder.discountAmount, 0),
    finalAmount: readAmount(consumedOrder.finalAmount, DEEP_READING_NORMAL_AMOUNT),
    discountStonesUsed: Number(consumedOrder.discountStonesUsed || 0),
    discountType: consumedOrder.discountType || '',
    currency: 'jpy',
    issuedAt: now,
    expiresAt: addDaysIso(30),
    redeemedAt: '',
    redeemedByUserId: '',
    redeemedSourceReadingId: '',
    createdAt: now,
    updatedAt: now,
  };
  await writeRashinPaidCodeRecord(codeRecord);
  await writePurchaseOrder({
    ...consumedOrder,
    status: 'code_issued',
    rashinPaidCodeHash: codeHash,
    codeSuffix: codeRecord.codeSuffix,
    codeIssuedAt: now,
    deliveryStatus: codeRecord.deliveryStatus,
    updatedAt: now,
  });
  return { code: formatRashinPaidCode(rawCode), codeRecord };
}

async function issueRashinPaidCodeForPurchaseOrderId(purchaseOrderId, issueMeta = {}) {
  return withPurchaseOrderMutation(purchaseOrderId, async safePurchaseOrderId => {
    const latestOrder = await readPurchaseOrder(safePurchaseOrderId);
    if (!latestOrder) {
      const error = new Error('PURCHASE_ORDER_NOT_FOUND');
      error.statusCode = 404;
      throw error;
    }
    return issueRashinPaidCodeForOrder(latestOrder, issueMeta);
  });
}

async function consumeRashinBonusForPaidOrder(order) {
  const stonesToConsume = Math.max(0, Math.floor(Number(order?.discountStonesUsed || 0)) || 0);
  const userId = normalizeUserId(order?.userId || '');
  if (order?.discountType !== 'rashin_bonus' || !stonesToConsume || !userId || order?.rashinBonusConsumedAt) {
    return { ok: true, order };
  }
  return withUserMutation(userId, async safeUserId => {
    const latestOrder = await readPurchaseOrder(order.id) || order;
    if (latestOrder.rashinBonusConsumedAt) return { ok: true, order: latestOrder };
    const userRecord = await readUserRecord(safeUserId);
    const currentStones = normalizeRashinStones(userRecord?.rashin_stones);
    const now = new Date().toISOString();
    if (currentStones < stonesToConsume) {
      const reviewOrder = {
        ...latestOrder,
        status: 'requires_manual_review',
        reviewReason: 'RASHIN_STONES_INSUFFICIENT_AT_PAYMENT',
        reviewRequiredAt: now,
        updatedAt: now,
      };
      await writePurchaseOrder(reviewOrder);
      console.error('Rashin bonus payment requires manual review', {
        purchaseOrderId: latestOrder.id,
        userId: safeUserId,
        currentStones,
        stonesToConsume,
        stripeCheckoutSessionId: latestOrder.stripeCheckoutSessionId || '',
      });
      return {
        ok: false,
        reason: 'insufficient_stones',
        order: reviewOrder,
      };
    }
    const nextUser = {
      ...(userRecord || {}),
      rashin_stones: currentStones - stonesToConsume,
      updatedAt: now,
    };
    await writeUserRecord(safeUserId, nextUser);
    const consumedOrder = {
      ...latestOrder,
      status: 'paid',
      rashinBonusConsumedAt: now,
      updatedAt: now,
    };
    await writePurchaseOrder(consumedOrder);
    return { ok: true, order: consumedOrder };
  });
}

async function fulfillDeepReadingCheckoutSession(session) {
  const sessionId = normalizeStripeObjectId(session?.id || '');
  const purchaseType = String(session?.metadata?.purchaseType || '').trim();
  const purchaseOrderId = normalizePurchaseOrderId(session?.metadata?.purchaseOrderId || '');
  const sourceReadingId = normalizeVaultRecordId(session?.metadata?.sourceReadingId || '');
  if (!sessionId || purchaseType !== 'deep_reading_once' || !purchaseOrderId || !sourceReadingId) {
    return null;
  }
  if (String(session?.payment_status || '').trim() !== 'paid') {
    return { pending: true, purchaseOrderId, sourceReadingId };
  }
  return withCheckoutSessionMutation(sessionId, async () => fulfillDeepReadingCheckoutSessionLocked(session, {
    sessionId,
    purchaseOrderId,
    sourceReadingId,
  }));
}

async function fulfillDeepReadingCheckoutSessionLocked(session, ids) {
  const { sessionId, purchaseOrderId, sourceReadingId } = ids;
  const deterministicTicketId = makePaidTicketIdForCheckoutSession(sessionId);
  const existingById = deterministicTicketId ? await readPaidReadingTicket(deterministicTicketId) : null;
  if (existingById) return existingById;
  const existingTicket = await findPaidReadingTicketByCheckoutSessionId(sessionId);
  if (existingTicket) return existingTicket;

  const order = await readPurchaseOrder(purchaseOrderId);
  if (!order || order.purchaseType !== 'deep_reading_once') {
    throw new Error('PURCHASE_ORDER_NOT_FOUND');
  }
  if (order.sourceReadingId !== sourceReadingId) {
    throw new Error('PURCHASE_ORDER_SOURCE_MISMATCH');
  }
  if (order.stripeCheckoutSessionId !== sessionId) {
    throw new Error('PURCHASE_ORDER_SESSION_MISMATCH');
  }
  if (Number(session?.amount_total) !== Number(order.finalAmount) || String(session?.currency || '').toLowerCase() !== order.currency) {
    throw new Error('STRIPE_SESSION_AMOUNT_MISMATCH');
  }
  const now = new Date().toISOString();
  const paymentIntentId = normalizeStripeObjectId(session?.payment_intent || '');
  const paidOrder = {
    ...order,
    status: 'paid',
    stripeCheckoutSessionId: sessionId,
    stripePaymentIntentId: paymentIntentId,
    paidAt: now,
  };
  await writePurchaseOrder(paidOrder);
  const consumeResult = await consumeRashinBonusForPaidOrder(paidOrder);
  const consumedOrder = consumeResult.order || paidOrder;
  if (!consumeResult.ok) {
    return {
      requiresManualReview: true,
      purchaseOrderId,
      sourceReadingId,
      status: consumedOrder.status || 'requires_manual_review',
    };
  }

  const ticket = {
    id: deterministicTicketId || generateRecordId('prt'),
    ownerType: order.ownerType,
    userId: order.ownerType === 'user' ? order.userId : '',
    vaultId: order.ownerType === 'vault' ? order.vaultId : '',
    sourceReadingId,
    stripeCheckoutSessionId: sessionId,
    stripePaymentIntentId: paymentIntentId,
    baseAmount: readFirstAmount(DEEP_READING_NORMAL_AMOUNT, consumedOrder.originalAmount, consumedOrder.baseAmount),
    originalAmount: readFirstAmount(DEEP_READING_NORMAL_AMOUNT, consumedOrder.originalAmount, consumedOrder.baseAmount),
    discountAmount: readAmount(consumedOrder.discountAmount, 0),
    finalAmount: readAmount(consumedOrder.finalAmount, DEEP_READING_NORMAL_AMOUNT),
    discountStonesUsed: Number(consumedOrder.discountStonesUsed || 0),
    discountType: consumedOrder.discountType || '',
    currency: 'jpy',
    status: 'unused',
    createdAt: now,
    usedAt: '',
    expiresAt: addDaysIso(30),
    usedReadingId: '',
    lockedReadingId: '',
    lockedAt: '',
  };
  const writeResult = await writePaidReadingTicketIfAbsent(ticket);
  return writeResult.ticket;
}

async function validatePaidReadingTicketAccess(req, payload = {}) {
  const ticketId = normalizePaidTicketId(payload?.paid_ticket_id || '');
  const sourceReadingId = normalizeVaultRecordId(payload?.source_reading_id || '');
  const paidReadingId = normalizeVaultRecordId(payload?.paid_reading_id || '');
  if (!ticketId || !sourceReadingId || !paidReadingId) return false;
  const ticket = await readPaidReadingTicket(ticketId);
  if (!ticket || ticket.sourceReadingId !== sourceReadingId) return false;
  if (isExpiredIso(ticket.expiresAt)) return false;
  const owner = await resolvePurchaseOwner(req, payload?.identity);
  if (!ownerMatchesTicket(owner, ticket)) return false;
  if (ticket.status !== 'unused') return false;
  if (ticket.lockedReadingId !== paidReadingId) return false;
  return true;
}

function sanitizePayload(body) {
  const provider = body && body.provider === 'openai' ? 'openai' : 'anthropic';
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const system = typeof body.system === 'string' ? body.system : '';
  const maxTokens = Number(body.max_tokens);
  const reasoningEffort = typeof body.reasoning_effort === 'string' ? body.reasoning_effort.trim() : '';
  const taskKey = typeof body.task_key === 'string' ? body.task_key.trim().slice(0, 40) : '';
  const plan = typeof body.plan === 'string' ? body.plan.trim().slice(0, 20) : '';
  const category = typeof body.category === 'string' ? body.category.trim().slice(0, 40) : '';
  const readingId = normalizeVaultRecordId(body.reading_id || '');
  const paidTicketId = normalizePaidTicketId(body.paid_ticket_id || '');
  const paidReadingId = normalizeVaultRecordId(body.paid_reading_id || '');
  const sourceReadingId = normalizeVaultRecordId(body.source_reading_id || '');
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const images = Array.isArray(body.images) ? body.images : [];

  if (!ALLOWED_MODELS[provider]?.has(model)) {
    throw new Error('MODEL_NOT_ALLOWED');
  }
  if (!Number.isFinite(maxTokens) || maxTokens <= 0 || maxTokens > 8192) {
    throw new Error('INVALID_MAX_TOKENS');
  }
  if (!messages.length) {
    throw new Error('MISSING_MESSAGES');
  }

  const safeMessages = messages
    .map(message => ({
      role: message && message.role === 'assistant' ? 'assistant' : 'user',
      content: typeof message?.content === 'string' ? message.content : '',
    }))
    .filter(message => message.content);

  if (!safeMessages.length) {
    throw new Error('EMPTY_MESSAGES');
  }

  const payload = {
    provider,
    model,
    max_tokens: Math.floor(maxTokens),
    system,
    messages: safeMessages,
    task_key: taskKey,
    plan,
    reading_id: readingId,
    category,
    paid_ticket_id: paidTicketId,
    paid_reading_id: paidReadingId,
    source_reading_id: sourceReadingId,
    identity: body?.identity && typeof body.identity === 'object' ? {
      fullname: typeof body.identity.fullname === 'string' ? body.identity.fullname.slice(0, 160) : '',
      gender: typeof body.identity.gender === 'string' ? body.identity.gender.slice(0, 20) : '',
      year: body.identity.year,
      month: body.identity.month,
      day: body.identity.day,
      vaultId: typeof body.identity.vaultId === 'string' ? body.identity.vaultId.slice(0, 100) : '',
    } : null,
    ab_test: sanitizeAbTestPayload(body?.ab_test || body?.abTest || null),
    images: images.slice(0, 20).map(image => ({
      path: typeof image?.path === 'string' ? image.path.trim() : '',
      detail: image?.detail === 'high' ? 'high' : 'low',
      label: typeof image?.label === 'string' ? image.label.trim() : '',
    })).filter(image => image.path),
  };

  if (reasoningEffort) {
    const allowedEfforts = new Set(['minimal', 'low', 'medium', 'high']);
    if (!allowedEfforts.has(reasoningEffort)) {
      throw new Error('INVALID_REASONING_EFFORT');
    }
    payload.reasoning_effort = reasoningEffort;
  }

  return payload;
}

async function readLocalImageAsDataUrl(relativePath) {
  const cleanPath = relativePath.replace(/^\/+/, '');
  const resolvedPath = path.resolve(ROOT_DIR, cleanPath);
  const imagesRoot = path.resolve(ROOT_DIR, 'images');
  if (!resolvedPath.startsWith(imagesRoot)) {
    throw new Error('IMAGE_PATH_NOT_ALLOWED');
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const mime = MIME_TYPES[ext];
  if (!mime || !mime.startsWith('image/')) {
    throw new Error('IMAGE_TYPE_NOT_ALLOWED');
  }

  const buffer = await fsp.readFile(resolvedPath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function readLocalImageAsset(relativePath) {
  const cleanPath = relativePath.replace(/^\/+/, '');
  const resolvedPath = path.resolve(ROOT_DIR, cleanPath);
  const imagesRoot = path.resolve(ROOT_DIR, 'images');
  if (!resolvedPath.startsWith(imagesRoot)) {
    throw new Error('IMAGE_PATH_NOT_ALLOWED');
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const mime = MIME_TYPES[ext];
  if (!mime || !mime.startsWith('image/')) {
    throw new Error('IMAGE_TYPE_NOT_ALLOWED');
  }

  const buffer = await fsp.readFile(resolvedPath);
  return {
    mime,
    base64: buffer.toString('base64'),
  };
}

function makeHttpsRequest(url, options, payload) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, options, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        raw += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode || 500,
          body: raw,
          headers: response.headers,
        });
      });
    });

    request.on('error', reject);
    request.write(JSON.stringify(payload));
    request.end();
  });
}

function makeHttpsTextRequest(url, options, payload = '') {
  return new Promise((resolve, reject) => {
    const hasExplicitOptions = options && Object.keys(options).length > 0;
    const request = hasExplicitOptions
      ? https.request(url, options, response => {
          let raw = '';
          response.setEncoding('utf8');
          response.on('data', chunk => {
            raw += chunk;
          });
          response.on('end', () => {
            resolve({
              statusCode: response.statusCode || 500,
              body: raw,
              headers: response.headers,
            });
          });
        })
      : https.request(url, response => {
          let raw = '';
          response.setEncoding('utf8');
          response.on('data', chunk => {
            raw += chunk;
          });
          response.on('end', () => {
            resolve({
              statusCode: response.statusCode || 500,
              body: raw,
              headers: response.headers,
            });
          });
        });

    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function stripeApiRequest(method, requestPath, params = null) {
  if (!STRIPE_SECRET_KEY) {
    const error = new Error('STRIPE_SECRET_KEY_MISSING');
    error.statusCode = 503;
    throw error;
  }
  const upperMethod = String(method || 'GET').trim().toUpperCase();
  let body = '';
  let pathWithQuery = requestPath;
  const headers = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
  };
  if (upperMethod === 'GET') {
    const query = params instanceof URLSearchParams
      ? params.toString()
      : (params && typeof params === 'object' ? new URLSearchParams(params).toString() : '');
    if (query) pathWithQuery += (requestPath.includes('?') ? '&' : '?') + query;
  } else if (params instanceof URLSearchParams) {
    body = params.toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    headers['Content-Length'] = Buffer.byteLength(body);
  } else if (params && typeof params === 'object') {
    body = new URLSearchParams(params).toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  const upstream = await makeHttpsTextRequest({
    protocol: 'https:',
    hostname: 'api.stripe.com',
    path: pathWithQuery,
    method: upperMethod,
    headers,
  }, null, body);

  let parsed = null;
  try {
    parsed = JSON.parse(upstream.body || '{}');
  } catch (_error) {}
  if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
    const error = new Error(parsed?.error?.message || parsed?.message || 'Stripe API request failed.');
    error.code = 'STRIPE_UPSTREAM_ERROR';
    error.statusCode = 502;
    error.upstreamStatus = upstream.statusCode;
    error.raw = parsed;
    throw error;
  }
  return parsed;
}

function decodeJwtPart(value) {
  return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
}

async function fetchGoogleJwks() {
  const now = Date.now();
  if (GOOGLE_JWK_CACHE.expiresAt > now && Array.isArray(GOOGLE_JWK_CACHE.keys) && GOOGLE_JWK_CACHE.keys.length) {
    return GOOGLE_JWK_CACHE.keys;
  }
  const upstream = await makeHttpsTextRequest('https://www.googleapis.com/oauth2/v3/certs', null, '');
  if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
    const error = new Error('GOOGLE_JWKS_FETCH_FAILED');
    error.statusCode = 502;
    throw error;
  }
  let parsed = {};
  try {
    parsed = JSON.parse(upstream.body || '{}');
  } catch (_error) {}
  const keys = Array.isArray(parsed?.keys) ? parsed.keys : [];
  const cacheControl = String(upstream.headers?.['cache-control'] || '');
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Math.max(60, parseInt(maxAgeMatch[1], 10) || 3600) : 3600;
  GOOGLE_JWK_CACHE = {
    expiresAt: now + (maxAgeSeconds * 1000),
    keys,
  };
  return keys;
}

async function verifyGoogleIdToken(idToken) {
  const token = String(idToken || '').trim();
  if (!token) throw new Error('GOOGLE_ID_TOKEN_REQUIRED');
  if (!GOOGLE_CLIENT_CONFIGURED) throw new Error('GOOGLE_CLIENT_ID_MISSING');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('GOOGLE_ID_TOKEN_INVALID');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);
  if (header?.alg !== 'RS256' || !header?.kid) throw new Error('GOOGLE_ID_TOKEN_INVALID');
  if (!GOOGLE_ISSUERS.has(String(payload?.iss || '').trim())) throw new Error('GOOGLE_ID_TOKEN_ISSUER_INVALID');
  if (String(payload?.aud || '').trim() !== GOOGLE_CLIENT_ID) throw new Error('GOOGLE_ID_TOKEN_AUDIENCE_INVALID');
  if (!payload?.sub) throw new Error('GOOGLE_ID_TOKEN_SUB_MISSING');
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Number(payload?.exp || 0) <= nowSeconds) throw new Error('GOOGLE_ID_TOKEN_EXPIRED');
  const jwks = await fetchGoogleJwks();
  const jwk = jwks.find(item => item?.kid === header.kid && item?.kty === 'RSA');
  if (!jwk) throw new Error('GOOGLE_JWK_NOT_FOUND');
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  const valid = verifier.verify(publicKey, Buffer.from(encodedSignature, 'base64url'));
  if (!valid) throw new Error('GOOGLE_ID_TOKEN_SIGNATURE_INVALID');
  if (payload?.nbf && Number(payload.nbf) > nowSeconds + 30) throw new Error('GOOGLE_ID_TOKEN_NOT_YET_VALID');
  return payload;
}

function sameOriginRequest(req) {
  const origin = String(req?.headers?.origin || '').trim();
  if (!origin) return true;
  if (origin === 'null') return !IS_DEPLOYED_RUNTIME && isLocalRequest(req);
  return !!(normalizeOriginValue(origin) && normalizeOriginValue(origin) === normalizeOriginValue(getRequestOrigin(req)));
}

const SAME_ORIGIN_POST_API_PREFIXES = [
  '/api/rashin-bonus/claim',
  '/api/auth/google',
  '/api/member/session',
  '/api/rashin-code/redeem',
  '/api/member/logout',
  '/api/client-log',
  '/api/stripe/checkout-session',
  '/api/paid-reading/prepare-ticket',
  '/api/paid-reading/use-ticket',
  '/api/paid-reading/release-ticket',
  '/api/stripe/portal-session',
  '/api/ai/generate',
  '/api/anthropic/messages',
  '/api/vault/history/query',
  '/api/vault/history/save',
  '/api/vault/history/clear',
];

function getRequestPathname(req) {
  return String(req?.url || '').split('?')[0] || '/';
}

function isSameOriginPostApiRequest(req) {
  const pathname = getRequestPathname(req);
  return SAME_ORIGIN_POST_API_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function requestHasBody(req) {
  const contentLength = String(req?.headers?.['content-length'] || '').trim();
  const transferEncoding = String(req?.headers?.['transfer-encoding'] || '').trim();
  return (!!contentLength && contentLength !== '0') || !!transferEncoding;
}

function isJsonContentType(req) {
  const contentType = String(req?.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
  return contentType === 'application/json' || contentType.endsWith('+json');
}

function guardSameOriginPostApi(req, res) {
  if (!sameOriginRequest(req)) {
    sendJson(res, 403, {
      error: 'ORIGIN_NOT_ALLOWED',
      message: 'API requests are limited to same-origin requests.',
    });
    return false;
  }
  if (requestHasBody(req) && !isJsonContentType(req)) {
    sendJson(res, 415, {
      error: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'JSON API requests must use application/json.',
    });
    return false;
  }
  return true;
}

function unixToIso(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  return new Date(seconds * 1000).toISOString();
}

async function retrieveStripeSubscription(subscriptionId) {
  const safeId = String(subscriptionId || '').trim();
  if (!safeId) return null;
  return stripeApiRequest('GET', `/v1/subscriptions/${encodeURIComponent(safeId)}`);
}

async function retrieveStripeCheckoutSession(sessionId) {
  const safeId = String(sessionId || '').trim();
  if (!safeId) return null;
  return stripeApiRequest('GET', `/v1/checkout/sessions/${encodeURIComponent(safeId)}`, {
    'expand[]': 'subscription',
  });
}

async function upsertMemberRecordFromStripeSession(session) {
  const customerId = String(session?.customer || '').trim();
  const subscriptionRaw = session?.subscription;
  const subscriptionId = typeof subscriptionRaw === 'string'
    ? subscriptionRaw
    : String(subscriptionRaw?.id || '').trim();
  if (!customerId || !subscriptionId) {
    throw new Error('STRIPE_SESSION_INCOMPLETE');
  }
  const subscription = typeof subscriptionRaw === 'object' && subscriptionRaw?.status
    ? subscriptionRaw
    : await retrieveStripeSubscription(subscriptionId);
  const existing = await readMemberRecord(customerId);
  const metadataUserId = normalizeUserId(session?.metadata?.user_id || subscription?.metadata?.user_id || session?.client_reference_id || '');
  const next = buildMemberRecordFromStripe({
    customerId,
    subscriptionId,
    subscriptionStatus: subscription?.status || '',
    customerEmail: session?.customer_details?.email || session?.customer_email || existing?.customerEmail || '',
    customerName: session?.customer_details?.name || existing?.customerName || '',
    checkoutSessionId: session?.id || '',
    currentPeriodEnd: unixToIso(subscription?.current_period_end),
    cancelAtPeriodEnd: !!subscription?.cancel_at_period_end,
    source: 'stripe',
  }, existing);
  await writeMemberRecord(customerId, next);
  if (metadataUserId) {
    const existingUser = await readUserRecord(metadataUserId);
    const nextUser = buildUserRecordFromStripe({
      userId: metadataUserId,
      customerId,
      subscriptionId,
      subscriptionStatus: subscription?.status || '',
      customerEmail: session?.customer_details?.email || session?.customer_email || existingUser?.email || '',
      customerName: session?.customer_details?.name || existingUser?.name || '',
      checkoutSessionId: session?.id || '',
      currentPeriodEnd: unixToIso(subscription?.current_period_end),
      cancelAtPeriodEnd: !!subscription?.cancel_at_period_end,
    }, existingUser);
    if (nextUser) await writeUserRecord(metadataUserId, nextUser);
  }
  return next;
}

async function updateMemberRecordFromStripeSubscription(subscription) {
  const customerId = String(subscription?.customer || '').trim();
  const subscriptionId = String(subscription?.id || '').trim();
  if (!customerId || !subscriptionId) return null;
  const existing = await readMemberRecord(customerId) || await findMemberRecordBySubscriptionId(subscriptionId);
  const metadataUserId = normalizeUserId(subscription?.metadata?.user_id || '');
  const next = buildMemberRecordFromStripe({
    customerId,
    subscriptionId,
    subscriptionStatus: subscription?.status || '',
    currentPeriodEnd: unixToIso(subscription?.current_period_end),
    cancelAtPeriodEnd: !!subscription?.cancel_at_period_end,
    source: 'stripe',
  }, existing);
  await writeMemberRecord(customerId, next);
  const userId = metadataUserId || (await findUserRecordByStripeCustomerId(customerId))?.userId || (await findUserRecordByStripeSubscriptionId(subscriptionId))?.userId || '';
  if (userId) {
    const existingUser = await readUserRecord(userId);
    const nextUser = buildUserRecordFromStripe({
      userId,
      customerId,
      subscriptionId,
      subscriptionStatus: subscription?.status || '',
      currentPeriodEnd: unixToIso(subscription?.current_period_end),
      cancelAtPeriodEnd: !!subscription?.cancel_at_period_end,
      customerEmail: existingUser?.email || next?.customerEmail || '',
      customerName: existingUser?.name || next?.customerName || '',
    }, existingUser);
    if (nextUser) await writeUserRecord(userId, nextUser);
  }
  return next;
}

function parseStripeSignatureHeader(header) {
  return String(header || '').split(',').reduce((acc, part) => {
    const [key, value] = String(part || '').split('=');
    if (!key || !value) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(value);
    return acc;
  }, {});
}

function verifyStripeWebhookSignature(rawBody, signatureHeader) {
  if (!STRIPE_WEBHOOK_SECRET) return false;
  const parsed = parseStripeSignatureHeader(signatureHeader);
  const timestamp = Number(parsed?.t?.[0]);
  const signatures = parsed?.v1 || [];
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > STRIPE_WEBHOOK_TOLERANCE_SEC) return false;
  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(payload).digest('hex');
  return signatures.some(value => safeCompareText(value, expected));
}

async function markStripeEventHandled(eventId) {
  if (!eventId) return;
  await ensureDir(STRIPE_EVENT_DIR);
  await fsp.writeFile(path.join(STRIPE_EVENT_DIR, `${eventId}.json`), JSON.stringify({ id: eventId, handledAt: new Date().toISOString() }), 'utf8');
}

async function stripeEventAlreadyHandled(eventId) {
  if (!eventId) return false;
  try {
    await fsp.access(path.join(STRIPE_EVENT_DIR, `${eventId}.json`));
    return true;
  } catch (_error) {
    return false;
  }
}

function getStripeCheckoutCompletionPath(sessionId) {
  const safeId = String(sessionId || '').trim();
  if (!safeId || safeId.length > 240) return '';
  return path.join(STRIPE_CHECKOUT_COMPLETION_DIR, `${toBase64Url(safeId)}.json`);
}

async function stripeCheckoutSessionAlreadyCompleted(sessionId) {
  const filePath = getStripeCheckoutCompletionPath(sessionId);
  if (!filePath) return false;
  try {
    await fsp.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function markStripeCheckoutSessionCompleted(sessionId, meta = {}) {
  const filePath = getStripeCheckoutCompletionPath(sessionId);
  if (!filePath) return false;
  await ensureDir(STRIPE_CHECKOUT_COMPLETION_DIR);
  const payload = {
    id: String(sessionId || '').trim(),
    handledAt: new Date().toISOString(),
    userId: normalizeUserId(meta.userId || ''),
    stripeCustomerId: String(meta.stripeCustomerId || '').trim(),
    stripeSubscriptionId: String(meta.stripeSubscriptionId || '').trim(),
  };
  try {
    await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (error) {
    if (error && error.code === 'EEXIST') return false;
    throw error;
  }
}

function extractOpenAIText(data) {
  if (!data) return '';
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text;
  const outputs = Array.isArray(data.output) ? data.output : [];
  const chunks = [];
  outputs.forEach(item => {
    const contents = Array.isArray(item?.content) ? item.content : [];
    contents.forEach(content => {
      const value = content?.text || content?.output_text || '';
      if (value) chunks.push(value);
    });
  });
  return chunks.join('\n').trim();
}

function normalizeSuccess(provider, model, text, raw) {
  return {
    provider,
    model,
    content: [{ text: text || '' }],
    raw,
  };
}

function extractAnthropicText(data) {
  const contents = Array.isArray(data?.content) ? data.content : [];
  return contents
    .filter(item => item?.type === 'text' && typeof item?.text === 'string')
    .map(item => item.text)
    .join('\n')
    .trim();
}

async function callAnthropic(payload) {
  if (!ANTHROPIC_KEY_CONFIGURED) {
    throw Object.assign(new Error('ANTHROPIC_API_KEY_MISSING'), { statusCode: 500 });
  }

  const firstMessage = payload.messages[0];
  const messageContent = [];
  if (payload.images?.length) {
    for (const image of payload.images) {
      const asset = await readLocalImageAsset(image.path);
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: asset.mime,
          data: asset.base64,
        },
      });
      if (image.label) {
        messageContent.push({
          type: 'text',
          text: `Image label: ${image.label}`,
        });
      }
    }
  }
  if (firstMessage?.content) {
    messageContent.push({ type: 'text', text: firstMessage.content });
  }

  const upstream = await makeHttpsRequest(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    },
    {
      model: payload.model,
      max_tokens: payload.max_tokens,
      system: payload.system,
      messages: [
        {
          role: firstMessage?.role || 'user',
          content: messageContent.length ? messageContent : [{ type: 'text', text: firstMessage?.content || '' }],
        },
        ...payload.messages.slice(1).map(message => ({
          role: message.role,
          content: [{ type: 'text', text: message.content }],
        })),
      ],
    }
  );

  let parsed = null;
  try {
    parsed = JSON.parse(upstream.body || '{}');
  } catch (_error) {}

  if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
    const error = new Error(parsed?.error?.message || parsed?.message || 'Anthropic API request failed.');
    error.code = 'ANTHROPIC_UPSTREAM_ERROR';
    error.statusCode = 502;
    error.provider = 'anthropic';
    error.upstreamStatus = upstream.statusCode;
    throw error;
  }

  const text = extractAnthropicText(parsed);
  return normalizeSuccess('anthropic', payload.model, text, parsed);
}

async function callOpenAI(payload) {
  if (!OPENAI_KEY_CONFIGURED) {
    throw Object.assign(new Error('OPENAI_API_KEY_MISSING'), { statusCode: 500 });
  }

  const firstMessage = payload.messages[0];
  const inputContent = [];
  if (firstMessage?.content) {
    inputContent.push({ type: 'input_text', text: firstMessage.content });
  }
  if (payload.images?.length) {
    for (const image of payload.images) {
      const imageUrl = await readLocalImageAsDataUrl(image.path);
      inputContent.push({
        type: 'input_image',
        image_url: imageUrl,
        detail: image.detail || 'low',
      });
      if (image.label) {
        inputContent.push({
          type: 'input_text',
          text: `Image label: ${image.label}`,
        });
      }
    }
  }

  const upstreamPayload = {
    model: payload.model,
    input: [
      {
        role: firstMessage?.role || 'user',
        content: inputContent,
      },
      ...payload.messages.slice(1).map(message => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }],
      })),
    ],
    max_output_tokens: payload.max_tokens,
  };

  if (payload.system) {
    upstreamPayload.instructions = payload.system;
  }

  if (payload.reasoning_effort) {
    upstreamPayload.reasoning = { effort: payload.reasoning_effort };
  }

  const upstream = await makeHttpsRequest(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    },
    upstreamPayload
  );

  let parsed = null;
  try {
    parsed = JSON.parse(upstream.body || '{}');
  } catch (_error) {}

  if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
    const error = new Error(parsed?.error?.message || parsed?.message || 'OpenAI API request failed.');
    error.code = 'OPENAI_UPSTREAM_ERROR';
    error.statusCode = 502;
    error.provider = 'openai';
    error.upstreamStatus = upstream.statusCode;
    throw error;
  }

  const text = extractOpenAIText(parsed);
  return normalizeSuccess('openai', payload.model, text, parsed);
}

async function handleAiProxy(req, res) {
  const rate = consumeRateLimit(req, 'ai');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'AI request limit reached. Please wait and retry.');
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const statusCode = error.message === 'BODY_TOO_LARGE' ? 413 : 400;
    sendJson(res, statusCode, {
      error: error.message,
      message: 'Request body could not be parsed.',
    });
    return;
  }

  let payload;
  try {
    payload = sanitizePayload(body);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message,
      message: 'Invalid AI payload.',
    });
    return;
  }

  const dailyQuota = await consumeFreeAiDailyQuota(req, payload);
  if (!dailyQuota.ok) {
    sendJson(res, 429, {
      error: 'FREE_DAILY_QUOTA_EXCEEDED',
      limit: dailyQuota.limit,
      message: 'Free reading daily usage limit reached. Please retry later.',
    });
    return;
  }

  if (isPaidModel(payload.model) && !(await hasPaidAccess(req, payload))) {
    sendJson(res, 403, {
      error: isLocalRequest(req) ? 'PAID_SESSION_REQUIRED' : 'PAID_AUTH_REQUIRED',
      provider: payload.provider,
      model: payload.model,
      localTestMode: isLocalRequest(req),
      message: isLocalRequest(req)
        ? 'Local paid testing requires a signed preview session first.'
        : 'Paid access requires a valid paid reading ticket.',
    });
    return;
  }

  const startedAt = Date.now();
  const memberSession = readMemberSession(req);
  // writeAiEventLog catches its own write errors, so AI logging never blocks a reading.
  await writeAiEventLog({
    ...buildAiLogBase(payload, 'ai_request'),
    tokens_in_est: estimateInputTokens(payload),
  });
  try {
    const data = payload.provider === 'openai'
      ? await callOpenAI(payload)
      : await callAnthropic(payload);
    const usageMetrics = extractUsageMetrics(payload.provider, data?.raw);
    await writeAiEventLog({
      ...buildAiLogBase(payload, 'ai_complete'),
      latency_ms: Date.now() - startedAt,
      tokens_in: usageMetrics.inputTokens || 0,
      tokens_out: usageMetrics.outputTokens || 0,
    });
    try {
      await restoreFreeAiDailyQuotaFromPaid(req, payload);
    } catch (_error) {}
    try {
      await writeAiUsageLog({
        at: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        provider: payload.provider,
        model: payload.model,
        taskKey: payload.task_key || '',
        plan: payload.plan || '',
        maxTokens: payload.max_tokens,
        imageCount: Array.isArray(payload.images) ? payload.images.length : 0,
        memberSource: memberSession?.source || '',
        abTest: payload.ab_test || null,
        ...usageMetrics,
        ok: true,
      });
    } catch (_error) {}
    sendJson(res, 200, data);
  } catch (error) {
    console.error('[AI proxy] request failed', {
      provider: payload.provider,
      model: payload.model,
      taskKey: payload.task_key || '',
      plan: payload.plan || '',
      error: error.code || error.message || 'AI_PROXY_ERROR',
      upstreamStatus: error.upstreamStatus || 0,
      durationMs: Date.now() - startedAt,
    });
    await writeAiEventLog({
      ...buildAiLogBase(payload, 'ai_error'),
      latency_ms: Date.now() - startedAt,
      error_type: String(error.code || error.message || 'AI_PROXY_ERROR').slice(0, 80),
    });
    try {
      await writeAiUsageLog({
        at: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        provider: payload.provider,
        model: payload.model,
        taskKey: payload.task_key || '',
        plan: payload.plan || '',
        maxTokens: payload.max_tokens,
        imageCount: Array.isArray(payload.images) ? payload.images.length : 0,
        memberSource: memberSession?.source || '',
        abTest: payload.ab_test || null,
        ok: false,
        error: error.code || error.message || 'AI_PROXY_ERROR',
        upstreamStatus: error.upstreamStatus || 0,
      });
    } catch (_error) {}
    const missingKey = error.message === 'ANTHROPIC_API_KEY_MISSING' || error.message === 'OPENAI_API_KEY_MISSING';
    sendJson(res, error.statusCode || 502, {
      error: missingKey ? error.message : (error.code || 'AI_PROXY_ERROR'),
      provider: error.provider || payload.provider,
      status: error.upstreamStatus || undefined,
      message: missingKey
        ? `Server-side ${error.message.replace('_MISSING', '')} is not configured.`
        : (error.message || 'AI provider request failed.'),
    });
  }
}

async function handleVaultQuery(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Vault query payload could not be parsed.',
    });
    return;
  }

  const vaultContext = await resolveVaultContext(req, body?.identity);
  if (!vaultContext?.vaultKey) {
    sendJson(res, 400, {
      error: 'IDENTITY_REQUIRED',
      message: 'Vault identity or an active Google session is required.',
    });
    return;
  }

  const records = mergeVaultRecordLists(
    await readVaultRecords(vaultContext.vaultKey),
    vaultContext.legacyVaultKey ? await readVaultRecords(vaultContext.legacyVaultKey) : []
  );
  sendJson(res, 200, {
    ok: true,
    records,
    vaultMode: vaultContext.mode,
    userId: vaultContext.userId || '',
  });
}

async function handleVaultSave(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Vault save payload could not be parsed.',
    });
    return;
  }

  const vaultContext = await resolveVaultContext(req, body?.identity);
  if (!vaultContext?.vaultKey) {
    sendJson(res, 400, {
      error: 'IDENTITY_REQUIRED',
      message: 'Vault identity or an active Google session is required.',
    });
    return;
  }

  let record;
  try {
    record = sanitizeVaultRecord(body?.record);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_RECORD',
      message: 'Vault record is invalid.',
    });
    return;
  }

  const existingPrimary = await readVaultRecords(vaultContext.vaultKey);
  const existingLegacy = vaultContext.legacyVaultKey ? await readVaultRecords(vaultContext.legacyVaultKey) : [];
  const mergedBase = mergeVaultRecordLists(existingPrimary, existingLegacy);
  const merged = mergeVaultRecord(mergedBase, record);
  await writeVaultRecords(vaultContext.vaultKey, merged);
  sendJson(res, 200, {
    ok: true,
    count: merged.length,
    vaultMode: vaultContext.mode,
    userId: vaultContext.userId || '',
  });
}

async function handleVaultClear(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Vault clear payload could not be parsed.',
    });
    return;
  }

  const vaultContext = await resolveVaultContext(req, body?.identity);
  if (!vaultContext?.vaultKey) {
    sendJson(res, 400, {
      error: 'IDENTITY_REQUIRED',
      message: 'Vault identity or an active Google session is required.',
    });
    return;
  }

  const filePaths = [
    getVaultFilePath(vaultContext.vaultKey),
    vaultContext.legacyVaultKey ? getVaultFilePath(vaultContext.legacyVaultKey) : '',
  ].filter(Boolean);
  for (const filePath of filePaths) {
    try {
      await fsp.unlink(filePath);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  sendJson(res, 200, {
    ok: true,
    vaultMode: vaultContext.mode,
    userId: vaultContext.userId || '',
  });
}

async function runProviderProbe(provider) {
  if (provider === 'openai') {
    if (!OPENAI_KEY_CONFIGURED) {
      return { configured: false, ok: false, message: 'OPENAI_API_KEY missing' };
    }
    try {
      await callOpenAI({
        provider: 'openai',
        model: AI_MODELS.free,
        max_tokens: 16,
        system: 'Return OK only.',
        messages: [{ role: 'user', content: 'OK only.' }],
        images: [],
      });
      return { configured: true, ok: true, message: 'reachable', model: AI_MODELS.free };
    } catch (error) {
      return {
        configured: true,
        ok: false,
        message: error?.message || 'OpenAI probe failed.',
        status: error?.upstreamStatus || undefined,
        model: AI_MODELS.free,
      };
    }
  }

  if (!ANTHROPIC_KEY_CONFIGURED) {
    return { configured: false, ok: false, message: 'ANTHROPIC_API_KEY missing' };
  }
  try {
    await callAnthropic({
      provider: 'anthropic',
      model: AI_MODELS.paid,
      max_tokens: 16,
      system: 'Return OK only.',
      messages: [{ role: 'user', content: 'OK only.' }],
      images: [],
    });
    return { configured: true, ok: true, message: 'reachable', model: AI_MODELS.paid };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      message: error?.message || 'Anthropic probe failed.',
      status: error?.upstreamStatus || undefined,
      model: AI_MODELS.paid,
    };
  }
}

async function handleProviderCheck(req, res) {
  if (!isLocalRequest(req)) {
    sendJson(res, 403, {
      error: 'LOCAL_ONLY_ENDPOINT',
      message: 'Provider check is limited to local test runtime.',
    });
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const provider = url.searchParams.get('provider') || 'both';
  const openai = provider === 'both' || provider === 'openai'
    ? await runProviderProbe('openai')
    : null;
  const anthropic = provider === 'both' || provider === 'anthropic'
    ? await runProviderProbe('anthropic')
    : null;

  sendJson(res, 200, {
    ok: true,
    checkedAt: new Date().toISOString(),
    openai,
    anthropic,
  });
}

async function handleMemberStatus(req, res) {
  sendJson(res, 200, await buildMemberStatus(req));
}

async function handleMemberSession(req, res) {
  const rate = consumeRateLimit(req, 'member_session');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Too many member session requests. Please wait and retry.');
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Member session payload could not be parsed.',
    });
    return;
  }

  const mode = String(body?.mode || '').trim().toLowerCase();
  if (mode === 'local_preview') {
    if (!DEV_ACCESS_ENABLED) {
      sendJson(res, 403, {
        ok: false,
        error: 'DEV_ACCESS_DISABLED_IN_PRODUCTION',
        message: 'Development access is disabled in production.',
      });
      return;
    }
    if (!isLocalRequest(req)) {
      sendJson(res, 403, {
        error: 'LOCAL_ONLY_MEMBER_PREVIEW',
        message: 'Local preview sessions can only be issued from localhost.',
      });
      return;
    }
    const session = issueMemberSession(res, {
      source: 'local_preview',
      maxAgeSeconds: 3 * 24 * 60 * 60,
    });
    sendJson(res, 200, await buildMemberStatus(req, session));
    return;
  }

  if (mode === 'developer') {
    if (!DEV_ACCESS_ENABLED) {
      sendJson(res, 403, {
        ok: false,
        error: 'DEV_ACCESS_DISABLED_IN_PRODUCTION',
        message: 'Development access is disabled in production.',
      });
      return;
    }
    if (!isLocalRequest(req)) {
      sendJson(res, 403, {
        error: 'DEVELOPER_LOCAL_ONLY',
        message: 'Developer access can only be issued from localhost.',
      });
      return;
    }
    const developerEmail = String(body?.email || '').trim().toLowerCase();
    if (!developerEmail) {
      sendJson(res, 400, {
        error: 'DEVELOPER_EMAIL_REQUIRED',
        message: 'A developer email is required.',
      });
      return;
    }
    const userRecord = await ensureDeveloperUserRecord(developerEmail, body?.name || '');
    if (!userRecord?.userId) {
      sendJson(res, 403, {
        error: 'DEVELOPER_EMAIL_DENIED',
        message: 'This email is not allowed for developer access.',
      });
      return;
    }
    const authSession = issueAuthSession(res, {
      source: 'developer',
      claims: {
        userId: userRecord.userId,
        googleSub: userRecord.googleSub || userRecord.userId,
      },
    });
    sendJson(res, 200, await buildMemberStatus(req, {
      memberSession: readMemberSession(req),
      authSession,
    }));
    return;
  }

  const accessCode = String(body?.accessCode || '').trim();
  if (!DEV_ACCESS_ENABLED) {
    sendJson(res, 403, {
      ok: false,
      error: 'DEV_ACCESS_DISABLED_IN_PRODUCTION',
      message: 'Development access is disabled in production.',
    });
    return;
  }
  if (!accessCode) {
    sendJson(res, 400, {
      error: 'ACCESS_CODE_REQUIRED',
      message: 'An access code is required.',
    });
    return;
  }
  if (!MEMBER_ACCESS_CODES.size) {
    sendJson(res, 503, {
      error: 'ACCESS_CODE_DISABLED',
      message: 'No member access code is configured on the server.',
    });
    return;
  }

  const validCode = [...MEMBER_ACCESS_CODES].some(code => safeCompareText(code, accessCode));
  if (!validCode) {
    sendJson(res, 401, {
      error: 'ACCESS_CODE_INVALID',
      message: 'The access code was not accepted.',
    });
    return;
  }

  const session = issueMemberSession(res, {
    source: 'access_code',
    maxAgeSeconds: MEMBER_SESSION_DAYS * 24 * 60 * 60,
  });
  sendJson(res, 200, await buildMemberStatus(req, session));
}

async function handleMemberLogout(req, res) {
  clearAuthSession(res);
  clearMemberSession(res);
  sendJson(res, 200, await buildMemberStatus(req, {
    memberSession: null,
    authSession: null,
  }));
}

async function handleRashinCodeRedeem(req, res) {
  const rate = consumeRateLimit(req, 'rashin_code');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Too many code attempts. Please wait and retry.');
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Rashin code payload could not be parsed.',
    });
    return;
  }
  const rashinCode = String(body?.rashinCode || body?.rashin_code || '').trim();
  if (!/^\d{7}$/.test(rashinCode)) {
    sendJson(res, 400, {
      error: 'RASHIN_CODE_FORMAT_INVALID',
      message: 'A 7-digit Rashin code is required.',
    });
    return;
  }
  if (!RASHIN_ACCESS_CODES.size) {
    sendJson(res, 503, {
      error: 'RASHIN_CODE_DISABLED',
      message: 'Rashin code access is not configured on the server.',
    });
    return;
  }
  const validCode = [...RASHIN_ACCESS_CODES].some(code => safeCompareText(code, rashinCode));
  if (!validCode) {
    sendJson(res, 401, {
      error: 'RASHIN_CODE_INVALID',
      message: 'The Rashin code was not accepted.',
    });
    return;
  }
  const redeemResult = await writeRashinCodeRedeemRecordIfAbsent(rashinCode, {
    redeemedAt: new Date().toISOString(),
    expiresAt: addDaysIso(RASHIN_CODE_REUSE_DAYS),
    remoteAddress: getClientAddress(req),
    userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 300),
  });
  if (!redeemResult.created) {
    sendJson(res, 409, {
      error: 'RASHIN_CODE_ALREADY_USED',
      message: 'This Rashin code has already been used.',
    });
    return;
  }
  const session = issueMemberSession(res, {
    source: 'rashin_code',
    maxAgeSeconds: RASHIN_CODE_SESSION_DAYS * 24 * 60 * 60,
  });
  sendJson(res, 200, await buildMemberStatus(req, session));
}

async function handleClientLog(req, res) {
  const rate = consumeRateLimit(req, 'client_log');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Client log limit reached. Please wait and retry.');
    return;
  }
  if (!sameOriginRequest(req) && !isLocalRequest(req)) {
    sendJson(res, 403, {
      error: 'ORIGIN_NOT_ALLOWED',
      message: 'Client logs are limited to same-origin requests.',
    });
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Client log payload could not be parsed.',
    });
    return;
  }

  const authSession = readAuthSession(req);
  const memberSession = readMemberSession(req);
  const record = {
    at: new Date().toISOString(),
    level: clipText(body?.level || 'error', 16),
    type: clipText(body?.type || 'client', 48),
    message: clipText(body?.message || '', 400),
    stack: clipText(body?.stack || '', 1200),
    href: clipText(body?.href || '', 300),
    source: clipText(body?.source || '', 120),
    userId: authSession?.userId || '',
    memberSource: memberSession?.source || '',
    meta: body?.meta && typeof body.meta === 'object' ? body.meta : {},
  };

  try {
    await writeClientErrorLog(record);
  } catch (error) {
    sendJson(res, 500, {
      error: 'CLIENT_LOG_WRITE_FAILED',
      message: error.message || 'Client log could not be written.',
    });
    return;
  }

  sendJson(res, 200, { ok: true });
}

async function handleGoogleAuth(req, res) {
  const rate = consumeRateLimit(req, 'google_auth');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Too many Google sign-in requests. Please wait and retry.');
    return;
  }
  if (!sameOriginRequest(req)) {
    sendJson(res, 403, {
      error: 'ORIGIN_NOT_ALLOWED',
      message: 'Google login is limited to same-origin requests.',
    });
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Google login payload could not be parsed.',
    });
    return;
  }
  if (!GOOGLE_CLIENT_CONFIGURED) {
    sendJson(res, 503, {
      error: 'GOOGLE_CLIENT_ID_MISSING',
      message: 'Google login is not configured on the server.',
    });
    return;
  }
  try {
    const payload = await verifyGoogleIdToken(body?.credential);
    const profile = normalizeGoogleProfile(payload);
    if (!profile) {
      sendJson(res, 400, {
        error: 'GOOGLE_PROFILE_INVALID',
        message: 'Google profile is incomplete.',
      });
      return;
    }
    const existing = await readUserRecord(profile.userId) || await findUserRecordByGoogleSub(profile.googleSub);
    const next = buildUserRecordFromGoogleProfile(profile, existing);
    await writeUserRecord(profile.userId, next);
    const authSession = issueAuthSession(res, {
      source: 'google',
      claims: {
        userId: profile.userId,
        googleSub: profile.googleSub,
      },
    });
    sendJson(res, 200, await buildMemberStatus(req, {
      memberSession: readMemberSession(req),
      authSession,
    }));
  } catch (error) {
    sendJson(res, 401, {
      error: error.code || error.message || 'GOOGLE_AUTH_FAILED',
      message: 'Google sign-in could not be verified.',
    });
  }
}

async function handleRashinBonusStatus(req, res) {
  const userRecord = await readGoogleUserForRequest(req);
  if (!userRecord) {
    sendJson(res, 401, {
      error: 'LOGIN_REQUIRED',
      message: 'Google login is required.',
    });
    return;
  }
  sendJson(res, 200, buildRashinBonusView(userRecord));
}

async function handleRashinBonusClaim(req, res) {
  const userRecord = await readGoogleUserForRequest(req);
  if (!userRecord) {
    sendJson(res, 401, {
      error: 'LOGIN_REQUIRED',
      message: 'Google login is required.',
    });
    return;
  }
  const result = await withUserMutation(userRecord.userId, async userId => {
    const latest = await readUserRecord(userId);
    const today = getJstDateStamp();
    if (String(latest?.last_rashin_bonus_claimed_date || '') === today) {
      return {
        claimed: false,
        reason: 'already_claimed',
        ...buildRashinBonusView(latest, today),
      };
    }
    const now = new Date().toISOString();
    const next = {
      ...(latest || userRecord),
      rashin_stones: normalizeRashinStones(latest?.rashin_stones) + RASHIN_BONUS_REWARD_AMOUNT,
      last_rashin_bonus_claimed_date: today,
      updatedAt: now,
    };
    await writeUserRecord(userId, next);
    return {
      claimed: true,
      ...buildRashinBonusView(next, today),
    };
  });
  sendJson(res, 200, result);
}

async function handleRashinBonusRedeemPaidTicket(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Rashin fragment payload could not be parsed.',
    });
    return;
  }
  const userRecord = await readGoogleUserForRequest(req);
  if (!userRecord) {
    sendJson(res, 401, {
      error: 'LOGIN_REQUIRED',
      message: 'Google login is required.',
    });
    return;
  }
  const sourceReadingId = normalizeVaultRecordId(body?.sourceReadingId || body?.source_reading_id || body?.oracleResultId || body?.oracle_result_id || '');
  const paidReadingId = normalizeVaultRecordId(body?.paidReadingId || body?.paid_reading_id || '');
  const allowDirectPaid = body?.allowDirectPaid === true || body?.allow_direct_paid === true;
  try {
    const result = await createPaidTicketFromRashinFragments({ userRecord, sourceReadingId, paidReadingId, allowDirectPaid });
    sendJson(res, 200, {
      ok: true,
      consumed: !!result.consumed,
      ticketId: result.ticket.id,
      ticketStatus: result.ticket.status,
      sourceReadingId: result.ticket.sourceReadingId,
      paidReadingId: result.ticket.lockedReadingId || paidReadingId,
      normalAmount: result.ticket.originalAmount,
      discountAmount: result.ticket.discountAmount,
      finalAmount: result.ticket.finalAmount,
      discountStonesUsed: result.ticket.discountStonesUsed,
      currency: result.ticket.currency,
      rashinStones: normalizeRashinStones(result.userRecord?.rashin_stones),
      bonusStatus: buildRashinBonusView(result.userRecord),
    });
  } catch (error) {
    const messages = {
      READING_ID_REQUIRED: 'A source reading id and paid reading id are required.',
      ORACLE_RESULT_NOT_AVAILABLE: 'The source reading could not be found.',
      LATEST_RESULT_REQUIRED: 'Use this benefit from your latest free reading.',
      ORACLE_RESULT_EXPIRED: 'This free reading is no longer eligible.',
      DEEP_READING_ALREADY_PURCHASED: 'This reading already has a deep reading ticket.',
      RASHIN_FRAGMENTS_INSUFFICIENT: 'Not enough Rashin fragments.',
    };
    if (error.statusCode) {
      sendJson(res, error.statusCode, {
        error: error.message,
        message: messages[error.message] || 'The request could not be completed. Please wait and try again.',
        requiredStones: RASHIN_BONUS_FREE_READING_REQUIRED_STONES,
        rashinStones: normalizeRashinStones(error.rashinStones),
      });
      return;
    }
    console.error('Rashin fragment paid ticket redeem failed', {
      error: error.message,
      stack: error.stack,
      userId: userRecord?.userId || '',
      sourceReadingId,
      paidReadingId,
    });
    sendJson(res, 500, {
      error: 'RASHIN_FRAGMENTS_REDEEM_FAILED',
      message: 'The request could not be completed. Please wait and try again.',
    });
  }
}

async function handleDeepReadingDiscountStatus(req, res) {
  const userRecord = await readGoogleUserForRequest(req);
  if (!userRecord) {
    sendJson(res, 401, {
      error: 'LOGIN_REQUIRED',
      message: 'Google login is required.',
      eligible: false,
      normalAmount: DEEP_READING_NORMAL_AMOUNT,
      finalAmount: DEEP_READING_NORMAL_AMOUNT,
    });
    return;
  }
  const url = new URL(req.url, makeAbsoluteUrl(req, '/'));
  const resultId = normalizeVaultRecordId(url.searchParams.get('resultId') || url.searchParams.get('oracleResultId') || '');
  const status = await getRashinDiscountEligibility(userRecord, resultId);
  sendJson(res, 200, status);
}

async function handleRashinPaidCodePurchaseIntent(req, res) {
  const rate = consumeRateLimit(req, 'rashin_code_purchase');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Too many code purchase attempts. Please wait and retry.');
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Rashin paid code purchase payload could not be parsed.',
    });
    return;
  }
  const userRecord = await readGoogleUserForRequest(req);
  if (!userRecord) {
    sendJson(res, 401, {
      error: 'GOOGLE_LOGIN_REQUIRED',
      message: 'Google login is required before claiming BOOTH purchase.',
    });
    return;
  }
  const intent = String(body?.intent || '').trim() || 'upgrade-paid';
  const sourceReadingId = normalizeVaultRecordId(
    body?.sourceReadingId || body?.source_reading_id || body?.oracleResultId || body?.oracle_result_id || ''
  );
  if (BOOTH_GMAIL_VERIFICATION_REQUIRED && !boothGmailVerificationConfigured()) {
    sendJson(res, 503, {
      error: 'BOOTH_GMAIL_NOT_CONFIGURED',
      message: 'BOOTH Gmail verification is not configured.',
    });
    return;
  }
  try {
    const order = await createRashinCodePurchaseOrderForBooth({ userRecord, sourceReadingId, intent });
    sendJson(res, 200, {
      ok: true,
      purchaseOrderId: order.id,
      sourceReadingId: order.sourceReadingId,
      status: order.status,
      normalAmount: order.originalAmount,
      discountAmount: order.discountAmount,
      finalAmount: order.finalAmount,
      currency: order.currency,
      booth: getBoothPaymentPayload(),
      paymentClaimPath: '/api/rashin-paid-code/booth/claim',
    });
  } catch (error) {
    console.error('BOOTH purchase order preparation failed', {
      error: error.message,
      stack: error.stack,
      userId: userRecord?.userId || '',
      sourceReadingId,
    });
    sendJson(res, error.statusCode || 500, {
      error: error.publicCode || 'BOOTH_PURCHASE_PREPARE_FAILED',
      message: 'The request could not be completed. Please wait and try again.',
    });
  }
}

async function handleRashinPaidCodeRedeem(req, res) {
  const rate = consumeRateLimit(req, 'rashin_paid_code');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Too many code attempts. Please wait and retry.');
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Rashin paid code payload could not be parsed.',
    });
    return;
  }
  const code = normalizeRashinPaidCode(body?.code || body?.rashinCode || body?.rashin_code || '');
  const sourceReadingId = normalizeVaultRecordId(body?.sourceReadingId || body?.source_reading_id || body?.oracleResultId || body?.oracle_result_id || '');
  if (!/^[A-Z0-9]{12}$/.test(code)) {
    sendJson(res, 400, {
      error: 'RASHIN_PAID_CODE_FORMAT_INVALID',
      message: 'A 12-character Rashin paid code is required.',
    });
    return;
  }
  if (!sourceReadingId) {
    sendJson(res, 400, {
      error: 'SOURCE_READING_REQUIRED',
      message: 'A source reading id is required before redeeming a Rashin paid code.',
    });
    return;
  }
  const userRecord = await readGoogleUserForRequest(req);
  if (!userRecord) {
    sendJson(res, 401, {
      error: 'GOOGLE_LOGIN_REQUIRED',
      message: 'Google login is required before redeeming a Rashin paid code.',
    });
    return;
  }
  try {
    const codeHash = getRashinPaidCodeHash(code);
    const result = await withRashinPaidCodeMutation(codeHash, async () => {
      if (isConfiguredReusableRashinPaidCode(code)) {
        const codeRecord = createReusableRashinPaidCodeRecord({ code, userRecord, sourceReadingId });
        const owner = { ownerType: 'user', userId: userRecord.userId, vaultId: '' };
        const ticket = await createPaidTicketFromRashinPaidCode({ codeRecord, owner, sourceReadingId });
        return { ticket, reusable: true };
      }
      let codeRecord = await readRashinPaidCodeRecordByHash(codeHash);
      if (!codeRecord) {
        if (!isConfiguredFreeRashinPaidCode(code)) {
          const error = new Error('RASHIN_PAID_CODE_INVALID');
          error.statusCode = 404;
          throw error;
        }
        codeRecord = createFreeRashinPaidCodeRecord({ code, userRecord, sourceReadingId });
        await writeRashinPaidCodeRecord(codeRecord);
      }
      if (codeRecord.status !== 'issued' || codeRecord.redeemedAt || isExpiredIso(codeRecord.expiresAt)) {
        const error = new Error('RASHIN_PAID_CODE_ALREADY_USED');
        error.statusCode = 409;
        throw error;
      }
      const userEmailHash = hashPrivateLookupValue('email', userRecord.email || '');
      if (codeRecord.recipientEmailHash && codeRecord.recipientEmailHash !== userEmailHash) {
        const error = new Error('RASHIN_PAID_CODE_RECIPIENT_MISMATCH');
        error.statusCode = 403;
        throw error;
      }
      if (codeRecord.sourceReadingId && codeRecord.sourceReadingId !== sourceReadingId) {
        const error = new Error('RASHIN_PAID_CODE_SOURCE_MISMATCH');
        error.statusCode = 403;
        throw error;
      }
      const owner = { ownerType: 'user', userId: userRecord.userId, vaultId: '' };
      const ticket = await createPaidTicketFromRashinPaidCode({ codeRecord, owner, sourceReadingId });
      const now = new Date().toISOString();
      await writeRashinPaidCodeRecord({
        ...codeRecord,
        status: 'redeemed',
        redeemedAt: now,
        redeemedByUserId: userRecord.userId,
        redeemedSourceReadingId: sourceReadingId,
        paidReadingTicketId: ticket.id,
        updatedAt: now,
      });
      return { ticket };
    });
    sendJson(res, 200, {
      ok: true,
      ticketId: result.ticket.id,
      ticketStatus: result.ticket.status,
      sourceReadingId: result.ticket.sourceReadingId,
      normalAmount: result.ticket.originalAmount,
      discountAmount: result.ticket.discountAmount,
      finalAmount: result.ticket.finalAmount,
      currency: result.ticket.currency,
    });
  } catch (error) {
    if (error.statusCode) {
      const messages = {
        RASHIN_PAID_CODE_INVALID: 'The Rashin paid code was not accepted.',
        RASHIN_PAID_CODE_ALREADY_USED: 'This Rashin paid code is no longer usable.',
        RASHIN_PAID_CODE_RECIPIENT_MISMATCH: 'This Rashin paid code belongs to a different Google account.',
        RASHIN_PAID_CODE_SOURCE_MISMATCH: 'This Rashin paid code is for a different reading.',
      };
      sendJson(res, error.statusCode, {
        error: error.message,
        message: messages[error.message] || 'The request could not be completed. Please wait and try again.',
      });
      return;
    }
    console.error('Rashin paid code redeem failed', {
      error: error.message,
      stack: error.stack,
      userId: userRecord?.userId || '',
      sourceReadingId,
    });
    sendJson(res, 500, {
      error: 'RASHIN_PAID_CODE_REDEEM_FAILED',
      message: 'The request could not be completed. Please wait and try again.',
    });
  }
}

async function handleRashinPaidCodeAdminIssue(req, res) {
  const rate = consumeRateLimit(req, 'rashin_code_admin');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Too many admin issue attempts. Please wait and retry.');
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Rashin paid code admin payload could not be parsed.',
    });
    return;
  }
  const providedSecret = normalizeEnvValue(req.headers['x-rashin-admin-secret'] || body?.adminSecret || body?.admin_secret || '');
  if (!isConfiguredAppSecret(RASHIN_CODE_ADMIN_SECRET) || !safeCompareText(providedSecret, RASHIN_CODE_ADMIN_SECRET)) {
    sendJson(res, 403, {
      error: 'RASHIN_CODE_ADMIN_DENIED',
      message: 'Admin secret was not accepted.',
    });
    return;
  }
  const purchaseOrderId = normalizePurchaseOrderId(body?.purchaseOrderId || body?.purchase_order_id || '');
  const providerPaymentId = normalizeBoothOrderReference(
    body?.boothOrderNumber || body?.booth_order_number || body?.boothOrderId || body?.booth_order_id || body?.providerPaymentId || ''
  );
  if (!purchaseOrderId) {
    sendJson(res, 400, {
      error: 'PURCHASE_ORDER_REQUIRED',
      message: 'A purchase order id is required.',
    });
    return;
  }
  try {
    const result = await withPurchaseOrderMutation(purchaseOrderId, async safeOrderId => {
      const order = await readPurchaseOrder(safeOrderId);
      if (!order) {
        const error = new Error('PURCHASE_ORDER_NOT_FOUND');
        error.statusCode = 404;
        throw error;
      }
      const userRecord = order.userId ? await readUserRecord(order.userId) : null;
      if (!userRecord?.userId) {
        const error = new Error('GOOGLE_LOGIN_REQUIRED');
        error.statusCode = 409;
        throw error;
      }
      if (isExpiredIso(order.expiresAt)) {
        const error = new Error('PURCHASE_ORDER_EXPIRED');
        error.statusCode = 410;
        throw error;
      }
      return completeBoothOrderWithTicket({
        order,
        userRecord,
        providerPaymentId,
        issuedBy: 'admin_confirmed_booth',
      });
    });
    sendJson(res, 200, {
      ok: true,
      purchaseOrderId: result.order.id,
      sourceReadingId: result.order.sourceReadingId,
      ticketId: result.ticket.id,
      ticketStatus: result.ticket.status,
      normalAmount: result.ticket.originalAmount,
      discountAmount: result.ticket.discountAmount,
      finalAmount: result.ticket.finalAmount,
      currency: result.ticket.currency,
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || 'RASHIN_CODE_ADMIN_ISSUE_FAILED',
      message: 'The request could not be completed. Please wait and try again.',
    });
  }
}

async function handleBoothGmailVerificationTest(req, res) {
  const rate = consumeRateLimit(req, 'rashin_code_admin');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Too many admin verification attempts. Please wait and retry.');
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'BOOTH Gmail verification payload could not be parsed.',
    });
    return;
  }
  const providedSecret = normalizeEnvValue(req.headers['x-rashin-admin-secret'] || body?.adminSecret || body?.admin_secret || '');
  if (!isConfiguredAppSecret(RASHIN_CODE_ADMIN_SECRET) || !safeCompareText(providedSecret, RASHIN_CODE_ADMIN_SECRET)) {
    sendJson(res, 403, {
      error: 'RASHIN_CODE_ADMIN_DENIED',
      message: 'Admin secret was not accepted.',
    });
    return;
  }
  const providerPaymentId = normalizeBoothOrderReference(
    body?.boothOrderNumber || body?.booth_order_number || body?.boothOrderId || body?.booth_order_id || body?.providerPaymentId || body?.paymentReference || ''
  );
  if (providerPaymentId.length < 3) {
    sendJson(res, 400, {
      error: 'BOOTH_ORDER_REFERENCE_REQUIRED',
      message: 'BOOTH order number is required.',
    });
    return;
  }
  if (!isPlausibleBoothOrderReference(providerPaymentId)) {
    sendJson(res, 400, {
      error: 'BOOTH_ORDER_REFERENCE_INVALID',
      message: 'A real BOOTH order number is required.',
    });
    return;
  }
  try {
    const result = await verifyBoothOrderReferenceWithGmail(providerPaymentId, {
      userRecord: { email: normalizeCustomerEmail(body?.email || body?.buyerEmail || body?.buyer_email || '') },
    });
    sendJson(res, 200, {
      ok: true,
      verified: result.verified,
      skipped: !!result.skipped,
      matchCount: result.matchCount || 0,
      queryHash: result.queryHash || '',
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || 'BOOTH_GMAIL_VERIFY_FAILED',
      message: 'BOOTH Gmail verification could not be completed.',
      diagnostic: error.diagnostic || undefined,
      verification: error.verification || undefined,
    });
  }
}

async function handleBoothOrderClaim(req, res) {
  const rate = consumeRateLimit(req, 'booth_order_claim');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Too many BOOTH claim attempts. Please wait and retry.');
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'BOOTH order claim payload could not be parsed.',
    });
    return;
  }
  const userRecord = await readGoogleUserForRequest(req);
  if (!userRecord) {
    sendJson(res, 401, {
      error: 'GOOGLE_LOGIN_REQUIRED',
      message: 'Google login is required before claiming BOOTH purchase.',
    });
    return;
  }
  const purchaseOrderId = normalizePurchaseOrderId(body?.purchaseOrderId || body?.purchase_order_id || '');
  const sourceReadingId = normalizeVaultRecordId(body?.sourceReadingId || body?.source_reading_id || body?.oracleResultId || '');
  const providerPaymentId = normalizeBoothOrderReference(
    body?.boothOrderNumber || body?.booth_order_number || body?.boothOrderId || body?.booth_order_id || body?.providerPaymentId || body?.paymentReference || ''
  );
  if (!purchaseOrderId) {
    sendJson(res, 400, {
      error: 'PURCHASE_ORDER_REQUIRED',
      message: 'A purchase order id is required.',
    });
    return;
  }
  if (providerPaymentId.length < 3) {
    sendJson(res, 400, {
      error: 'BOOTH_ORDER_REFERENCE_REQUIRED',
      message: 'BOOTH order number is required.',
    });
    return;
  }
  if (!isPlausibleBoothOrderReference(providerPaymentId)) {
    sendJson(res, 400, {
      error: 'BOOTH_ORDER_REFERENCE_INVALID',
      message: 'A real BOOTH order number is required.',
    });
    return;
  }
  try {
    const result = await withPurchaseOrderMutation(purchaseOrderId, async safeOrderId => {
      const order = await readPurchaseOrder(safeOrderId);
      if (!order) {
        const error = new Error('PURCHASE_ORDER_NOT_FOUND');
        error.statusCode = 404;
        throw error;
      }
      if (order.ownerType !== 'user' || order.userId !== userRecord.userId) {
        const error = new Error('PURCHASE_ORDER_OWNER_MISMATCH');
        error.statusCode = 403;
        throw error;
      }
      if (sourceReadingId && order.sourceReadingId !== sourceReadingId) {
        const error = new Error('SOURCE_READING_MISMATCH');
        error.statusCode = 403;
        throw error;
      }
      if (isExpiredIso(order.expiresAt)) {
        const error = new Error('PURCHASE_ORDER_EXPIRED');
        error.statusCode = 410;
        throw error;
      }
      if (order.paidReadingTicketId) {
        const existingTicket = await readPaidReadingTicket(order.paidReadingTicketId);
        if (existingTicket) return { pending: false, order, ticket: existingTicket };
      }
      const duplicateOrder = await findPurchaseOrderByProviderPaymentId('booth', providerPaymentId, order.id);
      if (duplicateOrder) {
        const error = new Error('BOOTH_ORDER_ALREADY_USED');
        error.statusCode = 409;
        throw error;
      }
      const gmailVerification = await verifyBoothOrderReferenceWithGmail(providerPaymentId, { userRecord });
      const now = new Date().toISOString();
      const completed = await completeBoothOrderWithTicket({
        order: {
          ...order,
          providerPaymentId,
          paymentClaimedAt: order.paymentClaimedAt || now,
          boothGmailVerifiedAt: gmailVerification.skipped ? '' : now,
          boothGmailMatchCount: gmailVerification.matchCount || 0,
          boothGmailQueryHash: gmailVerification.queryHash || '',
        },
        userRecord,
        providerPaymentId,
        issuedBy: 'booth_order_claim',
      });
      return { pending: false, ...completed };
    });
    sendJson(res, 200, {
      ok: true,
      purchaseOrderId: result.order.id,
      sourceReadingId: result.order.sourceReadingId,
      ticketId: result.ticket.id,
      ticketStatus: result.ticket.status,
      normalAmount: result.ticket.originalAmount,
      discountAmount: result.ticket.discountAmount,
      finalAmount: result.ticket.finalAmount,
      currency: result.ticket.currency,
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || 'BOOTH_ORDER_CLAIM_FAILED',
      message: 'The request could not be completed. Please wait and try again.',
    });
  }
}

async function handlePaidReadingTicketPrepare(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Paid reading ticket payload could not be parsed.',
    });
    return;
  }
  const sourceReadingId = normalizeVaultRecordId(body?.sourceReadingId || body?.source_reading_id || '');
  const paidReadingId = normalizeVaultRecordId(body?.paidReadingId || body?.paid_reading_id || '');
  if (!sourceReadingId || !paidReadingId) {
    sendJson(res, 400, {
      error: 'READING_ID_REQUIRED',
      message: 'A source reading id and paid reading id are required.',
    });
    return;
  }
  const owner = await resolvePurchaseOwner(req, body?.identity);
  if (!owner) {
    sendJson(res, 400, {
      error: 'OWNER_REQUIRED',
      message: 'A signed-in user or vault identity is required.',
    });
    return;
  }
  const ticket = await findUsablePaidReadingTicket({ owner, sourceReadingId, paidReadingId });
  if (!ticket) {
    sendJson(res, 403, {
      error: 'PAID_TICKET_REQUIRED',
      message: 'A paid reading ticket is required for this result.',
    });
    return;
  }
  const locked = {
    ...ticket,
    lockedReadingId: paidReadingId,
    lockedAt: ticket.lockedAt || new Date().toISOString(),
  };
  await writePaidReadingTicket(locked);
  sendJson(res, 200, {
    ok: true,
    ticketId: locked.id,
    sourceReadingId: locked.sourceReadingId,
    paidReadingId: locked.lockedReadingId,
    ticketStatus: locked.status,
    normalAmount: locked.originalAmount,
    discountAmount: locked.discountAmount,
    finalAmount: locked.finalAmount,
    discountStonesUsed: locked.discountStonesUsed,
    discountType: locked.discountType || '',
  });
}

async function handlePaidReadingTicketUse(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Paid reading ticket payload could not be parsed.',
    });
    return;
  }
  const ticketId = normalizePaidTicketId(body?.ticketId || body?.paid_ticket_id || '');
  const sourceReadingId = normalizeVaultRecordId(body?.sourceReadingId || body?.source_reading_id || '');
  const paidReadingId = normalizeVaultRecordId(body?.paidReadingId || body?.paid_reading_id || '');
  const ticket = await readPaidReadingTicket(ticketId);
  if (!ticket || ticket.sourceReadingId !== sourceReadingId || ticket.lockedReadingId !== paidReadingId) {
    sendJson(res, 403, {
      error: 'PAID_TICKET_INVALID',
      message: 'The paid reading ticket could not be used for this result.',
    });
    return;
  }
  const owner = await resolvePurchaseOwner(req, body?.identity);
  if (!ownerMatchesTicket(owner, ticket)) {
    sendJson(res, 403, {
      error: 'PAID_TICKET_OWNER_MISMATCH',
      message: 'The paid reading ticket does not belong to this user.',
    });
    return;
  }
  if (ticket.status === 'used' && ticket.usedReadingId === paidReadingId) {
    sendJson(res, 200, { ok: true, ticketId: ticket.id, ticketStatus: ticket.status });
    return;
  }
  if (ticket.status !== 'unused' || isExpiredIso(ticket.expiresAt)) {
    sendJson(res, 409, {
      error: 'PAID_TICKET_NOT_USABLE',
      message: 'The paid reading ticket is no longer usable.',
    });
    return;
  }
  const used = {
    ...ticket,
    status: 'used',
    usedAt: new Date().toISOString(),
    usedReadingId: paidReadingId,
  };
  await writePaidReadingTicket(used);
  sendJson(res, 200, {
    ok: true,
    ticketId: used.id,
    ticketStatus: used.status,
  });
}

async function handlePaidReadingTicketRelease(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Paid reading ticket payload could not be parsed.',
    });
    return;
  }
  const ticketId = normalizePaidTicketId(body?.ticketId || body?.paid_ticket_id || '');
  const sourceReadingId = normalizeVaultRecordId(body?.sourceReadingId || body?.source_reading_id || '');
  const paidReadingId = normalizeVaultRecordId(body?.paidReadingId || body?.paid_reading_id || '');
  const ticket = await readPaidReadingTicket(ticketId);
  if (!ticket || ticket.sourceReadingId !== sourceReadingId || ticket.lockedReadingId !== paidReadingId) {
    sendJson(res, 403, {
      error: 'PAID_TICKET_INVALID',
      message: 'The paid reading ticket lock could not be released.',
    });
    return;
  }
  const owner = await resolvePurchaseOwner(req, body?.identity);
  if (!ownerMatchesTicket(owner, ticket)) {
    sendJson(res, 403, {
      error: 'PAID_TICKET_OWNER_MISMATCH',
      message: 'The paid reading ticket does not belong to this user.',
    });
    return;
  }
  if (ticket.status !== 'unused') {
    sendJson(res, 200, { ok: true, ticketId: ticket.id, ticketStatus: ticket.status });
    return;
  }
  const released = {
    ...ticket,
    lockedReadingId: '',
    lockedAt: '',
  };
  await writePaidReadingTicket(released);
  sendJson(res, 200, {
    ok: true,
    ticketId: released.id,
    ticketStatus: released.status,
  });
}

function buildStripeCheckoutUrls(req) {
  return {
    successUrl: makeAbsoluteUrl(req, STRIPE_SUCCESS_PATH),
    cancelUrl: makeAbsoluteUrl(req, STRIPE_CANCEL_PATH),
    portalReturnUrl: makeAbsoluteUrl(req, STRIPE_PORTAL_RETURN_PATH),
  };
}

async function handleStripeCheckoutSessionCreate(req, res) {
  const rate = consumeRateLimit(req, 'stripe_checkout');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Too many Stripe checkout attempts. Please wait and retry.');
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_JSON',
      message: 'Stripe checkout payload could not be parsed.',
    });
    return;
  }

  if (!stripeReady()) {
    sendJson(res, 503, {
      error: 'STRIPE_NOT_CONFIGURED',
      message: 'Stripe checkout is not configured on the server.',
    });
    return;
  }
  const authSession = readAuthSession(req);
  const userRecord = authSession?.userId ? await readUserRecord(authSession.userId) : null;
  const owner = await resolvePurchaseOwner(req, body?.identity);
  if (!owner) {
    sendJson(res, 400, {
      error: 'OWNER_REQUIRED',
      message: 'A signed-in user or vault identity is required before starting Stripe checkout.',
    });
    return;
  }
  const intent = String(body?.intent || '').trim() || 'upgrade-paid';
  let sourceReadingId = normalizeVaultRecordId(
    body?.oracleResultId || body?.oracle_result_id || body?.sourceReadingId || body?.source_reading_id || ''
  );
  if (!sourceReadingId && intent === 'start-paid') {
    sourceReadingId = generateRecordId('direct');
  }
  if (!sourceReadingId) {
    sendJson(res, 400, {
      error: 'SOURCE_READING_REQUIRED',
      message: 'A source reading id is required before starting Stripe checkout.',
    });
    return;
  }
  if (intent !== 'start-paid' && await hasDeepReadingPurchaseForSource(owner, sourceReadingId)) {
    sendJson(res, 409, {
      error: 'DEEP_READING_ALREADY_PURCHASED',
      message: 'This reading has already been purchased.',
    });
    return;
  }

  const urls = buildStripeCheckoutUrls(req);
  let purchaseOrder;
  try {
    if (intent !== 'start-paid' && owner.ownerType === 'user' && userRecord?.userId && authSession?.source === 'google') {
      purchaseOrder = await withUserMutation(userRecord.userId, async safeUserId => {
        const latestUser = await readUserRecord(safeUserId);
        const discountStatus = await getRashinDiscountEligibility(latestUser, sourceReadingId);
        if (['login_required', 'result_required', 'result_not_found'].includes(discountStatus.reason)) {
          const error = new Error('ORACLE_RESULT_NOT_AVAILABLE');
          error.statusCode = 403;
          error.publicCode = 'ORACLE_RESULT_NOT_AVAILABLE';
          throw error;
        }
        if (discountStatus.reason === 'already_purchased') {
          const error = new Error('DEEP_READING_ALREADY_PURCHASED');
          error.statusCode = 409;
          error.publicCode = 'DEEP_READING_ALREADY_PURCHASED';
          throw error;
        }
        if (discountStatus.eligible) {
          const openForResult = await findOpenRashinDiscountOrder({ userId: safeUserId, sourceReadingId });
          const openForUser = await findOpenRashinDiscountOrder({ userId: safeUserId });
          if (openForResult || openForUser) {
            const error = new Error('RASHIN_DISCOUNT_CHECKOUT_ALREADY_OPEN');
            error.statusCode = 409;
            error.publicCode = 'RASHIN_DISCOUNT_CHECKOUT_ALREADY_OPEN';
            throw error;
          }
          const orderId = generateRecordId('po');
          const lockAcquired = await acquireRashinDiscountCheckoutLock({
            userId: safeUserId,
            sourceReadingId,
            purchaseOrderId: orderId,
          });
          if (!lockAcquired) {
            const error = new Error('RASHIN_DISCOUNT_CHECKOUT_ALREADY_OPEN');
            error.statusCode = 409;
            error.publicCode = 'RASHIN_DISCOUNT_CHECKOUT_ALREADY_OPEN';
            throw error;
          }
          return createPurchaseOrder({
            owner,
            sourceReadingId,
            orderId,
            rashinDiscount: {
              discountAmount: discountStatus.discountAmount,
              stonesRequired: discountStatus.stonesRequired,
            },
          });
        }
        return createPurchaseOrder({ owner, sourceReadingId, rashinDiscount: null });
      });
    } else {
      purchaseOrder = await createPurchaseOrder({ owner, sourceReadingId, rashinDiscount: null });
    }
  } catch (error) {
    console.error('Stripe checkout order preparation failed', {
      error: error.message,
      stack: error.stack,
      userId: userRecord?.userId || '',
      sourceReadingId,
    });
    sendJson(res, error.statusCode || 500, {
      error: error.publicCode || 'STRIPE_CHECKOUT_PREPARE_FAILED',
      message: 'The request could not be completed. Please wait and try again.',
    });
    return;
  }
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', urls.successUrl);
  params.set('cancel_url', urls.cancelUrl);
  params.set('locale', 'ja');
  params.set('billing_address_collection', 'auto');
  STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES.forEach((paymentMethodType, index) => {
    params.set(`payment_method_types[${index}]`, paymentMethodType);
  });
  if (purchaseOrder.finalAmount === DEEP_READING_NORMAL_AMOUNT) {
    params.set('line_items[0][price]', STRIPE_PRICE_ID_DEEP_READING_780);
  } else {
    params.set('line_items[0][price_data][currency]', purchaseOrder.currency);
    params.set('line_items[0][price_data][unit_amount]', String(purchaseOrder.finalAmount));
    params.set('line_items[0][price_data][product_data][name]', STRIPE_SUBSCRIPTION_NAME || 'Deep Reading');
  }
  params.set('line_items[0][quantity]', '1');
  params.set('client_reference_id', purchaseOrder.id);
  params.set('metadata[intent]', intent);
  params.set('metadata[purchaseOrderId]', purchaseOrder.id);
  params.set('metadata[sourceReadingId]', purchaseOrder.sourceReadingId);
  params.set('metadata[oracleResultId]', purchaseOrder.oracleResultId);
  params.set('metadata[purchaseType]', 'deep_reading_once');
  params.set('metadata[userId]', purchaseOrder.userId);
  params.set('metadata[originalAmount]', String(purchaseOrder.originalAmount));
  params.set('metadata[discountAmount]', String(purchaseOrder.discountAmount));
  params.set('metadata[finalAmount]', String(purchaseOrder.finalAmount));
  params.set('metadata[stonesToConsume]', String(purchaseOrder.discountStonesUsed));
  params.set('metadata[discountType]', purchaseOrder.discountType || '');
  params.set('metadata[expectedAmount]', String(purchaseOrder.finalAmount));
  params.set('metadata[currency]', 'jpy');
  params.set('payment_intent_data[metadata][purchaseOrderId]', purchaseOrder.id);
  params.set('payment_intent_data[metadata][sourceReadingId]', purchaseOrder.sourceReadingId);
  params.set('payment_intent_data[metadata][oracleResultId]', purchaseOrder.oracleResultId);
  params.set('payment_intent_data[metadata][purchaseType]', 'deep_reading_once');
  params.set('payment_intent_data[metadata][userId]', purchaseOrder.userId);
  params.set('payment_intent_data[metadata][originalAmount]', String(purchaseOrder.originalAmount));
  params.set('payment_intent_data[metadata][discountAmount]', String(purchaseOrder.discountAmount));
  params.set('payment_intent_data[metadata][finalAmount]', String(purchaseOrder.finalAmount));
  params.set('payment_intent_data[metadata][stonesToConsume]', String(purchaseOrder.discountStonesUsed));
  params.set('payment_intent_data[metadata][discountType]', purchaseOrder.discountType || '');
  params.set('payment_intent_data[metadata][expectedAmount]', String(purchaseOrder.finalAmount));
  params.set('payment_intent_data[metadata][currency]', 'jpy');
  if (userRecord?.email) {
    params.set('customer_email', userRecord.email);
  }

  try {
    const session = await stripeApiRequest('POST', '/v1/checkout/sessions', params);
    await writePurchaseOrder({
      ...purchaseOrder,
      status: 'checkout_started',
      stripeCheckoutSessionId: normalizeStripeObjectId(session?.id || ''),
    });
    sendJson(res, 200, {
      ok: true,
      url: session?.url || '',
      id: session?.id || '',
      purchaseOrderId: purchaseOrder.id,
      normalAmount: purchaseOrder.originalAmount,
      discountAmount: purchaseOrder.discountAmount,
      finalAmount: purchaseOrder.finalAmount,
      stonesToConsume: purchaseOrder.discountStonesUsed,
    });
  } catch (error) {
    console.error('Stripe checkout session create failed', {
      error: error.message,
      stack: error.stack,
      purchaseOrderId: purchaseOrder?.id || '',
      userId: purchaseOrder?.userId || '',
      sourceReadingId: purchaseOrder?.sourceReadingId || '',
    });
    if (purchaseOrder?.id) {
      try {
        await writePurchaseOrder({
          ...purchaseOrder,
          status: 'stripe_create_failed',
          updatedAt: new Date().toISOString(),
        });
      } catch (writeError) {
        console.error('Failed to mark purchase order as stripe_create_failed', {
          error: writeError.message,
          purchaseOrderId: purchaseOrder.id,
        });
      }
    }
    sendJson(res, error.statusCode || 502, {
      error: 'STRIPE_CHECKOUT_CREATE_FAILED',
      message: 'The request could not be completed. Please wait and try again.',
    });
  }
}

async function handleStripePortalSessionCreate(req, res) {
  const rate = consumeRateLimit(req, 'stripe_portal');
  if (!rate.ok) {
    sendRateLimitExceeded(res, rate, 'Too many Stripe portal requests. Please wait and retry.');
    return;
  }
  const authSession = readAuthSession(req);
  const userRecord = authSession?.userId ? await readUserRecord(authSession.userId) : null;
  if (!userRecord) {
    sendJson(res, 403, {
      error: 'STRIPE_PORTAL_AUTH_REQUIRED',
      message: 'A signed-in Google account is required to open the billing portal.',
    });
    return;
  }
  if (!stripePortalReady()) {
    sendJson(res, 503, {
      error: 'STRIPE_NOT_CONFIGURED',
      message: 'Stripe billing portal is not configured on the server.',
    });
    return;
  }
  const customerId = String(userRecord?.stripeCustomerId || '').trim();
  if (!customerId) {
    sendJson(res, 404, {
      error: 'STRIPE_CUSTOMER_NOT_FOUND',
      message: 'No Stripe customer was found for this member session.',
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (_error) {
    body = {};
  }
  const returnUrl = body?.returnUrl
    ? makeAbsoluteUrl(req, String(body.returnUrl || '/'))
    : buildStripeCheckoutUrls(req).portalReturnUrl;
  const params = new URLSearchParams();
  params.set('customer', customerId);
  params.set('return_url', returnUrl);

  try {
    const portal = await stripeApiRequest('POST', '/v1/billing_portal/sessions', params);
    sendJson(res, 200, {
      ok: true,
      url: portal?.url || '',
    });
  } catch (error) {
    console.error('Stripe portal session create failed', {
      error: error.message,
      stack: error.stack,
      userId: userRecord?.userId || '',
    });
    sendJson(res, error.statusCode || 502, {
      error: 'STRIPE_PORTAL_CREATE_FAILED',
      message: 'The request could not be completed. Please wait and try again.',
    });
  }
}

async function handleStripeCheckoutComplete(req, res) {
  if (!stripeReady()) {
    sendJson(res, 503, {
      error: 'STRIPE_NOT_CONFIGURED',
      message: 'Stripe checkout is not configured on the server.',
    });
    return;
  }
  const url = new URL(req.url, makeAbsoluteUrl(req, '/'));
  const sessionId = String(url.searchParams.get('session_id') || '').trim();
  if (!sessionId) {
    sendJson(res, 400, {
      error: 'SESSION_ID_REQUIRED',
      message: 'A Stripe Checkout session id is required.',
    });
    return;
  }
  const existingAuth = readAuthSession(req);
  if (await stripeCheckoutSessionAlreadyCompleted(sessionId)) {
    if (existingAuth?.userId) {
      sendJson(res, 200, await buildMemberStatus(req, {
        memberSession: readMemberSession(req),
        authSession: existingAuth,
      }));
      return;
    }
    sendJson(res, 409, {
      error: 'STRIPE_SESSION_ALREADY_COMPLETED',
      message: 'This Stripe checkout session has already been completed.',
    });
    return;
  }

  try {
    const session = await retrieveStripeCheckoutSession(sessionId);
    if (session?.mode === 'payment' && session?.metadata?.purchaseType === 'deep_reading_once') {
      const ticket = await fulfillDeepReadingCheckoutSession(session);
      const status = await buildMemberStatus(req, {
        memberSession: readMemberSession(req),
        authSession: existingAuth,
      });
      if (ticket?.pending) {
        sendJson(res, 202, {
          ...status,
          ok: false,
          pending: true,
          error: 'PAYMENT_CONFIRMATION_PENDING',
          message: 'Payment confirmation is still pending.',
          purchaseType: 'deep_reading_once',
          sourceReadingId: ticket.sourceReadingId || '',
        });
        return;
      }
      if (ticket?.requiresManualReview) {
        sendJson(res, 202, {
          ...status,
          ok: false,
          pending: true,
          error: 'PAYMENT_REVIEW_PENDING',
          message: 'Payment confirmation is being reviewed. Please wait and try again later.',
          purchaseType: 'deep_reading_once',
          sourceReadingId: ticket.sourceReadingId || '',
        });
        return;
      }
      await restoreFreeAiDailyQuota(req, {}, ticket?.id || sessionId);
      sendJson(res, 200, {
        ...status,
        ok: true,
        purchaseType: 'deep_reading_once',
        ticketReady: !!ticket?.id,
        ticketId: ticket?.id || '',
        ticketStatus: ticket?.status || '',
        sourceReadingId: ticket?.sourceReadingId || '',
        normalAmount: readFirstAmount(DEEP_READING_NORMAL_AMOUNT, ticket?.originalAmount, ticket?.baseAmount),
        discountAmount: readAmount(ticket?.discountAmount, 0),
        finalAmount: readAmount(ticket?.finalAmount, DEEP_READING_NORMAL_AMOUNT),
        discountStonesUsed: readAmount(ticket?.discountStonesUsed, 0),
      });
      return;
    }
    const subscriptionRaw = session?.subscription;
    const subscription = typeof subscriptionRaw === 'object' && subscriptionRaw?.status
      ? subscriptionRaw
      : await retrieveStripeSubscription(typeof subscriptionRaw === 'string' ? subscriptionRaw : '');
    const subscriptionStatus = normalizeStripeSubscriptionStatus(subscription?.status || '');
    const memberRecord = await upsertMemberRecordFromStripeSession({
      ...session,
      subscription,
    });
    const userId = normalizeUserId(session?.metadata?.user_id || subscription?.metadata?.user_id || '');
    if (stripeSubscriptionGrantsAccess(subscriptionStatus)) {
      if (existingAuth?.userId && userId && existingAuth.userId !== userId) {
        sendJson(res, 403, {
          error: 'SESSION_USER_MISMATCH',
          message: 'The active login session does not match this Stripe checkout session.',
        });
        return;
      }
      const completionMarked = await markStripeCheckoutSessionCompleted(sessionId, {
        userId,
        stripeCustomerId: memberRecord?.stripeCustomerId || session?.customer || '',
        stripeSubscriptionId: memberRecord?.stripeSubscriptionId || subscription?.id || '',
      });
      if (!completionMarked) {
        if (existingAuth?.userId) {
          sendJson(res, 200, await buildMemberStatus(req, {
            memberSession: readMemberSession(req),
            authSession: existingAuth,
          }));
          return;
        }
        sendJson(res, 409, {
          error: 'STRIPE_SESSION_ALREADY_COMPLETED',
          message: 'This Stripe checkout session has already been completed.',
        });
        return;
      }
      await restoreFreeAiDailyQuota(req, {}, subscription?.id || sessionId);
      if (userId) {
        const authSession = issueAuthSession(res, {
          source: 'google',
          claims: { userId, googleSub: userId },
        });
        sendJson(res, 200, await buildMemberStatus(req, {
          memberSession: readMemberSession(req),
          authSession,
        }));
        return;
      }
      sendJson(res, 200, await buildMemberStatus(req, {
        memberSession: readMemberSession(req),
        authSession: readAuthSession(req),
      }));
      return;
    }
    sendJson(res, 409, {
      error: 'STRIPE_SUBSCRIPTION_NOT_ACTIVE',
      message: 'Stripe checkout completed but the subscription is not active yet.',
      subscriptionStatus,
    });
  } catch (error) {
    console.error('Stripe checkout completion failed', {
      error: error.message,
      stack: error.stack,
      sessionId,
      userId: existingAuth?.userId || '',
    });
    sendJson(res, error.statusCode || 502, {
      error: 'STRIPE_CHECKOUT_COMPLETE_FAILED',
      message: 'The request could not be completed. Please wait and try again.',
    });
  }
}

async function handleStripeWebhook(req, res) {
  if (!stripeWebhookReady()) {
    sendJson(res, 503, {
      error: 'STRIPE_WEBHOOK_NOT_CONFIGURED',
      message: 'Stripe webhook secret is not configured on the server.',
    });
    return;
  }
  let rawBuffer;
  try {
    rawBuffer = await readRawBody(req);
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'INVALID_BODY',
      message: 'Stripe webhook body could not be read.',
    });
    return;
  }
  const rawBody = rawBuffer.toString('utf8');
  const signatureHeader = req.headers['stripe-signature'];
  if (!verifyStripeWebhookSignature(rawBody, signatureHeader)) {
    sendJson(res, 400, {
      error: 'STRIPE_SIGNATURE_INVALID',
      message: 'Stripe webhook signature verification failed.',
    });
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody || '{}');
  } catch (_error) {
    sendJson(res, 400, {
      error: 'INVALID_JSON',
      message: 'Stripe webhook payload is not valid JSON.',
    });
    return;
  }
  if (await stripeEventAlreadyHandled(event?.id)) {
    sendJson(res, 200, { ok: true, duplicate: true });
    return;
  }

  try {
    const eventType = String(event?.type || '').trim();
    const object = event?.data?.object || {};
    if (eventType === 'checkout.session.completed' && object?.mode === 'payment' && object?.metadata?.purchaseType === 'deep_reading_once') {
      await fulfillDeepReadingCheckoutSession(object);
    }
    if (eventType === 'payment_intent.succeeded' && object?.metadata?.purchaseType === 'deep_reading_once') {
      const purchaseOrderId = normalizePurchaseOrderId(object?.metadata?.purchaseOrderId || '');
      const order = purchaseOrderId ? await readPurchaseOrder(purchaseOrderId) : null;
      if (order && !order.stripePaymentIntentId) {
        await writePurchaseOrder({
          ...order,
          stripePaymentIntentId: normalizeStripeObjectId(object?.id || ''),
        });
      }
    }
    if (eventType === 'checkout.session.completed' && object?.mode === 'subscription') {
      await upsertMemberRecordFromStripeSession(object);
    }
    if (eventType === 'customer.subscription.created' || eventType === 'customer.subscription.updated' || eventType === 'customer.subscription.deleted') {
      await updateMemberRecordFromStripeSubscription(object);
    }
    await markStripeEventHandled(event?.id);
    sendJson(res, 200, { ok: true, received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed', {
      error: error.message,
      stack: error.stack,
      eventId: event?.id || '',
      eventType: event?.type || '',
    });
    sendJson(res, 500, {
      error: 'STRIPE_WEBHOOK_PROCESS_FAILED',
      message: 'The request could not be completed. Please wait and try again.',
    });
  }
}

async function handleRequest(req, res) {
  if (!req.url) {
    sendText(res, 400, 'Bad Request');
    return;
  }

  applySecurityHeaders(req, res);
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && isSameOriginPostApiRequest(req) && !guardSameOriginPostApi(req, res)) {
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/share/card')) {
    handleShareCardPage(req, res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/auth/threads/callback')) {
    handleThreadsCallbackPage(req, res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/auth/threads/uninstall')) {
    handleThreadsLifecycleCallback(req, res, 'uninstall');
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/auth/threads/delete')) {
    handleThreadsLifecycleCallback(req, res, 'delete');
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/health')) {
    const setup = await getRuntimeSetupStatus(req);
    const local = isLocalRequest(req);
    const health = {
      ok: true,
      anthropicKeyConfigured: ANTHROPIC_KEY_CONFIGURED,
      openaiKeyConfigured: OPENAI_KEY_CONFIGURED,
      googleClientConfigured: GOOGLE_CLIENT_CONFIGURED,
      mode: 'provider-router',
      vaultEnabled: true,
      production: IS_PRODUCTION,
      paidTestMode: DEV_ACCESS_ENABLED && isLocalRequest(req),
      memberCodeConfigured: DEV_ACCESS_ENABLED && MEMBER_ACCESS_CODES.size > 0,
      rashinCodeConfigured: RASHIN_ACCESS_CODES.size > 0,
      rashinPaidCodeReady: rashinPaidCodeReady(),
      memberSessionPersistent: MEMBER_SESSION_PERSISTENT,
      stripeCheckoutReady: false,
      stripePortalReady: false,
      stripeWebhookReady: false,
      boothPurchaseReady: setup?.boothPurchaseReady ?? boothPurchaseReady(),
      boothProductUrlConfigured: setup?.boothProductUrlConfigured ?? !!getBoothPaymentPayload().url,
      boothGmailVerificationRequired: setup?.boothGmailVerificationRequired ?? BOOTH_GMAIL_VERIFICATION_REQUIRED,
      boothGmailVerificationConfigured: setup?.boothGmailVerificationConfigured ?? boothGmailVerificationConfigured(),
      paidModelAbTest: setup?.paidModelAbTest || {
        name: PAID_MODEL_AB_TEST_NAME,
        enabled: PAID_MODEL_AB_TEST_ENABLED,
        openaiWeight: PAID_MODEL_AB_TEST_OPENAI_WEIGHT,
        anthropicModel: AI_MODELS.paid,
        openaiModel: AI_MODELS.paidAbOpenai,
      },
      setup: local ? setup : {
        ok: !!setup?.productionReady,
        checkedAt: setup?.checkedAt || new Date().toISOString(),
      },
    };
    if (local) health.aiModels = AI_MODELS;
    sendJson(res, 200, health);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/member/status')) {
    await handleMemberStatus(req, res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/rashin-bonus/status')) {
    await handleRashinBonusStatus(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/rashin-bonus/claim')) {
    await handleRashinBonusClaim(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/rashin-bonus/redeem-paid-ticket')) {
    await handleRashinBonusRedeemPaidTicket(req, res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/deep-reading/discount-status')) {
    await handleDeepReadingDiscountStatus(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/rashin-paid-code/purchase-intent')) {
    await handleRashinPaidCodePurchaseIntent(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/rashin-paid-code/redeem')) {
    await handleRashinPaidCodeRedeem(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/rashin-paid-code/booth/claim')) {
    await handleBoothOrderClaim(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/rashin-paid-code/booth/gmail-test')) {
    await handleBoothGmailVerificationTest(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/rashin-paid-code/admin/issue')) {
    await handleRashinPaidCodeAdminIssue(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/auth/google')) {
    await handleGoogleAuth(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/member/session')) {
    await handleMemberSession(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/rashin-code/redeem')) {
    await handleRashinCodeRedeem(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/member/logout')) {
    await handleMemberLogout(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/client-log')) {
    await handleClientLog(req, res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/provider-check')) {
    await handleProviderCheck(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/stripe/checkout-session')) {
    sendJson(res, 410, {
      error: 'STRIPE_CHECKOUT_DISABLED',
      message: 'Stripe checkout has been disabled. Use Rashin code purchase flow instead.',
    });
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/paid-reading/prepare-ticket')) {
    await handlePaidReadingTicketPrepare(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/paid-reading/use-ticket')) {
    await handlePaidReadingTicketUse(req, res);
    return;
  }
  if (req.method === 'POST' && req.url.startsWith('/api/paid-reading/release-ticket')) {
    await handlePaidReadingTicketRelease(req, res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/stripe/checkout/complete')) {
    await handleStripeCheckoutComplete(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/stripe/portal-session')) {
    sendJson(res, 410, {
      error: 'STRIPE_PORTAL_DISABLED',
      message: 'Stripe billing portal has been disabled.',
    });
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/stripe/webhook')) {
    await handleStripeWebhook(req, res);
    return;
  }

  if (req.method === 'POST' && (req.url.startsWith('/api/ai/generate') || req.url.startsWith('/api/anthropic/messages'))) {
    await handleAiProxy(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/vault/history/query')) {
    await handleVaultQuery(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/vault/history/save')) {
    await handleVaultSave(req, res);
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/vault/history/clear')) {
    await handleVaultClear(req, res);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    await serveStatic(req, res);
    return;
  }

  sendText(res, 405, 'Method Not Allowed');
}

function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch(error => {
      console.error('Unexpected server error', {
        error: error.message,
        stack: error.stack,
        method: req.method || '',
        url: req.url || '',
      });
      sendJson(res, 500, {
        error: 'UNEXPECTED_SERVER_ERROR',
        message: 'The request could not be completed. Please wait and try again.',
      });
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.on('error', error => {
    if (error && error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Try a different port, for example: .\\start-uranai.ps1 -Port 3001`);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log(`Star reader app running at http://${HOST}:${PORT}`);
    console.log(`Runtime: NODE_ENV=${NODE_ENV || '(unset)'}, render=${IS_RENDER_RUNTIME ? 'yes' : 'no'}, devAccess=${DEV_ACCESS_ENABLED ? 'enabled' : 'disabled'}`);
    console.log(`Public origin: ${PUBLIC_ORIGIN ? 'configured' : 'missing'}`);
    console.log(`Anthropic proxy: ${ANTHROPIC_KEY_CONFIGURED ? 'configured' : 'missing ANTHROPIC_API_KEY'}`);
    console.log(`OpenAI proxy: ${OPENAI_KEY_CONFIGURED ? 'configured' : 'missing OPENAI_API_KEY'}`);
  });
}

module.exports = {
  createServer,
};
