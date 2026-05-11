const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'social-posts');
const TOKEN_FILE = path.join(OUT_DIR, 'threads-token.json');

function loadLocalEnv() {
  const file = path.join(ROOT, '.env');
  if (!fsSync.existsSync(file)) return;
  const source = fsSync.readFileSync(file, 'utf8');
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnv();

const GRAPH_BASE = process.env.THREADS_GRAPH_BASE || 'https://graph.threads.net/v1.0';
const TOKEN_BASE = process.env.THREADS_TOKEN_BASE || 'https://graph.threads.net';
const AUTH_URL = process.env.THREADS_AUTH_URL || 'https://threads.net/oauth/authorize';
const DEFAULT_SCOPES = ['threads_basic', 'threads_content_publish'];
const LOCAL_MEDIA_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function splitScopes(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function requireValue(name, value) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function readJson(file, fallback = null) {
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

async function loadStoredToken() {
  return readJson(TOKEN_FILE, {});
}

async function saveStoredToken(value) {
  const current = await loadStoredToken();
  const next = {
    ...current,
    ...value,
    updated_at: new Date().toISOString(),
  };
  await writeJson(TOKEN_FILE, next);
  return next;
}

async function getThreadsCredentials() {
  const stored = await loadStoredToken();
  const accessToken = process.env.THREADS_ACCESS_TOKEN || stored.access_token;
  const userId = process.env.THREADS_USER_ID || stored.user_id || 'me';
  return { accessToken, userId, stored };
}

function requireThreadsCredentials(credentials) {
  requireValue('THREADS_ACCESS_TOKEN or data/social-posts/threads-token.json access_token', credentials.accessToken);
  requireValue('THREADS_USER_ID or token-file user_id', credentials.userId);
}

function ensureThreadsText(text) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Threads post text is empty.');
  if ([...value].length > 500) {
    throw new Error(`Threads post text is too long: ${[...value].length}/500 characters`);
  }
  return value;
}

function ensurePublicMediaUrl(imageUrl) {
  const value = String(imageUrl || '').trim();
  if (!value) throw new Error('Threads image_url is empty.');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Threads image_url must be http or https: ${value}`);
  }
  if (LOCAL_MEDIA_HOSTS.has(parsed.hostname)) {
    throw new Error(`Threads cannot fetch local image URLs. Set PUBLIC_ORIGIN to a public HTTPS site: ${value}`);
  }
  return value;
}

function normalizeThreadsAltText(altText) {
  return String(altText || '').trim();
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || JSON.stringify(json);
    throw new Error(`Threads API request failed: ${res.status} ${message}`);
  }
  return json;
}

function buildThreadsAuthUrl(options = {}) {
  const clientId = requireValue('THREADS_APP_ID', options.clientId || process.env.THREADS_APP_ID);
  const redirectUri = requireValue('THREADS_REDIRECT_URI', options.redirectUri || process.env.THREADS_REDIRECT_URI);
  const scopes = splitScopes(options.scopes || process.env.THREADS_SCOPES).length
    ? splitScopes(options.scopes || process.env.THREADS_SCOPES)
    : DEFAULT_SCOPES;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(','),
    response_type: 'code',
  });
  if (options.state || process.env.THREADS_OAUTH_STATE) {
    params.set('state', options.state || process.env.THREADS_OAUTH_STATE);
  }
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForShortLivedToken(code, options = {}) {
  const body = new URLSearchParams({
    client_id: requireValue('THREADS_APP_ID', options.clientId || process.env.THREADS_APP_ID),
    client_secret: requireValue('THREADS_APP_SECRET', options.clientSecret || process.env.THREADS_APP_SECRET),
    grant_type: 'authorization_code',
    redirect_uri: requireValue('THREADS_REDIRECT_URI', options.redirectUri || process.env.THREADS_REDIRECT_URI),
    code: requireValue('authorization code', code),
  });
  return requestJson(`${TOKEN_BASE}/oauth/access_token`, { method: 'POST', body });
}

async function exchangeForLongLivedToken(shortLivedAccessToken, options = {}) {
  const params = new URLSearchParams({
    grant_type: 'th_exchange_token',
    client_secret: requireValue('THREADS_APP_SECRET', options.clientSecret || process.env.THREADS_APP_SECRET),
    access_token: requireValue('short-lived Threads access token', shortLivedAccessToken),
  });
  return requestJson(`${TOKEN_BASE}/access_token?${params.toString()}`);
}

async function refreshLongLivedToken(accessToken) {
  const params = new URLSearchParams({
    grant_type: 'th_refresh_token',
    access_token: requireValue('long-lived Threads access token', accessToken),
  });
  return requestJson(`${TOKEN_BASE}/refresh_access_token?${params.toString()}`);
}

async function getThreadsMe(credentials = null) {
  const creds = credentials || await getThreadsCredentials();
  requireThreadsCredentials(creds);
  const params = new URLSearchParams({
    fields: 'id,username,name,threads_profile_picture_url,threads_biography',
    access_token: creds.accessToken,
  });
  return requestJson(`${GRAPH_BASE}/me?${params.toString()}`);
}

async function assertExpectedThreadsAccount(credentials = null) {
  const expected = normalizeUsername(process.env.THREADS_EXPECTED_USERNAME);
  if (!expected) {
    if (process.env.THREADS_ALLOW_ANY_ACCOUNT === 'true') return null;
    throw new Error('Set THREADS_EXPECTED_USERNAME=sensai_teke before real Threads posting.');
  }
  const me = await getThreadsMe(credentials);
  const actual = normalizeUsername(me.username);
  if (actual !== expected) {
    throw new Error(`Threads token belongs to @${actual || 'unknown'}, expected @${expected}.`);
  }
  return me;
}

async function createThreadsContainer({ mediaType, text, imageUrl, altText = '', credentials = null }) {
  const creds = credentials || await getThreadsCredentials();
  requireThreadsCredentials(creds);
  const media = String(mediaType || '').toUpperCase();
  const body = new URLSearchParams({
    media_type: media,
    text: ensureThreadsText(text),
    access_token: creds.accessToken,
  });
  if (media === 'IMAGE') {
    body.set('image_url', ensurePublicMediaUrl(imageUrl));
    const normalizedAltText = normalizeThreadsAltText(altText);
    if (normalizedAltText) body.set('alt_text', normalizedAltText);
  }
  if (!['TEXT', 'IMAGE'].includes(media)) throw new Error(`Unsupported Threads media_type: ${media}`);
  return requestJson(`${GRAPH_BASE}/${encodeURIComponent(creds.userId)}/threads`, { method: 'POST', body });
}

async function publishThreadsContainer(creationId, credentials = null) {
  const creds = credentials || await getThreadsCredentials();
  requireThreadsCredentials(creds);
  const body = new URLSearchParams({
    creation_id: requireValue('Threads creation_id', creationId),
    access_token: creds.accessToken,
  });
  return requestJson(`${GRAPH_BASE}/${encodeURIComponent(creds.userId)}/threads_publish`, { method: 'POST', body });
}

async function postTextToThreads({ text, credentials = null }) {
  const creds = credentials || await getThreadsCredentials();
  await assertExpectedThreadsAccount(creds);
  const created = await createThreadsContainer({ mediaType: 'TEXT', text, credentials: creds });
  return publishThreadsContainer(created.id, creds);
}

async function postImageToThreads({ text, imageUrl, altText = '', waitMs = null, credentials = null }) {
  const creds = credentials || await getThreadsCredentials();
  await assertExpectedThreadsAccount(creds);
  const created = await createThreadsContainer({ mediaType: 'IMAGE', text, imageUrl, altText, credentials: creds });
  const delayMs = waitMs === null ? Number(process.env.THREADS_PUBLISH_WAIT_MS || 30000) : Number(waitMs);
  if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
  return publishThreadsContainer(created.id, creds);
}

function sanitizeTokenResult(value) {
  if (!value || typeof value !== 'object') return value;
  return {
    ...value,
    access_token: value.access_token ? '<stored in data/social-posts/threads-token.json>' : value.access_token,
  };
}

module.exports = {
  TOKEN_FILE,
  buildThreadsAuthUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  getThreadsCredentials,
  getThreadsMe,
  saveStoredToken,
  postTextToThreads,
  postImageToThreads,
  sanitizeTokenResult,
  ensureThreadsText,
  ensurePublicMediaUrl,
  normalizeThreadsAltText,
  normalizeUsername,
};
