const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SERVICE = 'https://bsky.social';
const DEFAULT_PUBLIC_APPVIEW = 'https://public.api.bsky.app';
const DEFAULT_EXPECTED_HANDLE = 'tekesensai.bsky.social';
const IMAGE_LIMIT_BYTES = 1_000_000;
const BLUESKY_CHARACTER_LIMIT = 300;

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

function requireValue(name, value) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalizeHandle(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function getBlueskyService() {
  return String(process.env.BLUESKY_SERVICE || DEFAULT_SERVICE).replace(/\/$/, '');
}

function getBlueskyPublicAppView() {
  return String(process.env.BLUESKY_PUBLIC_APPVIEW || DEFAULT_PUBLIC_APPVIEW).replace(/\/$/, '');
}

function getBlueskyCredentials() {
  const identifier = String(process.env.BLUESKY_IDENTIFIER || process.env.BLUESKY_HANDLE || '').trim();
  const password = String(process.env.BLUESKY_APP_PASSWORD || process.env.BLUESKY_PASSWORD || '').trim();
  return {
    service: getBlueskyService(),
    publicAppView: getBlueskyPublicAppView(),
    identifier,
    password,
    expectedHandle: normalizeHandle(process.env.BLUESKY_EXPECTED_HANDLE || process.env.BLUESKY_HANDLE || identifier || DEFAULT_EXPECTED_HANDLE),
  };
}

function ensureBlueskyText(text) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Bluesky post text is empty.');
  const length = [...value].length;
  if (length > BLUESKY_CHARACTER_LIMIT) {
    throw new Error(`Bluesky post text is too long: ${length}/${BLUESKY_CHARACTER_LIMIT} characters`);
  }
  return value;
}

function normalizeAltText(altText) {
  return String(altText || '').trim();
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  throw new Error(`Unsupported Bluesky image type: ${filePath}`);
}

function readPngDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readImageDimensions(buffer, mimeType) {
  if (mimeType === 'image/png') return readPngDimensions(buffer);
  if (mimeType === 'image/jpeg') return readJpegDimensions(buffer);
  return null;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.message || json?.error || JSON.stringify(json);
    throw new Error(`Bluesky API request failed: ${res.status} ${message}`);
  }
  return json;
}

async function createSession(credentials = null) {
  const creds = credentials || getBlueskyCredentials();
  requireValue('BLUESKY_IDENTIFIER or BLUESKY_HANDLE', creds.identifier);
  requireValue('BLUESKY_APP_PASSWORD', creds.password);
  return requestJson(`${creds.service}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: creds.identifier,
      password: creds.password,
    }),
  });
}

async function assertExpectedBlueskyAccount(session, credentials = null) {
  const creds = credentials || getBlueskyCredentials();
  const expected = normalizeHandle(creds.expectedHandle);
  if (!expected) {
    if (process.env.BLUESKY_ALLOW_ANY_ACCOUNT === 'true') return session;
    throw new Error('Set BLUESKY_EXPECTED_HANDLE=tekesensai.bsky.social before real Bluesky posting.');
  }
  const actual = normalizeHandle(session.handle);
  if (actual !== expected) {
    throw new Error(`Bluesky session belongs to @${actual || 'unknown'}, expected @${expected}.`);
  }
  return session;
}

async function uploadBlob({ imagePath, session, credentials = null }) {
  const creds = credentials || getBlueskyCredentials();
  const absolutePath = path.isAbsolute(imagePath) ? imagePath : path.resolve(ROOT, imagePath);
  const image = await fs.readFile(absolutePath);
  if (image.length > IMAGE_LIMIT_BYTES) {
    throw new Error(`Bluesky image is too large: ${image.length}/${IMAGE_LIMIT_BYTES} bytes (${absolutePath})`);
  }
  const mimeType = contentTypeForFile(absolutePath);
  const dimensions = readImageDimensions(image, mimeType);
  const json = await requestJson(`${creds.service}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      'Content-Type': mimeType,
    },
    body: image,
  });
  return { blob: json.blob, dimensions, size: image.length, mimeType, imagePath: absolutePath };
}

function buildUrlFacets(text) {
  const value = String(text || '');
  const facets = [];
  const urlPattern = /https?:\/\/[^\s]+/g;
  for (const match of value.matchAll(urlPattern)) {
    const uri = match[0].replace(/[),.、。]+$/u, '');
    if (!uri) continue;
    const start = match.index;
    const end = start + uri.length;
    facets.push({
      index: {
        byteStart: Buffer.byteLength(value.slice(0, start), 'utf8'),
        byteEnd: Buffer.byteLength(value.slice(0, end), 'utf8'),
      },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
    });
  }
  return facets;
}

function blueskyPostUrl(session, uri) {
  const rkey = String(uri || '').split('/').pop();
  const handle = normalizeHandle(session?.handle);
  return handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : null;
}

async function createImagePost({ text, imagePath, altText = '', session, credentials = null }) {
  const creds = credentials || getBlueskyCredentials();
  const value = ensureBlueskyText(text);
  const uploaded = await uploadBlob({ imagePath, session, credentials: creds });
  const image = {
    alt: normalizeAltText(altText),
    image: uploaded.blob,
  };
  if (uploaded.dimensions?.width && uploaded.dimensions?.height) {
    image.aspectRatio = {
      width: uploaded.dimensions.width,
      height: uploaded.dimensions.height,
    };
  }
  const record = {
    $type: 'app.bsky.feed.post',
    text: value,
    createdAt: new Date().toISOString(),
    langs: ['ja'],
    embed: {
      $type: 'app.bsky.embed.images',
      images: [image],
    },
  };
  const facets = buildUrlFacets(value);
  if (facets.length) record.facets = facets;
  const result = await requestJson(`${creds.service}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });
  return {
    ...result,
    handle: session.handle,
    did: session.did,
    permalink: blueskyPostUrl(session, result.uri),
    image: {
      path: uploaded.imagePath,
      size: uploaded.size,
      mimeType: uploaded.mimeType,
      aspectRatio: uploaded.dimensions || null,
    },
  };
}

async function postImageToBluesky({ text, imagePath, altText = '', credentials = null }) {
  const creds = credentials || getBlueskyCredentials();
  const session = await createSession(creds);
  await assertExpectedBlueskyAccount(session, creds);
  return createImagePost({ text, imagePath, altText, session, credentials: creds });
}

async function listBlueskyAuthorFeed({ actor = '', limit = 25 } = {}) {
  const creds = getBlueskyCredentials();
  const target = actor || creds.expectedHandle || creds.identifier;
  requireValue('Bluesky actor', target);
  const params = new URLSearchParams({
    actor: target,
    limit: String(limit),
  });
  return requestJson(`${creds.publicAppView}/xrpc/app.bsky.feed.getAuthorFeed?${params.toString()}`);
}

function sanitizeSession(value) {
  if (!value || typeof value !== 'object') return value;
  return {
    did: value.did,
    handle: value.handle,
    email: value.email ? '<hidden>' : value.email,
    accessJwt: value.accessJwt ? '<hidden>' : value.accessJwt,
    refreshJwt: value.refreshJwt ? '<hidden>' : value.refreshJwt,
  };
}

module.exports = {
  IMAGE_LIMIT_BYTES,
  BLUESKY_CHARACTER_LIMIT,
  DEFAULT_EXPECTED_HANDLE,
  getBlueskyCredentials,
  getBlueskyService,
  getBlueskyPublicAppView,
  normalizeHandle,
  ensureBlueskyText,
  normalizeAltText,
  createSession,
  assertExpectedBlueskyAccount,
  uploadBlob,
  createImagePost,
  postImageToBluesky,
  listBlueskyAuthorFeed,
  buildUrlFacets,
  blueskyPostUrl,
  sanitizeSession,
};
